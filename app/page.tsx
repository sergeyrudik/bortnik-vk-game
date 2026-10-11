"use client";
import { createSaveSnapshotGuard } from "./save-snapshot-guard";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import { createVkBridge, readStoredValue, writeStoredValue } from "./vk-runtime";
import { createAdPolicy } from "./ad-policy";
import Link from "next/link";
import {
  NECTAR_DATA,
  MAX_UPGRADE_LEVELS,
  UPGRADE_DATA,
  applySwapToLevel,
  createDefaultSave,
  createLevelState,
  findAvailableSwap,
  getLevelConfig,
  getLocalDateKey,
  getUpgradeCost,
  grantMoveBonus,
  levelClearReward,
  migrateSave,
  refreshDaily,
  refreshRewards,
  resetCellId,
  selectNewestSave,
  serializeSave,
  type Cell,
  type DailyProgress,
  type GameSave,
  type GameStats,
  type LevelState,
  type RewardLimits,
  type Upgrades,
} from "./game-engine";

type VKUser = { id?: number; first_name: string; photo_100?: string };
type VKEvent = { detail?: { type?: string } };
type VKBridge = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  subscribe?: (handler: (event: VKEvent) => void) => void;
  unsubscribe?: (handler: (event: VKEvent) => void) => void;
};
type GameTab = "hive" | "apiary" | "quests" | "stats";
type UpgradeKey = keyof Upgrades;

const SAVE_KEY = "bortnik-save-v1";
const VK_SAVE_KEY = "bortnik_save";
const REWARD_COINS = 60;
const REWARD_MOVES = 5;
const HINT_COST = 25;
const REWARD_DAILY_LIMIT = 8;
const VK_APP_URL =
  process.env.NEXT_PUBLIC_VK_APP_URL?.trim() || "https://vk.ru/app54694415";

const DAILY_QUESTS: Array<{
  id: string;
  field: "match" | "level" | "wasp";
  target: number;
  title: string;
  description: string;
  reward: { coins?: number; crystals?: number };
}> = [
  {
    id: "match",
    field: "match",
    target: 10,
    title: "Сбор нектара",
    description: "Сделай 10 успешных матчей",
    reward: { coins: 80 },
  },
  {
    id: "level",
    field: "level",
    target: 2,
    title: "Лужайки дня",
    description: "Пройди 2 лужайки",
    reward: { crystals: 2 },
  },
  {
    id: "wasp",
    field: "wasp",
    target: 3,
    title: "Осиный отбой",
    description: "Сгони 3 ос с сот",
    reward: { coins: 100 },
  },
];

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("VK Bridge timeout")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function cellIcon(cell: Cell): string {
  if (cell.special === "bee") return "🐝";
  if (cell.special === "queen") return "👑";
  if (cell.special === "pot") return "🍯";
  return NECTAR_DATA[cell.kind].icon;
}

function honeyGoalTarget(state: LevelState): number {
  const goal = state.goals.find((item) => item.type === "honey");
  return goal && goal.type === "honey" ? goal.target : 1;
}

function formatHoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function specialLabel(cell: Cell): string {
  if (cell.special === "bee") return ", пчела";
  if (cell.special === "queen") return ", матка";
  if (cell.special === "pot") return ", горшок мёда";
  return "";
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<GameTab>("hive");
  const [vkReady, setVkReady] = useState(false);
  const [vkUser, setVkUser] = useState<VKUser | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [hinted, setHinted] = useState<Set<string>>(new Set());
  const [waspShake, setWaspShake] = useState(false);
  const [adAvailable, setAdAvailable] = useState(false);
  const [adPending, setAdPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [coins, setCoins] = useState(120);
  const [crystals, setCrystals] = useState(2);
  const [level, setLevel] = useState(1);
  const [sound, setSound] = useState(true);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrades>({ combs: 0, nectar: 0, smoke: 0 });
  const [stats, setStats] = useState<GameStats>({
    levelsWon: 0,
    matchesMade: 0,
    beesSpawned: 0,
    waspsCleared: 0,
    bestLevel: 1,
    adsWatched: 0,
    honeyCollected: 0,
  });
  const [daily, setDaily] = useState<DailyProgress>({
    date: getLocalDateKey(),
    match: 0,
    level: 0,
    wasp: 0,
    claimed: [],
  });
  const [rewards, setRewards] = useState<RewardLimits>({
    date: getLocalDateKey(),
    count: 0,
    lastRewardAt: 0,
  });
  const [levelState, setLevelState] = useState<LevelState>(() => createLevelState(1));
  const [pendingReward, setPendingReward] = useState<{ coins: number; crystals: number } | null>(null);
  const [lastInterstitialAt, setLastInterstitialAt] = useState(0);
  const [interstitialBusy, setInterstitialBusy] = useState(false);

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const busyRef = useRef(false);
  const adPendingRef = useRef(false);
  const boundaryPendingRef = useRef(false);
  const upgradePendingRef = useRef(false);
  const hintPendingRef = useRef(false);
  const questClaimedRef = useRef(new Set<string>());
  const progressEpochRef = useRef(0);
  const winClaimedRef = useRef(false);
  const latestSaveRef = useRef<GameSave | null>(null);
  const cloudSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const hintTimeoutRef = useRef<number | null>(null);
  const adPolicyRef = useRef<ReturnType<typeof createAdPolicy> | null>(null);
  if (adPolicyRef.current === null) {
    adPolicyRef.current = createAdPolicy({
      storageKey: "bortnik:ad-policy:v1",
      onInterstitialBusyChange: setInterstitialBusy,
    });
  }

  useEffect(() => {
    if (hydrated && started) adPolicyRef.current?.startGameplay();
  }, [hydrated, started]);

  const levelConfig = useMemo(() => getLevelConfig(level, upgrades), [level, upgrades]);
  const honeyTarget = honeyGoalTarget(levelState);
  const honeyPercent = Math.min(100, Math.round((levelState.honey / honeyTarget) * 100));
  const modalOpen = Boolean(
    message ||
      confirmReset ||
      (levelState.status === "won" && pendingReward) ||
      levelState.status === "lost",
  );

  const tutorialText = useMemo(() => {
    if (tutorialDone) return null;
    if (tutorialStep === 0) return "Поменяй местами соседние соты, чтобы собрать три одинаковых нектара.";
    if (tutorialStep === 1) return "Матч из четырёх даёт пчелу 🐝 — она очищает ряд и столбец.";
    return "Наполни банку мёда до цели, пока не кончились ходы.";
  }, [tutorialDone, tutorialStep]);

  useEffect(
    () => () => {
      if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current);
    },
    [],
  );

  const playSound = useCallback(
    (kind: "tap" | "match" | "win" | "error") => {
      if (!sound || typeof window === "undefined") return;
      try {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const frequencies = { tap: 440, match: 720, win: 880, error: 160 };
        oscillator.frequency.value = frequencies[kind];
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (kind === "win" ? 0.32 : 0.12));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + (kind === "win" ? 0.35 : 0.14));
      } catch {
        // optional
      }
    },
    [sound],
  );

  const trackEvent = useCallback((eventName: string, params: Record<string, string | number | boolean> = {}) => {
    if (!bridgeRef.current) return;
    const eventParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      eventParams[key] = String(value);
    });
    void bridgeRef.current
      .send("VKWebAppTrackEvent", { event_name: eventName, event_params: eventParams })
      .catch(() => undefined);
  }, []);

  const saveGuardRef = useRef<ReturnType<typeof createSaveSnapshotGuard<GameSave>> | null>(null);
  if (saveGuardRef.current === null) {
    saveGuardRef.current = createSaveSnapshotGuard<GameSave>({
      storageKey: SAVE_KEY, read: () => readStoredValue(SAVE_KEY),
      write: (value) => writeStoredValue(SAVE_KEY, value), parse: migrateSave, serialize: serializeSave,
    });
  }
  const [saveRenderRevision, setSaveRenderRevision] = useState(0);

  const applySave = useCallback((save: GameSave) => {
    adPolicyRef.current?.seedLastAdAt(save.rewards.lastRewardAt);
    adPolicyRef.current?.seedLastAdAt(save.lastInterstitialAt);
    setCoins(save.coins);
    setCrystals(save.crystals);
    setLevel(save.level);
    setSound(save.sound);
    setTutorialDone(save.tutorialDone);
    setTutorialStep(save.tutorialDone ? 2 : save.tutorialStep);
    setUpgrades(save.upgrades);
    setStats(save.stats);
    setDaily(refreshDaily(save.daily));
    setRewards(refreshRewards(save.rewards));
    if (save.levelState) {
      const maxCellId = Math.max(
        0,
        ...save.levelState.board.flat().map((cell) => cell?.id ?? 0),
      );
      resetCellId(maxCellId + 1);
      setLevelState(save.levelState);
      winClaimedRef.current = save.levelState.status === "won";
    } else {
      setLevelState(createLevelState(save.level, save.upgrades));
      winClaimedRef.current = false;
    }
    setPendingReward(save.pendingReward);
    setLastInterstitialAt(save.lastInterstitialAt);
  }, []);

  const adoptExternalSave = useCallback((external: GameSave) => {
    setSaveRenderRevision(saveGuardRef.current!.revision());
    progressEpochRef.current += 1;
    latestSaveRef.current = external;
    busyRef.current = false;
    setBusy(false);
    setSelected(null);
    setFlash(new Set());
    applySave(external);
  }, [applySave]);

  useEffect(() => {
    if (!hydrated) return;
    const syncFromStorage = () => {
      const external = saveGuardRef.current!.refresh();
      if (external) adoptExternalSave(external);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVE_KEY || event.key === null) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    syncFromStorage();
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated, adoptExternalSave]);

  const checkRewardAvailability = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const response = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "reward",
      })) as { result?: boolean };
      setAdAvailable(response.result === true);
      trackEvent("reward_check", { available: response.result === true });
    } catch {
      setAdAvailable(false);
    }
  }, [trackEvent]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let localSave: GameSave | null = null;
      try {
        localSave = migrateSave(readStoredValue(SAVE_KEY));
      } catch {
        // Storage may be blocked by browser privacy settings; continue with a fresh game.
      }
      let cloudSave: GameSave | null = null;

      try {
        await promiseWithTimeout(bridge.send("VKWebAppInit"), 1800);
        if (cancelled) return;
        bridgeRef.current = createVkBridge(bridge as unknown as VKBridge);
        setVkReady(true);

        try {
          void bridgeRef.current.send("VKWebAppSetViewSettings", {
            status_bar_style: "light",
            action_bar_color: "#2f5d3a",
            navigation_bar_color: "#2f5d3a",
          }).catch(() => undefined);
        } catch {
          // optional
        }

        try {
          void bridgeRef.current.send("VKWebAppGetUserInfo").then((user) => {
            if (!cancelled) setVkUser(user as VKUser);
          }).catch(() => undefined);
        } catch {
          // optional
        }

        try {
          const storage = (await promiseWithTimeout(
            bridgeRef.current.send("VKWebAppStorageGet", {
              keys: [VK_SAVE_KEY],
            }),
            1800,
          )) as { keys?: Array<{ value: string }> };
          cloudSave = migrateSave(storage.keys?.[0]?.value);
        } catch {
          trackEvent("save_load_error", { source: "vk" });
        }
      } catch {
        bridgeRef.current = null;
        setVkReady(false);
      }

      if (cancelled) return;
      localSave = migrateSave(readStoredValue(SAVE_KEY));
      saveGuardRef.current!.initialize(readStoredValue(SAVE_KEY));
      setSaveRenderRevision(saveGuardRef.current!.revision());
      const chosen = selectNewestSave(localSave, cloudSave);
      applySave(chosen ?? createDefaultSave());
      setHydrated(true);
      trackEvent("app_open", {
        source: chosen === cloudSave && cloudSave ? "vk" : chosen ? "local" : "new",
      });
      void checkRewardAvailability();
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applySave, checkRewardAvailability, trackEvent]);

  const persistSave = useCallback(async (save: GameSave, revision = saveGuardRef.current!.revision()) => {
    const result = await saveGuardRef.current!.persist(save, revision);
    if (result.external) adoptExternalSave(result.external);
    if (!result.value) return;
    const value = result.value;
    const activeBridge = bridgeRef.current;
    if (activeBridge) {
      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(() => result.localWritten === false || saveGuardRef.current!.isCurrentValue(value)
          ? activeBridge.send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value }) : undefined)
        .catch(() => trackEvent("save_write_error", { source: "vk" }));
    }
  }, [adoptExternalSave, trackEvent]);

  useEffect(() => {
    if (!hydrated) return;
    const save: GameSave = {
      version: 2,
      updatedAt: Date.now(),
      coins,
      crystals,
      level,
      sound,
      tutorialDone,
      tutorialStep,
      upgrades,
      stats,
      daily,
      rewards,
      levelState,
      pendingReward,
      lastInterstitialAt,
    };
    latestSaveRef.current = save;
    const timeout = window.setTimeout(() => void persistSave(save, saveRenderRevision), 250);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    coins,
    crystals,
    level,
    sound,
    tutorialDone,
    tutorialStep,
    upgrades,
    stats,
    daily,
    rewards,
    levelState,
    pendingReward,
    lastInterstitialAt,
    persistSave,
    saveRenderRevision,
  ]);

  useEffect(() => {
    const flushLatestSave = () => {
      if (latestSaveRef.current) persistSave(latestSaveRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) flushLatestSave();
    };
    window.addEventListener("pagehide", flushLatestSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushLatestSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [persistSave]);

  useEffect(() => {
    const handler = (event: VKEvent) => {
      if (event.detail?.type === "VKWebAppViewHide") {
        setPaused(true);
        if (latestSaveRef.current) persistSave(latestSaveRef.current);
      }
      if (event.detail?.type === "VKWebAppViewRestore") {
        setPaused(false);
        void checkRewardAvailability();
      }
    };
    const handleVisibilityChange = () => {
      setPaused(document.hidden);
      if (!document.hidden) void checkRewardAvailability();
    };
    bridge.subscribe?.(handler);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      bridge.unsubscribe?.(handler);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkRewardAvailability, persistSave]);

  const maybeShowInterstitial = useCallback(async () => {
    const client = bridgeRef.current;
    const shown = await adPolicyRef.current!.maybeInterstitial(
      (method, params) => client!.send(method, params),
      Boolean(client && vkReady),
    );
    if (shown) {
      setLastInterstitialAt(Date.now());
      trackEvent("interstitial_shown");
    }
  }, [trackEvent, vkReady]);

  const bumpDaily = useCallback((field: "match" | "level" | "wasp", amount = 1) => {
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, [field]: fresh[field] + amount };
    });
  }, []);

  const finishWin = useCallback(
    (wonLevel: number) => {
      if (winClaimedRef.current) return;
      winClaimedRef.current = true;
      const reward = levelClearReward(wonLevel);
      setPendingReward(reward);
      setCoins((value) => value + reward.coins);
      setCrystals((value) => value + reward.crystals);
      setStats((prev) => ({
        ...prev,
        levelsWon: prev.levelsWon + 1,
        bestLevel: Math.max(prev.bestLevel, wonLevel + 1),
      }));
      bumpDaily("level");
      setTutorialDone(true);
      setTutorialStep(2);
      playSound("win");
      trackEvent("level_win", { level: wonLevel });
    },
    [bumpDaily, playSound, trackEvent],
  );

  const handleSwap = useCallback(
    async (from: { row: number; col: number }, to: { row: number; col: number }) => {
      if (busyRef.current || paused || adPolicyRef.current!.isBusy() || boundaryPendingRef.current || levelState.status !== "playing") return;
      const requestEpoch = progressEpochRef.current;
      busyRef.current = true;
      setBusy(true);
      const { state, result } = applySwapToLevel(levelState, from, to);
      if (!result.ok) {
        playSound("error");
        busyRef.current = false;
        setBusy(false);
        setSelected(null);
        return;
      }

      const cleared = new Set<string>();
      result.steps.forEach((step) => {
        step.cleared.forEach(({ row, col }) => cleared.add(`${row},${col}`));
      });
      setFlash(cleared);
      playSound("match");
      void bridgeRef.current
        ?.send("VKWebAppTapticNotificationOccurred", { type: "success" })
        .catch(() => undefined);

      setStats((prev) => ({
        ...prev,
        matchesMade: prev.matchesMade + result.matchesMade,
        beesSpawned: prev.beesSpawned + result.beesSpawned,
        waspsCleared: prev.waspsCleared + result.waspsCleared,
        honeyCollected: prev.honeyCollected + result.honeyGained,
      }));
      bumpDaily("match", result.matchesMade);
      if (result.waspsCleared > 0) bumpDaily("wasp", result.waspsCleared);

      if (!tutorialDone) {
        setTutorialStep((step) => Math.min(2, step + 1));
      }

      await new Promise((resolve) => window.setTimeout(resolve, 180));
      // Reset/hydration may replace progress while the match animation settles.
      if (requestEpoch !== progressEpochRef.current) return;
      setLevelState(state);
      setFlash(new Set());
      setSelected(null);

      if (state.board.some((row) => row.some((cell) => cell?.wasp))) {
        setWaspShake(true);
        window.setTimeout(() => setWaspShake(false), 320);
      }

      if (state.status === "won") {
        finishWin(state.level);
      } else if (state.status === "lost") {
        trackEvent("level_lose", { level: state.level });
        playSound("error");
      }

      busyRef.current = false;
      setBusy(false);
    },
    [bumpDaily, finishWin, levelState, paused, playSound, trackEvent, tutorialDone],
  );

  const onCellClick = (row: number, col: number) => {
    if (busy || paused || adPolicyRef.current!.isBusy() || boundaryPendingRef.current || levelState.status !== "playing") return;
    setHinted(new Set());
    playSound("tap");
    if (!selected) {
      setSelected({ row, col });
      return;
    }
    if (selected.row === row && selected.col === col) {
      setSelected(null);
      return;
    }
    const adjacent =
      Math.abs(selected.row - row) + Math.abs(selected.col - col) === 1;
    if (!adjacent) {
      setSelected({ row, col });
      return;
    }
    void handleSwap(selected, { row, col });
  };

  const showHint = () => {
    if (hintPendingRef.current || busyRef.current || paused || adPolicyRef.current!.isBusy() || levelState.status !== "playing") return;
    hintPendingRef.current = true;
    if (coins < HINT_COST) {
      setMessage("Не хватает монет на подсказку");
      hintPendingRef.current = false;
      return;
    }
    const move = findAvailableSwap(levelState.board);
    if (!move) {
      setMessage("Поле перемешивается — попробуйте ещё раз");
      hintPendingRef.current = false;
      return;
    }
    setCoins((value) => value - HINT_COST);
    setSelected(move.from);
    setHinted(
      new Set([
        `${move.from.row},${move.from.col}`,
        `${move.to.row},${move.to.col}`,
      ]),
    );
    if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => {
      setHinted(new Set());
      hintPendingRef.current = false;
    }, 1800);
    trackEvent("hint_used", { level: levelState.level });
  };

  const startNextLevel = async () => {
    if (boundaryPendingRef.current || adPolicyRef.current!.isBusy()) return;
    boundaryPendingRef.current = true;
    const requestEpoch = progressEpochRef.current;
    try {
      await maybeShowInterstitial();
      if (requestEpoch !== progressEpochRef.current) return;
      progressEpochRef.current += 1;
      const nextLevel = levelState.status === "won" ? levelState.level + 1 : level;
      if (levelState.status === "won") setLevel(nextLevel);
      setPendingReward(null);
      winClaimedRef.current = false;
      setLevelState(createLevelState(nextLevel, upgrades));
      setSelected(null);
      setTab("hive");
    } finally {
      boundaryPendingRef.current = false;
    }
  };

  const retryLevel = async () => {
    if (boundaryPendingRef.current || adPolicyRef.current!.isBusy()) return;
    boundaryPendingRef.current = true;
    const requestEpoch = progressEpochRef.current;
    try {
      await maybeShowInterstitial();
      if (requestEpoch !== progressEpochRef.current) return;
      progressEpochRef.current += 1;
      setPendingReward(null);
      winClaimedRef.current = false;
      setLevelState(createLevelState(level, upgrades));
      setSelected(null);
    } finally {
      boundaryPendingRef.current = false;
    }
  };

  const buyUpgrade = (key: UpgradeKey) => {
    if (upgradePendingRef.current || upgrades[key] >= MAX_UPGRADE_LEVELS[key]) return;
    const cost = getUpgradeCost(upgrades[key]);
    if (crystals < cost) {
      setMessage("Не хватает кристаллов");
      return;
    }
    upgradePendingRef.current = true;
    setCrystals((value) => value - cost);
    setUpgrades((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    setMessage("Улучшение применится на следующей лужайке или после повтора");
    trackEvent("upgrade_buy", { key, level: upgrades[key] + 1 });
    window.setTimeout(() => {
      upgradePendingRef.current = false;
    }, 300);
  };

  const claimQuest = (id: string) => {
    const quest = DAILY_QUESTS.find((item) => item.id === id);
    if (!quest) return;
    const fresh = refreshDaily(daily);
    const claimKey = `${fresh.date}:${id}`;
    if (
      questClaimedRef.current.has(claimKey) ||
      fresh.claimed.includes(id) ||
      fresh[quest.field] < quest.target
    ) {
      return;
    }
    questClaimedRef.current.add(claimKey);
    setDaily({ ...fresh, claimed: [...fresh.claimed, id] });
    if (quest.reward.coins) setCoins((value) => value + quest.reward.coins!);
    if (quest.reward.crystals) setCrystals((value) => value + quest.reward.crystals!);
    trackEvent("quest_claim", { id });
  };

  const watchRewardAd = async (kind: "coins" | "moves") => {
    if (busyRef.current || boundaryPendingRef.current || adPendingRef.current || adPolicyRef.current!.isBusy()) return;
    if (kind === "moves" && levelState.status === "won") return;
    const fresh = refreshRewards(rewards);
    if (fresh.count >= REWARD_DAILY_LIMIT) {
      setMessage("Дневной лимит наград исчерпан");
      return;
    }
    if (adPolicyRef.current!.rewardWaitMs() > 0) {
      setMessage("Подождите немного перед следующей наградой");
      return;
    }

    if (!bridgeRef.current || !vkReady) {
      setMessage("Награды за рекламу доступны только внутри ВКонтакте");
      return;
    }
    if (!adAvailable) {
      setMessage("Реклама сейчас недоступна");
      return;
    }

    if (!(await adPolicyRef.current!.beginReward())) { setMessage("Реклама пока недоступна"); return; }
    adPendingRef.current = true;
    setAdPending(true);
    const requestEpoch = progressEpochRef.current;
    try {
      const response = (await bridgeRef.current.send("VKWebAppShowNativeAds", {
        ad_format: "reward",
      })) as { result?: boolean };
      if (response.result === true) adPolicyRef.current!.finishReward(true);
      const externalAtCompletion = saveGuardRef.current!.refresh();
      const completedAgainst = externalAtCompletion ?? saveGuardRef.current!.latest();
      if ((externalAtCompletion || requestEpoch !== progressEpochRef.current) && completedAgainst) adoptExternalSave(completedAgainst);
      if (response.result !== true) {
        setMessage("Награда начисляется только после полного просмотра рекламы");
        return;
      }

      const rewardedAt = Date.now();
      const rewardedDate = getLocalDateKey(new Date(rewardedAt));
      const currentLimits = refreshRewards(completedAgainst?.rewards ?? fresh, rewardedDate);
      setRewards({
        date: currentLimits.date,
        count: currentLimits.count + 1,
        lastRewardAt: rewardedAt,
      });
      setStats((prev) => ({ ...prev, adsWatched: prev.adsWatched + 1 }));
      if (kind === "coins" || completedAgainst?.levelState?.status === "won") {
        setCoins((value) => value + REWARD_COINS);
        setMessage(`+${REWARD_COINS} монет`);
      } else {
        setLevelState((prev) => grantMoveBonus(prev, REWARD_MOVES));
        setMessage(`+${REWARD_MOVES} ходов`);
      }
      trackEvent("reward_claimed", { kind });
    } catch {
      setMessage("Не удалось показать рекламу");
    } finally {
      adPolicyRef.current!.finishReward(false);
      adPendingRef.current = false;
      setAdPending(false);
      void checkRewardAvailability();
    }
  };

  const resetProgress = () => {
    if (adPendingRef.current || boundaryPendingRef.current || adPolicyRef.current?.isBusy()) return;
    saveGuardRef.current!.initialize(readStoredValue(SAVE_KEY), true);
      setSaveRenderRevision(saveGuardRef.current!.revision());
    progressEpochRef.current += 1;
    questClaimedRef.current.clear();
    adPendingRef.current = false;
    upgradePendingRef.current = false;
    hintPendingRef.current = false;
    const fresh = { ...createDefaultSave(), rewards: refreshRewards(saveGuardRef.current!.latest()?.rewards ?? rewards) };
    latestSaveRef.current = fresh;
    persistSave(fresh);
    applySave(fresh);
    setStarted(true);
    setTab("hive");
    setSelected(null);
    setFlash(new Set());
    setWaspShake(false);
    busyRef.current = false;
    winClaimedRef.current = false;
    setBusy(false);
    setAdPending(false);
    setPaused(false);
    setPendingReward(null);
    setConfirmReset(false);
    setMessage("Прогресс сброшен");
    trackEvent("progress_reset");
  };

  const shareGame = async () => {
    if (bridgeRef.current) {
      try {
        await bridgeRef.current.send("VKWebAppShare", { link: VK_APP_URL });
        return;
      } catch {
        // Use the browser share fallback below.
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Бортник — золотые соты",
          text: "Собирай нектар и развивай свою пасеку!",
          url: VK_APP_URL,
        });
      } else {
        await navigator.clipboard.writeText(VK_APP_URL);
        setMessage("Ссылка на игру скопирована");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Не удалось поделиться ссылкой");
    }
  };

  const inviteFriends = async () => {
    if (!bridgeRef.current || !vkReady) {
      setMessage("Приглашения доступны только внутри ВКонтакте");
      return;
    }
    try {
      await bridgeRef.current.send("VKWebAppShowInviteBox");
    } catch {
      setMessage("Не удалось открыть приглашения");
    }
  };

  const rewardButtonLabel = (kind: "coins" | "moves") => {
    if (adPending) return "Показываем рекламу…";
    if (!vkReady) return "Награда доступна в VK";
    if (!adAvailable) return "Реклама сейчас недоступна";
    return kind === "coins"
      ? `+${REWARD_COINS} монет за рекламу`
      : `+${REWARD_MOVES} ходов за рекламу`;
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmReset) setConfirmReset(false);
      else if (message) setMessage(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [confirmReset, message]);

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="loading-screen">ЗАГРУЗКА…</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="app-shell">
        <div className="start-screen">
          <div className="start-hero">
            <div className="start-hive" aria-hidden />
            <h1 className="start-brand">Бортник</h1>
            <p className="start-tagline">Золотые соты на опушке — наполни улей!</p>
            <button type="button" className="start-play" onClick={() => { adPolicyRef.current!.startGameplay(); setStarted(true); }}>
              В улей
            </button>
            <div className="start-links">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell${paused ? " paused" : ""}`}>
      <div className="game-frame" inert={modalOpen} aria-hidden={modalOpen || undefined}>
        {paused && (
          <div className="pause-banner" role="status">
            Игра на паузе
          </div>
        )}
        <header className="topbar">
          <div>
            <h1 className="brand-mini">Бортник</h1>
            <p className="muted">
              {vkUser ? vkUser.first_name : vkReady ? "ВКонтакте" : "Локальный улей"}
            </p>
          </div>
          <div className="economy">
            <span className="chip">🪙 {coins}</span>
            <span className="chip">💎 {crystals}</span>
          </div>
        </header>

        {tab === "hive" && (
          <section className="panel">
            <div className="level-head">
              <div>
                <h2>
                  Лужайка {levelState.level}: {levelConfig.title}
                </h2>
                <p className="level-meta">Ходы: {levelState.movesLeft}</p>
              </div>
              <button
                type="button"
                className="btn secondary"
                aria-label={sound ? "Выключить звук" : "Включить звук"}
                aria-pressed={sound}
                onClick={() => setSound((value) => !value)}
              >
                {sound ? "🔊" : "🔇"}
              </button>
            </div>

            {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}

            <div className="jar-wrap">
              <div className="jar-label">
                <span>Банка мёда</span>
                <span>
                  {formatHoney(levelState.honey)}/{honeyTarget}
                </span>
              </div>
              <div
                className="jar-track"
                role="progressbar"
                aria-label="Прогресс банки мёда"
                aria-valuemin={0}
                aria-valuemax={honeyTarget}
                aria-valuenow={levelState.honey}
                aria-valuetext={`${formatHoney(levelState.honey)} из ${honeyTarget}`}
              >
                <div className="jar-fill" style={{ width: `${honeyPercent}%` }} />
              </div>
            </div>

            <div className="goals-row">
              {levelState.goals.map((goal, index) => {
                if (goal.type === "honey") {
                  const done = levelState.honey >= goal.target;
                  return (
                    <span key={index} className={`goal-pill${done ? " done" : ""}`}>
                      🍯 {formatHoney(levelState.honey)}/{goal.target}
                    </span>
                  );
                }
                if (goal.type === "collect") {
                  const done = levelState.collected[goal.kind] >= goal.target;
                  return (
                    <span key={index} className={`goal-pill${done ? " done" : ""}`}>
                      {NECTAR_DATA[goal.kind].icon} {levelState.collected[goal.kind]}/{goal.target}
                    </span>
                  );
                }
                const done = levelState.waxCleared >= goal.target;
                return (
                  <span key={index} className={`goal-pill${done ? " done" : ""}`}>
                    🕯️ {levelState.waxCleared}/{goal.target}
                  </span>
                );
              })}
            </div>

            <div className={`board-grid${busy ? " busy" : ""}`}>
              {levelState.board.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const key = `${rowIndex},${colIndex}`;
                  const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                  return (
                    <button
                      key={cell?.id ?? key}
                      type="button"
                      className={`cell${isSelected ? " selected" : ""}${hinted.has(key) ? " hinted" : ""}${
                        flash.has(key) ? " match-flash" : ""
                      }${
                        waspShake && cell?.wasp ? " wasp-shake" : ""
                      }`}
                      onClick={() => onCellClick(rowIndex, colIndex)}
                      aria-pressed={isSelected}
                      aria-label={
                        cell
                          ? `${NECTAR_DATA[cell.kind].label}${specialLabel(cell)}${cell.wasp ? ", оса" : ""}${
                              cell.wax ? `, воск ${cell.wax}` : ""
                            }, ряд ${rowIndex + 1}, столбец ${colIndex + 1}`
                          : "пусто"
                      }
                    >
                      {cell && (
                        <span
                          className="cell-inner"
                          style={{ ["--cell-color" as string]: NECTAR_DATA[cell.kind].color }}
                        >
                          {cellIcon(cell)}
                          {cell.special && <span className="cell-badge">{cell.special === "bee" ? "→" : "*"}</span>}
                          {cell.wax > 0 && <span className="cell-wax" />}
                          {cell.wasp && <span className="cell-wasp">🪲</span>}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn secondary"
                disabled={coins < HINT_COST || busy || levelState.status !== "playing"}
                onClick={showHint}
              >
                Подсказка · 🪙 {HINT_COST}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || adPending || interstitialBusy || !vkReady || !adAvailable}
                onClick={() => void watchRewardAd("moves")}
              >
                {rewardButtonLabel("moves")}
              </button>
            </div>
          </section>
        )}

        {tab === "apiary" && (
          <section className="panel tab-panel">
            <h2>Пасека</h2>
            <p className="muted">Улучшения действуют со следующей лужайки или после повтора.</p>
            <div className="upgrade-list">
              {(Object.keys(UPGRADE_DATA) as UpgradeKey[]).map((key) => {
                const data = UPGRADE_DATA[key];
                const cost = getUpgradeCost(upgrades[key]);
                const isMaxed = upgrades[key] >= MAX_UPGRADE_LEVELS[key];
                return (
                  <div key={key} className="upgrade-card">
                    <div>
                      <h3>
                        {data.icon} {data.title} · {upgrades[key]}
                      </h3>
                      <p>
                        {data.description}. {data.bonus(upgrades[key])}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={isMaxed || crystals < cost}
                      onClick={() => buyUpgrade(key)}
                    >
                      {isMaxed ? "Максимум" : `💎 ${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || adPending || interstitialBusy || !vkReady || !adAvailable}
                onClick={() => void watchRewardAd("coins")}
              >
                {rewardButtonLabel("coins")}
              </button>
            </div>
          </section>
        )}

        {tab === "quests" && (
          <section className="panel tab-panel">
            <h2>Задания</h2>
            <p className="muted">Обновляются каждый день · {daily.date}</p>
            <div className="quest-list">
              {DAILY_QUESTS.map((quest) => {
                const progress = daily[quest.field];
                const claimed = daily.claimed.includes(quest.id);
                const ready = progress >= quest.target && !claimed;
                return (
                  <div key={quest.id} className="quest-card">
                    <div>
                      <h3>{quest.title}</h3>
                      <p>
                        {quest.description} · {Math.min(progress, quest.target)}/{quest.target}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={!ready}
                      onClick={() => claimQuest(quest.id)}
                    >
                      {claimed ? "Готово" : ready ? "Забрать" : "Ещё"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section className="panel tab-panel">
            <h2>Итоги</h2>
            <div className="stats-list">
              <div className="stat-row">
                <span>Лужаек пройдено</span>
                <strong>{stats.levelsWon}</strong>
              </div>
              <div className="stat-row">
                <span>Матчей</span>
                <strong>{stats.matchesMade}</strong>
              </div>
              <div className="stat-row">
                <span>Мёда собрано</span>
                <strong>{formatHoney(stats.honeyCollected)}</strong>
              </div>
              <div className="stat-row">
                <span>Спецсот создано</span>
                <strong>{stats.beesSpawned}</strong>
              </div>
              <div className="stat-row">
                <span>Ос прогнано</span>
                <strong>{stats.waspsCleared}</strong>
              </div>
              <div className="stat-row">
                <span>Лучшая лужайка</span>
                <strong>{stats.bestLevel}</strong>
              </div>
              <div className="stat-row">
                <span>Рекламы просмотрено</span>
                <strong>{stats.adsWatched}</strong>
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => void shareGame()}
              >
                Поделиться
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={!vkReady}
                onClick={() => void inviteFriends()}
              >
                {vkReady ? "Пригласить друга" : "Приглашения доступны в VK"}
              </button>
              <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>
                Сбросить прогресс
              </button>
            </div>
            <div className="footer-legal">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </section>
        )}
      </div>

      <nav
        className="tabs"
        aria-label="Разделы"
        inert={modalOpen}
        aria-hidden={modalOpen || undefined}
      >
        {(
          [
            ["hive", "Улей"],
            ["apiary", "Пасека"],
            ["quests", "Задания"],
            ["stats", "Итоги"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? " active" : ""}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {levelState.status === "won" && pendingReward && !message && !confirmReset && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title">
          <div className="overlay-card">
            <h3 id="win-title">Улей полон!</h3>
            <p>
              Лужайка {levelState.level} собрана. Монеты: +{pendingReward.coins}
              {pendingReward.crystals ? `, +${pendingReward.crystals} 💎` : ""}.
            </p>
            <div className="btn-row">
              <button type="button" className="btn" autoFocus disabled={interstitialBusy || adPending} onClick={() => void startNextLevel()}>
                Следующая лужайка
              </button>
            </div>
          </div>
        </div>
      )}

      {levelState.status === "lost" && !message && !confirmReset && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="lost-title">
          <div className="overlay-card">
            <h3 id="lost-title">Ходы кончились</h3>
            <p>
              {levelState.goals.some((goal) => goal.type === "honey" && levelState.honey < goal.target)
                ? "Банка мёда ещё не полна."
                : levelState.goals.some((goal) => goal.type === "wax" && levelState.waxCleared < goal.target)
                  ? "Мёд собран, но ещё остался воск."
                  : "Не все цели по нектару выполнены."}{" "}
              Попробуй снова или возьми ходы за рекламу.
            </p>
            <div className="btn-row">
              <button type="button" className="btn" autoFocus disabled={interstitialBusy || adPending} onClick={() => void retryLevel()}>
                Ещё раз
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || adPending || interstitialBusy || !vkReady || !adAvailable}
                onClick={() => void watchRewardAd("moves")}
              >
                {rewardButtonLabel("moves")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReset && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="overlay-card">
            <h3 id="reset-title">Сбросить прогресс?</h3>
            <p>Лужайки, улучшения, задания и накопленные ресурсы будут удалены.</p>
            <div className="btn-row">
              <button type="button" className="btn danger" autoFocus onClick={resetProgress}>
                Да, начать заново
              </button>
              <button type="button" className="btn secondary" onClick={() => setConfirmReset(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-title"
          aria-live="polite"
        >
          <div className="overlay-card">
            <h3 id="message-title">Улей</h3>
            <p>{message}</p>
            <button type="button" className="btn" autoFocus onClick={() => setMessage(null)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

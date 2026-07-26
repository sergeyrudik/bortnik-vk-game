"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import Link from "next/link";
import {
  NECTAR_DATA,
  UPGRADE_DATA,
  applySwapToLevel,
  createDefaultSave,
  createLevelState,
  getLevelConfig,
  getLocalDateKey,
  getUpgradeCost,
  grantMoveBonus,
  levelClearReward,
  migrateSave,
  refreshDaily,
  refreshRewards,
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
const REWARD_COOLDOWN_MS = 3 * 60 * 1000;
const REWARD_DAILY_LIMIT = 8;
const INTERSTITIAL_INTERVAL_MS = 3 * 60 * 1000;
const PRODUCTION_URL = "https://sergeyrudik-bortnik-vk-game-c295.twc1.net/";
/** Replace with https://vk.com/appXXXX after the VK Mini App is created. */
const VK_APP_URL = PRODUCTION_URL;

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
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("VK Bridge timeout")), timeoutMs);
    }),
  ]);
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
  const [waspShake, setWaspShake] = useState(false);
  const [adAvailable, setAdAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastInterstitialRef = useRef(0);
  const rewardedClaimedRef = useRef(false);

  const levelConfig = useMemo(() => getLevelConfig(level, upgrades), [level, upgrades]);
  const honeyTarget = honeyGoalTarget(levelState);
  const honeyPercent = Math.min(100, Math.round((levelState.honey / honeyTarget) * 100));

  const tutorialText = useMemo(() => {
    if (tutorialDone) return null;
    if (tutorialStep === 0) return "Поменяй местами соседние соты, чтобы собрать три одинаковых нектара.";
    if (tutorialStep === 1) return "Матч из четырёх даёт пчелу 🐝 — она очищает ряд и столбец.";
    return "Наполни банку мёда до цели, пока не кончились ходы.";
  }, [tutorialDone, tutorialStep]);

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

  const applySave = useCallback((save: GameSave) => {
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
    setLevelState(createLevelState(save.level, save.upgrades));
  }, []);

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
      const localSave = migrateSave(localStorage.getItem(SAVE_KEY));
      let cloudSave: GameSave | null = null;

      try {
        await promiseWithTimeout(bridge.send("VKWebAppInit"), 1800);
        if (cancelled) return;
        bridgeRef.current = bridge as unknown as VKBridge;
        setVkReady(true);

        try {
          await bridgeRef.current.send("VKWebAppSetViewSettings", {
            status_bar_style: "light",
            action_bar_color: "#2f5d3a",
            navigation_bar_color: "#2f5d3a",
          });
        } catch {
          // optional
        }

        try {
          const user = (await bridgeRef.current.send("VKWebAppGetUserInfo")) as VKUser;
          setVkUser(user);
        } catch {
          // optional
        }

        try {
          const storage = (await bridgeRef.current.send("VKWebAppStorageGet", {
            keys: [VK_SAVE_KEY],
          })) as { keys?: Array<{ value: string }> };
          cloudSave = migrateSave(storage.keys?.[0]?.value);
        } catch {
          trackEvent("save_load_error", { source: "vk" });
        }
      } catch {
        bridgeRef.current = null;
        setVkReady(false);
      }

      if (cancelled) return;
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

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const save: GameSave = {
        version: 1,
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
      };
      const value = serializeSave(save);
      try {
        localStorage.setItem(SAVE_KEY, value);
      } catch {
        trackEvent("save_write_error", { source: "local" });
      }
      if (bridgeRef.current) {
        void bridgeRef.current
          .send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value })
          .catch(() => trackEvent("save_write_error", { source: "vk" }));
      }
    }, 250);
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
    trackEvent,
  ]);

  useEffect(() => {
    const handler = (event: VKEvent) => {
      if (event.detail?.type === "VKWebAppViewHide") setPaused(true);
      if (event.detail?.type === "VKWebAppViewRestore") setPaused(false);
    };
    bridge.subscribe?.(handler);
    return () => bridge.unsubscribe?.(handler);
  }, []);

  const maybeShowInterstitial = useCallback(async () => {
    if (!bridgeRef.current) return;
    const now = Date.now();
    if (now - lastInterstitialRef.current < INTERSTITIAL_INTERVAL_MS) return;
    try {
      const check = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "interstitial",
      })) as { result?: boolean };
      if (!check.result) return;
      await bridgeRef.current.send("VKWebAppShowNativeAds", { ad_format: "interstitial" });
      lastInterstitialRef.current = now;
      trackEvent("interstitial_shown");
    } catch {
      // optional
    }
  }, [trackEvent]);

  const bumpDaily = useCallback((field: "match" | "level" | "wasp", amount = 1) => {
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, [field]: fresh[field] + amount };
    });
  }, []);

  const finishWin = useCallback(
    (wonLevel: number) => {
      const reward = levelClearReward(wonLevel);
      setPendingReward(reward);
      setCoins((value) => value + reward.coins);
      setCrystals((value) => value + reward.crystals);
      setStats((prev) => ({
        ...prev,
        levelsWon: prev.levelsWon + 1,
        bestLevel: Math.max(prev.bestLevel, wonLevel + 1),
        honeyCollected: prev.honeyCollected + levelState.honey,
      }));
      bumpDaily("level");
      setTutorialDone(true);
      setTutorialStep(2);
      playSound("win");
      trackEvent("level_win", { level: wonLevel });
      void maybeShowInterstitial();
    },
    [bumpDaily, levelState.honey, maybeShowInterstitial, playSound, trackEvent],
  );

  const handleSwap = useCallback(
    async (from: { row: number; col: number }, to: { row: number; col: number }) => {
      if (busy || paused || levelState.status !== "playing") return;
      setBusy(true);
      const { state, result } = applySwapToLevel(levelState, from, to);
      if (!result.ok) {
        playSound("error");
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
      setLevelState(state);
      setFlash(new Set());
      setSelected(null);

      if (result.waspsCleared >= 0) {
        setWaspShake(true);
        window.setTimeout(() => setWaspShake(false), 320);
      }

      if (state.status === "won") {
        finishWin(state.level);
      } else if (state.status === "lost") {
        trackEvent("level_lose", { level: state.level });
        playSound("error");
      }

      setBusy(false);
    },
    [busy, bumpDaily, finishWin, levelState, paused, playSound, trackEvent, tutorialDone],
  );

  const onCellClick = (row: number, col: number) => {
    if (busy || paused || levelState.status !== "playing") return;
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

  const startNextLevel = () => {
    const nextLevel = levelState.status === "won" ? level + 1 : level;
    if (levelState.status === "won") setLevel(nextLevel);
    setPendingReward(null);
    setLevelState(createLevelState(nextLevel, upgrades));
    setSelected(null);
    setTab("hive");
  };

  const retryLevel = () => {
    setPendingReward(null);
    setLevelState(createLevelState(level, upgrades));
    setSelected(null);
  };

  const buyUpgrade = (key: UpgradeKey) => {
    const cost = getUpgradeCost(upgrades[key]);
    if (crystals < cost) {
      setMessage("Не хватает кристаллов");
      return;
    }
    setCrystals((value) => value - cost);
    setUpgrades((prev) => {
      const next = { ...prev, [key]: prev[key] + 1 };
      setLevelState(createLevelState(level, next));
      return next;
    });
    trackEvent("upgrade_buy", { key, level: upgrades[key] + 1 });
  };

  const claimQuest = (id: string) => {
    const quest = DAILY_QUESTS.find((item) => item.id === id);
    if (!quest) return;
    const fresh = refreshDaily(daily);
    if (fresh.claimed.includes(id) || fresh[quest.field] < quest.target) return;
    setDaily({ ...fresh, claimed: [...fresh.claimed, id] });
    if (quest.reward.coins) setCoins((value) => value + quest.reward.coins!);
    if (quest.reward.crystals) setCrystals((value) => value + quest.reward.crystals!);
    trackEvent("quest_claim", { id });
  };

  const watchRewardAd = async (kind: "coins" | "moves") => {
    const fresh = refreshRewards(rewards);
    const now = Date.now();
    if (fresh.count >= REWARD_DAILY_LIMIT) {
      setMessage("Дневной лимит наград исчерпан");
      return;
    }
    if (now - fresh.lastRewardAt < REWARD_COOLDOWN_MS) {
      setMessage("Подождите немного перед следующей наградой");
      return;
    }

    if (!bridgeRef.current || !adAvailable) {
      // Local fallback outside VK for testing
      rewardedClaimedRef.current = true;
    } else {
      try {
        const response = (await bridgeRef.current.send("VKWebAppShowNativeAds", {
          ad_format: "reward",
        })) as { result?: boolean };
        if (!response.result) {
          setMessage("Реклама недоступна");
          return;
        }
        rewardedClaimedRef.current = true;
      } catch {
        setMessage("Не удалось показать рекламу");
        return;
      }
    }

    if (!rewardedClaimedRef.current) return;
    rewardedClaimedRef.current = false;
    setRewards({
      date: fresh.date,
      count: fresh.count + 1,
      lastRewardAt: now,
    });
    setStats((prev) => ({ ...prev, adsWatched: prev.adsWatched + 1 }));
    if (kind === "coins") {
      setCoins((value) => value + REWARD_COINS);
      setMessage(`+${REWARD_COINS} монет`);
    } else {
      setLevelState((prev) => grantMoveBonus(prev, REWARD_MOVES));
      setMessage(`+${REWARD_MOVES} ходов`);
    }
    trackEvent("reward_claimed", { kind });
    void checkRewardAvailability();
  };

  const resetProgress = () => {
    const fresh = createDefaultSave();
    applySave(fresh);
    setStarted(false);
    setPendingReward(null);
    setMessage("Прогресс сброшен");
    trackEvent("progress_reset");
  };

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
            <button type="button" className="start-play" onClick={() => setStarted(true)}>
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
      <div className="game-frame">
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
              <button type="button" className="btn secondary" onClick={() => setSound((value) => !value)}>
                {sound ? "🔊" : "🔇"}
              </button>
            </div>

            {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}

            <div className="jar-wrap">
              <div className="jar-label">
                <span>Банка мёда</span>
                <span>
                  {levelState.honey}/{honeyTarget}
                </span>
              </div>
              <div className="jar-track" aria-label="Прогресс банки мёда">
                <div className="jar-fill" style={{ width: `${honeyPercent}%` }} />
              </div>
            </div>

            <div className="goals-row">
              {levelState.goals.map((goal, index) => {
                if (goal.type === "honey") {
                  const done = levelState.honey >= goal.target;
                  return (
                    <span key={index} className={`goal-pill${done ? " done" : ""}`}>
                      🍯 {levelState.honey}/{goal.target}
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
                      className={`cell${isSelected ? " selected" : ""}${flash.has(key) ? " match-flash" : ""}${
                        waspShake && cell?.wasp ? " wasp-shake" : ""
                      }`}
                      onClick={() => onCellClick(rowIndex, colIndex)}
                      aria-label={
                        cell
                          ? `${NECTAR_DATA[cell.kind].label}${cell.wasp ? ", оса" : ""}${cell.wax ? ", воск" : ""}`
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
              <button type="button" className="btn secondary" onClick={() => void watchRewardAd("moves")}>
                +{REWARD_MOVES} ходов за рекламу
              </button>
            </div>
          </section>
        )}

        {tab === "apiary" && (
          <section className="panel tab-panel">
            <h2>Пасека</h2>
            <p className="muted">Улучшения действуют на новые лужайки и текущий перезапуск.</p>
            <div className="upgrade-list">
              {(Object.keys(UPGRADE_DATA) as UpgradeKey[]).map((key) => {
                const data = UPGRADE_DATA[key];
                const cost = getUpgradeCost(upgrades[key]);
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
                    <button type="button" className="btn" onClick={() => buyUpgrade(key)}>
                      💎 {cost}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="btn secondary" onClick={() => void watchRewardAd("coins")}>
                +{REWARD_COINS} монет за рекламу
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
                <strong>{stats.honeyCollected}</strong>
              </div>
              <div className="stat-row">
                <span>Пчёл создано</span>
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
                onClick={() => {
                  void bridgeRef.current?.send("VKWebAppShare", { link: VK_APP_URL });
                }}
              >
                Поделиться
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  void bridgeRef.current?.send("VKWebAppShowInviteBox");
                }}
              >
                Пригласить друга
              </button>
              <button type="button" className="btn danger" onClick={resetProgress}>
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

      <nav className="tabs" aria-label="Разделы">
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
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {levelState.status === "won" && pendingReward && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>Улей полон!</h3>
            <p>
              Лужайка {levelState.level} собрана. +{pendingReward.coins} монет
              {pendingReward.crystals ? `, +${pendingReward.crystals} 💎` : ""}.
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={startNextLevel}>
                Следующая лужайка
              </button>
            </div>
          </div>
        </div>
      )}

      {levelState.status === "lost" && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>Ходы кончились</h3>
            <p>Осы шумят, а банка ещё не полна. Попробуй снова или возьми ходы за рекламу.</p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={retryLevel}>
                Ещё раз
              </button>
              <button type="button" className="btn secondary" onClick={() => void watchRewardAd("moves")}>
                +{REWARD_MOVES} ходов за рекламу
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="overlay" onClick={() => setMessage(null)}>
          <div className="overlay-card">
            <h3>Улей</h3>
            <p>{message}</p>
            <button type="button" className="btn" onClick={() => setMessage(null)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

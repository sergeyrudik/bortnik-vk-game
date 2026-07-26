export const BOARD_SIZE = 6;
export const CAMPAIGN_LEVELS = 30;
export const NECTAR_KINDS = ["linden", "buckwheat", "clover", "sunflower", "fireweed"] as const;
export type NectarKind = (typeof NECTAR_KINDS)[number];
export type SpecialKind = "bee" | "queen" | "pot";

export type Cell = {
  id: number;
  kind: NectarKind;
  special: SpecialKind | null;
  wax: number;
  wasp: boolean;
};

export type Board = Array<Array<Cell | null>>;

export type Upgrades = {
  combs: number;
  nectar: number;
  smoke: number;
};

export const MAX_UPGRADE_LEVELS: Record<keyof Upgrades, number> = {
  combs: 10,
  nectar: 10,
  smoke: 4,
};

export type GameStats = {
  levelsWon: number;
  matchesMade: number;
  beesSpawned: number;
  waspsCleared: number;
  bestLevel: number;
  adsWatched: number;
  honeyCollected: number;
};

export type DailyProgress = {
  date: string;
  match: number;
  level: number;
  wasp: number;
  claimed: string[];
};

export type RewardLimits = {
  date: string;
  count: number;
  lastRewardAt: number;
};

export type LevelGoal =
  | { type: "honey"; target: number }
  | { type: "collect"; kind: NectarKind; target: number }
  | { type: "wax"; target: number };

export type LevelConfig = {
  level: number;
  title: string;
  moves: number;
  goals: LevelGoal[];
  waxCount: number;
  waspCount: number;
  honeyPerTile: number;
};

export type LevelState = {
  level: number;
  board: Board;
  movesLeft: number;
  honey: number;
  collected: Record<NectarKind, number>;
  waxCleared: number;
  goals: LevelGoal[];
  honeyPerTile: number;
  status: "playing" | "won" | "lost";
};

export type MatchGroup = {
  cells: Array<{ row: number; col: number }>;
  kind: NectarKind;
  special: SpecialKind | null;
};

export type ResolveStep = {
  cleared: Array<{ row: number; col: number }>;
  honeyGained: number;
  specialsSpawned: number;
  waspsCleared: number;
  waxCleared: number;
  collected: Partial<Record<NectarKind, number>>;
};

export type SwapResult = {
  ok: boolean;
  board: Board;
  steps: ResolveStep[];
  honeyGained: number;
  matchesMade: number;
  beesSpawned: number;
  waspsCleared: number;
  waxCleared: number;
  collected: Partial<Record<NectarKind, number>>;
  movesSpent: number;
};

export type GameSave = {
  version: 2;
  updatedAt: number;
  coins: number;
  crystals: number;
  level: number;
  sound: boolean;
  tutorialDone: boolean;
  tutorialStep: number;
  upgrades: Upgrades;
  stats: GameStats;
  daily: DailyProgress;
  rewards: RewardLimits;
  levelState: LevelState | null;
  pendingReward: { coins: number; crystals: number } | null;
  lastInterstitialAt: number;
};

export const NECTAR_DATA: Record<
  NectarKind,
  { label: string; icon: string; color: string }
> = {
  linden: { label: "Липа", icon: "🌼", color: "#f4e27a" },
  buckwheat: { label: "Гречиха", icon: "🟤", color: "#8b5a2b" },
  clover: { label: "Клевер", icon: "🍀", color: "#4caf6a" },
  sunflower: { label: "Подсолнух", icon: "🌻", color: "#f0a500" },
  fireweed: { label: "Кипрей", icon: "🌺", color: "#d45d8c" },
};

export const UPGRADE_DATA: Record<
  keyof Upgrades,
  { icon: string; title: string; description: string; bonus: (level: number) => string }
> = {
  combs: {
    icon: "🪺",
    title: "Соты",
    description: "Больше ходов на каждой лужайке",
    bonus: (level) => `+${level} к числу ходов`,
  },
  nectar: {
    icon: "🍯",
    title: "Медогонка",
    description: "Больше мёда с каждого матча",
    bonus: (level) => `+${level * 10}% к мёду`,
  },
  smoke: {
    icon: "💨",
    title: "Дымарь",
    description: "Меньше ос на лужайках",
    bonus: (level) => `−${Math.min(level, 4)} ос`,
  },
};

let nextCellId = 1;

export function getNextCellId(): number {
  const id = nextCellId;
  nextCellId += 1;
  return id;
}

export function resetCellId(next = 1): void {
  nextCellId = Math.max(1, next);
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampInt(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampNumber(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function roundHoney(value: number): number {
  return Math.round(value * 10) / 10;
}

function createEmptyCollected(): Record<NectarKind, number> {
  return { linden: 0, buckwheat: 0, clover: 0, sunflower: 0, fireweed: 0 };
}

export function createDefaultUpgrades(): Upgrades {
  return { combs: 0, nectar: 0, smoke: 0 };
}

export function createDefaultStats(): GameStats {
  return {
    levelsWon: 0,
    matchesMade: 0,
    beesSpawned: 0,
    waspsCleared: 0,
    bestLevel: 1,
    adsWatched: 0,
    honeyCollected: 0,
  };
}

export function createDefaultDaily(date = getLocalDateKey()): DailyProgress {
  return { date, match: 0, level: 0, wasp: 0, claimed: [] };
}

export function createDefaultRewards(date = getLocalDateKey()): RewardLimits {
  return { date, count: 0, lastRewardAt: 0 };
}

export function createDefaultSave(): GameSave {
  return {
    version: 2,
    updatedAt: Date.now(),
    coins: 120,
    crystals: 2,
    level: 1,
    sound: true,
    tutorialDone: false,
    tutorialStep: 0,
    upgrades: createDefaultUpgrades(),
    stats: createDefaultStats(),
    daily: createDefaultDaily(),
    rewards: createDefaultRewards(),
    levelState: null,
    pendingReward: null,
    lastInterstitialAt: 0,
  };
}

export function serializeSave(save: GameSave): string {
  return JSON.stringify({ ...save, updatedAt: Date.now() });
}

export function selectNewestSave(a: GameSave | null, b: GameSave | null): GameSave | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

function isNectarKind(value: unknown): value is NectarKind {
  return typeof value === "string" && (NECTAR_KINDS as readonly string[]).includes(value);
}

function migrateLevelState(raw: unknown, expectedLevel: number, upgrades: Upgrades): LevelState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<LevelState>;
  if (!Array.isArray(parsed.board) || parsed.board.length !== BOARD_SIZE) return null;

  let board: Board = [];
  for (const rawRow of parsed.board) {
    if (!Array.isArray(rawRow) || rawRow.length !== BOARD_SIZE) return null;
    const row: Array<Cell | null> = [];
    for (const rawCell of rawRow) {
      if (!rawCell || typeof rawCell !== "object") return null;
      const cell = rawCell as Partial<Cell>;
      if (!isNectarKind(cell.kind)) return null;
      const special =
        cell.special === "bee" || cell.special === "queen" || cell.special === "pot"
          ? cell.special
          : null;
      row.push({
        id: clampInt(cell.id, 1, 1, Number.MAX_SAFE_INTEGER),
        kind: cell.kind,
        special,
        wax: clampInt(cell.wax, 0, 0, 2),
        wasp: cell.wasp === true,
      });
    }
    board.push(row);
  }
  if (findMatches(board).length > 0) return null;
  board = ensurePlayableBoard(board, mulberry32(expectedLevel * 193 + 29));

  const seenIds = new Set<number>();
  let maxCellId = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (seenIds.has(cell.id)) {
        maxCellId += 1;
        cell.id = maxCellId;
      } else {
        seenIds.add(cell.id);
        maxCellId = Math.max(maxCellId, cell.id);
      }
      seenIds.add(cell.id);
    }
  }

  const config = getLevelConfig(expectedLevel, upgrades);
  const goals: LevelGoal[] = [];
  if (Array.isArray(parsed.goals)) {
    for (const rawGoal of parsed.goals.slice(0, 3)) {
      if (!rawGoal || typeof rawGoal !== "object") continue;
      const goal = rawGoal as Partial<LevelGoal>;
      if (goal.type === "honey") {
        goals.push({ type: "honey", target: clampInt(goal.target, config.goals[0].target, 1, 100_000) });
      } else if (goal.type === "collect" && isNectarKind(goal.kind)) {
        goals.push({ type: "collect", kind: goal.kind, target: clampInt(goal.target, 1, 1, 10_000) });
      } else if (goal.type === "wax") {
        goals.push({ type: "wax", target: clampInt(goal.target, 1, 1, 10_000) });
      }
    }
  }

  const status =
    parsed.status === "won" || parsed.status === "lost" || parsed.status === "playing"
      ? parsed.status
      : "playing";
  return {
    level: expectedLevel,
    board,
    movesLeft: clampInt(parsed.movesLeft, config.moves, 0, 999),
    honey: roundHoney(clampNumber(parsed.honey, 0, 0, 1_000_000)),
    collected: {
      linden: clampInt(parsed.collected?.linden, 0),
      buckwheat: clampInt(parsed.collected?.buckwheat, 0),
      clover: clampInt(parsed.collected?.clover, 0),
      sunflower: clampInt(parsed.collected?.sunflower, 0),
      fireweed: clampInt(parsed.collected?.fireweed, 0),
    },
    waxCleared: clampInt(parsed.waxCleared, 0),
    goals: goals.length > 0 ? goals : config.goals,
    honeyPerTile: clampNumber(parsed.honeyPerTile, config.honeyPerTile, 0.1, 100),
    status,
  };
}

export function migrateSave(raw: string | null | undefined): GameSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = createDefaultSave();
    const level = clampInt(parsed.level, 1, 1, 9999);
    const upgrades = {
      combs: clampInt(parsed.upgrades?.combs, 0, 0, MAX_UPGRADE_LEVELS.combs),
      nectar: clampInt(parsed.upgrades?.nectar, 0, 0, MAX_UPGRADE_LEVELS.nectar),
      smoke: clampInt(parsed.upgrades?.smoke, 0, 0, MAX_UPGRADE_LEVELS.smoke),
    };
    const levelState = migrateLevelState(parsed.levelState, level, upgrades);
    const pendingReward =
      levelState?.status === "won" && parsed.pendingReward && typeof parsed.pendingReward === "object"
        ? {
            coins: clampInt(parsed.pendingReward.coins, 0, 0, 1_000_000),
            crystals: clampInt(parsed.pendingReward.crystals, 0, 0, 9999),
          }
        : null;

    return {
      version: 2,
      updatedAt: clampInt(parsed.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      coins: clampInt(parsed.coins, base.coins, 0, 999_999),
      crystals: clampInt(parsed.crystals, base.crystals, 0, 9999),
      level,
      sound: parsed.sound !== false,
      tutorialDone: Boolean(parsed.tutorialDone),
      tutorialStep: clampInt(parsed.tutorialStep, 0, 0, 2),
      upgrades,
      stats: {
        levelsWon: clampInt(parsed.stats?.levelsWon, 0),
        matchesMade: clampInt(parsed.stats?.matchesMade, 0),
        beesSpawned: clampInt(parsed.stats?.beesSpawned, 0),
        waspsCleared: clampInt(parsed.stats?.waspsCleared, 0),
        bestLevel: clampInt(parsed.stats?.bestLevel, 1, 1),
        adsWatched: clampInt(parsed.stats?.adsWatched, 0),
        honeyCollected: roundHoney(clampNumber(parsed.stats?.honeyCollected, 0)),
      },
      daily: {
        date: typeof parsed.daily?.date === "string" ? parsed.daily.date : getLocalDateKey(),
        match: clampInt(parsed.daily?.match, 0),
        level: clampInt(parsed.daily?.level, 0),
        wasp: clampInt(parsed.daily?.wasp, 0),
        claimed: Array.isArray(parsed.daily?.claimed)
          ? parsed.daily.claimed.filter((item): item is string => typeof item === "string")
          : [],
      },
      rewards: {
        date: typeof parsed.rewards?.date === "string" ? parsed.rewards.date : getLocalDateKey(),
        count: clampInt(parsed.rewards?.count, 0),
        lastRewardAt: clampInt(parsed.rewards?.lastRewardAt, 0, 0, Number.MAX_SAFE_INTEGER),
      },
      levelState,
      pendingReward,
      lastInterstitialAt: clampInt(
        parsed.lastInterstitialAt,
        0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    };
  } catch {
    return null;
  }
}

export function getUpgradeCost(level: number): number {
  const safe = clampInt(level, 0, 0, 50);
  return 3 + safe * 2;
}

export function getLevelConfig(level: number, upgrades: Upgrades = createDefaultUpgrades()): LevelConfig {
  const safeLevel = Math.max(1, clampInt(level, 1, 1));
  const safeUpgrades: Upgrades = {
    combs: clampInt(upgrades.combs, 0, 0, MAX_UPGRADE_LEVELS.combs),
    nectar: clampInt(upgrades.nectar, 0, 0, MAX_UPGRADE_LEVELS.nectar),
    smoke: clampInt(upgrades.smoke, 0, 0, MAX_UPGRADE_LEVELS.smoke),
  };
  const cycle = Math.floor((safeLevel - 1) / CAMPAIGN_LEVELS);
  const index = ((safeLevel - 1) % CAMPAIGN_LEVELS) + 1;
  const waxCount = index >= 4 ? Math.min(10, 1 + Math.floor(index / 4) + cycle) : 0;
  const extraGoalMoves =
    (index % 5 === 0 ? 2 : 0) + (waxCount > 0 && index % 4 === 0 ? 2 : 0);
  const baseMoves =
    18 + Math.floor((index - 1) / 5) * 2 + extraGoalMoves + safeUpgrades.combs;
  // A compact 6×6 board produces fewer useful choices per move than the old
  // 8×8 layout, so the target grows gently through each 30-level campaign.
  const honeyTarget = 40 + index * 3 + cycle * 12;
  const waspCount = Math.max(
    0,
    (index >= 6 ? Math.min(5, Math.floor(index / 6) + cycle) : 0) - safeUpgrades.smoke,
  );

  const goals: LevelGoal[] = [{ type: "honey", target: honeyTarget }];
  if (index % 5 === 0) {
    const kind = NECTAR_KINDS[(index + cycle) % NECTAR_KINDS.length];
    goals.push({ type: "collect", kind, target: 12 + cycle * 2 });
  }
  if (waxCount > 0 && index % 4 === 0) {
    goals.push({ type: "wax", target: Math.min(waxCount, 4 + cycle) });
  }

  const titles = [
    "Первая опушка",
    "Липовый край",
    "Гречиховое поле",
    "Клеверная поляна",
    "Солнечный склон",
    "Кипрейный дол",
    "Осиный гул",
    "Восковые печати",
    "Медовый яр",
    "Борть у ручья",
  ];

  return {
    level: safeLevel,
    title: titles[(index - 1) % titles.length] + (cycle > 0 ? ` · круг ${cycle + 1}` : ""),
    moves: baseMoves,
    goals,
    waxCount,
    waspCount,
    honeyPerTile: Number((1 + safeUpgrades.nectar * 0.1 + cycle * 0.1).toFixed(1)),
  };
}

function randomKind(rng: () => number): NectarKind {
  return NECTAR_KINDS[Math.floor(rng() * NECTAR_KINDS.length)];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCell(
  kind: NectarKind,
  options: { special?: SpecialKind | null; wax?: number; wasp?: boolean; id?: number } = {},
): Cell {
  return {
    id: options.id ?? getNextCellId(),
    kind,
    special: options.special ?? null,
    wax: options.wax ?? 0,
    wasp: options.wasp ?? false,
  };
}

function wouldMatchAt(board: Board, row: number, col: number, kind: NectarKind): boolean {
  if (
    col >= 2 &&
    board[row][col - 1]?.kind === kind &&
    board[row][col - 2]?.kind === kind &&
    !board[row][col - 1]?.special &&
    !board[row][col - 2]?.special
  ) {
    return true;
  }
  if (
    row >= 2 &&
    board[row - 1][col]?.kind === kind &&
    board[row - 2][col]?.kind === kind &&
    !board[row - 1][col]?.special &&
    !board[row - 2][col]?.special
  ) {
    return true;
  }
  return false;
}

function createsMatchAt(board: Board, row: number, col: number, kind: NectarKind): boolean {
  const kindAt = (targetRow: number, targetCol: number): NectarKind | null => {
    if (targetRow === row && targetCol === col) return kind;
    const cell = board[targetRow]?.[targetCol];
    return cell && !cell.special ? cell.kind : null;
  };
  for (const [rowStep, colStep] of [
    [0, 1],
    [1, 0],
  ] as const) {
    let run = 1;
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance < 3; distance += 1) {
        const targetRow = row + rowStep * distance * direction;
        const targetCol = col + colStep * distance * direction;
        if (
          targetRow < 0 ||
          targetRow >= BOARD_SIZE ||
          targetCol < 0 ||
          targetCol >= BOARD_SIZE ||
          kindAt(targetRow, targetCol) !== kind
        ) {
          break;
        }
        run += 1;
      }
    }
    if (run >= 3) return true;
  }
  return false;
}

export function createBoard(seed = 1, waxCount = 0, waspCount = 0): Board {
  const rng = mulberry32(seed);
  resetCellId(seed * 1000);
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      let kind = randomKind(rng);
      let guard = 0;
      while (wouldMatchAt(board, row, col, kind) && guard < 20) {
        kind = randomKind(rng);
        guard += 1;
      }
      board[row][col] = createCell(kind);
    }
  }

  const positions: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      positions.push({ row, col });
    }
  }
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  let cursor = 0;
  for (let i = 0; i < waxCount && cursor < positions.length; i += 1, cursor += 1) {
    const { row, col } = positions[cursor];
    const cell = board[row][col];
    if (cell) cell.wax = 1 + (i % 2);
  }
  for (let i = 0; i < waspCount && cursor < positions.length; i += 1, cursor += 1) {
    const { row, col } = positions[cursor];
    const cell = board[row][col];
    if (cell) {
      cell.wasp = true;
      cell.wax = 0;
    }
  }

  return ensurePlayableBoard(board, rng);
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function findMatches(board: Board): MatchGroup[] {
  const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
  const groups: MatchGroup[] = [];

  const markLine = (cells: Array<{ row: number; col: number }>, kind: NectarKind) => {
    if (cells.length < 3) return;
    for (const { row, col } of cells) visited[row][col] = true;
    let special: SpecialKind | null = null;
    if (cells.length >= 5) special = "pot";
    else if (cells.length === 4) special = "bee";
    groups.push({ cells: [...cells], kind, special });
  };

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let run: Array<{ row: number; col: number }> = [];
    let runKind: NectarKind | null = null;
    for (let col = 0; col <= BOARD_SIZE; col += 1) {
      const cell = col < BOARD_SIZE ? board[row][col] : null;
      const kind = cell && !cell.special ? cell.kind : null;
      if (kind && kind === runKind) {
        run.push({ row, col });
      } else {
        if (runKind) markLine(run, runKind);
        run = kind ? [{ row, col }] : [];
        runKind = kind;
      }
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let run: Array<{ row: number; col: number }> = [];
    let runKind: NectarKind | null = null;
    for (let row = 0; row <= BOARD_SIZE; row += 1) {
      const cell = row < BOARD_SIZE ? board[row][col] : null;
      const kind = cell && !cell.special ? cell.kind : null;
      if (kind && kind === runKind) {
        run.push({ row, col });
      } else {
        if (runKind) markLine(run, runKind);
        run = kind ? [{ row, col }] : [];
        runKind = kind;
      }
    }
  }

  // Merge overlapping groups that share cells into L/T shapes → queen
  const cellToGroups = new Map<string, number[]>();
  groups.forEach((group, index) => {
    group.cells.forEach(({ row, col }) => {
      const key = `${row},${col}`;
      const list = cellToGroups.get(key) ?? [];
      list.push(index);
      cellToGroups.set(key, list);
    });
  });

  const merged = new Set<number>();
  const result: MatchGroup[] = [];
  groups.forEach((group, index) => {
    if (merged.has(index)) return;
    const queue = [index];
    const members = new Set<number>();
    while (queue.length) {
      const current = queue.pop()!;
      if (members.has(current)) continue;
      members.add(current);
      for (const { row, col } of groups[current].cells) {
        for (const other of cellToGroups.get(`${row},${col}`) ?? []) {
          if (!members.has(other)) queue.push(other);
        }
      }
    }
    members.forEach((m) => merged.add(m));
    const cellsMap = new Map<string, { row: number; col: number }>();
    let kind: NectarKind = group.kind;
    let special: SpecialKind | null = null;
    members.forEach((m) => {
      const g = groups[m];
      kind = g.kind;
      if (g.special === "pot") special = "pot";
      else if (g.special === "bee" && special !== "pot") special = "bee";
      g.cells.forEach((cell) => cellsMap.set(`${cell.row},${cell.col}`, cell));
    });
    if (members.size > 1 && special !== "pot") special = "queen";
    result.push({ cells: [...cellsMap.values()], kind, special });
  });

  void visited;
  return result;
}

export function findAvailableSwap(
  board: Board,
): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      for (const [rowOffset, colOffset] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;
        if (nextRow >= BOARD_SIZE || nextCol >= BOARD_SIZE) continue;

        const current = board[row][col];
        const neighbor = board[nextRow][nextCol];
        if (!current || !neighbor) continue;
        const move = {
          from: { row, col },
          to: { row: nextRow, col: nextCol },
        };
        if (current.special || neighbor.special) return move;

        const swapped = cloneBoard(board);
        swapped[row][col] = neighbor;
        swapped[nextRow][nextCol] = current;
        if (findMatches(swapped).length > 0) return move;
      }
    }
  }
  return null;
}

export function hasAvailableSwap(board: Board): boolean {
  return findAvailableSwap(board) !== null;
}

function buildGuaranteedPlayableBoard(board: Board): Board {
  const candidate = cloneBoard(board);
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = candidate[row][col];
      if (cell && !cell.special) {
        cell.kind = NECTAR_KINDS[(row * 2 + col) % NECTAR_KINDS.length];
      }
    }
  }

  const setup: Array<[number, number, NectarKind]> = [
    [3, 1, "fireweed"],
    [3, 2, "linden"],
    [3, 3, "buckwheat"],
    [3, 4, "linden"],
    [3, 5, "sunflower"],
    [4, 2, "buckwheat"],
    [4, 3, "linden"],
    [4, 4, "sunflower"],
    [2, 3, "clover"],
  ];
  for (const [row, col, kind] of setup) {
    const cell = candidate[row]?.[col];
    if (cell && !cell.special) cell.kind = kind;
  }
  return candidate;
}

function ensurePlayableBoard(board: Board, rng: () => number): Board {
  if (hasAvailableSwap(board)) return board;

  const cells = board.flat().filter((cell): cell is Cell => cell !== null);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const shuffled = cells.map((cell) => ({ ...cell }));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    const candidate: Board = Array.from({ length: BOARD_SIZE }, (_, row) =>
      shuffled.slice(row * BOARD_SIZE, (row + 1) * BOARD_SIZE),
    );
    if (findMatches(candidate).length === 0 && hasAvailableSwap(candidate)) return candidate;
  }

  return buildGuaranteedPlayableBoard(board);
}

function adjacent(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function collectSpecialBlast(
  board: Board,
  row: number,
  col: number,
  special: SpecialKind,
  kind: NectarKind,
): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [{ row, col }];
  if (special === "bee") {
    for (let c = 0; c < BOARD_SIZE; c += 1) cells.push({ row, col: c });
    for (let r = 0; r < BOARD_SIZE; r += 1) cells.push({ row: r, col });
  } else if (special === "queen") {
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) cells.push({ row: r, col: c });
      }
    }
  } else if (special === "pot") {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (board[r][c]?.kind === kind) cells.push({ row: r, col: c });
      }
    }
  }
  const unique = new Map<string, { row: number; col: number }>();
  cells.forEach((cell) => unique.set(`${cell.row},${cell.col}`, cell));
  return [...unique.values()];
}

function expandSpecialClears(
  board: Board,
  clearSet: Map<string, { row: number; col: number }>,
  alreadyActivated = new Set<string>(),
): void {
  const queue = [...clearSet.values()];
  for (let index = 0; index < queue.length; index += 1) {
    const { row, col } = queue[index];
    const key = `${row},${col}`;
    const cell = board[row][col];
    if (!cell?.special || alreadyActivated.has(key)) continue;
    alreadyActivated.add(key);
    for (const target of collectSpecialBlast(board, row, col, cell.special, cell.kind)) {
      const targetKey = `${target.row},${target.col}`;
      if (!clearSet.has(targetKey)) {
        clearSet.set(targetKey, target);
        queue.push(target);
      }
    }
  }
}

function chooseSpecialPivot(board: Board, match: MatchGroup): { row: number; col: number } {
  const candidates = [...match.cells];
  if (match.special === "queen") {
    const intersection = candidates.find(({ row, col }) => {
      let horizontal = 1;
      let vertical = 1;
      for (const direction of [-1, 1]) {
        for (let distance = 1; distance < BOARD_SIZE; distance += 1) {
          const horizontalCell = board[row]?.[col + distance * direction];
          if (!horizontalCell || horizontalCell.special || horizontalCell.kind !== match.kind) break;
          horizontal += 1;
        }
        for (let distance = 1; distance < BOARD_SIZE; distance += 1) {
          const verticalCell = board[row + distance * direction]?.[col];
          if (!verticalCell || verticalCell.special || verticalCell.kind !== match.kind) break;
          vertical += 1;
        }
      }
      return horizontal >= 3 && vertical >= 3;
    });
    if (intersection && (board[intersection.row][intersection.col]?.wax ?? 0) === 0) {
      return intersection;
    }
  }

  const centerIndex = Math.floor(candidates.length / 2);
  return (
    candidates
      .map((cell, index) => ({
        cell,
        distance: Math.abs(index - centerIndex),
      }))
      .sort((a, b) => a.distance - b.distance)
      .find(({ cell }) => (board[cell.row][cell.col]?.wax ?? 0) === 0)?.cell ??
    candidates[centerIndex]
  );
}

export function resolveOnce(board: Board, honeyPerTile: number): { board: Board; step: ResolveStep } | null {
  const next = cloneBoard(board);
  const clearSet = new Map<string, { row: number; col: number }>();
  const spawnSpecials: Array<{ row: number; col: number; special: SpecialKind; kind: NectarKind }> = [];

  const addClear = (row: number, col: number) => {
    clearSet.set(`${row},${col}`, { row, col });
  };

  // Activate specials that are part of a match or swapped — handled via match groups + specials adjacent to matches
  const matches = findMatches(next);
  if (matches.length === 0) {
    // Also clear if two specials... no matches — nothing to do
    return null;
  }

  for (const match of matches) {
    for (const cell of match.cells) addClear(cell.row, cell.col);
    if (match.special) {
      const pivot = chooseSpecialPivot(next, match);
      spawnSpecials.push({ ...pivot, special: match.special, kind: match.kind });
    }
  }

  expandSpecialClears(next, clearSet);

  const collected: Partial<Record<NectarKind, number>> = {};
  let honeyGained = 0;
  let waspsCleared = 0;
  let waxCleared = 0;
  let specialsSpawned = 0;

  for (const { row, col } of clearSet.values()) {
    const cell = next[row][col];
    if (!cell) continue;
    if (cell.wax > 0) {
      cell.wax -= 1;
      if (cell.wax === 0) waxCleared += 1;
      continue;
    }
    if (cell.wasp) waspsCleared += 1;
    collected[cell.kind] = (collected[cell.kind] ?? 0) + 1;
    honeyGained = roundHoney(honeyGained + honeyPerTile);
    next[row][col] = null;
  }

  for (const spawn of spawnSpecials) {
    if (next[spawn.row][spawn.col] === null) {
      next[spawn.row][spawn.col] = createCell(spawn.kind, { special: spawn.special });
      specialsSpawned += 1;
    }
  }

  // Gravity
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let write = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      if (next[row][col]) {
        if (write !== row) {
          next[write][col] = next[row][col];
          next[row][col] = null;
        }
        write -= 1;
      }
    }
    for (let row = write; row >= 0; row -= 1) {
      next[row][col] = createCell(randomKind(() => Math.random()));
    }
  }

  return {
    board: next,
    step: {
      cleared: [...clearSet.values()],
      honeyGained,
      specialsSpawned,
      waspsCleared,
      waxCleared,
      collected,
    },
  };
}

export function resolveBoard(
  board: Board,
  honeyPerTile: number,
  maxSteps = 40,
): { board: Board; steps: ResolveStep[] } {
  let current = cloneBoard(board);
  const steps: ResolveStep[] = [];
  for (let i = 0; i < maxSteps; i += 1) {
    const result = resolveOnce(current, honeyPerTile);
    if (!result) break;
    current = result.board;
    steps.push(result.step);
  }
  if (findMatches(current).length > 0) current = buildGuaranteedPlayableBoard(current);
  return { board: ensurePlayableBoard(current, Math.random), steps };
}

function activateSpecialSwap(
  board: Board,
  a: { row: number; col: number },
  b: { row: number; col: number },
  honeyPerTile: number,
): SwapResult {
  const next = cloneBoard(board);
  const cellA = next[a.row][a.col];
  const cellB = next[b.row][b.col];
  if (!cellA || !cellB) {
    return {
      ok: false,
      board,
      steps: [],
      honeyGained: 0,
      matchesMade: 0,
      beesSpawned: 0,
      waspsCleared: 0,
      waxCleared: 0,
      collected: {},
      movesSpent: 0,
    };
  }

  // Swap first
  next[a.row][a.col] = cellB;
  next[b.row][b.col] = cellA;

  const clearSet = new Map<string, { row: number; col: number }>();
  const add = (row: number, col: number) => clearSet.set(`${row},${col}`, { row, col });
  const activated = new Set<string>();

  if (cellA.special) {
    for (const c of collectSpecialBlast(next, b.row, b.col, cellA.special, cellB.kind)) add(c.row, c.col);
    activated.add(`${b.row},${b.col}`);
  }
  if (cellB.special) {
    for (const c of collectSpecialBlast(next, a.row, a.col, cellB.special, cellA.kind)) add(c.row, c.col);
    activated.add(`${a.row},${a.col}`);
  }
  expandSpecialClears(next, clearSet, activated);

  const collected: Partial<Record<NectarKind, number>> = {};
  let honeyGained = 0;
  let waspsCleared = 0;
  let waxCleared = 0;

  for (const { row, col } of clearSet.values()) {
    const cell = next[row][col];
    if (!cell) continue;
    if (cell.wax > 0) {
      cell.wax -= 1;
      if (cell.wax === 0) waxCleared += 1;
      continue;
    }
    if (cell.wasp) waspsCleared += 1;
    collected[cell.kind] = (collected[cell.kind] ?? 0) + 1;
    honeyGained = roundHoney(honeyGained + honeyPerTile);
    next[row][col] = null;
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let write = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      if (next[row][col]) {
        if (write !== row) {
          next[write][col] = next[row][col];
          next[row][col] = null;
        }
        write -= 1;
      }
    }
    for (let row = write; row >= 0; row -= 1) {
      next[row][col] = createCell(randomKind(() => Math.random()));
    }
  }

  const cascaded = resolveBoard(next, honeyPerTile);
  const steps: ResolveStep[] = [
    {
      cleared: [...clearSet.values()],
      honeyGained,
      specialsSpawned: 0,
      waspsCleared,
      waxCleared,
      collected,
    },
    ...cascaded.steps,
  ];

  const totals = summarizeSteps(steps);
  return {
    ok: true,
    board: cascaded.board,
    steps,
    ...totals,
    movesSpent: 1,
  };
}

function summarizeSteps(steps: ResolveStep[]) {
  let honeyGained = 0;
  let matchesMade = 0;
  let beesSpawned = 0;
  let waspsCleared = 0;
  let waxCleared = 0;
  const collected: Partial<Record<NectarKind, number>> = {};
  for (const step of steps) {
    honeyGained = roundHoney(honeyGained + step.honeyGained);
    matchesMade += step.cleared.length > 0 ? 1 : 0;
    beesSpawned += step.specialsSpawned;
    waspsCleared += step.waspsCleared;
    waxCleared += step.waxCleared;
    for (const [kind, count] of Object.entries(step.collected) as Array<[NectarKind, number]>) {
      collected[kind] = (collected[kind] ?? 0) + count;
    }
  }
  return { honeyGained, matchesMade, beesSpawned, waspsCleared, waxCleared, collected };
}

export function trySwap(
  board: Board,
  from: { row: number; col: number },
  to: { row: number; col: number },
  honeyPerTile: number,
): SwapResult {
  const inBounds = ({ row, col }: { row: number; col: number }) =>
    row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  if (!inBounds(from) || !inBounds(to) || !adjacent(from, to) || findMatches(board).length > 0) {
    return {
      ok: false,
      board,
      steps: [],
      honeyGained: 0,
      matchesMade: 0,
      beesSpawned: 0,
      waspsCleared: 0,
      waxCleared: 0,
      collected: {},
      movesSpent: 0,
    };
  }

  const a = board[from.row][from.col];
  const b = board[to.row][to.col];
  if (!a || !b) {
    return {
      ok: false,
      board,
      steps: [],
      honeyGained: 0,
      matchesMade: 0,
      beesSpawned: 0,
      waspsCleared: 0,
      waxCleared: 0,
      collected: {},
      movesSpent: 0,
    };
  }

  if (a.special || b.special) {
    return activateSpecialSwap(board, from, to, honeyPerTile);
  }

  const swapped = cloneBoard(board);
  swapped[from.row][from.col] = b;
  swapped[to.row][to.col] = a;

  const matches = findMatches(swapped);
  if (matches.length === 0) {
    return {
      ok: false,
      board,
      steps: [],
      honeyGained: 0,
      matchesMade: 0,
      beesSpawned: 0,
      waspsCleared: 0,
      waxCleared: 0,
      collected: {},
      movesSpent: 0,
    };
  }

  const resolved = resolveBoard(swapped, honeyPerTile);
  const totals = summarizeSteps(resolved.steps);
  return {
    ok: true,
    board: resolved.board,
    steps: resolved.steps,
    ...totals,
    movesSpent: 1,
  };
}

export function applyWaspTick(board: Board): { board: Board; eaten: number } {
  const next = cloneBoard(board);
  let eaten = 0;
  const wasps: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (next[row][col]?.wasp) wasps.push({ row, col });
    }
  }

  for (const wasp of wasps) {
    const neighbors = [
      { row: wasp.row - 1, col: wasp.col },
      { row: wasp.row + 1, col: wasp.col },
      { row: wasp.row, col: wasp.col - 1 },
      { row: wasp.row, col: wasp.col + 1 },
    ].filter(
      ({ row, col }) =>
        row >= 0 &&
        row < BOARD_SIZE &&
        col >= 0 &&
        col < BOARD_SIZE &&
        next[row][col] &&
        !next[row][col]!.wasp &&
        !next[row][col]!.special &&
        next[row][col]!.wax === 0,
    );
    if (neighbors.length === 0) continue;
    const target = neighbors[Math.floor(Math.random() * neighbors.length)];
    const safeKinds = NECTAR_KINDS.filter(
      (kind) => !createsMatchAt(next, target.row, target.col, kind),
    );
    const kind = safeKinds[Math.floor(Math.random() * safeKinds.length)] ?? randomKind(Math.random);
    next[target.row][target.col] = createCell(kind);
    eaten += 1;
  }

  return { board: ensurePlayableBoard(next, Math.random), eaten };
}

export function goalsCompleted(state: Pick<LevelState, "honey" | "collected" | "waxCleared" | "goals">): boolean {
  return state.goals.every((goal) => {
    if (goal.type === "honey") return state.honey >= goal.target;
    if (goal.type === "collect") return state.collected[goal.kind] >= goal.target;
    return state.waxCleared >= goal.target;
  });
}

export function createLevelState(level: number, upgrades: Upgrades = createDefaultUpgrades()): LevelState {
  const config = getLevelConfig(level, upgrades);
  return {
    level: config.level,
    board: createBoard(level * 97 + 13, config.waxCount, config.waspCount),
    movesLeft: config.moves,
    honey: 0,
    collected: createEmptyCollected(),
    waxCleared: 0,
    goals: config.goals,
    honeyPerTile: config.honeyPerTile,
    status: "playing",
  };
}

export function applySwapToLevel(state: LevelState, from: { row: number; col: number }, to: { row: number; col: number }): {
  state: LevelState;
  result: SwapResult;
} {
  if (state.status !== "playing" || state.movesLeft <= 0) {
    return {
      state,
      result: {
        ok: false,
        board: state.board,
        steps: [],
        honeyGained: 0,
        matchesMade: 0,
        beesSpawned: 0,
        waspsCleared: 0,
        waxCleared: 0,
        collected: {},
        movesSpent: 0,
      },
    };
  }

  const result = trySwap(state.board, from, to, state.honeyPerTile);
  if (!result.ok) return { state, result };

  let board = result.board;
  if (result.movesSpent > 0) {
    const tick = applyWaspTick(board);
    board = tick.board;
  }

  const collected = { ...state.collected };
  for (const [kind, count] of Object.entries(result.collected) as Array<[NectarKind, number]>) {
    collected[kind] += count;
  }

  const next: LevelState = {
    ...state,
    board,
    movesLeft: state.movesLeft - result.movesSpent,
    honey: roundHoney(state.honey + result.honeyGained),
    collected,
    waxCleared: state.waxCleared + result.waxCleared,
  };

  if (goalsCompleted(next)) {
    next.status = "won";
  } else if (next.movesLeft <= 0) {
    next.status = "lost";
  }

  return { state: next, result };
}

export function grantMoveBonus(state: LevelState, moves: number): LevelState {
  if (state.status === "won") return state;
  return {
    ...state,
    movesLeft: state.movesLeft + moves,
    status: "playing",
  };
}

export function levelClearReward(level: number): { coins: number; crystals: number } {
  const safe = Math.max(1, level);
  return {
    coins: 40 + safe * 8,
    crystals: safe % 5 === 0 ? 1 : 0,
  };
}

export function refreshDaily(daily: DailyProgress, date = getLocalDateKey()): DailyProgress {
  if (daily.date === date) return daily;
  return createDefaultDaily(date);
}

export function refreshRewards(rewards: RewardLimits, date = getLocalDateKey()): RewardLimits {
  if (rewards.date === date) return rewards;
  return createDefaultRewards(date);
}

export function isValidNectar(value: unknown): value is NectarKind {
  return isNectarKind(value);
}

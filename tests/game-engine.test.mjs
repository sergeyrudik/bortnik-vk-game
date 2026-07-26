import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_SIZE,
  MAX_UPGRADE_LEVELS,
  applyWaspTick,
  applySwapToLevel,
  createBoard,
  createCell,
  createDefaultSave,
  createLevelState,
  findAvailableSwap,
  findMatches,
  getLevelConfig,
  getLocalDateKey,
  getUpgradeCost,
  goalsCompleted,
  grantMoveBonus,
  hasAvailableSwap,
  levelClearReward,
  migrateSave,
  refreshDaily,
  refreshRewards,
  resolveOnce,
  resolveBoard,
  selectNewestSave,
  serializeSave,
  trySwap,
} from "../app/game-engine.ts";

const palette = ["linden", "buckwheat", "clover", "sunflower", "fireweed"];

function fillStablePattern(board) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      board[row][col] = createCell(palette[(row * 2 + col) % palette.length]);
    }
  }
}

test("createBoard has no starting matches and correct size", () => {
  assert.equal(BOARD_SIZE, 6);
  const board = createBoard(42, 0, 0);
  assert.equal(board.length, BOARD_SIZE);
  assert.equal(board[0].length, BOARD_SIZE);
  assert.equal(findMatches(board).length, 0);
  assert.equal(hasAvailableSwap(board), true);
});

test("generated 6×6 boards stay stable and playable across seeds", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const board = createBoard(seed, seed % 8, seed % 4);
    assert.equal(board.length, 6);
    assert.equal(board.every((row) => row.length === 6), true);
    assert.equal(findMatches(board).length, 0);
    assert.equal(hasAvailableSwap(board), true);
  }
});

test("createBoard reshuffles a generated board without available swaps", () => {
  const board = createBoard(241, 0, 0);
  assert.equal(findMatches(board).length, 0);
  assert.equal(hasAvailableSwap(board), true);
});

test("createBoard places wax and wasps", () => {
  const board = createBoard(7, 4, 2);
  let wax = 0;
  let wasps = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell?.wax) wax += 1;
      if (cell?.wasp) wasps += 1;
    }
  }
  assert.equal(wax, 4);
  assert.equal(wasps, 2);
});

test("trySwap rejects non-adjacent and non-matching swaps", () => {
  const board = createBoard(11, 0, 0);
  const miss = trySwap(board, { row: 0, col: 0 }, { row: 2, col: 2 }, 1);
  assert.equal(miss.ok, false);

  // Force a non-matching adjacent swap by cloning and swapping identical kinds until fail is likely
  const a = board[0][0];
  const b = board[0][1];
  assert.ok(a && b);
  if (a.kind === b.kind) {
    board[0][1] = createCell(a.kind === "linden" ? "clover" : "linden");
  }
  // Ensure no match after swap of 0,0 and 0,1 by filling unique-ish pattern
  const kinds = ["linden", "buckwheat", "clover", "sunflower", "fireweed"];
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    board[0][col] = createCell(kinds[col % kinds.length]);
    board[1][col] = createCell(kinds[(col + 2) % kinds.length]);
    board[2][col] = createCell(kinds[(col + 1) % kinds.length]);
  }
  const noMatch = trySwap(board, { row: 0, col: 0 }, { row: 0, col: 1 }, 1);
  assert.equal(noMatch.ok, false);
});

test("trySwap clears a horizontal match of three", () => {
  const board = createBoard(3, 0, 0);
  // Fill with a cycle of 5 that never makes 3-in-a-row horizontally or vertically.
  fillStablePattern(board);
  // Controlled setup: swap (4,3) linden up into (3,3) to make three lindens on row 3.
  board[3][2] = createCell("linden");
  board[3][3] = createCell("buckwheat");
  board[3][4] = createCell("linden");
  board[3][5] = createCell("sunflower");
  board[4][3] = createCell("linden");
  board[2][3] = createCell("clover");
  board[3][1] = createCell("fireweed");
  board[4][2] = createCell("buckwheat");
  board[4][4] = createCell("sunflower");

  const before = findMatches(board);
  assert.equal(before.length, 0);

  const result = trySwap(board, { row: 3, col: 3 }, { row: 4, col: 3 }, 2);
  assert.equal(result.ok, true);
  assert.ok(result.honeyGained >= 6);
  assert.ok(result.matchesMade >= 1);
});

test("resolveBoard cascades until stable", () => {
  const board = createBoard(99, 0, 0);
  const bottomRow = BOARD_SIZE - 1;
  const rowAbove = BOARD_SIZE - 2;
  for (let col = 0; col < 3; col += 1) {
    board[bottomRow][col] = createCell("clover");
  }
  // Avoid vertical accidental matches above
  board[rowAbove][0] = createCell("linden");
  board[rowAbove][1] = createCell("buckwheat");
  board[rowAbove][2] = createCell("sunflower");
  const { steps } = resolveBoard(board, 1);
  assert.ok(steps.length >= 1);
});

test("level config and rewards scale with level", () => {
  const early = getLevelConfig(1);
  const mid = getLevelConfig(10);
  assert.ok(mid.moves >= early.moves);
  assert.ok(levelClearReward(10).coins > levelClearReward(1).coins);
  assert.equal(getUpgradeCost(0), 3);
  assert.equal(getUpgradeCost(2), 7);
});

test("applySwapToLevel spends moves and can win", () => {
  const state = createLevelState(1);
  state.goals = [{ type: "honey", target: 1 }];
  state.honeyPerTile = 10;
  state.movesLeft = 5;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      state.board[row][col] = createCell(palette[(row + col * 2) % palette.length]);
    }
  }
  state.board[3][2] = createCell("linden");
  state.board[3][3] = createCell("buckwheat");
  state.board[3][4] = createCell("linden");
  state.board[3][5] = createCell("linden");
  state.board[4][3] = createCell("linden");

  const { state: next, result } = applySwapToLevel(state, { row: 3, col: 3 }, { row: 4, col: 3 });
  assert.equal(result.ok, true);
  assert.equal(next.movesLeft, 4);
  assert.ok(next.honey >= 1);
  assert.equal(next.status, "won");
});

test("grantMoveBonus restores lost level", () => {
  const state = createLevelState(2);
  state.status = "lost";
  state.movesLeft = 0;
  const restored = grantMoveBonus(state, 5);
  assert.equal(restored.status, "playing");
  assert.equal(restored.movesLeft, 5);
});

test("save migrate and newest selection", () => {
  assert.equal(migrateSave("not-json"), null);
  const a = createDefaultSave();
  a.updatedAt = 100;
  a.level = 3;
  const b = migrateSave(serializeSave({ ...a, updatedAt: 200, level: 5 }));
  assert.ok(b);
  assert.equal(b.level, 5);
  const newest = selectNewestSave(a, b);
  assert.equal(newest?.level, 5);
});

test("daily date key uses the local calendar day", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "Europe/Samara";
  try {
    assert.equal(getLocalDateKey(new Date("2026-01-01T21:30:00.000Z")), "2026-01-02");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("daily and rewarded limits reset only after the local date changes", () => {
  const daily = {
    date: "2026-07-26",
    match: 12,
    level: 2,
    wasp: 3,
    claimed: ["match"],
  };
  const rewards = { date: "2026-07-26", count: 3, lastRewardAt: 1234 };
  assert.equal(refreshDaily(daily, "2026-07-26"), daily);
  assert.equal(refreshRewards(rewards, "2026-07-26"), rewards);
  assert.deepEqual(refreshDaily(daily, "2026-07-27"), {
    date: "2026-07-27",
    match: 0,
    level: 0,
    wasp: 0,
    claimed: [],
  });
  assert.deepEqual(refreshRewards(rewards, "2026-07-27"), {
    date: "2026-07-27",
    count: 0,
    lastRewardAt: 0,
  });
});

test("save migration preserves timestamps and an active level", () => {
  const save = createDefaultSave();
  save.updatedAt = 1_800_000_000_000;
  save.rewards.lastRewardAt = 1_799_999_999_000;
  save.lastInterstitialAt = 1_799_999_998_000;
  save.levelState = createLevelState(1);
  save.levelState.movesLeft -= 1;
  save.levelState.honey = 3.3;
  save.stats.honeyCollected = 3.3;

  const migrated = migrateSave(JSON.stringify(save));
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.updatedAt, save.updatedAt);
  assert.equal(migrated.rewards.lastRewardAt, save.rewards.lastRewardAt);
  assert.equal(migrated.lastInterstitialAt, save.lastInterstitialAt);
  assert.equal(migrated.levelState?.movesLeft, save.levelState.movesLeft);
  assert.equal(migrated.levelState?.honey, 3.3);
  assert.equal(migrated.stats.honeyCollected, 3.3);
  assert.deepEqual(migrated.levelState?.board, save.levelState.board);
});

test("legacy saves migrate to version 2 and incompatible boards restart", () => {
  const legacy = createDefaultSave();
  legacy.version = 1;
  delete legacy.levelState;
  delete legacy.pendingReward;
  delete legacy.lastInterstitialAt;
  const migratedLegacy = migrateSave(JSON.stringify(legacy));
  assert.ok(migratedLegacy);
  assert.equal(migratedLegacy.version, 2);
  assert.equal(migratedLegacy.levelState, null);

  const incompatible = createDefaultSave();
  incompatible.levelState = {
    ...createLevelState(1),
    board: Array.from({ length: 8 }, () => Array(8).fill(null)),
  };
  const migratedIncompatible = migrateSave(JSON.stringify(incompatible));
  assert.ok(migratedIncompatible);
  assert.equal(migratedIncompatible.levelState, null);
});

test("nectar upgrades increase yield without increasing the goal", () => {
  const base = getLevelConfig(10);
  for (let nectar = 1; nectar <= MAX_UPGRADE_LEVELS.nectar; nectar += 1) {
    const upgraded = getLevelConfig(10, { combs: 0, nectar, smoke: 0 });
    assert.equal(upgraded.goals[0].target, base.goals[0].target);
    assert.equal(upgraded.honeyPerTile, 1 + nectar / 10);
  }

  const board = createBoard(9);
  fillStablePattern(board);
  board[5][0] = createCell("linden");
  board[5][1] = createCell("linden");
  board[5][2] = createCell("linden");
  const resolved = resolveOnce(board, 1.1);
  assert.ok(resolved);
  assert.equal(resolved.step.honeyGained, 3.3);
});

test("special blasts trigger chained specials", () => {
  const board = createBoard(17);
  fillStablePattern(board);
  board[2][1] = createCell("clover", { special: "bee" });
  board[2][2] = createCell("linden");
  board[2][4] = createCell("fireweed", { special: "bee" });
  assert.equal(findMatches(board).length, 0);

  const result = trySwap(board, { row: 2, col: 1 }, { row: 2, col: 2 }, 1);
  assert.equal(result.ok, true);
  assert.ok(
    result.steps[0].cleared.some(({ row, col }) => row === 0 && col === 4),
    "the second bee should clear its column",
  );
});

test("matches of four, five and a T create the advertised specials", () => {
  const four = createBoard(31);
  fillStablePattern(four);
  for (let col = 0; col < 4; col += 1) four[5][col] = createCell("linden");
  const fourResolved = resolveOnce(four, 1);
  assert.ok(fourResolved);
  assert.equal(
    fourResolved.board.flat().filter((cell) => cell?.special === "bee").length,
    1,
  );

  const five = createBoard(32);
  fillStablePattern(five);
  for (let col = 0; col < 5; col += 1) five[5][col] = createCell("clover");
  const fiveResolved = resolveOnce(five, 1);
  assert.ok(fiveResolved);
  assert.equal(
    fiveResolved.board.flat().filter((cell) => cell?.special === "pot").length,
    1,
  );

  const tee = createBoard(33);
  fillStablePattern(tee);
  tee[2][1] = createCell("fireweed");
  tee[2][2] = createCell("fireweed");
  tee[2][3] = createCell("fireweed");
  tee[1][2] = createCell("fireweed");
  tee[3][2] = createCell("fireweed");
  assert.equal(findMatches(tee).some((match) => match.special === "queen"), true);
  const teeResolved = resolveOnce(tee, 1);
  assert.ok(teeResolved);
  const queen = teeResolved.board
    .flatMap((cells, row) =>
      cells.map((cell, col) => (cell?.special === "queen" ? { row, col } : null)),
    )
    .find(Boolean);
  assert.deepEqual(queen, { row: 3, col: 2 });
});

test("wax layers, goal checks and defeat at zero moves behave consistently", () => {
  const waxBoard = createBoard(41);
  fillStablePattern(waxBoard);
  for (let col = 0; col < 3; col += 1) {
    waxBoard[5][col] = createCell("buckwheat", { wax: 2 });
  }
  const firstLayer = resolveOnce(waxBoard, 1);
  assert.ok(firstLayer);
  assert.equal(firstLayer.step.waxCleared, 0);
  assert.equal(firstLayer.board[5][0]?.wax, 1);
  const secondLayer = resolveOnce(firstLayer.board, 1);
  assert.ok(secondLayer);
  assert.equal(secondLayer.step.waxCleared, 3);
  assert.equal(secondLayer.board[5][0]?.wax, 0);

  assert.equal(
    goalsCompleted({
      honey: 10,
      collected: { linden: 3, buckwheat: 0, clover: 0, sunflower: 0, fireweed: 0 },
      waxCleared: 2,
      goals: [
        { type: "honey", target: 10 },
        { type: "collect", kind: "linden", target: 3 },
        { type: "wax", target: 2 },
      ],
    }),
    true,
  );

  const losing = createLevelState(1);
  losing.movesLeft = 1;
  losing.goals = [{ type: "honey", target: 1_000 }];
  const move = findAvailableSwap(losing.board);
  assert.ok(move);
  const lost = applySwapToLevel(losing, move.from, move.to).state;
  assert.equal(lost.movesLeft, 0);
  assert.equal(lost.status, "lost");
});

test("wasp ticks keep the board stable and playable", () => {
  const previousRandom = Math.random;
  let state = 123456789;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    for (let seed = 1; seed <= 500; seed += 1) {
      const tick = applyWaspTick(createBoard(seed, 0, 3));
      assert.equal(findMatches(tick.board).length, 0);
      assert.equal(hasAvailableSwap(tick.board), true);
    }
  } finally {
    Math.random = previousRandom;
  }
});

test("cascade guard and invalid coordinates return safe boards", () => {
  const board = createBoard(21);
  fillStablePattern(board);
  board[5][0] = createCell("linden");
  board[5][1] = createCell("linden");
  board[5][2] = createCell("linden");

  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    const resolved = resolveBoard(board, 1, 2);
    assert.equal(findMatches(resolved.board).length, 0);
    assert.equal(hasAvailableSwap(resolved.board), true);
  } finally {
    Math.random = previousRandom;
  }

  const invalid = trySwap(board, { row: -1, col: 0 }, { row: 0, col: 0 }, 1);
  assert.equal(invalid.ok, false);
});

test("upgrade levels are capped consistently", () => {
  const save = createDefaultSave();
  save.upgrades = { combs: 99, nectar: 99, smoke: 99 };
  const migrated = migrateSave(JSON.stringify(save));
  assert.deepEqual(migrated?.upgrades, MAX_UPGRADE_LEVELS);

  const capped = getLevelConfig(30, { combs: 99, nectar: 99, smoke: 99 });
  const expected = getLevelConfig(30, MAX_UPGRADE_LEVELS);
  assert.deepEqual(capped, expected);
  assert.equal(getLevelConfig(30).goals[0].target, 130);
  assert.equal(getLevelConfig(30).moves, 30);
});

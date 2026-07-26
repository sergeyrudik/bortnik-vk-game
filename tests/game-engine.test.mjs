import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_SIZE,
  applySwapToLevel,
  createBoard,
  createCell,
  createDefaultSave,
  createLevelState,
  findMatches,
  getLevelConfig,
  getUpgradeCost,
  grantMoveBonus,
  levelClearReward,
  migrateSave,
  resolveBoard,
  selectNewestSave,
  serializeSave,
  trySwap,
} from "../app/game-engine.ts";

test("createBoard has no starting matches and correct size", () => {
  const board = createBoard(42, 0, 0);
  assert.equal(board.length, BOARD_SIZE);
  assert.equal(board[0].length, BOARD_SIZE);
  assert.equal(findMatches(board).length, 0);
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
  const palette = ["linden", "buckwheat", "clover", "sunflower", "fireweed"];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      board[row][col] = createCell(palette[(row * 2 + col) % palette.length]);
    }
  }
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
  for (let col = 0; col < 3; col += 1) {
    board[7][col] = createCell("clover");
  }
  // Avoid vertical accidental matches above
  board[6][0] = createCell("linden");
  board[6][1] = createCell("buckwheat");
  board[6][2] = createCell("sunflower");
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

  const palette = ["linden", "buckwheat", "clover", "sunflower", "fireweed"];
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

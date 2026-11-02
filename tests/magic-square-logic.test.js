const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../magic-square-logic.js");

const lines = (g) => [
  ...g,
  ...[0, 1, 2].map((c) => g.map((r) => r[c])),
  [g[0][0], g[1][1], g[2][2]],
  [g[0][2], g[1][1], g[2][0]],
];

test("there are exactly 8 distinct valid magic squares, all 1-9 once with every line = 15", () => {
  assert.equal(M.SQUARES.length, 8);
  assert.equal(new Set(M.SQUARES.map((g) => g.flat().join(""))).size, 8);
  for (const g of M.SQUARES) {
    assert.equal(g.flat().slice().sort().join(""), "123456789");
    for (const line of lines(g)) assert.equal(line.reduce((a, b) => a + b), 15);
  }
});

test("brute force confirms no other 3x3 magic square exists", () => {
  let count = 0;
  const used = Array(10).fill(false);
  const cur = [];
  (function rec() {
    if (cur.length === 9) {
      const g = [cur.slice(0, 3), cur.slice(3, 6), cur.slice(6)];
      if (lines(g).every((l) => l[0] + l[1] + l[2] === 15)) count++;
      return;
    }
    for (let d = 1; d <= 9; d++) {
      if (used[d]) continue;
      used[d] = true;
      cur.push(d);
      rec();
      cur.pop();
      used[d] = false;
    }
  })();
  assert.equal(count, 8);
});

test("isDigit accepts only 1-9", () => {
  for (const ok of ["1", "5", "9", 7]) assert.equal(M.isDigit(ok), true);
  for (const bad of ["0", "a", "", " ", "10", "-1", "."]) assert.equal(M.isDigit(bad), false);
});

test("hasDuplicate checks the whole grid, ignoring the cell itself", () => {
  const g = M.emptyGrid();
  g[0][0] = 5;
  assert.equal(M.hasDuplicate(g, 0, 1, 5), true); // same row
  assert.equal(M.hasDuplicate(g, 1, 0, 5), true); // same column
  assert.equal(M.hasDuplicate(g, 1, 1, 5), true); // diagonal
  assert.equal(M.hasDuplicate(g, 1, 2, 5), true); // shares no line
  assert.equal(M.hasDuplicate(g, 0, 0, 5), false); // itself
  assert.equal(M.hasDuplicate(g, 2, 2, 4), false);
});

test("canComplete: consistent entries yes, impossible entries no", () => {
  assert.equal(M.canComplete(M.emptyGrid()), true);
  const ok = M.emptyGrid();
  ok[1][1] = 5;
  ok[0][0] = 2;
  assert.equal(M.canComplete(ok), true);
  const bad1 = M.emptyGrid();
  bad1[1][1] = 4; // centre must be 5
  assert.equal(M.canComplete(bad1), false);
  const bad2 = M.emptyGrid();
  bad2[0][0] = 5; // corners are even
  assert.equal(M.canComplete(bad2), false);
  const bad3 = M.emptyGrid();
  bad3[0][0] = 2;
  bad3[0][1] = 3; // 2 then 3 along a row is in no square
  assert.equal(M.canComplete(bad3), false);
});

test("isMagic / isFull", () => {
  assert.equal(M.isMagic(M.SQUARES[3]), true);
  const almost = M.SQUARES[0].map((r) => r.slice());
  [almost[0][0], almost[0][1]] = [almost[0][1], almost[0][0]];
  assert.equal(M.isFull(almost), true);
  assert.equal(M.isMagic(almost), false);
  assert.equal(M.isMagic(M.emptyGrid()), false);
});

test("generatePuzzle (easy): at least 3 givens, givens match the solution, exactly one completion", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const { puzzle, solution } = M.generatePuzzle();
    const n = M.countFilled(puzzle);
    assert.ok(n >= 3 && n <= 5, `got ${n} givens`); // easy difficulty: at least 3
    assert.equal(M.matching(puzzle).length, 1);
    assert.deepEqual(M.matching(puzzle)[0], solution);
    puzzle.forEach((row, r) => row.forEach((v, c) => v && assert.equal(v, solution[r][c])));
    seen.add(solution.flat().join(""));
  }
  assert.ok(seen.size > 1, "should vary across the 8 squares");
});

test("generatePuzzle still terminates with a unique puzzle for adversarial randomness", () => {
  const { puzzle } = M.generatePuzzle(() => 0);
  assert.equal(M.matching(puzzle).length, 1);
});

test("solution prefers a completion that matches the player's entries", () => {
  const givens = M.emptyGrid();
  givens[1][1] = 5; // 8 completions
  const target = M.SQUARES[5];
  const entries = givens.map((r) => r.slice());
  entries[0][0] = target[0][0];
  entries[0][1] = target[0][1];
  assert.deepEqual(M.solution(givens, entries), target);
  const stray = givens.map((r) => r.slice());
  stray[0][0] = 5; // matches no square: falls back to the givens
  assert.ok(M.solution(givens, stray));
  const impossible = M.emptyGrid();
  impossible[0][0] = 5;
  assert.equal(M.solution(impossible, null), null);
});

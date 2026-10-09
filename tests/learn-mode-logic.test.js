const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../learn-mode-logic.js");

function fullyValid(grid) {
  const want = "1234";
  const sorted = (cells) => cells.slice().sort().join("");
  for (let i = 0; i < 4; i++) {
    if (sorted(grid[i]) !== want) return false;
    if (sorted(grid.map((row) => row[i])) !== want) return false;
  }
  for (let br = 0; br < 4; br += 2) {
    for (let bc = 0; bc < 4; bc += 2) {
      const box = [grid[br][bc], grid[br][bc + 1], grid[br + 1][bc], grid[br + 1][bc + 1]];
      if (sorted(box) !== want) return false;
    }
  }
  return true;
}

test("generated puzzles: valid solution, unique, only digits 1-4, beginner-friendly", () => {
  for (let i = 0; i < 100; i++) {
    const { puzzle, solution } = L.generatePuzzle();
    assert.equal(puzzle.length, 4);
    assert.ok(puzzle.every((row) => row.length === 4));
    assert.ok(fullyValid(solution), "solution is a valid 4x4 grid");
    assert.ok(puzzle.flat().every((v) => v >= 0 && v <= 4), "only 0-4");
    puzzle.forEach((row, r) => row.forEach((v, c) => v && assert.equal(v, solution[r][c])));
    assert.equal(L.countSolutions(puzzle, 5), 1, "exactly one solution");
    assert.ok(L.solvableBySingles(puzzle), "no guessing needed");
    const clues = puzzle.flat().filter((v) => v !== 0).length;
    assert.ok(clues >= 8 && clues <= 10, `clue count ${clues} is beginner-friendly`);
  }
});

test("generator produces different puzzles", () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(JSON.stringify(L.generatePuzzle().puzzle));
  assert.ok(seen.size > 1);
});

test("solver: solves, detects multiple/zero solutions, rejects bad digits", () => {
  assert.equal(L.countSolutions(Array.from({ length: 4 }, () => Array(4).fill(0)), 2), 2);
  assert.equal(L.countSolutions([[1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 0);
  assert.equal(L.countSolutions([[5, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 0);
  const { puzzle } = L.generatePuzzle();
  const copy = puzzle.map((r) => r.slice());
  assert.ok(L.solve(copy));
  assert.ok(fullyValid(copy));
});

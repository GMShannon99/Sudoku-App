// Puzzle generation for all four combinations of LEVEL (number range: 1 or 2)
// and DIFFICULTY ("easy" = at least 3 givens, "hard" = exactly 2).
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../magic-square-logic.js");

const completions = (puzzle, level) => (level === 2 ? M.level2Matching(puzzle) : M.matching(puzzle));
const key = (g) => g.flat().join(",");
const RUNS = 300;

function checkCommon(puzzle, solution, level) {
  assert.equal(M.isMagic(solution, level), true);
  puzzle.forEach((row, r) => row.forEach((v, c) => v && assert.equal(v, solution[r][c])));
  assert.ok(completions(puzzle, level).some((sq) => key(sq) === key(solution)), "solution must fit the givens");
}

for (const level of [1, 2]) {
  test(`level ${level}, easy: at least 3 givens (starts at 3), always exactly one solution`, () => {
    const counts = {};
    for (let i = 0; i < RUNS; i++) {
      const { puzzle, solution } = M.generatePuzzle(Math.random, level, "easy");
      const n = M.countFilled(puzzle);
      counts[n] = (counts[n] || 0) + 1;
      assert.ok(n >= 3, `got ${n} givens`);
      checkCommon(puzzle, solution, level);
      assert.equal(completions(puzzle, level).length, 1);
    }
    assert.ok(counts[3] > 0, "most puzzles should need only 3: " + JSON.stringify(counts));
    console.log(`level ${level} easy givens over ${RUNS} puzzles:`, JSON.stringify(counts));
  });
}

test("level 1, hard: exactly 2 givens and exactly one solution (checked against the 8 squares)", () => {
  for (let i = 0; i < RUNS; i++) {
    const { puzzle, solution } = M.generatePuzzle(Math.random, 1, "hard");
    assert.equal(M.countFilled(puzzle), 2);
    checkCommon(puzzle, solution, 1);
    assert.equal(M.matching(puzzle).length, 1);
  }
});

test("level 2, hard: exactly 2 givens from a valid square; uniqueness is not required", () => {
  const sizes = [];
  for (let i = 0; i < RUNS; i++) {
    const { puzzle, solution } = M.generatePuzzle(Math.random, 2, "hard");
    assert.equal(M.countFilled(puzzle), 2);
    checkCommon(puzzle, solution, 2);
    sizes.push(M.level2Matching(puzzle).length);
  }
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const unique = sizes.filter((n) => n === 1).length;
  assert.ok(sizes.every((n) => n >= 1));
  assert.ok(Math.max(...sizes) > 1, "usually several completions exist");
  console.log(
    `level 2 hard completions over ${RUNS} puzzles: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}, mean ${mean.toFixed(1)}, unique ${unique}`
  );
});

test("level 2, hard: of every possible 2-given puzzle, how many are unique (computed, not assumed)", () => {
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push([r, c]);
  let total = 0;
  let unique = 0;
  let max = 0;
  for (const sq of M.level2Matching(M.emptyGrid())) {
    for (let i = 0; i < 9; i++) {
      for (let j = i + 1; j < 9; j++) {
        const g = M.emptyGrid();
        for (const [r, c] of [cells[i], cells[j]]) g[r][c] = sq[r][c];
        const n = M.level2Matching(g).length;
        total++;
        if (n === 1) unique++;
        max = Math.max(max, n);
      }
    }
  }
  console.log(`level 2: ${total} possible 2-given puzzles, ${unique} unique, up to ${max} completions`);
  assert.ok(total > 0 && max >= 1);
});

test("generation terminates quickly and stays valid for adversarial randomness, all four combinations", () => {
  let n = 0;
  const cycling = () => ((n = (n * 7 + 3) % 10) + 0.5) / 10;
  for (const level of [1, 2]) {
    for (const difficulty of ["easy", "hard"]) {
      for (const rng of [() => 0, () => 0.999999, cycling]) {
        const { puzzle, solution } = M.generatePuzzle(rng, level, difficulty);
        checkCommon(puzzle, solution, level);
        if (difficulty === "hard") assert.equal(M.countFilled(puzzle), 2);
        else assert.ok(M.countFilled(puzzle) >= 3 && completions(puzzle, level).length === 1);
        if (!(level === 2 && difficulty === "hard")) assert.equal(completions(puzzle, level).length, 1);
      }
      const t = Date.now();
      for (let i = 0; i < 500; i++) M.generatePuzzle(Math.random, level, difficulty);
      assert.ok(Date.now() - t < 3000, `level ${level} ${difficulty}: 500 puzzles took ${Date.now() - t}ms`);
    }
  }
});

test("the defaults are level 1 / easy", () => {
  const { puzzle } = M.generatePuzzle();
  assert.ok(M.countFilled(puzzle) >= 3);
  assert.equal(M.matching(puzzle).length, 1);
});

test("level 2 solution prefers a completion matching the player's entries (several completions)", () => {
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const { puzzle } = M.generatePuzzle(Math.random, 2, "hard");
    const all = M.level2Matching(puzzle);
    if (all.length < 2) continue;
    const target = all[all.length - 1];
    const entries = puzzle.map((row) => row.slice());
    // copy two non-given cells of the target in, so the entries pin down a completion
    let added = 0;
    for (let r = 0; r < 3 && added < 3; r++) {
      for (let c = 0; c < 3 && added < 3; c++) {
        if (!entries[r][c]) { entries[r][c] = target[r][c]; added++; }
      }
    }
    const shown = M.solution(puzzle, entries, 2);
    assert.equal(M.isMagic(shown, 2), true);
    assert.ok(shown.every((row, r) => row.every((v, c) => !entries[r][c] || entries[r][c] === v)), "must match the entries");
    assert.ok(shown.every((row, r) => row.every((v, c) => !puzzle[r][c] || puzzle[r][c] === v)), "must match the givens");
    checked++;
  }
  assert.ok(checked > 0, "need puzzles with several completions to test this");
});

/*
 * MAGIC SQUARES -- pure 3x3 magic square logic.
 *
 * Like learn-mode-logic.js this has no DOM knowledge -- plain 3x3 arrays of
 * numbers (0 = empty) -- so it's testable under Node.
 *
 * Two independent choices:
 *   LEVEL (the number range): 1 = digits 1-9 once each, every row, column
 *   and both long diagonals summing to 15 (the 8 squares below); 2 = nine
 *   distinct whole numbers 1-20, every line the same total but not a fixed
 *   one.
 *   DIFFICULTY ("easy" or "hard"): only how many givens a generated puzzle
 *   shows (see magicGeneratePuzzle).
 * Every function that depends on the level takes it as an argument defaulting
 * to 1.
 *
 * To remove Magic Squares entirely: delete magic-square-*.js /
 * magic-square.css, the "MAGIC SQUARES" blocks in index.html, and the
 * version/README lines that mention it.
 */

const MAGIC_SIZE = 3;
const MAGIC_SUM = 15;

// All 8 valid 3x3 magic squares: the four rotations of one square plus
// their mirror images. Built (and de-duplicated) rather than hard-coded so
// the symmetry claim is checked by the tests, not trusted.
function magicBuildAll() {
  const rotate = (g) => g[0].map((_, c) => g.map((row) => row[c]).reverse());
  const mirror = (g) => g.map((row) => row.slice().reverse());
  let g = [
    [2, 7, 6],
    [9, 5, 1],
    [4, 3, 8],
  ];
  const seen = new Map();
  for (let i = 0; i < 4; i++) {
    for (const variant of [g, mirror(g)]) seen.set(variant.flat().join(""), variant);
    g = rotate(g);
  }
  return Array.from(seen.values());
}

const MAGIC_SQUARES = magicBuildAll();

function magicIsDigit(value) {
  return /^[1-9]$/.test(String(value));
}

function magicEmptyGrid() {
  return Array.from({ length: MAGIC_SIZE }, () => Array(MAGIC_SIZE).fill(0));
}

// Is `value` already used anywhere in the grid other than (row, col)? Both
// levels use each number at most once, so this covers every row, column
// and diagonal a repeat could share and also repeats that share none.
function magicHasDuplicate(grid, row, col, value) {
  const v = Number(value);
  for (let r = 0; r < MAGIC_SIZE; r++) {
    for (let c = 0; c < MAGIC_SIZE; c++) {
      if ((r !== row || c !== col) && grid[r][c] === v) return true;
    }
  }
  return false;
}

// Level-1 squares that agree with every non-zero entry of `grid`.
function magicMatching(grid) {
  return MAGIC_SQUARES.filter((sq) =>
    sq.every((rowVals, r) => rowVals.every((v, c) => grid[r][c] === 0 || grid[r][c] === v))
  );
}

function magicCanComplete(grid) {
  return magicMatching(grid).length > 0;
}

function magicCountFilled(grid) {
  return grid.flat().filter((v) => v !== 0).length;
}

function magicIsFull(grid) {
  return grid.flat().every((v) => v !== 0);
}

// Full grid that is a real level-1 magic square (1-9 once each, all 8 lines = 15).
function magicIsMagic(grid) {
  return magicIsFull(grid) && magicMatching(grid).length === 1;
}

function magicShuffled(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// LEVEL 2. Any 3x3 magic square (distinct entries, any total) is fixed by
// its centre c and two offsets a, b:
//     c+a    c-a-b   c+b
//     c-a+b  c       c+a-b
//     c-b    c+a+b   c-a
// so every level-2 square can be enumerated as (c, a, b) with all nine
// values distinct and inside 1..20.
// ---------------------------------------------------------------------------
const MAGIC_LEVEL2_MAX = 20;

function magicLevel2Cells(c, a, b) {
  return [c + a, c - a - b, c + b, c - a + b, c, c + a - b, c - b, c + a + b, c - a];
}

// Valid level-2 squares (as 3x3 grids) that agree with every non-zero entry of
// `grid`, in a fixed order (c, then a, then b ascending). Stops after `limit`.
function magicLevel2Matching(grid, limit = Infinity) {
  const flat = grid.flat();
  const found = [];
  const seen = new Uint8Array(MAGIC_LEVEL2_MAX + 1);
  for (let c = 1; c <= MAGIC_LEVEL2_MAX; c++) {
    if (flat[4] !== 0 && flat[4] !== c) continue;
    const r = Math.min(c - 1, MAGIC_LEVEL2_MAX - c);
    for (let a = -r; a <= r; a++) {
      if (a === 0) continue;
      for (let b = -r; b <= r; b++) {
        const v = magicLevel2Cells(c, a, b);
        let ok = true;
        for (let i = 0; i < 9 && ok; i++) {
          if (flat[i] !== 0 && flat[i] !== v[i]) ok = false;
        }
        if (!ok) continue;
        seen.fill(0);
        for (let i = 0; i < 9 && ok; i++) {
          if (v[i] < 1 || v[i] > MAGIC_LEVEL2_MAX || seen[v[i]]) ok = false;
          else seen[v[i]] = 1;
        }
        if (!ok) continue;
        found.push([v.slice(0, 3), v.slice(3, 6), v.slice(6)]);
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}

// Full grid of nine distinct whole numbers 1-20 whose rows, columns and both
// diagonals all share one total.
function magicLevel2IsMagic(grid) {
  const flat = grid.flat();
  if (flat.length !== 9) return false;
  if (!flat.every((v) => Number.isInteger(v) && v >= 1 && v <= MAGIC_LEVEL2_MAX)) return false;
  if (new Set(flat).size !== 9) return false;
  const g = grid;
  const sums = [
    ...g.map((row) => row[0] + row[1] + row[2]),
    ...[0, 1, 2].map((c) => g[0][c] + g[1][c] + g[2][c]),
    g[0][0] + g[1][1] + g[2][2],
    g[0][2] + g[1][1] + g[2][0],
  ];
  return sums.every((t) => t === sums[0]);
}

// A random valid level-2 square: draw (c, a, b) until all nine values are legal.
function magicLevel2RandomSquare(rng) {
  const pick = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  for (let tries = 0; tries < 1000; tries++) {
    const c = pick(1, MAGIC_LEVEL2_MAX);
    const r = Math.min(c - 1, MAGIC_LEVEL2_MAX - c);
    if (r < 1) continue;
    const v = magicLevel2Cells(c, pick(-r, r), pick(-r, r));
    if (new Set(v).size === 9 && v.every((x) => x >= 1 && x <= MAGIC_LEVEL2_MAX)) {
      return [v.slice(0, 3), v.slice(3, 6), v.slice(6)];
    }
  }
  return MAGIC_SQUARES[0].map((row) => row.slice()); // safety net: a level-1 square is a valid level-2 one
}

// The answer to show for a puzzle: prefers a square that also agrees with the
// player's entries (matters when there are several completions), otherwise
// the first one matching the givens.
function magicSolution(givens, entries, level = 1) {
  const first = (grid) => (level === 2 ? magicLevel2Matching(grid, 1) : magicMatching(grid));
  const withEntries = entries ? first(entries) : [];
  const list = withEntries.length ? withEntries : first(givens);
  return list.length ? list[0].map((row) => row.slice()) : null;
}

// ---------------------------------------------------------------------------
// Puzzle generation. LEVEL picks the squares used; DIFFICULTY picks how many
// givens are shown:
//   easy: at least 3. Start with 3 random cells and add more only if needed
//         so the puzzle has exactly one solution.
//   hard: exactly 2. Level 1: a pair is chosen that has exactly one solution
//         (24 of the 36 cell pairs do). Level 2: two random cells of a random
//         valid square, with NO uniqueness guarantee -- usually several
//         completions exist and any valid one counts as solved.
// Uniqueness is always verified by enumeration (a second match stops it early).
// ---------------------------------------------------------------------------
function magicGeneratePuzzle(rng = Math.random, level = 1, difficulty = "easy") {
  const cells = [];
  for (let r = 0; r < MAGIC_SIZE; r++) for (let c = 0; c < MAGIC_SIZE; c++) cells.push([r, c]);

  const solution =
    level === 2
      ? magicLevel2RandomSquare(rng)
      : MAGIC_SQUARES[Math.floor(rng() * MAGIC_SQUARES.length)].map((row) => row.slice());
  const completions = (puzzle, limit) =>
    level === 2 ? magicLevel2Matching(puzzle, limit) : magicMatching(puzzle).slice(0, limit);
  const build = (positions) => {
    const puzzle = magicEmptyGrid();
    for (const [r, c] of positions) puzzle[r][c] = solution[r][c];
    return puzzle;
  };

  if (difficulty === "hard") {
    const pairs = [];
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) pairs.push([cells[i], cells[j]]);
    }
    const order = magicShuffled(pairs, rng);
    if (level === 2) return { puzzle: build(order[0]), solution };
    const unique = order.find((pair) => completions(build(pair), 2).length === 1);
    if (unique) return { puzzle: build(unique), solution };
    // unreachable for level 1 (24 of the 36 pairs are unique); falls through to easy
  }

  for (let count = 3; count <= 9; count++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const puzzle = build(magicShuffled(cells, rng).slice(0, count));
      if (completions(puzzle, 2).length === 1) return { puzzle, solution };
    }
  }
  return { puzzle: build(cells), solution }; // unreachable: all nine givens is always unique
}

// ---------------------------------------------------------------------------
// Level-aware entry points.
// ---------------------------------------------------------------------------

// One cell's text: level 1 = a single digit 1-9, level 2 = a whole number
// 1-20 (no leading zero, so "0" and "00" are rejected).
function magicIsValue(value, level = 1) {
  return magicEntryError(value, level) === null;
}

// Why a cell's text isn't a valid entry: "nonnumeric" (not a number, or "0",
// "00" or a leading zero) or, level 2 only, "range" (a number over 20).
// null if it is valid.
function magicEntryError(value, level = 1) {
  const text = String(value);
  if (level !== 2) return magicIsDigit(text) ? null : "nonnumeric";
  if (!/^[0-9]+$/.test(text) || text[0] === "0") return "nonnumeric";
  return Number(text) > MAGIC_LEVEL2_MAX ? "range" : null;
}

function magicCanCompleteAt(grid, level = 1) {
  return level === 2 ? magicLevel2Matching(grid, 1).length > 0 : magicCanComplete(grid);
}

function magicIsMagicAt(grid, level = 1) {
  return level === 2 ? magicLevel2IsMagic(grid) : magicIsMagic(grid);
}

const MagicLogic = {
  SIZE: MAGIC_SIZE,
  SUM: MAGIC_SUM,
  SQUARES: MAGIC_SQUARES,
  isDigit: magicIsDigit,
  emptyGrid: magicEmptyGrid,
  hasDuplicate: magicHasDuplicate,
  matching: magicMatching,
  canComplete: magicCanCompleteAt,
  countFilled: magicCountFilled,
  isFull: magicIsFull,
  isMagic: magicIsMagicAt,
  isValue: magicIsValue,
  entryError: magicEntryError,
  LEVEL2_MAX: MAGIC_LEVEL2_MAX,
  level2Matching: magicLevel2Matching,
  solution: magicSolution,
  generatePuzzle: magicGeneratePuzzle,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = MagicLogic;
} else {
  window.MagicLogic = MagicLogic;
}

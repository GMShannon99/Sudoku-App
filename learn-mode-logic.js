/*
 * LEARN MODE -- pure 4x4 Sudoku logic (digits 1-4, four 2x2 boxes).
 *
 * Standalone on purpose: sudoku-logic.js is hard-wired to 9x9/3x3, so Learn
 * Mode has its own tiny solver/generator here rather than touching it.
 * Like sudoku-logic.js, this has no DOM knowledge -- plain 4x4 arrays of
 * numbers (0 = empty) -- so it's testable under Node.
 *
 * To remove Learn Mode entirely: delete learn-mode-*.js / learn-mode.css,
 * the "LEARN MODE" blocks in index.html, and the one-line hook at the top
 * of the generateBtn handler in sudoku-ui.js.
 */

const LEARN_SIZE = 4;
const LEARN_BOX = 2;
const LEARN_DIGITS = [1, 2, 3, 4];

// Beginner-friendly: roughly half the grid is given. TARGET is what we
// aim for; MIN is the fewest blanks we'll accept before retrying.
const LEARN_TARGET_BLANKS = 7;
const LEARN_MIN_BLANKS = 6;

function learnShuffled(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function learnEmptyGrid() {
  return Array.from({ length: LEARN_SIZE }, () => Array(LEARN_SIZE).fill(0));
}

// Digits that may legally go at (row, col), treating that cell as empty.
function learnCandidates(grid, row, col) {
  const used = new Set();
  for (let i = 0; i < LEARN_SIZE; i++) {
    if (i !== col) used.add(grid[row][i]);
    if (i !== row) used.add(grid[i][col]);
  }
  const br = Math.floor(row / LEARN_BOX) * LEARN_BOX;
  const bc = Math.floor(col / LEARN_BOX) * LEARN_BOX;
  for (let r = br; r < br + LEARN_BOX; r++) {
    for (let c = bc; c < bc + LEARN_BOX; c++) {
      if (r !== row || c !== col) used.add(grid[r][c]);
    }
  }
  return LEARN_DIGITS.filter((d) => !used.has(d));
}

// True when every given digit is 0-4 and none repeat in a row/column/box.
function learnIsConsistent(grid) {
  for (let r = 0; r < LEARN_SIZE; r++) {
    for (let c = 0; c < LEARN_SIZE; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      if (!LEARN_DIGITS.includes(v)) return false;
      if (!learnCandidates(grid, r, c).includes(v)) return false;
    }
  }
  return true;
}

// Backtracking search over a COPY of grid. Counts solutions up to `limit`;
// when `capture` is given, the first solution found is copied into it.
function learnCountSolutions(grid, limit = 2, capture = null, randomize = false) {
  const work = grid.map((row) => row.slice());
  if (!learnIsConsistent(work)) return 0;
  let found = 0;

  function search() {
    let best = null;
    let bestOptions = null;
    for (let r = 0; r < LEARN_SIZE; r++) {
      for (let c = 0; c < LEARN_SIZE; c++) {
        if (work[r][c] !== 0) continue;
        const options = learnCandidates(work, r, c);
        if (bestOptions === null || options.length < bestOptions.length) {
          best = [r, c];
          bestOptions = options;
        }
      }
    }
    if (best === null) {
      if (found === 0 && capture) {
        for (let r = 0; r < LEARN_SIZE; r++) capture[r] = work[r].slice();
      }
      found++;
      return;
    }
    const [r, c] = best;
    for (const d of randomize ? learnShuffled(bestOptions) : bestOptions) {
      work[r][c] = d;
      search();
      work[r][c] = 0;
      if (found >= limit) return;
    }
  }

  search();
  return found;
}

// Solves grid in place. Returns true if a solution exists.
function learnSolve(grid) {
  const solution = learnEmptyGrid();
  if (learnCountSolutions(grid, 1, solution) !== 1) return false;
  for (let r = 0; r < LEARN_SIZE; r++) grid[r] = solution[r].slice();
  return true;
}

function learnHasUniqueSolution(grid) {
  return learnCountSolutions(grid, 2) === 1;
}

// True if repeatedly filling cells that have exactly one candidate solves
// the whole grid -- i.e. no guessing is ever needed (the "easy" bar).
function learnSolvableBySingles(grid) {
  const work = grid.map((row) => row.slice());
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let r = 0; r < LEARN_SIZE; r++) {
      for (let c = 0; c < LEARN_SIZE; c++) {
        if (work[r][c] !== 0) continue;
        const options = learnCandidates(work, r, c);
        if (options.length === 1) {
          work[r][c] = options[0];
          progressed = true;
        }
      }
    }
  }
  return work.every((row) => row.every((v) => v !== 0));
}

// Returns { puzzle, solution }. The puzzle has exactly one solution, needs
// no guessing to solve, and has about LEARN_TARGET_BLANKS blanks.
function learnGeneratePuzzle(maxAttempts = 50) {
  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = learnEmptyGrid();
    learnCountSolutions(learnEmptyGrid(), 1, solution, true);

    const puzzle = solution.map((row) => row.slice());
    const cells = [];
    for (let r = 0; r < LEARN_SIZE; r++) {
      for (let c = 0; c < LEARN_SIZE; c++) cells.push([r, c]);
    }
    let blanks = 0;
    for (const [r, c] of learnShuffled(cells)) {
      if (blanks >= LEARN_TARGET_BLANKS) break;
      const kept = puzzle[r][c];
      puzzle[r][c] = 0;
      if (learnHasUniqueSolution(puzzle) && learnSolvableBySingles(puzzle)) {
        blanks++;
      } else {
        puzzle[r][c] = kept;
      }
    }

    if (best === null || blanks > best.blanks) best = { puzzle, solution, blanks };
    if (blanks >= LEARN_MIN_BLANKS) break;
  }
  return { puzzle: best.puzzle, solution: best.solution };
}

const LearnLogic = {
  SIZE: LEARN_SIZE,
  DIGITS: LEARN_DIGITS,
  candidates: learnCandidates,
  isConsistent: learnIsConsistent,
  countSolutions: learnCountSolutions,
  hasUniqueSolution: learnHasUniqueSolution,
  solvableBySingles: learnSolvableBySingles,
  solve: learnSolve,
  generatePuzzle: learnGeneratePuzzle,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = LearnLogic;
} else {
  window.LearnLogic = LearnLogic;
}

/*
 * Sudoku solving logic -- a JavaScript translation of the Python version's
 * sudoku_solver.py. Same approach throughout:
 *
 *   1. TRACKING SETS: for every row, column, and 3x3 box, track which
 *      digits (1-9) are still missing.
 *   2. CANDIDATES: an empty cell's legal digits are the intersection of
 *      what's missing from its row, column, and box.
 *   3. NAKED SINGLES: any cell whose candidates narrow to exactly one
 *      digit must be that digit. Sweep until a full pass places nothing.
 *   4. BACKTRACKING: guess on the fewest-candidates cell (MRV), recurse,
 *      undo everything a failed branch touched (not just the guess).
 *
 * This file has NO knowledge of the DOM/UI -- it only works with plain
 * 9x9 arrays of numbers (0 = empty), exactly like the Python version's
 * grid format. That separation is what let this get tested here under
 * Node before ever touching a browser.
 */

const ALL_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function boxIndex(row, col) {
  return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

function buildTrackingSets(grid) {
  const rowMissing = Array.from({ length: 9 }, () => new Set(ALL_DIGITS));
  const colMissing = Array.from({ length: 9 }, () => new Set(ALL_DIGITS));
  const boxMissing = Array.from({ length: 9 }, () => new Set(ALL_DIGITS));

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = grid[r][c];
      if (val !== 0) {
        rowMissing[r].delete(val);
        colMissing[c].delete(val);
        boxMissing[boxIndex(r, c)].delete(val);
      }
    }
  }

  return { rowMissing, colMissing, boxMissing };
}

function candidatesFor(row, col, rowMissing, colMissing, boxMissing) {
  const box = boxIndex(row, col);
  const result = [];
  for (const digit of rowMissing[row]) {
    if (colMissing[col].has(digit) && boxMissing[box].has(digit)) {
      result.push(digit);
    }
  }
  return result.sort((a, b) => a - b);
}

function buildCandidates(grid, rowMissing, colMissing, boxMissing) {
  // Map keyed by "row,col" string, since JS objects/Maps can't use
  // array/tuple keys the way Python dicts can use (row, col) tuples.
  const candidates = new Map();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        candidates.set(`${r},${c}`, candidatesFor(r, c, rowMissing, colMissing, boxMissing));
      }
    }
  }
  return candidates;
}

function placeValue(grid, rowMissing, colMissing, boxMissing, row, col, val) {
  grid[row][col] = val;
  rowMissing[row].delete(val);
  colMissing[col].delete(val);
  boxMissing[boxIndex(row, col)].delete(val);
}

function solveNakedSingles(grid) {
  const { rowMissing, colMissing, boxMissing } = buildTrackingSets(grid);
  let totalPlaced = 0;

  while (true) {
    const candidates = buildCandidates(grid, rowMissing, colMissing, boxMissing);
    let placedThisPass = 0;

    for (const [key, options] of candidates) {
      if (options.length === 1) {
        const [row, col] = key.split(",").map(Number);
        const val = options[0];
        const box = boxIndex(row, col);
        // Live re-check against the CURRENT sets, not the stale snapshot
        // this options list came from -- this is the exact fix that was
        // needed in the Python version too: an earlier placement in this
        // same pass may have already used up this digit in a shared
        // row/column/box.
        if (rowMissing[row].has(val) && colMissing[col].has(val) && boxMissing[box].has(val)) {
          placeValue(grid, rowMissing, colMissing, boxMissing, row, col, val);
          placedThisPass++;
        }
      }
    }

    totalPlaced += placedThisPass;
    if (placedThisPass === 0) break;
  }

  return { totalPlaced, rowMissing, colMissing, boxMissing };
}

// MRV helper shared by solveInternal/countSolutionsInternal below: given a
// Map of candidate lists keyed by "row,col", returns the [row, col] whose
// list is shortest (ties broken by insertion order, same as Python's min()
// over a dict).
function pickMrvCell(candidates) {
  let bestKey = null;
  let bestOptions = null;
  for (const [key, options] of candidates) {
    if (bestOptions === null || options.length < bestOptions.length) {
      bestKey = key;
      bestOptions = options;
    }
  }
  return { key: bestKey, options: bestOptions };
}

function shuffled(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Recursive core behind solve() below -- see sudoku_solver.py's solve() for
// the full explanation of the naked-singles-then-MRV-backtracking strategy
// and why undoing a failed branch means resetting every cell that was empty
// on entry, not just the guessed cell.
function solveInternal(grid, randomize, maxIterations, counter) {
  const cellsEmptyOnEntry = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) cellsEmptyOnEntry.push([r, c]);
    }
  }

  solveNakedSingles(grid);

  const { rowMissing, colMissing, boxMissing } = buildTrackingSets(grid);
  const candidates = buildCandidates(grid, rowMissing, colMissing, boxMissing);

  for (const options of candidates.values()) {
    if (options.length === 0) {
      for (const [r, c] of cellsEmptyOnEntry) grid[r][c] = 0;
      return { solved: false, iterations: 0 };
    }
  }

  if (candidates.size === 0) {
    return { solved: true, iterations: 0 };
  }

  const { key: bestKey, options: bestOptions } = pickMrvCell(candidates);
  const [row, col] = bestKey.split(",").map(Number);

  let iterationCount = 0;
  const guesses = randomize ? shuffled(bestOptions) : bestOptions;

  for (const guess of guesses) {
    grid[row][col] = guess;
    iterationCount++;

    if (maxIterations !== null) {
      counter.count++;
      if (counter.count >= maxIterations) {
        for (const [r, c] of cellsEmptyOnEntry) grid[r][c] = 0;
        return { solved: false, iterations: iterationCount };
      }
    }

    const result = solveInternal(grid, randomize, maxIterations, counter);
    iterationCount += result.iterations;
    if (result.solved) return { solved: true, iterations: iterationCount };
    // A failed nested call already reset everything IT filled, including
    // grid[row][col], back to 0 -- so nothing to undo here before trying
    // the next candidate.
  }

  for (const [r, c] of cellsEmptyOnEntry) grid[r][c] = 0;
  return { solved: false, iterations: iterationCount };
}

// Fully solves grid in place. Returns { solved, iterations }: iterations is
// the count of backtracking guesses attempted (0 if naked singles alone
// solved it) -- the same metric sudoku_solver.py's difficulty rating and
// SudokuGUI's "Reiterations" display are built on.
//
// options.randomize: try each guessed cell's candidates in shuffled order
// instead of sorted order -- used by generatePuzzle() so repeated calls
// don't always land on the same solved grid.
//
// options.maxIterations: abort (report unsolved) once this many guesses
// have been attempted across the whole call tree, rather than running
// unbounded -- see PASTE_VALIDATION_MAX_ITERATIONS in sudoku-ui.js for why
// this matters when validating untrusted pasted input.
function solve(grid, options = {}) {
  const { randomize = false, maxIterations = null } = options;
  const counter = { count: 0 };
  return solveInternal(grid, randomize, maxIterations, counter);
}

// Recursive core behind countSolutions() below -- mirrors solveInternal
// above, but keeps searching after finding a solution (up to `limit`)
// instead of stopping at the first one, and always undoes its own fills
// (even on success) so sibling branches resume from a clean grid.
function countSolutionsInternal(grid, limit) {
  const cellsEmptyOnEntry = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) cellsEmptyOnEntry.push([r, c]);
    }
  }

  solveNakedSingles(grid);
  const { rowMissing, colMissing, boxMissing } = buildTrackingSets(grid);
  const candidates = buildCandidates(grid, rowMissing, colMissing, boxMissing);

  let found;
  if ([...candidates.values()].some((options) => options.length === 0)) {
    found = 0; // contradiction -- this branch has zero solutions
  } else if (candidates.size === 0) {
    found = 1; // no empty cells left -- this branch IS a solution
  } else {
    const { key: bestKey, options: bestOptions } = pickMrvCell(candidates);
    const [row, col] = bestKey.split(",").map(Number);
    found = 0;
    for (const guess of bestOptions) {
      grid[row][col] = guess;
      found += countSolutionsInternal(grid, limit - found);
      if (found >= limit) break;
    }
  }

  for (const [r, c] of cellsEmptyOnEntry) grid[r][c] = 0;
  return found;
}

// Counts distinct solutions for grid (a partial or full 9x9 grid), capped at
// `limit`, without mutating the caller's grid. The general-purpose
// uniqueness primitive hasUniqueSolution() and generatePuzzle() below rely
// on.
function countSolutions(grid, limit = 2) {
  const work = grid.map((row) => row.slice());
  return countSolutionsInternal(work, limit);
}

// True if grid has EXACTLY one solution -- the real uniqueness check
// generatePuzzle() uses to decide whether a cell can safely be removed
// without the puzzle becoming ambiguous.
function hasUniqueSolution(grid) {
  return countSolutions(grid, 2) === 1;
}

// Same thresholds sudoku_gui.py's difficulty label has always used.
const DIFFICULTY_RANK = { Easy: 0, Moderate: 1, Hard: 2 };

// Converts a solve() iteration count into "Easy"/"Moderate"/"Hard", using
// the same thresholds as sudoku_solver.py's rate_difficulty(). Pulled out
// as its own function so the difficulty label and generatePuzzle() below
// can't drift out of sync with each other.
function rateDifficulty(reiterationCount) {
  if (reiterationCount === 0) return "Easy";
  if (reiterationCount < 40) return "Moderate";
  return "Hard";
}

// Generates a brand-new, randomly generated 9x9 puzzle (0 = blank cell)
// aimed at targetDifficulty ("Easy"/"Moderate"/"Hard"), guaranteed to have
// exactly one valid solution. Returns { puzzle, reiterationCount,
// difficulty, solution } -- see sudoku_solver.py's generate_puzzle() for
// the full explanation of the remove-and-check-twice strategy this mirrors
// (uniqueness first, then a difficulty cap on every single removal so an
// Easy target is actually reachable).
function generatePuzzle(targetDifficulty, maxAttempts = 10, extraRemovalAttempts = 20) {
  if (!(targetDifficulty in DIFFICULTY_RANK)) targetDifficulty = "Moderate";
  const targetRank = DIFFICULTY_RANK[targetDifficulty];

  let best = null;
  let bestDistance = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solvedGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    solve(solvedGrid, { randomize: true });

    const puzzle = solvedGrid.map((row) => row.slice());
    let reiterationCount = 0;
    let difficulty = "Easy"; // a fully solved grid trivially needs 0 guesses

    // Attempts to remove puzzle[r][c], keeping the removal only if
    // uniqueness survives AND the resulting difficulty doesn't exceed
    // target_difficulty. Returns true (and updates reiterationCount/
    // difficulty above) if the removal was kept, false if reverted.
    function tryRemove(r, c) {
      const removed = puzzle[r][c];
      puzzle[r][c] = 0;
      if (!hasUniqueSolution(puzzle)) {
        puzzle[r][c] = removed;
        return false;
      }

      const checkGrid = puzzle.map((row) => row.slice());
      const { iterations: candidateCount } = solve(checkGrid);
      const candidateDifficulty = rateDifficulty(candidateCount);
      if (DIFFICULTY_RANK[candidateDifficulty] > targetRank) {
        puzzle[r][c] = removed;
        return false;
      }

      reiterationCount = candidateCount;
      difficulty = candidateDifficulty;
      return true;
    }

    // First pass: try removing every cell once, in random order, capped
    // at target_difficulty.
    let removalOrder = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) removalOrder.push([r, c]);
    }
    removalOrder = shuffled(removalOrder);
    for (const [r, c] of removalOrder) tryRemove(r, c);

    // Still easier than requested -- retry further random sweeps over the
    // remaining clues, since a different order can unlock removals the
    // first pass's order happened to rule out.
    let extraTries = 0;
    while (DIFFICULTY_RANK[difficulty] < targetRank && extraTries < extraRemovalAttempts) {
      let leftover = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (puzzle[r][c] !== 0) leftover.push([r, c]);
        }
      }
      leftover = shuffled(leftover);

      let progressed = false;
      for (const [r, c] of leftover) {
        if (extraTries >= extraRemovalAttempts || DIFFICULTY_RANK[difficulty] >= targetRank) {
          break;
        }
        extraTries++;
        if (tryRemove(r, c)) progressed = true;
      }
      if (!progressed) break; // a full sweep changed nothing -- no point retrying
    }

    const distance = Math.abs(DIFFICULTY_RANK[difficulty] - targetRank);
    if (best === null || distance < bestDistance) {
      best = { puzzle, reiterationCount, difficulty, solution: solvedGrid };
      bestDistance = distance;
    }

    if (difficulty === targetDifficulty) {
      return { puzzle, reiterationCount, difficulty, solution: solvedGrid };
    }
    // Still not on target after both passes above -- restart from a fresh
    // solved grid on the next loop iteration instead.
  }

  return best;
}

// Validates and parses a single pasted puzzle record: 81 grid digits
// (0-9, row by row), OPTIONALLY followed by one more character (a
// difficulty letter, ignored -- see sudoku_gui.py's _parse_save_record).
// A single trailing newline is tolerated; more than one line of actual
// content is rejected. Returns the parsed 9x9 grid, or null if text isn't
// exactly one valid record.
function parseSaveRecord(text) {
  if (!text) return null;

  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length !== 1) return null;
  const record = lines[0];

  if (record.length !== 81 && record.length !== 82) return null;

  const gridDigits = record.slice(0, 81);
  if (!/^[0-9]{81}$/.test(gridDigits)) return null;

  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let i = 0; i < 81; i++) {
    grid[Math.floor(i / 9)][i % 9] = parseInt(gridDigits[i], 10);
  }
  return grid;
}

const SudokuLogic = {
  ALL_DIGITS,
  boxIndex,
  buildTrackingSets,
  buildCandidates,
  placeValue,
  solveNakedSingles,
  solve,
  countSolutions,
  hasUniqueSolution,
  rateDifficulty,
  generatePuzzle,
  parseSaveRecord,
};

// Works both under Node (for the tests run during development) and in a
// plain browser <script> tag (for the actual page) -- module.exports
// doesn't exist in a browser, so this checks before using it.
if (typeof module !== "undefined" && module.exports) {
  module.exports = SudokuLogic;
} else {
  window.SudokuLogic = SudokuLogic;
}
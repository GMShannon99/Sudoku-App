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

function solve(grid) {
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
      return false;
    }
  }

  if (candidates.size === 0) {
    return true;
  }

  // MRV heuristic: find the key with the fewest candidates.
  let bestKey = null;
  let bestOptions = null;
  for (const [key, options] of candidates) {
    if (bestOptions === null || options.length < bestOptions.length) {
      bestKey = key;
      bestOptions = options;
    }
  }
  const [row, col] = bestKey.split(",").map(Number);

  for (const guess of bestOptions) {
    grid[row][col] = guess;
    if (solve(grid)) return true;
    // solve() already cleaned up everything IT filled before returning
    // false, so grid[row][col] is already back to 0 here.
  }

  for (const [r, c] of cellsEmptyOnEntry) grid[r][c] = 0;
  return false;
}

const SudokuLogic = {
  ALL_DIGITS,
  boxIndex,
  buildTrackingSets,
  buildCandidates,
  placeValue,
  solveNakedSingles,
  solve,
};

// Works both under Node (for the tests run during development) and in a
// plain browser <script> tag (for the actual page) -- module.exports
// doesn't exist in a browser, so this checks before using it.
if (typeof module !== "undefined" && module.exports) {
  module.exports = SudokuLogic;
} else {
  window.SudokuLogic = SudokuLogic;
}
/*
 * DOM/UI wiring for the Sudoku Solver web page. Has no solving logic of its
 * own -- everything that touches row/column/box rules, naked singles, or
 * backtracking lives in sudoku-logic.js (SudokuLogic) and is loaded before
 * this file. This file only ever reads/writes plain 9x9 arrays and pushes
 * them into/out of the DOM.
 */

// A famous "world's hardest sudoku"-style puzzle (only 21 givens) -- same
// constant as sudoku_solver.py's sample_puzzle. Naked singles alone will
// NOT fully solve this one; every empty cell still has 2+ candidates after
// propagation stalls out, which is exactly the case backtracking exists to
// handle (needs 1,850 backtracking guesses -- rates "Hard").
const samplePuzzle = [
  [8,0,0,0,0,0,0,0,0],
  [0,0,3,6,0,0,0,0,0],
  [0,7,0,0,9,0,2,0,0],
  [0,5,0,0,0,7,0,0,0],
  [0,0,0,0,4,5,7,0,0],
  [0,0,0,1,0,0,0,3,0],
  [0,0,1,0,0,0,0,6,8],
  [0,0,8,5,0,0,0,1,0],
  [0,9,0,0,0,0,4,0,0],
];

const APP_VERSION = "1.0.6";
const HELP_LAST_UPDATED = "September 4, 2026";

const ENTRY_HINT_TEXT = "Type a digit into the squares you want filled.";

// Caps how many backtracking guesses Paste Puzzle's validate-by-solving
// check will spend on a pasted puzzle before giving up and treating it as
// invalid -- see sudoku_gui.py's PASTE_VALIDATION_MAX_ITERATIONS for why
// this exists (a corrupted/untrusted grid's contradiction can otherwise
// take an impractically long time to prove).
const PASTE_VALIDATION_MAX_ITERATIONS = 50_000;

// File Write to File downloads. Deliberately the same filename and record
// format sudoku_gui.py's Save to File writes to Sudoku_Save.txt with --
// 81 grid digits (row by row, 0 for blank), followed by one difficulty
// letter (E/M/H) -- so a downloaded file is structurally the exact same
// "single valid record" Paste Puzzle already knows how to parse back in
// (see SudokuLogic.parseSaveRecord). Unlike sudoku_gui.py's version (which
// always saves the puzzle's ORIGINAL givens only), this saves the CURRENT
// grid -- givens plus whatever guesses have been entered so far -- since
// that's what was asked for here; re-loading a partially-solved download
// via Paste Puzzle will treat every filled-in cell as a given, which is an
// accepted consequence of reusing this given-clue-oriented file format for
// a live snapshot instead of a pure puzzle definition.
const SAVE_FILE_NAME = "Sudoku_Save.txt";

let puzzle = null;
let givenCells = new Set();
let backupStack = [];

// Every digit the user has entered on the solving screen (typed or via a
// candidate button), in order, so Ctrl+Z can undo them one at a time --
// separate from backupStack, which only restores whole-grid snapshots taken
// by clicking Save.
let moveHistory = [];

// Moves popped off moveHistory by Ctrl+Z, so Ctrl+Shift+Z can restore them.
// Cleared whenever a new move is recorded, since redoing past a fresh move
// would overwrite it with stale state.
let redoStack = [];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 600;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
  }
}

// Yields one animation frame so a status message (e.g. "Generating
// puzzle...") actually paints before a long synchronous solve/generate call
// blocks the UI -- the browser equivalent of Tkinter's update_idletasks().
function paintNow() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function buildGridDOM(container, options) {
  container.innerHTML = "";
  const cellInputs = {};

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const wrap = document.createElement("div");
      wrap.className = "cell-wrap";
      if (c === 2 || c === 5) wrap.classList.add("box-right");
      if (r === 2 || r === 5) wrap.classList.add("box-bottom");
      wrap.style.gridColumn = c + 1;
      wrap.style.gridRow = r + 1;

      const input = document.createElement("input");
      input.className = "cell";
      input.maxLength = 1;
      input.inputMode = "numeric";
      input.autocomplete = "off";

      const givenVal = options.puzzleForGivens ? options.puzzleForGivens[r][c] : 0;
      if (!options.editableAll && givenVal !== 0) {
        input.value = givenVal;
        input.classList.add("given");
        input.disabled = true;
      } else {
        input.addEventListener("input", () => options.onCellInput(r, c, input));
        if (options.onCellClick) {
          // mousedown (not click/focus) so re-clicking an already-focused
          // cell still re-shows its candidates, matching sudoku_gui.py's
          // <Button-1> binding (fires on every press, unlike <FocusIn>).
          input.addEventListener("mousedown", () => options.onCellClick(r, c, input));
        }
      }

      wrap.appendChild(input);
      container.appendChild(wrap);
      cellInputs[`${r},${c}`] = input;
    }
  }

  return cellInputs;
}

function readGrid(cellInputs) {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = cellInputs[`${r},${c}`].value.trim();
      if (/^[1-9]$/.test(val)) grid[r][c] = parseInt(val, 10);
    }
  }
  return grid;
}

// Solves a COPY of grid (never mutates it) purely to compute the
// backtracking-guess count used for the difficulty label -- same purpose
// as PuzzleEntryGUI._on_start/_on_sample's silent background solve.
function computeReiterationCount(grid) {
  const copy = grid.map((row) => row.slice());
  const { iterations } = SudokuLogic.solve(copy);
  return iterations;
}

/* ===================== ENTRY SCREEN ===================== */

const entryGridEl = document.getElementById("entryGrid");
const entryHintEl = document.getElementById("entryHint");
let entryCells = null;

function setEntryHint(text, kind) {
  entryHintEl.textContent = text;
  entryHintEl.className = "hint-text" + (kind ? " " + kind : "");
}

function clearEntryHint() {
  setEntryHint(ENTRY_HINT_TEXT, "");
}

function resetEntryGrid() {
  for (const key in entryCells) entryCells[key].value = "";
}

function onEntryCellInput(row, col, input) {
  clearEntryHint();

  let v = input.value;
  if (v.length > 1) v = v[v.length - 1];
  if (v && !/[1-9]/.test(v)) v = "";

  if (v) {
    // Same row/column/box duplicate check the solving screen's
    // onSolvingCellInput uses -- a digit already used elsewhere among the
    // OTHER clues typed so far is rejected with a beep, so a puzzle handed
    // off to "Start Solving" can never start out broken.
    const digit = parseInt(v, 10);
    const grid = readGrid(entryCells);
    grid[row][col] = 0;
    const { rowMissing, colMissing, boxMissing } = SudokuLogic.buildTrackingSets(grid);
    const box = SudokuLogic.boxIndex(row, col);

    const rowOk = rowMissing[row].has(digit);
    const colOk = colMissing[col].has(digit);
    const boxOk = boxMissing[box].has(digit);

    if (!(rowOk && colOk && boxOk)) {
      beep();
      v = "";
    }
  }

  input.value = v;
}

function initEntryScreen() {
  document.getElementById("pageTitle").textContent = `Enter Your Puzzle v${APP_VERSION}`;
  entryCells = buildGridDOM(entryGridEl, {
    editableAll: true,
    puzzleForGivens: null,
    onCellInput: onEntryCellInput,
  });
}

document.getElementById("startSolvingBtn").addEventListener("click", () => {
  clearEntryHint();
  const grid = readGrid(entryCells);
  const filledCount = grid.flat().filter((v) => v !== 0).length;
  if (filledCount <= 5) {
    alert("Must enter more squares before starting.");
    return;
  }
  launchSolvingScreen(grid, computeReiterationCount(grid));
});

document.getElementById("useSampleBtn").addEventListener("click", () => {
  clearEntryHint();
  const grid = samplePuzzle.map((row) => [...row]);
  launchSolvingScreen(grid, computeReiterationCount(grid));
});

document.getElementById("createNewBtn").addEventListener("click", () => {
  resetEntryGrid();
  clearEntryHint();
  document.getElementById("pageTitle").textContent = "Sudoku - Manual Enter Mode";
});

document.getElementById("generateBtn").addEventListener("click", async () => {
  clearEntryHint();
  const selected = document.querySelector('input[name="difficulty"]:checked');
  const targetDifficulty = selected ? selected.value : "Moderate";

  setEntryHint("Generating puzzle...", "");
  await paintNow();

  const { puzzle: generated, reiterationCount } = SudokuLogic.generatePuzzle(targetDifficulty);
  launchSolvingScreen(generated, reiterationCount);
});

document.getElementById("pasteBtn").addEventListener("click", async () => {
  clearEntryHint();

  let clipboardText = null;
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (e) {
    clipboardText = null;
  }

  const grid = SudokuLogic.parseSaveRecord(clipboardText);
  if (grid === null) {
    alert(
      "The clipboard doesn't contain a valid saved puzzle record. Copy a " +
      "single line of 81 grid digits (0-9), optionally followed by one " +
      "more character, and try again."
    );
    return;
  }

  setEntryHint("Validating pasted puzzle...", "");
  await paintNow();

  const solutionGrid = grid.map((row) => row.slice());
  const { solved, iterations } = SudokuLogic.solve(solutionGrid, {
    maxIterations: PASTE_VALIDATION_MAX_ITERATIONS,
  });
  if (!solved) {
    setEntryHint("Pasted puzzle is not valid.", "error");
    return;
  }

  launchSolvingScreen(grid, iterations);
});

/* ===================== SOLVING SCREEN ===================== */

const solvingGridEl = document.getElementById("solvingGrid");
const difficultyLineEl = document.getElementById("difficultyLine");
const iterationLineEl = document.getElementById("iterationLine");
let solvingCells = null;
let rowMissingLabels = [];
let colMissingLabels = [];

// The backtracking-guess count computed for the ORIGINAL puzzle, back on
// the entry screen (see computeReiterationCount / SudokuLogic.generatePuzzle
// / the Paste Puzzle handler above) -- same value the difficulty label and
// the "Iteration: N" message (see showIterationCount) are both driven by.
let currentReiterationCount = 0;

// Displays "Iteration: N" in the lower-right corner panel. Called whenever
// the puzzle becomes fully solved via the Solve button.
function showIterationCount() {
  iterationLineEl.textContent = `Iteration: ${currentReiterationCount}`;
}

// Hides the "Iteration: N" message. Called whenever any other solving-screen
// button is pressed, so it never lingers past the moment that prompted it.
function clearIterationCount() {
  iterationLineEl.textContent = "";
}

function launchSolvingScreen(puzzleGrid, reiterationCount) {
  puzzle = puzzleGrid;
  givenCells = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (puzzle[r][c] !== 0) givenCells.add(`${r},${c}`);
    }
  }
  backupStack = [];
  moveHistory = [];
  redoStack = [];
  currentReiterationCount = reiterationCount;

  document.getElementById("pageTitle").textContent = `Sudoku Solver v${APP_VERSION}`;
  difficultyLineEl.textContent = `Difficulty Level: ${SudokuLogic.rateDifficulty(reiterationCount)}`;
  document.getElementById("entryScreen").classList.remove("active");
  document.getElementById("solvingScreen").classList.add("active");

  buildSolvingGrid();
  updateCandidateLabels();
  updateBackupLine();
  setStatus("", "");
  clearIterationCount();
}

function goToEntryScreen() {
  clearSolvedHighlight();
  puzzle = null;
  givenCells = new Set();
  backupStack = [];
  moveHistory = [];
  redoStack = [];

  document.getElementById("pageTitle").textContent = `Enter Your Puzzle v${APP_VERSION}`;
  difficultyLineEl.textContent = "";
  document.getElementById("solvingScreen").classList.remove("active");
  document.getElementById("entryScreen").classList.add("active");

  resetEntryGrid();
  clearEntryHint();
  clearIterationCount();
  document.querySelectorAll('input[name="difficulty"]').forEach((radio) => {
    radio.checked = false;
  });
}

function buildSolvingGrid() {
  solvingGridEl.innerHTML = "";
  selectedCell = null;
  clearCandidateButtons();
  solvingCells = buildGridDOM(solvingGridEl, {
    editableAll: false,
    puzzleForGivens: puzzle,
    onCellInput: onSolvingCellInput,
    onCellClick: selectSolvingCell,
  });

  rowMissingLabels = [];
  for (let r = 0; r < 9; r++) {
    const lbl = document.createElement("div");
    lbl.className = "row-missing";
    lbl.style.gridColumn = 10;
    lbl.style.gridRow = r + 1;
    solvingGridEl.appendChild(lbl);
    rowMissingLabels.push(lbl);
  }

  colMissingLabels = [];
  for (let c = 0; c < 9; c++) {
    const lbl = document.createElement("div");
    lbl.className = "col-missing";
    lbl.style.gridColumn = c + 1;
    lbl.style.gridRow = 10;
    solvingGridEl.appendChild(lbl);
    colMissingLabels.push(lbl);
  }

  // solvingGridEl.innerHTML = "" above detached candidateGridEl from any
  // earlier puzzle -- move it (not clone) into the grid's bottom-right
  // corner cell (column 10, row 10), left empty by the row/column-missing
  // labels above and to the left of it.
  solvingGridEl.appendChild(candidateGridEl);
}

// The "row,col" key of the currently selected empty solving-screen cell (see
// selectSolvingCell), or null if nothing is selected.
let selectedCell = null;

const candidateGridEl = document.getElementById("candidateGrid");

// The digits that could legally go in (row, col) right now -- missing from
// its row AND column AND box, with the cell itself treated as empty. The
// single source of truth both typing (onSolvingCellInput) and the
// candidate buttons (showCandidatesFor) rely on, so the two input paths
// can never disagree about what's valid.
function computeValidCandidates(row, col) {
  const grid = readGrid(solvingCells);
  grid[row][col] = 0;
  const { rowMissing, colMissing, boxMissing } = SudokuLogic.buildTrackingSets(grid);
  const box = SudokuLogic.boxIndex(row, col);
  const options = [];
  for (let digit = 1; digit <= 9; digit++) {
    if (rowMissing[row].has(digit) && colMissing[col].has(digit) && boxMissing[box].has(digit)) {
      options.push(digit);
    }
  }
  return options;
}

function clearCandidateButtons() {
  candidateGridEl.innerHTML = "";
}

// Un-highlights the currently selected cell (if any) and clears its
// candidate buttons. Safe to call when nothing is selected.
function clearSelection() {
  if (selectedCell !== null) {
    solvingCells[selectedCell].classList.remove("selected");
    selectedCell = null;
  }
  clearCandidateButtons();
}

function showCandidatesFor(row, col) {
  clearCandidateButtons();
  for (const digit of computeValidCandidates(row, col)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "candidate-btn";
    btn.textContent = String(digit);
    btn.addEventListener("click", () => fillSelectedCellWithDigit(digit));
    candidateGridEl.appendChild(btn);
  }
}

// Click handler for editable solving cells only (given cells never get this
// binding -- see buildGridDOM). Selects this cell: highlights it yellow and
// shows its candidate buttons. Clicking a different cell than the one
// already selected clears the old selection first; re-clicking the same
// cell is a no-op.
function selectSolvingCell(row, col) {
  const key = `${row},${col}`;
  if (selectedCell === key) return;

  clearSelection();
  selectedCell = key;
  solvingCells[key].classList.add("selected");
  showCandidatesFor(row, col);
}

// Fills the selected cell with the clicked candidate digit -- same as if it
// had been typed -- then converges on the same end state typing does:
// highlight removed, candidate buttons cleared, side labels refreshed.
function fillSelectedCellWithDigit(digit) {
  if (selectedCell === null) return;
  const [row, col] = selectedCell.split(",").map(Number);
  solvingCells[selectedCell].value = String(digit);
  recordMove(row, col, digit);
  clearSelection();
  updateCandidateLabels();
  maybeAutoSolve();
}

// Clears the selection highlight/candidates when a click lands anywhere
// that isn't the selected cell or one of its candidate buttons -- "clicking
// away" from the square being edited. Does NOT touch the post-solve yellow
// flash -- that highlight now tracks puzzle state (see clearSolvedHighlight),
// not interaction, so merely clicking around the page must leave it alone.
document.addEventListener("mousedown", (event) => {
  if (selectedCell === null) return;
  if (event.target === solvingCells[selectedCell]) return;
  if (candidateGridEl.contains(event.target)) return;
  clearSelection();
});

function onSolvingCellInput(row, col, input) {
  let v = input.value;
  if (v.length > 1) v = v[v.length - 1];
  if (v && !/[1-9]/.test(v)) v = "";

  if (v) {
    const digit = parseInt(v, 10);
    const grid = readGrid(solvingCells);
    grid[row][col] = 0;
    const { rowMissing, colMissing, boxMissing } = SudokuLogic.buildTrackingSets(grid);
    const box = SudokuLogic.boxIndex(row, col);

    const rowOk = rowMissing[row].has(digit);
    const colOk = colMissing[col].has(digit);
    const boxOk = boxMissing[box].has(digit);

    if (!(rowOk && colOk && boxOk)) {
      beep();
      v = "";
    }
  }

  input.value = v;
  if (v) {
    // A digit actually landed -- same end state as picking it from the
    // candidate buttons: drop the highlight and clear whatever candidate
    // buttons were on screen.
    recordMove(row, col, parseInt(v, 10));
    clearSelection();
  }
  updateCandidateLabels();
  if (v) maybeAutoSolve();
}

function updateCandidateLabels() {
  const grid = readGrid(solvingCells);
  const { rowMissing, colMissing } = SudokuLogic.buildTrackingSets(grid);

  for (let r = 0; r < 9; r++) {
    const digits = [...rowMissing[r]].sort((a, b) => a - b);
    rowMissingLabels[r].textContent = digits.length ? digits.join(" ") : "✓";
  }

  for (let c = 0; c < 9; c++) {
    const digits = [...colMissing[c]].sort((a, b) => a - b);
    colMissingLabels[c].innerHTML = digits.length ? digits.join("<br>") : "&#10003;";
  }
}

function setStatus(text, kind) {
  const el = document.getElementById("statusLine");
  el.textContent = text;
  el.className = "status-line" + (kind ? " " + kind : "");
}

function updateBackupLine() {
  const el = document.getElementById("backupLine");
  const count = backupStack.length;
  if (count === 0) el.textContent = "";
  else if (count === 1) el.textContent = "1 screen backup";
  else el.textContent = `${count} screen backups`;
}

function applyGridToEntries(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (!givenCells.has(key)) {
        const val = grid[r][c];
        solvingCells[key].value = val !== 0 ? val : "";
      }
    }
  }
}

function isGridComplete(grid) {
  return grid.every((row) => row.every((v) => v !== 0));
}

// A completed grid is a genuine solution only if every row, column, and box
// is missing nothing -- i.e. contains each digit 1-9 exactly once. This
// check matters because SudokuLogic.solve() only ever fills EMPTY cells: a
// grid with none left to fill is reported "solved" without solve() ever
// looking at whether the cells that are already there conflict with each
// other.
function isGridFullyValid(grid) {
  const { rowMissing, colMissing, boxMissing } = SudokuLogic.buildTrackingSets(grid);
  return (
    rowMissing.every((s) => s.size === 0) &&
    colMissing.every((s) => s.size === 0) &&
    boxMissing.every((s) => s.size === 0)
  );
}

// Fills in the solved grid, locks every guessed (non-given) cell, and
// recolors its text blue -- leaving the cell's white background alone.
function markSolved(grid) {
  applyGridToEntries(grid);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (!givenCells.has(key)) {
        solvingCells[key].disabled = true;
        solvingCells[key].style.color = "var(--solved-guess)";
      }
    }
  }
  showSolvedHighlight();
}

// Undoes markSolved()'s disabling/recoloring -- re-enables every guessed
// cell and drops back to the stylesheet's default guess color. Called
// before Reset writes new values into the grid, so a puzzle that was
// solved (manually or automatically) and then reset is actually editable
// again, instead of staying locked and blue.
function clearSolvedStyling() {
  for (const key in solvingCells) {
    if (!givenCells.has(key)) {
      solvingCells[key].disabled = false;
      solvingCells[key].style.color = "";
    }
  }
}

// Whether every guessed cell currently has the .solved-highlight yellow
// flash applied -- lets clearSolvedHighlight() no-op cheaply when there's
// nothing to clear.
let solvedHighlightActive = false;

// Adds the yellow success-flash background to every guessed (non-given)
// cell, on top of whatever markSolved() already did (disabling, blue
// text). Left as its own function/class -- separate from .selected --
// so this success flash and the click-to-select highlight never fight
// over the same class or state.
function showSolvedHighlight() {
  for (const key in solvingCells) {
    if (!givenCells.has(key)) {
      solvingCells[key].classList.add("solved-highlight");
    }
  }
  solvedHighlightActive = true;
}

// Removes the yellow success flash -- and only that -- leaving disabled
// state and the blue solved-text color untouched (clearSolvedStyling()
// owns those). Tied to puzzle STATE, not interaction: called only from the
// same handful of places that call clearSolvedStyling() (Reset, Undo) plus
// goToEntryScreen(), i.e. exactly when the grid stops being a completed,
// solved puzzle. Never called from generic click/keypress listeners --
// the yellow should outlive any amount of clicking or key-pressing as long
// as the solved grid on screen hasn't actually changed.
function clearSolvedHighlight() {
  if (!solvedHighlightActive) return;
  for (const key in solvingCells) {
    solvingCells[key].classList.remove("solved-highlight");
  }
  solvedHighlightActive = false;
}

// Shared by the Solve button and the auto-solve check below: validates the
// current grid and, on success, fills in any remaining blanks and shows
// "Solved!" plus the iteration count -- exactly like sudoku_gui.py's
// SudokuGUI._on_solve.
function attemptSolve() {
  const grid = readGrid(solvingCells);
  const { solved: solverSucceeded } = SudokuLogic.solve(grid);
  const solved = solverSucceeded && isGridFullyValid(grid);

  if (solved) {
    markSolved(grid);
    setStatus("Solved!", "success");
    showIterationCount();
  } else {
    setStatus("No solution exists for the current entries.", "error");
  }
  updateCandidateLabels();
  return solved;
}

// Runs after every successful guess (see onSolvingCellInput and
// fillSelectedCellWithDigit): if the grid now has no blanks left, this
// automatically runs the exact same logic as clicking Solve, so the person
// never has to click it themselves once every square is filled in.
function maybeAutoSolve() {
  if (isGridComplete(readGrid(solvingCells))) attemptSolve();
}

document.getElementById("saveBtn").addEventListener("click", () => {
  clearIterationCount();
  const grid = readGrid(solvingCells);
  backupStack.push(grid);
  updateBackupLine();
});

document.getElementById("writeToFileBtn").addEventListener("click", () => {
  clearIterationCount();

  const grid = readGrid(solvingCells);
  const record =
    grid.flat().join("") + SudokuLogic.rateDifficulty(currentReiterationCount)[0]; // E/M/H

  const blob = new Blob([record + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = SAVE_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  setStatus(`Saved to ${SAVE_FILE_NAME}.`, "success");
});

document.getElementById("solveBtn").addEventListener("click", () => {
  clearSelection();
  attemptSolve();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  clearSolvedHighlight();
  clearSelection();
  clearIterationCount();
  clearSolvedStyling();
  // The restored grid (backup or original puzzle) is a new baseline -- any
  // moves recorded before this Reset no longer correspond to cells Ctrl+Z
  // should be undoing.
  moveHistory = [];
  redoStack = [];
  if (backupStack.length > 0) {
    const grid = backupStack.pop();
    applyGridToEntries(grid);
    updateBackupLine();
    setStatus("Restored last saved backup.", "info");
  } else {
    for (const key in solvingCells) {
      if (!givenCells.has(key)) {
        solvingCells[key].value = "";
      }
    }
    setStatus("No backups saved -- cleared to puzzle.", "error");
  }
  updateCandidateLabels();
});

document.getElementById("newClearBtn").addEventListener("click", () => {
  clearIterationCount();
  const confirmed = window.confirm(
    "This will discard the current puzzle and all saved backups. Are you " +
    "sure you want to continue?"
  );
  if (!confirmed) return;
  goToEntryScreen();
});

/* ===================== UNDO (CTRL+Z) ===================== */

// Appends one entered digit to moveHistory. Called from both digit-entry
// paths (typing and the candidate buttons) so Ctrl+Z can undo either kind of
// move the same way. A fresh move invalidates whatever had been undone
// before it, since redoing past it would overwrite it with stale state.
function recordMove(row, col, digit) {
  moveHistory.push({ row, col, digit });
  redoStack = [];
}

// Pops the most recent move, clears that square, and stashes the move on
// redoStack so Ctrl+Shift+Z can put the digit back. Also reverses
// markSolved()'s disabling/recoloring and drops the iteration count, so
// undoing a move after the puzzle auto-solved leaves the grid genuinely
// editable again instead of blank-but-locked.
function undoLastMove() {
  if (moveHistory.length === 0) return;
  const move = moveHistory.pop();
  redoStack.push(move);

  clearSelection();
  clearSolvedHighlight();
  clearSolvedStyling();
  clearIterationCount();
  setStatus("", "");
  solvingCells[`${move.row},${move.col}`].value = "";
  updateCandidateLabels();
}

// Pops the most recently undone move and re-fills that square, putting the
// move back on moveHistory so it can be undone again. Runs the same
// maybeAutoSolve check the original entry did, in case redoing completes
// the puzzle.
function redoLastMove() {
  if (redoStack.length === 0) return;
  const move = redoStack.pop();
  moveHistory.push(move);

  clearSelection();
  solvingCells[`${move.row},${move.col}`].value = String(move.digit);
  updateCandidateLabels();
  maybeAutoSolve();
}

/* ===================== HELP MODAL ===================== */

const helpOverlayEl = document.getElementById("helpOverlay");
const statsResultEl = document.getElementById("statsResult");

// GoatCounter's public "visitor counter" endpoint -- a read-only, no-login
// JSON/image/HTML endpoint meant for embedding on third-party pages (see
// https://www.goatcounter.com/help/visitor-counter), NOT the dashboard at
// sudoku-gilshannon.goatcounter.com itself. The special "TOTAL" path (no
// leading slash, case-sensitive) asks for the site-wide visit count rather
// than one page's. Requires the site owner to have turned on "Allow adding
// visitor counts on your website" in GoatCounter's settings -- until that's
// done this 403s, which showPuzzleStats() below treats the same as any
// other failure.
const GOATCOUNTER_CODE = "sudoku-gilshannon";
const STATS_URL = `https://${GOATCOUNTER_CODE}.goatcounter.com/counter/TOTAL.json`;
const STATS_FETCH_TIMEOUT_MS = 6000;

// Hides and clears any previously shown stats. Called every time the Help
// modal opens so "View Puzzle Stats" always has to be clicked fresh --
// stats never linger into a later Help visit without that click.
function resetStatsResult() {
  statsResultEl.hidden = true;
  statsResultEl.classList.remove("error");
  statsResultEl.textContent = "";
}

// Fetches the site's total visit count from GoatCounter's public counter
// endpoint and renders it into statsResultEl -- or a plain "unavailable"
// message if the request fails, times out, or the response isn't shaped
// the way GoatCounter's docs say it should be. Built with textContent/DOM
// nodes rather than innerHTML since `count` comes from a third party.
async function showPuzzleStats() {
  statsResultEl.hidden = false;
  statsResultEl.classList.remove("error");
  statsResultEl.textContent = "Loading puzzle stats…";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(STATS_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Unexpected response status: ${response.status}`);

    const data = await response.json();
    if (typeof data.count !== "string" && typeof data.count !== "number") {
      throw new Error("Unexpected response shape from GoatCounter.");
    }

    statsResultEl.textContent = "";
    statsResultEl.append("Total visits: ");
    const strong = document.createElement("strong");
    strong.textContent = String(data.count);
    statsResultEl.append(strong);
    const note = document.createElement("span");
    note.className = "stats-note";
    note.textContent = "Public GoatCounter data — read-only, no login required.";
    statsResultEl.append(note);
  } catch (e) {
    statsResultEl.classList.add("error");
    statsResultEl.textContent = "Puzzle stats are currently unavailable.";
  } finally {
    clearTimeout(timeoutId);
  }
}

function showHelp() {
  document.getElementById("helpVersionLine").textContent =
    `Version ${APP_VERSION} — Last updated: ${HELP_LAST_UPDATED}`;
  resetStatsResult();
  helpOverlayEl.classList.add("active");
}

function hideHelp() {
  helpOverlayEl.classList.remove("active");
}

document.getElementById("entryHelpBtn").addEventListener("click", () => {
  clearEntryHint();
  showHelp();
});
document.getElementById("solvingHelpBtn").addEventListener("click", () => {
  clearIterationCount();
  showHelp();
});
document.getElementById("statsBtn").addEventListener("click", showPuzzleStats);
document.getElementById("helpCloseBtn").addEventListener("click", hideHelp);
helpOverlayEl.addEventListener("click", (event) => {
  if (event.target === helpOverlayEl) hideHelp();
});
document.addEventListener("keydown", (event) => {
  // Any key press clears the candidate display -- other than pressing a
  // candidate button or the selected cell itself, which don't go through
  // here. The input event a digit key triggers still fires after this
  // (browsers dispatch keydown before input), so typing itself is
  // unaffected; only the candidate highlight drops early. The post-solve
  // yellow flash is untouched here -- it tracks puzzle state, not key
  // presses (see clearSolvedHighlight()).
  if (selectedCell !== null) clearSelection();

  if (event.key === "Escape") hideHelp();

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    if (document.getElementById("solvingScreen").classList.contains("active")) {
      event.preventDefault();
      if (event.shiftKey) {
        redoLastMove();
      } else {
        undoLastMove();
      }
    }
  }
});

initEntryScreen();

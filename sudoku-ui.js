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

const ENTRY_HINT_TEXT = "Type a digit into any square you want filled — leave the rest blank.";

// Caps how many backtracking guesses Paste Puzzle's validate-by-solving
// check will spend on a pasted puzzle before giving up and treating it as
// invalid -- see sudoku_gui.py's PASTE_VALIDATION_MAX_ITERATIONS for why
// this exists (a corrupted/untrusted grid's contradiction can otherwise
// take an impractically long time to prove).
const PASTE_VALIDATION_MAX_ITERATIONS = 50_000;

let puzzle = null;
let givenCells = new Set();
let backupStack = [];

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
  input.value = v;
}

function initEntryScreen() {
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
let solvingCells = null;
let rowMissingLabels = [];
let colMissingLabels = [];

function launchSolvingScreen(puzzleGrid, reiterationCount) {
  puzzle = puzzleGrid;
  givenCells = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (puzzle[r][c] !== 0) givenCells.add(`${r},${c}`);
    }
  }
  backupStack = [];

  document.getElementById("pageTitle").textContent = "Sudoku Solver";
  difficultyLineEl.textContent = `Difficulty Level: ${SudokuLogic.rateDifficulty(reiterationCount)}`;
  document.getElementById("entryScreen").classList.remove("active");
  document.getElementById("solvingScreen").classList.add("active");

  buildSolvingGrid();
  updateCandidateLabels();
  updateBackupLine();
  setStatus("", "");
}

function goToEntryScreen() {
  puzzle = null;
  givenCells = new Set();
  backupStack = [];

  document.getElementById("pageTitle").textContent = "Enter Your Puzzle";
  difficultyLineEl.textContent = "";
  document.getElementById("solvingScreen").classList.remove("active");
  document.getElementById("entryScreen").classList.add("active");

  resetEntryGrid();
  clearEntryHint();
  document.querySelectorAll('input[name="difficulty"]').forEach((radio) => {
    radio.checked = false;
  });
}

function buildSolvingGrid() {
  solvingGridEl.innerHTML = "";
  solvingCells = buildGridDOM(solvingGridEl, {
    editableAll: false,
    puzzleForGivens: puzzle,
    onCellInput: onSolvingCellInput,
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
}

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
  updateCandidateLabels();
}

function updateCandidateLabels() {
  const grid = readGrid(solvingCells);
  const { rowMissing, colMissing } = SudokuLogic.buildTrackingSets(grid);

  for (let r = 0; r < 9; r++) {
    const digits = [...rowMissing[r]].sort((a, b) => a - b);
    rowMissingLabels[r].textContent = digits.length ? digits.join(" ") : "done";
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

document.getElementById("saveBtn").addEventListener("click", () => {
  const grid = readGrid(solvingCells);
  backupStack.push(grid);
  updateBackupLine();
});

document.getElementById("solveBtn").addEventListener("click", () => {
  const grid = readGrid(solvingCells);
  const { solved } = SudokuLogic.solve(grid);

  if (solved) {
    applyGridToEntries(grid);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        if (!givenCells.has(key)) {
          solvingCells[key].disabled = true;
          solvingCells[key].style.color = "var(--guess)";
        }
      }
    }
    setStatus("Solved!", "success");
  } else {
    setStatus("No solution exists for the current entries.", "error");
  }
  updateCandidateLabels();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (backupStack.length > 0) {
    const grid = backupStack.pop();
    applyGridToEntries(grid);
    updateBackupLine();
    setStatus("Restored last saved backup.", "info");
  } else {
    for (const key in solvingCells) {
      if (!givenCells.has(key)) {
        solvingCells[key].disabled = false;
        solvingCells[key].value = "";
      }
    }
    setStatus("No backups saved -- cleared to puzzle.", "error");
  }
  updateCandidateLabels();
});

document.getElementById("newClearBtn").addEventListener("click", () => {
  const confirmed = window.confirm(
    "This will discard the current puzzle and all saved backups. Are you " +
    "sure you want to continue?"
  );
  if (!confirmed) return;
  goToEntryScreen();
});

/* ===================== HELP MODAL ===================== */

const helpOverlayEl = document.getElementById("helpOverlay");

function showHelp() {
  helpOverlayEl.classList.add("active");
}

function hideHelp() {
  helpOverlayEl.classList.remove("active");
}

document.getElementById("entryHelpBtn").addEventListener("click", () => {
  clearEntryHint();
  showHelp();
});
document.getElementById("solvingHelpBtn").addEventListener("click", showHelp);
document.getElementById("helpCloseBtn").addEventListener("click", hideHelp);
helpOverlayEl.addEventListener("click", (event) => {
  if (event.target === helpOverlayEl) hideHelp();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideHelp();
});

initEntryScreen();

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

const APP_VERSION = "1.2.2";
const HELP_LAST_UPDATED = "September 6, 2026";

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

// Synthesized "glass breaking" crash, same no-dependencies/no-asset
// approach as beep() above (Web Audio API only), just layering more than
// one sound source so it reads as a crash rather than another single tone:
// a short burst of filtered white noise for the low "crash," plus a
// handful of brief, randomly pitched/timed high tones on top for the
// higher "tinkle" of individual shards. Played by shatterButton() itself,
// so it automatically only ever fires when the visual shatter does too
// (shatterButton() is only ever called from the non-reduced-motion branch
// at each call site -- see shatterButton() below).
function shatterSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Duration doubled (was 0.25s) and gain peaks raised (noise was 0.2,
    // tones were 0.08) so the crash reads as clearly audible and lasts
    // noticeably longer -- noise gets the bigger boost since it's a single
    // sound source (less risk of several overlapping sources summing past
    // 1.0 and clipping), while the many per-tone gains are raised more
    // conservatively since up to 7 of them can overlap at once.
    const noiseDuration = 0.5;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDuration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 2000;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + noiseDuration);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + noiseDuration);

    const shardTones = randomInt(5, 7);
    for (let i = 0; i < shardTones; i++) {
      const startTime = ctx.currentTime + Math.random() * 0.16;
      const duration = 0.1 + Math.random() * 0.16;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 2500 + Math.random() * 3000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
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

/* ===================== BUTTON SHATTER EFFECT ===================== */
// Purely cosmetic "shatter" effect, reusable for any button: clones it into
// 5-8 jagged pieces and animates them falling off the bottom of the screen.
// Used by the Help modal's "View Puzzle Stats" button (see showHelp() etc.
// below) and the solving screen's Solve button on a successful solve (see
// showSolvedHighlight()/clearSolvedHighlight()) -- both call the same
// shatterButton()/resetButtonShatter() pair rather than each having their
// own copy. Each shard is tagged with which button it came from
// (data-shatter-owner), so if both buttons happened to shatter around the
// same time, resetting one's shards/visibility never touches the other's.

// Checked once, not per-click/per-button, since a user's OS-level motion
// preference doesn't change mid-session. window.matchMedia is absent in
// the jsdom environment the test suite runs under (real browsers all have
// it) -- falls back to "no reduced-motion preference" there.
const prefersReducedMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Builds shardCount+1 boundary points (0-100, in percent of the button's
// width) for both the top and bottom edge of the cut lines between shards.
// The two outer boundaries (0 and 100) are left exactly on the button's
// real left/right edges -- unjittered -- so the first and last shard keep
// the button's actual rounded corners. Every interior boundary is jittered
// independently for top vs. bottom, which is what turns a straight vertical
// cut into a jagged diagonal one.
function buildShatterBoundaries(shardCount) {
  const step = 100 / shardCount;
  const base = Array.from({ length: shardCount + 1 }, (_, i) => i * step);
  const jitter = (points) =>
    points.map((v, i) => {
      if (i === 0 || i === points.length - 1) return v;
      return v + (Math.random() - 0.5) * step * 0.6;
    });
  return { top: jitter(base), bottom: jitter(base) };
}

// Clones btnEl into 5-8 jagged vertical shards, each clip-path'd down to
// one slice of the real clone, fixed-positioned exactly over btnEl's
// current on-screen spot, then animated falling off the bottom of the
// screen with a random rotation and horizontal drift each. Every shard
// removes itself from the DOM the instant its own animation ends, so
// nothing lingers. btnEl itself is hidden (not removed -- see
// resetButtonShatter()) the instant this runs.
//
// Buttons in this app can have a transparent `.secondary` background, with
// only a 1px border around the true outer edge and text as their visible
// content. A clip-path slice through a button's interior crops away that
// border entirely, leaving a shard with nothing visible but empty
// transparent space (at most a sliver of text) -- which is why the very
// first version of this effect ran perfectly (every shard really was
// created, positioned, and animated) but was completely invisible. Each
// shard gets an explicit solid background (the app's normal
// *primary*-button fill) purely for this effect, so every piece reads as a
// solid chunk breaking off, rather than relying on the real button's
// styling (which may or may not have a visible fill of its own). Also
// plays the synthesized shatterSound() crash (see above) at the same
// moment -- every call site only ever reaches this function from its own
// non-reduced-motion branch, so the sound automatically shares the same
// prefers-reduced-motion gating as the visual effect with no separate check
// needed here.
function shatterButton(btnEl) {
  shatterSound();

  const rect = btnEl.getBoundingClientRect();
  const shardCount = randomInt(5, 8);
  const { top, bottom } = buildShatterBoundaries(shardCount);

  btnEl.style.visibility = "hidden";

  for (let i = 0; i < shardCount; i++) {
    const shard = btnEl.cloneNode(true);
    shard.removeAttribute("id");
    shard.tabIndex = -1;
    shard.classList.add("shatter-shard");
    shard.dataset.shatterOwner = btnEl.id;
    // cloneNode(true) copies btnEl's whole style attribute, including the
    // visibility:hidden just set above -- reset it explicitly (not just to
    // "", which only happens to work because no stylesheet rule sets
    // visibility on buttons) so every shard is visible regardless of
    // ordering relative to when the real button gets hidden.
    shard.style.visibility = "visible";
    shard.style.left = `${rect.left}px`;
    shard.style.top = `${rect.top}px`;
    shard.style.width = `${rect.width}px`;
    shard.style.height = `${rect.height}px`;
    shard.style.background = "var(--ink)";
    shard.style.clipPath =
      `polygon(${top[i]}% 0%, ${top[i + 1]}% 0%, ${bottom[i + 1]}% 100%, ${bottom[i]}% 100%)`;
    shard.style.setProperty("--shard-dx", `${randomInt(-50, 50)}px`);
    shard.style.setProperty("--shard-dy", `${Math.round(window.innerHeight - rect.top + 120)}px`);
    shard.style.setProperty("--shard-rot", `${randomInt(-140, 140)}deg`);
    shard.style.animationDuration = `${randomInt(500, 850)}ms`;
    shard.style.animationDelay = `${randomInt(0, 60)}ms`;
    shard.addEventListener("animationend", () => shard.remove());
    document.body.append(shard);
  }
}

// Belt-and-braces reset for one specific button's shatter: removes only
// that button's own shard clones still in the DOM, identified via
// data-shatter-owner (each shard normally self-removes on animationend, so
// this is only a backstop), and restores that button's own visibility --
// independent of any other button that might be mid-shatter at the same
// time. Run every time a button needs to be guaranteed intact and
// clickable again.
function resetButtonShatter(btnEl) {
  document
    .querySelectorAll(`.shatter-shard[data-shatter-owner="${btnEl.id}"]`)
    .forEach((shard) => shard.remove());
  btnEl.style.visibility = "";
}

/* ===================== SOLVING SCREEN ===================== */

const solvingGridEl = document.getElementById("solvingGrid");
const difficultyLineEl = document.getElementById("difficultyLine");
const iterationLineEl = document.getElementById("iterationLine");
const solveBtnEl = document.getElementById("solveBtn");
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
//
// Also the single trigger point for shattering the Solve button (see
// shatterButton() and the BUTTON SHATTER EFFECT section) -- solvedHighlightActive
// is this app's existing "is the grid currently solved and untouched"
// source of truth, so Solve reuses it rather than tracking its own
// separate solved/not-solved state.
function showSolvedHighlight() {
  for (const key in solvingCells) {
    if (!givenCells.has(key)) {
      solvingCells[key].classList.add("solved-highlight");
    }
  }
  solvedHighlightActive = true;
  if (prefersReducedMotion.matches) {
    // The blank space Solve leaves behind is a real state change, not just
    // a cosmetic flourish -- still applies under reduced motion, just
    // without the falling-shards animation.
    solveBtnEl.style.visibility = "hidden";
  } else {
    shatterButton(solveBtnEl);
  }
}

// Removes the yellow success flash -- and only that -- leaving disabled
// state and the blue solved-text color untouched (clearSolvedStyling()
// owns those). Tied to puzzle STATE, not interaction: called only from the
// same handful of places that call clearSolvedStyling() (Reset, Undo) plus
// goToEntryScreen(), i.e. exactly when the grid stops being a completed,
// solved puzzle. Never called from generic click/keypress listeners --
// the yellow should outlive any amount of clicking or key-pressing as long
// as the solved grid on screen hasn't actually changed. Also restores the
// Solve button (see showSolvedHighlight() above) for the same reason.
function clearSolvedHighlight() {
  if (!solvedHighlightActive) return;
  for (const key in solvingCells) {
    solvingCells[key].classList.remove("solved-highlight");
  }
  solvedHighlightActive = false;
  resetButtonShatter(solveBtnEl);
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
const countryStatsOverlayEl = document.getElementById("countryStatsOverlay");
const countryStatsResultEl = document.getElementById("countryStatsResult");
const statsBtnEl = document.getElementById("statsBtn");

// How long the shatter (see shatterButton() above) plays before the
// country-stats popup opens underneath the falling pieces -- just long
// enough to read as "the button broke, and now here's the popup," not so
// long it delays the popup's own (independent) fetch for no reason.
const STATS_SHATTER_POPUP_DELAY_MS = 350;

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

// Same idea as resetStatsResult() above, but for the separate country-
// breakdown popup -- see showCountryStats() for why this is a wholly
// independent element/function pair rather than sharing statsResultEl.
function resetCountryStatsResult() {
  countryStatsResultEl.hidden = true;
  countryStatsResultEl.classList.remove("error");
  countryStatsResultEl.textContent = "";
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

// Relative path, since stats-snapshot.json is written to the repo root by
// the "Update Puzzle Stats" GitHub Action (see .github/workflows/
// update-stats.yml and scripts/fetch_goatcounter_stats.py) and served
// alongside index.html from the same origin -- no GoatCounter API token
// belongs in this front-end code, only that workflow's Actions secret has
// one.
const STATS_SNAPSHOT_URL = "stats-snapshot.json";
const STATS_SNAPSHOT_FETCH_TIMEOUT_MS = 6000;

// Fetches the pre-generated country-visit breakdown and renders it into
// countryStatsResultEl (inside the country-stats popup, not the Help
// modal) -- or "Stats unavailable" if the file is missing, the request
// fails/times out, or its JSON isn't shaped as expected. Kept entirely
// separate from showPuzzleStats() above -- its own element, own
// AbortController, own try/catch -- so a GoatCounter counter-endpoint
// hiccup and a missing/broken stats-snapshot.json can never affect each
// other; each shows its own result (or its own failure) independently.
async function showCountryStats() {
  countryStatsResultEl.hidden = false;
  countryStatsResultEl.classList.remove("error");
  countryStatsResultEl.textContent = "Loading country breakdown…";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATS_SNAPSHOT_FETCH_TIMEOUT_MS);

  try {
    // cache: "no-store" bypasses the ordinary HTTP cache, not just the
    // service worker's Cache Storage -- GitHub Pages serves this file with
    // `Cache-Control: max-age=600`, and the service worker already lets this
    // request go straight to the network (see sw.js's isNetworkOnly()), but
    // without this option the browser's own HTTP cache could still hand back
    // a response cached from up to 10 minutes ago instead of hitting the
    // network at all.
    const response = await fetch(STATS_SNAPSHOT_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Unexpected response status: ${response.status}`);

    const data = await response.json();
    if (
      typeof data.updated !== "string" ||
      !Array.isArray(data.countries) ||
      !data.countries.every(
        (c) => c && typeof c.country === "string" && typeof c.count === "number"
      )
    ) {
      throw new Error("Unexpected shape in stats-snapshot.json.");
    }

    countryStatsResultEl.textContent = "";
    const heading = document.createElement("div");
    heading.textContent = `Visitor countries (updated ${data.updated}):`;
    countryStatsResultEl.append(heading);

    const list = document.createElement("ul");
    for (const { country, count } of data.countries) {
      const li = document.createElement("li");
      li.textContent = `${country} — ${count}`;
      list.append(li);
    }
    countryStatsResultEl.append(list);
  } catch (e) {
    countryStatsResultEl.classList.add("error");
    countryStatsResultEl.textContent = "Stats unavailable";
  } finally {
    clearTimeout(timeoutId);
  }
}

function showHelp() {
  document.getElementById("helpVersionLine").textContent =
    `Version ${APP_VERSION} — Last updated: ${HELP_LAST_UPDATED}`;
  resetStatsResult();
  resetButtonShatter(statsBtnEl);
  helpOverlayEl.classList.add("active");
}

function hideHelp() {
  helpOverlayEl.classList.remove("active");
}

// Opens the country-stats popup layered on top of the Help modal (both
// stay active at once -- closing this popup leaves the Help modal open
// behind it) and kicks off its fetch. See showCountryStats() for the fetch
// itself; this just owns the popup's own show/hide state.
function showCountryStatsPopup() {
  resetCountryStatsResult();
  countryStatsOverlayEl.classList.add("active");
  showCountryStats();
}

function hideCountryStatsPopup() {
  countryStatsOverlayEl.classList.remove("active");
  resetButtonShatter(statsBtnEl);
}

document.getElementById("entryHelpBtn").addEventListener("click", () => {
  clearEntryHint();
  showHelp();
});
document.getElementById("solvingHelpBtn").addEventListener("click", () => {
  clearIterationCount();
  showHelp();
});
statsBtnEl.addEventListener("click", () => {
  // Two independent fetches, not one awaiting the other -- see
  // showCountryStats()'s comment for why they must stay decoupled. One
  // renders into the Help modal itself (showPuzzleStats), the other opens
  // a separate popup on top of it (showCountryStatsPopup). The shatter is
  // purely cosmetic on top of that: skipped entirely under
  // prefers-reduced-motion (both fetches then start immediately, exactly
  // as before), otherwise it just delays the popup opening by
  // STATS_SHATTER_POPUP_DELAY_MS for comedic timing -- it never touches
  // either fetch.
  showPuzzleStats();
  if (prefersReducedMotion.matches) {
    showCountryStatsPopup();
  } else {
    shatterButton(statsBtnEl);
    setTimeout(showCountryStatsPopup, STATS_SHATTER_POPUP_DELAY_MS);
  }
});
document.getElementById("helpCloseBtn").addEventListener("click", hideHelp);
helpOverlayEl.addEventListener("click", (event) => {
  if (event.target === helpOverlayEl) hideHelp();
});
// Manual escape hatch: re-runs the same fetch showCountryStats() already
// does on open (cache: "no-store", so it always hits the network) in case
// stats ever look stale for any reason -- no need to close/reopen the popup
// or the whole app to force a fresh read.
document.getElementById("countryStatsRefreshBtn").addEventListener("click", showCountryStats);
document.getElementById("countryStatsCloseBtn").addEventListener("click", hideCountryStatsPopup);
countryStatsOverlayEl.addEventListener("click", (event) => {
  if (event.target === countryStatsOverlayEl) hideCountryStatsPopup();
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

  if (event.key === "Escape") {
    hideCountryStatsPopup();
    hideHelp();
  }

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

// PWA install support -- registers sw.js so the app can be installed to a
// phone's home screen and keep working offline. Feature-detected since
// older browsers have no serviceWorker API at all. Only works over HTTPS or
// localhost; a plain file:// open silently skips this (see README).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.error("Service worker registration failed:", e);
    });
  });
}

initEntryScreen();

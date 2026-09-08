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

const APP_VERSION = "4.0.3";
const HELP_LAST_UPDATED = "September 7, 2026";

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

// Print Puzzle image. Letter-size (8.5in x 11in) portrait at a
// print-appropriate 150 DPI -- 8.5*150 x 11*150 -- rendered on an in-memory
// <canvas> (never attached to the DOM) and exported as a JPG data URL
// (canvas.toDataURL()) that printBtn points its hidden #printImage at.
const PRINT_JPEG_QUALITY = 0.92;
const PRINT_CANVAS_WIDTH = 1275;
const PRINT_CANVAS_HEIGHT = 1650;

// Layout constants for renderPrintCanvas() below. PRINT_CELL_SIZE=100 was
// picked so the grid (900px) plus the row-missing-label column to its right
// lands with near-symmetric left/right margins (~80px each) at this canvas
// width -- see renderPrintCanvas()'s comment for the rest of the layout math.
// All exact pixel values here (canvas resolution, margins, cell size, label
// column sizes, candidate mini-grid font size) are judgment calls with no
// single "correct" answer -- easy to retune if the printed output looks off.
const PRINT_MARGIN_X = 80;
const PRINT_CELL_SIZE = 100;
const PRINT_GRID_SIZE = PRINT_CELL_SIZE * 9;
const PRINT_ROW_LABEL_GAP = 16;
const PRINT_COL_LABEL_GAP = 16;
const PRINT_COL_LABEL_HEIGHT = 200;
const PRINT_HEADER_HEIGHT = 170;
const PRINT_GIVEN_FILL = "#d9d3c4";
const PRINT_INK = "#241c15";
const PRINT_HINT_INK = "#6b4a32";

let puzzle = null;
let givenCells = new Set();
let backupStack = [];

// Every digit the user has entered on the solving screen (typed or via a
// candidate button), in order, so Ctrl+Z can undo them one at a time --
// separate from backupStack, which only restores whole-grid snapshots taken
// by clicking Backup for Reset.
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
  // Invalidates any reassembleButton() completion still pending for this
  // button (see there) -- otherwise a rapid shatter -> reassemble ->
  // shatter sequence (possible in the Special view: Next/Prior can toggle
  // faster than one animation cycle) could let a stale reassemble callback
  // reveal the button again right after this call just re-hid it.
  btnEl._shatterToken = null;

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

// Reverse of shatterButton() above -- used when the Special view's Prior/
// Next buttons come back after being shattered away for being at the
// first/last box (see updateSpecialNavButtons()). Builds the same jagged
// shard clones and reuses buildShatterBoundaries() for their shapes, but
// starts each one already displaced (below the viewport, drifted and
// rotated -- the same --shard-dx/dy/rot ranges shatterButton()'s shards
// land at) and animates it INTO the button's real resting position via
// the .shatter-shard-assemble/@keyframes shatterAssemble CSS (see
// index.html), revealing the real button the instant the last shard
// finishes. No sound -- shatterSound() is a crash/break noise that
// wouldn't make sense playing in reverse.
function reassembleButton(btnEl) {
  const rect = btnEl.getBoundingClientRect();
  const shardCount = randomInt(5, 8);
  const { top, bottom } = buildShatterBoundaries(shardCount);

  // Identifies this specific reassembly -- if a newer shatterButton() or
  // reassembleButton() call supersedes it before all shards finish, this
  // token no longer matches btnEl._shatterToken and the stale completion
  // below skips revealing the button (see shatterButton()'s own comment).
  const token = {};
  btnEl._shatterToken = token;

  btnEl.style.visibility = "hidden";
  let remaining = shardCount;

  for (let i = 0; i < shardCount; i++) {
    const shard = btnEl.cloneNode(true);
    shard.removeAttribute("id");
    shard.tabIndex = -1;
    shard.classList.add("shatter-shard", "shatter-shard-assemble");
    shard.dataset.shatterOwner = btnEl.id;
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
    shard.addEventListener("animationend", () => {
      shard.remove();
      remaining -= 1;
      if (remaining === 0 && btnEl._shatterToken === token) resetButtonShatter(btnEl);
    });
    document.body.append(shard);
  }
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

// instant=false shatters the solving screen away first (see
// transitionScreens() in the SPECIAL VIEW section below) instead of
// swapping to the entry screen immediately -- used by New/Clear when
// there's actually something on the board to dramatically discard (see
// its handler). Defaults to instant so any other caller keeps today's
// plain, unanimated swap.
function goToEntryScreen(instant = true) {
  clearSolvedHighlight();
  puzzle = null;
  givenCells = new Set();
  backupStack = [];
  moveHistory = [];
  redoStack = [];

  document.getElementById("pageTitle").textContent = `Enter Your Puzzle v${APP_VERSION}`;
  difficultyLineEl.textContent = "";
  // Entry screen content is fully rebuilt now, while it's still
  // display:none -- ready before transitionScreens() below even starts a
  // shatter, let alone by the time one finishes.
  resetEntryGrid();
  clearEntryHint();
  clearIterationCount();
  document.querySelectorAll('input[name="difficulty"]').forEach((radio) => {
    radio.checked = false;
  });

  transitionScreens(document.getElementById("solvingScreen"), document.getElementById("entryScreen"), { instant });
}

function buildSolvingGrid() {
  solvingGridEl.innerHTML = "";
  selectedCell = null;
  rcHighlightedKeys = [];
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

// The "row,col" keys of cells currently wearing the pink row/column/box
// highlight (see applySelectionHighlights), so clearSelectionHighlights
// knows exactly which cells to un-highlight without scanning the whole grid.
let rcHighlightedKeys = [];

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
  clearSelectionHighlights();
  clearCandidateButtons();
}

// Adds the pink "rc-highlight" class to every cell sharing (row, col)'s
// row, column, or 3x3 box -- including (row, col) itself, since its own
// yellow .selected background-image reset (see index.html) always wins out
// over this pink tint regardless of class order.
function applySelectionHighlights(row, col) {
  const box = SudokuLogic.boxIndex(row, col);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r !== row && c !== col && SudokuLogic.boxIndex(r, c) !== box) continue;
      const key = `${r},${c}`;
      solvingCells[key].classList.add("rc-highlight");
      rcHighlightedKeys.push(key);
    }
  }
}

// Removes the pink highlight applied by applySelectionHighlights. Safe to
// call when nothing is highlighted.
function clearSelectionHighlights() {
  for (const key of rcHighlightedKeys) {
    solvingCells[key].classList.remove("rc-highlight");
  }
  rcHighlightedKeys = [];
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
// binding -- see buildGridDOM). Selects this cell: highlights it yellow,
// pink-tints its row/column/box, and shows its candidate buttons. Clicking
// a different cell than the one already selected clears the old selection
// first; re-clicking the same cell is a no-op.
function selectSolvingCell(row, col) {
  const key = `${row},${col}`;
  if (selectedCell === key) return;

  clearSelection();
  selectedCell = key;
  solvingCells[key].classList.add("selected");
  applySelectionHighlights(row, col);
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
  // Auto-solve can now also complete from the Special view (see
  // fillSpecialCellWithDigit()), where the main solving screen -- and so
  // solveBtnEl itself -- isn't on screen. shatterButton() measures the
  // button's real on-screen rect via getBoundingClientRect(), which is
  // zero-sized for anything inside a display:none ancestor, so shattering
  // it there would produce a broken, invisible effect -- skip straight to
  // the same instant-hide fallback reduced-motion already uses.
  const solveBtnVisible = document.getElementById("solvingScreen").classList.contains("active");
  if (prefersReducedMotion.matches || !solveBtnVisible) {
    // The blank space Solve leaves behind is a real state change, not just
    // a cosmetic flourish -- still applies here, just without the
    // falling-shards animation.
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

/* ===================== PRINT PUZZLE ===================== */

const printInvalidOverlayEl = document.getElementById("printInvalidOverlay");
const printImageEl = document.getElementById("printImage");

function showPrintInvalidPopup() {
  printInvalidOverlayEl.classList.add("active");
}

function hidePrintInvalidPopup() {
  printInvalidOverlayEl.classList.remove("active");
}

// Returns the current grid if it has a valid solution, or shows the
// "Cannot Print" popup and returns null if not. Called by printBtn's
// handler, which only ever handles the grid once it knows it's real.
function getPrintableGridOrShowInvalid() {
  clearIterationCount();

  const grid = readGrid(solvingCells);
  const solvabilityCheck = grid.map((row) => row.slice());
  const { solved } = SudokuLogic.solve(solvabilityCheck);
  if (!(solved && isGridFullyValid(solvabilityCheck))) {
    showPrintInvalidPopup();
    return null;
  }
  return grid;
}

// Draws the current grid onto a fresh, never-attached-to-the-DOM <canvas>
// and returns it as a JPG data URL. Letter-size portrait layout: a header
// (title/difficulty/date), the 9x9 grid (givens shaded grey, guesses on a
// plain background, empty cells showing their remaining candidates in a
// small 3x3 mini-grid), and the same row/column missing-digit labels shown
// on screen (see updateCandidateLabels()) in the same right/bottom
// positions. Only ever called after the caller has confirmed grid has a
// valid solution -- this function itself doesn't check.
function renderPrintCanvas(grid) {
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_CANVAS_WIDTH;
  canvas.height = PRINT_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PRINT_CANVAS_WIDTH, PRINT_CANVAS_HEIGHT);

  // Vertically center the whole header+grid+column-labels block; the grid's
  // left edge stays a fixed PRINT_MARGIN_X from the canvas edge (see the
  // PRINT_CELL_SIZE comment above for why that lands near-symmetric).
  const contentHeight =
    PRINT_HEADER_HEIGHT + PRINT_GRID_SIZE + PRINT_COL_LABEL_GAP + PRINT_COL_LABEL_HEIGHT;
  const topY = Math.round((PRINT_CANVAS_HEIGHT - contentHeight) / 2);
  const gridLeft = PRINT_MARGIN_X;
  const gridTop = topY + PRINT_HEADER_HEIGHT;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PRINT_INK;
  ctx.font = "bold 34px Georgia, serif";
  ctx.fillText(
    document.getElementById("pageTitle").textContent,
    PRINT_CANVAS_WIDTH / 2,
    topY + 40
  );
  ctx.font = "22px Georgia, serif";
  ctx.fillText(
    difficultyLineEl.textContent || `Difficulty Level: ${SudokuLogic.rateDifficulty(currentReiterationCount)}`,
    PRINT_CANVAS_WIDTH / 2,
    topY + 78
  );
  ctx.font = "20px monospace";
  ctx.fillStyle = PRINT_HINT_INK;
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    PRINT_CANVAS_WIDTH / 2,
    topY + 110
  );

  const { rowMissing, colMissing } = SudokuLogic.buildTrackingSets(grid);

  // Given-cell background shading (drawn before the grid lines/digits so
  // the lines and text land cleanly on top of it).
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!givenCells.has(`${r},${c}`)) continue;
      ctx.fillStyle = PRINT_GIVEN_FILL;
      ctx.fillRect(
        gridLeft + c * PRINT_CELL_SIZE,
        gridTop + r * PRINT_CELL_SIZE,
        PRINT_CELL_SIZE,
        PRINT_CELL_SIZE
      );
    }
  }

  // Grid lines: thin between individual cells, thicker every 3rd line
  // (the 3x3 box boundaries), same structure as the on-screen .box-right/
  // .box-bottom borders.
  ctx.strokeStyle = PRINT_INK;
  for (let i = 0; i <= 9; i++) {
    ctx.lineWidth = i % 3 === 0 ? 5 : 1.5;
    const x = gridLeft + i * PRINT_CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridTop + PRINT_GRID_SIZE);
    ctx.stroke();

    const y = gridTop + i * PRINT_CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridLeft + PRINT_GRID_SIZE, y);
    ctx.stroke();
  }

  // Digits (givens vs. guesses) and, for every still-empty cell, its valid
  // candidates -- same computeValidCandidates() the solving screen's
  // candidate buttons use -- arranged in a small 3x3 mini-grid within the
  // cell (digit d sits at mini-row floor((d-1)/3), mini-col (d-1)%3).
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      const x = gridLeft + c * PRINT_CELL_SIZE;
      const y = gridTop + r * PRINT_CELL_SIZE;
      const val = grid[r][c];

      if (val !== 0) {
        const isGiven = givenCells.has(key);
        ctx.fillStyle = PRINT_INK;
        ctx.font = `${isGiven ? "bold " : ""}44px monospace`;
        ctx.fillText(String(val), x + PRINT_CELL_SIZE / 2, y + PRINT_CELL_SIZE / 2);
      } else {
        const candidates = new Set(computeValidCandidates(r, c));
        const sub = PRINT_CELL_SIZE / 3;
        ctx.font = "18px monospace";
        ctx.fillStyle = PRINT_HINT_INK;
        for (let digit = 1; digit <= 9; digit++) {
          if (!candidates.has(digit)) continue;
          const miniRow = Math.floor((digit - 1) / 3);
          const miniCol = (digit - 1) % 3;
          ctx.fillText(
            String(digit),
            x + miniCol * sub + sub / 2,
            y + miniRow * sub + sub / 2
          );
        }
      }
    }
  }

  // Row-missing labels, to the right of the grid -- same digits/format as
  // updateCandidateLabels() (space-joined, checkmark once complete).
  ctx.textAlign = "left";
  ctx.font = "20px monospace";
  ctx.fillStyle = PRINT_INK;
  for (let r = 0; r < 9; r++) {
    const digits = [...rowMissing[r]].sort((a, b) => a - b);
    const text = digits.length ? digits.join(" ") : "✓";
    ctx.fillText(
      text,
      gridLeft + PRINT_GRID_SIZE + PRINT_ROW_LABEL_GAP,
      gridTop + r * PRINT_CELL_SIZE + PRINT_CELL_SIZE / 2
    );
  }

  // Column-missing labels, stacked vertically beneath each column -- same
  // one-digit-per-line layout as the on-screen .col-missing labels.
  ctx.textAlign = "center";
  ctx.font = "16px monospace";
  const colLabelLineHeight = 20;
  for (let c = 0; c < 9; c++) {
    const digits = [...colMissing[c]].sort((a, b) => a - b);
    const lines = digits.length ? digits.map(String) : ["✓"];
    const x = gridLeft + c * PRINT_CELL_SIZE + PRINT_CELL_SIZE / 2;
    let y = gridTop + PRINT_GRID_SIZE + PRINT_COL_LABEL_GAP + colLabelLineHeight / 2;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += colLabelLineHeight;
    }
  }

  return canvas.toDataURL("image/jpeg", PRINT_JPEG_QUALITY);
}

// Prints directly instead of requiring the user to download a file and open
// it separately (a particular hassle on iOS, where that means digging the
// image out of the Files app before Share > Print is even reachable). Builds
// the same renderPrintCanvas() image, points #printImage at it, and calls
// window.print() -- @media print (see index.html's <style>) hides
// everything else on the page for the duration of the print dialog.
//
// Deliberately NOT window.open()-ing a separate print window/tab: besides
// desktop popup blockers (which only allow window.open() as a *synchronous*
// result of the click -- fine here since everything above is synchronous,
// no awaited work in between), window.print() called on a window opened via
// window.open() is known to be unreliable specifically on iOS Safari
// (prints a blank page, or the print sheet never appears at all). Printing
// the current document instead sidesteps that popup/child-window path
// entirely, which is why it's the more cross-browser-reliable technique --
// iOS Safari's Share Sheet "Print" (AirPrint) is then just its ordinary
// handling of a print-triggered document, no special-casing needed.
document.getElementById("printBtn").addEventListener("click", () => {
  const grid = getPrintableGridOrShowInvalid();
  if (!grid) return;

  const dataUrl = renderPrintCanvas(grid);

  // Setting .src to a value that's already loaded doesn't reliably re-fire
  // "load" in every browser (e.g. printing the same puzzle twice in a row
  // produces an identical data URL) -- so print immediately if the image is
  // already showing this exact data, otherwise wait for it to finish
  // decoding first.
  if (printImageEl.src === dataUrl && printImageEl.complete && printImageEl.naturalWidth > 0) {
    window.print();
    return;
  }
  printImageEl.onload = () => {
    printImageEl.onload = null;
    window.print();
  };
  printImageEl.src = dataUrl;
});

document.getElementById("printInvalidCloseBtn").addEventListener("click", hidePrintInvalidPopup);
printInvalidOverlayEl.addEventListener("click", (event) => {
  if (event.target === printInvalidOverlayEl) hidePrintInvalidPopup();
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
  // Shatters unless the screen is genuinely blank (no puzzle loaded at
  // all) -- puzzle is only ever null before a puzzle has been loaded onto
  // this screen (see goToEntryScreen() itself, which sets it back to null,
  // and launchSolvingScreen(), the only place that sets it to a real grid).
  // In practice this screen never IS blank when New/Clear is clickable
  // (Start Solving requires 6+ filled squares, Generate/Sample/Paste all
  // load a real puzzle too) -- so this shatters every time New/Clear
  // actually runs; the null check exists to state the intended rule
  // precisely rather than hardcode "always animate".
  goToEntryScreen(puzzle === null);
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

/* ===================== SPECIAL VIEW ===================== */
// Magnifies one of the puzzle's nine standard 3x3 boxes at a time. Reads
// from and writes straight into the same solvingCells inputs the main
// solving screen uses -- never a separate copy of the puzzle -- via the
// same computeValidCandidates()/recordMove()/updateCandidateLabels()/
// maybeAutoSolve() the main board's own candidate buttons already rely on.

// Whole-screen version of shatterButton() above (see there for the shard
// mechanics themselves) -- used to transition into/out of the Special view
// (see transitionScreens() below) instead of a single button. Clones the
// entire screen element into jagged vertical shards exactly like
// shatterButton() does, just more of them for the larger area, and -- unlike
// shatterButton()'s shards -- does NOT force a solid fill color, since a
// whole screen already has its own real board/parchment background to show
// through the cut lines (shatterButton() only needs that override because
// its buttons can have a transparent `.secondary` background). Every
// descendant's id is stripped from each clone (not just the screen's own),
// since the screen's subtree has several ids of its own (#solvingGrid,
// #candidateGrid, etc.) that would otherwise collide with the real,
// still-live element while the clones are briefly in the DOM. Purely a
// visual transition -- calls onComplete the instant the last shard
// finishes falling, and nothing about the puzzle's own state waits on it
// (see goToSpecialScreen()/returnFromSpecialScreen()).
function shatterScreen(screenEl, onComplete) {
  shatterSound();

  const rect = screenEl.getBoundingClientRect();
  const shardCount = randomInt(10, 16);
  const { top, bottom } = buildShatterBoundaries(shardCount);

  screenEl.style.visibility = "hidden";
  let remaining = shardCount;

  for (let i = 0; i < shardCount; i++) {
    const shard = screenEl.cloneNode(true);
    shard.removeAttribute("id");
    shard.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    shard.classList.add("shatter-shard");
    shard.style.visibility = "visible";
    shard.style.left = `${rect.left}px`;
    shard.style.top = `${rect.top}px`;
    shard.style.width = `${rect.width}px`;
    shard.style.height = `${rect.height}px`;
    shard.style.clipPath =
      `polygon(${top[i]}% 0%, ${top[i + 1]}% 0%, ${bottom[i + 1]}% 100%, ${bottom[i]}% 100%)`;
    shard.style.setProperty("--shard-dx", `${randomInt(-80, 80)}px`);
    shard.style.setProperty("--shard-dy", `${Math.round(window.innerHeight - rect.top + 200)}px`);
    shard.style.setProperty("--shard-rot", `${randomInt(-160, 160)}deg`);
    shard.style.animationDuration = `${randomInt(600, 950)}ms`;
    shard.style.animationDelay = `${randomInt(0, 90)}ms`;
    shard.addEventListener("animationend", () => {
      shard.remove();
      remaining -= 1;
      if (remaining === 0) onComplete();
    });
    document.body.append(shard);
  }
}

// Swaps the active screen from fromEl to toEl, shattering fromEl away first
// (see shatterScreen() above) unless reduced motion is on, in which case the
// swap just happens instantly -- same fallback shatterButton()'s own call
// sites use. Also happens instantly, regardless of reduced motion, when the
// caller passes { instant: true } -- used by goToEntryScreen() when New/Clear
// has nothing worth dramatically discarding (see its handler). toEl's own
// content must already be fully up to date BEFORE this runs (see
// goToSpecialScreen()/returnFromSpecialScreen()/goToEntryScreen()): this
// only ever changes which screen is visible, never anything about puzzle
// state, so there's nothing left to compute once the animation finishes.
// Guards against overlapping transitions (e.g. a second click on
// Special/Return/New-Clear before the first one's shards finish falling)
// with a single in-progress flag, since only one of these screens can ever
// be transitioning at a time.
let screenTransitionActive = false;

function transitionScreens(fromEl, toEl, { instant = false } = {}) {
  if (screenTransitionActive) return;

  const swap = () => {
    fromEl.classList.remove("active");
    fromEl.style.visibility = "";
    toEl.classList.add("active");
    screenTransitionActive = false;
  };

  if (instant || prefersReducedMotion.matches) {
    swap();
  } else {
    screenTransitionActive = true;
    shatterScreen(fromEl, swap);
  }
}

// A wholly different, much lighter-weight effect from shatterScreen()
// above -- no cloning, no shards, just a single CSS animation (see
// .spiral-blur-out/@keyframes spiralBlurOut in index.html) applied
// directly to the real screen element being left: it spins, shrinks, and
// blurs to nothing over one animation, then onComplete fires. Used only
// for the Special <-> solving-screen transitions (see
// spiralBlurTransition() below) -- New/Clear keeps the shatter effect via
// transitionScreens()/shatterScreen() above, unchanged.
function spiralBlurScreen(screenEl, onComplete) {
  screenEl.classList.add("spiral-blur-out");
  screenEl.addEventListener(
    "animationend",
    () => {
      screenEl.classList.remove("spiral-blur-out");
      onComplete();
    },
    { once: true }
  );
}

// Swaps fromEl/toEl via the spiral-blur effect above, unless reduced motion
// is on, in which case the swap happens instantly -- same fallback
// transitionScreens() uses. toEl's own content must already be fully up to
// date BEFORE this runs, same requirement as transitionScreens() (see
// goToSpecialScreen()/returnFromSpecialScreen()). Shares
// screenTransitionActive with transitionScreens() -- only one of
// New/Clear's shatter or a Special/Return spiral-blur can ever be running
// at a time, since only one of these three screens can be transitioning at
// once. The incoming screen simply appears the instant the outgoing one
// finishes blurring away, rather than spiraling back into focus -- matching
// how every other screen swap in this app already works (no reverse
// animation on the way in), and avoiding a "spin-in" that would look odd
// applied to a completely different screen's content.
function spiralBlurTransition(fromEl, toEl) {
  if (screenTransitionActive) return;

  const swap = () => {
    fromEl.classList.remove("active");
    toEl.classList.add("active");
    screenTransitionActive = false;
  };

  if (prefersReducedMotion.matches) {
    swap();
  } else {
    screenTransitionActive = true;
    spiralBlurScreen(fromEl, swap);
  }
}

const specialScreenEl = document.getElementById("specialScreen");
const specialGridEl = document.getElementById("specialGrid");
const specialBoxLabelEl = document.getElementById("specialBoxLabel");
const specialPriorBtnEl = document.getElementById("specialPriorBtn");
const specialNextBtnEl = document.getElementById("specialNextBtn");

// Which of the 9 standard 3x3 boxes (0-8, same numbering as
// SudokuLogic.boxIndex -- reading order, top-left first) the Special view
// is currently showing.
let specialBoxIndex = 0;

// The "row,col" key of the currently selected empty cell within the
// magnified box, or null. Separate from the main grid's selectedCell since
// this is a different screen's DOM, but the same one-at-a-time invariant.
let specialSelectedCell = null;

// Whether the Prior/Next buttons are each currently shattered away --
// tracked so shatterButton()/reassembleButton() only ever fire on an
// actual transition into or out of the first/last box, never redundantly
// on every render. null means "not yet set up for this visit to the
// Special view" (see goToSpecialScreen()), which sets up the initial state
// silently, exactly like the Solve button never animates on page load.
let specialPriorHidden = null;
let specialNextHidden = null;

// The 9 [row, col] pairs inside box b (0-8), in reading order (left to
// right, top to bottom) -- the inverse of SudokuLogic.boxIndex's own
// row/col -> box mapping.
function cellsInBox(box) {
  const startRow = Math.floor(box / 3) * 3;
  const startCol = (box % 3) * 3;
  const cells = [];
  for (let r = startRow; r < startRow + 3; r++) {
    for (let c = startCol; c < startCol + 3; c++) {
      cells.push([r, c]);
    }
  }
  return cells;
}

function goToSpecialScreen() {
  clearSelection();
  specialBoxIndex = 0;
  specialPriorHidden = null;
  specialNextHidden = null;
  // Builds the magnified box's DOM now, while specialScreen is still
  // display:none -- it's fully ready before the spiral-blur transition even
  // starts, let alone by the time it finishes (see spiralBlurTransition()).
  renderSpecialBox();
  spiralBlurTransition(document.getElementById("solvingScreen"), specialScreenEl);
}

function returnFromSpecialScreen() {
  specialSelectedCell = null;
  // Cells may have been filled (or cleared -- see clearSpecialGuess())
  // while in the Special view -- refresh the main board's row/column-
  // missing labels now, exactly as its own input handlers already do after
  // every guess, so the main screen is already current before it's shown
  // again (maybeAutoSolve() itself was already run at the moment each
  // digit was placed, not deferred to here -- see fillSpecialCellWithDigit()).
  updateCandidateLabels();
  spiralBlurTransition(specialScreenEl, document.getElementById("solvingScreen"));
}

// Builds one magnified filled-cell tile: an <input class="cell"> mirroring
// solvingCells[key]'s current value/given/solved-highlight styling exactly
// -- copying its classList/inline color rather than recomputing any of it
// -- so a filled cell here looks pixel-identical to the same cell on the
// main board, just bigger (see input.cell.special-cell in index.html).
//
// source.disabled mirrors the main board's own edit-ability for this exact
// cell -- true for a given/clue cell always, and true for a guessed cell
// too once the puzzle is solved (see markSolved()) -- so reusing it here
// (rather than checking the "given" class alone) means a solved puzzle's
// guesses stay locked in the Special view exactly as they are on the main
// board, instead of offering to un-solve a completed puzzle through a back
// door this view would otherwise open. Only an unlocked guess cell gets
// readOnly (not disabled, so it still receives the click below) and the
// pointer cursor; clicking it clears it back to empty via
// clearSpecialGuess(). A given cell stays fully disabled and unclickable,
// as before.
function buildFilledSpecialTile(row, col) {
  const source = solvingCells[`${row},${col}`];
  const tile = document.createElement("input");
  tile.className = "cell special-cell";
  tile.value = source.value;
  if (source.classList.contains("given")) tile.classList.add("given");
  if (source.classList.contains("solved-highlight")) tile.classList.add("solved-highlight");
  tile.style.color = source.style.color;

  if (source.disabled) {
    tile.disabled = true;
  } else {
    tile.readOnly = true;
    tile.classList.add("special-cell-guess");
    tile.addEventListener("click", () => clearSpecialGuess(row, col));
  }

  return tile;
}

// Clears a previously-guessed (non-given, not-yet-solved) cell back to
// empty when its filled tile is clicked in the Special view (see
// buildFilledSpecialTile() above), then re-renders the box so it
// immediately shows as an empty tile with freshly recomputed candidates --
// removing a guess can legalize digits that weren't valid candidates while
// it was still filled, so these can't just be read back off the old tile.
// Deliberately doesn't touch moveHistory/redoStack: this is a fresh "make
// it empty again" action, not an Undo, so it doesn't interact with Ctrl+Z's
// own history -- a Ctrl+Z afterward, back on the main screen, would just
// harmlessly re-clear a cell that's already empty rather than undo
// whatever move now sits at the top of that stack.
function clearSpecialGuess(row, col) {
  solvingCells[`${row},${col}`].value = "";
  setStatus("", "");
  updateCandidateLabels();
  renderSpecialBox();
}

// Builds one magnified empty-cell tile: a 3x3 mini-grid of this cell's
// currently valid candidates, laid out at the same digit-to-position
// mapping renderPrintCanvas() uses for its own per-cell candidate
// mini-grid (digit d at mini-row floor((d-1)/3), mini-col (d-1)%3) --
// reusing both that layout convention and computeValidCandidates(), the
// same source of truth the main board's candidate buttons and the print
// feature both already rely on. Not yet selected: every valid digit is a
// plain, non-interactive label -- clicking the tile itself (not a digit)
// is what selects it (see selectSpecialCell()), which is when these turn
// into real clickable buttons.
function buildEmptySpecialTile(row, col) {
  const tile = document.createElement("div");
  tile.className = "special-cell-empty";

  const candidates = new Set(computeValidCandidates(row, col));
  const miniGrid = document.createElement("div");
  miniGrid.className = "special-candidate-grid";
  const slots = [];
  for (let digit = 1; digit <= 9; digit++) {
    const slot = document.createElement("span");
    slot.className = "special-candidate";
    if (candidates.has(digit)) slot.textContent = String(digit);
    miniGrid.appendChild(slot);
    slots.push(slot);
  }
  tile.appendChild(miniGrid);

  tile.addEventListener("click", () => selectSpecialCell(row, col, tile, slots, candidates));
  return tile;
}

// Selects one empty tile: highlights it yellow (the same #fff59d as the
// main board's .selected cells) and turns its candidate labels into
// clickable buttons that commit the chosen digit. Re-clicking the
// already-selected tile is a no-op, matching selectSolvingCell()'s own
// invariant on the main board.
function selectSpecialCell(row, col, tile, slots, candidates) {
  const key = `${row},${col}`;
  if (specialSelectedCell === key) return;
  specialSelectedCell = key;

  tile.classList.add("selected");
  for (const slot of slots) {
    const digit = Number(slot.textContent);
    if (!candidates.has(digit)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "special-candidate special-candidate-btn";
    btn.textContent = slot.textContent;
    btn.addEventListener("click", () => fillSpecialCellWithDigit(row, col, digit));
    slot.replaceWith(btn);
  }
}

// Commits digit into (row, col) -- the exact same shared solvingCells
// state the main board reads/writes, not a separate copy -- then
// re-renders the current box so the just-filled cell immediately shows as
// filled. Reuses recordMove() (for Ctrl+Z, once back on the main screen),
// updateCandidateLabels(), and maybeAutoSolve() exactly as
// fillSelectedCellWithDigit() does for the main board's own candidate
// buttons -- candidates shown here are already guaranteed legal
// (computeValidCandidates() only ever lists legal options), so there's
// nothing new to validate.
function fillSpecialCellWithDigit(row, col, digit) {
  solvingCells[`${row},${col}`].value = String(digit);
  recordMove(row, col, digit);
  updateCandidateLabels();
  maybeAutoSolve();
  renderSpecialBox();
}

// Rebuilds the magnified 3x3 grid for specialBoxIndex from the shared
// solvingCells state and clears any prior selection, exactly like
// buildSolvingGrid() does for the main board.
function renderSpecialBox() {
  specialSelectedCell = null;
  specialGridEl.innerHTML = "";
  specialBoxLabelEl.textContent = `Box ${specialBoxIndex + 1} of 9`;

  for (const [row, col] of cellsInBox(specialBoxIndex)) {
    const hasValue = solvingCells[`${row},${col}`].value !== "";
    specialGridEl.appendChild(
      hasValue ? buildFilledSpecialTile(row, col) : buildEmptySpecialTile(row, col)
    );
  }

  updateSpecialNavButtons();
}

function updateSpecialNavButtons() {
  const atFirst = specialBoxIndex === 0;
  const atLast = specialBoxIndex === 8;

  if (specialPriorHidden === null) {
    specialPriorHidden = atFirst;
    if (atFirst) specialPriorBtnEl.style.visibility = "hidden";
  } else if (atFirst !== specialPriorHidden) {
    specialPriorHidden = atFirst;
    if (prefersReducedMotion.matches) {
      specialPriorBtnEl.style.visibility = atFirst ? "hidden" : "";
    } else if (atFirst) {
      shatterButton(specialPriorBtnEl);
    } else {
      reassembleButton(specialPriorBtnEl);
    }
  }

  if (specialNextHidden === null) {
    specialNextHidden = atLast;
    if (atLast) specialNextBtnEl.style.visibility = "hidden";
  } else if (atLast !== specialNextHidden) {
    specialNextHidden = atLast;
    if (prefersReducedMotion.matches) {
      specialNextBtnEl.style.visibility = atLast ? "hidden" : "";
    } else if (atLast) {
      shatterButton(specialNextBtnEl);
    } else {
      reassembleButton(specialNextBtnEl);
    }
  }
}

document.getElementById("specialBtn").addEventListener("click", () => {
  clearIterationCount();
  goToSpecialScreen();
});
specialPriorBtnEl.addEventListener("click", () => {
  if (specialBoxIndex === 0) return;
  specialBoxIndex -= 1;
  renderSpecialBox();
});
specialNextBtnEl.addEventListener("click", () => {
  if (specialBoxIndex === 8) return;
  specialBoxIndex += 1;
  renderSpecialBox();
});
document.getElementById("specialReturnBtn").addEventListener("click", returnFromSpecialScreen);

/* ===================== HELP MODAL ===================== */

const helpOverlayEl = document.getElementById("helpOverlay");
const statsResultEl = document.getElementById("statsResult");
const statsBtnEl = document.getElementById("statsBtn");

// CountAPI's free "hit" counter -- incrementing GET that bumps the given
// key by 1 and returns the new total in `value`. Uses the exact same key
// as sudoku-web so both surfaces contribute to and display one shared
// total rather than two separate counts. Fired exactly once here, at
// script load (mirroring where the old GoatCounter tracking pixel used to
// silently increment on every page view) -- calling /hit/ again from the
// button below would inflate the total by 1 on every click, so
// showPuzzleStats() only ever displays this one request's result.
const COUNTAPI_KEY = "sudoku-gilshannon-live-total";
const COUNTAPI_HIT_URL = `https://countapi.mileshilliard.com/api/v1/hit/${COUNTAPI_KEY}`;
const COUNTAPI_FETCH_TIMEOUT_MS = 6000;

// Guarded rather than called bare -- this runs at script load, including
// under the Node/jsdom test suite (tests/undo-redo.test.js), which has no
// global fetch. Falling back to a rejected promise there (and in any real
// browser where fetch is somehow unavailable) keeps this a no-op instead
// of a load-time crash; showPuzzleStats() already treats a rejection as
// "Puzzle stats are currently unavailable."
const liveHitCountRequest =
  typeof fetch === "function"
    ? (() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), COUNTAPI_FETCH_TIMEOUT_MS);
        return fetch(COUNTAPI_HIT_URL, { cache: "no-store", signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`Unexpected response status: ${response.status}`);
            return response.json();
          })
          .then((data) => {
            if (typeof data.value !== "number") {
              throw new Error("Unexpected response shape from CountAPI.");
            }
            return data.value;
          });
      })()
    : Promise.reject(new Error("fetch is not available in this environment."));
// Silences "unhandled rejection" noise if this fails (or is skipped) before
// the button's ever clicked -- showPuzzleStats() below attaches its own,
// separate handler to the same promise when it actually needs the result.
liveHitCountRequest.catch(() => {});

// Hides and clears any previously shown stats. Called every time the Help
// modal opens so "View Puzzle Stats" always has to be clicked fresh --
// stats never linger into a later Help visit without that click.
function resetStatsResult() {
  statsResultEl.hidden = true;
  statsResultEl.classList.remove("error");
  statsResultEl.textContent = "";
}

// Renders the one-time liveHitCountRequest result into statsResultEl -- or
// a plain "unavailable" message if that request failed, timed out, or
// came back an unexpected shape. Never re-fetches: CountAPI's endpoint
// increments on every call, so every click here just displays the single
// result from the page-load request above.
async function showPuzzleStats() {
  statsResultEl.hidden = false;
  statsResultEl.classList.remove("error");
  statsResultEl.textContent = "Loading puzzle stats…";

  try {
    const count = await liveHitCountRequest;

    statsResultEl.textContent = "";
    statsResultEl.append("Total visits: ");
    const strong = document.createElement("strong");
    strong.textContent = String(count);
    statsResultEl.append(strong);
    const note = document.createElement("span");
    note.className = "stats-note";
    note.textContent = "Live hit count — shared with sudoku-web.";
    statsResultEl.append(note);
  } catch (e) {
    statsResultEl.classList.add("error");
    statsResultEl.textContent = "Puzzle stats are currently unavailable.";
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

// Wholly separate from showHelp()/hideHelp() above -- its own overlay, own
// content (see #specialHelpOverlay in index.html) -- since it documents the
// Special view, not the main puzzle, and must never be confused with it.
const specialHelpOverlayEl = document.getElementById("specialHelpOverlay");

function showSpecialHelp() {
  document.getElementById("specialHelpVersionLine").textContent =
    `Version ${APP_VERSION} — Last updated: ${HELP_LAST_UPDATED}`;
  specialHelpOverlayEl.classList.add("active");
}

function hideSpecialHelp() {
  specialHelpOverlayEl.classList.remove("active");
}

document.getElementById("specialHelpBtn").addEventListener("click", showSpecialHelp);
document.getElementById("specialHelpCloseBtn").addEventListener("click", hideSpecialHelp);
specialHelpOverlayEl.addEventListener("click", (event) => {
  if (event.target === specialHelpOverlayEl) hideSpecialHelp();
});

document.getElementById("entryHelpBtn").addEventListener("click", () => {
  clearEntryHint();
  showHelp();
});
document.getElementById("solvingHelpBtn").addEventListener("click", () => {
  clearIterationCount();
  showHelp();
});
statsBtnEl.addEventListener("click", () => {
  // The shatter is purely cosmetic -- skipped entirely under
  // prefers-reduced-motion -- and never touches showPuzzleStats() itself.
  showPuzzleStats();
  if (!prefersReducedMotion.matches) shatterButton(statsBtnEl);
});
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

  if (event.key === "Escape") {
    hideHelp();
    hideSpecialHelp();
    hidePrintInvalidPopup();
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

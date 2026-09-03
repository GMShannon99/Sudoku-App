// Exercises the Ctrl+Z / Ctrl+Shift+Z undo-redo feature (sudoku-ui.js) end
// to end through a real DOM, via jsdom. Everything the app itself relies on
// -- moveHistory, redoStack, recordMove/undoLastMove/redoLastMove -- is a
// top-level `let`/`const` binding with no DOM knowledge of its own (see
// sudoku-ui.js), so each test loads the app fresh and drives it exactly as
// a user would: click buttons, type into cells, dispatch keydown events.
//
// All of the app's source plus the scenario-specific driving code run
// inside ONE `window.eval()` call per test. That's not a style choice --
// jsdom's `let`/`const` top-level bindings do NOT persist across separate
// `eval()` calls the way they would across multiple <script> tags in a real
// browser, so splitting "load app" and "drive app" into two eval calls
// would leave the scenario unable to see moveHistory/redoStack at all.
// Results cross back to Node as a JSON string assigned to a real property
// on window (window.__resultJSON), since plain property assignment -- unlike
// a bare `let` -- does survive past the eval call.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const LOGIC_SRC = fs.readFileSync(path.join(ROOT, "sudoku-logic.js"), "utf8");
const UI_SRC = fs.readFileSync(path.join(ROOT, "sudoku-ui.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Shared helpers made available to every scenario body (see run() below).
// Kept as source text -- not real functions -- since they need to execute
// inside the jsdom window's realm, not Node's.
const SCENARIO_HELPERS = `
  function click(id) { document.getElementById(id).click(); }

  // Finds an empty, editable cell (optionally excluding one) and a digit
  // that's actually legal there right now, mirroring the row/column/box
  // check onSolvingCellInput itself does -- so typing it never gets
  // silently rejected with a beep.
  function findLegalMove(excludeKey) {
    const grid = readGrid(solvingCells);
    for (const key in solvingCells) {
      if (key === excludeKey) continue;
      const input = solvingCells[key];
      if (input.disabled || input.value !== "") continue;
      const [r, c] = key.split(",").map(Number);
      const { rowMissing, colMissing, boxMissing } = SudokuLogic.buildTrackingSets(grid);
      const box = SudokuLogic.boxIndex(r, c);
      for (const d of rowMissing[r]) {
        if (colMissing[c].has(d) && boxMissing[box].has(d)) return { key, digit: d };
      }
    }
    return null;
  }

  function typeDigit(key, digit) {
    const input = solvingCells[key];
    input.value = String(digit);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Selects the cell (as a real mousedown would) and clicks the matching
  // candidate button, exercising the OTHER digit-entry path recordMove
  // has to cover.
  function pickCandidate(key, digit) {
    const input = solvingCells[key];
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const btn = [...candidateGridEl.querySelectorAll(".candidate-btn")]
      .find((b) => b.textContent === String(digit));
    btn.click();
  }

  function pressUndo() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  }

  function pressRedo() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
  }

  function cellValue(key) { return solvingCells[key].value; }
`;

// Loads a fresh app instance, lands on the solving screen (via "Use Sample
// Puzzle"), runs scenarioBody (raw JS source, see SCENARIO_HELPERS above
// for what's in scope), and returns whatever it assigned to __result.
function run(scenarioBody) {
  const dom = new JSDOM(HTML, { url: "http://localhost/index.html", runScripts: "dangerously" });
  const window = dom.window;
  window.confirm = () => true;

  const combined = `
    ${LOGIC_SRC}
    ;
    ${UI_SRC}
    ;
    (function () {
      ${SCENARIO_HELPERS}
      click("useSampleBtn");
      ${scenarioBody}
    })();
  `;
  window.eval(combined);
  return JSON.parse(window.__resultJSON);
}

test("Ctrl+Z undoes the most recently typed digit", () => {
  const result = run(`
    const move = findLegalMove(null);
    typeDigit(move.key, move.digit);
    const afterType = cellValue(move.key);
    pressUndo();
    const afterUndo = cellValue(move.key);
    window.__resultJSON = JSON.stringify({ digit: move.digit, afterType, afterUndo });
  `);
  assert.equal(result.afterType, String(result.digit));
  assert.equal(result.afterUndo, "");
});

test("Ctrl+Z undoes a digit filled in via a candidate button", () => {
  const result = run(`
    const move = findLegalMove(null);
    pickCandidate(move.key, move.digit);
    const afterPick = cellValue(move.key);
    pressUndo();
    const afterUndo = cellValue(move.key);
    window.__resultJSON = JSON.stringify({ digit: move.digit, afterPick, afterUndo });
  `);
  assert.equal(result.afterPick, String(result.digit));
  assert.equal(result.afterUndo, "");
});

test("Ctrl+Shift+Z redoes the most recently undone move", () => {
  const result = run(`
    const move = findLegalMove(null);
    typeDigit(move.key, move.digit);
    pressUndo();
    const afterUndo = cellValue(move.key);
    pressRedo();
    const afterRedo = cellValue(move.key);
    window.__resultJSON = JSON.stringify({ digit: move.digit, afterUndo, afterRedo });
  `);
  assert.equal(result.afterUndo, "");
  assert.equal(result.afterRedo, String(result.digit));
});

test("making a new move after an undo clears the redo stack", () => {
  const result = run(`
    const first = findLegalMove(null);
    typeDigit(first.key, first.digit);
    pressUndo();

    const second = findLegalMove(first.key);
    typeDigit(second.key, second.digit);

    pressRedo();
    window.__resultJSON = JSON.stringify({
      firstDigit: first.digit,
      secondDigit: second.digit,
      firstAfterRedoAttempt: cellValue(first.key),
      secondAfterRedoAttempt: cellValue(second.key),
    });
  `);
  assert.equal(result.firstAfterRedoAttempt, "", "the undone move should stay undone");
  assert.equal(result.secondAfterRedoAttempt, String(result.secondDigit), "the new move should be untouched");
});

test("repeated Ctrl+Z steps back through moves most-recent-first", () => {
  const result = run(`
    const first = findLegalMove(null);
    typeDigit(first.key, first.digit);
    const second = findLegalMove(first.key);
    typeDigit(second.key, second.digit);

    pressUndo();
    const afterFirstUndo = { first: cellValue(first.key), second: cellValue(second.key) };
    pressUndo();
    const afterSecondUndo = { first: cellValue(first.key), second: cellValue(second.key) };
    window.__resultJSON = JSON.stringify({
      firstDigit: first.digit, secondDigit: second.digit, afterFirstUndo, afterSecondUndo,
    });
  `);
  assert.equal(result.afterFirstUndo.second, "", "the most recent move (second) undoes first");
  assert.equal(result.afterFirstUndo.first, String(result.firstDigit), "the older move is untouched by the first undo");
  assert.equal(result.afterSecondUndo.first, "", "the second Ctrl+Z reaches the older move");
});

test("Ctrl+Z with no recorded moves is a no-op", () => {
  const result = run(`
    let threw = false;
    try { pressUndo(); } catch (e) { threw = true; }
    window.__resultJSON = JSON.stringify({ threw });
  `);
  assert.equal(result.threw, false);
});

test("Ctrl+Shift+Z with nothing to redo is a no-op", () => {
  const result = run(`
    let threw = false;
    try { pressRedo(); } catch (e) { threw = true; }
    window.__resultJSON = JSON.stringify({ threw });
  `);
  assert.equal(result.threw, false);
});

test("Reset clears both the undo history and the redo stack", () => {
  const result = run(`
    const move = findLegalMove(null);
    typeDigit(move.key, move.digit);
    pressUndo();
    click("resetBtn");
    pressRedo();
    window.__resultJSON = JSON.stringify({
      digit: move.digit,
      afterResetAndRedoAttempt: cellValue(move.key),
    });
  `);
  assert.equal(result.afterResetAndRedoAttempt, "", "redo after Reset must not resurrect a pre-Reset move");
});

test("undoing after auto-solve re-enables the affected cell", () => {
  // Fill in every empty cell except one directly (bypassing recordMove,
  // same as if they'd been filled some other way), then type the real
  // solution digit into that last cell through the normal recorded path --
  // completing the grid should trigger maybeAutoSolve and lock everything.
  const result = run(`
    const solved = readGrid(solvingCells);
    SudokuLogic.solve(solved);

    const keys = Object.keys(solvingCells).filter((key) => solvingCells[key].value === "");
    const lastKey = keys[keys.length - 1];
    for (const key of keys) {
      if (key === lastKey) continue;
      const [r, c] = key.split(",").map(Number);
      solvingCells[key].value = String(solved[r][c]);
    }

    const [lr, lc] = lastKey.split(",").map(Number);
    typeDigit(lastKey, solved[lr][lc]);
    const disabledAfterSolve = solvingCells[lastKey].disabled;

    pressUndo();
    window.__resultJSON = JSON.stringify({
      disabledAfterSolve,
      disabledAfterUndo: solvingCells[lastKey].disabled,
      valueAfterUndo: cellValue(lastKey),
    });
  `);
  assert.equal(result.disabledAfterSolve, true, "auto-solve should have locked the grid");
  assert.equal(result.disabledAfterUndo, false, "undo should re-enable the cell it clears");
  assert.equal(result.valueAfterUndo, "", "undo should clear the digit, not leave it disabled-but-filled");
});

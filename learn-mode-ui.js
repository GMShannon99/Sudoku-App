/*
 * LEARN MODE -- DOM/UI wiring. Loaded after sudoku-ui.js and reuses its
 * globals (ding, transitionScreens, shatterButton, resetButtonShatter,
 * prefersReducedMotion, paintNow, APP_VERSION). The only change to
 * existing code is the one-line hook in sudoku-ui.js's generateBtn
 * handler that calls LearnMode.start() when the switch is on. See
 * learn-mode-logic.js for how to remove the feature.
 */

const LearnMode = (function () {
  const N = LearnLogic.SIZE;

  // Home-screen elements hidden while the switch is ON (the "learn-hidden"
  // class is display:none -- see learn-mode.css).
  const HIDDEN_WHEN_ON = [
    document.querySelector(".entry-primary-actions"), // Use Sample Puzzle (+ Start Solving)
    document.getElementById("pasteBtn"),
    document.getElementById("createNewBtn"),
    document.querySelector(".difficulty-picker"),
    document.getElementById("entryBoardFrame"),
  ];

  const toggleEl = document.getElementById("learnModeToggle");
  const screenEl = document.getElementById("learnScreen");
  const gridEl = document.getElementById("learnGrid");
  const statusEl = document.getElementById("learnStatusLine");
  const solveBtnEl = document.getElementById("learnSolveBtn");

  let cells = null; // "r,c" -> <input>
  let givens = new Set();
  let solvedShown = false;

  function isOn() {
    return toggleEl.checked;
  }

  function setOn(on) {
    toggleEl.checked = on;
    for (const el of HIDDEN_WHEN_ON) el.classList.toggle("learn-hidden", on);
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status-line" + (kind ? " " + kind : "");
  }

  function readGrid() {
    const grid = Array.from({ length: N }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = cells[`${r},${c}`].value.trim();
        if (/^[1-4]$/.test(v)) grid[r][c] = parseInt(v, 10);
      }
    }
    return grid;
  }

  function buildGrid(puzzleGrid) {
    gridEl.innerHTML = "";
    cells = {};
    givens = new Set();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const wrap = document.createElement("div");
        wrap.className = "learn-cell-wrap";
        if (c === 1) wrap.classList.add("learn-box-right");
        if (r === 1) wrap.classList.add("learn-box-bottom");

        const input = document.createElement("input");
        input.className = "cell";
        input.maxLength = 1;
        input.inputMode = "numeric";
        input.autocomplete = "off";

        if (puzzleGrid[r][c] !== 0) {
          input.value = puzzleGrid[r][c];
          input.classList.add("given");
          input.disabled = true;
          givens.add(`${r},${c}`);
        } else {
          input.addEventListener("input", () => onCellInput(r, c, input));
        }

        wrap.appendChild(input);
        gridEl.appendChild(wrap);
        cells[`${r},${c}`] = input;
      }
    }
  }

  // Same rule as the normal game's solving screen, but digits 1-4 only: a
  // digit outside 1-4, or already used in the row/column/2x2 box, is
  // rejected with a ding.
  function onCellInput(row, col, input) {
    let v = input.value;
    if (v.length > 1) v = v[v.length - 1];
    if (v && !/[1-4]/.test(v)) {
      ding();
      v = "";
    }

    if (v) {
      const grid = readGrid();
      grid[row][col] = 0;
      if (!LearnLogic.candidates(grid, row, col).includes(parseInt(v, 10))) {
        ding();
        v = "";
      }
    }

    input.value = v;
    if (v && readGrid().every((rowVals) => rowVals.every((x) => x !== 0))) attemptSolve();
  }

  function clearSolvedState() {
    for (const key in cells) {
      cells[key].classList.remove("solved-highlight");
      if (!givens.has(key)) {
        cells[key].disabled = false;
        cells[key].style.color = "";
      }
    }
    solvedShown = false;
    resetButtonShatter(solveBtnEl);
  }

  // Same effects as the normal game's Solve: fill in, lock + blue the
  // guessed cells, yellow flash, shatter the Solve button.
  function attemptSolve() {
    const grid = readGrid();
    if (!LearnLogic.solve(grid)) {
      setStatus("No solution exists for the current entries.", "error");
      return false;
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const key = `${r},${c}`;
        if (givens.has(key)) continue;
        cells[key].value = grid[r][c];
        cells[key].disabled = true;
        cells[key].style.color = "var(--solved-guess)";
        cells[key].classList.add("solved-highlight");
      }
    }
    setStatus("Solved!", "success");
    if (!solvedShown) {
      solvedShown = true;
      if (prefersReducedMotion.matches || !screenEl.classList.contains("active")) {
        solveBtnEl.style.visibility = "hidden";
      } else {
        shatterButton(solveBtnEl);
      }
    }
    return true;
  }

  function reset() {
    clearSolvedState();
    for (const key in cells) {
      if (!givens.has(key)) cells[key].value = "";
    }
    setStatus("Cleared to puzzle.", "info");
  }

  function newClear() {
    const confirmed = window.confirm(
      "This will discard the current puzzle. Are you sure you want to continue?"
    );
    if (!confirmed) return;
    // The board is left as-is so the shatter transition has something to
    // break apart; start() rebuilds it for the next puzzle.
    solvedShown = false;
    resetButtonShatter(solveBtnEl);
    document.getElementById("pageTitle").textContent = `Enter Your Sudoku Puzzle v${APP_VERSION}`;
    document.getElementById("difficultyLine").textContent = "";
    clearEntryHint();
    transitionScreens(screenEl, document.getElementById("entryScreen"), { instant: false });
  }

  // Called by the generateBtn hook in sudoku-ui.js when the switch is ON.
  async function start() {
    setEntryHint("Generating puzzle...", "");
    await paintNow();
    const { puzzle: generated } = LearnLogic.generatePuzzle();
    clearEntryHint();

    buildGrid(generated);
    solvedShown = false;
    resetButtonShatter(solveBtnEl);
    setStatus("", "");
    document.getElementById("pageTitle").textContent = `Sudoku Learn Mode v${APP_VERSION}`;
    document.getElementById("difficultyLine").textContent = "Fill each row, column, and box with 1, 2, 3, 4.";
    document.getElementById("entryScreen").classList.remove("active");
    screenEl.classList.add("active");
  }

  toggleEl.addEventListener("change", () => setOn(toggleEl.checked));
  document.getElementById("learnResetBtn").addEventListener("click", reset);
  solveBtnEl.addEventListener("click", attemptSolve);
  document.getElementById("learnNewClearBtn").addEventListener("click", newClear);

  setOn(false);

  return { isOn, setOn, start };
})();

window.LearnMode = LearnMode;

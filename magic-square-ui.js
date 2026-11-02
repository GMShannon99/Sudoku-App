/*
 * MAGIC SQUARES -- DOM/UI wiring. Loaded after sudoku-ui.js and
 * magic-square-logic.js; reuses the APP_VERSION global. Four screens
 * (.screen/.active switching, like Learn Mode): Rules, Input (manual
 * entry), Puzzle, Solution, plus one message popup (.modal-overlay).
 * See magic-square-logic.js for how to remove the feature.
 */

const MagicSquares = (function () {
  const N = MagicLogic.SIZE;
  const $ = (id) => document.getElementById(id);

  const MSG_NOT_NUMERIC = "Only numeric values are allowed";
  const MSG_RANGE = "Numbers must be from 1 to 20";
  const MSG_DUPLICATE = "No duplicate values vertically, horizontally or diagonally allowed";
  const MSG_CANT_COMPLETE = "These numbers can't be completed into a magic square";
  const MSG_NEED_ONE = "Please enter at least one number";

  const TITLES = {
    msRulesScreen: "Magic Square Rules",
    msInputScreen: "Create a Magic Puzzle Input",
    msPuzzleScreen: "Magic Square Puzzle",
    msSolutionScreen: "Magic Square Solution",
  };

  const overlayEl = $("msMessageOverlay");
  const messageEl = $("msMessageText");
  const statusEl = $("msStatusLine");

  let inputCells = null; // "r,c" -> <input> on the input screen
  let puzzleCells = null; // same, on the puzzle screen
  let givens = MagicLogic.emptyGrid();
  let puzzleOrigin = "rules"; // "input" (Manual Entry) or "rules" (Generate Puzzle)
  let focusAfterPopup = null;
  // Two independent choices made with the radio groups on the Rules screen:
  // level (the number range: 1 = digits 1-9, 2 = numbers 1-20) and difficulty
  // ("easy" or "hard": how many givens a generated puzzle shows).
  let level = 1;
  let difficulty = "easy";
  const DIFFICULTY_LABELS = { easy: "Easy Level", hard: "Hard Level" };

  function show(screenId) {
    for (const el of document.querySelectorAll(".screen.active")) el.classList.remove("active");
    $(screenId).classList.add("active");
    $("pageTitle").textContent = TITLES[screenId];
    $("difficultyLine").textContent = subHeading(screenId);
  }

  // The sub-heading under the page title (the page's difficulty line): the
  // level on every screen reached from Rules, plus the difficulty on the
  // screens of a generated puzzle.
  function subHeading(screenId) {
    if (screenId === "msRulesScreen") return "";
    const text = `Level ${level}`;
    const generated = screenId !== "msInputScreen" && puzzleOrigin === "rules";
    return generated ? `${text} - ${DIFFICULTY_LABELS[difficulty]}` : text;
  }

  function goHome() {
    level = 1;
    difficulty = "easy";
    $("msLevel1").checked = true;
    $("msDifficultyEasy").checked = true;
    $("difficultyLine").textContent = "";
    for (const el of document.querySelectorAll(".screen.active")) el.classList.remove("active");
    $("entryScreen").classList.add("active");
    $("pageTitle").textContent = `Enter Your Sudoku Puzzle v${APP_VERSION}`;
  }

  function showPopup(message, returnFocusTo) {
    messageEl.textContent = message;
    focusAfterPopup = returnFocusTo || null;
    overlayEl.classList.add("active");
    $("msMessageCloseBtn").focus();
  }

  function hidePopup() {
    if (!overlayEl.classList.contains("active")) return;
    overlayEl.classList.remove("active");
    if (focusAfterPopup) focusAfterPopup.focus();
    focusAfterPopup = null;
  }

  function readGrid(cells) {
    const grid = MagicLogic.emptyGrid();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = cells[`${r},${c}`].value.trim();
        if (MagicLogic.isValue(v, level)) grid[r][c] = parseInt(v, 10);
      }
    }
    return grid;
  }

  // Builds a 3x3 grid into gridEl. `locked` is a 3x3 array of givens (0 = editable).
  function buildGrid(gridEl, locked, onChange) {
    gridEl.innerHTML = "";
    const cells = {};
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const input = document.createElement("input");
        input.className = "cell";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
        if (locked[r][c] !== 0) {
          input.value = locked[r][c];
          input.classList.add("given");
          input.disabled = true;
        } else {
          input.addEventListener("focus", () => input.select());
          input.addEventListener("input", () => onCellInput(r, c, input, cells, onChange));
          if (level === 2) {
            // A one-digit level-2 entry may be the start of a two-digit number, so
            // its duplicate check waits until the player leaves the cell.
            input.addEventListener("blur", () => commitCell(r, c, input, cells, onChange));
            input.addEventListener("keydown", (event) => {
              if (event.key === "Enter") input.blur();
            });
          }
        }
        gridEl.appendChild(input);
        cells[`${r},${c}`] = input;
      }
    }
    return cells;
  }

  // Rejects anything that isn't a valid entry for the level (a digit 1-9, or
  // a whole number 1-20 in level 2), and any number already used in the
  // grid, each with its own popup. In level 2 a first digit of 1 or 2 is
  // not checked for duplicates yet (see commitCell), because it can still
  // grow into 10-20, so typing "1" "2" works even when a 1 is already on the
  // grid. A first digit of 3-9 can't grow, so it is checked right away.
  function onCellInput(row, col, input, cells, onChange) {
    const maxLen = level === 2 ? 2 : 1;
    let v = input.value.trim();
    // Level 1: typing over a filled cell keeps the newest digit. Level 2: a third
    // digit makes a number over 20, which gets the range message below.
    if (v.length > maxLen && !(level === 2 && /^[1-9][0-9]*$/.test(v))) v = v[v.length - 1];
    const error = v ? MagicLogic.entryError(v, level) : null;
    if (error) {
      input.value = "";
      showPopup(error === "range" ? MSG_RANGE : MSG_NOT_NUMERIC, input);
    } else if (v) {
      input.value = v;
      if (!(level === 2 && (v === "1" || v === "2"))) checkDuplicate(row, col, input, cells);
    } else {
      input.value = "";
    }
    if (onChange) onChange();
  }

  // Clears the cell and shows the duplicate popup if its number is already
  // used elsewhere. Returns true if it rejected the entry.
  function checkDuplicate(row, col, input, cells) {
    const grid = readGrid(cells);
    grid[row][col] = 0;
    if (!input.value || !MagicLogic.hasDuplicate(grid, row, col, input.value)) return false;
    input.value = "";
    showPopup(MSG_DUPLICATE, input);
    return true;
  }

  // Level 2: the deferred duplicate check for a finished one-digit entry.
  function commitCell(row, col, input, cells, onChange) {
    if (input.value && checkDuplicate(row, col, input, cells) && onChange) onChange();
  }

  // Runs the deferred check on every editable cell; true if any was rejected.
  function commitAll(cells) {
    let rejected = false;
    for (const key in cells) {
      const input = cells[key];
      if (input.disabled || !input.value) continue;
      const [r, c] = key.split(",").map(Number);
      if (checkDuplicate(r, c, input, cells)) rejected = true;
    }
    return rejected;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status-line" + (kind ? " " + kind : "");
  }

  function updateStatus() {
    const grid = readGrid(puzzleCells);
    if (!MagicLogic.isFull(grid)) return setStatus("", "");
    if (MagicLogic.isMagic(grid, level)) setStatus("Solved!", "success");
    else setStatus("The grid is full, but it is not a magic square.", "error");
  }

  function startPuzzle(givenGrid, origin) {
    givens = givenGrid.map((row) => row.slice());
    puzzleOrigin = origin;
    puzzleCells = buildGrid($("msPuzzleGrid"), givens, updateStatus);
    setStatus("", "");
    show("msPuzzleScreen");
  }

  // Manual Entry ignores the difficulty; only the number range applies.
  function readLevel() {
    level = $("msLevel2").checked ? 2 : 1;
  }

  function openInput() {
    readLevel();
    inputCells = buildGrid($("msInputGrid"), MagicLogic.emptyGrid());
    show("msInputScreen");
  }

  function inputDone() {
    if (overlayEl.classList.contains("active") || commitAll(inputCells)) return;
    const grid = readGrid(inputCells);
    if (MagicLogic.countFilled(grid) === 0) return showPopup(MSG_NEED_ONE);
    if (!MagicLogic.canComplete(grid, level)) return showPopup(MSG_CANT_COMPLETE);
    startPuzzle(grid, "input");
  }

  function showSolution() {
    if (overlayEl.classList.contains("active") || commitAll(puzzleCells)) return;
    const entries = readGrid(puzzleCells);
    const solved = MagicLogic.solution(givens, entries, level);
    const cells = buildGrid($("msSolutionGrid"), givens);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const input = cells[`${r},${c}`];
        if (givens[r][c] === 0) {
          input.value = solved[r][c];
          input.disabled = true;
          input.style.color = "var(--solved-guess)";
        }
      }
    }
    show("msSolutionScreen");
  }

  $("magicSquaresBtn").addEventListener("click", () => show("msRulesScreen"));
  $("msRulesManualBtn").addEventListener("click", openInput);
  $("msRulesGenerateBtn").addEventListener("click", () => {
    readLevel();
    difficulty = $("msDifficultyHard").checked ? "hard" : "easy";
    startPuzzle(MagicLogic.generatePuzzle(Math.random, level, difficulty).puzzle, "rules");
  });
  $("msRulesExitBtn").addEventListener("click", goHome);

  $("msInputDoneBtn").addEventListener("click", inputDone);
  $("msInputExitBtn").addEventListener("click", () => show("msRulesScreen"));

  $("msPuzzleSolutionBtn").addEventListener("click", showSolution);
  $("msPuzzleExitBtn").addEventListener("click", () =>
    show(puzzleOrigin === "input" ? "msInputScreen" : "msRulesScreen")
  );
  $("msSolutionReturnBtn").addEventListener("click", () => show("msPuzzleScreen"));

  $("msMessageCloseBtn").addEventListener("click", hidePopup);
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) hidePopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePopup();
  });

  return { show, goHome };
})();

window.MagicSquares = MagicSquares;

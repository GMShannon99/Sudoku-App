// Magic Squares screen flow through a real DOM (jsdom); same eval approach as learn-mode-ui.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const HTML = read("index.html");
const SRC = [read("sudoku-logic.js"), read("sudoku-ui.js"), read("magic-square-logic.js"), read("magic-square-ui.js")].join("\n;\n");

function run(body) {
  const dom = new JSDOM(HTML, { url: "http://localhost/index.html", runScripts: "dangerously" });
  const window = dom.window;
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.eval(`
    ${SRC}
    ;
    (function () {
      const $ = (id) => document.getElementById(id);
      const click = (id) => $(id).click();
      const active = () => Array.from(document.querySelectorAll(".screen.active")).map((e) => e.id);
      const title = () => $("pageTitle").textContent;
      const popup = () => ($("msMessageOverlay").classList.contains("active") ? $("msMessageText").textContent : null);
      const type = (grid, r, c, v) => { const i = $(grid).children[r * 3 + c]; i.value = v; i.dispatchEvent(new Event("input")); };
      const vals = (grid) => Array.from($(grid).children).map((i) => i.value).join("");
      const btns = (screen) => Array.from(document.querySelectorAll("#" + screen + " button")).map((b) => b.textContent);
      const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      ${body}
    })();
  `);
  return JSON.parse(window.__result);
}

test("home button is last in the panel (below Help) and opens the Rules screen", () => {
  const r = run(`
    const btn = $("magicSquaresBtn");
    const kids = Array.from(btn.parentElement.children);
    const before = title();
    click("magicSquaresBtn");
    window.__result = JSON.stringify({
      last: kids[kids.length - 1] === btn,
      afterHelp: kids.indexOf(btn) > kids.indexOf($("entryHelpBtn")),
      label: btn.textContent, before, active: active(), title: title(), buttons: btns("msRulesScreen"),
      rules: $("msRulesScreen").querySelector(".ms-rules").textContent,
    });
  `);
  assert.equal(r.last, true);
  assert.equal(r.afterHelp, true);
  assert.equal(r.label, "Magic Squares");
  assert.equal(r.before, "Enter Your Sudoku Puzzle v5.1.2");
  assert.deepEqual(r.active, ["msRulesScreen"]);
  assert.equal(r.title, "Magic Square Rules");
  assert.deepEqual(r.buttons, ["Manual Entry", "Generate Puzzle", "Exit"]);
  assert.match(r.rules, /1 to 9 is used exactly once/);
  assert.match(r.rules, /15/);
});

test("Rules Exit returns to the home screen and restores the normal title", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesExitBtn");
    window.__result = JSON.stringify({ active: active(), title: title() });
  `);
  assert.deepEqual(r.active, ["entryScreen"]);
  assert.equal(r.title, "Enter Your Sudoku Puzzle v5.1.2");
});

test("Manual Entry screen: title, buttons, non-digit and duplicate popups, Escape closes", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesManualBtn");
    const out = { active: active(), title: title(), n: $("msInputGrid").children.length, buttons: btns("msInputScreen") };
    type("msInputGrid", 0, 0, "x");
    out.letter = [popup(), vals("msInputGrid")];
    esc();
    out.closed = popup();
    type("msInputGrid", 0, 0, "0");
    out.zero = popup();
    click("msMessageCloseBtn");
    type("msInputGrid", 0, 0, "5");
    out.ok = [popup(), vals("msInputGrid")];
    type("msInputGrid", 2, 1, "5");
    out.dup = [popup(), vals("msInputGrid")];
    esc();
    out.dupClosed = popup();
    window.__result = JSON.stringify(out);
  `);
  assert.deepEqual(r.active, ["msInputScreen"]);
  assert.equal(r.title, "Create a Magic Puzzle Input");
  assert.equal(r.n, 9);
  assert.deepEqual(r.buttons, ["Done", "Exit"]);
  assert.deepEqual(r.letter, ["Only numeric values are allowed", ""]);
  assert.equal(r.closed, null);
  assert.equal(r.zero, "Only numeric values are allowed");
  assert.deepEqual(r.ok, [null, "5"]);
  assert.deepEqual(r.dup, ["No duplicate values vertically, horizontally or diagonally allowed", "5"]);
  assert.equal(r.dupClosed, null);
});

test("Done: empty asks for a number, impossible numbers are refused, good numbers open the puzzle", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesManualBtn");
    const out = {};
    click("msInputDoneBtn");
    out.empty = [popup(), active()];
    click("msMessageCloseBtn");
    type("msInputGrid", 0, 0, "5"); // corners must be even
    click("msInputDoneBtn");
    out.bad = [popup(), active()];
    click("msMessageCloseBtn");
    type("msInputGrid", 0, 0, "");
    type("msInputGrid", 1, 1, "5");
    type("msInputGrid", 0, 0, "2");
    click("msInputDoneBtn");
    out.good = [popup(), active(), title()];
    out.locked = Array.from($("msPuzzleGrid").children).map((i) => (i.disabled && i.classList.contains("given") ? i.value : "-")).join("");
    window.__result = JSON.stringify(out);
  `);
  assert.equal(r.empty[0], "Please enter at least one number");
  assert.deepEqual(r.empty[1], ["msInputScreen"]);
  assert.equal(r.bad[0], "These numbers can't be completed into a magic square");
  assert.deepEqual(r.bad[1], ["msInputScreen"]);
  assert.deepEqual(r.good, [null, ["msPuzzleScreen"], "Magic Square Puzzle"]);
  assert.equal(r.locked, "2---5----");
});

test("Input Exit goes to Rules; a Manual Entry puzzle's Exit returns to the input screen", () => {
  const r = run(`
    const out = {};
    click("magicSquaresBtn");
    click("msRulesManualBtn");
    click("msInputExitBtn");
    out.a = [active(), title()];
    click("msRulesManualBtn");
    type("msInputGrid", 1, 1, "5");
    click("msInputDoneBtn");
    click("msPuzzleExitBtn");
    out.b = [active(), title(), vals("msInputGrid")];
    window.__result = JSON.stringify(out);
  `);
  assert.deepEqual(r.a, [["msRulesScreen"], "Magic Square Rules"]);
  assert.deepEqual(r.b, [["msInputScreen"], "Create a Magic Puzzle Input", "5"]);
});

test("Generate Puzzle: straight to the puzzle, 3+ locked givens, Exit returns to Rules", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesGenerateBtn");
    const out = { active: active(), title: title(), givens: Array.from($("msPuzzleGrid").children).filter((i) => i.disabled).length, buttons: btns("msPuzzleScreen") };
    click("msPuzzleExitBtn");
    out.exit = [active(), title()];
    window.__result = JSON.stringify(out);
  `);
  assert.deepEqual(r.active, ["msPuzzleScreen"]);
  assert.equal(r.title, "Magic Square Puzzle");
  assert.ok(r.givens >= 3 && r.givens <= 5);
  assert.deepEqual(r.buttons, ["Show Solution", "Exit"]);
  assert.deepEqual(r.exit, [["msRulesScreen"], "Magic Square Rules"]);
});

test("Puzzle: popups, full-but-wrong message, then Solved!", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesGenerateBtn");
    const kids = Array.from($("msPuzzleGrid").children);
    const g = MagicLogic.emptyGrid();
    kids.forEach((i, n) => { if (i.disabled) g[Math.floor(n / 3)][n % 3] = +i.value; });
    const sq = MagicLogic.matching(g)[0];
    const empties = [];
    kids.forEach((i, n) => { if (!i.disabled) empties.push(n); });
    const at = (n, v) => type("msPuzzleGrid", Math.floor(n / 3), n % 3, v);
    const out = {};
    at(empties[0], "q");
    out.letter = popup();
    click("msMessageCloseBtn");
    at(empties[0], kids.find((i) => i.disabled).value);
    out.dup = popup();
    click("msMessageCloseBtn");
    const right = empties.map((n) => sq[Math.floor(n / 3)][n % 3]);
    const wrong = right.slice(1).concat(right[0]);
    empties.forEach((n, k) => at(n, String(wrong[k])));
    out.wrong = $("msStatusLine").textContent;
    empties.forEach((n) => at(n, ""));
    out.cleared = $("msStatusLine").textContent;
    empties.forEach((n, k) => at(n, String(right[k])));
    out.solved = $("msStatusLine").textContent;
    window.__result = JSON.stringify(out);
  `);
  assert.equal(r.letter, "Only numeric values are allowed");
  assert.equal(r.dup, "No duplicate values vertically, horizontally or diagonally allowed");
  assert.match(r.wrong, /not a magic square/);
  assert.equal(r.cleared, "");
  assert.equal(r.solved, "Solved!");
});

test("Show Solution -> Return keeps the entries exactly; the solution screen has only Return", () => {
  const r = run(`
    click("magicSquaresBtn");
    click("msRulesGenerateBtn");
    const kids = Array.from($("msPuzzleGrid").children);
    const free = kids.findIndex((i) => !i.disabled);
    const mine = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((d) => !kids.some((i) => i.value === d));
    type("msPuzzleGrid", Math.floor(free / 3), free % 3, mine);
    const before = vals("msPuzzleGrid");
    click("msPuzzleSolutionBtn");
    const out = { active: active(), title: title(), sol: vals("msSolutionGrid"), buttons: btns("msSolutionScreen") };
    out.magic = MagicLogic.isMagic(Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => +out.sol[r * 3 + c])));
    click("msSolutionReturnBtn");
    out.back = [active(), title(), vals("msPuzzleGrid") === before];
    window.__result = JSON.stringify(out);
  `);
  assert.deepEqual(r.active, ["msSolutionScreen"]);
  assert.equal(r.title, "Magic Square Solution");
  assert.equal(r.magic, true);
  assert.deepEqual(r.buttons, ["Return"]);
  assert.deepEqual(r.back, [["msPuzzleScreen"], "Magic Square Puzzle", true]);
});

test("responsive tiers are present and versions are all 5.1.2", () => {
  const css = read("magic-square.css");
  for (const w of [520, 500, 400]) assert.match(css, new RegExp(`max-width: ${w}px`));
  assert.match(read("sudoku-ui.js"), /APP_VERSION = "5.1.2"/);
  assert.equal(JSON.parse(read("package.json")).version, "5.1.2");
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.version, "5.1.2");
  assert.equal(lock.packages[""].version, "5.1.2");
});

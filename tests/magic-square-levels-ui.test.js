// Level (number range) + difficulty choices on the Rules screen, through a real
// DOM (jsdom); same eval approach as magic-square-ui.test.js.
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
      const title = () => $("pageTitle").textContent;
      const sub = () => $("difficultyLine").textContent;
      const popup = () => ($("msMessageOverlay").classList.contains("active") ? $("msMessageText").textContent : null);
      const cellEl = (grid, n) => $(grid).children[n];
      const keys = (grid, n, text) => { for (const ch of text) { const i = cellEl(grid, n); i.value = i.value + ch; i.dispatchEvent(new Event("input")); } };
      const leave = (grid, n) => cellEl(grid, n).dispatchEvent(new Event("blur"));
      const grid3 = (g) => Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => Number($(g).children[r * 3 + c].value) || 0));
      const givenCount = (g) => Array.from($(g).children).filter((i) => i.disabled).length;
      const choose = (level, difficulty) => {
        $(level === 2 ? "msLevel2" : "msLevel1").checked = true;
        $(difficulty === "hard" ? "msDifficultyHard" : "msDifficultyEasy").checked = true;
      };
      const radios = () => ({
        level1: $("msLevel1").checked, level2: $("msLevel2").checked,
        easy: $("msDifficultyEasy").checked, hard: $("msDifficultyHard").checked,
      });
      ${body}
    })();
  `);
  return JSON.parse(window.__result);
}

test("Rules screen: Level 1 / Level 2 headings, two radio groups under the buttons, defaults Easy Level and Level 1", () => {
  const r = run(`
    click("magicSquaresBtn");
    const groups = Array.from(document.querySelectorAll("#msRulesScreen .ms-level-picker"));
    const controls = document.querySelector("#msRulesScreen .controls");
    window.__result = JSON.stringify({
      headings: Array.from(document.querySelectorAll("#msRulesScreen .ms-rules-heading")).map((e) => e.textContent),
      groups: groups.map((g) => Array.from(g.querySelectorAll("label")).map((l) => l.textContent.trim())),
      names: groups.map((g) => Array.from(g.querySelectorAll("input")).map((i) => i.name)),
      belowButtons: groups.every((g) => !!(controls.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING)),
      order: !!(groups[0].compareDocumentPosition(groups[1]) & Node.DOCUMENT_POSITION_FOLLOWING),
      radios: radios(), sub: sub(), title: title(),
      allRadiosInRules: Array.from(document.querySelectorAll("input[type=radio][name^=ms]")).every((i) => i.closest("#msRulesScreen")),
      rulesText: document.querySelector(".ms-rules").textContent,
      buttons: Array.from(document.querySelectorAll("#msRulesScreen button")).map((b) => b.textContent),
    });
  `);
  assert.deepEqual(r.headings, ["Level 1", "Level 2"]);
  assert.deepEqual(r.groups, [["Easy Level", "Hard Level"], ["Level 1", "Level 2"]]);
  assert.deepEqual(r.names, [["msDifficulty", "msDifficulty"], ["msLevel", "msLevel"]]);
  assert.equal(r.belowButtons, true);
  assert.equal(r.order, true);
  assert.deepEqual(r.radios, { level1: true, level2: false, easy: true, hard: false });
  assert.equal(r.sub, "");
  assert.equal(r.title, "Magic Square Rules");
  assert.equal(r.allRadiosInRules, true);
  assert.deepEqual(r.buttons, ["Manual Entry", "Generate Puzzle", "Exit"]);
  assert.match(r.rulesText, /1 to 9 is used exactly once/);
  assert.match(r.rulesText, /1 to 20/);
  assert.doesNotMatch(r.rulesText, /Easy Level|Hard Level/);
});

for (const level of [1, 2]) {
  for (const difficulty of ["easy", "hard"]) {
    const label = `Level ${level} - ${difficulty === "hard" ? "Hard" : "Easy"} Level`;

    test(`${label}: Generate Puzzle shows "${label}" on the puzzle and solution screens, keeps it across Show Solution/Return and Exit, givens match the difficulty`, () => {
      const r = run(`
        click("magicSquaresBtn");
        choose(${level}, "${difficulty}");
        click("msRulesGenerateBtn");
        const out = { puzzle: sub(), givens: givenCount("msPuzzleGrid"), title: title() };
        click("msPuzzleSolutionBtn");
        out.solution = [sub(), title()];
        click("msSolutionReturnBtn");
        out.back = sub();
        click("msPuzzleExitBtn");
        out.rules = [sub(), title(), radios()];
        window.__result = JSON.stringify(out);
      `);
      assert.equal(r.puzzle, label);
      assert.equal(r.title, "Magic Square Puzzle");
      if (difficulty === "hard") assert.equal(r.givens, 2);
      else assert.ok(r.givens >= 3);
      assert.deepEqual(r.solution, [label, "Magic Square Solution"]);
      assert.equal(r.back, label);
      assert.deepEqual(r.rules[0], "");
      assert.equal(r.rules[1], "Magic Square Rules");
      assert.deepEqual(r.rules[2], { level1: level === 1, level2: level === 2, easy: difficulty === "easy", hard: difficulty === "hard" });
    });

    test(`${label}: Manual Entry ignores the difficulty and shows only "Level ${level}" on the input, puzzle and solution screens`, () => {
      const r = run(`
        click("magicSquaresBtn");
        choose(${level}, "${difficulty}");
        click("msRulesManualBtn");
        const out = { input: [sub(), title()] };
        keys("msInputGrid", 4, ${level === 2 ? '"10"' : '"5"'});
        leave("msInputGrid", 4);
        click("msInputDoneBtn");
        out.puzzle = [sub(), title(), givenCount("msPuzzleGrid")];
        click("msPuzzleSolutionBtn");
        out.solution = sub();
        click("msSolutionReturnBtn");
        out.back = sub();
        click("msPuzzleExitBtn");
        out.exitToInput = [sub(), title(), radios()];
        click("msInputExitBtn");
        out.rules = [sub(), radios()];
        window.__result = JSON.stringify(out);
      `);
      assert.deepEqual(r.input, [`Level ${level}`, "Create a Magic Puzzle Input"]);
      assert.deepEqual(r.puzzle, [`Level ${level}`, "Magic Square Puzzle", 1]); // exactly what the player typed, whatever the difficulty
      assert.equal(r.solution, `Level ${level}`);
      assert.equal(r.back, `Level ${level}`);
      const want = { level1: level === 1, level2: level === 2, easy: difficulty === "easy", hard: difficulty === "hard" };
      assert.deepEqual(r.exitToInput, [`Level ${level}`, "Create a Magic Puzzle Input", want]);
      assert.deepEqual(r.rules, ["", want]);
    });

    test(`${label}: Exit to the home screen resets both groups and restores the title`, () => {
      const r = run(`
        click("magicSquaresBtn");
        choose(${level}, "${difficulty}");
        click("msRulesGenerateBtn");
        click("msPuzzleExitBtn");
        click("msRulesExitBtn");
        const out = { home: [title(), sub(), radios()] };
        click("magicSquaresBtn");
        out.again = [sub(), radios()];
        click("msRulesManualBtn");
        out.manual = sub();
        window.__result = JSON.stringify(out);
      `);
      const defaults = { level1: true, level2: false, easy: true, hard: false };
      assert.deepEqual(r.home, ["Enter Your Sudoku Puzzle v5.1.2", "", defaults]);
      assert.deepEqual(r.again, ["", defaults]);
      assert.equal(r.manual, "Level 1");
    });
  }
}

test("a Level 1 puzzle and a Level 2 puzzle follow their own rules after the choice is changed between visits", () => {
  const r = run(`
    click("magicSquaresBtn");
    choose(2, "easy");
    click("msRulesManualBtn");
    keys("msInputGrid", 0, "17");
    const l2 = cellEl("msInputGrid", 0).value;
    click("msInputExitBtn");
    choose(1, "easy");
    click("msRulesManualBtn");
    keys("msInputGrid", 0, "17"); // level 1: "1" is accepted, then "7" replaces it
    const l1 = [cellEl("msInputGrid", 0).value, popup()];
    window.__result = JSON.stringify({ l2, l1, sub: sub() });
  `);
  assert.equal(r.l2, "17");
  assert.equal(r.l1[0], "7");
  assert.equal(r.sub, "Level 1");
});

test("Level 2 + Hard Level: any valid completion counts as solved; Show Solution prefers one matching the entries", () => {
  const r = run(`
    click("magicSquaresBtn");
    choose(2, "hard");
    let all = [];
    let givens = null;
    // regenerate until the puzzle has several completions (almost all do)
    for (let tries = 0; tries < 30; tries++) {
      click("msRulesGenerateBtn");
      givens = grid3("msPuzzleGrid");
      all = MagicLogic.level2Matching(givens);
      if (all.length > 1) break;
      click("msPuzzleExitBtn");
    }
    const out = { several: all.length > 1, givens: givenCount("msPuzzleGrid") };
    const P = "msPuzzleGrid";
    const target = all[all.length - 1]; // deliberately not the first completion
    const fill = (sq) => {
      for (let n = 0; n < 9; n++) {
        if (cellEl(P, n).disabled) continue;
        cellEl(P, n).value = "";
      }
      for (let n = 0; n < 9; n++) {
        if (cellEl(P, n).disabled) continue;
        keys(P, n, String(sq[Math.floor(n / 3)][n % 3]));
        leave(P, n);
      }
    };
    fill(target);
    out.solvedMsg = $("msStatusLine").textContent;
    out.popup = popup();
    // Show Solution with the player's (valid) entries: must show exactly that completion
    click("msPuzzleSolutionBtn");
    out.shown = grid3("msSolutionGrid");
    out.target = target;
    window.__result = JSON.stringify(out);
  `);
  assert.equal(r.several, true);
  assert.equal(r.givens, 2);
  assert.equal(r.solvedMsg, "Solved!");
  assert.equal(r.popup, null);
  assert.deepEqual(r.shown, r.target);
});

test("Level 1 + Hard Level: the 2-given puzzle is solved only by its single answer", () => {
  const r = run(`
    click("magicSquaresBtn");
    choose(1, "hard");
    click("msRulesGenerateBtn");
    const givens = grid3("msPuzzleGrid");
    const all = MagicLogic.matching(givens);
    const P = "msPuzzleGrid";
    for (let n = 0; n < 9; n++) { if (!cellEl(P, n).disabled) keys(P, n, String(all[0][Math.floor(n / 3)][n % 3])); }
    window.__result = JSON.stringify({ count: all.length, givens: givenCount(P), solved: $("msStatusLine").textContent });
  `);
  assert.deepEqual(r, { count: 1, givens: 2, solved: "Solved!" });
});

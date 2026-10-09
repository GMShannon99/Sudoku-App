// Learn Mode switch + screen behavior through a real DOM (jsdom); same
// one-eval-per-scenario approach as print-options.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const HTML = read("index.html");
const SRC = [read("sudoku-logic.js"), read("sudoku-ui.js"), read("learn-mode-logic.js"), read("learn-mode-ui.js")].join("\n;\n");

function run(body) {
  const dom = new JSDOM(HTML, { url: "http://localhost/index.html", runScripts: "dangerously" });
  const window = dom.window;
  window.confirm = () => true;
  // Reduced motion: transitions/shatters apply instantly (jsdom has no animations).
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.eval(`
    ${SRC}
    ;
    (async function () {
      const $ = (id) => document.getElementById(id);
      const hid = (el) => el.classList.contains("learn-hidden");
      const toggle = (on) => { $("learnModeToggle").checked = on; $("learnModeToggle").dispatchEvent(new Event("change")); };
      const tick = () => new Promise((r) => setTimeout(r, 5));
      ${body}
    })();
  `);
  return new Promise((resolve) => {
    const poll = () => (window.__result ? resolve(JSON.parse(window.__result)) : setTimeout(poll, 5));
    poll();
  });
}

test("switch is OFF by default and sits right after Help", async () => {
  const r = await run(`
    const help = $("entryHelpBtn");
    window.__result = JSON.stringify({
      checked: $("learnModeToggle").checked,
      afterHelp: help.nextElementSibling.contains($("learnModeToggle")),
      label: help.nextElementSibling.textContent.trim(),
      anyHidden: !!document.querySelector(".learn-hidden"),
    });
  `);
  assert.equal(r.checked, false);
  assert.equal(r.afterHelp, true);
  assert.equal(r.label, "Learn Mode");
  assert.equal(r.anyHidden, false);
});

test("ON hides everything but Generate, Help and the switch; OFF restores it", async () => {
  const r = await run(`
    toggle(true);
    const on = {
      sample: hid($("useSampleBtn").closest(".entry-primary-actions")),
      paste: hid($("pasteBtn")), manual: hid($("createNewBtn")),
      radios: hid(document.querySelector(".difficulty-picker")),
      generate: hid($("generateBtn")), help: hid($("entryHelpBtn")),
      toggle: hid($("learnModeToggle").closest("label")),
    };
    toggle(false);
    window.__result = JSON.stringify({ on, offHiddenCount: document.querySelectorAll(".learn-hidden").length });
  `);
  assert.deepEqual(r.on, { sample: true, paste: true, manual: true, radios: true, generate: false, help: false, toggle: false });
  assert.equal(r.offHiddenCount, 0);
});

test("Learn Mode puzzle: 4x4, only 1-4 accepted, no help numbers, three buttons", async () => {
  const r = await run(`
    toggle(true);
    $("generateBtn").click();
    await tick(); await tick();
    const cells = [...document.querySelectorAll("#learnGrid input.cell")];
    const empty = cells.find((c) => !c.disabled);
    const results = {};
    for (const d of ["5", "0", "9", "a"]) { empty.value = d; empty.dispatchEvent(new Event("input")); results[d] = empty.value; }
    window.__result = JSON.stringify({
      active: $("learnScreen").classList.contains("active"),
      entryActive: $("entryScreen").classList.contains("active"),
      cellCount: cells.length, given: cells.filter((c) => c.disabled).length,
      results,
      learnButtons: [...document.querySelectorAll("#learnScreen button")].map((b) => b.textContent),
      helpLabels: document.querySelectorAll("#learnScreen .row-missing, #learnScreen .col-missing, #learnScreen .candidate-btn").length,
    });
  `);
  assert.equal(r.active, true);
  assert.equal(r.entryActive, false);
  assert.equal(r.cellCount, 16);
  assert.equal(r.given, 9);
  assert.deepEqual(r.results, { 5: "", 0: "", 9: "", a: "" });
  assert.deepEqual(r.learnButtons, ["Reset", "Solve", "New/Clear"]);
  assert.equal(r.helpLabels, 0);
});

test("Reset restores clues, Solve fills grid, New/Clear returns home with Learn Mode ON", async () => {
  const r = await run(`
    toggle(true);
    $("generateBtn").click();
    await tick(); await tick();
    const cells = () => [...document.querySelectorAll("#learnGrid input.cell")];
    const vals = () => cells().map((c) => c.value).join("");
    const start = vals();
    const empty = cells().find((c) => !c.disabled);
    for (const d of "1234") { empty.value = d; empty.dispatchEvent(new Event("input")); if (empty.value) break; }
    $("learnResetBtn").click();
    const afterReset = vals() === start;
    $("learnSolveBtn").click();
    const solved = vals();
    const status = $("learnStatusLine").textContent;
    const locked = cells().filter((c) => !c.classList.contains("given")).every((c) => c.disabled);
    $("learnNewClearBtn").click();
    await tick();
    window.__result = JSON.stringify({
      afterReset, solvedFull: /^[1-4]{16}$/.test(solved), status, locked,
      home: $("entryScreen").classList.contains("active"),
      learnOn: $("learnModeToggle").checked,
      stillHidden: hid($("pasteBtn")),
    });
  `);
  assert.equal(r.afterReset, true);
  assert.equal(r.solvedFull, true);
  assert.equal(r.status, "Solved!");
  assert.equal(r.locked, true);
  assert.equal(r.home, true);
  assert.equal(r.learnOn, true);
  assert.equal(r.stillHidden, true);
});

test("Learn Mode OFF: Generate still makes a normal 9x9 puzzle", async () => {
  const r = await run(`
    $("generateBtn").click();
    await tick(); await tick();
    window.__result = JSON.stringify({
      normal: $("solvingScreen").classList.contains("active"),
      learn: $("learnScreen").classList.contains("active"),
    });
  `);
  assert.equal(r.normal, true);
  assert.equal(r.learn, false);
});

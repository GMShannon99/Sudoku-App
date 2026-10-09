// The invalid-entry "ding": plays for rejected digits and non-digit keys on
// every typed-entry screen, never for valid digits or deletions. A fake
// AudioContext counts how many dings actually start.
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
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.eval(`
    let dings = 0, resumes = 0, clock = 0;
    const node = () => new Proxy({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: {} },
      { get: (t, k) => (k in t ? t[k] : k === "connect" ? () => node() : () => {}), set: (t, k, v) => ((t[k] = v), true) });
    window.AudioContext = function () {
      this.state = "suspended";
      this.destination = {};
      Object.defineProperty(this, "currentTime", { get: () => clock });
      this.resume = () => { resumes++; this.state = "running"; };
      this.createGain = () => node();
      this.createOscillator = () => { const o = node(); o.start = () => { dings += 0.5; }; return o; };
    };
    ${SRC}
    ;
    (async function () {
      const $ = (id) => document.getElementById(id);
      const typeFast = (input, v) => { input.value = v; input.dispatchEvent(new Event("input")); };
      const type = (input, v) => { clock += 1; typeFast(input, v); };
      const count = () => { const n = dings; dings = 0; return n; };
      const tick = () => new Promise((r) => setTimeout(r, 5));
      ${body}
    })();
  `);
  return new Promise((resolve) => {
    const poll = () => (window.__result ? resolve(JSON.parse(window.__result)) : setTimeout(poll, 5));
    poll();
  });
}

test("Manual Entry: duplicates and non-digits ding; valid digits and deletes don't", async () => {
  const r = await run(`
    $("createNewBtn").click();
    const cells = [...document.querySelectorAll("#entryGrid input.cell")];
    type(cells[0], "5"); const valid = count();
    type(cells[1], "5"); const dup = count();
    type(cells[2], "a"); const letter = count();
    type(cells[3], "0"); const zero = count();
    type(cells[4], "#"); const symbol = count();
    type(cells[0], ""); const del = count();
    window.__result = JSON.stringify({ valid, dup, letter, zero, symbol, del, cell1: cells[1].value });
  `);
  assert.deepEqual(r, { valid: 0, dup: 1, letter: 1, zero: 1, symbol: 1, del: 0, cell1: "" });
});

test("Solving screen: duplicates and non-digits ding; valid digits don't", async () => {
  const r = await run(`
    $("useSampleBtn").click();
    const cells = Object.values(solvingCells);
    // sample row 0 has an 8 given; find an empty cell in that row
    const empty = cells.find((c, i) => i < 9 && !c.disabled);
    type(empty, "8"); const dup = count();
    type(empty, "x"); const letter = count();
    type(empty, "0"); const zero = count();
    type(empty, "2"); const valid = count();
    window.__result = JSON.stringify({ dup, letter, zero, valid });
  `);
  assert.deepEqual(r, { dup: 1, letter: 1, zero: 1, valid: 0 });
});

test("Learn Mode: digits outside 1-4 and duplicates ding", async () => {
  const r = await run(`
    $("learnModeToggle").checked = true;
    $("learnModeToggle").dispatchEvent(new Event("change"));
    $("generateBtn").click();
    await tick(); await tick();
    count();
    const cells = [...document.querySelectorAll("#learnGrid input.cell")];
    const empty = cells.find((c) => !c.disabled);
    type(empty, "5"); const five = count();
    type(empty, "a"); const letter = count();
    type(empty, "0"); const zero = count();
    window.__result = JSON.stringify({ five, letter, zero });
  `);
  assert.deepEqual(r, { five: 1, letter: 1, zero: 1 });
});

test("rapid invalid keys are throttled, and audio is resumed by a user gesture", async () => {
  const r = await run(`
    $("createNewBtn").click();
    const cells = [...document.querySelectorAll("#entryGrid input.cell")];
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    const resumedByGesture = resumes >= 1;
    count();
    typeFast(cells[0], "a"); typeFast(cells[1], "b"); typeFast(cells[2], "c");
    const burst = count();
    clock = 1;
    type(cells[3], "d");
    const later = count();
    window.__result = JSON.stringify({ resumedByGesture, burst, later });
  `);
  assert.equal(r.resumedByGesture, true);
  assert.equal(r.burst, 1);
  assert.equal(r.later, 1);
});

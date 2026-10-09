// Exercises the Print button's "with help / without help" popup through a
// real DOM, via jsdom -- see undo-redo.test.js for why the whole app plus
// each scenario runs inside one window.eval() call.
//
// jsdom has no canvas, so getContext is stubbed with a recorder that logs
// every fillText call; the print is a canvas image, so "help numbers" are
// identified by the font each kind of text is drawn with.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const LOGIC_SRC = fs.readFileSync(path.join(ROOT, "sudoku-logic.js"), "utf8");
const UI_SRC = fs.readFileSync(path.join(ROOT, "sudoku-ui.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const SCENARIO_HELPERS = `
  function click(id) { document.getElementById(id).click(); }

  const texts = [];
  let printCalls = 0;
  window.print = () => { printCalls++; };
  HTMLCanvasElement.prototype.getContext = function () {
    const ctx = {
      font: "",
      fillText(text) { texts.push({ text: String(text), font: ctx.font }); },
    };
    return new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  };
  HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/jpeg;base64," + texts.length; };

  function isOverlayOpen() {
    return document.getElementById("printOptionsOverlay").classList.contains("active");
  }
  // Mimics the image finishing decoding so the handler proceeds to print.
  function finishImageLoad() {
    const img = document.getElementById("printImage");
    if (img.onload) img.onload();
  }
`;

function run(scenarioBody) {
  const dom = new JSDOM(HTML, { url: "http://localhost/index.html", runScripts: "dangerously" });
  const window = dom.window;
  window.confirm = () => true;
  window.eval(`
    ${LOGIC_SRC}
    ;
    ${UI_SRC}
    ;
    (function () {
      ${SCENARIO_HELPERS}
      click("useSampleBtn");
      ${scenarioBody}
    })();
  `);
  return JSON.parse(window.__resultJSON);
}

test("Print opens the options popup instead of printing immediately", () => {
  const r = run(`
    click("printBtn");
    window.__resultJSON = JSON.stringify({ open: isOverlayOpen(), printCalls, drawn: texts.length });
  `);
  assert.equal(r.open, true);
  assert.equal(r.printCalls, 0);
  assert.equal(r.drawn, 0);
});

test("Cancel, backdrop click and Escape close the popup without printing", () => {
  const r = run(`
    const out = [];
    click("printBtn"); click("printOptionsCancelBtn"); out.push(isOverlayOpen());
    click("printBtn"); document.getElementById("printOptionsOverlay").click(); out.push(isOverlayOpen());
    click("printBtn"); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); out.push(isOverlayOpen());
    window.__resultJSON = JSON.stringify({ out, printCalls });
  `);
  assert.deepEqual(r.out, [false, false, false]);
  assert.equal(r.printCalls, 0);
});

test("Print with Help draws help numbers; Print without Help omits them, and screen state is untouched", () => {
  const r = run(`
    const labelsBefore = document.body.innerHTML;
    const gridBefore = JSON.stringify(readGrid(solvingCells));

    click("printBtn"); click("printWithHelpBtn"); finishImageLoad();
    const withHelp = texts.filter((t) => ["20px monospace", "16px monospace", "18px monospace"].includes(t.font) && t.text.indexOf(", 20") < 0).length;
    const withPrints = printCalls;
    const withOpen = isOverlayOpen();

    texts.length = 0;
    click("printBtn"); click("printWithoutHelpBtn"); finishImageLoad();
    const withoutHelp = texts.filter((t) => ["20px monospace", "16px monospace", "18px monospace"].includes(t.font) && t.text.indexOf(", 20") < 0).length;
    const mainDigits = texts.filter((t) => /44px monospace/.test(t.font)).length;

    window.__resultJSON = JSON.stringify({
      withHelp, withPrints, withOpen, withoutHelp, mainDigits,
      totalPrints: printCalls,
      gridSame: gridBefore === JSON.stringify(readGrid(solvingCells)),
      bodyClassEmpty: document.body.className === "",
    });
  `);
  assert.ok(r.withHelp > 0, "help numbers are drawn with help");
  assert.equal(r.withPrints, 1);
  assert.equal(r.withOpen, false, "popup closes on choosing");
  assert.equal(r.withoutHelp, 0, "no help numbers without help");
  assert.ok(r.mainDigits > 0, "puzzle digits still print");
  assert.equal(r.totalPrints, 2);
  assert.equal(r.gridSame, true);
  assert.equal(r.bodyClassEmpty, true);
});

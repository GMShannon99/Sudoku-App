// Exercises the "Special" (magnified box) view's Prior/Next navigation
// buttons through a real DOM, via jsdom -- see undo-redo.test.js for why the
// whole app plus each scenario has to run inside one window.eval() call.
//
// Regression coverage for: re-entering the Special view after a visit that
// ended on the last box (so the Next button had shattered itself away) used
// to leave Next permanently hidden on the next visit, even back on box 1 of
// 9 where it should be visible again (see goToSpecialScreen()'s
// resetButtonShatter() calls and updateSpecialNavButtons() in sudoku-ui.js).

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

  // jsdom never actually runs the CSS animations goToSpecialScreen()/
  // returnFromSpecialScreen() wait on, so their "animationend" listener
  // never fires on its own -- fire it manually to let the screen-swap
  // logic complete, same as a real animation finishing would.
  function finishScreenTransition(id) {
    document.getElementById(id).dispatchEvent(new Event("animationend"));
  }
`;

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

test("Special view's Next button reappears on a second visit after shattering away on the first", () => {
  const result = run(`
    click("specialBtn");
    finishScreenTransition("solvingScreen");

    // Page all the way to the last box, which shatters Next away.
    for (let i = 0; i < 8; i++) click("specialNextBtn");
    const nextHiddenAtLastBox = specialNextBtnEl.style.visibility;
    const boxLabelAtLastBox = document.getElementById("specialBoxLabel").textContent;

    // Leave straight from the last box, without paging back first.
    click("specialReturnBtn");
    finishScreenTransition("specialScreen");

    // Re-enter Special a second time.
    click("specialBtn");
    finishScreenTransition("solvingScreen");

    window.__resultJSON = JSON.stringify({
      nextHiddenAtLastBox,
      boxLabelAtLastBox,
      boxLabelOnSecondVisit: document.getElementById("specialBoxLabel").textContent,
      nextVisibilityOnSecondVisit: specialNextBtnEl.style.visibility,
      priorVisibilityOnSecondVisit: specialPriorBtnEl.style.visibility,
    });
  `);

  assert.equal(result.boxLabelAtLastBox, "Box 9 of 9", "sanity check: paging 8 times reaches the last box");
  assert.equal(result.nextHiddenAtLastBox, "hidden", "sanity check: Next shatters away on the last box");
  assert.equal(result.boxLabelOnSecondVisit, "Box 1 of 9", "a fresh visit should start back at the first box");
  assert.equal(result.nextVisibilityOnSecondVisit, "", "Next must be visible again on box 1 of the second visit");
  assert.equal(result.priorVisibilityOnSecondVisit, "hidden", "Prior is still correctly hidden on box 1, same as the first visit");
});

test("Special view's Prior button is hidden on a fresh visit even after ending the previous one mid-box", () => {
  const result = run(`
    click("specialBtn");
    finishScreenTransition("solvingScreen");

    // Move off the first box, then leave from there (not from box 1).
    click("specialNextBtn");
    click("specialNextBtn");
    click("specialReturnBtn");
    finishScreenTransition("specialScreen");

    click("specialBtn");
    finishScreenTransition("solvingScreen");

    window.__resultJSON = JSON.stringify({
      boxLabelOnSecondVisit: document.getElementById("specialBoxLabel").textContent,
      priorVisibilityOnSecondVisit: specialPriorBtnEl.style.visibility,
      nextVisibilityOnSecondVisit: specialNextBtnEl.style.visibility,
    });
  `);

  assert.equal(result.boxLabelOnSecondVisit, "Box 1 of 9");
  assert.equal(result.priorVisibilityOnSecondVisit, "hidden", "Prior should be hidden again on box 1 of the fresh visit");
  assert.equal(result.nextVisibilityOnSecondVisit, "", "Next should be visible on box 1 of the fresh visit");
});

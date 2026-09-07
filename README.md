# Sudoku Web

A browser-based Sudoku puzzle entry and solving tool. Type in your own puzzle, paste one from a saved file, or generate a brand-new one at your choice of difficulty — then let the built-in solver finish it, or fill it in yourself with live validation and candidate hints the whole way through.

## Live demo

**[https://GMShannon99.github.io/Sudoku-App/](https://GMShannon99.github.io/Sudoku-App/)**

## Install it on your phone

This is a Progressive Web App (PWA) — it can be installed to a phone's home screen and launches in its own window (no browser address bar), and the already-visited pages keep working offline. This only works when the site is loaded over HTTPS (the GitHub Pages link above) or `localhost` — opening `index.html` straight off disk (`file://`) skips installability and offline support entirely.

- **Android / Chrome** — open the live demo link, tap the browser menu (⋮), and choose **"Install app"** (or **"Add to Home screen"**). Some versions of Chrome also show an install icon directly in the address bar.
- **iOS / Safari** — open the live demo link, tap the **Share** button, then choose **"Add to Home Screen"**. Safari on iOS doesn't support the install-app prompt Chrome/Android use, so this Share-sheet route is the only way to add it there.

## Features

### Puzzle entry screen

When the app loads, you land on a blank entry grid where you can:

- **Type a custom puzzle** — enter the starting clues by hand, then click **Start Solving** to lock them in as givens (at least 6 filled squares are required).
- **Use Sample Puzzle** — jump straight to a built-in "world's hardest sudoku"-style puzzle (only 21 givens), ignoring anything you've typed.
- **Paste Puzzle** — load a puzzle record from the system clipboard: a single line of 81 grid digits (0–9, row by row, 0 for blank), optionally followed by one extra character. This is the same record format written by the desktop Sudoku Solver's "Save to File" feature. Invalid clipboard contents or an unsolvable puzzle both show a clear error message instead of loading.
- **Manual Entry** — clears the entry grid so you can start typing a fresh puzzle.
- **Generate Puzzle** — pick a difficulty (**Easy**, **Moderate**, or **Hard**) and generate a brand-new, randomly created puzzle guaranteed to have exactly one solution. If no difficulty is selected, it defaults to Moderate. A "Generating puzzle…" message appears while it works, since finding the right difficulty can take a few attempts internally.

### Input validation everywhere

Both the entry screen and the solving screen enforce the same rule as you type: only digits 1–9 are accepted, and a digit already used elsewhere in that cell's row, column, or 3×3 box is rejected outright, accompanied by an audible beep.

### Click-to-see candidates

Clicking an empty square on the solving screen highlights it in yellow and shows that square's currently valid candidate digits as small yellow buttons in the board's bottom-right corner, next to the row/column-missing labels. At the same time, the clicked square's entire row, column, and 3×3 box get a subtle pink tint, so it's easy to trace at a glance which row/column/box the selection belongs to — the given clues' shading stays visible underneath the tint, and the selected square's own yellow highlight always stays the dominant color on that square rather than blending into the pink. Clicking a candidate fills it in for you; typing a digit directly works too. The highlight, pink tint, and candidate buttons clear automatically once a value is entered, and also clear on any other key press or mouse click elsewhere on the page — clicking away, pressing Escape, Ctrl+Z/Ctrl+Shift+Z, arrow keys, and so on all dismiss them without filling the square.

### Live row/column tracking

The numbers to the right of each row and below each column show every digit still missing from that row or column, updating live as you fill in cells. Once a row or column is completely and correctly filled, its label switches to a checkmark (✓).

### Save / Reset backups

- **Save** takes an in-memory snapshot of the grid exactly as it stands (givens plus everything you've typed so far). Each click adds another backup, and a running count ("N screen backups") is displayed.
- **Reset** restores the most recently saved backup, or — if nothing has been saved yet — clears the grid back to the puzzle's original clues.

### Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)

On the solving screen, **Ctrl+Z** (or Cmd+Z) undoes your most recent move — whether the digit was typed directly or filled in by clicking a candidate button — clearing that square and updating the row/column candidate labels. Repeated presses step back through your moves one at a time, most recent first. If a move is undone after the puzzle has auto-solved, the affected square becomes editable again instead of staying locked and blue. **Ctrl+Shift+Z** (or Cmd+Shift+Z) redoes the most recently undone move, putting its digit back. Making a new move after undoing clears anything left to redo. This history is separate from the Save/Reset backups above: starting a new puzzle or clicking Reset both clear it, since either one establishes a fresh starting point.

### Solving

- **Solve** runs the app's solver (naked-singles propagation, then MRV backtracking) and fills in every remaining empty cell.
- The puzzle also **auto-solves** the moment you fill in the last empty square yourself — no need to click Solve at all if you finish it by hand.
- Once solved, an **"Iteration: N"** message appears in the corner, showing how many backtracking guesses the solver needed (0 means it solved purely through naked-singles logic, with no guessing required).
- Every guessed (non-given) cell turns a blue color once the puzzle is solved, while keeping its white background — visually distinguishing your solved entries from the original clues.
- On top of that, every guessed cell also flashes a yellow success background the instant the puzzle is solved — via Solve or auto-solve alike — which stays lit for as long as the grid remains completely and correctly solved. Clicking around or pressing keys doesn't clear it; only Reset, Undo, or New/Clear (i.e. the puzzle actually changing) does. Redoing back to a complete, correct grid brings the yellow back.
- The Solve button itself shatters into pieces and falls away the instant the puzzle is solved — via Solve or auto-solve alike, reusing the same shatter effect as the Help modal's "View Puzzle Stats" button, complete with a synthesized glass-breaking crash (Web Audio API, no audio files) — leaving its spot on the screen empty (not just hidden with the layout collapsing around it) for as long as the puzzle stays solved. It reappears intact the moment the puzzle stops being solved (Reset, an Undo that breaks the completed grid, or starting a new puzzle). Both the animation and its sound are skipped under reduced-motion, same as the stats button's shatter.

### Write to File

The **Write to File** button exports the current grid (givens plus whatever you've filled in) as a text record, in the same format Paste Puzzle understands. Each click saves a **new** file named `Sudoku_Save.txt` to your browser's default downloads location — browsers typically avoid overwriting the previous one automatically (e.g. by appending `(1)`, `(2)`, etc.), so repeated clicks will accumulate multiple files rather than replacing the last save.

### Print Puzzle

**Download JPG** and **Print** both generate the same printable image of the current puzzle, sized for Letter-size (8.5×11in) portrait printing, so it can be worked on with pen or pencil. Before generating anything, both check whether the current entries actually have a valid solution (reusing the same solver used everywhere else); if not, a popup explains that the puzzle has no valid solution and nothing is generated. The image includes a header (page title, difficulty, and today's date), the full 9×9 grid with thin cell borders and thicker 3×3 box borders, the given clues shaded with a light grey background (guesses stay on a plain background so the two are easy to tell apart on paper), the same row/column missing-digit numbers shown on screen, and — for every still-empty square — its remaining valid candidate digits laid out in a small 3×3 mini-grid inside the cell. Both work the same way whether running from the browser or from the installed home-screen app.

- **Download JPG** saves the image as a file (`Sudoku_Print.jpg`) to your browser's default downloads location — for emailing, attaching elsewhere, or printing later from a computer.
- **Print** opens your browser's native print dialog directly on that image, with no file to download or locate first. It works by revealing a hidden, print-only `<img>` (see `@media print` in `index.html`) and calling `window.print()` on the current page, rather than opening a separate print window — deliberately, since `window.print()` on a window opened via `window.open()` is unreliable on iOS Safari (it can print a blank page, or never surface the print sheet at all). On an iPhone, tapping **Print** brings up the same Share Sheet / AirPrint flow any other app's print button would — including from the installed home-screen app, which uses the same underlying print handling even without Safari's own browser chrome around it.

### Help

A **Help** button (available on both screens) opens an in-app documentation modal with two top-level sections: a general "How to Play Sudoku" primer on the rules of the game itself, followed by "Sudoku Web Functionality," covering every app feature above, along with the author's name and contact email, the current version number, and the date it was last updated.

### Puzzle stats

A **View Puzzle Stats** button sits in the Help modal's footer, next to Close. Clicking it fetches two independent pieces of data — read-only, public data, with no login involved — and shows each in its own place: the total-visits count renders right there in the Help modal, while the country breakdown opens in a separate pop-up layered on top of the Help modal (which stays open behind it). Nothing is fetched until the button is clicked, and neither piece is displayed anywhere else on the page.

- **Total visits** — pulled live from GoatCounter's public counter endpoint, shown directly in the Help modal. If the request fails, times out, or GoatCounter's response isn't shaped as expected, the modal shows "Puzzle stats are currently unavailable." instead of breaking or failing silently.
- **Visitor countries** — a country-by-country visitor breakdown, shown in its own pop-up titled "Sudoku Country Usage Stats by Gil Shannon," with a note underneath the heading that the figures are "Updated automatically once a week, or manually by the site admin." The data itself is read from a `stats-snapshot.json` file in the repo root, generated automatically by the **"Update Puzzle Stats"** GitHub Actions workflow (`.github/workflows/update-stats.yml`), which runs on a schedule (8:00 AM UTC every Monday) and can also be triggered manually from the repo's **Actions** tab via "Run workflow." The workflow calls GoatCounter's `/api/v0/stats/locations` API (see `scripts/fetch_goatcounter_stats.py`) and commits the updated snapshot straight to `main`. **This workflow requires a `GOATCOUNTER_TOKEN` repo secret** (a GoatCounter API token) to be set under Settings → Secrets and variables → Actions before it can run successfully. If `stats-snapshot.json` is missing, unreachable, or malformed, the pop-up shows "Stats unavailable" — this fetch is entirely independent of the total-visits one above, so one failing never affects the other. The fetch always uses `cache: "no-store"`, bypassing both the service worker's cache (which already excludes this file, see `sw.js` below) and the browser's ordinary HTTP cache (GitHub Pages serves this file with a 10-minute `Cache-Control: max-age`), so the popup never shows stats older than the last update. A **Refresh Stats** button next to Close re-runs that same fetch on demand, as a manual escape hatch. The pop-up closes the same way the Help modal does: its own Close button, clicking outside it, or pressing Escape.

**Fun extra:** clicking "View Puzzle Stats" also shatters the button itself into a handful of jagged pieces that tumble off the bottom of the screen, with a synthesized glass-breaking crash (same Web Audio API approach as the app's existing invalid-entry beep, no audio files), before the country-stats pop-up appears — purely cosmetic, both the animation and its sound skipped automatically if the browser's reduced-motion setting is on, and the button always comes back intact the next time it's needed.

### Version display

The current version number is shown right in the entry screen's page title (e.g. "Enter Your Puzzle v2.0.0").

### Analytics

The page includes [GoatCounter](https://www.goatcounter.com/) analytics tracking to record page visits.

## How to run it

This is a static site with no server or build step. Just open `index.html` directly in a browser, or serve the folder with any static file server if you prefer.

## Tests

The undo/redo history in `sudoku-ui.js` has a Node-based test suite that drives the real DOM (via [jsdom](https://github.com/jsdom/jsdom)) exactly as a user would — clicking buttons, typing digits, dispatching Ctrl+Z/Ctrl+Shift+Z keydowns — rather than calling internal functions directly.

```
npm install
npm test
```

## File structure

- **`index.html`** — the page markup and all styling (a single embedded `<style>` block), including both screens (entry and solving), the candidate buttons (placed into the solving grid's bottom-right corner cell by `sudoku-ui.js`), the "Iteration: N" corner panel, and the Help modal.
- **`sudoku-logic.js`** — pure puzzle-solving logic with no DOM dependencies: tracking sets for rows/columns/boxes, naked-singles propagation, MRV backtracking search, solution counting/uniqueness checks, difficulty rating, puzzle generation, and save-record parsing. Works equally under Node or in the browser.
- **`sudoku-ui.js`** — all DOM wiring and interactivity: building the grid, handling input/validation/beeps, candidate selection, backups, the solve/reset/write-to-file buttons, the Help modal, and registering the service worker. Relies entirely on `sudoku-logic.js` for the actual solving rules.
- **`manifest.json`** — the PWA web app manifest (name, icons, theme colors, display mode) used for "Add to Home Screen" installs.
- **`sw.js`** — the service worker: precaches the app's static files on install so they still load offline, while always going straight to the network for `stats-snapshot.json` and the GoatCounter requests so visit stats never show stale offline data.
- **`icons/`** — the app icon, as an SVG source (`icon.svg`) plus the generated PNG sizes the manifest and `apple-touch-icon` links reference.
- **`tests/`** — the undo/redo test suite described above.

## Credits

Built by **Gil Shannon**.

This project is open source — check out the code on GitHub: [https://github.com/GMShannon99/Sudoku-App](https://github.com/GMShannon99/Sudoku-App)

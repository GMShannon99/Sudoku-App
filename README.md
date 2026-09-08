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

### Backup for Reset / Reset

- **Backup for Reset** takes an in-memory snapshot of the grid exactly as it stands (givens plus everything you've typed so far). Each click adds another backup, and a running count ("N screen backups") is displayed.
- **Reset** restores the most recently saved backup, or — if nothing has been saved yet — clears the grid back to the puzzle's original clues.

### Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)

On the solving screen, **Ctrl+Z** (or Cmd+Z) undoes your most recent move — whether the digit was typed directly or filled in by clicking a candidate button — clearing that square and updating the row/column candidate labels. Repeated presses step back through your moves one at a time, most recent first. If a move is undone after the puzzle has auto-solved, the affected square becomes editable again instead of staying locked and blue. **Ctrl+Shift+Z** (or Cmd+Shift+Z) redoes the most recently undone move, putting its digit back. Making a new move after undoing clears anything left to redo. This history is separate from the Backup for Reset/Reset backups above: starting a new puzzle or clicking Reset both clear it, since either one establishes a fresh starting point.

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

**Print** generates a printable image of the current puzzle, sized for Letter-size (8.5×11in) portrait printing, so it can be worked on with pen or pencil, then opens your browser's native print dialog directly on it — no file to download or locate first. Before generating anything, it checks whether the current entries actually have a valid solution (reusing the same solver used everywhere else); if not, a popup explains that the puzzle has no valid solution and nothing is generated. The image includes a header (page title, difficulty, and today's date), the full 9×9 grid with thin cell borders and thicker 3×3 box borders, the given clues shaded with a light grey background (guesses stay on a plain background so the two are easy to tell apart on paper), the same row/column missing-digit numbers shown on screen, and — for every still-empty square — its remaining valid candidate digits laid out in a small 3×3 mini-grid inside the cell. Works the same way whether running from the browser or from the installed home-screen app.

**Print** works by revealing a hidden, print-only `<img>` (see `@media print` in `index.html`) and calling `window.print()` on the current page, rather than opening a separate print window — deliberately, since `window.print()` on a window opened via `window.open()` is unreliable on iOS Safari (it can print a blank page, or never surface the print sheet at all). On an iPhone, tapping **Print** brings up the same Share Sheet / AirPrint flow any other app's print button would — including from the installed home-screen app, which uses the same underlying print handling even without Safari's own browser chrome around it.

### Help

A **Help** button (available on both screens) opens an in-app documentation modal with two top-level sections: a general "How to Play Sudoku" primer on the rules of the game itself, followed by "Sudoku Web Functionality," covering every app feature above, along with the author's name and contact email, the current version number, and the date it was last updated.

### Puzzle stats

A **View Puzzle Stats** button sits in the Help modal's footer, next to Close. It shows a live hit count right there in the Help modal, fed by [CountAPI](https://countapi.mileshilliard.com/)'s free `/hit/` endpoint under the shared key `sudoku-gilshannon-live-total` — the exact same key sudoku-web uses, so both sites contribute to and display one combined total rather than two separate counts. That endpoint increments on every call, so it's only ever requested once, at page load (mirroring where the old analytics tracking pixel used to silently record a visit); clicking the button just displays that one already-fetched result rather than triggering a new hit. If the page-load request fails, times out, or comes back an unexpected shape, the modal shows "Puzzle stats are currently unavailable." instead of breaking or failing silently.

**Fun extra:** clicking "View Puzzle Stats" also shatters the button itself into a handful of jagged pieces that tumble off the bottom of the screen, with a synthesized glass-breaking crash (same Web Audio API approach as the app's existing invalid-entry beep, no audio files) — purely cosmetic, both the animation and its sound skipped automatically if the browser's reduced-motion setting is on, and the button always comes back intact the next time the Help modal opens.

### Special view

A **Special** button on the solving screen switches to a magnified, one-3×3-box-at-a-time view of the same puzzle — no separate copy of it, the same underlying cells the main board reads and writes. A given clue just shows its value, styled identically to the main board (shaded darker) and isn't clickable, same as on the main board. A cell you've already guessed also shows its value (plain, like the main board), but can be clicked to clear it back to empty, immediately showing its candidates again (recalculated fresh, since removing a guess can legalize digits that weren't valid a moment ago) so a different one can be picked instead — unless the puzzle is already solved, in which case every cell stays locked exactly as it is on the main board. An empty cell shows every digit still legally valid there right now, laid out in a small grid inside the cell — the same candidate logic and per-cell mini-grid layout the print feature already uses. Clicking an empty cell highlights it yellow, exactly like selecting a cell on the main board, and turns its candidates into clickable buttons; picking one fills it in immediately.

**Next** and **Prior** step through the puzzle's nine boxes in reading order (left to right, top to bottom); **Prior** disappears (via the same shatter effect described above, played in reverse) on the first box, and **Next** disappears the same way on the last box, each reappearing the moment you're no longer at that end. **Help** opens a Special-view-specific help document, wholly separate from the main puzzle's own Help. **Return** goes back to the main puzzle screen with anything you picked already applied.

Switching into the Special view (via **Special**) or back out of it (via **Return**) shatters the entire screen you're leaving apart — the same jagged-glass effect and crash sound as the button shatter above, just scaled up to cover the whole board and controls — before the other screen appears. Purely a transition effect: the destination screen is already fully built before the shatter even starts, so nothing is still loading once it appears. Skipped (an instant swap instead) under reduced motion, same as everywhere else this effect is used.

### Version display

The current version number is shown right in the entry screen's page title (e.g. "Enter Your Puzzle v4.0.1").

## How to run it

This is a static site with no server or build step. Just open `index.html` directly in a browser, or serve the folder with any static file server if you prefer.

## Tests

The undo/redo history in `sudoku-ui.js` has a Node-based test suite that drives the real DOM (via [jsdom](https://github.com/jsdom/jsdom)) exactly as a user would — clicking buttons, typing digits, dispatching Ctrl+Z/Ctrl+Shift+Z keydowns — rather than calling internal functions directly.

```
npm install
npm test
```

## File structure

- **`index.html`** — the page markup and all styling (a single embedded `<style>` block), including all three screens (entry, solving, and the Special view), the candidate buttons (placed into the solving grid's bottom-right corner cell by `sudoku-ui.js`), the "Iteration: N" corner panel, and both Help modals (main and Special-view).
- **`sudoku-logic.js`** — pure puzzle-solving logic with no DOM dependencies: tracking sets for rows/columns/boxes, naked-singles propagation, MRV backtracking search, solution counting/uniqueness checks, difficulty rating, puzzle generation, and save-record parsing. Works equally under Node or in the browser.
- **`sudoku-ui.js`** — all DOM wiring and interactivity: building the grid, handling input/validation/beeps, candidate selection, backups, the solve/reset/write-to-file buttons, the Help modal, and registering the service worker. Relies entirely on `sudoku-logic.js` for the actual solving rules.
- **`manifest.json`** — the PWA web app manifest (name, icons, theme colors, display mode) used for "Add to Home Screen" installs.
- **`sw.js`** — the service worker: precaches the app's static files on install so they still load offline, while always going straight to the network for the CountAPI live-count request so it never shows a stale count or gets replayed from a cached response.
- **`icons/`** — the app icon, as an SVG source (`icon.svg`) plus the generated PNG sizes the manifest and `apple-touch-icon` links reference.
- **`tests/`** — the undo/redo test suite described above.

## Version history

- **v4.0.1** — Removed the Download JPG button (Print alone now covers printing/saving the puzzle image). Switching into or out of the Special view now shatters the whole screen apart first, the same effect the Prior/Next/Solve/View Puzzle Stats buttons already use, just scaled up to cover the entire board and controls. In the Special view, a previously-guessed cell (not a given clue) can now be clicked to clear it back to empty and immediately re-shows its candidates, instead of being locked like a given cell.
- **v4.0.0** — Added the Special view: a new "Special" button on the solving screen switches to a magnified, one-3×3-box-at-a-time editor of the same puzzle (no separate copy of it), with its own Next/Prior/Return/Help controls and its own, separate Help document. Purely additive — no changes to puzzle-solving/generation/validation logic, and no changes to the main puzzle screen's own behavior or Help content beyond the version number line.
- **v3.0.0** — Replaced GoatCounter with [CountAPI](https://countapi.mileshilliard.com/) for the live hit counter (shared with sudoku-web via one key, `sudoku-gilshannon-live-total`). Removed GoatCounter entirely: the tracking script, the counter fetch, and the weekly country-stats breakdown feature built on top of it (the popup, its button, `stats-snapshot.json`, and the `update-stats.yml` GitHub Action). "View Puzzle Stats" now just shows the shared live total.
- **v2.0.0** — Prior release.

## Credits

Built by **Gil Shannon**.

This project is open source — check out the code on GitHub: [https://github.com/GMShannon99/Sudoku-App](https://github.com/GMShannon99/Sudoku-App)

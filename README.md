# Sudoku Web

A browser-based Sudoku puzzle entry and solving tool. Type in your own puzzle, paste one from a saved file, or generate a brand-new one at your choice of difficulty — then let the built-in solver finish it, or fill it in yourself with live validation and candidate hints the whole way through.

## Live demo

**[https://GMShannon99.github.io/sudoku-web/](https://GMShannon99.github.io/sudoku-web/)**

## Features

### Puzzle entry screen

When the app loads, you land on a blank entry grid where you can:

- **Type a custom puzzle** — enter the starting clues by hand, then click **Start Solving** to lock them in as givens (at least 6 filled squares are required).
- **Use Sample Puzzle** — jump straight to a built-in "world's hardest sudoku"-style puzzle (only 21 givens), ignoring anything you've typed.
- **Paste Puzzle** — load a puzzle record from the system clipboard: a single line of 81 grid digits (0–9, row by row, 0 for blank), optionally followed by one extra character. This is the same record format written by the desktop Sudoku Solver's "Save to File" feature. Invalid clipboard contents or an unsolvable puzzle both show a clear error message instead of loading.
- **Create New** — clears the entry grid so you can start typing a fresh puzzle.
- **Generate Puzzle** — pick a difficulty (**Easy**, **Moderate**, or **Hard**) and generate a brand-new, randomly created puzzle guaranteed to have exactly one solution. If no difficulty is selected, it defaults to Moderate. A "Generating puzzle…" message appears while it works, since finding the right difficulty can take a few attempts internally.

### Input validation everywhere

Both the entry screen and the solving screen enforce the same rule as you type: only digits 1–9 are accepted, and a digit already used elsewhere in that cell's row, column, or 3×3 box is rejected outright, accompanied by an audible beep.

### Click-to-see candidates

Clicking an empty square on the solving screen highlights it in yellow and shows that square's currently valid candidate digits as small yellow buttons in the board's bottom-right corner, next to the row/column-missing labels. Clicking a candidate fills it in for you; typing a digit directly works too. The highlight and candidate buttons clear automatically once a value is entered, and also clear on any other key press or mouse click elsewhere on the page — clicking away, pressing Escape, Ctrl+Z/Ctrl+Shift+Z, arrow keys, and so on all dismiss them without filling the square.

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

### Write to File

The **Write to File** button exports the current grid (givens plus whatever you've filled in) as a text record, in the same format Paste Puzzle understands. Each click saves a **new** file named `Sudoku_Save.txt` to your browser's default downloads location — browsers typically avoid overwriting the previous one automatically (e.g. by appending `(1)`, `(2)`, etc.), so repeated clicks will accumulate multiple files rather than replacing the last save.

### Help

A **Help** button (available on both screens) opens an in-app documentation modal with two top-level sections: a general "How to Play Sudoku" primer on the rules of the game itself, followed by "Sudoku Web Functionality," covering every app feature above, along with the author's name and contact email, the current version number, and the date it was last updated.

### Version display

The current version number is shown right in the entry screen's page title (e.g. "Enter Your Puzzle v1.0.3").

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
- **`sudoku-ui.js`** — all DOM wiring and interactivity: building the grid, handling input/validation/beeps, candidate selection, backups, the solve/reset/write-to-file buttons, and the Help modal. Relies entirely on `sudoku-logic.js` for the actual solving rules.
- **`tests/`** — the undo/redo test suite described above.

## Credits

Built by **Gil Shannon**.

This project is open source — check out the code on GitHub: [https://github.com/GMShannon99/sudoku-web](https://github.com/GMShannon99/sudoku-web)

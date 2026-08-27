# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

No build, no dependencies, no test suite. Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Verification is manual: reload the page and play.

## Architecture

Three files, loaded as plain globals — `game.js` is a classic `<script>` (no modules, no bundler), so
every function and the `let board, current, next, score, ...` state block at the top of `game.js` share
one scope. Adding a file means adding a `<script>` tag to `index.html` and keeping names unique.

`game.js` holds all logic:

- **Board**: `ROWS × COLS` array of ints; `0` = empty, `1–7` = piece type, which is also the index into
  `COLORS` and `PIECES`. Piece type, color, and shape are the same number everywhere — keep those three
  arrays index-aligned.
- **Pieces**: square matrices; rotation is a fresh transpose+reverse (`rotateCW`), never mutated in place.
  `tryRotate` applies basic wall kicks (`[0,-1,1,-2,2]` column offsets) before giving up on the rotation.
- **Loop**: `requestAnimationFrame` accumulator (`dropAccum` vs `dropInterval`). `draw()` repaints the
  whole canvas each frame — grid, board, ghost (`ghostY()` at alpha 0.2), then current piece.
- **Lock cycle**: `lockPiece() → merge() → clearLines() → spawn()`. `spawn()` calls `endGame()` when the
  newly promoted piece already collides.
- **Pause/restart**: `togglePause` cancels/restarts the rAF loop and reuses the same `#overlay` element
  as game over; `init()` is the full reset and is bound to the restart button.

## Gotchas

- Canvas size is hardcoded in `index.html` (`width="300" height="600"`). It must equal
  `COLS * BLOCK × ROWS * BLOCK` from `game.js`; changing one without the other silently clips or
  letterboxes the board. Same for `#next-canvas` (120×120) vs the `NB = 30` × 4-cell grid in `drawNext`.
- `updateHUD()` is called from the keydown handler and `clearLines()`, not from `loop()` — score changes
  made elsewhere need an explicit `updateHUD()`.
- UI strings are Spanish (`PAUSA`, `Reiniciar`, `Puntuación`); panel labels are English. Match what's
  already on screen.

# Football desktop — project context for Claude Code

A minimalist animated football play-art wallpaper for macOS, loaded in Plash.
Plain HTML/CSS/JS + SVG. No dependencies, no network at runtime, no build step
(except `node tools/bundle-data.mjs`, which must be re-run after editing any
JSON in `src/data/`).

Read `docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT_NOTES.md` before changing code.
Football reference: `docs/football/CONCEPTS.md` (generated from the play data).

## Ownership
This repo owns everything: rendering AND football content (plays, formations,
alignments, reads, ball targets). Football decisions follow one rule:
research, pick ONE coherent presentation where systems differ, and write the
choice into the play's `football` block + `sources`. Never blend systems.
Assumed defensive fronts go in `football.front`; defenders are never drawn.

## Product principles (in priority order)
1. Beautiful passive motion. 2. Recognizable football. 3. Lightly educational.
If text starts covering the screen, cut it. If aesthetics make a concept
unrecognizable, football correctness wins.

## Locked rules (data contract v0.3)
- Yards. Ball/center at x=0, +x = offense's right, y=0 = LOS, +y = downfield.
- Route depths are measured from the LOS; lateral movement is relative to the player.
- Run-game landmarks (`at`, `target`, `through`) are ABSOLUTE ball-relative points.
- `QB.x === C.x` unless `"qbOffset": true` (fatal validation error otherwise).
- 11 players, personnel must match position groups, 7 on the line (warning).

## Where things go
- New play → JSON in `src/data/plays/<concept>_<formation>.json`, add to manifest
- New formation → `src/data/formations/`, add to manifest
- New football term → one row in `src/data/vocabulary.js`
- New relationship → one row in TYPES in `src/renderer/relationships.js`
  (generic constraints: separation, lanes, levels, clears, converge, flow, follows, order)
- New geometric movement → one `register()` in `src/renderer/primitives.js`
- Pacing → `FD.Timing` in `src/animation/timeline.js` only
- Coordinate convention / cameras → `src/layout/coordinates.js` only

## Constraints
- Classic `<script>` tags on a shared `window.FD` namespace, not ES modules:
  the page must work from file:// in Plash.
- One rAF loop (animator.js); it must sleep during holds. No per-element timers.
- Visual direction: near-black #08090B, off-white linework, ONE accent
  (#E2C15F: ball, first read, line to gain). Premium, architectural, minimal.
- No concept-specific drawing code, ever.

## Verifying changes (cheapest first)
1. `node tools/validate.mjs` — headless: every play resolves, 11 players,
   personnel, QB rule, vocabulary, references, copy. Exit 1 on fatal.
2. In-page geometry: serve (`python3 -m http.server 8765`), open any play, run in
   the console: build every scene and read `scene.warnings` (relationship
   constraints: separations, lanes, levels, double-team convergence, zone flow).
3. Visual: `tools/contact.sh <outdir> 7.8 <play-id>...` → 2x2 contact sheets
   (headless Chrome). `tools/shoot.sh` for single frames.
   `index.html?play=<id>&t=<seconds>` freezes a play; `?debug=1` draws the camera.
4. Leaks: build → choreograph → evaluate → destroy every play in-page; the DOM
   node count must stay constant. `?soak=1` logs node counts per play in the
   real loop.
5. `node tools/concepts-doc.mjs` after changing any play's football/sources.

## Status (see git log for detail)
- 25 plays / 25 concepts / 5 formations: 8 dropback, 5 quick, 1 play-action,
  8 runs (zone, gap, iso, toss), 3 screens.
- Next: Phase F (50+ concepts), then G (legitimate formation variants), H polish.
  Recommended next concepts are listed in docs/DATA_CONTRACT_NOTES.md §8.

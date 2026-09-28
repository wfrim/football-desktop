# Football desktop — project context for Claude Code

A minimalist animated football play-art wallpaper for macOS, loaded in Plash.
Plain HTML/CSS/JS + SVG. No dependencies, no network at runtime, no build step
(except `node tools/bundle-data.mjs`, which must be re-run after editing any
JSON in `src/data/`).

Read `docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT_NOTES.md` before changing code.

## Division of responsibility
- This repo owns RENDERING. A separate football-data workstream owns football
  content (plays, formations, alignments, reads, ball targets).
- Never invent football decisions. If a handoff leaves something unspecified,
  leave it idle/unassigned or mark it `_provisional`, and report it as a gap.
- New plays must be data additions. No per-play or per-concept drawing code.

## Locked rules (data contract v0.2)
- Yards. Ball/center at x=0, +x = offense's right, y=0 = LOS, +y = downfield.
- Route depths are measured from the LOS; lateral movement is relative to the player.
- `QB.x === C.x` unless `"qbOffset": true` (fatal validation error otherwise).

## Where things go
- New football term → one row in `src/data/vocabulary.js`
- New relationship → one row in TYPES in `src/renderer/relationships.js`
  (built from generic constraints: separation, lanes, levels, clears)
- New geometric movement → one `register()` in `src/renderer/primitives.js`
- Pacing → `FD.Timing` in `src/animation/timeline.js` only
- Coordinate convention → `src/layout/coordinates.js` only

## Constraints
- Classic `<script>` tags on a shared `window.FD` namespace, not ES modules:
  the page must work from file:// in Plash.
- One rAF loop (animator.js); it must sleep during holds. No per-element timers.
- Visual direction: near-black #08090B, off-white linework, ONE accent
  (#E2C15F: ball, first read, line to gain). Premium, architectural, minimal.

## Verifying changes
- `index.html?play=<id>&t=<seconds>` freezes a play at a time for review.
- `?debug=1` draws the camera frame; `FD.Data.report` lists validation results.
- Check the console for relationship warnings after any geometry change.
- Soak test: let it cycle all plays; DOM node count per play must stay constant.

## Status
- Done: renderer foundation; 5 canonical pass plays (Mesh, Four Verticals,
  Stick, Curl-Flat, Dagger) on gun_doubles_11 / gun_trips_11.
- Open gaps for the football side: DATA_CONTRACT_NOTES.md §7.
- Next: CLAUDE HANDOFF #2 — Inside Zone, Outside Zone, Power, Counter,
  Halfback Screen (run blocking; run vocabulary currently provisional;
  handoff needs a two-player event model).

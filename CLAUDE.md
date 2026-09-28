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
- New concept → `src/data/concepts/<conceptId>.json`: written ONCE by role
  (#1/#2/#3, bs#1, PST/PSG/C/BSG/BST, QB/RB/FB/TE, custom roles), authored as
  if the play goes right, with gap landmarks ("b", "-a", "c+0.3", "PST", "mesh")
  instead of coordinates. Each `presentations[]` entry = one wallpaper play on
  one formation (mirroring and landmarks are automatic). Add to manifest.
  Syntax reference: header of `src/data/concepts.js`.
- New variant of a concept → one line in its `presentations` (plus `roles` /
  `tweaks` if the formation needs them). Only add variants that make football sense.
- One-off play with literal coordinates → `src/data/plays/` (legacy format, still valid)
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
1. `node tools/validate.mjs` — headless: every concept expands, every play
   resolves, 11 players, personnel, QB rule, vocabulary, roles. Exit 1 on fatal.
2. `tools/check.sh` (serve first: `python3 -m http.server 8765`) — headless
   geometry for every play: relationship constraints (separation, lanes, levels,
   double-team convergence, zone/wall flow) and COLLISIONS (a path through a
   player marker, a carry through a block). Must print only the summary line.
3. Visual: `tools/contact.sh <outdir> 7.8 <play-id>...` → 2x2 contact sheets
   (headless Chrome). `tools/shoot.sh` for single frames.
   `index.html?play=<id>&t=<seconds>` freezes a play; `?debug=1` draws the camera.
4. Leaks: build → choreograph → evaluate → destroy every play in-page; the DOM
   node count must stay constant. `?soak=1` logs node counts per play in the
   real loop.
5. `node tools/concepts-doc.mjs` after changing any play's football/sources.

## Status (see git log for detail)
- 91 plays / 42 concepts / 9 formations; everything except Iso is a template.
- Next: more concepts + variants (§8 of the contract notes), an RPO shape,
  pre-snap motion, then polish (pacing, typography, battery behaviour).

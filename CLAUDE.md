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
- Finding variants: `node tools/variants.mjs` lists every concept × formation
  that expands and validates but isn't presented yet; `--add concept:formation …`
  appends them. Candidates are LEGAL, not necessarily SENSIBLE: curate (no runs
  from Empty, spread concepts on spread formations…), then `tools/check.sh` and
  drop anything it flags rather than forcing it.
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

## Runtime features (settings panel: click the play counter; Plash needs Browsing Mode)
- `src/settings.js` (defaults ← localStorage ← URL params; URL wins) + `src/settingsPanel.js`.
- Themes: `styles/themes.css` token overrides only (`src/theme.js`); never hard-code colours.
- Field position: `src/fieldPosition.js`, `fieldRenderer.update(spot)`; plays must fit
  before the end line (`PlayRenderer.deepest`, DOM-free `PlayRenderer.layout`).
- Faint defenses: `src/defense/align.js` generates a defense from the offense
  (nickel/base, front by technique, Cover 1-4, man, run fits). Concepts carry
  `defense: { coverage, key, front }`; key = the defender job the concept attacks.
- Drive mode: `src/drive.js` (situational selection, results, field scroll).
  Drive flow Continuous: the exit rewinds while play + field scroll by the gain.
- Defensive playbook: `src/data/concepts/def_*.json`, family `defense` (defense drawn
  bold with playbook letters, offense faint). `defense` block: package (nickel, base,
  34, dime, bear, 335), front (techniques; `o` = standing edge), coverage (cover0/1/
  robber/2/tampa2/cover2man/3/buzz/4/6), moves {ID: {blitz|rush|stunt|drop|man|spy|at}},
  disguise (pre-snap shell), key. Syntax: header of `src/defense/align.js`.
- Play styles (Settings → Play style): Diagram (default) · Lead (throw in stride; route
  stops at `ball.at`, ghost of the rest) · Live offense / Live game (`src/live/sim.js`:
  deterministic 0.1 s simulation at build time; players move; run after catch; Live
  game: defense pursues, coverage decides the throw, tackles; Defense call Cooperative
  / Competitive; drives follow the outcome). QA: `index.html?check=1&style=game&call=comp`.
- Other settings: Library, Text, Brightness, Lines (hand-drawn), Transition (rewind),
  Zoom, Play length, Pace (extra slow), Moments (one ring pulse per play).
- `node tools/bundle-data.mjs` also cache-busts every asset URL in index.html:
  Plash's WebView serves stale cached files otherwise. Always run it after edits,
  then `open "plash:reload"`.
- Energy rules: docs/ENERGY.md (no overlays above the drawing, no masks, static
  field layer). Measure with `tools/energy.sh`.

## Status (see git log for detail)
- 307 plays / 92 concepts (60 offense + 32 defense) / 12 formations.
- Next: more concepts + variants (§8 of the contract notes), an RPO shape,
  pre-snap motion, then polish (pacing, typography, battery behaviour).

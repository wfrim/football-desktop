# Architecture

A passive, long-running wallpaper that draws football plays from data. Plain HTML/CSS/JS, SVG for all artwork, no dependencies, no network, no build step (one optional data-bundling script).

## The pipeline

```
formation JSON + play JSON  (the football contract)
  → resolve.js         formation alignment + family defaults + validation (QB rule)
  → vocabulary.js      canonical names (curl, pass_set…) → primitive specs / sequences
render-ready play
  → coordinates.js     data space → field space (yards, LOS-relative)
  → primitives.js      semantic assignment → relative waypoints
  → geometry.js        waypoints → filleted path, length, point-at, tangents
  → routeRenderer.js   path → SVG drawable with setProgress(p)
    formationRenderer  player → SVG marker with setPosition / setAppear / setHasBall
  → playRenderer.js    assembles a "scene" (drawables only, no timing)
  → relationships.js   generic constraints: validation, timing (clears), emphasis
  → choreography.js    scene → Timeline (the only place that decides *when*)
  → animator.js        the single clock that evaluates the Timeline
```

A new play is a data addition. A new *kind of movement* is one entry in `primitives.js`. Nothing anywhere is written per play.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Page shell. Loads classic scripts in dependency order. |
| `src/app.js` | Playlist loop: load → next → render → animate → hold → transition → cleanup → next. |
| `src/config.js` | URL options (`?mode=`, `?motion=`, `?speed=` …) and motion-profile resolution. |
| `src/stage.js` | Persistent SVG: defs, field, play layer, coalesced resize handling. |
| `src/hud.js` | Typographic layer (HTML). CSS transitions, toggled by timeline events. |
| `src/playlist.js` | `mix` (default): seeded shuffle re-ordered to alternate run / pass / screen and avoid concept or formation repeats. `?list=<tag>` filters. |
| `src/layout/coordinates.js` | The coordinate convention. The only file that knows data units and axes. |
| `src/layout/responsive.js` | Fits the yard-based world into the window; sets stroke weights. |
| `src/renderer/svg.js` | `el()` helper, number formatting, unique ids. |
| `src/renderer/geometry.js` | Pure path math (no DOM). Fillets, sampling, measurement, tangents, trimming. |
| `src/renderer/primitives.js` | Registry of semantic primitives (routes, blocks, pulls, motion…). |
| `src/renderer/routeRenderer.js` | Stroke reveal, masked dashed reveal, arrowheads, T-bars. |
| `src/renderer/formationRenderer.js` | Player markers (skill circle, OL rectangle, QB). |
| `src/renderer/fieldRenderer.js` | Field markings, drawn once. |
| `src/renderer/playRenderer.js` | Play JSON → scene. Generic; no football decisions. |
| `src/animation/timeline.js` | `FD.Timing` (all pacing), `FD.Ease`, `FD.Timeline`. |
| `src/animation/choreography.js` | Scene → timeline, for full and static profiles. |
| `src/animation/animator.js` | One rAF loop; sleeps during holds; pauses when hidden. |
| `src/data/loader.js` | Manifest fetch (http) or bundle (file://); resolves every play. |
| `src/data/resolve.js` | Canonical play + formation → render-ready play; validation (incl. `QB.x === C.x`). |
| `src/data/vocabulary.js` | Canonical football vocabulary → primitives; family defaults. |
| `src/renderer/relationships.js` | Relationship types → generic constraints (separation, lanes, levels, clears). |
| `tools/bundle-data.mjs` | Writes `src/data/plays.bundle.js` from the manifest. |

Differences from the suggested layout: `geometry.js`, `fieldRenderer.js`, `choreography.js`, `stage.js`, `hud.js`, `playlist.js` and `config.js` are additions that keep each file to one job. `animator.js` is the clock rather than a per-element animator.

## Why classic scripts instead of ES modules

Plash can load a page from a local file. Browsers (including WKWebView) block ES-module imports and `fetch()` of local JSON from `file://`. Classic scripts sharing a `window.FD` namespace work everywhere, and the play data is available as a generated JS bundle for the same reason. If you always serve over `http://localhost`, nothing needs to change: the loader prefers the manifest when it can fetch.

## Coordinates and responsiveness

SVG space is measured in **yards**. The viewBox decides how many pixels a yard gets, so artwork never contains pixel values. On resize, only the viewBox and a few `--sw-*` stroke-width custom properties change; no geometry is rebuilt.

There are exactly two canonical cameras: `Coords.DEFAULT_FRAME` (wide, for anything that goes deep) and `Coords.TIGHT_FRAME` (about 1.4× larger, chosen automatically when no path goes past 10 yd, so runs, screens and quick game are legible). Two fixed scales keep the wallpaper from "zooming" arbitrarily. When the scale changes between plays, the field grid is hidden and fades back in with the new play, so the grid never visibly jumps. `responsive.js` reserves screen-space insets for the typography and fits that frame into the rest.

Stroke widths are specified as intended CSS-pixel weights and converted to yards per resize, so a route is ~1.7px on a laptop and grows slightly (max 1.35×) on large displays.

## Timing

All pacing lives in `FD.Timing` (`src/animation/timeline.js`):

- `phases`: enter, motion, snap, assign, read, release, arrive, hold, exit, end.
- `kinds`: per-assignment-kind defaults. Duration = path length ÷ draw speed, clamped. Longer routes draw longer, which reads more naturally than fixed durations.
- `?speed=` scales the clock globally without touching any of it.

An assignment can override its timing in data with `timing: { phase, delay, duration, at, ease }`.

## Presentation modes

- **Diagram** (default): markers stay aligned; assignments draw on. Pre-snap motion always moves the marker, since it changes the formation.
- **Simulation** (`?mode=simulation`): markers travel along their paths. The ball is thrown to where the receiver actually is at arrival time. Progression numerals are omitted.
- **Static profile** (`?motion=static`, or automatic with reduced motion / battery): the finished diagram cross-fades in, holds (`Timing.staticHold`), and cross-fades out.

## Performance

- One `requestAnimationFrame` loop exists, and it runs only while a track is mid-flight. During holds the animator sleeps on a single `setTimeout` until the next change. A finished diagram costs no frames.
- Pauses on `visibilitychange` and resumes exactly where it left off.
- Each marking category on the field is one `<path>`; the field is built once.
- Each play is one `<g>`; teardown removes it plus any masks it added to `<defs>`. The DOM node count is constant across cycles (verified over many loops).
- Optional frame cap: `?fps=30`.

## Power

`FD.Config.profile()` is re-evaluated before every play. With `?motion=auto` it returns `static` when `prefers-reduced-motion` is set or when the Battery API reports discharging. WKWebView (Plash) does not expose the Battery API, so on a Mac today `auto` means "honour reduced motion". A reliable AC/battery switch would need Plash to load a different URL (e.g. via a Shortcuts automation that changes the Plash website), or a tiny local helper. The seam is already in place: the profile is just a string the loop reads.

## Extending

- **New play**: add JSON under `src/data/plays/`, list it in `src/data/manifest.json`, run `node tools/bundle-data.mjs`.
- **New formation**: same, under `src/data/formations/`.
- **New football term**: one row in `vocabulary.js`. **New relationship**: one row in `relationships.js` TYPES, built from existing constraints.
- **New primitive**: `FD.Primitives.register('name', { kind, end, style, radius, build(params, ctx) })`, returning waypoints relative to the player. `ctx` gives `origin`, `inward`, `outward`, `u()` (scalar units), `v()` (vector units) and `dy(depth)` (LOS depth → relative).
- **New kind of drawable** (e.g. a zone shape): add a renderer that exposes a `setProgress`/`setAppear` control, return it from the scene, and schedule it in `choreography.js`.
- **Different data convention**: `FD.Coords.setConvention({ units: 'ft', ... })`, or adapt `fromData()`.

## Run game

A handoff is a two-player event, not a path: `play.handoff = { to, at }`. The ball travels from the QB to the exchange point on the carrier's `run` track when that point is drawn, then rides the track as it draws (or with the runner in simulation). Blocking primitives take absolute landmarks (`at`, `target`, `through`, `hole`), because blocks are authored against defenders' spots, not against the blocker. Gap-scheme timing is relational, not hand-tuned: the `pull` / `kickout` relationships delay the whole backfield action until the pullers reach the line first.

## Live styles (src/live/)

- `pairing.js` — build-time: which defender every blocking assignment meets (pass pro by
  rusher across, run blocks by contact point, kick-outs by the end man, leads/wraps by
  the second-level player; perimeter blocks pre-targeted in playRenderer).
- `sim.js` — one deterministic 0.1 s pass over all 22 players: blockers follow their
  paths, work up to their man and latch; latched pairs move as one until the hold time
  expires (shed); rushers take lanes to the QB; man defenders trail; zone defenders drop,
  match and break on the ball; the QB throws on schedule (Cooperative) or works the
  progression (Competitive); after the catch/carry the carrier steers upfield and free
  defenders take pursuit angles. Outputs every player's track, the throw actually made,
  latches (pulls/leads are redrawn to the real contact), and `outcome.why`.
- `notes.js` — turns `outcome.why` into the Coach's note.
- Play out "to the whistle" runs the simulation until the play ends; the camera follows
  the carrier by translating the play and field layers (same mechanism as the drive scroll).

## Ball chain

`play.exchanges` generalises handoff/pass into a sequence (handoff, pitch, pass from any
player). `resolveChain` (playRenderer) times each leg from the receiver's authored path;
choreography flies the ball between holders and otherwise keeps it on the holder
(marker in live styles, drawing tip in diagram). In every live style the ball follows
its holder's marker, and QA checks it never drifts.

## Dev aids

- `node tools/validate.mjs`: headless data validation (exit 1 on fatal).
- `tools/shoot.sh` / `tools/contact.sh`: headless-Chrome screenshots and 2×2 contact sheets.
- `node tools/concepts-doc.mjs`: regenerates `docs/football/CONCEPTS.md`.
- `?soak=1`: logs DOM node counts per play (and records them on `<html data-soak>`).

- `?t=5.5` freezes at a time, for design review and screenshots. `?play=dagger` starts at a play.
- `?debug=1` draws the camera frame and logs animator stats.
- `FD.app` in the console exposes the config, stage, animator and playlist.

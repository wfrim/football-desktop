# Football desktop

A minimalist, animated football play-art wallpaper for macOS, built to run in [Plash](https://sindresorhus.com/plash). Plain HTML/CSS/JS and SVG; no dependencies, no network, no build step.

> 25 plays across dropback, quick game, play-action, runs (zone, gap, iso, toss) and screens. Full list: `docs/football/CONCEPTS.md`.

## Run it

- **Browser:** open `index.html`.
- **Plash:** add `index.html` as a local website, or serve the folder (`python3 -m http.server 8000` from this directory) and add `http://localhost:8000`. If Plash's auto-reload interval is on, turn it off; the page loops on its own.

After editing any play or formation JSON, run `node tools/bundle-data.mjs` so `file://` loading sees the change (served over http, the JSON is read directly).

## Settings

Click the play counter (bottom right) to open the settings sheet: theme, faint
defense, field position, hash, drive mode, motion and pace. Settings are saved on
this Mac. In Plash, clicks only reach the page in **Browsing Mode** (Plash menu →
Browsing Mode); turn it off again afterwards.

## Options (URL query)

| Option | Values | Default |
| --- | --- | --- |
| `mode` | `diagram`, `simulation` | `diagram` |
| `motion` | `auto`, `full`, `static` | `auto` (static if reduced motion is on) |
| `speed` | `0.25` – `4` | `1` |
| `labels` | `skill`, `all`, `none` | `skill` |
| `fps` | `15` – `120` | `30` |
| `theme`, `defense`, `field`, `hash`, `drive`, `motion` | pin a setting (see Settings) | saved setting |
| `spot`, `at_hash` | review aid: snap the ball at a yard line / hash | — |
| `order` | `mix`, `shuffle`, `sequential` | `mix` (alternates run / pass / screen) |
| `list` | playlist filter: `run`, `pass`, `screen`, `zone`, `gap`, `quick`, `deep`, or a concept id | all |
| `seed` | shuffle seed | new each launch |
| `play` | play id to start at (e.g. `dagger_gun_doubles_11`) | first |
| `t` | seconds; freezes the frame | — |
| `mocktag` | `0` hides the "Mock data" note | shown |
| `debug` | `1` draws the camera frame | off |
| `soak` | logs DOM node counts per play | off |

Example: `index.html?mode=simulation&speed=0.8`

## Docs

- `docs/ARCHITECTURE.md` — how play JSON becomes animated SVG, timing, performance.
- `docs/DATA_CONTRACT_NOTES.md` — coordinate convention, play/formation schema, vocabulary, relationships, open limits.
- `docs/football/CONCEPTS.md` — per-concept football reference (generated from the play data).

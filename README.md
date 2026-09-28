# Football desktop

A minimalist, animated football play-art wallpaper for macOS, built to run in [Plash](https://sindresorhus.com/plash). Plain HTML/CSS/JS and SVG; no dependencies, no network, no build step.

> Includes five canonical pass concepts (Mesh, Four Verticals, Stick, Curl-Flat, Dagger) on the v0.2 data contract. Formation alignments and throw targets are still provisional; see `docs/DATA_CONTRACT_NOTES.md`.

## Run it

- **Browser:** open `index.html`.
- **Plash:** add `index.html` as a local website, or serve the folder (`python3 -m http.server 8000` from this directory) and add `http://localhost:8000`. If Plash's auto-reload interval is on, turn it off; the page loops on its own.

After editing any play or formation JSON, run `node tools/bundle-data.mjs` so `file://` loading sees the change (served over http, the JSON is read directly).

## Options (URL query)

| Option | Values | Default |
| --- | --- | --- |
| `mode` | `diagram`, `simulation` | `diagram` |
| `motion` | `auto`, `full`, `static` | `auto` (static if reduced motion is on) |
| `speed` | `0.25` – `4` | `1` |
| `labels` | `skill`, `all`, `none` | `skill` |
| `fps` | `15` – `120` | `60` |
| `order` | `sequential`, `shuffle` | `sequential` |
| `play` | play id to start at (e.g. `dagger`) | first |
| `t` | seconds; freezes the frame | — |
| `mocktag` | `0` hides the "Mock data" note | shown |
| `debug` | `1` draws the camera frame | off |

Example: `index.html?mode=simulation&speed=0.8`

## Docs

- `docs/ARCHITECTURE.md` — how play JSON becomes animated SVG, timing, performance.
- `docs/DATA_CONTRACT_NOTES.md` — provisional coordinate convention, primitive vocabulary, and what the renderer needs from the football data.

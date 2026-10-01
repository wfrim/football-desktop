# Football desktop

**New here? Start with [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**: install Plash, set it as your wallpaper, and a tour of every setting.

A minimalist, animated football play-art wallpaper for macOS, built to run in [Plash](https://sindresorhus.com/plash). Plain HTML/CSS/JS and SVG; no dependencies, no network, no build step.

> 354 plays across offense (spread, pro, Wing-T, Power T, Wildcat, goal line, trick plays) and a full defensive playbook. Full list: `docs/football/CONCEPTS.md`.

## Run it

- **Browser:** open `index.html`.
- **Plash:** add `index.html` as a local website, or serve the folder (`python3 -m http.server 8000` from this directory) and add `http://localhost:8000`. If Plash's auto-reload interval is on, turn it off; the page loops on its own.

After editing any play or formation JSON, run `node tools/bundle-data.mjs` so `file://` loading sees the change (served over http, the JSON is read directly).

## Settings

Click the play counter (bottom right) to open the settings sheet:
- Look: theme, brightness, text, lines (precise / hand-drawn), zoom
- Look: themes include **Stadium** (turf, bright paint, slashed end zones, numbers on the field)
- Football: play style (diagram / lead / live offense / live game), play out (standard /
  to the whistle, camera follows), coach's note, defense call, pursuit, run out,
  option routes (both / decide), playbook (everything / pro / spread / wildcat / power T /
  wing-T / goal line / trick plays / defense), library (everything / offense / defense /
  runs / passes / screens), defense (off / faint / faint + key / bold), defense ink,
  blitz tell, matchup label, field position, hash, drive mode, drive flow
- Motion: motion (full / calm / still), pace, play length, transition, click to pause, moments
- Click the wallpaper to pause; ←/→ step through the play, drag the scrubber, click or Space to resume Settings are saved on
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

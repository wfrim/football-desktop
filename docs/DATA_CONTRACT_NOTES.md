# Data contract notes

**Status:** v0.2, first canonical milestone. Coordinate rules and the QB rule are **locked**. Formation alignments, vocabulary geometry defaults, relationship type names, and ball targets are **provisional** (marked in the files). Run-game vocabulary is mapped but not validated until the run-game handoff.

## 1. Locked rules

| Rule | Value |
| --- | --- |
| Units | Yards |
| Origin | Ball / center at `x = 0`, line of scrimmage at `y = 0` |
| Axes | `+x` offense's right, `-x` offense's left, `+y` downfield, `-y` backfield |
| Route depth | Measured **from the LOS**. A 5-yard route breaks ~5 yards past the LOS regardless of the receiver's initial depth. |
| Lateral movement | Relative to the player's starting position (`across`, `width`, `length`). |
| QB alignment | `QB.x === C.x` unless the play or formation sets `"qbOffset": true`. Enforced as a **fatal** validation error (the play is skipped; the wallpaper keeps running). |

## 2. Files

```
src/data/
  manifest.json                 playlist order + formation list
  formations/gun_doubles_11.json
  formations/gun_trips_11.json
  plays/mesh.json, four_verticals.json, stick.json, curl_flat.json, dagger.json
  vocabulary.js                 canonical names → geometric primitives (the adapter)
  resolve.js                    formation + play → render-ready play, validation
```

## 3. Formation shape

```jsonc
{
  "id": "gun_doubles_11",
  "name": "Gun Doubles",
  "personnel": "11",
  "players": [ { "id": "QB", "role": "QB", "at": [0, -5] }, ... ]   // all 11
  // optional: "qbOffset": true, "ball": { "hash": "left" }
}
```

## 4. Play shape

```jsonc
{
  "id": "mesh",
  "name": "Mesh",
  "family": "dropback_pass",                 // selects defaults for unmentioned OL / QB
  "personnel": "11",
  "formation": "gun_doubles_11",
  "alignment": { "RB": [-1.6, -5] },         // optional per-play overrides, not a full list
  "copy": { "title", "meta", "formation", "situation", "description" },  // wallpaper text, verbatim
  "situation": { "coverage", "down", "distance", "distanceLabel" },     // numeric distance draws sideline chain marks
  "intent": [ "..." ],                       // carried, not yet displayed
  "assignments": {
    "H":  { "type": "cross", "depth": 5, "dir": "right" },
    "RB": { "type": "pass_set_then_release", "release": { "type": "flat", "dir": "right" } },
    "OL": { "type": "pass_set" }             // optional group key
    // a value may also be an ARRAY: an explicit sequence of steps
  },
  "relationships": [ { "type": "mesh", "participants": ["H", "Y"], "separation": 1 } ],
  "ball": { "to": "H", "at": 0.7 },          // "at" = fraction along the receiver's route; or { "to": { "point": [x, y] } }
  "reads": ["H", "Y"]                        // optional progression numerals
}
```

Family defaults (provisional): `dropback_pass` and `quick_pass` give OL `pass_set` and QB `qb_drop` (2 yd and 1 yd). Anything the play doesn't mention and no family default covers is drawn **idle** (dimmed, no path), rather than invented.

## 5. Vocabulary

Canonical names map to a small set of geometric primitives in `vocabulary.js`. Parameters in the play override the defaults.

| Canonical | Primitive | Defaults | Status |
| --- | --- | --- | --- |
| `go` | vertical | depth 18 | validated |
| `seam` | vertical | depth 18, slight inside release | validated |
| `drag` | cross | depth 2.5, across 14 | validated |
| `cross` | cross | depth 8, across 22 | validated |
| `stick`, `sit` | settle | depth 6, turn in, **settle ring** | validated |
| `curl` | settle | depth 12, back 1.5, **settle ring** | validated |
| `flat` | flat | depth 2, width 7 (backs bow outside first) | validated |
| `dig` | horizontal | depth 14, length 10, in | validated |
| `pass_set` | block | set back, fanned by alignment | validated |
| `pass_set_then_release` | sequence: check step → `release` route | release delay 0.45 s | validated |
| `delayed_release` | `release` route with start delay | 0.7 s | validated |
| `qb_drop` | qbDrop | 2 yd | validated |
| `zone_step`, `reach`, `down`, `climb`, `combo`, `pull`, `wrap`, `kickout`, `lead`, `release`, `runner_path` | block / pull / lead / path | placeholders | **provisional** |
| `handoff`, ball path | `ball` / `events` | — | see gaps |

Routes that **end and settle in space** (stick, sit, curl) end in an open ring instead of an arrowhead. That is the renderer's visual distinction between "stops here" and "keeps going".

**Sequences.** Any assignment can be an array of steps, and some vocabulary entries expand to several steps. Each step starts where the previous one ended, after it finishes plus its `delay` (default 0.35 s). This covers check-then-release now, and combo-then-climb for the run game.

## 6. Relationships

The renderer understands four generic constraints, and a relationship type is a list of them. It never draws a concept by name.

| Type | Participants | Constraint | Effect |
| --- | --- | --- | --- |
| `mesh` | `participants: [a, b]`, `separation` | separation | Warns if the paths come within 80% of `separation` anywhere |
| `lanes` | `participants` left → right, `minGap` | lanes | Warns if lateral order or spacing breaks at 8 and 14 yd |
| `levels` | `participants` deep → shallow | levels | Warns unless each route ends ≥ 2 yd shallower than the one before |
| `high_low` | `high`, `low` | levels (3 yd) | Same, two routes |
| `clear` | `clear`, `into`, `margin` | clears | **Timing:** delays `into` until `clear` is `margin` yd past `into`'s break depth |
| `combo` | — | none yet | Reserved for blocking |

All participants get concept emphasis: full-strength strokes, while other routes drop to half strength. The throw waits for its target spot to be drawn, which is how Dagger's delayed dig still gets its ball on time.

The validator has already paid for itself. The first Mesh render warned that the crossers came within 0.78 yd, because each crosser's *end* ran into the other receiver's stem. The concept was fine; the unspecified crossing length wasn't. It's now 20 yd.

## 7. What the renderer cannot cleanly express yet

These are gaps in the contract that I want the football side to decide, not things I should guess.

1. **Throw target and progression.** The handoff gives no ball target or read order for any play. The five throws are renderer-chosen presentation placeholders, each marked `_provisional`. Read numerals are off. Needed: `ball.to` (and where along the route), and `reads`, per play.
2. **Unassigned players.** Stick's X and RB, and the backsides and RBs of Curl-Flat and Dagger, have no assignments, so they're drawn idle. Needed: either assignments, or an explicit `"idle"` / `"backside": "not shown"` so it's intentional.
3. **Concept side and receiver numbering.** Curl-Flat and Dagger don't say which side; I drew Curl-Flat right and Dagger left. For Stick from trips, I read "inside receiver" as #2 (H) and "third receiver" as #3 (Y). Needed: explicit player ids, or a `side` plus #1/#2/#3 numbering convention the resolver can map.
4. **Formation alignments.** The split widths and depths in both formation files are mine. Needed: canonical alignment coordinates (or landmark rules; see 6).
5. **Option routes.** Stick and sit routes often convert (sit vs. zone, break out vs. man). There's no way to express branches. A proposed shape is `"options": [{ "vs": "man", ... }]`, drawn as a faint secondary path.
6. **Landmarks.** Seams and verticals are defined by field landmarks (hash, top of the numbers), not yards from the player. The renderer only knows relative yards, so seams are approximated with a slight inside release. A landmark vocabulary (`"lane": "hash"`) would make seams exact on any hash.
7. **Timing semantics.** Quick game vs. dropback currently changes only QB drop depth, and release timing is presentational. If football timing should show (e.g. Stick throwing earlier than Dagger), I need per-family or per-play timing hints.
8. **Situation.** "3rd & Medium" has no number, so the sideline chain marks (which need a numeric `distance`) don't draw. Provide `distance` if you want them.
9. **Handoff.** A handoff involves two players and the ball at one point, so it doesn't fit the "one player, one path" model. The renderer has `ball` and `events` (mesh-point marker) that can express it, but the contract should define it before the run-game handoff.
10. **Relationship type names.** `mesh`, `lanes`, `levels`, `high_low` and `clear` are my names. Please confirm or replace them; only the TYPES table needs to change.
11. **Copy lines.** Only Mesh supplied a formation line and a situation line. The others show the formation from the formation definition, and no situation line.

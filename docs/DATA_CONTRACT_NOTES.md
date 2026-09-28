# Data contract notes

**Status:** v0.3. The repo now owns football content as well as rendering, so the
v0.2 "gaps for the football side" are decided (see §7). Coordinate rules and the QB
rule are locked.

## 1. Locked rules

| Rule | Value |
| --- | --- |
| Units | Yards |
| Origin | Ball / center at `x = 0`, line of scrimmage at `y = 0` |
| Axes | `+x` offense's right, `-x` offense's left, `+y` downfield, `-y` backfield |
| Route depth | Measured **from the LOS**. A 5-yard route breaks ~5 yards past the LOS regardless of the receiver's initial depth. |
| Lateral route movement | Relative to the player's start (`across`, `width`, `length`). |
| Run landmarks | `at`, `target`, `through`, `via` (with `at`), `hole` are **absolute**, ball-relative points. Blocks and carries are authored against the line, not the player. |
| QB alignment | `QB.x === C.x` unless the play or formation sets `"qbOffset": true`. **Fatal.** |
| Formation | Exactly 11 players, unique ids, personnel digits match position groups (**fatal**); 7 players on the line (**warning**). |

## 2. Files

```
src/data/
  manifest.json                     formations + plays (playlist pool)
  formations/<id>.json              gun_doubles_11, gun_trips_11, pistol_strong_11,
                                    singleback_tight_12, i_form_21
  plays/<concept>_<formation>.json  one presentation per file
  vocabulary.js                     canonical football words → primitives (+ aliases)
  resolve.js                        formation + play → render-ready play, validation
docs/football/CONCEPTS.md           generated reference (tools/concepts-doc.mjs)
```

## 3. Formation

```jsonc
{
  "id": "pistol_strong_11", "name": "Pistol Strong", "personnel": "11",
  "players": [ { "id": "QB", "role": "QB", "at": [0, -4] }, ... ],   // all 11
  // optional per player: "pos": "TE" (position group for personnel checks;
  //   default by role: X/Z/H/W = WR, Y/U = TE, RB/F/FB = RB)
  // optional: "qbOffset": true, "ball": { "hash": "left" }
}
```

Players with `y > -0.9` count as on the line. Under-center QBs sit at `y = -1.7` so the
marker clears the center.

## 4. Play

```jsonc
{
  "id": "counter_gt_gun_trips_11",   // <conceptId>_<formation>
  "conceptId": "counter_gt",         // concept vs presentation: variants share the conceptId
  "name": "Counter GT",
  "family": "run",                   // dropback_pass | quick_pass | play_action | screen | run | rpo
  "subfamily": "gap",                // zone | gap | quick | high_low | flood | perimeter…  (playlist tags)
  "tags": ["perimeter"],             // optional extra playlist tags
  "side": "right",                   // play side: resolves dir "play" / "back" (runs)
  "personnel": "11", "formation": "gun_trips_11",
  "alignment": { "RB": [-1.6, -5] }, // optional per-play overrides
  "copy": { "title", "meta", "formation", "situation", "description" },  // wallpaper text, ≤72-char description
  "situation": { "down": 3, "distance": 2 },   // numeric distance draws the sideline line-to-gain marks
  "assignments": {
    "LG": { "type": "kickout", "at": [4.9, 0.2], "turn": 2.0 },
    "RB": [ { "type": "counter_step", "through": [[-2.5, -5.15]] },          // array = sequence
            { "type": "carry", "delay": 0.05, "through": [[0.3, -4.3], [3.7, -0.8], [4.1, 5.5]] } ],
    "OL": { "type": "pass_set" }     // optional group key
  },
  // an assignment step with "alt": true is an ALTERNATE path (cutback, bounce, option
  // break): starts from the player, drawn quiet and dashed, never carries the ball.
  "relationships": [ { "type": "pull", "puller": "LG", "wrap": "LT", "runner": "RB" } ],
  "ball":    { "to": "H", "at": 0.7 },          // pass: fraction along the receiver's route
  "handoff": { "to": "RB", "at": [0.3, -4.3] }, // run: exchange landmark (or a fraction); ball then rides the carry
  "primary": "RB",                   // optional: full-strength path (defaults to handoff target / first read)
  "reads": ["H", "Y", "Z"],          // progression numerals (pass plays)
  "frame": "tight",                  // optional camera override; normally automatic
  "football": { "front", "rules", "rb", "read" },   // concise football notes → CONCEPTS.md
  "sources": ["…"]                   // provenance → CONCEPTS.md
}
```

Family defaults: `dropback_pass` / `quick_pass` / `screen` protect with the OL and drop
the QB (2 / 1 / 3 yd). `run` and `play_action` have no defaults: every assignment is
explicit. Anything unassigned is drawn idle (dimmed), never invented.

## 5. Vocabulary (`vocabulary.js`)

| Group | Canonical words | Primitive |
| --- | --- | --- |
| Routes | go, seam, fade, slant, quick_in, quick_out, in, out, dig, post, skinny_post, corner, hitch, curl, comeback, stick, sit, spot, drag, cross, flat, arrow, swing, bubble, wheel, double_move | vertical, angle, horizontal, cross, settle, flat, swing, path, doubleMove |
| Aliases | shallow→drag, hook→sit, stop→hitch, whip/speed_out→quick_out, vertical/streak→go, flag→corner | — |
| Protection | pass_set, pass_set_then_release, delayed_release, qb_drop | block, qbDrop |
| Zone blocking | zone_step, reach, scoop, base, combo (`target`, `climb`) | step, doubleTeam → lead |
| Gap blocking | down, back, hinge, pull (`at`, `hole`), kickout, wrap, lead, crack, stalk | step, pull, lead |
| Backfield | carry, counter_step, fake, handoff (QB track) | run, qbPath |
| Screens | screen_release (pass-set, then release to `at`) | block → lead |

Settle routes (stick, sit, curl, hitch, spot) end in an open ring; everything that keeps
going ends in an arrow; blocks end in a T-bar.

## 6. Relationships (`relationships.js`)

A relationship names a concept; the renderer only knows generic constraints. Every
participant is emphasized (full-strength strokes; other assignments recede).

| Type | Fields | Constraint | Effect |
| --- | --- | --- | --- |
| `mesh` | participants, separation | separation | warns if crossers come within 80% of `separation` |
| `lanes` | participants (left→right), minGap | lanes | warns if lateral order/spacing breaks at 8 and 14 yd |
| `levels` | participants (deep→shallow) | levels | warns unless each ends ≥ 2 yd shallower |
| `high_low` | high, low | levels (3 yd) | same, two routes |
| `clear` | clear, into, margin | clears | **timing:** delays `into` until `clear` is past its break depth |
| `combo` | participants | converge | warns if the double-team points are > 1.2 yd apart |
| `zone` | participants | flow (play) | warns if a zone blocker's first step isn't play-side |
| `wall` | participants | flow (back) | warns if a down block isn't back-side |
| `pull` | puller, wrap?, runner | follows, order | **timing:** runner hits the LOS after the puller(s); wrap starts after the kicker |
| `kickout` | blocker, runner | follows | **timing:** runner hits the LOS after the kick-out |
| `convoy`, `feature` | blockers / participants | — | emphasis only |

## 7. v0.2 gaps — decisions

1. **Throw targets / reads**: every pass play has `ball` + `reads`, chosen to match the concept's primary read.
2. **Unassigned players**: every play assigns all 11 (backside routes, protection, stalk blocks).
3. **Concept side / numbering**: explicit player ids; `side` for runs. Trips are always to the right in `gun_trips_11` (Z #1, H #2, Y #3).
4. **Formation alignments**: owned here; documented in each formation's `_note`.
5. **Option routes**: expressible as `alt` paths (not yet used for pass options).
6. **Landmarks** (hash / numbers): still approximated in yards. Open.
7. **Timing semantics**: quick vs dropback differs by QB drop; screens and gap runs use real sequencing (pass-set→release, pullers→runner). Per-family throw timing is still global. Open.
8. **Situation**: numeric `distance` where the copy implies one.
9. **Handoff**: `handoff` field; the ball rides the carrier's track from the exchange.
10. **Relationship names**: kept and extended (§6).
11. **Copy lines**: every play has title / meta / formation / situation / description.

## 8. Known limits and next concepts

- **Cameras.** Two canonical scales only: wide (`DEFAULT_FRAME`) and tight (`TIGHT_FRAME`, chosen automatically when nothing goes deeper than 10 yd). The field grid fades back in whenever the scale changes.
- **No RPO primitive yet.** An RPO needs a run and a route drawn as simultaneous *options* with one ball. `alt` paths plus a `ball.options` list is the likely shape.
- **Motion** is supported by the renderer (`motion` primitive) but no play uses it yet. Jet/orbit motion is the natural next test.
- **Next concepts (Phase F):** Spacing, Flood (3x1), Hank, Choice, Texas/Angle, Post-Wheel, Switch Verticals, Scissors, PA Cross, Yankee; Counter GH/Trey, Trap, Wham, Draw, Buck Sweep, Stretch; Smoke, Now, Middle Screen, TE Screen; Glance / Bubble / Stick RPO (after the RPO shape exists). Then Phase G variants (Mesh from Bunch/Empty, IZ from Pistol/Singleback, Power from Gun/Singleback, 4 Verts from Trips/Empty), which needs Bunch, Empty and Gun Trey formations.

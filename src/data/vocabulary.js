/*
 * vocabulary.js — canonical football assignment names → renderer primitives.
 *
 * This is the adapter between the football-data contract and the geometric
 * primitive layer. The renderer never sees words like "curl" or "combo";
 * it sees `settle`, `doubleTeam`, etc. Swapping or extending the football
 * vocabulary means editing this table, not rendering code.
 *
 * Each entry: expand(spec, player) → one or more primitive specs. Returning
 * several specs creates a SEQUENCE: each step starts where the previous one
 * ended, after it finishes (see playRenderer.js). Canonical parameters
 * (depth, dir, width…) pass straight through and override the defaults.
 *
 * Every entry is exercised by at least one play (see docs/football/).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  // Canonical keys a spec may carry that are *not* geometry parameters.
  const META = new Set(['type', 'player', 'delay', 'timing', 'end', 'style', 'check', 'alt', '_note']);

  function params(spec, defaults) {
    const out = Object.assign({}, defaults);
    for (const k in spec) {
      if (META.has(k)) continue;
      if (k === 'release' && typeof spec[k] === 'object') continue; // nested route spec, not geometry
      out[k] = spec[k];
    }
    if (spec.end) out.end = spec.end;
    if (spec.style) out.style = spec.style;
    if (spec.timing) out.timing = spec.timing;
    if (spec.alt) out.alt = true;
    if (typeof spec.delay === 'number') out.timing = Object.assign({}, out.timing, { delay: spec.delay });
    return out;
  }

  const prim = (type, defaults, extra) => ({
    status: 'validated',
    expand: (spec) => [Object.assign({ type }, extra || {}, params(spec, defaults))],
  });
  const provisional = (entry) => Object.assign(entry, { status: 'provisional' });

  // Pass protection: a short set back, fanning slightly outward by alignment.
  function passSetVector(player) {
    const x = player.at[0];
    const lateral = Math.max(-0.35, Math.min(0.35, x * 0.13));
    return [lateral, -0.9];
  }

  const V = {
    // ── Routes ──────────────────────────────────────────────────────────
    go:    prim('vertical', { depth: 18 }),
    seam:  prim('vertical', { depth: 18, release: 'inside', releaseWidth: 0.8 }),
    drag:  prim('cross', { depth: 2.5, across: 14, dir: 'in' }),
    cross: prim('cross', { depth: 8, across: 22, dir: 'in' }),
    stick: prim('settle', { depth: 6, back: 0.6, width: 0.7, dir: 'in' }, { end: 'settle' }),
    sit:   prim('settle', { depth: 6, back: 0.6, width: 0.7, dir: 'in' }, { end: 'settle' }),
    curl:  prim('settle', { depth: 12, back: 1.5, width: 1.3, dir: 'in', radius: 0.9 }, { end: 'settle' }),
    flat:  prim('flat', { depth: 2, width: 7, dir: 'out' }),
    dig:   prim('horizontal', { depth: 14, length: 10, dir: 'in' }),
    in:    prim('horizontal', { depth: 10, length: 8, dir: 'in' }),
    out:   prim('horizontal', { depth: 10, length: 6, dir: 'out' }),
    quick_out: prim('horizontal', { depth: 5, length: 5, dir: 'out' }),
    quick_in:  prim('horizontal', { depth: 5, length: 5, dir: 'in' }),
    slant: prim('angle', { stem: 1.5, angle: 55, length: 8, dir: 'in' }),
    post:  prim('angle', { stem: 11, angle: 40, length: 10, dir: 'in' }),
    skinny_post: prim('angle', { stem: 10, angle: 20, length: 10, dir: 'in' }),
    glance: prim('angle', { stem: 5, angle: 22, length: 9, dir: 'in' }),     // RPO skinny post behind the conflict LB
    corner: prim('angle', { stem: 11, angle: 45, length: 8, dir: 'out' }),
    fade:  prim('vertical', { depth: 18, release: 'outside', releaseWidth: 1.5 }),
    hitch: prim('settle', { depth: 5, back: 0.8, width: 0.4, dir: 'in' }, { end: 'settle' }),
    comeback: prim('angle', { stem: 13, angle: 150, length: 2.5, dir: 'out' }),
    spot:  prim('settle', { depth: 5, back: 0.4, width: 1.8, dir: 'in' }, { end: 'settle' }),
    arrow: prim('angle', { stem: 0, angle: 65, length: 7, dir: 'out' }),
    swing: prim('swing', { width: 6, depth: 0.5 }),
    bubble: prim('swing', { width: 4.5, depth: -0.3, dip: 1.2 }),
    wheel: {
      // Out, then up the sideline outside #1. Always toward the player's own sideline.
      status: 'validated',
      expand(spec, player) {
        const o = player.at[0] >= 0 ? 1 : -1;
        return [Object.assign({ type: 'path', points: [[3.5 * o, 1.5], [8.5 * o, 6], [9.5 * o, 16]] }, params(spec, {}))];
      },
    },
    double_move: prim('doubleMove', {}),

    // ── Protection ──────────────────────────────────────────────────────
    pass_set: {
      status: 'validated',
      expand: (spec, player) => [Object.assign({ type: 'block', to: passSetVector(player) }, params(spec, {}))],
    },

    // Check protection, then release. `release` is any route spec.
    pass_set_then_release: {
      status: 'validated',
      expand(spec, player) {
        const inward = player.at[0] > 0.01 ? -1 : 1;
        const check = { type: 'block', to: spec.check || [inward * 0.8, 1.0], end: 'none' };
        const rel = Object.assign({ type: 'flat' }, spec.release || {});
        if (typeof rel.delay !== 'number') rel.delay = typeof spec.delay === 'number' ? spec.delay : 0.45;
        return [check].concat(FD.Vocabulary.expand(rel, player));
      },
    },

    // Hold, then run the route (no visible check step).
    delayed_release: {
      status: 'validated',
      expand(spec, player) {
        const rel = Object.assign({ type: 'flat' }, spec.release || {});
        const steps = FD.Vocabulary.expand(rel, player);
        steps[0].timing = Object.assign({ delay: typeof spec.delay === 'number' ? spec.delay : 0.7 }, steps[0].timing);
        return steps;
      },
    },

    qb_drop: prim('qbDrop', { drop: 2 }),

    // ── Run game ────────────────────────────────────────────────────────
    // Blocks point at the defender's spot; T-bar = contact. `dir: 'play'` /
    // `'back'` resolve against the play's `side`. Absolute landmarks (`at`,
    // `target`, `through`) are ball-relative data coordinates.
    zone_step: prim('step', { lateral: 0.8, up: 1.0, dir: 'play' }),   // inside zone: play-side step, knee-to-knee
    reach:     prim('step', { lateral: 1.2, up: 0.7, dir: 'play' }),   // outside zone: lateral, overtake the play-side shoulder
    scoop:     prim('step', { lateral: 1.3, up: 0.8, dir: 'play' }),   // backside cut-off
    down:      prim('step', { lateral: 1.1, up: 0.9, dir: 'back' }),   // gap scheme: block inside, build the wall
    back:      prim('step', { lateral: 1.1, up: 0.7, dir: 'back' }),   // center fills for the pulling guard
    hinge:     prim('step', { lateral: 0.7, up: -0.9, dir: 'back' }),  // backside tackle when the guard pulls
    base:      prim('step', { lateral: 0, up: 1.1 }),
    stalk:     prim('step', { lateral: 0, up: 3 }),                    // receiver blocks the man over him
    combo: {
      // Double-team at `target`; the climber (`climb`: LB landmark) comes off to the second level.
      status: 'validated',
      expand(spec) {
        const steps = [{ type: 'doubleTeam', target: spec.target || [0, 1], end: spec.climb ? 'none' : 'tbar' }];
        if (spec.climb) steps.push({ type: 'lead', at: spec.climb, timing: { delay: spec.delay !== undefined ? spec.delay : 0.15 } });
        return steps;
      },
    },
    climb:     prim('lead', { at: [0, 4.5] }),
    pull:      prim('pull', { dip: -1.4 }),                            // `at` = block point, optional `hole` = turn-up x
    kickout:   prim('pull', { dip: -1.3 }),                            // pull + bend out onto the end man
    wrap:      prim('pull', { dip: -1.9 }),                            // second puller: deeper, turns up through `hole`
    lead:      prim('lead', {}),                                       // back / H-back to a point, block
    screen_release: {
      // Sell pass protection, then release to a convoy spot `at`.
      status: 'validated',
      expand(spec, player) {
        return [
          Object.assign({ type: 'block', to: passSetVector(player), end: 'none' }),
          { type: 'lead', at: spec.at, via: spec.via, timing: { delay: spec.delay !== undefined ? spec.delay : 0.9 } },
        ];
      },
    },
    carry:        prim('run', {}),
    jet_motion:   prim('motion', {}, { timing: { phase: 'motion', delay: -0.55, duration: 1.05 } }), // at full speed at the snap
    fake:         prim('run', {}, { style: 'dashed' }),               // play-action / misdirection fake, no ball
    crack:        prim('lead', {}),                                   // receiver blocks back inside                                     // ball carrier: `through` landmarks
    counter_step: prim('run', {}, { end: 'none' }),                    // jab away from the play before the carry
    handoff:      prim('qbPath', {}),                                  // QB to the mesh point (+ carry-out fake)
    runner_path:  prim('run', {}),
    // The ball's exchange is a two-player event: see play.handoff (resolve.js).
  };

  const ALIASES = { shallow: 'drag', hook: 'sit', stop: 'hitch', whip: 'quick_out', speed_out: 'quick_out', vertical: 'go', streak: 'go', flag: 'corner' };
  for (const [a, canon] of Object.entries(ALIASES)) if (!V[a]) V[a] = V[canon];

  const Vocabulary = {
    table: V,
    aliases: ALIASES,
    has: (name) => Object.prototype.hasOwnProperty.call(V, name) || FD.Primitives.has(name),

    /**
     * Expand a canonical spec (or raw primitive spec) for `player`
     * (a resolved formation player: { id, role, at }). Returns primitive specs.
     */
    expand(spec, player) {
      const entry = V[spec.type];
      if (entry) return entry.expand(spec, player);
      if (FD.Primitives.has(spec.type)) return [Object.assign({ type: spec.type }, params(spec, {}))]; // raw primitive passthrough
      throw new Error(`Unknown assignment "${spec.type}"`);
    },

    /**
     * Family defaults fill in players the play doesn't mention.
     * Pass families protect with the OL and drop the QB; runs are explicit.
     */
    families: {
      dropback_pass: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 2 } },
      quick_pass: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 1 } },
      screen: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 3 } },
      run: {},                                  // every run assignment is explicit
      play_action: {},                          // run-action blocking is explicit
      rpo: {},                                  // run blocking + a throw: explicit
      defense: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 2 } }, // defense-first: offense shows a dropback
    },
  };

  FD.Vocabulary = Vocabulary;
})(window.FD);

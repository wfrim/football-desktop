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
 * Status:
 *   validated   routes + pass protection + pass_set_then_release + qb_drop
 *   provisional run / blocking entries — mapped so the vocabulary is complete,
 *               but not exercised until the run-game handoff.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  // Canonical keys a spec may carry that are *not* geometry parameters.
  const META = new Set(['type', 'player', 'delay', 'timing', 'end', 'style', 'check', '_note']);

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

    // ── Run game (provisional) ──────────────────────────────────────────
    zone_step: provisional(prim('block', { to: [0.9, 0.6] })),
    reach:     provisional(prim('block', { to: [1.1, 0.8] })),
    down:      provisional(prim('block', { to: [-1.1, 0.8] })),
    climb:     provisional(prim('lead', { to: [0.5, 4] })),
    combo: provisional({
      // Double-team at `target`, then one player climbs to `climb`.
      expand(spec) {
        const steps = [{ type: 'doubleTeam', target: spec.target || [0, 1], end: spec.climb ? 'none' : 'tbar' }];
        if (spec.climb) steps.push({ type: 'lead', to: spec.climb, timing: { delay: 0.1 } });
        return steps;
      },
    }),
    pull:      provisional(prim('pull', { dir: 'right', run: 4, depth: 1.5 })),
    wrap:      provisional(prim('pull', { dir: 'right', run: 2.5, dip: 0.6, depth: 2.5 })),
    kickout:   provisional(prim('kickOut', { to: [5, 0.5] })),
    lead:      provisional(prim('lead', { to: [3, 2] })),
    release:   provisional(prim('lead', { to: [3, 4] })),
    runner_path: provisional(prim('path', { points: [[2, 4]] })),
    // `handoff` is a two-player event, not a single-player path: see play.ball / play.events.
  };

  const Vocabulary = {
    table: V,
    has: (name) => Object.prototype.hasOwnProperty.call(V, name) || FD.Primitives.has(name),

    /**
     * Expand a canonical spec (or raw primitive spec) for `player`
     * (a resolved formation player: { id, role, at }). Returns primitive specs.
     */
    expand(spec, player) {
      const entry = V[spec.type];
      if (entry) return entry.expand(spec, player);
      if (FD.Primitives.has(spec.type)) return [Object.assign({}, spec)]; // raw primitive passthrough
      throw new Error(`Unknown assignment "${spec.type}"`);
    },

    /**
     * Family defaults fill in players the play doesn't mention.
     * PROVISIONAL: pass families protect with the OL and drop the QB.
     */
    families: {
      dropback_pass: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 2 } },
      quick_pass: { ol: { type: 'pass_set' }, qb: { type: 'qb_drop', drop: 1 } },
    },
  };

  FD.Vocabulary = Vocabulary;
})(window.FD);

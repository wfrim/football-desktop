/*
 * primitives.js — semantic assignment → waypoints.
 *
 * A primitive is a small pure function that turns parameters like
 * { depth: 6, dir: 'in', across: 22 } into waypoints RELATIVE to the player's
 * snap position, in FIELD space (yards; +x = offense right, +y = downfield).
 * The renderer handles everything else (absolute placement, SVG, fillets,
 * arrowheads, timing).
 *
 * Adding a new play should never require touching this file. Adding a new
 * *kind of movement* the vocabulary can't express should mean adding one
 * entry here — never a per-play function.
 *
 * PROVISIONAL parameter conventions (see docs/DATA_CONTRACT_NOTES.md):
 *   depth      yards past the LOS (absolute). "6-yard mesh" means y = 6.
 *   stem, length, width, across, drop   yards, relative to the player.
 *   dir        'in' | 'out' | 'left' | 'right'   ('in' = toward the ball)
 *   to         [dx, dy] relative vector
 *   points     [[dx, dy], ...] relative waypoints (escape hatch)
 *   through    [[x, y], ...] ABSOLUTE landmarks (ball-relative, data space)
 *   at         [x, y] ABSOLUTE end landmark (block point, LB, kick-out spot)
 *   dir 'play' / 'back' resolve against the play's `side` (run game).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const registry = new Map();
  const rad = (deg) => (deg * Math.PI) / 180;

  function dirSign(dir, ctx, fallback) {
    if (typeof dir === 'number') return Math.sign(dir) || 1;
    switch (dir) {
      case 'in': return ctx.inward;
      case 'out': return ctx.outward;
      case 'left': return -ctx.lateral;
      case 'right': return ctx.lateral;
      case 'play': return ctx.playside;       // toward the play's point of attack
      case 'back': return -ctx.playside;      // toward the backside
      default: return fallback !== undefined ? fallback : ctx.inward;
    }
  }

  const Primitives = {
    /**
     * register(name, { kind, end, style, radius, build(params, ctx) → points })
     *   kind    route | run | block | pull | lead | qb | motion  (drives timing + styling)
     *   end     arrow | tbar | dot | none
     *   style   solid | dashed | dotted
     *   radius  corner rounding in yards
     */
    register(name, def) {
      registry.set(name, def);
    },

    has: (name) => registry.has(name),
    names: () => Array.from(registry.keys()),
    kindOf: (name) => (registry.get(name) || {}).kind,

    /** Build one assignment. ctx comes from the renderer (see playRenderer.js). */
    build(spec, ctx) {
      const def = registry.get(spec.type);
      if (!def) throw new Error(`Unknown primitive "${spec.type}"`);
      const params = spec.params || spec;
      const points = def.build(params, ctx);
      return {
        points,
        kind: def.kind,
        end: spec.end || def.end || 'arrow',
        style: spec.style || def.style || 'solid',
        radius: typeof spec.radius === 'number' ? spec.radius : def.radius !== undefined ? def.radius : 0.9,
      };
    },
  };

  // ── PASS ROUTES ───────────────────────────────────────────────────────────

  // Straight vertical stem, optionally with an inside/outside release.
  Primitives.register('vertical', {
    kind: 'route', end: 'arrow', radius: 2.4,
    build(p, ctx) {
      const w = p.release ? dirSign(p.release === 'inside' ? 'in' : 'out', ctx) * ctx.u(p.releaseWidth || 1.2) : 0;
      const top = ctx.dy(p.depth !== undefined ? p.depth : 16);
      return w ? [[0, 0], [w, Math.min(2.6, top / 3)], [w, top]] : [[0, 0], [0, top]];
    },
  });

  // Stem, then break at `angle` degrees from straight upfield (45 ≈ corner/post,
  // 90 = flat break, >90 breaks back toward the LOS).
  Primitives.register('angle', {
    kind: 'route', end: 'arrow', radius: 0.8,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.outward);
      const stemY = ctx.dy(p.stem !== undefined ? p.stem : 10);
      const a = rad(p.angle !== undefined ? p.angle : 45);
      const L = ctx.u(p.length !== undefined ? p.length : 6);
      return [[0, 0], [0, stemY], [s * L * Math.sin(a), stemY + L * Math.cos(a)]];
    },
  });

  // Horizontal break at a given depth (out / in / dig shapes).
  Primitives.register('horizontal', {
    kind: 'route', end: 'arrow', radius: 0.7,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.inward);
      const stemY = ctx.dy(p.depth !== undefined ? p.depth : 6);
      return [[0, 0], [0, stemY], [s * ctx.u(p.length !== undefined ? p.length : 8), stemY]];
    },
  });

  // Release to depth, then run across the formation (shallow / drag / mesh).
  Primitives.register('cross', {
    kind: 'route', end: 'arrow', radius: 1.6,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.inward);
      const y = ctx.dy(p.depth !== undefined ? p.depth : 6);
      const rise = ctx.u(p.rise || 0);
      const rel = ctx.u(p.release !== undefined ? p.release : 1);
      return [[0, 0], [s * rel, y], [s * ctx.u(p.across !== undefined ? p.across : 20), y + rise]];
    },
  });

  // Push to depth, then settle back (sit / hook / curl).
  Primitives.register('settle', {
    kind: 'route', end: 'arrow', radius: 0.5,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.inward);
      const y = ctx.dy(p.depth !== undefined ? p.depth : 10);
      return [[0, 0], [0, y], [s * ctx.u(p.width !== undefined ? p.width : 0.8), y - ctx.u(p.back !== undefined ? p.back : 1)]];
    },
  });

  // Curved release from the backfield to the flat (swing / arc).
  Primitives.register('swing', {
    kind: 'route', end: 'arrow', radius: 3,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.outward);
      const w = ctx.u(p.width !== undefined ? p.width : 5);
      const y = ctx.dy(p.depth !== undefined ? p.depth : 1);
      return [[0, 0], [s * w * 0.5, -ctx.u(p.dip !== undefined ? p.dip : 0.8)], [s * w, y]];
    },
  });

  // Stem, a short fake break, then a second break (out-and-up, stick-nod…).
  Primitives.register('doubleMove', {
    kind: 'route', end: 'arrow', radius: 0.6,
    build(p, ctx) {
      const fake = p.fake || {};
      const then = p.then || {};
      const fs = dirSign(fake.dir, ctx, ctx.outward);
      const ts = dirSign(then.dir, ctx, fs);
      const y = ctx.dy(p.stem !== undefined ? p.stem : 6);
      const fl = ctx.u(fake.length !== undefined ? fake.length : 1.5);
      const fa = rad(fake.angle !== undefined ? fake.angle : 90);
      const f = [fs * fl * Math.sin(fa), y + fl * Math.cos(fa)];
      const ta = rad(then.angle !== undefined ? then.angle : 0);
      const tl = ctx.u(then.length !== undefined ? then.length : 10);
      return [[0, 0], [0, y], f, [f[0] + ts * tl * Math.sin(ta), f[1] + tl * Math.cos(ta)]];
    },
  });

  // Short release, then flatten toward the sideline (flat / arrow). Works
  // from a slot (short release) or the backfield (steeper climb to depth).
  Primitives.register('flat', {
    kind: 'route', end: 'arrow', radius: 1.6,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.outward);
      const y = ctx.dy(p.depth !== undefined ? p.depth : 2);
      const w = ctx.u(p.width !== undefined ? p.width : 7);
      // From the backfield, bow outside first so the path clears the tackle box.
      if (ctx.origin[1] < -2) return [[0, 0], [s * w * 0.45, y * 0.35], [s * w, y]];
      const rel = ctx.u(p.release !== undefined ? p.release : 1.2);
      return [[0, 0], [s * rel, y * 0.6], [s * w, y]];
    },
  });

  // Escape hatch: explicit relative waypoints.
  function waypoints(p, ctx) {
    if (p.through) return [[0, 0]].concat(p.through.map((q) => ctx.abs(q)));
    return [[0, 0]].concat((p.points || []).map((q) => ctx.v(q)));
  }

  Primitives.register('path', {
    kind: 'route', end: 'arrow', radius: 0.9,
    build: waypoints,
  });

  // ── RUN / BLOCKING ────────────────────────────────────────────────────────

  // Short block toward a relative vector, ending in a T-bar.
  Primitives.register('block', {
    kind: 'block', end: 'tbar', radius: 0,
    build(p, ctx) {
      return [[0, 0], p.at ? ctx.abs(p.at) : ctx.v(p.to || [0, 1])];
    },
  });

  // Directional block step: `lateral` yards toward `dir`, `up` yards upfield
  // (negative = retreat). zone step, reach, down, hinge, scoop, base, stalk.
  Primitives.register('step', {
    kind: 'block', end: 'tbar', radius: 0,
    build(p, ctx) {
      const s = dirSign(p.dir, ctx, ctx.playside);
      return [[0, 0], [s * ctx.u(p.lateral || 0), ctx.u(p.up !== undefined ? p.up : 1)]];
    },
  });

  // Two blockers sharing a defender: each gets a `doubleTeam` step whose
  // `target` is the same ABSOLUTE point.
  Primitives.register('doubleTeam', {
    kind: 'block', end: 'tbar', radius: 0,
    build(p, ctx) {
      return [[0, 0], p.target ? ctx.abs(p.target) : ctx.v(p.to || [0, 1])];
    },
  });

  /*
   * Pulling lineman. Opens, runs flat behind the line at `dip` (absolute
   * depth, e.g. -1.4), then either
   *   hole: x   turns up through that lateral landmark to `at` (wrap / lead)
   *   (none)    bends to `at` from the inside (kick-out)
   */
  Primitives.register('pull', {
    kind: 'pull', end: 'tbar', radius: 0.8,
    build(p, ctx) {
      const at = ctx.abs(p.at || [4, 1]);
      const s = Math.sign(at[0]) || ctx.playside;
      const dip = ctx.dy(p.dip !== undefined ? p.dip : -1.4);
      const pts = [[0, 0], [s * 0.55, dip]];
      if (p.hole !== undefined) {
        const hx = ctx.abs([p.hole, 0])[0];
        pts.push([hx, dip], [hx, ctx.dy(0.4)]);
      } else {
        pts.push([at[0] - s * ctx.u(p.turn !== undefined ? p.turn : 1.3), dip]);
      }
      pts.push(at);
      return pts;
    },
  });

  // Lead / kick-out / climb: path to a point (via optional), ending in a block.
  const toPoint = {
    kind: 'lead', end: 'tbar', radius: 1.2,
    build(p, ctx) {
      const pts = [[0, 0]];
      if (p.through) pts.push(...p.through.map((q) => ctx.abs(q)));
      if (p.via) pts.push(p.at ? ctx.abs(p.via) : ctx.v(p.via));
      pts.push(p.at ? ctx.abs(p.at) : ctx.v(p.to || [0, 3]));
      return pts;
    },
  };
  Primitives.register('lead', toPoint);
  Primitives.register('kickOut', toPoint);

  // Ball carrier's track through absolute landmarks (mesh, aiming point, cut).
  Primitives.register('run', {
    kind: 'run', end: 'arrow', radius: 1.4,
    build: waypoints,
  });

  // ── QUARTERBACK / MOTION ──────────────────────────────────────────────────

  Primitives.register('qbDrop', {
    kind: 'qb', end: 'none', style: 'dashed', radius: 0,
    build(p, ctx) {
      return [[0, 0], [ctx.u(p.lateral || 0), -ctx.u(p.drop !== undefined ? p.drop : 2)]];
    },
  });

  // Handoff / fake / boot tracks. `through` = absolute landmarks.
  Primitives.register('qbPath', {
    kind: 'qb', end: 'none', style: 'dashed', radius: 1,
    build: waypoints,
  });

  // Pre-snap motion. The player's marker physically relocates (in every mode)
  // and later assignments start from the motion's end point.
  Primitives.register('motion', {
    kind: 'motion', end: 'none', style: 'dotted', radius: 1.2,
    build(p, ctx) {
      if (p.through) return waypoints(p, ctx);
      if (p.points) return [[0, 0]].concat(p.points.map((q) => ctx.v(q)));
      return [[0, 0], ctx.v(p.to || [4, 0])];
    },
  });

  FD.Primitives = Primitives;
})(window.FD);

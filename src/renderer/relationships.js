/*
 * relationships.js — relationships between assignments are first-class data.
 *
 * A relationship names a football concept (mesh, high_low, clear, lanes…),
 * but the renderer only understands a small set of GENERIC constraints:
 *
 *   separation  two paths never come closer than N yards        (validation)
 *   lanes       paths stay in left→right order, ≥ N yards apart (validation)
 *   levels      paths end at distinct depths, deep → shallow     (validation)
 *   clears      A must be past B's break depth before B breaks   (TIMING: delays B)
 *   converge    blockers' first steps end within N yards (double team)  (validation)
 *   follows     B reaches the LOS ≥ N s after A does (runner behind puller) (TIMING: delays B)
 *   order       B's assignment starts ≥ N s after A's (second puller)   (TIMING: delays B)
 *
 * Every participant also gets concept emphasis (full-strength stroke), so the
 * concept reads first and supporting routes recede.
 *
 * New football relationships are a new row in TYPES, built from these
 * constraints. No concept gets its own drawing code.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const G = FD.Geometry;

  // ── Relationship types → constraint lists ────────────────────────────
  const TYPES = {
    mesh:     (r) => [['separation', ids(r), r.separation !== undefined ? r.separation : 1]],
    lanes:    (r) => [['lanes', ids(r), r.minGap || 3]],
    levels:   (r) => [['levels', ids(r), r.minGap || 2]],
    high_low: (r) => [['levels', [r.high, r.low], r.minGap || 3]],
    clear:    (r) => [['clears', [r.clear, r.into], r.margin !== undefined ? r.margin : 2]],
    // Run game.
    combo:    (r) => [['converge', ids(r), r.within || 1.2]],
    // Gap-scheme pull: `puller` (+ optional `wrap`, the second puller) leads `runner`.
    pull:     (r) => [['follows', [r.puller, r.runner], r.margin !== undefined ? r.margin : 0.15]]
      .concat(r.wrap ? [['order', [r.puller, r.wrap], 0.12], ['follows', [r.wrap, r.runner], 0.05]] : []),
    kickout:  (r) => [['follows', [r.blocker, r.runner], r.margin !== undefined ? r.margin : 0.15]],
    // Screen: `blockers` form up before the `runner` gets the ball. Emphasis only.
    convoy:   () => [],
    // Emphasis only: players who carry the concept without a geometric rule (sift, crack, lead).
    feature:  () => [],
    // Zone: every participant's first step goes play-side. Wall: down blocks go back-side.
    zone:     (r) => [['flow', ids(r), 'play']],
    wall:     (r) => [['flow', ids(r), 'back']],
  };

  function ids(r) {
    return r.participants || [];
  }

  function participantsOf(r) {
    const set = new Set(r.participants || []);
    for (const k of ['high', 'low', 'clear', 'into', 'puller', 'wrap', 'runner', 'blocker']) if (r[k]) set.add(r[k]);
    for (const id of r.blockers || []) set.add(id);
    return Array.from(set);
  }

  // ── Geometry / timing helpers (field space: +y downfield) ─────────────
  function routeOf(scene, id) {
    const pl = scene.players.get(id);
    if (!pl) return null;
    const routes = pl.assignments.filter((a) => a.kind === 'route' || a.kind === 'run');
    return routes[routes.length - 1] || pl.assignments[pl.assignments.length - 1] || null;
  }

  function fieldPolyline(a) {
    return a.measure.points.map((p) => [p[0] - a.ballX, -p[1]]);
  }

  function invEase(name, y) {
    const e = FD.Ease[name] || FD.Ease.linear;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (e(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Clock time at which the drawn/travelled path reaches `fraction`. */
  function timeAt(a, fraction) {
    return a.start + a.duration * invEase(a.ease, fraction);
  }

  /** Fraction of a's length at which it first reaches `depth` (null if never). */
  function fractionAtDepth(a, depth) {
    const pts = fieldPolyline(a);
    let run = 0;
    const total = a.measure.length;
    for (let i = 1; i < pts.length; i++) {
      const seg = G.dist(pts[i - 1], pts[i]);
      if (pts[i][1] >= depth) {
        const t = seg > 0 ? (depth - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1] || 1) : 0;
        return (run + seg * Math.max(0, Math.min(1, t))) / total;
      }
      run += seg;
    }
    return null;
  }

  function breakPoint(a) {
    return a.fieldPts.length > 2 ? a.fieldPts[1] : a.fieldPts[a.fieldPts.length - 1];
  }

  function fractionAtPoint(a, p) {
    const pts = fieldPolyline(a);
    let best = 0;
    let bestD = Infinity;
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      run += G.dist(pts[i - 1], pts[i]);
      const d = G.dist(pts[i], p);
      if (d < bestD) { bestD = d; best = run; }
    }
    return best / a.measure.length;
  }

  function depthAtEnd(a) {
    return a.fieldPts[a.fieldPts.length - 1][1];
  }

  function lateralAtDepth(a, depth) {
    const f = fractionAtDepth(a, depth);
    const pts = fieldPolyline(a);
    if (f === null) return pts[pts.length - 1][0];
    return a.measure.at(f).point[0] - a.ballX;
  }

  // ── Constraints ───────────────────────────────────────────────────────
  const CONSTRAINTS = {
    separation(scene, [a, b], min, warn) {
      const ra = routeOf(scene, a);
      const rb = routeOf(scene, b);
      if (!ra || !rb) return;
      const pb = fieldPolyline(rb);
      let d = Infinity;
      for (const p of fieldPolyline(ra)) d = Math.min(d, G.distToPolyline(p, pb));
      if (d < min * 0.8) warn(`separation: ${a}/${b} come within ${d.toFixed(2)} yd (want ≈${min})`);
    },

    lanes(scene, list, minGap, warn) {
      const routes = list.map((id) => routeOf(scene, id));
      if (routes.some((r) => !r)) return;
      for (const depth of [8, 14]) {
        const xs = routes.map((r) => lateralAtDepth(r, depth));
        for (let i = 1; i < xs.length; i++) {
          if (xs[i] - xs[i - 1] < minGap) {
            warn(`lanes: ${list[i - 1]}→${list[i]} only ${(xs[i] - xs[i - 1]).toFixed(1)} yd apart at ${depth} yd`);
          }
        }
      }
    },

    levels(scene, list, minGap, warn) {
      const routes = list.map((id) => routeOf(scene, id));
      if (routes.some((r) => !r)) return;
      for (let i = 1; i < routes.length; i++) {
        const hi = depthAtEnd(routes[i - 1]);
        const lo = depthAtEnd(routes[i]);
        if (hi - lo < minGap) warn(`levels: ${list[i - 1]} (${hi.toFixed(1)} yd) not above ${list[i]} (${lo.toFixed(1)} yd)`);
      }
    },

    clears(scene, [clearer, into], margin, warn) {
      const rc = routeOf(scene, clearer);
      const ri = routeOf(scene, into);
      if (!rc || !ri) return;
      const bp = breakPoint(ri);
      const fc = fractionAtDepth(rc, bp[1] + margin);
      if (fc === null) {
        warn(`clears: ${clearer} never gets ${margin} yd past ${into}'s break depth`);
        return;
      }
      const tClear = timeAt(rc, fc);
      const tBreak = timeAt(ri, fractionAtPoint(ri, bp));
      const shift = tClear + 0.1 - tBreak;
      if (shift > 0) {
        // Delay the beneficiary (and any later steps of its sequence).
        const pl = scene.players.get(into);
        for (const a of pl.assignments) if (a.start >= ri.start) a.start += shift;
      }
    },
  };

  /** Clock time at which a's path first crosses `depth` (LOS-relative). */
  function timeAtDepth(a, depth) {
    const f = fractionAtDepth(a, depth);
    return f === null ? null : timeAt(a, f);
  }

  function shiftFrom(scene, id, from, shift) {
    const pl = scene.players.get(id);
    for (const a of pl.assignments) if (a.start >= from.start) a.start += shift;
  }

  // Blocking helpers: the first path a player draws / the one reaching the LOS.
  const firstOf = (scene, id) => (scene.players.get(id) || { assignments: [] }).assignments[0] || null;
  function lineCrossing(scene, id) {
    const pl = scene.players.get(id);
    if (!pl) return null;
    for (const a of pl.assignments) {
      if (a.fieldPts[0][1] >= 0) return { a, t: a.start };
      const t = timeAtDepth(a, 0);
      if (t !== null) return { a, t };
    }
    const last = pl.assignments[pl.assignments.length - 1];
    return last ? { a: last, t: last.start + last.duration } : null;
  }

  Object.assign(CONSTRAINTS, {
    converge(scene, list, within, warn) {
      const ends = list.map((id) => firstOf(scene, id)).filter(Boolean).map((a) => a.fieldPts[a.fieldPts.length - 1]);
      for (let i = 1; i < ends.length; i++) {
        const d = G.dist(ends[0], ends[i]);
        if (d > within) warn(`converge: ${list[0]}/${list[i]} double-team points ${d.toFixed(2)} yd apart`);
      }
    },

    follows(scene, [leader, follower], margin, warn) {
      const L = lineCrossing(scene, leader);
      const F = lineCrossing(scene, follower);
      if (!L || !F) return;
      const shift = L.t + margin - F.t;
      if (shift > 0) {
        shiftFrom(scene, follower, firstOf(scene, follower), shift); // whole backfield action
        if (shift > 0.6) warn(`follows: ${follower} delayed ${shift.toFixed(2)} s behind ${leader}`);
      }
    },

    flow(scene, list, dir, warn) {
      const want = (scene.play.side === 'left' ? -1 : 1) * (dir === 'back' ? -1 : 1);
      for (const id of list) {
        const a = firstOf(scene, id);
        if (!a) continue;
        const dx = a.fieldPts[a.fieldPts.length - 1][0] - a.fieldPts[0][0];
        if (dx * want <= 0) warn(`flow: ${id}'s first step does not go ${dir}-side`);
      }
    },

    order(scene, [first, second], gap) {
      const a = firstOf(scene, first);
      const b = firstOf(scene, second);
      if (!a || !b) return;
      const shift = a.start + gap - b.start;
      if (shift > 0) shiftFrom(scene, second, b, shift);
    },
  });

  const Relationships = {
    TYPES,
    CONSTRAINTS,
    participantsOf,
    timeAt,
    invEase,

    /** Validate, adjust timing, and apply emphasis. Returns warnings. */
    apply(scene) {
      const warnings = [];
      const concept = new Set();
      for (const r of scene.play.relationships || []) {
        const make = TYPES[r.type];
        if (!make) {
          warnings.push(`unknown relationship type "${r.type}" (drawn without constraints)`);
        } else {
          for (const [name, list, arg] of make(r)) {
            CONSTRAINTS[name](scene, list, arg, (m) => warnings.push(`${r.type}: ${m}`));
          }
        }
        participantsOf(r).forEach((id) => concept.add(id));
      }
      for (const id of concept) {
        const pl = scene.players.get(id);
        if (!pl) continue;
        for (const a of pl.assignments) if (a.kind !== 'qb') a.view.el.classList.add('is-concept');
      }
      if (concept.size) scene.root.classList.add('has-concept');
      return warnings;
    },
  };

  FD.Relationships = Relationships;
})(window.FD);

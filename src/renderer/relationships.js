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
    // Blocking relationships arrive with the run-game handoff.
    combo:    () => [],
  };

  function ids(r) {
    return r.participants || [];
  }

  function participantsOf(r) {
    const set = new Set(r.participants || []);
    for (const k of ['high', 'low', 'clear', 'into']) if (r[k]) set.add(r[k]);
    return Array.from(set);
  }

  // ── Geometry / timing helpers (field space: +y downfield) ─────────────
  function routeOf(scene, id) {
    const pl = scene.players.get(id);
    if (!pl) return null;
    const routes = pl.assignments.filter((a) => a.kind === 'route');
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
        for (const a of pl.assignments) if (a.kind === 'route') a.view.el.classList.add('is-concept');
      }
      if (concept.size) scene.root.classList.add('has-concept');
      return warnings;
    },
  };

  FD.Relationships = Relationships;
})(window.FD);

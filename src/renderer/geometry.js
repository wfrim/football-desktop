/*
 * geometry.js — pure path math. No DOM access, fully deterministic.
 *
 * A Path is { start: [x, y], segs: [ {type:'L', to}, {type:'Q', c, to} ] }
 * expressed in whatever space the caller chooses (the renderer uses SVG space).
 *
 * Everything the animation needs (length, point-at-fraction, end tangent) is
 * computed here rather than with getTotalLength/getPointAtLength, so geometry
 * is identical across browsers and testable in Node.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const G = {};
  const EPS = 1e-6;

  G.add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  G.sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  G.mul = (a, k) => [a[0] * k, a[1] * k];

  /**
   * Hand-drawn look: subdivide each segment every ~`step` yards and nudge the
   * new points sideways by up to `amp` yards (deterministic from `seed`).
   * Endpoints stay put so arrowheads and blocks still land where they should.
   */
  G.wobble = (pts, seed, amp, step) => {
    const A = amp === undefined ? 0.14 : amp;
    const S = step || 2.2;
    let h = 2166136261 >>> 0;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1; };
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(d / S));
      const nx = d ? -(b[1] - a[1]) / d : 0;
      const ny = d ? (b[0] - a[0]) / d : 0;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const w = A * rnd() * Math.sin(Math.PI * t);
        out.push([a[0] + (b[0] - a[0]) * t + nx * w, a[1] + (b[1] - a[1]) * t + ny * w]);
      }
      out.push(b);
    }
    return out;
  };
  G.len = (a) => Math.hypot(a[0], a[1]);
  G.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  G.lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  G.perp = (a) => [-a[1], a[0]];
  G.norm = (a) => {
    const l = Math.hypot(a[0], a[1]);
    return l > EPS ? [a[0] / l, a[1] / l] : [0, 0];
  };

  /**
   * Build a path through waypoints, rounding each interior corner with a
   * quadratic fillet of up to `radius`. Fillets never consume more than half
   * of an adjacent leg, so short legs stay intact.
   */
  G.fromPoints = function (points, radius) {
    const pts = points.filter((p, i) => i === 0 || G.dist(p, points[i - 1]) > EPS);
    const path = { start: pts[0], segs: [] };
    if (pts.length < 2) return path;

    let cur = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const c = pts[i];
      const next = pts[i + 1];
      const din = G.norm(G.sub(c, prev));
      const dout = G.norm(G.sub(next, c));
      const cross = din[0] * dout[1] - din[1] * dout[0];
      const dot = din[0] * dout[0] + din[1] * dout[1];
      const r = Math.min(radius || 0, G.dist(prev, c) / 2, G.dist(c, next) / 2);
      const straight = Math.abs(cross) < 1e-3 && dot > 0;
      if (r < 1e-3 || straight) {
        path.segs.push({ type: 'L', to: c });
        cur = c;
        continue;
      }
      const a = G.sub(c, G.mul(din, r));
      const b = G.add(c, G.mul(dout, r));
      if (G.dist(cur, a) > EPS) path.segs.push({ type: 'L', to: a });
      path.segs.push({ type: 'Q', c: c, to: b });
      cur = b;
    }
    const last = pts[pts.length - 1];
    if (G.dist(cur, last) > EPS) path.segs.push({ type: 'L', to: last });
    return path;
  };

  G.map = function (path, fn) {
    return {
      start: fn(path.start),
      segs: path.segs.map((s) =>
        s.type === 'Q' ? { type: 'Q', c: fn(s.c), to: fn(s.to) } : { type: 'L', to: fn(s.to) }
      ),
    };
  };

  G.endPoint = (path) => (path.segs.length ? path.segs[path.segs.length - 1].to : path.start);

  function segStart(path, i) {
    return i === 0 ? path.start : path.segs[i - 1].to;
  }

  G.endTangent = function (path) {
    const n = path.segs.length;
    if (!n) return [0, -1];
    const s = path.segs[n - 1];
    if (s.type === 'Q') {
      const t = G.norm(G.sub(s.to, s.c));
      if (t[0] || t[1]) return t;
    }
    return G.norm(G.sub(s.to, segStart(path, n - 1)));
  };

  G.startTangent = function (path) {
    if (!path.segs.length) return [0, -1];
    const s = path.segs[0];
    return G.norm(G.sub(s.type === 'Q' ? s.c : s.to, path.start));
  };

  /** Pull the final endpoint back along its tangent (room for an arrowhead). */
  G.trimEnd = function (path, d) {
    const n = path.segs.length;
    if (!n || !d) return path;
    const segs = path.segs.slice();
    const s = segs[n - 1];
    const from = s.type === 'Q' ? s.c : segStart(path, n - 1);
    if (G.dist(from, s.to) < d * 1.5) return path;
    const t = G.endTangent(path);
    const to = G.sub(s.to, G.mul(t, d));
    segs[n - 1] = s.type === 'Q' ? { type: 'Q', c: s.c, to } : { type: 'L', to };
    return { start: path.start, segs };
  };

  G.sample = function (path, qSteps) {
    const steps = qSteps || 24;
    const out = [path.start];
    let p0 = path.start;
    for (const s of path.segs) {
      if (s.type === 'Q') {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          out.push([
            u * u * p0[0] + 2 * u * t * s.c[0] + t * t * s.to[0],
            u * u * p0[1] + 2 * u * t * s.c[1] + t * t * s.to[1],
          ]);
        }
      } else {
        out.push(s.to);
      }
      p0 = s.to;
    }
    return out;
  };

  /**
   * Measure a path once; returns { length, points, at(fraction) }.
   * at() returns { point, tangent } at a fraction of arc length.
   */
  G.measure = function (path) {
    const pts = G.sample(path);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + G.dist(pts[i - 1], pts[i]));
    const length = cum[cum.length - 1];

    function at(fraction) {
      if (pts.length < 2 || length < EPS) return { point: pts[0], tangent: [0, -1] };
      const target = Math.max(0, Math.min(1, fraction)) * length;
      let lo = 1;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const segLen = cum[lo] - cum[lo - 1] || 1;
      const t = (target - cum[lo - 1]) / segLen;
      return {
        point: G.lerp(pts[lo - 1], pts[lo], t),
        tangent: G.norm(G.sub(pts[lo], pts[lo - 1])),
      };
    }

    return { length, points: pts, at };
  };

  G.toD = function (path) {
    const f = FD.svg ? FD.svg.f : (n) => Math.round(n * 1000) / 1000;
    let d = `M${f(path.start[0])} ${f(path.start[1])}`;
    for (const s of path.segs) {
      d += s.type === 'Q'
        ? `Q${f(s.c[0])} ${f(s.c[1])} ${f(s.to[0])} ${f(s.to[1])}`
        : `L${f(s.to[0])} ${f(s.to[1])}`;
    }
    return d;
  };

  /** Shortest distance from point p to a sampled polyline. */
  G.distToPolyline = function (p, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const ab = G.sub(pts[i], a);
      const l2 = ab[0] * ab[0] + ab[1] * ab[1];
      const t = l2 > EPS ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
      best = Math.min(best, G.dist(p, G.add(a, G.mul(ab, t))));
    }
    return best;
  };

  FD.Geometry = G;
})(window.FD);

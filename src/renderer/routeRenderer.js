/*
 * routeRenderer.js — turns one SVG-space path into a "drawable" with a single
 * control: setProgress(p ∈ [0, 1]).
 *
 *  solid         stroke-dashoffset reveal on the path itself
 *  dashed/dotted the dash pattern itself is written up to the revealed length,
 *                then one long gap (no SVG masks: masks are re-rasterised every
 *                frame and were the wallpaper's biggest GPU cost)
 *  end caps      arrowhead / T-bar / dot, faded in as the stroke arrives
 *
 * When p reaches 1 the dash styling is removed so the resting diagram is a
 * plain, perfectly crisp stroke.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el, f, id } = FD.svg;
  const G = FD.Geometry;

  const HEAD = { length: 0.64, width: 0.5, notch: 0.8, trim: 0.34 };
  const TBAR = 0.95;
  // Must match .a.is-dashed / .a.is-dotted in styles/play.css (yards).
  const PATTERN = { dashed: [0.34, 0.3], dotted: [0.02, 0.36] };

  /** Dash array that shows the pattern for the first `R` yards only. */
  function partialPattern(pat, R, L) {
    const [d, g] = pat;
    const out = [];
    let run = 0;
    while (run + d + g <= R) { out.push(d, g); run += d + g; }
    const rem = R - run;
    out.push(Math.max(0, Math.min(d, rem)), L + 1);
    return out.map(f).join(' ');
  }

  function arrowPoints(tip, t) {
    const n = G.perp(t);
    const back = G.sub(tip, G.mul(t, HEAD.length));
    const a = G.add(back, G.mul(n, HEAD.width / 2));
    const b = G.sub(back, G.mul(n, HEAD.width / 2));
    const notch = G.sub(tip, G.mul(t, HEAD.length * HEAD.notch));
    return [tip, a, notch, b].map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  }

  const RouteRenderer = {
    HEAD,

    /**
     * o: { parent, defs, path, kind, style, end, cls, primary }
     * Returns { el, length, measure, setProgress(p), destroy() }.
     */
    create(o) {
      const style = o.style || 'solid';
      const end = o.end || 'none';
      const g = el('g', { class: `a-wrap a-wrap-${o.kind}${o.primary ? ' is-primary' : ''}` }, o.parent);

      const drawPath = end === 'arrow' ? G.trimEnd(o.path, HEAD.trim)
        : end === 'settle' ? G.trimEnd(o.path, 0.36) : o.path;
      const d = G.toD(drawPath);
      const line = el('path', { d, class: o.cls || `a a-${o.kind}` }, g);
      const measure = G.measure(drawPath);
      const L = Math.max(measure.length, 0.001);

      const pattern = PATTERN[style] || null;
      if (pattern) line.classList.add(`is-${style}`);

      let cap = null;
      if (end !== 'none') {
        const tip = G.endPoint(o.path);
        const t = G.endTangent(o.path);
        if (end === 'arrow') {
          cap = el('polygon', { points: arrowPoints(tip, t), class: 'a-head' }, g);
        } else if (end === 'tbar') {
          const n = G.mul(G.perp(t), TBAR / 2);
          cap = el('line', {
            x1: f(tip[0] + n[0]), y1: f(tip[1] + n[1]), x2: f(tip[0] - n[0]), y2: f(tip[1] - n[1]),
            class: `a-tbar a-tbar-${o.kind}`,
          }, g);
        } else if (end === 'settle') {
          // A route that stops and sits in space: an open ring at the spot.
          cap = el('circle', { cx: f(tip[0]), cy: f(tip[1]), r: 0.36, class: 'a-settle' }, g);
        } else if (end === 'dot') {
          cap = el('circle', { cx: f(tip[0]), cy: f(tip[1]), r: 0.17, class: 'a-dot' }, g);
        }
        cap.setAttribute('opacity', 0);
      }

      let dashed = false;
      let last = -1;
      function setDash(on) {
        if (on === dashed) return;
        dashed = on;
        if (!on) line.style.strokeDasharray = '';
        if (!on) line.style.strokeDashoffset = '';
      }

      function setProgress(p) {
        if (p === last) return;
        last = p;
        if (p >= 1) {
          setDash(false); // resting state: CSS pattern (dashed) or plain stroke (solid)
        } else if (pattern) {
          dashed = true;
          line.style.strokeDasharray = partialPattern(pattern, L * p, L);
        } else {
          if (!dashed) { dashed = true; line.style.strokeDasharray = `${f(L)} ${f(L + 1)}`; }
          line.style.strokeDashoffset = f(L * (1 - p));
        }
        if (cap) {
          const a = Math.max(0, Math.min(1, (p - 0.92) / 0.08));
          cap.setAttribute('opacity', f(a));
        }
      }

      setProgress(0);

      return {
        el: g,
        length: L,
        measure,
        setProgress,
        destroy() {
          g.remove();
        },
      };
    },
  };

  FD.RouteRenderer = RouteRenderer;
})(window.FD);

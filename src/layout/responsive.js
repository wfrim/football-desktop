/*
 * responsive.js — fits the yard-based SVG world to the current window.
 *
 * On resize we only rewrite the viewBox and a handful of stroke-width custom
 * properties. No geometry is rebuilt; the field and the play stay untouched.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  // Screen-space insets (fractions of the viewport) reserved for typography.
  // The play frame is fitted inside what remains.
  const INSETS = {
    landscape: { top: 0.2, bottom: 0.13, left: 0.05, right: 0.05 },
    portrait: { top: 0.2, bottom: 0.17, left: 0.04, right: 0.04 },
  };

  // Intended stroke widths in CSS pixels at a "reference" scale of ~22px/yd.
  // They grow gently on large displays and never drop below the reference.
  const STROKES_PX = {
    field: 1,
    los: 1,
    route: 1.7,
    block: 1.25,
    marker: 1.35,
    ball: 1.2,
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const Responsive = {
    INSETS,
    STROKES_PX,

    /** Fit `frame` (SVG-space yards) into the viewport; returns px-per-yard. */
    apply(svg, frame) {
      const W = Math.max(1, window.innerWidth);
      const H = Math.max(1, window.innerHeight);
      const ins = W / H < 1.15 ? INSETS.portrait : INSETS.landscape;

      const fw = frame.x1 - frame.x0;
      const fh = frame.y1 - frame.y0;
      const aw = W * (1 - ins.left - ins.right);
      const ah = H * (1 - ins.top - ins.bottom);
      const s = Math.min(aw / fw, ah / fh);

      const cxPx = W * (ins.left + (1 - ins.left - ins.right) / 2);
      const cyPx = H * (ins.top + (1 - ins.top - ins.bottom) / 2);
      const fcx = (frame.x0 + frame.x1) / 2;
      const fcy = (frame.y0 + frame.y1) / 2;

      const vb = [fcx - cxPx / s, fcy - cyPx / s, W / s, H / s];
      svg.setAttribute('viewBox', vb.map((n) => n.toFixed(4)).join(' '));

      // Line weights: 1 CSS px == 1/s yards. Grow slightly on big canvases.
      const k = clamp(s / 22, 1, 1.35);
      for (const name in STROKES_PX) {
        const px = name === 'field' || name === 'los' ? STROKES_PX[name] : STROKES_PX[name] * k;
        svg.style.setProperty(`--sw-${name}`, (px / s).toFixed(5));
      }
      svg.style.setProperty('--px', (1 / s).toFixed(5));
      return { scale: s, viewBox: vb };
    },
  };

  FD.Responsive = Responsive;
})(window.FD);

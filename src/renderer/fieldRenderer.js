/*
 * fieldRenderer.js — the persistent field. Built once, never animated, never
 * rebuilt on resize (it lives in yard space; only the viewBox changes).
 *
 * Each marking category is a single <path> so the whole field is a handful of
 * DOM nodes regardless of how many lines it contains.
 *
 * Yard lines are anchored to the line of scrimmage (y = 0) rather than to
 * real field numbers: the wallpaper is about the play, not field position.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el, f } = FD.svg;

  const FieldRenderer = {
    create(parent, defs, opts) {
      const o = opts || {};
      const hw = FD.Coords.FIELD.halfWidth;
      const hx = FD.Coords.FIELD.hashes[o.hashes || 'nfl'];
      const Y0 = -60;
      const Y1 = 60;

      const g = el('g', { class: 'field', 'aria-hidden': 'true' }, parent);

      // Blueprint registration crosses every 5 yards, everywhere.
      const pat = el('pattern', {
        id: 'fd-grid', patternUnits: 'userSpaceOnUse', width: 5, height: 5, x: -2.5, y: -2.5,
      }, defs);
      el('path', { d: 'M2.25 2.5H2.75M2.5 2.25V2.75', class: 'field-cross' }, pat);
      el('rect', { x: -150, y: -150, width: 300, height: 300, fill: 'url(#fd-grid)' }, g);

      el('rect', { x: f(-hw), y: Y0, width: f(hw * 2), height: Y1 - Y0, class: 'field-surface' }, g);

      let yard = '';
      let ticks = '';
      for (let d = Y0; d <= Y1; d++) {
        const y = -d;
        if (d % 5 === 0) {
          yard += `M${f(-hw)} ${y}H${f(hw)}`;
        } else {
          ticks += `M${f(-hx - 0.33)} ${y}H${f(-hx + 0.33)}M${f(hx - 0.33)} ${y}H${f(hx + 0.33)}`;
          ticks += `M${f(-hw)} ${y}h0.5M${f(hw)} ${y}h-0.5`;
        }
      }
      el('path', { d: yard, class: 'field-line field-yard' }, g);
      el('path', { d: ticks, class: 'field-line field-hash' }, g);
      el('path', { d: `M${f(-hw)} ${Y0}V${Y1}M${f(hw)} ${Y0}V${Y1}`, class: 'field-line field-side' }, g);

      // Architectural depth annotations outside the left sideline.
      for (const d of [-5, 0, 5, 10, 15]) {
        const t = el('text', {
          x: f(-hw - 0.9), y: -d, 'font-size': 0.58, class: 'field-label',
          'text-anchor': 'end', 'dominant-baseline': 'central',
        }, g);
        t.textContent = d === 0 ? 'LOS' : d > 0 ? `+${d}` : `\u2212${-d}`;
      }

      return g;
    },
  };

  FD.FieldRenderer = FieldRenderer;
})(window.FD);

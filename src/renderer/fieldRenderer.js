/*
 * fieldRenderer.js — the persistent field. Built once, never animated, never
 * rebuilt on resize (it lives in yard space; only the viewBox changes).
 *
 * Each marking category is a single <path> so the whole field is a handful of
 * DOM nodes regardless of how many lines it contains.
 *
 * Classic mode anchors yard lines to the line of scrimmage (y = 0). With a
 * field position (`update(spot)`), lines, numbers, goal lines and end zones
 * follow the real field around the ball.
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

      // Markings that depend on field position live in their own group and
      // are rebuilt only when the spot changes (a handful of paths).
      let dyn = null;
      let key = null;

      /*
       * spot: yards from the offense's own goal line (1–99), or null for the
       * classic LOS-relative look. labelX: where yard labels sit (just outside
       * the sideline, or inside it when the tight camera crops the sideline).
       */
      g.update = (spot, labelX) => {
        const k = `${spot}|${labelX}`;
        if (k === key) return;
        key = k;
        if (dyn) dyn.remove();
        dyn = el('g', { class: 'field-dyn' }, g);
        const lx = f(-labelX);
        const label = (d, text, cls) => {
          const t = el('text', {
            x: lx, y: -d, 'font-size': 0.58, class: `field-label${cls ? ' ' + cls : ''}`,
            'text-anchor': 'end', 'dominant-baseline': 'central',
          }, dyn);
          t.textContent = text;
        };

        let yard = '';
        let ticks = '';
        let goals = '';
        for (let d = Y0; d <= Y1; d++) {
          const Y = spot === null ? d : spot + d;         // yard line index (own goal = 0)
          if (spot !== null && (Y < -10 || Y > 110)) continue;
          const y = -d;
          if (spot !== null && (Y === 0 || Y === 100)) { goals += `M${f(-hw)} ${y}H${f(hw)}`; continue; }
          if (spot !== null && (Y < 0 || Y > 100)) {
            if (Y === -10 || Y === 110) goals += `M${f(-hw)} ${y}H${f(hw)}`;
            continue;
          }
          if (Y % 5 === 0) {
            yard += `M${f(-hw)} ${y}H${f(hw)}`;
          } else {
            ticks += `M${f(-hx - 0.33)} ${y}H${f(-hx + 0.33)}M${f(hx - 0.33)} ${y}H${f(hx + 0.33)}`;
            ticks += `M${f(-hw)} ${y}h0.5M${f(hw)} ${y}h-0.5`;
          }
        }
        el('path', { d: yard, class: 'field-line field-yard' }, dyn);
        el('path', { d: ticks, class: 'field-line field-hash' }, dyn);

        if (spot === null) {
          // Architectural depth annotations (classic, LOS-relative).
          for (const d of [-5, 0, 5, 10, 15]) label(d, d === 0 ? 'LOS' : d > 0 ? `+${d}` : `\u2212${-d}`);
          return;
        }
        // Goal lines, end lines and end-zone bands.
        el('path', { d: goals, class: 'field-line field-goal' }, dyn);
        for (const [from, to] of [[100, 110], [-10, 0]]) {
          const d0 = from - spot;
          const d1 = to - spot;
          if (d1 < Y0 || d0 > Y1) continue;
          el('rect', { x: f(-hw), y: -d1, width: f(hw * 2), height: 10, class: 'field-endzone' }, dyn);
        }
        // Yard numbers every ten, goal lines marked G.
        for (let Y = 0; Y <= 100; Y += 10) {
          const d = Y - spot;
          if (d < -9 || d > 21) continue;
          label(d, Y === 0 || Y === 100 ? 'GOAL' : String(Y <= 50 ? Y : 100 - Y), 'field-number');
        }
      };
      g.update(null, hw + 0.9);

      return g;
    },
  };

  FD.FieldRenderer = FieldRenderer;
})(window.FD);

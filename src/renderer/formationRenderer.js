/*
 * formationRenderer.js — reusable semantic player markers.
 *
 *   skill (receivers, backs)  circle, optional role letter
 *   ol    (LT LG C RG RT)     compact rounded rectangle; the snapper gets a tick
 *   qb                        circle with a center dot (the dot takes the
 *                             accent while the QB holds the ball)
 *
 * Markers are filled with the background colour so assignment lines tuck
 * cleanly underneath them. Each marker exposes a tiny state API that the
 * timeline drives: setPosition, setAppear, setHasBall.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el, f } = FD.svg;

  const OL_ROLES = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'T', 'G']);
  const SIZE = { r: 0.62, olW: 1.04, olH: 0.66, dot: 0.2 };

  function kindOf(player) {
    if (player.kind) return player.kind;
    if (OL_ROLES.has(player.role)) return 'ol';
    if (player.role === 'QB') return 'qb';
    return 'skill';
  }

  function labelFor(player, kind, mode) {
    if (mode === 'none' || kind === 'qb') return null;
    if (mode === 'skill' && kind !== 'skill') return null;
    return player.label || player.role || player.id;
  }

  const FormationRenderer = {
    SIZE,
    kindOf,

    create(parent, player, pos, cfg) {
      const kind = kindOf(player);
      const g = el('g', { class: `pm pm-${kind}`, 'data-id': player.id }, parent);

      if (kind === 'ol') {
        el('rect', {
          x: -SIZE.olW / 2, y: -SIZE.olH / 2, width: SIZE.olW, height: SIZE.olH, rx: 0.12, class: 'pm-shape',
        }, g);
        if (player.role === 'C') el('line', { x1: 0, y1: -0.15, x2: 0, y2: 0.15, class: 'pm-tick' }, g);
      } else {
        el('circle', { r: SIZE.r, class: 'pm-shape' }, g);
      }

      let dot = kind === 'qb' ? el('circle', { r: SIZE.dot, class: 'pm-dot' }, g) : null;

      const text = labelFor(player, kind, (cfg && cfg.labels) || 'skill');
      let label = null;
      if (text) {
        label = el('text', { class: 'pm-label', 'font-size': text.length > 1 ? 0.44 : 0.6, y: 0.03 }, g);
        label.textContent = text;
      }

      let p = pos;
      let appear = 0;
      function apply() {
        const s = 0.72 + 0.28 * appear;
        g.setAttribute('transform', `translate(${f(p[0])} ${f(p[1])}) scale(${f(s)})`);
        g.setAttribute('opacity', f(appear));
      }
      apply();

      return {
        el: g,
        kind,
        get position() { return p; },
        setPosition(next) { p = next; apply(); },
        setAppear(a) { appear = a; apply(); },
        setHasBall(has) {
          if (has && !dot) {
            dot = el('circle', { r: SIZE.dot, class: 'pm-dot' }, g);
            if (label) label.setAttribute('opacity', 0);
          }
          g.classList.toggle('has-ball', !!has);
        },
      };
    },
  };

  FD.FormationRenderer = FormationRenderer;
})(window.FD);

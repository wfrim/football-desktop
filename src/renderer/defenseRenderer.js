/*
 * defenseRenderer.js — faint defenders (playbook chevrons pointing at the
 * offense), their zone drops / man leverage / run fits, and the key defender.
 * Generic: it draws whatever FD.Defense.build returns. No timing here;
 * choreography.js schedules appear / drops / key pulse.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el, f } = FD.svg;
  const G = FD.Geometry;
  const C = FD.Coords;

  const DefenseRenderer = {
    /**
     * o: { parent, defs, defenders, keyId, showKey, toSvg, players (scene map) }
     * Returns { glyphs:[{setAppear}], moves:[{view, length}], key, destroy }.
     */
    create(o) {
      const g = el('g', { class: 'def' }, o.parent);
      const destroyers = [() => g.remove()];
      const glyphs = [];
      const moves = [];
      let key = null;

      for (const d of o.defenders) {
        const at = o.toSvg(C.fromData(d.at));
        const isKey = o.showKey && d.id === o.keyId;
        const w = el('g', { class: `def-p def-${d.glyph}${isKey ? ' is-key' : ''}`, transform: `translate(${f(at[0])} ${f(at[1])})`, opacity: 0 }, g);
        const s = d.glyph === 'lb' ? 0.36 : 0.3;
        el('path', { d: `M${f(-s)} ${f(-s * 0.62)}L0 ${f(s * 0.62)}L${f(s)} ${f(-s * 0.62)}`, class: 'def-mark' }, w);
        glyphs.push({ setAppear: (p) => w.setAttribute('opacity', f(p)) });

        // Post-snap movement: zone drop, man leverage or run fit.
        let pts = null;
        let style = 'dashed';
        let end = 'none';
        if (d.drop) { pts = [at, o.toSvg(C.fromData(d.drop))]; end = 'settle'; }
        else if (d.man && o.players.get(d.man)) {
          const pl = o.players.get(d.man);
          const route = pl.assignments.find((a) => a.kind === 'route' || a.kind === 'run') || null;
          const target = route ? route.measure.at(0.35).point : o.toSvg(pl.snap);
          const v = G.sub(target, at);
          const len = Math.hypot(v[0], v[1]) || 1;
          pts = [at, G.add(at, G.mul(v, Math.min(1, 2.6 / len)))];
          style = 'dotted';
        } else if (d.fit) { pts = [at, o.toSvg(C.fromData(d.fit))]; end = 'arrow'; }
        if (pts) {
          const view = FD.RouteRenderer.create({
            parent: g, defs: o.defs, path: G.fromPoints(pts, 0), kind: 'def', style, end,
          });
          if (isKey) view.el.classList.add('is-key');
          destroyers.push(view.destroy);
          moves.push({ view, length: view.length, id: d.id });
        }
        if (isKey) {
          const ring = el('circle', { cx: f(at[0]), cy: f(at[1]), r: 0.5, class: 'def-ring', opacity: 0 }, g);
          key = {
            pulse: (p) => { ring.setAttribute('r', f(0.5 + 1.0 * p)); ring.setAttribute('opacity', f(0.7 * (1 - p))); },
          };
        }
      }
      return { glyphs, moves, key, destroy: () => destroyers.forEach((x) => x()) };
    },
  };

  FD.DefenseRenderer = DefenseRenderer;
})(window.FD);

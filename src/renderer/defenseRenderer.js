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

  // Classic playbook letters for defense-first plays.
  const LETTER = (d, all) => {
    if (/^CB/.test(d.id)) return 'C';
    if (d.id === 'FS') return 'F';
    if (d.id === 'SS') return '$';
    if (d.id === 'NB') return 'N';
    if (d.id === 'DIME') return 'D';
    if (/^OLB/.test(d.id)) return 'R';
    if (d.id === 'N') return all.some((q) => q.id === 'NB') ? 'NT' : 'N';
    if (/^E_/.test(d.id)) return 'E';
    if (/^T_/.test(d.id)) return 'T';
    return (d.id[0] || '?').toUpperCase(); // MIKE / WILL / SAM
  };

  const DefenseRenderer = {
    /**
     * o: { parent, defs, defenders, keyId, showKey, toSvg, players (scene map), bold }
     * Returns { glyphs:[{setAppear}], moves:[{view, length, rush, delay}], rotations, key, destroy }.
     */
    create(o) {
      const g = el('g', { class: `def${o.bold ? ' is-bold' : ''}` }, o.parent);
      const rotations = [];
      const destroyers = [() => g.remove()];
      const glyphs = [];
      const moves = [];
      let key = null;

      for (const d of o.defenders) {
        const at = o.toSvg(C.fromData(d.at));
        const pre = d.pre ? o.toSvg(C.fromData(d.pre)) : null;
        const isKey = o.showKey && d.id === o.keyId;
        const start = pre || at;
        const w = el('g', { class: `def-p def-${d.glyph}${isKey ? ' is-key' : ''}`, transform: `translate(${f(start[0])} ${f(start[1])})`, opacity: 0 }, g);
        if (pre) {
          // Disguise: a faint dotted rotation path, and the glyph slides along it pre-snap.
          const view = FD.RouteRenderer.create({ parent: g, defs: o.defs, path: G.fromPoints([pre, at], 0), kind: 'def', style: 'dotted', end: 'none' });
          destroyers.push(view.destroy);
          rotations.push({
            view,
            setT: (p) => { const q = G.lerp(pre, at, p); w.setAttribute('transform', `translate(${f(q[0])} ${f(q[1])})`); },
          });
        }
        if (o.bold) {
          const t = el('text', { class: 'def-letter', 'font-size': 1.05, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, w);
          t.textContent = LETTER(d, o.defenders);
        } else {
          const s = d.glyph === 'lb' ? 0.36 : 0.3;
          el('path', { d: `M${f(-s)} ${f(-s * 0.62)}L0 ${f(s * 0.62)}L${f(s)} ${f(-s * 0.62)}`, class: 'def-mark' }, w);
        }
        glyphs.push({
          id: d.id,
          setAppear: (p) => w.setAttribute('opacity', f(p)),
          setPos: (q) => w.setAttribute('transform', `translate(${f(q[0])} ${f(q[1])})`),
        });

        // Post-snap movement: zone drop, man leverage or run fit.
        let pts = null;
        let style = 'dashed';
        let end = 'none';
        let rush = false;
        if (d.rushPath) { pts = [at].concat(d.rushPath.map((q) => o.toSvg(C.fromData(q)))); style = 'solid'; end = 'arrow'; rush = true; }
        else if (d.drop) { pts = [at, o.toSvg(C.fromData(d.drop))]; end = 'settle'; if (o.bold) style = 'solid'; }
        else if (d.man && o.players.get(d.man)) {
          const pl = o.players.get(d.man);
          const route = pl.assignments.find((a) => a.kind === 'route' || a.kind === 'run') || null;
          const target = o.bold ? o.toSvg(pl.snap) : route ? route.measure.at(0.35).point : o.toSvg(pl.snap);
          const v = G.sub(target, at);
          const len = Math.hypot(v[0], v[1]) || 1;
          // Defense-first: the matchup line runs to the receiver; faint mode: a short leverage tick.
          pts = [at, G.add(at, G.mul(v, o.bold ? Math.max(0, (len - 0.9) / len) : Math.min(1, 2.6 / len)))];
          style = 'dotted';
        } else if (d.fit) { pts = [at, o.toSvg(C.fromData(d.fit))]; end = 'arrow'; }
        if (pts) {
          const view = FD.RouteRenderer.create({
            parent: g, defs: o.defs, path: G.fromPoints(pts, rush ? 0.8 : 0), kind: 'def', style, end,
          });
          if (isKey) view.el.classList.add('is-key');
          if (rush) view.el.classList.add('is-rush');
          destroyers.push(view.destroy);
          moves.push({ view, length: view.length, id: d.id, rush, delay: d.delay || 0 });
        }
        if (isKey) {
          const ring = el('circle', { cx: f(at[0]), cy: f(at[1]), r: 0.5, class: 'def-ring', opacity: 0 }, g);
          key = {
            pulse: (p) => { ring.setAttribute('r', f(0.5 + 1.0 * p)); ring.setAttribute('opacity', f(0.7 * (1 - p))); },
          };
        }
      }
      return { glyphs, moves, rotations, key, destroy: () => destroyers.forEach((x) => x()) };
    },
  };

  FD.DefenseRenderer = DefenseRenderer;
})(window.FD);

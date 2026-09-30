/*
 * pairing.js — Live styles: who blocks whom. Computed once at build time from
 * the authored assignments and the defense's alignment (align.js), so the
 * simulation (sim.js) can make blockers meet real defenders.
 *
 *   pass pro      each lineman takes the nearest rusher across from him;
 *                 backs / tight ends pick up whoever is left
 *   run blocks    (step / doubleTeam) the defender nearest the block's contact
 *                 point; a double team shares one defender
 *   pulls, leads  kick-out → the end man on the line of scrimmage; wrap / lead /
 *                 climb → the second-level defender in the lane
 *   perimeter     stalk / crack re-targets from playRenderer (a.engages)
 *
 * Everything is SVG space (yards; y grows toward the offense's backfield).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const G = FD.Geometry;
  const OL = /^(LT|LG|C|RG|RT)$/;

  /** Is this assignment a pass-protection set (the `pass_set` family default)? */
  const isPassPro = (a) => a.kind === 'block' && a.spec.type === 'block';

  /**
   * scene: the play scene; D: defenders with svg `pos` (sim state objects
   * { d, pos, rusher }). Returns Map(assignment → defender state) plus the
   * list of rushers nobody blocks.
   */
  function pair(scene, D) {
    const out = new Map();
    const claimed = new Map(); // defender id → count
    const claim = (a, x) => { out.set(a, x); claimed.set(x.d.id, (claimed.get(x.d.id) || 0) + 1); };
    const free = (x, shared) => !claimed.has(x.d.id) || (shared && claimed.get(x.d.id) < 2);
    const blocks = scene.assignments.filter((a) => !a.alt && !a.ghost && !a.yac && (a.kind === 'block' || a.kind === 'pull' || a.kind === 'lead'));
    const role = (a) => { const pl = scene.players.get(a.player); return pl ? pl.data.role : ''; };
    const endOf = (a) => G.endPoint(a.path);

    // Perimeter blocks already aimed at a defender.
    for (const a of blocks) {
      if (!a.engages) continue;
      const x = D.find((q) => q.d.id === a.engages);
      if (x) claim(a, x);
    }

    // Pass protection: linemen inside-out, then backs / tight ends.
    const pro = blocks.filter((a) => !out.has(a) && isPassPro(a));
    // Draws / play-action: pass sets on a run still block the men up front.
    const rushers = D.some((x) => x.rusher) ? D.filter((x) => x.rusher) : D.filter((x) => x.d.glyph === 'dl' || x.d.edge);
    const byX = (a) => Math.abs(G.endPoint(a.path)[0] - scene.ballX);
    pro.sort((a, b) => (OL.test(role(b)) - OL.test(role(a))) || byX(a) - byX(b));
    for (const a of pro) {
      const e = endOf(a);
      let best = null;
      let bestD = Infinity;
      for (const x of rushers) {
        if (!free(x, false)) continue;
        const d = Math.abs(x.pos[0] - e[0]) + 0.3 * Math.abs(x.pos[1] - e[1]);
        if (d < bestD) { bestD = d; best = x; }
      }
      const reach = OL.test(role(a)) ? 2.6 : 4.5;
      if (best && bestD < reach) claim(a, best);
      else if (OL.test(role(a))) {
        // Nobody across: help on the nearest rusher (a double team in pass pro).
        let help = null;
        let hd = Infinity;
        for (const x of rushers) { const d = Math.abs(x.pos[0] - e[0]); if (d < hd && free(x, true)) { hd = d; help = x; } }
        if (help && hd < 3.2) claim(a, help);
      }
    }

    // Run blocks, then pulls and leads (they get what the line leaves).
    const order = { block: 0, pull: 1, lead: 2 };
    const rest = blocks.filter((a) => !out.has(a) && !isPassPro(a)).sort((a, b) => order[a.kind] - order[b.kind]);
    for (const a of rest) {
      const e = endOf(a);
      const kickout = a.kind === 'pull' && a.spec.hole === undefined && Math.abs(e[0] - scene.ballX) > 3;
      const shared = a.spec.type === 'doubleTeam';
      let best = null;
      let bestD = Infinity;
      for (const x of D) {
        if (!free(x, shared)) continue;
        const g = x.d.glyph;
        let d = G.dist(x.pos, e);
        if (a.kind === 'block' && OL.test(role(a))) d += g === 'dl' ? -0.6 : g === 'db' ? 2.5 : 0;
        else if (kickout) d += g === 'dl' || x.d.edge ? -1 : 1.5;
        else if (a.kind !== 'block') d += g === 'lb' ? -1 : g === 'dl' ? 1.2 : 0.3;
        if (d < bestD) { bestD = d; best = x; }
      }
      const reach = a.kind === 'block' ? (OL.test(role(a)) ? 3 : 6) : 6.5;
      if (best && bestD < reach) claim(a, best);
    }

    const unblocked = rushers.filter((x) => !claimed.has(x.d.id));
    return { pairs: out, unblocked };
  }

  FD.LivePairing = { pair, isPassPro };
})(window.FD);

/*
 * resolve.js — canonical play (football contract) → render-ready play.
 *
 *   formation reference  → 11 aligned players (+ per-play alignment overrides)
 *   assignments by player → vocabulary expansion → primitive specs (sequences)
 *   family defaults      → fill unmentioned OL / QB
 *   copy                 → typography fields
 *
 * The renderer only ever sees the resolved shape, so changes to the football
 * contract are absorbed here and in vocabulary.js.
 *
 * Validation returns { fatal, warn }. Fatal problems skip the play (the
 * wallpaper keeps running); warnings are logged.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const OL = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function resolve(play, formations) {
    const fatal = [];
    const warn = [];

    // ── Formation ──────────────────────────────────────────────────────
    const formation = typeof play.formation === 'string' ? formations[play.formation] : play.formation;
    if (!formation) {
      fatal.push(`unknown formation "${play.formation}"`);
      return { play: null, fatal, warn };
    }
    const players = clone(formation.players || []);
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const [id, at] of Object.entries(play.alignment || {})) {
      if (byId.has(id)) byId.get(id).at = at;
      else fatal.push(`alignment override for unknown player "${id}"`);
    }

    // Hard rule: QB directly behind C unless the play/formation opts out.
    const qb = players.find((p) => p.role === 'QB');
    const c = players.find((p) => p.role === 'C');
    if (qb && c && Math.abs(qb.at[0] - c.at[0]) > 1e-6 && !play.qbOffset && !formation.qbOffset) {
      fatal.push(`QB.x (${qb.at[0]}) !== C.x (${c.at[0]}); set "qbOffset": true if intentional`);
    }

    // ── Assignments ────────────────────────────────────────────────────
    const given = Object.assign({}, play.assignments || {});
    const family = FD.Vocabulary.families[play.family] || {};
    if (given.OL) {
      for (const id of OL) if (!given[id]) given[id] = given.OL;
      delete given.OL;
    }
    for (const p of players) {
      if (given[p.id]) continue;
      if (OL.has(p.role) && family.ol) given[p.id] = family.ol;
      else if (p.role === 'QB' && family.qb) given[p.id] = family.qb;
    }

    const assignments = [];
    for (const [id, raw] of Object.entries(given)) {
      const player = byId.get(id);
      if (!player) { fatal.push(`assignment for unknown player "${id}"`); continue; }
      const seq = [].concat(raw);
      let steps = [];
      try {
        for (const s of seq) steps = steps.concat(FD.Vocabulary.expand(s, player));
      } catch (err) {
        fatal.push(`${id}: ${err.message}`);
        continue;
      }
      for (const s of seq) {
        const entry = FD.Vocabulary.table[s.type];
        if (entry && entry.status === 'provisional') warn.push(`${id}: "${s.type}" is provisional vocabulary`);
      }
      steps.forEach((s, i) => assignments.push(Object.assign({}, s, { player: id, chain: i > 0 })));
    }
    const idle = players.filter((p) => !given[p.id]).map((p) => p.id);

    // ── References ─────────────────────────────────────────────────────
    for (const r of play.relationships || []) {
      for (const id of FD.Relationships.participantsOf(r)) {
        if (!byId.has(id)) fatal.push(`relationship "${r.type}" references unknown player "${id}"`);
      }
    }
    const ballTo = play.ball && (typeof play.ball.to === 'string' ? play.ball.to : play.ball.to && play.ball.to.player);
    if (ballTo && !byId.has(ballTo)) fatal.push(`ball target "${ballTo}" is not in the formation`);

    const copy = play.copy || {};
    const resolved = {
      id: play.id,
      number: play.number,
      name: play.name,
      family: play.family,
      _mock: play._mock,
      copy: {
        title: copy.title || play.name,
        meta: copy.meta,
        formation: copy.formation || formation.name,
        situation: copy.situation,
        description: copy.description,
      },
      situation: play.situation || {},
      formation: { id: formation.id, name: formation.name, ball: play.ball_spot || formation.ball || { hash: 'middle' } },
      players,
      idle,
      assignments,
      relationships: play.relationships || [],
      reads: play.reads || [],
      ball: play.ball
        ? Object.assign({}, play.ball, {
            to: typeof play.ball.to === 'string' ? { player: play.ball.to, at: play.ball.at } : play.ball.to,
          })
        : null,
      events: play.events || [],
    };
    return { play: resolved, fatal, warn };
  }

  FD.Resolve = { resolve };
})(window.FD);

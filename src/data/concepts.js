/*
 * concepts.js — concept templates → plays.
 *
 * A CONCEPT is football written once, by role, as if the play goes to the
 * offense's right. A PRESENTATION maps it onto one formation. Expanding
 * concept × presentation yields ordinary play objects (same shape as
 * src/data/plays/*.json), which then go through resolve.js as usual.
 *
 *   roles       #1 #2 #3        receivers on the concept side, outside-in
 *               bs#1 bs#2 bs#3  backside receivers, outside-in
 *               PST PSG C BSG BST   play-side / back-side line
 *               QB RB FB TE     (TE = inline play-side tight end, if any)
 *               anything else   bound by "roles" (concept default, presentation
 *                               override) to a role or player id: { "KICK": "Y", "UNDER": "bs#2" }
 *               a key ending in "?" is optional (skipped if the formation lacks it)
 *   side        right | left | strength | weak | away_from_back | to_back
 *               (a presentation may override). Left mirrors every x and
 *               swaps dir left/right; in/out/play/back are already relative.
 *   landmarks   any x in at / target / via / through / hole may be a token,
 *               in PLAY-SIDE terms (positive = play side):
 *                 a b c d        gaps (-a … -d on the backside), from the
 *                                formation's actual line and inline TE
 *                 PST, #2, TE…   that player's x
 *                 "b+0.3"        offsets
 *               a whole point may be "mesh": the QB–back exchange spot.
 *   defaults    { receivers, backs }: specs for skill players the concept
 *               doesn't assign (e.g. stalk blocks on runs).
 *   presentation fields: formation, side, roles, assignments (null removes),
 *               tweaks { ROLE: {param: value} } (merged into that role's spec),
 *               copy, situation, alignment, frame, id.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const OL = ['LT', 'LG', 'C', 'RG', 'RT'];
  const POINT_KEYS = ['at', 'target', 'via'];  // (+ `through`, `hole` below)
  const REL_VEC_KEYS = ['to', 'check'];
  const ROLE_FIELDS = ['high', 'low', 'clear', 'into', 'puller', 'wrap', 'runner', 'blocker'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const POS = { Y: 'TE', U: 'TE' };
  const posOf = (p) => p.pos || POS[p.role] || (/^(RB|F|FB)$/.test(p.role) ? 'RB' : 'WR');
  const FAMILY_LABEL = {
    dropback_pass: 'PASS', quick_pass: 'QUICK GAME', play_action: 'PLAY-ACTION',
    screen: 'SCREEN', run: 'RUN', rpo: 'RPO', defense: 'DEFENSE',
  };
  const PACKAGE_LABEL = { nickel: 'NICKEL 4-2-5', base: 'BASE 4-3', '34': '3-4', dime: 'DIME 4-1-6', bear: 'BEAR 46', '335': '3-3-5 STACK' };

  function analyze(f) {
    const ps = f.players;
    const qb = ps.find((p) => p.role === 'QB');
    const ol = ps.filter((p) => OL.includes(p.role));
    const backs = ps.filter((p) => /^(RB|F|FB)$/.test(p.role) && Math.abs(p.at[0]) < 5);
    const receivers = ps.filter((p) => p !== qb && !ol.includes(p) && !backs.includes(p));
    const onSide = (s) => receivers
      .filter((p) => (p.at[0] >= 0 ? 1 : -1) === s)
      .sort((a, b) => Math.abs(b.at[0]) - Math.abs(a.at[0]));
    return { ps, qb, ol, backs, receivers, onSide };
  }

  function strength(A) {
    const d = A.onSide(1).length - A.onSide(-1).length;
    if (d) return Math.sign(d);
    const te = A.receivers.find((p) => posOf(p) === 'TE');
    return te ? (te.at[0] >= 0 ? 1 : -1) : 1;
  }

  function resolveSide(rule, A) {
    const rb = A.backs.find((p) => p.role === 'RB');
    const rbSide = rb && Math.abs(rb.at[0]) > 0.3 ? Math.sign(rb.at[0]) : 0;
    switch (rule) {
      case 'left': return -1;
      case 'right': return 1;
      case 'weak': return -strength(A);
      case 'away_from_back': return rbSide ? -rbSide : strength(A);
      case 'to_back': return rbSide || strength(A);
      default: return strength(A); // 'strength', 'trips', undefined
    }
  }

  /** Role name → formation player, for concept side s. */
  function binder(A, s, extra) {
    const olBy = (role) => A.ol.find((p) => p.role === role);
    const fixed = {
      PST: olBy(s > 0 ? 'RT' : 'LT'), PSG: olBy(s > 0 ? 'RG' : 'LG'), C: olBy('C'),
      BSG: olBy(s > 0 ? 'LG' : 'RG'), BST: olBy(s > 0 ? 'LT' : 'RT'),
      QB: A.qb,
      RB: A.backs.find((p) => p.role === 'RB') || A.ps.find((p) => p.role === 'RB'),
      FB: A.backs.find((p) => /^(F|FB)$/.test(p.role)),
    };
    // TE = an INLINE tight end on the play side (a detached "Y" in the slot is a receiver).
    const pst = fixed.PST.at[0];
    fixed.TE = A.receivers.find((p) => posOf(p) === 'TE' && p.at[1] > -1.5 && s * p.at[0] > 0 && Math.abs(p.at[0] - pst) < 2);
    const play = A.onSide(s);
    const back = A.onSide(-s);
    const bind = (role, depth) => {
      if (extra && extra[role] && (depth || 0) < 4) return bind(extra[role], (depth || 0) + 1);
      let m = /^#(\d)$/.exec(role);
      if (m) return play[m[1] - 1];
      m = /^bs#(\d)$/.exec(role);
      if (m) return back[m[1] - 1];
      if (fixed[role]) return fixed[role];
      return A.ps.find((p) => p.id === role); // literal player id
    };
    return bind;
  }

  /** Landmarks in play-side terms (positive = play side). */
  function landmarks(A, s, bind) {
    const pf = (p) => s * p.at[0];
    const PST = pf(bind('PST'));
    const PSG = pf(bind('PSG'));
    const BST = pf(bind('BST'));
    const BSG = pf(bind('BSG'));
    const Cx = pf(bind('C'));
    const inline = (sign) => A.receivers.find((p) => posOf(p) === 'TE' && p.at[1] > -1.5 &&
      sign * pf(p) > 0 && Math.abs(Math.abs(pf(p)) - Math.abs(sign > 0 ? PST : BST)) < 2);
    const gaps = (T, G, sign) => {
      const te = inline(sign);
      const teX = te ? pf(te) : null;
      return {
        a: (Cx + G) / 2,
        b: (G + T) / 2,
        c: te ? (T + teX) / 2 : T + sign * 1.1,
        d: te ? teX + sign * 1.2 : T + sign * 2.4,
      };
    };
    const ps = gaps(PST, PSG, 1);
    const bs = gaps(BST, BSG, -1);
    const X = (tok) => {
      if (typeof tok === 'number') return tok;
      const m = /^(-?)(bs#\d|[a-d]|[A-Z#][A-Za-z#0-9]*)([+-]\d*\.?\d+)?$/.exec(tok);
      if (!m) throw new Error(`bad landmark "${tok}"`);
      let v;
      if (/^[a-d]$/.test(m[2])) v = (m[1] ? bs : ps)[m[2]];
      else {
        const p = bind(m[2]);
        if (!p) throw new Error(`landmark "${tok}": no ${m[2]} in formation`);
        v = pf(p) * (m[1] ? -1 : 1);
      }
      return v + (m[3] ? parseFloat(m[3]) : 0);
    };
    const mesh = () => {
      const q = A.qb.at;
      const rb = bind('RB');
      if (rb && Math.abs(rb.at[1] - q[1]) < 1.2) return [0.25, q[1] + 0.7]; // gun, offset back: in front of the QB
      if (q[1] < -2.5) return [0.7, q[1] - 0.6];                           // pistol: beside the QB
      return [1.0, -3.0];                                                   // under center
    };
    return {
      point(p) {
        if (p === 'mesh') { const m = mesh(); return [s * m[0], m[1]]; }
        return [s * X(p[0]), p[1]];
      },
      x: (t) => s * X(t),
    };
  }

  /** Mirror + resolve landmarks inside one assignment spec (recursively for `release`). */
  function place(spec, s, L) {
    if (Array.isArray(spec)) return spec.map((x) => place(x, s, L));
    const o = Object.assign({}, spec);
    for (const k of POINT_KEYS) if (o[k] !== undefined) o[k] = L.point(o[k]);
    if (o.through) o.through = o.through.map((q) => L.point(q));
    if (o.hole !== undefined) o.hole = L.x(o.hole);
    for (const k of REL_VEC_KEYS) if (Array.isArray(o[k])) o[k] = [s * o[k][0], o[k][1]];
    if (o.points) o.points = o.points.map((q) => [s * q[0], q[1]]);
    if (s < 0 && (o.dir === 'left' || o.dir === 'right')) o.dir = o.dir === 'left' ? 'right' : 'left';
    if (o.release && typeof o.release === 'object') o.release = place(o.release, s, L);
    return o;
  }

  function expandOne(c, pr, formations) {
    const f = formations[pr.formation];
    if (!f) throw new Error(`unknown formation "${pr.formation}"`);
    const A = analyze(f);
    const s = pr.side ? resolveSide(pr.side, A) : resolveSide(c.side, A);
    const bind = binder(A, s, Object.assign({}, c.roles, pr.roles));
    const L = landmarks(A, s, bind);
    const idOf = (role) => {
      const p = bind(role);
      if (!p) throw new Error(`role "${role}" not in ${f.id}`);
      return p.id;
    };

    const assignments = {};
    // Presentation entries first, so they win over the template's.
    const given = {};
    for (const [k, v] of Object.entries(pr.assignments || {})) if (v !== null) given[k] = v;
    for (const [k, v] of Object.entries(c.assignments || {})) if (!(k in (pr.assignments || {}))) given[k] = v;
    for (const [key, spec] of Object.entries(given)) {
      const optional = key.endsWith('?');
      const role = optional ? key.slice(0, -1) : key;
      const p = bind(role);
      if (!p) {
        if (optional) continue;
        throw new Error(`role "${role}" not in ${f.id}`);
      }
      if (assignments[p.id] !== undefined) continue;                // first binding wins
      const tweak = pr.tweaks && pr.tweaks[role];
      const tuned = tweak ? (Array.isArray(spec) ? spec.map((x, i) => (i === 0 ? Object.assign({}, x, tweak) : x)) : Object.assign({}, spec, tweak)) : spec;
      assignments[p.id] = place(tuned, s, L);
    }
    const d = c.defaults || {};
    for (const p of A.receivers) if (!assignments[p.id] && d.receivers) assignments[p.id] = place(d.receivers, s, L);
    for (const p of A.backs) if (!assignments[p.id] && d.backs) assignments[p.id] = place(d.backs, s, L);

    const ids = (list) => list.filter((r) => !r.endsWith('?') || bind(r.slice(0, -1))).map((r) => idOf(r.replace(/\?$/, '')));
    const relationships = (c.relationships || []).map((r) => {
      const o = Object.assign({}, r);
      if (o.participants) o.participants = ids(o.participants);
      if (o.type === 'lanes' && s < 0) o.participants.reverse(); // authored backside → play side
      if (o.blockers) o.blockers = ids(o.blockers);
      for (const k of ROLE_FIELDS) if (o[k]) o[k] = idOf(o[k]);
      return o;
    });

    const personnel = f.personnel;
    const dpkg = c.family === 'defense'
      ? ((c.defense && c.defense.package && c.defense.package !== 'auto') ? c.defense.package : (A.receivers.length >= 3 ? 'nickel' : 'base'))
      : null;
    const copy = Object.assign({
      meta: dpkg ? `DEFENSE \u00B7 ${PACKAGE_LABEL[dpkg]}` : `${FAMILY_LABEL[c.family] || 'PASS'} · ${personnel} PERSONNEL`,
      formation: dpkg ? `VS ${f.name.toUpperCase()}` : f.name.toUpperCase(),
    }, c.copy, pr.copy);

    const play = {
      id: pr.id || `${c.conceptId}_${f.id}`,
      conceptId: c.conceptId,
      name: c.name,
      family: c.family,
      subfamily: c.subfamily,
      tags: c.tags,
      side: s > 0 ? 'right' : 'left',
      personnel,
      formation: f.id,
      alignment: pr.alignment,
      copy,
      situation: Object.assign({}, c.situation, pr.situation),
      assignments,
      relationships,
      football: c.football,
      sources: c.sources,
      frame: pr.frame || c.frame,
      defense: Object.assign({}, c.defense, pr.defense),
    };
    if (c.ball) play.ball = Object.assign({}, c.ball, { to: idOf(c.ball.to) }, pr.ball);
    if (c.handoff) {
      play.handoff = { to: idOf(c.handoff.to), at: typeof c.handoff.at === 'number' ? c.handoff.at : L.point(c.handoff.at || 'mesh') };
    }
    if (c.reads) play.reads = Array.from(new Set(c.reads.filter((r) => bind(r)).map(idOf)));
    if (c.primary) play.primary = idOf(c.primary);
    if (c.events) play.events = c.events.map((e) => Object.assign({}, e, { at: L.point(e.at) }));
    return play;
  }

  const Concepts = {
    analyze,
    /** Expand every presentation of concept `c`. Returns { plays, errors }. */
    expand(c, formations) {
      const plays = [];
      const errors = [];
      for (const pr of c.presentations || []) {
        try {
          plays.push(expandOne(c, pr, formations));
        } catch (err) {
          errors.push({ id: pr.id || `${c.conceptId}_${pr.formation}`, message: err.message });
        }
      }
      return { plays, errors };
    },
  };

  FD.Concepts = Concepts;
})(window.FD);

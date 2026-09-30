/*
 * align.js — a legal, recognisable defense for any play, generated from the
 * offense's actual alignment (so every current and future play gets one).
 *
 *   look = {
 *     package:  'auto' | 'nickel' (4-2-5) | 'base' (4-3) | '34' | 'dime' (4-1-6) | 'bear' | '335'
 *     front:    { nose: '0', play: [3, 5], back: [1, '9o'] }   techniques centre → out;
 *               'o' suffix = standing edge player (drawn as a linebacker)
 *     coverage: cover0 | cover1 | robber | cover2 | tampa2 | cover2man | cover3 | buzz | cover4 | cover6
 *     moves:    { MIKE: { blitz: 'a_ps' }, E_bs: { drop: 'hook_bs' }, T_ps: { stunt: ['b_ps', 'a_ps'] },
 *                 NB: { man: '#2' }, FS: { drop: 'middle' } }
 *     disguise: 'cover2'      pre-snap shell; defenders rotate to the real coverage at the snap
 *     rush:     true          draw pass-rush lanes for the down linemen (defense-first plays)
 *     key:      'flat'        the job the concept attacks (offense) / features (defense)
 *   }
 *
 * Every defender gets a `job` (flat_ps, hook_bs, deep_middle, end_bs …): "ps" /
 * "bs" are relative to the play's side. Output points are data space,
 * ball-relative yards (+y = the defense's side). Zone landmarks are FIELD-
 * relative (thirds, hashes) and converted with `ballX`.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const DL_Y = 0.95;
  const EDGE_Y = 1.3;
  const QB_SPOT = -3.1; // rush lanes finish at the edge of the pocket (spread, not piled on the QB)

  const LANDMARK = {
    third: (s) => [s * 17.5, 17], middle: () => [0, 17.5], half: (s) => [s * 12, 18],
    out_q: (s) => [s * 18.5, 16.5], in_q: (s) => [s * 7, 16.5], tampa: () => [0, 13.5],
    flat: (s) => [s * 15, 5], curl: (s) => [s * 10.5, 8.5], hook: (s) => [s * 5, 9], rat: () => [0, 8], robber: () => [0, 11],
  };
  const CB_DEPTH = { cover0: 1.2, cover1: 1.6, robber: 1.6, cover2: 5, tampa2: 5, cover2man: 1.6, cover3: 7, buzz: 7, cover4: 8, cover6: 7 };
  const TWO_HIGH = new Set(['cover2', 'tampa2', 'cover2man', 'cover4', 'cover6']);
  const PACKAGE_DB = { nickel: 5, base: 4, '34': 4, dime: 6, bear: 4, '335': 5 };
  const PACKAGE_LABEL = { nickel: 'NICKEL 4-2-5', base: 'BASE 4-3', '34': '3-4', dime: 'DIME 4-1-6', bear: 'BEAR 46', '335': '3-3-5 STACK' };
  const PACKAGE_FRONT = {
    '34': { nose: '0', play: ['5', '9o'], back: ['5', '9o'] },
    bear: { nose: '0', play: ['3', '9'], back: ['3', '7o'] },
    '335': { nose: '0', play: ['5'], back: ['5'] },
  };

  const DEFAULTS = {
    run: { coverage: 'cover3', front: { play: [3, 5], back: [1, 5] } },
    pass: { coverage: 'cover3', front: { play: [3, 5], back: [3, 5] } },
  };

  function analyze(play) {
    const A = FD.Concepts.analyze({ players: play.players });
    const ol = (r) => A.ol.find((p) => p.role === r);
    const tes = A.receivers.filter((p) => (p.pos || (/^(Y|U)$/.test(p.role) ? 'TE' : 'WR')) === 'TE' && p.at[1] > -1.5);
    return { A, ol, tes };
  }

  function inlineTE(tes, tackleX, s) {
    const te = tes.find((p) => Math.sign(p.at[0]) === s && Math.abs(p.at[0] - tackleX) < 2);
    return te ? te.at[0] : null;
  }

  /** Technique → x for side s (+1 right / -1 left), from real line positions. */
  function techX(tech, s, X) {
    const G = X.guard(s);
    const T = X.tackle(s);
    const TE = X.te(s);
    switch (String(tech).replace(/o$/, '')) {
      case '0': return X.C;
      case '1': return X.C + s * 0.6;
      case '2i': return G - s * 0.45;
      case '2': return G;
      case '3': return G + s * 0.6;
      case '4i': return T - s * 0.45;
      case '4': return T;
      case '5': return T + s * 0.6;
      case '6': return TE !== null ? TE : T + s * 1.3;
      case '7': return TE !== null ? TE - s * 0.45 : T + s * 1.1;
      case '9': return TE !== null ? TE + s * 0.8 : T + s * 2.2;
      case 'w': return TE !== null ? TE + s * 2.2 : T + s * 3.6; // wide edge
      default: return T + s * 0.6;
    }
  }

  function build(play, look, ballX) {
    const { A, ol, tes } = analyze(play);
    const ps = play.side === 'left' ? -1 : 1;
    const run = play.family === 'run';
    const L = Object.assign({}, run ? DEFAULTS.run : DEFAULTS.pass, look || {});
    const X = {
      C: ol('C').at[0],
      guard: (s) => ol(s > 0 ? 'RG' : 'LG').at[0],
      tackle: (s) => ol(s > 0 ? 'RT' : 'LT').at[0],
      te: (s) => inlineTE(tes, ol(s > 0 ? 'RT' : 'LT').at[0], s),
    };
    const side = (s) => (s === ps ? 'ps' : 'bs');
    const fieldToBall = (p) => [p[0] - ballX, p[1]];
    const out = [];
    const add = (id, glyph, at, job, extra) => out.push(Object.assign({ id, glyph, at, job }, extra || {}));

    // ── Personnel package ─────────────────────────────────────────────────
    const numWR = A.receivers.length;
    let pkg = L.package && L.package !== 'auto' ? L.package : numWR >= 3 ? 'nickel' : 'base';
    if (!PACKAGE_DB[pkg]) pkg = 'nickel';
    const front = (L.package && PACKAGE_FRONT[pkg] && !(look && look.front)) ? PACKAGE_FRONT[pkg] : (L.front || DEFAULTS.run.front);

    // ── Front: down linemen (and standing edge players) by technique ──────
    const edges = [];
    if (front.nose !== undefined && front.nose !== null) add('N', 'dl', [techX(front.nose, ps, X), DL_Y], 'nose', { rush: true });
    for (const [s, techs] of [[ps, front.play || [3, 5]], [-ps, front.back || [1, 5]]]) {
      const lastDown = techs.map(String).filter((t) => !/o$/.test(t)).length - 1;
      let k = -1;
      techs.forEach((t) => {
        if (!/o$/.test(String(t))) k += 1;
        const outer = k === lastDown;
        const x = techX(t, s, X);
        if (/o$/.test(String(t))) { edges.push({ s, x }); return; }
        const id = `${outer ? 'E' : 'T'}_${side(s)}`;
        add(out.some((d) => d.id === id) ? `${id}2` : id, 'dl', [x, DL_Y], `${outer ? 'end' : 'tackle'}_${side(s)}`, { rush: true });
      });
    }
    const dlCount = out.length;
    for (const e of edges) add(`OLB_${side(e.s)}`, 'lb', [e.x, EDGE_Y], `edge_${side(e.s)}`, { rush: true, edge: true });

    // ── Receivers and strength ────────────────────────────────────────────
    const R = { 1: A.onSide(1), [-1]: A.onSide(-1) };
    const strong = R[1].length !== R[-1].length ? Math.sign(R[1].length - R[-1].length) : (tes.length ? Math.sign(tes[0].at[0]) || 1 : ps);
    const weak = -strong;
    const rcv = (s, n) => (R[s][n - 1] || null);
    const apexX = (s) => {
      const two = rcv(s, 2);
      const T = X.tackle(s);
      return two ? (two.at[0] + T) / 2 : T + s * 3.5;
    };
    const cov = L.coverage;
    const cbDepth = CB_DEPTH[cov] || 7;
    const man = new Set(['cover0', 'cover1', 'robber', 'cover2man']).has(cov);

    // ── Secondary ─────────────────────────────────────────────────────────
    const nDB = PACKAGE_DB[pkg];
    for (const s of [strong, weak]) {
      const one = rcv(s, 1);
      const x = one ? one.at[0] + s * (man ? 0.3 : 0.9) : s * 14;
      add(`CB_${side(s)}`, 'db', [x, cbDepth], 'corner_' + side(s), { man: man && one ? one.id : null });
    }
    const twoHigh = TWO_HIGH.has(cov);
    if (cov === 'cover0') {
      add('FS', 'db', [apexX(strong) * 0.4, 7], 'safety_middle');
      add('SS', 'db', [apexX(weak), 6], 'apex_' + side(weak));
    } else if (twoHigh) {
      for (const s of [strong, weak]) add(s === strong ? 'SS' : 'FS', 'db', fieldToBall([s * (cov === 'cover4' ? 8 : 9.5), cov === 'cover4' ? 11 : 12.5]), 'safety_' + side(s));
    } else {
      add('FS', 'db', fieldToBall([0, 13]), 'deep_middle');
      add('SS', 'db', [apexX(weak), 6], 'apex_' + side(weak));
    }
    if (nDB >= 5) add('NB', 'db', [apexX(strong), 5], 'apex_' + side(strong));
    if (nDB >= 6) {
      const ss = out.find((d) => d.id === 'SS');
      if (ss && !twoHigh) ss.at = [apexX(weak), 6];
      add('DIME', 'db', [X.tackle(weak) + weak * 2.5, 7.5], 'dime_' + side(weak));
    }

    // ── Linebackers: whatever the box has left ────────────────────────────
    const nLB = 11 - out.length;
    const lbSpots = {
      1: [['MIKE', [X.C + strong * 0.3, 4.8], 'lb_middle']],
      2: [['MIKE', [X.guard(strong) + strong * 0.7, 4.6], 'lb_' + side(strong)], ['WILL', [X.guard(weak) + weak * 0.7, 4.6], 'lb_' + side(weak)]],
      3: [['SAM', [X.te(strong) !== null ? X.te(strong) + strong * 1.2 : X.tackle(strong) + strong * 2.6, 4.2], 'lb_' + side(strong)],
        ['MIKE', [X.C + strong * 0.4, 4.8], 'lb_middle'], ['WILL', [X.guard(weak) + weak * 1.0, 4.6], 'lb_' + side(weak)]],
    };
    const spots = lbSpots[Math.max(1, Math.min(3, nLB))] || [];
    for (let i = 0; i < nLB; i++) {
      const sp = spots[i] || [`LB${i + 1}`, [X.C + (i % 2 ? weak : strong) * (1 + i), 4.8], 'lb_middle'];
      add(sp[0], 'lb', sp[1], sp[2]);
    }
    if (pkg === '335') for (const d of out) if (d.glyph === 'lb') d.at = [d.at[0] * 0.8, 4.4]; // stacked behind the three

    // ── Post-snap: zone drops, man, run fits ──────────────────────────────
    const by = (id) => out.find((d) => d.id === id);
    const drop = (id, name, s, job) => {
      const d = by(id);
      if (!d || d.man) return;
      d.drop = fieldToBall(LANDMARK[name](s || 1));
      d.job = job || (['middle', 'rat', 'tampa', 'robber'].includes(name) ? `deep_${name}` : `${name}_${side(s || 1)}`);
    };
    const cb = (s) => `CB_${side(s)}`;
    const box = out.filter((d) => d.glyph === 'lb' && !d.edge).map((d) => d.id);
    // Underneath defenders, strong → weak. With no nickel/Sam (3-4), the strong
    // outside backer drops to the flat instead of rushing. The strong safety is
    // only an underneath player in single-high shells.
    const strongEdge = out.find((d) => d.edge && d.id === `OLB_${side(strong)}`);
    let first = nDB >= 5 ? 'NB' : box.find((id) => id === 'SAM');
    if (!first && strongEdge && !run) { first = strongEdge.id; strongEdge.rush = false; }
    if (!first) first = box[0];
    const under = [first, ...box.filter((id) => id !== 'SAM'), twoHigh ? null : 'SS']
      .filter((id, i, a) => id && a.indexOf(id) === i);
    const manOn = (id, target) => { const d = by(id); if (d && target) { d.man = target.id; d.job = `man_${target.id}`; delete d.drop; } };
    const two = rcv(strong, 2) || rcv(strong, 3);
    const twoW = rcv(weak, 2) || tes.find((t) => Math.sign(t.at[0]) === weak) || null;
    const back = A.backs[0] || null;

    if (run && !(look && look.moves)) {
      for (const d of out) if (d.glyph === 'lb' && !d.edge || d.id === 'NB' || (d.id === 'SS' && !twoHigh)) d.fit = [d.at[0] + ps * 1.4, d.at[1] - 1.4];
    } else if (cov === 'cover3' || cov === 'buzz') {
      drop(cb(strong), 'third', strong); drop(cb(weak), 'third', weak); drop('FS', 'middle', 0, 'deep_middle');
      if (cov === 'buzz') { drop('SS', 'curl', strong); drop(under[0], 'flat', strong); drop(under[1], 'hook', weak); drop(under[2], 'flat', weak); }
      else { drop(under[0], 'flat', strong); drop(under[1], 'hook', strong); drop(under[2], 'hook', weak); drop('SS', 'flat', weak); }
      if (under[3] && under[3] !== 'SS') drop(under[3], 'hook', weak);
    } else if (cov === 'cover2' || cov === 'tampa2') {
      drop(cb(strong), 'flat', strong); drop(cb(weak), 'flat', weak);
      drop('SS', 'half', strong); drop('FS', 'half', weak);
      drop(under[0], 'curl', strong);
      if (cov === 'tampa2') drop(box.includes('MIKE') ? 'MIKE' : under[1], 'tampa', 0, 'deep_tampa');
      else drop(under[1], 'hook', 0.001 * strong, 'hook_middle');
      drop(under[2], 'curl', weak);
    } else if (cov === 'cover4' || cov === 'cover6') {
      drop(cb(strong), 'out_q', strong); drop('SS', 'in_q', strong);
      if (cov === 'cover6') { drop(cb(weak), 'flat', weak); drop('FS', 'half', weak); }
      else { drop(cb(weak), 'out_q', weak); drop('FS', 'in_q', weak); }
      drop(under[0], 'flat', strong); drop(under[1], 'hook', strong); drop(under[2], 'curl', weak);
    } else if (man) {
      manOn(under[0], two);
      manOn('SS', twoW);
      manOn(under[2] || under[1], back);
      if (by('DIME')) manOn('DIME', rcv(weak, 2) || rcv(strong, 3));
      if (cov === 'cover2man') { const s1 = by('SS'); if (s1) { delete s1.man; } drop('SS', 'half', strong); drop('FS', 'half', weak); }
      else if (cov === 'cover0') { const fs = by('FS'); if (fs) fs.blitz = true; }
      else drop('FS', 'middle', 0, 'deep_middle');
      if (cov === 'robber') drop(under[1], 'robber', 0, 'deep_robber');
      else if (cov !== 'cover0') drop(under[1], 'rat', 0, 'deep_rat');
    }

    // ── Pass rush lanes (defense-first plays) ─────────────────────────────
    const gapX = (tok) => {
      const m = /^([a-d])_(ps|bs)$/.exec(tok);
      if (!m) return 0;
      const s = m[2] === 'ps' ? ps : -ps;
      const G = X.guard(s); const T = X.tackle(s); const TE = X.te(s);
      return { a: (X.C + G) / 2, b: (G + T) / 2, c: TE !== null ? (T + TE) / 2 : T + s * 1.1, d: TE !== null ? TE + s * 1.2 : T + s * 2.4 }[m[1]];
    };
    const rushTo = (x0, gap) => {
      const gx = typeof gap === 'number' ? gap : gapX(gap);
      return [[gx, -0.6], [gx * 0.55, QB_SPOT]];
    };
    if (L.rush) {
      for (const d of out) {
        if (!d.rush) continue;
        const lane = d.at[0] + Math.sign(d.at[0] || ps) * 0.3;
        d.rushPath = [[lane, -0.6], [lane * 0.55, QB_SPOT]];
      }
    }
    // Explicit moves override everything above.
    for (const [id, mv] of Object.entries(L.moves || {})) {
      const d = by(id);
      if (!d) continue;
      delete d.drop; delete d.fit; delete d.man; delete d.rushPath;
      if (mv.blitz) { d.rushPath = rushTo(d.at[0], mv.blitz); d.job = `blitz_${mv.blitz}`; d.rush = true; }
      if (mv.rush) { d.rushPath = rushTo(d.at[0], mv.rush); d.rush = true; }
      if (mv.stunt) { const [g1, g2] = mv.stunt; d.rushPath = [[gapX(g1), -0.4], [gapX(g2), -1.6], [gapX(g2) * 0.55, QB_SPOT]]; d.rush = true; d.job = `stunt_${g2}`; d.delay = mv.delay || 0; }
      if (mv.drop) { const [name, sd] = mv.drop.split('_'); d.rush = false; drop(id, name, sd === 'bs' ? -ps : sd === 'ps' ? ps : strong); }
      if (mv.man) { const t = /^#(\d)$/.exec(mv.man) ? rcv(strong, +mv.man[1]) : A.ps.find((p) => p.id === mv.man || p.role === mv.man); manOn(id, t); d.rush = false; }
      if (mv.spy) { d.drop = [0, 5]; d.job = 'spy'; }
      if (mv.at) d.at = mv.at;
    }
    for (const d of out) if (d.blitz && !d.rushPath) { d.rushPath = rushTo(d.at[0], d.at[0]); d.job = 'blitz'; }

    // ── Disguise: pre-snap shell of another coverage, rotate at the snap ──
    if (L.disguise && L.disguise !== cov) {
      const pre = build(play, Object.assign({}, look, { coverage: L.disguise, disguise: null, moves: null }), ballX).defenders;
      for (const d of out) {
        const p = pre.find((q) => q.id === d.id);
        if (p && Math.hypot(p.at[0] - d.at[0], p.at[1] - d.at[1]) > 0.8) d.pre = p.at;
      }
    }
    return { look: L, defenders: out, pkg, label: PACKAGE_LABEL[pkg] };
  }

  function keyOf(defenders, key) {
    if (!key) return null;
    return defenders.find((d) => d.job === key) || defenders.find((d) => d.job === `${key}_ps`) || defenders.find((d) => d.id === key) || null;
  }

  FD.Defense = { build, keyOf, techX, PACKAGE_LABEL };
})(window.FD);

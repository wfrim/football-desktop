/*
 * align.js — a legal, recognisable defense for any play, generated from the
 * offense's actual alignment (so every current and future play gets one).
 *
 *   look = { coverage: 'cover1'|'cover2'|'cover3'|'cover4',
 *            front: { play: [3, 5], back: [1, 5] },   // techniques, centre → out
 *            key: 'flat' }                            // job the concept attacks
 *
 * Personnel: 3+ receivers → nickel (4 DL, 2 LB, 5 DB); otherwise base 4-3.
 * Every defender gets a `job` (flat_ps, hook_bs, deep_middle, end_bs …): "ps" /
 * "bs" are relative to the play's side, so a concept can name its key.
 *
 * Coordinates: data space, ball-relative yards (+y downfield = the defense's
 * side). Zone landmarks are FIELD-relative (thirds, hashes) and converted with
 * `ballX`, so a ball on the hash shifts the shell like a real one.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const DEPTH = { cover1: 1.6, cover2: 5, cover3: 7, cover4: 8 };
  const DL_Y = 0.95;

  // Zone landmarks, field-relative x (sideline-to-sideline), y = depth.
  const LANDMARK = {
    third: (s) => [s * 17.5, 17], middle: () => [0, 17.5], half: (s) => [s * 12, 18],
    out_q: (s) => [s * 18.5, 16.5], in_q: (s) => [s * 7, 16.5],
    flat: (s) => [s * 15, 5], curl: (s) => [s * 10.5, 8.5], hook: (s) => [s * 5, 9], rat: () => [0, 8],
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

  /** x of an inline TE on side s (or null). */
  function inlineTE(tes, tackleX, s) {
    const te = tes.find((p) => Math.sign(p.at[0]) === s && Math.abs(p.at[0] - tackleX) < 2);
    return te ? te.at[0] : null;
  }

  /** Technique → x for side s (+1 right / -1 left), from real line positions. */
  function techX(tech, s, X) {
    const G = X.guard(s);
    const T = X.tackle(s);
    const TE = X.te(s);
    switch (String(tech)) {
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
      default: return T + s * 0.6;
    }
  }

  function build(play, look, ballX) {
    const { A, ol, tes } = analyze(play);
    const ps = play.side === 'left' ? -1 : 1;
    const run = play.family === 'run';
    const L = Object.assign({}, run ? DEFAULTS.run : DEFAULTS.pass, look || {});
    const front = L.front || DEFAULTS.run.front;
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

    // ── Front: 4 down linemen by technique (play side / back side) ────────
    for (const [s, techs] of [[ps, front.play || [3, 5]], [-ps, front.back || [1, 5]]]) {
      techs.forEach((t, i) => {
        const outer = i === techs.length - 1;
        const x = techX(t, s, X);
        add(`${outer ? 'E' : 'T'}_${side(s)}`, 'dl', [x, DL_Y], `${outer ? 'end' : 'tackle'}_${side(s)}`, { rush: true });
      });
    }

    // ── Receivers and strength (for the secondary) ────────────────────────
    const R = { 1: A.onSide(1), [-1]: A.onSide(-1) };
    const strong = R[1].length !== R[-1].length ? Math.sign(R[1].length - R[-1].length) : (tes.length ? Math.sign(tes[0].at[0]) || 1 : ps);
    const weak = -strong;
    const numWR = A.receivers.length;
    const nickel = numWR >= 3;
    const rcv = (s, n) => (R[s][n - 1] || null);
    const apexX = (s) => {
      const two = rcv(s, 2);
      const T = X.tackle(s);
      return two ? (two.at[0] + T) / 2 : T + s * 3.5;
    };
    const cov = L.coverage;
    const cbDepth = DEPTH[cov] || 7;

    // Corners over #1 (slight outside leverage; press in man).
    for (const s of [strong, weak]) {
      const one = rcv(s, 1);
      const x = one ? one.at[0] + s * (cov === 'cover1' ? 0.3 : 0.9) : s * 14;
      add(`CB_${side(s)}`, 'db', [x, cbDepth], 'corner_' + side(s), { man: cov === 'cover1' && one ? one.id : null });
    }

    // Safeties.
    const twoHigh = cov === 'cover2' || cov === 'cover4';
    if (twoHigh) {
      for (const s of [strong, weak]) add(s === strong ? 'SS' : 'FS', 'db', fieldToBall([s * (cov === 'cover4' ? 8 : 9.5), cov === 'cover4' ? 11 : 12.5]), 'safety_' + side(s));
    } else {
      add('FS', 'db', fieldToBall([0, 13]), 'deep_middle');
      add('SS', 'db', [apexX(weak), 6], 'apex_' + side(weak));
    }

    // Second level: nickel (NB + 2 LB) or base (3 LB).
    if (nickel) {
      add('NB', 'db', [apexX(strong), 5], 'apex_' + side(strong));
      add('MIKE', 'lb', [X.guard(strong) + strong * 0.7, 4.6], 'lb_' + side(strong));
      add('WILL', 'lb', [X.guard(weak) + weak * 0.7, 4.6], 'lb_' + side(weak));
    } else {
      const te = X.te(strong);
      add('SAM', 'lb', [te !== null ? te + strong * 1.2 : X.tackle(strong) + strong * 2.6, 4.2], 'lb_' + side(strong));
      add('MIKE', 'lb', [X.C + strong * 0.4, 4.8], 'lb_middle');
      add('WILL', 'lb', [X.guard(weak) + weak * 1.0, 4.6], 'lb_' + side(weak));
    }

    // ── Post-snap: zone drops, man leverage, or run fits ───────────────────
    const by = (id) => out.find((d) => d.id === id);
    const drop = (id, name, s, job) => {
      const d = by(id);
      if (!d) return;
      d.drop = fieldToBall(LANDMARK[name](s || 1));
      d.job = job || (name === 'middle' || name === 'rat' ? `deep_${name}` : `${name}_${side(s || 1)}`);
    };
    const cb = (s) => `CB_${side(s)}`;
    const under = nickel ? ['NB', 'MIKE', 'WILL', 'SS'] : ['SAM', 'MIKE', 'WILL', 'SS'];

    if (run) {
      // Run fits: second level steps toward the play-side gaps; no drops.
      for (const d of out) {
        if (d.glyph === 'lb' || d.id === 'NB' || (d.id === 'SS' && !twoHigh)) {
          d.fit = [d.at[0] + ps * 1.4, d.at[1] - 1.4];
        }
      }
    } else if (cov === 'cover3') {
      drop(cb(strong), 'third', strong); drop(cb(weak), 'third', weak); drop('FS', 'middle', 0, 'deep_middle');
      drop(under[0], 'flat', strong); drop(under[1], 'hook', strong); drop(under[2], 'hook', weak); drop(under[3], 'flat', weak);
    } else if (cov === 'cover2') {
      drop(cb(strong), 'flat', strong); drop(cb(weak), 'flat', weak);
      drop('SS', 'half', strong); drop('FS', 'half', weak);
      drop(under[0], 'curl', strong); drop(under[1], 'hook', 0.001 * strong, 'hook_middle'); drop(under[2], 'curl', weak);
    } else if (cov === 'cover4') {
      drop(cb(strong), 'out_q', strong); drop(cb(weak), 'out_q', weak);
      drop('SS', 'in_q', strong); drop('FS', 'in_q', weak);
      drop(under[0], 'flat', strong); drop(under[1], 'hook', strong); drop(under[2], 'curl', weak);
    } else if (cov === 'cover1') {
      drop('FS', 'middle', 0, 'deep_middle');
      const two = rcv(strong, 2) || rcv(strong, 3);
      const twoW = rcv(weak, 2) || tes.find((t) => Math.sign(t.at[0]) === weak) || null;
      const back = A.backs[0] || null;
      const man = (id, target) => { const d = by(id); if (d && target) { d.man = target.id; d.job = `man_${target.id}`; } };
      man(under[0], two);
      man('SS', twoW);
      man(under[2], back);
      drop(under[1], 'rat', 0, 'deep_rat');
    }
    return { look: L, defenders: out };
  }

  /** The defender a key names: exact job, or job on the play side ("flat" → "flat_ps"). */
  function keyOf(defenders, key) {
    if (!key) return null;
    return defenders.find((d) => d.job === key) || defenders.find((d) => d.job === `${key}_ps`) || defenders.find((d) => d.id === key) || null;
  }

  FD.Defense = { build, keyOf, techX };
})(window.FD);

/*
 * sim.js — Live styles: a small, deterministic 22-player football simulation,
 * computed ONCE per play at build time (0.1 s steps) and played back by the
 * timeline. No per-frame physics.
 *
 *   Line play   blockers run their authored paths until they meet the defender
 *               pairing.js gave them, then latch: the pair moves as one (drive
 *               block / pocket) until the defender sheds (hold time: long when
 *               Cooperative, seeded by the matchup when Competitive).
 *   Coverage    man defenders trail their receiver; zone defenders drop to a
 *               landmark, match the nearest receiver entering it, and break on
 *               the ball once it's thrown. Rushers take their lanes to the QB.
 *   QB          Cooperative: the designed throw. Competitive: works the
 *               progression (play.reads) and throws to the first receiver open
 *               at the catch point; else throws it away or is sacked.
 *   Ball        after the catch / carry the carrier turns upfield and runs,
 *               bending away from defenders; free defenders take pursuit angles.
 *
 *   Live offense  the offense "wins": no tackles, defenders chase a step slow.
 *   Live game     outcomes come from the simulation (complete, broken up,
 *                 intercepted, sack, tackle, touchdown).
 *
 * Everything is SVG space (yards, y grows toward the offense's backfield).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const G = FD.Geometry;
  const DT = 0.1;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const OL = /^(LT|LG|C|RG|RT)$/;
  const DEEP = /^(deep_|half_|third_|out_q|in_q)/;
  const CONTACT = 0.95; // carrier marker + defender glyph: touching
  const SHADOW = 1.45;  // how close a defender who may not tackle yet gets

  /** Position of an offensive player (scene player) at clock time t, on his authored paths. */
  function playerPos(pl, t, toSvg) {
    let pos = toSvg(pl.align);
    for (const a of pl.assignments) {
      if (t < a.start) break;
      const raw = clamp01((t - a.start) / (a.duration || 1));
      const e = (FD.Ease[a.ease] || FD.Ease.linear)(raw);
      pos = a.measure.at(e).point;
    }
    return pos;
  }

  /** Deterministic 0..1 from a string (competitive outcomes stay stable per play). */
  function hash01(s) {
    let h = 2166136261 >>> 0;
    for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return (h % 10007) / 10007;
  }

  /**
   * o: { scene, defenders (align.js output), toSvg, fromData, game, call, pursuit,
   *      event: { t, point, dir, carrierId, kind: 'catch'|'carry', carrier },
   *      exchangeT, topY, goalY, endT, seed }
   * Returns { tracks, otracks, yac, outcome, pass, latches, event }.
   */
  function simulate(o) {
    const P = FD.Timing.phases;
    const game = !!o.game;
    const coop = o.call !== 'comp';
    const rnd = (k) => hash01(`${o.seed}:${k}`);
    const aggressive = o.pursuit === 'aggressive';
    const vDef = aggressive ? 7.4 : 6.8;
    const vRun = 6.8;
    const snap = P.snap;
    const scene = o.scene;
    const ev0 = o.event;
    const passPlay = ev0.kind === 'catch';
    const toS = (q) => o.toSvg(o.fromData(q));
    const flightFor = (a, b) => Math.max(0.38, Math.min(0.9, 0.3 + G.dist(a, b) / 30));

    // ── Defense state ───────────────────────────────────────────────────────
    const D = o.defenders.map((d) => {
      const at = toS(d.at);
      const rushes = passPlay && !d.drop && !d.man && (d.rushPath || d.glyph === 'dl' || (d.edge && d.rush));
      let rushPath = d.rushPath ? d.rushPath.map(toS) : null;
      if (rushes && !rushPath) {
        const lane = d.at[0] + Math.sign(d.at[0] || 1) * 0.3;
        rushPath = [toS([lane, -0.6]), toS([lane * 0.55, -3.1])];
      }
      return {
        d, pos: at.slice(), track: [[snap, at[0], at[1]]],
        rusher: !!rushes, rushPath, rushI: 0,
        drop: d.drop ? toS(d.drop) : null, dropped: false,
        fit: d.fit ? toS(d.fit) : null,
        heldBy: [], release: -1, shedFrom: null, blitz: !!d.rushPath && d.glyph !== 'dl',
      };
    });

    // ── Offense state ───────────────────────────────────────────────────────
    const O = [];
    for (const [id, pl] of scene.players) {
      const pos = playerPos(pl, snap, o.toSvg);
      O.push({ id, pl, role: pl.data.role, pos, track: [[snap, pos[0], pos[1]]], latch: null, done: new Set(), trail: null,
        routeEnd: Math.max(0, ...pl.assignments.filter((a) => a.kind === 'route' && !a.yac).map((a) => a.start + a.duration)) });
    }
    const byOff = new Map(O.map((b) => [b.id, b]));
    // The passer: the QB, or whoever throws at the end of a trick play's ball chain.
    const qb = (ev0.thrower && O.find((b) => b.id === ev0.thrower)) || O.find((b) => b.role === 'QB') || null;
    const { pairs, unblocked } = FD.LivePairing.pair(scene, D);
    const latches = [];

    const step = (x, target, v) => {
      const dv = G.sub(target, x.pos);
      const dist = Math.hypot(dv[0], dv[1]);
      const m = Math.min(dist, v * DT);
      if (dist > 1e-6) x.pos = G.add(x.pos, G.mul(dv, m / dist));
    };
    const isFree = (x, t) => !x.heldBy.length && t >= x.release;
    const coverage = () => D.filter((x) => !x.rusher && !x.heldBy.length);
    const nearestCover = (pt) => {
      let best = null;
      let bd = Infinity;
      for (const x of D) {
        if (x.rusher) continue;
        const d = G.dist(x.pos, pt);
        if (d < bd) { bd = d; best = x; }
      }
      return { x: best, sep: bd };
    };

    // ── Ball state ──────────────────────────────────────────────────────────
    let phase = 'pre';                 // pre → air → yac → dead
    let thrown = null;                 // { to, point, release, releaseT, arrive, away }
    let carrier = null;                // offense state with the ball after the event
    let event = null;
    const outcome = { type: 'complete', gain: 0, point: ev0.point, by: null, why: {} };
    const designed = passPlay ? ev0.carrierId : null;
    const reads = passPlay ? (scene.play.reads || []).map((r) => (typeof r === 'string' ? r : r.player)).filter((id) => byOff.has(id)) : [];
    if (passPlay && !reads.includes(designed)) reads.unshift(designed);
    let readI = 0;
    let hotCall = null; // under pressure: does this QB get it out? (decided once)
    const readT = (i) => {
      if (reads[i] === designed) return ev0.t - flightFor(qb ? qb.pos : ev0.point, ev0.point);
      return Math.max(snap + 0.9, P.read - 0.3) + i * 0.55;
    };
    let deadT = null;
    let curT = snap;

    // Run-after-catch steering state.
    let dir = null;
    let k = 0;
    let travelled = 0;
    const pts = [];
    const tpts = []; // time of each run-after-catch point (the line draws in step with the runner)
    const budget = 4 + Math.floor(rnd('yac') * 9);
    const coopStop = game && coop;

    const throwTo = (id, t, pt) => {
      const release = qb ? qb.pos.slice() : pt;
      thrown = { to: id, point: pt, release, releaseT: t, arrive: t + flightFor(release, pt) };
      phase = 'air';
    };

    let t = snap;
    for (; t < o.endT; t += DT) {
      const tn = t + DT;
      for (const x of D) x.prev = x.pos.slice();
      for (const b of O) b.prev = b.pos.slice();

      // ── The QB's decision (pass plays) ────────────────────────────────────
      if (passPlay && phase === 'pre' && qb) {
        const hot = game && !coop && D.some((x) => x.rusher && isFree(x, tn) && G.dist(x.pos, qb.pos) < 2.4);
        if (coop || !game || ev0.screen || scene.play.family === 'screen') {
          // Designed throw (screens are thrown over the rush, on time).
          if (tn >= ev0.t - flightFor(qb.pos, ev0.point)) throwTo(designed, t, ev0.point);
        } else if (hot && (hotCall === null ? (hotCall = rnd('hot') < 0.6) : hotCall)) {
          // Pressure: get it out to whoever is most open right now, or throw it away.
          let best = null;
          let bs = -1;
          for (const id of reads) {
            const r = byOff.get(id);
            const { sep } = nearestCover(r.pos);
            if (sep > bs) { bs = sep; best = r; }
          }
          if (best && bs >= 1.2) { throwTo(best.id, t, playerPos(best.pl, t + flightFor(qb.pos, best.pos), o.toSvg)); outcome.why.hot = true; }
          else { const side = Math.sign(qb.pos[0] - scene.ballX) || 1; throwTo(null, t, [scene.ballX + side * 27, qb.pos[1] - 10]); thrown.away = true; outcome.why.hot = true; }
        } else if (coop || !game) {
          if (tn >= ev0.t - flightFor(qb.pos, ev0.point)) throwTo(designed, t, ev0.point);
        } else if (readI < reads.length && tn >= readT(readI)) {
          const id = reads[readI];
          const r = byOff.get(id);
          const fl = flightFor(qb.pos, r.pos);
          const pt = id === designed ? ev0.point : playerPos(r.pl, t + fl, o.toSvg);
          // Where will the nearest cover player be when the ball gets there?
          let sep = Infinity;
          for (const x of coverage()) {
            const reach = Math.max(0, fl - 0.3) * vDef;
            sep = Math.min(sep, Math.max(0, G.dist(x.pos, pt) - reach * 0.55));
          }
          const need = 1.35 + (rnd(`read${readI}`) - 0.5) * 1.4;
          if (sep >= need || (readI === reads.length - 1 && sep >= 0.9 && rnd('last') < 0.7)) {
            throwTo(id, t, pt);
            outcome.why.read = readI;
          }
          readI += 1;
        } else if (readI >= reads.length && tn >= readT(reads.length - 1) + 0.6) {
          // Nobody open: throw it away (unless the rush gets there first).
          const pressure = D.some((x) => x.rusher && isFree(x, t) && G.dist(x.pos, qb.pos) < 3.5);
          if (!pressure || rnd('hang') < 0.4) {
            const side = Math.sign(qb.pos[0] - scene.ballX) || 1;
            throwTo(null, t, [scene.ballX + side * 27, qb.pos[1] - 12]);
            thrown.away = true;
          }
        }
      }

      // ── Offense ───────────────────────────────────────────────────────────
      for (const b of O) {
        if (b === carrier && phase === 'yac') continue; // steered below
        if (phase === 'dead') continue;
        const cur = b.pl.assignments.filter((a) => a.start <= tn && pairs.has(a)).pop() || null;
        // A new block assignment (combo → climb) ends the old latch.
        if (b.latch && b.latch.a !== cur) unlatch(b, tn, false);
        if (b.latch) continue; // moved with its pair below
        if (cur && !b.done.has(cur)) {
          const x = pairs.get(cur);
          const plan = playerPos(b.pl, tn, o.toSvg);
          const planEnd = cur.start + cur.duration;
          const gap = G.dist(b.pos, x.pos);
          if (x.shedFrom && !x.heldBy.length) b.pos = plan; // already beaten by someone else: stay on the path
          else if (gap < 1.15 && tn >= cur.start + 0.05) latch(b, cur, x, tn);
          else if (tn < planEnd && gap < 2.4 && tn > cur.start + 0.2 && !FD.LivePairing.isPassPro(cur)) step(b, x.pos, cur.kind === 'block' ? 4.2 : 6.0); // work up to him
          else if (tn < planEnd) b.pos = plan;
          else if (tn < planEnd + 1.6) step(b, x.pos, cur.kind === 'pull' ? 6.2 : cur.kind === 'lead' ? 6.0 : 5.2);
          else b.done.add(cur);
        } else if (b.trail) {
          const x = b.trail;
          if (G.dist(b.pos, x.pos) > 1.2) step(b, x.pos, 3.2);
        } else if (phase === 'yac' && b.role !== 'QB' && !OL.test(b.role) && b.routeEnd > 0 && tn > b.routeEnd + 0.2 && carrier) {
          // Convoy: finished receivers work toward the ball carrier's lane.
          const c = carrier.pos;
          const threat = D.filter((x) => isFree(x, tn)).sort((p, q) => G.dist(p.pos, c) - G.dist(q.pos, c))[0];
          const aim = threat ? G.add(c, G.mul(norm(G.sub(threat.pos, c)), 1.8)) : c;
          if (G.dist(b.pos, c) < 14) step(b, aim, 4.6);
        } else if (!(phase === 'yac' && b === carrier)) {
          b.pos = playerPos(b.pl, tn, o.toSvg);
        }
      }
      // Latched pairs move as one.
      for (const b of O) {
        const L = b.latch;
        if (!L || phase === 'dead') continue;
        const x = L.x;
        if (tn > L.t0 + L.hold) { unlatch(b, tn, true); continue; }
        if (x.heldBy[0] !== b) {
          // Second man on a double team: shoulder to shoulder beside the first.
          const perp = [-L.dir[1], L.dir[0]];
          const sg = Math.sign((b.pos[0] - x.pos[0]) * perp[0] + (b.pos[1] - x.pos[1]) * perp[1]) || 1;
          step(b, G.add(G.sub(x.pos, G.mul(L.dir, 0.55)), G.mul(perp, 0.6 * sg)), 3);
          continue;
        }
        let dirNow = L.dir;
        if (L.pro && qb) dirNow = norm(G.sub(x.pos, qb.pos)); // pass pro: stay between rusher and QB
        const contact = G.add(G.lerp(b.pos, x.pos, 0.5), G.mul(dirNow, L.push * DT));
        b.pos = G.sub(contact, G.mul(dirNow, 0.45));
        x.pos = G.add(contact, G.mul(dirNow, 0.45));
      }

      // ── Ball in the air → arrives ───────────────────────────────────────
      if (phase === 'air' && tn >= thrown.arrive) {
        const pt = thrown.point;
        const { x: cov, sep } = nearestCover(pt);
        const r = rnd('catch');
        let result = 'complete';
        if (thrown.away) result = 'away';
        // Only a defender who can get a hand on the ball can break it up; open = caught.
        else if (!game || coop) result = sep > 0.8 || r < 0.85 ? 'complete' : 'pbu';
        else if (sep < 1.2) result = r < 0.1 ? 'int' : r < 0.55 ? 'pbu' : 'complete';
        else if (sep < 1.8) result = r < 0.15 ? 'pbu' : 'complete';
        outcome.sep = sep;
        outcome.why.cover = cov ? { id: cov.d.id, job: cov.d.job, sep } : null;
        outcome.why.target = thrown.to;
        if ((result === 'pbu' || result === 'int') && cov) {
          // He gets there: hand on the ball at the catch point.
          const v = G.sub(cov.pos, pt);
          const d = Math.hypot(v[0], v[1]) || 1;
          cov.pos = G.add(pt, G.mul(v, Math.min(d, result === 'int' ? 0.3 : 0.75) / d));
          cov.track[cov.track.length - 1] = [tn, cov.pos[0], cov.pos[1]];
        }
        if (result !== 'complete') {
          outcome.type = result === 'int' ? 'interception' : 'incomplete';
          outcome.why.result = result;
          outcome.by = cov ? cov.d.id : null;
          outcome.point = pt.slice();
          phase = 'dead';
          deadT = tn;
        } else {
          carrier = byOff.get(thrown.to);
          carrier.pos = pt.slice();
          event = { t: tn, point: pt.slice(), dir: norm(G.sub(pt, playerPos(carrier.pl, tn - 0.25, o.toSvg))), carrierId: carrier.id, kind: 'catch' };
          tpts[0] = tn;
          startYac();
        }
      }
      // Run plays: the designed carry hands over to the simulation.
      if (!passPlay && phase === 'pre' && tn >= ev0.t) {
        carrier = byOff.get(ev0.carrierId);
        if (carrier) {
          carrier.pos = ev0.point.slice();
          event = Object.assign({}, ev0, { t: tn });
          startYac();
        }
      }

      // ── Ball carrier after the catch / line ─────────────────────────────
      curT = tn;
      // (On the hand-over step he is exactly at the event point; he runs from the next.)
      if (phase === 'yac' && event.t < tn - 1e-6) steerCarrier();

      // ── Defense ───────────────────────────────────────────────────────────
      for (const x of D) {
        if (x.heldBy.length && phase !== 'dead') { x.track.push([tn, x.pos[0], x.pos[1]]); continue; }
        if (phase === 'dead') {
          // Whistle: everyone eases toward the ball, stopping when they reach the pile.
          if (outcome.point && tn < deadT + 1 && G.dist(x.pos, outcome.point) > CONTACT * 1.2) step(x, outcome.point, 2.2 * (1 - (tn - deadT)));
        } else if (phase === 'yac' && tn >= Math.max(x.release, event.t + (x.d.glyph === 'db' ? 0.35 : 0.2))) {
          // Pursuit angle: aim where the carrier will be when we get there.
          const d = G.dist(x.pos, carrier.pos);
          let v = vDef * (x.d.glyph === 'db' ? 1.08 : 1);
          if (coopStop && travelled >= budget) v *= 1.7;
          if (!game) v *= 0.85;
          const tau = Math.min(1.2, d / v);
          step(x, G.add(carrier.pos, G.mul(dir, vRun * tau)), v);
        } else if (phase === 'air' && !x.rusher && tn >= thrown.releaseT + 0.25 + G.dist(x.pos, thrown.point) * 0.02 && G.dist(x.pos, thrown.point) < 15) {
          step(x, thrown.point, vDef * 1.02); // break on the ball
        } else {
          defend(x, tn);
        }
        // Nobody overlaps the ball carrier: a defender who may not make the
        // stop yet shadows him at arm's length instead of running through him.
        const bc = ballCarrier(tn);
        if (bc && !x.heldBy.length && phase !== 'dead' && !mayTackle(x, tn)) {
          const d = G.dist(x.pos, bc.pos);
          if (d < SHADOW || touchAt(bc, x) !== null) {
            // Stay on the side he was on at the start of the step (never cross through him).
            const side = G.sub(x.prev || x.pos, bc.prev || bc.pos);
            const l = Math.hypot(side[0], side[1]);
            x.pos = G.add(bc.pos, G.mul(l > 1e-6 ? G.mul(side, 1 / l) : [0, -1], SHADOW));
          }
        }
        x.track.push([tn, x.pos[0], x.pos[1]]);
      }

      // ── Contact: when the ball carrier touches a defender, it resolves ────
      // (tackle, broken tackle, or he slides off a blocked man) — never a pass-through.
      if ((phase === 'yac' || phase === 'pre') && !passPlayPre()) {
        const bc = ballCarrier(tn);
        const tk = bc ? contact(bc, tn) : null;
        if (tk) {
          if (phase === 'pre') {
            carrier = bc;
            event = { t: tn, point: bc.pos.slice(), dir: [0, -1], carrierId: bc.id, kind: 'carry', stuffed: true };
          } else {
            // Falls forward a half step if he was hit from the side or behind.
            const ahead = G.sub(tk.pos, carrier.pos);
            if (dir && dir[1] < 0 && ahead[0] * dir[0] + ahead[1] * dir[1] < 0.2) {
              // …and the tackler goes down with him.
              const fwd = G.mul(dir, 0.35);
              carrier.pos = G.add(carrier.pos, fwd);
              tk.pos = G.add(tk.pos, fwd);
              tk.track[tk.track.length - 1] = [tn, tk.pos[0], tk.pos[1]];
              pts[pts.length - 1] = carrier.pos.slice();
            }
          }
          phase = 'dead';
          deadT = tn;
          outcome.type = 'tackle';
          outcome.by = tk.d.id;
          outcome.point = bc.pos.slice();
          outcome.why.tackler = { id: tk.d.id, job: tk.d.job, unblocked: !tk.shedFrom && !tk.releasedBy && !tk.heldBy.length, shedFrom: tk.shedFrom || tk.releasedBy || (tk.heldBy[0] && tk.heldBy[0].id), backfield: !event || event.stuffed || bc.pos[1] > -0.5 };
        }
      }

      // ── Whistles: sack, touchdown, sideline ───────────────────────────────
      if (phase === 'pre' && passPlay && qb && game && !coop && scene.play.family !== 'screen' && !ev0.screen) {
        const sacker = D.find((x) => x.rusher && isFree(x, tn) && G.dist(x.pos, qb.pos) < 0.95);
        if (sacker) {
          phase = 'dead';
          deadT = tn;
          outcome.type = 'sack';
          outcome.by = sacker.d.id;
          outcome.point = qb.pos.slice();
          outcome.why.rusher = { id: sacker.d.id, job: sacker.d.job, unblocked: !sacker.shedFrom && !sacker.releasedBy, shedFrom: sacker.shedFrom || sacker.releasedBy, blitz: sacker.blitz };
        }
      }
      if (phase === 'yac') {
        const scored = o.goalY !== null && o.goalY !== undefined && carrier.pos[1] <= o.goalY;
        const oob = o.extended && Math.abs(carrier.pos[0]) >= 25;
        if (scored || oob || (!o.extended && carrier.pos[1] <= o.topY + 1) || k >= (o.extended ? 120 : 70)) {
          outcome.type = scored ? 'score' : event.kind === 'catch' ? 'complete' : 'run';
          if (oob && !scored) outcome.why.oob = true;
          outcome.point = carrier.pos.slice();
          phase = 'dead';
          deadT = tn;
        }
      }
      for (const b of O) b.track.push([tn, b.pos[0], b.pos[1]]);
      if (phase === 'dead' && tn > deadT + 1.0) break;
    }

    // Outcome bookkeeping.
    if (phase !== 'dead') {
      outcome.type = !event ? (passPlay ? 'incomplete' : 'run') : event.kind === 'catch' ? 'complete' : 'run';
      if (carrier) outcome.point = carrier.pos.slice();
    }
    outcome.gain = outcome.point ? Math.round(-outcome.point[1]) : 0;
    outcome.t = deadT !== null ? deadT : t;
    outcome.event = event;
    if (outcome.type === 'incomplete' || outcome.type === 'interception') outcome.gain = 0;
    const tracks = new Map(D.map((x) => [x.d.id, x.track]));
    const otracks = new Map(O.map((b) => [b.id, b.track]));
    const yac = event && pts.length > 1 ? { pts: pts.slice(), times: tpts.slice(), t0: event.t, t1: deadT !== null ? deadT : t } : null;
    return { tracks, otracks, yac, outcome, pass: thrown, latches, event, unblocked: unblocked.map((x) => x.d.id),
      pairs: Array.from(pairs).map(([a, x]) => [a.player, x.d.id]) };

    // ── helpers (hoisted) ───────────────────────────────────────────────────
    function passPlayPre() { return passPlay && phase === 'pre'; }
    /** Who has the ball and is running with it right now (null while the QB holds it / in the air). */
    function ballCarrier(tn) {
      if (phase === 'yac') return carrier;
      if (phase === 'pre' && !passPlay && o.exchangeT !== undefined && tn > o.exchangeT + 0.05) return byOff.get(ev0.carrierId) || null;
      return null;
    }
    /** May this defender bring the carrier down right now? */
    function mayTackle(x, tn) {
      if (!game) return false;                                   // Live offense: the offense wins
      if (phase === 'pre' && coop) return false;                 // Cooperative: the play gets past the line
      if (phase === 'yac' && coop && travelled < budget * 0.8) return false; // …and gains its yards first
      if (x.stunnedUntil && tn < x.stunnedUntil) return false;   // just bounced off
      return true;
    }
    /**
     * The carrier and a defender are touching (marker + glyph). Free defender →
     * tackle attempt (Competitive: sometimes broken — the carrier bounces off and
     * the defender is knocked back). Blocked defender → an arm tackle now and then,
     * otherwise the carrier slides off him. Returns the tackler or null.
     */
    /**
     * Swept contact: did c and x touch at any moment of this step (not just at
     * its end)? Players close ~1.4 yd a step head-on, more than a contact
     * width, so checking end positions alone lets them pass through each other.
     * Returns the first touching fraction u of the step, or null.
     */
    function touchAt(c, x) {
      const r0 = G.sub(c.prev || c.pos, x.prev || x.pos);
      const r1 = G.sub(c.pos, x.pos);
      if (Math.hypot(r0[0], r0[1]) < CONTACT) return 0;
      const dv = G.sub(r1, r0);
      const a = dv[0] * dv[0] + dv[1] * dv[1];
      if (a < 1e-9) return null;
      const b = 2 * (r0[0] * dv[0] + r0[1] * dv[1]);
      const cc = r0[0] * r0[0] + r0[1] * r0[1] - CONTACT * CONTACT;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return null;
      const u = (-b - Math.sqrt(disc)) / (2 * a);
      return u >= 0 && u <= 1 ? u : null;
    }
    function contact(c, tn) {
      const tk = contactRaw(c, tn);
      if (tk) {
        // The tackle is made at arm's length: touching, not on top of him.
        const v = G.sub(tk.pos, c.pos);
        const l = Math.hypot(v[0], v[1]);
        if (l < CONTACT * 0.98) {
          tk.pos = G.add(c.pos, G.mul(l > 1e-6 ? G.mul(v, 1 / l) : [0, -1], CONTACT * 0.98));
          tk.track[tk.track.length - 1] = [tn, tk.pos[0], tk.pos[1]];
        }
      }
      return tk;
    }
    function contactRaw(c, tn) {
      // A few passes: sliding off one man can put him on another (a crowd).
      for (let pass = 0; pass < 4; pass++) {
        const hits = pass === 0 ? D.map((x) => [x, touchAt(c, x)]).filter((q) => q[1] !== null).sort((a, b) => a[1] - b[1])
          : D.filter((x) => G.dist(x.pos, c.pos) < CONTACT * 0.99).map((x) => [x, 0]);
        if (!hits.length) break;
        const tk = resolve(c, tn, hits);
        if (tk) return tk;
      }
      // Still overlapping after the passes: he's wedged between defenders with
      // nowhere to slide. In a live game that's a wrap-up; in Live offense they give way.
      const wedged = D.filter((x) => G.dist(x.pos, c.pos) < CONTACT * 0.9).sort((a, b) => G.dist(a.pos, c.pos) - G.dist(b.pos, c.pos));
      if (wedged.length) {
        if (game && phase === 'yac') return wedged[0];
        for (const x of wedged) {
          const v = G.sub(x.pos, c.pos);
          const l = Math.hypot(v[0], v[1]) || 1;
          const shift = G.sub(G.add(c.pos, G.mul(v, CONTACT / l)), x.pos);
          x.pos = G.add(x.pos, shift);
          for (const b of x.heldBy) b.pos = G.add(b.pos, shift);
          x.track[x.track.length - 1] = [tn, x.pos[0], x.pos[1]];
        }
      }
      return null;
    }
    function resolve(c, tn, hits) {
      for (const [x, u] of hits) {
        // Put both where they met (the carrier only once he's off his designed path).
        if (u > 0) {
          x.pos = G.lerp(x.prev, x.pos, u);
          if (phase === 'yac') c.pos = G.lerp(c.prev, c.pos, u);
          x.track[x.track.length - 1] = [tn, x.pos[0], x.pos[1]];
          if (phase === 'yac' && pts.length) pts[pts.length - 1] = c.pos.slice();
        }
        let d = G.dist(x.pos, c.pos); // re-measured: an earlier bounce may have moved him
        if (d >= CONTACT * 1.01) continue;
        if (d < 1e-6) d = 1e-6;
        const away = G.mul(G.sub(c.pos, x.pos), 1 / d);
        const held = x.heldBy.length > 0;
        const tries = mayTackle(x, tn) && (!held || (!coop && rnd(`arm:${x.d.id}:${Math.round(tn * 2)}`) < 0.1));
        if (tries) {
          const pMiss = coop || !game ? 0 : held ? 0.6 : phase === 'pre' ? 0.35 : x.d.glyph === 'db' ? 0.3 : 0.25;
          if (rnd(`miss:${x.d.id}:${Math.round(tn * 10)}`) >= pMiss) return x;
          // Broken tackle: both bounce apart; he's out of the play for a beat.
          outcome.why.broken = (outcome.why.broken || 0) + 1;
          x.stunnedUntil = tn + 0.9;
          if (!held) {
            x.pos = G.sub(x.pos, G.mul(away, 0.7));
            x.track[x.track.length - 1] = [tn, x.pos[0], x.pos[1]];
          }
        }
        // No tackle: the carrier slides off (he can't if he's still on his
        // designed path behind the line — then the defender gives ground).
        if (phase === 'yac') {
          c.pos = G.add(x.pos, G.mul(away, CONTACT));
          if (pts.length) { pts[pts.length - 1] = c.pos.slice(); }
        } else {
          // Behind the line he's on his designed path: the defender (and his blocker) give ground.
          const shift = G.sub(G.sub(c.pos, G.mul(away, CONTACT)), x.pos);
          x.pos = G.add(x.pos, shift);
          for (const b of x.heldBy) b.pos = G.add(b.pos, shift);
          x.track[x.track.length - 1] = [tn, x.pos[0], x.pos[1]];
        }
      }
      return null;
    }
    function latch(b, a, x, tn) {
      const pro = FD.LivePairing.isPassPro(a);
      const kind = pro ? 'pro' : a.spec.type === 'doubleTeam' ? 'double' : a.kind;
      const base = { pro: 2.6, double: 2.8, block: 1.6, pull: 1.5, lead: 1.3 }[kind] || 1.8;
      const hold = (coop || !game) ? 6 : base * (0.55 + 0.9 * rnd(`hold:${b.id}:${x.d.id}`)) * (aggressive ? 0.8 : 1);
      const e = G.endPoint(a.path);
      const s = a.measure.at(0).point;
      let d = norm(G.sub(e, s));
      if (pro || Math.hypot(e[0] - s[0], e[1] - s[1]) < 0.3) d = norm(G.sub(x.pos, b.pos));
      const push = pro ? -0.4 : (coop || !game) ? 0.9 : (rnd(`push:${b.id}`) - 0.35) * 1.6;
      b.latch = { a, x, t0: tn, hold, dir: d, push, pro };
      x.heldBy.push(b);
      latches.push({ blockerId: b.id, a, defId: x.d.id, t: tn, at: b.pos.slice() });
    }
    function unlatch(b, tn, shed) {
      const L = b.latch;
      b.latch = null;
      b.done.add(L.a);
      L.x.heldBy = L.x.heldBy.filter((q) => q !== b);
      if (!L.x.heldBy.length) {
        L.x.release = tn + (shed ? 0 : 0.2);
        if (shed) { L.x.shedFrom = b.id; b.trail = L.x; } else L.x.releasedBy = b.id;
      }
    }
    function defend(x, tn) {
      const qbPos = qb ? qb.pos : [scene.ballX, 3];
      if (x.rusher) {
        const last = x.rushPath.length - 1;
        let tgt = x.rushI > last ? qbPos : x.rushPath[x.rushI];
        if (x.rushI <= last && G.dist(x.pos, tgt) < 0.3) { x.rushI += 1; tgt = x.rushI > last ? qbPos : x.rushPath[x.rushI]; }
        let v = x.blitz ? 6.4 : 5.4;
        // Cooperative / Live offense: the rush hurries, never arrives.
        if ((coop || !game) && G.dist(x.pos, qbPos) < 2.2) v = 0.4;
        step(x, tgt, v);
        return;
      }
      if (x.d.man && byOff.has(x.d.man)) {
        const r = byOff.get(x.d.man);
        const lag = playerPos(r.pl, Math.max(snap, tn - 0.3), o.toSvg);
        const side = Math.sign(x.pos[0] - lag[0]) || 1;
        step(x, [lag[0] + side * 0.7, lag[1] - 0.6], 7.4);
        return;
      }
      if (!passPlay && tn > snap + 0.55) {
        // Versus the run: fit, then flow to the ball (safeties come down late).
        const c = byOff.get(ev0.carrierId);
        const late = x.d.glyph === 'db' && DEEP.test(x.d.job || '') ? 1.1 : x.d.glyph === 'db' ? 0.7 : 0;
        const read = x.d.glyph === 'lb' ? 0.3 : 0;
        if (c && tn > snap + 0.55 + late + read && isFree(x, tn)) {
          // Fill the hole a yard or two downfield; only penetrators (DL, blitzers) chase into the backfield.
          const v = x.d.glyph === 'dl' ? vDef * 0.5 : vDef * 0.68;
          const fill = x.d.glyph === 'dl' || x.blitz ? G.add(c.pos, [0, -0.8]) : [c.pos[0], Math.min(c.pos[1] - 0.8, -1.8)];
          step(x, fill, v);
          return;
        }
      }
      if (x.drop && tn > snap + 0.2) {
        if (!x.dropped && (G.dist(x.pos, x.drop) < 0.8 || tn > snap + 1.4)) x.dropped = true;
        let tgt = x.drop;
        if (x.dropped && passPlay) {
          // Match the nearest receiver working into the zone.
          let r = null;
          let rd = 6;
          for (const b of O) {
            if (b.routeEnd <= 0 || b.role === 'QB') continue;
            const d = G.dist(b.pos, x.drop);
            if (d < rd) { rd = d; r = b; }
          }
          if (r) {
            tgt = G.lerp(x.drop, r.pos, 0.55);
            if (DEEP.test(x.d.job || '')) tgt = [tgt[0], Math.min(tgt[1], r.pos[1] - 1.5)]; // stay on top
          }
        }
        step(x, tgt, x.dropped ? 5.2 : 6.0);
        return;
      }
      if (x.fit && tn > snap + 0.15) { step(x, x.fit, 5.0); return; }
      if (x.d.glyph === 'dl') step(x, [x.pos[0], Math.max(x.pos[1], -0.3)], 1.5);
    }
    function startYac() {
      phase = 'yac';
      dir = norm(event.dir || [0, -1]);
      k = 0;
      travelled = 0;
      pts.length = 0;
      tpts.length = 0;
      pts.push(carrier.pos.slice());
      tpts.push(event.t);
      // Defensive backs read and react a beat after the ball comes out.
      if (game) for (const x of D) if (x.d.glyph === 'db') x.release = Math.max(x.release, event.t + 0.35);
    }
    function steerCarrier() {
      const up = [0, -1];
      const plant = event.kind === 'catch' && k < 3;
      if (!plant) dir = norm(G.add(G.mul(dir, 0.55), G.mul(up, 0.45)));
      let push = 0;
      for (const x of D) {
        const v = G.sub(carrier.pos, x.pos);
        const dist = Math.hypot(v[0], v[1]);
        if (dist > 5 || x.pos[1] > carrier.pos[1] + 1) continue; // only defenders ahead
        push += Math.sign(v[0] || 1) * (5 - dist) / 5 * (x.heldBy.length ? 0.7 : 1) * (dist < 2 ? 1.6 : 1);
      }
      let heading = norm([dir[0] + 0.32 * push, dir[1]]);
      const ang = Math.atan2(heading[0], -heading[1]);
      const lim = plant ? 1.45 : 0.62;
      if (Math.abs(ang) > lim) heading = [Math.sin(Math.sign(ang) * lim), -Math.cos(lim)];
      dir = heading;
      const tired = (plant ? 0.7 : 1) * (k * DT > 1.5 ? 0.82 : 1);
      const len = vRun * tired * DT;
      carrier.pos = G.add(carrier.pos, G.mul(heading, len));
      carrier.pos[0] = Math.max(-26 + 1, Math.min(26 - 1, carrier.pos[0]));
      travelled += len;
      k += 1;
      pts.push(carrier.pos.slice());
      tpts.push(curT);
    }
  }

  /** Interpolated position on a track at time t. */
  function trackAt(track, t) {
    if (t <= track[0][0]) return [track[0][1], track[0][2]];
    for (let i = 1; i < track.length; i++) {
      if (track[i][0] >= t) {
        const a = track[i - 1];
        const b = track[i];
        const u = (t - a[0]) / ((b[0] - a[0]) || 1);
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    const z = track[track.length - 1];
    return [z[1], z[2]];
  }

  FD.Live = { simulate, trackAt, playerPos };
})(window.FD);

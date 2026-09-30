/*
 * sim.js — Live styles: a tiny, deterministic football simulation computed
 * ONCE per play at build time (0.1 s steps), then played back by the timeline.
 * No per-frame physics.
 *
 *   Live offense  the ball carrier turns upfield after the catch / carry and
 *                 runs to the top of the frame, bending away from defenders;
 *                 defenders only execute their drops (the offense "wins").
 *   Live game     defenders also trail / rush / fit, then pursue once the ball
 *                 is out. The coverage decides the throw (separation at the
 *                 catch point) and the first free defender to reach the
 *                 carrier makes the tackle. Blocked defenders are held for a
 *                 while first.
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

  /** Position of an offensive player (scene player) at clock time t. */
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
   * o: { scene, defenders (align.js output), toSvg, fromData, game, pursuit,
   *      event: { t, point, dir, carrierId, kind: 'catch'|'carry' },
   *      engaged: Map(defId → release time), topY, goalY, endT, seed }
   * Returns { yac: {pts, t0, t1} | null, tracks: Map(id → [[t,x,y]…]), outcome }.
   */
  function simulate(o) {
    const P = FD.Timing.phases;
    const game = !!o.game;
    const vDef = (o.pursuit === 'aggressive' ? 7.4 : 6.8);
    const vRun = 6.8;
    const snap = P.snap;
    const recv = (id) => o.scene.players.get(id);

    // ── Defenders: state + phase-A intent ──────────────────────────────────
    const D = o.defenders.map((d) => {
      const at = o.toSvg(o.fromData(d.at)); // any disguise rotation finishes before the snap
      return {
        d,
        pos: at.slice(),
        drop: d.drop ? o.toSvg(o.fromData(d.drop)) : null,
        fit: d.fit ? o.toSvg(o.fromData(d.fit)) : null,
        rush: d.rushPath ? d.rushPath.map((q) => o.toSvg(o.fromData(q))) : null,
        rushI: 0,
        track: [[snap, at[0], at[1]]],
        release: o.engaged.has(d.id) ? o.engaged.get(d.id) : (d.glyph === 'dl' && !d.rushPath ? Infinity : -1),
        dl: d.glyph === 'dl',
      };
    });

    const step = (x, target, v) => {
      const dv = G.sub(target, x.pos);
      const dist = Math.hypot(dv[0], dv[1]);
      const m = Math.min(dist, v * DT);
      if (dist > 1e-6) x.pos = G.add(x.pos, G.mul(dv, m / dist));
    };

    // Phase A: snap → event (drops, trails, rushes, fits).
    const phaseA = (x, t) => {
      if (t < snap) return;
      if (x.rush) {
        const tgt = x.rush[Math.min(x.rushI, x.rush.length - 1)];
        step(x, tgt, 5.4);
        if (G.dist(x.pos, tgt) < 0.2 && x.rushI < x.rush.length - 1) x.rushI += 1;
      } else if (x.d.man && recv(x.d.man)) {
        const r = playerPos(recv(x.d.man), Math.max(snap, t - 0.3), o.toSvg);
        const side = Math.sign(x.pos[0] - r[0]) || 1;
        step(x, [r[0] + side * 0.7, r[1] - 0.6], 7.4);
      } else if (x.drop && t > snap + 0.2) {
        step(x, x.drop, 6.0);
      } else if (x.fit && t > snap + 0.15) {
        step(x, x.fit, 5.0);
      } else if (x.dl) {
        step(x, [x.pos[0], Math.max(x.pos[1], -0.3)], 1.5); // engaged at the line
      }
    };

    const ev = o.event;
    let t = snap;
    for (; t < ev.t; t += DT) {
      for (const x of D) {
        // Versus a run, free second-level defenders flow to the carrier as soon as they read it.
        if (game && ev.kind === 'carry' && t > snap + 0.5 && t >= x.release && x.d.glyph === 'lb' && !x.d.edge && ev.carrier) {
          step(x, playerPos(ev.carrier, t + 0.3, o.toSvg), vDef * 0.6);
        } else phaseA(x, t);
        x.track.push([t + DT, x.pos[0], x.pos[1]]);
      }
    }

    // ── The throw (Live game): does the coverage get there? ───────────────
    const outcome = { type: 'complete', gain: 0, point: ev.point, by: null };
    if (game && ev.kind === 'catch') {
      let sep = Infinity;
      let who = null;
      for (const x of D) {
        if (x.rush) continue;
        const d = G.dist(x.pos, ev.point);
        if (d < sep) { sep = d; who = x.d.id; }
      }
      const coop = o.call !== 'comp';
      const r = hash01(o.seed);
      const complete = coop ? sep > 0.45 || r < 0.85 : sep >= 3.0 || (sep >= 1.5 && r < 0.5);
      if (!complete) {
        outcome.type = 'incomplete';
        outcome.by = who;
        outcome.sep = sep;
        // Defenders settle; no run after catch.
        for (let k = 0; k < 8; k++, t += DT) for (const x of D) { phaseA(x, t); x.track.push([t + DT, x.pos[0], x.pos[1]]); }
        return { yac: null, tracks: finish(D), outcome };
      }
    }

    // ── After the ball: carrier turns upfield; defenders pursue (game) ─────
    // Defensive backs read and react a beat after the ball comes out.
    if (game) for (const x of D) if (x.d.glyph === 'db') x.release = Math.max(x.release, ev.t + 0.35);
    // Cooperative: the offense wins the play, gains a few yards after the catch or
    // the line, then the defense closes and makes the stop.
    const coopStop = game && o.call !== 'comp';
    const budget = 4 + Math.floor(hash01(`${o.seed}:yac`) * 9);
    let travelled = 0;
    let pos = ev.point.slice();
    let dir = norm(ev.dir || [0, -1]);
    const pts = [pos.slice()];
    const t0 = ev.t;
    let tackled = null;
    let scored = false;
    const up = [0, -1];
    for (let k = 0; k < 70 && t < o.endT; k++, t += DT) {
      // Steering: blend toward upfield, bend away from defenders ahead (small angles).
      dir = norm(G.add(G.mul(dir, 0.82), G.mul(up, 0.18)));
      let push = 0;
      for (const x of D) {
        const v = G.sub(pos, x.pos);
        const dist = Math.hypot(v[0], v[1]);
        if (dist > 5 || x.pos[1] > pos[1] + 1) continue; // only defenders ahead
        push += Math.sign(v[0] || 1) * (5 - dist) / 5;
      }
      for (const b of o.obstacles || []) {
        // Blockers' contact points: slide past them, don't run through the block.
        const v = G.sub(pos, b);
        const dist = Math.hypot(v[0], v[1]);
        if (dist < 2.2 && b[1] < pos[1] + 0.5) push += Math.sign(v[0] || 1) * (2.2 - dist) / 2.2 * 1.4;
      }
      let heading = norm([dir[0] + 0.32 * push, dir[1]]);
      const ang = Math.atan2(heading[0], -heading[1]);
      const lim = k < 4 ? 1.2 : 0.62; // ≤ ~35° off vertical once turned upfield
      if (Math.abs(ang) > lim) heading = [Math.sin(Math.sign(ang) * lim), -Math.cos(lim)];
      dir = heading;
      const tired = k * DT > 1.5 ? 0.82 : 1; // carriers slow after a burst
      const stepLen = vRun * tired * DT;
      pos = G.add(pos, G.mul(heading, stepLen));
      pos[0] = Math.max(-26 + 1, Math.min(26 - 1, pos[0]));
      travelled += stepLen;
      pts.push(pos.slice());

      for (const x of D) {
        const react = ev.t + (x.d.glyph === 'db' ? 0.35 : 0.2);
        const pursuing = !x.dl || x.release !== Infinity ? t >= Math.max(x.release, react) : false;
        if (pursuing) {
          // Pursuit angle: aim where the carrier will be when we get there.
          const d = G.dist(x.pos, pos);
          let v = vDef * (x.d.glyph === 'db' ? 1.08 : 1);
          if (coopStop && travelled >= budget) v *= 1.7;   // the stop arrives
          if (!game) v *= 0.85;                            // Live offense: chase, don't catch
          const tau = Math.min(1.2, d / v);
          step(x, G.add(pos, G.mul(heading, vRun * tired * tau)), v);
        } else phaseA(x, t);
        x.track.push([t + DT, x.pos[0], x.pos[1]]);
        const canTackle = game && pursuing && (!coopStop || travelled >= budget * 0.8);
        if (canTackle && G.dist(x.pos, pos) < 1.15 && !tackled) tackled = x.d.id;
      }
      if (tackled) break;
      if (o.goalY !== null && o.goalY !== undefined && pos[1] <= o.goalY) { scored = true; break; }
      if (pos[1] <= o.topY + 1) break;
    }
    outcome.type = scored ? 'score' : tackled ? 'tackle' : ev.kind === 'catch' ? 'complete' : 'run';
    outcome.by = tackled;
    outcome.point = pos;
    outcome.gain = Math.round(-pos[1]); // yards past the LOS (svg y is -depth)
    return { yac: { pts, t0, t1: t }, tracks: finish(D), outcome };
  }

  function finish(D) {
    const m = new Map();
    for (const x of D) m.set(x.d.id, x.track);
    return m;
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

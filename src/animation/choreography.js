/*
 * choreography.js — scene → Timeline.
 *
 * This is the one place that decides *when* things happen. It is generic:
 * it walks the scene's players / assignments / reads / pass, and uses the
 * phase times in FD.Timing. There is no per-play code here.
 *
 * DIAGRAM mode:    markers stay at alignment; assignments draw onto the field.
 * SIMULATION mode: markers travel along their paths; the ball meets the
 *                  receiver where he actually is at arrival time.
 * STATIC profile:  (reduced motion / battery) the finished diagram cross-fades
 *                  in, holds, cross-fades out. No drawing, no travel.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const G = FD.Geometry;
  const T = FD.Timing;

  function passTarget(scene, sim, arrive) {
    const pass = scene.pass;
    if (!pass) return null;
    if (pass.point) return pass.point;
    const r = pass.route;
    if (!r) return null;
    // Diagram / Lead: the ball lands ON the arrowhead / settle ring (Lead: where the route stops).
    if (!sim || (scene.style && scene.style !== 'diagram')) return G.endPoint(r.path);
    // Where the receiver actually is when the ball arrives.
    const raw = Math.max(0, Math.min(1, (arrive - r.start) / r.duration));
    return r.measure.at(FD.Ease[r.ease] ? FD.Ease[r.ease](raw) : raw).point;
  }

  /**
   * Throw timing. The phase times are the default; if the target spot on the
   * route hasn't been drawn yet (e.g. a route delayed by a `clears`
   * relationship), the throw waits for it. Generic, not per concept.
   */
  function passTiming(scene, sim) {
    const P = T.phases;
    const flight = P.arrive - P.release;
    const pass = scene.pass;
    // Live styles: the simulation decided when the ball left and landed.
    if (pass && typeof pass.timing.release === 'number') return { release: pass.timing.release, arrive: pass.timing.arrive };
    let arrive = pass && typeof pass.timing.arrive === 'number' ? pass.timing.arrive : P.arrive;
    if (pass && pass.route && !pass.point && scene.style && scene.style !== 'diagram') {
      // Lead / Live: the ball meets the receiver in stride, the moment he reaches the spot.
      const reach = FD.Relationships.timeAt(pass.route, 1);
      arrive = Math.max(reach + 0.02, P.snap + 0.8 + flight);
      arrive = Math.min(arrive, P.exit + (scene.holdExtra || 0) - T.catchPulse - 0.3);
      return { release: arrive - flight, arrive };
    }
    if (pass && pass.route && !pass.point && !sim) {
      const drawnAt = FD.Relationships.timeAt(pass.route, 1);
      arrive = Math.max(arrive, drawnAt + 0.15);
    }
    arrive = Math.min(arrive, P.exit + (scene.holdExtra || 0) - T.catchPulse - 0.3);
    return { release: arrive - flight, arrive };
  }

  /** A brief ink ring at `pt` (SVG space) starting at time t — the "moment" pulse. */
  function momentRing(scene, tl, pt, t, big) {
    const ring = FD.svg.el('circle', { cx: FD.svg.f(pt[0]), cy: FD.svg.f(pt[1]), r: 0.35, class: big ? 'catch-ring' : 'moment-ring', opacity: 0 }, scene.layers.notes);
    tl.track(t, big ? 1.2 : 0.9, (p) => {
      ring.setAttribute('r', FD.svg.f(0.35 + (big ? 1.9 : 0.9) * p));
      ring.setAttribute('opacity', FD.svg.f((big ? 0.9 : 0.55) * (1 - p)));
    }, 'outCubic');
  }

  /** The one structural moment of a play: crossers meeting, or a kick-out / double team landing. */
  function structuralMoment(scene, tl) {
    const rels = scene.play.relationships || [];
    const routeOf = (id) => { const pl = scene.players.get(id); return pl ? pl.assignments.filter((a) => a.kind === 'route').pop() : null; };
    const mesh = rels.find((r) => r.type === 'mesh');
    if (mesh && mesh.participants && mesh.participants.length === 2) {
      const [ra, rb] = mesh.participants.map(routeOf);
      if (ra && rb) {
        const A = ra.measure.points;
        const B = rb.measure.points;
        let best = Infinity; let bi = 0; let bj = 0;
        for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
          const d = G.dist(A[i], B[j]);
          if (d < best) { best = d; bi = i; bj = j; }
        }
        const t = Math.max(FD.Relationships.timeAt(ra, bi / (A.length - 1)), FD.Relationships.timeAt(rb, bj / (B.length - 1)));
        momentRing(scene, tl, G.lerp(A[bi], B[bj], 0.5), t);
        return;
      }
    }
    const blockerId = (rels.find((r) => r.type === 'kickout') || {}).blocker || (rels.find((r) => r.type === 'pull') || {}).puller
      || ((rels.find((r) => r.type === 'combo') || {}).participants || [])[0];
    const pl = blockerId && scene.players.get(blockerId);
    const a = pl && pl.assignments[0];
    if (a && a.spec.end !== 'none') momentRing(scene, tl, G.endPoint(a.path), a.start + a.duration);
  }

  const Choreography = {
    momentRing,
    build(scene, hud, cfg) {
      const P = T.phases;
      const sim = cfg.mode === 'simulation';
      // Play length: extra (or less) hold on the finished diagram; drawing speed unchanged.
      let extra = Math.max(-1.8, cfg.holdExtra || 0);
      // Play out "to the whistle": the hold starts after the play is over.
      const whistle = scene.live && scene.live.outcome && scene.live.outcome.t;
      if (cfg.settings && cfg.settings.playout === 'extended' && whistle) extra = Math.max(extra, whistle + 2.2 - P.exit);
      scene.resultAt = whistle ? Math.max(P.hold - 0.3, whistle + 0.3) : P.hold - 0.3;
      scene.holdExtra = extra;
      const EXIT = P.exit + extra;
      const END = P.end + extra + (cfg.transition === 'rewind' || cfg.exitShift ? 0.5 : 0);
      const tl = new FD.Timeline(END);
      // Who holds the ball from when (QA, and the ball follows its holder).
      scene.possession = [];
      scene.holderAt = (t) => {
        let h = null;
        for (const e of scene.possession) if (e.t <= t) h = e.holder;
        return h;
      };

      tl.at(0.05, () => hud.enter());
      if (scene.reframed) tl.track(0, 1.0, (p) => scene.field.setAttribute('opacity', FD.svg.f(p)), 'inOutSine');
      // Drive mode: the field scrolls by the previous play's gain as the next play forms.
      if (scene.fieldShift) {
        const k = scene.fieldShift;
        tl.track(0, 1.3, (p, raw) => {
          if (raw >= 1) scene.field.removeAttribute('transform');
          else scene.field.setAttribute('transform', `translate(0 ${FD.svg.f(-k * (1 - p))})`);
        }, 'inOutCubic');
      }

      // Entry: line of scrimmage draws outward from the ball.
      scene.los.forEach((d) => tl.track(0.12, T.losDraw, (p) => d.setProgress(p), 'inOutCubic'));
      if (scene.ltg) tl.track(0.9, 0.8, (p) => scene.ltg.setOpacity(p), 'outCubic');

      // Entry: markers settle in from the ball outward.
      const markers = Array.from(scene.players.values()).sort(
        (a, b) => Math.abs(a.align[0]) - Math.abs(b.align[0]) || b.align[1] - a.align[1]
      );
      markers.forEach((pl, i) => {
        tl.track(0.3 + i * T.markerStagger, T.markerEnter, (p) => pl.marker.setAppear(p), 'outCubic');
      });
      tl.track(0.35, T.markerEnter, (p) => scene.ball.setOpacity(p), 'outCubic');

      // Faint defense: appears after the offense, moves at the snap, key pulses at the read.
      const D = scene.defense;
      if (D) {
        D.glyphs.forEach((d, i) => tl.track(0.75 + i * 0.03, T.markerEnter, (p) => d.setAppear(p), 'outCubic'));
        for (const m of D.moves) {
          // Rushers/blitzers go at the snap (stunt loopers wait); coverage drops just after.
          const t = FD.Timing.resolve('def', m.rush ? { delay: 0.06 + (m.delay || 0) } : null, m.length);
          tl.track(t.start, t.duration, (p) => m.view.setProgress(p), t.ease);
        }
        // Disguise: the shell rotates into the real coverage right before the snap.
        for (const r of D.rotations) {
          tl.track(P.motion - 0.3, P.snap - P.motion + 0.25, (p) => { r.view.setProgress(p); r.setT(p); }, 'inOutSine');
        }
        if (D.key) tl.track(P.read, T.catchPulse * 1.2, (p) => D.key.pulse(p), 'outCubic');
        // Blitz tell (Settings): one ripple on every blitzer / stunter right before the snap.
        if (cfg.settings && cfg.settings.blitz === 'on') {
          D.moves.filter((m) => m.blitz).forEach((m, i) => momentRing(scene, tl, m.at, P.snap - 0.65 + i * 0.06, false));
        }
      }

      // Option routes shown as a route tree: every branch dots out with the
      // receiver's stem; once he breaks, the branches he didn't take fade.
      for (const a of scene.assignments) {
        if (!a.tree) continue;
        const pl = scene.players.get(a.player);
        const real = pl && pl.assignments.filter((b) => b.kind === 'route').pop();
        if (!real) continue;
        let split = 1;
        const pts = a.measure.points;
        for (let i = 0; i < pts.length; i++) {
          if (G.distToPolyline(pts[i], real.measure.points) > 0.6) { split = i / Math.max(1, pts.length - 1); break; }
        }
        const decide = FD.Relationships.timeAt(real, Math.min(1, split + 0.08));
        a.start = real.start;
        a.duration = Math.max(0.5, decide - real.start);
        a.ease = 'linear';
        tl.track(decide + 0.1, 0.7, (p) => a.view.el.setAttribute('opacity', FD.svg.f(1 - p)), 'outCubic');
      }

      // Assignments.
      for (const a of scene.assignments) {
        const pl = scene.players.get(a.player);
        const kind = T.kinds[a.kind] || {};
        // Alternate branches (cutbacks, option breaks) and ghosts are notation: they never move a player.
        // Live styles: after the snap every player follows his simulated track instead.
        const moves = !a.alt && (a.kind === 'motion' || (sim && kind.moves && !(scene.live && scene.live.otracks)));
        tl.track(a.start, a.duration, (p) => {
          a.lastP = p;
          a.view.setProgress(p);
          if (moves) pl.marker.setPosition(a.measure.at(p).point);
        }, a.ease);
      }

      // Live styles: every offensive player on his simulated track from the snap
      // (before the ball, which follows its holder).
      if (scene.live && scene.live.otracks) {
        for (const [id, tr] of scene.live.otracks) {
          const pl = scene.players.get(id);
          if (!pl || tr.length < 2) continue;
          const t0 = tr[0][0];
          const t1 = tr[tr.length - 1][0];
          tl.track(t0, t1 - t0, (p) => pl.marker.setPosition(FD.Live.trackAt(tr, t0 + p * (t1 - t0))), 'linear');
        }
      }

      // Point events.
      for (const ev of scene.events) tl.track(ev.start, 0.4, (p) => ev.setAppear(p), 'outCubic');

      // Snap: ball to the quarterback, who then "holds" it (accent dot).
      const qb = scene.qb;
      const ball = scene.ball;
      if (qb) {
        const qbPos = scene.toSvg(qb.snap);
        tl.track(P.snap, T.snapDuration, (p, raw) => {
          ball.setPos(G.lerp(ball.pre, qbPos, p));
          if (raw >= 1) {
            ball.setVisible(false);
            qb.marker.setHasBall(true);
          }
        }, 'inOutQuad');
      }

      // Progression (diagram notation; omitted when players are moving).
      if (!sim) scene.reads.forEach((r, i) => {
        tl.track(P.read + i * T.readStagger, T.readFade, (p) => r.setAppear(p), 'outCubic');
      });

      // Pass.
      const PT = passTiming(scene, sim);
      const target = passTarget(scene, sim, PT.arrive);
      const pass = scene.pass;
      if (pass && target && qb && !pass.sacked) {
        const trail = FD.RouteRenderer.create({
          parent: pass.trailParent, defs: scene.defs, kind: 'ball', cls: 'ball-trail',
          path: G.fromPoints([pass.release, target], 0),
        });
        scene.own(trail.destroy);
        const dir = G.norm(G.sub(target, pass.release));
        const rot = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
        const ring = FD.svg.el('circle', {
          cx: FD.svg.f(target[0]), cy: FD.svg.f(target[1]), r: 0.4, class: 'catch-ring', opacity: 0,
        }, pass.trailParent);

        scene.trail = trail;
        tl.track(PT.release, PT.arrive - PT.release, (p, raw) => {
          if (raw > 0) {
            qb.marker.setHasBall(false);
            ball.setVisible(true);
            ball.setOpacity(1);
          }
          ball.setRotation(rot);
          ball.setPos(G.lerp(pass.release, target, p));
          ball.setScale(1 + 0.4 * Math.sin(Math.PI * p)); // top-down hint of arc
          trail.setProgress(p);
        }, 'outQuad');

        tl.track(PT.arrive, T.catchPulse, (p) => {
          ring.setAttribute('r', FD.svg.f(0.4 + 1.1 * p));
          ring.setAttribute('opacity', FD.svg.f(0.9 * (1 - p)));
        }, 'outCubic');

        if (pass.intercepted && scene.live && scene.live.tracks.get(pass.intercepted)) {
          // Picked off: the ball goes with the defender.
          const tr = scene.live.tracks.get(pass.intercepted);
          tl.track(PT.arrive, END - PT.arrive, (p, raw) => ball.setPos(FD.Live.trackAt(tr, PT.arrive + raw * (END - PT.arrive))), 'linear');
        } else if (pass.incomplete) {
          // Broken up: the ball carries on past the spot and dies.
          const beyond = G.add(target, G.mul(dir, 2.2));
          tl.track(PT.arrive, 0.6, (p) => { ball.setPos(G.lerp(target, beyond, p)); ball.setOpacity(1 - p); }, 'outQuad');
        } else if (sim && pass.receiver) {
          tl.at(PT.arrive, () => {
            ball.setVisible(false);
            pass.receiver.marker.setHasBall(true);
          });
        }
      }

      // Handoff: ball to the exchange point, then it rides the carrier's track.
      const ho = scene.handoff;
      if (ho && qb) {
        const tr = ho.track;
        const tEx = FD.Relationships.timeAt(tr, ho.at);
        const exPt = tr.measure.at(ho.at).point;
        const qbPos = scene.toSvg(qb.snap);
        const t0 = Math.max(P.snap + T.snapDuration, tEx - T.exchange);
        tl.track(t0, tEx - t0, (p, raw) => {
          if (raw > 0) {
            qb.marker.setHasBall(false);
            ball.setVisible(true);
            ball.setOpacity(1);
          }
          ball.setPos(G.lerp(qbPos, exPt, p));
        }, 'inOutQuad');
        if (sim) scene.possession.push({ t: tEx + 0.05, holder: ho.carrier });
        if (sim) {
          // Simulation: the ball stays in the carrier's arms, wherever he runs (carry, cutback, run after contact).
          let prev = exPt;
          tl.track(tEx, END - tEx, () => {
            const q = ho.carrier.marker.position;
            if (G.dist(q, prev) > 0.02) ball.setRotation((Math.atan2(q[1] - prev[1], q[0] - prev[0]) * 180) / Math.PI);
            prev = q;
            ball.setPos(q);
          }, 'linear');
        } else {
          // Diagram: ride the tip of the carry as it draws.
          tl.track(tEx, tr.start + tr.duration - tEx, () => {
            const p = Math.max(ho.at, tr.lastP || 0);
            const pt = tr.measure.at(p);
            ball.setPos(pt.point);
            ball.setRotation((Math.atan2(pt.tangent[1], pt.tangent[0]) * 180) / Math.PI);
          }, 'linear');
        }
        const ring = FD.svg.el('circle', {
          cx: FD.svg.f(exPt[0]), cy: FD.svg.f(exPt[1]), r: 0.4, class: 'catch-ring', opacity: 0,
        }, scene.layers.ball);
        tl.track(tEx, T.catchPulse, (p) => {
          ring.setAttribute('r', FD.svg.f(0.4 + 0.9 * p));
          ring.setAttribute('opacity', FD.svg.f(0.7 * (1 - p)));
        }, 'outCubic');
      }

      // Ball chain (trick plays): ride the holder, fly each exchange, ride again.
      if (scene.chain && scene.chain.length && qb) {
        const legs = scene.chain;
        const at = (pl, t) => (scene.live && scene.live.otracks && scene.live.otracks.get(pl.data.id) && t >= P.snap
          ? pl.marker.position : FD.Live.playerPos(pl, t, scene.toSvg));
        const ride = (pl, t0, t1) => {
          if (t1 <= t0) return;
          tl.track(t0, t1 - t0, (p, raw) => ball.setPos(at(pl, t0 + raw * (t1 - t0))), 'linear');
        };
        let tHave = P.snap + T.snapDuration;
        legs.forEach((L, i) => {
          if (i > 0) ride(L.from, tHave, L.release);
          const fromKind = L.from.marker.kind;
          const start = () => at(L.from, L.release);
          tl.track(L.release, L.arrive - L.release, (p, raw) => {
            if (raw > 0) {
              if (fromKind === 'qb') L.from.marker.setHasBall(false);
              ball.setVisible(true);
              ball.setOpacity(1);
            }
            ball.setPos(G.lerp(start(), L.point, p));
            ball.setScale(L.type === 'handoff' ? 1 : 1 + (L.type === 'pass' ? 0.4 : 0.2) * Math.sin(Math.PI * p));
          }, L.type === 'handoff' ? 'inOutQuad' : 'outQuad');
          if (L.type === 'pass') {
            const trail = FD.RouteRenderer.create({ parent: scene.layers.ball, defs: scene.defs, kind: 'ball', cls: 'ball-trail', path: G.fromPoints([at(L.from, L.release), L.point], 0) });
            scene.own(trail.destroy);
            tl.track(L.release, L.arrive - L.release, (p) => trail.setProgress(p), 'outQuad');
          }
          if (!cfg.settings || cfg.settings.moments !== 'off') momentRing(scene, tl, L.point, L.arrive, L.type === 'pass');
          if (sim) scene.possession.push({ t: L.release, holder: null }, { t: L.arrive + 0.05, holder: L.to });
          tHave = L.arrive;
        });
        const last = legs[legs.length - 1];
        if (last.incomplete) {
          tl.track(last.arrive, 0.6, (p) => ball.setOpacity(1 - p), 'outQuad');
        } else ride(last.to, last.arrive, END);
      }

      // Live styles: defenders follow their simulated tracks; the run-after-catch.
      const LV = scene.live;
      if (LV && D) {
        const Pn = T.phases;
        for (const g of D.glyphs) {
          const tr = LV.tracks.get(g.id);
          if (!tr || tr.length < 2) continue;
          const t0 = tr[0][0];
          const t1 = tr[tr.length - 1][0];
          tl.track(t0, t1 - t0, (p) => g.setPos(FD.Live.trackAt(tr, t0 + p * (t1 - t0))), 'linear');
        }
        const oc = LV.outcome;
        if (LV.game && /^(tackle|score|sack)$/.test(oc.type) && oc.point && (!cfg.settings || cfg.settings.moments !== 'off')) {
          momentRing(scene, tl, oc.point, oc.t, oc.type === 'score');
        }
        void Pn;
      }

      // Camera follow (Play out: to the whistle): the field and the play slide
      // down so the ball carrier never leaves the top of the frame.
      scene.camY = 0;
      if (LV && LV.yac && cfg.settings && cfg.settings.playout === 'extended' && scene.frame) {
        const margin = scene.frame.y0 + (scene.frame.y1 - scene.frame.y0) * 0.34;
        const y = LV.yac;
        const offAt = (p) => Math.max(0, margin - y.measure.at(p).point[1]);
        const final = offAt(1);
        if (final > 0.5) {
          scene.camY = final;
          let cur = 0;
          tl.track(y.start, y.duration + 0.8, (p, raw) => {
            const want = offAt(Math.min(1, raw * (y.duration + 0.8) / y.duration));
            cur = Math.max(cur, cur + (want - cur) * 0.35); // ease in, never back
            const tr = `translate(0 ${FD.svg.f(cur)})`;
            scene.root.setAttribute('transform', tr);
            scene.field.setAttribute('transform', tr);
          }, 'linear');
        }
      }

      // Moments: one structural pulse per play (settings → Moments).
      if (!cfg.settings || cfg.settings.moments !== 'off') structuralMoment(scene, tl);

      // Exit.
      tl.at(EXIT, () => hud.exit());
      // Exit: fade (default), or rewind — every path retracts into its player.
      // Drive flow "continuous" rewinds while the field and the play scroll by
      // the yards gained, so the next play forms on a moving field, no blackout.
      const shift = cfg.exitShift || 0;
      if (cfg.transition === 'rewind' || shift) {
        const views = scene.assignments.map((a) => a.view)
          .concat(D ? D.moves.map((m) => m.view) : [])
          .concat(scene.trail ? [scene.trail] : []);
        const markers = Array.from(scene.players.values()).map((pl) => pl.marker);
        const glyphs = D ? D.glyphs : [];
        tl.track(EXIT, END - EXIT, (p) => {
          const q = 1 - p;
          for (const v of views) v.setProgress(q);
          const fade = 1 - Math.max(0, (p - 0.45) / 0.55);
          for (const m of markers) m.setAppear(fade);
          for (const g of glyphs) g.setAppear(fade);
          scene.ball.setOpacity(Math.max(0, 1 - p * 2.5));
          if (scene.ltg) scene.ltg.setOpacity(fade);
          for (const l of scene.los) l.setProgress(fade);
          if (shift || scene.camY) {
            const y = FD.svg.f(scene.camY + ((shift || scene.camY) - scene.camY) * p);
            scene.root.setAttribute('transform', `translate(0 ${y})`);
            scene.field.setAttribute('transform', `translate(0 ${y})`);
          }
        }, 'inOutCubic');
      } else {
        tl.track(EXIT, END - EXIT, (p) => scene.setOpacity(1 - p), 'inCubic');
      }

      return tl;
    },

    /** Finished diagram, cross-faded. Used for reduced motion / battery. */
    buildStatic(scene, hud, cfg) {
      const noHud = { enter() {}, exit() {} };
      const full = Choreography.build(scene, noHud, Object.assign({}, cfg, { mode: 'diagram' }));
      scene.setOpacity(0);
      full.evaluate(Math.min(T.phases.exit - 0.01, Math.max(T.phases.hold, T.phases.arrive + T.catchPulse + 0.01)));

      const hold = cfg.staticHold || T.staticHold;
      const fade = T.staticFade;
      const tl = new FD.Timeline(hold);
      tl.at(0.05, () => hud.enter());
      tl.track(0, fade, (p) => scene.setOpacity(p), 'inOutSine');
      if (scene.reframed) tl.track(0, fade, (p) => scene.field.setAttribute('opacity', FD.svg.f(p)), 'inOutSine');
      tl.at(hold - fade, () => hud.exit());
      tl.track(hold - fade, fade, (p) => scene.setOpacity(1 - p), 'inOutSine');
      return tl;
    },
  };

  FD.Choreography = Choreography;
})(window.FD);

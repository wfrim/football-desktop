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
    // Diagram: the ball lands ON the arrowhead / settle ring, never on the line behind it.
    if (!sim) return G.endPoint(r.path);
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
    let arrive = pass && typeof pass.timing.arrive === 'number' ? pass.timing.arrive : P.arrive;
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
      const extra = Math.max(-1.8, cfg.holdExtra || 0);
      scene.holdExtra = extra;
      const EXIT = P.exit + extra;
      const END = P.end + extra + (cfg.transition === 'rewind' || cfg.exitShift ? 0.5 : 0);
      const tl = new FD.Timeline(END);

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
      }

      // Assignments.
      for (const a of scene.assignments) {
        const pl = scene.players.get(a.player);
        const kind = T.kinds[a.kind] || {};
        const moves = a.kind === 'motion' || (sim && kind.moves);
        tl.track(a.start, a.duration, (p) => {
          a.lastP = p;
          a.view.setProgress(p);
          if (moves) pl.marker.setPosition(a.measure.at(p).point);
        }, a.ease);
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
      if (pass && target && qb) {
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

        if (sim && pass.receiver) {
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
        // Ride along the track as it draws (diagram) or as the carrier runs (simulation).
        tl.track(tEx, tr.start + tr.duration - tEx, () => {
          const p = Math.max(ho.at, tr.lastP || 0);
          const pt = tr.measure.at(p);
          ball.setPos(pt.point);
          ball.setRotation((Math.atan2(pt.tangent[1], pt.tangent[0]) * 180) / Math.PI);
        }, 'linear');
        const ring = FD.svg.el('circle', {
          cx: FD.svg.f(exPt[0]), cy: FD.svg.f(exPt[1]), r: 0.4, class: 'catch-ring', opacity: 0,
        }, scene.layers.ball);
        tl.track(tEx, T.catchPulse, (p) => {
          ring.setAttribute('r', FD.svg.f(0.4 + 0.9 * p));
          ring.setAttribute('opacity', FD.svg.f(0.7 * (1 - p)));
        }, 'outCubic');
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
          if (shift) {
            const y = FD.svg.f(shift * p);
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

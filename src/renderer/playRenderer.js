/*
 * playRenderer.js — play JSON → a "scene" of drawables.
 *
 *   play JSON
 *     → coordinates.js   (data space → field space)
 *     → primitives.js    (semantic assignment → relative waypoints)
 *     → geometry.js      (waypoints → filleted SVG path + measurements)
 *     → routeRenderer / formationRenderer (SVG nodes with setProgress-style controls)
 *
 * The scene holds no timing logic. choreography.js reads the scene and builds
 * the timeline. Nothing in here is specific to any one play.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el, f } = FD.svg;
  const G = FD.Geometry;
  const C = FD.Coords;

  function sign(x) {
    return x < -0.01 ? -1 : 1;
  }

  function createBall(parent, pre) {
    const g = el('g', { class: 'ball-wrap' }, parent);
    el('ellipse', { rx: 0.3, ry: 0.19, class: 'ball' }, g);
    let pos = pre;
    let rot = -90;
    let scale = 1;
    let opacity = 0;
    let visible = true;
    function apply() {
      g.setAttribute('transform', `translate(${f(pos[0])} ${f(pos[1])}) rotate(${f(rot)}) scale(${f(scale)})`);
      g.setAttribute('opacity', visible ? f(opacity) : 0);
    }
    apply();
    return {
      pre,
      setPos(p) { pos = p; apply(); },
      setRotation(r) { rot = r; apply(); },
      setScale(s) { scale = s; apply(); },
      setOpacity(o) { opacity = o; apply(); },
      setVisible(v) { visible = v; apply(); },
    };
  }

  const PlayRenderer = {
    /**
     * Build a scene for `play` inside stage.playLayer.
     * cfg: { labels, mode }
     */
    build(play, stage, cfg) {
      const ballX = C.ballX(play);
      const toSvg = (p) => C.toSvg(p, ballX);
      const warnings = [];

      const root = el('g', { class: 'play', 'data-play': play.id || '' }, stage.playLayer);
      const layers = {
        scrim: el('g', { class: 'layer-scrim' }, root),
        paths: el('g', { class: 'layer-paths' }, root),
        ball: el('g', { class: 'layer-ball' }, root),
        players: el('g', { class: 'layer-players' }, root),
        notes: el('g', { class: 'layer-notes' }, root),
      };
      const destroyers = [];

      // ── Players ────────────────────────────────────────────────────────
      const players = new Map();
      for (const p of play.players || []) {
        const align = C.fromData(p.at || [0, 0]);
        players.set(p.id, { data: p, align, snap: align, cursor: null, marker: null, assignments: [] });
      }

      // ── Assignments (motion first, since it moves the snap position) ─────
      const specs = play.assignments || [];
      const ordered = specs
        .filter((a) => FD.Primitives.kindOf(a.type) === 'motion')
        .concat(specs.filter((a) => FD.Primitives.kindOf(a.type) !== 'motion'));

      const readOrder = (play.reads || []).map((r) => (typeof r === 'string' ? r : r.player));
      const primaryId = play.primary || readOrder[0];
      const assignments = [];

      for (const spec of ordered) {
        const pl = players.get(spec.player);
        if (!pl) { warnings.push(`assignment for unknown player "${spec.player}"`); continue; }
        if (!FD.Primitives.has(spec.type)) { warnings.push(`unknown primitive "${spec.type}"`); continue; }

        // Sequenced steps (check-then-release, combo-then-climb…) start where
        // the previous step of the same player ended.
        const prev = spec.chain ? pl.assignments[pl.assignments.length - 1] : null;
        const origin = prev ? prev.fieldEnd : pl.snap;
        const outward = sign(origin[0]);
        const ctx = {
          origin,
          outward,
          inward: -outward,
          lateral: 1,
          u: (n) => C.scalar(n),
          v: (q) => C.fromData(q),
          dy: (depth) => C.scalar(depth) - origin[1],
        };

        const prim = FD.Primitives.build(spec, ctx);
        const fieldPts = prim.points.map((r) => G.add(origin, r));
        const path = G.fromPoints(fieldPts.map(toSvg), prim.radius);

        const view = FD.RouteRenderer.create({
          parent: layers.paths,
          defs: stage.defs,
          path,
          kind: prim.kind,
          style: prim.style,
          end: prim.end,
          primary: spec.player === primaryId && prim.kind === 'route',
        });
        destroyers.push(view.destroy);

        const timing = FD.Timing.resolve(prim.kind, spec.timing, view.length);
        if (prev) {
          const gap = spec.timing && typeof spec.timing.delay === 'number' ? spec.timing.delay : 0.35;
          timing.start = prev.start + prev.duration + gap;
        }
        const a = {
          spec, player: spec.player, kind: prim.kind, path, view, ballX, fieldPts,
          measure: view.measure, fieldEnd: fieldPts[fieldPts.length - 1], ...timing,
        };
        assignments.push(a);
        pl.assignments.push(a);
        if (prim.kind === 'motion') pl.snap = a.fieldEnd;
      }

      // ── Markers (after paths so they sit on top; placed at alignment) ────
      for (const pl of players.values()) {
        pl.marker = FD.FormationRenderer.create(layers.players, pl.data, toSvg(pl.align), cfg);
        if (!pl.assignments.length) pl.marker.el.classList.add('is-idle');
      }

      // ── Line of scrimmage + line to gain ─────────────────────────────────
      const hw = C.FIELD.halfWidth;
      const los = [-hw, hw].map((edge) =>
        FD.RouteRenderer.create({
          parent: layers.scrim, defs: stage.defs, kind: 'los', cls: 'los',
          path: G.fromPoints([[ballX, 0], [edge, 0]], 0),
        })
      );
      los.forEach((d) => destroyers.push(d.destroy));

      let ltg = null;
      const dist = play.situation && Number(play.situation.distance);
      if (dist > 0 && dist < 30) {
        // Drawn as short "chain" marks at each sideline rather than a full
        // line, so it never competes with routes run at the sticks.
        const y = f(-C.scalar(dist));
        const L = 1.8;
        const line = el('path', {
          d: `M${f(-hw)} ${y}h${L}M${f(hw)} ${y}h${-L}`, class: 'ltg',
        }, layers.scrim);
        line.setAttribute('opacity', 0);
        ltg = { setOpacity: (o) => line.setAttribute('opacity', f(o)) };
      }

      // ── Ball ───────────────────────────────────────────────────────────
      const qb = Array.from(players.values()).find((p) => p.data.role === 'QB') || null;
      const ball = createBall(layers.ball, toSvg([0, 0.28]));
      let pass = null;
      const bspec = play.ball;
      if (bspec && qb) {
        const qbPath = qb.assignments.find((a) => a.kind === 'qb');
        const release = toSvg(qbPath ? qbPath.fieldEnd : qb.snap);
        const tgt = bspec.to || {};
        const receiver = tgt.player ? players.get(tgt.player) : null;
        const route = receiver ? receiver.assignments.filter((a) => a.kind === 'route').pop() || null : null;
        if (tgt.player && !route) warnings.push(`ball target "${tgt.player}" has no route`);
        pass = {
          release,
          receiver,
          route,
          at: typeof tgt.at === 'number' ? tgt.at : 1,
          point: tgt.point ? toSvg(C.fromData(tgt.point)) : null,
          trail: null,
          ring: null,
          timing: bspec.timing || {},
        };
        pass.trailParent = layers.ball;
      }

      // ── Read / progression numerals ─────────────────────────────────────
      const reads = [];
      readOrder.forEach((pid, i) => {
        const pl = players.get(pid);
        if (!pl) { warnings.push(`read references unknown player "${pid}"`); return; }
        const c = toSvg(pl.snap);
        const nearby = pl.assignments.flatMap((a) => a.measure.points);
        let best = [c[0] + 1.05, c[1] - 1.05];
        let bestD = -1;
        for (const [dx, dy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
          const cand = [c[0] + dx * 1.05, c[1] + dy * 1.05];
          const d = nearby.length > 1 ? G.distToPolyline(cand, nearby) : 9;
          if (d > bestD + 0.05) { best = cand; bestD = d; }
        }
        const t = el('text', {
          x: f(best[0]), y: f(best[1]), 'font-size': 0.56,
          class: `read-num${i === 0 ? ' is-first' : ''}`, opacity: 0,
        }, layers.notes);
        t.textContent = String(i + 1);
        reads.push({ player: pid, setAppear: (a) => t.setAttribute('opacity', f(a)) });
      });

      // ── Point events (mesh point, handoff exchange, …) ───────────────────
      const events = (play.events || []).map((ev) => {
        const p = toSvg(C.fromData(ev.at || [0, -4]));
        const g = el('g', { class: `evt evt-${ev.type || 'point'}`, transform: `translate(${f(p[0])} ${f(p[1])})`, opacity: 0 }, layers.notes);
        el('circle', { r: 0.42, class: 'evt-ring' }, g);
        const t = ev.timing || {};
        const phase = FD.Timing.phases[t.phase || 'snap'] || 0;
        return {
          spec: ev,
          start: typeof t.at === 'number' ? t.at : phase + (typeof t.delay === 'number' ? t.delay : 0.5),
          setAppear: (a) => g.setAttribute('opacity', f(a)),
        };
      });

      const scene = {
        play,
        root,
        layers,
        defs: stage.defs,
        ballX,
        toSvg,
        players,
        assignments,
        los,
        ltg,
        qb,
        ball,
        pass,
        reads,
        events,
        warnings,
        setOpacity(o) { root.setAttribute('opacity', f(o)); },
        /** Add a drawable created later (e.g. by choreography) to teardown. */
        own(destroy) { destroyers.push(destroy); },
        destroy() {
          destroyers.forEach((d) => d());
          root.remove();
          players.clear();
        },
      };

      // Relationships: validation, timing constraints, concept emphasis.
      warnings.push(...FD.Relationships.apply(scene));
      if (warnings.length) console.warn(`[play ${play.id || '?'}]`, warnings);
      return scene;
    },
  };

  FD.PlayRenderer = PlayRenderer;
})(window.FD);

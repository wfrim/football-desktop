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

  /*
   * Collision QA (warnings only): a moving path (route, carry, pull, lead)
   * must not pass through another player's marker, and a ball carrier must
   * not run through a block's contact point. Crossing other paths is fine
   * (football paths cross; timing separates them).
   */
  const MARK = { r: 0.58, olW: 0.92, olH: 0.62 }; // keep in sync with formationRenderer SIZE
  const MOVING = new Set(['route', 'run', 'pull', 'lead']);
  function markerDist(p, pl) {
    const c = pl.snap;
    if (/^(LT|LG|C|RG|RT)$/.test(pl.data.role)) {
      const dx = Math.max(0, Math.abs(p[0] - c[0]) - MARK.olW / 2);
      const dy = Math.max(0, Math.abs(p[1] - c[1]) - MARK.olH / 2);
      return Math.hypot(dx, dy);
    }
    return Math.max(0, G.dist(p, c) - MARK.r);
  }
  function collisions(players, assignments) {
    const out = [];
    const field = (a) => a.measure.points.map((q) => [q[0] - a.ballX, -q[1]]);
    const tbars = assignments.filter((a) => a.view && a.spec.end !== 'none' && (a.kind === 'block' || a.kind === 'lead' || a.kind === 'pull'));
    for (const a of assignments) {
      if (!MOVING.has(a.kind) || a.alt) continue;
      const pts = field(a);
      // Skip the first 0.9 yd (leaving one's own spot next to teammates).
      const start = pts[0];
      const body = pts.filter((q) => G.dist(q, start) > 0.9);
      if (body.length < 2) continue;
      for (const pl of players.values()) {
        if (pl.data.id === a.player) continue;
        let d = Infinity;
        for (const q of body) d = Math.min(d, markerDist(q, pl));
        if (d < 0.02) out.push(`collision: ${a.player}'s ${a.kind} passes through ${pl.data.id}`);
      }
      if (a.kind === 'run') {
        for (const b of tbars) {
          if (b.player === a.player) continue;
          const d = G.distToPolyline(b.fieldEnd, body);
          if (d < 0.4) out.push(`collision: ${a.player}'s carry runs through ${b.player}'s block (${d.toFixed(2)} yd)`);
        }
      }
    }
    return Array.from(new Set(out));
  }

  /*
   * Pure geometry for a play: every assignment's waypoints in field space
   * (yards, LOS-relative), in drawing order. No DOM, no timing. Used by the
   * renderer and by field-position fitting (how deep does this play go?).
   */
  function layout(play) {
    const warnings = [];
    const players = new Map();
    for (const p of play.players || []) players.set(p.id, { data: p, align: C.fromData(p.at || [0, 0]) });
    const snap = new Map(Array.from(players, ([id, p]) => [id, p.align]));
    const lastEnd = new Map();
    const specs = play.assignments || [];
    const ordered = specs
      .filter((a) => FD.Primitives.kindOf(a.type) === 'motion')
      .concat(specs.filter((a) => FD.Primitives.kindOf(a.type) !== 'motion'));
    const items = [];
    let deepest = 0;
    for (const spec of ordered) {
      if (!players.has(spec.player)) { warnings.push(`assignment for unknown player "${spec.player}"`); continue; }
      if (!FD.Primitives.has(spec.type)) { warnings.push(`unknown primitive "${spec.type}"`); continue; }
      const origin = spec.chain && lastEnd.has(spec.player) ? lastEnd.get(spec.player) : snap.get(spec.player);
      const outward = sign(origin[0]);
      const ctx = {
        origin,
        outward,
        inward: -outward,
        lateral: 1,
        playside: play.side === 'left' ? -1 : 1,
        abs: (q) => G.sub(C.fromData(q), origin),
        u: (n) => C.scalar(n),
        v: (q) => C.fromData(q),
        dy: (depth) => C.scalar(depth) - origin[1],
      };
      const prim = FD.Primitives.build(spec, ctx);
      const fieldPts = prim.points.map((r) => G.add(origin, r));
      const end = fieldPts[fieldPts.length - 1];
      for (const q of fieldPts) deepest = Math.max(deepest, q[1]);
      if (!spec.alt) lastEnd.set(spec.player, end);
      if (prim.kind === 'motion') snap.set(spec.player, end);
      items.push({ spec, prim, fieldPts });
    }
    return { players, items, deepest, warnings };
  }

  /** Deepest point (yards past the LOS) any path of `play` reaches. Memoised. */
  function deepest(play) {
    if (play._deepest === undefined) play._deepest = layout(play).deepest;
    return play._deepest;
  }

  const PlayRenderer = {
    layout,
    deepest,
    collisions,
    /**
     * Build a scene for `play` inside stage.playLayer.
     * cfg: { labels, mode }
     */
    build(play, stage, cfg) {
      const place = cfg.place || null; // { spot, hash } from field position / drive mode
      const ballX = place ? C.hashX(place.hash) : C.ballX(play);
      const toSvg = (p) => C.toSvg(p, ballX);
      const warnings = [];

      const root = el('g', { class: 'play', 'data-play': play.id || '' }, stage.playLayer);
      const layers = {
        scrim: el('g', { class: 'layer-scrim' }, root),
        defense: el('g', { class: 'layer-defense' }, root),
        paths: el('g', { class: 'layer-paths' }, root),
        ball: el('g', { class: 'layer-ball' }, root),
        players: el('g', { class: 'layer-players' }, root),
        notes: el('g', { class: 'layer-notes' }, root),
      };
      const destroyers = [];

      // ── Geometry (DOM-free; shared with field-position fitting) ─────────
      const L = layout(play);
      warnings.push(...L.warnings);
      const players = new Map();
      for (const [id, p] of L.players) {
        players.set(id, { data: p.data, align: p.align, snap: p.align, cursor: null, marker: null, assignments: [] });
      }

      const readOrder = (play.reads || []).map((r) => (typeof r === 'string' ? r : r.player));
      const primaryId = play.primary || readOrder[0];
      const assignments = [];

      for (const { spec, prim, fieldPts } of L.items) {
        const pl = players.get(spec.player);
        const prev = spec.chain ? pl.assignments[pl.assignments.length - 1] : null;
        const path = G.fromPoints(fieldPts.map(toSvg), prim.radius);

        const view = FD.RouteRenderer.create({
          parent: layers.paths,
          defs: stage.defs,
          path,
          kind: prim.kind,
          style: spec.alt ? 'dashed' : prim.style,
          end: prim.end,
          primary: !spec.alt && spec.player === primaryId && (prim.kind === 'route' || prim.kind === 'run'),
        });
        if (spec.alt) view.el.classList.add('is-alt');
        destroyers.push(view.destroy);

        const timing = FD.Timing.resolve(prim.kind, spec.timing, view.length);
        if (prev) {
          const gap = spec.timing && typeof spec.timing.delay === 'number' ? spec.timing.delay : 0.35;
          timing.start = prev.start + prev.duration + gap;
        }
        const a = {
          spec, player: spec.player, kind: prim.kind, alt: !!spec.alt, path, view, ballX, fieldPts,
          measure: view.measure, fieldEnd: fieldPts[fieldPts.length - 1], ...timing,
        };
        assignments.push(a);
        if (!a.alt) pl.assignments.push(a);
        if (prim.kind === 'motion') pl.snap = a.fieldEnd;
      }

      // ── Camera: tight for plays that live near the line ──────────────────
      const deepest = L.deepest;
      const frameKey = play.frame || (deepest <= C.TIGHT_MAX_DEPTH ? 'tight' : 'default');
      const reframed = stage.setFrame(frameKey);
      stage.field.update(place ? place.spot : null, Math.min(C.FIELD.halfWidth + 0.9, stage.frame.x1 - 0.6));
      if (reframed) stage.field.setAttribute('opacity', 0);

      // ── Faint defense (generated from the offense's alignment) ───────────
      let defense = null;
      const defMode = cfg.settings ? cfg.settings.defense : 'off';
      if (defMode !== 'off' && FD.Defense && play.defense !== false) {
        try {
          const D = FD.Defense.build(play, play.defense, ballX);
          const k = FD.Defense.keyOf(D.defenders, D.look.key);
          defense = FD.DefenseRenderer.create({
            parent: layers.defense, defs: stage.defs, defenders: D.defenders, toSvg, players,
            keyId: k ? k.id : null, showKey: defMode === 'key',
          });
          destroyers.push(defense.destroy);
        } catch (err) {
          warnings.push(`defense: ${err.message}`);
        }
      }

      // ── Markers (after paths so they sit on top; placed at alignment) ────
      for (const pl of players.values()) {
        pl.marker = FD.FormationRenderer.create(layers.players, pl.data, toSvg(pl.align), cfg);
        if (!pl.assignments.length) pl.marker.el.classList.add('is-idle');
      }

      // ── Line of scrimmage + line to gain ─────────────────────────────────
      const hw = Math.min(C.FIELD.halfWidth, stage.frame.x1 - 0.5);
      const los = [-hw, hw].map((edge) =>
        FD.RouteRenderer.create({
          parent: layers.scrim, defs: stage.defs, kind: 'los', cls: 'los',
          path: G.fromPoints([[ballX, 0], [edge, 0]], 0),
        })
      );
      los.forEach((d) => destroyers.push(d.destroy));

      let ltg = null;
      let dist = place && place.distance !== undefined ? place.distance : play.situation && Number(play.situation.distance);
      if (place && dist > 0) dist = Math.min(dist, 100 - place.spot); // "& goal": the goal line is the line to gain
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

      // ── Handoff: the ball rides the carrier's track from the exchange ─────
      let handoff = null;
      const ho = play.handoff;
      if (ho && qb) {
        const carrier = players.get(ho.to);
        const track = carrier ? carrier.assignments.filter((a) => a.kind === 'run').pop() : null;
        if (!track) warnings.push(`handoff target "${ho.to}" has no carry`);
        else {
          let at = typeof ho.at === 'number' ? ho.at : 0.25;
          if (Array.isArray(ho.at)) {
            // Nearest point on the (drawn) track to the given exchange landmark.
            const want = toSvg(C.fromData(ho.at));
            let best = Infinity;
            for (let i = 0; i <= 200; i++) {
              const d = G.dist(track.measure.at(i / 200).point, want);
              if (d < best) { best = d; at = i / 200; }
            }
          }
          handoff = { carrier, track, at, from: qb };
        }
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
        handoff,
        defense,
        reads,
        events,
        warnings,
        reframed,
        field: stage.field,
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
      warnings.push(...collisions(players, assignments));
      if (warnings.length) console.warn(`[play ${play.id || '?'}]`, warnings);
      return scene;
    },
  };

  FD.PlayRenderer = PlayRenderer;
})(window.FD);

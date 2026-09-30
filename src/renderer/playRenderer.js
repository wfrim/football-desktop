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
      getPos: () => pos,
      isShown: () => visible && opacity > 0.05,
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
      if (!MOVING.has(a.kind) || a.alt || a.simDrawn || a.yac) continue;
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

  /*
   * Live styles: find the ball event (catch or end of the designed carry),
   * simulate, then add the run-after-catch path and the defenders' tracks.
   */
  /** Replace an assignment's drawn path (keeps its timing object). */
  function redraw(a, pts, x, end) {
    if (pts.length < 2) return;
    const path = G.fromPoints(pts, a.kind === 'run' ? 1.2 : 0.6);
    a.view.destroy();
    const nv = FD.RouteRenderer.create({ parent: x.layers.paths, defs: x.stage.defs, path, kind: a.kind, style: a.kind === 'run' ? 'solid' : undefined, end });
    x.destroyers.push(nv.destroy);
    Object.assign(a, { view: nv, path, measure: nv.measure });
  }

  /** Cut a carry at fraction `frac` of its length (the simulation takes over there). */
  function cutCarry(tr, frac, x) {
    if (!(frac > 0.05 && frac < 0.97)) return;
    const cut = G.cutAt(tr.path, frac);
    const len0 = tr.view.length || 1;
    redraw(tr, cut.head, x, 'none');
    tr.duration *= Math.max(0.3, tr.view.length / len0);
  }

  /*
   * Live styles: find the designed ball event (catch, or end of the designed
   * carry), run the 22-player simulation, then apply what happened: the throw
   * the QB actually made, the run after the catch, blocks redrawn onto the
   * defenders they met, and every player's track.
   */
  function runLive(scene, x) {
    const P = FD.Timing.phases;
    const pass = scene.pass;
    let event = null;
    let exchangeT;
    if (pass && pass.route) {
      const flight = P.arrive - P.release;
      const reach = FD.Relationships.timeAt(pass.route, 1);
      const t = Math.max(reach + 0.02, P.snap + 0.8 + flight);
      event = { t, point: G.endPoint(pass.route.path), dir: G.endTangent(pass.route.path), carrierId: pass.route.player, kind: 'catch' };
      // Screens already draw a designed run after the catch: continue from its end.
      const pl = scene.players.get(pass.route.player);
      const after = pl ? pl.assignments.filter((a) => a.kind === 'run' && a.start >= pass.route.start && !a.alt).pop() : null;
      if (after) event = Object.assign(event, { t: after.start + after.duration, point: G.endPoint(after.path), dir: G.endTangent(after.path), screen: true });
    } else if (scene.handoff) {
      const tr = scene.handoff.track;
      exchangeT = FD.Relationships.timeAt(tr, scene.handoff.at);
      if (x.style === 'game') {
        // Live game: the designed carry hands over to the simulation just past the line.
        const pts = tr.measure.points;
        let run = 0;
        let frac = -1;
        for (let i = 1; i < pts.length && frac < 0; i++) {
          const a0 = pts[i - 1];
          const b0 = pts[i];
          const seg = G.dist(a0, b0);
          if (-a0[1] < 1.2 && -b0[1] >= 1.2) frac = (run + seg * ((1.2 + a0[1]) / ((a0[1] - b0[1]) || 1))) / tr.measure.length;
          run += seg;
        }
        cutCarry(tr, frac, x);
      }
      event = { t: tr.start + tr.duration, point: G.endPoint(tr.path), dir: G.endTangent(tr.path), carrierId: tr.player, kind: 'carry', carrier: scene.players.get(tr.player) };
    }
    if (!event || !x.defData) return;
    const game = x.style === 'game';
    const res = FD.Live.simulate({
      scene, defenders: x.defData.defenders, toSvg: x.toSvg, fromData: C.fromData, game,
      pursuit: x.cfg.settings && x.cfg.settings.pursuit, call: x.cfg.settings && x.cfg.settings.call,
      event, exchangeT,
      topY: x.stage.frame.y0, goalY: x.place && x.place.spot !== null && x.place.spot !== undefined ? -(100 - x.place.spot) : null,
      extended: x.cfg.settings && x.cfg.settings.playout === 'extended',
      endT: x.cfg.settings && x.cfg.settings.playout === 'extended' ? P.snap + 11 : P.exit + (x.cfg.holdExtra || 0) - 0.4, seed: `${scene.play.id}:${x.place ? x.place.spot : ''}`,
    });
    const oc = res.outcome;
    if (/simdebug/.test(location.search)) {
      x.warnings.push(`pairs ${res.pairs.map((q) => `${q[0]}>${q[1]}`).join(' ')} · latches ${res.latches.map((L) => `${L.blockerId}>${L.defId}@${L.t.toFixed(1)}`).join(' ')} · unblocked ${res.unblocked.join(',')} · ${oc.type} ${oc.gain} ${JSON.stringify(oc.why)}`);
    }
    scene.live = { event: res.event || event, outcome: oc, tracks: res.tracks, otracks: res.otracks, game };

    // The throw the QB actually made (Competitive can go elsewhere, or nowhere).
    if (pass) {
      if (!res.pass) pass.sacked = oc.type === 'sack';
      else {
        const rp = res.pass;
        pass.point = rp.point;
        pass.release = rp.release;
        pass.timing = { release: rp.releaseT, arrive: rp.arrive };
        if (rp.to !== pass.route.player) {
          pass.receiver = rp.to ? scene.players.get(rp.to) : null;
          pass.route = pass.receiver ? pass.receiver.assignments.filter((a) => a.kind === 'route').pop() || pass.route : pass.route;
        }
        if (oc.type === 'incomplete' || oc.type === 'interception') pass.incomplete = true;
        if (oc.type === 'interception') pass.intercepted = oc.by;
        if (rp.away) pass.receiver = null;
      }
    }
    // A run stopped in the backfield: the drawn carry ends where he went down.
    if (scene.handoff && oc.why.tackler && oc.why.tackler.backfield) {
      const tr = scene.handoff.track;
      let best = 1;
      let bd = Infinity;
      for (let i = 0; i <= 100; i++) { const d = G.dist(tr.measure.at(i / 100).point, oc.point); if (d < bd) { bd = d; best = i / 100; } }
      cutCarry(tr, best, x);
    }
    // Pulls and leads: drawn to the defender they actually met.
    for (const L of res.latches) {
      const a = L.a;
      if (a.kind !== 'pull' && a.kind !== 'lead') continue;
      if (G.dist(L.at, G.endPoint(a.path)) < 0.8) continue;
      const tr = res.otracks.get(L.blockerId);
      const pts = tr.filter((q) => q[0] >= a.start && q[0] <= L.t).map((q) => [q[1], q[2]]);
      const thin = pts.filter((q, i) => i === 0 || i === pts.length - 1 || G.dist(q, pts[i - 1]) > 0.25);
      if (thin.length >= 2) {
        redraw(a, thin, x, 'tbar');
        a.duration = Math.max(0.3, L.t - a.start);
        a.simDrawn = true; // the real path taken: players had moved, so no alignment collision QA
      }
    }
    if (res.yac && res.yac.pts.length > 2) {
      const carrierId = res.event.carrierId;
      const pl = scene.players.get(carrierId);
      const view = FD.RouteRenderer.create({ parent: x.layers.paths, defs: x.stage.defs, path: G.fromPoints(res.yac.pts, 0.6), kind: 'run', style: 'solid', end: 'arrow' });
      x.destroyers.push(view.destroy);
      const a = {
        spec: { type: 'yac', player: carrierId }, player: carrierId, kind: 'run', alt: false, path: G.fromPoints(res.yac.pts, 0.6), view,
        ballX: x.ballX, fieldPts: res.yac.pts.map((q) => [q[0] - x.ballX, -q[1]]), measure: view.measure,
        fieldEnd: [res.yac.pts[res.yac.pts.length - 1][0] - x.ballX, -res.yac.pts[res.yac.pts.length - 1][1]],
        start: res.yac.t0 + 0.05, duration: Math.max(0.4, res.yac.t1 - res.yac.t0), ease: 'linear', yac: true,
      };
      scene.assignments.push(a);
      if (pl) pl.assignments.push(a);
      scene.live.yac = a;
    }
  }

  const COVER_LABEL = {
    cover0: 'COVER 0', cover1: 'COVER 1', robber: 'COVER 1 ROBBER', cover2: 'COVER 2', tampa2: 'TAMPA 2',
    cover2man: '2-MAN', cover3: 'COVER 3', buzz: 'COVER 3 BUZZ', cover4: 'QUARTERS', cover6: 'COVER 6',
  };

  /**
   * Competitive: a defensive call from the playbook (def_* concepts), weighted
   * by what the offense shows — coverage vs the pass, fronts and pressure vs
   * the run, more pressure on third and long.
   */
  function pickCall(book, play, place) {
    const run = play.family === 'run';
    const long = place && place.situation && /^3RD|^4TH/.test(place.situation) && place.distance >= 7;
    const W = run ? { coverage: 1, pressure: 3, stunt: 2, front: 4 } : { coverage: 5.5, disguise: 2, pressure: long ? 6 : 3, stunt: 1, front: 0.5 };
    let total = 0;
    const w = book.map((c) => { const v = W[c.sub] || 1; total += v; return v; });
    let r = Math.random() * total;
    for (let i = 0; i < book.length; i++) { r -= w[i]; if (r <= 0) return book[i]; }
    return book[book.length - 1];
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

      // ── Faint defense data (built before the camera so the frame fits it) ─
      let defData = null;
      const defFocus = play.family === 'defense';
      const defMode = defFocus ? 'key' : cfg.settings ? cfg.settings.defense : 'off';
      if (defFocus) root.classList.add('focus-defense');
      if (defMode !== 'off' && FD.Defense && play.defense !== false) {
        try {
          // Live game + Competitive: the defense calls a play from the defensive
          // playbook instead of the look the concept is built to beat.
          let look = play.defense;
          let callName = null;
          const st = cfg.style || (cfg.settings && cfg.settings.style);
          if (st === 'game' && cfg.settings && cfg.settings.call === 'comp' && !defFocus && cfg.defBook && cfg.defBook.length) {
            const call = pickCall(cfg.defBook, play, place);
            look = Object.assign({}, call.look);
            callName = call.name;
          }
          defData = FD.Defense.build(play, Object.assign({}, look, defFocus ? { rush: true } : null), ballX);
          defData.call = look;
          const cov = COVER_LABEL[(look && look.coverage) || defData.look.coverage] || '';
          defData.callName = callName || cov;
          const n = defData.defenders.length;
          if (n !== 11) warnings.push(`defense: ${n} defenders`);
          for (const d of defData.defenders) {
            for (const q of [d.at, d.pre]) if (q && q[1] < 0.4) warnings.push(`defense: ${d.id} offside`);
          }
          const rushers = defData.defenders.filter((d) => d.rushPath).length;
          if (rushers > 8) warnings.push(`defense: ${rushers} rushers`);
        } catch (err) { warnings.push(`defense: ${err.message}`); }
      }

      // Option routes: a receiver with alternate branches runs ONE of them.
      // Live styles read the coverage (man on him → break away; zone → sit);
      // "Decide" picks a branch per snap in the diagram styles too. `flip`
      // swaps which branch is real (the default look keeps the authored main).
      const styleName = cfg.style || (cfg.settings && cfg.settings.style) || 'diagram';
      const decideOpt = styleName === 'live' || styleName === 'game' || (cfg.settings && cfg.settings.options === 'decide');
      const flip = new Set();
      const treeOf = new Map(); // player → true when branches are shown as a route tree
      if (decideOpt) {
        const byPlayer = new Map();
        L.items.forEach((it, i) => {
          if (it.prim.kind !== 'route') return;
          if (!byPlayer.has(it.spec.player)) byPlayer.set(it.spec.player, []);
          byPlayer.get(it.spec.player).push(i);
        });
        for (const [pid, idxs] of byPlayer) {
          const alts = idxs.filter((i) => L.items[i].spec.alt);
          const mains = idxs.filter((i) => !L.items[i].spec.alt);
          if (!alts.length || mains.length !== 1) continue;
          let pick = -1; // -1: the authored main branch
          if (styleName === 'live' || styleName === 'game') {
            const manned = defData && defData.defenders.some((d) => d.man === pid);
            if (manned) pick = 0;
          } else {
            let h = 0;
            for (const ch of `${play.id}:${place ? place.spot : ''}:${Date.now() >> 12}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
            pick = (h % (alts.length + 1)) - 1;
          }
          if (pick >= 0) { flip.add(mains[0]); flip.add(alts[pick]); }
          if (cfg.settings && cfg.settings.options === 'decide') treeOf.set(pid, true);
        }
      }
      const altOf = (i) => (flip.has(i) ? !L.items[i].spec.alt : !!L.items[i].spec.alt);

      // Play style: Lead / Live — the targeted route stops where the ball meets
      // the receiver in stride (the play's ball.at); the rest becomes a ghost.
      const style = styleName;
      let leadIdx = -1;
      const bt = play.ball && play.ball.to;
      if (style !== 'diagram' && bt && bt.player && typeof bt.at === 'number' && bt.at < 0.97) {
        L.items.forEach((it, i) => { if (it.spec.player === bt.player && it.prim.kind === 'route' && !altOf(i)) leadIdx = i; });
      }

      // Live styles: receivers' perimeter blocks go to real defenders (nearest
      // unclaimed DB / linebacker), so the convoy fits the defense on the field.
      const live = style === 'live' || style === 'game';
      const blockOn = new Map(); // item index → defender
      if (live && defData) {
        const lastBlock = new Map();
        L.items.forEach((it, i) => {
          const role = (players.get(it.spec.player) || {}).data;
          if (!role || /^(LT|LG|C|RG|RT|QB|RB|F|FB)$/.test(role.role)) return;
          if (/^(stalk|crack|lead)$/.test(it.spec.type) && !it.spec.alt) lastBlock.set(it.spec.player, i);
        });
        const taken = new Set();
        for (const [pid, i] of lastBlock) {
          const from = players.get(pid).align;
          let best = null;
          let bestD = Infinity;
          for (const d of defData.defenders) {
            if (d.glyph === 'dl' || d.rushPath || taken.has(d.id)) continue;
            const q = C.fromData(d.drop ? [d.at[0] + 0.35 * (d.drop[0] - d.at[0]), d.at[1] + 0.35 * (d.drop[1] - d.at[1])] : d.at);
            const dist = G.dist(from, q);
            if (dist < bestD) { bestD = dist; best = { d, q }; }
          }
          if (best && bestD < 14) { taken.add(best.d.id); blockOn.set(i, best); }
        }
      }

      for (let idx = 0; idx < L.items.length; idx++) {
        const spec = flip.has(idx) ? Object.assign({}, L.items[idx].spec, { alt: altOf(idx) }) : L.items[idx].spec;
        const tree = spec.alt && treeOf.has(spec.player) && L.items[idx].prim.kind === 'route';
        let { prim, fieldPts } = L.items[idx];
        if (blockOn.has(idx)) {
          const { q } = blockOn.get(idx);
          const o0 = fieldPts[0];
          const v = G.sub(q, o0);
          const len = Math.hypot(v[0], v[1]) || 1;
          fieldPts = [o0, G.add(o0, G.mul(v, Math.max(0.3, (len - 0.8) / len)))];
        }
        const pl = players.get(spec.player);
        const prev = spec.chain ? pl.assignments[pl.assignments.length - 1] : null;
        const hand = cfg.settings && cfg.settings.lines === 'hand' && prim.kind !== 'block';
        let svgPts = fieldPts.map(toSvg);
        let ghost = null;
        if (idx === leadIdx) {
          const cut = G.cutAt(G.fromPoints(svgPts, prim.radius), bt.at);
          svgPts = cut.head;
          ghost = cut.tail;
          // fieldPts stay the designed route: relationship checks measure the concept, not the catch.
          prim = Object.assign({}, prim, { end: 'settle', radius: 0 });
        }
        const path = hand
          ? G.fromPoints(G.wobble(svgPts, `${play.id}:${spec.player}:${spec.type}`), Math.max(prim.radius, 0.9))
          : G.fromPoints(svgPts, prim.radius);

        const view = FD.RouteRenderer.create({
          parent: layers.paths,
          defs: stage.defs,
          path,
          kind: prim.kind,
          style: tree ? 'dotted' : spec.alt ? 'dashed' : prim.style,
          end: prim.end,
          primary: !spec.alt && spec.player === primaryId && (prim.kind === 'route' || prim.kind === 'run'),
        });
        if (spec.alt) view.el.classList.add(tree ? 'is-tree' : 'is-alt');
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
        if (tree) a.tree = true;
        if (!a.alt) pl.assignments.push(a);
        if (blockOn.has(idx)) a.engages = blockOn.get(idx).d.id;
        if (prim.kind === 'motion') pl.snap = a.fieldEnd;
        if (ghost && ghost.length > 1) {
          // The route the receiver would have finished: faint, dotted, after the catch.
          const gv = FD.RouteRenderer.create({ parent: layers.paths, defs: stage.defs, path: G.fromPoints(ghost, 0), kind: 'route', style: 'dotted', end: 'none' });
          gv.el.classList.add('is-ghost');
          destroyers.push(gv.destroy);
          assignments.push({ spec: Object.assign({}, spec, { alt: true }), player: spec.player, kind: 'route', alt: true, path: G.fromPoints(ghost, 0), view: gv, ballX,
            fieldPts: ghost.map((q) => [q[0] - ballX, -q[1]]), measure: gv.measure, fieldEnd: [ghost[ghost.length - 1][0] - ballX, -ghost[ghost.length - 1][1]],
            start: a.start + a.duration + 0.15, duration: 0.7, ease: 'outCubic', ghost: true });
        }
      }

      // ── Camera: tight when everything (offense, defense, drops) fits it ──
      let deepest = L.deepest;
      let widest = 0;
      for (const it of L.items) for (const q of it.fieldPts) widest = Math.max(widest, Math.abs(q[0] + ballX));
      for (const p of players.values()) widest = Math.max(widest, Math.abs(p.align[0] + ballX));
      if (defData) {
        for (const d of defData.defenders) {
          for (const q of [d.at, d.drop, d.fit]) {
            if (!q) continue;
            const fq = C.fromData(q);
            deepest = Math.max(deepest, fq[1]);
            widest = Math.max(widest, Math.abs(fq[0] + ballX));
          }
        }
      }
      const TF = C.TIGHT_FRAME;
      const fitsTight = L.deepest <= C.TIGHT_MAX_DEPTH && deepest <= TF.y1 - 0.8 && widest <= TF.x1 - 0.8;
      const frameKey = play.frame || cfg.frameLock || (fitsTight ? 'tight' : 'default');
      const zoom = C.ZOOM[(cfg.settings && cfg.settings.zoom) || 'standard'] || 1;
      const reframed = stage.setFrame(frameKey, zoom);
      if (reframed) stage.field.setAttribute('opacity', 0);
      stage.field.update(place ? place.spot : null, Math.min(C.FIELD.halfWidth + 0.9, stage.frame.x1 - 0.6));
      stage.field.removeAttribute('transform'); // a drive's continuous scroll ends here, seamlessly

      // ── Faint defense drawing ─────────────────────────────────────────────
      let defense = null;
      if (defData) {
        const k = FD.Defense.keyOf(defData.defenders, defData.look.key);
        defense = FD.DefenseRenderer.create({
          parent: layers.defense, defs: stage.defs, defenders: defData.defenders, toSvg, players,
          keyId: k ? k.id : null, showKey: defMode === 'key', bold: play.family === 'defense' || defMode === 'bold',
          ink: cfg.settings ? cfg.settings.defink : 'faint',
        });
        destroyers.push(defense.destroy);
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
        ltg = { setOpacity: (o) => line.setAttribute('opacity', f(o)), el: line };
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
        style,
        reads,
        events,
        warnings,
        reframed,
        fieldShift: place && place.shift && !reframed ? place.shift : 0,
        // Live game: "VS COVER 3 SKY · NICKEL" under the offensive call.
        matchup: defData && style === 'game' && !defFocus && defData.callName ? `vs ${defData.callName}${defData.label ? ` \u00B7 ${defData.label}` : ''}` : '',
        field: stage.field,
        frame: stage.frame,
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
      if (live && FD.Live) runLive(scene, { defData, style, cfg, toSvg, ballX, stage, place, destroyers, layers, warnings });
      warnings.push(...collisions(players, assignments));
      if (warnings.length) console.warn(`[play ${play.id || '?'}]`, warnings);
      return scene;
    },
  };

  FD.PlayRenderer = PlayRenderer;
})(window.FD);

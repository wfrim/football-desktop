/*
 * app.js — the playlist loop:
 *
 *   load plays → choose next → render → animate → hold → transition → cleanup → next
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  async function main() {
    const cfg = FD.Config.read();
    const stage = FD.Stage.create(document.getElementById('stage'), cfg);
    const hud = FD.Hud.create(document.getElementById('hud'));

    let plays;
    try {
      plays = await FD.Data.load();
    } catch (err) {
      console.error(err);
      hud.error(err.message);
      return;
    }

    // The defensive playbook: one call per defensive concept (Live game, Competitive).
    const seenCall = new Set();
    cfg.defBook = plays.filter((p) => p.family === 'defense' && p.defense && !seenCall.has(p.conceptId) && seenCall.add(p.conceptId))
      .map((p) => ({ id: p.conceptId, name: (p.copy && p.copy.title) || p.name, sub: p.subfamily, look: p.defense }));

    // ?check=1: build every play once, collect warnings, stop. Results land on
    // <html data-check> so headless Chrome (--dump-dom) can read them: tools/check.sh
    if (cfg.check) {
      const lines = FD.Data.report.filter((r) => r.fatal.length).map((r) => `${r.id} FATAL ${r.fatal.join(' | ')}`);
      const nodes = new Set();
      const stats = [];
      // Styles and settings come from the URL: tools/check.sh "style=game&call=comp"
      cfg.settings = FD.Settings.get();
      cfg.style = cfg.settings.style;
      if (cfg.style === 'live' || cfg.style === 'game') { cfg.mode = 'simulation'; cfg.frameLock = 'default'; }
      for (const p of plays) {
        const scene = FD.PlayRenderer.build(p, stage, cfg);
        const tl = FD.Choreography.build(scene, { enter() {}, exit() {} }, cfg);
        // Ball QA: once someone holds the ball, the ball sits on that player.
        let worst = 0;
        for (let t = 0; t <= FD.Timing.phases.end; t += 0.1) {
          tl.evaluate(t);
          const h = scene.holderAt ? scene.holderAt(t) : null;
          if (h && h.marker && scene.ball.isShown()) worst = Math.max(worst, FD.Geometry.dist(scene.ball.getPos(), h.marker.position));
        }
        if (worst > 0.6) scene.warnings.push(`ball ${worst.toFixed(1)} yd off its carrier`);
        if (scene.live && scene.live.otracks) {
          // Contact QA: tackles happen touching; nobody passes through the carrier; the line stays on him.
          const LV = scene.live;
          const oc = LV.outcome;
          const cid = oc.event && oc.event.carrierId;
          const ct = cid && LV.otracks.get(cid);
          if (ct) {
            const end = oc.t || ct[ct.length - 1][0];
            let overlap = 0;
            let ow = '';
            for (let t = (oc.event.t || 0) + 0.05; t < end - 0.05; t += 0.1) {
              const c = FD.Live.trackAt(ct, t);
              for (const [id, tr] of LV.tracks) {
                const o = 0.8 - FD.Geometry.dist(c, FD.Live.trackAt(tr, t));
                if (o > overlap) { overlap = o; ow = `${id}@${t.toFixed(2)} (ev ${oc.event.t.toFixed(2)}, end ${end.toFixed(2)}, ${oc.type}) d ${JSON.stringify(tr.filter((q) => Math.abs(q[0] - t) < 0.12).map((q) => q.map((v) => +v.toFixed(2))))} c ${JSON.stringify(ct.filter((q) => Math.abs(q[0] - t) < 0.12).map((q) => q.map((v) => +v.toFixed(2))))}`; }
              }
            }
            if (overlap > 0.05) scene.warnings.push(`carrier overlapped a defender by ${overlap.toFixed(2)} yd${/lagdebug/.test(location.search) ? ' ' + ow : ''}`);
            if (oc.type === 'tackle' && LV.tracks.get(oc.by)) {
              const gap = FD.Geometry.dist(FD.Live.trackAt(ct, oc.t), FD.Live.trackAt(LV.tracks.get(oc.by), oc.t));
              if (gap > 1.0) scene.warnings.push(`tackled from ${gap.toFixed(2)} yd away${/lagdebug/.test(location.search) ? ` t=${oc.t.toFixed(2)} ev=${oc.event.t.toFixed(2)} ${JSON.stringify(oc.why.tackler)} broken=${oc.why.broken || 0} gaps ${[-0.2, -0.1, -0.05, 0, 0.1, 0.5].map((dt) => FD.Geometry.dist(FD.Live.trackAt(ct, oc.t + dt), FD.Live.trackAt(LV.tracks.get(oc.by), oc.t + dt)).toFixed(2)).join(',')} trk ${JSON.stringify(LV.tracks.get(oc.by).filter((q) => Math.abs(q[0] - oc.t) < 0.25).map((q) => q.map((v) => +v.toFixed(2))))} ctrk ${JSON.stringify(ct.filter((q) => Math.abs(q[0] - oc.t) < 0.25).map((q) => q.map((v) => +v.toFixed(2))))}` : ''}`);
            }
            if (LV.yac) {
              let lag = 0;
              let at = 0;
              const y = LV.yac;
              for (let r = 0; r <= 1; r += 0.05) {
                const tip = y.measure.at(y.ease(r)).point;
                const d = FD.Geometry.dist(tip, FD.Live.trackAt(ct, y.start + r * y.duration));
                if (d > lag) { lag = d; at = r; }
              }
              if (/lagdebug/.test(location.search) && lag > 0.6) scene.warnings.push(`lag at r=${at.toFixed(2)} dur=${y.duration.toFixed(2)} start=${y.start.toFixed(2)} ev=${oc.event.t.toFixed(2)}`);
              if (lag > 0.6) scene.warnings.push(`run line ${lag.toFixed(2)} yd off the runner`);
            }
          }
        }
        if (scene.live && scene.live.game) {
          const oc = scene.live.outcome;
          if (/notes/.test(location.search)) scene.warnings.push(`${oc.type} ${oc.gain}: ${FD.CoachNote.note(oc, p)}`);
          stats.push({ type: oc.type, gain: oc.gain, run: p.family === 'run', pass: !!scene.pass, why: oc.why });
        }
        if (scene.warnings.length) lines.push(`${p.id} ${scene.warnings.join(' | ')}`);
        scene.destroy();
        nodes.add(document.getElementsByTagName('*').length);
      }
      if (stats.length) {
        const count = (f) => stats.filter(f).length;
        const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
        const passes = stats.filter((x) => x.pass);
        const types = {};
        for (const x of stats) types[x.type] = (types[x.type] || 0) + 1;
        lines.push(`outcomes ${JSON.stringify(types)}`);
        lines.push(`passes ${passes.length}: completion ${Math.round(100 * count((x) => x.pass && !/incomplete|interception|sack/.test(x.type)) / (passes.length || 1))}% · sacks ${count((x) => x.type === 'sack')} · INT ${count((x) => x.type === 'interception')} · off-script throws ${count((x) => x.pass && x.why.target && x.why.read > 0)}`);
        if (new URLSearchParams(location.search).has('why')) {
          const tally = {};
          for (const x of stats) {
            const w = x.why.tackler || x.why.rusher;
            if (!w || (x.gain > 0 && x.type !== 'sack')) continue;
            const k = `${x.type}:${w.job || w.id}:${w.unblocked ? 'unblocked' : 'shed ' + w.shedFrom}`;
            tally[k] = (tally[k] || 0) + 1;
          }
          lines.push(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v} ${k}`).join('\n'));
        }
        lines.push(`gains: runs median ${med(stats.filter((x) => x.run).map((x) => x.gain))} · passes median ${med(passes.filter((x) => x.type !== 'incomplete').map((x) => x.gain))} · run TFL ${count((x) => x.run && x.gain < 0)}`);
      }
      lines.push(`${plays.length} plays checked; DOM node counts after teardown: ${Array.from(nodes).join(',')}`);
      document.documentElement.dataset.check = lines.join('\n');
      console.log(lines.join('\n'));
      return;
    }

    const playlist = new FD.Playlist(plays, { order: cfg.order, seed: cfg.seed, start: cfg.start, list: cfg.list });
    const animator = new FD.Animator({ timeScale: cfg.speed, maxFps: cfg.fps });
    FD.app = { cfg, stage, animator, playlist }; // handy from the console

    if (FD.SettingsPanel) FD.SettingsPanel.create(document.querySelector('.hud-counter'));

    let drive = null;
    let failures = 0;
    for (;;) {
      // Settings can change at any time (panel); they take effect per play.
      cfg.settings = FD.Settings.get();
      FD.Theme.apply(cfg.settings.theme, true); // "auto" follows the clock
      if (!new URLSearchParams(location.search).has('speed')) animator.timeScale = parseFloat(cfg.settings.speed) || 1;
      // Motion setting: Full 30 fps · Calm 20 fps · Still (finished diagrams, crossfaded).
      if (!new URLSearchParams(location.search).has('fps')) animator.minFrameMs = 1000 / (cfg.settings.motion === 'calm' ? 20 : 30) - 1.5;
      if (!new URLSearchParams(location.search).has('motion')) cfg.motion = cfg.settings.motion === 'still' ? 'static' : 'auto';
      // Play length (real seconds at the chosen pace): extra hold on the finished diagram.
      {
        const pace = animator.timeScale || 1;
        const len = parseFloat(cfg.settings.length) || 9;
        cfg.holdExtra = len * pace - FD.Timing.phases.end;
        cfg.staticHold = Math.max(8, len) * pace;
      }
      // Field position (drive mode takes over in drive.js).
      const q = new URLSearchParams(location.search);
      let filter = null;
      cfg.transition = cfg.settings.transition;
      // Play style: Live styles move the players (simulation mode) on one camera.
      cfg.style = new URLSearchParams(location.search).get('style') || cfg.settings.style;
      const liveStyle = cfg.style === 'live' || cfg.style === 'game';
      cfg.mode = liveStyle ? 'simulation' : (new URLSearchParams(location.search).get('mode') || 'diagram');
      cfg.exitShift = 0;
      cfg.frameLock = liveStyle ? 'default' : null;
      if (cfg.settings.drive === 'on') {
        // Drive mode owns field position and play selection.
        if (!drive) drive = FD.Drive.create();
        cfg.place = drive.place(cfg.settings.hash);
        filter = (p) => drive.eligible(p);
        if (cfg.settings.flow !== 'fade') {
          cfg.place.shift = 0;          // the scroll happens in the previous play's exit
          cfg.frameLock = 'default';    // one camera for the whole drive: the field never fades
        }
      } else {
        drive = null;
        const place = q.has('spot') // review aid: ?spot=92&at_hash=left
          ? { spot: Math.max(1, Math.min(99, parseInt(q.get('spot'), 10) || 50)), hash: q.get('at_hash') || 'middle' }
          : FD.FieldPosition.pick(cfg.settings);
        cfg.place = place;
        if (place && place.spot !== null) filter = (p) => FD.FieldPosition.fits(p, place.spot);
      }
      // Library setting narrows the rotation (falls back to everything if empty).
      const LIB = {
        offense: (p) => p.family !== 'defense',
        defense: (p) => p.family === 'defense',
        runs: (p) => p.family === 'run',
        passes: (p) => ['dropback_pass', 'quick_pass', 'play_action'].includes(p.family),
        screens: (p) => p.family === 'screen' || p.family === 'rpo',
      }[cfg.settings.library];
      const BOOK = FD.Playbooks.filter(cfg.settings.playbook);
      const parts = [BOOK, LIB, filter].filter(Boolean);
      const all = parts.length ? (p) => parts.every((fn) => fn(p)) : null;
      // Fall back gracefully: playbook × library × field, then playbook × field, then field.
      const bookField = BOOK && filter ? (p) => BOOK(p) && filter(p) : BOOK || filter;
      // Never leave the chosen playbook: drop the situational filters before the playbook.
      const pick = [all, bookField, BOOK, filter].find((fn) => !fn || plays.some(fn));
      if (drive) drive.playbook = cfg.settings.playbook;
      const info = playlist.next(pick || null);
      if (drive) info.drive = cfg.place;
      let scene = null;
      try {
        scene = FD.PlayRenderer.build(info.play, stage, cfg);
        hud.set(info.play, info, cfg);
        hud.matchup(cfg.settings.matchup !== 'off' ? scene.matchup : '');

        const profile = FD.Config.profile(cfg);
        // Live game: the simulation's outcome is the result (and drives follow it).
        const oc = scene.live && scene.live.game ? scene.live.outcome : null;
        const ocText = !oc ? null : oc.type === 'incomplete' ? (oc.why && oc.why.result === 'away' ? 'THROWN AWAY' : 'INCOMPLETE')
          : oc.type === 'interception' ? 'INTERCEPTED' : oc.type === 'sack' ? `SACK \u00B7 ${Math.min(-1, oc.gain)}`
          : oc.type === 'score' ? 'TOUCHDOWN' : oc.gain < 0 ? `TACKLE FOR LOSS \u00B7 ${oc.gain}` : oc.gain === 0 ? 'NO GAIN' : `+${oc.gain}`;
        // Drive: decide the result first (it shapes the exit), show it during the hold.
        const result = drive ? drive.advance(info.play, oc) : ocText;
        if (drive && cfg.settings.flow !== 'fade' && drive.state.shift > 0 && profile !== 'static') {
          cfg.exitShift = drive.state.shift; // continuous: this play's exit scrolls by the gain
        }
        const tl = profile === 'static'
          ? FD.Choreography.buildStatic(scene, hud, cfg)
          : FD.Choreography.build(scene, hud, cfg);

        if (result) {
          const tr = profile === 'static' ? 1.2 : scene.resultAt || FD.Timing.phases.hold - 0.3;
          const why = oc && cfg.settings.note !== 'off' ? FD.CoachNote.note(oc, info.play) : '';
          tl.at(tr, () => hud.result(result, why));
          if (cfg.settings.moments !== 'off' && profile !== 'static') {
            if (/TOUCHDOWN/.test(result)) {
              tl.at(tr, () => FD.Choreography.momentRing(scene, tl, scene.ball.getPos(), tr, true));
            } else if (/FIRST DOWN/.test(result) && scene.ltg) {
              tl.track(tr, 1.2, (p) => scene.ltg.setOpacity(1 - 0.75 * Math.sin(Math.PI * p)), 'inOutSine');
            }
          }
        }

        if (cfg.freeze !== null) {
          tl.evaluate(cfg.freeze);
          document.documentElement.dataset.frozen = 'true';
          return; // design-review mode: stay on this frame
        }

        await animator.play(tl);
        failures = 0;
      } catch (err) {
        console.error(`[app] play ${info.play && info.play.id} failed:`, err);
        failures += 1;
        if (failures >= plays.length) {
          hud.error('Every play failed to render. See the console for details.');
          return;
        }
      } finally {
        if (scene && cfg.freeze === null) scene.destroy();
      }
      if (cfg.debug) console.debug('[app] stats', animator.stats);
      if (cfg.soak) {
        // Soak test: one line per finished play (also readable via --dump-dom).
        const line = `${info.play.id} nodes=${document.getElementsByTagName('*').length} defs=${stage.defs.childNodes.length} frames=${animator.stats.frames}`;
        console.log(`[soak] ${line}`);
        document.documentElement.dataset.soak = (document.documentElement.dataset.soak || '') + line + ';';
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})(window.FD);

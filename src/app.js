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

    // ?check=1: build every play once, collect warnings, stop. Results land on
    // <html data-check> so headless Chrome (--dump-dom) can read them: tools/check.sh
    if (cfg.check) {
      const lines = FD.Data.report.filter((r) => r.fatal.length).map((r) => `${r.id} FATAL ${r.fatal.join(' | ')}`);
      const nodes = new Set();
      for (const p of plays) {
        const scene = FD.PlayRenderer.build(p, stage, cfg);
        const tl = FD.Choreography.build(scene, { enter() {}, exit() {} }, cfg);
        for (let t = 0; t <= FD.Timing.phases.end; t += 0.25) tl.evaluate(t);
        if (scene.warnings.length) lines.push(`${p.id} ${scene.warnings.join(' | ')}`);
        scene.destroy();
        nodes.add(document.getElementsByTagName('*').length);
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
      cfg.exitShift = 0;
      cfg.frameLock = null;
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
      const both = LIB && filter ? (p) => LIB(p) && filter(p) : LIB || filter;
      const info = playlist.next(both && plays.some(both) ? both : filter);
      if (drive) info.drive = cfg.place;
      let scene = null;
      try {
        scene = FD.PlayRenderer.build(info.play, stage, cfg);
        hud.set(info.play, info, cfg);

        const profile = FD.Config.profile(cfg);
        // Drive: decide the result first (it shapes the exit), show it during the hold.
        const result = drive ? drive.advance(info.play) : null;
        if (drive && cfg.settings.flow !== 'fade' && drive.state.shift > 0 && profile !== 'static') {
          cfg.exitShift = drive.state.shift; // continuous: this play's exit scrolls by the gain
        }
        const tl = profile === 'static'
          ? FD.Choreography.buildStatic(scene, hud, cfg)
          : FD.Choreography.build(scene, hud, cfg);

        if (drive) {
          const tr = profile === 'static' ? 1.2 : FD.Timing.phases.hold - 0.3;
          tl.at(tr, () => hud.result(result));
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

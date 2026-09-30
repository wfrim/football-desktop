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
      // Field position (drive mode takes over in drive.js).
      const q = new URLSearchParams(location.search);
      let filter = null;
      if (cfg.settings.drive === 'on') {
        // Drive mode owns field position and play selection.
        if (!drive) drive = FD.Drive.create();
        cfg.place = drive.place(cfg.settings.hash);
        filter = (p) => drive.eligible(p);
      } else {
        drive = null;
        const place = q.has('spot') // review aid: ?spot=92&at_hash=left
          ? { spot: Math.max(1, Math.min(99, parseInt(q.get('spot'), 10) || 50)), hash: q.get('at_hash') || 'middle' }
          : FD.FieldPosition.pick(cfg.settings);
        cfg.place = place;
        if (place && place.spot !== null) filter = (p) => FD.FieldPosition.fits(p, place.spot);
      }
      const info = playlist.next(filter);
      if (drive) info.drive = cfg.place;
      let scene = null;
      try {
        scene = FD.PlayRenderer.build(info.play, stage, cfg);
        hud.set(info.play, info, cfg);

        const profile = FD.Config.profile(cfg);
        const tl = profile === 'static'
          ? FD.Choreography.buildStatic(scene, hud, cfg)
          : FD.Choreography.build(scene, hud, cfg);

        if (drive) {
          // The result appears while the finished diagram holds.
          const result = drive.advance(info.play);
          tl.at(profile === 'static' ? 1.2 : FD.Timing.phases.hold - 0.3, () => hud.result(result));
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

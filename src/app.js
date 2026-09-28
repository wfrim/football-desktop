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

    const playlist = new FD.Playlist(plays, { order: cfg.order, seed: cfg.seed, start: cfg.start });
    const animator = new FD.Animator({ timeScale: cfg.speed, maxFps: cfg.fps });
    FD.app = { cfg, stage, animator, playlist }; // handy from the console

    let failures = 0;
    for (;;) {
      const info = playlist.next();
      let scene = null;
      try {
        scene = FD.PlayRenderer.build(info.play, stage, cfg);
        hud.set(info.play, info, cfg);

        const profile = FD.Config.profile(cfg);
        const tl = profile === 'static'
          ? FD.Choreography.buildStatic(scene, hud, cfg)
          : FD.Choreography.build(scene, hud, cfg);

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

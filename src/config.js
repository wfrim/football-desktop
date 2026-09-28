/*
 * config.js — runtime options, read from the URL so Plash (or a browser
 * bookmark) can configure the wallpaper without editing code.
 *
 *   ?mode=diagram|simulation     presentation mode            (default diagram)
 *   ?motion=auto|full|static     motion profile               (default auto)
 *   ?speed=1                     global pace multiplier       (0.25 – 4)
 *   ?labels=skill|all|none       role letters on markers      (default skill)
 *   ?fps=60                      frame cap while animating    (15 – 120)
 *   ?order=mix|shuffle|sequential playlist order (mix: alternates run/pass/screen)
 *   ?list=run                    playlist filter by tag (run, pass, screen, zone, gap, quick, <conceptId>…)
 *   ?seed=1                      shuffle seed
 *   ?t=5.5                       freeze at a time (design review / screenshots)
 *   ?mocktag=0                   hide the "mock data" note in the counter
 *   ?debug=1                     draw the camera frame, log stats
 *
 * motion=auto resolves per play: prefers-reduced-motion → static; a
 * discharging battery (where the Battery API exists) → static; else full.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let battery = null;
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
  }
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  const Config = {
    read() {
      const q = new URLSearchParams(location.search);
      const num = (k, d) => (q.has(k) && !isNaN(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
      const pick = (k, allowed, d) => (allowed.includes(q.get(k)) ? q.get(k) : d);
      return {
        mode: pick('mode', ['diagram', 'simulation'], 'diagram'),
        motion: pick('motion', ['auto', 'full', 'static', 'reduced'], 'auto'),
        speed: clamp(num('speed', 1), 0.25, 4),
        labels: pick('labels', ['skill', 'all', 'none'], 'skill'),
        fps: clamp(Math.round(num('fps', 60)), 15, 120),
        order: pick('order', ['mix', 'shuffle', 'sequential'], 'mix'),
        list: q.get('list') || null,
        seed: q.has('seed') ? Math.round(num('seed', 1)) : Date.now() % 1e9, // fresh order each launch
        soak: q.has('soak'),
        start: q.get('play'),
        freeze: q.has('t') ? num('t', null) : null,
        mockTag: q.get('mocktag') !== '0',
        debug: q.get('debug') === '1',
      };
    },

    /** 'full' | 'static'. Re-evaluated before every play, so it tracks changes. */
    profile(cfg) {
      if (cfg.motion === 'full') return 'full';
      if (cfg.motion === 'static' || cfg.motion === 'reduced') return 'static';
      if (reducedMotion && reducedMotion.matches) return 'static';
      if (battery && !battery.charging) return 'static';
      return 'full';
    },
  };

  FD.Config = Config;
})(window.FD);

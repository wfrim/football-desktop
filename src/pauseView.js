/*
 * pauseView.js — Settings → Click to pause. Click anywhere on the wallpaper
 * (not the play counter / settings) to freeze the play; a small strip lets you
 * step through it (←/→ 0.1 s, Shift = 1 s), scrub, or resume (click / Space).
 * While paused nothing animates, so the strip costs nothing. In Plash, clicks
 * reach the page only in Browsing Mode.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const PauseView = {
    create(animator) {
      const bar = document.createElement('div');
      bar.className = 'fd-pause';
      bar.hidden = true;
      bar.innerHTML = `
        <button type="button" data-a="back" title="Back 0.1 s (←)">&#9664;&#9664;</button>
        <button type="button" data-a="play" title="Resume (Space)">&#9654;</button>
        <button type="button" data-a="fwd" title="Forward 0.1 s (→)">&#9654;&#9654;</button>
        <input type="range" min="0" max="10" step="0.05" value="0" aria-label="Scrub the play">
        <span class="fd-pause-t"></span>`;
      document.body.appendChild(bar);
      const range = bar.querySelector('input');
      const label = bar.querySelector('.fd-pause-t');

      const show = () => {
        const t = animator.now();
        range.max = String(Math.max(0.1, animator.duration - 0.05));
        range.value = String(t);
        label.textContent = `PAUSED · ${t.toFixed(1)} s`;
      };
      const pause = () => { animator.pause(); if (!animator.paused) return; bar.hidden = false; show(); };
      const resume = () => { animator.resume(); bar.hidden = true; };
      const step = (dt) => { if (!animator.paused) pause(); animator.seek(animator.now() + dt); show(); };

      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = e.target.closest('button');
        if (!a) return;
        if (a.dataset.a === 'play') resume();
        else step(a.dataset.a === 'back' ? -0.1 : 0.1);
      });
      range.addEventListener('input', () => { animator.seek(parseFloat(range.value)); show(); });

      const enabled = () => FD.Settings.get().pause !== 'off';
      document.addEventListener('click', (e) => {
        if (!enabled() || e.target.closest('.fd-panel, .hud-counter, .fd-pause')) return;
        if (document.querySelector('.fd-panel.is-open')) return; // that click closes the settings
        if (animator.paused) resume(); else pause();
      }, true); // capture: decide before the settings sheet's own outside-click closes it
      document.addEventListener('keydown', (e) => {
        if (!enabled() || e.target.closest('input:not([type=range]), textarea')) return;
        if (e.key === ' ') { e.preventDefault(); if (animator.paused) resume(); else pause(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
        }
      });
      return { pause, resume };
    },
  };

  FD.PauseView = PauseView;
})(window.FD);

/*
 * animator.js — the one and only clock.
 *
 * - One requestAnimationFrame loop, running only while a track is mid-flight.
 * - During holds (nothing changing) it sleeps on a single setTimeout until the
 *   next track/event starts, so a finished diagram costs ~0 CPU.
 * - Pauses when the document is hidden and resumes without skipping ahead.
 * - Optional frame cap (maxFps) for battery-conscious setups.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  class Animator {
    constructor(opts) {
      const o = opts || {};
      this.timeScale = o.timeScale || 1;
      this.minFrameMs = o.maxFps && o.maxFps < 120 ? 1000 / o.maxFps - 1.5 : 0;

      this._tl = null;
      this._resolve = null;
      this._raf = 0;
      this._timer = 0;
      this._t0 = 0;
      this._pausedAt = 0;
      this._lastFrame = 0;

      this.stats = { frames: 0, sleeps: 0 };

      this._tick = this._tick.bind(this);
      this._onVisibility = this._onVisibility.bind(this);
      document.addEventListener('visibilitychange', this._onVisibility);
    }

    /** Run a timeline to completion. Resolves when t >= duration. */
    play(timeline) {
      this._cancel();
      return new Promise((resolve) => {
        this._tl = timeline;
        this._resolve = resolve;
        this._t0 = performance.now();
        this._userPaused = false;
        this._pausedAt = document.hidden ? this._t0 : 0;
        if (!document.hidden) this._requestFrame();
      });
    }

    // ── Click-to-pause (pauseView.js) ─────────────────────────────────────
    get paused() { return !!this._userPaused; }
    get duration() { return this._tl ? this._tl.duration : 0; }
    /** Current play time (seconds of timeline). */
    now() {
      if (!this._tl) return 0;
      return this._time(this._pausedAt || performance.now());
    }
    pause() {
      if (!this._tl || this._userPaused) return;
      this._userPaused = true;
      if (!this._pausedAt) this._pausedAt = performance.now();
      this._cancel();
    }
    resume() {
      if (!this._userPaused) return;
      this._userPaused = false;
      if (document.hidden || !this._tl) return;
      this._t0 += performance.now() - this._pausedAt;
      this._pausedAt = 0;
      this._requestFrame();
    }
    /** While paused: show the play at time t (seconds) and continue from there on resume. */
    seek(t) {
      if (!this._tl || !this._pausedAt) return;
      const tt = Math.max(0, Math.min(this._tl.duration - 0.02, t));
      this._t0 = this._pausedAt - (tt / this.timeScale) * 1000;
      this._tl.evaluate(tt);
    }

    destroy() {
      this._cancel();
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._tl = null;
      this._resolve = null;
    }

    _time(now) {
      return ((now - this._t0) / 1000) * this.timeScale;
    }

    _tick(now) {
      this._raf = 0;
      if (!this._tl || this._pausedAt) return;

      if (this.minFrameMs && now - this._lastFrame < this.minFrameMs) {
        this._requestFrame();
        return;
      }
      this._lastFrame = now;
      this.stats.frames += 1;

      const t = this._time(now);
      const st = this._tl.evaluate(t);

      if (st.done) {
        const resolve = this._resolve;
        this._tl = null;
        this._resolve = null;
        if (resolve) resolve();
        return;
      }

      if (st.active) {
        if (this.minFrameMs) {
          // Frame cap: sleep until the next frame is due instead of waking on
          // every display refresh (120 Hz panels) only to skip it.
          const due = this.minFrameMs - (performance.now() - now);
          this._timer = setTimeout(() => {
            this._timer = 0;
            this._requestFrame();
          }, Math.max(0, due - 4));
        } else {
          this._requestFrame();
        }
      } else {
        // Nothing moving: sleep until the next scheduled change.
        const waitMs = ((st.next - t) / this.timeScale) * 1000;
        if (waitMs > 32) {
          this.stats.sleeps += 1;
          this._timer = setTimeout(() => {
            this._timer = 0;
            this._requestFrame();
          }, waitMs - 16);
        } else {
          this._requestFrame();
        }
      }
    }

    _requestFrame() {
      if (!this._raf) this._raf = requestAnimationFrame(this._tick);
    }

    _cancel() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._timer) clearTimeout(this._timer);
      this._raf = 0;
      this._timer = 0;
    }

    _onVisibility() {
      if (!this._tl) return;
      if (document.hidden) {
        if (!this._pausedAt) this._pausedAt = performance.now();
        this._cancel();
      } else if (this._pausedAt && !this._userPaused) {
        // Shift the origin so the play resumes exactly where it left off.
        this._t0 += performance.now() - this._pausedAt;
        this._pausedAt = 0;
        this._requestFrame();
      }
    }
  }

  FD.Animator = Animator;
})(window.FD);

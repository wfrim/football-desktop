/*
 * timeline.js — all pacing lives here.
 *
 *   FD.Timing    global phase times + per-kind draw speeds (edit to re-pace everything)
 *   FD.Ease      easing functions
 *   FD.Timeline  a passive list of tracks and events; it never schedules itself.
 *                The Animator (animator.js) owns the single clock that drives it.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  const Ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  /*
   * Phase times, in seconds from the moment a play appears. Placeholders from
   * the brief, tuned slightly for the mock. Everything else is expressed
   * relative to these, so re-pacing the whole wallpaper is a one-line change.
   */
  const Timing = {
    phases: {
      enter: 0.0,    // formation fades in
      motion: 1.5,   // pre-snap motion (if any)
      snap: 2.0,
      assign: 2.1,   // routes / assignments begin
      read: 3.0,     // progression emphasis
      release: 4.3,  // ball leaves the QB
      arrive: 4.85,  // ball reaches target
      hold: 6.0,     // finished diagram holds
      exit: 8.2,     // fade begins
      end: 9.0,      // next play
    },

    losDraw: 0.9,
    markerEnter: 0.6,
    markerStagger: 0.045,
    snapDuration: 0.24,
    readStagger: 0.14,
    readFade: 0.4,
    catchPulse: 0.9,
    exchange: 0.28,   // QB → carrier ball travel at a handoff

    // Reduced-motion / static profile.
    staticHold: 16,
    staticFade: 1.2,

    /*
     * Per-kind defaults. `speed` is draw speed in yards/second; duration is
     * length / speed, clamped to [min, max]. Longer routes take longer to draw,
     * which reads as more natural than a fixed duration.
     * `moves`: whether the player marker travels along the path in SIMULATION mode.
     */
    kinds: {
      route:  { phase: 'assign', delay: 0,    speed: 11, min: 0.7,  max: 2.3, ease: 'inOutQuad', moves: true },
      run:    { phase: 'snap',   delay: 0.3,  speed: 7,  min: 0.9,  max: 2.4, ease: 'inOutSine', moves: true },
      block:  { phase: 'snap',   delay: 0.08, speed: 3,  min: 0.35, max: 0.6, ease: 'outCubic',  moves: true },
      pull:   { phase: 'snap',   delay: 0.05, speed: 9,  min: 0.6,  max: 1.5, ease: 'inOutQuad', moves: true },
      lead:   { phase: 'snap',   delay: 0.15, speed: 8,  min: 0.5,  max: 1.3, ease: 'inOutQuad', moves: true },
      qb:     { phase: 'snap',   delay: 0.28, speed: 4,  min: 0.5,  max: 1.0, ease: 'outCubic',  moves: true },
      motion: { phase: 'motion', delay: 0,    speed: 7,  min: 0.35, max: 1.2, ease: 'inOutSine', moves: true },
    },

    /** Resolve an assignment's {start, duration} from data + kind defaults. */
    resolve(kind, timing, length) {
      const k = Timing.kinds[kind] || Timing.kinds.route;
      const t = timing || {};
      const phaseTime = Timing.phases[t.phase || k.phase];
      const start = typeof t.at === 'number'
        ? t.at
        : (phaseTime !== undefined ? phaseTime : 0) + (typeof t.delay === 'number' ? t.delay : k.delay);
      const duration = typeof t.duration === 'number'
        ? t.duration
        : Math.max(k.min, Math.min(k.max, length / k.speed));
      return { start, duration, ease: t.ease || k.ease };
    },
  };

  /*
   * A Timeline is data: tracks (start, duration, update(easedP, rawP)) and
   * one-shot events. evaluate(t) applies state for time t and reports whether
   * anything is mid-flight, so the Animator can sleep during holds.
   */
  class Timeline {
    constructor(duration) {
      this.duration = duration;
      this.tracks = [];
      this.events = [];
      this._sorted = true;
    }

    track(start, duration, update, ease) {
      const fn = typeof ease === 'function' ? ease : Ease[ease] || Ease.linear;
      this.tracks.push({ start, duration: Math.max(0, duration), update, ease: fn, last: undefined });
      return this;
    }

    at(time, fn) {
      this.events.push({ time, fn, fired: false });
      this._sorted = false;
      return this;
    }

    evaluate(t) {
      if (!this._sorted) {
        this.events.sort((a, b) => a.time - b.time);
        this._sorted = true;
      }
      let active = false;
      let next = Infinity;

      for (const tr of this.tracks) {
        if (t < tr.start) {
          if (tr.start < next) next = tr.start;
          continue;
        }
        const raw = tr.duration > 0 ? clamp01((t - tr.start) / tr.duration) : 1;
        if (raw !== tr.last) {
          tr.update(tr.ease(raw), raw);
          tr.last = raw;
        }
        if (raw < 1) active = true;
      }

      for (const ev of this.events) {
        if (ev.fired) continue;
        if (ev.time <= t) {
          ev.fired = true;
          ev.fn();
        } else {
          if (ev.time < next) next = ev.time;
          break;
        }
      }

      return { active, next: Math.min(next, this.duration), done: t >= this.duration };
    }
  }

  FD.Ease = Ease;
  FD.Timing = Timing;
  FD.Timeline = Timeline;
})(window.FD);

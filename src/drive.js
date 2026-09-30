/*
 * drive.js — drive mode: plays link into a possession.
 *
 * State: spot (yards from own goal), down, distance, drive number. Each play
 * is chosen for the situation (eligible(play)), then a plausible gain is
 * applied (advance(play)). Drives end in a touchdown, a field goal or a punt;
 * the next drive starts between the 20 and the 35.
 *
 * Gains are storytelling, not simulation: the wallpaper is showing what the
 * concept is for. The field scrolls by the gain between plays (app.js /
 * choreography.js via place.shift).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const chance = (p) => Math.random() < p;
  const ordinal = (n) => ['', '1ST', '2ND', '3RD', '4TH'][n] || `${n}TH`;
  const tagged = (p, t) => (p.tags || []).includes(t);

  function gainFor(play) {
    if (tagged(play, 'deep')) return chance(0.75) ? r(18, 38) : r(8, 15);
    switch (play.family) {
      case 'run': return chance(0.12) ? r(0, 1) : chance(0.2) ? r(8, 16) : r(2, 7);
      case 'quick_pass': return chance(0.12) ? r(10, 18) : r(4, 9);
      case 'screen': return chance(0.2) ? r(12, 22) : r(3, 10);
      case 'rpo': return r(4, 12);
      case 'play_action': return chance(0.4) ? r(16, 30) : r(7, 15);
      default: return chance(0.3) ? r(15, 26) : r(6, 14);
    }
  }

  const Drive = {
    create() {
      const st = { spot: r(20, 35), down: 1, distance: 10, number: 1, play: 0, shift: 0 };

      const drive = {
        state: st,

        /** Is `play` a sensible call right now (and does it fit on the field)? */
        eligible(play) {
          if (play.family === 'defense') return false; // drives are the offense's story
          if (!FD.FieldPosition.fits(play, st.spot)) return false;
          const toGoal = 100 - st.spot;
          const long = st.distance >= 7 && st.down >= 3;
          const short = st.distance <= 2;
          if (long && play.family === 'run' && play.conceptId !== 'draw') return false;
          if (short && (tagged(play, 'deep') || play.family === 'screen')) return false;
          if (toGoal <= 5 && play.family === 'screen') return false;
          return true;
        },

        /** Where the next play is snapped, for the renderer and the HUD. */
        place(hashSetting) {
          const toGoal = 100 - st.spot;
          const dist = st.distance >= toGoal ? 'GOAL' : st.distance;
          return {
            spot: st.spot,
            hash: hashSetting === 'random' ? ['left', 'middle', 'right'][r(0, 2)] : 'middle',
            distance: Math.min(st.distance, toGoal),
            situation: `${ordinal(st.down)} & ${dist}`,
            shift: st.shift,
            drive: st.number,
            play: st.play + 1,
          };
        },

        /** Apply the result of `play`; returns the line shown during the hold. */
        advance(play, outcome) {
          st.play += 1;
          const toGoal = 100 - st.spot;
          // Live game: what happened on screen decides the drive.
          if (outcome && outcome.type === 'incomplete') {
            st.shift = 0;
            st.down += 1;
            if (st.down > 4) return next('TURNOVER ON DOWNS', 0, false);
            if (st.down === 4 && st.distance > 2) return st.spot >= 63 ? next('FIELD GOAL', 0, false) : next('PUNT', 0, false);
            return 'INCOMPLETE';
          }
          let gain = outcome ? Math.max(-6, Math.min(outcome.type === 'score' ? toGoal : outcome.gain, toGoal)) : Math.min(gainFor(play), toGoal);
          if (gain >= toGoal) return next('TOUCHDOWN', gain, true);
          st.spot += gain;
          st.shift = gain;
          if (gain < 0) { st.distance -= gain; st.down += 1; return `TACKLE FOR LOSS \u00B7 ${gain}`; }
          if (gain >= st.distance) {
            st.down = 1;
            st.distance = 10;
            return `+${gain} · FIRST DOWN`;
          }
          st.distance -= gain;
          st.down += 1;
          if (st.down === 4 && st.distance > 2) {
            if (st.spot >= 63) return next('FIELD GOAL', gain, false);
            return next('PUNT', gain, false);
          }
          if (st.down > 4) return next('TURNOVER ON DOWNS', gain, false);
          return gain > 0 ? `+${gain}` : 'NO GAIN';
        },
      };

      function next(label, gain, td) {
        st.number += 1;
        st.play = 0;
        st.spot = r(20, 35);
        st.down = 1;
        st.distance = 10;
        st.shift = 0; // a new drive fades in rather than scrolling
        return td ? `+${gain} · ${label}` : label;
      }

      return drive;
    },
  };

  FD.Drive = Drive;
})(window.FD);

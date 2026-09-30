/*
 * fieldPosition.js — where the ball is for the next play (outside drive mode).
 *
 *   classic   null: the LOS-relative look, no field numbers
 *   random    anywhere between the 15s, any hash
 *   redzone   inside the opponent's 20
 *
 * fits(play, spot) keeps the artwork on the field: no path may run past the
 * end line (deep shots simply aren't eligible near the goal line).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const pickHash = (mode) => (mode === 'random' ? ['left', 'middle', 'right'][Math.floor(Math.random() * 3)] : 'middle');
  const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  const FieldPosition = {
    /** A place { spot, hash } for the next play, or null (classic). */
    pick(settings) {
      switch (settings.field) {
        case 'random': return { spot: between(15, 85), hash: pickHash(settings.hash) };
        case 'redzone': return { spot: between(80, 97), hash: pickHash(settings.hash) };
        default: return settings.hash === 'random' ? { spot: null, hash: pickHash('random') } : null;
      }
    },

    /** Does every path of `play` stay inside the far end line from `spot`? */
    fits(play, spot) {
      if (spot === null || spot === undefined) return true;
      return FD.PlayRenderer.deepest(play) <= 110 - spot - 0.8;
    },

    /** "OWN 34" / "MIDFIELD" / "OPP 12". */
    label(spot) {
      if (spot === null || spot === undefined) return '';
      if (spot === 50) return 'MIDFIELD';
      return spot < 50 ? `OWN ${spot}` : `OPP ${100 - spot}`;
    },
  };

  FD.FieldPosition = FieldPosition;
})(window.FD);

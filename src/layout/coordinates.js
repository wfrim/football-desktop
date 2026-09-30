/*
 * coordinates.js — the ONLY place that knows how play-data coordinates map to
 * drawing space. If the football-data workstream picks a different convention
 * (feet, hash-relative origin, flipped lateral axis…), change `convention`
 * here; the renderer and primitives do not need to change.
 *
 * Three spaces:
 *
 *   DATA space      whatever the JSON uses (see `convention`, provisional).
 *   FIELD space     internal. Yards. Origin = ball on the line of scrimmage.
 *                   +x = offense's right, +y = downfield (toward the defense).
 *   SVG space       drawing. Yards. Origin = field center-line on the LOS.
 *                   +x = right on screen, +y = DOWN on screen (so downfield is up).
 *
 * SVG space is yard-based on purpose: the viewBox (see responsive.js) decides
 * how many screen pixels a yard gets, so artwork never touches pixels.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const FIELD = {
    halfWidth: 160 / 6, // 53⅓ yd wide
    hashes: {
      nfl: 18.5 / 6,  // hash marks 18'6" apart → ±3.083 yd from center
      college: 20 / 3, // 40' apart → ±6.667 yd
      high_school: 160 / 18, // field in thirds → ±8.889 yd
    },
  };

  // PROVISIONAL — mirrors DATA_CONTRACT_NOTES.md. Replace when the canonical
  // schema arrives.
  const convention = {
    units: 'yd',         // 'yd' | 'ft'
    lateral: 'right',    // which direction is +x, from the offense's view: 'right' | 'left'
    depth: 'downfield',  // which direction is +y: 'downfield' | 'backfield'
  };

  function unitScale() {
    return convention.units === 'ft' ? 1 / 3 : 1;
  }

  const Coords = {
    FIELD,
    convention,

    setConvention(next) {
      Object.assign(convention, next || {});
    },

    /** Scalar distance from data units to yards. */
    scalar(n) {
      return (Number(n) || 0) * unitScale();
    },

    /** Lateral sign so 'left'/'right' in data map correctly to field space. */
    lateralSign() {
      return convention.lateral === 'left' ? -1 : 1;
    },

    /** Point or vector in data space → field space (yards). */
    fromData(p) {
      const k = unitScale();
      const sx = convention.lateral === 'left' ? -1 : 1;
      const sy = convention.depth === 'backfield' ? -1 : 1;
      return [(Number(p[0]) || 0) * k * sx, (Number(p[1]) || 0) * k * sy];
    },

    /** Lateral position of the ball in field-absolute yards. */
    ballX(play) {
      const ball = (play.formation && play.formation.ball) || play.ball_spot || {};
      const hashes = FIELD.hashes[(play.field && play.field.hashes) || 'nfl'] || FIELD.hashes.nfl;
      if (typeof ball.x === 'number') return Coords.scalar(ball.x) * Coords.lateralSign();
      switch (ball.hash) {
        case 'left': return -hashes;
        case 'right': return hashes;
        default: return 0;
      }
    },

    /** Lateral ball position for a hash name (left | middle | right). */
    hashX(hash) {
      const h = FIELD.hashes.nfl;
      return hash === 'left' ? -h : hash === 'right' ? h : 0;
    },

    /** Field space (relative to ball) → SVG space. */
    toSvg(p, ballX) {
      return [ballX + p[0], -p[1]];
    },

    /** Field-absolute (x from field center) → SVG space. */
    absToSvg(p) {
      return [p[0], -p[1]];
    },

    /**
     * The canonical camera frame, in field-absolute yards. Every play is drawn
     * at the same scale so the wallpaper doesn't "zoom" between plays.
     * Plays may override with `play.frame` (same shape) if ever needed.
     */
    DEFAULT_FRAME: { x0: -29.5, x1: 29.5, y0: -9, y1: 20 },

    /**
     * The second canonical camera, for plays whose artwork stays within
     * ~10 yd of the LOS (runs, screens, quick game). Only two scales exist,
     * so the wallpaper never zooms to arbitrary sizes between plays.
     */
    TIGHT_FRAME: { x0: -21, x1: 21, y0: -9, y1: 11.5 },
    TIGHT_MAX_DEPTH: 10,

    frameToSvg(fr) {
      return { x0: fr.x0, x1: fr.x1, y0: -fr.y1, y1: -fr.y0 };
    },
  };

  FD.Coords = Coords;
})(window.FD);

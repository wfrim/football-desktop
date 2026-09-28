/*
 * stage.js — the persistent SVG: defs, the field, a layer for the current
 * play, and resize handling (coalesced to one update per frame).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const { el } = FD.svg;

  const Stage = {
    create(svg, cfg) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const defs = el('defs', null, svg);
      const field = FD.FieldRenderer.create(svg, defs, {});
      const playLayer = el('g', { class: 'play-layer' }, svg);
      let frame = FD.Coords.frameToSvg(FD.Coords.DEFAULT_FRAME);
      let frameKey = 'default';
      const debugRect = cfg.debug ? el('rect', { class: 'debug-frame' }, svg) : null;
      const drawDebug = () => {
        if (debugRect) {
          for (const [k, v] of Object.entries({ x: frame.x0, y: frame.y0, width: frame.x1 - frame.x0, height: frame.y1 - frame.y0 })) debugRect.setAttribute(k, v);
        }
      };
      drawDebug();

      let raf = 0;
      const apply = () => {
        raf = 0;
        FD.Responsive.apply(svg, frame);
      };
      const onResize = () => {
        if (!raf) raf = requestAnimationFrame(apply);
      };
      apply();
      window.addEventListener('resize', onResize);

      return {
        svg,
        defs,
        field,
        playLayer,
        get frame() { return frame; },
        /** Switch canonical camera ('default' | 'tight'). Returns true if it changed. */
        setFrame(key) {
          if (key === frameKey) return false;
          frameKey = key;
          frame = FD.Coords.frameToSvg(key === 'tight' ? FD.Coords.TIGHT_FRAME : FD.Coords.DEFAULT_FRAME);
          apply();
          drawDebug();
          return true;
        },
        destroy() {
          window.removeEventListener('resize', onResize);
          if (raf) cancelAnimationFrame(raf);
        },
      };
    },
  };

  FD.Stage = Stage;
})(window.FD);

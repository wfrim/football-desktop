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
      const frame = FD.Coords.frameToSvg(FD.Coords.DEFAULT_FRAME);

      if (cfg.debug) {
        el('rect', {
          x: frame.x0, y: frame.y0, width: frame.x1 - frame.x0, height: frame.y1 - frame.y0, class: 'debug-frame',
        }, svg);
      }

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
        frame,
        destroy() {
          window.removeEventListener('resize', onResize);
          if (raf) cancelAnimationFrame(raf);
        },
      };
    },
  };

  FD.Stage = Stage;
})(window.FD);

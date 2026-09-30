/*
 * hud.js — the typographic layer (HTML, not SVG, for the best text rendering).
 * Transitions are CSS; the timeline only toggles enter/exit at the right time.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const pad = (n) => String(n).padStart(3, '0');

  const Hud = {
    create(root) {
      const parts = {};
      root.querySelectorAll('[data-part]').forEach((node) => { parts[node.dataset.part] = node; });
      const setText = (k, v) => {
        if (!parts[k]) return;
        parts[k].textContent = v || '';
        parts[k].hidden = !v;
      };

      return {
        set(play, info, cfg) {
          // Copy is authored per play by the football-data workstream;
          // fall back to structured fields where a line isn't provided.
          const c = play.copy || {};
          const sit = play.situation || {};
          const down = sit.down ? `${ordinal(sit.down)} & ${sit.distanceLabel || sit.distance || ''}`.trim() : '';
          setText('concept', c.title || play.name);
          setText('meta', c.meta);
          setText('formation', c.formation);
          const where = cfg.place && cfg.place.spot !== null && cfg.place.spot !== undefined ? FD.FieldPosition.label(cfg.place.spot) : '';
          const base = cfg.place && cfg.place.situation ? cfg.place.situation : c.situation || [sit.coverage, down].filter(Boolean).join(' \u00B7 ');
          setText('situation', [base, where].filter(Boolean).join(' \u00B7 '));
          setText('description', c.description);
          setText('counter', `Play ${pad(info.number)} / ${pad(info.total)}`);
          setText('flag', play._mock && cfg.mockTag ? 'Mock data' : '');
        },
        enter() {
          root.classList.remove('is-out');
          root.classList.add('is-in');
        },
        exit() {
          root.classList.remove('is-in');
          root.classList.add('is-out');
        },
        error(message) {
          setText('concept', '');
          setText('meta', '');
          setText('formation', '');
          setText('situation', 'Nothing to show');
          setText('description', message);
          root.classList.add('is-in', 'is-error');
        },
      };
    },
  };

  FD.Hud = Hud;
})(window.FD);

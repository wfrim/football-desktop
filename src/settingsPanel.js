/*
 * settingsPanel.js — the only control surface. Hidden until the play counter
 * (bottom right) is clicked; a small typographic sheet with segmented
 * choices. Changes save immediately; the theme applies at once, everything
 * else from the next play.
 *
 * In Plash, clicks reach the page only in Browsing Mode.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const IDLE_MS = 20000;

  const SettingsPanel = {
    create(trigger) {
      const S = FD.Settings;
      const panel = document.createElement('div');
      panel.className = 'fd-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Wallpaper settings');
      panel.hidden = true;

      const title = document.createElement('p');
      title.className = 'fd-panel-title';
      title.textContent = 'Settings';
      panel.appendChild(title);

      const rows = {};
      for (const [key, def] of Object.entries(S.SCHEMA)) {
        const row = document.createElement('div');
        row.className = 'fd-row';
        const label = document.createElement('span');
        label.className = 'fd-label';
        label.textContent = def.label;
        const seg = document.createElement('div');
        seg.className = 'fd-seg';
        for (const [val, text] of def.choices) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = text;
          b.dataset.value = val;
          b.addEventListener('click', () => { S.set(key, val); refresh(); poke(); });
          seg.appendChild(b);
        }
        row.appendChild(label);
        row.appendChild(seg);
        panel.appendChild(row);
        rows[key] = seg;
      }

      const note = document.createElement('p');
      note.className = 'fd-panel-note';
      panel.appendChild(note);
      document.body.appendChild(panel);

      function refresh() {
        const cur = S.get();
        for (const [key, seg] of Object.entries(rows)) {
          const locked = S.pinned(key);
          seg.classList.toggle('is-locked', locked);
          for (const b of seg.children) {
            b.classList.toggle('is-on', b.dataset.value === cur[key]);
            b.disabled = locked;
          }
        }
        note.textContent = S.persistent()
          ? 'Saved on this Mac. Changes apply from the next play.'
          : 'This window can’t save settings; add them to the page URL instead.';
      }

      let idle = 0;
      function poke() {
        clearTimeout(idle);
        idle = setTimeout(close, IDLE_MS);
      }
      function open() {
        refresh();
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('is-open'));
        poke();
      }
      function close() {
        clearTimeout(idle);
        panel.classList.remove('is-open');
        panel.hidden = true;
      }

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (panel.hidden) open();
        else close();
      });
      document.addEventListener('click', (e) => {
        if (!panel.hidden && !panel.contains(e.target)) close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      panel.addEventListener('pointermove', poke);

      return { open, close };
    },
  };

  FD.SettingsPanel = SettingsPanel;
})(window.FD);

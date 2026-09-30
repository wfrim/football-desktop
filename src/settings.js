/*
 * settings.js — user settings: defaults ← saved (localStorage) ← URL params.
 *
 * The URL always wins, so review links (?play=…&t=…) and Plash website URLs
 * with parameters behave exactly as before. Storage can be unavailable
 * (private mode, sandboxed WebView): every access is guarded and the page
 * works on defaults.
 *
 * Settings are read by the app before each play; the theme applies at once.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const KEY = 'fd.settings';

  // Order = display order in the panel. Values are what the renderer understands.
  const SCHEMA = {
    theme:   { label: 'Theme',          choices: [['auto', 'Auto'], ['night', 'Night'], ['blueprint', 'Blueprint'], ['chalk', 'Chalk'], ['paper', 'Paper']], def: 'night' },
    defense: { label: 'Defense',        choices: [['off', 'Off'], ['faint', 'Faint'], ['key', 'Faint + key']], def: 'faint' },
    field:   { label: 'Field position', choices: [['classic', 'Classic'], ['random', 'Anywhere'], ['redzone', 'Red zone']], def: 'classic' },
    hash:    { label: 'Hash',           choices: [['middle', 'Middle'], ['random', 'Varied']], def: 'middle' },
    drive:   { label: 'Drive mode',     choices: [['off', 'Off'], ['on', 'On']], def: 'off' },
    motion:  { label: 'Motion',         choices: [['full', 'Full'], ['calm', 'Calm'], ['still', 'Still']], def: 'full' },
    speed:   { label: 'Pace',           choices: [['0.8', 'Slow'], ['1', 'Normal'], ['1.25', 'Quick']], def: '1' },
  };

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      return {};
    }
  }

  function save(obj) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  const valid = (k, v) => SCHEMA[k] && SCHEMA[k].choices.some(([val]) => val === String(v));

  let saved = load();
  const url = new URLSearchParams(location.search);
  const listeners = [];

  const Settings = {
    SCHEMA,

    /** Current value of every setting (URL > saved > default). */
    get() {
      const out = {};
      for (const k in SCHEMA) {
        const u = url.get(k);
        out[k] = valid(k, u) ? u : valid(k, saved[k]) ? String(saved[k]) : SCHEMA[k].def;
      }
      return out;
    },

    /** True when a URL parameter pins this setting (the panel shows it locked). */
    pinned: (k) => valid(k, url.get(k)),

    set(k, v) {
      if (!valid(k, v)) return;
      saved = Object.assign({}, saved, { [k]: String(v) });
      save(saved);
      const all = Settings.get();
      listeners.forEach((fn) => fn(k, all[k], all));
    },

    onChange(fn) {
      listeners.push(fn);
    },

    /** Whether the last write reached storage (shown as a hint in the panel). */
    persistent() {
      return save(saved);
    },
  };

  FD.Settings = Settings;
})(window.FD);

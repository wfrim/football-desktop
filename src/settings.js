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
    // Look
    theme:      { group: 'Look', label: 'Theme',       choices: [['auto', 'Auto'], ['night', 'Night'], ['blueprint', 'Blueprint'], ['chalk', 'Chalk'], ['paper', 'Paper']], def: 'night' },
    brightness: { group: 'Look', label: 'Brightness',  choices: [['normal', 'Normal'], ['dim', 'Dim']], def: 'normal' },
    text:       { group: 'Look', label: 'Text',        choices: [['full', 'Full'], ['title', 'Title only'], ['none', 'None']], def: 'full' },
    lines:      { group: 'Look', label: 'Lines',       choices: [['precise', 'Precise'], ['hand', 'Hand-drawn']], def: 'precise' },
    zoom:       { group: 'Look', label: 'Zoom',        choices: [['close', 'Close'], ['standard', 'Standard'], ['wide', 'Wide']], def: 'standard' },
    // Football
    style:      { group: 'Football', label: 'Play style', choices: [['diagram', 'Diagram'], ['lead', 'Lead'], ['live', 'Live offense'], ['game', 'Live game']], def: 'diagram' },
    playout:    { group: 'Football', label: 'Play out', choices: [['standard', 'Standard'], ['extended', 'To the whistle']], def: 'standard' },
    call:       { group: 'Football', label: 'Defense call', choices: [['coop', 'Cooperative'], ['comp', 'Competitive']], def: 'coop' },
    pursuit:    { group: 'Football', label: 'Pursuit',    choices: [['calm', 'Calm'], ['aggressive', 'Aggressive']], def: 'calm' },
    options:    { group: 'Football', label: 'Option routes', choices: [['both', 'Both'], ['decide', 'Decide']], def: 'both' },
    library:    { group: 'Football', label: 'Library',    choices: [['all', 'Everything'], ['offense', 'Offense'], ['defense', 'Defense'], ['runs', 'Runs'], ['passes', 'Passes'], ['screens', 'Screens & RPO']], def: 'all' },
    defense:    { group: 'Football', label: 'Defense',    choices: [['off', 'Off'], ['faint', 'Faint'], ['key', 'Faint + key'], ['bold', 'Bold']], def: 'faint' },
    defink:     { group: 'Football', label: 'Defense ink', choices: [['faint', 'Faint'], ['medium', 'Medium'], ['full', 'Same as offense']], def: 'faint' },
    blitz:      { group: 'Football', label: 'Blitz tell', choices: [['off', 'Off'], ['on', 'On']], def: 'off' },
    matchup:    { group: 'Football', label: 'Matchup label', choices: [['on', 'On'], ['off', 'Off']], def: 'on' },
    field:      { group: 'Football', label: 'Field',      choices: [['classic', 'Classic'], ['random', 'Anywhere'], ['redzone', 'Red zone']], def: 'classic' },
    hash:       { group: 'Football', label: 'Hash',       choices: [['middle', 'Middle'], ['random', 'Varied']], def: 'middle' },
    drive:      { group: 'Football', label: 'Drive mode', choices: [['off', 'Off'], ['on', 'On']], def: 'off' },
    flow:       { group: 'Football', label: 'Drive flow', choices: [['continuous', 'Continuous'], ['fade', 'Fade']], def: 'continuous' },
    // Motion
    motion:     { group: 'Motion', label: 'Motion',      choices: [['full', 'Full'], ['calm', 'Calm'], ['still', 'Still']], def: 'full' },
    speed:      { group: 'Motion', label: 'Pace',        choices: [['0.55', 'Extra slow'], ['0.8', 'Slow'], ['1', 'Normal'], ['1.25', 'Quick']], def: '1' },
    length:     { group: 'Motion', label: 'Play length', choices: [['7', '7 s'], ['9', '9 s'], ['12', '12 s'], ['16', '16 s'], ['24', '24 s']], def: '9' },
    transition: { group: 'Motion', label: 'Transition',  choices: [['fade', 'Fade'], ['rewind', 'Rewind']], def: 'fade' },
    moments:    { group: 'Motion', label: 'Moments',     choices: [['on', 'On'], ['off', 'Off']], def: 'on' },
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

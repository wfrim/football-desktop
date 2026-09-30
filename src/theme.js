/*
 * theme.js — applies the theme setting to <html data-theme>. "auto" follows
 * the local clock: Blueprint by day, Night after dark (re-checked between plays).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  let current = null;

  function resolve(name) {
    if (name !== 'auto') return name;
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? 'blueprint' : 'night';
  }

  const Theme = {
    resolve,
    /** Apply `name`; `fade` crossfades the page (used for user changes). */
    apply(name, fade) {
      const next = resolve(name);
      if (next === current) return;
      const set = () => {
        current = next;
        document.documentElement.dataset.theme = next;
        document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next === 'paper' ? 'light' : 'dark');
      };
      if (!fade || current === null) { set(); return; }
      document.body.classList.add('is-theming');
      setTimeout(() => { set(); document.body.classList.remove('is-theming'); }, 460);
    },
  };

  FD.Theme = Theme;
  Theme.apply(FD.Settings.get().theme);
  FD.Settings.onChange((k, v) => { if (k === 'theme') Theme.apply(v, true); });
})(window.FD);

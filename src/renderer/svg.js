/*
 * svg.js — tiny DOM helpers for building SVG. No framework, no virtual DOM.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  /** Round to 3 decimals for compact, stable attribute strings. */
  function f(n) {
    const r = Math.round(n * 1000) / 1000;
    return r === 0 ? 0 : r; // avoid "-0"
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) {
        if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  let uid = 0;
  function id(prefix) {
    uid += 1;
    return `${prefix || 'fd'}-${uid}`;
  }

  FD.svg = { NS, el, f, id };
})(window.FD);

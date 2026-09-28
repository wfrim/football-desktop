/*
 * playlist.js — decides which play comes next. Deliberately small.
 *
 *   order: 'sequential' | 'shuffle'
 *   Shuffle is seeded (deterministic) and never repeats the same play twice
 *   in a row across reshuffles. Themed collections can later be a filter
 *   applied to `items` before constructing the playlist.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Playlist {
    constructor(items, opts) {
      const o = opts || {};
      this.items = items;
      this.order = o.order === 'shuffle' ? 'shuffle' : 'sequential';
      this.rand = mulberry32(o.seed || 1);
      this.queue = [];
      this.cursor = -1;
      this.lastIndex = -1;
      const at = o.start ? items.findIndex((p) => p.id === o.start) : -1;
      if (at >= 0) this.cursor = at - 1;
    }

    _refill() {
      const idx = this.items.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      if (idx.length > 1 && idx[0] === this.lastIndex) idx.push(idx.shift());
      this.queue = idx;
    }

    next() {
      let index;
      if (this.order === 'shuffle') {
        if (!this.queue.length) this._refill();
        index = this.queue.shift();
      } else {
        this.cursor = (this.cursor + 1) % this.items.length;
        index = this.cursor;
      }
      this.lastIndex = index;
      const play = this.items[index];
      return { play, index, number: play.number || index + 1, total: this.items.length };
    }
  }

  FD.Playlist = Playlist;
})(window.FD);

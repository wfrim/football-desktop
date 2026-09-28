/*
 * playlist.js — decides which play comes next. Deliberately small.
 *
 *   order: 'mix' (default) | 'shuffle' | 'sequential'
 *   mix      each cycle is a seeded shuffle, re-ordered greedily so the
 *            category alternates (pass / run / screen / rpo), the same concept
 *            never repeats within 3 plays, and a formation never runs 3 in a row.
 *   shuffle  plain seeded shuffle, no immediate repeats.
 *   list     optional filter by tag (?list=run, gap, zone, quick, screen…);
 *            tags come from family, subfamily, conceptId and play.tags.
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

  const CATEGORY = { run: 'run', screen: 'screen', rpo: 'rpo' };
  const category = (p) => CATEGORY[p.family] || 'pass';
  const tagsOf = (p) => new Set([p.family, p.subfamily, p.conceptId, category(p)].concat(p.tags || []).filter(Boolean));

  class Playlist {
    constructor(items, opts) {
      const o = opts || {};
      const filtered = o.list ? items.filter((p) => tagsOf(p).has(o.list)) : items;
      this.items = filtered.length ? filtered : items;
      this.order = ['shuffle', 'sequential'].includes(o.order) ? o.order : 'mix';
      this.history = [];
      this.rand = mulberry32(o.seed || 1);
      this.queue = [];
      this.cursor = -1;
      this.lastIndex = -1;
      const at = o.start ? this.items.findIndex((p) => p.id === o.start) : -1;
      if (at >= 0) this.cursor = at - 1;
      this.startIndex = at; // ?play= always comes first, whatever the order
    }

    _refill() {
      const idx = this.items.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      if (idx.length > 1 && idx[0] === this.lastIndex) idx.push(idx.shift());
      this.queue = this.order === 'mix' ? this._mix(idx) : idx;
    }

    /** Greedy re-order of a shuffled deck: lowest penalty next, ties keep shuffle order. */
    _mix(idx) {
      const out = [];
      const hist = this.history.slice(-3);
      const pool = idx.slice();
      while (pool.length) {
        let best = 0;
        let bestScore = Infinity;
        pool.forEach((i, k) => {
          const p = this.items[i];
          const recent = hist.map((j) => this.items[j]);
          const last = recent[recent.length - 1];
          let score = 0;
          if (last && category(last) === category(p)) score += 2;
          if (recent.some((q) => q.conceptId === p.conceptId)) score += 5;
          if (recent.length >= 2 && recent.slice(-2).every((q) => q.formation.id === p.formation.id)) score += 3;
          if (score < bestScore) { bestScore = score; best = k; }
        });
        const [i] = pool.splice(best, 1);
        out.push(i);
        hist.push(i);
        if (hist.length > 3) hist.shift();
      }
      return out;
    }

    next() {
      let index;
      if (this.startIndex >= 0 && this.order !== 'sequential') {
        index = this.startIndex;
        this.startIndex = -1;
      } else if (this.order !== 'sequential') {
        if (!this.queue.length) this._refill();
        index = this.queue.shift();
      } else {
        this.cursor = (this.cursor + 1) % this.items.length;
        index = this.cursor;
      }
      this.lastIndex = index;
      this.history.push(index);
      if (this.history.length > 3) this.history.shift();
      const play = this.items[index];
      return { play, index, number: play.number || index + 1, total: this.items.length };
    }
  }

  FD.Playlist = Playlist;
})(window.FD);

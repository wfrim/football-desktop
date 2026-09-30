/*
 * notes.js — Settings → Coach's note (Live game): one short line under the
 * result saying WHY the play worked or didn't, read off the simulation's
 * record (sim.js outcome.why): who covered, who shed which block, who was
 * left unblocked, how open the receiver was.
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const DEF = {
    CB: 'the corner', FS: 'the free safety', SS: 'the strong safety', NB: 'the nickel', DIME: 'the dime',
    MIKE: 'the Mike', WILL: 'the Will', SAM: 'the Sam', N: 'the nose', OLB: 'the edge backer', E: 'the defensive end', T: 'the defensive tackle',
  };
  const OFF = { LT: 'left tackle', LG: 'left guard', C: 'center', RG: 'right guard', RT: 'right tackle', F: 'fullback', RB: 'back', Y: 'tight end', U: 'tight end' };
  const who = (id) => (id ? DEF[id.replace(/_.*$/, '').replace(/\d+$/, '')] || id : 'the defense');
  const blocker = (id) => OFF[id] || id;
  const JOB = [
    [/^flat/, 'in the flat'], [/^third/, 'in his deep third'], [/^deep_middle|^safety_middle/, 'in the middle of the field'],
    [/^half/, 'over the top'], [/^(in|out)_q/, 'in quarters'], [/^hook|^curl/, 'under the route'], [/^deep_(rat|robber)/, 'robbing the middle'],
    [/^deep_tampa/, 'running the pole'], [/^man_/, 'in man'], [/^blitz|^stunt/, 'on the pressure'],
  ];
  const job = (j) => { for (const [re, t] of JOB) if (re.test(j || '')) return t; return ''; };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function note(oc, play) {
    if (!oc) return '';
    const w = oc.why || {};
    const c = w.cover;
    const tk = w.tackler;
    const target = w.target;
    switch (oc.type) {
      case 'incomplete':
        if (w.result === 'away') return w.hot ? 'Pressure got home early: nobody open, thrown away.' : 'Every read covered: the QB threw it away.';
        if (w.result === 'miss') return `${target} had a step, but the throw missed.`;
        return c ? `${cap(who(c.id))} ${job(c.job)} closed the window and broke it up.`.replace('  ', ' ') : 'Broken up.';
      case 'interception':
        return c ? `${cap(who(c.id))} read the quarterback and jumped the throw.` : 'Picked off.';
      case 'sack': {
        const r = w.rusher || {};
        if (r.unblocked) return `${cap(who(r.id))} came ${r.blitz ? 'on the blitz ' : ''}free: nobody picked him up.`;
        return `${cap(who(r.id))} beat the ${blocker(r.shedFrom)} and got home.`;
      }
      default: break;
    }
    const pass = oc.event && oc.event.kind === 'catch';
    let open = '';
    if (pass && c) {
      const sep = Math.round(c.sep);
      open = w.read > 0 ? `First read covered; ${target} came open` : sep >= 3 ? `${target} found the soft spot` : `${target} won at the catch point`;
      open += sep >= 2 ? ` (${who(c.id)} ${sep} yds away)` : '';
    } else if (!pass) {
      open = oc.gain >= 8 ? 'The blocks held and the hole opened' : oc.gain <= 0 ? '' : oc.gain <= 2 ? 'Stuffed near the line' : 'Hit the hole';
    }
    let stop = '';
    if (oc.type === 'score') stop = 'nobody left to stop him';
    else if (tk) {
      const secondary = /^(CB|FS|SS|NB|DIME)/.test(tk.id);
      if (tk.backfield && tk.unblocked && oc.gain <= 0) stop = `${who(tk.id)} came unblocked into the backfield`;
      else if (pass || (secondary && tk.unblocked)) stop = `${who(tk.id)} rallied and made the tackle`;
      else if (tk.unblocked) stop = `${who(tk.id)} was unblocked and made the tackle`;
      else stop = `${who(tk.id)} shed the ${blocker(tk.shedFrom)} and made the tackle`;
      if (w.broken) stop = `broke ${w.broken > 1 ? 'two tackles' : 'a tackle'}, then ${stop}`;
    } else if (w.oob) stop = 'forced out of bounds';
    else if (oc.gain >= 15) stop = 'nothing but grass ahead';
    const line = [open, stop].filter(Boolean).join(' — ');
    return line ? `${cap(line)}.` : '';
  }

  FD.CoachNote = { note };
})(window.FD);

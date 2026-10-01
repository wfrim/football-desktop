/*
 * playbooks.js — Settings → Playbook. Each playbook is a filter over the
 * library: a play belongs if it matches ANY listed formation, concept, tag or
 * family. Library (runs / passes / …) and field position / drive situation
 * narrow it further; if nothing is left, the playbook alone wins (the rotation
 * never leaves the chosen playbook).
 */
window.FD = window.FD || {};
(function (FD) {
  'use strict';

  const BOOKS = {
    all: null,
    pro: { formations: ['i_form_21', 'singleback_tight_12', 'ace_12', 'singleback_doubles_11', 'pistol_strong_11'] },
    spread: { formations: ['gun_doubles_11', 'gun_trips_11', 'gun_bunch_11', 'gun_empty_11', 'gun_trey_11', 'gun_y_off_11', 'pistol_doubles_11'] },
    // Formation playbooks are strict: only plays drawn from those formations.
    wildcat: { formations: ['wildcat_11', 'wildcat_21'] },
    powert: { formations: ['power_t_32'] },
    wingt: { formations: ['wing_t_21'] },
    goalline: { formations: ['goal_line_23', 'jumbo_13'], tags: ['goalline'] },
    trick: { tags: ['trick'] },
    defense: { families: ['defense'] },
  };

  const has = (list, v) => !!list && list.includes(v);
  const Playbooks = {
    BOOKS,
    /** Filter for a playbook key, or null (everything). */
    filter(key) {
      const b = BOOKS[key];
      if (!b) return null;
      return (p) => (key === 'defense' || p.family !== 'defense') && (has(b.formations, p.formation && p.formation.id)
        || has(b.concepts, p.conceptId) || has(b.families, p.family) || (p.tags || []).some((t) => has(b.tags, t)));
    },
  };

  FD.Playbooks = Playbooks;
})(window.FD);

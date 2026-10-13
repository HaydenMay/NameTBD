// Game time is a number of hours since Day 1, 00:00. It only moves when something takes time
// (contracts, travel, events), never while the player is reading or deciding.
import { allCharacters } from './characters.js';
import { resolveReferral } from './referral.js';

export const dayOf = t => Math.floor(t / 24) + 1;
export function clockLabel(t) {
  const h = Math.floor(t % 24), m = Math.floor((t % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const timeLabel = t => `Day ${dayOf(t)}, ${clockLabel(t)}`;

export function advanceTime(state, hours) {
  state.time += hours;
  for (const c of allCharacters(state)) {
    if (c.injury && state.time >= c.injury.until) {
      c.injury = null;
      if (c.status !== 'dead') state.notices.push({ kind: 'healed', id: c.id });
    }
  }
  resolveReferral(state);
}

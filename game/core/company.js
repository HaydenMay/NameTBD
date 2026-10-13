// The traveling company: purse, provisions, the bedroll upgrade and inviting adventurers.
// Companions are not paid wages; they join because they want to (trust) and if there's room (bedrolls).
import { COMPANY, UPGRADES, TOWNS } from '../content/index.js';
import { travelingCompanions } from './contracts.js';
import { changeTrust } from './relationships.js';
import { record } from './chronicle.js';

export const capacity = state =>
  COMPANY.baseCapacity + Object.keys(state.upgrades).reduce((s, id) => s + (UPGRADES[id].capacity || 0), 0);
export const freeSlots = state => capacity(state) - travelingCompanions(state).length;

export function buyProvisions(state, n) {
  const price = TOWNS[state.location].prices.ration * n;
  if (state.gold < price) return { ok: false, reason: 'gold' };
  state.gold -= price;
  state.provisions += n;
  return { ok: true, price };
}

export function buyUpgrade(state, id) {
  const u = UPGRADES[id];
  if (state.upgrades[id]) return { ok: false, reason: 'owned' };
  if (state.gold < u.cost) return { ok: false, reason: 'gold' };
  state.gold -= u.cost;
  state.upgrades[id] = { t: state.time };
  record(state, 'upgrade', { upgrade: id, capacity: capacity(state) });
  return { ok: true };
}

/** Whether an independent adventurer would join now, and if not, why. */
export function inviteStatus(state, id) {
  const c = state.characters[id];
  const need = COMPANY.joinTrust, free = freeSlots(state);
  if (!c || c.status !== 'independent' || c.town !== state.location) return { ok: false, reason: 'absent', need, free };
  const r = state.referral;
  if (r && r.adventurer === id && !r.resolved) return { ok: false, reason: 'busy', need, free };
  if (c.trust < need) return { ok: false, reason: 'low_trust', need, free };
  if (free < 1) return { ok: false, reason: 'no_room', need, free };
  return { ok: true, reason: 'accept', need, free };
}

export function invite(state, id) {
  const s = inviteStatus(state, id);
  if (!s.ok) return s;
  const c = state.characters[id];
  c.status = 'traveling';
  c.town = null;
  c.joinedAt = state.time;
  changeTrust(state, id, 3, 'Invited to travel with the caravan');
  record(state, 'joined', { adventurer: id, town: state.location }, [id]);
  return s;
}

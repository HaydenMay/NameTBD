// Sending traveling companions on a contract. They go offscreen; time passes; a report comes back.
// The merchant never fights. Gold goes to the caravan's shared purse (temporary default, see docs/game.md).
import { CONTRACTS, COMPANY } from '../content/index.js';
import { random } from './rng.js';
import { successChance, individualRisk } from './rules.js';
import { gainXp } from './characters.js';
import { changeTrust } from './relationships.js';
import { record } from './chronicle.js';
import { advanceTime } from './time.js';

export const contractsIn = (state, town) =>
  Object.keys(CONTRACTS).filter(id => CONTRACTS[id].town === town).map(id => ({ id, ...CONTRACTS[id], state: state.contracts[id] }));

export const travelingCompanions = state =>
  Object.values(state.characters).filter(c => c.role === 'adventurer' && c.status === 'traveling');

export const availableForContracts = state => travelingCompanions(state).filter(c => !c.injury);

export function resolveContract(state, contractId, memberIds) {
  const k = CONTRACTS[contractId];
  if (!k || state.contracts[contractId].status !== 'available') throw new Error('contract not available: ' + contractId);
  if (k.town !== state.location) throw new Error('contract is in another town');
  const free = new Set(availableForContracts(state).map(c => c.id));
  if (!memberIds.length || !memberIds.every(id => free.has(id))) throw new Error('invalid party');
  const members = memberIds.map(id => state.characters[id]);

  const chance = successChance(k, members);
  const success = random(state) < chance;
  const people = members.map(c => {
    const risk = individualRisk(k, c, members);
    const roll = random(state);                      // roll < 0 is impossible, so a 0% risk never happens
    const died = roll < risk.death;
    const injured = !died && roll < risk.death + risk.injury;
    return { id: c.id, died, injured, risk };
  });

  const gold = success ? k.reward : 0;
  const xp = success ? k.xp : Math.floor(k.xp / 2);
  state.gold += gold;
  advanceTime(state, k.hours);
  for (const p of people) {
    const c = state.characters[p.id];
    if (p.died) { c.status = 'dead'; c.injury = null; continue; }
    p.levels = gainXp(c, xp);
    if (p.injured) {
      c.injury = { until: state.time + COMPANY.injuryHours, from: contractId };
      p.trust = changeTrust(state, c.id, -2, `Hurt on the "${k.title}" job`);
    } else if (success) {
      p.trust = changeTrust(state, c.id, 2, `A good result on "${k.title}"`);
    }
  }
  state.contracts[contractId] = { status: 'done', by: 'party', success, members: memberIds };
  const pick = f => people.filter(f).map(p => p.id);
  record(state, 'contract', {
    contract: contractId, members: memberIds, success, gold,
    injured: pick(p => p.injured), died: pick(p => p.died), levelUps: pick(p => p.levels > 0),
  }, memberIds);
  return { contract: contractId, success, chance, gold, xp, people, hours: k.hours };
}

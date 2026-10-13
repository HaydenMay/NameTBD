// Caravan Chronicle: structured records of meaningful moments; readable text is derived on display.
// Each entry lists the characters involved (`who`) so personal histories can reuse the same records.
// Routine things (buying provisions, small talk) are deliberately not recorded.
import { CONTRACTS, EVENTS, TOWNS, UPGRADES, DELIVERY } from '../content/index.js';
import { nameOf } from './characters.js';
import { fill } from './text.js';

export function record(state, type, data = {}, who = []) {
  const entry = { n: state.chronicle.length + 1, t: state.time, type, who, ...data };
  state.chronicle.push(entry);
  return entry;
}

const list = names => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);

export function describe(state, e) {
  const n = id => nameOf(state, id);
  switch (e.type) {
    case 'journey_began':
      return `${n(e.merchant)} set out from ${TOWNS[e.town].name} with ${list(e.crew.map(n))}, carrying wool for Stonehaven.`;
    case 'contract': {
      const k = CONTRACTS[e.contract];
      let s = e.success ? `${list(e.members.map(n))} completed "${k.title}" for ${e.gold} gold.`
        : `${list(e.members.map(n))} attempted "${k.title}" and came back empty-handed.`;
      if (e.died.length) s += ` ${list(e.died.map(n))} did not come back.`;
      if (e.injured.length) s += ` ${list(e.injured.map(n))} ${e.injured.length > 1 ? 'were' : 'was'} injured.`;
      if (e.levelUps && e.levelUps.length) s += ` ${list(e.levelUps.map(n))} grew more experienced.`;
      return s;
    }
    case 'referral': {
      const k = CONTRACTS[e.contract];
      const a = n(e.adventurer);
      const how = e.success ? (e.hurt ? `${a} finished the job but was hurt doing it.` : `${a} did well out of it.`)
        : (e.hurt ? `${a} was badly hurt and only just made it back.` : 'It didn\'t work out.');
      return `${n(e.merchant)} recommended "${k.title}" to ${a}${e.honest ? '' : ' and made it sound easier than it was'}. ${how}`;
    }
    case 'joined':
      return `${n(e.adventurer)} joined the caravan in ${TOWNS[e.town].name}.`;
    case 'upgrade':
      return `Bought an ${UPGRADES[e.upgrade].label.toLowerCase()}. The wagon now sleeps ${e.capacity} companions.`;
    case 'road_event': {
      const ch = EVENTS[e.event].choices.find(c => c.id === e.choice);
      return fill(ch.outcomes[e.outcome].chronicle, state);
    }
    case 'arrived':
      return `Arrived in ${TOWNS[e.town].name} for the first time.`;
    case 'delivery':
      return `Delivered the wool to ${DELIVERY.client.split(',')[0]}${e.onTime ? ', on time' : ', a little late'}, for ${e.gold} gold.`;
    case 'journey_end':
      return `The first journey ended in ${TOWNS[e.town].name}.`;
    default:
      return e.type;
  }
}

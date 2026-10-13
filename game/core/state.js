// Persistent game state: creation, versioned save/load, end-of-journey summary.
// The state is plain JSON. Anything random draws from state.rng, so a save continues identically.
import { START, CAST, CONTRACTS, TOWNS } from '../content/index.js';
import { seedFrom, random } from './rng.js';
import { createCharacter, allCharacters } from './characters.js';
import { record } from './chronicle.js';
import { dayOf } from './time.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'caravan.save';

export function newGame(M, seed) {
  const state = {
    version: SAVE_VERSION, seed, rng: seedFrom(seed),
    time: START.time, gold: START.gold, provisions: START.provisions,
    location: START.town, view: 'center',
    characters: {}, cast: {}, nextId: 1,
    upgrades: {}, contracts: {}, referral: null, declined: [],
    travel: null, event: null, delivered: null,
    flags: {}, seen: {}, visited: { [START.town]: true },
    chronicle: [], notices: [], finished: false,
  };
  const sexes = random(state) < 0.5 ? ['m', 'f'] : ['f', 'm'];   // comp_a and comp_b: one of each
  for (const spec of CAST) {
    const template = spec.key === 'comp_a' ? sexes[0] : spec.key === 'comp_b' ? sexes[1] : null;
    createCharacter(M, state, { ...spec, template });
  }
  for (const id of Object.keys(CONTRACTS)) state.contracts[id] = { status: 'available' };
  record(state, 'journey_began', { merchant: state.cast.merchant, crew: [state.cast.comp_a, state.cast.comp_b], town: START.town },
    [state.cast.merchant, state.cast.comp_a, state.cast.comp_b]);
  return state;
}

export function serialize(state) {
  return JSON.stringify({ ...state, notices: [] });
}

/** Returns the saved state, or null if missing, corrupt, or from an incompatible version. */
export function deserialize(text) {
  let s;
  try { s = JSON.parse(text); } catch { return null; }
  if (!s || s.version !== SAVE_VERSION || !s.characters || !s.cast || !s.cast.merchant) return null;
  s.notices = [];
  return s;
}

export function locationName(state) {
  return state.location === 'road' ? `On the road to ${TOWNS[state.travel.to].name}` : TOWNS[state.location].name;
}

export function endJourney(state) {
  if (state.finished) return;
  state.finished = true;
  record(state, 'journey_end', { town: state.location });
}

export function journeySummary(state) {
  const chars = allCharacters(state);
  const done = Object.entries(state.contracts).filter(([, v]) => v.status === 'done');
  return {
    days: dayOf(state.time),
    gold: state.gold, goldChange: state.gold - START.gold, provisions: state.provisions,
    contracts: done.filter(([, v]) => v.by === 'party').map(([id, v]) => ({ id, title: CONTRACTS[id].title, success: v.success })),
    referral: state.referral,
    delivered: state.delivered,
    companions: chars.filter(c => c.role === 'adventurer'),
    lost: chars.filter(c => c.status === 'dead'),
    chronicle: state.chronicle.length,
  };
}

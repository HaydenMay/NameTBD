// Data-driven events (content/events.js): conditions, weighted outcomes and effects.
// The same effect format is used by conversations, so new content needs no new interface code.
import { EVENTS } from '../content/index.js';
import { random } from './rng.js';
import { changeTrust } from './relationships.js';
import { record } from './chronicle.js';
import { passRoadTime } from './travel.js';
import { advanceTime } from './time.js';
import { fill } from './text.js';

const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Shared condition check for event choices and conversations. */
export function meets(state, req = {}) {
  if (asList(req.flag).some(f => !state.flags[f])) return false;
  if (asList(req.notFlag).some(f => state.flags[f])) return false;
  if (req.traveling) {
    const c = state.characters[state.cast[req.traveling]];
    if (!c || c.status !== 'traveling') return false;
  }
  if (req.provisions && state.provisions < req.provisions) return false;
  return true;
}

export const currentEvent = state => (state.event ? EVENTS[state.event.id] : null);
export const availableChoices = (state, ev) => ev.choices.filter(ch => meets(state, ch.requires));

/** Applies effects; returns readable summaries like "+5 hours stopped". */
export function applyEffects(state, effects = []) {
  const out = [];
  for (const e of effects) {
    if (e.delay) {
      if (state.travel) passRoadTime(state, e.delay); else advanceTime(state, e.delay);
      out.push(`${e.delay} hours stopped`);
    }
    if (e.distance && state.travel) { state.travel.length += e.distance; out.push(`${e.distance} more hours of road`); }
    if (e.provisions) { state.provisions = Math.max(0, state.provisions + e.provisions); out.push(`${e.provisions > 0 ? '+' : ''}${e.provisions} provisions`); }
    if (e.gold) { state.gold = Math.max(0, state.gold + e.gold); out.push(`${e.gold > 0 ? '+' : ''}${e.gold} gold`); }
    if (e.trust) changeTrust(state, state.cast[e.trust.who], e.trust.amount, fill(e.trust.reason, state));
    if (e.flag) state.flags[e.flag] = true;
  }
  return out;
}

export function chooseOption(state, choiceId) {
  const ev = currentEvent(state);
  const ch = ev && availableChoices(state, ev).find(c => c.id === choiceId);
  if (!ch) throw new Error('choice not available: ' + choiceId);
  let o = ch.outcomes[0];
  if (ch.outcomes.length > 1) {
    let r = random(state);
    o = ch.outcomes.find(x => (r -= x.chance) < 0) || ch.outcomes[ch.outcomes.length - 1];
  }
  const outcome = ch.outcomes.indexOf(o);
  const summary = applyEffects(state, o.effects);
  record(state, 'road_event', { event: state.event.id, choice: ch.id, outcome },
    [state.cast.merchant, ...asList(o.effects.filter(e => e.trust).map(e => state.cast[e.trust.who]))]);
  state.event = null;
  return { text: fill(o.text, state), summary, outcome };
}

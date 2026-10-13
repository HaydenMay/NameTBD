// Conversation topics available at a place, and what happens when you pick one.
import { CONVERSATIONS } from '../content/index.js';
import { byKey } from './characters.js';
import { meets, applyEffects } from './events.js';
import { fill } from './text.js';

export function conversationsFor(state, place, withKey = null) {
  return CONVERSATIONS.filter(cv => {
    const c = byKey(state, cv.with);
    if (!c || c.status === 'dead' || (withKey && cv.with !== withKey)) return false;
    if (c.status === 'independent' && c.town !== state.location) return false;
    if (cv.status && c.status !== cv.status) return false;
    if (cv.town && cv.town !== state.location) return false;
    if (cv.place && cv.place !== place) return false;
    if (cv.once && state.seen[cv.id]) return false;
    if (cv.seen && !state.seen[cv.seen]) return false;
    return meets(state, cv);
  });
}

export const speak = (state, lines, extra) => lines.map(([who, text]) => ({ id: state.cast[who], text: fill(text, state, extra) }));

export function talk(state, id) {
  const cv = CONVERSATIONS.find(c => c.id === id);
  state.seen[id] = true;
  applyEffects(state, cv.effects);
  return speak(state, cv.lines);
}

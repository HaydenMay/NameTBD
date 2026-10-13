// What the world shows and offers: who is standing in the town square, what you can say when you
// approach someone, and the small talk people say out loud. Uses the existing rules; adds none.
import { CONTRACTS, IDLE_LINES } from '../content/index.js';
import { byKey } from './characters.js';
import { travelingCompanions } from './contracts.js';
import { canRefer } from './referral.js';
import { conversationsFor, speak } from './dialogue.js';

/** People visible in the current town scene. An adventurer out on a job you recommended is away. */
export function townPresence(state) {
  if (state.location === 'road') return [];
  const out = [{ id: state.cast.merchant, role: 'merchant' }];
  for (const c of travelingCompanions(state)) out.push({ id: c.id, role: 'companion' });
  const ind = byKey(state, 'indep'), r = state.referral;
  const away = r && r.adventurer === ind.id && !r.resolved;
  if (ind.status === 'independent' && ind.town === state.location && !away) out.push({ id: ind.id, role: 'independent' });
  return out;
}

export const referableContracts = state => Object.keys(CONTRACTS).filter(id => canRefer(state, id));

/** Options when you approach someone in the square. Small talk is never required. */
export function talkOptions(state, id) {
  const c = state.characters[id];
  const opts = conversationsFor(state, 'center', c.key).filter(cv => !cv.ambient)
    .map(cv => ({ kind: 'topic', id: cv.id, label: cv.label }));
  if (c.status === 'independent') {
    if (referableContracts(state).length) opts.push({ kind: 'refer', label: 'Tell them about some work' });
    opts.push({ kind: 'invite', label: 'Ask them to travel with you' });
  }
  opts.push({ kind: 'leave', label: 'Goodbye' });
  return opts;
}

/**
 * Something this person says out loud: their next unheard small talk, otherwise (only when you
 * tapped them, not for automatic chatter) a short idle line. Small talk is heard once and has no effects.
 */
export function ambientLines(state, id, { auto = false } = {}) {
  const c = state.characters[id];
  if (!c || !c.key) return null;
  const here = new Set(townPresence(state).map(p => p.id));
  const cv = conversationsFor(state, 'town', c.key)
    .find(x => x.ambient && x.lines.every(([who]) => here.has(state.cast[who])));   // everyone speaking is here
  if (cv) { state.seen[cv.id] = true; return speak(state, cv.lines); }
  if (auto) return null;
  const pool = IDLE_LINES[c.key] || [];
  if (!pool.length) return null;
  const k = 'idle:' + c.key, n = state.seen[k] || 0;
  state.seen[k] = n + 1;
  return [{ id, text: pool[n % pool.length] }];
}

/** Next automatic small talk among the people present (for when the player is just looking around). */
export function nextAmbient(state) {
  for (const p of townPresence(state)) {
    if (p.role === 'merchant') continue;
    const lines = ambientLines(state, p.id, { auto: true });
    if (lines) return lines;
  }
  return null;
}

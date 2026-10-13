// Characters: stable ids, names, classes, and appearance recipes from the existing generator.
// Identity = face + skin + hair + beard + colours (+ race, scar). Clothing is not identity.
import { randomRecipe } from '../../animation/anim.js';
import { random, randInt, pick } from './rng.js';
import { CLASSES, NAMES } from '../content/index.js';

export const IDENTITY_FIELDS = ['race', 'face', 'skin', 'hair', 'beard', 'hairCol', 'scar'];

export function appearanceKey(a) {
  return IDENTITY_FIELDS.map(k => `${k}=${a[k] || ''}`).join('&');
}

export const allCharacters = state => Object.values(state.characters);
export const byKey = (state, key) => state.characters[state.cast[key]];
export const nameOf = (state, id) => (state.characters[id] ? state.characters[id].name : 'someone');
export const recipeOf = c => ({ ...c.appearance, outfit: c.outfit });
export const isAlive = c => c.status !== 'dead';

export function appearanceTaken(state, appearance) {
  const key = appearanceKey(appearance);
  return allCharacters(state).some(c => appearanceKey(c.appearance) === key);
}

/** New appearance whose identity matches no existing character. Prefers unused faces in a small cast. */
export function generateAppearance(M, state, template) {
  const chars = allCharacters(state);
  const taken = new Set(chars.map(c => appearanceKey(c.appearance)));
  const faces = new Set(chars.map(c => c.appearance.face));
  for (let i = 0; i < 400; i++) {
    const { outfit, ...a } = randomRecipe(M, randInt(state, 0x7fffffff), template);
    if (taken.has(appearanceKey(a))) continue;
    if (i < 100 && faces.has(a.face)) continue;
    return a;
  }
  throw new Error('no unique appearance available');
}

function pickName(state, template) {
  const used = new Set(allCharacters(state).map(c => c.name));
  const free = NAMES[template].filter(n => !used.has(n));
  return free.length ? pick(state, free) : `${pick(state, NAMES[template])} the Younger`;
}

export function createCharacter(M, state, spec) {
  const template = spec.template || (random(state) < 0.5 ? 'm' : 'f');
  const cls = spec.cls ? CLASSES[spec.cls] : null;
  const attrs = cls ? Object.fromEntries(Object.entries(cls.attrs)
    .map(([k, v]) => [k, Math.max(1, v + randInt(state, 3) - 1)])) : null;
  const c = {
    id: 'c' + state.nextId++,
    key: spec.key || null,
    name: spec.name || pickName(state, template),
    template,
    role: spec.role || 'adventurer',
    cls: spec.cls || null,
    level: cls ? spec.level || 1 : null,
    xp: 0,
    attrs,
    traits: [...((cls && cls.traits) || []), ...(spec.traits || [])],
    tag: spec.tag || null,
    bio: spec.bio || null,
    appearance: generateAppearance(M, state, template),
    outfit: `${cls ? cls.outfit : spec.outfit}_${template}`,
    status: spec.status || 'traveling',
    trust: spec.trust ?? 0,
    trustLog: [],
    injury: null,
    purse: 0,
    town: spec.town || null,
    heading: spec.heading || null,
    prefs: spec.prefs || null,
  };
  state.characters[c.id] = c;
  if (c.key) state.cast[c.key] = c.id;
  return c;
}

export const xpForNext = level => 60 * level;

/** Adds experience; returns the number of levels gained. */
export function gainXp(c, xp) {
  let gained = 0;
  c.xp += xp;
  while (c.xp >= xpForNext(c.level)) { c.xp -= xpForNext(c.level); c.level++; gained++; }
  return gained;
}

export const classLabel = c => (c.role === 'merchant' ? 'Merchant' : CLASSES[c.cls].label);

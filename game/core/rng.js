// Seeded randomness stored in the game state (state.rng), so saves replay identically.
// Same generator as mulberry32 in animation/anim.js.

export const seedFrom = n => (n >>> 0) || 0x9E3779B9;

export function random(state) {
  let a = state.rng | 0;
  a = (a + 0x6D2B79F5) | 0;
  state.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (state, n) => Math.floor(random(state) * n);
export const pick = (state, list) => list[randInt(state, list.length)];

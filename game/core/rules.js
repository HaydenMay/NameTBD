// Contract maths. Pure functions, documented in docs/game.md.
//
// Party success (shared):
//   member strength = 2 × level + the contract's skill attribute
//   success chance  = 50% + 5% × (party strength − difficulty), clamped to 5–95%
// Individual risk (per adventurer; depends only on their own level and grit, the danger tier,
// and whether someone else in the party is a healer. A weaker member never raises anyone else's risk):
//   exposure = 1.4 − 0.08 × (level + grit), clamped to 0.4–1.2
//   injury   = tier injury × exposure (× 0.75 if another party member is a healer)
//   death    = tier death × exposure          (tiers 0 and 1 have death exactly 0)
// Risk rolls are independent of whether the job succeeds: failing never implies death.

export const DANGER = [
  { label: 'None', injury: 0, death: 0 },
  { label: 'Low', injury: 0.15, death: 0 },
  { label: 'Serious', injury: 0.30, death: 0.06 },
  { label: 'Deadly', injury: 0.40, death: 0.15 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const difficultyLabel = d => (d <= 8 ? 'Easy' : d <= 14 ? 'Moderate' : d <= 20 ? 'Hard' : 'Very hard');
export const dangerTier = contract => DANGER[contract.danger] || DANGER[0];

export const memberStrength = (c, contract) => 2 * c.level + ((c.attrs && c.attrs[contract.skill]) || 0);
export const partyStrength = (members, contract) => members.reduce((s, c) => s + memberStrength(c, contract), 0);

export function successChance(contract, members) {
  if (!members.length) return 0;
  return clamp(0.5 + 0.05 * (partyStrength(members, contract) - contract.difficulty), 0.05, 0.95);
}

export const exposure = c => clamp(1.4 - 0.08 * (c.level + ((c.attrs && c.attrs.grit) || 0)), 0.4, 1.2);

/** Injury and death probability for one adventurer. noDeath: worst case becomes a bad injury instead. */
export function individualRisk(contract, c, party = [c], { noDeath = false } = {}) {
  const tier = dangerTier(contract);
  const e = exposure(c);
  const healer = party.some(m => m.id !== c.id && m.traits && m.traits.includes('healer'));
  let injury = tier.injury * e * (healer ? 0.75 : 1);
  let death = tier.death * e;
  if (noDeath) { injury += death; death = 0; }
  return { injury, death, healer };
}

/** Never shows 0% for a real chance, nor anything but 0% for an impossible one. */
export function formatPercent(p) {
  if (!(p > 0)) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.01) return '<1%';
  if (p > 0.99) return '>99%';
  return Math.round(p * 100) + '%';
}

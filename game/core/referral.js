// Recommending a contract to an independent adventurer: one small, tracked interaction.
// They judge the job from what you tell them, go alone, keep their own pay, and report back
// the next time you meet. In this slice a referred adventurer can be hurt but never dies.
import { CONTRACTS, COMPANY } from '../content/index.js';
import { random } from './rng.js';
import { successChance, individualRisk } from './rules.js';
import { byKey, gainXp } from './characters.js';
import { changeTrust, referralTrustDelta } from './relationships.js';
import { record } from './chronicle.js';

/** The independent adventurer, if they're in the merchant's current town. */
export function referralTarget(state) {
  const c = byKey(state, 'indep');
  return c && c.status === 'independent' && c.town === state.location ? c : null;
}

export function canRefer(state, contractId) {
  const k = CONTRACTS[contractId], c = referralTarget(state);
  return !!(k && k.referable && c && !c.injury && !state.referral
    && state.contracts[contractId].status === 'available' && !state.declined.includes(contractId));
}

/**
 * How the adventurer sees the job. Honest: the real numbers. Made to sound easier: they take
 * your word that it's a likely success with little risk.
 */
export function evaluateReferral(state, contractId, honest) {
  const k = CONTRACTS[contractId], c = byKey(state, 'indep');
  const chance = successChance(k, [c]);
  const risk = individualRisk(k, c, [c], { noDeath: true }).injury;
  const seen = honest ? { chance, risk } : { chance: Math.max(chance, 0.75), risk: Math.min(risk, 0.05) };
  const reason = seen.risk > c.prefs.maxRisk ? 'too_dangerous' : seen.chance < c.prefs.minChance ? 'too_hard' : 'accept';
  return { accept: reason === 'accept', reason, chance, risk, seen };
}

export function recommend(state, contractId, honest) {
  if (!canRefer(state, contractId)) throw new Error('cannot recommend ' + contractId);
  const ev = evaluateReferral(state, contractId, honest);
  if (!ev.accept) { state.declined.push(contractId); return ev; }
  const k = CONTRACTS[contractId], c = byKey(state, 'indep');
  state.contracts[contractId].status = 'referred';
  state.flags['referred_' + contractId] = true;
  state.referral = { contract: contractId, adventurer: c.id, honest, chance: ev.chance, risk: ev.risk,
    dueAt: state.time + k.hours, resolved: false, delivered: false };
  return ev;
}

/** Called whenever time passes: settles the job once it's due. */
export function resolveReferral(state) {
  const r = state.referral;
  if (!r || r.resolved || state.time < r.dueAt) return;
  const k = CONTRACTS[r.contract], c = state.characters[r.adventurer];
  r.success = random(state) < r.chance;
  r.hurt = random(state) < r.risk;
  r.gold = r.success ? k.reward : 0;
  c.purse += r.gold;                        // they keep their own earnings
  r.levels = gainXp(c, r.success ? k.xp : Math.floor(k.xp / 2));
  if (r.hurt) c.injury = { until: r.dueAt + COMPANY.injuryHours, from: r.contract };
  r.resolved = true;
  state.contracts[r.contract] = { status: 'done', by: 'referral' };
}

export function pendingReport(state) {
  const r = state.referral;
  if (!r || !r.resolved || r.delivered || state.location === 'road') return null;
  const c = state.characters[r.adventurer];
  return c.status === 'traveling' || c.town === state.location ? r : null;
}

/** They tell you how it went; trust changes now, when the player sees it. */
export function deliverReport(state) {
  const r = pendingReport(state);
  if (!r) return null;
  const delta = referralTrustDelta(r);
  changeTrust(state, r.adventurer, delta.amount, delta.reason);
  r.delivered = true;
  r.trust = delta;
  record(state, 'referral', { contract: r.contract, adventurer: r.adventurer, merchant: state.cast.merchant,
    success: r.success, hurt: r.hurt, honest: r.honest }, [state.cast.merchant, r.adventurer]);
  return r;
}

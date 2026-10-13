// Trust between the merchant and each character: a number plus a log of reasons the player can read.
// Trust is separate from traveling status: an independent adventurer can be a good friend.

export const TRUST_LABELS = [[60, 'Close'], [45, 'Trusted'], [30, 'Friendly'], [15, 'Acquaintance'], [-Infinity, 'Stranger']];
export const trustLabel = v => TRUST_LABELS.find(([min]) => v >= min)[1];

export function changeTrust(state, id, amount, reason) {
  const c = state.characters[id];
  if (!c || c.status === 'dead') return null;
  c.trust = Math.max(-100, Math.min(100, c.trust + amount));
  const entry = { t: state.time, amount, reason };
  c.trustLog.push(entry);
  state.notices.push({ kind: 'trust', id, amount, reason });
  return entry;
}

/**
 * Trust change when an adventurer reports back on a job you recommended.
 * Accounts for the outcome and whether you were honest about the risk:
 * a bad result you warned them about costs little; one you talked down costs a lot.
 */
export function referralTrustDelta({ success, hurt, honest }) {
  if (success && !hurt) return { amount: 15, reason: 'Recommended a job that paid off' };
  if (success && hurt) return honest
    ? { amount: 5, reason: 'Good tip, even if it was rough going' }
    : { amount: -5, reason: 'The job was rougher than you made it sound' };
  if (!hurt) return honest
    ? { amount: 0, reason: 'The job fell through, but you were straight about it' }
    : { amount: -8, reason: 'The job was nothing like you described' };
  return honest
    ? { amount: -4, reason: 'A bad outcome, though you warned of the risks' }
    : { amount: -20, reason: 'Talked a dangerous job down, and it nearly went very badly' };
}

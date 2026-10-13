// Game rules for the first playable journey. Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, serialize, deserialize, SAVE_VERSION, endJourney, journeySummary } from '../game/core/state.js';
import { appearanceKey, appearanceTaken, createCharacter, byKey, recipeOf } from '../game/core/characters.js';
import { successChance, individualRisk, formatPercent, DANGER } from '../game/core/rules.js';
import { resolveContract, availableForContracts } from '../game/core/contracts.js';
import { canRefer, evaluateReferral, recommend, pendingReport, deliverReport } from '../game/core/referral.js';
import { referralTrustDelta, changeTrust } from '../game/core/relationships.js';
import { capacity, freeSlots, buyUpgrade, buyProvisions, inviteStatus, invite } from '../game/core/company.js';
import { depart, advanceTravel, takeChatter } from '../game/core/travel.js';
import { availableChoices, currentEvent, chooseOption } from '../game/core/events.js';
import { conversationsFor, talk } from '../game/core/dialogue.js';
import { describe } from '../game/core/chronicle.js';
import { advanceTime } from '../game/core/time.js';
import { CONTRACTS, COMPANY, UPGRADES, START, DELIVERY } from '../game/content/index.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const M = JSON.parse(readFileSync(ROOT + 'preview-character/manifest.json', 'utf8'));
const fresh = (seed = 42) => newGame(M, seed);
const adv = (o = {}) => ({ id: o.id || 'x', level: 2, attrs: { might: 3, wits: 3, grit: 3 }, traits: [], ...o });
const travelTo = (s, until) => { let r = {}, n = 0; while (!(r = advanceTravel(s, 0.5))[until] && !r.arrived && n++ < 1000); return r; };

// ---- save / load ------------------------------------------------------------------------------
test('save/load round-trips the full state, including the random stream', () => {
  const s = fresh(7);
  talk(s, 'indep_intro');
  resolveContract(s, 'granary_rats', [s.cast.comp_a]);
  buyProvisions(s, 2);
  const loaded = deserialize(serialize(s));
  assert.deepEqual(loaded, { ...s, notices: [] });
  // both continue identically
  const a = resolveContract(s, 'harrow_wolves', [s.cast.comp_b]);
  const b = resolveContract(loaded, 'harrow_wolves', [loaded.cast.comp_b]);
  assert.deepEqual(a, b);
});

test('saves mid-journey keep travel progress and a pending road event', () => {
  const s = fresh(3);
  depart(s, 'oakvale-stonehaven');
  travelTo(s, 'event');
  const loaded = deserialize(serialize(s));
  assert.equal(loaded.location, 'road');
  assert.deepEqual(loaded.event, { id: 'weir_bridge' });
  assert.equal(loaded.travel.progress, s.travel.progress);
});

test('incompatible or corrupt saves are rejected, not half-loaded', () => {
  const s = fresh();
  assert.equal(deserialize(JSON.stringify({ ...s, version: SAVE_VERSION + 1 })), null);
  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize(''), null);
});

// ---- characters -------------------------------------------------------------------------------
test('every generated character has a unique appearance identity', () => {
  const s = fresh(11);
  for (let i = 0; i < 40; i++) createCharacter(M, s, { cls: 'scout', level: 1 });
  const keys = Object.values(s.characters).map(c => appearanceKey(c.appearance));
  assert.equal(new Set(keys).size, keys.length);
});

test('identity compares recipes, not seeds, and ignores clothing', () => {
  const s = fresh(5);
  const merchant = byKey(s, 'merchant');
  assert.ok(appearanceTaken(s, { ...merchant.appearance }));
  const { outfit, ...sameFace } = { ...recipeOf(merchant), outfit: 'knight_m' };   // different clothes, same person
  assert.ok(appearanceTaken(s, sameFace));
  assert.ok(!appearanceTaken(s, { ...merchant.appearance, hairCol: merchant.appearance.hairCol === 'black' ? 'blond' : 'black' }));
  assert.ok(!('outfit' in merchant.appearance));
});

test('the starting cast is stable for a seed and has ids, classes and recipes', () => {
  const a = fresh(99), b = fresh(99);
  assert.deepEqual(a.characters, b.characters);
  for (const key of ['merchant', 'comp_a', 'comp_b', 'indep']) {
    const c = byKey(a, key);
    assert.ok(c.id && c.name && c.appearance.face && c.outfit);
  }
  assert.equal(byKey(a, 'indep').status, 'independent');
  assert.notEqual(byKey(a, 'comp_a').template, byKey(a, 'comp_b').template);
});

// ---- contract maths ---------------------------------------------------------------------------
test('party success chance follows the documented formula and clamps', () => {
  const k = { skill: 'might', difficulty: 10, danger: 0 };
  assert.equal(successChance(k, []), 0);
  assert.equal(successChance(k, [adv()]), 0.5 + 0.05 * (7 - 10));
  assert.ok(successChance(k, [adv(), adv({ id: 'y' })]) > successChance(k, [adv()]));
  assert.equal(successChance({ ...k, difficulty: 100 }, [adv()]), 0.05);
  assert.equal(successChance({ ...k, difficulty: 0 }, [adv(), adv({ id: 'y' })]), 0.95);
});

test('danger tiers 0 and 1 have exactly zero death risk; tier 0 has zero injury risk', () => {
  for (const c of [adv(), adv({ level: 1, attrs: { grit: 0 } }), adv({ level: 9, attrs: { grit: 9 } })]) {
    assert.deepEqual([individualRisk({ danger: 0 }, c).injury, individualRisk({ danger: 0 }, c).death], [0, 0]);
    assert.equal(individualRisk({ danger: 1 }, c).death, 0);
    assert.ok(individualRisk({ danger: 2 }, c).death > 0);
  }
  assert.equal(DANGER[0].death + DANGER[1].death, 0);
});

test('a weaker party member never makes a stronger one more vulnerable', () => {
  const strong = adv({ id: 's', level: 4, attrs: { might: 6, grit: 6 } });
  const weak = adv({ id: 'w', level: 1, attrs: { might: 1, grit: 1 } });
  const k = { skill: 'might', difficulty: 15, danger: 2 };
  assert.deepEqual(individualRisk(k, strong, [strong, weak]), individualRisk(k, strong, [strong]));
  assert.ok(individualRisk(k, weak, [weak]).injury > individualRisk(k, strong, [strong]).injury);
  const healer = adv({ id: 'h', traits: ['healer'] });
  assert.ok(individualRisk(k, strong, [strong, healer]).injury < individualRisk(k, strong, [strong]).injury);
});

test('displayed percentages: 0% only for impossible, never rounds a real risk to 0%', () => {
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.004), '<1%');
  assert.equal(formatPercent(0.996), '>99%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(0.25), '25%');
});

test('a 0% risk contract never injures or kills, across many seeds', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = fresh(seed);
    const r = resolveContract(s, 'granary_rats', availableForContracts(s).map(c => c.id));
    assert.ok(r.people.every(p => !p.died && !p.injured), 'seed ' + seed);
  }
});

test('contract resolution pays the shared purse, gives xp, takes time and is recorded', () => {
  const s = fresh(21);
  const gold = s.gold, time = s.time, ids = availableForContracts(s).map(c => c.id);
  const r = resolveContract(s, 'harrow_wolves', ids);
  assert.equal(s.gold, gold + (r.success ? CONTRACTS.harrow_wolves.reward : 0));
  assert.equal(s.time, time + CONTRACTS.harrow_wolves.hours);
  assert.equal(r.xp, r.success ? CONTRACTS.harrow_wolves.xp : CONTRACTS.harrow_wolves.xp / 2);
  assert.equal(s.contracts.harrow_wolves.status, 'done');
  assert.throws(() => resolveContract(s, 'harrow_wolves', ids));
  const e = s.chronicle.at(-1);
  assert.equal(e.type, 'contract');
  assert.deepEqual(e.who, ids);
});

test('injury and death outcomes match the rolled probabilities over many runs', () => {
  let died = 0, hurt = 0, n = 0;
  for (let seed = 1; seed <= 1500; seed++) {
    const s = fresh(seed);
    const r = resolveContract(s, 'harrow_wolves', [s.cast.comp_b]);   // danger 1: injuries possible, deaths impossible
    n++; died += r.people[0].died; hurt += r.people[0].injured;
  }
  assert.equal(died, 0);
  assert.ok(hurt > 0 && hurt / n < 0.4);
});

test('injured companions sit out contracts until healed', () => {
  const s = fresh(1);
  const c = byKey(s, 'comp_b');
  c.injury = { until: s.time + COMPANY.injuryHours };
  assert.ok(!availableForContracts(s).includes(c));
  assert.throws(() => resolveContract(s, 'granary_rats', [c.id]));
  advanceTime(s, COMPANY.injuryHours);
  assert.equal(c.injury, null);
});

// ---- referrals and trust ----------------------------------------------------------------------
test('the independent adventurer judges a job from what they are told', () => {
  const s = fresh(4);
  assert.equal(evaluateReferral(s, 'watchtower', true).accept, false);   // honest: too dangerous alone
  assert.equal(evaluateReferral(s, 'watchtower', false).accept, true);   // talked down: they take your word
  assert.equal(evaluateReferral(s, 'granary_rats', true).accept, true);
  assert.ok(canRefer(s, 'granary_rats'));
  assert.ok(!canRefer(s, 'harrow_wolves'));                              // not referable
});

test('referral trust changes account for outcome and honesty', () => {
  assert.ok(referralTrustDelta({ success: true, hurt: false, honest: true }).amount > 0);
  assert.equal(referralTrustDelta({ success: false, hurt: false, honest: true }).amount, 0);
  const warned = referralTrustDelta({ success: false, hurt: true, honest: true }).amount;
  const misled = referralTrustDelta({ success: false, hurt: true, honest: false }).amount;
  assert.ok(misled < warned && warned < 0);
  assert.ok(referralTrustDelta({ success: true, hurt: true, honest: false }).amount < referralTrustDelta({ success: true, hurt: true, honest: true }).amount);
});

test('referred adventurers keep their earnings, report later, and never die', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = fresh(seed);
    const c = byKey(s, 'indep'), gold = s.gold, trust = c.trust;
    recommend(s, 'watchtower', false);
    assert.equal(s.referral.contract, 'watchtower');
    assert.equal(pendingReport(s), null);                                 // not done yet
    advanceTime(s, CONTRACTS.watchtower.hours);
    const r = deliverReport(s);
    assert.ok(r, 'report available once due');
    assert.notEqual(c.status, 'dead');
    assert.equal(s.gold, gold);                                           // the caravan gets nothing
    assert.equal(c.purse, r.success ? CONTRACTS.watchtower.reward : 0);
    assert.equal(c.trust, trust + r.trust.amount);
    assert.equal(deliverReport(s), null);                                 // only once
  }
});

test('only one referral is tracked at a time and the contract leaves the board', () => {
  const s = fresh(8);
  recommend(s, 'granary_rats', true);
  assert.equal(s.contracts.granary_rats.status, 'referred');
  assert.ok(!canRefer(s, 'watchtower'));
  assert.throws(() => resolveContract(s, 'granary_rats', [s.cast.comp_a]));
});

test('a refused recommendation cannot be pushed again', () => {
  const s = fresh(8);
  const r = recommend(s, 'watchtower', true);
  assert.equal(r.accept, false);
  assert.equal(s.referral, null);
  assert.ok(!canRefer(s, 'watchtower'));
});

test('trust is logged with readable reasons and is separate from traveling status', () => {
  const s = fresh(2);
  const c = byKey(s, 'indep');
  changeTrust(s, c.id, 40, 'test');
  assert.equal(c.status, 'independent');
  assert.deepEqual(c.trustLog.at(-1), { t: s.time, amount: 40, reason: 'test' });
  assert.equal(s.notices.at(-1).kind, 'trust');
});

// ---- company ---------------------------------------------------------------------------------
test('bedroll costs gold, adds one companion slot and persists in the save', () => {
  const s = fresh(6);
  assert.equal(capacity(s), COMPANY.baseCapacity);
  assert.equal(freeSlots(s), 0);
  s.gold = UPGRADES.bedroll.cost - 1;
  assert.equal(buyUpgrade(s, 'bedroll').ok, false);
  s.gold = UPGRADES.bedroll.cost;
  assert.equal(buyUpgrade(s, 'bedroll').ok, true);
  assert.equal(s.gold, 0);
  assert.equal(capacity(s), COMPANY.baseCapacity + 1);
  assert.equal(buyUpgrade(s, 'bedroll').ok, false);                     // only once
  assert.equal(capacity(deserialize(serialize(s))), COMPANY.baseCapacity + 1);
});

test('joining needs both enough trust and a free bedroll', () => {
  const s = fresh(6);
  const id = s.cast.indep;
  assert.equal(inviteStatus(s, id).reason, 'low_trust');
  byKey(s, 'indep').trust = COMPANY.joinTrust;
  assert.equal(inviteStatus(s, id).reason, 'no_room');
  s.gold = 100; buyUpgrade(s, 'bedroll');
  assert.equal(invite(s, id).ok, true);
  assert.equal(byKey(s, 'indep').status, 'traveling');
  assert.equal(freeSlots(s), 0);
  assert.equal(s.chronicle.at(-1).type, 'joined');
});

// ---- travel and events -----------------------------------------------------------------------
test('travel advances time, eats provisions and stops for the road event', () => {
  const s = fresh(9);
  const t0 = s.time, p0 = s.provisions;
  depart(s, 'oakvale-stonehaven');
  const r = travelTo(s, 'event');
  assert.equal(r.event, 'weir_bridge');
  assert.ok(s.time > t0 && s.provisions < p0);
  const before = s.time;
  assert.deepEqual(advanceTravel(s, 5), {});                            // paused while the event is open
  assert.equal(s.time, before);
});

test('road event choices have different consequences, and conditions gate options', () => {
  const outcome = (choice, flags = {}) => {
    const s = fresh(10);
    Object.assign(s.flags, flags);
    depart(s, 'oakvale-stonehaven');
    travelTo(s, 'event');
    const ids = availableChoices(s, currentEvent(s)).map(c => c.id);
    if (!ids.includes(choice)) return { ids };
    chooseOption(s, choice);
    const arrival = travelTo(s, 'arrived');
    return { ids, time: s.time, provisions: s.provisions, flags: s.flags, arrival, s };
  };
  const repair = outcome('repair'), detour = outcome('detour');
  assert.ok(!repair.ids.includes('ford'));
  assert.ok(outcome('ford', { heard_ford: true }).ids.includes('ford'));
  assert.ok(detour.time > repair.time);                                 // detour costs time
  assert.ok(repair.flags.repaired_bridge && !detour.flags.repaired_bridge);
  assert.equal(repair.arrival.arrived.town, 'stonehaven');
  assert.equal(repair.s.chronicle.filter(e => e.type === 'road_event').length, 1);
});

test('arrival pays the delivery, records the first visit and brings the independent along', () => {
  const s = fresh(12);
  depart(s, 'oakvale-stonehaven');
  travelTo(s, 'event');
  chooseOption(s, 'repair');
  const gold = s.gold;
  const r = travelTo(s, 'arrived').arrived;
  assert.equal(r.first, true);
  assert.equal(s.gold, gold + r.delivery.gold);
  assert.equal(r.delivery.onTime, s.time <= DELIVERY.deadline);
  assert.equal(byKey(s, 'indep').town, 'stonehaven');
  assert.ok(s.chronicle.some(e => e.type === 'arrived'));
  assert.ok(conversationsFor(s, 'center').some(c => c.id === 'indep_sh_hello'));
});

test('small talk on the road is heard once and only from people present', () => {
  const s = fresh(13);
  depart(s, 'oakvale-stonehaven');
  const heard = [];
  let r, n = 0;
  do { r = advanceTravel(s, 0.5); let c; while ((c = takeChatter(s))) heard.push(c); if (r.event) chooseOption(s, 'detour'); }
  while (!r.arrived && n++ < 1000);
  assert.ok(heard.length >= 3);
  assert.ok(!heard.flat().some(l => l.id === s.cast.indep));             // indep wasn't traveling
});

// ---- chronicle -------------------------------------------------------------------------------
test('chronicle records meaningful events only, with readable descriptions', () => {
  const s = fresh(14);
  const n0 = s.chronicle.length;
  buyProvisions(s, 3);
  talk(s, 'indep_intro');
  assert.equal(s.chronicle.length, n0);                                 // routine things are not recorded
  s.gold = 100; buyUpgrade(s, 'bedroll');
  resolveContract(s, 'granary_rats', [s.cast.comp_a]);
  endJourney(s);
  const types = s.chronicle.map(e => e.type);
  assert.deepEqual(types, ['journey_began', 'upgrade', 'contract', 'journey_end']);
  const merchant = byKey(s, 'merchant').name;
  assert.ok(describe(s, s.chronicle[0]).includes(merchant));
  for (const e of s.chronicle) assert.ok(describe(s, e).length > 10);
  assert.equal(journeySummary(s).contracts.length, 1);
});

test('deaths are possible only on opted-in danger, leave the party, and are chronicled', () => {
  let found = null;
  for (let seed = 1; seed <= 2000 && !found; seed++) {
    const s = fresh(seed);
    const r = resolveContract(s, 'watchtower', availableForContracts(s).map(c => c.id));
    if (r.people.some(p => p.died)) found = s;
  }
  assert.ok(found, 'a serious-danger contract can kill');
  const e = found.chronicle.at(-1);
  assert.ok(e.died.length > 0);
  assert.ok(describe(found, e).includes('did not come back'));
  for (const id of e.died) assert.ok(!availableForContracts(found).some(c => c.id === id));
});

// ---- world interactions (Milestone 2 presentation) --------------------------------------------
import { townPresence, talkOptions, ambientLines, nextAmbient, referableContracts } from '../game/core/interactions.js';
import { CONVERSATIONS } from '../game/content/index.js';

test('the town scene shows the merchant, traveling companions and the independent adventurer', () => {
  const s = fresh(31);
  const roles = townPresence(s).map(p => p.role);
  assert.deepEqual(roles, ['merchant', 'companion', 'companion', 'independent']);
  byKey(s, 'comp_b').status = 'dead';
  assert.ok(!townPresence(s).some(p => p.id === s.cast.comp_b));
  depart(s, 'oakvale-stonehaven');
  assert.deepEqual(townPresence(s), []);                                 // nobody in a square on the road
});

test('an adventurer out on a recommended job is away from the square until it is done', () => {
  const s = fresh(32);
  recommend(s, 'granary_rats', true);
  assert.ok(!townPresence(s).some(p => p.role === 'independent'));
  advanceTime(s, CONTRACTS.granary_rats.hours);
  assert.ok(townPresence(s).some(p => p.role === 'independent'));
  assert.ok(pendingReport(s));                                           // they come back with news
});

test('approaching the independent adventurer offers talk, work, an invitation and goodbye', () => {
  const s = fresh(33);
  const id = s.cast.indep;
  const kinds = () => talkOptions(s, id).map(o => o.kind);
  assert.deepEqual(kinds(), ['topic', 'refer', 'invite', 'leave']);      // only the introduction before meeting
  talk(s, 'indep_intro');
  assert.ok(!talkOptions(s, id).some(o => o.id === 'indep_intro'));     // one-off topics go away
  assert.ok(talkOptions(s, id).filter(o => o.kind === 'topic').length >= 2);
  recommend(s, 'granary_rats', true);
  assert.ok(!kinds().includes('refer'));                                 // one referral at a time
  assert.deepEqual(referableContracts(s), []);
});

test('companion small talk is spoken once, has no effects, then falls back to idle lines', () => {
  for (const cv of CONVERSATIONS.filter(c => c.ambient)) assert.ok(!cv.effects, cv.id + ' has effects');
  const s = fresh(34);
  const trust = byKey(s, 'comp_a').trust;
  const first = nextAmbient(s);
  assert.ok(first && first.length >= 1);
  const heard = new Set();
  let lines;
  while ((lines = nextAmbient(s))) heard.add(lines[0].text);
  assert.ok(!heard.has(first[0].text));                                  // never repeated
  assert.equal(ambientLines(s, s.cast.comp_a, { auto: true }), null);    // nothing new to say unprompted
  const idle = ambientLines(s, s.cast.comp_a);                           // but answers when tapped
  assert.equal(idle.length, 1);
  assert.notEqual(ambientLines(s, s.cast.comp_a)[0].text, idle[0].text); // rotates
  assert.equal(byKey(s, 'comp_a').trust, trust);
  assert.equal(s.chronicle.length, 1);                                   // small talk is not chronicled
});

test('saves from the first slice still load (state format unchanged)', () => {
  const s = fresh(35);
  const old = JSON.parse(serialize(s));
  delete old.seen['idle:comp_a'];
  assert.ok(deserialize(JSON.stringify(old)));
  assert.equal(SAVE_VERSION, 1);
});

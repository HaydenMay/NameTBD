// Caravan, first playable journey: UI controller. Renders HTML from the game state and turns clicks
// into calls to core/ (which holds every rule). Saves after every action.
import { loadManifest } from '../animation/charlib.js';
import { CONTRACTS, TOWNS, ROUTES, PLACES, UPGRADES, DELIVERY, COMPANY, ATTRIBUTES, TRAITS, INTRO,
  REFERRAL_RESPONSES, REFERRAL_REPORTS, REFERRAL_REPORT_EASY, INVITE_RESPONSES } from './content/index.js';
import { newGame, serialize, deserialize, SAVE_KEY, locationName, endJourney, journeySummary } from './core/state.js';
import { byKey, classLabel, xpForNext } from './core/characters.js';
import { successChance, individualRisk, formatPercent, difficultyLabel, dangerTier, memberStrength } from './core/rules.js';
import { contractsIn, travelingCompanions, resolveContract } from './core/contracts.js';
import { canRefer, recommend, pendingReport, deliverReport, referralTarget } from './core/referral.js';
import { trustLabel } from './core/relationships.js';
import { capacity, freeSlots, buyProvisions, buyUpgrade, inviteStatus, invite } from './core/company.js';
import { depart, advanceTravel, takeChatter, estimateRations, mouths, travelRate } from './core/travel.js';
import { currentEvent, availableChoices, chooseOption } from './core/events.js';
import { conversationsFor, talk, speak } from './core/dialogue.js';
import { describe } from './core/chronicle.js';
import { timeLabel, dayOf } from './core/time.js';
import { fill } from './core/text.js';
import { hydratePortraits } from './portraits.js';
import { townArt, TravelScene } from './scene.js';

const HOURS_PER_SECOND = 0.5;   // game hours per real second at 1× speed (30-hour road ≈ 1 minute)
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pic = (c, cls = '') => `<img class="portrait ${cls}${c.status === 'dead' ? ' dead' : ''}" data-portrait="${c.id}" alt="">`;
const signed = n => (n > 0 ? '+' + n : String(n));

let M = null, state = null, scene = null, modalFn = null, modalLocked = false;
const ui = { plan: null, refer: null, paused: false, speed: 1, last: 0, loop: 0, saveClock: 0, chatter: [], chatterT: 0 };

// ---- persistence ------------------------------------------------------------------------------
function save() { if (state) try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch { /* private mode */ } }
function readSave() { try { return deserialize(localStorage.getItem(SAVE_KEY) || ''); } catch { return null; } }

// ---- modal -------------------------------------------------------------------------------------
function openModal(fn, locked = false) { modalFn = fn; modalLocked = locked; renderModal(); }
function renderModal() {
  const back = $('modal');
  if (!modalFn) { back.hidden = true; return; }
  back.hidden = false;
  $('modal-body').innerHTML = modalFn();
  hydratePortraits(M, state, $('modal-body'));
}
function closeModal() { modalFn = null; modalLocked = false; renderModal(); render(); }
const isModalOpen = () => !!modalFn;

function commit() { save(); render(); renderModal(); flushNotices(); }

// ---- notices (toasts) --------------------------------------------------------------------------
function flushNotices() {
  if (!state) return;
  for (const n of state.notices) {
    const c = n.id && state.characters[n.id];
    let text = '';
    if (n.kind === 'trust') text = `${c.name}: trust ${signed(n.amount)}. ${n.reason}.`;
    if (n.kind === 'healed') text = `${c.name} has recovered from their injury.`;
    if (n.kind === 'hungry') text = 'Out of provisions. The caravan slows down and spirits drop.';
    if (!text) continue;
    const el = document.createElement('div');
    el.className = 'toast' + (n.amount < 0 || n.kind === 'hungry' ? ' bad' : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
  state.notices = [];
}

// ---- shared bits -------------------------------------------------------------------------------
function trustMeter(c) {
  const v = Math.max(0, Math.min(100, c.trust)), need = COMPANY.joinTrust;
  const mark = c.status === 'independent' ? `<b class="mark" style="left:${need}%" title="Needed to join: ${need}"></b>` : '';
  return `<div class="trust"><div class="meter">${mark}<i style="width:${v}%"></i></div>
    <span>${trustLabel(c.trust)} · trust ${c.trust}${c.status === 'independent' ? ` / ${need} to join` : ''}</span></div>`;
}
const statusLine = c => c.status === 'dead' ? '<span class="tag bad">Died</span>'
  : c.injury ? `<span class="tag bad">Injured until ${timeLabel(c.injury.until)}</span>` : '';
const whoLine = c => `${esc(classLabel(c))}${c.level ? ` · Level ${c.level}` : ''}${c.tag ? ` · ${esc(c.tag)}` : ''}`;

function conversation(lines, extraHTML = '') {
  return `<div class="convo">${lines.map(l => {
    const c = state.characters[l.id], me = c.role === 'merchant';
    return `<div class="line${me ? ' me' : ''}">${pic(c, 'sm')}<div><b>${esc(c.name)}</b><p>${esc(l.text)}</p></div></div>`;
  }).join('')}</div>${extraHTML}`;
}
const closeBtn = (label = 'Close') => `<div class="actions"><button data-action="close" class="primary">${label}</button></div>`;

// ---- screens -----------------------------------------------------------------------------------
function render() {
  const root = $('screen');
  if (!state) {
    $('hud').hidden = true; $('goal').hidden = true;
    stopTravel();
    root.innerHTML = titleScreen();
    return;
  }
  $('hud').hidden = false; $('goal').hidden = false;
  renderHud();
  if (state.location === 'road') return showTravel();
  stopTravel();
  let report = null;
  if (state.view === 'center' && pendingReport(state) && !isModalOpen()) { report = deliverReport(state); save(); renderHud(); }
  root.innerHTML = townScreen();
  hydratePortraits(M, state, root);
  if (report) { openModal(() => referralReportModal(report)); flushNotices(); }
}

function renderHud() {
  $('hud-loc').textContent = locationName(state);
  $('hud-time').textContent = timeLabel(state.time);
  $('hud-gold').textContent = state.gold;
  $('hud-prov').textContent = state.provisions;
  $('hud-beds').textContent = `${travelingCompanions(state).length}/${capacity(state)}`;
  $('goal').textContent = goalText();
}

function goalText() {
  if (state.finished) return 'The journey is complete. Start a new one from the menu whenever you like.';
  if (!state.delivered) {
    const by = `by ${timeLabel(DELIVERY.deadline)} for a ${DELIVERY.bonus} gold bonus`;
    return state.location === 'road' ? `Taking the wool to Stonehaven (${by}).`
      : `Deliver the wool to Mistress Aldine in Stonehaven ${by}. Look around Oakvale first, then leave from the Caravan.`;
  }
  return 'You made it to Stonehaven. Look around, then end the journey from the Caravan when you\'re ready.';
}

function titleScreen() {
  const saved = readSave();
  return `<section class="title">
    <h1>Caravan</h1>
    <p class="sub">The first journey: Oakvale to Stonehaven</p>
    <div class="actions col">
      ${saved ? `<button class="primary big" data-action="continue">Continue · ${esc(locationName(saved))}, ${timeLabel(saved.time)}</button>` : ''}
      <button class="${saved ? '' : 'primary '}big" data-action="${saved ? 'new-game' : 'new-game-go'}">New journey</button>
    </div>
    <p class="small">Your progress saves automatically in this browser.</p>
  </section>`;
}

function townScreen() {
  const town = TOWNS[state.location], view = state.view || 'center';
  const nav = Object.entries(PLACES).map(([id, p]) =>
    `<button class="place-btn" data-action="nav" data-view="${id}" aria-current="${id === view}"><span aria-hidden="true">${p.icon}</span> ${p.label}</button>`).join('');
  const body = { center: centerView, guild: guildView, market: marketView, caravan: caravanView }[view]();
  return `<section class="town">
    <div class="town-art">${townArt(town, state.location)}<div class="town-title"><h1>${town.name}</h1><p>${PLACES[view].label}</p></div></div>
    <nav class="places" aria-label="Places in ${town.name}">${nav}</nav>
    <p class="blurb">${esc(town.places[view])}</p>
    <div class="place">${body}</div>
  </section>`;
}

function centerView() {
  const town = TOWNS[state.location], c = byKey(state, 'indep');
  let person = '';
  if (c.status === 'independent' && c.town === state.location) {
    const r = state.referral, away = r && r.adventurer === c.id && !r.resolved;
    const topics = away ? '' : conversationsFor(state, 'center', 'indep')
      .map(cv => `<button data-action="talk" data-id="${cv.id}">${esc(cv.label)}</button>`).join('');
    const canRec = !away && Object.keys(CONTRACTS).some(id => canRefer(state, id));
    person = `<section class="card person">
      <div class="who">${pic(c, 'lg')}<div><h3>${esc(c.name)}</h3><p class="muted">${whoLine(c)} · independent adventurer</p>${statusLine(c)}${trustMeter(c)}</div></div>
      ${away ? `<p class="note">Out on "${esc(CONTRACTS[r.contract].title)}" on your recommendation. You'll hear how it went next time you meet.</p>` : ''}
      <div class="actions wrap">${topics}
        ${canRec ? '<button data-action="refer-pick">Recommend a contract</button>' : ''}
        ${away ? '' : '<button data-action="invite">Ask to travel with you</button>'}</div>
    </section>`;
  }
  const notices = town.notices.map(n => `<button class="notice${state.seen['notice:' + n.id] ? ' read' : ''}" data-action="notice" data-id="${n.id}">📜 ${esc(n.title)}</button>`).join('');
  const locals = town.locals.map(l => {
    const lines = [...l.lines, ...Object.entries(l.flagLines || {}).filter(([f]) => state.flags[f]).map(([, t]) => t)];
    return `<div class="local"><b>${esc(l.name)}</b>${lines.map(t => `<p>“${esc(t)}”</p>`).join('')}</div>`;
  }).join('');
  return `<div class="grid">${person}
    <section class="card"><h3>Noticeboard</h3><div class="actions col">${notices}</div></section>
    <section class="card"><h3>Around the square</h3>${locals}</section></div>`;
}

function contractCard(k) {
  const tier = dangerTier(k), st = k.state, indep = byKey(state, 'indep');
  let status = '', buttons = '';
  if (st.status === 'available') {
    buttons = `<button class="primary" data-action="plan" data-id="${k.id}">Plan a party</button>`
      + (canRefer(state, k.id) ? `<button data-action="refer" data-id="${k.id}">Recommend to ${esc(indep.name)}</button>` : '');
  } else if (st.status === 'referred' || st.by === 'referral') {
    status = `<p class="tag">Taken by ${esc(indep.name)} on your recommendation</p>`;
  } else {
    status = `<p class="tag ${st.success ? 'good' : 'bad'}">${st.success ? 'Completed by your party' : 'Attempted, but it didn\'t work out'}</p>`;
  }
  return `<article class="card contract${st.status !== 'available' ? ' done' : ''}">
    <h3>${esc(k.title)}</h3><p class="muted">For ${esc(k.giver)}</p>
    <p>${esc(k.description)}</p>
    <ul class="chips"><li>Reward <b>${k.reward} gold</b></li><li>Takes <b>${k.hours} hours</b></li>
      <li>Difficulty <b>${difficultyLabel(k.difficulty)} (${k.difficulty})</b></li><li>Uses <b>${ATTRIBUTES[k.skill]}</b></li>
      <li class="danger-${k.danger}">Danger <b>${tier.label}</b></li>${k.referable ? '<li>Can be recommended</li>' : ''}</ul>
    ${status}<div class="actions wrap">${buttons}</div></article>`;
}

function guildView() {
  const list = contractsIn(state, state.location).map(contractCard).join('');
  return `<p class="note">Your companions take the job and report back; the merchant stays with the wagon. Pay goes into the caravan's shared purse. Difficulty is how hard the job is; danger is how likely it is that someone gets hurt.</p>
    <div class="grid">${list}</div>`;
}

function marketView() {
  const price = TOWNS[state.location].prices.ration, u = UPGRADES.bedroll, owned = !!state.upgrades.bedroll;
  const indep = byKey(state, 'indep');
  const why = indep.status === 'independent'
    ? `<p class="note">Your companions aren't paid wages; they travel with you because they want to. But anyone new needs somewhere to sleep. If ${esc(indep.name)} ever wants to come along, you'll need this.</p>` : '';
  return `<div class="grid">
    <section class="card"><h3>Provisions</h3>
      <p>You have <b>${state.provisions}</b>. On the road each traveller eats 1 every ${COMPANY.mealHours} hours (${mouths(state)} travellers right now). Running out slows the caravan.</p>
      <div class="actions wrap">
        <button data-action="buy" data-n="1" ${state.gold < price ? 'disabled' : ''}>Buy 1 · ${price} gold</button>
        <button data-action="buy" data-n="5" ${state.gold < price * 5 ? 'disabled' : ''}>Buy 5 · ${price * 5} gold</button></div></section>
    <section class="card"><h3>${u.label}</h3><p>${esc(u.description)}</p>
      <p>Companion bedrolls in use: <b>${travelingCompanions(state).length} of ${capacity(state)}</b>.</p>${why}
      <div class="actions">${owned ? '<span class="tag good">Bought: your wagon sleeps 3 companions</span>'
        : `<button class="primary" data-action="upgrade" data-id="bedroll" ${state.gold < u.cost ? 'disabled' : ''}>Buy for ${u.cost} gold</button>`}</div></section>
  </div>`;
}

function caravanView() {
  const crew = travelingCompanions(state), merchant = byKey(state, 'merchant');
  const lost = Object.values(state.characters).filter(c => c.status === 'dead');
  const people = [merchant, ...crew].map(c => {
    const topics = conversationsFor(state, 'caravan').filter(cv => state.cast[cv.with] === c.id)
      .map(cv => `<button data-action="talk" data-id="${cv.id}">${esc(cv.label)}</button>`).join('');
    return `<section class="card person"><div class="who">${pic(c, 'lg')}<div><h3>${esc(c.name)}</h3>
      <p class="muted">${whoLine(c)}</p>${statusLine(c)}${c.role !== 'merchant' ? trustMeter(c) : '<p class="muted">That\'s you.</p>'}</div></div>
      <div class="actions wrap">${topics}</div></section>`;
  }).join('');
  const cargo = state.delivered ? '' : `<section class="card"><h3>Cargo</h3><p>${DELIVERY.label}: ${DELIVERY.pay} gold on delivery, plus ${DELIVERY.bonus} if it reaches ${esc(DELIVERY.client)} by ${timeLabel(DELIVERY.deadline)}.</p></section>`;
  const routes = TOWNS[state.location].departures.map(id => {
    const r = ROUTES[id], need = estimateRations(state, id);
    return `<section class="card"><h3>Depart for ${TOWNS[r.to].name}</h3><p>${esc(r.blurb)}</p>
      <p>You'll need about <b>${need} provisions</b> (${mouths(state)} travellers). You have <b>${state.provisions}</b>.${state.provisions < need ? ' <span class="tag bad">You may run short</span>' : ''}</p>
      <div class="actions"><button class="primary big" data-action="depart" data-id="${id}">Set off for ${TOWNS[r.to].name}</button></div></section>`;
  }).join('');
  const end = state.location === 'stonehaven' ? `<section class="card"><h3>End of the road (for now)</h3>
      <p>This is as far as the first journey goes.</p><div class="actions">${state.finished
        ? '<button data-action="summary" class="primary">View journey summary</button>'
        : '<button class="primary big" data-action="end">End the journey here</button>'}</div></section>` : '';
  return `<div class="grid">${people}${lost.map(c => `<section class="card person"><div class="who">${pic(c, 'lg')}<div><h3>${esc(c.name)}</h3><p class="muted">${esc(classLabel(c))} · Died on the road</p></div></div></section>`).join('')}
    ${cargo}${routes}${end}</div>`;
}

// ---- modals ------------------------------------------------------------------------------------
function introModal() {
  const cast = ['merchant', 'comp_a', 'comp_b'].map(k => byKey(state, k));
  return `<h2>A new journey</h2><p>${esc(INTRO)}</p>
    <div class="cast">${cast.map(c => `<div class="cast-card">${pic(c, 'lg')}<b>${esc(c.name)}</b><span>${esc(classLabel(c))}${c.role === 'merchant' ? ' (you)' : ''}</span></div>`).join('')}</div>
    ${closeBtn('Begin in Oakvale')}`;
}

function planModal() {
  const k = CONTRACTS[ui.plan.id], crew = travelingCompanions(state);
  const members = crew.filter(c => ui.plan.members.has(c.id));
  const chance = successChance(k, members);
  const rows = crew.map(c => {
    const on = ui.plan.members.has(c.id);
    return `<button class="member" data-action="toggle" data-id="${c.id}" aria-pressed="${on}" ${c.injury ? 'disabled' : ''}>
      ${pic(c, 'sm')}<span><b>${esc(c.name)}</b><small>${esc(classLabel(c))} · Lv ${c.level} · strength ${memberStrength(c, k)}${c.injury ? ' · injured' : ''}</small></span><i>${on ? 'Going' : 'Stays'}</i></button>`;
  }).join('');
  const risks = members.map(c => {
    const r = individualRisk(k, c, members);
    return `<tr><td>${esc(c.name)}</td><td>${formatPercent(r.injury)}</td><td class="${r.death > 0 ? 'bad' : ''}">${formatPercent(r.death)}</td></tr>`;
  }).join('');
  const deadly = members.some(c => individualRisk(k, c, members).death > 0);
  const healer = members.some(c => c.traits.includes('healer')) && members.length > 1;
  const ok = members.length && (!deadly || ui.plan.confirmed);
  return `<h2>${esc(k.title)}</h2><p>${esc(k.description)}</p>
    <ul class="chips"><li>Reward <b>${k.reward} gold</b></li><li>Takes <b>${k.hours} hours</b></li>
      <li>Difficulty <b>${difficultyLabel(k.difficulty)} (${k.difficulty})</b></li><li>Uses <b>${ATTRIBUTES[k.skill]}</b></li><li class="danger-${k.danger}">Danger <b>${dangerTier(k).label}</b></li></ul>
    <h3>Who goes?</h3><div class="members">${rows}</div>
    <div class="odds"><p>Chance the party succeeds: <b class="big-num">${formatPercent(chance)}</b>
      <small>Party strength ${members.reduce((s, c) => s + memberStrength(c, k), 0)} against difficulty ${k.difficulty}</small></p>
      ${members.length ? `<table><thead><tr><th>Each person</th><th>Injury</th><th>Death</th></tr></thead><tbody>${risks}</tbody></table>` : ''}
      ${healer ? '<p class="muted">A healer in the party makes the others less likely to be injured.</p>' : ''}
      <p class="muted">Injury and death are rolled for each person separately, whether or not the job succeeds. Injured companions sit out for ${COMPANY.injuryHours} hours.</p></div>
    ${deadly ? `<label class="confirm"><input type="checkbox" data-action="confirm-risk" ${ui.plan.confirmed ? 'checked' : ''}> I understand this job could get someone killed.</label>` : ''}
    <div class="actions"><button data-action="close">Cancel</button><button class="primary" data-action="send" ${ok ? '' : 'disabled'}>Send them (${k.hours} hours pass)</button></div>`;
}

function contractReportModal(r) {
  const k = CONTRACTS[r.contract];
  const people = r.people.map(p => {
    const c = state.characters[p.id];
    const what = p.died ? '<span class="bad">did not come back</span>'
      : p.injured ? `<span class="bad">was injured</span> and will sit out until ${timeLabel(c.injury.until)}` : 'came back unhurt';
    return `<li>${pic(c, 'sm')} <span><b>${esc(c.name)}</b> ${what}.${p.died ? '' : ` +${r.xp} experience${p.levels ? `, now <b>level ${c.level}</b>` : ''}.`}${p.trust ? ` <small>Trust ${signed(p.trust.amount)}: ${esc(p.trust.reason)}.</small>` : ''}</span></li>`;
  }).join('');
  return `<h2>${r.success ? 'Job done' : 'It didn\'t work out'}: ${esc(k.title)}</h2>
    <p>${esc(r.success ? k.success : k.failure)}</p>
    <p><b>${r.success ? `+${r.gold} gold` : 'No pay'}</b> for the caravan purse. ${r.hours} hours have passed.</p>
    <ul class="people">${people}</ul>${closeBtn()}`;
}

function referPickModal() {
  const indep = byKey(state, 'indep');
  const ids = Object.keys(CONTRACTS).filter(id => canRefer(state, id));
  return `<h2>Recommend a contract to ${esc(indep.name)}</h2>
    <p>${esc(indep.name)} would take it on alone and keep the pay. Some contracts on the board can be passed on:</p>
    <div class="actions col">${ids.map(id => `<button data-action="refer" data-id="${id}">${esc(CONTRACTS[id].title)} · ${CONTRACTS[id].reward} gold · danger ${dangerTier(CONTRACTS[id]).label}</button>`).join('')}</div>
    ${closeBtn('Never mind')}`;
}

function referModal() {
  const k = CONTRACTS[ui.refer.id], c = byKey(state, 'indep'), res = ui.refer.result;
  if (res) {
    const lines = speak(state, REFERRAL_RESPONSES[res.accept ? (ui.refer.honest ? 'accept_honest' : 'accept_easy') : res.reason], { contract: k.title });
    const after = res.accept
      ? `<p class="note">${esc(c.name)} sets off. The job takes about ${k.hours} hours; you'll hear how it went the next time you meet.</p>`
      : `<p class="note">${esc(c.name)} turned it down. You can't push the same job again.</p>`;
    return `<h2>${esc(k.title)}</h2>${conversation(lines, after)}${closeBtn()}`;
  }
  const chance = successChance(k, [c]), risk = individualRisk(k, c, [c], { noDeath: true }).injury;
  return `<h2>Recommend “${esc(k.title)}” to ${esc(c.name)}</h2><p>${esc(k.description)}</p>
    <div class="odds"><p>Your estimate for ${esc(c.name)} alone: success <b>${formatPercent(chance)}</b>, injury <b>${formatPercent(risk)}</b>. Pay: ${k.reward} gold, all theirs.</p>
    <p class="muted">${esc(c.name)} decides based on what you tell them. If it goes badly, how much they hold it against you depends on whether you were straight with them.</p></div>
    <div class="actions col"><button class="primary" data-action="refer-go" data-honest="1">Tell it straight, risks and all</button>
      <button data-action="refer-go" data-honest="0">Make it sound easier than it is</button><button data-action="close">Never mind</button></div>`;
}

function referralReportModal(r) {
  const k = CONTRACTS[r.contract], c = state.characters[r.adventurer];
  const key = `${r.success ? 'success' : 'fail'}_${r.hurt ? 'hurt' : 'clean'}`;
  const lines = speak(state, [...REFERRAL_REPORTS[key], ...(!r.honest && REFERRAL_REPORT_EASY[key] ? [REFERRAL_REPORT_EASY[key]] : [])], { contract: k.title });
  return `<h2>${esc(c.name)} reports back</h2>${conversation(lines)}
    <ul class="people"><li><span>${r.success ? `Earned ${r.gold} gold, which ${esc(c.name)} keeps.` : 'Earned nothing from it.'}${r.hurt ? ` Injured until ${timeLabel(c.injury ? c.injury.until : state.time)}.` : ''}</span></li>
      <li><span>Trust ${signed(r.trust.amount)}: ${esc(r.trust.reason)}.</span></li></ul>${closeBtn()}`;
}

function inviteModal(status) {
  const c = byKey(state, 'indep');
  const lines = speak(state, INVITE_RESPONSES[status.reason] || INVITE_RESPONSES.low_trust);
  const note = status.reason === 'accept' ? `<p class="note">${esc(c.name)} joins the caravan and will travel with you.</p>`
    : status.reason === 'no_room' ? `<p class="note">Your wagon sleeps you and ${capacity(state)} companions, and every bedroll is taken. An extra bedroll from the market would make room.</p>`
      : `<p class="note">Trust ${c.trust} of ${status.need} needed. ${esc(c.name)} wants to know you better first: helpful conversations, good advice, a recommendation that pays off.</p>`;
  return `<h2>${esc(c.name)}</h2>${conversation(lines, note)}${closeBtn()}`;
}

function noticeModal(n) { return `<h2>${esc(n.title)}</h2><p class="paper">${esc(n.text)}</p>${closeBtn()}`; }

function departModal(id) {
  const r = ROUTES[id], need = estimateRations(state, id);
  const injured = travelingCompanions(state).filter(c => c.injury);
  const r0 = state.referral && !state.referral.resolved;
  return `<h2>Set off for ${TOWNS[r.to].name}?</h2><p>${esc(r.blurb)}</p>
    <ul class="people"><li><span>Travellers: ${mouths(state)}. Provisions needed: about ${need}; you have ${state.provisions}.</span></li>
      ${injured.length ? `<li><span>${injured.map(c => esc(c.name)).join(', ')} will travel while recovering.</span></li>` : ''}
      ${r0 ? `<li><span>${esc(byKey(state, 'indep').name)} is still out on a job; they'll catch up with you in ${TOWNS[r.to].name}.</span></li>` : ''}
      <li><span>Anything you haven't done in ${TOWNS[state.location].name} stays undone; this journey only goes one way.</span></li></ul>
    <div class="actions"><button data-action="close">Not yet</button><button class="primary" data-action="depart-go" data-id="${id}">Set off</button></div>`;
}

function eventModal() {
  if (ui.eventResult) {
    const res = ui.eventResult;
    return `<h2>${esc(ui.eventTitle)}</h2><p>${esc(res.text)}</p>
      ${res.summary.length ? `<ul class="chips">${res.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      <div class="actions"><button class="primary" data-action="event-done">Continue the journey</button></div>`;
  }
  const ev = currentEvent(state);
  return `<h2>${esc(ev.title)}</h2><p>${esc(fill(ev.text, state))}</p>
    <div class="actions col choices">${availableChoices(state, ev).map(ch =>
      `<button data-action="choose" data-id="${ch.id}"><b>${esc(fill(ch.label, state))}</b><small>${esc(fill(ch.detail, state))}</small></button>`).join('')}</div>`;
}

function arrivalModal(a) {
  const town = TOWNS[a.town];
  return `<h2>${town.name}</h2><p>${esc(town.blurb)}</p>
    ${a.delivery ? `<p>You deliver the wool to ${esc(DELIVERY.client)}. ${a.delivery.onTime ? 'It arrived in good time.' : 'It\'s later than promised, so there\'s no bonus.'} <b>+${a.delivery.gold} gold</b>.</p>` : ''}
    ${closeBtn('Look around')}`;
}

function partyModal() {
  const known = Object.values(state.characters);
  const card = c => {
    const log = c.trustLog.slice(-4).reverse().map(t => `<li>${signed(t.amount)} · ${esc(t.reason)}</li>`).join('');
    const attrs = c.attrs ? Object.entries(c.attrs).map(([k, v]) => `${ATTRIBUTES[k]} ${v}`).join(' · ') : '';
    const traits = c.traits.filter(t => TRAITS[t]).map(t => `<p class="muted">${esc(TRAITS[t])}</p>`).join('');
    const status = c.role === 'merchant' ? 'Traveling (you)' : c.status === 'traveling' ? 'Traveling with the caravan'
      : c.status === 'dead' ? 'Died'
        : state.location === 'road' && c.heading ? `Independent, making their own way to ${TOWNS[c.heading].name}`
          : `Independent${c.town ? ', in ' + TOWNS[c.town].name : ''}`;
    return `<section class="card person"><div class="who">${pic(c, 'lg')}<div><h3>${esc(c.name)}</h3>
      <p class="muted">${whoLine(c)}</p><p>${status}</p>${statusLine(c)}</div></div>
      ${c.bio ? `<p>${esc(c.bio)}</p>` : ''}
      ${c.level ? `<p>${attrs} · XP ${c.xp}/${xpForNext(c.level)}</p>${traits}` : ''}
      ${c.purse ? `<p class="muted">Has earned ${c.purse} gold of their own.</p>` : ''}
      ${c.role !== 'merchant' ? trustMeter(c) + (log ? `<ul class="log">${log}</ul>` : '') : ''}</section>`;
  };
  return `<h2>People</h2><p class="muted">Companion bedrolls: ${travelingCompanions(state).length} of ${capacity(state)} in use.</p>
    <div class="grid">${known.map(card).join('')}</div>${closeBtn()}`;
}

function chronicleModal() {
  let day = 0;
  const rows = state.chronicle.map(e => {
    const d = dayOf(e.t), head = d !== day ? `<h3>Day ${d}</h3>` : '';
    day = d;
    return `${head}<p class="entry">${esc(describe(state, e))}</p>`;
  }).join('');
  return `<h2>Caravan Chronicle</h2>${rows}${closeBtn()}`;
}

function menuModal() {
  return `<h2>Menu</h2><p>${esc(locationName(state))}, ${timeLabel(state.time)}. Progress is saved automatically after every action.</p>
    <div class="actions col">${state.finished ? '<button data-action="summary">View journey summary</button>' : ''}
      <button data-action="new-game">Start a new journey</button><button data-action="close" class="primary">Back to the game</button></div>`;
}

function confirmNewModal() {
  return `<h2>Start a new journey?</h2><p>This replaces your current save with a new merchant and new companions.</p>
    <div class="actions"><button data-action="${state ? 'close' : 'title'}">Cancel</button><button class="primary" data-action="new-game-go">Start again</button></div>`;
}

function endModal() {
  return `<h2>End the journey here?</h2><p>The first journey ends in Stonehaven. You'll see a short summary, and the Chronicle stays available.</p>
    <div class="actions"><button data-action="close">Not yet</button><button class="primary" data-action="end-go">End the journey</button></div>`;
}

function summaryModal() {
  const s = journeySummary(state), indep = byKey(state, 'indep');
  const comps = s.companions.map(c => `<li>${pic(c, 'sm')}<span><b>${esc(c.name)}</b>, ${esc(classLabel(c))} level ${c.level}: ${c.status === 'dead' ? 'died on the journey'
    : c.status === 'traveling' ? `traveling with you (${trustLabel(c.trust).toLowerCase()})` : `independent, ${trustLabel(c.trust).toLowerCase()}`}${c.injury ? ', injured' : ''}.</span></li>`).join('');
  const ref = s.referral ? `${esc(indep.name)} took “${esc(CONTRACTS[s.referral.contract].title)}” on your recommendation${s.referral.resolved ? (s.referral.success ? ' and it paid off' : ' and it didn\'t work out') : ''}.` : 'You didn\'t pass any work on.';
  return `<h2>Journey's end</h2>
    <p>Left Oakvale on Day 1 and reached Stonehaven on Day ${state.delivered ? dayOf(state.delivered.t) : s.days}. ${s.delivered ? (s.delivered.onTime ? 'The wool arrived on time.' : 'The wool arrived late.') : ''}</p>
    <ul class="chips"><li>Gold <b>${s.gold}</b> (${signed(s.goldChange)})</li><li>Provisions <b>${s.provisions}</b></li>
      <li>Contracts <b>${s.contracts.filter(c => c.success).length}/${s.contracts.length}</b> succeeded</li><li>Bedrolls <b>${capacity(state)}</b></li></ul>
    <p>${ref}</p><ul class="people">${comps}</ul>
    <div class="actions wrap"><button data-action="chronicle">Read the Chronicle</button><button data-action="new-game">Start a new journey</button><button class="primary" data-action="close">Close</button></div>`;
}

// ---- travel ------------------------------------------------------------------------------------
function showTravel() {
  const root = $('screen'), t = state.travel;
  if (!$('travel-canvas')) {
    const route = ROUTES[t.route];
    root.innerHTML = `<section class="travel">
      <div class="stage"><canvas id="travel-canvas"></canvas><div class="chatter" id="chatter" aria-live="polite"></div>
        <div class="paused-tag" id="paused-tag" hidden>Paused</div></div>
      <div class="progress"><span>${TOWNS[route.from].name}</span><div class="bar"><div id="tr-bar"></div></div><span>${TOWNS[route.to].name}</span></div>
      <p class="eta" id="tr-eta"></p>
      <div class="actions controls"><button data-action="pause" id="btn-pause" class="big"></button>
        <div class="speeds" role="group" aria-label="Travel speed">${[1, 2, 4].map(v => `<button data-action="speed" data-v="${v}" aria-pressed="${ui.speed === v}">${v}×</button>`).join('')}</div></div>
      <p class="muted center">Time only passes while the caravan is moving. Press space to pause.</p>
    </section>`;
    scene = new TravelScene($('travel-canvas'), M);
  }
  scene.setCrew([byKey(state, 'merchant'), ...travelingCompanions(state)]);
  updateTravelHud();
  if (!ui.loop) { ui.last = performance.now(); ui.loop = requestAnimationFrame(travelFrame); }
  if (state.event && !isModalOpen()) openEvent();
}

function stopTravel() { if (ui.loop) cancelAnimationFrame(ui.loop); ui.loop = 0; scene = null; }

function updateTravelHud() {
  const t = state.travel;
  if (!t || !$('tr-bar')) return;
  $('tr-bar').style.width = (100 * t.progress / t.length).toFixed(1) + '%';
  const left = Math.ceil((t.length - t.progress) / travelRate(state));
  $('tr-eta').textContent = `About ${left} hours to ${TOWNS[t.to].name}${t.hungry ? ' · out of provisions, moving slowly' : ''}`;
  $('btn-pause').textContent = ui.paused ? '▶ Resume' : '❚❚ Pause';
  $('paused-tag').hidden = !(ui.paused && !isModalOpen());
  renderHud();
}

function travelFrame(now) {
  ui.loop = 0;
  if (!state || state.location !== 'road' || !scene) return;
  const dt = Math.min(0.1, (now - ui.last) / 1000); ui.last = now;
  const running = !ui.paused && !state.event && !isModalOpen() && !document.hidden;
  if (running) {
    const res = advanceTravel(state, dt * HOURS_PER_SECOND * ui.speed);
    const talkLines = takeChatter(state);
    if (talkLines) ui.chatter.push(...talkLines);
    ui.saveClock += dt;
    if (ui.saveClock > 2) { save(); ui.saveClock = 0; }
    flushNotices();
    if (res.event) { save(); openEvent(); }
    if (res.arrived) {
      save(); stopTravel(); ui.chatter = [];
      render();
      openModal(() => arrivalModal(res.arrived));
      flushNotices();
      return;
    }
    updateTravelHud();
    tickChatter(dt);
  } else if (state.location === 'road') updateTravelHud();
  scene.draw(now, running, state.time % 24);
  ui.loop = requestAnimationFrame(travelFrame);
}

function tickChatter(dt) {
  const box = $('chatter');
  ui.chatterT -= dt;
  if (ui.chatterT > 0) return;
  const line = ui.chatter.shift();
  if (!line) { box.classList.remove('show'); return; }
  const c = state.characters[line.id];
  box.innerHTML = `<b>${esc(c.name)}</b> ${esc(line.text)}`;
  box.classList.add('show');
  ui.chatterT = 2.2 + line.text.length * 0.03;
}

function openEvent() {
  ui.eventResult = null;
  ui.eventTitle = currentEvent(state).title;
  openModal(eventModal, true);
}

// ---- actions -----------------------------------------------------------------------------------
const actions = {
  'continue'() { state = readSave(); if (!state) return render(); ui.paused = false; commit(); },
  'new-game'() { openModal(confirmNewModal); },
  'title'() { modalFn = null; renderModal(); render(); },
  'new-game-go'() {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) || Date.now();
    stopTravel(); ui.chatter = []; ui.paused = false;
    state = newGame(M, seed);
    commit();
    openModal(introModal);
  },
  'close'() { if (!modalLocked) closeModal(); },
  'nav'(d) { state.view = d.view; commit(); window.scrollTo({ top: 0 }); },
  'talk'(d) { const lines = talk(state, d.id); save(); openModal(() => conversation(lines) + closeBtn()); commit(); },
  'notice'(d) {
    const n = TOWNS[state.location].notices.find(x => x.id === d.id);
    state.seen['notice:' + n.id] = true;
    if (n.flag) state.flags[n.flag] = true;
    openModal(() => noticeModal(n)); commit();
  },
  'plan'(d) {
    const free = travelingCompanions(state).filter(c => !c.injury);
    ui.plan = { id: d.id, members: new Set(free.map(c => c.id)), confirmed: false };
    openModal(planModal);
  },
  'toggle'(d) { const m = ui.plan.members; m.has(d.id) ? m.delete(d.id) : m.add(d.id); renderModal(); },
  'confirm-risk'(d, el) { ui.plan.confirmed = el.checked; renderModal(); },
  'send'() {
    const r = resolveContract(state, ui.plan.id, [...ui.plan.members]);
    ui.plan = null;
    openModal(() => contractReportModal(r)); commit();
  },
  'refer-pick'() { openModal(referPickModal); },
  'refer'(d) { ui.refer = { id: d.id, result: null }; openModal(referModal); },
  'refer-go'(d) { ui.refer.honest = d.honest === '1'; ui.refer.result = recommend(state, ui.refer.id, ui.refer.honest); commit(); },
  'invite'() {
    const s = inviteStatus(state, state.cast.indep);
    if (s.ok) invite(state, state.cast.indep);
    openModal(() => inviteModal(s)); commit();
  },
  'buy'(d) { buyProvisions(state, Number(d.n)); commit(); },
  'upgrade'(d) {
    if (buyUpgrade(state, d.id).ok) {
      const el = document.createElement('div'); el.className = 'toast';
      el.textContent = `Bought an ${UPGRADES[d.id].label.toLowerCase()}. Your wagon now sleeps ${capacity(state)} companions.`;
      $('toasts').appendChild(el); setTimeout(() => el.remove(), 5000);
    }
    commit();
  },
  'depart'(d) { openModal(() => departModal(d.id)); },
  'depart-go'(d) { depart(state, d.id); ui.paused = false; ui.chatter = []; modalFn = null; renderModal(); commit(); },
  'pause'() { ui.paused = !ui.paused; save(); updateTravelHud(); },
  'speed'(d) { ui.speed = Number(d.v); document.querySelectorAll('[data-action=speed]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === d.v)); },
  'choose'(d) { ui.eventResult = chooseOption(state, d.id); save(); renderModal(); flushNotices(); },
  'event-done'() { ui.eventResult = null; modalFn = null; modalLocked = false; renderModal(); commit(); },
  'party'() { openModal(partyModal); },
  'chronicle'() { openModal(chronicleModal); },
  'menu'() { openModal(menuModal); },
  'end'() { openModal(endModal); },
  'end-go'() { endJourney(state); commit(); openModal(summaryModal); },
  'summary'() { openModal(summaryModal); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el.dataset, el); }
});
$('modal').addEventListener('click', e => { if (e.target.id === 'modal' && !modalLocked) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isModalOpen() && !modalLocked) closeModal();
  if (e.key === ' ' && state && state.location === 'road' && !isModalOpen() && e.target === document.body) { e.preventDefault(); actions.pause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('resize', () => scene && scene.resize());

// ---- boot --------------------------------------------------------------------------------------
try {
  M = await loadManifest({ preload: false });
  render();
} catch (err) {
  $('screen').innerHTML = `<section class="title"><h1>Caravan</h1><p>Couldn't load the character data (${esc(err.message)}). This page needs to be served over http, not opened as a file.</p></section>`;
}
window.__game = { get state() { return state; }, actions, save };

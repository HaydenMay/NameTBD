// HTML for the overlays that sit on top of the world: side/bottom sheets (Guild, Market, Caravan,
// noticeboard, People, Chronicle, menu, summary), the talk/decision panel, and the title card.
// Pure functions of the game state plus a little UI state; main.js wires up the clicks.
import { CONTRACTS, TOWNS, ROUTES, UPGRADES, DELIVERY, COMPANY, ATTRIBUTES, TRAITS, INTRO,
  REFERRAL_RESPONSES, REFERRAL_REPORTS, REFERRAL_REPORT_EASY, INVITE_RESPONSES } from './content/index.js';
import { locationName, journeySummary } from './core/state.js';
import { byKey, classLabel, xpForNext } from './core/characters.js';
import { successChance, individualRisk, formatPercent, difficultyLabel, dangerTier, memberStrength } from './core/rules.js';
import { contractsIn, travelingCompanions } from './core/contracts.js';
import { canRefer } from './core/referral.js';
import { trustLabel } from './core/relationships.js';
import { capacity, freeSlots, inviteStatus } from './core/company.js';
import { estimateRations, mouths } from './core/travel.js';
import { currentEvent, availableChoices } from './core/events.js';
import { speak } from './core/dialogue.js';
import { talkOptions, referableContracts } from './core/interactions.js';
import { describe } from './core/chronicle.js';
import { timeLabel, dayOf } from './core/time.js';
import { fill } from './core/text.js';

export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const signed = n => (n > 0 ? '+' + n : String(n));
const pic = (c, cls = '') => `<img class="portrait ${cls}${c.status === 'dead' ? ' dead' : ''}" data-portrait="${c.id}" alt="">`;
const chips = items => `<ul class="chips">${items.filter(Boolean).map(i => `<li>${i}</li>`).join('')}</ul>`;
const contractChips = k => chips([`<b>${k.reward} gold</b>`, `${k.hours} h`, `${difficultyLabel(k.difficulty)} (${k.difficulty})`,
  `uses ${ATTRIBUTES[k.skill]}`, `<span class="danger-${k.danger}">danger: ${dangerTier(k).label}</span>`]);

export function trustMeter(c) {
  const v = Math.max(0, Math.min(100, c.trust)), need = COMPANY.joinTrust, ind = c.status === 'independent';
  return `<div class="trust"><div class="meter">${ind ? `<b class="mark" style="left:${need}%"></b>` : ''}<i style="width:${v}%"></i></div>
    <span>${trustLabel(c.trust)} · ${c.trust}${ind ? ` / ${need} to join` : ''}</span></div>`;
}
const injuryTag = c => (c.injury ? `<span class="tag bad">Injured until ${timeLabel(c.injury.until)}</span>` : '');
export const whoLine = c => `${esc(classLabel(c))}${c.level ? ` · Lv ${c.level}` : ''}${c.tag ? ` · ${esc(c.tag)}` : ''}`;

export function goalText(state) {
  if (state.finished) return 'The journey is complete.';
  if (!state.delivered) return `Take the wool to Mistress Aldine in Stonehaven by ${timeLabel(DELIVERY.deadline)} for a ${DELIVERY.bonus} gold bonus.`;
  return 'You made it to Stonehaven. End the journey from the Caravan when you\'re ready.';
}

function lines(state, ls) {
  return `<div class="lines">${ls.map(l => {
    const c = state.characters[l.id];
    return `<p class="${c.role === 'merchant' ? 'me' : ''}"><b>${esc(c.name)}</b> ${esc(l.text)}</p>`;
  }).join('')}</div>`;
}

// ---- talk / decision panel ---------------------------------------------------------------------
export function talkPanel(state, p) {
  const c = state.characters[p.id];
  let body = p.lines && p.lines.length ? lines(state, p.lines) : '';
  if (p.note) body += `<p class="note">${p.note}</p>`;
  let opts = '';
  if (p.mode === 'refer-pick') {
    opts = referableContracts(state).map(id => {
      const k = CONTRACTS[id];
      return `<button data-action="refer-pick" data-id="${id}">${esc(k.title)} <small>${k.reward} gold · danger ${dangerTier(k).label}</small></button>`;
    }).join('') + '<button data-action="talk-back">Back</button>';
  } else if (p.mode === 'refer-confirm') {
    const k = CONTRACTS[p.contract];
    const chance = successChance(k, [c]), risk = individualRisk(k, c, [c], { noDeath: true }).injury;
    body += `<p class="estimate"><b>${esc(k.title)}</b>: ${k.reward} gold, all theirs, about ${k.hours} hours. Your estimate for ${esc(c.name)} alone: <b>${formatPercent(chance)}</b> success, <b>${formatPercent(risk)}</b> injury.</p>`;
    opts = `<button class="primary" data-action="refer-go" data-honest="1">Tell it straight</button>
      <button data-action="refer-go" data-honest="0">Make it sound easier</button><button data-action="talk-back">Back</button>`;
  } else if (p.mode === 'done') {
    opts = (p.extra || '') + '<button data-action="close-panel">Goodbye</button>';
  } else {
    opts = talkOptions(state, p.id).map(o => o.kind === 'leave'
      ? `<button data-action="close-panel">${o.label}</button>`
      : `<button data-action="talk-${o.kind}" ${o.id ? `data-id="${o.id}"` : ''}>${esc(o.label)}</button>`).join('');
  }
  return `<header>${pic(c, 'sm')}<div><b>${esc(c.name)}</b><small>${whoLine(c)}${c.status === 'independent' ? ' · independent' : ''}</small>${trustMeter(c)}</div>
      <button class="x" data-action="close-panel" aria-label="Close">×</button></header>
    ${body}<div class="opts">${opts}</div>`;
}

export function referResponse(state, res, honest, contract) {
  const k = CONTRACTS[contract];
  return speak(state, REFERRAL_RESPONSES[res.accept ? (honest ? 'accept_honest' : 'accept_easy') : res.reason], { contract: k.title });
}
export function reportLines(state, r) {
  const key = `${r.success ? 'success' : 'fail'}_${r.hurt ? 'hurt' : 'clean'}`;
  const ls = [...REFERRAL_REPORTS[key], ...(!r.honest && REFERRAL_REPORT_EASY[key] ? [REFERRAL_REPORT_EASY[key]] : [])];
  return speak(state, ls, { contract: CONTRACTS[r.contract].title });
}
export function reportNote(state, r) {
  const c = state.characters[r.adventurer];
  return `${r.success ? `Earned ${r.gold} gold, which ${esc(c.name)} keeps.` : 'No pay.'}${r.hurt && c.injury ? ` Injured until ${timeLabel(c.injury.until)}.` : ''} Trust ${signed(r.trust.amount)}: ${esc(r.trust.reason)}.`;
}
export const inviteLines = (state, s) => speak(state, INVITE_RESPONSES[s.reason] || INVITE_RESPONSES.low_trust);
export function inviteNote(state, s) {
  const c = byKey(state, 'indep');
  if (s.reason === 'accept') return `${esc(c.name)} joins the caravan.`;
  if (s.reason === 'no_room') return `Every bedroll is taken (${capacity(state)} companions). An extra bedroll from the market would make room.`;
  return `Trust ${c.trust} of ${s.need}. ${esc(c.name)} wants to know you better first.`;
}

export function eventPanel(state, result, title) {
  if (result) {
    return `<header><div><b>${esc(title)}</b></div></header><p>${esc(result.text)}</p>
      ${result.summary.length ? chips(result.summary.map(esc)) : ''}
      <div class="opts"><button class="primary" data-action="event-done">Continue the journey</button></div>`;
  }
  const ev = currentEvent(state);
  return `<header><div><b>${esc(ev.title)}</b><small>The caravan has stopped.</small></div></header><p>${esc(fill(ev.text, state))}</p>
    <div class="opts choices">${availableChoices(state, ev).map(ch =>
      `<button data-action="choose" data-id="${ch.id}"><b>${esc(fill(ch.label, state))}</b><small>${esc(fill(ch.detail, state))}</small></button>`).join('')}</div>`;
}

export function introPanel(state) {
  const cast = ['merchant', 'comp_a', 'comp_b'].map(k => byKey(state, k));
  return `<header><div><b>A new journey</b></div></header><p>${esc(INTRO)}</p>
    <p class="cast-line">${cast.map(c => `${pic(c, 'xs')} <b>${esc(c.name)}</b> <small>${esc(classLabel(c))}${c.role === 'merchant' ? ' (you)' : ''}</small>`).join(' ')}</p>
    <p class="note">${esc(goalText(state))} Tap people and the noticeboard in the square; the bar at the bottom takes you to the Guild, Market and Caravan.</p>
    <div class="opts"><button class="primary" data-action="close-panel">Begin</button></div>`;
}

export function titleCard(saved) {
  return `<h1>Caravan</h1><p>The first journey: Oakvale to Stonehaven</p>
    <div class="opts col">${saved ? `<button class="primary" data-action="continue">Continue · ${esc(locationName(saved))}, ${timeLabel(saved.time)}</button>` : ''}
      <button class="${saved ? '' : 'primary'}" data-action="${saved ? 'new-confirm' : 'new-game'}">New journey</button></div>
    ${saved ? '<div id="new-confirm" hidden><p>Start over with a new merchant and companions? Your current journey will be replaced.</p><div class="opts"><button data-action="new-game" class="primary">Start again</button></div></div>' : ''}
    <p class="small">Progress saves automatically in this browser.</p>`;
}

export function arrivalCard(a) {
  const town = TOWNS[a.town];
  return `<h2>${town.name}</h2><p>${esc(town.blurb)}</p>
    ${a.delivery ? `<p>Wool delivered to ${esc(DELIVERY.client.split(',')[0])}${a.delivery.onTime ? ', on time' : ', late'}: <b>+${a.delivery.gold} gold</b>.</p>` : ''}`;
}

// ---- sheets ------------------------------------------------------------------------------------
export function guildSheet(state, ui) {
  if (ui.plan) return plannerView(state, ui.plan);
  const indep = byKey(state, 'indep');
  const report = ui.guildReport ? contractReport(state, ui.guildReport) : '';
  const list = contractsIn(state, state.location).map(k => {
    const st = k.state;
    let foot;
    if (st.status === 'available') {
      foot = `<div class="opts"><button class="primary" data-action="plan" data-id="${k.id}">Choose who goes</button>
        ${canRefer(state, k.id) ? `<button data-action="refer-from-guild" data-id="${k.id}">Tell ${esc(indep.name)} about it</button>` : ''}</div>`;
    } else if (st.status === 'referred' || st.by === 'referral') foot = `<p class="tag">Taken by ${esc(indep.name)} on your recommendation</p>`;
    else foot = `<p class="tag ${st.success ? 'good' : 'bad'}">${st.success ? 'Done' : 'Attempted, didn\'t work out'}</p>`;
    return `<article class="row${st.status !== 'available' ? ' done' : ''}"><h3>${esc(k.title)}</h3>
      <p>${esc(k.description)}</p>${contractChips(k)}${foot}</article>`;
  }).join('');
  return `${report}<p class="muted">Your companions take the job and report back; you stay with the wagon. Pay goes to the shared purse.</p>${list}`;
}

function plannerView(state, plan) {
  const k = CONTRACTS[plan.id], crew = travelingCompanions(state);
  const members = crew.filter(c => plan.members.has(c.id));
  const chance = successChance(k, members);
  const rows = crew.map(c => {
    const on = plan.members.has(c.id);
    return `<button class="member" data-action="toggle" data-id="${c.id}" aria-pressed="${on}" ${c.injury ? 'disabled' : ''}>
      ${pic(c, 'sm')}<span><b>${esc(c.name)}</b><small>${esc(classLabel(c))} · Lv ${c.level} · strength ${memberStrength(c, k)}${c.injury ? ' · injured' : ''}</small></span><i>${on ? 'Going' : 'Stays'}</i></button>`;
  }).join('');
  const risk = members.map(c => [c, individualRisk(k, c, members)]);
  const deadly = risk.some(([, r]) => r.death > 0);
  const healer = members.length > 1 && members.some(c => c.traits.includes('healer'));
  const ok = members.length && (!deadly || plan.confirmed);
  return `<button class="back" data-action="plan-back">‹ All contracts</button><h3>${esc(k.title)}</h3>${contractChips(k)}
    <div class="members">${rows}</div>
    <div class="odds"><p>Party success: <b class="big-num">${formatPercent(chance)}</b> <small>strength ${members.reduce((s, c) => s + memberStrength(c, k), 0)} vs difficulty ${k.difficulty}</small></p>
      ${members.length ? `<table><thead><tr><th>Each person</th><th>Injury</th><th>Death</th></tr></thead><tbody>${risk.map(([c, r]) =>
        `<tr><td>${esc(c.name)}</td><td>${formatPercent(r.injury)}</td><td class="${r.death > 0 ? 'bad' : ''}">${formatPercent(r.death)}</td></tr>`).join('')}</tbody></table>` : ''}
      <small>Rolled separately for each person, whether or not the job succeeds.${healer ? ' A healer in the party lowers the others\' injury risk.' : ''} Injured companions rest for ${COMPANY.injuryHours} hours.</small></div>
    ${deadly ? `<label class="confirm"><input type="checkbox" data-action="confirm-risk" ${plan.confirmed ? 'checked' : ''}> I understand this job could get someone killed.</label>` : ''}
    <div class="opts"><button class="primary" data-action="send" ${ok ? '' : 'disabled'}>Send them (${k.hours} hours pass)</button></div>`;
}

function contractReport(state, r) {
  const k = CONTRACTS[r.contract];
  const hurt = r.people.filter(p => p.injured).map(p => state.characters[p.id].name);
  const died = r.people.filter(p => p.died).map(p => state.characters[p.id].name);
  const levels = r.people.filter(p => p.levels).map(p => `${state.characters[p.id].name} reached level ${state.characters[p.id].level}`);
  const people = r.people.map(p => {
    const c = state.characters[p.id];
    return `<li><b>${esc(c.name)}</b> ${p.died ? 'did not come back' : p.injured ? `was injured (resting until ${timeLabel(c.injury.until)})` : 'came back unhurt'}${p.trust ? `. Trust ${signed(p.trust.amount)}: ${esc(p.trust.reason)}` : ''}.</li>`;
  }).join('');
  return `<section class="report ${r.success ? 'good' : 'bad'}"><button class="x" data-action="dismiss-report" aria-label="Dismiss">×</button>
    <b>${r.success ? 'Back from' : 'No luck with'} "${esc(k.title)}"</b>
    <p>${r.success ? `+${r.gold} gold` : 'No pay'} · +${r.xp} XP each · ${r.hours} hours passed${died.length ? ` · <span class="bad">${esc(died.join(', '))} died</span>` : ''}${hurt.length ? ` · <span class="bad">${esc(hurt.join(', '))} hurt</span>` : ''}${levels.length ? ` · ${esc(levels.join(', '))}` : ''}</p>
    <details><summary>What happened</summary><p>${esc(r.success ? k.success : k.failure)}</p><ul>${people}</ul></details></section>`;
}

export function marketSheet(state) {
  const price = TOWNS[state.location].prices.ration, u = UPGRADES.bedroll, owned = !!state.upgrades.bedroll;
  const indep = byKey(state, 'indep');
  const here = indep.status === 'independent' && indep.town === state.location;
  const nudge = owned && here && freeSlots(state) > 0
    ? `<p class="note">There's room for one more now.</p><div class="opts"><button data-action="talk-to" data-id="${indep.id}">Talk to ${esc(indep.name)}</button></div>`
    : !owned && indep.status === 'independent' ? `<p class="muted">Companions aren't paid; they travel with you because they want to. Anyone new needs a place to sleep.</p>` : '';
  return `<article class="row"><h3>Provisions <small>you have ${state.provisions}</small></h3>
      <p>Each traveller eats 1 every ${COMPANY.mealHours} hours on the road (${mouths(state)} travellers). Running out slows the caravan.</p>
      <div class="opts"><button data-action="buy" data-n="1" ${state.gold < price ? 'disabled' : ''}>Buy 1 · ${price} gold</button>
        <button data-action="buy" data-n="5" ${state.gold < price * 5 ? 'disabled' : ''}>Buy 5 · ${price * 5} gold</button></div></article>
    <article class="row"><h3>${u.label} <small>bedrolls ${travelingCompanions(state).length}/${capacity(state)}</small></h3><p>${esc(u.description)}</p>
      ${owned ? '<p class="tag good">Bought</p>' : `<div class="opts"><button class="primary" data-action="upgrade" data-id="bedroll" ${state.gold < u.cost ? 'disabled' : ''}>Buy for ${u.cost} gold</button></div>`}
      ${nudge}</article>`;
}

export function caravanSheet(state, ui) {
  const crew = travelingCompanions(state);
  const people = crew.map(c => `<li>${pic(c, 'sm')}<span><b>${esc(c.name)}</b> <small>${whoLine(c)}</small>${injuryTag(c)}${trustMeter(c)}</span></li>`).join('');
  const lost = Object.values(state.characters).filter(c => c.status === 'dead')
    .map(c => `<li>${pic(c, 'sm')}<span><b>${esc(c.name)}</b> <small>died on the journey</small></span></li>`).join('');
  const cargo = state.delivered ? '' : `<p class="muted">Cargo: ${DELIVERY.label}, ${DELIVERY.pay} gold on delivery (+${DELIVERY.bonus} by ${timeLabel(DELIVERY.deadline)}).</p>`;
  const routes = TOWNS[state.location].departures.map(id => {
    const r = ROUTES[id], need = estimateRations(state, id), busy = state.referral && !state.referral.resolved;
    return `<article class="row"><h3>Set off for ${TOWNS[r.to].name}</h3><p>${esc(r.blurb)}</p>
      <p>About <b>${need} provisions</b> needed for ${mouths(state)} travellers; you have <b>${state.provisions}</b>.${state.provisions < need ? ' <span class="tag bad">may run short</span>' : ''}
      ${busy ? ` ${esc(byKey(state, 'indep').name)} is still out on a job and will catch up in ${TOWNS[r.to].name}.` : ''} This road only goes one way.</p>
      <div class="opts"><button class="primary" data-action="depart" data-id="${id}">Set off</button></div></article>`;
  }).join('');
  const end = state.location !== 'stonehaven' ? '' : state.finished
    ? '<div class="opts"><button class="primary" data-action="summary">Journey summary</button></div>'
    : `<article class="row"><h3>End of the road, for now</h3><p>This is as far as the first journey goes.</p><div class="opts">${ui.endConfirm
      ? '<button class="primary" data-action="end-go">Yes, end the journey</button><button data-action="end-cancel">Not yet</button>'
      : '<button class="primary" data-action="end">End the journey here</button>'}</div></article>`;
  return `<ul class="people">${people}${lost}</ul><p class="muted">Bedrolls: ${crew.length} of ${capacity(state)} in use.</p>${cargo}${routes}${end}`;
}

export function boardSheet(state) {
  const town = TOWNS[state.location];
  const notices = town.notices.map(n => `<article class="paper"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></article>`).join('');
  const work = contractsIn(state, state.location).filter(k => k.state.status === 'available')
    .map(k => `<li>${esc(k.title)} <small>${k.reward} gold · danger ${dangerTier(k).label}</small></li>`).join('');
  const locals = town.locals.map(l => {
    const ls = [...l.lines, ...Object.entries(l.flagLines || {}).filter(([f]) => state.flags[f]).map(([, t]) => t)];
    return `<p class="local"><b>${esc(l.name)}:</b> ${ls.map(t => `“${esc(t)}”`).join(' ')}</p>`;
  }).join('');
  return `${notices}${work ? `<h3>Work posted at the guild</h3><ul class="plain">${work}</ul><div class="opts"><button data-action="nav" data-view="guild">Go to the guild</button></div>` : ''}
    <h3>Overheard nearby</h3>${locals}`;
}

export function peopleSheet(state) {
  return Object.values(state.characters).map(c => {
    const log = c.trustLog.slice(-4).reverse().map(t => `<li>${signed(t.amount)} · ${esc(t.reason)}</li>`).join('');
    const attrs = c.attrs ? Object.entries(c.attrs).map(([k, v]) => `${ATTRIBUTES[k]} ${v}`).join(' · ') : '';
    const traits = c.traits.filter(t => TRAITS[t]).map(t => `<p class="muted">${esc(TRAITS[t])}</p>`).join('');
    const status = c.role === 'merchant' ? 'You' : c.status === 'traveling' ? 'Traveling with the caravan'
      : c.status === 'dead' ? 'Died'
        : state.location === 'road' && c.heading ? `Independent, making their own way to ${TOWNS[c.heading].name}`
          : `Independent${c.town ? ', in ' + TOWNS[c.town].name : ''}`;
    return `<article class="row person">${pic(c, 'md')}<div><h3>${esc(c.name)} <small>${whoLine(c)}</small></h3><p class="muted">${status}</p>${injuryTag(c)}
      ${c.bio ? `<p>${esc(c.bio)}</p>` : ''}${c.level ? `<p>${attrs} · XP ${c.xp}/${xpForNext(c.level)}</p>${traits}` : ''}
      ${c.purse ? `<p class="muted">Has earned ${c.purse} gold of their own.</p>` : ''}
      ${c.role !== 'merchant' ? trustMeter(c) + (log ? `<ul class="log">${log}</ul>` : '') : ''}</div></article>`;
  }).join('');
}

export function chronicleSheet(state) {
  let day = 0;
  return state.chronicle.map(e => {
    const d = dayOf(e.t), head = d !== day ? `<h3>Day ${d}</h3>` : '';
    day = d;
    return `${head}<p class="entry">${esc(describe(state, e))}</p>`;
  }).join('');
}

export function menuSheet(state, ui) {
  return `<p><b>${esc(locationName(state))}</b>, ${timeLabel(state.time)}</p><p>${esc(goalText(state))}</p>
    <p class="muted">Progress saves automatically after every action.</p>
    <div class="opts col">${state.finished ? '<button data-action="summary">Journey summary</button>' : ''}
      ${ui.newConfirm ? '<p>Replace this journey with a new merchant and companions?</p><button class="primary" data-action="new-game">Start again</button><button data-action="new-cancel">Keep playing</button>'
        : '<button data-action="new-confirm">Start a new journey</button>'}</div>`;
}

export function summarySheet(state) {
  const s = journeySummary(state), indep = byKey(state, 'indep');
  const comps = s.companions.map(c => `<li>${pic(c, 'sm')}<span><b>${esc(c.name)}</b>, ${esc(classLabel(c))} level ${c.level}: ${c.status === 'dead' ? 'died on the journey'
    : c.status === 'traveling' ? `traveling with you (${trustLabel(c.trust).toLowerCase()})` : `independent, ${trustLabel(c.trust).toLowerCase()}`}${c.injury ? ', injured' : ''}.</span></li>`).join('');
  const ref = s.referral ? `${esc(indep.name)} took “${esc(CONTRACTS[s.referral.contract].title)}” on your recommendation${s.referral.resolved ? (s.referral.success ? ' and it paid off' : ' and it didn\'t work out') : ''}.` : 'You didn\'t pass any work on.';
  return `<p>Left Oakvale on Day 1 and reached Stonehaven on Day ${state.delivered ? dayOf(state.delivered.t) : s.days}. ${s.delivered ? (s.delivered.onTime ? 'The wool arrived on time.' : 'The wool arrived late.') : ''}</p>
    ${chips([`Gold <b>${s.gold}</b> (${signed(s.goldChange)})`, `Provisions <b>${s.provisions}</b>`, `Contracts <b>${s.contracts.filter(c => c.success).length}/${s.contracts.length}</b>`, `Bedrolls <b>${capacity(state)}</b>`])}
    <p>${ref}</p><ul class="people">${comps}</ul>
    <div class="opts"><button data-action="chronicle">Read the Chronicle</button><button data-action="new-game">Start a new journey</button></div>`;
}

export const SHEETS = {
  guild: { title: s => `${TOWNS[s.location].name} Adventurers' Guild`, view: guildSheet },
  market: { title: s => `${TOWNS[s.location].name} Market`, view: marketSheet },
  caravan: { title: () => 'Your caravan', view: caravanSheet },
  board: { title: () => 'Noticeboard', view: boardSheet },
  people: { title: () => 'People', view: peopleSheet },
  chronicle: { title: () => 'Caravan Chronicle', view: chronicleSheet },
  menu: { title: () => 'Menu', view: menuSheet },
  summary: { title: () => 'Journey\'s end', view: summarySheet },
};
export { inviteStatus };

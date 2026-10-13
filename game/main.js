// Caravan: UI controller. The world (a town square or the road) fills the screen; people and the
// noticeboard are tappable; small talk appears as speech bubbles; decisions use one compact panel;
// Guild/Market/Caravan and records open in a sheet over the scene. All rules live in core/.
import { loadManifest } from '../animation/charlib.js';
import { TOWNS, ROUTES, UPGRADES } from './content/index.js';
import { newGame, serialize, deserialize, SAVE_KEY, locationName, endJourney } from './core/state.js';
import { byKey } from './core/characters.js';
import { travelingCompanions, resolveContract } from './core/contracts.js';
import { recommend, pendingReport, deliverReport } from './core/referral.js';
import { capacity, buyProvisions, buyUpgrade, inviteStatus, invite } from './core/company.js';
import { depart, advanceTravel, takeChatter, travelRate } from './core/travel.js';
import { currentEvent, chooseOption } from './core/events.js';
import { talk } from './core/dialogue.js';
import { townPresence, ambientLines, nextAmbient, referableContracts } from './core/interactions.js';
import { timeLabel } from './core/time.js';
import { hydratePortraits } from './portraits.js';
import { Stage } from './scene.js';
import * as V from './views.js';

const HOURS_PER_SECOND = 0.5;   // game hours per real second at 1× (the 30-hour road takes about a minute)
const $ = id => document.getElementById(id);
const esc = V.esc;

let M = null, state = null, stage = null;
const ui = {
  sheet: null, panel: null, plan: null, guildReport: null, eventResult: null, endConfirm: false, newConfirm: false,
  paused: false, speed: 1, last: 0, saveClock: 0, idle: 0, say: [], bubble: null, cardTimer: 0,
};

// ---- persistence ------------------------------------------------------------------------------
function save() { if (state) try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch { /* private mode */ } }
function readSave() { try { return deserialize(localStorage.getItem(SAVE_KEY) || ''); } catch { return null; } }

const mode = () => (!state ? 'title' : state.location === 'road' ? 'travel' : 'town');
const sheetName = () => ui.sheet || (state && state.location !== 'road' && state.view && state.view !== 'center' ? state.view : null);

// ---- rendering of overlays -----------------------------------------------------------------------
function commit() { save(); renderAll(); flushNotices(); }

function renderAll() {
  const m = mode();
  document.body.dataset.mode = m;
  $('hud').hidden = m === 'title';
  $('places').hidden = m !== 'town';
  $('travelbar').hidden = m !== 'travel';
  if (m === 'town' && !ui.panel && !sheetName() && pendingReport(state)) {         // they come back with news
    const r = deliverReport(state);
    save();
    ui.panel = { type: 'talk', id: r.adventurer, lines: V.reportLines(state, r), note: V.reportNote(state, r), mode: 'menu' };
  }
  if (m === 'travel' && state.event && (!ui.panel || ui.panel.type !== 'event')) { ui.eventResult = null; ui.panel = { type: 'event', title: currentEvent(state).title }; }
  renderHud(); renderPlaces(); renderTravelBar(); renderSheet(); renderPanel();
  if (m === 'title') showCard(V.titleCard(readSave()), 'title');
  else if ($('card').dataset.kind === 'title') hideCard();
}

function renderHud() {
  if (!state) return;
  const set = (id, v) => { const el = $(id); if (el.textContent !== String(v)) el.textContent = v; };
  set('hud-loc', locationName(state));
  set('hud-time', timeLabel(state.time));
  set('hud-gold', state.gold);
  set('hud-prov', state.provisions);
  set('hud-beds', `${travelingCompanions(state).length}/${capacity(state)}`);
}

function renderPlaces() {
  if (mode() !== 'town') return;
  const open = sheetName() || 'center';
  for (const b of document.querySelectorAll('#places button')) b.setAttribute('aria-current', String(b.dataset.view === open));
}

function renderTravelBar() {
  if (mode() !== 'travel') return;
  const t = state.travel, route = ROUTES[t.route];
  $('tb-from').textContent = TOWNS[route.from].name;
  $('tb-to').textContent = TOWNS[route.to].name;
  $('tb-fill').style.width = (100 * t.progress / t.length).toFixed(1) + '%';
  const left = Math.ceil((t.length - t.progress) / travelRate(state));
  $('tb-eta').textContent = `${left} h to go${t.hungry ? ' · out of food, moving slowly' : ''}`;
  $('tb-pause').textContent = ui.paused ? '▶ Resume' : '❚❚ Pause';
  for (const b of document.querySelectorAll('#travelbar [data-action=speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === ui.speed));
}

function renderSheet() {
  const name = state && sheetName(), el = $('sheet');
  document.body.classList.toggle('sheet-open', !!name);
  if (!name) { el.hidden = true; el.dataset.name = ''; return; }
  const S = V.SHEETS[name], body = $('sheet-body');
  const keep = el.dataset.name === name ? body.scrollTop : 0;
  el.hidden = false; el.dataset.name = name;
  $('sheet-title').textContent = S.title(state);
  body.innerHTML = S.view(state, ui);
  body.scrollTop = keep;
  hydratePortraits(M, state, body);
}

function renderPanel() {
  const p = ui.panel, el = $('panel');
  if (!p || !state) { el.hidden = true; return; }
  el.hidden = false;
  el.dataset.type = p.type;
  el.innerHTML = p.type === 'talk' ? V.talkPanel(state, p) : p.type === 'event' ? V.eventPanel(state, ui.eventResult, p.title) : V.introPanel(state);
  hydratePortraits(M, state, el);
}

function showCard(html, kind, ms = 0) {
  const el = $('card');
  el.innerHTML = html; el.dataset.kind = kind; el.hidden = false;
  clearTimeout(ui.cardTimer);
  if (ms) ui.cardTimer = setTimeout(hideCard, ms);
}
function hideCard() { $('card').hidden = true; $('card').dataset.kind = ''; }

function toast(text, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function flushNotices() {
  if (!state) return;
  for (const n of state.notices) {
    const c = n.id && state.characters[n.id];
    if (n.kind === 'trust') toast(`${c.name} · trust ${V.signed(n.amount)} · ${n.reason}`, n.amount < 0);
    if (n.kind === 'healed') toast(`${c.name} has recovered.`);
    if (n.kind === 'hungry') toast('Out of provisions. The caravan slows down.', true);
  }
  state.notices = [];
}

// ---- people in the world: tap targets, name tags, speech bubbles --------------------------------
function placeActors() {
  const layer = $('actors'), m = mode(), A = stage.anchors, seen = new Set();
  if (m === 'town' && state) {
    for (const [id, a] of Object.entries(A)) {
      seen.add(id);
      let el = layer.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = document.createElement('button');
        el.className = 'actor'; el.dataset.action = 'tap'; el.dataset.id = id;
        el.innerHTML = '<span class="tag"></span>';
        layer.appendChild(el);
      }
      const c = state.characters[id];
      const label = id === 'board' ? '📜 Noticeboard' : a.role === 'independent' ? `💬 ${c.name}` : a.role === 'merchant' ? `${c.name} (you)` : c.name;
      const tag = el.firstChild;
      if (tag.textContent !== label) { tag.textContent = label; el.setAttribute('aria-label', id === 'board' ? 'Read the noticeboard' : `${c.name}`); }
      el.dataset.role = a.role;
      const w = a.w || a.h * 0.46;
      el.style.cssText = `left:${a.x - w / 2}px;top:${a.top}px;width:${w}px;height:${a.foot - a.top}px`;
    }
  }
  for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
}

function say(lines) { if (lines && lines.length) { ui.say.push(...lines); ui.idle = 0; } }
function tickBubble(dt) {
  const el = $('bubble');
  if (ui.panel && ui.panel.type === 'event') { el.hidden = true; return; }      // no small talk over a decision
  if (ui.bubble) { ui.bubble.t -= dt; if (ui.bubble.t <= 0) ui.bubble = null; }
  if (!ui.bubble && ui.say.length) {
    const l = ui.say.shift();
    ui.bubble = { ...l, t: Math.max(3, 1.6 + l.text.length * 0.055) };   // time to actually read it
    const c = state.characters[l.id];
    el.innerHTML = `<b>${esc(c.name)}</b>${esc(l.text)}`;
  }
  if (!ui.bubble) { el.hidden = true; return; }
  el.hidden = false;
  const a = stage.anchors[ui.bubble.id];
  if (a && !(ui.panel && mode() === 'town' && window.innerWidth < 700)) {
    el.classList.remove('sub');
    const w = el.offsetWidth, x = Math.max(8 + w / 2, Math.min(stage.W - 8 - w / 2, a.x));
    el.style.left = x + 'px'; el.style.top = Math.max(64 + el.offsetHeight, a.top - 6) + 'px';
    el.style.setProperty('--tail', (a.x - x) + 'px');
  } else {                                                         // speaker not in view: subtitle
    el.classList.add('sub');
    el.style.left = '50%'; el.style.top = '';
  }
}

// ---- the main loop ----------------------------------------------------------------------------
function insets() {
  const m = mode();
  let bottom = m === 'town' ? $('places').offsetHeight + 12 : m === 'travel' ? $('travelbar').offsetHeight + 12 : 0;
  if (ui.panel && !$('panel').hidden) bottom = Math.max(bottom, Math.min($('panel').offsetHeight + 16, innerHeight * 0.45));   // lift the scene above the panel
  const sheet = $('sheet'), side = !sheet.hidden && innerWidth >= 860;
  return { bottom, right: side ? sheet.offsetWidth + 8 : 0 };
}

function frame(now) {
  const dt = Math.min(0.1, (now - ui.last) / 1000); ui.last = now;
  const m = mode(), ins = insets();
  if (m === 'travel') {
    const running = !ui.paused && !state.event && !ui.panel && !sheetName() && !document.hidden;
    if (running) {
      const res = advanceTravel(state, dt * HOURS_PER_SECOND * ui.speed);
      say(takeChatter(state));
      ui.saveClock += dt;
      if (ui.saveClock > 2) { save(); ui.saveClock = 0; }
      flushNotices();
      if (res.event) { save(); renderAll(); }
      if (res.arrived) {
        save(); ui.say = []; ui.bubble = null; ui.idle = 0;
        renderAll();
        showCard(V.arrivalCard(res.arrived), 'arrival', 8000);
      }
    }
    renderHud(); renderTravelBar();
    if (state.location === 'road') {
      stage.drawTravel(now, { crew: [byKey(state, 'merchant'), ...travelingCompanions(state)], moving: running, hour: state.time % 24, insets: ins });
    }
  }
  if (mode() === 'town') {
    const people = townPresence(state).map(p => ({ ...p, c: state.characters[p.id] }));
    stage.drawTown(now, { townId: state.location, town: TOWNS[state.location], people, hour: state.time % 24, insets: ins });
    if (!ui.panel && !sheetName() && !ui.bubble && !ui.say.length) {
      ui.idle += dt;
      if (ui.idle > 6) { ui.idle = 0; const ls = nextAmbient(state); if (ls) { save(); say(ls); } }
    }
  } else if (m === 'title') {
    stage.drawTown(now, { townId: 'oakvale', town: TOWNS.oakvale, people: [], hour: 9, insets: ins });
  }
  placeActors();
  if (state) tickBubble(dt); else $('bubble').hidden = true;
  requestAnimationFrame(frame);
}

// ---- interactions -------------------------------------------------------------------------------
function openTalk(id, extra = {}) { ui.sheet = null; if (state.view !== 'center') state.view = 'center'; ui.panel = { type: 'talk', id, lines: [], mode: 'menu', ...extra }; ui.idle = 0; }
function closeSheet() { ui.sheet = null; ui.plan = null; ui.endConfirm = false; ui.newConfirm = false; if (state && state.view !== 'center') state.view = 'center'; }

const actions = {
  'continue'() { state = readSave(); if (!state) return renderAll(); ui.paused = false; ui.panel = null; hideCard(); commit(); },
  'new-confirm'() { if (!state) { const el = $('new-confirm'); if (el) el.hidden = false; return; } ui.newConfirm = true; renderSheet(); },
  'new-cancel'() { ui.newConfirm = false; renderSheet(); },
  'new-game'() {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) || Date.now();
    state = newGame(M, seed);
    Object.assign(ui, { sheet: null, plan: null, guildReport: null, eventResult: null, endConfirm: false, newConfirm: false, paused: false, say: [], bubble: null, idle: 0 });
    ui.panel = { type: 'intro' };
    hideCard(); commit();
  },
  'nav'(d) {
    const open = sheetName() || 'center';
    ui.sheet = null; ui.plan = null; ui.panel = ui.panel && ui.panel.type === 'event' ? ui.panel : null;
    state.view = d.view === open ? 'center' : d.view;
    if (state.view !== 'guild') ui.guildReport = null;
    commit();
  },
  'close-sheet'() { closeSheet(); commit(); },
  'tap'(d) {
    if (d.id === 'board') {
      for (const n of TOWNS[state.location].notices) { state.seen['notice:' + n.id] = true; if (n.flag) state.flags[n.flag] = true; }
      ui.panel = null; ui.sheet = 'board'; return commit();
    }
    const c = state.characters[d.id];
    if (c.role === 'merchant') { ui.sheet = 'people'; return renderAll(); }
    if (c.status === 'independent') { openTalk(c.id); return commit(); }
    say(ambientLines(state, c.id)); save();                       // companions just talk
  },
  'close-panel'() { if (ui.panel && ui.panel.type === 'event') return; ui.panel = null; ui.idle = 0; commit(); },
  'talk-topic'(d) { const p = ui.panel; p.lines = talk(state, d.id); p.note = null; p.mode = 'menu'; commit(); },
  'talk-refer'() {
    const ids = referableContracts(state), p = ui.panel;
    Object.assign(p, ids.length === 1 ? { mode: 'refer-confirm', contract: ids[0] } : { mode: 'refer-pick' }, { lines: [], note: null });
    renderPanel();
  },
  'refer-pick'(d) { Object.assign(ui.panel, { mode: 'refer-confirm', contract: d.id }); renderPanel(); },
  'talk-back'() { Object.assign(ui.panel, { mode: 'menu', note: null }); renderPanel(); },
  'refer-go'(d) {
    const p = ui.panel, honest = d.honest === '1', c = state.characters[p.id];
    const res = recommend(state, p.contract, honest);
    p.lines = V.referResponse(state, res, honest, p.contract);
    p.note = res.accept ? `${esc(c.name)} heads off. You'll hear how it went when they're back.` : 'They turned it down. You can\'t push the same job again.';
    p.mode = res.accept ? 'done' : 'menu';
    commit();
  },
  'talk-invite'() {
    const p = ui.panel, s = inviteStatus(state, p.id);
    if (s.ok) invite(state, p.id);
    p.lines = V.inviteLines(state, s); p.note = V.inviteNote(state, s);
    p.mode = s.ok || s.reason === 'no_room' ? 'done' : 'menu';
    p.extra = s.reason === 'no_room' ? '<button class="primary" data-action="nav" data-view="market">Go to the market</button>' : '';
    commit();
  },
  'talk-to'(d) { openTalk(d.id); commit(); },
  'refer-from-guild'(d) { closeSheet(); openTalk(state.cast.indep, { mode: 'refer-confirm', contract: d.id }); commit(); },
  'plan'(d) {
    const free = travelingCompanions(state).filter(c => !c.injury);
    ui.plan = { id: d.id, members: new Set(free.map(c => c.id)), confirmed: false }; ui.guildReport = null;
    renderSheet(); $('sheet-body').scrollTop = 0;
  },
  'plan-back'() { ui.plan = null; renderSheet(); },
  'toggle'(d) { const s = ui.plan.members; s.has(d.id) ? s.delete(d.id) : s.add(d.id); renderSheet(); },
  'confirm-risk'(d, el) { ui.plan.confirmed = el.checked; renderSheet(); },
  'send'() {
    ui.guildReport = resolveContract(state, ui.plan.id, [...ui.plan.members]);
    ui.plan = null;
    commit(); $('sheet-body').scrollTop = 0;
  },
  'dismiss-report'() { ui.guildReport = null; renderSheet(); },
  'buy'(d) { buyProvisions(state, Number(d.n)); commit(); },
  'upgrade'(d) { if (buyUpgrade(state, d.id).ok) toast(`Bought an ${UPGRADES[d.id].label.toLowerCase()}. The wagon sleeps ${capacity(state)} companions now.`); commit(); },
  'depart'(d) { closeSheet(); depart(state, d.id); ui.paused = false; ui.say = []; ui.bubble = null; ui.panel = null; commit(); },
  'pause'() { ui.paused = !ui.paused; save(); renderTravelBar(); },
  'speed'(d) { ui.speed = Number(d.v); renderTravelBar(); },
  'choose'(d) { ui.eventResult = chooseOption(state, d.id); save(); renderPanel(); flushNotices(); },
  'event-done'() { ui.eventResult = null; ui.panel = null; commit(); },
  'people'() { ui.sheet = ui.sheet === 'people' ? null : 'people'; renderAll(); },
  'chronicle'() { ui.sheet = ui.sheet === 'chronicle' ? null : 'chronicle'; renderAll(); },
  'menu'() { ui.newConfirm = false; ui.sheet = ui.sheet === 'menu' ? null : 'menu'; renderAll(); },
  'summary'() { ui.sheet = 'summary'; renderAll(); },
  'end'() { ui.endConfirm = true; renderSheet(); },
  'end-cancel'() { ui.endConfirm = false; renderSheet(); },
  'end-go'() { endJourney(state); ui.endConfirm = false; ui.sheet = 'summary'; commit(); },
  'dismiss-card'() { if ($('card').dataset.kind !== 'title') hideCard(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (ui.panel && ui.panel.type !== 'event') actions['close-panel']();
    else if (sheetName()) actions['close-sheet']();
  }
  if (e.key === ' ' && mode() === 'travel' && e.target === document.body) { e.preventDefault(); actions.pause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---- boot --------------------------------------------------------------------------------------
try {
  M = await loadManifest({ preload: false });
  stage = new Stage($('world'), M);
  renderAll();
  requestAnimationFrame(t => { ui.last = t; frame(t); });
} catch (err) {
  showCard(`<h1>Caravan</h1><p>Couldn't load the character data (${esc(err.message)}). This page needs to be served over http, not opened as a file.</p>`, 'error');
}
window.__game = { get state() { return state; }, get ui() { return ui; }, actions, save, get stage() { return stage; } };

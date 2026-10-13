// Travel between towns: progress, provisions and road events.
// Progress is measured in hours of road at normal pace. Each traveller (merchant included) eats one
// ration every COMPANY.mealHours of road time; with nothing to eat the wagon moves at 75% and spirits drop.
import { ROUTES, COMPANY, DELIVERY } from '../content/index.js';
import { travelingCompanions } from './contracts.js';
import { changeTrust } from './relationships.js';
import { record } from './chronicle.js';
import { advanceTime } from './time.js';
import { fill } from './text.js';

export const mouths = state => 1 + travelingCompanions(state).length;
export const estimateRations = (state, routeId) => Math.floor(ROUTES[routeId].hours / COMPANY.mealHours) * mouths(state);
export const travelRate = state => (state.travel && state.travel.hungry ? 0.75 : 1);

export function depart(state, routeId) {
  const route = ROUTES[routeId];
  if (!route || route.from !== state.location) throw new Error('no route ' + routeId + ' from ' + state.location);
  state.travel = { route: routeId, from: route.from, to: route.to, progress: 0, length: route.hours,
    elapsed: 0, fired: [], chatter: [], hungry: false, departedAt: state.time,
    crew: travelingCompanions(state).map(c => c.id) };
  state.location = 'road';
}

function eat(state) {
  const n = mouths(state);
  if (state.provisions >= n) { state.provisions -= n; state.travel.hungry = false; return; }
  state.provisions = 0;
  if (!state.travel.hungry) state.notices.push({ kind: 'hungry' });
  state.travel.hungry = true;
  for (const c of travelingCompanions(state)) changeTrust(state, c.id, -1, 'Went hungry on the road');
}

/** Time passing on the road, moving or stopped: meals come due and the clock advances. */
export function passRoadTime(state, hours) {
  const t = state.travel;
  const before = Math.floor(t.elapsed / COMPANY.mealHours);
  t.elapsed += hours;
  const after = Math.floor(t.elapsed / COMPANY.mealHours);
  for (let i = before; i < after; i++) eat(state);
  advanceTime(state, hours);
}

function nextEvent(state) {
  const t = state.travel, route = ROUTES[t.route];
  const due = route.events.filter(e => !t.fired.includes(e.id)).sort((a, b) => a.at - b.at)[0];
  return due ? { id: due.id, at: due.at * route.hours } : null;
}

/** Moves the caravan forward by game hours. Stops at a road event or on arrival. */
export function advanceTravel(state, hours) {
  const t = state.travel;
  if (!t || state.event) return {};
  let left = hours;
  while (left > 1e-9) {
    const ev = nextEvent(state);
    const target = Math.min(t.length, ev ? ev.at : Infinity);
    const rate = travelRate(state);
    const step = Math.min(left, Math.max(0, (target - t.progress) / rate));
    t.progress = Math.min(t.length, t.progress + step * rate);
    passRoadTime(state, step);
    left -= step;
    if (t.progress >= t.length - 1e-9) return { arrived: arrive(state) };
    if (ev && t.progress >= ev.at - 1e-9) {
      t.fired.push(ev.id);
      state.event = { id: ev.id };
      return { event: ev.id };
    }
  }
  return {};
}

/** Next small-talk exchange that's due (shown without pausing). Marks it as heard. */
export function takeChatter(state) {
  const t = state.travel;
  if (!t) return null;
  const route = ROUTES[t.route], frac = t.progress / route.hours;
  for (const c of route.chatter) {
    if (t.chatter.includes(c.id) || frac < c.at) continue;
    t.chatter.push(c.id);
    const speakers = c.lines.map(([who]) => state.characters[state.cast[who]]);
    if (speakers.some(s => !s || s.status !== 'traveling')) continue;   // everyone speaking must be here
    return c.lines.map(([who, text]) => ({ id: state.cast[who], text: fill(text, state) }));
  }
  return null;
}

function arrive(state) {
  const t = state.travel, town = t.to;
  state.location = town;
  state.view = 'center';
  state.travel = null;
  const first = !state.visited[town];
  state.visited[town] = true;
  if (first) record(state, 'arrived', { town }, [state.cast.merchant, ...travelingCompanions(state).map(c => c.id)]);
  for (const c of travelingCompanions(state)) {
    if (t.crew.includes(c.id)) changeTrust(state, c.id, 2, 'Made the journey together');
  }
  for (const c of Object.values(state.characters)) {
    if (c.status === 'independent' && c.heading === town) c.town = town;   // they made their own way here
  }
  let delivery = null;
  if (DELIVERY.town === town && !state.delivered) {
    const onTime = state.time <= DELIVERY.deadline;
    const gold = DELIVERY.pay + (onTime ? DELIVERY.bonus : 0);
    state.gold += gold;
    state.delivered = { onTime, gold, t: state.time };
    record(state, 'delivery', { onTime, gold }, [state.cast.merchant]);
    delivery = state.delivered;
  }
  return { town, first, delivery };
}

// The world view: one full-screen canvas that draws either a town square or the road.
// Characters are the real generated characters (animation/charlib.js). Buildings, props, wagon,
// horse and scenery are simple code-drawn placeholders, meant to be replaced by painted art later.
// After each draw, `anchors` says where every person (and the noticeboard) is on screen, so the UI
// can put tap targets, name tags and speech bubbles on them.
import { pose, resolveProfile, groundSpeed } from '../animation/anim.js';
import { drawCharacter } from '../animation/charlib.js';
import { characterArt } from './portraits.js';
import { recipeOf } from './core/characters.js';

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const SKY = [[0, '#1d2540'], [5, '#2c3558'], [6.5, '#e7a982'], [8, '#a9d3ea'], [17, '#a9d3ea'], [19, '#e59a6b'], [20.5, '#2c3558'], [24, '#1d2540']];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function skyAt(hour) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    if (hour >= h0 && hour <= h1) {
      const f = (hour - h0) / (h1 - h0), a = rgb(c0), b = rgb(c1);
      return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
    }
  }
  return SKY[0][1];
}
const darkness = h => (h < 5 || h > 20.5 ? 0.38 : h < 7 ? 0.38 * (7 - h) / 2 : h > 18.5 ? 0.38 * (h - 18.5) / 2 : 0);

/**
 * Where everyone stands in a town square, in screen pixels. u = height of a standing person.
 * Landscape: one wide square. Portrait: merchant and the person you'd talk to in front,
 * companions a step behind, so everyone stays large enough to tap.
 */
export function townLayout(W, H, people, insets = { top: 0, bottom: 0 }) {
  const We = W - (insets.right || 0), portrait = We < H * 0.9, cx = We / 2, floor = H - insets.bottom;   // centred in the space a side sheet leaves
  const u = Math.min(portrait ? Math.min(We / 1.8, H * 0.34) : Math.min(H * 0.44, We / 3.9), (floor - 70) / 1.1);   // stays clear of the HUD
  const front = floor - u * (portrait ? 0.07 : 0.05), back = front - u * (portrait ? 0.3 : 0.22);
  const horizon = back - u * (portrait ? 0.42 : 0.4);
  const comps = people.filter(p => p.role === 'companion'), ind = people.find(p => p.role === 'independent');
  const slots = [];
  const place = (p, x, foot, scale, flip = false) => slots.push({ ...p, x, foot, h: u * scale, flip });
  const merchant = people.find(p => p.role === 'merchant');
  if (portrait) {
    if (merchant) place(merchant, cx - (ind ? 0.45 : 0.35) * u, front, 1);
    if (ind) place(ind, cx + 0.5 * u, front, 1, true);
    const xs = ind ? (comps.length >= 3 ? [-0.68, 0.02, 0.7] : [-0.62, 0.05])   // in the gaps between the two in front
      : (comps.length >= 3 ? [-0.85, 0.15, 0.75] : [0.15, 0.75]);
    comps.forEach((p, i) => place(p, cx + (xs[i] ?? (i - 1) * 0.6) * u, back, 0.8));
  } else {
    if (merchant) place(merchant, cx - 0.3 * u, front, 1);
    if (ind) place(ind, cx + 0.75 * u, front, 1, true);
    comps.forEach((p, i) => place(p, cx - (0.8 + 0.4 * i) * u, back, 0.86));
  }
  const board = portrait
    ? { x: cx + 0.8 * u, base: back - 0.3 * u, w: 0.42 * u, h: 0.62 * u }
    : { x: cx + 1.5 * u, base: back, w: 0.5 * u, h: 0.74 * u };
  const edge = Math.max(board.w * 0.75, 80);
  board.x = Math.max(edge, Math.min(We - edge, board.x));     // keep it (and its label) on screen
  return { portrait, u, cx, front, back, horizon, people: slots.sort((a, b) => a.foot - b.foot), board };
}

export class Stage {
  constructor(canvas, M) {
    this.cv = canvas; this.M = M; this.ready = {}; this.anchors = {};
    this.tmp = document.createElement('canvas'); this.tmp.width = 1024; this.tmp.height = 1536;
    this.bg = document.createElement('canvas'); this.bgKey = '';
    this.scroll = 0; this.walk = 0; this.last = performance.now();
    this.resize();
  }

  resize() {
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.bgKey = '';
  }

  /** Built character for drawing, or null while it loads. Keyed by recipe so changes show. */
  art(c) {
    const key = c.id + JSON.stringify(recipeOf(c));
    if (!(key in this.ready)) { this.ready[key] = null; characterArt(this.M, c).then(ch => { this.ready[key] = ch; }); }
    return this.ready[key];
  }

  // ---- town ----------------------------------------------------------------------------------
  drawTown(now, { townId, town, people, hour, insets }) {
    this.resize();
    const { W, H } = this, g = this.cv.getContext('2d');
    const L = townLayout(W, H, people, insets);
    const key = [townId, W, H, this.dpr, insets.bottom, insets.right].join('|');
    if (key !== this.bgKey) { this.paintTown(L, town); this.bgKey = key; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const t = now / 1000, anchors = {};
    L.people.forEach((p, i) => {
      const c = p.c, ch = this.art(c);
      anchors[c.id] = { x: p.x, foot: p.foot, h: p.h, top: p.foot - p.h * 0.98, role: p.role };
      if (!ch) return;
      const s = p.h / 1470, breathe = 1 + 0.006 * Math.sin(t * 1.7 + i * 1.3);
      g.save();
      g.translate(p.x, p.foot);
      if (p.flip) g.scale(-1, 1);
      g.fillStyle = 'rgba(40,30,20,.18)';
      g.beginPath(); g.ellipse(0, 0, p.h * 0.17, p.h * 0.03, 0, 0, Math.PI * 2); g.fill();   // soft ground shadow
      g.scale(1, breathe);
      g.drawImage(ch.still, -512 * s, -this.M.floor_y * s, 1024 * s, 1536 * s);
      g.restore();
    });
    const b = L.board;
    anchors.board = { x: b.x, foot: b.base, h: b.h, top: b.base - b.h, w: b.w, role: 'board' };
    this.anchors = anchors;
    const dk = darkness(hour) * 0.7;
    if (dk > 0) { g.fillStyle = `rgba(16,20,48,${dk})`; g.fillRect(0, 0, W, H); }
    return L;
  }

  paintTown(L, town) {
    const { W, H, dpr } = this, a = town.art, { u, cx, horizon, back } = L;
    this.bg.width = this.cv.width; this.bg.height = this.cv.height;
    const g = this.bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, a.sky[0]); sky.addColorStop(1, a.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
    g.fillStyle = 'rgba(255,255,255,.75)';                                   // a few clouds
    for (let k = 0; k < 5; k++) {
      const x = hash(k + 40) * W, y = horizon * (0.12 + hash(k + 50) * 0.35), r = u * (0.08 + hash(k + 60) * 0.06);
      for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x + (j - 1) * r * 1.1, y + (j === 1 ? -r * 0.4 : 0), r, 0, Math.PI * 2); g.fill(); }
    }
    for (const [col, lift, amp] of [[a.hills[0], 0.55, 0.12], [a.hills[1], 0.3, 0.08]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, horizon);
      for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, horizon - u * lift - Math.sin(x / (u * 0.9) + lift * 9) * u * amp);
      g.lineTo(W, horizon); g.closePath(); g.fill();
    }
    // landmark behind the buildings
    if (a.landmark === 'oak') {
      g.fillStyle = '#6b4a2f'; g.fillRect(cx - u * 0.07, horizon - u * 0.75, u * 0.14, u * 0.8);
      for (const [dx, dy, r, c] of [[0, -0.95, 0.42, '#5f8a3e'], [-0.38, -0.78, 0.3, '#6c9847'], [0.4, -0.8, 0.32, '#557f37'], [0, -1.25, 0.3, '#6c9847']]) {
        g.fillStyle = c; g.beginPath(); g.arc(cx + dx * u, horizon + dy * u, r * u, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = '#b5ada0'; g.strokeStyle = '#4a3b2c'; g.lineWidth = 2;
      g.fillRect(cx - u * 0.17, horizon - u * 1.35, u * 0.34, u * 1.35); g.strokeRect(cx - u * 0.17, horizon - u * 1.35, u * 0.34, u * 1.35);
      for (let k = 0; k < 4; k++) { g.fillRect(cx - u * 0.19 + k * u * 0.11, horizon - u * 1.45, u * 0.07, u * 0.1); g.strokeRect(cx - u * 0.19 + k * u * 0.11, horizon - u * 1.45, u * 0.07, u * 0.1); }
      g.fillStyle = '#3e3a36'; g.fillRect(cx - u * 0.04, horizon - u * 1.1, u * 0.08, u * 0.14);
    }
    // a row of houses along the back of the square, leaving the landmark visible
    let x = -u * 0.3, k = 0;
    while (x < W + u * 0.3) {
      const w = u * (0.42 + hash(k) * 0.3), h = u * (0.48 + hash(k + 7) * 0.32) * (L.portrait ? 1.6 : 1);
      if (x + w > cx - u * 0.55 && x < cx + u * 0.55) { x = cx + u * 0.55; k++; continue; }
      const base = horizon + u * 0.04, roof = a.roofs[k % a.roofs.length];
      g.fillStyle = a.walls; g.strokeStyle = '#4a3b2c'; g.lineWidth = Math.max(1.5, u * 0.008);
      g.fillRect(x, base - h, w, h); g.strokeRect(x, base - h, w, h);
      g.fillStyle = roof; g.beginPath();
      g.moveTo(x - u * 0.04, base - h); g.lineTo(x + w / 2, base - h - u * (0.2 + hash(k + 3) * 0.1)); g.lineTo(x + w + u * 0.04, base - h);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#5b4330'; g.fillRect(x + w / 2 - u * 0.045, base - u * 0.16, u * 0.09, u * 0.16);
      g.fillStyle = 'rgba(243,213,138,.85)';
      g.fillRect(x + w * 0.15, base - h + u * 0.1, u * 0.07, u * 0.07); g.fillRect(x + w * 0.7, base - h + u * 0.1, u * 0.07, u * 0.07);
      x += w + u * (0.04 + hash(k + 11) * 0.06); k++;
    }
    // the square
    g.fillStyle = a.ground; g.fillRect(0, horizon + u * 0.03, W, H);
    g.strokeStyle = 'rgba(80,60,40,.12)'; g.lineWidth = 1;
    for (let y = horizon + u * 0.08, step = u * 0.05; y < H; y += step, step *= 1.18) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    // props: a well or fountain on one side, a market stall on the other
    const px = L.portrait ? cx - 0.95 * u : cx - 2.1 * u, py = L.portrait ? back - 0.32 * u : back;
    if (a.landmark === 'oak') {
      g.fillStyle = '#9c9488'; g.fillRect(px - u * 0.16, py - u * 0.2, u * 0.32, u * 0.2);
      g.fillStyle = '#6b4a2f'; g.fillRect(px - u * 0.15, py - u * 0.5, u * 0.03, u * 0.3); g.fillRect(px + u * 0.12, py - u * 0.5, u * 0.03, u * 0.3);
      g.fillStyle = a.roofs[0]; g.beginPath(); g.moveTo(px - u * 0.22, py - u * 0.48); g.lineTo(px, py - u * 0.62); g.lineTo(px + u * 0.22, py - u * 0.48); g.fill();
    } else {
      g.fillStyle = '#a59d90'; g.beginPath(); g.ellipse(px, py - u * 0.06, u * 0.26, u * 0.07, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8fb6c9'; g.beginPath(); g.ellipse(px, py - u * 0.08, u * 0.21, u * 0.045, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a59d90'; g.fillRect(px - u * 0.03, py - u * 0.32, u * 0.06, u * 0.25);
    }
    if (!L.portrait) {
      const sx = cx + 2.25 * u, sy = back;
      g.fillStyle = '#7a5134'; g.fillRect(sx - u * 0.3, sy - u * 0.45, u * 0.03, u * 0.45); g.fillRect(sx + u * 0.27, sy - u * 0.45, u * 0.03, u * 0.45);
      g.fillStyle = '#c9a66b'; g.fillRect(sx - u * 0.3, sy - u * 0.2, u * 0.6, u * 0.12);
      for (let s = 0; s < 6; s++) { g.fillStyle = s % 2 ? '#efe4c8' : a.roofs[2]; g.fillRect(sx - u * 0.33 + s * u * 0.11, sy - u * 0.58, u * 0.11, u * 0.14); }
    }
    // the noticeboard
    const b = L.board;
    g.fillStyle = '#6b4a2f';
    g.fillRect(b.x - b.w * 0.42, b.base - b.h, b.w * 0.08, b.h); g.fillRect(b.x + b.w * 0.34, b.base - b.h, b.w * 0.08, b.h);
    g.fillStyle = '#9a6b42'; g.strokeStyle = '#4a3b2c'; g.lineWidth = Math.max(1.5, u * 0.008);
    g.fillRect(b.x - b.w / 2, b.base - b.h, b.w, b.h * 0.6); g.strokeRect(b.x - b.w / 2, b.base - b.h, b.w, b.h * 0.6);
    for (const [dx, dy, r] of [[-0.3, 0.08, -0.06], [0.05, 0.1, 0.05], [-0.12, 0.3, 0.03], [0.2, 0.28, -0.04]]) {
      g.save(); g.translate(b.x + dx * b.w, b.base - b.h + dy * b.h); g.rotate(r);
      g.fillStyle = '#f3ead2'; g.fillRect(0, 0, b.w * 0.24, b.h * 0.2); g.fillStyle = '#b5523a'; g.fillRect(b.w * 0.1, -2, 4, 4); g.restore();
    }
  }

  // ---- road ----------------------------------------------------------------------------------
  drawTravel(now, { crew, moving, hour, insets }) {
    this.resize();
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const { W, H } = this, g = this.cv.getContext('2d'), M = this.M;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const We = W - (insets.right || 0), portrait = We < H * 0.9;
    // portrait: a closer shot centred on the walkers (the horse may leave the frame), with road below
    const charH = portrait ? Math.min(We * 0.44, H * 0.3) : Math.min(H * 0.42, We * 0.25);
    const u = charH * 2, foot = Math.min(H - insets.bottom - charH * 0.1, portrait ? H * 0.68 : H), top = foot - 0.95 * u;
    const Y = f => top + f * u;                          // positions as fractions of a scene u tall
    const scale = charH / 1470;
    const built = crew.map(c => ({ c, ch: this.art(c) }));
    const lead = built.find(m => m.ch);
    const speed = lead ? groundSpeed(resolveProfile(M.anim, lead.c.outfit), M.anim.templates.m.pivots) * scale : u * 0.25;
    if (moving) { this.scroll += speed * dt; this.walk += dt; }
    const sc = this.scroll;

    g.fillStyle = skyAt(hour); g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,140,160,.45)'; g.beginPath(); g.moveTo(0, H);   // distant ridge
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = x + sc * 0.03;
      g.lineTo(x, Y(0.32) - Math.abs(Math.sin(wx / (u * 0.6))) * u * 0.12 - Math.sin(wx / (u * 0.21)) * u * 0.025);
    }
    g.lineTo(W, H); g.fill();
    g.fillStyle = '#8fae8a'; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = x + sc * 0.1;
      g.lineTo(x, Y(0.5) - Math.sin(wx / (u * 0.35)) * u * 0.05 - Math.sin(wx / (u * 0.13)) * u * 0.02);
    }
    g.lineTo(W, H); g.fill();
    const tile = u * 0.45, off = sc * 0.45, first = Math.floor(off / tile) - 1;
    g.fillStyle = '#86a964'; g.fillRect(0, Y(0.58), W, H);
    for (let k = first; k < first + W / tile + 3; k++) {
      const x = k * tile - off + hash(k) * tile * 0.6, s = u * (0.06 + hash(k + 9) * 0.05), y = Y(0.62);
      g.fillStyle = '#6b4a2f'; g.fillRect(x - s * 0.12, y - s * 1.2, s * 0.24, s * 1.2);
      g.fillStyle = hash(k + 3) > 0.5 ? '#5b8a3c' : '#6f9a4a';
      g.beginPath(); g.arc(x, y - s * 1.5, s * 0.75, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#c9b48a'; g.fillRect(0, Y(0.72), W, H);
    g.fillStyle = '#b39d72';
    const dash = u * 0.35;
    for (let x = -(sc % dash); x < W; x += dash) g.fillRect(x, Y(0.84), dash * 0.35, u * 0.012);
    g.fillStyle = '#7f9f5a';
    for (let x = -(sc % (dash * 0.7)); x < W; x += dash * 0.7) g.fillRect(x, Y(0.72), u * 0.02, u * 0.015);

    const spacing = u * (portrait ? 0.27 : 0.3);
    const cx = portrait ? We / 2 + (built.length - 1) * spacing / 2 - u * 0.42   // walkers centred
      : We * 0.5 - u * 0.07;                                                    // whole group (about cx - 0.63u .. cx + 0.76u) centred
    g.save(); g.translate(0, top); this.drawWagon(g, cx, 0.8 * u, u, sc); g.restore();

    const front = cx + u * 0.42, anchors = {};
    built.forEach((m, i) => {
      const x = front - i * spacing;
      anchors[m.c.id] = { x, foot, h: charH, top: foot - charH * 0.98, role: 'walker' };
      if (!m.ch) return;
      const p = resolveProfile(M.anim, m.c.outfit), pivots = M.anim.templates[m.ch.template].pivots;
      const ph = (this.walk / p.period + i * 0.29) % 1;
      const tg = this.tmp.getContext('2d'); tg.clearRect(0, 0, 1024, 1536);
      drawCharacter(tg, m.ch, pivots, pose(p, ph, moving ? 1 : 0));
      g.drawImage(this.tmp, x - 512 * scale, foot - M.floor_y * scale, 1024 * scale, 1536 * scale);
    });
    this.anchors = anchors;
    const dk = darkness(hour);
    if (dk > 0) { g.fillStyle = `rgba(16,20,48,${dk})`; g.fillRect(0, 0, W, H); }
  }

  drawWagon(g, cx, groundY, H, sc) {
    const L = H * 0.8, r = H * 0.085, bedY = groundY - r * 1.6, bedH = H * 0.1;
    const x0 = cx - L * 0.55;
    const hx = x0 + L + H * 0.14, hy = groundY - H * 0.17, legPh = sc / (H * 0.07);
    g.strokeStyle = '#3b2a1e'; g.lineWidth = Math.max(2, H * 0.006);
    g.beginPath(); g.moveTo(x0 + L, bedY + bedH * 0.4); g.lineTo(hx - H * 0.08, hy); g.stroke();   // shaft
    g.fillStyle = '#7a5134';
    for (const [lx, ph] of [[-0.1, 0], [-0.07, Math.PI], [0.07, Math.PI], [0.1, 0]]) {
      g.save(); g.translate(hx + lx * H, hy + H * 0.02); g.rotate(Math.sin(legPh + ph) * 0.3);
      g.fillRect(-H * 0.014, 0, H * 0.028, H * 0.15); g.fillStyle = '#3b2a1e';
      g.fillRect(-H * 0.016, H * 0.135, H * 0.032, H * 0.02); g.fillStyle = '#7a5134'; g.restore();   // hoof
    }
    g.beginPath(); g.ellipse(hx, hy, H * 0.14, H * 0.06, 0, 0, Math.PI * 2); g.fill();               // barrel
    g.beginPath(); g.moveTo(hx + H * 0.07, hy - H * 0.04); g.lineTo(hx + H * 0.14, hy - H * 0.12);   // thick neck
    g.lineTo(hx + H * 0.19, hy - H * 0.1); g.lineTo(hx + H * 0.15, hy + H * 0.02); g.fill();
    g.beginPath(); g.ellipse(hx + H * 0.2, hy - H * 0.085, H * 0.06, H * 0.03, 0.75, 0, Math.PI * 2); g.fill();   // head, nose down
    g.fillStyle = '#3b2a1e';
    g.beginPath(); g.moveTo(hx + H * 0.065, hy - H * 0.045); g.lineTo(hx + H * 0.135, hy - H * 0.13);   // mane
    g.lineTo(hx + H * 0.155, hy - H * 0.12); g.lineTo(hx + H * 0.095, hy - H * 0.03); g.fill();
    g.beginPath(); g.moveTo(hx - H * 0.13, hy - H * 0.02); g.quadraticCurveTo(hx - H * 0.19, hy + H * 0.03, hx - H * 0.17, hy + H * 0.1);
    g.lineTo(hx - H * 0.14, hy + H * 0.1); g.quadraticCurveTo(hx - H * 0.15, hy + H * 0.03, hx - H * 0.12, hy); g.fill();   // tail
    g.fillStyle = '#efe4c8'; g.strokeStyle = '#4a3b2c'; g.lineWidth = Math.max(2, H * 0.006);
    g.beginPath(); g.moveTo(x0 + L * 0.05, bedY);
    g.bezierCurveTo(x0 + L * 0.05, bedY - H * 0.3, x0 + L * 0.95, bedY - H * 0.3, x0 + L * 0.95, bedY);
    g.closePath(); g.fill(); g.stroke();
    for (const f of [0.3, 0.5, 0.7]) { g.beginPath(); g.moveTo(x0 + L * f, bedY); g.lineTo(x0 + L * f, bedY - H * 0.225); g.stroke(); }
    g.fillStyle = '#8b5a36'; g.fillRect(x0, bedY, L, bedH); g.strokeRect(x0, bedY, L, bedH);
    for (const wx of [x0 + L * 0.2, x0 + L * 0.8]) {
      g.save(); g.translate(wx, groundY - r); g.rotate(sc / r);
      g.fillStyle = '#5c3d26'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#d8c39a';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k * Math.PI / 3) * r * 0.85, Math.sin(k * Math.PI / 3) * r * 0.85); g.stroke(); }
      g.restore(); g.strokeStyle = '#4a3b2c';
    }
  }
}

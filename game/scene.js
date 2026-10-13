// Placeholder environments: a town illustration (SVG) and the travel scene (canvas).
// Characters are the real walking characters from animation/; wagon, horse and scenery are
// simple shapes meant to be swapped for painted art later.
import { pose, resolveProfile, groundSpeed } from '../animation/anim.js';
import { drawCharacter } from '../animation/charlib.js';
import { characterArt } from './portraits.js';

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- town illustration ------------------------------------------------------------------------
export function townArt(town, id) {
  const a = town.art, seed = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  let houses = '';
  for (let i = 0; i < 9; i++) {
    const w = 60 + hash(seed + i) * 45, h = 50 + hash(seed + i * 3) * 45, x = 20 + i * 97 + hash(seed + i * 7) * 20;
    if (x > 360 && x < 540) continue;                                // leave room for the landmark
    const base = 250, roof = a.roofs[i % a.roofs.length];
    houses += `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${a.walls}" stroke="#4a3b2c" stroke-width="2"/>`
      + `<polygon points="${x - 8},${base - h} ${x + w / 2},${base - h - 34 - hash(seed + i * 5) * 16} ${x + w + 8},${base - h}" fill="${roof}" stroke="#4a3b2c" stroke-width="2"/>`
      + `<rect x="${x + w / 2 - 9}" y="${base - 26}" width="18" height="26" fill="#5b4330"/>`
      + `<rect x="${x + 10}" y="${base - h + 14}" width="14" height="12" fill="#f3d58a" opacity=".8"/>`;
  }
  const landmark = a.landmark === 'oak'
    ? `<rect x="438" y="140" width="26" height="110" fill="#6b4a2f"/>
       <circle cx="452" cy="120" r="62" fill="#5f8a3e"/><circle cx="408" cy="140" r="40" fill="#6c9847"/>
       <circle cx="498" cy="138" r="44" fill="#557f37"/><circle cx="452" cy="80" r="40" fill="#6c9847"/>`
    : `<rect x="300" y="200" width="300" height="50" fill="#a59d90" stroke="#4a3b2c" stroke-width="2"/>
       <rect x="418" y="70" width="66" height="180" fill="#b5ada0" stroke="#4a3b2c" stroke-width="2"/>
       ${[0, 1, 2, 3].map(k => `<rect x="${414 + k * 20}" y="58" width="12" height="14" fill="#b5ada0" stroke="#4a3b2c" stroke-width="2"/>`).join('')}
       <rect x="440" y="110" width="20" height="28" fill="#3e3a36"/>`;
  return `<svg viewBox="0 0 900 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${town.name}">
    <defs><linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.sky[0]}"/><stop offset="1" stop-color="${a.sky[1]}"/></linearGradient></defs>
    <rect width="900" height="300" fill="url(#sky-${id})"/>
    <path d="M0 190 Q150 120 300 170 T600 150 T900 160 V300 H0Z" fill="${a.hills[0]}"/>
    <path d="M0 220 Q200 170 420 210 T900 200 V300 H0Z" fill="${a.hills[1]}"/>
    ${landmark}${houses}
    <rect y="250" width="900" height="50" fill="${a.ground}"/>
  </svg>`;
}

// ---- travel scene -----------------------------------------------------------------------------
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

export class TravelScene {
  constructor(canvas, M) {
    this.cv = canvas; this.M = M; this.scroll = 0; this.walk = 0; this.last = performance.now();
    this.crew = []; this.tmp = document.createElement('canvas'); this.tmp.width = 1024; this.tmp.height = 1536;
    this.resize();
  }

  /** chars: merchant first, then companions. Built asynchronously; drawn once ready. */
  setCrew(chars) {
    const ids = chars.map(c => c.id).join();
    if (ids === this.crewIds) return;
    this.crewIds = ids;
    this.crew = chars.map((c, i) => ({ c, ch: null, off: i * 0.29 }));
    for (const m of this.crew) characterArt(this.M, m.c).then(ch => { m.ch = ch; });
  }

  resize() {
    const w = this.cv.clientWidth || 800, h = Math.min(Math.round(w * (w < 560 ? 0.66 : 0.5)), 420);   // taller on phones
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.style.height = h + 'px';
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.W = w; this.H = h; this.dpr = dpr;
  }

  draw(now, moving, hour) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.cv.clientWidth && Math.abs(this.cv.clientWidth - this.W) > 1) this.resize();
    const { W, H } = this, g = this.cv.getContext('2d'), M = this.M;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const charH = H * 0.5, scale = charH / 1470;
    const lead = this.crew.find(m => m.ch);
    const prof = lead ? resolveProfile(M.anim, lead.c.outfit) : null;
    const speed = prof ? groundSpeed(prof, M.anim.templates.m.pivots) * scale : H * 0.25;
    if (moving) { this.scroll += speed * dt; this.walk += dt; }
    const sc = this.scroll;

    // sky and far hills
    g.fillStyle = skyAt(hour); g.fillRect(0, 0, W, H);
    g.fillStyle = '#8fae8a';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = x + sc * 0.1;
      g.lineTo(x, H * 0.5 - Math.sin(wx / 140) * H * 0.05 - Math.sin(wx / 53) * H * 0.02);
    }
    g.lineTo(W, H); g.fill();
    // mid trees
    const tile = H * 0.45, off = sc * 0.45, first = Math.floor(off / tile) - 1;
    g.fillStyle = '#86a964'; g.fillRect(0, H * 0.58, W, H);
    for (let k = first; k < first + W / tile + 3; k++) {
      const x = k * tile - off + hash(k) * tile * 0.6, s = H * (0.06 + hash(k + 9) * 0.05), y = H * 0.62;
      g.fillStyle = '#6b4a2f'; g.fillRect(x - s * 0.12, y - s * 1.2, s * 0.24, s * 1.2);
      g.fillStyle = hash(k + 3) > 0.5 ? '#5b8a3c' : '#6f9a4a';
      g.beginPath(); g.arc(x, y - s * 1.5, s * 0.75, 0, Math.PI * 2); g.fill();
    }
    // road
    g.fillStyle = '#c9b48a'; g.fillRect(0, H * 0.72, W, H * 0.28);
    g.fillStyle = '#b39d72';
    const dash = H * 0.35;
    for (let x = -(sc % dash); x < W; x += dash) g.fillRect(x, H * 0.84, dash * 0.35, H * 0.012);
    g.fillStyle = '#7f9f5a';
    for (let x = -(sc % (dash * 0.7)); x < W; x += dash * 0.7) g.fillRect(x, H * 0.72, H * 0.02, H * 0.015);

    const cx = W * 0.5 - H * 0.07;                                   // group spans about cx - 0.63H .. cx + 0.76H
    this.drawWagon(g, cx, H * 0.8, H, sc);

    // walkers on the near lane, merchant at the front
    const footY = H * 0.95, spacing = H * 0.3, front = cx + H * 0.42;
    this.crew.forEach((m, i) => {
      if (!m.ch) return;
      const p = resolveProfile(M.anim, m.c.outfit), pivots = M.anim.templates[m.ch.template].pivots;
      const ph = moving || this.walk ? (this.walk / p.period + m.off) % 1 : 0;
      const tg = this.tmp.getContext('2d'); tg.clearRect(0, 0, 1024, 1536);
      drawCharacter(tg, m.ch, pivots, pose(p, ph, moving ? 1 : 0));
      const x = front - i * spacing;
      g.drawImage(this.tmp, x - 512 * scale, footY - M.floor_y * scale, 1024 * scale, 1536 * scale);
    });

    const dk = darkness(hour);
    if (dk > 0) { g.fillStyle = `rgba(16,20,48,${dk})`; g.fillRect(0, 0, W, H); }
  }

  drawWagon(g, cx, groundY, H, sc) {
    const L = H * 0.8, r = H * 0.085, bedY = groundY - r * 1.6, bedH = H * 0.1;
    const x0 = cx - L * 0.55;
    // horse
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
    // wagon cover and bed
    g.fillStyle = '#efe4c8'; g.strokeStyle = '#4a3b2c'; g.lineWidth = Math.max(2, H * 0.006);
    g.beginPath(); g.moveTo(x0 + L * 0.05, bedY);
    g.bezierCurveTo(x0 + L * 0.05, bedY - H * 0.3, x0 + L * 0.95, bedY - H * 0.3, x0 + L * 0.95, bedY);
    g.closePath(); g.fill(); g.stroke();
    for (const f of [0.3, 0.5, 0.7]) { g.beginPath(); g.moveTo(x0 + L * f, bedY); g.lineTo(x0 + L * f, bedY - H * 0.225); g.stroke(); }
    g.fillStyle = '#8b5a36'; g.fillRect(x0, bedY, L, bedH); g.strokeRect(x0, bedY, L, bedH);
    // wheels
    for (const wx of [x0 + L * 0.2, x0 + L * 0.8]) {
      g.save(); g.translate(wx, groundY - r); g.rotate(sc / r);
      g.fillStyle = '#5c3d26'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#d8c39a';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k * Math.PI / 3) * r * 0.85, Math.sin(k * Math.PI / 3) * r * 0.85); g.stroke(); }
      g.restore(); g.strokeStyle = '#4a3b2c';
    }
  }
}

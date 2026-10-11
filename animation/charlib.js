// Character assembly for animation: same parts and colour maths as the character
// preview, but each layer is recoloured ONCE into a cached canvas, then posed per frame
// with plain drawImage transforms (no per-frame image processing).
import { DEFAULT_ORDER, layerTransforms, applyChain } from './anim.js';

const BASE = '../preview-character/';
const img = {};
export function loadImage(src) {
  if (img[src]) return Promise.resolve(img[src]);
  return new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(img[src] = i); i.onerror = rej; i.src = BASE + src;
  });
}
export async function loadManifest() {
  const M = await (await fetch(BASE + 'manifest.json', { cache: 'no-cache' })).json();
  const parts = [...M.faces.flatMap(f => [f.part, f.brows, f.scar]),
    ...M.bodies.flatMap(b => [b.part, b.back, ...Object.values((b.anim && b.anim.pieces) || {}),
      ...Object.values(b.rig || {})]),
    ...Object.values(M.ears).map(e => e.part), ...M.hairs.flatMap(h => [h.part, h.ties]), ...(M.beards || []).map(b => b.part)]
    .filter(Boolean);
  await Promise.all(parts.flatMap(p => [p.file, p.skin_mask]).filter(Boolean)
    .map(f => loadImage(f + '?v=' + M.version)));
  M._img = f => img[f + '?v=' + M.version];
  return M;
}

// ---- colour (identical maths to preview-character/index.html) -----------------
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gam = c => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const WP = [0.95047, 1, 1.08883];
const fL = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
const fI = t => t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;
function toLab(r, g, b) {
  r = lin(r); g = lin(g); b = lin(b);
  const x = fL((0.4124 * r + 0.3576 * g + 0.1805 * b) / WP[0]), y = fL(0.2126 * r + 0.7152 * g + 0.0722 * b),
        z = fL((0.0193 * r + 0.1192 * g + 0.9505 * b) / WP[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function fromLab(L, a, bb) {
  const fy = (L + 16) / 116, X = fI(fy + a / 500) * WP[0], Y = fI(fy), Z = fI(fy - bb / 200) * WP[2];
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.2040 * Y + 1.0570 * Z].map(v => gam(Math.max(0, Math.min(1, v))));
}
const canvasOf = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0); return c; };
const cache = {};
function skinned(M, part, skinId) {
  const key = part.file + '|' + skinId;
  if (cache[key]) return cache[key];
  const src = M._img(part.file);
  if (!part.skin_mask || !skinId) return cache[key] = src;
  const c = canvasOf(src), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  const m = canvasOf(M._img(part.skin_mask)).getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const [kL, ka, kb] = part.key_lab, [tL, ta, tb] = M.skins[skinId].lab;
  const keep = 0.35 * Math.min(1, Math.max(0.25, tL / kL) ** 1.5);
  for (let i = 0; i < p.length; i += 4) {
    if (!m[i] || !p[i + 3]) continue;
    const [L, a, b] = toLab(p[i], p[i + 1], p[i + 2]);
    const [r, gg, bb] = fromLab(tL + (L - kL), ta + (a - ka) * keep, tb + (b - kb) * keep);
    p[i] = r; p[i + 1] = gg; p[i + 2] = bb;
  }
  g.putImageData(d, 0, 0);
  return cache[key] = c;
}
function gradient(M, file, lum, colour) {
  const key = file + '|' + colour;
  if (cache[key]) return cache[key];
  const c = canvasOf(M._img(file)), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data, ramp = M.hair_colours[colour];
  const [lo, hi] = lum, span = Math.max(hi - lo, 1), n = ramp.length - 1;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const t = Math.min(1, Math.max(0, ((p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114) - lo) / span)) * n;
    const k = Math.min(n - 1, Math.floor(t)), f = t - k, a = ramp[k], b = ramp[k + 1];
    p[i] = a[0] + (b[0] - a[0]) * f; p[i + 1] = a[1] + (b[1] - a[1]) * f; p[i + 2] = a[2] + (b[2] - a[2]) * f;
  }
  g.putImageData(d, 0, 0);
  return cache[key] = c;
}

/**
 * Build the layer set for a recipe. Each layer: {name, items:[{src,x,y,box}]}.
 * Head layers sit at their canvas positions; body layers come from anim.pieces.
 * Returns null pieces gracefully if an outfit has no animation metadata.
 */
export function buildCharacter(M, r) {
  const byId = (l, id) => l.find(x => x.id === id);
  const face = byId(M.faces, r.face), body = byId(M.bodies, r.outfit), race = M.races[r.race] || M.races.human;
  if (!face || !body) throw new Error('recipe references unknown face/outfit: ' + JSON.stringify(r));
  const skin = face.lime ? r.skin : null;
  const L = {};
  const add = (name, part, src, dx = 0, dy = 0) => {
    (L[name] = L[name] || []).push({ src, x: part.x + dx, y: part.y + dy, w: src.width, h: src.height, file: part.file });
  };
  const fitd = ref => [face.skull[1] - ref[1], face.skull[0] - ref[0]];
  if (body.back) add('neck', body.back, skinned(M, body.back, r.skin));
  add('head', face.part, skinned(M, face.part, skin));
  if (face.scar && r.scar) add('head', face.scar, M._img(face.scar.file));
  if (face.brows) add('head', face.brows, gradient(M, face.brows.file, face.brows.lum, r.hairCol));
  const hair = byId(M.hairs, r.hair);
  if (hair) add('hair', hair.part, gradient(M, hair.part.file, hair.lum, r.hairCol), ...fitd(hair.ref_skull));
  if (hair && hair.ties) add('hair', hair.ties, M._img(hair.ties.file), ...fitd(hair.ref_skull));   // ties keep their own colour
  const beard = face.template === 'm' && byId(M.beards || [], r.beard);
  if (beard) add('beard', beard.part, gradient(M, beard.part.file, beard.lum, r.hairCol), ...fitd(beard.ref_skull));
  if (race.ears && !face.races) { const e = M.ears[race.ears]; add('ears', e.part, skinned(M, e.part, skin), ...fitd(e.ref_skull)); }
  const pieces = body.anim && body.anim.pieces;
  if (pieces) for (const [k, p] of Object.entries(pieces)) add(k, p, skinned(M, p, r.skin));
  else add('torso', body.part, skinned(M, body.part, r.skin));   // no rig: whole outfit bobs
  // legacy straight-cut rig (for the A/B comparison only)
  const legacy = {};
  for (const [k, p] of Object.entries(body.rig || {})) legacy[k] = [{ src: skinned(M, p, r.skin), x: p.x, y: p.y, w: 0, h: 0 }];
  // standing reference: exactly what the character preview draws
  const still = document.createElement('canvas'); still.width = 1024; still.height = 1536;
  const sg = still.getContext('2d');
  const draw = (part, src, dx = 0, dy = 0) => sg.drawImage(src, part.x + dx, part.y + dy);
  if (body.back) draw(body.back, skinned(M, body.back, r.skin));
  for (const it of L.head) sg.drawImage(it.src, it.x, it.y);
  draw(body.part, skinned(M, body.part, r.skin));
  for (const n of ['hair', 'beard', 'ears']) for (const it of L[n] || []) sg.drawImage(it.src, it.x, it.y);
  return { recipe: { ...r }, face, body, layers: L, legacy, still, anchors: (body.anim && body.anim.anchors) || {},
    template: body.template, rigged: !!pieces, pivots: (body.anim && body.anim.pivots) || {} };
}

/** Draw one frame. opts: {order, hidden:Set, legacy, debug:{boxes,pivots,tint}}. Returns drawn transforms. */
export function drawCharacter(g, ch, pivots, ps, opts = {}) {
  pivots = { ...pivots, ...(ch.pivots || {}) };
  const T = layerTransforms(pivots, ps);
  const order = opts.order || DEFAULT_ORDER;
  const hidden = opts.hidden || new Set();
  const src = opts.legacy ? { ...ch.layers, ...mapLegacy(ch.legacy) } : ch.layers;
  if (opts.legacy) for (const k of ['skirt', 'cap_n', 'cap_f']) delete src[k];
  for (const name of order) {
    if (hidden.has(name) || !src[name]) continue;
    g.save();
    for (const t of T[name] || []) {
      if (t.pivot) {
        g.translate(t.pivot[0], t.pivot[1]);
        if (t.angle) g.rotate(t.angle);
        if (t.sy && t.sy !== 1) g.scale(1, t.sy);
        g.translate(-t.pivot[0], -t.pivot[1]);
      }
      if (t.dx || t.dy) g.translate(t.dx || 0, t.dy || 0);
    }
    for (const it of src[name]) {
      g.drawImage(it.src, it.x, it.y);
      if (opts.debug && opts.debug.tint) {
        g.globalAlpha = 0.45; g.drawImage(tinted(it, opts.debug.colour(name)), it.x, it.y); g.globalAlpha = 1;
      }
      if (opts.debug && opts.debug.boxes && it.w) {
        g.strokeStyle = opts.debug.colour(name); g.lineWidth = 3; g.setLineDash([12, 8]);
        g.strokeRect(it.x, it.y, it.w, it.h); g.setLineDash([]);
        g.fillStyle = opts.debug.colour(name); g.font = '22px sans-serif'; g.fillText(name, it.x + 4, it.y + 22);
      }
    }
    g.restore();
  }
  return T;
}

const tintCache = new WeakMap();
function tinted(it, colour) {      // segmentation-mask view: piece silhouette in a flat colour
  let m = tintCache.get(it.src);
  if (!m) { m = {}; tintCache.set(it.src, m); }
  if (!m[colour]) {
    const c = document.createElement('canvas'); c.width = it.src.width; c.height = it.src.height;
    const g = c.getContext('2d'); g.drawImage(it.src, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
    m[colour] = c;
  }
  return m[colour];
}

function mapLegacy(rig) {
  const m = {};
  for (const [k, v] of Object.entries(rig)) m[k] = v;
  return m;
}

/** World-space joint anchors for a pose (only joints the rig actually has). */
export function anchorsFor(ch, pivots, ps) {
  pivots = { ...pivots, ...(ch.pivots || {}) };
  const T = layerTransforms(pivots, ps);
  const A = {
    neck: applyChain(pivots.neck, T.torso), waist: applyChain(pivots.waist, T.torso),
    shoulder_n: applyChain(pivots.shoulder_n, T.torso), shoulder_f: applyChain(pivots.shoulder_f, T.torso),
    hip_n: pivots.hip_n, hip_f: pivots.hip_f,
    knee_n: applyChain(pivots.knee_n, T.thigh_n), knee_f: applyChain(pivots.knee_f, T.thigh_f),
    ankle_n: applyChain(pivots.ankle_n, T.shin_n), ankle_f: applyChain(pivots.ankle_f, T.shin_f),
  };
  for (const k of ['wrist_n', 'grip_n']) if (ch.anchors[k]) A[k] = applyChain(ch.anchors[k], T.grip);
  for (const k of ['wrist_f', 'grip_f']) if (ch.anchors[k]) A[k] = applyChain(ch.anchors[k], T.farm_f);
  for (const s of ['n', 'f']) if (pivots['elbow_' + s]) A['elbow_' + s] = applyChain(pivots['elbow_' + s], T['arm_' + s]);
  return A;
}

// Walk animation core: pure, deterministic functions (no DOM). Used by the animation
// debugger and by tests. Pose is a function of (profile, phase 0..1, amplitude) only.

export const MODES = ['cutout', 'robe', 'subtle'];

// Back-to-front draw order. Layer names match manifest pieces (anim.pieces) plus head layers.
export const DEFAULT_ORDER = [
  'hips', 'fill_f', 'arm_f', 'farm_f', 'cap_f', 'thigh_f', 'shin_f', 'thigh_n', 'shin_n',
  'neck', 'head', 'skirt', 'torso', 'hair', 'beard', 'ears', 'arm_n', 'farm_n', 'cap_n', 'grip',
];

const FALLBACK = {
  label: 'Fallback (subtle)', mode: 'subtle', period: 0.9, bob: 6, head_bob: 1.5, lean: 0,
  leg_swing: 0, knee_bend: 0, arm_swing: 0, far_arm_swing: 0, skirt_sway: 0, squash: 0.012,
};

/** Profile for an outfit: explicit override > outfit default > global default > fallback. */
export function resolveProfile(anim, outfitId, overrideId) {
  const profiles = (anim && anim.profiles) || {};
  const id = (overrideId && profiles[overrideId] && overrideId)
    || (anim && anim.outfits && anim.outfits[outfitId] && anim.outfits[outfitId].profile)
    || (anim && anim.default_profile);
  const p = profiles[id];
  return p ? { id, ...FALLBACK, ...p } : { id: 'fallback', ...FALLBACK };
}

/** Pose at phase (0..1 of one stride cycle). amp scales all motion (1 = profile values). */
export function pose(profile, phase, amp = 1) {
  const p = { ...FALLBACK, ...profile };
  const a = 2 * Math.PI * (((phase % 1) + 1) % 1);
  const sw = Math.sin(a), cw = Math.cos(a);
  const bob = (Math.abs(cw) * 2 - 1) * p.bob * amp * 0.5;   // highest as legs pass (twice per cycle)
  const out = {
    bob,                                                     // px, + = down
    head_bob: Math.sin(2 * a + 0.6) * p.head_bob * amp,      // slight lag behind the body
    lean: p.lean * amp,
    thigh_n: -sw * p.leg_swing * amp,                       // - = forward (character faces right)
    thigh_f: sw * p.leg_swing * amp,
    shin_n: Math.max(0, cw) * p.knee_bend * amp,             // knee bends while the leg swings through
    shin_f: Math.max(0, -cw) * p.knee_bend * amp,
    arm_n: sw * p.arm_swing * amp,                          // arms oppose their legs
    arm_f: -sw * p.far_arm_swing * amp,
    elbow_n: -(0.5 + 0.5 * sw) * (p.elbow_bend || 0) * amp,   // forearm bends more on the forward swing
    elbow_f: -(0.5 - 0.5 * sw) * (p.elbow_bend || 0) * amp,
    skirt: -sw * p.skirt_sway * amp,
    squash: 1 - Math.abs(cw) * (p.squash || 0) * amp,        // subtle mode: tiny vertical breathing
    lift_n: 0, lift_f: 0,
  };
  if (p.mode === 'subtle') {                                  // no rotation: feet lift alternately
    out.lift_n = -Math.max(0, sw) * 10 * amp;
    out.lift_f = -Math.max(0, -sw) * 10 * amp;
  }
  return out;
}

/** Rotate point pt about pivot by angle (canvas coordinates, y down). */
export function rotateAbout(pt, pivot, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = pt[0] - pivot[0], dy = pt[1] - pivot[1];
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
}

/**
 * Per-layer transform chain for a pose: list of {pivot, angle, dx, dy, sy} applied in order.
 * Shared by drawing, anchor display and weapon attachment so they can never disagree.
 */
export function layerTransforms(P, ps) {
  const body = [{ dx: 0, dy: ps.bob }, { pivot: P.waist, angle: ps.lean, sy: ps.squash }];
  const head = [...body, { dx: 0, dy: ps.head_bob }];
  const elbow = s => (P['elbow_' + s] ? [{ pivot: P['elbow_' + s], angle: ps['elbow_' + s] || 0 }] : []);
  return {
    hips: [{ dx: 0, dy: ps.bob * 0.5 }],
    thigh_n: [{ pivot: P.hip_n, angle: ps.thigh_n }],
    shin_n: [{ pivot: P.hip_n, angle: ps.thigh_n }, { pivot: P.knee_n, angle: ps.shin_n, dy: ps.lift_n }],
    thigh_f: [{ pivot: P.hip_f, angle: ps.thigh_f }],
    shin_f: [{ pivot: P.hip_f, angle: ps.thigh_f }, { pivot: P.knee_f, angle: ps.shin_f, dy: ps.lift_f }],
    torso: body, neck: body, cap_n: body, cap_f: body, fill_f: body,
    skirt: [...body, { pivot: P.waist, angle: ps.skirt }],
    head, hair: head, beard: head, ears: head,
    arm_n: [...body, { pivot: P.shoulder_n, angle: ps.arm_n }],
    arm_f: [...body, { pivot: P.shoulder_f, angle: ps.arm_f }],
    farm_n: [...body, { pivot: P.shoulder_n, angle: ps.arm_n }, ...elbow('n')],
    farm_f: [...body, { pivot: P.shoulder_f, angle: ps.arm_f }, ...elbow('f')],
    grip: [...body, { pivot: P.shoulder_n, angle: ps.arm_n }, ...elbow('n')],
  };
}

/** Apply a transform chain to a point (for anchors / weapon grips). */
export function applyChain(pt, chain) {
  let q = pt;
  for (const t of chain || []) {
    if (t.pivot) {
      if (t.sy) q = [q[0], t.pivot[1] + (q[1] - t.pivot[1]) * t.sy];
      if (t.angle) q = rotateAbout(q, t.pivot, t.angle);
    }
    q = [q[0] + (t.dx || 0), q[1] + (t.dy || 0)];
  }
  return q;
}

/** Ground speed (px/s) that keeps the planted foot still, for caravan scrolling. */
export function groundSpeed(profile, pivots, amp = 1) {
  const p = { ...FALLBACK, ...profile };
  const leg = pivots.ankle_n[1] - pivots.hip_n[1];
  const stride = 2 * leg * Math.sin(p.leg_swing * amp);
  return p.leg_swing > 0 ? (2 * stride) / p.period : 0;   // two steps per cycle
}

/** Parse / serialise appearance recipes exactly like the character preview. */
export function parseRecipe(str) {
  const q = new URLSearchParams(String(str).replace(/^#/, ''));
  const none = v => (!v || v === 'none' ? '' : v);
  return {
    race: q.get('race') || 'human', face: q.get('face'), skin: q.get('skin'), outfit: q.get('outfit'),
    hair: none(q.get('hair')), beard: none(q.get('beard')), hairCol: q.get('hair_col') || 'brown',
    scar: q.get('scar') === '1',
  };
}

export function recipeString(r) {
  return `race=${r.race}&face=${r.face}&skin=${r.skin}&outfit=${r.outfit}` +
    `&hair=${r.hair || 'none'}&beard=${r.beard || 'none'}&hair_col=${r.hairCol}` + (r.scar ? '&scar=1' : '');
}

/** Seeded RNG (same as the preview) and random recipe within race kits + blocklists. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function randomRecipe(M, seed, template = 'm') {
  const rand = mulberry32(seed), pick = a => a[Math.floor(rand() * a.length)];
  const race = 'human', R = M.races[race];
  const face = pick(M.faces.filter(f => f.template === template && !f.races));
  const hairs = M.hairs.filter(h => h.fits.includes(face.template) && !(face.blocked_hair || []).includes(h.id));
  const beards = (M.beards || []).filter(b => !(face.blocked_beard || []).includes(b.id));
  const outfits = M.bodies.filter(b => b.template === face.template && b.anim);
  return {
    race, face: face.id, skin: pick(R.skins), outfit: pick(outfits).id,
    hair: rand() < 0.12 ? '' : pick(hairs).id,
    beard: template === 'm' && beards.length && rand() < 0.5 ? pick(beards).id : '',
    hairCol: pick(R.hair), scar: false,
  };
}

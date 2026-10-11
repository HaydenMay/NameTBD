// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  pose, resolveProfile, layerTransforms, applyChain, parseRecipe, recipeString,
  randomRecipe, groundSpeed, DEFAULT_ORDER,
} from '../animation/anim.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const M = JSON.parse(readFileSync(ROOT + 'preview-character/manifest.json', 'utf8'));

test('poses are deterministic and periodic', () => {
  for (const id of Object.keys(M.anim.profiles)) {
    const p = M.anim.profiles[id];
    for (const ph of [0, 0.1, 0.33, 0.5, 0.99]) {
      assert.deepEqual(pose(p, ph), pose(p, ph), id);
      const a = pose(p, ph), b = pose(p, ph + 1);
      for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${id} ${k} periodic`);
    }
  }
});

test('amplitude 0 is a still pose', () => {
  const ps = pose(M.anim.profiles.leather_walk, 0.37, 0);
  for (const k of ['thigh_n', 'thigh_f', 'shin_n', 'shin_f', 'arm_n', 'arm_f', 'skirt', 'bob', 'head_bob'])
    assert.equal(Math.abs(ps[k]), 0, k);
});

test('every rigged outfit resolves to a defined profile', () => {
  for (const b of M.bodies.filter(b => b.anim)) {
    const p = resolveProfile(M.anim, b.id);
    assert.equal(p.id, b.anim.profile, b.id);
    assert.ok(['cutout', 'robe', 'subtle'].includes(p.mode));
  }
});

test('missing animation metadata falls back gracefully', () => {
  assert.equal(resolveProfile(M.anim, 'no_such_outfit').id, M.anim.default_profile);
  assert.equal(resolveProfile(undefined, 'knight_m').id, 'fallback');
  assert.equal(resolveProfile({}, 'knight_m').mode, 'subtle');
  const ps = pose({}, 0.25);                                    // empty profile still yields numbers
  for (const v of Object.values(ps)) assert.ok(Number.isFinite(v));
  assert.equal(resolveProfile(M.anim, 'knight_m', 'bogus_override').id, 'knight_walk');
});

test('every animation piece file exists and the draw order covers it', () => {
  for (const b of M.bodies.filter(b => b.anim)) {
    for (const [name, p] of Object.entries(b.anim.pieces)) {
      assert.ok(existsSync(ROOT + 'preview-character/' + p.file), p.file);
      assert.ok(DEFAULT_ORDER.includes(name), `${name} missing from DEFAULT_ORDER`);
    }
  }
});

test('anchors follow their transform chains', () => {
  const P = M.anim.templates.m.pivots;
  const ps = pose(M.anim.profiles.leather_walk, 0.25);
  const T = layerTransforms(P, ps);
  const hip = applyChain(P.hip_n, T.thigh_n);
  assert.deepEqual(hip.map(Math.round), P.hip_n);              // pivot stays put
  const knee = applyChain(P.knee_n, T.thigh_n);
  assert.ok(knee[0] > P.knee_n[0], 'near knee moves forward at 25% phase');
  assert.ok(groundSpeed(M.anim.profiles.leather_walk, P) > 0);
  assert.equal(groundSpeed(M.anim.profiles.subtle_walk, P), 0);
});

test('recipes round-trip unchanged (existing preview format)', () => {
  const s = 'race=human&face=hobb&skin=deep&outfit=cleric_m&hair=m_curly&beard=none&hair_col=blond';
  assert.equal(recipeString(parseRecipe(s)), s);
  const r = parseRecipe('#race=human&face=aldric&skin=fair&outfit=knight_m&hair=m_short&hair_col=blond');
  assert.equal(r.beard, '');                                    // older recipes without beard still load
  assert.equal(r.face, 'aldric');
});

test('random recipes are seeded, valid and respect blocklists', () => {
  const ids = l => new Set(l.map(x => x.id));
  const faces = ids(M.faces), hairs = ids(M.hairs), beards = ids(M.beards), bodies = ids(M.bodies);
  for (let seed = 1; seed < 400; seed++) {
    const r = randomRecipe(M, seed);
    assert.deepEqual(r, randomRecipe(M, seed));
    assert.ok(faces.has(r.face) && bodies.has(r.outfit));
    assert.ok(!r.hair || hairs.has(r.hair));
    assert.ok(!r.beard || beards.has(r.beard));
    const f = M.faces.find(x => x.id === r.face);
    assert.ok(!(f.blocked_hair || []).includes(r.hair), `blocked hair ${r.face}/${r.hair}`);
    assert.ok(!(f.blocked_beard || []).includes(r.beard), `blocked beard ${r.face}/${r.beard}`);
    assert.ok(M.races.human.skins.includes(r.skin) && M.races.human.hair.includes(r.hairCol));
  }
});

test('pose functions never mutate profile or recipe objects', () => {
  const p = structuredClone(M.anim.profiles.knight_walk), before = JSON.stringify(p);
  pose(p, 0.4, 1.3); resolveProfile(M.anim, 'knight_m');
  assert.equal(JSON.stringify(p), before);
  const r = randomRecipe(M, 5), rb = JSON.stringify(r);
  recipeString(r); assert.equal(JSON.stringify(r), rb);
});

test('original source artwork is untouched', () => {
  const out = execSync('git status --porcelain -- art/incoming art/template art/parts', { cwd: ROOT }).toString();
  const modified = out.split('\n').filter(l => /^ ?M|^ ?D/.test(l));
  assert.deepEqual(modified, [], 'source art modified or deleted:\n' + modified.join('\n'));
});

test('random hair colour respects the skin-tone rules', () => {
  const rules = M.races.human.hair_by_skin;
  for (let seed = 1; seed < 400; seed++) {
    const r = randomRecipe(M, seed);
    assert.ok(rules[r.skin].map(([c]) => c).includes(r.hairCol), `${r.skin} got ${r.hairCol}`);
  }
});

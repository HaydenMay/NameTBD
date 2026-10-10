# Walk Animation: Technical Report

Live debugger: `/animation/` (dev only). Character preview links to it with the current recipe.

## Architecture (audit)
- **Renderer:** static pages, Canvas 2D. No framework, no WebGL.
- **Build:** `tools/build_preview.py` cuts source art into parts → `preview-character/assets/*.png` + `manifest.json`. Source art in `art/` is never modified.
- **Recolouring:** skin = Lab shift of lime-keyed pixels via per-part skin masks; hair/brows/beard = gradient map of blue-keyed parts. Done in the browser.
- **Old walk test** (preview "Walk test (WIP)" button): straight-line cuts at fixed pivots, recoloured every frame. Kept unchanged for comparison (`rig` in manifest, test "A").

## New system
| File | Role |
|---|---|
| `tools/anim_profiles.json` | Data: template pivots, per-outfit segmentation (hem, belt, default profile), motion profiles |
| `tools/anim_rig.py` | Segmentation into derived layers (`anim_<outfit>_<piece>.png`) |
| `animation/anim.js` | Pure, deterministic pose maths, transform chains, recipe parse/serialise, seeded random recipes |
| `animation/charlib.js` | Builds a character's layers once (recoloured + cached), draws any pose with plain transforms |
| `animation/index.html` | Debugger UI |
| `tests/anim.test.mjs` | `node --test tests/anim.test.mjs` |
| `tools/devserver.py` | Local server with `POST /__save` for capturing frames during visual testing |

**Segmentation (per outfit):**
- **Arms** are cut per row: at a transparent gap between arm and body if there is one, otherwise at the first painted outline, otherwise at the fallback column. Below the last gap row (fist touching the body) the cut column is held, so flaring robes stay on the body.
- **Torso** keeps everything above the outfit's hem, so tabards, robes and jerkin skirts never get sliced by the legs. Split at the belt into `torso` and `skirt` (skirt can sway).
- **Hidden areas** behind arms are approximated from the nearest non-outline body pixels. The near-arm fill is baked into the torso. The far-arm fill is a separate `fill_f` layer drawn *behind* the far arm, since in the painting the far arm is in front of the body edge.
- **Shoulder caps:** a feathered static copy of the shoulder drawn over each arm to hide its top edge.
- **Legs** below the hem split at the knee with 30 px overlap. A static `hips` underlay fills gaps. For long robes (hem below the knee) the thighs and underlay are dropped, since they'd only be copies of the robe peeking out.

**Profiles** (`anim_profiles.json`): `leather_walk` (cutout), `knight_walk` (restrained cutout), `cleric_walk` (robe: small leg swing, skirt sway), `subtle_walk` (no limb rotation; also the default for outfits without a rig). Outfit → profile is automatic; recipes are unchanged.

**Performance:** layers recoloured once per character; frames are only drawImage with transforms. 8 characters measured at 2.7 ms per frame.

## Findings
**Hand over clothing:** caused mainly by segmentation, not draw order.
1. Straight-line cuts dragged slices of robe/tunic with the arm and left hard edges.
2. There is no painted art behind the arms; swinging exposes holes.
3. The near fist overlaps the waist in the source painting itself.

Arm comparison (debugger panel, any phase): **A** legacy straight cut: slivers, broken legs. **B** both arms behind torso: far-arm fill covered the arm; near arm hidden behind body reads wrong. **C** outline cut, near in front, far behind: best. **D** C at 40% swing: fewest artifacts. Chosen: C with restrained arm swing in the profiles (0.07 to 0.11 rad).

**Cutout vs subtle:** at caravan scale the cutout walk reads as walking; the subtle walk reads as standing and bobbing. Chosen: cutout legs + restrained arms per outfit; subtle as the fallback.

## Status
| Item | Status |
|---|---|
| Debugger: anchors, pivots, boxes, masks, scrubber, play/pause/restart/speed/loop/amplitude, layer show/hide + reorder, standing overlay, PNG + JSON export, A–D comparison, 8-character caravan strip | Implemented and tested |
| Leather walk | Implemented and tested; occasional dark flecks near the near hand mid-stride |
| Knight walk | Implemented and tested; faint doubling at knees, restrained swing hides fill |
| Cleric walk | Implemented (robe mode); skirt stays whole and sways, only boots step |
| Animation profiles, automatic per outfit | Implemented and tested |
| 8 companions | Implemented and tested (2.7 ms/frame) |
| Weapon grip | Investigated + debug proof (staff follows `grip_n` anchor). Believable grip blocked by art |
| Female outfits | Not rigged (different template pivots); they fall back to subtle walk |

## Needs new artwork
1. **Hidden torso behind arms:** one "arms removed" edit per outfit. Removes all fill approximations.
2. **Arms clear of the body** in the base pose (new male base, same head/neck): cleaner cuts, bigger swing possible.
3. **Hands:** a fist painted with an open grip (or separate fingers layer) for weapons.
4. **Robe legs:** a robe with a back panel and a visible leg gap, if robes should stride more than they sway.

## Weapon attachment (recommendation)
Anchor `grip_n` / `grip_f` is measured per outfit and follows the arm chain (`layerTransforms` → `applyChain`). Weapons should be data: `{file, grip:[x,y], angle}` with draw order `arm_n` → weapon → `hand_n_fingers` (new layer). No combat rig needed for travel.

## Testing
- `node --test tests/anim.test.mjs` (10 tests: determinism, periodicity, profiles, fallback, piece files, anchors, recipe round-trip, seeded random + blocklists, no mutation, source art untouched).
- Visual: open `/animation/`, scrub to 25% and 75%, compare panel A–D, switch outfits, watch the caravan strip.
- Rebuild after art or segmentation changes: `tools/.venv/Scripts/python tools/build_preview.py`.

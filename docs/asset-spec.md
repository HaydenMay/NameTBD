# Asset Specification — Draft v0

Draft until the mannequin is locked in Phase 0; numbers marked *(provisional)* get finalised from the real template.

## View & facing
- Single authored view: **3/4, facing right**. Left-facing = horizontal mirror at runtime.
- Mirroring is accepted for the prototype. Known side effects: weapon/satchel switch sides, parted hair and asymmetric scars flip, heraldry mirrors. Characters with text or strongly asymmetric identity marks may later need a "no-mirror" flag (turn around via a short fade/hop instead).
- No front, back, or overhead views. A side-view rig does not supply them.
- Terms: **near** = limb closer to the camera, **far** = limb behind the body. Never left/right.

## Resolutions
| Space | Canvas | Character height | Head height | Notes |
|---|---|---|---|---|
| Generation | 1024×1536 | 1350 px (y 100 → 1450) | ~360 px | What ChatGPT outputs |
| Master | 2048×3072 | 2700 px | ~720 px | Generation ×2 via Upscayl after cleanup; all parts stored here |
| Runtime | *(provisional)* master × 0.5 | 1350 px | 360 px | Final factor set once on-screen size is known |
| Portrait | 512×512 output | — | ~300 px in frame | Rendered from master-res head/hair/torso parts |

All coordinates in specs and metadata are **master pixels**, origin top-left.

## Template anchors *(provisional — generation px ×2 = master px)*
From `art/template/anchors_draft.json` (generation px): neck (505,470), shoulders near/far (380,555)/(625,555), elbows (335,715)/(672,715), wrists (318,850)/(690,845), grips (312,878)/(695,870), pelvis (505,840), hips (450,880)/(560,880), knees (440,1130)/(575,1130), ankles (435,1370)/(580,1370), floor (505,1450).

## Rig pieces, pivots, bones
| Piece | Bone | Pivot (= parent joint) |
|---|---|---|
| torso | spine | pelvis |
| head (+ face/expression) | head | neck |
| upper_arm_{near,far} | upper_arm_* | shoulder_* |
| forearm_{near,far} | forearm_* | elbow_* |
| hand_{near,far} (+ hand_near_fingers) | hand_* | wrist_* |
| thigh_{near,far} | thigh_* | hip_* |
| shin_{near,far} | shin_* | knee_* |
| foot_{near,far} | foot_* | ankle_* |
| root | root | floor |

Rigid binding (one sprite → one bone) for the prototype. Mesh skinning only if a specific piece (e.g. a long skirt) needs it.

## Joint overlap
- Every piece extends a rounded **joint cap** past its pivot by at least the limb's radius at that joint, and the parent piece extends equally past the child's pivot. Seams sit inside overlap, never on an edge.
- Caps must be fully painted (not transparent) — this is the hidden-area paint-in in Phase 3.
- Design rotation ranges the caps must cover: shoulder ±25°, elbow 0–40°, hip ±30°, knee 0–50°, ankle ±15°, neck ±8°, spine ±5°.

## Draw order (back → front, facing right)
1. accessory_back (satchel bag), cape_back
2. hair_back
3. upper_arm_far, forearm_far, hand_far, weapon_far
4. thigh_far, shin_far, foot_far
5. torso
6. thigh_near, shin_near, foot_near
7. accessory_mid (belt items)
8. head, face_expression, beard
9. hair_front, headwear
10. accessory_front (satchel strap)
11. upper_arm_near, forearm_near, hand_near
12. weapon_near, hand_near_fingers

Exact order is data (per-piece `sort` in metadata), so exceptions don't need code changes.

## Pieces and transparency
- PNG, 8-bit RGBA, straight (non-premultiplied) alpha, sRGB.
- Background removed from flat magenta (#FF00FF) with edge defringe; no magenta halo allowed (checked automatically).
- Each piece trimmed to content + **8 px** transparent padding (master px).
- Atlases: **4 px** padding between sprites, power-of-two pages, max 4096².

## Recolor
- Hair, skin, and recolorable cloth are stored as **greyscale value** art plus an optional RGB mask (R = primary cloth, G = secondary, B = trim). Colour comes from runtime gradient maps.
- Non-recolorable detail (metal, leather, painted heraldry) stays full colour.

## File naming
Lowercase snake_case: `{category}_{id}_{piece}[_{variant}].png`

| Example | Meaning |
|---|---|
| `body_base_forearm_near.png` | mannequin forearm |
| `outfit_knight01_thigh_far.png` | knight outfit far thigh |
| `head_aldric_neutral.png` / `head_aldric_worried.png` | head + expression |
| `hair_short01_front.png` / `hair_short01_back.png` | hair split |
| `acc_satchel01_front.png` / `acc_satchel01_back.png` | accessory split |

## Metadata (one JSON manifest per pack)
```json
{
  "spec": "asset-spec-v0",
  "pack": "outfit_knight01",
  "category": "outfit",
  "pieces": [
    {
      "name": "outfit_knight01_forearm_near",
      "file": "outfit_knight01_forearm_near.png",
      "bone": "forearm_near",
      "pivot_px": [12, 40],
      "sort": 11,
      "recolor": "mask",
      "replaces": "body_base_forearm_near",
      "hides": []
    }
  ],
  "anchors": { "grip_near": [624, 1756] },
  "hides": ["hair_back"]
}
```
`hides` lets headwear suppress hair, outfits suppress body pieces, etc. Atlas packing adds `atlas_page` and `rect` per piece.

## Outfit slots
An outfit is generated whole, then cut. Its pieces are grouped into slots that can mix across outfits:

| Slot | Pieces | Seam overlaps that must accept any neighbour |
|---|---|---|
| top | torso, upper_arm_*, forearm_* | waist (over bottom), wrist cuff (over glove) |
| bottom | thigh_*, shin_* | waist (under top), ankle (under boot) |
| gloves | hand_* (+ hand_near_fingers) | wrist (under sleeve) |
| boots | foot_* | ankle (over/under shin, per piece `sort`) |

Each slot has its own colour channels (R/G/B mask) plus a shared trim colour.

## Head & hair layers
| Layer | Contents | Recolour |
|---|---|---|
| hair_back | everything behind the head/shoulders (long hair, ponytail, braid) | hair gradient |
| head | bald head: face, ears, neck, skin | skin gradient |
| face_patch | expression area (brows, eyes, mouth) | — |
| beard | facial hair | hair gradient |
| hair_front | fringe, sides, top | hair gradient |
| ears_over | optional: pointed ears re-drawn over hair_front (elf, goblin) | skin gradient |
| headwear | hats, hoods, helmets | cloth/metal |

- Hair is authored once against a **bald reference head** and anchored to skull points (crown, hairline, ear point), not the neck. Per-race skull scale/offset lets one hairstyle fit human, elf and goblin heads.
- **Head groups.** Every race is humanoid and built on the shared mannequin (scaled by the rig, never redrawn). Heads belong to a group, and each group has one bald **reference head** that its hairstyles are authored on:

  | Group | Races | Reference head |
  |---|---|---|
  | `humanoid_m` | human, elf, dwarf (male) | bald Aldric |
  | `humanoid_f` | human, elf, dwarf (female) | bald human woman (to make) |
  | `goblin` | goblin (any sex) | bald goblin |
  | `ogre` (later) | ogre | bald ogre head; body = same mannequin, rig-scaled ~1.15 tall, ≤1.2 wide, head ~0.95 relative (big body, small head reads as massive) |

  Each hairstyle lists the groups it `fits` and is offered only to those heads. A style can be authored once and tagged into several groups (most humanoid styles fit both sexes); it only needs a group-specific version when the fit fails (goblin ears, ogre skull). Elves use `ears_over`.
- Hair and beards are always generated in **vivid blue** on the reference head, so the diff extraction can isolate every strand, then recoloured at runtime.
- Long hair_back hangs from the head bone with a sway (spring) bone; it is drawn behind the torso.
- Headwear declares `hides`: `hair_front`, `hair_front_top`, `hair_back`, `ears`. Full helms hide the head and hair entirely.

## Body type & sex compatibility
- One shared mannequin. Sex is carried by the **head** (face, neck width, hair) plus a per-sex **bone preset** (shoulder width, chest, waist, hips, hand size, within ±8%).
- Neck belongs to the head piece, so a male head brings a thicker neck to any body.
- Outfits are `body: any` by default. Outfits whose design is gendered (bodice, dress, sculpted breastplate) are tagged `body: fem` or `body: masc`.
- Heads carry `sex`; the generator only pairs a head with outfits of `any` or the matching tag, and applies the matching bone preset. Manual overrides are allowed for named characters.
- A second (feminine) mannequin is a fallback only if the bone-preset test fails, since it doubles the cost of every outfit.

## Recipe (save format sketch)
String ids, never list indexes, so adding or reordering catalog items never breaks saves.
```
race=human&face=aldric&expr=neutral&skin=fair&hair=short01&hair_col=blond&beard=stubble
&top=knight01&top_col=blue,steel,gold&bottom=knight01&gloves=knight01&boots=travel01
&trim=gold&head=none&acc=satchel01
```
Same idea as LPC's URL recipe and Arena Fighter's Appearance model; stored per NPC, deterministic.

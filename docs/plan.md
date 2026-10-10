# Character Art System — Working Plan

Status: Phase 0 gate passed (2026-10-09). Next: Phase 1 tooling.

Phase 0 results (review images in `art/review/`):
- Style locked: chunky storybook, ~4.6 heads (`art/template/golden_aldric.png`). Taller ~5.8-head version rejected for poor readability at caravan size.
- Mannequin derived via ChatGPT edit sits inside Aldric's silhouette with matching head/hands/knees/feet (`mannequin_overlay.png`). Prompt must avoid "remove clothing" (content filter); "redraw as wooden posing mannequin" works.
- Expressions (neutral/happy/worried) keep identity; edits only change brows/eyes/mouth but add faint outline noise everywhere, so expressions are stored as face patches over one base head.
- Portrait = crop of full body at native res (~540 px region → 512 portrait), readable at 128 px. No separate portrait art needed.
- Donor (elf cleric) fits the same mannequin; crude straight-cut head swaps both ways already sit correctly on the neck with no alignment. Remaining work there is hair front/back splitting and neck/collar seams — as planned.
- Donors must be made as **edits of golden Aldric**, not fresh generations from the mannequin: fresh goblin/dwarf drifted in style and body (IoU 0.62); edited goblin fit at IoU 0.85. Future donors are made bald; hairstyles are edits of bald Aldric (diff extraction worked cleanly on him, not on the elf whose bald edit also redrew the face).
- Design decision: goblins (and other races) are civilised, human-like peoples rather than feral cave goblins. Race reads from face/ears/skin plus rig scale (goblin ~0.78 height reads clearly next to humans — `race_scale_mock.png`).
- Within one ChatGPT chat, regenerations converge on the same character; use new chats for variety and same-chat edits for consistency.

Original phase 0 scope: template & style. Budget $0. Tools: ChatGPT Pro (generation), local SDXL via Krita AI Diffusion on RTX 4060 8GB (registered fixes/inpainting, Phase 3+), Krita (cleanup), Python (pipeline), Unity 6 (runtime).

## Locked decisions
- Style: Reference A proportions (~3.75 heads), richer faces; storybook painterly, dark outlines.
- One authored view: 3/4 facing right. Facing left = mirror. No front/back/top views in the prototype.
- Modular parts on a shared 2D bone rig are the primary approach. Complete-frame animation sheets only for special actions the rig can't sell.
- Parts are **generated whole and cut**, not generated one limb at a time (see "Generation unit vs rig unit").
- Portraits are crops of the same rig at higher resolution; separately painted portraits only if the crop test fails.
- Race variation via heads + bone scaling, tested after the first character validates.
- Original characters and assets only; reference games inform structure, never content.

## Generation unit vs rig unit
The rig needs pieces: head, torso, upper arms, forearms, hands, thighs, shins, feet, hair front/back, clothing, accessories.
AI should not be asked for those pieces individually — each generation would differ in scale, lighting, line weight and joint shape. Instead:

1. Generate a **complete figure** (or complete outfit on the locked mannequin) in the template pose.
2. Cut it into rig pieces with the template's fixed cut masks (scripted).
3. Paint in hidden areas at joint caps (inpainting + manual).

So an outfit becomes a set of limb sprites that replace the body sprites (a sleeved forearm *is* the forearm sprite). Clothing follows the body automatically because it is the body. Hair, hats, helmets, capes and bags are layered on top as separate pieces, with front/back halves where they wrap the body.

## Parts sheets vs animation sheets
| | Modular parts + rig | Complete-frame sheets |
|---|---|---|
| Swap hair/outfit | Free — one set of parts drives every animation | Every frame redrawn per outfit/hair combo |
| Pose richness | Limited to rotations/scales of fixed drawings; foreshortening and turns look stiff | Anything an artist (or AI) can draw |
| AI-friendliness | One aligned image per item, then cut | Needs frame-to-frame consistency AI does badly |
| Use for | All customizable characters, idle, walk, sitting, carrying | Rare set pieces (e.g. a death scene) on generic/silhouetted figures, or unique NPCs |

## Proof of concept (Slice v1) — from the addendum
- One base character (original; working name Sir Aldric).
- Two hairstyles (one short, one long/tied — tests front/back hair split).
- Two outfits (knight plate; travel clothes).
- One removable accessory: **shoulder satchel** (strap in front of torso, bag behind hip — tests a two-layer accessory and fits the caravan theme). A cape is the harder alternative; deferred.
- Idle + walk on the shared rig.
- Head-and-shoulders portrait with neutral, happy, worried expressions.

Slice v2 (after v1 validates): goblin + dwarf + elf heads, bone-scaled bodies, 4 distinct adventurers, recipe-driven generation.

Later: caravan activities (sitting on wagon, carrying goods, tending camp, wagon interaction), more appearances and races.

## Phases
| Phase | Output | Who | Gate |
|---|---|---|---|
| 0 Style & template | Golden character → derived mannequin; first expression test | You (ChatGPT, Krita), me (review, anchors) | Style approved; mannequin aligned |
| 1 Tooling | Slicer/aligner/keyer, manifest, browser preview with recipes | Me | Runs on Phase 0 art |
| 2 Hair & heads | 2 hairstyles + 3 expressions on the golden head | You generate, I process | Hair swaps cleanly; expressions keep identity |
| 3 Outfits & accessory | 2 outfits + satchel, cut into rig pieces, joint caps filled | You generate + clean, I cut/align; local SDXL for fills | Cleanup time per outfit ≤ ~4h |
| 4 Motion (preview) | Idle + walk in browser preview | Me | No joint gaps, no foot sliding, reads in motion |
| 5 Unity | Importer, rig prefab, Sprite Library swaps, recolor shader, portrait capture, recipes | Me (you run Unity) | Validation checklist below passes |

## Validation checklist (Slice v1)
- Swap hair and outfits at runtime without touching animation clips.
- Joint gaps: none visible across the full walk cycle at gameplay and portrait scale.
- Clothing clipping: no limb or strap poking through cloth at extreme poses.
- Foot sliding: planted foot stays fixed relative to the ground while the caravan scrolls.
- Accessory placement: satchel strap and bag stay attached through the walk, both outfits.
- Layering: correct draw order at every frame (near arm over torso, hair front over face edge, etc.).
- Silhouette readability: recognisable at gameplay size and as a solid black fill.
- Identity: portrait (all three expressions) and gameplay figure read as the same person — checked side by side.
- Reviewed **in motion** (looping preview), not only as stills.

## What gets generated / cleaned / built
| Generated (ChatGPT) | Manual cleanup (you, Krita) | Automated (my scripts) | Engine (Unity, me) |
|---|---|---|---|
| Golden character, mannequin, heads + expressions, hair, outfits, accessory | Anatomy/hand fixes, joint-cap paint-in, seam touch-ups | Background key, alignment to anchors, cutting by masks, defringe, grey+mask recolor prep, atlas + metadata, contact sheets, motion previews | Rig, Sprite Library swaps, draw order, recolor shader, idle/walk, portrait camera, recipe save/load |

## Lessons from Arena Fighter (friend's project — reference only)
Location: `GameDev/Created_Games/_reference/arena-fighter` (Flutter/Flame). No LICENSE file, so all rights reserved: we borrow ideas, never code or assets.

Its look is a fully procedural vector chibi (~3,700 lines of hand-tuned drawing code). It's charming but sits in the "geometric vector avatar" category we ruled out. Its **customization structure** is excellent and is what we copy, re-implemented with painted parts:

| Arena Fighter | Our painted equivalent | Cost per option |
|---|---|---|
| Race = data: `bodyScale`, `bulk`, ear/nose/tusk/horn flags | Race = bone scale + width scale + head art set | One head set per race |
| Skin tone, hair colour, per-slot cloth colour, trim colour (free, unlimited) | Gradient-map recolour of greyscale art + R/G/B cloth masks per slot + trim channel | ~Free once assets are prepped |
| 4-slot outfit: top / bottom / gloves / boots | **Same slots, free from our cutting approach**: an outfit cut into limb pieces maps to top (torso, arms), bottom (thighs, shins), gloves (hands), boots (feet). Pieces from different outfits mix because they share the template | Waist/wrist/ankle overlaps must be designed to accept any neighbour |
| Hair, beard, headgear styles (15 / 8 / 15) | Painted pieces; headgear has `hides` rules for hair | ~1 h each target |
| 13 eye styles (code-drawn) | Faces are painted whole, so eye *styles* don't swap. Eye *colour* via a mask, glow eyes as an overlay effect, personality via face variants + expressions | Face variant ~2–3 h |
| Expressions picked by animation state (effort, pain, grin, KO) | Expression head variants per face (neutral / happy / worried first) | Per face × expression |
| Procedural animation: layered sine idle at out-of-sync frequencies, IK hand/foot targets, secondary "drift" on hair | **Adopt**: code-driven idle/walk on the rig (no keyframe authoring), IK-planted feet to prevent sliding, hair/satchel sway | Code only |
| One draw function serves gameplay and every UI preview | Same rig renders gameplay, portraits and menus | — |
| Seeded RNG generates opponents; curated champions are hand-written recipes | Seeded NPC generation with weighted tables + hand-authored "named" companions | — |
| Persisted by **enum index**, append-only | Persist by **string id** (`hair=short01`) so reordering never breaks saves | — |
| Tried Pixellab full-frame sheets per character, then parked them: they broke outfit swapping | Confirms the addendum: full-frame sheets only for special set pieces | — |

### Painted look *and* AF-level customization: where variety comes from
Code-drawn options cost minutes; painted options cost hours. So our variety leans on the cheap multipliers:
1. **Colour** (free): skin × hair colour × 3 cloth channels per slot × trim.
2. **Slot mixing** (free once pieces exist): 4 outfits cut into 4 slots gives up to 256 combinations. NPC generation uses curated "kits" with occasional mixing, so results stay tasteful.
3. **Race scaling** (free): one body, many silhouettes.
4. **Painted shapes** (paid in hours): hair, beards, headgear, faces. Start small (Slice v1: 2 hairstyles), grow toward roughly 8 hair, 5 beards, 6 headgear and 4–6 faces per race once cost per item is measured.

Rough reachable variety at that size, per race: 6 faces × 8 hair × 6 beards × 7 headgear × ~30 outfit-slot combos × colours is easily enough that 30–50 companions never look like duplicates.

Limits: width scaling above about ±20% smears painted texture, so very bulky races (AF's dwarf at `bulk 1.4`, golem 1.5) likely need their own torso pieces.

## Open questions
- Target on-screen character height in the caravan view (sets runtime texture scale).

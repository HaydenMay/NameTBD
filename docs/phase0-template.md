# Phase 0 — Golden Character & Template

Goal: one approved original character that defines the style (proportions, face, linework, shading, palette, clothing detail), and a bald grey mannequin **derived from that character** in the identical pose. The mannequin is the rig base every later part fits.

Order matters: style is judged on a finished character, not a grey dummy. Deriving the mannequin from the approved character keeps pose and line style identical.

Gate 0: you approve the golden character, the mannequin lines up with it, and the expression test keeps identity.

---

## Step 1 — Install Krita (free)

Krita (https://krita.org) is a free, open-source painting program for illustrators. Aseprite is built for pixel art and isn't suited to 1,500 px painterly images.

- Basic use only for Phase 0: eraser, smudge, small paint-overs, Transform (Ctrl+T), Liquify.
- Don't install the AI Diffusion plugin yet (Phase 3).

## Step 2 — Generate the golden character (ChatGPT)

Attach `art/template/pose_guide.png`. Portrait 2:3 (1024×1536). Aim for 10–20 candidates; start a fresh chat if results drift.

> Using the attached image ONLY as a guide for pose, camera angle, and body proportions (do not copy its flat drawing style), paint an original full-body character for a storybook-style 2D fantasy caravan game.
>
> Character: Sir Aldric, a young human knight. Short wavy blond hair, light stubble, a determined but kind face, a small scar through one eyebrow. Steel plate armor over chainmail, a blue tabard with a simple gold lion emblem, a clear brown leather belt at the waist, steel gauntlets with visible cuffs, and tall brown leather boots with clear tops. Hands empty, closed into loose fists. No cape, no weapon, no helmet.
>
> Proportions: chunky, slightly exaggerated storybook RPG proportions about 3.75 heads tall, broad shoulders, expressive face readable at small size.
>
> Pose: 3/4 view facing right, standing relaxed, arms held slightly away from the body, feet slightly apart. Match the attached pose closely.
>
> Style: hand-painted 2D fantasy illustration, clean dark outlines with varied line weight, soft painterly shading, warm storybook colours, light from the upper left. Not pixel art, not anime, not a 3D render.
>
> Composition: full body centred, head near the top, feet near the bottom, entire figure visible. Flat solid magenta (#FF00FF) background, no floor shadow, no text, no border.

Adjustments if needed:
- Too thin/realistic → *"compact, sturdy, game-character proportions like a storybook RPG hero"*.
- Too chibi → *"not chibi; adult proportions, only slightly stylized"*.
- Pose drift → re-attach the guide: *"keep the exact pose and limb positions of the reference"*.
- Background not flat → *"the background must be a single flat magenta colour with no gradient"*.

Save every candidate in `art/incoming/phase0/`. We pick together, judging in order: (1) you'd want this style in the game, (2) pose match, arms clear of torso, feet on one baseline, (3) face readable when shrunk to ~200 px tall, (4) clean silhouette, no fused fingers.

## Step 3 — Derive the mannequin (ChatGPT)

In the chat that produced the winner (or a new one with the winner attached):

> Edit this image: remove all clothing, armor, hair and facial detail, leaving a bald, neutral grey artist's mannequin with simple anatomy underneath. Keep the exact same pose, body proportions, outline style, shading style and lighting. Same flat magenta background.

Generate a few; pick the one that overlays the golden character best. I'll measure the overlay for you.

## Step 4 — Clean up both (Krita, you)

Golden character first, then the mannequin. ~1–2 hours each. Only fix what's wrong: hands/fingers, mismatched limb lengths, broken joints, background blotches. Keep the magenta background.

Save as:
- `art/template/golden_aldric.png`
- `art/template/mannequin.png`

## Step 5 — Expression test (ChatGPT, cheap early data)

Attach `golden_aldric.png`, run twice:

> Edit this image: change only the facial expression to a warm, genuine smile (happy). Keep the face, hair, head angle, pose, outfit, style and background exactly the same.

> …change only the facial expression to worried: brows raised and drawn together, slight frown. Keep everything else exactly the same.

Save as `art/incoming/phase0/aldric_happy_*.png` and `aldric_worried_*.png`. This tells us early whether ChatGPT can vary expressions without changing who the character is.

## Step 6 — My part

- Review candidates with you and recommend.
- Overlay mannequin vs golden character and report drift.
- Lock final anchors (`art/template/anchors.json`) and part-cut lines per `docs/asset-spec.md`.
- Align the expression heads to the neutral head and show them side by side, plus a first portrait-crop test from the golden character.

## Folder layout

```
art/
  template/        pose guide, golden character, mannequin, anchors
  incoming/phase0/ raw ChatGPT outputs (drop everything here)
docs/              plan.md, asset-spec.md, this file
tools/             Python scripts (+ .venv)
```

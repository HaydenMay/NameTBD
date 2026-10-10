# Adding Content

Everything is data. New items go in as files plus a manifest entry; no code changes.
All generation happens in ChatGPT as **edits** of a reference image, so pose, size and style stay locked.

## Reference images (never change these)
| File | Use |
|---|---|
| `art/template/male_base.png` | **Male reference**: lime skin, blue brows, clean-shaven, bald. Edit this for every new male face, hairstyle and beard |
| `art/template/female_base.png` | **Female reference** (Rowan): lime skin, blue brows, bald. Edit this for every new female face and hairstyle |
| `art/template/golden_aldric.png` | Original style reference (historical) |
| `art/incoming/phase0/aldric_bald_limekey.png` | Lime-skin Aldric: ears/tusks and other race layers |
| `art/incoming/phase0/aldric_bald_01.png` | Male (`humanoid_m`) hair & beards |
| `art/incoming/phase0/human_f_bald_01.png` | Female (`humanoid_f`) hair |
| `art/incoming/phase0/goblin_humanlike_01.png` | Goblin-specific hair |
| `art/incoming/phase0/ogre_bald_01.png` | Ogre-specific hair |

## New hairstyle
1. In the chat of the right reference head, edit the **bald** image:
   > Edit this image: give him/her `<hairstyle>`, in a vivid bright blue colour. Keep the face, head shape, ears, expression, pose, outfit, style and background exactly the same.
2. Regenerate if the face or outfit changed.
3. Save to `art/incoming/<batch>/`, then:
   `python tools/extract_hair.py HAIRED.png BALD.png art/parts/hair/hair_<id>.png --hue 195 255 --ylimit 800`
4. Add a manifest entry with `fits: [...]` groups.

## New face / race / character
1. New chat, attach `golden_aldric.png`:
   > Edit this image: transform this character into a completely different person — `<race, sex, face, skin, ears>`, a completely bald head. Nothing of the original face remains. Replace the armor with `<outfit>`. Keep EXACTLY the same pose, body size, body width, proportions, head size and position, and the same art style. Same flat magenta background.
2. You approve the look (each new race is gated on your approval).
3. The result donates **both** a face and an outfit.
4. Optional in the same chat: expression edits (neutral / happy / worried).

## New outfit / armor
Same as a new character, but describe only the clothing and keep the face simple — the face is discarded. Each outfit is cut into slots (top / bottom / gloves / boots) and mixes with all others.
Keep clear seams: a belt or hem at the waist, cuffs at the wrists, boot tops at the shins.

## Rules that keep the pipeline working
- Always edit, never generate from scratch.
- **Skin in bright lime green** (faces, ears, hands, arms); recoloured per race at runtime.
- Hair, beards (and later brows) in vivid blue; everything else in final colours.
- Race is not a face: race = ears/tusks layer + skin palette + rig size, so make faces generic (round human ears) unless a face is deliberately race-specific.
- Flat magenta background, no shadows, no text.
- Nothing far from the mannequin: race shape comes from the rig (scale/width/head size), not from redrawing the body.
- Drop anything that drifts in style; it's cheaper to regenerate than to fix.

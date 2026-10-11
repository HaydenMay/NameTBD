# Handoff: Procedural Companion Generator (as of 2026-10-11)

Read this first in a new session. Owner: HaydenMay. Repo: https://github.com/HaydenMay/NameTBD (public, GitHub Pages).
Live: `/preview-character/` (character builder) and `/animation/` (walk debugger, dev only).

## The game and the goal
Fantasy caravan-management game (Oregon Trail-like). 30–50 persistent, recruitable companions per run; players should remember them by face. Characters are **painted 2D parts** (ChatGPT-generated, $0 budget, ChatGPT Plus image gen) assembled at runtime from a **recipe** string, e.g.
`race=human&face=hobb&skin=deep&outfit=guard_m&hair=m_curly&beard=none&hair_col=black`.
Unity is the eventual engine; everything so far is a browser prototype (Canvas 2D) + Python pipeline.

## Current scope decision
**Humans only.** Elf/goblin/ogre/dwarf parts exist but are parked (hidden; `?races=all` shows them). Don't spend effort on races unless asked.

## How art is made (proven workflow)
- Every part is a **ChatGPT edit of a locked base**: `art/template/male_base.png`, `art/template/female_base.png` (lime skin, blue brows, bald, magenta bg). Never generate from scratch.
- **Key colours:** magenta = background, **lime = skin** (recoloured per skin tone in Lab), **blue = hair/brows/beards** (gradient-mapped to hair colour), **orange = ties/pins/ears/tusks or any part to lift out**.
- **Batch sheets** (10 heads per image) work: `tools/face_sheet.py`, `tools/base_sheet.py` (`faces`, `hair`, `hairlong`), extracted with `tools/sheet_align.py` (per-cell registration) / `tools/extract_sheet.py`. Outfits are NOT done in grids (one full-size image each).
- Faces: change only features inside the face; outline (skull, ears, jaw, cheek) must match base → `tools/check_face.py`. Neutral expression.
- Hair: `tools/check_hair.py` (shift/capture/leak + fit sheet on all faces). User reviews eye-test grids and gives cell codes to block.
- **Women's hair rule: updos/short only, nothing touches the shoulders** (long hair can't fit every outfit). Ties/pins painted orange → leather layer.
- Ears are their own layer drawn **over hair**, cut from the face's own pixels (orange edit = location). Women have **earless** heads (`art/incoming/earless/`); men don't yet.
- Faces are drawn **in front of outfits above the jaw**; outfit's neck opening sits behind the head.

## Build
`tools/.venv/Scripts/python tools/build_preview.py` → `preview-character/assets` + `manifest.json`. Data lists live at the top of that file: `FACES`, `BODIES`, `HAIRS`, `BEARDS`, `RACES` (incl. `hair_by_skin` weights), blocklists `BLOCKED_HAIR`, `BLOCKED_BEARD`, `NO_BEARD`, `BLOCKED_RACES`. Commit + push to `main` = deploy (Pages ~1 min).
**Gotcha:** face ids and hair ids overlap (`f5` is both a face and a hairstyle) — edit by full tuple, not id.

## Content (humans)
- Men: 10 faces (Aldric=male_base, Hobb, Pip, Edric, Corwin, Corwin alt, Doran, Tomas, Varek, Haldor), 9 hairstyles + bald, 2 beards (trimmed, full; Pip none; some blocks).
- Women: 11 faces (Rowan, Brenna, Lisette, Old Maud, Sela, Greta, Ione, Kestra, Hilde, Yvaine, Tamsin), 13 updo/short styles + bald. Tamsin lacks an ear layer (wasn't on the 10-face sheet).
- Outfits (both sexes): knight, cleric, caravan guard — each with an **armless** version in `art/incoming/outfits/`.
- ≈48,000 human combinations. 6 skin tones, 7 hair colours, weighted skin→hair rules.

## Walk animation
`animation/` (anim.js pure pose maths, charlib.js cached layers, index.html debugger with scrubber, overlays, layer order, A–D arm test, 8-character caravan strip). Profiles + per-outfit config: `tools/anim_profiles.json`.
- Male knight: cut from the user's hand **markup** (`art/markup/knight_m.jpg`, `tools/markup.py`, `tools/anim_markup_rig.py`).
- All other outfits: **auto rig** `tools/anim_auto_rig.py` — arms = full minus armless, torso = armless image, legs split at hem/knee, joints measured per outfit. Config needs `hem`, `belt`, `knee`, `armless` per outfit.
- Tests: `node --test tests/anim.test.mjs` (11 pass). Visual check: `py tools/devserver.py 8722` then `__debug.captureStrip(...)` in the debugger saves to `art/review/captures/`.

## Open issues / next steps (user's latest direction)
1. ~~Female near foot points at viewer~~ **Done**: boots-only ChatGPT edits pasted onto the originals below y=1210 (rest of image untouched; armless versions unchanged). Walk rig now keeps each toe on its own boot (outline-walled growth below the boot shafts); `cleric_f` has a hand `foot_split` line (boots painted touching) and a pinned `shift` (auto-registration drifted). Known nit: hairline sliver / heel notch on cleric_f far boot; fix = regenerate cleric boots with a magenta gap, then drop `foot_split`.
2. ~~High-ponytail band~~ **Done**: f3 is now "Tied ponytail" (single full-size edit, `art/incoming/hair_single/f3.png`, extracted with `tools/extract_single_hair.py` — blue hair + orange tie, same rules as the sheets). Shorter, clears the shoulders. Its `_elf`/`_goblin` race versions are stale (races parked). Walk renderer (`animation/charlib.js`) now draws tie layers too (it never did).
3. Optional: men's earless heads (only matters if races return).
4. Later: Unity port (recipe + layered renderer using these exact assets/manifest).

## Working style the user likes
Short, concrete replies; send review images (eye-test grids, close-ups) and let the user vote by cell code; be candid when code can't fix an art problem and give the ChatGPT prompt instead; don't claim fixes without rendering them first.

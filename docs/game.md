# Caravan: first playable journey

Oakvale → Stonehaven, about 10–15 minutes. Entry point: `/game/` (live at https://haydenmay.github.io/NameTBD/game/ once pushed).

## Run
- Local: `py -m http.server 8722` from the repo root, then open http://localhost:8722/game/ (needs http, not `file://`).
- Tests: `node --test` (all files in `tests/`).
- Save: browser `localStorage` key `caravan.save`, versioned (`SAVE_VERSION` in `game/core/state.js`). An incompatible save is ignored and the title screen offers a new journey.

## Layout
| Path | Role |
|---|---|
| `game/content/` | Data only: towns, route, contracts, road events, dialogue, names, prices |
| `game/core/` | Rules, no DOM: `state` (new game, save/load, summary), `characters` (ids, recipes, uniqueness), `rules` (contract maths), `contracts`, `referral`, `relationships`, `company` (bedroll, invites, provisions), `travel`, `events`, `dialogue`, `chronicle`, `time`, `rng` |
| `game/main.js` | UI controller: renders HTML from state, turns clicks into core calls, saves after every action |
| `game/scene.js` | Placeholder town illustration (SVG) and travel scene (canvas) |
| `game/portraits.js` | Builds characters with `animation/charlib.js`; portraits are crops of the standing figure |

Reused unchanged: `animation/anim.js` (poses, `randomRecipe`, skin→hair rules), the manifest and all art. `animation/charlib.js` gained a per-character loader (`loadCharacter`, `partsFor`), and now draws the face's ear layer and hair ties, as the character preview does.

## Rules (all in `game/core/rules.js` unless noted)
- **Party success:** member strength = 2 × level + the contract's attribute. Chance = 50% + 5% × (party strength − difficulty), clamped to 5–95%.
- **Individual risk** depends only on that person, the danger tier, and whether *another* member is a healer:
  exposure = 1.4 − 0.08 × (level + grit), clamped to 0.4–1.2; injury = tier injury × exposure (× 0.75 with a healer); death = tier death × exposure.
  Tiers: None 0/0, Low 15%/0, Serious 30%/6%, Deadly 40%/15%. Tiers None and Low have death exactly 0. A weaker member never raises anyone else's risk.
- Risk is rolled per person, independent of success, as `roll < death` then `roll < death + injury`, so a 0% risk can't happen. Display: `0%` only for exactly 0, `<1%` for small non-zero values.
- Contracts with any death risk need an explicit "I understand" tick before sending.
- Injured companions sit out contracts for 36 hours. XP: full on success, half on failure; next level at 60 × level.
- **Referral** (`referral.js`): the independent adventurer goes alone, judging the job from what you tell them. Told straight, they see the real numbers. Made to sound easier, they believe it's a 75% chance with ≤5% risk. They accept if the risk they see is ≤ 30% and the chance ≥ 55%. They keep the pay and report when you next meet; trust changes then. Referred adventurers can be hurt but never die (death risk folds into injury).
- **Trust after a referral** (`relationships.js`): clean success +15. Success but hurt: +5 if honest, −5 if not. Failed but unhurt: 0 if honest, −8 if not. Failed and hurt: −4 if honest, −20 if not.
- **Joining** (`company.js`): trust ≥ 35 and a free bedroll. Base wagon: merchant + 2 companions; the Extra bedroll (35 gold) adds 1.
- **Travel** (`travel.js`): road length 30 hours. At 1× speed, 1 game hour = 2 real seconds; 2× and 4× are available. Time only moves while the caravan moves (paused for menus, events, hidden tab). Every traveller eats 1 provision per 12 road hours. With none left, speed drops to 75% and companions lose 1 trust per missed meal.

## Temporary defaults (decisions made to finish the slice)
- **Contract pay goes into a shared caravan purse**, which pays for provisions and upgrades. Brief says companions aren't wage-earners but didn't say who receives party contract pay.
- **The merchant carries a wool delivery** (40 gold, +15 if delivered by Day 3, 20:00). This gives the trip a purpose and makes road-event time matter. It isn't a trade system.
- **Merchant wears the caravan guard outfit** ("travel leathers"); there's no merchant outfit art. The independent adventurer (a Scout) uses the same outfit.
- **Classes = existing outfits:** Knight, Cleric (healer trait), Scout (guard outfit).
- **The independent adventurer heads to Stonehaven on their own** if they haven't joined, so their report and a second chance to recruit happen there.
- **The journey is one-way**; it ends from the Caravan screen in Stonehaven.
- **One referral is tracked at a time.** A refused job can't be pushed again.
- **Appearance identity** = race, face, skin, hair, beard, hair colour, scar (not outfit). Each generated character must differ from every existing one, and a small cast avoids repeating faces when possible.

## Placeholders
Town illustrations, wagon, horse and travel scenery are code-drawn shapes. The travel sky has a simple time-of-day tint. Portraits load per character on first view, so there's a short blank circle on first load.

## Later / polish backlog (not built on purpose)
- Painted wagon, horse, road backgrounds, and town art per location.
- Character creator for the merchant; merchant outfit art.
- Multiple simultaneous referrals, letters, or remote adventurer management.
- Richer joining decisions (interests, timing, party fit) beyond one trust threshold.
- More road events and chatter; event chains; events in towns (the effect format already supports it).
- Personal histories per character (Chronicle entries already list `who`).
- Camping and day/night routines, weather, seasons.
- Balancing pass on contract numbers, prices and trust values after playtests.
- Portrait loading placeholder (initials) and the female foot direction issue from HANDOFF.md.

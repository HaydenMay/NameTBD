# Caravan character pipeline (working title)

Research prototype for procedurally generated, painted 2D companions for a fantasy caravan-management game.

**Live preview:** https://haydenmay.github.io/NameTBD/preview-character/

## How it works
- Every character is painted on one shared mannequin pose. New faces, races, outfits and hairstyles are made as ChatGPT *edits* of the same reference images, so pose, size and style stay locked.
- Parts (heads, hair, outfits) are cut out automatically by `tools/` and recoloured at runtime with gradient maps.
- A character is a small recipe string (`race=…&face=…&outfit=…&hair=…&hair_col=…`), so the same recipe always produces the same companion.

## Layout
| Path | Contents |
|---|---|
| `docs/` | Plan, asset spec, how to add content |
| `art/template/` | Locked reference images (pose guide, mannequin, golden character) |
| `art/incoming/` | Raw generated images |
| `art/parts/` | Cut-out parts |
| `art/review/` | Comparison sheets from each test |
| `tools/` | Python pipeline (hair extraction, recolouring, preview build) |
| `preview-character/` | Static browser preview (GitHub Pages) |

## Rebuild the preview
```
python -m venv tools/.venv
tools/.venv/Scripts/python -m pip install pillow numpy scipy
tools/.venv/Scripts/python tools/build_preview.py
```

Prototype stage: head/outfit join is a straight collar cut, race size is a uniform scale, and there's no animation rig yet.

"""Builds the browser preview's assets + manifest from the Phase 0 donor art.

Prototype assembly (no rig yet): every donor is split into a HEAD part (above its
collar line, plus a narrow neck strip below it) and a BODY part (below the collar).
Bodies draw over heads so the collar hides the neck join; hair draws last.

Output: preview-character/assets/*.png + preview-character/manifest.json
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "incoming" / "phase0"
HAIR = ROOT / "art" / "parts" / "hair"
OUT = ROOT / "preview-character"
ASSETS = OUT / "assets"

NECK_STRIP = 60     # px of neck kept below the collar line
NECK_HALF_W = 62    # half-width of that strip

# id, file, label, race, sex, hair group, collar line y, body usable on others
DONORS = [
    ("aldric", "aldric_bald_01", "Aldric (human)", "human", "m", "m", 352, True),
    ("human_f", "human_f_bald_01", "Human woman", "human", "f", "f", 318, True),
    ("elf", "elf_cleric_bald_01", "Elf", "elf", "f", "f", 318, True),
    ("goblin", "goblin_humanlike_01", "Goblin", "goblin", "m", "m", 322, True),
    ("dwarf", "dwarf_bald_01", "Dwarf", "dwarf", "m", "m", 300, False),  # beard covers the chest
    ("ogre", "ogre_bald_01", "Ogre", "ogre", "m", "m", 305, True),
]

OUTFIT_LABELS = {
    "aldric": "Knight plate", "human_f": "Cleric robe", "elf": "Cleric robe (elf)",
    "goblin": "Rogue leathers", "ogre": "Caravan guard",
}

RACES = {
    "human": {"scale": 1.00, "label": "Human"},
    "elf": {"scale": 0.98, "label": "Elf"},
    "dwarf": {"scale": 0.80, "label": "Dwarf"},
    "goblin": {"scale": 0.78, "label": "Goblin"},
    "ogre": {"scale": 1.15, "label": "Ogre"},
}

# hair id, label, groups it fits, reference head it was authored on
HAIRS = [
    ("short01", "Short", ["m"], "aldric"),
    ("wavy01", "Wavy", ["m", "f"], "aldric"),
    ("topknot01", "Top-knot", ["m"], "aldric"),
    ("ponytail02", "Ponytail", ["m"], "aldric"),
    ("slicked01", "Slicked back", ["m"], "aldric"),
    ("shaggy01", "Shaggy", ["m", "f"], "aldric"),
    ("curly01", "Curly", ["m", "f"], "aldric"),
    ("spiky02", "Spiky", ["m"], "aldric"),
    ("bun01", "Bun", ["f"], "human_f"),
    ("sidebraid01", "Side braid", ["f"], "human_f"),
    ("hiponytail01", "High ponytail", ["f", "m"], "human_f"),
    ("pixie01", "Pixie", ["f"], "human_f"),
    ("longstraight01", "Long straight", ["f", "m"], "human_f"),
]

HAIR_COLOURS = {
    "black": [[14, 11, 14], [38, 32, 36], [78, 68, 72], [150, 140, 150]],
    "brown": [[30, 16, 10], [88, 52, 28], [140, 92, 52], [205, 160, 110]],
    "auburn": [[40, 12, 8], [120, 42, 22], [178, 80, 40], [230, 150, 100]],
    "ginger": [[60, 18, 6], [170, 62, 18], [222, 110, 40], [250, 180, 110]],
    "blond": [[70, 40, 12], [190, 140, 50], [235, 195, 90], [255, 240, 180]],
    "silver": [[40, 40, 46], [130, 130, 140], [195, 195, 205], [245, 245, 250]],
    "white": [[70, 66, 70], [190, 186, 190], [235, 232, 235], [255, 255, 255]],
    "teal": [[8, 30, 34], [24, 100, 104], [60, 160, 160], [170, 230, 220]],
}


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGBA")).copy()
    r, g, b = (a[..., i].astype(int) for i in range(3))
    bg = (r > 190) & (g < 90) & (b > 190)
    a[bg, 3] = 0
    bleed = (r - g > 50) & (b - g > 50) & ~bg
    a[bleed, 0] = np.minimum(g[bleed] + 20, np.minimum(r, b)[bleed])
    a[bleed, 2] = np.minimum(g[bleed] + 10, np.minimum(r, b)[bleed])
    return a


def skull(a):
    fg = a[..., 3] > 0
    top = int(np.where(fg[:, 300:760].any(1))[0].min())
    xs = np.where(fg[top + 25, 300:760])[0] + 300
    return [top, int((xs.min() + xs.max()) / 2)]


def save_part(a, name):
    """Crop to content, save, return {file, x, y}."""
    ys, xs = np.where(a[..., 3] > 0)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    Image.fromarray(a[y0:y1, x0:x1]).save(ASSETS / f"{name}.png", optimize=True)
    return {"file": f"assets/{name}.png", "x": int(x0), "y": int(y0)}


def hue_mask(a, lo, hi, smin, vmin):
    rgb = a[..., :3].astype(float) / 255
    mx, mn = rgb.max(2), rgb.min(2)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.select([mx == r, mx == g], [((g - b) / d) % 6, (b - r) / d + 2], (r - g) / d + 4) * 60
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return (hue >= lo) & (hue <= hi) & (sat > smin) & (mx > vmin)


def dwarf_beard(a, collar):
    """The dwarf's beard as its own recolourable part (it hangs over the chest)."""
    m = hue_mask(a, 8, 30, 0.62, 0.45) & (a[..., 3] > 0)
    m[:, :400] = False
    m[:, 720:] = False
    m[:180] = False
    m[700:] = False
    labels, n = ndimage.label(ndimage.binary_closing(m, iterations=2))
    sizes = ndimage.sum(m, labels, range(1, n + 1))
    beard = labels == (1 + int(np.argmax(sizes)))
    beard = ndimage.binary_fill_holes(ndimage.binary_closing(beard, iterations=3))
    dark = a[..., :3].max(2) < 90
    beard |= dark & ndimage.binary_dilation(beard, iterations=3)
    beard[:collar - 10] = False  # face + upper beard stay in the head part (skin shares the beard's hue)
    out = a.copy()
    out[~beard, 3] = 0
    return out


def lum_range(a):
    vis = a[..., 3] > 0
    lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    lo, hi = np.percentile(lum[vis], [2, 99])
    return [round(float(lo), 1), round(float(hi), 1)]


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    heads, bodies = [], []
    skulls = {}
    for did, fname, label, race, sex, group, collar, body_ok in DONORS:
        a = keyed(SRC / f"{fname}.png")
        sk = skull(a)
        skulls[did] = sk
        head = a.copy()
        keep = np.zeros(a.shape[:2], bool)
        keep[:collar] = True
        cx = sk[1]
        keep[collar:collar + NECK_STRIP, cx - NECK_HALF_W:cx + NECK_HALF_W] = True
        head[~keep, 3] = 0
        entry = {"id": did, "label": label, "race": race, "sex": sex, "group": group,
                 "skull": sk, "part": save_part(head, f"head_{did}")}
        if did == "dwarf":
            beard = dwarf_beard(a, collar)
            entry["beard"] = save_part(beard, "beard_dwarf")
        heads.append(entry)
        if body_ok:
            body = a.copy()
            body[:collar, :, 3] = 0
            bodies.append({"id": did, "label": OUTFIT_LABELS[did], "part": save_part(body, f"body_{did}")})

    hairs = []
    for hid, label, fits, ref in HAIRS:
        a = np.asarray(Image.open(HAIR / f"hair_{hid}.png").convert("RGBA")).copy()
        hairs.append({"id": hid, "label": label, "fits": fits, "ref_skull": skulls[ref],
                      "lum": lum_range(a), "part": save_part(a, f"hair_{hid}")})

    manifest = {"canvas": [1024, 1536], "floor_y": 1510, "races": RACES, "heads": heads,
                "bodies": bodies, "hairs": hairs, "hair_colours": HAIR_COLOURS}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(heads)} heads, {len(bodies)} bodies, {len(hairs)} hairs")


if __name__ == "__main__":
    main()

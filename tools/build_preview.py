"""Builds the browser preview's assets + manifest from the Phase 0 donor art.

Model: a character = face (who) + race (ears/tusks layer, skin palette, size)
+ outfit + hair + hair colour + skin tone.

Prototype assembly (no rig yet): every donor is split into a HEAD part (above its
collar line, plus a narrow neck strip below it) and a BODY part (below the collar).
Bodies draw over heads so the collar hides the neck join; hair, then ears, draw last.

Lime-key parts get a skin mask; the page shifts masked pixels to the chosen skin
tone in Lab space (see tools/skin.py for the same maths in Python).

Output: preview-character/assets/*.png + preview-character/manifest.json
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import _hsv, rgb2lab, skin_mask  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "incoming" / "phase0"
PARTS = ROOT / "art" / "parts"
OUT = ROOT / "preview-character"
ASSETS = OUT / "assets"

NECK_STRIP = 60
NECK_HALF_W = 62

# id, file, label, sex/hair group, collar y, lime skin key?, races it suits (None = any)
FACES = [
    ("aldric", "aldric_bald_limekey", "Aldric", "m", 352, True, None),
    ("rowan", "human_f_lime_01", "Rowan", "f", 318, True, None),
    ("brug", "ogre_lime_01", "Brug", "m", 305, True, ["ogre"]),
    ("snik", "goblin_humanlike_01", "Snik (fixed skin)", "m", 322, False, ["goblin"]),
    ("thrain", "dwarf_bald_01", "Thrain (fixed skin)", "m", 300, False, ["dwarf"]),
]

# id, file, label, collar y, lime skin key?
BODIES = [
    ("knight", "aldric_bald_limekey", "Knight plate", 352, True),
    ("cleric", "human_f_lime_01", "Cleric robe", 318, True),
    ("guard", "ogre_lime_01", "Caravan guard", 305, True),
    ("rogue", "goblin_humanlike_01", "Rogue leathers (fixed skin)", 322, False),
]

EARS = ["elf", "goblin", "ogre"]  # authored on lime Aldric

RACES = {
    "human": {"label": "Human", "scale": 1.00, "ears": None, "skins": ["porcelain", "fair", "tan", "olive", "brown", "deep"]},
    "elf": {"label": "Elf", "scale": 0.98, "ears": "elf", "skins": ["moonpale", "fair", "golden", "cool_olive"]},
    "dwarf": {"label": "Dwarf", "scale": 0.80, "ears": None, "skins": ["ruddy", "tan", "weathered", "brown"]},
    "goblin": {"label": "Goblin", "scale": 0.78, "ears": "goblin", "skins": ["moss", "olive_green", "grey_green", "yellow_green"]},
    "ogre": {"label": "Ogre", "scale": 1.15, "ears": "ogre", "skins": ["ogre_green", "dusky", "slate", "mud"]},
}

SKINS = {  # mid-tone sRGB of each skin; converted to Lab for the page
    "porcelain": (246, 212, 188), "fair": (236, 186, 150), "tan": (212, 156, 112),
    "olive": (186, 138, 94), "brown": (146, 96, 62), "deep": (96, 62, 44),
    "moonpale": (236, 222, 214), "golden": (224, 182, 128), "cool_olive": (182, 166, 128),
    "ruddy": (226, 160, 126), "weathered": (168, 116, 82),
    "moss": (122, 148, 70), "olive_green": (150, 154, 78), "grey_green": (124, 140, 108), "yellow_green": (168, 174, 80),
    "ogre_green": (138, 154, 116), "dusky": (168, 138, 104), "slate": (122, 132, 138), "mud": (118, 128, 84),
}

HAIRS = [
    ("short01", "Short", ["m"], "aldric_bald_01"),
    ("wavy01", "Wavy", ["m", "f"], "aldric_bald_01"),
    ("topknot01", "Top-knot", ["m"], "aldric_bald_01"),
    ("ponytail02", "Ponytail", ["m"], "aldric_bald_01"),
    ("slicked01", "Slicked back", ["m"], "aldric_bald_01"),
    ("shaggy01", "Shaggy", ["m", "f"], "aldric_bald_01"),
    ("curly01", "Curly", ["m", "f"], "aldric_bald_01"),
    ("spiky02", "Spiky", ["m"], "aldric_bald_01"),
    ("bun01", "Bun", ["f"], "human_f_bald_01"),
    ("sidebraid01", "Side braid", ["f"], "human_f_bald_01"),
    ("hiponytail01", "High ponytail", ["f", "m"], "human_f_bald_01"),
    ("pixie01", "Pixie", ["f"], "human_f_bald_01"),
    ("longstraight01", "Long straight", ["f", "m"], "human_f_bald_01"),
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


def is_bg(a):
    a = a.astype(int)
    return (a[..., 0] > 190) & (a[..., 1] < 90) & (a[..., 2] > 190)


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGBA")).copy()
    r, g, b = (a[..., i].astype(int) for i in range(3))
    bg = is_bg(a)
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


def save_part(a, name, lime=False):
    """Crop to content and save; for lime parts also save a skin mask + its mean Lab."""
    ys, xs = np.where(a[..., 3] > 0)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = a[y0:y1, x0:x1]
    Image.fromarray(crop).save(ASSETS / f"{name}.png", optimize=True)
    part = {"file": f"assets/{name}.png", "x": int(x0), "y": int(y0)}
    if lime:
        m = skin_mask(crop) & (crop[..., 3] > 0)
        if m.sum() > 50:
            Image.fromarray((m * 255).astype(np.uint8)).save(ASSETS / f"{name}_skin.png", optimize=True)
            part["skin_mask"] = f"assets/{name}_skin.png"
            part["key_lab"] = [round(float(v), 2) for v in rgb2lab(crop[..., :3])[m].mean(0)]
    return part


def lum_range(a):
    vis = a[..., 3] > 0
    lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    lo, hi = np.percentile(lum[vis], [2, 99])
    return [round(float(lo), 1), round(float(hi), 1)]


def head_part(a, collar, sk):
    head = a.copy()
    keep = np.zeros(a.shape[:2], bool)
    keep[:collar] = True
    keep[collar:collar + NECK_STRIP, sk[1] - NECK_HALF_W:sk[1] + NECK_HALF_W] = True
    head[~keep, 3] = 0
    return head


def dwarf_beard(a, collar):
    h, s, v = _hsv(a)
    m = (h >= 8) & (h <= 30) & (s > 0.62) & (v > 0.45) & (a[..., 3] > 0)
    m[:180] = False
    m[700:] = False
    m[:, :400] = False
    m[:, 720:] = False
    labels, n = ndimage.label(ndimage.binary_closing(m, iterations=2))
    sizes = ndimage.sum(m, labels, range(1, n + 1))
    beard = labels == (1 + int(np.argmax(sizes)))
    beard = ndimage.binary_fill_holes(ndimage.binary_closing(beard, iterations=3))
    beard |= (a[..., :3].max(2) < 90) & ndimage.binary_dilation(beard, iterations=3)
    beard[:collar - 10] = False
    out = a.copy()
    out[~beard, 3] = 0
    return out


def main():
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    ASSETS.mkdir(parents=True)
    ref_skulls = {n: skull(keyed(SRC / f"{n}.png")) for n in ["aldric_bald_01", "human_f_bald_01", "aldric_bald_limekey"]}

    faces = []
    for fid, fname, label, group, collar, lime, races in FACES:
        a = keyed(SRC / f"{fname}.png")
        sk = skull(a)
        entry = {"id": fid, "label": label, "group": group, "skull": sk, "races": races,
                 "lime": lime, "part": save_part(head_part(a, collar, sk), f"head_{fid}", lime)}
        if fid == "thrain":
            entry["beard"] = save_part(dwarf_beard(a, collar), "beard_thrain")
        faces.append(entry)

    bodies = []
    for bid, fname, label, collar, lime in BODIES:
        a = keyed(SRC / f"{fname}.png")
        a[:collar, :, 3] = 0
        bodies.append({"id": bid, "label": label, "lime": lime, "part": save_part(a, f"body_{bid}", lime)})

    ears = {}
    for e in EARS:
        a = np.asarray(Image.open(PARTS / "ears" / f"ears_{e}.png").convert("RGBA")).copy()
        ears[e] = {"ref_skull": ref_skulls["aldric_bald_limekey"], "part": save_part(a, f"ears_{e}", True)}

    hairs = []
    for hid, label, fits, ref in HAIRS:
        a = np.asarray(Image.open(PARTS / "hair" / f"hair_{hid}.png").convert("RGBA")).copy()
        hairs.append({"id": hid, "label": label, "fits": fits, "ref_skull": ref_skulls[ref],
                      "lum": lum_range(a), "part": save_part(a, f"hair_{hid}")})

    skins = {k: {"rgb": list(v), "lab": [round(float(x), 2) for x in rgb2lab(np.array([[v]], float))[0, 0]]}
             for k, v in SKINS.items()}

    manifest = {"canvas": [1024, 1536], "floor_y": 1510, "races": RACES, "skins": skins,
                "faces": faces, "bodies": bodies, "ears": ears, "hairs": hairs, "hair_colours": HAIR_COLOURS}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(faces)} faces, {len(bodies)} bodies, {len(ears)} ears, {len(hairs)} hairs, {len(skins)} skins")


if __name__ == "__main__":
    main()

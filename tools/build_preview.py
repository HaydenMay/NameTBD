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
import time
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

# Each sex has one base template. Heads only join bodies made on the same template,
# so neck width and collar height always match at the cut line.
TEMPLATES = {"m": {"cut": 345}, "f": {"cut": 332}}

# id, file, label, template, races it suits (None = any). All lime-skin edits.
FACES = [
    ("aldric", "../../template/male_base", "Aldric", "m", None),
    # retired 2026-10-09 (stubble baked in, not made from male_base): bran, garrett
    ("hobb", "male_hobb", "Hobb", "m", None),
    # corwin: to be remade on male_base with a neutral expression
    ("pip", "male_pip", "Pip", "m", None),
    ("edric", "male_edric", "Edric", "m", None),
    ("m1_lean_a", "../faces_m/m1_lean_a", "Corwin", "m", None),
    ("m6_lean_b", "../faces_m/m6_lean_b", "Corwin (alt)", "m", None),
    ("m2_weathered", "../faces_m/m2_weathered", "Doran", "m", None),
    ("m3_gentle", "../faces_m/m3_gentle", "Tomas", "m", None),
    ("m4_stern", "../faces_m/m4_stern", "Varek", "m", None),
    ("m5_sunworn", "../faces_m/m5_sunworn", "Haldor", "m", None),
    ("brug", "ogre_lime_01", "Brug", "m", ["ogre"]),
    ("rowan", "rowan_bluebrow", "Rowan", "f", None),
    ("mira", "mira_bluebrow", "Mira", "f", None),
]
BROWS = {"aldric", "rowan", "mira", "hobb", "pip", "edric", "m1_lean_a", "m6_lean_b", "m2_weathered", "m3_gentle", "m4_stern", "m5_sunworn"}   # art/parts/brows/brows_<id>.png (blue key)
# Bloodline-style blocklist: face/hair pairs that were reviewed and rejected.
BLOCKED_HAIR = {
    "m1_lean_a": ["m_wavy"],   # narrower cheek: far-side strands float off the face
    "m6_lean_b": ["m_wavy"],
}
SCARS = set()  # old scars were painted on retired faces; scars come back as generic layers                     # art/parts/scars/scar_<id>.png (optional layer)

# id, file, label, template
BODIES = [
    ("knight_m", "../../template/male_base", "Knight plate", "m"),
    ("cleric_m", "aldric_lime_cleric", "Cleric robe", "m"),
    ("guard_m", "ogre_lime_01", "Caravan guard", "m"),
    ("cleric_f", "human_f_lime_01", "Cleric robe", "f"),
    ("knight_f", "female_face02_knight", "Knight plate", "f"),
]

EARS = ["elf", "goblin", "ogre"]  # authored on lime Aldric

RACES = {
    "human": {"label": "Human", "scale": 1.00, "ears": None,
              "skins": ["porcelain", "fair", "tan", "olive", "brown", "deep"],
              "hair": ["black", "brown", "auburn", "ginger", "blond", "silver", "white"]},
    "elf": {"label": "Elf", "scale": 0.98, "ears": "elf",
            "skins": ["moonpale", "fair", "golden", "cool_olive"],
            "hair": ["silver", "white", "blond", "black", "auburn"]},
    "dwarf": {"label": "Dwarf", "scale": 0.80, "ears": None,
              "skins": ["ruddy", "tan", "weathered", "brown"],
              "hair": ["ginger", "auburn", "brown", "black", "silver", "white"]},
    "goblin": {"label": "Goblin", "scale": 0.78, "ears": "goblin",
               "skins": ["moss", "olive_green", "grey_green", "yellow_green"],
               "hair": ["black", "brown", "white", "teal"]},
    "ogre": {"label": "Ogre", "scale": 1.15, "ears": "ogre",
             "skins": ["ogre_green", "dusky", "slate", "mud"],
             "hair": ["black", "brown", "auburn", "silver"]},
}

SKINS = {  # mid-tone sRGB of each skin; converted to Lab for the page
    "porcelain": (246, 212, 188), "fair": (236, 186, 150), "tan": (212, 156, 112),
    "olive": (186, 138, 94), "brown": (146, 96, 62), "deep": (96, 62, 44),
    "moonpale": (236, 222, 214), "golden": (224, 182, 128), "cool_olive": (182, 166, 128),
    "ruddy": (226, 160, 126), "weathered": (168, 116, 82),
    "moss": (122, 148, 70), "olive_green": (150, 154, 78), "grey_green": (124, 140, 108), "yellow_green": (168, 174, 80),
    "ogre_green": (138, 154, 116), "dusky": (168, 138, 104), "slate": (122, 132, 138), "mud": (118, 128, 84),
}

HAIRS = [  # (id, label, fits, reference image the hair was drawn on[, x nudge])
    ("m_short", "Short", ["m"], "male_base"),
    ("m_wavy", "Long wavy", ["m"], "male_base"),
    ("m_ponytail", "Ponytail", ["m"], "male_base"),
    ("m_shaggy", "Shaggy", ["m"], "male_base"),
    ("m_curly", "Curly", ["m"], "male_base"),
    ("m_topknot_soft", "Top-knot", ["m"], "male_base"),
    ("m_buzz", "Buzz cut", ["m"], "male_base"),
    ("m_midpart", "Middle part", ["m"], "male_base"),
    ("spiky02", "Spiky", ["m"], "aldric_bald_01"),
    ("slicked01", "Slicked back", ["m"], "aldric_bald_01"),
    # replaced by m_topknot_soft: ("topknot02", "Top-knot (shaved)", ["m"], "aldric_bald_limekey"),
    ("bun01", "Bun", ["f"], "human_f_bald_01"),
    ("sidebraid01", "Side braid", ["f"], "human_f_bald_01"),
    ("hiponytail01", "High ponytail", ["f"], "human_f_bald_01"),
    ("pixie01", "Pixie", ["f"], "human_f_bald_01"),
    ("longstraight01", "Long straight", ["f"], "human_f_bald_01"),
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


def save_part(a, name, lime=False, hue_lo=None):
    """Crop to content and save; for lime parts also save a skin mask + its mean Lab."""
    ys, xs = np.where(a[..., 3] > 0)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = a[y0:y1, x0:x1]
    Image.fromarray(crop).save(ASSETS / f"{name}.png", optimize=True)
    part = {"file": f"assets/{name}.png", "x": int(x0), "y": int(y0)}
    if lime:
        m = skin_mask(crop, hue_lo=hue_lo) & (crop[..., 3] > 0)
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


def head_mask(a, cut, limit=480):
    """Whole head. Above the jaw line everything visible is head (bald faces: skull, both
    eyes, brows, ears, nose tip), so nothing on the silhouette edge gets clipped. Between
    the jaw and the shoulders, only the chin/neck skin region and its outline."""
    vis = a[..., 3] > 0
    jaw = cut - 30
    skin = skin_mask(a) & vis
    skin[limit:] = False
    labels, n = ndimage.label(skin)
    if n:  # keep the main head/neck blob plus anything that starts above the jaw (ears)
        sizes = ndimage.sum(skin, labels, range(1, n + 1))
        tops = ndimage.minimum(np.indices(skin.shape)[0], labels, range(1, n + 1))
        keep = [i + 1 for i in range(n) if i == int(np.argmax(sizes)) or tops[i] < jaw]
        skin = np.isin(labels, keep)
    head = ndimage.binary_fill_holes(ndimage.binary_closing(skin, iterations=6))
    head = ndimage.binary_dilation(head, iterations=5)
    # Above the jaw: everything visible within the head's own width (+ padding for the
    # far eye / nose tip), but not shoulders that rise beside the head.
    cols = np.where(skin[:jaw].any(0))[0]
    if len(cols):
        head[:jaw, max(cols.min() - 30, 0):cols.max() + 31] = True
    return head & vis


def neck_columns(a, cut):
    """Horizontal extent of the bare neck, measured below the chin."""
    skin = skin_mask(a) & (a[..., 3] > 0)
    for y in range(cut + 25, cut - 5, -5):
        xs = np.where(skin[y, 300:760])[0] + 300
        if len(xs):
            return xs.min(), xs.max()
    return None


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
    ref_skulls["male_base"] = skull(keyed(ROOT / "art" / "template" / "male_base.png"))

    faces = []
    for fid, fname, label, tpl, races in FACES:
        a = keyed(SRC / f"{fname}.png")
        head = a.copy()
        head[~head_mask(a, TEMPLATES[tpl]["cut"]), 3] = 0
        if fid in BROWS:  # neutralise faint blue brow edges left on the face under the brow layer
            h, sat, _ = _hsv(head)
            tint = (h >= 170) & (h <= 275) & (sat > 0.1)
            tint[300:] = False
            grey = head[..., :3].mean(2).astype(np.uint8) // 2
            head[tint, 0] = head[tint, 1] = head[tint, 2] = grey[tint]
        extra = {}
        if fid in BROWS:
            b = np.asarray(Image.open(PARTS / "brows" / f"brows_{fid}.png").convert("RGBA")).copy()
            extra["brows"] = {**save_part(b, f"brows_{fid}"), "lum": lum_range(b)}
        if fid in SCARS:
            extra["scar"] = save_part(np.asarray(Image.open(PARTS / "scars" / f"scar_{fid}.png").convert("RGBA")).copy(), f"scar_{fid}")
        if fid in BLOCKED_HAIR:
            extra["blocked_hair"] = BLOCKED_HAIR[fid]
        faces.append({**extra, "id": fid, "label": label, "template": tpl, "group": tpl, "skull": skull(a), "races": races,
                      "lime": True, "part": save_part(head, f"head_{fid}", True, hue_lo=40)})

    bodies = []
    for bid, fname, label, tpl in BODIES:
        a = keyed(SRC / f"{fname}.png")
        cut = TEMPLATES[tpl]["cut"]
        hm = head_mask(a, cut)
        # back: the donor's own neck stump, drawn behind the head to fill any gap
        back = a.copy()
        stump = hm & skin_mask(a)
        stump[:cut] = False
        cols = neck_columns(a, cut)  # neck only: never the donor's chin or jaw
        if cols:
            stump[:, :cols[0]] = False
            stump[:, cols[1] + 1:] = False
        else:
            stump[:] = False
        back[~stump, 3] = 0
        # front: everything that isn't the donor's head (collars, hoods, armour, hands)
        front = a.copy()
        drop = ndimage.binary_dilation(hm, iterations=1)
        drop[:cut - 20] |= ndimage.binary_dilation(hm, iterations=6)[:cut - 20]  # face edge: nose/lash tips
        front[drop, 3] = 0
        entry = {"id": bid, "label": label, "template": tpl, "lime": True,
                 "part": save_part(front, f"body_{bid}", True)}
        if stump.any():
            entry["back"] = save_part(back, f"body_{bid}_back", True)
        bodies.append(entry)

    ears = {}
    for e in EARS:
        a = np.asarray(Image.open(PARTS / "ears" / f"ears_{e}.png").convert("RGBA")).copy()
        ears[e] = {"ref_skull": ref_skulls["aldric_bald_limekey"], "part": save_part(a, f"ears_{e}", True, hue_lo=40)}

    hairs = []
    for hid, label, fits, ref, *shift in HAIRS:
        a = np.asarray(Image.open(PARTS / "hair" / f"hair_{hid}.png").convert("RGBA")).copy()
        ry, rx = ref_skulls[ref]
        hairs.append({"id": hid, "label": label, "fits": fits, "ref_skull": [ry, rx - (shift[0] if shift else 0)],
                      "lum": lum_range(a), "part": save_part(a, f"hair_{hid}")})

    skins = {k: {"rgb": list(v), "lab": [round(float(x), 2) for x in rgb2lab(np.array([[v]], float))[0, 0]]}
             for k, v in SKINS.items()}

    manifest = {"version": int(time.time()), "canvas": [1024, 1536], "floor_y": 1510, "races": RACES, "skins": skins,
                "faces": faces, "bodies": bodies, "ears": ears, "hairs": hairs, "hair_colours": HAIR_COLOURS}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(faces)} faces, {len(bodies)} bodies, {len(ears)} ears, {len(hairs)} hairs, {len(skins)} skins")


if __name__ == "__main__":
    main()

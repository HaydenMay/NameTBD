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
import anim_rig  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "incoming" / "phase0"
PARTS = ROOT / "art" / "parts"
OUT = ROOT / "preview-character"
ASSETS = OUT / "assets"

# Each sex has one base template. Heads only join bodies made on the same template,
# so neck width and collar height always match at the cut line.
TEMPLATES = {"m": {"cut": 345}, "f": {"cut": 332}}

# Walk-test rig (male template, canvas px). "n" = near limb (image-left, drawn in front),
# "f" = far limb (image-right, drawn behind). Measured on art/template/male_base.png.
ANIM = json.loads((Path(__file__).resolve().parent / "anim_profiles.json").read_text())

RIG = {
    "m": {
        "pivots": {"neck": [512, 375], "shoulder_n": [300, 505], "shoulder_f": [690, 505],
                   "hip_n": [430, 860], "hip_f": [610, 860], "knee_n": [425, 1085], "knee_f": [630, 1085]},
        "arm_n_x": 350, "arm_f_x": 675, "arm_top": 490, "arm_bottom": 975,   # arms: outside these x, below arm_top
        "leg_top": 860, "tabard": [465, 645, 1000],        # legs start at leg_top; torso keeps tabard band to y
        "leg_split_x": 517, "knee_y": 1085,
    },
}


def split_rig(a, r, hem):
    """Cut a full outfit image into rig pieces (torso, arms, thighs, shins)."""
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    vis = a[..., 3] > 0
    tx0, tx1, ty = r["tabard"]
    ty = max(ty, hem)
    arm_band = (yy >= r["arm_top"]) & (yy < r["arm_bottom"])
    arm_n = (xx < r["arm_n_x"]) & arm_band
    arm_f = (xx > r["arm_f_x"]) & arm_band
    # everything above the hem (skirt, tabard, robe, faulds) stays on the torso
    legs = (yy >= max(r["leg_top"], hem)) & ~arm_n & ~arm_f
    torso = vis & ~legs & ~arm_n & ~arm_f
    near = xx < r["leg_split_x"]
    k = r["knee_y"]
    # thighs reach up under the torso so a swinging leg never shows a gap at the hip
    thigh_zone = (yy >= max(r["leg_top"], hem) - 60) & ~arm_n & ~arm_f
    regions = {
        "torso": torso, "arm_n": vis & arm_n, "arm_f": vis & arm_f,
        "thigh_n": vis & thigh_zone & near & (yy < k + 30), "shin_n": vis & legs & near & (yy >= k - 30),
        "thigh_f": vis & thigh_zone & ~near & (yy < k + 30), "shin_f": vis & legs & ~near & (yy >= k - 30),
        # static underlay behind everything: fills any hip/crotch gap with resting-pose pixels
        "hips": vis & (yy >= r["leg_top"] - 100) & (yy < k - 20) & ~arm_n & ~arm_f,
    }
    pieces = {}
    for name, m in regions.items():
        p = a.copy()
        p[~m, 3] = 0
        pieces[name] = p
    # hidden area: where the near arm covered the torso, smear nearby torso colour in
    t = pieces["torso"]
    hole = vis & arm_n & ndimage.binary_dilation(torso, iterations=40)
    hole[:r["arm_top"]] = False
    if hole.any():
        idx = ndimage.distance_transform_edt(~torso, return_distances=False, return_indices=True)
        t[hole] = a[idx[0][hole], idx[1][hole]]
        t[hole, 3] = 255
    return pieces

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
    # retired 2026-10-10 (not made from female_base; ear sits where hair is drawn): mira
    ("f1", "../faces_f/f1", "Brenna", "f", None),
    ("f2", "../faces_f/f2", "Lisette", "f", None),
    ("f3", "../faces_f/f3", "Old Maud", "f", None),
    ("f4", "../faces_f/f4", "Sela", "f", None),
    ("f5", "../faces_f/f5", "Greta", "f", None),
    ("f6", "../faces_f/f6", "Ione", "f", None),
    ("f7", "../faces_f/f7", "Kestra", "f", None),
    ("f8", "../faces_f/f8", "Hilde", "f", None),
    ("f9", "../faces_f/f9", "Yvaine", "f", None),
    ("f10", "../faces_f/f10", "Tamsin", "f", None),
]
BROWS = {"f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "aldric", "rowan", "mira", "hobb", "pip", "edric", "m1_lean_a", "m6_lean_b", "m2_weathered", "m3_gentle", "m4_stern", "m5_sunworn"}   # art/parts/brows/brows_<id>.png (blue key)
# Faces that never get a beard (too young/round to carry one).
NO_BEARD = {"pip"}
# Face/beard pairs that were reviewed and rejected.
BLOCKED_BEARD = {
    "hobb": ["trimmed"],
    "m2_weathered": ["trimmed"],
    "m5_sunworn": ["trimmed"],
}
# Bloodline-style blocklist: face/hair pairs that were reviewed and rejected.
# Mouth lines [left x, right x, y] where auto-detection (tools/mouth.py) picks the wrong stroke.
MOUTH_OVERRIDE = {
    "edric": [537, 605, 290],
    "m1_lean_a": [556, 610, 297],
    "m5_sunworn": [545, 610, 293],
}
# Races a face is never used for (reviewed and rejected, like the hair blocklist).
BLOCKED_RACES = {   # ogre vote 2026-10-10: keep Hobb, Edric, Doran, Varek, Haldor
    "aldric": ["ogre"], "pip": ["ogre"], "m1_lean_a": ["ogre"], "m6_lean_b": ["ogre"], "m3_gentle": ["ogre"],
}
TRANSPLANT_TUSKS = False
TUSK_REF_MOUTH = [550, 606, 297]   # mouth of aldric_bald_limekey, where ears_ogre's tusks were drawn

BLOCKED_HAIR = {
    "m1_lean_a": ["m_wavy", "m_midpart"],   # narrower cheek: far-side strands float off the face
    "m6_lean_b": ["m_wavy", "m_midpart"],
    "edric": ["m_midpart", "m_wavy"],        # far-side strands stand off the cheek
    "hobb": ["m_midpart"],                   # wider face: fringe lands on his brow
}
SCARS = set()  # old scars were painted on retired faces; scars come back as generic layers                     # art/parts/scars/scar_<id>.png (optional layer)

# id, file, label, template
BODIES = [
    ("knight_m", "../../template/male_base", "Knight plate", "m", 985),
    ("cleric_m", "aldric_lime_cleric", "Cleric robe", "m", 1050),
    ("guard_m", "../outfits/guard_m", "Caravan guard", "m", 900),   # was ogre_lime_01 (ogre body)
    ("cleric_f", "human_f_lime_01", "Cleric robe", "f", 0),
    ("knight_f", "female_face02_knight", "Knight plate", "f", 0),
    ("guard_f", "../outfits/guard_f", "Caravan guard", "f", 0),
]

EARS = ["elf", "goblin", "ogre"]  # authored on lime Aldric

RACES = {
    "human": {"label": "Human", "scale": 1.00, "ears": None,
              "skins": ["porcelain", "fair", "tan", "olive", "brown", "deep"],
              "hair": ["black", "brown", "auburn", "ginger", "blond", "silver", "white"],
              # skin tone -> allowed hair colours, as [colour, weight] (weight = how common)
              "hair_by_skin": {
                  "porcelain": [["black", 2], ["brown", 3], ["auburn", 2], ["ginger", 2], ["blond", 3], ["silver", 1], ["white", 1]],
                  "fair":      [["black", 2], ["brown", 3], ["auburn", 2], ["ginger", 1], ["blond", 2], ["silver", 1], ["white", 1]],
                  "tan":       [["black", 3], ["brown", 3], ["auburn", 1], ["blond", 1], ["silver", 1], ["white", 1]],
                  "olive":     [["black", 4], ["brown", 3], ["silver", 1], ["white", 1]],
                  "brown":     [["black", 5], ["brown", 2], ["silver", 1], ["white", 1]],
                  "deep":      [["black", 5], ["brown", 1], ["silver", 1], ["white", 1]]}},
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
    "moonpale": (206, 188, 176), "golden": (224, 182, 128), "cool_olive": (182, 166, 128),
    "ruddy": (226, 160, 126), "weathered": (168, 116, 82),
    "moss": (122, 148, 70), "olive_green": (150, 154, 78), "grey_green": (124, 140, 108), "yellow_green": (168, 174, 80),
    "ogre_green": (138, 154, 116), "dusky": (168, 138, 104), "slate": (122, 132, 138), "mud": (118, 128, 84),
}

HAIRS = [  # (id, label, fits, reference image the hair was drawn on[, x nudge])
    ("m_short", "Short", ["m"], "male_base"),
    ("m_wavy", "Long wavy", ["m"], "male_base"),
    # pulled (gap behind the ear): ("m_ponytail", "Ponytail", ["m"], "male_base"),
    ("m_ponytail2", "Ponytail", ["m"], "male_base"),
    ("m_topknot2", "Top-knot", ["m"], "male_base"),
    ("m_slicked2", "Slicked back", ["m"], "male_base"),
    ("m_shaggy", "Shaggy", ["m"], "male_base"),
    ("m_curly", "Curly", ["m"], "male_base"),
    # pulled (shaved sides lost in masking): ("m_topknot_soft", "Top-knot", ["m"], "male_base"),
    # pulled (shaved sides lost in masking): ("m_buzz", "Buzz cut", ["m"], "male_base"),
    ("m_midpart", "Middle part", ["m"], "male_base"),
    ("spiky02", "Spiky", ["m"], "aldric_bald_01"),
    # pulled (old source, ear gaps): ("slicked01", "Slicked back", ["m"], "aldric_bald_01"),
    # replaced by m_topknot_soft: ("topknot02", "Top-knot (shaved)", ["m"], "aldric_bald_limekey"),
    # women: all drawn on female_base (batch sheets); older styles on the previous Rowan retired
    ("f2", "Bob", ["f"], "female_base"),
    ("f3", "High ponytail", ["f"], "female_base"),
    # trimmed (duplicate of High bun): ("f5", "Bun", ["f"], "female_base"),
    # trimmed (duplicate of Tousled crop): ("f7", "Pixie", ["f"], "female_base"),
    # pulled (touches shoulders): ("f9", "Shoulder-length", ["f"], "female_base"),
    ("fu1", "High bun", ["f"], "female_base"),
    ("fu2", "Low chignon", ["f"], "female_base"),
    ("fu3", "Braided bun", ["f"], "female_base"),
    ("fu4", "Messy bun", ["f"], "female_base"),
    ("fu5", "Twin buns", ["f"], "female_base"),
    ("fu6", "French twist", ["f"], "female_base"),
    ("fu7", "Braided crown bun", ["f"], "female_base"),
    ("fu8", "Short ponytail", ["f"], "female_base"),
    ("fu9", "Wavy chin-length", ["f"], "female_base"),
    ("fu10", "Tousled crop", ["f"], "female_base"),
    ("f10", "Crown braid", ["f"], "female_base"),
    # pulled (falls over the outfit; needs an updo instead): ("fl1", "Long straight", ["f"], "female_base"),
    # pulled (falls over the outfit; needs an updo instead): ("fl2", "Long waves", ["f"], "female_base"),
    # pulled (falls over the outfit; needs an updo instead): ("fl3", "Side braid", ["f"], "female_base"),
    # pulled (falls over the outfit; needs an updo instead): ("fl4", "Two braids", ["f"], "female_base"),
]

# Beards: blue edits of male_base, cut with check_hair.py, drawn over the outfit collar.
BEARDS = [  # (id, label, reference image)
    ("trimmed", "Trimmed beard", "male_base"),
    ("full", "Full beard", "male_base"),
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


def save_part(a, name, lime=False, hue_lo=None, reach=4, eyes=False, min_skin=50, all_skin=False):
    """Crop to content and save; for lime parts also save a skin mask + its mean Lab."""
    ys, xs = np.where(a[..., 3] > 0)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = a[y0:y1, x0:x1]
    Image.fromarray(crop).save(ASSETS / f"{name}.png", optimize=True)
    part = {"file": f"assets/{name}.png", "x": int(x0), "y": int(y0)}
    if lime:
        zone = None
        if eyes == "none":  # pieces with no eyes (ear patches): bright lime highlights are skin too
            zone = np.zeros(crop.shape[:2], bool)
        elif eyes:  # heads: eyes sit in the front half, 120-260px below the crown
            zone = np.zeros(crop.shape[:2], bool)
            zone[120:260, crop.shape[1] // 2:] = True
        m = skin_mask(crop, hue_lo=hue_lo, reach=reach, eye_zone=zone) & (crop[..., 3] > 0)
        if all_skin:  # piece is skin by construction (ear patch): recolour every pixel
            m = crop[..., 3] > 0
        if m.sum() > min_skin:
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


def old_ear_mask(top, cx):
    """Where the human ear was on the base face (union of what the elf / goblin edits removed
    or repainted), relative to the skull, as (mask, top, cx) of male_base."""
    m = None
    for rk in ("elf", "goblin"):
        for kind in ("cut", "patch"):
            f = PARTS / f"ears_{rk}" / f"{kind}_aldric.png"
            if f.exists():
                a = np.asarray(Image.open(f).convert("RGBA"))[..., 3] > 0
                m = a if m is None else (m | a)
    return m


def hair_ear_fill(a, top, cx, base_skull):
    """Hair painted around the human ear leaves a gap where the old ear was. For races with
    their own (narrower) ears, fill only that old-ear area with the nearest hair pixels,
    and only where the hair actually surrounds it."""
    ear = old_ear_mask(top, cx)
    if ear is None:
        return None
    dy, dx = top - base_skull[0], cx - base_skull[1]          # hair ref vs base face
    ear = np.roll(np.roll(ear, dy, 0), dx, 1)
    hair = a[..., 3] > 0
    around = ndimage.binary_closing(hair, iterations=14)
    notch = ear & around & ~hair
    if notch.sum() < 80:
        return None
    idx = ndimage.distance_transform_edt(~hair, return_distances=False, return_indices=True)
    out = np.zeros_like(a)
    out[notch] = a[idx[0][notch], idx[1][notch]]
    out[notch, 3] = 255
    return out


def tusk_pieces():
    """Split ears_ogre.png into the ear (largest piece) and the near / far tusks."""
    a = np.asarray(Image.open(PARTS / "ears" / "ears_ogre.png").convert("RGBA")).copy()
    lab, n = ndimage.label(a[..., 3] > 0)
    sizes = ndimage.sum(a[..., 3] > 0, lab, range(1, n + 1))
    order = np.argsort(-sizes) + 1
    ear = np.isin(lab, order[:1])
    tusks = [lab == i for i in order[1:3]]
    tusks.sort(key=lambda m: np.where(m)[1].mean())          # near (left) first
    return a, ear, tusks


def tusk_layer(mo, head):
    """Tusks moved onto a face's mouth corners, clipped to that face so none float off it."""
    a, _, tusks = tusk_pieces()
    if len(tusks) < 2:
        return None
    out = np.zeros_like(a)
    # Near tusk only: the far tusk sits on the cheek silhouette in 3/4 view and can't be
    # placed convincingly by moving pixels (it needs to be painted per face).
    for m, corner_ref, corner in ((tusks[0], TUSK_REF_MOUTH[0], mo[0]),):
        dx, dy = corner - corner_ref, mo[2] - TUSK_REF_MOUTH[2]
        piece = a.copy()
        piece[~m, 3] = 0
        piece = np.roll(np.roll(piece, dy, 0), dx, 1)
        vis = piece[..., 3] > 0
        out[vis] = piece[vis]
    face = ndimage.binary_dilation(head[..., 3] > 0, iterations=2)
    out[~face, 3] = 0
    return out if (out[..., 3] > 0).any() else None


def main():
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    ASSETS.mkdir(parents=True)
    ref_skulls = {n: skull(keyed(SRC / f"{n}.png")) for n in ["aldric_bald_01", "human_f_bald_01", "aldric_bald_limekey"]}
    ref_skulls["male_base"] = skull(keyed(ROOT / "art" / "template" / "male_base.png"))
    ref_skulls["female_base"] = skull(keyed(ROOT / "art" / "template" / "female_base.png"))

    faces = []
    for fid, fname, label, tpl, races in FACES:
        a = keyed(SRC / f"{fname}.png")
        a_orig = a          # the painted ear lives here; the head itself is earless when available
        el = ROOT / "art/incoming/earless" / f"{fid}.png"
        earless_ok = el.exists() and (PARTS / "ears_human" / f"ears_human_{fid}.png").exists()
        if earless_ok:
            a = keyed(el)
        head = a.copy()
        head[~head_mask(a, TEMPLATES[tpl]["cut"]), 3] = 0
        if fid in BROWS:  # neutralise faint blue brow edges left on the face under the brow layer
            h, sat, _ = _hsv(head)
            tint = (h >= 125) & (h <= 275) & (sat > 0.1)   # teal (lime/blue blend) through blue
            tint[300:] = False
            sk = skull(head)
            tint[sk[0] + 120:sk[0] + 260, sk[1]:] &= ~((h >= 195) & (h <= 275))[sk[0] + 120:sk[0] + 260, sk[1]:]  # keep blue irises
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
        if fid in BLOCKED_RACES:
            extra["blocked_races"] = BLOCKED_RACES[fid]
        if races is None:  # generic face: tusks placed on THIS face's mouth corners
            from mouth import mouth
            top, cx = skull(a)[:2]
            mo = MOUTH_OVERRIDE.get(fid) or mouth(a, top, cx)
            if mo:
                extra["mouth"] = mo
                # Moved tusks read as stickers (reviewed 2026-10-10); tusks must be painted
                # per face (blue-key edit, extracted like hair). Kept off until then.
                tusks = tusk_layer(mo, head) if TRANSPLANT_TUSKS else None
            painted = PARTS / "tusks" / f"tusks_{fid}.png"   # per-face tusks from the batch sheet
            if painted.exists():
                tusks = np.asarray(Image.open(painted).convert("RGBA")).copy()
                if tusks is not None:
                    extra["tusks"] = save_part(tusks, f"tusks_{fid}")
        hf = PARTS / "ears_human" / f"ears_human_{fid}.png"   # own ear, drawn over hair for humans
        if hf.exists():   # orange edit = WHERE the ear is; pixels = the face's own painted ear
            em = np.asarray(Image.open(hf).convert("RGBA"))[..., 3] > 0
            em = ndimage.binary_fill_holes(em)
            _, _, ev = _hsv(a_orig)   # grow only onto the ear's own dark outline, never onto skin
            em |= ndimage.binary_dilation(em, iterations=4) & (ev < 0.35)
            em = ndimage.binary_erosion(em, iterations=1) | (em & (ev < 0.35))
            eh, es, _ = _hsv(a_orig)
            em &= (a_orig[..., 3] > 0) & ~((eh >= 270) & (eh <= 345) & (es > 0.2) & (ev > 0.5))   # magenta edge bleed
            ear_px = a_orig.copy()
            ear_px[~em, 3] = 0
            extra["ear_human"] = save_part(ear_px, f"ear_human_{fid}", True, hue_lo=40, reach=12, eyes="none")
        for rk in ("elf", "goblin"):   # per-face painted race ears (batch sheet) + old-ear cut
            ef = PARTS / f"ears_{rk}" / f"ears_{rk}_{fid}.png"
            if ef.exists():
                ea = np.asarray(Image.open(ef).convert("RGBA")).copy()
                ca = np.asarray(Image.open(PARTS / f"ears_{rk}" / f"cut_{fid}.png").convert("RGBA")).copy()
                ent = {"part": save_part(ea, f"ears_{rk}_{fid}", True, hue_lo=40, reach=12, eyes="none")}
                if earless_ok:   # clean earless head underneath: nothing to cut or patch
                    extra.setdefault("race_ears", {})[rk] = ent
                    continue
                if (ca[..., 3] > 0).any():
                    ent["cut"] = save_part(ca, f"earcut_{rk}_{fid}")
                pa = np.asarray(Image.open(PARTS / f"ears_{rk}" / f"patch_{fid}.png").convert("RGBA")).copy()
                if (pa[..., 3] > 0).any():
                    ent["patch"] = save_part(pa, f"earpatch_{rk}_{fid}", True, hue_lo=40, reach=12, eyes="none", all_skin=True)
                extra.setdefault("race_ears", {})[rk] = ent
        if fid in NO_BEARD:
            extra["blocked_beard"] = [b[0] for b in BEARDS]
        elif fid in BLOCKED_BEARD:
            extra["blocked_beard"] = BLOCKED_BEARD[fid]
        faces.append({**extra, "id": fid, "label": label, "template": tpl, "group": tpl, "skull": skull(a), "races": races,
                      "lime": True, "part": save_part(head, f"head_{fid}", True, hue_lo=40, reach=12, eyes=True)})
        fe = faces[-1]
        if fe.get("ear_human", {}).get("key_lab") and fe["part"].get("key_lab"):
            fe["ear_human"]["key_lab"] = fe["part"]["key_lab"]   # recolour exactly like the face

    bodies = []
    for bid, fname, label, tpl, hem in BODIES:
        a = keyed(SRC / f"{fname}.png")
        cut = TEMPLATES[tpl]["cut"]
        hm = head_mask(a, cut)
        # back: the donor's own neck stump, drawn behind the head to fill any gap
        back = a.copy()
        # the donor's whole neck opening below the chin (skin + shadows + lining), so V-necks
        # never show background; starts a little below the cut so the donor chin can't poke out
        stump = hm.copy()
        stump[:cut + 12] = False
        back[~stump, 3] = 0
        # front: everything that isn't the donor's head (collars, hoods, armour, hands)
        front = a.copy()
        drop = ndimage.binary_dilation(hm, iterations=1)
        drop[:cut - 20] |= ndimage.binary_dilation(hm, iterations=6)[:cut - 20]  # face edge: nose/lash tips
        front[drop, 3] = 0
        entry = {"id": bid, "label": label, "template": tpl, "lime": True,
                 "part": save_part(front, f"body_{bid}", True, min_skin=1500)}
        if stump.any():
            entry["back"] = save_part(back, f"body_{bid}_back", True)
        cfg = ANIM["outfits"].get(bid)
        if cfg and tpl in ANIM["templates"]:
            pivots = {}
            if cfg.get("markup"):
                import markup
                from anim_markup_rig import split_markup
                sections = markup.load(ROOT / cfg["markup"], front)
                pieces, anchors, pivots = split_markup(front, ANIM["templates"][tpl], cfg["belt"],
                                                       sections, cfg.get("keep_torso"))
            elif cfg.get("armless"):
                from anim_auto_rig import split_auto
                armless = keyed(ROOT / cfg["armless"])
                pieces, anchors, pivots = split_auto(front, armless, cfg["belt"], cfg["hem"], cfg["knee"],
                                                     [skull(a)[1], TEMPLATES[tpl]["cut"]], cfg.get("shift"), cfg.get("foot_split"))
            else:
                pieces, anchors = anim_rig.split(front, ANIM["templates"][tpl], cfg["hem"], cfg["belt"],
                                                 cfg.get("leg_seam"), cfg.get("keep_torso"))
            entry["anim"] = {"profile": cfg["profile"], "anchors": anchors, "pivots": pivots,
                             "pieces": {k: save_part(v, f"anim_{bid}_{k}", True, min_skin=1500)  # stray greenish armour px are not skin
                                        for k, v in pieces.items() if (v[..., 3] > 0).any()}}
        if tpl in RIG:
            entry["rig"] = {k: save_part(v, f"body_{bid}_{k}", True)
                            for k, v in split_rig(front, RIG[tpl], hem).items() if (v[..., 3] > 0).any()}
        bodies.append(entry)

    ears = {}
    for e in EARS:
        a = np.asarray(Image.open(PARTS / "ears" / f"ears_{e}.png").convert("RGBA")).copy()
        if e == "ogre":  # tusks live on each face now (tusk_layer); keep only the ear here
            _, ear, _ = tusk_pieces()
            a[~ear, 3] = 0
        ears[e] = {"ref_skull": ref_skulls["aldric_bald_limekey"], "part": save_part(a, f"ears_{e}", True, hue_lo=40)}

    hairs = []
    for hid, label, fits, ref, *shift in HAIRS:
        a = np.asarray(Image.open(PARTS / "hair" / f"hair_{hid}.png").convert("RGBA")).copy()
        ry, rx = ref_skulls[ref]
        entry = {"id": hid, "label": label, "fits": fits, "ref_skull": [ry, rx - (shift[0] if shift else 0)],
                 "lum": lum_range(a), "part": save_part(a, f"hair_{hid}")}
        tf = PARTS / "hair" / f"hair_{hid}_ties.png"   # ties / bands keep their own colour
        if tf.exists():
            entry["ties"] = save_part(np.asarray(Image.open(tf).convert("RGBA")).copy(), f"hair_{hid}_ties")
        for rk in ("elf", "goblin"):   # hair refitted around that race's ears (batch sheet)
            rf = PARTS / "hair" / f"hair_{hid}_{rk}.png"
            if rf.exists():
                ra = np.asarray(Image.open(rf).convert("RGBA")).copy()
                entry.setdefault("race_versions", {})[rk] = {
                    "ref_skull": ref_skulls["female_base" if "f" in fits else "male_base"], "lum": lum_range(ra), "part": save_part(ra, f"hair_{hid}_{rk}")}
        if "race_versions" not in entry:
            fill = hair_ear_fill(a, ry, rx, ref_skulls["male_base"])
            if fill is not None:
                entry["earfill"] = save_part(fill, f"hair_{hid}_earfill")
        hairs.append(entry)

    beards = []
    for bid, label, ref in BEARDS:
        a = np.asarray(Image.open(PARTS / "beards" / f"beard_{bid}.png").convert("RGBA")).copy()
        beards.append({"id": bid, "label": label, "ref_skull": ref_skulls[ref],
                       "lum": lum_range(a), "part": save_part(a, f"beard_{bid}")})

    skins = {k: {"rgb": list(v), "lab": [round(float(x), 2) for x in rgb2lab(np.array([[v]], float))[0, 0]]}
             for k, v in SKINS.items()}

    for f in faces:   # jaw line: face above it is drawn in front of outfits
        f["jaw_y"] = TEMPLATES[f["template"]]["cut"] - 30
    manifest = {"version": int(time.time()), "canvas": [1024, 1536], "floor_y": 1510, "races": RACES, "skins": skins,
                "rig": {k: v["pivots"] for k, v in RIG.items()}, "anim": {k: v for k, v in ANIM.items() if k != "_doc"}, "faces": faces, "bodies": bodies, "ears": ears, "hairs": hairs, "beards": beards, "hair_colours": HAIR_COLOURS}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(faces)} faces, {len(bodies)} bodies, {len(ears)} ears, {len(hairs)} hairs, {len(skins)} skins")


if __name__ == "__main__":
    main()

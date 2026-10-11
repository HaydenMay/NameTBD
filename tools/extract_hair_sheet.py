"""Extract refitted blue hair from a hair sheet (tools/hair_sheet.py) into per-race hair
versions on the male_base canvas: art/parts/hair/hair_<id>_<race>.png
Usage: python tools/extract_hair_sheet.py elf art/sheets/hair_m_elf_refit.png"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402
from extract_hair import defringe  # noqa: E402
from skin import _hsv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
race, edited = sys.argv[1], sys.argv[2]
cells = json.loads((ROOT / f"art/sheets/hair_m_{race}.json").read_text())
e = np.asarray(Image.open(edited).convert("RGBA")).copy()
h, s, v = _hsv(e)
blue = (h >= 190) & (h <= 260) & (s > 0.35) & (v > 0.15)
base = bp.keyed(ROOT / "art/template/male_base.png")
bh, bs, _ = _hsv(base)
top, cx = bp.skull(base)[:2]
brows = (bh >= 190) & (bh <= 260) & (bs > 0.35)
brows[top + 190:] = False
brows = ndimage.binary_dilation(brows, iterations=4)
for c in cells:
    X, Y = c["sheet_xy"]
    W, H = c["size"]
    sx, sy = c["src_xy"]
    m = blue[Y:Y + H, X:X + W].copy()
    m &= ~brows[sy:sy + H, sx:sx + W]                        # brows are blue too: not hair
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, 1 + np.flatnonzero(sizes >= 40))
    m |= ndimage.binary_dilation(m, iterations=2) & (v[Y:Y + H, X:X + W] < 0.35)   # outline
    # the hair's outline traced along the BASE ear edge would show as a dark line on faces whose
    # ear sits a few px differently; drop dark pixels hugging that ear (each face's ear has its own outline)
    ear = np.asarray(Image.open(ROOT / "art/parts" / f"ears_{race}" / f"ears_{race}_aldric.png"))[..., 3] > 0
    near_ear = ndimage.binary_dilation(ear, iterations=7)[sy:sy + H, sx:sx + W]
    m &= ~(near_ear & (v[Y:Y + H, X:X + W] < 0.4))
    canvas = np.zeros((1536, 1024, 4), np.uint8)
    piece = e[Y:Y + H, X:X + W].copy()
    piece[~m, 3] = 0
    canvas[sy:sy + H, sx:sx + W] = piece
    # ChatGPT painted the hair to stop at the BASE ear's edge, leaving an ear-shaped channel.
    # Fill hair under the upper (blade) part of that ear: ears draw on top, so it only shows
    # where a face's own ear sits lower and would otherwise leave a gap.
    ys_e = np.where(ear.any(1))[0]
    blade = ear.copy()
    blade[ys_e.min() + int(0.65 * (ys_e.max() - ys_e.min())):] = False
    blade = ndimage.binary_dilation(blade, iterations=4)
    hv = canvas[..., 3] > 0
    hole = blade & ~hv & ndimage.binary_dilation(hv, iterations=45)
    if hole.any():
        src = hv & (canvas[..., :3].max(2) > 70)
        idx = ndimage.distance_transform_edt(~src, return_distances=False, return_indices=True)
        canvas[hole] = canvas[idx[0][hole], idx[1][hole]]
        canvas[hole, 3] = 255
    # strands painted over the base ear's lower half (lobe) peek out on faces whose ear differs
    lobe = ear.copy()
    lobe[: ys_e.min() + int(0.55 * (ys_e.max() - ys_e.min()))] = False
    lobe = ndimage.binary_dilation(lobe, iterations=5)
    canvas[lobe, 3] = 0
    Image.fromarray(defringe(canvas)).save(ROOT / "art/parts/hair" / f"hair_{c['id']}_{race}.png")
    print(c["label"], int(m.sum()))

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
    canvas = np.zeros((1536, 1024, 4), np.uint8)
    piece = e[Y:Y + H, X:X + W].copy()
    piece[~m, 3] = 0
    canvas[sy:sy + H, sx:sx + W] = piece
    Image.fromarray(defringe(canvas)).save(ROOT / "art/parts/hair" / f"hair_{c['id']}_{race}.png")
    print(c["label"], int(m.sum()))

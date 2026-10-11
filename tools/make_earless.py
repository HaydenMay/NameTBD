"""Earless base faces from a batch 'remove the ear' edit of a face sheet. Only the area
around the old human ear is taken from the edit (the rest of the face stays untouched).
Usage: python tools/make_earless.py art/sheets/faces_f.json art/sheets/faces_f_earless.png
Writes art/incoming/earless/<face>.png"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet_align import register  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
cells = json.loads(Path(sys.argv[1]).read_text())
orig_sheet = np.asarray(Image.open(Path(sys.argv[1]).with_suffix(".png")).convert("RGB")).astype(int)
e_img = Image.open(sys.argv[2]).convert("RGB")
e = np.asarray(e_img).astype(int)
out = ROOT / "art/incoming/earless"
out.mkdir(parents=True, exist_ok=True)
for c in cells:
    X, Y = c["sheet_xy"]
    W, H = c["size"]
    sx, sy = c["src_xy"]
    dx, dy, err = register(orig_sheet[Y:Y + H, X:X + W], e, X, Y, W, H)
    cell = np.asarray(e_img.crop((X + dx, Y + dy, X + dx + W, Y + dy + H)))
    src = np.asarray(Image.open(ROOT / c["src"]).convert("RGB")).copy()
    ear = np.asarray(Image.open(ROOT / "art/parts/ears_human" / f"ears_human_{c['id']}.png"))[..., 3] > 0
    zone = ndimage.binary_dilation(ndimage.binary_fill_holes(ear), iterations=14)
    zc = zone[sy:sy + H, sx:sx + W]
    region = src[sy:sy + H, sx:sx + W]
    region[zc] = cell[zc]
    Image.fromarray(src).save(out / f"{c['id']}.png")
    print(c["label"], f"shift ({dx},{dy}) err {err:.1f}")

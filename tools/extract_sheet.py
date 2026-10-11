"""Extract an orange-keyed part (e.g. tusks) from a batch-edited face sheet and map each
cell back onto its full-size face canvas, recoloured with a gradient ramp.

Usage: python tools/extract_sheet.py art/sheets/faces_m.json EDITED.png tusks
Writes art/parts/<kind>/<kind>_<face>.png (1024x1536, canvas-aligned).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recolor import gradient_map  # noqa: E402
from skin import _hsv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAMPS = {"tusks": [(70, 58, 42), (176, 160, 124), (228, 216, 184), (252, 246, 228)]}


def main(cells_json, edited, kind):
    cells = json.loads(Path(cells_json).read_text())
    e = np.asarray(Image.open(edited).convert("RGBA")).copy()
    h, s, v = _hsv(e)
    orig = np.asarray(Image.open(Path(cells_json).with_suffix(".png")).convert("RGB")).astype(int)
    changed = np.abs(e[..., :3].astype(int) - orig).sum(2) > 90
    key = (h >= 0) & (h <= 48) & (s > 0.55) & (v > 0.45) & changed
    out_dir = ROOT / "art" / "parts" / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    for c in cells:
        X, Y = c["sheet_xy"]
        W, H = c["size"]
        m = np.zeros(key.shape, bool)
        m[Y:Y + H, X:X + W] = key[Y:Y + H, X:X + W]
        lab, n = ndimage.label(m)
        if n:
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            m = np.isin(lab, 1 + np.flatnonzero(sizes >= 25))
        m = ndimage.binary_closing(m, iterations=1)
        m |= ndimage.binary_dilation(m, iterations=2) & (v < 0.35)   # painted outline
        piece = e.copy()
        piece[~m, 3] = 0
        canvas = np.zeros((1536, 1024, 4), np.uint8)
        sx, sy = c["src_xy"]
        canvas[sy:sy + H, sx:sx + W] = piece[Y:Y + H, X:X + W]
        img = gradient_map(Image.fromarray(canvas), RAMPS.get(kind, RAMPS["tusks"]))
        img.save(out_dir / f"{kind}_{c['id']}.png")
        print(c["label"], int(m.sum()), "px")


if __name__ == "__main__":
    main(*sys.argv[1:4])

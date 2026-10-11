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
RAMPS = {"tusks": [(70, 58, 42), (176, 160, 124), (228, 216, 184), (252, 246, 228)],
         # skin parts go back to the lime key so they recolour exactly like the face
         "lime": [(28, 30, 12), (120, 160, 24), (178, 222, 52), (226, 248, 140)]}


def main(cells_json, edited, kind):
    cells = json.loads(Path(cells_json).read_text())
    e = np.asarray(Image.open(edited).convert("RGBA")).copy()
    h, s, v = _hsv(e)
    orig = np.asarray(Image.open(Path(cells_json).with_suffix(".png")).convert("RGB")).astype(int)
    changed = np.abs(e[..., :3].astype(int) - orig).sum(2) > 90
    key = (((h >= 0) & (h <= 48)) | (h >= 340)) & (s > 0.5) & (v > 0.22) & changed   # incl. dark inner-ear shading
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
        m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2))
        m |= ndimage.binary_dilation(m, iterations=2) & (v < 0.35)   # painted outline
        piece = e.copy()
        piece[~m, 3] = 0
        canvas = np.zeros((1536, 1024, 4), np.uint8)
        sx, sy = c["src_xy"]
        canvas[sy:sy + H, sx:sx + W] = piece[Y:Y + H, X:X + W]
        img = gradient_map(Image.fromarray(canvas), RAMPS["lime" if kind.startswith("ears") else "tusks"])
        img.save(out_dir / f"{kind}_{c['id']}.png")
        if kind.startswith("ears"):
            # old human ear pixels the edit erased to background: cut them from the face
            bg = (e[..., 0] > 200) & (e[..., 1] < 90) & (e[..., 2] > 200)
            cut = changed & bg
            cut[:, X + 130:] = False
            cut[:Y + 100] = False
            cut[Y + 310:] = False
            cut = ndimage.binary_dilation(cut, iterations=2)
            cmask = np.zeros((1536, 1024, 4), np.uint8)
            cmask[sy:sy + H, sx:sx + W, 3] = cut[Y:Y + H, X:X + W] * 255
            Image.fromarray(cmask).save(out_dir / f"cut_{c['id']}.png")
            # skin the edit repainted over the old ear (lime key, recolours like the face)
            zone = np.zeros_like(changed)
            zone[Y + 90:Y + 330, X:X + 150] = True
            warm = ((h <= 50) | (h >= 330)) & (s > 0.35)          # leftover ear colour: never copy raw
            rep = changed & ~bg & ~m & zone & ~(v < 0.12) & ~warm
            rep = ndimage.binary_opening(rep, iterations=1)
            rep = ndimage.binary_closing(rep, iterations=3) & ~bg & ~m
            pmask = np.zeros((1536, 1024, 4), np.uint8)
            pmask[sy:sy + H, sx:sx + W, :3] = e[Y:Y + H, X:X + W, :3]
            pmask[sy:sy + H, sx:sx + W, 3] = rep[Y:Y + H, X:X + W] * 255
            Image.fromarray(pmask).save(out_dir / f"patch_{c['id']}.png")
        print(c["label"], int(m.sum()), "px")


if __name__ == "__main__":
    main(*sys.argv[1:4])

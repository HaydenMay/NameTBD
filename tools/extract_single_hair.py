"""One full-size hair edit (not a sheet) -> art/parts/hair/hair_<name>.png (+ _ties.png).

The edit is a ChatGPT edit of the female/male base: blue hair, orange key for ties. The head
is re-registered against the base by its face outline, then the same masks as sheet_align.
Usage: python tools/extract_single_hair.py f3 f art/incoming/hair_single/f3.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_hair import defringe  # noqa: E402
from recolor import gradient_map  # noqa: E402
from sheet_align import face_edges  # noqa: E402
from skin import _hsv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BASES = {"f": "female_base", "m": "male_base"}


def register(base, edit, pad=30):
    so = face_edges(base)
    so[:150] = False
    so[330:] = False
    ys, xs = np.where(so)
    d = ndimage.distance_transform_edt(~face_edges(edit))
    best = None
    for dx in range(-pad, pad + 1):
        for dy in range(-pad, pad + 1):
            err = np.clip(d[np.clip(ys + dy, 0, d.shape[0] - 1), np.clip(xs + dx, 0, d.shape[1] - 1)], 0, 12).mean()
            if best is None or err < best[0]:
                best = (err, dx, dy)
    return best[1], best[2], best[0]


def main(name, tpl, edited):
    base = np.asarray(Image.open(ROOT / "art/template" / f"{BASES[tpl]}.png").convert("RGB"))
    e = np.asarray(Image.open(edited).convert("RGB"))
    dx, dy, err = register(base.astype(int), e.astype(int))
    e = np.roll(np.roll(e, -dy, 0), -dx, 1)                   # edit back onto the base canvas
    a = np.dstack([e, np.full(e.shape[:2], 255, np.uint8)])
    h, s, v = _hsv(a)
    bh, bs, _ = _hsv(base)
    blue = (h >= 190) & (h <= 260) & (s > 0.62) & (v > 0.15)
    brows = ndimage.binary_dilation((bh >= 190) & (bh <= 260) & (bs > 0.35), iterations=4)
    m = blue & ~brows
    m[600:] = False                                           # hair never reaches the robe
    m |= ndimage.binary_dilation(m, iterations=2) & (v < 0.35)
    lab, n = ndimage.label(m)
    if n:
        sz = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, 1 + np.flatnonzero(sz >= max(300, 0.01 * sz.max())))
    holes = ndimage.binary_fill_holes(m) & ~m                 # highlight specks inside the hair
    mag = (a[..., 0] > 200) & (a[..., 1] < 90) & (a[..., 2] > 200)
    hl, hn = ndimage.label(holes)
    if hn:
        hs = ndimage.sum(holes, hl, range(1, hn + 1))
        hm = ndimage.maximum(mag, hl, range(1, hn + 1))
        m |= np.isin(hl, 1 + np.flatnonzero((hs < 400) & ~hm.astype(bool)))
    orange = (h >= 15) & (h <= 40) & (s > 0.6) & (v > 0.6)
    ol, on = ndimage.label(orange)
    keep = []
    for i in range(1, on + 1):                                # a tie is mostly wrapped in hair
        comp = ol == i
        ring = ndimage.binary_dilation(comp, iterations=4) & ~comp
        if comp.sum() >= 40 and (m & ring).sum() / max(ring.sum(), 1) > 0.35:
            keep.append(i)
    tie = np.isin(ol, keep)
    if tie.any():
        tie |= ndimage.binary_dilation(tie, iterations=2) & (v < 0.35)
        m &= ~tie
    hair = a.copy()
    hair[~m, 3] = 0
    out = ROOT / "art/parts/hair"
    Image.fromarray(defringe(hair)).save(out / f"hair_{name}.png")
    tpath = out / f"hair_{name}_ties.png"
    if tie.any():
        t = a.copy()
        t[~tie, 3] = 0
        gradient_map(Image.fromarray(t), [(28, 16, 8), (92, 56, 30), (150, 98, 54), (214, 168, 110)]).save(tpath)
    elif tpath.exists():
        tpath.unlink()
    print(f"{name}: shift ({dx},{dy}) fit err {err:.1f}px, hair {m.sum()} px, tie {tie.sum()} px")


if __name__ == "__main__":
    main(*sys.argv[1:4])

"""Extract a blue-keyed part (hair, brows) by colour alone, for edits where ChatGPT
redrew the whole image so a before/after diff doesn't isolate it.

Usage: python tools/extract_by_hue.py SRC.png OUT.png --ylimit 345 [--smin 0.45]
"""
import argparse

import numpy as np
from PIL import Image
from scipy import ndimage

from extract_hair import defringe
from skin import _hsv


def extract(src, out, ylimit, smin=0.45, hue=(195, 255), min_comp=40):
    a = np.asarray(Image.open(src).convert("RGBA")).copy()
    h, s, v = _hsv(a)
    m = (h >= hue[0]) & (h <= hue[1]) & (s > smin) & (v > 0.2)
    m[ylimit:] = False
    labels, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, labels, range(1, n + 1))
        m = np.isin(labels, 1 + np.flatnonzero(sizes >= min_comp))
    # include the dark outline / soft edge hugging the part
    dark = a[..., :3].max(2) < 110
    m |= ndimage.binary_dilation(m, iterations=2) & (dark | ((h >= 180) & (h <= 270) & (s > 0.2)))
    m[ylimit:] = False
    a[~m, 3] = 0
    Image.fromarray(defringe(a)).save(out)
    return int(m.sum())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--ylimit", type=int, required=True)
    ap.add_argument("--smin", type=float, default=0.45)
    a = ap.parse_args()
    print("px", extract(a.src, a.out, a.ylimit, a.smin))

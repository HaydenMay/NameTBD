"""Beard cut cleanup: keep only blue hair plus the beard's OUTER outline.

A beard surrounds the mouth, so the hair cut also captures the base man's lips and
mouth line. Those must not be pasted onto other faces. Keeps: blue-keyed pixels, and
dark outline pixels on the beard's outside edge. Drops: everything enclosed that isn't
blue (lips, mouth line, skin showing through).

Usage: python tools/clean_beard.py IN.png OUT.png
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

from skin import _hsv


def clean(src, out):
    a = np.asarray(Image.open(src).convert("RGBA")).copy()
    k = a[..., 3] > 0
    h, s, v = _hsv(a)
    blue = k & (h >= 180) & (h <= 270) & (s > 0.2)
    outside = ~ndimage.binary_fill_holes(k)
    outer_ring = k & ndimage.binary_dilation(outside, iterations=3)
    dark = v < 0.35
    keep = blue | (outer_ring & dark & ndimage.binary_dilation(blue, iterations=3))
    keep = ndimage.binary_closing(keep, iterations=1) & k
    a[~keep, 3] = 0
    Image.fromarray(a).save(out)
    return int(k.sum()), int(keep.sum())


if __name__ == "__main__":
    print("kept %d of %d px" % clean(sys.argv[1], sys.argv[2])[::-1])

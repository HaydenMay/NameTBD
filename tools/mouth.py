"""Find a face's mouth line (left corner x, right corner x, y) for anchoring tusks.

The mouth is the widest locally-dark horizontal stroke in the lower face, preferring
strokes near the expected mouth height (skull top + 212 px on the shared base)."""
import numpy as np
from scipy import ndimage

from skin import _hsv

EXPECT_DY = 212


def mouth(a, top, cx):
    h, s, v = _hsv(a)
    box = np.zeros(v.shape, bool)
    box[top + 185:top + 255, cx - 20:cx + 130] = True
    vb = ndimage.uniform_filter(v, 15)
    dark = box & (vb - v > 0.07) & (a[..., 3] > 0) & (h < 120)
    lab, n = ndimage.label(ndimage.binary_closing(dark, structure=np.ones((3, 7))))
    best = None
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        w, hgt, yc = xs.max() - xs.min(), ys.max() - ys.min(), np.median(ys)
        if w >= 30 and hgt <= w * 0.6 and abs(yc - (top + EXPECT_DY)) < 22:
            sc = w - hgt - 4 * abs(yc - (top + EXPECT_DY))
            if best is None or sc > best[0]:
                best = (sc, int(xs.min()), int(xs.max()), int(yc))
    return list(best[1:]) if best else None

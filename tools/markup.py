"""Read a hand-drawn section markup (coloured outlines drawn over an outfit image) and
return filled masks per section. Strokes are found by difference from the clean image,
classified by hue, gap-closed and hole-filled, then split into near/far by side.

Colour -> section (knight markup): orange upper arm, green forearm+hand,
yellow thigh, red lower leg. Unmarked = body.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

from skin import _hsv

HUES = {  # name: (hue lo, hue hi, sat min, val min, val max)
    "upper_arm": (18, 42, 0.55, 0.55, 1.0),
    "forearm": (75, 150, 0.30, 0.25, 0.85),
    "thigh": (44, 68, 0.45, 0.70, 1.0),
    "leg": (0, 16, 0.55, 0.45, 1.0),
}
SPLIT_X = {"upper_arm": 512, "forearm": 512, "thigh": 517, "leg": 517}


def strokes(m, clean_rgba):
    diff = np.abs(m.astype(int) - clean_rgba[..., :3].astype(int)).sum(2) > 120
    h, s, v = _hsv(m)
    out = {}
    for name, (lo, hi, smin, vmin, vmax) in HUES.items():
        hue = (h >= lo) & (h <= hi)
        if name == "leg":
            hue |= h >= 345
        k = diff & hue & (s > smin) & (v > vmin) & (v <= vmax)
        lab, n = ndimage.label(k)
        if n:  # drop specks (jpeg noise, art that happens to match)
            sizes = ndimage.sum(k, lab, range(1, n + 1))
            k = np.isin(lab, 1 + np.flatnonzero(sizes >= 60))
        out[name] = k
    return out


def load(markup_path, clean_rgba, close=25):
    m = np.asarray(Image.open(markup_path).convert("RGB"))
    vis = clean_rgba[..., 3] > 0
    xx = np.arange(m.shape[1])[None, :]
    out = {}
    for name, k in strokes(m, clean_rgba).items():
        closed = ndimage.binary_closing(ndimage.binary_dilation(k, iterations=4), iterations=close)
        filled = ndimage.binary_fill_holes(closed) & vis
        for side, half in (("n", xx < SPLIT_X[name]), ("f", xx >= SPLIT_X[name])):
            part = filled & half
            lab, n = ndimage.label(part)
            if n:
                sizes = ndimage.sum(part, lab, range(1, n + 1))
                part = np.isin(lab, 1 + np.flatnonzero(sizes >= 3000))
            if part.sum():
                out[f"{name}_{side}"] = part
    return out

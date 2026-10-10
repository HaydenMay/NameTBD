"""Gradient-map recolouring for greyscale-able painted parts (hair, beards, later skin/cloth).

The part's own luminance range is normalised to 0..1, then mapped through a
colour ramp. Dark outlines land on the ramp's shadow end, highlights on the top,
so painted shading survives while the hue changes. The same maths becomes a
shader in Unity.
"""
import numpy as np
from PIL import Image

# shadow -> mid -> light -> highlight
HAIR_RAMPS = {
    "black":  [(14, 11, 14), (38, 32, 36), (78, 68, 72), (150, 140, 150)],
    "brown":  [(30, 16, 10), (88, 52, 28), (140, 92, 52), (205, 160, 110)],
    "auburn": [(40, 12, 8), (120, 42, 22), (178, 80, 40), (230, 150, 100)],
    "ginger": [(60, 18, 6), (170, 62, 18), (222, 110, 40), (250, 180, 110)],
    "blond":  [(70, 40, 12), (190, 140, 50), (235, 195, 90), (255, 240, 180)],
    "silver": [(40, 40, 46), (130, 130, 140), (195, 195, 205), (245, 245, 250)],
}


def luminance(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def gradient_map(img, ramp, lo_pct=2, hi_pct=99):
    a = np.asarray(img.convert("RGBA")).astype(float)
    vis = a[..., 3] > 0
    lum = luminance(a[..., :3])
    lo, hi = np.percentile(lum[vis], [lo_pct, hi_pct])
    t = np.clip((lum - lo) / max(hi - lo, 1), 0, 1)
    stops = np.array(ramp, float)
    pos = np.linspace(0, 1, len(stops))
    out = a.copy()
    for c in range(3):
        out[..., c] = np.interp(t, pos, stops[:, c])
    return Image.fromarray(out.astype(np.uint8))

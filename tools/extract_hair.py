"""Lifts a hairstyle off a character by diffing it against the same character bald.

Both images must be same-chat ChatGPT edits of one source, so everything except
the hair lines up. Thin redraw noise (outlines that shifted a pixel) is removed
with a morphological opening and a minimum component size.

Usage:
  python tools/extract_hair.py HAIRED.png BALD.png OUT.png [--ylimit 560]
"""
import argparse

import numpy as np
from PIL import Image
from scipy import ndimage

DIFF_THRESHOLD = 80     # summed RGB difference that counts as "changed"
OPEN_RADIUS = 2         # removes 1-4 px wide outline noise
MIN_COMPONENT = 400     # px; smaller islands are noise
MIN_HAIR_FRACTION = 0.4 # components that are mostly not hair-coloured get dropped
SKIN_HUE = (0, 50)      # degrees; warm skin tones of the reference heads
HAIR_HUE = (20, 62)    # degrees; default = Aldric-blond sources (use --hue 195 255 for blue sources)


def is_background(a):
    return (a[..., 0] > 190) & (a[..., 1] < 90) & (a[..., 2] > 190)


def hair_mask(haired, bald, ylimit, hue=HAIR_HUE):
    diff = np.abs(haired[..., :3].astype(int) - bald[..., :3].astype(int)).sum(2)
    m = (diff > DIFF_THRESHOLD) & ~is_background(haired)
    m[ylimit:] = False
    st = ndimage.generate_binary_structure(2, 1)
    m = ndimage.binary_opening(m, st, iterations=OPEN_RADIUS)
    m = ndimage.binary_closing(m, st, iterations=3)
    m = ndimage.binary_fill_holes(m)
    labels, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, labels, range(1, n + 1))
        hairy = ndimage.mean(hair_coloured(haired, hue), labels, range(1, n + 1))
        ok = (sizes >= MIN_COMPONENT) & (hairy >= MIN_HAIR_FRACTION)
        m = m & np.isin(labels, 1 + np.flatnonzero(ok))
    # Drop non-hair pixels (armor, skin) unless they're the dark outline hugging the hair.
    hc = hair_coloured(haired, hue)
    dark = haired[..., :3].max(2) < 90
    near_hair = ndimage.binary_dilation(hc & m, iterations=4)
    gated = m & (hc | (dark & near_hair))
    # Re-close: gating punches holes where strands are pale/desaturated.
    gated = ndimage.binary_closing(gated, st, iterations=4)
    filled = ndimage.binary_fill_holes(gated) & m
    # Hole filling re-adds ears enclosed by hair. When the source hair hue can't be
    # confused with skin (e.g. blue), strip skin-hued pixels back out.
    if hue[0] > SKIN_HUE[1] or hue[1] < SKIN_HUE[0]:
        skin = hair_coloured(haired, SKIN_HUE)
        # ...and the ear's outline, which is dark, touches skin but not hair.
        ear_line = dark & ndimage.binary_dilation(skin, iterations=3) & ~ndimage.binary_dilation(hc, iterations=2)
        filled &= ~(skin | ear_line)
    return filled


def hair_coloured(a, hue_range=HAIR_HUE):
    """Pixels whose hue/saturation match the source hairstyle colour."""
    rgb = a[..., :3].astype(float) / 255
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = np.maximum(mx - mn, 1e-6)
    hue = np.select([mx == r, mx == g], [((g - b) / d) % 6, (b - r) / d + 2], (r - g) / d + 4) * 60
    return (hue >= hue_range[0]) & (hue <= hue_range[1]) & (sat > 0.25) & (mx > 0.25)


def defringe(a):
    """Pull magenta background bleed out of edge pixels."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    bleed = (r - g > 50) & (b - g > 50)
    out = a.copy()
    v = np.minimum(r, b)[bleed]
    out[bleed, 0] = np.minimum(g[bleed] + 20, v)
    out[bleed, 2] = np.minimum(g[bleed] + 10, v)
    return out


def extract(haired_path, bald_path, out_path, ylimit=560, hue=HAIR_HUE):
    haired = np.asarray(Image.open(haired_path).convert("RGBA")).copy()
    bald = np.asarray(Image.open(bald_path).convert("RGBA"))
    m = hair_mask(haired, bald, ylimit, hue)
    # 1px soft edge so the cut doesn't look jagged
    alpha = ndimage.gaussian_filter(m.astype(float), 0.7)
    haired[..., 3] = (np.clip(alpha * 1.4, 0, 1) * 255).astype(np.uint8)
    haired[~ndimage.binary_dilation(m, iterations=2), 3] = 0
    Image.fromarray(defringe(haired)).save(out_path)
    return int(m.sum())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("haired")
    ap.add_argument("bald")
    ap.add_argument("out")
    ap.add_argument("--ylimit", type=int, default=560)
    ap.add_argument("--hue", type=float, nargs=2, default=HAIR_HUE, help="source hair hue range in degrees, e.g. 200 250 for blue")
    a = ap.parse_args()
    print("hair px", extract(a.haired, a.bald, a.out, a.ylimit, tuple(a.hue)))

"""Skin-key masking and recolouring.

Skin is generated in a lime-green key colour. The mask is the lime region plus the
partly-lime edge pixels around it (where lime blends into outlines, brows, stubble);
recolouring shifts every masked pixel in Lab space so painted shading survives.
"""
import numpy as np
from scipy import ndimage

KEY_HUE = (50, 120)


def _hsv(a):
    rgb = a[..., :3].astype(float) / 255
    mx, mn = rgb.max(2), rgb.min(2)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.select([mx == r, mx == g], [((g - b) / d) % 6, (b - r) / d + 2], (r - g) / d + 4) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def skin_mask(a, region=None):
    h, s, v = _hsv(a)
    hue_ok = (h >= KEY_HUE[0]) & (h <= KEY_HUE[1])
    core = hue_ok & (s > 0.3) & (v > 0.15)
    if region is not None:
        core &= region
    core = ndimage.binary_closing(ndimage.binary_opening(core, iterations=1), iterations=2)
    # Edge pixels: any greenish tint, however faint, touching the core.
    near = ndimage.binary_dilation(core, iterations=4)
    edge = near & hue_ok & (s > 0.08)
    return core | edge


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_W = np.array([0.95047, 1, 1.08883])


def _lin(c):
    c = c / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255


def _f(t):
    return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)


def _fi(t):
    return np.where(t ** 3 > 0.008856, t ** 3, (t - 16 / 116) / 7.787)


def rgb2lab(rgb):
    xyz = _lin(rgb.astype(float)) @ _M.T / _W
    fx, fy, fz = _f(xyz[..., 0]), _f(xyz[..., 1]), _f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], -1)


def lab2rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    xyz = np.stack([_fi(fy + lab[..., 1] / 500), _fi(fy), _fi(fy - lab[..., 2] / 200)], -1) * _W
    return _gam(xyz @ np.linalg.inv(_M).T)


def recolour(a, mask, target_lab, chroma_keep=0.35):
    """Shift masked pixels so their mean becomes target_lab; keep lightness detail fully,
    keep a fraction of the chroma variation (blush, shadows) so it doesn't go flat."""
    lab = rgb2lab(a[..., :3])
    core_mean = lab[mask].mean(0)
    d = lab[mask] - core_mean
    new = np.empty_like(d)
    new[:, 0] = target_lab[0] + d[:, 0]
    new[:, 1:] = target_lab[1:] + d[:, 1:] * chroma_keep
    out = a.copy()
    out[mask, :3] = lab2rgb(new).clip(0, 255).astype(np.uint8)
    return out

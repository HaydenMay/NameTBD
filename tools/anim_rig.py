"""Walk-rig segmentation for outfit images (derived layers only; source art untouched).

Pieces (canvas-aligned RGBA, alpha 0 outside the piece):
  arm_n / arm_f   near / far arm, bounded by the painted outline, not a straight cut
  torso           everything else above the hem; holes behind the arms filled with the
                  nearest torso pixels (approximation of missing hidden art)
  skirt           torso below the belt (tabard / robe / jerkin hem), for cloth sway
  cap_n / cap_f   feathered copy of the shoulder, drawn over the arm to hide its top edge
  thigh_* / shin_* legs below the hem, overlapping at the knee
  hips            static underlay that fills any gap between swinging thighs
"""
import numpy as np
from scipy import ndimage

from skin import _hsv


def _arm_mask(a, vis, xx, yy, t, side):
    """Arm boundary per row, in priority order:
      1. a transparent gap between arm and body (the cleanest cut),
      2. the first painted dark outline scanning inward from the arm column,
      3. the fallback column line.
    The arm ends a little below the last row that still has a gap (the fist), so robe
    hems flaring into the arm column underneath are never taken with the arm."""
    _, _, v = _hsv(a)
    dark = (v < 0.26) & vis
    H, W = vis.shape
    x0 = t["arm_n_x"] if side == "n" else t["arm_f_x"]
    step = 1 if side == "n" else -1
    inner = range(x0 - 30 * step, x0 + 70 * step, step)   # scan from outside toward the body
    cuts, gap_rows = {}, []
    for y in range(t["arm_top"], t["arm_bottom"]):
        row_v, row_d = vis[y], dark[y]
        xs = [x for x in inner if 0 <= x < W]
        gap = next((x for x in xs if not row_v[x] and row_v[x - step]), None)
        if gap is not None:
            cuts[y] = gap - step
            gap_rows.append(y)
            continue
        d = next((x for x in xs if row_d[x]), None)
        if d is not None:
            while 0 <= d + step < W and row_d[d + step]:
                d += step
            cuts[y] = d
        else:
            cuts[y] = x0
    if len(gap_rows) > 20:  # below the last gap (fist touching body): hold that column
        last = gap_rows[-1]
        for y in cuts:
            if y > last:
                cuts[y] = cuts[last]
    m = np.zeros_like(vis)
    for y, c in cuts.items():
        if side == "n":
            m[y, :c + 1] = True
        else:
            m[y, c:] = True
    m = ndimage.binary_opening(m, iterations=2)
    return m & vis


def split(a, t, hem, belt):
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    vis = a[..., 3] > 0
    arm_n = _arm_mask(a, vis, xx, yy, t, "n")
    arm_f = _arm_mask(a, vis, xx, yy, t, "f") & ~arm_n
    leg_top = max(t["leg_top"], hem)
    legs = vis & (yy >= leg_top) & ~arm_n & ~arm_f
    torso = vis & ~legs & ~arm_n & ~arm_f
    near = xx < t["leg_split_x"]
    k = t["knee_y"]
    thigh_zone = vis & (yy >= leg_top - 60) & ~arm_n & ~arm_f
    regions = {
        "arm_n": arm_n, "arm_f": arm_f,
        "thigh_n": thigh_zone & near & (yy < k + 30), "shin_n": legs & near & (yy >= k - 30),
        "thigh_f": thigh_zone & ~near & (yy < k + 30), "shin_f": legs & ~near & (yy >= k - 30),
        "hips": vis & (yy >= t["leg_top"] - 100) & (yy < k - 20) & ~arm_n & ~arm_f,
    }
    if hem >= k:  # long robe: thighs are never visible, and copies of robe pixels would
        for n in ("thigh_n", "thigh_f", "hips"):   # peek out as the skirt sways
            regions[n] = np.zeros_like(vis)
    pieces = {}
    for name, m in regions.items():
        p = a.copy()
        p[~m, 3] = 0
        pieces[name] = p

    # torso with the arm holes filled from the nearest torso pixels
    tor = a.copy()
    tor[~torso, 3] = 0
    fill_f = np.zeros_like(a)
    for side, arm in (("n", arm_n), ("f", arm_f)):
        dst = tor if side == "n" else fill_f   # far fill goes BEHIND the far arm, never over it
        hole = arm & ndimage.binary_dilation(torso, iterations=45)
        hole[: t["arm_top"]] = False
        if hole.any():
            _, _, val = _hsv(a)
            src = torso & (val > 0.3)  # fill from body colour, never from outlines
            idx = ndimage.distance_transform_edt(~src, return_distances=False, return_indices=True)
            dst[hole] = a[idx[0][hole], idx[1][hole]]
            dst[hole, 3] = 255
    upper = tor.copy()
    upper[belt + 15:, :, 3] = 0
    skirt = tor.copy()
    skirt[: belt - 5, :, 3] = 0
    pieces["torso"] = upper
    pieces["skirt"] = skirt
    pieces["fill_f"] = fill_f

    # shoulder caps: static copy of the shoulder over the arm's top edge, feathered out
    c = t["cap"]
    ramp = np.clip((c["y1"] - yy) / c["feather"], 0, 1)
    for side, arm in (("n", arm_n), ("f", arm_f)):
        cap = a.copy()
        region = vis & (yy >= c["y0"]) & (yy < c["y1"]) & ndimage.binary_dilation(arm, iterations=6)
        alpha = (a[..., 3] * ramp * region).astype(np.uint8)
        cap[..., 3] = alpha
        pieces["cap_" + side] = cap

    # joint anchors measured from the pieces themselves
    anchors = {}
    for side, arm in (("n", arm_n), ("f", arm_f)):
        ys, xs = np.where(arm)
        if len(ys):
            low = ys > ys.max() - 90
            anchors["wrist_" + side] = [int(xs[low].mean()), int(ys.max() - 70)]
            anchors["grip_" + side] = [int(xs[low].mean()), int(ys.max() - 40)]
    return pieces, anchors

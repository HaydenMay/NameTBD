"""9-section walk rig from a hand-drawn markup (see tools/markup.py).

Sections per side: upper arm, forearm (+hand), thigh, lower leg; everything else is the
body. Forearm / lower-leg sections that weren't closed in the drawing are inferred as
"the rest of that limb" below the marked upper section. Joints (elbow, knee) are placed
where the drawn sections meet.
"""
import numpy as np
from scipy import ndimage

from anim_rig import _arm_mask
from skin import _hsv


def _meet(p, q, fallback):
    j = ndimage.binary_dilation(p, iterations=4) & ndimage.binary_dilation(q, iterations=4)
    ys, xs = np.where(j)
    return [int(xs.mean()), int(ys.mean())] if len(ys) > 20 else fallback


def split_markup(a, t, belt, sections, keep_torso=None):
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    vis = a[..., 3] > 0
    none = np.zeros_like(vis)
    keep = none.copy()
    if keep_torso:
        x0, x1, y1 = keep_torso
        keep = (xx >= x0) & (xx <= x1) & (yy < y1)

    limb, pivots = {}, {}
    for s in ("n", "f"):
        up = sections.get("upper_arm_" + s, none)
        whole = _arm_mask(a, vis, xx, yy, t, s) | up
        fa = sections.get("forearm_" + s)
        rest = whole & ~up
        if up.any():
            rest &= yy > np.where(up.any(1))[0].mean()
        if fa is None or fa.sum() < 0.3 * rest.sum():
            fa = rest
        fa = fa & ~up

        half = (xx < t["leg_split_x"]) if s == "n" else (xx >= t["leg_split_x"])
        th = sections.get("thigh_" + s, none) & ~keep & half & ~up & ~fa
        th_bottom = np.where(th.any(1))[0].max() if th.any() else t["knee_y"]
        lg = sections.get("leg_" + s)
        if lg is None or lg.sum() < 20000:
            lg = vis & half & (yy > th_bottom - 60) & ~keep
        lg = lg & ~th & ~up & ~fa

        limb.update({"arm_" + s: up, "farm_" + s: fa, "thigh_" + s: th, "shin_" + s: lg})
        pivots["elbow_" + s] = _meet(up, fa, [t["pivots"]["shoulder_" + s][0], 690])
        pivots["knee_" + s] = _meet(th, lg, t["pivots"]["knee_" + s])

    any_limb = none.copy()
    for m in limb.values():
        any_limb |= m
    torso = vis & ~any_limb

    pieces = {}
    for name, m in limb.items():
        p = a.copy()
        p[~m, 3] = 0
        pieces[name] = p

    # hidden body behind the arms: nearest non-outline body colour
    # (near-arm fill baked into the torso, far-arm fill drawn behind the far arm)
    _, _, val = _hsv(a)
    src = torso & (val > 0.3)
    idx = ndimage.distance_transform_edt(~src, return_distances=False, return_indices=True)
    tor = a.copy()
    tor[~torso, 3] = 0
    fill_f = np.zeros_like(a)
    for s, dst in (("n", tor), ("f", fill_f)):
        arm = limb["arm_" + s] | limb["farm_" + s]
        hole = arm & ndimage.binary_dilation(torso, iterations=15)
        dst[hole] = a[idx[0][hole], idx[1][hole]]
        dst[hole, 3] = 255
    upper = tor.copy()
    upper[belt + 15:, :, 3] = 0
    skirt = tor.copy()
    skirt[: belt - 5, :, 3] = 0
    pieces.update({"torso": upper, "skirt": skirt, "fill_f": fill_f})

    # static underlay between the thighs, faded out toward the knees
    hz = vis & (yy > belt) & (yy < t["knee_y"])
    for s in ("n", "f"):   # only what lies between the legs (chainmail), never the leg armour itself
        hz &= ~limb["arm_" + s] & ~limb["farm_" + s] & ~limb["thigh_" + s] & ~limb["shin_" + s]
    hips = a.copy()
    hips[~hz, 3] = 0
    hips[..., 3] = (hips[..., 3] * np.clip((t["knee_y"] - yy) / 80.0, 0, 1)).astype(np.uint8)
    pieces["hips"] = hips

    anchors = {}
    for s in ("n", "f"):
        ys, xs = np.where(limb["farm_" + s])
        if len(ys):
            low = ys > ys.max() - 90
            anchors["wrist_" + s] = [int(xs[low].mean()), int(ys.max() - 70)]
            anchors["grip_" + s] = [int(xs[low].mean()), int(ys.max() - 40)]
    return pieces, anchors, pivots

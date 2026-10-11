"""Walk rig from an outfit + its ARMLESS edit (no hand markup needed).

  arms   = what disappears between the full image and the armless image
  torso  = the armless image itself (real painted body behind the arms, no fill)
  legs   = full image below the hem, split near/far and at the knee (seams snap to
           painted edges); robes whose hem is below the knee keep thighs on the torso
  pivots = measured from the pieces (shoulder, elbow, hip, knee, ankle, waist, neck),
           so each outfit/sex gets its own joints
"""
import numpy as np
from scipy import ndimage

from anim_rig import _seam
from skin import _hsv


def register(full, armless):
    """Shift (dx, dy) that best aligns the armless body to the full body (legs/torso)."""
    a = full[..., 3] > 0
    b = armless[..., 3] > 0
    a[:420] = False
    b[:420] = False
    best = (-1, 0, 0)
    for dx in range(-15, 16, 3):
        for dy in range(-15, 16, 3):
            bb = np.roll(np.roll(b, dy, 0), dx, 1)
            sc = (a & bb).sum() / max((a | bb).sum(), 1)
            if sc > best[0]:
                best = (sc, dx, dy)
    return best[1], best[2]


def split_auto(front, armless, belt, hem, knee_y, neck_xy, shift=None):
    H, W = front.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    vis = front[..., 3] > 0
    dx, dy = shift if shift else register(front, armless)   # pin when auto-registration drifts
    arm_img = np.roll(np.roll(armless, dy, 0), dx, 1)
    arm_img[front[..., 3] == 0] = 0                       # head area etc. stays as in front
    head_gap = (front[..., 3] == 0) & (arm_img[..., 3] > 0)
    arm_img[head_gap, 3] = 0
    avis = arm_img[..., 3] > 0

    # ---- arms: present in full, gone (or repainted) in the armless image --------------
    diff = np.abs(front[..., :3].astype(int) - arm_img[..., :3].astype(int)).sum(2) > 120
    seeds = vis & ~avis                                     # sticks out past the body
    seeds[:neck_xy[1] + 80] = False
    seeds[knee_y - 60:] = False   # hands can hang below a short tunic's hem
    cand = vis & (seeds | diff)
    cand[:neck_xy[1] + 60] = False
    cand[knee_y - 40:] = False
    lab, n = ndimage.label(cand)
    keep = np.unique(lab[seeds & cand])
    arms = np.isin(lab, keep[keep > 0])
    arms = ndimage.binary_fill_holes(ndimage.binary_closing(arms, iterations=3)) & vis
    # below the belt an arm is only the part hanging OUTSIDE the body (fists, cuffs); the
    # armless edit repaints skirts slightly, which must not be mistaken for arm
    low = yy > belt + 20
    arms &= ~low | ndimage.binary_dilation(seeds, iterations=25)
    body_cx = int(np.median(np.where(avis[belt - 40:belt + 40])[1])) if avis[belt - 40:belt + 40].any() else W // 2
    arm_n = arms & (xx < body_cx)
    arm_f = arms & (xx >= body_cx)

    # ---- legs ----------------------------------------------------------------------------
    hem_seam = _seam(front, vis, hem, 40, 40)[None, :]
    legs = vis & (yy >= hem_seam) & ~arms
    split_x, gx = body_cx, []
    for y in range(max(hem + 40, knee_y - 60), min(knee_y + 260, H - 1), 8):   # gap between the legs
        lx = np.where(legs[y, body_cx - 120:body_cx + 120])[0]
        if len(lx):
            row = legs[y, body_cx - 120 + lx.min():body_cx - 120 + lx.max() + 1]
            gaps = np.where(~row)[0]
            if len(gaps) >= 3:
                gx.append(body_cx - 120 + lx.min() + int(np.median(gaps)))
    if gx:
        split_x = int(np.median(gx))
    near = xx < split_x
    knee = _seam(front, vis, knee_y, 45, 45)[None, :]
    robe = hem >= knee_y
    thigh_zone = vis & (yy >= hem_seam - 60) & ~arms
    pieces_m = {
        "arm_n": arm_n, "arm_f": arm_f,
        "shin_n": legs & near & (yy >= knee - 8), "shin_f": legs & ~near & (yy >= knee - 8),
        "thigh_n": np.zeros_like(vis) if robe else thigh_zone & near & (yy < knee + 25),
        "thigh_f": np.zeros_like(vis) if robe else thigh_zone & ~near & (yy < knee + 25),
    }

    # ---- elbows: split each arm into upper arm + forearm --------------------------------
    pivots = {}
    for s in ("n", "f"):
        arm = pieces_m["arm_" + s]
        ys, xs = np.where(arm)
        if not len(ys):
            continue
        top, bot = ys.min(), ys.max()
        ey = int(top + 0.45 * (bot - top))
        upper = arm & (yy < ey + 12)
        fore = arm & (yy >= ey - 12)
        pieces_m["arm_" + s], pieces_m["farm_" + s] = upper, fore
        row = np.where(arm[ey])[0]
        pivots["elbow_" + s] = [int(row.mean()), ey] if len(row) else [int(xs.mean()), ey]
        inner = xs[ys < top + 40]
        sx_ = int(inner.max()) if s == "n" else int(inner.min())
        pivots["shoulder_" + s] = [int((sx_ + xs[ys < top + 40].mean()) / 2), int(top + 25)]

    # ---- torso from the armless image ------------------------------------------------------
    torso = avis & (yy < hem_seam + (0 if not robe else 0))
    if not robe:
        torso |= avis & (yy >= hem_seam) & ~ndimage.binary_dilation(legs, iterations=2)
    else:
        torso = avis & ~(legs & ~(yy < hem_seam))
    for k, m in pieces_m.items():           # drop stray specks so nothing floats off a limb
        lab_k, nk = ndimage.label(m)
        if nk > 1:
            sz = ndimage.sum(m, lab_k, range(1, nk + 1))
            pieces_m[k] = np.isin(lab_k, 1 + np.flatnonzero(sz >= max(400, 0.05 * sz.max())))
    pieces = {}
    for name, m in pieces_m.items():
        p = front.copy()
        p[~m, 3] = 0
        pieces[name] = p
    tor = arm_img.copy()
    tor[~torso, 3] = 0
    upper_t = tor.copy()
    upper_t[belt + 15:, :, 3] = 0
    skirt = tor.copy()
    skirt[: belt - 5, :, 3] = 0
    pieces["torso"], pieces["skirt"] = upper_t, skirt

    # static hip underlay between swinging thighs (not for robes)
    if not robe:
        hz = vis & (yy > belt) & (yy < knee_y) & ~arms
        for s in ("n", "f"):
            hz &= ~pieces_m["thigh_" + s] & ~pieces_m["shin_" + s]
        hips = front.copy()
        hips[~hz, 3] = 0
        pieces["hips"] = hips

    # ---- remaining pivots -------------------------------------------------------------------
    for s, side in (("n", near), ("f", ~near)):
        th = pieces_m["thigh_" + s]
        sh = pieces_m["shin_" + s]
        if th.any():
            ys, xs = np.where(th)
            pivots["hip_" + s] = [int(xs[ys < ys.min() + 30].mean()), int(ys.min() + 20)]
        else:
            pivots["hip_" + s] = [int(split_x + (-40 if s == "n" else 40)), int(hem - 120)]
        if sh.any():
            ys, xs = np.where(sh)
            pivots["knee_" + s] = [int(xs[ys < ys.min() + 30].mean()), int(ys.min() + 15)]
            pivots["ankle_" + s] = [int(xs[ys > ys.max() - 120].mean()), int(ys.max() - 80)]
    pivots["waist"] = [body_cx, belt]
    pivots["neck"] = list(neck_xy)

    anchors = {}
    for s in ("n", "f"):
        fa = pieces_m.get("farm_" + s)
        if fa is not None and fa.any():
            ys, xs = np.where(fa)
            low = ys > ys.max() - 90
            anchors["wrist_" + s] = [int(xs[low].mean()), int(ys.max() - 70)]
            anchors["grip_" + s] = [int(xs[low].mean()), int(ys.max() - 40)]
    return pieces, anchors, pivots

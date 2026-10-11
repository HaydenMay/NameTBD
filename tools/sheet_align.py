"""Batch CREATION sheets (tools/base_sheet.py): ChatGPT moves heads a few px, so each cell
is re-registered against the original by matching the face outline (lime skin edge below
the forehead), then:
  faces -> art/incoming/faces_<tpl>/<tpl><n>.png  (full canvas: base with the new head pasted)
  hair  -> art/parts/hair/hair_<tpl><n>.png       (blue hair only, base canvas, brows removed)
Usage: python tools/sheet_align.py faces f art/sheets/new_faces_f_v1.png
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_hair import defringe  # noqa: E402
from skin import _hsv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PAD = 40


def lime(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (g > 150) & (r > 90) & (b < 120) & (g > r)


def face_edges(a):
    sk = lime(a)
    return sk ^ ndimage.binary_erosion(sk, iterations=2)


def register(orig_cell, edit_sheet, X, Y, W, H):
    """Offset (dx, dy) of this head in the edited sheet relative to the original."""
    so = face_edges(orig_cell)
    so[:150] = False
    so[330:] = False
    ys, xs = np.where(so)
    ea = edit_sheet[max(Y - PAD, 0):Y + H + PAD, max(X - PAD, 0):X + W + PAD]
    ox, oy = X - max(X - PAD, 0), Y - max(Y - PAD, 0)
    d = ndimage.distance_transform_edt(~face_edges(ea))
    best = None
    for dx in range(-PAD, PAD + 1):
        for dy in range(-PAD, PAD + 1):
            yy = np.clip(ys + oy + dy, 0, d.shape[0] - 1)
            xx = np.clip(xs + ox + dx, 0, d.shape[1] - 1)
            err = np.clip(d[yy, xx], 0, 12).mean()
            if best is None or err < best[0]:
                best = (err, dx, dy)
    return best[1], best[2], best[0]


def main(kind, tpl, edited):
    cells = json.loads((ROOT / f"art/sheets/new_{kind}_{tpl}.json").read_text())
    orig = np.asarray(Image.open(ROOT / f"art/sheets/new_{kind}_{tpl}.png").convert("RGB")).astype(int)
    e_img = Image.open(edited).convert("RGB")
    e = np.asarray(e_img).astype(int)
    base_img = Image.open(ROOT / cells[0]["src"]).convert("RGB")
    base = np.asarray(base_img)
    bh, bs, _ = _hsv(base)
    for c in cells:
        X, Y = c["sheet_xy"]
        W, H = c["size"]
        sx, sy = c["src_xy"]
        dx, dy, err = register(orig[Y:Y + H, X:X + W], e, X, Y, W, H)
        cell = e_img.crop((X + dx, Y + dy, X + dx + W, Y + dy + H))
        ca = np.asarray(cell).copy()                            # drop labels ChatGPT writes on the sheet
        txt = (ca.min(2) > 235)
        txt[120:] = False
        ca[ndimage.binary_dilation(txt, iterations=3)] = (255, 0, 255)
        cell = Image.fromarray(ca)
        name = f"{tpl}{'l' if kind == 'hairlong' else ''}{c['n']}"
        if kind == "faces":
            full = base_img.copy()
            full.paste(cell, (sx, sy))
            out = ROOT / f"art/incoming/faces_{tpl}"
            out.mkdir(parents=True, exist_ok=True)
            full.save(out / f"{name}.png")
        else:
            a = np.asarray(cell.convert("RGBA")).copy()
            h, s, v = _hsv(a)
            blue = (h >= 190) & (h <= 260) & (s > 0.35) & (v > 0.15)
            brows = (bh >= 190) & (bh <= 260) & (bs > 0.35)
            bfull = ndimage.binary_dilation(brows, iterations=4)
            brows = np.zeros((H, W), bool)                     # cell window may start above the canvas
            y0, x0 = max(sy, 0), max(sx, 0)
            brows[y0 - sy:min(sy + H, base.shape[0]) - sy, x0 - sx:min(sx + W, base.shape[1]) - sx] =                 bfull[y0:sy + H, x0:sx + W]
            m = blue & ~brows
            lab, n = ndimage.label(m)
            if n:
                sizes = ndimage.sum(m, lab, range(1, n + 1))
                cx_ = ndimage.center_of_mass(m, lab, range(1, n + 1))
                keep = [i + 1 for i in range(n) if sizes[i] >= 40 and (cx_[i][1] > 60 or sizes[i] > 0.2 * sizes.max())]
                m = np.isin(lab, keep)                      # drop neighbouring cells' strands at the edge
            m |= ndimage.binary_dilation(m, iterations=2) & (v < 0.35)
            # hair ties / bands: small non-blue, non-skin pieces bridging blue hair. Kept as a
            # separate layer so they keep their own colour (the hair layer is recoloured).
            bridge = ndimage.binary_closing(m, iterations=10) & ~m
            limey = (h >= 50) & (h <= 120) & (s > 0.3)
            mag = (a[..., 0] > 200) & (a[..., 1] < 90) & (a[..., 2] > 200)
            bluish = (h >= 185) & (h <= 265) & (s > 0.15)
            m |= bridge & bluish & ~mag                      # blue specks inside braids are hair
            ocell = orig[Y:Y + H, X:X + W]
            added = np.abs(np.asarray(cell.convert("RGB")).astype(int) - ocell).sum(2) > 110   # painted by the edit
            added = ndimage.binary_opening(added, iterations=1)
            near_hair = ndimage.binary_dilation(m, iterations=6)
            tie = near_hair & added & ~m & ~limey & ~mag & ~bluish
            lab_t, nt = ndimage.label(tie)
            if nt:
                sz = ndimage.sum(tie, lab_t, range(1, nt + 1))
                tie = np.isin(lab_t, 1 + np.flatnonzero((sz >= 40) & (sz <= 1500)))
            ties = a.copy()
            ties[~tie, 3] = 0
            a = np.asarray(cell.convert("RGBA")).copy()
            a[~m, 3] = 0
            a[~m, 3] = 0
            cut_off = bool(m[-3:].any())                       # hair runs off the bottom of the cell
            canvas = Image.new("RGBA", (base.shape[1], base.shape[0]), (0, 0, 0, 0))
            canvas.paste(Image.fromarray(a), (sx, sy))
            if cut_off:
                print(f"  {name}: hair reaches the bottom edge of the cell (cut off)")
            Image.fromarray(defringe(np.asarray(canvas).copy())).save(ROOT / "art/parts/hair" / f"hair_{name}.png")
            tc = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            tc.paste(Image.fromarray(ties), (sx, sy))
            tpath = ROOT / "art/parts/hair" / f"hair_{name}_ties.png"
            if tie.any():
                tc.save(tpath)
            elif tpath.exists():
                tpath.unlink()
        print(f"{name}: shift ({dx},{dy}) fit err {err:.1f}px")


if __name__ == "__main__":
    main(*sys.argv[1:4])

"""Pass/fail check for a hairstyle edit, plus a fit sheet on every male face.

ChatGPT re-paints the whole face on every hair edit (tone and line noise everywhere,
even on edits that look identical), so face/ear pixel comparisons can't judge hair
edits. We only keep the hair, so the checks are about the hair itself:
  hair     - blue hair found at all
  shift    - did the head move? (skin below the hairline, cross-correlated). A moved
             head means the cut hair lands off-centre on every face.
  captured - % of the edit's blue hair that the cut kept (missing strands/holes)
  leak     - % of the cut that isn't hair-coloured or outline (armor/skin leaking in)
Then renders the cut hair on every male face for a visual check of fit.

Usage:
  python tools/check_hair.py HAIRED.png [HAIRED2.png ...] [--base art/template/male_base.png]
Writes art/review/hair_check_<name>.png and prints a verdict per file.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402
from extract_hair import extract  # noqa: E402
from recolor import gradient_map  # noqa: E402
from skin import _hsv, recolour, skin_mask  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LIMITS = {  # metric: (pass threshold, warn threshold, higher_is_better)
    "shift": (3, 5, False),
    "captured": (95.0, 88.0, True),
    "leak": (5.0, 8.0, False),
}
MIN_HAIR_PX = 3000


def rgb(a):
    return a[..., :3].astype(int)


def blue_hair(a, base):
    diff = np.abs(rgb(a) - rgb(base)).sum(2) > 60
    h, s, _ = _hsv(a)
    m = (h >= 195) & (h <= 255) & (s > 0.35) & diff
    m[700:] = False
    return m


def measure(haired, base, cut):
    hair = blue_hair(haired, base)

    def low_skin(a):
        m = skin_mask(a, hue_lo=40)
        m[:200] = False
        m[340:] = False
        return m
    hs, bs = low_skin(haired), low_skin(base)
    best = max((np.logical_and(np.roll(np.roll(hs, dy, 0), dx, 1), bs).sum(), dx, dy)
               for dx in range(-10, 11) for dy in range(-10, 11))

    kept = cut[..., 3] > 0
    h, s, v = _hsv(cut)
    hairish = ((h >= 180) & (h <= 270) & (s > 0.15)) | (v < 0.35)
    return {
        "hair_px": int(hair.sum()),
        "shift": max(abs(best[1]), abs(best[2])),
        "shift_xy": (best[1], best[2]),
        "captured": round(100.0 * (hair & kept).sum() / max(hair.sum(), 1), 1),
        "leak": round(100.0 * (kept & ~hairish).sum() / max(kept.sum(), 1), 1),
    }


def verdict(m):
    if m["hair_px"] < MIN_HAIR_PX:
        return "FAIL", ["no blue hair found (was it generated in blue?)"]
    rank = {"PASS": 0, "WARN": 1, "FAIL": 2}
    worst, notes = "PASS", []
    words = {"shift": "head moved {v}px (pass <= {ok}px): hair will sit off-centre",
             "captured": "cut kept {v}% of the hair (pass >= {ok}%): strands missing",
             "leak": "{v}% of the cut isn't hair (pass <= {ok}%): armor/skin leaking in"}
    for k, (ok, warn, up) in LIMITS.items():
        v = m[k]
        good = v >= ok if up else v <= ok
        fine = v >= warn if up else v <= warn
        level = "PASS" if good else "WARN" if fine else "FAIL"
        if level != "PASS":
            notes.append(words[k].format(v=v, ok=ok))
        if rank[level] > rank[worst]:
            worst = level
    return worst, notes


def fit_sheet(hair_png, ref_skull, name, label):
    M = json.loads((ROOT / "preview-character" / "manifest.json").read_text())
    faces = [f for f in M["faces"] if f["template"] == "m" and not f["races"]]
    bodies = {b["id"]: b for b in M["bodies"]}
    tones = ["fair", "tan", "brown", "deep", "olive", "porcelain", "tan"]
    cols = ["brown", "black", "auburn", "black", "blond", "ginger", "silver"]
    hair = Image.open(hair_png).convert("RGBA")
    ys, xs = np.where(np.asarray(hair)[..., 3] > 0)
    C = 240
    W = Image.new("RGB", (len(faces) * C, C + 40), (70, 60, 75))
    d = ImageDraw.Draw(W)
    font = ImageFont.truetype("arial.ttf", 18)
    d.text((8, 8), label, fill=(255, 255, 255), font=font)

    def part(p, tone):
        im = np.asarray(Image.open(ROOT / "preview-character" / p["file"]).convert("RGBA")).copy()
        if p.get("skin_mask"):
            m = np.asarray(Image.open(ROOT / "preview-character" / p["skin_mask"])) > 0
            im = recolour(im, m, np.array(M["skins"][tone]["lab"]))
        return Image.fromarray(im)

    for i, f in enumerate(faces):
        tone, col = tones[i % len(tones)], cols[i % len(cols)]
        b = bodies["cleric_m"]
        c = Image.new("RGBA", (1024, 1536), (70, 60, 75, 255))
        if b.get("back"):
            c.alpha_composite(part(b["back"], tone), (b["back"]["x"], b["back"]["y"]))
        c.alpha_composite(part(f["part"], tone), (f["part"]["x"], f["part"]["y"]))
        if f.get("brows"):
            br = gradient_map(Image.open(ROOT / "preview-character" / f["brows"]["file"]), M["hair_colours"][col])
            c.alpha_composite(br, (f["brows"]["x"], f["brows"]["y"]))
        c.alpha_composite(part(b["part"], tone), (b["part"]["x"], b["part"]["y"]))
        if len(xs):
            hr = gradient_map(hair, M["hair_colours"][col])
            c.alpha_composite(hr, (f["skull"][1] - ref_skull[1], f["skull"][0] - ref_skull[0]))
        sx, sy = f["skull"][1], f["skull"][0]
        W.paste(c.crop((sx - 220, sy - 50, sx + 220, sy + 390)).resize((C - 6, C - 6)), (i * C + 3, 40))
        d.text((i * C + 8, C + 14), f["label"], fill=(255, 255, 255), font=font)
    out = ROOT / "art" / "review" / f"hair_check_{name}.png"
    W.save(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--base", default=str(ROOT / "art" / "template" / "male_base.png"))
    a = ap.parse_args()
    base = bp.keyed(Path(a.base))
    ref_skull = bp.skull(base)
    cut_dir = ROOT / "art" / "parts" / "hair" / "candidates"
    cut_dir.mkdir(parents=True, exist_ok=True)
    for f in a.files:
        name = Path(f).stem
        haired = bp.keyed(Path(f))
        cut = cut_dir / f"{name}.png"
        extract(f, a.base, str(cut), ylimit=800, hue=(195, 255))
        m = measure(haired, base, np.asarray(Image.open(cut).convert("RGBA")))
        v, notes = verdict(m)
        sheet = fit_sheet(cut, ref_skull, name, f"{name}: {v}")
        print(f"{v:4s}  {name}")
        print(f"      hair {m['hair_px']}px | head moved {m['shift_xy']} | captured {m['captured']}% | leak {m['leak']}%")
        for n in notes:
            print("      - " + n)
        print(f"      sheet: {sheet.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

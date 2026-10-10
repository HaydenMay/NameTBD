"""Render an outfit's walk-rig pieces colour-coded (review aid).
Usage: python tools/show_rig.py knight_m [out.png]"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
COLS = {"arm_n": (255, 150, 0), "arm_f": (160, 90, 0), "farm_n": (0, 200, 80), "farm_f": (0, 110, 50),
        "thigh_n": (255, 230, 0), "thigh_f": (150, 135, 0), "shin_n": (230, 40, 40), "shin_f": (130, 20, 20)}
ORDER = ["hips", "fill_f", "arm_f", "farm_f", "thigh_f", "shin_f", "thigh_n", "shin_n", "skirt", "torso", "arm_n", "farm_n"]

bid = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else f"art/review/rig_{bid}.png"
M = json.loads((ROOT / "preview-character/manifest.json").read_text())
b = next(x for x in M["bodies"] if x["id"] == bid)
print("pivots", b["anim"].get("pivots"))
c = Image.new("RGBA", (1024, 1536), (30, 30, 30, 255))
for k in ORDER:
    p = b["anim"]["pieces"].get(k)
    if not p:
        continue
    im = Image.open(ROOT / "preview-character" / p["file"]).convert("RGBA")
    c.alpha_composite(im, (p["x"], p["y"]))
    if k in COLS:
        t = Image.new("RGBA", im.size, COLS[k] + (0,))
        t.putalpha(im.getchannel("A").point(lambda v: 120 if v else 0))
        c.alpha_composite(t, (p["x"], p["y"]))
c.resize((512, 768)).save(ROOT / out)

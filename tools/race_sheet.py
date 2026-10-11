"""Review sheet: every generic face rendered as one race (ears/tusks + race skin).
Usage: python tools/race_sheet.py ogre"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recolor import gradient_map  # noqa: E402
from skin import recolour  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
race_id = sys.argv[1] if len(sys.argv) > 1 else "ogre"
M = json.loads((ROOT / "preview-character/manifest.json").read_text())
race = M["races"][race_id]
B = {b["id"]: b for b in M["bodies"]}
H = {h["id"]: h for h in M["hairs"]}


def load(p, tone=None):
    im = np.asarray(Image.open(ROOT / "preview-character" / p["file"]).convert("RGBA")).copy()
    if tone and p.get("skin_mask"):
        m = np.asarray(Image.open(ROOT / "preview-character" / p["skin_mask"])) > 0
        im = recolour(im, m, np.array(M["skins"][tone]["lab"]))
    return Image.fromarray(im)


faces = [f for f in M["faces"] if not f.get("races")]
font = ImageFont.truetype("arialbd.ttf", 20)
C = 300
COLS = 4
rows = (len(faces) + COLS - 1) // COLS
W = Image.new("RGB", (COLS * C, rows * (C + 34)), (70, 60, 75))
d = ImageDraw.Draw(W)
for i, f in enumerate(faces):
    tone = race["skins"][i % len(race["skins"])]
    col = race["hair"][i % len(race["hair"])]
    body = B["cleric_m" if f["template"] == "m" else "cleric_f"]
    hair = H["m_short" if f["template"] == "m" else "bun01"]
    c = Image.new("RGBA", (1024, 1536), (70, 60, 75, 255))
    if body.get("back"):
        c.alpha_composite(load(body["back"], tone), (body["back"]["x"], body["back"]["y"]))
    c.alpha_composite(load(f["part"], tone), (f["part"]["x"], f["part"]["y"]))
    own = (f.get("race_ears") or {}).get(race["ears"] or "")
    if own and own.get("cut"):
        cut = np.asarray(Image.open(ROOT / "preview-character" / own["cut"]["file"]))[..., 3] > 0
        arr = np.asarray(c).copy()
        cx0, cy0 = own["cut"]["x"], own["cut"]["y"]
        sub = arr[cy0:cy0 + cut.shape[0], cx0:cx0 + cut.shape[1]]
        sub[cut] = (70, 60, 75, 255)
        c = Image.fromarray(arr)
    if own and own.get("patch"):
        pp = own["patch"]
        c.alpha_composite(load(pp, tone), (pp["x"], pp["y"]))
    if f.get("brows"):
        c.alpha_composite(gradient_map(Image.open(ROOT / "preview-character" / f["brows"]["file"]), M["hair_colours"][col]),
                          (f["brows"]["x"], f["brows"]["y"]))
    c.alpha_composite(load(body["part"], tone), (body["part"]["x"], body["part"]["y"]))
    hp = hair["part"]
    c.alpha_composite(gradient_map(Image.open(ROOT / "preview-character" / hp["file"]), M["hair_colours"][col]),
                      (hp["x"] + f["skull"][1] - hair["ref_skull"][1], hp["y"] + f["skull"][0] - hair["ref_skull"][0]))
    if race["ears"]:
        if own:
            c.alpha_composite(load(own["part"], tone), (own["part"]["x"], own["part"]["y"]))
        else:
            e = M["ears"][race["ears"]]
            c.alpha_composite(load(e["part"], tone), (e["part"]["x"] + f["skull"][1] - e["ref_skull"][1],
                                                       e["part"]["y"] + f["skull"][0] - e["ref_skull"][0]))
        if race["ears"] == "ogre" and f.get("tusks"):
            t = f["tusks"]
            c.alpha_composite(load(t), (t["x"], t["y"]))
    sx, sy = f["skull"][1], f["skull"][0]
    X, Y = (i % COLS) * C, (i // COLS) * (C + 34)
    W.paste(c.crop((sx - 180, sy + 40, sx + 200, sy + 420)).resize((C - 4, C - 4)), (X, Y + 34))
    blocked = race_id in f.get("blocked_races", [])
    d.text((X + 6, Y + 6), f"{i + 1}. {f['label']}" + (" (BLOCKED)" if blocked else ""),
           fill=(255, 90, 90) if blocked else (255, 255, 255), font=font)
out = ROOT / "art/review" / f"race_{race_id}.png"
W.save(out)
print(out)

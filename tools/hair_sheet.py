"""Sheet of every male hairstyle (raw blue key) on the base face wearing one race's ears,
for a batch 'refit the hair around these ears' edit. Usage: python tools/hair_sheet.py elf"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
race = sys.argv[1] if len(sys.argv) > 1 else "elf"
tpl = sys.argv[2] if len(sys.argv) > 2 else "m"
group = sys.argv[3] if len(sys.argv) > 3 else "short"     # women: "short" or "long" (tall cells)
LONG = {"fl1", "fl2", "fl3", "fl4"}
base_name, base_face = ("female_base.png", "rowan") if tpl == "f" else ("male_base.png", "aldric")
base = bp.keyed(ROOT / "art/template" / base_name)
top, cx = bp.skull(base)[:2]
P = ROOT / "art/parts" / f"ears_{race}"
earless = ROOT / "art/incoming/earless" / f"{base_face}.png"
if earless.exists():   # clean earless head: the race ear sits on it directly
    face = Image.fromarray(bp.keyed(earless))
else:
    face = Image.fromarray(base)
    cut = np.asarray(Image.open(P / f"cut_{base_face}.png"))[..., 3] > 0
    arr = np.asarray(face).copy()
    arr[cut] = (255, 0, 255, 255)
    face = Image.fromarray(arr)
    face.alpha_composite(Image.open(P / f"patch_{base_face}.png").convert("RGBA"))
ear = Image.open(P / f"ears_{race}_{base_face}.png").convert("RGBA")
refs = {n: bp.skull(bp.keyed(bp.SRC / f"{n}.png"))[:2] for n in ["aldric_bald_01"]}
refs["male_base" if tpl == "m" else "female_base"] = [top, cx]
hairs = [h for h in bp.HAIRS if tpl in h[2] and h[3] in refs]
if tpl == "f":
    hairs = [h for h in hairs if (h[0] in LONG) == (group == "long")]
COLS, CW, CH = 5, 300, 400
ROWS = 2
if group == "long":
    COLS, CH, ROWS = 4, 960, 1
W, H = 1536, 1024
gap = (W - COLS * CW) // (COLS + 1)
gx, gy = gap, (H - ROWS * CH) // (ROWS + 1)
sheet = Image.new("RGB", (W, H), (255, 0, 255))
cells = []
for i, (hid, label, fits, ref, *shift) in enumerate(hairs[:COLS * ROWS]):
    PADY = 100                                    # canvas padding so crops never leave the image
    c = Image.new("RGBA", (1024, 1536 + 2 * PADY), (255, 0, 255, 255))
    c.alpha_composite(face, (0, PADY))
    hair = Image.open(ROOT / "art/parts/hair" / f"hair_{hid}.png").convert("RGBA")
    ry, rx = refs[ref]
    rx -= shift[0] if shift else 0
    c.alpha_composite(hair, (cx - rx, top - ry + PADY))
    ties = ROOT / "art/parts/hair" / f"hair_{hid}_ties.png"
    if ties.exists():
        c.alpha_composite(Image.open(ties).convert("RGBA"), (cx - rx, top - ry + PADY))
    c.alpha_composite(ear, (0, PADY))
    x0, y0 = cx - CW // 2 - 20, top - 60
    X, Y = gx + (i % COLS) * (CW + gap), gy + (i // COLS) * (CH + gy)
    sheet.paste(c.convert("RGB").crop((x0, y0 + PADY, x0 + CW, y0 + PADY + CH)), (X, Y))
    cells.append({"id": hid, "label": label, "sheet_xy": [X, Y], "src_xy": [x0, y0], "size": [CW, CH],
                  "hair_offset": [cx - rx, top - ry]})
out = ROOT / "art/sheets"
name = f"hair_{tpl}_{race}" + ("_long" if group == "long" else "")
sheet.save(out / f"{name}.png")
(out / f"{name}.json").write_text(json.dumps(cells, indent=1))
print(len(cells), "hairstyles")

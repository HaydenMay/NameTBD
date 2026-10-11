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
base = bp.keyed(ROOT / "art/template/male_base.png")
top, cx = bp.skull(base)[:2]
P = ROOT / "art/parts" / f"ears_{race}"
face = Image.fromarray(base)
cut = np.asarray(Image.open(P / "cut_aldric.png"))[..., 3] > 0
arr = np.asarray(face).copy()
arr[cut] = (255, 0, 255, 255)
face = Image.fromarray(arr)
face.alpha_composite(Image.open(P / "patch_aldric.png").convert("RGBA"))
ear = Image.open(P / f"ears_{race}_aldric.png").convert("RGBA")
refs = {n: bp.skull(bp.keyed(bp.SRC / f"{n}.png"))[:2] for n in ["aldric_bald_01"]}
refs["male_base"] = [top, cx]
hairs = [h for h in bp.HAIRS if "m" in h[2] and h[3] in refs]
COLS, CW, CH = 5, 300, 400
W, H = 1536, 1024
gx, gy = (W - COLS * CW) // 2, (H - 2 * CH) // 3
sheet = Image.new("RGB", (W, H), (255, 0, 255))
cells = []
for i, (hid, label, fits, ref, *shift) in enumerate(hairs[:10]):
    c = Image.new("RGBA", (1024, 1536), (255, 0, 255, 255))
    c.alpha_composite(face)
    hair = Image.open(ROOT / "art/parts/hair" / f"hair_{hid}.png").convert("RGBA")
    ry, rx = refs[ref]
    rx -= shift[0] if shift else 0
    c.alpha_composite(hair, (cx - rx, top - ry))
    c.alpha_composite(ear)
    x0, y0 = cx - CW // 2 - 20, top - 60
    X, Y = gx + (i % COLS) * CW, gy + (i // COLS) * (CH + gy)
    sheet.paste(c.convert("RGB").crop((x0, y0, x0 + CW, y0 + CH)), (X, Y))
    cells.append({"id": hid, "label": label, "sheet_xy": [X, Y], "src_xy": [x0, y0], "size": [CW, CH],
                  "hair_offset": [cx - rx, top - ry]})
out = ROOT / "art/sheets"
sheet.save(out / f"hair_m_{race}.png")
(out / f"hair_m_{race}.json").write_text(json.dumps(cells, indent=1))
print(len(cells), "hairstyles")

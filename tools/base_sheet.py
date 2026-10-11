"""10 copies of a base head on one sheet, for batch CREATION (new faces or new hairstyles).
Usage: python tools/base_sheet.py f faces   -> art/sheets/new_faces_f.png (+ .json)"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
tpl, kind = sys.argv[1], sys.argv[2]
src = ROOT / "art/template" / ("female_base.png" if tpl == "f" else "male_base.png")
img = Image.open(src).convert("RGB")
top, cx = bp.skull(bp.keyed(src))[:2]
CW, CH, COLS = 300, 400, 5
# hairstyles need room above and behind the head for volume
x0, y0 = cx - CW // 2 - 20, top - (60 if kind == "hair" else 30)
crop = img.crop((x0, y0, x0 + CW, y0 + CH))
W, H = 1536, 1024
gx, gy = (W - COLS * CW) // 2, (H - 2 * CH) // 3
sheet = Image.new("RGB", (W, H), (255, 0, 255))
cells = []
for i in range(10):
    X, Y = gx + (i % COLS) * CW, gy + (i // COLS) * (CH + gy)
    sheet.paste(crop, (X, Y))
    cells.append({"n": i + 1, "sheet_xy": [X, Y], "src_xy": [x0, y0], "size": [CW, CH], "src": str(src.relative_to(ROOT))})
out = ROOT / "art/sheets" / f"new_{kind}_{tpl}"
sheet.save(out.with_suffix(".png"))
out.with_suffix(".json").write_text(json.dumps(cells, indent=1))
print(out.with_suffix(".png"))

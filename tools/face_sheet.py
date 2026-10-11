"""Pack all generic faces of one template into a single 1536x1024 sheet for batch
ChatGPT edits (e.g. blue tusks / ears on every face at once), and record each cell's
offset so extracted parts can be mapped back onto the original faces.

Usage: python tools/face_sheet.py m        -> art/sheets/faces_m.png + faces_m.json
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
tpl = sys.argv[1] if len(sys.argv) > 1 else "m"
page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
faces = [f for f in bp.FACES if f[3] == tpl and f[4] is None]
COLS, CW, CH = 5, 300, 400            # cell size at native resolution (no scaling)
W, H = 1536, 1024
gx, gy = (W - COLS * CW) // 2, (H - 2 * CH) // 3
sheet = Image.new("RGB", (W, H), (255, 0, 255))
cells = []
for i, (fid, fname, label, _, _) in enumerate(faces[(page - 1) * 10:page * 10]):
    src = bp.SRC / f"{fname}.png"
    a = np.asarray(Image.open(src).convert("RGB"))
    top, cx = bp.skull(bp.keyed(src))[:2]
    x0, y0 = cx - CW // 2 - 20, top - 30           # crop window in source coords
    crop = Image.fromarray(a).crop((x0, y0, x0 + CW, y0 + CH))
    X, Y = gx + (i % COLS) * CW, gy + (i // COLS) * (CH + gy)
    sheet.paste(crop, (X, Y))
    cells.append({"id": fid, "label": label, "src": str(src.relative_to(ROOT)), "sheet_xy": [X, Y], "src_xy": [x0, y0], "size": [CW, CH]})
out = ROOT / "art" / "sheets"
out.mkdir(parents=True, exist_ok=True)
suffix = "" if page == 1 else f"_p{page}"
sheet.save(out / f"faces_{tpl}{suffix}.png")
(out / f"faces_{tpl}{suffix}.json").write_text(json.dumps(cells, indent=1))
print(len(cells), "faces ->", out / f"faces_{tpl}.png")

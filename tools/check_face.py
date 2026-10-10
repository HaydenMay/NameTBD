"""Pass/fail check for a new face edit against the sex's base reference.

Hair is drawn to hug the base's ear and cheek, so a face only shares hair if its head
OUTLINE matches the base: skull top, back of head at ear level, front of cheek and
front at eye level. Overall overlap is not enough (a slimmer head still overlaps ~92%).

Usage: python tools/check_face.py FACE.png [FACE2.png ...] [--base art/template/male_base.png]
"""
import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_preview as bp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PASS_PX, WARN_PX = 8, 12


def profile(path, cut):
    a = bp.keyed(Path(path))
    m = bp.head_mask(a, cut) & (a[..., 3] > 0)
    top = bp.skull(a)[0]

    def edge(dy, side):
        xs = np.where(m[top + dy])[0]
        return int(xs.min() if side == "back" else xs.max()) if len(xs) else 0
    return {"skull top": top, "back @ ear": edge(190, "back"),
            "front @ eye": edge(150, "front"), "front @ cheek": edge(230, "front")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--base", default=str(ROOT / "art" / "template" / "male_base.png"))
    ap.add_argument("--cut", type=int, default=345, help="345 male, 332 female")
    a = ap.parse_args()
    base = profile(a.base, a.cut)
    for f in a.files:
        p = profile(f, a.cut)
        worst, notes = 0, []
        for k, v in p.items():
            d = abs(v - base[k])
            worst = max(worst, d)
            if d > PASS_PX:
                notes.append(f"{k} off by {d}px")
        verdict = "PASS" if worst <= PASS_PX else "WARN" if worst <= WARN_PX else "FAIL"
        print(f"{verdict:4s}  {Path(f).stem}" + ("" if not notes else "  - " + ", ".join(notes)))


if __name__ == "__main__":
    main()

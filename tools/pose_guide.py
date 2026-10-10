"""Draws the Phase 0 pose/proportion guide that is attached to ChatGPT prompts.

Outputs (in art/template/):
  pose_guide.png            clean block-out, attach to image prompts
  pose_guide_annotated.png  same, with anchor points and head-height ruler
  anchors_draft.json        draft anchor coordinates (finalised after the real template exists)
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 1536          # ChatGPT portrait size
SS = 2                     # supersampling factor
TOP, FLOOR = 100, 1450     # head top and foot baseline
HEAD = (FLOOR - TOP) / 3.75  # one head height (~360px)

BG = (255, 0, 255)
NEAR = (158, 158, 158)
FAR = (112, 112, 112)
LINE = (38, 38, 42)
OUTLINE = 6

ANCHORS = {
    "head_top": (512, 100),
    "neck": (505, 470),
    "shoulder_near": (380, 555),
    "elbow_near": (335, 715),
    "wrist_near": (318, 850),
    "grip_near": (312, 878),
    "shoulder_far": (625, 555),
    "elbow_far": (672, 715),
    "wrist_far": (690, 845),
    "grip_far": (695, 870),
    "pelvis": (505, 840),
    "hip_near": (450, 880),
    "knee_near": (440, 1130),
    "ankle_near": (435, 1370),
    "hip_far": (560, 880),
    "knee_far": (575, 1130),
    "ankle_far": (580, 1370),
    "floor": (505, FLOOR),
}


def s(p):
    return (p[0] * SS, p[1] * SS)


def capsule(d, a, b, r, fill):
    """Rounded limb segment with a dark outline."""
    for rad, col in ((r + OUTLINE, LINE), (r, fill)):
        d.line([s(a), s(b)], fill=col, width=int(rad * 2 * SS))
        for p in (a, b):
            x, y = s(p)
            d.ellipse([x - rad * SS, y - rad * SS, x + rad * SS, y + rad * SS], fill=col)


def ellipse(d, c, rx, ry, fill):
    for o, col in ((OUTLINE, LINE), (0, fill)):
        x, y = s(c)
        d.ellipse([x - (rx + o) * SS, y - (ry + o) * SS, x + (rx + o) * SS, y + (ry + o) * SS], fill=col)


def polygon(d, pts, fill):
    d.polygon([s(p) for p in pts], fill=fill, outline=LINE, width=OUTLINE * SS)


def draw_figure(d):
    A = ANCHORS
    # Far side (behind torso)
    capsule(d, A["hip_far"], A["knee_far"], 60, FAR)
    capsule(d, A["knee_far"], A["ankle_far"], 52, FAR)
    capsule(d, (575, 1405), (655, 1418), 36, FAR)
    capsule(d, A["shoulder_far"], A["elbow_far"], 42, FAR)
    capsule(d, A["elbow_far"], A["wrist_far"], 37, FAR)
    ellipse(d, A["grip_far"], 42, 46, FAR)

    # Torso and pelvis
    ellipse(d, (505, 850), 112, 70, NEAR)
    polygon(d, [(360, 525), (645, 530), (610, 690), (590, 800), (420, 800), (395, 690)], NEAR)
    capsule(d, (372, 548), (632, 552), 40, NEAR)  # shoulder line
    capsule(d, A["neck"], (505, 515), 42, NEAR)

    # Near leg
    capsule(d, A["hip_near"], A["knee_near"], 66, NEAR)
    capsule(d, A["knee_near"], A["ankle_near"], 57, NEAR)
    capsule(d, (432, 1402), (525, 1420), 40, NEAR)

    # Head (3/4 facing right): face centre line pushed right, ear on the left of centre
    ellipse(d, (512, 280), 142, 180, NEAR)
    ellipse(d, (430, 300), 24, 38, NEAR)
    x0, y0 = s((512, 280))
    d.arc([x0 - 60 * SS, y0 - 180 * SS, x0 + 120 * SS, y0 + 180 * SS], -80, 80, fill=FAR, width=3 * SS)
    d.line([s((460, 295)), s((650, 295))], fill=FAR, width=3 * SS)  # eye line

    # Near arm (in front)
    capsule(d, A["shoulder_near"], A["elbow_near"], 46, NEAR)
    capsule(d, A["elbow_near"], A["wrist_near"], 40, NEAR)
    ellipse(d, A["grip_near"], 46, 50, NEAR)


def render():
    img = Image.new("RGB", (W * SS, H * SS), BG)
    draw_figure(ImageDraw.Draw(img))
    return img.resize((W, H), Image.LANCZOS)


def annotate(img):
    img = img.copy()
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for i in range(5):
        y = TOP + HEAD * i if i < 4 else FLOOR
        label = f"{i} heads" if i < 4 else "3.75 heads (floor)"
        d.line([(20, y), (W - 20, y)], fill=(255, 255, 255), width=2)
        d.text((24, y - 24), label, fill=(255, 255, 255), font=font)
    for name, (x, y) in ANCHORS.items():
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(0, 255, 200), outline=(0, 0, 0))
        d.text((x + 10, y - 9), name, fill=(0, 0, 0), font=font)
    return img


def main():
    out = Path(__file__).resolve().parent.parent / "art" / "template"
    out.mkdir(parents=True, exist_ok=True)
    img = render()
    img.save(out / "pose_guide.png")
    annotate(img).save(out / "pose_guide_annotated.png")
    (out / "anchors_draft.json").write_text(json.dumps(
        {"canvas": [W, H], "head_height": HEAD, "anchors": ANCHORS}, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    main()

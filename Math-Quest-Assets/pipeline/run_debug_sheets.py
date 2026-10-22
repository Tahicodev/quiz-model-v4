"""Stage: build visual QA contact sheets (over magenta and over white)."""
import os
import sys
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OUT, DEBUG, STAGE, CATEGORY_OF

BOX = 512
PAD = 26
LABEL_H = 34
COLS = 4

with open(os.path.join(STAGE, "metrics.json"), encoding="utf-8") as f:
    metrics = json.load(f)

ALPHA_IDS = [pid for pid, rec in metrics.items()
             if rec["outputs"][0]["format"] == "png" and rec["operations"] != ["crop-from-sheet", "corner-key-white"]]
THUMB_IDS = [pid for pid, rec in metrics.items()
             if rec["operations"] == ["crop-from-sheet", "corner-key-white"]]

ORDER = [
    "mq-dino-idle", "mq-dino-celebrate", "mq-dino-thinking", "mq-dino-surprised", "mq-dino-encourage",
    "mq-chest-closed", "mq-chest-open", "mq-chest-open-glow", "mq-signpost", "mq-gate", "mq-crystal",
    "mq-pedestal", "mq-floating-platform",
    "mq-coin", "mq-star", "mq-trophy", "mq-confetti", "math-quest-icon",
    "mq-jungle-decorations", "mq-decor-bush", "mq-decor-palm", "mq-decor-plant",
    "mq-decor-flowers", "mq-decor-rock", "mq-decor-grass",
] + THUMB_IDS

try:
    font = ImageFont.truetype("arial.ttf", 22)
except Exception:
    font = ImageFont.load_default()

def contact(bg):
    items = []
    for pid in ORDER:
        rec = metrics[pid]
        p = os.path.join(OUT if not os.path.isabs(OUT) else OUT, rec["outputs"][0]["relpath"].split("math-quest/")[1].replace("/", os.sep))
        full = os.path.join(OUT, os.path.relpath(rec["outputs"][0]["relpath"], "public/assets/games/math-quest").replace("/", os.sep))
        im = Image.open(full).convert("RGBA")
        im.thumbnail((BOX, BOX), Image.LANCZOS)
        items.append((pid, im))
    rows = (len(items) + COLS - 1) // COLS
    W = COLS * (BOX + PAD) + PAD
    H = rows * (BOX + LABEL_H + PAD) + PAD
    sheet = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(sheet)
    for i, (pid, im) in enumerate(items):
        r, c = divmod(i, COLS)
        x = PAD + c * (BOX + PAD) + (BOX - im.width) // 2
        y = PAD + r * (BOX + LABEL_H + PAD)
        sheet.paste(im, (x, y), im)
        d.text((PAD + c * (BOX + PAD) + 4, y + BOX + 8), pid, fill=(20, 20, 20), font=font)
    return sheet

contact((255, 0, 255)).save(os.path.join(DEBUG, "contact-over-magenta.png"))
contact((255, 255, 255)).save(os.path.join(DEBUG, "contact-over-white.png"))
print("contact sheets written: contact-over-magenta.png, contact-over-white.png")

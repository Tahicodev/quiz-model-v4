"""Stage: high-res edge inspection. 2x zoom crops over an inverse checker
background to reveal any leftover checker-parity pixels, white fringes or
over-eaten edges on the highest-risk sprites."""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OUT, DEBUG

def checker_bg(h, w, a=90, b=200, s=16):
    yy, xx = np.mgrid[0:h, 0:w]
    par = ((yy // s) + (xx // s)) % 2
    return np.where(par == 0, a, b).astype(np.uint8)

CAT = {"mq-gate": "props", "mq-crystal": "props", "mq-coin": "rewards", "mq-dino-idle": "characters"}
spots = [
    ("mq-gate", "gate-top", (700, 180, 1400, 780)),
    ("mq-crystal", "crystal-edge", (300, 300, 1000, 700)),
    ("mq-coin", "coin-edge", (200, 300, 700, 800)),
    ("mq-dino-idle", "dino-foot", (500, 800, 1000, 1150)),
]
ZOOM = 2
tiles = []
for pid, label, (x0, y0, x1, y1) in spots:
    im = Image.open(os.path.join(OUT, CAT[pid], pid + ".png")).convert("RGBA")
    w, h = x1 - x0, y1 - y0
    cb = checker_bg(h * ZOOM, w * ZOOM)
    al = im.crop((x0, y0, x1, y1)).resize((w * ZOOM, h * ZOOM), Image.NEAREST)
    base = Image.fromarray(cb, "L").convert("RGB")
    base.paste(al, (0, 0), al)
    tiles.append((label, base))

W = max(t.width for _, t in tiles) + 20
H = sum(t.height + 40 for _, t in tiles) + 20
sheet = Image.new("RGB", (W, H), (40, 40, 40))
d = ImageDraw.Draw(sheet)
y = 10
for label, t in tiles:
    d.text((10, y), label, fill=(255, 255, 0))
    y += 24
    sheet.paste(t, (10, y))
    y += t.height + 16
sheet.save(os.path.join(DEBUG, "edge-zoom-check.png"))
print("saved edge-zoom-check.png")

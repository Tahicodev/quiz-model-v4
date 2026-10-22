"""Adjudicate suspicious regions: compare source JPG pixels to the matted
output to decide whether the visible blobs are artwork or background junk."""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OUT, SRC, BASE

def region_stats(arr, x0, y0, x1, y1, tag):
    reg = arr[y0:y1, x0:x1]
    flat = reg.reshape(-1, reg.shape[-1])
    mn = flat.min(axis=0); mx = flat.max(axis=0)
    print(f"  {tag}: shape={reg.shape[:2]} min={mn} max={mx} "
          f"mean={flat.mean(axis=0).round(1)}")
    # sample the luminance/alpha distribution of a 5x5 grid
    h, w = reg.shape[:2]
    ys = np.linspace(0, h - 1, 5).astype(int); xs = np.linspace(0, w - 1, 5).astype(int)
    for y in ys:
        row = []
        for x in xs:
            row.append(tuple(int(v) for v in flat[y * w + x]))
        print("   ", row)

print("GATE stairs region (source coords ~x 840-900, y 180-240):")
src = np.asarray(Image.open(os.path.join(SRC, "Additional gameplay objects", "Level gate.jpg")).convert("RGB"), dtype=float)
out = np.asarray(Image.open(os.path.join(OUT, "props", "mq-gate.png")).convert("RGBA"), dtype=float)
region_stats(src, 840, 180, 900, 240, "source RGB")
region_stats(out, 840, 180, 900, 240, "output RGBA")

print("GATE base lump (source coords ~x 700-760, y 780-840):")
region_stats(src, 700, 790, 760, 850, "source RGB")
region_stats(out, 700, 790, 760, 850, "output RGBA")

print("CRYSTAL curl region (source coords ~x 320-420, y 600-680):")
src = np.asarray(Image.open(os.path.join(SRC, "Additional gameplay objects", "Collectible crystal.jpg")).convert("RGB"), dtype=float)
out = np.asarray(Image.open(os.path.join(OUT, "props", "mq-crystal.png")).convert("RGBA"), dtype=float)
region_stats(src, 320, 600, 420, 680, "source RGB")
region_stats(out, 320, 600, 420, 680, "output RGBA")

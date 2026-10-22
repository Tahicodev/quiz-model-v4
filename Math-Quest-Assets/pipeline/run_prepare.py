"""Stage 1: produce all Math Quest production assets from source-prompts.

- Never touches files under source-prompts/ (read-only).
- Writes production files into public/assets/games/math-quest/<category>/.
- Writes QA metrics into pipeline/stage/metrics.json.
- Writes debug contact sheets + tile previews into pipeline/debug/.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mq_img as M
from config import (SINGLES, DECOR_SHEET_ID, DECOR_CROPS, THUMB_SHEET_SOURCE,
                    THUMB_CROPS, CATEGORY_OF, OUT, STAGE, DEBUG, BASE)

EXT = {"webp": ".webp"}
os.makedirs(STAGE, exist_ok=True)
os.makedirs(DEBUG, exist_ok=True)

metrics = {}   # prod_id -> record
stage_rgba = {}  # keep decor sheet for cropping


def rel_out(cat, name, fmt):
    return f"public/assets/games/math-quest/{cat}/{name}{EXT.get(fmt, '.png')}"


# --------------------------------------------------------------------------
# singles
# --------------------------------------------------------------------------
for pid, (src_rel, ops) in SINGLES.items():
    src_abs = os.path.join(BASE, src_rel.replace("/", os.sep))
    cat = CATEGORY_OF[pid]
    rec = {"source": src_rel, "operations": ops, "outputs": []}
    img = M.load_rgb(src_abs)
    rec["src_width"], rec["src_height"] = img.shape[1], img.shape[0]

    name = pid.split("-", 1)[1] if pid.startswith("mq-") else pid
    # keep stable production names exactly as approved in the mapping
    stable = pid

    if "matte" in ops:
        rgba, mm = M.matte(img, verbose=True)
        out_path = os.path.join(OUT, cat, stable + ".png")
        rgba8 = np.clip(rgba, 0, 255).astype(np.uint8)
        Image.fromarray(rgba8, "RGBA").save(out_path)
        rec["outputs"].append({
            "relpath": rel_out(cat, stable, "png"), "format": "png",
            "width": rgba.shape[1], "height": rgba.shape[0],
            "matting": mm,
        })
        if pid == DECOR_SHEET_ID:
            stage_rgba[pid] = rgba
        if pid in ("mq-grass-tile",):
            pass
    elif "webp" in ops:
        out_path = os.path.join(OUT, cat, stable + ".webp")
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(
            out_path, format="WEBP", quality=90, method=6)
        rec["outputs"].append({
            "relpath": rel_out(cat, stable, "webp"), "format": "webp",
            "width": img.shape[1], "height": img.shape[0],
            "webp_quality": 90,
        })
    elif "tile-check" in ops:
        seam0 = M.seam_metrics(img)
        method = "as-is"
        final_img = img
        seam1 = seam0
        if not seam0["seamless"]:
            for inset in (44, 60, 76):
                cand = M.make_seamless_by_inset(img, inset)
                s = M.seam_metrics(cand)
                if s["seamless"]:
                    final_img, seam1, method = cand, s, f"inset-crop {inset}px + lanczos resize"
                    break
            if not seam1["seamless"]:
                cand = M.make_seamless_by_wrap_blend(img)
                s = M.seam_metrics(cand)
                final_img, seam1, method = cand, s, "half-wrap cross-blend"
        out_path = os.path.join(OUT, cat, stable + ".png")
        Image.fromarray(np.clip(final_img, 0, 255).astype(np.uint8), "RGB").save(out_path)
        rec["outputs"].append({
            "relpath": rel_out(cat, stable, "png"), "format": "png",
            "width": final_img.shape[1], "height": final_img.shape[0],
            "original_seam": seam0, "final_seam": seam1, "correction_method": method,
        })
        # 2x2 tiled preview for eyeball check
        th = 256
        t = np.clip(final_img, 0, 255).astype(np.uint8)
        timg = Image.fromarray(t, "RGB").resize((th, th), Image.LANCZOS)
        prev = Image.new("RGB", (th * 2, th * 2))
        for dy in (0, th):
            for dx in (0, th):
                prev.paste(timg, (dx, dy))
        prev.save(os.path.join(DEBUG, f"tile-preview-{stable}.png"))
        rec["tile_preview"] = f"pipeline/debug/tile-preview-{stable}.png"

    metrics[pid] = rec
    print(f"[prepare] {pid} done")

# --------------------------------------------------------------------------
# decoration crops from matted sheet
# --------------------------------------------------------------------------
deco_rgba = stage_rgba[DECOR_SHEET_ID]
cells = M.grid_from_alpha(deco_rgba, rows=2, cols=3, pad=10)
if cells is None or len(cells) != len(DECOR_CROPS):
    raise SystemExit(f"decor crop detection failed: cells={cells}")
for (name, alt), box in zip(DECOR_CROPS, cells):
    x0, y0, x1, y1 = box
    crop = deco_rgba[y0:y1, x0:x1]
    crop8 = np.clip(crop, 0, 255).astype(np.uint8)
    out_path = os.path.join(OUT, "decorations", name + ".png")
    Image.fromarray(crop8, "RGBA").save(out_path)
    metrics[name] = {
        "source": SINGLES[DECOR_SHEET_ID][0],
        "operations": ["crop-from-matted-sheet"],
        "src_width": crop.shape[1], "src_height": crop.shape[0],
        "crop_box": [int(v) for v in box],
        "outputs": [{"relpath": rel_out("decorations", name, "png"), "format": "png",
                     "width": crop.shape[1], "height": crop.shape[0],
                     "matting": metrics[DECOR_SHEET_ID]["outputs"][0]["matting"]}],
    }
    print(f"[prepare] {name} crop {box}")

# --------------------------------------------------------------------------
# thumbnail crops from source sheet (white gutters + rounded corners keyed)
# --------------------------------------------------------------------------
thumb_img = M.load_rgb(os.path.join(BASE, THUMB_SHEET_SOURCE.replace("/", os.sep)))
tcells = M.grid_from_nonwhite(thumb_img, rows=2, cols=2, pad=4)
if tcells is None or len(tcells) != len(THUMB_CROPS):
    raise SystemExit(f"thumb crop detection failed: cells={tcells}")

for (name, alt), box in zip(THUMB_CROPS, tcells):
    x0, y0, x1, y1 = box
    crop = thumb_img[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    # corner-key: white gutter remnants at the rounded corners of the panel
    mn = crop.min(axis=2); span = crop.max(axis=2) - mn
    cand = (mn >= 198) & (span <= 22)
    seed = np.zeros(cand.shape, dtype=bool)
    s = 10
    seed[:s, :s] = cand[:s, :s]; seed[:s, -s:] = cand[:s, -s:]
    seed[-s:, :s] = cand[-s:, :s]; seed[-s:, -s:] = cand[-s:, -s:]
    cand2 = cand.copy()
    fill = seed.copy()
    while True:
        grow = M.dilate8(fill) & cand2
        if not grow.any():
            break
        fill |= grow
        cand2 &= ~fill
    alpha = (~fill).astype(np.float64) * 255.0
    rgba = np.dstack([crop, alpha])
    rgba8 = np.clip(rgba, 0, 255).astype(np.uint8)
    out_path = os.path.join(OUT, "thumbnails", name + ".png")
    Image.fromarray(rgba8, "RGBA").save(out_path)
    metrics[name] = {
        "source": THUMB_SHEET_SOURCE,
        "operations": ["crop-from-sheet", "corner-key-white"],
        "src_width": w, "src_height": h,
        "crop_box": [int(v) for v in box],
        "corner_gutter_removed_px": int(fill.sum()),
        "outputs": [{"relpath": rel_out("thumbnails", name, "png"), "format": "png",
                     "width": w, "height": h}],
    }
    print(f"[prepare] {name} crop {box}")

# --------------------------------------------------------------------------
with open(os.path.join(STAGE, "metrics.json"), "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2, ensure_ascii=False)
print("metrics written")

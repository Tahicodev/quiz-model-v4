"""Stage 2: generate manifest.json + validation + processing report.

Manifest conventions (documented in the manifest 'meta' block):
- 'size'       : output file size in BYTES (per approved phase-2 spec).
- 'dimensions' : "WxH" — the legacy Kids assets/assets.txt format used the
  'size' field for pixel dimensions ("1920x1080"); that convention is kept
  under an explicit 'dimensions' key so nothing is ambiguous.
- 'transparent': the file actually carries usable alpha.
- 'filename'   : relative to the manifest (public/assets/games/math-quest/).
- 'source'     : relative to the Math-Quest-Assets root (source-prompts/...).
"""
import datetime
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (CATEGORY_OF, DECOR_CROPS, DECOR_SHEET_ID, SINGLES,
                    THUMB_CROPS, THUMB_SHEET_SOURCE, OUT, STAGE)

with open(os.path.join(STAGE, "metrics.json"), encoding="utf-8") as f:
    metrics = json.load(f)

NAMES = {
    "mq-dino-idle": "Dino mascot pose: idle",
    "mq-dino-celebrate": "Dino mascot pose: celebrate (arms raised)",
    "mq-dino-thinking": "Dino mascot pose: thinking (hand to chin)",
    "mq-dino-surprised": "Dino mascot pose: surprised/pointing",
    "mq-dino-encourage": "Dino mascot pose: encourage (finger raised)",
    "mq-jungle-home": "Background: jungle home world with waterfalls",
    "mq-adventure-trail": "Background: adventure trail winding to a temple",
    "mq-treasure-clearing": "Background: treasure clearing with stone platform",
    "mq-ancient-temple": "Background: ancient overgrown temple entrance",
    "mq-sunset-jungle": "Background: sunset jungle valley",
    "mq-chest-closed": "Closed wooden treasure chest with gold bands",
    "mq-chest-open": "Open treasure chest with empty visible interior",
    "mq-chest-open-glow": "Open treasure chest with soft golden glow",
    "mq-signpost": "Blank wooden signpost with teal gem",
    "mq-gate": "Level gate with gold star emblem",
    "mq-crystal": "Glowing golden collectible crystal",
    "mq-pedestal": "Grass-and-stone reward pedestal platform",
    "mq-grass-tile": "Seamless grass terrain tile",
    "mq-path-tile": "Seamless sandy path tile (corrected from framed original)",
    "mq-floating-platform": "Floating grassy platform with stone base",
    "mq-coin": "Gold coin collectible with star emblem",
    "mq-star": "Golden star collectible",
    "mq-trophy": "Gold trophy cup with star emblem",
    "mq-confetti": "Celebration confetti overlay (transparent)",
    "mq-jungle-decorations": "Jungle decoration sheet (bush, palm, plant, flowers, rock, grass)",
    "math-quest-icon": "Math Quest app icon (rounded corners)",
    "mq-level-home": "Level thumbnail: sunny jungle home world",
    "mq-level-treasure": "Level thumbnail: treasure clearing",
    "mq-level-temple": "Level thumbnail: ancient temple",
    "mq-level-sunset": "Level thumbnail: sunset jungle path",
}
for did, alt in DECOR_CROPS:
    NAMES[did] = alt

ALT = dict(NAMES)
ALT["mq-confetti"] = "Scatter of yellow stars, teal and yellow confetti pieces on transparency"
ALT["mq-level-home"] = "Sunny jungle level thumbnail with waterfall, river and stone path"
ALT["mq-level-treasure"] = "Sunlit jungle clearing level thumbnail with closed treasure chest"
ALT["mq-level-temple"] = "Ancient overgrown temple level thumbnail with stone steps"
ALT["mq-level-sunset"] = "Jungle path leading to the temple at dusk, level thumbnail"
for did, alt in DECOR_CROPS:
    ALT[did] = alt

def is_transparent(path):
    im = Image.open(path)
    if im.mode not in ("RGBA", "LA", "PA"):
        return False
    a = np.asarray(im.convert("RGBA"))[..., 3]
    return bool((a < 250).any())

entries = []
for pid, cat in CATEGORY_OF.items():
    rec = metrics[pid]
    out0 = rec["outputs"][0]
    fmt = out0["format"]
    # metrics relpaths may predate the 2026-10 relocation to public/kids/assets
    filename = (out0["relpath"]
                .replace("public/assets/games/math-quest/", "")
                .replace("public/kids/assets/math-quest/", ""))
    full = os.path.join(OUT, os.path.join(*filename.split("/")))
    im = Image.open(full)
    w, h = im.size
    entries.append({
        "id": pid,
        "category": cat,
        "name": NAMES.get(pid, pid),
        "format": fmt,
        "size": os.path.getsize(full),
        "transparent": is_transparent(full),
        "filename": filename,
        "alt_text": ALT.get(pid, NAMES.get(pid, pid)),
        "source": rec["source"],
        "dimensions": f"{w}x{h}",
    })

# stable ordering: category then id
entries.sort(key=lambda e: (e["category"], e["id"]))
ids = [e["id"] for e in entries]
assert len(ids) == len(set(ids)), "duplicate ids!"

manifest = {
    "game": "math-quest",
    "schema_version": 1,
    "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "meta": {
        "description": "Production assets for the Math Quest kids game, located "
                       "at public/kids/assets/math-quest/ alongside manifest.json, "
                       "processed from Math-Quest-Assets/source-prompts originals "
                       "(never modified).",
        "conventions": {
            "size": "Output file size in bytes.",
            "dimensions": "Pixel size as WxH. NOTE: legacy 'Kids assets/assets.txt' "
                          "used the field name 'size' for dimensions ('1920x1080'); "
                          "that convention is kept here under explicit 'dimensions'.",
            "transparent": "true when the image carries usable alpha channel.",
            "filename": "Path relative to this manifest file.",
            "source": "Path relative to the Math-Quest-Assets folder, where the "
                      "source-prompts originals and the pipeline live; originals "
                      "were not modified.",
        },
    },
    "assets": entries,
}
out_manifest = os.path.join(OUT, "manifest.json")
with open(out_manifest, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------
problems = []
comparisons = []
seen_ids = set()
for e in entries:
    full = os.path.join(OUT, os.path.join(*e["filename"].split("/")))
    rel = e["filename"]
    if not os.path.isfile(full):
        problems.append(f"missing file: {rel}")
        continue
    if e["id"] in seen_ids:
        problems.append(f"duplicate id: {e['id']}")
    seen_ids.add(e["id"])
    try:
        im = Image.open(full)
        im.load()
        fmt = im.format
        if fmt != e["format"].upper():
            problems.append(f"{rel}: format {fmt} != {e['format'].upper()}")
        if f"{im.width}x{im.height}" != e["dimensions"]:
            problems.append(f"{rel}: dimension mismatch {im.width}x{im.height}")
        # transparent check
        alpha_used = False
        if im.mode in ("RGBA", "LA", "PA"):
            a = np.asarray(im.convert("RGBA"))[..., 3]
            alpha_used = bool((a < 250).any())
        if e["transparent"] != alpha_used:
            problems.append(f"{rel}: transparent flag {e['transparent']} != actual {alpha_used}")
        if os.path.getsize(full) != e["size"]:
            problems.append(f"{rel}: size mismatch")
    except Exception as exc:  # decode failure etc.
        problems.append(f"{rel}: decode failure: {exc}")

# orphan check: files on disk not present in manifest
orphans = []
for root, _dirs, files in os.walk(OUT):
    for fn in files:
        p = os.path.relpath(os.path.join(root, fn), OUT).replace(os.sep, "/")
        if fn == "manifest.json":
            continue
        if not any(e["filename"] == p for e in entries):
            orphans.append(p)
if orphans:
    problems.append("orphan files not in manifest: " + ", ".join(orphans))

with open(os.path.join(STAGE, "validation.json"), "w", encoding="utf-8") as f:
    json.dump({"problems": problems, "checked": len(entries)}, f, indent=2)

total_bytes = sum(e["size"] for e in entries)
cats = {}
for e in entries:
    cats[e["category"]] = cats.get(e["category"], 0) + 1
print(f"manifest: {out_manifest}")
print(f"entries: {len(entries)}   bytes: {total_bytes}")
print("per category:", cats)
print("val problems:", problems if problems else "NONE")

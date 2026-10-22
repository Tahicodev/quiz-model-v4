"""Image processing library for the Math Quest asset pipeline.

Implements: checkerboard/background removal (true alpha matting), edge
feathering + color decontamination, sheet crop detection by projection
profiles, tile seamlessness metrics and seamlessizing, debug composites.

Only numpy + Pillow are used so the pipeline is reproducible anywhere.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------
# IO
# --------------------------------------------------------------------------
def load_rgb(path):
    im = Image.open(path)
    im.load()
    if im.mode != "RGB":
        im = im.convert("RGB")
    return np.asarray(im).astype(np.float64)

def save_rgba(arr, path):
    rgba = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path)

def save_rgb(arr, path, fmt=None, quality=90):
    rgb = np.clip(arr, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB")
    im.save(path, format=fmt, quality=quality, method=6) if fmt == "WEBP" else im.save(path, format=fmt) if fmt else im.save(path)

# --------------------------------------------------------------------------
# Background detection
# --------------------------------------------------------------------------
def border_ring(img, frac=0.05):
    h, w, _ = img.shape
    bh = max(2, int(h * frac)); bw = max(2, int(w * frac))
    parts = [img[:bh].reshape(-1, 3), img[-bh:].reshape(-1, 3),
             img[:, :bw].reshape(-1, 3), img[:, -bw:].reshape(-1, 3)]
    return np.concatenate(parts, axis=0)

def detect_bg_colors(img):
    """Learn up to two dominant border colors (checker tones / plain bg)."""
    ring = border_ring(img)
    q = (ring // 16).astype(np.int32)
    vals, counts = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-counts)
    centers = []
    for idx in order:
        c = (vals[idx] + 0.5) * 16
        if all(np.abs(c - cc).max() > 40 for cc in centers):
            centers.append(np.array(c, dtype=np.float64))
        if len(centers) >= 2:
            break
    refined = []
    for c in centers:
        d = np.abs(ring - c).max(axis=1)
        sel = ring[d < 24]
        refined.append(sel.mean(axis=0) if len(sel) > 4 else c)
    return refined

def neutral_bright(img):
    """Bright, low-chroma pixels (checker tones, paper-white junk, white bg)."""
    mn = img.min(axis=2); mx = img.max(axis=2)
    return (mn >= 186) & ((mx - mn) <= 30)

def candidate_mask(img, bg_colors, tol, neutral_min=186, neutral_span=30):
    d_min = None
    for c in bg_colors:
        d = np.abs(img - c.reshape(1, 1, 3)).max(axis=2)
        d_min = d if d_min is None else np.minimum(d_min, d)
    neutral = (img.min(axis=2) >= neutral_min) & ((img.max(axis=2) - img.min(axis=2)) <= neutral_span)
    return (d_min < tol) | neutral

def dilate8(mask):
    h, w = mask.shape
    buf = np.zeros((h + 2, w + 2), dtype=bool)
    buf[1:-1, 1:-1] = mask
    out = buf[:-2, 1:-1].copy()          # up
    out |= buf[2:, 1:-1]                 # down
    out |= buf[1:-1, :-2]                # left
    out |= buf[1:-1, 2:]                 # right
    out |= buf[:-2, :-2] | buf[:-2, 2:]  # upper corners
    out |= buf[2:, :-2] | buf[2:, 2:]    # lower corners
    return out

def border_connected_fill(cand):
    """Flood fill: candidate pixels connected to the image border (8-neighborhood).
    Guarantees no interior holes are punched into the subject."""
    h, w = cand.shape
    m = np.zeros((h, w), dtype=bool)
    m[0, :] = cand[0, :]; m[-1, :] = cand[-1, :]
    m[:, 0] |= cand[:, 0]; m[:, -1] |= cand[:, -1]
    cand &= ~m  # update in place; NOTE caller passes a copy
    while True:
        grow = dilate8(m) & cand
        if not grow.any():
            break
        m |= grow
        cand &= ~m
    return m

def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)

def matte(img, max_tries=5, verbose=False):
    """Remove checkerboard/white background with true alpha matting.

    Returns (rgba_float_array, metrics_dict). Iterates tolerance escalation
    while loose neutral background junk ("paper frill" remnants, blocky
    leftovers) remains detectable inside the matte."""
    metrics = {}
    base_colors = detect_bg_colors(img)
    tol = 24.0
    # Looser initial key: the AI renders pale "paper-frill" junk (min 170-200,
    # low chroma) around subjects; a strict key leaves blocky remnants.
    neutral_min, neutral_span = 176, 36
    out_rgb, a_edge = None, None
    for attempt in range(max_tries):
        colors = base_colors
        cand = candidate_mask(img, colors, tol, neutral_min, neutral_span).copy()
        fill = border_connected_fill(cand)
        fg = ~fill

        # alpha refinement: subject pixels adjacent to removed bg
        near_bg = dilate8(fill) & ~fill   # subject-side 1px ring
        # distance of each band pixel to nearest learned bg color
        d_min = None
        for c in colors:
            d = np.abs(img - c.reshape(1, 1, 3)).max(axis=2)
            d_min = d if d_min is None else np.minimum(d_min, d)
        alpha = fg.astype(np.float64)
        soft = 1.0 - smoothstep((d_min - (tol - 8)) / 20.0)
        a_edge = np.minimum(alpha, soft)          # don't raise interior alpha
        a_edge = np.where(near_bg, np.minimum(alpha, np.maximum(a_edge, 0.25)), alpha)
        # soften the bg-side fringe too (keeps AA leftover with low alpha)
        fringe = fill & dilate8(~fill)
        a_edge = np.where(fringe, 0.0, a_edge)

        # color decontamination on partial pixels (remove bg bleed)
        eye = a_edge < 1.0
        if eye.any():
            d0 = None
            for c in colors:
                d = np.abs(img - c.reshape(1, 1, 3)).max(axis=2)
                d0 = d if d0 is None else np.minimum(d0, d)
            c_near = colors[int(np.argmin([d0.mean(), 1e9]))] if len(colors) == 1 else None
            if len(colors) > 1:
                d1 = np.abs(img - colors[0].reshape(1, 1, 3)).max(axis=2)
                d2 = np.abs(img - colors[1].reshape(1, 1, 3)).max(axis=2)
                pick_first = (d1 <= d2)
                c_near = np.where(pick_first[..., None], colors[0].reshape(1, 1, 3), colors[1].reshape(1, 1, 3))
            a_s = np.maximum(a_edge, 1e-3)[..., None]
            unmixed = (img - (1.0 - a_s) * c_near) / a_s
            out_rgb = np.where(eye[..., None], np.clip(unmixed, 0, 255), img)
        else:
            out_rgb = img

        # QA: leftovers = alpha>30 pixels that look like loose checker/paper
        # junk (pale neutral tones well inside the matte), i.e. frill remnants
        lo = (out_rgb.min(axis=2) >= 168) & ((out_rgb.max(axis=2) - out_rgb.min(axis=2)) <= 46)
        loose_junk = int((lo & (a_edge > 30)).sum())
        metrics = {
            "tol": tol, "neutral_min": neutral_min, "neutral_span": neutral_span,
            "bg_removed_pct": round(100.0 * fill.mean(), 2),
            "loose_junk_px": loose_junk,
        }
        if verbose:
            print(f"    attempt {attempt}: tol={tol} removed={metrics['bg_removed_pct']}% "
                  f"loose_junk={loose_junk}")
        if loose_junk < max(40, int(0.00003 * img.shape[0] * img.shape[1])):
            break
        tol += 6.0
        neutral_min = max(164, neutral_min - 6)
        neutral_span = min(52, neutral_span + 8)
    rgba = np.dstack([out_rgb, a_edge * 255.0])
    return rgba, metrics

# --------------------------------------------------------------------------
# Debug composites
# --------------------------------------------------------------------------
def composite_over(rgba, color):
    a = rgba[..., 3:4] / 255.0
    return rgba[..., :3] * a + np.array(color, dtype=np.float64).reshape(1, 1, 3) * (1 - a)

# --------------------------------------------------------------------------
# Projection-profile crop detection
# --------------------------------------------------------------------------
def _bands(profile, min_gap=4, min_size=40, keep_n=None):
    """Find contiguous runs where profile > 0 (regions), separated by gaps."""
    on = profile > 0.5
    bands = []
    i = 0
    n = len(on)
    while i < n:
        if on[i]:
            j = i
            while j + 1 < n and on[j + 1]:
                j += 1
            if j - i + 1 >= min_size:
                bands.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    # merge bands separated by tiny gaps
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    if keep_n is not None and len(merged) > keep_n:
        # keep the keep_n widest
        merged = sorted(sorted(merged, key=lambda b: b[1] - b[0], reverse=True)[:keep_n])
    return merged

def grid_from_alpha(rgba, rows=2, cols=3, pad=8):
    """Detect content cells in a matted sheet via alpha projection profiles."""
    a = rgba[..., 3]
    colprof = a.sum(axis=0); rowprof = a.sum(axis=1)
    rb = _bands(rowprof, min_size=60, keep_n=rows)
    cb = _bands(colprof, min_size=60, keep_n=cols)
    if len(rb) != rows or len(cb) != cols:
        return None
    h, w = a.shape
    cells = []
    for r0, r1 in rb:
        for c0, c1 in cb:
            cell = a[r0:r1, c0:c1]
            ys, xs = np.nonzero(cell > 8)
            if len(ys) == 0:
                return None
            y0, y1 = r0 + ys.min(), r0 + ys.max() + 1
            x0, x1 = c0 + xs.min(), c0 + xs.max() + 1
            cells.append((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
    return cells

def grid_from_nonwhite(img, rows=2, cols=2, pad=6, white_thr=244):
    """Detect full-bleed panels on a white-gutter sheet."""
    nonwhite = img.mean(axis=2) < white_thr
    colprof = nonwhite.sum(axis=0); rowprof = nonwhite.sum(axis=1)
    rb = _bands(rowprof, min_size=200, keep_n=rows)
    cb = _bands(colprof, min_size=200, keep_n=cols)
    if len(rb) != rows or len(cb) != cols:
        return None
    h, w = img.shape[:2]
    cells = []
    for r0, r1 in rb:
        for c0, c1 in cb:
            cell = nonwhite[r0:r1, c0:c1]
            ys, xs = np.nonzero(cell)
            if len(ys) == 0:
                return None
            y0, y1 = r0 + ys.min(), r0 + ys.max() + 1
            x0, x1 = c0 + xs.min(), c0 + xs.max() + 1
            cells.append((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
    return cells

# --------------------------------------------------------------------------
# Tile seamlessness
# --------------------------------------------------------------------------
def seam_metrics(img):
    """Wrap-around continuity: compare opposite borders."""
    f = img.astype(np.float64)
    lr = np.abs(f[:, 0] - f[:, -1])
    tb = np.abs(f[0, :] - f[-1, :])
    lr95 = np.percentile(lr, 95); tb95 = np.percentile(tb, 95)
    return {
        "left_right_mean": round(float(lr.mean()), 2),
        "top_bottom_mean": round(float(tb.mean()), 2),
        "left_right_p95": round(float(lr95), 2),
        "top_bottom_p95": round(float(tb95), 2),
        "seamless": bool(lr.mean() < 6 and tb.mean() < 6 and lr95 < 24 and tb95 < 24),
    }

def make_seamless_by_inset(img, inset):
    """Corrected tile: drop the painted frame by insetting, then resize back."""
    h, w = img.shape[:2]
    core = img[inset:h - inset, inset:w - inset]
    im = Image.fromarray(np.clip(core, 0, 255).astype(np.uint8), "RGB")
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float64)

def make_seamless_by_wrap_blend(img):
    """Half-offset wrap + cross blend: seams become interior texture."""
    h, w = img.shape[:2]
    wrapped = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    ys = np.abs(np.linspace(-1, 1, h)); xs = np.abs(np.linspace(-1, 1, w))
    wx = (xs ** 1.5)[None, :, None]      # weight near left/right edges
    wy = (ys ** 1.5)[:, None, None]      # weight near top/bottom edges
    wmap = np.maximum(wx, wy)            # 0 at center -> keep original; 1 at seams -> wrapped
    out = (1 - wmap) * img + wmap * wrapped
    return out

"""Central configuration for the Math Quest asset pipeline.

All paths are relative to the Math-Quest-Assets folder so the pipeline is
reproducible on any machine. Originals under source-prompts/ are never
modified; every operation only writes into pipeline/ or the production
output at public/kids/assets/math-quest/ in the main repo.
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BASE)

SRC = os.path.join(BASE, "source-prompts")
OUT = os.path.join(REPO_ROOT, "public", "kids", "assets", "math-quest")
STAGE = os.path.join(BASE, "pipeline", "stage")
DEBUG = os.path.join(BASE, "pipeline", "debug")

SP = "source-prompts"

# ---------------------------------------------------------------------------
# Single-source mappings: production_id -> (source_relpath, operations)
# operations is a list of step names executed by run_prepare.py
# ---------------------------------------------------------------------------
SINGLES = {
    # characters -> png + matting
    "mq-dino-idle":       (f"{SP}/Main mascot and character poses/mq-dino-idle.jpg", ["matte"]),
    "mq-dino-celebrate":  (f"{SP}/Main mascot and character poses/mq-dino-celebrate.jpg", ["matte"]),
    "mq-dino-thinking":   (f"{SP}/Main mascot and character poses/mq-dino-thinking.jpg", ["matte"]),
    "mq-dino-surprised":  (f"{SP}/Main mascot and character poses/mq-dino-surprised.jpg", ["matte"]),
    "mq-dino-encourage":  (f"{SP}/Main mascot and character poses/mq-dino-encourage.jpg", ["matte"]),

    # backgrounds -> opaque webp
    "mq-jungle-home":     (f"{SP}/Main backgrounds and game scenarios/Jungle home world.jpg", ["webp"]),
    "mq-adventure-trail": (f"{SP}/Main backgrounds and game scenarios/Adventure trail.jpg", ["webp"]),
    "mq-treasure-clearing": (f"{SP}/Main backgrounds and game scenarios/Treasure clearing.jpg", ["webp"]),
    "mq-ancient-temple":  (f"{SP}/Main backgrounds and game scenarios/Ancient temple.jpg", ["webp"]),
    "mq-sunset-jungle":   (f"{SP}/Main backgrounds and game scenarios/Sunset jungle.jpg", ["webp"]),

    # props
    "mq-chest-closed":    (f"{SP}/Reusable jungle objects and rewards/Closed chest.jpg", ["matte"]),
    "mq-chest-open":      (f"{SP}/Reusable jungle objects and rewards/Open chest with an empty visible interior.jpg", ["matte"]),
    "mq-chest-open-glow": (f"{SP}/Reusable jungle objects and rewards/Open chest with a soft golden glow, but no coins or stars inside.jpg", ["matte"]),
    "mq-signpost":        (f"{SP}/Reusable jungle objects and rewards/Blank wooden signpost.jpg", ["matte"]),
    "mq-gate":            (f"{SP}/Additional gameplay objects/Level gate.jpg", ["matte"]),
    "mq-crystal":         (f"{SP}/Additional gameplay objects/Collectible crystal.jpg", ["matte"]),
    "mq-pedestal":        (f"{SP}/Terrain tiles and reusable platforms/Reward pedestal.jpg", ["matte"]),

    # terrain
    "mq-grass-tile":      (f"{SP}/Terrain tiles and reusable platforms/Grass terrain tile.jpg", ["tile-check"]),
    "mq-path-tile":       (f"{SP}/Terrain tiles and reusable platforms/Sandy adventure path tile.jpg", ["tile-check"]),
    "mq-floating-platform": (f"{SP}/Terrain tiles and reusable platforms/Floating grassy platform.jpg", ["matte"]),

    # rewards
    "mq-coin":            (f"{SP}/Reusable jungle objects and rewards/Gold coin collectible.jpg", ["matte"]),
    "mq-star":            (f"{SP}/Reusable jungle objects and rewards/Golden star collectible.jpg", ["matte"]),
    "mq-trophy":          (f"{SP}/Additional gameplay objects/Trophy.jpg", ["matte"]),

    # effects
    "mq-confetti":        (f"{SP}/Additional gameplay objects/Celebration effects.jpg", ["matte"]),

    # decorations (matted full sheet is itself a production artifact)
    "mq-jungle-decorations": (f"{SP}/Reusable jungle objects and rewards/Jungle decoration set.jpg", ["matte"]),

    # icons
    "math-quest-icon":    (f"{SP}/Game icon and thumbnails/Math Quest game icon.jpg", ["matte"]),
}

# ---------------------------------------------------------------------------
# Sheet crops
# decor_id -> decor sheet production id; crop rects are detected automatically
# from the matted sheet via alpha projection profiles, in reading order
# (row-major): bush, palm, plant, flowers, rock, grass.
# ---------------------------------------------------------------------------
DECOR_SHEET_ID = "mq-jungle-decorations"
DECOR_CROPS = [
    ("mq-decor-bush",    "Round bushy shrub with dense green leaves"),
    ("mq-decor-palm",    "Cartoon palm tree with curved trunk"),
    ("mq-decor-plant",   "Broad banana-leaf jungle plant"),
    ("mq-decor-flowers", "Cluster of pink, blue and yellow jungle flowers with leaves"),
    ("mq-decor-rock",    "Smooth gray boulder with small plants at the base"),
    ("mq-decor-grass",   "Tuft of pointed green grass"),
]

# Thumb sheet: 2x2 grid, reading order. Panels are white-gutter separated;
# crops detected automatically from the source sheet.
THUMB_SHEET_SOURCE = f"{SP}/Game icon and thumbnails/Level thumbnail set.jpg"
THUMB_SHEET_SRC_ID = "mq-level-thumbnail-sheet-src"  # internal only, never an output
THUMB_CROPS = [
    ("mq-level-home",     "Top-left panel: sunny jungle with waterfall, river and stone path (level select thumbnail)"),
    ("mq-level-treasure", "Top-right panel: sunlit jungle clearing with closed treasure chest (level select thumbnail)"),
    ("mq-level-temple",   "Bottom-left panel: ancient overgrown temple with stone steps (level select thumbnail)"),
    ("mq-level-sunset",   "Bottom-right panel: jungle path leading to the temple at dusk (level select thumbnail)"),
]

# Non-tile assets get PNG; backgrounds get WEBP. Ordered stable name list:
CATEGORY_OF = {
    "mq-dino-idle": "characters", "mq-dino-celebrate": "characters", "mq-dino-thinking": "characters",
    "mq-dino-surprised": "characters", "mq-dino-encourage": "characters",
    "mq-jungle-home": "backgrounds", "mq-adventure-trail": "backgrounds",
    "mq-treasure-clearing": "backgrounds", "mq-ancient-temple": "backgrounds",
    "mq-sunset-jungle": "backgrounds",
    "mq-chest-closed": "props", "mq-chest-open": "props", "mq-chest-open-glow": "props",
    "mq-signpost": "props", "mq-gate": "props", "mq-crystal": "props", "mq-pedestal": "props",
    "mq-grass-tile": "terrain", "mq-path-tile": "terrain", "mq-floating-platform": "terrain",
    "mq-coin": "rewards", "mq-star": "rewards", "mq-trophy": "rewards",
    "mq-confetti": "effects",
    "mq-jungle-decorations": "decorations",
    "mq-decor-bush": "decorations", "mq-decor-palm": "decorations", "mq-decor-plant": "decorations",
    "mq-decor-flowers": "decorations", "mq-decor-rock": "decorations", "mq-decor-grass": "decorations",
    "math-quest-icon": "icons",
    "mq-level-home": "thumbnails", "mq-level-treasure": "thumbnails",
    "mq-level-temple": "thumbnails", "mq-level-sunset": "thumbnails",
}

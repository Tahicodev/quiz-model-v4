# Kids Space asset inventory

The supplied assets in `public/kids/assets/` are now wired into the player. Their actual filenames and extensions are used directly, including `.png`, `.jpg`, and `.mp3`; no conversion is required. The legacy placeholder SVG is no longer used by the player.

| Asset | Where used | Suggested format / size | Status |
|---|---|---|---|
| Theme scene backgrounds: jungle, space, ocean, farm, castle, dinosaur, forest, city, circus, magic, school, superhero | Player backdrop and adventure banners | Mixed PNG/JPG supplied | Integrated |
| Mascot poses (idle, happy, encourage, excited, amazed, celebrate) | Header and answer feedback | Mixed JPG/PNG supplied | Integrated |
| Adventure props: treasure chest/map, obstacle, board/die, puzzle pieces, build blocks, tap target | Six adventure wrappers | JPG supplied | Integrated |
| Immersive props: rescue animals, planets, ingredients, escape locks, seeds/crops | Five immersive worlds | JPG/PNG supplied | Integrated |
| Reward badges: finish, star master, streak hero | Completion screen | PNG supplied | Integrated |
| UI sounds: correct, retry, celebration, hint | `SoundManager` feedback hooks | MP3 supplied | Integrated |
| Puzzle reveal image | Puzzle levels (`media_url`) | WebP, 1200×675 | Per activity, teacher supplied |

All art must be child-safe, licensed for commercial educational use, avoid embedded text, and include descriptive alt text in the activity content.

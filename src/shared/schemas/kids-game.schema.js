import { z } from 'zod';

const KIDS_GAME_TYPES = [
  'bubble-pop', 'star-collector', 'leap-frog', 'sort-it-out',
  'pair-party', 'build-a-tower', 'magic-words', 'code-explorer',
  'math-quest'
];

const KIDS_THEMES = [
  'jungle', 'space', 'ocean', 'farm', 'castle',
  'dinosaur', 'forest', 'city', 'circus', 'magic', 'school', 'superhero'
];

const KIDS_GRADES = ['maternelle', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'];
const KIDS_STATUS = ['draft', 'published', 'archived'];

export const KidsGameCreateSchema = z.object({
  name:           z.string().min(1).max(200),
  description:    z.string().max(1000).optional().nullable(),
  game_type:      z.enum(KIDS_GAME_TYPES),
  theme:          z.enum(KIDS_THEMES).default('jungle'),
  grade:          z.enum(KIDS_GRADES).optional().nullable(),
  subject:        z.string().max(100).optional().nullable(),
  questions_json: z.string().min(2),
  config_json:    z.string().optional().nullable(),
  status:         z.enum(KIDS_STATUS).default('draft'),
});

// NOTE: intentionally NOT `KidsGameCreateSchema.partial()` — .partial()
// keeps .default() values, so any PATCH omitting `status`/`theme` would
// silently reset them to draft/jungle (unpublishing live games).
export const KidsGameUpdateSchema = z.object({
  name:           z.string().min(1).max(200).optional(),
  description:    z.string().max(1000).optional().nullable(),
  game_type:      z.enum(KIDS_GAME_TYPES).optional(),
  theme:          z.enum(KIDS_THEMES).optional(),
  grade:          z.enum(KIDS_GRADES).optional().nullable(),
  subject:        z.string().max(100).optional().nullable(),
  questions_json: z.string().min(2).optional(),
  config_json:    z.string().optional().nullable(),
  status:         z.enum(KIDS_STATUS).optional(),
});

export const KidsGameFilterSchema = z.object({
  game_type:  z.enum(KIDS_GAME_TYPES).optional(),
  grade:      z.enum(KIDS_GRADES).optional(),
  subject:    z.string().optional(),
  status:     z.enum(KIDS_STATUS).optional(),
  teacher_id: z.string().uuid().optional(),
  search:     z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
  orderBy:    z.enum(['created_at', 'name', 'status', 'play_count']).default('created_at'),
  direction:  z.enum(['asc', 'desc']).default('desc'),
});

export const KidsSessionCreateSchema = z.object({
  player_name: z.string().min(1).max(50),
  avatar:      z.string().max(10).optional(),
});

export const KidsSessionCompleteSchema = z.object({
  answers_json: z.string(),
  score:        z.number().int().min(0),
  stars:        z.number().int().min(0).max(3),
  completed:    z.boolean().default(true),
  // Optional Kids Championship link: the lobby opens play.html with
  // ?championship=<id>, the player echoes it back on completion and the
  // server records the (server-graded) score against that championship.
  championship_id: z.string().uuid().optional(),
  // Math Quest hint — WHICH adventure level this completed run belongs to.
  // The server never trusts it blind: it first re-derives the level from the
  // answered question ids; the hint is only honoured after validating that
  // the answers really fit inside that level. Scores/stars above are graded
  // server-side regardless.
  level_id:     z.string().max(80).optional(),
});

// ─── Math Quest level plan (teacher-curated config_json.levels) ─────────────
// Every level needs a stable id (progress rows and unlock logic key on it),
// a title, and an explicit question-id list. pass_stars (1..3) is the
// threshold a student's best stars on this level must reach to unlock the
// NEXT level; missing → 1 (any completed star unlocks). `art` picks one of
// the four shipped map thumbnails; missing → a graceful CSS/emoji fallback.
// `template` (stage 5) is an optional teacher presentation pick per level;
// 'auto' (or missing) keeps the per-question inference. The runtime
// re-checks compatibility with the actual question data before using it —
// an incompatible/absent pick never breaks a run (client fallback chain).
export const MQ_TEMPLATE_VALUES = [
  'auto', 'story-cards', 'art-pick', 'gate-choose',
  'order-cards', 'pair-match', 'rune-word',
];

export const KidQuestLevelSchema = z.object({
  id:         z.string().min(1).max(80),
  name:       z.string().min(1).max(60),
  questions:  z.array(z.string().min(1)).min(1).max(30),
  pass_stars: z.number().int().min(1).max(3).optional(),
  art:        z.enum(['home', 'treasure', 'temple', 'sunset']).optional(),
  template:   z.enum(MQ_TEMPLATE_VALUES).optional().nullable(),
});

export const KidQuestLevelsSchema = z.array(KidQuestLevelSchema).min(1).max(12);

export const KidsBrowseSchema = z.object({
  search: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Logged-in play (students in session, teacher preview): identity is linked
// so results, leaderboards and gamification treat it like any other game.
export const KidsAuthedSessionSchema = z.object({
  player_name:   z.string().min(1).max(50).optional(),
  avatar:        z.string().max(10).optional(),
  tournament_id: z.string().uuid().optional(),
});

export const KidsAIGenerateSchema = z.object({
  game_type:   z.enum(KIDS_GAME_TYPES),
  topic:       z.string().min(1).max(500),
  count:       z.coerce.number().int().min(1).max(20).default(5),
  grade:       z.enum(KIDS_GRADES).default('cp'),
  language:    z.string().max(40).default('fr'),
  // Optional explicit model (shared or personal). Falls back to the school
  // default, then the first visible config — same policy as the main
  // structured generator.
  configId:    z.string().max(100).optional(),
});
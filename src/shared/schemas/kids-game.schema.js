import { z } from 'zod';

const KIDS_GAME_TYPES = [
  'bubble-pop', 'star-collector', 'leap-frog', 'sort-it-out',
  'pair-party', 'build-a-tower', 'magic-words', 'code-explorer'
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

export const KidsGameUpdateSchema = KidsGameCreateSchema.partial();

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
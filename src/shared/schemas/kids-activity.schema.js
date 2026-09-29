import { z } from 'zod';
import {
  KIDS_GAME_TEMPLATES,
  KIDS_CORE_MECHANICS,
  KIDS_ACTIVITY_STATUS,
  KIDS_THEMES,
  KIDS_SUBJECTS,
  KIDS_GRADES,
  KIDS_DIFFICULTY,
} from '../constants.js';

const templateValues = Object.values(KIDS_GAME_TEMPLATES);
const coreMechanicValues = Object.values(KIDS_CORE_MECHANICS);
const statusValues = Object.values(KIDS_ACTIVITY_STATUS);
const themeValues = Object.values(KIDS_THEMES);
const subjectValues = Object.values(KIDS_SUBJECTS);
const gradeValues = Object.values(KIDS_GRADES);
const difficultyValues = Object.values(KIDS_DIFFICULTY);

// ── Level Content Schemas (per core mechanic) ───────────────────────────────

export const MultipleChoiceContentSchema = z.object({
  instruction: z.string().min(1),
  question:    z.string().min(1),
  image:       z.string().optional().nullable(),
  audio:       z.string().optional().nullable(),
  options:     z.array(z.object({
    id:    z.string(),
    value: z.string(),
    image: z.string().optional().nullable(),
    emoji: z.string().optional().nullable(),
  })).min(2).max(6),
  correctId:   z.string(),
});

export const WordOrderContentSchema = z.object({
  instruction: z.string().min(1),
  image:       z.string().optional().nullable(),
  audio:       z.string().optional().nullable(),
  answer:      z.string().min(1),
  items:       z.array(z.object({
    id:    z.string(),
    value: z.string(),
  })).min(2),
});

export const DragDropContentSchema = z.object({
  instruction: z.string().min(1),
  image:       z.string().optional().nullable(),
  audio:       z.string().optional().nullable(),
  template:    z.string().min(1), // e.g. "Le chat mange une {blank}." or "e n f _ n t"
  blanks:      z.array(z.object({
    position: z.number().int().min(0),
    answer:   z.string().min(1),
  })).min(1),
  choices:     z.array(z.object({
    id:    z.string(),
    value: z.string(),
  })).min(2),
});

export const MatchingContentSchema = z.object({
  instruction: z.string().min(1),
  image:       z.string().optional().nullable(),
  audio:       z.string().optional().nullable(),
  pairs:       z.array(z.object({
    id:         z.string(),
    left:       z.string().min(1),
    right:      z.string().min(1),
    leftImage:  z.string().optional().nullable(),
    rightImage: z.string().optional().nullable(),
    leftEmoji:  z.string().optional().nullable(),
    rightEmoji: z.string().optional().nullable(),
  })).min(2).max(10),
});

export const MemoryContentSchema = z.object({
  instruction: z.string().min(1),
  cards:       z.array(z.object({
    id:      z.string(),
    matchId: z.string(),
    value:   z.string(),
    image:   z.string().optional().nullable(),
    emoji:   z.string().optional().nullable(),
    type:    z.enum(['text', 'image', 'emoji']).default('text'),
  })).min(4).max(24),
});

export const SortingContentSchema = z.object({
  instruction: z.string().min(1),
  categories:  z.array(z.object({
    id:    z.string(),
    label: z.string().min(1),
    color: z.string().optional().nullable(),
    emoji: z.string().optional().nullable(),
  })).min(2).max(4),
  items:       z.array(z.object({
    id:         z.string(),
    value:      z.string().min(1),
    image:      z.string().optional().nullable(),
    emoji:      z.string().optional().nullable(),
    categoryId: z.string().min(1),
  })).min(3).max(30),
});

export const SequenceContentSchema = z.object({
  instruction:  z.string().min(1),
  image:        z.string().optional().nullable(),
  items:        z.array(z.object({
    id:    z.string(),
    value: z.string().min(1),
    image: z.string().optional().nullable(),
    emoji: z.string().optional().nullable(),
  })).min(2).max(12),
  correctOrder: z.array(z.string()).min(2),
});

export const FindCorrectContentSchema = z.object({
  instruction: z.string().min(1),
  question:    z.string().min(1),
  image:       z.string().optional().nullable(),
  items:       z.array(z.object({
    id:    z.string(),
    value: z.string().min(1),
    image: z.string().optional().nullable(),
    emoji: z.string().optional().nullable(),
  })).min(3).max(12),
  correctId:   z.string().min(1),
});

export const BubblePopContentSchema = z.object({
  instruction: z.string().min(1),
  target:      z.object({
    value: z.string().min(1),
    type:  z.enum(['text', 'image', 'emoji']).default('text'),
  }),
  bubbles:     z.array(z.object({
    id:        z.string(),
    value:     z.string().min(1),
    isCorrect: z.boolean(),
  })).min(3).max(20),
});

export const NarrativeSchema = z.object({
  storyText:        z.string().optional().nullable(),
  characterSays:    z.string().optional().nullable(),
  sceneDescription: z.string().optional().nullable(),
  sceneEmoji:       z.string().optional().nullable(),
});

export const LEVEL_CONTENT_SCHEMAS = {
  multiple_choice: MultipleChoiceContentSchema,
  word_order:      WordOrderContentSchema,
  drag_drop:       DragDropContentSchema,
  matching:        MatchingContentSchema,
  memory:          MemoryContentSchema,
  sorting:         SortingContentSchema,
  sequence:        SequenceContentSchema,
  find_correct:    FindCorrectContentSchema,
  bubble_pop:      BubblePopContentSchema,
};

/** Validate raw JSON string or object against a core mechanic schema */
export function validateLevelContent(levelType, content) {
  const schema = LEVEL_CONTENT_SCHEMAS[levelType];
  if (!schema) {
    // If it's an adventure/immersive wrapper, fallback to general object
    return typeof content === 'string' ? JSON.parse(content) : content;
  }
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  return schema.parse(parsed);
}

// ── Kids Activity Level Schemas ──────────────────────────────────────────────

export const KidsActivityLevelCreateSchema = z.object({
  order_index:    z.number().int().min(0).default(0),
  level_type:     z.string().min(1),
  content_json:   z.union([z.string(), z.record(z.any())]).transform(v => typeof v === 'string' ? v : JSON.stringify(v)),
  points:         z.number().int().min(1).max(500).default(10),
  hint:           z.string().max(300).optional().nullable(),
  explanation:    z.string().max(500).optional().nullable(),
  media_url:      z.string().optional().nullable(),
  narrative_json: z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? null : (typeof v === 'string' ? v : JSON.stringify(v))),
});

export const KidsActivityLevelUpdateSchema = z.object({
  order_index:    z.number().int().min(0).optional(),
  level_type:     z.string().min(1).optional(),
  content_json:   z.union([z.string(), z.record(z.any())]).optional().transform(v => !v ? undefined : (typeof v === 'string' ? v : JSON.stringify(v))),
  points:         z.number().int().min(1).max(500).optional(),
  hint:           z.string().max(300).optional().nullable(),
  explanation:    z.string().max(500).optional().nullable(),
  media_url:      z.string().optional().nullable(),
  narrative_json: z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? null : (typeof v === 'string' ? v : JSON.stringify(v))),
});

// ── Kids Activity CRUD Schemas ───────────────────────────────────────────────

export const KidsActivityCreateSchema = z.object({
  title:               z.string().min(1).max(200),
  description:         z.string().max(2000).optional().nullable(),
  subject:             z.string().min(1).max(50),
  sub_topic:           z.string().max(100).optional().nullable(),
  grade:               z.string().min(1).max(20),
  age_min:             z.coerce.number().int().min(3).max(15).default(5),
  age_max:             z.coerce.number().int().min(3).max(15).default(12),
  objective:           z.string().max(500).optional().nullable(),
  game_template:       z.string().min(1).default('multiple_choice'),
  theme:               z.string().default('jungle'),
  difficulty:          z.string().default('easy'),
  language:            z.string().default('fr'),
  settings_json:       z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? null : (typeof v === 'string' ? v : JSON.stringify(v))),
  rewards_json:        z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? null : (typeof v === 'string' ? v : JSON.stringify(v))),
  progression_json:    z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? null : (typeof v === 'string' ? v : JSON.stringify(v))),
  estimated_duration:  z.coerce.number().int().min(1).max(120).optional().nullable(),
  levels:              z.array(KidsActivityLevelCreateSchema).optional(),
});

export const KidsActivityUpdateSchema = z.object({
  title:               z.string().min(1).max(200).optional(),
  description:         z.string().max(2000).optional().nullable(),
  subject:             z.string().min(1).max(50).optional(),
  sub_topic:           z.string().max(100).optional().nullable(),
  grade:               z.string().min(1).max(20).optional(),
  age_min:             z.coerce.number().int().min(3).max(15).optional(),
  age_max:             z.coerce.number().int().min(3).max(15).optional(),
  objective:           z.string().max(500).optional().nullable(),
  game_template:       z.string().min(1).optional(),
  theme:               z.string().optional(),
  difficulty:          z.string().optional(),
  status:              z.enum(statusValues).optional(),
  language:            z.string().optional(),
  settings_json:       z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? undefined : (typeof v === 'string' ? v : JSON.stringify(v))),
  rewards_json:        z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? undefined : (typeof v === 'string' ? v : JSON.stringify(v))),
  progression_json:    z.union([z.string(), z.record(z.any())]).optional().nullable().transform(v => !v ? undefined : (typeof v === 'string' ? v : JSON.stringify(v))),
  estimated_duration:  z.coerce.number().int().min(1).max(120).optional().nullable(),
  is_favorite:         z.boolean().optional(),
  // When supplied by the teacher wizard, this is a complete replacement set.
  // Keeping it optional preserves small metadata-only edits.
  levels:              z.array(KidsActivityLevelCreateSchema).optional(),
});

export const KidsActivityFilterSchema = z.object({
  subject:       z.string().optional(),
  grade:         z.string().optional(),
  game_template: z.string().optional(),
  theme:         z.string().optional(),
  status:        z.string().optional(),
  search:        z.string().optional(),
  is_favorite:   z.coerce.boolean().optional(),
  limit:         z.coerce.number().int().min(1).max(200).default(50),
  offset:        z.coerce.number().int().min(0).default(0),
  orderBy:       z.enum(['created_at', 'title', 'play_count', 'updated_at']).default('created_at'),
  direction:     z.enum(['asc', 'desc']).default('desc'),
});

// ── AI Generation Request (Teacher Wizard) ──────────────────────────────────

export const KidsAIGenerateSchema = z.object({
  subject:       z.string().min(1),
  sub_topic:     z.string().min(1).max(500),
  grade:         z.string().min(1),
  age_min:       z.coerce.number().int().min(3).max(15).default(5),
  age_max:       z.coerce.number().int().min(3).max(15).default(12),
  objective:     z.string().max(500).optional(),
  game_template: z.string().optional(), // optional: AI/GameSelector picks if empty
  theme:         z.string().optional(),
  difficulty:    z.string().default('easy'),
  count:         z.coerce.number().int().min(1).max(30).default(8),
  language:      z.enum(['fr', 'en', 'ar']).default('fr'),
  // Optional: pick a specific AIConfig row instead of the school default, so a
  // teacher can choose which model generates their levels in Game Studio.
  model_id:      z.string().min(1).optional(),
});

// ── Play & Join Schemas ──────────────────────────────────────────────────────

export const KidsJoinSchema = z.object({
  join_code:   z.string().length(6).optional(),
  activity_id: z.string().uuid().optional(),
}).refine(d => d.join_code || d.activity_id, {
  message: 'Either join_code or activity_id is required',
});

export const KidsAnswerSubmissionSchema = z.object({
  level_id:   z.string().min(1),
  answer:     z.any(), // string, array of ids, or object depending on mechanic
  time_ms:    z.number().int().min(0).default(0),
  attempts:   z.number().int().min(1).default(1),
});

export const KidsHintRequestSchema = z.object({
  level_id:   z.string().min(1),
});

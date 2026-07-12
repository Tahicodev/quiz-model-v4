import { z } from 'zod';
import { QUESTION_TYPES, DIFFICULTY } from '../constants.js';

const typeValues       = Object.values(QUESTION_TYPES);
const difficultyValues = Object.values(DIFFICULTY);

export const QuestionCreateSchema = z.object({
  category_id:  z.string().uuid().optional().nullable(),
  type:         z.enum(typeValues),
  text:         z.string().min(1).max(2000),
  options_json: z.string().optional().nullable(), // JSON string of string[]
  answer:       z.string().min(1),
  explanation:  z.string().max(2000).optional().nullable(),
  points:       z.coerce.number().int().min(1).max(100).default(1),
  difficulty:   z.enum(difficultyValues).default('medium'),
  tags:         z.string().max(500).optional().nullable(), // comma-separated
  media_url:    z.string().url().optional().nullable(),
});

export const QuestionUpdateSchema = QuestionCreateSchema.partial();

export const QuestionFilterSchema = z.object({
  category_id: z.string().uuid().optional(),
  type:        z.enum(typeValues).optional(),
  difficulty:  z.enum(difficultyValues).optional(),
  search:      z.string().optional(),
  tags:        z.string().optional(),
  limit:       z.coerce.number().int().min(1).max(200).default(50),
  offset:      z.coerce.number().int().min(0).default(0),
  orderBy:     z.enum(['created_at', 'text', 'difficulty', 'points']).default('created_at'),
  direction:   z.enum(['asc', 'desc']).default('desc'),
});

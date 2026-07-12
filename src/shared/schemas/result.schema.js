import { z } from 'zod';
import { RESULT_MODE } from '../constants.js';

const modeValues = Object.values(RESULT_MODE);

export const ResultCreateSchema = z.object({
  exam_id:       z.string().uuid(),
  user_id:       z.string().uuid(),
  score:         z.number().min(0).max(100),
  total_points:  z.number().int().min(0),
  earned_points: z.number().int().min(0),
  time_spent:    z.number().int().min(0).optional().nullable(),
  answers_json:  z.string(), // JSON object { questionId: userAnswer }
  mode:          z.enum(modeValues).default('exam'),
  passed:        z.boolean(),
  attempt_number: z.number().int().min(1).default(1),
});

export const ResultFilterSchema = z.object({
  exam_id:  z.string().uuid().optional(),
  user_id:  z.string().uuid().optional(),
  mode:     z.enum(modeValues).optional(),
  passed:   z.coerce.boolean().optional(),
  search:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
  orderBy:  z.enum(['date_taken', 'score', 'attempt_number']).default('date_taken'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

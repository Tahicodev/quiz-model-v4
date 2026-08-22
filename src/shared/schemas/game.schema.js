import { z } from 'zod';
import { GAME_TYPES, GAME_STATUS } from '../constants.js';

const typeValues   = Object.values(GAME_TYPES);
const statusValues = Object.values(GAME_STATUS);

export const GameCreateSchema = z.object({
  name:          z.string().min(1).max(200),
  type:          z.enum(typeValues).default('quiz'),
  settings_json: z.string().optional().nullable(), // JSON: time per question, max players, etc.
  question_ids:  z.array(z.string().uuid()).min(1),
});

export const GameUpdateSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  status:        z.enum(statusValues).optional(),
  settings_json: z.string().optional().nullable(),
  question_ids:  z.array(z.string().uuid()).optional(),
});

export const GameFilterSchema = z.object({
  type:      z.enum(typeValues).optional(),
  status:    z.enum(statusValues).optional(),
  search:    z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['created_at', 'name', 'status']).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const GameJoinSchema = z.object({
  join_code: z.string().length(6).optional(),
  game_id:   z.string().uuid().optional(),
}).refine(d => d.join_code || d.game_id, {
  message: 'Either join_code or game_id is required',
});

export const GameAnswerSchema = z.object({
  // The game id is carried by the URL (`/:id/answer`) and the server derives
  // the player from the JWT.
  game_id:     z.string().uuid().optional(),
  question_id: z.string().uuid(),
  answer:      z.string().min(1),
});

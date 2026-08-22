import { z } from 'zod';
import { SESSION_STATUS } from '../constants.js';

const statusValues = Object.values(SESSION_STATUS);

export const SessionCreateSchema = z.object({
  exam_id:           z.string().uuid(),
  // The authenticated route derives the user from the JWT. Keep this
  // optional so browser clients do not have to send a server-owned field.
  user_id:           z.string().uuid().optional(),
  duration_minutes:  z.coerce.number().int().min(1).optional().nullable(),
});

export const SessionAnswerSchema = z.object({
  // The session id is already present in the URL (`/:id/answer`).
  session_id:  z.string().uuid().optional(),
  question_id: z.string().uuid(),
  answer:      z.string(),
});

export const SessionFilterSchema = z.object({
  exam_id:   z.string().uuid().optional(),
  user_id:   z.string().uuid().optional(),
  status:    z.enum(statusValues).optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['started_at', 'expires_at']).default('started_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

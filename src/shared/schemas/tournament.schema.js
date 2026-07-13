import { z } from 'zod';
import { TOURNAMENT_STATUS } from '../constants.js';

const statusValues = Object.values(TOURNAMENT_STATUS);

export const TournamentCreateSchema = z.object({
  name:          z.string().min(1).max(200),
  description:   z.string().max(1000).optional().nullable(),
  settings_json: z.string().optional().nullable(),
  starts_at:     z.string().datetime().optional().nullable(),
  ends_at:       z.string().datetime().optional().nullable(),
});

export const TournamentUpdateSchema = TournamentCreateSchema.partial().extend({
  status: z.enum(statusValues).optional(),
});

export const TournamentFilterSchema = z.object({
  status:    z.enum(statusValues).optional(),
  search:    z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['created_at', 'name', 'starts_at']).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

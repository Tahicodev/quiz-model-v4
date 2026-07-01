import { z } from 'zod';

export const ClassCreateSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});

export const ClassUpdateSchema = ClassCreateSchema.partial();

export const ClassFilterSchema = z.object({
  search:    z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['name', 'created_at']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

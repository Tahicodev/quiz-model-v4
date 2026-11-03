import { z } from 'zod';

export const SubjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const SubjectUpdateSchema = SubjectCreateSchema.partial();
export const SubjectFilterSchema = z.object({
  school_id: z.string().optional(),
  created_by: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  orderBy: z.enum(['name', 'created_at']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

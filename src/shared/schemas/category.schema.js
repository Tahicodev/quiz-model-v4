import { z } from 'zod';

export const CategoryCreateSchema = z.object({
  name:      z.string().min(1).max(100),
  parent_id: z.string().uuid().optional().nullable(),
  icon:      z.string().max(50).optional().nullable(),
  color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color').optional().nullable(),
});

export const CategoryUpdateSchema = CategoryCreateSchema.partial();

export const CategoryFilterSchema = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  search:    z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(100),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['name', 'created_at']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

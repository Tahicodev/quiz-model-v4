import { z } from 'zod';

export const COURSE_STATUS = ['draft', 'published'];

export const CourseCreateSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
});

export const CourseUpdateSchema = CourseCreateSchema.partial();

export const CourseFilterSchema = z.object({
  status:    z.enum(COURSE_STATUS).optional(),
  category_id: z.string().uuid().optional(),
  // Set server-side from the JWT (routes overwrite any client value).
  school_id: z.string().optional(),
  // Admin-only: filter by author. Teachers are scoped automatically.
  created_by: z.string().uuid().optional(),
  search:    z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(100),
  offset:    z.coerce.number().int().min(0).default(0),
  orderBy:   z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

// POST /courses/generate — AI course skeleton from a category branch.
export const CourseGenerateSchema = z.object({
  name:        z.string().min(1).max(200),
  categoryId:  z.string().uuid(),
  configId:    z.string().max(100).optional(),
  language:    z.string().max(40).default('French'),
  description: z.string().max(2000).optional(),
  // The "create category structure" flow can generate lesson outlines before
  // teachers have added practice questions to the new axes.
  includeEmptyCategories: z.boolean().default(false),
  // Cap the number of lessons generated from the branch (guards against a
  // huge tree eating tokens; default keeps every leaf with questions).
  maxLessons:  z.coerce.number().int().min(1).max(50).optional(),
});

// POST /courses/:id/lessons/:lessonId/generate-content
export const LessonContentGenerateSchema = z.object({
  configId:       z.string().max(100).optional(),
  language:       z.string().max(40).default('French'),
  includeQuestions: z.boolean().default(true),
});

export const LessonCreateSchema = z.object({
  title:       z.string().min(1).max(300),
  summary:     z.string().max(2000).optional().nullable(),
  content:     z.string().max(50000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  order_index: z.coerce.number().int().min(0).default(0),
});

export const LessonUpdateSchema = LessonCreateSchema.partial();

export const CourseReorderSchema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1),
});

export const CourseAssignSchema = z.object({
  classIds: z.array(z.string().uuid()).default([]),
});

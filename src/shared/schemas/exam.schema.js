import { z } from 'zod';
import { EXAM_STATUS } from '../constants.js';

const statusValues = Object.values(EXAM_STATUS);

export const ExamCreateSchema = z.object({
  name:          z.string().min(1).max(200),
  description:   z.string().max(1000).optional().nullable(),
  duration:      z.coerce.number().int().min(1).max(600).optional().nullable(), // minutes
  passing_score: z.coerce.number().int().min(0).max(100).default(50),
  status:        z.enum(statusValues).default('draft'),
  is_training:   z.boolean().default(false),
  randomize:     z.boolean().default(false),
  max_attempts:  z.coerce.number().int().min(1).optional().nullable(),
});

export const ExamUpdateSchema = ExamCreateSchema.partial().extend({
  // Class assignment mirror (the admin "Assign to Classes" picker sends the
  // full desired set). Persisted into the exam_classes junction table by
  // ExamService.update — never stored on the exams row itself.
  classes: z.array(z.string().uuid()).optional(),
  // Question assignment mirror ("Assign Questions" sends the full desired
  // set of question ids). Persisted into the exam_questions junction table
  // by ExamService.update — never stored on the exams row itself. Numeric
  // legacy indices never reach this field: the frontend resolves them to
  // question ids before the API call.
  questions: z.array(z.string().uuid()).optional(),
});

export const ExamFilterSchema = z.object({
  status:     z.enum(statusValues).optional(),
  creator_id: z.string().uuid().optional(),
  search:     z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  offset:     z.coerce.number().int().min(0).default(0),
  orderBy:    z.enum(['created_at', 'name', 'status']).default('created_at'),
  direction:  z.enum(['asc', 'desc']).default('desc'),
});

export const ExamAddQuestionSchema = z.object({
  question_id:      z.string().uuid(),
  order_index:      z.coerce.number().int().min(0).optional(),
  points_override:  z.coerce.number().int().min(1).optional().nullable(),
});

export const ExamReorderSchema = z.object({
  question_ids: z.array(z.string().uuid()).min(1),
});

export const ExamAssignClassSchema = z.object({
  class_id: z.string().uuid(),
});

import { z } from 'zod';
import { QUESTION_TYPES, DIFFICULTY } from '../constants.js';
import { PEDAGOGY_STATUS } from '../learning/pedagogy-validator.js';

const typeValues       = Object.values(QUESTION_TYPES);
const difficultyValues = Object.values(DIFFICULTY);
// The derived classification cache (Phase 1). Only READ as a filter here —
// the value itself is always derived from the criterion rows by the service.
const pedagogyStatusValues = Object.values(PEDAGOGY_STATUS);

// Question media accepts:
//  - absolute http(s) URLs (external image hosts)
//  - data:image/(png|jpeg|gif|webp);base64 URLs (legacy/offline editor
//    buffers; the API client persists these to /uploads before the request)
//  - app-relative /uploads/<file> URLs returned by POST /uploads
// Anything else (javascript:, file:, protocol-relative, bare paths) is
// rejected so an attachment can never become an injection vector.
const MEDIA_URL_RE = /^(?:https?:\/\/|\/uploads\/|data:image\/(?:png|jpe?g|gif|webp);base64,)[^\s]+$/i;
const mediaUrlSchema = z
  .string()
  // Base64 inflates an 8 MB file to ~10.7 MB; allow the data-URL fallback
  // while still rejecting unbounded blobs.
  .max(12 * 1024 * 1024, 'Image payload is too large')
  .refine((value) => MEDIA_URL_RE.test(value), {
    message: 'Use an http(s), data:image or /uploads/ image URL',
  });

export const QuestionCreateSchema = z.object({
  category_id:  z.string().uuid().optional().nullable(),
  type:         z.enum(typeValues),
  text:         z.string().min(1).max(2000),
  options_json: z.string().optional().nullable(), // JSON string of string[]
  answer:       z.string().min(1),
  explanation:  z.string().max(2000).optional().nullable(),
  points:       z.coerce.number().int().min(1).max(100).default(1),
  time_limit:   z.coerce.number().int().min(0).max(3600).optional().nullable(), // seconds; 0/null = no per-question limit
  difficulty:   z.enum(difficultyValues).default('medium'),
  tags:         z.string().max(500).optional().nullable(), // comma-separated
  media_url:    mediaUrlSchema.optional().nullable(),
});

export const QuestionUpdateSchema = QuestionCreateSchema.partial();

export const QuestionFilterSchema = z.object({
  category_id: z.string().uuid().optional(),
  type:        z.enum(typeValues).optional(),
  difficulty:  z.enum(difficultyValues).optional(),
  search:      z.string().optional(),
  tags:        z.string().optional(),
  // Admin-only: filter by author. Teachers are scoped automatically.
  created_by:  z.string().uuid().optional(),
  // Phase 1 classification filters. Both are cached columns derived from the
  // criterion rows, so filtering on them is a plain column match.
  pedagogy_status:            z.enum(pedagogyStatusValues).optional(),
  primary_bloom_dimension_id: z.string().optional(),
  // Comma-separated explicit id set. The pedagogy view resolves "questions of
  // objective X" to criteria rows first, then asks for exactly those ids, so
  // the paging and the total stay the server's instead of being re-filtered
  // in the browser. Same scoping as every other questions read.
  ids:         z.string().max(20000).optional(),
  // Set server-side from the JWT (routes overwrite any client value).
  school_id:   z.string().optional(),
  limit:       z.coerce.number().int().min(1).max(200).default(50),
  offset:      z.coerce.number().int().min(0).default(0),
  orderBy:     z.enum(['created_at', 'text', 'difficulty', 'points']).default('created_at'),
  direction:   z.enum(['asc', 'desc']).default('desc'),
});

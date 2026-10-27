/**
 * src/shared/schemas/examDocument.schema.js
 *
 * Wire contract for the exam document generator (student paper + teacher
 * answer key, PDF + DOCX).
 *
 * The header is stored as a JSON slice inside Exam.options_json
 * (`examDocHeader`) — the same mechanism already used for `presetSnapshot`
 * and `classes` — so the feature adds no table and no migration.
 *
 * Every field is optional: an unset field renders nothing on paper rather
 * than a placeholder. Institutional data (ministry, academy, term, group,
 * date) has NO default on the server — the generator must never invent it.
 */

import { z } from 'zod';

export const EXAM_DOC_TARGET_SCORE = 20;
export const EXAM_DOC_POINT_STEP = 0.25;

const nullableText = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().max(max).nullish(),
  );

export const ExamDocHeaderSchema = z.object({
  // ── Institutional information ──────────────────────────────────────────────
  ministry: nullableText(160),
  academy: nullableText(160),
  schoolName: nullableText(200),
  logoUrl: nullableText(500),
  logoDataUrl: z.string().max(4_000_000).nullish(), // base64 data URL, pre-persist
  logoScale: z.coerce.number().min(0.2).max(1.5).nullish(),
  academicYear: nullableText(40),

  // ── Examination information ────────────────────────────────────────────────
  title: nullableText(200),
  sessionType: nullableText(80),
  subject: nullableText(120),
  teacherName: nullableText(120),
  level: nullableText(80),
  group: nullableText(80),
  term: nullableText(60),
  date: nullableText(40),
  durationMinutes: z.coerce.number().int().min(1).max(600).nullish(),

  instructions: nullableText(1200),

  // ── Presentation settings (document only; never touch stored scores) ──────
  showHeader: z.boolean().nullish(), // the whole masthead band (logo, school, title)
  studentNameField: z.boolean().nullish(),
  studentNumberField: z.boolean().nullish(),
  showClassField: z.boolean().nullish(),
  grouping: z.enum(['none', 'by-category']).nullish(),
  numbering: z.enum(['continuous']).default('continuous'),
});

export const ExamDocNormalizationSchema = z.object({
  // 'as-is'      → print the stored point values (only legal when they sum to 20)
  // 'scale-to-20'→ document-only proportional reallocation, teacher-confirmed
  mode: z.enum(['as-is', 'scale-to-20']).default('as-is'),
  confirmed: z.boolean().default(false),
});

export const ExamDocBuildSchema = z.object({
  document: z.enum(['student', 'answer_key']),
  header: ExamDocHeaderSchema.partial().optional(),
  normalization: ExamDocNormalizationSchema.optional(),
});

export const ExamDocExportSchema = ExamDocBuildSchema.extend({
  format: z.enum(['pdf', 'docx']),
});

/** Header slice as persisted (unknown keys dropped, so options_json stays clean). */
export function sanitizeExamDocHeader(input = {}) {
  const parsed = ExamDocHeaderSchema.safeParse(input || {});
  if (!parsed.success) return {};
  const out = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}

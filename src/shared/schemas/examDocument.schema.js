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
import { TEMPLATE_LIMITS, safeParseExamTemplate, ExamTemplateOverrideSchema } from './examTemplate.schema.js';

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
  hiddenFields: z.array(z.string().max(40)).nullish(), // individual field names to hide
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
  // The template layer: a built-in id ("classique", "compact"…) and/or a
  // partial layout override the "Génération personnalisée" panel tunes live.
  templateId: z.string().min(1).max(60).nullish(),
  // A partial template override (e.g. the "Tenir en N pages" result): merged
  // over the resolved template so a fitted sheet can be previewed and exported.
  templateOverrides: ExamTemplateOverrideSchema.nullish(),
  layout: z
    .object({
      columns: z.union([z.literal(1), z.literal(2)]).nullish(),
      density: z.number().min(TEMPLATE_LIMITS.minDensity).max(TEMPLATE_LIMITS.maxDensity).nullish(),
      answerLines: z.number().int().min(0).max(TEMPLATE_LIMITS.maxAnswerLines).nullish(),
    })
    .partial()
    .optional(),
});

export const ExamDocExportSchema = ExamDocBuildSchema.extend({
  format: z.enum(['pdf', 'docx']),
});

/** "How many pages?" — same body as a build, answered without producing bytes. */
export const ExamDocEstimateSchema = ExamDocBuildSchema.extend({
  // When true the server also runs the (slower) exact dry render.
  exact: z.boolean().default(true),
});

/** "Tenir en N pages": the server tunes the safe levers to hit a page budget. */
export const ExamDocFitPagesSchema = ExamDocBuildSchema.extend({
  targetPages: z.number().int().min(1).max(40),
});

/** Custom template slice persisted in `Exam.options_json.examDocTemplates`. */
export const ExamDocTemplatesSchema = z.object({
  templates: z
    .array(
      z
        .object({
          id: z.string().min(1).max(40),
          name: z.string().min(1).max(60),
          baseId: z.string().min(1).max(60).optional(),
          template: z.record(z.any()),
        })
        .strict(),
    )
    .max(20),
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

/**
 * Custom-template slice validator: every entry must be a full, in-bounds
 * template (Zod re-checks margins, the ≥ 9 pt font floor and columns ∈ {1,2}),
 * ids must be unique and stable. Out-of-bounds or malformed entries are dropped
 * so a hand-edited `options_json` blob can never poison the renderer. Returns
 * `{ ok, templates, rejected }` so the route can report what it refused.
 */
export function sanitizeExamDocTemplates(input = []) {
  const list = Array.isArray(input) ? input : Array.isArray(input?.templates) ? input.templates : [];
  const templates = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of list) {
    const tpl = entry && typeof entry === 'object' ? (entry.template ?? entry) : null;
    const parsed = safeParseExamTemplate(tpl);
    if (!parsed.success) {
      rejected.push({ id: entry?.id || entry?.template?.id || '(sans id)', reason: 'template invalide ou hors bornes' });
      continue;
    }
    const value = parsed.data;
    if (seen.has(value.id)) {
      rejected.push({ id: value.id, reason: 'identifiant dupliqué' });
      continue;
    }
    seen.add(value.id);
    templates.push({
      id: value.id,
      name: value.name,
      ...(entry.baseId ? { baseId: String(entry.baseId).slice(0, 60) } : {}),
      template: value,
    });
  }
  return { ok: rejected.length === 0, templates, rejected };
}

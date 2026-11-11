import { z } from 'zod';

export const COURSE_STATUS = ['draft', 'published'];

export const CourseCreateSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  // 1:1 rule: a course is always the owner of one category branch, so the
  // branch root is mandatory (service layer also refuses a taken branch).
  category_id: z.string().uuid(),
  subject_id: z.string().uuid().optional().nullable(),
  // Saved course document identity (school, teacher, subject, level, group,
  // academic year, date, ministry, academy) reused when creating documents.
  document_header: z
    .object({
      schoolName: z.string().max(200).optional().default(''),
      ministry: z.string().max(160).optional().default(''),
      academy: z.string().max(160).optional().default(''),
      academicYear: z.string().max(40).optional().default(''),
      teacherName: z.string().max(120).optional().default(''),
      subject: z.string().max(120).optional().default(''),
      level: z.string().max(80).optional().default(''),
      group: z.string().max(80).optional().default(''),
      date: z.string().max(40).optional().default(''),
    })
    .optional()
    .nullable(),
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
  // teachers have added practice questions to the new lessons.
  includeEmptyCategories: z.boolean().default(false),
  // Cap the number of lessons generated from the branch (guards against a
  // huge tree eating tokens; default keeps every leaf with questions).
  maxLessons:  z.coerce.number().int().min(1).max(50).optional(),
});

// POST /courses/with-structure — the single subject-bound structure pipeline:
// create module + chapters + lessons, then (optionally) the AI outline on top.
export const CourseWithStructureGroupSchema = z.object({
  name: z.string().min(1).max(100),
  axes: z.array(z.string().min(1).max(100)).default([]).transform((axes) => [...new Set(axes.map((a) => a.trim()).filter(Boolean))]),
});

export const CourseWithStructureSchema = z.object({
  name:        z.string().min(1).max(200),
  subjectId:   z.string().uuid(),
  rootName:    z.string().min(1).max(100),
  groups:      z.array(CourseWithStructureGroupSchema).min(1).max(40),
  description: z.string().max(2000).optional(),
  configId:    z.string().max(100).optional(),
  language:    z.string().max(40).default('French'),
  // A brand-new branch has no questions yet, so the outline is built from its
  // lessons unless the caller explicitly asks for question-backed leaves only.
  includeEmptyCategories: z.boolean().default(true),
  maxLessons:  z.coerce.number().int().min(1).max(50).optional(),
}).superRefine((value, ctx) => {
  const rows = value.groups.length + value.groups.reduce((sum, group) => sum + group.axes.length, 0);
  if (rows > 200) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['groups'],
      message: 'A structure can hold at most 200 chapters and lessons at once.',
    });
  }
});

// POST /courses/:id/lessons/:lessonId/generate-content
export const LessonContentGenerateSchema = z.object({
  configId:       z.string().max(100).optional(),
  language:       z.string().max(40).default('French'),
  includeQuestions: z.boolean().default(true),
  promptOnly: z.boolean().default(false),
});

export const LessonCreateSchema = z.object({
  title:       z.string().min(1).max(300),
  parent_lesson_id: z.string().uuid().optional().nullable(),
  summary:     z.string().max(2000).optional().nullable(),
  content:     z.string().max(50000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  order_index: z.coerce.number().int().min(0).default(0),
  // Server-populated AI prep sheet (see the prep-sheet routes). Accepted here
  // so updateLesson/addLesson keep the field instead of stripping it; the
  // service layer JSON-stringifies it. The shape is validated with
  // PrepSheetDataSchema in AIService before it is ever handed to this method;
  // clients only trigger generation through the dedicated endpoint.
  prep_sheet:  z.record(z.string(), z.unknown()).nullish(),
  // Server-populated AI exercise (situation-problem + worked solution). Same
  // rules as prep_sheet: only the dedicated exercise endpoint writes it.
  exercise:    z.record(z.string(), z.unknown()).nullish(),
});

export const LessonUpdateSchema = LessonCreateSchema.partial();

export const CourseReorderSchema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1),
});

export const CourseAssignSchema = z.object({
  classIds: z.array(z.string().uuid()).default([]),
});

// ── Lesson preparation sheets ───────────────────────────────────────────────
// POST /courses/:id/lessons/:lessonId/prep-sheet
export const PrepSheetGenerateSchema = z.object({
  configId:       z.union([z.string(), z.coerce.number().int()]).optional(),
  language:       z.string().max(40).default('French'),
  sessionMinutes: z.coerce.number().int().min(15).max(240).default(55),
  force:          z.boolean().default(false),
});

// The AI returns free-form JSON; these builders stay tolerant on shapes
// (objects wrapped where arrays are expected, numbers vs strings) but reject
// structurally wrong output, so a hallucinated sheet never gets persisted.
const maybeText = (fallback = '') => z.unknown().optional().transform((v) => {
  if (typeof v === 'string') return v.trim() || fallback;
  if (v == null) return fallback;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
});
const stringList = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(maybeText()),
);
const intOf = (fallback) => z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : parseInt(String(v ?? ''), 10)),
  z.number().int().catch(fallback).transform((n) => (Number.isFinite(n) && n > 0 && n <= 1440 ? n : fallback)),
);

const PrepSheetConceptSchema = z.object({
  heading: maybeText(),
  body: z.unknown().optional().transform((v) => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
    if (v && typeof v === 'object') {
      return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n');
    }
    return v == null ? '' : String(v);
  }),
});

const PrepSheetPlanRowSchema = z.object({
  stage:           maybeText('Séance'),
  duration:        maybeText(),
  activities:      maybeText(),
  teacherRole:     maybeText(),
  studentRole:     maybeText(),
  resources:       maybeText(),
  expectedOutcome: maybeText(),
});

const PrepSheetAssessmentSchema = z.object({
  task:           maybeText(),
  criteria:       maybeText(),
  expectedAnswer: maybeText(),
});

const PrepSheetSessionSchema = z.object({
  index:              intOf(1),
  title:              maybeText('Séance'),
  estimatedMinutes:   intOf(55),
  contentSummary:     maybeText(),
  generalObjective:   maybeText(),
  specificObjectives: stringList,
  prerequisites:      stringList,
  keyConcepts: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []),
    z.array(PrepSheetConceptSchema),
  ),
  planRows: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []),
    z.array(PrepSheetPlanRowSchema),
  ),
  methods:    stringList,
  materials:  stringList,
  assessment: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []),
    z.array(PrepSheetAssessmentSchema),
  ),
  keyPoints:  stringList,
  homework:   stringList,
});

export const PrepSheetDataSchema = z.object({
  lessonTitle:    maybeText(''),
  generatedAt:    z.string().optional().transform((v) => v || new Date().toISOString()),
  language:       maybeText('French'),
  sessionMinutes: intOf(55),
  sessions: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []),
    z.array(PrepSheetSessionSchema).min(1).max(30),
  ),
});

// ── Lesson exercises (situation-problem + worked solution) ───────────────────
// An exercise is NOT a question: it is a realistic situation the student must
// analyse and solve by applying the lesson's knowledge, and it always ships
// with a full correction. POST /courses/:id/lessons/:lessonId/exercise
export const ExerciseGenerateSchema = z.object({
  configId:   z.union([z.string(), z.coerce.number().int()]).optional(),
  language:   z.string().max(40).default('French'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  force:      z.boolean().default(false),
});

const ExerciseTaskSchema = z.object({
  prompt: maybeText(),
  points: intOf(1),
});

export const ExerciseDataSchema = z.object({
  title:       maybeText('Exercice'),
  generatedAt: z.string().optional().transform((v) => v || new Date().toISOString()),
  language:    maybeText('French'),
  difficulty:  maybeText('medium'),
  // The real-life situation / scenario that frames the problem.
  situation:   maybeText(),
  // Data the student is given (values, statements, table rows, constraints).
  givenData:   stringList,
  // The tasks the student solves by applying the lesson knowledge.
  tasks: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []),
    z.array(ExerciseTaskSchema).min(1).max(12),
  ),
  // The worked correction: ordered solution steps, then the final answer.
  solutionSteps:   stringList,
  finalAnswer:     maybeText(),
  keyCompetencies: stringList,
});

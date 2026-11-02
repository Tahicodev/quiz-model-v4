/**
 * src/backend/routes/courses.routes.js
 *
 * Courses generated from a teacher's category branch. Management endpoints
 * follow the categories/exams contracts (JWT tenant scoping, strict
 * created_by ownership for teachers); the AI calls reuse the exact pipeline
 * behind POST /api/v1/ai/generate/structured (stored config → AIService).
 * Student endpoints only ever expose published, class-assigned courses and
 * serve practice questions with the answers stripped (grading stays on the
 * server through /results + /results/:id/corrections).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import {
  CourseGenerateSchema, CourseAssignSchema, CourseReorderSchema,
  LessonContentGenerateSchema,
} from '../../shared/schemas/course.schema.js';
import { CourseDocumentSchema } from '../../shared/schemas/courseDocument.schema.js';
import {
  CourseDocumentPreviewSchema,
  CourseDocumentImportSchema,
} from '../../shared/schemas/courseImport.schema.js';
import { getContainer } from '../container.js';
import { toStudentPracticeView } from '../utils/studentQuestionView.js';
import { renderCourseDocument } from '../services/courseDocumentRenderer.js';
import {
  buildCourseImportSections,
  detectCourseDocumentOutline,
  extractCourseDocumentText,
  MAX_COURSE_DOCUMENT_BYTES,
} from '../services/courseDocumentImporter.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const MANAGE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];
const STUDENT_ROLES = [ROLES.STUDENT, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

function assertCourseOwnership(course, user) {
  if (!course) return;
  if (user.role !== ROLES.TEACHER) return;
  if (String(course.created_by) !== String(user.id)) {
    throw new ForbiddenError('Not your course');
  }
}

/** Stored-config resolution, identical contract to /ai/generate/structured. */
async function resolveGenerationConfig(req, params) {
  const { aiConfigSvc } = getContainer();
  if (!params.configId) {
    throw new ValidationError({ configId: ['Pick a model (Settings → AI Generation)'] });
  }
  return aiConfigSvc.resolveForGeneration(req.user, req.schoolId, params.configId);
}

/** "Root > Sub > Axe" label for a category, walking the parent chain. */
async function buildCategoryPath(categoryId) {
  const { repo } = getContainer();
  const names = [];
  let current = categoryId ? await repo.getById('categories', categoryId) : null;
  const guard = new Set();
  while (current && !guard.has(String(current.id))) {
    guard.add(String(current.id));
    names.unshift(String(current.name || 'Unnamed'));
    current = current.parent_id ? await repo.getById('categories', current.parent_id) : null;
  }
  return names.join(' > ');
}

async function buildCourseCategoryLevels(categoryId, courseRootId) {
  const { repo } = getContainer();
  const levels = [];
  let current = categoryId ? await repo.getById('categories', categoryId) : null;
  const guard = new Set();
  while (current && !guard.has(String(current.id))) {
    guard.add(String(current.id));
    levels.unshift({ id: String(current.id), name: String(current.name || 'Unnamed') });
    current = current.parent_id ? await repo.getById('categories', current.parent_id) : null;
  }
  const rootIndex = levels.findIndex((level) => level.id === String(courseRootId || ''));
  return rootIndex >= 0 ? levels.slice(rootIndex) : levels;
}

// ── Student surface (declared before /:id so the literal wins over param) ───

/**
 * GET /student — published courses assigned to the student's class.
 */
router.get('/student', requireRole([ROLES.STUDENT]), async (req, res, next) => {
  try {
    const { courseSvc, repo } = getContainer();
    const courses = await courseSvc.listForStudent(req.user);
    // Lesson counts drive the card CTA ("3 lessons") and the empty state.
    const withCounts = [];
    for (const course of courses || []) {
      const { total: lessonCount } = await repo.getAll('lessons', {
        filters: { course_id: course.id },
        limit: 1,
      });
      withCounts.push({ ...course, lesson_count: lessonCount });
    }
    res.json({ data: withCounts, total: withCounts.length });
  } catch (err) { next(err); }
});

/**
 * GET /student/:id — course + lessons for an assigned, published course.
 */
router.get('/student/:id', requireRole([ROLES.STUDENT]), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    const course = await courseSvc.getForStudent(req.params.id, req.user);
    // Lesson bodies reach the student; teacher-only fields do not.
    res.json(course);
  } catch (err) { next(err); }
});

/**
 * GET /student/lessons/:lessonId/practice — live questions of the lesson's
 * leaf category, answers/explanations stripped.
 */
router.get('/student/lessons/:lessonId/practice', requireRole(STUDENT_ROLES), async (req, res, next) => {
  try {
    const { courseSvc, repo } = getContainer();
    // Teachers/admins preview freely; students must own visibility
    // (published + class-assigned).
    let lesson;
    if (req.user.role === ROLES.STUDENT) {
      lesson = await courseSvc.getLessonForStudent(req.params.lessonId, req.user);
    } else {
      lesson = await repo.getById('lessons', req.params.lessonId);
      if (!lesson) throw new NotFoundError('Lesson');
    }
    if (!lesson.category_id) {
      return res.json({ data: [], total: 0, category: null });
    }
    const category = await repo.getById('categories', lesson.category_id);
    if (!category) return res.json({ data: [], total: 0, category: null });
    const questions = await courseSvc.getQuestionsForCategory(category.school_id, category.id);
    res.json({
      data: questions.map(toStudentPracticeView),
      total: questions.length,
      category: { id: category.id, name: category.name, path: await buildCategoryPath(category.id) },
    });
  } catch (err) { next(err); }
});

// ── Teacher / admin management ───────────────────────────────────────────────

/**
 * GET / — the teacher's own courses (admins: all), each enriched with
 * lesson count + assigned class names for the list view.
 */
router.get('/', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc, repo } = getContainer();
    const isTeacher = req.user.role === ROLES.TEACHER;
    const { search = '', status, ...restQuery } = req.query;
    const { data, total } = await courseSvc.list(
      {
        school_id: req.schoolId,
        ...(isTeacher ? { created_by: req.user.id } : {}),
        ...(status ? { status } : {}),
        ...restQuery,
      },
      { search },
    );
    const enriched = [];
    for (const course of data) {
      const [{ total: lessonCount }, { data: links }] = await Promise.all([
        repo.getAll('lessons', { filters: { course_id: course.id }, limit: 1 }),
        repo.getAll('course_classes', { filters: { course_id: course.id }, limit: 500 }),
      ]);
      const classNames = [];
      for (const link of links) {
        const cls = await repo.getById('classes', link.class_id);
        if (cls) classNames.push(cls.name);
      }
      enriched.push({
        ...course,
        lesson_count: lessonCount,
        class_names: classNames,
        category_path: course.category_id ? await buildCategoryPath(course.category_id) : null,
      });
    }
    res.json({ data: enriched, total });
  } catch (err) { next(err); }
});

/**
 * POST /generate — AI course skeleton from a category branch. One lesson per
 * leaf category that holds questions; the outline (title + summary) comes
 * from the configured model, lesson→category mapping stays server-side.
 */
router.post('/generate', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = CourseGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }
    const params = parsed.data;
    const { courseSvc, aiSvc, aiConfigSvc, auditSvc } = getContainer();
    const config = await resolveGenerationConfig(req, params);

    const plan = await courseSvc.buildBranchPlan(req.schoolId, params.categoryId, {
      maxLessons: params.maxLessons || 30,
      includeEmptyCategories: params.includeEmptyCategories,
    });
    if (!plan.length) {
      throw new ValidationError({
        categoryId: [
          params.includeEmptyCategories
            ? 'No leaf categories found in this branch.'
            : 'No questions found in this category branch — create subcategories/axes and add questions first.',
        ],
      });
    }

    const lessons = await aiSvc.generateCourseOutline({
      config,
      courseName: params.name,
      language: params.language,
      plan,
    });
    const course = await courseSvc.createWithLessons(
      { name: params.name, description: params.description || null, categoryId: params.categoryId, lessons },
      req.user,
    );
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'course', entityId: course.id, action: 'create', ip: req.ip });
    res.status(201).json(await courseSvc.getWithLessons(course.id, req.schoolId));
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const detail = err && err.message ? String(err.message) : 'The AI provider call failed — check your connection, key and model, then try again.';
    next(new AppError('AI_PROVIDER_ERROR', detail, 502));
  }
});

router.post('/import/preview', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = CourseDocumentPreviewSchema.safeParse(req.body || {});
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { filename, data } = parsed.data;
    const encoded = String(data).replace(/\s+/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new ValidationError({ file: ['The uploaded file data is invalid. Please select the file again.'] });
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length || buffer.length > MAX_COURSE_DOCUMENT_BYTES) {
      throw new ValidationError({ file: [`Choose a file smaller than ${MAX_COURSE_DOCUMENT_BYTES / 1048576} MB.`] });
    }

    const text = await extractCourseDocumentText(buffer, filename);
    const outline = await detectCourseDocumentOutline(buffer, filename, text);
    const sourceLines = text.split('\n');
    res.json({
      filename,
      documentText: text,
      title: filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
      description: '',
      detectionMethod: outline.method,
      headings: outline.headings.map((heading) => ({
        ...heading,
        sourceText: sourceLines[heading.line - 1] || '',
      })),
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const detail = err && err.message
      ? String(err.message)
      : 'The document text could not be extracted or its outline detected locally.';
    next(new AppError('COURSE_DOCUMENT_ANALYSIS_FAILED', detail, 502));
  }
});

router.post('/import', requireRole(MANAGE_ROLES), async (req, res, next) => {
  let categorySvc;
  let courseSvc;
  let auditSvc;
  let repo;
  let rootCategory = null;
  let course = null;
  const createdCategories = [];
  try {
    ({ categorySvc, courseSvc, auditSvc, repo } = getContainer());
    const parsed = CourseDocumentImportSchema.safeParse(req.body || {});
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const params = parsed.data;
    const { roots, introduction } = buildCourseImportSections(params.documentText, params.headings);
    if (!roots.length) throw new ValidationError({ headings: ['The outline must include at least one main category.'] });
    const { data: existingCategories } = await repo.getAll('categories', {
      filters: { school_id: req.schoolId },
      limit: 100000,
    });
    const categoryNames = new Set((existingCategories || []).map((category) => String(category.name || '')));
    const conflicts = new Set();
    const checkNames = (nodes) => {
      for (const node of nodes) {
        if (categoryNames.has(node.title)) conflicts.add(node.title);
        categoryNames.add(node.title);
        checkNames(node.children);
      }
    };
    checkNames(roots);
    if (conflicts.size) {
      const names = [...conflicts].slice(0, 10).map((name) => `"${name}"`).join(', ');
      const more = conflicts.size > 10 ? ` and ${conflicts.size - 10} more` : '';
      throw new ValidationError({
        headings: [`Category names must be unique across your school. Rename these detected titles before importing: ${names}${more}.`],
      });
    }

    const createCategoryTree = async (nodes, parentId = null) => {
      for (const node of nodes) {
        const category = await categorySvc.create({ name: node.title, parent_id: parentId }, req.user);
        createdCategories.push(category);
        if (!rootCategory) rootCategory = category;
        node.categoryId = category.id;
        await createCategoryTree(node.children, category.id);
      }
    };
    await createCategoryTree(roots);

    course = await courseSvc.create({
      name: params.name,
      description: params.description || null,
      category_id: rootCategory.id,
    }, req.user);

    let orderIndex = 0;
    if (introduction) {
      await courseSvc.addLesson(course.id, {
        title: 'Introduction',
        content: introduction,
        order_index: orderIndex++,
      }, req.user);
    }
    const createSectionLessons = async (nodes) => {
      for (const node of nodes) {
        await courseSvc.addLesson(course.id, {
          title: node.title,
          content: node.content,
          category_id: node.categoryId,
          order_index: orderIndex++,
        }, req.user);
        await createSectionLessons(node.children);
      }
    };
    await createSectionLessons(roots);

    for (const category of createdCategories) {
      await auditSvc.log({
        schoolId: req.schoolId, actorId: req.user.id, entityType: 'category',
        entityId: category.id, action: 'create', ip: req.ip,
      });
    }
    await auditSvc.log({
      schoolId: req.schoolId, actorId: req.user.id, entityType: 'course',
      entityId: course.id, action: 'create', ip: req.ip,
    });
    res.status(201).json({
      ...(await courseSvc.getWithLessons(course.id, req.schoolId)),
      imported_categories: createdCategories,
    });
  } catch (err) {
    const cleanupErrors = [];
    if (course) {
      try {
        await courseSvc.delete(course.id, req.user);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (rootCategory) {
      try {
        await categorySvc.delete(rootCategory.id, req.user);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      logger.error({ error: err, cleanupErrors }, 'Course document import rollback failed');
      return next(new AppError(
        'COURSE_IMPORT_ROLLBACK_FAILED',
        'Course import failed and cleanup was incomplete. Refresh your categories and courses, then contact an administrator if any partial data remains.',
        500,
      ));
    }
    next(err);
  }
});

/**
 * GET /:id — full course with lessons and assigned class ids.
 */
router.get('/:id', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    const course = await courseSvc.getById(req.params.id);
    assertCourseOwnership(course, req.user);
    const full = await courseSvc.getWithLessons(req.params.id, req.schoolId);
    full.category_path = course.category_id ? await buildCategoryPath(course.category_id) : null;
    res.json(full);
  } catch (err) { next(err); }
});

router.post('/:id/documents/export', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = CourseDocumentSchema.safeParse(req.body || {});
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { courseSvc } = getContainer();
    const course = await courseSvc.getById(req.params.id);
    assertCourseOwnership(course, req.user);
    const full = await courseSvc.getWithLessons(req.params.id, req.schoolId);
    full.category_path = course.category_id ? await buildCategoryPath(course.category_id) : null;
    full.lessons = await Promise.all((full.lessons || []).map(async (lesson) => ({
      ...lesson,
      category_levels: await buildCourseCategoryLevels(lesson.category_id, course.category_id),
    })));
    const rendered = await renderCourseDocument(full, parsed.data);
    const safeName = String(full.name || 'course')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'course';
    const filename = `${safeName}.${rendered.extension}`;
    res.setHeader('Content-Type', rendered.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', String(rendered.buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(rendered.buffer);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc, auditSvc } = getContainer();
    const updated = await courseSvc.update(req.params.id, req.body || {}, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'course', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc, auditSvc } = getContainer();
    await courseSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'course', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/publish', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc, auditSvc } = getContainer();
    const updated = await courseSvc.setStatus(req.params.id, 'published', req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'course', entityId: updated.id, action: 'publish', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/unpublish', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    res.json(await courseSvc.setStatus(req.params.id, 'draft', req.user));
  } catch (err) { next(err); }
});

/**
 * POST /:id/assign — idempotent sync of the class assignment (mirrors the
 * exam "Assign to Classes" contract so student devices actually see it).
 */
router.post('/:id/assign', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = CourseAssignSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }
    const { courseSvc, auditSvc } = getContainer();
    const course = await courseSvc.assignClasses(req.params.id, parsed.data.classIds, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'course', entityId: req.params.id, action: 'assign', ip: req.ip });
    res.json(course);
  } catch (err) { next(err); }
});

// ── Lessons ──────────────────────────────────────────────────────────────────

router.post('/:id/lessons', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    const lesson = await courseSvc.addLesson(req.params.id, req.body || {}, req.user);
    res.status(201).json(lesson);
  } catch (err) { next(err); }
});

router.post('/:id/lessons/reorder', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = CourseReorderSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }
    const { courseSvc } = getContainer();
    res.json(await courseSvc.reorderLessons(req.params.id, parsed.data.lessonIds, req.user));
  } catch (err) { next(err); }
});

// Lesson-level routes address the lesson row directly (course ownership is
// resolved inside CourseService from the lesson's course_id).
router.patch('/lessons/:lessonId', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    res.json(await courseSvc.updateLesson(req.params.lessonId, req.body || {}, req.user));
  } catch (err) { next(err); }
});

router.delete('/lessons/:lessonId', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { courseSvc } = getContainer();
    await courseSvc.deleteLesson(req.params.lessonId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

/**
 * POST /:courseId/lessons/:lessonId/generate-content — AI writes the lesson
 * markdown from its category path + the live questions the student will
 * practice, so the taught content matches the assessment.
 */
router.post('/:courseId/lessons/:lessonId/generate-content', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const parsed = LessonContentGenerateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }
    const params = parsed.data;
    const { courseSvc, aiSvc, repo } = getContainer();

    const course = await courseSvc.getById(req.params.courseId);
    assertCourseOwnership(course, req.user);
    const lesson = await repo.getById('lessons', req.params.lessonId);
    if (!lesson || String(lesson.course_id) !== String(course.id)) throw new NotFoundError('Lesson');

    const categoryPath = lesson.category_id
      ? await buildCategoryPath(lesson.category_id)
      : course.name;
    let questionDigest = [];
    if (lesson.category_id) {
      const questions = await courseSvc.getQuestionsForCategory(course.school_id, lesson.category_id);
      questionDigest = questions.map((q) => String(q.text || q.question || '').slice(0, 300)).filter(Boolean);
    }

    if (params.promptOnly) {
      return res.json({
        prompt: aiSvc.buildLessonContentPrompt({
          language: params.language,
          lesson: { ...lesson, course_name: course.name },
          categoryPath,
          questionDigest,
          includeQuestions: params.includeQuestions,
        }),
      });
    }

    const config = await resolveGenerationConfig(req, params);
    const content = await aiSvc.generateLessonContent({
      config,
      language: params.language,
      lesson: { ...lesson, course_name: course.name },
      categoryPath,
      questionDigest,
      includeQuestions: params.includeQuestions,
    });
    const updated = await courseSvc.updateLesson(lesson.id, { content }, req.user);
    res.json(updated);
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const detail = err && err.message ? String(err.message) : 'The AI provider call failed — check your connection, key and model, then try again.';
    next(new AppError('AI_PROVIDER_ERROR', detail, 502));
  }
});

export default router;

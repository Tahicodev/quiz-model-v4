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
import { getContainer } from '../container.js';
import { toStudentPracticeView } from '../utils/studentQuestionView.js';

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
    });
    if (!plan.length) {
      throw new ValidationError({
        categoryId: ['No questions found in this category branch — create subcategories/axes and add questions first.'],
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

    const config = await resolveGenerationConfig(req, params);
    const categoryPath = lesson.category_id
      ? await buildCategoryPath(lesson.category_id)
      : course.name;
    let questionDigest = [];
    if (lesson.category_id) {
      const questions = await courseSvc.getQuestionsForCategory(course.school_id, lesson.category_id);
      questionDigest = questions.map((q) => String(q.text || q.question || '').slice(0, 300)).filter(Boolean);
    }

    const content = await aiSvc.generateLessonContent({
      config,
      language: params.language,
      lesson,
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

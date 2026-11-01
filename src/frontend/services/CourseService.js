/**
 * src/frontend/services/CourseService.js
 * Courses generated from a teacher's category branch (see schema.prisma
 * "Courses" section). Repo-based like ExamService/CategoryService so the
 * exact same class runs in the backend DI container.
 *
 * Ownership rule (mirrors CategoryService): teachers work strictly on
 * their own rows (created_by); admins see everything.
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import {
  CourseCreateSchema, CourseUpdateSchema, CourseFilterSchema,
  LessonCreateSchema, LessonUpdateSchema,
} from '../../shared/schemas/course.schema.js';
import { ROLES } from '../../shared/constants.js';

const MANAGE_ROLES = [ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPER_ADMIN];

export class CourseService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  #requireManager(user) {
    if (!user || !MANAGE_ROLES.includes(user.role)) throw new ForbiddenError();
  }

  #assertOwnership(course, user) {
    if (!course) return;
    if (user.role !== ROLES.TEACHER) return;
    if (String(course.created_by) !== String(user.id)) {
      throw new ForbiddenError('Not your course');
    }
  }

  async list(filters = {}, pagination = {}) {
    // `created_by` scoping is server-derived (route-enforced), not client
    // input — validate the rest and re-attach (same contract as CategoryService).
    const { created_by = undefined, or = null, ...restFilters } = filters;
    const parsed = CourseFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (created_by !== undefined) rest.created_by = created_by;
    return this.#repo.getAll('courses', { filters: rest, limit, offset, orderBy, direction, search, ...(or ? { or } : {}) });
  }

  async getById(id) {
    const course = await this.#repo.getById('courses', id);
    if (!course) throw new NotFoundError('Course');
    return course;
  }

  async getWithLessons(id, schoolId = null) {
    const course = await this.#repo.query('course.withLessons', {
      courseId: id,
      ...(schoolId ? { schoolId } : {}),
    });
    if (!course) throw new NotFoundError('Course');
    return course;
  }

  async create(data, currentUser) {
    this.#requireManager(currentUser);
    const parsed = CourseCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.create('courses', {
      ...parsed.data,
      school_id: currentUser?.school_id,
      created_by: currentUser?.id,
    });
  }

  /** Persist a generated course: one transaction-free pass (create + lessons). */
  async createWithLessons({ name, description, categoryId, lessons }, currentUser) {
    const course = await this.create({ name, description, category_id: categoryId }, currentUser);
    for (const [i, lesson] of (lessons || []).entries()) {
      await this.#repo.create('lessons', {
        course_id: course.id,
        category_id: lesson.categoryId || lesson.category_id || null,
        title: lesson.title,
        summary: lesson.summary || null,
        content: lesson.content || null,
        order_index: Number.isInteger(lesson.order_index) ? lesson.order_index : i,
        ai_generated: true,
      });
    }
    return course;
  }

  async update(id, data, currentUser) {
    this.#requireManager(currentUser);
    const existing = await this.getById(id);
    this.#assertOwnership(existing, currentUser);
    const parsed = CourseUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.update('courses', id, parsed.data);
  }

  async setStatus(id, status, currentUser) {
    this.#requireManager(currentUser);
    const existing = await this.getById(id);
    this.#assertOwnership(existing, currentUser);
    if (!['draft', 'published'].includes(status)) {
      throw new ValidationError({ status: ['Invalid course status'] });
    }
    return this.#repo.update('courses', id, { status });
  }

  async delete(id, currentUser) {
    this.#requireManager(currentUser);
    const existing = await this.getById(id);
    this.#assertOwnership(existing, currentUser);
    // Lessons and course_classes cascade with the course (FK onDelete: Cascade).
    await this.#repo.delete('courses', id);
  }

  // ── Lessons ────────────────────────────────────────────────────────────────

  async addLesson(courseId, data, currentUser) {
    this.#requireManager(currentUser);
    const course = await this.getById(courseId);
    this.#assertOwnership(course, currentUser);
    const parsed = LessonCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { data: lessons } = await this.#repo.getAll('lessons', { filters: { course_id: courseId }, limit: 100000 });
    const orderIndex = lessons.length ? Math.max(...lessons.map((l) => l.order_index || 0)) + 1 : 0;
    return this.#repo.create('lessons', {
      ...parsed.data,
      order_index: parsed.data.order_index || orderIndex,
      course_id: courseId,
    });
  }

  /** Lesson lookup + ownership check shared by all lesson mutations. */
  async #getLessonOwned(lessonId, currentUser) {
    const lesson = await this.#repo.getById('lessons', lessonId);
    if (!lesson) throw new NotFoundError('Lesson');
    const course = await this.getById(lesson.course_id);
    this.#assertOwnership(course, currentUser);
    return lesson;
  }

  async updateLesson(lessonId, data, currentUser) {
    this.#requireManager(currentUser);
    await this.#getLessonOwned(lessonId, currentUser);
    const parsed = LessonUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.update('lessons', lessonId, parsed.data);
  }

  async deleteLesson(lessonId, currentUser) {
    this.#requireManager(currentUser);
    const lesson = await this.#getLessonOwned(lessonId, currentUser);
    await this.#repo.delete('lessons', lessonId);
    // Close the gap so reorder UI stays sane.
    const { data: rest } = await this.#repo.getAll('lessons', {
      filters: { course_id: lesson.course_id }, orderBy: 'order_index', direction: 'asc', limit: 100000,
    });
    for (const [i, l] of rest.entries()) {
      if ((l.order_index || 0) !== i) await this.#repo.update('lessons', l.id, { order_index: i });
    }
  }

  /** Reorder by the given id list; ids outside the list keep their tail order. */
  async reorderLessons(courseId, lessonIds, currentUser) {
    this.#requireManager(currentUser);
    const course = await this.getById(courseId);
    this.#assertOwnership(course, currentUser);
    const { data: lessons } = await this.#repo.getAll('lessons', { filters: { course_id: courseId }, limit: 100000 });
    const byId = new Map(lessons.map((l) => [String(l.id), l]));
    let pos = 0;
    for (const id of lessonIds) {
      const lesson = byId.get(String(id));
      if (!lesson) throw new ValidationError({ lessonIds: ['Lesson does not belong to this course'] });
      await this.#repo.update('lessons', lesson.id, { order_index: pos++ });
      byId.delete(String(id));
    }
    for (const lesson of byId.values()) {
      await this.#repo.update('lessons', lesson.id, { order_index: pos++ });
    }
    return this.getWithLessons(courseId, course.school_id);
  }

  // ── Sharing (mirrors ExamService.#syncExamClasses) ─────────────────────────

  /** Idempotent sync of the course_classes junction. */
  async assignClasses(courseId, classIds, currentUser) {
    this.#requireManager(currentUser);
    const course = await this.getById(courseId);
    this.#assertOwnership(course, currentUser);
    const wanted = new Set((classIds || []).map(String));
    const { data: existing } = await this.#repo.getAll('course_classes', { filters: { course_id: courseId }, limit: 100000 });
    // Remove rows no longer requested; ignore already-present wanted rows.
    for (const link of existing) {
      if (!wanted.has(String(link.class_id))) await this.#repo.delete('course_classes', link.id);
      else wanted.delete(String(link.class_id));
    }
    for (const classId of wanted) {
      const cls = await this.#repo.getById('classes', classId);
      if (!cls || String(cls.school_id) !== String(course.school_id)) {
        throw new ValidationError({ classIds: [`Unknown class: ${classId}`] });
      }
      await this.#repo.create('course_classes', { course_id: courseId, class_id: classId });
    }
    return this.getWithLessons(courseId, course.school_id);
  }

  // ── Student side ───────────────────────────────────────────────────────────

  async listForStudent(user) {
    if (!user?.id) throw new ForbiddenError();
    return this.#repo.query('course.availableForStudent', { userId: user.id });
  }

  /** Course + lessons for a student: must be published and class-assigned. */
  async getForStudent(courseId, user) {
    const courses = await this.listForStudent(user);
    const course = (courses || []).find((c) => String(c.id) === String(courseId));
    if (!course) throw new NotFoundError('Course');
    const { data: lessons } = await this.#repo.getAll('lessons', {
      filters: { course_id: courseId }, orderBy: 'order_index', direction: 'asc', limit: 1000,
    });
    return { ...course, lessons };
  }

  async getLessonForStudent(lessonId, user) {
    const lesson = await this.#repo.getById('lessons', lessonId);
    if (!lesson) throw new NotFoundError('Lesson');
    await this.getForStudent(lesson.course_id, user); // visibility gate (published + assigned)
    return lesson;
  }

  // ── Branch plan (course generation input) ──────────────────────────────────

  /**
   * Build the lesson plan from leaf categories inside a branch. By default
   * leaves without questions are omitted; newly created course structures may
   * opt in so lesson outlines can be generated before practice questions exist.
   */
  async buildBranchPlan(schoolId, categoryId, { maxLessons = 30, includeEmptyCategories = false } = {}) {
    const root = await this.#repo.getById('categories', categoryId);
    if (!root || String(root.school_id) !== String(schoolId)) throw new NotFoundError('Category');

    const { data: allCategories } = await this.#repo.getAll('categories', { filters: { school_id: schoolId }, limit: 100000 });
    const childrenOf = new Map();
    for (const cat of allCategories) {
      const pid = String(cat.parent_id || '');
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(cat);
    }
    for (const siblings of childrenOf.values()) {
      siblings.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    const { data: allQuestions } = await this.#repo.getAll('questions', { filters: { school_id: schoolId }, limit: 100000 });
    const countByCategory = new Map();
    for (const q of allQuestions) {
      if (!q.category_id) continue;
      const key = String(q.category_id);
      const texts = countByCategory.get(key) || { count: 0, texts: [] };
      texts.count += 1;
      if (texts.texts.length < 30) texts.texts.push(String(q.text || '').slice(0, 300));
      countByCategory.set(key, texts);
    }

    const plan = [];
    const seen = new Set([String(root.id)]);
    const visit = (cat, pathNames) => {
      const path = [...pathNames, cat.name];
      const children = (childrenOf.get(String(cat.id)) || []).filter((c) => !seen.has(String(c.id)));
      if (!children.length) {
        const entry = countByCategory.get(String(cat.id));
        if (includeEmptyCategories || (entry && entry.count > 0)) {
          plan.push({
            categoryId: String(cat.id),
            path: path.join(' > '),
            questionCount: entry?.count || 0,
            questionTexts: entry?.texts || [],
          });
        }
        return;
      }
      for (const child of children) {
        seen.add(String(child.id));
        visit(child, path);
      }
    };
    visit(root, []);

    if (plan.length > maxLessons) plan.length = maxLessons;
    return plan;
  }

  /** Questions currently filed in a leaf category — the lesson's practice set. */
  async getQuestionsForCategory(schoolId, categoryId) {
    const { data } = await this.#repo.getAll('questions', {
      filters: { school_id: schoolId, category_id: categoryId },
      limit: 100000,
      orderBy: 'created_at',
      direction: 'asc',
    });
    return data || [];
  }
}

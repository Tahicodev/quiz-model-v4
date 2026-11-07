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
import { extractLessonHighlights } from '../../shared/lessonSections.js';

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

  // SQLite has no Json column type on this Prisma version, so JSON payloads
  // (course document identity, lesson prep sheets) live in TEXT columns.
  // (De)serialize here so routes and the admin UI keep exchanging objects.
  static #JSON_FIELDS = ['document_header', 'prep_sheet'];

  #serializeJsonFields(values) {
    if (!values) return values;
    let out = values;
    for (const field of CourseService.#JSON_FIELDS) {
      // `!== undefined` (not hasOwn): schemas add optional keys with undefined
      // values, and an update that omits the field must never null it out.
      if (values[field] !== undefined) {
        if (out === values) out = { ...values };
        out[field] = out[field] == null ? null : JSON.stringify(out[field]);
      }
    }
    return out;
  }

  #hydrateJsonFields(row) {
    if (!row) return row;
    let out = row;
    for (const field of CourseService.#JSON_FIELDS) {
      if (typeof row[field] === 'string') {
        if (out === row) out = { ...row };
        try { out[field] = JSON.parse(row[field]); }
        catch { out[field] = null; }
      }
    }
    return out;
  }

  async list(filters = {}, pagination = {}) {
    // `created_by` scoping is server-derived (route-enforced), not client
    // input — validate the rest and re-attach (same contract as CategoryService).
    const { created_by = undefined, or = null, ...restFilters } = filters;
    const parsed = CourseFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (created_by !== undefined) rest.created_by = created_by;
    const result = await this.#repo.getAll('courses', { filters: rest, limit, offset, orderBy, direction, search, ...(or ? { or } : {}) });
    if (result && Array.isArray(result.data)) result.data = result.data.map((row) => this.#hydrateJsonFields(row));
    return result;
  }

  async getById(id) {
    const course = await this.#repo.getById('courses', id);
    if (!course) throw new NotFoundError('Course');
    return this.#hydrateJsonFields(course);
  }

  async getWithLessons(id, schoolId = null) {
    const course = await this.#repo.query('course.withLessons', {
      courseId: id,
      ...(schoolId ? { schoolId } : {}),
    });
    if (!course) throw new NotFoundError('Course');
    const hydrated = this.#hydrateJsonFields(course);
    if (Array.isArray(hydrated.lessons)) {
      hydrated.lessons = hydrated.lessons.map((lesson) => this.#hydrateJsonFields(lesson));
    }
    return hydrated;
  }

  async create(data, currentUser) {
    this.#requireManager(currentUser);
    if (!data || !data.category_id) {
      throw new ValidationError({ category_id: ['A course needs its own category structure.'] });
    }
    const parsed = CourseCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    let subjectId = parsed.data.subject_id || null;
    if (subjectId) {
      const subject = await this.#repo.getById('subjects', subjectId);
      if (!subject || String(subject.school_id) !== String(currentUser.school_id)) {
        throw new ValidationError({ subject_id: ['Subject not found in this school.'] });
      }
      if (currentUser.role === ROLES.TEACHER && String(subject.created_by) !== String(currentUser.id)) {
        throw new ForbiddenError('Not your subject');
      }
    }
    const category = await this.#repo.getById('categories', parsed.data.category_id);
    if (!category || String(category.school_id) !== String(currentUser.school_id)) {
      throw new ValidationError({ category_id: ['Category not found in this school.'] });
    }
    if (currentUser.role === ROLES.TEACHER && String(category.created_by) !== String(currentUser.id)) {
      throw new ForbiddenError('Not your category');
    }
    if (subjectId && category.subject_id && String(category.subject_id) !== subjectId) {
      throw new ValidationError({ subject_id: ['Course and category must belong to the same subject.'] });
    }
    subjectId = subjectId || category.subject_id || null;
    await this.#assertBranchFree(currentUser.school_id, category.id);
    return this.#hydrateJsonFields(await this.#repo.create('courses', this.#serializeJsonFields({
      ...parsed.data,
      subject_id: subjectId,
      school_id: currentUser?.school_id,
      created_by: currentUser?.id,
    })));
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
    const subjectId = parsed.data.subject_id === undefined
      ? existing.subject_id
      : parsed.data.subject_id;
    if (subjectId) {
      const subject = await this.#repo.getById('subjects', subjectId);
      if (!subject || String(subject.school_id) !== String(currentUser.school_id)) {
        throw new ValidationError({ subject_id: ['Subject not found in this school.'] });
      }
      if (currentUser.role === ROLES.TEACHER && String(subject.created_by) !== String(currentUser.id)) {
        throw new ForbiddenError('Not your subject');
      }
    }
    const categoryId = parsed.data.category_id === undefined
      ? existing.category_id
      : parsed.data.category_id;
    let patch = { ...parsed.data };
    if (Object.hasOwn(parsed.data, 'category_id')) {
      // Manual link path ("Link a structure"): a course always owns its branch.
      if (!parsed.data.category_id) {
        throw new ValidationError({ category_id: ['A course needs its own category structure.'] });
      }
      const category = await this.#repo.getById('categories', parsed.data.category_id);
      if (!category || String(category.school_id) !== String(currentUser.school_id)) {
        throw new ValidationError({ category_id: ['Category not found in this school.'] });
      }
      if (currentUser.role === ROLES.TEACHER && String(category.created_by) !== String(currentUser.id)) {
        throw new ForbiddenError('Not your category');
      }
      if (subjectId && category.subject_id && String(category.subject_id) !== String(subjectId)) {
        throw new ValidationError({ subject_id: ['Course and category must belong to the same subject.'] });
      }
      // A legacy course without a subject takes it over from the branch it is
      // linked to, so it lands under the right subject pill.
      if (!subjectId && category.subject_id) patch.subject_id = category.subject_id;
      await this.#assertBranchFree(currentUser.school_id, category.id, id);
    } else if (categoryId) {
      const category = await this.#repo.getById('categories', categoryId);
      if (!category || String(category.school_id) !== String(currentUser.school_id)) {
        throw new ValidationError({ category_id: ['Category not found in this school.'] });
      }
      if (subjectId && category.subject_id && String(category.subject_id) !== String(subjectId)) {
        throw new ValidationError({ subject_id: ['Course and category must belong to the same subject.'] });
      }
    }
    return this.#hydrateJsonFields(await this.#repo.update('courses', id, this.#serializeJsonFields(patch)));
  }

  async setStatus(id, status, currentUser) {
    this.#requireManager(currentUser);
    const existing = await this.getById(id);
    this.#assertOwnership(existing, currentUser);
    if (!['draft', 'published'].includes(status)) {
      throw new ValidationError({ status: ['Invalid course status'] });
    }
    return this.#hydrateJsonFields(await this.#repo.update('courses', id, { status }));
  }

  async delete(id, currentUser) {
    this.#requireManager(currentUser);
    const existing = await this.getById(id);
    this.#assertOwnership(existing, currentUser);
    // Lessons and course_classes cascade with the course (FK onDelete: Cascade).
    // The category branch survives on purpose: it reappears as a structure row
    // so the teacher's authored outline (and its questions) is never lost.
    await this.#repo.delete('courses', id);
  }

  // ── 1:1 branch ownership ───────────────────────────────────────────────────

  /**
   * A course and a category branch are the same object: no branch may be
   * claimed twice, and a branch may never nest inside (or wrap) another
   * course's branch. Read-only legacy violations stay listed untouched — this
   * gate only applies to writes. The error names the blocking course and its
   * path so the teacher knows exactly where to look.
   */
  async #assertBranchFree(schoolId, categoryId, excludeCourseId = null) {
    const targetId = String(categoryId);
    const [{ data: courses }, { data: categories }] = await Promise.all([
      this.#repo.getAll('courses', { filters: { school_id: schoolId }, limit: 100000 }),
      this.#repo.getAll('categories', { filters: { school_id: schoolId }, limit: 100000 }),
    ]);
    const taken = (courses || []).filter(
      (course) => course.category_id && String(course.id) !== String(excludeCourseId),
    );
    if (!taken.length) return;

    const byId = new Map((categories || []).map((category) => [String(category.id), category]));
    const chainOf = (id) => {
      const ids = [];
      const seen = new Set();
      let node = byId.get(String(id));
      while (node && !seen.has(String(node.id))) {
        seen.add(String(node.id));
        ids.push(String(node.id));
        node = node.parent_id ? byId.get(String(node.parent_id)) : null;
      }
      return ids;
    };
    const pathOf = (id) => chainOf(id)
      .reverse()
      .map((nodeId) => String(byId.get(nodeId)?.name || 'Unnamed'))
      .join(' > ');
    const targetChain = chainOf(targetId);

    for (const course of taken) {
      const rootId = String(course.category_id);
      if (rootId === targetId) {
        throw new ValidationError({
          category_id: [`This structure already belongs to the course "${course.name}". Each course owns exactly one structure.`],
        });
      }
      if (targetChain.includes(rootId)) {
        throw new ValidationError({
          category_id: [
            `"${pathOf(targetId)}" sits inside the course "${course.name}" (${pathOf(rootId)}). `
            + 'Pick a branch that is not part of another course.',
          ],
        });
      }
      if (chainOf(rootId).includes(targetId)) {
        throw new ValidationError({
          category_id: [
            `"${pathOf(targetId)}" already contains the course "${course.name}" (${pathOf(rootId)}). `
            + 'Pick a branch that does not hold another course.',
          ],
        });
      }
    }
  }

  // ── Lessons ────────────────────────────────────────────────────────────────

  async addLesson(courseId, data, currentUser) {
    this.#requireManager(currentUser);
    const course = await this.getById(courseId);
    this.#assertOwnership(course, currentUser);
    const parsed = LessonCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    if (parsed.data.parent_lesson_id) {
      await this.#assertLessonParent(null, courseId, parsed.data.parent_lesson_id);
    }
    const { data: lessons } = await this.#repo.getAll('lessons', { filters: { course_id: courseId }, limit: 100000 });
    const orderIndex = lessons.length ? Math.max(...lessons.map((l) => l.order_index || 0)) + 1 : 0;
    return this.#hydrateJsonFields(await this.#repo.create('lessons', this.#serializeJsonFields({
      ...parsed.data,
      order_index: parsed.data.order_index || orderIndex,
      course_id: courseId,
    })));
  }

  /** Lesson lookup + ownership check shared by all lesson mutations. */
  async #getLessonOwned(lessonId, currentUser) {
    const lesson = await this.#repo.getById('lessons', lessonId);
    if (!lesson) throw new NotFoundError('Lesson');
    const course = await this.getById(lesson.course_id);
    this.#assertOwnership(course, currentUser);
    return lesson;
  }

  async #assertLessonParent(lessonId, courseId, parentLessonId) {
    if (!parentLessonId) return;
    const { data: lessons } = await this.#repo.getAll('lessons', {
      filters: { course_id: courseId },
      limit: 100000,
    });
    const byId = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
    let parent = byId.get(String(parentLessonId));
    if (!parent) {
      throw new ValidationError({
        parent_lesson_id: ['Parent lesson must belong to this course'],
      });
    }
    if (lessonId && String(parent.id) === String(lessonId)) {
      throw new ValidationError({
        parent_lesson_id: ['A lesson cannot be nested under itself'],
      });
    }
    const visited = new Set();
    while (parent) {
      const currentId = String(parent.id);
      if (lessonId && currentId === String(lessonId)) {
        throw new ValidationError({
          parent_lesson_id: ['This parent would create a lesson nesting loop'],
        });
      }
      if (visited.has(currentId)) {
        throw new ValidationError({
          parent_lesson_id: ['The existing lesson outline contains a nesting loop'],
        });
      }
      visited.add(currentId);
      parent = parent.parent_lesson_id
        ? byId.get(String(parent.parent_lesson_id))
        : null;
    }
  }

  async updateLesson(lessonId, data, currentUser) {
    this.#requireManager(currentUser);
    const lesson = await this.#getLessonOwned(lessonId, currentUser);
    const parsed = LessonUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    if (Object.hasOwn(parsed.data, 'parent_lesson_id')) {
      await this.#assertLessonParent(
        lessonId,
        lesson.course_id,
        parsed.data.parent_lesson_id,
      );
    }
    return this.#hydrateJsonFields(await this.#repo.update('lessons', lessonId, this.#serializeJsonFields(parsed.data)));
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
    const rows = await this.#repo.query('course.availableForStudent', { userId: user.id });
    return (rows || []).map((row) => this.#hydrateJsonFields(row));
  }

  /** Course + lessons for a student: must be published and class-assigned. */
  async getForStudent(courseId, user) {
    const courses = await this.listForStudent(user);
    const course = (courses || []).find((c) => String(c.id) === String(courseId));
    if (!course) throw new NotFoundError('Course');
    const { data: lessons } = await this.#repo.getAll('lessons', {
      filters: { course_id: courseId }, orderBy: 'order_index', direction: 'asc', limit: 1000,
    });
    // Prep sheets are a teacher tool; keep them out of student payloads.
    const studentLessons = (lessons || []).map(({ prep_sheet: _drop, ...rest }) => rest);
    const { data: categories } = course.category_id
      ? await this.#repo.getAll('categories', { filters: { school_id: course.school_id }, limit: 100000 })
      : { data: [] };
    const categoryById = new Map((categories || []).map((category) => [String(category.id), category]));
    const childrenByParent = new Map();
    for (const category of categories || []) {
      const parentId = String(category.parent_id || '');
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(category);
    }
    for (const children of childrenByParent.values()) {
      children.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    const categoryOrder = new Map();
    const categoryChildren = new Map();
    const visited = new Set();
    const visit = (categoryId, seen = new Set()) => {
      const key = String(categoryId);
      if (seen.has(key) || visited.has(key)) return null;
      seen.add(key);
      visited.add(key);
      categoryOrder.set(key, categoryOrder.size);
      const category = categoryById.get(key);
      if (!category) return null;
      const children = (childrenByParent.get(key) || [])
        .map((child) => visit(child.id, new Set(seen)))
        .filter(Boolean);
      const node = {
        id: key,
        name: String(category.name || 'Unnamed'),
        children,
        lesson: null,
        lessons: [],
      };
      categoryChildren.set(key, node);
      return node;
    };
    const rootCategory = categoryById.has(String(course.category_id))
      ? visit(course.category_id)
      : null;

    const orderedLessons = [...(studentLessons || [])].sort((a, b) => {
      const aOrder = categoryOrder.get(String(a.category_id)) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = categoryOrder.get(String(b.category_id)) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || (a.order_index || 0) - (b.order_index || 0);
    });

    const lessonsWithCategoryLevels = orderedLessons.map((lesson) => {
      const levels = [];
      let category = categoryById.get(String(lesson.category_id || ''));
      const seen = new Set();
      while (category && !seen.has(String(category.id))) {
        seen.add(String(category.id));
        levels.unshift({ id: String(category.id), name: String(category.name || 'Unnamed') });
        if (String(category.id) === String(course.category_id)) break;
        category = categoryById.get(String(category.parent_id || ''));
      }
      const rootIndex = levels.findIndex((level) => level.id === String(course.category_id));
      // Objectives / Key concepts are Markdown sections inside the lesson
      // body. Attach the extracted items so the chapter page can aggregate
      // them without shipping a second endpoint.
      const highlights = extractLessonHighlights(lesson.content);
      return {
        ...lesson,
        category_levels: rootIndex >= 0 ? levels.slice(rootIndex) : [],
        objectives: highlights.objectives,
        key_concepts: highlights.keyConcepts,
      };
    });
    const lessonById = new Map(lessonsWithCategoryLevels.map((lesson) => [String(lesson.id), lesson]));
    const representedLessonIds = new Set();
    for (const lesson of lessonsWithCategoryLevels) {
      const categoryNode = categoryChildren.get(String(lesson.category_id || ''));
      if (categoryNode) {
        const lessonSummary = { id: String(lesson.id), title: String(lesson.title || 'Lesson') };
        categoryNode.lessons.push(lessonSummary);
        if (!categoryNode.lesson) categoryNode.lesson = lessonSummary;
        representedLessonIds.add(String(lesson.id));
      }
    }

    // Roll the per-lesson highlights up the tree: every grouping node
    // (module, chapter, section) exposes the Objectives / Key concepts of the
    // lessons underneath it, de-duplicated and capped so the panel stays
    // readable. The root node's arrays are the course-level goals.
    const MAX_HIGHLIGHTS = 24;
    const aggregateHighlights = (node, seen = new Set()) => {
      if (!node || seen.has(node.id)) return { objectives: [], keyConcepts: [] };
      seen.add(node.id);
      const collected = { objectives: [], keyConcepts: [] };
      const add = (target, values) => {
        for (const item of values || []) {
          if (target.length >= MAX_HIGHLIGHTS) break;
          if (!target.includes(item)) target.push(item);
        }
      };
      for (const child of node.children || []) {
        const nested = aggregateHighlights(child, seen);
        add(collected.objectives, nested.objectives);
        add(collected.keyConcepts, nested.keyConcepts);
      }
      for (const summary of node.lessons || []) {
        const lesson = lessonById.get(String(summary.id));
        add(collected.objectives, lesson?.objectives);
        add(collected.keyConcepts, lesson?.key_concepts);
      }
      node.objectives = collected.objectives;
      node.key_concepts = collected.keyConcepts;
      return collected;
    };
    aggregateHighlights(rootCategory);

    return {
      ...course,
      category_structure: rootCategory,
      lessons: lessonsWithCategoryLevels,
      unlinked_lessons: lessonsWithCategoryLevels
        .filter((lesson) => !representedLessonIds.has(String(lesson.id)))
        .map(({ id, title }) => ({ id: String(id), title: String(title || 'Lesson') })),
    };
  }

  async getLessonForStudent(lessonId, user) {
    const lesson = await this.#repo.getById('lessons', lessonId);
    if (!lesson) throw new NotFoundError('Lesson');
    await this.getForStudent(lesson.course_id, user); // visibility gate (published + assigned)
    const { prep_sheet: _drop, ...rest } = lesson;
    return rest;
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

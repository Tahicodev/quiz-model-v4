import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import {
  SubjectCreateSchema,
  SubjectUpdateSchema,
  SubjectFilterSchema,
} from '../../shared/schemas/subject.schema.js';
import { ROLES } from '../../shared/constants.js';

const MANAGE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

export class SubjectService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  #requireManager(user) {
    if (!user || !MANAGE_ROLES.includes(user.role)) throw new ForbiddenError();
  }

  #assertOwnership(subject, user) {
    if (user.role === ROLES.TEACHER && String(subject.created_by) !== String(user.id)) {
      throw new ForbiddenError('Not your subject');
    }
  }

  async list(filters = {}, pagination = {}) {
    const { created_by = undefined, ...restFilters } = filters;
    const parsed = SubjectFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (created_by !== undefined) rest.created_by = created_by;
    return this.#repo.getAll('subjects', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const subject = await this.#repo.getById('subjects', id);
    if (!subject) throw new NotFoundError('Subject');
    return subject;
  }

  async assertCanUse(id, user, schoolId = user?.school_id) {
    const subject = await this.getById(id);
    if (String(subject.school_id) !== String(schoolId)) {
      throw new ValidationError({ subject_id: ['Subject does not belong to this school.'] });
    }
    this.#assertOwnership(subject, user);
    return subject;
  }

  async create(data, user) {
    this.#requireManager(user);
    const parsed = SubjectCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const name = parsed.data.name.trim();
    const { data: existing } = await this.#repo.getAll('subjects', {
      filters: { school_id: user.school_id, created_by: user.id },
      limit: 100000,
    });
    if (existing.some((subject) => subject.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new ValidationError({ name: ['You already have a subject with this name.'] });
    }
    return this.#repo.create('subjects', {
      name,
      school_id: user.school_id,
      created_by: user.id,
    });
  }

  async update(id, data, user) {
    this.#requireManager(user);
    const subject = await this.getById(id);
    if (String(subject.school_id) !== String(user.school_id)) {
      throw new NotFoundError('Subject');
    }
    this.#assertOwnership(subject, user);
    const parsed = SubjectUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    if (parsed.data.name) {
      const name = parsed.data.name.trim();
      const { data: siblings } = await this.#repo.getAll('subjects', {
        filters: { school_id: subject.school_id, created_by: subject.created_by },
        limit: 100000,
      });
      if (siblings.some((item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new ValidationError({ name: ['You already have a subject with this name.'] });
      }
      parsed.data.name = name;
    }
    return this.#repo.update('subjects', id, parsed.data);
  }

  /**
   * Deleting a subject removes its whole category forest (the subject's
   * top-level categories and every descendant), detaches their questions to
   * Uncategorized, and deletes the courses generated from those branches (or
   * attached to the subject) — mirroring CategoryService.delete one level up.
   * Rows are collected with unfiltered fetches and matched locally so both
   * repo backends treat `subject_id: null` legacy rows the same way.
   */
  async delete(id, user) {
    this.#requireManager(user);
    const subject = await this.getById(id);
    if (String(subject.school_id) !== String(user.school_id)) {
      throw new NotFoundError('Subject');
    }
    this.#assertOwnership(subject, user);

    const { data: allCategories } = await this.#repo.getAll('categories', { limit: 100000 });
    const categories = (allCategories || []).filter(
      (category) => String(category?.subject_id || '') === String(id),
    );

    // Full forest: the subject's rows plus any descendant reached from them
    // (defensive — children normally carry the same subject_id).
    const removing = new Set(categories.map((category) => String(category.id)));
    let frontier = Array.from(removing);
    let guard = 0;
    while (frontier.length && guard++ < 100) {
      const next = [];
      const parentIdSet = new Set(frontier);
      for (const category of allCategories || []) {
        const parentId = category?.parent_id ? String(category.parent_id) : '';
        const cid = category?.id ? String(category.id) : '';
        if (parentId && parentIdSet.has(parentId) && !removing.has(cid)) {
          removing.add(cid);
          next.push(cid);
        }
      }
      frontier = next;
    }

    // Questions under the forest become uncategorized (never deleted) —
    // same contract as CategoryService.delete.
    const { data: questions } = await this.#repo.getAll('questions', { limit: 100000 });
    for (const question of questions || []) {
      if (question?.id && question.category_id && removing.has(String(question.category_id))) {
        await this.#repo.update('questions', question.id, { category_id: null });
      }
    }

    // Courses generated from the branches (root category in the forest) or
    // attached to the subject itself.
    const { data: courses } = await this.#repo.getAll('courses', { limit: 100000 });
    let coursesRemoved = 0;
    for (const course of courses || []) {
      const attached =
        (course?.category_id && removing.has(String(course.category_id))) ||
        String(course?.subject_id || '') === String(id);
      if (course?.id && attached) {
        await this.#repo.delete('courses', course.id);
        coursesRemoved++;
      }
    }

    for (const categoryId of removing) {
      await this.#repo.delete('categories', categoryId);
    }
    await this.#repo.delete('subjects', id);

    return { categoriesRemoved: removing.size, coursesRemoved };
  }
}

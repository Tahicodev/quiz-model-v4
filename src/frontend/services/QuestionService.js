/**
 * src/frontend/services/QuestionService.js
 */

import { NotFoundError, ForbiddenError, ValidationError }         from '../../shared/errors.js';
import { QuestionCreateSchema, QuestionUpdateSchema, QuestionFilterSchema } from '../../shared/schemas/question.schema.js';
import { ROLES }                                                   from '../../shared/constants.js';

export class QuestionService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    const parsed = QuestionFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('questions', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const q = await this.#repo.getById('questions', id);
    if (!q) throw new NotFoundError('Question');
    return q;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = QuestionCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.create('questions', {
      ...parsed.data,
      school_id: currentUser?.school_id,
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('questions', id);
    if (!existing) throw new NotFoundError('Question');

    const parsed = QuestionUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.update('questions', id, parsed.data);
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('questions', id);
    if (!existing) throw new NotFoundError('Question');

    // Cannot delete if used in an active exam
    const { data: examQs } = await this.#repo.getAll('exam_questions', {
      filters: { question_id: id },
    });
    for (const eq of examQs) {
      const exam = await this.#repo.getById('exams', eq.exam_id);
      if (exam?.status === 'active') {
        throw new ValidationError({ id: ['Cannot delete a question used in an active exam'] });
      }
    }

    await this.#repo.delete('questions', id);
  }

  async bulkImport(questionsArray, currentUser) {
    this.#requireAdmin(currentUser);
    const imported = [];
    const errors   = [];

    for (let i = 0; i < questionsArray.length; i++) {
      const parsed = QuestionCreateSchema.safeParse(questionsArray[i]);
      if (!parsed.success) {
        errors.push({ index: i, errors: parsed.error.flatten().fieldErrors });
        continue;
      }
      const created = await this.#repo.create('questions', {
        ...parsed.data,
        school_id: currentUser?.school_id,
      });
      imported.push(created);
    }

    return { imported, errors };
  }

  async getByCategory(categoryId) {
    const { data } = await this.#repo.getAll('questions', {
      filters: { category_id: categoryId },
      limit: 500,
    });
    return data;
  }

  async getStats() {
    const { data: all } = await this.#repo.getAll('questions', { limit: 9999 });
    const byType       = {};
    const byDifficulty = {};
    for (const q of all) {
      byType[q.type]           = (byType[q.type]           ?? 0) + 1;
      byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1;
    }
    return { total: all.length, byType, byDifficulty };
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}

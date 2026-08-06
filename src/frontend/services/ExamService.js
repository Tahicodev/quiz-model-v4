/**
 * src/frontend/services/ExamService.js
 */

import { NotFoundError, ForbiddenError, ValidationError }         from '../../shared/errors.js';
import { ExamCreateSchema, ExamUpdateSchema, ExamFilterSchema,
         ExamAddQuestionSchema, ExamReorderSchema }                from '../../shared/schemas/exam.schema.js';
import { ROLES, EXAM_STATUS }                                      from '../../shared/constants.js';

export class ExamService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    const parsed = ExamFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('exams', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const exam = await this.#repo.getById('exams', id);
    if (!exam) throw new NotFoundError('Exam');
    return exam;
  }

  async getWithQuestions(id, schoolId = null) {
    const exam = await this.#repo.query('exam.withQuestions', {
      examId: id,
      ...(schoolId ? { schoolId } : {}),
    });
    if (!exam) throw new NotFoundError('Exam');
    return exam;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = ExamCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.create('exams', {
      ...parsed.data,
      school_id:  currentUser?.school_id,
      creator_id: currentUser?.id        ?? 'system',
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('exams', id);
    if (!existing) throw new NotFoundError('Exam');
    if (existing.status === EXAM_STATUS.ARCHIVED) {
      throw new ValidationError({ status: ['Cannot modify an archived exam'] });
    }
    const parsed = ExamUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.update('exams', id, parsed.data);
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('exams', id);
    if (!existing) throw new NotFoundError('Exam');

    const { total } = await this.#repo.getAll('results', { filters: { exam_id: id } });
    if (total > 0) {
      throw new ValidationError({ id: ['Cannot delete an exam that has recorded results'] });
    }

    // Remove question links
    const { data: examQs } = await this.#repo.getAll('exam_questions', { filters: { exam_id: id } });
    for (const eq of examQs) await this.#repo.delete('exam_questions', eq.id);

    await this.#repo.delete('exams', id);
  }

  async addQuestion(examId, questionId, orderIndex, currentUser) {
    this.#requireAdmin(currentUser);
    if (typeof this.#repo.addExamQuestion === 'function') {
      return this.#repo.addExamQuestion(examId, {
        question_id: questionId,
        order_index: orderIndex ?? 0,
      });
    }
    const exam     = await this.#repo.getById('exams', examId);
    if (!exam) throw new NotFoundError('Exam');
    const question = await this.#repo.getById('questions', questionId);
    if (!question) throw new NotFoundError('Question');

    // Prevent duplicates
    const { data: existing } = await this.#repo.getAll('exam_questions', {
      filters: { exam_id: examId, question_id: questionId },
    });
    if (existing.length > 0) return existing[0]; // idempotent

    return this.#repo.create('exam_questions', {
      exam_id:     examId,
      question_id: questionId,
      order_index: orderIndex ?? 0,
    });
  }

  async removeQuestion(examId, questionId, currentUser) {
    this.#requireAdmin(currentUser);
    if (typeof this.#repo.removeExamQuestion === 'function') {
      return this.#repo.removeExamQuestion(examId, questionId);
    }
    const { data } = await this.#repo.getAll('exam_questions', {
      filters: { exam_id: examId, question_id: questionId },
    });
    if (data.length === 0) return; // already not linked
    await this.#repo.delete('exam_questions', data[0].id);
  }

  async reorderQuestions(examId, orderedQuestionIds, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = ExamReorderSchema.safeParse({ question_ids: orderedQuestionIds });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    if (typeof this.#repo.reorderExamQuestions === 'function') {
      return this.#repo.reorderExamQuestions(examId, orderedQuestionIds);
    }

    const { data: links } = await this.#repo.getAll('exam_questions', { filters: { exam_id: examId } });
    for (const link of links) {
      const newIndex = orderedQuestionIds.indexOf(link.question_id);
      if (newIndex !== -1) {
        await this.#repo.update('exam_questions', link.id, { order_index: newIndex });
      }
    }
  }

  async publish(examId, currentUser) {
    this.#requireAdmin(currentUser);
    const exam = await this.#repo.getById('exams', examId);
    if (!exam) throw new NotFoundError('Exam');
    if (exam.status !== EXAM_STATUS.DRAFT) {
      throw new ValidationError({ status: [`Exam must be in draft status to publish (current: ${exam.status})`] });
    }

    const { total } = await this.#repo.getAll('exam_questions', { filters: { exam_id: examId } });
    if (total === 0) {
      throw new ValidationError({ questions: ['An exam must have at least one question before publishing'] });
    }

    return this.#repo.update('exams', examId, { status: EXAM_STATUS.ACTIVE });
  }

  async archive(examId, currentUser) {
    this.#requireAdmin(currentUser);
    const exam = await this.#repo.getById('exams', examId);
    if (!exam) throw new NotFoundError('Exam');
    return this.#repo.update('exams', examId, { status: EXAM_STATUS.ARCHIVED });
  }

  async assignToClass(examId, classId, currentUser) {
    this.#requireAdmin(currentUser);
    if (typeof this.#repo.assignExamClass === 'function') {
      return this.#repo.assignExamClass(examId, classId);
    }
    const { data: existing } = await this.#repo.getAll('exam_classes', {
      filters: { exam_id: examId, class_id: classId },
    });
    if (existing.length > 0) return existing[0]; // idempotent
    return this.#repo.create('exam_classes', {
      exam_id:     examId,
      class_id:    classId,
      assigned_at: new Date().toISOString(),
    });
  }

  async removeFromClass(examId, classId, currentUser) {
    this.#requireAdmin(currentUser);
    if (typeof this.#repo.removeExamClass === 'function') {
      return this.#repo.removeExamClass(examId, classId);
    }
    const { data } = await this.#repo.getAll('exam_classes', {
      filters: { exam_id: examId, class_id: classId },
    });
    if (data.length === 0) return;
    await this.#repo.delete('exam_classes', data[0].id);
  }

  async getAssignedClasses(examId) {
    if (typeof this.#repo.getExamClasses === 'function') {
      const result = await this.#repo.getExamClasses(examId);
      return result?.data ?? result ?? [];
    }
    const { data } = await this.#repo.getAll('exam_classes', {
      filters: { exam_id: examId },
      limit: 200,
    });
    return data;
  }

  async getAvailableForStudent(userId) {
    return this.#repo.query('exam.availableForStudent', { userId });
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }
}

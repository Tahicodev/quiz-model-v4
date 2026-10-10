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
    // `creator_id` is server-derived (route-enforced teacher scope / admin
    // author filter), not client input — validate the rest, then re-attach.
    const { creator_id = undefined, ...restFilters } = filters;
    const parsed = ExamFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (creator_id !== undefined) rest.creator_id = creator_id;
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
    // `classes` and `questions` are assignment mirrors, not exams-row
    // columns: sync the junction tables instead of writing them onto the
    // row (they used to be silently stripped by the schema, so "Assign to
    // Classes" never reached student devices and "Assign Questions" was
    // lost on the next refresh after the questions disappeared).
    const { classes, questions, ...rowPatch } = parsed.data;
    const updated = await this.#repo.update('exams', id, rowPatch);
    if (classes !== undefined) {
      await this.#syncExamClasses(id, classes, currentUser);
    }
    if (questions !== undefined) {
      await this.#syncExamQuestions(id, questions, currentUser);
    }
    return updated;
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
    if (typeof this.#repo.getExamWithQuestions === 'function') {
      // The API deletes normalized question links through the exam cascade.
      // Do not issue unsupported generic CRUD calls for the junction table.
    } else {
      const { data: examQs } = await this.#repo.getAll('exam_questions', { filters: { exam_id: id } });
      for (const eq of examQs) await this.#repo.delete('exam_questions', eq.id);
    }

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

    let total;
    if (typeof this.#repo.getExamWithQuestions === 'function') {
      const hydrated = await this.#repo.getExamWithQuestions(examId);
      total = hydrated?.questions?.length ?? 0;
    } else {
      ({ total } = await this.#repo.getAll('exam_questions', { filters: { exam_id: examId } }));
    }
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

  // Reconcile the exam_classes junction table with the desired class set
  // (from the admin "Assign to Classes" picker). Teachers may only link
  // their own assigned classes; unknown/deleted class ids are dropped so
  // a stale picker can never hide an exam from every student.
  async #syncExamClasses(examId, classIds, currentUser) {
    const wanted = [...new Set((classIds || []).map(String))].filter(Boolean);
    let allowed = null;
    if (currentUser?.role === ROLES.TEACHER) {
      allowed = new Set(await this.#getTeacherClassIds(currentUser));
    }
    const finalIds = [];
    for (const classId of wanted) {
      if (allowed && !allowed.has(classId)) continue;
      try {
        const cls = await this.#repo.getById('classes', classId);
        if (cls) finalIds.push(classId);
      } catch {
        /* unknown class — skip instead of hiding the exam */
      }
    }
    const { data: current } = await this.#repo.getAll('exam_classes', {
      filters: { exam_id: examId },
      limit: 500,
    });
    const have = new Map(
      (current || []).map((row) => [String(row.class_id), row]),
    );
    for (const classId of finalIds) {
      if (!have.has(classId)) {
        await this.assignToClass(examId, classId, currentUser);
      }
    }
    for (const [classId, row] of have) {
      if (!finalIds.includes(classId)) {
        await this.#repo.delete('exam_classes', row.id);
      }
    }
  }

  // Reconcile the exam_questions junction table with the desired question
  // set (from the admin "Assign Questions" picker). Teachers may only link
  // their own questions; unknown/deleted question ids are dropped. Order is
  // preserved through order_index, mirroring the picker's sort.
  async #syncExamQuestions(examId, questionIds, currentUser) {
    const wanted = [...new Set((questionIds || []).map(String))].filter(Boolean);
    const allowed = new Set();
    for (const qid of wanted) {
      try {
        const question = await this.#repo.getById('questions', qid);
        if (!question) continue;
        if (currentUser?.role === ROLES.TEACHER) {
          // Matches the addQuestion route guard: teachers may only attach
          // questions they own (unattributed/admin rows are off-limits).
          if (String(question.created_by || question.creator_id || '') === String(currentUser.id)) {
            allowed.add(qid);
          }
        } else {
          allowed.add(qid);
        }
      } catch {
        /* unknown question — skip */
      }
    }
    const finalIds = [...allowed];
    const { data: current } = await this.#repo.getAll('exam_questions', {
      filters: { exam_id: examId },
      limit: 500,
    });
    const have = new Map(
      (current || []).map((row) => [String(row.question_id), row]),
    );
    let order = 0;
    for (const questionId of finalIds) {
      const row = have.get(questionId);
      if (!row) {
        await this.addQuestion(examId, questionId, order, currentUser);
      } else if (Number(row.order_index) !== order) {
        await this.#repo.update('exam_questions', row.id, { order_index: order });
      }
      have.delete(questionId);
      order++;
    }
    for (const [, row] of have) {
      await this.removeQuestion(examId, row.question_id, currentUser);
    }
  }

  async #getTeacherClassIds(currentUser) {
    try {
      const { data } = await this.#repo.getAll('settings', {
        filters: {
          school_id: currentUser?.school_id,
          key: 'teacherClassAssignments',
        },
        limit: 1,
      });
      const map = JSON.parse(data?.[0]?.value || '{}');
      const ids = map?.[currentUser?.id];
      return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }
}

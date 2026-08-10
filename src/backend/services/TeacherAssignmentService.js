/**
 * src/backend/services/TeacherAssignmentService.js
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export class TeacherAssignmentService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async listForCaller(user, { classId, limit = 200, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (user.role === ROLES.STUDENT) {
      filters.class_id = user.class_id ?? '__none__';
    } else if (classId) {
      filters.class_id = classId;
    }
    return this.#repo.getAll('teacher_assignments', {
      filters, limit, offset, orderBy: 'due_date', direction: 'asc',
    });
  }

  #requireAdmin(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }

  #sanitize(data) {
    const title = String(data.title ?? '').trim();
    if (!title) throw new ValidationError({ title: ['Required'] });
    return { title };
  }

  async create(user, data) {
    this.#requireAdmin(user);
    return this.#repo.create('teacher_assignments', {
      ...this.#sanitize(data),
      school_id: user.school_id,
      class_id: data.class_id ?? null,
      teacher_id: user.id,
      description: data.description ?? null,
      due_date: data.due_date ?? data.dueDate ? new Date(data.due_date ?? data.dueDate) : null,
    });
  }

  async update(user, id, data) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('teacher_assignments', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('TeacherAssignment');
    const patch = {};
    if (data.title !== undefined) Object.assign(patch, this.#sanitize(data));
    if (data.class_id !== undefined) patch.class_id = data.class_id;
    if (data.description !== undefined) patch.description = data.description;
    if (data.due_date !== undefined || data.dueDate !== undefined) {
      patch.due_date = (data.due_date ?? data.dueDate) ? new Date(data.due_date ?? data.dueDate) : null;
    }
    return this.#repo.update('teacher_assignments', id, patch);
  }

  async delete(user, id) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('teacher_assignments', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('TeacherAssignment');
    await this.#repo.delete('teacher_assignments', id);
  }
}

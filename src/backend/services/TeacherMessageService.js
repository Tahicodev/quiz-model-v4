/**
 * src/backend/services/TeacherMessageService.js
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export class TeacherMessageService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async listForCaller(user, { classId, limit = 200, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (user.role === ROLES.STUDENT) {
      // Students only see their own class' board
      filters.class_id = user.class_id ?? '__none__';
    } else if (classId) {
      filters.class_id = classId;
    }
    return this.#repo.getAll('teacher_messages', {
      filters, limit, offset, orderBy: 'date', direction: 'desc',
    });
  }

  #requireAdmin(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }

  #sanitize(data) {
    const title = String(data.title ?? '').trim();
    const body = String(data.body ?? data.message ?? '').trim();
    if (!title || !body) {
      throw new ValidationError({
        title: !title ? ['Required'] : undefined,
        body: !body ? ['Required'] : undefined,
      });
    }
    return { title, body };
  }

  async create(user, data) {
    this.#requireAdmin(user);
    return this.#repo.create('teacher_messages', {
      ...this.#sanitize(data),
      school_id: user.school_id,
      class_id: data.class_id ?? null,
      class_name: data.class_name ?? data.className ?? null,
      teacher_id: user.id,
      teacher_name: user.name ?? null,
      ...(data.date && { date: new Date(data.date) }),
    });
  }

  async update(user, id, data) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('teacher_messages', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('TeacherMessage');
    const patch = {};
    if (data.title !== undefined || data.body !== undefined || data.message !== undefined) {
      Object.assign(patch, this.#sanitize({ ...existing, ...data }));
    }
    if (data.class_id !== undefined) patch.class_id = data.class_id;
    if (data.class_name !== undefined) patch.class_name = data.class_name;
    if (data.date !== undefined) patch.date = new Date(data.date);
    return this.#repo.update('teacher_messages', id, patch);
  }

  async delete(user, id) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('teacher_messages', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('TeacherMessage');
    await this.#repo.delete('teacher_messages', id);
  }
}

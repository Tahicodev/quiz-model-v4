/**
 * src/frontend/services/ClassService.js
 * Manages Class entities and student assignments.
 */

import { NotFoundError, ForbiddenError, ValidationError }         from '../../shared/errors.js';
import { ClassCreateSchema, ClassUpdateSchema, ClassFilterSchema } from '../../shared/schemas/class.schema.js';
import { ROLES }                                                   from '../../shared/constants.js';

export class ClassService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    const parsed = ClassFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('classes', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const cls = await this.#repo.getById('classes', id);
    if (!cls) throw new NotFoundError('Class');
    return cls;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = ClassCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.create('classes', {
      ...parsed.data,
      school_id: currentUser?.school_id ?? 'local',
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('classes', id);
    if (!existing) throw new NotFoundError('Class');

    const parsed = ClassUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    return this.#repo.update('classes', id, parsed.data);
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('classes', id);
    if (!existing) throw new NotFoundError('Class');

    // Rule: Cannot delete a class that has students
    const { total: studentCount } = await this.#repo.getAll('users', { filters: { class_id: id } });
    if (studentCount > 0) {
      throw new ValidationError({ id: ['Cannot delete a class that still has students assigned'] });
    }

    // Clean up exam assignments
    const { data: examClasses } = await this.#repo.getAll('exam_classes', { filters: { class_id: id } });
    for (const ec of examClasses) {
      await this.#repo.delete('exam_classes', ec.id);
    }

    await this.#repo.delete('classes', id);
  }

  async getStudents(classId) {
    const { data } = await this.#repo.getAll('users', {
      filters: { class_id: classId },
      limit: 1000,
    });
    return data.map(u => {
      const { password, password_hash, ...safe } = u;
      return safe;
    });
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}

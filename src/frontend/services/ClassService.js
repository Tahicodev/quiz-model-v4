/**
 * src/frontend/services/ClassService.js
 * Manages Class entities and student assignments.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
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
    // Class names are unique within a school (see @@unique([school_id, name])).
    // Check first so callers get a clean 409 with a readable message instead of
    // an opaque unique-constraint error from the database.
    const { data: duplicates } = await this.#repo.getAll('classes', {
      filters: { school_id: currentUser?.school_id, name: parsed.data.name },
      limit: 1,
    });
    if (duplicates?.length) {
      throw new ConflictError(`A class named "${parsed.data.name}" already exists`);
    }
    return this.#repo.create('classes', {
      ...parsed.data,
      school_id: currentUser?.school_id,
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

    // Keep the service contract used by the admin UI: classes with enrolled
    // students must be reassigned first instead of silently orphaning them.
    const { total: studentCount } = await this.#repo.getAll('users', {
      filters: { class_id: id },
    });
    if (studentCount > 0) {
      throw new ValidationError({
        id: ['Cannot delete a class that still has students assigned'],
      });
    }

    // Clean up exam assignments
    const { data: examClasses } = await this.#repo.getAll('exam_classes', { filters: { class_id: id } });
    for (const ec of examClasses) {
      await this.#repo.delete('exam_classes', ec.id);
    }

    // Drop the class from every teacher's assignment list so the deleted
    // id stops matching in teacher views (best-effort: never fail the
    // delete itself because of this).
    try {
      const { data: settings } = await this.#repo.getAll('settings', {
        filters: { school_id: existing.school_id, key: 'teacherClassAssignments' },
        limit: 10,
      });
      for (const row of settings || []) {
        let map = {};
        try { map = JSON.parse(row.value || '{}') || {}; } catch { map = {}; }
        let changed = false;
        for (const teacherId of Object.keys(map)) {
          if (Array.isArray(map[teacherId]) && map[teacherId].map(String).includes(String(id))) {
            map[teacherId] = map[teacherId].map(String).filter((cid) => cid !== String(id));
            changed = true;
          }
        }
        if (changed) {
          await this.#repo.update('settings', row.id, { value: JSON.stringify(map) });
        }
      }
    } catch { /* ignore */ }

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
    if (!user || ![ROLES.ADMIN, ROLES.TEACHER].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}

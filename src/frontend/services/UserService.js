/**
 * src/frontend/services/UserService.js
 * Manages user CRUD. Only accessible to admin role — enforced by route middleware in SaaS,
 * and by checking req.user.role in local mode.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import { UserCreateSchema, UserUpdateSchema, UserFilterSchema }          from '../../shared/schemas/user.schema.js';
import { ROLES }                                                         from '../../shared/constants.js';

export class UserService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    const parsed = UserFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('users', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const user = await this.#repo.getById('users', id);
    if (!user) throw new NotFoundError('User');
    return this.#stripPassword(user);
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = UserCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    // Check uniqueness
    const { data: existing } = await this.#repo.getAll('users', {
      filters: { username: parsed.data.username },
    });
    if (existing.length > 0) throw new ConflictError(`Username "${parsed.data.username}" is already taken`);

    const user = await this.#repo.create('users', {
      ...parsed.data,
      school_id: currentUser.school_id ?? 'local',
    });
    return this.#stripPassword(user);
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('users', id);
    if (!existing) throw new NotFoundError('User');

    const parsed = UserUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const updated = await this.#repo.update('users', id, parsed.data);
    return this.#stripPassword(updated);
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    if (id === currentUser.id) throw new ValidationError({ id: ['Cannot delete your own account'] });

    const existing = await this.#repo.getById('users', id);
    if (!existing) throw new NotFoundError('User');

    // Protect the last admin
    if (existing.role === ROLES.ADMIN) {
      const { data: admins } = await this.#repo.getAll('users', { filters: { role: ROLES.ADMIN } });
      if (admins.length <= 1) {
        throw new ValidationError({ id: ['Cannot delete the only admin account'] });
      }
    }

    await this.#repo.delete('users', id);
  }

  async changeStatus(id, status, currentUser) {
    this.#requireAdmin(currentUser);
    if (id === currentUser.id) throw new ValidationError({ id: ['Cannot change your own status'] });
    const existing = await this.#repo.getById('users', id);
    if (!existing) throw new NotFoundError('User');
    const updated = await this.#repo.update('users', id, { status });
    return this.#stripPassword(updated);
  }

  async assignToClass(userId, classId, currentUser) {
    this.#requireAdmin(currentUser);
    const user = await this.#repo.getById('users', userId);
    if (!user) throw new NotFoundError('User');
    const cls = await this.#repo.getById('classes', classId);
    if (!cls) throw new NotFoundError('Class');
    const updated = await this.#repo.update('users', userId, { class_id: classId });
    return this.#stripPassword(updated);
  }

  async resetPassword(userId, newPassword, currentUser) {
    this.#requireAdmin(currentUser);
    const user = await this.#repo.getById('users', userId);
    if (!user) throw new NotFoundError('User');
    if (newPassword.length < 6) throw new ValidationError({ password: ['Minimum 6 characters'] });
    await this.#repo.update('users', userId, { password: newPassword, updated_at: new Date().toISOString() });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  #stripPassword(user) {
    const { password, password_hash, ...safe } = user;
    return safe;
  }
}

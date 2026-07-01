/**
 * src/backend/services/UserService.js
 *
 * User CRUD. Admin-only mutations (enforced by route middleware, re-checked here).
 * Hashes passwords with bcrypt (rounds from config) and never returns password_hash.
 */

import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import { UserCreateSchema, UserUpdateSchema, UserFilterSchema } from '../../shared/schemas/user.schema.js';
import { ROLES } from '../../shared/constants.js';

export class UserService {
  #repo;
  #logger;

  /**
   * @param {import('../../frontend/infrastructure/IStorageRepository.js').IStorageRepository} repo
   * @param {object} logger
   */
  constructor(repo, logger) {
    this.#repo = repo;
    this.#logger = logger;
  }

  async list(filters = {}, pagination = {}) {
    const parsed = UserFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    const result = await this.#repo.getAll('users', { filters: rest, limit, offset, orderBy, direction, search });
    return { data: result.data.map(this.#stripPassword), total: result.total };
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

    // Uniqueness check (scoped to tenant by the route's filters)
    const { data: existing } = await this.#repo.getAll('users', {
      filters: { school_id: currentUser.school_id, username: parsed.data.username },
    });
    if (existing.length > 0) {
      throw new ConflictError(`Username "${parsed.data.username}" is already taken`);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, config.bcryptRounds);
    const user = await this.#repo.create('users', {
      school_id: currentUser.school_id,
      username: parsed.data.username,
      name: parsed.data.name,
      password_hash: passwordHash,
      role: parsed.data.role,
      numero: parsed.data.numero,
      class_id: parsed.data.class_id,
      status: parsed.data.status,
    });

    this.#logger.info({ userId: user.id, actorId: currentUser.id }, 'User created');
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
    if (id === currentUser.id) {
      throw new ValidationError({ id: ['Cannot delete your own account'] });
    }

    const existing = await this.#repo.getById('users', id);
    if (!existing) throw new NotFoundError('User');

    // Protect the last admin in the tenant
    if (existing.role === ROLES.ADMIN) {
      const { data: admins } = await this.#repo.getAll('users', {
        filters: { school_id: currentUser.school_id, role: ROLES.ADMIN },
      });
      if (admins.length <= 1) {
        throw new ValidationError({ id: ['Cannot delete the only admin account'] });
      }
    }

    await this.#repo.delete('users', id);
    this.#logger.info({ userId: id, actorId: currentUser.id }, 'User deleted');
  }

  async changeStatus(id, status, currentUser) {
    this.#requireAdmin(currentUser);
    if (id === currentUser.id) {
      throw new ValidationError({ id: ['Cannot change your own status'] });
    }
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

  /**
   * Admin-initiated password reset.
   */
  async resetPassword(userId, newPassword, currentUser) {
    this.#requireAdmin(currentUser);
    if (newPassword.length < 6) {
      throw new ValidationError({ password: ['Minimum 6 characters'] });
    }
    const user = await this.#repo.getById('users', userId);
    if (!user) throw new NotFoundError('User');

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await this.#repo.update('users', userId, { password_hash: passwordHash });
    this.#logger.info({ userId, actorId: currentUser.id }, 'User password reset by admin');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  #stripPassword(user) {
    const { password_hash, password, ...safe } = user;
    return safe;
  }
}

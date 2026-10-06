/**
 * src/backend/services/UserService.js
 *
 * User CRUD. Mutations accept admin and teacher actors — the routes enforce
 * the teacher scope (own-class students only); status/class assignment and
 * password resets stay admin-only. Never returns password_hash.
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
    // `class_id` may carry a server-derived { in: [...] } scope (teacher's
    // classes) — not client input. Validate the rest, then re-attach.
    const { class_id = undefined, ...restFilters } = filters;
    const parsed = UserFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (class_id !== undefined) rest.class_id = class_id;
    const result = await this.#repo.getAll('users', { filters: rest, limit, offset, orderBy, direction, search });
    return { data: result.data.map(this.#stripPassword), total: result.total };
  }

  async getById(id) {
    const user = await this.#repo.getById('users', id);
    if (!user) throw new NotFoundError('User');
    return this.#stripPassword(user);
  }

  async create(data, currentUser) {
    this.#requireStaff(currentUser);
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
      title: parsed.data.title ?? null,
      password_hash: passwordHash,
      role: parsed.data.role,
      numero: parsed.data.numero,
      class_id: parsed.data.class_id,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      // Teacher subjects live as a JSON array column (["Math","Physics"]).
      subjects_json: parsed.data.subjects ? JSON.stringify(parsed.data.subjects) : null,
      status: parsed.data.status,
    });

    this.#logger.info({ userId: user.id, actorId: currentUser.id }, 'User created');
    return this.#stripPassword(user);
  }

  async update(id, data, currentUser) {
    this.#requireStaff(currentUser);
    const existing = await this.#repo.getById('users', id);
    if (!existing) throw new NotFoundError('User');

    const parsed = UserUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    // Split the validated payload into DB columns: subjects (array) goes to
    // subjects_json; everything else maps 1:1 onto the User table.
    const { subjects, ...columns } = parsed.data;
    const updated = await this.#repo.update('users', id, {
      ...columns,
      ...(subjects !== undefined && {
        subjects_json: subjects ? JSON.stringify(subjects) : null,
      }),
    });
    return this.#stripPassword(updated);
  }

  async delete(id, currentUser) {
    this.#requireStaff(currentUser);
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

  /**
   * Self-service profile edit. Any authenticated user may update their own
   * display fields; role, status, class, numero and credentials never flow
   * through here (passwords use POST /auth/change-password).
   */
  async updateOwnProfile(id, data, currentUser) {
    const existing = await this.#repo.getById('users', id);
    if (!existing || existing.school_id !== currentUser.school_id) {
      throw new NotFoundError('User');
    }
    const patch = {};
    if (data.name !== undefined) {
      const name = String(data.name || '').trim();
      if (!name) throw new ValidationError({ name: ['Required'] });
      patch.name = name.slice(0, 100);
    }
    if (data.title !== undefined) {
      patch.title = data.title === 'Mr' || data.title === 'Mme' ? data.title : null;
    }
    // Staff contacts — students have no use for them and cannot set them.
    if (currentUser.role !== ROLES.STUDENT) {
      if (data.email !== undefined) {
        const email = String(data.email || '').trim();
        patch.email = email || null;
      }
      if (data.phone !== undefined) {
        const phone = String(data.phone || '').trim();
        patch.phone = phone || null;
      }
    }
    if (!Object.keys(patch).length) {
      throw new ValidationError({ _global: ['Nothing to update'] });
    }
    const updated = await this.#repo.update('users', id, patch);
    this.#logger.info({ userId: id }, 'Own profile updated');
    return this.#stripPassword(updated);
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  // Teachers reach create/update/delete only through the scoped user routes
  // (own-class students); direct service callers must still be staff.
  #requireStaff(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  #stripPassword(user) {
    const { password_hash, password, ...safe } = user;
    return safe;
  }
}

/**
 * src/backend/services/ProfileRequestService.js
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export class ProfileRequestService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async createForUser(user, data) {
    const changes = data.changes_json ?? data.changes ?? {};
    return this.#repo.create('profile_requests', {
      school_id: user.school_id,
      user_id: user.id,
      status: 'pending',
      changes_json: typeof changes === 'string' ? changes : JSON.stringify(changes),
      avatar: data.avatar ?? null,
      note: data.note ?? null,
      snapshot_json: data.snapshot_json
        ? (typeof data.snapshot_json === 'string' ? data.snapshot_json : JSON.stringify(data.snapshot_json))
        : null,
    });
  }

  async listForCaller(user, { status, limit = 100, offset = 0, teacherClassIds = null } = {}) {
    const filters = { school_id: user.school_id };
    if (status) filters.status = status;
    if (user.role === ROLES.STUDENT) filters.user_id = user.id;
    const result = await this.#repo.getAll('profile_requests', {
      filters, limit, offset, orderBy: 'created_at', direction: 'desc',
    });
    // Teachers see only requests of students in their assigned classes.
    if (user.role === ROLES.TEACHER && Array.isArray(teacherClassIds)) {
      const allowedClasses = new Set(teacherClassIds.map(String));
      const { data: students } = await this.#repo.getAll('users', {
        filters: { school_id: user.school_id, role: ROLES.STUDENT },
        limit: 100000,
      });
      const allowedUsers = new Set(
        (students || [])
          .filter((u) => u?.class_id && allowedClasses.has(String(u.class_id)))
          .map((u) => String(u.id)),
      );
      return {
        data: (result.data || []).filter((r) => allowedUsers.has(String(r.user_id))),
        total: (result.data || []).filter((r) => allowedUsers.has(String(r.user_id))).length,
      };
    }
    return result;
  }

  async getOwned(id, user) {
    const req = await this.#repo.getById('profile_requests', id);
    if (!req || req.school_id !== user.school_id) throw new NotFoundError('ProfileRequest');
    return req;
  }

  #requireAdmin(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }

  // Reviewers reach review() through scoped routes (teachers: own students
  // only); admins keep full access.
  #requireStaff(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(user.role)) throw new ForbiddenError();
  }

  async updatePendingOwn(id, user, data) {
    const req = await this.getOwned(id, user);
    if (req.user_id !== user.id) throw new ForbiddenError();
    if (req.status !== 'pending') {
      throw new ValidationError({ status: ['Only pending requests can be edited'] });
    }
    const patch = {};
    if (data.changes_json != null || data.changes != null) {
      const ch = data.changes_json ?? data.changes;
      patch.changes_json = typeof ch === 'string' ? ch : JSON.stringify(ch);
    }
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.note !== undefined) patch.note = data.note;
    return this.#repo.update('profile_requests', id, patch);
  }

  async cancelPendingOwn(id, user) {
    const req = await this.getOwned(id, user);
    if (user.role === ROLES.STUDENT && req.user_id !== user.id) throw new ForbiddenError();
    if (req.status !== 'pending') {
      throw new ValidationError({ status: ['Only pending requests can be cancelled'] });
    }
    await this.#repo.delete('profile_requests', id);
  }

  async review(id, user, { approve, note = null }) {
    this.#requireStaff(user);
    const req = await this.getOwned(id, user);
    if (req.status !== 'pending') {
      throw new ValidationError({ status: ['Request already reviewed'] });
    }
    // On approve, materialize the requested changes onto the user row so the
    // decision survives the next bootstrap (local-only application would be
    // reverted). Rejecting flips status only.
    if (approve) await this.#applyApprovedChanges(req);
    return this.#repo.update('profile_requests', id, {
      status: approve ? 'approved' : 'rejected',
      reviewer_id: user.id,
      review_note: note,
      reviewed_at: new Date(),
    });
  }

  async #applyApprovedChanges(req) {
    let changes = {};
    try {
      changes = JSON.parse(req.changes_json || '{}') || {};
    } catch {
      return;
    }
    const target = await this.#repo.getById('users', req.user_id);
    if (!target) return;
    const patch = {};
    if (changes.name) patch.name = String(changes.name).slice(0, 100);
    if (changes.username) {
      const wanted = String(changes.username).trim();
      if (wanted && wanted.toLowerCase() !== String(target.username || '').toLowerCase()) {
        const { data: clash } = await this.#repo.getAll('users', {
          filters: { school_id: req.school_id, username: wanted },
          limit: 2,
        });
        if ((clash || []).some((u) => String(u.id) !== String(target.id))) {
          throw new ValidationError({ username: ['Username already taken'] });
        }
        patch.username = wanted;
      }
    }
    if (changes.studentNumber) patch.numero = String(changes.studentNumber).slice(0, 50);
    if (changes.classId) patch.class_id = String(changes.classId);
    if (changes.email !== undefined) patch.email = String(changes.email || '').trim() || null;
    if (Object.keys(patch).length) {
      await this.#repo.update('users', target.id, patch);
    }
  }
}

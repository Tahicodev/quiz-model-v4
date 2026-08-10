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

  async listForCaller(user, { status, limit = 100, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (status) filters.status = status;
    if (user.role === ROLES.STUDENT) filters.user_id = user.id;
    return this.#repo.getAll('profile_requests', {
      filters, limit, offset, orderBy: 'created_at', direction: 'desc',
    });
  }

  async getOwned(id, user) {
    const req = await this.#repo.getById('profile_requests', id);
    if (!req || req.school_id !== user.school_id) throw new NotFoundError('ProfileRequest');
    return req;
  }

  #requireAdmin(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
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
    this.#requireAdmin(user);
    const req = await this.getOwned(id, user);
    if (req.status !== 'pending') {
      throw new ValidationError({ status: ['Request already reviewed'] });
    }
    return this.#repo.update('profile_requests', id, {
      status: approve ? 'approved' : 'rejected',
      reviewer_id: user.id,
      review_note: note,
      reviewed_at: new Date(),
    });
  }
}

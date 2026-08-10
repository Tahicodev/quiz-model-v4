/**
 * src/backend/services/NotificationService.js
 * Tenant-scoped notifications. Creation happens internally (called by other
 * services when e.g. a profile request lands); reads are exposed via routes.
 */

export class NotificationService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async push({ schoolId, type, message, data = null }) {
    if (!schoolId || !type || !message) return null;
    return this.#repo.create('notifications', {
      school_id: schoolId,
      type: String(type),
      message: String(message),
      ...(data != null && { data_json: typeof data === 'string' ? data : JSON.stringify(data) }),
    });
  }

  async listForTenant(schoolId, { limit = 100, offset = 0 } = {}) {
    return this.#repo.getAll('notifications', {
      filters: { school_id: schoolId },
      orderBy: 'created_at',
      direction: 'desc',
      limit,
      offset,
    });
  }

  async countUnread(schoolId) {
    const { total } = await this.#repo.getAll('notifications', {
      filters: { school_id: schoolId, read_at: null },
      limit: 1,
    });
    return total;
  }

  async markAllRead(schoolId) {
    const model = this.#repo.modelFor('notifications');
    const result = await model.updateMany({
      where: { school_id: schoolId, read_at: null },
      data: { read_at: new Date() },
    });
    return result.count;
  }
}

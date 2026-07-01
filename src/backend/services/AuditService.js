/**
 * src/backend/services/AuditService.js
 *
 * Structured audit logging. Every mutating admin action records an entry.
 * Audit failure must NEVER crash the calling operation — write errors are
 * caught and logged, then swallowed.
 */

import { logger } from '../logger.js';

export class AuditService {
  #repo;

  /** @param {import('../../frontend/infrastructure/IStorageRepository.js').IStorageRepository} repo */
  constructor(repo) {
    this.#repo = repo;
  }

  /**
   * @param {object} input
   * @param {string} input.schoolId
   * @param {string|null} input.actorId     null = system action
   * @param {string} input.entityType       "question" | "exam" | "user" | "game" | "setting" | "auth"
   * @param {string} input.entityId
   * @param {string} input.action           "create" | "update" | "delete" | "login" | "logout" | ...
   * @param {object|null} [input.diff]      { before, after } for updates
   * @param {string|null} [input.ip]
   * @param {string|null} [input.userAgent]
   */
  async log({ schoolId, actorId, entityType, entityId, action, diff = null, ip = null, userAgent = null }) {
    try {
      return await this.#repo.create('audit_logs', {
        school_id: schoolId,
        actor_id: actorId || null,
        entity_type: entityType,
        entity_id: entityId,
        action,
        diff_json: diff ? JSON.stringify(diff) : null,
        ip_address: ip || null,
        user_agent: userAgent || null,
      });
    } catch (err) {
      // Audit failure must NEVER crash the main operation.
      logger.error({ err, entityType, entityId, action }, 'Audit log write failed');
      return null;
    }
  }
}

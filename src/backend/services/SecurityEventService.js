/**
 * src/backend/services/SecurityEventService.js
 *
 * Durable, append-only record of authentication and access-control events.
 *
 * Why this is separate from AuditLog
 * ──────────────────────────────────
 * AuditLog answers "which administrative action was performed on which
 * entity". SecurityEvent answers "who tried to get in, and did they succeed".
 * They have different lifecycles (a security event may belong to no
 * organization at all — a login attempt naming a username that exists
 * nowhere), different retention expectations, and different consumers.
 *
 * NEVER store passwords, tokens, refresh tokens or API keys here. `meta_json`
 * is limited to small non-secret scalars.
 */

import { ROLES } from '../../shared/constants.js';

/** The closed set of event types this service writes. */
export const SECURITY_EVENT_TYPES = Object.freeze({
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  SESSION_REVOKED: 'session_revoked',
  ACCESS_DENIED: 'access_denied',
  ACCOUNT_STATUS_CHANGED: 'account_status_changed',
  PERMISSION_CHANGED: 'permission_changed',
});

export const SECURITY_EVENT_LABELS = Object.freeze({
  login_success: 'Successful sign-in',
  login_failure: 'Failed sign-in',
  logout: 'Sign-out',
  password_change: 'Password changed',
  password_reset: 'Password reset',
  session_revoked: 'Session revoked',
  access_denied: 'Access denied',
  account_status_changed: 'Account status changed',
  permission_changed: 'Permission changed',
});

/** Severity per event type. */
const SEVERITY = Object.freeze({
  login_failure: 'warning',
  access_denied: 'warning',
  account_status_changed: 'warning',
  session_revoked: 'warning',
  password_reset: 'warning',
  permission_changed: 'critical',
});

/** Outcome per event type. */
const OUTCOME = Object.freeze({
  login_failure: 'denied',
  access_denied: 'denied',
});

export class SecurityEventService {
  /** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
  constructor(repo) {
    this.#repo = repo;
  }

  #repo;

  get events() {
    return this.#repo.modelFor('security_events');
  }

  /**
   * Record a security event.
   *
   * Never throws: a failure to write the trail must not break the operation
   * the user was performing (a login must succeed even if the audit write
   * fails).
   *
   * @param {{ type:string, schoolId?:string|null, userId?:string|null,
   *           username?:string|null, reason?:string|null, ip?:string|null,
   *           userAgent?:string|null, meta?:object|null }} input
   */
  async record({
    type,
    schoolId = null,
    userId = null,
    username = null,
    reason = null,
    ip = null,
    userAgent = null,
    meta = null,
  }) {
    if (!type) return null;
    try {
      return await this.events.create({
        data: {
          school_id: schoolId || null,
          user_id: userId || null,
          username: username || null,
          event_type: type,
          outcome: OUTCOME[type] || 'success',
          severity: SEVERITY[type] || 'info',
          reason: reason || null,
          ip_address: ip || null,
          user_agent: userAgent || null,
          meta_json: meta ? JSON.stringify(meta) : null,
        },
      });
    } catch {
      // The trail is best-effort by design: never block the caller.
      return null;
    }
  }

  /**
   * Record a failed sign-in attempt. `schoolId`/`userId` are null when the
   * attempt named an account that does not exist — that is exactly the
   * pattern worth surfacing.
   */
  async recordLoginFailure({ username = null, userId = null, schoolId = null, reason = null, ip = null, userAgent = null }) {
    return this.record({
      type: SECURITY_EVENT_TYPES.LOGIN_FAILURE,
      username,
      userId,
      schoolId,
      reason,
      ip,
      userAgent,
    });
  }

  /**
   * Record a successful sign-in.
   */
  async recordLoginSuccess({ username = null, userId = null, schoolId = null, role = null, ip = null, userAgent = null }) {
    return this.record({
      type: SECURITY_EVENT_TYPES.LOGIN_SUCCESS,
      username,
      userId,
      schoolId,
      ip,
      userAgent,
      meta: role ? { role } : null,
    });
  }

  /**
   * Query the trail.
   *
   * @param {{ schoolIds?:string[]|null, eventTypes?:string[]|null,
   *           severity?:string|null, outcome?:string|null,
   *           userId?:string|null, search?:string|null,
   *           from?:Date|null, to?:Date|null,
   *           limit?:number, offset?:number }} filters
   */
  async list(filters = {}) {
    const {
      schoolIds = null,
      eventTypes = null,
      severity = null,
      outcome = null,
      userId = null,
      search = null,
      from = null,
      to = null,
      limit = 50,
      offset = 0,
    } = filters;

    const where = {};
    // A null schoolIds means "every organization" (platform scope).
    if (Array.isArray(schoolIds)) where.school_id = { in: schoolIds };
    if (Array.isArray(eventTypes) && eventTypes.length) where.event_type = { in: eventTypes };
    if (severity) where.severity = severity;
    if (outcome) where.outcome = outcome;
    if (userId) where.user_id = userId;
    if (from || to) {
      where.occurred_at = {};
      if (from) where.occurred_at.gte = from;
      if (to) where.occurred_at.lte = to;
    }
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { reason: { contains: search } },
        { ip_address: { contains: search } },
      ];
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [rows, total] = await Promise.all([
      this.events.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip: safeOffset,
        take: safeLimit,
        include: {
          school: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, username: true, role: true } },
        },
      }),
      this.events.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.#present(row)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  /**
   * Aggregated counts per event type over a window — the shape the console's
   * "security events" panel needs.
   */
  async summarize({ schoolIds = null, from = null, to = null } = {}) {
    const where = {};
    if (Array.isArray(schoolIds)) where.school_id = { in: schoolIds };
    if (from || to) {
      where.occurred_at = {};
      if (from) where.occurred_at.gte = from;
      if (to) where.occurred_at.lte = to;
    }

    const grouped = await this.events.groupBy({
      by: ['event_type', 'severity'],
      where,
      _count: { _all: true },
    });

    const counts = {};
    for (const row of grouped) {
      counts[row.event_type] = (counts[row.event_type] || 0) + row._count._all;
    }

    // Distinct sources of failures — the signal that matters for "suspicious
    // activity", not the raw count.
    const failureWhere = { ...where, event_type: SECURITY_EVENT_TYPES.LOGIN_FAILURE };
    const [byIp, byUsername] = await Promise.all([
      this.events.groupBy({
        by: ['ip_address'],
        where: failureWhere,
        _count: { _all: true },
        orderBy: { _count: { ip_address: 'desc' } },
        take: 5,
      }),
      this.events.groupBy({
        by: ['username'],
        where: failureWhere,
        _count: { _all: true },
        orderBy: { _count: { username: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      counts,
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      topFailureSources: {
        byIp: byIp
          .filter((row) => row.ip_address)
          .map((row) => ({ ip: row.ip_address, count: row._count._all })),
        byUsername: byUsername
          .filter((row) => row.username)
          .map((row) => ({ username: row.username, count: row._count._all })),
      },
    };
  }

  #present(row) {
    return {
      id: row.id,
      schoolId: row.school_id,
      schoolName: row.school?.name || null,
      userId: row.user_id,
      userName: row.user?.name || row.user?.username || null,
      userRole: row.user?.role || null,
      username: row.username,
      type: row.event_type,
      typeLabel: SECURITY_EVENT_LABELS[row.event_type] || row.event_type,
      outcome: row.outcome,
      severity: row.severity,
      reason: row.reason,
      ip: row.ip_address,
      userAgent: row.user_agent,
      meta: row.meta_json ? JSON.parse(row.meta_json) : null,
      occurredAt: row.occurred_at,
    };
  }
}

/** True when the role may operate outside a single organization. */
export function isPlatformRole(role) {
  return role === ROLES.SUPER_ADMIN;
}

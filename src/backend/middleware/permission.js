/**
 * src/backend/middleware/permission.js
 *
 * Permission-based authorization + scope resolution for the Admin console.
 *
 * Why this exists
 * ────────────────
 * `requireRole()` answers "is this one of these roles?". It cannot express
 * "may this administrator reach *that* organization?" — which is exactly the
 * question a multi-tenant SaaS control center has to answer. This module adds
 * the two missing pieces:
 *
 *   1. SCOPE  — which slice of the data the caller may see:
 *                  platform → every organization
 *                  school   → the caller's own organization only
 *                  class    → the teacher's own classes only
 *   2. PERMISSION — a stable dotted capability (see src/shared/permissions.js)
 *
 * The scope is derived from the JWT role and can never be widened by a query
 * parameter. A platform operator may NARROW to one organization via
 * `?school_id=…`; a school administrator may not.
 *
 * Enforcement is server-side by construction: the frontend hiding a button is
 * a usability feature, never a security control.
 */

import { AppError, ForbiddenError, UnauthorizedError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';
import {
  SCOPES,
  ROLE_SCOPES,
  applyPermissionOverrides,
  roleHasPermission,
} from '../../shared/permissions.js';

/**
 * Attach `req.scope` describing what the caller may reach.
 * Must run after `requireAuth`.
 */
export const resolveScope = (req, res, next) => {
  const role = req.user?.role || null;
  const schoolId = req.user?.school_id || null;
  const kind = ROLE_SCOPES[role] || 'none';

  req.scope = {
    kind,
    role,
    /** The caller's own organization (their home tenant). */
    schoolId,
    /** True only for platform operators (super_admin). */
    isPlatform: kind === SCOPES.PLATFORM,
    /**
     * Set when the caller explicitly narrowed a platform request to one
     * organization. Null means "all organizations" (platform scope).
     */
    targetSchoolId: null,
  };

  next();
};

/**
 * Build a tenant-scoped WHERE clause from the request scope.
 * FAIL CLOSED: an unknown scope yields an impossible filter rather than an
 * unfiltered one.
 */
export function scopeFilter(req, where = {}) {
  const scope = req.scope;
  if (!scope) return { ...where, school_id: '__no_scope__' };
  if (scope.kind === SCOPES.PLATFORM) {
    // A platform request may be narrowed to a single organization.
    if (scope.targetSchoolId) return { ...where, school_id: scope.targetSchoolId };
    return { ...where };
  }
  if (scope.schoolId) return { ...where, school_id: scope.schoolId };
  return { ...where, school_id: '__no_scope__' };
}

/**
 * Resolve the organization a request targets.
 * - Platform scope: `requested` is honoured (must be a known organization).
 * - School scope:   `requested` must equal the caller's own organization.
 * - Anything else:   forbidden.
 * @returns {Promise<string|null>} target school id, or null for "all organizations"
 */
export async function resolveTargetSchool(req, requested = null) {
  const scope = req.scope;
  if (!scope) throw new ForbiddenError('No scope resolved');

  if (scope.kind === SCOPES.PLATFORM) {
    if (!requested) return null;
    const { prisma } = await import('../prisma.js');
    const school = await prisma.school.findUnique({
      where: { id: String(requested) },
      select: { id: true },
    });
    if (!school) throw new AppError('NOT_FOUND', 'Organization not found', 404);
    return school.id;
  }

  if (scope.kind === SCOPES.SCHOOL) {
    if (requested && String(requested) !== String(scope.schoolId)) {
      throw new ForbiddenError('You can only access your own organization');
    }
    return scope.schoolId;
  }

  throw new ForbiddenError('This operation requires an administrator scope');
}

/**
 * Load the DB permission overrides for a user.
 * Overrides are ADDITIVE grants or explicit denies on top of the role map.
 * A missing/failed lookup must never widen access — it falls back to the
 * role map, which is the enforcement default.
 */
async function loadOverrides(userId) {
  if (!userId) return [];
  try {
    const { prisma } = await import('../prisma.js');
    const rows = await prisma.userPermissionOverride.findMany({
      where: { user_id: userId },
      select: { permission: true, effect: true, school_id: true },
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    // The table may not exist yet on a database that predates the migration.
    return [];
  }
}

/**
 * Require a permission. Server-side enforcement.
 * @param {string} permission dotted permission id
 * @param {{ allow?: string[] }} [options] additional permissions that also pass
 */
export const requirePermission = (permission, options = {}) => {
  const allowed = options.allow ? [permission, ...options.allow] : [permission];

  return async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      const role = req.user.role;

      // Fast path: the role map already grants it (no DB round-trip).
      const grantedByRole = allowed.some((perm) => roleHasPermission(role, perm));
      if (!grantedByRole) {
        const overrides = await loadOverrides(req.user.id);
        const effective = new Set(applyPermissionOverrides(role, overrides));
        const grantedByOverride = allowed.some((perm) => effective.has(perm));
        if (!grantedByOverride) {
          throw new ForbiddenError(`Missing permission: ${allowed.join(' | ')}`);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require the caller to hold at least one of the listed permissions.
 * Used for endpoints that are legitimately reachable from both the platform
 * console and the school console (e.g. the overview read model).
 */
export const requireAnyPermission = (permissions = []) => {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return requirePermission(list[0], { allow: list.slice(1) });
};

/**
 * Guard that the request's scope matches one of the given scopes.
 * @param {string[]} scopes e.g. [SCOPES.PLATFORM]
 */
export const requireScope = (scopes = []) => {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  return (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      if (!req.scope || !list.includes(req.scope.kind)) {
        throw new ForbiddenError('This operation is not available in your scope');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Guard that the caller's own account is still active.
 * The access token lives up to 15 minutes, so a suspension would otherwise
 * take that long to take effect. Used on the console's sensitive routes.
 */
export const requireActiveAccount = async (req, res, next) => {
  try {
    if (!req.user?.id) throw new UnauthorizedError('Authentication required');
    const { prisma } = await import('../prisma.js');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, status: true, role: true, school_id: true },
    });
    if (!user) throw new UnauthorizedError('Account no longer exists');
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    // The token may carry a stale role/school after an administrative change.
    req.user = { ...req.user, role: user.role, school_id: user.school_id };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Convenience: is this caller a platform operator?
 */
export const isPlatformOperator = (req) => req?.scope?.role === ROLES.SUPER_ADMIN;

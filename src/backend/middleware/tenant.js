/**
 * src/backend/middleware/tenant.js
 *
 * Extracts school_id from the JWT payload (req.user) and attaches it as
 * req.schoolId for routes to use in queries. CRITICAL: every Prisma query
 * MUST use req.schoolId — never accept school_id from req.body.
 */

import { UnauthorizedError } from '../../shared/errors.js';

export const enforceTenant = (req, res, next) => {
  if (!req.user?.school_id) {
    return next(new UnauthorizedError('No tenant context in token'));
  }
  // Attach as req.schoolId (spec naming) so routes use it consistently.
  req.schoolId = req.user.school_id;
  next();
};

/**
 * Convenience helper for building tenant-scoped where clauses.
 * Services/routes should prefer explicit { school_id: req.schoolId } for clarity,
 * but this helper reduces boilerplate in simple cases.
 */
export const withTenant = (req, whereClause = {}) => {
  // Super admins may cross tenant boundaries (SaaS platform admin).
  if (req.user?.role === 'super_admin') {
    return whereClause;
  }
  return { ...whereClause, school_id: req.schoolId };
};

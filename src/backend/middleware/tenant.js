/**
 * tenant.js
 * Multi-tenancy isolation middleware.
 * Ensures the user's school_id is automatically appended to Prisma queries 
 * to prevent cross-tenant data leakage.
 */

export const enforceTenant = (req, res, next) => {
  if (req.user) {
    // We attach the tenant ID so services can safely query
    req.tenantId = req.user.school_id;
  }
  next();
};

/**
 * Helper to wrap Prisma where clauses with the tenant ID
 */
export const withTenant = (req, whereClause = {}) => {
  // Super admins might cross tenant boundaries
  if (req.user?.role === 'super_admin') {
    return whereClause;
  }
  return { ...whereClause, school_id: req.tenantId };
};

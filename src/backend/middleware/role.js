/**
 * src/backend/middleware/role.js
 *
 * Ensures the req.user has one of the allowed roles.
 * Only SUPER_ADMIN bypasses all role checks; ADMIN must match exact roles.
 * @param {string[]} allowedRoles
 */

import { AppError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Super admin bypass — can access anything
      if (req.user.role === ROLES.SUPER_ADMIN) {
        return next();
      }

      // Regular admin/student must be in the allowed roles list
      if (!allowedRoles.includes(req.user.role)) {
        throw new AppError(`Requires one of roles: ${allowedRoles.join(', ')}`, 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

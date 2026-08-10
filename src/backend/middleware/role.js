/**
 * src/backend/middleware/role.js
 *
 * Ensures the req.user has one of the allowed roles.
 * Only SUPER_ADMIN bypasses all role checks; ADMIN must match exact roles.
 * @param {string[]} allowedRoles
 */

import { AppError, ForbiddenError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        // AppError(code, message, statusCode) — NOT (message, statusCode, code).
        // Getting this order wrong used to surface as a 500 "Unhandled
        // Exception" instead of the intended auth error, and masked the real
        // cause (students writing to the admin-only /bulk/users route).
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      // Super admin bypass — can access anything
      if (req.user.role === ROLES.SUPER_ADMIN) {
        return next();
      }

      // Regular admin/student must be in the allowed roles list
      if (!allowedRoles.includes(req.user.role)) {
        throw new ForbiddenError();
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

import { AppError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

/**
 * Ensures the req.user has one of the allowed roles.
 * @param {string[]} allowedRoles 
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      
      // Admin bypass: Super admins can access anything
      if (req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.ADMIN) {
        return next();
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new AppError(`Requires one of roles: ${allowedRoles.join(', ')}`, 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

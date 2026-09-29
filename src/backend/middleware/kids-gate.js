/**
 * src/backend/middleware/kids-gate.js
 *
 * Middleware that ensures Kids Space features are only accessible to schools
 * configured with school_type === 'primaire' (or SUPER_ADMIN platform admins).
 */

import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';
import { prisma } from '../prisma.js';

export const requirePrimaireSchool = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Platform Super Admin has access across all features
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    const schoolId = req.user.school_id;
    if (!schoolId) {
      throw new ForbiddenError('No school assigned');
    }

    // Cache school check or query directly
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { school_type: true },
    });

    if (!school) {
      throw new ForbiddenError('School not found');
    }

    if (school.school_type !== 'primaire') {
      throw new ForbiddenError("L'espace Kids est réservé aux écoles primaires ('primaire').");
    }

    next();
  } catch (error) {
    next(error);
  }
};

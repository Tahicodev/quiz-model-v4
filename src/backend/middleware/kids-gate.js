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

/**
 * Read-only counterpart of requirePrimaireSchool, for the activity list and the
 * filter facets. An admin is an educator managing content and the admin panel
 * shows them Kids Space whatever their own school_type is, so gating the list on
 * 'primaire' left them with a permanently empty screen and no filters to use.
 * Reads stay scoped to the caller's own school, so this widens nothing.
 * Writing is still gated by requirePrimaireSchool.
 */
export const requireKidsReadAccess = async (req, res, next) => {
  if (req.user && (req.user.role === ROLES.ADMIN || req.user.role === ROLES.SUPER_ADMIN)) {
    return next();
  }
  return requirePrimaireSchool(req, res, next);
};

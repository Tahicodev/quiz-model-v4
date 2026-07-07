/**
 * src/backend/middleware/auth.js
 *
 * JWT verification middleware. Stores the decoded TOKEN PAYLOAD on req.user
 * (not the full database row). Routes use req.user.school_id for tenant scoping.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors.js';

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing token'));
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    // Payload shape: { id, username, role, school_id, iat, exp }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expired'));
    }
    return next(new UnauthorizedError('Invalid token'));
  }
};

/**
 * Optional: verify the user is still active in the database.
 * Use sparingly (e.g., on sensitive operations) since it adds a DB round-trip.
 */
export const requireActiveUser = (prisma) => async (req, res, next) => {
  if (!req.user?.id) return next(new UnauthorizedError());

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, status: true },
  });

  if (!user) return next(new UnauthorizedError('User no longer exists'));
  if (user.status !== 'active') return next(new ForbiddenError('Account is inactive'));

  next();
};

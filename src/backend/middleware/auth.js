import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../../shared/errors.js';
import { prisma } from '../prisma.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      
      // We look up the user to ensure they still exist and are active
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user) {
        throw new AppError('User no longer exists', 401, 'UNAUTHORIZED');
      }
      if (user.status !== 'active') {
        throw new AppError('User account is inactive', 403, 'FORBIDDEN');
      }

      req.user = user;
      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Invalid token', 401, 'UNAUTHORIZED');
    }
  } catch (error) {
    next(error);
  }
};

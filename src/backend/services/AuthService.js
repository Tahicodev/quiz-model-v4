import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { AppError } from '../../shared/errors.js';

export class AuthService {
  /**
   * Authenticates a user and issues a JWT token.
   */
  static async login(username, password) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    if (user.status !== 'active') {
      throw new AppError('Account is disabled', 403, 'FORBIDDEN');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, school_id: user.school_id },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return { token, user: this.excludePassword(user) };
  }

  static excludePassword(user) {
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

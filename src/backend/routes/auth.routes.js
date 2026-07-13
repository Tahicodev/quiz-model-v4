/**
 * src/backend/routes/auth.routes.js
 *
 * Authentication endpoints: login, refresh, logout, change-password.
 * Public routes (login, refresh) + authenticated routes (logout, change-password).
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger, securityLog } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { LoginSchema, ChangePasswordSchema } from '../../shared/schemas/user.schema.js';
import { getContainer } from '../container.js';

const router = Router();

// Stricter rate limit for auth endpoints (10 requests per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' },
});

// ── Public routes ────────────────────────────────────────────────────────────

// POST /api/v1/auth/login
router.post('/login', authLimiter, validate(LoginSchema), async (req, res, next) => {
  try {
    const { authSvc } = getContainer();
    const { username, password } = req.body;
    const { user, accessToken, refreshToken } = await authSvc.login(username, password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Set refresh token as httpOnly cookie (SaaS mode; in local mode it's optional)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    });

    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { authSvc } = getContainer();
    const rawRefreshToken = req.cookies?.refreshToken;
    const { accessToken, refreshToken } = await authSvc.refresh(rawRefreshToken);

    // Rotate refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// ── Authenticated routes ──────────────────────────────────────────────────────

// POST /api/v1/auth/logout
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { authSvc } = getContainer();
    const rawRefreshToken = req.cookies?.refreshToken;
    await authSvc.logout(rawRefreshToken);

    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/change-password
router.post('/change-password', requireAuth, validate(ChangePasswordSchema), async (req, res, next) => {
  try {
    const { authSvc } = getContainer();
    const { oldPassword, newPassword } = req.body;
    await authSvc.changePassword(req.user.id, oldPassword, newPassword);

    securityLog('password_changed', { userId: req.user.id, ip: req.ip });
    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
});

export default router;

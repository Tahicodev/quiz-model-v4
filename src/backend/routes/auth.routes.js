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

// The refresh cookie is scoped per portal (admin vs student) so two tabs of
// the same browser — an admin tab and a student workspace tab — each keep
// their own refresh token. Without this, the second login's cookie replaces
// the first's browser-wide, and the first tab's next /refresh mints an
// access token for the WRONG user (refresh tokens are looked up by hash and
// rotate on every use). Legacy clients that don't send `portal` keep the
// unscoped `refreshToken` cookie name, which refresh/logout still honor.
// NOTE: the scoped names use '_' — ':' is an illegal cookie-name character
// (the cookie serializer validates against the RFC token grammar).
const REFRESH_COOKIE_BASE = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'strict',
	maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
	path: '/api/v1/auth',
};

function normalizePortal(value) {
	return value === 'student' ? 'student' : value === 'admin' ? 'admin' : null;
}

function refreshCookieName(portal) {
	return portal ? `${REFRESH_COOKIE_BASE}_${portal}` : REFRESH_COOKIE_BASE;
}

// POST /api/v1/auth/login
router.post('/login', authLimiter, validate(LoginSchema), async (req, res, next) => {
	try {
		const { authSvc } = getContainer();
		const { username, password, portal } = req.body;
		const { user, accessToken, refreshToken } = await authSvc.login(username, password, {
			ip: req.ip,
			userAgent: req.headers['user-agent'],
		});

		// Set refresh token as httpOnly cookie (SaaS mode; in local mode it's optional)
		res.cookie(refreshCookieName(normalizePortal(portal)), refreshToken, REFRESH_COOKIE_OPTIONS);
		res.json({ user, accessToken });
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res, next) => {
	try {
		const { authSvc } = getContainer();
		// The browser sends ALL cookies regardless of which tab is asking,
		// so the cookie NAME alone cannot identify the caller — two tabs of
		// the same browser each own a differently-scoped cookie. The client
		// names its portal in the body; that decides which cookie to use.
		// Fallbacks keep older clients (any scoped cookie, then the legacy
		// unscoped one) working.
		const portal = normalizePortal(req.body?.portal);
		const scopedName = portal
			? refreshCookieName(portal)
			: ['admin', 'student']
					.map((p) => refreshCookieName(p))
					.find((name) => req.cookies?.[name]);
		const rawRefreshToken =
			(portal && req.cookies?.[refreshCookieName(portal)]) ||
			(scopedName && req.cookies[scopedName]) ||
			req.cookies?.refreshToken;
		const { accessToken, refreshToken } = await authSvc.refresh(rawRefreshToken);

		// Rotate the refresh token cookie under the SAME name it arrived as,
		// so an admin-tab refresh never touches the student tab's cookie.
		res.cookie(scopedName || REFRESH_COOKIE_BASE, refreshToken, REFRESH_COOKIE_OPTIONS);
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
		// Revoke whichever refresh cookies this browser holds. When the client
		// names its portal (two tabs of the same browser each keep their own
		// cookie), only that portal's cookie is revoked so logging out of the
		// admin tab does not kill a still-active student tab's session.
		const portal = req.body?.portal === 'student' || req.body?.portal === 'admin'
			? req.body.portal
			: null;
		const cookieNames = portal
			? [REFRESH_COOKIE_BASE, refreshCookieName(portal)]
			: [
					REFRESH_COOKIE_BASE,
					refreshCookieName('admin'),
					refreshCookieName('student'),
				];
		for (const name of cookieNames) {
			const token = req.cookies?.[name];
			if (token) await authSvc.logout(token);
		}

		for (const name of cookieNames) {
			res.clearCookie(name, { path: '/api/v1/auth' });
		}
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

/**
 * src/backend/routes/auth.routes.js
 *
 * Authentication endpoints: login, refresh, logout, change-password.
 * Public routes (login, refresh) + authenticated routes (logout, change-password).
 */

import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logger, securityLog } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { LoginSchema, ChangePasswordSchema } from '../../shared/schemas/user.schema.js';
import { ROLES } from '../../shared/constants.js';
import { requireRole } from '../middleware/role.js';
import { getContainer } from '../container.js';
import { getTeacherClassIds } from './users.routes.js';

const router = Router();

// Stricter rate limit for auth endpoints. Keyed per IP+username and counting
// only FAILED attempts: a whole classroom logging in from one NAT/proxy — or a
// student refreshing tabs — must never exhaust the budget, while brute-force
// attempts still get throttled. Disabled under test and whenever
// RATE_LIMIT_DISABLED is set (recommended for trusted LAN installs).
const authLimiter = (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true')
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      skipSuccessfulRequests: true,
      keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip)}:${String(req.body?.username ?? '').trim().toLowerCase()}`,
      standardHeaders: true,
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' },
    });

// Lenient limiter for the session-lifecycle endpoints every open tab polls
// and retries (`/refresh` on a 401, `/session` on the 60s watchdog). These
// carry no credentials an attacker could guess, so the goal is only to stop
// runaway loops — deliberately far above the login budget so a stale cookie
// can never lock a user out of signing back in.
const refreshLimiter = (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true')
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      standardHeaders: true,
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Too many session requests, try again later' },
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
		const { username, password, portal, schoolSlug, force } = req.body;
		const { user, accessToken, refreshToken } = await authSvc.login(username, password, {
			ip: req.ip,
			userAgent: req.headers['user-agent'],
			schoolSlug,
			force: force === true,
		});

		// Set refresh token as httpOnly cookie (SaaS mode; in local mode it's optional).
		// The shared entry page does not know the role before authenticating, so it
		// omits `portal`. In that case scope the cookie to the role that actually
		// signed in; otherwise the token lands in the legacy unscoped cookie while a
		// stale `<portal>`-scoped cookie from an earlier session is still preferred
		// by /refresh (and rejected as revoked), which would end the new session
		// right after the redirect.
		const resolvedPortal =
			normalizePortal(portal) || (user.role === 'student' ? 'student' : 'admin');
		res.cookie(refreshCookieName(resolvedPortal), refreshToken, REFRESH_COOKIE_OPTIONS);

		// Sign-ins are part of the school activity feed (admin sees everyone,
		// teachers see their own + their students'). Best-effort by design.
		try {
			const { auditSvc } = getContainer();
			await auditSvc.log({
				schoolId: user.school_id,
				actorId: user.id,
				entityType: 'auth',
				entityId: user.id,
				action: 'login',
				ip: req.ip,
				userAgent: req.headers['user-agent'],
			});
		} catch (_) { /* audit must never block login */ }

		res.json({ user, accessToken });
	} catch (err) {
		next(err);
	}
});

// ── Server-side recovery (cross-device) ─────────────────────────────────────
// The recovery-code hash lives in a SYSTEM-visibility settings row and is
// never returned by any settings GET. Verify mints a 15-min recovery ticket
// JWT bound to ONE school; reset consumes it to change an admin password and
// revoke all refresh tokens. Setting the code (authed admin only) bcrypts the
// raw code server-side. Legacy client-side recovery (localStorage blob)
// remains as an offline fallback in the browser only.

// POST /api/v1/auth/recover/set  { code } — admin, sets the bcrypt hash
router.post('/recover/set', requireAuth, enforceTenant, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
	try {
		const { authSvc, auditSvc } = getContainer();
		await authSvc.setRecoveryCode(req.schoolId, req.body?.code, req.user);
		await auditSvc.log({
			schoolId: req.schoolId,
			actorId: req.user.id,
			entityType: 'setting',
			entityId: 'system.recovery_code_hash',
			action: 'update',
			ip: req.ip,
		});
		res.json({ message: 'Recovery code saved' });
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/auth/recover/verify  { code, school_id? }
router.post('/recover/verify', authLimiter, async (req, res, next) => {
	try {
		const { authSvc } = getContainer();
		const code = String(req.body?.code || '');
		const schoolId = req.body?.school_id || process.env.DEFAULT_SCHOOL_ID || 'saas-default';
		const { ticket } = await authSvc.verifyRecoveryCode(schoolId, code, { ip: req.ip });
		res.json({ ticket, expiresInMinutes: 15 });
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/auth/recover/reset  { ticket, username, newPassword }
router.post('/recover/reset', authLimiter, async (req, res, next) => {
	try {
		const { authSvc } = getContainer();
		const { ticket, username, newPassword } = req.body || {};
		const result = await authSvc.resetPasswordWithTicket({
			ticket,
			username,
			newPassword,
		});
		res.json({ message: 'Password reset successfully', username: result.username });
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/auth/refresh
router.post('/refresh', refreshLimiter, async (req, res, next) => {
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
		// so an admin-tab refresh never touches the student tab's cookie. A
		// rotation-grace replay returns only an access token (no new refresh
		// token): leave the cookie untouched so we never clobber the successor
		// the winning refresh already set for this browser.
		if (refreshToken) {
			res.cookie(scopedName || REFRESH_COOKIE_BASE, refreshToken, REFRESH_COOKIE_OPTIONS);
		}
		res.json({ accessToken });
	} catch (err) {
		next(err);
	}
});

// ── Authenticated routes ──────────────────────────────────────────────────────

// GET /api/v1/auth/session — is THIS tab's session still the live one?
// 200 { active: true } while it is; 409 { code: SESSION_SUPERSEDED } once
// another tab/device took over (the client then ends this session).
router.get('/session', refreshLimiter, requireAuth, async (req, res, next) => {
	try {
		const { authSvc } = getContainer();
		// The browser sends every portal refresh cookie it holds regardless of
		// which tab is asking; hand them all to the status check so a tab is
		// judged by the live session THIS browser actually owns (the access
		// token's `sid` can lag a sibling tab's rotation without that being a
		// takeover). Cookies are httpOnly and same-site, so a different device
		// cannot present them.
		const cookieTokens = [
			req.cookies?.[refreshCookieName('admin')],
			req.cookies?.[refreshCookieName('student')],
			req.cookies?.[REFRESH_COOKIE_BASE],
		].filter(Boolean);
		const status = await authSvc.sessionStatus(req.user.id, req.user.sid || null, cookieTokens);
		if (!status.active) {
			return res.status(409).json({
				success: false,
				error: {
					code: 'SESSION_SUPERSEDED',
					message: 'Signed in on another device or tab. This session has ended.',
				},
			});
		}
		res.json({ active: true });
	} catch (err) {
		next(err);
	}
});

// GET /api/v1/auth/sessions/live — signed-in sessions visible to the caller.
// Admins get the whole school (rescue view for stuck "already signed in"
// accounts); teachers get themselves plus students of their assigned
// classes, which is what Classroom Devices needs to nest a student's session
// under their machine. Token hashes are never exposed.
// `?include=idle` widens the feed to every non-revoked, unexpired session:
// Classroom Devices needs it to keep showing a machine's signed-in users
// after a tab has been idle past the 30-minute blocking window.
router.get('/sessions/live', requireAuth, enforceTenant, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
	try {
		const { authSvc, repo } = getContainer();
		const includeIdle = String(req.query?.include || '').toLowerCase() === 'idle';
		if (req.user.role !== ROLES.TEACHER) {
			return res.json(await authSvc.listLiveSessions(req.schoolId, { includeIdle }));
		}
		// Teacher isolation: never reveal another teacher's students or the
		// school's staff accounts.
		const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
		const { data: students } = await repo.getAll('users', {
			filters: { school_id: req.schoolId, role: 'student' },
			limit: 100000,
		});
		const allowed = [String(req.user.id)];
		for (const s of students || []) {
			if (s?.id && s.class_id && classIds.includes(String(s.class_id))) {
				allowed.push(String(s.id));
			}
		}
		res.json(await authSvc.listLiveSessions(req.schoolId, { includeIdle, userIds: allowed }));
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/auth/logout
// Deliberately NOT behind requireAuth: presenting a refresh cookie IS the
// credential, and logout must succeed even when the short-lived access token
// already expired — otherwise the server session silently survives and the
// next login is wrongly rejected as "already signed in" (single-session
// enforcement). CSRF-safe: the cookies are SameSite=strict, so a cross-site
// POST arrives without them and revokes nothing.
router.post('/logout', async (req, res, next) => {
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

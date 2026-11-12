/**
 * src/backend/routes/console.routes.js
 *
 * Admin control center API — mounted at /api/v1/console.
 *
 * This router is the console's ONLY data source. It is deliberately separate
 * from /api/v1/admin (the legacy school-admin endpoints) so the console can
 * evolve without changing any existing API contract.
 *
 * Scope rules (enforced server-side, see middleware/permission.js):
 *   - super_admin → PLATFORM scope: may read every organization, and may
 *     narrow a request to one organization with ?school_id=…
 *   - admin       → SCHOOL scope: always exactly its own organization
 *   - teacher     → CLASS scope: no console access
 *   - student     → no console access
 */

import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
	resolveScope,
	requirePermission,
	requireActiveAccount,
	resolveTargetSchool,
} from '../middleware/permission.js';
import { getContainer } from '../container.js';
import { prisma } from '../prisma.js';
import { ROLES } from '../../shared/constants.js';
import { ROLE_LABELS, PERMISSION_INDEX } from '../../shared/permissions.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const router = Router();

// Every console route requires a valid token, a resolved scope and an active
// account. `requireActiveAccount` re-reads the account so a suspension takes
// effect immediately instead of at the end of the access-token lifetime.
router.use(requireAuth, resolveScope, requireActiveAccount);

// The console is for platform and organization administrators only. Teachers
// keep the teacher session; students keep the student workspace.
router.use(
	requirePermission('platform.console', {
		allow: ['school.console'],
	}),
);

// ── Session & scope ─────────────────────────────────────────────────────────
// The shell needs to know who the caller is, what scope they operate in and
// which permissions they hold before it can render anything.
router.get('/session', async (req, res, next) => {
	try {
		const { roleSvc } = getContainer();
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				name: true,
				username: true,
				role: true,
				email: true,
				school_id: true,
				status: true,
				last_login: true,
				created_at: true,
			},
		});
		if (!user) return next(new NotFoundError('Account'));

		const organization = await prisma.school.findUnique({
			where: { id: user.school_id },
			select: {
				id: true,
				name: true,
				slug: true,
				status: true,
				plan: true,
				school_type: true,
				school_year: true,
				max_students: true,
			},
		});

		const permissions = await roleSvc.effectivePermissions(
			user.id,
			user.role,
			req.scope.schoolId,
		);

		res.json({
			user: {
				id: user.id,
				name: user.name,
				username: user.username,
				role: user.role,
				roleLabel: ROLE_LABELS[user.role] || user.role,
				email: user.email,
				status: user.status,
				lastLogin: user.last_login,
				createdAt: user.created_at,
			},
			scope: {
				kind: req.scope.kind,
				isPlatform: req.scope.isPlatform,
				schoolId: req.scope.schoolId,
				organization,
			},
			permissions,
		});
	} catch (err) {
		next(err);
	}
});

// ── Roles & permissions ─────────────────────────────────────────────────────
// The real permission catalog, so the Roles & Permissions page shows what the
// platform actually enforces instead of a hardcoded list.
router.get('/roles', async (req, res, next) => {
	try {
		const { roleSvc } = getContainer();
		const roles = await roleSvc.listRoles();
		const catalog = roleSvc.listPermissionCatalog();
		res.json({
			roles: roles.map((role) => ({
				...role,
				permissions: role.permissions.map((id) => ({
					id,
					label: PERMISSION_INDEX[id]?.label || id,
					scope: PERMISSION_INDEX[id]?.scope || null,
				})),
			})),
			catalog,
		});
	} catch (err) {
		next(err);
	}
});

// ── The caller's own effective permissions ──────────────────────────────────
router.get('/permissions', async (req, res, next) => {
	try {
		const { roleSvc } = getContainer();
		const permissions = await roleSvc.effectivePermissions(
			req.user.id,
			req.user.role,
			req.scope.schoolId,
		);
		res.json({ permissions });
	} catch (err) {
		next(err);
	}
});

// ── The caller's own permission overrides ───────────────────────────────────
router.get('/permissions/overrides', async (req, res, next) => {
	try {
		const { roleSvc } = getContainer();
		res.json({ overrides: await roleSvc.listOverrides(req.user.id) });
	} catch (err) {
		next(err);
	}
});

// ── Read models ────────────────────────────────────────────────────────────

/**
 * The platform (or organization) control-center read model.
 *
 * Query:
 *   period     7d | 30d | 90d | year | custom
 *   from,to    ISO dates (only with period=custom)
 *   school_id  narrow a platform request to one organization
 */
router.get('/overview', async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const data = await platformAnalyticsSvc.getOverview({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
			period: req.query.period || '30d',
			academicYear: req.query.academicYear || null,
			customFrom: req.query.from || null,
			customTo: req.query.to || null,
		});
		res.json({ data });
	} catch (err) {
		next(err);
	}
});

/** Time series for the overview charts. */
router.get('/trends', async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const data = await platformAnalyticsSvc.getTrends({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
			period: req.query.period || '30d',
			academicYear: req.query.academicYear || null,
			customFrom: req.query.from || null,
			customTo: req.query.to || null,
		});
		res.json({ data });
	} catch (err) {
		next(err);
	}
});

/** The organizational overview table. */
router.get('/organizations', async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const data = await platformAnalyticsSvc.listOrganizations({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
			search: req.query.search || null,
			status: req.query.status || null,
			limit: req.query.limit,
			offset: req.query.offset,
		});
		res.json(data);
	} catch (err) {
		next(err);
	}
});

/** The users table for Users & Access. */
router.get('/users', async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const data = await platformAnalyticsSvc.listUsers({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
			role: req.query.role || null,
			status: req.query.status || null,
			search: req.query.search || null,
			limit: req.query.limit,
			offset: req.query.offset,
		});
		res.json(data);
	} catch (err) {
		next(err);
	}
});

// ── Activity & audit ───────────────────────────────────────────────────────

/**
 * The administrative-action trail.
 * Query: stream=actions|security, plus the filters below.
 */
router.get('/audit', async (req, res, next) => {
	try {
		const { auditQuerySvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const scopeList = schoolIds ? [schoolIds] : null;
		const range = buildRange(req.query.from, req.query.to);

		if (req.query.stream === 'security') {
			const data = await auditQuerySvc.listSecurityEvents({
				schoolIds: scopeList,
				eventTypes: req.query.eventType ? String(req.query.eventType).split(',') : null,
				severity: req.query.severity || null,
				outcome: req.query.outcome || null,
				search: req.query.search || null,
				from: range.from,
				to: range.to,
				limit: req.query.limit,
				offset: req.query.offset,
			});
			return res.json(data);
		}

		const data = await auditQuerySvc.listActions({
			schoolIds: scopeList,
			actorId: req.query.actorId || null,
			entityType: req.query.entityType || null,
			action: req.query.action || null,
			outcome: req.query.outcome || null,
			severity: req.query.severity || null,
			search: req.query.search || null,
			from: range.from,
			to: range.to,
			limit: req.query.limit,
			offset: req.query.offset,
		});
		return res.json(data);
	} catch (err) {
		return next(err);
	}
});

/** Summary counts and filter facets for the audit page. */
router.get('/audit/summary', async (req, res, next) => {
	try {
		const { auditQuerySvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const scopeList = schoolIds ? [schoolIds] : null;
		const range = buildRange(req.query.from, req.query.to);
		const [summary, facets] = await Promise.all([
			auditQuerySvc.summarize({ schoolIds: scopeList, from: range.from, to: range.to }),
			auditQuerySvc.facets({ schoolIds: scopeList }),
		]);
		res.json({ summary, facets });
	} catch (err) {
		next(err);
	}
});

// ── System health ──────────────────────────────────────────────────────────

router.get('/health', async (req, res, next) => {
	try {
		const { systemHealthSvc } = getContainer();
		const data = await systemHealthSvc.getSnapshot({ minutes: req.query.minutes });
		res.json({ data });
	} catch (err) {
		next(err);
	}
});

/**
 * Parse an optional ISO date range.
 */
function buildRange(from, to) {
	const parse = (value) => {
		if (!value) return null;
		const date = new Date(value);
		return Number.isFinite(date.getTime()) ? date : null;
	};
	return { from: parse(from), to: parse(to) };
}

// ── Detail views ───────────────────────────────────────────────────────────

/** One organization's administrative detail. */
router.get('/organizations/:id', requirePermission('platform.organizations.read', { allow: ['school.profile.read'] }), async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const data = await platformAnalyticsSvc.getOrganizationDetail({
			schoolId: req.params.id,
			scope: req.scope,
		});
		if (!data) return next(new NotFoundError('Organization'));
		return res.json({ data });
	} catch (err) {
		return next(err);
	}
});

/** One account's administrative detail. */
router.get('/users/:id', requirePermission('platform.users.read', { allow: ['school.users.read'] }), async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const data = await platformAnalyticsSvc.getUserDetail({
			userId: req.params.id,
			scope: req.scope,
		});
		if (!data) return next(new NotFoundError('Account'));
		return res.json({ data });
	} catch (err) {
		return next(err);
	}
});

// ── Administrative actions ─────────────────────────────────────────────────

/**
 * Change an organization's lifecycle status, or edit its profile.
 * Body: { status?, reason?, profile?: { name?, school_type?, … } }
 */
router.patch('/organizations/:id', requirePermission('platform.organizations.status', { allow: ['school.profile.manage'] }), async (req, res, next) => {
	try {
		const { adminActionSvc } = getContainer();
		const schoolId = req.params.id;
		const { status, reason, profile } = req.body || {};

		let result = null;
		if (status) {
			result = await adminActionSvc.setOrganizationStatus({
				schoolId,
				status,
				reason: reason || null,
				actor: req.user,
				scope: req.scope,
				ip: req.ip,
				userAgent: req.headers['user-agent'],
			});
		}
		if (profile && typeof profile === 'object') {
			result = await adminActionSvc.updateOrganizationProfile({
				schoolId,
				patch: profile,
				actor: req.user,
				scope: req.scope,
				ip: req.ip,
				userAgent: req.headers['user-agent'],
			});
		}
		if (!result) {
			throw new ValidationError({ body: ['Provide a status or a profile to update'] });
		}
		return res.json({ data: result });
	} catch (err) {
		return next(err);
	}
});

/**
 * Change an account's status or role.
 * Body: { status?, role?, reason? }
 */
router.patch('/users/:id', requirePermission('platform.users.manage', { allow: ['school.users.manage'] }), async (req, res, next) => {
	try {
		const { adminActionSvc } = getContainer();
		const userId = req.params.id;
		const { status, role, reason } = req.body || {};

		let result = null;
		if (status) {
			result = await adminActionSvc.setUserStatus({
				userId,
				status,
				reason: reason || null,
				actor: req.user,
				scope: req.scope,
				ip: req.ip,
				userAgent: req.headers['user-agent'],
			});
		}
		if (role) {
			result = await adminActionSvc.setUserRole({
				userId,
				role,
				actor: req.user,
				scope: req.scope,
				ip: req.ip,
				userAgent: req.headers['user-agent'],
			});
		}
		if (!result) {
			throw new ValidationError({ body: ['Provide a status or a role to change'] });
		}
		return res.json({ data: result });
	} catch (err) {
		return next(err);
	}
});

/** Grant or deny a single permission for an account. */
router.post('/users/:id/permissions', requirePermission('platform.users.manage', { allow: ['school.roles.manage'] }), async (req, res, next) => {
	try {
		const { adminActionSvc } = getContainer();
		const { permission, effect, school_id: schoolId, reason } = req.body || {};
		const row = await adminActionSvc.setPermissionOverride({
			userId: req.params.id,
			permission,
			effect: effect || 'grant',
			schoolId: schoolId || null,
			reason: reason || null,
			actor: req.user,
			scope: req.scope,
			ip: req.ip,
			userAgent: req.headers['user-agent'],
		});
		return res.json({ data: row });
	} catch (err) {
		return next(err);
	}
});

/** Remove a permission override, restoring the role's baseline. */
router.delete('/users/:id/permissions/:permission', requirePermission('platform.users.manage', { allow: ['school.roles.manage'] }), async (req, res, next) => {
	try {
		const { adminActionSvc } = getContainer();
		const result = await adminActionSvc.clearPermissionOverride({
			userId: req.params.id,
			permission: req.params.permission,
			schoolId: req.query.school_id || null,
			actor: req.user,
			scope: req.scope,
			ip: req.ip,
			userAgent: req.headers['user-agent'],
		});
		return res.json({ data: result });
	} catch (err) {
		return next(err);
	}
});

/** Revoke every session of an account. */
router.delete('/users/:id/sessions', requirePermission('platform.users.manage', { allow: ['school.users.manage'] }), async (req, res, next) => {
	try {
		const { authSvc, securityEventSvc } = getContainer();
		const target = await prisma.user.findUnique({
			where: { id: req.params.id },
			select: { id: true, school_id: true, username: true },
		});
		if (!target) return next(new NotFoundError('Account'));
		if (req.scope.kind === 'school' && String(req.scope.schoolId) !== String(target.school_id)) {
			return next(new ForbiddenError('You can only act inside your own organization'));
		}
		const { revoked } = await authSvc.revokeUserSessions(target.id);
		await securityEventSvc.record({
			type: 'session_revoked',
			userId: target.id,
			schoolId: target.school_id,
			username: target.username,
			reason: 'revoked_by_administrator',
			ip: req.ip,
			userAgent: req.headers['user-agent'],
			meta: { revoked, actorId: req.user.id },
		});
		return res.json({ data: { revoked } });
	} catch (err) {
		return next(err);
	}
});

export default router;

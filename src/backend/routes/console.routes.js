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
	requireAnyPermission,
	requireActiveAccount,
	resolveTargetSchool,
} from '../middleware/permission.js';
import { getContainer } from '../container.js';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { ROLES } from '../../shared/constants.js';
import { ROLE_LABELS, PERMISSION_INDEX } from '../../shared/permissions.js';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../../shared/errors.js';

const router = Router();

// Every console route requires a valid token and a resolved scope.
router.use(requireAuth, resolveScope);

// The console is for platform and organization administrators only. Teachers
// keep the teacher session; students keep the student workspace.
router.use(
	requirePermission('platform.console', {
		allow: ['school.console'],
	}),
);

/**
 * Organization management stays reachable while the caller's OWN organization
 * is suspended.
 *
 * Suspending an organization blocks every sign-in from it — which is the
 * point. But an organization administrator must still be able to REACTIVATE
 * it: on a single-organization (offline) installation there is no other
 * operator, so locking them out of the only way back would brick the whole
 * installation.
 *
 * The routes below are therefore guarded with `allowSuspendedOrganization`.
 * They remain protected by the permission check and by the service-level
 * scope check, so an administrator still only reaches their own organization.
 */
const organizationAdmin = Router();
organizationAdmin.use(requireActiveAccount({ allowSuspendedOrganization: true }));

organizationAdmin.get(
	'/organizations/:id',
	requirePermission('platform.organizations.read', { allow: ['school.profile.read'] }),
	async (req, res, next) => {
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
	},
);

/**
 * Create an organization.
 *
 * Onboarding a school is a platform-level act, so it is reserved for the
 * platform scope: an organization administrator manages THEIR organization,
 * they do not create new ones.
 *
 * The new organization starts as `pending` — provisioned, but not yet able to
 * sign in. Activating it is a separate, explicit act (the PATCH below), so
 * a half-finished onboarding never becomes a working tenant.
 */
organizationAdmin.post(
	'/organizations',
	requirePermission('platform.organizations.manage'),
	async (req, res, next) => {
		try {
			const { repo, auditSvc } = getContainer();
			const body = req.body || {};
			const name = String(body.name || '').trim();
			if (!name) {
				throw new ValidationError({ name: ['Required'] });
			}
			const slugSource = String(body.slug || name)
				.trim()
				.toLowerCase();
			const slug = slugSource
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '');
			if (!slug) {
				throw new ValidationError({ slug: ['Could not derive a slug from the name'] });
			}

			const existing = await prisma.school.findUnique({
				where: { slug },
				select: { id: true },
			});
			if (existing) {
				throw new ConflictError(`The slug "${slug}" is already taken`);
			}

			const created = await prisma.school.create({
				data: {
					name,
					slug,
					plan: String(body.plan || 'free'),
					max_students: Number(body.max_students) || 100,
					school_type: String(body.school_type || 'primaire'),
					school_year: body.school_year ? String(body.school_year) : null,
					address: body.address ? String(body.address) : null,
					city: body.city ? String(body.city) : null,
					phone: body.phone ? String(body.phone) : null,
					email: body.email ? String(body.email) : null,
					status: 'pending',
				},
				select: { id: true, name: true, slug: true, status: true },
			});

			await auditSvc.log({
				schoolId: created.id,
				actorId: req.user.id,
				entityType: 'school',
				entityId: created.id,
				action: 'create',
				ip: req.ip,
			});

			return res.status(201).json({ data: created });
		} catch (err) {
			return next(err);
		}
	},
);

/**
 * Delete an organization and everything in it.
 *
 * The most destructive operation in the console, and the one most likely to
 * be a mistake, so it is:
 *
 *   • reserved for the platform scope
 *   • guarded by an explicit confirmation token in the body
 *   • refused for the organization the caller is signed into
 *   • audited
 *
 * Suspending is the reversible alternative and is one click away.
 */
organizationAdmin.delete(
	'/organizations/:id',
	requirePermission('platform.organizations.manage'),
	async (req, res, next) => {
		try {
			const { repo, auditSvc } = getContainer();
			const schoolId = String(req.params.id);
			const confirm = String(req.body?.confirm || '');
			if (confirm !== 'DELETE') {
				throw new ValidationError({
					confirm: ['Type DELETE to confirm removing the organization'],
				});
			}
			if (String(schoolId) === String(req.user.school_id)) {
				throw new ConflictError('You cannot delete the organization you are signed into');
			}

			const school = await prisma.school.findUnique({
				where: { id: schoolId },
				select: { id: true, name: true },
			});
			if (!school) return next(new NotFoundError('Organization'));

			// The junction tables carry no school_id — they are scoped
			// through their parent exam. Deleting them BLANKET would strip
			// every other organization's exam links, so they are scoped to
			// THIS organization's exams, and they are deleted BEFORE the
			// school cascade (which would remove them too, through the
			// exam → school cascade, but then their counts could not be
			// reported honestly).
			const examModel = repo.modelFor ? repo.modelFor('exams') : null;
			const examIds = examModel
				? (
						await examModel.findMany({
							where: { school_id: schoolId },
							select: { id: true },
						})
					).map((row) => row.id)
				: [];
			const examScope = examIds.length ? { exam_id: { in: examIds } } : { exam_id: '__none__' };
			const removed = {};
			for (const [table, where] of [
				['exam_questions', examScope],
				['exam_classes', examScope],
			]) {
				const model = repo.modelFor ? repo.modelFor(table) : null;
				if (!model || typeof model.deleteMany !== 'function') continue;
				const result = await model.deleteMany({ where });
				removed[table] = result?.count ?? 0;
			}

			// The school row cascades to every row that references it.
			await prisma.school.delete({ where: { id: schoolId } });

			await auditSvc.log({
				schoolId: null,
				actorId: req.user.id,
				entityType: 'school',
				entityId: schoolId,
				action: 'delete',
				ip: req.ip,
				severity: 'critical',
			});

			return res.json({ data: { deleted: true, name: school.name, removed } });
		} catch (err) {
			return next(err);
		}
	},
);

organizationAdmin.patch(
	'/organizations/:id',
	requirePermission('platform.organizations.status', { allow: ['school.profile.manage'] }),
	async (req, res, next) => {
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
	},
);

router.use(organizationAdmin);

// Everything else requires a fully active account AND an active organization.
router.use(requireActiveAccount());

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
			/**
			 * The deployment topology. It is NOT a permission: an offline
			 * installation can still have a super administrator for its own
			 * box, and a SaaS deployment still has organization
			 * administrators scoped to their own tenant.
			 */
			deployment: {
				mode: config.deploymentMode,
				isOffline: config.isOffline,
				isSaaS: config.isSaaS,
				label:
					config.isOffline
						? 'Local installation'
						: 'Multi-tenant platform',
				description: config.isOffline
					? 'This server is the whole platform. Administration is limited to the organizations hosted here, and no feature requires internet access.'
					: 'This server is one node of a multi-tenant platform. Platform administrators reach every organization; organization administrators reach only their own.',
				dbProvider: config.dbProvider,
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
		// `role` may name several roles: "admin,super_admin" asks for both the
		// organization administrators and the platform ones.
		const roles = String(req.query.role || '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const data = await platformAnalyticsSvc.listUsers({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
			role: roles.length === 1 ? roles[0] : null,
			roles: roles.length > 1 ? roles : null,
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
 * Create an account.
 *
 * The console is where an administrator provisions people, so the "add user"
 * action has to live here — it is the counterpart of the legacy administration
 * panel's user modal.
 *
 * The account is created inside the CALLER's organization. A platform
 * administrator who wants an account in another organization has to be
 * scoped to it explicitly; without that, an account could be created in the
 * wrong tenant by a mistake.
 *
 * The password is hashed with bcrypt and never returned. The action is
 * recorded in the audit trail.
 */
router.post('/users', requirePermission('platform.users.manage', { allow: ['school.users.manage'] }), async (req, res, next) => {
	try {
		const { userSvc, auditSvc } = getContainer();
		const body = req.body || {};

		// The target organization. For an organization administrator this is
		// always their own organization; a platform administrator may name
		// another one, and otherwise the account lands in their own.
		let schoolId = req.user.school_id;
		if (req.scope.kind === 'platform') {
			const target = await resolveTargetSchool(req, body.school_id);
			// `resolveTargetSchool` returns null for a platform scope with no
			// named organization — meaning "no specific target", not "none".
			// The account then belongs to the administrator's own
			// organization.
			schoolId = target || req.user.school_id;
		}
		if (!schoolId) {
			throw new ValidationError({
				school_id: ['No organization in scope'],
			});
		}

		const created = await userSvc.create(
			{ ...body, school_id: schoolId },
			{ ...req.user, school_id: schoolId },
		);

		await auditSvc.log({
			schoolId,
			actorId: req.user.id,
			entityType: 'user',
			entityId: created.id,
			action: 'create',
			ip: req.ip,
		});

		return res.status(201).json({ data: created });
	} catch (err) {
		return next(err);
	}
});

/**
 * Delete an account.
 *
 * Deleting is irreversible, so it is deliberately NOT bundled with the
 * "suspend" action: suspending ends the access and keeps the record,
 * deleting removes the person and everything they own. The console offers
 * both, and the confirmation says exactly what happens.
 *
 * An administrator cannot delete their own account — that is how a session
 * locks itself out.
 */
router.delete('/users/:id', requirePermission('platform.users.manage', { allow: ['school.users.manage'] }), async (req, res, next) => {
	try {
		const { userSvc, auditSvc } = getContainer();
		const userId = req.params.id;

		if (String(userId) === String(req.user.id)) {
			return next(new ConflictError('You cannot delete your own account.'));
		}

		const target = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, school_id: true, username: true, name: true },
		});
		if (!target) return next(new NotFoundError('Account'));
		if (req.scope.kind === 'school' && String(req.scope.schoolId) !== String(target.school_id)) {
			return next(new ForbiddenError('That account is not in your organization'));
		}

		await userSvc.delete(userId, req.user);

		await auditSvc.log({
			schoolId: target.school_id,
			actorId: req.user.id,
			entityType: 'user',
			entityId: userId,
			action: 'delete',
			ip: req.ip,
		});

		return res.json({ data: { deleted: true, username: target.username } });
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

/**
 * Reset an account's credential.
 *
 * The credential is written with bcrypt, the target's live sessions are
 * revoked, and the action is recorded in BOTH the audit trail and the
 * security trail. An administrator cannot reset their own credential here —
 * they use "change password", which requires the current one.
 */
router.post('/users/:id/credential', requirePermission('platform.users.manage', { allow: ['school.users.manage'] }), async (req, res, next) => {
	try {
		/* `prisma` is deliberately NOT taken from the container — the container
	   does not expose it, and a destructured `undefined` would shadow the
	   module import and make every lookup here throw (the 500 on reset). */
	const { userSvc, authSvc, auditSvc, securityEventSvc } = getContainer();
		const { newPassword } = req.body || {};

		const target = await prisma.user.findUnique({
			where: { id: req.params.id },
			select: { id: true, school_id: true, username: true, role: true },
		});
		if (!target) return next(new NotFoundError('Account'));
		if (req.scope.kind === 'school' && String(req.scope.schoolId) !== String(target.school_id)) {
			return next(new ForbiddenError('That account is not in your organization'));
		}
		if (String(target.id) === String(req.user.id)) {
			return next(
				new ConflictError('Use "change password" to update your own credential'),
			);
		}

		const result = await userSvc.resetPassword(req.params.id, newPassword, req.user, {
			schoolId: req.scope.kind === 'school' ? req.scope.schoolId : target.school_id,
			authSvc,
			auditSvc,
			securityEventSvc,
		});
		return res.json({ data: { revokedSessions: result?.revokedSessions || 0 } });
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

/**
 * The administrator's workbench — the read model behind the new Overview.
 * It answers the questions an administrator actually asks, in the order the
 * day presents them.
 */
router.get('/workbench', requireAnyPermission(['platform.console', 'school.console']), async (req, res, next) => {
	try {
		const { platformAnalyticsSvc } = getContainer();
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const data = await platformAnalyticsSvc.getWorkbench({
			scope: req.scope,
			schoolIds: schoolIds ? [schoolIds] : null,
		});
		res.json({ data });
	} catch (err) {
		next(err);
	}
});

/**
 * Export the organization's data as a JSON snapshot.
 *
 * The legacy administration panel exported the BROWSER CACHE — the
 * localStorage stores of the machine that happened to be open. That is a
 * different thing from the organization's data, and on a LAN installation
 * with several computers it silently captured whichever device the
 * administrator was sitting at.
 *
 * This export is taken from the DATABASE, scoped to the caller's
 * organization. It is the same snapshot the ZIP bundle packages.
 *
 * The credentials are deliberately NOT included: `password_hash` is
 * stripped from every exported account, so a backup file is not a
 * credential store. The restored accounts keep their existing passwords;
 * accounts that do not exist yet are created without one and must be given
 * a password by an administrator.
 */
const EXPORT_TABLES = Object.freeze([
	'users',
	'classes',
	'categories',
	'questions',
	'exams',
	'results',
	'games',
	'tournaments',
	'notifications',
	'gamification',
	'settings',
]);

/** Strip the fields a backup must never carry. */
function stripExportSecrets(table, row) {
	if (!row || typeof row !== 'object') return row;
	const copy = { ...row };
	if (table === 'users') {
		delete copy.password_hash;
		delete copy.passwordHash;
		delete copy.password;
	}
	return copy;
}

router.get('/export', requireAnyPermission(['school.settings.manage', 'platform.settings.manage']), async (req, res, next) => {
	try {
		const { repo } = getContainer();
		// The export is always ONE organization: the caller's own, unless a
		// platform administrator names another one explicitly.
		const schoolIds = await resolveTargetSchool(req, req.query.school_id);
		const schoolId = schoolIds || req.user.school_id;
		if (!schoolId) {
			return next(new ValidationError({ school_id: ['No organization in scope'] }));
		}

		const data = {};
		for (const table of EXPORT_TABLES) {
			const model = repo.modelFor ? repo.modelFor(table) : null;
			if (!model || typeof model.findMany !== 'function') {
				data[table] = [];
				continue;
			}
			const rows = await model.findMany({
				where: { school_id: schoolId },
				take: 100000,
			});
			data[table] = rows.map((row) => stripExportSecrets(table, row));
		}

		return res.json({
			data: {
				version: '2.0',
				timestamp: new Date().toISOString(),
				type: 'quiz-app-backup',
				school_id: schoolId,
				data,
			},
		});
	} catch (err) {
		return next(err);
	}
});

/**
 * Send a note to a teacher.
 *
 * A note is a `TeacherMessage`: the existing mechanism the platform already
 * uses to reach a class, reused here so the administrator does not need a
 * second messaging system.
 */
router.post('/notes', requireAnyPermission(['school.users.manage', 'platform.users.manage']), async (req, res, next) => {
	try {
		const { teacherMessageSvc } = getContainer();
		const { teacherId, title, body, classId } = req.body || {};
		if (!title || !body) {
			throw new ValidationError({
				title: ['Required'],
				body: ['Required'],
			});
		}
		const teacher = await prisma.user.findUnique({
			where: { id: teacherId },
			select: { id: true, school_id: true, role: true, name: true },
		});
		if (!teacher) return next(new NotFoundError('Teacher'));
		if (req.scope.kind === 'school' && String(req.scope.schoolId) !== String(teacher.school_id)) {
			return next(new ForbiddenError('That teacher is not in your organization'));
		}
		const message = await teacherMessageSvc.create(req.user, {
			teacher_id: teacher.id,
			teacher_name: teacher.name,
			title: String(title),
			body: String(body),
			...(classId ? { class_id: classId } : {}),
		});
		return res.status(201).json({ data: message });
	} catch (err) {
		return next(err);
	}
});

export default router;

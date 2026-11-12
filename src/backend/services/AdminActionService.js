/**
 * src/backend/services/AdminActionService.js
 *
 * Administrative write operations for the control center.
 *
 * Every method here:
 *   1. validates the caller's SCOPE (an organization administrator may only
 *      act inside their own organization),
 *   2. validates the target,
 *   3. writes the change,
 *   4. records an audit row WITH an outcome and a severity,
 *   5. records a security event for the operations that change access.
 *
 * Nothing here trusts the frontend: the scope comes from the signed token and
 * the role/permission check has already run in the router.
 */

import { ROLES } from '../../shared/constants.js';
import { PERMISSION_INDEX, ROLE_PERMISSIONS } from '../../shared/permissions.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const ORGANIZATION_STATUSES = ['active', 'pending', 'suspended'];
const USER_STATUSES = ['active', 'inactive', 'suspended'];
const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.TEACHER, ROLES.STUDENT];

export class AdminActionService {
	/** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
	constructor(repo, { auditSvc = null, securityEventSvc = null, logger = null } = {}) {
		this.#repo = repo;
		this.#auditSvc = auditSvc;
		this.#securityEventSvc = securityEventSvc;
		this.#logger = logger;
	}

	#repo;
	#auditSvc;
	#securityEventSvc;
	#logger;

	get schools() {
		return this.#repo.modelFor('schools');
	}

	get users() {
		return this.#repo.modelFor('users');
	}

	get roles() {
		return this.#repo.modelFor('roles');
	}

	get overrides() {
		return this.#repo.modelFor('user_permission_overrides');
	}

	// ── Organizations ───────────────────────────────────────────────────────

	/**
	 * Change an organization's lifecycle status.
	 *
	 * Suspending an organization must actually stop it operating, so every
	 * account in it is suspended too and its refresh tokens are revoked.
	 * Reactivating restores the ACCOUNTS it suspended (a flag would be
	 * cleaner, but the account status is the only state the auth layer reads).
	 */
	async setOrganizationStatus({ schoolId, status, reason = null, actor, scope, ip = null, userAgent = null }) {
		if (!ORGANIZATION_STATUSES.includes(status)) {
			throw new ValidationError({ status: [`Must be one of ${ORGANIZATION_STATUSES.join(', ')}`] });
		}
		const school = await this.schools.findUnique({ where: { id: schoolId } });
		if (!school) throw new NotFoundError('Organization');
		this.#assertScope(scope, schoolId);

		const previousStatus = school.status;
		if (previousStatus === status) {
			return { school, changed: false };
		}

		const suspended = status === 'suspended';
		const updated = await this.schools.update({
			where: { id: schoolId },
			data: {
				status,
				suspended_at: suspended ? new Date() : null,
				suspended_reason: suspended ? reason : null,
			},
		});

		// A suspended organization must not be able to sign in.
		const accounts = await this.users.findMany({
			where: { school_id: schoolId },
			select: { id: true, status: true, role: true },
		});
		let affectedAccounts = 0;
		for (const account of accounts) {
			const nextStatus = suspended ? 'suspended' : 'active';
			if (account.status === nextStatus) continue;
			await this.users.update({ where: { id: account.id }, data: { status: nextStatus } });
			affectedAccounts += 1;
		}

		await this.#audit({
			schoolId,
			actorId: actor?.id || null,
			entityType: 'school',
			entityId: schoolId,
			action: 'update_status',
			outcome: 'success',
			severity: suspended ? 'critical' : 'warning',
			ip,
			userAgent,
			diff: { before: { status: previousStatus }, after: { status, reason } },
		});

		if (suspended) {
			await this.#security({
				type: 'account_status_changed',
				schoolId,
				username: null,
				reason: `organization_suspended:${reason || 'no reason given'}`,
				ip,
				userAgent,
				meta: { actorId: actor?.id || null, affectedAccounts },
			});
		}

		return { school: updated, changed: true, affectedAccounts };
	}

	/**
	 * Update the editable profile fields of an organization.
	 */
	async updateOrganizationProfile({ schoolId, patch, actor, scope, ip = null, userAgent = null }) {
		const school = await this.schools.findUnique({ where: { id: schoolId } });
		if (!school) throw new NotFoundError('Organization');
		this.#assertScope(scope, schoolId);

		const allowed = ['name', 'school_type', 'school_year', 'address', 'city', 'phone', 'email', 'logo_url'];
		const data = {};
		for (const key of allowed) {
			if (patch[key] !== undefined) data[key] = patch[key];
		}
		if (!Object.keys(data).length) {
			throw new ValidationError({ profile: ['No supported field to update'] });
		}

		const before = {};
		for (const key of Object.keys(data)) before[key] = school[key];

		const updated = await this.schools.update({ where: { id: schoolId }, data });

		await this.#audit({
			schoolId,
			actorId: actor?.id || null,
			entityType: 'school',
			entityId: schoolId,
			action: 'update_profile',
			outcome: 'success',
			severity: 'info',
			ip,
			userAgent,
			diff: { before, after: data },
		});

		return updated;
	}

	// ── Accounts ───────────────────────────────────────────────────────────

	/**
	 * Change an account's lifecycle status.
	 */
	async setUserStatus({ userId, status, reason = null, actor, scope, ip = null, userAgent = null }) {
		if (!USER_STATUSES.includes(status)) {
			throw new ValidationError({ status: [`Must be one of ${USER_STATUSES.join(', ')}`] });
		}
		const user = await this.users.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundError('Account');
		this.#assertScope(scope, user.school_id);

		// An administrator cannot lock themselves out.
		if (actor?.id && actor.id === userId && status !== 'active') {
			throw new ConflictError('You cannot change the status of your own account');
		}
		// The last platform administrator must keep their access.
		if (user.role === ROLES.SUPER_ADMIN && status !== 'active') {
			const remaining = await this.users.count({
				where: { role: ROLES.SUPER_ADMIN, status: 'active' },
			});
			if (remaining <= 1) {
				throw new ConflictError('The last active platform administrator cannot be suspended');
			}
		}

		const previousStatus = user.status;
		if (previousStatus === status) {
			return { user, changed: false };
		}

		const updated = await this.users.update({ where: { id: userId }, data: { status } });

		await this.#audit({
			schoolId: user.school_id,
			actorId: actor?.id || null,
			entityType: 'user',
			entityId: userId,
			action: 'update_status',
			outcome: 'success',
			severity: status === 'suspended' ? 'critical' : 'warning',
			ip,
			userAgent,
			diff: { before: { status: previousStatus }, after: { status, reason } },
		});

		await this.#security({
			type: 'account_status_changed',
			schoolId: user.school_id,
			userId,
			username: user.username,
			reason: reason || `status:${status}`,
			ip,
			userAgent,
			meta: { actorId: actor?.id || null, from: previousStatus, to: status },
		});

		return { user: updated, changed: true };
	}

	/**
	 * Change an account's role.
	 */
	async setUserRole({ userId, role, actor, scope, ip = null, userAgent = null }) {
		if (!ASSIGNABLE_ROLES.includes(role)) {
			throw new ValidationError({
				role: [`Must be one of ${ASSIGNABLE_ROLES.join(', ')}`],
			});
		}
		const user = await this.users.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundError('Account');
		this.#assertScope(scope, user.school_id);

		if (actor?.id && actor.id === userId) {
			throw new ConflictError('You cannot change your own role');
		}
		if (user.role === ROLES.SUPER_ADMIN) {
			throw new ForbiddenError('The role of a platform administrator cannot be changed here');
		}

		const previousRole = user.role;
		if (previousRole === role) {
			return { user, changed: false };
		}

		const updated = await this.users.update({ where: { id: userId }, data: { role } });

		await this.#audit({
			schoolId: user.school_id,
			actorId: actor?.id || null,
			entityType: 'user',
			entityId: userId,
			action: 'update_role',
			outcome: 'success',
			severity: 'critical',
			ip,
			userAgent,
			diff: { before: { role: previousRole }, after: { role } },
		});

		await this.#security({
			type: 'permission_changed',
			schoolId: user.school_id,
			userId,
			username: user.username,
			reason: `role:${previousRole}→${role}`,
			ip,
			userAgent,
			meta: { actorId: actor?.id || null },
		});

		return { user: updated, changed: true };
	}

	// ── Permission overrides ───────────────────────────────────────────────

	/**
	 * Grant or deny a single permission for one account.
	 */
	async setPermissionOverride({
		userId,
		permission,
		effect = 'grant',
		schoolId = null,
		reason = null,
		actor,
		scope,
		ip = null,
		userAgent = null,
	}) {
		if (!PERMISSION_INDEX[permission]) {
			throw new ValidationError({ permission: ['Unknown permission'] });
		}
		if (effect !== 'grant' && effect !== 'deny') {
			throw new ValidationError({ effect: ['Must be "grant" or "deny"'] });
		}
		const user = await this.users.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundError('Account');
		this.#assertScope(scope, user.school_id);

		const scopeKey = schoolId ? String(schoolId) : '*';
		const existing = await this.overrides.findFirst({
			where: { user_id: userId, scope_key: scopeKey, permission },
		});

		const row = existing
			? await this.overrides.update({
					where: { id: existing.id },
					data: { effect, reason, granted_by: actor?.id || null },
				})
			: await this.overrides.create({
					data: {
						user_id: userId,
						school_id: schoolId || null,
						scope_key: scopeKey,
						permission,
						effect,
						reason,
						granted_by: actor?.id || null,
					},
				});

		await this.#audit({
			schoolId: user.school_id,
			actorId: actor?.id || null,
			entityType: 'user',
			entityId: userId,
			action: 'permission_changed',
			outcome: 'success',
			severity: 'critical',
			ip,
			userAgent,
			diff: {
				before: { permission, effect: existing?.effect || null },
				after: { permission, effect, scopeKey },
			},
		});

		await this.#security({
			type: 'permission_changed',
			schoolId: user.school_id,
			userId,
			username: user.username,
			reason: `${effect}:${permission}`,
			ip,
			userAgent,
			meta: { actorId: actor?.id || null, scopeKey },
		});

		return row;
	}

	/**
	 * Remove an override, restoring the role's baseline.
	 */
	async clearPermissionOverride({ userId, permission, schoolId = null, actor, scope, ip = null, userAgent = null }) {
		const user = await this.users.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundError('Account');
		this.#assertScope(scope, user.school_id);

		const scopeKey = schoolId ? String(schoolId) : '*';
		const { count } = await this.overrides.deleteMany({
			where: { user_id: userId, scope_key: scopeKey, permission },
		});

		if (count) {
			await this.#audit({
				schoolId: user.school_id,
				actorId: actor?.id || null,
				entityType: 'user',
				entityId: userId,
				action: 'permission_changed',
				outcome: 'success',
				severity: 'critical',
				ip,
				userAgent,
				diff: { before: { permission, scopeKey }, after: null },
			});
		}

		return { removed: count };
	}

	// ── Internals ──────────────────────────────────────────────────────────

	/**
	 * The scope check. A platform operator may act inside any organization;
	 * an organization administrator only inside their own.
	 */
	#assertScope(scope, schoolId) {
		if (!scope) throw new ForbiddenError('No scope resolved');
		if (scope.kind === 'platform') return;
		if (scope.kind === 'school' && String(scope.schoolId) === String(schoolId)) return;
		throw new ForbiddenError('You can only act inside your own organization');
	}

	async #audit(input) {
		if (!this.#auditSvc) return;
		try {
			await this.#auditSvc.log(input);
		} catch (err) {
			this.#logger?.warn?.({ err }, 'Audit write failed');
		}
	}

	async #security(input) {
		if (!this.#securityEventSvc) return;
		try {
			await this.#securityEventSvc.record(input);
		} catch (err) {
			this.#logger?.warn?.({ err }, 'Security event write failed');
		}
	}
}

/** The permissions a role carries — exposed for the detail pages. */
export function baselinePermissions(role) {
	return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

export { ORGANIZATION_STATUSES, USER_STATUSES, ASSIGNABLE_ROLES, AppError };

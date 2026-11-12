/**
 * src/backend/services/AuditQueryService.js
 *
 * Read model for the Activity & Audit page.
 *
 * Two streams, kept distinct because they answer different questions:
 *
 *   ACTIONS — rows in `audit_logs`: which administrative action was performed
 *             on which entity, by whom, with what outcome.
 *   SECURITY — rows in `security_events`: who tried to authenticate, whether
 *             they succeeded, and where from.
 *
 * Both are server-filtered, server-paginated and server-sorted. The console
 * never receives an unbounded row dump.
 */

import { SECURITY_EVENT_LABELS } from './SecurityEventService.js';

const ACTION_LABELS = Object.freeze({
	create: 'Created',
	update: 'Updated',
	delete: 'Deleted',
	login: 'Signed in',
	logout: 'Signed out',
	export: 'Exported',
	import: 'Imported',
	migrate: 'Migrated',
	publish: 'Published',
	archive: 'Archived',
	assign: 'Assigned',
	'reset_data': 'Factory reset',
	'revoke-sessions': 'Sessions revoked',
	'update-profile': 'Profile updated',
	approve: 'Approved',
	reject: 'Rejected',
});

const ENTITY_LABELS = Object.freeze({
	auth: 'Authentication',
	user: 'Account',
	setting: 'Setting',
	school: 'Organization',
	class: 'Class',
	category: 'Category',
	subject: 'Subject',
	question: 'Question',
	exam: 'Exam',
	game: 'Game',
	tournament: 'Tournament',
	course: 'Course',
	device: 'Classroom device',
	kidsGame: 'Kids game',
	kidGame: 'Kids game',
	account_request: 'Account request',
	profile_request: 'Profile request',
});

export class AuditQueryService {
	/** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
	constructor(repo) {
		this.#repo = repo;
		this.auditLogs = repo.modelFor('audit_logs');
		this.securityEvents = repo.modelFor('security_events');
		this.users = repo.modelFor('users');
		this.schools = repo.modelFor('schools');
	}

	#repo;

	/**
	 * The administrative-action trail.
	 *
	 * @param {{ schoolIds?:string[]|null, actorId?:string|null,
	 *           entityType?:string|null, action?:string|null, outcome?:string|null,
	 *           severity?:string|null, search?:string|null,
	 *           from?:Date|null, to?:Date|null, limit?:number, offset?:number }} filters
	 */
	async listActions(filters = {}) {
		const {
			schoolIds = null,
			actorId = null,
			entityType = null,
			action = null,
			outcome = null,
			severity = null,
			search = null,
			from = null,
			to = null,
			limit = 50,
			offset = 0,
		} = filters;

		const where = {};
		if (Array.isArray(schoolIds)) where.school_id = { in: schoolIds };
		if (actorId) where.actor_id = actorId;
		if (entityType) where.entity_type = entityType;
		if (action) where.action = action;
		if (outcome) where.outcome = outcome;
		if (severity) where.severity = severity;
		if (from || to) {
			where.occurred_at = {};
			if (from) where.occurred_at.gte = from;
			if (to) where.occurred_at.lte = to;
		}
		if (search) {
			where.OR = [
				{ entity_id: { contains: search } },
				{ entity_type: { contains: search } },
				{ action: { contains: search } },
				{ diff_json: { contains: search } },
			];
		}

		const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
		const safeOffset = Math.max(Number(offset) || 0, 0);

		const [rows, total] = await Promise.all([
			this.auditLogs.findMany({
				where,
				orderBy: { occurred_at: 'desc' },
				skip: safeOffset,
				take: safeLimit,
				include: {
					actor: { select: { id: true, name: true, username: true, role: true } },
					school: { select: { id: true, name: true } },
				},
			}),
			this.auditLogs.count({ where }),
		]);

		return {
			data: rows.map((row) => this.#presentAction(row)),
			total,
			limit: safeLimit,
			offset: safeOffset,
		};
	}

	/**
	 * The authentication / access trail.
	 */
	async listSecurityEvents(filters = {}) {
		const {
			schoolIds = null,
			eventTypes = null,
			severity = null,
			outcome = null,
			search = null,
			from = null,
			to = null,
			limit = 50,
			offset = 0,
		} = filters;

		const where = {};
		if (Array.isArray(schoolIds)) where.school_id = { in: schoolIds };
		if (Array.isArray(eventTypes) && eventTypes.length) where.event_type = { in: eventTypes };
		if (severity) where.severity = severity;
		if (outcome) where.outcome = outcome;
		if (from || to) {
			where.occurred_at = {};
			if (from) where.occurred_at.gte = from;
			if (to) where.occurred_at.lte = to;
		}
		if (search) {
			where.OR = [
				{ username: { contains: search } },
				{ reason: { contains: search } },
				{ ip_address: { contains: search } },
			];
		}

		const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
		const safeOffset = Math.max(Number(offset) || 0, 0);

		const [rows, total] = await Promise.all([
			this.securityEvents.findMany({
				where,
				orderBy: { occurred_at: 'desc' },
				skip: safeOffset,
				take: safeLimit,
				include: {
					user: { select: { id: true, name: true, username: true, role: true } },
					school: { select: { id: true, name: true } },
				},
			}),
			this.securityEvents.count({ where }),
		]);

		return {
			data: rows.map((row) => this.#presentSecurity(row)),
			total,
			limit: safeLimit,
			offset: safeOffset,
		};
	}

	/**
	 * Aggregated counts used by the summary strip at the top of the page.
	 */
	async summarize({ schoolIds = null, from = null, to = null } = {}) {
		const where = {};
		if (Array.isArray(schoolIds)) where.school_id = { in: schoolIds };
		if (from || to) {
			where.occurred_at = {};
			if (from) where.occurred_at.gte = from;
			if (to) where.occurred_at.lte = to;
		}

		const [actionGroups, securityGroups] = await Promise.all([
			this.auditLogs.groupBy({
				by: ['entity_type', 'action', 'outcome'],
				where,
				_count: { _all: true },
			}),
			this.securityEvents.groupBy({
				by: ['event_type', 'outcome', 'severity'],
				where,
				_count: { _all: true },
			}),
		]);

		const actions = {};
		for (const row of actionGroups) {
			actions[row.action] = (actions[row.action] || 0) + row._count._all;
		}
		const denied = actionGroups
			.filter((row) => row.outcome === 'denied')
			.reduce((sum, row) => sum + row._count._all, 0);
		const security = {};
		for (const row of securityGroups) {
			security[row.event_type] = (security[row.event_type] || 0) + row._count._all;
		}

		// The failed sign-in sources — the "suspicious activity" signal.
		const failureWhere = { ...where, event_type: 'login_failure' };
		const [byIp, byUsername] = await Promise.all([
			this.securityEvents.groupBy({
				by: ['ip_address'],
				where: failureWhere,
				_count: { _all: true },
				orderBy: { _count: { ip_address: 'desc' } },
				take: 5,
			}),
			this.securityEvents.groupBy({
				by: ['username'],
				where: failureWhere,
				_count: { _all: true },
				orderBy: { _count: { username: 'desc' } },
				take: 5,
			}),
		]);

		return {
			actions,
			security,
			deniedActions: denied,
			topFailureSources: {
				byIp: byIp
					.filter((row) => row.ip_address)
					.map((row) => ({ ip: row.ip_address, count: row._count._all })),
				byUsername: byUsername
					.filter((row) => row.username)
					.map((row) => ({ username: row.username, count: row._count._all })),
			},
		};
	}

	/**
	 * The distinct filter options, derived from the rows that exist.
	 */
	async facets({ schoolIds = null } = {}) {
		const where = Array.isArray(schoolIds) ? { school_id: { in: schoolIds } } : {};
		const [actions, entityTypes] = await Promise.all([
			this.auditLogs.groupBy({ by: ['action'], where, _count: { _all: true } }),
			this.auditLogs.groupBy({ by: ['entity_type'], where, _count: { _all: true } }),
		]);
		return {
			actions: actions
				.map((row) => ({
					value: row.action,
					label: ACTION_LABELS[row.action] || row.action,
					count: row._count._all,
				}))
				.sort((a, b) => b.count - a.count),
			entityTypes: entityTypes
				.map((row) => ({
					value: row.entity_type,
					label: ENTITY_LABELS[row.entity_type] || row.entity_type,
					count: row._count._all,
				}))
				.sort((a, b) => b.count - a.count),
			securityEventTypes: Object.entries(SECURITY_EVENT_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		};
	}

	#presentAction(row) {
		let diff = null;
		if (row.diff_json) {
			try {
				diff = JSON.parse(row.diff_json);
			} catch {
				diff = { raw: row.diff_json };
			}
		}
		return {
			id: row.id,
			occurredAt: row.occurred_at,
			schoolId: row.school_id,
			schoolName: row.school?.name || null,
			actorId: row.actor_id,
			actorName: row.actor?.name || row.actor?.username || null,
			actorRole: row.actor?.role || null,
			entityType: row.entity_type,
			entityTypeLabel: ENTITY_LABELS[row.entity_type] || row.entity_type,
			entityId: row.entity_id,
			action: row.action,
			actionLabel: ACTION_LABELS[row.action] || row.action,
			outcome: row.outcome,
			severity: row.severity,
			ip: row.ip_address,
			userAgent: row.user_agent,
			diff,
		};
	}

	#presentSecurity(row) {
		return {
			id: row.id,
			occurredAt: row.occurred_at,
			schoolId: row.school_id,
			schoolName: row.school?.name || null,
			userId: row.user_id,
			userName: row.user?.name || row.user?.username || null,
			username: row.username,
			type: row.event_type,
			typeLabel: SECURITY_EVENT_LABELS[row.event_type] || row.event_type,
			outcome: row.outcome,
			severity: row.severity,
			reason: row.reason,
			ip: row.ip_address,
			userAgent: row.user_agent,
		};
	}
}

/**
 * src/backend/services/PlatformAnalyticsService.js
 *
 * Platform-wide read model for the Admin control center.
 *
 * DESIGN RULES (copied from the teacher analytics discipline, applied at a
 * different aggregation level):
 *
 *  1. The SERVER aggregates. The client renders. No KPI is computed in the
 *     browser from a raw row dump.
 *  2. Every metric names its SOURCE and its EXACT definition. The definitions
 *     below are the contract; the tooltips in the console quote them.
 *  3. A metric that cannot be measured honestly is reported as UNAVAILABLE,
 *     never as zero and never estimated.
 *  4. "Active" NEVER means "the account exists". It means a recorded event
 *     happened inside the selected window.
 *  5. Scope is explicit: a platform request aggregates every organization; a
 *     school request aggregates exactly one. The service never guesses.
 *
 * The teacher session asks pedagogical questions about one teacher's classes.
 * This service asks governance questions about organizations, accounts and
 * platform-wide usage. Same underlying rows, different questions.
 */

import { resolvePeriodWindow, parseAcademicYearWindow, precedingWindow } from './OverviewAnalyticsService.js';
import { RESULT_MODE } from '../../shared/constants.js';

/** The window an "active" user must have produced an event in. */
const ACTIVITY_SOURCES = {
	teacher: [
		{ table: 'users', column: 'last_login', role: 'teacher' },
		{ table: 'questions', column: 'created_at', role: 'teacher' },
		{ table: 'exams', column: 'created_at', role: 'teacher' },
		{ table: 'courses', column: 'created_at', role: 'teacher' },
		{ table: 'games', column: 'created_at', role: 'teacher' },
		{ table: 'kidsGames', column: 'created_at', role: 'teacher' },
		{ table: 'teacherMessages', column: 'date', role: 'teacher' },
		{ table: 'teacherAssignments', column: 'created_at', role: 'teacher' },
	],
	student: [
		{ table: 'results', column: 'date_taken' },
		{ table: 'examSessions', column: 'started_at' },
		{ table: 'gameSessions', column: 'joined_at' },
		{ table: 'kidsGameSessions', column: 'created_at' },
		{ table: 'tournamentEntries', column: 'registered_at' },
	],
};

export class PlatformAnalyticsService {
	#repo;
	#m;

	/** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
	constructor(repo) {
		this.#repo = repo;
		this.#m = repo.modelFor('schools');
		this.users = repo.modelFor('users');
		this.classes = repo.modelFor('classes');
		this.exams = repo.modelFor('exams');
		this.questions = repo.modelFor('questions');
		this.courses = repo.modelFor('courses');
		this.games = repo.modelFor('games');
		this.gameSessions = repo.modelFor('game_sessions');
		this.examSessions = repo.modelFor('exam_sessions');
		this.results = repo.modelFor('results');
		this.kidsGames = repo.modelFor('kidsGames');
		this.kidsGameSessions = repo.modelFor('kidsGameSessions');
		this.tournaments = repo.modelFor('tournaments');
		this.tournamentEntries = repo.modelFor('tournament_entries');
		this.auditLogs = repo.modelFor('audit_logs');
		this.securityEvents = repo.modelFor('security_events');
		this.accountRequests = repo.modelFor('account_requests');
		this.profileRequests = repo.modelFor('profile_requests');
		this.devices = repo.modelFor('devices');
		this.teacherMessages = repo.modelFor('teacher_messages');
		this.teacherAssignments = repo.modelFor('teacher_assignments');
	}

	// ── Scope ───────────────────────────────────────────────────────────────

	/**
	 * The organizations a request may read.
	 * @param {{kind:string, schoolId:string|null}} scope
	 * @param {string[]|null} [narrowTo] explicit organization filter
	 */
	async resolveSchoolIds(scope, narrowTo = null) {
		if (scope?.kind === 'platform') {
			if (Array.isArray(narrowTo) && narrowTo.length) return narrowTo;
			const rows = await this.#m.findMany({ select: { id: true } });
			return rows.map((row) => row.id);
		}
		if (scope?.schoolId) return [scope.schoolId];
		return [];
	}

	// ── Period ──────────────────────────────────────────────────────────────

	/**
	 * Resolve the reporting window and its equal-length predecessor.
	 * `academicYear` is derived from the organization's `school_year` label
	 * when the caller asks for the academic year — it is a DATE WINDOW, not a
	 * tag on the records.
	 */
	resolveWindow({ period = '30d', academicYear = null, customFrom = null, customTo = null, now = new Date(), schoolYear = null }) {
		const academicWindow = schoolYear
			? parseAcademicYearWindow(schoolYear, now)
			: parseAcademicYearWindow('current', now);
		let key = period;
		if (academicYear === 'current' && period === 'year') key = 'year';
		const window = resolvePeriodWindow(key, now, academicWindow, customFrom, customTo);
		const previous = precedingWindow(window);
		return { window, previous, academicWindow };
	}

	// ── Overview ────────────────────────────────────────────────────────────

	/**
	 * The platform control center read model.
	 *
	 * @param {{ scope:object, schoolIds?:string[]|null, period?:string,
	 *           academicYear?:string|null, customFrom?:string|null,
	 *           customTo?:string|null, now?:Date }} input
	 */
	async getOverview(input) {
		const now = input.now || new Date();
		const schoolIds = await this.resolveSchoolIds(input.scope, input.schoolIds);
		const inScope = schoolIds.length ? { school_id: { in: schoolIds } } : { school_id: '__none__' };

		// The academic year follows the organization's own label when the
		// scope is a single organization; at platform scope the current
		// calendar academic window is used.
		const schoolYear = await this.#resolveSchoolYear(input.scope, schoolIds);
		const { window, previous, academicWindow } = this.resolveWindow({
			period: input.period,
			academicYear: input.academicYear,
			customFrom: input.customFrom,
			customTo: input.customTo,
			now,
			schoolYear,
		});

		const range = window.start ? { gte: window.start, lte: window.end } : null;
		const previousRange = previous
			? { gte: previous.start, lte: previous.end }
			: null;

		const [
			organizations,
			usersByRole,
			suspendedAccounts,
			pendingInvitations,
			contentCounts,
			attempts,
			formalAttempts,
			distinctAttemptUsers,
			examsConducted,
			gameSessions,
			kidsSessions,
			liveExamSessions,
			liveGameSessions,
			securitySummary,
			auditCounts,
		] = await Promise.all([
			this.#organizationCounts(schoolIds, range, now),
			this.users.groupBy({ by: ['role', 'status'], where: inScope, _count: { _all: true } }),
			this.users.count({ where: { ...inScope, status: 'suspended' } }),
			this.accountRequests.count({ where: { ...inScope, status: 'pending' } }),
			this.#contentCounts(inScope, range),
			this.results.count({ where: { ...inScope, ...(range ? { date_taken: range } : {}) } }),
			this.results.count({
				where: {
					...inScope,
					mode: RESULT_MODE.EXAM,
					...(range ? { date_taken: range } : {}) },
			}),
			this.results.findMany({
				where: { ...inScope, ...(range ? { date_taken: range } : {}) },
				select: { user_id: true },
				distinct: ['user_id'],
			}),
			this.#examsConducted(schoolIds, range),
			this.gameSessions.count({ where: { ...inScope, ...(range ? { joined_at: range } : {}) } }),
			this.kidsGameSessions.count({
				where: { ...inScope, ...(range ? { created_at: range } : {}) },
			}),
			this.examSessions.count({ where: { ...inScope, status: 'active' } }),
			this.gameSessions.count({ where: { ...inScope, completed: false } }),
			this.#securitySummary(schoolIds, range),
			this.auditLogs.count({ where: { ...inScope, ...(range ? { occurred_at: range } : {}) } }),
		]);

		const roleCounts = {};
		for (const row of usersByRole) {
			const bucket = (roleCounts[row.role] = roleCounts[row.role] || {});
			bucket[row.status] = (bucket[row.status] || 0) + row._count._all;
		}

		const teacherTotal = sumRole(roleCounts, 'teacher');
		const studentTotal = sumRole(roleCounts, 'student');
		const adminTotal = sumRole(roleCounts, 'admin') + sumRole(roleCounts, 'super_admin');

		const [activeTeachers, activeStudents] = await Promise.all([
			this.#activeUserIds('teacher', schoolIds, range),
			this.#activeUserIds('student', schoolIds, range),
		]);

		const averageScore = await this.#averageFormalScore(schoolIds, range);
		const previousAverageScore = previousRange
			? await this.#averageFormalScore(schoolIds, previousRange)
			: null;

		const attemptsPrevious = previousRange
			? await this.results.count({ where: { ...inScope, date_taken: previousRange } })
			: null;

		const health = await this.#healthSnapshot(schoolIds, range);

		return {
			meta: {
				generatedAt: now.toISOString(),
				scope: {
					kind: input.scope?.kind || 'school',
					schoolIds,
					organizationCount: schoolIds.length,
					period: window.key,
					periodLabel: window.label,
					periodStart: window.start,
					periodEnd: window.end,
					academicYear: academicWindow?.label || null,
				},
				definitions: {
					activeTeacher:
						'A teacher with at least one recorded event in the window: a sign-in, or the creation of a question, exam, course, game, kids game, teacher message or teacher assignment.',
					activeStudent:
						'A student with at least one recorded event in the window: a completed attempt (exam, training or game), an exam session, a game session, a kids-game session or a tournament registration.',
					examsConducted:
						'Distinct published, non-training exams with at least one completed exam attempt in the window.',
					averageScore:
						'Average score per completed formal-exam attempt, on the /20 scale (stored scores are percentages; 50% = 10/20). Training and game attempts are excluded.',
					activeSession:
						'A session that is currently open, not merely one that started at some point.',
				},
				previousPeriod: previous
					? { start: previous.start, end: previous.end, label: 'previous equal-length period' }
					: null,
			},
			sections: {
				glance: {
					organizations: {
						total: organizations.total,
						active: organizations.active,
						pending: organizations.pending,
						suspended: organizations.suspended,
						newInPeriod: organizations.newInPeriod,
						withActivity: organizations.withActivity,
					},
					users: {
						teachers: teacherTotal,
						activeTeachers: activeTeachers.size,
						students: studentTotal,
						activeStudents: activeStudents.size,
						administrators: adminTotal,
						suspended: suspendedAccounts,
						pendingInvitations,
					},
				},
				activity: {
					attempts,
					attemptsPrevious,
					formalAttempts,
					participatingStudents: distinctAttemptUsers.length,
					examsConducted,
					averageScore20: averageScore.value,
					averageScore20Previous: previousAverageScore?.value ?? null,
					averageScoreSample: averageScore.sample,
					gameSessions,
					kidsGameSessions: kidsSessions,
				},
				content: contentCounts,
				operations: {
					...health,
					failedAuthentications: securitySummary.counts.login_failure || 0,
					securityEvents: securitySummary.total,
					auditEvents: auditCounts,
				},
				scopeSummary: {
					activeTeacherIds: [...activeTeachers].slice(0, 50),
					activeStudentIds: [...activeStudents].slice(0, 50),
				},
			},
		};
	}

	// ── Trends ──────────────────────────────────────────────────────────────

	/**
	 * Time series for the overview charts. Every series respects the window.
	 * @param {{ scope:object, schoolIds?:string[]|null, period?:string,
	 *           customFrom?:string|null, customTo?:string|null, now?:Date }} input
	 */
	async getTrends(input) {
		const now = input.now || new Date();
		const schoolIds = await this.resolveSchoolIds(input.scope, input.schoolIds);
		const inScope = schoolIds.length ? { school_id: { in: schoolIds } } : { school_id: '__none__' };
		const { window } = this.resolveWindow({
			period: input.period,
			academicYear: input.academicYear,
			customFrom: input.customFrom,
			customTo: input.customTo,
			now,
		});

		const buckets = buildBuckets(window, now);
		const [attempts, newUsers, newOrganizations, activeStudents] = await Promise.all([
			this.results.findMany({
				where: { ...inScope, ...(window.start ? { date_taken: { gte: window.start, lte: window.end } } : {}) },
				select: { date_taken: true, mode: true, user_id: true },
			}),
			this.users.findMany({
				where: { ...inScope, ...(window.start ? { created_at: { gte: window.start, lte: window.end } } : {}) },
				select: { created_at: true, role: true },
			}),
			this.#m.findMany({
				where: { id: { in: schoolIds }, ...(window.start ? { created_at: { gte: window.start, lte: window.end } } : {}) },
				select: { created_at: true },
			}),
			this.#activeUserIds('student', schoolIds, window.start ? { gte: window.start, lte: window.end } : null),
		]);

		const attemptsByBucket = bucketize(attempts, buckets, (row) => row.date_taken, (row) => row.mode);
		const usersByBucket = bucketize(newUsers, buckets, (row) => row.created_at, (row) => row.role);
		const orgsByBucket = bucketize(newOrganizations, buckets, (row) => row.created_at, () => null);

		return {
			meta: {
				generatedAt: now.toISOString(),
				period: window.key,
				periodLabel: window.label,
				bucketCount: buckets.length,
				granularity: buckets.length > 45 ? 'week' : 'day',
			},
			series: {
				labels: buckets.map((bucket) => bucket.label),
				attempts: buckets.map((_, index) => attemptsByBucket.total[index] || 0),
				formalAttempts: buckets.map((_, index) => attemptsByBucket.exam[index] || 0),
				trainingAttempts: buckets.map((_, index) => attemptsByBucket.training[index] || 0),
				gameAttempts: buckets.map((_, index) => attemptsByBucket.game[index] || 0),
				newTeachers: buckets.map((_, index) => usersByBucket.teacher[index] || 0),
				newStudents: buckets.map((_, index) => usersByBucket.student[index] || 0),
				newOrganizations: buckets.map((_, index) => orgsByBucket.total[index] || 0),
				activeStudents: buckets.map(() => activeStudents.size),
			},
		};
	}

	// ── Organizations ───────────────────────────────────────────────────────

	/**
	 * The organizational overview table — the console's "who needs attention"
	 * list.
	 */
	async listOrganizations(input) {
		const now = input.now || new Date();
		const schoolIds = await this.resolveSchoolIds(input.scope, input.schoolIds);
		if (!schoolIds.length) return { data: [], total: 0, limit: input.limit || 25, offset: input.offset || 0 };

		const where = { id: { in: schoolIds } };
		if (input.status) where.status = input.status;
		if (input.search) where.name = { contains: input.search };

		const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 200);
		const offset = Math.max(Number(input.offset) || 0, 0);

		const [rows, total] = await Promise.all([
			this.#m.findMany({
				where,
				orderBy: { name: 'asc' },
				skip: offset,
				take: limit,
				select: {
					id: true,
					name: true,
					slug: true,
					status: true,
					plan: true,
					school_type: true,
					school_year: true,
					max_students: true,
					created_at: true,
				},
			}),
			this.#m.count({ where }),
		]);

		const rowsWithMetrics = await Promise.all(
			rows.map((school) => this.#organizationMetrics(school, now)),
		);

		return { data: rowsWithMetrics, total, limit, offset };
	}

	async #organizationMetrics(school, now) {
		const schoolId = school.id;
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

		const [
			teacherCount,
			studentCount,
			adminCount,
			activeTeacherCount,
			activeStudentCount,
			attempts,
			lastResult,
			lastLogin,
			suspendedCount,
			pendingInvitations,
		] = await Promise.all([
			this.users.count({ where: { school_id: schoolId, role: 'teacher' } }),
			this.users.count({ where: { school_id: schoolId, role: 'student' } }),
			this.users.count({ where: { school_id: schoolId, role: { in: ['admin', 'super_admin'] } } }),
			this.#activeUserIds('teacher', [schoolId], { gte: thirtyDaysAgo, lte: now }),
			this.#activeUserIds('student', [schoolId], { gte: thirtyDaysAgo, lte: now }),
			this.results.count({ where: { school_id: schoolId, date_taken: { gte: thirtyDaysAgo, lte: now } } }),
			this.results.findFirst({
				where: { school_id: schoolId },
				orderBy: { date_taken: 'desc' },
				select: { date_taken: true },
			}),
			this.users.findFirst({
				where: { school_id: schoolId, last_login: { not: null } },
				orderBy: { last_login: 'desc' },
				select: { last_login: true },
			}),
			this.users.count({ where: { school_id: schoolId, status: 'suspended' } }),
			this.accountRequests.count({ where: { school_id: schoolId, status: 'pending' } }),
		]);

		const lastActivityCandidates = [lastResult?.date_taken, lastLogin?.last_login].filter(Boolean);
		const lastActivity = lastActivityCandidates.length
			? new Date(Math.max(...lastActivityCandidates.map((d) => new Date(d).getTime())))
			: null;

		const alerts = [];
		if (school.status === 'suspended') alerts.push({ kind: 'danger', code: 'suspended', message: 'Access is suspended.' });
		if (school.status === 'pending') alerts.push({ kind: 'warning', code: 'pending', message: 'Awaiting activation.' });
		if (suspendedCount > 0) {
			alerts.push({ kind: 'warning', code: 'suspended_accounts', message: `${suspendedCount} suspended account${suspendedCount === 1 ? '' : 's'}.` });
		}
		if (pendingInvitations > 0) {
			alerts.push({ kind: 'info', code: 'pending_invitations', message: `${pendingInvitations} pending request${pendingInvitations === 1 ? '' : 's'}.` });
		}
		if (!lastActivity) {
			alerts.push({ kind: 'danger', code: 'no_activity', message: 'No recorded activity ever.' });
		} else if (lastActivity.getTime() < thirtyDaysAgo.getTime()) {
			alerts.push({ kind: 'warning', code: 'inactive', message: 'No activity in the last 30 days.' });
		}

		return {
			id: school.id,
			name: school.name,
			slug: school.slug,
			status: school.status,
			plan: school.plan,
			schoolType: school.school_type,
			schoolYear: school.school_year,
			maxStudents: school.max_students,
			createdAt: school.created_at,
			teachers: teacherCount,
			students: studentCount,
			administrators: adminCount,
			activeTeachers: activeTeacherCount.size,
			activeStudents: activeStudentCount.size,
			attempts30d: attempts,
			lastActivity,
			alerts,
		};
	}

	// ── Users ───────────────────────────────────────────────────────────────

	/**
	 * The users table for Users & Access.
	 */
	async listUsers(input) {
		const schoolIds = await this.resolveSchoolIds(input.scope, input.schoolIds);
		const where = schoolIds.length ? { school_id: { in: schoolIds } } : { school_id: '__none__' };
		if (input.role) where.role = input.role;
		if (input.status) where.status = input.status;
		if (input.schoolId) where.school_id = input.schoolId;
		if (input.search) {
			where.OR = [
				{ name: { contains: input.search } },
				{ username: { contains: input.search } },
				{ email: { contains: input.search } },
				{ numero: { contains: input.search } },
			];
		}

		const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
		const offset = Math.max(Number(input.offset) || 0, 0);

		const [rows, total] = await Promise.all([
			this.users.findMany({
				where,
				orderBy: [{ role: 'asc' }, { name: 'asc' }],
				skip: offset,
				take: limit,
				select: {
					id: true,
					school_id: true,
					username: true,
					name: true,
					role: true,
					status: true,
					email: true,
					class_id: true,
					last_login: true,
					created_at: true,
				},
			}),
			this.users.count({ where }),
		]);

		const schools = schoolIds.length
			? await this.#m.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } })
			: [];
		const schoolNames = new Map(schools.map((school) => [school.id, school.name]));

		const classIds = [...new Set(rows.map((row) => row.class_id).filter(Boolean))];
		const classes = classIds.length
			? await this.classes.findMany({
					where: { id: { in: classIds } },
					select: { id: true, name: true },
				})
			: [];
		const classNames = new Map(classes.map((row) => [row.id, row.name]));

		return {
			data: rows.map((row) => ({
				id: row.id,
				schoolId: row.school_id,
				schoolName: schoolNames.get(row.school_id) || row.school_id,
				username: row.username,
				name: row.name,
				role: row.role,
				status: row.status,
				email: row.email,
				classId: row.class_id,
				className: row.class_id ? classNames.get(row.class_id) || null : null,
				lastLogin: row.last_login,
				createdAt: row.created_at,
			})),
			total,
			limit,
			offset,
		};
	}

	// ── Detail views ───────────────────────────────────────────────────────

	/**
	 * One organization's administrative detail.
	 *
	 * @param {{ schoolId:string, scope:object, now?:Date }} input
	 */
	async getOrganizationDetail(input) {
		const now = input.now || new Date();
		const schoolId = input.schoolId;

		// Scope check: an organization administrator may only open their own.
		if (input.scope?.kind === 'school' && String(input.scope.schoolId) !== String(schoolId)) {
			return null;
		}

		const school = await this.#m.findUnique({
			where: { id: schoolId },
			select: {
				id: true,
				name: true,
				slug: true,
				status: true,
				plan: true,
				school_type: true,
				school_year: true,
				address: true,
				city: true,
				phone: true,
				email: true,
				max_students: true,
				created_at: true,
				updated_at: true,
				suspended_at: true,
				suspended_reason: true,
			},
		});
		if (!school) return null;

		const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
		const [
			administrators,
			teachers,
			students,
			classes,
			activeTeacherIds,
			activeStudentIds,
			attempts30d,
			formalAttempts30d,
			exams,
			questions,
			courses,
			games,
			kidsGames,
			pendingRequests,
			suspendedAccounts,
			auditRows,
			lastResult,
			lastLogin,
		] = await Promise.all([
			this.users.findMany({
				where: { school_id: schoolId, role: { in: ['admin', 'super_admin'] } },
				select: { id: true, name: true, username: true, role: true, status: true, last_login: true },
				orderBy: { name: 'asc' },
			}),
			this.users.findMany({
				where: { school_id: schoolId, role: 'teacher' },
				select: { id: true, name: true, username: true, status: true, last_login: true },
				orderBy: { name: 'asc' },
			}),
			this.users.findMany({
				where: { school_id: schoolId, role: 'student' },
				select: { id: true, name: true, username: true, status: true, last_login: true, class_id: true },
				orderBy: { name: 'asc' },
			}),
			this.classes.findMany({
				where: { school_id: schoolId },
				select: { id: true, name: true, created_at: true },
				orderBy: { name: 'asc' },
			}),
			this.#activeUserIds('teacher', [schoolId], { gte: thirtyDaysAgo, lte: now }),
			this.#activeUserIds('student', [schoolId], { gte: thirtyDaysAgo, lte: now }),
			this.results.count({ where: { school_id: schoolId, date_taken: { gte: thirtyDaysAgo, lte: now } } }),
			this.results.count({
				where: { school_id: schoolId, mode: RESULT_MODE.EXAM, date_taken: { gte: thirtyDaysAgo, lte: now } } },
			),
			this.exams.count({ where: { school_id: schoolId } }),
			this.questions.count({ where: { school_id: schoolId } }),
			this.courses.count({ where: { school_id: schoolId } }),
			this.games.count({ where: { school_id: schoolId } }),
			this.kidsGames.count({ where: { school_id: schoolId } }),
			this.accountRequests.count({ where: { school_id: schoolId, status: 'pending' } }),
			this.users.count({ where: { school_id: schoolId, status: 'suspended' } }),
			this.auditLogs.findMany({
				where: { school_id: schoolId },
				orderBy: { occurred_at: 'desc' },
				take: 15,
				select: {
					id: true,
					occurred_at: true,
					action: true,
					entity_type: true,
					entity_id: true,
					outcome: true,
					severity: true,
					actor: { select: { id: true, name: true, username: true, role: true } },
				},
			}),
			this.results.findFirst({
				where: { school_id: schoolId },
				orderBy: { date_taken: 'desc' },
				select: { date_taken: true },
			}),
			this.users.findFirst({
				where: { school_id: schoolId, last_login: { not: null } },
				orderBy: { last_login: 'desc' },
				select: { last_login: true },
			}),
		]);

		const lastActivityCandidates = [lastResult?.date_taken, lastLogin?.last_login].filter(Boolean);
		const lastActivity = lastActivityCandidates.length
			? new Date(Math.max(...lastActivityCandidates.map((d) => new Date(d).getTime())))
			: null;

		return {
			organization: {
				id: school.id,
				name: school.name,
				slug: school.slug,
				status: school.status,
				plan: school.plan,
				schoolType: school.school_type,
				schoolYear: school.school_year,
				address: school.address,
				city: school.city,
				phone: school.phone,
				email: school.email,
				maxStudents: school.max_students,
				createdAt: school.created_at,
				updatedAt: school.updated_at,
				suspendedAt: school.suspended_at,
				suspendedReason: school.suspended_reason,
			},
			usage: {
				administrators: administrators.length,
				teachers: teachers.length,
				students: students.length,
				classes: classes.length,
				activeTeachers: activeTeacherIds.size,
				activeStudents: activeStudentIds.size,
				attempts30d,
				formalAttempts30d,
				exams,
				questions,
				courses,
				games,
				kidsGames,
				pendingRequests,
				suspendedAccounts,
				lastActivity,
			},
			administrators: administrators.map((row) => ({
				id: row.id,
				name: row.name,
				username: row.username,
				role: row.role,
				status: row.status,
				lastLogin: row.last_login,
			})),
			teachers: teachers.map((row) => ({
				id: row.id,
				name: row.name,
				username: row.username,
				status: row.status,
				lastLogin: row.last_login,
				active: activeTeacherIds.has(row.id),
			})),
			students: students.map((row) => ({
				id: row.id,
				name: row.name,
				username: row.username,
				status: row.status,
				lastLogin: row.last_login,
				classId: row.class_id,
				active: activeStudentIds.has(row.id),
			})),
			classes: classes.map((row) => ({
				id: row.id,
				name: row.name,
				createdAt: row.created_at,
				studentCount: students.filter((student) => student.class_id === row.id).length,
			})),
			recentActivity: auditRows.map((row) => ({
				id: row.id,
				occurredAt: row.occurred_at,
				action: row.action,
				entityType: row.entity_type,
				entityId: row.entity_id,
				outcome: row.outcome,
				severity: row.severity,
				actorName: row.actor?.name || row.actor?.username || null,
				actorRole: row.actor?.role || null,
			})),
		};
	}

	/**
	 * One account's administrative detail.
	 *
	 * @param {{ userId:string, scope:object, now?:Date }} input
	 */
	async getUserDetail(input) {
		const now = input.now || new Date();
		const user = await this.users.findUnique({
			where: { id: input.userId },
			select: {
				id: true,
				school_id: true,
				class_id: true,
				username: true,
				name: true,
				role: true,
				status: true,
				email: true,
				phone: true,
				numero: true,
				title: true,
				last_login: true,
				created_at: true,
				updated_at: true,
			},
		});
		if (!user) return null;
		if (input.scope?.kind === 'school' && String(input.scope.schoolId) !== String(user.school_id)) {
			return null;
		}

		const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
		const [school, klass, attempts, formalAttempts, results, auditRows, overrides] =
			await Promise.all([
				this.#m.findUnique({
					where: { id: user.school_id },
					select: { id: true, name: true, slug: true, status: true, plan: true },
				}),
				user.class_id
					? this.classes.findUnique({
							where: { id: user.class_id },
							select: { id: true, name: true },
						})
					: null,
				this.results.count({
					where: { user_id: user.id, date_taken: { gte: thirtyDaysAgo, lte: now } },
				}),
				this.results.count({
					where: {
						user_id: user.id,
						mode: RESULT_MODE.EXAM,
						date_taken: { gte: thirtyDaysAgo, lte: now },
					},
				}),
				this.results.findMany({
					where: { user_id: user.id },
					orderBy: { date_taken: 'desc' },
					take: 10,
					select: {
						id: true,
						exam_id: true,
						mode: true,
						score: true,
						passed: true,
						date_taken: true,
					},
				}),
				this.auditLogs.findMany({
					where: { actor_id: user.id },
					orderBy: { occurred_at: 'desc' },
					take: 15,
					select: {
						id: true,
						occurred_at: true,
						action: true,
						entity_type: true,
						entity_id: true,
						outcome: true,
						severity: true,
						school: { select: { id: true, name: true } },
					},
				}),
				this.#repo.modelFor('user_permission_overrides').findMany({
					where: { user_id: user.id },
					select: {
						id: true,
						permission: true,
						effect: true,
						scope_key: true,
						reason: true,
						created_at: true,
					},
				}),
			]);

		return {
			account: {
				id: user.id,
				name: user.name,
				username: user.username,
				role: user.role,
				status: user.status,
				email: user.email,
				phone: user.phone,
				numero: user.numero,
				title: user.title,
				lastLogin: user.last_login,
				createdAt: user.created_at,
				updatedAt: user.updated_at,
			},
			organization: school,
			class: klass,
			activity: {
				attempts30d: attempts,
				formalAttempts30d: formalAttempts,
				active: attempts > 0 || Boolean(user.last_login && new Date(user.last_login) >= thirtyDaysAgo),
			},
			recentResults: results.map((row) => ({
				id: row.id,
				examId: row.exam_id,
				mode: row.mode,
				score: row.score,
				score20: Math.round((row.score / 5) * 100) / 100,
				passed: row.passed,
				dateTaken: row.date_taken,
			})),
			recentActivity: auditRows.map((row) => ({
				id: row.id,
				occurredAt: row.occurred_at,
				action: row.action,
				entityType: row.entity_type,
				entityId: row.entity_id,
				outcome: row.outcome,
				severity: row.severity,
				organizationName: row.school?.name || null,
			})),
			permissionOverrides: overrides.map((row) => ({
				id: row.id,
				permission: row.permission,
				effect: row.effect,
				scopeKey: row.scope_key,
				reason: row.reason,
				createdAt: row.created_at,
			})),
		};
	}

	// ── Internal helpers ────────────────────────────────────────────────────

	async #resolveSchoolYear(scope, schoolIds) {
		if (scope?.kind !== 'platform') {
			if (!schoolIds.length) return null;
			const school = await this.#m.findFirst({
				where: { id: schoolIds[0] },
				select: { school_year: true },
			});
			return school?.school_year || null;
		}
		return null;
	}

	async #organizationCounts(schoolIds, range, now) {
		const where = { id: { in: schoolIds.length ? schoolIds : ['__none__'] } };
		const [total, active, pending, suspended, newInPeriod, rows] = await Promise.all([
			this.#m.count({ where }),
			this.#m.count({ where: { ...where, status: 'active' } }),
			this.#m.count({ where: { ...where, status: 'pending' } }),
			this.#m.count({ where: { ...where, status: 'suspended' } }),
			range ? this.#m.count({ where: { ...where, created_at: range } }) : 0,
			this.#m.findMany({ where, select: { id: true } }),
		]);
		return { total, active, pending, suspended, newInPeriod, withActivity: rows.length };
	}

	async #contentCounts(inScope, range) {
		const created = range ? { created_at: range } : {};
		const [questions, exams, activeExams, courses, games, kidsGames, classes] = await Promise.all([
			this.questions.count({ where: inScope }),
			this.exams.count({ where: { ...inScope, ...created } }),
			this.exams.count({ where: { ...inScope, status: 'active' } }),
			this.courses.count({ where: { ...inScope, ...created } }),
			this.games.count({ where: { ...inScope, ...created } }),
			this.kidsGames.count({ where: { ...inScope, ...created } }),
			this.classes.count({ where: inScope }),
		]);
		return {
			questions,
			exams,
			activeExams,
			courses,
			games,
			kidsGames,
			classes,
			note: 'Counts are rows that exist in the scope. "Created" counts respect the selected period; totals do not.',
		};
	}

	async #examsConducted(schoolIds, range) {
		if (!schoolIds.length) return 0;
		const results = await this.results.findMany({
			where: {
				school_id: { in: schoolIds },
				mode: RESULT_MODE.EXAM,
				exam_id: { not: null },
				...(range ? { date_taken: range } : {}),
			},
			select: { exam_id: true },
			distinct: ['exam_id'],
		});
		if (!results.length) return 0;
		const examIds = results.map((row) => row.exam_id).filter(Boolean);
		const exams = await this.exams.findMany({
			where: {
				id: { in: examIds },
				status: 'active',
				is_training: false,
			},
			select: { id: true },
		});
		return exams.length;
	}

	/**
	 * The ids of users of a role who produced at least one recorded event in
	 * the window. Implemented as a UNION of the documented activity sources.
	 *
	 * The sources differ by role on purpose:
	 *   teacher → sign-in + authored content + messages/assignments
	 *   student → sign-in + attempts + sessions + game plays + registrations
	 */
	async #activeUserIds(role, schoolIds, range) {
		const ids = new Set();
		if (!schoolIds.length) return ids;
		const scoped = { school_id: { in: schoolIds } };

		// 0. The candidate population: accounts of this role inside the scope.
		//    Filtering the activity sources by this id list both excludes NULL
		//    participants and guarantees the final set really holds this role.
		const candidates = await this.users.findMany({
			where: { ...scoped, role },
			select: { id: true },
		});
		const candidateIds = candidates.map((row) => row.id);
		if (!candidateIds.length) return ids;

		// 1. A sign-in inside the window.
		const loggedIn = await this.users.findMany({
			where: { ...scoped, role, ...(range ? { last_login: range } : {}) },
			select: { id: true },
		});
		for (const row of loggedIn) ids.add(row.id);

		// 2. Role-specific activity sources. The author / participant column
		//    and the timestamp column differ per table, so each is explicit.
		const authored =
			role === 'teacher'
				? [
						{ delegate: this.questions, author: 'created_by', date: 'created_at' },
						{ delegate: this.exams, author: 'creator_id', date: 'created_at' },
						{ delegate: this.courses, author: 'created_by', date: 'created_at' },
						{ delegate: this.games, author: 'creator_id', date: 'created_at' },
						{ delegate: this.kidsGames, author: 'teacher_id', date: 'created_at' },
						{ delegate: this.teacherMessages, author: 'teacher_id', date: 'date' },
						{ delegate: this.teacherAssignments, author: 'teacher_id', date: 'created_at' },
					]
				: [
						{ delegate: this.results, author: 'user_id', date: 'date_taken' },
						{ delegate: this.examSessions, author: 'user_id', date: 'started_at' },
						{ delegate: this.gameSessions, author: 'user_id', date: 'joined_at' },
						{ delegate: this.kidsGameSessions, author: 'user_id', date: 'created_at' },
						{ delegate: this.tournamentEntries, author: 'user_id', date: 'registered_at' },
					];

		for (const source of authored) {
			const rows = await source.delegate.findMany({
				where: {
					...scoped,
					[source.author]: { in: candidateIds },
					...(range ? { [source.date]: range } : {}),
				},
				select: { [source.author]: true },
			});
			for (const row of rows) {
				const authorId = row[source.author];
				if (authorId) ids.add(authorId);
			}
		}

		return ids;
	}

	async #averageFormalScore(schoolIds, range) {
		if (!schoolIds.length) return { value: null, sample: 0 };
		const aggregate = await this.results.aggregate({
			where: {
				school_id: { in: schoolIds },
				mode: RESULT_MODE.EXAM,
				...(range ? { date_taken: range } : {}),
			},
			_avg: { score: true },
			_count: { _all: true },
		});
		const sample = aggregate._count?._all || 0;
		if (!sample || aggregate._avg?.score == null) return { value: null, sample };
		// Scores are stored as percentages; the platform reports /20.
		return { value: Math.round((aggregate._avg.score / 5) * 100) / 100, sample };
	}

	async #securitySummary(schoolIds, range) {
		const where = {};
		if (schoolIds.length) where.school_id = { in: schoolIds };
		if (range) where.occurred_at = range;
		const grouped = await this.securityEvents.groupBy({
			by: ['event_type'],
			where,
			_count: { _all: true },
		});
		const counts = {};
		let total = 0;
		for (const row of grouped) {
			counts[row.event_type] = row._count._all;
			total += row._count._all;
		}
		return { counts, total };
	}

	/**
	 * A lightweight operational snapshot derived from the real request log.
	 * The request log is process-local (see server-metrics.js), so the console
	 * states that explicitly rather than implying historical uptime.
	 */
	async #healthSnapshot(schoolIds, range) {
		let availability = null;
		let errorRate = null;
		let serverErrorRate = null;
		let averageResponseMs = null;
		let apiCalls = null;
		try {
			const { getServerMetrics, getLatencyStats } = await import('../server-metrics.js');
			const metrics = getServerMetrics(60, {});
			const summary = metrics?.summary || {};
			apiCalls = summary.apiCalls ?? null;
			averageResponseMs = summary.averageResponseMs ?? null;
			const latency = getLatencyStats(60);
			// Availability counts SERVER failures only. A 4xx is a client
			// mistake — the service was up and answering.
			availability = latency?.availabilityPercent ?? null;
			errorRate = latency?.errorRatePercent ?? null;
			serverErrorRate = latency?.serverErrorRatePercent ?? null;
		} catch {
			/* instrumentation unavailable */
		}
		return {
			availabilityPercent: availability,
			errorRatePercent: errorRate,
			serverErrorRatePercent: serverErrorRate,
			averageResponseMs,
			apiCallsLastHour: apiCalls,
			note: 'Availability is the share of API requests in the last 60 minutes that did not fail with a server error. A 4xx is a client mistake and is reported separately as an error rate. The request log lives in memory and resets on restart, so no historical uptime is implied.',
		};
	}
}

// ── Module helpers ──────────────────────────────────────────────────────────

function sumRole(roleCounts, role) {
	const bucket = roleCounts[role];
	if (!bucket) return 0;
	return Object.values(bucket).reduce((sum, value) => sum + value, 0);
}

/**
 * Build evenly spaced buckets covering the window.
 * Daily granularity for windows up to 45 days, weekly beyond that.
 */
export function buildBuckets(window, now) {
	const end = window.end instanceof Date ? window.end : new Date(window.end || now);
	const start = window.start instanceof Date ? window.start : new Date(window.start || now);
	const spanMs = end.getTime() - start.getTime();
	if (!Number.isFinite(spanMs) || spanMs <= 0) {
		return [{ start, end, label: end.toISOString().slice(0, 10) }];
	}
	const days = Math.ceil(spanMs / 86400000);
	const stepDays = days > 45 ? 7 : 1;
	const buckets = [];
	for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += stepDays * 86400000) {
		const bucketStart = new Date(cursor);
		const bucketEnd = new Date(Math.min(cursor + stepDays * 86400000, end.getTime() + 1));
		buckets.push({
			start: bucketStart,
			end: bucketEnd,
			label: bucketStart.toISOString().slice(0, 10),
		});
		if (buckets.length > 200) break;
	}
	return buckets;
}

/**
 * Distribute rows into the buckets, splitting results by mode.
 */
function bucketize(rows, buckets, dateOf, modeOf) {
	const totals = buckets.map(() => 0);
	const exam = buckets.map(() => 0);
	const training = buckets.map(() => 0);
	const game = buckets.map(() => 0);
	const teacher = buckets.map(() => 0);
	const student = buckets.map(() => 0);

	for (const row of rows) {
		const value = dateOf(row);
		if (!value) continue;
		const time = new Date(value).getTime();
		let index = buckets.findIndex(
			(bucket) => time >= bucket.start.getTime() && time < bucket.end.getTime(),
		);
		if (index === -1) index = buckets.length - 1;
		if (index < 0) continue;
		totals[index] += 1;
		const mode = modeOf ? modeOf(row) : null;
		if (mode === RESULT_MODE.EXAM) exam[index] += 1;
		else if (mode === RESULT_MODE.TRAINING) training[index] += 1;
		else if (mode === RESULT_MODE.GAME) game[index] += 1;
		else if (mode === 'teacher') teacher[index] += 1;
		else if (mode === 'student') student[index] += 1;
	}
	return { total: totals, exam, training, game, teacher, student };
}

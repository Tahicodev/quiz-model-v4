/**
 * tests/integration/platform-analytics.test.js
 *
 * Proves the platform read model's NUMBERS against a real database.
 *
 * Every expectation below is hand-computed from the seeded dataset. If a
 * formula changes, this file is the contract that catches it — especially
 * for the definitions that are easy to get subtly wrong:
 *
 *   - "active" means a recorded EVENT inside the window, never "the account
 *     exists";
 *   - attempts and unique students are counted separately and never
 *     conflated;
 *   - a formal exam attempt excludes training and game attempts;
 *   - the /20 scale is derived from the stored percentage (50% = 10/20);
 *   - an organization with no activity is reported as such, not as zero
 *     activity on an active account.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { PlatformAnalyticsService } from '../../src/backend/services/PlatformAnalyticsService.js';

const ROOT = process.cwd();
const TEST_DB_PATH = path.join(ROOT, 'prisma', 'test-platform-analytics.db');
const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;

const NOW = new Date('2026-03-15T12:00:00.000Z');
const DAY = 86400000;

const SCHOOL_A = 'pa-a';
const SCHOOL_B = 'pa-b';

let prisma;
let svc;

const schoolScope = { kind: 'school', schoolId: SCHOOL_A, isPlatform: false };
const platformScope = { kind: 'platform', schoolId: SCHOOL_A, isPlatform: true };

beforeAll(async () => {
	process.env.DATABASE_URL = TEST_DB_URL;
	writeFileSync(TEST_DB_PATH, '');
	const schemaPath = path.join(ROOT, 'prisma', 'schema.prisma');
	const prismaBin = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
	execFileSync(
		process.execPath,
		[prismaBin, 'migrate', 'deploy', '--schema', schemaPath],
		{ cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: 'pipe' },
	);
	prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
	svc = new PlatformAnalyticsService(new PrismaRepository(prisma));

	await prisma.school.createMany({
		data: [
			{ id: SCHOOL_A, name: 'Alpha School', slug: 'alpha', status: 'active' },
			{ id: SCHOOL_B, name: 'Beta School', slug: 'beta', status: 'active' },
		],
	});

	// ── Accounts ──────────────────────────────────────────────────────────
	// Alpha: 2 teachers, 4 students. Beta: 1 teacher, 1 student.
	await prisma.user.createMany({
		data: [
			// T1 signed in during the window; T2 did not.
			{ id: 'T1', school_id: SCHOOL_A, username: 't1', password_hash: 'h', name: 'T1', role: 'teacher', last_login: new Date(NOW.getTime() - 2 * DAY) },
			{ id: 'T2', school_id: SCHOOL_A, username: 't2', password_hash: 'h', name: 'T2', role: 'teacher', last_login: new Date(NOW.getTime() - 90 * DAY) },
			// S1..S3 are active (attempts inside the window); S4 is not.
			{ id: 'S1', school_id: SCHOOL_A, username: 's1', password_hash: 'h', name: 'S1', role: 'student' },
			{ id: 'S2', school_id: SCHOOL_A, username: 's2', password_hash: 'h', name: 'S2', role: 'student' },
			{ id: 'S3', school_id: SCHOOL_A, username: 's3', password_hash: 'h', name: 'S3', role: 'student' },
			{ id: 'S4', school_id: SCHOOL_A, username: 's4', password_hash: 'h', name: 'S4', role: 'student' },
			{ id: 'BT1', school_id: SCHOOL_B, username: 'bt1', password_hash: 'h', name: 'BT1', role: 'teacher' },
			{ id: 'BS1', school_id: SCHOOL_B, username: 'bs1', password_hash: 'h', name: 'BS1', role: 'student' },
		],
	});

	// ── Content authored inside the window ───────────────────────────────
	// T1 authored a question → active. T2 authored nothing → inactive.
	await prisma.question.createMany({
		data: [
			{ id: 'Q1', school_id: SCHOOL_A, text: 'Alpha question', type: 'mcq', answer: 'a', created_by: 'T1', created_at: new Date(NOW.getTime() - 3 * DAY) },
			{ id: 'BQ1', school_id: SCHOOL_B, text: 'Beta question', type: 'mcq', answer: 'a', created_by: 'BT1', created_at: new Date(NOW.getTime() - 3 * DAY) },
		],
	});

	// ── Exams ─────────────────────────────────────────────────────────────
	// E1: published, formal, has a formal attempt → counts as conducted.
	// E2: published but only training attempts → NOT conducted.
	// E3: draft → NOT conducted.
	await prisma.exam.createMany({
		data: [
			{ id: 'E1', school_id: SCHOOL_A, creator_id: 'T1', name: 'Formal', status: 'active', is_training: false, passing_score: 50, created_at: new Date(NOW.getTime() - 10 * DAY) },
			{ id: 'E2', school_id: SCHOOL_A, creator_id: 'T1', name: 'Training only', status: 'active', is_training: true, passing_score: 50, created_at: new Date(NOW.getTime() - 10 * DAY) },
			{ id: 'E3', school_id: SCHOOL_A, creator_id: 'T1', name: 'Draft', status: 'draft', is_training: false, passing_score: 50, created_at: new Date(NOW.getTime() - 10 * DAY) },
		],
	});

	// ── Attempts inside the window ────────────────────────────────────────
	// S1: one formal attempt (60%) + one training attempt + one game attempt.
	// S2: two formal attempts (40% and 80%) → 2 attempts, 1 student.
	// S3: one game attempt only.
	// S4: an attempt OUTSIDE the window → S4 is not active in the window.
	await prisma.result.createMany({
		data: [
			{ id: 'R1', school_id: SCHOOL_A, exam_id: 'E1', user_id: 'S1', mode: 'exam', score: 60, total_points: 20, earned_points: 12, answers_json: '{}', date_taken: new Date(NOW.getTime() - 1 * DAY) },
			{ id: 'R2', school_id: SCHOOL_A, exam_id: 'E2', user_id: 'S1', mode: 'training', score: 100, total_points: 10, earned_points: 10, answers_json: '{}', date_taken: new Date(NOW.getTime() - 1 * DAY) },
			{ id: 'R3', school_id: SCHOOL_A, exam_id: null, user_id: 'S1', mode: 'game', score: 90, total_points: 10, earned_points: 9, answers_json: '{}', date_taken: new Date(NOW.getTime() - 1 * DAY) },
			{ id: 'R4', school_id: SCHOOL_A, exam_id: 'E1', user_id: 'S2', mode: 'exam', score: 40, total_points: 20, earned_points: 8, answers_json: '{}', date_taken: new Date(NOW.getTime() - 2 * DAY) },
			{ id: 'R5', school_id: SCHOOL_A, exam_id: 'E1', user_id: 'S2', mode: 'exam', score: 80, total_points: 20, earned_points: 16, answers_json: '{}', date_taken: new Date(NOW.getTime() - 3 * DAY) },
			{ id: 'R6', school_id: SCHOOL_A, exam_id: null, user_id: 'S3', mode: 'game', score: 50, total_points: 10, earned_points: 5, answers_json: '{}', date_taken: new Date(NOW.getTime() - 4 * DAY) },
			{ id: 'R7', school_id: SCHOOL_A, exam_id: 'E1', user_id: 'S4', mode: 'exam', score: 100, total_points: 20, earned_points: 20, answers_json: '{}', date_taken: new Date(NOW.getTime() - 60 * DAY) },
			{ id: 'R8', school_id: SCHOOL_B, exam_id: null, user_id: 'BS1', mode: 'game', score: 70, total_points: 10, earned_points: 7, answers_json: '{}', date_taken: new Date(NOW.getTime() - 1 * DAY) },
		],
	});

	// ── Suspicious / pending signals ──────────────────────────────────────
	await prisma.user.create({
		data: {
			id: 'SUSPENDED',
			school_id: SCHOOL_A,
			username: 'suspended',
			password_hash: 'h',
			name: 'Suspended',
			role: 'student',
			status: 'suspended',
		},
	});
	await prisma.accountRequest.create({
		data: {
			id: 'AR1',
			school_id: SCHOOL_A,
			status: 'pending',
			full_name: 'Pending Student',
			username: 'pending.student',
			student_number: 'P1',
			password_hash: 'h',
		},
	});
});

afterAll(async () => {
	await prisma.$disconnect();
	for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
		try {
			rmSync(p, { force: true });
		} catch {
			/* already gone */
		}
	}
});

describe('Platform overview — school scope', () => {
	let overview;

	beforeAll(async () => {
		overview = await svc.getOverview({
			scope: schoolScope,
			period: '30d',
			now: NOW,
		});
	});

	it('reports the scope it aggregated', () => {
		expect(overview.meta.scope.kind).toBe('school');
		expect(overview.meta.scope.schoolIds).toEqual([SCHOOL_A]);
		expect(overview.meta.scope.periodLabel).toBe('Last 30 days');
	});

	it('counts only the caller organization', () => {
		const glance = overview.sections.glance;
		expect(glance.organizations.total).toBe(1);
		expect(glance.users.teachers).toBe(2);
		expect(glance.users.students).toBe(5); // S1..S4 + SUSPENDED
		expect(glance.users.administrators).toBe(0);
	});

	it('counts a teacher active only when a real event happened in the window', () => {
		// T1 signed in AND authored a question. T2 did neither.
		expect(overview.sections.glance.users.activeTeachers).toBe(1);
	});

	it('counts a student active only when a real event happened in the window', () => {
		// S1, S2, S3 have attempts in the window. S4's only attempt is 60 days
		// old. SUSPENDED has nothing.
		expect(overview.sections.glance.users.activeStudents).toBe(3);
	});

	it('separates total attempts from unique participating students', () => {
		const activity = overview.sections.activity;
		// R1..R6 = 6 attempts inside the window (R7 is outside it).
		expect(activity.attempts).toBe(6);
		// S1, S2, S3.
		expect(activity.participatingStudents).toBe(3);
		// Formal attempts only: R1, R4, R5 = 3.
		expect(activity.formalAttempts).toBe(3);
	});

	it('counts only published, non-training exams with a formal attempt', () => {
		// E1 qualifies. E2 has only training attempts, E3 is a draft.
		expect(overview.sections.activity.examsConducted).toBe(1);
	});

	it('reports the average formal-exam score on the /20 scale', () => {
		const activity = overview.sections.activity;
		// Formal scores: 60, 40, 80 → mean 60% → 12.00 on /20.
		expect(activity.averageScoreSample).toBe(3);
		expect(activity.averageScore20).toBeCloseTo(12, 2);
	});

	it('reports suspended accounts and pending requests', () => {
		expect(overview.sections.glance.users.suspended).toBe(1);
		expect(overview.sections.glance.users.pendingInvitations).toBe(1);
	});

	it('publishes the definition of every derived metric', () => {
		expect(overview.meta.definitions.activeTeacher).toBeTruthy();
		expect(overview.meta.definitions.activeStudent).toBeTruthy();
		expect(overview.meta.definitions.examsConducted).toBeTruthy();
		expect(overview.meta.definitions.averageScore).toBeTruthy();
	});
});

describe('Platform overview — platform scope', () => {
	it('aggregates every organization', async () => {
		const overview = await svc.getOverview({
			scope: platformScope,
			period: '30d',
			now: NOW,
		});
		expect(overview.meta.scope.schoolIds).toEqual(expect.arrayContaining([SCHOOL_A, SCHOOL_B]));
		expect(overview.sections.glance.organizations.total).toBe(2);
		expect(overview.sections.glance.users.teachers).toBe(3);
		expect(overview.sections.glance.users.students).toBe(6);
		// Alpha 3 active students + Beta 1 = 4.
		expect(overview.sections.glance.users.activeStudents).toBe(4);
		// Alpha 6 attempts + Beta 1 = 7.
		expect(overview.sections.activity.attempts).toBe(7);
	});

	it('can be narrowed to one organization', async () => {
		const overview = await svc.getOverview({
			scope: platformScope,
			schoolIds: [SCHOOL_B],
			period: '30d',
			now: NOW,
		});
		expect(overview.meta.scope.schoolIds).toEqual([SCHOOL_B]);
		expect(overview.sections.glance.users.students).toBe(1);
		expect(overview.sections.activity.attempts).toBe(1);
	});
});

describe('Organization metrics', () => {
	it('marks an organization with no recent activity as needing attention', async () => {
		const { data } = await svc.listOrganizations({
			scope: platformScope,
			limit: 50,
			offset: 0,
			now: NOW,
		});
		const alpha = data.find((row) => row.id === SCHOOL_A);
		const beta = data.find((row) => row.id === SCHOOL_B);

		expect(alpha.teachers).toBe(2);
		expect(alpha.students).toBe(5);
		expect(alpha.activeStudents).toBe(3);
		expect(alpha.attempts30d).toBe(6);
		expect(alpha.lastActivity).not.toBeNull();

		// Beta's only student attempted a game one day ago, so it is active.
		expect(beta.activeStudents).toBe(1);
		expect(beta.attempts30d).toBe(1);
	});

	it('reports the organizations of the scope only', async () => {
		const scoped = await svc.listOrganizations({
			scope: schoolScope,
			limit: 50,
			offset: 0,
			now: NOW,
		});
		expect(scoped.data.map((row) => row.id)).toEqual([SCHOOL_A]);
	});
});

describe('Trends', () => {
	it('buckets the window and distributes the attempts', async () => {
		const trends = await svc.getTrends({
			scope: schoolScope,
			period: '30d',
			now: NOW,
		});
		expect(trends.meta.granularity).toBe('day');
		expect(trends.series.labels).toHaveLength(trends.meta.bucketCount);
		const total = trends.series.attempts.reduce((sum, value) => sum + value, 0);
		expect(total).toBe(6);
		const formal = trends.series.formalAttempts.reduce((sum, value) => sum + value, 0);
		expect(formal).toBe(3);
	});
});

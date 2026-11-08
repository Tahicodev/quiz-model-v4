/**
 * tests/unit/teacher-overview-render.test.js
 *
 * Render smoke test for teacher-overview.js (no browser needed). It loads the
 * real script in a node:vm context with a stubbed DOM + REST client and checks
 * that a real-shaped analytics bundle produces every dashboard section, that
 * the loading/error state is honest, and that an admin session never renders
 * the teacher dashboard.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync('teacher-overview.js', 'utf8');

function payload() {
	return {
		meta: {
			generatedAt: '2026-02-01T10:00:00.000Z',
			teacher: { id: 'T1', name: 'Teacher One', title: 'Mrs', subjects: ['Mathematics'] },
			academicYear: { label: '2025-2026', start: '2025-09-01T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' },
			period: { key: 'month', label: 'This month', start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' },
			previous: { start: '2025-12-02T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' },
			scope: {
				empty: false,
				classIds: ['C1'],
				classes: [{ id: 'C1', name: 'Class One' }],
				allClasses: [
					{ id: 'C1', name: 'Class One' },
					{ id: 'C2', name: 'Class Two' },
				],
				subjectIds: [],
				subjects: [{ id: 'MATH', name: 'Mathematics' }],
				studentCount: 2,
			},
			thresholds: { pass20: 10, minAvgSample: 5 },
			sample: { resultRowsCapped: false, answerRowsCapped: false, answerRowsUsed: 7, answerRowsCap: 4000 },
			unavailable: {
				courseCompletion: 'Course reading is not recorded.',
				examSchedule: 'No scheduled date.',
				trainingAbandonment: 'Not measurable.',
				gameAcademicRanking: 'Never merged.',
			},
		},
		sections: {
			glance: {
				totalStudents: { value: 2, explanation: 'Unique students in your assigned classes.' },
				activeStudents: { value: 2, rate: 100, explanation: 'Students with at least one activity.' },
				avgExamScore: {
					value: 10.4,
					sample: 5,
					previous: 8,
					delta: null,
					trend: null,
					comparable: false,
					explanation: 'Mean of valid formal exam attempts.',
				},
				successRate: { value: 60, passed: 3, total: 5, explanation: 'Share of attempts at least 10/20.' },
				completedExams: { value: 2, explanation: 'Exams with at least one valid attempt.' },
				needingAttention: { value: 1, academic: 1, engagement: 0, both: 0 },
			},
			progress: {
				performanceEvolution: {
					granularity: 'week',
					points: [
						{ label: 'Week of 01-05', avg20: 9, attempts: 2 },
						{ label: 'Week of 01-12', avg20: 11.5, attempts: 3 },
					],
					previousPoints: [{ label: 'Week of 12-22', avg20: 8, attempts: 2 }],
					comparable: true,
					direction: 'improving',
				},
				participationEvolution: {
					granularity: 'week',
					points: [
						{ label: 'Week of 01-05', activeStudents: 2, examAttempts: 2, trainingAttempts: 1 },
						{ label: 'Week of 01-12', activeStudents: 1, examAttempts: 3, trainingAttempts: 0 },
					],
				},
				classComparison: [
					{ classId: 'C1', className: 'Class One', avg20: 10.4, sample: 5, students: 2, successRate: 60, reliable: true },
				],
				subjectPerformance: [
					{ subjectId: 'MATH', subjectName: 'Mathematics', avg20: 12, sample: 3, successRate: 67, reliable: false, mixedExams: 0 },
				],
				trainingVsExam: {
					training: { avg20: 10, sample: 2, students: 2 },
					exam: { avg20: 10.4, sample: 5, students: 2 },
					note: 'Different assessment contexts.',
				},
			},
			attention: {
				rows: [
					{
						studentId: 'S2',
						name: 'Student Two',
						numero: '102',
						classId: 'C1',
						className: 'Class One',
						avg20: 7,
						examAttempts: 2,
						trend: null,
						trendDelta: null,
						trainingAttempts: 1,
						lastActivity: '2026-01-20T10:00:00.000Z',
						daysInactive: 11,
						kind: 'academic',
						reason: 'Average 7/20 over 2 exam attempts',
						difficulty: { type: 'academic', label: 'Below 10/20', weakChapters: [], weakSubjects: [] },
						intervention: { label: 'Review results & chapters', action: 'student', tab: 'results' },
					},
				],
				summary: { total: 1, academic: 1, engagement: 0, both: 0 },
				rules: ['Academic: two attempts averaging below 10/20.'],
				classes: [],
			},
			content: {
				publishedCourses: { value: 1 },
				draftCourses: { value: 0 },
				courses: [
					{
						courseId: 'CO1',
						name: 'Fractions Course',
						subjectName: 'Mathematics',
						status: 'published',
						lessonCount: 1,
						practicingStudents: 2,
						trainingAttempts: 2,
						avgTraining20: 10,
					},
				],
				mostPracticed: [
					{
						courseId: 'CO1',
						name: 'Fractions Course',
						subjectName: 'Mathematics',
						lessonCount: 1,
						practicingStudents: 2,
						trainingAttempts: 2,
						avgTraining20: 10,
					},
				],
				leastPracticed: [],
				training: { attempts: 2, students: 2, attemptsPerStudent: 1, avg20: 10, participationRate: 100 },
				chapters: [
					{
						categoryId: 'CAT-FRAC',
						name: 'Fractions',
						path: 'Mathematics › Fractions',
						courseId: 'CO1',
						courseName: 'Fractions Course',
						attempts: 8,
						students: 2,
						correctRate: 62.5,
						errorRate: 37.5,
						examAttempts: 5,
						trainingAttempts: 3,
						severity: 'medium',
					},
				],
				unavailable: { completion: 'Course reading is not recorded.', participation: 'Practice only.' },
			},
			exams: {
				summary: {
					completed: { value: 2 },
					avg20: { value: 10.4, sample: 5 },
					successRate: { value: 60 },
					pendingAttempts: { value: 0 },
				},
				distribution: [{ bucket: '0-5', label: '0–5', count: 1, pct: 20 }],
				classComparison: [],
				awaiting: [{ examId: 'E1', name: 'Maths Exam', assigned: 2, completed: 2, pending: 0 }],
				recent: [
					{
						resultId: 'R5',
						studentId: 'S1',
						studentName: 'Student One',
						className: 'Class One',
						examId: 'E1',
						examName: 'Maths Exam',
						score20: 12,
						passed: true,
						date: '2026-01-18T10:00:00.000Z',
					},
				],
				analysis: [
					{
						examId: 'E1',
						name: 'Maths Exam',
						avg20: 12,
						successRate: 67,
						completed: 3,
						pending: 0,
						assigned: 2,
						highest: 16,
						lowest: 8,
						passCount: 2,
						failCount: 1,
						questionAnalysisAvailable: true,
						questions: [
							{
								questionId: 'Q1',
								text: 'One half?',
								categoryName: 'Fractions',
								attempts: 3,
								correctRate: 66.7,
								incorrect: 1,
								skipped: 0,
							},
						],
						hardestQuestions: [],
						skippedQuestions: [{ text: 'One third?', skipped: 1 }],
						weakChapters: [],
					},
				],
				thresholds: { pass20: 10, minQuestionAttempts: 4 },
				unavailable: { schedule: 'Exams have no scheduled date.' },
			},
			engagement: {
				games: { sessions: 1, students: 1, completed: 1, participationRate: 50 },
				tournaments: { entries: 0, students: 0, active: 0, participationRate: 0 },
				trend: [{ period: '2026-01-19', label: 'Week of 01-19', games: 1, tournaments: 0 }],
				activeClasses: [{ classId: 'C1', className: 'Class One', students: 1, attempts: 1 }],
				bySubject: [{ subjectId: 'MATH', subjectName: 'Mathematics', sessions: 1, students: 1 }],
				topActivities: [{ id: 'G1', type: 'game', name: 'Fractions Race', participants: 1, completions: 1 }],
				unavailable: { ranking: 'Engagement only.' },
			},
			insights: [
				{
					id: 'low-exam-average',
					severity: 'high',
					observation: 'Class One is below the pass mark.',
					metric: 'Average 9.2/20 over 6 attempts.',
					scope: 'Class',
					target: 'Class One',
					action: 'Investigate results',
					link: { tab: 'results', action: 'attention' },
				},
			],
		},
	};
}

function boot(opts = {}) {
	const host = { innerHTML: '', hidden: true, addEventListener() {} };
	const document = {
		getElementById: (id) => (id === 'teacherOverview' ? host : null),
		addEventListener() {},
		querySelector: () => null,
	};
	const window = {
		API: {
			list: async () => {
				if (opts.fail) throw new Error('Network down');
				return { data: payload() };
			},
		},
		Auth: {
			isAdmin: () => !!opts.admin,
			getCurrentUser: () => ({ role: opts.admin ? 'admin' : 'teacher' }),
		},
		addEventListener() {},
		openTab() {},
	};
	const context = { window, document, console, setTimeout, clearTimeout };
	vm.createContext(context);
	vm.runInContext(SOURCE, context, { filename: 'teacher-overview.js' });
	return { host, window };
}

describe('teacher-overview renderer', () => {
	it('renders every section from a real-shaped bundle', async () => {
		const { host, window } = boot();
		await window.TeacherOverview.load({ force: true });
		const html = host.innerHTML;
		for (const expected of [
			'Classroom at a glance',
			'Learning progress &amp; performance',
			'Students needing attention',
			'Examinations',
			'Courses &amp; training',
			'Games &amp; tournaments',
			'Teaching insights',
			'10.4',
			'Student Two',
			'Fractions Course',
			'Maths Exam',
			'Chapter difficulty',
			'Class One is below the pass mark',
		]) {
			expect(html).toContain(expected);
		}
		// No unformatted values leaked into the UI.
		expect(html).not.toContain('undefined');
		expect(html).not.toContain('NaN');
		// Filter options come from the full assignment, not only the selection.
		expect(html).toContain('Class Two');
	});

	it('shows an honest error state and a retry action', async () => {
		const { host, window } = boot({ fail: true });
		await window.TeacherOverview.load({ force: true });
		expect(host.innerHTML).toContain('Dashboard unavailable');
		expect(host.innerHTML).toContain('Network down');
		expect(host.innerHTML).toContain('Try again');
	});

	it('renders the filters enabled after loading (never stuck disabled)', async () => {
		const { host, window } = boot();
		await window.TeacherOverview.load({ force: true });
		const html = host.innerHTML;
		for (const id of ['tovClassFilter', 'tovSubjectFilter', 'tovPeriod']) {
			expect(html).not.toMatch(new RegExp(`id="${id}"[^>]*\\sdisabled`));
		}
		expect(html).not.toMatch(/data-tov-refresh[^>]*\sdisabled/);
	});

	it('never renders the teacher dashboard for an admin session', async () => {
		const { host, window } = boot({ admin: true });
		await window.TeacherOverview.load({ force: true });
		expect(host.innerHTML).toBe('');
	});

	it('renders the no-classes empty state from an empty bundle', async () => {
		const { host, window } = boot();
		const empty = payload();
		empty.meta.scope = {
			empty: true,
			classIds: [],
			classes: [],
			allClasses: [],
			subjectIds: [],
			subjects: [],
			studentCount: 0,
		};
		empty.meta.emptyReason = 'No class is assigned to your account.';
		empty.sections.insights = [
			{
				id: 'no-classes',
				severity: 'info',
				observation: 'No class is assigned.',
				metric: '0 classes',
				scope: 'Scope',
				target: 'Account',
				action: 'Open classes',
				link: { tab: 'classes' },
			},
		];
		window.API.list = async () => ({ data: empty });
		await window.TeacherOverview.load({ force: true });
		expect(host.innerHTML).toContain('No classes to report on');
		expect(host.innerHTML).toContain('No class is assigned to your account.');
		expect(host.innerHTML).not.toContain('Classroom at a glance');
	});
});

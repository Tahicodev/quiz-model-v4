/**
 * tests/unit/teacher-overview-render.test.js
 *
 * Render smoke test for the charts-only teacher Overview (no browser needed).
 * It loads the real chart kit and dashboard script in a node:vm context with a
 * stubbed DOM + REST client and checks that a real-shaped analytics bundle
 * produces every analytics section, that loading/error states stay honest,
 * and that an admin session never renders the teacher dashboard.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ANALYTICS = readFileSync('teacher-analytics.js', 'utf8');
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
				assessedStudents: { value: 2, total: 2, rate: 100 },
				certifiedStudents: { value: 1, total: 2, rate: 50 },
				failedExamStudents: { value: 1, total: 2 },
				neverAssessedStudents: { value: 0, total: 2 },
				notCertifiedStudents: { value: 1, total: 2, rate: 50, failed: 1, neverAssessed: 0 },
				certificationRate: { value: 50, passed: 1, total: 2 },
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
					change: 2.5,
				},
				participationEvolution: {
					granularity: 'week',
					points: [
						{ label: 'Week of 01-05', activeStudents: 2, examAttempts: 2, trainingAttempts: 1 },
						{ label: 'Week of 01-12', activeStudents: 1, examAttempts: 3, trainingAttempts: 0 },
					],
				},
				classComparison: [
					{
						classId: 'C1',
						className: 'Class One',
						avg20: 10.4,
						sample: 5,
						students: 2,
						successRate: 60,
						reliable: true,
						passCount: 3,
						failCount: 2,
						studentsAbove10: 1,
						studentsBelow10: 1,
						attention: { total: 1, academic: 1, engagement: 0, both: 0 },
					},
				],
				bestClass: {
					classId: 'C1',
					className: 'Class One',
					avg20: 10.4,
					sample: 5,
					reliable: true,
				},
				weekComparison: {
					label: 'Last 7 days',
					start: '2026-01-26T00:00:00.000Z',
					end: '2026-02-01T10:00:00.000Z',
					classes: [{ classId: 'C1', className: 'Class One', avg20: 8, sample: 5, reliable: true }],
					best: { classId: 'C1', className: 'Class One', avg20: 8, sample: 5, reliable: true },
					weakest: { classId: 'C1', className: 'Class One', avg20: 8, sample: 5, reliable: true },
					note: 'Ranked on formal exam attempts recorded in the last 7 days.',
				},
				attentionByClass: [
					{ classId: 'C1', className: 'Class One', total: 1, academic: 1, engagement: 0, both: 0 },
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
				summary: { total: 1, academic: 1, engagement: 0, both: 0, shown: 1 },
				byClass: [{ classId: 'C1', className: 'Class One', total: 1, academic: 1, engagement: 0, both: 0 }],
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
					avg20: { value: 10.4, sample: 5, scale: 20 },
					successRate: { value: 60, passed: 3, total: 5 },
					awaitingCount: { value: 1 },
					pendingAttempts: { value: 0 },
				},
				distribution: [
					{ bucket: '0-5', label: '0–5', count: 1, pct: 20 },
					{ bucket: '10-15', label: '10–15', count: 4, pct: 80 },
				],
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
			questions: {
				summary: {
					total: { value: 8 },
					examAssigned: { value: 5 },
					practised: { value: 6 },
					untouched: { value: 2 },
					struggling: { value: 1 },
					strong: { value: 4 },
					createdInPeriod: { value: 8 },
				},
				typeMix: [{ key: 'mcq', count: 6, pct: 75 }],
				difficultyMix: [{ key: 'medium', count: 8, pct: 100 }],
				bySubject: [{ subjectId: 'MATH', subjectName: 'Mathematics', count: 8, practised: 6, struggling: 1 }],
				byChapter: [],
				coverage: {
					total: 8,
					categorised: 7,
					uncategorised: 1,
					examAssigned: 5,
					practised: 6,
					untouched: 2,
					assignmentRate: 62.5,
					practiceRate: 75,
				},
				performance: [],
				hardestQuestions: [
					{ questionId: 'Q1', text: 'One half?', attempts: 4, correctRate: 25, subjectName: 'Mathematics' },
				],
				strongestQuestions: [],
				thresholds: { minAttempts: 4, passPercent: 50, strongPercent: 75 },
				unavailable: { difficulty: 'Observed only.' },
			},
			insights: [
				{
					id: 'low-exam-average',
					domain: 'results',
					severity: 'high',
					observation: 'Class One is below the pass mark.',
					metric: 'Average 9.2/20 over 6 attempts.',
					scope: 'Class',
					target: 'Class One',
					action: 'Investigate results',
					link: { tab: 'results', action: 'attention' },
				},
				{
					id: 'exam-improvement',
					domain: 'overview',
					severity: 'positive',
					observation: 'Average examination results improved.',
					metric: '+2.4 points (/20).',
					scope: 'All classes',
					target: 'Performance evolution',
					action: 'See evolution',
					link: { tab: 'overview', action: 'progress' },
				},
			],
		},
	};
}

function presencePayload() {
	return {
		generatedAt: '2026-02-01T10:00:00.000Z',
		studentsOnline: 2,
		classesOnline: 1,
		totalClasses: 2,
		totalStudents: 2,
		onlineRate: 100,
		byClass: [{ classId: 'C1', className: 'Class One', online: 2, total: 2 }],
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
			list: async (path) => {
				if (opts.fail) throw new Error('Network down');
				if (String(path).includes('presence')) {
					return { data: opts.noPresence ? null : presencePayload() };
				}
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
	vm.runInContext(ANALYTICS, context, { filename: 'teacher-analytics.js' });
	vm.runInContext(SOURCE, context, { filename: 'teacher-overview.js' });
	return { host, window };
}

describe('teacher-overview renderer', () => {
	it('renders every analytics section from a real-shaped bundle', async () => {
		const { host, window } = boot();
		await window.TeacherOverview.load({ force: true });
		const html = host.innerHTML;
		for (const expected of [
			'Live classroom pulse',
			'Emergency decisions',
			'Class comparison',
			'Learning insights',
			'Courses &amp; subjects insights',
			'Questions insights',
			'Score distribution',
			'Educational engagement',
			'Educational insights',
			'Classes online',
			'Students needing attention',
			'Remaining students not passing',
			'Best-ranked class',
			'Weakest class this week',
			'Chapter difficulty',
			'Class One is below the pass mark',
			'Fractions Course',
			'10.4',
		]) {
			expect(html).toContain(expected);
		}
		// The KPI cards show live presence when the endpoint answers.
		expect(html).toContain('1 / 2');
		// Chart primitives are inline SVG; no chart library is required.
		expect(html).toContain('<svg');
		expect(html).toContain('role="img"');
		// No unformatted values leaked into the UI.
		expect(html).not.toContain('undefined');
		expect(html).not.toContain('NaN');
		// Filter options come from the full assignment, not only the selection.
		expect(html).toContain('Class Two');
	});

	it('keeps the dashboard usable when live presence is unavailable', async () => {
		const { host, window } = boot({ noPresence: true });
		await window.TeacherOverview.load({ force: true });
		expect(host.innerHTML).toContain('Live presence is unavailable');
		expect(host.innerHTML).toContain('Live classroom pulse');
		expect(host.innerHTML).not.toContain('undefined');
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
				domain: 'classes',
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
		expect(host.innerHTML).not.toContain('Live classroom pulse');
	});
});

/**
 * tests/unit/teacher-domain-analytics.test.js
 *
 * Render smoke test for the per-tab teacher analytics panels. Every teacher
 * tab must show KPIs and insights about its own domain only, and the
 * intervention list must live in Results now that Overview is charts-only.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ANALYTICS = readFileSync('teacher-analytics.js', 'utf8');
const SOURCE = readFileSync('teacher-domain-analytics.js', 'utf8');

function payload() {
	return {
		meta: {
			generatedAt: '2026-02-01T10:00:00.000Z',
			period: { key: 'month', label: 'This month', start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' },
			scope: {
				empty: false,
				classIds: ['C1'],
				allClasses: [{ id: 'C1', name: 'Class One' }],
				classes: [{ id: 'C1', name: 'Class One' }],
				subjects: [{ id: 'MATH', name: 'Mathematics' }],
				studentCount: 2,
			},
		},
		sections: {
			glance: {
				totalStudents: { value: 2 },
				activeStudents: { value: 2, rate: 100 },
				needingAttention: { value: 1, academic: 1, engagement: 0, both: 0 },
				assessedStudents: { value: 2, total: 2, rate: 100 },
				certifiedStudents: { value: 1, total: 2, rate: 50 },
				failedExamStudents: { value: 1, total: 2 },
				neverAssessedStudents: { value: 0, total: 2 },
				notCertifiedStudents: { value: 1, total: 2, rate: 50, failed: 1, neverAssessed: 0 },
				certificationRate: { value: 50, passed: 1, total: 2 },
			},
			progress: {
				performanceEvolution: {
					granularity: 'week',
					points: [
						{ label: 'W1', avg20: 9 },
						{ label: 'W2', avg20: 11 },
					],
					previousPoints: [],
					comparable: false,
					direction: 'improving',
					change: 2,
				},
				participationEvolution: {
					granularity: 'week',
					points: [{ label: 'W1', examAttempts: 2, trainingAttempts: 1, activeStudents: 2 }],
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
						studentsAbove10: 1,
						studentsBelow10: 1,
					},
				],
				bestClass: { classId: 'C1', className: 'Class One', avg20: 10.4, sample: 5, reliable: true },
				weekComparison: {
					weakest: { classId: 'C1', className: 'Class One', avg20: 8, sample: 5, reliable: true },
				},
				attentionByClass: [{ classId: 'C1', className: 'Class One', total: 1, academic: 1, engagement: 0, both: 0 }],
				subjectPerformance: [
					{ subjectId: 'MATH', subjectName: 'Mathematics', avg20: 12, sample: 3, successRate: 67, reliable: false },
				],
				trainingVsExam: {
					training: { avg20: 10, sample: 2, students: 2 },
					exam: { avg20: 10.4, sample: 5, students: 2 },
					note: 'Different contexts.',
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
						lastActivity: '2026-01-20T10:00:00.000Z',
						kind: 'academic',
						reason: 'Average 7/20 over 2 exam attempts',
						difficulty: { label: 'Below 10/20', weakChapters: [] },
						intervention: { label: 'Review results & chapters' },
					},
				],
				summary: { total: 1, academic: 1, engagement: 0, both: 0, shown: 1 },
				byClass: [{ classId: 'C1', className: 'Class One', total: 1, academic: 1, engagement: 0, both: 0 }],
			},
			content: {
				publishedCourses: { value: 1 },
				draftCourses: { value: 0 },
				training: { attempts: 2, students: 2, attemptsPerStudent: 1, avg20: 10, participationRate: 100 },
				mostPracticed: [{ courseId: 'CO1', name: 'Fractions Course', practicingStudents: 2 }],
				leastPracticed: [],
				chapters: [
					{ categoryId: 'CAT1', name: 'Fractions', errorRate: 60, correctRate: 40, severity: 'high' },
				],
			},
			exams: {
				summary: {
					completed: { value: 2 },
					avg20: { value: 10.4, sample: 5 },
					successRate: { value: 60, passed: 3, total: 5 },
					awaitingCount: { value: 1 },
					pendingAttempts: { value: 3 },
				},
				distribution: [{ bucket: '0-5', label: '0–5', count: 1, pct: 20 }],
				classComparison: [
					{ classId: 'C1', className: 'Class One', avg20: 10.4, sample: 5, reliable: true },
				],
				awaiting: [{ examId: 'E1', name: 'Maths Exam', assigned: 2, completed: 0, pending: 2 }],
			},
			engagement: {
				games: { sessions: 3, students: 2, completed: 2, participationRate: 100 },
				tournaments: { entries: 1, students: 1, active: 1, participationRate: 50 },
				trend: [{ label: 'W1', games: 3, tournaments: 1 }],
				activeClasses: [{ classId: 'C1', className: 'Class One', students: 2, attempts: 4 }],
				topActivities: [{ id: 'G1', type: 'game', name: 'Fractions Race', participants: 2, completions: 2 }],
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
				},
				typeMix: [{ key: 'mcq', count: 6, pct: 75 }],
				difficultyMix: [{ key: 'medium', count: 8, pct: 100 }],
				bySubject: [{ subjectId: 'MATH', subjectName: 'Mathematics', count: 8 }],
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
				hardestQuestions: [{ questionId: 'Q1', text: 'One half?', attempts: 4, correctRate: 25 }],
				thresholds: { minAttempts: 4, passPercent: 50, strongPercent: 75 },
			},
			insights: [
				{ id: 'q1', domain: 'questions', severity: 'info', observation: 'Questions insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'questions' } },
				{ id: 'c1', domain: 'subjects', severity: 'medium', observation: 'Courses insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'subjects' } },
				{ id: 'e1', domain: 'exams', severity: 'medium', observation: 'Exams insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'exams' } },
				{ id: 'k1', domain: 'classes', severity: 'high', observation: 'Classes insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'classes' } },
				{ id: 'r1', domain: 'results', severity: 'high', observation: 'Results insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'results' } },
				{ id: 'g1', domain: 'games', severity: 'positive', observation: 'Games insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'games' } },
				{ id: 'o1', domain: 'overview', severity: 'positive', observation: 'Overview insight.', metric: 'm', scope: 's', target: 't', action: 'Open', link: { tab: 'overview' } },
			],
		},
	};
}

function presencePayload() {
	return {
		generatedAt: '2026-02-01T10:00:00.000Z',
		studentsOnline: 2,
		classesOnline: 1,
		totalClasses: 1,
		totalStudents: 2,
		onlineRate: 100,
		byClass: [],
	};
}

function boot(opts = {}) {
	const hosts = {};
	const makeHost = () => ({
		innerHTML: '',
		hidden: true,
		__tdaLinks: [],
		addEventListener() {},
	});
	for (const id of [
		'questionsAnalytics',
		'subjectsAnalytics',
		'examsAnalytics',
		'classesAnalytics',
		'resultsAnalytics',
		'gamesAnalytics',
	]) {
		hosts[id] = makeHost();
	}
	const document = {
		getElementById: (id) => hosts[id] || null,
		addEventListener() {},
		body: { contains: () => true },
	};
	const window = {
		API: {
			list: async (path) => {
				if (String(path).includes('presence')) return { data: presencePayload() };
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
	vm.runInContext(SOURCE, context, { filename: 'teacher-domain-analytics.js' });
	return { hosts, window };
}

describe('teacher domain analytics', () => {
	it('renders question-domain KPIs and insights in the Questions tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('questions', true);
		const html = hosts.questionsAnalytics.innerHTML;
		expect(html).toContain('Questions analytics');
		expect(html).toContain('Questions in the bank');
		expect(html).toContain('Never used');
		expect(html).toContain('Question types');
		expect(html).toContain('Hardest questions');
		expect(html).toContain('Questions insight.');
		expect(html).not.toContain('Courses insight.');
		expect(html).not.toContain('undefined');
	});

	it('renders course-domain charts in the Subjects tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('subjects', true);
		const html = hosts.subjectsAnalytics.innerHTML;
		expect(html).toContain('Courses analytics');
		expect(html).toContain('Published courses');
		expect(html).toContain('Chapter difficulty');
		expect(html).toContain('Fractions Course');
		expect(html).toContain('Courses insight.');
		expect(html).not.toContain('Results insight.');
	});

	it('renders exam-domain results and pending work in the Exams tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('exams', true);
		const html = hosts.examsAnalytics.innerHTML;
		expect(html).toContain('Exams analytics');
		expect(html).toContain('Score distribution');
		expect(html).toContain('Maths Exam');
		expect(html).toContain('Exams insight.');
	});

	it('renders class comparison and presence in the Classes tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('classes', true);
		const html = hosts.classesAnalytics.innerHTML;
		expect(html).toContain('Classes analytics');
		expect(html).toContain('Best-ranked class');
		expect(html).toContain('Students above / below 10 out of 20');
		expect(html).toContain('1 / 1');
		expect(html).toContain('Classes insight.');
	});

	it('moves the intervention list into the Results tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('results', true);
		const html = hosts.resultsAnalytics.innerHTML;
		expect(html).toContain('Results analytics');
		expect(html).toContain('Intervention list');
		expect(html).toContain('Student Two');
		expect(html).toContain('Review results &amp; chapters');
		expect(html).toContain('Results insight.');
		expect(html).not.toContain('Questions insight.');
	});

	it('renders engagement charts in the Games tab', async () => {
		const { hosts, window } = boot();
		await window.TeacherDomainAnalytics.render('games', true);
		const html = hosts.gamesAnalytics.innerHTML;
		expect(html).toContain('Games analytics');
		expect(html).toContain('Fractions Race');
		expect(html).toContain('Engagement only.');
		expect(html).toContain('Games insight.');
	});

	it('never renders domain analytics for an admin session', async () => {
		const { hosts, window } = boot({ admin: true });
		await window.TeacherDomainAnalytics.render('results', true);
		expect(hosts.resultsAnalytics.innerHTML).toBe('');
		expect(hosts.resultsAnalytics.hidden).toBe(true);
	});
});

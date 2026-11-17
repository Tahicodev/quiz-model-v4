// @vitest-environment jsdom

/**
 * tests/unit/student-exam-refresh.test.js
 *
 * Regression guard for the "refresh re-opens a finished exam" bug.
 *
 * Reloading `student-workspace.html?examId=…` after the student already
 * submitted that exam used to launch a brand-new paper. The deep link must
 * now land on the recorded result instead of the question runner.
 *
 * The behaviour is driven through the real entry point
 * (`openExamFromQuery()` → `startExamModal()`), so the assertions are about
 * what the student actually sees.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STUDENT = {
	id: 'student-1',
	name: 'Alex Johnson',
	numero: 'STU-042',
	class: 'Class A',
	role: 'student',
	school_id: 'school-1',
};

const QUESTION_IDS = [
	'11111111-1111-4111-8111-111111111111',
	'22222222-2222-4222-8222-222222222222',
	'33333333-3333-4333-8333-333333333333',
];

function makeQuestion(index) {
	return {
		id: QUESTION_IDS[index],
		type: 'mcq',
		text: `Question ${index + 1}`,
		options: ['A', 'B', 'C', 'D'],
		correctAnswer: 'A',
		points: 1,
	};
}

function makeExam(overrides = {}) {
	return {
		id: 'exam-1',
		name: 'Système informatique',
		duration: 5,
		questions: QUESTION_IDS.slice(),
		...overrides,
	};
}

const TRAINING_MODAL_MARKUP = `
		<div id="studentTrainingModal" class="modal">
			<div class="training-modal-header">
				<div class="training-student-strip" id="trainingStudentStrip" aria-label="Student taking this attempt">
					<div class="training-student-avatar" id="trainingStudentAvatar" aria-hidden="true">S</div>
					<div class="training-student-meta">
						<span class="training-student-name" id="trainingStudentName">Student</span>
						<span class="training-student-class" id="trainingStudentClass">Class</span>
						<span class="training-student-title" id="trainingModalTitle">Training Practice Test</span>
					</div>
					<span class="training-student-mode" id="trainingStudentMode">Training</span>
				</div>
				<div class="training-header-meta">
					<button type="button" class="close-modal-btn" onclick="closeTrainingModal()">&times;</button>
				</div>
			<div class="training-context-meta" id="trainingContextMeta">
				<span class="training-context-item">
					<span class="training-context-label">Subject</span>
					<span class="training-context-value" id="trainingContextSubject">—</span>
				</span>
			</div>
		</div>
		<div class="training-progress-strip" id="trainingProgressStrip"></div>
		<div class="training-stage" id="studentTrainingStage"></div>
	</div>
`;

/** The rendered "Question N of M" badge — present only in the runner. */
function renderedTotal() {
	const badge = document.querySelector('.training-badge');
	if (!badge) return null;
	const match = /of\s+(\d+)/i.exec(badge.textContent);
	return match ? Number(match[1]) : null;
}

/** The heading of the results view shown for a completed exam. */
function renderedHeading() {
	const heading = document.querySelector('#studentTrainingStage .results-header h2');
	return heading ? heading.textContent.trim() : null;
}

describe('refreshing a completed exam deep link', () => {
	beforeEach(() => {
		document.body.innerHTML = TRAINING_MODAL_MARKUP;
		localStorage.clear();
		sessionStorage.clear();

		window.Auth = {
			getCurrentUser: () => ({ ...STUDENT }),
			isAuthenticated: () => true,
		};
		window.showToast = vi.fn();
		window.confirm = vi.fn(() => true);
		window.escapeHtml = (unsafe) =>
			String(unsafe ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		window.setInterval = () => 0;
		window.clearInterval = () => {};
	});

	afterEach(() => {
		vi.resetModules();
	});

	/** Seeds a completed attempt for `exam-1` in the local result mirror. */
	function seedCompletedAttempt() {
		localStorage.setItem(
			'examResults',
			JSON.stringify({
				'exam-1': {
					examId: 'exam-1',
					students: [
						{
							studentInfo: { numero: STUDENT.numero, class: STUDENT.class },
							score: 3,
							totalQuestions: 3,
							date: '2026-01-02T10:00:00.000Z',
						},
					],
				},
			}),
		);
	}

	async function openDeepLink({ exam = makeExam(), results = [] } = {}) {
		window.__DI_CONTAINER__ = {
			repo: {
				getAll_sync: (table) => {
					if (table === 'questions') return QUESTION_IDS.map((_, i) => makeQuestion(i));
					if (table === 'exams') return [exam];
					if (table === 'results') return results;
					return [];
				},
				setAll_sync: () => {},
			},
		};
		window.history.pushState({}, '', '/student-workspace.html?examId=exam-1');
		vi.resetModules();
		await import('../../student-workspace.js');
		document.dispatchEvent(new Event('DOMContentLoaded'));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	it('does not open the question runner for an exam already completed', async () => {
		seedCompletedAttempt();
		await openDeepLink();

		// The runner would render "Question 1 of 3"; the results view must not.
		expect(renderedTotal()).toBeNull();
	});

	it('shows the recorded result instead of the runner', async () => {
		seedCompletedAttempt();
		await openDeepLink();

		expect(renderedHeading()).toBe('Système informatique');
		const stage = document.getElementById('studentTrainingStage');
		expect(stage.textContent).toContain('already been completed');
	});

	it('still opens the runner when the exam has never been attempted', async () => {
		await openDeepLink();

		expect(renderedTotal()).toBe(3);
	});

	it('opens the runner when the attempt exists only in the server results', async () => {
		// The bootstrap delivers results after the page has loaded; the deep
		// link must wait for that authoritative state instead of guessing.
		await openDeepLink({
			results: [
				{
					id: 'exam-exam-1-student-1-1',
					examId: 'exam-1',
					userId: STUDENT.id,
					mode: 'exam',
					earnedPoints: 2,
					totalPoints: 3,
					attemptNumber: 1,
					dateTaken: '2026-01-02T10:00:00.000Z',
				},
			],
		});

		expect(renderedTotal()).toBeNull();
		expect(renderedHeading()).toBe('Système informatique');
	});

	it('offers another attempt only while the attempt budget allows it', async () => {
		seedCompletedAttempt();
		await openDeepLink({ exam: makeExam({ max_attempts: 1 }) });

		const stage = document.getElementById('studentTrainingStage');
		expect(stage.textContent).not.toContain('Start another attempt');
	});

	it('offers another attempt when the budget still has room', async () => {
		seedCompletedAttempt();
		await openDeepLink({ exam: makeExam({ max_attempts: 3 }) });

		const stage = document.getElementById('studentTrainingStage');
		expect(stage.textContent).toContain('Start another attempt');
	});

	it('opens the result when only the local completion marker exists', async () => {
		// The bridge writes a finished attempt straight to the server and leaves
		// the local `quizResults` mirror untouched, so a refresh taken before
		// the bootstrap lands would see nothing at all. The workspace's own
		// completion marker covers that window.
		localStorage.setItem(
			'quizCompletedExams',
			JSON.stringify({
				'exam-1': {
					examName: 'Système informatique',
					score: 2,
					totalQuestions: 3,
					timeSpent: 42,
					attemptNumber: 1,
					resultId: 'exam-exam-1-student-1-1',
					date: '2026-01-02T10:00:00.000Z',
				},
			}),
		);
		await openDeepLink();

		expect(renderedTotal()).toBeNull();
		expect(renderedHeading()).toBe('Système informatique');
	});
});

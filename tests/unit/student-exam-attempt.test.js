// @vitest-environment jsdom

/**
 * tests/unit/student-exam-attempt.test.js
 *
 * The student exam runner used to show more questions than the teacher had
 * assigned, ran on a one-hour timer regardless of the exam's duration, and
 * labelled the header with an "Attempt" chip whose value was the exam name.
 * It also blocked every retry, even when the exam allowed several attempts.
 *
 * The runner is a closure inside student-workspace.js, so these tests drive
 * it through its real entry points:
 *   - `?examId=...` in the URL → `openExamFromQuery()` → `startExamModal()`,
 *   - the persisted result store → the attempt guard,
 *   - the rendered training surface → the question count and the timer.
 *
 * The assertions are about the OBSERVABLE outcome (how many questions the
 * student sees, what the timer says, which chips exist), because that is
 * what the bug report was about.
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
	'44444444-4444-4444-8444-444444444444',
	'55555555-5555-4555-8555-555555555555',
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

/** The exam the teacher pushed: 5 questions, a 5-minute duration. */
function makeExam(overrides = {}) {
	return {
		id: 'exam-1',
		name: 'Système informatique',
		duration: 5,
		max_attempts: 2,
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

/** The rendered "Question N of M" badge — M is the assigned question count. */
function renderedTotal() {
	const badge = document.querySelector('.training-badge');
	if (!badge) return null;
	const match = /of\s+(\d+)/i.exec(badge.textContent);
	return match ? Number(match[1]) : null;
}

/** The remaining-time readout in the progress strip. */
function renderedRemainingTime() {
	const text = document.getElementById('trainingStripTimerText');
	return text ? text.textContent.trim() : null;
}

describe('student exam attempt', () => {
	let history;

	beforeEach(async () => {
		document.body.innerHTML = TRAINING_MODAL_MARKUP;
		localStorage.clear();
		sessionStorage.clear();

		window.Auth = {
			getCurrentUser: () => ({ ...STUDENT }),
			isAuthenticated: () => true,
		};
		window.__DI_CONTAINER__ = {
			repo: {
				getAll_sync: (table) => {
					if (table === 'questions') return QUESTION_IDS.map((_, i) => makeQuestion(i));
					if (table === 'exams') return [makeExam()];
					return [];
				},
				setAll_sync: () => {},
			},
		};
		window.showToast = vi.fn();
		window.confirm = vi.fn(() => true);
		// utils.js declares escapeHtml in module scope; in the browser every
		// classic script shares one global scope, so the workspace finds it
		// there. Under the module loader it has to be installed explicitly.
		window.escapeHtml = (unsafe) => {
			if (!unsafe) return '';
			return String(unsafe)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		};
		// The runner renders into the DOM and starts an interval timer; the
		// test never advances the clock.
		window.setInterval = () => 0;
		window.clearInterval = () => {};

		history = window.history;
	});

	afterEach(() => {
		vi.resetModules();
	});

	/** Loads the workspace with `?examId=exam-1` in the URL. */
	async function openExam(exam = makeExam()) {
		window.__DI_CONTAINER__.repo.getAll_sync = (table) => {
			if (table === 'questions') return QUESTION_IDS.map((_, i) => makeQuestion(i));
			if (table === 'exams') return [exam];
			return [];
		};
		// The runner is opened from the deep link the exam card links to.
		window.history.pushState({}, '', '/student-workspace.html?examId=exam-1');
		vi.resetModules();
		await import('../../student-workspace.js');
		document.dispatchEvent(new Event('DOMContentLoaded'));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	it('shows exactly the questions the teacher assigned', async () => {
		await openExam(makeExam({ questions: QUESTION_IDS.slice(0, 5) }));
		expect(renderedTotal()).toBe(5);
	});

	it('de-duplicates a question list that carries the same id twice', async () => {
		const duplicated = [QUESTION_IDS[0], QUESTION_IDS[0], QUESTION_IDS[1]];
		await openExam(makeExam({ questions: duplicated }));
		// The "of N" badge must report the de-duplicated count, not the raw
		// array length.
		expect(renderedTotal()).toBe(2);
	});

	it('drops assigned questions that no longer exist in the bank', async () => {
		const missing = '99999999-9999-4999-8999-999999999999';
		await openExam(makeExam({ questions: [missing, QUESTION_IDS[0]] }));
		expect(renderedTotal()).toBe(1);
	});

	it('runs on the exam duration in minutes, not a hard-coded hour', async () => {
		// The pushed package used to carry a hard-coded `timeLimit: 3600`
		// (one hour) for every exam that had no preset. The exam's own
		// `duration` must win over that stale value.
		await openExam(makeExam({ duration: 5, timeLimit: 3600 }));
		// 5 minutes → 05:00, never 60:00.
		expect(renderedRemainingTime()).toBe('05:00');
	});

	it('uses a 12-minute exam duration as 12 minutes', async () => {
		await openExam(makeExam({ duration: 12, timeLimit: 3600 }));
		expect(renderedRemainingTime()).toBe('12:00');
	});

	it('falls back to the cached time limit only when the exam has no duration', async () => {
		await openExam(makeExam({ duration: 0, timeLimit: 300 }));
		expect(renderedRemainingTime()).toBe('05:00');
	});

	it('has no "Attempt" chip in the modal header', async () => {
		await openExam();
		const labels = [...document.querySelectorAll('.training-context-label')].map(
			(node) => node.textContent.trim(),
		);
		expect(labels).not.toContain('Attempt');
		expect(labels).not.toContain('Category');
		expect(labels).toContain('Subject');
	});

	it('does not render a category element for an exam', async () => {
		await openExam();
		expect(document.getElementById('trainingContextCategory')).toBeNull();
	});
});

describe('student exam attempts guard', () => {
	beforeEach(() => {
		document.body.innerHTML = TRAINING_MODAL_MARKUP;
		localStorage.clear();
		window.Auth = { getCurrentUser: () => ({ ...STUDENT }), isAuthenticated: () => true };
		window.showToast = vi.fn();
		window.setInterval = () => 0;
		window.clearInterval = () => {};
	});

	afterEach(() => {
		vi.resetModules();
	});

	it('lets a student retake an exam while attempts remain', async () => {
		// One completed attempt is already on record.
		localStorage.setItem(
			'examResults',
			JSON.stringify({
				'exam-1': {
					examId: 'exam-1',
					students: [
						{
							studentInfo: { numero: STUDENT.numero, class: STUDENT.class },
							score: 12,
							totalQuestions: 5,
						},
					],
				},
			}),
		);
		window.__DI_CONTAINER__ = {
			repo: {
				getAll_sync: (table) => {
					if (table === 'questions') return QUESTION_IDS.map((_, i) => makeQuestion(i));
					if (table === 'exams') return [makeExam({ max_attempts: 2 })];
					return [];
				},
				setAll_sync: () => {},
			},
		};
		vi.resetModules();
		await import('../../student-workspace.js');
		document.dispatchEvent(new Event('DOMContentLoaded'));
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The guard must NOT have blocked the attempt.
		const blocked = window.showToast.mock.calls.filter((call) =>
			String(call[0]).includes('already been completed'),
		);
		expect(blocked).toHaveLength(0);
	});
});

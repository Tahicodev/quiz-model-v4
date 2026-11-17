// @vitest-environment jsdom
/**
 * The teacher Results tab is split into an analytics pane and a manage pane by
 * teacher-domain-analytics.js, and the student-profile modal markup lives
 * inside the manage pane. When the analytics view is active the manage pane
 * is `hidden` (display:none), so the modal used to render invisibly while
 * still locking the page scroll — the app looked frozen.
 *
 * This test drives the real DOM: it builds the same hidden manage pane and
 * asserts the profile modal escapes to <body> and paints on top.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let ctx;
let body;

beforeAll(() => {
	document.body.innerHTML = `
		<section id="results" class="tab-content active">
			<div id="resultsAnalytics" class="teacher-domain-analytics" hidden></div>
			<div class="dashboard-container results-container">
				<div id="tda-results-manage-pane" class="teacher-domain-view" hidden>
					<div id="resultsStudentProfileModal" class="modal results-profile-modal">
						<div class="modal-content">
							<div class="modal-header"><h3 id="studentProfileTitle">Student</h3></div>
							<div class="modal-body results-profile-body" id="studentProfileBody"></div>
							<div class="modal-footer">
								<button type="button" data-profile-close>Close</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>`;

	body = document.body;

	const store = {
		users: [{ id: 'u1', name: 'Ada', role: 'student', class_id: 'c1' }],
		classes: [{ id: 'c1', name: 'Class One' }],
		exams: [{ id: 'e1', name: 'Midterm' }],
		results: [
			{
				id: 'r1',
				examId: 'e1',
				userId: 'u1',
				name: 'Ada',
				date: '2026-01-02T10:00:00.000Z',
				score: 15,
				totalQuestions: 2,
				mode: 'exam',
			},
		],
	};

	ctx = vm.createContext({
		console,
		String,
		Number,
		Math,
		JSON,
		Date,
		Set,
		Map,
		Array,
		Object,
		Intl,
		localStorage: {
			getItem: () => null,
			setItem() {},
			removeItem() {},
		},
		document,
		window: {
			__DI_CONTAINER__: {
				repo: {
					getAll_sync: (name) => store[name] || [],
				},
			},
			addEventListener() {},
			removeEventListener() {},
			scrollTo() {},
		},
	});
	vm.runInContext(
		readFileSync(path.join(ROOT, 'results-management.js'), 'utf8'),
		ctx,
		{ filename: 'results-management.js' },
	);
	// The module runs its DOMContentLoaded wiring; nothing else is needed here.
});

describe('student profile modal', () => {
	it('starts inside the hidden manage pane', () => {
		const modal = document.getElementById('resultsStudentProfileModal');
		expect(modal.parentElement.id).toBe('tda-results-manage-pane');
		expect(document.getElementById('tda-results-manage-pane').hidden).toBe(true);
	});

	it('is moved to <body> when a profile opens, so it is never hidden', () => {
		// Populate the roster the way the Results tab does on entry.
		vm.runInContext('loadResults()', ctx);
		const open = vm.runInContext(
			'openStudentProfileByKey',
			ctx,
		);
		open.call(null, 'u:u1');

		const modal = document.getElementById('resultsStudentProfileModal');
		expect(modal.parentElement).toBe(body);
		expect(modal.classList.contains('active')).toBe(true);
		expect(body.classList.contains('results-profile-open')).toBe(true);
	});

	it('locks the scroll only while the profile is open', () => {
		const close = vm.runInContext('closeStudentProfile', ctx);
		close.call(null);
		const modal = document.getElementById('resultsStudentProfileModal');
		expect(modal.classList.contains('active')).toBe(false);
		expect(body.classList.contains('results-profile-open')).toBe(false);
	});
});

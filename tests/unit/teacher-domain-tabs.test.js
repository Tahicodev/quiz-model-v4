// @vitest-environment jsdom

/**
 * tests/unit/teacher-domain-tabs.test.js
 *
 * The domain tabs are split into two views: the original management UI and
 * the analytics presentation. These tests run the real script against jsdom to
 * prove the switcher is injected for teachers only, that Manage stays the
 * default, and that analytics loads lazily when selected.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const ANALYTICS = readFileSync('teacher-analytics.js', 'utf8');
const SOURCE = readFileSync('teacher-domain-analytics.js', 'utf8');

function analyticsPayload() {
	return {
		meta: {
			generatedAt: '2026-02-01T10:00:00.000Z',
			period: { label: 'This month' },
			scope: { empty: true },
			emptyReason: 'No class is assigned to your account.',
		},
		sections: {},
	};
}

function boot(role = 'teacher') {
	const dom = new JSDOM(
		`<!doctype html><html><body>
			<section id="questions" class="tab-content active">
				<div id="questionsAnalytics" class="teacher-domain-analytics" hidden></div>
				<div class="toolbar" id="questionsManageContent">Question Management</div>
			</section>
			<section id="exams" class="tab-content">
				<div id="examsAnalytics" class="teacher-domain-analytics" hidden></div>
				<div class="toolbar" id="examsManageContent">Exam Management</div>
			</section>
		</body></html>`,
		{ url: 'http://localhost/' },
	);
	const { window } = dom;
	const document = window.document;

	window.currentUser = { role };
	window.Auth = {
		isAdmin: () => role === 'admin',
		getCurrentUser: () => ({ role }),
	};
	window.API = {
		list: async (path) =>
			String(path).includes('presence')
				? { data: { studentsOnline: 1, classesOnline: 1, totalClasses: 1 } }
				: { data: analyticsPayload() },
	};
	window.openTab = function () {};
	window.closeStudentProfile = vi.fn();

	new Function('window', 'document', ANALYTICS)(window, document);
	new Function('window', 'document', SOURCE)(window, document);
	window.dispatchEvent(new window.Event('quiz:bootstrap-ready'));

	const section = document.getElementById('questions');
	return {
		window,
		document,
		section,
		host: document.getElementById('questionsAnalytics'),
		manageContent: document.getElementById('questionsManageContent'),
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('teacher domain view switcher', () => {
	it('injects Manage and Analytics views and defaults to Manage', () => {
		const { section, host, manageContent } = boot();
		const switcher = section.querySelector('.teacher-domain-switch');
		expect(switcher).not.toBeNull();
		const [manageBtn, analyticsBtn] = section.querySelectorAll('[data-tda-view]');
		expect(manageBtn.textContent.trim()).toBe('Manage');
		expect(analyticsBtn.textContent.trim()).toBe('Analytics');
		expect(manageBtn.getAttribute('aria-selected')).toBe('true');

		const managePane = section.querySelector('[data-tda-pane="manage"]');
		const analyticsPane = section.querySelector('[data-tda-pane="analytics"]');
		expect(managePane.hidden).toBe(false);
		expect(analyticsPane.hidden).toBe(true);
		expect(managePane.contains(manageContent)).toBe(true);
		expect(analyticsPane.contains(host)).toBe(true);
		expect(host.hidden).toBe(true);
	});

	it('shows analytics lazily and returns to management without losing the UI', async () => {
		const { window, section, host, manageContent } = boot();
		const [manageBtn, analyticsBtn] = section.querySelectorAll('[data-tda-view]');
		const managePane = section.querySelector('[data-tda-pane="manage"]');
		const analyticsPane = section.querySelector('[data-tda-pane="analytics"]');

		analyticsBtn.click();
		await vi.waitFor(() => {
			expect(host.innerHTML).toContain('No classes to report on');
		});
		expect(analyticsPane.hidden).toBe(false);
		expect(managePane.hidden).toBe(true);
		expect(host.hidden).toBe(false);
		expect(window.closeStudentProfile).toHaveBeenCalledTimes(1);

		manageBtn.click();
		expect(managePane.hidden).toBe(false);
		expect(analyticsPane.hidden).toBe(true);
		expect(manageBtn.getAttribute('aria-selected')).toBe('true');
		expect(managePane.contains(manageContent)).toBe(true);
	});

	it('keeps a view choice per tab', async () => {
		const { window, document } = boot();
		window.TeacherDomainAnalytics.showView('exams', 'analytics');
		await vi.waitFor(() => {
			expect(document.getElementById('examsAnalytics').innerHTML).toContain(
				'No classes to report on',
			);
		});

		const questionSection = document.getElementById('questions');
		const examSection = document.getElementById('exams');
		expect(questionSection.querySelector('[data-tda-pane="manage"]').hidden).toBe(false);
		expect(questionSection.querySelector('[data-tda-pane="analytics"]').hidden).toBe(true);
		expect(examSection.querySelector('[data-tda-pane="manage"]').hidden).toBe(true);
		expect(examSection.querySelector('[data-tda-pane="analytics"]').hidden).toBe(false);
	});

	it('returns to Manage when a link opens a domain programmatically', async () => {
		const { window, document } = boot();
		window.TeacherDomainAnalytics.showView('questions', 'analytics');
		await vi.waitFor(() => {
			expect(document.getElementById('questionsAnalytics').innerHTML).toContain(
				'No classes to report on',
			);
		});

		window.openTab(null, 'questions');
		const section = document.getElementById('questions');
		expect(section.querySelector('[data-tda-pane="manage"]').hidden).toBe(false);
		expect(section.querySelector('[data-tda-pane="analytics"]').hidden).toBe(true);
	});

	it('inherits the Overview filters and refetches when they change', async () => {
		const { window } = boot();
		const overviewCalls = [];
		const list = window.API.list;
		window.API.list = (path, params) => {
			if (!String(path).includes('presence')) overviewCalls.push(params);
			return list(path, params);
		};
		const filters = { classIds: ['C1'], subjectIds: [], period: 'term', from: '', to: '' };
		window.TeacherOverview = { getFilters: () => ({ ...filters }) };

		await window.TeacherDomainAnalytics.render('questions', false);
		expect(overviewCalls.at(-1)).toMatchObject({ period: 'term', classIds: 'C1' });

		filters.period = 'month';
		filters.classIds = [];
		await window.TeacherDomainAnalytics.render('questions', false);
		expect(overviewCalls.at(-1)).toMatchObject({ period: 'month', classIds: '' });
	});

	it('anchors the Manage/Analytics switcher to the right edge', () => {
		const css = readFileSync('teacher-analytics.css', 'utf8');
		expect(css).toMatch(
			/\.teacher-domain-switch\s*\{[^}]*display:\s*flex;[^}]*width:\s*fit-content;[^}]*margin:\s*18px 24px 0 auto;/,
		);
	});

	it('never injects the switcher for an admin session', () => {
		const { section, host, manageContent } = boot('admin');
		expect(section.querySelector('.teacher-domain-switch')).toBeNull();
		expect(section.querySelector('[data-tda-pane]')).toBeNull();
		expect(section.contains(manageContent)).toBe(true);
		expect(host.hidden).toBe(true);
		expect(host.innerHTML).toBe('');
	});
});

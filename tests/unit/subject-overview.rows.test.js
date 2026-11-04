/**
 * tests/unit/subject-overview.rows.test.js
 *
 * The merged Subjects workspace list: one row table holding the active
 * subject's courses AND the structures that have no course yet, with the
 * bug-era courses that lost their branch surfaced as linkable rows instead of
 * being repaired or hidden.
 *
 *  • only the active pill's courses and roots are listed (no cross-subject mix)
 *  • an unattached root category becomes a "structure" row
 *  • a course whose category_id no longer resolves becomes an "unlinked" row
 *  • switching the pill re-filters both halves of the merged list
 *
 * courses-management.js is a classic browser script wrapped in an IIFE, so it
 * is loaded with node:vm into a sandbox with stubbed browser globals (the same
 * harness shape as course-orphan-sweep.test.js). `categories` is the shared
 * script-scope mirror that category-management.js owns, so the sandbox provides
 * it as a global.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;

const MATH = 'subject-math';
const FRENCH = 'subject-french';

const state = {
	// What GET /courses answers with (the server's view).
	courseRows: [],
	// The script-scope category mirror (`let categories` in category-management.js).
	categoryRows: [],
	// Which pill is active: window.getActiveCategorySubject() reports it.
	activeSubject: MATH,
	// Calls the (stubbed) Subjects manager receives while the workspace moves.
	scopeCalls: [],
};

const CATEGORY_FIXTURES = [
	{ id: 'cat-math-root', name: 'Numération', subject_id: MATH },
	{ id: 'cat-addition', name: 'Addition', subject_id: MATH },
	// A child of an unattached root: never a row of its own.
	{ id: 'cat-tens', name: 'Dizaines', subject_id: MATH, parent_id: 'cat-addition' },
	{ id: 'cat-fr-root', name: 'Vocabulaire', subject_id: FRENCH },
	{ id: 'cat-fr-free', name: 'Grammaire', subject_id: FRENCH },
	// Legacy rows with no subject belong to the "Unassigned" pill.
	{ id: 'cat-legacy-root', name: 'Ancienne structure', subject_id: null },
	{ id: 'cat-legacy-free', name: 'Orpheline', subject_id: null },
	{ id: 'cat-kids-bb', name: 'Kids · BB', subject_id: null },
];

const COURSE_FIXTURES = [
	{
		id: 'course-math', name: 'Numération CE2', status: 'published', subject_id: MATH,
		category_id: 'cat-math-root', category_path: 'Numération', lesson_count: 3, updated_at: '2026-01-02T00:00:00.000Z',
	},
	{
		// The branch was deleted: the FK nulled itself (bug-era casualty).
		id: 'course-nolink', name: 'Ancien cours PDF', status: 'draft', subject_id: MATH,
		category_id: null, category_path: null, lesson_count: 4,
	},
	{
		// The id survived but no longer resolves in the mirror: same bucket.
		id: 'course-dangling', name: 'Cours sans structure', status: 'draft', subject_id: MATH,
		category_id: 'cat-gone', category_path: '', lesson_count: 2,
	},
	{
		id: 'course-fr', name: 'Vocabulaire CM1', status: 'draft', subject_id: FRENCH,
		category_id: 'cat-fr-root', category_path: 'Vocabulaire', lesson_count: 1,
	},
	{
		id: 'course-legacy', name: 'Cours hérité', status: 'draft', subject_id: null,
		category_id: 'cat-legacy-root', category_path: 'Ancienne structure', lesson_count: 0,
	},
];

function makeClassList(el) {
	return {
		add: (name) => el.classes.add(name),
		remove: (name) => el.classes.delete(name),
		toggle: (name, force) => {
			const on = force === undefined ? !el.classes.has(name) : !!force;
			if (on) el.classes.add(name);
			else el.classes.delete(name);
			return on;
		},
		contains: (name) => el.classes.has(name),
	};
}

function makeEl(over = {}) {
	const el = {
		classes: new Set(),
		attrs: {},
		dataset: {},
		value: '',
		textContent: '',
		children: [],
		...over,
	};
	el.classList = makeClassList(el);
	el.setAttribute = (k, v) => {
		el.attrs[k] = v;
	};
	el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
	let html = '';
	Object.defineProperty(el, 'innerHTML', {
		get: () => html,
		set: (v) => {
			html = String(v ?? '');
			if (html === '') el.children = [];
		},
	});
	return el;
}

const byId = {};
let tbody;
let viewButtons;

beforeAll(() => {
	byId.courseSearch = makeEl({ id: 'courseSearch', value: '' });
	byId.courseStatusFilter = makeEl({ id: 'courseStatusFilter', value: '' });
	byId.courseOrphanBanner = makeEl({ id: 'courseOrphanBanner' });
	byId.courseOrphanCount = makeEl({ id: 'courseOrphanCount' });
	byId.courseListPane = makeEl({ id: 'courseListPane' });
	byId.structurePane = makeEl({ id: 'structurePane' });
	byId.courseDetailPane = makeEl({ id: 'courseDetailPane' });
	byId.subjectViewToggle = makeEl({ id: 'subjectViewToggle' });
	tbody = makeEl();
	viewButtons = [
		makeEl({ id: 'btnCourses', dataset: { view: 'courses' } }),
		makeEl({ id: 'btnCategories', dataset: { view: 'categories' } }),
	];

	// In a browser `window` IS the global object, and the script assigns its
	// entry points through it while reading them back as bare identifiers.
	const sandbox = {
		console: { warn() {}, log() {}, error() {} },
		innerWidth: 1400,
		addEventListener() {},
		showToast() {},
		isAutoGameCategory: (c) => String((c && c.name) || '').startsWith('Kids · '),
		// The shared category mirror (category-management.js owns this global).
		categories: state.categoryRows,
		API: {
			raw: async (method, url) => {
				if (method === 'GET' && url.startsWith('/courses')) {
					return { data: state.courseRows.map((r) => ({ ...r })) };
				}
				return {};
			},
		},
		__DI_CONTAINER__: {
			repo: {
				getAll_sync: () => [],
				setAll_sync() {},
				getValue_sync: () => ({}),
			},
		},
		getActiveCategorySubject: () => state.activeSubject,
		SubjectsManagement: {
			setView: (scope) => state.scopeCalls.push(scope),
			openBranch: (rootId) => state.scopeCalls.push(`branch:${rootId}`),
		},
		document: {
			createElement: (tagName) => makeEl({ tagName }),
			getElementById: (id) => byId[id] || null,
			querySelector: (sel) => (sel === '#courseList tbody' ? tbody : null),
			querySelectorAll: (sel) => (sel === '#subjectViewToggle .subject-view-btn' ? viewButtons : []),
			addEventListener() {},
			head: { appendChild() {} },
			documentElement: { classList: { add() {}, remove() {} } },
			body: { classes: new Set(), classList: { add() {}, remove() {} }, appendChild: (child) => child },
		},
	};
	sandbox.window = sandbox;
	sandbox.globalThis = sandbox;
	ctx = vm.createContext(sandbox);

	// The mirror is a live array reference: fill it before the script loads so
	// `categories` resolves to the same rows the specs mutate.
	state.categoryRows.push(...CATEGORY_FIXTURES);
	const src = readFileSync(path.join(ROOT, 'courses-management.js'), 'utf8');
	vm.runInContext(src, ctx, { filename: 'courses-management.js' });
});

/** Load from the (stubbed) server and paint the merged list. */
async function paint() {
	state.courseRows = COURSE_FIXTURES.map((r) => ({ ...r }));
	await vm.runInContext('window.CoursesManagement.loadCourses();', ctx);
	vm.runInContext('window.renderCourseList();', ctx);
	return tbody.innerHTML;
}

const rowCount = (html, kind) => (html.match(new RegExp(`data-kind="${kind}"`, 'g')) || []).length;

describe('merged courses + structures rows', () => {
	it('lists the active subject\'s courses, its free structures and its broken links', async () => {
		state.activeSubject = MATH;
		const html = await paint();

		expect(rowCount(html, 'course')).toBe(1);
		expect(html).toContain('data-row-key="course-math"');
		expect(html).toContain('Numération CE2');

		// "Addition" is a root no course owns → a structure row, and its child
		// "Dizaines" is not listed separately.
		expect(rowCount(html, 'structure')).toBe(1);
		expect(html).toContain('data-row-key="branch:cat-addition"');
		expect(html).toContain('No course yet');
		expect(html).not.toContain('Dizaines');

		// Both bug-era shapes land in the same linkable bucket.
		expect(rowCount(html, 'unlinked')).toBe(2);
		expect(html).toContain('data-row-key="course-nolink"');
		expect(html).toContain('data-row-key="course-dangling"');
		expect(html).toContain('No structure');
		expect(html).toContain('linkStructure(\'course-dangling\')');

		// Nothing from the other pills leaks into this one.
		expect(html).not.toContain('Vocabulaire CM1');
		expect(html).not.toContain('Grammaire');
		expect(html).not.toContain('Cours hérité');
		expect(html).not.toContain('Orpheline');
	});

	it('re-filters courses and structures together when the pill changes', async () => {
		state.activeSubject = FRENCH;
		const french = await paint();
		expect(rowCount(french, 'course')).toBe(1);
		expect(french).toContain('data-row-key="course-fr"');
		expect(rowCount(french, 'structure')).toBe(1);
		expect(french).toContain('data-row-key="branch:cat-fr-free"');
		expect(french).not.toContain('Numération CE2');
		expect(french).not.toContain('branch:cat-addition');

		state.activeSubject = '__unassigned__';
		const legacy = await paint();
		expect(rowCount(legacy, 'course')).toBe(1);
		expect(legacy).toContain('data-row-key="course-legacy"');
		expect(rowCount(legacy, 'structure')).toBe(1);
		expect(legacy).toContain('data-row-key="branch:cat-legacy-free"');
		expect(legacy).not.toContain('branch:cat-math-root');
		expect(legacy).not.toContain('Kids · BB');
	});

	it('keeps search and the status filter working over the merged rows', async () => {
		state.activeSubject = MATH;
		await paint();
		byId.courseSearch.value = 'addition';
		vm.runInContext('window.renderCourseList();', ctx);
		expect(tbody.innerHTML).toContain('data-row-key="branch:cat-addition"');
		expect(tbody.innerHTML).not.toContain('data-row-key="course-math"');

		// A status is a course property, so the status filter narrows to courses.
		byId.courseSearch.value = '';
		byId.courseStatusFilter.value = 'published';
		vm.runInContext('window.renderCourseList();', ctx);
		expect(tbody.innerHTML).toContain('data-row-key="course-math"');
		expect(rowCount(tbody.innerHTML, 'structure')).toBe(0);
		expect(rowCount(tbody.innerHTML, 'unlinked')).toBe(0);

		byId.courseStatusFilter.value = '';
	});

	it('says something helpful for a subject with nothing in it', async () => {
		state.activeSubject = 'subject-empty';
		const html = await paint();
		expect(html).toContain('course-empty-cell');
		expect(html).toContain('New Course');
	});

	it('surfaces the orphan sweep banner for the same broken rows', async () => {
		state.activeSubject = MATH;
		await paint();
		expect(byId.courseOrphanBanner.classList.contains('hidden')).toBe(false);
		expect(byId.courseOrphanCount.textContent).toBe('2');
	});

	it('opens a course outline in the structure pane and returns to the list', async () => {
		state.scopeCalls.length = 0;
		state.activeSubject = MATH;
		await paint();

		vm.runInContext('window.setSubjectsWorkspaceView(\'courses\');', ctx);
		expect(byId.courseListPane.classList.contains('hidden')).toBe(false);
		expect(byId.structurePane.classList.contains('hidden')).toBe(true);
		expect(byId.courseDetailPane.classList.contains('hidden')).toBe(true);

		vm.runInContext("window.openStructureBranch('cat-math-root', { courseId: 'course-math' });", ctx);
		expect(byId.courseListPane.classList.contains('hidden')).toBe(true);
		expect(byId.structurePane.classList.contains('hidden')).toBe(false);
		expect(state.scopeCalls).toContain('branch:cat-math-root');

		vm.runInContext('window.closeStructureBranch();', ctx);
		expect(byId.courseListPane.classList.contains('hidden')).toBe(false);
		expect(byId.structurePane.classList.contains('hidden')).toBe(true);
		expect(state.scopeCalls).toContain('subject');
	});
});

/**
 * tests/unit/category-training-bulk-toggle.test.js
 *
 * The bulk "Training" control in the categories bar is a real toggle: it
 * mirrors the state of the selected categories and flips every one of them
 * when clicked. These tests pin that behaviour — including the label the
 * button shows and the fact that a single server write carries the whole
 * batch.
 *
 * category-management.js is a classic browser script (no modules), so it is
 * loaded with node:vm into a sandbox with stubbed browser globals.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;

const MATH = '11111111-1111-4111-8111-111111111111';
const ADDITION = '22222222-2222-4222-8222-222222222222';
const SCIENCE = '55555555-5555-4555-8555-555555555555';
const UNCATEGORIZED = '99999999-9999-4999-8999-999999999999';
const SUBJECT = '88888888-8888-4888-8888-888888888888';

const TREE = [
	{ id: MATH, name: 'Math', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-01', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: null, parentId: null, subject_id: SUBJECT },
	{ id: ADDITION, name: 'Addition', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-02', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: MATH, parentId: MATH, subject_id: SUBJECT },
	{ id: SCIENCE, name: 'Science', color: '#10b981', questionCount: 0, dateCreated: '2026-01-05', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: null, parentId: null, subject_id: SUBJECT },
	{ id: UNCATEGORIZED, name: 'Uncategorized', color: '#6b7280', questionCount: 0, dateCreated: '2026-01-06', isSystem: true, created_by: 't1', ownerId: 't1', parent_id: null, parentId: null, subject_id: SUBJECT },
];

const state = {
	toasts: [],
	updatePayloads: [],
	selectedIds: [],
	toggleButton: null,
};

/** Minimal button element that records what the code writes to it. */
function makeToggleButton() {
	const btn = {
		dataset: {},
		disabled: false,
		title: '',
		attributes: {},
		children: [],
		setAttribute(name, value) {
			this.attributes[name] = String(value);
		},
		getAttribute(name) {
			return this.attributes[name] ?? null;
		},
		querySelector(selector) {
			return selector === '.bulk-training-toggle-label' ? this.label : null;
		},
	};
	btn.label = { textContent: '' };
	return btn;
}

beforeAll(() => {
	state.toggleButton = makeToggleButton();
	const els = {
		categoryName: { value: '' },
		categoryDescription: { value: '' },
		categoryColor: { value: '#3b82f6' },
		categoryTraining: { checked: false },
		categoryModalTitle: {},
		categoryForm: {},
		categoryModal: {},
		categoryParent: { value: '' },
		categorySubject: { value: SUBJECT, disabled: false },
		assignCategoryQuestionsModal: {},
	};
	const sandbox = {
		console,
		confirm: () => true,
		window: {
			addEventListener() {},
			Auth: {
				getCurrentUser: () => ({ id: 't1' }),
				canAccessItem: () => true,
			},
			API: {
				create: async (entity, payload) => ({ id: 'new-id', ...payload, created_by: 't1' }),
				update: async (entity, id, payload) => {
					state.updatePayloads.push([entity, id, payload]);
					return { id, ...payload };
				},
				raw: async () => ({}),
				remove: async () => null,
			},
			BulkSelect: {
				getSelectedIds: () => state.selectedIds,
				clear: () => {},
			},
			__DI_CONTAINER__: {
				repo: {
					getAll_sync: () => [],
					setAll_sync: () => {},
					getValue_sync: () => ({}),
				},
			},
		},
		document: {
			addEventListener() {},
			getElementById: (id) => {
				if (id === 'bulk-disable-training-btn') return state.toggleButton;
				return els[id] || null;
			},
			querySelector: () => null,
			querySelectorAll: () => [],
			createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, set innerHTML(v) {} }),
			head: { appendChild() {} },
			documentElement: { classList: { add() {}, remove() {} } },
			body: { classList: { add() {}, remove() {} }, appendChild() {} },
		},
		localStorage: {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
		},
		showToast: (message) => {
			state.toasts.push(String(message));
		},
	};
	sandbox.globalThis = sandbox;
	ctx = vm.createContext(sandbox);
	const src = readFileSync(path.join(ROOT, 'category-management.js'), 'utf8');
	vm.runInContext(src, ctx, { filename: 'category-management.js' });
	vm.runInContext(
		'updateCategoryList = () => {}; loadCategoriesIntoSelect = () => {}; loadCategoriesIntoFilters = () => {};',
		ctx,
	);
});

beforeEach(() => {
	state.toasts = [];
	state.updatePayloads = [];
	state.selectedIds = [];
	state.toggleButton = makeToggleButton();
	vm.runInContext(
		`categories = ${JSON.stringify(TREE)}; currentCategoryId = null; categoryTrainingMapCache = null; resetCategoryManualOrder(); activeCategorySubjectId = '${SUBJECT}';`,
		ctx,
	);
});

describe('bulk training toggle', () => {
	it('offers "Enable Training" when no selected category is in training mode', () => {
		state.selectedIds = [MATH, SCIENCE];
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		expect(state.toggleButton.label.textContent).toBe('Enable Training');
		expect(state.toggleButton.dataset.state).toBe('off');
		expect(state.toggleButton.getAttribute('aria-pressed')).toBe('false');
	});

	it('offers "Disable Training" when every selected category is enabled', () => {
		state.selectedIds = [MATH, SCIENCE];
		vm.runInContext(
			`categoryTrainingMapCache = { '${MATH}': true, '${SCIENCE}': true };`,
			ctx,
		);
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		expect(state.toggleButton.label.textContent).toBe('Disable Training');
		expect(state.toggleButton.dataset.state).toBe('on');
		expect(state.toggleButton.getAttribute('aria-pressed')).toBe('true');
	});

	it('reports a mixed selection as mixed, never as a full state', () => {
		state.selectedIds = [MATH, SCIENCE];
		vm.runInContext(`categoryTrainingMapCache = { '${MATH}': true };`, ctx);
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		expect(state.toggleButton.dataset.state).toBe('mixed');
	});

	it('enables every selected category and writes the map once', async () => {
		state.selectedIds = [MATH, SCIENCE];
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		await vm.runInContext('toggleTrainingForSelected()', ctx);

		expect(vm.runInContext(`isTrainingCategory('${MATH}')`, ctx)).toBe(true);
		expect(vm.runInContext(`isTrainingCategory('${SCIENCE}')`, ctx)).toBe(true);
		// One settings write for the whole batch, not one per category.
		expect(state.updatePayloads).toHaveLength(1);
		const written = JSON.parse(state.updatePayloads[0][2].value);
		expect(written[MATH]).toBe(true);
		expect(written[SCIENCE]).toBe(true);
	});

	it('disables every selected category on the second click', async () => {
		state.selectedIds = [MATH, SCIENCE];
		vm.runInContext(
			`categoryTrainingMapCache = { '${MATH}': true, '${SCIENCE}': true };`,
			ctx,
		);
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		await vm.runInContext('toggleTrainingForSelected()', ctx);

		expect(vm.runInContext(`isTrainingCategory('${MATH}')`, ctx)).toBe(false);
		expect(vm.runInContext(`isTrainingCategory('${SCIENCE}')`, ctx)).toBe(false);
		expect(state.updatePayloads).toHaveLength(1);
	});

	it('skips the system pool and never writes it', async () => {
		state.selectedIds = [UNCATEGORIZED];
		vm.runInContext('syncBulkTrainingToggle()', ctx);
		await vm.runInContext('toggleTrainingForSelected()', ctx);
		expect(state.updatePayloads).toHaveLength(0);
	});

	it('excludes an inherited category explicitly when disabling', async () => {
		// Math is on, so Addition inherits the training flag without holding
		// an explicit entry. Disabling Addition must write an explicit "false"
		// so the subcategory is excluded from its parent.
		state.selectedIds = [ADDITION];
		vm.runInContext(`categoryTrainingMapCache = { '${MATH}': true };`, ctx);
		expect(vm.runInContext(`isTrainingCategory('${ADDITION}')`, ctx)).toBe(true);

		vm.runInContext('syncBulkTrainingToggle()', ctx);
		await vm.runInContext('toggleTrainingForSelected()', ctx);

		const written = JSON.parse(state.updatePayloads[0][2].value);
		expect(written[ADDITION]).toBe(false);
		expect(vm.runInContext(`isTrainingCategory('${ADDITION}')`, ctx)).toBe(false);
		// The parent keeps its own flag.
		expect(written[MATH]).toBe(true);
	});
});

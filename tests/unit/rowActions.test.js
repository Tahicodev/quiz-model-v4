/**
 * tests/unit/rowActions.test.js
 *
 * row-actions.js is the shared row-action bar used by every manage-section
 * table: it caps a row at three icon buttons and moves the rest behind a "…"
 * popover that reuses the course "Resources" menu styling.
 *
 * The helper is a classic browser script, so it is loaded with node:vm into a
 * minimal sandbox (it only needs `document` for the popover it appends to the
 * body).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let RowActions;

function makeEl() {
	const el = {
		innerHTML: '',
		style: {},
		dataset: {},
		children: [],
		classList: { add() {}, remove() {}, contains: () => false },
		setAttribute() {},
		removeAttribute() {},
		getAttribute: () => null,
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		removeChild(child) {
			this.children = this.children.filter((c) => c !== child);
			return child;
		},
		addEventListener() {},
		removeEventListener() {},
		querySelector: () => null,
		querySelectorAll: () => [],
		getBoundingClientRect: () => ({ top: 0, bottom: 20, left: 0, right: 40 }),
		contains: () => false,
		closest: () => null,
	};
	return el;
}

beforeAll(() => {
	const body = makeEl();
	const sandbox = {
		console,
		setTimeout: (fn) => fn(),
		clearTimeout() {},
		document: {
			createElement: () => makeEl(),
			body,
			addEventListener() {},
			removeEventListener() {},
			querySelectorAll: () => [],
		},
	};
	sandbox.window = sandbox;
	sandbox.globalThis = sandbox;
	const ctx = vm.createContext(sandbox);
	const src = readFileSync(path.join(ROOT, 'row-actions.js'), 'utf8');
	vm.runInContext(src, ctx, { filename: 'row-actions.js' });
	RowActions = sandbox.RowActions;
});

const ICON = '<svg></svg>';

function action(key, extra = {}) {
	return {
		key,
		label: `Action ${key}`,
		title: `Action ${key}`,
		hint: 'Some hint',
		cls: `btn-${key}`,
		icon: ICON,
		onclick: `do${key}('id')`,
		run: () => {},
		...extra,
	};
}

describe('row action bar', () => {
	it('keeps at most three icon buttons on the row', () => {
		const html = RowActions.render([
			action('a'),
			action('b'),
			action('c'),
			action('d'),
			action('e'),
		]);
		const buttons = html.match(/<button type="button" class="exam-action-btn /g) || [];
		// 3 action buttons + the "…" trigger.
		expect(buttons).toHaveLength(4);
		expect(html).toContain('row-action-more');
	});

	it('renders no "…" trigger when everything fits', () => {
		const html = RowActions.render([action('a'), action('b')]);
		expect(html).not.toContain('row-action-more');
		expect(html).not.toContain('data-row-action-overflow');
	});

	it('moves the extra actions into the hidden overflow holder', () => {
		const html = RowActions.render([
			action('a'),
			action('b'),
			action('c'),
			action('d'),
			action('e'),
			action('f'),
		]);
		expect(html).toContain('data-row-action-overflow');
		expect(html).toContain('doe(&#039;id&#039;)');
		expect(html).toContain('dof(&#039;id&#039;)');
		// The three visible buttons keep their own handlers.
		expect(html).toContain('doa(&#039;id&#039;)');
		expect(html).toContain('dod(&#039;id&#039;)');
	});

	it('honours an explicit desktop: overflow placement', () => {
		const html = RowActions.render([
			action('a'),
			action('b'),
			action('c'),
			action('d'),
			action('e', { desktop: 'overflow' }),
		]);
		// "e" is pushed out even though there is room for a fourth button.
		expect(html).toContain('doe(&#039;id&#039;)');
		expect(html).toContain('row-action-more');
	});

	it('drops a desktop: none action from the row entirely', () => {
		const html = RowActions.render([
			action('a'),
			action('b', { desktop: 'none' }),
			action('c'),
		]);
		expect(html).not.toContain('dob(&#039;id&#039;)');
		expect(html).not.toContain('row-action-more');
	});

	it('marks the disabled actions', () => {
		const html = RowActions.render([action('a', { disabled: true })]);
		expect(html).toContain('disabled');
	});

	it('styles the overflow entries like the course Resources menu', () => {
		const html = RowActions.render([
			action('a'),
			action('b'),
			action('c'),
			action('d'),
			action('e', { tone: 'danger' }),
		]);
		// The menu entry keeps the action's own class (the icon button's tint
		// class) plus the danger tone.
		expect(html).toContain('course-resources-item row-action-danger btn-e');
		expect(html).toContain('course-resources-item-main');
		expect(html).toContain('row-action-item-icon');
	});

	it('escapes the labels it renders', () => {
		const html = RowActions.render([
			action('a', { label: '<img src=x onerror=alert(1)>' }),
		]);
		expect(html).not.toContain('<img src=x');
		expect(html).toContain('&lt;img src=x');
	});
});

describe('row action sheet', () => {
	it('carries every action, including the desktop-only ones', () => {
		const items = RowActions.sheetItems([
			action('a'),
			action('b', { desktop: 'none' }),
			action('c', { mobile: false }),
		]);
		expect(items.map((i) => i.label)).toEqual(['Action a', 'Action b']);
	});

	it('maps the variant and the run callback', () => {
		const run = () => {};
		const items = RowActions.sheetItems([
			action('a', { variant: 'danger', run }),
		]);
		expect(items[0].variant).toBe('danger');
		expect(items[0].onClick).toBe(run);
	});
});

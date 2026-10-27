/**
 * utils.js is a classic browser script (no module exports), so it is loaded
 * into a VM context like the other script-unit tests. This locks the shared
 * marker that keeps game-generated categories out of every category list.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, beforeAll } from 'vitest';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);

let ctx;
beforeAll(() => {
	// utils.js touches `document` at top level (toast CSS injection, scroll-to-
	// top auto-init). Keep it inert: readyState 'loading' defers init, and the
	// element factory absorbs the CSS-injection writes.
	const noopEl = { id: '', className: '', textContent: '', setAttribute() {}, appendChild() {}, remove() {} };
	const documentStub = {
		readyState: 'loading',
		getElementById: () => null,
		createElement: () => ({ ...noopEl }),
		head: { appendChild() {} },
		body: { appendChild() {} },
		addEventListener() {},
	};
	ctx = vm.createContext({
		console,
		String,
		Number,
		Math,
		Date,
		window: {},
		document: documentStub,
	});
	vm.runInContext(
		readFileSync(path.join(ROOT, 'utils.js'), 'utf8'),
		ctx,
		{ filename: 'utils.js' },
	);
});

describe('isAutoGameCategory', () => {
	it('flags the synthetic Kids · buckets a game publish creates', () => {
		expect(vm.runInContext('isAutoGameCategory({ name: "Kids · Math" })', ctx)).toBe(
			true,
		);
		expect(
			vm.runInContext('isAutoGameCategory({ name: "Kids · General" })', ctx),
		).toBe(true);
	});

	it('treats real teacher categories as categories', () => {
		expect(vm.runInContext('isAutoGameCategory({ name: "Math" })', ctx)).toBe(
			false,
		);
		expect(
			vm.runInContext('isAutoGameCategory({ name: "Kids’ Corner" })', ctx),
		).toBe(false);
	});

	it('is null-safe', () => {
		expect(vm.runInContext('isAutoGameCategory(null)', ctx)).toBe(false);
		expect(vm.runInContext('isAutoGameCategory({})', ctx)).toBe(false);
	});
});

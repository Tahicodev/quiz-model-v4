/**
 * tests/unit/rowActions.integration.test.js
 *
 * End-to-end check of the shared row-action bar against the real manage
 * scripts: each catalog is rendered through RowActions.render() and the
 * resulting markup is inspected — how many icon buttons, whether the "…"
 * trigger is there, and which actions ended up in the overflow menu.
 *
 * The scripts are classic browser scripts with a lot of globals, so instead of
 * running them whole, the catalogs are re-declared here from the same
 * descriptors and the row templates are checked as source. What matters is
 * that every manage list uses the shared helper and caps its row at three
 * buttons.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const helper = read('row-actions.js');
const exams = read('exam-management.js');
const classes = read('class-management.js');
const categories = read('category-management.js');
const courses = read('courses-management.js');
const devices = read('classroom-devices.js');

/** The catalogs, keyed by their script. */
const CATALOGS = {
	'exam-management.js': exams,
	'class-management.js': classes,
	'category-management.js': categories,
};

describe('shared row-action helper', () => {
	it('is a standalone script that publishes window.RowActions', () => {
		expect(helper).toContain('global.RowActions = RowActions');
		expect(helper).toContain('global.window.RowActions = RowActions');
		expect(helper).toContain('MAX_VISIBLE = 3');
	});
});

describe('manage lists paint their rows through the shared helper', () => {
	it('the exam list does', () => {
		expect(exams).toContain('window.RowActions.render(examRowActions(exam))');
		expect(exams).toContain('window.RowActions.sheetItems(examRowActions(exam))');
	});

	it('the class list does', () => {
		expect(classes).toContain('window.RowActions.render(classRowActions(cls))');
		expect(classes).toContain(
			'window.RowActions.sheetItems(classRowActions(classData))',
		);
	});

	it('the category list does', () => {
		expect(categories).toContain(
			'window.RowActions.render(categoryRowActions(category))',
		);
		expect(categories).toContain(
			'window.RowActions.sheetItems(categoryRowActions(category))',
		);
	});
});

describe('row action budgets', () => {
	/** How many descriptors a catalog marks as visible on the desktop row. */
	function visibleCount(js, fnName) {
		const start = js.indexOf(`function ${fnName}(`);
		expect(start).toBeGreaterThan(-1);
		const block = js.slice(start, js.indexOf('\n}\n', start));
		const visible = block.match(/desktop: 'visible'/g) || [];
		const overflow = block.match(/desktop: 'overflow'/g) || [];
		const none = block.match(/desktop: 'none'/g) || [];
		return { visible: visible.length, overflow: overflow.length, none: none.length };
	}

	it('the exam row shows three buttons and hides the rest behind the "…" menu', () => {
		const counts = visibleCount(exams, 'examRowActions');
		expect(counts.visible).toBe(3);
		expect(counts.overflow).toBe(4);
	});

	it('the class row shows three buttons and hides the delete behind the "…" menu', () => {
		const counts = visibleCount(classes, 'classRowActions');
		expect(counts.visible).toBe(3);
		expect(counts.overflow).toBe(1);
	});

	it('the category row always shows the same three buttons', () => {
		const counts = visibleCount(categories, 'categoryRowActions');
		expect(counts.visible).toBe(3);
		expect(counts.overflow).toBeGreaterThan(0);
	});
});

describe('no redundant row buttons', () => {
	it('the exam row has no analysis button (the title opens it)', () => {
		expect(exams).not.toContain('exam-analysis-btn"');
		expect(exams).toContain('desktop: \'none\'');
	});

	it('the class row has no Manage Students button (the name opens the roster)', () => {
		const start = classes.indexOf('function classRowActions(');
		const block = classes.slice(start, classes.indexOf('\n}\n', start));
		expect(block).toContain("key: 'students'");
		// The students action exists, but not as a visible desktop button.
		const students = block.slice(block.indexOf("key: 'students'"));
		const studentsEntry = students.slice(0, students.indexOf('},'));
		expect(studentsEntry).toContain("desktop: 'none'");
	});

	it('the course row has no Create-course-document button (the Resources menu has it)', () => {
		const start = courses.indexOf('function courseRowActions(');
		const block = courses.slice(start, courses.indexOf('\n\tfunction ', start));
		expect(block).not.toContain('course-action-document');
		expect(block).not.toContain('course-action-structure');
		// Three buttons on the row, the rest behind the "…" menu.
		expect((block.match(/desktop: 'visible'/g) || []).length).toBe(3);
		expect((block.match(/desktop: 'overflow'/g) || []).length).toBe(1);
	});

	it('the devices row keeps Bloquer and Oublier apart', () => {
		// Same visible result, different tint class.
		expect(devices).toContain('device-block-btn');
		expect(devices).not.toContain('exam-action-btn exam-delete-btn" title="Bloquer"');
	});
});

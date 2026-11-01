import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../courses-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('course row actions', () => {
	it('opens a course from its clickable title', () => {
		expect(js).toMatch(/class="course-name-link" onclick="openCourseDetail\('/);
	});

	it('provides open, publish and delete actions in the mobile sheet', () => {
		const start = js.indexOf('MobileActionSheet.open(`Course:');
		const end = js.indexOf('\n\t\t\t\t]);', start);
		const actions = js.slice(start, end);
		expect(start).toBeGreaterThan(-1);
		expect(actions).toContain("label: 'Open course'");
		expect(actions).toContain("label: published ? 'Unpublish course' : 'Publish course'");
		expect(actions).toContain("label: 'Delete course'");
	});

	it('hides the inline action buttons on mobile', () => {
		expect(css).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?#courseList tbody td:nth-child\(7\)\s*\{\s*display:\s*none !important;/);
	});

	it('generates lesson content sequentially for every course level', () => {
		expect(js).toContain('data-generate-all-levels');
		expect(js).toMatch(/for \(const lesson of lessons\)/);
		expect(js).toMatch(/\/lessons\/\$\{encodeURIComponent\(lesson\.id\)\}\/generate-content/);
	});

	it('supports nested per-category collapse and expand-all controls', () => {
		expect(js).toContain('window.toggleCourseCategory = function');
		expect(js).toContain('window.setCourseCategoriesCollapsed = function');
		expect(js).toContain('quizCollapsedCourseCategories:');
		expect(js).toContain('data-course-collapse=');
		expect(css).toContain('.course-tree-row[hidden]');
	});

	it('styles toolbar actions with distinct purpose-based colors', () => {
		expect(css).toContain('.course-detail-actions .course-action-publish');
		expect(css).toContain('.course-detail-actions .course-action-assign');
		expect(css).toContain('.course-detail-actions .course-action-add');
	});
});

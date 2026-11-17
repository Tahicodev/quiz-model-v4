import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../courses-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../../admin.css', import.meta.url), 'utf8');
const darkCss = readFileSync(new URL('../../theme-dark.css', import.meta.url), 'utf8');

describe('course structure action buttons', () => {
	it('styles Prep Sheets, Exercises and Documents as distinct pills', () => {
		expect(js).toContain('course-action-prep-sheets');
		expect(js).toContain('course-action-exercises');
		expect(js).toContain('course-action-documents');
		expect(css).toContain('.course-structure-tools .course-action-prep-sheets');
		expect(css).toContain('.course-structure-tools .course-action-exercises');
		expect(css).toContain('.course-structure-tools .course-action-documents');
		// Each one gets its own tinted treatment.
		expect(css).toMatch(
			/\.course-structure-tools \.course-action-prep-sheets \{[^}]*background: #eff6ff;[^}]*\}/,
		);
		expect(css).toMatch(
			/\.course-structure-tools \.course-action-exercises \{[^}]*background: #fffbeb;[^}]*\}/,
		);
		expect(css).toMatch(
			/\.course-structure-tools \.course-action-documents \{[^}]*background: #f1f5f9;[^}]*\}/,
		);
	});

	it('styles the two launchpads with per-action treatments', () => {
		expect(adminCss).toContain('.launchpad-actions .btn');
		expect(adminCss).toContain('.launchpad-lessons .launchpad-actions .launchpad-export');
		expect(adminCss).toContain('.launchpad-lessons .launchpad-actions .launchpad-assign');
		expect(adminCss).toContain('.launchpad-questions .launchpad-actions .btn-ai-generate');
		expect(adminCss).toContain('.launchpad-questions .launchpad-actions .launchpad-prompt-studio');
		expect(adminCss).toContain('.launchpad-questions .launchpad-actions .launchpad-add-manual');
		// The buttons carry the matching hook classes.
		expect(js).toContain('launchpad-export');
		expect(js).toContain('launchpad-assign');
		expect(js).toContain('launchpad-prompt-studio');
		expect(js).toContain('launchpad-add-manual');
	});

	it('keeps a dark-theme variant for every new coloured surface', () => {
		expect(darkCss).toContain("html[data-theme='dark'] .course-structure-tools .course-action-prep-sheets");
		expect(darkCss).toContain("html[data-theme='dark'] .course-structure-tools .course-action-exercises");
		expect(darkCss).toContain("html[data-theme='dark'] .course-structure-tools .course-action-documents");
		expect(darkCss).toContain("html[data-theme='dark'] .launchpad-lessons");
		expect(darkCss).toContain("html[data-theme='dark'] .launchpad-questions");
	});
});

describe('course tree rows', () => {
	it('drops the per-row action column entirely', () => {
		expect(js).not.toContain('course-tree-actions');
		expect(js).not.toContain('course-tree-lesson-link');
		expect(js).not.toContain('course-tree-generate');
		expect(css).not.toContain('.course-tree-actions');
		expect(css).not.toContain('.course-tree-lesson-link');
	});

	it('makes the whole row clickable and shows a status chip', () => {
		expect(js).toContain("pane.querySelectorAll('.course-tree-row').forEach");
		expect(js).toContain('openCourseTreeRow(row)');
		expect(js).toContain('course-tree-status');
		expect(js).toContain('Lesson ready');
		expect(js).toContain('Not generated');
		expect(css).toContain('.course-tree-status.is-ready');
		expect(css).toContain('.course-tree-status.is-empty');
	});

	it('opens the lesson when it has content, otherwise offers generation', () => {
		expect(js).toContain('function openCourseTreeRow(row)');
		expect(js).toContain("String(lesson.content || '').trim()");
		expect(js).toContain('window.focusLesson(lessonId)');
		expect(js).toContain('window.openLessonAIActions(lessonId)');
		expect(js).toContain('window.openCategoryLessonGeneration(categoryId)');
	});

	it('offers create-lesson and generate-questions for a level without lesson', () => {
		expect(js).toContain('window.openCategoryLessonGeneration = function');
		expect(js).toContain('window.createLessonForCategory = async function');
		expect(js).toContain("category_id: String(categoryId)");
		expect(js).toContain("openCategoryQuestionGeneration('${esc(categoryId)}')");
	});
});

describe('generate all levels dropdown', () => {
	it('turns the trigger into an accessible menu', () => {
		expect(js).toContain('window.openCourseAllLevelsMenu = function');
		expect(js).toContain('course-all-levels-trigger');
		expect(js).toContain('aria-haspopup="menu"');
		expect(js).toContain('aria-expanded="false"');
		expect(js).toContain("menu.setAttribute('role', 'menu')");
		expect(js).toContain('role="menuitem"');
	});

	it('acts globally on the whole course with the four destinations', () => {
		expect(js).toContain('window.courseAllLevelsAction = function');
		expect(js).toContain("kind: 'course'");
		expect(js).toContain("kind: 'prep-sheets'");
		expect(js).toContain("kind: 'exercises'");
		expect(js).toContain("kind: 'documents'");
		expect(js).toContain("window.confirmGenerateAllCourseLessons()");
		expect(js).toContain("window.openCourseResource('prep-sheets', currentCourse.id)");
		expect(js).toContain("window.openCourseResource('exercises', currentCourse.id)");
		expect(js).toContain('window.openGeneratedDocumentsLibrary(currentCourse.id)');
	});

	it('closes the dropdown on outside click and Escape', () => {
		expect(js).toContain('function closeCourseAllLevelsMenu()');
		expect(js).toContain('function allLevelsDocClick(event)');
		expect(js).toContain('function allLevelsKeyDown(event)');
		expect(js).toContain("event.key === 'Escape'");
		expect(js).toContain("document.addEventListener('click', allLevelsDocClick, true)");
		expect(js).toContain("document.addEventListener('keydown', allLevelsKeyDown, true)");
	});

	it('styles the trigger and its menu', () => {
		expect(css).toContain('.course-all-levels-trigger');
		expect(css).toContain('.course-all-levels-caret');
		expect(css).toContain('.course-all-levels-menu');
		expect(css).toContain('.course-all-levels-item');
	});
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../courses-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const studentJs = readFileSync(new URL('../../student-courses.js', import.meta.url), 'utf8');

describe('course row actions', () => {
	it('opens a course from its clickable title', () => {
		expect(js).toMatch(/class="course-name-link" onclick="openCourseDetail\('/);
	});

	it('provides open, document, publish and delete actions in the mobile sheet', () => {
		const start = js.indexOf('MobileActionSheet.open(`Course:');
		const end = js.indexOf('\n\t\t\t\t]);', start);
		const actions = js.slice(start, end);
		expect(start).toBeGreaterThan(-1);
		expect(actions).toContain("label: 'Open course'");
		expect(actions).toContain("label: 'Create course document'");
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

	it('uses shared repository questions for category structure subtree counts', () => {
		expect(js).toContain("repo?.getAll_sync?.('questions')");
		expect(js).toContain('question?.category ?? question?.categoryId ?? question?.category_id');
		expect(js).toContain('questionCountForCategoryBranch(category.id, counts, list, tree)');
	});

	it('styles toolbar actions with distinct purpose-based colors', () => {
		expect(css).toContain('.course-detail-actions .course-action-publish');
		expect(css).toContain('.course-detail-actions .course-action-assign');
		expect(css).toContain('.course-detail-actions .course-action-add');
	});

	it('offers generate and copy-prompt actions for lessons on desktop and mobile', () => {
		expect(js).toContain('window.openLessonAIActions = function');
		expect(js).toContain("label: 'Generate lesson with AI'");
		expect(js).toContain("label: 'Copy AI prompt'");
		expect(js).toContain('promptOnly: true');
		expect(js).toContain('window.openLessonAIResult = function');
		expect(js).toContain('window.saveLessonAIResult = async function');
		expect(css).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.course-tree-actions\s*\{\s*display:\s*none;/);
	});

	it('offers PDF and Word course documents with templates and header layouts', () => {
		expect(js).toContain('course-action-document');
		expect(js).toContain('window.createCourseDocument = async function');
		expect(js).toContain('title="Create course document" onclick="createCourseDocument');
		expect(js).toContain('window.exportCourseDocument = async function (format)');
		expect(js).not.toContain("onclick=\"exportCourseDocument('html')\"");
		expect(js).toContain("onclick=\"exportCourseDocument('pdf')\"");
		expect(js).toContain("onclick=\"exportCourseDocument('docx')\"");
		expect(js).toContain('data-course-doc-layout=');
		expect(js).toContain('courseDocIncludeContents');
		expect(js).toContain('window.copyAllCourseAIPrompt = async function');
		expect(js).toContain('window.saveAllCourseAIResult = async function');
	});

	it('offers teacher view/edit modes and renders course view as a linked document', () => {
		expect(js).toContain('window.setCourseDetailMode = function');
		expect(js).toContain('View course');
		expect(js).toContain('Edit content');
		expect(js).toContain('function renderTeacherCourseDocument');
		expect(js).toContain('class="course-document-toc"');
		expect(js).toContain('href="#${esc(courseDocumentLessonId(lesson))}"');
		expect(css).toContain('.course-document-view');
	});

	it('shows students one read-only document with linked contents and inline lesson content', () => {
		expect(studentJs).toContain('student-course-document');
		expect(studentJs).toContain('class="course-document-toc"');
		expect(studentJs).toContain('renderCategoryStructure(currentCourse.category_structure)');
		expect(studentJs).toContain('class="course-document-lesson"');
		expect(studentJs).not.toContain('class="course-lesson-chip');
	});
});

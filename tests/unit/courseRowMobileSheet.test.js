import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../courses-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const studentJs = readFileSync(new URL('../../student-courses.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');

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

	it('offers a reviewed DOCX/PDF course import flow', () => {
		expect(adminHtml).toContain('id="import-course-document-btn"');
		expect(js).toContain('window.openCourseDocumentImportModal = async function');
		expect(js).toContain('/courses/import/preview');
		expect(js).toContain('/courses/import');
		expect(js).toContain('window.addCourseImportHeading = function');
		expect(js).toContain('No AI provider or internet connection is needed.');
		expect(js).toContain('data-import-dropzone');
		expect(js).toContain('window.updateCourseImportFile = function');
		expect(js).toContain('window.clearCourseImportFile = function');
		expect(css).toContain('.course-import-dropzone');
		expect(css).toContain('.course-import-heading-fields');
	});

	it('lets teachers assign selected document lines to a hierarchy level', () => {
		expect(js).toContain('window.toggleCourseImportSelectPage = function');
		expect(js).toContain('window.addSelectedCourseImportSourceLines = function');
		expect(js).toContain('Make selected lines');
		expect(js).toContain('Main category · Level 1');
		expect(js).toContain('Subcategory · Level 2');
		expect(js).toContain('Axis · Level 3');
		expect(css).toContain('.course-import-level-tools');
	});

	it('lets teachers select exact source lines as headings while leaving other lines as content', () => {
		expect(js).toContain('window.renderCourseImportSourcePicker = function');
		expect(js).toContain('data-import-source-line="${entry.line}"');
		expect(js).toContain('window.addSelectedCourseImportSourceLines = function');
		expect(js).toContain('window.changeCourseImportSourcePage = function');
		expect(js).toContain('Lines not added as headings remain content');
		expect(js).toContain('updateCourseImportSourceSearch');
		expect(js).toContain('Find a title in the document');
		expect(css).toContain('.course-import-source-options');
		expect(css).toContain('.course-import-search');
	});

	it('shows and clears inline errors for category names already used in the school', () => {
		expect(js).toContain('window.showCourseImportCategoryConflicts = function');
		expect(js).toContain('window.updateCourseImportConflictUI = function');
		expect(js).toContain('window.clearCourseImportHeadingError = function');
		expect(js).toContain('Rename the highlighted titles');
		expect(css).toContain('.has-category-conflict');
		expect(css).toContain('.course-import-conflict-notice');
	});

	it('offers teacher view/edit modes and renders course view as a linked document', () => {
		expect(js).toContain('window.setCourseDetailMode = function');
		expect(js).toContain('View course');
		expect(js).toContain('Edit content');
		expect(js).toContain('function renderTeacherCourseDocument');
		expect(js).toContain('function renderCourseDocumentContentsNode');
		expect(js).toContain('courseDocumentCategoryId(category)');
		expect(js).toContain('class="course-document-toc"');
		expect(js).toContain('href="#${esc(courseDocumentCategoryId(category))}"');
		expect(js).toContain('node.children.length && lesson.title !== category.name');
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

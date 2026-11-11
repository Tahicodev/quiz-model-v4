import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../courses-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const darkCss = readFileSync(new URL('../../theme-dark.css', import.meta.url), 'utf8');
const studentJs = readFileSync(new URL('../../student-courses.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');

describe('course row actions', () => {
	it('opens a course structure from its clickable title', () => {
		expect(js).toMatch(/class="course-name-link" onclick="\$\{openStructure\}"/);
		expect(js).toContain("openStructureBranch('${esc(course.category_id)}', {courseId:'${esc(course.id)}'})");
	});

	it('opens the record from anywhere on the row, not only the title', () => {
		// Inner controls keep their own click; any other cell opens the course
		// structure (desktop) or the row action sheet (mobile).
		expect(js).toContain("target.closest('button, a, input, select, textarea, label')");
		expect(js).toContain('const openDefault = () => {');
		expect(js).toContain('if (window.innerWidth > 768) {');
		expect(js).toContain('openDefault();');
		expect(css).toContain('#courseList tbody tr[data-row-key] {\n\tcursor: pointer;');
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
		// Actions are the last column; the leading bulk-select checkbox cell
		// shifted it from nth-child(7) to nth-child(8).
		expect(css).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?#courseList tbody td:nth-child\(8\)\s*\{\s*display:\s*none !important;/);
	});

	it('offers prep sheets, exercises and the documents library in both row menus', () => {
		// Desktop popover: one Resources button per row + the menu entries.
		expect(js).toContain('course-action-resources');
		expect(js).toContain('window.openCourseResourcesMenu = function');
		expect(js).toContain("label: 'Prep Sheets'");
		expect(js).toContain("label: 'Exercises (with solutions)'");
		expect(js).toContain("label: 'Generated documents'");
		expect(js).toContain('window.openCourseResource = async function');
		expect(js).toContain('window.openGeneratedDocumentsLibrary = async function');

		// Mobile sheet mirrors the same three destinations, with counts.
		const start = js.indexOf('MobileActionSheet.open(`Course:');
		const end = js.indexOf('\n\t\t\t\t]);', start);
		const actions = js.slice(start, end);
		expect(actions).toContain('label: `Prep Sheets');
		expect(actions).toContain('label: `Exercises');
		expect(actions).toContain('label: `Generated documents');
		expect(actions).toContain("window.openCourseResource('prep-sheets', course.id)");
		expect(actions).toContain("window.openCourseResource('exercises', course.id)");
		expect(actions).toContain('window.openGeneratedDocumentsLibrary(course.id)');

		// The courses toolbar also exposes the library.
		expect(adminHtml).toContain('id="course-documents-btn"');
		expect(adminHtml).toContain('onclick="openGeneratedDocumentsLibrary()"');
	});

	it('shows live progress for the AI level / prep-sheet / exercise batches', () => {
		expect(js).toContain('function courseProgressHtml(state)');
		expect(js).toContain('role="progressbar"');
		expect(js).toContain('aria-valuenow=');
		expect(js).toContain('window.cancelCourseJob = function');
		expect(js).toContain('id="courseProgressHost"');
		expect(js).toContain('id="resourceJobHost"');
		expect(js).toContain('class="course-progress-cancel"');
		expect(css).toContain('.course-progress-track');
		expect(css).toContain('.course-progress-chip.is-failed');
	});

	it('renders an exercise as a situation-problem with a collapsible correction', () => {
		expect(js).toContain('function exercisePreviewHtml(exercise)');
		expect(js).toContain('exercise.situation');
		expect(js).toContain('exercise.givenData');
		expect(js).toContain('exercise.solutionSteps');
		expect(js).toContain('exercise.finalAnswer');
		expect(js).toContain('exercise-solution');
		expect(js).toContain('window.openLessonExercise = function');
		expect(js).toContain('lesson-action-exercise');
		expect(css).toContain('.exercise-solution');
	});

	it('lists generated documents with their in-app path and actions', () => {
		expect(js).toContain('function renderGeneratedDocsBody()');
		expect(js).toContain('Path in the app');
		expect(js).toContain('/generated-documents?');
		expect(js).toContain('window.generatedDocsDownload = async function');
		expect(js).toContain('window.generatedDocsDelete = async function');
		expect(js).toContain('generated-docs-kind kind-');
		expect(css).toContain('.generated-docs-path code');
		expect(css).toContain('.generated-docs-table');
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
		// The Courses toolbar button was removed; the flow stays reachable from
		// the row actions and the quick-import link in the New Course modal.
		expect(adminHtml).not.toContain('id="import-course-document-btn"');
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
		expect(js).toContain('Module · Level 1');
		expect(js).toContain('Chapter · Level 2');
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

	it('lets teachers review and change a lesson course level', () => {
		expect(js).toContain('id="lessonCategory-${esc(lesson.id)}"');
		expect(js).toContain('updateLessonLevelSelection');
		expect(js).toContain('category_id: categoryId');
		expect(js).toContain('<span>Practice target</span>');
		expect(js).not.toContain('id="lessonParent-${esc(lesson.id)}"');
		expect(js).not.toContain('parent_lesson_id: parentLessonId');
		expect(js).not.toContain('Choose a parent title to nest this section, like Word heading levels.');
		expect(js).not.toContain('data-heading-level="${headingLevel}"');
		expect(js).toContain("'Module'");
		expect(js).toContain("'Chapter'");
		expect(js).toContain("'Axis'");
		expect(js).toContain("'Lesson'");
		expect(js).toContain('const categoryType = courseLevelLabel(depth');
		expect(js).toContain('${categoryType} · ${esc(path)}');
		expect(js).not.toContain('>Level ${depth + 1} ·');
		expect(js).toContain('function buildLessonOutline(lessons)');
		expect(js).toContain('function renderTeacherLessonContentsNode(node, depth = 0)');
		expect(css).toContain('.lesson-level-field');
		expect(css).not.toContain('.lesson-parent-field');
	});

	it('keeps course actions beside Back to courses while browsing a structure', () => {
		expect(adminHtml).toContain('id="structureCourseActions"');
		expect(adminHtml).toContain('class="structure-course-actions"');
		expect(js).toContain('function renderStructureCourseActions()');
		expect(js).toContain('View course');
		expect(js).toContain('renameStructureCourse');
		expect(js).toContain('sendStructureCourseToStudents');
		expect(js).toContain('Create document');
		expect(js).toContain('renderStructureCourseActions();');
		expect(css).toContain('.structure-course-actions');
	});

	it('styles teacher course documents, lesson cards, and toolbar for dark mode', () => {
		expect(darkCss).toContain("html[data-theme='dark'] .course-document-view");
		expect(darkCss).toContain("html[data-theme='dark'] .lesson-card");
		expect(darkCss).toContain("html[data-theme='dark'] .course-detail-toolbar");
		expect(darkCss).toContain("html[data-theme='dark'] .course-detail-mode .btn.active");
	});

	it('shows students course, chapter and lesson views with linked lesson content', () => {
		expect(studentJs).toContain('student-course-document');
		expect(studentJs).toContain('function renderCourseView(tree)');
		expect(studentJs).toContain('function renderChapterView(entry)');
		expect(studentJs).toContain('function renderLessonDocumentView(lesson)');
		expect(studentJs).toContain('course-highlights');
		expect(studentJs).toContain('StudentCourses.openChapter');
		expect(studentJs).toContain('StudentCourses.openLesson');
		expect(studentJs).not.toContain('class="course-lesson-chip');
		expect(studentJs).toContain('buildLessonOutline(lessons)');
		expect(studentJs).toContain('renderLessonOutlineNode(node, depth = 0)');
		expect(studentJs).toContain('lesson.parent_lesson_id');
	});
});

describe('training attempts stepper', () => {
	it('pins the stepper box with an id-qualified selector', () => {
		// `input[type='number'] { width: 100% }` lives in the class bucket and
		// outranks a lone `.training-attempts-input`, which used to stretch the
		// field across its cell in the stacked (card) layouts.
		expect(css).toMatch(/input\[type='number'\]/);
		expect(css).toMatch(/#categoryList \.training-attempts-input \{\s*width: 3\.4em;\s*min-width: 0;\s*max-width: 4\.6em;\s*\}/);
	});

	it('keeps the touch-sized stepper compact instead of full width on mobile', () => {
		expect(css).toMatch(/#categoryList \.training-attempts-input \{\s*margin-left: 0;\s*width: 3\.8em;\s*max-width: 5\.4em;/);
		expect(css).not.toMatch(/\.training-attempts-input \{\s*margin-left: 0;\s*width: 3\.8em;\s*max-width: none;/);
	});
});

describe('resource studio status badge', () => {
	it('never wraps or shrinks the Generated / Not generated pill', () => {
		expect(css).toMatch(/\.resource-item-status \{[^}]*flex: none;[^}]*white-space: nowrap;/);
	});
});

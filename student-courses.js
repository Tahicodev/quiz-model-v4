// ============================================
// STUDENT COURSES — read lessons, practice them
// ============================================
// Courses the teacher published and assigned to the student's class arrive
// from GET /api/v1/courses/student (server-side visibility gate: published +
// class-assigned only). Lesson bodies are markdown and are rendered through a
// small escaping renderer — nothing the teacher (or the AI) wrote is ever
// injected as HTML.
//
// "Practice this lesson" pulls the live question set of the lesson's category
// from GET /courses/student/lessons/:id/practice, which ships answers
// stripped, and hands it to the existing training runner
// (window.openTrainingMode(null, { questions, label })). Grading therefore
// stays exactly where training grading lives today: on the server
// (POST /results + /results/:id/corrections).
// ============================================

(function () {
	'use strict';

	let coursesCache = null;
	let currentCourse = null; // { ...course, lessons: [] }

	function esc(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function toast(message, type) {
		if (typeof window.showToast === 'function') {
			window.showToast(message, type || 'info');
		}
	}

	function api() {
		if (!window.API || typeof window.API.raw !== 'function') return null;
		return window.API;
	}

	// ── Markdown subset (same safe contract as the admin lesson preview) ─────
	// Escape first, then rebuild only the structures the generator emits:
	// headings, bullets / numbered lists, `code`, **bold**, *em*, paragraphs.
	function renderMarkdown(md) {
		const source = String(md || '');
		if (!source.trim()) return '';
		const lines = source.replace(/\r\n/g, '\n').split('\n');
		const out = [];
		let listType = null;
		const closeList = () => {
			if (listType) {
				out.push(`</${listType}>`);
				listType = null;
			}
		};
		const openList = (type) => {
			if (listType !== type) {
				closeList();
				out.push(`<${type}>`);
				listType = type;
			}
		};
		const inline = (text) => {
			let html = esc(text);
			html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
			html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
			return html;
		};
		for (const rawLine of lines) {
			const line = rawLine.trimEnd();
			if (!line.trim()) {
				closeList();
				continue;
			}
			const heading = line.match(/^(#{1,4})\s+(.*)$/);
			if (heading) {
				closeList();
				const level = Math.min(heading[1].length + 2, 6);
				out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
				continue;
			}
			const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
			if (bullet) {
				openList('ul');
				out.push(`<li>${inline(bullet[1])}</li>`);
				continue;
			}
			const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
			if (numbered) {
				openList('ol');
				out.push(`<li>${inline(numbered[1])}</li>`);
				continue;
			}
			closeList();
			out.push(`<p>${inline(line)}</p>`);
		}
		closeList();
		return out.join('');
	}

	function panelNote(text) {
		return `<div class="course-student-empty">${esc(text)}</div>`;
	}

	function studentLessonAnchor(lessonId) {
		return `student-course-lesson-${String(lessonId || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
	}

	function renderCategoryStructure(node, depth = 0) {
		if (!node) return '';
		const hasChildren = Array.isArray(node.children) && node.children.length > 0;
		const level = depth === 0 ? 'Category' : hasChildren ? 'Subcategory' : 'Axis';
		const lessons = Array.isArray(node.lessons)
			? node.lessons
			: node.lesson
				? [node.lesson]
				: [];
		const lessonSections = lessons
			.map((summary) => {
				const lesson = (currentCourse?.lessons || []).find((item) => String(item.id) === String(summary.id));
				if (!lesson) return '';
				return (
					`<section class="course-document-lesson" id="${esc(studentLessonAnchor(lesson.id))}">` +
					`<h3><a href="#${esc(studentLessonAnchor(lesson.id))}">${esc(lesson.title)}</a></h3>` +
					(Array.isArray(lesson.category_levels) && lesson.category_levels.length
						? `<nav class="course-lesson-category-path" aria-label="Category structure">` +
							lesson.category_levels
								.map((item) => `<span>${esc(item.name)}</span>`)
								.join('<span class="course-lesson-category-separator" aria-hidden="true">›</span>') +
							'</nav>'
						: '') +
					(lesson.summary ? `<p class="course-lesson-summary">${esc(lesson.summary)}</p>` : '') +
					(lesson.content
						? `<div class="course-md">${renderMarkdown(lesson.content)}</div>`
						: '<p class="course-student-desc">The teacher has not written this lesson yet — check back soon.</p>') +
					`<div class="course-lesson-actions"><button type="button" class="workspace-btn primary" onclick="StudentCourses.practice('${esc(lesson.id)}', this)">Practice this lesson</button></div>` +
					'</section>'
				);
			})
			.join('');
		return (
			`<li class="course-structure-node" style="--course-student-depth:${depth}">` +
			`<div class="course-structure-category"><span class="course-structure-level">${level}</span>` +
			`<strong>${esc(node.name)}</strong></div>${lessonSections}` +
			(hasChildren
				? `<ol>${node.children.map((child) => renderCategoryStructure(child, depth + 1)).join('')}</ol>`
				: '') +
			'</li>'
		);
	}

	// ── Course list ──────────────────────────────────────────────────────────
	async function load(force) {
		const grid = document.getElementById('studentCourseGrid');
		if (!grid) return;
		const A = api();
		if (!A) {
			grid.innerHTML = panelNote('Sign in again to load your courses.');
			return;
		}
		if (force) coursesCache = null;
		if (!coursesCache) {
			grid.innerHTML = panelNote('Loading your courses…');
			try {
				const res = await A.raw('GET', '/courses/student');
				coursesCache = res && Array.isArray(res.data) ? res.data : [];
			} catch (err) {
				console.warn('[student-courses] load failed:', err);
				grid.innerHTML = panelNote('Could not load your courses right now.');
				return;
			}
		}
		renderList();
	}

	function renderList() {
		const grid = document.getElementById('studentCourseGrid');
		const reader = document.getElementById('studentCourseReader');
		if (!grid) return;
		if (reader) {
			reader.style.display = 'none';
			reader.innerHTML = '';
		}
		grid.style.display = 'block';
		currentCourse = null;
		if (!coursesCache || !coursesCache.length) {
			grid.innerHTML = panelNote(
				'No courses yet — your teacher can generate one from their category structure and send it to your class.',
			);
			return;
		}
		grid.innerHTML = coursesCache
			.map(
				(course) =>
					`<div class="exam-card course-student-card" data-course-id="${esc(course.id)}" role="button" tabindex="0" ` +
					`onclick="StudentCourses.openCourse('${esc(course.id)}')" ` +
					`onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();StudentCourses.openCourse('${esc(course.id)}')}">` +
					`<h3>${esc(course.name)}</h3>` +
					(course.description ? `<p class="course-student-desc">${esc(course.description)}</p>` : '') +
					`<div class="course-student-footer"><span class="course-student-meta">${Number(course.lesson_count) || 0} lesson(s)</span>` +
					`<span class="workspace-btn small">Open course</span></div>` +
					'</div>',
			)
			.join('');
	}

	// ── Course reader (lessons + markdown) ───────────────────────────────────
	async function openCourse(courseId) {
		const A = api();
		if (!A) return;
		const grid = document.getElementById('studentCourseGrid');
		const reader = document.getElementById('studentCourseReader');
		if (!reader) return;
		if (grid) {
			grid.style.display = 'none';
			grid.innerHTML = panelNote('Loading course…');
		}
		let course = null;
		try {
			course = await A.raw('GET', `/courses/student/${encodeURIComponent(courseId)}`);
		} catch (err) {
			console.warn('[student-courses] open failed:', err);
			if (grid) {
				grid.style.display = 'block';
				grid.innerHTML = panelNote('Could not open this course — try again.');
			}
			toast('Could not open this course.', 'error');
			return;
		}
		currentCourse = course && Array.isArray(course.lessons) ? course : { ...course, lessons: [] };
		if (grid) grid.innerHTML = '';
		reader.style.display = 'block';
		renderReader();
		try {
			reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (_) {
			/* older browsers */
		}
	}

	function renderReader() {
		const reader = document.getElementById('studentCourseReader');
		if (!reader || !currentCourse) return;
		const lessons = currentCourse.lessons || [];
		const contents = lessons.map((lesson, index) =>
			`<li><a href="#${esc(studentLessonAnchor(lesson.id))}"><span>${index + 1}</span><strong>${esc(lesson.title)}</strong></a>` +
			(lesson.summary ? `<p>${esc(lesson.summary)}</p>` : '') +
			(Array.isArray(lesson.category_levels) && lesson.category_levels.length
				? `<div class="course-document-toc-path">${lesson.category_levels.map((level) => esc(level.name)).join(' › ')}</div>`
				: '') +
			'</li>',
		).join('');
		const categoryStructure = currentCourse.category_structure
			? `<div class="course-document-body"><ol>${renderCategoryStructure(currentCourse.category_structure)}</ol></div>`
			: '';
		const unlinkedIds = new Set(
			(currentCourse.unlinked_lessons || (currentCourse.category_structure ? [] : lessons))
				.map((lesson) => String(lesson.id)),
		);
		const unlinkedLessons = lessons.filter((lesson) => unlinkedIds.has(String(lesson.id)));
		const unlinkedContent = unlinkedLessons.map((lesson) => (
			`<section class="course-document-lesson" id="${esc(studentLessonAnchor(lesson.id))}"><h3><a href="#${esc(studentLessonAnchor(lesson.id))}">${esc(lesson.title)}</a></h3>` +
			(lesson.summary ? `<p class="course-lesson-summary">${esc(lesson.summary)}</p>` : '') +
			(lesson.content ? `<div class="course-md">${renderMarkdown(lesson.content)}</div>` : '<p class="course-student-desc">The teacher has not written this lesson yet — check back soon.</p>') +
			`<div class="course-lesson-actions"><button type="button" class="workspace-btn primary" onclick="StudentCourses.practice('${esc(lesson.id)}', this)">Practice this lesson</button></div></section>`
		)).join('');

		reader.innerHTML =
			`<article class="course-document-view student-course-document"><header class="course-document-cover">` +
			`<button type="button" class="workspace-btn" onclick="StudentCourses.backToList()">&larr; All courses</button>` +
			`<span>Course content</span><h1>${esc(currentCourse.name)}</h1>` +
			(currentCourse.description ? `<p>${esc(currentCourse.description)}</p>` : '') +
			`<div>${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</div></header>` +
			`<nav class="course-document-toc"><h2>Summary and contents</h2>` +
			(currentCourse.description ? `<p class="course-document-overview">${esc(currentCourse.description)}</p>` : '') +
			(contents ? `<ol>${contents}</ol>` : '<p class="course-document-placeholder">This course has no lessons yet.</p>') +
			`</nav>${categoryStructure}${unlinkedContent}</article>`;
	}

	function openLesson(lessonId) {
		if (!currentCourse) return;
		document.getElementById(studentLessonAnchor(lessonId))?.scrollIntoView({
			behavior: 'smooth',
			block: 'start',
		});
	}

	function backToList() {
		renderList();
	}

	// ── Practice (server-served, answers stripped) ───────────────────────────
	async function practice(lessonId, btn) {
		const A = api();
		if (!A || !currentCourse) return;
		const lesson = (currentCourse.lessons || []).find((l) => String(l.id) === String(lessonId));
		const label = btn ? btn.textContent : '';
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'Loading…';
		}
		let res = null;
		try {
			res = await A.raw('GET', `/courses/student/lessons/${encodeURIComponent(lessonId)}/practice`);
		} catch (err) {
			console.warn('[student-courses] practice load failed:', err);
			toast('Could not load the practice questions.', 'error');
			return;
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = label || 'Practice this lesson';
			}
		}
		const questions = res && Array.isArray(res.data) ? res.data : [];
		if (!questions.length) {
			toast('No questions in this lesson yet — your teacher can generate them.', 'warning');
			return;
		}
		if (typeof window.openTrainingMode !== 'function') {
			toast('Training runner unavailable — reload the page.', 'error');
			return;
		}
		// Existing training modal + server-side grading, fed with this lesson's
		// questions instead of the local question bank.
		window.openTrainingMode(null, {
			questions,
			label: `Lesson: ${lesson ? lesson.title : currentCourse.name}`,
		});
	}

	window.StudentCourses = {
		load,
		renderList,
		openCourse,
		openLesson,
		backToList,
		practice,
		renderMarkdown,
	};

	// First paint when the DOM is ready so switching to the tab feels instant;
	// the tab hook in student-workspace.js refreshes on activation.
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			load().catch(() => {});
		});
	} else {
		load().catch(() => {});
	}
})();

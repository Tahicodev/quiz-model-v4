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
	// Reader state: 'course' lists modules/chapters, 'chapter' lists its
	// lessons, 'lesson' shows one lesson body.
	let currentView = { level: 'course', chapterId: null, lessonId: null };
	let categoryEntryById = new Map();
	let fullLessonById = new Map();

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

	// Canonical curriculum vocabulary, mirroring the admin side: level 0 is a
	// Module, level 1 a Chapter, deeper groupings an Axis, and every leaf is
	// a Lesson (the unit a student reads and practices).
	function categoryLevelLabel(node, depth) {
		if (depth === 0) return 'Module';
		const hasChildren = Array.isArray(node.children) && node.children.length;
		if (!hasChildren) return 'Lesson';
		return depth === 1 ? 'Chapter' : 'Axis';
	}

	// ── Category tree helpers (course → chapter → lesson views) ─────────────

	function indexCategoryTree(root) {
		const entries = new Map();
		const walk = (node, depth, parent, path) => {
			if (!node) return;
			const entry = { node, depth, parent, path: [...path, node] };
			entries.set(String(node.id), entry);
			(node.children || []).forEach((child) => walk(child, depth + 1, entry, entry.path));
		};
		walk(root, 0, null, []);
		return entries;
	}

	function countLessons(node) {
		if (!node) return 0;
		const own = Array.isArray(node.lessons) ? node.lessons.length : 0;
		return (node.children || []).reduce((sum, child) => sum + countLessons(child), own);
	}

	function lessonsUnder(node) {
		if (!node) return [];
		const categoryIds = new Set();
		const lessonIds = new Set();
		const walk = (item) => {
			categoryIds.add(String(item.id));
			for (const summary of item.lessons || []) lessonIds.add(String(summary.id));
			(item.children || []).forEach(walk);
		};
		walk(node);
		return (currentCourse?.lessons || []).filter(
			(lesson) =>
				categoryIds.has(String(lesson.category_id)) || lessonIds.has(String(lesson.id)),
		);
	}

	// Aggregated Objectives / Key concepts for every node, computed from the
	// full lesson payload. The server already ships these, but recomputing here
	// keeps the fallback tree and older payloads working.
	function attachNodeHighlights(root) {
		const seen = new Set();
		const visit = (node) => {
			if (!node || seen.has(String(node.id))) return { objectives: [], keyConcepts: [] };
			seen.add(String(node.id));
			const objectives = [];
			const keyConcepts = [];
			const add = (target, values) => {
				for (const item of values || []) {
					if (target.length >= 24) break;
					if (item && !target.includes(item)) target.push(item);
				}
			};
			for (const summary of node.lessons || []) {
				const lesson = fullLessonById.get(String(summary.id));
				add(objectives, lesson?.objectives);
				add(keyConcepts, lesson?.key_concepts);
			}
			for (const child of node.children || []) {
				const nested = visit(child);
				add(objectives, nested.objectives);
				add(keyConcepts, nested.keyConcepts);
			}
			node.objectives = objectives;
			node.key_concepts = keyConcepts;
			return { objectives, keyConcepts };
		};
		visit(root);
	}

	function renderHighlights(node, title) {
		const objectives = Array.isArray(node?.objectives) ? node.objectives : [];
		const keyConcepts = Array.isArray(node?.key_concepts) ? node.key_concepts : [];
		if (!objectives.length && !keyConcepts.length) return '';
		const column = (heading, items, tone) =>
			`<div class="course-highlights-col course-highlights-col--${tone}"><h3>${esc(heading)}</h3><ul>` +
			items.map((item) => `<li>${esc(item)}</li>`).join('') +
			'</ul></div>';
		return (
			`<section class="course-highlights"><div class="course-highlights-head">` +
			`<span class="course-highlights-kicker">Learning goals</span><h2>${esc(title)}</h2></div>` +
			`<div class="course-highlights-grid">` +
			(objectives.length ? column('Objectives', objectives, 'objectives') : '') +
			(keyConcepts.length ? column('Key concepts', keyConcepts, 'concepts') : '') +
			'</div></section>'
		);
	}

	function renderChapterCard(node, depth) {
		const level = categoryLevelLabel(node, depth);
		const count = countLessons(node);
		const goals = Array.isArray(node.objectives) ? node.objectives.length : 0;
		return (
			`<button type="button" class="course-outline-card" onclick="StudentCourses.openChapter('${esc(node.id)}')">` +
			`<span class="course-outline-level">${esc(level)}</span>` +
			`<strong class="course-outline-name">${esc(node.name)}</strong>` +
			`<span class="course-outline-meta">${count} lesson${count === 1 ? '' : 's'}` +
			(goals ? ` · ${goals} goal${goals === 1 ? '' : 's'}` : '') +
			`</span><span class="course-outline-cta">Open ${esc(level.toLowerCase())} <span aria-hidden="true">→</span></span></button>`
		);
	}

	function normalizedLessonTitle(value) {
		return String(value || '')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[#*_`]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase();
	}

	/** Drop a leading Markdown heading that repeats the lesson title already
	 * rendered by the reader, so the student never sees the same name twice. */
	function stripDuplicateLessonHeading(markdown, title) {
		const source = String(markdown || '');
		const wanted = normalizedLessonTitle(title);
		if (!wanted) return source;
		const lines = source.replace(/\r\n/g, '\n').split('\n');
		let index = 0;
		while (index < lines.length && !lines[index].trim()) index += 1;
		const heading = lines[index]?.match(/^#{1,4}\s+(.*)$/);
		if (!heading || normalizedLessonTitle(heading[1]) !== wanted) return source;
		lines.splice(index, 1);
		return lines.join('\n').replace(/^\s*\n/, '');
	}

	function renderLessonCard(lesson, kicker, { compact = false } = {}) {
		const summary = String(lesson?.summary || '').trim();
		const title = String(lesson?.title || 'Lesson');
		const kickerText = String(kicker || '').trim();
		const showKicker = kickerText && normalizedLessonTitle(kickerText) !== normalizedLessonTitle(title);
		return (
			`<article class="course-lesson-card${compact ? ' course-lesson-card--compact' : ''}">` +
			(showKicker ? `<span class="course-lesson-kicker">${esc(kickerText)}</span>` : '') +
			`<h3>${esc(title)}</h3>` +
			(summary ? `<p class="course-lesson-summary">${esc(summary)}</p>` : '') +
			`<div class="course-lesson-actions"><button type="button" class="workspace-btn primary" onclick="StudentCourses.openLesson('${esc(lesson?.id)}')">Read lesson</button></div>` +
			'</article>'
		);
	}

	function scrollReaderTop() {
		const reader = document.getElementById('studentCourseReader');
		if (!reader) return;
		try {
			reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (_) {
			/* older browsers */
		}
	}

	function viewBackButton(label, action) {
		return (
			`<div class="course-document-cover-top"><button type="button" class="course-document-back" onclick="${action}">` +
			`<span aria-hidden="true">&larr;</span> ${esc(label)}</button>` +
			`<span class="course-document-cover-label">Course content</span></div>`
		);
	}

	function renderCourseView(tree) {
		const root = tree;
		const chapters = root.children || [];
		const rootLessons = (currentCourse.lessons || []).filter(
			(lesson) => String(lesson.category_id) === String(root.id),
		);
		const unlinkedIds = new Set((currentCourse.unlinked_lessons || []).map((lesson) => String(lesson.id)));
		const unlinked = (currentCourse.lessons || []).filter((lesson) => unlinkedIds.has(String(lesson.id)));
		const summary =
			String(currentCourse.description || '').trim() ||
			(currentCourse.lessons || [])
				.map((lesson) => String(lesson.summary || '').trim())
				.filter(Boolean)
				.join('\n\n');
		const total = countLessons(root);
		const outlineCards = [
			...chapters.map((child) => {
				// A leaf chapter (no nesting) is really a lesson container: show
				// its lessons directly instead of an extra click through a card.
				if (!(child.children || []).length) {
					const leafLessons = lessonsUnder(child);
					if (leafLessons.length) {
						return leafLessons
							.map((lesson) => renderLessonCard(lesson, child.name, { compact: true }))
							.join('');
					}
				}
				return renderChapterCard(child, 1);
			}),
			...rootLessons.map((lesson) => renderLessonCard(lesson, root.name, { compact: true })),
		].join('');
		const unlinkedBlock = unlinked.length
			? `<section class="course-view-section"><div class="course-view-heading"><h2>Additional content</h2>` +
				`<span>${unlinked.length} lesson${unlinked.length === 1 ? '' : 's'}</span></div>` +
				`<div class="course-lesson-grid">${unlinked
					.map((lesson) => renderLessonCard(lesson, 'Course', { compact: true }))
					.join('')}</div></section>`
			: '';
		return (
			`<article class="course-document-view student-course-document">` +
			`<header class="course-document-cover">${viewBackButton('All courses', 'StudentCourses.backToList()')}` +
			`<h1>${esc(currentCourse.name)}</h1>` +
			(summary ? `<p class="course-document-overview">${esc(summary)}</p>` : '') +
			`<div class="course-document-section-count">${total} lesson${total === 1 ? '' : 's'}</div></header>` +
			renderHighlights(root, 'What this course will teach you') +
			`<section class="course-view-section"><div class="course-view-heading"><h2>Course outline</h2>` +
			`<span>${chapters.length} chapter${chapters.length === 1 ? '' : 's'}</span></div>` +
			(outlineCards
				? `<div class="course-outline-grid">${outlineCards}</div>`
				: panelNote('This course has no lessons yet — your teacher is still preparing it.')) +
			`</section>${unlinkedBlock}</article>`
		);
	}

	function renderChapterView(entry) {
		const node = entry.node;
		const pathNames = entry.path.map((item) => item.name);
		const chapterLessons = lessonsUnder(node);
		const cards = chapterLessons
			.map((lesson) => {
				const category = categoryEntryById.get(String(lesson.category_id));
				const kicker =
					category && String(category.node.id) !== String(node.id) ? category.node.name : '';
				return renderLessonCard(lesson, kicker);
			})
			.join('');
		return (
			`<article class="course-document-view student-course-document">` +
			`<header class="course-document-cover">${viewBackButton('Course outline', 'StudentCourses.backToCourse()')}` +
			`<p class="course-view-breadcrumb">${pathNames
				.map((name) => esc(name))
				.join(' <span aria-hidden="true">/</span> ')}</p>` +
			`<span class="course-structure-level">${esc(categoryLevelLabel(node, entry.depth))}</span>` +
			`<h1>${esc(node.name)}</h1>` +
			`<div class="course-document-section-count">${chapterLessons.length} lesson${chapterLessons.length === 1 ? '' : 's'}</div></header>` +
			renderHighlights(node, 'What this chapter will teach you') +
			`<section class="course-view-section"><div class="course-view-heading"><h2>Lessons</h2>` +
			`<span>${chapterLessons.length}</span></div>` +
			(cards
				? `<div class="course-lesson-grid">${cards}</div>`
				: panelNote('This chapter has no lesson yet.')) +
			`</section></article>`
		);
	}

	function renderLessonDocumentView(lesson) {
		if (!lesson) return panelNote('This lesson is no longer available.');
		const categoryEntry = categoryEntryById.get(String(lesson.category_id));
		const hasChapter = Boolean(currentView.chapterId);
		const pathNames = categoryEntry?.path?.map((item) => item.name) || [];
		return (
			`<article class="course-document-view student-course-document">` +
			`<header class="course-document-cover">` +
			viewBackButton(hasChapter ? 'Back to chapter' : 'Course outline', hasChapter ? 'StudentCourses.backToChapter()' : 'StudentCourses.backToCourse()') +
			(pathNames.length
				? `<p class="course-view-breadcrumb">${pathNames
						.map((name) => esc(name))
						.join(' <span aria-hidden="true">/</span> ')}</p>`
				: '') +
			(categoryEntry
				? `<span class="course-structure-level">${esc(categoryLevelLabel(categoryEntry.node, categoryEntry.depth))}</span>`
				: '') +
			`<h1>${esc(lesson.title || 'Lesson')}</h1>` +
			(lesson.summary ? `<p class="course-document-overview">${esc(lesson.summary)}</p>` : '') +
			`</header><div class="course-document-body">` +
			(lesson.content
				? `<div class="course-md">${renderMarkdown(stripDuplicateLessonHeading(lesson.content, lesson.title))}</div>`
				: '<p class="course-student-desc">The teacher has not written this lesson yet — check back soon.</p>') +
			`<div class="course-lesson-actions"><button type="button" class="workspace-btn primary" onclick="StudentCourses.practice('${esc(lesson.id)}', this)">Practice this lesson</button></div>` +
			`</div></article>`
		);
	}

	function buildFallbackCourseStructure(course, lessons) {
		const rootLevel = lessons
			.flatMap((lesson) => Array.isArray(lesson.category_levels) ? lesson.category_levels : [])
			.find((level) => String(level?.id || '').trim() && String(level?.name || '').trim());
		const rootId = course.category_id || rootLevel?.id;
		const root = {
			id: rootId || `course-${course.id || 'content'}`,
			name:
				rootLevel && String(rootLevel.id) === String(rootId)
					? String(rootLevel.name)
					: course.name || 'Course',
			children: [],
			lessons: [],
			lesson: null,
		};

		lessons.forEach((lesson) => {
			let node = root;
			const levels = Array.isArray(lesson.category_levels)
				? lesson.category_levels
				: [];
			if (!levels.length) {
				node = {
					id: `course-lesson-${lesson.id}`,
					name: String(lesson.title || 'Lesson'),
					children: [],
					lessons: [],
					lesson: null,
				};
				root.children.push(node);
			}
			levels.forEach((level) => {
				const id = String(level?.id || '').trim();
				const name = String(level?.name || '').trim();
				if (!id || !name) return;
				if (id === String(root.id)) {
					root.name = name;
					return;
				}
				let child = node.children.find((item) => item.id === id);
				if (!child) {
					child = { id, name, children: [], lessons: [], lesson: null };
					node.children.push(child);
				}
				node = child;
			});
			const summary = {
				id: String(lesson.id),
				title: String(lesson.title || 'Lesson'),
			};
			node.lessons.push(summary);
			if (!node.lesson) node.lesson = summary;
		});

		return root;
	}

	function buildLessonOutline(lessons) {
		const nodes = new Map(
			lessons.map((lesson) => [
				String(lesson.id),
				{ lesson, parent: null, children: [] },
			]),
		);
		for (const node of nodes.values()) {
			const parent = nodes.get(String(node.lesson.parent_lesson_id || ''));
			if (parent && parent !== node) node.parent = parent;
		}
		for (const node of nodes.values()) {
			const path = new Set([String(node.lesson.id)]);
			let ancestor = node.parent;
			while (ancestor) {
				const id = String(ancestor.lesson.id);
				if (path.has(id)) {
					node.parent = null;
					break;
				}
				path.add(id);
				ancestor = ancestor.parent;
			}
		}
		const roots = [];
		for (const node of nodes.values()) {
			if (node.parent) node.parent.children.push(node);
			else roots.push(node);
		}
		const sort = (siblings) => {
			siblings.sort(
				(a, b) =>
					(Number(a.lesson.order_index) || 0) -
					(Number(b.lesson.order_index) || 0),
			);
			siblings.forEach((node) => sort(node.children));
		};
		sort(roots);
		return roots;
	}

	function renderLessonOutlineContents(node, depth = 0) {
		const lesson = node.lesson;
		return (
			`<li><a href="#${esc(studentLessonAnchor(lesson.id))}">` +
			`<span>Lesson ${depth + 1}</span><strong>${esc(lesson.title || 'Lesson')}</strong></a>` +
			(node.children.length
				? `<ol>${node.children.map((child) => renderLessonOutlineContents(child, depth + 1)).join('')}</ol>`
				: '') +
			'</li>'
		);
	}

	function renderLessonOutlineNode(node, depth = 0) {
		const lesson = node.lesson;
		const headingLevel = Math.min(depth + 2, 6);
		return (
			`<li class="course-structure-node" id="${esc(studentLessonAnchor(lesson.id))}" style="--course-student-depth:${depth}">` +
			`<div class="course-structure-category"><span class="course-structure-level">Lesson · Level ${depth + 1}</span>` +
			`<h${headingLevel}>${esc(lesson.title || 'Lesson')}</h${headingLevel}></div>` +
			`<section class="course-document-lesson">` +
			(lesson.summary ? `<p class="course-lesson-summary">${esc(lesson.summary)}</p>` : '') +
(lesson.content
					? `<div class="course-md">${renderMarkdown(stripDuplicateLessonHeading(lesson.content, lesson.title))}</div>`
					: '<p class="course-student-desc">The teacher has not written this lesson yet — check back soon.</p>') +
			`<div class="course-lesson-actions"><button type="button" class="workspace-btn primary" onclick="StudentCourses.practice('${esc(lesson.id)}', this)">Practice this section</button></div>` +
			`</section>${node.children.length ? `<ol>${node.children.map((child) => renderLessonOutlineNode(child, depth + 1)).join('')}</ol>` : ''}</li>`
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
				'No courses yet — your teacher can generate one from their course outline and send it to your class.',
			);
			return;
		}
		grid.innerHTML = coursesCache
			.map(
				(course, index) =>
					`<div class="exam-card course-student-card" data-course-id="${esc(course.id)}" role="button" tabindex="0" ` +
					`data-course-tone="${index % 4}" aria-label="Open course: ${esc(course.name)}" ` +
					`onclick="StudentCourses.openCourse('${esc(course.id)}')" ` +
					`onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();StudentCourses.openCourse('${esc(course.id)}')}">` +
					`<div class="course-student-card-top"><span class="course-student-icon" aria-hidden="true">✦</span><span class="course-student-kicker">Learning path</span></div>` +
					`<div class="course-student-copy"><h3>${esc(course.name)}</h3>` +
					(course.description ? `<p class="course-student-desc">${esc(course.description)}</p>` : '') +
					`</div><div class="course-student-footer"><span class="course-student-meta"><span class="course-student-meta-icon" aria-hidden="true">▤</span>${Number(course.lesson_count) || 0} ${(Number(course.lesson_count) || 0) === 1 ? 'section' : 'sections'}</span>` +
					`<span class="course-student-action">Open course <span aria-hidden="true">→</span></span></div>` +
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
		currentView = { level: 'course', chapterId: null, lessonId: null };
		if (grid) grid.innerHTML = '';
		reader.style.display = 'block';
		renderReader();
		scrollReaderTop();
	}

	function renderReader() {
		const reader = document.getElementById('studentCourseReader');
		if (!reader || !currentCourse) return;
		const lessons = currentCourse.lessons || [];
		fullLessonById = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));

		// Lessons nested through parent_lesson_id keep the original
		// single-document outline: one scrollable lesson tree.
		if (lessons.some((lesson) => lesson.parent_lesson_id)) {
			renderOutlineDocument(reader, lessons);
			return;
		}

		const tree =
			currentCourse.category_structure ||
			(lessons.length ? buildFallbackCourseStructure(currentCourse, lessons) : null);
		if (!tree) {
			reader.innerHTML = panelNote('This course has no content yet.');
			return;
		}
		categoryEntryById = indexCategoryTree(tree);
		attachNodeHighlights(tree);

		if (currentView.level === 'lesson') {
			reader.innerHTML = renderLessonDocumentView(fullLessonById.get(String(currentView.lessonId)));
			return;
		}
		if (currentView.level === 'chapter') {
			const entry = categoryEntryById.get(String(currentView.chapterId));
			reader.innerHTML = entry ? renderChapterView(entry) : renderCourseView(tree);
			return;
		}
		reader.innerHTML = renderCourseView(tree);
	}

	function renderOutlineDocument(reader, lessons) {
		const lessonOutline = buildLessonOutline(lessons);
		const contents = lessonOutline.map((node) => renderLessonOutlineContents(node)).join('');
		const body = `<div class="course-document-body"><ol>${lessonOutline
			.map((node) => renderLessonOutlineNode(node))
			.join('')}</ol></div>`;
		const summary =
			String(currentCourse.description || '').trim() ||
			lessons
				.map((lesson) => String(lesson.summary || '').trim())
				.filter(Boolean)
				.join('\n\n') ||
			'Your teacher has not added a course summary yet.';
		reader.innerHTML =
			`<article class="course-document-view student-course-document"><header class="course-document-cover">` +
			`<div class="course-document-cover-top"><button type="button" class="course-document-back" onclick="StudentCourses.backToList()"><span aria-hidden="true">&larr;</span> All courses</button>` +
			`<span class="course-document-cover-label">Course content</span></div><h1>${esc(currentCourse.name)}</h1>` +
			`<div class="course-document-section-count">${lessons.length} content section${lessons.length === 1 ? '' : 's'}</div></header>` +
			`<nav class="course-document-toc"><h2>Summary and contents</h2>` +
			`<p class="course-document-overview">${esc(summary)}</p>` +
			(contents
				? `<ol>${contents}</ol>`
				: '<p class="course-document-placeholder">This course has no content yet.</p>') +
			`</nav>${body}</article>`;
	}

	function openCourseView() {
		currentView = { level: 'course', chapterId: null, lessonId: null };
		renderReader();
		scrollReaderTop();
	}

	function openChapter(chapterId) {
		if (!currentCourse) return;
		currentView = { level: 'chapter', chapterId: String(chapterId), lessonId: null };
		renderReader();
		scrollReaderTop();
	}

	function openLesson(lessonId) {
		if (!currentCourse) return;
		const lessons = currentCourse.lessons || [];
		// Lesson-nesting outline mode is a single scrolled document.
		if (lessons.some((lesson) => lesson.parent_lesson_id)) {
			document.getElementById(studentLessonAnchor(lessonId))?.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
			});
			return;
		}
		const lesson = fullLessonById.get(String(lessonId)) || lessons.find((item) => String(item.id) === String(lessonId));
		const entry = lesson ? categoryEntryById.get(String(lesson.category_id)) : null;
		let chapterEntry = entry;
		while (chapterEntry && chapterEntry.depth > 1) chapterEntry = chapterEntry.parent;
		currentView = {
			level: 'lesson',
			chapterId: chapterEntry ? String(chapterEntry.node.id) : null,
			lessonId: String(lessonId),
		};
		renderReader();
		scrollReaderTop();
	}

	function backToCourse() {
		openCourseView();
	}

	function backToChapter() {
		if (currentView.chapterId) {
			openChapter(currentView.chapterId);
			return;
		}
		openCourseView();
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
				btn.textContent = label || 'Practice this section';
			}
		}
		const questions = res && Array.isArray(res.data) ? res.data : [];
		if (!questions.length) {
			toast('No questions in this section yet — your teacher can generate them.', 'warning');
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
			label: `Section: ${
				lesson?.category_levels?.[lesson.category_levels.length - 1]?.name || lesson?.title || currentCourse.name
			}`,
			courseTitle: currentCourse.name,
			lessonTitle:
				lesson?.category_levels?.[lesson.category_levels.length - 1]?.name ||
				lesson?.title ||
				'Course practice',
			categoryId: res?.category?.id || lesson?.category_id || '',
			categoryTitle: res?.category?.name || '',
		});
	}

	window.StudentCourses = {
		load,
		renderList,
		openCourse,
		openChapter,
		openLesson,
		backToCourse,
		backToChapter,
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

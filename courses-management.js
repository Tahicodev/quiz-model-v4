// ============================================
// COURSES MANAGEMENT — AI course content from category branches
// ============================================
// Teacher surface for the /api/v1/courses domain:
//  • list of the teacher's own courses (admins: all)
//  • "New Course from Categories": AI generates a lesson skeleton from a
//    category branch (same pipeline as the AI Question Generator)
//  • detail view: category structure tree + lesson editor, per-lesson
//    "Generate course content via AI" and "Generate questions" shortcuts
//  • publish + class assignment ("Send to students")
// Loads after category-management.js / questions-management.js and reuses
// their globals (categories mirror, window.CategoryTree, openAIGeneratorModal).
// ============================================

(function () {
	'use strict';

	let coursesCache = [];
	let currentCourse = null; // full course with lessons (detail view)
	let aiConfigsCache = null;
	let courseBatchGenerating = false;
	let prepSheetBatchGenerating = false;
	let publishAfterAssignCourseId = null;
	let courseDetailMode = 'view';
	let selectedCourseConfigId = '';
	let collapsedCourseCategoryIds = new Set();
	let courseImportDraft = null;

	function esc(s) {
		return String(s ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function toast(msg, type) {
		if (typeof window.showToast === 'function') window.showToast(msg, type || 'success');
	}

	function api() {
		if (!window.API || typeof window.API.raw !== 'function') {
			toast('API client not ready — reload the page.', 'error');
			return null;
		}
		return window.API;
	}

	function fmtDate(value) {
		try {
			if (!value) return '—';
			return new Date(value).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		} catch (_) {
			return '—';
		}
	}

	// Local mirror of the category list (category-management.js global).
	function categoryList() {
		try {
			if (typeof categories !== 'undefined' && Array.isArray(categories)) return categories;
		} catch (_) { /* not loaded yet */ }
		return [];
	}

	function subjectList() {
		try {
			const rows = window.__DI_CONTAINER__?.repo?.getAll_sync?.('subjects');
			return Array.isArray(rows) ? rows : [];
		} catch (_) {
			return [];
		}
	}

	// Per-category direct question counts from the shared admin repository.
	// The course page is a separate classic script, so it cannot depend on the
	// question editor's lexical `questions` binding being globally visible.
	function questionCountByCategory() {
		const counts = new Map();
		let rows = null;
		try {
			const repo = window.__DI_CONTAINER__?.repo;
			const stored = repo?.getAll_sync?.('questions');
			if (Array.isArray(stored)) rows = stored;
		} catch (_) {
			// Fall back to the legacy mirror if the repository is not ready.
		}
		if (!rows) {
			try {
				if (typeof questions !== 'undefined' && Array.isArray(questions)) rows = questions;
			} catch (_) {
				// The question mirror can be scoped to its own classic script.
			}
		}
		if (!rows) return counts;

		const byId = new Map(categoryList().map((category) => [String(category.id), category]));
		const byName = new Map();
		for (const category of categoryList()) {
			if (category?.name && !byName.has(String(category.name))) {
				byName.set(String(category.name), category);
			}
		}
		for (const question of rows) {
			const ref = question?.category ?? question?.categoryId ?? question?.category_id;
			const category = byId.get(String(ref ?? '')) || byName.get(String(ref ?? ''));
			if (!category) continue;
			const id = String(category.id);
			counts.set(id, (counts.get(id) || 0) + 1);
		}
		return counts;
	}

	function questionCountForCategoryBranch(categoryId, counts, categories, tree) {
		const ids = [categoryId, ...(tree ? tree.getDescendantIds(categoryId, categories) : [])];
		return ids.reduce((total, id) => total + (counts.get(String(id)) || 0), 0);
	}

	function categoryPath(id) {
		const tree = window.CategoryTree;
		if (tree) {
			try { return tree.getPath(id, categoryList()); } catch (_) { /* fall through */ }
		}
		const cat = categoryList().find((c) => String(c.id) === String(id));
		return cat ? String(cat.name || '') : '';
	}

	// Canonical curriculum vocabulary, shared by every course surface:
	// level 0 = Module, level 1 = Chapter, deeper groupings = Axis, and
	// every leaf is a Lesson (the unit that gets content + practice questions).
	function courseLevelLabel(depth, isLeaf) {
		if (depth === 0) return 'Module';
		if (isLeaf) return 'Lesson';
		return depth === 1 ? 'Chapter' : 'Axis';
	}

	function courseCollapseStorageKey(courseId) {
		return `quizCollapsedCourseCategories:${courseId}`;
	}

	function loadCollapsedCourseCategories(courseId) {
		try {
			const stored = JSON.parse(localStorage.getItem(courseCollapseStorageKey(courseId)) || '[]');
			collapsedCourseCategoryIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
		} catch (_) {
			collapsedCourseCategoryIds = new Set();
		}
	}

	function persistCollapsedCourseCategories() {
		if (!currentCourse?.id) return;
		try {
			localStorage.setItem(
				courseCollapseStorageKey(currentCourse.id),
				JSON.stringify([...collapsedCourseCategoryIds]),
			);
		} catch (_) {
			/* Private browsing can disable storage; the tree still works until navigation. */
		}
	}

	function updateCourseTreeVisibility() {
		const rows = Array.from(document.querySelectorAll('#courseDetailPane .course-tree-row'));
		const categories = new Map(categoryList().map((category) => [String(category.id), category]));
		for (const row of rows) {
			let parentId = String(categories.get(row.dataset.categoryId)?.parent_id || '');
			let hidden = false;
			const seen = new Set();
			while (parentId && !seen.has(parentId)) {
				if (collapsedCourseCategoryIds.has(parentId)) {
					hidden = true;
					break;
				}
				seen.add(parentId);
				parentId = String(categories.get(parentId)?.parent_id || '');
			}
			row.hidden = hidden;
		}
		for (const button of document.querySelectorAll('#courseDetailPane [data-course-collapse]')) {
			const collapsed = collapsedCourseCategoryIds.has(button.dataset.courseCollapse);
			button.textContent = collapsed ? '+' : '−';
			button.setAttribute('aria-expanded', String(!collapsed));
			button.title = collapsed ? 'Show subcategories' : 'Hide subcategories';
		}
	}

	window.toggleCourseCategory = function (categoryId) {
		const key = String(categoryId);
		if (collapsedCourseCategoryIds.has(key)) collapsedCourseCategoryIds.delete(key);
		else collapsedCourseCategoryIds.add(key);
		persistCollapsedCourseCategories();
		updateCourseTreeVisibility();
	};

	window.setCourseCategoriesCollapsed = function (collapse) {
		const panel = document.querySelector('#courseDetailPane .course-tree');
		if (!panel) return;
		for (const button of panel.querySelectorAll('[data-course-collapse]')) {
			const key = button.dataset.courseCollapse;
			if (collapse) collapsedCourseCategoryIds.add(key);
			else collapsedCourseCategoryIds.delete(key);
		}
		persistCollapsedCourseCategories();
		updateCourseTreeVisibility();
	};

	// ── Minimal safe markdown renderer (shared contract with the student
	// workspace reader): everything is escaped first, then a small markdown
	// subset is turned into HTML. No raw HTML ever survives.
	function renderMarkdown(md) {
		const source = String(md || '');
		if (!source.trim()) return '';
		const lines = source.replace(/\r\n/g, '\n').split('\n');
		const out = [];
		let listType = null; // 'ul' | 'ol'
		const closeList = () => {
			if (listType) { out.push(`</${listType}>`); listType = null; }
		};
		const openList = (type) => {
			if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
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
			if (!line.trim()) { closeList(); continue; }
			const heading = line.match(/^(#{1,4})\s+(.*)$/);
			if (heading) {
				closeList();
				const level = Math.min(heading[1].length + 2, 6);
				out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
				continue;
			}
			const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
			if (bullet) { openList('ul'); out.push(`<li>${inline(bullet[1])}</li>`); continue; }
			const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
			if (numbered) { openList('ol'); out.push(`<li>${inline(numbered[1])}</li>`); continue; }
			closeList();
			out.push(`<p>${inline(line)}</p>`);
		}
		closeList();
		return out.join('');
	}
	window.renderCourseMarkdown = renderMarkdown;

	// ── Modal helper (reuses the legacy .modal / .modal.active CSS) ──────────
	function openModal(id, title, bodyHtml, footerHtml, extraClass) {
		closeCourseModal(id);
		const overlay = document.createElement('div');
		overlay.id = id;
		overlay.className = `modal active ${extraClass || ''}`;
		overlay.innerHTML =
			`<div class="modal-content ${extraClass || ''}" style="max-width:640px;width:92%;">` +
			`<div class="modal-header"><h3>${esc(title)}</h3>` +
			`<button type="button" class="modal-close" onclick="closeCourseModal('${id}')">&times;</button></div>` +
			`<div class="modal-body" style="max-height:70vh;overflow:auto;">${bodyHtml}</div>` +
			`<div class="modal-footer">${footerHtml}</div></div>`;
		document.body.appendChild(overlay);
		return overlay;
	}
	// The closer is also referenced from the generated markup, hence the
	// window alias next to the local one.
	function closeCourseModal(id) {
		const el = document.getElementById(id);
		if (el && typeof el.remove === 'function') el.remove();
		if (id === 'courseAssignModal') publishAfterAssignCourseId = null;
	}
	window.closeCourseModal = closeCourseModal;

	// ── Course meta modal ────────────────────────────────────────────────────
	// Shared shell for the two "edit course" dialogs (bulk-bar "Edit course"
	// and the detail pane's "Course details"). It carries an eyebrow / title /
	// subtitle header, a read-only context strip (subject · branch · status)
	// and the unified footer, so both entry points look identical. Field ids
	// are passed in so the existing save functions keep working unchanged.
	function subjectNameFor(subjectId) {
		if (!subjectId) return '';
		const found = subjectList().find((s) => String(s.id) === String(subjectId));
		return found ? String(found.name || '') : '';
	}

	function courseContextChips(course) {
		const chips = [];
		const subject = subjectNameFor(course?.subject_id);
		if (subject) chips.push({ label: 'Subject', value: subject });
		const branch = course?.category_path || categoryPath(course?.category_id) || '';
		if (branch) chips.push({ label: 'Module', value: branch });
		chips.push({ label: 'Status', value: course?.status === 'published' ? 'Published' : 'Draft' });
		return chips;
	}

	function openCourseMetaModal(opts) {
		const { id } = opts;
		closeCourseModal(id);
		const chips = Array.isArray(opts.context) ? opts.context : [];
		const overlay = document.createElement('div');
		overlay.id = id;
		overlay.className = 'modal active course-meta-modal';
		overlay.innerHTML =
			`<div class="modal-content course-meta-modal-content">` +
			`<div class="modal-header"><div class="course-meta-heading">` +
			`<span class="course-meta-eyebrow">${esc(opts.eyebrow || 'Course')}</span>` +
			`<h3>${esc(opts.title || 'Edit course')}</h3>` +
			(opts.subtitle ? `<p class="course-meta-subtitle">${esc(opts.subtitle)}</p>` : '') +
			`</div><button type="button" class="modal-close" aria-label="Close" onclick="closeCourseModal('${id}')">&times;</button></div>` +
			`<div class="modal-body">` +
			(chips.length
				? `<div class="course-meta-context">${chips
						.map(
							(chip) =>
								`<span class="course-meta-chip"><span class="course-meta-chip-label">${esc(chip.label)}</span>${esc(chip.value)}</span>`,
						)
						.join('')}</div>`
				: '') +
			`<div class="form-group"><label for="${opts.nameId}">Course name</label>` +
			`<input id="${opts.nameId}" class="form-control" maxlength="200" value="${esc(opts.name || '')}" placeholder="e.g. Informatique — Module 1"></div>` +
			`<div class="form-group"><label for="${opts.descId}">Description</label>` +
			`<textarea id="${opts.descId}" class="form-control" rows="3" maxlength="2000" placeholder="What will students learn in this course?">${esc(opts.description || '')}</textarea></div>` +
			`</div>` +
			`<div class="modal-footer modal-footer--unified">` +
			`<button type="button" class="btn" onclick="closeCourseModal('${id}')">Cancel</button>` +
			`<button type="button" class="btn btn-primary" onclick="${opts.onSave}">Save changes</button>` +
			`</div></div>`;
		document.body.appendChild(overlay);
		const nameInput = document.getElementById(opts.nameId);
		if (nameInput) {
			nameInput.focus();
			try { nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length); } catch (_) { /* noop */ }
			if (typeof opts.onEnter === 'function') {
				nameInput.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						opts.onEnter();
					}
				});
			}
		}
		return overlay;
	}

	// ── AI model picker ──────────────────────────────────────────────────────
	async function ensureAiConfigs() {
		if (aiConfigsCache) return aiConfigsCache;
		const A = api();
		if (!A) return [];
		try {
			const res = await A.raw('GET', '/ai/configs');
			aiConfigsCache = (res && Array.isArray(res.data) ? res.data : []).filter(
				(c) => c && c.id,
			);
		} catch (err) {
			console.warn('[courses] ai configs failed:', err);
			aiConfigsCache = [];
		}
		return aiConfigsCache;
	}

	function modelSelectHtml(selectedId, selectId) {
		const rows = aiConfigsCache || [];
		const id = selectId || 'courseModelSelect';
		const options = rows
			.map(
				(c) =>
					`<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>` +
					`${esc(c.name || c.model_id)} (${esc(c.provider || 'ai')})</option>`,
			)
			.join('');
		if (!rows.length) {
			return '<div class="form-group"><label>AI Model</label><div class="text-muted">No AI models configured yet — add one in Settings → AI Generation.</div></div>';
		}
		return (
			`<div class="form-group"><label for="${esc(id)}">AI Model</label>` +
			`<select id="${esc(id)}">${options}</select>` +
			'</div>'
		);
	}
	// The detail pane keeps its own copy of the picker id; expose the getter.
	function selectedConfigId(container) {
		const sel = (container || document).querySelector('#courseModelSelect');
		if (sel) {
			selectedCourseConfigId = sel.value;
			return sel.value;
		}
		return container === document.getElementById('courseDetailPane')
			? selectedCourseConfigId
			: '';
	}

	// ── List view ────────────────────────────────────────────────────────────
	async function refresh(subjectId) {
		void subjectId; // the pill owns the subject; the mirror is already scoped
		if (currentCourse) {
			currentCourse = null;
			workspaceView = 'courses';
		}
		await loadCourses();
		renderCourseList();
		renderWorkspacePanes();
	}

	// ── Subjects workspace: pane and view model ──────────────────────────────
	// The active subject pill lists that subject's courses. Clicking a course
	// opens its outline/structure (the old category tree) for that branch.
	let workspaceView = 'courses'; // 'courses' | 'categories' | 'branch' | 'detail'
	let workspaceBranchCourseId = null;
	let workspaceBranchRootId = null;

	function activeSubjectId() {
		if (typeof window.getActiveCategorySubject === 'function') {
			return String(window.getActiveCategorySubject() || '__unassigned__');
		}
		return '__unassigned__';
	}

	function subjectCourses(subjectId) {
		const wanted = subjectId === '__unassigned__' ? '' : String(subjectId);
		return coursesCache.filter((c) => String(c.subject_id || '') === wanted);
	}

	function courseRowKind(course) {
		if (!course.category_id) return 'unlinked';
		// The list endpoint resolves the branch path for every course it returns,
		// so it is authoritative. The local mirror can lag behind (a Prompt
		// Builder import writes categories straight to the server), and trusting
		// it alone would mislabel a perfectly linked course as "No structure".
		if (course.category_path) return 'course';
		const root = categoryList().find((c) => String(c.id) === String(course.category_id));
		return root ? 'course' : 'unlinked';
	}

	/** Root categories of the active subject that no course owns yet. */
	function rootBranches(subjectId) {
		const wanted = subjectId === '__unassigned__' ? '' : String(subjectId);
		const claimed = new Set(coursesCache.map((c) => String(c.category_id || '')));
		return categoryList().filter(
			(cat) => cat && cat.id && cat.id !== 'uncategorized' && !cat.isSystem
				&& !cat.parent_id
				&& String(cat.subject_id || '') === wanted
				&& !claimed.has(String(cat.id))
				&& !(typeof isAutoGameCategory === 'function' && isAutoGameCategory(cat)),
		);
	}

	/** Merged rows: courses, structures without a course, courses without one. */
	function overviewRows(subjectId) {
		const rows = subjectCourses(subjectId).map((course) => ({
			kind: courseRowKind(course),
			course,
			root: null,
			label: String(course.name || ''),
		}));
		for (const root of rootBranches(subjectId)) {
			rows.push({ kind: 'structure', course: null, root, label: String(root.name || '') });
		}
		const leftoverKey =
			typeof window.getActiveLegacyWorkspaceKey === 'function'
				? String(window.getActiveLegacyWorkspaceKey() || '')
				: '';
		const filtered =
			subjectId === '__unassigned__' && leftoverKey
				? rows.filter((row) => {
					if (leftoverKey.startsWith('course:') && row.course) {
						return `course:${row.course.id}` === leftoverKey;
					}
					if (leftoverKey.startsWith('branch:') && row.root) {
						return `branch:${row.root.id}` === leftoverKey;
					}
					return false;
				})
				: rows;
		return filtered.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
	}

	function renderWorkspacePanes() {
		const listPane = document.getElementById('courseListPane');
		const structurePane = document.getElementById('structurePane');
		const detailPane = document.getElementById('courseDetailPane');
		const detailOpen = workspaceView === 'detail';
		if (listPane) listPane.classList.toggle('hidden', detailOpen || workspaceView !== 'courses');
		if (structurePane) structurePane.classList.toggle('hidden', detailOpen || workspaceView === 'courses');
		if (detailPane) {
			detailPane.classList.toggle('hidden', !detailOpen);
			if (!detailOpen) detailPane.innerHTML = '';
		}
	}

	window.setSubjectsWorkspaceView = function (mode) {
		if (mode !== 'courses' && mode !== 'categories') return;
		workspaceView = mode;
		workspaceBranchCourseId = null;
		workspaceBranchRootId = null;
		currentCourse = null;
		// The category table always falls back to the whole subject here, so the
		// "All categories" view keeps search, teacher filter, sort and bulk delete.
		window.SubjectsManagement?.setView?.('subject');
		renderCourseList();
		renderWorkspacePanes();
	};

	/**
	 * The course that owns the branch rooted at `rootId`. A structure opened
	 * from the subject tab only carries the category id, so the owning course is
	 * resolved here — including when the opened node is nested inside a course
	 * branch (the category table allows drilling into children).
	 */
	function courseOwningBranch(rootId) {
		const wanted = String(rootId || '');
		if (!wanted) return null;
		const direct =
			coursesCache.find((course) => String(course.category_id || '') === wanted)
			|| (String(currentCourse?.category_id || '') === wanted ? currentCourse : null);
		if (direct) return direct;
		const byId = new Map(categoryList().map((cat) => [String(cat.id), cat]));
		let node = byId.get(wanted);
		const seen = new Set();
		while (node && !seen.has(String(node.id))) {
			seen.add(String(node.id));
			const match = coursesCache.find((course) => String(course.category_id || '') === String(node.id));
			if (match) return match;
			if (!node.parent_id) break;
			node = byId.get(String(node.parent_id));
		}
		return null;
	}

	/** Open a branch inside the structure pane (the one and only structure editor). */
	window.openStructureBranch = function (rootId, options = {}) {
		const branchRootId = String(rootId || '');
		if (!branchRootId) return;
		const requestedCourseId = options.courseId ? String(options.courseId) : null;
		// The breadcrumb spells the chain out (Subject › Course › Structure) and
		// only this module holds the course rows, so the name is resolved here —
		// the caller passes the id it has.
		let course = requestedCourseId
			? coursesCache.find((c) => String(c.id) === requestedCourseId)
				|| (String(currentCourse?.id || '') === requestedCourseId ? currentCourse : null)
			: null;
		// A branch reached from the subject tree has no course id attached; infer
		// it so the course actions stay available while browsing its structure.
		if (!course) course = courseOwningBranch(branchRootId);
		if (!course && !requestedCourseId && !coursesCache.length) {
			// The Subjects tab can be the first surface opened after login, so the
			// course cache may still be cold. Resolve the owner once it loads.
			Promise.resolve(window.CoursesManagement?.ensureLoaded?.())
				.then(() => {
					if (workspaceBranchRootId !== branchRootId) return;
					const owner = courseOwningBranch(branchRootId);
					if (!owner) return;
					workspaceBranchCourseId = String(owner.id);
					renderStructureCourseActions();
				})
				.catch(() => { /* the branch still browses without course actions */ });
		}
		const courseId = requestedCourseId || (course ? String(course.id) : null);
		workspaceBranchCourseId = courseId;
		workspaceBranchRootId = branchRootId;
		workspaceView = 'branch';
		window.SubjectsManagement?.openBranch?.(branchRootId, {
			...options,
			courseId,
			courseName: String(options.courseName || course?.name || ''),
		});
		renderWorkspacePanes();
		renderStructureCourseActions();
	};

	window.closeStructureBranch = function () {
		window.SubjectsManagement?.setView?.('subject');
		workspaceBranchCourseId = null;
		workspaceBranchRootId = null;
		currentCourse = null;
		workspaceView = 'courses';
		renderCourseList();
		renderWorkspacePanes();
	};

	/** Course actions available while browsing a course's structure. */
	function structureActionCourse() {
		let id = String(workspaceBranchCourseId || '');
		if (!id && workspaceView === 'branch' && workspaceBranchRootId) {
			const inferred = courseOwningBranch(workspaceBranchRootId);
			if (inferred) {
				workspaceBranchCourseId = String(inferred.id);
				id = workspaceBranchCourseId;
			}
		}
		if (!id) return null;
		if (currentCourse && String(currentCourse.id) === id) return currentCourse;
		return coursesCache.find((course) => String(course.id) === id) || null;
	}

	function renderStructureCourseActions() {
		const host = document.getElementById('structureCourseActions');
		if (!host) return;
		const course = structureActionCourse();
		if (!course) {
			host.hidden = true;
			host.innerHTML = '';
			return;
		}
		const id = esc(course.id);
		const published = course.status === 'published';
		const icon = {
			view: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
			rename: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
			publish: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
			unpublish: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18.4 5.6a9 9 0 1 0 0 12.8"></path><path d="M3 3l18 18"></path></svg>',
			assign: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>',
			document: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>',
		};
		host.hidden = false;
		host.innerHTML =
			`<button type="button" class="btn btn-sm btn-primary structure-action is-view" title="Open the course workspace" onclick="openCourseDetail('${id}')">${icon.view}<span>View course</span></button>` +
			'<span class="structure-action-divider" aria-hidden="true"></span>' +
			`<button type="button" class="btn btn-sm structure-action is-rename" title="Rename this course" onclick="renameStructureCourse('${id}')">${icon.rename}<span>Rename</span></button>` +
			`<button type="button" class="btn btn-sm structure-action ${published ? 'is-unpublish' : 'is-publish'}" title="${published ? 'Move this course back to draft' : 'Publish this course for students'}" onclick="toggleCoursePublish('${id}','${published ? 'unpublish' : 'publish'}')">${published ? icon.unpublish : icon.publish}<span>${published ? 'Unpublish' : 'Publish'}</span></button>` +
			`<button type="button" class="btn btn-sm structure-action is-assign" title="Send this course to your students" onclick="sendStructureCourseToStudents('${id}')">${icon.assign}<span>Send to students</span></button>` +
			`<button type="button" class="btn btn-sm structure-action is-document" title="Export this course as a PDF or Word document" onclick="createCourseDocument('${id}')">${icon.document}<span>Create document</span></button>`;
	}

	async function ensureStructureCourse(courseId) {
		const id = String(courseId || '');
		if (!id) return null;
		if (currentCourse && String(currentCourse.id) === id) return currentCourse;
		const A = api();
		if (!A) return null;
		try {
			currentCourse = await A.raw('GET', `/courses/${encodeURIComponent(id)}`);
			return currentCourse;
		} catch (err) {
			toast('Could not open course: ' + (err?.message || 'error'), 'error');
			return null;
		}
	}

	window.renameStructureCourse = async function (courseId) {
		if (!(await ensureStructureCourse(courseId))) return;
		await window.renameCoursePrompt();
	};

	window.sendStructureCourseToStudents = async function (courseId) {
		if (!(await ensureStructureCourse(courseId))) return;
		await window.openAssignClassesModal();
	};

	function kindChip(kind) {
		if (kind === 'structure') return '<span class="course-kind-chip is-structure">No course yet</span>';
		if (kind === 'unlinked') return '<span class="course-kind-chip is-unlinked">No structure</span>';
		return '';
	}

	function structureRowActions(root) {
		const id = esc(root.id);
		return (
			'<div class="exam-actions">' +
			`<button class="exam-action-btn course-action-create" title="Create a course on this structure" aria-label="Create a course on this structure" onclick="createCourseOnBranch('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg></button>' +
			`<button class="exam-action-btn course-action-structure" title="Edit structure" aria-label="Edit structure" onclick="openStructureBranch('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-6h6v6"></path></svg></button>' +
			`<button class="exam-action-btn course-action-generate" title="Generate outline with AI" aria-label="Generate outline with AI" onclick="openCourseFromCategory('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"></path></svg></button>' +
			'</div>'
		);
	}

	function courseRowActions(course) {
		const id = esc(course.id);
		const published = course.status === 'published';
		return (
			'<div class="exam-actions">' +
			`<button class="exam-action-btn exam-edit-btn" title="Open course" aria-label="Open course" onclick="openCourseDetail('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
			`<button class="exam-action-btn course-action-structure" title="Edit structure" aria-label="Edit structure" onclick="openStructureBranch('${esc(course.category_id)}', {courseId:'${id}'})">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-6h6v6"></path></svg></button>' +
			`<button class="exam-action-btn course-action-document" aria-label="Create course document" title="Create course document" onclick="createCourseDocument('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8M8 17h8"></path></svg></button>' +
			`<button class="exam-action-btn course-action-publish" title="${published ? 'Unpublish' : 'Publish'}" aria-label="${published ? 'Unpublish' : 'Publish'}" onclick="toggleCoursePublish('${id}','${published ? 'unpublish' : 'publish'}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg></button>' +
			`<button class="exam-action-btn exam-delete-btn" title="Delete course" aria-label="Delete course" onclick="deleteCourseConfirm('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
			'</div>'
		);
	}

	function unlinkedRowActions(course) {
		const id = esc(course.id);
		return (
			'<div class="exam-actions">' +
			`<button class="exam-action-btn course-action-link" title="Link a structure" aria-label="Link a structure" onclick="linkStructure('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>' +
			`<button class="exam-action-btn exam-edit-btn" title="Open course" aria-label="Open course" onclick="openCourseDetail('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
			`<button class="exam-action-btn exam-delete-btn" title="Delete course" aria-label="Delete course" onclick="deleteCourseConfirm('${id}')">` +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
			'</div>'
		);
	}

	function overviewRowHtml(row) {
		if (row.kind === 'structure') {
			const root = row.root;
			return (
				`<tr data-row-key="branch:${esc(root.id)}" data-kind="structure">` +
				'<td class="checkbox-cell" data-label="Select"></td>' +
				`<td><button type="button" class="course-name-link" onclick="openStructureBranch('${esc(root.id)}')">${esc(root.name)}</button>${kindChip('structure')}</td>` +
				`<td>${esc(categoryPath(root.id) || root.name || '—')}</td>` +
				'<td>—</td>' +
				'<td><span class="status-badge status-muted">Structure</span></td>' +
				'<td>—</td>' +
				`<td>${fmtDate(root.dateCreated || root.created_at)}</td>` +
				`<td>${structureRowActions(root)}</td></tr>`
			);
		}
		const course = row.course;
		const published = course.status === 'published';
		const openStructure = row.kind !== 'unlinked' && course.category_id
			? `openStructureBranch('${esc(course.category_id)}', {courseId:'${esc(course.id)}'})`
			: `openCourseDetail('${esc(course.id)}')`;
		const nameCell =
			`<td><button type="button" class="course-name-link" onclick="${openStructure}" aria-label="Open structure of ${esc(course.name)}">${esc(course.name)}</button>` +
			kindChip(row.kind) + '</td>';
		return (
			`<tr data-row-key="${esc(course.id)}" data-id="${esc(course.id)}" data-kind="${row.kind}">` +
			`<td class="checkbox-cell" data-label="Select"><input type="checkbox" class="course-checkbox" data-id="${esc(course.id)}" onchange="toggleBulkRowSelection(this, 'courses')"></td>` +
			nameCell +
			`<td>${esc(course.category_path || categoryPath(course.category_id) || '—')}</td>` +
			`<td>${Number(course.lesson_count) || 0}</td>` +
			`<td><span class="status-badge ${published ? 'status-success' : 'status-warning'}">${published ? 'Published' : 'Draft'}</span></td>` +
			`<td>${(course.class_names || []).map(esc).join(', ') || '—'}</td>` +
			`<td>${fmtDate(course.updated_at)}</td>` +
			`<td>${row.kind === 'unlinked' ? unlinkedRowActions(course) : courseRowActions(course)}</td></tr>`
		);
	}

	window.renderCourseList = function () {
		const tbody = document.querySelector('#courseList tbody');
		if (!tbody) return;
		renderOrphanBanner();
		const search = (document.getElementById('courseSearch')?.value || '').trim().toLowerCase();
		const status = document.getElementById('courseStatusFilter')?.value || '';
		const rows = overviewRows(activeSubjectId()).filter((row) => {
			if (status && row.kind !== 'course') return false;
			if (status && row.course?.status !== status) return false;
			if (!search) return true;
			return (
				String(row.label || '').toLowerCase().includes(search) ||
				String(row.course?.category_path || '').toLowerCase().includes(search)
			);
		});
		if (!rows.length) {
			const activeSub = activeSubjectId();
			const hasSubjects = subjectList().length > 0;
			const subjectName = activeSub && activeSub !== '__unassigned__'
				? (subjectList().find((s) => String(s.id) === String(activeSub))?.name || 'this subject')
				: 'Unassigned';
			tbody.innerHTML =
				'<tr><td colspan="8" class="text-muted course-empty-cell">' +
				'<div class="curriculum-starter-card">' +
				'<div class="curriculum-starter-icon">📚</div>' +
				'<h3>Welcome to your Teaching & Quiz Studio</h3>' +
				(hasSubjects
					? `<p class="curriculum-starter-subtitle">No courses or outlines defined for <strong>${esc(subjectName)}</strong> yet. Create your first course outline to start generating lessons and quiz questions.</p>`
					: '<p class="curriculum-starter-subtitle">Start by creating your first subject (e.g. Mathematics, French, Science), then define courses and outlines.</p>') +
				'<div class="curriculum-steps-guide">' +
				'<div class="curriculum-step-item"><span class="step-num">1</span><strong>1. Subject</strong><small>Broad curriculum domain</small></div>' +
				'<div class="curriculum-step-arrow" aria-hidden="true">→</div>' +
				'<div class="curriculum-step-item"><span class="step-num">2</span><strong>2. Course Outline</strong><small>Modules, chapters & lessons</small></div>' +
				'<div class="curriculum-step-arrow" aria-hidden="true">→</div>' +
				'<div class="curriculum-step-item"><span class="step-num">3</span><strong>3. Dual Action</strong><small>Lessons & quiz generation</small></div>' +
				'</div>' +
				'<div class="curriculum-starter-actions">' +
				(hasSubjects
					? '<button type="button" class="btn btn-primary" onclick="openCourseGeneratorModal()">+ New Course</button>' +
					  '<button type="button" class="btn" onclick="openCourseDocumentImportModal()">📂 Import Syllabus (DOCX / PDF)</button>'
					: '<button type="button" class="btn btn-primary" onclick="createNewSubjectFlow()">+ Create My First Subject</button>' +
					  '<button type="button" class="btn" onclick="openCourseDocumentImportModal()">📂 Import Syllabus (DOCX / PDF)</button>') +
				'</div>' +
				'<p class="course-generator-hint" style="margin-top:14px;font-size:0.82rem;">No course or structure here yet — click "New Course" to create one.</p>' +
				'</div></td></tr>';
			return;
		}
		tbody.innerHTML = rows.map(overviewRowHtml).join('');

		for (const row of rows) {
			const rowKey = String(row.kind === 'structure' ? `branch:${row.root.id}` : row.course.id);
			// Compared through the dataset: an attribute selector would need
			// CSS.escape, which the harness DOM does not provide.
			const el = Array.from(tbody.children).find(
				(tr) => tr && tr.dataset && String(tr.dataset.rowKey || '') === rowKey,
			);
			if (!el || typeof el.addEventListener !== 'function') continue;
			el.addEventListener('click', (event) => {
				const target = event?.target;
				if (window.innerWidth > 768 || (target && typeof target.closest === 'function' && target.closest('button, a'))) return;
				event.stopPropagation();
				if (!window.MobileActionSheet || typeof window.MobileActionSheet.open !== 'function') {
					if (row.kind === 'structure') openStructureBranch(row.root.id);
					else if (row.kind !== 'unlinked' && row.course?.category_id) {
						openStructureBranch(row.course.category_id, { courseId: row.course.id });
					} else openCourseDetail(row.course.id);
					return;
				}
				if (row.kind === 'structure') {
					window.MobileActionSheet.open(`Structure: ${String(row.root.name || '')}`, [
						{
							label: 'Create a course here',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
							onClick: () => window.createCourseOnBranch(row.root.id),
						},
						{
							label: 'Edit structure',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
							onClick: () => openStructureBranch(row.root.id),
						},
						{
							label: 'Generate outline with AI',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z"></path><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14z"></path></svg>',
							onClick: () => window.openCourseFromCategory(row.root.id),
						},
					]);
					return;
				}
				const course = row.course;
				if (row.kind === 'unlinked') {
					window.MobileActionSheet.open(`Course: ${String(course.name || '')}`, [
						{
							label: 'Link a structure',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
							onClick: () => window.linkStructure(course.id),
						},
						{
							label: 'Open course',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
							onClick: () => openCourseDetail(course.id),
						},
						{
							label: 'Delete course',
							icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
							onClick: () => deleteCourseConfirm(course.id),
							variant: 'danger',
						},
					]);
					return;
				}
				const published = course.status === 'published';
				const actions = [
					{
						label: 'Open course',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
						onClick: () => openCourseDetail(course.id),
					},
					{
						label: 'Edit structure',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
						onClick: () => openStructureBranch(course.category_id, { courseId: course.id }),
					},
					{
						label: 'Create course document',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>',
						onClick: () => window.createCourseDocument(course.id),
					},
					{
						label: published ? 'Unpublish course' : 'Publish course',
						icon: published
							? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
							: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
						onClick: () => toggleCoursePublish(course.id, published ? 'unpublish' : 'publish'),
						variant: published ? 'default' : 'primary',
					},
					{
						label: 'Delete course',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
						onClick: () => deleteCourseConfirm(course.id),
						variant: 'danger',
					},
				];
				window.MobileActionSheet.open(`Course: ${String(course.name || '')}`, actions);
			});
		}
		try { window.BulkSelect?.restore('courses'); } catch (_) { /* bulk helper not loaded */ }
		renderStructureCourseActions();
	};

	async function loadCourses(quiet) {
		const A = api();
		if (!A) return;
		try {
			const res = await A.raw('GET', '/courses?limit=200');
			coursesCache = res && Array.isArray(res.data) ? res.data : [];
		} catch (err) {
			console.warn('[courses] load failed:', err);
			// Quiet mode is used by other tabs (the Subjects manager only needs
			// the counts), where a course-listing failure is not worth a toast.
			if (quiet !== true) {
				toast('Could not load courses: ' + (err?.message || 'network error'), 'error');
			}
			coursesCache = [];
		}
		try { window.renderSubjectTabBar?.(); } catch (_) { /* pills not mounted */ }
	}


	async function toggleCoursePublish(courseId, action, recipientsChecked = false) {
		const A = api();
		if (!A) return;
		if (action === 'publish' && !recipientsChecked) {
			try {
				const course = currentCourse && String(currentCourse.id) === String(courseId)
					? currentCourse
					: await A.raw('GET', `/courses/${encodeURIComponent(courseId)}`);
				if (!(course.class_ids || []).length) {
					currentCourse = course;
					publishAfterAssignCourseId = String(courseId);
					await window.openAssignClassesModal({ publishAfterAssign: true });
					return;
				}
			} catch (err) {
				toast('Could not check course recipients: ' + (err?.message || 'error'), 'error');
				return;
			}
		}
		try {
			await A.raw('POST', `/courses/${encodeURIComponent(courseId)}/${action}`);
			publishAfterAssignCourseId = null;
			toast(action === 'publish' ? 'Course published — assigned classes can see it.' : 'Course moved back to draft.');
			await loadCourses();
			renderCourseList();
			if (currentCourse && String(currentCourse.id) === String(courseId)) {
				currentCourse.status = action === 'publish' ? 'published' : 'draft';
				renderCourseDetail();
			}
		} catch (err) {
			toast('Could not change status: ' + (err?.message || 'error'), 'error');
		}
	}
	window.toggleCoursePublish = toggleCoursePublish;

	function deleteCourseConfirm(courseId) {
		const course = coursesCache.find((c) => String(c.id) === String(courseId));
		openModal(
			'courseDeleteModal',
			'Delete course',
			`<p>Delete <strong>${esc(course?.name || 'this course')}</strong> and all of its lessons? Students will no longer see it. Questions in the question bank are not affected.</p>`,
			`<button type="button" class="btn" onclick="closeCourseModal('courseDeleteModal')">Cancel</button>` +
			`<button type="button" class="btn btn-danger" onclick="deleteCourse('${esc(courseId)}')">Delete</button>`,
		);
	}
	window.deleteCourseConfirm = deleteCourseConfirm;

	window.deleteCourse = async function (courseId) {
		const A = api();
		if (!A) return;
		try {
			await A.raw('DELETE', `/courses/${encodeURIComponent(courseId)}`);
			window.closeCourseModal('courseDeleteModal');
			toast('Course deleted.');
			await refresh();
		} catch (err) {
			toast('Delete failed: ' + (err?.message || 'error'), 'error');
		}
	};

	// Bulk delete for the courses table. Server-first, one DELETE per course,
	// aborting the whole batch on the first auth failure so an expired session
	// reports once instead of N times (and stops hammering /auth/refresh).
	window.deleteSelectedCourses = async function () {
		const A = api();
		if (!A) return;
		const ids = window.BulkSelect ? window.BulkSelect.getSelectedIds('courses') : [];
		if (!ids.length) return;
		if (
			!confirm(
				`Delete ${ids.length} ${ids.length === 1 ? 'course' : 'courses'} and all of their lessons? Students will no longer see them. Questions in the question bank are not affected. This cannot be undone.`,
			)
		) {
			return;
		}
		const isAuthFailure = typeof window.isAuthFailure === 'function' ? window.isAuthFailure : () => false;
		const deleted = [];
		const failed = [];
		let authExpired = false;
		for (const courseId of ids) {
			try {
				await A.raw('DELETE', `/courses/${encodeURIComponent(courseId)}`);
				deleted.push(String(courseId));
			} catch (err) {
				if (err?.status === 404) {
					// Already gone on the server — treat as deleted.
					deleted.push(String(courseId));
					continue;
				}
				if (isAuthFailure(err)) {
					authExpired = true;
					break;
				}
				console.warn('[courses] bulk delete failed:', err);
				failed.push(courseId);
			}
		}
		if (deleted.length) {
			coursesCache = coursesCache.filter((c) => !deleted.includes(String(c.id)));
			if (window.BulkSelect) window.BulkSelect.removeIds('courses', deleted);
			try { renderCourseList(); } catch (_) { /* list not mounted */ }
			try { await loadCourses(true); } catch (_) { /* cache refresh is best-effort */ }
		}
		if (authExpired) {
			toast('Your session expired \u2014 please sign in again.', 'error');
			return;
		}
		if (failed.length) {
			toast(
				`Deleted ${deleted.length}; ${failed.length} failed on server \u2014 kept locally so you can retry`,
				'error',
			);
			return;
		}
		toast(`Deleted ${deleted.length} ${deleted.length === 1 ? 'course' : 'courses'}.`);
	};

	// Bulk bar "Edit" — renames the single selected course without opening the
	// detail view. Only reachable when exactly one row is checked (the button
	// carries .bulk-single-only and hides itself otherwise via [data-count]).
	window.editSelectedCourseName = function () {
		const A = api();
		if (!A) return;
		const ids = window.BulkSelect ? window.BulkSelect.getSelectedIds('courses') : [];
		if (ids.length !== 1) {
			toast('Select exactly one course to edit its name.', 'error');
			return;
		}
		const wanted = String(ids[0]);
		const course = coursesCache.find((c) => String(c.id) === wanted);
		if (!course) return toast('Course not found \u2014 refresh the list.', 'error');
		openCourseMetaModal({
			id: 'courseBulkRenameModal',
			eyebrow: 'Course settings',
			title: 'Edit course',
			subtitle: 'Update the course name and description. Students see these on their course card.',
			context: courseContextChips(course),
			nameId: 'courseBulkRenameName',
			descId: 'courseBulkRenameDesc',
			name: course.name || '',
			description: course.description || '',
			onSave: `saveBulkCourseMeta('${esc(course.id)}')`,
			onEnter: () => window.saveBulkCourseMeta(course.id),
		});
	};

	window.saveBulkCourseMeta = async function (courseId) {
		const A = api();
		if (!A) return;
		const name = document.getElementById('courseBulkRenameName')?.value?.trim();
		const description = document.getElementById('courseBulkRenameDesc')?.value?.trim();
		if (!name) return toast('Name is required.', 'error');
		try {
			const updated = await A.raw('PATCH', `/courses/${encodeURIComponent(courseId)}`, { name, description });
			const cached = coursesCache.find((c) => String(c.id) === String(courseId));
			if (cached) Object.assign(cached, updated || { name, description });
			if (String(currentCourse?.id || '') === String(courseId)) {
				currentCourse.name = name;
				currentCourse.description = description;
			}
			window.closeCourseModal('courseBulkRenameModal');
			if (window.BulkSelect) window.BulkSelect.clear('courses');
			try { renderCourseList(); } catch (_) { /* list not mounted */ }
			toast('Course updated.');
		} catch (err) {
			toast('Update failed: ' + (err?.message || 'error'), 'error');
		}
	};

	// ── Orphan sweep ─────────────────────────────────────────────────────────
	// Category/course FKs are SetNull by design, so courses generated from a
	// category that was deleted before the cascade existed survive with a
	// dangling (or null) category reference. We surface them instead of
	// deleting silently on load; the admin decides.
	function orphanedCourses() {
		return coursesCache.filter((c) => c && c.id && (!c.category_id || !c.category_path));
	}

	function renderOrphanBanner() {
		const banner = document.getElementById('courseOrphanBanner');
		if (!banner) return;
		const count = orphanedCourses().length;
		banner.classList.toggle('hidden', !count);
		const label = document.getElementById('courseOrphanCount');
		if (label) label.textContent = String(count);
	}

	window.cleanupOrphanCourses = function () {
		const orphans = orphanedCourses();
		if (!orphans.length) return;
		const list = orphans
			.slice(0, 12)
			.map((c) => `<li>${esc(c.name || 'Untitled course')}</li>`)
			.join('');
		const more = orphans.length > 12 ? `<li>…and ${orphans.length - 12} more</li>` : '';
		openModal(
			'courseOrphanModal',
			'Clean up orphaned courses',
			`<p>${orphans.length} course${orphans.length === 1 ? '' : 's'} point at categories that no longer exist. Deleting them removes the course and its lessons; the question bank is not affected.</p><ul class="course-orphan-list">${list}${more}</ul>`,
			`<button type="button" class="btn" onclick="closeCourseModal('courseOrphanModal')">Cancel</button>` +
			'<button type="button" class="btn btn-danger" onclick="deleteOrphanCourses()">Delete them</button>',
		);
	};

	window.deleteOrphanCourses = async function () {
		const A = api();
		if (!A) return;
		const orphans = orphanedCourses();
		if (!orphans.length) {
			// The button lives in a modal, so this normally cannot happen — but
			// it is a window global, and "Removed 0 orphaned courses" is a lie.
			window.closeCourseModal('courseOrphanModal');
			return;
		}
		const ids = orphans.map((c) => String(c.id));
		let removed = 0;
		let failed = 0;
		for (const id of ids) {
			try {
				await A.raw('DELETE', `/courses/${encodeURIComponent(id)}`);
				removed++;
			} catch (err) {
				if (err?.status === 404 || err?.statusCode === 404) removed++;
				else failed++;
			}
		}
		// Keep the shared local mirror in step with the server so subject/course
		// counters elsewhere in the admin don't keep showing the deleted rows.
		try {
			const repo = window.__DI_CONTAINER__?.repo;
			const mirrored = repo?.getAll_sync?.('courses');
			if (repo?.setAll_sync && Array.isArray(mirrored)) {
				repo.setAll_sync('courses', mirrored.filter((c) => !ids.includes(String(c?.id))));
			}
		} catch (_) { /* mirror is a best-effort cache */ }
		window.closeCourseModal('courseOrphanModal');
		if (failed) toast(`${removed} deleted, ${failed} could not be removed.`, 'error');
		else toast(`Removed ${removed} orphaned course${removed === 1 ? '' : 's'}.`);
		await refresh();
		// Subject rows in the manager modal show course counts, so refresh those
		// numbers too when the modal is open.
		try { window.renderSubjectManagerTable?.(); } catch (_) { /* not loaded yet */ }
	};

	// ── New Course generator modal ───────────────────────────────────────────
	function courseImportHeadingRow(heading, index) {
		const sourceText = String(heading.sourceText || '');
		const title = String(heading.title || sourceText.replace(/^\s*#{1,6}\s*/, '').trim());
		const levelOptions = Array.from({ length: 4 }, (_, optionIndex) => {
			const level = optionIndex + 1;
			const label = ['Module', 'Chapter', 'Axis', 'Lesson'][level - 1];
			return `<option value="${level}" ${Number(heading.level) === level ? 'selected' : ''}>${label}</option>`;
		}).join('');
		return (
			`<div class="course-import-heading" data-import-heading="${index}">` +
			`<div class="course-import-heading-fields">` +
			`<label>Source line<input type="number" min="1" max="${courseImportDraft.lineCount}" value="${Number(heading.line) || 1}" data-import-line onchange="updateCourseImportSourceLine(this)"></label>` +
			`<label>Hierarchy<select data-import-level>${levelOptions}</select></label>` +
			`<label>Heading title<input type="text" maxlength="100" value="${esc(title)}" data-import-title oninput="clearCourseImportHeadingError(this)"><small data-import-title-error hidden>Already exists in this subject. Rename this title.</small></label>` +
			`<button type="button" class="btn btn-sm course-import-remove" onclick="removeCourseImportHeading(this)" aria-label="Remove heading"><span aria-hidden="true">&times;</span> Remove</button>` +
			'</div>' +
			`<p class="course-import-source-line" data-import-source>${esc(sourceText)}</p>` +
			'</div>'
		);
	}

	function renderCourseImportReview(draft) {
		const rows = draft.headings.map((heading, index) => courseImportHeadingRow(heading, index)).join('');
		const body =
			'<div class="course-import-stepper" aria-label="Import steps"><span class="is-complete"><b>1</b> Upload</span><i></i><span class="is-current"><b>2</b> Organize</span><i></i><span><b>3</b> Create course</span></div>' +
			`<div class="course-import-course-fields"><div class="form-group"><label for="courseImportSubject">Subject</label><div class="course-import-subject-picker"><select id="courseImportSubject" required>${subjectList().map((subject) => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join('')}</select><button type="button" class="btn btn-sm course-import-subject-new-btn" onclick="createCourseImportSubject()"><span aria-hidden="true">＋</span> New subject</button></div><small>Imported categories are saved inside this subject.</small></div><div class="form-group"><label for="courseImportName">Course name</label>` +
			`<input type="text" id="courseImportName" maxlength="200" value="${esc(draft.title || '')}" style="width:100%;"></div>` +
			'<div class="form-group course-import-desc"><label for="courseImportDescription">Course description</label>' +
			`<textarea id="courseImportDescription" maxlength="2000" rows="2" style="width:100%;">${esc(draft.description || '')}</textarea></div></div>` +
			'<div class="course-import-notice"><span aria-hidden="true">✓</span><p><strong>Private and offline</strong><br>No AI or internet connection is needed. Extracted text stays unchanged; lines you do not mark as headings remain section content.</p></div>' +
			// STEP tabs: the two sections of the review stay side by side as tab
			// panes so each step keeps its own focused workspace.
			`<div class="course-import-review-tabs" role="tablist" aria-label="Review steps">` +
			'<button type="button" class="course-import-review-tab active" role="tab" aria-selected="true" aria-controls="courseImportOrganizePane" onclick="setCourseImportReviewTab(\'organize\')">STEP 1 · ORGANIZE</button>' +
			`<button type="button" class="course-import-review-tab" role="tab" aria-selected="false" aria-controls="courseImportReviewPane" onclick="setCourseImportReviewTab('review')">STEP 2 · REVIEW <span class="course-import-review-tab-count" data-import-outline-count>${draft.headings.length} heading${draft.headings.length === 1 ? '' : 's'}</span></button>` +
			'</div>' +
			'<div id="courseImportOrganizePane" class="course-import-review-pane course-import-review-pane-organize">' +
			'<div class="course-import-section-heading"><div><h3>Choose document headings</h3><p>Search or browse the extracted text. Select each title, assign its level, and add it to the outline.</p></div>' +
			`<span class="course-import-auto-count">${draft.headings.length ? `${draft.headings.length} suggested` : 'Manual selection'}</span></div>` +
			`<p class="course-generator-hint">${draft.detectionMethod === 'docx-styles-and-local-patterns' ? 'Outline detected locally from DOCX heading styles and title patterns.' : 'Outline detected locally from document title patterns.'} No AI model or internet connection is required. Review the source line and hierarchy for every heading; add, remove, or edit headings as needed. Text is preserved exactly and assigned to the section immediately above it. Text before the first heading becomes an Introduction.</p>` +
			'<p class="course-generator-hint">Detection is best-effort: a document’s heading styles and numbering may not match its intended structure. Check every heading before creating the course. Images, diagrams, tables, and original page layout are not imported.</p>' +
			'<div class="course-import-level-tools">' +
			'<label>Make selected lines<select id="courseImportBulkLevel"><option value="1">Module · Level 1</option><option value="2">Chapter · Level 2</option><option value="3">Axis · Level 3</option><option value="4">Lesson · Heading 4</option></select></label>' +
			'<span data-import-selection-count aria-live="polite">No lines selected</span>' +
			'<button type="button" class="btn btn-primary btn-sm" data-import-add-source-lines onclick="addSelectedCourseImportSourceLines()" disabled>Add to outline <span aria-hidden="true">→</span></button>' +
			'</div>' +
			'<p class="course-import-instructions">Use Heading 1 for a module, Heading 2 for a chapter, Heading 3 for an optional section, and Heading 4 for a lesson. Lines not added as headings remain content. Text after each heading is saved as that lesson’s content.</p>' +
			'<div id="courseImportSourcePicker" class="course-import-source-picker"></div>' +
			`<details class="course-import-source"><summary>View extracted text (${draft.lineCount} lines)</summary><pre>${esc(draft.documentText)}</pre></details>` +
			'</div>' +
			'<div id="courseImportReviewPane" class="course-import-review-pane" hidden>' +
			'<div class="course-import-section-heading"><div><h3>Your course outline</h3><p>Rename headings or fine-tune their levels before creating the course.</p></div></div>' +
			'<div class="course-import-conflict-notice" data-import-conflict-notice role="alert" hidden></div>' +
			`<div id="courseImportHeadings">${rows}</div>` +
			'<div class="course-import-empty-outline" data-import-outline-empty hidden>No headings yet. Select title lines above to build your course outline.</div>' +
			'<button type="button" class="btn course-import-add-manual" onclick="addCourseImportHeading()">Add a heading manually</button>' +
			'</div>' +
			'<div class="course-import-review-cta"><button type="button" class="btn btn-primary" id="courseImportGoReview" onclick="setCourseImportReviewTab(\'review\')" disabled>Review outline <span aria-hidden="true">→</span></button></div>' +
			'<p class="course-import-footnote">Text before the first heading becomes an introduction. Images, tables, diagrams, and original page layout are not imported.</p>';
		const footer =
			'<button type="button" class="btn" onclick="openCourseDocumentImportModal()">Choose another file</button>' +
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseImportModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="courseImportCreate" onclick="createCourseFromDocumentImport()">Create course <span aria-hidden="true">→</span></button>';
		const modal = openModal('courseImportModal', 'Review imported course outline', body, footer, 'course-import-modal');
		const content = modal.querySelector('.modal-content');
		if (content) content.style.maxWidth = '960px';
		window.renderCourseImportSourcePicker();
		window.updateCourseImportOutlineCount();
	}

	// The two STEP panels toggle as tabs (STEP 1 · ORGANIZE / STEP 2 ·
	// REVIEW): nothing is re-rendered, only pane visibility and tab state.
	window.setCourseImportReviewTab = function (tab) {
		const root = document.getElementById('courseImportModal');
		if (!root) return;
		const reviewTab = tab === 'review';
		root.querySelectorAll('.course-import-review-tab').forEach((button) => {
			const active = button.getAttribute('aria-controls') === (reviewTab ? 'courseImportReviewPane' : 'courseImportOrganizePane');
			button.classList.toggle('active', active);
			button.setAttribute('aria-selected', String(active));
		});
		const organize = document.getElementById('courseImportOrganizePane');
		const review = document.getElementById('courseImportReviewPane');
		if (organize) organize.hidden = reviewTab;
		if (review) review.hidden = !reviewTab;
	};

	window.createCourseImportSubject = async function () {
		const name = window.prompt('Name this subject (for example: Mathematics):')?.trim();
		if (!name) return;
		try {
			const A = api();
			if (!A) return;
			const subject = await A.create('subjects', { name });
			const rows = subjectList();
			rows.push(subject);
			window.__DI_CONTAINER__?.repo?.setAll_sync?.('subjects', rows);
			window.refreshCategorySubjects?.();
			const select = document.getElementById('courseImportSubject');
			if (select) {
				const option = document.createElement('option');
				option.value = String(subject.id);
				option.textContent = subject.name;
				select.appendChild(option);
				select.value = String(subject.id);
			}
			toast(`Subject "${subject.name}" created.`);
		} catch (err) {
			toast(`Could not create subject: ${err?.message || 'request failed'}`, 'error');
		}
	};

	window.openCourseDocumentImportModal = async function () {
		courseImportDraft = null;
		const body =
			'<div class="course-import-stepper" aria-label="Import steps"><span class="is-current"><b>1</b> Upload</span><i></i><span><b>2</b> Organize</span><i></i><span><b>3</b> Create course</span></div>' +
			'<label class="course-import-dropzone" for="courseImportFile" data-import-dropzone>' +
			'<span class="course-import-upload-icon" aria-hidden="true">↑</span><strong>Choose a course document</strong>' +
			'<span class="course-import-dropzone-help">Drag and drop your file here, or <u>browse files</u></span>' +
			'<span class="course-import-file-types">DOCX or text-based PDF · Maximum 8 MB</span>' +
			'<input id="courseImportFile" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onchange="updateCourseImportFile(this)">' +
			'</label><div class="course-import-file-selected" data-import-file-selected hidden></div>' +
			'<div class="course-import-privacy-card"><span aria-hidden="true">✓</span><p><strong>Works offline</strong><br>Your file is processed by the app. No AI provider or internet connection is needed.</p></div>' +
			'<p class="course-import-footnote">Scanned/image-only PDFs are not supported. Automatic detection is a starting point—you can select and organize the exact title lines yourself in the next step.</p>';
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseImportModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="courseImportAnalyze" onclick="analyzeCourseDocumentImport()" disabled>Continue to review <span aria-hidden="true">→</span></button>';
		const modal = openModal('courseImportModal', 'Import a course document', body, footer, 'course-import-modal');
		const input = modal.querySelector('#courseImportFile');
		const dropzone = modal.querySelector('[data-import-dropzone]');
		if (dropzone && input) {
			dropzone.addEventListener('dragover', (event) => {
				event.preventDefault();
				dropzone.classList.add('is-dragging');
			});
			dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
			dropzone.addEventListener('drop', (event) => {
				event.preventDefault();
				dropzone.classList.remove('is-dragging');
				if (event.dataTransfer?.files?.length) {
					input.files = event.dataTransfer.files;
					window.updateCourseImportFile(input);
				}
			});
		}
	};

	window.updateCourseImportFile = function (input) {
		const file = input?.files?.[0];
		const fileInfo = document.querySelector('[data-import-file-selected]');
		const button = document.getElementById('courseImportAnalyze');
		if (!file) {
			if (fileInfo) fileInfo.hidden = true;
			if (button) button.disabled = true;
			return;
		}
		const validType = /\.(docx|pdf)$/i.test(file.name);
		const validSize = file.size <= 8 * 1024 * 1024;
		if (fileInfo) {
			fileInfo.hidden = false;
			fileInfo.classList.toggle('is-invalid', !validType || !validSize);
			fileInfo.innerHTML = `<span class="course-import-file-badge">${validType && validSize ? '✓' : '!'}</span><span class="course-import-file-name">${esc(file.name)}<small>${validType && validSize ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to import` : !validType ? 'Choose a DOCX or PDF file.' : 'File must be smaller than 8 MB.'}</small></span><button type="button" class="course-import-clear-file" aria-label="Remove selected file" onclick="clearCourseImportFile()">×</button>`;
		}
		if (button) button.disabled = !validType || !validSize;
	};

	window.clearCourseImportFile = function () {
		const input = document.getElementById('courseImportFile');
		if (input) input.value = '';
		window.updateCourseImportFile(input);
	};

	window.analyzeCourseDocumentImport = async function () {
		const file = document.getElementById('courseImportFile')?.files?.[0];
		if (!file) return toast('Choose a DOCX or PDF file first.', 'error');
		if (!/\.(docx|pdf)$/i.test(file.name)) return toast('Choose a DOCX or PDF file.', 'error');
		if (file.size > 8 * 1024 * 1024) return toast('Choose a file smaller than 8 MB.', 'error');

		const button = document.getElementById('courseImportAnalyze');
		if (button) { button.disabled = true; button.textContent = 'Extracting document…'; }
		try {
			const A = api();
			if (!A) throw new Error('API client is not available.');
			const bytes = new Uint8Array(await file.arrayBuffer());
			let binary = '';
			const chunkSize = 0x8000;
			for (let offset = 0; offset < bytes.length; offset += chunkSize) {
				binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
			}
			const result = await A.raw('POST', '/courses/import/preview', {
				filename: file.name,
				data: btoa(binary),
			});
			courseImportDraft = {
				...result,
				lineCount: String(result.documentText || '').split('\n').length,
				sourcePickerPage: 0,
				selectedSourceLines: new Set(),
			};
			renderCourseImportReview(courseImportDraft);
		} catch (err) {
			console.warn('[courses] document analysis failed:', err);
			toast(`Could not analyze the document: ${err?.message || 'error'}`, 'error');
			if (button) { button.disabled = false; button.textContent = 'Continue to review →'; }
		}
	};

	window.updateCourseImportSourceLine = function (input) {
		if (!courseImportDraft || !input) return;
		const line = Number(input.value);
		const lines = String(courseImportDraft.documentText || '').split('\n');
		const source = input.closest('.course-import-heading')?.querySelector('[data-import-source]');
		if (source) source.textContent = line >= 1 && line <= lines.length ? lines[line - 1] : 'No source line at this number.';
		window.renderCourseImportSourcePicker();
	};

	window.renderCourseImportSourcePicker = function () {
		if (!courseImportDraft) return;
		const picker = document.getElementById('courseImportSourcePicker');
		if (!picker) return;
		const lines = String(courseImportDraft.documentText || '').split('\n');
		const entries = lines
			.map((text, index) => ({ line: index + 1, text: text.trim() }))
			.filter((entry) => entry.text);
		const search = String(courseImportDraft.sourceSearch || '').trim().toLocaleLowerCase();
		const filteredEntries = search
			? entries.filter((entry) => entry.text.toLocaleLowerCase().includes(search))
			: entries;
		const pageSize = 60;
		const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
		courseImportDraft.sourcePickerPage = Math.max(0, Math.min(courseImportDraft.sourcePickerPage || 0, pageCount - 1));
		const page = courseImportDraft.sourcePickerPage;
		const headingRows = Array.from(document.querySelectorAll('#courseImportHeadings [data-import-heading]'));
		const existingLines = new Set(headingRows.map((row) => Number(row.querySelector('[data-import-line]')?.value)));
		const pageEntries = filteredEntries.slice(page * pageSize, (page + 1) * pageSize);
		const rows = pageEntries.map((entry) => {
			const alreadyAdded = existingLines.has(entry.line);
			const selected = courseImportDraft.selectedSourceLines.has(entry.line);
			return (
				`<label class="course-import-source-option${alreadyAdded ? ' is-in-outline' : ''}">` +
				`<input type="checkbox" data-import-source-line="${entry.line}" ${selected ? 'checked' : ''} ${alreadyAdded ? 'disabled' : ''} onchange="updateCourseImportSourceSelection(this)">` +
				`<span class="course-import-source-number">Line ${entry.line}</span>` +
				`<span class="course-import-source-text">${esc(entry.text)}</span>` +
				(alreadyAdded ? '<span class="course-import-source-status">Already in outline</span>' : '') +
				'</label>'
			);
		}).join('');
		picker.innerHTML =
			'<div class="course-import-source-picker-toolbar">' +
			'<label class="course-import-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search extracted document text" data-import-source-search placeholder="Find a title in the document…" value="' + esc(courseImportDraft.sourceSearch || '') + '" oninput="updateCourseImportSourceSearch(this)"></label>' +
			`<span>${filteredEntries.length} matching lines · Page ${page + 1} of ${pageCount}</span>` +
			'</div>' +
			`<div class="course-import-source-options">${rows || '<p class="course-import-no-results">No matching lines. Try another search.</p>'}</div>` +
			'<div class="course-import-source-picker-footer">' +
			'<label class="course-import-select-page"><input type="checkbox" data-import-select-page onchange="toggleCourseImportSelectPage(this)"> Select this page</label>' +
			`<button type="button" class="btn btn-sm" onclick="changeCourseImportSourcePage(-1)" ${page === 0 ? 'disabled' : ''}>Previous</button>` +
			`<button type="button" class="btn btn-sm" onclick="changeCourseImportSourcePage(1)" ${page >= pageCount - 1 ? 'disabled' : ''}>Next</button>` +
			`<span data-import-page-indicator>${page + 1} / ${pageCount}</span>` +
			'</div>';
		const pageSelect = picker.querySelector('[data-import-select-page]');
		if (pageSelect) {
			const available = Array.from(picker.querySelectorAll('[data-import-source-line]:not(:disabled)'));
			pageSelect.checked = available.length > 0 && available.every((checkbox) => checkbox.checked);
			pageSelect.indeterminate = available.some((checkbox) => checkbox.checked) && !pageSelect.checked;
		}
		const selectedCount = document.querySelector('[data-import-selection-count]');
		if (selectedCount) {
			const count = courseImportDraft.selectedSourceLines.size;
			selectedCount.textContent = count ? `${count} line${count === 1 ? '' : 's'} selected` : 'No lines selected';
		}
		const addButton = document.querySelector('[data-import-add-source-lines]');
		if (addButton) addButton.disabled = courseImportDraft.selectedSourceLines.size === 0;
	};

	window.updateCourseImportSourceSelection = function (input) {
		if (!courseImportDraft || !input) return;
		const line = Number(input.dataset.importSourceLine);
		if (!Number.isInteger(line) || line < 1) return;
		if (input.checked) courseImportDraft.selectedSourceLines.add(line);
		else courseImportDraft.selectedSourceLines.delete(line);
		const addButton = document.querySelector('[data-import-add-source-lines]');
		if (addButton) addButton.disabled = courseImportDraft.selectedSourceLines.size === 0;
		const count = document.querySelector('[data-import-selection-count]');
		if (count) {
			const size = courseImportDraft.selectedSourceLines.size;
			count.textContent = size ? `${size} line${size === 1 ? '' : 's'} selected` : 'No lines selected';
		}
		const pageSelect = document.querySelector('[data-import-select-page]');
		if (pageSelect) {
			const available = Array.from(document.querySelectorAll('[data-import-source-line]:not(:disabled)'));
			pageSelect.checked = available.length > 0 && available.every((checkbox) => checkbox.checked);
			pageSelect.indeterminate = available.some((checkbox) => checkbox.checked) && !pageSelect.checked;
		}
	};

	window.updateCourseImportSourceSearch = function (input) {
		if (!courseImportDraft || !input) return;
		courseImportDraft.sourceSearch = input.value;
		courseImportDraft.sourcePickerPage = 0;
		window.renderCourseImportSourcePicker();
		const search = document.querySelector('[data-import-source-search]');
		if (search) {
			search.focus();
			search.setSelectionRange(search.value.length, search.value.length);
		}
	};

	window.toggleCourseImportSelectPage = function (input) {
		if (!courseImportDraft) return;
		for (const checkbox of document.querySelectorAll('[data-import-source-line]:not(:disabled)')) {
			checkbox.checked = Boolean(input?.checked);
			const line = Number(checkbox.dataset.importSourceLine);
			if (checkbox.checked) courseImportDraft.selectedSourceLines.add(line);
			else courseImportDraft.selectedSourceLines.delete(line);
		}
		const count = document.querySelector('[data-import-selection-count]');
		if (count) {
			const size = courseImportDraft.selectedSourceLines.size;
			count.textContent = size ? `${size} line${size === 1 ? '' : 's'} selected` : 'No lines selected';
		}
		const addButton = document.querySelector('[data-import-add-source-lines]');
		if (addButton) addButton.disabled = courseImportDraft.selectedSourceLines.size === 0;
	};

	window.changeCourseImportSourcePage = function (offset) {
		if (!courseImportDraft) return;
		courseImportDraft.sourcePickerPage = Math.max(0, (courseImportDraft.sourcePickerPage || 0) + Number(offset || 0));
		window.renderCourseImportSourcePicker();
	};

	window.addSelectedCourseImportSourceLines = function () {
		if (!courseImportDraft?.selectedSourceLines?.size) return;
		const container = document.getElementById('courseImportHeadings');
		const level = Number(document.getElementById('courseImportBulkLevel')?.value);
		if (!container || !Number.isInteger(level) || level < 1 || level > 4) return;
		const lines = String(courseImportDraft.documentText || '').split('\n');
		const existingLines = new Set(Array.from(container.querySelectorAll('[data-import-line]'), (input) => Number(input.value)));
		const selectedLines = [...courseImportDraft.selectedSourceLines].sort((a, b) => a - b);
		for (const line of selectedLines) {
			if (existingLines.has(line)) continue;
			const sourceText = String(lines[line - 1] || '').trim();
			if (!sourceText) continue;
			const title = sourceText.replace(/^\s*#{1,6}\s*/, '').trim().slice(0, 100);
			container.insertAdjacentHTML('beforeend', courseImportHeadingRow(
				{ line, level, title, sourceText },
				container.children.length,
			));
			existingLines.add(line);
		}
		courseImportDraft.selectedSourceLines.clear();
		window.renderCourseImportSourcePicker();
		const count = document.querySelector('[data-import-selection-count]');
		if (count) count.textContent = 'No lines selected';
		const addButton = document.querySelector('[data-import-add-source-lines]');
		if (addButton) addButton.disabled = true;
		window.updateCourseImportOutlineCount();
	};

	window.updateCourseImportOutlineCount = function () {
		const container = document.getElementById('courseImportHeadings');
		if (!container) return;
		const count = container.querySelectorAll('[data-import-heading]').length;
		const badge = document.querySelector('[data-import-outline-count]');
		if (badge) badge.textContent = `${count} heading${count === 1 ? '' : 's'}`;
		const emptyNotice = document.querySelector('[data-import-outline-empty]');
		if (emptyNotice) emptyNotice.hidden = count > 0;
		const goReview = document.getElementById('courseImportGoReview');
		if (goReview) goReview.disabled = count === 0;
	};

	window.showCourseImportCategoryConflicts = function (error) {
		const message = String(error?.message || '');
		const marker = 'Rename these detected titles before importing:';
		const markerIndex = message.indexOf(marker);
		if (markerIndex < 0 || !courseImportDraft) return false;
		const details = message.slice(markerIndex + marker.length);
		const conflicts = [...details.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
		if (!conflicts.length) return false;
		courseImportDraft.conflictingCategoryNames = new Set(conflicts);
		window.updateCourseImportConflictUI();
		const firstConflict = Array.from(document.querySelectorAll('#courseImportHeadings [data-import-heading]'))
			.find((row) => courseImportDraft.conflictingCategoryNames.has(row.querySelector('[data-import-title]')?.value.trim()));
		const input = firstConflict?.querySelector('[data-import-title]');
		if (firstConflict) {
			// Conflicts are fixed in STEP 2, so the review tab must surface them.
			window.setCourseImportReviewTab?.('review');
		}
		if (input) {
			firstConflict.scrollIntoView({ behavior: 'smooth', block: 'center' });
			input.focus({ preventScroll: true });
		}
		return true;
	};

	window.updateCourseImportConflictUI = function () {
		if (!courseImportDraft) return;
		const conflicts = courseImportDraft.conflictingCategoryNames || new Set();
		const rows = Array.from(document.querySelectorAll('#courseImportHeadings [data-import-heading]'));
		const unresolved = new Set();
		for (const row of rows) {
			const input = row.querySelector('[data-import-title]');
			const message = row.querySelector('[data-import-title-error]');
			const isConflict = conflicts.has(input?.value.trim());
			row.classList.toggle('has-category-conflict', isConflict);
			if (message) message.hidden = !isConflict;
			if (isConflict) unresolved.add(input.value.trim());
		}
		const notice = document.querySelector('[data-import-conflict-notice]');
		if (notice) {
			notice.hidden = unresolved.size === 0;
			notice.innerHTML = unresolved.size
				? `<strong>Some outline titles are already in use in this subject.</strong> Rename the highlighted titles, then select “Create course” again.<span>${[...unresolved].map(esc).join(' · ')}</span>`
				: '';
		}
	};

	window.clearCourseImportHeadingError = function (input) {
		if (!input || !courseImportDraft?.conflictingCategoryNames) return;
		const row = input.closest('[data-import-heading]');
		const isConflict = courseImportDraft.conflictingCategoryNames.has(input.value.trim());
		row?.classList.toggle('has-category-conflict', isConflict);
		const message = row?.querySelector('[data-import-title-error]');
		if (message) message.hidden = !isConflict;
		window.updateCourseImportConflictUI();
	};

	window.removeCourseImportHeading = function (button) {
		button?.closest('.course-import-heading')?.remove();
		window.updateCourseImportOutlineCount();
		window.renderCourseImportSourcePicker();
	};

	window.addCourseImportHeading = function () {
		if (!courseImportDraft) return;
		const container = document.getElementById('courseImportHeadings');
		if (!container) return;
		const lines = String(courseImportDraft.documentText || '').split('\n');
		const usedLines = new Set(Array.from(container.querySelectorAll('[data-import-line]'), (input) => Number(input.value)));
		const availableIndex = lines.findIndex((source, index) => source.trim() && !usedLines.has(index + 1));
		const line = availableIndex >= 0 ? availableIndex + 1 : 1;
		const sourceText = lines[line - 1] || '';
		const previousLevel = Number(container.lastElementChild?.querySelector('[data-import-level]')?.value) || 1;
		container.insertAdjacentHTML('beforeend', courseImportHeadingRow(
			{ line, level: previousLevel, sourceText },
			container.children.length,
		));
		window.updateCourseImportOutlineCount();
		window.renderCourseImportSourcePicker();
	};

	window.createCourseFromDocumentImport = async function () {
		if (!courseImportDraft) return toast('Analyze a document before creating a course.', 'error');
		const name = document.getElementById('courseImportName')?.value.trim() || '';
		if (!name) return toast('Enter a course name.', 'error');
		const subjectId = document.getElementById('courseImportSubject')?.value || '';
		if (!subjectId) return toast('Create or select a subject before importing this course.', 'error');
		const headingRows = Array.from(document.querySelectorAll('#courseImportHeadings [data-import-heading]'));
		if (!headingRows.length) return toast('Keep or add at least one outline heading.', 'error');
		const headings = headingRows.map((row) => ({
			line: Number(row.querySelector('[data-import-line]')?.value),
			level: Number(row.querySelector('[data-import-level]')?.value),
			title: row.querySelector('[data-import-title]')?.value.trim() || '',
		}));
		const button = document.getElementById('courseImportCreate');
		if (button) { button.disabled = true; button.textContent = 'Creating course…'; }
		try {
			const A = api();
			if (!A) throw new Error('API client is not available.');
			const course = await A.raw('POST', '/courses/import', {
				name,
				subject_id: subjectId,
				description: document.getElementById('courseImportDescription')?.value || '',
				documentText: courseImportDraft.documentText,
				headings,
			});
			const categories = categoryList();
			const knownIds = new Set(categories.map((category) => String(category.id)));
			for (const category of course.imported_categories || []) {
				if (!knownIds.has(String(category.id))) categories.push(category);
			}
			closeCourseModal('courseImportModal');
			courseImportDraft = null;
			await loadCourses();
			renderCourseList();
			toast(`Imported "${course.name}" with ${course.lessons?.length || 0} course sections.`);
			if (course.id) await openCourseDetail(course.id);
		} catch (err) {
			console.warn('[courses] document import failed:', err);
			if (!window.showCourseImportCategoryConflicts(err)) {
				toast(`Could not create the course: ${err?.message || 'error'}`, 'error');
			}
			if (button) { button.disabled = false; button.textContent = 'Create course'; }
		}
	};

	// preselectId: category id to pre-pick (set from the Categories tab action).
	window.openCourseGeneratorModal = async function (preselectId, defaults = {}) {
		await ensureAiConfigs();
		const list = categoryList().filter((c) => c && c.id && c.id !== 'uncategorized' && !c.isSystem);
		const counts = questionCountByCategory();
		const tree = window.CategoryTree;
		const options = [];
		// getOrderedTree already returns a flat pre-order walk with depths, so no
		// recursion here — recursing would list every sub-level twice.
		const ordered = tree
			? tree.getOrderedTree(list)
			: list.map((category) => ({ category, depth: 0 }));
		for (const { category, depth } of ordered) {
			const branchIds = [category.id, ...(tree ? tree.getDescendantIds(category.id, list) : [])];
			const branchCount = branchIds.reduce((sum, id) => sum + (counts.get(String(id)) || 0), 0);
			const hint = ` · ${branchCount} question${branchCount === 1 ? '' : 's'} in branch`;
			options.push(
				`<option value="${esc(category.id)}" ${String(category.id) === String(preselectId || '') ? 'selected' : ''}>` +
				`${'&nbsp;&nbsp;'.repeat(depth)}${depth ? '└ ' : ''}${esc(category.name)}${hint}</option>`,
			);
		}

		const activeSubName = subjectList().find((s) => String(s.id) === String(activeSubjectId()))?.name || 'Current Subject';
		const body =
			`<div class="course-modal-subject-banner"><span class="subject-badge-pill">Subject / Discipline</span><strong>${esc(activeSubName)}</strong></div>` +
			'<input id="courseIncludeEmptyCategories" type="hidden" value="' + (defaults.includeEmptyCategories ? 'true' : 'false') + '">' +
			'<div class="form-group"><label for="newCourseName">Course Title</label>' +
			`<input type="text" id="newCourseName" value="${esc(defaults.name || '')}" placeholder="e.g. Mathematics — Fractions & Decimals (Grade 5)" style="width:100%;"></div>` +
			'<div class="course-generator-tabs" role="tablist" aria-label="Course outline source">' +
			'<button type="button" class="course-generator-tab" role="tab" aria-selected="false" aria-controls="courseNewStructurePane" onclick="setCourseGeneratorMode(\'new\')">Build New Outline</button>' +
			'<button type="button" class="course-generator-tab active" role="tab" aria-selected="true" aria-controls="courseExistingPane" onclick="setCourseGeneratorMode(\'existing\')">Use existing outlines</button>' +
			'</div>' +
			'<div class="course-generator-quick-import"><button type="button" class="btn btn-sm" onclick="closeCourseModal(\'courseGenModal\');openCourseDocumentImportModal();">📄 Or extract syllabus from Word / PDF document →</button></div>' +
			`<div id="courseExistingPane" class="course-generator-pane">` +
			'<div class="form-group"><label for="newCourseBranch">Module branch</label>' +
			(options.length
				? `<select id="newCourseBranch" style="width:100%;">${options.join('')}</select>`
				: '<div class="course-generator-hint">No categories yet. Choose “Build New Outline” to start one.</div>') +
			'</div>' +
			'<p class="course-generator-hint">Lessons are created for leaf categories that already contain questions.</p>' +
			'</div>' +
			'<div id="courseNewStructurePane" class="course-generator-pane hidden" hidden>' +
			'<div class="course-guidance-card"><span class="guidance-icon">💡</span><div><strong>How Course Structure Works</strong><p>A course outline follows <strong>Module → Chapter → Axis → Lesson</strong>. A new outline creates the module and its chapters; every line under a chapter becomes a lesson. If the category table nests a grouping level inside a chapter, that level is shown as an <strong>Axis</strong> in the document — never as a separate kind of “section”. Each lesson has its own <strong>interactive content</strong> and is the target for <strong>evaluations, quizzes, and games</strong>.</p></div></div>' +
			'<div class="course-guidance-card"><span class="guidance-icon">🧩</span><div><strong>Structure Reference</strong><p><strong>Module</strong> is the course root · <strong>Chapter</strong> groups lessons · <strong>Axis</strong> is an optional sub-group · <strong>Lesson</strong> holds the content and practice target.</p></div></div>' +
			'<div class="form-group"><label for="newCourseRootCategory">Module name</label>' +
			'<input type="text" id="newCourseRootCategory" maxlength="100" placeholder="e.g. Module 1 : Généralités sur les systèmes informatiques" style="width:100%;"></div>' +
			'<div class="course-generator-hint">Add chapters and the lessons beneath each one. The AI writes content for every lesson; questions can be added later. Extra nesting from the category table is rendered as an Axis level.</div>' +
			'<div id="courseSubcategoryGroups"></div>' +
			'<button type="button" class="btn btn-sm btn-secondary" onclick="addCourseSubcategoryGroup()">+ Add Chapter</button>' +
			'</div>' +
			'<div class="course-generator-settings">' +
			'<div class="form-group"><label for="newCourseLanguage">Content language</label>' +
			`<select id="newCourseLanguage"><option value="French" ${!defaults.language || defaults.language === 'French' ? 'selected' : ''}>French</option><option value="English" ${defaults.language === 'English' ? 'selected' : ''}>English</option><option value="Arabic" ${defaults.language === 'Arabic' ? 'selected' : ''}>Arabic</option></select></div>` +
			modelSelectHtml(defaults.configId, 'courseModelSelect') +
			'</div>';
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseGenModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="courseGenGo" onclick="runCourseGeneration()">Generate course</button>';
		openModal('courseGenModal', 'New Course & Curriculum Outline', body, footer, 'course-gen-modal');
		window.addCourseSubcategoryGroup();
		if (defaults.includeEmptyCategories) window.setCourseGeneratorMode('existing');
		else window.setCourseGeneratorMode('new');
	};

	window.setCourseGeneratorMode = function (mode) {
		const isNew = mode === 'new';
		const existing = document.getElementById('courseExistingPane');
		const create = document.getElementById('courseNewStructurePane');
		const modal = document.getElementById('courseGenModal');
		const button = document.getElementById('courseGenGo');
		if (existing) { existing.classList.toggle('hidden', isNew); existing.hidden = isNew; }
		if (create) { create.classList.toggle('hidden', !isNew); create.hidden = !isNew; }
		modal?.querySelectorAll('.course-generator-tab').forEach((tab, index) => {
			const active = index === (isNew ? 0 : 1);
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-selected', String(active));
		});
		if (button) {
			button.textContent = isNew ? 'Create course & outline' : 'Generate course';
			button.onclick = isNew ? window.submitCourseWithStructure : window.runCourseGeneration;
		}
	};

	window.addCourseSubcategoryGroup = function () {
		const container = document.getElementById('courseSubcategoryGroups');
		if (!container) return;
		const group = document.createElement('div');
		group.className = 'course-subcategory-group';
		group.innerHTML =
			`<div class="course-subcategory-heading"><strong>Chapter</strong>` +
			`<button type="button" class="btn btn-sm" aria-label="Remove this chapter" onclick="this.closest('.course-subcategory-group').remove()">Remove</button></div>` +
			`<div class="form-group"><label>Chapter name</label><input type="text" class="course-subcategory-name" maxlength="100" placeholder="e.g. Vocabulaire de base / Simplification" style="width:100%;"></div>` +
			// Axes editor: an option-input-style row (same pattern as the
			// Add-question modal) plus a polished Add button; every axis lands
			// on its own line in the hidden textarea below, which is what the
			// submit pipeline reads.
			'<div class="form-group course-axes-editor"><label>Lessons / Axes <span class="text-muted">(one per line — each becomes a lesson with AI content and a quiz target)</span></label>' +
			'<div class="option-add-row course-axes-add-row">' +
			'<input type="text" class="option-text-input course-axes-input" placeholder="Enter a lesson, e.g. Radical et terminaison…" aria-label="New lesson" onkeydown="courseAxesInputKeydown(event, this)">' +
			'<button type="button" class="btn btn-primary add-option-btn course-axes-add-btn" title="Add lesson" aria-label="Add lesson" onclick="addCourseAxisToGroup(this)">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
			'</button></div>' +
			`<textarea class="course-subcategory-axes" rows="3" style="display:none;" aria-hidden="true" tabindex="-1"></textarea>` +
			'<p class="course-axes-empty" hidden>No lessons yet — add the first one above.</p>' +
			'<div class="course-axes-chips" role="list" aria-label="Lessons in this chapter"></div></div>';
		container.appendChild(group);
		renderCourseSubcategoryAxes(group, []);
	};

	// Every axis is kept as one textarea line so `submitCourseWithStructure`
	// (which reads the textarea content) needs no change.
	function readCourseSubcategoryAxes(group) {
		return (group.querySelector('.course-subcategory-axes')?.value || '')
			.split(/\r?\n/)
			.map((axis) => axis.trim())
			.filter(Boolean);
	}

	function renderCourseSubcategoryAxes(group, axes) {
		const textarea = group.querySelector('.course-subcategory-axes');
		if (textarea) textarea.value = axes.join('\n');
		const chips = group.querySelector('.course-axes-chips');
		if (chips) {
			chips.innerHTML = axes
				.map(
					(axis, axisIndex) =>
						'<span class="course-axes-chip" role="listitem">' +
						`<span class="course-axes-chip-label">${esc(axis)}</span>` +
						`<button type="button" class="course-axes-chip-remove" aria-label="Remove lesson: ${esc(axis)}" data-axis-index="${axisIndex}" onclick="removeCourseAxisFromGroup(this)">&times;</button>` +
						'</span>',
				)
				.join('');
		}
		const empty = group.querySelector('.course-axes-empty');
		if (empty) empty.hidden = axes.length > 0;
	}

	window.addCourseAxisToGroup = function (button) {
		const group = button?.closest?.('.course-subcategory-group');
		if (!group) return;
		const input = group.querySelector('.course-axes-input');
		const value = String(input?.value || '').trim();
		if (!value) {
			input?.focus();
			return;
		}
		renderCourseSubcategoryAxes(group, readCourseSubcategoryAxes(group).concat(value));
		if (input) {
			input.value = '';
			input.focus();
		}
	};

	window.removeCourseAxisFromGroup = function (button) {
		const group = button?.closest?.('.course-subcategory-group');
		if (!group) return;
		const axes = readCourseSubcategoryAxes(group);
		axes.splice(Number(button.dataset.axisIndex) || 0, 1);
		renderCourseSubcategoryAxes(group, axes);
		group.querySelector('.course-axes-input')?.focus();
	};

	window.courseAxesInputKeydown = function (event, input) {
		if (event?.key === 'Enter') {
			event.preventDefault();
			window.addCourseAxisToGroup(
				input?.closest?.('.course-axes-add-row')?.querySelector('.course-axes-add-btn'),
			);
		}
	};

	// One subject-bound pipeline: the root, its subcategories and their axes are
	// created server-side together with the course (POST /courses/with-structure),
	// so a half-written course never leaves orphan categories behind and every
	// node carries its subject.
	window.submitCourseWithStructure = async function () {
		const name = (document.getElementById('newCourseName')?.value || '').trim();
		const rootName = (document.getElementById('newCourseRootCategory')?.value || '').trim();
		const groups = Array.from(document.querySelectorAll('#courseSubcategoryGroups .course-subcategory-group')).map((group) => ({
			name: group.querySelector('.course-subcategory-name')?.value.trim() || '',
			axes: (group.querySelector('.course-subcategory-axes')?.value || '').split(/\r?\n/).map((axis) => axis.trim()).filter(Boolean),
		}));
		const language = document.getElementById('newCourseLanguage')?.value || 'French';
		const configId = selectedConfigId(document.getElementById('courseGenModal'));
		const subjectId = activeSubjectId();
		if (subjectId === '__unassigned__') return toast('Pick a subject first — a course lives inside one.', 'error');
		if (!name) return toast('Give the course a name first.', 'error');
		if (!rootName) return toast('Enter a module name.', 'error');
		if (!groups.length || groups.some((group) => !group.name || !group.axes.length)) {
			return toast('Each chapter needs a name and at least one lesson.', 'error');
		}
		const btn = document.getElementById('courseGenGo');
		if (btn) { btn.disabled = true; btn.textContent = 'Creating course…'; }
		const A = api();
		if (!A) {
			if (btn) { btn.disabled = false; btn.textContent = 'Create course'; }
			return;
		}
		try {
			const course = await A.raw('POST', '/courses/with-structure', {
				name,
				subjectId,
				rootName,
				groups,
				language,
				...(configId ? { configId } : {}),
				includeEmptyCategories: true,
			});
			const list = categoryList();
			const known = new Set(list.map((c) => String(c.id)));
			for (const category of course.created_categories || []) {
				if (!known.has(String(category.id))) list.push(category);
			}
			window.closeCourseModal('courseGenModal');
			await loadCourses();
			renderCourseList();
			renderWorkspacePanes();
			toast(`Course "${course?.name || name}" created with ${course?.lessons?.length || 0} lesson(s).`);
			if (course?.id) await openCourseDetail(course.id);
		} catch (err) {
			console.warn('[courses] with-structure failed:', err);
			if (btn) { btn.disabled = false; btn.textContent = 'Create course'; }
			toast('Could not create the course: ' + (err?.message || 'error'), 'error');
		}
	};

	window.runCourseGeneration = async function () {
		const name = (document.getElementById('newCourseName')?.value || '').trim();
		const categoryId = document.getElementById('newCourseBranch')?.value || '';
		const language = document.getElementById('newCourseLanguage')?.value || 'French';
		const configId = selectedConfigId(document.getElementById('courseGenModal'));
		const includeEmptyCategories = document.getElementById('courseIncludeEmptyCategories')?.value === 'true';
		if (!name) return toast('Give the course a name first.', 'error');
		if (!categoryId) return toast('Pick a module branch first.', 'error');
		if (!configId) return toast('Pick an AI model (Settings → AI Generation if empty).', 'error');
		const btn = document.getElementById('courseGenGo');
		if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
		const A = api();
		if (!A) return;
		try {
			const course = await A.raw('POST', '/courses/generate', { name, categoryId, configId, language, includeEmptyCategories });
			window.closeCourseModal('courseGenModal');
			toast(`Course "${course?.name || name}" created with ${course?.lessons?.length || 0} lesson(s).`)
			await loadCourses();
			renderCourseList();
			if (course?.id) await openCourseDetail(course.id);
		} catch (err) {
			if (btn) { btn.disabled = false; btn.textContent = 'Generate course'; }
			toast('Generation failed: ' + (err?.message || 'error'), 'error');
		}
	};

	// Entry point for the structure-row action: stay inside the Subjects tab,
	// refresh the list and open the generator with this branch already picked.
	// Generation itself stays server-side (it validates the 1:1 branch rule).
	window.openCourseFromCategory = async function (categoryId) {
		const cat = categoryList().find((c) => String(c.id) === String(categoryId));
		if (!cat) {
			toast('Module not found — refresh the Subjects tab first.', 'error');
			return;
		}
		try {
			if (typeof window.openTab === 'function') window.openTab(null, 'subjects');
		} catch (_) {
			/* tab switching is cosmetic — the modal still opens */
		}
		await refresh();
		await window.openCourseGeneratorModal(cat.id);
	};

	// ── Detail view ──────────────────────────────────────────────────────────
	window.openCourseDetail = async function (courseId) {
		const A = api();
		if (!A) return;
		await ensureAiConfigs();
		try {
			currentCourse = await A.raw('GET', `/courses/${encodeURIComponent(courseId)}`);
			loadCollapsedCourseCategories(currentCourse.id);
			courseDetailMode = 'view';
		} catch (err) {
			toast('Could not open course: ' + (err?.message || 'error'), 'error');
			return;
		}
		const listPane = document.getElementById('courseListPane');
		const detailPane = document.getElementById('courseDetailPane');
		void listPane;
		if (detailPane) renderCourseDetail();
		workspaceView = 'detail';
		renderWorkspacePanes();
	};
	window.closeCourseDetail = function () {
		currentCourse = null;
		workspaceView = 'courses';
		window.SubjectsManagement?.setView?.('subject');
		renderCourseList();
		renderWorkspacePanes();
	};

	// ── Branch ↔ course linking (the two buckets the workspace surfaces) ─────
	function freeBranchOptions(subjectId) {
		return rootBranches(subjectId)
			.map((root) => `<option value="${esc(root.id)}">${esc(categoryPath(root.id) || root.name)}</option>`)
			.join('');
	}

	/** "Create course here": a course on an existing, still-free structure. */
	window.createCourseOnBranch = function (rootId) {
		const root = categoryList().find((c) => String(c.id) === String(rootId));
		if (!root) return toast('Structure not found — refresh the list.', 'error');
		const body =
			`<p class="course-generator-hint">Course name for the structure <strong>${esc(root.name)}</strong>. It becomes the course's own branch, so no other course can claim it.</p>` +
			'<div class="form-group"><label for="branchCourseName">Course name</label>' +
			`<input type="text" id="branchCourseName" maxlength="200" value="${esc(root.name)}" style="width:100%;"></div>`;
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseBranchModal\')">Cancel</button>' +
			`<button type="button" class="btn btn-primary" onclick="submitCourseOnBranch('${esc(root.id)}')">Create course</button>`;
		openModal('courseBranchModal', 'New Course on this Structure', body, footer);
	};

	window.submitCourseOnBranch = async function (rootId) {
		const name = (document.getElementById('branchCourseName')?.value || '').trim();
		if (!name) return toast('Give the course a name first.', 'error');
		const A = api();
		if (!A) return;
		try {
			const course = await A.raw('POST', '/courses', { name, category_id: rootId });
			closeCourseModal('courseBranchModal');
			await loadCourses();
			renderCourseList();
			renderWorkspacePanes();
			toast(`Course "${course?.name || name}" created.`);
			if (window.SubjectsManagement?.refresh) await window.SubjectsManagement.refresh();
			if (course?.id) await openCourseDetail(course.id);
		} catch (err) {
			toast('Could not create the course: ' + (err?.message || 'error'), 'error');
		}
	};

	/** "Link a structure": attach an unlinked course to a free branch. */
	window.linkStructure = function (courseId) {
		const course = coursesCache.find((c) => String(c.id) === String(courseId));
		if (!course) return toast('Course not found — refresh the list.', 'error');
		const options = freeBranchOptions(activeSubjectId());
		const body = options
			? `<p class="course-generator-hint">Pick the structure that belongs to <strong>${esc(course.name || '')}</strong>. Structures that already have a course are not listed.</p>` +
				`<div class="form-group"><label for="linkStructureSelect">Free structure</label><select id="linkStructureSelect" style="width:100%;">${options}</select></div>`
			: '<div class="course-generator-hint">No free structure in this subject yet — create one with “New Course” first.</div>';
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseLinkModal\')">Cancel</button>' +
			(options
				? `<button type="button" class="btn btn-primary" onclick="submitLinkedStructure('${esc(course.id)}')">Link structure</button>`
				: '');
		openModal('courseLinkModal', 'Link a Structure', body, footer);
	};

	window.submitLinkedStructure = async function (courseId) {
		const categoryId = document.getElementById('linkStructureSelect')?.value || '';
		if (!categoryId) return toast('Pick a structure first.', 'error');
		const A = api();
		if (!A) return;
		try {
			await A.raw('PATCH', `/courses/${encodeURIComponent(courseId)}`, { category_id: categoryId });
			closeCourseModal('courseLinkModal');
			await loadCourses();
			renderCourseList();
			renderWorkspacePanes();
			toast('Structure linked to the course.');
		} catch (err) {
			toast('Could not link the structure: ' + (err?.message || 'error'), 'error');
		}
	};

	function lessonsByCategory() {
		const map = new Map();
		for (const lesson of currentCourse?.lessons || []) {
			if (!lesson.category_id) continue;
			const key = String(lesson.category_id);
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(lesson);
		}
		return map;
	}

	function courseDocumentLessonId(lesson) {
		return `course-document-lesson-${String(lesson.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
	}

	function courseDocumentCategoryId(category) {
		return `course-document-category-${String(category.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
	}

	function buildCourseDocumentTree(branchRows, lessonMap) {
		const nodes = new Map();
		for (const { category } of branchRows) {
			nodes.set(String(category.id), { category, children: [], lessons: lessonMap.get(String(category.id)) || [] });
		}
		const roots = [];
		for (const node of nodes.values()) {
			const parentId = String(node.category.parent_id || '');
			const parent = nodes.get(parentId);
			if (parent) parent.children.push(node);
			else roots.push(node);
		}
		return roots;
	}

	function renderCourseDocumentContentsNode(node, depth = 0) {
		const category = node.category;
		const level = courseLevelLabel(depth, node.children.length === 0);
		return (
			`<li><a href="#${esc(courseDocumentCategoryId(category))}">` +
			`<span>${level}</span><strong>${esc(category.name)}</strong></a>` +
			(node.children.length
				? `<ol>${node.children.map((child) => renderCourseDocumentContentsNode(child, depth + 1)).join('')}</ol>`
				: '') +
			'</li>'
		);
	}

	function renderCourseDocumentNode(node, depth = 0) {
		const category = node.category;
		const headingLevel = Math.min(depth + 2, 5);
		const level = courseLevelLabel(depth, node.children.length === 0);
		const lessons = node.lessons.map((lesson) =>
			`<section class="course-document-lesson" id="${esc(courseDocumentLessonId(lesson))}">` +
			(node.children.length && lesson.title !== category.name
				? `<h${Math.min(headingLevel + 1, 6)}>${esc(lesson.title)}</h${Math.min(headingLevel + 1, 6)}>`
				: '') +
			(lesson.summary ? `<p class="course-document-summary">${esc(lesson.summary)}</p>` : '') +
			(String(lesson.content || '').trim()
				? `<div class="course-md">${renderMarkdown(lesson.content)}</div>`
				: '<p class="course-document-placeholder">Content has not been added yet.</p>') +
			'</section>',
		).join('');
		return (
			`<section class="course-document-category" id="${esc(courseDocumentCategoryId(category))}" style="--course-document-depth:${depth}">` +
			`<div class="course-document-category-heading"><span>${level}</span><h${headingLevel}>${esc(category.name)}</h${headingLevel}></div>` +
			lessons +
			node.children.map((child) => renderCourseDocumentNode(child, depth + 1)).join('') +
			'</section>'
		);
	}

	function buildLessonOutline(lessons) {
		const nodes = new Map(
			lessons.map((lesson) => [
				String(lesson.id),
				{ lesson, parent: null, children: [] },
			]),
		);
		for (const node of nodes.values()) {
			const parentId = String(node.lesson.parent_lesson_id || '');
			const parent = nodes.get(parentId);
			if (parent && parent !== node) node.parent = parent;
		}
		for (const node of nodes.values()) {
			const path = new Set([String(node.lesson.id)]);
			let ancestor = node.parent;
			while (ancestor) {
				const ancestorId = String(ancestor.lesson.id);
				if (path.has(ancestorId)) {
					node.parent = null;
					break;
				}
				path.add(ancestorId);
				ancestor = ancestor.parent;
			}
		}
		const roots = [];
		for (const node of nodes.values()) {
			if (node.parent) node.parent.children.push(node);
			else roots.push(node);
		}
		const byOrder = (a, b) =>
			(Number(a.lesson.order_index) || 0) -
			(Number(b.lesson.order_index) || 0);
		const sort = (siblings) => {
			siblings.sort(byOrder);
			siblings.forEach((node) => sort(node.children));
		};
		sort(roots);
		return roots;
	}

	function renderTeacherLessonContentsNode(node, depth = 0) {
		const lesson = node.lesson;
		return (
			`<li><a href="#${esc(courseDocumentLessonId(lesson))}">` +
			`<span>Heading ${depth + 1}</span><strong>${esc(lesson.title)}</strong></a>` +
			(node.children.length
				? `<ol>${node.children.map((child) => renderTeacherLessonContentsNode(child, depth + 1)).join('')}</ol>`
				: '') +
			'</li>'
		);
	}

	function renderTeacherLessonNode(node, depth = 0) {
		const lesson = node.lesson;
		const headingLevel = Math.min(depth + 2, 6);
		return (
			`<section class="course-document-category course-outline-node" style="--course-document-depth:${depth}">` +
			`<div class="course-document-category-heading"><span>Heading ${depth + 1}</span>` +
			`<h${headingLevel} id="${esc(courseDocumentLessonId(lesson))}">${esc(lesson.title)}</h${headingLevel}></div>` +
			`<section class="course-document-lesson">` +
			(lesson.summary ? `<p class="course-document-summary">${esc(lesson.summary)}</p>` : '') +
			(String(lesson.content || '').trim()
				? `<div class="course-md">${renderMarkdown(lesson.content)}</div>`
				: '<p class="course-document-placeholder">Content has not been added yet.</p>') +
			`</section>${node.children.map((child) => renderTeacherLessonNode(child, depth + 1)).join('')}</section>`
		);
	}

	function renderTeacherCourseDocument(course, branchRows) {
		const lessons = course.lessons || [];
		const hasLessonOutline = lessons.some((lesson) => lesson.parent_lesson_id);
		const lessonOutline = hasLessonOutline ? buildLessonOutline(lessons) : [];
		const tree = hasLessonOutline
			? []
			: buildCourseDocumentTree(branchRows, lessonsByCategory());
		const renderedTree = hasLessonOutline
			? lessonOutline.map((node) => renderTeacherLessonNode(node)).join('')
			: tree.map((node) => renderCourseDocumentNode(node)).join('');
		const linkedIds = new Set(branchRows.flatMap(({ category }) =>
			(lessonsByCategory().get(String(category.id)) || []).map((lesson) => String(lesson.id)),
		));
		const unlinked = hasLessonOutline
			? []
			: lessons.filter((lesson) => !linkedIds.has(String(lesson.id)));
		const unlinkedHtml = unlinked.length
			? `<section class="course-document-category"><div class="course-document-category-heading"><span>Additional lessons</span><h2>Other lessons</h2></div>` +
				unlinked.map((lesson) =>
					`<section class="course-document-lesson" id="${esc(courseDocumentLessonId(lesson))}"><h3>${esc(lesson.title)}</h3>` +
					(lesson.summary ? `<p class="course-document-summary">${esc(lesson.summary)}</p>` : '') +
					(String(lesson.content || '').trim() ? `<div class="course-md">${renderMarkdown(lesson.content)}</div>` : '<p class="course-document-placeholder">Content has not been added yet.</p>') +
					'</section>',
				).join('') + '</section>'
			: '';
		const contents = hasLessonOutline
			? lessonOutline.map((node) => renderTeacherLessonContentsNode(node)).join('')
			: tree.map((node) => renderCourseDocumentContentsNode(node)).join('');
		const unlinkedContents = unlinked.map((lesson) =>
			`<li><a href="#${esc(courseDocumentLessonId(lesson))}"><span>Additional content</span><strong>${esc(lesson.title)}</strong></a></li>`,
		).join('');
		return (
			`<article class="course-document-view">` +
			`<header class="course-document-cover"><span>Course content</span><h1>${esc(course.name)}</h1>` +
			(course.description ? `<p>${esc(course.description)}</p>` : '') +
			`<div>${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</div></header>` +
			`<section class="course-document-toc"><h2>Summary and contents</h2>` +
			(course.description ? `<p class="course-document-overview">${esc(course.description)}</p>` : '') +
			(contents || unlinkedContents
				? `<ol>${contents}${unlinkedContents}</ol>`
				: '<p class="course-document-placeholder">This course has no lessons yet.</p>') +
			`</section><div class="course-document-body">${renderedTree}${unlinkedHtml}</div></article>`
		);
	}

	window.setCourseDetailMode = function (mode) {
		if (!['view', 'edit'].includes(mode)) return;
		courseDetailMode = mode;
		window.renderCourseDetail();
	};

	window.renderCourseDetail = function () {
		const pane = document.getElementById('courseDetailPane');
		if (!pane || !currentCourse) return;
		const course = currentCourse;
		const published = course.status === 'published';
		const lessonByCat = lessonsByCategory();
		const counts = questionCountByCategory();
		const list = categoryList();
		const tree = window.CategoryTree;

		// Branch subtree (root = course.category_id), with lessons linked to
		// their axes and every ancestor visible for context.
		let branchRows = [];
		const rootCat = course.category_id
			? list.find((c) => String(c.id) === String(course.category_id))
			: null;
		if (rootCat) {
			const ids = new Set([String(rootCat.id), ...tree.getDescendantIds(rootCat.id, list).map(String)]);
			branchRows = tree
				.getOrderedTree(list.filter((c) => ids.has(String(c.id))));
		}

		const structureHtml = branchRows.length
			? branchRows
				.map(({ category, depth }) => {
					const lesson = lessonByCat.get(String(category.id));
					const qCount = questionCountForCategoryBranch(category.id, counts, list, tree);
					const hasChildren = branchRows.some((row) => String(row.category.parent_id) === String(category.id));
					const level = courseLevelLabel(depth, !hasChildren);
					const toggle = hasChildren
						? `<button type="button" class="course-tree-toggle" data-course-collapse="${esc(category.id)}" onclick="toggleCourseCategory('${esc(category.id)}')" aria-label="Toggle ${esc(category.name)} chapters" aria-expanded="${!collapsedCourseCategoryIds.has(String(category.id))}">${collapsedCourseCategoryIds.has(String(category.id)) ? '+' : '−'}</button>`
						: '<span class="course-tree-toggle-spacer" aria-hidden="true"></span>';
					const lessonLabel = lesson
						? `<button type="button" class="btn btn-sm course-tree-lesson-link" onclick="focusLesson('${esc(lesson.id)}')" title="Open lesson">Lesson: ${esc(lesson.title)}</button>`
						: `<span class="course-tree-unassigned">${hasChildren ? 'Lessons are organized below' : 'No lesson linked'}</span>`;
					const generateBtn = lesson
						? `<button type="button" class="btn btn-ai-generate btn-sm course-tree-generate" data-gen-lesson="${esc(lesson.id)}" onclick="openLessonAIActions('${esc(lesson.id)}')">Generate course content via AI</button>`
						: '';
					const generateQuestionsBtn = !hasChildren
						? `<button type="button" class="btn btn-sm course-tree-q-btn" onclick="openCategoryQuestionGeneration('${esc(category.id)}')">Generate questions</button>`
						: '';
					return (
						`<div class="course-tree-row" data-category-id="${esc(category.id)}"${lesson ? ` data-lesson-id="${esc(lesson.id)}"` : ''} style="--course-depth:${depth};">` +
						`<div class="course-tree-category">${toggle}<span class="course-tree-level">${level}</span>` +
						`<strong>${esc(category.name)}</strong><span class="course-tree-count">${qCount} question${qCount === 1 ? '' : 's'}</span></div>` +
						`<div class="course-tree-actions">${lessonLabel}${generateBtn}${generateQuestionsBtn}</div>` +
						'</div>'
					);
				})
				.join('')
			: '<div class="course-generator-hint">This course has no linked category branch (or the branch was deleted). Add lessons manually below.</div>';

		const lessonsHtml = (course.lessons || [])
			.map((l, idx) => lessonCardHtml(l, idx))
			.join('');

		const lessonCount = (course.lessons || []).length;
		const toolbarIcons = {
			back: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path></svg>',
			view: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
			edit: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
			structure: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><path d="M6.5 10v4a3 3 0 0 0 3 3H14"></path></svg>',
			link: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7L13 18"></path></svg>',
			rename: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
			publish: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
			unpublish: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18.4 5.6a9 9 0 1 0 0 12.8"></path><path d="M3 3l18 18"></path></svg>',
			assign: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>',
			add: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
			document: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>',
		};

		pane.innerHTML =
			'<div class="course-detail-toolbar" role="region" aria-label="Course workspace">' +
			'<div class="course-detail-heading">' +
				`<button type="button" class="btn course-detail-back" title="Back to all courses" onclick="closeCourseDetail()">${toolbarIcons.back}<span>All courses</span></button>` +
				'<div class="course-detail-title">' +
					'<span class="course-detail-eyebrow">Course workspace</span>' +
					`<h2>${esc(course.name)}</h2>` +
					'<div class="course-detail-badges">' +
						`<span class="status-badge ${published ? 'status-success' : 'status-warning'}">${published ? 'Published' : 'Draft'}</span>` +
						`<span class="course-detail-lesson-count">${lessonCount} lesson${lessonCount === 1 ? '' : 's'}</span>` +
						(!course.category_id ? '<span class="course-kind-chip is-unlinked">No structure</span>' : '') +
					'</div>' +
				'</div>' +
			'</div>' +
			`<div class="course-detail-controls">` +
				'<div class="course-detail-tools">' +
					`<div class="course-detail-mode" role="group" aria-label="Course mode">` +
						`<button type="button" class="btn ${courseDetailMode === 'view' ? 'active' : ''}" aria-pressed="${courseDetailMode === 'view'}" onclick="setCourseDetailMode('view')">${toolbarIcons.view}<span>View course</span></button>` +
						`<button type="button" class="btn ${courseDetailMode === 'edit' ? 'active' : ''}" aria-pressed="${courseDetailMode === 'edit'}" onclick="setCourseDetailMode('edit')">${toolbarIcons.edit}<span>Edit content</span></button>` +
					'</div>' +
					(courseDetailMode === 'edit' ? '<div class="course-model-control">' + modelSelectHtml(selectedCourseConfigId, 'courseModelSelect') + '</div>' : '') +
				'</div>' +
				'<div class="course-detail-actions" role="group" aria-label="Course actions">' +
					(course.category_id
						? `<button type="button" class="btn course-action-structure" title="Edit the module and chapter structure" onclick="openStructureBranch('${esc(course.category_id)}', {courseId:'${esc(course.id)}'})">${toolbarIcons.structure}<span>Edit structure</span></button>`
						: `<button type="button" class="btn course-action-link" title="Link a category branch to this course" onclick="linkStructure('${esc(course.id)}')">${toolbarIcons.link}<span>Link a structure</span></button>`) +
					`<button type="button" class="btn course-action-rename" title="Rename this course" onclick="renameCoursePrompt()">${toolbarIcons.rename}<span>Rename</span></button>` +
					`<button type="button" class="btn ${published ? 'course-action-unpublish' : 'course-action-publish'}" title="${published ? 'Move this course back to draft' : 'Publish this course for students'}" onclick="toggleCoursePublish('${esc(course.id)}','${published ? 'unpublish' : 'publish'}')">${published ? toolbarIcons.unpublish : toolbarIcons.publish}<span>${published ? 'Unpublish' : 'Publish'}</span></button>` +
					`<button type="button" class="btn course-action-assign" title="Send this course to your students" onclick="openAssignClassesModal()">${toolbarIcons.assign}<span>Send to students</span></button>` +
					(courseDetailMode === 'edit' ? `<button type="button" class="btn course-action-add" title="Add a lesson to this course" onclick="addLessonManual()">${toolbarIcons.add}<span>Add lesson</span></button>` : '') +
					'<span class="course-detail-action-divider" aria-hidden="true"></span>' +
					`<button type="button" class="btn course-action-document" title="Create course document" onclick="createCourseDocument()">${toolbarIcons.document}<span>Create document</span></button>` +
				'</div>' +
			'</div></div>' +
			(courseDetailMode === 'view'
				? renderTeacherCourseDocument(course, branchRows)
				: `<div class="course-command-launchpad">` +
					`<div class="launchpad-card launchpad-lessons">` +
						`<div class="launchpad-header"><span class="launchpad-icon">📖</span><div><h4>Course Material & Lessons</h4><small>${(course.lessons || []).length} lesson unit(s) · Interactive student reader & exports</small></div></div>` +
						`<div class="launchpad-actions">` +
							(course.lessons?.length ? `<button type="button" class="btn btn-sm btn-primary" onclick="confirmGenerateAllCourseLessons()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z"></path></svg> Generate All Lessons (AI)</button>` : '') +
							`<button type="button" class="btn btn-sm" onclick="createCourseDocument()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg> Export PDF / Word</button>` +
							`<button type="button" class="btn btn-sm" onclick="openAssignClassesModal()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg> Send to Students</button>` +
						`</div>` +
					`</div>` +
					`<div class="launchpad-card launchpad-questions">` +
						`<div class="launchpad-header"><span class="launchpad-icon">🎯</span><div><h4>Assessments & Question Bank</h4><small>3 ways: In-App AI, Prompt Studio, or Manual</small></div></div>` +
						`<div class="launchpad-actions">` +
							`<button type="button" class="btn btn-sm btn-ai-generate" onclick="openCourseQuestionLaunchpad()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Generate Questions (AI)</button>` +
							`<button type="button" class="btn btn-sm" onclick="openPromptStudioForCourse()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 9h6M9 13h6M9 17h4"></path></svg> AI Prompt Studio</button>` +
							`<button type="button" class="btn btn-sm" onclick="openManualQuestionForCourse()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> + Add Manually</button>` +
						`</div>` +
					`</div>` +
				`</div>` +
				`<div class="course-branch-path">${esc(course.category_path || categoryPath(course.category_id) || 'No module branch')}</div>` +
			'<section class="course-structure-panel"><div class="course-section-heading"><div><h3>Course structure</h3>' +
			'<p>Lessons follow the categories and axes in this branch.</p></div>' +
			`<div class="course-structure-tools"><span class="course-structure-count">${branchRows.length} level${branchRows.length === 1 ? '' : 's'}</span>` +
			(branchRows.some((row) => branchRows.some((child) => String(child.category.parent_id) === String(row.category.id)))
				? '<button type="button" class="course-tree-bulk-toggle" onclick="setCourseCategoriesCollapsed(true)">Collapse all</button><button type="button" class="course-tree-bulk-toggle" onclick="setCourseCategoriesCollapsed(false)">Expand all</button>'
				: '') +
			'<span id="courseBatchStatus" class="course-batch-status" aria-live="polite"></span>' +
			(course.lessons?.length
				? '<button type="button" class="btn btn-primary btn-sm" data-generate-all-levels onclick="confirmGenerateAllCourseLessons()">Generate all levels with AI</button>'
				: '') +
			(course.lessons?.length
				? '<button type="button" class="btn btn-sm" data-prep-sheets-all onclick="generateAllPrepSheets()">Prep Sheets</button>'
				: '') +
			'</div></div>' +
			`<div class="course-tree">${structureHtml}</div></section>` +
			'<h3 style="margin:8px 0;">Lessons</h3>' +
			`<div id="courseLessonsWrap">${lessonsHtml || '<div class="text-muted">No lessons yet.</div>'}</div>`);
		const modelSelect = pane.querySelector('#courseModelSelect');
		if (modelSelect) {
			if (selectedCourseConfigId) modelSelect.value = selectedCourseConfigId;
			modelSelect.addEventListener('change', () => {
			selectedCourseConfigId = modelSelect.value;
			});
		}
		updateCourseTreeVisibility();
		pane.querySelectorAll('.course-tree-row[data-lesson-id]').forEach((row) => {
			row.addEventListener('click', (event) => {
				if (window.innerWidth > 768 || event.target.closest('button')) return;
				event.stopPropagation();
				openMobileLessonActions(row.dataset.lessonId);
			});
		});
	};

	window.confirmGenerateAllCourseLessons = function () {
		if (!currentCourse?.lessons?.length) return toast('This course has no lessons to generate.', 'error');
		openModal(
			'courseGenerateAllModal',
			'AI options · all course levels',
			`<p>Choose how to create content for all <strong>${currentCourse.lessons.length} levels</strong> in <strong>${esc(currentCourse.name)}</strong>.</p>` +
				'<p>You can generate directly, copy a structured prompt for another AI, or paste its completed course result.</p>' +
				(currentCourse.lessons.some((lesson) => String(lesson.content || '').trim())
					? '<p class="course-generator-hint">Existing lesson content will be replaced when you save new results.</p>'
					: ''),
			`<button type="button" class="btn" onclick="closeCourseModal('courseGenerateAllModal')">Cancel</button>` +
				'<button type="button" class="btn course-action-copy" onclick="copyAllCourseAIPrompt()">Copy prompt</button>' +
				'<button type="button" class="btn course-action-import" onclick="openAllCourseAIResult()">Load AI result</button>' +
				'<button type="button" class="btn btn-primary" onclick="generateAllCourseLessons()">Generate all</button>',
		);
	};

	window.copyAllCourseAIPrompt = async function () {
		const A = api();
		if (!A || !currentCourse?.lessons?.length) return;
		try {
			const course = currentCourse;
			const prompts = [];
			for (const lesson of course.lessons) {
				const result = await A.raw(
					'POST',
					`/courses/${encodeURIComponent(course.id)}/lessons/${encodeURIComponent(lesson.id)}/generate-content`,
					{ promptOnly: true, language: 'French', includeQuestions: true },
				);
				if (!result?.prompt) throw new Error(`No prompt was returned for "${lesson.title}".`);
				prompts.push({ lessonId: lesson.id, title: lesson.title, prompt: result.prompt });
			}
			const prompt =
				`Create complete course content for "${course.name}". Follow each lesson-specific instruction below and preserve the app's Markdown lesson structure. ` +
				'Return ONLY valid JSON, with no Markdown fences, in exactly this shape: ' +
				'{"lessons":[{"lessonId":"EXACT_ID","content":"## Objectives\\\\n..."}]}. ' +
				'Include every requested lesson exactly once, preserve each lessonId exactly, and put each complete lesson in its content string. ' +
				'Do not invent lesson IDs or include answer keys. Each lesson must include the sections requested by its prompt.\n\n' +
				prompts.map((item, index) => `===== LESSON ${index + 1} · ${item.title} · lessonId=${item.lessonId} =====\n${item.prompt}`).join('\n\n');
			let copied = false;
			try {
				if (navigator.clipboard?.writeText) {
					await navigator.clipboard.writeText(prompt);
					copied = true;
				}
			} catch (_) {}
			if (!copied) {
				const helper = document.createElement('textarea');
				helper.value = prompt;
				helper.setAttribute('readonly', '');
				helper.style.cssText = 'position:fixed;top:-9999px;opacity:0';
				document.body.appendChild(helper);
				helper.select();
				try { copied = document.execCommand('copy'); } finally { helper.remove(); }
			}
			if (copied) {
				window.closeCourseModal('courseGenerateAllModal');
				toast('Course prompt copied. Paste it into ChatGPT, Claude, or another AI.', 'success');
			} else {
				openModal(
					'courseAllPromptModal',
					'Copy course prompt',
					`<textarea id="courseAllPromptText" rows="18" readonly style="width:100%;">${esc(prompt)}</textarea>`,
					'<button type="button" class="btn" onclick="closeCourseModal(\'courseAllPromptModal\')">Close</button>' +
						'<button type="button" class="btn btn-primary" onclick="document.getElementById(\'courseAllPromptText\').select()">Select prompt</button>',
				);
			}
		} catch (err) {
			toast('Could not prepare the course prompt: ' + (err?.message || 'error'), 'error');
		}
	};

	window.openAllCourseAIResult = function () {
		if (!currentCourse?.lessons?.length) return toast('This course has no lessons to update.', 'error');
		const expected = currentCourse.lessons.map((lesson) => `<li><code>${esc(lesson.id)}</code> · ${esc(lesson.title)}</li>`).join('');
		openModal(
			'courseAllAIResultModal',
			'Load course AI result',
			'<p>Paste the JSON returned by ChatGPT, Claude, or another AI. Every lesson must appear exactly once with its original ID and Markdown content.</p>' +
				'<div class="course-generator-hint">Expected lesson IDs:</div><ul class="course-ai-lesson-ids">' + expected + '</ul>' +
				'<div class="form-group"><label for="courseAllAIResultText">AI-generated course JSON</label><textarea id="courseAllAIResultText" rows="16" placeholder=\'{"lessons":[{"lessonId":"...","content":"## Objectives\\\\n..."}]}\'></textarea></div>',
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseAllAIResultModal\')">Cancel</button>' +
				'<button type="button" class="btn btn-primary" onclick="saveAllCourseAIResult()">Validate and save all</button>',
		);
	};

	window.saveAllCourseAIResult = async function () {
		const A = api();
		if (!A || !currentCourse?.lessons?.length) return;
		const source = document.getElementById('courseAllAIResultText')?.value || '';
		let parsed;
		try {
			const cleaned = source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
			parsed = JSON.parse(cleaned);
		} catch (_) {
			return toast('The AI result is not valid JSON. Copy the full JSON response and try again.', 'error');
		}
		const entries = Array.isArray(parsed) ? parsed : parsed?.lessons;
		if (!Array.isArray(entries)) return toast('The result must contain a lessons array.', 'error');
		const expected = new Map(currentCourse.lessons.map((lesson) => [String(lesson.id), lesson]));
		const contentById = new Map();
		for (const item of entries) {
			const id = String(item?.lessonId ?? item?.id ?? '');
			if (!expected.has(id)) return toast(`Unexpected lesson ID in AI result: ${id || '(empty)'}. Nothing was saved.`, 'error');
			if (contentById.has(id)) return toast(`Lesson "${expected.get(id).title}" appears more than once. Nothing was saved.`, 'error');
			if (typeof item.content !== 'string' || !item.content.trim()) return toast(`Lesson "${expected.get(id).title}" has no content. Nothing was saved.`, 'error');
			if (item.content.length > 50000) return toast(`Lesson "${expected.get(id).title}" exceeds the 50,000-character limit. Nothing was saved.`, 'error');
			contentById.set(id, item.content);
		}
		const missing = [...expected.keys()].filter((id) => !contentById.has(id));
		if (missing.length) {
			return toast(`Missing ${missing.length} lesson${missing.length === 1 ? '' : 's'}: ${missing.map((id) => expected.get(id).title).join(', ')}. Nothing was saved.`, 'error');
		}
		const courseId = currentCourse.id;
		let saved = 0;
		try {
			for (const [id, lesson] of expected) {
				const updated = await A.raw('PATCH', `/courses/lessons/${encodeURIComponent(id)}`, { content: contentById.get(id) });
				Object.assign(lesson, updated);
				saved += 1;
				const saveButton = document.querySelector('#courseAllAIResultModal .btn-primary');
				if (saveButton) saveButton.textContent = `Saving ${saved}/${expected.size}…`;
			}
			window.closeCourseModal('courseAllAIResultModal');
			renderCourseDetail();
			toast(`Saved AI content for all ${saved} course levels.`);
		} catch (err) {
			if (String(currentCourse?.id) === String(courseId)) renderCourseDetail();
			toast(`Saved ${saved} of ${expected.size} lessons. The remaining lessons were not changed. Error: ${err?.message || 'unknown error'}`, 'error');
		}
	};

	window.generateAllCourseLessons = async function () {
		const A = api();
		if (!A || !currentCourse?.lessons?.length) return;
		if (courseBatchGenerating) return;
		const configId = selectedConfigId(document.getElementById('courseDetailPane'));
		if (!configId) return toast('Pick an AI model first.', 'error');
		window.closeCourseModal('courseGenerateAllModal');

		courseBatchGenerating = true;
		const courseId = currentCourse.id;
		const lessons = [...currentCourse.lessons];
		let completed = 0;
		const button = document.querySelector('[data-generate-all-levels]');
		if (button) {
			button.disabled = true;
			button.textContent = 'Generating levels…';
		}
		try {
			for (const lesson of lessons) {
				const updated = await A.raw(
					'POST',
					`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}/generate-content`,
					{ configId, language: 'French', includeQuestions: true },
				);
				if (updated) Object.assign(lesson, updated);
				completed += 1;
				const status = document.getElementById('courseBatchStatus');
				if (status) status.textContent = `${completed} of ${lessons.length} complete`;
			}
			toast(`Generated AI content for all ${completed} course levels.`);
		} catch (err) {
			toast(`Generated ${completed} of ${lessons.length} levels. Stopped at "${lessons[completed]?.title || 'lesson'}": ${err?.message || 'error'}`, 'error');
		} finally {
			courseBatchGenerating = false;
			if (String(currentCourse?.id) === String(courseId)) renderCourseDetail();
		}
	};

	function lessonCardHtml(lesson, idx) {
		const total = (currentCourse?.lessons || []).length;
		const categories = categoryList();
		const categoryById = new Map(
			categories.map((category) => [String(category.id), category]),
		);
		const getCategoryDepth = (category) => {
			let depth = 0;
			let parentId = category.parent_id;
			const seen = new Set([String(category.id)]);
			while (parentId && !seen.has(String(parentId))) {
				seen.add(String(parentId));
				const parent = categoryById.get(String(parentId));
				if (!parent) break;
				depth += 1;
				parentId = parent.parent_id;
			}
			return depth;
		};
		const orderedCategories = window.CategoryTree?.getOrderedTree?.(categories) ||
			categories.map((category) => ({
				category,
				depth: getCategoryDepth(category),
			}));
		// Practice targets are the outlines of *this* course. Showing every
		// subject category here let a lesson point at another course's branch.
		const courseRootId = String(currentCourse?.category_id || '');
		const courseBranch = courseRootId
			? new Set([
				courseRootId,
				...(window.CategoryTree?.getDescendantIds?.(courseRootId, categories) || []).map(String),
			])
			: null;
		const courseRootDepth = courseRootId
			? (window.CategoryTree?.getDepth?.(courseRootId, categories) || 0)
			: 0;
		const categoryRows = courseBranch
			? orderedCategories.filter(({ category }) => courseBranch.has(String(category.id)))
			: orderedCategories;
		const categoryId = String(lesson.category_id || '');
		const currentCategory = categoryById.get(categoryId);
		const hasValidCategory = Boolean(currentCategory);
		const options = categoryRows
			.map(({ category, depth }) => {
				const path = categoryPath(category.id) || category.name;
				const hasChildren = categories.some((item) => String(item.parent_id) === String(category.id));
				const categoryType = courseLevelLabel(depth - courseRootDepth, !hasChildren);
				return `<option value="${esc(category.id)}" ${categoryId === String(category.id) ? 'selected' : ''}>${categoryType} · ${esc(path)}</option>`;
			})
			.join('');
		const unavailableOption =
			categoryId && !currentCategory
				? `<option value="${esc(categoryId)}" selected>Stored category is unavailable · choose a replacement</option>`
				: '';
		const categoryStatus = hasValidCategory
			? `Practice questions: ${esc(categoryPath(categoryId) || currentCategory.name)}`
			: categoryId
				? 'Stored target is unavailable. Choose a practice target.'
				: 'Optional: link practice questions to a target.';
		const categoryClass =
			categoryId && !hasValidCategory ? ' is-warning' : '';
		return (
			`<article class="lesson-card${categoryClass}" data-lesson-id="${esc(lesson.id)}">` +
			`<div class="lesson-card-header"><span class="lesson-card-number">${idx + 1}</span>` +
			`<input type="text" id="lessonTitle-${esc(lesson.id)}" value="${esc(lesson.title)}" class="lesson-card-title" aria-label="Lesson title" placeholder="Lesson title" />` +
			`<input type="text" id="lessonSummary-${esc(lesson.id)}" value="${esc(lesson.summary || '')}" class="lesson-card-summary" aria-label="Lesson summary" placeholder="One-line summary" />` +
			`</div>` +
			`<label class="lesson-level-field" for="lessonCategory-${esc(lesson.id)}"><span>Practice target</span>` +
			`<select id="lessonCategory-${esc(lesson.id)}" aria-describedby="lessonLevelStatus-${esc(lesson.id)}" onchange="updateLessonLevelSelection('${esc(lesson.id)}')">` +
			`<option value="" ${categoryId ? '' : 'selected'}>No practice target</option>${unavailableOption}${options}</select>` +
			`<small id="lessonLevelStatus-${esc(lesson.id)}" class="lesson-level-status${categoryClass}" aria-live="polite">${categoryStatus}</small></label>` +
			`<textarea id="lessonContent-${esc(lesson.id)}" class="lesson-card-content" rows="8" aria-label="Lesson content" placeholder="Lesson content (markdown). Use the AI button to fill it.">${esc(lesson.content || '')}</textarea>` +
			'<div class="lesson-card-actions">' +
			`<button type="button" class="btn btn-ai-generate btn-sm" onclick="openLessonAIActions('${esc(lesson.id)}')">Generate content via AI</button>` +
			`<button type="button" class="btn btn-sm lesson-action-prep" onclick="openLessonPrepSheet('${esc(lesson.id)}')">Prep Sheet</button>` +
			`<button type="button" class="btn btn-sm lesson-action-questions" onclick="generateQuestionsFromLesson('${esc(lesson.id)}')">Generate questions</button>` +
			`<button type="button" class="btn btn-sm lesson-action-preview" onclick="previewLesson('${esc(lesson.id)}')">Preview</button>` +
			`<button type="button" class="btn btn-primary btn-sm" onclick="saveLesson('${esc(lesson.id)}')">Save</button>` +
			`<span class="lesson-card-action-spacer"></span>` +
			`<div class="lesson-card-reorder" aria-label="Reorder lesson">` +
			`<button type="button" class="btn btn-sm" title="Move up" aria-label="Move lesson up" ${idx === 0 ? 'disabled' : ''} onclick="moveLesson('${esc(lesson.id)}',-1)">&uarr;</button>` +
			`<button type="button" class="btn btn-sm" title="Move down" aria-label="Move lesson down" ${idx >= total - 1 ? 'disabled' : ''} onclick="moveLesson('${esc(lesson.id)}',1)">&darr;</button></div>` +
			`<button type="button" class="btn btn-danger-soft btn-sm" onclick="deleteLessonConfirm('${esc(lesson.id)}')">Delete</button>` +
			`</div>` +
			`<div id="lessonPreview-${esc(lesson.id)}" class="course-md-preview lesson-card-preview" hidden></div>` +
			'</article>'
		);
	}

	window.updateLessonLevelSelection = function (lessonId) {
		const select = document.getElementById(`lessonCategory-${lessonId}`);
		const status = document.getElementById(`lessonLevelStatus-${lessonId}`);
		const card = document.querySelector(
			`.lesson-card[data-lesson-id="${lessonId}"]`,
		);
		if (!select || !status) return;
		if (select.value) {
			const selectedCategory =
				select.options[select.selectedIndex]?.textContent?.trim() || 'Selected target';
			status.textContent = `${selectedCategory}. Save lesson to apply.`;
			status.classList.remove('is-warning');
			card?.classList.remove('is-warning');
		} else {
			status.textContent =
				'No practice target selected. Course content still works; targeted practice will be unavailable.';
			status.classList.remove('is-warning');
			card?.classList.remove('is-warning');
		}
	};

	window.focusLesson = function (lessonId) {
		const card = document.querySelector(`.lesson-card[data-lesson-id="${lessonId}"]`);
		if (card && typeof card.scrollIntoView === 'function') {
			card.scrollIntoView({ behavior: 'smooth', block: 'center' });
			card.style.outline = '2px solid #6366f1';
			setTimeout(() => { card.style.outline = ''; }, 1600);
		}
	};

	window.previewLesson = function (lessonId) {
		const box = document.getElementById(`lessonPreview-${lessonId}`);
		const ta = document.getElementById(`lessonContent-${lessonId}`);
		if (!box || !ta) return;
		if (box.hidden || box.style.display === 'none') {
			box.innerHTML = renderMarkdown(ta.value) || '<em>Nothing to preview yet.</em>';
			box.hidden = false;
			box.style.display = 'block';
		} else {
			box.hidden = true;
			box.style.display = 'none';
		}
	};

	window.openLessonAIActions = function (lessonId) {
		const lesson = currentCourse?.lessons?.find((item) => String(item.id) === String(lessonId));
		if (!lesson) return toast('Lesson not found in this course.', 'error');
		openModal(
			'courseLessonAiActionsModal',
			`AI options · ${lesson.title}`,
			'<p>Choose how you want to use AI for this lesson.</p>',
			`<button type="button" class="btn" onclick="closeCourseModal('courseLessonAiActionsModal')">Cancel</button>` +
				`<button type="button" class="btn btn-primary" onclick="closeCourseModal('courseLessonAiActionsModal');generateLessonContent('${esc(lesson.id)}')">Generate course content</button>` +
					`<button type="button" class="btn course-action-copy" onclick="copyLessonAIPrompt('${esc(lesson.id)}')">Copy prompt</button>` +
					`<button type="button" class="btn course-action-import" onclick="openLessonAIResult('${esc(lesson.id)}')">Load AI result</button>`,
		);
	};

	function openMobileLessonActions(lessonId) {
		const lesson = currentCourse?.lessons?.find((item) => String(item.id) === String(lessonId));
		if (!lesson) return;
		if (!window.MobileActionSheet || typeof window.MobileActionSheet.open !== 'function') {
			window.openLessonAIActions(lessonId);
			return;
		}
		window.MobileActionSheet.open(`Lesson: ${String(lesson.title || '')}`, [
			{
				label: 'Open lesson',
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
				onClick: () => window.focusLesson(lessonId),
			},
			{
				label: 'Generate lesson with AI',
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z"></path><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14z"></path></svg>',
				onClick: () => window.generateLessonContent(lessonId),
				variant: 'primary',
			},
			{
				label: 'Copy AI prompt',
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="13" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>',
				onClick: () => window.copyLessonAIPrompt(lessonId),
			},
			{
				label: 'Load AI result',
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M20 16.5v2A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2"></path></svg>',
				onClick: () => window.openLessonAIResult(lessonId),
			},
		]);
	}

	window.copyLessonAIPrompt = async function (lessonId) {
		const A = api();
		if (!A || !currentCourse) return;
		try {
			const response = await A.raw(
				'POST',
				`/courses/${encodeURIComponent(currentCourse.id)}/lessons/${encodeURIComponent(lessonId)}/generate-content`,
				{ promptOnly: true, language: 'French', includeQuestions: true },
			);
			const prompt = String(response?.prompt || '');
			if (!prompt) throw new Error('The server returned an empty prompt.');
			let copied = false;
			try {
				if (navigator.clipboard?.writeText) {
					await navigator.clipboard.writeText(prompt);
					copied = true;
				}
			} catch (_) {
				// Clipboard API may be unavailable in non-secure or embedded contexts.
			}
			if (!copied) {
				const helper = document.createElement('textarea');
				helper.value = prompt;
				helper.setAttribute('readonly', '');
				helper.style.cssText = 'position:fixed;top:-9999px;opacity:0';
				document.body.appendChild(helper);
				helper.select();
				try {
					copied = document.execCommand('copy');
				} finally {
					helper.remove();
				}
			}
			if (copied) {
				toast('Lesson prompt copied. Paste it into ChatGPT, Claude, or another AI.', 'success');
				return;
			}
			openModal(
				'coursePromptModal',
				'Copy lesson prompt',
				`<textarea id="coursePromptText" rows="14" readonly style="width:100%;">${esc(prompt)}</textarea>`,
				`<button type="button" class="btn" onclick="closeCourseModal('coursePromptModal')">Close</button>` +
					`<button type="button" class="btn btn-primary" onclick="document.getElementById('coursePromptText').select()">Select prompt</button>`,
			);
			toast('Automatic copy was unavailable. Select and copy the prompt manually.', 'warning');
		} catch (err) {
			toast('Could not prepare the lesson prompt: ' + (err?.message || 'error'), 'error');
		}
	};

	window.openLessonAIResult = function (lessonId) {
		const lesson = currentCourse?.lessons?.find((item) => String(item.id) === String(lessonId));
		if (!lesson) return toast('Lesson not found in this course.', 'error');
		openModal(
			'courseAIResultModal',
			`Load AI result · ${lesson.title}`,
			'<p>Paste the Markdown lesson content returned by ChatGPT, Claude, or another AI. It will be saved to this lesson and displayed using the course reader format.</p>' +
				`<div class="form-group"><label for="courseAIResultText">AI-generated lesson content</label><textarea id="courseAIResultText" rows="16" maxlength="50000" placeholder="## Objectives&#10;&#10;..."></textarea><div class="course-generator-hint">Markdown only · up to 50,000 characters · no HTML or answer keys</div></div>`,
			`<button type="button" class="btn" onclick="closeCourseModal('courseAIResultModal')">Cancel</button>` +
				`<button type="button" class="btn btn-primary" onclick="saveLessonAIResult('${esc(lesson.id)}')">Save lesson content</button>`,
		);
	};

	window.saveLessonAIResult = async function (lessonId) {
		const A = api();
		if (!A || !currentCourse) return;
		const content = document.getElementById('courseAIResultText')?.value || '';
		if (!content.trim()) return toast('Paste the AI-generated lesson content first.', 'error');
		if (content.length > 50000) return toast('Lesson content must be 50,000 characters or fewer.', 'error');
		try {
			const updated = await A.raw('PATCH', `/courses/lessons/${encodeURIComponent(lessonId)}`, { content });
			const lesson = currentCourse.lessons.find((item) => String(item.id) === String(lessonId));
			if (lesson) Object.assign(lesson, updated);
			window.closeCourseModal('courseAIResultModal');
			renderCourseDetail();
			toast('AI result saved to the lesson.');
		} catch (err) {
			toast('Could not save AI result: ' + (err?.message || 'error'), 'error');
		}
	};

	window.createCourseDocument = async function (courseId) {
		const A = api();
		if (!A) return;
		let course = currentCourse && (!courseId || String(currentCourse.id) === String(courseId))
			? currentCourse
			: null;
		try {
			if (!course) course = await A.raw('GET', `/courses/${encodeURIComponent(courseId)}`);
			const savedHeader = course.document_header || {};
			const header = {
				teacherName: window.currentUser?.name || '',
				subject: course.name || '',
				...savedHeader,
			};
			const identitySaved = Boolean(savedHeader && Object.keys(savedHeader).some((k) => String(savedHeader[k] || '').trim()));
			const templates = [
				['classique', 'Classique', 'Balanced · serif'],
				['moderne', 'Moderne', 'Contemporary · teal'],
				['compact', 'Compact', 'Space-saving · amber'],
				['ultra', 'Ultra', 'Dense · rose'],
				['officiel', 'Officiel', 'Formal · framed'],
				['college', 'Collège', 'Friendly · green'],
			];
			const templateCards = templates.map(([id, name, hint]) =>
				`<button type="button" class="course-doc-template${id === 'classique' ? ' is-selected' : ''}" data-course-doc-template="${id}" aria-pressed="${id === 'classique'}">` +
					`<span class="course-doc-template-swatch template-${id}"></span><strong>${name}</strong><small>${hint}</small></button>`,
			).join('');
			const headerLayouts = [
				['bandeau', 'Institutional band', 'School details above the title'],
				['classique', 'Classic', 'Editorial left-aligned header'],
				['centre', 'Centered', 'Balanced, centred composition'],
				['split', 'Split', 'Institution and metadata in two columns'],
				['boxed', 'Framed', 'Formal outlined header'],
				['banner', 'Title banner', 'Strong colour band'],
				['minimal', 'Minimal', 'Small, discreet running header'],
			];
			const headerLayoutCards = headerLayouts.map(([id, name, hint]) =>
				`<button type="button" class="course-doc-layout${id === 'bandeau' ? ' is-selected' : ''}" data-course-doc-layout="${id}" aria-pressed="${id === 'bandeau'}">` +
					`<span class="course-doc-layout-icon layout-${id}" aria-hidden="true"><i></i><b></b><em></em></span><strong>${name}</strong><small>${hint}</small></button>`,
			).join('');
			const NUMERATION_TEMPLATES = [
				['default', 'Classic', 'I · II · III'],
				['decimal', 'Decimal', '1 · 2 · 3'],
				['roman', 'Roman', 'I · II · III'],
				['alpha', 'Alpha', 'A · B · C'],
				['book', 'Book', 'I · 1 · a · i'],
				['module', 'Module', 'I · 1 · a · i'],
				['progressif', 'Progressif', '1 · 1.1 · 1.1.1 (no letters)'],
				['academique', 'Académique', 'I · 1 · 1.1'],
			];
			const COVER_TEMPLATES = [
				['academic', 'Academic', 'Centered title, clean institution header'],
				['modern', 'Modern', 'Bold colour band, contemporary look'],
				['book', 'Book', 'Left accent bar, publication style'],
				['university', 'University', 'Framed, formal institutional layout'],
				['elegant', 'Elegant', 'Big centered title between fine rules'],
				['minimal', 'Minimal', 'Generous whitespace, understated grid'],
			];
			const coverCards = COVER_TEMPLATES.map(([id, name, hint]) =>
				`<button type="button" class="course-doc-cover${id === 'academic' ? ' is-selected' : ''}" data-course-doc-cover="${id}" aria-pressed="${id === 'academic'}">` +
					`<strong>${name}</strong><small>${hint}</small></button>`,
			).join('');
			const numerationCards = NUMERATION_TEMPLATES.map(([id, name, hint]) =>
				`<button type="button" class="course-doc-numeration${id === 'default' ? ' is-selected' : ''}" data-course-doc-numeration="${id}" aria-pressed="${id === 'default'}">` +
					`<strong>${name}</strong><small>${hint}</small></button>`,
			).join('');
			const formField = (id, label, value, placeholder = '') =>
				`<label class="course-doc-field"><span>${label}</span><input id="courseDoc${id}" maxlength="200" value="${esc(value || '')}" placeholder="${esc(placeholder)}"></label>`;

			const DOC_STEPS = [
				{ label: 'Document identity', hint: 'School, teacher and course details' },
				{ label: 'Visual style', hint: 'Pick a document theme and header arrangement' },
				{ label: 'Organize the course', hint: 'Choose the opening pages and lesson pagination' },
				{ label: 'Preview & export', hint: 'Recap your choices and generate the document' },
			];

			const state = {
				step: 0,
				templateId: 'classique',
				numerationTemplate: 'default',
				coverTemplate: 'academic',
				headerLayout: 'bandeau',
				includeCover: true,
				includeTableOfContents: true,
				includeLessonPath: false,
				startEachLessonOnNewPage: true,
				identitySaved,
			};

			// One-click document presets: each bundles a theme + cover + header +
			// numeration + pagination into a named look so a teacher can start from
			// a finished style instead of assembling it field by field.
			const STYLE_PRESETS = [
				['academique', 'Academic course', 'Numbered lesson sections, university cover, page per lesson', {
					templateId: 'officiel', coverTemplate: 'university', headerLayout: 'bandeau',
					numerationTemplate: 'academique', includeCover: true, includeTableOfContents: true,
					includeLessonPath: false, startEachLessonOnNewPage: true,
				}],
				['fiche', 'Modern sheet', 'Decimal numbering, colour-band cover, flowing pages', {
					templateId: 'moderne', coverTemplate: 'modern', headerLayout: 'centre',
					numerationTemplate: 'progressif', includeCover: true, includeTableOfContents: true,
					includeLessonPath: false, startEachLessonOnNewPage: false,
				}],
				['livre', 'Book', 'Classic numbering, publication cover, lesson per page', {
					templateId: 'classique', coverTemplate: 'book', headerLayout: 'classique',
					numerationTemplate: 'book', includeCover: true, includeTableOfContents: true,
					includeLessonPath: false, startEachLessonOnNewPage: true,
				}],
				['minimal', 'No cover', 'No cover, compact decimal, quick handout', {
					templateId: 'compact', coverTemplate: 'minimal', headerLayout: 'minimal',
					numerationTemplate: 'decimal', includeCover: false, includeTableOfContents: true,
					includeLessonPath: false, startEachLessonOnNewPage: false,
				}],
			];
			const presetCards = STYLE_PRESETS.map(([id, name, hint]) =>
				`<button type="button" class="course-doc-preset" data-course-doc-preset="${id}">` +
					`<strong>${esc(name)}</strong><small>${esc(hint)}</small></button>`,
			).join('');

			const buildIdentityPanel = () =>
				`<div class="course-doc-fields">
					${formField('School', 'School / institution', header.schoolName, 'School name')}
					${formField('Ministry', 'Ministry', header.ministry)}
					${formField('Academy', 'Academy / region', header.academy)}
					${formField('Year', 'Academic year', header.academicYear, '2025–2026')}
					${formField('Teacher', 'Teacher', header.teacherName)}
					${formField('Subject', 'Subject', header.subject)}
					${formField('Level', 'Level', header.level)}
					${formField('Group', 'Class / group', header.group)}
					${formField('Date', 'Date', header.date || new Date().toISOString().slice(0, 10))}
				</div>
				<div class="course-doc-identity-actions">
					<button type="button" class="btn btn-outline course-doc-save-identity" id="courseDocSaveIdentity">
						${state.identitySaved ? 'Identity saved' : 'Save as default identity'}
					</button>
					${state.identitySaved ? '<button type="button" class="btn btn-secondary btn-sm" id="courseDocEditIdentity">Edit saved identity</button>' : ''}
					<span class="course-doc-identity-hint">Saved on this course and reused each time you create a document.</span>
				</div>`;

			const buildStylePanel = () =>
				`<section class="course-doc-section"><h4>Quick presets</h4>
					<div class="course-doc-presets">${presetCards}</div>
					<p class="course-doc-help">Start from a finished look, then fine-tune below.</p>
				</section>
				<section class="course-doc-section"><h4>Document template</h4>
					<div class="course-doc-templates">${templateCards}</div>
				</section>
<section class="course-doc-section"><h4>Heading numeration</h4>
					<div class="course-doc-numerations">${numerationCards}</div>
					<p class="course-doc-help">Numbers the headings inside each lesson (Introduction, Definition, Examples...). Modules, chapters and axes stay unnumbered titles.</p>
				</section>
				<section class="course-doc-section"><h4>Header arrangement</h4>
					<div class="course-doc-layouts">${headerLayoutCards}</div>
				</section>
				<section class="course-doc-section"><h4>Cover page template</h4>
					<div class="course-doc-covers">${coverCards}</div>
					<p class="course-doc-help">Choose the look of the first (cover) page.</p>
				</section>`;

			const buildOrganizePanel = () =>
				`<div class="course-doc-options">
					<label><input id="courseDocIncludeCover" type="checkbox"${state.includeCover ? ' checked' : ''}><span><strong>Cover page</strong><small>Course title, branch, school and course overview</small></span></label>
					<label><input id="courseDocIncludeContents" type="checkbox"${state.includeTableOfContents ? ' checked' : ''}><span><strong>Table of contents</strong><small>Lesson list with its module/chapter path</small></span></label>
					<label><input id="courseDocLessonPath" type="checkbox"${state.includeLessonPath ? ' checked' : ''}><span><strong>Show the lesson path under each title</strong><small>The small breadcrumb line (hidden by default)</small></span></label>
					<label><input id="courseDocLessonPages" type="checkbox"${state.startEachLessonOnNewPage ? ' checked' : ''}><span><strong>Start every lesson on a new page</strong><small>Recommended — each lesson opens on a fresh page</small></span></label>
				</div>
				<p class="course-doc-status" id="courseDocStatus">${course.lessons?.length ? `${course.lessons.length} lessons will be included.` : 'No lessons yet; the document will contain the course header.'}</p>`;

			const buildPreviewPanel = () => {
				const tplName = templates.find(([id]) => id === state.templateId)[1];
				const numerationName = NUMERATION_TEMPLATES.find(([id]) => id === state.numerationTemplate)[1];
				const coverName = COVER_TEMPLATES.find(([id]) => id === state.coverTemplate)[1];
				const layoutName = headerLayouts.find(([id]) => id === state.headerLayout)[1];
				const fields = [
					['School', header.schoolName],
					['Ministry', header.ministry],
					['Academy', header.academy],
					['Year', header.academicYear],
					['Teacher', header.teacherName],
					['Subject', header.subject],
					['Level', header.level],
					['Group', header.group],
					['Date', header.date],
				].filter(([, value]) => String(value || '').trim());
				const identityHtml = fields.length
					? fields.map(([label, value]) => `<div class="course-doc-recap-row"><span class="course-doc-recap-label">${esc(label)}</span><span class="course-doc-recap-value">${esc(value)}</span></div>`).join('')
					: `<div class="course-doc-recap-empty">No identity details filled in.</div>`;
				return `
					<div class="course-doc-recap">
						<h4>Summary of your choices</h4>
						<div class="course-doc-recap-grid">
							<div class="course-doc-recap-card">
								<span class="course-doc-recap-card-title">Document identity</span>
								${identityHtml}
							</div>
							<div class="course-doc-recap-card">
								<span class="course-doc-recap-card-title">Visual style</span>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Template</span><span class="course-doc-recap-value">${esc(tplName)}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Heading numeration</span><span class="course-doc-recap-value">${esc(numerationName)}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Cover template</span><span class="course-doc-recap-value">${esc(coverName)}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Header arrangement</span><span class="course-doc-recap-value">${esc(layoutName)}</span></div>
							</div>
							<div class="course-doc-recap-card">
								<span class="course-doc-recap-card-title">Course organization</span>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Cover page</span><span class="course-doc-recap-value">${state.includeCover ? 'Yes' : 'No'}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Table of contents</span><span class="course-doc-recap-value">${state.includeTableOfContents ? 'Yes' : 'No'}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Lesson path</span><span class="course-doc-recap-value">${state.includeLessonPath ? 'Shown' : 'Hidden'}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Lesson pagination</span><span class="course-doc-recap-value">${state.startEachLessonOnNewPage ? 'New page per lesson' : 'Flowing'}</span></div>
								<div class="course-doc-recap-row"><span class="course-doc-recap-label">Lessons</span><span class="course-doc-recap-value">${course.lessons?.length || 0}</span></div>
							</div>
						</div>
						<p class="course-doc-recap-note">Review the choices above, then export the document as PDF or Word. The rendering uses the nested course structure (module → chapter → lesson).</p>
					</div>`;
			};

			const buildPanels = () =>
				`<section class="course-doc-panel active" data-course-doc-panel="identity">
					<h4 class="course-doc-panel-title">Document identity</h4>
					${buildIdentityPanel()}
				</section>
				<section class="course-doc-panel" data-course-doc-panel="style">
					<h4 class="course-doc-panel-title">Visual style</h4>
					${buildStylePanel()}
				</section>
				<section class="course-doc-panel" data-course-doc-panel="organize">
					<h4 class="course-doc-panel-title">Organize the course</h4>
					${buildOrganizePanel()}
				</section>
				<section class="course-doc-panel" data-course-doc-panel="preview">
					${buildPreviewPanel()}
				</section>`;

			const buildStepper = () =>
				`<div class="course-doc-stepper" role="tablist" aria-label="Document creation steps">
					${DOC_STEPS.map((s, i) =>
						`<button type="button" class="course-doc-step${i === 0 ? ' active' : ''}" data-course-doc-step="${i}" aria-selected="${i === 0}">
							<span class="course-doc-step-num">${i + 1}</span>
							<span class="course-doc-step-text"><strong>${esc(s.label)}</strong><br><small>${esc(s.hint)}</small></span>
						</button>`).join('')}
				</div>`;

			const buildFooter = () => {
				const last = state.step === DOC_STEPS.length - 1;
				const prev = state.step === 0 ? '<button type="button" class="btn btn-secondary btn-sm" data-course-doc-nav="prev" disabled>← Previous</button>' :
					'<button type="button" class="btn btn-secondary btn-sm" data-course-doc-nav="prev">← Previous</button>';
				const next = last ? '' : '<button type="button" class="btn btn-primary btn-sm" data-course-doc-nav="next">Next →</button>';
				const exportButtons = last ?
					`<button type="button" class="btn course-doc-export course-doc-export-pdf" onclick="exportCourseDocument('pdf')">Export PDF</button>
					<button type="button" class="btn course-doc-export course-doc-export-docx" onclick="exportCourseDocument('docx')">Export Word</button>` : '';
				return `${prev}<span class="course-doc-step-indicator">Step ${state.step + 1} of ${DOC_STEPS.length}</span>${next}${exportButtons}
					<button type="button" class="btn btn-secondary" data-course-doc-nav="close">Close</button>`;
			};

			const modal = openModal(
				'courseDocumentModal',
				`Create document · ${esc(course.name)}`,
				`<div class="course-doc-form" data-course-id="${esc(course.id)}">
					${buildStepper()}
					${buildPanels()}
				</div>`,
				buildFooter(),
				'course-document-modal',
			);

			const showStep = (index) => {
				state.step = Math.max(0, Math.min(DOC_STEPS.length - 1, index));
				const root = modal.querySelector('.course-doc-form');
				root.querySelectorAll('.course-doc-panel').forEach((panel, i) => {
					panel.classList.toggle('active', i === state.step);
				});
				root.querySelectorAll('[data-course-doc-step]').forEach((btn, i) => {
					btn.classList.toggle('active', i === state.step);
					btn.setAttribute('aria-selected', String(i === state.step));
				});
				modal.querySelector('.modal-footer').innerHTML = buildFooter();
				bindFooter(modal);
				if (state.step === DOC_STEPS.length - 1) {
					modal.querySelector('.course-doc-panel[data-course-doc-panel="preview"]').innerHTML = buildPreviewPanel();
				}
			};

			const bindStepper = () => {
				modal.querySelectorAll('[data-course-doc-step]').forEach((button) => {
					button.addEventListener('click', () => {
						showStep(Number(button.getAttribute('data-course-doc-step')));
					});
				});
			};

			const bindFooter = (root) => {
				root.querySelectorAll('[data-course-doc-nav]').forEach((button) => {
					const nav = button.getAttribute('data-course-doc-nav');
					button.addEventListener('click', () => {
						if (nav === 'prev') showStep(state.step - 1);
						else if (nav === 'next') showStep(state.step + 1);
						else if (nav === 'close') closeCourseModal('courseDocumentModal');
					});
				});
			};

			const bindSelections = () => {
				modal.querySelectorAll('[data-course-doc-template]').forEach((button) => {
					button.addEventListener('click', () => {
						state.templateId = button.dataset.courseDocTemplate || 'classique';
						modal.querySelectorAll('[data-course-doc-template]').forEach((item) => {
							const selected = item === button;
							item.classList.toggle('is-selected', selected);
							item.setAttribute('aria-pressed', String(selected));
						});
					});
				});
				modal.querySelectorAll('[data-course-doc-layout]').forEach((button) => {
					button.addEventListener('click', () => {
						state.headerLayout = button.dataset.courseDocLayout || 'bandeau';
						modal.querySelectorAll('[data-course-doc-layout]').forEach((item) => {
							const selected = item === button;
							item.classList.toggle('is-selected', selected);
							item.setAttribute('aria-pressed', String(selected));
						});
					});
				});
				modal.querySelectorAll('[data-course-doc-numeration]').forEach((button) => {
					button.addEventListener('click', () => {
						state.numerationTemplate = button.dataset.courseDocNumeration || 'default';
						modal.querySelectorAll('[data-course-doc-numeration]').forEach((item) => {
							const selected = item === button;
							item.classList.toggle('is-selected', selected);
							item.setAttribute('aria-pressed', String(selected));
						});
					});
				});
				modal.querySelectorAll('[data-course-doc-cover]').forEach((button) => {
					button.addEventListener('click', () => {
						state.coverTemplate = button.dataset.courseDocCover || 'academic';
						modal.querySelectorAll('[data-course-doc-cover]').forEach((item) => {
							const selected = item === button;
							item.classList.toggle('is-selected', selected);
							item.setAttribute('aria-pressed', String(selected));
						});
					});
				});
				// Quick presets apply a whole bundle, then refresh the individual
				// controls so the manual pickers stay in sync with the preset.
				const selectGroup = (attr, value) => {
					modal.querySelectorAll(`[data-course-doc-${attr}]`).forEach((item) => {
						const selected = item.getAttribute(`data-course-doc-${attr}`) === value;
						item.classList.toggle('is-selected', selected);
						item.setAttribute('aria-pressed', String(selected));
					});
				};
				modal.querySelectorAll('[data-course-doc-preset]').forEach((button) => {
					button.addEventListener('click', () => {
						const preset = STYLE_PRESETS.find(([id]) => id === button.dataset.courseDocPreset);
						if (!preset) return;
						Object.assign(state, preset[3]);
						selectGroup('template', state.templateId);
						selectGroup('layout', state.headerLayout);
						selectGroup('numeration', state.numerationTemplate);
						selectGroup('cover', state.coverTemplate);
						const coverChk = document.getElementById('courseDocIncludeCover');
						const tocChk = document.getElementById('courseDocIncludeContents');
						const pathChk = document.getElementById('courseDocLessonPath');
						const pageChk = document.getElementById('courseDocLessonPages');
						if (coverChk) coverChk.checked = state.includeCover;
						if (tocChk) tocChk.checked = state.includeTableOfContents;
						if (pathChk) pathChk.checked = state.includeLessonPath;
						if (pageChk) pageChk.checked = state.startEachLessonOnNewPage;
						modal.querySelectorAll('[data-course-doc-preset]').forEach((item) => item.classList.toggle('is-selected', item === button));
						if (state.step === DOC_STEPS.length - 1) {
							modal.querySelector('.course-doc-panel[data-course-doc-panel="preview"]').innerHTML = buildPreviewPanel();
						}
						toast(`Preset “${preset[1]}” applied.`);
					});
				});
				['IncludeCover', 'IncludeTableOfContents', 'LessonPath', 'LessonPages'].forEach((id) => {
					const el = document.getElementById(`courseDoc${id}`);
					if (!el) return;
					el.addEventListener('change', () => {
						if (id === 'IncludeCover') state.includeCover = el.checked;
						else if (id === 'IncludeTableOfContents') state.includeTableOfContents = el.checked;
						else if (id === 'LessonPath') state.includeLessonPath = el.checked;
						else if (id === 'LessonPages') state.startEachLessonOnNewPage = el.checked;
					});
				});
			};

			const saveCourseIdentity = async () => {
				const A = api();
				if (!A) return;
				const courseId = modal.querySelector('.course-doc-form').dataset.courseId;
				const value = (id) => document.getElementById(`courseDoc${id}`)?.value?.trim() || '';
				const payload = {
					schoolName: value('School'),
					ministry: value('Ministry'),
					academy: value('Academy'),
					academicYear: value('Year'),
					teacherName: value('Teacher'),
					subject: value('Subject'),
					level: value('Level'),
					group: value('Group'),
					date: value('Date'),
				};
				const btn = document.getElementById('courseDocSaveIdentity');
				const prev = btn?.textContent;
				if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
				try {
					await A.raw('PATCH', `/courses/${encodeURIComponent(courseId)}`, { document_header: payload });
					state.identitySaved = true;
					const root = modal.querySelector('.course-doc-form');
					root.querySelector('.course-doc-panel[data-course-doc-panel="identity"]').innerHTML = buildIdentityPanel();
					bindSaveIdentity();
					toast('Document identity saved on this course.');
				} catch (err) {
					if (btn) { btn.disabled = false; btn.textContent = prev; }
					toast('Could not save identity: ' + (err?.message || 'error'), 'error');
				}
			};

			const bindSaveIdentity = () => {
				const btn = document.getElementById('courseDocSaveIdentity');
				if (btn) btn.addEventListener('click', saveCourseIdentity);
				const editBtn = document.getElementById('courseDocEditIdentity');
				if (editBtn) editBtn.addEventListener('click', () => {
					// Fields are already editable; just focus the first one.
					document.getElementById('courseDocSchool')?.focus();
				});
			};

			bindStepper();
			bindFooter(modal);
			bindSelections();
			bindSaveIdentity();
		} catch (err) {
			toast('Could not prepare course document: ' + (err?.message || 'error'), 'error');
		}
	};

	window.exportCourseDocument = async function (format) {
		const A = api();
		const modal = document.getElementById('courseDocumentModal');
		const form = modal?.querySelector('.course-doc-form');
		if (!A || !form) return;
		const courseId = form.dataset.courseId;
		const templateId = form.querySelector('[data-course-doc-template].is-selected')?.dataset.courseDocTemplate || 'classique';
		const headerLayout = form.querySelector('[data-course-doc-layout].is-selected')?.dataset.courseDocLayout || 'bandeau';
		const numerationTemplate = form.querySelector('[data-course-doc-numeration].is-selected')?.dataset.courseDocNumeration || 'default';
		const categories = categoryList();
		const categoryOrder = (window.CategoryTree?.getOrderedTree?.(categories) || categories.map((category) => ({ category })))
			.map(({ category }) => String(category.id));
		const value = (id) => document.getElementById(`courseDoc${id}`)?.value?.trim() || '';
		const body = {
			format,
			templateId,
			numerationTemplate,
			coverTemplate: form.querySelector('[data-course-doc-cover].is-selected')?.dataset.courseDocCover || 'academic',
			headerLayout,
			includeCover: Boolean(document.getElementById('courseDocIncludeCover')?.checked),
			includeTableOfContents: Boolean(document.getElementById('courseDocIncludeContents')?.checked),
			includeLessonPath: Boolean(document.getElementById('courseDocLessonPath')?.checked),
			startEachLessonOnNewPage: Boolean(document.getElementById('courseDocLessonPages')?.checked),
			categoryOrder,
			header: {
				schoolName: value('School'),
				ministry: value('Ministry'),
				academy: value('Academy'),
				academicYear: value('Year'),
				teacherName: value('Teacher'),
				subject: value('Subject'),
				level: value('Level'),
				group: value('Group'),
				date: value('Date'),
			},
		};
		const buttons = modal.querySelectorAll('.course-doc-export');
		buttons.forEach((button) => { button.disabled = true; });
		const status = document.getElementById('courseDocStatus');
		if (status) status.textContent = `Preparing ${format.toUpperCase()}…`;
		try {
			const result = await A.blob('POST', `/courses/${encodeURIComponent(courseId)}/documents/export`, body);
			const url = URL.createObjectURL(result.blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = result.filename || `course.${format}`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			if (status) status.textContent = `${format.toUpperCase()} document downloaded.`;
			toast(`${format.toUpperCase()} course document downloaded.`);
		} catch (err) {
			if (status) status.textContent = `Could not export ${format.toUpperCase()}: ${err?.message || 'error'}`;
			toast(`Could not export course document: ${err?.message || 'error'}`, 'error');
		} finally {
			buttons.forEach((button) => { button.disabled = false; });
		}
	};

	// Per-lesson content generation from the branch tree / lesson card.
	window.generateLessonContent = async function (lessonId, btn) {
		const A = api();
		if (!A || !currentCourse) return;
		const configId = selectedConfigId(document.getElementById('courseDetailPane'));
		if (!configId) return toast('Pick an AI model first.', 'error');
		const label = btn ? btn.textContent : '';
		if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
		try {
			const updated = await A.raw(
				'POST',
				`/courses/${encodeURIComponent(currentCourse.id)}/lessons/${encodeURIComponent(lessonId)}/generate-content`,
				{ configId, language: 'French', includeQuestions: true },
			);
			const lesson = (currentCourse.lessons || []).find((l) => String(l.id) === String(lessonId));
			if (lesson && updated) Object.assign(lesson, updated);
			renderCourseDetail();
			toast('Lesson content generated.');
		} catch (err) {
			toast('Generation failed: ' + (err?.message || 'error'), 'error');
			if (btn) { btn.disabled = false; btn.textContent = label || 'Generate course content via AI'; }
		}
	};

	// ── Lesson preparation sheets ──────────────────────────────────────────────
	// The AI sheet (session planning + one sheet per session) is stored on the
	// lesson (lesson.prep_sheet, hydrated server-side). Preview tables mirror
	// the Word/PDF export: distribution grid + per-session cards; the compact
	// 3-column plan stays in the modal because the full 7-column grid only
	// fits landscape paper.
	const PREP_DURATION_CHOICES = [30, 45, 55, 60, 90];

	function prepMinutes(value) {
		const s = String(value || '').trim();
		if (!s) return NaN;
		const h = s.match(/(\d+)\s*h\s*(\d+)?/i);
		if (h) return Number(h[1]) * 60 + Number(h[2] || 0);
		const min = s.match(/(\d+(?:[.,]\d+)?)\s*(?:min|m\b|$)/i);
		return min ? Math.round(Number(min[1].replace(',', '.'))) : NaN;
	}

	function prepFmtMinutes(n) {
		return Number.isFinite(n) && n > 0 ? (n >= 60 && n % 60 === 0 ? `${n / 60} h` : `${n} min`) : '';
	}

	function prepSessionRows(sheet) {
		const sessions = Array.isArray(sheet?.sessions) ? sheet.sessions : [];
		return sessions.map((s, i) => {
			const planSum = (s.planRows || []).map((r) => prepMinutes(r.duration)).reduce((a, n) => (Number.isFinite(n) ? a + n : a), 0);
			const objectives = [s.generalObjective, ...(s.specificObjectives || [])].filter(Boolean);
			return {
				...s,
				index: s.index || i + 1,
				estimatedMinutes: planSum > 0 ? planSum : s.estimatedMinutes,
				objectivesText: objectives.slice(0, 4).join(' • '),
			};
		});
	}

	function prepMultiLine(text) {
		return String(text || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => `${esc(l)}<br>`).join('');
	}

	function prepBullets(items) {
		const list = (items || []).map((t) => String(t || '').trim()).filter(Boolean);
		return list.length
			? `<ul class="prep-sheet-list">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
			: '<div class="prep-sheet-empty">À compléter</div>';
	}

	function prepSheetPreviewHtml(sheet, lesson) {
		const rows = prepSessionRows(sheet);
		const grand = rows.reduce((a, r) => a + (Number.isFinite(r.estimatedMinutes) ? r.estimatedMinutes : 0), 0);
		const dist = `<table class="prep-sheet-table"><thead><tr><th>Séance</th><th>Titre</th><th>Contenu à couvrir</th><th>Objectifs d'apprentissage</th><th>Durée estimée</th></tr></thead><tbody>`
			+ rows.map((r, i) => `<tr><td>${r.index || i + 1}</td><td>${esc(r.title || '')}</td><td>${esc(r.contentSummary || '')}</td><td>${esc(r.objectivesText || '')}</td><td>${esc(prepFmtMinutes(r.estimatedMinutes))}</td></tr>`).join('')
			+ `<tr class="prep-sheet-total"><td></td><td><strong>Total</strong></td><td></td><td></td><td><strong>${esc(prepFmtMinutes(grand))}</strong></td></tr>`
			+ '</tbody></table>';
		const cards = rows.map((r, i) => {
			const plan = (r.planRows || []).length
				? `<table class="prep-sheet-table"><thead><tr><th>Étape</th><th>Durée</th><th>Contenu / Activités</th></tr></thead><tbody>`
					+ r.planRows.map((p) => `<tr><td>${esc(p.stage || '')}</td><td>${esc(p.duration || '')}</td><td>${prepMultiLine(p.activities)}</td></tr>`).join('')
					+ '</tbody></table><div class="prep-sheet-note">Le document exporté contient le déroulé détaillé complet (7 colonnes : enseignant, élèves, supports, résultats attendus) sur pages paysage.</div>'
				: '<div class="prep-sheet-empty">À compléter</div>';
			const assessment = (r.assessment || []).length
				? `<table class="prep-sheet-table"><thead><tr><th>Activité d'évaluation</th><th>Critères</th><th>Réponse attendue</th></tr></thead><tbody>`
					+ r.assessment.map((a) => `<tr><td>${esc(a.task || '')}</td><td>${esc(a.criteria || '')}</td><td>${prepMultiLine(a.expectedAnswer)}</td></tr>`).join('')
					+ '</tbody></table>'
				: '<div class="prep-sheet-empty">À compléter</div>';
			const concepts = (r.keyConcepts || []).filter((c) => String(c.heading || '').trim() || String(c.body || '').trim())
				.map((c) => `<h5>${esc(c.heading || 'À compléter')}</h5>${prepMultiLine(c.body) || '<div class="prep-sheet-empty">À compléter</div>'}`).join('')
				|| '<div class="prep-sheet-empty">À compléter</div>';
			return `<section class="prep-sheet-card">`
				+ `<h4>Fiche de préparation ${i + 1} — ${esc(r.title || '')}</h4>`
				+ `<div class="prep-sheet-meta"><span><strong>Contenu :</strong> ${esc(r.contentSummary || 'À compléter')}</span><span><strong>Durée :</strong> ${esc(prepFmtMinutes(r.estimatedMinutes) || 'À compléter')}</span></div>`
				+ `<h5>Objectifs</h5><p><strong>Général :</strong> ${esc(r.generalObjective || 'À compléter')}</p>${prepBullets(r.specificObjectives)}`
				+ `<h5>Prérequis</h5>${prepBullets(r.prerequisites)}`
				+ `<h5>Contenu de la leçon</h5>${concepts}`
				+ `<h5>Déroulement détaillé</h5>${plan}`
				+ `<h5>Méthodes pédagogiques</h5>${prepBullets(r.methods)}`
				+ `<h5>Matériel didactique</h5>${prepBullets(r.materials)}`
				+ `<h5>Évaluation</h5>${assessment}`
				+ `<h5>À retenir</h5>${prepBullets(r.keyPoints)}`
				+ `<h5>Devoirs</h5>${prepBullets(r.homework)}`
				+ '</section>';
		});
		return `<div class="prep-sheet-preview">`
			+ `<div class="prep-sheet-head"><h4>${esc(sheet.lessonTitle || lesson?.title || '')}</h4>`
			+ `<span class="prep-sheet-sub">Fiche de préparation · ${rows.length} séance${rows.length === 1 ? '' : 's'} · ${esc(String(sheet.language || 'French'))} · générée le ${esc(String(sheet.generatedAt || '').slice(0, 10) || '—')}</span></div>`
			+ `<h5 class="prep-sheet-section">Planification des séances</h5>${dist}`
			+ cards.join('')
			+ '<div class="course-generator-hint">Générée par l\'assistant pédagogique — vérifier et compléter avant usage en classe.</div>'
			+ '</div>';
	}

	function prepSheetControlsHtml(lesson, sheet) {
		const minutes = Number(sheet?.sessionMinutes) || 55;
		const durationOptions = PREP_DURATION_CHOICES
			.map((m) => `<option value="${m}" ${m === minutes ? 'selected' : ''}>${m} min</option>`)
			.join('');
		return `<div class="prep-sheet-controls">`
			+ (sheet ? '' : `<p>Laissez l'AI analyser le contenu de cette leçon : elle propose d'abord le nombre de séances nécessaire, puis une fiche de préparation détaillée pour chaque séance (avec tableaux), exportable en Word et PDF.</p>`)
			+ `<div class="prep-sheet-fields">`
			+ `<div class="form-group"><label for="prepSheetLanguage">Langue du document</label><select id="prepSheetLanguage"><option value="French" ${(sheet?.language || 'French') === 'French' ? 'selected' : ''}>Français</option><option value="English" ${String(sheet?.language || '').toLowerCase() === 'english' ? 'selected' : ''}>Anglais</option></select></div>`
			+ `<div class="form-group"><label for="prepSheetMinutes">Durée d'une séance</label><select id="prepSheetMinutes">${durationOptions}</select></div>`
			+ '</div>'
			+ (lesson && !String(lesson.content || '').trim() ? '<div class="course-generator-hint">Cette leçon n\'a pas encore de contenu — la fiche sera basée uniquement sur le titre et le résumé.</div>' : '')
			+ '</div>';
	}

	function prepSheetFooterHtml(lessonId, hasSheet) {
		const close = '<button type="button" class="btn" onclick="closeCourseModal(\'coursePrepSheetModal\')">Close</button>';
		const status = '<span id="prepSheetStatus" class="course-batch-status" aria-live="polite"></span>';
		if (!hasSheet) {
			return `${close}${status}<button type="button" class="btn btn-primary" data-prep-sheet-action="generate" onclick="runLessonPrepSheet('${esc(lessonId)}', false)">Generate</button>`;
		}
		return `${close}${status}`
			+ `<button type="button" class="btn" data-prep-sheet-action="regenerate" onclick="regenerateLessonPrepSheet('${esc(lessonId)}')">Regenerate</button>`
			+ `<button type="button" class="btn course-doc-export" onclick="exportLessonPrepSheet('${esc(lessonId)}', 'docx')">Export Word</button>`
			+ `<button type="button" class="btn course-doc-export" onclick="exportLessonPrepSheet('${esc(lessonId)}', 'pdf')">Export PDF</button>`;
	}

	function openPrepSheetModal(lesson, sheet) {
		const modal = openModal(
			'coursePrepSheetModal',
			`Prep sheet · ${esc(lesson.title || 'Lesson')}`,
			(prepSheetControlsHtml(lesson, sheet) || '') + (sheet ? prepSheetPreviewHtml(sheet, lesson) : ''),
			prepSheetFooterHtml(lesson.id, Boolean(sheet)),
			'course-document-modal',
		);
		const exportBtns = modal.querySelectorAll('.course-doc-export');
		exportBtns.forEach((button) => { button.disabled = !sheet; });
		return modal;
	}

	window.openLessonPrepSheet = function (lessonId) {
		const lesson = (currentCourse?.lessons || []).find((item) => String(item.id) === String(lessonId));
		if (!lesson) return toast('Lesson not found in this course.', 'error');
		const sheet = lesson.prep_sheet && typeof lesson.prep_sheet === 'object' ? lesson.prep_sheet : null;
		openPrepSheetModal(lesson, sheet);
	};

	window.regenerateLessonPrepSheet = function (lessonId) {
		if (!window.confirm('Regenerate this preparation sheet? The current version will be replaced by a new AI run (costs tokens).')) return;
		return window.runLessonPrepSheet(lessonId, true);
	};

	window.runLessonPrepSheet = async function (lessonId, force) {
		const A = api();
		if (!A || !currentCourse) return null;
		const lesson = (currentCourse.lessons || []).find((item) => String(item.id) === String(lessonId));
		if (!lesson) return null;
		const configId = selectedConfigId(document.getElementById('courseDetailPane'));
		if (!configId) return toast('Pick an AI model first.', 'error');
		const language = document.getElementById('prepSheetLanguage')?.value || 'French';
		const sessionMinutes = Number(document.getElementById('prepSheetMinutes')?.value) || 55;
		const status = document.getElementById('prepSheetStatus');
		const buttons = document.querySelectorAll('#coursePrepSheetModal [data-prep-sheet-action]');
		buttons.forEach((b) => { b.disabled = true; });
		if (status) status.textContent = force ? 'Regenerating sessions + sheets…' : 'Analyzing the lesson and generating…';
		try {
			const result = await A.raw(
				'POST',
				`/courses/${encodeURIComponent(currentCourse.id)}/lessons/${encodeURIComponent(lessonId)}/prep-sheet`,
				{ configId, language, sessionMinutes, force: Boolean(force) },
			);
			lesson.prep_sheet = result?.sheet || null;
			window.closeCourseModal('coursePrepSheetModal');
			openPrepSheetModal(lesson, lesson.prep_sheet);
			if (result?.regenerated) toast('Preparation sheet generated.');
			return lesson.prep_sheet;
		} catch (err) {
			if (status) status.textContent = `Generation failed: ${err?.message || 'error'}`;
			toast('Could not generate the preparation sheet: ' + (err?.message || 'error'), 'error');
			buttons.forEach((b) => { b.disabled = false; });
			return null;
		}
	};

	window.exportLessonPrepSheet = async function (lessonId, format) {
		const A = api();
		if (!A || !currentCourse) return;
		const status = document.getElementById('prepSheetStatus');
		const buttons = document.querySelectorAll('#coursePrepSheetModal .course-doc-export');
		buttons.forEach((b) => { b.disabled = true; });
		if (status) status.textContent = `Preparing ${format.toUpperCase()}…`;
		try {
			const result = await A.blob(
				'POST',
				`/courses/${encodeURIComponent(currentCourse.id)}/lessons/${encodeURIComponent(lessonId)}/prep-sheet/export`,
				{ format },
			);
			const url = URL.createObjectURL(result.blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = result.filename || `fiche-prep.${format}`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			if (status) status.textContent = `${format.toUpperCase()} file downloaded.`;
			toast(`${format.toUpperCase()} preparation sheet downloaded.`);
		} catch (err) {
			if (status) status.textContent = `Could not export: ${err?.message || 'error'}`;
			toast(`Could not export the preparation sheet: ${err?.message || 'error'}`, 'error');
		} finally {
			buttons.forEach((b) => { b.disabled = false; });
		}
	};

	// Course-wide batch: sequential per-lesson calls (short requests, visible
	// progress); `force` off so lessons that already have a sheet are skipped.
	window.generateAllPrepSheets = async function () {
		const A = api();
		if (!A || !currentCourse?.lessons?.length) return toast('This course has no lessons.', 'error');
		if (prepSheetBatchGenerating) return;
		const configId = selectedConfigId(document.getElementById('courseDetailPane'));
		if (!configId) return toast('Pick an AI model first.', 'error');
		prepSheetBatchGenerating = true;
		const courseId = currentCourse.id;
		const lessons = [...currentCourse.lessons];
		const button = document.querySelector('[data-prep-sheets-all]');
		if (button) { button.disabled = true; button.textContent = 'Generating sheets…'; }
		let done = 0;
		let skipped = 0;
		const failures = [];
		try {
			for (const [i, lesson] of lessons.entries()) {
				const status = document.getElementById('courseBatchStatus');
				if (status) status.textContent = `Generating ${i + 1} / ${lessons.length} — done: ${done}, failed: ${failures.length}`;
				try {
					const result = await A.raw(
						'POST',
						`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}/prep-sheet`,
						{ configId, language: 'French', sessionMinutes: 55, force: false },
					);
					if (result?.sheet) {
						lesson.prep_sheet = result.sheet;
						if (result.regenerated) done += 1; else skipped += 1;
					}
				} catch (err) {
					failures.push(lesson.title || 'Lesson');
				}
			}
			const summary = `Prep sheets: ${done} generated, ${skipped} already existed${failures.length ? `, ${failures.length} failed (${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''})` : ''}.`;
			toast(summary, failures.length ? 'error' : 'success');
		} finally {
			prepSheetBatchGenerating = false;
			if (String(currentCourse?.id) === String(courseId)) renderCourseDetail();
		}
	};

	window.saveLesson = async function (lessonId) {
		const A = api();
		if (!A) return;
		const title = document.getElementById(`lessonTitle-${lessonId}`)?.value?.trim();
		const summary = document.getElementById(`lessonSummary-${lessonId}`)?.value?.trim();
		const content = document.getElementById(`lessonContent-${lessonId}`)?.value;
		const categoryId =
			document.getElementById(`lessonCategory-${lessonId}`)?.value || null;
		if (!title) return toast('Lesson title is required.', 'error');
		try {
			const updated = await A.raw('PATCH', `/courses/lessons/${encodeURIComponent(lessonId)}`, {
				title,
				summary,
				content,
				category_id: categoryId,
			});
			const lesson = (currentCourse.lessons || []).find((l) => String(l.id) === String(lessonId));
			const categoryChanged =
				lesson && String(lesson.category_id || '') !== String(categoryId || '');
			if (lesson) Object.assign(lesson, updated);
			if (categoryChanged) renderCourseDetail();
			toast('Lesson saved.');
		} catch (err) {
			toast('Save failed: ' + (err?.message || 'error'), 'error');
		}
	};

	window.addLessonManual = async function () {
		const A = api();
		if (!A || !currentCourse) return;
		try {
			await A.raw('POST', `/courses/${encodeURIComponent(currentCourse.id)}/lessons`, {
				title: 'New lesson',
				summary: '',
				content: '',
			});
			currentCourse = await A.raw('GET', `/courses/${encodeURIComponent(currentCourse.id)}`);
			renderCourseDetail();
		} catch (err) {
			toast('Could not add lesson: ' + (err?.message || 'error'), 'error');
		}
	};

	window.deleteLessonConfirm = function (lessonId) {
		openModal(
			'lessonDeleteModal',
			'Delete lesson',
			'<p>Remove this lesson from the course? Its questions stay in the question bank.</p>',
			'<button type="button" class="btn" onclick="closeCourseModal(\'lessonDeleteModal\')">Cancel</button>' +
			`<button type="button" class="btn btn-danger" onclick="deleteLesson('${esc(lessonId)}')">Delete</button>`,
		);
	};

	window.deleteLesson = async function (lessonId) {
		const A = api();
		if (!A || !currentCourse) return;
		try {
			await A.raw('DELETE', `/courses/lessons/${encodeURIComponent(lessonId)}`);
			window.closeCourseModal('lessonDeleteModal');
			currentCourse = await A.raw('GET', `/courses/${encodeURIComponent(currentCourse.id)}`);
			renderCourseDetail();
			toast('Lesson deleted.');
		} catch (err) {
			toast('Delete failed: ' + (err?.message || 'error'), 'error');
		}
	};

	window.moveLesson = async function (lessonId, delta) {
		const A = api();
		if (!A || !currentCourse) return;
		// Persist current text edits first so the reorder response keeps them.
		const ids = (currentCourse.lessons || []).map((l) => String(l.id));
		const idx = ids.indexOf(String(lessonId));
		const target = idx + delta;
		if (idx < 0 || target < 0 || target >= ids.length) return;
		try {
			await saveAllDirtyLessons();
			ids.splice(target, 0, ...ids.splice(idx, 1));
			currentCourse = await A.raw('POST', `/courses/${encodeURIComponent(currentCourse.id)}/lessons/reorder`, { lessonIds: ids });
			renderCourseDetail();
		} catch (err) {
			toast('Reorder failed: ' + (err?.message || 'error'), 'error');
		}
	};

	async function saveAllDirtyLessons() {
		for (const lesson of currentCourse?.lessons || []) {
			const titleEl = document.getElementById(`lessonTitle-${lesson.id}`);
			if (!titleEl) continue;
			const summaryEl = document.getElementById(`lessonSummary-${lesson.id}`);
			const contentEl = document.getElementById(`lessonContent-${lesson.id}`);
			const title = titleEl.value.trim();
			const summary = summaryEl ? summaryEl.value.trim() : lesson.summary;
			const content = contentEl ? contentEl.value : lesson.content;
			if (title !== lesson.title || summary !== (lesson.summary || '') || content !== (lesson.content || '')) {
				const updated = await window.API.raw('PATCH', `/courses/lessons/${encodeURIComponent(lesson.id)}`, { title, summary, content });
				Object.assign(lesson, updated);
			}
		}
	}

	window.renameCoursePrompt = async function () {
		const A = api();
		if (!A || !currentCourse) return;
		openCourseMetaModal({
			id: 'courseRenameModal',
			eyebrow: 'Course settings',
			title: 'Course details',
			subtitle: 'These details appear on the student course card and in exported documents.',
			context: courseContextChips(currentCourse),
			nameId: 'courseRenameName',
			descId: 'courseRenameDesc',
			name: currentCourse.name || '',
			description: currentCourse.description || '',
			onSave: 'saveCourseMeta()',
			onEnter: () => window.saveCourseMeta(),
		});
	};

	window.saveCourseMeta = async function () {
		const A = api();
		if (!A || !currentCourse) return;
		const name = document.getElementById('courseRenameName')?.value?.trim();
		const description = document.getElementById('courseRenameDesc')?.value?.trim();
		if (!name) return toast('Name is required.', 'error');
		try {
			await A.raw('PATCH', `/courses/${encodeURIComponent(currentCourse.id)}`, { name, description });
			currentCourse.name = name;
			currentCourse.description = description;
			window.closeCourseModal('courseRenameModal');
			renderCourseDetail();
			await loadCourses();
			toast('Course updated.');
		} catch (err) {
			toast('Update failed: ' + (err?.message || 'error'), 'error');
		}
	};

	// ── Send to students (class assignment) ──────────────────────────────────
	window.openAssignClassesModal = async function (options = {}) {
		const A = api();
		if (!A || !currentCourse) return;
		let classRows = [];
		try {
			const res = await A.raw('GET', '/classes?limit=200');
			classRows = res && Array.isArray(res.data) ? res.data : [];
		} catch (err) {
			toast('Could not load classes: ' + (err?.message || 'error'), 'error');
			return;
		}
		const assigned = new Set((currentCourse.class_ids || []).map(String));
		const items = classRows
			.map(
				(cls) =>
					`<label style="display:block;padding:6px 4px;"><input type="checkbox" class="course-class-check" value="${esc(cls.id)}" ${assigned.has(String(cls.id)) ? 'checked' : ''}> ${esc(cls.name)}</label>`,
			)
			.join('');
		openModal(
			'courseAssignModal',
			options.publishAfterAssign ? 'Choose classes & publish' : 'Send course to students',
			`<p class="text-muted" style="margin:0 0 8px;">Select the classes that receive <strong>${esc(currentCourse.name)}</strong> in their workspace (Courses tab). ` +
				(options.publishAfterAssign
					? 'A course must be assigned to at least one class before students can see it. After you select classes, it will be published.'
					: 'Students see courses that are published and assigned to their class.') +
				'</p>' +
			(items || '<div class="text-muted">No classes yet.</div>'),
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseAssignModal\')">Cancel</button>' +
			`<button type="button" class="btn btn-primary" onclick="assignCourseClasses()">${options.publishAfterAssign ? 'Send & publish' : 'Send'}</button>`,
		);
	};

	window.assignCourseClasses = async function () {
		const A = api();
		if (!A || !currentCourse) return;
		const classIds = Array.from(document.querySelectorAll('.course-class-check:checked')).map((cb) => cb.value);
		const publishAfterAssign = String(publishAfterAssignCourseId || '') === String(currentCourse.id);
		if (publishAfterAssign && !classIds.length) {
			toast('Select at least one class before publishing this course.', 'error');
			return;
		}
		try {
			const updated = await A.raw('POST', `/courses/${encodeURIComponent(currentCourse.id)}/assign`, { classIds });
			currentCourse.class_ids = (updated && updated.class_ids) || classIds;
			window.closeCourseModal('courseAssignModal');
			toast(`Course sent to ${classIds.length} class(es).`);
			await loadCourses();
			renderCourseList();
			if (publishAfterAssign) {
				publishAfterAssignCourseId = null;
				await toggleCoursePublish(currentCourse.id, 'publish', true);
			}
		} catch (err) {
			toast('Assignment failed: ' + (err?.message || 'error'), 'error');
		}
	};

	// ── Questions from lesson → existing AI generator, prefilled ─────────────
	window.generateQuestionsFromLesson = async function (lessonId) {
		if (!currentCourse) return;
		const lesson = (currentCourse.lessons || []).find((l) => String(l.id) === String(lessonId));
		if (!lesson) return;
		// Persist edits first so nothing typed is lost while the modal is open.
		try { await saveAllDirtyLessons(); } catch (_) { /* non-fatal */ }
		const path = lesson.category_id ? categoryPath(lesson.category_id) : lesson.title;
		const leafName = path ? String(path).split(' › ').pop() : '';
		if (typeof window.openAIGeneratorModal !== 'function') {
			toast('AI generator unavailable — reload the page.', 'error');
			return;
		}
		window.openAIGeneratorModal({
			topic: path || lesson.title,
			categoryId: lesson.category_id ? String(lesson.category_id) : '',
			categoryName: leafName,
		});
	};

	// ── Dual Action 2: Question Generation Launchpad (3 Pathways) ─────────────
	window.openCourseQuestionLaunchpad = function () {
		if (!currentCourse) return;
		const course = currentCourse;
		openModal(
			'courseQuestionLaunchpadModal',
			`Generate Questions · ${esc(course.name)}`,
			'<p class="course-generator-hint" style="margin-bottom:14px;">Choose how you want to build questions and assessments for this course outline:</p>' +
			'<div class="launchpad-modal-grid">' +
			'<div class="launchpad-modal-option" onclick="closeCourseModal(\'courseQuestionLaunchpadModal\');openCourseAIGenerator()">' +
			'<div class="option-icon">⚡</div>' +
			'<strong>1. Direct In-App AI</strong>' +
			'<p>Generate questions directly using your configured AI model (Claude, GPT, Gemini, etc.) and save them to the question bank.</p>' +
			'<button type="button" class="btn btn-sm btn-primary">Use In-App AI →</button>' +
			'</div>' +
			'<div class="launchpad-modal-option" onclick="closeCourseModal(\'courseQuestionLaunchpadModal\');openPromptStudioForCourse()">' +
			'<div class="option-icon">📋</div>' +
			'<strong>2. AI Prompt Studio</strong>' +
			'<p>Build an expertly structured prompt for ChatGPT or Claude, copy it with 1 click, and paste the JSON response back.</p>' +
			'<button type="button" class="btn btn-sm">Open Prompt Studio →</button>' +
			'</div>' +
			'<div class="launchpad-modal-option" onclick="closeCourseModal(\'courseQuestionLaunchpadModal\');openManualQuestionForCourse()">' +
			'<div class="option-icon">✍️</div>' +
			'<strong>3. Manual Authoring</strong>' +
			'<p>Author custom questions with exact wording, images, explanations, and difficulty ratings.</p>' +
			'<button type="button" class="btn btn-sm">Add Manually →</button>' +
			'</div>' +
			'</div>',
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseQuestionLaunchpadModal\')">Cancel</button>',
			'course-question-launchpad-modal'
		);
	};

	window.openCourseAIGenerator = function () {
		if (!currentCourse) return;
		const path = currentCourse.category_path || categoryPath(currentCourse.category_id) || currentCourse.name;
		if (typeof window.openAIGeneratorModal !== 'function') {
			return toast('AI generator unavailable — reload the page.', 'error');
		}
		window.openAIGeneratorModal({
			topic: path || currentCourse.name,
			categoryId: currentCourse.category_id ? String(currentCourse.category_id) : '',
			categoryName: currentCourse.name,
		});
	};

	window.openPromptStudioForCourse = function () {
		if (!currentCourse) return;
		if (typeof window.setPromptBuilderAttach === 'function') {
			window.setPromptBuilderAttach({
				enabled: true,
				subjectId: String(currentCourse.subject_id || ''),
				courseName: String(currentCourse.name || ''),
			});
		}
		if (typeof window.openPromptBuilderModal === 'function') {
			window.openPromptBuilderModal();
		} else {
			toast('Prompt Builder unavailable — reload the page.', 'error');
		}
	};

	window.openManualQuestionForCourse = function () {
		if (!currentCourse) return;
		const categoryId = currentCourse.category_id ? String(currentCourse.category_id) : '';
		if (typeof window.openQuestionFormModal === 'function') {
			window.openQuestionFormModal();
			const select = document.getElementById('question-category');
			if (select && categoryId) select.value = categoryId;
		} else {
			toast('Question editor unavailable — reload the page.', 'error');
		}
	};

	window.openCategoryQuestionGeneration = function (categoryId) {
		const cat = categoryList().find((c) => String(c.id) === String(categoryId));
		const path = cat ? (categoryPath(cat.id) || cat.name) : '';
		if (typeof window.openAIGeneratorModal !== 'function') {
			return toast('AI generator unavailable — reload the page.', 'error');
		}
		window.openAIGeneratorModal({
			topic: path || (cat ? cat.name : ''),
			categoryId: String(categoryId),
			categoryName: cat ? cat.name : '',
		});
	};

	window.CoursesManagement = {
		refresh,
		loadCourses,
		renderCourseList,
		openCourseDetail,
		renderMarkdown,
		// Workspace surface: the merged Subjects tab switches panes through these
		// instead of a second nav entry.
		setView: (mode) => window.setSubjectsWorkspaceView(mode),
		openCourse: (...args) => window.openCourseDetail(...args),
		linkStructure: (...args) => window.linkStructure(...args),
		createCourseOnBranch: (...args) => window.createCourseOnBranch(...args),
		currentView: () => workspaceView,
		// Read-only view of the list for other tabs (Subjects manager shows a
		// per-subject course count; courses are server-backed and deliberately
		// not part of the localStorage mirror). ensureLoaded() fetches once.
		getCourses: () => coursesCache,
		ensureLoaded: () =>
			coursesCache.length ? Promise.resolve(coursesCache) : loadCourses(true).then(() => coursesCache),
		// Cache-busting hook used by the realtime bridge after server edits.
		invalidate: function () { aiConfigsCache = null; },
	};

	// ── Boot render ──────────────────────────────────────────────────────────
	// Nothing used to call refresh() at page load: only subject-pill clicks,
	// the category-delete flow and Settings did — so after a refresh the
	// courses list stayed empty until the user toggled subjects. Render it on
	// the same lifecycle events the other managers listen to, guarded so a
	// logged-out visitor (or one without the API client) never triggers a
	// failed fetch/toast.
	let lastBootRefresh = 0;
	function bootRefreshCourses() {
		if (!document.getElementById('courseList')) return;
		const role = String(window.currentUser?.role || '').toLowerCase();
		if (role !== 'admin' && role !== 'super_admin' && role !== 'teacher') return;
		if (!window.API || typeof window.API.raw !== 'function') return;
		const now = Date.now();
		if (now - lastBootRefresh < 4000) return; // dedupe the 3 events
		lastBootRefresh = now;
		refresh().catch(() => { /* list not mounted / tab torn down */ });
	}
	window.addEventListener('quiz:bootstrap-ready', bootRefreshCourses);
	window.addEventListener('auth:changed', bootRefreshCourses);
	// Fallback for slow environments where bootstrap may already have fired.
	document.addEventListener('DOMContentLoaded', function () {
		setTimeout(bootRefreshCourses, 120);
	});
})();

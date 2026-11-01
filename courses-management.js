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
	let collapsedCourseCategoryIds = new Set();

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

	// Per-category question counts from the admin question mirror; used only
	// for UI hints — the SERVER re-derives the plan and is authoritative.
	function questionCountByCategory() {
		const counts = new Map();
		try {
			if (typeof questions !== 'undefined' && Array.isArray(questions)) {
				for (const q of questions) {
					const cid = String(q?.category_id ?? q?.categoryId ?? '');
					if (!cid) continue;
					counts.set(cid, (counts.get(cid) || 0) + 1);
				}
			}
		} catch (_) { /* mirror unavailable */ }
		return counts;
	}

	function categoryPath(id) {
		const tree = window.CategoryTree;
		if (tree) {
			try { return tree.getPath(id, categoryList()); } catch (_) { /* fall through */ }
		}
		const cat = categoryList().find((c) => String(c.id) === String(id));
		return cat ? String(cat.name || '') : '';
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
	}
	window.closeCourseModal = closeCourseModal;

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
		return sel ? sel.value : '';
	}

	// ── List view ────────────────────────────────────────────────────────────
	async function refresh() {
		const listPane = document.getElementById('courseListPane');
		const detailPane = document.getElementById('courseDetailPane');
		if (listPane) listPane.classList.remove('hidden');
		if (detailPane) {
			detailPane.classList.add('hidden');
			detailPane.innerHTML = '';
		}
		currentCourse = null;
		await loadCourses();
		renderCourseList();
	}

	async function loadCourses() {
		const A = api();
		if (!A) return;
		try {
			const res = await A.raw('GET', '/courses?limit=200');
			coursesCache = res && Array.isArray(res.data) ? res.data : [];
		} catch (err) {
			console.warn('[courses] load failed:', err);
			toast('Could not load courses: ' + (err?.message || 'network error'), 'error');
			coursesCache = [];
		}
	}

	window.renderCourseList = function () {
		const tbody = document.querySelector('#courseList tbody');
		if (!tbody) return;
		const search = (document.getElementById('courseSearch')?.value || '').trim().toLowerCase();
		const status = document.getElementById('courseStatusFilter')?.value || '';
		const rows = coursesCache.filter((c) => {
			if (status && c.status !== status) return false;
			if (!search) return true;
			return (
				String(c.name || '').toLowerCase().includes(search) ||
				String(c.category_path || '').toLowerCase().includes(search)
			);
		});
		if (!rows.length) {
			tbody.innerHTML =
				'<tr><td colspan="7" class="text-muted course-empty-cell" style="text-align:center;padding:24px;">No courses yet — click "New Course from Categories" to generate one with AI.</td></tr>';
			return;
		}
		tbody.innerHTML = rows
			.map((c) => {
				const published = c.status === 'published';
				return (
					`<tr data-id="${esc(c.id)}">` +
					`<td><button type="button" class="course-name-link" onclick="openCourseDetail('${esc(c.id)}')" aria-label="Open course ${esc(c.name)}">${esc(c.name)}</button></td>` +
					`<td>${esc(c.category_path || '—')}</td>` +
					`<td>${Number(c.lesson_count) || 0}</td>` +
					`<td><span class="status-badge ${published ? 'status-success' : 'status-warning'}">${published ? 'Published' : 'Draft'}</span></td>` +
					`<td>${(c.class_names || []).map(esc).join(', ') || '—'}</td>` +
					`<td>${fmtDate(c.updated_at)}</td>` +
					'<td><div class="exam-actions">' +
					`<button class="exam-action-btn exam-edit-btn" title="Open course" onclick="openCourseDetail('${esc(c.id)}')">` +
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
					`<button class="exam-action-btn" title="${published ? 'Unpublish' : 'Publish'}" onclick="toggleCoursePublish('${esc(c.id)}','${published ? 'unpublish' : 'publish'}')">` +
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg></button>' +
					`<button class="exam-action-btn exam-delete-btn" title="Delete course" onclick="deleteCourseConfirm('${esc(c.id)}')">` +
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
					'</div></td></tr>'
				);
			})
			.join('');

		rows.forEach((course) => {
			const row = Array.from(tbody.querySelectorAll('tr[data-id]')).find(
				(item) => item.dataset.id === String(course.id),
			);
			if (!row) return;
			row.addEventListener('click', (event) => {
				if (window.innerWidth > 768 || event.target.closest('button, a')) return;
				event.stopPropagation();
				if (!window.MobileActionSheet || typeof window.MobileActionSheet.open !== 'function') {
					openCourseDetail(course.id);
					return;
				}
				const published = course.status === 'published';
				window.MobileActionSheet.open(`Course: ${String(course.name || '')}`, [
					{
						label: 'Open course',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
						onClick: () => openCourseDetail(course.id),
					},
					{
						label: published ? 'Unpublish course' : 'Publish course',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
						onClick: () => toggleCoursePublish(course.id, published ? 'unpublish' : 'publish'),
						variant: published ? 'default' : 'primary',
					},
					{
						label: 'Delete course',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
						onClick: () => deleteCourseConfirm(course.id),
						variant: 'danger',
					},
				]);
			});
		});
	};

	async function toggleCoursePublish(courseId, action) {
		const A = api();
		if (!A) return;
		try {
			await A.raw('POST', `/courses/${encodeURIComponent(courseId)}/${action}`);
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

	// ── New Course generator modal ───────────────────────────────────────────
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

		const body =
			'<input id="courseIncludeEmptyCategories" type="hidden" value="' + (defaults.includeEmptyCategories ? 'true' : 'false') + '">' +
			'<div class="form-group"><label for="newCourseName">Course name</label>' +
			`<input type="text" id="newCourseName" value="${esc(defaults.name || '')}" placeholder="e.g. French — Unit 2 vocabulary course" style="width:100%;"></div>` +
			'<div class="course-generator-tabs" role="tablist" aria-label="Course category source">' +
			'<button type="button" class="course-generator-tab active" role="tab" aria-selected="true" aria-controls="courseExistingPane" onclick="setCourseGeneratorMode(\'existing\')">Use existing categories</button>' +
			'<button type="button" class="course-generator-tab" role="tab" aria-selected="false" aria-controls="courseNewStructurePane" onclick="setCourseGeneratorMode(\'new\')">Create a new structure</button>' +
			'</div>' +
			`<div id="courseExistingPane" class="course-generator-pane">` +
			'<div class="form-group"><label for="newCourseBranch">Category branch</label>' +
			(options.length
				? `<select id="newCourseBranch" style="width:100%;">${options.join('')}</select>`
				: '<div class="course-generator-hint">No categories yet. Choose “Create a new structure” to start one.</div>') +
			'</div>' +
			'<p class="course-generator-hint">Lessons are created for leaf categories that already contain questions.</p>' +
			'</div>' +
			'<div id="courseNewStructurePane" class="course-generator-pane hidden" hidden>' +
			'<div class="form-group"><label for="newCourseRootCategory">Main category</label>' +
			'<input type="text" id="newCourseRootCategory" maxlength="100" placeholder="e.g. French grammar" style="width:100%;"></div>' +
			'<div class="course-generator-hint">Add subcategories and the axes beneath each one. A lesson outline will be generated for every axis; questions can be added later.</div>' +
			'<div id="courseSubcategoryGroups"></div>' +
			'<button type="button" class="btn btn-sm" onclick="addCourseSubcategoryGroup()">+ Add subcategory</button>' +
			'</div>' +
			'<div class="course-generator-settings">' +
			'<div class="form-group"><label for="newCourseLanguage">Content language</label>' +
			`<select id="newCourseLanguage"><option value="French" ${!defaults.language || defaults.language === 'French' ? 'selected' : ''}>French</option><option value="English" ${defaults.language === 'English' ? 'selected' : ''}>English</option><option value="Arabic" ${defaults.language === 'Arabic' ? 'selected' : ''}>Arabic</option></select></div>` +
			modelSelectHtml(defaults.configId, 'courseModelSelect') +
			'</div>';
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseGenModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="courseGenGo" onclick="runCourseGeneration()">Generate course</button>';
		openModal('courseGenModal', 'New Course from Categories', body, footer);
		window.addCourseSubcategoryGroup();
		if (defaults.includeEmptyCategories) window.setCourseGeneratorMode('existing');
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
			const active = index === (isNew ? 1 : 0);
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-selected', String(active));
		});
		if (button) {
			button.textContent = isNew ? 'Create structure & continue' : 'Generate course';
			button.onclick = isNew ? window.createCourseCategoryStructure : window.runCourseGeneration;
		}
	};

	window.addCourseSubcategoryGroup = function () {
		const container = document.getElementById('courseSubcategoryGroups');
		if (!container) return;
		const index = container.children.length + 1;
		const group = document.createElement('div');
		group.className = 'course-subcategory-group';
		group.innerHTML =
			`<div class="course-subcategory-heading"><strong>Subcategory ${index}</strong>` +
			`<button type="button" class="btn btn-sm" aria-label="Remove subcategory ${index}" onclick="this.closest('.course-subcategory-group').remove()">Remove</button></div>` +
			`<div class="form-group"><label>Subcategory name</label><input type="text" class="course-subcategory-name" maxlength="100" placeholder="e.g. Verb tenses" style="width:100%;"></div>` +
			`<div class="form-group"><label>Axes <span class="text-muted">(one per line)</span></label><textarea class="course-subcategory-axes" rows="3" placeholder="Present tense&#10;Past tense" style="width:100%;"></textarea></div>`;
		container.appendChild(group);
	};

	window.createCourseCategoryStructure = async function () {
		const name = (document.getElementById('newCourseName')?.value || '').trim();
		const rootName = (document.getElementById('newCourseRootCategory')?.value || '').trim();
		const groups = Array.from(document.querySelectorAll('#courseSubcategoryGroups .course-subcategory-group')).map((group) => ({
			name: group.querySelector('.course-subcategory-name')?.value.trim() || '',
			axes: (group.querySelector('.course-subcategory-axes')?.value || '').split(/\r?\n/).map((axis) => axis.trim()).filter(Boolean),
		}));
		const language = document.getElementById('newCourseLanguage')?.value || 'French';
		if (!name) return toast('Give the course a name first.', 'error');
		if (!rootName) return toast('Enter a main category name.', 'error');
		if (!groups.length || groups.some((group) => !group.name || !group.axes.length)) {
			return toast('Each subcategory needs a name and at least one axis.', 'error');
		}
		const btn = document.getElementById('courseGenGo');
		if (btn) { btn.disabled = true; btn.textContent = 'Creating categories…'; }
		const A = api();
		if (!A) {
			if (btn) { btn.disabled = false; btn.textContent = 'Create structure & continue'; }
			return;
		}
		let root = null;
		const createdCategories = [];
		try {
			root = await A.raw('POST', '/categories', { name: rootName });
			createdCategories.push(root);
			categoryList().push(root);
			for (const group of groups) {
				const subcategory = await A.raw('POST', '/categories', { name: group.name, parent_id: root.id });
				createdCategories.push(subcategory);
				categoryList().push(subcategory);
				for (const axisName of group.axes) {
					const axis = await A.raw('POST', '/categories', { name: axisName, parent_id: subcategory.id });
					createdCategories.push(axis);
					categoryList().push(axis);
				}
			}
		} catch (err) {
			let rollbackMessage = '';
			if (root?.id) {
				try {
					await A.raw('DELETE', `/categories/${encodeURIComponent(root.id)}`);
					const createdIds = new Set(createdCategories.map((category) => category.id));
					const categories = categoryList();
					for (let i = categories.length - 1; i >= 0; i--) {
						if (createdIds.has(categories[i]?.id)) categories.splice(i, 1);
					}
				} catch (rollbackErr) {
					rollbackMessage = ` Cleanup also failed: ${rollbackErr?.message || 'error'}.`;
				}
			}
			toast(`Could not create category structure: ${err?.message || 'error'}.${rollbackMessage}`, 'error');
			if (btn) { btn.disabled = false; btn.textContent = 'Create structure & continue'; }
			return;
		}
		await window.openCourseGeneratorModal(root.id, {
			name,
			language,
			configId,
			includeEmptyCategories: true,
		});
	};

	window.runCourseGeneration = async function () {
		const name = (document.getElementById('newCourseName')?.value || '').trim();
		const categoryId = document.getElementById('newCourseBranch')?.value || '';
		const language = document.getElementById('newCourseLanguage')?.value || 'French';
		const configId = selectedConfigId(document.getElementById('courseGenModal'));
		const includeEmptyCategories = document.getElementById('courseIncludeEmptyCategories')?.value === 'true';
		if (!name) return toast('Give the course a name first.', 'error');
		if (!categoryId) return toast('Pick a category branch first.', 'error');
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

	// Entry point for the Categories tab action button / long-press sheet:
	// jump to Courses, refresh the list and open the generator with this branch
	// already selected. Generation itself stays server-side (it validates that
	// the branch actually holds questions).
	window.openCourseFromCategory = async function (categoryId) {
		const cat = categoryList().find((c) => String(c.id) === String(categoryId));
		if (!cat) {
			toast('Category not found — refresh the Categories tab first.', 'error');
			return;
		}
		try {
			if (typeof window.openTab === 'function') {
				window.openTab(null, 'courses');
				const tabBtn = document.querySelector('.nav-tab[data-tab="courses"]');
				if (tabBtn) tabBtn.classList.add('active');
			}
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
		} catch (err) {
			toast('Could not open course: ' + (err?.message || 'error'), 'error');
			return;
		}
		const listPane = document.getElementById('courseListPane');
		const detailPane = document.getElementById('courseDetailPane');
		if (listPane) listPane.classList.add('hidden');
		if (detailPane) {
			detailPane.classList.remove('hidden');
			renderCourseDetail();
		}
	};
	window.closeCourseDetail = function () {
		const listPane = document.getElementById('courseListPane');
		const detailPane = document.getElementById('courseDetailPane');
		if (detailPane) { detailPane.classList.add('hidden'); detailPane.innerHTML = ''; }
		if (listPane) listPane.classList.remove('hidden');
		currentCourse = null;
		renderCourseList();
	};

	function lessonsByCategory() {
		const map = new Map();
		for (const lesson of currentCourse?.lessons || []) {
			if (lesson.category_id) map.set(String(lesson.category_id), lesson);
		}
		return map;
	}

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
					const qCount = counts.get(String(category.id)) || 0;
					const hasChildren = branchRows.some((row) => String(row.category.parent_id) === String(category.id));
					const level = depth === 0 ? 'Main category' : hasChildren ? 'Subcategory' : 'Axis';
					const toggle = hasChildren
						? `<button type="button" class="course-tree-toggle" data-course-collapse="${esc(category.id)}" onclick="toggleCourseCategory('${esc(category.id)}')" aria-label="Toggle ${esc(category.name)} subcategories" aria-expanded="${!collapsedCourseCategoryIds.has(String(category.id))}">${collapsedCourseCategoryIds.has(String(category.id)) ? '+' : '−'}</button>`
						: '<span class="course-tree-toggle-spacer" aria-hidden="true"></span>';
					const lessonLabel = lesson
						? `<button type="button" class="btn btn-sm course-tree-lesson-link" onclick="focusLesson('${esc(lesson.id)}')" title="Open lesson">Lesson: ${esc(lesson.title)}</button>`
						: `<span class="course-tree-unassigned">${hasChildren ? 'Lessons are organized below' : 'No lesson linked'}</span>`;
					const generateBtn = lesson
						? `<button type="button" class="btn btn-ai-generate btn-sm course-tree-generate" data-gen-lesson="${esc(lesson.id)}" onclick="generateLessonContent('${esc(lesson.id)}', this)">Generate course content via AI</button>`
						: '';
					return (
						`<div class="course-tree-row" data-category-id="${esc(category.id)}" style="--course-depth:${depth};">` +
						`<div class="course-tree-category">${toggle}<span class="course-tree-level">${level}</span>` +
						`<strong>${esc(category.name)}</strong><span class="course-tree-count">${qCount} question${qCount === 1 ? '' : 's'}</span></div>` +
						`<div class="course-tree-actions">${lessonLabel}${generateBtn}</div>` +
						'</div>'
					);
				})
				.join('')
			: '<div class="course-generator-hint">This course has no linked category branch (or the branch was deleted). Add lessons manually below.</div>';

		const lessonsHtml = (course.lessons || [])
			.map((l, idx) => lessonCardHtml(l, idx))
			.join('');

		pane.innerHTML =
			'<div class="course-detail-toolbar">' +
			'<div class="course-detail-heading"><button type="button" class="btn" onclick="closeCourseDetail()">&larr; Courses</button>' +
			'<div class="course-detail-title"><h2>' + esc(course.name) + '</h2>' +
			`<span class="status-badge ${published ? 'status-success' : 'status-warning'}">${published ? 'Published' : 'Draft'}</span></div></div>` +
			'<div class="course-detail-controls"><div class="course-model-control">' + modelSelectHtml(null, 'courseModelSelect') + '</div>' +
			'<div class="course-detail-actions">' +
			'<button type="button" class="btn course-action-rename" onclick="renameCoursePrompt()">Rename</button>' +
			`<button type="button" class="btn ${published ? 'course-action-unpublish' : 'course-action-publish'}" onclick="toggleCoursePublish('${esc(course.id)}','${published ? 'unpublish' : 'publish'}')">${published ? 'Unpublish' : 'Publish'}</button>` +
			'<button type="button" class="btn course-action-assign" onclick="openAssignClassesModal()">Send to students</button>' +
			'<button type="button" class="btn course-action-add" onclick="addLessonManual()">+ Add lesson</button>' +
			'</div></div></div>' +
			`<div class="course-branch-path">${esc(course.category_path || categoryPath(course.category_id) || 'No category branch')}</div>` +
			'<section class="course-structure-panel"><div class="course-section-heading"><div><h3>Category structure</h3>' +
			'<p>Lessons follow the categories and axes in this branch.</p></div>' +
			`<div class="course-structure-tools"><span class="course-structure-count">${branchRows.length} level${branchRows.length === 1 ? '' : 's'}</span>` +
			(branchRows.some((row) => branchRows.some((child) => String(child.category.parent_id) === String(row.category.id)))
				? '<button type="button" class="course-tree-bulk-toggle" onclick="setCourseCategoriesCollapsed(true)">Collapse all</button><button type="button" class="course-tree-bulk-toggle" onclick="setCourseCategoriesCollapsed(false)">Expand all</button>'
				: '') +
			'<span id="courseBatchStatus" class="course-batch-status" aria-live="polite"></span>' +
			(course.lessons?.length
				? '<button type="button" class="btn btn-primary btn-sm" data-generate-all-levels onclick="confirmGenerateAllCourseLessons()">Generate all levels with AI</button>'
				: '') +
			'</div></div>' +
			`<div class="course-tree">${structureHtml}</div></section>` +
			'<h3 style="margin:8px 0;">Lessons</h3>' +
			`<div id="courseLessonsWrap">${lessonsHtml || '<div class="text-muted">No lessons yet.</div>'}</div>`;
		updateCourseTreeVisibility();
	};

	window.confirmGenerateAllCourseLessons = function () {
		if (!currentCourse?.lessons?.length) return toast('This course has no lessons to generate.', 'error');
		const hasContent = currentCourse.lessons.some((lesson) => String(lesson.content || '').trim());
		openModal(
			'courseGenerateAllModal',
			'Generate all lesson content',
			`<p>Generate AI lesson content for all <strong>${currentCourse.lessons.length} levels</strong> under <strong>${esc(currentCourse.name)}</strong>? This runs one lesson at a time.</p>` +
				(hasContent ? '<p class="course-generator-hint">Existing lesson content will be replaced.</p>' : ''),
			`<button type="button" class="btn" onclick="closeCourseModal('courseGenerateAllModal')">Cancel</button>` +
				'<button type="button" class="btn btn-primary" onclick="generateAllCourseLessons()">Generate all</button>',
		);
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
		return (
			`<div class="lesson-card" data-lesson-id="${esc(lesson.id)}" style="border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:12px;margin-bottom:12px;background:var(--card-bg,#fff);">` +
			`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">` +
			`<strong>${idx + 1}.</strong>` +
			`<input type="text" id="lessonTitle-${esc(lesson.id)}" value="${esc(lesson.title)}" style="flex:2;min-width:180px;" placeholder="Lesson title" />` +
			`<input type="text" id="lessonSummary-${esc(lesson.id)}" value="${esc(lesson.summary || '')}" style="flex:3;min-width:200px;" placeholder="One-line summary" />` +
			`</div>` +
			`<textarea id="lessonContent-${esc(lesson.id)}" rows="8" style="width:100%;font-family:inherit;" placeholder="Lesson content (markdown). Use the AI button to fill it.">${esc(lesson.content || '')}</textarea>` +
			'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">' +
			`<button type="button" class="btn btn-ai-generate btn-sm" onclick="generateLessonContent('${esc(lesson.id)}', this)">Generate content via AI</button>` +
			`<button type="button" class="btn btn-sm" onclick="generateQuestionsFromLesson('${esc(lesson.id)}')">Generate questions</button>` +
			`<button type="button" class="btn btn-sm" onclick="previewLesson('${esc(lesson.id)}')">Preview</button>` +
			`<button type="button" class="btn btn-primary btn-sm" onclick="saveLesson('${esc(lesson.id)}')">Save</button>` +
			`<span style="flex:1;"></span>` +
			`<button type="button" class="btn btn-sm" title="Move up" ${idx === 0 ? 'disabled' : ''} onclick="moveLesson('${esc(lesson.id)}',-1)">&uarr;</button>` +
			`<button type="button" class="btn btn-sm" title="Move down" ${idx >= total - 1 ? 'disabled' : ''} onclick="moveLesson('${esc(lesson.id)}',1)">&darr;</button>` +
			`<button type="button" class="btn btn-danger-soft btn-sm" onclick="deleteLessonConfirm('${esc(lesson.id)}')">Delete</button>` +
			`</div>` +
			`<div id="lessonPreview-${esc(lesson.id)}" class="course-md-preview" style="display:none;margin-top:10px;border-top:1px dashed rgba(0,0,0,0.15);padding-top:8px;"></div>` +
			'</div>'
		);
	}

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
		if (box.style.display === 'none') {
			box.innerHTML = renderMarkdown(ta.value) || '<em>Nothing to preview yet.</em>';
			box.style.display = 'block';
		} else {
			box.style.display = 'none';
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

	window.saveLesson = async function (lessonId) {
		const A = api();
		if (!A) return;
		const title = document.getElementById(`lessonTitle-${lessonId}`)?.value?.trim();
		const summary = document.getElementById(`lessonSummary-${lessonId}`)?.value?.trim();
		const content = document.getElementById(`lessonContent-${lessonId}`)?.value;
		if (!title) return toast('Lesson title is required.', 'error');
		try {
			const updated = await A.raw('PATCH', `/courses/lessons/${encodeURIComponent(lessonId)}`, { title, summary, content });
			const lesson = (currentCourse.lessons || []).find((l) => String(l.id) === String(lessonId));
			if (lesson) Object.assign(lesson, updated);
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
		openModal(
			'courseRenameModal',
			'Course details',
			`<div class="form-group"><label for="courseRenameName">Name</label><input id="courseRenameName" value="${esc(currentCourse.name)}" style="width:100%;"></div>` +
			`<div class="form-group"><label for="courseRenameDesc">Description</label><textarea id="courseRenameDesc" rows="3" style="width:100%;">${esc(currentCourse.description || '')}</textarea></div>`,
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseRenameModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" onclick="saveCourseMeta()">Save</button>',
		);
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
	window.openAssignClassesModal = async function () {
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
			'Send course to students',
			`<p class="text-muted" style="margin:0 0 8px;">Select the classes that receive <strong>${esc(currentCourse.name)}</strong> in their workspace (Courses tab). Remember to publish the course — students only ever see published courses.</p>` +
			(items || '<div class="text-muted">No classes yet.</div>'),
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseAssignModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" onclick="assignCourseClasses()">Send</button>',
		);
	};

	window.assignCourseClasses = async function () {
		const A = api();
		if (!A || !currentCourse) return;
		const classIds = Array.from(document.querySelectorAll('.course-class-check:checked')).map((cb) => cb.value);
		try {
			const updated = await A.raw('POST', `/courses/${encodeURIComponent(currentCourse.id)}/assign`, { classIds });
			currentCourse.class_ids = (updated && updated.class_ids) || classIds;
			window.closeCourseModal('courseAssignModal');
			toast(`Course sent to ${classIds.length} class(es).`);
			await loadCourses();
			renderCourseList();
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

	window.CoursesManagement = {
		refresh,
		loadCourses,
		renderCourseList,
		openCourseDetail,
		renderMarkdown,
		// Cache-busting hook used by the realtime bridge after server edits.
		invalidate: function () { aiConfigsCache = null; },
	};
})();

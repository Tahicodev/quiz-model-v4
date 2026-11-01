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
	let publishAfterAssignCourseId = null;
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
					`<button class="exam-action-btn course-action-document" title="Create course document" onclick="createCourseDocument('${esc(c.id)}')">` +
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8M8 17h8"></path></svg></button>' +
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
						label: 'Create course document',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8M8 17h8"></path></svg>',
						onClick: () => window.createCourseDocument(course.id),
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
					const qCount = questionCountForCategoryBranch(category.id, counts, list, tree);
					const hasChildren = branchRows.some((row) => String(row.category.parent_id) === String(category.id));
					const level = depth === 0 ? 'Main category' : hasChildren ? 'Subcategory' : 'Axis';
					const toggle = hasChildren
						? `<button type="button" class="course-tree-toggle" data-course-collapse="${esc(category.id)}" onclick="toggleCourseCategory('${esc(category.id)}')" aria-label="Toggle ${esc(category.name)} subcategories" aria-expanded="${!collapsedCourseCategoryIds.has(String(category.id))}">${collapsedCourseCategoryIds.has(String(category.id)) ? '+' : '−'}</button>`
						: '<span class="course-tree-toggle-spacer" aria-hidden="true"></span>';
					const lessonLabel = lesson
						? `<button type="button" class="btn btn-sm course-tree-lesson-link" onclick="focusLesson('${esc(lesson.id)}')" title="Open lesson">Lesson: ${esc(lesson.title)}</button>`
						: `<span class="course-tree-unassigned">${hasChildren ? 'Lessons are organized below' : 'No lesson linked'}</span>`;
					const generateBtn = lesson
						? `<button type="button" class="btn btn-ai-generate btn-sm course-tree-generate" data-gen-lesson="${esc(lesson.id)}" onclick="openLessonAIActions('${esc(lesson.id)}')">Generate course content via AI</button>`
						: '';
					return (
						`<div class="course-tree-row" data-category-id="${esc(category.id)}"${lesson ? ` data-lesson-id="${esc(lesson.id)}"` : ''} style="--course-depth:${depth};">` +
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
			'<button type="button" class="btn course-action-document" onclick="createCourseDocument()">Create document</button>' +
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
		return (
			`<div class="lesson-card" data-lesson-id="${esc(lesson.id)}" style="border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:12px;margin-bottom:12px;background:var(--card-bg,#fff);">` +
			`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">` +
			`<strong>${idx + 1}.</strong>` +
			`<input type="text" id="lessonTitle-${esc(lesson.id)}" value="${esc(lesson.title)}" style="flex:2;min-width:180px;" placeholder="Lesson title" />` +
			`<input type="text" id="lessonSummary-${esc(lesson.id)}" value="${esc(lesson.summary || '')}" style="flex:3;min-width:200px;" placeholder="One-line summary" />` +
			`</div>` +
			`<textarea id="lessonContent-${esc(lesson.id)}" rows="8" style="width:100%;font-family:inherit;" placeholder="Lesson content (markdown). Use the AI button to fill it.">${esc(lesson.content || '')}</textarea>` +
			'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">' +
			`<button type="button" class="btn btn-ai-generate btn-sm" onclick="openLessonAIActions('${esc(lesson.id)}')">Generate content via AI</button>` +
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
			const header = {
				teacherName: window.currentUser?.name || '',
				subject: course.name || '',
				...(course.document_header || {}),
			};
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
			const formField = (id, label, value, placeholder = '') =>
				`<label class="course-doc-field"><span>${label}</span><input id="courseDoc${id}" maxlength="200" value="${esc(value || '')}" placeholder="${esc(placeholder)}"></label>`;
			const modal = openModal(
				'courseDocumentModal',
				`Create document · ${esc(course.name)}`,
				`<div class="course-doc-form" data-course-id="${esc(course.id)}">
					<div class="course-doc-step-label"><span>01</span><div><strong>Document identity</strong><small>School, teacher and course details</small></div></div>
					<section class="course-doc-section">
						<div class="course-doc-fields">
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
					</section>
					<div class="course-doc-step-label"><span>02</span><div><strong>Choose the visual style</strong><small>Pick a document theme and header arrangement</small></div></div>
					<section class="course-doc-section"><h4>Document template</h4>
						<div class="course-doc-templates">${templateCards}</div>
					</section>
					<section class="course-doc-section"><h4>Header arrangement</h4>
						<div class="course-doc-layouts">${headerLayoutCards}</div>
					</section>
					<div class="course-doc-step-label"><span>03</span><div><strong>Organize the course</strong><small>Choose the opening pages and lesson pagination</small></div></div>
					<section class="course-doc-section course-doc-options">
						<label><input id="courseDocIncludeCover" type="checkbox" checked><span><strong>Cover page</strong><small>Course title, branch, school and course overview</small></span></label>
						<label><input id="courseDocIncludeContents" type="checkbox" checked><span><strong>Table of contents</strong><small>Lesson list with its category path</small></span></label>
						<label><input id="courseDocLessonPages" type="checkbox"><span><strong>Start every lesson on a new page</strong><small>Use for a workbook-style handout</small></span></label>
					</section>
					<p class="course-doc-status" id="courseDocStatus" role="status">${course.lessons?.length ? `${course.lessons.length} lessons will be included.` : 'No lessons yet; the document will contain the course header.'}</p>
				</div>`,
				`<button type="button" class="btn" onclick="closeCourseModal('courseDocumentModal')">Cancel</button>
					<button type="button" class="btn course-doc-export course-doc-export-pdf" onclick="exportCourseDocument('pdf')">Export PDF</button>
					<button type="button" class="btn course-doc-export course-doc-export-docx" onclick="exportCourseDocument('docx')">Export Word</button>`,
				'course-document-modal',
			);
			modal.querySelectorAll('[data-course-doc-template]').forEach((button) => {
				button.addEventListener('click', () => {
					modal.querySelectorAll('[data-course-doc-template]').forEach((item) => {
						const selected = item === button;
						item.classList.toggle('is-selected', selected);
						item.setAttribute('aria-pressed', String(selected));
					});
				});
			});
			modal.querySelectorAll('[data-course-doc-layout]').forEach((button) => {
				button.addEventListener('click', () => {
					modal.querySelectorAll('[data-course-doc-layout]').forEach((item) => {
						const selected = item === button;
						item.classList.toggle('is-selected', selected);
						item.setAttribute('aria-pressed', String(selected));
					});
				});
			});
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
		const value = (id) => document.getElementById(`courseDoc${id}`)?.value?.trim() || '';
		const body = {
			format,
			templateId,
			headerLayout,
			includeCover: Boolean(document.getElementById('courseDocIncludeCover')?.checked),
			includeTableOfContents: Boolean(document.getElementById('courseDocIncludeContents')?.checked),
			startEachLessonOnNewPage: Boolean(document.getElementById('courseDocLessonPages')?.checked),
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

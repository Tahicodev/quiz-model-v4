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

	function modelSelectHtml(selectedId) {
		const rows = aiConfigsCache || [];
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
			'<div class="form-group"><label for="courseModelSelect">AI Model</label>' +
			`<select id="courseModelSelect">${options}</select>` +
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
					`<td><strong>${esc(c.name)}</strong></td>` +
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
	window.openCourseGeneratorModal = async function (preselectId) {
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
			const hint = counts.size ? ` — ${branchCount} question${branchCount === 1 ? '' : 's'} in branch` : '';
			options.push(
				`<option value="${esc(category.id)}" ${String(category.id) === String(preselectId || '') ? 'selected' : ''}>` +
				`${'— '.repeat(depth)}${esc(category.name)}${hint}</option>`,
			);
		}

		const body =
			'<div class="form-group"><label for="newCourseName">Course name</label>' +
			'<input type="text" id="newCourseName" placeholder="e.g. French — Unit 2 vocabulary course" style="width:100%;"></div>' +
			'<div class="form-group"><label for="newCourseBranch">Category branch</label>' +
			(options.length
				? `<select id="newCourseBranch" style="width:100%;">${options.join('')}</select>`
				: '<div class="text-muted">No categories yet — create your category / subcategory / axe structure first (Categories tab).</div>') +
			'</div>' +
			'<div class="form-group"><label for="newCourseLanguage">Content language</label>' +
			'<select id="newCourseLanguage"><option value="French" selected>French</option><option value="English">English</option><option value="Arabic">Arabic</option></select></div>' +
			modelSelectHtml() +
			'<p class="text-muted" style="font-size:12px;">One lesson is created per sub-level (axe) that already has questions; the lesson content later follows the same structure. You can edit everything afterwards.</p>';
		const footer =
			'<button type="button" class="btn" onclick="closeCourseModal(\'courseGenModal\')">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="courseGenGo" onclick="runCourseGeneration()">Generate course</button>';
		openModal('courseGenModal', 'New Course from Categories', body, footer);
	};

	window.runCourseGeneration = async function () {
		const name = (document.getElementById('newCourseName')?.value || '').trim();
		const categoryId = document.getElementById('newCourseBranch')?.value || '';
		const language = document.getElementById('newCourseLanguage')?.value || 'French';
		const configId = selectedConfigId(document.getElementById('courseGenModal'));
		if (!name) return toast('Give the course a name first.', 'error');
		if (!categoryId) return toast('Pick a category branch first.', 'error');
		if (!configId) return toast('Pick an AI model (Settings → AI Generation if empty).', 'error');
		const btn = document.getElementById('courseGenGo');
		if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
		const A = api();
		if (!A) return;
		try {
			const course = await A.raw('POST', '/courses/generate', { name, categoryId, configId, language });
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

		// Branch subtree (root = course.category_id), rendered with a
		// "generate" button in front of every lesson-bearing axe.
		let branchRows = [];
		const rootCat = course.category_id
			? list.find((c) => String(c.id) === String(course.category_id))
			: null;
		if (rootCat) {
			const ids = new Set([String(rootCat.id), ...tree.getDescendantIds(rootCat.id, list).map(String)]);
			branchRows = tree
				.getOrderedTree(list.filter((c) => ids.has(String(c.id))))
				.filter(({ category }) => tree.isLeaf(category.id, list));
		}

		const structureHtml = branchRows.length
			? branchRows
				.map(({ category, depth }) => {
					const lesson = lessonByCat.get(String(category.id));
					const qCount = counts.get(String(category.id)) || 0;
					const lessonLabel = lesson
						? `<button type="button" class="btn btn-sm" onclick="focusLesson('${esc(lesson.id)}')" title="Open lesson">Lesson: ${esc(lesson.title)}</button>`
						: '<span class="text-muted">no lesson</span>';
					const generateBtn = lesson
						? `<button type="button" class="btn btn-ai-generate btn-sm" data-gen-lesson="${esc(lesson.id)}" onclick="generateLessonContent('${esc(lesson.id)}', this)">Generate course content via AI</button>`
						: '';
					return (
						`<div class="course-tree-row" style="padding:8px 4px;border-bottom:1px solid rgba(0,0,0,0.06);margin-left:${depth * 14}px;">` +
						`<span style="display:inline-block;min-width:180px;">${'— '.repeat(depth)}<strong>${esc(category.name)}</strong>${qCount ? ` <span class="text-muted">(${qCount} q.)</span>` : ''}</span> ` +
						lessonLabel + ' ' + generateBtn +
						'</div>'
					);
				})
				.join('')
			: '<div class="text-muted" style="padding:12px 0;">This course has no linked category branch (or the branch was deleted). Add lessons manually below.</div>';

		const lessonsHtml = (course.lessons || [])
			.map((l, idx) => lessonCardHtml(l, idx))
			.join('');

		pane.innerHTML =
			'<div class="toolbar" style="margin-bottom:12px;">' +
			'<div class="toolbar-header-group"><h2 style="margin:0 12px 0 0;">' + esc(course.name) + '</h2>' +
			`<span class="status-badge ${published ? 'status-success' : 'status-warning'}">${published ? 'Published' : 'Draft'}</span></div>` +
			'<div class="toolbar-controls" style="flex-wrap:wrap;gap:8px;">' +
			modelSelectHtml() +
			'<button type="button" class="btn" onclick="closeCourseDetail()">&larr; Back</button>' +
			'<button type="button" class="btn" onclick="renameCoursePrompt()">Rename</button>' +
			`<button type="button" class="btn ${published ? '' : 'btn-primary'}" onclick="toggleCoursePublish('${esc(course.id)}','${published ? 'unpublish' : 'publish'}')">${published ? 'Unpublish' : 'Publish'}</button>` +
			'<button type="button" class="btn btn-primary" onclick="openAssignClassesModal()">Send to students</button>' +
			'<button type="button" class="btn" onclick="addLessonManual()">+ Add lesson</button>' +
			'</div></div>' +
		`<div class="course-branch-path text-muted" style="margin-bottom:10px;">Structure: ${esc(course.category_path || categoryPath(course.category_id) || '—')}</div>` +
			'<div class="table-container" style="margin-bottom:16px;"><div style="padding:4px 12px;">' +
			'<h3 style="margin:8px 0;">Category structure</h3>' + structureHtml + '</div></div>' +
			'<h3 style="margin:8px 0;">Lessons</h3>' +
			`<div id="courseLessonsWrap">${lessonsHtml || '<div class="text-muted">No lessons yet.</div>'}</div>`;
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

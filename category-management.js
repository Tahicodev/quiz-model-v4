// ============================================
// CATEGORY MANAGEMENT - STATE & CONFIGURATION
// ============================================
// This file manages the category modal functionality
// Uses unique element IDs: availableQuestionsCategory, selectedQuestionsListCategory,
// selectedQuestionCountCategory, availableQuestionCountCategory

// Category Management State
let categories = [];
let currentCategoryId = null;
let categorySortDirection = 'asc';
let selectedQuestionsForCategory = [];
let availableQuestionsForCategory = [];
let categoryDebounceTimer;

// ============================================
// TRAINING CATEGORIES (settings-row store)
// ============================================
// Which categories feed training mode. Persisted in the
// `categoryTrainingMap` settings row ({ [categoryId]: boolean }) so it
// survives bootstrap syncs and works across admin/teacher browsers — the
// same pattern as the teacherClassAssignments mirror. Public visibility so
// student devices can resolve the training pool too.
// Resolution: explicit entry wins; otherwise Uncategorized defaults to
// enabled (legacy behavior), every other category to disabled.
const CATEGORY_TRAINING_KEY = 'categoryTrainingMap';
let categoryTrainingMapCache = null;

function readCategoryTrainingMapFromRepo() {
	try {
		const repo = window.__DI_CONTAINER__?.repo;
		if (!repo) return null;
		let rows = [];
		if (typeof repo.getAll_sync === 'function') {
			const all = repo.getAll_sync('settings') || [];
			rows = Array.isArray(all) ? all : all.settings || [];
		} else if (typeof repo.getValue_sync === 'function') {
			const raw = repo.getValue_sync('settings', {});
			rows = raw?.settings || [];
		}
		const row = (Array.isArray(rows) ? rows : []).find(
			(s) => s && s.key === CATEGORY_TRAINING_KEY,
		);
		if (row?.value) {
			const parsed = JSON.parse(row.value);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed;
			}
		}
	} catch (_) {
		/* ignore */
	}
	return null;
}

function getCategoryTrainingMap() {
	if (categoryTrainingMapCache && typeof categoryTrainingMapCache === 'object') {
		return categoryTrainingMapCache;
	}
	const fromRepo = readCategoryTrainingMapFromRepo();
	categoryTrainingMapCache = fromRepo || {};
	return categoryTrainingMapCache;
}

function hasCategoryTrainingMap() {
	if (categoryTrainingMapCache && Object.keys(categoryTrainingMapCache).length) {
		return true;
	}
	return readCategoryTrainingMapFromRepo() !== null;
}

function isTrainingCategory(categoryOrId) {
	const originalId = String(
		(categoryOrId && categoryOrId.id) || categoryOrId || 'uncategorized',
	);
	const map = getCategoryTrainingMap();
	// Nearest explicit entry wins — walk up through parents so enabling
	// "Math" covers "Addition"/"Subtraction" without extra toggles.
	let id = originalId;
	const seen = new Set();
	while (id && !seen.has(id)) {
		seen.add(id);
		if (Object.prototype.hasOwnProperty.call(map, id)) {
			return map[id] === true;
		}
		id = getCategoryParentId(getCategoryById(id));
	}
	// Legacy default: only Uncategorized feeds training until configured.
	return originalId === 'uncategorized';
}

function getQuestionTrainingCategoryId(question) {
	if (!question || typeof question !== 'object') return 'uncategorized';
	const raw =
		question.category ?? question.categoryId ?? question.category_id ?? '';
	const trimmed = String(raw).trim();
	return trimmed || 'uncategorized';
}

function isTrainingQuestion(question) {
	return isTrainingCategory(getQuestionTrainingCategoryId(question));
}

// Training pool for pushes / exports: questions whose category is enabled.
// Legacy fallback (no map configured yet AND pool empty): first 50 questions.
function getTrainingQuestions(allQuestions) {
	const list = Array.isArray(allQuestions) ? allQuestions : [];
	const pool = list.filter(isTrainingQuestion);
	if (pool.length) return pool;
	if (!hasCategoryTrainingMap() && list.length) {
		console.log(
			'No training-enabled categories found, sending first 50 questions (legacy fallback).',
		);
		return list.slice(0, 50);
	}
	return pool;
}

async function setCategoryTraining(categoryId, enabled) {
	const id = String(categoryId || '');
	if (!id) return false;
	const map = { ...getCategoryTrainingMap(), [id]: enabled === true };
	categoryTrainingMapCache = map;
	if (window.API && typeof window.API.update === 'function') {
		try {
			await window.API.update('settings', CATEGORY_TRAINING_KEY, {
				key: CATEGORY_TRAINING_KEY,
				value: JSON.stringify(map),
				visibility: 'public',
			});
		} catch (err) {
			console.warn('[categories] training map server save failed:', err);
			showToast(
				'Training flag saved locally, but the server sync failed: ' +
					(err?.message || 'network error'),
				'warning',
			);
		}
	}
	if (typeof logActivity === 'function') {
		logActivity('category', id, enabled ? 'training enabled' : 'training disabled', {
			id,
		});
	}
	return true;
}

async function removeCategoryTraining(categoryId) {
	const id = String(categoryId || '');
	if (!id) return;
	const map = { ...getCategoryTrainingMap() };
	if (!Object.prototype.hasOwnProperty.call(map, id)) return;
	delete map[id];
	categoryTrainingMapCache = map;
	if (window.API && typeof window.API.update === 'function') {
		try {
			await window.API.update('settings', CATEGORY_TRAINING_KEY, {
				key: CATEGORY_TRAINING_KEY,
				value: JSON.stringify(map),
				visibility: 'public',
			});
		} catch (err) {
			console.warn('[categories] training map cleanup failed:', err);
		}
	}
}

async function toggleCategoryTraining(checkbox) {
	const id = String(checkbox?.dataset?.id || '');
	if (!id) return;
	const row = checkbox.closest('tr');
	await setCategoryTraining(id, checkbox.checked);
	if (row) {
		row.classList.toggle('training-enabled', checkbox.checked);
	}
	showToast(
		checkbox.checked
			? 'Category will be used in training mode'
			: 'Category removed from training mode',
		'success',
	);
}

// Refresh the in-memory map after a bootstrap sync lands.
window.addEventListener('quiz:bootstrap-ready', () => {
	try {
		categoryTrainingMapCache = readCategoryTrainingMapFromRepo() || {};
	} catch (_) {
		/* ignore */
	}
});

// ============================================
// QUICK CATEGORY CREATION MODAL
// ============================================
// Function to add new category inline from question modal
function addNewCategoryInline() {
	// Open the quick category modal instead of using prompt
	openQuickCategoryModal();
}

// Quick Category Modal Functions
function openQuickCategoryModal() {
	const modal = document.getElementById('quickCategoryModal');
	if (modal) {
		modal.style.display = 'block';
		// Focus on the name input
		setTimeout(() => {
			document.getElementById('quickCategoryName').focus();
		}, 100);
	}
}

function closeQuickCategoryModal() {
	const modal = document.getElementById('quickCategoryModal');
	if (modal) {
		modal.style.display = 'none';
		// Reset the form
		document.getElementById('quickCategoryForm').reset();
		document.getElementById('quickCategoryColor').value = '#3b82f6';
	}
}

function setQuickCategoryColor(color) {
	const colorInput = document.getElementById('quickCategoryColor');
	if (colorInput) {
		colorInput.value = color;
	}
}

// Author attribution for categories. Server-stamped keys (`created_by` /
// `creator_id`) are authoritative and win over the legacy `ownerId`: the
// edit dialog used to fall back to "current user" when only `ownerId` was
// present, so a stale local `ownerId` must never shadow the real author
// (e.g. a teacher's category showing the admin as its creator).
function getCategoryAuthorId(category) {
	if (!category || typeof category !== 'object') return '';
	const author =
		category.created_by ||
		category.creator_id ||
		category.ownerId ||
		category.createdBy ||
		category.creatorId ||
		'';
	return String(author || '');
}

// ============================================
// CATEGORY TREE (nested categories / subcategories)
// ============================================
// The server stores the hierarchy in `parent_id` (self-FK, any depth).
// These helpers are the single place that interprets it on the admin side;
// they are also exposed as `window.CategoryTree` for the question-bank,
// exam-builder and bulk-assign selects in the other admin scripts.
function getCategoryParentId(category) {
	if (!category || typeof category !== 'object') return '';
	const p = category.parent_id ?? category.parentId ?? '';
	return String(p || '');
}

function getCategoryById(id, list) {
	const rows = Array.isArray(list) ? list : categories;
	const key = String(id ?? '');
	return rows.find((c) => c && String(c.id) === key) || null;
}

function getCategoryChildrenIds(parentId, list) {
	const rows = Array.isArray(list) ? list : categories;
	const key = String(parentId ?? '');
	return rows
		.filter(
			(c) =>
				c &&
				c.id &&
				!c.isSystem &&
				String(c.id) !== key &&
				getCategoryParentId(c) === key,
		)
		.map((c) => c.id);
}

// Questions live in the deepest level only: a category with subcategories
// cannot hold questions directly (the question form + API enforce this).
function isLeafCategory(id, list) {
	return getCategoryChildrenIds(id, list).length === 0;
}

// All descendant ids (iterative + cycle-safe: a corrupted loop can never
// hang the UI, and getOrderedCategoryTree still renders every row).
function getCategoryDescendantIds(id, list) {
	const out = [];
	const seen = new Set([String(id ?? '')]);
	const queue = [String(id ?? '')];
	while (queue.length) {
		const current = queue.shift();
		for (const childId of getCategoryChildrenIds(current, list)) {
			const key = String(childId);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(childId);
			queue.push(key);
		}
	}
	return out;
}

function getCategoryAncestorIds(id, list) {
	const rows = Array.isArray(list) ? list : categories;
	const out = [];
	const seen = new Set([String(id ?? '')]);
	let current = String(id ?? '');
	for (;;) {
		const cat = rows.find((c) => c && String(c.id) === current) || null;
		const parent = cat ? getCategoryParentId(cat) : '';
		if (!parent || seen.has(parent)) break;
		seen.add(parent);
		const parentRow =
			rows.find((c) => c && String(c.id) === parent) || null;
		out.push(parentRow ? parentRow.id : parent);
		current = parent;
	}
	return out;
}

function getCategoryDepth(id, list) {
	return getCategoryAncestorIds(id, list).length;
}

// Breadcrumb path, e.g. "Math › Addition".
function getCategoryPath(id, list, separator = ' › ') {
	const parentPath = getCategoryParentPath(id, list, separator);
	const self = getCategoryById(id, list);
	const selfName = self ? String(self.name || 'Unnamed') : '';
	if (!parentPath) return selfName;
	if (!selfName) return parentPath;
	return `${parentPath}${separator}${selfName}`;
}

// Breadcrumb of ancestors only, e.g. "Math › Addition" for Equations.
function getCategoryParentPath(id, list, separator = ' › ') {
	const rows = Array.isArray(list) ? list : categories;
	const names = [...getCategoryAncestorIds(id, list)].reverse().map((cid) => {
		const cat = rows.find((c) => c && String(c.id) === String(cid));
		return cat ? String(cat.name || 'Unnamed') : '';
	});
	return names.filter(Boolean).join(separator);
}

// Flat pre-order walk: roots first, children (name-sorted) nested right
// under their parent. Nodes whose parent is absent from `list` are treated
// as roots, so filtered subsets still render correctly. Cycle leftovers
// (unreachable from any root) are appended instead of dropped.
function getOrderedCategoryTree(list, rootComparator) {
	const rows = (Array.isArray(list) ? list : categories).filter(
		(c) => c && c.id,
	);
	const byId = new Map(rows.map((c) => [String(c.id), c]));
	const childrenOf = new Map();
	const roots = [];
	for (const row of rows) {
		const parent = getCategoryParentId(row);
		if (
			parent &&
			parent !== String(row.id) &&
			byId.has(parent)
		) {
			if (!childrenOf.has(parent)) childrenOf.set(parent, []);
			childrenOf.get(parent).push(row);
		} else {
			roots.push(row);
		}
	}
	const byName = (a, b) =>
		String(a.name || '').localeCompare(String(b.name || ''));
	roots.sort(typeof rootComparator === 'function' ? rootComparator : byName);
	for (const siblings of childrenOf.values()) siblings.sort(byName);
	const out = [];
	const seen = new Set();
	const visit = (row, depth) => {
		const key = String(row.id);
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ category: row, depth });
		for (const child of childrenOf.get(key) || []) visit(child, depth + 1);
	};
	for (const root of roots) visit(root, 0);
	for (const row of rows) {
		if (!seen.has(String(row.id))) visit(row, 0);
	}
	return out;
}

function getIndentedCategoryLabel(category, depth) {
	return `${'\u2014 '.repeat(depth)}${category?.name || 'Unnamed'}`;
}

// ============================================
// TREE COLLAPSE STATE (persisted per browser)
// ============================================
let collapsedCategories = new Set();
try {
	const rawCollapsed = localStorage.getItem('quizCollapsedCategories');
	const parsedCollapsed = rawCollapsed ? JSON.parse(rawCollapsed) : [];
	if (Array.isArray(parsedCollapsed)) {
		collapsedCategories = new Set(
			parsedCollapsed.map((id) => String(id)),
		);
	}
} catch (_) {
	collapsedCategories = new Set();
}

function persistCollapsedCategories() {
	try {
		localStorage.setItem(
			'quizCollapsedCategories',
			JSON.stringify([...collapsedCategories]),
		);
	} catch (_) {
		/* private mode etc. — collapse just won't survive reloads */
	}
}

function toggleCategoryCollapse(event, categoryId) {
	if (event) {
		event.stopPropagation();
		if (typeof event.preventDefault === 'function') event.preventDefault();
	}
	const key = String(categoryId);
	if (collapsedCategories.has(key)) {
		collapsedCategories.delete(key);
	} else {
		collapsedCategories.add(key);
	}
	persistCollapsedCategories();
	updateCategoryList();
}

// ============================================
// POINTER DRAG NESTING (mouse + touch, one code path)
// ============================================
// Dragging starts on the ⋮⋮ grip, which has `touch-action: none` so the page
// still scrolls everywhere else. A press without movement is a tap and
// toggles tap-to-move mode instead — touch screens get the full experience:
// drag to nest, or tap grip → tap destination.
let catDrag = null; // { id, pointerId, startX, startY, started, targetId, ghost, hint }
let catPointerBound = false;
let catDragLastScroll = 0;
const CAT_DRAG_THRESHOLD_PX = 8;

function bindCatPointerOnce() {
	if (catPointerBound) return;
	catPointerBound = true;
	try {
		window.addEventListener('pointermove', onCatPointerMove, {
			passive: false,
		});
		window.addEventListener('pointerup', onCatPointerUp);
		window.addEventListener('pointercancel', cancelCatPointerDrag);
	} catch (_) {
		/* ignore */
	}
}

function clearCatDropTarget() {
	try {
		document
			.querySelectorAll('#categoryList tr.drop-target')
			.forEach((r) => r.classList.remove('drop-target'));
	} catch (_) {
		/* ignore */
	}
}

// Dropping onto Uncategorized moves the row to top-level; anything else must
// be a real, non-system category that is neither the dragged row nor one of
// its own subcategories.
function canDropCategoryOn(draggedId, targetId) {
	const from = String(draggedId ?? '');
	const to = String(targetId ?? '');
	if (!from || !to || from === to) return false;
	if (to === 'uncategorized') return true;
	const target = getCategoryById(to);
	if (!target || target.isSystem) return false;
	const forbidden = new Set([from]);
	for (const id of getCategoryDescendantIds(from)) {
		forbidden.add(String(id));
	}
	return !forbidden.has(to);
}

function onGripPointerDown(event, categoryId) {
	if (event?.pointerType === 'mouse' && (event.button ?? 0) !== 0) return;
	bindCatPointerOnce();
	catDrag = {
		id: String(categoryId),
		pointerId: event?.pointerId ?? null,
		startX: event?.clientX ?? 0,
		startY: event?.clientY ?? 0,
		started: false,
		targetId: null,
		ghost: null,
		hint: null,
	};
	// Suppress native image-drag / text selection. (The grip's
	// `touch-action: none` already keeps touch from scrolling here, and
	// cancelling pointerdown also suppresses the synthetic click that would
	// otherwise immediately toggle tap-to-move after a drag.)
	try {
		if (typeof event?.preventDefault === 'function') event.preventDefault();
	} catch (_) {
		/* ignore */
	}
}

function onCatPointerMove(event) {
	if (!catDrag) return;
	if (
		catDrag.pointerId !== null &&
		event.pointerId !== catDrag.pointerId
	)
		return;
	const dx = (event.clientX ?? 0) - catDrag.startX;
	const dy = (event.clientY ?? 0) - catDrag.startY;
	if (!catDrag.started) {
		if (Math.hypot(dx, dy) < CAT_DRAG_THRESHOLD_PX) return;
		startCatPointerDrag(event);
	}
	positionCatGhost(event);
	updateCatDropTarget(event);
	autoScrollCatDrag(event);
}

function startCatPointerDrag(event) {
	const cat = getCategoryById(catDrag.id);
	catDrag.started = true;
	try {
		document.body.classList.add('cat-dragging');
	} catch (_) {
		/* ignore */
	}
	try {
		const row = document.querySelector(
			`#categoryList tr[data-id="${catDrag.id}"]`,
		);
		if (row) row.classList.add('drag-source');
	} catch (_) {
		/* ignore */
	}
	try {
		const ghost = document.createElement('div');
		ghost.className = 'cat-drag-ghost';
		ghost.innerHTML =
			`<span class="ghost-name"><span class="ghost-dot" style="background-color:${cat?.color || '#9ca3af'}"></span>${escapeHtml(cat?.name || 'Category')}</span>` +
			`<span class="ghost-hint">Release to cancel</span>`;
		document.body.appendChild(ghost);
		catDrag.ghost = ghost;
		catDrag.hint = ghost.querySelector('.ghost-hint');
	} catch (_) {
		catDrag.ghost = null;
		catDrag.hint = null;
	}
	positionCatGhost(event);
}

function positionCatGhost(event) {
	if (!catDrag?.ghost) return;
	try {
		catDrag.ghost.style.left = `${(event.clientX ?? 0) + 14}px`;
		catDrag.ghost.style.top = `${(event.clientY ?? 0) + 14}px`;
	} catch (_) {
		/* ignore */
	}
}

function catRowFromPoint(x, y) {
	try {
		if (typeof document.elementFromPoint !== 'function') return null;
		const el = document.elementFromPoint(x, y);
		const row = el?.closest?.('#categoryList tr[data-id]');
		return row?.dataset?.id ? row : null;
	} catch (_) {
		return null;
	}
}

function updateCatDropTarget(event) {
	if (!catDrag) return;
	const row = catRowFromPoint(event.clientX, event.clientY);
	const targetId = row ? String(row.dataset.id) : null;
	if (targetId === catDrag.targetId) return;
	catDrag.targetId = targetId;
	clearCatDropTarget();
	const valid = !!targetId && canDropCategoryOn(catDrag.id, targetId);
	if (targetId && valid) {
		try {
			const targetRow = document.querySelector(
				`#categoryList tr[data-id="${targetId}"]`,
			);
			if (targetRow) targetRow.classList.add('drop-target');
		} catch (_) {
			/* ignore */
		}
	}
	updateCatGhostHint(valid, targetId);
}

function updateCatGhostHint(valid, targetId) {
	const hint = catDrag?.hint;
	if (!hint) return;
	try {
		if (!targetId) {
			hint.textContent = 'Release to cancel';
			hint.className = 'ghost-hint';
		} else if (String(targetId) === 'uncategorized') {
			hint.textContent = 'Release: move to top level';
			hint.className = 'ghost-hint top';
		} else if (valid) {
			const target = getCategoryById(targetId);
			hint.textContent = `Release: nest in "${target?.name || 'category'}"`;
			hint.className = 'ghost-hint';
		} else {
			hint.textContent = "Can't nest here";
			hint.className = 'ghost-hint bad';
		}
	} catch (_) {
		/* ignore */
	}
}

function autoScrollCatDrag(event) {
	const now = Date.now();
	if (now - catDragLastScroll < 60) return;
	catDragLastScroll = now;
	const y = event.clientY ?? -1;
	if (y < 0) return;
	let dy = 0;
	try {
		const height = window.innerHeight || 0;
		if (y < 90) dy = -18;
		else if (height && y > height - 90) dy = 18;
	} catch (_) {
		/* ignore */
	}
	if (!dy) return;
	try {
		let scroller = null;
		const el =
			typeof document.elementFromPoint === 'function'
				? document.elementFromPoint(event.clientX, event.clientY)
				: null;
		let node = el?.parentElement;
		while (
			node &&
			node !== document.body &&
			node !== document.documentElement
		) {
			if (node.scrollHeight > node.clientHeight + 4) {
				scroller = node;
				break;
			}
			node = node.parentElement;
		}
		if (scroller) scroller.scrollTop += dy;
		else if (typeof window.scrollBy === 'function') window.scrollBy(0, dy);
	} catch (_) {
		/* ignore */
	}
}

function cleanupCatPointerDrag() {
	try {
		document.body.classList.remove('cat-dragging');
	} catch (_) {
		/* ignore */
	}
	try {
		if (catDrag?.ghost && typeof catDrag.ghost.remove === 'function') {
			catDrag.ghost.remove();
		}
	} catch (_) {
		/* ignore */
	}
	clearCatDropTarget();
	try {
		document
			.querySelectorAll('#categoryList tr.drag-source')
			.forEach((r) => r.classList.remove('drag-source'));
	} catch (_) {
		/* ignore */
	}
	catDrag = null;
}

async function onCatPointerUp(event) {
	if (!catDrag) return;
	if (
		catDrag.pointerId !== null &&
		event.pointerId !== catDrag.pointerId
	)
		return;
	const drag = catDrag;
	const wasDragging = drag.started;
	const targetId = drag.targetId;
	cleanupCatPointerDrag();
	if (wasDragging) {
		// A click typically follows pointer-up on the grip — it must not
		// toggle tap-to-move right after a drag.
		suppressMoveTapUntil = Date.now() + 600;
		// A pointer drop wins over any active tap-to-move session.
		if (moveModeCategoryId) exitCategoryMoveMode();
		if (targetId) await dropCategoryOnto(drag.id, targetId);
		return;
	}
	// Plain tap on the grip → toggle tap-to-move mode.
	startCategoryMove(null, drag.id);
}

function cancelCatPointerDrag() {
	if (!catDrag) return;
	cleanupCatPointerDrag();
}

// Shared drop path for pointer drags and tap-to-move: validate, then move.
async function dropCategoryOnto(draggedId, targetId) {
	if (!canDropCategoryOn(draggedId, targetId)) {
		showToast(
			'A category cannot live inside itself or its own subcategories',
			'error',
		);
		return false;
	}
	return moveCategoryToParent(
		draggedId,
		String(targetId) === 'uncategorized' ? '' : String(targetId),
	);
}

// ============================================
// TAP-TO-MOVE MODE (mouse AND touch friendly)
// ============================================
// Pointer drags nest directly; a plain tap on the grip (or the Move action)
// picks the category up instead: tap its new parent, and the shared
// dropCategoryOnto() path below performs the move. The source stays
// highlighted, valid targets glow green, and a banner explains + offers
// Cancel.
let moveModeCategoryId = null;
let categoryMoveEscBound = false;
let suppressMoveTapUntil = 0;

function bindCategoryMoveEsc() {
	if (categoryMoveEscBound) return;
	categoryMoveEscBound = true;
	try {
		document.addEventListener('keydown', (e) => {
			if (
				(e.key === 'Escape' || e.key === 'Esc') &&
				moveModeCategoryId
			) {
				cancelCategoryMove();
			}
		});
	} catch (_) {
		/* ignore */
	}
}

function renderMoveModeBanner() {
	let banner = null;
	try {
		banner = document.getElementById('categoryMoveBanner');
	} catch (_) {
		banner = null;
	}
	if (!moveModeCategoryId) {
		if (banner && typeof banner.remove === 'function') banner.remove();
		return;
	}
	const cat = getCategoryById(moveModeCategoryId);
	if (!banner) {
		try {
			banner = document.createElement('div');
			banner.id = 'categoryMoveBanner';
			document.body.appendChild(banner);
		} catch (_) {
			return;
		}
	}
	banner.innerHTML =
		`<span>Moving "<b>${escapeHtml(cat?.name || 'category')}</b>" \u2014 tap a highlighted category to nest it inside it (Uncategorized = top level).</span>` +
		`<button type="button" onclick="cancelCategoryMove()">Cancel</button>`;
}

function startCategoryMove(event, categoryId) {
	if (event) {
		event.stopPropagation();
		if (typeof event.preventDefault === 'function') event.preventDefault();
	}
	const key = String(categoryId ?? '');
	if (!key) return;
	// Tapping the source again cancels.
	if (moveModeCategoryId === key) {
		cancelCategoryMove();
		return;
	}
	moveModeCategoryId = key;
	bindCategoryMoveEsc();
	renderMoveModeBanner();
	updateCategoryList();
	const cat = getCategoryById(key);
	showToast(
		`Moving "${cat?.name || 'category'}" \u2014 tap a category to nest it inside (Uncategorized = top level).`,
		'info',
	);
}

function cancelCategoryMove() {
	if (!moveModeCategoryId) return;
	moveModeCategoryId = null;
	renderMoveModeBanner();
	updateCategoryList();
}

function exitCategoryMoveMode() {
	moveModeCategoryId = null;
	renderMoveModeBanner();
}

async function finishCategoryMoveOnTap(targetId) {
	if (!moveModeCategoryId) return;
	const sourceId = moveModeCategoryId;
	if (String(targetId) === String(sourceId)) {
		cancelCategoryMove();
		return;
	}
	const moved = await dropCategoryOnto(sourceId, targetId);
	if (moved) {
		moveModeCategoryId = null;
		renderMoveModeBanner();
		updateCategoryList();
	}
	// On failure the mode stays active so the teacher can retry elsewhere.
}

// Reparent a category (server-first, then the local mirror). Passing '' as
// the new parent moves it back to top-level.
// Returns true when the mirror now reflects the requested parent.
async function moveCategoryToParent(categoryId, newParentId) {
	const category = categories.find(
		(c) => c && String(c.id) === String(categoryId),
	);
	if (!category) {
		showToast('Category not found', 'error');
		return false;
	}
	const prevParent = getCategoryParentId(category);
	if ((prevParent || '') === (newParentId || '')) return true; // no-op
	if (newParentId) {
		const target = categories.find(
			(c) => c && String(c.id) === String(newParentId),
		);
		if (!target || target.isSystem || target.id === 'uncategorized') {
			showToast('Cannot nest inside that category', 'error');
			return false;
		}
		const forbidden = new Set([String(categoryId)]);
		for (const id of getCategoryDescendantIds(categoryId)) {
			forbidden.add(String(id));
		}
		if (forbidden.has(String(newParentId))) {
			showToast(
				'A category cannot live inside itself or its own subcategories',
				'error',
			);
			return false;
		}
	}

	if (window.API && typeof window.API.update === 'function') {
		try {
			const payload = { name: category.name };
			if (category.color) payload.color = category.color;
			// The API mapper forwards an explicit null (clear) and uuids;
			// an absent key would leave the server value untouched.
			if (newParentId) payload.parent_id = newParentId;
			else if (prevParent) payload.parent_id = null;
			const saved = await window.API.update(
				'categories',
				categoryId,
				payload,
			);
			if (
				saved &&
				(saved.parent_id !== undefined || saved.parentId !== undefined)
			) {
				const serverParent = saved.parent_id ?? saved.parentId ?? null;
				category.parent_id = serverParent;
				category.parentId = serverParent;
			} else {
				category.parent_id = newParentId || null;
				category.parentId = newParentId || null;
			}
		} catch (apiErr) {
			console.warn('[categories] move failed:', apiErr);
			showToast(
				'Could not move category: ' + (apiErr?.message || 'network error'),
				'error',
			);
			return false;
		}
	} else {
		category.parent_id = newParentId || null;
		category.parentId = newParentId || null;
	}

	saveCategories();
	updateCategoryList();
	loadCategoriesIntoSelect();
	loadCategoriesIntoFilters();
	const targetName = newParentId
		? getCategoryById(newParentId)?.name || 'another category'
		: 'top level';
	showToast(
		`"${category.name}" moved ${newParentId ? `into "${targetName}"` : 'to top level'}`,
		'success',
	);
	if (typeof logActivity === 'function') {
		logActivity('category', category.name, 'moved', {
			id: categoryId,
			parent_id: newParentId || null,
		});
	}
	return true;
}

// Parent dropdown of the create/edit modal: every visible category, indented
// by depth. The edited category itself plus its whole subtree are excluded
// (a category cannot live inside itself or its own subcategories).
function populateCategoryParentPicker(excludeId) {
	const select = document.getElementById('categoryParent');
	if (!select) return;
	const excluded = new Set();
	if (excludeId) {
		excluded.add(String(excludeId));
		for (const id of getCategoryDescendantIds(excludeId)) {
			excluded.add(String(id));
		}
	}
	const visible = categories.filter(
		(category) =>
			category &&
			category.id &&
			!category.isSystem &&
			category.id !== 'uncategorized' &&
			!excluded.has(String(category.id)) &&
			(!window.Auth?.canAccessItem ||
				window.Auth.canAccessItem('category', category)),
	);
	select.innerHTML = '';
	const topOption = document.createElement('option');
	topOption.value = '';
	topOption.textContent = 'Top-level category';
	select.appendChild(topOption);
	for (const { category, depth } of getOrderedCategoryTree(visible)) {
		const option = document.createElement('option');
		option.value = category.id;
		option.textContent = getIndentedCategoryLabel(category, depth);
		select.appendChild(option);
	}
}

if (typeof window !== 'undefined') {
	window.CategoryTree = {
		getParentId: getCategoryParentId,
		getById: getCategoryById,
		getChildrenIds: getCategoryChildrenIds,
		isLeaf: isLeafCategory,
		getDescendantIds: getCategoryDescendantIds,
		getAncestorIds: getCategoryAncestorIds,
		getDepth: getCategoryDepth,
		getPath: getCategoryPath,
		getOrderedTree: getOrderedCategoryTree,
		getIndentedLabel: getIndentedCategoryLabel,
	};
}

async function saveQuickCategoryForm() {
	const categoryName = document
		.getElementById('quickCategoryName')
		.value.trim();
	const categoryColor = document.getElementById('quickCategoryColor').value;

	if (!categoryName) {
		showToast('Please enter a category name', 'error');
		return;
	}

	// Check if category already exists
	const existingCategory = categories.find(
		(cat) =>
			String(cat.name || '').toLowerCase() === categoryName.toLowerCase(),
	);
	if (existingCategory) {
		showToast('Category with this name already exists', 'error');
		return;
	}

	// Authorship is stamped in both vocabularies so the owner badge and the
	// teacher filter agree no matter which key a reader checks.
	const authorId = window.Auth?.getCurrentUser?.()?.id || '';
	const newCategory = {
		id: generateUUID(),
		name: categoryName,
		color: categoryColor,
		questionCount: 0,
		dateCreated: new Date().toISOString(),
		ownerId: authorId,
		created_by: authorId,
	};

	// Persist to the backend so the server stamps the same author
	// (`created_by` from the JWT). The server id/author are authoritative —
	// adopt them so the local mirror never disagrees with the DB.
	if (window.API && typeof window.API.create === 'function') {
		try {
			const payload = { name: newCategory.name };
			if (newCategory.color) payload.color = newCategory.color;
			const saved = await window.API.create('categories', payload);
			if (saved && saved.id) {
				newCategory.id = saved.id;
			}
			const serverAuthor =
				(saved && (saved.created_by || saved.creator_id || saved.ownerId)) ||
				'';
			if (serverAuthor) {
				newCategory.created_by = String(serverAuthor);
				newCategory.ownerId = String(serverAuthor);
			}
		} catch (apiErr) {
			console.warn('[categories] API create failed:', apiErr);
			showToast(
				'Category saved locally, but the server sync failed: ' +
					(apiErr?.message || 'network error'),
				'warning',
			);
		}
	}

	categories.push(newCategory);
	saveCategories();
	updateCategoryList();
	loadCategoriesIntoSelect();

	// Select the newly created category
	const categorySelect = document.getElementById('category');
	if (categorySelect) {
		categorySelect.value = newCategory.id;
	}

	closeQuickCategoryModal();
	showToast('Category created successfully!');

	// Log activity
	if (typeof logActivity === 'function') {
		logActivity('category', newCategory.name, 'created', {
			id: newCategory.id,
			questionCount: 0,
		});
	}
}

// Default category colors
const DEFAULT_CATEGORY_COLORS = [
	'#3b82f6', // blue
	'#10b981', // green
	'#f59e0b', // amber
	'#ef4444', // red
	'#8b5cf6', // violet
	'#06b6d4', // cyan
	'#f97316', // orange
	'#84cc16', // lime
	'#ec4899', // pink
	'#6366f1', // indigo
];

// Initialize category management
function initCategoryManagement() {
	loadCategories();
	// Recalculate question counts based on actual questions in localStorage
	updateQuestionCategoryCounts();
	updateCategoryList();
	setupCategoryEventListeners();
	loadCategoriesIntoSelect();
	loadCategoriesIntoFilters();

	// Set initial sort direction state in UI
	const sortDirectionButton = document.getElementById('sortCategoryDirection');
	if (sortDirectionButton) {
		sortDirectionButton.classList.add('desc');
	}
}

function loadCategories() {
	const savedCategories = JSON.stringify(
		window.__DI_CONTAINER__.repo.getAll_sync('categories'),
	);
	categories = savedCategories ? JSON.parse(savedCategories) : [];
	// Reconcile the two author vocabularies on every load (see
	// normalizeCategoryAuthors): heals rows whose local `ownerId` disagrees
	// with the authoritative server attribution.
	normalizeCategoryAuthors();

	// If no categories exist, create a default uncategorized category
	if (categories.length === 0) {
		createDefaultCategories();
	} else {
		// Ensure uncategorized category exists and has correct ID
		let uncategorizedIndex = categories.findIndex(
			(cat) =>
				cat.id === 'uncategorized' ||
				String(cat.name || '').toLowerCase() === 'uncategorized',
		);

		if (uncategorizedIndex === -1) {
			// Create uncategorized category if it doesn't exist
			categories.unshift({
				id: 'uncategorized',
				name: 'Uncategorized',
				description: 'Questions without category assignment',
				color: '#6b7280',
				questionCount: 0,
				dateCreated: new Date().toISOString(),
				isSystem: true,
			});
			saveCategories();
		} else if (categories[uncategorizedIndex].id !== 'uncategorized') {
			// Fix ID if it exists but has wrong ID (UUID instead of 'uncategorized')
			const oldId = categories[uncategorizedIndex].id;
			categories[uncategorizedIndex].id = 'uncategorized';
			categories[uncategorizedIndex].isSystem = true;

			// Update all questions using the old ID to use 'uncategorized'
			const savedQuestions =
				window.__DI_CONTAINER__.repo.getAll_sync('questions');
			let questionsUpdated = false;
			savedQuestions.forEach((question) => {
				if (question.category === oldId) {
					question.category = 'uncategorized';
					questionsUpdated = true;
				}
			});

			if (questionsUpdated) {
				window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
			}

			saveCategories();
		}
	}
}

function normalizeCategoryAuthors() {
	if (!Array.isArray(categories)) return;
	categories.forEach((cat) => {
		if (!cat || typeof cat !== 'object') return;
		const serverAuthor = cat.created_by || cat.creator_id || '';
		if (serverAuthor) {
			cat.created_by = cat.created_by || String(serverAuthor);
			cat.ownerId = String(serverAuthor);
		} else if (cat.ownerId && !cat.created_by) {
			cat.created_by = String(cat.ownerId);
		}
	});
}

function createDefaultCategories() {
	categories = [
		{
			id: 'uncategorized',
			name: 'Uncategorized',
			description: 'Questions without category assignment',
			color: '#6b7280',
			questionCount: 0,
			dateCreated: new Date().toISOString(),
			isSystem: true,
		},
	];
	saveCategories();
}

function saveCategories() {
	window.__DI_CONTAINER__.repo.setAll_sync('categories', categories);

	// Update Dashboard if available
	if (window.initDashboard) {
		window.initDashboard();
	}
	updateQuestionCategoryCounts();
}

function updateQuestionCategoryCounts() {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	const questions = savedQuestions || [];

	// Reset all category counts
	categories.forEach((category) => {
		category.questionCount = 0;
	});

	// Count direct questions per category (id first, name as legacy fallback)
	const byId = new Map(categories.map((c) => [String(c.id), c]));
	const byName = new Map();
	for (const c of categories) {
		if (c?.name && !byName.has(String(c.name))) byName.set(String(c.name), c);
	}
	questions.forEach((question) => {
		const ref = question.category ?? question.categoryId ?? question.category_id ?? 'uncategorized';
		const categoryObj = byId.get(String(ref)) || byName.get(String(ref));
		if (categoryObj) {
			categoryObj.questionCount++;
		}
	});

	// Roll subtree counts up into parents (children first, so each level
	// accumulates exactly once): "Math" shows Addition + Subtraction too.
	const ordered = getOrderedCategoryTree(
		categories.filter((c) => c && !c.isSystem && c.id !== 'uncategorized'),
	);
	for (let i = ordered.length - 1; i >= 0; i--) {
		const child = ordered[i].category;
		const parent = byId.get(getCategoryParentId(child));
		if (parent) {
			parent.questionCount =
				(parent.questionCount || 0) + (child.questionCount || 0);
		}
	}

	// Save updated categories
	window.__DI_CONTAINER__.repo.setAll_sync('categories', categories);
}

// Populate category filter in category modal
function populateCategoryFilter() {
	console.log('populateCategoryFilter called');
	const categoryFilterCategory = document.getElementById(
		'categoryFilterCategory',
	);
	if (!categoryFilterCategory) {
		console.error('categoryFilterCategory element not found');
		return;
	}

	// Always fetch fresh from localStorage to match loadAvailableQuestionsForCategory
	let savedCategories = [];
	try {
		savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
	} catch (e) {
		console.error('Error loading categories:', e);
		savedCategories = [];
	}

	console.log('Loaded categories for filter:', savedCategories.length);

	// Clear and set defaults
	categoryFilterCategory.innerHTML = `
        <option value="">All Categories</option>
        <option value="recent">Recent</option>
        <option value="unused">Unused</option>
        <option value="popular">Popular</option>
        <option value="uncategorized">Uncategorized</option>
    `;

	// Add categories (hierarchical labels; the filter itself still matches
	// the exact category — training/count roll-up is what spans subtrees).
	if (Array.isArray(savedCategories)) {
		const rows = savedCategories.filter(
			(category) => category && category.id && category.name && !category.isSystem,
		);
		for (const { category, depth } of getOrderedCategoryTree(rows)) {
			const option = document.createElement('option');
			option.value = category.id;
			option.textContent = getIndentedCategoryLabel(category, depth);
			categoryFilterCategory.appendChild(option);
		}
	}

	// Debug: check resulting options
	console.log('Filter options count:', categoryFilterCategory.options.length);

	// Add event listener if not already present
	if (!categoryFilterCategory.dataset.listenerAttached) {
		categoryFilterCategory.addEventListener('change', filterCategoryQuestions);
		categoryFilterCategory.dataset.listenerAttached = 'true';
	}
}

function createNewCategory() {
	currentCategoryId = null;
	document.getElementById('categoryModalTitle').textContent =
		'Create New Category';
	document.getElementById('categoryForm').reset();
	document.getElementById('categoryColor').value = getRandomCategoryColor();
	// New categories are excluded from training until explicitly enabled.
	document.getElementById('categoryTraining').checked = false;
	populateCategoryParentPicker(null);

	// The create/edit form no longer embeds the question picker — questions
	// are assigned from the dedicated Assign Questions modal (table action).
	openCategoryModal();
}

function editCategory(categoryId) {
	currentCategoryId = categoryId;
	const category = categories.find((c) => c.id === categoryId);

	if (!category) {
		showToast('Category not found', 'error');
		return;
	}

	document.getElementById('categoryModalTitle').textContent = 'Edit Category';
	document.getElementById('categoryName').value = category.name || '';
	document.getElementById('categoryDescription').value =
		category.description || '';
	document.getElementById('categoryColor').value = category.color || '#3b82f6';
	document.getElementById('categoryTraining').checked =
		isTrainingCategory(categoryId);
	populateCategoryParentPicker(categoryId);
	const parentSelect = document.getElementById('categoryParent');
	if (parentSelect) {
		parentSelect.value = getCategoryParentId(category);
	}

	// Questions are no longer part of the edit form; they are managed via the
	// Assign Questions action in the categories table.
	openCategoryModal();
}

// Detach every question filed under this category on the server
// (category_id NULL) so the subsequent DELETE /categories/:id is accepted:
// the server refuses to delete a category that still contains questions.
// Local-only questions (no server id) are skipped — they detach with the
// local pass. A per-question 404 is tolerated (already gone server-side).
async function detachCategoryQuestionsOnServer(category) {
	const categoryId = category?.id ?? category;
	const categoryName = category?.name ?? '';
	const savedQuestions =
		window.__DI_CONTAINER__.repo.getAll_sync('questions') || [];
	const attached = savedQuestions.filter(
		(q) =>
			q &&
			q.id &&
			(String(q.category || '') === String(categoryId) ||
				String(q.category || '') === String(categoryName) ||
				String(q.categoryId || '') === String(categoryId) ||
				String(q.category_id || '') === String(categoryId)),
	);
	if (!attached.length) return;
	if (!window.API || typeof window.API.raw !== 'function') {
		throw new Error('Question API is unavailable. Refresh the page and try again.');
	}
	for (const question of attached) {
		try {
			await window.API.raw(
				'PATCH',
				`/questions/${encodeURIComponent(question.id)}`,
				{ category_id: null },
			);
		} catch (err) {
			// Already detached/gone server-side — nothing to do.
			if (err?.status === 404) continue;
			throw err;
		}
		question.category = '';
		question.categoryId = '';
		question.category_id = null;
	}
	window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
}

async function deleteCategory(categoryId) {
	const category = categories.find((c) => c.id === categoryId);

	if (!category) {
		showToast('Category not found', 'error');
		return;
	}

	if (category.isDefault) {
		showToast('Cannot delete default categories', 'error');
		return;
	}

	if (
		confirm(
			`Are you sure you want to delete "${category.name}"? All questions in this category will become uncategorized.`,
		)
	) {
		// Server-first: detach every server-side question (category_id NULL)
		// BEFORE deleting the row — the server refuses to delete a category
		// that still contains questions. A 404 means the row is already gone
		// server-side, so we still finish the local removal.
		if (window.API && typeof window.API.remove === 'function') {
			try {
				await detachCategoryQuestionsOnServer(category);
			} catch (apiErr) {
				console.warn('[categories] question detach failed:', apiErr);
				showToast(
					'Cannot delete category: ' +
						(apiErr?.message || 'network error'),
					'error',
				);
				return;
			}
			try {
				await window.API.remove('categories', categoryId);
			} catch (apiErr) {
				if (apiErr?.status !== 404) {
					console.warn('[categories] API delete failed:', apiErr);
					showToast(
						'Failed to delete category on server: ' +
							(apiErr?.message || 'network error'),
						'error',
					);
					return;
				}
			}
		}

		// Remove category from questions (all key spellings)
		const savedQuestions =
			window.__DI_CONTAINER__.repo.getAll_sync('questions');
		const questions = savedQuestions || [];

		questions.forEach((question) => {
			if (
				question.category === category.name ||
				question.category === category.id ||
				question.categoryId === category.id ||
				question.category_id === category.id
			) {
				question.category = '';
				question.categoryId = '';
				question.category_id = null;
			}
		});

		window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);

		// Remove category
		categories = categories.filter((c) => c.id !== categoryId);
		await removeCategoryTraining(categoryId);
		saveCategories();
		updateCategoryList();
		loadCategoriesIntoFilters();
		showToast('Category deleted successfully!');
	}
}

async function saveCategoryForm() {
	const name = document.getElementById('categoryName').value.trim();
	const description = document
		.getElementById('categoryDescription')
		.value.trim();
	const color = document.getElementById('categoryColor').value;

	if (!name) {
		showToast('Please enter a category name', 'error');
		return;
	}

	// Check for duplicate names (excluding current category if editing)
	const existingCategory = categories.find(
		(c) =>
			String(c.name || '').toLowerCase() === name.toLowerCase() &&
			c.id !== currentCategoryId,
	);

	if (existingCategory) {
		showToast('A category with this name already exists', 'error');
		return;
	}

	// Question assignments are handled by the dedicated Assign Questions
	// modal; here we only preserve whatever the category already has.
	const existing = currentCategoryId
		? categories.find((c) => c.id === currentCategoryId)
		: null;
	const assignedQuestionIds = Array.isArray(existing?.questions)
		? existing.questions
		: [];

	// Parent nesting (Math → Addition). The picker already excludes the
	// edited category and its subtree; this is the backstop (plus the
	// server's own cycle guard).
	const parentSelect = document.getElementById('categoryParent');
	const parentVal = parentSelect ? String(parentSelect.value || '') : '';
	const prevParent = existing ? getCategoryParentId(existing) : '';
	if (parentVal && currentCategoryId) {
		const forbidden = new Set([String(currentCategoryId)]);
		for (const id of getCategoryDescendantIds(currentCategoryId)) {
			forbidden.add(String(id));
		}
		if (forbidden.has(parentVal)) {
			showToast(
				'A category cannot live inside itself or its own subcategories',
				'error',
			);
			return;
		}
	}

	// Authorship is immutable: editing a category (even as an admin) must
	// never reattribute someone else's category to the editor. Preserve the
	// previously recorded author across both vocabularies (`created_by` is
	// what the server stamps; `ownerId` is what legacy rows carry).
	const prevAuthor = currentCategoryId
		? getCategoryAuthorId(
				categories.find((c) => c.id === currentCategoryId),
			)
		: '';
	const authorId =
		prevAuthor || window.Auth?.getCurrentUser?.()?.id || '';

	const categoryData = {
		id: currentCategoryId || generateUUID(),
		name: name,
		description: description || '',
		color: color,
		questions: assignedQuestionIds,
		questionCount: existing?.questionCount ?? assignedQuestionIds.length,
		dateCreated: currentCategoryId
			? categories.find((c) => c.id === currentCategoryId)?.dateCreated ||
				new Date().toISOString()
			: new Date().toISOString(),
		isSystem: false,
		ownerId: authorId,
		created_by: authorId,
		parent_id: parentVal || null,
		parentId: parentVal || null,
	};

	// ── Persist to the backend FIRST ─────────────────────────────────────────
	// The server owns the canonical id. We send only the persistable fields
	// (name/color/icon/parent_id) — description/questionCount/ownerId are
	// legacy UI-only fields the schema strips anyway.
	if (window.API && typeof window.API.create === 'function') {
		try {
			const payload = { name: categoryData.name };
			if (categoryData.color) payload.color = categoryData.color;
			if (categoryData.icon) payload.icon = categoryData.icon;
			// Nesting: set the parent, or explicitly clear it when an edited
			// category moves back to top-level (the API mapper forwards an
			// explicit null; an absent key leaves the server value untouched).
			if (parentVal) payload.parent_id = parentVal;
			else if (currentCategoryId && prevParent) payload.parent_id = null;
			let saved = null;
			if (currentCategoryId) {
				saved = await window.API.update(
					'categories',
					currentCategoryId,
					payload,
				);
			} else {
				saved = await window.API.create('categories', payload);
			}
			if (saved && saved.id) {
				categoryData.id = saved.id;
			}
			// Adopt the server's canonical parent alongside its id/author so
			// the local mirror never disagrees with the DB.
			if (saved && (saved.parent_id !== undefined || saved.parentId !== undefined)) {
				const serverParent = saved.parent_id ?? saved.parentId ?? null;
				categoryData.parent_id = serverParent;
				categoryData.parentId = serverParent;
			}
			// The server is authoritative for authorship: adopt whatever it
			// stamped so the local mirror never disagrees with the DB (and a
			// teacher's category can never display the editing admin as its
			// creator).
			const serverAuthor =
				(saved &&
					(saved.created_by || saved.creator_id || saved.ownerId)) ||
				'';
			if (serverAuthor) {
				categoryData.created_by = String(serverAuthor);
				categoryData.ownerId = String(serverAuthor);
			}
		} catch (apiErr) {
			console.warn('[categories] API save failed:', apiErr);
			showToast(
				'Failed to save category on server: ' +
					(apiErr?.message || 'network error'),
				'error',
			);
			return;
		}
	}

	if (currentCategoryId) {
		const index = categories.findIndex((c) => c.id === currentCategoryId);
		if (index !== -1) {
			categories[index] = categoryData;
		}
	} else {
		categories.push(categoryData);
	}

	// Persist the training-mode flag (settings-row store, public so
	// student devices resolve the same training pool).
	const trainingChecked =
		document.getElementById('categoryTraining')?.checked === true;
	await setCategoryTraining(categoryData.id, trainingChecked);

	// NOW save categories and update UI (counts will be correct now)
	saveCategories();
	updateCategoryList();
	loadCategoriesIntoSelect();
	loadCategoriesIntoFilters();

	closeCategoryModal();
	showToast('Category saved successfully!');

	// Log activity
	if (typeof logActivity === 'function') {
		logActivity(
			'category',
			categoryData.name,
			currentCategoryId ? 'edited' : 'created',
			{
				id: categoryData.id,
				questionCount: categoryData.questionCount,
			},
		);
	}
}

// Initialize Color Picker
function initColorPicker() {
	const container = document.getElementById('colorSwatches');
	if (!container) return;

	container.innerHTML = '';

	// Use default colors or fallback
	const colors =
		typeof DEFAULT_CATEGORY_COLORS !== 'undefined'
			? DEFAULT_CATEGORY_COLORS
			: [
					'#3b82f6',
					'#ef4444',
					'#22c55e',
					'#eab308',
					'#a855f7',
					'#ec4899',
					'#6366f1',
					'#f97316',
					'#14b8a6',
					'#06b6d4',
					'#6b7280',
				];

	colors.forEach((color) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'color-swatch-btn';
		btn.style.backgroundColor = color;
		btn.onclick = () => selectColorSwatch(color);
		container.appendChild(btn);
	});
}

function selectColorSwatch(color) {
	const input = document.getElementById('categoryColor');
	if (input) {
		input.value = color;
	}

	// Update UI
	document.querySelectorAll('.color-swatch-btn').forEach((btn) => {
		if (
			btn.style.backgroundColor === color ||
			(color.startsWith('#') &&
				rgbToHex(btn.style.backgroundColor) === color.toLowerCase())
		) {
			btn.classList.add('active');
		} else {
			btn.classList.remove('active');
		}
	});
}

// Helper to handle RGB to Hex comparison if needed
function rgbToHex(rgb) {
	if (!rgb || rgb.startsWith('#')) return rgb;
	const sep = rgb.indexOf(',') > -1 ? ',' : ' ';
	const rgbVals = rgb.substr(4).split(')')[0].split(sep);
	let r = (+rgbVals[0]).toString(16),
		g = (+rgbVals[1]).toString(16),
		b = (+rgbVals[2]).toString(16);
	if (r.length == 1) r = '0' + r;
	if (g.length == 1) g = '0' + g;
	if (b.length == 1) b = '0' + b;
	return '#' + r + g + b;
}

function openCategoryModal() {
	// Show modal first (same is-open pattern as exam / class modals so the
	// dialog gets the single-scroll overlay + content styling).
	const modal = document.getElementById('categoryModal');
	if (modal) {
		promoteCategoryModal(modal);
		modal.classList.add('is-open');
		modal.setAttribute('aria-hidden', 'false');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('role', 'dialog');
		document.documentElement.classList.add('modal-open');
		document.body.classList.add('modal-open');
		setTimeout(() => {
			modal.classList.add('active');
			document.getElementById('categoryName')?.focus();
		}, 10);
	}

	// Initialize color picker logic
	initColorPicker();

	// Set initial color state
	const currentColor = document.getElementById('categoryColor').value;
	selectColorSwatch(currentColor);
}

function setupCategoryModalFilters() {
	const searchInput = document.getElementById('questionSearchCategory');
	const typeFilter = document.getElementById('questionFilterCategory');
	const categoryFilter = document.getElementById('categoryFilterCategory');
	const difficultyFilter = document.getElementById('difficultyFilterCategory');
	const pointFilterMin = document.getElementById('pointFilterCategoryMin');
	const pointFilterMax = document.getElementById('pointFilterCategoryMax');

	if (searchInput && !searchInput.dataset.listenerAttached) {
		searchInput.addEventListener('input', debounceFilterCategoryQuestions);
		searchInput.dataset.listenerAttached = 'true';
	}
	if (typeFilter && !typeFilter.dataset.listenerAttached) {
		typeFilter.addEventListener('change', filterCategoryQuestionsEnhanced);
		typeFilter.dataset.listenerAttached = 'true';
	}
	if (categoryFilter && !categoryFilter.dataset.listenerAttached) {
		categoryFilter.addEventListener('change', filterCategoryQuestionsEnhanced);
		categoryFilter.dataset.listenerAttached = 'true';
	}
	if (difficultyFilter && !difficultyFilter.dataset.listenerAttached) {
		difficultyFilter.addEventListener(
			'change',
			filterCategoryQuestionsEnhanced,
		);
		difficultyFilter.dataset.listenerAttached = 'true';
	}
	if (pointFilterMin && !pointFilterMin.dataset.listenerAttached) {
		pointFilterMin.addEventListener('input', debounceFilterCategoryQuestions);
		pointFilterMin.dataset.listenerAttached = 'true';
	}
	if (pointFilterMax && !pointFilterMax.dataset.listenerAttached) {
		pointFilterMax.addEventListener('input', debounceFilterCategoryQuestions);
		pointFilterMax.dataset.listenerAttached = 'true';
	}
}

function closeCategoryModal() {
	const modal = document.getElementById('categoryModal');
	if (modal) {
		modal.style.setProperty('display', 'none', 'important');
		[
			'position',
			'inset',
			'z-index',
			'opacity',
			'visibility',
			'pointer-events',
		].forEach((property) => modal.style.removeProperty(property));
		modal.classList.remove('active', 'is-open');
		modal.setAttribute('aria-hidden', 'true');
		modal.removeAttribute('aria-modal');
		modal.removeAttribute('role');
		document.documentElement.classList.remove('modal-open');
		document.body.classList.remove('modal-open');
	}

	// Clear form
	document.getElementById('categoryForm').reset();
}

function promoteCategoryModal(modal) {
	if (modal.parentElement !== document.body) {
		document.body.appendChild(modal);
	}

	const profileMenu = document.getElementById('profileMenu');
	if (profileMenu) profileMenu.classList.remove('active');

	modal.style.setProperty('display', 'flex', 'important');
	modal.style.setProperty('position', 'fixed', 'important');
	modal.style.setProperty('inset', '0', 'important');
	modal.style.setProperty('z-index', '2147483000', 'important');
	modal.style.setProperty('opacity', '1', 'important');
	modal.style.setProperty('visibility', 'visible', 'important');
	modal.style.setProperty('pointer-events', 'auto', 'important');
}

// ============================================
// ASSIGN QUESTIONS MODAL (category ↔ questions)
// ============================================
// Question assignment was split out of the create/edit modal: the categories
// table's "Assign Questions" action opens this dedicated modal. The picker
// markup keeps its original element IDs (availableQuestionsCategory,
// selectedQuestionsListCategory, …) so the existing filter/toggle helpers
// keep working unchanged.

let assignCategoryQuestionsId = null;

function openAssignCategoryQuestions(categoryId) {
	const modal = document.getElementById('assignCategoryQuestionsModal');
	if (!modal) {
		showToast('Assign Questions modal not found', 'error');
		return;
	}

	// Resolve target category ('uncategorized' is a system pseudo-category)
	const isUncategorized = categoryId === 'uncategorized';
	const category = isUncategorized
		? { id: 'uncategorized', name: 'Uncategorized' }
		: categories.find((c) => c.id === categoryId);
	if (!category) {
		showToast('Category not found', 'error');
		return;
	}

	// Leaf-only filing: a category with subcategories cannot take questions
	// directly — assign them to one of its subcategories instead.
	if (!isUncategorized && !isLeafCategory(categoryId)) {
		showToast(
			`"${category.name}" has subcategories \u2014 assign questions to a subcategory instead`,
			'error',
		);
		return;
	}

	assignCategoryQuestionsId = categoryId;

	const titleEl = document.getElementById('assignCategoryQuestionsTitle');
	if (titleEl) titleEl.textContent = `Assign Questions \u2014 ${category.name}`;

	// Reset any previous state, then show the modal. Selected questions are
	// populated inside loadAvailableQuestionsForCategory from the questions'
	// current category value.
	selectedQuestionsForCategory = [];
	const selectedContainer = document.getElementById(
		'selectedQuestionsListCategory',
	);
	if (selectedContainer) selectedContainer.innerHTML = '';
	resetAssignCategoryFilters();
	resetAssignFiltersUI(modal);

	openAssignModalLike(modal, 'questionSearchCategory');

	setTimeout(() => {
		setupCategoryModalFilters();
		populateCategoryFilter();
		// This loader reads the repository synchronously, so preload selections
		// immediately after the available-question list has been rendered.
		loadAvailableQuestionsForCategory(false);
		preloadCategorySelectionFromRepo();
		updateCategoryQuestionCountsUI();
	}, 100);
}

function closeAssignCategoryQuestions() {
	const modal = document.getElementById('assignCategoryQuestionsModal');
	if (modal) {
		closeAssignModalLike(modal);
	}
	assignCategoryQuestionsId = null;
	selectedQuestionsForCategory = [];
	availableQuestionsForCategory = [];
}

function resetAssignCategoryFilters() {
	currentFilterForCategory = {
		search: '',
		type: 'all',
		category: '',
		difficulty: '',
		points: '',
	};
	window.quickFilterActiveForCategory = [];
	const ids = [
		'questionSearchCategory',
		'pointFilterCategoryMin',
		'pointFilterCategoryMax',
	];
	ids.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.value = '';
	});
	const selects = [
		['difficultyFilterCategory', ''],
		['categoryFilterCategory', ''],
		['questionFilterCategory', 'all'],
	];
	selects.forEach(([id, value]) => {
		const el = document.getElementById(id);
		if (el) el.value = value;
	});
}

// Seed the Selected column with questions currently belonging to the target
// category, mirroring what the old edit modal did after loading the bank.
function preloadCategorySelectionFromRepo() {
	if (!assignCategoryQuestionsId) return;
	const targetId = assignCategoryQuestionsId;
	const savedQuestions =
		window.__DI_CONTAINER__.repo.getAll_sync('questions') || [];
	const selectedContainer = document.getElementById(
		'selectedQuestionsListCategory',
	);
	if (!selectedContainer) return;

	savedQuestions.forEach((question, index) => {
		const belongs =
			targetId === 'uncategorized'
				? !question.category ||
					question.category === '' ||
					question.category === 'uncategorized'
				: question.category === targetId;
		if (!belongs) return;
		if (
			window.Auth?.canAccessItem &&
			!window.Auth.canAccessItem('question', question)
		)
			return;

		const questionType = getQuestionType(question);
		const content =
			typeof window.renderQuestionContent === 'function'
				? window.renderQuestionContent(
						question.question,
						question,
						questionType,
						question.options,
						question.image,
						true,
					)
				: escapeHtml(question.question || 'Question Text Missing');

		const item = document.createElement('div');
		item.className = 'question-item categorized selected';
		item.dataset.index = String(index);
		item.dataset.questionId = String(index);
		item.dataset.category = String(targetId);
		item.dataset.type = questionType;
		item.dataset.points = String(Number.parseFloat(question.points) || 1);
		item.style.display = 'block';
		item.onclick = () => removeQuestionFromCategoryAssignment(item);
		item.innerHTML = `<div class="question-content">${content}</div>`;
		selectedContainer.appendChild(item);
	});

	// Re-render the available side so pre-selected questions disappear from it
	loadAvailableQuestionsForCategory(true);
	updateCategoryQuestionCountsUI();
}

async function saveAssignCategoryQuestions() {
	if (!assignCategoryQuestionsId) return;
	const categoryId = assignCategoryQuestionsId;
	const category = categories.find((c) => c.id === categoryId);

	const selectedQuestionElements = document.querySelectorAll(
		'#selectedQuestionsListCategory .premium-question-item, #selectedQuestionsListCategory .question-item',
	);
	const assignedQuestionIds = Array.from(selectedQuestionElements).map((el) =>
		parseInt(el.dataset.questionId || el.dataset.index),
	);

	// Build the full new assignment map so a question moved to another category
	// is detached from its previous category and persisted to the server.
	const savedQuestions =
		window.__DI_CONTAINER__.repo.getAll_sync('questions') || [];
	const assignedSet = new Set(assignedQuestionIds);
	const originalCategories = savedQuestions.map((question) => question.category || question.categoryId || question.category_id || 'uncategorized');
	const changedQuestions = [];
	savedQuestions.forEach((question, index) => {
		const currentCategory = originalCategories[index];
		let nextCategory = currentCategory;
		if (currentCategory === categoryId && !assignedSet.has(index)) nextCategory = 'uncategorized';
		if (assignedSet.has(index)) nextCategory = categoryId;
		if (nextCategory === currentCategory) return;
		question.category = nextCategory;
		question.categoryId = nextCategory;
		question.category_id = nextCategory === 'uncategorized' ? null : nextCategory;
		changedQuestions.push(question);
	});
	if (!window.API?.raw && changedQuestions.length) {
		showToast('Question API is unavailable. Refresh the page and try again.', 'error');
		return;
	}
	const categoryRows = window.__DI_CONTAINER__.repo.getAll_sync('categories') || categories || [];
	const categoryById = new Map(categoryRows.map((entry) => [entry.id, entry]));
	// Recalculate category memberships from the complete question set.
	categoryById.forEach((entry, id) => {
		entry.questions = savedQuestions.reduce((ids, question, index) => {
			if ((question.category || question.categoryId || question.category_id || 'uncategorized') === id) ids.push(index);
			return ids;
		}, []);
		entry.questionCount = entry.questions.length;
	});

	try {
		for (const question of changedQuestions) {
			if (!question.id) {
				throw new Error('A selected question has no server record. Refresh the question list and try again.');
			}
			await window.API.raw('PATCH', `/questions/${encodeURIComponent(question.id)}`, {
				category_id: question.category === 'uncategorized' ? null : question.category,
			});
		}
	} catch (apiErr) {
		console.error('[categories] question category persistence failed:', apiErr);
		showToast(`Could not save category changes: ${apiErr?.message || 'server error'}`, 'error');
		return;
	}
	window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
	if (typeof window.__DI_CONTAINER__.repo.getAll_sync === 'function') {
		const latestCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories') || [];
		latestCategories.forEach((entry) => {
			entry.questions = savedQuestions.reduce((ids, question, index) => {
				if ((question.category || question.categoryId || question.category_id || 'uncategorized') === entry.id) ids.push(index);
				return ids;
			}, []);
			entry.questionCount = entry.questions.length;
		});
		window.__DI_CONTAINER__.repo.setAll_sync('categories', latestCategories);
	}

	// Keep the category row's cached counts in sync
	if (category) {
		category.questions = assignedQuestionIds;
		category.questionCount = assignedQuestionIds.length;
		saveCategories();
	}

	updateCategoryList();
	loadCategoriesIntoSelect();
	loadCategoriesIntoFilters();
	if (typeof window.updateQuestionList === 'function') {
		try {
			window.updateQuestionList();
		} catch (e) {
			/* optional */
		}
	}

	closeAssignCategoryQuestions();
	showToast(
		assignedQuestionIds.length
			? `${assignedQuestionIds.length} question(s) assigned successfully!`
			: 'Assignment cleared \u2014 no questions in this category.',
		'success',
	);

	if (typeof logActivity === 'function') {
		logActivity(
			'category',
			category?.name || categoryId,
			'assigned questions',
			{
				id: categoryId,
				questionCount: assignedQuestionIds.length,
			},
		);
	}
}

// Helper function to determine question type
function getQuestionType(question) {
	if (window.QuizTypes?.normalize)
		return window.QuizTypes.normalize(
			question.type || question.questionType,
			question,
		);
	if (question.type) return question.type;
	if (question.isDraggable) return 'draggable';
	return 'multiple-choice';
}

function assignQuestionsToUncategorized() {
	// The "Assign Questions to Uncategorized" entry point now opens the same
	// dedicated assign modal used by the table action.
	openAssignCategoryQuestions('uncategorized');
}

// Load questions for category assignment interface with premium question selection grid
function loadCategoryQuestions() {
	// This function is deprecated and replaced by loadAvailableQuestionsForCategory
	// Keeping it for backward compatibility
	loadAvailableQuestionsForCategory();
}

// ============================================
// CATEGORY MODAL - UI UPDATE FUNCTIONS
// ============================================

// Update category question counts in UI
function updateCategoryQuestionCountsUI() {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');

	// Calculate total available questions across ALL category folders (sum)
	let totalAvailable = 0;

	// Update category folder counts and sum up total available
	document
		.querySelectorAll('#availableQuestionsCategory .category-folder')
		.forEach((folder) => {
			const categoryId = folder.dataset.category;
			const allQuestionsInFolder = folder.querySelectorAll('.question-item');
			const questionsInFolder = allQuestionsInFolder.length;

			// Count only visible questions (not hidden with display:none)
			let availableInFolder = 0;
			allQuestionsInFolder.forEach((q) => {
				if (q.style.display !== 'none') {
					availableInFolder++;
				}
			});

			// Add to total sum
			totalAvailable += availableInFolder;

			// Update individual folder count display
			const countElement = folder.querySelector('.question-count');
			if (countElement) {
				countElement.textContent = `(${availableInFolder}/${questionsInFolder})`;
			}

			// Also update count-{categoryId} if it exists
			const categoryCountElement = document.getElementById(
				`count-${categoryId}`,
			);
			if (categoryCountElement) {
				categoryCountElement.textContent = availableInFolder;
			}
		});

	// Update the main available question count with the total sum
	const availableCountElement = document.getElementById(
		'availableQuestionCountCategory',
	);
	if (availableCountElement) {
		availableCountElement.textContent = totalAvailable;
	}

	// Update selected questions count and difficulty breakdown
	// Support both .premium-question-item and .question-item classes
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item',
	);
	const selectedCount = selectedQuestions.length;
	const selectedCountElement = document.getElementById(
		'selectedQuestionCountCategory',
	);
	if (selectedCountElement) {
		selectedCountElement.textContent = selectedCount;
	}

	const selectedPointsElement = document.getElementById(
		'selectedQuestionPointsCategory',
	);
	if (selectedPointsElement) {
		const totalPoints = Array.from(selectedQuestions).reduce(
			(sum, questionElement) => {
				const questionId = parseInt(
					questionElement.dataset.questionId || questionElement.dataset.index,
				);
				const fromData = Number.parseFloat(questionElement.dataset.points);
				const fromStorage = Number.parseFloat(
					savedQuestions[questionId]?.points,
				);
				return (
					sum +
					(Number.isFinite(fromData)
						? fromData
						: Number.isFinite(fromStorage)
							? fromStorage
							: 1)
				);
			},
			0,
		);
		selectedPointsElement.textContent = Number.isInteger(totalPoints)
			? String(totalPoints)
			: totalPoints.toFixed(1);
	}

	// Update total selected count
	const totalSelectedCountElement = document.getElementById(
		'totalSelectedCountCategory',
	);
	if (totalSelectedCountElement) {
		totalSelectedCountElement.textContent = selectedCount;
	}

	// Count by difficulty
	let easyCount = 0;
	let mediumCount = 0;
	let hardCount = 0;

	selectedQuestions.forEach((questionElement) => {
		// Support both data-question-id and data-index
		const questionId = parseInt(
			questionElement.dataset.questionId || questionElement.dataset.index,
		);
		const question = savedQuestions[questionId];
		if (question) {
			const difficulty = question.difficulty || 'medium';
			if (difficulty === 'easy') easyCount++;
			else if (difficulty === 'medium') mediumCount++;
			else if (difficulty === 'hard') hardCount++;
		}
	});

	// Update difficulty counts
	const easyElement = document.getElementById('easySelectedCountCategory');
	if (easyElement) easyElement.textContent = easyCount;

	const mediumElement = document.getElementById('mediumSelectedCountCategory');
	if (mediumElement) mediumElement.textContent = mediumCount;

	const hardElement = document.getElementById('hardSelectedCountCategory');
	if (hardElement) hardElement.textContent = hardCount;

	// Update bulk action buttons
	updateBulkActionButtonsForCategory();
}

// Create HTML for a single question (for folder display) - Premium version
function createPremiumQuestionHtmlForCategory(
	question,
	questionId,
	questionType,
	category,
	difficulty,
) {
	const questionContent = createCleanQuestionContent(
		question,
		questionType,
		category,
	);

	return `
        <div class="premium-question-item" data-question-id="${questionId}" data-question-type="${questionType}" data-difficulty="${difficulty}" data-points="${Number.parseFloat(question.points) || 1}" onclick="togglePremiumQuestionSelectionForCategory(this)">
            <div class="premium-question-header">
                <span class="premium-question-number">#${questionId + 1}</span>
                <div class="premium-question-title">${escapeHtml(question.question.substring(0, 50))}${question.question.length > 50 ? '...' : ''}</div>
                <div class="premium-question-actions">
                    <button class="premium-action-btn" onclick="event.stopPropagation(); previewQuestionForCategory(${questionId})" title="Preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="premium-question-preview">${escapeHtml(question.question.substring(0, 100))}${question.question.length > 100 ? '...' : ''}</div>
            <div class="premium-question-meta">
                <span class="premium-badge premium-type-badge">${questionType}</span>
                <span class="premium-badge premium-difficulty-badge premium-difficulty-${difficulty}">${difficulty}</span>
                <span class="premium-badge premium-category-badge">${escapeHtml(category.name)}</span>
            </div>
            ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-question-image">` : ''}
            <div class="premium-question-footer">
                <span class="premium-question-date">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    ${new Date(question.dateCreated || Date.now()).toLocaleDateString()}
                </span>
            </div>
        </div>
    `;
}

// Create premium question element for assigned questions
function createPremiumQuestionElementForCategory(
	question,
	questionId,
	questionType,
	category,
	difficulty,
	isAssigned,
) {
	const questionElement = document.createElement('div');
	questionElement.className = 'premium-question-item';
	questionElement.dataset.questionId = questionId;
	questionElement.dataset.questionType = questionType;
	questionElement.dataset.difficulty = difficulty;

	questionElement.innerHTML = `
        <div class="premium-question-header">
            <span class="premium-question-number">#${questionId + 1}</span>
            <div class="premium-question-title">${escapeHtml(question.question.substring(0, 50))}${question.question.length > 50 ? '...' : ''}</div>
            <div class="premium-question-actions">
                <button class="premium-action-btn" onclick="event.stopPropagation(); previewQuestionForCategory(${questionId})" title="Preview">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
                <button class="premium-action-btn" onclick="event.stopPropagation(); removeQuestionFromCategoryAssignment(${questionId})" title="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="premium-question-preview">${escapeHtml(question.question.substring(0, 100))}${question.question.length > 100 ? '...' : ''}</div>
        <div class="premium-question-meta">
            <span class="premium-badge premium-type-badge">${questionType}</span>
            <span class="premium-badge premium-difficulty-badge premium-difficulty-${difficulty}">${difficulty}</span>
            <span class="premium-badge premium-category-badge">${escapeHtml(category.name)}</span>
        </div>
        ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-question-image">` : ''}
        <div class="premium-question-footer">
            <span class="premium-question-date">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${new Date(question.dateCreated || Date.now()).toLocaleDateString()}
            </span>
        </div>
    `;

	return questionElement;
}

// Add event listeners for premium category headers
function addPremiumCategoryHeaderListeners() {
	// Initialize all folders as expanded by default, but don't toggle if already expanded
	document
		.querySelectorAll('#availableQuestionsCategory .premium-category-folder')
		.forEach((folder) => {
			const categoryId = folder.dataset.category;
			const content = folder.querySelector('.premium-category-content');

			// Only expand folders that are initially collapsed
			if (!content.classList.contains('expanded')) {
				content.classList.add('expanded');
				content.classList.remove('collapsed');
			}
		});
}

// Toggle premium category folder visibility for category modal
function togglePremiumCategoryFolderForCategory(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}

	const folder = document.querySelector(
		`#availableQuestionsCategory .premium-category-folder[data-category="${categoryId}"]`,
	);
	if (!folder) return;

	const content = folder.querySelector('.premium-category-content');
	const header = folder.querySelector('.premium-category-header');
	const isCollapsed = content.classList.contains('collapsed');

	if (isCollapsed) {
		content.classList.remove('collapsed');
		content.classList.add('expanded');
		header.classList.add('expanded');
	} else {
		content.classList.remove('expanded');
		content.classList.add('collapsed');
		header.classList.remove('expanded');
	}
}

// Select all questions in a category
function selectAllQuestionsInCategory(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}

	const categoryFolder = document.querySelector(
		`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`,
	);
	if (!categoryFolder) return;

	const questions = categoryFolder.querySelectorAll(
		'.question-item:not(.assigned)',
	);
	const selectAllBtn = categoryFolder.querySelector(
		'.category-action-btn.select-all',
	);

	// Check if all questions are already selected
	const allSelected = Array.from(questions).every((question) =>
		question.classList.contains('selected'),
	);

	questions.forEach((questionElement) => {
		if (allSelected) {
			questionElement.classList.remove('selected');
			// Remove from selected list if it's there
			const selectedQuestion = document.querySelector(
				`#selectedQuestions .question-item[data-question-id="${questionElement.dataset.questionId}"]`,
			);
			if (selectedQuestion) {
				selectedQuestion.remove();
			}
		} else {
			questionElement.classList.add('selected');
			assignQuestionToCategory(questionElement);
		}
	});

	// Mark category header as selected
	const header = categoryFolder.querySelector('.category-header');
	if (header) {
		header.classList.add('selected');
	}

	// Update button appearance and show toast
	if (allSelected) {
		selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
            </svg>
            <span class="btn-text">Select All</span>
        `;
		selectAllBtn.title = 'Select all questions in this category';
		showToast(
			`Deselected all questions in ${categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'}`,
			'info',
		);
	} else {
		selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span class="btn-text">Deselect All</span>
        `;
		selectAllBtn.title = 'Deselect all questions in this category';
		showToast(
			`Selected all questions in ${categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'}`,
			'success',
		);
	}

	updateCategoryQuestionCountsUI();
}

// Function to update category counts in the UI
function updateCategoryCounts() {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');

	// Update counts for each category
	categories.forEach((category) => {
		const categoryCount = savedQuestions.filter(
			(q) => q.category === category.id,
		).length;
		const countElement = document.getElementById(`count-${category.id}`);
		if (countElement) {
			countElement.textContent = categoryCount;
		}
	});

	// Update uncategorized count
	const uncategorizedCount = savedQuestions.filter(
		(q) => !q.category || q.category === 'uncategorized',
	).length;
	const uncategorizedElement = document.getElementById('count-uncategorized');
	if (uncategorizedElement) {
		uncategorizedElement.textContent = uncategorizedCount;
	}
}

// Function to update premium questions count specifically
function updatePremiumQuestionsCount() {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	const premiumCount = savedQuestions.filter(
		(q) => q.categoryId === 'premium',
	).length;
	const premiumElement = document.getElementById('count-premium');
	if (premiumElement) {
		premiumElement.textContent = `(${premiumCount}/${savedQuestions.filter((q) => q.categoryId === 'premium').length})`;
	}
}

function processSelectedQuestions(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}

	const categoryFolder = document.querySelector(
		`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`,
	);
	if (!categoryFolder) return;

	const selectedQuestions = categoryFolder.querySelectorAll(
		'.question-item.selected',
	);

	if (selectedQuestions.length === 0) {
		showToast('Please select at least one question', 'error');
		return;
	}

	// Move selected questions to the selected questions container
	const selectedContainer = document.getElementById('selectedQuestions');
	if (!selectedContainer) {
		console.error('Selected questions container not found');
		return;
	}

	selectedQuestions.forEach((question) => {
		// Clone the question element to avoid removing from original
		const questionClone = question.cloneNode(true);
		questionClone.classList.add('selected');

		// Add remove functionality
		questionClone.onclick = () => removeQuestionFromSelection(questionClone);

		// Add to selected container
		selectedContainer.appendChild(questionClone);

		// Remove from original container
		question.remove();
	});

	// Update question counts
	updateCategoryQuestionCountsUI();

	// Show success toast
	showToast(
		`Moved ${selectedQuestions.length} question${selectedQuestions.length > 1 ? 's' : ''} to selected`,
		'success',
	);
}

function removeQuestionFromSelection(questionElement) {
	const questionId = questionElement.dataset.questionId;
	const originalCategory = questionElement.dataset.category;

	// Remove from selected container
	questionElement.remove();

	// Add back to original category
	const categoryFolder = document.querySelector(
		`#availableQuestionsCategory .category-folder[data-category="${originalCategory}"]`,
	);
	if (categoryFolder) {
		const questionsContainer = categoryFolder.querySelector(
			'.category-questions',
		);
		if (questionsContainer) {
			questionsContainer.appendChild(questionElement);
		}
	}

	// Update question counts
	updateCategoryQuestionCountsUI();

	showToast('Question moved back to available questions', 'info');
}

// ============================================
// CATEGORY MODAL - QUESTION SELECTION
// ============================================

// Toggle premium question selection for category modal
function togglePremiumQuestionSelectionForCategory(element) {
	const questionId = element.dataset.questionId;

	// Check if question is already in selected list
	const existingSelected = document.querySelector(
		`#selectedQuestionsListCategory .premium-question-item[data-question-id="${questionId}"]`,
	);

	if (existingSelected) {
		// If already selected, remove it from selected side and show in available side
		element.classList.remove('selected');
		element.style.display = 'block'; // Show the question in available side
		existingSelected.remove();
	} else {
		// If not selected, hide from available side and add to selected side
		element.classList.add('selected');
		element.style.display = 'none'; // Hide the question from available side
		const question = element.cloneNode(true);
		question.style.display = 'block'; // Ensure clone is visible
		question.onclick = () =>
			removePremiumQuestionFromCategoryAssignment(question);
		document
			.getElementById('selectedQuestionsListCategory')
			.appendChild(question);
	}

	updateCategoryQuestionCountsUI();
}

// Remove premium question from category assignment
function removePremiumQuestionFromCategoryAssignment(element) {
	const questionId = element.dataset.questionId;
	const availableQuestion = document.querySelector(
		`#availableQuestionsCategory .premium-question-item[data-question-id="${questionId}"]`,
	);
	if (availableQuestion) {
		availableQuestion.classList.remove('selected');
		availableQuestion.style.display = 'block'; // Show the question in available side
	}
	element.remove();
	updateCategoryQuestionCountsUI();
}

// Update bulk action buttons for category modal
function updateBulkActionButtonsForCategoryLegacy() {
	const selectedCount = document.querySelectorAll(
		'#selectedQuestionsListCategory .premium-question-item',
	).length;
	const availableCount = document.querySelectorAll(
		'#availableQuestionsCategory .premium-question-item',
	).length;

	document.getElementById('selectAllBtnForCategory').disabled =
		selectedCount >= availableCount;
	document.getElementById('deselectAllBtnForCategory').disabled =
		selectedCount === 0;
	document.getElementById('removeSelectedBtnForCategory').disabled =
		selectedCount === 0;

	// Update selected count
	document.getElementById('selectedQuestionCountCategory').textContent =
		selectedCount;
}

// Preview question for category modal
function previewQuestionForCategory(questionId) {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	const question = savedQuestions[questionId];

	if (!question) return;

	// Create a modal to preview the question
	const modal = document.createElement('div');
	modal.className = 'premium-preview-modal';
	modal.innerHTML = `
        <div class="premium-preview-modal-content">
            <div class="premium-preview-modal-header">
                <h3>Question Preview</h3>
                <button class="premium-preview-close" onclick="this.closest('.premium-preview-modal').remove()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="premium-preview-modal-body">
                <div class="premium-preview-question">
                    <h4>Question #${questionId + 1}</h4>
                    <p>${escapeHtml(question.question)}</p>
                    ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-preview-image">` : ''}
                </div>
                <div class="premium-preview-meta">
                    <span class="premium-badge premium-type-badge">${getQuestionType(question)}</span>
                    <span class="premium-badge premium-difficulty-badge premium-difficulty-${question.difficulty || 'medium'}">${question.difficulty || 'medium'}</span>
                    <span class="premium-badge premium-category-badge">${getCategoryName(question.category || 'uncategorized')}</span>
                </div>
            </div>
        </div>
    `;

	document.body.appendChild(modal);

	// Close modal on background click
	modal.addEventListener('click', (e) => {
		if (e.target === modal) {
			modal.remove();
		}
	});
}

function createCleanQuestionContent(question, questionType, category) {
	// Create category badge
	const categoryBadge = `
        <span class="category-badge" style="background-color: ${category.color}; color: white;">
            ${escapeHtml(category.name)}
        </span>
    `;

	// Determine question type display and class
	let questionTypeClass = 'multiple-choice-type';
	let questionTypeDisplay = 'Multiple Choice';

	if (questionType === 'draggable' || (question && question.isDraggable)) {
		questionTypeClass = 'draggable-type';
		questionTypeDisplay = 'Drag & Drop';
	} else if (questionType === 'odd-one-out') {
		questionTypeClass = 'odd-one-type';
		questionTypeDisplay = 'Odd One Out';
	} else if (questionType === 'matching-pairs') {
		questionTypeClass = 'matching-pairs-type';
		questionTypeDisplay = 'Matching Pairs';
	} else if (questionType === 'fill-blank') {
		questionTypeClass = 'fill-blank-type';
		questionTypeDisplay = 'Fill in the Blank';
	} else if (questionType === 'true-false') {
		questionTypeClass = 'true-false-type';
		questionTypeDisplay = 'True / False';
	} else if (questionType === 'code') {
		questionTypeClass = 'code-type';
		questionTypeDisplay = 'Code Snippet';
	}

	// Create type badge with proper styling
	const typeBadge = `
        <span class="type-badge ${questionTypeClass}">
            ${questionTypeDisplay}
        </span>
    `;

	// Create question content
	const questionText = escapeHtml(question.question || 'No question text');

	const content = `
        <div class="question-content">
            <div class="question-text">${questionText}</div>
            <div class="question-meta">
                ${categoryBadge}
                ${typeBadge}
            </div>
        </div>
    `;

	return content;
}

// Create question element for category assignment
function createQuestionElementForCategory(
	question,
	questionId,
	questionType,
	isAssigned,
) {
	const questionElement = document.createElement('div');
	questionElement.className = 'question-item';
	questionElement.dataset.questionId = questionId;
	questionElement.dataset.questionType = questionType;

	// Get category information
	const savedCategories =
		window.__DI_CONTAINER__.repo.getAll_sync('categories');
	const categoryId = question.category || 'uncategorized';
	const category = savedCategories.find(
		(cat) => cat.id === categoryId || cat.name === categoryId,
	) || { name: 'Uncategorized', color: '#9ca3af' };

	// Create clean question content without duplicating type badges
	const questionContent = createCleanQuestionContent(
		question,
		questionType,
		category,
	);

	questionElement.innerHTML = `
        <span class="question-number">#${questionId + 1}</span>
        ${questionContent}
        ${isAssigned ? '<button class="remove-btn" onclick="removeQuestionFromCategory(this)" title="Remove from category"><svg class="icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>' : ''}
    `;

	if (!isAssigned) {
		questionElement.addEventListener('click', () =>
			assignQuestionToCategory(questionElement),
		);
	}

	return questionElement;
}

// ============================================
// CATEGORY MODAL - QUESTION MOVEMENT FUNCTIONS (LEGACY - NOT USED)
// ============================================
// Note: These legacy functions are kept for backwards compatibility
// but are not actively used. The active functions are at line 1980+

// Legacy functions for compatibility
function assignQuestionToCategory(questionElement) {
	toggleQuestionSelection(questionElement);
}

function removeQuestionFromCategory(removeButton) {
	// Prevent event bubbling
	if (window.event) {
		window.event.stopPropagation();
	}

	const questionElement = removeButton.closest('.question-item');
	if (questionElement) {
		removeQuestionToAvailable(questionElement);
	}
}

// Legacy function - redirects to UI update function
function updateCategoryQuestionCounts() {
	updateCategoryQuestionCountsUI();
}

// Deprecated - keeping for backwards compatibility
function updateCategoryQuestionCountsLegacy() {
	const availableCount = document.querySelectorAll(
		'#availableQuestionsCategory .question-item',
	).length;
	const assignedCount = document.querySelectorAll(
		'#selectedQuestionsListCategory .question-item',
	).length;
	// Update section titles to match exam modal structure
	const selectedQuestionCountElement = document.getElementById(
		'selectedQuestionCount',
	);
	if (selectedQuestionCountElement) {
		selectedQuestionCountElement.textContent = assignedCount;
	}
}

// Setup category question filters
function setupCategoryQuestionFilters() {
	const searchInput = document.getElementById('categoryQuestionSearch');
	const filterSelect = document.getElementById('categoryQuestionFilter');

	if (searchInput) {
		searchInput.addEventListener('input', filterCategoryQuestions);
	}

	if (filterSelect) {
		filterSelect.addEventListener('change', filterCategoryQuestions);
	}
}

// Function to load categories into select elements
function loadCategoriesIntoSelect(selectElementId = 'category') {
	const selectElement = document.getElementById(selectElementId);
	if (!selectElement) return;

	// Get current value to preserve selection
	const currentValue = selectElement.value;

	// Clear existing options
	selectElement.innerHTML = '';

	// Add "Uncategorized" option first
	const uncategorizedOption = document.createElement('option');
	uncategorizedOption.value = 'uncategorized';
	uncategorizedOption.textContent = 'Uncategorized';
	selectElement.appendChild(uncategorizedOption);

	const visibleCategories = categories.filter((category) =>
		window.Auth?.canAccessItem
			? window.Auth.canAccessItem('category', category)
			: true,
	);

	// Hierarchical options, deepest level selectable: questions can only be
	// filed in categories without subcategories — parents are shown (indented)
	// but disabled so the structure stays visible.
	for (const { category, depth } of getOrderedCategoryTree(
		visibleCategories.filter((c) => !c.isSystem),
	)) {
		const option = document.createElement('option');
		option.value = category.id;
		const leaf = isLeafCategory(category.id);
		option.textContent =
			getIndentedCategoryLabel(category, depth) +
			(leaf ? '' : ' (has subcategories)');
		if (!leaf) {
			option.disabled = true;
			option.title =
				'Questions can only be filed in subcategories without children';
		}
		selectElement.appendChild(option);
	}

	// Restore previous selection if it still exists (a disabled option still
	// restores: the teacher sees where the question is filed and must pick a
	// subcategory to move it).
	if (
		currentValue &&
		selectElement.querySelector(`option[value="${currentValue}"]`)
	) {
		selectElement.value = currentValue;
	} else {
		// Default to Uncategorized if previous value is invalid or empty
		selectElement.value = 'uncategorized';
	}
}

// Function to load categories into modal filters (Exam and Category)
function loadCategoriesIntoFilters() {
	const filters = ['categoryFilterExam', 'categoryFilterCategory'];

	filters.forEach((filterId) => {
		const categoryFilter = document.getElementById(filterId);
		if (!categoryFilter) return;

		// Preserve current value
		const currentValue = categoryFilter.value;

		// Clear existing options
		categoryFilter.innerHTML = '';

		// Add "All Categories" option first
		const allOption = document.createElement('option');
		allOption.value = '';
		allOption.textContent = 'All Categories';
		categoryFilter.appendChild(allOption);

		// Add "Uncategorized" option
		const uncategorizedOption = document.createElement('option');
		uncategorizedOption.value = 'uncategorized';
		uncategorizedOption.textContent = 'Uncategorized';
		categoryFilter.appendChild(uncategorizedOption);

		const visibleCategories = categories.filter((category) =>
			window.Auth?.canAccessItem
				? window.Auth.canAccessItem('category', category)
				: true,
		);

		// Add categories to select (hierarchical labels)
		for (const { category, depth } of getOrderedCategoryTree(
			visibleCategories.filter((c) => !c.isSystem),
		)) {
			const option = document.createElement('option');
			option.value = category.id;
			option.textContent = getIndentedCategoryLabel(category, depth);
			categoryFilter.appendChild(option);
		}

		// Restore value if it still exists
		if (
			currentValue &&
			categoryFilter.querySelector(`option[value="${currentValue}"]`)
		) {
			categoryFilter.value = currentValue;
		}
	});
}

// ============================================
// CATEGORY ROW CELLS (single source of row markup)
// ============================================
function categoryToggleHtml(category, hasChildren, isCollapsed) {
	if (!hasChildren) return `<span class="cat-collapse-spacer"></span>`;
	return `<button type="button" class="cat-collapse-btn" onclick="toggleCategoryCollapse(event,'${category.id}')" title="${isCollapsed ? 'Expand subcategories' : 'Collapse subcategories'}" aria-expanded="${isCollapsed ? 'false' : 'true'}">${isCollapsed ? '+' : '−'}</button>`;
}

function categoryGripHtml(category) {
	if (category.isSystem || category.id === 'uncategorized') return '';
	return `<span class="drag-grip" data-id="${category.id}" title="Drag to nest \u2022 tap to pick up" onpointerdown="onGripPointerDown(event,'${category.id}')">\u22ee\u22ee</span>`;
}

// Identity cell: tree guides + toggle + grip + color + stacked name
// (title row with sub-count pill, ancestor breadcrumb underneath).
function categoryNameCellHtml(category, rowCtx, list) {
	const depth = rowCtx?.depth || 0;
	const guides =
		depth > 0
			? `<span class="cat-guides" aria-hidden="true">${'<i></i>'.repeat(depth)}</span>`
			: '';
	const childCount = getCategoryChildrenIds(category.id).length;
	const countPill = childCount
		? `<span class="cat-child-count" title="${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}">${childCount} sub</span>`
		: '';
	const breadcrumb = getCategoryParentPath(category.id, list);
	const path =
		rowCtx?.path ??
		(breadcrumb
			? `${breadcrumb} › ${category.name || ''}`
			: String(category.name || ''));
	return `
            <td>
                <div class="category-info" title="${escapeHtml(path)}">
                    ${guides}${categoryToggleHtml(category, !!rowCtx?.hasChildren, !!rowCtx?.isCollapsed)}${categoryGripHtml(category)}
                    <div class="category-color" style="background-color: ${category.color}"></div>
                    <span class="cat-text">
                        <span class="cat-title-row">
                            <span class="category-name">${escapeHtml(category.name)}</span>${countPill}
                        </span>
                        ${breadcrumb ? `<span class="cat-path">${escapeHtml(breadcrumb)}</span>` : ''}
                    </span>
                </div>
            </td>`;
}

function categoryTrainingCellHtml(category) {
	const trainingMap = getCategoryTrainingMap();
	const explicitTraining = Object.prototype.hasOwnProperty.call(
		trainingMap,
		String(category.id),
	);
	const effectiveTraining = isTrainingCategory(category.id);
	return `
            <td class="training-cell" data-label="Training">
                <input type="checkbox"
                    class="training-checkbox"
                    data-id="${category.id}"
                    ${effectiveTraining ? 'checked' : ''}
                    onchange="toggleCategoryTraining(this)"
                    title="${explicitTraining ? 'Use this category in training mode' : effectiveTraining ? 'Enabled via a parent category \u2014 uncheck to exclude this subcategory' : 'Use this category in training mode'}">
            </td>`;
}

function categoryActionsCellHtml(category, assignable) {
	if (moveModeCategoryId) {
		const moveActionHtml =
			String(category.id) === String(moveModeCategoryId)
				? `<button type="button" class="move-cancel-btn" onclick="cancelCategoryMove()" title="Cancel move">\u2715 Cancel</button>`
				: canDropCategoryOn(moveModeCategoryId, category.id)
					? `<button type="button" class="move-here-btn" onclick="finishCategoryMoveOnTap('${category.id}')" title="Move the category here">\u21e5 Move here</button>`
					: `<span class="no-actions" title="Cannot move here">\u2014</span>`;
		return `
            <td class="actions-cell">
                <div class="exam-actions">
                    ${moveActionHtml}
                </div>
            </td>`;
	}
	const moveButtonHtml =
		!category.isSystem && category.id !== 'uncategorized'
			? `<button class="exam-action-btn exam-move-btn" onclick="startCategoryMove(event,'${category.id}')" title="Move into another category">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 9l-3 3 3 3"></path>
                            <path d="M9 5l3-3 3 3"></path>
                            <path d="M15 19l-3 3-3-3"></path>
                            <path d="M19 9l3 3-3 3"></path>
                            <path d="M2 12h20"></path>
                            <path d="M12 2v20"></path>
                        </svg>
                    </button>`
			: '';
	return `
            <td class="actions-cell">
                <div class="exam-actions">
                    ${assignable ? `
                    <button class="exam-action-btn exam-assign-btn" onclick="openAssignCategoryQuestions('${category.id}')" title="Assign Questions">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 11l3 3L22 4"></path>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h11"></path>
                        </svg>
                    </button>
                    ` : `
                    <span class="no-actions" title="This category has subcategories \u2014 assign questions to a subcategory instead">\u2014</span>
                    `}
                    ${moveButtonHtml}
                    ${
											category.isSystem
												? `
                        <span class="no-actions" title="System category">\u2014</span>
                    `
												: `
                        <button class="exam-action-btn exam-edit-btn" onclick="editCategory('${category.id}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="exam-action-btn exam-delete-btn" onclick="deleteCategory('${category.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    `
										}
                </div>
            </td>`;
}

function updateCategoryList(categoriesList = categories) {
	const tbody = document.querySelector('#categoryList tbody');
	if (!tbody) return;

	// Get all questions from localStorage
	let savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	if (window.Auth?.canAccessItem) {
		savedQuestions = savedQuestions.filter((q) =>
			window.Auth.canAccessItem('question', q),
		);
	}

	if (window.TeacherFilter) {
		window.TeacherFilter.populate(
			'categoryTeacherFilter',
			'categoryTeacherFilterWrap',
			() => filterCategories(),
		);
	}
	const categoryTeacherScope = window.TeacherFilter
		? window.TeacherFilter.getSelectedTeacher('categoryTeacherFilter')
		: '';

	const visibleCategories = categoriesList.filter((category) => {
		if (
			window.Auth?.canAccessItem &&
			!window.Auth.canAccessItem('category', category)
		) {
			return false;
		}
		if (
			categoryTeacherScope &&
			window.TeacherFilter &&
			!window.TeacherFilter.matchesOwner(category, categoryTeacherScope)
		) {
			return false;
		}
		return true;
	});

	// Add "Uncategorized" category if it doesn't exist
	let uncategorizedExists = visibleCategories.some(
		(cat) => String(cat.name || '').toLowerCase() === 'uncategorized',
	);
	if (!uncategorizedExists) {
		visibleCategories.unshift({
			id: 'uncategorized',
			name: 'Uncategorized',
			color: '#9ca3af',
			questionCount: 0,
			dateCreated: new Date().toISOString(),
			isSystem: true,
		});
	}

	// Direct counts (id first, name as legacy fallback), then roll subtree
	// counts up into parents: "Math" shows Addition + Subtraction too.
	const visibleById = new Map(
		visibleCategories.map((c) => [String(c.id), c]),
	);
	visibleCategories.forEach((category) => {
		category.questionCount = 0;
	});
	savedQuestions.forEach((question) => {
		const ref =
			question.category ??
			question.categoryId ??
			question.category_id ??
			'';
		if (!ref || ref === 'uncategorized' || ref === 'Uncategorized') {
			const unc = visibleById.get('uncategorized');
			if (unc) unc.questionCount++;
			return;
		}
		const target = visibleById.get(String(ref));
		if (target) {
			target.questionCount++;
			return;
		}
		// Legacy name reference.
		const byName = visibleCategories.find(
			(c) => String(c.name || '') === String(ref),
		);
		if (byName) byName.questionCount++;
	});
	const hierarchyScope = visibleCategories.filter(
		(c) => c && !c.isSystem && c.id !== 'uncategorized',
	);
	const hierarchyOrder = getOrderedCategoryTree(hierarchyScope);
	for (let i = hierarchyOrder.length - 1; i >= 0; i--) {
		const child = hierarchyOrder[i].category;
		const parent = visibleById.get(getCategoryParentId(child));
		if (parent) {
			parent.questionCount =
				(parent.questionCount || 0) + (child.questionCount || 0);
		}
	}
	// Render order: system rows first (as before), then the tree pre-order
	// (roots sorted by the current sort control, children by name).
	const sortBy =
		document.getElementById('categorySortBy')?.value || 'name';
	const direction = categorySortDirection === 'asc' ? 1 : -1;
	const rootComparator = (a, b) => {
		switch (sortBy) {
			case 'date':
				return (
					direction * (new Date(b.dateCreated) - new Date(a.dateCreated))
				);
			case 'questions':
				return (
					direction * ((a.questionCount || 0) - (b.questionCount || 0))
				);
			case 'name':
			default:
				return (
					direction *
					String(a.name || '').localeCompare(String(b.name || ''))
				);
		}
	};
	const systemRows = visibleCategories.filter(
		(c) => c.isSystem || c.id === 'uncategorized',
	);
	// Flat render entries with depth: system rows first (as before), then the
	// tree pre-order (roots per the sort control, children by name).
	const renderEntries = [
		...systemRows.map((category) => ({ category, depth: 0 })),
		...getOrderedCategoryTree(hierarchyScope, rootComparator),
	];

	tbody.innerHTML = ''; // Clear existing rows

	// Collapse: rows below a collapsed ancestor are hidden (but still
	// rendered, so counts/filters stay consistent).
	let hiddenBelowDepth = -1;
	renderEntries.forEach((entry, index) => {
		const category = entry.category;
		const depth = entry.depth || 0;
		const hidden = hiddenBelowDepth >= 0 && depth > hiddenBelowDepth;
		if (!hidden) hiddenBelowDepth = -1;
		const next = renderEntries[index + 1];
		const hasChildren = !!next && (next.depth || 0) > depth;
		const isCollapsed =
			hasChildren && collapsedCategories.has(String(category.id));

		const row = document.createElement('tr');
		row.setAttribute('data-id', category.id);
		if (hidden) row.style.display = 'none';
		if (category.isSystem) {
			row.classList.add('system-category');
		}
		if (moveModeCategoryId) {
			if (String(category.id) === String(moveModeCategoryId)) {
				row.classList.add('moving-source');
			} else if (canDropCategoryOn(moveModeCategoryId, category.id)) {
				row.classList.add('move-target');
			}
		}
		// Mobile Action Handler via event listener
		row.addEventListener('click', (e) => {
			// Tap-to-move mode: any row tap picks the destination (controls
			// keep their own behavior; post-drag clicks are suppressed).
			if (Date.now() < suppressMoveTapUntil) return;
			if (moveModeCategoryId) {
				if (
					e.target.closest(
						'button, input, a, select, textarea, .drag-grip',
					)
				)
					return;
				e.stopPropagation();
				finishCategoryMoveOnTap(category.id);
				return;
			}
			if (window.innerWidth <= 768) {
				if (e.target.closest('button')) return;
				if (e.target.closest('.checkbox-cell') || e.target.type === 'checkbox') return;
				e.stopPropagation();
				MobileActionSheet.open(`Category: ${escapeHtml(category.name)}`, [
					{
						label: 'Assign Questions',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
						onClick: () => openAssignCategoryQuestions(category.id),
					},
					...(!category.isSystem
						? [
								{
									label: 'Move',
									icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"></path><path d="M9 5l3-3 3 3"></path><path d="M15 19l-3 3-3-3"></path><path d="M19 9l3 3-3 3"></path><path d="M2 12h20"></path><path d="M12 2v20"></path></svg>',
									onClick: () => startCategoryMove(null, category.id),
								},
								{
									label: 'Edit Category',
									icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
									onClick: () => editCategory(category.id),
								},
								{
									label: 'Delete Category',
									icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
									variant: 'danger',
									onClick: () => deleteCategory(category.id),
								},
							]
						: []),
				]);
			}
		});

		const path = depth
			? getCategoryPath(category.id, visibleCategories)
			: String(category.name || '');
		// Questions live in the deepest level only: rows with subcategories
		// cannot take questions directly (the Assign modal enforces this too).
		const assignable =
			category.isSystem ||
			category.id === 'uncategorized' ||
			isLeafCategory(category.id);
		const rowCtx = { depth, path, hasChildren, isCollapsed };

		row.innerHTML = `
            <td class="checkbox-cell" data-label="Select">
                <input type="checkbox"
                    class="category-checkbox"
                    data-id="${category.id}"
                    ${category.isSystem || category.id === 'uncategorized' ? 'disabled title="System category cannot be deleted"' : `onchange="toggleBulkRowSelection(this,'categories')"`}>
            </td>
            ${categoryNameCellHtml(category, rowCtx, visibleCategories)}
            <td>${escapeHtml(category.description || '')}</td>
            <td>${category.questionCount}</td>
            ${categoryTrainingCellHtml(category)}
            <td class="owner-col" data-label="By">${(() => { const label = getOwnerLabel(getCategoryAuthorId(category)); return label ? `<span class="q-owner-badge" title="Created by">${escapeHtml(label)}</span>` : ''; })()}</td>
            <td>${(() => {
							const rawCreatedAt =
								category.dateCreated ||
								category.created_at ||
								category.createdAt ||
								category.date_created;
							const parsedCreatedAt = rawCreatedAt
								? new Date(rawCreatedAt)
								: null;
							return parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
								? parsedCreatedAt.toLocaleDateString()
								: '-';
						})()}</td>
            ${categoryActionsCellHtml(category, assignable)}
        `;
		if (isTrainingCategory(category.id)) {
			row.classList.add('training-enabled');
		}
		// The grip drives the pointer system inline (onpointerdown) — no
		// per-row wiring needed, so re-renders stay cheap.
		tbody.appendChild(row);
		if (!hidden && isCollapsed) hiddenBelowDepth = depth;
	});

	// Owner badges are admin-only (see teacher-filter.js + hide-owner-col CSS).
	const categoryTable = document.getElementById('categoryList');
	if (categoryTable) {
		const admin = window.TeacherFilter
			? window.TeacherFilter.isAdminSession()
			: !!(window.Auth?.isAdmin && window.Auth.isAdmin());
		categoryTable.classList.toggle('hide-owner-col', !admin);
		categoryTable.classList.toggle('move-mode', !!moveModeCategoryId);
	}

	// If the row being moved vanished (bootstrap reload, delete elsewhere),
	// leave move mode instead of pointing at nothing.
	if (moveModeCategoryId && !getCategoryById(moveModeCategoryId)) {
		moveModeCategoryId = null;
	}
	renderMoveModeBanner();

	// Restore bulk selection (filter/sort safe) + refresh bulk bar
	if (window.BulkSelect) window.BulkSelect.restore('categories');

	// Add CSS for system categories if it doesn't exist
	if (!document.getElementById('system-category-styles')) {
		const styleElement = document.createElement('style');
		styleElement.id = 'system-category-styles';
		styleElement.textContent = `
            .system-category {
                opacity: 0.8;
                background-color: var(--bg-surface-alt);
            }
            .system-category .category-name {
                font-style: italic;
                color: var(--text-secondary);
            }
        `;
		document.head.appendChild(styleElement);
	}
}

function filterCategories() {
	if (window.TeacherFilter) {
		window.TeacherFilter.populate(
			'categoryTeacherFilter',
			'categoryTeacherFilterWrap',
			() => filterCategories(),
		);
	}
	const searchTerm = (
		document.getElementById('categorySearch').value || ''
	).toLowerCase();
	// Coerce to string defensively: categories merged from the API or imported
	// JSON may lack `description` (and even `name`), which used to crash the
	// filter with "Cannot read properties of undefined (reading 'toLowerCase')".
	const filteredCategories = categories.filter(
		(category) =>
			String(category.name || '')
				.toLowerCase()
				.includes(searchTerm) ||
			String(category.description || '')
				.toLowerCase()
				.includes(searchTerm),
	);
	// Keep hierarchy context: a match brings its ancestors (so the tree
	// renders in place) and its whole subtree (so "math" shows Addition…).
	const keep = new Set(filteredCategories.map((c) => String(c.id)));
	for (const category of filteredCategories) {
		for (const id of getCategoryAncestorIds(category.id, categories)) {
			keep.add(String(id));
		}
		for (const id of getCategoryDescendantIds(category.id, categories)) {
			keep.add(String(id));
		}
	}
	updateCategoryList(categories.filter((c) => c && keep.has(String(c.id))));
}

function sortCategories() {
	const sortBy = document.getElementById('categorySortBy').value;
	const direction = categorySortDirection === 'asc' ? 1 : -1;

	// Separate uncategorized from other categories
	const uncategorized = categories.filter(
		(c) => c.isSystem || c.id === 'uncategorized',
	);
	const otherCategories = categories.filter(
		(c) => !c.isSystem && c.id !== 'uncategorized',
	);

	// Sort only non-system categories
	otherCategories.sort((a, b) => {
		switch (sortBy) {
			case 'name':
				return direction * a.name.localeCompare(b.name);
			case 'date':
				return direction * (new Date(b.dateCreated) - new Date(a.dateCreated));
			case 'questions':
				return direction * (a.questionCount - b.questionCount);
			default:
				return 0;
		}
	});

	// Keep uncategorized at the top, then sorted categories
	categories = [...uncategorized, ...otherCategories];

	updateCategoryList();
}

function toggleCategorySortDirection() {
	categorySortDirection = categorySortDirection === 'desc' ? 'asc' : 'desc';

	const sortDirectionButton = document.getElementById('sortCategoryDirection');
	if (sortDirectionButton) {
		if (categorySortDirection === 'desc') {
			sortDirectionButton.classList.add('desc');
		} else {
			sortDirectionButton.classList.remove('desc');
		}
	}

	sortCategories();
}

function getCategorySelectOptions(selectedCategory = '') {
	return categories
		.map(
			(category) => `
        <option value="${category.id}" ${selectedCategory === category.id ? 'selected' : ''}>
            ${escapeHtml(category.name)}
        </option>
    `,
		)
		.join('');
}

function getCategoryName(categoryId) {
	const category = categories.find((c) => c.id === categoryId);
	return category ? category.name : 'Uncategorized';
}

function getCategoryColor(categoryId) {
	const category = categories.find((c) => c.id === categoryId);
	return category ? category.color : '#6b7280';
}

function getRandomCategoryColor() {
	const availableColors = DEFAULT_CATEGORY_COLORS.filter(
		(color) => !categories.some((cat) => cat.color === color),
	);

	if (availableColors.length === 0) {
		return DEFAULT_CATEGORY_COLORS[
			Math.floor(Math.random() * DEFAULT_CATEGORY_COLORS.length)
		];
	}

	return availableColors[Math.floor(Math.random() * availableColors.length)];
}

function exportCategories() {
	const dataStr = JSON.stringify(categories, null, 2);
	const dataUri =
		'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', 'quiz-categories.json');
	linkElement.click();
}

function importCategories() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (e) => {
		const file = e.target.files[0];
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const newCategories = JSON.parse(event.target.result);

				if (
					!Array.isArray(newCategories) ||
					!newCategories.every(isValidCategoryStructure)
				) {
					throw new Error('Invalid category data structure');
				}

				// Merge with existing categories, avoiding duplicates
				const existingCategories = [...categories];
				const mergedCategories = mergeCategories(
					existingCategories,
					newCategories,
				);

				window.__DI_CONTAINER__.repo.setAll_sync(
					'categories',
					mergedCategories,
				);
				categories = mergedCategories;
				updateCategoryList();
				updateQuestionCategoryCounts();
				showToast('Categories imported successfully!');
			} catch (error) {
				showToast('Error importing categories: ' + error.message, 'error');
			}
		};

		reader.readAsText(file);
	};

	input.click();
}

function isValidCategoryStructure(category) {
	return (
		category &&
		typeof category.id === 'string' &&
		typeof category.name === 'string' &&
		typeof category.description === 'string' &&
		typeof category.color === 'string' &&
		typeof category.questionCount === 'number' &&
		typeof category.dateCreated === 'string'
	);
}

function mergeCategories(existing, imported) {
	const categoryMap = new Map(existing.map((c) => [c.id, c]));

	imported.forEach((newCategory) => {
		if (!categoryMap.has(newCategory.id)) {
			categoryMap.set(newCategory.id, newCategory);
		}
	});

	return Array.from(categoryMap.values());
}

function setupCategoryEventListeners() {
	document
		.getElementById('categoryForm')
		.addEventListener('submit', function (e) {
			e.preventDefault();
			saveCategoryForm();
		});

	document
		.getElementById('categorySearch')
		.addEventListener('keyup', filterCategories);
}

// Helper function to safely escape HTML
function escapeHtml(unsafe) {
	if (unsafe === null || unsafe === undefined) {
		return '';
	}

	try {
		const safeStr = String(unsafe);
		return safeStr
			.replace(/&/g, '&amp;')
			.replace(/</g, '<')
			.replace(/>/g, '>')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	} catch (e) {
		console.error('Error in escapeHtml:', e);
		return '[Error: Could not convert to string]';
	}
}

function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c == 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// Initialize category management when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
	// Check if we're on the admin page and category management tab
	if (document.getElementById('categoryList')) {
		initCategoryManagement();
	}
});

window.addEventListener('quiz:bootstrap-ready', function () {
	if (!document.getElementById('categoryList')) return;
	loadCategories();
	updateQuestionCategoryCounts();
	updateCategoryList();
	loadCategoriesIntoSelect();
	loadCategoriesIntoFilters();
});

// Enhanced toggle category folder for uncategorized - select all questions when clicked
function toggleCategoryFolderWithSelectAll(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}

	const folder = document.querySelector(
		`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`,
	);
	if (!folder) return;

	const questionsContainer = folder.querySelector('.category-questions');
	const isCollapsed = folder.classList.contains('collapsed');

	if (isCollapsed) {
		questionsContainer.style.display = 'block';
		folder.classList.remove('collapsed');

		// If this is the uncategorized folder, select all questions
		if (categoryId === 'uncategorized') {
			const questions = questionsContainer.querySelectorAll(
				'.question-item:not(.assigned)',
			);
			questions.forEach((questionElement) => {
				if (!questionElement.classList.contains('selected')) {
					assignQuestionToCategory(questionElement);
				}
			});
		}
	} else {
		questionsContainer.style.display = 'none';
		folder.classList.add('collapsed');
	}
}

// Load available questions for category assignment (Premium version)
// ============================================
// CATEGORY MODAL - LOAD & RENDER QUESTIONS
// ============================================

function loadAvailableQuestionsForCategory(keepSelection = true) {
	const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	const questions = savedQuestions || [];
	const container = document.getElementById('availableQuestionsCategory');
	const selectedContainer = document.getElementById(
		'selectedQuestionsListCategory',
	);

	console.log('Loading questions for category modal...');
	console.log('Total questions:', questions.length);
	console.log('Current category ID:', currentCategoryId);

	if (!container) {
		console.error('Container "availableQuestionsCategory" not found');
		return;
	}

	if (questions.length === 0) {
		container.innerHTML =
			'<div class="premium-no-questions-state"><h3>No Questions Available</h3><p>Please create some questions first in the Questions tab.</p></div>';
		if (selectedContainer) selectedContainer.innerHTML = '';
		return;
	}

	// Get categories for display
	const savedCategories =
		window.__DI_CONTAINER__.repo.getAll_sync('categories');
	const categoryMap = new Map();
	savedCategories.forEach((cat) => {
		if (!cat) return;
		if (cat.id) categoryMap.set(cat.id, cat);
		if (cat.name) categoryMap.set(cat.name, cat);
	});
	const quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');

	// FIRST: Preserve currently selected questions before reloading
	// Get selected question IDs from DOM BEFORE clearing anything
	let selectedQuestionIds = [];

	if (keepSelection) {
		const currentlySelectedQuestions = document.querySelectorAll(
			'#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item',
		);
		const preservedSelections = Array.from(currentlySelectedQuestions).map(
			(el) => {
				const id = parseInt(el.dataset.questionId || el.dataset.index);
				return { id, element: el.cloneNode(true) };
			},
		);

		console.log('Current category ID:', currentCategoryId);
		console.log(
			'Currently selected questions count:',
			currentlySelectedQuestions.length,
		);
		console.log('Preserved selections:', preservedSelections.length);

		// ALWAYS preserve current selections when refreshing (don't reload from localStorage)
		selectedContainer.innerHTML = '';
		selectedQuestionIds = preservedSelections.map((s) => s.id);

		// Re-add preserved selections with proper event handlers
		preservedSelections.forEach(({ id, element }) => {
			// Re-attach the onclick handler since cloneNode doesn't copy event listeners
			element.onclick = () => removeQuestionFromCategoryAssignment(element);
			selectedContainer.appendChild(element);
		});

		console.log(
			'Restored selections after refresh:',
			selectedQuestionIds.length,
		);
	} else {
		// If not keeping selection, just clear the container
		selectedContainer.innerHTML = '';
		console.log('Selection cleared, not preserving.');
	}

	// Group questions by category (normalize ID vs name)
	const questionsByCategory = {};
	questions.forEach((q, index) => {
		if (
			window.Auth?.canAccessItem &&
			!window.Auth.canAccessItem('question', q)
		) {
			return;
		}
		const rawCategory = q.category || 'uncategorized';
		const resolvedCategory = categoryMap.get(rawCategory);
		const categoryId = resolvedCategory?.id || rawCategory || 'uncategorized';
		if (!questionsByCategory[categoryId]) {
			questionsByCategory[categoryId] = [];
		}
		questionsByCategory[categoryId].push({
			question: q,
			index,
			categoryName: resolvedCategory?.name || rawCategory,
		});
	});

	console.log(
		'Questions grouped by category:',
		Object.keys(questionsByCategory),
	);
	console.log(
		'Category groups:',
		Object.keys(questionsByCategory).map((catId) => ({
			id: catId,
			count: questionsByCategory[catId].length,
		})),
	);

	// Build HTML with category grouping (Premium style)
	let html = '';
	let hasVisibleQuestions = false;

	// Filter logic
	const categoryFilter = document.getElementById('categoryFilterCategory');
	const selectedFilterId = categoryFilter ? categoryFilter.value : '';

	const typeFilter = document.getElementById('questionFilterCategory');
	const selectedType = typeFilter ? typeFilter.value : 'all';

	const difficultyFilter = document.getElementById('difficultyFilterCategory');
	const selectedDifficulty = difficultyFilter ? difficultyFilter.value : '';

	const pointFilterMin = document.getElementById('pointFilterCategoryMin');
	const pointFilterMax = document.getElementById('pointFilterCategoryMax');
	const selectedPointsMin = pointFilterMin ? pointFilterMin.value : '';
	const selectedPointsMax = pointFilterMax ? pointFilterMax.value : '';

	// Search logic
	const searchInput = document.getElementById('questionSearchCategory');
	const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

	Object.keys(questionsByCategory).forEach((categoryId) => {
		// Apply category filter
		if (
			selectedFilterId &&
			!['recent', 'unused', 'popular'].includes(selectedFilterId) &&
			categoryId !== selectedFilterId
		) {
			return;
		}

		const categoryQuestions = questionsByCategory[categoryId];
		const isSpecialFilter = ['recent', 'unused', 'popular'].includes(
			selectedFilterId,
		);
		// Apply search and other filters
		const filteredCategoryQuestions = categoryQuestions.filter(
			({ question, index }) => {
				// Safety check for question object
				if (!question) return false;

				// Search filter
				if (searchTerm) {
					const qText = question.question || '';
					if (!qText.toLowerCase().includes(searchTerm)) return false;
				}

				// Type filter
				if (selectedType && selectedType !== 'all') {
					const qType = getQuestionType(question);
					if (qType !== selectedType) return false;
				}

				// Difficulty filter
				if (
					selectedDifficulty &&
					selectedDifficulty !== 'all' &&
					question.difficulty !== selectedDifficulty
				) {
					return false;
				}

				if (selectedPointsMin || selectedPointsMax) {
					const points = Number.parseFloat(question.points) || 1;
					const min = selectedPointsMin
						? Number.parseFloat(selectedPointsMin)
						: 0;
					const max = selectedPointsMax
						? Number.parseFloat(selectedPointsMax)
						: Infinity;
					if (points < min || points > max) return false;
				}

				// Special category filters (recent, unused, popular)
				if (isSpecialFilter) {
					if (selectedFilterId === 'recent') {
						const totalQuestions = questions.length;
						const recentThreshold = Math.floor(totalQuestions * 0.75);
						if (index < recentThreshold) return false;
					}
					if (selectedFilterId === 'unused') {
						const isUsed =
							question.used === true ||
							quizResults.some(
								(result) =>
									result.questions && result.questions.includes(index),
							);
						if (isUsed) return false;
					}
					if (selectedFilterId === 'popular') {
						const usageCount = quizResults.filter(
							(result) => result.questions && result.questions.includes(index),
						).length;
						if (usageCount === 0 && question.popular !== true) return false;
					}
				}

				// Quick filters (AND logic)
				if (
					window.quickFilterActiveForCategory &&
					Array.isArray(window.quickFilterActiveForCategory) &&
					window.quickFilterActiveForCategory.length > 0
				) {
					const matchesQuickFilter = window.quickFilterActiveForCategory.every(
						(filterType) => {
							switch (filterType) {
								case 'recent': {
									const totalQuestions = questions.length;
									const recentThreshold = Math.floor(totalQuestions * 0.75);
									return index >= recentThreshold;
								}
								case 'hard':
									return question.difficulty === 'hard';
								case 'unused': {
									const isUsed =
										question.used === true ||
										quizResults.some(
											(result) =>
												result.questions && result.questions.includes(index),
										);
									return !isUsed;
								}
								case 'popular': {
									const usageCount = quizResults.filter(
										(result) =>
											result.questions && result.questions.includes(index),
									).length;
									return usageCount > 0 || question.popular === true;
								}
								default:
									return true;
							}
						},
					);

					if (!matchesQuickFilter) return false;
				}

				return true;
			},
		);

		console.log(
			` Category ${categoryId}: ${categoryQuestions.length} total, ${filteredCategoryQuestions.length} matching search`,
		);

		// If no questions match search, skip this category
		if (filteredCategoryQuestions.length === 0) return;

		// Find category object - ensure savedCategories exists
		const category = categoryMap.get(categoryId) ||
			(savedCategories &&
				savedCategories.find(
					(cat) => cat.id === categoryId || cat.name === categoryId,
				)) || {
				name: 'Uncategorized',
				color: '#9ca3af',
				id: 'uncategorized',
			};

		// Filter out already selected questions from the SEARCH FILTERED list
		const availableQuestions = filteredCategoryQuestions.filter(
			({ index }) => !selectedQuestionIds.includes(index),
		);

		console.log(`  Available to render: ${availableQuestions.length}`);

		// Only show category if it has available questions
		if (availableQuestions.length > 0) {
			hasVisibleQuestions = true;
			console.log(`  -> Rendering category "${category.name}"`);

			html += `
            <div class="category-folder" data-category="${categoryId}">
                <div class="category-header" onclick="toggleCategoryFolderForCategoryModal('${categoryId}')">
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="category-name">${escapeHtml(category.name)}</span>
                    <span class="question-count">(${availableQuestions.length}/${categoryQuestions.length})</span>
                    <div class="category-header-actions">
                        <button type="button" class="category-action-btn move-all-btn" onclick="event.stopPropagation(); selectAllQuestionsInCategoryForCategory('${categoryId}'); return false;" title="Select all">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="category-questions" id="questions-${categoryId}">
            `;

			// Add questions in this category (only available ones that are NOT selected)
			availableQuestions.forEach(({ question, index }) => {
				const questionType = getQuestionType(question);

				// Render content using global helper or fallback
				const content =
					typeof window.renderQuestionContent === 'function'
						? window.renderQuestionContent(
								question.question,
								question,
								questionType,
								question.options,
								question.image,
								true,
							)
						: escapeHtml(question.question || 'Question Text Missing');

				html += `
                <div class="question-item categorized" data-index="${index}" data-draggable="${question.isDraggable || false}" data-category="${categoryId}" data-type="${questionType}" data-points="${Number.parseFloat(question.points) || 1}" onclick="toggleQuestionSelectionForCategory(this)" style="display: block;">
                    <div class="question-content">
                        ${content}
                    </div>
                </div>
                `;
			});

			html += `
                </div>
            </div>
            `;
		}
	});

	// Show empty state if no questions are available and no filters are active
	if (!hasVisibleQuestions) {
		// Check if any filters are active
		const searchInput = document.getElementById('questionSearchCategory');
		const typeFilter = document.getElementById('questionFilterCategory');
		const categoryFilter = document.getElementById('categoryFilterCategory');
		const difficultyFilter = document.getElementById(
			'difficultyFilterCategory',
		);

		const isSearchActive = searchInput && searchInput.value.trim() !== '';
		const isTypeFilterActive = typeFilter && typeFilter.value !== 'all';
		const isCategoryFilterActive =
			categoryFilter && categoryFilter.value !== '';
		const isDifficultyFilterActive =
			difficultyFilter &&
			difficultyFilter.value !== '' &&
			difficultyFilter.value !== 'all';
		const isQuickFilterActive =
			window.quickFilterActiveForCategory &&
			Array.isArray(window.quickFilterActiveForCategory) &&
			window.quickFilterActiveForCategory.length > 0;

		if (
			isSearchActive ||
			isTypeFilterActive ||
			isCategoryFilterActive ||
			isDifficultyFilterActive ||
			isQuickFilterActive
		) {
			// Show filter results message instead of empty state when filters are active
			let message = 'No questions found matching your criteria.';

			// Add specific filter information
			const filters = [];
			if (isSearchActive) filters.push(`search: "${searchInput.value}"`);
			if (isTypeFilterActive) filters.push(`type: ${typeFilter.value}`);
			if (isCategoryFilterActive) {
				const savedCategories =
					window.__DI_CONTAINER__.repo.getAll_sync('categories');
				const categoryName =
					savedCategories.find((c) => c.id === categoryFilter.value)?.name ||
					categoryFilter.value;
				filters.push(`category: ${categoryName}`);
			}
			if (isDifficultyFilterActive)
				filters.push(`difficulty: ${difficultyFilter.value}`);
			if (isQuickFilterActive)
				filters.push(
					`quick: ${window.quickFilterActiveForCategory.join(', ')}`,
				);

			if (filters.length > 0) {
				message += ` Applied filters: ${filters.join(', ')}.`;
			}

			message += ' Try adjusting your search or filters.';

			html = `
            <div class="filter-results-message">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <path d="M8 11h6"></path>
                </svg>
                <h3>No Results Found</h3>
                <p>${message}</p>
                <button onclick="clearAllCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
            </div>
            `;
		} else {
			// Show regular empty state when no filters are active
			html = `
            <div class="premium-no-questions-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path>
                    <rect x="9" y="3" width="6" height="4" rx="2"></rect>
                </svg>
                <h3>No Available Questions</h3>
                <p>All questions have been selected or there are no questions available.</p>
            </div>
            `;
		}
	}

	window.safeSetHTML
		? window.safeSetHTML(container, html, true)
		: (container.innerHTML = html);

	// Update counts
	updateCategoryQuestionCountsUI();
	updateBulkActionButtonsForCategory();
}

// ============================================
// CATEGORY MODAL - BULK ACTIONS
// ============================================

// Refresh available questions for category
function refreshAvailableQuestionsForCategory() {
	loadAvailableQuestionsForCategory();
	showToast('Questions refreshed!', 'success');
}

// Clear all selected questions for category
function clearAllSelectedForCategory() {
	if (confirm('Are you sure you want to clear all selected questions?')) {
		const selectedQuestions = document.querySelectorAll(
			'#selectedQuestionsListCategory .question-item',
		);
		selectedQuestions.forEach((question) => {
			const questionId = question.dataset.index;
			const questionCategory = question.dataset.category;

			// Show the question back in the available side
			const availableQuestion = document.querySelector(
				`#availableQuestionsCategory .question-item[data-index="${questionId}"]`,
			);
			if (availableQuestion) {
				availableQuestion.style.display = 'block';
				availableQuestion.classList.remove('selected');
			}

			// Remove from selected list
			question.remove();
		});

		// Update all counts
		updateCategoryQuestionCountsUI();
		updateBulkActionButtonsForCategory();

		showToast('All selections cleared', 'info');
	}
}

// Select all available for category
function selectAllAvailableForCategory() {
	const availableQuestions = document.querySelectorAll(
		'#availableQuestionsCategory .premium-question-item:not(.selected)',
	);
	availableQuestions.forEach((question) => {
		if (!question.classList.contains('selected')) {
			togglePremiumQuestionSelectionForCategory(question);
		}
	});
	updateBulkActionButtonsForCategory();
	showToast('All available questions selected', 'success');
}

// Deselect all selected for category
function deselectAllSelectedForCategory() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsListCategory .premium-question-item',
	);
	selectedQuestions.forEach((question) => {
		const questionId = question.dataset.questionId;
		const availableQuestion = document.querySelector(
			`#availableQuestionsCategory .premium-question-item[data-question-id="${questionId}"]`,
		);
		if (availableQuestion) {
			availableQuestion.classList.remove('selected');
			availableQuestion.style.display = 'block'; // Show the question in available side
		}
		question.remove();
	});
	updateCategoryQuestionCountsUI(); // Update counters
	updateBulkActionButtonsForCategory();
	showToast('All selections cleared', 'info');
}

// Remove selected for category
function removeSelectedForCategoryLegacy() {
	deselectAllSelectedForCategory();
}

function undoCategorySelections() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item',
	);

	if (selectedQuestions.length === 0) {
		showToast('No selections to undo', 'info');
		return;
	}

	if (
		confirm(
			`Are you sure you want to undo ${selectedQuestions.length} selections?`,
		)
	) {
		selectedQuestions.forEach((question) => {
			const questionId = question.dataset.questionId || question.dataset.index;
			question.remove();

			const availableQuestion =
				document.querySelector(
					`#availableQuestionsCategory .question-item[data-question-id="${questionId}"]`,
				) ||
				document.querySelector(
					`#availableQuestionsCategory .question-item[data-index="${questionId}"]`,
				);

			if (availableQuestion) {
				availableQuestion.style.display = 'block';
				availableQuestion.classList.remove('selected');
			}
		});

		updateCategoryQuestionCountsUI();
		updateBulkActionButtonsForCategory();
		showToast(`Undid ${selectedQuestions.length} selections`, 'success');
	}
}

// Debounce filter for category questions
function debounceFilterCategoryQuestionsLegacy() {
	clearTimeout(categoryDebounceTimer);
	categoryDebounceTimer = setTimeout(() => {
		filterCategoryQuestions();
	}, 300);
}

// Filter category questions - updated to use enhanced filtering
function filterCategoryQuestionsLegacy() {
	// Apply the enhanced filtering which handles all filtering logic
	filterCategoryQuestionsEnhanced();
}

// Clear all filters for category modal
function clearAllCategoryFiltersLegacy() {
	// Clear all filter inputs
	const searchInput = document.getElementById('questionSearchCategory');
	const typeFilter = document.getElementById('questionFilterCategory');
	const categoryFilter = document.getElementById('categoryFilterCategory');
	const difficultyFilter = document.getElementById('difficultyFilterCategory');
	const pointFilter = document.getElementById('pointFilterCategory');

	if (searchInput) searchInput.value = '';
	if (typeFilter) typeFilter.value = 'all';
	if (categoryFilter) categoryFilter.value = '';
	if (difficultyFilter) difficultyFilter.value = '';
	if (pointFilter) pointFilter.value = '';

	// Clear quick filters (set to empty array)
	window.quickFilterActiveForCategory = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll(
		'#categoryModal .quick-filter-btn',
	);
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Remove filter results message
	const container = document.getElementById('availableQuestionsCategory');
	const filterMessage =
		container.querySelector('.filter-results-message') ||
		container.querySelector('.category-filter-results-message');
	if (filterMessage) {
		filterMessage.remove();
	}

	// Also remove empty state if present
	const emptyState = container.querySelector('.premium-no-questions-state');
	if (emptyState) {
		emptyState.remove();
	}

	// Reload and filter questions
	loadAvailableQuestionsForCategory();

	showToast('All filters cleared', 'info');
}

// Keep the original clearCategoryFilters function for backward compatibility
function clearCategoryFiltersLegacy() {
	clearAllCategoryFilters();
}

// Show notification function
function showNotification(message, type = 'info') {
	const notification = document.createElement('div');
	notification.className = `notification notification-${type}`;
	notification.innerHTML = `
        <div class="notification-content">
            <span>${message}</span>
        </div>
    `;

	document.body.appendChild(notification);

	// Animate in
	setTimeout(() => {
		notification.classList.add('show');
	}, 10);

	// Remove after 3 seconds
	setTimeout(() => {
		notification.classList.remove('show');
		setTimeout(() => {
			notification.remove();
		}, 300);
	}, 3000);
}

// Category modal specific functions
function toggleQuestionSelectionForCategory(questionElement) {
	const questionId = questionElement.dataset.index;

	// Check if question is already in selected list
	const existingSelected = document.querySelector(
		`#selectedQuestionsListCategory .question-item[data-index="${questionId}"]`,
	);

	if (existingSelected) {
		// If already selected, remove it from selected side and show in available side
		questionElement.classList.remove('selected');
		questionElement.style.display = 'block'; // Show the question in available side
		existingSelected.remove();
	} else {
		// If not selected, hide from available side and add to selected side
		questionElement.classList.add('selected');
		questionElement.style.display = 'none'; // Hide the question from available side

		// Clone the question for selected list
		const questionClone = questionElement.cloneNode(true);
		questionClone.style.display = 'block'; // Ensure clone is visible
		questionClone.onclick = () =>
			removeQuestionFromCategoryAssignment(questionClone);

		document
			.getElementById('selectedQuestionsListCategory')
			.appendChild(questionClone);
	}

	updateCategoryQuestionCountsUI();
}

function removeQuestionFromCategoryAssignment(questionElement) {
	const questionId = questionElement.dataset.index;

	// Find and show the question in available side
	const availableQuestion = document.querySelector(
		`#availableQuestionsCategory .question-item[data-index="${questionId}"]`,
	);
	if (availableQuestion) {
		availableQuestion.classList.remove('selected');
		availableQuestion.style.display = 'block'; // Show the question in available side
	}

	// Remove from selected container
	questionElement.remove();

	// Update counts
	updateCategoryQuestionCountsUI();
}

// Category modal specific functions - matching exam modal structure
let currentFilterForCategory = {
	search: '',
	type: 'all',
	category: '',
	difficulty: '',
	points: '',
};

// Apply filters to category questions
function applyFiltersToCategoryQuestions() {
	// Legacy hook: delegate to the unified filtering pipeline
	filterCategoryQuestionsEnhanced();
}

// Show filter results message for category modal
function showCategoryFilterResultsMessage(
	filteredCount,
	originalCount,
	searchTerm,
	typeFilter,
	categoryFilter,
	difficultyFilter,
) {
	const container = document.getElementById('availableQuestionsCategory');
	if (!container) return;

	// Remove existing message
	const existingMessage =
		container.querySelector('.filter-results-message') ||
		container.querySelector('.category-filter-results-message');
	if (existingMessage) {
		existingMessage.remove();
	}

	// Show message if no questions match filters
	if (filteredCount === 0 && originalCount > 0) {
		let message = 'No questions found matching your criteria.';

		// Add specific filter information
		const filters = [];
		if (searchTerm) filters.push(`search: "${searchTerm}"`);
		if (typeFilter && typeFilter !== 'all') filters.push(`type: ${typeFilter}`);
		if (categoryFilter) {
			const savedCategories =
				window.__DI_CONTAINER__.repo.getAll_sync('categories');
			const categoryName =
				savedCategories.find((c) => c.id === categoryFilter)?.name ||
				categoryFilter;
			filters.push(`category: ${categoryName}`);
		}
		if (difficultyFilter && difficultyFilter !== 'all')
			filters.push(`difficulty: ${difficultyFilter}`);

		if (filters.length > 0) {
			message += ` Applied filters: ${filters.join(', ')}.`;
		}

		message += ' Try adjusting your search or filters.';

		const messageHtml = `
        <div class="filter-results-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
                <path d="M8 11h6"></path>
            </svg>
            <h3>No Results Found</h3>
            <p>${message}</p>
            <button onclick="clearCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
        </div>
        `;

		container.insertAdjacentHTML('afterbegin', messageHtml);
	}
}

// Clear all filters for category modal
function clearCategoryFilters() {
	// Clear all filter inputs
	document.getElementById('questionSearchCategory').value = '';
	document.getElementById('questionFilterCategory').value = 'all';
	document.getElementById('categoryFilterCategory').value = ''; // Corrected to match "All Categories" option value
	document.getElementById('difficultyFilterCategory').value = '';
	const pointFilterCategoryMin = document.getElementById(
		'pointFilterCategoryMin',
	);
	if (pointFilterCategoryMin) pointFilterCategoryMin.value = '';
	const pointFilterCategoryMax = document.getElementById(
		'pointFilterCategoryMax',
	);
	if (pointFilterCategoryMax) pointFilterCategoryMax.value = '';

	// Reset filter state
	currentFilterForCategory = {
		search: '',
		type: 'all',
		category: '',
		difficulty: '',
		points: '',
	};

	// Remove filter results message
	const container = document.getElementById('availableQuestionsCategory');
	const filterMessage =
		container.querySelector('.filter-results-message') ||
		container.querySelector('.category-filter-results-message');
	if (filterMessage) {
		filterMessage.remove();
	}

	// Reload and filter questions
	loadAvailableQuestionsForCategory();

	showToast('All filters cleared', 'info');
}

// Render available questions for category modal
function renderAvailableQuestionsForCategory() {
	const container = document.getElementById('availableQuestionsCategory');
	if (!container) return;

	container.innerHTML = '';

	// Get all categories for display
	const savedCategories =
		window.__DI_CONTAINER__.repo.getAll_sync('categories');

	// Group questions by category
	const questionsByCategory = {};
	availableQuestionsForCategory.forEach((question, index) => {
		const categoryId = question.category || 'uncategorized';
		if (!questionsByCategory[categoryId]) {
			questionsByCategory[categoryId] = [];
		}
		questionsByCategory[categoryId].push({ question, index });
	});

	// Build HTML with category grouping
	let html = '';
	let hasVisibleQuestions = false;

	Object.keys(questionsByCategory).forEach((categoryId) => {
		const categoryQuestions = questionsByCategory[categoryId];
		const category = savedCategories.find((cat) => cat.id === categoryId) || {
			name: 'Uncategorized',
			color: '#9ca3af',
			id: 'uncategorized',
		};

		// Only show category if it has questions
		if (categoryQuestions.length > 0) {
			hasVisibleQuestions = true;

			// Add category folder
			html += `
            <div class="category-folder" data-category="${categoryId}">
                <div class="category-header" onclick="toggleCategoryFolderForCategoryModal('${categoryId}')">
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="category-name">${escapeHtml(category.name)}</span>
                    <span class="question-count">(${categoryQuestions.length})</span>
                    <div class="category-header-actions">
                        <button class="category-action-btn select-all" onclick="event.stopPropagation(); selectAllQuestionsInCategoryForCategory('${categoryId}')" title="Select all questions">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 11 12 14 22 4"></polyline>
                                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                            </svg>
                            <span class="btn-text">Select All</span>
                        </button>
                        <button class="category-action-btn go-btn" onclick="event.stopPropagation(); processSelectedQuestionsForCategory('${categoryId}')" title="Process selected questions">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"></path>
                            </svg>
                            <span class="btn-text">Go</span>
                        </button>
                        <button class="category-action-btn toggle-view" onclick="event.stopPropagation(); toggleCategoryFolderForCategoryModal('${categoryId}')" title="Toggle category">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 9l6 6 6-6"></path>
                            </svg>
                            <span class="btn-text">Toggle</span>
                        </button>
                    </div>
                </div>
                <div class="category-questions">
            `;

			// Add questions in this category - same structure as exam modal
			categoryQuestions.forEach(({ question, index }) => {
				const questionType = getQuestionType(question);
				const difficulty = question.difficulty || 'medium';

				html += `
                <div class="question-item categorized" data-index="${index}" data-draggable="${question.isDraggable}" data-category="${categoryId}" data-type="${questionType}" data-points="${Number.parseFloat(question.points) || 1}" onclick="toggleQuestionSelectionForCategory(this)">
                    <div class="question-content">
                        ${window.renderQuestionContent(question.question, question, questionType, question.options, question.image, true)}
                    </div>
                </div>
                `;
			});

			html += `
                </div>
            </div>
            `;
		}
	});

	// Show empty state if no questions are available
	if (!hasVisibleQuestions) {
		html = `
        <div class="no-questions-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path>
                <rect x="9" y="3" width="6" height="4" rx="2"></rect>
            </svg>
            <h3>No Available Questions</h3>
            <p>All questions have been selected or there are no questions available for assignment.</p>
        </div>
        `;
	}

	window.safeSetHTML
		? window.safeSetHTML(container, html, true)
		: (container.innerHTML = html);
}

// Render selected questions for category modal
function renderSelectedQuestionsForCategory() {
	const container = document.getElementById('selectedQuestionsListCategory');
	if (!container) return;

	container.innerHTML = '';

	if (selectedQuestionsForCategory.length === 0) {
		container.innerHTML =
			'<div class="no-questions">No questions selected</div>';
		return;
	}

	selectedQuestionsForCategory.forEach((question, index) => {
		const questionElement = createSelectedQuestionElementForCategoryModal(
			question,
			index,
		);
		container.appendChild(questionElement);
	});
}

// Create question element for category modal
function createQuestionElementForCategoryModal(question, index) {
	const questionElement = document.createElement('div');
	questionElement.className = 'premium-question-item';
	questionElement.dataset.index = index;
	questionElement.dataset.points = Number.parseFloat(question.points) || 1;

	const questionType =
		question.type || (question.isDraggable ? 'draggable' : 'multiple-choice');
	const difficultyBadge = question.difficulty
		? `<span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>`
		: '';
	const typeClass = questionType === 'code' ? 'code-type' : '';

	questionElement.innerHTML = `
        <div class="question-content">
            <div class="question-header">
                <span class="question-type-badge ${typeClass}">${questionType}</span>
                ${difficultyBadge}
            </div>
            <div class="question-text">${escapeHtml(question.question)}</div>
            ${question.image ? `<div class="question-image-preview"><img src="${question.image}" alt="Question preview"></div>` : ''}
        </div>
        <div class="question-actions">
            <button class="select-btn" onclick="selectQuestionForCategory(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                </svg>
            </button>
        </div>
    `;

	return questionElement;
}

// Create selected question element for category modal
function createSelectedQuestionElementForCategoryModal(question, index) {
	const questionElement = document.createElement('div');
	questionElement.className = 'premium-question-item selected';
	questionElement.dataset.index = index;
	questionElement.dataset.points = Number.parseFloat(question.points) || 1;

	const questionType =
		question.type || (question.isDraggable ? 'draggable' : 'multiple-choice');
	const difficultyBadge = question.difficulty
		? `<span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>`
		: '';
	const typeClass = questionType === 'code' ? 'code-type' : '';

	questionElement.innerHTML = `
        <div class="question-content">
            <div class="question-header">
                <span class="question-type-badge ${typeClass}">${questionType}</span>
                ${difficultyBadge}
            </div>
            <div class="question-text">${escapeHtml(question.question)}</div>
            ${question.image ? `<div class="question-image-preview"><img src="${question.image}" alt="Question preview"></div>` : ''}
        </div>
        <div class="question-actions">
            <button class="deselect-btn" onclick="deselectQuestionForCategory(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;

	return questionElement;
}

// Select question for category
function selectQuestionForCategory(index) {
	const question = availableQuestionsForCategory[index];
	if (!question) return;

	// Add to selected questions
	selectedQuestionsForCategory.push(question);

	// Remove from available questions
	availableQuestionsForCategory.splice(index, 1);

	// Update UI
	renderAvailableQuestionsForCategory();
	renderSelectedQuestionsForCategory();
	updateCategoryQuestionCounts();
	updateBulkActionButtonsForCategory();
}

// Deselect question for category
function deselectQuestionForCategory(index) {
	const question = selectedQuestionsForCategory[index];
	if (!question) return;

	// Add back to available questions
	availableQuestionsForCategory.push(question);

	// Remove from selected questions
	selectedQuestionsForCategory.splice(index, 1);

	// Update UI
	renderAvailableQuestionsForCategory();
	renderSelectedQuestionsForCategory();
	updateCategoryQuestionCounts();
	updateBulkActionButtonsForCategory();
}

// Update bulk action buttons for category
function updateBulkActionButtonsForCategoryLegacy2() {
	const selectAllBtn = document.getElementById('selectAllBtn');
	const deselectAllBtn = document.getElementById('deselectAllBtn');
	const removeSelectedBtn = document.getElementById('removeSelectedBtn');

	if (selectAllBtn) {
		selectAllBtn.disabled = availableQuestionsForCategory.length === 0;
	}

	if (deselectAllBtn) {
		deselectAllBtn.disabled = selectedQuestionsForCategory.length === 0;
	}

	if (removeSelectedBtn) {
		removeSelectedBtn.disabled = selectedQuestionsForCategory.length === 0;
	}
}

// Remove selected questions for category
function removeSelectedForCategoryLegacy2() {
	availableQuestionsForCategory = [
		...availableQuestionsForCategory,
		...selectedQuestionsForCategory,
	];
	selectedQuestionsForCategory = [];

	renderAvailableQuestionsForCategory();
	renderSelectedQuestionsForCategory();
	updateCategoryQuestionCounts();
	updateBulkActionButtonsForCategory();
}

// Filter category questions
// Set quick filter for category
function setQuickFilterForCategory(filterType) {
	// If no active filters yet, initialize as array
	if (!window.quickFilterActiveForCategory) {
		window.quickFilterActiveForCategory = [];
	}

	// If it's not already an array, convert it
	if (!Array.isArray(window.quickFilterActiveForCategory)) {
		window.quickFilterActiveForCategory = [window.quickFilterActiveForCategory];
	}

	// Toggle the filter - add if not present, remove if present
	const index = window.quickFilterActiveForCategory.indexOf(filterType);
	if (index > -1) {
		// Remove filter
		window.quickFilterActiveForCategory.splice(index, 1);
	} else {
		// Add filter
		window.quickFilterActiveForCategory.push(filterType);
	}

	// Update UI to show active filters
	const quickFilterButtons = document.querySelectorAll(
		'#categoryModal .quick-filter-btn',
	);
	quickFilterButtons.forEach((btn) => {
		const btnFilter = btn
			.getAttribute('onclick')
			.match(/setQuickFilterForCategory\('([^']+)'/);
		if (btnFilter && btnFilter[1]) {
			if (window.quickFilterActiveForCategory.includes(btnFilter[1])) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	});

	// Apply the filter
	filterCategoryQuestionsEnhanced();
}

// Function to handle category question filtering
function filterCategoryQuestionsLegacy2() {
	// Update active class on quick filter buttons
	const categoryFilter = document.getElementById('categoryFilterCategory');
	const difficultyFilter = document.getElementById('difficultyFilterCategory');
	const quickFilterButtons = document.querySelectorAll(
		'#categoryModal .quick-filter-btn',
	);

	if (categoryFilter && difficultyFilter) {
		const currentCategoryFilter = categoryFilter.value;
		const currentDifficultyFilter = difficultyFilter.value;

		quickFilterButtons.forEach((btn) => {
			const onclick = btn.getAttribute('onclick');
			if (
				onclick.includes(`'${currentCategoryFilter}'`) &&
				currentCategoryFilter !== ''
			) {
				btn.classList.add('active');
			} else if (
				onclick.includes(`'${currentDifficultyFilter}'`) &&
				currentDifficultyFilter !== ''
			) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		});
	}

	loadAvailableQuestionsForCategory(true); // true to keep current selections
}

// Debounce filter for category questions - updated to use enhanced filtering
function debounceFilterCategoryQuestionsLegacy2() {
	clearTimeout(categoryDebounceTimer);
	categoryDebounceTimer = setTimeout(() => {
		filterCategoryQuestionsEnhanced();
	}, 300);
}

// Enhanced filter functionality for category modal
function filterCategoryQuestionsEnhanced() {
	// Unified filter path: re-render with current filters (matches exam modal behavior)
	loadAvailableQuestionsForCategory(true);
	updateActiveFilterUIForCategory();
}

function updateCategoryFolderVisibilityForCategory(visibleCategories) {
	const categoryFolders = document.querySelectorAll(
		'#availableQuestionsCategory .category-folder',
	);

	categoryFolders.forEach((folder) => {
		const categoryId = folder.dataset.category;
		const hasVisibleQuestions = visibleCategories.has(categoryId);
		const questions = folder.querySelectorAll('.question-item');
		const visibleQuestions = Array.from(questions).filter(
			(q) => q.style.display !== 'none',
		);

		// Hide category folder if it has no visible questions and is not the currently filtered category
		if (!hasVisibleQuestions && questions.length > 0) {
			folder.style.display = 'none';
		} else {
			folder.style.display = 'block';

			// Update question count
			const countElement = folder.querySelector('.question-count');
			if (countElement) {
				countElement.textContent = `(${visibleQuestions.length}/${questions.length})`;
			}
		}
	});
}

function updateActiveFilterUIForCategory() {
	// Update quick filter buttons to show active state
	const quickFilterButtons = document.querySelectorAll(
		'#categoryModal .quick-filter-btn',
	);
	quickFilterButtons.forEach((btn) => {
		// Extract filter type from onclick attribute
		const onclickAttr = btn.getAttribute('onclick');
		if (onclickAttr) {
			const match = onclickAttr.match(/setQuickFilterForCategory\('([^']+)'/);
			if (match && match[1]) {
				const filterType = match[1];
				// Check if this filter is active (in the array)
				if (
					Array.isArray(window.quickFilterActiveForCategory) &&
					window.quickFilterActiveForCategory.includes(filterType)
				) {
					btn.classList.add('active');
				} else {
					btn.classList.remove('active');
				}
			}
		}
	});
}

function showFilterResultsMessageForCategory(
	visibleQuestionCount,
	searchTerm,
	filterType,
	categoryFilter,
	difficultyFilter,
) {
	const container = document.getElementById('availableQuestionsCategory');
	const existingMessage = container.querySelector('.filter-results-message');

	// Remove existing message
	if (existingMessage) {
		existingMessage.remove();
	}

	// Show message if no questions match filters
	if (visibleQuestionCount === 0) {
		let message = 'No questions found matching your criteria.';

		// Add specific filter information
		const filters = [];
		if (searchTerm) filters.push(`search: "${searchTerm}"`);
		if (filterType && filterType !== 'all') filters.push(`type: ${filterType}`);
		if (categoryFilter && categoryFilter !== '') {
			const savedCategories =
				window.__DI_CONTAINER__.repo.getAll_sync('categories');
			const categoryName =
				savedCategories.find((c) => c.id === categoryFilter)?.name ||
				categoryFilter;
			filters.push(`category: ${categoryName}`);
		}
		if (difficultyFilter && difficultyFilter !== '')
			filters.push(`difficulty: ${difficultyFilter}`);
		if (
			window.quickFilterActiveForCategory &&
			Array.isArray(window.quickFilterActiveForCategory) &&
			window.quickFilterActiveForCategory.length > 0
		) {
			filters.push(`quick: ${window.quickFilterActiveForCategory.join(', ')}`);
		}

		if (filters.length > 0) {
			message += ` Applied filters: ${filters.join(', ')}.`;
		}

		message += ' Try adjusting your search or filters.';

		const messageHtml = `
        <div class="filter-results-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
                <path d="M8 11h6"></path>
            </svg>
            <h3>No Results Found</h3>
            <p>${message}</p>
            <button onclick="clearAllCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
        </div>
        `;

		container.insertAdjacentHTML('afterbegin', messageHtml);
	}
}

// Clear all filters for category modal
function clearAllCategoryFilters() {
	// Clear all filter inputs
	document.getElementById('questionSearchCategory').value = '';
	document.getElementById('categoryFilterCategory').value = '';
	document.getElementById('questionFilterCategory').value = 'all';
	document.getElementById('difficultyFilterCategory').value = '';
	const pointFilterCategoryMin = document.getElementById(
		'pointFilterCategoryMin',
	);
	if (pointFilterCategoryMin) pointFilterCategoryMin.value = '';
	const pointFilterCategoryMax = document.getElementById(
		'pointFilterCategoryMax',
	);
	if (pointFilterCategoryMax) pointFilterCategoryMax.value = '';

	// Clear quick filters (set to empty array)
	window.quickFilterActiveForCategory = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll(
		'#categoryModal .quick-filter-btn',
	);
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Remove filter results message
	const container = document.getElementById('availableQuestionsCategory');
	const filterMessage = container.querySelector('.filter-results-message');
	if (filterMessage) {
		filterMessage.remove();
	}

	// Also remove empty state if present
	const emptyState = container.querySelector('.premium-no-questions-state');
	if (emptyState) {
		emptyState.remove();
	}

	// Reload and filter questions
	loadAvailableQuestionsForCategory();

	showToast('All filters cleared', 'info');
}

// Debounce filter for category questions
let debounceTimerForCategory;
function debounceFilterCategoryQuestions() {
	clearTimeout(debounceTimerForCategory);
	debounceTimerForCategory = setTimeout(() => {
		const searchTerm =
			document.getElementById('questionSearchCategory')?.value || '';
		currentFilterForCategory.search = searchTerm.toLowerCase();
		filterCategoryQuestionsEnhanced();
	}, 300);
}

// Get current category ID
function getCurrentCategoryId() {
	// Use the global currentCategoryId variable
	return currentCategoryId;
}

// Open category modal with specific category ID
function openCategoryModalWithCategoryId(categoryId) {
	// Question assignment now happens in the dedicated assign modal.
	openAssignCategoryQuestions(categoryId);
}

function selectAllQuestionsInCategoryForCategory(categoryId) {
	const categoryFolder = document.querySelector(
		`.category-folder[data-category="${categoryId}"]`,
	);
	const questions = categoryFolder.querySelectorAll('.question-item');

	questions.forEach((question) => {
		if (question.style.display !== 'none') {
			// Only select visible questions
			toggleQuestionSelectionForCategory(question);
		}
	});
}

function toggleCategoryFolderForCategoryModal(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}

	const folder = document.querySelector(
		`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`,
	);
	if (!folder) return;
	const questionsContainer = folder.querySelector('.category-questions');
	const header = folder.querySelector('.category-header');

	if (questionsContainer.style.display === 'none') {
		questionsContainer.style.display = 'block';
		header.classList.remove('collapsed');
	} else {
		questionsContainer.style.display = 'none';
		header.classList.add('collapsed');
	}
}

function updateBulkActionButtonsForCategory() {
	const selectedCount = document.querySelectorAll(
		'#selectedQuestionsListCategory .question-item',
	).length;
	const deselectAllBtn = document.getElementById('deselectAllBtnForCategory');
	const removeSelectedBtn = document.getElementById(
		'removeSelectedBtnForCategory',
	);
	const clearAllBtn = document.getElementById('clearAllBtnForCategory');

	// Enable/disable buttons based on selection
	if (deselectAllBtn) {
		deselectAllBtn.disabled = selectedCount === 0;
	}

	if (removeSelectedBtn) {
		removeSelectedBtn.disabled = selectedCount === 0;
	}

	if (clearAllBtn) {
		clearAllBtn.disabled = selectedCount === 0;
	}
}

// Process selected questions for category modal
function processSelectedQuestionsForCategory(categoryId) {
	const categoryQuestions = document.querySelectorAll(
		`.category-folder[data-category="${categoryId}"] .question-item.selected`,
	);

	if (categoryQuestions.length === 0) {
		showEnhancedToast('Please select at least one question', 'error');
		return;
	}

	// Process each selected question
	categoryQuestions.forEach((questionElement) => {
		const questionIndex = parseInt(questionElement.dataset.index);
		const question = availableQuestionsForCategory[questionIndex];

		if (question) {
			// Add to selected questions
			selectedQuestionsForCategory.push(question);

			// Remove from available questions
			const availableIndex = availableQuestionsForCategory.findIndex(
				(q) => q.id === question.id,
			);
			if (availableIndex > -1) {
				availableQuestionsForCategory.splice(availableIndex, 1);
			}
		}
	});

	// Update UI
	renderAvailableQuestionsForCategory();
	renderSelectedQuestionsForCategory();
	updateCategoryQuestionCounts();
	updateBulkActionButtonsForCategory();

	showEnhancedToast(
		`${categoryQuestions.length} question(s) selected`,
		'success',
	);
}
// Expose functions to window for HTML onclick handlers
window.createNewCategory = createNewCategory;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategoryForm;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.openAssignCategoryQuestions = openAssignCategoryQuestions;
window.closeAssignCategoryQuestions = closeAssignCategoryQuestions;
window.saveAssignCategoryQuestions = saveAssignCategoryQuestions;

// Shared helper for the dedicated assignment modals: promote the element to
// <body> so it always stacks above nested containers, and hide the profile
// dropdown the same way the class/exam modals do.
function promoteAssignModal(modal) {
	if (!modal) return;
	if (modal.parentElement !== document.body) {
		document.body.appendChild(modal);
	}
	const profileMenu = document.getElementById('profileMenu');
	if (profileMenu) profileMenu.classList.remove('active');

	// Same full promotion as the entity modals (exam / class / category):
	// the shared is-open frame CSS takes over from here.
	modal.style.setProperty('display', 'flex', 'important');
	modal.style.setProperty('position', 'fixed', 'important');
	modal.style.setProperty('inset', '0', 'important');
	modal.style.setProperty('z-index', '2147483000', 'important');
	modal.style.setProperty('opacity', '1', 'important');
	modal.style.setProperty('visibility', 'visible', 'important');
	modal.style.setProperty('pointer-events', 'auto', 'important');
}

function openAssignModalLike(modal, focusId) {
	if (!modal) return;
	promoteAssignModal(modal);
	modal.classList.add('is-open');
	modal.setAttribute('aria-hidden', 'false');
	modal.setAttribute('aria-modal', 'true');
	modal.setAttribute('role', 'dialog');
	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
	setTimeout(() => {
		modal.classList.add('active');
		// Autofocus only with a fine pointer: on touch devices popping the
		// keyboard on open jumps the fixed sheet and can hide the search
		// field behind the header/keyboard.
		if (
			focusId &&
			window.matchMedia &&
			window.matchMedia('(pointer: fine)').matches
		) {
			document.getElementById(focusId)?.focus();
		}
	}, 10);
}

function closeAssignModalLike(modal) {
	if (!modal) return;
	modal.style.setProperty('display', 'none', 'important');
	[
		'position',
		'inset',
		'z-index',
		'opacity',
		'visibility',
		'pointer-events',
	].forEach((property) => modal.style.removeProperty(property));
	modal.classList.remove('active', 'is-open');
	modal.setAttribute('aria-hidden', 'true');
	modal.removeAttribute('aria-modal');
	modal.removeAttribute('role');
	document.documentElement.classList.remove('modal-open');
	document.body.classList.remove('modal-open');
}
window.promoteAssignModal = promoteAssignModal;
window.openAssignModalLike = openAssignModalLike;
window.closeAssignModalLike = closeAssignModalLike;

// ── Assign Questions filter toggle (mobile: search stays visible, the rest
// collapses into a hidden-by-default block) ──────────────────────────────
function toggleAssignFilters(btn) {
	const section = btn
		? btn.closest('.category-filter-section, .exam-filters-container')
		: null;
	if (!section) return;
	const open = section.classList.toggle('filters-open');
	btn.setAttribute('aria-expanded', open ? 'true' : 'false');
	const label = btn.querySelector('.filters-toggle-label');
	if (label) label.textContent = open ? 'Hide filters' : 'Show filters';
	updateAssignFiltersCount(section);
}

function updateAssignFiltersCount(section) {
	if (!section) return;
	let count = 0;
	section.querySelectorAll('select').forEach((sel) => {
		const value = String(sel.value ?? '');
		if (value !== '' && value !== 'all') count++;
	});
	section.querySelectorAll('input[type="number"]').forEach((input) => {
		if (String(input.value ?? '').trim() !== '') count++;
	});
	const search = section.querySelector('input[type="text"]');
	if (search && search.value.trim() !== '') count++;
	section.querySelectorAll('.quick-filter-btn.active').forEach(() => count++);
	const badge = section.querySelector('.filters-count-badge');
	if (badge) {
		badge.textContent = String(count);
		badge.classList.toggle('hidden', count === 0);
	}
	const toggle = section.querySelector('.filters-toggle-btn');
	if (toggle) toggle.classList.toggle('has-active', count > 0);
}

// Collapse back to hidden-by-default + refresh the count badge.
function resetAssignFiltersUI(modal) {
	if (!modal) return;
	modal
		.querySelectorAll('.category-filter-section, .exam-filters-container')
		.forEach((section) => {
			section.classList.remove('filters-open');
			const toggle = section.querySelector('.filters-toggle-btn');
			if (toggle) {
				toggle.setAttribute('aria-expanded', 'false');
				const label = toggle.querySelector('.filters-toggle-label');
				if (label) label.textContent = 'Show filters';
			}
			updateAssignFiltersCount(section);
		});
}

window.toggleAssignFilters = toggleAssignFilters;
window.updateAssignFiltersCount = updateAssignFiltersCount;
window.resetAssignFiltersUI = resetAssignFiltersUI;

// Keep the count badge live as the user types / changes filters.
if (
	typeof document !== 'undefined' &&
	!window.__assignFiltersCountWired &&
	document.addEventListener
) {
	window.__assignFiltersCountWired = true;
	const recountAssignFilters = (event) => {
		const target = event && event.target;
		if (!target || !target.closest) return;
		const section = target.closest(
			'.category-filter-section, .exam-filters-container',
		);
		if (section) updateAssignFiltersCount(section);
	};
	document.addEventListener('input', recountAssignFilters);
	document.addEventListener('change', recountAssignFilters);
	document.addEventListener('click', (event) => {
		const chip =
			event.target && event.target.closest
				? event.target.closest('.quick-filters .quick-filter-btn')
				: null;
		if (!chip) return;
		const section = chip.closest(
			'.category-filter-section, .exam-filters-container',
		);
		// Active-chip classes toggle after handlers run — recount next tick.
		setTimeout(() => updateAssignFiltersCount(section), 0);
	});
}

// ============================================
// INLINE CATEGORY CREATION
// ============================================

function toggleInlineCategoryInput() {
	const selectContainer = document.getElementById('category-select-container');
	const inputContainer = document.getElementById('category-input-container');
	const inlineInput = document.getElementById('inlineCategoryInput');
	const toggleBtn = document.getElementById('addCategoryToggleBtn');

	if (
		inputContainer.style.display === 'none' ||
		inputContainer.classList.contains('hidden')
	) {
		// Show Input
		selectContainer.style.display = 'none';
		inputContainer.style.display = 'flex';
		inputContainer.classList.remove('hidden');
		if (toggleBtn) toggleBtn.style.visibility = 'hidden'; // Hide the "New Category" link while adding
		inlineInput.value = '';
		inlineInput.focus();
	} else {
		// Show Select
		selectContainer.style.display = 'block';
		inputContainer.style.display = 'none';
		inputContainer.classList.add('hidden');
		if (toggleBtn) toggleBtn.style.visibility = 'visible';
	}
}

function saveInlineCategory() {
	const nameInput = document.getElementById('inlineCategoryInput');
	const categoryName = nameInput.value.trim();

	if (!categoryName) {
		showToast('Please enter a category name', 'error');
		return;
	}

	// Check duplicates
	if (
		categories.some(
			(c) => String(c.name || '').toLowerCase() === categoryName.toLowerCase(),
		)
	) {
		showToast('Category already exists', 'error');
		return;
	}

	// Pick random color
	const color =
		DEFAULT_CATEGORY_COLORS[
			Math.floor(Math.random() * DEFAULT_CATEGORY_COLORS.length)
		];

	const newCategory = {
		id: generateUUID(),
		name: categoryName,
		color: color,
		questionCount: 0,
		dateCreated: new Date().toISOString(),
	};

	categories.push(newCategory);
	saveCategories();
	updateCategoryList();
	loadCategoriesIntoSelect(); // Updates all selects including #category

	// Select the new category
	const categorySelect = document.getElementById('category');
	if (categorySelect) {
		categorySelect.value = newCategory.id;
	}

	showToast('Category added!');
	toggleInlineCategoryInput(); // Switch back to select
}

// ============================================
// BULK SELECTION - DELETE SELECTED (question-tab style)
// ============================================
async function deleteSelectedCategories() {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('categories')
		: [];
	const deletable = ids.filter((id) => {
		if (!id || id === 'uncategorized') return false;
		const cat = categories.find((c) => String(c.id) === String(id));
		return cat && !cat.isSystem && !cat.isDefault;
	});
	if (!deletable.length) {
		showToast('No deletable categories selected', 'error');
		return;
	}
	if (
		!confirm(
			`Are you sure you want to delete ${deletable.length} categor${deletable.length === 1 ? 'y' : 'ies'}? All questions in them will become uncategorized.`,
		)
	) {
		return;
	}

	// Server-first per row (same contract as deleteCategory): detach the
	// row's questions so the server accepts the delete, then delete the row.
	// A 404 on delete means the row is already gone server-side and counts
	// as deleted. Then a single local pass so counts/questions stay
	// consistent.
	const failed = [];
	const failureReasons = [];
	for (const categoryId of deletable) {
		const category = categories.find(
			(c) => String(c.id) === String(categoryId),
		);
		if (window.API && typeof window.API.remove === 'function') {
			try {
				if (category) {
					await detachCategoryQuestionsOnServer(category);
				}
				await window.API.remove('categories', categoryId);
			} catch (apiErr) {
				if (apiErr?.status === 404) {
					continue;
				}
				console.warn('[categories] bulk API delete failed:', apiErr);
				failed.push(categoryId);
				if (apiErr?.message) failureReasons.push(apiErr.message);
				continue;
			}
		}
	}

	const okIds = new Set(deletable.filter((id) => !failed.includes(id)));
	if (okIds.size) {
		const savedQuestions =
			window.__DI_CONTAINER__.repo.getAll_sync('questions') || [];
		savedQuestions.forEach((question) => {
			if (okIds.has(String(question.category))) question.category = '';
			if (okIds.has(String(question.categoryId))) question.categoryId = '';
			if (okIds.has(String(question.category_id)))
				question.category_id = null;
		});
		window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
		categories = categories.filter((c) => !okIds.has(String(c.id)));
		for (const id of okIds) {
			await removeCategoryTraining(id);
		}
		saveCategories();
		updateCategoryList();
		loadCategoriesIntoFilters();
		if (window.BulkSelect) window.BulkSelect.clear('categories');
		if (typeof logActivity === 'function') {
			logActivity('category', `${okIds.size} Categories`, 'deleted', {
				count: okIds.size,
			});
		}
	}
	if (failed.length) {
		const cause = failureReasons.find(Boolean);
		showToast(
			`Deleted ${okIds.size}; ${failed.length} failed on server \u2014 kept locally so you can retry` +
				(cause ? `: ${cause}` : ''),
			'error',
		);
	} else {
		showToast(`Deleted ${okIds.size} categor${okIds.size === 1 ? 'y' : 'ies'}!`);
	}
}

// Expose to window
window.toggleInlineCategoryInput = toggleInlineCategoryInput;
window.saveInlineCategory = saveInlineCategory;
window.deleteSelectedCategories = deleteSelectedCategories;
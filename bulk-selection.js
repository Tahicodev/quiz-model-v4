// ============================================
// BULK SELECTION - SHARED HELPER
// ============================================
// Mirrors the Questions tab bulk UX (checkbox column + select-all header +
// "N selected / Delete Selected" bar + row highlight) for every other
// admin list: categories, exams, classes, results.
// Same style (.bulk-actions-container) and same behavior on all viewports.
//
// Usage per table (example: categories):
//   BulkSelect.register('categories', {
//     checkboxClass: 'category-checkbox',
//     selectAllId: 'selectAllCategories',
//     barId: 'bulk-actions-categories',
//     countId: 'selected-count-categories',
//     addBtnId: 'add-category-btn',
//     rowSelectedClass: 'question-row-selected',
//   });
// Row checkbox markup:
//   <td class="checkbox-cell" data-label="Select">
//     <input type="checkbox" class="category-checkbox" data-id="..."
//            onchange="toggleBulkRowSelection(this,'categories')">
//   </td>
// Header markup:
//   <input type="checkbox" id="selectAllCategories"
//          onchange="toggleBulkSelectAllGeneric(this,'categories')">
(function () {
	'use strict';

	const configs = {};
	const selectedIds = {
		categories: new Set(),
		exams: new Set(),
		classes: new Set(),
		results: new Set(),
		devices: new Set(),
	};

	function getConfig(tableId) {
		return (
			configs[tableId] || {
				checkboxClass: `${tableId}-checkbox`,
				selectAllId: `selectAll-${tableId}`,
				barId: `bulk-actions-${tableId}`,
				countId: `selected-count-${tableId}`,
				addBtnId: null,
				rowSelectedClass: 'question-row-selected',
			}
		);
	}

	function register(tableId, config) {
		configs[tableId] = Object.assign(
			{
				checkboxClass: `${tableId}-checkbox`,
				selectAllId: `selectAll-${tableId}`,
				barId: `bulk-actions-${tableId}`,
				countId: `selected-count-${tableId}`,
				addBtnId: null,
				rowSelectedClass: 'question-row-selected',
			},
			config || {},
		);
		if (!selectedIds[tableId]) selectedIds[tableId] = new Set();
		// Refresh bar state once the DOM is ready (table may render later).
		updateBar(tableId);
	}

	function checkboxSelector(tableId) {
		return `.${getConfig(tableId).checkboxClass}`;
	}

	function getIdFromCheckbox(cb) {
		return String(
			cb.dataset.id ?? cb.dataset.index ?? cb.dataset.resultId ?? '',
		);
	}

	function isVisible(el) {
		if (!el) return false;
		if (el.disabled) return false;
		const row = el.closest('tr');
		if (row && row.style.display === 'none') return false;
		// offsetParent is null for display:none ancestors (except fixed).
		if (el.offsetParent === null) {
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) return false;
		}
		return true;
	}

	function toggleRow(checkbox, tableId) {
		if (!checkbox || !tableId) return;
		const cfg = getConfig(tableId);
		const row = checkbox.closest('tr');
		const id = getIdFromCheckbox(checkbox);
		if (checkbox.checked) {
			if (row) row.classList.add(cfg.rowSelectedClass);
			if (id) selectedIds[tableId].add(id);
		} else {
			if (row) row.classList.remove(cfg.rowSelectedClass);
			if (id) selectedIds[tableId].delete(id);
		}
		updateBar(tableId);
	}

	function toggleSelectAll(selectAllCheckbox, tableId) {
		if (!selectAllCheckbox || !tableId) return;
		const cfg = getConfig(tableId);
		const checked = selectAllCheckbox.checked;
		const boxes = Array.from(
			document.querySelectorAll(checkboxSelector(tableId)),
		).filter(isVisible);
		boxes.forEach((cb) => {
			cb.checked = checked;
			const row = cb.closest('tr');
			const id = getIdFromCheckbox(cb);
			if (checked) {
				if (row) row.classList.add(cfg.rowSelectedClass);
				if (id) selectedIds[tableId].add(id);
			} else {
				if (row) row.classList.remove(cfg.rowSelectedClass);
				if (id) selectedIds[tableId].delete(id);
			}
		});
		updateBar(tableId);
	}

	function updateBar(tableId) {
		const cfg = getConfig(tableId);
		try {
			const allBoxes = Array.from(
				document.querySelectorAll(checkboxSelector(tableId)),
			);
			const visibleBoxes = allBoxes.filter(isVisible);
			// Count every checked row, including rows hidden by a filter or
			// moved to another page. The bar must never report "0 selected"
			// while a hidden row is still selected (the bulk actions operate
			// on the full selection).
			const checkedBoxes = allBoxes.filter((cb) => cb.checked);
			const visibleCheckedBoxes = checkedBoxes.filter(isVisible);
			const selectedCount = checkedBoxes.length;

			const countSpan = document.getElementById(cfg.countId);
			if (countSpan) countSpan.textContent = String(selectedCount);

			const bar = document.getElementById(cfg.barId);
			const addBtn = cfg.addBtnId
				? document.getElementById(cfg.addBtnId)
				: null;
			if (bar) {
				// Publish the current selection count on the bar so CSS can toggle
				// single-selection-only actions (e.g. the "Edit" button on the
				// courses bulk bar) without every consumer having to add its own
				// listener.
				bar.dataset.count = String(selectedCount);
				if (selectedCount > 0) {
					bar.classList.remove('hidden');
					if (addBtn) addBtn.style.display = 'none';
				} else {
					bar.classList.add('hidden');
					if (addBtn) addBtn.style.display = '';
				}
			}

			const selectAllState = {
				checked:
					visibleBoxes.length > 0 &&
					visibleCheckedBoxes.length === visibleBoxes.length,
				indeterminate:
					visibleCheckedBoxes.length > 0 &&
					visibleCheckedBoxes.length < visibleBoxes.length,
			};
			const selectAll = document.getElementById(cfg.selectAllId);
			if (selectAll) {
				selectAll.checked = selectAllState.checked;
				selectAll.indeterminate = selectAllState.indeterminate;
			}
			// Mirror the header checkbox on alternate select-all controls
			// (e.g. the mobile roster toolbar).
			document
				.querySelectorAll(`[data-bulk-select-all="${tableId}"]`)
				.forEach((cb) => {
					if (cb === selectAll) return;
					cb.checked = selectAllState.checked;
					cb.indeterminate = selectAllState.indeterminate;
				});
			// Let the owning module refresh any extra bulk actions it owns
			// (e.g. the categories' training toggle) against the new selection.
			if (typeof window.onBulkSelectionChange === 'function') {
				try {
					window.onBulkSelectionChange(tableId, checkedBoxes);
				} catch (e) {
					console.error(`[bulk] onBulkSelectionChange(${tableId}) failed:`, e);
				}
			}
		} catch (e) {
			console.error(`[bulk] updateBar(${tableId}) failed:`, e);
		}
	}

	// Re-apply persisted selection after a list re-render (filter/sort/
	// reload). Call at the end of every update*List / display* function.
	function restore(tableId) {
		const cfg = getConfig(tableId);
		const set = selectedIds[tableId];
		if (!set || !set.size) {
			updateBar(tableId);
			return;
		}
		document
			.querySelectorAll(checkboxSelector(tableId))
			.forEach((cb) => {
				const id = getIdFromCheckbox(cb);
				if (id && set.has(id)) {
					cb.checked = true;
					const row = cb.closest('tr');
					if (row) row.classList.add(cfg.rowSelectedClass);
				}
			});
		// Drop ids that no longer exist in the DOM (deleted rows).
		const liveIds = new Set(
			Array.from(document.querySelectorAll(checkboxSelector(tableId))).map(
				getIdFromCheckbox,
			),
		);
		Array.from(set).forEach((id) => {
			if (!liveIds.has(id)) set.delete(id);
		});
		updateBar(tableId);
	}

	function getSelectedIds(tableId) {
		const cfg = getConfig(tableId);
		// Prefer live DOM state (survives external re-renders); fall back to
		// the persisted set.
		const live = Array.from(
			document.querySelectorAll(`${checkboxSelector(tableId)}:checked`),
		)
			.map(getIdFromCheckbox)
			.filter(Boolean);
		if (live.length) return live;
		return Array.from(selectedIds[tableId] || []);
	}

	function clear(tableId) {
		const cfg = getConfig(tableId);
		selectedIds[tableId] = new Set();
		document.querySelectorAll(checkboxSelector(tableId)).forEach((cb) => {
			cb.checked = false;
			const row = cb.closest('tr');
			if (row) row.classList.remove(cfg.rowSelectedClass);
		});
		updateBar(tableId);
	}

	function removeIds(tableId, ids) {
		const set = selectedIds[tableId];
		if (!set) return;
		(ids || []).forEach((id) => set.delete(String(id)));
		updateBar(tableId);
	}

	// Default table configs (ids must match admin.html).
	register('subjects', {
		checkboxClass: 'subject-checkbox',
		selectAllId: 'selectAllSubjects',
		barId: 'bulk-actions-subjects',
		countId: 'selected-count-subjects',
		addBtnId: null,
		rowSelectedClass: 'question-row-selected',
	});
	register('categories', {
		checkboxClass: 'category-checkbox',
		selectAllId: 'selectAllCategories',
		barId: 'bulk-actions-categories',
		countId: 'selected-count-categories',
		addBtnId: 'add-category-btn',
		rowSelectedClass: 'question-row-selected',
	});
	register('exams', {
		checkboxClass: 'exam-checkbox',
		selectAllId: 'selectAllExams',
		barId: 'bulk-actions-exams',
		countId: 'selected-count-exams',
		addBtnId: 'create-exam-btn',
		rowSelectedClass: 'question-row-selected',
	});
	register('classes', {
		checkboxClass: 'class-checkbox',
		selectAllId: 'selectAllClasses',
		barId: 'bulk-actions-classes',
		countId: 'selected-count-classes',
		addBtnId: 'create-class-btn',
		rowSelectedClass: 'question-row-selected',
	});
	register('results', {
		checkboxClass: 'result-checkbox',
		selectAllId: 'selectAllResults',
		barId: 'bulk-actions-results',
		countId: 'selected-count-results',
		addBtnId: null,
		rowSelectedClass: 'question-row-selected',
	});
	register('devices', {
		checkboxClass: 'device-checkbox',
		selectAllId: 'selectAllDevices',
		barId: 'bulk-actions-devices',
		countId: 'selected-count-devices',
		addBtnId: null,
		rowSelectedClass: 'question-row-selected',
	});
	register('courses', {
		checkboxClass: 'course-checkbox',
		selectAllId: 'selectAllCourses',
		barId: 'bulk-actions-courses',
		countId: 'selected-count-courses',
		addBtnId: 'add-course-btn',
		rowSelectedClass: 'question-row-selected',
	});

	// Keep select-all indeterminate state correct on viewport changes
	// (same resize handling as the questions tab).
	let resizeTimer;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			Object.keys(configs).forEach((tableId) => {
				if (
					document.querySelectorAll(
						`${checkboxSelector(tableId)}:checked`,
					).length > 0
				) {
					updateBar(tableId);
				}
			});
		}, 100);
	});

	window.BulkSelect = {
		register,
		toggleRow,
		toggleSelectAll,
		updateBar,
		restore,
		getSelectedIds,
		clear,
		removeIds,
	};
	// Global inline-handler aliases (match the question-tab naming style).
	window.toggleBulkRowSelection = toggleRow;
	window.toggleBulkSelectAllGeneric = toggleSelectAll;
})();

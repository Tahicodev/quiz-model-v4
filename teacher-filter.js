// ============================================
// TEACHER FILTER - SHARED HELPER (ADMIN ONLY)
// ============================================
// Gives the admin a "filter by teacher" dropdown on every main tab so they
// can inspect each teacher's activities (questions, categories, exams,
// classes, results, games). The dropdown is visible ONLY in an admin
// session; teachers/students never see it and their own role-scoped views
// are untouched.
//
// Ownership spans both vocabularies: legacy `ownerId` and server-stamped
// `created_by` / `creator_id`. Classes/results resolve through the teacher's
// assigned classes (user rows + the local assignments mirror), mirroring
// the logic in class-management.js without depending on its load order.
(function () {
	'use strict';

	const FILTERS = [
		{ selectId: 'questionTeacherFilter', wrapId: 'questionTeacherFilterWrap' },
		{ selectId: 'categoryTeacherFilter', wrapId: 'categoryTeacherFilterWrap' },
		{ selectId: 'examTeacherFilter', wrapId: 'examTeacherFilterWrap' },
		// classes + users + kids-games keep their own existing filters.
		{ selectId: 'resultTeacherFilter', wrapId: 'resultTeacherFilterWrap' },
		{ selectId: 'gameTeacherFilter', wrapId: 'gameTeacherFilterWrap' },
	];

	function isAdminSession() {
		try {
			return !!(window.Auth?.isAdmin && window.Auth.isAdmin());
		} catch (_) {
			return false;
		}
	}

	function getTeachers() {
		let users = [];
		try {
			users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
		} catch (_) {
			users = [];
		}
		return (Array.isArray(users) ? users : [])
			.filter((u) => String(u.role || '').toLowerCase() === 'teacher')
			.sort((a, b) =>
				String(a.name || a.username || '').localeCompare(
					String(b.name || b.username || ''),
				),
			)
			.map((t) => ({
				id: String(t.id),
				name: t.name || t.username || 'Teacher',
			}));
	}

	function getOwnerId(item) {
		if (!item || typeof item !== 'object') return '';
		return String(
			item.ownerId ||
				item.created_by ||
				item.createdBy ||
				item.creator_id ||
				item.creatorId ||
				'',
		);
	}

	// Teacher -> class ids, unioning the teacher row (classIds) with the
	// localStorage assignments mirror (same freshness contract as the users
	// table: mirror wins when this tab saved after bootstrap).
	function getTeacherClassIds(teacherId) {
		const tid = String(teacherId || '');
		if (!tid) return [];
		const ids = new Set();
		try {
			const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
			const teacher = (Array.isArray(users) ? users : []).find(
				(u) => String(u.id) === tid,
			);
			(teacher?.classIds || []).forEach((id) => ids.add(String(id)));
		} catch (_) {
			/* ignore */
		}
		try {
			const raw = localStorage.getItem('quizTeacherClassAssignments');
			const map = raw ? JSON.parse(raw) : {};
			((map && map[tid]) || []).forEach((id) => ids.add(String(id)));
		} catch (_) {
			/* mirror is best-effort */
		}
		try {
			const repo = window.__DI_CONTAINER__?.repo;
			const rawSettings = repo?.getValue_sync?.('settings', {});
			const row =
				rawSettings && Array.isArray(rawSettings.settings)
					? rawSettings.settings.find(
							(s) => s && s.key === 'teacherClassAssignments',
						)
					: null;
			if (row?.value) {
				const parsed = JSON.parse(row.value);
				((parsed && parsed[tid]) || []).forEach((id) => ids.add(String(id)));
			}
		} catch (_) {
			/* repo cache is best-effort */
		}
		return Array.from(ids);
	}

	// Map class id -> assigned teacher display names, built once per render
	// (getTeacherClassIds does storage reads, so per-row calls would be slow).
	function buildClassTeacherMap() {
		const map = new Map();
		try {
			const teachers = getTeachers();
			teachers.forEach((t) => {
				getTeacherClassIds(t.id).forEach((classId) => {
					if (!map.has(classId)) map.set(classId, []);
					map.get(classId).push(t.name);
				});
			});
		} catch (_) {
			/* ignore */
		}
		return map;
	}

	function resolveOwnerName(item) {
		try {
			if (typeof window.getOwnerLabel === 'function') {
				const getId =
					typeof window.getOwnerId === 'function'
						? window.getOwnerId
						: getOwnerId;
				return window.getOwnerLabel(getId(item));
			}
		} catch (_) {
			/* fall through */
		}
		const owner = getOwnerId(item);
		if (!owner) return 'Shared';
		try {
			const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
			const found = (Array.isArray(users) ? users : []).find(
				(u) => String(u.id) === String(owner),
			);
			if (found) return found.name || found.username || 'Teacher';
		} catch (_) {
			/* ignore */
		}
		return 'Teacher';
	}

	// Display name(s) of the teacher(s) behind a result: the teacher(s) of
	// the result's class, falling back to the exam's creator.
	function resolveResultTeacherNames(result, classTeacherMap) {
		const names = [];
		try {
			const map =
				classTeacherMap instanceof Map ? classTeacherMap : buildClassTeacherMap();
			const classId = String(result?.classId || result?.class_id || '');
			if (classId && map.has(classId)) {
				names.push(...map.get(classId));
			} else {
				const className = String(
					result?.class || result?.className || result?.class_name || '',
				);
				if (className) {
					const classes =
						window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
					const match = (Array.isArray(classes) ? classes : []).find(
						(c) => String(c.name || '') === className,
					);
					if (match && map.has(String(match.id))) {
						names.push(...map.get(String(match.id)));
					}
				}
			}
		} catch (_) {
			/* ignore */
		}
		if (!names.length) {
			try {
				const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams') || [];
				const exam = (Array.isArray(exams) ? exams : []).find(
					(e) =>
						String(e.id) ===
						String(result?.examId || result?.exam_id || ''),
				);
				if (exam && getOwnerId(exam)) names.push(resolveOwnerName(exam));
			} catch (_) {
				/* ignore */
			}
		}
		const unique = [...new Set(names.filter(Boolean))];
		return unique.length ? unique.join(', ') : '—';
	}

	// Owner badge HTML (question-tab style). Always rendered; visibility for
	// non-admin sessions is handled via the hide-owner / hide-owner-col
	// classes toggled by each list renderer.
	function ownerBadge(item) {
		return `<span class="q-owner-badge" title="Created by">${escapeHtmlLocal(resolveOwnerName(item))}</span>`;
	}

	function escapeHtmlLocal(value) {
		if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function getSelectedTeacher(selectId) {
		// In non-admin sessions the filter must never apply, even if a stale
		// value survived in the DOM.
		if (!isAdminSession()) return '';
		const el = document.getElementById(selectId);
		return el ? String(el.value || '') : '';
	}

	function matchesOwner(item, teacherId) {
		if (!teacherId) return true;
		return getOwnerId(item) === String(teacherId);
	}

	function matchesClass(item, teacherId) {
		if (!teacherId) return true;
		const classIds = new Set(getTeacherClassIds(teacherId));
		if (classIds.has(String(item?.id))) return true;
		return getOwnerId(item) === String(teacherId);
	}

	function matchesResult(result, teacherId) {
		if (!teacherId) return true;
		const classIds = new Set(getTeacherClassIds(teacherId));
		const classId = String(result?.classId || result?.class_id || '');
		if (classId && classIds.has(classId)) return true;
		// Fall back to class-name matching (virtual classes / legacy rows).
		const className = String(
			result?.class || result?.className || result?.class_name || '',
		);
		if (className) {
			try {
				const classes =
					window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
				const match = (Array.isArray(classes) ? classes : []).find(
					(c) => String(c.name || '') === className,
				);
				if (match && classIds.has(String(match.id))) return true;
			} catch (_) {
				/* ignore */
			}
		}
		// Results of the teacher's own exams still count as their activity.
		try {
			const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams') || [];
			const exam = (Array.isArray(exams) ? exams : []).find(
				(e) =>
					String(e.id) ===
					String(result?.examId || result?.exam_id || ''),
			);
			if (exam && getOwnerId(exam) === String(teacherId)) return true;
		} catch (_) {
			/* ignore */
		}
		return false;
	}

	function populate(selectId, wrapId, onChange) {
		const sel = document.getElementById(selectId);
		const wrap = wrapId ? document.getElementById(wrapId) : null;
		const admin = isAdminSession();
		if (wrap) wrap.style.display = admin ? '' : 'none';
		if (!sel) return;
		if (!admin) {
			sel.value = '';
			return;
		}
		const current = String(sel.value || '');
		const teachers = getTeachers();
		sel.innerHTML =
			'<option value="">All Teachers</option>' +
			teachers
				.map(
					(t) =>
						`<option value="${escapeHtmlLocal(t.id)}">${escapeHtmlLocal(t.name)}</option>`,
				)
				.join('');
		sel.value = teachers.some((t) => t.id === current) ? current : '';
		if (onChange && !sel.dataset.teacherFilterBound) {
			sel.addEventListener('change', onChange);
			sel.dataset.teacherFilterBound = 'true';
		}
	}

	function refreshAll() {
		populate(
			'questionTeacherFilter',
			'questionTeacherFilterWrap',
			() => window.filterQuestions && window.filterQuestions(),
		);
		populate(
			'categoryTeacherFilter',
			'categoryTeacherFilterWrap',
			() => window.filterCategories && window.filterCategories(),
		);
		populate(
			'examTeacherFilter',
			'examTeacherFilterWrap',
			() => window.filterExams && window.filterExams(),
		);
		populate(
			'resultTeacherFilter',
			'resultTeacherFilterWrap',
			() => window.filterResults && window.filterResults(),
		);
		populate(
			'gameTeacherFilter',
			'gameTeacherFilterWrap',
			() => window.applyGameFilters && window.applyGameFilters(),
		);
		// Re-apply the teacher scope to the visible lists without wiping
		// search text or bulk selections.
		try {
			if (window.filterQuestions) window.filterQuestions(false);
		} catch (_) {
			/* ignore */
		}
	}

	window.TeacherFilter = {
		isAdminSession,
		getTeachers,
		getOwnerId,
		getTeacherClassIds,
		getSelectedTeacher,
		matchesOwner,
		matchesClass,
		matchesResult,
		populate,
		refreshAll,
		buildClassTeacherMap,
		resolveOwnerName,
		resolveResultTeacherNames,
		ownerBadge,
	};

	document.addEventListener('DOMContentLoaded', () => {
		try {
			refreshAll();
		} catch (_) {
			/* Auth may not be ready yet; bootstrap event retries below */
		}
	});
	window.addEventListener('quiz:bootstrap-ready', () => {
		try {
			refreshAll();
		} catch (_) {
			/* ignore */
		}
	});
})();

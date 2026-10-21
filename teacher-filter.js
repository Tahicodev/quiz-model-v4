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
		// Server-stamped attribution (`created_by` / `creator_id`) is
		// authoritative and wins over the legacy `ownerId`: the edit dialogs
		// used to fall back to "current user" when only `ownerId` was
		// present, so a stale local `ownerId` must never shadow it.
		return String(
			item.created_by ||
				item.creator_id ||
				item.ownerId ||
				item.createdBy ||
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

	// Saved classes (repo cache). Virtual classes created on the fly during
	// quizzes are not stored here; results without a saved class fall through
	// to the exam-owner fallback.
	function getClasses() {
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
		} catch (_) {
			return [];
		}
	}

	// The { id, name } class "behind" a result, using the same precedence as
	// resolveResultClass (results-management.js) so the By badge, the Class
	// cell, and the teacher filter can never disagree on attribution:
	//   1. result.classId / class_id (direct id match);
	//   2. result.class / className / class_name (saved-class name match);
	//   3. the attempt's student (userId) -> their registered class.
	// Server-persisted training rows may carry NO class fields at all (some
	// write paths only store them inside answers_json metadata); step 3 is
	// what keeps those rows attributed to the right teachers.
	function resolveResultClassRef(result) {
		if (!result || typeof result !== 'object') return null;
		const classes = getClasses();
		const resultClassId = String(result.classId || result.class_id || '');
		if (resultClassId) {
			const match = classes.find(
				(c) => String(c.id) === resultClassId,
			);
			if (match) return { id: String(match.id), name: match.name || '' };
		}
		const resultClassName = String(
			result.class || result.className || result.class_name || '',
		);
		if (resultClassName) {
			const match = classes.find(
				(c) => String(c.name || '') === resultClassName,
			);
			if (match) return { id: String(match.id), name: match.name || '' };
		}
		const userId = String(result.userId || result.user_id || '');
		if (!userId) return null;
		try {
			const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
			const user = (Array.isArray(users) ? users : []).find(
				(u) => String(u.id) === userId,
			);
			const userClassId = String(user?.classId || user?.class_id || '');
			const userClassName = String(
				user?.className || user?.class_name || user?.class || '',
			);
			const match = userClassId
				? classes.find((c) => String(c.id) === userClassId)
				: userClassName
					? classes.find((c) => String(c.name || '') === userClassName)
					: null;
			if (match) return { id: String(match.id), name: match.name || '' };
			if (userClassName) return { id: '', name: userClassName };
		} catch (_) {
			/* users store is best-effort */
		}
		return null;
	}

	// Normalize a caller-supplied class row / { className } face / ref into a
	// class ref. Returns null when nothing usable is on it.
	function classRefFromHint(hint) {
		if (!hint || typeof hint !== 'object') return null;
		const id = String(hint.id ?? '');
		const name = String(hint.name ?? hint.className ?? hint.class ?? '');
		return id || name ? { id, name } : null;
	}

	// Teacher display names assigned to a { id, name } class ref.
	function teacherNamesForClassRef(classRef, classTeacherMap) {
		if (!classRef) return [];
		const map =
			classTeacherMap instanceof Map
				? classTeacherMap
				: buildClassTeacherMap();
		if (classRef.id && map.has(classRef.id)) return [...map.get(classRef.id)];
		if (classRef.name) {
			const match = getClasses().find(
				(c) => String(c.name || '') === classRef.name,
			);
			if (match && map.has(String(match.id))) {
				return [...map.get(String(match.id))];
			}
		}
		return [];
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
		// No "Shared" concept anymore: every teacher sees only their own
		// rows, so unattributed legacy rows render without an author name.
		if (!owner) return '';
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
	// the result's class (direct id → class name → the student's registered
	// class), falling back to the exam's creator. `resolvedClassHint` lets a
	// caller that already computed the row's class (results tab) reuse it so
	// the Class cell and the By badge agree by construction.
	function resolveResultTeacherNames(result, classTeacherMap, resolvedClassHint) {
		const classRef =
			classRefFromHint(resolvedClassHint) || resolveResultClassRef(result);
		let names = teacherNamesForClassRef(classRef, classTeacherMap);
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
	// classes toggled by each list renderer. Empty when there is no recorded
	// author (no "Shared" badge anymore).
	function ownerBadge(item) {
		const name = resolveOwnerName(item);
		if (!name) return '';
		return `<span class="q-owner-badge" title="Created by">${escapeHtmlLocal(name)}</span>`;
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

	// Filter matches use the same resolution as the By badge, with the same
	// optional class hint, so filtering by a teacher never hides a row whose
	// badge shows that teacher's name.
	function matchesResult(result, teacherId, resolvedClassHint) {
		if (!teacherId) return true;
		const classIds = new Set(getTeacherClassIds(teacherId));
		const classRef =
			classRefFromHint(resolvedClassHint) || resolveResultClassRef(result);
		if (classRef?.id && classIds.has(classRef.id)) return true;
		if (classRef?.name) {
			// Virtual/legacy rows may only be recognizable by class name.
			const match = getClasses().find(
				(c) => String(c.name || '') === classRef.name,
			);
			if (match && classIds.has(String(match.id))) return true;
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
		resolveResultClassRef,
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

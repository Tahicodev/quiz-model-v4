// ============================================
// OVERVIEW DASHBOARD LOGIC
// ============================================
// Manages the "Overview" tab: Stats, Charts, Activity Feed

document.addEventListener('DOMContentLoaded', () => {
	// Normalize persisted activity log on load so UI renders consistent entries
	if (typeof normalizeActivityLog === 'function') normalizeActivityLog();

	// Initialize if we are on the Overview tab (default) or when switched to
	if (document.getElementById('overview').classList.contains('active')) {
		initDashboard();
	}

	// Re-run KPIs whenever the DB bootstrap lands. The legacy bridge hydrates
	// the repo cache asynchronously from GET /api/v1/bootstrap — without
	// this listener the Overview numbers only reflected the (possibly stale)
	// localStorage cache until a manual reload.
	window.addEventListener('quiz:bootstrap-ready', () => {
		if (typeof initDashboard === 'function') initDashboard();
	});
});

// Exposed init function for tab switching
function initDashboard() {
	overviewStatsCache = null;
	populateOverviewFilters();
	updateDashboardStats();
	renderRecentActivity();
	updateGreeting();
}

// ============================================
// OVERVIEW SCOPE — teacher isolation + admin filters
// ============================================
// Teachers always see only their own activities, classes and students
// (pinned to their own id + assigned classes). Admins see everything and
// narrow the whole tab through the Overview filter bar (teacher, then
// class). The server bootstrap already scopes teacher caches; these
// helpers enforce the same rule explicitly so stale local rows can never
// leak across teachers.
function overviewIsAdmin() {
	try {
		if (window.TeacherFilter) return window.TeacherFilter.isAdminSession();
		return !!(window.Auth?.isAdmin && window.Auth.isAdmin());
	} catch (_) {
		return false;
	}
}

function overviewMe() {
	try {
		return window.Auth?.getCurrentUser?.() || window.currentUser || null;
	} catch (_) {
		return null;
	}
}

// { teacherId, classId, categoryId } for the current view. Teachers are
// pinned to themselves (class/category/student narrow within their own
// data); admins read the filter bar (empty = all).
function getOverviewScope() {
	if (!overviewIsAdmin()) {
		return {
			teacherId: String(overviewMe()?.id || ''),
			classId: String(
				document.getElementById('overviewClassFilter')?.value || '',
			),
			categoryId: String(
				document.getElementById('overviewCategoryFilter')?.value || '',
			),
			studentId: String(
				document.getElementById('overviewStudentFilter')?.value || '',
			),
		};
	}
	return {
		teacherId: String(
			document.getElementById('overviewTeacherFilter')?.value || '',
		),
		classId: String(
			document.getElementById('overviewClassFilter')?.value || '',
		),
		categoryId: String(
			document.getElementById('overviewCategoryFilter')?.value || '',
		),
		studentId: String(
			document.getElementById('overviewStudentFilter')?.value || '',
		),
	};
}

function overviewOwnerId(row) {
	if (!row || typeof row !== 'object') return '';
	return String(
		row.ownerId ||
			row.created_by ||
			row.createdBy ||
			row.creator_id ||
			row.creatorId ||
			'',
	);
}

// Resolve a student filter key (user id or student number) to { id, numero }.
function overviewResolveStudentKey(studentId) {
	const key = String(studentId || '').trim();
	if (!key) return { id: '', numero: '' };
	let users = [];
	try {
		users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
	} catch (_) {
		users = [];
	}
	const byId = users.find((u) => u && String(u.id) === key);
	if (byId) {
		return {
			id: String(byId.id),
			numero: String(byId.studentNumber || byId.numero || '').trim(),
		};
	}
	const byNum = users.find(
		(u) =>
			u &&
			String(u.studentNumber || u.numero || '').trim() === key,
	);
	if (byNum) {
		return {
			id: String(byNum.id || ''),
			numero: key,
		};
	}
	return { id: key, numero: key };
}

function overviewStudentMatchesRow(key, row) {
	if (!row || typeof row !== 'object') return false;
	if (key.id && String(row.user_id ?? row.userId ?? '') === key.id) {
		return true;
	}
	if (key.numero) {
		const num = String(
			row.studentNumber ?? row.numero ?? row.user?.studentNumber ?? '',
		).trim();
		if (num && num === key.numero) return true;
	}
	return false;
}

// Classes visible in scope (used for KPIs, charts and result attribution).
// A selected student focuses their own class.
function overviewScopeClasses() {
	let classes = [];
	try {
		classes = window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
	} catch (_) {
		classes = [];
	}
	let base = classes;
	if (!overviewIsAdmin()) {
		const mine = window.TeacherFilter?.getTeacherClassIds
			? window.TeacherFilter.getTeacherClassIds(overviewMe()?.id) || []
			: [];
		const allowed = new Set(mine.map(String));
		base = classes.filter((c) => c && allowed.has(String(c.id)));
	} else {
		const scope = getOverviewScope();
		if (scope.classId) {
			base = classes.filter((c) => c && String(c.id) === scope.classId);
		} else if (scope.teacherId && window.TeacherFilter?.getTeacherClassIds) {
			const allowed = new Set(
				(window.TeacherFilter.getTeacherClassIds(scope.teacherId) || []).map(
					String,
				),
			);
			base = classes.filter((c) => c && allowed.has(String(c.id)));
		}
	}
	const studentId = getOverviewScope().studentId;
	if (studentId) {
		const key = overviewResolveStudentKey(studentId);
		let users = [];
		try {
			users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
		} catch (_) {
			users = [];
		}
		const match = users.find(
			(u) =>
				u &&
				((key.id && String(u.id) === key.id) ||
					(key.numero &&
						String(u.studentNumber || u.numero || '').trim() === key.numero)),
		);
		const cid = match
			? String(match.classId || match.class_id || '')
			: '';
		if (!cid) return [];
		return base.filter((c) => String(c.id) === cid);
	}
	return base;
}

// Authored rows (questions, categories, exams, games) visible in scope.
// Structural rows (Uncategorized) always pass.
function scopeAuthoredRows(rows) {
	const list = Array.isArray(rows) ? rows : [];
	const { teacherId } = getOverviewScope();
	if (!teacherId) return list;
	return list.filter((r) => {
		if (!r || typeof r !== 'object') return false;
		if (r.isSystem || r.id === 'uncategorized') return true;
		return overviewOwnerId(r) === teacherId;
	});
}

// Resolve a result's class id (direct fields, then class-name lookup).
function overviewResultClassId(result, classes) {
	if (!result || typeof result !== 'object') return '';
	const direct =
		result.classId || result.class_id || result.classID || '';
	if (direct) {
		const hit = (classes || []).find((c) => String(c.id) === String(direct));
		if (hit) return String(hit.id);
		// A raw id with no matching class row still counts when it matches
		// the active filter exactly (offline-created rows).
		return String(direct);
	}
	const name = result.class || result.className || result.studentClass || '';
	if (!name) return '';
	const match = (classes || []).find(
		(c) => String(c.name || '') === String(name) || String(c.className || '') === String(name),
	);
	return match ? String(match.id) : '';
}

// Result rows visible in scope. Teachers are pinned to their classes;
// admins narrow by class, or by teacher (their classes). Unattributable
// rows are dropped under any active scope.
function scopeResultRows(results) {
	const list = Array.isArray(results) ? results : [];
	const scope = getOverviewScope();
	let allowed = null;
	if (!overviewIsAdmin()) {
		allowed = new Set(overviewScopeClasses().map((c) => String(c.id)));
	} else if (scope.classId || scope.teacherId) {
		allowed = new Set(overviewScopeClasses().map((c) => String(c.id)));
	}
	if (!allowed) {
		// No class scope, but a student filter still narrows.
		if (!scope.studentId) return list;
		const onlyKey = overviewResolveStudentKey(scope.studentId);
		return list.filter((r) => overviewStudentMatchesRow(onlyKey, r));
	}
	let classes = [];
	try {
		classes = window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
	} catch (_) {
		classes = [];
	}
	const inClass = list.filter((r) => {
		const cid = overviewResultClassId(r, classes);
		return cid && allowed.has(cid);
	});
	// Student filter narrows to that student's rows (id or number).
	if (!scope.studentId) return inClass;
	const key = overviewResolveStudentKey(scope.studentId);
	return inClass.filter((r) => overviewStudentMatchesRow(key, r));
}

// { ids, numeros } of the students in scope, or null when unrestricted.
// A selected student narrows to just them (coherence-checked against the
// class scope: a student outside it yields an empty set).
function overviewScopedStudents() {
	const scope = getOverviewScope();
	let allowed = null;
	if (!overviewIsAdmin()) {
		allowed = new Set(overviewScopeClasses().map((c) => String(c.id)));
	} else if (scope.classId || scope.teacherId || scope.studentId) {
		allowed = new Set(overviewScopeClasses().map((c) => String(c.id)));
	}
	if (!allowed) return null;
	let users = [];
	try {
		users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
	} catch (_) {
		users = [];
	}
	const students = users.filter(
		(u) =>
			u &&
			String(u.role || '').toLowerCase() === 'student' &&
			allowed.has(String(u.classId || u.class_id || '')),
	);
	if (scope.studentId) {
		const key = overviewResolveStudentKey(scope.studentId);
		const match = students.find(
			(u) =>
				(key.id && String(u.id) === key.id) ||
				(key.numero &&
					String(u.studentNumber || u.numero || '').trim() === key.numero),
		);
		if (!match) return { ids: new Set(), numeros: new Set() };
		const numero = String(
			match.studentNumber || match.numero || '',
		).trim();
		return {
			ids: match.id ? new Set([String(match.id)]) : new Set(),
			numeros: numero ? new Set([numero]) : new Set(),
		};
	}
	const ids = new Set();
	const numeros = new Set();
	for (const u of students) {
		if (u.id) ids.add(String(u.id));
		const num = String(u.studentNumber || u.numero || '').trim();
		if (num) numeros.add(num);
	}
	return { ids, numeros };
}

function studentEntryInScope(entry) {
	const scoped = overviewScopedStudents();
	if (!scoped) return true;
	const sid = entry?.user?.id || entry?.userId || '';
	if (sid && scoped.ids.has(String(sid))) return true;
	const num =
		entry?.user?.studentNumber || entry?.studentNumber || entry?.numero || '';
	return !!(num && scoped.numeros.has(String(num)));
}

// An audit/activity entry is visible when: no active scope (admin, no
// filter), or it was performed by the scoped teacher, or it concerns a
// student in scope (results, profile requests). A selected student hides
// everything not about them.
function auditEntryInScope(entry) {
	if (!entry || typeof entry !== 'object') return false;
	const scope = getOverviewScope();
	if (scope.studentId) {
		if (entry.type !== 'result' && entry.type !== 'profile_request') {
			return false;
		}
		return studentEntryInScope(entry);
	}
	if (!scope.teacherId) {
		if (!scope.classId) return true;
		if (entry.type !== 'result' && entry.type !== 'profile_request') {
			return true;
		}
		return studentEntryInScope(entry);
	}
	const actorId = String(entry.user?.id || entry.userId || '');
	if (actorId && actorId === scope.teacherId) return true;
	if (entry.type === 'result' || entry.type === 'profile_request') {
		return studentEntryInScope(entry);
	}
	return false;
}

// ============================================
// CATEGORY INSIGHTS — per-answer accuracy engine
// ============================================
// Answers live in result.answers_json keyed by question id
// ({ "<qid>": <student answer> }), the same shape the exam analysis
// reads. Aggregating them over the scoped results yields training vs
// exam accuracy per category, per class, and per question (so teachers
// see what was answered and what students struggle with).

function ovParseJson(value, fallback) {
	if (value == null || value === '') return fallback;
	if (typeof value === 'object') return value;
	try {
		return JSON.parse(value);
	} catch (_) {
		return fallback;
	}
}

function ovNormalizeAnswer(value) {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		try {
			return ovNormalizeAnswer(JSON.parse(trimmed));
		} catch (_) {
			return trimmed.toLowerCase();
		}
	}
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (Array.isArray(value)) {
		return value
			.map(ovNormalizeAnswer)
			.filter((v) => v !== null)
			.sort((a, b) => String(a).localeCompare(String(b)));
	}
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value).toLowerCase();
}

function ovAnswersEqual(userAnswer, correctAnswer) {
	const a = ovNormalizeAnswer(userAnswer);
	const b = ovNormalizeAnswer(correctAnswer);
	if (a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function ovQuestionCategoryId(question) {
	if (!question || typeof question !== 'object') return 'uncategorized';
	const raw = question.category ?? question.categoryId ?? question.category_id ?? '';
	const text = String(raw).trim();
	return text || 'uncategorized';
}

function ovResultBucket(result) {
	const mode = String(result?.mode || 'exam').toLowerCase();
	if (mode === 'training') return 'training';
	if (mode === 'exam') return 'exam';
	return 'other';
}

// Selected category + whole subtree (roll-up, like training). Null = all.
function overviewScopeCategoryIds() {
	const selected = String(
		document.getElementById('overviewCategoryFilter')?.value || '',
	);
	if (!selected) return null;
	let categories = [];
	try {
		categories = window.__DI_CONTAINER__.repo.getAll_sync('categories') || [];
	} catch (_) {
		categories = [];
	}
	const childrenOf = new Map();
	for (const c of categories) {
		if (!c || !c.id) continue;
		const parent = String(c.parent_id ?? c.parentId ?? '');
		if (!parent) continue;
		if (!childrenOf.has(parent)) childrenOf.set(parent, []);
		childrenOf.get(parent).push(String(c.id));
	}
	const ids = new Set([selected]);
	const queue = [selected];
	const seen = new Set([selected]);
	while (queue.length) {
		const current = queue.shift();
		for (const child of childrenOf.get(current) || []) {
			if (seen.has(child)) continue;
			seen.add(child);
			ids.add(child);
			queue.push(child);
		}
	}
	return ids;
}

function overviewCategoryDepth(id, categories) {
	const byId = new Map(
		(categories || []).map((c) => [String(c?.id), c]),
	);
	let depth = 0;
	let current = String(id || '');
	const seen = new Set([current]);
	for (;;) {
		const row = byId.get(current);
		const parent = row ? String(row.parent_id ?? row.parentId ?? '') : '';
		if (!parent || seen.has(parent)) break;
		seen.add(parent);
		depth += 1;
		current = parent;
	}
	return depth;
}

function overviewCategoryBreadcrumb(id, categories) {
	const byId = new Map(
		(categories || []).map((c) => [String(c?.id), c]),
	);
	const names = [];
	let current = String(id || '');
	const seen = new Set();
	while (current && !seen.has(current)) {
		seen.add(current);
		const row = byId.get(current);
		if (!row) break;
		names.unshift(String(row.name || 'Unnamed'));
		current = String(row.parent_id ?? row.parentId ?? '');
	}
	return names.join(' › ');
}

let overviewStatsCache = null;

function emptyAccuracyBucket() {
	return { attempts: 0, correct: 0, training: { a: 0, c: 0 }, exam: { a: 0, c: 0 }, other: { a: 0, c: 0 } };
}

function bumpAccuracyBucket(entry, correct, bucket) {
	entry.attempts += 1;
	if (correct) entry.correct += 1;
	if (entry[bucket]) {
		entry[bucket].a += 1;
		if (correct) entry[bucket].c += 1;
	}
}

// Full per-answer aggregation over the scoped results, memoized per
// dashboard refresh (reset in initDashboard).
function getOverviewCategoryStats() {
	if (overviewStatsCache) return overviewStatsCache;
	let questions = [];
	let results = [];
	let classes = [];
	let categories = [];
	try {
		const repo = window.__DI_CONTAINER__.repo;
		questions = scopeAuthoredRows(repo.getAll_sync('questions'));
		results = scopeResultRows(repo.getAll_sync('results'));
		classes = overviewScopeClasses();
		categories = repo.getAll_sync('categories') || [];
	} catch (_) {
		/* keep empty */
	}
	const catSet = overviewScopeCategoryIds();
	const questionsById = new Map();
	for (const q of questions) {
		if (q && q.id != null) questionsById.set(String(q.id), q);
	}
	const inSet = (qid) => {
		const q = questionsById.get(String(qid));
		if (!q) return false;
		if (!catSet) return true;
		return catSet.has(ovQuestionCategoryId(q));
	};
	const perQuestion = new Map();
	const perCategory = new Map();
	const perClass = new Map();
	const totals = emptyAccuracyBucket();
	const touch = (map, key) => {
		let entry = map.get(key);
		if (!entry) {
			entry = emptyAccuracyBucket();
			map.set(key, entry);
		}
		return entry;
	};
	for (const r of results) {
		const answers = ovParseJson(r.answers_json ?? r.answers, null);
		if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
			continue;
		}
		const bucket = ovResultBucket(r);
	 let classId = '';
		try {
			classId = overviewResultClassId(r, classes);
		} catch (_) {
			classId = '';
		}
		for (const qid of Object.keys(answers)) {
			if (!inSet(qid)) continue;
			const q = questionsById.get(String(qid));
			const correct = ovAnswersEqual(answers[qid], q.answer);
			bumpAccuracyBucket(totals, correct, bucket);
			bumpAccuracyBucket(touch(perQuestion, String(qid)), correct, bucket);
			bumpAccuracyBucket(touch(perCategory, ovQuestionCategoryId(q)), correct, bucket);
			if (classId) {
				bumpAccuracyBucket(touch(perClass, classId), correct, bucket);
			}
		}
	}
	overviewStatsCache = {
		questionsById,
		categories,
		classes,
		results,
		catSet,
		perQuestion,
		perCategory,
		perClass,
		totals,
	};
	return overviewStatsCache;
}

// Does this result contain at least one answer to a question in the
// current category set? (No set = always true.) Shared with the charts so
// Class Performance / Score Distribution follow the category filter.
function overviewResultTouchesCategories(result, stats) {
	const data = stats || getOverviewCategoryStats();
	if (!data.catSet) return true;
	const answers = ovParseJson(result?.answers_json ?? result?.answers, null);
	if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
		return false;
	}
	return Object.keys(answers).some((qid) => {
		const q = data.questionsById.get(String(qid));
		return q && data.catSet.has(ovQuestionCategoryId(q));
	});
}

// Populate the Overview filter bar. The teacher dropdown is admin-only
// (TeacherFilter hides its wrap in teacher sessions); the class and
// category dropdowns list the scope values and preserve theirs when
// still valid.
function populateOverviewFilters() {
	try {
		if (window.TeacherFilter) {
			window.TeacherFilter.populate(
				'overviewTeacherFilter',
				'overviewTeacherFilterWrap',
				() => {
					// Hierarchical filters: a new teacher resets the
					// dependent class/student picks (their options rebuild).
					const classEl = document.getElementById('overviewClassFilter');
					if (classEl) classEl.value = '';
					const stuEl = document.getElementById('overviewStudentFilter');
					if (stuEl) stuEl.value = '';
					initDashboard();
				},
			);
		}
	} catch (_) {
		/* filter bar is best-effort */
	}
	const classEl = document.getElementById('overviewClassFilter');
	if (!classEl) return;
	const previous = String(classEl.value || '');
	const scoped = overviewScopeClasses();
	classEl.innerHTML = '<option value="">All Classes</option>';
	scoped.forEach((cls) => {
		if (!cls || (!cls.id && !cls.name)) return;
		const opt = document.createElement('option');
		opt.value = cls.id || cls.name;
		opt.textContent = cls.name || 'Untitled Class';
		classEl.appendChild(opt);
	});
	const stillValid =
		previous &&
		[...classEl.options].some((o) => o.value === previous);
	if (stillValid) {
		classEl.value = previous;
	} else {
		classEl.value = '';
	}
		if (!classEl.dataset.listenerAdded) {
			classEl.addEventListener('change', () => {
				// A new class resets the dependent student pick.
				const stuEl = document.getElementById('overviewStudentFilter');
				if (stuEl) stuEl.value = '';
				initDashboard();
			});
			classEl.dataset.listenerAdded = 'true';
		}
	const catEl = document.getElementById('overviewCategoryFilter');
	if (catEl) {
		const previousCat = String(catEl.value || '');
		let categories = [];
		try {
			categories =
				window.__DI_CONTAINER__.repo.getAll_sync('categories') || [];
		} catch (_) {
			categories = [];
		}
		const visibleCats = categories.filter(
			(c) =>
				c &&
				c.id &&
				!c.isSystem &&
				(!window.Auth?.canAccessItem ||
					window.Auth.canAccessItem('category', c)),
		);
		const ordered = visibleCats
			.map((c) => ({ c, depth: overviewCategoryDepth(c.id, categories) }))
			.sort(
				(a, b) =>
					a.depth - b.depth ||
					String(a.c.name || '').localeCompare(String(b.c.name || '')),
			);
		catEl.innerHTML = '<option value="">All Categories</option>';
		const uncOpt = document.createElement('option');
		uncOpt.value = 'uncategorized';
		uncOpt.textContent = 'Uncategorized';
		catEl.appendChild(uncOpt);
		ordered.forEach(({ c, depth }) => {
			const opt = document.createElement('option');
			opt.value = c.id;
			opt.textContent = `${'\u2014 '.repeat(depth)}${c.name || 'Unnamed'}`;
			catEl.appendChild(opt);
		});
		const stillValidCat =
			previousCat &&
			[...catEl.options].some((o) => o.value === previousCat);
		catEl.value = stillValidCat ? previousCat : '';
		if (!catEl.dataset.listenerAdded) {
			catEl.addEventListener('change', () => initDashboard());
			catEl.dataset.listenerAdded = 'true';
		}
	}
	const stuEl = document.getElementById('overviewStudentFilter');
	if (stuEl) {
		const previousStu = String(stuEl.value || '');
		// Students load per selected class only: pick a class first and the
		// dropdown fills with that class's students (never other classes',
		// never other teachers'). The selection is preserved when valid.
		const classSelected = String(
			document.getElementById('overviewClassFilter')?.value || '',
		);
		let students = [];
		if (classSelected) {
			try {
				students = (
					window.__DI_CONTAINER__.repo.getAll_sync('users') || []
				).filter((u) => u && String(u.role || '').toLowerCase() === 'student');
			} catch (_) {
				students = [];
			}
			const scoped = overviewScopedStudents();
			if (scoped) {
				students = students.filter(
					(u) =>
						(u.id && scoped.ids.has(String(u.id))) ||
						([
							String(u.studentNumber || '').trim(),
							String(u.numero || '').trim(),
						].some((n) => n && scoped.numeros.has(n))),
				);
			} else {
				students = students.filter(
					(u) => String(u.classId || u.class_id || '') === classSelected,
				);
			}
		}
		students.sort((a, b) =>
			String(a.name || a.username || '').localeCompare(
				String(b.name || b.username || ''),
			),
		);
		stuEl.innerHTML = '<option value="">All Students</option>';
		if (!classSelected) {
			const hint = document.createElement('option');
			hint.value = '';
			hint.textContent = 'Select a class first';
			hint.disabled = true;
			stuEl.appendChild(hint);
		}
		students.forEach((u) => {
			if (!u || (!u.id && !u.studentNumber && !u.numero)) return;
			const num = String(u.studentNumber || u.numero || '').trim();
			const opt = document.createElement('option');
			opt.value = u.id || num;
			opt.textContent = num
				? `#${num} - ${u.name || u.username || 'Student'}`
				: `${u.name || u.username || 'Student'}`;
			stuEl.appendChild(opt);
		});
		const stillValidStu =
			previousStu &&
			[...stuEl.options].some((o) => o.value === previousStu);
		stuEl.value = stillValidStu ? previousStu : '';
		if (!stuEl.dataset.listenerAdded) {
			stuEl.addEventListener('change', () => initDashboard());
			stuEl.dataset.listenerAdded = 'true';
		}
	}
}

function updateGreeting() {
	const hours = new Date().getHours();
	const greetingEl = document.getElementById('dashboardGreeting');
	if (!greetingEl) return;

	let greeting = 'Welcome back';
	if (hours < 12) greeting = 'Good morning';
	else if (hours < 18) greeting = 'Good afternoon';
	else greeting = 'Good evening';

	// "Good afternoon, Mme Karim Haddad" — title + full name of the
	// signed-in user (title is set per account by an admin). Falls back to
	// the previous generic label when nobody is signed in.
	let label = 'Admin';
	try {
		const user = window.Auth?.getCurrentUser?.() || window.currentUser || null;
		label =
			window.Auth?.getUserDisplayName?.(user) ||
			user?.name ||
			user?.username ||
			'Admin';
	} catch (_) {
		// Fail-open: keep the generic label rather than blanking the header.
	}

	greetingEl.textContent = `${greeting}, ${label}`;
}

// Centralized mapping for activity type styles (badge class + icon color)
const TYPE_STYLES = {
	question: { badge: 'badge-amber', color: 'icon-amber' },
	exam: { badge: 'badge-purple', color: 'icon-purple' },
	class: { badge: 'badge-green', color: 'icon-green' },
	category: { badge: 'badge-cyan', color: 'icon-cyan' },
	result: { badge: 'badge-blue', color: 'icon-blue' },
	import: { badge: 'badge-indigo', color: 'icon-indigo' },
	export: { badge: 'badge-rose', color: 'icon-rose' },
	profile_request: { badge: 'badge-amber', color: 'icon-amber' },
};

// Helper function to resolve category name from ID
function getCategoryNameFromId(categoryId) {
	if (!categoryId || categoryId === 'uncategorized') {
		return 'uncategorized';
	}
	const categories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
	const category = categories.find((c) => c.id === categoryId);
	return category ? category.name : categoryId;
}

window.scrollKpi = function(containerId, amount) {
	const container = document.getElementById(containerId);
	if (container) {
		container.scrollBy({
			left: amount,
			behavior: 'smooth'
		});
	}
};

function updateDashboardStats() {
	// 1. Total Questions (scope: own for teachers, teacher/class filter for admins)
	const questions = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('questions'),
	);
	animateValue('kpi-questions', 0, questions.length, 1000);

	// 2. Total Categories
	const categories = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('categories'),
	);
	animateValue('kpi-categories', 0, categories.length, 1000);

	// 3. Total Exams
	const exams = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('exams'),
	);
	animateValue('kpi-exams', 0, exams.length, 1000);

	// 4. Total Classes
	const classes = overviewScopeClasses();
	animateValue('kpi-classes', 0, classes.length, 1000);

	// 5. Games KPIs
	const games = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('games'),
	);
	const liveGames = games.filter(
		(game) => String(game?.status || '').toLowerCase() === 'live',
	).length;
	animateValue('kpi-games-total', 0, games.length, 1000);
	animateValue('kpi-games-live', 0, liveGames, 1000);

	// 6. Tournament KPIs
	let activeTournament = null;
		let tournamentsHistory = [];
		try {
			activeTournament = JSON.parse(localStorage.getItem('quizTournamentActive') || 'null');
		} catch (e) {
			activeTournament = null;
		}
		try {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
			const parsed = r ? r.getValue_sync('tournament_history', []) : JSON.parse(localStorage.getItem('quizTournamentsHistory') || '[]');
			tournamentsHistory = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			tournamentsHistory = [];
		}
	const hasActiveTournament = Boolean(activeTournament && activeTournament.id);
	const activeTournamentInHistory = hasActiveTournament
		? tournamentsHistory.some((entry) => entry && entry.id === activeTournament.id)
		: false;
	const totalTournaments =
		tournamentsHistory.length + (hasActiveTournament && !activeTournamentInHistory ? 1 : 0);
	animateValue('kpi-tournaments-total', 0, totalTournaments, 1000);
	animateValue('kpi-tournaments-active', 0, hasActiveTournament ? 1 : 0, 1000);

	// 7. Total Unique Students (scope: own classes for teachers)
	const results = scopeResultRows(
		window.__DI_CONTAINER__.repo.getAll_sync('results'),
	);
	const uniqueStudents = new Set(results.map(r => r.numero || r.studentName || 'Unknown'));
	animateValue('kpi-students-total', 0, uniqueStudents.size, 1000);

	// 8. Generate and Save Reports
	generateAndSaveReports();

	// 9. Advanced KPIs
	renderAdvancedKPIs();

	// 10. Category Insights (training vs exam accuracy, struggling
	// questions, per-class performance for the category scope)
	renderCategoryInsights();
}

// Normalize and deduplicate the persisted `quizActivity` entries so
// they align with generated `quizResults` items. This prevents duplicate
// display and ensures fields like `studentName`, `examTitle`, `dateDisplay`,
// `mode`, and `score` are present for rendering.
function normalizeActivityLog() {
	try {
		const raw = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
		const normalized = raw.map((item) => {
			if (!item || !item.type) return item;

			const type = item.type;
			const style = TYPE_STYLES[type] || {};

			if (type === 'result') {
				// try to extract studentName and examTitle from name if missing
				let studentName =
					item.studentName ||
					(item.name && item.name.split(' — ')[0]) ||
					item.numero ||
					'Student';
				let examTitle =
					item.examTitle ||
					(item.name && item.name.split(' — ')[1]) ||
					item.examTitle ||
					'Training Quiz';
				const dateIso =
					item.date ||
					item.dateTaken ||
					(item.dateDisplay
						? new Date(item.dateDisplay).toISOString()
						: new Date().toISOString());
				const dateDisplay =
					item.dateDisplay || new Date(dateIso).toLocaleString();
				const score = item.score || (item.meta && item.meta.score) || '';
				const mode = item.mode || 'training';

				return Object.assign({}, item, {
					type: 'result',
					studentName,
					examTitle,
					name: `${studentName} — ${examTitle}`,
					date: dateIso,
					dateDisplay,
					mode,
					score,
					color: style.color || item.color || 'icon-blue',
				});
			}

			// Non-result items: ensure date and color/badge consistency
			const dateIso = item.date || item.dateCreated || new Date().toISOString();
			// Normalize metadata field: convert 'metadata' to 'meta' for consistent access
			const meta = item.meta || item.metadata || {};
			return Object.assign({}, item, {
				date: dateIso,
				dateDisplay: item.dateDisplay || new Date(dateIso).toLocaleString(),
				color: style.color || item.color,
				meta: meta,
			});
		});

		// Filter out standard 'completed' results from the persistent log.
		// These are now dynamically handled from the 'quizResults' store for better data integrity.
		const pruned = normalized.filter(item => {
			if (!item) return false;
			// Keep it if it's NOT a result, OR if it's a result with a non-standard action (deleted/edited)
			return item.type !== 'result' || (item.action && item.action !== 'completed');
		});

		// Deduplicate the remaining items (device logs are deduped by signature, not timestamp)
		const sortedPruned = pruned
			.slice()
			.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
		const out = [];
		const seen = new Set();
		for (const it of sortedPruned) {
			let key = '';
			if (it.type === 'device') {
				key =
					'device||' +
					(it.action || '') +
					'||' +
					(it.name || '') +
					'||' +
					(it.details || '') +
					'||' +
					(it.deviceName || '');
			} else {
				key =
					(it.type || '') +
					'||' +
					(it.name || '') +
					'||' +
					(it.action || '') +
					'||' +
					(it.date || '');
			}
			if (!seen.has(key)) {
				seen.add(key);
				out.push(it);
			}
		}

		// Save back pruned and deduplicated log
		out.sort((a, b) => new Date(b.date) - new Date(a.date));
		window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', out);
	} catch (e) {
		console.warn('normalizeActivityLog failed:', e);
	}
}

function generateAndSaveReports() {
	// 1. Get raw data (scope: own classes/students for teachers, teacher/class
	// filters for admins)
	const allResults = scopeResultRows(
		window.__DI_CONTAINER__.repo.getAll_sync('results'),
	);
	const classes = overviewScopeClasses();

	// Mode comes from the Overview filter bar (one mode for both charts).
	// Class narrowing comes from the overview scope (no per-chart filter).
	const overviewMode = String(
		document.getElementById('overviewModeFilter')?.value || '',
	);
	const scoreMode = overviewMode;
	const classMode = overviewMode;

	// Create filtered views for each chart so they can be toggled independently.
	// The category filter narrows both charts to results that touch the
	// selected category (or its subcategories).
	const stats = getOverviewCategoryStats();
	const inCategoryScope = (r) => overviewResultTouchesCategories(r, stats);
	const resultsForDistribution = (
		scoreMode
			? allResults.filter((r) => (r.mode || 'exam') === scoreMode)
			: allResults.slice()
	).filter(inCategoryScope);

	let resultsForClass = (
		classMode
			? allResults.filter((r) => (r.mode || 'exam') === classMode)
			: allResults.slice()
	).filter(inCategoryScope);

	// 2. Score Distribution (Histogram)
	// Buckets: 0-5/20, 5-10/20, 10-15/20, 15-20/20
	const distribution = {
		'0-5/20': 0,
		'5-10/20': 0,
		'10-15/20': 0,
		'15-20/20': 0,
	};

	resultsForDistribution.forEach((r) => {
		// Calculate score on 20 using the same logic as results-management.js
		const total = r.totalPoints || r.totalQuestions || r.total || 1;
		const percent = parseScore(r.score, total);
		const scoreOut20 = (percent / 100) * 20;

		if (scoreOut20 < 5) distribution['0-5/20']++;
		else if (scoreOut20 < 10) distribution['5-10/20']++;
		else if (scoreOut20 < 15) distribution['10-15/20']++;
		else distribution['15-20/20']++;
	});

	// 3. Class Performance
	// Map class names to avg scores
	const classStats = {};

	// Group results by class (resolve IDs to human-friendly names)
	const classesList = classes; // already parsed above
	const resultsByClass = {};
	resultsForClass.forEach((r) => {
		// Determine a stable class name for the result, trying multiple fields
		let cName = 'Unknown';

		if (r.classId) {
			const cls = classesList.find((c) => String(c.id) === String(r.classId));
			if (cls) cName = cls.name || cls.className || String(r.classId);
			else cName = r.class || r.studentClass || String(r.classId);
		} else if (r.class) {
			// r.class may be an id or a name; try to resolve
			const cls = classesList.find(
				(c) =>
					String(c.id) === String(r.class) ||
					c.name === r.class ||
					c.className === r.class
			);
			if (cls) cName = cls.name || cls.className || String(r.class);
			else cName = r.class;
		} else if (r.studentClass) {
			const cls = classesList.find(
				(c) => c.name === r.studentClass || c.className === r.studentClass
			);
			if (cls) cName = cls.name || cls.className;
			else cName = r.studentClass;
		}

		if (!resultsByClass[cName]) resultsByClass[cName] = [];

		const total = r.totalPoints || r.totalQuestions || r.total || 1;
		const percent = parseScore(r.score, total);
		resultsByClass[cName].push(percent);
	});

	// Calculate averages and detailed stats
	Object.keys(resultsByClass).forEach((cName) => {
		const scores = resultsByClass[cName];
		const sum = scores.reduce((a, b) => a + b, 0);
		const avg = Math.round(sum / scores.length);
		classStats[cName] = {
			average: avg,
			count: scores.length,
			highest: Math.max(...scores),
			lowest: Math.min(...scores),
		};
	});

	// 4. Save to localStorage keys 'quizOverview' as requested
	const overviewData = {
		lastUpdated: new Date().toISOString(),
		scoreDistribution: distribution,
		classPerformance: classStats,
		totalResults: allResults.length,
	};

	localStorage.setItem('quizOverview', JSON.stringify(overviewData));
	console.log('Saved quizOverview:', overviewData);

	// 5. Render both charts
	renderScoreDistribution(distribution, resultsForDistribution.length);
	renderClassPerformance(classStats);
}

function overviewScopeDescription() {
	const scope = getOverviewScope();
	const parts = [];
	if (scope.teacherId && overviewIsAdmin()) {
		try {
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
			const t = users.find((u) => String(u.id) === scope.teacherId);
			parts.push(t ? t.name || t.username || 'Teacher' : 'Teacher');
		} catch (_) {
			parts.push('Teacher');
		}
	}
	if (scope.classId) {
		try {
			const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
			const c = classes.find((x) => String(x.id) === scope.classId);
			parts.push(c ? c.name || 'Class' : scope.classId);
		} catch (_) {
			parts.push(scope.classId);
		}
	}
	if (scope.categoryId) {
		try {
			const cats = window.__DI_CONTAINER__.repo.getAll_sync('categories') || [];
			if (scope.categoryId === 'uncategorized') {
				parts.push('Uncategorized');
			} else {
				const c = cats.find((x) => String(x.id) === scope.categoryId);
				parts.push(c ? c.name || 'Category' : scope.categoryId);
			}
		} catch (_) {
			/* ignore */
		}
	}
	if (scope.studentId) {
		try {
			const key = overviewResolveStudentKey(scope.studentId);
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
			const u = users.find(
				(x) =>
					x &&
					((key.id && String(x.id) === key.id) ||
						(key.numero &&
							String(x.studentNumber || x.numero || '').trim() === key.numero)),
			);
			if (u) {
				const num = String(u.studentNumber || u.numero || '').trim();
				parts.push(num ? `#${num} - ${u.name || u.username || ''}`.trim() : u.name || u.username || 'Student');
			} else {
				parts.push(scope.studentId);
			}
		} catch (_) {
			parts.push(scope.studentId);
		}
	}
	return parts.length ? parts.join(' | ') : 'All data';
}

function renderCategoryInsights() {
	const hasPanel =
		document.getElementById('kpi-cat-training') ||
		document.getElementById('categoryClassTableBody') ||
		document.getElementById('categoryHardList');
	if (!hasPanel) return;
	const esc =
		typeof escapeHtml === 'function'
			? escapeHtml
			: (s) => String(s ?? '');
	const stats = getOverviewCategoryStats();
	const pct = (c, a) => (a ? `${Math.round((c / a) * 100)}%` : '-');
	const setText = (id, text) => {
		const el = document.getElementById(id);
		if (el) el.textContent = text;
	};
	const t = stats.totals;
	setText('kpi-cat-training', pct(t.training.c, t.training.a));
	setText('kpi-cat-exam', pct(t.exam.c, t.exam.a));
	setText('kpi-cat-attempts', String(t.attempts));
	// Ranked questions: lowest accuracy first (attempted only).
	const ranked = [...stats.perQuestion.entries()]
		.map(([qid, e]) => ({
			qid,
			attempts: e.attempts,
			correct: e.correct,
			accuracy: e.attempts ? (e.correct / e.attempts) * 100 : null,
		}))
		.filter((e) => e.attempts > 0)
		.sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
	// Struggling: under 50% with at least 2 attempts (avoids one-off noise).
	const struggling = ranked.filter(
		(e) => e.accuracy < 50 && e.attempts >= 2,
	);
	setText('kpi-cat-struggling', String(struggling.length));
	setText('categoryInsightsScopeLabel', overviewScopeDescription());
	// Per-class training/exam split.
	const body = document.getElementById('categoryClassTableBody');
	if (body) {
		const rows = stats.classes.map((cls) => {
			const e = stats.perClass.get(String(cls.id));
			return (
				`<tr><td>${esc(cls.name || 'Untitled Class')}</td>` +
				`<td>${e ? pct(e.training.c, e.training.a) : '-'}</td>` +
				`<td>${e ? pct(e.exam.c, e.exam.a) : '-'}</td>` +
				`<td>${e ? e.attempts : 0}</td></tr>`
			);
		});
		body.innerHTML = rows.length
			? rows.join('')
			: '<tr><td colspan="4" class="chart-empty">No attempts in this scope yet</td></tr>';
	}
	// Needs attention: the 5 lowest-accuracy questions.
	const hardEl = document.getElementById('categoryHardList');
	if (hardEl) {
		const bottom = ranked.slice(0, 5);
		if (!bottom.length) {
			hardEl.innerHTML =
				'<div class="chart-empty">No answered questions in this scope yet</div>';
		} else {
			hardEl.innerHTML = bottom
				.map((e) => {
					const q = stats.questionsById.get(e.qid) || {};
					const text = String(q.question || q.text || 'Question');
					const short =
						text.length > 70 ? text.slice(0, 70) + '...' : text;
					const crumb = overviewCategoryBreadcrumb(
						ovQuestionCategoryId(q),
						stats.categories,
					);
					const acc = Math.round(e.accuracy);
					const tone = acc < 50 ? 'low' : acc < 80 ? 'mid' : 'high';
					return (
						'<div class="hard-item">' +
						`<div class="hard-title" title="${esc(text)}">${esc(short)}</div>` +
						`<div class="hard-meta"><span>${esc(crumb || 'Uncategorized')}</span><span>${e.attempts} tries</span></div>` +
						`<div class="acc-bar"><span class="acc-fill acc-${tone}" style="width:${acc}%"></span></div>` +
						`<div class="hard-acc">${acc}% correct</div>` +
						'</div>'
					);
				})
				.join('');
		}
	}
	// Unattempted questions in scope.
	const unEl = document.getElementById('categoryUnattemptedLine');
	if (unEl) {
		let scopedQuestions = [...stats.questionsById.values()];
		if (stats.catSet) {
			scopedQuestions = scopedQuestions.filter((q) =>
				stats.catSet.has(ovQuestionCategoryId(q)),
			);
		}
		const fresh = scopedQuestions.filter((q) => {
			const e = stats.perQuestion.get(String(q.id));
			return !e || !e.attempts;
		}).length;
		unEl.textContent = fresh
			? `${fresh} question${fresh === 1 ? '' : 's'} not attempted yet`
			: '';
	}
}

function renderScoreDistribution(data, total) {
	const container = document.getElementById('scoreDistributionChart');
	if (!container) return;

	if (total === 0) {
		container.innerHTML =
			'<div class="chart-empty">No result data available</div>';
		return;
	}

	// Find max value for scaling
	const maxVal = Math.max(...Object.values(data));
	const labels = ['0-5/20', '5-10/20', '10-15/20', '15-20/20']; // Ordered labels

	let html = '<div class="chart-bars-container">';
	labels.forEach((label) => {
		const count = data[label] || 0;
		const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
		const heightPercent = maxVal > 0 ? (count / maxVal) * 100 : 0;
		// Ensure minimal visibility
		const displayHeight = Math.max(heightPercent, 5);

		// Color based on label
		let colorClass = 'bar-green';
		if (label === '0-5/20') colorClass = 'bar-red';
		else if (label === '5-10/20') colorClass = 'bar-orange';
		else if (label === '10-15/20') colorClass = 'bar-green';

		html += `
            <div class="bar-group">
                <div class="bar-percentage">${percentage}%</div>
                <div class="bar-wrapper">
                    <div class="bar ${colorClass}" 
                         style="height: ${displayHeight}%" 
                         data-value="${count} student(s)"></div>
                </div>
                <div class="bar-label">${label}</div>
            </div>
        `;
	});
	html += '</div>';

	// Add Legend - Professional Tiers
	html += `
        <div class="chart-legend">
            <div class="legend-item"><span class="legend-dot dot-red"></span> <strong>0-5/20:</strong> Critical Phase</div>
            <div class="legend-item"><span class="legend-dot dot-orange"></span> <strong>5-10/20:</strong> Needs Focus</div>
            <div class="legend-item"><span class="legend-dot dot-green"></span> <strong>10-15/20:</strong> Competent</div>
            <div class="legend-item"><span class="legend-dot dot-exceptional"></span> <strong>15-20/20:</strong> Exceptional</div>
        </div>
    `;

	window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);
}

function renderClassPerformance(data) {
	const container = document.getElementById('classPerformanceChart');
	if (!container) return;

	const classes = Object.keys(data);
	if (classes.length === 0) {
		container.innerHTML =
			'<div class="chart-empty">No class performance data</div>';
		return;
	}

	// Get the raw results to calculate score distribution per class
	const allResults = window.__DI_CONTAINER__.repo.getAll_sync('results');
	const classesList = window.__DI_CONTAINER__.repo.getAll_sync('classes');

	// Sort by average score descending, then limit to top 8
	classes.sort((a, b) => {
		const scoreA = typeof data[a] === 'object' ? data[a].average : data[a];
		const scoreB = typeof data[b] === 'object' ? data[b].average : data[b];
		return scoreB - scoreA;
	});
	const topClasses = classes;

	let html = '';
	topClasses.forEach((className) => {
		// Get class data
		const classData = data[className];
		
		// Find all results for this class using the SAME logic as in generateAndSaveReports
		const classResults = [];

		allResults.forEach((r) => {
			let cName = 'Unknown';

			if (r.classId) {
				const cls = classesList.find((c) => String(c.id) === String(r.classId));
				if (cls) cName = cls.name || cls.className || String(r.classId);
				else cName = r.class || r.studentClass || String(r.classId);
			} else if (r.class) {
				const cls = classesList.find(
					(c) =>
						String(c.id) === String(r.class) ||
						c.name === r.class ||
						c.className === r.class
				);
				if (cls) cName = cls.name || cls.className || String(r.class);
				else cName = r.class;
			} else if (r.studentClass) {
				const cls = classesList.find(
					(c) => c.name === r.studentClass || c.className === r.studentClass
				);
				if (cls) cName = cls.name || cls.className;
				else cName = r.studentClass;
			}

			if (cName === className) {
				classResults.push(r);
			}
		});

		// Categorize students into score ranges (/20 scale)
		const distribution = {
			'low': 0,    // 0-10
			'mid': 0,    // 10-15
			'high': 0,   // 15-20
		};

		classResults.forEach((r) => {
			const total = r.totalPoints || r.totalQuestions || r.total || 1;
			const percent = parseScore(r.score, total);
			const scoreOut20 = (percent / 100) * 20;

			if (scoreOut20 < 10) distribution['low']++;
			else if (scoreOut20 < 15) distribution['mid']++;
			else distribution['high']++;
		});

		const total = classResults.length;

		// Calculate percentages for stacked bar
		const stackedPercentages = {
			'low': total > 0 ? (distribution['low'] / total) * 100 : 0,
			'mid': total > 0 ? (distribution['mid'] / total) * 100 : 0,
			'high': total > 0 ? (distribution['high'] / total) * 100 : 0,
		};

		const avgPercent = typeof classData === 'object' ? classData.average : 0;
		const avgScore20 = ((avgPercent / 100) * 20).toFixed(1);

		// Build stacked bar segments with rich tooltips (including percentages)
		let stackedBarHTML = '';
		if (stackedPercentages['low'] > 0) {
			const perc = stackedPercentages['low'].toFixed(1);
			stackedBarHTML += `<div class="bar-segment bar-red" style="width: ${perc}%" data-value="Low (0-10/20): ${distribution['low']} students (${perc}%)"></div>`;
		}
		if (stackedPercentages['mid'] > 0) {
			const perc = stackedPercentages['mid'].toFixed(1);
			stackedBarHTML += `<div class="bar-segment bar-orange" style="width: ${perc}%" data-value="Satisfactory (10-15/20): ${distribution['mid']} students (${perc}%)"></div>`;
		}
		if (stackedPercentages['high'] > 0) {
			const perc = stackedPercentages['high'].toFixed(1);
			stackedBarHTML += `<div class="bar-segment bar-green" style="width: ${perc}%" data-value="Excellent (15-20/20): ${distribution['high']} students (${perc}%)"></div>`;
		}

		// Tooltip for the whole group with percentages
		const lowPerc = stackedPercentages['low'].toFixed(1);
		const midPerc = stackedPercentages['mid'].toFixed(1);
		const highPerc = stackedPercentages['high'].toFixed(1);
		
		const groupTooltip = `${className}\nAverage: ${avgScore20}/20\nTotal Students: ${total}\n\nDistribution:\n• 0-10/20: ${distribution['low']} (${lowPerc}%)\n• 10-15/20: ${distribution['mid']} (${midPerc}%)\n• 15-20/20: ${distribution['high']} (${highPerc}%)`;

		html += `
            <div class="bar-group-horizontal" style="margin-bottom: 24px; width: 100%;">
                <div class="bar-stacked" data-value="${groupTooltip}" style="margin-bottom: 8px;">
                    ${stackedBarHTML}
                </div>
                <div class="bar-label" style="display: flex; justify-content: space-between; align-items: center; padding: 0 2px; gap: 15px;">
                    <span style="font-weight: 600; color: #1e293b; font-size: 13px;">${className}</span>
                    <span style="font-weight: 700; color: #64748b; font-size: 11px; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">${avgScore20}/20</span>
                </div>
            </div>
        `;
	});

	window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);
}

function renderAdvancedKPIs() {
	const results = scopeResultRows(
		window.__DI_CONTAINER__.repo.getAll_sync('results'),
	);
	const classes = overviewScopeClasses();

	// 1. Average Score Trend
	// Compare current average with previous period (e.g., last 7 days vs previous 7 days)
	const now = new Date();
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

	const currentPeriodScores = results
		.filter((r) => new Date(r.date || r.dateTaken) >= sevenDaysAgo)
		.map((r) => {
			const total = r.totalPoints || r.totalQuestions || r.total || 1;
			return parseScore(r.score, total);
		});
	const previousPeriodScores = results
		.filter((r) => {
			const d = new Date(r.date || r.dateTaken);
			return d >= fourteenDaysAgo && d < sevenDaysAgo;
		})
		.map((r) => {
			const total = r.totalPoints || r.totalQuestions || r.total || 1;
			return parseScore(r.score, total);
		});

	const currentAvg = currentPeriodScores.length
		? currentPeriodScores.reduce((a, b) => a + b, 0) /
		  currentPeriodScores.length
		: 0;
	const previousAvg = previousPeriodScores.length
		? previousPeriodScores.reduce((a, b) => a + b, 0) /
		  previousPeriodScores.length
		: 0;

	let trend = 0;
	if (previousAvg > 0) {
		trend = ((currentAvg - previousAvg) / previousAvg) * 100;
	} else if (currentAvg > 0) {
		trend = 100;
	}

	const trendEl = document.getElementById('kpi-avg-trend');
	if (trendEl) {
		trendEl.textContent = `${trend > 0 ? '+' : ''}${Math.round(trend)}%`;
		const card = trendEl.closest('.stat-card');
		if (card) {
			card.className = `stat-card ${trend >= 0 ? 'indigo' : 'rose'}`;
			const curr20 = ((currentAvg / 100) * 20).toFixed(1);
			const prev20 = ((previousAvg / 100) * 20).toFixed(1);
			card.setAttribute('data-tooltip', `Trend based on last 7 days vs previous 7 days\nCurrent Avg: ${curr20}/20 | Previous Avg: ${prev20}/20`);
		}
	}

	// 2. Completion Rate
	// Assuming all results in quizResults are "completed".
	// If we had a "started" log, we'd compare.
	// For now, let's use a heuristic or mock it if data missing.
	// Let's assume 95% if we have results, 0% if not.
	const completionRate = results.length > 0 ? 95 : 0;
	const completionEl = document.getElementById('kpi-completion-rate');
	if (completionEl) {
		animateValue('kpi-completion-rate', 0, completionRate, 1000, '%');
	}

	// 3. Activity Rate (7d)
	const activityRate = currentPeriodScores.length;
	const activityEl = document.getElementById('kpi-activity-rate');
	if (activityEl) {
		animateValue('kpi-activity-rate', 0, activityRate, 1000);
	}

	// 4. Top Performing Class (resolve class names properly)
	const classesList = overviewScopeClasses();
	const resultsByClass = {};
	results.forEach((r) => {
		// Determine a stable class name for the result
		let cName = 'Unknown';

		if (r.classId) {
			const cls = classesList.find((c) => String(c.id) === String(r.classId));
			if (cls) cName = cls.name || cls.className || String(r.classId);
			else cName = r.class || r.studentClass || String(r.classId);
		} else if (r.class) {
			const cls = classesList.find(
				(c) =>
					String(c.id) === String(r.class) ||
					c.name === r.class ||
					c.className === r.class
			);
			if (cls) cName = cls.name || cls.className || String(r.class);
			else cName = r.class;
		} else if (r.studentClass) {
			const cls = classesList.find(
				(c) => c.name === r.studentClass || c.className === r.studentClass
			);
			if (cls) cName = cls.name || cls.className;
			else cName = r.studentClass;
		}

		if (!resultsByClass[cName]) resultsByClass[cName] = [];
		const total = r.totalPoints || r.totalQuestions || r.total || 1;
		resultsByClass[cName].push(parseScore(r.score, total));
	});

	let topClass = '-';
	let maxAvg = -1;

	Object.keys(resultsByClass).forEach((cName) => {
		const scores = resultsByClass[cName];
		const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
		if (avg > maxAvg) {
			maxAvg = avg;
			topClass = cName;
		}
	});

	const topClassEl = document.getElementById('kpi-top-class');
	if (topClassEl) {
		topClassEl.textContent = topClass;
		if (maxAvg >= 0) {
			const maxAvg20 = ((maxAvg / 100) * 20).toFixed(1);
			const card = topClassEl.closest('.stat-card');
			if (card) {
				card.setAttribute('data-tooltip', `Top Performing Class: ${topClass}\nAverage Score: ${maxAvg20}/20`);
			}
		}
	}

	// 5. Student Success Metrics (Certified vs Pending)
	const studentSuccess = {};
	results.forEach((r) => {
		const sId = r.numero || r.studentName || 'Unknown';
		if (!studentSuccess[sId]) studentSuccess[sId] = false;

		const total = r.totalPoints || r.totalQuestions || r.total || 1;
		const scorePerc = parseScore(r.score, total);
		if (scorePerc >= 50) {
			// 10/20 = 50%
			studentSuccess[sId] = true;
		}
	});

	const certifiedCount = Object.values(studentSuccess).filter(
		(passed) => passed
	).length;
	const pendingCount = Object.keys(studentSuccess).length - certifiedCount;

	const passedEl = document.getElementById('kpi-students-passed');
	if (passedEl) animateValue('kpi-students-passed', 0, certifiedCount, 1000);

	const pendingEl = document.getElementById('kpi-students-pending');
	if (pendingEl) animateValue('kpi-students-pending', 0, pendingCount, 1000);
}

// Helper to parse scores consistently
// Returns a percentage (0-100) which can then be converted to /20 scale
// If score is a raw number and totalPoints is provided, calculates percentage
// Otherwise tries to interpret the score based on format
function parseScore(score, totalPoints = null) {
	// Handle string formats first
	if (typeof score === 'string') {
		// Format: "15/20" or "8/10"
		if (score.includes('/')) {
			const [num, den] = score.split('/');
			return (parseFloat(num) / parseFloat(den)) * 100;
		}
		// Format: "75%" 
		if (score.includes('%')) {
			return parseFloat(score);
		}
		// Try to parse as number
		score = parseFloat(score);
	}
	
	// If we have totalPoints, calculate percentage from raw score
	if (totalPoints && totalPoints > 0) {
		const numScore = parseFloat(score) || 0;
		return (numScore / totalPoints) * 100;
	}
	
	// If score is a raw number, determine if it's already a percentage or a /20 score
	const numScore = parseFloat(score) || 0;
	
	// If score is > 20, assume it's already a percentage (e.g., 75 means 75%)
	// If score is <= 20, assume it's a /20 scale score (e.g., 15 means 15/20 = 75%)
	if (numScore > 20) {
		return numScore; // Already a percentage
	} else if (numScore > 0) {
		return (numScore / 20) * 100; // Convert /20 to percentage
	}
	
	return 0;
}

/**
 * Collect all activities from various storage sources (dynamic + persisted)
 * Eliminates redundancy by treating quizResults as the primary source for completions.
 */
// Participant-name helpers are top-level on purpose: the recent-activity
// and activity-log renderers call them directly, and nesting them inside
// getAllActivities crashed every result entry with a ReferenceError.
function isMissingActivityLabel(value) {
	if (value === undefined || value === null) return true;
	const normalized = String(value).trim();
	if (!normalized) return true;
	return ['unknown', 'n/a', 'na', '-', '--', 'none'].includes(
		normalized.toLowerCase(),
	);
}

function activityParticipantNames(result) {
	if (!result || typeof result !== 'object') return [];
	const sources = [
		result.participants,
		result.participantNames,
		result.participantDetails,
		result.playerNames,
		result.meta?.participants,
		result.meta?.participantDetails,
	];
	const names = [];
	sources.forEach((source) => {
		if (!Array.isArray(source)) return;
		source.forEach((entry) => {
			const candidate =
				typeof entry === 'string'
					? entry
					: entry?.name ||
					  entry?.username ||
					  entry?.displayName ||
					  entry?.studentName ||
					  entry?.userName ||
					  entry?.userId ||
					  entry?.id ||
					  '';
			const normalized = String(candidate || '').trim();
			if (normalized && !isMissingActivityLabel(normalized)) {
				names.push(normalized);
			}
		});
	});
	return [...new Set(names)];
}

function activityParticipantCount(result, participantNames = []) {
	const explicitCounts = [result?.participantCount, result?.meta?.participantCount]
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (explicitCounts.length) return explicitCounts[0];

	const arrayCounts = [
		result?.participants,
		result?.participantNames,
		result?.participantDetails,
		result?.playerNames,
		result?.meta?.participants,
		result?.meta?.participantDetails,
	]
		.filter((value) => Array.isArray(value))
		.map((value) => value.length);
	const maxArrayCount = arrayCounts.length ? Math.max(...arrayCounts) : 0;

	return Math.max(participantNames.length, maxArrayCount, 0);
}

function buildActivityGameParticipantIndex(results) {
	const gameParticipantIndex = new Map();
	(Array.isArray(results) ? results : []).forEach((entry) => {
		if (!entry || typeof entry !== 'object') return;
		const gameId = String(entry.gameId || '').trim();
		if (!gameId) return;
		const names = activityParticipantNames(entry);
		if (!names.length) return;
		if (!gameParticipantIndex.has(gameId)) {
			gameParticipantIndex.set(gameId, new Set());
		}
		const bucket = gameParticipantIndex.get(gameId);
		names.forEach((name) => bucket.add(name));
	});
	return gameParticipantIndex;
}

function activityParticipantNamesForDisplay(result, gameParticipantIndex) {
	const direct = activityParticipantNames(result);
	const gameId = String(result?.gameId || result?.meta?.gameId || '').trim();
	if (
		!gameId ||
		!(gameParticipantIndex instanceof Map) ||
		!gameParticipantIndex.has(gameId)
	) {
		return direct;
	}
	const merged = new Set(direct);
	gameParticipantIndex.get(gameId).forEach((name) => merged.add(name));
	return [...merged];
}

function getAllActivities() {
	const questions = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('questions'),
	);
	const exams = scopeAuthoredRows(
		window.__DI_CONTAINER__.repo.getAll_sync('exams'),
	);
	const results = scopeResultRows(
		window.__DI_CONTAINER__.repo.getAll_sync('results'),
	);
	const persisted = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');

	const isMissingLabel = (value) => {
		if (value === undefined || value === null) return true;
		const normalized = String(value).trim();
		if (!normalized) return true;
		return ['unknown', 'n/a', 'na', '-', '--', 'none'].includes(
			normalized.toLowerCase(),
		);
	};

	const resolveStudentName = (result) => {
		const candidate = result.studentName || result.name || '';
		if (!isMissingLabel(candidate)) return candidate;
		const studentNumber = result.studentNumber || result.numero || '';
		if (studentNumber) {
			const match = users.find(
				(u) =>
					String(u.studentNumber || '').trim() ===
					String(studentNumber).trim(),
			);
			if (match) return match.name || match.username || candidate;
		}
		if (result.userId) {
			const match = users.find((u) => u.id === result.userId);
			if (match) return match.name || match.username || candidate;
		}
		return 'Student';
	};

	const resolveClassName = (result) => {
		if (!isMissingLabel(result.className)) return result.className;
		if (result.classId) {
			const cls = classes.find((c) => c.id === result.classId);
			if (cls) return cls.name || cls.className || '';
		}
		if (!isMissingLabel(result.class)) return result.class;
		return '';
	};

	const resolveExamTitle = (result) => {
		let title = result.examTitle || result.examName || '';
		if (!isMissingLabel(title)) return title;
		if (result.examId) {
			const exam = exams.find((e) => e.id === result.examId);
			if (exam) return exam.name || exam.title || title;
		}
		const gameName = result.gameName || result.gameTitle || '';
		const gameType = String(result.gameType || result.type || '').toLowerCase();
		if (!isMissingLabel(gameName)) return `Game: ${gameName}`;
		if (gameType.includes('card')) return 'Game: Card Battle';
		if (gameType.includes('race')) return 'Game: Lightning Race';
		if (gameType.includes('hot')) return 'Game: Hot Potato';
		if (gameType.includes('survivor')) return 'Game: Last Survivor';
		if (result.gameId) return 'Game';
		if (result.mode === 'training') return 'Training Quiz';
		return 'Quiz';
	};

	const resolveWinnerName = (result) => {
		const candidate = result.winnerName || result.winner || result.winnerId || '';
		return isMissingLabel(candidate) ? '' : candidate;
	};

	const resolveParticipantNames = activityParticipantNames;
	const resolveParticipantCount = activityParticipantCount;

	// Builds the session-info object shown in the Activity Log "User" column.
	const buildUserInfo = (user) => {
		if (!user || typeof user !== 'object') return null;
		let className = user.className || '';
		if (!className && user.classId) {
			const cls = classes.find((c) => String(c.id) === String(user.classId));
			if (cls) className = cls.name || cls.className || '';
		}
		const name = user.name || user.username || '';
		if (!name && !user.role && !user.studentNumber) return null;
		return {
			id: user.id || '',
			name,
			username: user.username || '',
			role: user.role || '',
			studentNumber: user.studentNumber || '',
			className,
			classId: user.classId || '',
		};
	};

	const resolveActorById = (id) => {
		if (!id) return null;
		const match = users.find((u) => u && String(u.id) === String(id));
		return buildUserInfo(match);
	};

	const gameParticipantIndex = buildActivityGameParticipantIndex(results);

	const resolveParticipantNamesForDisplay = (result) =>
		activityParticipantNamesForDisplay(result, gameParticipantIndex);

	const resolveScoreText = (result) => {
		if (typeof result.score === 'string') return result.score;
		if (Number.isFinite(result.score)) {
			const total = result.totalQuestions || result.totalPoints || 0;
			if (total) return `${result.score}/${total}`;
			if (result.gameId || result.gameName || result.gameType)
				return `${result.score} pts`;
			return String(result.score);
		}
		return '';
	};


	const all = [
		// 1. Map Questions
		...questions
			.filter((q) => q.dateCreated)
			.map((q, index) => {
				const questionText = q.question || 'New Question';
				const truncatedText =
					questionText.length > 50
						? questionText.substring(0, 50) + '...'
						: questionText;
				const questionType =
					q.type || (q.isDraggable ? 'draggable' : 'multiple-choice');
				return {
					id: q.id,
					type: 'question',
					name:
						questionText.length > 40
							? questionText.substring(0, 40) + '...'
							: questionText,
					isValid: true,
					date: q.dateCreated,
					action: 'created',
					ownerId: q.ownerId || '',
					user: resolveActorById(q.ownerId),
					meta: {
						id: q.id,
						type: questionType,
						category: q.category || 'uncategorized',
						number: index + 1,
						text: truncatedText,
					},
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
					color: TYPE_STYLES.question.color,
				};
			}),

		// 2. Map Exams
		...exams
			.filter((e) => e.dateCreated)
			.map((e) => ({
				id: e.id,
				type: 'exam',
				name: e.name || e.title || 'New Exam',
				isValid: true,
				date: e.dateCreated,
				ownerId: e.ownerId || '',
				user: resolveActorById(e.ownerId),
				meta: { questionCount: e.questions?.length || 0 },
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
				color: TYPE_STYLES.exam.color,
			})),

		// 3. Map Results (Primary Source of completions)
		...results.map((r) => {
			const studentName = resolveStudentName(r);
			const studentNumber = r.studentNumber || r.numero || '';
			const className = resolveClassName(r);
			const examTitle = resolveExamTitle(r);
			const winnerName = resolveWinnerName(r);
			const dateIso = r.dateTaken || r.date || new Date().toISOString();
			const scoreText = resolveScoreText(r);
			const gameName = r.gameName || r.gameTitle || '';
			const gameType = r.gameType || r.type || '';
			const participantNames = resolveParticipantNamesForDisplay(r);
			const participantCount = resolveParticipantCount(r, participantNames);
			const nameSuffix = r.deviceName ? ` (from ${r.deviceName})` : '';
			const matchedStudent = users.find(
				(u) =>
					u &&
					((studentNumber &&
						String(u.studentNumber || '').trim() === String(studentNumber).trim()) ||
						(r.userId && String(u.id) === String(r.userId))),
			);
			const resultActor =
				buildUserInfo(matchedStudent) ||
				(studentName && String(studentName).toLowerCase() !== 'student'
					? {
							id: r.userId || '',
							name: studentName,
							role: 'student',
							studentNumber,
							className,
						}
					: null);
			return {
				id: r.id || `${studentNumber || studentName}-${dateIso}`,
				type: 'result',
				studentName,
				studentNumber,
				className,
				examTitle,
				winnerName,
				gameName,
				gameType,
				participants: participantNames,
				participantCount,
				isValid: true,
				date: dateIso,
				dateDisplay: r.dateDisplay || new Date(dateIso).toLocaleString(),
				mode: r.mode || r.gameMode || 'training',
				score: scoreText,
				action: 'completed',
				user: resultActor,
				meta: {
					studentName,
					studentNumber,
					className,
					winnerName,
					gameName,
					gameType,
					participants: participantNames,
					participantCount,
				},
				name: `${studentName} - ${examTitle}${nameSuffix}`,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
				color: TYPE_STYLES.result.color,
			};
		}),

		// 4. Map Persisted Activities (Deleted, Edited, Imports, Device Events, etc.)
		// Filter out 'completed' results to avoid redundancy with the results mapping above.
		// auditEntryInScope keeps teachers to their own actions + own students.
		...persisted.filter(
			(a) =>
				a &&
				(auditEntryInScope(a) &&
					(a.action === 'deleted' ||
						a.action === 'edited' ||
						a.type === 'import' ||
						a.type === 'export' ||
						a.type === 'device' ||
						a.type === 'profile_request' ||
						(a.type === 'result' && a.action !== 'completed'))),
		)
	];

	// A selected student hides authored entries (questions/exams created):
	// the feed shows only what concerns them.
	const scope = getOverviewScope();
	const visibleAll = scope.studentId
		? all.filter(
				(it) =>
					it &&
					typeof it === 'object' &&
					(it.type === 'result' || it.type === 'profile_request') &&
					studentEntryInScope(it),
			)
		: all;

	// Sort newest first and deduplicate
	const sorted = visibleAll.sort((a, b) => new Date(b.date) - new Date(a.date));
	const deduped = [];
	const seen = new Set();
	for (const it of sorted) {
		const key = `${it.type}||${it.name}||${it.date}`;
		if (!seen.has(key)) {
			seen.add(key);
			deduped.push(it);
		}
	}
	return deduped;
}

function renderRecentActivity() {
	// Normalize persisted activity entries to ensure consistent fields and remove duplicates
	normalizeActivityLog();
	const list = document.getElementById('recentActivityList');
	if (!list) return;

	// Use unified data source
	const deduped = getAllActivities();

	// Sort by date descending
	deduped.sort((a, b) => new Date(b.date) - new Date(a.date));

	// Take top 5
	const recent = deduped.slice(0, 5);

	if (recent.length === 0) {
		list.innerHTML = `<div class="empty-state-small">No recent activity</div>`;
	} else {
		let html = '';
		recent.forEach((item) => {
			// Determine WHO performed the action
			let who =
				item.type === 'result'
					? item.studentName && String(item.studentName).toLowerCase() !== 'unknown'
						? item.studentName
						: item.studentNumber || item.numero || 'Student'
					: item.type === 'profile_request'
						? item.meta?.studentName || item.studentName || 'Student'
						: 'Admin';

			// Determine WHAT action was performed
			let whatAction = '';
			let whatItem = '';
			let actionLink = '';

			// Define icons map for fallback
			const ICONS = {
				question:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
				exam: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
				class:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
				category:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
				result:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
				import:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
				export:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
				profile_request:
					'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 4-7 8-7s8 3 8 7"></path></svg>',
			};

			// Identify icon to use
			const itemIcon = item.icon || ICONS[item.type] || ICONS['question'];

			if (item.type === 'result') {
				whatAction = 'completed';
				const participantNames = activityParticipantNamesForDisplay(item);
				const participantCount = activityParticipantCount(item, participantNames);
				if (participantNames.length) {
					who = participantNames.join(', ');
				} else if (participantCount > 0) {
					who = `${participantCount} participant(s)`;
				}

				const isGame =
					item.gameName ||
					item.gameType ||
					item.gameId ||
					String(item.examTitle || '').toLowerCase().startsWith('game');

				let itemTitle = '';
				if (isGame) {
					if (item.gameName) {
						itemTitle = `Game: ${item.gameName}`;
					} else if (
						item.examTitle &&
						String(item.examTitle).toLowerCase().startsWith('game')
					) {
						itemTitle = item.examTitle;
					} else if (String(item.gameType || '').toLowerCase().includes('card')) {
						itemTitle = 'Game: Card Battle';
					} else if (String(item.gameType || '').toLowerCase().includes('race')) {
						itemTitle = 'Game: Lightning Race';
					} else if (String(item.gameType || '').toLowerCase().includes('hot')) {
						itemTitle = 'Game: Hot Potato';
					} else if (String(item.gameType || '').toLowerCase().includes('survivor')) {
						itemTitle = 'Game: Last Survivor';
					} else {
						itemTitle = 'Game';
					}
				} else {
					itemTitle = item.examTitle || item.name || 'Quiz';
					if (String(itemTitle).trim().toLowerCase() === 'unknown') {
						itemTitle = 'Quiz';
					}
				}

				whatItem = itemTitle || 'Quiz';
				const scoreText = item.score || (item.meta && item.meta.score) || '';
				if (scoreText) {
					whatItem += ` with score ${scoreText}`;
				}
				const winnerName = item.winnerName || item.meta?.winnerName || '';
				if (winnerName) {
					whatItem += ` - Winner: ${winnerName}`;
				}
				// Link to results tab
				actionLink = `onclick="openTab(event, 'results')" style="cursor: pointer;"`;
			} else if (item.type === 'device') {
				const actionMap = {
					sync_users: 'synced',
					sync_games: 'synced',
					push_settings: 'pushed',
					push_exam: 'pushed',
					stop_exam: 'stopped',
					clear_session: 'cleared',
					receive_data: 'received',
				};
				const rawVerb = actionMap[item.action] ||
					(item.action ? item.action.replace(/_/g, ' ') : 'updated');
				const verb = rawVerb.toLowerCase();
				let itemLabel = item.name || item.details || 'device activity';
				if (item.name && verb && item.name.toLowerCase().startsWith(verb)) {
					itemLabel = item.name.slice(verb.length).trim();
				}
				if (!itemLabel) itemLabel = 'device activity';
				if (item.details && item.details !== item.name) {
					itemLabel = `${itemLabel} (${item.details})`;
				}
				whatAction = rawVerb;
				whatItem = itemLabel;
				actionLink = `onclick="openTab(event, 'activity')" style="cursor: pointer;"`;
			}

			// Determine WHEN (humanized time with full date on hover)
			const dateText =
				item.dateDisplay ||
				(item.isValid ? formatTimeAgo(item.date) : 'Recently');
			const fullDateTime = item.date
				? new Date(item.date).toLocaleString()
				: '';

			// Build the activity label with who/what/when
			// Override whatAction if item.action is present and specific
			// Build the activity label with who/what/when
			// Override whatAction if item.action is present and specific
			if (
				item.action &&
				item.action !== 'created' &&
				item.type !== 'question' &&
				item.type !== 'device'
			) {
				whatAction = item.action;
			}

			// Custom creative message for deleted items as requested
			let activityLabel = `<strong>${who}</strong> ${whatAction} ${whatItem}`;

			if (item.action === 'deleted' && item.type === 'question') {
				// Check if we have detailed metadata
				if (item.meta && item.meta.type && item.meta.text) {
					const qType =
						item.meta.type === 'fill-blank'
							? 'Fill-in-the-Blank'
							: item.meta.type === 'multiple-choice'
							? 'Multiple Choice'
							: capitalize(item.meta.type);
					// Truncate text if too long
					const qText =
						item.meta.text.length > 30
							? item.meta.text.substring(0, 30) + '...'
							: item.meta.text;
					activityLabel = `<strong>${who}</strong> deleted a <span class="badge badge-rose" style="font-size: 0.7em;">${qType}</span> question: "${qText}"`;
				} else if (item.name && item.name.includes('Questions')) {
					activityLabel = `<strong>${who}</strong> deleted ${item.name} from the database`;
				} else {
					activityLabel = `<strong>${who}</strong> deleted a question`;
				}
			} else if (item.action === 'edited' && item.type === 'question') {
				if (item.meta && item.meta.type) {
					const qType = item.meta.type === 'fill-blank' ? 'Fill-in-the-Blank' : 
								 item.meta.type === 'multiple-choice' ? 'Multiple Choice' : capitalize(item.meta.type);
					const qNum = item.meta.number ? `#${item.meta.number}` : '';
					const qText = item.meta.text ? `: "${item.meta.text}"` : '';
					
					activityLabel = `<strong>${who}</strong> edited a <span class="badge badge-info" style="font-size: 0.7em;">${qType}</span> question ${qNum}${qText}`;
				}
			} else if (item.action === 'created' && item.type === 'question') {
				const qType = item.meta && item.meta.type ? 
							 (item.meta.type === 'fill-blank' ? 'Fill-in-the-Blank' : 
							  item.meta.type === 'multiple-choice' ? 'Multiple Choice' : capitalize(item.meta.type)) : 'New';
				const qNum = item.meta && item.meta.number ? `#${item.meta.number}` : '';
				const qText = item.meta && item.meta.text ? `: "${item.meta.text}"` : '';
				
				activityLabel = `<strong>${who}</strong> created a <span class="badge badge-success" style="font-size: 0.7em;">${qType}</span> question ${qNum}${qText}`;
			}

			// Ensure icon color class is taken from the centralized map when available
			// If deleted, maybe use red?
			let iconColorClass =
				(TYPE_STYLES[item.type] && TYPE_STYLES[item.type].color) ||
				item.color ||
				'icon-amber';
			if (item.action === 'deleted') {
				iconColorClass = 'icon-rose';
			}

			html += `
                <div class="activity-item" ${actionLink} title="${fullDateTime}">
                    <div class="activity-icon ${iconColorClass}">
                        ${itemIcon}
                    </div>
                    <div class="activity-content">
                        <div class="activity-message">
                            ${activityLabel}
                        </div>
                        <div class="activity-meta">
                            ${dateText}${
				item.mode ? ' • ' + capitalize(item.mode) : ''
			}
                        </div>
                    </div>
                </div>
            `;
		});
		window.safeSetHTML ? window.safeSetHTML(list, html, true) : (list.innerHTML = html);

		// Ensure any other panel-body activity-list containers (same Recent Activity panel) show the same last-5 list
		const activityLists = document.querySelectorAll(
			'.panel-body.activity-list'
		);
		activityLists.forEach((el) => {
			// Avoid unnecessary DOM write if it's the same element
			if (el !== list) window.safeSetHTML ? window.safeSetHTML(el, html, true) : (el.innerHTML = html);
		});
	}

	// Also generate and save full activity log if requested (preserving import/export entries)
	// This supports the "Activity Tab" view
	saveFullActivityLog(deduped);
}

function saveFullActivityLog(activities) {
	// Ensure activities array has all necessary fields for rendering
	const enrichedActivities = activities.map((item) => {
		// Ensure date field is populated
		if (!item.date && item.dateCreated) {
			item.date = item.dateCreated;
		}
		// Ensure dateDisplay is populated
		if (!item.dateDisplay && item.date) {
			item.dateDisplay = new Date(item.date).toLocaleString();
		}
		return item;
	});

	// Preserve any existing import/export entries and merge with generated activities
	const existing = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
	const preserved = existing.filter(
		(e) => e && (e.type === 'import' || e.type === 'export')
	);

	// Merge preserved entries at the front, then dedupe by type+name+date
	const merged = [...preserved, ...enrichedActivities];
	const seen = new Set();
	const finalActivities = merged.filter((it) => {
		const key =
			(it.type || '') + '||' + (it.name || '') + '||' + (it.date || '');
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	// Ensure full activity log is sorted by date (newest first) before saving
	finalActivities.sort((a, b) => new Date(b.date) - new Date(a.date));
	window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', finalActivities);

	// If we are on the activity tab, render the table with merged activities
	const activityTab = document.getElementById('activity');
	if (
		activityTab &&
		(activityTab.style.display !== 'none' ||
			activityTab.classList.contains('active'))
	) {
		renderActivityTable(finalActivities);
	}
}

function renderActivityTable(activities) {
	const tbody = document.getElementById('activityTableBody');
	if (!tbody) return; // Not on admin page or tab not ready

	// Sort incoming activities by date (newest first) for table rendering
	activities = activities
		.slice()
		.sort((a, b) => new Date(b.date) - new Date(a.date));

	if (activities.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="5" class="empty-cell">No activity found</td></tr>';
		populateActivityUserFilter(new Set());
		return;
	}

	// Define icons map for fallback (same as in renderRecentActivity)
	const ICONS = {
		question:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
		exam: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
		class:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
		category:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
		result:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
		import:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
		export:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
		profile_request:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 4-7 8-7s8 3 8 7"></path></svg>',
	};

	// Session info (student/teacher/admin) shown in the "User" column.
	const activityUsers = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
	const activityClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes') || [];
	const activityUsersById = new Map(
		activityUsers.filter(Boolean).map((u) => [String(u.id), u]),
	);

	const resolveActivityActor = (item) => {
		if (!item) return null;
		if (item.user && (item.user.name || item.user.role || item.user.studentNumber)) {
			return item.user;
		}
		if (item.userName) {
			return { name: item.userName, role: item.userRole || '' };
		}
		if (item.type === 'result') {
			if (item.studentName && String(item.studentName).toLowerCase() !== 'student') {
				return {
					name: item.studentName,
					role: 'student',
					studentNumber: item.studentNumber || '',
					className: item.className || '',
				};
			}
			return null;
		}
		const ownerId = item.ownerId || item.meta?.ownerId || item.userId;
		const owner = ownerId ? activityUsersById.get(String(ownerId)) : null;
		if (owner) {
			let className = owner.className || '';
			if (!className && owner.classId) {
				const cls = activityClasses.find((c) => String(c.id) === String(owner.classId));
				if (cls) className = cls.name || cls.className || '';
			}
			return {
				name: owner.name || owner.username || '',
				role: owner.role || '',
				studentNumber: owner.studentNumber || '',
				className,
			};
		}
		return null;
	};

	let html = '';
	const activityActorNames = new Set();
	activities.forEach((item) => {
		let dateStr = 'N/A';
		if (item.date) {
			const dateObj = new Date(item.date);
			if (!isNaN(dateObj.getTime())) {
				dateStr =
					dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
			}
		} else if (item.dateCreated) {
			// fallback
			const dateObj = new Date(item.dateCreated);
			if (!isNaN(dateObj.getTime())) {
				dateStr =
					dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
			}
		}

		const typeClass =
			(TYPE_STYLES[item.type] && TYPE_STYLES[item.type].badge) || 'badge-amber';

		let status = '<span class="status-badge status-success">Completed</span>';
		if (
			item.type === 'question' ||
			item.type === 'exam' ||
			item.type === 'class' ||
			item.type === 'category'
		) {
			// Determine status based on action for questions
			if (item.type === 'question' && item.action === 'edited') {
				status = '<span class="status-badge status-warning">Edited</span>';
			} else if (item.type === 'question' && item.action === 'deleted') {
				status = '<span class="status-badge status-error">Deleted</span>';
			} else {
				status = '<span class="status-badge status-info">Created</span>';
			}
		} else if (item.type === 'profile_request') {
			status = '<span class="status-badge status-warning">Requested</span>';
		}

		// Build description based on activity type
		let mainLabel, subLabel;

		if (item.type === 'result') {
			// For results: Student name - Exam title
			const rawStudent =
				item.studentName ||
				item.numero ||
				item.name?.split(' - ')[0] ||
				'';
			const studentName =
				rawStudent && String(rawStudent).trim().toLowerCase() === 'unknown'
					? 'Student'
					: rawStudent || 'Student';
			const rawTitle =
				item.examTitle || item.name?.split(' - ')[1] || '';
			const examTitle =
				rawTitle && String(rawTitle).trim().toLowerCase() === 'unknown'
					? 'Quiz'
					: rawTitle || 'Quiz';
			mainLabel = `${studentName} completed ${examTitle}`;

			// Sub-label: Score, mode, and winner
			const scoreText = item.score || (item.meta && item.meta.score) || '';
			const winnerName = item.winnerName || item.meta?.winnerName || '';
			const studentNumber = item.studentNumber || item.meta?.studentNumber || '';
			const className = item.className || item.meta?.className || '';
			const participantNames = activityParticipantNamesForDisplay(item);
			const participantCount = activityParticipantCount(item, participantNames);
			const details = [];
			if (studentNumber) details.push(`#${studentNumber}`);
			if (className) details.push(className);
			const parts = [];
			if (scoreText) parts.push(`Score: ${scoreText}`);
			if (item.mode) parts.push(capitalize(item.mode) + ' mode');
			if (participantNames.length) {
				parts.push(`Participants: ${participantNames.join(', ')}`);
			} else if (participantCount > 0) {
				parts.push(`Participants: ${participantCount} player(s)`);
			}
			if (winnerName) parts.push(`Winner: ${winnerName}`);
			subLabel = [...details, ...parts].join(' - ');
		} else if (item.type === 'exam') {
			mainLabel = `Exam: ${item.name}`;
			subLabel = '';
		} else if (item.type === 'class') {
			// Enhanced class description with student count and exams
			const studentCount = item.meta?.studentCount || 0;
			const examCount = item.meta?.examCount || 0;
			mainLabel = `Class: ${item.name}`;
			subLabel = `${studentCount} students • ${examCount} exams`;
		} else if (item.type === 'category') {
			mainLabel = `Category: ${item.name}`;
			subLabel = '';
		} else if (item.type === 'question') {
			// Enhanced question description with number, type, and category
			const action = item.action || 'created';
			const questionType = item.meta?.type || 'unknown';
			const qTypeFormatted = questionType === 'fill-blank' ? 'Fill-in-the-Blank' : 
								  questionType === 'multiple-choice' ? 'Multiple Choice' : capitalize(questionType);
			
			const categoryId = item.meta?.category || 'uncategorized';
			const categoryName =
				categoryId !== 'uncategorized'
					? getCategoryNameFromId(categoryId)
					: 'Uncategorized';
			const questionNum = item.meta?.number || '';
			const questionText = item.meta?.text ? `: "${item.meta.text}"` : '';

			if (questionNum) {
				mainLabel = `Question #${questionNum} (${qTypeFormatted}) ${action}${questionText}`;
			} else {
				mainLabel = `Question (${qTypeFormatted}) ${action}${questionText}`;
			}
			subLabel = `Category: ${categoryName}`;
		} else if (item.type === 'import') {
			mainLabel = `Imported: ${item.name || 'Data'}`;
			subLabel = '';
		} else if (item.type === 'export') {
			mainLabel = `Exported: ${item.name || 'Data'}`;
			subLabel = '';
		} else if (item.type === 'profile_request') {
			const studentName =
				item.meta?.studentName ||
				item.studentName ||
				(item.name || '').replace(' profile update request', '') ||
				'Student';
			mainLabel = `${studentName} requested a profile update`;
			const details = [];
			if (item.meta?.studentNumber) details.push(`#${item.meta.studentNumber}`);
			if (item.meta?.className) details.push(item.meta.className);
			subLabel = details.join(' - ');
		} else if (item.type === 'device') {
			if (item.action === 'push_exam') {
				const examName =
					item.meta?.examName ||
					(item.name && item.name.match(/Pushed exam \"(.+?)\"/i)
						? item.name.match(/Pushed exam \"(.+?)\"/i)[1]
						: '') ||
					item.name ||
					'Exam';
				mainLabel = `Admin pushed exam "${examName}"`;
				subLabel = item.details || '';
			} else {
				mainLabel = item.name || 'Device activity';
				subLabel = item.details || '';
			}
		} else {
			mainLabel = item.name || 'Activity';
			subLabel = '';
		}

		const displayDate = item.dateDisplay || dateStr;
		const iconColorClass =
			(TYPE_STYLES[item.type] && TYPE_STYLES[item.type].color) ||
			item.color ||
			'icon-amber';
		const itemIcon = item.icon || ICONS[item.type] || ICONS['question'];

		// Determine action link for highlighting
		let actionLink = '';
		if (item.action !== 'deleted' && (item.type === 'question' || item.type === 'exam' || item.type === 'class' || item.type === 'category')) {
			const tabName = item.type === 'question' ? 'questions' : 
						  item.type === 'exam' ? 'exams' : 
						  item.type === 'class' ? 'classes' : 'categories';
			const entityId = item.id || item.meta?.id || '';
			if (entityId) {
				actionLink = `onclick="openTabAndHighlight(event, '${tabName}', '${entityId}')" style="cursor: pointer;"`;
			} else {
				actionLink = `onclick="openTab(event, '${tabName}')" style="cursor: pointer;"`;
			}
		}

		const actor = resolveActivityActor(item);
		const actorName = actor && actor.name ? actor.name : '';
		if (actorName) activityActorNames.add(actorName);
		const actorRoleLabel = actor && actor.role ? capitalize(actor.role) : '';
		const actorSub = actor
			? [
					actor.studentNumber ? `#${actor.studentNumber}` : '',
					actor.className || '',
				]
					.filter(Boolean)
					.join(' • ')
			: '';
		const actorCell = `
                    <div class="activity-user-cell">
                        <span class="activity-user-name">${actorName ? escapeActivityText(actorName) : '—'}</span>
                        ${
													actorRoleLabel
														? `<span class="activity-user-role">${escapeActivityText(actorRoleLabel)}</span>`
														: ''
												}
                        ${
													actorSub
														? `<span class="activity-user-sub">${escapeActivityText(actorSub)}</span>`
														: ''
												}
                    </div>`;

		html += `
            <tr ${actionLink} data-id="${escapeActivityText(item.id || '')}" data-type="${escapeActivityText(
			item.type || '',
		)}" data-role="${escapeActivityText(
			(actor && actor.role) || '',
		)}" data-user="${escapeActivityText(actorName)}" data-date="${escapeActivityText(
			item.date || item.dateCreated || '',
		)}">
                <td><span class="badge ${typeClass}">${capitalize(
			item.type
		)}</span></td>
                <td>
                    <div class="activity-desc-cell">
                        <div class="activity-icon-small ${iconColorClass}">${itemIcon}</div>
                        <div class="activity-desc-text">
                            <div class="activity-main">${mainLabel}</div>
                            ${
															subLabel
																? `<div class="activity-sub">${subLabel}</div>`
																: ''
														}
                        </div>
                    </div>
                </td>
                <td>${actorCell}</td>
                <td>${displayDate}</td>
                <td>${status}</td>
            </tr>
        `;
	});

	window.safeSetHTML ? window.safeSetHTML(tbody, html, true) : (tbody.innerHTML = html);

	// Rebuild the user dropdown from the actors present, then re-apply filters.
	populateActivityUserFilter(activityActorNames);
	filterActivityTable();
}

function loadActivityLog() {
	const activities = getAllActivities();
	renderActivityTable(activities);
}

function filterActivityTable() {
	const tbody = document.getElementById('activityTableBody');
	if (!tbody) return;

	const search = (document.getElementById('activitySearch')?.value || '')
		.trim()
		.toLowerCase();
	const type = document.getElementById('activityTypeFilter')?.value || '';
	const role = document.getElementById('activityRoleFilter')?.value || '';
	const user = document.getElementById('activityUserFilter')?.value || '';
	const period = document.getElementById('activityDateFilter')?.value || '';

	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

	const rows = tbody.getElementsByTagName('tr');
	let dataRows = 0;
	let visible = 0;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row.classList.contains('activity-no-match')) continue;
		if (row.querySelector('.empty-cell')) continue;
		dataRows++;

		let matches = true;

		if (
			search &&
			(row.textContent || row.innerText || '').toLowerCase().indexOf(search) === -1
		) {
			matches = false;
		}

		if (matches && type) {
			matches = (row.getAttribute('data-type') || '') === type;
		}

		if (matches && role) {
			matches = (row.getAttribute('data-role') || '') === role;
		}

		if (matches && user) {
			matches = (row.getAttribute('data-user') || '') === user;
		}

		if (matches && period) {
			const raw = row.getAttribute('data-date') || '';
			const dateObj = raw ? new Date(raw) : null;
			if (!dateObj || isNaN(dateObj.getTime())) {
				matches = false;
			} else if (period === 'today') {
				matches = dateObj >= startOfToday;
			} else if (period === 'month') {
				matches =
					dateObj.getFullYear() === now.getFullYear() &&
					dateObj.getMonth() === now.getMonth();
			} else {
				const n = parseInt(period, 10);
				if (Number.isFinite(n)) matches = dateObj >= daysAgo(n);
			}
		}

		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}

	// Toggle the "no matching activity" row.
	let noMatch = tbody.querySelector('tr.activity-no-match');
	const shouldShowNoMatch = dataRows > 0 && visible === 0;
	if (shouldShowNoMatch) {
		if (!noMatch) {
			noMatch = document.createElement('tr');
			noMatch.className = 'activity-no-match';
			noMatch.innerHTML =
				'<td colspan="5" class="empty-cell">No activity matches the selected filters</td>';
			tbody.appendChild(noMatch);
		}
		noMatch.style.display = '';
	} else if (noMatch) {
		noMatch.style.display = 'none';
	}
}

function populateActivityUserFilter(names) {
	const select = document.getElementById('activityUserFilter');
	if (!select) return;

	const current = select.value;
	const unique = [
		...new Set(
			[...(names || [])]
				.map((name) => String(name || '').trim())
				.filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b));

	let html = '<option value="">All users</option>';
	unique.forEach((name) => {
		const safe = escapeActivityText(name);
		html += `<option value="${safe}">${safe}</option>`;
	});
	select.innerHTML = html;

	if (current && unique.includes(current)) {
		select.value = current;
	}
}

function clearActivityFilters() {
	[
		'activityTypeFilter',
		'activityRoleFilter',
		'activityUserFilter',
		'activityDateFilter',
	].forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.value = '';
	});
	const search = document.getElementById('activitySearch');
	if (search) search.value = '';
	filterActivityTable();
}

function escapeActivityText(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function exportActivityLog() {
	const activities = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
	if (activities.length === 0) {
		alert('No activity data to export');
		return;
	}

	const headers = ['Type', 'User', 'Role', 'Description', 'Date', 'Status'];
	const csvContent =
		'data:text/csv;charset=utf-8,' +
		headers.join(',') +
		'\n' +
		activities
			.map((row) => {
				const dateStr = row.isValid
					? new Date(row.date).toLocaleString()
					: 'N/A';
				const status = 'Created'; // Default for now
				const actor = row.user || {};
				const userName = String(
					(actor && actor.name) || row.userName || '',
				).replace(/"/g, '""');
				const userRole = String(
					(actor && actor.role) || row.userRole || '',
				);
				// Escape quotes in name
				const safeName = `"${row.name.replace(/"/g, '""')}"`;
				return `${row.type},"${userName}",${userRole},${safeName},${dateStr},${status}`;
			})
			.join('\n');

	const encodedUri = encodeURI(csvContent);
	const link = document.createElement('a');
	link.setAttribute('href', encodedUri);
	link.setAttribute('download', 'quiz_activity_log.csv');
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// Helper to capitalize first letter
function capitalize(s) {
	if (typeof s !== 'string') return '';
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// Hook into the global tab switch or init if needed to refresh table
// Assuming admin-main.js calls initDashboard/etc on tab switch.
// We'll add a listener for the activity button specifically if needed.

// Utility: Animate numbers
function animateValue(id, start, end, duration, suffix = '') {
	const obj = document.getElementById(id);
	if (!obj) return;

	// If end is 0, just show 0
	if (end === 0) {
		obj.textContent = '0' + suffix;
		return;
	}

	let startTimestamp = null;
	const step = (timestamp) => {
		if (!startTimestamp) startTimestamp = timestamp;
		const progress = Math.min((timestamp - startTimestamp) / duration, 1);
		obj.textContent = Math.floor(progress * (end - start) + start) + suffix;
		if (progress < 1) {
			window.requestAnimationFrame(step);
		} else {
			obj.textContent = end + suffix;
		}
	};
	window.requestAnimationFrame(step);
}

// Utility: Format time ago
function formatTimeAgo(dateString) {
	const date = new Date(dateString);
	const now = new Date();
	const seconds = Math.floor((now - date) / 1000);

	let interval = seconds / 31536000;
	if (interval > 1) return Math.floor(interval) + ' years ago';
	interval = seconds / 2592000;
	if (interval > 1) return Math.floor(interval) + ' months ago';
	interval = seconds / 86400;
	if (interval > 1) return Math.floor(interval) + ' days ago';
	interval = seconds / 3600;
	if (interval > 1) return Math.floor(interval) + ' hours ago';
	interval = seconds / 60;
	if (interval > 1) return Math.floor(interval) + ' minutes ago';
	return Math.floor(seconds) + ' seconds ago';
}

// Expose to window
window.initDashboard = initDashboard;

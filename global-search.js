/**
 * Global Search Functionality
 * Provides real-time search across every admin surface: questions, exams,
 * categories, classes, results, subjects, courses, users, games, kids games,
 * kids championships, tournaments, devices and the activity log.
 *
 * Local-mirror entities are searched synchronously. Server-backed entities
 * (courses, kids studios, devices) are fetched once, cached, and merged into
 * the dropdown as soon as they land.
 */

// Search state
let globalSearchResults = [];
let globalSearchIndex = 0;
let globalSearchActive = false;
let globalSearchTerm = '';

// Server-backed indexes (filled lazily on first search).
const globalSearchIndexes = {
	courses: createIndexState(),
	kidsGames: createIndexState(),
	kidsChampionships: createIndexState(),
	devices: createIndexState(),
};

function createIndexState() {
	return { items: [], loaded: false, loading: false };
}

const SEARCH_GROUP_ORDER = [
	'question',
	'exam',
	'category',
	'class',
	'subject',
	'course',
	'result',
	'user',
	'game',
	'kidsGame',
	'championship',
	'tournament',
	'device',
	'activity',
];

/**
 * Initialize Global Search
 * Called when DOM is ready
 */
function initGlobalSearch() {
	const searchInput = document.getElementById('globalSearchInput');

	if (!searchInput) return;

	// Real-time search as user types
	searchInput.addEventListener('input', (e) => {
		handleGlobalSearchInput(e.target.value);
	});

	// Handle Enter key
	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			performGlobalSearch(e.target.value);
		}
	});

	// Handle keyboard shortcut (Cmd+K or Ctrl+K)
	document.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
			e.preventDefault();
			searchInput.focus();
		}
	});

	// Close search results on Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeGlobalSearchResults();
		}
	});
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

function repoAll(store) {
	try {
		const repo = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		if (!repo || typeof repo.getAll_sync !== 'function') return [];
		const rows = repo.getAll_sync(store);
		return Array.isArray(rows) ? rows : [];
	} catch (_) {
		return [];
	}
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Safe value for a single-quoted inline onclick argument. */
function inlineJsArg(value) {
	return String(value == null ? '' : value)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;');
}

/** Relevance score for one field: exact > prefix > word-start > substring. */
function matchScore(term, value) {
	const text = String(value == null ? '' : value).toLowerCase();
	if (!text) return 0;
	if (text === term) return 5;
	if (text.startsWith(term)) return 4;
	if (new RegExp(`(^|[\\s\\-_./(])${escapeRegExp(term)}`).test(text)) return 3;
	if (text.includes(term)) return 1;
	return 0;
}

function bestMatchScore(term, values) {
	let best = 0;
	(values || []).forEach((value) => {
		const score = matchScore(term, value);
		if (score > best) best = score;
	});
	return best;
}

function capitalize(value) {
	const text = String(value || '');
	return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function roleLabel(role) {
	const normalized = String(role || '').toLowerCase();
	if (normalized === 'super_admin') return 'Super admin';
	if (normalized === 'admin') return 'Admin';
	if (normalized === 'teacher') return 'Teacher';
	if (normalized === 'student') return 'Student';
	return capitalize(normalized) || 'User';
}

function canSearchUsers() {
	try {
		if (window.Auth?.isAdmin?.()) return true;
		if (window.Auth?.isTeacher?.()) return true;
	} catch (_) {}
	return false;
}

function canSearchAdminContent() {
	try {
		if (window.Auth?.isAdmin?.()) return true;
		if (window.Auth?.isTeacher?.()) return true;
	} catch (_) {}
	return false;
}

function classNameMap() {
	const map = new Map();
	repoAll('classes').forEach((cls) => {
		if (cls && cls.id != null) map.set(String(cls.id), cls.name || cls.className || '');
	});
	return map;
}

function findCourseById(id) {
	const camel = asyncIndexFind('courses', id);
	if (camel) return camel;
	try {
		const fromManager = window.CoursesManagement?.getCourses?.() || [];
		return fromManager.find((c) => String(c.id) === String(id)) || null;
	} catch (_) {
		return null;
	}
}

function asyncIndexFind(store, id) {
	const state = globalSearchIndexes[store];
	if (!state) return null;
	return state.items.find((row) => String(row && row.id) === String(id)) || null;
}

function pushResult(result) {
	if (!result || !result.type) return;
	if (!result.score) result.score = 1;
	globalSearchResults.push(result);
}

/* ── Search entry points ─────────────────────────────────────────────────── */

/**
 * Handle input changes in search box
 * @param {string} searchTerm - The search term
 */
function handleGlobalSearchInput(searchTerm) {
	const term = String(searchTerm || '').trim();
	globalSearchTerm = term;

	if (!term) {
		closeGlobalSearchResults();
		return;
	}

	renderSearchResults(term);
	ensureServerBackedIndexes(term);
}

/**
 * Perform the actual search when Enter is pressed
 * @param {string} searchTerm - The search term
 */
function performGlobalSearch(searchTerm) {
	if (!String(searchTerm || '').trim()) return;
	handleGlobalSearchInput(searchTerm);
}

function renderSearchResults(term) {
	globalSearchResults = [];
	globalSearchIndex = 0;

	searchQuestions(term);
	searchCategories(term);
	searchExams(term);
	searchClasses(term);
	searchResults(term);
	searchSubjects(term);
	searchCourses(term);
	searchUsers(term);
	searchGames(term);
	searchTournaments(term);
	searchActivity(term);
	searchServerBackedResults(term);

	if (globalSearchResults.length > 0) {
		displayGlobalSearchResults(globalSearchResults);
		globalSearchActive = true;
	} else if (isAnyIndexLoading()) {
		displaySearchingState();
	} else {
		displayNoResults();
	}
}

/**
 * Search in Questions
 * @param {string} searchTerm - The search term
 */
function searchQuestions(searchTerm) {
	const savedQuestions = repoAll('questions');
	const term = searchTerm.toLowerCase();

	savedQuestions.forEach((question, index) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('question', question)) {
			return;
		}
		const score = bestMatchScore(term, [question.question, question.answer]);
		if (!score) {
			const optionsMatch =
				question.options &&
				JSON.stringify(question.options).toLowerCase().includes(term);
			if (!optionsMatch) return;
		}

		const categoryName = question.category
			? getCategoryName(question.category)
			: 'Uncategorized';
		pushResult({
			type: 'question',
			id: question.id,
			title: String(question.question || '').substring(0, 80),
			description: `Question • ${categoryName}`,
			category: question.category,
			index: index,
			score: score || 1,
			fullData: question,
		});
	});
}

/**
 * Search in Categories
 * @param {string} searchTerm - The search term
 */
function searchCategories(searchTerm) {
	const savedCategories = repoAll('categories');
	const term = searchTerm.toLowerCase();

	savedCategories.forEach((category) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('category', category)) {
			return;
		}
		const score = bestMatchScore(term, [category.name]);
		if (!score) return;
		pushResult({
			type: 'category',
			id: category.id,
			title: category.name,
			description: `Category • ${category.questionCount || 0} questions`,
			color: category.color,
			score,
			fullData: category,
		});
	});
}

/**
 * Search in Exams
 * @param {string} searchTerm - The search term
 */
function searchExams(searchTerm) {
	const savedExams = repoAll('exams');
	const term = searchTerm.toLowerCase();

	savedExams.forEach((exam) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('exam', exam)) {
			return;
		}
		const score = bestMatchScore(term, [exam.name, exam.description]);
		if (!score) return;
		const questionCount = exam.questions ? exam.questions.length : 0;
		pushResult({
			type: 'exam',
			id: exam.id,
			title: exam.name,
			description: `Exam • ${questionCount} questions, ${exam.duration || 0}min`,
			score,
			fullData: exam,
		});
	});
}

/**
 * Search in Classes
 * @param {string} searchTerm - The search term
 */
function searchClasses(searchTerm) {
	const savedClasses = repoAll('classes');
	const term = searchTerm.toLowerCase();

	savedClasses.forEach((classItem) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('class', classItem)) {
			return;
		}
		const score = bestMatchScore(term, [classItem.name]);
		if (!score) return;
		const studentCount = classItem.students ? classItem.students.length : 0;
		pushResult({
			type: 'class',
			id: classItem.id,
			title: classItem.name,
			description: `Class • ${studentCount} students`,
			score,
			fullData: classItem,
		});
	});
}

/**
 * Search in Results
 * @param {string} searchTerm - The search term
 */
function searchResults(searchTerm) {
	const savedResults = repoAll('results');
	const term = searchTerm.toLowerCase();

	savedResults.forEach((result) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('result', result)) {
			return;
		}
		const score = bestMatchScore(term, [
			result.name,
			result.studentName,
			result.studentId,
			result.studentNumber,
			result.numero,
			result.examTitle,
			result.examName,
			result.class,
			result.className,
		]);
		if (!score) return;
		pushResult({
			type: 'result',
			id: result.id,
			title: result.name || result.studentName || result.studentNumber || result.studentId,
			description: `Result • Score: ${result.score || 0}/${
				result.totalScore || result.totalQuestions || 0
			}, Class: ${result.class || result.className || 'N/A'}`,
			score,
			fullData: result,
		});
	});
}

/** Subjects (Subjects tab pills). */
function searchSubjects(searchTerm) {
	if (!canSearchAdminContent()) return;
	const term = searchTerm.toLowerCase();
	const courseCounts = new Map();
	globalSearchIndexes.courses.items.forEach((course) => {
		const subjectId = course.subject_id || course.subjectId;
		if (!subjectId) return;
		const key = String(subjectId);
		courseCounts.set(key, (courseCounts.get(key) || 0) + 1);
	});

	repoAll('subjects').forEach((subject) => {
		const score = bestMatchScore(term, [subject.name]);
		if (!score) return;
		const count = courseCounts.get(String(subject.id)) || 0;
		pushResult({
			type: 'subject',
			id: subject.id,
			title: subject.name,
			description: `Subject • ${count} course${count === 1 ? '' : 's'}`,
			score,
			fullData: subject,
		});
	});
}

/** Courses & curriculum outlines (Subjects tab rows). */
function searchCourses(searchTerm) {
	if (!canSearchAdminContent()) return;
	const term = searchTerm.toLowerCase();
	const subjects = new Map();
	repoAll('subjects').forEach((s) => subjects.set(String(s.id), s.name || ''));

	const seen = new Set();
	const rows = [];
	try {
		(window.CoursesManagement?.getCourses?.() || []).forEach((c) => rows.push(c));
	} catch (_) {}
	globalSearchIndexes.courses.items.forEach((c) => rows.push(c));

	rows.forEach((course) => {
		if (!course || course.id == null) return;
		const key = String(course.id);
		if (seen.has(key)) return;
		seen.add(key);

		const subjectId = course.subject_id || course.subjectId || '';
		const score = bestMatchScore(term, [
			course.name,
			course.description,
			course.category_path,
			subjects.get(String(subjectId)),
		]);
		if (!score) return;

		const status = String(course.status || 'draft');
		const lessons = Number(course.lesson_count) || 0;
		const subjectName = subjects.get(String(subjectId)) || '';
		pushResult({
			type: 'course',
			id: course.id,
			title: course.name,
			description: `Course • ${capitalize(status)} • ${lessons} lesson${
				lessons === 1 ? '' : 's'
			}${subjectName ? ` • ${subjectName}` : ''}`,
			score,
			fullData: course,
		});
	});
}

/** User accounts (Settings → Users). */
function searchUsers(searchTerm) {
	if (!canSearchUsers()) return;
	const term = searchTerm.toLowerCase();
	const isAdmin = Boolean(window.Auth?.isAdmin?.());
	const self = (() => {
		try {
			return window.Auth?.getCurrentUser?.() || {};
		} catch (_) {
			return {};
		}
	})();
	const teacherClassIds = (() => {
		try {
			return (window.Auth?.getTeacherClassIds?.() || []).map(String);
		} catch (_) {
			return [];
		}
	})();
	const classNames = classNameMap();

	repoAll('users').forEach((user) => {
		if (!user) return;
		if (!isAdmin) {
			const isSelf = String(user.id) === String(self.id);
			const role = String(user.role || '').toLowerCase();
			const classId = String(user.classId || user.class_id || '');
			const isOwnStudent =
				role === 'student' && classId && teacherClassIds.includes(classId);
			if (!isSelf && !isOwnStudent) return;
		}

		const score = bestMatchScore(term, [
			user.name,
			user.username,
			user.email,
			user.studentNumber,
			user.numero,
		]);
		if (!score) return;

		const classId = String(user.classId || user.class_id || '');
		const className = classNames.get(classId) || user.className || '';
		const detail = roleLabel(user.role);
		const username = user.username ? `@${user.username}` : '';
		pushResult({
			type: 'user',
			id: user.id,
			title: user.name || user.username || 'User',
			description: `User • ${detail}${username ? ` • ${username}` : ''}${
				className ? ` • ${className}` : ''
			}`,
			score,
			fullData: user,
		});
	});
}

/** Quiz games (Games Studio). */
function searchGames(searchTerm) {
	if (!canSearchAdminContent()) return;
	const term = searchTerm.toLowerCase();

	repoAll('games').forEach((game) => {
		const score = bestMatchScore(term, [
			game.name,
			game.type,
			game.joinCode,
			game.join_code,
			game.status,
		]);
		if (!score) return;
		const questions = Array.isArray(game.questions) ? game.questions.length : 0;
		pushResult({
			type: 'game',
			id: game.id,
			title: game.name || 'Untitled game',
			description: `Game • ${capitalize(game.status || 'draft')} • ${questions} questions`,
			score,
			fullData: game,
		});
	});
}

/** College/lycée tournaments (Tournament Studio). */
function searchTournaments(searchTerm) {
	if (!canSearchAdminContent()) return;
	const term = searchTerm.toLowerCase();

	repoAll('tournaments').forEach((tournament) => {
		const score = bestMatchScore(term, [
			tournament.name,
			tournament.status,
			tournament.targetMode,
			tournament.format,
		]);
		if (!score) return;
		const rounds = Number(tournament.rounds) || 0;
		pushResult({
			type: 'tournament',
			id: tournament.id,
			title: tournament.name || 'Untitled tournament',
			description: `Tournament • ${capitalize(tournament.status || 'draft')} • ${rounds} round${
				rounds === 1 ? '' : 's'
			}`,
			score,
			fullData: tournament,
		});
	});
}

/** Activity log entries (Activity tab). Admin-only, like the tab itself. */
function searchActivity(searchTerm) {
	try {
		if (!window.Auth?.isAdmin?.()) return;
	} catch (_) {
		return;
	}
	const term = searchTerm.toLowerCase();

	repoAll('audit_logs').forEach((entry) => {
		let meta = '';
		try {
			meta = JSON.stringify(
				entry.meta || entry.metadata || entry.diff_json || entry.diff || '',
			).slice(0, 500);
		} catch (_) {
			meta = '';
		}
		const score = bestMatchScore(term, [
			entry.action,
			entry.type,
			entry.entity_type,
			entry.entity_id,
			entry.user_name,
			entry.actor_name,
			entry.name,
			entry.studentName,
			entry.examTitle,
			entry.details,
			entry.description,
			entry.message,
			entry.deviceName,
			entry.dateDisplay,
			meta,
		]);
		if (!score) return;

		const occurred = entry.occurred_at || entry.created_at || entry.date || '';
		const date = occurred ? new Date(Number(occurred) || occurred) : null;
		const dateLabel =
			date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '';
		const entity = capitalize(entry.entity_type || entry.type || 'activity');
		const action = capitalize(entry.action || 'updated');
		pushResult({
			type: 'activity',
			id: entry.id,
			title:
				entry.name ||
				`${entity} ${String(action).toLowerCase()}`.trim() ||
				'Activity',
			description: `Activity • ${entity}${dateLabel ? ` • ${dateLabel}` : ''}`,
			score,
			fullData: entry,
		});
	});
}

/** Server-backed rows (courses/studios/devices) currently in memory. */
function searchServerBackedResults(searchTerm) {
	if (!canSearchAdminContent()) return;
	const term = searchTerm.toLowerCase();
	const classNames = classNameMap();
	const users = repoAll('users');
	const userMap = new Map(users.map((u) => [String(u.id), u]));

	globalSearchIndexes.kidsGames.items.forEach((game) => {
		const score = bestMatchScore(term, [
			game.name,
			game.description,
			game.game_type,
			game.subject,
			game.grade,
			game.pin,
		]);
		if (!score) return;
		const meta = [capitalize(game.grade || ''), capitalize(game.status || 'draft')]
			.filter(Boolean)
			.join(' • ');
		pushResult({
			type: 'kidsGame',
			id: game.id,
			title: game.name || 'Untitled kids game',
			description: `Kids game • ${meta}${game.pin ? ` • PIN ${game.pin}` : ''}`,
			score,
			fullData: game,
		});
	});

	globalSearchIndexes.kidsChampionships.items.forEach((championship) => {
		const score = bestMatchScore(term, [
			championship.name,
			championship.description,
			championship.code,
			championship.status,
		]);
		if (!score) return;
		const games = Array.isArray(championship.game_ids)
			? championship.game_ids.length
			: 0;
		pushResult({
			type: 'championship',
			id: championship.id,
			title: `${championship.emoji || '🏆'} ${
				championship.name || 'Untitled championship'
			}`,
			description: `Kids championship • Code ${championship.code || '—'} • ${games} game${
				games === 1 ? '' : 's'
			}`,
			score,
			fullData: championship,
		});
	});

	globalSearchIndexes.devices.items.forEach((device) => {
		const owner = userMap.get(String(device.assigned_user_id || ''));
		const score = bestMatchScore(term, [
			device.hostname,
			device.device_type,
			device.platform,
			device.last_ip,
			device.note,
			owner && (owner.name || owner.username),
		]);
		if (!score) return;
		const ownerName = owner ? owner.name || owner.username || '' : '';
		pushResult({
			type: 'device',
			id: device.id,
			title: device.hostname || device.device_key || 'Device',
			description: `Device • ${capitalize(device.device_type || 'desktop')} • ${capitalize(
				device.status || 'pending',
			)}${ownerName ? ` • ${ownerName}` : ''}${
				device.last_ip ? ` • ${device.last_ip}` : ''
			}`,
			score,
			fullData: device,
		});
	});
}

/* ── Server-backed index loading ─────────────────────────────────────────── */

function isAnyIndexLoading() {
	return Object.keys(globalSearchIndexes).some(
		(key) => globalSearchIndexes[key].loading,
	);
}

function ensureServerBackedIndexes(term) {
	if (term.length < 2 || !canSearchAdminContent()) return;
	if (!(window.API && typeof window.API.raw === 'function')) return;

	loadIndex('courses', () => {
		try {
			if (window.CoursesManagement?.ensureLoaded) {
				return Promise.resolve(window.CoursesManagement.ensureLoaded()).then(
					(rows) => rows || [],
				);
			}
		} catch (_) {}
		return window.API.raw('GET', '/courses?limit=200').then(
			(res) => (res && res.data) || [],
		);
	});

	loadIndex('kidsGames', () =>
		window.API.raw('GET', '/kids?limit=200').then((res) => (res && res.data) || []),
	);

	loadIndex('kidsChampionships', () =>
		window.API.raw('GET', '/kids/championships?limit=100').then(
			(res) => (res && (res.data || res.items)) || [],
		),
	);

	loadIndex('devices', () =>
		window.API.raw('GET', '/devices').then((res) =>
			Array.isArray(res) ? res : (res && res.data) || [],
		),
	);
}

function loadIndex(key, loader) {
	const state = globalSearchIndexes[key];
	if (!state || state.loaded || state.loading) return;
	state.loading = true;

	Promise.resolve()
		.then(loader)
		.then((items) => {
			state.items = Array.isArray(items) ? items : [];
			state.loaded = true;
			state.loading = false;
			if (globalSearchTerm) {
				renderSearchResults(globalSearchTerm);
			}
		})
		.catch(() => {
			// One failed fetch should not retry on every keystroke.
			state.items = [];
			state.loaded = true;
			state.loading = false;
			if (globalSearchTerm) renderSearchResults(globalSearchTerm);
		});
}

/* ── Dropdown rendering ──────────────────────────────────────────────────── */

function getSearchDropdown() {
	let resultsDropdown = document.getElementById('globalSearchResults');
	if (resultsDropdown) return resultsDropdown;

	const searchWrapper = document.querySelector('.header-global-search');
	if (!searchWrapper) return null;

	resultsDropdown = document.createElement('div');
	resultsDropdown.id = 'globalSearchResults';
	resultsDropdown.className = 'global-search-results';
	searchWrapper.appendChild(resultsDropdown);
	return resultsDropdown;
}

/**
 * Display search results in a dropdown
 * @param {Array} results - The search results
 */
function displayGlobalSearchResults(results) {
	const resultsDropdown = getSearchDropdown();
	if (!resultsDropdown) return;

	const groupedResults = groupResultsByType(results);
	const maxTotal = 24;
	const maxPerGroup = 4;
	let shown = 0;
	let html = '';

	const orderedTypes = [
		...SEARCH_GROUP_ORDER,
		...Object.keys(groupedResults).filter((type) => !SEARCH_GROUP_ORDER.includes(type)),
	];

	orderedTypes.forEach((type) => {
		if (shown >= maxTotal) return;
		const typeResults = (groupedResults[type] || []).slice(
			0,
			Math.min(maxPerGroup, maxTotal - shown),
		);
		if (!typeResults.length) return;

		html += `<div class="search-result-group">
                    <div class="search-group-title">${getTypeLabel(type)}</div>`;

		typeResults.forEach((result) => {
			html += `
                <div class="search-result-item" onclick="handleSearchResultClick('${
									result.type
								}', '${inlineJsArg(result.id)}', ${
				Number.isFinite(result.index) ? result.index : 'null'
			})">
                    <div class="search-result-icon">${getTypeIcon(result.type)}</div>
                    <div class="search-result-content">
                        <div class="search-result-title">${escapeHtml(
													result.title
												)}</div>
                        <div class="search-result-description">${escapeHtml(
													result.description
												)}</div>
                    </div>
                </div>
            `;
		});

		html += '</div>';
		shown += typeResults.length;
	});

	if (html === '') {
		html = '<div class="search-no-results">No results found</div>';
	}

	window.safeSetHTML
		? window.safeSetHTML(resultsDropdown, html, true)
		: (resultsDropdown.innerHTML = html);
	resultsDropdown.style.display = 'block';

	// Close dropdown when clicking outside
	setTimeout(() => {
		document.addEventListener('click', closeSearchOnOutsideClick);
	}, 0);
}

/** Loading placeholder while server-backed indexes resolve. */
function displaySearchingState() {
	const resultsDropdown = getSearchDropdown();
	if (!resultsDropdown) return;
	resultsDropdown.innerHTML = '<div class="search-no-results">Searching…</div>';
	resultsDropdown.style.display = 'block';
}

/**
 * Display no results message
 */
function displayNoResults() {
	const resultsDropdown = getSearchDropdown();
	if (!resultsDropdown) return;
	resultsDropdown.innerHTML = '<div class="search-no-results">No results found</div>';
	resultsDropdown.style.display = 'block';
}

/**
 * Close search results dropdown
 */
function closeGlobalSearchResults() {
	const resultsDropdown = document.getElementById('globalSearchResults');
	if (resultsDropdown) {
		resultsDropdown.style.display = 'none';
	}
	document.removeEventListener('click', closeSearchOnOutsideClick);
}

/**
 * Close search when clicking outside
 */
function closeSearchOnOutsideClick(e) {
	const searchInput = document.getElementById('globalSearchInput');
	const resultsDropdown = document.getElementById('globalSearchResults');

	if (
		searchInput &&
		resultsDropdown &&
		!searchInput.contains(e.target) &&
		!resultsDropdown.contains(e.target)
	) {
		closeGlobalSearchResults();
	}
}

/**
 * Group results by type, ordered by relevance.
 * @param {Array} results - The search results
 * @returns {Object} Grouped results
 */
function groupResultsByType(results) {
	const grouped = {};

	results.forEach((result) => {
		if (!grouped[result.type]) {
			grouped[result.type] = [];
		}
		grouped[result.type].push(result);
	});

	Object.keys(grouped).forEach((type) => {
		grouped[type].sort(
			(a, b) =>
				(b.score || 0) - (a.score || 0) ||
				String(a.title || '').localeCompare(String(b.title || '')),
		);
	});

	return grouped;
}

/**
 * Get label for result type
 * @param {string} type - The result type
 * @returns {string} The label
 */
function getTypeLabel(type) {
	const labels = {
		question: '📝 Questions',
		category: '🏷️ Categories',
		exam: '📋 Exams',
		class: '👥 Classes',
		subject: '📚 Subjects',
		course: '🎓 Courses & Outlines',
		result: '📊 Results',
		user: '👤 Users',
		game: '🎮 Games',
		kidsGame: '🧸 Kids Games',
		championship: '🏆 Kids Championships',
		tournament: '🏅 Tournaments',
		device: '💻 Devices',
		activity: '🕘 Activity',
	};
	return labels[type] || type;
}

/**
 * Get icon for result type
 * @param {string} type - The result type
 * @returns {string} The icon SVG
 */
function getTypeIcon(type) {
	const icons = {
		question:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>',
		category:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
		exam: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
		class:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
		result:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
		subject:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><line x1="8" y1="7" x2="16" y2="7"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
		course:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10 12 5 2 10l10 5 10-5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
		user: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
		game: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg>',
		kidsGame:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="7" r="3"></circle><circle cx="16" cy="7" r="3"></circle><circle cx="12" cy="15" r="6"></circle></svg>',
		championship:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3"></path><path d="M7 5H4v2a3 3 0 0 0 3 3"></path></svg>',
		tournament:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6.1 2h11.8a2 2 0 0 1 1.7.8l1.61 2.14a2 2 0 0 1 .13 2.2L16.79 15"></path><path d="M11 12 5.12 2.2"></path><path d="M13 12 18.88 2.2"></path><path d="M7 15a5 5 0 1 0 10 0"></path></svg>',
		device:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
		activity:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 4 3 9 8 9"></polyline><polyline points="12 7 12 12 16 14"></polyline></svg>',
	};
	return icons[type] || '';
}

/* ── Navigation & highlighting ───────────────────────────────────────────── */

function cssEscape(value) {
	if (window.CSS && typeof window.CSS.escape === 'function') {
		return window.CSS.escape(String(value));
	}
	return String(value).replace(/["\\]/g, '\\$&');
}

function activateMainTab(tab) {
	const tabButton =
		document.querySelector(`.nav-tab[data-tab="${tab}"]`) ||
		document.querySelector(`button[onclick="openTab(event, '${tab}')"]`);
	if (tabButton) {
		tabButton.dispatchEvent(new Event('click', { bubbles: true }));
	}
}

function clickSelector(selector) {
	const element = document.querySelector(selector);
	if (element) element.dispatchEvent(new Event('click', { bubbles: true }));
	return Boolean(element);
}

function setInputValue(id, value) {
	const input = document.getElementById(id);
	if (!input) return;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('keyup', { bubbles: true }));
}

function findResultTarget(type, identifier) {
	const id = cssEscape(identifier);
	switch (type) {
		case 'question':
			return findQuestionRowByIndex(identifier);
		case 'category':
			return document.querySelector(`#categoryList tr[data-id="${id}"]`);
		case 'exam':
			return document.querySelector(`#examList tr[data-id="${id}"]`);
		case 'class':
			return document.querySelector(`#classList tr[data-id="${id}"]`);
		case 'result':
			return document.querySelector(`[data-result-id="${id}"]`);
		case 'subject':
			return document.querySelector(`#subjectTabBar [data-subject-id="${id}"]`);
		case 'course':
			return document.querySelector(`#courseList tbody tr[data-id="${id}"]`);
		case 'user':
			return document.querySelector(`#usersTableBody tr[data-user-id="${id}"]`);
		case 'game':
			return document.querySelector(`#gameList [data-game-id="${id}"]`);
		case 'kidsGame':
			return document.querySelector(`#kidsGameList [data-kids-game-id="${id}"]`);
		case 'championship':
			return document.querySelector(
				`#kidsChampionshipList [data-championship-id="${id}"]`,
			);
		case 'tournament':
			return document.querySelector(`#tournamentList [data-tournament-id="${id}"]`);
		case 'device':
			return (
				document.querySelector(`#devicesTableBody [data-device-id="${id}"]`) ||
				document.querySelector(`#devicesMobileList [data-device-id="${id}"]`)
			);
		default:
			return null;
	}
}

function findQuestionRowByIndex(index) {
	const questionTable = document.getElementById('question-list');
	if (!questionTable) return null;
	let visibleIndex = 0;
	const allRows = questionTable.querySelectorAll('tbody tr');
	for (const row of allRows) {
		if (row.style.display !== 'none' && !row.classList.contains('filtered-out')) {
			if (visibleIndex === index) return row;
			visibleIndex++;
		}
	}
	return null;
}

function highlightElement(element) {
	document.querySelectorAll('.global-search-highlight').forEach((el) => {
		el.classList.remove('global-search-highlight');
	});
	if (!element) return;
	element.classList.add('global-search-highlight');
	element.scrollIntoView({ behavior: 'smooth', block: 'center' });
	setTimeout(() => {
		element.classList.remove('global-search-highlight');
	}, 3000);
}

/** Poll for a row that renders asynchronously (devices, studios, users…). */
function highlightWhenReady(type, identifier, options = {}) {
	const tries = options.tries || 20;
	let attempt = 0;
	const tick = () => {
		const target = findResultTarget(type, identifier);
		if (target) {
			highlightElement(target);
			return;
		}
		if (attempt++ >= tries) {
			if (typeof options.fallback === 'function') options.fallback();
			return;
		}
		setTimeout(tick, 150);
	};
	setTimeout(tick, 120);
}

function revealCourse(id) {
	const course = findCourseById(id);
	const subjectId = course?.subject_id || course?.subjectId || '';
	try {
		window.selectCategorySubject?.(subjectId || '__unassigned__');
	} catch (_) {}
	const search = document.getElementById('courseSearch');
	if (search) search.value = '';
	try {
		window.renderCourseList?.();
	} catch (_) {}
	highlightWhenReady('course', id, {
		fallback: () => {
			try {
				window.openCourseDetail?.(id);
			} catch (_) {}
		},
	});
}

function openUserInSettings(id) {
	try {
		window.openSettingsModal?.();
	} catch (_) {}
	try {
		window.switchSettingsTab?.(null, 'users');
		window.switchUsersSettingsTab?.(null, 'management');
	} catch (_) {}
	// Neutralize the user-table filters so the searched account is visible.
	['userSearchInput', 'userRoleFilter', 'userStatusFilter', 'userClassFilter', 'userTeacherFilter'].forEach(
		(fieldId) => {
			const el = document.getElementById(fieldId);
			if (el) el.value = '';
		},
	);
	try {
		window.renderUsersTable?.();
	} catch (_) {}
	highlightWhenReady('user', id);
}

/**
 * Handle search result click
 * @param {string} type - The result type
 * @param {string} id - The result id
 * @param {number} index - The result index
 */
function handleSearchResultClick(type, id, index) {
	closeGlobalSearchResults();
	const input = document.getElementById('globalSearchInput');
	if (input) input.value = '';
	globalSearchTerm = '';

	let tabToOpen = '';

	switch (type) {
		case 'question':
			tabToOpen = 'questions';
			setTimeout(() => {
				highlightSearchResult('question', index);
			}, 300);
			break;
		case 'category':
			tabToOpen = 'subjects';
			// The category lives inside its subject tab: switch to that
			// subject first (empty subject_id = the legacy bucket) so the
			// row is rendered before we highlight it.
			try {
				const cat = repoAll('categories').find(
					(c) => String(c.id) === String(id),
				);
				if (typeof window.selectCategorySubject === 'function') {
					window.selectCategorySubject(cat?.subject_id || '__unassigned__');
				}
				// A category row is only on screen in the "All categories" view or
				// inside the branch of its course: reveal that pane before the
				// highlight runs, otherwise the row stays hidden.
				if (typeof window.revealCategoryPane === 'function') {
					window.revealCategoryPane(id);
				}
			} catch (_) {
				/* best-effort subject switch */
			}
			setTimeout(() => {
				highlightSearchResult('category', id);
			}, 300);
			break;
		case 'exam':
			tabToOpen = 'exams';
			setTimeout(() => {
				highlightSearchResult('exam', id);
			}, 300);
			break;
		case 'class':
			tabToOpen = 'classes';
			setTimeout(() => {
				highlightSearchResult('class', id);
			}, 300);
			break;
		case 'result':
			tabToOpen = 'results';
			setTimeout(() => {
				highlightSearchResult('result', id);
			}, 300);
			break;
		case 'subject':
			tabToOpen = 'subjects';
			setTimeout(() => {
				try {
					window.selectCategorySubject?.(id);
				} catch (_) {}
				highlightWhenReady('subject', id);
			}, 260);
			break;
		case 'course':
			tabToOpen = 'subjects';
			setTimeout(() => revealCourse(id), 260);
			break;
		case 'user':
			setTimeout(() => openUserInSettings(id), 260);
			break;
		case 'game':
			tabToOpen = 'games';
			setTimeout(() => {
				clickSelector('[data-games-studio-tab="games-studio"]');
				try {
					window.resetGameFilters?.();
				} catch (_) {}
				const game = findGameById(id);
				setInputValue('gameFilterSearch', (game && game.name) || '');
				highlightWhenReady('game', id);
			}, 300);
			break;
		case 'kidsGame':
			tabToOpen = 'games';
			setTimeout(() => {
				clickSelector('[data-games-studio-tab="kids-games-studio"]');
				try {
					window.resetKidsGameFilters?.();
				} catch (_) {}
				const kidsGame = asyncIndexFind('kidsGames', id);
				setInputValue('kidsGameFilterSearch', (kidsGame && kidsGame.name) || '');
				highlightWhenReady('kidsGame', id);
			}, 300);
			break;
		case 'championship':
			tabToOpen = 'games';
			setTimeout(() => {
				clickSelector('[data-games-studio-tab="kids-championships"]');
				highlightWhenReady('championship', id);
			}, 300);
			break;
		case 'tournament':
			tabToOpen = 'games';
			setTimeout(() => {
				clickSelector('[data-games-studio-tab="tournament-studio"]');
				clickSelector('[data-tournament-studio-tab="planner"]');
				highlightWhenReady('tournament', id);
			}, 300);
			break;
		case 'device':
			tabToOpen = 'devices';
			setTimeout(() => {
				try {
					window.ClassroomDevices?.refresh?.();
				} catch (_) {}
				highlightWhenReady('device', id);
			}, 300);
			break;
		case 'activity':
			tabToOpen = 'notifications';
			setTimeout(() => {
				try {
					window.QuizNotifications?.openInbox?.();
				} catch (_) {}
			}, 300);
			break;
	}

	if (tabToOpen) activateMainTab(tabToOpen);
}

function findGameById(id) {
	return repoAll('games').find((game) => String(game.id) === String(id)) || null;
}

/**
 * Highlight search result in the page
 * @param {string} type - The result type
 * @param {string|number} identifier - The id or index to highlight
 */
function highlightSearchResult(type, identifier) {
	if (type === 'question') {
		highlightElement(findQuestionRowByIndex(identifier));
		return;
	}
	highlightElement(findResultTarget(type, identifier));
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initGlobalSearch);

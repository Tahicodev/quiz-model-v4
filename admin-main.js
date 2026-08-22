// Admin Dashboard Main Scripts

let adminSectionsInitialized = false;

function initializeAdminSectionsAfterAuth() {
	if (adminSectionsInitialized) return;
	if (sessionStorage.getItem('adminLoggedIn') !== 'true') return;
	// Do not trust the legacy flag by itself. On a reload it can survive from
	// an earlier admin session while the current session belongs to a student
	// (or while checkAuthState() has not finished yet). Initializing the legacy
	// managers in that window causes them to write cached data through the
	// admin-only bulk endpoints and produces a burst of 403 responses.
	const currentRole = String(window.currentUser?.role || '').toLowerCase();
	const isAdminAreaRole =
		currentRole === 'admin' ||
		currentRole === 'super_admin' ||
		currentRole === 'teacher';
	if (!isAdminAreaRole) return;
	adminSectionsInitialized = true;
	setTimeout(function () {
		if (typeof showAdminButtons === 'function') {
			showAdminButtons();
		}
		if (typeof initCategoryManagement === 'function') {
			initCategoryManagement();
		}
		if (typeof initExamManagement === 'function') {
			initExamManagement();
		}
		if (typeof initClassManagement === 'function') {
			initClassManagement();
		}
		if (typeof initGameManagement === 'function') {
			initGameManagement();
		}
	}, 100);
}

const LEGACY_MIGRATION_ORDER = [
	'classes',
	'categories',
	'users',
	'questions',
	'exams',
	'exam_questions',
	'exam_classes',
	'results',
	'games',
	'game_sessions',
	'tournaments',
	'tournament_entries',
	'exam_sessions',
	'settings',
];

function legacyToken() {
	if (window.__authToken) return window.__authToken;
	try {
		const stored = JSON.parse(localStorage.getItem('quizSession') || 'null');
		if (stored?.token) return stored.token;
	} catch {}
	try {
		const stored = localStorage.getItem('quizAuthToken');
		if (stored) return stored;
	} catch {}
	return null;
}

function legacyCurrentUser() {
	try {
		const current = JSON.parse(
			localStorage.getItem('quizCurrentUser') || 'null',
		);
		if (current?.id) return current;
	} catch {}
	try {
		const session = JSON.parse(localStorage.getItem('quizSession') || 'null');
		if (session?.username || session?.userId) {
			return {
				id: session.userId || session.id,
				username: session.username || 'legacy-user',
				role: session.role || 'admin',
				school_id: session.school_id || null,
			};
		}
	} catch {}
	return null;
}

function legacyAsId(value) {
	const id = String(value ?? '').trim();
	return id || undefined;
}

function legacyAsNumber(value, fallback = null) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function legacyAsBoolean(value, fallback = false) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'string')
		return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
	return Boolean(value);
}

function legacyAsJson(value, fallback) {
	if (value === undefined || value === null) return fallback;
	if (typeof value === 'string') {
		try {
			JSON.parse(value);
			return value;
		} catch {
			return JSON.stringify(value);
		}
	}
	try {
		return JSON.stringify(value);
	} catch {
		return fallback;
	}
}

function legacyNormalizeQuestionType(row) {
	const raw = String(row.type || row.questionType || '').toLowerCase();
	if (raw === 'multiple-choice' || raw === 'multiple_choice' || raw === 'code')
		return 'mcq';
	if (raw === 'draggable' || raw === 'ordering' || raw === 'order')
		return 'order';
	if (raw === 'matching-pairs' || raw === 'matching_pairs') return 'matching';
	if (['mcq', 'true-false', 'fill-blank', 'matching'].includes(raw)) return raw;
	return 'mcq';
}

function legacyNormalizeQuestion(row) {
	const options = Array.isArray(row.options)
		? row.options
				.map((option) => (typeof option === 'object' ? option.text : option))
				.filter(Boolean)
		: row.options_json;
	const answer =
		Array.isArray(row.answer) || typeof row.answer === 'object'
			? legacyAsJson(row.answer, 'unknown')
			: String(row.answer ?? row.correctAnswer ?? '').trim() || 'unknown';

	return {
		id: legacyAsId(row.id),
		category_id: legacyAsId(row.category_id || row.category) || null,
		type: legacyNormalizeQuestionType(row),
		text: String(row.text || row.question || '').trim() || 'Migrated question',
		options_json: legacyAsJson(options, '[]'),
		answer,
		explanation: row.explanation == null ? null : String(row.explanation),
		points: legacyAsNumber(row.points, 1),
		difficulty: ['easy', 'medium', 'hard'].includes(String(row.difficulty))
			? row.difficulty
			: 'medium',
		tags: row.tags == null ? null : String(row.tags),
		media_url: row.media_url || row.image || null,
		created_at: row.created_at || row.createdAt,
		updated_at: row.updated_at || row.updatedAt,
	};
}

function legacyNormalizeUser(row) {
	return {
		id: legacyAsId(row.id),
		username:
			String(row.username || row.email || '').trim() ||
			`migrated-${legacyAsId(row.id) || 'user'}`,
		password_hash:
			row.password_hash ||
			row.passwordHash ||
			row.password ||
			'legacy-migrated',
		role: ['admin', 'teacher', 'student', 'super_admin'].includes(row.role)
			? row.role
			: 'student',
		name: String(row.name || row.username || 'Migrated user'),
		numero: row.numero || row.studentNumber || null,
		class_id: legacyAsId(row.class_id || row.classId) || null,
		status: row.status === 'disabled' ? 'inactive' : row.status || 'active',
		created_at: row.created_at || row.createdAt,
		updated_at: row.updated_at || row.updatedAt,
	};
}

function legacyNormalizeClass(row) {
	return {
		id: legacyAsId(row.id),
		name: String(row.name || 'Migrated class'),
		description: row.description == null ? null : String(row.description),
		created_at: row.created_at || row.dateCreated,
		updated_at: row.updated_at || row.updatedAt,
	};
}

function legacyNormalizeCategory(row) {
	return {
		id: legacyAsId(row.id),
		name: String(row.name || 'Migrated category'),
		parent_id: legacyAsId(row.parent_id || row.parentId) || null,
		icon: row.icon || null,
		color: row.color || null,
		created_at: row.created_at || row.createdAt,
		updated_at: row.updated_at || row.updatedAt,
	};
}

function legacyNormalizeExam(row, currentUserId) {
	return {
		id: legacyAsId(row.id),
		creator_id:
			legacyAsId(row.creator_id || row.creatorId || row.ownerId) ||
			currentUserId,
		name: String(row.name || 'Migrated exam'),
		description: row.description == null ? null : String(row.description),
		duration: legacyAsNumber(row.duration, null),
		passing_score: legacyAsNumber(row.passing_score ?? row.passingScore, 50),
		status: ['draft', 'active', 'archived'].includes(row.status)
			? row.status
			: 'draft',
		is_training: legacyAsBoolean(
			row.is_training ?? row.isTraining ?? row.training,
		),
		randomize: legacyAsBoolean(row.randomize),
		max_attempts: legacyAsNumber(row.max_attempts ?? row.maxAttempts, null),
		created_at: row.created_at || row.dateCreated,
		updated_at: row.updated_at || row.updatedAt,
	};
}

function legacyReferencesFor(value) {
	return Array.isArray(value) ? value : [];
}

function legacyNormalizeLegacyData(raw, currentUser) {
	const users = (raw.users || []).map(legacyNormalizeUser);
	const classes = (raw.classes || []).map(legacyNormalizeClass);
	const categories = (raw.categories || []).map(legacyNormalizeCategory);
	const questions = (raw.questions || []).map(legacyNormalizeQuestion);
	const currentUserId =
		legacyAsId(currentUser?.id) ||
		users.find((user) => user.role === 'admin')?.id;
	const exams = (raw.exams || []).map((exam) =>
		legacyNormalizeExam(exam, currentUserId),
	);
	const questionIdByIndex = new Map(
		(raw.questions || []).map((question, index) => [
			index,
			legacyAsId(question.id),
		]),
	);
	const questionIds = new Set(
		questions.map((question) => question.id).filter(Boolean),
	);
	const classIds = new Set(classes.map((item) => item.id).filter(Boolean));

	const examQuestions = [];
	const examClasses = [];
	(raw.exams || []).forEach((legacyExam, examIndex) => {
		const examId = exams[examIndex]?.id;
		if (!examId) return;
		legacyReferencesFor(legacyExam.questions).forEach(
			(reference, orderIndex) => {
				const questionId =
					typeof reference === 'number'
						? questionIdByIndex.get(reference)
						: legacyAsId(reference?.id || reference);
				if (questionId && questionIds.has(questionId)) {
					examQuestions.push({
						exam_id: examId,
						question_id: questionId,
						order_index: orderIndex,
					});
				}
			},
		);
		legacyReferencesFor(legacyExam.classes || legacyExam.classIds).forEach(
			(reference) => {
				const classId = legacyAsId(reference?.id || reference);
				if (classId && classIds.has(classId))
					examClasses.push({ exam_id: examId, class_id: classId });
			},
		);
	});

	const results = (raw.results || [])
		.map((row) => ({
			id: legacyAsId(row.id),
			exam_id: legacyAsId(row.exam_id || row.examId),
			user_id: legacyAsId(row.user_id || row.userId),
			score: legacyAsNumber(row.score, 0),
			total_points: legacyAsNumber(row.total_points ?? row.totalPoints, 0),
			earned_points: legacyAsNumber(row.earned_points ?? row.earnedPoints, 0),
			time_spent: legacyAsNumber(row.time_spent ?? row.timeSpent, null),
			answers_json: legacyAsJson(row.answers_json ?? row.answers, '{}'),
			mode: ['exam', 'training', 'game', 'tournament'].includes(row.mode)
				? row.mode
				: 'exam',
			passed: legacyAsBoolean(row.passed ?? row.isPassed),
			attempt_number: legacyAsNumber(
				row.attempt_number ?? row.attemptNumber,
				1,
			),
			date_taken:
				row.date_taken || row.dateTaken || row.created_at || row.createdAt,
		}))
		.filter((row) => row.exam_id && row.user_id);

	const games = (raw.games || [])
		.map((row) => {
			const ids = legacyReferencesFor(
				row.questions || row.questionIds || row.question_ids,
			)
				.map((question) => legacyAsId(question?.id || question))
				.filter(Boolean);
			return {
				id: legacyAsId(row.id),
				creator_id:
					legacyAsId(row.creator_id || row.creatorId || row.ownerId) ||
					currentUserId,
				name: String(row.name || 'Migrated game'),
				type: ['quiz', 'flashcard', 'memory', 'speed', 'battle'].includes(
					row.type,
				)
					? row.type
					: 'quiz',
				status: ['waiting', 'active', 'paused', 'finished'].includes(row.status)
					? row.status
					: 'waiting',
				settings_json: legacyAsJson(row.settings_json ?? row.settings, '{}'),
				join_code: row.join_code || row.joinCode || null,
				question_ids: JSON.stringify(ids),
				started_at: row.started_at || row.startedAt,
				ended_at: row.ended_at || row.endedAt,
				created_at: row.created_at || row.createdAt,
				updated_at: row.updated_at || row.updatedAt,
			};
		})
		.filter((row) => row.creator_id);

	const tournaments = (raw.tournaments || [])
		.map((row) => ({
			id: legacyAsId(row.id),
			creator_id:
				legacyAsId(row.creator_id || row.creatorId || row.ownerId) ||
				currentUserId,
			name: String(row.name || 'Migrated tournament'),
			description: row.description == null ? null : String(row.description),
			status: ['draft', 'open', 'active', 'finished'].includes(row.status)
				? row.status
				: 'draft',
			settings_json: legacyAsJson(row.settings_json ?? row.settings, '{}'),
			starts_at: row.starts_at || row.startsAt,
			ends_at: row.ends_at || row.endsAt,
			created_at: row.created_at || row.createdAt,
			updated_at: row.updated_at || row.updatedAt,
		}))
		.filter((row) => row.creator_id);

	const settings = (raw.settings || [])
		.map((row) => ({
			id: legacyAsId(row.id),
			key: String(row.key || row.name || '').trim(),
			value:
				typeof row.value === 'string'
					? row.value
					: JSON.stringify(row.value ?? ''),
			visibility: ['public', 'teacher', 'admin', 'system'].includes(
				row.visibility,
			)
				? row.visibility
				: 'admin',
			updated_at: row.updated_at || row.updatedAt,
		}))
		.filter((row) => row.key);

	return {
		classes,
		categories,
		users,
		questions,
		exams,
		exam_questions: examQuestions,
		exam_classes: examClasses,
		results,
		games,
		game_sessions: (raw.game_sessions || [])
			.map((row) => ({
				id: legacyAsId(row.id),
				game_id: legacyAsId(row.game_id || row.gameId),
				user_id: legacyAsId(row.user_id || row.userId),
				school_id: legacyAsId(row.school_id || row.schoolId) || null,
				score: legacyAsNumber(row.score, 0),
				answers_json: legacyAsJson(row.answers_json ?? row.answers, '{}'),
				rank: legacyAsNumber(row.rank, null),
				completed: legacyAsBoolean(row.completed, false),
				connected: legacyAsBoolean(row.connected, true),
				joined_at: row.joined_at || row.joinedAt,
				completed_at: row.completed_at || row.completedAt,
			}))
			.filter((row) => row.game_id && row.user_id),
		tournaments,
		tournament_entries: (raw.tournament_entries || [])
			.map((row) => ({
				id: legacyAsId(row.id),
				tournament_id: legacyAsId(row.tournament_id || row.tournamentId),
				user_id: legacyAsId(row.user_id || row.userId),
				school_id: legacyAsId(row.school_id || row.schoolId) || null,
				score: legacyAsNumber(row.score, 0),
				registered_at: row.registered_at || row.registeredAt,
			}))
			.filter((row) => row.tournament_id && row.user_id),
		exam_sessions: (raw.exam_sessions || [])
			.map((row) => ({
				id: legacyAsId(row.id),
				school_id: legacyAsId(row.school_id || row.schoolId) || null,
				exam_id: legacyAsId(row.exam_id || row.examId),
				user_id: legacyAsId(row.user_id || row.userId),
				status: ['active', 'completed', 'expired'].includes(row.status)
					? row.status
					: 'active',
				answers_json: legacyAsJson(row.answers_json ?? row.answers, '{}'),
				current_question_index: legacyAsNumber(
					row.current_question_index ?? row.currentQuestionIndex,
					0,
				),
				started_at: row.started_at || row.startedAt,
				expires_at: row.expires_at || row.expiresAt,
				last_heartbeat: row.last_heartbeat || row.lastHeartbeat,
				completed_at: row.completed_at || row.completedAt,
			}))
			.filter((row) => row.exam_id && row.user_id),
		settings,
	};
}

async function legacyBuildMigrationPayload() {
	const raw = Object.fromEntries(
		LEGACY_MIGRATION_ORDER.map((table) => [
			table,
			JSON.parse(
				localStorage.getItem(
					{
						classes: 'quizClasses',
						categories: 'quizCategories',
						users: 'quizUsers',
						questions: 'quizQuestions',
						exams: 'quizExams',
						exam_questions: 'quizExamQuestions',
						exam_classes: 'quizExamClasses',
						results: 'quizResults',
						games: 'quizGames',
						game_sessions: 'quizGameSessions',
						tournaments: 'quizTournaments',
						tournament_entries: 'quizTournamentEntries',
						exam_sessions: 'quizExamSessions',
						settings: 'quizSettings',
					}[table] || table,
				) || '[]',
			),
		]),
	);
	const normalized = legacyNormalizeLegacyData(raw, legacyCurrentUser());
	return {
		data: Object.fromEntries(
			LEGACY_MIGRATION_ORDER.map((table) => [
				table,
				normalized[table] || [],
			]).filter(([, rows]) => rows.length > 0),
		),
	};
}

async function legacyRenderMigrationStatus(host) {
	const history = host;
	history.replaceChildren();
	try {
		const token = legacyToken();
		const res = await fetch(
			`${window.APP_CONFIG?.apiUrl || '/api/v1'}/migrate/status`,
			{
				headers: { ...(token && { Authorization: `Bearer ${token}` }) },
			},
		);
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(`${res.status}: ${body.message || res.statusText}`);
		}
		const { counts = {} } = await res.json();
		const table = document.createElement('table');
		table.className = 'data-table';
		const head = document.createElement('thead');
		const row = document.createElement('tr');
		['Table', 'Backend records'].forEach((label) => {
			const cell = document.createElement('th');
			cell.textContent = label;
			row.appendChild(cell);
		});
		head.appendChild(row);
		table.appendChild(head);
		const body = document.createElement('tbody');
		for (const [tableName, count] of Object.entries(counts)) {
			const tr = document.createElement('tr');
			const name = document.createElement('td');
			name.textContent = tableName;
			const total = document.createElement('td');
			total.textContent = count == null ? 'Unavailable' : String(count);
			tr.append(name, total);
			body.appendChild(tr);
		}
		table.appendChild(body);
		history.appendChild(table);
	} catch (err) {
		const message = document.createElement('p');
		message.className = 'admin-error';
		message.textContent = `Could not load backend status: ${err.message}`;
		history.appendChild(message);
	}
}

async function legacyRunMigration() {
	const output = document.getElementById('legacy-migration-output');
	const btn = document.getElementById('legacy-migrate-btn');
	const statusHost = document.getElementById('legacy-migration-status');
	const warning = document.getElementById('migration-warning');
	btn.disabled = true;
	output.textContent = 'Migrating…';
	try {
		const payload = await legacyBuildMigrationPayload();
		const token = legacyToken();
		const res = await fetch(
			`${window.APP_CONFIG?.apiUrl || '/api/v1'}/migrate`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token && { Authorization: `Bearer ${token}` }),
				},
				body: JSON.stringify(payload),
			},
		);
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(
				`Migration failed (${res.status}): ${body.message || body.error?.message || res.statusText}`,
			);
		}
		const { results = [], totalInserted = 0 } = await res.json();
		output.textContent = results
			.map(
				(r) =>
					`Migrated ${r.inserted}/${r.total} records for ${r.table}` +
					(r.skipped ? ` (${r.skipped} skipped as duplicates)` : '') +
					(r.error ? ` — ERROR: ${r.error}` : ''),
			)
			.join('\n');
		output.textContent += `\nTotal inserted: ${totalInserted}. Re-run to confirm idempotency (expect 0 inserted).`;
		await legacyRenderMigrationStatus(statusHost);
		warning.textContent =
			'Migration sent. Re-run to confirm zero inserts and verify tenant-scoped counts.';
	} catch (err) {
		output.textContent = `Migration failed: ${err.message}`;
	} finally {
		btn.disabled = false;
	}
}

function initializeLegacyMigrationTab() {
	const tab = document.getElementById('migration');
	if (!tab) return;
	const warning = document.getElementById('migration-warning');
	const migrateBtn = document.getElementById('legacy-migrate-btn');
	const statusBtn = document.getElementById('legacy-migration-status-btn');
	const statusHost = document.getElementById('legacy-migration-status');
	if (window.APP_CONFIG?.mode === 'saas') {
		warning.textContent =
			'Run this after signing in to the target school. Existing records are skipped.';
		migrateBtn.disabled = false;
		statusBtn.disabled = false;
	} else {
		warning.textContent =
			'Migration is available when the app is connected to the backend in SaaS mode.';
		migrateBtn.disabled = true;
		statusBtn.disabled = true;
	}

	migrateBtn.addEventListener('click', legacyRunMigration);
	statusBtn.addEventListener('click', () =>
		legacyRenderMigrationStatus(statusHost),
	);
	if (window.APP_CONFIG?.mode === 'saas') {
		legacyRenderMigrationStatus(statusHost);
	}
}

document.addEventListener('DOMContentLoaded', function () {
	initializeAdminSectionsAfterAuth();
	window.addEventListener('auth:changed', initializeAdminSectionsAfterAuth);
	initializeLegacyMigrationTab();

	// Initialize pagination
	applyPagination();

	// Initialize checkbox clickable behavior
	makeCheckboxItemsClickable();

	// Initialize observers
	initMutationObserver();
});

// Toggle Dropdown
function toggleDropdown(button) {
	const allDropdowns = document.querySelectorAll('.dropdown-menu.active');
	allDropdowns.forEach((d) => {
		if (d.parentElement !== button.parentElement) {
			d.classList.remove('active');
			d.parentElement.classList.remove('active');
		}
	});

	const dropdown = button.parentElement;
	const menu = dropdown.querySelector('.dropdown-menu');

	menu.classList.toggle('active');
	dropdown.classList.toggle('active');

	const closeDropdown = function (e) {
		if (!dropdown.contains(e.target)) {
			menu.classList.remove('active');
			dropdown.classList.remove('active');
			document.removeEventListener('click', closeDropdown);
		}
	};

	setTimeout(() => {
		document.addEventListener('click', closeDropdown);
	}, 0);
}

// Pagination Logic
const ITEMS_PER_PAGE = 20;

function filterQuestions(resetPage = true) {
	const searchQuery = document
		.getElementById('searchQuestions')
		.value.toLowerCase();
	const questionList = document.getElementById('question-list');
	const rows = questionList.getElementsByTagName('tr');

	const typeFilter = document.getElementById('typeFilterMain');
	const selectedType = typeFilter ? typeFilter.value : 'all';

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const cells = row.getElementsByTagName('td');
		if (cells.length === 0) continue;

		const questionText = cells[2] ? cells[2].textContent.toLowerCase() : '';
		const optionsText = cells[3] ? cells[3].textContent.toLowerCase() : '';
		const answerText = cells[5] ? cells[5].textContent.toLowerCase() : '';
		const questionType = row.getAttribute('data-type') || 'multiple-choice';

		const matchesSearch =
			!searchQuery ||
			questionText.includes(searchQuery) ||
			optionsText.includes(searchQuery) ||
			answerText.includes(searchQuery);

		const matchesType = selectedType === 'all' || questionType === selectedType;

		if (matchesSearch && matchesType) {
			row.classList.remove('filtered-out');
		} else {
			row.classList.add('filtered-out');
		}
	}

	if (resetPage) {
		document.getElementById('current-page').textContent = '1';
	}

	applyPagination();
}

// Set type filter from badge
window.setMainTypeFilter = function (type, element) {
	const hiddenInput = document.getElementById('typeFilterMain');
	if (hiddenInput) {
		hiddenInput.value = type;
	}

	// Update active state on badges
	const badges = document.querySelectorAll(
		'.questions-type-filters .type-filter-badge',
	);
	badges.forEach((b) => b.classList.remove('active'));

	if (element) {
		element.classList.add('active');
	}

	// Re-filter questions
	filterQuestions();
};

function applyPagination() {
	const questionList = document.getElementById('question-list');
	if (!questionList) return;

	const rows = questionList.getElementsByTagName('tr');
	const visibleRows = Array.from(rows).filter(
		(row) => !row.classList.contains('filtered-out'),
	);
	let currentPage =
		parseInt(document.getElementById('current-page').textContent) || 1;

	updatePagination(rows, visibleRows, ITEMS_PER_PAGE, currentPage);
}

function updatePagination(allRows, visibleRows, itemsPerPage, currentPage) {
	const totalPages = Math.ceil(visibleRows.length / itemsPerPage);

	if (currentPage > totalPages && totalPages > 0) {
		currentPage = totalPages;
		document.getElementById('current-page').textContent = currentPage;
	}
	if (currentPage < 1) {
		currentPage = 1;
		document.getElementById('current-page').textContent = currentPage;
	}

	const startIndex = (currentPage - 1) * itemsPerPage;
	const endIndex = Math.min(startIndex + itemsPerPage, visibleRows.length);

	Array.from(allRows).forEach((row) => {
		row.style.display = 'none';
	});

	for (let i = startIndex; i < endIndex; i++) {
		if (visibleRows[i]) {
			visibleRows[i].style.display = '';
		}
	}

	const startDisplay = visibleRows.length > 0 ? startIndex + 1 : 0;
	document.getElementById('pagination-start').textContent = startDisplay;
	document.getElementById('pagination-end').textContent = endIndex;
	document.getElementById('pagination-total').textContent = visibleRows.length;
	document.getElementById('current-page').textContent = currentPage;
	document.getElementById('total-pages').textContent = totalPages || 1;

	document.getElementById('prev-page').disabled = currentPage <= 1;
	document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function changePage(direction) {
	const currentPageElement = document.getElementById('current-page');
	let currentPage = parseInt(currentPageElement.textContent);
	const newPage = currentPage + direction;

	currentPageElement.textContent = newPage;
	filterQuestions(false);
}

// Checkbox Clickable Logic
function makeCheckboxItemsClickable() {
	const checkboxItems = document.querySelectorAll('.checkbox-list-item');

	checkboxItems.forEach((item) => {
		if (item.dataset.hasClickHandler) return;

		item.dataset.hasClickHandler = 'true';

		item.addEventListener('click', function (e) {
			const checkbox = this.querySelector('input[type="checkbox"]');

			if (e.target !== checkbox) {
				checkbox.checked = !checkbox.checked;

				if (checkbox.checked) {
					this.classList.add('active');
				} else {
					this.classList.remove('active');
				}

				const event = new Event('change');
				checkbox.dispatchEvent(event);
			}
		});
	});
}

function initMutationObserver() {
	const observer = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
				mutation.addedNodes.forEach(function (node) {
					if (node.nodeType === 1) {
						if (
							node.classList &&
							node.classList.contains('checkbox-list-item')
						) {
							makeCheckboxItemsClickable();
						} else if (node.querySelectorAll) {
							const items = node.querySelectorAll('.checkbox-list-item');
							if (items.length > 0) {
								makeCheckboxItemsClickable();
							}
						}
					}
				});
			}
		});
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

// Custom Dropdown Logic
function showCustomDropdown(type, optionData, currentValue) {
	const selectId = type === 'mc' ? 'answer-select-mc' : 'answer-select-ooo';
	const textWrapper = document.getElementById(
		`text-answer-select-${type === 'mc' ? '' : 'ooo-'}wrapper`,
	);
	const imageWrapper = document.getElementById(
		`image-answer-select-${type === 'mc' ? '' : 'ooo-'}wrapper`,
	);
	const select = document.getElementById(selectId);

	// Early return if required elements don't exist
	if (!select) {
		console.warn('showCustomDropdown: select element not found:', selectId);
		return;
	}

	if (textWrapper) textWrapper.classList.add('hidden');
	if (imageWrapper) imageWrapper.classList.remove('hidden');

	while (select.options.length > 1) {
		select.remove(1);
	}

	optionData.forEach((opt) => {
		const optionElement = document.createElement('option');
		optionElement.value = opt.text;
		optionElement.textContent = opt.text;
		select.appendChild(optionElement);
	});

	// Only try to populate custom dropdown menu if imageWrapper exists
	if (!imageWrapper) {
		console.warn('showCustomDropdown: imageWrapper not found');
		return;
	}

	const menu = imageWrapper.querySelector('.custom-dropdown-menu');
	if (!menu) {
		console.warn('showCustomDropdown: custom-dropdown-menu not found');
		return;
	}

	menu.innerHTML = '';

	optionData.forEach((opt, index) => {
		const optionEl = document.createElement('div');
		optionEl.className = 'custom-dropdown-option';
		optionEl.dataset.value = opt.text;

		if (opt.image) {
			const img = document.createElement('img');
			img.src = opt.image;
			img.alt = opt.text || `Option ${index + 1}`;
			img.onclick = (e) => {
				e.stopPropagation();
				if (typeof openLightbox === 'function') {
					openLightbox(opt.image);
				}
			};
			optionEl.appendChild(img);
		}

		const text = document.createElement('span');
		text.textContent = opt.text || `Image ${index + 1}`;
		optionEl.appendChild(text);

		if (opt.text === currentValue) {
			optionEl.classList.add('selected');
		}

		optionEl.addEventListener('click', () =>
			selectCustomOption(selectId, opt, imageWrapper),
		);
		menu.appendChild(optionEl);
	});

	setupCustomDropdownHandlers(imageWrapper);

	if (currentValue) {
		const selectedOpt = optionData.find((opt) => opt.text === currentValue);
		if (selectedOpt) {
			updateCustomDropdownDisplay(imageWrapper, selectedOpt);
			select.value = currentValue;
		}
	} else if (optionData.length > 0) {
		const firstOption = optionData[0];
		updateCustomDropdownDisplay(imageWrapper, firstOption);
		select.value = firstOption.text;

		const firstOptionEl = menu.querySelector('.custom-dropdown-option');
		if (firstOptionEl) {
			firstOptionEl.classList.add('selected');
		}

		select.dispatchEvent(new Event('change'));
	}
}

function selectCustomOption(selectId, option, wrapper) {
	const select = document.getElementById(selectId);
	select.value = option.text;

	updateCustomDropdownDisplay(wrapper, option);

	const menu = wrapper.querySelector('.custom-dropdown-menu');
	menu.querySelectorAll('.custom-dropdown-option').forEach((opt) => {
		opt.classList.toggle('selected', opt.dataset.value === option.text);
	});

	wrapper.classList.remove('open');
	select.dispatchEvent(new Event('change'));
}

function updateCustomDropdownDisplay(wrapper, option) {
	const display = wrapper.querySelector('.selected-option-display');
	display.innerHTML = '';

	if (option.image) {
		const img = document.createElement('img');
		img.src = option.image;
		img.alt = option.text;
		display.appendChild(img);
	}

	const text = document.createElement('span');
	text.textContent = option.text || 'Selected';
	display.appendChild(text);
}

function setupCustomDropdownHandlers(wrapper) {
	const trigger = wrapper.querySelector('.custom-dropdown-trigger');
	const newTrigger = trigger.cloneNode(true);
	trigger.parentNode.replaceChild(newTrigger, trigger);

	newTrigger.addEventListener('click', (e) => {
		e.stopPropagation();
		wrapper.classList.toggle('open');
	});

	document.addEventListener('click', (e) => {
		if (!wrapper.contains(e.target)) {
			wrapper.classList.remove('open');
		}
	});
}

function showStandardSelect(type, options, currentValue) {
	const selectId = type === 'mc' ? 'answer-select-mc' : 'answer-select-ooo';
	const textWrapper = document.getElementById(
		`text-answer-select-${type === 'mc' ? '' : 'ooo-'}wrapper`,
	);
	const imageWrapper = document.getElementById(
		`image-answer-select-${type === 'mc' ? '' : 'ooo-'}wrapper`,
	);
	const select = document.getElementById(selectId);

	if (textWrapper) textWrapper.classList.remove('hidden');
	if (imageWrapper) imageWrapper.classList.add('hidden');

	while (select.options.length > 1) {
		select.remove(1);
	}

	options.forEach((opt) => {
		const optionElement = document.createElement('option');
		optionElement.value = opt;
		optionElement.textContent = opt;
		select.appendChild(optionElement);
	});

	if (options.includes(currentValue)) {
		select.value = currentValue;
	}
}

function updatePreview(selectId, previewId) {
	const select = document.getElementById(selectId);
	const preview = document.getElementById(previewId);
	if (!select || !preview) return;

	const selectedOption = select.options[select.selectedIndex];
	if (selectedOption && selectedOption.dataset.image) {
		preview.style.backgroundImage = `url('${selectedOption.dataset.image}')`;
		preview.classList.remove('hidden');
		preview.onclick = () => openLightbox(selectedOption.dataset.image);
	} else {
		preview.classList.add('hidden');
	}
}

// Lightbox Logic
let currentLightboxImages = [];
let currentLightboxIndex = 0;
let currentZoomLevel = 1;

function openLightbox(imageSrc) {
	if (!imageSrc) return;

	const modal = document.getElementById('image-lightbox-modal');
	const img = document.getElementById('lightbox-image');

	currentLightboxImages = [imageSrc];
	currentLightboxIndex = 0;

	img.src = imageSrc;
	modal.style.display = 'flex';

	void modal.offsetWidth;

	modal.classList.add('active');
	document.body.style.overflow = 'hidden';

	updateLightboxCounter();
	updateNavigationButtons();
	resetLightboxZoom();
}

function closeLightbox() {
	const modal = document.getElementById('image-lightbox-modal');
	modal.classList.remove('active');

	setTimeout(() => {
		modal.style.display = 'none';
		document.body.style.overflow = '';
		currentLightboxImages = [];
		currentLightboxIndex = 0;
		currentZoomLevel = 1;
	}, 300);
}

function navigateLightbox(direction) {
	if (currentLightboxImages.length <= 1) return;

	currentLightboxIndex += direction;

	if (currentLightboxIndex < 0) {
		currentLightboxIndex = currentLightboxImages.length - 1;
	} else if (currentLightboxIndex >= currentLightboxImages.length) {
		currentLightboxIndex = 0;
	}

	const img = document.getElementById('lightbox-image');
	img.style.opacity = '0';

	setTimeout(() => {
		img.src = currentLightboxImages[currentLightboxIndex];
		currentZoomLevel = 1;
		img.style.transform = 'scale(1)';
		img.style.opacity = '1';
		updateLightboxCounter();
	}, 150);
}

function updateLightboxCounter() {
	const counter = document.getElementById('lightbox-counter');
	counter.textContent = `${currentLightboxIndex + 1} / ${currentLightboxImages.length}`;
}

function updateNavigationButtons() {
	const prevBtn = document.querySelector('.lightbox-prev');
	const nextBtn = document.querySelector('.lightbox-next');

	if (currentLightboxImages.length <= 1) {
		prevBtn.style.display = 'none';
		nextBtn.style.display = 'none';
	} else {
		prevBtn.style.display = 'flex';
		nextBtn.style.display = 'flex';
	}
}

function zoomLightboxImage(delta) {
	currentZoomLevel = Math.max(0.5, Math.min(3, currentZoomLevel + delta));
	const img = document.getElementById('lightbox-image');
	img.style.transform = `scale(${currentZoomLevel})`;
}

function resetLightboxZoom() {
	currentZoomLevel = 1;
	const img = document.getElementById('lightbox-image');
	img.style.transform = 'scale(1)';
}

document.addEventListener('keydown', function (e) {
	const modal = document.getElementById('image-lightbox-modal');
	if (modal && modal.style.display === 'none') return;

	switch (e.key) {
		case 'Escape':
			closeLightbox();
			break;
		case 'ArrowLeft':
			navigateLightbox(-1);
			break;
		case 'ArrowRight':
			navigateLightbox(1);
			break;
		case '+':
		case '=':
			zoomLightboxImage(0.2);
			break;
		case '-':
		case '_':
			zoomLightboxImage(-0.2);
			break;
		case '0':
			resetLightboxZoom();
			break;
	}
});

// Responsive Table Logic
function initResponsiveTables() {
	const tableBody = document.getElementById('question-list');
	if (!tableBody) return;

	tableBody.addEventListener('click', function (e) {
		// Only trigger on mobile/tablet widths
		if (window.innerWidth > 768) return;

		// Don't trigger if clicking checkbox or action buttons
		if (
			e.target.type === 'checkbox' ||
			e.target.closest('.exam-actions') ||
			e.target.closest('.question-checkbox')
		) {
			return;
		}

		const row = e.target.closest('tr');
		if (!row || row.classList.contains('detail-row')) return;

		// Toggle expansion
		if (row.classList.contains('expanded')) {
			row.classList.remove('expanded');
			const nextRow = row.nextElementSibling;
			if (nextRow && nextRow.classList.contains('detail-row')) {
				nextRow.remove();
			}
			// Update bulk buttons to show/hide edit button
			if (typeof updateBulkDeleteButtons === 'function') {
				updateBulkDeleteButtons();
			}
		} else {
			// Close other expanded rows (optional, but cleaner)
			const expandedRows = tableBody.querySelectorAll('tr.expanded');
			expandedRows.forEach((r) => {
				r.classList.remove('expanded');
				const next = r.nextElementSibling;
				if (next && next.classList.contains('detail-row')) {
					next.remove();
				}
			});

			row.classList.add('expanded');

			// Create detail row
			const detailRow = document.createElement('tr');
			detailRow.className = 'detail-row';

			// Get data from columns
			// cells[0] = checkbox, cells[1] = #, cells[2] = Question, cells[3] = Options, cells[4] = Image, cells[5] = Answer, cells[6] = Actions
			const options = row.cells[3].innerHTML;
			const image = row.cells[4].innerHTML;
			const answer = row.cells[5].innerHTML;

			detailRow.innerHTML = `
                <td colspan="100%">
                    <div class="row-details">
                        <div class="detail-group">
                            <strong>Options:</strong>
                            <div class="detail-content">${options}</div>
                        </div>
                        <div class="detail-group">
                            <strong>Correct Answer:</strong>
                            <div class="detail-content">${answer}</div>
                        </div>
                        ${
													image &&
													image !== '-' &&
													!image.includes('text-muted')
														? `
                        <div class="detail-group">
                            <strong>Image:</strong>
                            <div class="detail-content">${image}</div>
                        </div>
                        `
														: ''
												}
                    </div>
                </td>
            `;

			row.parentNode.insertBefore(detailRow, row.nextSibling);

			// Update bulk buttons to hide edit button when row is expanded
			if (typeof updateBulkDeleteButtons === 'function') {
				updateBulkDeleteButtons();
			}
		}
	});
}

// Collapse expanded rows when window grows to desktop size
function collapseExpandedRowsOnResize() {
	if (window.innerWidth > 768) {
		const tableBody = document.getElementById('question-list');
		if (!tableBody) return;

		const expandedRows = tableBody.querySelectorAll('tr.expanded');
		expandedRows.forEach((row) => {
			row.classList.remove('expanded');
			const nextRow = row.nextElementSibling;
			if (nextRow && nextRow.classList.contains('detail-row')) {
				nextRow.remove();
			}
		});

		// Update bulk buttons
		if (typeof updateBulkDeleteButtons === 'function') {
			updateBulkDeleteButtons();
		}
	}
}

// Add resize listener to collapse rows when window grows
let resizeTimeout;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(() => {
		collapseExpandedRowsOnResize();
	}, 100);
});

// Initialize responsive tables on load
document.addEventListener('DOMContentLoaded', function () {
	initResponsiveTables();
});

// Tab Navigation
function openTab(event, tabName) {
	// Redirect unauthenticated navigation to the login modal instead of
	// showing an "Access denied" toast when no session exists yet.
	const hasStoredSession = (function () {
		try {
			return !!(
				sessionStorage.getItem('quizSession') ||
				localStorage.getItem('quizSessionRemember')
			);
		} catch (e) {
			return false;
		}
	})();
	if (!window.currentUser && !hasStoredSession) {
		if (typeof window.checkAuthState === 'function') {
			window.checkAuthState();
		}
		return;
	}
	if (window.Auth && typeof window.Auth.canAccessTab === 'function') {
		if (!window.Auth.canAccessTab(tabName)) {
			if (typeof showToast === 'function') {
				showToast('Access denied for this section', 'error');
			}
			return;
		}
	}
	// Hide all tab contents
	const tabContents = document.querySelectorAll('.tab-content');
	tabContents.forEach((content) => {
		content.classList.remove('active');
	});

	// Remove active class from all tabs
	const tabs = document.querySelectorAll('.nav-tab');
	tabs.forEach((tab) => {
		tab.classList.remove('active');
	});

	// Show selected tab content
	const selectedTab = document.getElementById(tabName);
	if (selectedTab) {
		selectedTab.classList.add('active');
	}

	// Add active class to clicked tab
	if (event && event.currentTarget) {
		event.currentTarget.classList.add('active');
	}

	if (
		tabName === 'activity' &&
		typeof window.markAdminNotificationsSeen === 'function'
	) {
		window.markAdminNotificationsSeen();
		if (typeof window.loadActivityLog === 'function') {
			window.loadActivityLog();
		}
	}

	// Auto-close mobile menu if open
	const headerNav = document.getElementById('headerNav');
	if (
		headerNav &&
		headerNav.classList.contains('active') &&
		window.innerWidth <= 768
	) {
		if (typeof toggleMobileNav === 'function') {
			toggleMobileNav();
		} else {
			headerNav.classList.remove('active');
		}
	}
}

// Open tab and highlight specific item
function openTabAndHighlight(event, tabName, itemId) {
	// First, open the tab
	openTab(event, tabName);

	// Wait for tab to be visible, then find and highlight item
	// Increased timeout to 800ms for more reliable rendering on slower devices
	setTimeout(() => {
		if (!itemId) return;

		// Find the item element based on data-id attribute
		let itemElement = null;

		// Try different selectors based on tab type
		const selectors = [
			`[data-id="${itemId}"]`,
			`[data-exam-id="${itemId}"]`,
			`[data-class-id="${itemId}"]`,
			`[data-category-id="${itemId}"]`,
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element) {
				// For categories, ensure we target the row or folder correctly
				itemElement = element;
				break;
			}
		}

		if (itemElement) {
			// Special handling for questions pagination
			if (tabName === 'questions') {
				const questionList = document.getElementById('question-list');
				if (questionList) {
					// Get ALL rows to find the absolute index
					const allRows = Array.from(
						questionList.querySelectorAll('tr:not(.filtered-out)'),
					);
					const rowIndex = allRows.indexOf(itemElement);

					if (rowIndex !== -1) {
						const page = Math.floor(rowIndex / ITEMS_PER_PAGE) + 1;
						const currentPageElement = document.getElementById('current-page');
						const currentPage = parseInt(currentPageElement.textContent) || 1;

						if (page !== currentPage) {
							currentPageElement.textContent = page;
							applyPagination();
							// Re-query the element as applyPagination might have hidden/shown it
							setTimeout(() => {
								const reFoundElement = document.querySelector(
									`[data-id="${itemId}"]`,
								);
								if (reFoundElement) {
									reFoundElement.scrollIntoView({
										behavior: 'smooth',
										block: 'start',
									});
									reFoundElement.classList.add('highlight-item');
									setTimeout(
										() => reFoundElement.classList.remove('highlight-item'),
										3000,
									);
								}
							}, 100);
							return; // Stop here as we'll handle the rest in the sub-timeout
						}
					}
				}
			}

			// Scroll to item (using 'start' with scroll-margin-top for better accuracy with sticky header)
			itemElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

			// Add highlight class
			itemElement.classList.add('highlight-item');

			// Remove highlight after animation completes (3 seconds)
			setTimeout(() => {
				itemElement.classList.remove('highlight-item');
			}, 3000);
		}
	}, 800);
}

// Logout function
function logout() {
	if (typeof window.authLogout === 'function') {
		window.authLogout();
		return;
	}
	sessionStorage.removeItem('adminLoggedIn');
	window.location.reload();
}

// Select all questions toggle
function toggleSelectAllQuestions(checkbox) {
	const questionList = document.getElementById('question-list');
	if (!questionList) return;

	const checkboxes = questionList.querySelectorAll('input[type="checkbox"]');
	checkboxes.forEach((cb) => {
		cb.checked = checkbox.checked;
	});

	updateBulkDeleteButtons();
}

// Delete selected questions. Keep the database as the source of truth: the
// legacy cache is changed only after each server delete succeeds.
async function deleteSelectedQuestions() {
	const questionList = document.getElementById('question-list');
	if (!questionList) return;

	const selectedCheckboxes = questionList.querySelectorAll(
		'input[type="checkbox"]:checked',
	);
	if (selectedCheckboxes.length === 0) {
		showToast('No questions selected', 'error');
		return;
	}

	if (
		!confirm(
			`Are you sure you want to delete ${selectedCheckboxes.length} question(s)?`,
		)
	) {
		return;
	}

	// Get indices to delete (in reverse order to avoid index shifting)
	const indices = [];
	selectedCheckboxes.forEach((cb) => {
		const index = parseInt(cb.dataset.index);
		if (!isNaN(index)) {
			indices.push(index);
		}
	});

	// Sort in descending order
	indices.sort((a, b) => b - a);

	let questions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	const selectedRecords = new Map(
		indices.map((index) => [index, questions[index]]),
	);

	if (!window.API || typeof window.API.remove !== 'function') {
		showToast('Question API is unavailable. Reload the page and try again.', 'error');
		return;
	}

	const deletedIndexes = [];
	for (const index of indices) {
		const question = questions[index];
		if (!question) continue;
		try {
			if (question.id) {
				await window.API.remove('questions', question.id);
			}
			deletedIndexes.push(index);
		} catch (apiErr) {
			// A local-only legacy row is already absent from Prisma; removing it
			// locally is safe. Other failures must leave the row visible so the
			// user can retry without losing track of it.
			if (apiErr?.status === 404) {
				deletedIndexes.push(index);
				continue;
			}
			console.error('[questions] bulk API delete failed:', apiErr);
			showToast(
				`Deleted ${deletedIndexes.length} question(s); the rest failed: ${apiErr?.message || 'server error'}`,
				'error',
			);
			break;
		}
	}

	if (!deletedIndexes.length) return;

	// Remove only records confirmed absent from the server. Indices are sorted
	// descending, so splicing cannot shift a later target.
	deletedIndexes.forEach((index) => questions.splice(index, 1));

	// Log the activity after persistence so the audit trail reflects reality.
	if (typeof logActivity === 'function') {
		const metadata = { count: deletedIndexes.length };
		let logName = `${deletedIndexes.length} Questions`;
		if (deletedIndexes.length === 1) {
			const index = deletedIndexes[0];
			const q = selectedRecords.get(index);
			metadata.number = index + 1;
			logName = `Question #${metadata.number}`;
			if (q) {
				const text = String(q.question || q.text || '');
				metadata.text = text.length > 50 ? text.substring(0, 50) + '...' : text;
				metadata.type = q.type || (q.isDraggable ? 'draggable' : 'multiple-choice');
			}
		}
		logActivity('question', logName, 'deleted', metadata);
	}

	window.__DI_CONTAINER__.repo.setAll_sync('questions', questions);

	// Refresh list
	if (typeof updateQuestionList === 'function') {
		updateQuestionList();
	}

	if (deletedIndexes.length === indices.length) {
		showToast(`Deleted ${deletedIndexes.length} question(s)`);
	}
}

// Expose to window
window.openTab = openTab;
window.openTabAndHighlight = openTabAndHighlight;
window.logout = logout;
window.toggleSelectAllQuestions = toggleSelectAllQuestions;
window.deleteSelectedQuestions = deleteSelectedQuestions;

// User Profile Dropdown
function toggleProfileMenu() {
	const dropdown = document.querySelector('.user-profile-dropdown');
	dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
	const dropdown = document.querySelector('.user-profile-dropdown');
	if (dropdown && dropdown.classList.contains('active')) {
		if (!dropdown.contains(event.target)) {
			dropdown.classList.remove('active');
		}
	}
});

// Expose to window
window.toggleProfileMenu = toggleProfileMenu;
window.openSettingsModal = openSettingsModal;

function updateAdminNotifications() {
	const badge = document.getElementById('adminNotificationBadge');
	const activityTab = document.querySelector('.nav-tab[data-tab="activity"]');
	if (!badge || typeof window.getAdminNotificationCount !== 'function') return;
	const count = window.getAdminNotificationCount();
	if (count > 0) {
		badge.textContent = count > 99 ? '99+' : String(count);
		badge.classList.add('active');
		if (activityTab) activityTab.classList.add('has-notification');
	} else {
		badge.textContent = '';
		badge.classList.remove('active');
		if (activityTab) activityTab.classList.remove('has-notification');
	}
}

function goToActivityFromNotification(event) {
	if (event) {
		event.preventDefault();
		event.stopPropagation();
	}
	const activityTab = document.querySelector('.nav-tab[data-tab="activity"]');
	if (activityTab) {
		openTab({ currentTarget: activityTab }, 'activity');
	} else {
		openTab(null, 'activity');
	}
	if (typeof window.markAdminNotificationsSeen === 'function') {
		window.markAdminNotificationsSeen();
	}
	updateAdminNotifications();
}

function syncProfileRequestNotifications() {
	const profileRequests = (function () {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		return r
			? r.getValue_sync('profile_requests', [])
			: JSON.parse(localStorage.getItem('quizProfileRequests') || '[]');
	})();
	const accountRequests = Array.isArray(window.Auth?.getAccountRequests?.())
		? window.Auth.getAccountRequests()
		: (function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				return r
					? r.getValue_sync('account_requests', [])
					: JSON.parse(localStorage.getItem('quizAccountRequests') || '[]');
			})();
	if (!profileRequests.length && !accountRequests.length) return;

	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const classMap = new Map(classes.map((c) => [c.id, c.name]));

	const activity = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
	const notificationList = (function () {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		return r
			? r.getValue_sync('notifications', [])
			: JSON.parse(localStorage.getItem('adminNotifications') || '[]');
	})();

	const hasActivityForRequest = (requestType, requestId) =>
		activity.some((a) => {
			const metaId = a.meta?.requestId || a.metadata?.requestId || a.requestId;
			return a.type === requestType && metaId === requestId;
		});

	const hasNotificationForRequest = (requestType, requestId) =>
		notificationList.some(
			(n) =>
				n.type === requestType &&
				(n.data?.requestId === requestId || n.data?.id === requestId),
		);

	profileRequests
		.filter((req) => req.status === 'pending')
		.forEach((req) => {
			if (
				hasActivityForRequest('profile_request', req.id) &&
				hasNotificationForRequest('profile_request', req.id)
			) {
				return;
			}

			const user = users.find((u) => u.id === req.userId);
			const studentName =
				req.currentSnapshot?.name || user?.name || user?.username || 'Student';
			const studentNumber =
				req.currentSnapshot?.studentNumber || user?.studentNumber || '';
			const className =
				(req.currentSnapshot?.classId &&
					classMap.get(req.currentSnapshot.classId)) ||
				(user?.classId && classMap.get(user.classId)) ||
				'';

			if (
				!hasActivityForRequest('profile_request', req.id) &&
				typeof logActivity === 'function'
			) {
				logActivity(
					'profile_request',
					`${studentName} profile update request`,
					'requested',
					{
						requestId: req.id,
						userId: req.userId,
						studentName,
						studentNumber,
						className,
					},
				);
			}

			if (
				!hasNotificationForRequest('profile_request', req.id) &&
				typeof window.addAdminNotification === 'function'
			) {
				window.addAdminNotification({
					type: 'profile_request',
					message: `${studentName} sent a profile update request`,
					data: { requestId: req.id, userId: req.userId },
				});
			}
		});

	accountRequests
		.filter((req) => req.status === 'pending')
		.forEach((req) => {
			const requestId = req.id;
			if (
				hasActivityForRequest('account_request', requestId) &&
				hasNotificationForRequest('account_request', requestId)
			) {
				return;
			}
			const className = classMap.get(req.classId) || req.className || '';
			const fullName = req.fullName || req.username || 'Student';

			if (
				!hasActivityForRequest('account_request', requestId) &&
				typeof logActivity === 'function'
			) {
				logActivity(
					'account_request',
					`${fullName} account request`,
					'requested',
					{
						requestId,
						username: req.username || '',
						studentNumber: req.studentNumber || '',
						classId: req.classId || '',
						className,
					},
				);
			}

			if (
				!hasNotificationForRequest('account_request', requestId) &&
				typeof window.addAdminNotification === 'function'
			) {
				window.addAdminNotification({
					type: 'account_request',
					message: `${fullName} requested a new student account`,
					data: {
						requestId,
						username: req.username || '',
						classId: req.classId || '',
					},
				});
			}
		});
}

document.addEventListener('DOMContentLoaded', () => {
	syncProfileRequestNotifications();
	updateAdminNotifications();
	const badge = document.getElementById('adminNotificationBadge');
	if (badge) {
		badge.addEventListener('click', goToActivityFromNotification);
	}
});

window.addEventListener('admin:notifications-updated', () => {
	updateAdminNotifications();
});

window.addEventListener('storage', (event) => {
	if (
		event.key === 'adminNotifications' ||
		event.key === 'adminNotificationsSeenAt' ||
		event.key === 'quizActivity' ||
		event.key === 'quizProfileRequests' ||
		event.key === 'quizAccountRequests'
	) {
		if (
			event.key === 'quizProfileRequests' ||
			event.key === 'quizAccountRequests'
		) {
			syncProfileRequestNotifications();
			renderProfileRequests();
		}
		updateAdminNotifications();
	}
});

window.updateAdminNotifications = updateAdminNotifications;
window.goToActivityFromNotification = goToActivityFromNotification;
window.syncProfileRequestNotifications = syncProfileRequestNotifications;

// Mobile Navigation Toggle
function toggleMobileNav() {
	const navContainer = document.getElementById('headerNav');
	navContainer.classList.toggle('active');
}

// Mobile Action Sheet Utility
const MobileActionSheet = {
	overlay: null,
	sheet: null,
	title: null,
	content: null,

	init() {
		this.overlay = document.getElementById('mobileActionSheetOverlay');
		this.sheet = document.getElementById('mobileActionSheet');
		this.title = document.getElementById('actionSheetTitle');
		this.content = document.getElementById('actionSheetContent');
	},

	open(titleText, actions) {
		if (!this.sheet) this.init();
		this.promote();

		this.title.textContent = titleText;
		this.content.innerHTML = '';

		actions.forEach((action) => {
			const btn = document.createElement('button');
			btn.className = `action-sheet-btn ${action.variant || 'default'}`;

			// Add icon if provided
			if (action.icon) {
				window.safeSetHTML
					? window.safeSetHTML(btn, action.icon, true)
					: (btn.innerHTML = action.icon);
			}

			const label = document.createElement('span');
			label.textContent = action.label;
			btn.appendChild(label);

			btn.onclick = () => {
				this.close();
				// Short timeout to allow ripple effect/sheet closing before action
				setTimeout(() => action.onClick(), 200);
			};

			this.content.appendChild(btn);
		});

		// Show
		this.overlay.classList.remove('hidden');
		this.sheet.classList.remove('hidden');
		document.documentElement.classList.add('mobile-action-sheet-open');
		document.body.classList.add('mobile-action-sheet-open');
		document.body.style.overflow = 'hidden'; // Prevent background scrolling
	},

	close() {
		if (!this.sheet) this.init();

		this.overlay.classList.add('hidden');
		this.sheet.classList.add('hidden');
		this.overlay?.style.removeProperty('pointer-events');
		this.sheet?.style.removeProperty('pointer-events');
		this.sheet?.style.removeProperty('visibility');
		document.documentElement.classList.remove('mobile-action-sheet-open');
		document.body.classList.remove('mobile-action-sheet-open');
		document.body.style.overflow = '';
	},

	promote() {
		if (this.overlay && this.overlay.parentElement !== document.body) {
			document.body.appendChild(this.overlay);
		}
		if (this.sheet && this.sheet.parentElement !== document.body) {
			document.body.appendChild(this.sheet);
		}

		this.overlay?.style.setProperty('position', 'fixed', 'important');
		this.overlay?.style.setProperty('inset', '0', 'important');
		this.overlay?.style.setProperty('z-index', '2147483600', 'important');
		this.overlay?.style.setProperty('pointer-events', 'auto', 'important');

		this.sheet?.style.setProperty('position', 'fixed', 'important');
		this.sheet?.style.setProperty('z-index', '2147483601', 'important');
		this.sheet?.style.setProperty('visibility', 'visible', 'important');
		this.sheet?.style.setProperty('pointer-events', 'auto', 'important');
	},
};

// Expose to window
window.MobileActionSheet = MobileActionSheet;

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
	if (!text) return text;
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Profile Request Management
function normalizeLegacyProfileRequest(request) {
	if (!request || !request.userId) return null;
	const changes = { ...(request.changes || {}) };
	if (request.fullName && !changes.name) changes.name = request.fullName;
	if (request.username && !changes.username)
		changes.username = request.username;
	if (request.studentNumber && !changes.studentNumber)
		changes.studentNumber = request.studentNumber;
	if (request.classId && !changes.classId) changes.classId = request.classId;
	if (
		Object.prototype.hasOwnProperty.call(request, 'email') &&
		!Object.prototype.hasOwnProperty.call(changes, 'email')
	) {
		changes.email = request.email || '';
	}
	const createdAt =
		request.createdAt ||
		request.requestedAt ||
		request.receivedAt ||
		new Date().toISOString();
	return {
		id: request.id || `${request.userId}-${createdAt}`,
		userId: request.userId,
		createdAt,
		status: request.status || 'pending',
		changes,
		avatar: request.avatar || '',
		note: request.note || '',
		currentSnapshot: request.currentSnapshot || {},
		reviewerId: request.reviewerId || '',
		reviewedAt: request.reviewedAt || '',
		reviewNote: request.reviewNote || '',
	};
}

function getUnifiedProfileRequests() {
	const authRequests = Array.isArray(window.Auth?.getProfileRequests?.())
		? window.Auth.getProfileRequests()
		: (function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				return r
					? r.getValue_sync('profile_requests', [])
					: JSON.parse(localStorage.getItem('quizProfileRequests') || '[]');
			})();

	const legacyMap = (function () {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		return r
			? r.getValue_sync('profile_requests_legacy', {})
			: JSON.parse(localStorage.getItem('adminProfileRequests') || '{}');
	})();
	const legacyRequests = Object.values(legacyMap)
		.map(normalizeLegacyProfileRequest)
		.filter(Boolean);

	if (!legacyRequests.length) {
		return authRequests;
	}

	const merged = [...authRequests];
	const existingIds = new Set(authRequests.map((req) => req.id));
	legacyRequests.forEach((legacy) => {
		if (!existingIds.has(legacy.id)) {
			merged.push(legacy);
		}
	});

	(function () {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		if (r) {
			r.setAll_sync('profile_requests', merged);
			r.remove_sync('profile_requests_legacy');
		} else {
			localStorage.setItem('quizProfileRequests', JSON.stringify(merged));
			localStorage.removeItem('adminProfileRequests');
		}
	})();
	return merged;
}

function renderLegacyProfileRequests() {
	const listContainer = document.getElementById('profileRequestsList');
	if (!listContainer) return;

	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const classMap = new Map(classes.map((c) => [c.id, c.name]));
	let requests = getUnifiedProfileRequests();

	if (window.Auth?.isTeacher?.()) {
		const teacherClassIds = window.Auth.getTeacherClassIds
			? window.Auth.getTeacherClassIds()
			: [];
		requests = requests.filter((req) => {
			const user = users.find((u) => u.id === req.userId);
			const classId =
				user?.classId ||
				req.currentSnapshot?.classId ||
				req.changes?.classId ||
				'';
			return classId && teacherClassIds.includes(classId);
		});
	}

	if (!requests.length) {
		listContainer.innerHTML =
			'<div class="empty-state">No profile requests yet.</div>';
		return;
	}

	requests.sort((a, b) => {
		const dateA = a.createdAt || a.requestedAt || a.receivedAt || '';
		const dateB = b.createdAt || b.requestedAt || b.receivedAt || '';
		return dateB.localeCompare(dateA);
	});

	listContainer.innerHTML = requests
		.slice(0, 20)
		.map((req) => {
			const user = users.find((u) => u.id === req.userId) || {};
			const changes = req.changes || {};
			const createdAt =
				req.createdAt || req.requestedAt || req.receivedAt || '';
			const dateLabel = createdAt ? new Date(createdAt).toLocaleString() : '-';
			const studentName =
				req.currentSnapshot?.name ||
				user.name ||
				user.username ||
				changes.name ||
				'Unknown User';
			const requestedUsername =
				changes.username || req.username || user.username || '';

			const changeRows = Object.entries(changes)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => {
					const currentValue =
						key === 'classId'
							? classMap.get(user.classId) || user.classId || 'N/A'
							: user[key] || 'N/A';
					const nextValue =
						key === 'classId'
							? classMap.get(value) || value || 'N/A'
							: value || 'N/A';
					const label =
						key === 'studentNumber'
							? 'Student #'
							: key === 'classId'
								? 'Class'
								: key.charAt(0).toUpperCase() + key.slice(1);
					return `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(nextValue))} <span class="text-muted">(${escapeHtml(String(currentValue))})</span></div>`;
				})
				.join('');

			const status = String(req.status || 'pending');
			const statusBadge = `<span class="request-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
			const actions =
				status === 'pending'
					? `
                        <button class="btn btn-sm btn-success btn-icon-only" onclick="approveProfileRequest('${escapeHtml(req.id)}')" title="Approve">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                        <button class="btn btn-sm btn-danger btn-icon-only" onclick="rejectProfileRequest('${escapeHtml(req.id)}')" title="Reject">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `
					: '';

			const reviewMeta = req.reviewedAt
				? `<div class="text-muted small" style="margin-top: 6px;">Reviewed: ${new Date(req.reviewedAt).toLocaleString()}</div>`
				: '';

			return `
                <div class="card" style="margin-bottom: 12px; padding: 12px; border-left: 4px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 1rem;">${escapeHtml(studentName)}</div>
                            <div class="text-muted small">${escapeHtml(dateLabel)} • ${escapeHtml(requestedUsername)}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${statusBadge}
                            ${actions}
                        </div>
                    </div>
                    <div style="font-size: 0.9rem; background: #f8fafc; padding: 8px; border-radius: 6px;">
                        ${changeRows || '<em class="text-muted">No specific changes detected</em>'}
                        ${req.note ? `<div style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; font-style: italic;">Note: ${escapeHtml(req.note)}</div>` : ''}
                        ${req.reviewNote ? `<div style="margin-top: 6px; color: #64748b;">Review note: ${escapeHtml(req.reviewNote)}</div>` : ''}
                        ${reviewMeta}
                    </div>
                </div>
            `;
		})
		.join('');
}

function approveProfileRequest(requestId) {
	if (!requestId) return;
	if (!confirm('Approve these changes for the student profile?')) return;
	if (!window.Auth?.approveProfileRequest) {
		showToast('Profile request service unavailable', 'error');
		return;
	}

	const reviewerId = window.Auth?.getCurrentUser?.()?.id || '';
	const result = window.Auth.approveProfileRequest(requestId, reviewerId);
	if (!result) {
		showToast('Unable to approve this request', 'error');
		return;
	}

	renderProfileRequests();
	if (typeof renderUsersTable === 'function') {
		renderUsersTable();
	}
	if (typeof window.syncUsersToClients === 'function') {
		window.syncUsersToClients();
	}
	showToast('Profile request approved', 'success');
}

function rejectProfileRequest(requestId) {
	if (!requestId) return;
	if (!confirm('Reject this profile update request?')) return;
	if (!window.Auth?.rejectProfileRequest) {
		showToast('Profile request service unavailable', 'error');
		return;
	}

	const reviewerId = window.Auth?.getCurrentUser?.()?.id || '';
	const result = window.Auth.rejectProfileRequest(requestId, reviewerId);
	if (!result) {
		showToast('Unable to reject this request', 'error');
		return;
	}

	renderProfileRequests();
	showToast('Profile request rejected', 'info');
}

function approveAccountRequest(requestId) {
	if (!requestId) return;
	if (!confirm('Approve this account creation request?')) return;
	if (!window.Auth?.approveAccountRequest) {
		showToast('Account request service unavailable', 'error');
		return;
	}
	const reviewerId = window.Auth?.getCurrentUser?.()?.id || '';
	const result = window.Auth.approveAccountRequest(requestId, reviewerId);
	if (!result) {
		showToast('Unable to approve this account request', 'error');
		return;
	}
	renderProfileRequests();
	if (typeof renderUsersTable === 'function') {
		renderUsersTable();
	}
	if (typeof window.syncUsersToClients === 'function') {
		window.syncUsersToClients();
	}
	showToast('Account request approved', 'success');
}

function rejectAccountRequest(requestId) {
	if (!requestId) return;
	if (!confirm('Reject this account creation request?')) return;
	if (!window.Auth?.rejectAccountRequest) {
		showToast('Account request service unavailable', 'error');
		return;
	}
	const reviewerId = window.Auth?.getCurrentUser?.()?.id || '';
	const result = window.Auth.rejectAccountRequest(requestId, reviewerId);
	if (!result) {
		showToast('Unable to reject this account request', 'error');
		return;
	}
	renderProfileRequests();
	showToast('Account request rejected', 'info');
}

function renderProfileRequests() {
	const listContainer = document.getElementById('profileRequestsList');
	if (!listContainer) return;

	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const classMap = new Map(classes.map((c) => [c.id, c.name]));
	let profileRequests = getUnifiedProfileRequests();
	let accountRequests = Array.isArray(window.Auth?.getAccountRequests?.())
		? window.Auth.getAccountRequests()
		: (function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				return r
					? r.getValue_sync('account_requests', [])
					: JSON.parse(localStorage.getItem('quizAccountRequests') || '[]');
			})();

	if (window.Auth?.isTeacher?.()) {
		const teacherClassIds = window.Auth.getTeacherClassIds
			? window.Auth.getTeacherClassIds()
			: [];
		profileRequests = profileRequests.filter((req) => {
			const user = users.find((u) => u.id === req.userId);
			const classId =
				user?.classId ||
				req.currentSnapshot?.classId ||
				req.changes?.classId ||
				'';
			return classId && teacherClassIds.includes(classId);
		});
		accountRequests = accountRequests.filter((req) => {
			const classId = String(req.classId || '').trim();
			return classId && teacherClassIds.includes(classId);
		});
	}

	const unifiedRequests = [
		...profileRequests.map((req) => ({ kind: 'profile', ...req })),
		...accountRequests.map((req) => ({ kind: 'account', ...req })),
	];
	if (!unifiedRequests.length) {
		listContainer.innerHTML =
			'<div class="empty-state">No profile or account requests yet.</div>';
		return;
	}

	unifiedRequests.sort((a, b) => {
		const dateA = a.createdAt || a.requestedAt || a.receivedAt || '';
		const dateB = b.createdAt || b.requestedAt || b.receivedAt || '';
		return dateB.localeCompare(dateA);
	});

	listContainer.innerHTML = unifiedRequests
		.slice(0, 30)
		.map((req) => {
			const createdAt =
				req.createdAt || req.requestedAt || req.receivedAt || '';
			const dateLabel = createdAt ? new Date(createdAt).toLocaleString() : '-';
			const status = String(req.status || 'pending');
			const statusBadge = `<span class="request-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
			const typeBadge = `<span class="request-pill ${req.kind === 'account' ? 'pending' : 'approved'}">${req.kind === 'account' ? 'Account' : 'Profile'}</span>`;
			const reviewMeta = req.reviewedAt
				? `<div class="text-muted small" style="margin-top: 6px;">Reviewed: ${new Date(req.reviewedAt).toLocaleString()}</div>`
				: '';

			if (req.kind === 'account') {
				const className =
					classMap.get(req.classId) || req.className || req.classId || 'N/A';
				const requesterName = req.fullName || req.username || 'Unknown User';
				const actions =
					status === 'pending'
						? `
                            <button class="btn btn-sm btn-success btn-icon-only" onclick="approveAccountRequest('${escapeHtml(req.id)}')" title="Approve account request">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                            <button class="btn btn-sm btn-danger btn-icon-only" onclick="rejectAccountRequest('${escapeHtml(req.id)}')" title="Reject account request">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `
						: '';
				return `
                    <div class="card" style="margin-bottom: 12px; padding: 12px; border-left: 4px solid #10b981;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div>
                                <div style="font-weight: 600; font-size: 1rem;">${escapeHtml(requesterName)}</div>
                                <div class="text-muted small">${escapeHtml(dateLabel)} • ${escapeHtml(req.username || '')}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                ${typeBadge}
                                ${statusBadge}
                                ${actions}
                            </div>
                        </div>
                        <div style="font-size: 0.9rem; background: #f8fafc; padding: 8px; border-radius: 6px;">
                            <div><strong>Student #:</strong> ${escapeHtml(String(req.studentNumber || 'N/A'))}</div>
                            <div><strong>Class:</strong> ${escapeHtml(String(className || 'N/A'))}</div>
                            ${req.note ? `<div style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; font-style: italic;">Note: ${escapeHtml(req.note)}</div>` : ''}
                            ${req.reviewNote ? `<div style="margin-top: 6px; color: #64748b;">Review note: ${escapeHtml(req.reviewNote)}</div>` : ''}
                            ${reviewMeta}
                        </div>
                    </div>
                `;
			}

			const user = users.find((u) => u.id === req.userId) || {};
			const changes = req.changes || {};
			const studentName =
				req.currentSnapshot?.name ||
				user.name ||
				user.username ||
				changes.name ||
				'Unknown User';
			const requestedUsername =
				changes.username || req.username || user.username || '';
			const changeRows = Object.entries(changes)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => {
					const currentValue =
						key === 'classId'
							? classMap.get(user.classId) || user.classId || 'N/A'
							: user[key] || 'N/A';
					const nextValue =
						key === 'classId'
							? classMap.get(value) || value || 'N/A'
							: value || 'N/A';
					const label =
						key === 'studentNumber'
							? 'Student #'
							: key === 'classId'
								? 'Class'
								: key.charAt(0).toUpperCase() + key.slice(1);
					return `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(nextValue))} <span class="text-muted">(${escapeHtml(String(currentValue))})</span></div>`;
				})
				.join('');
			const actions =
				status === 'pending'
					? `
                        <button class="btn btn-sm btn-success btn-icon-only" onclick="approveProfileRequest('${escapeHtml(req.id)}')" title="Approve">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                        <button class="btn btn-sm btn-danger btn-icon-only" onclick="rejectProfileRequest('${escapeHtml(req.id)}')" title="Reject">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `
					: '';
			return `
                <div class="card" style="margin-bottom: 12px; padding: 12px; border-left: 4px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 1rem;">${escapeHtml(studentName)}</div>
                            <div class="text-muted small">${escapeHtml(dateLabel)} • ${escapeHtml(requestedUsername)}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${typeBadge}
                            ${statusBadge}
                            ${actions}
                        </div>
                    </div>
                    <div style="font-size: 0.9rem; background: #f8fafc; padding: 8px; border-radius: 6px;">
                        ${changeRows || '<em class="text-muted">No specific changes detected</em>'}
                        ${req.note ? `<div style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; font-style: italic;">Note: ${escapeHtml(req.note)}</div>` : ''}
                        ${req.reviewNote ? `<div style="margin-top: 6px; color: #64748b;">Review note: ${escapeHtml(req.reviewNote)}</div>` : ''}
                        ${reviewMeta}
                    </div>
                </div>
            `;
		})
		.join('');
}

// Initial render call
document.addEventListener('DOMContentLoaded', () => {
	setTimeout(renderProfileRequests, 1000);
});

// Results Management
//
// The Results tab is the app's student-performance module. It has two views:
//   • Students — one row per student, with exam average, pass rate, trend,
//     activity and an actionable status. Opening a row shows the student's
//     full profile/history.
//   • All attempts — the original flat result log, kept for auditing, bulk
//     deletion and per-attempt details.
//
// Both views share one filter bar. Formal exams (mode = exam) drive academic
// metrics; training and games are shown separately and never merged into the
// exam average or pass rate. This mirrors the Teacher Overview definitions.

// Last rendered (filtered) result rows, used by export/import helpers.
let lastVisibleResults = [];

const resultsViewState = {
	view: 'students',
	sort: 'priority',
	allScoped: [],
	filtered: [],
	profiles: [],
	visibleProfiles: [],
	selectedProfileKey: '',
};

const RESULTS_STATUS_META = {
	attention: { label: 'Needs attention', cls: 'status-error', rank: 0, filter: 'attention' },
	declining: { label: 'Declining', cls: 'status-warning', rank: 1, filter: 'attention' },
	watch: { label: 'Below pass mark', cls: 'status-warning', rank: 2, filter: 'attention' },
	inactive: { label: 'Inactive', cls: 'status-warning', rank: 3, filter: 'inactive' },
	'no-results': { label: 'No results yet', cls: 'status-info', rank: 4, filter: 'inactive' },
	'no-exam': { label: 'No exam data', cls: 'status-info', rank: 5, filter: 'no-exam' },
	'on-track': { label: 'On track', cls: 'status-success', rank: 6, filter: 'on-track' },
};

// Initialize results on page load
document.addEventListener('DOMContentLoaded', function () {
	initResultsViewControls();
	loadResultsFilters();
	loadResults();
	// The SaaS bridge downloads the tenant's full history asynchronously
	// (`/api/v1/bootstrap`) and dispatches this event when it lands. The
	// initial load above may have only seen the local cache, so re-render the
	// student roster + attempts with the authoritative server data once it
	// arrives.
	window.addEventListener('quiz:bootstrap-ready', refreshResultsView);
});

function initResultsViewControls() {
	document.querySelectorAll('[data-results-view]').forEach((button) => {
		button.addEventListener('click', () => {
			setResultsView(button.getAttribute('data-results-view'));
		});
	});

	const filterChips = document.getElementById('resultsFilterChips');
	if (filterChips) {
		filterChips.addEventListener('click', (event) => {
			const chip = event.target.closest('[data-clear-filter]');
			if (!chip) return;
			const id = chip.getAttribute('data-clear-filter');
			const el = document.getElementById(id);
			if (!el) return;
			el.value = '';
			filterResults();
		});
	}

	const roster = document.getElementById('results-students-list');
	if (roster) {
		roster.addEventListener('click', (event) => {
			const button = event.target.closest('[data-profile-key]');
			const row = event.target.closest('tr[data-student-key]');
			const key = button
				? button.getAttribute('data-profile-key')
				: row
					? row.getAttribute('data-student-key')
					: '';
			if (!key) return;
			openStudentProfileByKey(key);
		});
	}

	const attempts = document.getElementById('results-list');
	if (attempts) {
		attempts.addEventListener('click', (event) => {
			const button = event.target.closest('[data-profile-key]');
			if (!button) return;
			event.stopPropagation();
			openStudentProfileByKey(button.getAttribute('data-profile-key'));
		});
	}

	const modal = document.getElementById('resultsStudentProfileModal');
	if (modal) {
		modal.addEventListener('click', (event) => {
			if (event.target === modal) closeStudentProfile();
		});
		modal.querySelectorAll('[data-profile-close]').forEach((button) => {
			button.addEventListener('click', closeStudentProfile);
		});
		const body = document.getElementById('studentProfileBody');
		if (body) {
			body.addEventListener('click', (event) => {
				const opener = event.target.closest('[data-open-exam]');
				if (!opener) return;
				openExamFromProfile(opener.getAttribute('data-open-exam'));
			});
		}
	}
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeStudentProfile();
	});
}

// Re-load results and KPIs after data arrives (or any external refresh),
// preserving whatever filters the user currently has active.
function refreshResultsView() {
	loadResultsFilters();
	loadResults();
}

function loadResultsFilters() {
	// Rebuilding the selects must not wipe an active filter when the user
	// returns to the tab or when the bootstrap lands.
	const previous = {};
	const trackedIds = [
		'resultFilterExam',
		'resultFilterClass',
		'resultFilterMode',
		'resultFilterDate',
		'resultFilterScore',
		'resultFilterStatus',
		'resultTeacherFilter',
	];
	trackedIds.forEach((id) => {
		const el = document.getElementById(id);
		if (el) previous[id] = el.value;
	});

	// Populate exam filter
	const examFilter = document.getElementById('resultFilterExam');
	const classFilter = document.getElementById('resultFilterClass');

	if (examFilter) {
		const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
		const visibleExams = exams.filter((exam) =>
			window.Auth?.canAccessItem ? window.Auth.canAccessItem('exam', exam) : true,
		);
		examFilter.innerHTML =
			'<option value="">All Exams</option>' +
			visibleExams
				.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
				.join('');
	}

	if (classFilter) {
		// Collect all unique classes from results (both saved and virtual classes used in quizzes)
		let results = window.__DI_CONTAINER__.repo.getAll_sync('results');
		if (window.Auth?.filterItemsByRole) {
			results = window.Auth.filterItemsByRole('result', results);
		}
		let savedClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
		if (window.Auth?.filterItemsByRole) {
			savedClasses = window.Auth.filterItemsByRole('class', savedClasses);
		}

		// Map of class name/id to class object
		const classMap = new Map();

		// Add saved classes first (with their IDs)
		savedClasses.forEach((c) => {
			classMap.set(c.name, { id: c.id, name: c.name });
		});

		// Add classes from quiz results (virtual classes)
		results.forEach((r) => {
			if (r.class && !classMap.has(r.class)) {
				// Virtual class - use class name as both key and ID for filtering
				classMap.set(r.class, { id: r.class, name: r.class });
			}
		});

		// Sort classes by name
		const sortedClasses = Array.from(classMap.values()).sort((a, b) =>
			a.name.localeCompare(b.name)
		);

		classFilter.innerHTML =
			'<option value="">All Classes</option>' +
			sortedClasses
				.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
				.join('');
	}

	if (window.TeacherFilter) {
		window.TeacherFilter.populate(
			'resultTeacherFilter',
			'resultTeacherFilterWrap',
			() => filterResults(),
		);
	}

	// Restore the previous selection only when its option still exists.
	const restore = (id) => {
		const value = previous[id];
		if (!value) return;
		const el = document.getElementById(id);
		if (!el) return;
		if (Array.from(el.options).some((option) => option.value === value)) {
			el.value = value;
		}
	};
	trackedIds.forEach(restore);
}

function getResultDate(result) {
	if (!result) return '';
	return (
		result.date ||
		result.dateTaken ||
		result.date_taken ||
		result.completedAt ||
		result.timestamp ||
		''
	);
}

function normalizeResultEntry(result) {
	if (!result || typeof result !== 'object') return result;
	const normalizedDate = getResultDate(result);
	return {
		...result,
		date: normalizedDate || result.date,
		dateTaken: result.dateTaken || result.date_taken || normalizedDate,
		name: result.name || result.studentName || '',
		studentName: result.studentName || result.name || '',
		numero: result.numero || result.studentNumber || '',
		studentNumber: result.studentNumber || result.numero || '',
		class: result.class || result.className || result.class_name || '',
		className: result.className || result.class || result.class_name || '',
		examId: result.examId || result.exam_id || '',
		examTitle: result.examTitle || result.examName || result.exam || '',
		examName: result.examName || result.examTitle || result.exam || '',
		userId: result.userId || result.user_id || '',
		user_id: result.user_id || result.userId || '',
		classId: result.classId || result.class_id || '',
		totalPoints: result.totalPoints ?? result.total_points,
		earnedPoints: result.earnedPoints ?? result.earned_points,
		grade20: result.grade20 ?? result.grade_20,
		timeSpent: result.timeSpent ?? result.time_spent,
		totalQuestions: result.totalQuestions ?? result.total_questions,
	};
}

/**
 * Resolve a coherent /20 grade + percentage from a result row regardless of
 * which schema produced it:
 *  - DB rows (bootstrap) store `score` as a percentage (0-100) plus
 *    `earned_points` / `total_points`;
 *  - the student workspace stores a /20 grade on `grade20` (and `score`);
 *  - legacy script.js training/exam rows store `score` = raw earned points
 *    over `totalPoints` (sum of per-question points).
 */
function resolveResultScore(result) {
	const num = (v) => (v == null ? NaN : Number(v));
	const rawScore = num(result.score);
	const earned = num(result.earnedPoints);
	const totalPts = num(result.totalPoints);
	const totalQ = num(result.totalQuestions);
	const grade20 = num(result.grade20);
	const isFiniteNum = Number.isFinite;

	let percent = 0;
	let grade = 0;

	if (isFiniteNum(grade20) && grade20 >= 0 && grade20 <= 20) {
		grade = grade20;
		percent = (grade20 / 20) * 100;
	} else if (isFiniteNum(earned) && isFiniteNum(totalPts) && totalPts > 0) {
		percent = Math.max(0, Math.min(100, (earned / totalPts) * 100));
		grade = (percent / 100) * 20;
	} else if (
		isFiniteNum(rawScore) &&
		((isFiniteNum(totalPts) && totalPts > 0) ||
			(isFiniteNum(totalQ) && totalQ > 0))
	) {
		const total = totalPts > 0 ? totalPts : totalQ;
		if (rawScore >= 0 && rawScore <= total && rawScore <= 100) {
			// Legacy count-based score (earned points over total points).
			percent = Math.max(0, Math.min(100, (rawScore / total) * 100));
			grade = (percent / 100) * 20;
		} else if (rawScore >= 0 && rawScore <= 20) {
			// Bare /20 grade.
			grade = rawScore;
			percent = (rawScore / 20) * 100;
		} else {
			percent = Math.max(0, Math.min(100, rawScore));
			grade = (percent / 100) * 20;
		}
	} else if (isFiniteNum(rawScore) && rawScore >= 0 && rawScore <= 20) {
		grade = rawScore;
		percent = (rawScore / 20) * 100;
	} else if (isFiniteNum(rawScore)) {
		percent = Math.max(0, Math.min(100, rawScore));
		grade = (percent / 100) * 20;
	}

	return { percent, grade };
}

/**
 * Resolve the student name / numero / class for a result row. DB rows only
 * carry `user_id`, so fall back to the users store when the row has no name.
 */
function resolveStudentDisplay(result, users) {
	if (!result || typeof result !== 'object') {
		return { name: 'Unknown', numero: '', class: '', user: null };
	}
	const userId = result.userId || result.user_id || '';
	const user = userId
		? (users || []).find((u) => String(u.id) === String(userId))
		: null;
	const name =
		result.name ||
		result.studentName ||
		(user && (user.name || user.username)) ||
		'Unknown';
	const numero =
		result.numero ||
		result.studentNumber ||
		(user && (user.numero || user.studentNumber || user.number)) ||
		'';
	const klass =
		result.class ||
		result.className ||
		(user && (user.className || user.class_name || user.class)) ||
		'';
	return { name, numero, class: klass, user };
}

/**
 * Resolve the class (row or { className } face) behind a result row. The
 * shared TeacherFilter resolver is authoritative — it applies the exact same
 * precedence (classId → class name → the student's registered class) to the
 * By badge and the teacher filter, so all three agree by construction. The
 * local logic only runs when teacher-filter.js has not loaded.
 */
function resolveResultClass(result, classes, student) {
	if (window.TeacherFilter?.resolveResultClassRef) {
		const ref = window.TeacherFilter.resolveResultClassRef(result);
		if (ref && (ref.id || ref.name)) {
			return {
				id: ref.id || '',
				className: ref.name || '',
				name: ref.name || '',
			};
		}
		return null;
	}
	let classData = null;
	if (result.classId) {
		classData = classes.find((c) => String(c.id) === String(result.classId));
	}
	if (!classData && result.class) {
		classData = classes.find(
			(c) => c.className === result.class || c.name === result.class,
		);
	}
	// Fall back to the student's registered class from the users store.
	if (!classData && student && student.user) {
		const userClassId = student.user.classId || student.user.class_id;
		if (userClassId) {
			classData = classes.find(
				(c) => String(c.id) === String(userClassId),
			);
		}
		if (!classData && (student.user.className || student.user.class_name)) {
			classData = { className: student.user.className || student.user.class_name };
		}
	}
	return classData;
}

/**
 * Canonical pass rule: 10/20 or more — the French convention, and the same
 * rule every surface uses (student workspace `isPassingGrade20`, the
 * server's GradingService, exam analysis). 10,00/20 grades render green.
 */
function isResultPassed(grade) {
	return Number(grade) >= 10;
}

function isGameResult(result) {
	if (!result) return false;
	if (result.gameId || result.gameName || result.gameType || result.gameMode) {
		return true;
	}
	const type = String(result.type || '').toLowerCase();
	return type.includes('race') || type.includes('card') || type.includes('game');
}

function resolveGameDisplayName(result) {
	const gameName = result.gameName || result.gameTitle || '';
	if (gameName) return `Game: ${gameName}`;
	const gameType = String(result.gameType || result.type || '').toLowerCase();
	if (gameType.includes('card')) return 'Game: Card Battle';
	if (gameType.includes('race')) return 'Game: Lightning Race';
	if (gameType.includes('hot')) return 'Game: Hot Potato';
	if (gameType.includes('survivor')) return 'Game: Last Survivor';
	return 'Game';
}

function resolveExamDisplayName(result, exams) {
	if (isGameResult(result)) return resolveGameDisplayName(result);

	let examDisplayName = null;

	if (result.examId) {
		const exam = exams.find((e) => String(e.id) === String(result.examId));
		if (exam) examDisplayName = exam.title || exam.name;
	}

	if (!examDisplayName && result.examTitle) {
		if (result.examTitle === 'Training Quiz') {
			examDisplayName = 'Training Quiz';
		} else {
			const exam = exams.find(
				(e) => e.title === result.examTitle || e.name === result.examTitle,
			);
			examDisplayName = exam ? exam.title || exam.name : result.examTitle;
		}
	}

	if (!examDisplayName) {
		examDisplayName =
			result.mode === 'training' ? 'Training Quiz' : 'Unknown Exam';
	}

	return examDisplayName;
}

function formatResultTime(result) {
	const timeValue = result.timeTaken || result.timeSpent || result.time || 0;
	const minutes = Math.floor(timeValue / 60);
	const seconds = timeValue % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function csvCell(value) {
	return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function resolveParticipantNames(result) {
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
			if (normalized) names.push(normalized);
		});
	});
	return [...new Set(names)];
}

function resolveParticipantCount(result, participantNames = []) {
	const explicitCount = Number(
		result.participantCount || result.meta?.participantCount || 0,
	);
	if (Number.isFinite(explicitCount) && explicitCount > 0) {
		return explicitCount;
	}
	const arrayCounts = [
		result.participants,
		result.participantNames,
		result.participantDetails,
		result.playerNames,
		result.meta?.participants,
		result.meta?.participantDetails,
	]
		.filter((value) => Array.isArray(value))
		.map((value) => value.length);
	const maxArrayCount = arrayCounts.length ? Math.max(...arrayCounts) : 0;
	return Math.max(participantNames.length, maxArrayCount, 0);
}

function buildGameParticipantIndex(results) {
	const index = new Map();
	(results || []).forEach((entry) => {
		if (!entry || typeof entry !== 'object') return;
		const gameId = String(entry.gameId || '').trim();
		if (!gameId) return;
		const names = resolveParticipantNames(entry);
		if (!names.length) return;
		if (!index.has(gameId)) index.set(gameId, new Set());
		const bucket = index.get(gameId);
		names.forEach((name) => bucket.add(name));
	});
	return index;
}

function resolveParticipantNamesForDisplay(result, participantIndex) {
	const direct = resolveParticipantNames(result);
	const gameId = String(result?.gameId || result?.meta?.gameId || '').trim();
	if (!gameId || !participantIndex || !participantIndex.has(gameId)) {
		return direct;
	}
	const merged = new Set(direct);
	participantIndex.get(gameId).forEach((name) => merged.add(name));
	return [...merged];
}

function resolveWinnerName(result) {
	const winnerName = result.winnerName || result.winner || '';
	if (winnerName) return winnerName;
	if (Array.isArray(result.participantDetails) && result.winnerId) {
		const match = result.participantDetails.find(
			(p) => p.id && p.id === result.winnerId,
		);
		if (match?.name) return match.name;
	}
	return result.winnerId || '';
}

function loadResults() {
	loadResultsFilters();
	filterResults();
}

/**
 * All results available to the current session, already normalized and
 * teacher-scoped. Used as the all-time baseline for student profiles.
 */
function getScopedResults() {
	let results = window.__DI_CONTAINER__.repo.getAll_sync('results') || [];

	// Legacy exam results are still mirrored in localStorage by older flows.
	try {
		const examResults = JSON.parse(localStorage.getItem('examResults') || '{}');
		for (const examId in examResults) {
			const examData = examResults[examId];
			if (examData.students && Array.isArray(examData.students)) {
				examData.students.forEach((student) => {
					results.push({
						id: `${student.studentInfo.numero}-${student.date}`,
						examId: examId,
						examTitle: examData.examName,
						numero: student.studentInfo.numero,
						name: student.studentInfo.name,
						studentName: student.studentInfo.name,
						class: student.studentInfo.class,
						classId: student.studentInfo.classId,
						score: student.score,
						totalPoints: student.totalPoints,
						totalQuestions: student.totalQuestions,
						timeSpent: student.timeSpent,
						date: student.date,
						mode: 'exam',
					});
				});
			}
		}
	} catch (e) {
		console.warn('Error loading exam results:', e);
	}

	// Server rows carry only user_id; auth.js resolves the student's class
	// from the cached roster before deciding whether a teacher may see it.
	if (window.Auth?.filterItemsByRole) {
		results = window.Auth.filterItemsByRole('result', results);
	}

	results = results.map(normalizeResultEntry);

	// The repo and the legacy localStorage mirror can overlap; keep one row
	// per attempt so totals, averages and profiles never double-count.
	const seen = new Set();
	results = results.filter((row) => {
		const key = String(
			row.id ||
				`${row.userId || row.user_id || row.numero || 'x'}::${getResultDate(row)}`,
		);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	if (window.TeacherFilter) {
		const teacherScope = window.TeacherFilter.getSelectedTeacher(
			'resultTeacherFilter',
		);
		if (teacherScope) {
			const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
			results = results.filter((r) =>
				window.TeacherFilter.matchesResult(
					r,
					teacherScope,
					resolveResultClass(r, classes, resolveStudentDisplay(r, users)),
				),
			);
		}
	}

	results.sort(
		(a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)),
	);
	return results;
}

/** Student accounts visible in the current scope (class/teacher filter). */
function getScopedStudents() {
	const repo = window.__DI_CONTAINER__?.repo;
	const users = (repo && repo.getAll_sync('users')) || [];
	let students = users.filter(
		(u) =>
			String(u.role || '').toLowerCase() === 'student' &&
			String(u.status || 'active').toLowerCase() !== 'disabled',
	);

	if (window.TeacherFilter) {
		const teacherScope = window.TeacherFilter.getSelectedTeacher(
			'resultTeacherFilter',
		);
		if (teacherScope) {
			const classIds = new Set(
				window.TeacherFilter.getTeacherClassIds(teacherScope).map(String),
			);
			students = students.filter((u) =>
				classIds.has(String(u.class_id || u.classId || '')),
			);
		}
	}
	return students;
}

function filterResults() {
	const all = getScopedResults();
	resultsViewState.allScoped = all;
	const filtered = applyResultFilters(all);
	resultsViewState.filtered = filtered;
	renderResultsViews();
}

function dateFilterStart(value) {
	if (!value) return null;
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (value === 'today') return today;
	if (value === 'week') return new Date(today.getTime() - 7 * 86400000);
	if (value === 'month') return new Date(today.getTime() - 30 * 86400000);
	return null;
}

function isExamResult(result) {
	if (!result || isGameResult(result)) return false;
	return String(result.mode || 'exam').toLowerCase() === 'exam';
}

function isTrainingResult(result) {
	if (!result || isGameResult(result)) return false;
	const mode = String(result.mode || '').toLowerCase();
	return mode === 'training' || mode === 'solo';
}

function applyResultFilters(results) {
	const read = (id) => {
		const el = document.getElementById(id);
		return el ? String(el.value || '') : '';
	};
	const examFilter = read('resultFilterExam');
	const classFilter = read('resultFilterClass');
	const modeFilter =
		resultsViewState.view === 'attempts' ? read('resultFilterMode') : '';
	const dateFilter = read('resultFilterDate');
	const scoreFilter =
		resultsViewState.view === 'attempts' ? read('resultFilterScore') : '';
	const searchTerm = read('resultSearch').trim().toLowerCase();

	const repo = window.__DI_CONTAINER__.repo;
	const exams = repo.getAll_sync('exams') || [];
	const classes = repo.getAll_sync('classes') || [];
	const users = repo.getAll_sync('users') || [];
	const selectedClass = classes.find((c) => String(c.id) === classFilter);
	const selectedClassName = selectedClass ? selectedClass.name : classFilter;

	let scoped = results;

	if (examFilter) {
		scoped = scoped.filter(
			(r) => String(r.examId || '') === examFilter || r.examTitle === examFilter,
		);
	}

	if (classFilter) {
		scoped = scoped.filter((r) => {
			const student = resolveStudentDisplay(r, users);
			const classRef = resolveResultClass(r, classes, student);
			if (classRef && String(classRef.id || '') === classFilter) return true;
			if (classRef) {
				const name = classRef.className || classRef.name || '';
				if (name && (name === selectedClassName || name === classFilter)) return true;
			}
			if (student.class && student.class === selectedClassName) return true;
			return false;
		});
	}

	if (modeFilter) {
		if (modeFilter === 'game') {
			scoped = scoped.filter((r) => isGameResult(r));
		} else {
			scoped = scoped.filter(
				(r) => String(r.mode || 'exam').toLowerCase() === modeFilter,
			);
		}
	}

	const periodStart = dateFilterStart(dateFilter);
	if (periodStart) {
		scoped = scoped.filter((r) => {
			const d = new Date(getResultDate(r));
			return Number.isFinite(d.getTime()) && d >= periodStart;
		});
	}

	if (scoreFilter) {
		scoped = scoped.filter((r) => {
			const grade = resolveResultScore(r).grade;
			if (scoreFilter === 'lt10') return grade < 10;
			if (scoreFilter === 'gte10') return grade >= 10;
			return true;
		});
	}

	if (searchTerm) {
		scoped = scoped.filter((r) => {
			const student = resolveStudentDisplay(r, users);
			const haystack = [
				student.name,
				student.numero,
				student.class,
				resolveExamDisplayName(r, exams),
				r.mode,
				r.deviceName,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return haystack.includes(searchTerm);
		});
	}

	scoped.sort(
		(a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)),
	);
	return scoped;
}

function studentKeyForUserId(userId) {
	return `u:${String(userId || '')}`;
}

function studentKeyForResult(result, users) {
	const userId = result?.userId || result?.user_id;
	const explicitName = String(
		result?.name || result?.studentName || result?.student_name || '',
	)
		.trim()
		.toLowerCase();
	const byId = userId
		? (users || []).find((u) => String(u.id) === String(userId))
		: null;

	// Multiplayer game rows can carry the host/creator user_id while the
	// student's name is the participant. When the explicit name disagrees with
	// the id's user, trust the name and resolve that student instead.
	if (byId) {
		const idName = String(byId.name || byId.username || '')
			.trim()
			.toLowerCase();
		if (!explicitName || !idName || explicitName === idName) {
			return studentKeyForUserId(byId.id);
		}
		const byName = (users || []).find(
			(u) =>
				String(u.role || '').toLowerCase() === 'student' &&
				String(u.name || u.username || '')
					.trim()
					.toLowerCase() === explicitName,
		);
		if (byName) return studentKeyForUserId(byName.id);
		if (explicitName) return `x:${explicitName}|`;
	}

	if (!byId && explicitName) {
		const byName = (users || []).find(
			(u) =>
				String(u.role || '').toLowerCase() === 'student' &&
				String(u.name || u.username || '')
					.trim()
					.toLowerCase() === explicitName,
		);
		if (byName) return studentKeyForUserId(byName.id);
	}

	const student = resolveStudentDisplay(result, users);
	if (student.numero) return `n:${student.numero}`;
	return `x:${String(student.name || 'unknown').toLowerCase()}|${student.class || ''}`;
}

function resolveStudentClassInfo(user, sampleResult, classes, users) {
	let classId = String(user?.class_id || user?.classId || '');
	let className = '';
	const row = classId
		? classes.find((c) => String(c.id) === classId)
		: null;
	if (row) className = row.name || '';
	if (!className) {
		className = user?.className || user?.class_name || '';
	}
	if ((!classId || !className) && sampleResult) {
		const display = resolveStudentDisplay(sampleResult, users);
		const ref = resolveResultClass(sampleResult, classes, display);
		if (ref) {
			classId = classId || String(ref.id || '');
			className = className || ref.className || ref.name || '';
		}
		if (!className) className = display.class || '';
	}
	return { classId, className: className || 'Unassigned' };
}

function computeStudentTrend(examResults) {
	const sorted = (examResults || [])
		.slice()
		.sort((a, b) => new Date(getResultDate(a)) - new Date(getResultDate(b)));
	if (sorted.length < 4) return { delta: null, trend: null };
	const lastTwo = sorted.slice(-2);
	const priorTwo = sorted.slice(-4, -2);
	const avg = (rows) =>
		rows.reduce((sum, r) => sum + resolveResultScore(r).grade, 0) / rows.length;
	const delta = avg(lastTwo) - avg(priorTwo);
	return {
		delta,
		trend: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
	};
}

function resolveStudentStatus(profile, periodActive) {
	const examAttempts = profile.scopeExamCount;
	const avg = profile.avg20;
	const delta = profile.trendDelta;
	const hasAcademic =
		examAttempts >= 2 && avg != null && avg < 10;
	const hasDecline =
		examAttempts >= 2 &&
		delta != null &&
		delta <= -1.5 &&
		avg != null &&
		avg < 12;
	if (hasAcademic) return 'attention';
	if (hasDecline) return 'declining';
	if (examAttempts === 1 && avg != null && avg < 10) return 'watch';
	if (!profile.allResults.length) return 'no-results';
	const inactive = periodActive
		? profile.scopeTotal === 0
		: profile.daysInactive == null || profile.daysInactive >= 14;
	if (inactive) return 'inactive';
	if (examAttempts === 0) return 'no-exam';
	return 'on-track';
}

function buildStudentProfiles(allResults, filteredResults) {
	const repo = window.__DI_CONTAINER__.repo;
	const users = repo.getAll_sync('users') || [];
	const classes = repo.getAll_sync('classes') || [];
	const studentUsers = getScopedStudents();
	const usersById = new Map(users.map((u) => [String(u.id), u]));
	const periodActive = !!(
		document.getElementById('resultFilterDate') || {}
	).value;

	const group = (rows) => {
		const map = new Map();
		rows.forEach((row) => {
			const key = studentKeyForResult(row, users);
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(row);
		});
		return map;
	};
	const allByKey = group(allResults);
	const filteredByKey = group(filteredResults);
	const readFilter = (id) => {
		const el = document.getElementById(id);
		return el ? String(el.value || '') : '';
	};
	const classFilter = readFilter('resultFilterClass');
	const classFilterName = classFilter
		? (classes.find((c) => String(c.id) === classFilter) || {}).name || classFilter
		: '';
	const searchTerm = readFilter('resultSearch').trim().toLowerCase();

	const keys = new Set();
	studentUsers.forEach((u) => keys.add(studentKeyForUserId(u.id)));
	allByKey.forEach((_, key) => keys.add(key));
	filteredByKey.forEach((_, key) => keys.add(key));

	const profiles = [];
	keys.forEach((key) => {
		const user = key.startsWith('u:') ? usersById.get(key.slice(2)) : null;
		// A result row may carry a teacher/admin user_id from an old import or
		// a game host. Only student accounts belong in the student roster.
		if (user && String(user.role || '').toLowerCase() !== 'student') {
			return;
		}
		const all = allByKey.get(key) || [];
		const scope = filteredByKey.get(key) || [];
		const sample = all[0] || scope[0] || null;
		const display = user
			? {
					name: user.name || user.username || 'Student',
					numero: user.numero || '',
					user,
				}
			: resolveStudentDisplay(sample, users);
		const classInfo = resolveStudentClassInfo(user, sample, classes, users);

		const allExam = all.filter(isExamResult);
		const scopeExam = scope.filter(isExamResult);
		const scopeTraining = scope.filter(isTrainingResult);
		const scopeGames = scope.filter((r) => isGameResult(r));

		// Anonymous game-only rows are not student accounts. Keep the
		// attempt in "All attempts", but do not invent a roster student for
		// a guest/participant name that has no academic record.
		if (!user && allExam.length === 0 && all.filter(isTrainingResult).length === 0) {
			return;
		}
		const grades = scopeExam.map((r) => resolveResultScore(r).grade);
		const avg20 = grades.length
			? grades.reduce((sum, grade) => sum + grade, 0) / grades.length
			: null;
		const passed = grades.filter((grade) => isResultPassed(grade)).length;
		const lastActivity = all.reduce((latest, row) => {
			const time = new Date(getResultDate(row)).getTime();
			return Number.isFinite(time) && time > latest ? time : latest;
		}, 0);
		const daysInactive = lastActivity
			? Math.max(0, Math.floor((Date.now() - lastActivity) / 86400000))
			: null;
		const trend = computeStudentTrend(allExam);

		const profile = {
			key,
			studentId: user ? String(user.id) : String(sample?.userId || sample?.user_id || ''),
			name: display.name || 'Student',
			numero: display.numero || '',
			classId: classInfo.classId,
			className: classInfo.className,
			allResults: all,
			scopeResults: scope,
			scopeExam,
			scopeTraining,
			scopeGames,
			scopeExamCount: scopeExam.length,
			scopeTrainingCount: scopeTraining.length,
			scopeGameCount: scopeGames.length,
			scopeTotal: scope.length,
			allExamCount: allExam.length,
			avg20,
			passRate: grades.length ? (passed / grades.length) * 100 : null,
			passed,
			best20: grades.length ? Math.max(...grades) : null,
			worst20: grades.length ? Math.min(...grades) : null,
			lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
			daysInactive,
			trendDelta: trend.delta,
			trend: trend.trend,
			active: scope.length > 0,
		};
		profile.statusKey = resolveStudentStatus(profile, periodActive);
		profile.status = RESULTS_STATUS_META[profile.statusKey];

		// The roster is a student list, not just a result list. Respect the
		// class filter and search here so students with no matching attempt do
		// not stay visible when the user narrowed the scope.
		const matchesClass =
			!classFilter ||
			String(profile.classId || '') === classFilter ||
			profile.className === classFilterName ||
			profile.className === classFilter;
		if (!matchesClass) return;
		if (searchTerm) {
			const haystack = `${profile.name} ${profile.numero} ${profile.className}`.toLowerCase();
			const matchesSearch =
				haystack.includes(searchTerm) || profile.scopeResults.length > 0;
			if (!matchesSearch) return;
		}

		profiles.push(profile);
	});
	return profiles;
}

function filterProfilesByStatus(profiles) {
	const el = document.getElementById('resultFilterStatus');
	const status = el ? String(el.value || '') : '';
	if (!status) return profiles;
	const buckets = {
		attention: ['attention', 'declining', 'watch', 'inactive', 'no-results'],
		inactive: ['inactive', 'no-results'],
		'no-exam': ['no-exam'],
		'on-track': ['on-track'],
	};
	const allowed = buckets[status];
	if (!allowed) return profiles;
	return profiles.filter(
		(profile) => profile.statusKey && allowed.includes(profile.statusKey),
	);
}

function sortStudentProfiles(profiles) {
	const list = profiles.slice();
	const byName = (a, b) => a.name.localeCompare(b.name);
	const avgValue = (p) => (p.avg20 == null ? Number.POSITIVE_INFINITY : p.avg20);
	switch (resultsViewState.sort) {
		case 'name':
			list.sort(byName);
			break;
		case 'lowest':
			list.sort((a, b) => avgValue(a) - avgValue(b) || byName(a, b));
			break;
		case 'highest':
			list.sort(
				(a, b) =>
					(b.avg20 == null ? Number.NEGATIVE_INFINITY : b.avg20) -
						(a.avg20 == null ? Number.NEGATIVE_INFINITY : a.avg20) ||
					byName(a, b),
			);
			break;
		case 'attempts':
			list.sort((a, b) => b.scopeTotal - a.scopeTotal || byName(a, b));
			break;
		case 'recent':
			list.sort(
				(a, b) =>
					new Date(b.lastActivity || 0).getTime() -
						new Date(a.lastActivity || 0).getTime() || byName(a, b),
			);
			break;
		default:
			list.sort((a, b) => {
				const rank =
					(a.status?.rank ?? 99) - (b.status?.rank ?? 99);
				if (rank) return rank;
				const avg = avgValue(a) - avgValue(b);
				return avg || byName(a, b);
			});
	}
	return list;
}

function renderResultsViews() {
	const filtered = resultsViewState.filtered;
	lastVisibleResults = filtered;
	const profiles = buildStudentProfiles(
		resultsViewState.allScoped,
		filtered,
	);
	resultsViewState.profiles = profiles;
	const visibleProfiles = filterProfilesByStatus(profiles);
	resultsViewState.visibleProfiles = visibleProfiles;

	renderResultsKpis(profiles, filtered);
	renderResultsChrome(profiles, visibleProfiles, filtered);
	renderStudentsTable(visibleProfiles);
	renderAttemptsTable(filtered);
}

function renderResultsKpis(profiles, filtered) {
	const setText = (id, text) => {
		const el = document.getElementById(id);
		if (el) el.textContent = text;
	};
	const examResults = filtered.filter(isExamResult);
	const grades = examResults.map((r) => resolveResultScore(r).grade);
	const avg = grades.length
		? grades.reduce((sum, grade) => sum + grade, 0) / grades.length
		: null;
	const passed = grades.filter((grade) => isResultPassed(grade)).length;
	const attention = profiles.filter((profile) =>
		['attention', 'declining', 'watch', 'inactive', 'no-results'].includes(
			profile.statusKey,
		),
	).length;

	setText('kpi-results-students', String(profiles.length));
	setText(
		'kpi-results-active',
		String(profiles.filter((profile) => profile.active).length),
	);
	setText('kpi-results-avg', avg == null ? '—' : `${avg.toFixed(1)} / 20`);
	setText(
		'kpi-results-pass-rate',
		grades.length ? `${((passed / grades.length) * 100).toFixed(1)}%` : '—',
	);
	setText('kpi-results-attention', String(attention));
}

function renderResultsChrome(profiles, visibleProfiles, filtered) {
	const studentsView = document.getElementById('resultsStudentsView');
	const attemptsView = document.getElementById('resultsAttemptsView');
	const statusWrap = document.getElementById('resultStatusFilterWrap');
	const modeWrap = document.getElementById('resultModeFilterWrap');
	const scoreWrap = document.getElementById('resultScoreFilterWrap');
	const isStudents = resultsViewState.view === 'students';

	document.querySelectorAll('[data-results-view]').forEach((button) => {
		const active = button.getAttribute('data-results-view') === resultsViewState.view;
		button.classList.toggle('is-active', active);
		button.setAttribute('aria-selected', active ? 'true' : 'false');
	});
	if (studentsView) studentsView.classList.toggle('hidden', !isStudents);
	if (attemptsView) attemptsView.classList.toggle('hidden', isStudents);
	// Each view owns the filters that make sense for it. Status only describes
	// students; mode/score only describe individual attempts.
	if (statusWrap) statusWrap.classList.toggle('hidden', !isStudents);
	if (modeWrap) modeWrap.classList.toggle('hidden', isStudents);
	if (scoreWrap) scoreWrap.classList.toggle('hidden', isStudents);

	const searchInput = document.getElementById('resultSearch');
	if (searchInput) {
		searchInput.placeholder = isStudents
			? 'Student, number or class…'
			: 'Student, exam or class…';
	}
	const hint = document.getElementById('resultsViewHint');
	if (hint) {
		hint.textContent = isStudents
			? 'One row per student, with their latest performance.'
			: 'Every attempt, newest first. Open a student profile from the student cell.';
	}
	const studentCount = document.getElementById('resultsStudentCount');
	if (studentCount) studentCount.textContent = String(profiles.length);
	const studentLabel = document.getElementById('resultsStudentLabel');
	if (studentLabel) studentLabel.textContent = profiles.length === 1 ? 'student' : 'students';
	const attemptCount = document.getElementById('resultsCountBadge');
	if (attemptCount) attemptCount.textContent = String(filtered.length);
	const attemptLabel = document.getElementById('resultsAttemptLabel');
	if (attemptLabel) attemptLabel.textContent = filtered.length === 1 ? 'attempt' : 'attempts';
	const tableHint = document.getElementById('resultsTableHint');
	if (tableHint) {
		tableHint.textContent = `${filtered.length} attempt${
			filtered.length === 1 ? '' : 's'
		} · newest first`;
	}
	const studentsHint = document.getElementById('resultsStudentsHint');
	if (studentsHint) {
		studentsHint.textContent = `${visibleProfiles.length} of ${profiles.length} student${
			profiles.length === 1 ? '' : 's'
		} shown. Open a profile for the full history.`;
	}
	renderResultsScopeBar();
}

function renderResultsScopeBar() {
	const bar = document.getElementById('resultsScopeBar');
	const chipsHost = document.getElementById('resultsFilterChips');
	if (!bar || !chipsHost) return;
	const readValue = (id) => {
		const el = document.getElementById(id);
		return el ? String(el.value || '') : '';
	};
	const optionLabel = (id) => {
		const el = document.getElementById(id);
		if (!el || !el.value) return '';
		const option = el.options[el.selectedIndex];
		return option ? option.textContent.trim() : el.value;
	};
	const chips = [];
	const addSelect = (id, label) => {
		if (!readValue(id)) return;
		chips.push({ id, label, value: optionLabel(id) });
	};

	addSelect('resultFilterClass', 'Class');
	addSelect('resultFilterExam', 'Exam');
	addSelect('resultFilterDate', 'Period');
	if (resultsViewState.view === 'students') {
		addSelect('resultFilterStatus', 'Status');
	} else {
		addSelect('resultFilterMode', 'Mode');
		addSelect('resultFilterScore', 'Score');
	}
	if (window.TeacherFilter?.isAdminSession?.()) {
		addSelect('resultFilterTeacher', 'Teacher');
	}
	const search = readValue('resultSearch').trim();
	if (search) chips.push({ id: 'resultSearch', label: 'Search', value: search });

	if (!chips.length) {
		bar.classList.add('hidden');
		chipsHost.innerHTML = '';
		return;
	}
	bar.classList.remove('hidden');
	chipsHost.innerHTML = chips
		.map(
			(chip) =>
				`<button type="button" class="results-filter-chip" data-clear-filter="${chip.id}" title="Remove this filter">${escapeHtml(
					chip.label,
				)}: ${escapeHtml(chip.value)} <span aria-hidden="true">×</span></button>`,
		)
		.join('');
}

function setResultsView(view) {
	const next = view === 'attempts' ? 'attempts' : 'students';
	if (resultsViewState.view === next) return;
	const reset = (id) => {
		const el = document.getElementById(id);
		if (el) el.value = '';
	};
	// Do not carry a hidden filter across views: attempt-only controls do not
	// belong to the student roster, and status does not describe an attempt.
	if (next === 'students') {
		reset('resultFilterMode');
		reset('resultFilterScore');
	} else {
		reset('resultFilterStatus');
	}
	resultsViewState.view = next;
	filterResults();
}

function setResultsSort(value) {
	resultsViewState.sort = String(value || 'priority');
	renderStudentsTable(resultsViewState.visibleProfiles);
}

// "By" cell for the results table: initials avatar + wrapped name chips, max
// 2 then a +N overflow pill. The full comma-separated list stays in title.
const RESULT_OWNER_CHIPS_MAX = 2;

function renderResultOwnerChips(result, resultTeacherMap, classData) {
	const raw = window.TeacherFilter
		? window.TeacherFilter.resolveResultTeacherNames(
				result,
				resultTeacherMap,
				classData,
			)
		: '';
	if (!raw || raw === '—') {
		return '<span class="q-owner-badge is-empty" title="Teacher">—</span>';
	}
	const names = raw
		.split(', ')
		.map((name) => name.trim())
		.filter(Boolean);
	if (!names.length) {
		return '<span class="q-owner-badge is-empty" title="Teacher">—</span>';
	}
	const chips = names.map((name) => {
		const initials = name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('');
		return (
			`<span class="by-teacher" title="${escapeHtml(name)}">` +
			`<span class="by-avatar" aria-hidden="true">${escapeHtml(initials || '?')}</span>` +
			`<span class="by-name">${escapeHtml(name)}</span>` +
			`</span>`
		);
	});
	const omitted = names.slice(RESULT_OWNER_CHIPS_MAX);
	const overflowChip =
		omitted.length > 0
			? `<span class="by-more" title="${escapeHtml(omitted.join(', '))}">+${omitted.length}</span>`
			: '';
	return (
		`<span class="by-teachers" title="${escapeHtml(raw)}">` +
		chips.slice(0, RESULT_OWNER_CHIPS_MAX).join('') +
		overflowChip +
		`</span>`
	);
}

function studentInitials(name) {
	return (
		String(name || '?')
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('') || '?'
	);
}

function formatRelativeDate(iso) {
	if (!iso) return '—';
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return '—';
	const now = new Date();
	const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const days = Math.floor((startToday - startDate) / 86400000);
	if (days <= 0) return 'Today';
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days} days ago`;
	if (days < 30) return `${Math.floor(days / 7)} week(s) ago`;
	return date.toLocaleDateString();
}

function formatShortDate(iso) {
	if (!iso) return '—';
	const date = new Date(iso);
	return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '—';
}

function studentStatusReason(profile, periodActive) {
	switch (profile.statusKey) {
		case 'attention':
			return `Average ${profile.avg20?.toFixed(1)}/20 over ${profile.scopeExamCount} exam attempts`;
		case 'declining':
			return `Down ${Math.abs(profile.trendDelta || 0).toFixed(1)} points recently`;
		case 'watch':
			return `Below 10/20 on the only exam attempt in this scope`;
		case 'inactive':
			return periodActive
				? 'No activity in the selected period'
				: profile.daysInactive == null
					? 'No activity recorded'
					: `Last activity ${profile.daysInactive} day(s) ago`;
		case 'no-results':
			return 'No attempt recorded yet';
		case 'no-exam':
			return 'Training practice only — no formal exam';
		default:
			return profile.avg20 == null
				? 'No exam attempt in the selected scope'
				: `Exam average ${profile.avg20.toFixed(1)}/20`;
	}
}

function renderTrendBadge(profile) {
	if (profile.trendDelta == null) {
		return '<span class="results-trend is-muted" title="At least four exam attempts are needed for a trend">—</span>';
	}
	const delta = profile.trendDelta;
	const tone = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
	const glyph = tone === 'up' ? '▲' : tone === 'down' ? '▼' : '•';
	const sign = delta > 0 ? '+' : '';
	return `<span class="results-trend is-${tone}" title="Last two exam attempts vs the two before">${glyph} ${sign}${delta.toFixed(
		1,
	)} pts</span>`;
}

function renderStatusBadge(profile) {
	const meta = profile.status || RESULTS_STATUS_META['no-results'];
	return `<span class="status-badge ${meta.cls}" title="${escapeHtml(
		studentStatusReason(profile, !!document.getElementById('resultFilterDate')?.value),
	)}">${escapeHtml(meta.label)}</span>`;
}

function renderStudentsTable(profiles) {
	const tbody = document.getElementById('results-students-list');
	if (!tbody) return;
	const sorted = sortStudentProfiles(profiles || []);
	const periodActive = !!document.getElementById('resultFilterDate')?.value;

	if (!sorted.length) {
		tbody.innerHTML = `<tr class="results-empty-row"><td colspan="9"><div class="results-empty">
			<div class="results-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg></div>
			<h4>No students match these filters</h4>
			<p>Try another class, period or status, or clear the filters.</p>
			<button type="button" class="btn btn-secondary" onclick="clearAllResultFilters()">Clear filters</button>
		</div></td></tr>`;
		return;
	}

	tbody.innerHTML = sorted
		.map((profile) => {
			const key = encodeURIComponent(profile.key);
			const avg = profile.avg20;
			const avgWidth = avg == null ? 0 : Math.max(0, Math.min(100, (avg / 20) * 100));
			const passWidth = profile.passRate == null ? 0 : Math.max(0, Math.min(100, profile.passRate));
			const lastActivity = formatRelativeDate(profile.lastActivity);
			return `<tr class="results-student-row" data-student-key="${escapeHtml(key)}">
				<td data-label="Student">
					<div class="results-student-cell">
						<span class="results-student-avatar">${escapeHtml(studentInitials(profile.name))}</span>
						<span class="results-student-meta">
							<span class="results-student-name" title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</span>
							<span class="results-student-number">${
								profile.numero ? `N° ${escapeHtml(profile.numero)}` : 'No student number'
							}</span>
						</span>
					</div>
				</td>
				<td data-label="Class"><span class="results-class-pill">${escapeHtml(
					profile.className || 'Unassigned',
				)}</span></td>
				<td data-label="Activity">
					<span class="results-activity-main">${profile.scopeExamCount} exam${
						profile.scopeExamCount === 1 ? '' : 's'
					} · ${profile.scopeTrainingCount} training</span>
					<span class="results-cell-sub">${profile.scopeTotal} attempt${
						profile.scopeTotal === 1 ? '' : 's'
					}${profile.scopeGameCount ? ` · ${profile.scopeGameCount} game(s)` : ''}</span>
				</td>
				<td data-label="Average /20">
					<div class="results-avg-cell">
						<span class="results-avg-value ${avg != null && avg < 10 ? 'is-low' : ''}">${
							avg == null ? '—' : avg.toFixed(1)
						}</span>
						<span class="results-avg-suffix">/20</span>
					</div>
					<span class="results-meter"><span style="width:${avgWidth.toFixed(1)}%"></span></span>
				</td>
				<td data-label="Pass rate">
					<span class="results-pass-value">${
						profile.passRate == null ? '—' : `${profile.passRate.toFixed(0)}%`
					}</span>
					<span class="results-meter results-meter--pass"><span style="width:${passWidth.toFixed(
						1,
					)}%"></span></span>
					<span class="results-cell-sub">${
						profile.scopeExamCount ? `${profile.passed}/${profile.scopeExamCount} passed` : 'No exam attempt'
					}</span>
				</td>
				<td data-label="Recent trend">${renderTrendBadge(profile)}</td>
				<td data-label="Last activity">
					<span class="results-last-activity">${escapeHtml(lastActivity)}</span>
					<span class="results-cell-sub">${escapeHtml(formatShortDate(profile.lastActivity))}</span>
				</td>
				<td data-label="Status">${renderStatusBadge(profile)}</td>
				<td class="actions-cell">
					<button type="button" class="btn btn-secondary btn-sm" data-profile-key="${escapeHtml(key)}">Profile</button>
				</td>
			</tr>`;
		})
		.join('');
}

function renderAttemptsTable(results) {
	const tbody = document.getElementById('results-list');
	if (!tbody) return;

	const resultsTable = document.getElementById('results-table');
	if (resultsTable) {
		const admin = window.TeacherFilter
			? window.TeacherFilter.isAdminSession()
			: !!(window.Auth?.isAdmin && window.Auth.isAdmin());
		resultsTable.classList.toggle('hide-owner-col', !admin);
	}

	if (!results.length) {
		tbody.innerHTML =
			'<tr class="results-empty-row"><td colspan="10"><div class="results-empty">' +
			'<div class="results-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>' +
			'<h4>No attempts found</h4><p>Try adjusting the filters or search to see student attempts here.</p>' +
			'<button type="button" class="btn btn-secondary" onclick="clearAllResultFilters()">Clear filters</button>' +
			'</div></td></tr>';
		if (window.BulkSelect) window.BulkSelect.updateBar('results');
		return;
	}

	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const participantIndex = buildGameParticipantIndex(results);
	const resultTeacherMap = window.TeacherFilter
		? window.TeacherFilter.buildClassTeacherMap()
		: new Map();

	tbody.innerHTML = results
		.map((result) => {
			const gameResult = isGameResult(result);
			const student = resolveStudentDisplay(result, users);
			const studentKey = encodeURIComponent(studentKeyForResult(result, users));
			const participantNames = gameResult
				? resolveParticipantNamesForDisplay(result, participantIndex)
				: [];
			const participantCount = gameResult
				? resolveParticipantCount(result, participantNames)
				: 0;
			const winnerName = gameResult ? resolveWinnerName(result) : '';
			const examDisplayName = resolveExamDisplayName(result, exams);
			const classData = resolveResultClass(result, classes, student);
			const { percent, grade } = resolveResultScore(result);
			const percentage = percent.toFixed(1);
			const scoreOn20 = grade.toFixed(1);
			const timeFormatted = formatResultTime(result);
			const resultDate = getResultDate(result);
			const resultId = result.id || `${result.numero}-${resultDate}`;
			const examMetaLines = [];
			if (gameResult) {
				if (result.lobbyLabel) examMetaLines.push(`Lobby: ${result.lobbyLabel}`);
				if (participantNames.length) {
					examMetaLines.push(`Participants: ${participantNames.join(', ')}`);
				} else if (participantCount > 0) {
					examMetaLines.push(`Participants: ${participantCount} player(s)`);
				}
				if (winnerName) examMetaLines.push(`Winner: ${winnerName}`);
			}
			const modeKey = gameResult
				? 'game'
				: String(result.mode || 'exam').toLowerCase();
			const modeClass =
				modeKey === 'training' || modeKey === 'solo'
					? 'is-training'
					: modeKey === 'game'
						? 'is-game'
						: 'is-exam';
			const initials = studentInitials(student.name);
			const classLabel = classData
				? classData.className || classData.name
				: student.class || '';
			const passed = isResultPassed(grade);
			const dateTitle = resultDate ? new Date(resultDate).toLocaleString() : '';
			const dateShort = resultDate ? new Date(resultDate).toLocaleDateString() : '-';
			const examCell = `<div class="result-main"><span class="mode-dot ${modeClass}"></span><span>${escapeHtml(
				examDisplayName,
			)}</span></div>${examMetaLines
				.map((line) => `<div class="result-subtext">${escapeHtml(line)}</div>`)
				.join('')}`;
			const sourceCell = result.deviceName
				? `<span class="device-source-badge" title="${escapeHtml(result.deviceName)}${
						result.deviceIp ? ` (@${result.deviceIp})` : ''
					}">${escapeHtml(result.deviceName)}</span>`
				: '<span class="device-source-badge is-local">Local</span>';

			return `<tr data-result-id="${escapeHtml(resultId)}" data-student-key="${escapeHtml(
				studentKey,
			)}">
				<td class="checkbox-cell" data-label="Select">
					<input type="checkbox" class="result-checkbox" data-id="${escapeHtml(
						resultId,
					)}" onchange="toggleBulkRowSelection(this,'results')">
				</td>
				<td class="result-date" title="${escapeHtml(dateTitle)}">${escapeHtml(dateShort)}</td>
				<td class="student-cell results-attempt-student" data-label="Student" title="Open student profile">
					<div class="student-cell-inner">
						<span class="student-avatar${gameResult ? ' is-game' : ''}">${escapeHtml(initials)}</span>
						<span class="student-meta">
							<span class="student-name">${escapeHtml(student.name)}</span>
							${student.numero ? `<span class="student-numero">N° ${escapeHtml(student.numero)}</span>` : ''}
						</span>
					</div>
				</td>
				<td data-label="Class">${
					classLabel
						? `<span class="class-pill">${escapeHtml(classLabel)}</span>`
						: '<span class="class-pill is-empty">—</span>'
				}</td>
				<td class="exam-cell" data-label="Exam">${examCell}</td>
				<td data-label="Score">
					<span class="score-pill ${passed ? 'passed' : 'failed'}">
						<span class="score-pill-top"><span class="score-pill-dot"></span>${scoreOn20}/20<span class="score-pill-pct">${percentage}%</span></span>
						<span class="score-pill-bar"><span style="width: ${Math.max(0, Math.min(100, percent)).toFixed(1)}%"></span></span>
					</span>
				</td>
				<td data-label="Time"><span class="time-pill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${escapeHtml(
					timeFormatted,
				)}</span></td>
				<td data-label="Source">${sourceCell}</td>
				<td class="owner-col" data-label="By">${renderResultOwnerChips(result, resultTeacherMap, classData)}</td>
				<td class="actions-cell">
					<div class="exam-actions">
						<button class="exam-action-btn exam-view-btn" data-profile-key="${escapeHtml(
							studentKey,
						)}" title="Open student profile">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
						</button>
						<button class="exam-action-btn exam-view-btn" onclick="viewResultDetails('${escapeHtml(
							resultId,
						)}')" title="View attempt details">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
						</button>
						<button class="exam-action-btn exam-delete-btn" onclick="deleteResult('${escapeHtml(
							resultId,
						)}')" title="Delete">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
						</button>
					</div>
				</td>
			</tr>`;
		})
		.join('');

	results.forEach((result) => {
		const resultDate = getResultDate(result);
		const resultId = result.id || `${result.numero}-${resultDate}`;
		const safeResultId = escapeHtml(resultId);
		const studentKey = encodeURIComponent(studentKeyForResult(result, users));
		const row = tbody.querySelector(`tr[data-result-id="${safeResultId}"]`);
		if (!row) return;
		const studentCell = row.querySelector('.student-cell');
		if (studentCell) {
			studentCell.addEventListener('click', (event) => {
				if (window.innerWidth <= 768) return;
				if (event.target.closest('button')) return;
				openStudentProfileByKey(studentKey);
			});
		}
		row.addEventListener('click', (event) => {
			if (window.innerWidth > 768) return;
			if (event.target.closest('button')) return;
			if (event.target.closest('.checkbox-cell') || event.target.type === 'checkbox') return;
			event.stopPropagation();
			const studentShort = resolveStudentDisplay(result, users);
			const displayName = escapeHtml(
				studentShort.numero
					? `${studentShort.numero} - ${studentShort.name}`
					: studentShort.name,
			);
			MobileActionSheet.open(`Result: ${displayName}`, [
				{
					label: 'Open student profile',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>',
					onClick: () => openStudentProfileByKey(studentKey),
				},
				{
					label: 'View details',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
					onClick: () => viewResultDetails(resultId),
				},
				{
					label: 'Delete result',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
					variant: 'danger',
					onClick: () => deleteResult(resultId),
				},
			]);
		});
	});

	if (window.BulkSelect) window.BulkSelect.restore('results');
}

// ── Student profile ─────────────────────────────────────────────────────────

function profileExamResults(profile) {
	return (profile.allResults || [])
		.filter(isExamResult)
		.slice()
		.sort((a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)));
}

function profileTrainingResults(profile) {
	return (profile.allResults || [])
		.filter(isTrainingResult)
		.slice()
		.sort((a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)));
}

function resultsProfileChart(examResultsAsc) {
	const points = examResultsAsc
		.slice(-12)
		.map((r) => ({
			label: formatShortDate(getResultDate(r)),
			grade: resolveResultScore(r).grade,
		}));
	if (points.length < 2) {
		return '<p class="empty-state-small">At least two formal exam attempts are needed to chart a trend.</p>';
	}
	const width = 640;
	const height = 210;
	const padL = 34;
	const padR = 14;
	const padT = 14;
	const padB = 28;
	const x = (i) => padL + (i / (points.length - 1)) * (width - padL - padR);
	const y = (v) => padT + (1 - Math.max(0, Math.min(20, v)) / 20) * (height - padT - padB);
	const grid = [0, 5, 10, 15, 20]
		.map(
			(v) =>
				`<line x1="${padL}" y1="${y(v)}" x2="${width - padR}" y2="${y(v)}" class="results-profile-chart-grid"/>` +
				`<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="results-profile-chart-axis">${v}</text>`,
		)
		.join('');
	const line = points
		.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.grade).toFixed(1)}`)
		.join(' ');
	return `<svg viewBox="0 0 ${width} ${height}" class="results-profile-chart" role="img" aria-label="Exam scores over time">
		${grid}
		<line x1="${padL}" y1="${y(10)}" x2="${width - padR}" y2="${y(10)}" class="results-profile-chart-pass"/>
		<text x="${width - padR}" y="${y(10) - 5}" text-anchor="end" class="results-profile-chart-pass-label">Pass 10/20</text>
		<path d="${line}" class="results-profile-chart-line"/>
		${points
			.map(
				(point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(
					point.grade,
				).toFixed(1)}" r="3.5" class="results-profile-chart-dot"><title>${escapeHtml(
					point.label,
				)}: ${point.grade.toFixed(1)}/20</title></circle>`,
			)
			.join('')}
		${points
			.map((point, index) =>
				index % Math.max(1, Math.ceil(points.length / 6)) === 0
					? `<text x="${x(index).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="results-profile-chart-axis">${escapeHtml(
							point.label,
						)}</text>`
					: '',
			)
			.join('')}
	</svg>`;
}

function resultsProfileFocusHtml(examResults) {
	const byExam = new Map();
	examResults.forEach((result) => {
		const name = resolveExamDisplayName(
			result,
			window.__DI_CONTAINER__.repo.getAll_sync('exams') || [],
		);
		const key = String(result.examId || result.exam_id || name);
		if (!byExam.has(key)) {
			byExam.set(key, {
				name,
				examId: result.examId || result.exam_id || '',
				grades: [],
			});
		}
		byExam.get(key).grades.push(resolveResultScore(result).grade);
	});
	const groups = [...byExam.values()].map((group) => {
		const avg = group.grades.reduce((sum, grade) => sum + grade, 0) / group.grades.length;
		const passed = group.grades.filter((grade) => isResultPassed(grade)).length;
		return { ...group, avg, passRate: (passed / group.grades.length) * 100 };
	});
	const weak = groups
		.filter((group) => group.avg < 10 || group.passRate < 50)
		.sort((a, b) => a.avg - b.avg)
		.slice(0, 3);
	if (!weak.length) {
		return '<p class="empty-state-small">No exam below the pass mark. Keep the current practice rhythm.</p>';
	}
	return `<ul class="results-profile-focus-list">${weak
		.map(
			(group) => `<li>
				<div class="results-profile-focus-main">
					<span class="results-profile-focus-name">${escapeHtml(group.name)}</span>
					<span class="results-cell-sub">${group.avg.toFixed(1)}/20 · ${group.grades.length} attempt${
						group.grades.length === 1 ? '' : 's'
					} · ${group.passRate.toFixed(0)}% pass</span>
				</div>
				${
					group.examId
						? `<button type="button" class="btn btn-secondary btn-sm" data-open-exam="${escapeHtml(
								group.examId,
							)}">Open exam</button>`
						: '<span class="text-muted text-xs">No exam link</span>'
				}
			</li>`,
		)
		.join('')}</ul>`;
}

function resultsProfileExamHistoryHtml(examResults) {
	const rows = examResults.slice(0, 12);
	if (!rows.length) {
		return '<p class="empty-state-small">No formal exam attempt yet. Training practice is listed below.</p>';
	}
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams') || [];
	return `<div class="table-container results-profile-table-wrap">
		<table class="data-table results-profile-table">
			<thead><tr><th>Date</th><th>Exam</th><th>Score</th><th>Result</th><th>Time</th><th></th></tr></thead>
			<tbody>${rows
				.map((result) => {
					const grade = resolveResultScore(result).grade;
					const passed = isResultPassed(grade);
					const examId = result.examId || result.exam_id || '';
					return `<tr>
						<td>${escapeHtml(formatShortDate(getResultDate(result)))}</td>
						<td>${escapeHtml(resolveExamDisplayName(result, exams))}</td>
						<td><span class="results-profile-score ${passed ? 'is-pass' : 'is-fail'}">${grade.toFixed(
							1,
						)}/20</span></td>
						<td><span class="status-badge ${passed ? 'status-success' : 'status-error'}">${
							passed ? 'Passed' : 'Failed'
						}</span></td>
						<td>${escapeHtml(formatResultTime(result))}</td>
						<td>${
							examId
								? `<button type="button" class="btn-text-only" data-open-exam="${escapeHtml(
										examId,
									)}">Open exam</button>`
								: '<span class="text-muted text-xs">—</span>'
						}</td>
					</tr>`;
				})
				.join('')}</tbody>
		</table>
	</div>
	${
		examResults.length > rows.length
			? `<p class="results-cell-sub">Showing the ${rows.length} most recent of ${examResults.length} exam attempts.</p>`
			: ''
	}`;
}

function resultsProfileTrainingHtml(training) {
	const rows = training.slice(0, 6);
	if (!rows.length) {
		return '<p class="empty-state-small">No training practice recorded yet.</p>';
	}
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams') || [];
	return `<ul class="results-profile-list">${rows
		.map(
			(result) => `<li>
				<span class="results-profile-list-main">
					<span>${escapeHtml(resolveExamDisplayName(result, exams))}</span>
					<span class="results-cell-sub">${escapeHtml(formatShortDate(getResultDate(result)))} · ${escapeHtml(
						formatResultTime(result),
					)}</span>
				</span>
				<span class="results-profile-score">${resolveResultScore(result).grade.toFixed(1)}/20</span>
			</li>`,
		)
		.join('')}</ul>
	${
		training.length > rows.length
			? `<p class="results-cell-sub">Showing the ${rows.length} most recent of ${training.length} training attempts.</p>`
			: ''
	}`;
}

function renderStudentProfile(profile) {
	const modal = document.getElementById('resultsStudentProfileModal');
	if (!modal) return;
	const avatar = document.getElementById('studentProfileAvatar');
	const title = document.getElementById('studentProfileTitle');
	const subtitle = document.getElementById('studentProfileSubtitle');
	if (avatar) avatar.textContent = studentInitials(profile.name);
	if (title) title.textContent = profile.name;
	if (subtitle) {
		subtitle.innerHTML = `${profile.numero ? `N° ${escapeHtml(profile.numero)} · ` : ''}${escapeHtml(
			profile.className || 'Unassigned',
		)} · ${renderStatusBadge(profile)}`;
	}

	const examResults = profileExamResults(profile);
	const trainingResults = profileTrainingResults(profile);
	const examGrades = examResults.map((result) => resolveResultScore(result).grade);
	const examAvg = examGrades.length
		? examGrades.reduce((sum, grade) => sum + grade, 0) / examGrades.length
		: null;
	const passed = examGrades.filter((grade) => isResultPassed(grade)).length;
	const trainingGrades = trainingResults.map((result) => resolveResultScore(result).grade);
	const trainingAvg = trainingGrades.length
		? trainingGrades.reduce((sum, grade) => sum + grade, 0) / trainingGrades.length
		: null;
	const lastActivity = formatRelativeDate(profile.lastActivity);

	const body = document.getElementById('studentProfileBody');
	if (!body) return;
	body.innerHTML = `
		<div class="results-profile-kpis">
			<div class="results-profile-kpi">
				<span>Exam average</span>
				<strong>${examAvg == null ? '—' : `${examAvg.toFixed(1)}/20`}</strong>
				<small>${examResults.length} formal attempt${examResults.length === 1 ? '' : 's'}</small>
			</div>
			<div class="results-profile-kpi">
				<span>Exam pass rate</span>
				<strong>${examGrades.length ? `${((passed / examGrades.length) * 100).toFixed(0)}%` : '—'}</strong>
				<small>${passed}/${examGrades.length} at or above 10/20</small>
			</div>
			<div class="results-profile-kpi">
				<span>Training practice</span>
				<strong>${trainingResults.length}</strong>
				<small>${trainingAvg == null ? 'no practice yet' : `${trainingAvg.toFixed(1)}/20 average`}</small>
			</div>
			<div class="results-profile-kpi">
				<span>Last activity</span>
				<strong>${escapeHtml(lastActivity)}</strong>
				<small>${escapeHtml(formatShortDate(profile.lastActivity))}</small>
			</div>
		</div>
		<div class="dashboard-charts-grid results-profile-charts">
			<div class="dashboard-panel">
				<div class="panel-header"><h3>Exam performance over time</h3><span class="text-muted text-xs">Full history</span></div>
				<div class="panel-body">${resultsProfileChart(
					examResults.slice().sort((a, b) => new Date(getResultDate(a)) - new Date(getResultDate(b))),
				)}</div>
			</div>
			<div class="dashboard-panel">
				<div class="panel-header"><h3>Exam vs training</h3><span class="text-muted text-xs">Never merged</span></div>
				<div class="panel-body">
					<div class="results-profile-compare">
						<div>
							<span>Formal exams</span>
							<strong>${examAvg == null ? '—' : `${examAvg.toFixed(1)}/20`}</strong>
							<small>${examResults.length} attempt${examResults.length === 1 ? '' : 's'} · ${
								examGrades.length ? `${((passed / examGrades.length) * 100).toFixed(0)}% pass` : 'no sample'
							}</small>
						</div>
						<div>
							<span>Training</span>
							<strong>${trainingAvg == null ? '—' : `${trainingAvg.toFixed(1)}/20`}</strong>
							<small>${trainingResults.length} attempt${trainingResults.length === 1 ? '' : 's'} · practice only</small>
						</div>
					</div>
					<p class="results-cell-sub">Training practice is not an academic certification and is never mixed into the exam average.</p>
				</div>
			</div>
		</div>
		<div class="dashboard-panel">
			<div class="panel-header"><h3>Focus areas</h3><span class="text-muted text-xs">Lowest exam averages first</span></div>
			<div class="panel-body">${resultsProfileFocusHtml(examResults)}</div>
		</div>
		<div class="dashboard-panel">
			<div class="panel-header"><h3>Exam history</h3><span class="text-muted text-xs">Open any exam in the Exams module</span></div>
			<div class="panel-body">${resultsProfileExamHistoryHtml(examResults)}</div>
		</div>
		<div class="dashboard-panel">
			<div class="panel-header"><h3>Recent training</h3><span class="text-muted text-xs">Practice only</span></div>
			<div class="panel-body">${resultsProfileTrainingHtml(trainingResults)}</div>
		</div>`;
}

function openStudentProfileByKey(encodedKey) {
	let key = '';
	try {
		key = decodeURIComponent(String(encodedKey || ''));
	} catch (_) {
		key = String(encodedKey || '');
	}
	const profile =
		resultsViewState.profiles.find((item) => item.key === key) ||
		(resultsViewState.allScoped.length
			? buildStudentProfiles(resultsViewState.allScoped, resultsViewState.filtered).find(
					(item) => item.key === key,
				)
			: null);
	if (!profile) {
		showToast('Student profile not found', 'error');
		return;
	}
	resultsViewState.selectedProfileKey = key;
	renderStudentProfile(profile);
	const modal = document.getElementById('resultsStudentProfileModal');
	if (!modal) return;
	modal.classList.add('active');
	document.body.classList.add('results-profile-open');
	const close = modal.querySelector('[data-profile-close]');
	if (close && typeof close.focus === 'function') close.focus();
}

function closeStudentProfile() {
	const modal = document.getElementById('resultsStudentProfileModal');
	if (!modal || !modal.classList.contains('active')) return;
	modal.classList.remove('active');
	document.body.classList.remove('results-profile-open');
	resultsViewState.selectedProfileKey = '';
}

function openExamFromProfile(examId) {
	if (!examId) return;
	closeStudentProfile();
	if (typeof window.openTab === 'function') window.openTab(null, 'exams');
	setTimeout(() => {
		try {
			window.openExamAnalysis?.(examId);
		} catch (_) {
			/* the Exams tab is still open */
		}
	}, 60);
}

// ── Import / Export ─────────────────────────────────────────────────────────────
function getExportRows(sourceRows) {
	const rows = sourceRows || lastVisibleResults || [];
	if (!rows.length) return [];

	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');

	return rows.map((r) => {
		const student = resolveStudentDisplay(r, users);
		const classData = resolveResultClass(r, classes, student);
		const { percent, grade } = resolveResultScore(r);
		const klass = classData
			? classData.className || classData.name
			: student.class;
		const source = r.deviceName
			? r.deviceName + (r.deviceIp ? ` (@${r.deviceIp})` : '')
			: 'Local';
		return {
			date: getResultDate(r) || '',
			numero: student.numero,
			student: student.name,
			class: klass,
			exam: resolveExamDisplayName(r, exams),
			grade: Number(grade.toFixed(2)),
			percent: Number(percent.toFixed(1)),
			time: formatResultTime(r),
			source,
			mode: r.mode || (isGameResult(r) ? 'game' : 'exam'),
		};
	});
}

function downloadResultsCsv(rows, filename) {
	const headers = [
		'Date',
		'Student Number',
		'Student Name',
		'Class',
		'Exam',
		'Grade',
		'Percentage',
		'Time',
		'Source',
		'Mode',
	];
	const csv =
		headers.join(',') +
		'\n' +
		rows
			.map((row) =>
				[
					csvCell(row.date),
					csvCell(row.numero),
					csvCell(row.student),
					csvCell(row.class),
					csvCell(row.exam),
					csvCell(row.grade),
					csvCell(row.percent),
					csvCell(row.time),
					csvCell(row.source),
					csvCell(row.mode),
				].join(','),
			)
			.join('\n');

	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	link.setAttribute(
		'download',
		filename || `quiz-results-${new Date().toISOString().slice(0, 10)}.csv`,
	);
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportResultsCSV() {
	const rows = getExportRows();
	if (!rows.length) {
		showToast('No results to export', 'warning');
		return;
	}
	downloadResultsCsv(rows);
	showToast(`Exported ${rows.length} result(s)`, 'success');
}

function exportStudentProfileCSV() {
	const profile = resultsViewState.profiles.find(
		(item) => item.key === resultsViewState.selectedProfileKey,
	);
	if (!profile) {
		showToast('Open a student profile first', 'warning');
		return;
	}
	const rows = getExportRows(profile.allResults);
	if (!rows.length) {
		showToast('This student has no results to export', 'warning');
		return;
	}
	const safeName = String(profile.name || 'student')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	downloadResultsCsv(rows, `student-${safeName || 'profile'}-results.csv`);
	showToast(`Exported ${rows.length} result(s) for ${profile.name}`, 'success');
}

function exportResultsJSON() {
	const rows = getExportRows();
	if (!rows.length) {
		showToast('No results to export', 'warning');
		return;
	}

	const dataStr = JSON.stringify(rows, null, 2);
	const dataUri =
		'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
	const link = document.createElement('a');
	link.setAttribute('href', dataUri);
	link.setAttribute(
		'download',
		`quiz-results-${new Date().toISOString().slice(0, 10)}.json`,
	);
	link.click();
	showToast(`Exported ${rows.length} result(s)`, 'success');
}

function importResultsJSON(input) {
	if (!input || !input.files || !input.files[0]) return;
	const file = input.files[0];
	const reader = new FileReader();

	reader.onload = async (event) => {
		try {
			const parsed = JSON.parse(event.target.result);
			const incoming = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed && parsed.results)
				? parsed.results
				: Array.isArray(parsed && parsed.quizResults)
				? parsed.quizResults
				: null;

			if (!incoming || !incoming.length) {
				showToast('No results found in the file', 'warning');
				return;
			}

			const existing = window.__DI_CONTAINER__.repo.getAll_sync('results');
			const seen = new Set(
				existing.map((r) => {
					const key = r.id || `${r.numero || 'x'}-${getResultDate(r)}`;
					return `${key}::${getResultDate(r)}`;
				}),
			);
			let added = 0;

			incoming.forEach((row) => {
				if (!row || typeof row !== 'object') return;
				const normalized = normalizeResultEntry(row);
				const baseKey =
					normalized.id ||
					`${normalized.numero || 'x'}-${getResultDate(normalized)}`;
				const key = `${baseKey}::${getResultDate(normalized)}`;
				if (seen.has(key)) return;
				seen.add(key);
				existing.push(normalized);
				added++;
			});

			if (added > 0 && window.API?.raw && window.__authToken) {
				const serverResult = await window.API.raw('POST', '/bulk/results', { items: existing });
				if (serverResult?.count === 0 && !serverResult?.deduped) {
					throw new Error('The server did not save the imported results');
				}
			}
			window.__DI_CONTAINER__.repo.setAll_sync('results', existing);

			if (added > 0) {
				loadResults();
				showToast(`Imported ${added} result(s)`, 'success');
			} else {
				showToast('No new results to import (duplicates skipped)', 'warning');
			}
		} catch (error) {
			console.error('Error importing results:', error);
			showToast('Error importing results: ' + error.message, 'error');
		} finally {
			if (input) input.value = '';
		}
	};

	reader.readAsText(file);
}

// Function to clear all filters in results section
function clearAllResultFilters() {
	const setValue = (id, value = '') => {
		const el = document.getElementById(id);
		if (el) el.value = value;
	};
	setValue('resultFilterExam');
	setValue('resultFilterClass');
	setValue('resultFilterMode');
	setValue('resultFilterDate');
	setValue('resultFilterScore');
	setValue('resultFilterStatus');
	setValue('resultSearch');
	// Admin-only teacher scoping is a filter too; clear it so the roster
	// returns to every class in the school.
	if (window.TeacherFilter?.isAdminSession?.()) {
		setValue('resultTeacherFilter');
	}
	filterResults();
}

function viewResultDetails(resultId) {
	// Use the same normalized, scoped set the table rendered (includes the
	// legacy localStorage exam mirrors and server-shaped rows).
	const results = resultsViewState.allScoped.length
		? resultsViewState.allScoped
		: window.__DI_CONTAINER__.repo.getAll_sync('results');
	const participantIndex = buildGameParticipantIndex(results);

	// Normalize first: the row ids the table renders are built from the
	// normalized shape (numero, resolved date).
	const result = normalizeResultEntry(
		results.find(
			(r) =>
				r.id === resultId ||
				(r.numero && `${r.numero}-${getResultDate(r)}` === resultId),
		),
	);

	if (!result) {
		showToast('Result not found', 'error');
		return;
	}

	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const student = resolveStudentDisplay(result, users);

	// Same row label the table renders (Training Quiz / game / exam title),
	// so the modal never spins its own vocabulary.
	const examDisplayName = resolveExamDisplayName(result, exams);

	// Find class - fall back to the student's registered class
	const classData = resolveResultClass(result, classes, student);

	// Calculate score (handles percentage, /20 grade and count-based rows)
	const { percent, grade } = resolveResultScore(result);
	const percentage = percent.toFixed(1);
	const scoreOn20 = grade.toFixed(1);

	const gameResult = isGameResult(result);
	const participantNames = gameResult
		? resolveParticipantNamesForDisplay(result, participantIndex)
		: [];
	const participantCount = gameResult
		? resolveParticipantCount(result, participantNames)
		: 0;
	const winnerName = gameResult ? resolveWinnerName(result) : '';
	const assessmentLabel = isGameResult(result) ? 'Game' : 'Exam';
	const assessmentValue = examDisplayName;

	// Create detail modal (modern dashboard-style hero + grid)
	const passed = isResultPassed(grade);
	const modalInitials = String(student.name || '?')
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w.charAt(0).toUpperCase())
		.join('') || '?';
	const classLabel = classData
		? classData.className || classData.name
		: student.class || '-';
	const modeLabel = result.mode
		? result.mode.charAt(0).toUpperCase() + result.mode.slice(1)
		: gameResult
			? 'Game'
			: 'Training';
	const modal = document.createElement('div');
	modal.className = 'result-detail-modal';
	modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Result Details</h2>
                <button class="close-btn" onclick="this.closest('.result-detail-modal').remove()">✕</button>
            </div>
            <div class="result-modal-hero">
                <span class="result-modal-avatar">${escapeHtml(modalInitials)}</span>
                <div class="result-modal-title">
                    <h3>${escapeHtml(student.name)}</h3>
                    <p>${escapeHtml(student.numero ? `N° ${student.numero} · ` : '')}${escapeHtml(classLabel)} · ${escapeHtml(assessmentValue)}</p>
                </div>
                <div class="result-modal-score ${passed ? 'passed' : 'failed'}">
                    <strong>${scoreOn20}/20</strong>
                    <small>${percentage}% · ${passed ? 'Passed' : 'Failed'}</small>
                </div>
            </div>
            <div class="modal-body">
                <div class="detail-cell">
                    <span class="detail-label">${assessmentLabel}</span>
                    <span class="detail-value">${escapeHtml(assessmentValue)}</span>
                </div>
                <div class="detail-cell">
                    <span class="detail-label">Mode</span>
                    <span class="detail-value">${escapeHtml(modeLabel)}</span>
                </div>
                <div class="detail-cell">
                    <span class="detail-label">Class</span>
                    <span class="detail-value">${escapeHtml(classLabel)}</span>
                </div>
                <div class="detail-cell">
                    <span class="detail-label">Date</span>
                    <span class="detail-value">${
											getResultDate(result)
												? escapeHtml(new Date(getResultDate(result)).toLocaleString())
												: '-'
										}</span>
                </div>
                ${
									gameResult && (participantNames.length || participantCount > 0)
										? `<div class="detail-cell full">
                    <span class="detail-label">Participants</span>
                    <span class="detail-value">${escapeHtml(
											participantNames.length
												? participantNames.join(', ')
												: `${participantCount} player(s)`
										)}</span>
                </div>`
										: ''
								}
                ${
									gameResult && winnerName
										? `<div class="detail-cell">
                    <span class="detail-label">Winner</span>
                    <span class="detail-value">🏆 ${escapeHtml(winnerName)}</span>
                </div>`
										: ''
								}
                <div class="detail-cell">
                    <span class="detail-label">Time Spent</span>
                    <span class="detail-value">${escapeHtml(formatResultTime(result))}</span>
                </div>
                <div class="detail-cell">
                    <span class="detail-label">Source</span>
                    <span class="detail-value">${
											result.deviceName
												? `${escapeHtml(result.deviceName)}${result.deviceIp ? ` (@${result.deviceIp})` : ''}`
												: 'Local Submission'
										}</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.result-detail-modal').remove()">Close</button>
                <button class="btn btn-danger" onclick="deleteResult('${escapeHtml(
									resultId
								)}'); this.closest('.result-detail-modal').remove()">Delete</button>
            </div>
        </div>
    `;

	document.body.appendChild(modal);
}

async function deleteResult(resultId) {
	if (!confirm('Are you sure you want to delete this result?')) return;

	let results = window.__DI_CONTAINER__.repo.getAll_sync('results');
	const target = results.find((r) => r.id === resultId);
	const initialLength = results.length;

	// Delete by id or by numero+date combination (same key the table uses)
	results = results.filter(
		(r) =>
			!(r.id === resultId || (r.numero && `${r.numero}-${getResultDate(r)}` === resultId))
	);

	if (results.length === initialLength) {
		showToast('Result not found', 'error');
		return;
	}

	if (window.API?.remove && window.__authToken && target?.id && /^[0-9a-f-]{36}$/i.test(target.id)) {
		try {
			await window.API.remove('results', resultId);
		} catch (error) {
			showToast('Could not delete result from the database: ' + (error?.message || 'server error'), 'error');
			return;
		}
	}
	window.__DI_CONTAINER__.repo.setAll_sync('results', results);

	loadResults();
	showToast('Result deleted successfully');
}

// Helper function
function escapeHtml(unsafe) {
	if (!unsafe) return '';
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// ============================================
// BULK SELECTION - DELETE SELECTED (question-tab style)
// ============================================
async function deleteSelectedResults() {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('results')
		: [];
	if (!ids.length) {
		showToast('No results selected', 'error');
		return;
	}
	if (
		!confirm(
			`Are you sure you want to delete ${ids.length} result(s)? This action cannot be undone.`,
		)
	) {
		return;
	}
	const idSet = new Set(ids.map(String));
	let results = window.__DI_CONTAINER__.repo.getAll_sync('results') || [];
	const targets = results.filter((r) => {
		const rid = String(r.id || `${r.numero}-${getResultDate(r)}`);
		return idSet.has(rid);
	});
	if (!targets.length) {
		showToast('Selected results not found — refresh the list', 'error');
		return;
	}
	// Server-first for UUID rows (same contract as deleteResult).
	const failed = [];
	for (const target of targets) {
		if (
			window.API?.remove &&
			window.__authToken &&
			target?.id &&
			/^[0-9a-f-]{36}$/i.test(target.id)
		) {
			try {
				await window.API.remove('results', target.id);
			} catch (error) {
				console.warn('[results] bulk API delete failed:', error);
				failed.push(String(target.id));
			}
		}
	}
	const failedSet = new Set(failed);
	results = results.filter((r) => {
		const rid = String(r.id || `${r.numero}-${getResultDate(r)}`);
		if (!idSet.has(rid)) return true;
		if (r.id && failedSet.has(String(r.id))) return true;
		return false;
	});
	window.__DI_CONTAINER__.repo.setAll_sync('results', results);
	if (window.BulkSelect) window.BulkSelect.clear('results');
	loadResults();
	if (failed.length) {
		showToast(
			`Deleted ${targets.length - failed.length}; ${failed.length} failed on server — kept locally`,
			'error',
		);
	} else {
		showToast(`Deleted ${targets.length} result(s)!`);
	}
}

// Expose to global scope
window.filterResults = filterResults;
window.loadResults = loadResults;
window.viewResultDetails = viewResultDetails;
window.deleteResult = deleteResult;
window.deleteSelectedResults = deleteSelectedResults;
window.clearAllResultFilters = clearAllResultFilters;
window.setResultsView = setResultsView;
window.setResultsSort = setResultsSort;
window.openStudentProfileByKey = openStudentProfileByKey;
window.closeStudentProfile = closeStudentProfile;
window.exportStudentProfileCSV = exportStudentProfileCSV;
window.escapeHtml = escapeHtml;
window.exportResultsCSV = exportResultsCSV;
window.exportResultsJSON = exportResultsJSON;
window.importResultsJSON = importResultsJSON;

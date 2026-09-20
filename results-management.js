// Results Management

// Initialize results on page load
document.addEventListener('DOMContentLoaded', function () {
	loadResultsFilters();
	loadResults();
});

function loadResultsFilters() {
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
}

function getResultDate(result) {
	if (!result) return '';
	return (
		result.date ||
		result.dateTaken ||
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
		dateTaken: result.dateTaken || normalizedDate,
		name: result.name || result.studentName || '',
		studentName: result.studentName || result.name || '',
		numero: result.numero || result.studentNumber || '',
		studentNumber: result.studentNumber || result.numero || '',
		class: result.class || result.className || result.class_name || '',
		className: result.className || result.class || result.class_name || '',
		examTitle: result.examTitle || result.examName || result.exam || '',
		examName: result.examName || result.examTitle || result.exam || '',
		userId: result.userId || result.user_id || '',
		user_id: result.user_id || result.userId || '',
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

function resolveResultClass(result, classes, student) {
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
	// Load training results from quizResults
	let results = window.__DI_CONTAINER__.repo.getAll_sync('results').map(
		normalizeResultEntry,
	);

	// Also load exam results from examResults
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

	// Sort by date descending
	results = results.map(normalizeResultEntry);
	if (window.Auth?.filterItemsByRole) {
		results = window.Auth.filterItemsByRole('result', results);
	}
	results.sort(
		(a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)),
	);

	displayResults(results);
}

function filterResults() {
	const examFilter = document.getElementById('resultFilterExam').value;
	const classFilter = document.getElementById('resultFilterClass').value;
	const modeFilter = document.getElementById('resultFilterMode').value;
	const dateFilter = document.getElementById('resultFilterDate').value;
	const scoreFilter = document.getElementById('resultFilterScore').value;
	const searchTerm = document
		.getElementById('resultSearch')
		.value.toLowerCase();

	// Load all results (both training and exam results are now stored in quizResults)
	let results = window.__DI_CONTAINER__.repo.getAll_sync('results').map(
		normalizeResultEntry,
	);
	if (window.Auth?.filterItemsByRole) {
		results = window.Auth.filterItemsByRole('result', results);
	}

	// Apply filters
	if (examFilter) {
		results = results.filter(
			(r) => r.examId === examFilter || r.examTitle === examFilter
		);
	}

	if (classFilter) {
		// Get saved classes to help with filtering
		const savedClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
		const selectedClassRecord = savedClasses.find((c) => c.id === classFilter);
		const selectedClassName = selectedClassRecord
			? selectedClassRecord.name
			: classFilter;

		results = results.filter((r) => {
			// Handle both saved classes (with classId) and virtual classes (without classId)
			// For saved classes: compare classId
			if (r.classId && r.classId === classFilter) return true;
			// Also check class name in case classId is empty
			if (r.class && r.class === selectedClassName) return true;
			// For virtual classes or exact class name match
			if (r.class && r.class === classFilter) return true;
			return false;
		});
	}

	if (modeFilter) {
		// Handle different modes including games
		if (modeFilter === 'game') {
			// Filter for game results
			results = results.filter((r) => isGameResult(r));
		} else {
			// For exam and training modes
			results = results.filter((r) => (r.mode || 'exam') === modeFilter);
		}
	}

	if (dateFilter) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		results = results.filter((r) => {
			const resultDate = new Date(getResultDate(r));
			const resultDay = new Date(
				resultDate.getFullYear(),
				resultDate.getMonth(),
				resultDate.getDate()
			);

			if (dateFilter === 'today') {
				return resultDay.getTime() === today.getTime();
			} else if (dateFilter === 'week') {
				const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
				return resultDay >= weekAgo;
			} else if (dateFilter === 'month') {
				const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
				return resultDay >= monthAgo;
			}
			return true;
		});
	}

	if (scoreFilter) {
		results = results.filter((r) => {
			const scoreOn20 = resolveResultScore(r).grade;

			if (scoreFilter === 'lt10') return scoreOn20 < 10;
			if (scoreFilter === 'gte10') return scoreOn20 >= 10;
			return true;
		});
	}

	if (searchTerm) {
		results = results.filter(
			(r) =>
				String(r.name || '').toLowerCase().includes(searchTerm) ||
				String((r.numero ?? r.number) || '').toLowerCase().includes(searchTerm)
		);
	}

	// Ensure newest first
	results.sort(
		(a, b) => new Date(getResultDate(b)) - new Date(getResultDate(a)),
	);

	displayResults(results);
}

function displayResults(results) {
	const tbody = document.getElementById('results-list');
	if (!tbody) return;

	if (results.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="7" class="text-center">No results found.</td></tr>';
		return;
	}

	// Get exams, classes and users for display names
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
	const participantIndex = buildGameParticipantIndex(results);

	tbody.innerHTML = results
		.map((result) => {
			const gameResult = isGameResult(result);
			const student = resolveStudentDisplay(result, users);
			const participantNames = gameResult
				? resolveParticipantNamesForDisplay(result, participantIndex)
				: [];
			const participantCount = gameResult
				? resolveParticipantCount(result, participantNames)
				: 0;
			const winnerName = gameResult ? resolveWinnerName(result) : '';

			// Find exam - check by examId or examTitle, handle both title and name fields
			let exam = null;
			let examDisplayName = null;

			if (gameResult) {
				examDisplayName = resolveGameDisplayName(result);
			} else {
				if (result.examId) {
					exam = exams.find((e) => e.id === result.examId);
					if (exam) {
						examDisplayName = exam.title || exam.name;
					}
				}

				// If not found by ID, try by title/name
				if (!examDisplayName && result.examTitle) {
					if (result.examTitle === 'Training Quiz') {
						examDisplayName = 'Training Quiz';
					} else {
						exam = exams.find(
							(e) =>
								e.title === result.examTitle || e.name === result.examTitle,
						);
						if (exam) {
							examDisplayName = exam.title || exam.name;
						} else {
							// Use the stored examTitle as fallback
							examDisplayName = result.examTitle;
						}
					}
				}

				// Final fallback based on mode
				if (!examDisplayName) {
					examDisplayName =
						result.mode === 'training' ? 'Training Quiz' : 'Unknown Exam';
				}
			}

			// Find class - check by classId or class name, fall back to the
			// student's registered class from the users store.
			const classData = resolveResultClass(result, classes, student);

			// Calculate score (handles percentage, /20 grade and count-based rows)
			const { percent, grade } = resolveResultScore(result);
			const percentage = percent.toFixed(1);
			const scoreOn20 = grade.toFixed(1);

			// Format time
			const timeValue = result.timeTaken || result.timeSpent || result.time || 0;
			const minutes = Math.floor(timeValue / 60);
			const seconds = timeValue % 60;
			const timeFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

			// Generate unique ID if not present
			const resultDate = getResultDate(result);
			const resultId = result.id || `${result.numero}-${resultDate}`;

			const examMetaLines = [];
			if (gameResult) {
				if (result.lobbyLabel) {
					examMetaLines.push(`Lobby: ${result.lobbyLabel}`);
				}
				if (participantNames.length) {
					examMetaLines.push(`Participants: ${participantNames.join(', ')}`);
				} else if (participantCount > 0) {
					examMetaLines.push(`Participants: ${participantCount} player(s)`);
				}
				if (winnerName) {
					examMetaLines.push(`Winner: ${winnerName}`);
				}
			}

			const examCell = examMetaLines.length
				? `<div class="result-main">${escapeHtml(examDisplayName)}</div>${examMetaLines
						.map(
							(line) =>
								`<div class="result-subtext">${escapeHtml(line)}</div>`,
						)
						.join('')}`
				: escapeHtml(examDisplayName);

			return `
            <tr data-result-id="${escapeHtml(resultId)}">
                <td title="${resultDate ? new Date(resultDate).toLocaleString() : ''}">${
									resultDate ? new Date(resultDate).toLocaleDateString() : '-'
								}</td>
                <td>${escapeHtml(
									student.numero ? student.numero + ' - ' : ''
								)}${escapeHtml(student.name)}</td>
                <td>${
									classData
										? escapeHtml(classData.className || classData.name)
										: student.class
										? escapeHtml(student.class)
										: '-'
								}</td>
                <td>${examCell}</td>
                <td>
                    <span class="score-badge ${
											parseFloat(scoreOn20) >= 10 ? 'passed' : 'failed'
										}">
                        ${scoreOn20}/20 (${percentage}%)
                    </span>
                </td>
                <td>${timeFormatted}</td>
                <td>${
									result.deviceName
										? `<span class="device-source-badge" style="font-size: 0.85em; padding: 2px 6px; background: #f1f5f9; border-radius: 4px; color: #64748b; border: 1px solid #e2e8f0;">${escapeHtml(result.deviceName)}${result.deviceIp ? ` (@${result.deviceIp})` : ''}</span>`
										: '<span style="color: #9ca3af; font-size: 0.85em;">Local</span>'
								}</td>
                <td class="actions-cell">
                    <div class="exam-actions">
                        <button class="exam-action-btn" onclick="viewResultDetails('${escapeHtml(
													resultId
												)}')" title="View Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="exam-action-btn exam-delete-btn" onclick="deleteResult('${escapeHtml(
													resultId
												)}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
		})
		.join('');

	// Attach mobile click listeners
	results.forEach((result) => {
		const resultDate = getResultDate(result);
		const resultId = result.id || `${result.numero}-${resultDate}`;
		const safeResultId = escapeHtml(resultId);
		const row = tbody.querySelector(`tr[data-result-id="${safeResultId}"]`);
		
		if (row) {
			row.addEventListener('click', (e) => {
				if (window.innerWidth > 768) return;
				if (e.target.closest('button')) return;
				e.stopPropagation();

				const studentShort = resolveStudentDisplay(result, users);
				const displayName = escapeHtml(
					studentShort.numero
						? `${studentShort.numero} - ${studentShort.name}`
						: studentShort.name,
				);
				MobileActionSheet.open(`Result: ${displayName}`, [
					{
						label: 'View Details',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
						onClick: () => viewResultDetails(resultId)
					},
					{
						label: 'Delete Result',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
						variant: 'danger',
						onClick: () => deleteResult(resultId)
					}
				]);
			});
		}
	});
}

// Function to clear all filters in results section
function clearAllResultFilters() {
	// Reset all filter selects to default values
	document.getElementById('resultFilterExam').value = '';
	document.getElementById('resultFilterClass').value = '';
	document.getElementById('resultFilterMode').value = '';
	document.getElementById('resultFilterDate').value = '';
	document.getElementById('resultFilterScore').value = '';
	document.getElementById('resultSearch').value = '';

	// Re-load results with cleared filters
	loadResults();
}

function viewResultDetails(resultId) {
	// Load all results (both training and exam results are now stored in quizResults)
	const results = window.__DI_CONTAINER__.repo.getAll_sync('results');
	const participantIndex = buildGameParticipantIndex(results);

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

	// Find exam
	let exam = null;
	if (result.examId) {
		exam = exams.find((e) => String(e.id) === String(result.examId));
	} else if ((result.examTitle || result.examName) && result.examTitle !== 'Training Quiz') {
		exam = exams.find(
			(e) =>
				e.title === result.examTitle ||
				e.name === result.examTitle ||
				e.title === result.examName ||
				e.name === result.examName
		);
	}

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
	let assessmentLabel = 'Exam';
	let assessmentValue = '';
	if (gameResult) {
		assessmentLabel = 'Game';
		assessmentValue = resolveGameDisplayName(result);
	} else {
		assessmentValue = exam
			? exam.title || exam.name
			: result.examTitle
			? result.examTitle
			: result.mode === 'training'
			? 'Training Quiz'
			: 'Unknown Exam';
	}

	// Create detail modal
	const modal = document.createElement('div');
	modal.className = 'result-detail-modal';
	modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Result Details</h2>
                <button class="close-btn" onclick="this.closest('.result-detail-modal').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="detail-row">
                    <span class="detail-label">Student:</span>
                    <span class="detail-value">${escapeHtml(
											student.numero
												? `${student.numero} - ${student.name}`
												: student.name
										)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Student ID:</span>
                    <span class="detail-value">${escapeHtml(
											student.numero || '-'
										)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Class:</span>
                    <span class="detail-value">${
											classData
												? escapeHtml(classData.className || classData.name)
												: student.class
												? escapeHtml(student.class)
												: '-'
										}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">${assessmentLabel}:</span>
                    <span class="detail-value">${escapeHtml(assessmentValue)}</span>
                </div>
                ${
									gameResult && (participantNames.length || participantCount > 0)
										? `<div class="detail-row">
                    <span class="detail-label">Participants:</span>
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
										? `<div class="detail-row">
                    <span class="detail-label">Winner:</span>
                    <span class="detail-value">${escapeHtml(winnerName)}</span>
                </div>`
										: ''
								}
                <div class="detail-row">
                    <span class="detail-label">Score:</span>
                    <span class="detail-value score-value ${
											parseFloat(scoreOn20) >= 10 ? 'passed' : 'failed'
										}">${scoreOn20}/20 (${percentage}%)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${
											getResultDate(result)
												? new Date(getResultDate(result)).toLocaleString()
												: '-'
										}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Device Info:</span>
                    <span class="detail-value">${
											result.deviceName
												? `${escapeHtml(result.deviceName)}${result.deviceIp ? ` (@${result.deviceIp})` : ''}`
												: '<span style="color: #9ca3af;">Local Submission</span>'
										}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Mode:</span>
                    <span class="detail-value">${
											result.mode
												? result.mode.charAt(0).toUpperCase() +
												  result.mode.slice(1)
												: 'Training'
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

function deleteResult(resultId) {
	if (!confirm('Are you sure you want to delete this result?')) return;

	let results = window.__DI_CONTAINER__.repo.getAll_sync('results');
	const initialLength = results.length;

	// Delete by id or by numero+date combination
	results = results.filter(
		(r) =>
			!(r.id === resultId || (r.numero && `${r.numero}-${r.date}` === resultId))
	);

	if (results.length === initialLength) {
		showToast('Result not found', 'error');
		return;
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

// Expose to global scope
window.filterResults = filterResults;
window.loadResults = loadResults;
window.viewResultDetails = viewResultDetails;
window.deleteResult = deleteResult;
window.clearAllResultFilters = clearAllResultFilters;
window.escapeHtml = escapeHtml;

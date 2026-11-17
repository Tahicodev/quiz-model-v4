// Exam Analysis — per-exam session review and per-question accuracy.
//
// A teacher opens this from the exams table. The modal shows two tabs:
//   1. Students       — every attempt (session) for the exam.
//   2. Per-question accuracy — for each exam question: category, points,
//                              correct/attempts with accuracy %, and the
//                              students who answered correctly/incorrectly.

/* global window, document */

/** Read a store through the DI repo (route results through role filters). */
function getExamAnalysisRows(store) {
	const r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
	if (!r || typeof r.getAll_sync !== 'function') return [];
	let rows = r.getAll_sync(store) || [];
	if (
		store === 'results' &&
		window.Auth &&
		typeof window.Auth.filterItemsByRole === 'function'
	) {
		rows = window.Auth.filterItemsByRole('result', rows);
	}
	return rows;
}

function examAnalysisEscapeHtml(unsafe) {
	return String(unsafe ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function examAnalysisParseJson(value, fallback) {
	if (value == null || value === '') return fallback;
	if (typeof value === 'object') return value;
	try {
		return JSON.parse(value);
	} catch (_) {
		return fallback;
	}
}

/**
 * Extract the flat { questionId: answer } map from a stored `answers_json`.
 *
 * The student workspace stores the answers wrapped:
 *   { userAnswers: { q1: 'a' }, trainingContext: { … } }
 * while older/other write paths store the flat map directly. Comparing against
 * the wrapper made every question look unanswered, which is why the Points /
 * Correct / Attempts / Accuracy columns stayed empty.
 *
 * Mirrors `extractAttemptAnswers` in src/backend/routes/results.routes.js.
 */
function examAnalysisExtractAnswers(value) {
	const root = examAnalysisParseJson(value, null);
	if (!root || typeof root !== 'object' || Array.isArray(root)) return {};

	const pickEntries = (obj) => {
		const out = {};
		Object.keys(obj || {}).forEach((key) => {
			const entry = obj[key];
			if (typeof entry === 'string' || typeof entry === 'number') out[key] = entry;
		});
		return out;
	};

	for (const key of ['userAnswers', 'answers']) {
		if (!(key in root)) continue;
		const nested = examAnalysisParseJson(root[key], null);
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			const out = pickEntries(nested);
			if (Object.keys(out).length) return out;
		}
	}
	if ('userAnswers' in root || 'answers' in root) return {};

	return pickEntries(root);
}

/**
 * Authoritative exam → question membership from the `exam_questions` junction.
 *
 * The junction is the only trustworthy source: the legacy `exam.questions`
 * array stored *indices into the question bank picker*, and those indices
 * drift as soon as a question is created or deleted — which is why the
 * accuracy table used to list questions that had nothing to do with the exam.
 */
function examAnalysisJunctionQuestions(examId) {
	const links = getExamAnalysisRows('exam_questions') || [];
	const target = String(examId ?? '').trim();
	const rows = [];
	links.forEach((link) => {
		if (!link || typeof link !== 'object') return;
		const linkExamId = String(link.exam_id ?? link.examId ?? '').trim();
		if (!linkExamId || linkExamId !== target) return;
		const questionId = String(link.question_id ?? link.questionId ?? '').trim();
		if (!questionId) return;
		const order = Number.parseInt(link.order_index ?? link.orderIndex ?? '', 10);
		rows.push({
			questionId,
			order: Number.isInteger(order) ? order : rows.length,
			pointsOverride: link.points_override ?? link.pointsOverride,
		});
	});
	rows.sort((a, b) => a.order - b.order);
	return rows;
}

/** Find a bank question by its id. */
function examAnalysisFindQuestionById(allQuestions, id) {
	const target = String(id ?? '').trim();
	if (!target) return null;
	return (
		(allQuestions || []).find((q) => {
			if (!q || typeof q !== 'object') return false;
			return String(q.id ?? q.questionId ?? q.uuid ?? '').trim() === target;
		}) || null
	);
}

/**
 * The question id carried by one `exam.questions` entry.
 *
 * Returns '' for the legacy *picker index* entries (plain numbers): those are
 * positions in the question bank, not identifiers, and they drift as soon as a
 * question is created or deleted.
 */
function examAnalysisEntryQuestionId(entry) {
	if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
		const id = String(entry.id ?? entry.questionId ?? entry.uuid ?? '').trim();
		if (id) return id;
		return '';
	}
	const raw = String(entry ?? '').trim();
	if (!raw) return '';
	if (/^\d+$/.test(raw)) return '';
	return raw;
}

/**
 * The authoritative list of questions that belong to one exam.
 *
 * Membership comes from real question ids only:
 *   1. The `exam_questions` junction (the DB-authoritative assignment).
 *   2. The uuid entries stored on the exam row (the bootstrap hydrates this
 *      list from the junction).
 *
 * Legacy *picker indices* are never resolved positionally: an index points at
 * a slot in the question bank, and that slot drifts as soon as a question is
 * created or deleted — which is why the accuracy table used to list questions
 * that had nothing to do with the exam. When only indices survive, the only
 * provable members are the questions this exam's students actually answered.
 */
function examAnalysisExamQuestionIds(exam, allQuestions, results) {
	const bankIds = new Set();
	(allQuestions || []).forEach((q) => {
		const id = String(q?.id ?? q?.questionId ?? q?.uuid ?? '').trim();
		if (id) bankIds.add(id);
	});

	const ids = [];
	const push = (id) => {
		const key = String(id || '').trim();
		if (!key || !bankIds.has(key) || ids.includes(key)) return;
		ids.push(key);
	};

	// 1. The junction, in its stored order.
	examAnalysisJunctionQuestions(exam?.id).forEach((row) => push(row.questionId));

	// 2. The uuid entries on the exam row.
	(Array.isArray(exam?.questions) ? exam.questions : []).forEach((entry) => {
		push(examAnalysisEntryQuestionId(entry));
	});

	if (ids.length) return ids;

	// 3. Legacy indices only: fall back to the questions that were answered.
	const answered = [];
	(results || []).forEach((result) => {
		const answers = examAnalysisExtractAnswers(result?.answers_json);
		Object.keys(answers || {}).forEach((id) => {
			const key = String(id);
			if (bankIds.has(key) && !answered.includes(key)) answered.push(key);
		});
	});
	return answered;
}

/** Per-exam points overrides (ExamQuestion.points_override) for one exam. */
function examAnalysisPointsOverrides(examId) {
	const links = getExamAnalysisRows('exam_questions') || [];
	const map = new Map();
	links.forEach((link) => {
		if (!link || typeof link !== 'object') return;
		const linkExamId = String(link.exam_id ?? link.examId ?? '').trim();
		if (!linkExamId || linkExamId !== String(examId).trim()) return;
		const questionId = String(link.question_id ?? link.questionId ?? '').trim();
		if (!questionId) return;
		const override = link.points_override ?? link.pointsOverride;
		if (override === null || override === undefined || override === '') return;
		const points = Number.parseFloat(override);
		if (Number.isFinite(points) && points > 0) map.set(questionId, points);
	});
	return map;
}

function getExamAnalysisDate(result) {
	return (
		result.date ||
		result.dateTaken ||
		result.date_taken ||
		result.completedAt ||
		result.timestamp ||
		''
	);
}

function examAnalysisQuestionPoints(question) {
	const points = Number.parseFloat(
		question && (question.points_override ?? question.points ?? 1),
	);
	return Number.isFinite(points) && points > 0 ? points : 1;
}

function examAnalysisCategoryName(question, categories) {
	const rawId =
		question.categoryName ||
		question.category_id ||
		question.categoryId ||
		question.category ||
		'';
	if (!rawId) return 'Uncategorized';
	if (typeof rawId === 'string' && rawId.toLowerCase() === 'uncategorized') {
		return 'Uncategorized';
	}
	const match = (categories || []).find((c) => String(c.id) === String(rawId));
	if (match && (match.name || match.categoryName)) {
		return match.name || match.categoryName;
	}
	if (typeof question.categoryName === 'string' && question.categoryName) {
		return question.categoryName;
	}
	return 'Uncategorized';
}

function examAnalysisQuestionText(question) {
	return question ? question.text || question.question || '' : '';
}

function examAnalysisQuestionType(question) {
	if (!question) return '';
	const raw = String(question.type || '')
		.toLowerCase()
		.trim();
	const aliases = {
		mcq: 'multiple-choice',
		multiple: 'multiple-choice',
		multiplechoice: 'multiple-choice',
		single: 'multiple-choice',
		multi: 'multiple-choice-multi',
		'multiple-choice-multi': 'multiple-choice-multi',
		'multi-select': 'multiple-choice-multi',
		multiselect: 'multiple-choice-multi',
		'true-false': 'true-false',
		truefalse: 'true-false',
		boolean: 'true-false',
		'fill-blank': 'fill-blank',
		fillblank: 'fill-blank',
		cloze: 'fill-blank',
		draggable: 'draggable',
		'drag-drop': 'draggable',
		order: 'draggable',
		sequence: 'draggable',
		'odd-one-out': 'odd-one-out',
		odd: 'odd-one-out',
		oddoneout: 'odd-one-out',
		'matching-pairs': 'matching-pairs',
		matching: 'matching-pairs',
		match: 'matching-pairs',
		pairs: 'matching-pairs',
		code: 'code',
	};
	return aliases[raw] || raw || 'question';
}

const EXAM_ANALYSIS_TYPE_LABELS = {
	'multiple-choice': 'MCQ',
	'multiple-choice-multi': 'Multi',
	'true-false': 'True/False',
	'fill-blank': 'Fill blank',
	draggable: 'Drag',
	'odd-one-out': 'Odd one out',
	'matching-pairs': 'Matching',
	code: 'Code',
};

function examAnalysisTypeBadge(question) {
	const type = examAnalysisQuestionType(question);
	const label = EXAM_ANALYSIS_TYPE_LABELS[type] || type;
	return `<span class="eas-type-badge">${examAnalysisEscapeHtml(label)}</span>`;
}

/** Strip the `meta::<base64>::` metadata prefix some write paths store. */
function examAnalysisStripMetaPrefix(raw) {
	const s = String(raw || '').trim();
	return s.startsWith('meta::') ? s.replace(/^meta::[A-Za-z0-9+/=]*::?/, '') : s;
}

/** Strip the `multi::` prefix stored on multi-select answers. */
function examAnalysisStripMultiPrefix(raw) {
	const s = String(raw || '').trim();
	return s.startsWith('multi::') ? s.slice('multi::'.length) : s;
}

/** Split a multi-select answer into its tokens, whatever separator was used. */
function examAnalysisSplitMulti(raw) {
	return String(raw || '')
		.split(/[|,;]/)
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

/** Normalize an answer value for comparison (strings, numbers, arrays, JSON). */
function normalizeExamAnalysisAnswer(value) {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value === 'string') {
		const trimmed = examAnalysisStripMetaPrefix(value).trim();
		if (!trimmed) return null;
		try {
			const parsed = JSON.parse(trimmed);
			return normalizeExamAnalysisAnswer(parsed);
		} catch (_) {
			return trimmed.toLowerCase();
		}
	}
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (Array.isArray(value)) {
		return value
			.map(normalizeExamAnalysisAnswer)
			.filter((v) => v !== null)
			.sort((a, b) => String(a).localeCompare(String(b)));
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value).toLowerCase();
}

/**
 * Compare a student answer with the stored correct answer.
 * The question type decides how multi-select / ordering answers are compared.
 */
function examAnalysisAnswersEqual(userAnswer, correctAnswer, questionType) {
	if (userAnswer === undefined || userAnswer === null || userAnswer === '') return false;
	const type = String(questionType || '').toLowerCase();
	const rawUser = examAnalysisStripMetaPrefix(userAnswer);
	const rawCorrect = examAnalysisStripMetaPrefix(correctAnswer);

	if (type === 'multiple-choice-multi' || type === 'multi' || type === 'multi-select') {
		const userSet = new Set(examAnalysisSplitMulti(examAnalysisStripMultiPrefix(rawUser)));
		const correctSet = new Set(examAnalysisSplitMulti(examAnalysisStripMultiPrefix(rawCorrect)));
		if (!userSet.size || !correctSet.size) return false;
		if (userSet.size !== correctSet.size) return false;
		for (const value of userSet) {
			if (!correctSet.has(value)) return false;
		}
		return true;
	}

	if (type === 'draggable' || type === 'drag-drop' || type === 'order' || type === 'sequence') {
		const userOrder = examAnalysisSplitMulti(rawUser);
		const correctOrder = examAnalysisSplitMulti(rawCorrect);
		if (!userOrder.length || userOrder.length !== correctOrder.length) return false;
		return userOrder.join('|') === correctOrder.join('|');
	}

	const a = normalizeExamAnalysisAnswer(rawUser);
	const b = normalizeExamAnalysisAnswer(rawCorrect);
	if (a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Resolve student display name/number/class for a result row. */
function examAnalysisStudent(result, users) {
	const userId = result.userId || result.user_id || '';
	const user = userId
		? (users || []).find((u) => String(u.id) === String(userId))
		: null;
	const name =
		result.studentName ||
		result.name ||
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
	return { name, numero, class: klass, user, userId: String(userId || '') };
}

/** Coherent /20 grade + percentage from any result schema. */
function examAnalysisScore(result) {
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
		(isFiniteNum(totalPts) || isFiniteNum(totalQ))
	) {
		const total = totalPts > 0 ? totalPts : totalQ;
		if (total > 0 && rawScore >= 0 && rawScore <= total && rawScore <= 100) {
			percent = Math.max(0, Math.min(100, (rawScore / total) * 100));
			grade = (percent / 100) * 20;
		} else if (rawScore >= 0 && rawScore <= 20) {
			grade = rawScore;
			percent = (rawScore / 20) * 100;
		} else if (isFiniteNum(rawScore)) {
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

function examAnalysisFormatTime(totalSeconds) {
	const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
	return `${s}s`;
}

/**
 * Build the full analysis payload for one exam.
 * Returns { exam, questions, results, perQuestion, sessionRows }
 */
function buildExamAnalysis(exam) {
	const allQuestions = getExamAnalysisRows('questions') || [];
	const categories = getExamAnalysisRows('categories') || [];
	const users = getExamAnalysisRows('users') || [];
	const allResults = getExamAnalysisRows('results') || [];

	const examKey = String(exam.id);
	const examNames = [exam.name, exam.title].filter(Boolean);
	const results = allResults.filter((r) => {
		if (!r || typeof r !== 'object') return false;
		const rowExamId = String(r.examId || r.exam_id || '').trim();
		if (rowExamId && rowExamId === examKey) return true;
		if (!rowExamId) {
			const rowTitle = String(r.examTitle || r.examName || '').trim();
			if (rowTitle && examNames.includes(rowTitle)) return true;
		}
		return false;
	});

	// Only questions that really belong to this exam are analysed. The legacy
	// `exam.questions` array stored indices into the question bank picker, so
	// resolving it positionally listed questions that had nothing to do with
	// the exam (and their accuracy was always empty).
	const questionIds = examAnalysisExamQuestionIds(exam, allQuestions, results);
	const questions = questionIds
		.map((id) => examAnalysisFindQuestionById(allQuestions, id))
		.filter((q) => q && q.id);

	// Per-exam points overrides live on the ExamQuestion junction rows, which
	// the bootstrap exposes separately from the hydrated exam.questions list.
	const pointsOverrides = examAnalysisPointsOverrides(exam.id);

	const perQuestion = questions.map((q) => {
		const correctStudents = [];
		const wrongStudents = [];
		let attempts = 0;
		let correct = 0;
		const questionId = String(q.id);
		const questionType = examAnalysisQuestionType(q);
		results.forEach((result) => {
			const answers = examAnalysisExtractAnswers(result.answers_json);
			if (!answers || !(questionId in answers)) {
				return;
			}
			attempts += 1;
			const student = examAnalysisStudent(result, users);
			const fmtStudent = student.numero
				? `${student.numero} · ${student.name}`
				: student.name;
			const entry = { label: fmtStudent, userId: student.userId, key: examAnalysisStudentKey(result, users) };
			if (examAnalysisAnswersEqual(answers[questionId], q.answer, questionType)) {
				correct += 1;
				correctStudents.push(entry);
			} else {
				wrongStudents.push(entry);
			}
		});
		const accuracy = attempts ? Math.round((correct / attempts) * 100) : null;
		const points =
			pointsOverrides.get(questionId) ?? examAnalysisQuestionPoints(q);
		return {
			question: q,
			category: examAnalysisCategoryName(q, categories),
			points,
			attempts,
			correct,
			accuracy,
			correctStudents,
			wrongStudents,
		};
	});

	const sessionRows = results.map((result) => {
		const student = examAnalysisStudent(result, users);
		const { percent, grade } = examAnalysisScore(result);
		const answers = examAnalysisExtractAnswers(result.answers_json);
		const answeredCount = Object.keys(answers).length;
		const rawDate = getExamAnalysisDate(result);
		const date = rawDate ? new Date(rawDate).toLocaleString() : '-';
		return {
			student,
			grade: grade.toFixed(1),
			percent: percent.toFixed(1),
			timeSpent: result.timeSpent ?? result.time_spent,
			date,
			rawDate,
			answeredCount,
			totalQuestions: result.totalQuestions ?? result.total_questions ?? questions.length,
		};
	}).sort((a, b) => {
		const ta = a.rawDate ? new Date(a.rawDate).getTime() : 0;
		const tb = b.rawDate ? new Date(b.rawDate).getTime() : 0;
		return tb - ta;
	});

	return { exam, questions, results, perQuestion, sessionRows };
}

function examAnalysisAccuracyClass(pct) {
	if (pct === null || pct === undefined) return 'eas-acc-none';
	if (pct >= 80) return 'eas-acc-high';
	if (pct >= 50) return 'eas-acc-mid';
	return 'eas-acc-low';
}

function renderExamAnalysisStudentsTab(payload) {
	const rows = payload.sessionRows;
	if (!rows.length) {
		return `<div class="eas-empty">No attempts recorded for this exam yet.</div>`;
	}
	const attempts = rows.map((r) => {
		const passed = Number(r.grade) >= 10;
		const name = r.student.numero
			? `${examAnalysisEscapeHtml(r.student.numero)} — ${examAnalysisEscapeHtml(r.student.name)}`
			: examAnalysisEscapeHtml(r.student.name);
		const klass = r.student.class
			? `<span class="eas-cell-sub">${examAnalysisEscapeHtml(r.student.class)}</span>`
			: '';
		const time = r.timeSpent != null
			? `<span class="eas-cell-sub">${examAnalysisEscapeHtml(examAnalysisFormatTime(r.timeSpent))}</span>`
			: '';
		return `
			<tr>
				<td>
					<div class="eas-student-cell">${name}${klass}</div>
				</td>
				<td>
					<span class="eas-score eas-${passed ? 'green' : 'red'}">${r.grade}/20</span>
					<span class="eas-cell-sub">${r.percent}%</span>
				</td>
				<td>
					<span class="eas-badge ${passed ? 'eas-badge-green' : 'eas-badge-red'}">${passed ? 'Passed' : 'Failed'}</span>
				</td>
				<td>
					<div class="eas-cell-has-sub">${r.answeredCount}/${r.totalQuestions} answered${time}</div>
				</td>
				<td>${examAnalysisEscapeHtml(r.date)}</td>
			</tr>`;
	}).join('');

	return `
		<div class="eas-kpis">
			<div class="eas-kpi"><span class="eas-kpi-num">${rows.length}</span><span class="eas-kpi-label">Students</span></div>
			<div class="eas-kpi"><span class="eas-kpi-num">${payload.questions.length}</span><span class="eas-kpi-label">Questions</span></div>
		</div>
		<div class="eas-table-wrap">
			<table class="eas-table">
				<thead>
					<tr>
						<th>Student</th>
						<th>Score</th>
						<th>Status</th>
						<th>Progress</th>
						<th>Date</th>
					</tr>
				</thead>
				<tbody>${attempts}</tbody>
			</table>
		</div>`;
}

/**
 * The Results-tab profile key for a result row.
 * Reuses the shared helper so the name always resolves to the same profile.
 */
function examAnalysisStudentKey(result, users) {
	if (typeof window.resultsStudentKeyForResult === 'function') {
		return window.resultsStudentKeyForResult(result, users);
	}
	const userId = result?.userId || result?.user_id || '';
	return userId ? `u:${userId}` : '';
}

/** Render one student entry of the per-question detail as a profile link. */
function examAnalysisStudentLinkHtml(entry) {
	const label = typeof entry === 'string' ? entry : entry && entry.label;
	const key = typeof entry === 'string' ? '' : (entry && entry.key) || '';
	if (!label) return '';
	const escaped = examAnalysisEscapeHtml(label);
	if (!key) return `<span class="eas-student-name">${escaped}</span>`;
	return `<button type="button" class="eas-student-link" data-eas-student-key="${examAnalysisEscapeHtml(key)}" title="Open the student profile">${escaped}</button>`;
}

function examAnalysisPeopleHtml(entries, variant, title) {
	if (!entries.length) return '';
	return (
		`<div class="eas-people eas-people-${variant}">` +
		`<span class="eas-people-title">${examAnalysisEscapeHtml(title)} (${entries.length})</span>` +
		`<div class="eas-people-list">${entries.map(examAnalysisStudentLinkHtml).join(', ')}</div>` +
		'</div>'
	);
}

function renderExamAnalysisAccuracyTab(payload) {
	if (!payload.questions.length) {
		return `<div class="eas-empty">This exam has no questions to analyze.</div>`;
	}
	if (!payload.sessionRows.length) {
		return `<div class="eas-empty">No student answers yet — once students take this exam, accuracy appears here.</div>`;
	}

	const rows = payload.perQuestion.map((entry, idx) => {
		const pct = entry.accuracy;
		const accBadge =
			pct === null
				? '<span class="eas-acc-badge eas-acc-none">—</span>'
				: `<span class="eas-acc-badge ${examAnalysisAccuracyClass(pct)}">${pct}%</span>`;
		const barWidth = pct === null ? 0 : pct;
		const barClass = pct === null ? '' : examAnalysisAccuracyClass(pct);
		const correctList = examAnalysisPeopleHtml(entry.correctStudents, 'correct', 'Correct');
		const wrongList = examAnalysisPeopleHtml(entry.wrongStudents, 'wrong', 'Wrong');
		const detail = correctList || wrongList
			? `<tr class="eas-detail-row" data-eas-detail="${idx}"><td colspan="6">${correctList}${wrongList}</td></tr>`
			: '';

		return `
			<tr class="eas-q-row" data-eas-toggle="${idx}">
				<td class="eas-q-text">${examAnalysisEscapeHtml(examAnalysisQuestionText(entry.question))}</td>
				<td><span class="eas-cat-badge">${examAnalysisEscapeHtml(entry.category)}</span></td>
				<td>${examAnalysisTypeBadge(entry.question)}</td>
				<td><span class="eas-pts">${entry.points} pts</span></td>
				<td>
					<div class="eas-acc-cell">
						<div class="eas-acc-bar"><span class="eas-acc-fill ${barClass}" style="width:${barWidth}%"></span></div>
						<span class="eas-acc-count">${entry.correct}/${entry.attempts}</span>
					</div>
				</td>
				<td>${accBadge} <span class="eas-toggle-hint">▾</span></td>
			</tr>
			${detail}`;
	}).join('');

	return `
		<div class="eas-kpis">
			<div class="eas-kpi"><span class="eas-kpi-num">${payload.questions.length}</span><span class="eas-kpi-label">Questions</span></div>
			<div class="eas-kpi"><span class="eas-kpi-num">${payload.perQuestion.filter((q) => q.accuracy !== null).length}</span><span class="eas-kpi-label">With answers</span></div>
			<div class="eas-kpi"><span class="eas-kpi-num">${payload.sessionRows.length}</span><span class="eas-kpi-label">Students</span></div>
		</div>
		<div class="eas-table-wrap">
			<table class="eas-table eas-acc-table">
				<thead>
					<tr>
						<th>Question</th>
						<th>Category</th>
						<th>Type</th>
						<th>Points</th>
						<th>Correct / Attempts</th>
						<th>Accuracy</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
			<div class="eas-hint">
				<span class="eas-hint-icon" aria-hidden="true">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
				</span>
				<span>Click a question row to see which students answered correctly / incorrectly — then click a student name to open their profile.</span>
			</div>
		</div>`;
}

function closeExamAnalysisView() {
	const analysisPane = document.getElementById('examAnalysisPane');
	const listPane = document.getElementById('examListPane');
	const assignPane = document.getElementById('examAssignQuestionsPane');

	if (analysisPane) analysisPane.classList.add('hidden');
	if (assignPane) assignPane.classList.add('hidden');
	if (listPane) listPane.classList.remove('hidden');

	document.removeEventListener('keydown', onExamAnalysisKeyDown);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onExamAnalysisKeyDown(e) {
	if (e.key === 'Escape') {
		closeExamAnalysisView();
	}
}

/**
 * Ask the teacher domain module for the *management* view of the Exams tab.
 *
 * Without it the analysis pane stays inside the hidden manage pane and the
 * teacher sees an unchanged screen.
 */
function showExamAnalysisManageView() {
	try {
		if (
			window.TeacherDomainAnalytics &&
			typeof window.TeacherDomainAnalytics.showView === 'function'
		) {
			window.TeacherDomainAnalytics.showView('exams', 'manage');
		}
	} catch (_) {
		/* the analytics module is optional */
	}
}

function openExamAnalysis(examId) {
	const exams = getExamAnalysisRows('exams') || [];
	const exam = exams.find((e) => String(e.id) === String(examId));
	if (!exam) {
		if (window.showToast) showToast('Exam not found', 'error');
		return;
	}

	const payload = buildExamAnalysis(exam);
	const analysisPane = document.getElementById('examAnalysisPane');
	const listPane = document.getElementById('examListPane');
	const assignPane = document.getElementById('examAssignQuestionsPane');

	// If the dedicated full-page pane is available, use it!
	if (analysisPane) {
		// Ensure Exams tab is active
		if (typeof window.openTab === 'function') {
			const examsTab = document.getElementById('exams');
			if (examsTab && !examsTab.classList.contains('active')) {
				window.openTab(null, 'exams');
			}
		}
		// The teacher domain splits the Exams tab into an analytics pane and a
		// manage pane; the analysis pane lives in the manage pane. A teacher
		// arriving from the analytics view would otherwise see nothing at all.
		showExamAnalysisManageView();

		if (listPane) listPane.classList.add('hidden');
		if (assignPane) assignPane.classList.add('hidden');
		analysisPane.classList.remove('hidden');

		const examTitle = exam.name || exam.title || 'Exam';
		// The payload exposes `sessionRows` (one row per attempt), not
		// `students` — reading the wrong key made both KPIs show 0.
		const sessionRows = payload.sessionRows || [];
		const totalSessions = sessionRows.length;
		const totalQuestions = payload.questions ? payload.questions.length : 0;
		const avgScore = totalSessions > 0
			? Math.round(
				sessionRows.reduce((acc, s) => acc + (Number(s.percent) || 0), 0) / totalSessions,
			)
			: 0;

		analysisPane.innerHTML = `
			<div class="structure-pane-header">
				<nav class="structure-breadcrumb" aria-label="Exam analysis location">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
					<span>Exams › ${examAnalysisEscapeHtml(examTitle)} › Analysis &amp; Sessions</span>
				</nav>
				<div class="structure-header-actions" role="group" aria-label="Exam analysis actions">
					<button
						type="button"
						class="btn btn-sm structure-back-btn"
						onclick="closeExamAnalysisView()"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path></svg>
						<span>Back to exams</span>
					</button>
					<button
						type="button"
						class="btn btn-sm btn-outline"
						onclick="openAssignExamQuestions('${exam.id}')"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
						<span>Assign Questions</span>
					</button>
					<button
						type="button"
						class="btn btn-sm btn-outline"
						onclick="editExam('${exam.id}')"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
						<span>Edit Exam</span>
					</button>
				</div>
			</div>

			<div class="page-hero-card">
				<div class="page-hero-main">
					<div class="page-hero-icon icon-violet">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="20" x2="12" y2="10"></line>
							<line x1="18" y1="20" x2="18" y2="4"></line>
							<line x1="6" y1="20" x2="6" y2="16"></line>
						</svg>
					</div>
					<div>
						<h2 class="page-hero-title">Exam Analysis &amp; Sessions</h2>
						<p class="page-hero-subtitle">${examAnalysisEscapeHtml(examTitle)}</p>
					</div>
				</div>
				<div class="class-hero-kpis">
					<div class="hero-kpi-item">
						<span class="hero-kpi-num">${totalQuestions}</span>
						<span class="hero-kpi-label">Questions</span>
					</div>
					<div class="hero-kpi-item">
						<span class="hero-kpi-num">${totalSessions}</span>
						<span class="hero-kpi-label">Student Sessions</span>
					</div>
					<div class="hero-kpi-item">
						<span class="hero-kpi-num">${avgScore}%</span>
						<span class="hero-kpi-label">Average Score</span>
					</div>
				</div>
			</div>

			<div class="eas-tabs-bar">
				<div class="eas-tabs">
					<button type="button" class="eas-tab-btn active" data-eas-tab="accuracy">Per-question accuracy</button>
					<button type="button" class="eas-tab-btn" data-eas-tab="sessions">Students &amp; Sessions</button>
				</div>
			</div>

			<div class="eas-page-body">
				<div class="eas-panel active" data-eas-panel="accuracy">${renderExamAnalysisAccuracyTab(payload)}</div>
				<div class="eas-panel" data-eas-panel="sessions">${renderExamAnalysisStudentsTab(payload)}</div>
			</div>
		`;

		document.addEventListener('keydown', onExamAnalysisKeyDown);

		analysisPane.querySelectorAll('.eas-tab-btn').forEach((tab) => {
			tab.addEventListener('click', () => {
				analysisPane.querySelectorAll('.eas-tab-btn').forEach((t) =>
					t.classList.toggle('active', t === tab),
				);
				const name = tab.getAttribute('data-eas-tab');
				analysisPane.querySelectorAll('.eas-panel').forEach((panel) =>
					panel.classList.toggle(
						'active',
						panel.getAttribute('data-eas-panel') === name,
					),
				);
			});
		});

		analysisPane.querySelectorAll('.eas-q-row').forEach((row) => {
			row.addEventListener('click', () => {
				const idx = row.getAttribute('data-eas-toggle');
				const detail = analysisPane.querySelector(`.eas-detail-row[data-eas-detail="${idx}"]`);
				if (!detail) return;
				const hidden = detail.style.display === 'none';
				detail.style.display = hidden ? '' : 'none';
			});
		});

		analysisPane.querySelectorAll('.eas-student-link').forEach((link) => {
			link.addEventListener('click', (event) => {
				event.stopPropagation();
				window.openExamAnalysisStudentProfile(link.getAttribute('data-eas-student-key'));
			});
		});

		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}

	// Legacy fallback modal if pane doesn't exist
	const modal = document.createElement('div');
	modal.className = 'exam-analysis-modal';
	modal.setAttribute('role', 'dialog');
	modal.setAttribute('aria-modal', 'true');
	modal.setAttribute('aria-hidden', 'false');
	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
	modal.innerHTML = `
		<div class="modal-content">
			<div class="modal-header">
				<div class="modal-header-with-icon">
					<div class="modal-header-icon icon-violet">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<line x1="12" y1="20" x2="12" y2="10"></line>
							<line x1="18" y1="20" x2="18" y2="4"></line>
							<line x1="6" y1="20" x2="6" y2="16"></line>
						</svg>
					</div>
					<div class="modal-header-text">
						<h2>Exam Analysis &amp; Sessions</h2>
						<p class="modal-header-subtitle eas-subtitle">${examAnalysisEscapeHtml(exam.name || exam.title || 'Exam')}</p>
					</div>
				</div>
				<button class="close-btn" aria-label="Close">&times;</button>
			</div>
			<div class="eas-tabs">
				<button type="button" class="eas-tab-btn active" data-eas-tab="accuracy">Per-question accuracy</button>
				<button type="button" class="eas-tab-btn" data-eas-tab="sessions">Students</button>
			</div>
			<div class="modal-body eas-body">
				<div class="eas-panel active" data-eas-panel="accuracy">${renderExamAnalysisAccuracyTab(payload)}</div>
				<div class="eas-panel" data-eas-panel="sessions">${renderExamAnalysisStudentsTab(payload)}</div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary eas-close-btn">Close</button>
			</div>
		</div>`;

	document.body.appendChild(modal);

	const close = () => {
		modal.remove();
		document.documentElement.classList.remove('modal-open');
		document.body.classList.remove('modal-open');
		document.removeEventListener('keydown', onKeyDown);
	};
	const onKeyDown = (e) => {
		if (e.key === 'Escape') close();
	};
	document.addEventListener('keydown', onKeyDown);

	modal.querySelector('.close-btn').addEventListener('click', close);
	modal.querySelector('.eas-close-btn').addEventListener('click', close);
	modal.addEventListener('click', (e) => {
		if (e.target === modal) close();
	});
	modal.querySelectorAll('.eas-tab-btn').forEach((tab) => {
		tab.addEventListener('click', () => {
			modal.querySelectorAll('.eas-tab-btn').forEach((t) =>
				t.classList.toggle('active', t === tab),
			);
			const name = tab.getAttribute('data-eas-tab');
			modal.querySelectorAll('.eas-panel').forEach((panel) =>
				panel.classList.toggle(
					'active',
					panel.getAttribute('data-eas-panel') === name,
				),
			);
		});
	});
	modal.querySelectorAll('.eas-q-row').forEach((row) => {
		row.addEventListener('click', () => {
			const idx = row.getAttribute('data-eas-toggle');
			const detail = modal.querySelector(`.eas-detail-row[data-eas-detail="${idx}"]`);
			if (!detail) return;
			const hidden = detail.style.display === 'none';
			detail.style.display = hidden ? '' : 'none';
		});
	});
	modal.querySelectorAll('.eas-student-link').forEach((link) => {
		link.addEventListener('click', (event) => {
			event.stopPropagation();
			close();
			window.openExamAnalysisStudentProfile(link.getAttribute('data-eas-student-key'));
		});
	});
}

/**
 * Open the Results-tab student profile for a `u:<id>` key.
 *
 * The profile lives in the Results tab, so we switch tabs first (which reloads
 * the results and repopulates the profile list) and only then open it — the
 * same pattern as `openExamFromProfile` in results-management.js.
 *
 * The Results tab is split into an analytics pane and a manage pane for
 * teachers, and the profile lives in the manage pane. `openTab` alone would
 * land the teacher on the analytics view (the intervention list) and leave the
 * profile invisible behind it, so the manage view is requested explicitly.
 */
function openExamAnalysisStudentProfile(key) {
	if (!key) return;
	const open = () => {
		try {
			if (typeof window.openResultsManageTab === 'function') {
				window.openResultsManageTab();
			} else if (typeof window.showResultsManageView === 'function') {
				window.showResultsManageView();
			}
		} catch (_) {
			/* the analytics module is optional */
		}
		if (typeof window.openStudentProfileByKey === 'function') {
			window.openStudentProfileByKey(key);
		} else if (window.showToast) {
			window.showToast('Student profile unavailable.', 'error');
		}
	};
	if (typeof window.openTab === 'function') {
		// Switching tabs re-runs loadResults(), which repopulates the profile
		// list — open the profile only once that has settled.
		window.openTab({}, 'results');
		setTimeout(open, 80);
		return;
	}
	open();
}

window.openExamAnalysisStudentProfile = openExamAnalysisStudentProfile;
window.openExamAnalysis = openExamAnalysis;
window.closeExamAnalysisView = closeExamAnalysisView;
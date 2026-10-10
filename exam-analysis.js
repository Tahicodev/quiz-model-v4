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

/** Resolve one exam.questions entry to the full question object. */
function resolveExamAnalysisQuestionEntry(entry, allQuestions) {
	if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
		const hasPayload =
			entry.question ||
			entry.text ||
			Array.isArray(entry.options) ||
			Array.isArray(entry.optionData);
		if (hasPayload) return { ...entry, id: String(entry.id ?? entry.questionId ?? entry.uuid ?? '') };

		const index = Number.parseInt(entry.questionIndex ?? entry.index ?? '', 10);
		if (Number.isInteger(index) && allQuestions[index]) {
			return { ...allQuestions[index], ...entry };
		}

		const id = String(entry.id ?? entry.questionId ?? entry.uuid ?? '').trim();
		if (id) {
			const byId = allQuestions.find((q) => {
				if (!q || typeof q !== 'object') return false;
				return String(q.id ?? q.questionId ?? q.uuid ?? '').trim() === id;
			});
			if (byId) return { ...byId, ...entry };
		}
		return null;
	}

	const numericRef =
		typeof entry === 'number'
			? entry
			: Number.parseInt(String(entry ?? '').trim(), 10);
	if (Number.isInteger(numericRef) && allQuestions[numericRef]) {
		return { ...allQuestions[numericRef] };
	}

	const idRef = String(entry ?? '').trim();
	if (!idRef) return null;
	const byId = allQuestions.find((q) => {
		if (!q || typeof q !== 'object') return false;
		return String(q.id ?? q.questionId ?? q.uuid ?? '').trim() === idRef;
	});
	return byId ? { ...byId } : null;
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

/** Normalize an answer value for comparison (strings, numbers, arrays, JSON). */
function normalizeExamAnalysisAnswer(value) {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value === 'string') {
		const trimmed = value.trim();
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

function examAnalysisAnswersEqual(userAnswer, correctAnswer) {
	const a = normalizeExamAnalysisAnswer(userAnswer);
	const b = normalizeExamAnalysisAnswer(correctAnswer);
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
	return { name, numero, class: klass, user };
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

	const questions = (Array.isArray(exam.questions) ? exam.questions : [])
		.map((entry) => resolveExamAnalysisQuestionEntry(entry, allQuestions))
		.filter((q) => q && q.id);

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

	const perQuestion = questions.map((q) => {
		const correctStudents = [];
		const wrongStudents = [];
		let attempts = 0;
		let correct = 0;
		results.forEach((result) => {
			const answers = examAnalysisParseJson(result.answers_json, {});
			if (!answers || typeof answers !== 'object' || !(q.id in answers)) {
				return;
			}
			attempts += 1;
			const student = examAnalysisStudent(result, users);
			const fmtStudent = student.numero
				? `${student.numero} · ${student.name}`
				: student.name;
			if (examAnalysisAnswersEqual(answers[q.id], q.answer)) {
				correct += 1;
				correctStudents.push(fmtStudent);
			} else {
				wrongStudents.push(fmtStudent);
			}
		});
		const accuracy = attempts ? Math.round((correct / attempts) * 100) : null;
		return {
			question: q,
			category: examAnalysisCategoryName(q, categories),
			points: examAnalysisQuestionPoints(q),
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
		const answers = examAnalysisParseJson(result.answers_json, {});
		const answeredCount = answers && typeof answers === 'object' ? Object.keys(answers).length : 0;
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
		const passed = Number(r.grade) > 10;
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
		const correctList = entry.correctStudents.length
			? `<div class="eas-people eas-people-correct"><span class="eas-people-title">Correct (${entry.correctStudents.length})</span><div class="eas-people-list">${entry.correctStudents.map(examAnalysisEscapeHtml).join(', ')}</div></div>`
			: '';
		const wrongList = entry.wrongStudents.length
			? `<div class="eas-people eas-people-wrong"><span class="eas-people-title">Wrong (${entry.wrongStudents.length})</span><div class="eas-people-list">${entry.wrongStudents.map(examAnalysisEscapeHtml).join(', ')}</div></div>`
			: '';
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
			<div class="eas-hint">Click a question row to see which students answered correctly / incorrectly.</div>
		</div>`;
}

function openExamAnalysis(examId) {
	const exams = getExamAnalysisRows('exams') || [];
	const exam = exams.find((e) => String(e.id) === String(examId));
	if (!exam) {
		if (window.showToast) showToast('Exam not found', 'error');
		return;
	}

	const payload = buildExamAnalysis(exam);

	const modal = document.createElement('div');
	modal.className = 'exam-analysis-modal';
	modal.innerHTML = `
		<div class="modal-content">
			<div class="modal-header">
				<div>
					<h2>Exam Analysis &amp; Sessions</h2>
					<p class="eas-subtitle">${examAnalysisEscapeHtml(exam.name || exam.title || 'Exam')}</p>
				</div>
				<button class="close-btn" aria-label="Close">✕</button>
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

	const close = () => modal.remove();

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
}

window.openExamAnalysis = openExamAnalysis;
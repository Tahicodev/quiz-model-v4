/**
 * src/backend/utils/studentQuestionView.js
 *
 * Student-safe question view helper. The legacy bootstrap route defines the
 * same decode/strip pipeline inline (bootstrap.routes.js); the course lesson
 * practice endpoint serves questions through that exact contract without
 * touching bootstrap: metadata encoded in `answer` (`multi::` / `meta::`
 * prefixes) is restored, then `answer` and `explanation` are stripped —
 * student browsers never hold correct answers (server grading via
 * POST /results + /results/:id/corrections is authoritative).
 */

function parseJson(value, fallback) {
	if (value == null) return fallback;
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

/** Restore legacy flags encoded inside the `answer` string. */
export function decodeQuestionMetadata(question) {
	const rawAnswer = String(question.answer ?? '');

	if (rawAnswer.startsWith('multi::')) {
		const tokens = rawAnswer
			.slice('multi::'.length)
			.split('|')
			.map((t) => t.trim())
			.filter(Boolean);
		return { ...question, allowMultipleAnswers: true, answer: tokens.join(',') };
	}

	if (rawAnswer.startsWith('meta::')) {
		const rest = rawAnswer.slice('meta::'.length);
		const separatorIndex = rest.indexOf('::');
		if (separatorIndex > 0) {
			const encoded = rest.slice(0, separatorIndex);
			const payload = rest.slice(separatorIndex + 2);
			try {
				const meta = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
				const decoded = { ...question, answer: payload };
				if (meta.multi) decoded.allowMultipleAnswers = true;
				if (meta.drag) decoded.isDraggable = true;
				if (meta.odd) decoded.oddOneOut = true;
				if (meta.matchShuffle === false) decoded.shufflePairs = false;
				if (meta.code) {
					decoded.codeSnippet = meta.code.snippet || '';
					decoded.codeLanguage = meta.code.language || 'javascript';
					decoded.codeAnswerMode = meta.code.mode || 'multiple-choice';
					decoded.type = 'code';
				}
				return decoded;
			} catch {
				// Undecodable meta blob: fall through with the raw row.
			}
		}
	}

	if (rawAnswer && !question.allowMultipleAnswers) {
		// Multi-answer heuristic for rows whose flag was lost by an older
		// write path (comma-joined answer whose tokens all match options).
		const options = parseJson(question.options_json, []);
		if (Array.isArray(options) && options.length) {
			const tokens = rawAnswer.split(',').map((t) => t.trim()).filter(Boolean);
			if (
				tokens.length > 1 &&
				tokens.every((t) =>
					options.some((o) => String(o || '').trim().toLowerCase() === t.toLowerCase()),
				)
			) {
				return { ...question, allowMultipleAnswers: true };
			}
		}
	}

	return question;
}

/**
 * Full student practice view: decoded metadata + legacy `question`/`options`
 * fields (what the training runner renders) minus `answer`/`explanation`.
 */
export function toStudentPracticeView(question) {
	const decoded = decodeQuestionMetadata(question);
	const {
		answer,
		explanation,
		school_id,
		created_by,
		options_json,
		...rest
	} = decoded;
	return {
		...rest,
		question: decoded.question || decoded.text,
		options: parseJson(decoded.options_json, decoded.options || []),
	};
}

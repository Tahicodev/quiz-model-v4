/**
 * game-server.js Server-Authoritative Game Engine
 *
 * All game mutations (join, answer, playCard, etc.) go through the server.
 * Clients emit *intentions*; the server validates, applies, and broadcasts state.
 *
 * The canonical game state lives in-memory (`activeGames` Map).
 * localStorage on clients is used only for persistence/cache never as source of truth for live games.
 */

'use strict';

function generateId(prefix = 'id') {
	return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function nowIso() {
	return new Date().toISOString();
}

function shuffleArray(list) {
	const arr = Array.isArray(list) ? [...list] : [];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function generateMathChallenge(operators, min, max) {
	const ops = Array.isArray(operators) && operators.length ? operators : ['+'];
	const op = ops[Math.floor(Math.random() * ops.length)];
	const minVal = Number.isFinite(min) ? min : 1;
	const maxVal = Number.isFinite(max) ? max : 12;
	const a = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
	const b = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
	let answer = 0;
	if (op === '+') answer = a + b;
	if (op === '-') answer = a - b;
	if (op === '*') answer = a * b;
	return { question: `${a} ${op} ${b} = ?`, answer: String(answer) };
}

function answerMatch(given, expected) {
	return (
		String(given || '')
			.trim()
			.toLowerCase() ===
		String(expected || '')
			.trim()
			.toLowerCase()
	);
}

function normalizeAnswerToken(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

function normalizeQuestionAnswerPreview(value) {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) {
		return value
			.map((entry) => normalizeQuestionAnswerPreview(entry))
			.filter(Boolean)
			.join(' | ');
	}
	if (typeof value === 'object') {
		const knownFields = [
			'value',
			'text',
			'label',
			'answer',
			'correctAnswer',
			'expected',
		];
		for (const field of knownFields) {
			const normalized = normalizeQuestionAnswerPreview(value?.[field]);
			if (normalized) return normalized;
		}
		try {
			const serialized = JSON.stringify(value);
			return serialized && serialized !== '{}' ? serialized : '';
		} catch (e) {
			return '';
		}
	}
	return String(value).trim();
}

function hasMeaningfulExpectedAnswer(value) {
	if (value === null || value === undefined) return false;
	if (typeof value === 'boolean') return false;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value === 'string') return Boolean(value.trim());
	if (Array.isArray(value)) {
		return value.some((entry) => hasMeaningfulExpectedAnswer(entry));
	}
	if (typeof value === 'object') {
		return Object.keys(value).length > 0;
	}
	return false;
}

function normalizeImageOptionToken(value) {
	const normalized = normalizeAnswerToken(
		String(value || '').replace(/[_-]+/g, ' '),
	);
	const imageMatch = normalized.match(/^(?:image|img)\s*(\d+)$/i);
	if (!imageMatch) return normalized;
	return `image ${imageMatch[1]}`;
}

function isLikelyQuestionResponseEntry(entry) {
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
	const hasOptionFields =
		Object.prototype.hasOwnProperty.call(entry, 'text') ||
		Object.prototype.hasOwnProperty.call(entry, 'label') ||
		Object.prototype.hasOwnProperty.call(entry, 'value') ||
		Object.prototype.hasOwnProperty.call(entry, 'option') ||
		Object.prototype.hasOwnProperty.call(entry, 'choice') ||
		Object.prototype.hasOwnProperty.call(entry, 'image');
	if (hasOptionFields) return false;
	return (
		Object.prototype.hasOwnProperty.call(entry, 'userId') ||
		Object.prototype.hasOwnProperty.call(entry, 'answeredAt') ||
		Object.prototype.hasOwnProperty.call(entry, 'turnStartedAt')
	);
}

function findQuestionOptionTextByToken(optionPool = [], rawToken) {
	const token = String(rawToken || '').trim();
	if (!token || !Array.isArray(optionPool) || !optionPool.length) return '';
	const normalizedToken = normalizeImageOptionToken(token);
	const directToken = normalizeAnswerToken(token);
	return (
		optionPool.find((option, index) => {
			const optionText = String(option || '').trim();
			if (!optionText) return false;
			if (normalizeImageOptionToken(optionText) === normalizedToken) {
				return true;
			}
			return (
				directToken === normalizeAnswerToken(optionText) ||
				normalizedToken === `image ${index + 1}`
			);
		}) || ''
	);
}

function mapAnswerTokenToOptionText(rawToken, optionPool = []) {
	const token = String(rawToken || '').trim();
	if (!token) return '';
	if (!Array.isArray(optionPool) || !optionPool.length) return token;

	const numeric = Number.parseInt(token, 10);
	if (
		Number.isFinite(numeric) &&
		String(numeric) === token &&
		numeric >= 1 &&
		numeric <= optionPool.length
	) {
		return String(optionPool[numeric - 1] || token).trim() || token;
	}

	const imageTokenMatch = token.match(/^img_(\d+)$/i);
	if (imageTokenMatch) {
		const imageIndex = Number.parseInt(imageTokenMatch[1], 10);
		if (
			Number.isFinite(imageIndex) &&
			imageIndex >= 0 &&
			imageIndex < optionPool.length
		) {
			return String(optionPool[imageIndex] || token).trim() || token;
		}
		if (
			Number.isFinite(imageIndex) &&
			imageIndex > 0 &&
			imageIndex <= optionPool.length
		) {
			return String(optionPool[imageIndex - 1] || token).trim() || token;
		}
	}

	const letterMatch = token.match(/^[A-H]$/i);
	if (letterMatch) {
		const optionIndex =
			letterMatch[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
		if (optionIndex >= 0 && optionIndex < optionPool.length) {
			return String(optionPool[optionIndex] || token).trim() || token;
		}
	}

	return findQuestionOptionTextByToken(optionPool, token) || token;
}

function splitChoiceAnswerTokensFlexible(value) {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) {
		return value.flatMap((entry) => splitChoiceAnswerTokensFlexible(entry));
	}
	if (value && typeof value === 'object') {
		if (parseMatchingPairsAnswer(value).length) return [];
		if (Object.keys(parseFillBlankAnswer(value)).length) return [];
		const normalized = normalizeQuestionAnswerPreview(value);
		if (!normalized || normalized === '{}' || normalized === '[]') return [];
		return splitAnswerTokens(normalized, /[|,]/);
	}
	return splitAnswerTokens(value, /[|,]/);
}

function extractCorrectOptionTexts(question) {
	const rawCollections = [
		question?.optionData,
		question?.options,
		question?.choices,
		question?.answers,
		question?.answerOptions,
	];
	const correctChoices = [];
	rawCollections.forEach((collection) => {
		if (!Array.isArray(collection)) return;
		collection.forEach((entry, index) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
			if (isLikelyQuestionResponseEntry(entry)) return;
			const isCorrect =
				Boolean(entry.isCorrect) ||
				Boolean(entry.correct) ||
				String(entry.status || '').toLowerCase() === 'correct';
			if (!isCorrect) return;
			const text = String(
				entry.text ??
					entry.label ??
					entry.value ??
					entry.option ??
					entry.choice ??
					entry.answer ??
					entry.content ??
					entry.title ??
					entry.name ??
					'',
			).trim();
			const imageLabel = String(
				entry.number ?? entry.imageNumber ?? index + 1,
			).trim();
			const resolved = text || `Image ${imageLabel}`;
			if (resolved) correctChoices.push(resolved);
		});
	});
	return Array.from(new Set(correctChoices.filter(Boolean)));
}

function getExpectedAnswerValue(question) {
	const directCandidates = [
		question?.answer,
		question?.correctAnswer,
		question?.correctAnswers,
		question?.expectedAnswer,
		question?.solution,
		question?.correct,
	];
	for (const candidate of directCandidates) {
		if (hasMeaningfulExpectedAnswer(candidate)) return candidate;
	}
	const correctChoices = extractCorrectOptionTexts(question);
	if (correctChoices.length === 1) return correctChoices[0];
	if (correctChoices.length > 1) return correctChoices.join(',');
	return '';
}

function splitOptionTextLegacy(value, answer = '') {
	const raw = String(value || '')
		.replace(/\r/g, '')
		.trim();
	if (!raw) return [];

	const splitBy = (regex) =>
		raw
			.split(regex)
			.map((item) => String(item || '').trim())
			.filter(Boolean);

	const hardDelimiters = [
		/\n+/,
		/\|+/,
		/;+/,
		/[ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ¢ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ·ط·آ¢ط¢آ·ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ·ط·آ¢ط¢آ¢ط·آ·ط¢آ¢ط·آ¢ط¢آ·]+/,
	];
	for (const delimiter of hardDelimiters) {
		const parts = splitBy(delimiter);
		if (parts.length > 1) return parts;
	}

	if (raw.includes(',')) {
		const commaParts = splitBy(/,+/);
		const normalizedAnswer = normalizeAnswerToken(answer);
		const includesFullAnswer =
			normalizedAnswer &&
			commaParts.some(
				(part) => normalizeAnswerToken(part) === normalizedAnswer,
			);
		const safeCommaList =
			commaParts.length >= 2 &&
			commaParts.length <= 8 &&
			commaParts.every((part) => part.length <= 96);
		if (
			safeCommaList &&
			(!String(answer || '').includes(',') || includesFullAnswer)
		) {
			return commaParts;
		}
	}

	const camelParts = splitBy(/(?<=[a-z0-9])(?=[A-Z])/);
	if (camelParts.length > 1) {
		const normalizedAnswer = normalizeAnswerToken(answer);
		if (
			!normalizedAnswer ||
			camelParts.some((part) => normalizeAnswerToken(part) === normalizedAnswer)
		) {
			return camelParts;
		}
	}

	return [normalizeOptionCandidate(raw)];
}

function splitOptionText(value, answer = '') {
	const raw = String(value || '')
		.replace(/\r/g, '')
		.trim();
	if (!raw) return [];

	const parsedCollection = parseOptionCollectionString(raw);
	if (parsedCollection.length > 1) return parsedCollection;

	const splitBy = (regex) =>
		raw
			.split(regex)
			.map((item) => String(item || '').trim())
			.filter(Boolean);

	const hardDelimiters = [/\n+/, /\|+/, /;+/, /[\u2022\u00b7]+/];
	for (const delimiter of hardDelimiters) {
		const parts = splitBy(delimiter);
		if (parts.length > 1) return parts;
	}

	const markerPattern = /(?:^|\s)(?:[A-Ha-h]|\d{1,2})[.)]\s+/g;
	const markerCount = (raw.match(markerPattern) || []).length;
	if (markerCount >= 2) {
		const markerParts = raw
			.split(/(?:^|\s)(?:[A-Ha-h]|\d{1,2})[.)]\s+/)
			.map((item) => normalizeOptionCandidate(item))
			.filter(Boolean);
		if (markerParts.length > 1) return markerParts;
	}

	if (raw.includes(',')) {
		const commaParts = splitBy(/,+/);
		const normalizedAnswer = normalizeAnswerToken(answer);
		const answerTokens = splitAnswerTokens(answer, /[|,]/).map((item) =>
			normalizeAnswerToken(item),
		);
		const includesFullAnswer =
			normalizedAnswer &&
			commaParts.some(
				(part) => normalizeAnswerToken(part) === normalizedAnswer,
			);
		const includesAllAnswerTokens =
			answerTokens.length > 1 &&
			answerTokens.every((token) =>
				commaParts.some((part) => normalizeAnswerToken(part) === token),
			);
		const safeCommaList =
			commaParts.length >= 2 &&
			commaParts.length <= 8 &&
			commaParts.every((part) => part.length <= 96);
		const answerHasComma = String(answer || '').includes(',');
		const canSplitComma =
			safeCommaList &&
			(!answerHasComma || includesFullAnswer || includesAllAnswerTokens);
		if (canSplitComma) {
			return commaParts;
		}
	}

	const camelParts = splitBy(/(?<=[a-z0-9])(?=[A-Z])/);
	if (camelParts.length > 1) {
		const normalizedAnswer = normalizeAnswerToken(answer);
		if (
			!normalizedAnswer ||
			camelParts.some((part) => normalizeAnswerToken(part) === normalizedAnswer)
		) {
			return camelParts;
		}
	}

	return [normalizeOptionCandidate(raw)];
}

function splitAnswerTokens(value, delimiterRegex = /[|,]/) {
	if (Array.isArray(value)) {
		return value.map((item) => String(item || '').trim()).filter(Boolean);
	}
	const raw = String(value || '').trim();
	if (!raw) return [];
	if (
		(raw.startsWith('[') && raw.endsWith(']')) ||
		(raw.startsWith('{') && raw.endsWith('}'))
	) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed.map((item) => String(item || '').trim()).filter(Boolean);
			}
		} catch (e) {}
	}
	return raw
		.split(delimiterRegex)
		.map((item) => item.trim())
		.filter(Boolean);
}

function normalizeOptionCandidate(value) {
	let text = String(value || '')
		.replace(/\r/g, '')
		.trim();
	if (!text) return '';
	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("'") && text.endsWith("'")) ||
		(text.startsWith('`') && text.endsWith('`'))
	) {
		text = text.slice(1, -1).trim();
	}
	return text;
}

function parseOptionCollectionString(value) {
	const raw = String(value || '').trim();
	if (!raw) return [];
	if (
		!(
			(raw.startsWith('[') && raw.endsWith(']')) ||
			(raw.startsWith('{') && raw.endsWith('}'))
		)
	) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw);
		let collection = [];
		if (Array.isArray(parsed)) {
			collection = parsed;
		} else if (parsed && typeof parsed === 'object') {
			collection = Array.isArray(parsed.options)
				? parsed.options
				: Array.isArray(parsed.choices)
					? parsed.choices
					: Array.isArray(parsed.items)
						? parsed.items
						: [];
		}
		return collection
			.map((entry) => {
				if (entry && typeof entry === 'object') {
					return normalizeOptionCandidate(
						entry.text ??
							entry.label ??
							entry.value ??
							entry.option ??
							entry.choice ??
							'',
					);
				}
				return normalizeOptionCandidate(entry);
			})
			.filter(Boolean);
	} catch (e) {
		return [];
	}
}

function parseMatchingPairToken(token) {
	const raw = normalizeOptionCandidate(token);
	if (!raw) return null;

	const splitBySeparator = (separatorRegex) => {
		const parts = raw
			.split(separatorRegex)
			.map((item) => normalizeOptionCandidate(item))
			.filter(Boolean);
		if (parts.length !== 2) return null;
		return { left: parts[0], right: parts[1] };
	};

	const regexSeparators = [
		/\s*-->\s*/,
		/\s*->\s*/,
		/\s*=>\s*/,
		/\s*\u2192\s*/,
		/\s*::\s*/,
		/\s*=\s*/,
	];
	for (const separatorRegex of regexSeparators) {
		const pair = splitBySeparator(separatorRegex);
		if (pair) return pair;
	}

	const colonPair = splitBySeparator(/\s*:\s*/);
	if (colonPair) return colonPair;

	const dashPair = splitBySeparator(/\s-\s/);
	if (dashPair) return dashPair;

	return null;
}

function parseMatchingPairObject(entry) {
	if (!entry || typeof entry !== 'object') return null;
	if (Array.isArray(entry)) {
		if (entry.length < 2) return null;
		const left = normalizeOptionCandidate(entry[0]);
		const right = normalizeOptionCandidate(entry[1]);
		if (!left || !right) return null;
		return { left, right };
	}

	const left = normalizeOptionCandidate(
		entry.left ??
			entry.term ??
			entry.key ??
			entry.source ??
			entry.prompt ??
			entry.item1 ??
			entry.a ??
			'',
	);
	const right = normalizeOptionCandidate(
		entry.right ??
			entry.definition ??
			entry.value ??
			entry.target ??
			entry.match ??
			entry.item2 ??
			entry.b ??
			'',
	);
	if (left && right) return { left, right };

	if (typeof entry.text === 'string') {
		return parseMatchingPairToken(entry.text);
	}

	const keys = Object.keys(entry);
	if (keys.length === 2) {
		const inferredLeft = normalizeOptionCandidate(entry[keys[0]]);
		const inferredRight = normalizeOptionCandidate(entry[keys[1]]);
		if (inferredLeft && inferredRight) {
			return { left: inferredLeft, right: inferredRight };
		}
	}

	return null;
}

function dedupeMatchingPairs(pairs) {
	const seen = new Set();
	return (pairs || []).filter((pair) => {
		const key = `${normalizeAnswerToken(pair.left)}=>${normalizeAnswerToken(
			pair.right,
		)}`;
		if (!pair.left || !pair.right || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function parseMatchingPairsAnswer(value) {
	const collected = [];
	const collect = (candidate, depth = 0) => {
		if (candidate === null || candidate === undefined || depth > 4) return;
		if (Array.isArray(candidate)) {
			candidate.forEach((entry) => collect(entry, depth + 1));
			return;
		}
		if (candidate && typeof candidate === 'object') {
			const directPair = parseMatchingPairObject(candidate);
			if (directPair) {
				collected.push(directPair);
				return;
			}
			const nestedKeys = [
				'pairs',
				'pairings',
				'matchingPairs',
				'matches',
				'options',
				'choices',
				'items',
				'data',
			];
			nestedKeys.forEach((key) => {
				if (Object.prototype.hasOwnProperty.call(candidate, key)) {
					collect(candidate[key], depth + 1);
				}
			});
			return;
		}
		const raw = String(candidate || '').trim();
		if (!raw) return;
		if (
			(raw.startsWith('[') && raw.endsWith(']')) ||
			(raw.startsWith('{') && raw.endsWith('}'))
		) {
			try {
				collect(JSON.parse(raw), depth + 1);
				return;
			} catch (e) {}
		}
		const normalizedRaw = raw.replace(/\r/g, '\n');
		// Support answers formatted as 3 lines: left / arrow / right.
		const flattenedArrowBlocks = normalizedRaw.replace(
			/([^\n|;]+?)\s*\n\s*(?:-->|->|=>|\u2192|::|=)\s*\n\s*([^\n|;]+)/g,
			'$1 -> $2',
		);
		const tokens = flattenedArrowBlocks
			.split(/[\n|;]+/)
			.map((entry) => entry.trim())
			.filter(Boolean);
		const standaloneSeparatorPattern = /^(?:-->|->|=>|\u2192|::|=)$/;
		const lineTokens = normalizedRaw
			.split(/\n+/)
			.map((entry) => entry.trim())
			.filter(Boolean);
		for (let index = 1; index < lineTokens.length - 1; index += 1) {
			if (!standaloneSeparatorPattern.test(lineTokens[index])) continue;
			tokens.push(`${lineTokens[index - 1]} -> ${lineTokens[index + 1]}`);
		}
		if (tokens.length === 1 && raw.includes(',')) {
			raw
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean)
				.forEach((entry) => tokens.push(entry));
		}
		tokens.forEach((token) => {
			const parsed = parseMatchingPairToken(token);
			if (parsed) collected.push(parsed);
		});
	};

	collect(value, 0);
	return dedupeMatchingPairs(collected);
}

function parseFillBlankAnswer(value) {
	const result = {};
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		Object.entries(value).forEach(([blankId, answers]) => {
			const key = String(blankId).trim();
			const normalized = splitAnswerTokens(answers);
			if (key && normalized.length) result[key] = normalized;
		});
		return result;
	}
	const raw = String(value || '').trim();
	if (!raw) return result;
	raw.split('|').forEach((entry) => {
		const token = String(entry || '').trim();
		if (!token) return;
		const separatorIndex = token.indexOf(':');
		if (separatorIndex <= 0) return;
		const blankId = token.slice(0, separatorIndex).trim();
		const answers = splitAnswerTokens(token.slice(separatorIndex + 1), /[,]/);
		if (!blankId || !answers.length) return;
		result[blankId] = answers;
	});
	return result;
}

function getQuestionOptions(question) {
	const options = [];
	const rawAnswer = getExpectedAnswerValue(question);
	const rawSources = [];
	if (Array.isArray(question?.optionData))
		rawSources.push(...question.optionData);
	if (Array.isArray(question?.choices)) {
		rawSources.push(...question.choices);
	} else if (typeof question?.choices === 'string') {
		rawSources.push(question.choices);
	}
	if (Array.isArray(question?.options)) {
		rawSources.push(...question.options);
	} else if (typeof question?.options === 'string') {
		rawSources.push(question.options);
	}
	if (Array.isArray(question?.answers)) {
		rawSources.push(
			...question.answers.filter(
				(entry) => !isLikelyQuestionResponseEntry(entry),
			),
		);
	}
	if (Array.isArray(question?.answerOptions)) {
		rawSources.push(...question.answerOptions);
	}

	rawSources.forEach((entry, index) => {
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			if (isLikelyQuestionResponseEntry(entry)) return;
			const text = String(
				entry.text ??
					entry.label ??
					entry.value ??
					entry.option ??
					entry.choice ??
					entry.answer ??
					entry.content ??
					entry.title ??
					entry.name ??
					entry.statement ??
					'',
			).trim();
			const imageLabel = String(
				entry.number ?? entry.imageNumber ?? index + 1,
			).trim();
			const fallbackLabel =
				entry.image ||
				entry.imageUrl ||
				entry.src ||
				entry.thumbnail ||
				entry.url
					? `Image ${imageLabel}`
					: '';
			const optionText = text || fallbackLabel;
			if (!optionText) return;
			const parts = splitOptionText(optionText, rawAnswer);
			parts.forEach((part) => {
				const normalized = String(part || '').trim();
				if (normalized) options.push(normalized);
			});
			return;
		}
		const rawText = String(entry || '').trim();
		if (!rawText) return;
		const imageTokenMatch = rawText.match(/^img_(\d+)$/i);
		if (imageTokenMatch) {
			const rawIndex = Number.parseInt(imageTokenMatch[1], 10);
			const imageNumber = Number.isFinite(rawIndex) ? rawIndex + 1 : index + 1;
			options.push(`Image ${imageNumber}`);
			return;
		}
		splitOptionText(rawText, rawAnswer).forEach((part) => {
			const normalized = String(part || '').trim();
			if (normalized) options.push(normalized);
		});
	});
	return Array.from(
		new Set(options.map((item) => String(item || '').trim()).filter(Boolean)),
	);
}

function extractMatchingPairs(question) {
	const sources = [
		question?.pairs,
		question?.matchingPairs,
		question?.pairings,
		question?.matches,
		question?.correctAnswer,
		question?.correctAnswers,
		question?.expectedAnswer,
		question?.solution,
		question?.answer,
		question?.answers,
		question?.options,
		question?.choices,
		question?.prompt,
		question?.question,
		question?.text,
		question?.instruction,
	];
	for (const source of sources) {
		const pairs = parseMatchingPairsAnswer(source);
		if (pairs.length) return pairs;
	}

	const optionTexts = getQuestionOptions(question)
		.map((option) => String(option || '').trim())
		.filter(Boolean);
	if (optionTexts.length >= 4 && optionTexts.length % 2 === 0) {
		const sequentialPairs = [];
		for (let index = 0; index < optionTexts.length; index += 2) {
			const left = normalizeOptionCandidate(optionTexts[index]);
			const right = normalizeOptionCandidate(optionTexts[index + 1]);
			if (!left || !right) continue;
			sequentialPairs.push({ left, right });
		}
		return dedupeMatchingPairs(sequentialPairs);
	}

	return [];
}

function canonicalizeQuestionType(value) {
	const raw = String(value || '')
		.trim()
		.toLowerCase()
		.replace(/_/g, '-')
		.replace(/\s+/g, '-');
	if (!raw) return '';
	if (
		raw === 'mcq' ||
		raw === 'qcm' ||
		raw.includes('multiple-choice') ||
		raw.includes('single-choice') ||
		raw.includes('single-answer') ||
		raw.includes('true-false') ||
		raw.includes('multi-choice') ||
		raw.includes('choice')
	) {
		return 'multiple-choice';
	}
	if (raw.includes('match') || raw.includes('pair') || raw.includes('assoc')) {
		return 'matching-pairs';
	}
	if (raw.includes('fill') || raw.includes('blank')) return 'fill-blank';
	if (
		raw.includes('drag') ||
		raw.includes('order') ||
		raw.includes('ordon') ||
		raw.includes('sequence') ||
		raw.includes('rank')
	) {
		return 'draggable';
	}
	if (raw.includes('odd')) return 'odd-one-out';
	return raw;
}

function normalizeQuestionType(question) {
	const raw = canonicalizeQuestionType(
		question?.type || question?.questionType || '',
	);
	const promptText = String(
		question?.text ||
			question?.question ||
			question?.prompt ||
			question?.questionText ||
			question?.title ||
			question?.statement ||
			question?.content ||
			question?.instruction ||
			'',
	)
		.trim()
		.toLowerCase();
	const expectedAnswer = getExpectedAnswerValue(question);
	const answerPreview = normalizeQuestionAnswerPreview(expectedAnswer);
	const options = getQuestionOptions(question);
	const matchingPairs = extractMatchingPairs(question);
	const answerPairs = parseMatchingPairsAnswer(expectedAnswer);
	const hasPromptMatchSignal =
		promptText.includes('match') ||
		promptText.includes('pair') ||
		promptText.includes('assoc');
	const answerTokens = splitChoiceAnswerTokensFlexible(expectedAnswer)
		.map((item) => mapAnswerTokenToOptionText(item, options))
		.map((item) => normalizeAnswerToken(item))
		.filter(Boolean);

	if (
		raw.includes('drag') ||
		raw.includes('order') ||
		raw.includes('ordon') ||
		question?.isDraggable
	) {
		const explicitOrderSignal =
			Boolean(question?.isDraggable) ||
			raw.includes('order') ||
			raw.includes('ordon') ||
			String(answerPreview || '').includes('|');
		const looksLikeChoiceList =
			options.length > 1 &&
			answerTokens.length > 1 &&
			answerTokens.every((token) =>
				options.some(
					(option) =>
						normalizeAnswerToken(option) === normalizeAnswerToken(token),
				),
			);
		if (raw.includes('drag') && !explicitOrderSignal && looksLikeChoiceList) {
			return 'multiple-choice';
		}
		return 'draggable';
	}
	if (raw.includes('matching') || raw.includes('pair')) return 'matching-pairs';
	if (raw.includes('fill') || raw.includes('blank')) return 'fill-blank';
	if (raw.includes('odd')) return 'odd-one-out';
	if (/(\d+\s*:).+/.test(answerPreview) && answerPreview.includes('|'))
		return 'fill-blank';
	if (answerPairs.length >= 2) {
		return 'matching-pairs';
	}
	if (!raw && hasPromptMatchSignal && matchingPairs.length >= 2) {
		return 'matching-pairs';
	}
	if (
		options.length > 1 &&
		answerTokens.length > 1 &&
		answerTokens.every((token) =>
			options.some(
				(option) =>
					normalizeAnswerToken(option) === normalizeAnswerToken(token),
			),
		)
	) {
		if (question?.allowMultipleAnswers) return 'multiple-choice';
		const hasExplicitOrderSignal =
			raw.includes('order') ||
			raw.includes('ordon') ||
			raw.includes('drag') ||
			String(answerPreview || '').includes('|');
		return hasExplicitOrderSignal ? 'draggable' : 'multiple-choice';
	}
	if (raw) return raw;
	return options.length ? 'multiple-choice' : 'text';
}

function inferAllowsMultipleAnswers(question) {
	if (!question || typeof question !== 'object') return false;
	if (question?.allowMultipleAnswers) return true;
	const expected = getExpectedAnswerValue(question);
	const expectedPreview = normalizeQuestionAnswerPreview(expected);
	if (!hasMeaningfulExpectedAnswer(expected) && !expectedPreview) return false;
	const optionPool = getQuestionOptions(question);
	const expectedTokens = splitChoiceAnswerTokensFlexible(expected)
		.map((item) => mapAnswerTokenToOptionText(item, optionPool))
		.map((item) => normalizeAnswerToken(item))
		.filter(Boolean);
	if (expectedTokens.length <= 1) return false;
	if (!optionPool.length) {
		return String(expectedPreview).includes('|');
	}
	const optionTokens = new Set(
		optionPool.map((option) => normalizeAnswerToken(option)).filter(Boolean),
	);
	const answersFitOptions = expectedTokens.every((token) =>
		optionTokens.has(token),
	);
	if (!answersFitOptions) return false;
	return (
		String(expectedPreview).includes('|') ||
		expectedTokens.length < optionTokens.size
	);
}

function answerMatchesQuestion(question, givenAnswer) {
	if (!question) return answerMatch(givenAnswer, '');
	const expected = getExpectedAnswerValue(question);
	const type = normalizeQuestionType(question);
	const optionPool = getQuestionOptions(question);

	if (type === 'draggable') {
		const expectedOrder = splitChoiceAnswerTokensFlexible(expected)
			.map((token) => mapAnswerTokenToOptionText(token, optionPool))
			.filter(Boolean);
		const providedOrder = splitChoiceAnswerTokensFlexible(givenAnswer)
			.map((token) => mapAnswerTokenToOptionText(token, optionPool))
			.filter(Boolean);
		if (
			!expectedOrder.length ||
			expectedOrder.length !== providedOrder.length
		) {
			return false;
		}
		return expectedOrder.every(
			(token, index) =>
				normalizeAnswerToken(token) ===
				normalizeAnswerToken(providedOrder[index]),
		);
	}

	if (type === 'matching-pairs') {
		const expectedPairs = extractMatchingPairs(question);
		const providedPairs = parseMatchingPairsAnswer(givenAnswer);
		if (
			!expectedPairs.length ||
			expectedPairs.length !== providedPairs.length
		) {
			return false;
		}
		const expectedSet = new Set(
			expectedPairs.map(
				(pair) =>
					`${normalizeAnswerToken(pair.left)}=>${normalizeAnswerToken(pair.right)}`,
			),
		);
		const providedSet = new Set(
			providedPairs.map(
				(pair) =>
					`${normalizeAnswerToken(pair.left)}=>${normalizeAnswerToken(pair.right)}`,
			),
		);
		if (expectedSet.size !== providedSet.size) return false;
		for (const pair of expectedSet) {
			if (!providedSet.has(pair)) return false;
		}
		return true;
	}

	if (type === 'fill-blank') {
		const expectedMap = parseFillBlankAnswer(expected);
		const providedMap = parseFillBlankAnswer(givenAnswer);
		const blankIds = Object.keys(expectedMap);
		if (!blankIds.length) {
			return answerMatch(givenAnswer, normalizeQuestionAnswerPreview(expected));
		}
		return blankIds.every((blankId) => {
			const expectedAnswers = expectedMap[blankId] || [];
			const providedValue = normalizeAnswerToken(
				Array.isArray(providedMap[blankId])
					? providedMap[blankId][0]
					: providedMap[blankId],
			);
			if (!providedValue) return false;
			return expectedAnswers.some(
				(answer) => normalizeAnswerToken(answer) === providedValue,
			);
		});
	}

	if (type === 'multiple-choice') {
		const optionTokens = new Set(
			optionPool.map((option) => normalizeAnswerToken(option)).filter(Boolean),
		);
		const expectedTokens = splitChoiceAnswerTokensFlexible(expected)
			.map((item) => mapAnswerTokenToOptionText(item, optionPool))
			.map((item) => normalizeAnswerToken(item))
			.filter(Boolean);
		const answersFitOptions =
			expectedTokens.length > 1 &&
			expectedTokens.every((token) => optionTokens.has(token));
		const hasExplicitMultiSignal =
			Boolean(question?.allowMultipleAnswers) ||
			String(normalizeQuestionAnswerPreview(expected) || '').includes('|');
		const treatAsMulti =
			answersFitOptions &&
			(hasExplicitMultiSignal || expectedTokens.length < optionTokens.size);
		if (treatAsMulti) {
			const expectedSet = new Set(expectedTokens);
			const providedSet = new Set(
				splitChoiceAnswerTokensFlexible(givenAnswer)
					.map((item) => mapAnswerTokenToOptionText(item, optionPool))
					.map((item) => normalizeAnswerToken(item)),
			);
			if (expectedSet.size !== providedSet.size) return false;
			for (const token of expectedSet) {
				if (!providedSet.has(token)) return false;
			}
			return true;
		}
		if (expectedTokens.length === 1) {
			const providedToken = normalizeAnswerToken(
				mapAnswerTokenToOptionText(givenAnswer, optionPool),
			);
			return Boolean(providedToken && providedToken === expectedTokens[0]);
		}
	}

	return answerMatch(
		mapAnswerTokenToOptionText(givenAnswer, optionPool),
		mapAnswerTokenToOptionText(
			normalizeQuestionAnswerPreview(expected),
			optionPool,
		),
	);
}

function allHandsEmpty(hands) {
	if (!hands) return true;
	return Object.values(hands).every((h) => !h || h.length === 0);
}

function toPositiveNumber(value, fallback) {
	const direct = Number(value);
	if (Number.isFinite(direct) && direct > 0) return direct;
	const compact = String(value ?? '').replace(/[^0-9.]/g, '');
	const parsed = Number(compact);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return fallback;
}

function parseTimestampMs(value) {
	if (value === null || value === undefined || value === '') return 0;
	const numeric = Number(value);
	if (Number.isFinite(numeric) && numeric > 0) {
		return numeric < 1e11 ? numeric * 1000 : numeric;
	}
	const parsed = Date.parse(String(value));
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return 0;
}

function normalizeUserId(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function sameUserId(left, right) {
	const normalizedLeft = normalizeUserId(left);
	const normalizedRight = normalizeUserId(right);
	return Boolean(
		normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
	);
}

function buildPlayerSocketKey(gameId, userId) {
	return `${String(gameId || '').trim()}:${normalizeUserId(userId)}`;
}

const WARMUP_MAX_ATTEMPTS = 5;

function resetWarmupChallenge(game, reason = '') {
	if (!isCardGameType(game?.type)) return false;
	const session = game?.session;
	if (!session) return false;
	const math = generateMathChallenge(
		game.settings?.mathOperators,
		game.settings?.mathMin,
		game.settings?.mathMax,
	);
	const previousRound = Number(session.warmup?.round || 0);
	session.warmup = {
		question: math.question,
		answer: math.answer,
		startedAt: Date.now(),
		answers: [],
		winnerId: '',
		resolved: false,
		attempts: 0,
		maxAttempts: Math.floor(
			toPositiveNumber(game.settings?.warmupMaxAttempts, WARMUP_MAX_ATTEMPTS),
		),
		round: previousRound + 1,
		lastResetReason: String(reason || ''),
	};
	return true;
}

function getTeamName(game, teamId) {
	const names = game.settings?.teamNames || { a: 'Team A', b: 'Team B' };
	return teamId === 'team-b' ? names.b || 'Team B' : names.a || 'Team A';
}

function normalizeLobbyCounter(game) {
	const current = Number(game?.lobbyCounter);
	if (Number.isFinite(current) && current > 0) {
		game.lobbyCounter = Math.floor(current);
	} else {
		game.lobbyCounter = 1;
	}
	return game.lobbyCounter;
}

function ensureLobbyIdentity(game, session) {
	if (!game || !session) return;
	const lobbyCounter = normalizeLobbyCounter(game);
	if (!session.lobbyId) {
		session.lobbyId = `${game.id || 'game'}-lobby-${lobbyCounter}`;
	}
	if (!session.lobbyLabel) {
		session.lobbyLabel = `Lobby #${lobbyCounter}`;
	}
}

function archiveCurrentLobby(game) {
	if (!game) return;
	const session = game.session || {};
	const hasResults = Boolean(game.results && game.results.leaderboard);
	const hasParticipants =
		Array.isArray(session.participants) && session.participants.length;
	if (!hasResults && !hasParticipants) return;
	if (!Array.isArray(game.lobbyHistory)) {
		game.lobbyHistory = [];
	}
	ensureLobbyIdentity(game, session);
	const lobbyId = String(session.lobbyId || `${game.id}-lobby-${Date.now()}`);
	const alreadyArchived = game.lobbyHistory.some(
		(entry) => String(entry.lobbyId || '') === lobbyId,
	);
	if (alreadyArchived) return;
	game.lobbyHistory.push({
		lobbyId,
		lobbyLabel: session.lobbyLabel || `Lobby #${normalizeLobbyCounter(game)}`,
		status: game.status || session.status || 'completed',
		startedAt: session.startedAt || '',
		endedAt: session.endedAt || game.results?.endedAt || '',
		type: game.type,
		mode: game.mode,
		teamNames: game.settings?.teamNames || { a: 'Team A', b: 'Team B' },
		participants: Array.isArray(session.participants)
			? session.participants.map((p) => ({ ...p }))
			: [],
		results: game.results ? JSON.parse(JSON.stringify(game.results)) : null,
		archivedAt: nowIso(),
	});
}

function createFreshLobbySession(game) {
	const nextCounter = normalizeLobbyCounter(game) + 1;
	game.lobbyCounter = nextCounter;
	return {
		status: 'open',
		participants: [],
		startedAt: '',
		endedAt: '',
		lobbyId: `${game.id}-lobby-${nextCounter}`,
		lobbyLabel: `Lobby #${nextCounter}`,
		roundIndex: 0,
		roundHistory: [],
		card: null,
		warmup: null,
		tieBreak: null,
		round: null,
		hotPotato: null,
		lastSurvivor: null,
		sprint: null,
	};
}

function createCurrentLobbySession(game) {
	const counter = normalizeLobbyCounter(game);
	return {
		status: 'open',
		participants: [],
		startedAt: '',
		endedAt: '',
		lobbyId: `${game.id}-lobby-${counter}`,
		lobbyLabel: `Lobby #${counter}`,
		roundIndex: 0,
		roundHistory: [],
		card: null,
		warmup: null,
		tieBreak: null,
		round: null,
		hotPotato: null,
		lastSurvivor: null,
		sprint: null,
	};
}

function isAutoPlayTurnTimeoutEnabled(game) {
	if (!game || !game.settings) return true;
	if (game.settings.autoPlayTurnTimeoutCard !== undefined) {
		return Boolean(game.settings.autoPlayTurnTimeoutCard);
	}
	return Boolean(game.settings?.gameRules?.autoPlayTimeoutCard ?? true);
}

const SPECIAL_CARD_LABELS = {
	mirror: 'Mirror',
	'time-warp': 'Time Warp',
	'double-or-nothing': 'Double or Nothing',
	shield: 'Shield',
	freeze: 'Freeze',
	steal: 'Steal',
	fog: 'Fog',
	'combo-breaker': 'Combo Breaker',
	overclock: 'Overclock',
};

function normalizeSpecialCardId(value) {
	const raw = String(value || '')
		.trim()
		.toLowerCase();
	if (!raw) return '';
	if (raw === 'mirror') return 'mirror';
	if (raw === 'timewarp' || raw === 'time-warp') return 'time-warp';
	if (raw === 'shield') return 'shield';
	if (raw === 'freeze' || raw === 'freeze-card') return 'freeze';
	if (raw === 'steal' || raw === 'steal-card') return 'steal';
	if (raw === 'fog' || raw === 'fog-card') return 'fog';
	if (raw === 'combobreaker' || raw === 'combo-breaker' || raw === 'combo') {
		return 'combo-breaker';
	}
	if (raw === 'overclock' || raw === 'over-clock') return 'overclock';
	if (
		raw === 'doubleornothing' ||
		raw === 'double-or-nothing' ||
		raw === 'double'
	) {
		return 'double-or-nothing';
	}
	return '';
}

function isSpecialCardEnabled(game, specialCardId) {
	const rules = game?.settings?.gameRules || {};
	if (specialCardId === 'mirror') return Boolean(rules.mirrorCard);
	if (specialCardId === 'time-warp') return Boolean(rules.timeWarp);
	if (specialCardId === 'double-or-nothing')
		return Boolean(rules.doubleOrNothing);
	if (specialCardId === 'shield') return Boolean(rules.shieldCard);
	if (specialCardId === 'freeze') return Boolean(rules.freezeCard);
	if (specialCardId === 'steal') return Boolean(rules.stealCard);
	if (specialCardId === 'fog') return Boolean(rules.fogCard);
	if (specialCardId === 'combo-breaker') return Boolean(rules.comboBreakerCard);
	if (specialCardId === 'overclock') return Boolean(rules.overclockCard);
	return false;
}

function getUsedSpecialCardSet(game) {
	const usedList = Array.isArray(game?.session?.card?.usedSpecialCards)
		? game.session.card.usedSpecialCards
		: [];
	return new Set(
		usedList.map((id) => normalizeSpecialCardId(id)).filter(Boolean),
	);
}

function getUnavailableSpecialCardMessage(game, specialCardId) {
	const id = normalizeSpecialCardId(specialCardId);
	if (!id) return '';
	const label = SPECIAL_CARD_LABELS[id] || 'This special card';
	if (!isSpecialCardEnabled(game, id)) {
		return `${label} is not enabled for this lobby.`;
	}
	if (getUsedSpecialCardSet(game).has(id)) {
		return `${label} was already used in this lobby.`;
	}
	return '';
}

function resolvePendingSpecialCard(game, specialCardId) {
	const id = normalizeSpecialCardId(specialCardId);
	if (
		!id ||
		!isSpecialCardEnabled(game, id) ||
		getUsedSpecialCardSet(game).has(id)
	) {
		return {
			id: '',
			label: '',
			timeLimitMs: null,
		};
	}
	const baseTurnLimitMs =
		toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
	let timeLimitMs = null;
	if (id === 'time-warp') {
		timeLimitMs = Math.max(Math.round(baseTurnLimitMs * 0.5), 5000);
	} else if (id === 'freeze') {
		timeLimitMs = Math.max(Math.round(baseTurnLimitMs * 0.35), 3000);
	} else if (id === 'overclock') {
		timeLimitMs = Math.max(Math.round(baseTurnLimitMs * 0.6), 4000);
	}
	return {
		id,
		label: SPECIAL_CARD_LABELS[id] || id,
		timeLimitMs,
	};
}

function getPendingCardTimeLimitMs(game, pendingCard) {
	const explicitLimit = Number(pendingCard?.timeLimitMs);
	if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
		return explicitLimit;
	}
	return toPositiveNumber(game?.settings?.turnTimeLimit, 30) * 1000;
}

function getCardStartValidationError(game) {
	if (!isCardGameType(game?.type)) return '';
	const participantCount = Array.isArray(game?.session?.participants)
		? game.session.participants.length
		: 0;
	const validCardCount = Array.isArray(game?.questions)
		? game.questions.filter((card) => card && card.id).length
		: 0;
	if (participantCount < 2) return 'Need at least 2 participants';
	if (isCardDrawGameType(game?.type)) {
		const answerLimitPerPlayer = 5;
		if (validCardCount < participantCount * answerLimitPerPlayer) {
			return `Not enough cards for this mode. Need at least ${
				participantCount * answerLimitPerPlayer
			} cards (5 per player).`;
		}
		return '';
	}
	if (validCardCount < participantCount) {
		return `Not enough cards for fair distribution. Need at least ${participantCount} cards.`;
	}
	return '';
}

function normalizeCardQuestionId(value) {
	const visited = new Set();
	const unwrap = (candidate, depth = 0) => {
		if (candidate === null || candidate === undefined) return '';
		if (typeof candidate === 'string' || typeof candidate === 'number') {
			return String(candidate).trim();
		}
		if (depth > 4) return '';
		if (typeof candidate !== 'object') return '';
		if (visited.has(candidate)) return '';
		visited.add(candidate);

		const directKeys = [
			'id',
			'questionId',
			'cardId',
			'_id',
			'oid',
			'$oid',
			'value',
			'key',
			'uuid',
		];
		for (const key of directKeys) {
			if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
			const resolved = unwrap(candidate[key], depth + 1);
			if (resolved) return resolved;
		}

		const nestedKeys = ['question', 'card', 'payload', 'data', 'ref'];
		for (const key of nestedKeys) {
			if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
			const resolved = unwrap(candidate[key], depth + 1);
			if (resolved) return resolved;
		}

		if (Array.isArray(candidate)) {
			for (const entry of candidate) {
				const resolved = unwrap(entry, depth + 1);
				if (resolved) return resolved;
			}
		}

		return '';
	};

	return unwrap(value);
}

function sameCardQuestionId(left, right) {
	const normalizedLeft = normalizeCardQuestionId(left).toLowerCase();
	const normalizedRight = normalizeCardQuestionId(right).toLowerCase();
	return Boolean(
		normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
	);
}

function normalizeCardHandList(hand) {
	if (!Array.isArray(hand)) return [];
	const normalized = [];
	const seen = new Set();
	hand.forEach((entry) => {
		const cardId = normalizeCardQuestionId(entry);
		if (!cardId) return;
		const key = cardId.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		normalized.push(cardId);
	});
	return normalized;
}

function normalizeCardSessionState(session) {
	const cardState = session?.card;
	if (!cardState || typeof cardState !== 'object') return;
	if (cardState.hands && typeof cardState.hands === 'object') {
		Object.keys(cardState.hands).forEach((ownerId) => {
			cardState.hands[ownerId] = normalizeCardHandList(
				cardState.hands[ownerId],
			);
		});
	}
	if (Array.isArray(cardState.turnOrder)) {
		cardState.turnOrder = cardState.turnOrder
			.map((entry) => String(entry || '').trim())
			.filter(Boolean);
	}
	if (cardState.pendingCard && typeof cardState.pendingCard === 'object') {
		cardState.pendingCard.questionId = normalizeCardQuestionId(
			cardState.pendingCard.questionId,
		);
		cardState.pendingCard.ownerId = String(
			cardState.pendingCard.ownerId || '',
		).trim();
		cardState.pendingCard.targetId = String(
			cardState.pendingCard.targetId || '',
		).trim();
	}
	if (cardState.lastResult && typeof cardState.lastResult === 'object') {
		cardState.lastResult.questionId = normalizeCardQuestionId(
			cardState.lastResult.questionId,
		);
		cardState.lastResult.ownerId = String(
			cardState.lastResult.ownerId || '',
		).trim();
		cardState.lastResult.targetId = String(
			cardState.lastResult.targetId || '',
		).trim();
	}
	cardState.history = Array.isArray(cardState.history)
		? cardState.history
				.map((entry) => {
					if (!entry || typeof entry !== 'object') return null;
					const questionId = normalizeCardQuestionId(entry.questionId);
					if (!questionId) return null;
					return {
						...entry,
						questionId,
						ownerId: String(entry.ownerId || '').trim(),
						targetId: String(entry.targetId || '').trim(),
					};
				})
				.filter(Boolean)
		: [];
	if (Array.isArray(cardState.unusedCards)) {
		cardState.unusedCards = normalizeCardHandList(cardState.unusedCards);
	}
	cardState.turnMode = String(
		cardState.turnMode || 'owner-plays-target',
	).trim();
	const answerLimit = Number(cardState.answerLimitPerPlayer);
	const usePerPlayerLimit = cardState.turnMode === 'target-picks-opponent';
	cardState.answerLimitPerPlayer =
		Number.isFinite(answerLimit) && answerLimit > 0
			? Math.floor(answerLimit)
			: usePerPlayerLimit
				? 5
				: 0;
	cardState.answersByPlayer =
		cardState.answersByPlayer && typeof cardState.answersByPlayer === 'object'
			? cardState.answersByPlayer
			: {};
	Object.keys(cardState.answersByPlayer).forEach((key) => {
		const value = Number(cardState.answersByPlayer[key]);
		cardState.answersByPlayer[key] =
			Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
	});
}

function getCardAnswerCount(cardState, userId) {
	if (!cardState || !userId) return 0;
	const counts =
		cardState.answersByPlayer && typeof cardState.answersByPlayer === 'object'
			? cardState.answersByPlayer
			: {};
	const direct = Number(counts[userId]);
	if (Number.isFinite(direct) && direct >= 0) return Math.floor(direct);
	const mappedKey = Object.keys(counts).find((key) => sameUserId(key, userId));
	if (!mappedKey) return 0;
	const mapped = Number(counts[mappedKey]);
	return Number.isFinite(mapped) && mapped >= 0 ? Math.floor(mapped) : 0;
}

function setCardAnswerCount(cardState, userId, nextCount) {
	if (!cardState || !userId) return;
	cardState.answersByPlayer =
		cardState.answersByPlayer && typeof cardState.answersByPlayer === 'object'
			? cardState.answersByPlayer
			: {};
	const normalizedCount = Number(nextCount);
	const safeCount =
		Number.isFinite(normalizedCount) && normalizedCount >= 0
			? Math.floor(normalizedCount)
			: 0;
	const directKey = Object.keys(cardState.answersByPlayer).find((key) =>
		sameUserId(key, userId),
	);
	if (directKey) {
		cardState.answersByPlayer[directKey] = safeCount;
		return;
	}
	cardState.answersByPlayer[userId] = safeCount;
}

function getGameStartValidationError(game) {
	if (!game) return 'Game not found';
	const participants = Array.isArray(game?.session?.participants)
		? game.session.participants
		: [];
	if (!participants.length) return 'No participants';
	const totalQuestions = Array.isArray(game?.questions)
		? game.questions.filter((question) => question && question.id).length
		: 0;
	if (totalQuestions < 1) return 'Need at least 1 question to start this game';
	const participantCount = participants.length;
	if (isHotPotatoGameType(game?.type) && participantCount < 2) {
		return 'Need at least 2 participants';
	}
	if (isLastSurvivorGameType(game?.type) && participantCount < 2) {
		return 'Need at least 2 participants';
	}
	if (isSprintRaceGameType(game?.type) && participantCount < 2) {
		return 'Need at least 2 participants';
	}
	return getCardStartValidationError(game);
}

function isTournamentManagedGame(game) {
	const tournamentId = String(game?.tournamentContext?.tournamentId || '').trim();
	return Boolean(tournamentId);
}

function getLobbyExpectedPlayerTarget(game) {
	const configuredTarget = Math.max(
		Number(game?.settings?.expectedPlayers) || 0,
		0,
	);
	const tournamentTarget = Math.max(
		Number(game?.settings?.tournamentExpectedPlayers) || 0,
		0,
	);
	const minimumTarget = isTournamentManagedGame(game) ? 2 : 0;
	return Math.max(configuredTarget, tournamentTarget, minimumTarget);
}

function getTournamentReadyValidationError(game) {
	if (!isTournamentManagedGame(game)) return '';
	const participants = Array.isArray(game?.session?.participants)
		? game.session.participants
		: [];
	const requiredPlayers = Math.max(getLobbyExpectedPlayerTarget(game), 2);
	if (participants.length < requiredPlayers) {
		return `Need ${requiredPlayers} participants in the lobby`;
	}
	const readyCount = participants.filter((participant) => participant?.ready).length;
	if (readyCount < requiredPlayers) {
		return `All ${requiredPlayers} players must mark ready before the match starts`;
	}
	return '';
}

function normalizeGameType(type) {
	const normalized = String(type || '')
		.toLowerCase()
		.trim();
	if (!normalized) return 'race';

	if (
		normalized === 'sprint-race' ||
		normalized === 'sprint race' ||
		(normalized.includes('sprint') && normalized.includes('race'))
	) {
		return 'sprint-race';
	}

	if (
		normalized === 'cards-draw' ||
		normalized === 'card-draw' ||
		normalized === 'card draw' ||
		(normalized.includes('card') && normalized.includes('draw')) ||
		(normalized.includes('card') && normalized.includes('blind'))
	) {
		return 'cards-draw';
	}

	if (
		normalized === 'cards' ||
		normalized === 'card' ||
		normalized.includes('card')
	) {
		return 'cards';
	}

	if (
		normalized === 'hot-potato' ||
		normalized === 'hot potato' ||
		(normalized.includes('hot') && normalized.includes('potato'))
	) {
		return 'hot-potato';
	}

	if (
		normalized === 'last-survivor' ||
		normalized === 'last survivor' ||
		normalized.includes('survivor')
	) {
		return 'last-survivor';
	}

	if (
		normalized === 'race' ||
		normalized.includes('race') ||
		normalized.includes('lightning')
	) {
		return 'race';
	}

	return normalized;
}

function isCardGameType(type) {
	const normalized = normalizeGameType(type);
	return normalized === 'cards' || normalized === 'cards-draw';
}

function isCardDrawGameType(type) {
	return normalizeGameType(type) === 'cards-draw';
}

function isHotPotatoGameType(type) {
	return normalizeGameType(type) === 'hot-potato';
}

function isLastSurvivorGameType(type) {
	return normalizeGameType(type) === 'last-survivor';
}

function isSprintRaceGameType(type) {
	return normalizeGameType(type) === 'sprint-race';
}

function getHotPotatoRules(game) {
	const rules = game?.settings?.gameRules?.hotPotato || {};
	const fallbackQuestionTimer = toPositiveNumber(
		game?.settings?.questionTimeLimit,
		20,
	);
	const fallbackPoints = toPositiveNumber(game?.settings?.pointsCorrect, 10);
	return {
		totalTimerMs: Math.round(
			toPositiveNumber(rules.totalTimer, fallbackQuestionTimer) * 1000,
		),
		turnDurationMs: Math.round(toPositiveNumber(rules.turnDuration, 3) * 1000),
		pointsPerCorrect: Math.round(
			toPositiveNumber(rules.pointsPerCorrect, fallbackPoints),
		),
		autoRotate:
			rules.autoRotate !== undefined ? Boolean(rules.autoRotate) : true,
		showCountdown:
			rules.showCountdown !== undefined ? Boolean(rules.showCountdown) : true,
	};
}

function getLastSurvivorRules(game) {
	const rules = game?.settings?.gameRules?.lastSurvivor || {};
	const fallbackQuestionTimer = toPositiveNumber(
		game?.settings?.questionTimeLimit,
		20,
	);
	return {
		eliminateOnFirstWrong:
			rules.eliminateOnFirstWrong !== undefined
				? Boolean(rules.eliminateOnFirstWrong)
				: true,
		bonusPoints: Math.round(toPositiveNumber(rules.bonusPoints, 50)),
		eliminationTimerMs: Math.round(
			toPositiveNumber(rules.eliminationTimer, fallbackQuestionTimer) * 1000,
		),
		showEliminationReason:
			rules.showEliminationReason !== undefined
				? Boolean(rules.showEliminationReason)
				: true,
	};
}

function getRaceRoundResolutionMeta(game, session) {
	const baseTimeLimitMs =
		toPositiveNumber(game?.settings?.questionTimeLimit, 20) * 1000;
	const totalQuestions = Array.isArray(game?.questions)
		? game.questions.length
		: 0;
	const roundIndex = Number.isFinite(Number(session?.roundIndex))
		? Math.max(0, Math.floor(Number(session.roundIndex)))
		: 0;
	const isSuddenDeath =
		Boolean(game?.settings?.gameRules?.suddenDeath) &&
		roundIndex >= Math.max(totalQuestions - 3, 0);
	return {
		isSuddenDeath,
		timeLimitMs: isSuddenDeath ? baseTimeLimitMs / 2 : baseTimeLimitMs,
	};
}

function createRoundState(game, roundIndex) {
	const index = Number.isFinite(Number(roundIndex))
		? Math.max(0, Math.floor(Number(roundIndex)))
		: 0;
	return {
		questionId: game.questions[index]?.id || '',
		startedAt: Date.now(),
		answers: [],
		resolved: false,
	};
}

function buildHotPotatoTurnOrder(session, existingOrder = []) {
	const participants = Array.isArray(session?.participants)
		? session.participants.filter((participant) =>
				isParticipantStillCompeting(participant),
			)
		: [];
	const participantById = new Map();
	participants.forEach((participant) => {
		const key = normalizeUserId(participant?.userId);
		if (!key || participantById.has(key)) return;
		participantById.set(key, participant?.userId || key);
	});
	const ordered = [];
	const seen = new Set();
	(existingOrder || []).forEach((entry) => {
		const key = normalizeUserId(entry);
		if (!key || seen.has(key) || !participantById.has(key)) return;
		seen.add(key);
		ordered.push(participantById.get(key));
	});
	participantById.forEach((participantId, key) => {
		if (seen.has(key)) return;
		seen.add(key);
		ordered.push(participantId);
	});
	return ordered;
}

function removeHotPotatoParticipantFromTurnState(session, userId) {
	const hotPotato = session?.hotPotato;
	if (!hotPotato || typeof hotPotato !== 'object') return false;
	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) return false;

	const currentPlayerId = hotPotato.currentPlayerId || '';
	const activeTurnOrder = buildHotPotatoTurnOrder(
		session,
		Array.isArray(hotPotato.turnOrder) ? hotPotato.turnOrder : [],
	);
	hotPotato.turnOrder = activeTurnOrder.filter(
		(entry) => !sameUserId(entry, normalizedUserId),
	);

	if (!hotPotato.turnOrder.length) {
		hotPotato.currentPlayerIndex = 0;
		hotPotato.currentPlayerId = '';
		hotPotato.turnStartedAt = null;
		hotPotato.lastRotationReason = 'participant-forfeit';
		return true;
	}

	if (sameUserId(currentPlayerId, normalizedUserId)) {
		const previousIndex = activeTurnOrder.findIndex((entry) =>
			sameUserId(entry, normalizedUserId),
		);
		const nextIndex =
			previousIndex >= 0 ? previousIndex % hotPotato.turnOrder.length : 0;
		hotPotato.currentPlayerIndex = nextIndex;
		hotPotato.currentPlayerId = hotPotato.turnOrder[nextIndex] || '';
		hotPotato.turnStartedAt = Date.now();
		hotPotato.lastRotationReason = 'participant-forfeit';
		return true;
	}

	const retainedIndex = hotPotato.turnOrder.findIndex((entry) =>
		sameUserId(entry, currentPlayerId),
	);
	if (retainedIndex >= 0) {
		hotPotato.currentPlayerIndex = retainedIndex;
		hotPotato.currentPlayerId = hotPotato.turnOrder[retainedIndex] || '';
		return true;
	}

	hotPotato.currentPlayerIndex = 0;
	hotPotato.currentPlayerId = hotPotato.turnOrder[0] || '';
	hotPotato.turnStartedAt = Date.now();
	hotPotato.lastRotationReason = 'participant-forfeit';
	return true;
}

function initializeHotPotatoRound(game, session, preferredStarterId = '') {
	if (!isHotPotatoGameType(game?.type)) {
		session.hotPotato = null;
		return null;
	}
	if (!session?.round) return null;
	const rules = getHotPotatoRules(game);
	const previous = session.hotPotato || {};
	const turnOrder = buildHotPotatoTurnOrder(session, previous.turnOrder || []);
	let currentPlayerIndex = 0;
	const preferredKey = normalizeUserId(preferredStarterId);
	if (preferredKey) {
		const preferredIndex = turnOrder.findIndex((entry) =>
			sameUserId(entry, preferredKey),
		);
		if (preferredIndex >= 0) currentPlayerIndex = preferredIndex;
	} else if (previous.currentPlayerId) {
		const existingIndex = turnOrder.findIndex((entry) =>
			sameUserId(entry, previous.currentPlayerId),
		);
		if (existingIndex >= 0) {
			currentPlayerIndex = existingIndex;
		} else if (
			Number.isFinite(Number(previous.currentPlayerIndex)) &&
			turnOrder.length
		) {
			currentPlayerIndex =
				Math.abs(Math.floor(Number(previous.currentPlayerIndex))) %
				turnOrder.length;
		}
	}
	const roundStartedAt =
		parseTimestampMs(session.round.startedAt) || Date.now();
	session.hotPotato = {
		turnOrder,
		currentPlayerIndex,
		currentPlayerId: turnOrder[currentPlayerIndex] || '',
		turnStartedAt: Date.now(),
		roundStartedAt,
		questionId: session.round.questionId || '',
		totalTimeLimitMs: rules.totalTimerMs,
		turnDurationMs: rules.turnDurationMs,
		pointsPerCorrect: rules.pointsPerCorrect,
		autoRotate: rules.autoRotate,
		showCountdown: rules.showCountdown,
		winnerId: '',
		lastRotationReason: '',
	};
	return session.hotPotato;
}

function advanceHotPotatoTurn(session, reason = '') {
	const hotPotato = session?.hotPotato;
	if (
		!hotPotato ||
		!Array.isArray(hotPotato.turnOrder) ||
		!hotPotato.turnOrder.length
	) {
		return false;
	}
	const previousIndex = Number.isFinite(Number(hotPotato.currentPlayerIndex))
		? Math.floor(Number(hotPotato.currentPlayerIndex))
		: 0;
	hotPotato.currentPlayerIndex =
		(previousIndex + 1) % hotPotato.turnOrder.length;
	hotPotato.currentPlayerId =
		hotPotato.turnOrder[hotPotato.currentPlayerIndex] || '';
	hotPotato.turnStartedAt = Date.now();
	hotPotato.lastRotationReason = String(reason || '');
	return true;
}

function initializeLastSurvivorState(game, session) {
	if (!isLastSurvivorGameType(game?.type)) {
		session.lastSurvivor = null;
		return null;
	}
	const rules = getLastSurvivorRules(game);
	const participants = Array.isArray(session?.participants)
		? session.participants
		: [];
	const participantById = new Map();
	participants.forEach((participant) => {
		const key = normalizeUserId(participant?.userId);
		if (!key || participantById.has(key)) return;
		participantById.set(key, participant);
	});
	const previous = session.lastSurvivor || {};
	let activeParticipantIds = Array.isArray(previous.activeParticipantIds)
		? previous.activeParticipantIds.filter((id) =>
				participantById.has(normalizeUserId(id)),
			)
		: [];
	if (!activeParticipantIds.length) {
		activeParticipantIds = participants
			.map((participant) => participant?.userId)
			.filter(Boolean);
	}
	const dedupActive = [];
	const activeSeen = new Set();
	activeParticipantIds.forEach((id) => {
		const key = normalizeUserId(id);
		if (!key || activeSeen.has(key) || !participantById.has(key)) return;
		activeSeen.add(key);
		dedupActive.push(participantById.get(key)?.userId || id);
	});
	activeParticipantIds = dedupActive;

	let eliminatedParticipantIds = Array.isArray(
		previous.eliminatedParticipantIds,
	)
		? previous.eliminatedParticipantIds.filter((id) =>
				participantById.has(normalizeUserId(id)),
			)
		: [];
	const dedupEliminated = [];
	const eliminatedSeen = new Set();
	eliminatedParticipantIds.forEach((id) => {
		const key = normalizeUserId(id);
		if (
			!key ||
			eliminatedSeen.has(key) ||
			!participantById.has(key) ||
			activeSeen.has(key)
		) {
			return;
		}
		eliminatedSeen.add(key);
		dedupEliminated.push(participantById.get(key)?.userId || id);
	});
	eliminatedParticipantIds = dedupEliminated;

	const eliminationReasons = {};
	if (
		previous.eliminationReasons &&
		typeof previous.eliminationReasons === 'object'
	) {
		Object.entries(previous.eliminationReasons).forEach(([key, value]) => {
			const normalizedKey = normalizeUserId(key);
			if (!normalizedKey || !participantById.has(normalizedKey)) return;
			eliminationReasons[normalizedKey] = String(value || '').trim();
		});
	}

	session.lastSurvivor = {
		activeParticipantIds,
		eliminatedParticipantIds,
		eliminationReasons,
		eliminateOnFirstWrong: rules.eliminateOnFirstWrong,
		bonusPoints: rules.bonusPoints,
		eliminationTimerMs: rules.eliminationTimerMs,
		showEliminationReason: rules.showEliminationReason,
		winnerId: String(previous.winnerId || '').trim(),
		bonusAwarded: Boolean(previous.bonusAwarded),
	};

	const activeKeys = new Set(
		activeParticipantIds.map((id) => normalizeUserId(id)).filter(Boolean),
	);
	participants.forEach((participant) => {
		const participantKey = normalizeUserId(participant?.userId);
		if (!participantKey) return;
		const reason = eliminationReasons[participantKey] || '';
		if (activeKeys.has(participantKey)) {
			participant.state = 'active';
			participant.eliminationReason = '';
			return;
		}
		participant.state = 'eliminated';
		participant.eliminationReason = reason;
	});

	return session.lastSurvivor;
}

function syncLastSurvivorRoundState(session) {
	const round = session?.round;
	const lastSurvivor = session?.lastSurvivor;
	if (!round || !lastSurvivor) return;
	round.activeParticipantIds = Array.isArray(lastSurvivor.activeParticipantIds)
		? [...lastSurvivor.activeParticipantIds]
		: [];
	round.eliminatedParticipantIds = Array.isArray(
		lastSurvivor.eliminatedParticipantIds,
	)
		? [...lastSurvivor.eliminatedParticipantIds]
		: [];
	round.eliminationReasons =
		lastSurvivor.eliminationReasons &&
		typeof lastSurvivor.eliminationReasons === 'object'
			? { ...lastSurvivor.eliminationReasons }
			: {};
}

function eliminateLastSurvivorParticipant(
	session,
	userId,
	reason = 'Wrong answer',
) {
	const lastSurvivor = session?.lastSurvivor;
	if (!lastSurvivor) return false;
	const targetKey = normalizeUserId(userId);
	if (!targetKey) return false;
	let removed = false;
	lastSurvivor.activeParticipantIds = (
		lastSurvivor.activeParticipantIds || []
	).filter((id) => {
		const same = sameUserId(id, targetKey);
		if (same) removed = true;
		return !same;
	});
	if (!removed) return false;
	const participant = Array.isArray(session?.participants)
		? session.participants.find((entry) => sameUserId(entry?.userId, targetKey))
		: null;
	const participantId =
		participant?.userId || String(userId || '').trim() || targetKey;
	if (
		!lastSurvivor.eliminatedParticipantIds.some((id) =>
			sameUserId(id, participantId),
		)
	) {
		lastSurvivor.eliminatedParticipantIds.push(participantId);
	}
	lastSurvivor.eliminationReasons = lastSurvivor.eliminationReasons || {};
	lastSurvivor.eliminationReasons[targetKey] =
		String(reason || '').trim() || 'Eliminated';
	if (participant) {
		participant.state = 'eliminated';
		participant.eliminationReason = lastSurvivor.eliminationReasons[targetKey];
	}
	return true;
}

function initializeModeRoundState(
	game,
	session,
	preferredHotPotatoStarterId = '',
) {
	if (isHotPotatoGameType(game.type)) {
		initializeHotPotatoRound(game, session, preferredHotPotatoStarterId);
		session.lastSurvivor = null;
		session.sprint = null;
		return;
	}
	if (isLastSurvivorGameType(game.type)) {
		initializeLastSurvivorState(game, session);
		syncLastSurvivorRoundState(session);
		session.hotPotato = null;
		session.sprint = null;
		return;
	}
	session.hotPotato = null;
	session.lastSurvivor = null;
	session.sprint = null;
}

function getSprintGlobalTimeLimitMs(game) {
	const totalQuestions = Array.isArray(game?.questions)
		? game.questions.length
		: 0;
	const safeQuestionCount = Math.max(1, totalQuestions);
	const explicitSeconds = Number(
		game?.settings?.sprintGlobalTimeLimit ??
			game?.settings?.gameRules?.sprintGlobalTimeLimit ??
			game?.settings?.gameRules?.sprint?.globalTimer,
	);
	if (Number.isFinite(explicitSeconds) && explicitSeconds > 0) {
		return Math.floor(explicitSeconds * 1000);
	}
	const questionLimitSeconds = toPositiveNumber(
		game?.settings?.questionTimeLimit,
		20,
	);
	const fallbackSeconds = Math.max(
		Math.ceil(questionLimitSeconds * safeQuestionCount * 2),
		30,
	);
	return Math.floor(fallbackSeconds * 1000);
}

function normalizeSprintGlobalTimeLimitMs(game, value) {
	const fallbackMs = getSprintGlobalTimeLimitMs(game);
	const numeric = Number(value);
	const configured =
		Number.isFinite(numeric) && numeric > 0
			? numeric
			: toPositiveNumber(value, 0);
	if (!Number.isFinite(configured) || configured <= 0) {
		return Math.max(1000, Math.floor(fallbackMs));
	}
	// Older sessions could persist this value in seconds instead of milliseconds.
	const normalizedMs = configured < 1000 ? configured * 1000 : configured;
	return Math.max(1000, Math.floor(normalizedMs));
}

function ensureSprintRaceState(game, session = game?.session) {
	if (!game || !session || !isSprintRaceGameType(game.type)) {
		if (session) session.sprint = null;
		return null;
	}
	const participants = Array.isArray(session.participants)
		? session.participants
		: [];
	const totalQuestions = Array.isArray(game.questions)
		? game.questions.length
		: 0;
	const now = Date.now();

	let sprint = session.sprint;
	if (!sprint || typeof sprint !== 'object') {
		sprint = {
			startedAt: now,
			winnerId: '',
			byUser: {},
			finishOrder: [],
			totalQuestions,
			globalTimeLimitMs: normalizeSprintGlobalTimeLimitMs(game, 0),
			resolutionReason: '',
			timeoutResolvedAt: null,
		};
		session.sprint = sprint;
	}

	const byUser =
		sprint.byUser && typeof sprint.byUser === 'object' ? sprint.byUser : {};
	sprint.byUser = byUser; // Ensure it's an object

	participants.forEach((participant) => {
		const userId = participant?.userId;
		if (!userId) return;

		const normalizedUserId = normalizeUserId(userId);

		// Attempt case-insensitive lookup
		const fallbackKey = Object.keys(byUser).find(
			(k) => normalizeUserId(k) === normalizedUserId,
		);
		const existing =
			byUser[normalizedUserId] && typeof byUser[normalizedUserId] === 'object'
				? byUser[normalizedUserId]
				: fallbackKey
					? byUser[fallbackKey]
					: null;

		if (
			!byUser[normalizedUserId] ||
			typeof byUser[normalizedUserId] !== 'object'
		) {
			byUser[normalizedUserId] = existing || {
				questionIndex: 0,
				correctCount: 0,
				attempts: 0,
				currentQuestionStartedAt: now,
				finishedAt: null,
				timeByQuestion: {},
				correctByQuestion: {},
			};
		}

		const entry = byUser[normalizedUserId];

		// Normalize values in place to preserve reference
		if (!Number.isFinite(entry.questionIndex) || entry.questionIndex < 0) {
			entry.questionIndex = 0;
		} else {
			entry.questionIndex = Math.min(
				Math.floor(entry.questionIndex),
				totalQuestions,
			);
		}

		if (!Number.isFinite(entry.correctCount) || entry.correctCount < 0) {
			entry.correctCount = 0;
		}

		if (!Number.isFinite(entry.attempts) || entry.attempts < 0) {
			entry.attempts = 0;
		}

		entry.currentQuestionStartedAt =
			parseTimestampMs(entry.currentQuestionStartedAt) || now;
		entry.finishedAt = parseTimestampMs(entry.finishedAt) || null;

		if (!entry.timeByQuestion || typeof entry.timeByQuestion !== 'object') {
			entry.timeByQuestion = {};
		}
		if (
			!entry.correctByQuestion ||
			typeof entry.correctByQuestion !== 'object'
		) {
			entry.correctByQuestion = {};
		}
	});

	// Cleanup byUser for removed participants if needed, but we usually keep them for results
	// sprint.finishOrder filtering
	if (Array.isArray(sprint.finishOrder)) {
		sprint.finishOrder = sprint.finishOrder.filter((id) => {
			const nid = normalizeUserId(id);
			return byUser[nid] && parseTimestampMs(byUser[nid].finishedAt);
		});
	} else {
		sprint.finishOrder = [];
	}

	sprint.totalQuestions = totalQuestions;
	sprint.globalTimeLimitMs = normalizeSprintGlobalTimeLimitMs(
		game,
		sprint.globalTimeLimitMs,
	);
	sprint.startedAt = parseTimestampMs(sprint.startedAt) || now;
	sprint.winnerId = String(sprint.winnerId || '').trim();
	sprint.resolutionReason = String(sprint.resolutionReason || '').trim();
	sprint.timeoutResolvedAt = parseTimestampMs(sprint.timeoutResolvedAt) || null;

	return sprint;
}

function resolveSprintRaceTimeoutIfNeeded(
	game,
	session = game?.session,
	reason = 'global-time-expired',
) {
	if (!game || !session || !isSprintRaceGameType(game.type)) {
		return { expired: false, sprint: null, results: null };
	}
	const sprint = ensureSprintRaceState(game, session);
	if (!sprint) {
		return { expired: false, sprint: null, results: null };
	}
	const startedAt = parseTimestampMs(sprint.startedAt || session?.startedAt);
	const globalTimeLimitMs = normalizeSprintGlobalTimeLimitMs(
		game,
		sprint.globalTimeLimitMs,
	);
	sprint.globalTimeLimitMs = globalTimeLimitMs;
	const expired = startedAt > 0 && Date.now() - startedAt >= globalTimeLimitMs;
	if (!expired) {
		return { expired: false, sprint, results: null };
	}
	const results = finalizeSprintRaceByProgress(game, reason);
	return { expired: true, sprint, results: results || null };
}

function finalizeSprintRaceByWinner(game, winnerUserId) {
	const session = game?.session;
	if (!session) return null;
	const winnerId = String(winnerUserId || '').trim();
	const sprint = ensureSprintRaceState(game, session);
	if (sprint) {
		sprint.winnerId = winnerId;
		sprint.resolutionReason = 'first-finisher';
		sprint.timeoutResolvedAt = null;
	}
	const results = computeResults(game);
	const leaderboard = results?.leaderboard || [];
	const winnerEntry = leaderboard.find((entry) =>
		sameUserId(getLeaderboardId(entry, game), winnerId),
	);
	if (results && winnerEntry) {
		results.winners = [winnerEntry];
	}
	game.results = results;
	game.status = 'completed';
	session.status = 'completed';
	session.endedAt = nowIso();
	return results;
}

function finalizeSprintRaceByProgress(game, reason = 'global-time-expired') {
	const session = game?.session;
	if (!session) return null;
	const sprint = ensureSprintRaceState(game, session);
	if (!sprint) return null;
	const participants = Array.isArray(session.participants)
		? session.participants
		: [];
	const byUser =
		sprint.byUser && typeof sprint.byUser === 'object' ? sprint.byUser : {};
	const participantProgress = participants.map((participant) => {
		const userId = normalizeUserId(participant?.userId);
		const entry =
			byUser[userId] && typeof byUser[userId] === 'object'
				? byUser[userId]
				: {};
		const progressRaw = Number(entry.questionIndex);
		const progress =
			Number.isFinite(progressRaw) && progressRaw >= 0
				? Math.floor(progressRaw)
				: 0;
		return { participant, entry, progress };
	});
	const highestProgress = participantProgress.reduce(
		(best, item) => Math.max(best, item.progress),
		0,
	);
	const topCandidates = participantProgress.filter(
		(item) => item.progress === highestProgress,
	);
	let winnerId = '';

	if (topCandidates.length === 1 && highestProgress > 0) {
		winnerId = String(topCandidates[0].participant?.userId || '').trim();
	} else if (topCandidates.length > 1 && highestProgress > 0) {
		let bestCandidateId = '';
		let bestDuration = Number.POSITIVE_INFINITY;
		let hasTie = false;
		for (
			let questionIndex = highestProgress - 1;
			questionIndex >= 0;
			questionIndex -= 1
		) {
			const key = String(questionIndex);
			const withDurations = topCandidates
				.map((item) => {
					const raw = Number(item?.entry?.correctByQuestion?.[key]);
					return {
						userId: String(item?.participant?.userId || '').trim(),
						duration: Number.isFinite(raw) && raw >= 0 ? raw : null,
					};
				})
				.filter((entry) => entry.userId && Number.isFinite(entry.duration));
			if (withDurations.length !== topCandidates.length) continue;
			withDurations.sort((left, right) => left.duration - right.duration);
			const first = withDurations[0];
			const second = withDurations[1];
			if (!second || first.duration < second.duration) {
				bestCandidateId = first.userId;
				bestDuration = first.duration;
				hasTie = false;
				break;
			}
			hasTie = true;
		}
		if (bestCandidateId && Number.isFinite(bestDuration) && !hasTie) {
			winnerId = bestCandidateId;
		}
	}

	const results = computeResults(game) || {
		winners: [],
		leaderboard: [],
		endedAt: nowIso(),
		lobbyId: session.lobbyId || '',
		lobbyLabel: session.lobbyLabel || '',
	};
	const leaderboard = Array.isArray(results.leaderboard)
		? results.leaderboard
		: [];
	if (winnerId) {
		const winnerEntry = leaderboard.find((entry) =>
			sameUserId(getLeaderboardId(entry, game), winnerId),
		);
		results.winners = winnerEntry ? [winnerEntry] : [];
	} else {
		results.winners = [];
	}
	results.sprintResolution = {
		reason: String(reason || '').trim() || 'global-time-expired',
		winnerId: winnerId || '',
		highestProgress,
		timedOut: true,
	};
	sprint.winnerId = winnerId || '';
	sprint.resolutionReason = results.sprintResolution.reason;
	sprint.timeoutResolvedAt = Date.now();
	game.results = results;
	game.status = 'completed';
	session.status = 'completed';
	session.endedAt = nowIso();
	return results;
}

function advanceToNextRound(game, preferredHotPotatoStarterId = '') {
	const session = game.session;
	session.roundIndex = Number.isFinite(Number(session.roundIndex))
		? Math.max(0, Math.floor(Number(session.roundIndex)))
		: 0;
	session.roundIndex += 1;
	if (session.roundIndex >= game.questions.length) {
		finalizeGame(game);
		return false;
	}
	session.round = createRoundState(game, session.roundIndex);
	initializeModeRoundState(game, session, preferredHotPotatoStarterId);
	return true;
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ In-memory store ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

const activeGames = new Map(); // gameId ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ·ط¢آ¢ط·آ¢ط¢آ ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬أ¢â‚¬ع†ط·آ¢ط¢آ¢ game state object
const playerSockets = new Map(); // `${gameId}:${userId}` ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ·ط¢آ¢ط·آ¢ط¢آ ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬أ¢â‚¬ع†ط·آ¢ط¢آ¢ socketId
const socketPlayers = new Map(); // socketId ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ·ط¢آ¢ط·آ¢ط¢آ ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬أ¢â‚¬ع†ط·آ¢ط¢آ¢ Set<{gameId, userId}>

const playerDisconnectTimers = new Map();
const PLAYER_RECONNECT_GRACE_MS = 5000;

function getTrackedGame(gameId) {
	const game = activeGames.get(gameId);
	if (!game) return null;
	game.type = normalizeGameType(game.type);
	if (isCardGameType(game.type)) {
		normalizeCardSessionState(game.session);
	} else if (isSprintRaceGameType(game.type)) {
		ensureSprintRaceState(game, game.session);
	}
	return game;
}

function getTrackedGameByJoinCode(joinCode) {
	const normalized = String(joinCode || '').trim().toUpperCase();
	if (!normalized) return null;
	for (const game of activeGames.values()) {
		const candidates = [game?.joinCode, game?.join_code, game?.lobbyCode, game?.session?.joinCode]
			.map((value) => String(value || '').trim().toUpperCase());
		if (candidates.includes(normalized)) return getTrackedGame(game.id);
	}
	return null;
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Sanitize state before sending to clients ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

function sanitizeForPlayer(game, userId) {
	// Deep clone to avoid mutating the canonical state
	const safe = JSON.parse(JSON.stringify(game));
	safe.type = normalizeGameType(safe.type);
	const viewerId = normalizeUserId(userId);
	const isCompleted =
		String(safe?.status || safe?.session?.status || '')
			.trim()
			.toLowerCase() === 'completed';
	if (isCompleted) {
		return safe;
	}

	// Strip correct answers from questions the player hasn't answered yet
	if (safe.questions) {
		safe.questions = safe.questions.map((q) => {
			const inferredAllowMultipleAnswers = inferAllowsMultipleAnswers(q);
			const questionWithChoiceMeta = inferredAllowMultipleAnswers
				? { ...q, allowMultipleAnswers: true }
				: q;
			if (isSprintRaceGameType(safe.type)) {
				return { ...questionWithChoiceMeta, answer: undefined };
			}
			// In race mode, only reveal answer after the round for that question is resolved
			if (!isCardGameType(safe.type) && safe.session?.round) {
				const round = safe.session.round;
				// Current round question ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ hide answer unless round is resolved
				if (sameCardQuestionId(q?.id, round?.questionId) && !round.resolved) {
					return { ...questionWithChoiceMeta, answer: undefined };
				}
			}
			// In card mode, NEVER show answer to card owner ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ only to target
			if (isCardGameType(safe.type)) {
				const pending = safe.session?.card?.pendingCard;
				const isDrawMode =
					isCardDrawGameType(safe.type) ||
					String(safe.session?.card?.turnMode || '').trim() ===
						'target-picks-opponent';
				const isPendingQuestion =
					Boolean(pending) && sameCardQuestionId(pending?.questionId, q?.id);
				const isPendingTarget =
					Boolean(pending) && sameUserId(pending?.targetId, viewerId);
				if (isDrawMode && !(isPendingQuestion && isPendingTarget)) {
					return {
						...questionWithChoiceMeta,
						answer: undefined,
						text: undefined,
						question: undefined,
						instruction: undefined,
						image: undefined,
						choices: [],
						options: [],
					};
				}
				if (
					pending &&
					sameCardQuestionId(pending.questionId, q?.id) &&
					!sameUserId(pending.targetId, viewerId)
				) {
					return { ...questionWithChoiceMeta, answer: undefined };
				}
				// Hide answers for cards in the player's own hand
				const hands = safe.session?.card?.hands || {};
				const directHand = hands[viewerId];
				let hand = Array.isArray(directHand) ? directHand : null;
				if (!hand && viewerId) {
					const mappedKey = Object.keys(hands).find((id) =>
						sameUserId(id, viewerId),
					);
					if (mappedKey) {
						hand = Array.isArray(hands[mappedKey]) ? hands[mappedKey] : null;
					}
				}
				if (!hand) hand = [];
				const inHand = hand.some((cardId) => sameCardQuestionId(cardId, q?.id));
				if (inHand) {
					return { ...questionWithChoiceMeta, answer: undefined };
				}
			}
			return questionWithChoiceMeta;
		});
	}

	// Also hide penalty question answers unless in tie-break and this player is a candidate
	if (safe.penaltyQuestions) {
		const tieBreak = safe.session?.tieBreak;
		safe.penaltyQuestions = safe.penaltyQuestions.map((q) => {
			const inferredAllowMultipleAnswers = inferAllowsMultipleAnswers(q);
			const questionWithChoiceMeta = inferredAllowMultipleAnswers
				? { ...q, allowMultipleAnswers: true }
				: q;
			if (
				tieBreak &&
				sameCardQuestionId(q?.id, tieBreak?.questionId) &&
				!tieBreak.resolved
			) {
				return { ...questionWithChoiceMeta, answer: undefined };
			}
			return questionWithChoiceMeta;
		});
	}

	// Hide warmup answer
	if (safe.session?.warmup && !safe.session.warmup.resolved) {
		safe.session.warmup.answer = undefined;
	}

	return safe;
}

function sanitizeForAdmin(game) {
	// Admin sees everything
	const safe = JSON.parse(JSON.stringify(game));
	safe.type = normalizeGameType(safe.type);
	return safe;
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Broadcast helpers ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

let _io = null;

function broadcastGameState(game) {
	if (!_io) return;
	const gameId = game.id;
	const deliveredSocketIds = new Set();

	try {
		// Send to each connected player with personalized sanitization
		const session = game.session;
		const participants = session?.participants || [];
		participants.forEach((p) => {
			try {
				const key = buildPlayerSocketKey(gameId, p.userId);
				const socketId = playerSockets.get(key);
				if (!socketId) return;
				const sock = _io.sockets.sockets.get(socketId);
				if (!sock) return;
				const normalizedPId = normalizeUserId(p.userId);
				const sanitized = sanitizeForPlayer(game, normalizedPId);
				sock.emit('game:stateUpdate', sanitized);
				deliveredSocketIds.add(socketId);
			} catch (err) {
				console.error(`Error emitting to participant ${p.userId}:`, err);
			}
		});

		// Also send state updates to all connected clients (including non-participants)
		const publicState = sanitizeForPlayer(game, '');
		_io.sockets.sockets.forEach((s) => {
			try {
				if (s.role === 'admin') {
					s.emit('game:stateUpdate', sanitizeForAdmin(game));
					return;
				}
				if (s.role === 'client' && !deliveredSocketIds.has(s.id)) {
					s.emit('game:stateUpdate', publicState);
				}
			} catch (err) {
				console.error(`Error emitting to extra socket ${s.id}:`, err);
			}
		});
	} catch (globalErr) {
		console.error(`FATAL error in broadcastGameState:`, globalErr);
	}
}

function emitToPlayer(gameId, userId, event, data) {
	if (!_io) return;
	const key = buildPlayerSocketKey(gameId, userId);
	const socketId = playerSockets.get(key);
	if (!socketId) return;
	const sock = _io.sockets.sockets.get(socketId);
	if (sock) sock.emit(event, data);
}

function emitToAllPlayers(gameId, event, data) {
	if (!_io) return;
	const game = getTrackedGame(gameId);
	if (!game?.session?.participants) return;
	game.session.participants.forEach((p) => {
		emitToPlayer(gameId, p.userId, event, data);
	});
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Game Logic (server-authoritative) ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

function clearPendingPlayerDisconnect(gameId, userId) {
	const key = buildPlayerSocketKey(gameId, userId);
	const timer = playerDisconnectTimers.get(key);
	if (timer) {
		clearTimeout(timer);
		playerDisconnectTimers.delete(key);
	}
}

function getRemainingActiveParticipants(game, forfeitedUserId) {
	const participants = Array.isArray(game?.session?.participants)
		? game.session.participants
		: [];
	return participants.filter((participant) => {
		if (sameUserId(participant?.userId, forfeitedUserId)) return false;
		return isParticipantStillCompeting(participant);
	});
}

function isParticipantStillCompeting(participant) {
	const state = String(participant?.state || '').trim().toLowerCase();
	return state !== 'forfeited' && state !== 'eliminated';
}

function getRoundEligibleParticipants(session) {
	const participants = Array.isArray(session?.participants)
		? session.participants
		: [];
	return participants.filter((participant) =>
		isParticipantStillCompeting(participant),
	);
}

function removeCardParticipantFromTurnState(session, userId) {
	const cardState = session?.card;
	if (!cardState || typeof cardState !== 'object') return false;
	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) return false;

	normalizeCardSessionState(session);

	const turnOrder = Array.isArray(cardState.turnOrder) ? cardState.turnOrder : [];
	const currentTurnUserId =
		turnOrder.length &&
		Number.isFinite(Number(cardState.turnIndex)) &&
		Number(cardState.turnIndex) >= 0
			? turnOrder[Math.floor(Number(cardState.turnIndex)) % turnOrder.length] || ''
			: '';

	cardState.turnOrder = turnOrder.filter(
		(entry) => !sameUserId(entry, normalizedUserId),
	);

	if (cardState.hands && typeof cardState.hands === 'object') {
		Object.keys(cardState.hands).forEach((ownerId) => {
			if (!sameUserId(ownerId, normalizedUserId)) return;
			delete cardState.hands[ownerId];
		});
	}

	if (
		cardState.answersByPlayer &&
		typeof cardState.answersByPlayer === 'object'
	) {
		Object.keys(cardState.answersByPlayer).forEach((ownerId) => {
			if (!sameUserId(ownerId, normalizedUserId)) return;
			delete cardState.answersByPlayer[ownerId];
		});
	}

	if (!cardState.turnOrder.length) {
		cardState.turnIndex = 0;
		cardState.turnStartedAt = null;
		return true;
	}

	const currentTurnIndex = cardState.turnOrder.findIndex((entry) =>
		sameUserId(entry, currentTurnUserId),
	);
	if (currentTurnIndex >= 0) {
		cardState.turnIndex = currentTurnIndex;
	} else {
		const fallbackIndex = Number.isFinite(Number(cardState.turnIndex))
			? Math.floor(Number(cardState.turnIndex))
			: 0;
		cardState.turnIndex =
			((fallbackIndex % cardState.turnOrder.length) + cardState.turnOrder.length) %
			cardState.turnOrder.length;
	}
	cardState.turnStartedAt = Date.now();
	return true;
}

function removePlayerFromLobby(game, userId) {
	const session = game?.session;
	if (!game || !session || !Array.isArray(session.participants)) {
		return false;
	}
	const status = String(game?.status || session?.status || '').toLowerCase();
	if (status !== 'open' && status !== 'draft') {
		return false;
	}
	const beforeCount = session.participants.length;
	session.participants = session.participants.filter(
		(participant) => !sameUserId(participant?.userId, userId),
	);
	return session.participants.length !== beforeCount;
}

function applyPlayerForfeitToGame(game, userId, reason = 'left-match') {
	const session = game?.session;
	if (
		!game ||
		!session ||
		String(game?.status || '').toLowerCase() !== 'live'
	) {
		return false;
	}
	const participant = Array.isArray(session.participants)
		? session.participants.find((entry) => sameUserId(entry?.userId, userId))
		: null;
	if (!participant) return false;

	participant.ready = false;
	participant.score = Math.min(Number(participant.score) || 0, -1);
	participant.timeSpent = Math.max(
		Number(participant.timeSpent) || 0,
		999999999,
	);
	participant.forfeitedAt = nowIso();

	const normalizedType = normalizeGameType(game.type);
	if (normalizedType === 'last-survivor' && session.lastSurvivor) {
		eliminateLastSurvivorParticipant(
			session,
			participant.userId,
			'Forfeited by leaving the match.',
		);
	} else {
		participant.state = 'forfeited';
		participant.eliminationReason = 'Forfeited by leaving the match.';
	}

	if (isSprintRaceGameType(game.type) && session.sprint) {
		const sprint = ensureSprintRaceState(game, session);
		const normalizedUserId = normalizeUserId(participant.userId);
		if (sprint && normalizedUserId) {
			sprint.byUser =
				sprint.byUser && typeof sprint.byUser === 'object' ? sprint.byUser : {};
			const currentEntry =
				sprint.byUser[normalizedUserId] &&
				typeof sprint.byUser[normalizedUserId] === 'object'
					? sprint.byUser[normalizedUserId]
					: {};
			currentEntry.finishedAt = currentEntry.finishedAt || Date.now();
			currentEntry.forfeitedAt = Date.now();
			sprint.byUser[normalizedUserId] = currentEntry;
		}
	}

	const remaining = getRemainingActiveParticipants(game, participant.userId);
	if (isSprintRaceGameType(game.type) && remaining.length === 1) {
		finalizeSprintRaceByWinner(game, remaining[0].userId);
		return true;
	}
	if (normalizedType === 'hot-potato') {
		removeHotPotatoParticipantFromTurnState(session, participant.userId);
		if (remaining.length <= 1) {
			finalizeGame(game);
		}
		return true;
	}
	if (isCardGameType(game.type) && session.card) {
		removeCardParticipantFromTurnState(session, participant.userId);
		const pendingCard = session.card?.pendingCard;
		if (pendingCard && sameUserId(pendingCard?.targetId, participant.userId)) {
			resolveCardAnswer(game, pendingCard, '', false, true);
		} else {
			ensureCardTurnHasCards(game);
		}
	}
	if (isCardGameType(game.type) && remaining.length <= 1) {
		finalizeGame(game);
		return true;
	}
	if (
		!isCardGameType(game.type) &&
		!isSprintRaceGameType(game.type) &&
		normalizedType !== 'hot-potato'
	) {
		resolveNonCardRound(game, {
			reason: 'participant-forfeit',
		});
	}
	if (remaining.length <= 1) {
		if (remaining[0]) {
			remaining[0].score = Math.max(Number(remaining[0].score) || 0, 1);
		}
		finalizeGame(game);
		return true;
	}
	return true;
}

function scheduleDisconnectForfeit(gameId, userId, reason = 'window-closed') {
	clearPendingPlayerDisconnect(gameId, userId);
	const key = buildPlayerSocketKey(gameId, userId);
	const timer = setTimeout(() => {
		playerDisconnectTimers.delete(key);
		if (playerSockets.has(key)) return;
		const game = getTrackedGame(gameId);
		if (!game) return;
		const status = String(game?.status || '').toLowerCase();
		const changed =
			status === 'live'
				? applyPlayerForfeitToGame(game, userId, reason)
				: removePlayerFromLobby(game, userId);
		if (changed) {
			broadcastGameState(game);
		}
	}, PLAYER_RECONNECT_GRACE_MS);
	playerDisconnectTimers.set(key, timer);
}

function computeResults(game) {
	const session = game.session;
	if (!session || !Array.isArray(session.participants)) return null;
	ensureLobbyIdentity(game, session);
	const participants = session.participants.map((p) => ({ ...p }));

	if (game.mode === 'team') {
		const teamStats = {};
		participants.forEach((p) => {
			const teamId = p.teamId || 'team-a';
			if (!teamStats[teamId]) {
				teamStats[teamId] = {
					id: teamId,
					name: getTeamName(game, teamId),
					score: 0,
					timeSpent: 0,
				};
			}
			teamStats[teamId].score += p.score || 0;
			teamStats[teamId].timeSpent += p.timeSpent || 0;
		});
		const teams = Object.values(teamStats).sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.timeSpent - b.timeSpent;
		});
		return {
			winners: teams.slice(0, 1),
			leaderboard: teams,
			endedAt: nowIso(),
			lobbyId: session.lobbyId || '',
			lobbyLabel: session.lobbyLabel || '',
		};
	}

	const leaderboard = participants.sort((a, b) => {
		if ((b.score || 0) !== (a.score || 0))
			return (b.score || 0) - (a.score || 0);
		return (a.timeSpent || 0) - (b.timeSpent || 0);
	});
	return {
		winners: leaderboard.slice(0, 1),
		leaderboard,
		endedAt: nowIso(),
		lobbyId: session.lobbyId || '',
		lobbyLabel: session.lobbyLabel || '',
	};
}

function getLeaderboardId(entry, game) {
	if (game.mode === 'team') return entry.id;
	return entry.userId || entry.id;
}

function startTieBreak(game, candidateIds) {
	const session = game.session;
	if (!game.penaltyQuestions || !game.penaltyQuestions.length) return false;
	const index = session.tieBreak?.index || 0;
	const question = game.penaltyQuestions[index % game.penaltyQuestions.length];
	session.tieBreak = {
		index,
		questionId: question.id,
		candidates: candidateIds,
		answers: [],
		resolved: false,
		startedAt: Date.now(),
	};
	game.status = 'live';
	session.status = 'live';
	return true;
}

function finalizeGame(game) {
	const session = game.session;
	const results = computeResults(game);
	const leaderboard = results?.leaderboard || [];
	if (leaderboard.length > 1) {
		const topScore = leaderboard[0].score;
		const topTime = leaderboard[0].timeSpent;
		const tied = leaderboard.filter(
			(entry) => entry.score === topScore && entry.timeSpent === topTime,
		);
		if (tied.length > 1 && game.penaltyQuestions?.length) {
			const candidateIds = tied.map((entry) => getLeaderboardId(entry, game));
			if (startTieBreak(game, candidateIds)) {
				return null; // Tie-break started, game not yet complete
			}
		}
	}
	game.status = 'completed';
	session.status = 'completed';
	session.endedAt = nowIso();
	game.results = results;
	return results;
}

function finalizeTieBreak(game, winnerId) {
	const session = game.session;
	const results = computeResults(game);
	const leaderboard = results?.leaderboard || [];
	const winnerEntry = leaderboard.find(
		(entry) => getLeaderboardId(entry, game) === winnerId,
	);
	results.winners = winnerEntry ? [winnerEntry] : results.winners;
	game.results = results;
	game.status = 'completed';
	session.status = 'completed';
	session.endedAt = nowIso();
	if (session.tieBreak) {
		session.tieBreak.resolved = true;
		session.tieBreak.winnerId = winnerId;
	}
	return results;
}

function resolveRaceRound(game, options = {}) {
	return resolveNonCardRound(game, options);
}

function evaluateRechargeTriggers(
	game,
	participant,
	pointsEarned,
	responseTimeMs,
) {
	if (!game || !game.session || !participant) return;
	const cardState = game.session?.card;
	if (
		!cardState ||
		!Array.isArray(cardState.usedSpecialCards) ||
		cardState.usedSpecialCards.length === 0
	)
		return;

	let rechargable = false;
	let rechargeReason = '';

	// 1. Winning Streak (3-streak)
	if (participant.winningStreak && participant.winningStreak >= 3) {
		if (participant.winningStreak % 3 === 0) {
			rechargable = true;
			rechargeReason = '3-question winning streak';
		}
	}

	// 2. Total Correct Milestone (every 5)
	if (
		!rechargable &&
		participant.totalCorrect &&
		participant.totalCorrect > 0
	) {
		if (participant.totalCorrect % 5 === 0) {
			rechargable = true;
			rechargeReason = '5 total correct answers';
		}
	}

	// 3. Score Milestone (every 50 points)
	if (!rechargable && pointsEarned > 0) {
		const oldScore = Math.max(
			0,
			(Number(participant.score) || 0) - pointsEarned,
		);
		const newScore = Math.max(0, Number(participant.score) || 0);
		if (Math.floor(oldScore / 50) < Math.floor(newScore / 50)) {
			rechargable = true;
			rechargeReason = 'score milestone reached';
		}
	}

	// 4. Flash Answer (< 2 seconds)
	if (
		!rechargable &&
		responseTimeMs !== undefined &&
		responseTimeMs >= 0 &&
		responseTimeMs < 2000
	) {
		rechargable = true;
		rechargeReason = 'flash answer (under 2 seconds)';
	}

	if (rechargable) {
		const recoveredCard = cardState.usedSpecialCards.pop();
		cardState.history = Array.isArray(cardState.history)
			? cardState.history
			: [];
		cardState.history.push({
			type: 'recharge',
			userId: participant.userId,
			userName: participant.name,
			cardId: recoveredCard,
			reason: rechargeReason,
			timestamp: Date.now(),
		});
		console.log(
			`[GameServer] ${participant.name} recharged a special card (${recoveredCard}) due to ${rechargeReason} in game ${game.id}`,
		);
	}
}

function resolveNonCardRound(game, options = {}) {
	const session = game?.session;
	if (!session) return false;
	if (!session.round && game.questions.length) {
		session.roundIndex = Number.isFinite(Number(session.roundIndex))
			? Math.max(0, Math.floor(Number(session.roundIndex)))
			: 0;
		session.round = createRoundState(game, session.roundIndex);
		initializeModeRoundState(game, session);
		return false;
	}
	const round = session.round;
	if (!round || round.resolved) return false;

	const forceResolve = Boolean(options?.force);
	const resolutionReason = String(options?.reason || '').trim();
	const now = Date.now();
	const participants = Array.isArray(session.participants)
		? session.participants
		: [];
	const activeParticipants = getRoundEligibleParticipants(session);

	if (isHotPotatoGameType(game.type)) {
		const hotPotato =
			session.hotPotato ||
			initializeHotPotatoRound(
				game,
				session,
				String(options?.preferredHotPotatoStarterId || '').trim(),
			);
		if (!hotPotato) return false;

		const rules = getHotPotatoRules(game);
		const answers = Array.isArray(round.answers) ? round.answers : [];
		const roundStartedAt =
			parseTimestampMs(hotPotato.roundStartedAt || round.startedAt) || now;
		const totalTimeLimitMs = Number.isFinite(Number(hotPotato.totalTimeLimitMs))
			? Number(hotPotato.totalTimeLimitMs)
			: rules.totalTimerMs;
		const expired =
			roundStartedAt > 0 && now - roundStartedAt >= totalTimeLimitMs;
		const correctAnswers = answers
			.filter((entry) => Boolean(entry?.correct))
			.sort(
				(left, right) =>
					Number(left?.answeredAt || 0) - Number(right?.answeredAt || 0),
			);
		const winner = correctAnswers.length ? correctAnswers[0] : null;

		if (!winner && !forceResolve && !expired) return false;

		answers.forEach((entry) => {
			const participant = participants.find((candidate) =>
				sameUserId(candidate?.userId, entry?.userId),
			);
			if (!participant) return;
			const answeredAt = Number(entry?.answeredAt || 0);
			const turnStartedAt =
				parseTimestampMs(entry?.turnStartedAt) || roundStartedAt;
			participant.timeSpent += Math.max(0, answeredAt - turnStartedAt);
		});

		if (winner) {
			const winnerParticipant = participants.find((entry) =>
				sameUserId(entry?.userId, winner?.userId),
			);
			if (winnerParticipant) {
				let points = Number.isFinite(Number(hotPotato.pointsPerCorrect))
					? Number(hotPotato.pointsPerCorrect)
					: rules.pointsPerCorrect;
				if (game.settings?.gameRules?.hintCost && winner.hintUsed) {
					points = Math.round(points * 0.5);
				}
				winnerParticipant.score += Math.max(0, points);

				winnerParticipant.totalCorrect =
					(winnerParticipant.totalCorrect || 0) + 1;
				winnerParticipant.winningStreak =
					(winnerParticipant.winningStreak || 0) + 1;
				const responseTimeMs = Math.max(
					0,
					Number(winner.answeredAt || 0) - roundStartedAt,
				);
				evaluateRechargeTriggers(
					game,
					winnerParticipant,
					Math.max(0, points),
					responseTimeMs,
				);
			}
		}

		round.resolved = true;
		round.winnerId = winner ? winner.userId : '';
		round.resolvedAt = now;
		if (resolutionReason) round.resolutionReason = resolutionReason;
		session.roundHistory = Array.isArray(session.roundHistory)
			? session.roundHistory
			: [];
		session.roundHistory.push(round);

		hotPotato.winnerId = round.winnerId;
		hotPotato.lastRotationReason =
			resolutionReason || (winner ? 'correct-answer' : 'total-time-expired');

		advanceToNextRound(game, round.winnerId || hotPotato.currentPlayerId || '');
		return true;
	}

	if (isLastSurvivorGameType(game.type)) {
		const lastSurvivor = initializeLastSurvivorState(game, session);
		if (!lastSurvivor) return false;

		const answers = Array.isArray(round.answers) ? round.answers : [];
		const roundStartedAt = parseTimestampMs(round.startedAt) || now;
		const eliminationTimerMs = Number.isFinite(
			Number(lastSurvivor.eliminationTimerMs),
		)
			? Number(lastSurvivor.eliminationTimerMs)
			: getLastSurvivorRules(game).eliminationTimerMs;
		const expired =
			roundStartedAt > 0 && now - roundStartedAt >= eliminationTimerMs;
		const activeParticipantIds = Array.isArray(
			lastSurvivor.activeParticipantIds,
		)
			? [...lastSurvivor.activeParticipantIds]
			: [];
		const hasAnswered = (participantId) =>
			answers.some((entry) => sameUserId(entry?.userId, participantId));
		const allActiveAnswered = activeParticipantIds.length
			? activeParticipantIds.every((participantId) =>
					hasAnswered(participantId),
				)
			: true;

		if (
			!forceResolve &&
			!expired &&
			!allActiveAnswered &&
			activeParticipantIds.length > 1
		) {
			return false;
		}

		answers.forEach((entry) => {
			const participant = participants.find((candidate) =>
				sameUserId(candidate?.userId, entry?.userId),
			);
			if (!participant) return;
			const answeredAt = Number(entry?.answeredAt || 0);
			participant.timeSpent += Math.max(0, answeredAt - roundStartedAt);
		});

		if (lastSurvivor.eliminateOnFirstWrong) {
			answers.forEach((entry) => {
				if (entry?.correct) return;
				eliminateLastSurvivorParticipant(
					session,
					entry?.userId,
					'Wrong answer',
				);
			});
		}
		if (expired) {
			const latestActive = Array.isArray(lastSurvivor.activeParticipantIds)
				? [...lastSurvivor.activeParticipantIds]
				: [];
			latestActive.forEach((participantId) => {
				if (hasAnswered(participantId)) return;
				eliminateLastSurvivorParticipant(session, participantId, 'Timed out');
			});
		}

		const activeKeySet = new Set(
			(Array.isArray(lastSurvivor.activeParticipantIds)
				? lastSurvivor.activeParticipantIds
				: []
			)
				.map((participantId) => normalizeUserId(participantId))
				.filter(Boolean),
		);

		const pointsPerCorrect = toPositiveNumber(game.settings?.pointsCorrect, 10);
		const rules = game.settings?.gameRules || {};
		answers.forEach((entry) => {
			if (!entry?.correct) return;
			const participant = participants.find((candidate) =>
				sameUserId(candidate?.userId, entry?.userId),
			);
			if (!participant) return;
			if (!activeKeySet.has(normalizeUserId(participant.userId))) return;
			let points = pointsPerCorrect;
			if (rules.hintCost && entry.hintUsed) {
				points = Math.round(points * 0.5);
			}
			participant.score += Math.max(0, points);
		});

		const correctAnswers = answers
			.filter((entry) => Boolean(entry?.correct))
			.sort(
				(left, right) =>
					Number(left?.answeredAt || 0) - Number(right?.answeredAt || 0),
			);
		const winnerAnswer = correctAnswers.find((entry) =>
			activeKeySet.has(normalizeUserId(entry?.userId)),
		);

		round.resolved = true;
		round.winnerId = winnerAnswer ? winnerAnswer.userId : '';
		round.resolvedAt = now;
		if (resolutionReason) round.resolutionReason = resolutionReason;
		syncLastSurvivorRoundState(session);
		session.roundHistory = Array.isArray(session.roundHistory)
			? session.roundHistory
			: [];
		session.roundHistory.push(round);

		const activeCount = Array.isArray(lastSurvivor.activeParticipantIds)
			? lastSurvivor.activeParticipantIds.length
			: 0;
		if (activeCount <= 1) {
			const survivorId =
				activeCount === 1
					? String(lastSurvivor.activeParticipantIds[0] || '')
					: '';
			lastSurvivor.winnerId = survivorId;
			if (survivorId && !lastSurvivor.bonusAwarded) {
				const survivorParticipant = participants.find((entry) =>
					sameUserId(entry?.userId, survivorId),
				);
				if (survivorParticipant) {
					survivorParticipant.score += Math.max(
						0,
						Number(lastSurvivor.bonusPoints) || 0,
					);
				}
				lastSurvivor.bonusAwarded = true;
			}
			finalizeGame(game);
			return true;
		}

		advanceToNextRound(game);
		return true;
	}

	const answers = Array.isArray(round.answers) ? round.answers : [];
	const allAnswered = activeParticipants.length
		? activeParticipants.every((participant) =>
				answers.some((entry) => sameUserId(entry?.userId, participant?.userId)),
			)
		: false;
	const raceMeta = getRaceRoundResolutionMeta(game, session);
	const isSuddenDeath = raceMeta.isSuddenDeath;
	const timeLimit = raceMeta.timeLimitMs;
	const roundStartedAt = parseTimestampMs(round.startedAt) || now;
	const expired = roundStartedAt > 0 && now - roundStartedAt >= timeLimit;

	if (!forceResolve && !allAnswered && !expired) return false;

	const correctAnswers = answers
		.filter((entry) => Boolean(entry?.correct))
		.sort(
			(left, right) =>
				Number(left?.answeredAt || 0) - Number(right?.answeredAt || 0),
		);
	const winner = correctAnswers.length ? correctAnswers[0] : null;

	answers.forEach((entry) => {
		const participant = participants.find((candidate) =>
			sameUserId(candidate?.userId, entry?.userId),
		);
		if (!participant) return;
		const answeredAt = Number(entry?.answeredAt || 0);
		participant.timeSpent += Math.max(0, answeredAt - roundStartedAt);
	});

	if (winner) {
		const rules = game.settings?.gameRules || {};
		const winnerParticipant = activeParticipants.find((entry) =>
			sameUserId(entry?.userId, winner?.userId),
		);

		if (winnerParticipant) {
			let basePoints = toPositiveNumber(game.settings?.pointsCorrect, 10);
			if (isSuddenDeath) basePoints *= 2;

			let multiplier = 1;
			winnerParticipant.winningStreak =
				(winnerParticipant.winningStreak || 0) + 1;

			if (rules.streakMultiplier && winnerParticipant.winningStreak >= 3) {
				multiplier = 2;
			}

			if (rules.bountyBonus) {
				const hotPlayer = activeParticipants.find(
					(entry) =>
						!sameUserId(entry?.userId, winner?.userId) &&
						Number(entry?.winningStreak || 0) >= 3,
				);
				if (hotPlayer) {
					const bounty = Math.round(basePoints * 0.5);
					winnerParticipant.score += bounty;
				}
			}

			activeParticipants.forEach((entry) => {
				if (!sameUserId(entry?.userId, winner?.userId)) {
					entry.winningStreak = 0;
				}
			});

			const responseTimeMs = Math.max(
				0,
				Number(winner.answeredAt || 0) - roundStartedAt,
			);
			const speedRatio = Math.max(
				0,
				1 - responseTimeMs / Math.max(timeLimit, 1),
			);
			const effectiveBase = basePoints * multiplier;
			const speedBonus = Math.round(effectiveBase * 0.5 * speedRatio);

			let finalPoints = effectiveBase + speedBonus;
			if (rules.hintCost && winner.hintUsed) {
				finalPoints = Math.round(finalPoints * 0.5);
			}
			winnerParticipant.score += finalPoints;

			winnerParticipant.totalCorrect =
				(winnerParticipant.totalCorrect || 0) + 1;
			evaluateRechargeTriggers(
				game,
				winnerParticipant,
				finalPoints,
				responseTimeMs,
			);
		}
	} else {
		activeParticipants.forEach((entry) => {
			entry.winningStreak = 0;
		});
	}

	round.resolved = true;
	round.winnerId = winner ? winner.userId : '';
	round.resolvedAt = now;
	if (resolutionReason) round.resolutionReason = resolutionReason;
	session.roundHistory = Array.isArray(session.roundHistory)
		? session.roundHistory
		: [];
	session.roundHistory.push(round);

	advanceToNextRound(game, round.winnerId || '');
	return true;
}

function resolveCardAnswer(
	game,
	pending,
	answer,
	isCorrect,
	timedOut = false,
	hintUsed = false,
) {
	const session = game.session;
	const cardState = session.card;
	normalizeCardSessionState(session);
	const isDrawMode =
		String(cardState?.turnMode || '').trim() === 'target-picks-opponent';
	const participants = session.participants || [];
	const answerLimitPerPlayer = Math.max(
		1,
		Math.floor(Number(cardState?.answerLimitPerPlayer || 5)),
	);
	const ownerId = String(pending?.ownerId || '');
	const targetId = String(pending?.targetId || '');
	const pendingQuestionId = normalizeCardQuestionId(pending?.questionId);
	const owner = participants.find((p) => sameUserId(p.userId, ownerId));
	const target = participants.find((p) => sameUserId(p.userId, targetId));
	const points = game.settings?.pointsCorrect || 10;
	const pendingSpecialId = normalizeSpecialCardId(pending?.specialCard);
	const special =
		pendingSpecialId && isSpecialCardEnabled(game, pendingSpecialId)
			? {
					id: pendingSpecialId,
					label:
						String(pending?.specialCardLabel || '').trim() ||
						SPECIAL_CARD_LABELS[pendingSpecialId] ||
						pendingSpecialId,
				}
			: { id: '', label: '' };
	const rules = game.settings?.gameRules || {};

	if (target) {
		const pendingStartedAt = parseTimestampMs(pending.startedAt);
		const timeoutLimitMs = getPendingCardTimeLimitMs(game, pending);
		const timeSpent = timedOut ? timeoutLimitMs : Date.now() - pendingStartedAt;
		target.timeSpent += timeSpent;
		if (isDrawMode) {
			setCardAnswerCount(
				cardState,
				target.userId,
				getCardAnswerCount(cardState, target.userId) + 1,
			);
		}
	}

	const specialOutcomeNotes = [];
	let keptOwnerCard = false;
	let stolenCardId = '';
	let pointsAwarded = 0;
	let pointsRecipientId = '';

	// Calculate timeSpent for recharge evaluation (needed in both correct/incorrect branches)
	let responseTimeMs = 0;
	if (target) {
		const pendingStartedAt = parseTimestampMs(pending.startedAt);
		const timeoutLimitMs = getPendingCardTimeLimitMs(game, pending);
		responseTimeMs = timedOut ? timeoutLimitMs : Date.now() - pendingStartedAt;
	}

	if (isCorrect) {
		if (target) {
			let finalPoints = points;
			if (special.id === 'double-or-nothing') {
				finalPoints *= 2;
				specialOutcomeNotes.push('Double or Nothing doubled the reward.');
			} else if (special.id === 'combo-breaker') {
				finalPoints = Math.max(1, Math.round(finalPoints * 0.5));
				specialOutcomeNotes.push('Combo Breaker reduced the reward by half.');
			} else if (special.id === 'overclock') {
				finalPoints = Math.max(1, Math.round(finalPoints * 1.5));
				specialOutcomeNotes.push('Overclock boosted the reward.');
			} else if (special.id === 'shield') {
				specialOutcomeNotes.push(
					'Shield did not trigger because the answer was correct.',
				);
			}
			if (rules.hintCost && hintUsed) {
				finalPoints = Math.round(finalPoints * 0.5);
			}
			target.score += finalPoints;
			pointsAwarded = finalPoints;
			pointsRecipientId = target.userId;

			target.totalCorrect = (target.totalCorrect || 0) + 1;
			target.winningStreak = (target.winningStreak || 0) + 1;
			evaluateRechargeTriggers(game, target, finalPoints, responseTimeMs);
		}
	} else if (owner) {
		const ownerStillCompeting = isParticipantStillCompeting(owner);
		let ownerPoints = points;
		if (special.id === 'mirror' || special.id === 'double-or-nothing') {
			ownerPoints *= 2;
			if (special.id === 'mirror') {
				specialOutcomeNotes.push('Mirror doubled the penalty points.');
			} else {
				specialOutcomeNotes.push(
					'Double or Nothing doubled the penalty points.',
				);
			}
		} else if (special.id === 'combo-breaker') {
			ownerPoints = Math.max(1, Math.round(ownerPoints * 1.5));
			specialOutcomeNotes.push(
				'Combo Breaker granted a bonus on wrong answer.',
			);
		} else if (special.id === 'overclock') {
			ownerPoints = Math.max(1, Math.round(ownerPoints * 1.5));
			specialOutcomeNotes.push('Overclock boosted the penalty points.');
		} else if (special.id === 'shield') {
			keptOwnerCard = true;
			specialOutcomeNotes.push(
				'Shield protected this card from being discarded.',
			);
		}

		if (target) {
			target.winningStreak = 0;
		}

		if (ownerStillCompeting) {
			owner.score += ownerPoints;
			pointsAwarded = ownerPoints;
			pointsRecipientId = owner.userId;
		} else {
			specialOutcomeNotes.push(
				'No penalty points were awarded because the owner already forfeited.',
			);
		}
	}

	if (!isCorrect && special.id === 'steal' && owner && target) {
		const targetHand = normalizeCardHandList(cardState.hands?.[targetId] || []);
		const stealable = targetHand.filter(
			(cardId) => !sameCardQuestionId(cardId, pendingQuestionId),
		);
		if (stealable.length) {
			stolenCardId = stealable[Math.floor(Math.random() * stealable.length)];
			cardState.hands[targetId] = targetHand.filter(
				(cardId) => !sameCardQuestionId(cardId, stolenCardId),
			);
			const ownerHandWithStolen = normalizeCardHandList(
				cardState.hands?.[ownerId] || [],
			);
			if (
				!ownerHandWithStolen.some((cardId) =>
					sameCardQuestionId(cardId, stolenCardId),
				)
			) {
				ownerHandWithStolen.push(stolenCardId);
			}
			cardState.hands[ownerId] = ownerHandWithStolen;
			specialOutcomeNotes.push(
				'Steal moved one random card from target to owner.',
			);
		} else {
			specialOutcomeNotes.push(
				'Steal triggered but no target card was available.',
			);
		}
	}

	const ownerHand = normalizeCardHandList(cardState.hands?.[ownerId] || []);
	cardState.hands[ownerId] = keptOwnerCard
		? ownerHand
		: ownerHand.filter(
				(cardId) => !sameCardQuestionId(cardId, pendingQuestionId),
			);

	cardState.pendingCard = null;
	cardState.lastResult = {
		ownerId: pending.ownerId,
		targetId: pending.targetId,
		pickerId: pending.pickerId || pending.targetId || '',
		questionId: pendingQuestionId,
		answer,
		isCorrect,
		hintUsed: Boolean(hintUsed),
		timedOut: Boolean(timedOut),
		autoPlayed: Boolean(pending?.autoPlayed),
		specialCard: special.id || '',
		specialCardLabel: special.label || '',
		specialOutcome: specialOutcomeNotes.join(' '),
		keptOwnerCard: Boolean(keptOwnerCard),
		stolenCardId: stolenCardId || '',
		pointsAwarded,
		pointsRecipientId,
		endedAt: Date.now(),
	};
	cardState.history = Array.isArray(cardState.history) ? cardState.history : [];
	cardState.history.push({ ...cardState.lastResult });

	const turnOrder = cardState.turnOrder || [];
	if (isDrawMode) {
		// Draw mode: picker answers, then turn moves to opponent deck owner.
		const ownerIndex = turnOrder.findIndex((id) => sameUserId(id, ownerId));
		cardState.turnIndex = ownerIndex >= 0 ? ownerIndex : 0;
		cardState.turnStartedAt = Date.now();

		const allPlayersReachedAnswerLimit = turnOrder.length
			? turnOrder.every(
					(playerId) =>
						getCardAnswerCount(cardState, playerId) >= answerLimitPerPlayer,
				)
			: true;
		if (allPlayersReachedAnswerLimit) {
			finalizeGame(game);
			return;
		}

		ensureCardTurnHasCards(game);

		const hasPlayableTurn = (turnOrder || []).some((playerId, index) => {
			if (getCardAnswerCount(cardState, playerId) >= answerLimitPerPlayer) {
				return false;
			}
			if ((turnOrder || []).length < 2) return false;
			const opponentId = turnOrder[(index + 1) % turnOrder.length];
			const opponentHand = normalizeCardHandList(
				cardState.hands?.[opponentId] || [],
			);
			cardState.hands[opponentId] = opponentHand;
			return opponentHand.length > 0;
		});
		if (!hasPlayableTurn) {
			finalizeGame(game);
		}
		return;
	}

	// Classic mode: owner sends card to target, then target gets next turn.
	const targetIndex = turnOrder.findIndex((id) => sameUserId(id, targetId));
	cardState.turnIndex = targetIndex >= 0 ? targetIndex : 0;
	cardState.turnStartedAt = Date.now();

	if (allHandsEmpty(cardState.hands)) {
		finalizeGame(game);
		return;
	}
	ensureCardTurnHasCards(game);
}

function ensureCardTurnHasCards(game) {
	const session = game.session;
	const cardState = session.card;
	if (!cardState || cardState.pendingCard) return;
	const order = cardState.turnOrder || [];
	if (!order.length) return;
	const isDrawMode =
		String(cardState?.turnMode || '').trim() === 'target-picks-opponent';
	if (!isDrawMode) {
		if (allHandsEmpty(cardState.hands)) {
			finalizeGame(game);
			return;
		}
		const previousTurnIndex = Number(cardState.turnIndex) || 0;
		let guard = order.length;
		while (guard > 0) {
			const ownerId = order[cardState.turnIndex];
			const ownerHand = normalizeCardHandList(cardState.hands?.[ownerId] || []);
			cardState.hands[ownerId] = ownerHand;
			if (ownerHand.length) {
				if (
					cardState.turnIndex !== previousTurnIndex ||
					!cardState.turnStartedAt
				) {
					cardState.turnStartedAt = Date.now();
				}
				return;
			}
			cardState.turnIndex = (cardState.turnIndex + 1) % order.length;
			guard -= 1;
		}
		finalizeGame(game);
		return;
	}
	const answerLimitPerPlayer = Math.max(
		1,
		Math.floor(Number(cardState.answerLimitPerPlayer || 5)),
	);
	const allPlayersReachedAnswerLimit = order.every(
		(playerId) =>
			getCardAnswerCount(cardState, playerId) >= answerLimitPerPlayer,
	);
	if (allPlayersReachedAnswerLimit) {
		finalizeGame(game);
		return;
	}
	const previousTurnIndex = Number(cardState.turnIndex) || 0;
	let guard = order.length;
	while (guard > 0) {
		const pickerId = order[cardState.turnIndex];
		const pickerAnswered = getCardAnswerCount(cardState, pickerId);
		const opponentId = order[(cardState.turnIndex + 1) % order.length];
		const opponentHand = normalizeCardHandList(
			cardState.hands?.[opponentId] || [],
		);
		cardState.hands[opponentId] = opponentHand;
		const canPlay =
			pickerAnswered < answerLimitPerPlayer && opponentHand.length > 0;
		if (canPlay) {
			if (
				cardState.turnIndex !== previousTurnIndex ||
				!cardState.turnStartedAt
			) {
				cardState.turnStartedAt = Date.now();
			}
			return;
		}
		cardState.turnIndex = (cardState.turnIndex + 1) % order.length;
		guard -= 1;
	}
	finalizeGame(game);
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Server tick: checks all live games for timeouts ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

function serverTick() {
	activeGames.forEach((game) => {
		if (game.status !== 'live') return;
		game.type = normalizeGameType(game.type);
		if (isCardGameType(game.type)) {
			normalizeCardSessionState(game.session);
		}
		let changed = false;
		const session = game.session || {};
		const tieBreak = session.tieBreak;

		if (tieBreak && !tieBreak.resolved && !isSprintRaceGameType(game.type)) {
			const tieLimit =
				toPositiveNumber(game.settings?.questionTimeLimit, 20) * 1000;
			const tieStartedAtMs = parseTimestampMs(tieBreak.startedAt);
			const tieExpired =
				tieStartedAtMs > 0 && Date.now() - tieStartedAtMs >= tieLimit;
			const tieAnswers = Array.isArray(tieBreak.answers)
				? tieBreak.answers
				: [];
			const tieCandidates = Array.isArray(tieBreak.candidates)
				? tieBreak.candidates
				: [];
			const participants = Array.isArray(session.participants)
				? session.participants
				: [];
			const hasCandidateAnswered = (candidateId) => {
				const normalizedCandidate = normalizeUserId(candidateId);
				if (!normalizedCandidate) return false;
				return tieAnswers.some((entry) => {
					const answerUserId = normalizeUserId(entry?.userId);
					if (!answerUserId) return false;
					if (sameUserId(answerUserId, normalizedCandidate)) return true;
					if (game.mode !== 'team') return false;
					const answerParticipant = participants.find((participant) =>
						sameUserId(participant?.userId, answerUserId),
					);
					const answerTeam = normalizeUserId(answerParticipant?.teamId);
					return Boolean(
						answerTeam && sameUserId(answerTeam, normalizedCandidate),
					);
				});
			};
			const allCandidatesAnswered = tieCandidates.length
				? tieCandidates.every((candidateId) =>
						hasCandidateAnswered(candidateId),
					)
				: false;

			if (tieExpired || allCandidatesAnswered) {
				const correctAnswers = tieAnswers
					.filter((entry) => Boolean(entry?.correct))
					.sort(
						(left, right) =>
							Number(left?.answeredAt || 0) - Number(right?.answeredAt || 0),
					);
				if (correctAnswers.length) {
					const winnerAnswer = correctAnswers[0];
					const winnerUserId = normalizeUserId(winnerAnswer?.userId);
					let winnerId = winnerUserId;
					if (game.mode === 'team') {
						const winnerParticipant = participants.find((participant) =>
							sameUserId(participant?.userId, winnerUserId),
						);
						winnerId =
							winnerParticipant?.teamId || tieCandidates[0] || 'team-a';
					}
					tieBreak.resolved = true;
					finalizeTieBreak(game, winnerId);
					changed = true;
				} else if (game.penaltyQuestions?.length) {
					tieBreak.index = (tieBreak.index || 0) + 1;
					const nextQuestion =
						game.penaltyQuestions[
							tieBreak.index % game.penaltyQuestions.length
						];
					if (nextQuestion?.id) {
						tieBreak.questionId = nextQuestion.id;
						tieBreak.answers = [];
						tieBreak.startedAt = Date.now();
						changed = true;
					}
				}
			}

			if (changed) {
				broadcastGameState(game);
			}
			return;
		}

		if (isCardGameType(game.type)) {
			const cardState = session?.card;
			const warmup = session?.warmup;
			if (warmup && !warmup.resolved) {
				const warmupLimit =
					toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
				if (Date.now() - parseTimestampMs(warmup.startedAt) >= warmupLimit) {
					if (resetWarmupChallenge(game, 'timeout')) {
						changed = true;
					}
				}
				if (changed) {
					broadcastGameState(game);
				}
				return;
			}
			const pending = cardState?.pendingCard;
			if (pending) {
				const limit = getPendingCardTimeLimitMs(game, pending);
				if (Date.now() - parseTimestampMs(pending.startedAt) >= limit) {
					resolveCardAnswer(game, pending, '', false, true);
					changed = true;
				}
			} else if (cardState) {
				const order = cardState.turnOrder || [];
				if (order.length) {
					const isDrawMode =
						String(cardState.turnMode || '').trim() === 'target-picks-opponent';
					const hands = cardState.hands || {};
					const anyCards = Object.values(hands).some((h) => h && h.length);
					if (!anyCards) {
						finalizeGame(game);
						changed = true;
					} else if (isDrawMode) {
						const chooserId = order[cardState.turnIndex];
						const opponentId = order[(cardState.turnIndex + 1) % order.length];
						const answerLimitPerPlayer = Math.max(
							1,
							Math.floor(Number(cardState.answerLimitPerPlayer || 5)),
						);
						const chooserAnswered = getCardAnswerCount(cardState, chooserId);
						const opponentHand = normalizeCardHandList(hands[opponentId] || []);
						hands[opponentId] = opponentHand;
						const allPlayersReachedAnswerLimit = order.every(
							(playerId) =>
								getCardAnswerCount(cardState, playerId) >= answerLimitPerPlayer,
						);
						if (allPlayersReachedAnswerLimit) {
							finalizeGame(game);
							changed = true;
						} else if (
							chooserAnswered >= answerLimitPerPlayer ||
							opponentHand.length === 0
						) {
							ensureCardTurnHasCards(game);
							changed = true;
						} else if (
							opponentHand.length &&
							isAutoPlayTurnTimeoutEnabled(game)
						) {
							const limit =
								toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
							const turnStartedAtMs = parseTimestampMs(cardState.turnStartedAt);
							if (!turnStartedAtMs) {
								cardState.turnStartedAt = Date.now();
								changed = true;
							} else if (
								order.length >= 2 &&
								Date.now() - turnStartedAtMs >= limit
							) {
								const selectedId =
									opponentHand[Math.floor(Math.random() * opponentHand.length)];
								cardState.pendingCard = {
									ownerId: opponentId,
									targetId: chooserId,
									pickerId: chooserId,
									questionId: selectedId,
									startedAt: Date.now(),
									autoPlayed: true,
									specialCard: '',
									specialCardLabel: '',
									timeLimitMs: null,
								};
								cardState.turnStartedAt = null;
								changed = true;
							}
						}
					} else {
						const ownerId = order[cardState.turnIndex];
						const ownerHand = normalizeCardHandList(hands[ownerId] || []);
						hands[ownerId] = ownerHand;
						if (!ownerHand.length) {
							ensureCardTurnHasCards(game);
							changed = true;
						} else if (isAutoPlayTurnTimeoutEnabled(game)) {
							const limit =
								toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
							const turnStartedAtMs = parseTimestampMs(cardState.turnStartedAt);
							if (!turnStartedAtMs) {
								cardState.turnStartedAt = Date.now();
								changed = true;
							} else if (
								order.length >= 2 &&
								Date.now() - turnStartedAtMs >= limit
							) {
								const selectedId =
									ownerHand[Math.floor(Math.random() * ownerHand.length)];
								const targetId =
									order[(cardState.turnIndex + 1) % order.length];
								cardState.pendingCard = {
									ownerId,
									targetId,
									pickerId: ownerId,
									questionId: selectedId,
									startedAt: Date.now(),
									autoPlayed: true,
									specialCard: '',
									specialCardLabel: '',
									timeLimitMs: null,
								};
								cardState.turnStartedAt = null;
								changed = true;
							}
						}
					}
				}
			}
		} else {
			if (isSprintRaceGameType(game.type)) {
				const timeoutState = resolveSprintRaceTimeoutIfNeeded(
					game,
					session,
					'global-time-expired',
				);
				if (timeoutState.expired) {
					if (!timeoutState.results && game.status === 'live') {
						timeoutState.results = finalizeSprintRaceByProgress(
							game,
							'global-time-expired',
						);
					}
					if (timeoutState.results || game.status === 'completed') {
						changed = true;
					}
				}
			}
			const round = session?.round;
			if (round && !round.resolved) {
				const now = Date.now();
				if (isHotPotatoGameType(game.type)) {
					const hotPotato =
						session.hotPotato || initializeHotPotatoRound(game, session);
					if (hotPotato) {
						const totalTimeLimitMs = Number.isFinite(
							Number(hotPotato.totalTimeLimitMs),
						)
							? Number(hotPotato.totalTimeLimitMs)
							: getHotPotatoRules(game).totalTimerMs;
						const roundStartedAt = parseTimestampMs(
							hotPotato.roundStartedAt || round.startedAt,
						);
						const totalExpired =
							roundStartedAt > 0 && now - roundStartedAt >= totalTimeLimitMs;
						if (totalExpired) {
							if (
								resolveNonCardRound(game, {
									force: true,
									reason: 'total-time-expired',
								})
							) {
								changed = true;
							}
						} else {
							const turnDurationMs = Number.isFinite(
								Number(hotPotato.turnDurationMs),
							)
								? Number(hotPotato.turnDurationMs)
								: getHotPotatoRules(game).turnDurationMs;
							const turnStartedAt = parseTimestampMs(hotPotato.turnStartedAt);
							const turnExpired =
								Boolean(hotPotato.autoRotate) &&
								turnStartedAt > 0 &&
								now - turnStartedAt >= turnDurationMs;
							if (
								turnExpired &&
								advanceHotPotatoTurn(session, 'turn-timeout')
							) {
								changed = true;
							}
						}
					}
				} else if (isLastSurvivorGameType(game.type)) {
					const lastSurvivor = initializeLastSurvivorState(game, session);
					if (lastSurvivor) {
						const activeIds = Array.isArray(lastSurvivor.activeParticipantIds)
							? lastSurvivor.activeParticipantIds
							: [];
						const answers = Array.isArray(round.answers) ? round.answers : [];
						const allActiveAnswered = activeIds.length
							? activeIds.every((participantId) =>
									answers.some((entry) =>
										sameUserId(entry?.userId, participantId),
									),
								)
							: true;
						const eliminationTimerMs = Number.isFinite(
							Number(lastSurvivor.eliminationTimerMs),
						)
							? Number(lastSurvivor.eliminationTimerMs)
							: getLastSurvivorRules(game).eliminationTimerMs;
						const roundStartedAt = parseTimestampMs(round.startedAt);
						const expired =
							roundStartedAt > 0 && now - roundStartedAt >= eliminationTimerMs;
						if (allActiveAnswered || expired || activeIds.length <= 1) {
							if (
								resolveNonCardRound(game, {
									force: true,
									reason: expired ? 'timer-expired' : 'all-active-answered',
								})
							) {
								changed = true;
							}
						}
					}
				} else {
					const participants = getRoundEligibleParticipants(session);
					const answers = Array.isArray(round.answers) ? round.answers : [];
					const allAnswered = participants.length
						? participants.every((participant) =>
								answers.some((entry) =>
									sameUserId(entry?.userId, participant?.userId),
								),
							)
						: false;
					const raceMeta = getRaceRoundResolutionMeta(game, session);
					const timeLimit = raceMeta.timeLimitMs;
					const roundStartedAt = parseTimestampMs(round.startedAt);
					const expired =
						roundStartedAt > 0 && now - roundStartedAt >= timeLimit;
					if (allAnswered || expired) {
						if (
							resolveNonCardRound(game, {
								force: true,
								reason: expired ? 'timer-expired' : 'all-answered',
							})
						) {
							changed = true;
						}
					}
				}
			}
		}

		if (changed) {
			broadcastGameState(game);
		}
	});
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Socket event handlers ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

function initGameServer(io) {
	_io = io;

	// Server tick every 1 second
	setInterval(serverTick, 1000);

	io.on('connection', (socket) => {
		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:hydrate ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ admin pushes a game definition for server to track ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:hydrate', (gameData) => {
			if (!gameData?.id) return;
			const existing = activeGames.get(gameData.id);

			// If game is already live on server, DO NOT let a client hydration downgrade it
			if (existing && existing.status === 'live') {
				console.log(
					`[GameServer] Ignored hydration for LIVE game: ${gameData.name} (from ${socket.id})`,
				);
				return;
			}

			const hydrated = JSON.parse(JSON.stringify(gameData));
			hydrated.type = normalizeGameType(hydrated.type);
			normalizeLobbyCounter(hydrated);
			if (!Array.isArray(hydrated.lobbyHistory)) hydrated.lobbyHistory = [];
			if (hydrated.session) {
				ensureLobbyIdentity(hydrated, hydrated.session);
				normalizeCardSessionState(hydrated.session);
				if (isSprintRaceGameType(hydrated.type)) {
					ensureSprintRaceState(hydrated, hydrated.session);
				}
			}
			activeGames.set(gameData.id, hydrated);
			console.log(
				`[GameServer] Hydrated game: ${gameData.name} (${gameData.id}) - Status: ${hydrated.status}`,
			);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:create ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ teacher/admin creates a new game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:create', (gameData, ack) => {
			if (!gameData?.id) {
				if (typeof ack === 'function') ack({ error: 'Missing game id' });
				return;
			}
			const game = JSON.parse(JSON.stringify(gameData));
			game.type = normalizeGameType(game.type);
			normalizeLobbyCounter(game);
			if (!Array.isArray(game.lobbyHistory)) game.lobbyHistory = [];
			if (game.session) {
				ensureLobbyIdentity(game, game.session);
				normalizeCardSessionState(game.session);
			}
			activeGames.set(game.id, game);
			console.log(`[GameServer] Created game: ${game.name} (${game.id})`);
			if (typeof ack === 'function') ack({ ok: true });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:update ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ teacher/admin updates game configuration ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:update', (gameData, ack) => {
			if (!gameData?.id) {
				if (typeof ack === 'function') ack({ error: 'Missing game id' });
				return;
			}
			const existing = activeGames.get(gameData.id);
			if (existing && existing.status === 'live') {
				// Don't allow modifying a live game's config
				if (typeof ack === 'function')
					ack({ error: 'Cannot update a live game' });
				return;
			}
			const updated = JSON.parse(JSON.stringify(gameData));
			updated.type = normalizeGameType(updated.type);
			normalizeLobbyCounter(updated);
			if (!Array.isArray(updated.lobbyHistory)) updated.lobbyHistory = [];
			if (updated.session) {
				ensureLobbyIdentity(updated, updated.session);
				normalizeCardSessionState(updated.session);
			}
			activeGames.set(gameData.id, updated);
			console.log(
				`[GameServer] Updated game: ${gameData.name} (${gameData.id})`,
			);
			if (typeof ack === 'function') ack({ ok: true });
			broadcastGameState(activeGames.get(gameData.id));
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:openLobby ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ set game to open, reset session ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:openLobby', ({ gameId, gameData }, ack) => {
			let game = getTrackedGame(gameId);
			// If game not in memory but client provided data, hydrate it
			if (!game && gameData) {
				const hydrated = JSON.parse(JSON.stringify(gameData));
				hydrated.type = normalizeGameType(hydrated.type);
				normalizeLobbyCounter(hydrated);
				if (!Array.isArray(hydrated.lobbyHistory)) hydrated.lobbyHistory = [];
				if (hydrated.session) {
					ensureLobbyIdentity(hydrated, hydrated.session);
					normalizeCardSessionState(hydrated.session);
					if (isSprintRaceGameType(hydrated.type)) {
						ensureSprintRaceState(hydrated, hydrated.session);
					}
				}
				game = hydrated;
				activeGames.set(gameId, game);
				console.log(
					`[GameServer] Auto-hydrated game from openLobby: ${gameData.name} (${gameId})`,
				);
			}
			if (!game) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			const previousStatus = game.status || 'draft';
			// If game is already live, DO NOT let a "Open Lobby" command reset it to open
			if (previousStatus === 'live') {
				console.log(
					`[GameServer] Ignored openLobby for LIVE game: ${game.name}`,
				);
				if (typeof ack === 'function')
					ack({ ok: true, note: 'Game is already live' });
				return;
			}
			game.status = 'open';
			if (!game.session) {
				game.session = createCurrentLobbySession(game);
			}
			ensureLobbyIdentity(game, game.session);
			if (previousStatus === 'completed') {
				archiveCurrentLobby(game);
				game.session = createFreshLobbySession(game);
				game.results = null;
			}
			if (previousStatus === 'draft') {
				game.session.participants = [];
				game.session.startedAt = '';
				game.session.endedAt = '';
				game.session.roundIndex = 0;
				game.session.roundHistory = [];
				game.session.card = null;
				game.session.warmup = null;
				game.session.tieBreak = null;
				game.session.round = null;
				game.session.hotPotato = null;
				game.session.lastSurvivor = null;
				game.session.sprint = null;
				game.results = null;
			}
			game.session.status = 'open';
			console.log(`[GameServer] Lobby opened: ${game.name}`);
			if (typeof ack === 'function') ack({ ok: true });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:join ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ student joins a game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on(
			'game:join',
			({ gameId, joinCode, userId, userName, classId, teamId }, ack) => {
				const resolvedGame = gameId ? getTrackedGame(gameId) : getTrackedGameByJoinCode(joinCode);
				const game = resolvedGame;
				if (!game) {
					if (typeof ack === 'function') ack({ error: 'Game not found' });
					return;
				}
				if (game.status !== 'open' && game.status !== 'draft') {
					if (typeof ack === 'function')
						ack({ error: 'Game is not open for joining' });
					return;
				}

				if (!game.session) {
					game.session = createCurrentLobbySession(game);
				}
				ensureLobbyIdentity(game, game.session);
				const normalizedUserId = normalizeUserId(userId);
				if (!normalizedUserId) {
					if (typeof ack === 'function') ack({ error: 'Missing user id' });
					return;
				}
				clearPendingPlayerDisconnect(game.id, normalizedUserId);

				// Deduplicate by userId
				let participant = game.session.participants.find((p) =>
					sameUserId(p?.userId, normalizedUserId),
				);
				if (!participant) {
					participant = {
						userId: String(userId || '').trim() || normalizedUserId,
						name: userName || 'Student',
						classId: classId || '',
						teamId: teamId || '',
						score: 0,
						timeSpent: 0,
						winningStreak: 0,
						state: 'active',
						eliminationReason: '',
						ready: false,
						joinedAt: nowIso(),
					};
					game.session.participants.push(participant);
				} else {
					// Re-joining ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ update socket mapping and team
					if (teamId) participant.teamId = teamId;
					if (userName) participant.name = userName;
				}

				// Track socket ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ·ط¢آ¢ط·آ¢ط¢آ ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬أ¢â‚¬ع†ط·آ¢ط¢آ¢ player mapping
				const key = buildPlayerSocketKey(game.id, normalizedUserId);
				playerSockets.set(key, socket.id);
				if (!socketPlayers.has(socket.id))
					socketPlayers.set(socket.id, new Set());
				socketPlayers
					.get(socket.id)
					.add(JSON.stringify({ gameId: game.id, userId: normalizedUserId }));

				if (game.status === 'draft') {
					game.status = 'open';
					game.session.status = 'open';
				}

				// Auto-start check (deduplication safe ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ participants are unique by userId)
				const expected = getLobbyExpectedPlayerTarget(game);
				if (
					game.status !== 'live' &&
					game.session.participants.length > 0 &&
					(expected === 0 || game.session.participants.length >= expected) &&
					game.settings?.autoStart
				) {
					const allReady = game.session.participants.every((entry) =>
						Boolean(entry?.ready),
					);
					if (allReady) {
						const startError = getGameStartValidationError(game);
						if (!startError) {
							startGameOnServer(game);
						}
					}
				}

				console.log(`[GameServer] ${userName || userId} joined ${game.name}`);
				if (typeof ack === 'function') ack({ ok: true, gameId: game.id, session: game.session });
				broadcastGameState(game);
			},
		);

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:ready ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ toggle ready state ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:leave', ({ gameId, userId }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game?.session) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			const normalizedUserId = normalizeUserId(userId);
			if (!normalizedUserId) {
				if (typeof ack === 'function') ack({ error: 'Missing user id' });
				return;
			}
			clearPendingPlayerDisconnect(gameId, normalizedUserId);
			const key = buildPlayerSocketKey(gameId, normalizedUserId);
			if (playerSockets.get(key) === socket.id) {
				playerSockets.delete(key);
			}
			const socketEntries = socketPlayers.get(socket.id);
			if (socketEntries) {
				for (const jsonEntry of Array.from(socketEntries)) {
					try {
						const entry = JSON.parse(jsonEntry);
						if (
							String(entry?.gameId || '') === String(gameId || '') &&
							sameUserId(entry?.userId, normalizedUserId)
						) {
							socketEntries.delete(jsonEntry);
						}
					} catch (e) {
						// ignore parse errors
					}
				}
				if (!socketEntries.size) {
					socketPlayers.delete(socket.id);
				}
			}
			const changed =
				String(game?.status || '').toLowerCase() === 'live'
					? applyPlayerForfeitToGame(game, normalizedUserId, 'left-lobby')
					: removePlayerFromLobby(game, normalizedUserId);
			if (typeof ack === 'function') {
				ack({
					ok: true,
					game: sanitizeForPlayer(game, normalizedUserId),
				});
			}
			if (changed) {
				broadcastGameState(game);
			}
		});

		socket.on('game:ready', ({ gameId, userId }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game?.session) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			const normalizedUserId = normalizeUserId(userId);
			if (!normalizedUserId) {
				if (typeof ack === 'function') ack({ error: 'Missing user id' });
				return;
			}
			const participant = game.session.participants.find((p) =>
				sameUserId(p?.userId, normalizedUserId),
			);
			if (!participant) {
				if (typeof ack === 'function') ack({ error: 'Not a participant' });
				return;
			}
			participant.ready = !participant.ready;

			// Auto-start if all ready and expectedPlayers met
			const expected = getLobbyExpectedPlayerTarget(game);
			if (
				game.status !== 'live' &&
				game.session.participants.length > 0 &&
				(expected === 0 || game.session.participants.length >= expected) &&
				game.settings?.autoStart
			) {
				const allReady = game.session.participants.every((p) => p.ready);
				if (allReady) {
					const startError = getGameStartValidationError(game);
					if (!startError) startGameOnServer(game);
				}
			}

			if (typeof ack === 'function') {
				ack({
					ok: true,
					game: sanitizeForPlayer(game, normalizedUserId),
				});
			}
			broadcastGameState(game);
		});

		socket.on('game:forfeit', ({ gameId, userId, reason }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game?.session) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			const normalizedUserId = normalizeUserId(userId);
			if (!normalizedUserId) {
				if (typeof ack === 'function') ack({ error: 'Missing user id' });
				return;
			}
			clearPendingPlayerDisconnect(gameId, normalizedUserId);
			const changed = applyPlayerForfeitToGame(
				game,
				normalizedUserId,
				reason || 'left-match',
			);
			if (typeof ack === 'function') ack({ ok: changed });
			if (changed) {
				broadcastGameState(game);
			}
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:start ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ admin/teacher starts the game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:start', ({ gameId, gameData = null }, ack) => {
			if (socket.role !== 'admin' || socket.adminAuthenticated !== true) {
				if (typeof ack === 'function') {
					ack({ error: 'Admin Secret is required to start games.' });
				}
				return;
			}
			let game = getTrackedGame(gameId);
			if (!game && gameData && gameData.id === gameId) {
				const hydrated = JSON.parse(JSON.stringify(gameData));
				hydrated.type = normalizeGameType(hydrated.type);
				normalizeLobbyCounter(hydrated);
				if (!Array.isArray(hydrated.lobbyHistory)) hydrated.lobbyHistory = [];
				if (hydrated.session) {
					ensureLobbyIdentity(hydrated, hydrated.session);
					normalizeCardSessionState(hydrated.session);
					if (isSprintRaceGameType(hydrated.type)) {
						ensureSprintRaceState(hydrated, hydrated.session);
					}
				}
				activeGames.set(gameId, hydrated);
				game = hydrated;
				console.log(
					`[GameServer] Hydrated game from game:start: ${game.name} (${gameId})`,
				);
			} else if (game && gameData && gameData.id === gameId) {
				console.log(
					`[GameServer] Ignored stale client snapshot during start and kept tracked lobby state for ${game.name} (${gameId})`,
				);
			}
			if (!game) {
				console.warn(
					`[GameServer] game:start failed - game not found: ${gameId}`,
				);
				if (typeof ack === 'function')
					ack({
						error:
							'Game not found on server. Try Refreshing or Re-opening the lobby.',
					});
				return;
			}
			const startError = getGameStartValidationError(game);
			if (startError) {
				console.warn(
					`[GameServer] game:start failed - validation: ${startError} (${gameId})`,
				);
				if (typeof ack === 'function') ack({ error: startError });
				return;
			}
			const readinessError = getTournamentReadyValidationError(game);
			if (readinessError) {
				console.warn(
					`[GameServer] game:start blocked - readiness: ${readinessError} (${gameId})`,
				);
				if (typeof ack === 'function') ack({ error: readinessError });
				return;
			}
			startGameOnServer(game);
			console.log(`[GameServer] Game started: ${game.name}`);
			if (typeof ack === 'function') {
				ack({ ok: true, game: sanitizeForAdmin(game) });
			}
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:answer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ race mode answer submission ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on(
			'game:answer',
			({ gameId, userId, answer, hintUsed, questionIndex }, ack) => {
				const game = getTrackedGame(gameId);
				if (!game) {
					if (typeof ack === 'function')
						ack({ error: 'Game not found on server (Join again or refresh)' });
					return;
				}
				if (game.status !== 'live') {
					if (typeof ack === 'function')
						ack({ error: `Game is not live (Current status: ${game.status})` });
					return;
				}
				if (isCardGameType(game.type)) {
					if (typeof ack === 'function')
						ack({ error: 'Incorrect action for card-based game' });
					return;
				}
				const session = game.session;
				const normalizedUserId = normalizeUserId(userId);
				if (!normalizedUserId) {
					if (typeof ack === 'function') ack({ error: 'Missing user id' });
					return;
				}
				const participant = (session.participants || []).find((entry) =>
					sameUserId(entry?.userId, normalizedUserId),
				);
				if (!participant) {
					if (typeof ack === 'function')
						ack({ error: 'Participant not found' });
					return;
				}
				if (!isParticipantStillCompeting(participant)) {
					if (typeof ack === 'function') {
						ack({ error: 'You are no longer active in this match' });
					}
					return;
				}

				const answerText = String(answer || '').trim();
				if (!answerText) {
					if (typeof ack === 'function') ack({ error: 'Answer is required' });
					return;
				}

				if (isSprintRaceGameType(game.type)) {
					const sprint = ensureSprintRaceState(game, session);
					if (!sprint) {
						if (typeof ack === 'function')
							ack({ error: 'Sprint state unavailable' });
						return;
					}
					const totalQuestions = Array.isArray(game.questions)
						? game.questions.length
						: 0;
					if (!totalQuestions) {
						if (typeof ack === 'function')
							ack({ error: 'No questions available' });
						return;
					}
					const entry = sprint.byUser?.[normalizedUserId];
					if (!entry) {
						if (typeof ack === 'function')
							ack({ error: 'Sprint participant state missing' });
						return;
					}
					const sprintGlobalLimitMs = normalizeSprintGlobalTimeLimitMs(
						game,
						sprint.globalTimeLimitMs,
					);
					sprint.globalTimeLimitMs = sprintGlobalLimitMs;
					const timeoutState = resolveSprintRaceTimeoutIfNeeded(
						game,
						session,
						'global-time-expired',
					);
					if (timeoutState.expired) {
						const timeoutResults =
							timeoutState.results ||
							finalizeSprintRaceByProgress(game, 'global-time-expired');
						const timeoutWinnerId = String(
							timeoutResults?.sprintResolution?.winnerId || '',
						).trim();
						if (typeof ack === 'function') {
							ack({
								ok: true,
								correct: false,
								roundResolved: true,
								finished: true,
								timedOut: true,
								winnerId: timeoutWinnerId,
							});
						}
						broadcastGameState(game);
						return;
					}
					if (
						Number(entry.questionIndex || 0) >= totalQuestions ||
						parseTimestampMs(entry.finishedAt)
					) {
						if (typeof ack === 'function')
							ack({ error: 'Sprint already finished for you' });
						return;
					}

					const currentEntryIndex = Math.max(
						0,
						Math.floor(Number(entry.questionIndex || 0)),
					);

					// Validate that client is submitting for the correct question
					if (questionIndex !== null && questionIndex !== undefined) {
						const providedIndex = Number(questionIndex);
						if (
							Number.isFinite(providedIndex) &&
							providedIndex !== currentEntryIndex
						) {
							if (typeof ack === 'function') {
								ack({
									error: 'Out of sync: question mismatch',
									expectedIndex: currentEntryIndex,
								});
							}
							return;
						}
					}

					const questionIndexToProcess = currentEntryIndex;
					const question = game.questions[questionIndexToProcess];
					const correct = answerMatchesQuestion(question, answerText);

					const answeredAt = Date.now();
					const startedAt =
						parseTimestampMs(entry.currentQuestionStartedAt) || answeredAt;
					const attemptDuration = Math.max(0, answeredAt - startedAt);
					participant.timeSpent += attemptDuration;
					entry.attempts = Number.isFinite(Number(entry.attempts))
						? Number(entry.attempts) + 1
						: 1;
					entry.timeByQuestion =
						entry.timeByQuestion && typeof entry.timeByQuestion === 'object'
							? entry.timeByQuestion
							: {};
					entry.correctByQuestion =
						entry.correctByQuestion &&
						typeof entry.correctByQuestion === 'object'
							? entry.correctByQuestion
							: {};
					const questionKey = String(questionIndexToProcess);
					const accumulatedDuration = Number(entry.timeByQuestion[questionKey]);
					entry.timeByQuestion[questionKey] =
						(Number.isFinite(accumulatedDuration) ? accumulatedDuration : 0) +
						attemptDuration;

					entry.currentQuestionStartedAt = answeredAt;

					if (correct) {
						entry.questionIndex = Math.min(
							questionIndexToProcess + 1,
							totalQuestions,
						);
						const responseDuration = Number(entry.timeByQuestion[questionKey]);
						const previousDuration = Number(
							entry.correctByQuestion[questionKey],
						);
						if (
							Number.isFinite(responseDuration) &&
							responseDuration >= 0 &&
							(!Number.isFinite(previousDuration) ||
								responseDuration < previousDuration)
						) {
							entry.correctByQuestion[questionKey] = responseDuration;
						}
						let awardedPoints = toPositiveNumber(
							game.settings?.pointsCorrect,
							10,
						);
						if (game.settings?.gameRules?.hintCost && hintUsed) {
							awardedPoints = Math.round(awardedPoints * 0.5);
						}
						participant.score += Math.max(0, awardedPoints);
						entry.correctCount = Number.isFinite(Number(entry.correctCount))
							? Number(entry.correctCount) + 1
							: 1;
					} else {
						entry.questionIndex = questionIndexToProcess;
					}

					if (correct && entry.questionIndex >= totalQuestions) {
						entry.finishedAt = answeredAt;
						sprint.finishOrder = Array.isArray(sprint.finishOrder)
							? sprint.finishOrder
							: [];
						if (
							!sprint.finishOrder.some((id) =>
								sameUserId(id, participant.userId),
							)
						) {
							sprint.finishOrder.push(participant.userId);
						}
						finalizeSprintRaceByWinner(game, participant.userId);
						if (typeof ack === 'function') {
							ack({
								ok: true,
								correct,
								roundResolved: true,
								finished: true,
								winnerId: participant.userId,
							});
						}
						broadcastGameState(game);
						return;
					}

					if (typeof ack === 'function') {
						ack({
							ok: true,
							correct,
							roundResolved: false,
							finished: false,
						});
					}
					broadcastGameState(game);
					return;
				}

				const round = session.round;
				if (!round || round.resolved) {
					if (typeof ack === 'function')
						ack({ error: 'Round already resolved' });
					return;
				}

				// Validate that client is submitting for the correct round
				if (questionIndex !== null && questionIndex !== undefined) {
					const providedIndex = Number(questionIndex);
					if (
						Number.isFinite(providedIndex) &&
						providedIndex !== session.roundIndex
					) {
						if (typeof ack === 'function') {
							ack({
								error: 'Out of sync: round mismatch',
								expectedIndex: session.roundIndex,
							});
						}
						return;
					}
				}

				const isHotPotato = isHotPotatoGameType(game.type);
				const isLastSurvivor = isLastSurvivorGameType(game.type);

				let hotPotatoState = null;
				if (isHotPotato) {
					hotPotatoState =
						session.hotPotato || initializeHotPotatoRound(game, session);
					if (!hotPotatoState) {
						if (typeof ack === 'function')
							ack({ error: 'Hot Potato state unavailable' });
						return;
					}
					if (!sameUserId(hotPotatoState.currentPlayerId, participant.userId)) {
						if (typeof ack === 'function') ack({ error: 'Not your turn' });
						return;
					}
				}

				let lastSurvivorState = null;
				if (isLastSurvivor) {
					lastSurvivorState = initializeLastSurvivorState(game, session);
					if (!lastSurvivorState) {
						if (typeof ack === 'function')
							ack({ error: 'Last Survivor state unavailable' });
						return;
					}
					const isActive = (lastSurvivorState.activeParticipantIds || []).some(
						(id) => sameUserId(id, participant.userId),
					);
					if (!isActive) {
						if (typeof ack === 'function') ack({ error: 'You are eliminated' });
						return;
					}
				}

				if (!isHotPotato) {
					const alreadyAnswered = (round.answers || []).some((entry) =>
						sameUserId(entry?.userId, participant.userId),
					);
					if (alreadyAnswered) {
						if (typeof ack === 'function') ack({ error: 'Already answered' });
						return;
					}
				}

				const question = game.questions.find((entry) =>
					sameCardQuestionId(entry?.id, round?.questionId),
				);
				const correct = answerMatchesQuestion(question, answerText);
				const answeredAt = Date.now();

				round.answers = Array.isArray(round.answers) ? round.answers : [];
				const answerEntry = {
					userId: participant.userId,
					answer: answerText,
					correct,
					hintUsed: Boolean(hintUsed),
					answeredAt,
				};
				if (isHotPotato) {
					answerEntry.turnStartedAt =
						parseTimestampMs(hotPotatoState?.turnStartedAt) || answeredAt;
				}
				round.answers.push(answerEntry);

				let roundResolved = false;
				let shouldEmitQuestionLock = false;

				if (isHotPotato) {
					if (correct) {
						roundResolved = resolveNonCardRound(game, {
							force: true,
							reason: 'correct-answer',
						});
						shouldEmitQuestionLock = roundResolved;
					} else {
						advanceHotPotatoTurn(session, 'wrong-answer');
					}
				} else if (isLastSurvivor) {
					if (!correct && lastSurvivorState?.eliminateOnFirstWrong) {
						eliminateLastSurvivorParticipant(
							session,
							participant.userId,
							'Wrong answer',
						);
						syncLastSurvivorRoundState(session);
					}
					const activeIds = Array.isArray(
						lastSurvivorState?.activeParticipantIds,
					)
						? lastSurvivorState.activeParticipantIds
						: [];
					const allActiveAnswered = activeIds.length
						? activeIds.every((participantId) =>
								round.answers.some((entry) =>
									sameUserId(entry?.userId, participantId),
								),
							)
						: true;
					if (allActiveAnswered || activeIds.length <= 1) {
						roundResolved = resolveNonCardRound(game, {
							force: true,
							reason: allActiveAnswered
								? 'all-active-answered'
								: 'single-survivor',
						});
					}
				} else if (correct) {
					roundResolved = resolveNonCardRound(game, {
						force: true,
						reason: 'correct-answer',
					});
					shouldEmitQuestionLock = roundResolved;
				}

				if (shouldEmitQuestionLock) {
					emitToAllPlayers(gameId, 'game:questionLocked', {
						gameId,
						roundIndex: Math.max(0, Number(session.roundIndex || 0) - 1),
						winnerId: participant.userId,
					});
				}

				if (typeof ack === 'function')
					ack({ ok: true, correct, roundResolved });
				broadcastGameState(game);
			},
		);

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:warmupAnswer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ card duel warmup answer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:warmupAnswer', ({ gameId, userId, answer }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game || game.status !== 'live' || !isCardGameType(game.type)) {
				if (typeof ack === 'function') ack({ error: 'Invalid game state' });
				return;
			}
			const session = game.session;
			const warmup = session.warmup;
			if (!warmup || warmup.resolved) {
				if (typeof ack === 'function')
					ack({ error: 'Warmup already resolved' });
				return;
			}
			const warmupLimit =
				toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
			if (Date.now() - parseTimestampMs(warmup.startedAt) >= warmupLimit) {
				resetWarmupChallenge(game, 'timeout');
				if (typeof ack === 'function') {
					ack({ ok: true, rotated: true, reason: 'timeout' });
				}
				broadcastGameState(game);
				return;
			}
			// Check if already correct
			const alreadyCorrect = warmup.answers?.some(
				(a) => a.userId === userId && a.correct,
			);
			if (alreadyCorrect) {
				if (typeof ack === 'function')
					ack({ error: 'Already answered correctly' });
				return;
			}

			const correct = answerMatch(answer, warmup.answer);

			// Replace previous wrong answer from same user
			warmup.answers = (warmup.answers || []).filter(
				(a) => a.userId !== userId,
			);
			warmup.answers.push({
				userId,
				answer: String(answer).trim(),
				correct,
				answeredAt: Date.now(),
			});

			if (correct && !warmup.resolved) {
				warmup.resolved = true;
				warmup.winnerId = userId;
				const order = session.card?.turnOrder || [];
				const winnerIndex = order.findIndex(
					(id) => String(id || '') === String(userId || ''),
				);
				if (winnerIndex >= 0) session.card.turnIndex = winnerIndex;
				if (session.card) session.card.turnStartedAt = Date.now();

				// Immediate notification of warmup resolution to all participants
				if (_io) {
					const participants = session?.participants || [];
					participants.forEach((p) => {
						try {
							const key = buildPlayerSocketKey(gameId, p.userId);
							const socketId = playerSockets.get(key);
							if (socketId) {
								const sock = _io.sockets.sockets.get(socketId);
								if (sock) {
									sock.emit('game:warmupResolved', {
										gameId,
										winnerId: userId,
										round: warmup.round,
									});
								}
							}
						} catch (err) {
							console.error(
								`Error notifying warmup resolution to ${p.userId}:`,
								err,
							);
						}
					});
				}
			} else {
				const maxAttempts = Math.floor(
					toPositiveNumber(
						warmup.maxAttempts || game.settings?.warmupMaxAttempts,
						WARMUP_MAX_ATTEMPTS,
					),
				);
				warmup.attempts = Number(warmup.attempts || 0) + 1;
				if (warmup.attempts >= maxAttempts) {
					resetWarmupChallenge(game, 'attempts');
					if (typeof ack === 'function') {
						ack({
							ok: true,
							correct: false,
							rotated: true,
							reason: 'attempts',
						});
					}
					broadcastGameState(game);
					return;
				}
			}

			if (typeof ack === 'function') ack({ ok: true, correct });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:playCard ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ card owner plays a card ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:deleteAll', (ack) => {
			if (socket.role !== 'admin' || socket.adminAuthenticated !== true) {
				if (typeof ack === 'function') {
					ack({ error: 'Admin Secret is required to delete games.' });
				}
				return;
			}
			activeGames.clear();
			console.log('[GameServer] All games deleted by admin');
			if (typeof ack === 'function') ack({ ok: true });
			// Notify all admins/clients to clear their local storage via broadcast
			io.emit('admin:syncGames', {
				quizGames: [],
				scope: { type: 'global', allowAll: true },
				syncedAt: new Date().toISOString(),
			});
		});

		socket.on(
			'game:playCard',
			({ gameId, userId, cardId, targetId, specialCard }, ack) => {
				const game = getTrackedGame(gameId);
				if (!game || game.status !== 'live' || !isCardGameType(game.type)) {
					if (typeof ack === 'function') ack({ error: 'Invalid game state' });
					return;
				}
				const session = game.session;
				const cardState = session.card;
				normalizeCardSessionState(session);
				if (session.warmup && !session.warmup.resolved) {
					if (typeof ack === 'function') {
						ack({ error: 'Warmup challenge is still active. Solve it first.' });
					}
					return;
				}
				if (!cardState || cardState.pendingCard) {
					if (typeof ack === 'function') {
						ack({
							error: 'A card is already pending. Wait for the target answer.',
						});
					}
					return;
				}
				const pickerId = cardState.turnOrder?.[cardState.turnIndex];
				const viewerId = normalizeUserId(userId);
				if (!sameUserId(pickerId, viewerId)) {
					const picker = session.participants?.find((p) =>
						sameUserId(p.userId, pickerId),
					);
					const pickerName = picker?.name || 'another player';
					if (typeof ack === 'function') {
						ack({ error: `Not your turn. It is ${pickerName}'s turn.` });
					}
					return;
				}
				const order = cardState.turnOrder || [];
				if (order.length < 2) {
					if (typeof ack === 'function')
						ack({ error: 'Need at least 2 players' });
					return;
				}
				const isDrawMode =
					String(cardState.turnMode || '').trim() === 'target-picks-opponent';
				let sourceOwnerId = pickerId;
				targetId = order[(cardState.turnIndex + 1) % order.length];
				let sourceDeck = normalizeCardHandList(
					cardState.hands?.[sourceOwnerId] || [],
				);
				let selectedId = normalizeCardQuestionId(cardId);
				if (isDrawMode) {
					const answerLimitPerPlayer = Math.max(
						1,
						Math.floor(Number(cardState.answerLimitPerPlayer || 5)),
					);
					const pickerAnswered = getCardAnswerCount(cardState, pickerId);
					if (pickerAnswered >= answerLimitPerPlayer) {
						ensureCardTurnHasCards(game);
						if (typeof ack === 'function') {
							ack({ error: 'You already completed your 5 card challenges.' });
						}
						broadcastGameState(game);
						return;
					}
					sourceOwnerId = order[(cardState.turnIndex + 1) % order.length];
					targetId = pickerId;
					sourceDeck = normalizeCardHandList(
						cardState.hands?.[sourceOwnerId] || [],
					);
					cardState.hands[sourceOwnerId] = sourceDeck;
				} else {
					cardState.hands[sourceOwnerId] = sourceDeck;
				}
				const selectedInSource = sourceDeck.some((handCardId) =>
					sameCardQuestionId(handCardId, selectedId),
				);
				if (!selectedId || !selectedInSource) {
					if (!sourceDeck.length) {
						ensureCardTurnHasCards(game);
						if (typeof ack === 'function') ack({ ok: true });
						broadcastGameState(game);
						return;
					}
					selectedId = normalizeCardQuestionId(
						sourceDeck[Math.floor(Math.random() * sourceDeck.length)],
					);
				} else {
					selectedId =
						sourceDeck.find((handCardId) =>
							sameCardQuestionId(handCardId, selectedId),
						) || selectedId;
					selectedId = normalizeCardQuestionId(selectedId);
				}
				if (!selectedId) {
					if (typeof ack === 'function')
						ack({ error: 'Invalid card selection' });
					return;
				}

				const requestedSpecialId = normalizeSpecialCardId(specialCard);
				const specialUnavailable = getUnavailableSpecialCardMessage(
					game,
					requestedSpecialId,
				);
				if (specialUnavailable) {
					if (typeof ack === 'function') ack({ error: specialUnavailable });
					return;
				}

				const special = resolvePendingSpecialCard(game, requestedSpecialId);
				if (special.id) {
					cardState.usedSpecialCards = Array.isArray(cardState.usedSpecialCards)
						? cardState.usedSpecialCards
						: [];
					if (
						!cardState.usedSpecialCards.some(
							(id) => normalizeSpecialCardId(id) === special.id,
						)
					) {
						cardState.usedSpecialCards.push(special.id);
					}
				}
				cardState.pendingCard = {
					ownerId: sourceOwnerId,
					targetId,
					pickerId,
					questionId: selectedId,
					startedAt: Date.now(),
					specialCard: special.id || '',
					specialCardLabel: special.label || '',
					timeLimitMs: special.timeLimitMs,
				};
				cardState.turnStartedAt = null;

				console.log(
					isDrawMode
						? `[GameServer] Hidden card picked in ${game.name}: ${pickerId} drew from ${sourceOwnerId}`
						: `[GameServer] Card played in ${game.name}: ${sourceOwnerId} -> ${targetId}`,
				);
				if (typeof ack === 'function') ack({ ok: true });
				broadcastGameState(game);
			},
		);

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:cardAnswer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ target answers the card question ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on(
			'game:cardAnswer',
			({ gameId, userId, answer, hintUsed }, ack) => {
				const game = getTrackedGame(gameId);
				if (!game || game.status !== 'live' || !isCardGameType(game.type)) {
					if (typeof ack === 'function') ack({ error: 'Invalid game state' });
					return;
				}
				const session = game.session;
				const cardState = session.card;
				normalizeCardSessionState(session);
				const pending = cardState?.pendingCard;
				if (!pending || !sameUserId(pending.targetId, userId)) {
					if (typeof ack === 'function')
						ack({ error: 'Not your card to answer' });
					return;
				}
				const participant = Array.isArray(session.participants)
					? session.participants.find((entry) => sameUserId(entry?.userId, userId))
					: null;
				if (participant && !isParticipantStillCompeting(participant)) {
					if (typeof ack === 'function') {
						ack({ error: 'You are no longer active in this match' });
					}
					return;
				}
				const pendingQuestionId = normalizeCardQuestionId(pending?.questionId);
				const question = game.questions.find((q) =>
					sameCardQuestionId(q?.id, pendingQuestionId),
				);
				const correct = answerMatchesQuestion(question, answer);
				resolveCardAnswer(
					game,
					pending,
					String(answer).trim(),
					correct,
					false,
					!!hintUsed,
				);

				if (typeof ack === 'function') ack({ ok: true, correct });
				broadcastGameState(game);
			},
		);

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:tieBreakAnswer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ tie-break penalty answer ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:tieBreakAnswer', ({ gameId, userId, answer }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game || game.status !== 'live') {
				if (typeof ack === 'function') ack({ error: 'Invalid game state' });
				return;
			}
			const session = game.session;
			const tieBreak = session.tieBreak;
			if (!tieBreak || tieBreak.resolved) {
				if (typeof ack === 'function') ack({ error: 'Tie-break resolved' });
				return;
			}
			const normalizedUserId = normalizeUserId(userId);
			if (!normalizedUserId) {
				if (typeof ack === 'function') ack({ error: 'Missing user id' });
				return;
			}
			// Check candidate permissions
			const participant = session.participants.find((p) =>
				sameUserId(p?.userId, normalizedUserId),
			);
			const participantTeam = participant?.teamId || '';
			if (tieBreak.candidates && tieBreak.candidates.length) {
				const allowed =
					tieBreak.candidates.some((candidateId) =>
						sameUserId(candidateId, normalizedUserId),
					) ||
					(participantTeam &&
						tieBreak.candidates.some((candidateId) =>
							sameUserId(candidateId, participantTeam),
						));
				if (!allowed) {
					if (typeof ack === 'function')
						ack({ error: 'Not a tie-break candidate' });
					return;
				}
			}
			if (
				tieBreak.answers?.some((a) => sameUserId(a?.userId, normalizedUserId))
			) {
				if (typeof ack === 'function') ack({ error: 'Already answered' });
				return;
			}

			const question = game.penaltyQuestions.find((q) =>
				sameCardQuestionId(q?.id, tieBreak?.questionId),
			);
			const correct = answerMatchesQuestion(question, answer);
			tieBreak.answers = tieBreak.answers || [];
			tieBreak.answers.push({
				userId: normalizedUserId,
				answer: String(answer).trim(),
				correct,
				answeredAt: Date.now(),
			});

			if (correct && !tieBreak.resolved) {
				const correctAnswers = tieBreak.answers.filter((a) => a.correct);
				// Use 500ms tolerance window instead of exact millisecond match
				const TOLERANCE_MS = 500;
				const sameTime =
					correctAnswers.length > 1 &&
					correctAnswers.every(
						(a) =>
							Math.abs(a.answeredAt - correctAnswers[0].answeredAt) <=
							TOLERANCE_MS,
					);
				if (sameTime && game.penaltyQuestions?.length) {
					// Simultaneous ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ new penalty question
					tieBreak.index = (tieBreak.index || 0) + 1;
					const nextQuestion =
						game.penaltyQuestions[
							tieBreak.index % game.penaltyQuestions.length
						];
					tieBreak.questionId = nextQuestion.id;
					tieBreak.answers = [];
					tieBreak.startedAt = Date.now();
				} else {
					tieBreak.resolved = true;
					const winnerId =
						game.mode === 'team'
							? participantTeam || 'team-a'
							: normalizedUserId;
					finalizeTieBreak(game, winnerId);
				}
			}

			if (typeof ack === 'function') ack({ ok: true, correct });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:end ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ force end a game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:end', ({ gameId }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			game.status = 'completed';
			if (game.session) {
				game.session.status = 'completed';
				game.session.endedAt = nowIso();
			}
			game.results = computeResults(game);
			console.log(`[GameServer] Game ended: ${game.name}`);
			if (typeof ack === 'function') ack({ ok: true });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:reset ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ reset a game session ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:reset', ({ gameId }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			archiveCurrentLobby(game);
			game.status = 'draft';
			game.session = null;
			game.results = null;
			// Clear player socket mappings for this game
			for (const [key] of playerSockets) {
				if (key.startsWith(`${gameId}:`)) {
					playerSockets.delete(key);
				}
			}
			console.log(`[GameServer] Game reset: ${game.name}`);
			if (typeof ack === 'function') ack({ ok: true });
			broadcastGameState(game);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:delete ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ admin deletes a game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:delete', ({ gameId }, ack) => {
			if (activeGames.has(gameId)) {
				const game = getTrackedGame(gameId);
				console.log(`[GameServer] Game deleted: ${game.name} (${gameId})`);
				activeGames.delete(gameId);
				// Clean up sockets
				for (const [key] of playerSockets) {
					if (key.startsWith(`${gameId}:`)) {
						playerSockets.delete(key);
					}
				}
			}
			if (typeof ack === 'function') ack({ ok: true });
			// Broadcast to admins so they can remove from their lists if needed
			// (Though usually delete is local-first for the admin who initiated it)
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:sync ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ client requests current state of a game ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:sync', ({ gameId, userId }, ack) => {
			const game = getTrackedGame(gameId);
			if (!game) {
				if (typeof ack === 'function') ack({ error: 'Game not found' });
				return;
			}
			// Re-map socket for this player
			const normalizedUserId = normalizeUserId(userId);
			if (normalizedUserId) {
				clearPendingPlayerDisconnect(gameId, normalizedUserId);
				const key = buildPlayerSocketKey(gameId, normalizedUserId);
				playerSockets.set(key, socket.id);
				if (!socketPlayers.has(socket.id))
					socketPlayers.set(socket.id, new Set());
				socketPlayers
					.get(socket.id)
					.add(JSON.stringify({ gameId, userId: normalizedUserId }));
			}
			let stateChanged = false;
			if (game.status === 'live' && isSprintRaceGameType(game.type)) {
				const timeoutState = resolveSprintRaceTimeoutIfNeeded(
					game,
					game.session,
					'global-time-expired',
				);
				if (timeoutState.expired) {
					if (!timeoutState.results && game.status === 'live') {
						timeoutState.results = finalizeSprintRaceByProgress(
							game,
							'global-time-expired',
						);
					}
					stateChanged = Boolean(
						timeoutState.results || game.status === 'completed',
					);
				}
			}
			if (stateChanged) {
				broadcastGameState(game);
			}

			const sanitized = normalizedUserId
				? sanitizeForPlayer(game, normalizedUserId)
				: sanitizeForAdmin(game);
			if (typeof ack === 'function') ack({ ok: true, game: sanitized });
			socket.emit('game:stateUpdate', sanitized);
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ game:list ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ get all games tracked by the server ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('game:list', (ack) => {
			if (typeof ack === 'function') {
				const list = [];
				activeGames.forEach((game) => {
					const normalizedType = normalizeGameType(game.type);
					if (socket.role === 'admin') {
						list.push(sanitizeForAdmin(game));
					} else {
						list.push({
							id: game.id,
							name: game.name,
							type: normalizedType,
							mode: game.mode,
							status: game.status,
							classIds: game.classIds,
							settings: game.settings,
							lobbyLabel: game.session?.lobbyLabel || '',
							lobbyId: game.session?.lobbyId || '',
							participantCount: game.session?.participants?.length || 0,
						});
					}
				});
				ack({ ok: true, games: list });
			}
		});

		// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Clean up socket mappings on disconnect ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬
		socket.on('disconnect', () => {
			const entries = socketPlayers.get(socket.id);
			if (entries) {
				entries.forEach((jsonEntry) => {
					try {
						const { gameId, userId } = JSON.parse(jsonEntry);
						const key = buildPlayerSocketKey(gameId, userId);
						if (playerSockets.get(key) === socket.id) {
							playerSockets.delete(key);
							scheduleDisconnectForfeit(gameId, userId, 'window-closed');
						}
					} catch (e) {
						// ignore parse errors
					}
				});
				socketPlayers.delete(socket.id);
			}
		});
	});

	console.log('[GameServer] Game server initialized');
}

// ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ Helper: start game (shared by auto-start and manual start) ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬ط·آ·ط¢آ·ط·آ¢ط¢آ£ط·آ·ط¢آ¢ط·آ¢ط¢آ¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â€ڑآ¬ط¹â€کط·آ¢ط¢آ¬ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¥أ¢â‚¬â„¢ط·آ·ط¢آ£ط·آ¢ط¢آ¢ط·آ£ط¢آ¢ط£آ¢أ¢â‚¬ع‘ط¢آ¬ط·آ¹أ¢â‚¬ع©ط·آ·ط¢آ¢ط·آ¢ط¢آ¬

function startGameOnServer(game) {
	if (game.status === 'live') return; // Already live

	const session = game.session;
	if (!session) return;
	ensureLobbyIdentity(game, session);
	game.type = normalizeGameType(game.type);

	game.status = 'live';
	session.status = 'live';
	session.startedAt = nowIso();
	if (!session.hostId) {
		session.hostId = session.participants?.[0]?.userId || game.ownerId || '';
	}

	if (isCardGameType(game.type)) {
		const participants = session.participants.map((p) => p.userId);
		const isDrawMode = isCardDrawGameType(game.type);
		const deck = shuffleArray(
			(Array.isArray(game.questions) ? game.questions : []).filter(
				(card) => card && card.id,
			),
		);
		const perParticipant = participants.length
			? Math.floor(deck.length / participants.length)
			: 0;
		const usableCardCount = perParticipant * participants.length;
		const dealDeck = deck.slice(0, usableCardCount);
		const unusedDeck = deck.slice(usableCardCount).map((card) => card.id);
		const hands = {};
		participants.forEach((id) => (hands[id] = []));
		dealDeck.forEach((card, idx) => {
			const ownerId = participants[idx % participants.length];
			hands[ownerId].push(card.id);
		});
		const answerLimitPerPlayer = isDrawMode ? 5 : 0;
		const answersByPlayer = {};
		participants.forEach((id) => {
			answersByPlayer[id] = 0;
		});
		session.card = {
			hands,
			turnOrder: participants,
			turnIndex: 0,
			turnStartedAt: null,
			pendingCard: null,
			lastResult: null,
			history: [],
			usedSpecialCards: [],
			cardsPerParticipant: perParticipant,
			unusedCards: unusedDeck,
			answerLimitPerPlayer,
			answersByPlayer,
			turnMode: isDrawMode ? 'target-picks-opponent' : 'owner-plays-target',
		};
		const math = generateMathChallenge(
			game.settings?.mathOperators,
			game.settings?.mathMin,
			game.settings?.mathMax,
		);
		session.warmup = {
			question: math.question,
			answer: math.answer,
			startedAt: Date.now(),
			answers: [],
			winnerId: '',
			resolved: false,
			attempts: 0,
			maxAttempts: Math.floor(
				toPositiveNumber(game.settings?.warmupMaxAttempts, WARMUP_MAX_ATTEMPTS),
			),
			round: 1,
			lastResetReason: '',
		};
		session.round = null;
		session.hotPotato = null;
		session.lastSurvivor = null;
		session.sprint = null;
	} else if (isSprintRaceGameType(game.type)) {
		session.card = null;
		session.warmup = null;
		session.tieBreak = null;
		session.round = null;
		session.roundIndex = 0;
		session.roundHistory = [];
		session.hotPotato = null;
		session.lastSurvivor = null;
		session.sprint = null;
		ensureSprintRaceState(game, session);
	} else {
		// Race-like modes (race / hot-potato / last-survivor)
		session.card = null;
		session.warmup = null;
		session.tieBreak = null;
		session.roundIndex = 0;
		session.roundHistory = [];
		session.round = createRoundState(game, 0);
		initializeModeRoundState(game, session);
		session.sprint = null;
	}
}

module.exports = { initGameServer, activeGames };

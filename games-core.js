(function () {
	'use strict';

	const GAME_STORAGE_KEY = 'quizGames';

	function safeParse(value, fallback) {
		try {
			return value ? JSON.parse(value) : fallback;
		} catch (e) {
			return fallback;
		}
	}

	function nowIso() {
		return new Date().toISOString();
	}

	function getQuizGames() {
		return safeParse(localStorage.getItem(GAME_STORAGE_KEY), []);
	}

	function saveQuizGames(games) {
		localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(games));
		return games;
	}

	function normalizeOptionToken(value) {
		return String(value || '')
			.trim()
			.replace(/\s+/g, ' ')
			.toLowerCase();
	}

	function splitAnswerTokens(value, delimiterRegex = /[|,]/) {
		if (Array.isArray(value)) {
			return value
				.map((item) => String(item || '').trim())
				.filter(Boolean);
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
					return parsed
						.map((item) => String(item || '').trim())
						.filter(Boolean);
				}
			} catch (e) {}
		}
		return raw
			.split(delimiterRegex)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function normalizeOptionCandidate(value) {
		let text = String(value || '').replace(/\r/g, '').trim();
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

	function splitOptionTextLegacy(value, answer = '') {
		const raw = String(value || '').replace(/\r/g, '').trim();
		if (!raw) return [];

		const splitBy = (regex) =>
			raw
				.split(regex)
				.map((item) => String(item || '').trim())
				.filter(Boolean);

		const hardDelimiters = [/\n+/, /\|+/, /;+/, /[•·]+/];
		for (const delimiter of hardDelimiters) {
			const parts = splitBy(delimiter);
			if (parts.length > 1) return parts;
		}

		if (raw.includes(',')) {
			const commaParts = splitBy(/,+/);
			const normalizedAnswer = normalizeOptionToken(answer);
			const includesFullAnswer =
				normalizedAnswer &&
				commaParts.some((part) => normalizeOptionToken(part) === normalizedAnswer);
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
			const normalizedAnswer = normalizeOptionToken(answer);
			if (
				!normalizedAnswer ||
				camelParts.some((part) => normalizeOptionToken(part) === normalizedAnswer)
			) {
				return camelParts;
			}
		}

		return [normalizeOptionCandidate(raw)];
	}

	function splitOptionText(value, answer = '') {
		const raw = String(value || '').replace(/\r/g, '').trim();
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
			const normalizedAnswer = normalizeOptionToken(answer);
			const answerTokens = splitAnswerTokens(answer, /[|,]/).map((item) =>
				normalizeOptionToken(item),
			);
			const includesFullAnswer =
				normalizedAnswer &&
				commaParts.some((part) => normalizeOptionToken(part) === normalizedAnswer);
			const includesAllAnswerTokens =
				answerTokens.length > 1 &&
				answerTokens.every((token) =>
					commaParts.some((part) => normalizeOptionToken(part) === token),
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
			const normalizedAnswer = normalizeOptionToken(answer);
			if (
				!normalizedAnswer ||
				camelParts.some((part) => normalizeOptionToken(part) === normalizedAnswer)
			) {
				return camelParts;
			}
		}

		return [normalizeOptionCandidate(raw)];
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

	function extractChoiceTexts(value, answer = '') {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			if (isLikelyQuestionResponseEntry(value)) return [];
			const text = String(
				value.text ??
					value.label ??
					value.value ??
					value.option ??
					value.choice ??
					value.answer ??
					value.content ??
					value.title ??
					'',
			).trim();
			return text ? splitOptionText(text, answer) : [];
		}
		return splitOptionText(value, answer);
	}

	function normalizeQuestionIdValue(value) {
		const visited = new Set();
		const unwrap = (candidate, depth = 0) => {
			if (candidate === null || candidate === undefined) return '';
			if (typeof candidate === 'string' || typeof candidate === 'number') {
				return String(candidate).trim();
			}
			if (depth > 4 || typeof candidate !== 'object') return '';
			if (visited.has(candidate)) return '';
			visited.add(candidate);

			const directKeys = [
				'id',
				'questionId',
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

			const nestedKeys = ['question', 'payload', 'data', 'ref'];
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

	function extractQuestionTextCandidate(value, depth = 0) {
		if (value === null || value === undefined || depth > 4) return '';
		if (typeof value === 'string' || typeof value === 'number') {
			return String(value).trim();
		}
		if (Array.isArray(value)) {
			for (const entry of value) {
				const resolved = extractQuestionTextCandidate(entry, depth + 1);
				if (resolved) return resolved;
			}
			return '';
		}
		if (typeof value !== 'object') return '';
		const candidateKeys = [
			'text',
			'question',
			'prompt',
			'questionText',
			'title',
			'statement',
			'content',
			'value',
			'label',
		];
		for (const key of candidateKeys) {
			if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
			const resolved = extractQuestionTextCandidate(value[key], depth + 1);
			if (resolved) return resolved;
		}
		return '';
	}

	function getQuestionPromptText(question = {}) {
		const candidates = [
			question.text,
			question.question,
			question.prompt,
			question.questionText,
			question.title,
			question.statement,
			question.content,
		];
		const isPlaceholder = (text) => {
			const normalized = String(text || '')
				.trim()
				.toLowerCase()
				.replace(/[_\s]+/g, ' ');
			return (
				normalized === 'question' ||
				normalized === 'question text' ||
				normalized === 'text'
			);
		};
		let fallback = '';
		for (const candidate of candidates) {
			const resolved = extractQuestionTextCandidate(candidate);
			if (!resolved) continue;
			if (!fallback) fallback = resolved;
			if (!isPlaceholder(resolved)) return resolved;
		}
		return fallback;
	}

	function getQuestionAnswerText(question = {}) {
		const directCandidates = [
			question.answer,
			question.correctAnswer,
			question.correct,
			question.expectedAnswer,
			question.solution,
		];
		for (const candidate of directCandidates) {
			if (candidate === null || candidate === undefined) continue;
			const text = String(candidate).trim();
			if (text) return text;
		}
		return '';
	}

	function normalizeQuestion(question = {}) {
		const normalizedQuestionId = normalizeQuestionIdValue(
			question.id || question.questionId || question._id,
		);
		const id =
			normalizedQuestionId ||
			(typeof generateUUID === 'function'
				? generateUUID()
				: `question-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`);
		const answerText = getQuestionAnswerText(question);
		const questionText = getQuestionPromptText(question);
		const rawOptionData = Array.isArray(question.optionData)
			? question.optionData
			: Array.isArray(question.options) && question.options.some((opt) => opt && typeof opt === 'object')
				? question.options
				: Array.isArray(question.answers) &&
					  question.answers.some(
							(opt) =>
								opt &&
								typeof opt === 'object' &&
								!isLikelyQuestionResponseEntry(opt),
					  )
					? question.answers.filter((opt) => !isLikelyQuestionResponseEntry(opt))
				: [];
		const optionData = rawOptionData
			.flatMap((entry) => {
				if (entry && typeof entry === 'object') {
					const text = String(
						entry.text ??
							entry.label ??
							entry.value ??
							entry.option ??
							entry.choice ??
							entry.answer ??
							entry.content ??
							entry.title ??
							'',
					).trim();
					const image = String(entry.image || '').trim();
					if (!text && !image) return [];
					if (text && !image) {
						const parts = splitOptionText(text, answerText);
						if (parts.length > 1) {
							return parts
								.map((part) => String(part || '').trim())
								.filter(Boolean)
								.map((part) => ({
									text: part,
									image: '',
									isImageOnly: false,
								}));
						}
					}
					return [
						{
							text,
							image,
							isImageOnly: Boolean(entry.isImageOnly || (image && !text)),
						},
					];
				}
				const text = String(entry || '').trim();
				if (!text) return [];
				const parts = splitOptionText(text, answerText);
				if (parts.length > 1) {
					return parts
						.map((part) => String(part || '').trim())
						.filter(Boolean)
						.map((part) => ({ text: part, image: '', isImageOnly: false }));
				}
				return [{ text, image: '', isImageOnly: false }];
			})
			.filter(Boolean);

		const choicesFromChoices = Array.isArray(question.choices)
			? question.choices.flatMap((entry) => extractChoiceTexts(entry, answerText))
			: extractChoiceTexts(question.choices, answerText);
		const choicesFromOptions = Array.isArray(question.options)
			? question.options.flatMap((entry) => extractChoiceTexts(entry, answerText))
			: extractChoiceTexts(question.options, answerText);
		const choicesFromAnswers = Array.isArray(question.answers)
			? question.answers.flatMap((entry) => extractChoiceTexts(entry, answerText))
			: extractChoiceTexts(question.answers, answerText);
		const choices = [...choicesFromChoices, ...choicesFromOptions, ...choicesFromAnswers]
			.map((entry) => String(entry || '').trim())
			.filter(Boolean);
		const normalizedChoices = choices.length
			? Array.from(new Set(choices))
			: optionData.map((entry) => entry.text).filter(Boolean);
		const answerTokens = splitAnswerTokens(answerText, /[|,]/).map((item) =>
			normalizeOptionToken(item),
		);
		const choiceTokens = new Set(
			normalizedChoices.map((item) => normalizeOptionToken(item)),
		);
		const hasMultipleAnswerSignal = answerTokens.length > 1;
		let allowMultipleAnswers = Boolean(question.allowMultipleAnswers);
		if (allowMultipleAnswers && hasMultipleAnswerSignal) {
			const looksLikeTrueMulti =
				answerTokens.length > 1 &&
				answerTokens.every((token) => choiceTokens.has(token));
			if (!looksLikeTrueMulti) {
				allowMultipleAnswers = false;
			}
		}
		if (!allowMultipleAnswers && hasMultipleAnswerSignal) {
			const inferredMulti =
				answerTokens.every((token) => choiceTokens.has(token)) &&
				answerTokens.length < choiceTokens.size;
			if (inferredMulti) {
				allowMultipleAnswers = true;
			}
		}

		const declaredDraggable = Boolean(question.isDraggable);
		const rawType = canonicalizeQuestionType(
			question.type || question.questionType || (declaredDraggable ? 'draggable' : ''),
		);
		let normalizedType = rawType || undefined;
		if (rawType === 'draggable' && !declaredDraggable) {
			const textBlob = [
				questionText,
				question.instruction,
			]
				.map((item) => String(item || '').toLowerCase())
				.join(' ');
			const answerLooksLikeChoiceList =
				answerTokens.length > 1 &&
				answerTokens.every((token) => choiceTokens.has(token));
			const hasOrderSignal =
				textBlob.includes('order') ||
				textBlob.includes('ordon') ||
				textBlob.includes('arrange') ||
				textBlob.includes('sequence') ||
				textBlob.includes('rank') ||
				answerText.includes('|');
			if (!hasOrderSignal && answerLooksLikeChoiceList) {
				normalizedType = 'multiple-choice';
			}
		}

		return {
			id,
			text: questionText,
			question: questionText,
			answer: answerText,
			choices: normalizedChoices,
			options: normalizedChoices,
			optionData,
			points: Number.isFinite(question.points) ? question.points : undefined,
			type: normalizedType,
			questionType: normalizedType,
			isDraggable: Boolean(declaredDraggable || normalizedType === 'draggable'),
			allowMultipleAnswers,
			useWordBank: Boolean(question.useWordBank),
			caseSensitive: Boolean(question.caseSensitive),
			instruction: String(question.instruction || '').trim(),
			image: String(question.image || '').trim(),
			distractors: Array.isArray(question.distractors)
				? question.distractors.map((item) => String(item || '').trim()).filter(Boolean)
				: [],
			category: String(question.category || '').trim(),
			categoryId: String(question.categoryId || '').trim(),
			difficulty: String(question.difficulty || '').trim() || 'medium',
			explanation: String(question.explanation || '').trim(),
		};
	}

	function normalizeGame(game = {}) {
		const createdAt = game.createdAt || nowIso();
		const normalizedTournamentContext =
			game.tournamentContext && typeof game.tournamentContext === 'object'
				? {
						tournamentId: String(game.tournamentContext.tournamentId || '').trim(),
						round: Math.max(Number(game.tournamentContext.round) || 0, 0),
						sourceGameId: String(game.tournamentContext.sourceGameId || '').trim(),
						sourceGameName: String(game.tournamentContext.sourceGameName || '').trim(),
						visibility:
							String(game.tournamentContext.visibility || '').trim() ||
							'tournament-only',
						instanceKey: String(game.tournamentContext.instanceKey || '').trim(),
						createdAt:
							String(game.tournamentContext.createdAt || '').trim() || nowIso(),
					}
				: null;
		const defaultSettings = {
			pointsCorrect: 10,
			questionTimeLimit: 20,
			turnTimeLimit: 30,
			autoPlayTurnTimeoutCard: true,
			autoStart: false,
			expectedPlayers: 0,
			teamNames: {
				a: 'Team A',
				b: 'Team B',
			},
			mathMin: 1,
			mathMax: 12,
			mathOperators: ['+', '-', '*'],
			// Game Rules Configuration
			gameRules: {
				// Power-up Cards for Card Duel
				mirrorCard: false,      // Reflect question back to attacker
				timeWarp: false,       // Reduce opponent timer to 5 seconds
				doubleOrNothing: false, // Double points or lose them
				shieldCard: false,      // Keep owner card on opponent miss
				freezeCard: false,      // Heavily reduce target timer
				stealCard: false,       // Steal random target card on miss
				fogCard: false,         // Obscure target question UI
				comboBreakerCard: false, // Reduce target gain / boost owner on miss
				overclockCard: false,   // Faster timer with boosted points
				
				// Streak Multiplier for Lightning Race
				streakMultiplier: false, // 3 wins = On Fire mode (2x points)
				bountyBonus: false,      // Breaker gets bonus points
				
				// Betting Mechanics for Team Mode
				teamBetting: false,      // Bet points on representative
				
				// Sudden Death (General)
				suddenDeath: false,      // Final 3 questions: half time, double points
				
				// Hint Cost
				hintCost: false,         // 50/50 hint costs 50% points
				
				// Custom Game Type
				customGameType: '',      // For personalized games
						
				// Last Survivor Settings
				lastSurvivor: {
					eliminateOnFirstWrong: true,  // Eliminate on first wrong answer
					bonusPoints: 50,              // Bonus points for last survivor
					eliminationTimer: 30,         // Time limit per question
					showEliminationReason: true,  // Show why player was eliminated
				},
				
				// Hot Potato Quiz Settings
				hotPotato: {
					totalTimer: 15,               // Total time per question
					turnDuration: 3,              // Time per player's turn
					pointsPerCorrect: 20,         // Points for correct answer
					autoRotate: true,             // Auto-rotate turns
					showCountdown: true,          // Show visual countdown
				},
			},
		};

		return {
			id:
				game.id ||
				(typeof generateUUID === 'function'
					? generateUUID()
					: `game-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`),
			name: String(game.name || 'New Game').trim(),
			type: game.type || 'race',
			mode: game.mode || 'solo',
			status: game.status || 'draft',
			classIds: Array.isArray(game.classIds) ? game.classIds : [],
			settings: { ...defaultSettings, ...(game.settings || {}) },
			questions: Array.isArray(game.questions)
				? game.questions.map(normalizeQuestion)
				: [],
			penaltyQuestions: Array.isArray(game.penaltyQuestions)
				? game.penaltyQuestions.map(normalizeQuestion)
				: [],
			ownerId: game.ownerId || '',
			createdAt,
			updatedAt: nowIso(),
			session: game.session || null,
			results: game.results || null,
			lobbyCounter: Number.isFinite(Number(game.lobbyCounter))
				? Math.max(1, Math.floor(Number(game.lobbyCounter)))
				: 1,
			lobbyHistory: Array.isArray(game.lobbyHistory) ? game.lobbyHistory : [],
			tournamentContext: normalizedTournamentContext,
		};
	}

	function ensureGameSession(game) {
		if (!Number.isFinite(Number(game.lobbyCounter))) {
			game.lobbyCounter = 1;
		}
		if (!Array.isArray(game.lobbyHistory)) {
			game.lobbyHistory = [];
		}
		if (!game.session) {
			game.session = {
				status: game.status === 'live' ? 'live' : 'open',
				participants: [],
				startedAt: '',
				endedAt: '',
				lobbyId: `${game.id || 'game'}-lobby-${game.lobbyCounter}`,
				lobbyLabel: `Lobby #${game.lobbyCounter}`,
				roundIndex: 0,
				roundHistory: [],
				card: null,
				warmup: null,
				tieBreak: null,
			};
		}

		if (!Array.isArray(game.session.participants)) {
			game.session.participants = [];
		}
		if (!game.session.lobbyId) {
			game.session.lobbyId = `${game.id || 'game'}-lobby-${game.lobbyCounter}`;
		}
		if (!game.session.lobbyLabel) {
			game.session.lobbyLabel = `Lobby #${game.lobbyCounter}`;
		}

		return game.session;
	}

	function ensureParticipant(game, user, teamId) {
		const session = ensureGameSession(game);
		const existing = session.participants.find((p) => p.userId === user.id);
		if (existing) {
			if (teamId) existing.teamId = teamId;
			if (!existing.name) existing.name = user.name || user.username || 'Student';
			return existing;
		}

		const participant = {
			userId: user.id,
			name: user.name || user.username || 'Student',
			classId: user.classId || '',
			teamId: teamId || '',
			score: 0,
			timeSpent: 0,
			ready: false,
			joinedAt: nowIso(),
		};
		session.participants.push(participant);
		return participant;
	}

	function updateGameById(gameId, updater) {
		const games = getQuizGames();
		const index = games.findIndex((g) => g.id === gameId);
		if (index === -1) return null;
		const nextGame = normalizeGame(updater({ ...games[index] }));
		games[index] = nextGame;
		saveQuizGames(games);
		return nextGame;
	}

	function getGameById(gameId) {
		return getQuizGames().find((g) => g.id === gameId) || null;
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
		return {
			question: `${a} ${op} ${b} = ?`,
			answer: String(answer),
		};
	}

	// Last Survivor Game Logic
	function initializeLastSurvivorGame(game) {
		const session = ensureGameSession(game);
		
		// Initialize player states
		if (session.participants) {
			session.participants.forEach(participant => {
				participant.state = 'active'; // active, eliminated, spectator
				participant.eliminationReason = '';
				participant.answered = false;
			});
		}
		
		// Set up current question
		session.currentQuestion = {
			questionId: game.questions[0]?.id || '',
			startedAt: Date.now(),
			answers: [],
			eliminatedPlayers: [],
			activePlayers: session.participants?.map(p => p.userId) || [],
		};
		
		return session;
	}

	function processLastSurvivorAnswer(game, userId, answer, isCorrect) {
		const session = game.session;
		if (!session || !session.currentQuestion) return;
		
		const participant = session.participants?.find(p => p.userId === userId);
		if (!participant || participant.state !== 'active') return;
		
		const settings = game.settings?.gameRules?.lastSurvivor || {};
		
		// Record the answer
		session.currentQuestion.answers.push({
			userId,
			answer,
			isCorrect,
			timestamp: Date.now()
		});
		
		participant.answered = true;
		
		// Check if player should be eliminated
		if (!isCorrect && settings.eliminateOnFirstWrong) {
			participant.state = 'eliminated';
			participant.eliminationReason = 'Wrong answer';
			session.currentQuestion.eliminatedPlayers.push(userId);
			session.currentQuestion.activePlayers = session.currentQuestion.activePlayers.filter(id => id !== userId);
			
			// Check if only one player remains
			if (session.currentQuestion.activePlayers.length === 1) {
				const survivorId = session.currentQuestion.activePlayers[0];
				const survivor = session.participants?.find(p => p.userId === survivorId);
				if (survivor) {
					survivor.score += settings.lastSurvivorBonusPoints || 50;
					survivor.state = 'active'; // Winner stays active
				}
				return 'question_complete';
			}
		}
		
		// Check if all active players have answered
		const allAnswered = session.currentQuestion.activePlayers.every(id => {
			const p = session.participants?.find(part => part.userId === id);
			return p?.answered;
		});
		
		if (allAnswered) {
			return 'question_complete';
		}
		
		return 'continue';
	}

	function advanceLastSurvivorQuestion(game) {
		const session = game.session;
		if (!session) return;
		
		// Reset player states for next question
		if (session.participants) {
			session.participants.forEach(participant => {
				if (participant.state === 'eliminated') {
					participant.state = 'spectator';
				} else {
					participant.state = 'active';
				}
				participant.answered = false;
				participant.eliminationReason = '';
			});
		}
		
		// Move to next question
		const currentIndex = game.questions.findIndex(q => q.id === session.currentQuestion?.questionId);
		const nextIndex = currentIndex + 1;
		
		if (nextIndex < game.questions.length) {
			session.currentQuestion = {
				questionId: game.questions[nextIndex].id,
				startedAt: Date.now(),
				answers: [],
				eliminatedPlayers: [],
				activePlayers: session.participants?.filter(p => p.state === 'active' || p.state === 'spectator').map(p => p.userId) || [],
			};
		} else {
			// Game complete
			game.status = 'completed';
			session.status = 'completed';
			session.endedAt = nowIso();
		}
	}

	// Hot Potato Quiz Game Logic
	function initializeHotPotatoGame(game) {
		const session = ensureGameSession(game);
		
		// Initialize turn order
		const participants = session.participants || [];
		const playerIds = participants.map(p => p.userId);
		
		session.hotPotato = {
			turnOrder: playerIds,
			currentPlayerIndex: 0,
			currentPlayerId: playerIds[0] || '',
			questionStartTime: Date.now(),
			turnStartTime: Date.now(),
			answers: [],
			questionComplete: false,
			winnerId: ''
		};
		
		return session;
	}

	function processHotPotatoAnswer(game, userId, answer, isCorrect) {
		const session = game.session;
		if (!session || !session.hotPotato) return;
		
		const hotPotato = session.hotPotato;
		const settings = game.settings?.gameRules?.hotPotato || {};
		
		// Only current player can answer
		if (userId !== hotPotato.currentPlayerId) return;
		
		// Record the answer
		hotPotato.answers.push({
			userId,
			answer,
			isCorrect,
			timestamp: Date.now()
		});
		
		// Check if answer is correct
		if (isCorrect) {
			// Award points to all players
			const points = settings.pointsPerCorrect || 20;
			if (session.participants) {
				session.participants.forEach(participant => {
					participant.score += points;
				});
			}
			
			hotPotato.questionComplete = true;
			hotPotato.winnerId = userId;
			return 'question_complete';
		} else {
			// Move to next player
			advanceHotPotatoTurn(game);
			return 'turn_advanced';
		}
	}

	function advanceHotPotatoTurn(game) {
		const session = game.session;
		if (!session || !session.hotPotato) return;
		
		const hotPotato = session.hotPotato;
		const settings = game.settings?.gameRules?.hotPotato || {};
		
		// Move to next player
		hotPotato.currentPlayerIndex = (hotPotato.currentPlayerIndex + 1) % hotPotato.turnOrder.length;
		hotPotato.currentPlayerId = hotPotato.turnOrder[hotPotato.currentPlayerIndex];
		hotPotato.turnStartTime = Date.now();
		
		// Check if time is up
		const totalTimeElapsed = Date.now() - hotPotato.questionStartTime;
		const totalTimer = (settings.totalTimer || 15) * 1000;
		
		if (totalTimeElapsed >= totalTimer) {
			hotPotato.questionComplete = true;
			return 'time_expired';
		}
	}

	function getHotPotatoCurrentPlayer(game) {
		const session = game.session;
		if (!session || !session.hotPotato) return null;
		
		return session.participants?.find(p => p.userId === session.hotPotato.currentPlayerId) || null;
	}

	function getHotPotatoTimeRemaining(game) {
		const session = game.session;
		if (!session || !session.hotPotato) return 0;
		
		const hotPotato = session.hotPotato;
		const settings = game.settings?.gameRules?.hotPotato || {};
		
		const totalTimer = (settings.totalTimer || 15) * 1000;
		const totalTimeElapsed = Date.now() - hotPotato.questionStartTime;
		
		return Math.max(0, totalTimer - totalTimeElapsed);
	}

	function getHotPotatoTurnTimeRemaining(game) {
		const session = game.session;
		if (!session || !session.hotPotato) return 0;
		
		const hotPotato = session.hotPotato;
		const settings = game.settings?.gameRules?.hotPotato || {};
		
		const turnDuration = (settings.turnDuration || 3) * 1000;
		const turnTimeElapsed = Date.now() - hotPotato.turnStartTime;
		
		return Math.max(0, turnDuration - turnTimeElapsed);
	}

	window.GameCore = {
		getQuizGames,
		saveQuizGames,
		normalizeGame,
		ensureGameSession,
		ensureParticipant,
		updateGameById,
		getGameById,
		shuffleArray,
		generateMathChallenge,
		nowIso,
		// Last Survivor functions
		initializeLastSurvivorGame,
		processLastSurvivorAnswer,
		advanceLastSurvivorQuestion,
		// Hot Potato Quiz functions
		initializeHotPotatoGame,
		processHotPotatoAnswer,
		advanceHotPotatoTurn,
		getHotPotatoCurrentPlayer,
		getHotPotatoTimeRemaining,
		getHotPotatoTurnTimeRemaining
	};

	// Node.js compatibility — allow require() from server
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = window.GameCore;
	}
})();

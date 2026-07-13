(function () {
	'use strict';

	const state = {
		editingId: null,
		selectedGameId: null,
		watchingGameId: null,
		gamesStudioTab: 'games-studio',
		tournamentStudioTab: 'planner',
		tournamentRoundDraft: [],
		tournamentRoundSearch: {},
		tournamentPlannerHistoryMode: false,
		tournamentPlannerHistoryId: '',
		tournamentSyncStatus: {
			connected: false,
			deviceCount: 0,
			lastSyncAt: '',
		},
		tournamentSyncEventsBound: false,
	};
	const TOURNAMENT_PLANNER_WORKING_STATE_KEY =
		'quizTournamentPlannerWorkingState';

	const GAME_TYPE_ORDER = [
		'race',
		'sprint-race',
		'cards',
		'cards-draw',
		'hot-potato',
		'last-survivor',
	];
	const GAME_TYPE_LABELS = {
		race: 'Lightning Race',
		'sprint-race': 'Sprint Race',
		cards: 'Card Battle',
		'cards-draw': 'Card Draw Battle',
		'hot-potato': 'Hot Potato',
		'last-survivor': 'Last Survivor',
	};

	function getGameTypeLabel(type) {
		return GAME_TYPE_LABELS[type] || 'Game';
	}

	function getGameTypeFromPresetValue(value) {
		return String(value || '').replace(/^preset_/, '');
	}

	function parseIntInRange(value, fallback, min, max) {
		const parsed = parseInt(value, 10);
		if (!Number.isFinite(parsed)) return fallback;
		if (parsed < min) return min;
		if (parsed > max) return max;
		return parsed;
	}

	function normalizeGameRules(rawRules = {}) {
		const rules = rawRules && typeof rawRules === 'object' ? rawRules : {};
		const lastSurvivorRaw =
			rules.lastSurvivor && typeof rules.lastSurvivor === 'object'
				? rules.lastSurvivor
				: {};
		const hotPotatoRaw =
			rules.hotPotato && typeof rules.hotPotato === 'object'
				? rules.hotPotato
				: {};
		const sprintRaw =
			rules.sprint && typeof rules.sprint === 'object' ? rules.sprint : {};
		const sprintGlobalTimer = parseIntInRange(
			sprintRaw.globalTimer ??
				sprintRaw.sprintGlobalTimeLimit ??
				rules.sprintGlobalTimeLimit,
			90,
			15,
			1800,
		);

		return {
			mirrorCard: Boolean(rules.mirrorCard),
			timeWarp: Boolean(rules.timeWarp),
			doubleOrNothing: Boolean(rules.doubleOrNothing),
			shieldCard: Boolean(rules.shieldCard),
			freezeCard: Boolean(rules.freezeCard),
			stealCard: Boolean(rules.stealCard),
			fogCard: Boolean(rules.fogCard),
			comboBreakerCard: Boolean(rules.comboBreakerCard),
			overclockCard: Boolean(rules.overclockCard),
			streakMultiplier: Boolean(rules.streakMultiplier),
			bountyBonus: Boolean(rules.bountyBonus),
			teamBetting: Boolean(rules.teamBetting),
			suddenDeath: Boolean(rules.suddenDeath),
			hintCost: Boolean(rules.hintCost),
			autoPlayTimeoutCard:
				rules.autoPlayTimeoutCard !== undefined
					? Boolean(rules.autoPlayTimeoutCard)
					: true,
			customGameType: String(rules.customGameType || '').trim(),
			sprintGlobalTimeLimit: sprintGlobalTimer,
			sprint: {
				globalTimer: sprintGlobalTimer,
			},
			lastSurvivor: {
				eliminateOnFirstWrong:
					lastSurvivorRaw.eliminateOnFirstWrong !== undefined
						? Boolean(lastSurvivorRaw.eliminateOnFirstWrong)
						: rules.eliminateOnFirstWrong !== undefined
							? Boolean(rules.eliminateOnFirstWrong)
							: true,
				bonusPoints: parseIntInRange(
					lastSurvivorRaw.bonusPoints ??
						lastSurvivorRaw.lastSurvivorBonusPoints ??
						rules.lastSurvivorBonusPoints,
					50,
					10,
					200,
				),
				eliminationTimer: parseIntInRange(
					lastSurvivorRaw.eliminationTimer ?? rules.lastSurvivorTimer,
					30,
					10,
					120,
				),
				showEliminationReason:
					lastSurvivorRaw.showEliminationReason !== undefined
						? Boolean(lastSurvivorRaw.showEliminationReason)
						: rules.showEliminationReason !== undefined
							? Boolean(rules.showEliminationReason)
							: true,
			},
			hotPotato: {
				totalTimer: parseIntInRange(
					hotPotatoRaw.totalTimer ?? rules.hotPotatoTotalTimer,
					15,
					10,
					120,
				),
				turnDuration: parseIntInRange(
					hotPotatoRaw.turnDuration ?? rules.hotPotatoTurnDuration,
					3,
					1,
					10,
				),
				pointsPerCorrect: parseIntInRange(
					hotPotatoRaw.pointsPerCorrect ?? rules.hotPotatoPoints,
					20,
					5,
					100,
				),
				autoRotate:
					hotPotatoRaw.autoRotate !== undefined
						? Boolean(hotPotatoRaw.autoRotate)
						: rules.autoRotate !== undefined
							? Boolean(rules.autoRotate)
							: true,
				showCountdown:
					hotPotatoRaw.showCountdown !== undefined
						? Boolean(hotPotatoRaw.showCountdown)
						: rules.showCountdown !== undefined
							? Boolean(rules.showCountdown)
							: true,
			},
		};
	}

	function supportsTeamModeForType(type) {
		return GAME_TYPE_ORDER.includes(String(type || '').trim());
	}

	function byId(id) {
		return document.getElementById(id);
	}

	function getCurrentUser() {
		return window.Auth?.getCurrentUser ? window.Auth.getCurrentUser() : null;
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
			session.lobbyId = `${game.id}-lobby-${lobbyCounter}`;
		}
		if (!session.lobbyLabel) {
			session.lobbyLabel = `Lobby #${lobbyCounter}`;
		}
	}

	function archiveCompletedLobby(game) {
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
			archivedAt: new Date().toISOString(),
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
			sprint: null,
			warmup: null,
			tieBreak: null,
			round: null,
			roundModes: [], // Added to store per-round target modes
		};
	}

	function createInitialLobbySession(game) {
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
			sprint: null,
			warmup: null,
			tieBreak: null,
			round: null,
			roundModes: [],
		};
	}

	function isTournamentManagedGame(game) {
		const context =
			game?.tournamentContext && typeof game.tournamentContext === 'object'
				? game.tournamentContext
				: null;
		if (!context) return false;
		const tournamentId = String(context.tournamentId || '').trim();
		const visibility = String(context.visibility || '')
			.trim()
			.toLowerCase();
		return Boolean(
			tournamentId && (!visibility || visibility === 'tournament-only'),
		);
	}

	function getTournamentTemplateGames(games = []) {
		return (Array.isArray(games) ? games : []).filter(
			(game) => game?.id && !isTournamentManagedGame(game),
		);
	}

	function getAdminLobbyExpectedPlayers(game) {
		const configuredTarget = Math.max(
			Number(game?.settings?.expectedPlayers) || 0,
			0,
		);
		const tournamentTarget = Math.max(
			Number(game?.settings?.tournamentExpectedPlayers) || 0,
			0,
		);
		if (!isTournamentManagedGame(game)) {
			return Math.max(configuredTarget, tournamentTarget);
		}
		const tournamentId = String(game?.tournamentContext?.tournamentId || '').trim();
		const activeTournament = getActiveTournament();
		const activeTournamentId = String(activeTournament?.id || '').trim();
		const activeParticipantCount =
			tournamentId && tournamentId === activeTournamentId
				? (Array.isArray(activeTournament?.participants)
						? activeTournament.participants
						: []
				  ).filter((entry) => String(entry?.userId || entry?.id || '').trim())
						.length
				: 0;
		return Math.max(configuredTarget, tournamentTarget, activeParticipantCount, 2);
	}

	function buildTournamentInstanceId(
		tournamentId,
		roundNumber,
		sourceGameId,
		slotIndex,
	) {
		const safeTournamentId =
			String(tournamentId || 'tournament').trim() || 'tournament';
		const safeSourceId = String(sourceGameId || 'game').trim() || 'game';
		const safeRound = Math.max(Number(roundNumber) || 1, 1);
		const safeSlot = Math.max(Number(slotIndex) || 0, 0) + 1;
		return `tournament--${safeTournamentId}--r${safeRound}--g${safeSlot}--${safeSourceId}`;
	}

	function cloneTournamentTemplateGame(
		templateGame,
		tournamentMeta = {},
		roundNumber = 1,
		slotIndex = 0,
	) {
		if (!templateGame?.id) return null;
		const nowIso = new Date().toISOString();
		const sourceGameId = String(templateGame.id || '').trim();
		const instanceId = buildTournamentInstanceId(
			tournamentMeta.id,
			roundNumber,
			sourceGameId,
			slotIndex,
		);
		const cloned = JSON.parse(JSON.stringify(templateGame));
		cloned.id = instanceId;
		cloned.name =
			String(templateGame.name || 'Untitled Game').trim() || 'Untitled Game';
		cloned.status = 'draft';
		cloned.results = null;
		cloned.lobbyCounter = 1;
		cloned.lobbyHistory = [];
		cloned.session = createInitialLobbySession({
			id: instanceId,
			lobbyCounter: 1,
		});
		cloned.createdAt = nowIso;
		cloned.updatedAt = nowIso;
		const configuredExpectedPlayers = Math.max(
			Number(templateGame?.settings?.expectedPlayers) || 0,
			0,
		);
		const inheritedTournamentTarget = Math.max(
			Number(templateGame?.settings?.tournamentExpectedPlayers) || 0,
			0,
		);
		const initialTournamentTarget = Math.max(
			configuredExpectedPlayers,
			inheritedTournamentTarget,
			2,
		);
		cloned.settings = {
			...(cloned.settings || {}),
			expectedPlayers: initialTournamentTarget,
			tournamentExpectedPlayers: initialTournamentTarget,
		};
		cloned.tournamentContext = {
			tournamentId: String(tournamentMeta.id || '').trim(),
			round: Math.max(Number(roundNumber) || 1, 1),
			sourceGameId,
			sourceGameName:
				String(templateGame.name || 'Untitled Game').trim() || 'Untitled Game',
			visibility: 'tournament-only',
			instanceKey: `${Math.max(Number(roundNumber) || 1, 1)}:${Math.max(
				Number(slotIndex) || 0,
				0,
			)}`,
			createdAt: nowIso,
		};
		ensureLobbyIdentity(cloned, cloned.session);
		return cloned;
	}

	function buildTournamentInstanceAssignments(
		roundAssignments,
		tournamentMeta,
		templateLookup,
	) {
		const createdGames = [];
		const normalizedAssignments = Array.isArray(roundAssignments)
			? roundAssignments
			: [];
		const assignments = normalizedAssignments.map((entry, index) => {
			const roundNumber = Math.max(Number(entry?.round) || index + 1, 1);
			const gameIds = [
				...new Set(
					(Array.isArray(entry?.gameIds) ? entry.gameIds : [])
						.map((id) => String(id || '').trim())
						.filter(Boolean),
				),
			];
			const gameDetails = gameIds.map((templateGameId, slotIndex) => {
				const templateGame = templateLookup.get(templateGameId) || null;
				if (!templateGame) {
					return {
						id: templateGameId,
						instanceId: '',
						sourceGameId: templateGameId,
						name: 'Removed Game',
						type: 'race',
						mode: 'solo',
					};
				}
				const instanceGame = cloneTournamentTemplateGame(
					templateGame,
					tournamentMeta,
					roundNumber,
					slotIndex,
				);
				if (instanceGame) {
					createdGames.push(instanceGame);
				}
				return {
					id: templateGameId,
					instanceId: instanceGame?.id || '',
					sourceGameId: templateGameId,
					name: templateGame.name || 'Untitled Game',
					type: templateGame.type || 'race',
					mode: templateGame.mode || 'solo',
				};
			});
			return {
				...entry,
				round: roundNumber,
				gameIds,
				gameDetails,
				status: index === 0 ? 'active' : 'pending',
			};
		});
		return {
			assignments,
			createdGames,
		};
	}

	function persistTournamentGameInstances(games = []) {
		const instanceGames = (Array.isArray(games) ? games : []).filter(
			(game) => game?.id,
		);
		if (!instanceGames.length) return [];
		const existingGames = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
		persistAuthoritativeGames([...existingGames, ...instanceGames]);
		syncGamesIfPossible();
		try {
			const socket = window.adminSocket || window.clientSocket;
			if (socket && typeof socket.emit === 'function') {
				instanceGames.forEach((game) => {
					socket.emit('game:create', game);
				});
			}
		} catch (error) {
			console.error(
				'[Tournament] Failed to push tournament game instances:',
				error,
			);
		}
		return instanceGames;
	}

	function syncGamesIfPossible() {
		if (typeof window.syncGamesToClients !== 'function') return;
		const isAdmin = window.Auth?.isAdmin && window.Auth.isAdmin();
		const isTeacher = window.Auth?.isTeacher && window.Auth.isTeacher();
		if (isAdmin || isTeacher) {
			window.syncGamesToClients();
		}
	}

	function persistAuthoritativeGames(games, options = {}) {
		const normalizedGames = [];
		const seenIds = new Set();
		(Array.isArray(games) ? games : []).forEach((entry) => {
			if (!entry?.id) return;
			const normalized = GameCore.normalizeGame
				? GameCore.normalizeGame(entry)
				: entry;
			const id = String(normalized?.id || '').trim();
			if (!id || seenIds.has(id)) return;
			seenIds.add(id);
			normalizedGames.push({
				...normalized,
				id,
			});
		});
		GameCore.saveQuizGames(normalizedGames);
		localStorage.setItem(
			'quizGamesSyncedAt',
			String(options.syncedAt || new Date().toISOString()),
		);
		window.dispatchEvent(
			new CustomEvent('quiz:games-updated', {
				detail: { games: normalizedGames },
			}),
		);
		return normalizedGames;
	}

	function upsertAuthoritativeGameSnapshot(game, options = {}) {
		if (!game?.id) return null;
		const gameId = String(game.id || '').trim();
		if (!gameId) return null;
		const normalized = GameCore.normalizeGame
			? GameCore.normalizeGame(game)
			: game;
		const existingGames = GameCore.getQuizGames
			? GameCore.getQuizGames().slice()
			: [];
		const index = existingGames.findIndex(
			(entry) => String(entry?.id || '').trim() === gameId,
		);
		if (index >= 0) {
			existingGames[index] = {
				...existingGames[index],
				...normalized,
				id: gameId,
			};
		} else {
			existingGames.push({
				...normalized,
				id: gameId,
			});
		}
		persistAuthoritativeGames(existingGames, {
			syncedAt: options.syncedAt || new Date().toISOString(),
		});
		return normalized;
	}

	function requestAuthoritativeGameList(callback, socketOverride = null) {
		const socket =
			socketOverride || window.adminSocket || window.clientSocket || null;
		if (!socket || !socket.connected) {
			if (typeof callback === 'function') callback(null, 'offline');
			return;
		}
		socket.emit('game:list', (response) => {
			if (!response?.ok || !Array.isArray(response.games)) {
				if (typeof callback === 'function') {
					callback(null, response?.error || 'list_unavailable');
				}
				return;
			}

			// Core fix for "Library always empty after losing session":
			// The node game server only stores games in memory (`activeGames`).
			// If the node server restarts, it starts with 0 games.
			// When an admin connects, the server sends `[]`. We MUST NOT wipe the admin's
			// local database with this empty array. Instead, we hydrate the server.
			const localGames = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
			if (response.games.length === 0 && localGames.length > 0) {
				console.warn(
					'[Realtime] Server returned 0 games but local has games. Hydrating server...',
				);
				localGames.forEach((game) => {
					socket.emit('game:hydrate', game);
				});
				if (typeof callback === 'function') callback(localGames, null);
				return;
			}

			const stored = persistAuthoritativeGames(response.games, {
				syncedAt: new Date().toISOString(),
			});
			if (typeof callback === 'function') callback(stored, null);
		});
	}
	window.requestAuthoritativeGameList = requestAuthoritativeGameList;
	window.applyAuthoritativeGameList = persistAuthoritativeGames;

	function getClasses() {
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('classes');
		} catch (e) {
			return [];
		}
	}

	function getCategories() {
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('categories');
		} catch (e) {
			return [];
		}
	}

	function getQuestions() {
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('questions');
		} catch (e) {
			return [];
		}
	}

	function renderClassOptions() {
		const list = byId('gameClassList');
		if (!list) return;
		const classes = getClasses();
		if (!classes.length) {
			list.innerHTML =
				'<div class="empty-state-small">No classes available.</div>';
			return;
		}
		list.innerHTML = classes
			.map(
				(cls) => `
				<label class="checkbox-list-item">
					<input type="checkbox" value="${escapeHtml(cls.id)}" />
					<span>${escapeHtml(cls.name)}</span>
				</label>
			`,
			)
			.join('');
	}

	function renderCategoryOptions(selectId) {
		const select = byId(selectId);
		if (!select) return;
		const categories = getCategories().filter((cat) => {
			const id = String(cat.id || '')
				.trim()
				.toLowerCase();
			const name = String(cat.name || '')
				.trim()
				.toLowerCase();
			return id !== 'uncategorized' && name !== 'uncategorized';
		});
		select.innerHTML =
			'<option value="">All Categories</option>' +
			'<option value="uncategorized">Uncategorized</option>' +
			categories
				.map(
					(cat) =>
						`<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`,
				)
				.join('');
	}

	function getCategoryName(categoryId, categoryMap) {
		if (!categoryId) return 'Uncategorized';
		return categoryMap.get(categoryId) || categoryId;
	}

	function questionMatchesCategory(question, categoryId, categoryMap) {
		if (!categoryId) return true;
		const rawCategory = question.categoryId || question.category || '';
		if (categoryId === 'uncategorized') {
			return !rawCategory;
		}
		if (rawCategory === categoryId) return true;
		const categoryName = categoryMap.get(categoryId);
		return categoryName ? rawCategory === categoryName : false;
	}

	function buildBankItem(question, index, categoryMap) {
		const text = String(question.question || question.text || '').trim();
		const answer = String(question.answer || '').trim();
		const categoryId = question.categoryId || question.category || '';
		const categoryLabel = getCategoryName(categoryId, categoryMap);
		const typeValue = window.QuizTypes?.normalize
			? window.QuizTypes.normalize(question.type || question.questionType, question)
			: question.type || question.questionType || 'multiple-choice';
		const typeLabel = window.QuizTypes?.label
			? window.QuizTypes.label(typeValue, question)
			: typeValue;
		const points = Number.parseFloat(question.points) || 1;
		return `
			<label class="game-bank-item">
				<input type="checkbox" data-question-index="${index}" />
				<div>
					<div class="bank-text">${escapeHtml(text || 'Untitled question')}</div>
					<div class="bank-meta">${escapeHtml(categoryLabel)} • ${escapeHtml(typeLabel)}${
						answer ? ` • Answer: ${escapeHtml(answer)}` : ''
					}</div>
				</div>
			</label>
		`;
	}

	function getSelectedQuestionIds(containerId) {
		const container = byId(containerId);
		if (!container) return new Set();
		return new Set(
			Array.from(container.querySelectorAll('.game-selected-question'))
				.map((row) => row.dataset.questionId)
				.filter(Boolean),
		);
	}

	function renderQuestionBank(selectId, listId, searchId) {
		const list = byId(listId);
		if (!list) return;
		const categoryId = byId(selectId)?.value || '';
		const searchTerm = (byId(searchId)?.value || '').trim().toLowerCase();
		
		// Get active type filter
		const filterContainerId = selectId.replace('CategorySelect', 'TypeFilters');
		const filterContainer = byId(filterContainerId);
		const activeBadge = filterContainer?.querySelector('.filter-badge.active');
		const selectedType = activeBadge?.dataset.type || 'all';

		const categoryMap = new Map(
			getCategories().map((cat) => [cat.id, cat.name]),
		);
		const questions = getQuestions().map((question, index) => ({
			question,
			index,
			id: question.id || `bank-${index}`,
		}));
		const excludeIds =
			listId === 'gamePenaltyQuestionBank'
				? getSelectedQuestionIds('gameQuestionsList')
				: listId === 'gameMainQuestionBank'
					? getSelectedQuestionIds('gamePenaltyList')
					: new Set();
		const filtered = questions.filter(({ question, id }) => {
			if (excludeIds.has(id)) return false;
			
			// Filter by category
			if (!questionMatchesCategory(question, categoryId, categoryMap))
				return false;
			
			// Filter by type badge
			if (selectedType !== 'all') {
				const qType = window.QuizTypes?.normalize
					? window.QuizTypes.normalize(question.type || question.questionType, question)
					: (question.type || question.questionType || '').toLowerCase();
				if (qType !== selectedType) return false;
			}

			if (!searchTerm) return true;
			const haystack = [
				question.question,
				question.answer,
				question.explanation,
				question.options?.join(' '),
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return haystack.includes(searchTerm);
		});

		if (!filtered.length) {
			list.innerHTML =
				'<div class="empty-state-small">No questions found.</div>';
			return;
		}

		list.innerHTML = filtered
			.map(({ question, index }) => buildBankItem(question, index, categoryMap))
			.join('');
	}

	function refreshGameQuestionBanks() {
		renderQuestionBank(
			'gameMainCategorySelect',
			'gameMainQuestionBank',
			'gameMainQuestionSearch',
		);
		renderQuestionBank(
			'gamePenaltyCategorySelect',
			'gamePenaltyQuestionBank',
			'gamePenaltyQuestionSearch',
		);
	}

	function normalizeGameQuestion(question = {}) {
		return GameCore.normalizeGame({
			questions: [question],
			penaltyQuestions: [],
		}).questions[0];
	}

	function encodeQuestionMeta(question = {}) {
		const meta = { ...question };
		delete meta.id;
		delete meta.text;
		delete meta.question;
		delete meta.answer;
		delete meta.choices;
		delete meta.options;
		try {
			return encodeURIComponent(JSON.stringify(meta));
		} catch (e) {
			return '';
		}
	}

	function decodeQuestionMeta(metaValue) {
		const raw = String(metaValue || '').trim();
		if (!raw) return {};
		try {
			const parsed = JSON.parse(decodeURIComponent(raw));
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (e) {
			return {};
		}
	}

	function buildQuestionRow(question = {}) {
		const q =
			question && question.id ? question : normalizeGameQuestion(question);
		const metaEncoded = encodeQuestionMeta(q);
		return `
			<div class="game-selected-question" data-question-id="${escapeHtml(q.id)}" data-question-meta="${escapeHtml(metaEncoded)}">
				<input type="text" class="form-control" data-field="text" placeholder="Question" value="${escapeHtml(q.text)}" />
				<input type="text" class="form-control" data-field="answer" placeholder="Correct answer" value="${escapeHtml(q.answer)}" />
				<input type="text" class="form-control" data-field="choices" placeholder="Choices (comma separated)" value="${escapeHtml(q.choices?.join(', ') || '')}" />
				<button type="button" class="btn btn-danger-soft" data-action="remove">Remove</button>
			</div>
		`;
	}

	function addQuestionRow(containerId, question, options = {}) {
		const container = byId(containerId);
		if (!container) return;
		const normalized =
			question && question.id ? question : normalizeGameQuestion(question);
		if (options.unique && normalized.id) {
			const existing = container.querySelector(
				`[data-question-id="${CSS.escape(normalized.id)}"]`,
			);
			if (existing) return;
		}
		container.insertAdjacentHTML('beforeend', buildQuestionRow(normalized));
	}

	function addSelectedFromBank(listId, targetListId) {
		const list = byId(listId);
		if (!list) return;
		const checked = Array.from(
			list.querySelectorAll('input[type="checkbox"]:checked'),
		);
		if (!checked.length) {
			showToast('Select at least one question', 'error');
			return;
		}
		const questions = getQuestions();
		checked.forEach((checkbox) => {
			const index = parseInt(checkbox.dataset.questionIndex, 10);
			const source = questions[index];
			if (!source) return;
			const choices = Array.isArray(source.options)
				? source.options
				: Array.isArray(source.optionData)
					? source.optionData.map((opt) => opt.text)
					: [];
			addQuestionRow(
				targetListId,
				{
					id: source.id || `bank-${index}`,
					text: source.question || source.text || '',
					answer: source.answer || '',
					choices,
					type: source.type || source.questionType || '',
					questionType: source.questionType || source.type || '',
					isDraggable: Boolean(source.isDraggable),
					allowMultipleAnswers: Boolean(source.allowMultipleAnswers),
					optionData: Array.isArray(source.optionData) ? source.optionData : [],
					options: Array.isArray(source.options) ? source.options : choices,
					useWordBank: Boolean(source.useWordBank),
					caseSensitive: Boolean(source.caseSensitive),
					instruction: source.instruction || '',
					image: source.image || '',
					distractors: Array.isArray(source.distractors)
						? source.distractors
						: [],
					category: source.category || '',
					categoryId: source.categoryId || '',
					difficulty: source.difficulty || 'medium',
					points: Number.parseFloat(source.points) || 1,
					explanation: source.explanation || '',
				},
				{ unique: true },
			);
		});
		checked.forEach((checkbox) => {
			checkbox.checked = false;
		});
		refreshGameQuestionBanks();
	}

	function collectQuestions(containerId) {
		const container = byId(containerId);
		if (!container) return [];
		const rows = Array.from(
			container.querySelectorAll('.game-selected-question'),
		);
		return rows
			.map((row) => {
				const text = row.querySelector('[data-field="text"]')?.value || '';
				const answer = row.querySelector('[data-field="answer"]')?.value || '';
				const choices =
					row.querySelector('[data-field="choices"]')?.value || '';
				const meta = decodeQuestionMeta(row.dataset.questionMeta);
				return {
					...meta,
					id: row.dataset.questionId,
					text,
					answer,
					choices,
				};
			})
			.filter((q) => q.text.trim() && q.answer.trim())
			.map((q) => GameCore.normalizeGame({ questions: [q] }).questions[0]);
	}

	function buildBankItem(question, index, categoryMap) {
		const text = String(question.question || question.text || '').trim();
		const answer = String(question.answer || '').trim();
		const categoryId = question.categoryId || question.category || '';
		const categoryLabel = getCategoryName(categoryId, categoryMap);
		const typeValue = window.QuizTypes?.normalize
			? window.QuizTypes.normalize(question.type || question.questionType, question)
			: question.type || question.questionType || 'multiple-choice';
		const typeLabel = window.QuizTypes?.label
			? window.QuizTypes.label(typeValue, question)
			: typeValue;
		const points = Number.parseFloat(question.points) || 1;
		return `
			<label class="game-bank-item">
				<input type="checkbox" data-question-index="${index}" />
				<div>
					<div class="bank-text">${escapeHtml(text || 'Untitled question')}</div>
					<div class="bank-meta">${escapeHtml(categoryLabel)} - ${escapeHtml(typeLabel)} - ${escapeHtml(String(points))} pts${
						answer ? ` - Answer: ${escapeHtml(answer)}` : ''
					}</div>
				</div>
			</label>
		`;
	}

	function getSelectedQuestionIds(containerId) {
		const container = byId(containerId);
		if (!container) return new Set();
		return new Set(
			Array.from(container.querySelectorAll('.game-selected-question'))
				.map((row) => String(row.dataset.questionId || '').trim())
				.filter(Boolean),
		);
	}

	function encodeQuestionMeta(question = {}) {
		try {
			return encodeURIComponent(JSON.stringify(question || {}));
		} catch (e) {
			return '';
		}
	}

	function decodeQuestionMeta(metaValue) {
		const raw = String(metaValue || '').trim();
		if (!raw) return {};
		try {
			const parsed = JSON.parse(decodeURIComponent(raw));
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (e) {
			return {};
		}
	}

	function buildQuestionRow(question = {}) {
		const q =
			question && question.id ? question : normalizeGameQuestion(question);
		const metaEncoded = encodeQuestionMeta(q);
		const typeValue = window.QuizTypes?.normalize
			? window.QuizTypes.normalize(q.type || q.questionType, q)
			: q.questionType || q.type || 'multiple-choice';
		const typeLabel = window.QuizTypes?.label
			? window.QuizTypes.label(typeValue, q)
			: String(typeValue);
		const categoryLabel = String(
			q.category || q.categoryId || 'Uncategorized',
		).trim();
		const optionCount = Array.isArray(q.options) ? q.options.length : 0;
		const points = Number.parseFloat(q.points) || 1;
		return `
			<div class="game-selected-question" data-question-id="${escapeHtml(q.id)}" data-question-meta="${escapeHtml(metaEncoded)}">
				<div class="selected-question-main">
					<div class="selected-question-text">${escapeHtml(q.text || 'Untitled question')}</div>
					<div class="selected-question-meta">
						${escapeHtml(categoryLabel)} - ${escapeHtml(typeLabel)} - ${escapeHtml(String(points))} pts - ${optionCount} options${
							q.answer ? ` - Answer: ${escapeHtml(q.answer)}` : ''
						}
					</div>
				</div>
				<button type="button" class="btn btn-danger-soft" data-action="remove-selected-question">Remove</button>
			</div>
		`;
	}

	function ensureQuestionListPlaceholder(containerId) {
		const container = byId(containerId);
		if (!container) return;
		const hasRows = container.querySelector('.game-selected-question');
		if (hasRows) {
			const empty = container.querySelector('.empty-state-small');
			if (empty) empty.remove();
			return;
		}
		container.innerHTML =
			'<div class="empty-state-small">No questions selected yet.</div>';
	}

	function addQuestionRow(containerId, question, options = {}) {
		const container = byId(containerId);
		if (!container) return;
		const normalized =
			question && question.id ? question : normalizeGameQuestion(question);
		if (!normalized?.text || !normalized?.answer) return;
		if (options.unique && normalized.id) {
			const existing = container.querySelector(
				`[data-question-id="${CSS.escape(normalized.id)}"]`,
			);
			if (existing) return;
		}
		if (container.querySelector('.empty-state-small')) {
			container.innerHTML = '';
		}
		container.insertAdjacentHTML('beforeend', buildQuestionRow(normalized));
		ensureQuestionListPlaceholder(containerId);
		renderGameCreationRecommendations();
	}

	function addSelectedFromBank(listId, targetListId) {
		const list = byId(listId);
		if (!list) return;
		const checked = Array.from(
			list.querySelectorAll('input[type="checkbox"]:checked'),
		);
		if (!checked.length) {
			showToast('Select at least one question', 'error');
			return;
		}
		const questions = getQuestions();
		checked.forEach((checkbox) => {
			const index = parseInt(checkbox.dataset.questionIndex, 10);
			const source = questions[index];
			if (!source) return;
			addQuestionRow(
				targetListId,
				{
					...source,
					id: source.id || `bank-${index}`,
					text: source.question || source.text || '',
					question: source.question || source.text || '',
				},
				{ unique: true },
			);
		});
		checked.forEach((checkbox) => {
			checkbox.checked = false;
		});
		ensureQuestionListPlaceholder(targetListId);
		refreshGameQuestionBanks();
	}

	function addAllFromBank(listId, targetListId) {
		const list = byId(listId);
		if (!list) return;
		const allVisible = Array.from(
			list.querySelectorAll('input[type="checkbox"][data-question-index]'),
		);
		if (!allVisible.length) {
			showToast('No questions available to add.', 'info');
			return;
		}
		const questions = getQuestions();
		allVisible.forEach((checkbox) => {
			const index = parseInt(checkbox.dataset.questionIndex, 10);
			const source = questions[index];
			if (!source) return;
			addQuestionRow(
				targetListId,
				{
					...source,
					id: source.id || `bank-${index}`,
					text: source.question || source.text || '',
					question: source.question || source.text || '',
				},
				{ unique: true },
			);
			checkbox.checked = false;
		});
		ensureQuestionListPlaceholder(targetListId);
		refreshGameQuestionBanks();
	}

	function collectQuestions(containerId) {
		const container = byId(containerId);
		if (!container) return [];
		const rows = Array.from(
			container.querySelectorAll('.game-selected-question[data-question-meta]'),
		);
		return rows
			.map((row) => {
				const meta = decodeQuestionMeta(row.dataset.questionMeta);
				return normalizeGameQuestion({
					...meta,
					id: row.dataset.questionId || meta.id,
				});
			})
			.filter((q) => q.text.trim() && q.answer.trim())
			.map((q) => normalizeGameQuestion(q));
	}

	function getSelectedClassIds() {
		const list = byId('gameClassList');
		if (!list) return [];
		return Array.from(
			list.querySelectorAll('input[type="checkbox"]:checked'),
		).map((el) => el.value);
	}

	function setSelectedClassIds(ids) {
		const list = byId('gameClassList');
		if (!list) return;
		const idSet = new Set(ids || []);
		Array.from(list.querySelectorAll('input[type="checkbox"]')).forEach(
			(el) => {
				el.checked = idSet.has(el.value);
			},
		);
	}

	function getSelectedGamePreset() {
		const typeValue = byId('gameType')?.value || '';
		if (!typeValue || !typeValue.startsWith('preset_')) return null;
		const presetId = getGameTypeFromPresetValue(typeValue);
		return getGamePresets().find((preset) => preset.id === presetId) || null;
	}

	function resolveSelectedGameType() {
		const preset = getSelectedGamePreset();
		if (preset && preset.gameType) return preset.gameType;
		const rawType = byId('gameType')?.value || '';
		return GAME_TYPE_LABELS[rawType] ? rawType : '';
	}

	function resolveSelectedGameMode() {
		const selectedMode = byId('gameMode')?.value;
		if (selectedMode) return selectedMode;
		const preset = getSelectedGamePreset();
		if (preset && preset.gameMode) return preset.gameMode;
		return 'solo';
	}

	function setGameRuleControlsDisabled(disabled) {
		const ruleIds = [
			'rule-mirrorCard',
			'rule-timeWarp',
			'rule-doubleOrNothing',
			'rule-shieldCard',
			'rule-freezeCard',
			'rule-stealCard',
			'rule-fogCard',
			'rule-comboBreakerCard',
			'rule-overclockCard',
			'rule-streakMultiplier',
			'rule-bountyBonus',
			'rule-teamBetting',
			'rule-suddenDeath',
			'rule-hintCost',
			'rule-autoRotate',
			'rule-showCountdown',
			'sprintGlobalTimer',
			'hotPotatoTotalTimer',
			'hotPotatoTurnDuration',
			'hotPotatoPoints',
			'rule-eliminateOnFirstWrong',
			'rule-showEliminationReason',
			'lastSurvivorBonusPoints',
			'lastSurvivorTimer',
		];
		ruleIds.forEach((id) => {
			const el = byId(id);
			if (el) el.disabled = disabled;
		});
	}

	function applyGamePresetToForm(preset) {
		if (!preset) return;
		const modeSelect = byId('gameMode');
		if (modeSelect) {
			modeSelect.value = preset.gameMode || 'solo';
			modeSelect.disabled = false;
		}
		const rules = normalizeGameRules(preset.gameRules || {});
		if (byId('rule-mirrorCard'))
			byId('rule-mirrorCard').checked = Boolean(rules.mirrorCard);
		if (byId('rule-timeWarp'))
			byId('rule-timeWarp').checked = Boolean(rules.timeWarp);
		if (byId('rule-doubleOrNothing'))
			byId('rule-doubleOrNothing').checked = Boolean(rules.doubleOrNothing);
		if (byId('rule-shieldCard'))
			byId('rule-shieldCard').checked = Boolean(rules.shieldCard);
		if (byId('rule-freezeCard'))
			byId('rule-freezeCard').checked = Boolean(rules.freezeCard);
		if (byId('rule-stealCard'))
			byId('rule-stealCard').checked = Boolean(rules.stealCard);
		if (byId('rule-fogCard'))
			byId('rule-fogCard').checked = Boolean(rules.fogCard);
		if (byId('rule-comboBreakerCard'))
			byId('rule-comboBreakerCard').checked = Boolean(rules.comboBreakerCard);
		if (byId('rule-overclockCard'))
			byId('rule-overclockCard').checked = Boolean(rules.overclockCard);
		if (byId('rule-streakMultiplier'))
			byId('rule-streakMultiplier').checked = Boolean(rules.streakMultiplier);
		if (byId('rule-bountyBonus'))
			byId('rule-bountyBonus').checked = Boolean(rules.bountyBonus);
		if (byId('rule-teamBetting'))
			byId('rule-teamBetting').checked = Boolean(rules.teamBetting);
		if (byId('rule-suddenDeath'))
			byId('rule-suddenDeath').checked = Boolean(rules.suddenDeath);
		if (byId('rule-hintCost'))
			byId('rule-hintCost').checked = Boolean(rules.hintCost);
		if (byId('gameAutoPlayTimeoutCard'))
			byId('gameAutoPlayTimeoutCard').checked = Boolean(
				rules.autoPlayTimeoutCard,
			);
		if (byId('rule-autoRotate'))
			byId('rule-autoRotate').checked = Boolean(rules.hotPotato.autoRotate);
		if (byId('rule-showCountdown'))
			byId('rule-showCountdown').checked = Boolean(
				rules.hotPotato.showCountdown,
			);
		if (byId('sprintGlobalTimer'))
			byId('sprintGlobalTimer').value = rules.sprint.globalTimer;
		if (byId('hotPotatoTotalTimer'))
			byId('hotPotatoTotalTimer').value = rules.hotPotato.totalTimer;
		if (byId('hotPotatoTurnDuration'))
			byId('hotPotatoTurnDuration').value = rules.hotPotato.turnDuration;
		if (byId('hotPotatoPoints'))
			byId('hotPotatoPoints').value = rules.hotPotato.pointsPerCorrect;
		if (byId('rule-eliminateOnFirstWrong'))
			byId('rule-eliminateOnFirstWrong').checked = Boolean(
				rules.lastSurvivor.eliminateOnFirstWrong,
			);
		if (byId('rule-showEliminationReason'))
			byId('rule-showEliminationReason').checked = Boolean(
				rules.lastSurvivor.showEliminationReason,
			);
		if (byId('lastSurvivorBonusPoints'))
			byId('lastSurvivorBonusPoints').value = rules.lastSurvivor.bonusPoints;
		if (byId('lastSurvivorTimer'))
			byId('lastSurvivorTimer').value = rules.lastSurvivor.eliminationTimer;
		const customTypeInput = byId('customGameTypeName');
		if (customTypeInput) customTypeInput.value = '';
		setGameRuleControlsDisabled(false);
	}

	function clearGamePresetSelection() {
		const modeSelect = byId('gameMode');
		if (modeSelect) modeSelect.disabled = false;
		setGameRuleControlsDisabled(false);
		const customTypeInput = byId('customGameTypeName');
		if (customTypeInput) customTypeInput.value = '';
	}

	function toggleGameFormFields() {
		const type = resolveSelectedGameType();
		const hasType = Boolean(type);
		const raceRow = byId('raceSettingsRow');
		const cardRow = byId('cardSettingsRow');
		const cardTimeoutAutomationRow = byId('cardTimeoutAutomationRow');
		const cardRowSecond = byId('cardSettingsRowSecond');
		const mathRow = byId('mathOperatorsRow');

		const isRaceStyleType = type === 'race' || type === 'sprint-race';
		if (raceRow)
			raceRow.style.display = hasType && isRaceStyleType ? 'flex' : 'none';
		const isCardType = type === 'cards' || type === 'cards-draw';
		if (cardRow)
			cardRow.style.display = hasType && isCardType ? 'flex' : 'none';
		if (cardTimeoutAutomationRow)
			cardTimeoutAutomationRow.style.display =
				hasType && isCardType ? 'flex' : 'none';
		if (cardRowSecond)
			cardRowSecond.style.display = hasType && isCardType ? 'flex' : 'none';
		if (mathRow)
			mathRow.style.display = hasType && isCardType ? 'block' : 'none';
		renderGameCreationRecommendations();
	}

	function getSelectedMainQuestionCount() {
		const container = byId('gameQuestionsList');
		if (!container) return 0;
		return container.querySelectorAll('.game-selected-question').length;
	}

	function getGameRecommendationProfile(type, mode, expectedPlayers) {
		const safePlayers = Math.max(Number(expectedPlayers) || 2, 2);
		const isTeam = String(mode || 'solo') === 'team';
		if (type === 'cards-draw') {
			return {
				title: 'Card Draw Battle Recommendations',
				questionTarget: `${safePlayers * 6} to ${safePlayers * 8} cards`,
				questionMinimum: safePlayers * 5,
				timerTarget: 'Turn timer: 20-30s',
				bestRules: [
					'Auto-play timeout card ON',
					'Use 2-4 special effects max for balanced pressure',
					'Enable Hint Cost to reward precision',
				],
				apply: {
					pointsCorrect: 12,
					questionTimeLimit: 18,
					turnTimeLimit: 25,
					autoPlayTurnTimeoutCard: true,
					autoStart: false,
					cardRules: {
						mirrorCard: true,
						timeWarp: true,
						doubleOrNothing: false,
						shieldCard: true,
						freezeCard: false,
						stealCard: false,
						fogCard: true,
						comboBreakerCard: false,
						overclockCard: false,
						hintCost: true,
					},
				},
			};
		}
		if (type === 'cards') {
			return {
				title: 'Card Battle Recommendations',
				questionTarget: `${safePlayers * 4} to ${safePlayers * 6} cards`,
				questionMinimum: safePlayers,
				timerTarget: 'Turn timer: 25-35s',
				bestRules: [
					'Auto-play timeout card ON',
					'Start with Mirror + Shield + Time Warp',
					'Add Freeze/Steal only for advanced groups',
				],
				apply: {
					pointsCorrect: 10,
					questionTimeLimit: 20,
					turnTimeLimit: 30,
					autoPlayTurnTimeoutCard: true,
					autoStart: false,
					cardRules: {
						mirrorCard: true,
						timeWarp: true,
						doubleOrNothing: false,
						shieldCard: true,
						freezeCard: false,
						stealCard: false,
						fogCard: false,
						comboBreakerCard: false,
						overclockCard: false,
						hintCost: false,
					},
				},
			};
		}
		if (type === 'sprint-race') {
			return {
				title: 'Sprint Race Recommendations',
				questionTarget: isTeam ? '12-18 questions' : '8-14 questions',
				questionMinimum: 8,
				timerTarget: 'Question timer: 10-18s, sprint timer: 60-120s',
				bestRules: [
					'Hint Cost ON',
					'Keep points per correct between 8 and 15',
					'Use clean question wording (no ambiguous options)',
				],
				apply: {
					pointsCorrect: 12,
					questionTimeLimit: 12,
					turnTimeLimit: 25,
					autoStart: true,
					raceRules: {
						suddenDeath: false,
						hintCost: true,
						streakMultiplier: false,
						bountyBonus: false,
					},
					sprint: {
						globalTimer: 90,
					},
				},
			};
		}
		if (type === 'hot-potato') {
			return {
				title: 'Hot Potato Recommendations',
				questionTarget: '12-20 questions',
				questionMinimum: 10,
				timerTarget: 'Total timer: 12-20s, pass timer: 2-4s',
				bestRules: [
					'Auto Rotate ON',
					'Show Countdown ON',
					'Keep points per correct moderate (15-25)',
				],
				apply: {
					pointsCorrect: 20,
					questionTimeLimit: 20,
					turnTimeLimit: 20,
					autoStart: true,
					hotPotato: {
						totalTimer: 15,
						turnDuration: 3,
						pointsPerCorrect: 20,
						autoRotate: true,
						showCountdown: true,
					},
					raceRules: {
						hintCost: false,
					},
				},
			};
		}
		if (type === 'last-survivor') {
			return {
				title: 'Last Survivor Recommendations',
				questionTarget: isTeam ? '10-16 questions' : '8-12 questions',
				questionMinimum: 8,
				timerTarget: 'Elimination timer: 15-25s',
				bestRules: [
					'Eliminate on first wrong only for advanced students',
					'Show elimination reason ON',
					'Bonus points between 30 and 70',
				],
				apply: {
					pointsCorrect: 12,
					questionTimeLimit: 20,
					turnTimeLimit: 25,
					autoStart: true,
					lastSurvivor: {
						eliminateOnFirstWrong: false,
						showEliminationReason: true,
						bonusPoints: 50,
						eliminationTimer: 20,
					},
					raceRules: {
						hintCost: true,
					},
				},
			};
		}
		return {
			title: 'Lightning Race Recommendations',
			questionTarget: isTeam ? '12-20 questions' : '10-16 questions',
			questionMinimum: 8,
			timerTarget: 'Question timer: 15-25s',
			bestRules: [
				'Sudden Death ON for final 2-3 questions',
				'Hint Cost ON for fairness',
				'Streak/Bounty only for competitive groups',
			],
			apply: {
				pointsCorrect: 10,
				questionTimeLimit: 20,
				turnTimeLimit: 30,
				autoStart: true,
				raceRules: {
					suddenDeath: true,
					hintCost: true,
					streakMultiplier: false,
					bountyBonus: false,
				},
			},
		};
	}

	function setControlValue(id, value) {
		const el = byId(id);
		if (!el) return;
		el.value = String(value);
	}

	function setControlChecked(id, checked) {
		const el = byId(id);
		if (!el) return;
		el.checked = Boolean(checked);
	}

	function applyRecommendedGameSettings() {
		const type = resolveSelectedGameType() || 'race';
		const mode = resolveSelectedGameMode();
		const expectedPlayers = parseInt(
			byId('gameExpectedPlayers')?.value || '2',
			10,
		);
		const profile = getGameRecommendationProfile(type, mode, expectedPlayers);
		const apply = profile?.apply || {};

		if (Number.isFinite(Number(apply.pointsCorrect))) {
			setControlValue('gamePoints', Number(apply.pointsCorrect));
		}
		if (Number.isFinite(Number(apply.questionTimeLimit))) {
			setControlValue('gameQuestionTimer', Number(apply.questionTimeLimit));
		}
		if (Number.isFinite(Number(apply.turnTimeLimit))) {
			setControlValue('gameTurnTimer', Number(apply.turnTimeLimit));
		}
		if (apply.autoPlayTurnTimeoutCard !== undefined) {
			setControlChecked(
				'gameAutoPlayTimeoutCard',
				apply.autoPlayTurnTimeoutCard,
			);
		}
		if (apply.autoStart !== undefined) {
			setControlChecked('gameAutoStart', apply.autoStart);
		}

		const cardRules = apply.cardRules || {};
		if (Object.keys(cardRules).length) {
			setControlChecked('rule-mirrorCard', cardRules.mirrorCard);
			setControlChecked('rule-timeWarp', cardRules.timeWarp);
			setControlChecked('rule-doubleOrNothing', cardRules.doubleOrNothing);
			setControlChecked('rule-shieldCard', cardRules.shieldCard);
			setControlChecked('rule-freezeCard', cardRules.freezeCard);
			setControlChecked('rule-stealCard', cardRules.stealCard);
			setControlChecked('rule-fogCard', cardRules.fogCard);
			setControlChecked('rule-comboBreakerCard', cardRules.comboBreakerCard);
			setControlChecked('rule-overclockCard', cardRules.overclockCard);
		}

		const raceRules = apply.raceRules || {};
		if (Object.keys(raceRules).length) {
			if (raceRules.suddenDeath !== undefined) {
				setControlChecked('rule-suddenDeath', raceRules.suddenDeath);
			}
			if (raceRules.hintCost !== undefined) {
				setControlChecked('rule-hintCost', raceRules.hintCost);
			}
			if (raceRules.streakMultiplier !== undefined) {
				setControlChecked('rule-streakMultiplier', raceRules.streakMultiplier);
			}
			if (raceRules.bountyBonus !== undefined) {
				setControlChecked('rule-bountyBonus', raceRules.bountyBonus);
			}
		}

		const sprint = apply.sprint || {};
		if (Object.keys(sprint).length) {
			if (Number.isFinite(Number(sprint.globalTimer))) {
				setControlValue('sprintGlobalTimer', Number(sprint.globalTimer));
			}
		}

		const hotPotato = apply.hotPotato || {};
		if (Object.keys(hotPotato).length) {
			if (Number.isFinite(Number(hotPotato.totalTimer))) {
				setControlValue('hotPotatoTotalTimer', Number(hotPotato.totalTimer));
			}
			if (Number.isFinite(Number(hotPotato.turnDuration))) {
				setControlValue(
					'hotPotatoTurnDuration',
					Number(hotPotato.turnDuration),
				);
			}
			if (Number.isFinite(Number(hotPotato.pointsPerCorrect))) {
				setControlValue('hotPotatoPoints', Number(hotPotato.pointsPerCorrect));
			}
			if (hotPotato.autoRotate !== undefined) {
				setControlChecked('rule-autoRotate', hotPotato.autoRotate);
			}
			if (hotPotato.showCountdown !== undefined) {
				setControlChecked('rule-showCountdown', hotPotato.showCountdown);
			}
		}

		const lastSurvivor = apply.lastSurvivor || {};
		if (Object.keys(lastSurvivor).length) {
			if (lastSurvivor.eliminateOnFirstWrong !== undefined) {
				setControlChecked(
					'rule-eliminateOnFirstWrong',
					lastSurvivor.eliminateOnFirstWrong,
				);
			}
			if (lastSurvivor.showEliminationReason !== undefined) {
				setControlChecked(
					'rule-showEliminationReason',
					lastSurvivor.showEliminationReason,
				);
			}
			if (Number.isFinite(Number(lastSurvivor.bonusPoints))) {
				setControlValue(
					'lastSurvivorBonusPoints',
					Number(lastSurvivor.bonusPoints),
				);
			}
			if (Number.isFinite(Number(lastSurvivor.eliminationTimer))) {
				setControlValue(
					'lastSurvivorTimer',
					Number(lastSurvivor.eliminationTimer),
				);
			}
		}

		toggleGameFormFields();
		toggleGameRulesVisibility();
		renderGameCreationRecommendations();
		showToast('Recommended settings applied.', 'success');
	}

	function renderGameCreationRecommendations() {
		const container = byId('gameCreationRecommendations');
		if (!container) return;
		const type = resolveSelectedGameType() || 'race';
		const mode = resolveSelectedGameMode();
		const expectedPlayers = parseInt(
			byId('gameExpectedPlayers')?.value || '2',
			10,
		);
		const selectedMainQuestions = getSelectedMainQuestionCount();
		const profile = getGameRecommendationProfile(type, mode, expectedPlayers);
		const warningNeeded =
			selectedMainQuestions > 0 &&
			selectedMainQuestions < profile.questionMinimum;
		const warningHtml = warningNeeded
			? `<div class="game-reco-warning">Current main questions: ${selectedMainQuestions}. Recommended minimum for this setup: ${profile.questionMinimum}.</div>`
			: '';
		container.innerHTML = `
			<div class="game-reco-title">${escapeHtml(profile.title)}</div>
			<div class="game-reco-grid">
				<div class="game-reco-item">
					<div class="game-reco-label">Recommended Questions</div>
					<div class="game-reco-value">${escapeHtml(profile.questionTarget)}</div>
				</div>
				<div class="game-reco-item">
					<div class="game-reco-label">Suggested Timer</div>
					<div class="game-reco-value">${escapeHtml(profile.timerTarget)}</div>
				</div>
				<div class="game-reco-item">
					<div class="game-reco-label">Selected Questions</div>
					<div class="game-reco-value">${selectedMainQuestions}</div>
				</div>
			</div>
			<div class="game-reco-rules">
				${profile.bestRules
					.map(
						(rule) => `<span class="game-reco-chip">${escapeHtml(rule)}</span>`,
					)
					.join('')}
			</div>
			<div class="game-reco-actions">
				<button type="button" class="game-reco-apply-btn" data-action="apply-recommendations">
					Apply Recommended Settings
				</button>
			</div>
			${warningHtml}
		`;
	}

	function readGameRulesFromFormControls() {
		return normalizeGameRules({
			mirrorCard: byId('rule-mirrorCard')?.checked,
			timeWarp: byId('rule-timeWarp')?.checked,
			doubleOrNothing: byId('rule-doubleOrNothing')?.checked,
			shieldCard: byId('rule-shieldCard')?.checked,
			freezeCard: byId('rule-freezeCard')?.checked,
			stealCard: byId('rule-stealCard')?.checked,
			fogCard: byId('rule-fogCard')?.checked,
			comboBreakerCard: byId('rule-comboBreakerCard')?.checked,
			overclockCard: byId('rule-overclockCard')?.checked,
			streakMultiplier: byId('rule-streakMultiplier')?.checked,
			bountyBonus: byId('rule-bountyBonus')?.checked,
			teamBetting: byId('rule-teamBetting')?.checked,
			suddenDeath: byId('rule-suddenDeath')?.checked,
			hintCost: byId('rule-hintCost')?.checked,
			autoPlayTimeoutCard: byId('gameAutoPlayTimeoutCard')?.checked,
			lastSurvivor: {
				eliminateOnFirstWrong: byId('rule-eliminateOnFirstWrong')?.checked,
				bonusPoints: byId('lastSurvivorBonusPoints')?.value,
				eliminationTimer: byId('lastSurvivorTimer')?.value,
				showEliminationReason: byId('rule-showEliminationReason')?.checked,
			},
			hotPotato: {
				totalTimer: byId('hotPotatoTotalTimer')?.value,
				turnDuration: byId('hotPotatoTurnDuration')?.value,
				pointsPerCorrect: byId('hotPotatoPoints')?.value,
				autoRotate: byId('rule-autoRotate')?.checked,
				showCountdown: byId('rule-showCountdown')?.checked,
			},
			sprint: {
				globalTimer: byId('sprintGlobalTimer')?.value,
			},
		});
	}

	function readFormValues() {
		const selectedPreset = getSelectedGamePreset();
		const type =
			selectedPreset?.gameType || resolveSelectedGameType() || 'race';
		const mode = byId('gameMode')?.value || selectedPreset?.gameMode || 'solo';
		const points = parseInt(byId('gamePoints')?.value || '10', 10);
		const expectedPlayers = parseInt(
			byId('gameExpectedPlayers')?.value || '0',
			10,
		);
		const questionTimer = parseInt(
			byId('gameQuestionTimer')?.value || '20',
			10,
		);
		const turnTimer = parseInt(byId('gameTurnTimer')?.value || '30', 10);
		const autoPlayTurnTimeoutCard = Boolean(
			byId('gameAutoPlayTimeoutCard')?.checked,
		);
		const autoStart = Boolean(byId('gameAutoStart')?.checked);
		const teamA = byId('gameTeamA')?.value || 'Team A';
		const teamB = byId('gameTeamB')?.value || 'Team B';
		const mathMin = parseInt(byId('gameMathMin')?.value || '1', 10);
		const mathMax = parseInt(byId('gameMathMax')?.value || '12', 10);
		const mathOps = Array.from(
			byId('mathOperatorsRow')?.querySelectorAll(
				'input[type="checkbox"]:checked',
			) || [],
		).map((el) => el.value);

		const gameRules = readGameRulesFromFormControls();

		return {
			type,
			mode,
			points,
			expectedPlayers,
			questionTimer,
			turnTimer,
			autoPlayTurnTimeoutCard,
			autoStart,
			teamA,
			teamB,
			mathMin,
			mathMax,
			mathOps,
			gameRules,
			presetId: selectedPreset?.id || '',
			presetName: selectedPreset?.name || '',
		};
	}

	function buildGameFromForm() {
		const name = byId('gameName')?.value || '';
		const selectedPreset = getSelectedGamePreset();
		const form = readFormValues();
		const currentUser = getCurrentUser();
		const sprintGlobalTimerSeconds = Number(
			form?.gameRules?.sprint?.globalTimer ??
				form?.gameRules?.sprintGlobalTimeLimit,
		);
		const hasSprintGlobalTimer =
			form.type === 'sprint-race' &&
			Number.isFinite(sprintGlobalTimerSeconds) &&
			sprintGlobalTimerSeconds > 0;

		if (!name.trim()) {
			showToast('Game name is required', 'error');
			return null;
		}
		if (!selectedPreset) {
			showToast('Select a game preset to continue', 'error');
			return null;
		}

		const game = GameCore.normalizeGame({
			id: state.editingId || undefined,
			name: name.trim(),
			type: form.type,
			mode: form.mode,
			classIds: getSelectedClassIds(),
			settings: {
				pointsCorrect: Number.isFinite(form.points) ? form.points : 10,
				expectedPlayers: Number.isFinite(form.expectedPlayers)
					? form.expectedPlayers
					: 0,
				questionTimeLimit: Number.isFinite(form.questionTimer)
					? form.questionTimer
					: 20,
				turnTimeLimit: Number.isFinite(form.turnTimer) ? form.turnTimer : 30,
				autoPlayTurnTimeoutCard: Boolean(form.autoPlayTurnTimeoutCard),
				autoStart: form.autoStart,
				teamNames: {
					a: form.teamA || 'Team A',
					b: form.teamB || 'Team B',
				},
				mathMin: Number.isFinite(form.mathMin) ? form.mathMin : 1,
				mathMax: Number.isFinite(form.mathMax) ? form.mathMax : 12,
				mathOperators: form.mathOps.length ? form.mathOps : ['+'],
				sprintGlobalTimeLimit: hasSprintGlobalTimer
					? Math.floor(sprintGlobalTimerSeconds)
					: undefined,
				gameRules: form.gameRules || {},
				gamePresetId: form.presetId || '',
				gamePresetName: form.presetName || '',
			},
			questions: collectQuestions('gameQuestionsList'),
			penaltyQuestions: collectQuestions('gamePenaltyList'),
			ownerId: currentUser?.id || '',
			status: state.editingId ? undefined : 'draft',
		});

		if (!game.questions.length) {
			showToast('Add at least one main question', 'error');
			return null;
		}

		return game;
	}

	function resetGameForm() {
		state.editingId = null;
		const form = byId('gameForm');
		if (form) form.reset();
		byId('gameId')?.setAttribute('value', '');
		setSelectedClassIds([]);
		byId('gameQuestionsList').innerHTML = '';
		byId('gamePenaltyList').innerHTML = '';
		ensureQuestionListPlaceholder('gameQuestionsList');
		ensureQuestionListPlaceholder('gamePenaltyList');
		loadGamePresets();
		toggleGameFormFields();
		refreshGameQuestionBanks();
		toggleGameRulesVisibility();
	}

	function saveGameForm(event) {
		if (event) event.preventDefault();
		const game = buildGameFromForm();
		if (!game) return;

		const socket = window.clientSocket;
		if (socket && socket.connected) {
			const currentGames = GameCore.getQuizGames();
			const isNew =
				currentGames.findIndex((existing) => existing.id === game.id) === -1;
			const eventName = isNew ? 'game:create' : 'game:update';
			socket.emit(eventName, game, (response) => {
				if (response && response.error) {
					showToast(`Server sync error: ${response.error}`, 'error');
					return;
				}
				requestAuthoritativeGameList((gamesFromServer) => {
					if (!gamesFromServer) {
						const fallbackGames = GameCore.getQuizGames();
						const fallbackIndex = fallbackGames.findIndex(
							(entry) => entry.id === game.id,
						);
						if (fallbackIndex >= 0) {
							fallbackGames[fallbackIndex] = game;
						} else {
							fallbackGames.push(game);
						}
						persistAuthoritativeGames(fallbackGames);
					}
					showToast('Game saved successfully', 'success');
					syncGamesIfPossible();
					resetGameForm();
					renderGameList();
					renderLobby();
				});
			});
			return;
		}

		const games = GameCore.getQuizGames();
		const index = games.findIndex((g) => g.id === game.id);
		if (index >= 0) {
			games[index] = game;
		} else {
			games.push(game);
		}
		persistAuthoritativeGames(games);
		showToast('Game saved successfully', 'success');
		syncGamesIfPossible();
		resetGameForm();
		renderGameList();
	}

	function editGame(gameId) {
		const game = GameCore.getGameById(gameId);
		if (!game) return;
		state.editingId = game.id;
		byId('gameId').value = game.id;
		byId('gameName').value = game.name;

		// Check if this game was created from a preset
		const presets = getGamePresets();
		let matchingPreset = null;
		const presetId = game.settings?.gamePresetId;
		if (presetId) {
			matchingPreset = presets.find((p) => p.id === presetId);
		}
		if (!matchingPreset && game.settings?.gamePresetName) {
			matchingPreset = presets.find(
				(p) => p.name === game.settings.gamePresetName,
			);
		}
		if (!matchingPreset && game.type) {
			matchingPreset = presets.find(
				(p) => p.isDefault && p.gameType === game.type,
			);
		}
		if (!matchingPreset && presets.length) {
			matchingPreset = presets[0];
		}

		if (matchingPreset) {
			byId('gameType').value = `preset_${matchingPreset.id}`;
			applyGamePresetToForm(matchingPreset);
			byId('gameMode').value = game.mode || matchingPreset.gameMode || 'solo';
		} else {
			byId('gameType').value = '';
			clearGamePresetSelection();
			byId('gameMode').value = game.mode;
		}
		byId('gamePoints').value = game.settings?.pointsCorrect || 10;
		byId('gameExpectedPlayers').value = game.settings?.expectedPlayers || 0;
		byId('gameQuestionTimer').value = game.settings?.questionTimeLimit || 20;
		byId('gameTurnTimer').value = game.settings?.turnTimeLimit || 30;
		const sprintGlobalTimer = Number(
			game.settings?.sprintGlobalTimeLimit ??
				game.settings?.gameRules?.sprint?.globalTimer ??
				game.settings?.gameRules?.sprintGlobalTimeLimit,
		);
		if (byId('sprintGlobalTimer')) {
			byId('sprintGlobalTimer').value =
				Number.isFinite(sprintGlobalTimer) && sprintGlobalTimer > 0
					? Math.floor(sprintGlobalTimer)
					: 90;
		}
		if (byId('gameAutoPlayTimeoutCard')) {
			byId('gameAutoPlayTimeoutCard').checked = Boolean(
				game.settings?.autoPlayTurnTimeoutCard ?? true,
			);
		}
		byId('gameAutoStart').checked = Boolean(game.settings?.autoStart);
		byId('gameTeamA').value = game.settings?.teamNames?.a || 'Team A';
		byId('gameTeamB').value = game.settings?.teamNames?.b || 'Team B';
		byId('gameMathMin').value = game.settings?.mathMin ?? 1;
		byId('gameMathMax').value = game.settings?.mathMax ?? 12;

		const mathOps = new Set(game.settings?.mathOperators || []);
		Array.from(
			byId('mathOperatorsRow').querySelectorAll('input[type="checkbox"]'),
		).forEach((el) => {
			el.checked = mathOps.has(el.value);
		});

		// Load game rules (legacy fallback when no preset is linked)
		if (!matchingPreset) {
			const gameRules = normalizeGameRules(game.settings?.gameRules || {});
			byId('rule-mirrorCard').checked = Boolean(gameRules.mirrorCard);
			byId('rule-timeWarp').checked = Boolean(gameRules.timeWarp);
			byId('rule-doubleOrNothing').checked = Boolean(gameRules.doubleOrNothing);
			byId('rule-shieldCard').checked = Boolean(gameRules.shieldCard);
			byId('rule-freezeCard').checked = Boolean(gameRules.freezeCard);
			byId('rule-stealCard').checked = Boolean(gameRules.stealCard);
			byId('rule-fogCard').checked = Boolean(gameRules.fogCard);
			byId('rule-comboBreakerCard').checked = Boolean(
				gameRules.comboBreakerCard,
			);
			byId('rule-overclockCard').checked = Boolean(gameRules.overclockCard);
			byId('rule-streakMultiplier').checked = Boolean(
				gameRules.streakMultiplier,
			);
			byId('rule-bountyBonus').checked = Boolean(gameRules.bountyBonus);
			byId('rule-teamBetting').checked = Boolean(gameRules.teamBetting);
			byId('rule-suddenDeath').checked = Boolean(gameRules.suddenDeath);
			byId('rule-hintCost').checked = Boolean(gameRules.hintCost);
			if (byId('gameAutoPlayTimeoutCard')) {
				byId('gameAutoPlayTimeoutCard').checked = Boolean(
					game.settings?.autoPlayTurnTimeoutCard ??
					gameRules.autoPlayTimeoutCard,
				);
			}
			if (byId('rule-autoRotate'))
				byId('rule-autoRotate').checked = Boolean(
					gameRules.hotPotato.autoRotate,
				);
			if (byId('rule-showCountdown'))
				byId('rule-showCountdown').checked = Boolean(
					gameRules.hotPotato.showCountdown,
				);
			if (byId('hotPotatoTotalTimer'))
				byId('hotPotatoTotalTimer').value = gameRules.hotPotato.totalTimer;
			if (byId('hotPotatoTurnDuration'))
				byId('hotPotatoTurnDuration').value = gameRules.hotPotato.turnDuration;
			if (byId('hotPotatoPoints'))
				byId('hotPotatoPoints').value = gameRules.hotPotato.pointsPerCorrect;
			if (byId('rule-eliminateOnFirstWrong'))
				byId('rule-eliminateOnFirstWrong').checked = Boolean(
					gameRules.lastSurvivor.eliminateOnFirstWrong,
				);
			if (byId('rule-showEliminationReason'))
				byId('rule-showEliminationReason').checked = Boolean(
					gameRules.lastSurvivor.showEliminationReason,
				);
			if (byId('lastSurvivorBonusPoints'))
				byId('lastSurvivorBonusPoints').value =
					gameRules.lastSurvivor.bonusPoints;
			if (byId('lastSurvivorTimer'))
				byId('lastSurvivorTimer').value =
					gameRules.lastSurvivor.eliminationTimer;
		}

		setSelectedClassIds(game.classIds || []);

		byId('gameQuestionsList').innerHTML = '';
		byId('gamePenaltyList').innerHTML = '';
		game.questions.forEach((q) => addQuestionRow('gameQuestionsList', q));
		game.penaltyQuestions.forEach((q) => addQuestionRow('gamePenaltyList', q));
		ensureQuestionListPlaceholder('gameQuestionsList');
		ensureQuestionListPlaceholder('gamePenaltyList');

		toggleGameFormFields();
		refreshGameQuestionBanks();
		showToast('Game loaded for editing', 'info');
	}

	function deleteGame(gameId) {
		if (!gameId) return;
		if (!confirm('Delete this game?')) return;

		// Local delete
		const games = GameCore.getQuizGames().filter((g) => g.id !== gameId);
		GameCore.saveQuizGames(games);

		// Server delete
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			socket.emit('game:delete', { gameId });
		}

		syncGamesIfPossible();
		if (state.selectedGameId === gameId) {
			state.selectedGameId = null;
			const lobby = byId('gameLobby');
			if (lobby) {
				lobby.innerHTML =
					'<div class="empty-state">Select a game to view the lobby.</div>';
			}
		}
		renderGameList();
		showToast('Game deleted', 'success');
	}

	function deleteAllGames() {
		if (
			!confirm(
				'Are you sure you want to PERMANENTLY delete ALL games from admin and student sides? This cannot be undone.',
			)
		)
			return;

		// Local delete
		GameCore.saveQuizGames([]);

		// Server delete
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			socket.emit('game:deleteAll', (response) => {
				if (response && response.ok) {
					showToast('All games deleted successfully', 'success');
				} else {
					showToast('Error deleting all games', 'error');
				}
			});
		} else {
			showToast('All games deleted locally (server offline)', 'warning');
		}

		syncGamesIfPossible();
		state.selectedGameId = null;
		const lobby = byId('gameLobby');
		if (lobby) {
			lobby.innerHTML =
				'<div class="empty-state">Select a game to view the lobby.</div>';
		}
		renderGameList();
	}

	function openLobby(gameId) {
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			// Get game data from localStorage to help server hydrate if needed
			const games = window.__DI_CONTAINER__.repo.getAll_sync('games');
			const gameData = games.find((g) => g.id === gameId);
			socket.emit('game:openLobby', { gameId, gameData }, (response) => {
				if (response && response.error) {
					showToast(response.error, 'error');
				} else {
					showToast('Lobby is now open', 'success');
				}
			});
			// Optimistic update handled by socket listener
		} else {
			// Fallback: local only
			GameCore.updateGameById(gameId, (game) => {
				const previousStatus = game.status || 'draft';
				game.status = 'open';
				const session = GameCore.ensureGameSession(game);
				ensureLobbyIdentity(game, session);
				if (previousStatus === 'completed') {
					archiveCompletedLobby(game);
					game.session = createFreshLobbySession(game);
					game.results = null;
					return game;
				}
				if (previousStatus === 'draft') {
					session.participants = [];
					session.startedAt = '';
					session.endedAt = '';
					session.roundIndex = 0;
					session.roundHistory = [];
					session.card = null;
					session.sprint = null;
					session.warmup = null;
					session.tieBreak = null;
					session.round = null;
					game.results = null;
				}
				session.status = 'open';
				game.session = session;
				return game;
			});
			syncGamesIfPossible();
			showToast('Lobby is now open (Local)', 'warning');
		}
		state.selectedGameId = gameId;
		renderGameList();
		renderLobby();
	}

	function startGame(gameId) {
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			const gameData =
				(GameCore.getGameById ? GameCore.getGameById(gameId) : null) ||
				window.__DI_CONTAINER__.repo.getAll_sync('games').find(
					(g) => g.id === gameId,
				);
			socket.emit('game:start', { gameId, gameData }, (response) => {
				if (response && response.error) {
					showToast(response.error, 'error');
				} else {
					if (response?.game) {
						upsertAuthoritativeGameSnapshot(response.game);
					} else {
						requestAuthoritativeGameList();
					}
					showToast('Game started', 'success');
					renderGameList();
					renderLobby();
					renderAdminGameWatch();
				}
			});
		} else {
			// Fallback: local
			GameCore.updateGameById(gameId, (game) => {
				const session = GameCore.ensureGameSession(game);
				ensureLobbyIdentity(game, session);
				if (!session.participants.length) {
					showToast('Add participants before starting', 'error');
					return game;
				}
				if (game.type === 'cards' || game.type === 'cards-draw') {
					const participantCount = session.participants.length;
					const validCardCount = Array.isArray(game.questions)
						? game.questions.filter((card) => card.isValid).length
						: 0;
					if (participantCount < 2) {
						showToast('Need at least 2 participants for Card Battle', 'error');
						return game;
					}
					const isDrawMode = game.type === 'cards-draw';
					const requiredCards = isDrawMode
						? participantCount * 5
						: participantCount;
					if (validCardCount < requiredCards) {
						showToast(
							isDrawMode
								? `Not enough cards. Need at least ${requiredCards} cards (5 per player).`
								: `Not enough cards for fair distribution. Need at least ${requiredCards} cards.`,
							'error',
						);
						return game;
					}
				}
				game.status = 'live';
				session.status = 'live';
				session.startedAt = GameCore.nowIso();
				if (!session.hostId) {
					session.hostId =
						session.participants?.[0]?.userId || game.ownerId || '';
				}

				if (game.type === 'cards' || game.type === 'cards-draw') {
					const participants = session.participants.map((p) => p.userId);
					const isDrawMode = game.type === 'cards-draw';
					const deck = GameCore.shuffleArray(
						(Array.isArray(game.questions) ? game.questions : []).filter(
							(card) => card && card.id,
						),
					);
					const cardsPerParticipant = participants.length
						? Math.floor(deck.length / participants.length)
						: 0;
					const usableCardCount = cardsPerParticipant * participants.length;
					const dealDeck = deck.slice(0, usableCardCount);
					const unusedDeck = deck.slice(usableCardCount).map((card) => card.id);
					const hands = {};
					participants.forEach((id) => (hands[id] = []));
					const answersByPlayer = {};
					participants.forEach((id) => (answersByPlayer[id] = 0));
					dealDeck.forEach((card, idx) => {
						const ownerId = participants[idx % participants.length];
						hands[ownerId].push(card.id);
					});
					session.card = {
						hands,
						turnOrder: participants,
						turnIndex: 0,
						turnStartedAt: null,
						pendingCard: null,
						lastResult: null,
						usedSpecialCards: [],
						cardsPerParticipant,
						unusedCards: unusedDeck,
						answerLimitPerPlayer: isDrawMode ? 5 : 0,
						answersByPlayer,
						turnMode: isDrawMode
							? 'target-picks-opponent'
							: 'owner-plays-target',
					};
					const math = GameCore.generateMathChallenge(
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
							Number(game.settings?.warmupMaxAttempts) > 0
								? Number(game.settings.warmupMaxAttempts)
								: 5,
						),
						round: 1,
						lastResetReason: '',
					};
					session.sprint = null;
				} else if (game.type === 'sprint-race') {
					session.card = null;
					session.warmup = null;
					session.tieBreak = null;
					session.roundIndex = 0;
					session.roundHistory = [];
					session.round = null;
					session.sprint = {
						startedAt: Date.now(),
						winnerId: '',
						totalQuestions: Array.isArray(game.questions)
							? game.questions.length
							: 0,
						byUser: Object.fromEntries(
							(session.participants || []).map((participant) => [
								participant.userId,
								{
									questionIndex: 0,
									correctCount: 0,
									attempts: 0,
									currentQuestionStartedAt: Date.now(),
									finishedAt: null,
								},
							]),
						),
						finishOrder: [],
					};
				} else {
					session.sprint = null;
					session.roundIndex = 0;
					session.roundHistory = [];
					session.round = {
						questionId: game.questions[0]?.id || '',
						startedAt: Date.now(),
						answers: [],
						resolved: false,
					};
				}
				game.session = session;
				return game;
			});
			syncGamesIfPossible();
			showToast('Game started (Local)', 'warning');
		}
		renderGameList();
		renderLobby();
	}

	function endGame(gameId) {
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			socket.emit('game:end', { gameId }, (response) => {
				if (response && response.error) {
					showToast(response.error, 'error');
				} else {
					// Get the game and save its results to main storage
					const game = GameCore.getGameById(gameId);
					if (game) {
						const session = GameCore.ensureGameSession(game);
						ensureLobbyIdentity(game, session);
						const gameResults = buildResults(game);
						if (gameResults) {
							const quizResults = JSON.parse(
								JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
							);
							const lobbyId = session.lobbyId || `${game.id}-lobby-1`;
							const lobbyLabel = session.lobbyLabel || 'Lobby #1';
							const resultKey = `${game.id}::${lobbyId}`;
							const existing = quizResults.find(
								(item) =>
									`${item.gameId || ''}::${item.lobbyId || ''}` === resultKey,
							);
							if (existing) {
								showToast('Game completed', 'success');
								return;
							}

							// Create a result entry for the main results storage
							const resultEntry = {
								id: `game-${game.id}-${lobbyId}`,
								gameId: game.id,
								gameName: game.name,
								lobbyId,
								lobbyLabel,
								gameType: game.type,
								gameMode: game.mode,
								mode: 'game',
								date: GameCore.nowIso(),
								completedAt: GameCore.nowIso(),
								winners: gameResults.winners,
								leaderboard: gameResults.leaderboard,
								score: gameResults.winners?.[0]?.score || 0,
								totalPoints: gameResults.winners?.[0]?.score || 0,
								timeSpent: gameResults.winners?.[0]?.timeSpent || 0,
								participants:
									session.participants?.map((p) => ({
										id: p.userId,
										name: p.name,
										score: p.score,
										timeSpent: p.timeSpent,
									})) || [],
								winnerId:
									gameResults.winners?.[0]?.userId ||
									gameResults.winners?.[0]?.id,
								winnerName:
									gameResults.winners?.[0]?.name ||
									gameResults.winners?.[0]?.id,
							};

							quizResults.push(resultEntry);
							window.__DI_CONTAINER__.repo.setAll_sync('results', quizResults);
						}
						// Apply tournament score updates if this is a tournament game
						applyTournamentScoresAfterGameEnd(game);
					}
					showToast('Game completed', 'success');
				}
			});
		} else {
			// Fallback
			GameCore.updateGameById(gameId, (game) => {
				const session = GameCore.ensureGameSession(game);
				game.status = 'completed';
				session.status = 'completed';
				session.endedAt = GameCore.nowIso();
				game.results = buildResults(game);
				game.session = session;

				// Save game results to main results storage
				const gameResults = buildResults(game);
				if (gameResults) {
					const quizResults = JSON.parse(
						JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
					);
					ensureLobbyIdentity(game, session);
					const lobbyId = session.lobbyId || `${game.id}-lobby-1`;
					const lobbyLabel = session.lobbyLabel || 'Lobby #1';
					const resultKey = `${game.id}::${lobbyId}`;
					const existing = quizResults.find(
						(item) =>
							`${item.gameId || ''}::${item.lobbyId || ''}` === resultKey,
					);
					if (existing) {
						return game;
					}

					// Create a result entry for the main results storage
					const resultEntry = {
						id: `game-${game.id}-${lobbyId}`,
						gameId: game.id,
						gameName: game.name,
						lobbyId,
						lobbyLabel,
						gameType: game.type,
						gameMode: game.mode,
						mode: 'game',
						date: GameCore.nowIso(),
						completedAt: GameCore.nowIso(),
						winners: gameResults.winners,
						leaderboard: gameResults.leaderboard,
						score: gameResults.winners?.[0]?.score || 0,
						totalPoints: gameResults.winners?.[0]?.score || 0,
						timeSpent: gameResults.winners?.[0]?.timeSpent || 0,
						participants:
							session.participants?.map((p) => ({
								id: p.userId,
								name: p.name,
								score: p.score,
								timeSpent: p.timeSpent,
							})) || [],
						winnerId:
							gameResults.winners?.[0]?.userId || gameResults.winners?.[0]?.id,
						winnerName:
							gameResults.winners?.[0]?.name || gameResults.winners?.[0]?.id,
					};

					quizResults.push(resultEntry);
					window.__DI_CONTAINER__.repo.setAll_sync('results', quizResults);
				}

				// Apply tournament score updates if this is a tournament game
				applyTournamentScoresAfterGameEnd(game);

				return game;
			});
			syncGamesIfPossible();
			showToast('Game completed (Local)', 'warning');
		}
		renderGameList();
		renderLobby();
	}

	/**
	 * When a tournament-managed game completes, propagate each participant's
	 * in-game score (× the tournament's pointMultiplier) to their user
	 * profile under `tournamentScores[tournamentId]`. Also registers any
	 * new participants into the active tournament's participant list.
	 */
	function applyTournamentScoresAfterGameEnd(game) {
		if (!game) return;
		const context =
			game.tournamentContext && typeof game.tournamentContext === 'object'
				? game.tournamentContext
				: null;
		if (!context) return;
		const tournamentId = String(context.tournamentId || '').trim();
		if (!tournamentId) return;

		const activeTournament = getActiveTournament();
		if (
			!activeTournament ||
			String(activeTournament.id || '').trim() !== tournamentId
		)
			return;

		const session = game.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		if (!participants.length) return;

		const pointMultiplier = Math.max(
			Number(activeTournament.pointMultiplier) || 1,
			1,
		);
		const gamificationConfig = getGamificationConfig();
		const expPerCorrect = Number(gamificationConfig.expPerCorrect) || 10;
		const expPerWin = Number(gamificationConfig.expPerWin) || 100;

		// Determine winner
		const sortedParticipants = [...participants].sort((a, b) => {
			if ((b.score || 0) !== (a.score || 0))
				return (b.score || 0) - (a.score || 0);
			return (a.timeSpent || 0) - (b.timeSpent || 0);
		});
		const winnerId = String(sortedParticipants[0]?.userId || '').trim();

		// Update user profiles with tournament scores and EXP
		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}
		if (!users.length) return;

		let usersChanged = false;
		participants.forEach((participant) => {
			const userId = String(participant?.userId || '').trim();
			if (!userId) return;
			const userIndex = users.findIndex(
				(u) => String(u?.id || '').trim() === userId,
			);
			if (userIndex < 0) return;

			const user = { ...users[userIndex] };
			const gameScore = Math.max(Number(participant.score) || 0, 0);
			const tournamentPoints = Math.round(gameScore * pointMultiplier);

			// Update tournament scores
			if (!user.tournamentScores || typeof user.tournamentScores !== 'object') {
				user.tournamentScores = {};
			}
			const existingScore = Number(user.tournamentScores[tournamentId]) || 0;
			user.tournamentScores[tournamentId] = existingScore + tournamentPoints;

			// Award EXP
			const correctCount = Number(
				participant.correctCount || participant.correct || 0,
			);
			let expGain = correctCount * expPerCorrect;
			if (userId === winnerId) {
				expGain += expPerWin;
			}
			user.exp = Math.max(Number(user.exp) || 0, 0) + expGain;

			users[userIndex] = user;
			usersChanged = true;
		});

		if (usersChanged) {
			window.__DI_CONTAINER__.repo.setAll_sync('users', users);
			if (typeof window.syncUsersToClients === 'function') {
				window.syncUsersToClients();
			}
		}

		// Auto-register participants into the tournament
		registerTournamentParticipants(activeTournament, participants);

		// Refresh tournament panels
		syncGamificationState();
		renderTournamentPanels(activeTournament);
	}

	/**
	 * Ensure that all game participants are registered in the active
	 * tournament's participant list. Called when students join or when
	 * a game completes.
	 */
	function registerTournamentParticipants(tournament, gameParticipants) {
		if (!tournament || !tournament.id) return;
		if (!Array.isArray(gameParticipants) || !gameParticipants.length) return;

		if (!Array.isArray(tournament.participants)) {
			tournament.participants = [];
		}

		const existingIds = new Set(
			tournament.participants
				.map((p) => String(p?.userId || p?.id || '').trim())
				.filter(Boolean),
		);

		let changed = false;
		gameParticipants.forEach((participant) => {
			const userId = String(participant?.userId || '').trim();
			if (!userId || existingIds.has(userId)) return;
			tournament.participants.push({
				userId,
				name: participant.name || participant.userName || 'Student',
				classId: participant.classId || '',
				joinedAt: new Date().toISOString(),
			});
			existingIds.add(userId);
			changed = true;
		});

		if (changed) {
			localStorage.setItem('quizTournamentActive', JSON.stringify(tournament));
		}
	}

	function resetSession(gameId) {
		const socket = window.clientSocket;
		if (socket && socket.connected) {
			socket.emit('game:reset', { gameId }, (response) => {
				if (response && response.error) {
					showToast(response.error, 'error');
				} else {
					showToast('Game session reset', 'success');
				}
			});
		} else {
			// Fallback
			GameCore.updateGameById(gameId, (game) => {
				archiveCompletedLobby(game);
				game.status = 'draft';
				game.session = null;
				game.results = null;
				return game;
			});
			syncGamesIfPossible();
			showToast('Game session reset (Local)', 'warning');
		}
		renderGameList();
		renderLobby();
	}

	function buildResults(game) {
		const session = game.session;
		if (!session || !Array.isArray(session.participants)) return null;
		const participants = session.participants.map((p) => ({ ...p }));

		if (game.mode === 'team') {
			const teamStats = {};
			participants.forEach((p) => {
				const teamId = p.teamId || 'team-a';
				if (!teamStats[teamId]) {
					teamStats[teamId] = {
						id: teamId,
						name:
							teamId === 'team-b'
								? game.settings?.teamNames?.b || 'Team B'
								: game.settings?.teamNames?.a || 'Team A',
						score: 0,
						timeSpent: 0,
					};
				}
				teamStats[teamId].score += p.score || 0;
				teamStats[teamId].timeSpent += p.timeSpent || 0;
			});
			const teams = Object.values(teamStats);
			teams.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.timeSpent - b.timeSpent;
			});
			return {
				winners: teams.slice(0, 1),
				leaderboard: teams,
				endedAt: GameCore.nowIso(),
			};
		}

		participants.sort((a, b) => {
			if ((b.score || 0) !== (a.score || 0))
				return (b.score || 0) - (a.score || 0);
			return (a.timeSpent || 0) - (b.timeSpent || 0);
		});
		return {
			winners: participants.slice(0, 1),
			leaderboard: participants,
			endedAt: GameCore.nowIso(),
		};
	}

	function renderGameList() {
		const container = byId('gameList');
		if (!container) return;
		const games = GameCore.getQuizGames();
		const visibleGames = (Array.isArray(games) ? games : []).filter(
			(game) => !isTournamentManagedGame(game),
		);
		if (!visibleGames.length) {
			container.innerHTML =
				'<div class="empty-state">No games created yet.</div>';
			return;
		}
		container.innerHTML = visibleGames
			.map((game) => {
				const status = game.status || 'draft';
				const sessionCount = game.session?.participants?.length || 0;
				const expected = getAdminLobbyExpectedPlayers(game);
				const classCount = game.classIds?.length || 0;
				const lobbyLabel =
					game.session?.lobbyLabel ||
					(Number.isFinite(Number(game.lobbyCounter))
						? `Lobby #${Number(game.lobbyCounter)}`
						: 'Lobby #1');
				const presetLabel =
					game.settings?.gamePresetName ||
					game.settings?.gameRules?.customGameType ||
					'';
				const typeLabel = presetLabel || getGameTypeLabel(game.type);
				const watchable =
					status === 'open' ||
					status === 'live' ||
					status === 'completed' ||
					sessionCount > 0 ||
					(Array.isArray(game.lobbyHistory) && game.lobbyHistory.length > 0);
				const watchLabel =
					status === 'live'
						? 'Watch Live'
						: status === 'completed'
							? 'Watch Replay'
							: 'Watch Lobby';
				return `
				<div class="game-list-card">
					<div class="game-list-header">
						<div>
							<h4>${escapeHtml(game.name)}</h4>
							<div class="game-badges">
								<span class="game-badge">${escapeHtml(typeLabel)}</span>
								<span class="game-badge">${game.mode === 'team' ? 'Team vs Team' : '1 vs 1'}</span>
								<span class="game-badge ghost">${escapeHtml(lobbyLabel)}</span>
							</div>
						</div>
						<span class="game-status ${escapeHtml(status)}">${escapeHtml(status)}</span>
					</div>
					<div class="game-list-meta">
						<span>${game.questions.length} questions</span>
						<span>${classCount ? `${classCount} class(es)` : 'All classes'}</span>
						<span>${expected ? `${sessionCount}/${expected} joined` : `${sessionCount} joined`}</span>
					</div>
					<div class="game-list-actions">
						<button class="btn btn-sm btn-secondary" onclick="editGame('${game.id}')">Edit</button>
						<button class="btn btn-sm btn-secondary" onclick="openGameLobby('${game.id}')">Open Lobby</button>
						<button class="btn btn-sm btn-primary" onclick="startGameSession('${game.id}')">Start</button>
						<button class="btn btn-sm btn-info" ${watchable ? '' : 'disabled'} onclick="${
							watchable ? `openAdminGameWatch('${game.id}')` : 'return false'
						}">${escapeHtml(watchLabel)}</button>
						<button class="btn btn-sm btn-danger-soft" onclick="endGameSession('${game.id}')">End</button>
						<button class="btn btn-sm btn-danger" onclick="deleteGame('${game.id}')">Delete</button>
					</div>
				</div>
			`;
			})
			.join('');
	}

	function renderLobby() {
		const container = byId('gameLobby');
		if (!container) return;
		if (!state.selectedGameId) {
			container.innerHTML =
				'<div class="empty-state">Select a game to view the lobby.</div>';
			return;
		}
		const game = GameCore.getGameById(state.selectedGameId);
		if (!game) {
			container.innerHTML = '<div class="empty-state">Game not found.</div>';
			return;
		}
		const session = GameCore.ensureGameSession(game);
		ensureLobbyIdentity(game, session);
		const participants = session.participants || [];
		const teamNames = game.settings?.teamNames || { a: 'Team A', b: 'Team B' };
		const history = Array.isArray(game.lobbyHistory) ? game.lobbyHistory : [];
		const lobbyStatus = String(game.status || '').toLowerCase();
		const watchable =
			lobbyStatus === 'open' ||
			lobbyStatus === 'live' ||
			lobbyStatus === 'completed' ||
			participants.length > 0 ||
			history.length > 0;
		const watchLabel =
			lobbyStatus === 'live'
				? 'Watch Live'
				: lobbyStatus === 'completed'
					? 'Watch Replay'
					: 'Watch Lobby';

		container.innerHTML = `
			<div class="game-lobby-header">
				<h4>${escapeHtml(game.name)} • ${escapeHtml(
					session.lobbyLabel || 'Lobby #1',
				)}</h4>
				<span class="game-status ${escapeHtml(game.status || 'draft')}">${escapeHtml(game.status || 'draft')}</span>
			</div>
			<div class="game-lobby-meta">
				${participants.length} participant(s) • ${game.mode === 'team' ? 'Team Mode' : 'Solo Mode'}
			</div>
			<div class="game-lobby-list">
				${
					participants.length
						? participants
								.map(
									(p) => `
							<div class="lobby-row">
								<div>
									<div class="lobby-name">${escapeHtml(p.name)}</div>
									<div class="lobby-subtitle">${
										game.mode === 'team'
											? escapeHtml(
													p.teamId === 'team-b' ? teamNames.b : teamNames.a,
												)
											: 'Solo player'
									}</div>
								</div>
								<span class="lobby-status ${
									p.ready ? 'ready' : 'waiting'
								}">${p.ready ? 'Ready' : 'Waiting'}</span>
							</div>
						`,
								)
								.join('')
						: '<div class="empty-state-small">No one has joined yet.</div>'
				}
			</div>
			<div class="game-lobby-actions">
				<button class="btn btn-secondary" onclick="openGameLobby('${game.id}')">Refresh</button>
				<button class="btn btn-primary" onclick="startGameSession('${game.id}')">Start Game</button>
				<button class="btn btn-info" ${watchable ? '' : 'disabled'} onclick="${
					watchable ? `openAdminGameWatch('${game.id}')` : 'return false'
				}">${escapeHtml(watchLabel)}</button>
				<button class="btn btn-danger-soft" onclick="resetGameSession('${game.id}')">Reset Session</button>
			</div>
			${
				game.results
					? `
				<div class="game-result-summary">
					<h5>Latest Results</h5>
					${
						game.results.winners?.length
							? `<div class="result-winner">Winner: ${escapeHtml(
									game.results.winners[0].name || game.results.winners[0].id,
								)}</div>`
							: ''
					}
				</div>
			`
					: ''
			}
			${
				history.length
					? `
				<div class="game-result-summary">
					<h5>Previous Lobbies</h5>
					<div class="result-meta">
						${history
							.slice()
							.sort((a, b) =>
								String(b.endedAt || b.archivedAt || '').localeCompare(
									String(a.endedAt || a.archivedAt || ''),
								),
							)
							.slice(0, 6)
							.map(
								(entry) =>
									`<div>${escapeHtml(entry.lobbyLabel || entry.lobbyId || 'Lobby')} • ${
										entry.results?.winners?.[0]?.name
											? `Winner: ${escapeHtml(entry.results.winners[0].name)}`
											: 'No winner'
									}</div>`,
							)
							.join('')}
					</div>
				</div>
			`
					: ''
			}
		`;
	}

	function getAdminWatchGame(gameId) {
		const normalizedId = String(gameId || '').trim();
		if (!normalizedId) return null;
		return GameCore.getGameById(normalizedId);
	}

	function findQuestionForAdminWatch(game = {}) {
		const questions = Array.isArray(game.questions) ? game.questions : [];
		const session = game.session || {};
		const pendingCardQuestionId = String(
			session.card?.pendingCard?.questionId || '',
		).trim();
		const roundQuestionId = String(session.round?.questionId || '').trim();
		const tieBreakQuestionId = String(
			session.tieBreak?.questionId || '',
		).trim();
		const targetQuestionId =
			pendingCardQuestionId || tieBreakQuestionId || roundQuestionId;
		const byId = targetQuestionId
			? questions.find(
					(question) => String(question?.id || '').trim() === targetQuestionId,
				)
			: null;
		if (byId) return byId;
		const index = Math.max(Number(session.roundIndex) || 0, 0);
		return questions[index] || questions[0] || null;
	}

	function getAdminWatchParticipantState(participant = {}) {
		const raw = String(participant?.state || '')
			.trim()
			.toLowerCase();
		if (raw === 'forfeited') {
			return { label: 'Forfeited', tone: 'danger' };
		}
		if (raw === 'eliminated') {
			return { label: 'Eliminated', tone: 'warning' };
		}
		if (participant?.ready) {
			return { label: 'Ready', tone: 'done' };
		}
		return { label: raw ? raw.replace(/-/g, ' ') : 'Waiting', tone: 'muted' };
	}

	function formatAdminWatchScore(value) {
		if (!Number.isFinite(Number(value))) return '0';
		return String(Math.round(Number(value)));
	}

	function formatReadableAdminSeconds(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0) return '0s';
		const totalSeconds = Math.max(Math.ceil(numeric), 0);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
		}
		if (minutes > 0) {
			return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
		}
		return `${totalSeconds}s`;
	}

	function parseRichAdminWatchTimestamp(value) {
		if (value === null || value === undefined || value === '') return 0;
		const numeric = Number(value);
		if (Number.isFinite(numeric) && numeric > 0) return numeric;
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	}

	function formatRichAdminWatchMoment(value) {
		const timestamp = parseRichAdminWatchTimestamp(value);
		if (!timestamp) return 'No timestamp';
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	}

	function formatRichAdminWatchDuration(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0) return '0s';
		if (numeric < 1000) return `${Math.round(numeric)}ms`;
		return formatReadableAdminSeconds(numeric / 1000);
	}

	function truncateRichAdminWatchText(value, maxLength = 140) {
		const text = String(value || '').trim();
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return `${text.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
	}

	function getRichAdminWatchQuestionById(game = {}, questionId) {
		const normalizedId = String(questionId || '').trim();
		if (!normalizedId) return null;
		const pools = [];
		if (Array.isArray(game?.questions)) pools.push(...game.questions);
		if (Array.isArray(game?.penaltyQuestions))
			pools.push(...game.penaltyQuestions);
		return (
			pools.find((entry) => String(entry?.id || '').trim() === normalizedId) ||
			null
		);
	}

	function getRichAdminWatchQuestionAnswer(question = {}) {
		const directCandidates = [
			question?.answer,
			question?.correctAnswer,
			question?.correct,
			Array.isArray(question?.correctAnswers)
				? question.correctAnswers.join(', ')
				: '',
		];
		for (const candidate of directCandidates) {
			const text = String(candidate || '').trim();
			if (text) return text;
		}
		const optionAnswers = Array.isArray(question?.options)
			? question.options
					.filter(
						(option) =>
							Boolean(option?.correct) ||
							String(option?.status || '')
								.trim()
								.toLowerCase() === 'correct',
					)
					.map((option) =>
						String(option?.text || option?.label || option?.value || '').trim(),
					)
					.filter(Boolean)
			: [];
		return optionAnswers.join(', ');
	}

	function getRichAdminWatchPromptPayload(game = {}) {
		const session = game?.session || {};
		const warmup = session.warmup || null;
		const pendingCard = session.card?.pendingCard || null;
		const tieBreak = session.tieBreak || null;
		const round = session.round || null;
		const roundHistory = Array.isArray(session.roundHistory)
			? session.roundHistory
			: [];

		if (warmup && !warmup.resolved) {
			return {
				label: 'Warm-up',
				typeLabel: 'Warm-up Challenge',
				questionText: String(warmup.question || '').trim(),
				answerText: String(warmup.answer || '').trim(),
			};
		}

		if (pendingCard) {
			const question = getRichAdminWatchQuestionById(
				game,
				pendingCard.questionId,
			);
			return {
				label: 'Card Duel',
				typeLabel: String(
					pendingCard.specialCardLabel ||
						question?.questionType ||
						question?.type ||
						'Card Challenge',
				).trim(),
				questionText: String(question?.text || question?.question || '').trim(),
				answerText: getRichAdminWatchQuestionAnswer(question),
			};
		}

		if (tieBreak && !tieBreak.resolved) {
			const question = getRichAdminWatchQuestionById(game, tieBreak.questionId);
			return {
				label: 'Tie-break',
				typeLabel: 'Penalty Question',
				questionText: String(question?.text || question?.question || '').trim(),
				answerText: getRichAdminWatchQuestionAnswer(question),
			};
		}

		if (round) {
			const question = findQuestionForAdminWatch(game);
			return {
				label: `Round ${(Number(session.roundIndex) || 0) + 1}`,
				typeLabel: String(
					question?.questionType ||
						question?.type ||
						getGameTypeLabel(game?.type),
				).trim(),
				questionText: String(question?.text || question?.question || '').trim(),
				answerText: getRichAdminWatchQuestionAnswer(question),
			};
		}

		const lastRound = roundHistory.length
			? roundHistory[roundHistory.length - 1]
			: null;
		if (lastRound) {
			const question = getRichAdminWatchQuestionById(
				game,
				lastRound.questionId,
			);
			return {
				label: 'Last Completed Question',
				typeLabel: String(
					question?.questionType ||
						question?.type ||
						getGameTypeLabel(game?.type),
				).trim(),
				questionText: String(question?.text || question?.question || '').trim(),
				answerText: getRichAdminWatchQuestionAnswer(question),
			};
		}

		return {
			label: 'Lobby Snapshot',
			typeLabel: getGameTypeLabel(game?.type),
			questionText: '',
			answerText: '',
		};
	}

	function getRichAdminWatchStageMeta(game = {}) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const participantsById = new Map(
			participants.map((entry) => [String(entry?.userId || '').trim(), entry]),
		);
		const pendingCard = session.card?.pendingCard || null;
		const readyCount = participants.filter((entry) => entry?.ready).length;
		const expectedPlayers = getAdminLobbyExpectedPlayers(game);
		const roundAnswerCount = Array.isArray(session.round?.answers)
			? session.round.answers.length
			: 0;

		if (session.warmup && !session.warmup.resolved) {
			return {
				label: 'Warm-up Live',
				tone: 'warning',
				title: 'Warm-up is deciding who gets the opening move.',
				copy: `${(session.warmup.answers || []).length} reply(ies) captured so far. First correct answer unlocks the main game flow.`,
			};
		}

		if (pendingCard) {
			const owner = participantsById.get(
				String(pendingCard.ownerId || '').trim(),
			);
			const target = participantsById.get(
				String(pendingCard.targetId || '').trim(),
			);
			const specialLabel = String(pendingCard.specialCardLabel || '').trim();
			return {
				label: 'Card Battle Live',
				tone: 'live',
				title: `${owner?.name || 'Player'} sent a challenge to ${target?.name || 'Player'}.`,
				copy: specialLabel
					? `${specialLabel} is active on this duel and the target reply is still pending.`
					: 'Standard card duel in progress while the target prepares a reply.',
			};
		}

		if (session.tieBreak && !session.tieBreak.resolved) {
			return {
				label: 'Tie-break Live',
				tone: 'warning',
				title: 'Tie-break question is live.',
				copy: `${(session.tieBreak.answers || []).length} reply(ies) logged. The first correct answer ends the deadlock.`,
			};
		}

		if (session.round && !session.round.resolved) {
			return {
				label: 'Round Live',
				tone: 'live',
				title: `Round ${(Number(session.roundIndex) || 0) + 1} is in progress.`,
				copy: `${roundAnswerCount} reply(ies) received so far for the active question.`,
			};
		}

		if (
			String(game?.status || '')
				.trim()
				.toLowerCase() === 'completed'
		) {
			return {
				label: 'Completed',
				tone: 'done',
				title: 'This lobby already finished.',
				copy: 'Scores, replies, and special-card outcomes remain visible here for review.',
			};
		}

		if (
			String(game?.status || '')
				.trim()
				.toLowerCase() === 'open'
		) {
			const readinessBase = expectedPlayers || participants.length || 0;
			return {
				label: 'Lobby Open',
				tone:
					readyCount && readinessBase && readyCount === readinessBase
						? 'done'
						: 'waiting',
				title: `${readyCount}/${readinessBase || participants.length || 0} player(s) ready in the lobby.`,
				copy: game?.settings?.autoStart
					? 'Auto-start is enabled. Once all joined players are ready and the expected count is met, the server launches the session.'
					: 'Manual start is active. The lobby can be watched live while players join and mark ready.',
			};
		}

		return {
			label: 'Waiting',
			tone: 'muted',
			title: 'This lobby is waiting for activity.',
			copy: 'Open the lobby or let players join to start seeing live answers and card actions here.',
		};
	}

	function summarizeRichAdminWatchParticipantActivity(game = {}) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const summary = new Map();

		const ensureEntry = (userId) => {
			const normalizedId = String(userId || '').trim();
			if (!normalizedId) return null;
			if (!summary.has(normalizedId)) {
				summary.set(normalizedId, {
					replies: 0,
					correct: 0,
					missed: 0,
					lastAnswer: '',
					lastAt: 0,
					lastStage: '',
					sentCards: 0,
					receivedCards: 0,
					specialCardsUsed: 0,
					awaitingCard: false,
					ownsTurn: false,
				});
			}
			return summary.get(normalizedId);
		};

		const noteReply = (userId, correct, answer, answeredAt, stageLabel) => {
			const entry = ensureEntry(userId);
			if (!entry) return;
			entry.replies += 1;
			if (correct) {
				entry.correct += 1;
			} else {
				entry.missed += 1;
			}
			const timestamp = parseRichAdminWatchTimestamp(answeredAt);
			if (!entry.lastAt || timestamp >= entry.lastAt) {
				entry.lastAt = timestamp;
				entry.lastStage = stageLabel;
				entry.lastAnswer = String(answer || '').trim();
			}
		};

		const noteCardSend = (userId, specialCardId) => {
			const entry = ensureEntry(userId);
			if (!entry) return;
			entry.sentCards += 1;
			if (String(specialCardId || '').trim()) {
				entry.specialCardsUsed += 1;
			}
		};

		const noteCardReceive = (userId) => {
			const entry = ensureEntry(userId);
			if (!entry) return;
			entry.receivedCards += 1;
		};

		participants.forEach((participant) => ensureEntry(participant?.userId));
		(session.warmup?.answers || []).forEach((answer) =>
			noteReply(
				answer?.userId,
				Boolean(answer?.correct),
				answer?.answer,
				answer?.answeredAt,
				'Warm-up',
			),
		);
		(Array.isArray(session.roundHistory) ? session.roundHistory : []).forEach(
			(round, index) => {
				(round?.answers || []).forEach((answer) =>
					noteReply(
						answer?.userId,
						Boolean(answer?.correct),
						answer?.answer,
						answer?.answeredAt,
						`Round ${index + 1}`,
					),
				);
			},
		);
		(session.round?.answers || []).forEach((answer) =>
			noteReply(
				answer?.userId,
				Boolean(answer?.correct),
				answer?.answer,
				answer?.answeredAt,
				`Round ${(Number(session.roundIndex) || 0) + 1}`,
			),
		);
		(session.tieBreak?.answers || []).forEach((answer) =>
			noteReply(
				answer?.userId,
				Boolean(answer?.correct),
				answer?.answer,
				answer?.answeredAt,
				'Tie-break',
			),
		);
		(session.card?.history || []).forEach((entry) => {
			noteCardSend(entry?.ownerId, entry?.specialCard);
			noteCardReceive(entry?.targetId);
			noteReply(
				entry?.targetId,
				Boolean(entry?.isCorrect),
				entry?.answer,
				entry?.endedAt,
				'Card Duel',
			);
		});

		const pendingCard = session.card?.pendingCard || null;
		if (pendingCard) {
			const ownerEntry = ensureEntry(pendingCard.ownerId);
			if (ownerEntry) ownerEntry.ownsTurn = true;
			const targetEntry = ensureEntry(pendingCard.targetId);
			if (targetEntry) targetEntry.awaitingCard = true;
		}

		return summary;
	}

	function collectRichAdminWatchEvents(game = {}) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const participantsById = new Map(
			participants.map((entry) => [String(entry?.userId || '').trim(), entry]),
		);
		const resolveName = (userId) =>
			participantsById.get(String(userId || '').trim())?.name || 'Player';
		const events = [];

		const pushEvent = ({
			timestamp,
			stage,
			tone,
			title,
			detail,
			chips = [],
			category = 'update',
		}) => {
			events.push({
				timestamp: parseRichAdminWatchTimestamp(timestamp),
				stage,
				tone,
				title,
				detail,
				chips: chips.filter(Boolean),
				category,
			});
		};

		const buildReplyDetail = (answerText, correctAnswerText, options = {}) => {
			const parts = [];
			if (answerText) parts.push(`Reply: ${answerText}.`);
			if (!options.correct && correctAnswerText) {
				parts.push(`Correct answer: ${correctAnswerText}.`);
			}
			if (options.hintUsed) parts.push('Hint was used.');
			if (options.timedOut) {
				parts.push('The timer expired before the reply was confirmed.');
			}
			if (options.extra) parts.push(options.extra);
			return parts.join(' ');
		};

		(session.warmup?.answers || []).forEach((entry) => {
			pushEvent({
				timestamp: entry?.answeredAt || session.warmup?.startedAt,
				stage: 'Warm-up',
				tone: entry?.correct ? 'done' : 'warning',
				title: `${resolveName(entry?.userId)} ${
					entry?.correct ? 'solved' : 'missed'
				} the warm-up.`,
				detail: buildReplyDetail(
					String(entry?.answer || '').trim(),
					String(session.warmup?.answer || '').trim(),
					{ correct: Boolean(entry?.correct) },
				),
				chips: [entry?.correct ? 'Correct' : 'Missed'],
				category: 'answer',
			});
		});

		(Array.isArray(session.roundHistory) ? session.roundHistory : []).forEach(
			(round, index) => {
				const question = getRichAdminWatchQuestionById(game, round?.questionId);
				const prompt = truncateRichAdminWatchText(
					String(question?.text || question?.question || '').trim(),
					96,
				);
				const correctAnswerText = getRichAdminWatchQuestionAnswer(question);
				(round?.answers || []).forEach((entry) => {
					pushEvent({
						timestamp: entry?.answeredAt || round?.startedAt,
						stage: `Round ${index + 1}`,
						tone: entry?.correct ? 'done' : 'danger',
						title: `${resolveName(entry?.userId)} ${
							entry?.correct ? 'answered correctly' : 'missed the question'
						}.`,
						detail: buildReplyDetail(
							String(entry?.answer || '').trim(),
							correctAnswerText,
							{
								correct: Boolean(entry?.correct),
								hintUsed: Boolean(entry?.hintUsed),
								extra: prompt ? `Prompt: ${prompt}` : '',
							},
						),
						chips: [
							entry?.correct ? 'Correct' : 'Missed',
							entry?.hintUsed ? 'Hint used' : '',
						],
						category: 'answer',
					});
				});
			},
		);

		const currentRoundQuestion = session.round
			? getRichAdminWatchQuestionById(game, session.round.questionId)
			: null;
		const currentRoundPrompt = truncateRichAdminWatchText(
			String(
				currentRoundQuestion?.text || currentRoundQuestion?.question || '',
			).trim(),
			96,
		);
		const currentRoundAnswer =
			getRichAdminWatchQuestionAnswer(currentRoundQuestion);
		(session.round?.answers || []).forEach((entry) => {
			pushEvent({
				timestamp: entry?.answeredAt || session.round?.startedAt,
				stage: `Live Round ${(Number(session.roundIndex) || 0) + 1}`,
				tone: entry?.correct ? 'done' : 'danger',
				title: `${resolveName(entry?.userId)} ${
					entry?.correct
						? 'locked in a correct reply'
						: 'submitted a missed reply'
				}.`,
				detail: buildReplyDetail(
					String(entry?.answer || '').trim(),
					currentRoundAnswer,
					{
						correct: Boolean(entry?.correct),
						hintUsed: Boolean(entry?.hintUsed),
						extra: currentRoundPrompt ? `Prompt: ${currentRoundPrompt}` : '',
					},
				),
				chips: [
					entry?.correct ? 'Correct' : 'Missed',
					entry?.hintUsed ? 'Hint used' : '',
				],
				category: 'answer',
			});
		});

		const tieBreakQuestion = session.tieBreak
			? getRichAdminWatchQuestionById(game, session.tieBreak.questionId)
			: null;
		const tieBreakPrompt = truncateRichAdminWatchText(
			String(tieBreakQuestion?.text || tieBreakQuestion?.question || '').trim(),
			96,
		);
		const tieBreakAnswer = getRichAdminWatchQuestionAnswer(tieBreakQuestion);
		(session.tieBreak?.answers || []).forEach((entry) => {
			pushEvent({
				timestamp: entry?.answeredAt || session.tieBreak?.startedAt,
				stage: 'Tie-break',
				tone: entry?.correct ? 'done' : 'warning',
				title: `${resolveName(entry?.userId)} ${
					entry?.correct ? 'won the tie-break race' : 'missed the tie-break'
				}.`,
				detail: buildReplyDetail(
					String(entry?.answer || '').trim(),
					tieBreakAnswer,
					{
						correct: Boolean(entry?.correct),
						extra: tieBreakPrompt ? `Prompt: ${tieBreakPrompt}` : '',
					},
				),
				chips: [entry?.correct ? 'Correct' : 'Missed'],
				category: 'answer',
			});
		});

		(session.card?.history || []).forEach((entry) => {
			const question = getRichAdminWatchQuestionById(game, entry?.questionId);
			const prompt = truncateRichAdminWatchText(
				String(question?.text || question?.question || '').trim(),
				92,
			);
			const correctAnswerText = getRichAdminWatchQuestionAnswer(question);
			const pointsRecipientName = entry?.pointsRecipientId
				? resolveName(entry.pointsRecipientId)
				: 'No player';
			const extraParts = [];
			if (entry?.pointsAwarded) {
				extraParts.push(
					`${pointsRecipientName} received ${formatAdminWatchScore(
						entry.pointsAwarded,
					)} pts.`,
				);
			}
			if (entry?.specialOutcome) {
				extraParts.push(String(entry.specialOutcome).trim());
			}
			if (prompt) {
				extraParts.push(`Prompt: ${prompt}`);
			}
			pushEvent({
				timestamp: entry?.endedAt,
				stage: entry?.specialCardLabel || 'Card Duel',
				tone: entry?.isCorrect ? 'done' : 'warning',
				title: `${resolveName(entry?.ownerId)} pressured ${resolveName(
					entry?.targetId,
				)} in a card duel.`,
				detail: buildReplyDetail(
					String(entry?.answer || '').trim(),
					correctAnswerText,
					{
						correct: Boolean(entry?.isCorrect),
						timedOut: Boolean(entry?.timedOut),
						extra: extraParts.join(' '),
					},
				),
				chips: [
					entry?.isCorrect ? 'Correct' : 'Missed',
					entry?.timedOut ? 'Timed out' : 'Answered',
					entry?.specialCardLabel || '',
				],
				category: 'answer',
			});
		});

		const pendingCard = session.card?.pendingCard || null;
		if (pendingCard) {
			const question = getRichAdminWatchQuestionById(
				game,
				pendingCard.questionId,
			);
			const prompt = truncateRichAdminWatchText(
				String(question?.text || question?.question || '').trim(),
				92,
			);
			pushEvent({
				timestamp: pendingCard?.startedAt || Date.now(),
				stage: 'Live Card',
				tone: 'live',
				title: `${resolveName(pendingCard?.ownerId)} sent ${
					pendingCard?.specialCardLabel
						? `${pendingCard.specialCardLabel} `
						: ''
				}pressure to ${resolveName(pendingCard?.targetId)}.`,
				detail: prompt
					? `Awaiting reply on: ${prompt}`
					: 'A live card duel is waiting for the target reply.',
				chips: [
					pendingCard?.specialCardLabel || 'Standard card',
					'Pending reply',
				],
				category: 'update',
			});
		}

		return events.sort((left, right) => right.timestamp - left.timestamp);
	}

	function buildRichAdminWatchSummary(game) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const readyCount = participants.filter(
			(participant) => participant?.ready,
		).length;
		const expectedPlayers = getAdminLobbyExpectedPlayers(game);
		const stageMeta = getRichAdminWatchStageMeta(game);
		const prompt = getRichAdminWatchPromptPayload(game);
		const events = collectRichAdminWatchEvents(game);
		const usedSpecialCards = Array.from(
			new Set(
				[
					...(session.card?.usedSpecialCards || []),
					...(session.card?.history || []).map((entry) =>
						String(entry?.specialCardLabel || entry?.specialCard || '').trim(),
					),
					String(session.card?.pendingCard?.specialCardLabel || '').trim(),
				].filter(Boolean),
			),
		);

		return `
			<div class="admin-game-watch-summary">
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Stage</div>
					<div class="admin-watch-stat-value">${escapeHtml(stageMeta.label)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Joined</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(participants.length),
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Ready</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						expectedPlayers
							? `${readyCount}/${expectedPlayers}`
							: `${readyCount}/${participants.length || 0}`,
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Replies Logged</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(
							events.filter((entry) => entry.category === 'answer').length,
						),
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Special Cards</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(usedSpecialCards.length),
					)}</div>
				</div>
			</div>
			<div class="admin-game-watch-focus">
				<div class="admin-game-watch-focus-top">
					<div class="participant-status ${escapeHtml(
						stageMeta.tone,
					)}">${escapeHtml(stageMeta.label)}</div>
					<div class="admin-game-watch-focus-meta">${escapeHtml(
						`${game?.session?.lobbyLabel || 'Lobby'} | ${
							game?.mode === 'team' ? 'Team vs Team' : '1 vs 1'
						} | ${getGameTypeLabel(game?.type)}`,
					)}</div>
				</div>
				<div class="admin-game-watch-focus-title">${escapeHtml(stageMeta.title)}</div>
				<div class="admin-game-watch-focus-copy">${escapeHtml(stageMeta.copy)}</div>
				<div class="admin-game-watch-question-shell">
					<div class="admin-game-watch-question-label">${escapeHtml(
						prompt.typeLabel || prompt.label || 'Prompt',
					)}</div>
					${
						prompt.questionText
							? `<div class="admin-game-watch-question">${escapeHtml(
									prompt.questionText,
								)}</div>`
							: '<div class="admin-game-watch-question muted">No active question payload for this moment.</div>'
					}
					${
						prompt.answerText
							? `<div class="admin-game-watch-answer">Correct answer: ${escapeHtml(
									prompt.answerText,
								)}</div>`
							: ''
					}
				</div>
			</div>
		`;
	}

	function buildRichAdminWatchParticipants(game) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants.slice()
			: [];
		if (!participants.length) {
			return '<div class="admin-watch-empty">No participants are connected to this match yet.</div>';
		}
		const activity = summarizeRichAdminWatchParticipantActivity(game);
		const pendingCard = session.card?.pendingCard || null;
		const currentRoundAnswers = Array.isArray(session.round?.answers)
			? session.round.answers
			: [];

		return participants
			.sort(
				(left, right) =>
					Number(right?.score || 0) - Number(left?.score || 0) ||
					String(left?.name || '').localeCompare(String(right?.name || '')),
			)
			.map((participant) => {
				const userId = String(participant?.userId || '').trim();
				const participantActivity = activity.get(userId) || {
					replies: 0,
					correct: 0,
					missed: 0,
					lastAnswer: '',
					lastAt: 0,
					lastStage: '',
					sentCards: 0,
					receivedCards: 0,
					specialCardsUsed: 0,
					awaitingCard: false,
					ownsTurn: false,
				};
				const stateMeta = getAdminWatchParticipantState(participant);
				const currentRoundAnswer = currentRoundAnswers.find(
					(entry) => String(entry?.userId || '').trim() === userId,
				);
				const handCount = Array.isArray(session.card?.hands?.[userId])
					? session.card.hands[userId].length
					: 0;
				let statusLabel = stateMeta.label;
				let statusTone = stateMeta.tone;
				if (participantActivity.awaitingCard) {
					statusLabel = 'Answering Now';
					statusTone = 'live';
				} else if (participantActivity.ownsTurn) {
					statusLabel = 'Turn Owner';
					statusTone = 'warning';
				} else if (currentRoundAnswer?.correct) {
					statusLabel = 'Answered Correct';
					statusTone = 'done';
				} else if (currentRoundAnswer) {
					statusLabel = 'Answered Wrong';
					statusTone = 'danger';
				}

				const metaTags = [];
				if (participant?.teamId) {
					metaTags.push(participant.teamId === 'team-b' ? 'Team B' : 'Team A');
				}
				if (participant?.ready) {
					metaTags.push('Ready');
				}
				if (
					pendingCard &&
					String(pendingCard?.ownerId || '').trim() === userId
				) {
					metaTags.push('Applying pressure');
				}
				if (
					pendingCard &&
					String(pendingCard?.targetId || '').trim() === userId
				) {
					metaTags.push('Targeted right now');
				}
				if (handCount) {
					metaTags.push(
						`${handCount} card${handCount === 1 ? '' : 's'} in hand`,
					);
				}

				const lastReplyText = participantActivity.lastAnswer
					? `Last reply in ${participantActivity.lastStage}: ${truncateRichAdminWatchText(
							participantActivity.lastAnswer,
							72,
						)}`
					: 'No reply captured yet.';
				const lastReplyMeta = participantActivity.lastAt
					? `Updated at ${formatRichAdminWatchMoment(participantActivity.lastAt)}`
					: 'Waiting for first live action.';

				return `
					<article class="admin-game-watch-player-card">
						<div class="admin-game-watch-player-main">
							<div>
								<div class="admin-game-watch-player-name">${escapeHtml(
									participant?.name || 'Student',
								)}</div>
								<div class="admin-game-watch-player-meta">${escapeHtml(
									metaTags.join(' | ') || 'Monitoring live behaviour',
								)}</div>
							</div>
							<div class="participant-status ${escapeHtml(
								statusTone,
							)}">${escapeHtml(statusLabel)}</div>
						</div>
						<div class="admin-game-watch-player-stats">
							<span>Score ${escapeHtml(formatAdminWatchScore(participant?.score))}</span>
							<span>Time ${escapeHtml(
								formatRichAdminWatchDuration(participant?.timeSpent),
							)}</span>
							<span>Correct ${escapeHtml(String(participantActivity.correct))}</span>
							<span>Missed ${escapeHtml(String(participantActivity.missed))}</span>
						</div>
						<div class="admin-game-watch-player-extra">
							<div class="admin-game-watch-player-note">${escapeHtml(lastReplyText)}</div>
							<div class="admin-game-watch-player-note muted">${escapeHtml(
								lastReplyMeta,
							)}</div>
							<div class="admin-game-watch-player-mini-stats">
								<span>Replies ${escapeHtml(String(participantActivity.replies))}</span>
								<span>Cards Sent ${escapeHtml(String(participantActivity.sentCards))}</span>
								<span>Cards Faced ${escapeHtml(
									String(participantActivity.receivedCards),
								)}</span>
								<span>Specials ${escapeHtml(
									String(participantActivity.specialCardsUsed),
								)}</span>
							</div>
						</div>
					</article>
				`;
			})
			.join('');
	}

	function buildRichAdminWatchSignals(game) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const readyCount = participants.filter((entry) => entry?.ready).length;
		const expectedPlayers = getAdminLobbyExpectedPlayers(game);
		const pendingCard = session.card?.pendingCard || null;
		const participantsById = new Map(
			participants.map((entry) => [String(entry?.userId || '').trim(), entry]),
		);
		const usedSpecialCards = Array.from(
			new Set(
				[
					...(session.card?.usedSpecialCards || []),
					...(session.card?.history || []).map((entry) =>
						String(entry?.specialCardLabel || entry?.specialCard || '').trim(),
					),
					String(pendingCard?.specialCardLabel || '').trim(),
				].filter(Boolean),
			),
		);
		const latestCardOutcome =
			Array.isArray(session.card?.history) && session.card.history.length
				? session.card.history[session.card.history.length - 1]
				: null;

		return `
			<div class="admin-game-watch-section">
				<div class="admin-game-watch-section-title">Lobby Signals</div>
				<div class="admin-watch-kv-list">
					<div class="admin-watch-kv-row">
						<span>Lobby</span>
						<strong>${escapeHtml(session?.lobbyLabel || 'Lobby #1')}</strong>
					</div>
					<div class="admin-watch-kv-row">
						<span>Status</span>
						<strong>${escapeHtml(String(game?.status || 'draft'))}</strong>
					</div>
					<div class="admin-watch-kv-row">
						<span>Auto-start</span>
						<strong>${escapeHtml(game?.settings?.autoStart ? 'Enabled' : 'Manual')}</strong>
					</div>
					<div class="admin-watch-kv-row">
						<span>Ready</span>
						<strong>${escapeHtml(
							expectedPlayers
								? `${readyCount}/${expectedPlayers}`
								: `${readyCount}/${participants.length || 0}`,
						)}</strong>
					</div>
					<div class="admin-watch-kv-row">
						<span>Turn Focus</span>
						<strong>${escapeHtml(
							pendingCard
								? `${
										participantsById.get(
											String(pendingCard.ownerId || '').trim(),
										)?.name || 'Player'
									} -> ${
										participantsById.get(
											String(pendingCard.targetId || '').trim(),
										)?.name || 'Player'
									}`
								: 'No active duel',
						)}</strong>
					</div>
				</div>
			</div>
			<div class="admin-game-watch-section">
				<div class="admin-game-watch-section-title">Special Cards</div>
				<div class="admin-watch-chip-row">
					${
						usedSpecialCards.length
							? usedSpecialCards
									.map(
										(label) =>
											`<span class="admin-watch-chip">${escapeHtml(
												String(label || '').replace(/-/g, ' '),
											)}</span>`,
									)
									.join('')
							: '<span class="admin-watch-chip muted">No special cards used yet</span>'
					}
				</div>
				<div class="admin-watch-side-note">
					${
						pendingCard
							? escapeHtml(
									`Active effect: ${
										pendingCard.specialCardLabel || 'Standard card'
									} is live right now.`,
								)
							: 'No active special-card effect at this moment.'
					}
				</div>
				${
					latestCardOutcome
						? `<div class="admin-watch-side-note strong">${escapeHtml(
								`Last card outcome at ${formatRichAdminWatchMoment(
									latestCardOutcome.endedAt,
								)}: ${latestCardOutcome.specialCardLabel || 'Standard duel'} ${
									latestCardOutcome.isCorrect
										? 'resolved on a correct reply'
										: 'ended on a missed reply'
								}.`,
							)}</div>`
						: ''
				}
			</div>
		`;
	}

	function buildRichAdminWatchActivityFeed(game) {
		const events = collectRichAdminWatchEvents(game).slice(0, 16);
		if (!events.length) {
			return `
				<div class="admin-watch-empty">
					Lobby activity will appear here in real time as soon as players answer, miss, or use special cards.
				</div>
			`;
		}

		return `
			<div class="admin-watch-feed">
				${events
					.map(
						(event) => `
						<article class="admin-watch-feed-item tone-${escapeHtml(
							event.tone || 'muted',
						)}">
							<div class="admin-watch-feed-top">
								<div class="admin-watch-feed-stage-row">
									<span class="participant-status ${escapeHtml(
										event.tone || 'muted',
									)}">${escapeHtml(event.stage || 'Update')}</span>
									<span class="admin-watch-feed-time">${escapeHtml(
										formatRichAdminWatchMoment(event.timestamp),
									)}</span>
								</div>
								<div class="admin-watch-feed-title">${escapeHtml(event.title)}</div>
							</div>
							<div class="admin-watch-feed-copy">${escapeHtml(
								event.detail || 'Live state updated.',
							)}</div>
							${
								event.chips.length
									? `<div class="admin-watch-feed-chips">${event.chips
											.map(
												(chip) =>
													`<span class="admin-watch-feed-chip">${escapeHtml(
														chip,
													)}</span>`,
											)
											.join('')}</div>`
									: ''
							}
						</article>
					`,
					)
					.join('')}
			</div>
		`;
	}

	function buildAdminWatchSummary(game) {
		const session = game?.session || {};
		const question = findQuestionForAdminWatch(game);
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const pendingCard = session.card?.pendingCard || null;
		const turnOwnerId =
			session.card?.turnOrder?.[session.card?.turnIndex || 0] || '';
		const turnOwner = participants.find(
			(entry) =>
				String(entry?.userId || '').trim() === String(turnOwnerId || '').trim(),
		);
		const pendingTarget = participants.find(
			(entry) =>
				String(entry?.userId || '').trim() ===
				String(pendingCard?.targetId || '').trim(),
		);
		const answeredCount = Array.isArray(session.round?.answers)
			? session.round.answers.length
			: 0;
		const warmupSolved = Boolean(session.warmup?.resolved);
		const liveSignal = pendingCard
			? `Card in play: ${pendingCard.specialCardLabel || 'standard'}`
			: turnOwner
				? `${turnOwner.name || 'Player'} controls the turn`
				: `${answeredCount} answer(s) received`;
		const subSignal = pendingTarget
			? `Target: ${pendingTarget.name || 'Student'}`
			: warmupSolved
				? 'Warmup complete'
				: session.warmup?.question
					? 'Warmup still active'
					: 'Watching live session';

		return `
			<div class="admin-game-watch-summary">
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Status</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(game?.status || 'draft'),
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Players</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(participants.length),
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Round</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String((Number(session.roundIndex) || 0) + 1),
					)}</div>
				</div>
				<div class="admin-watch-stat">
					<div class="admin-watch-stat-label">Question Type</div>
					<div class="admin-watch-stat-value">${escapeHtml(
						String(
							question?.questionType ||
								question?.type ||
								getGameTypeLabel(game?.type),
						),
					)}</div>
				</div>
			</div>
			<div class="admin-game-watch-focus">
				<div class="admin-game-watch-focus-title">${escapeHtml(liveSignal)}</div>
				<div class="admin-game-watch-focus-copy">${escapeHtml(subSignal)}</div>
				${
					question?.text || question?.question
						? `<div class="admin-game-watch-question">${escapeHtml(
								String(question.text || question.question || ''),
							)}</div>`
						: '<div class="admin-game-watch-question muted">No active question payload for this moment.</div>'
				}
				${
					question?.answer
						? `<div class="admin-game-watch-answer">Correct answer: ${escapeHtml(
								String(question.answer),
							)}</div>`
						: ''
				}
			</div>
		`;
	}

	function buildAdminWatchParticipants(game) {
		const session = game?.session || {};
		const participants = Array.isArray(session.participants)
			? session.participants.slice()
			: [];
		if (!participants.length) {
			return '<div class="empty-state-small">No participants are connected to this match yet.</div>';
		}
		const pendingCard = session.card?.pendingCard || null;
		const turnOwnerId =
			session.card?.turnOrder?.[session.card?.turnIndex || 0] || '';
		const answers = Array.isArray(session.round?.answers)
			? session.round.answers
			: [];
		return participants
			.sort(
				(left, right) =>
					Number(right?.score || 0) - Number(left?.score || 0) ||
					String(left?.name || '').localeCompare(String(right?.name || '')),
			)
			.map((participant) => {
				const stateMeta = getAdminWatchParticipantState(participant);
				const answerEntry = answers.find(
					(entry) =>
						String(entry?.userId || '').trim() ===
						String(participant?.userId || '').trim(),
				);
				const handCount = Array.isArray(
					session.card?.hands?.[String(participant?.userId || '').trim()],
				)
					? session.card.hands[String(participant?.userId || '').trim()].length
					: 0;
				const tags = [];
				if (
					String(turnOwnerId || '').trim() ===
					String(participant?.userId || '').trim()
				) {
					tags.push('Turn owner');
				}
				if (
					String(pendingCard?.targetId || '').trim() ===
					String(participant?.userId || '').trim()
				) {
					tags.push('Answering now');
				}
				if (participant?.teamId) {
					tags.push(participant.teamId === 'team-b' ? 'Team B' : 'Team A');
				}
				if (answerEntry?.correct) {
					tags.push('Correct answer logged');
				} else if (answerEntry) {
					tags.push('Answered');
				}
				if (handCount) {
					tags.push(`${handCount} card${handCount === 1 ? '' : 's'}`);
				}
				return `
					<article class="admin-game-watch-player-card">
						<div class="admin-game-watch-player-main">
							<div>
								<div class="admin-game-watch-player-name">${escapeHtml(
									participant?.name || 'Student',
								)}</div>
								<div class="admin-game-watch-player-meta">${escapeHtml(
									tags.join(' • ') || 'Monitoring live behaviour',
								)}</div>
							</div>
							<div class="participant-status ${escapeHtml(
								stateMeta.tone,
							)}">${escapeHtml(stateMeta.label)}</div>
						</div>
						<div class="admin-game-watch-player-stats">
							<span>Score ${escapeHtml(formatAdminWatchScore(participant?.score))}</span>
							<span>Time ${escapeHtml(
								formatRichAdminWatchDuration(participant?.timeSpent),
							)}</span>
						</div>
					</article>
				`;
			})
			.join('');
	}

	function renderAdminGameWatch() {
		const modal = byId('adminGameWatchModal');
		const titleEl = byId('adminGameWatchTitle');
		const contentEl = byId('adminGameWatchContent');
		if (!modal || !titleEl || !contentEl) return;
		const game = getAdminWatchGame(state.watchingGameId);
		if (!state.watchingGameId) {
			modal.style.display = 'none';
			modal.classList.remove('active');
			return;
		}
		if (!game) {
			titleEl.textContent = 'Lobby Watch';
			contentEl.innerHTML =
				'<div class="empty-state">This game lobby is no longer available.</div>';
			return;
		}
		const status = String(game.status || '')
			.trim()
			.toLowerCase();
		const watchModeLabel =
			status === 'live'
				? 'Live Watch'
				: status === 'completed'
					? 'Session Replay'
					: 'Lobby Watch';
		titleEl.textContent = `${game.name} - ${watchModeLabel}`;
		contentEl.innerHTML = `
			<div class="admin-game-watch-toolbar">
				<button type="button" class="btn btn-sm btn-primary-soft" onclick="downloadAdminSessionReplayPdf()">
					Export PDF
				</button>
			</div>
			${buildRichAdminWatchSummary(game)}
			<div class="admin-game-watch-layout">
				<div class="admin-game-watch-main-column">
					<div class="admin-game-watch-section">
						<div class="admin-game-watch-section-title">Participant Behaviour</div>
						<div class="admin-game-watch-player-grid">
							${buildRichAdminWatchParticipants(game)}
						</div>
					</div>
					<div class="admin-game-watch-section">
						<div class="admin-game-watch-section-title">Live Answer Timeline</div>
						<div class="admin-game-watch-section-copy">
							See replies, misses, correct answers, and special-card outcomes as the lobby state updates.
						</div>
						${buildRichAdminWatchActivityFeed(game)}
					</div>
				</div>
				<div class="admin-game-watch-side-column">
					${buildRichAdminWatchSignals(game)}
				</div>
			</div>
		`;
	}

	function openAdminGameWatch(gameId) {
		state.watchingGameId = String(gameId || '').trim() || null;
		const modal = byId('adminGameWatchModal');
		if (!modal || !state.watchingGameId) return;
		renderAdminGameWatch();
		modal.style.display = 'flex';
		modal.classList.add('active');
	}

	function closeAdminGameWatch() {
		state.watchingGameId = null;
		const modal = byId('adminGameWatchModal');
		if (!modal) return;
		modal.style.display = 'none';
		modal.classList.remove('active');
	}
	window.openAdminGameWatch = openAdminGameWatch;
	window.closeAdminGameWatch = closeAdminGameWatch;
	window.renderAdminGameWatch = renderAdminGameWatch;
	function downloadAdminSessionReplayPdf() {
		const game = getAdminWatchGame(state.watchingGameId);
		if (!game) {
			showToast('Open a replay or lobby first.', 'warning');
			return;
		}
		const status = String(game.status || '').trim().toLowerCase();
		const modeLabel =
			status === 'completed'
				? 'Session Replay'
				: status === 'live'
					? 'Live Watch'
					: 'Lobby Watch';
		const printWindow = window.open('', '_blank', 'width=1180,height=920');
		if (!printWindow) {
			showToast('Allow pop-ups to export the replay PDF.', 'warning');
			return;
		}
		const printedAt = new Date().toLocaleString();
		const printHtml = `
			<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>${escapeHtml(game.name)} - ${escapeHtml(modeLabel)}</title>
					<style>
						body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; background: #ffffff; }
						h1, h2 { margin: 0 0 12px; }
						.report-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 24px; }
						.report-meta { color: #475569; font-size: 13px; line-height: 1.5; }
						.report-section { margin-top: 22px; page-break-inside: avoid; }
						.report-grid { display: grid; gap: 18px; }
						.print-note { margin-bottom: 18px; }
						@media print { body { margin: 16px; } .print-note { display: none; } }
					</style>
				</head>
				<body>
					<div class="report-header">
						<div>
							<h1>${escapeHtml(game.name)}</h1>
							<div class="report-meta">${escapeHtml(modeLabel)}</div>
						</div>
						<div class="report-meta">
							<div>Generated ${escapeHtml(printedAt)}</div>
							<div>${escapeHtml(String(game.id || ''))}</div>
						</div>
					</div>
					<div class="print-note report-meta">Choose "Save as PDF" in the print dialog to download this replay.</div>
					<div class="report-section">${buildRichAdminWatchSummary(game)}</div>
					<div class="report-section">
						<h2>Participant Behaviour</h2>
						${buildRichAdminWatchParticipants(game)}
					</div>
					<div class="report-section">
						<h2>Live Answer Timeline</h2>
						${buildRichAdminWatchActivityFeed(game)}
					</div>
					<div class="report-section">
						<h2>Signals</h2>
						${buildRichAdminWatchSignals(game)}
					</div>
				</body>
			</html>
		`;
		printWindow.document.open();
		printWindow.document.write(printHtml);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => {
			try {
				printWindow.print();
			} catch (error) {
				console.error('Failed to print session replay:', error);
			}
		}, 350);
	}
	window.downloadAdminSessionReplayPdf = downloadAdminSessionReplayPdf;

	function initGameManagement() {
		renderClassOptions();
		renderCategoryOptions('gameMainCategorySelect');
		renderCategoryOptions('gamePenaltyCategorySelect');
		renderQuestionBank(
			'gameMainCategorySelect',
			'gameMainQuestionBank',
			'gameMainQuestionSearch',
		);
		renderQuestionBank(
			'gamePenaltyCategorySelect',
			'gamePenaltyQuestionBank',
			'gamePenaltyQuestionSearch',
		);
		renderGameList();
		resetGameForm();

		const form = byId('gameForm');
		if (form) {
			form.addEventListener('submit', saveGameForm);
		}

		const mainCategorySelect = byId('gameMainCategorySelect');
		if (mainCategorySelect) {
			mainCategorySelect.addEventListener('change', () =>
				renderQuestionBank(
					'gameMainCategorySelect',
					'gameMainQuestionBank',
					'gameMainQuestionSearch',
				),
			);
		}

		const penaltyCategorySelect = byId('gamePenaltyCategorySelect');
		if (penaltyCategorySelect) {
			penaltyCategorySelect.addEventListener('change', () =>
				renderQuestionBank(
					'gamePenaltyCategorySelect',
					'gamePenaltyQuestionBank',
					'gamePenaltyQuestionSearch',
				),
			);
		}

		const mainSearch = byId('gameMainQuestionSearch');
		if (mainSearch) {
			mainSearch.addEventListener('input', () =>
				renderQuestionBank(
					'gameMainCategorySelect',
					'gameMainQuestionBank',
					'gameMainQuestionSearch',
				),
			);
		}

		const mainTypeFilters = byId('gameMainTypeFilters');
		if (mainTypeFilters) {
			mainTypeFilters.addEventListener('click', (e) => {
				const badge = e.target.closest('.filter-badge');
				if (!badge) return;
				mainTypeFilters.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
				badge.classList.add('active');
				renderQuestionBank('gameMainCategorySelect', 'gameMainQuestionBank', 'gameMainQuestionSearch');
			});
		}

		const penaltySearch = byId('gamePenaltyQuestionSearch');
		if (penaltySearch) {
			penaltySearch.addEventListener('input', () =>
				renderQuestionBank(
					'gamePenaltyCategorySelect',
					'gamePenaltyQuestionBank',
					'gamePenaltyQuestionSearch',
				),
			);
		}

		const penaltyTypeFilters = byId('gamePenaltyTypeFilters');
		if (penaltyTypeFilters) {
			penaltyTypeFilters.addEventListener('click', (e) => {
				const badge = e.target.closest('.filter-badge');
				if (!badge) return;
				penaltyTypeFilters.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
				badge.classList.add('active');
				renderQuestionBank('gamePenaltyCategorySelect', 'gamePenaltyQuestionBank', 'gamePenaltyQuestionSearch');
			});
		}

		const addMainFromBank = byId('gameMainAddSelected');
		if (addMainFromBank) {
			addMainFromBank.addEventListener('click', () =>
				addSelectedFromBank('gameMainQuestionBank', 'gameQuestionsList'),
			);
		}
		const addMainAllFromBank = byId('gameMainAddAll');
		if (addMainAllFromBank) {
			addMainAllFromBank.addEventListener('click', () =>
				addAllFromBank('gameMainQuestionBank', 'gameQuestionsList'),
			);
		}

		const addPenaltyFromBank = byId('gamePenaltyAddSelected');
		if (addPenaltyFromBank) {
			addPenaltyFromBank.addEventListener('click', () =>
				addSelectedFromBank('gamePenaltyQuestionBank', 'gamePenaltyList'),
			);
		}
		const addPenaltyAllFromBank = byId('gamePenaltyAddAll');
		if (addPenaltyAllFromBank) {
			addPenaltyAllFromBank.addEventListener('click', () =>
				addAllFromBank('gamePenaltyQuestionBank', 'gamePenaltyList'),
			);
		}

		const resetBtn = byId('resetGameForm');
		if (resetBtn) {
			resetBtn.addEventListener('click', resetGameForm);
		}

		// Initialize game presets
		loadGamePresets();
		initGamePresetSettings();
		initGamesStudioTabs();
		initTournamentStudioTabs();

		const modeSelect = byId('gameMode');
		if (modeSelect) {
			modeSelect.addEventListener('change', () => {
				toggleGameRulesVisibility();
				renderGameCreationRecommendations();
			});
		}
		const recommendationFieldIds = [
			'gameExpectedPlayers',
			'gameQuestionTimer',
			'gameTurnTimer',
			'gamePoints',
			'gameAutoPlayTimeoutCard',
			'gameAutoStart',
			'gameType',
		];
		recommendationFieldIds.forEach((id) => {
			const field = byId(id);
			if (!field) return;
			field.addEventListener('change', renderGameCreationRecommendations);
			field.addEventListener('input', renderGameCreationRecommendations);
		});
		const recommendationCard = byId('gameCreationRecommendations');
		if (recommendationCard && recommendationCard.dataset.bound !== 'true') {
			recommendationCard.dataset.bound = 'true';
			recommendationCard.addEventListener('click', (event) => {
				const target =
					event.target instanceof Element
						? event.target.closest('[data-action]')
						: null;
				if (!target) return;
				if (target.dataset.action === 'apply-recommendations') {
					applyRecommendedGameSettings();
				}
			});
		}

		// Initialize game rules visibility
		hideUnsupportedRuleControls();
		toggleGameRulesVisibility();
		toggleGamePresetRulesVisibility();
		renderGameCreationRecommendations();

		const questionList = byId('gameQuestionsList');
		if (questionList) {
			questionList.addEventListener('click', (event) => {
				const target =
					event.target instanceof Element
						? event.target.closest('[data-action]')
						: null;
				if (target && target.dataset.action === 'remove-selected-question') {
					target.closest('.game-selected-question')?.remove();
					ensureQuestionListPlaceholder('gameQuestionsList');
					refreshGameQuestionBanks();
					renderGameCreationRecommendations();
				}
			});
		}

		const penaltyList = byId('gamePenaltyList');
		if (penaltyList) {
			penaltyList.addEventListener('click', (event) => {
				const target =
					event.target instanceof Element
						? event.target.closest('[data-action]')
						: null;
				if (target && target.dataset.action === 'remove-selected-question') {
					target.closest('.game-selected-question')?.remove();
					ensureQuestionListPlaceholder('gamePenaltyList');
					refreshGameQuestionBanks();
					renderGameCreationRecommendations();
				}
			});
		}

		window.addEventListener('storage', (event) => {
			if (event.key === 'quizGames') {
				renderGameList();
				renderLobby();
			}
			if (event.key === GAME_PRESETS_KEY) {
				loadGamePresets();
				renderGamePresetList();
			}
			if (event.key === 'quizQuestions' || event.key === 'quizCategories') {
				renderCategoryOptions('gameMainCategorySelect');
				renderCategoryOptions('gamePenaltyCategorySelect');
				refreshGameQuestionBanks();
			}
		});
	}

	window.initGameManagement = initGameManagement;
	window.editGame = editGame;
	window.deleteGame = deleteGame;
	window.deleteAllGames = deleteAllGames;
	window.openGameLobby = openLobby;
	window.startGameSession = startGame;
	window.endGameSession = endGame;
	window.resetGameSession = resetSession;
	window.renderGameList = renderGameList;
	window.renderGameLobby = renderLobby;

	// Game Presets Management
	const GAME_PRESETS_KEY = 'gamePresets';
	const GAME_PRESETS_INIT_KEY = 'gamePresetsInitialized';

	function createDefaultGamePresets() {
		const now = new Date().toISOString();
		return [
			{
				id: 'default-race',
				name: getGameTypeLabel('race'),
				gameType: 'race',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
			{
				id: 'default-cards',
				name: getGameTypeLabel('cards'),
				gameType: 'cards',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
			{
				id: 'default-cards-draw',
				name: getGameTypeLabel('cards-draw'),
				gameType: 'cards-draw',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
			{
				id: 'default-sprint-race',
				name: getGameTypeLabel('sprint-race'),
				gameType: 'sprint-race',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
			{
				id: 'default-hot-potato',
				name: getGameTypeLabel('hot-potato'),
				gameType: 'hot-potato',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
			{
				id: 'default-last-survivor',
				name: getGameTypeLabel('last-survivor'),
				gameType: 'last-survivor',
				gameMode: 'solo',
				gameRules: normalizeGameRules({}),
				isDefault: true,
				createdAt: now,
			},
		];
	}

	function normalizeGamePreset(preset = {}) {
		const normalizedType = GAME_TYPE_LABELS[preset.gameType]
			? preset.gameType
			: 'race';
		const requestedMode = preset.gameMode === 'team' ? 'team' : 'solo';
		return {
			id:
				String(preset.id || '').trim() ||
				`preset-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
			name:
				String(preset.name || '').trim() || getGameTypeLabel(normalizedType),
			gameType: normalizedType,
			gameMode: supportsTeamModeForType(normalizedType)
				? requestedMode
				: 'solo',
			gameRules: normalizeGameRules(preset.gameRules || {}),
			isDefault: Boolean(preset.isDefault),
			createdAt: preset.createdAt || new Date().toISOString(),
		};
	}

	function sortGamePresetsForDisplay(presets) {
		const order = new Map(GAME_TYPE_ORDER.map((type, index) => [type, index]));
		return [...presets].sort((a, b) => {
			if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
				return a.isDefault ? -1 : 1;
			}
			if (a.isDefault && b.isDefault) {
				return (order.get(a.gameType) ?? 999) - (order.get(b.gameType) ?? 999);
			}
			return String(a.name || '').localeCompare(
				String(b.name || ''),
				undefined,
				{
					sensitivity: 'base',
				},
			);
		});
	}

	function ensureDefaultGamePresets(presets) {
		const list = Array.isArray(presets) ? presets : [];
		const normalizedCustomPresets = [];
		const normalizedById = new Map();

		list.forEach((preset) => {
			const normalized = normalizeGamePreset(preset);
			normalizedById.set(normalized.id, normalized);
		});

		const defaults = createDefaultGamePresets().map((defaultPreset) => {
			const existing = normalizedById.get(defaultPreset.id);
			if (!existing) return defaultPreset;
			return {
				...existing,
				id: defaultPreset.id,
				name: defaultPreset.name,
				gameType: defaultPreset.gameType,
				isDefault: true,
			};
		});

		const defaultIds = new Set(defaults.map((preset) => preset.id));
		normalizedById.forEach((preset) => {
			if (!defaultIds.has(preset.id)) {
				normalizedCustomPresets.push({
					...preset,
					isDefault: false,
				});
			}
		});

		return sortGamePresetsForDisplay([...defaults, ...normalizedCustomPresets]);
	}

	function getGamePresets() {
		try {
			const rawPresets = JSON.parse(
				localStorage.getItem(GAME_PRESETS_KEY) || '[]',
			);
			const initialized = localStorage.getItem(GAME_PRESETS_INIT_KEY);
			const normalizedPresets = ensureDefaultGamePresets(rawPresets);
			const rawComparable = Array.isArray(rawPresets) ? rawPresets : [];
			if (
				!initialized ||
				JSON.stringify(rawComparable) !== JSON.stringify(normalizedPresets)
			) {
				localStorage.setItem(
					GAME_PRESETS_KEY,
					JSON.stringify(normalizedPresets),
				);
				localStorage.setItem(GAME_PRESETS_INIT_KEY, 'true');
			}
			return normalizedPresets;
		} catch (e) {
			console.error('Error loading game presets:', e);
			const defaults = ensureDefaultGamePresets([]);
			localStorage.setItem(GAME_PRESETS_KEY, JSON.stringify(defaults));
			localStorage.setItem(GAME_PRESETS_INIT_KEY, 'true');
			return defaults;
		}
	}

	function saveGamePresets(presets) {
		const normalizedPresets = ensureDefaultGamePresets(presets);
		localStorage.setItem(GAME_PRESETS_KEY, JSON.stringify(normalizedPresets));
		localStorage.setItem(GAME_PRESETS_INIT_KEY, 'true');
	}

	function loadGamePresets() {
		const typeSelect = byId('gameType');
		if (!typeSelect) return;

		const currentValue = typeSelect.value;
		const presets = getGamePresets();

		typeSelect.innerHTML = '';
		if (!presets.length) {
			const placeholder = document.createElement('option');
			placeholder.value = '';
			placeholder.textContent = 'No presets available';
			placeholder.disabled = true;
			placeholder.selected = true;
			typeSelect.appendChild(placeholder);
		}

		presets.forEach((preset) => {
			const option = document.createElement('option');
			option.value = `preset_${preset.id}`;
			option.textContent = preset.isDefault
				? preset.name
				: `${preset.name} (${getGameTypeLabel(preset.gameType)})`;
			typeSelect.appendChild(option);
		});

		typeSelect.disabled = presets.length === 0;

		if (
			currentValue &&
			Array.from(typeSelect.options).some((opt) => opt.value === currentValue)
		) {
			typeSelect.value = currentValue;
		} else if (presets.length) {
			typeSelect.value = `preset_${presets[0].id}`;
		}

		typeSelect.onchange = function () {
			const preset = getSelectedGamePreset();
			if (preset) {
				applyGamePresetToForm(preset);
			} else {
				clearGamePresetSelection();
			}
			toggleGameFormFields();
			toggleGameRulesVisibility();
		};

		const selectedPreset = getSelectedGamePreset();
		if (selectedPreset) {
			applyGamePresetToForm(selectedPreset);
		} else {
			clearGamePresetSelection();
		}

		toggleGameFormFields();
		toggleGameRulesVisibility();
		toggleGamePresetRulesVisibility();
	}

	function saveCurrentRulesAsPreset() {
		showToast('Manage game presets in Settings > Presets.', 'info');
	}

	function applyPreset(presetId) {
		const presets = getGamePresets();
		const preset = presets.find((p) => p.id === presetId);
		if (!preset) return;
		applyGamePresetToForm(preset);
		toggleGameFormFields();
		toggleGameRulesVisibility();
	}

	// Game Rules Visibility Toggle
	function toggleRuleGroupsForSection(section, gameType, gameMode) {
		if (!section) return;
		const groups = section.querySelectorAll('.rules-group');
		groups.forEach((group) => {
			const scopedTypes = String(group.getAttribute('data-game-type') || '')
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean);
			const scopedMode = group.getAttribute('data-game-mode');
			const supportedTypes = String(
				group.getAttribute('data-supported-types') || '',
			)
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean);

			let active = true;
			if (scopedTypes.length) active = scopedTypes.includes(gameType);
			if (active && supportedTypes.length)
				active = supportedTypes.includes(gameType);
			if (active && scopedMode) active = gameMode === scopedMode;

			if (scopedTypes.length || supportedTypes.length || scopedMode) {
				group.classList.toggle('active', Boolean(active));
			}
		});
	}

	function toggleGameRulesVisibility() {
		const type = resolveSelectedGameType();
		const mode = resolveSelectedGameMode();
		toggleRuleGroupsForSection(byId('gameStudioRulesSection'), type, mode);
		hideUnsupportedRuleControls();
	}

	function toggleGamePresetRulesVisibility() {
		const type = byId('game-preset-type')?.value || 'race';
		const modeSelect = byId('game-preset-mode');
		const supportsTeam = supportsTeamModeForType(type);
		if (modeSelect) {
			const teamOption = modeSelect.querySelector('option[value="team"]');
			if (teamOption) teamOption.disabled = !supportsTeam;
			if (!supportsTeam && modeSelect.value === 'team') {
				modeSelect.value = 'solo';
			}
		}
		const mode = modeSelect?.value || 'solo';
		toggleRuleGroupsForSection(byId('gamePresetRulesSection'), type, mode);
		hideUnsupportedRuleControls();
	}

	const UNSUPPORTED_RULE_CONTROL_IDS = [
		'rule-streakMultiplier',
		'rule-bountyBonus',
		'rule-teamBetting',
		'game-preset-rule-streakMultiplier',
		'game-preset-rule-bountyBonus',
		'game-preset-rule-teamBetting',
	];

	function hideUnsupportedRuleControls() {
		UNSUPPORTED_RULE_CONTROL_IDS.forEach((id) => {
			const control = byId(id);
			if (!control) return;
			control.checked = false;
			const row =
				control.closest('.switch-label') || control.closest('.form-group');
			if (row) {
				row.style.display = 'none';
			}
		});
		['gameStudioRulesSection', 'gamePresetRulesSection'].forEach(
			(sectionId) => {
				const section = byId(sectionId);
				if (!section) return;
				section.querySelectorAll('.rules-group').forEach((group) => {
					const visibleControls = Array.from(
						group.querySelectorAll('.switch-label, .form-group'),
					).filter((node) => {
						const style = window.getComputedStyle(node);
						return style.display !== 'none' && style.visibility !== 'hidden';
					});
					group.classList.toggle(
						'rules-group-empty',
						visibleControls.length === 0,
					);
				});
			},
		);
	}

	// Game Preset Settings UI
	function getGamePresetRuleSummary(preset) {
		const rules = normalizeGameRules(preset.gameRules || {});
		const labels = [];
		const isCardPreset =
			preset.gameType === 'cards' || preset.gameType === 'cards-draw';
		if (isCardPreset && rules.mirrorCard) labels.push('Mirror');
		if (isCardPreset && rules.timeWarp) labels.push('Time Warp');
		if (isCardPreset && rules.doubleOrNothing) {
			labels.push('Double or Nothing');
		}
		if (isCardPreset && rules.shieldCard) labels.push('Shield');
		if (isCardPreset && rules.freezeCard) labels.push('Freeze');
		if (isCardPreset && rules.stealCard) labels.push('Steal');
		if (isCardPreset && rules.fogCard) labels.push('Fog');
		if (isCardPreset && rules.comboBreakerCard) labels.push('Combo Breaker');
		if (isCardPreset && rules.overclockCard) labels.push('Overclock');
		if (rules.suddenDeath) labels.push('Sudden Death');
		if (rules.hintCost) labels.push('Hint Cost');
		if (isCardPreset && rules.autoPlayTimeoutCard) {
			labels.push('Auto-Play Timeout Card');
		}
		if (preset.gameType === 'sprint-race') {
			labels.push(`Sprint Timer ${rules.sprint.globalTimer}s`);
		}
		if (preset.gameType === 'hot-potato' && rules.hotPotato.autoRotate) {
			labels.push('Auto Rotate');
		}
		if (
			preset.gameType === 'last-survivor' &&
			rules.lastSurvivor.eliminateOnFirstWrong
		) {
			labels.push('First Wrong Eliminates');
		}
		return labels.length ? labels.join(', ') : 'No special rules';
	}

	function renderGamePresetList() {
		const container = byId('gamePresetsList');
		if (!container) return;
		const presets = getGamePresets();
		if (!presets.length) {
			container.innerHTML =
				'<div style="padding: 20px; text-align: center; color: #9ca3af;">No game presets created yet</div>';
			return;
		}
		container.innerHTML = presets
			.map((preset) => {
				const typeLabel = getGameTypeLabel(preset.gameType);
				const modeLabel =
					preset.gameMode === 'team' ? 'Team vs Team' : '1 vs 1';
				const summary = getGamePresetRuleSummary(preset);
				return `
				<div class="preset-item" data-game-preset-id="${preset.id}" style="
					padding: 14px 16px;
					border-bottom: 1px solid #e2e8f0;
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12px;
					background: #fff;
				">
					<div>
						<div style="font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 8px;">
							<span>${escapeHtml(preset.name)}</span>
							${
								preset.isDefault
									? '<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 999px; background: #e0f2fe; color: #0369a1;">Default</span>'
									: ''
							}
						</div>
						<div style="font-size: 0.85rem; color: #64748b;">
							${typeLabel} - ${modeLabel} - ${summary}
						</div>
					</div>
					<div style="display: flex; gap: 8px;">
						<button type="button" class="btn btn-sm btn-secondary" onclick="editGamePresetSettings('${preset.id}')">Edit</button>
						${
							preset.isDefault
								? ''
								: `<button type="button" class="btn btn-sm btn-danger-soft" onclick="deleteGamePresetSettings('${preset.id}')">Delete</button>`
						}
					</div>
				</div>
			`;
			})
			.join('');
	}

	function resetGamePresetForm() {
		const title = byId('gamePresetFormTitle');
		if (title) title.textContent = 'Create New Game Preset';
		const editingId = byId('editingGamePresetId');
		if (editingId) editingId.value = '';
		if (byId('game-preset-name')) {
			byId('game-preset-name').value = '';
			byId('game-preset-name').disabled = false;
		}
		if (byId('game-preset-type')) {
			byId('game-preset-type').value = 'race';
			byId('game-preset-type').disabled = false;
		}
		if (byId('game-preset-mode')) byId('game-preset-mode').value = 'solo';
		const ruleDefaults = [
			'game-preset-rule-mirrorCard',
			'game-preset-rule-timeWarp',
			'game-preset-rule-doubleOrNothing',
			'game-preset-rule-shieldCard',
			'game-preset-rule-freezeCard',
			'game-preset-rule-stealCard',
			'game-preset-rule-fogCard',
			'game-preset-rule-comboBreakerCard',
			'game-preset-rule-overclockCard',
			'game-preset-rule-streakMultiplier',
			'game-preset-rule-bountyBonus',
			'game-preset-rule-teamBetting',
			'game-preset-rule-suddenDeath',
			'game-preset-rule-hintCost',
			'game-preset-rule-autoPlayTimeoutCard',
			'game-preset-rule-autoRotate',
			'game-preset-rule-showCountdown',
			'game-preset-rule-eliminateOnFirstWrong',
			'game-preset-rule-showEliminationReason',
		];
		ruleDefaults.forEach((id) => {
			const el = byId(id);
			if (!el) return;
			if (
				id === 'game-preset-rule-autoRotate' ||
				id === 'game-preset-rule-showCountdown' ||
				id === 'game-preset-rule-eliminateOnFirstWrong' ||
				id === 'game-preset-rule-showEliminationReason' ||
				id === 'game-preset-rule-autoPlayTimeoutCard'
			) {
				el.checked = true;
			} else {
				el.checked = false;
			}
		});
		if (byId('game-preset-hotPotatoTotalTimer'))
			byId('game-preset-hotPotatoTotalTimer').value = '15';
		if (byId('game-preset-hotPotatoTurnDuration'))
			byId('game-preset-hotPotatoTurnDuration').value = '3';
		if (byId('game-preset-hotPotatoPoints'))
			byId('game-preset-hotPotatoPoints').value = '20';
		if (byId('game-preset-sprintGlobalTimer'))
			byId('game-preset-sprintGlobalTimer').value = '90';
		if (byId('game-preset-lastSurvivorBonusPoints'))
			byId('game-preset-lastSurvivorBonusPoints').value = '50';
		if (byId('game-preset-lastSurvivorTimer'))
			byId('game-preset-lastSurvivorTimer').value = '30';
		toggleGamePresetRulesVisibility();
	}

	function editGamePresetSettings(presetId) {
		const presets = getGamePresets();
		const preset = presets.find((p) => p.id === presetId);
		if (!preset) return;
		const title = byId('gamePresetFormTitle');
		if (title) title.textContent = 'Edit Game Preset';
		if (byId('editingGamePresetId'))
			byId('editingGamePresetId').value = preset.id;
		if (byId('game-preset-name')) {
			byId('game-preset-name').value = preset.name || '';
			byId('game-preset-name').disabled = Boolean(preset.isDefault);
		}
		if (byId('game-preset-type')) {
			byId('game-preset-type').value = preset.gameType || 'race';
			byId('game-preset-type').disabled = Boolean(preset.isDefault);
		}
		if (byId('game-preset-mode'))
			byId('game-preset-mode').value = preset.gameMode || 'solo';
		const rules = normalizeGameRules(preset.gameRules || {});
		if (byId('game-preset-rule-mirrorCard'))
			byId('game-preset-rule-mirrorCard').checked = Boolean(rules.mirrorCard);
		if (byId('game-preset-rule-timeWarp'))
			byId('game-preset-rule-timeWarp').checked = Boolean(rules.timeWarp);
		if (byId('game-preset-rule-doubleOrNothing'))
			byId('game-preset-rule-doubleOrNothing').checked = Boolean(
				rules.doubleOrNothing,
			);
		if (byId('game-preset-rule-shieldCard'))
			byId('game-preset-rule-shieldCard').checked = Boolean(rules.shieldCard);
		if (byId('game-preset-rule-freezeCard'))
			byId('game-preset-rule-freezeCard').checked = Boolean(rules.freezeCard);
		if (byId('game-preset-rule-stealCard'))
			byId('game-preset-rule-stealCard').checked = Boolean(rules.stealCard);
		if (byId('game-preset-rule-fogCard'))
			byId('game-preset-rule-fogCard').checked = Boolean(rules.fogCard);
		if (byId('game-preset-rule-comboBreakerCard'))
			byId('game-preset-rule-comboBreakerCard').checked = Boolean(
				rules.comboBreakerCard,
			);
		if (byId('game-preset-rule-overclockCard'))
			byId('game-preset-rule-overclockCard').checked = Boolean(
				rules.overclockCard,
			);
		if (byId('game-preset-rule-streakMultiplier'))
			byId('game-preset-rule-streakMultiplier').checked = Boolean(
				rules.streakMultiplier,
			);
		if (byId('game-preset-rule-bountyBonus'))
			byId('game-preset-rule-bountyBonus').checked = Boolean(rules.bountyBonus);
		if (byId('game-preset-rule-teamBetting'))
			byId('game-preset-rule-teamBetting').checked = Boolean(rules.teamBetting);
		if (byId('game-preset-rule-suddenDeath'))
			byId('game-preset-rule-suddenDeath').checked = Boolean(rules.suddenDeath);
		if (byId('game-preset-rule-hintCost'))
			byId('game-preset-rule-hintCost').checked = Boolean(rules.hintCost);
		if (byId('game-preset-rule-autoPlayTimeoutCard'))
			byId('game-preset-rule-autoPlayTimeoutCard').checked = Boolean(
				rules.autoPlayTimeoutCard,
			);
		if (byId('game-preset-rule-autoRotate'))
			byId('game-preset-rule-autoRotate').checked = Boolean(
				rules.hotPotato.autoRotate,
			);
		if (byId('game-preset-rule-showCountdown'))
			byId('game-preset-rule-showCountdown').checked = Boolean(
				rules.hotPotato.showCountdown,
			);
		if (byId('game-preset-hotPotatoTotalTimer'))
			byId('game-preset-hotPotatoTotalTimer').value =
				rules.hotPotato.totalTimer;
		if (byId('game-preset-hotPotatoTurnDuration'))
			byId('game-preset-hotPotatoTurnDuration').value =
				rules.hotPotato.turnDuration;
		if (byId('game-preset-hotPotatoPoints'))
			byId('game-preset-hotPotatoPoints').value =
				rules.hotPotato.pointsPerCorrect;
		if (byId('game-preset-sprintGlobalTimer'))
			byId('game-preset-sprintGlobalTimer').value = rules.sprint.globalTimer;
		if (byId('game-preset-rule-eliminateOnFirstWrong'))
			byId('game-preset-rule-eliminateOnFirstWrong').checked = Boolean(
				rules.lastSurvivor.eliminateOnFirstWrong,
			);
		if (byId('game-preset-rule-showEliminationReason'))
			byId('game-preset-rule-showEliminationReason').checked = Boolean(
				rules.lastSurvivor.showEliminationReason,
			);
		if (byId('game-preset-lastSurvivorBonusPoints'))
			byId('game-preset-lastSurvivorBonusPoints').value =
				rules.lastSurvivor.bonusPoints;
		if (byId('game-preset-lastSurvivorTimer'))
			byId('game-preset-lastSurvivorTimer').value =
				rules.lastSurvivor.eliminationTimer;
		toggleGamePresetRulesVisibility();
	}

	function deleteGamePresetSettings(presetId) {
		const targetPreset = getGamePresets().find(
			(preset) => preset.id === presetId,
		);
		if (targetPreset?.isDefault) {
			showToast('Default presets cannot be deleted', 'error');
			return;
		}
		if (!confirm('Delete this game preset?')) return;
		const presets = getGamePresets().filter((preset) => preset.id !== presetId);
		saveGamePresets(presets);
		renderGamePresetList();
		loadGamePresets();
		showToast('Game preset deleted', 'success');
	}

	function saveGamePresetSettings() {
		const name = byId('game-preset-name')?.value?.trim();
		if (!name) {
			showToast('Enter a preset name', 'error');
			return;
		}
		const gameType = byId('game-preset-type')?.value || 'race';
		if (!GAME_TYPE_LABELS[gameType]) {
			showToast('Select a valid game type', 'error');
			return;
		}
		const requestedMode = byId('game-preset-mode')?.value || 'solo';
		const gameMode = supportsTeamModeForType(gameType) ? requestedMode : 'solo';
		const preset = {
			id: Date.now().toString(),
			name,
			gameType,
			gameMode,
			gameRules: normalizeGameRules({
				mirrorCard: Boolean(byId('game-preset-rule-mirrorCard')?.checked),
				timeWarp: Boolean(byId('game-preset-rule-timeWarp')?.checked),
				doubleOrNothing: Boolean(
					byId('game-preset-rule-doubleOrNothing')?.checked,
				),
				shieldCard: Boolean(byId('game-preset-rule-shieldCard')?.checked),
				freezeCard: Boolean(byId('game-preset-rule-freezeCard')?.checked),
				stealCard: Boolean(byId('game-preset-rule-stealCard')?.checked),
				fogCard: Boolean(byId('game-preset-rule-fogCard')?.checked),
				comboBreakerCard: Boolean(
					byId('game-preset-rule-comboBreakerCard')?.checked,
				),
				overclockCard: Boolean(byId('game-preset-rule-overclockCard')?.checked),
				streakMultiplier: false,
				bountyBonus: false,
				teamBetting: false,
				suddenDeath: Boolean(byId('game-preset-rule-suddenDeath')?.checked),
				hintCost: Boolean(byId('game-preset-rule-hintCost')?.checked),
				autoPlayTimeoutCard: Boolean(
					byId('game-preset-rule-autoPlayTimeoutCard')?.checked,
				),
				hotPotato: {
					totalTimer: byId('game-preset-hotPotatoTotalTimer')?.value,
					turnDuration: byId('game-preset-hotPotatoTurnDuration')?.value,
					pointsPerCorrect: byId('game-preset-hotPotatoPoints')?.value,
					autoRotate: byId('game-preset-rule-autoRotate')?.checked,
					showCountdown: byId('game-preset-rule-showCountdown')?.checked,
				},
				sprint: {
					globalTimer: byId('game-preset-sprintGlobalTimer')?.value,
				},
				lastSurvivor: {
					eliminateOnFirstWrong: byId('game-preset-rule-eliminateOnFirstWrong')
						?.checked,
					bonusPoints: byId('game-preset-lastSurvivorBonusPoints')?.value,
					eliminationTimer: byId('game-preset-lastSurvivorTimer')?.value,
					showEliminationReason: byId('game-preset-rule-showEliminationReason')
						?.checked,
				},
			}),
			createdAt: new Date().toISOString(),
		};

		const presets = getGamePresets();
		localStorage.setItem(GAME_PRESETS_INIT_KEY, 'true');
		const editingId = byId('editingGamePresetId')?.value;
		if (editingId) {
			const index = presets.findIndex((p) => p.id === editingId);
			if (index >= 0) {
				preset.id = presets[index].id;
				preset.createdAt = presets[index].createdAt || preset.createdAt;
				preset.isDefault = presets[index].isDefault || false;
				presets[index] = preset;
			} else {
				presets.push(preset);
			}
		} else {
			presets.push(preset);
		}

		saveGamePresets(presets);
		renderGamePresetList();
		loadGamePresets();
		resetGamePresetForm();
		showToast('Game preset saved', 'success');
	}

	function initGamePresetSettings() {
		if (byId('saveGamePresetSettings')) {
			byId('saveGamePresetSettings').addEventListener(
				'click',
				saveGamePresetSettings,
			);
		}
		if (byId('resetGamePresetSettings')) {
			byId('resetGamePresetSettings').addEventListener(
				'click',
				resetGamePresetForm,
			);
		}
		if (byId('game-preset-type')) {
			byId('game-preset-type').addEventListener(
				'change',
				toggleGamePresetRulesVisibility,
			);
		}
		if (byId('game-preset-mode')) {
			byId('game-preset-mode').addEventListener(
				'change',
				toggleGamePresetRulesVisibility,
			);
		}
		resetGamePresetForm();
		renderGamePresetList();
		toggleGamePresetRulesVisibility();
	}

	window.editGamePresetSettings = editGamePresetSettings;
	window.deleteGamePresetSettings = deleteGamePresetSettings;
	window.refreshGamePresetSettings = function () {
		renderGamePresetList();
	};

	function setGamesStudioTab(tabKey) {
		const normalized = String(tabKey || 'games-studio')
			.trim()
			.toLowerCase();
		const activeTab =
			normalized === 'tournament-studio' ? 'tournament-studio' : 'games-studio';

		// Update header text
		const titleEl = byId('gamesTabTitle');
		const subtitleEl = byId('gamesTabSubtitle');
		if (titleEl && subtitleEl) {
			if (activeTab === 'tournament-studio') {
				titleEl.textContent = 'Tournament Studio';
				subtitleEl.textContent =
					'Plan tournament format, rounds, scoring, and rewards with full control.';
			} else {
				titleEl.textContent = 'Games Control Center';
				subtitleEl.textContent =
					'Build games and tournaments from one control panel.';
			}
		}

		document
			.querySelectorAll('[data-games-studio-tab]')
			.forEach((button) =>
				button.classList.toggle(
					'active',
					String(button.dataset.gamesStudioTab || '').toLowerCase() ===
						activeTab,
				),
			);
		document
			.querySelectorAll('[data-games-studio-pane]')
			.forEach((pane) =>
				pane.classList.toggle(
					'active',
					String(pane.dataset.gamesStudioPane || '').toLowerCase() ===
						activeTab,
				),
			);
		state.gamesStudioTab = activeTab;

		if (activeTab === 'tournament-studio') {
			initTournamentStudioTabs();
			const activeTournament = getActiveTournament();
			// Default to dashboard if tournament is active, otherwise planner
			const defaultTab = activeTournament ? 'dashboard' : 'planner';
			setTournamentStudioTab(state.tournamentStudioTab || defaultTab);
			updateTournamentSyncStatus();
		}
	}

	function initGamesStudioTabs() {
		const buttons = Array.from(
			document.querySelectorAll('[data-games-studio-tab]'),
		);
		if (!buttons.length) return;
		buttons.forEach((button) => {
			if (button.dataset.bound === 'true') return;
			button.dataset.bound = 'true';
			button.addEventListener('click', () => {
				setGamesStudioTab(button.dataset.gamesStudioTab || 'games-studio');
			});
		});
		setGamesStudioTab(state.gamesStudioTab || 'games-studio');
	}

	function setTournamentStudioTab(tabKey) {
		const normalized = String(tabKey || 'planner')
			.trim()
			.toLowerCase();

		let activeTab = 'planner';
		if (normalized === 'dashboard') activeTab = 'dashboard';
		else if (normalized === 'history' || normalized === 'recent')
			activeTab = 'history';
		else if (normalized === 'gamification') activeTab = 'gamification';

		document
			.querySelectorAll('[data-tournament-studio-tab]')
			.forEach((button) => {
				const btnTab = String(
					button.dataset.tournamentStudioTab || '',
				).toLowerCase();
				button.classList.toggle(
					'active',
					btnTab === activeTab ||
						(activeTab === 'history' && btnTab === 'recent'),
				);
			});

		document
			.querySelectorAll('[data-tournament-studio-panel]')
			.forEach((panel) => {
				const panelTab = String(
					panel.dataset.tournamentStudioPanel || '',
				).toLowerCase();
				panel.classList.toggle(
					'active',
					panelTab === activeTab ||
						(activeTab === 'history' && panelTab === 'recent'),
				);
			});

		state.tournamentStudioTab = activeTab;

		if (activeTab === 'dashboard') {
			renderTournamentPanels();
		}
	}

	function initTournamentStudioTabs() {
		const buttons = Array.from(
			document.querySelectorAll('[data-tournament-studio-tab]'),
		);
		if (!buttons.length) return;
		buttons.forEach((button) => {
			if (button.dataset.bound === 'true') return;
			button.dataset.bound = 'true';
			button.addEventListener('click', () => {
				setTournamentStudioTab(button.dataset.tournamentStudioTab || 'planner');
			});
		});
		setTournamentStudioTab(state.tournamentStudioTab || 'planner');
	}

	// --- Gamification Controls ---
	function getGamificationConfig() {
		try {
			const config = JSON.parse(
				localStorage.getItem('quizGamification') || '{}',
			);
			return {
				expPerCorrect: Number(config.expPerCorrect) || 10,
				expPerWin: Number(config.expPerWin) || 100,
				autoAwardBadges: config.autoAwardBadges !== false,
			};
		} catch (e) {
			return { expPerCorrect: 10, expPerWin: 100, autoAwardBadges: true };
		}
	}

	function getTournamentHistory() {
		try {
			const history = JSON.parse(
				localStorage.getItem('quizTournamentsHistory') || '[]',
			);
			return normalizeTournamentHistoryEntries(history);
		} catch (e) {
			return [];
		}
	}

	function normalizeTournamentHistoryEntries(history) {
		const entries = Array.isArray(history) ? history : [];
		const deduped = [];
		const seenIds = new Set();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			const id = String(entry?.id || '').trim();
			if (!id || seenIds.has(id)) continue;
			seenIds.add(id);
			deduped.unshift({
				...entry,
				id,
			});
		}
		return deduped;
	}

	function saveTournamentHistory(history) {
		localStorage.setItem(
			'quizTournamentsHistory',
			JSON.stringify(normalizeTournamentHistoryEntries(history)),
		);
	}

	function getTournamentPlannerDraft() {
		try {
			const parsed = JSON.parse(
				localStorage.getItem('quizTournamentPlannerDraft') || 'null',
			);
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function getTournamentPlannerWorkingState() {
		try {
			const parsed = JSON.parse(
				sessionStorage.getItem(TOURNAMENT_PLANNER_WORKING_STATE_KEY) || 'null',
			);
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function clearTournamentPlannerWorkingState() {
		try {
			sessionStorage.removeItem(TOURNAMENT_PLANNER_WORKING_STATE_KEY);
		} catch (e) {}
	}

	function buildTournamentPlannerWorkingState(options = {}) {
		if (state.tournamentPlannerHistoryMode === true || getActiveTournament()) {
			return null;
		}
		const planner = buildTournamentFormConfig();
		const name = String(byId('tournamentName')?.value || '').trim();
		const targetMode = normalizeTournamentModeValue(
			byId('tournamentTargetMode')?.value,
			'any',
		);
		const sourceAssignments = Array.isArray(options?.roundAssignments)
			? options.roundAssignments
			: state.tournamentRoundDraft?.length
				? state.tournamentRoundDraft
				: collectTournamentRoundAssignments(planner.rounds, {
						includeAllRounds: true,
					});
		return {
			name,
			targetMode,
			format: planner.format,
			maxParticipants: planner.maxParticipants,
			rounds: planner.rounds,
			matchMinutes: planner.matchMinutes,
			bestOf: planner.bestOf,
			pointMultiplier: planner.pointMultiplier,
			winnerBonus: planner.winnerBonus,
			rewardExpBonus: planner.rewardExpBonus,
			rewardBadge: planner.rewardBadge,
			notes: planner.notes,
			autoSeeding: planner.autoSeeding,
			allowReentry: planner.allowReentry,
			roundAssignments: normalizeTournamentRoundAssignments(
				sourceAssignments,
				targetMode,
			),
			updatedAt: new Date().toISOString(),
		};
	}

	function saveTournamentPlannerWorkingState(options = {}) {
		const snapshot =
			options?.snapshot || buildTournamentPlannerWorkingState(options);
		if (!snapshot) return null;
		try {
			sessionStorage.setItem(
				TOURNAMENT_PLANNER_WORKING_STATE_KEY,
				JSON.stringify(snapshot),
			);
			return snapshot;
		} catch (e) {
			return null;
		}
	}

	function clearTournamentPlannerHistoryMode() {
		state.tournamentPlannerHistoryMode = false;
		state.tournamentPlannerHistoryId = '';
	}

	function saveTournamentPlannerDraft() {
		const planner = buildTournamentFormConfig();
		const name = String(byId('tournamentName')?.value || '').trim();
		const targetMode = normalizeTournamentModeValue(
			byId('tournamentTargetMode')?.value,
			'any',
		);
		const roundAssignments = normalizeTournamentRoundAssignments(
			state.tournamentRoundDraft?.length
				? state.tournamentRoundDraft
				: collectTournamentRoundAssignments(planner.rounds, {
						includeAllRounds: true,
					}),
			targetMode,
		).map((entry) => ({
			...entry,
			gameDetails: buildTournamentAssignmentDetails(entry.gameIds),
		}));
		const draft = {
			id: `planner-draft-${Date.now()}`,
			name: name || 'Tournament Draft',
			targetMode,
			format: planner.format,
			maxParticipants: planner.maxParticipants,
			rounds: planner.rounds,
			matchMinutes: planner.matchMinutes,
			bestOf: planner.bestOf,
			pointMultiplier: planner.pointMultiplier,
			winnerBonus: planner.winnerBonus,
			rewardExpBonus: planner.rewardExpBonus,
			rewardBadge: planner.rewardBadge,
			notes: planner.notes,
			autoSeeding: planner.autoSeeding,
			allowReentry: planner.allowReentry,
			roundAssignments,
			updatedAt: new Date().toISOString(),
		};
		clearTournamentPlannerHistoryMode();
		localStorage.setItem('quizTournamentPlannerDraft', JSON.stringify(draft));
		clearTournamentPlannerWorkingState();
		showToast('Tournament planner draft saved.', 'success');
		return draft;
	}

	function bindTournamentHistoryActions() {
		const historyEl = byId('tournamentHistoryList');
		if (!historyEl || historyEl.dataset.bound === 'true') return;
		historyEl.dataset.bound = 'true';
		historyEl.addEventListener('click', (event) => {
			const button = event.target.closest('[data-tournament-history-action]');
			if (!(button instanceof HTMLButtonElement)) return;
			const action = String(
				button.dataset.tournamentHistoryAction || '',
			).trim();
			const id = String(button.dataset.tournamentId || '').trim();
			if (!action || !id) return;
			if (action === 'edit') {
				editTournament(id);
				return;
			}
			if (action === 'delete') {
				deleteTournament(id);
			}
		});
	}

	function getTournamentModeLabel(mode) {
		const normalized = String(mode || 'any').trim();
		if (!normalized || normalized === 'any') return 'All Modes';
		return getGameTypeLabel(normalized);
	}

	function getTournamentFormatLabel(format) {
		const normalized = String(format || 'elimination')
			.trim()
			.toLowerCase();
		if (normalized === 'round-robin') return 'Round Robin';
		if (normalized === 'swiss') return 'Swiss System';
		return 'Single Elimination';
	}

	function parseFloatInRange(value, fallback, min, max) {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed)) return fallback;
		if (parsed < min) return min;
		if (parsed > max) return max;
		return parsed;
	}

	function normalizeTournamentModeValue(
		mode,
		fallback = 'any',
		allowEmpty = false,
	) {
		const normalized = String(mode ?? '')
			.trim()
			.toLowerCase();
		if (normalized) return normalized;
		if (allowEmpty) return '';
		const fallbackNormalized = String(fallback ?? '')
			.trim()
			.toLowerCase();
		return fallbackNormalized || 'any';
	}

	function normalizeTournamentRoundAssignments(
		assignments = [],
		globalTargetMode = 'any',
		availableGameIds = null,
	) {
		const normalizedGlobal = normalizeTournamentModeValue(
			globalTargetMode,
			'any',
		);
		return (Array.isArray(assignments) ? assignments : [])
			.map((entry) => {
				const round = Number(entry?.round);
				if (!Number.isFinite(round) || round < 1) return null;
				const rawGameIds = Array.isArray(entry?.gameIds) ? entry.gameIds : [];

				// Do NOT filter by availableGameIds here - keep all games
				// Filtering for missing games happens during rendering only
				const gameIds = [
					...new Set(
						rawGameIds.map((id) => String(id || '').trim()).filter(Boolean),
					),
				];
				const modeOverride = normalizeTournamentModeValue(
					entry?.modeOverride,
					'',
					true,
				);
				const derivedTargetMode = normalizeTournamentModeValue(
					entry?.targetMode,
					normalizedGlobal,
				);
				const effectiveMode = normalizeTournamentModeValue(
					modeOverride || derivedTargetMode || normalizedGlobal,
					normalizedGlobal,
				);
				const resolvedModeOverride =
					modeOverride && modeOverride !== normalizedGlobal ? modeOverride : '';
				return {
					round,
					modeOverride: resolvedModeOverride,
					targetMode: effectiveMode,
					gameIds,
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.round - b.round);
	}

	function parseTournamentRoundGameIdsValue(value) {
		if (Array.isArray(value)) {
			return [
				...new Set(value.map((id) => String(id || '').trim()).filter(Boolean)),
			];
		}
		const raw = String(value || '').trim();
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parseTournamentRoundGameIdsValue(parsed);
			}
		} catch (e) {}
		return [
			...new Set(
				raw
					.split(',')
					.map((id) => String(id || '').trim())
					.filter(Boolean),
			),
		];
	}

	function serializeTournamentRoundGameIds(gameIds) {
		return JSON.stringify(parseTournamentRoundGameIdsValue(gameIds));
	}

	function setTournamentRoundDraft(
		assignments,
		globalTargetMode = null,
		options = {},
	) {
		const normalizedGlobal = normalizeTournamentModeValue(
			globalTargetMode ?? byId('tournamentTargetMode')?.value,
			'any',
		);
		const normalizedAssignments = normalizeTournamentRoundAssignments(
			assignments,
			normalizedGlobal,
		);
		state.tournamentRoundDraft = normalizedAssignments;
		if (options?.persistWorkingState === true) {
			saveTournamentPlannerWorkingState({
				roundAssignments: normalizedAssignments,
			});
		}
		return normalizedAssignments;
	}

	function syncTournamentRoundDraftFromDom(roundCount, options = {}) {
		const safeRounds = Math.max(parseIntInRange(roundCount, 1, 1, 25), 1);
		const collected = collectTournamentRoundAssignments(safeRounds, {
			includeAllRounds: true,
		});
		return setTournamentRoundDraft(collected, options?.globalTargetMode, {
			persistWorkingState: options?.persistWorkingState === true,
		});
	}

	function getTournamentRoundHiddenInput(container, round) {
		const safeRound = Math.max(Number(round) || 0, 0);
		if (!container || safeRound < 1) return null;
		return container.querySelector(
			`.tournament-round-games-hidden[data-tournament-round="${safeRound}"]`,
		);
	}

	function updateTournamentRoundHiddenInput(container, round, updater) {
		const hiddenInput = getTournamentRoundHiddenInput(container, round);
		if (!hiddenInput || typeof updater !== 'function') return null;
		const currentIds = parseTournamentRoundGameIdsValue(hiddenInput.value);
		const nextValue = updater([...currentIds], hiddenInput);
		const nextIds = parseTournamentRoundGameIdsValue(
			Array.isArray(nextValue) ? nextValue : currentIds,
		);
		hiddenInput.value = serializeTournamentRoundGameIds(nextIds);
		return {
			hiddenInput,
			currentIds,
			nextIds,
		};
	}

	function applyTournamentRoundAssignmentsChange(
		activeTournament,
		roundCount,
		options = {},
	) {
		const persistActive = options?.persistActive === true;
		syncTournamentRoundDraftFromDom(roundCount, {
			globalTargetMode: options?.globalTargetMode,
			persistWorkingState:
				options?.persistWorkingState === true && persistActive !== true,
		});
		const persisted = persistActive ? persistActiveTournamentRoundDraft() : false;
		renderTournamentRoundAssignments(
			persisted ? getActiveTournament() : activeTournament,
			{
				useDomDraft: true,
			},
		);
		return persisted;
	}

	function buildTournamentAssignmentDetails(
		gameIds = [],
		fallbackDetails = [],
		options = {},
	) {
		const gamesLookup = buildTournamentGamesLookup();
		const fallbackMap = new Map();
		(Array.isArray(fallbackDetails) ? fallbackDetails : []).forEach(
			(detail) => {
				const id = String(detail?.id || '').trim();
				if (!id) return;
				fallbackMap.set(id, detail);
			},
		);
		const activeTournament = options?.activeTournament || null;
		const roundNumber = Math.max(Number(options?.round) || 1, 1);
		const createdGames = [];
		const details = parseTournamentRoundGameIdsValue(gameIds).map(
			(id, slotIndex) => {
				const liveGame = gamesLookup.get(id);
				const fallback = fallbackMap.get(id) || {};
				let instanceId = String(
					fallback?.instanceId || fallback?.gameInstanceId || '',
				).trim();
				if (
					activeTournament?.id &&
					!instanceId &&
					liveGame &&
					!isTournamentManagedGame(liveGame)
				) {
					const instanceGame = cloneTournamentTemplateGame(
						liveGame,
						{ id: activeTournament.id },
						roundNumber,
						slotIndex,
					);
					if (instanceGame) {
						createdGames.push(instanceGame);
						instanceId = instanceGame.id;
					}
				}
				return {
					id,
					instanceId,
					sourceGameId: id,
					name: liveGame?.name || fallback?.name || 'Untitled Game',
					type: liveGame?.type || fallback?.type || 'race',
					mode: liveGame?.mode || fallback?.mode || 'solo',
				};
			},
		);
		if (createdGames.length) {
			persistTournamentGameInstances(createdGames);
		}
		return details;
	}

	function persistActiveTournamentRoundDraft() {
		const active = getActiveTournament();
		if (
			!active ||
			state.tournamentPlannerHistoryMode === true ||
			!['active', 'paused'].includes(String(active.status || '').toLowerCase())
		) {
			return false;
		}
		const normalizedGlobal = normalizeTournamentModeValue(
			active.targetMode,
			'any',
		);
		const normalizedAssignments = normalizeTournamentRoundAssignments(
			state.tournamentRoundDraft,
			normalizedGlobal,
		);
		const existingByRound = new Map(
			(Array.isArray(active.roundAssignments)
				? active.roundAssignments
				: []
			).map((entry) => [Number(entry?.round) || 0, entry]),
		);
		const currentRound = Math.max(Number(active.currentRound) || 1, 1);
		active.roundAssignments = normalizedAssignments.map((entry, index) => {
			const existing = existingByRound.get(entry.round) || {};
			return {
				...existing,
				...entry,
				status:
					existing.status ||
					(entry.round < currentRound
						? 'completed'
						: entry.round === currentRound
							? 'active'
							: 'pending'),
				gameDetails: buildTournamentAssignmentDetails(
					entry.gameIds,
					existing.gameDetails,
					{
						activeTournament: active,
						round: entry.round,
					},
				),
			};
		});
		active.updatedAt = new Date().toISOString();
		localStorage.setItem('quizTournamentActive', JSON.stringify(active));
		syncGamificationState();
		renderTournamentPanels(active);
		return true;
	}

	function renderTournamentStatusChip(label, tone = 'waiting') {
		return `<span class="tournament-round-status-chip is-${escapeHtml(
			tone,
		)}">${escapeHtml(label)}</span>`;
	}

	function getTournamentPlannerControlIds() {
		return [
			'tournamentTargetMode',
			'tournamentFormat',
			'tournamentMaxParticipants',
			'tournamentRounds',
			'tournamentMatchMinutes',
			'tournamentBestOf',
			'tournamentPointMultiplier',
			'tournamentWinnerBonus',
			'tournamentRewardExpBonus',
			'tournamentRewardBadge',
			'tournamentNotes',
			'tournamentAutoSeeding',
			'tournamentAllowReentry',
		];
	}

	function setTournamentPlannerFormLocked(isLocked) {
		const activeTournament = getActiveTournament();
		const activeStatus = String(activeTournament?.status || '')
			.trim()
			.toLowerCase();
		const hasOngoingTournament =
			activeStatus === 'active' || activeStatus === 'paused';
		const locked =
			Boolean(isLocked) && state.tournamentPlannerHistoryMode !== true;
		getTournamentPlannerControlIds().forEach((id) => {
			const field = byId(id);
			if (field) field.disabled = locked;
		});
		if (byId('tournamentName')) {
			byId('tournamentName').disabled = locked;
		}
		if (byId('applyTournamentRecommendationBtn')) {
			byId('applyTournamentRecommendationBtn').disabled = locked;
		}
		if (byId('saveTournamentPlannerBtn')) {
			byId('saveTournamentPlannerBtn').disabled = locked;
		}
		if (byId('startTournamentBtn')) {
			byId('startTournamentBtn').disabled = hasOngoingTournament;
		}
		if (byId('endTournamentBtn')) {
			byId('endTournamentBtn').disabled = !hasOngoingTournament;
		}
		document
			.querySelectorAll(
				'.tournament-round-target-mode, .tournament-round-games-select, .tournament-round-search, .tournament-round-game-checkbox, .tournament-round-select-visible, .tournament-round-clear-btn, .tournament-round-slot-action-select, .tournament-round-slot-apply-btn',
			)
			.forEach((field) => {
				const canEditWhileLocked =
					String(field?.dataset?.persistActive || '').trim() === 'true';
				const disabled = locked && !canEditWhileLocked;
				if (
					field instanceof HTMLInputElement ||
					field instanceof HTMLSelectElement
				) {
					field.disabled = disabled;
				}
				if (field instanceof HTMLButtonElement) {
					field.disabled = disabled;
				}
			});
	}

	function updateTournamentSyncStatus(partial = null) {
		const next =
			partial && typeof partial === 'object'
				? {
						...state.tournamentSyncStatus,
						...partial,
					}
				: { ...state.tournamentSyncStatus };
		state.tournamentSyncStatus = next;

		const chipEl = byId('tournamentDeviceSyncState');
		const lastEl = byId('tournamentLastSyncAt');
		const connected = next.connected === true;
		const deviceCount = Math.max(Number(next.deviceCount) || 0, 0);
		const lastSyncAtRaw = String(
			next.lastSyncAt || localStorage.getItem('quizGamificationSyncedAt') || '',
		).trim();
		const lastSyncDate = lastSyncAtRaw ? new Date(lastSyncAtRaw) : null;
		const lastSyncLabel =
			lastSyncDate && !Number.isNaN(lastSyncDate.getTime())
				? lastSyncDate.toLocaleString()
				: 'Never';

		if (chipEl) {
			chipEl.classList.remove('is-connected', 'is-disconnected');
			chipEl.classList.add(connected ? 'is-connected' : 'is-disconnected');
			chipEl.textContent = connected
				? `Realtime linked: ${deviceCount} device(s) online`
				: 'Realtime link: disconnected';
		}
		if (lastEl) {
			lastEl.textContent = `Last sync: ${lastSyncLabel}`;
		}
	}

	function bindTournamentSyncEvents() {
		if (state.tournamentSyncEventsBound) return;
		state.tournamentSyncEventsBound = true;

		window.addEventListener('quiz:realtime-status', (event) => {
			const detail =
				event?.detail && typeof event.detail === 'object' ? event.detail : {};
			updateTournamentSyncStatus({
				connected: detail.connected === true,
				deviceCount: Number(detail.deviceCount ?? detail.onlineDevices) || 0,
			});
		});

		window.addEventListener('quiz:gamification-updated', () => {
			updateTournamentSyncStatus({
				lastSyncAt:
					localStorage.getItem('quizGamificationSyncedAt') ||
					new Date().toISOString(),
			});
		});

		window.addEventListener('quiz:games-updated', () => {
			if (state.tournamentStudioTab === 'dashboard') {
				renderTournamentPanels();
			}
		});

		const realtimeState =
			window.__quizRealtimeState &&
			typeof window.__quizRealtimeState === 'object'
				? window.__quizRealtimeState
				: {};
		updateTournamentSyncStatus({
			connected: realtimeState.connected === true,
			deviceCount:
				Number(realtimeState.deviceCount ?? realtimeState.onlineDevices) || 0,
			lastSyncAt: localStorage.getItem('quizGamificationSyncedAt') || '',
		});
	}

	function estimateRecommendedRounds(format, participants) {
		const safeParticipants = Math.max(
			parseIntInRange(participants, 16, 2, 512),
			2,
		);
		const normalized = String(format || 'elimination').toLowerCase();
		if (normalized === 'round-robin') {
			return parseIntInRange(
				safeParticipants > 2 ? safeParticipants - 1 : 1,
				1,
				1,
				25,
			);
		}
		if (normalized === 'swiss') {
			return parseIntInRange(
				Math.max(2, Math.ceil(Math.log2(safeParticipants)) + 1),
				4,
				1,
				25,
			);
		}
		return parseIntInRange(
			Math.max(1, Math.ceil(Math.log2(safeParticipants))),
			4,
			1,
			25,
		);
	}

	function estimateMatchCount(format, participants, rounds) {
		const safeParticipants = Math.max(
			parseIntInRange(participants, 16, 2, 512),
			2,
		);
		const safeRounds = Math.max(parseIntInRange(rounds, 1, 1, 25), 1);
		const normalized = String(format || 'elimination').toLowerCase();
		if (normalized === 'round-robin') {
			return Math.ceil((safeParticipants * (safeParticipants - 1)) / 2);
		}
		if (normalized === 'swiss') {
			return Math.ceil((safeParticipants * safeRounds) / 2);
		}
		return Math.max(safeParticipants - 1, 1);
	}

	function estimateDurationHours(matchCount, matchMinutes, bestOf) {
		const safeMatches = Math.max(parseIntInRange(matchCount, 1, 1, 100000), 1);
		const safeMatchMinutes = Math.max(
			parseIntInRange(matchMinutes, 12, 3, 180),
			3,
		);
		const safeBestOf = Math.max(parseIntInRange(bestOf, 1, 1, 5), 1);
		const totalMinutes = safeMatches * safeMatchMinutes * safeBestOf;
		return Math.max(totalMinutes / 60, 0.25);
	}

	function buildTournamentFormConfig() {
		const format = String(
			byId('tournamentFormat')?.value || 'elimination',
		).trim();
		const maxParticipants = parseIntInRange(
			byId('tournamentMaxParticipants')?.value,
			16,
			2,
			512,
		);
		const recommendedRounds = estimateRecommendedRounds(
			format,
			maxParticipants,
		);
		const rounds = parseIntInRange(
			byId('tournamentRounds')?.value,
			recommendedRounds,
			1,
			25,
		);
		const matchMinutes = parseIntInRange(
			byId('tournamentMatchMinutes')?.value,
			12,
			3,
			180,
		);
		const bestOf = parseIntInRange(byId('tournamentBestOf')?.value, 1, 1, 5);
		const pointMultiplier = parseFloatInRange(
			byId('tournamentPointMultiplier')?.value,
			1,
			0.25,
			10,
		);
		const winnerBonus = parseIntInRange(
			byId('tournamentWinnerBonus')?.value,
			100,
			0,
			5000,
		);
		const rewardExpBonus = parseIntInRange(
			byId('tournamentRewardExpBonus')?.value,
			250,
			0,
			5000,
		);
		const rewardBadge = String(
			byId('tournamentRewardBadge')?.value || '',
		).trim();
		const notes = String(byId('tournamentNotes')?.value || '').trim();
		const autoSeeding = byId('tournamentAutoSeeding')?.checked !== false;
		const allowReentry = byId('tournamentAllowReentry')?.checked === true;
		const estimatedMatches = estimateMatchCount(
			format,
			maxParticipants,
			rounds,
		);
		const estimatedDurationHours = estimateDurationHours(
			estimatedMatches,
			matchMinutes,
			bestOf,
		);

		return {
			format,
			maxParticipants,
			rounds,
			matchMinutes,
			bestOf,
			pointMultiplier,
			winnerBonus,
			rewardExpBonus,
			rewardBadge,
			notes,
			autoSeeding,
			allowReentry,
			recommendedRounds,
			estimatedMatches,
			estimatedDurationHours,
		};
	}

	function applyTournamentConfigToForm(config = {}, options = {}) {
		const keepName = Boolean(options.keepName);
		if (!keepName && byId('tournamentName')) {
			byId('tournamentName').value = String(config.name || '');
		}
		if (byId('tournamentTargetMode')) {
			byId('tournamentTargetMode').value = String(config.targetMode || 'any');
		}
		if (byId('tournamentFormat')) {
			byId('tournamentFormat').value = String(config.format || 'elimination');
		}
		if (byId('tournamentMaxParticipants')) {
			byId('tournamentMaxParticipants').value = String(
				parseIntInRange(config.maxParticipants, 16, 2, 512),
			);
		}
		if (byId('tournamentRounds')) {
			byId('tournamentRounds').value = String(
				parseIntInRange(
					config.rounds,
					estimateRecommendedRounds(config.format, config.maxParticipants),
					1,
					25,
				),
			);
		}
		if (byId('tournamentMatchMinutes')) {
			byId('tournamentMatchMinutes').value = String(
				parseIntInRange(config.matchMinutes, 12, 3, 180),
			);
		}
		if (byId('tournamentBestOf')) {
			byId('tournamentBestOf').value = String(
				parseIntInRange(config.bestOf, 1, 1, 5),
			);
		}
		if (byId('tournamentPointMultiplier')) {
			byId('tournamentPointMultiplier').value = String(
				parseFloatInRange(config.pointMultiplier, 1, 0.25, 10),
			);
		}
		if (byId('tournamentWinnerBonus')) {
			byId('tournamentWinnerBonus').value = String(
				parseIntInRange(config.winnerBonus, 100, 0, 5000),
			);
		}
		if (byId('tournamentRewardExpBonus')) {
			byId('tournamentRewardExpBonus').value = String(
				parseIntInRange(config.rewardExpBonus, 250, 0, 5000),
			);
		}
		if (byId('tournamentRewardBadge')) {
			byId('tournamentRewardBadge').value = String(config.rewardBadge || '');
		}
		if (byId('tournamentNotes')) {
			byId('tournamentNotes').value = String(config.notes || '');
		}
		if (byId('tournamentAutoSeeding')) {
			byId('tournamentAutoSeeding').checked = config.autoSeeding !== false;
		}
		if (byId('tournamentAllowReentry')) {
			byId('tournamentAllowReentry').checked = config.allowReentry === true;
		}
	}

	function renderTournamentRecommendations() {
		const card = byId('tournamentRecommendations');
		if (!card) return;
		const config = buildTournamentFormConfig();
		const duration = Number(config.estimatedDurationHours || 0).toFixed(1);
		const roundAdvice =
			config.rounds === config.recommendedRounds
				? `Rounds are aligned with the recommended value (${config.recommendedRounds}).`
				: `Recommended rounds for this setup: ${config.recommendedRounds}.`;
		const benefitFocus =
			config.format === 'round-robin'
				? 'Best for fairness and full exposure because everyone plays multiple opponents.'
				: config.format === 'swiss'
					? 'Best for medium-large groups where you want balanced pairings without full round-robin load.'
					: 'Best for fast events with clear knockout progression.';
		const seedingAdvice =
			config.autoSeeding !== false
				? 'Auto seeding is enabled for round-one pairing guidance.'
				: 'Auto seeding is disabled; first-round pairing is manual/open.';
		const reentryAdvice =
			config.allowReentry === true
				? 'Early-round re-entry is enabled until round two closes.'
				: 'Early-round re-entry is disabled after the tournament starts.';
		card.innerHTML = `
			<h4>Tournament Blueprint</h4>
			<div class="tournament-meta">
				<span class="tournament-meta-chip">${escapeHtml(
					getTournamentFormatLabel(config.format),
				)}</span>
				<span class="tournament-meta-chip">${escapeHtml(
					String(config.rounds),
				)} round(s)</span>
				<span class="tournament-meta-chip">${escapeHtml(
					String(config.estimatedMatches),
				)} estimated match(es)</span>
				<span class="tournament-meta-chip">~${escapeHtml(duration)}h total</span>
			</div>
			<ul>
				<li>${escapeHtml(roundAdvice)}</li>
				<li>${escapeHtml(benefitFocus)}</li>
				<li>${escapeHtml(seedingAdvice)}</li>
				<li>${escapeHtml(reentryAdvice)}</li>
				<li>Recommended for class motivation: keep match duration between 8 and 15 minutes.</li>
				<li>Use winner bonus and badge reward to make finals meaningful.</li>
			</ul>
		`;
	}

	/**
	 * Get set of all existing game IDs in the system (includes all games, not just templates)
	 * This is used to detect TRULY DELETED games, not mode-filtered ones
	 * @returns {Set<string>} Set of all existing game IDs
	 */
	function getAvailableTournamentGameIds() {
		const allGames = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
		return new Set(
			allGames.map((game) => String(game?.id || '').trim()).filter(Boolean),
		);
	}

	/**
	 * Get missing games for a specific round (games that were removed from system)
	 * @param {number} round - Round number
	 * @param {Set<string>} availableGameIds - Set of available game IDs
	 * @param {Map<number, Set<string>>} assignedByRound - Map of round to assigned game IDs
	 * @returns {Array<string>} Array of missing game IDs
	 */
	function getMissingGamesForRound(round, availableGameIds, assignedByRound) {
		const assignedIds = assignedByRound.get(round) || new Set();
		return Array.from(assignedIds).filter(
			(id) => !availableGameIds.has(String(id).trim()),
		);
	}

	/**
	 * Get all missing games across all rounds
	 * @param {number} rounds - Number of rounds
	 * @param {Set<string>} availableGameIds - Set of available game IDs
	 * @param {Map<number, Set<string>>} assignedByRound - Map of round to assigned game IDs
	 * @returns {Map<number, Array<string>>} Map of round to missing game IDs
	 */
	function getMissingGamesAcrossRounds(
		rounds,
		availableGameIds,
		assignedByRound,
	) {
		const missingByRound = new Map();
		for (let round = 1; round <= rounds; round++) {
			const missing = getMissingGamesForRound(
				round,
				availableGameIds,
				assignedByRound,
			);
			if (missing.length > 0) {
				missingByRound.set(round, missing);
			}
		}
		return missingByRound;
	}

	function renderTournamentRoundAssignments(
		activeTournament = getActiveTournament(),
		options = {},
	) {
		const container = byId('tournamentRoundGameAssignments');
		if (!container) return;

		const config = buildTournamentFormConfig();
		const rounds = Math.max(parseIntInRange(config.rounds, 1, 1, 25), 1);
		const globalTargetMode = normalizeTournamentModeValue(
			byId('tournamentTargetMode')?.value,
			'any',
		);
		const ongoingTournament = getActiveTournament();
		const ongoingStatus = String(ongoingTournament?.status || '')
			.trim()
			.toLowerCase();
		const hasOngoingTournament =
			ongoingStatus === 'active' || ongoingStatus === 'paused';
		const isLocked =
			options?.forceUnlocked === true
				? false
				: options?.forceLocked === true || hasOngoingTournament;

		const allGames = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
		const templateGames = getTournamentTemplateGames(allGames);
		const useDomDraft = options?.useDomDraft !== false;
		const domAssignments = useDomDraft
			? collectTournamentRoundAssignments(rounds, {
					includeAllRounds: true,
					requireControls: true,
				})
			: [];
		const existingAssignments = Array.isArray(
			activeTournament?.roundAssignments,
		)
			? activeTournament.roundAssignments
			: [];

		// Use DOM assignments if available (user's current choice), otherwise use draft or existing
		// CRITICAL: Never restore deleted games from draft if user explicitly removed them
		let sourceAssignments = [];
		if (domAssignments.length > 0) {
			// DOM has the latest user selections - trust it completely
			sourceAssignments = domAssignments;
		} else if (
			state.tournamentRoundDraft &&
			state.tournamentRoundDraft.length > 0
		) {
			sourceAssignments = state.tournamentRoundDraft;
		} else {
			sourceAssignments = existingAssignments;
		}

		// Get available games for missing game detection
		const availableGameIds = getAvailableTournamentGameIds();
		const normalizedAssignments = normalizeTournamentRoundAssignments(
			sourceAssignments,
			globalTargetMode,
		);
		setTournamentRoundDraft(normalizedAssignments, globalTargetMode, {
			persistWorkingState: false,
		});
		const assignedByRound = new Map();
		const modeOverrideByRound = new Map();
		normalizedAssignments.forEach((entry) => {
			if (!entry) return;
			const round = Number(entry.round);
			if (!Number.isFinite(round) || round < 1) return;
			const ids = Array.isArray(entry.gameIds) ? entry.gameIds : [];
			assignedByRound.set(
				round,
				new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)),
			);
			modeOverrideByRound.set(
				round,
				normalizeTournamentModeValue(entry.modeOverride, '', true),
			);
		});
		const detailByRound = new Map();
		existingAssignments.forEach((entry) => {
			const round = Number(entry?.round);
			if (!Number.isFinite(round) || round < 1) return;
			const roundDetails = new Map();
			(Array.isArray(entry?.gameDetails) ? entry.gameDetails : []).forEach(
				(detail) => {
					const id = String(detail?.id || '').trim();
					if (!id) return;
					roundDetails.set(id, detail);
				},
			);
			detailByRound.set(round, roundDetails);
		});

		const allGamesLookup = new Map();
		(Array.isArray(templateGames) ? templateGames : []).forEach((game) => {
			const id = String(game?.id || '').trim();
			if (!id) return;
			allGamesLookup.set(id, game);
		});
		const sortableGames = [...templateGames].sort((left, right) => {
			const statusOrder = {
				open: 0,
				draft: 1,
				live: 2,
				completed: 3,
			};
			const leftStatus =
				statusOrder[String(left?.status || '').toLowerCase()] ?? 4;
			const rightStatus =
				statusOrder[String(right?.status || '').toLowerCase()] ?? 4;
			return (
				leftStatus - rightStatus ||
				String(left?.name || '').localeCompare(String(right?.name || ''))
			);
		});

		let html = '';

		// Detect and render missing games panel
		const missingByRound = getMissingGamesAcrossRounds(
			rounds,
			availableGameIds,
			assignedByRound,
		);
		if (missingByRound.size > 0) {
			const totalMissing = Array.from(missingByRound.values()).reduce(
				(sum, arr) => sum + arr.length,
				0,
			);
			html += `
				<div class="tournament-missing-games-panel is-warning">
					<div class="tournament-missing-games-title">Missing Games Detected (${totalMissing})</div>
					<p class="tournament-missing-games-note">Resolve each missing slot directly from the Selected Games cards below. Replace and remove now use a single control in one place.</p>
				</div>
			`;
		}

		for (let round = 1; round <= rounds; round++) {
			const roundModeOverride = modeOverrideByRound.get(round) || '';
			const roundTargetMode = normalizeTournamentModeValue(
				roundModeOverride || globalTargetMode,
				globalTargetMode,
			);
			const modeSelectId = `tournamentRoundTargetMode-${round}`;
			const selectedIds = assignedByRound.get(round) || new Set();
			const disabledAttr = isLocked ? ' disabled' : '';
			const roundSearchValue = String(
				state.tournamentRoundSearch?.[round] || '',
			).trim();

			const roundGames = sortableGames.filter((game) => {
				if (!game) return false;
				const gameType = normalizeTournamentModeValue(game.type, 'any');
				if (roundTargetMode !== 'any' && gameType !== roundTargetMode) {
					return false;
				}
				return true;
			});
			const selectedEntries = Array.from(selectedIds).map((id) => {
				const liveGame = allGamesLookup.get(id) || null;
				const fallback = detailByRound.get(round)?.get(id) || null;
				const rawType = liveGame?.type || fallback?.type || 'race';
				const inCurrentMode =
					Boolean(liveGame) &&
					(roundTargetMode === 'any' ||
						normalizeTournamentModeValue(rawType, 'any') === roundTargetMode);
				return {
					id,
					name: liveGame?.name || fallback?.name || 'Removed Game',
					type: rawType,
					mode: liveGame?.mode || fallback?.mode || 'solo',
					status: String(liveGame?.status || '').toLowerCase() || 'removed',
					templateStatus:
						String(liveGame?.status || '').toLowerCase() || 'draft',
					historyCount: Array.isArray(liveGame?.lobbyHistory)
						? liveGame.lobbyHistory.length
						: 0,
					isMissing: !liveGame,
					isOutOfFilter: Boolean(liveGame) && !inCurrentMode,
				};
			});
			const candidateCardsHtml = roundGames
				.map((game) => {
					const id = String(game?.id || '').trim();
					if (!id) return '';
					const checked = selectedIds.has(id);
					const isDeleted = !availableGameIds.has(id);
					const searchCorpus = [
						game.name,
						getGameTypeLabel(game.type),
						game.mode === 'team' ? 'Team vs Team' : '1 vs 1',
						Array.isArray(game.lobbyHistory)
							? `${game.lobbyHistory.length} history`
							: 'fresh tournament copy',
					]
						.map((value) => String(value || '').toLowerCase())
						.join(' ');
					return `
						<label class="tournament-round-candidate ${checked ? 'is-selected' : ''} ${isDeleted ? 'is-disabled' : ''}" data-search="${escapeHtml(
							searchCorpus,
						)}" title="${isDeleted ? 'This game was removed from your system and cannot be selected' : ''}">
							<input
								type="checkbox"
								class="tournament-round-game-checkbox"
								data-tournament-round="${round}"
								value="${escapeHtml(id)}"
								${checked ? 'checked' : ''}
								${disabledAttr || isDeleted ? 'disabled' : ''}
							/>
							<div class="tournament-round-candidate-main">
								<div class="tournament-round-candidate-title">${escapeHtml(
									game.name || 'Untitled game',
								)}${isDeleted ? ' (deleted)' : ''}</div>
								<div class="tournament-round-candidate-meta">${escapeHtml(
									getGameTypeLabel(game.type),
								)} • ${escapeHtml(
									game.mode === 'team' ? 'Team vs Team' : '1 vs 1',
								)} • ${escapeHtml(
									Array.isArray(game.lobbyHistory) && game.lobbyHistory.length
										? `${game.lobbyHistory.length} past lobby${
												game.lobbyHistory.length === 1 ? '' : 'ies'
											}`
										: 'Fresh tournament copy at launch',
								)}</div>
							</div>
						</label>
					`;
				})
				.join('');
			const selectedCardsHtml = selectedEntries.length
				? selectedEntries
						.map((entry) => {
							const canManageWhileLocked =
								isLocked && (entry.isMissing || entry.isOutOfFilter);
							const canManageEntry = !isLocked || canManageWhileLocked;
							const warningLabel = entry.isMissing
								? 'Removed from pool'
								: entry.isOutOfFilter
									? 'Outside current mode filter'
									: 'Fresh tournament session';
							const warningClass = entry.isMissing
								? 'danger'
								: entry.isOutOfFilter
									? 'warning'
									: 'fresh';
							const shouldPersistActive =
								hasOngoingTournament &&
								(entry.isMissing || entry.isOutOfFilter);
							const detailNote = entry.isMissing
								? 'This template is no longer available, so the round needs a replacement.'
								: entry.isOutOfFilter
									? 'This template no longer matches the current round filter.'
									: entry.historyCount > 0
										? `Template history stays separate. ${entry.historyCount} previous lobby${
												entry.historyCount === 1 ? '' : 'ies'
											} will not carry into this round.`
										: 'This round will launch a brand-new tournament lobby with no carried-over wins, losses, or completions.';
							const slotActionOptionsHtml = roundGames
								.filter((game) => {
									const id = String(game?.id || '').trim();
									return Boolean(id && id !== entry.id && !selectedIds.has(id));
								})
								.map((game) => {
									const id = String(game?.id || '').trim();
									return `<option value="replace:${escapeHtml(id)}">Replace with ${escapeHtml(
										game.name || 'Untitled game',
									)} | ${escapeHtml(getGameTypeLabel(game.type))}</option>`;
								})
								.join('');
							return `
								<article class="tournament-round-selected-game ${
									entry.isMissing || entry.isOutOfFilter ? 'is-warning' : ''
								}">
									<div class="tournament-round-selected-main">
										<div class="tournament-round-selected-title">${escapeHtml(entry.name)}</div>
										<div class="tournament-round-selected-meta">${escapeHtml(
											getGameTypeLabel(entry.type),
										)} • ${escapeHtml(
											entry.mode === 'team' ? 'Team vs Team' : '1 vs 1',
										)} • ${renderTournamentStatusChip(
											warningLabel,
											warningClass,
										)}</div>
										<div class="tournament-round-selected-note">${escapeHtml(detailNote)}</div>
									</div>
									<div class="tournament-round-selected-actions">
										${
											canManageEntry
												? `<div class="tournament-round-replacement-row">
														<select
															class="form-control tournament-round-slot-action-select"
															data-tournament-round="${round}"
															data-game-id="${escapeHtml(entry.id)}"
															data-persist-active="${shouldPersistActive ? 'true' : 'false'}"
														>
															<option value="">Manage this slot</option>
															<option value="remove">Remove from round</option>
															${slotActionOptionsHtml}
														</select>
														<button
															type="button"
															class="btn btn-sm btn-primary-soft tournament-round-slot-apply-btn"
															data-tournament-round="${round}"
															data-game-id="${escapeHtml(entry.id)}"
															data-persist-active="${shouldPersistActive ? 'true' : 'false'}"
															disabled
														>
															Apply
														</button>
													</div>`
												: ''
										}
									</div>
								</article>
							`;
						})
						.join('')
				: '<div class="tournament-round-empty">No games selected for this round yet.</div>';

			const effectiveModeLabel = getTournamentModeLabel(roundTargetMode);
			const modeSourceLabel = roundModeOverride
				? `Override: ${effectiveModeLabel}`
				: `Using global: ${getTournamentModeLabel(globalTargetMode)}`;
			html += `
				<article class="tournament-round-card">
					<div class="tournament-round-card-header">
						<div>
							<h4>Round ${round}</h4>
							<div class="tournament-round-card-copy">${escapeHtml(modeSourceLabel)}</div>
							<div class="tournament-round-card-note">Selected templates launch as fresh tournament-only lobbies, so previous wins, losses, and completed sessions never carry into this round.</div>
						</div>
						<div class="tournament-round-card-summary">
							<span class="tournament-meta-chip">${escapeHtml(
								String(selectedEntries.length),
							)} selected</span>
							<span class="tournament-meta-chip" data-role="available-count">${escapeHtml(
								String(roundGames.length),
							)} visible</span>
						</div>
					</div>
					<div class="form-group">
						<label for="${modeSelectId}">Target Game Mode</label>
						<select
							id="${modeSelectId}"
							class="form-control tournament-round-target-mode"
							data-tournament-round="${round}"
							${disabledAttr}
						>
							<option value="" ${!roundModeOverride ? 'selected' : ''}>Use Global Setting (${escapeHtml(
								getTournamentModeLabel(globalTargetMode),
							)})</option>
							<option value="any" ${roundModeOverride === 'any' ? 'selected' : ''}>Any Mode</option>
							<option value="cards" ${roundModeOverride === 'cards' ? 'selected' : ''}>Card Battle</option>
							<option value="cards-draw" ${roundModeOverride === 'cards-draw' ? 'selected' : ''}>Card Draw Battle</option>
							<option value="race" ${roundModeOverride === 'race' ? 'selected' : ''}>Lightning Race</option>
							<option value="sprint-race" ${roundModeOverride === 'sprint-race' ? 'selected' : ''}>Sprint Race</option>
							<option value="hot-potato" ${roundModeOverride === 'hot-potato' ? 'selected' : ''}>Hot Potato</option>
							<option value="last-survivor" ${roundModeOverride === 'last-survivor' ? 'selected' : ''}>Last Survivor</option>
						</select>
					</div>
					<input
						type="hidden"
						class="tournament-round-games-hidden"
						data-tournament-round="${round}"
						value="${escapeHtml(serializeTournamentRoundGameIds(Array.from(selectedIds)))}"
					/>
					<div class="tournament-round-selection-toolbar">
						<input
							type="search"
							class="form-control tournament-round-search"
							data-tournament-round="${round}"
							placeholder="Search by name, mode, or history"
							value="${escapeHtml(roundSearchValue)}"
							${isLocked ? 'disabled' : ''}
						/>
						<div class="tournament-round-toolbar-actions">
							<button
								type="button"
								class="btn btn-sm btn-secondary tournament-round-select-visible"
								data-tournament-round="${round}"
								${disabledAttr}
							>
								Select Visible
							</button>
							<button
								type="button"
								class="btn btn-sm btn-secondary tournament-round-clear-btn"
								data-tournament-round="${round}"
								${disabledAttr}
							>
								Clear
							</button>
						</div>
					</div>
					<div class="tournament-round-selected-list">
						<div class="tournament-round-section-title">Selected Games</div>
						${selectedCardsHtml}
					</div>
					<div class="tournament-round-candidate-panel">
						<div class="tournament-round-section-title">Available Games</div>
						<div class="tournament-round-candidate-grid">
							${
								candidateCardsHtml ||
								`<div class="tournament-round-empty">No games available for ${escapeHtml(
									effectiveModeLabel,
								)}.</div>`
							}
						</div>
						${
							selectedEntries.some(
								(entry) => entry.isMissing || entry.isOutOfFilter,
							)
								? `<small class="text-muted">Missing or out-of-filter games can be managed directly from the selected list${
										isLocked ? ' even while the tournament is active' : ''
									}.</small>`
								: ''
						}
					</div>
				</article>
			`;
		}

		if (!html) {
			container.innerHTML =
				'<div class="empty-state-small">No games available. Create games first in Games Studio.</div>';
			setTournamentPlannerFormLocked(isLocked);
			return;
		}

		window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);
		container
			.querySelectorAll('.tournament-missing-games-panel')
			.forEach((panel) => {
				panel
					.querySelectorAll('.tournament-missing-games-title')
					.forEach((title, index) => {
						if (index > 0) title.remove();
					});
			});
		if (!isLocked) {
			const newDomAssignments = collectTournamentRoundAssignments(rounds, {
				includeAllRounds: true,
			});
			setTournamentRoundDraft(newDomAssignments, globalTargetMode, {
				persistWorkingState: false,
			});
		}
		const filterRoundCard = (roundCard) => {
			if (!roundCard) return;
			const searchInput = roundCard.querySelector('.tournament-round-search');
			const searchTerm = String(searchInput?.value || '')
				.trim()
				.toLowerCase();
			const candidateCards = Array.from(
				roundCard.querySelectorAll('.tournament-round-candidate'),
			);
			let visibleCount = 0;
			candidateCards.forEach((card) => {
				const haystack = String(card.dataset.search || '').toLowerCase();
				const isVisible = !searchTerm || haystack.includes(searchTerm);
				card.classList.toggle('is-hidden', !isVisible);
				if (isVisible) visibleCount += 1;
			});
			const availableCountEl = roundCard.querySelector(
				'[data-role="available-count"]',
			);
			if (availableCountEl) {
				availableCountEl.textContent = `${visibleCount} visible`;
			}
		};

		for (let round = 1; round <= rounds; round++) {
			const roundCard = container.querySelector(
				`.tournament-round-card:nth-of-type(${round})`,
			);
			let modeSelect = container.querySelector(
				`.tournament-round-target-mode[data-tournament-round="${round}"]`,
			);
			let searchInput = container.querySelector(
				`.tournament-round-search[data-tournament-round="${round}"]`,
			);
			let hiddenInput = container.querySelector(
				`.tournament-round-games-hidden[data-tournament-round="${round}"]`,
			);
			// Clone mode select to remove old listeners
			if (modeSelect && hiddenInput) {
				const newModeSelect = modeSelect.cloneNode(true);
				modeSelect.parentNode.replaceChild(newModeSelect, modeSelect);
				modeSelect = newModeSelect;
				modeSelect.addEventListener('change', function () {
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistWorkingState: !hasOngoingTournament,
					});
				});
			}
			// Clone search input to remove old listeners
			if (searchInput && roundCard) {
				const newSearchInput = searchInput.cloneNode(true);
				searchInput.parentNode.replaceChild(newSearchInput, searchInput);
				searchInput = newSearchInput;
				searchInput.addEventListener('input', function () {
					state.tournamentRoundSearch[round] = this.value || '';
					filterRoundCard(roundCard);
				});
				filterRoundCard(roundCard);
			}
			let selectVisibleBtn = container.querySelector(
				`.tournament-round-select-visible[data-tournament-round="${round}"]`,
			);
			// Clone select visible button to remove old listeners
			if (selectVisibleBtn && hiddenInput) {
				const newSelectVisibleBtn = selectVisibleBtn.cloneNode(true);
				selectVisibleBtn.parentNode.replaceChild(
					newSelectVisibleBtn,
					selectVisibleBtn,
				);
				selectVisibleBtn = newSelectVisibleBtn;
				selectVisibleBtn.addEventListener('click', function () {
					const visibleIds = Array.from(
						roundCard?.querySelectorAll(
							'.tournament-round-candidate:not(.is-hidden) .tournament-round-game-checkbox:not(:disabled)',
						) || [],
					).map((field) => String(field.value || '').trim());
					updateTournamentRoundHiddenInput(container, round, (currentIds) => [
						...currentIds,
						...visibleIds,
					]);
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistWorkingState: !hasOngoingTournament,
					});
				});
			}
			let clearBtn = container.querySelector(
				`.tournament-round-clear-btn[data-tournament-round="${round}"]`,
			);
			// Clone clear button to remove old listeners
			if (clearBtn && hiddenInput) {
				const newClearBtn = clearBtn.cloneNode(true);
				clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
				clearBtn = newClearBtn;
				clearBtn.addEventListener('click', function () {
					hiddenInput.value = serializeTournamentRoundGameIds([]);
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistWorkingState: !hasOngoingTournament,
					});
				});
			}
		}
		container
			.querySelectorAll('.tournament-round-game-checkbox')
			.forEach((field) => {
				// Remove any existing listeners by cloning and replacing
				const newField = field.cloneNode(true);
				field.parentNode.replaceChild(newField, field);
				newField.addEventListener('change', function () {
					const round = Number(this.dataset.tournamentRound || 0);
					const value = String(this.value || '').trim();
					updateTournamentRoundHiddenInput(container, round, (currentIds) => {
						const ids = new Set(currentIds);
						if (this.checked) {
							ids.add(value);
						} else {
							ids.delete(value);
						}
						return Array.from(ids);
					});
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistWorkingState: !hasOngoingTournament,
					});
				});
			});
		container
			.querySelectorAll('.tournament-round-slot-action-select')
			.forEach((field) => {
				const newField = field.cloneNode(true);
				field.parentNode.replaceChild(newField, field);
				newField.addEventListener('change', function () {
					const round = Number(this.dataset.tournamentRound || 0);
					const targetGameId = String(this.dataset.gameId || '').trim();
					const applyButton = container.querySelector(
						`.tournament-round-slot-apply-btn[data-tournament-round="${round}"][data-game-id="${targetGameId}"]`,
					);
					if (applyButton) {
						applyButton.disabled = !String(this.value || '').trim();
					}
				});
			});
		container
			.querySelectorAll('.tournament-round-slot-apply-btn')
			.forEach((button) => {
				const newButton = button.cloneNode(true);
				button.parentNode.replaceChild(newButton, button);
				newButton.addEventListener('click', function () {
					const round = Number(this.dataset.tournamentRound || 0);
					const targetGameId = String(this.dataset.gameId || '').trim();
					const actionSelect = container.querySelector(
						`.tournament-round-slot-action-select[data-tournament-round="${round}"][data-game-id="${targetGameId}"]`,
					);
					const actionValue = String(actionSelect?.value || '').trim();
					if (!targetGameId || !actionValue) return;
					if (actionValue === 'remove') {
						updateTournamentRoundHiddenInput(container, round, (currentIds) =>
							currentIds.filter((id) => id !== targetGameId),
						);
					} else if (actionValue.startsWith('replace:')) {
						const replacementId = String(
							actionValue.slice('replace:'.length),
						).trim();
						if (!replacementId) {
							showToast('Choose a replacement game first.', 'warning');
							return;
						}
						updateTournamentRoundHiddenInput(container, round, (currentIds) =>
							currentIds.map((id) =>
								id === targetGameId ? replacementId : id,
							),
						);
					} else {
						return;
					}
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistActive: this.dataset.persistActive === 'true',
						persistWorkingState: !hasOngoingTournament,
					});
					showToast(
						actionValue === 'remove'
							? 'Game removed from round.'
							: 'Round game replaced successfully.',
						'success',
					);
				});
			});
		setTournamentPlannerFormLocked(isLocked);
	}

	/**
	 * Show modal for managing all missing games across rounds
	 */
	function showTournamentMissingGamesModal(missingByRound, rounds) {
		const container = byId('tournamentRoundGameAssignments');
		if (!container || !missingByRound || missingByRound.size === 0) return;

		const templateGames = getTournamentTemplateGames(
			GameCore.getQuizGames ? GameCore.getQuizGames() : [],
		);
		const allGamesOptions = templateGames
			.map((game) => {
				const id = String(game?.id || '').trim();
				if (!id) return '';
				return `<option value="${escapeHtml(id)}">${escapeHtml(
					game.name || 'Untitled game',
				)} | ${escapeHtml(getGameTypeLabel(game.type))}</option>`;
			})
			.join('');

		let managementHtml = '<div class="tournament-missing-games-management">';

		missingByRound.forEach((missingIds, round) => {
			if (missingIds.length === 0) return;
			managementHtml += `
				<div class="tournament-missing-games-round-section">
					<h5>Round ${round} (${missingIds.length} missing)</h5>
					<div class="tournament-missing-games-actions">
						<div class="form-group">
							<label>Action for this round</label>
							<select class="form-control tournament-missing-action-select" data-tournament-round="${round}">
								<option value="">Choose action...</option>
								<option value="remove-all">Remove all missing games</option>
								<option value="replace-all">Replace all with same game</option>
							</select>
						</div>
						<div class="form-group tournament-missing-action-replacement" style="display: none;" data-tournament-round="${round}">
							<label>Replacement game</label>
							<select class="form-control tournament-missing-replacement-select" data-tournament-round="${round}">
								<option value="">Choose replacement</option>
								${allGamesOptions}
							</select>
						</div>
						<div class="tournament-missing-action-buttons">
							<button type="button" class="btn btn-sm btn-primary tournament-missing-action-apply-btn" data-tournament-round="${round}" disabled>
								Apply
							</button>
						</div>
					</div>
				</div>
			`;
		});

		managementHtml += '</div>';

		// Create modal overlay
		const modal = document.createElement('div');
		modal.className = 'modal-overlay tournament-missing-games-modal-overlay';
		modal.innerHTML = `
			<div class="modal-content tournament-missing-games-modal">
				<div class="modal-header">
					<h3>Manage Missing Games</h3>
					<button type="button" class="modal-close-btn" aria-label="Close">×</button>
				</div>
				<div class="modal-body">
					${managementHtml}
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary modal-close-btn">Cancel</button>
					<button type="button" class="btn btn-primary tournament-missing-games-apply-all-btn">Apply All Changes</button>
				</div>
			</div>
		`;

		document.body.appendChild(modal);
		const activeTournament = getActiveTournament();
		const activeStatus = String(activeTournament?.status || '')
			.trim()
			.toLowerCase();
		const persistActive =
			activeStatus === 'active' || activeStatus === 'paused';
		const globalTargetMode = normalizeTournamentModeValue(
			byId('tournamentTargetMode')?.value,
			'any',
		);
		const applyMissingRoundAction = (round, action, replacementId = '') => {
			const availableGameIds = getAvailableTournamentGameIds();
			if (action === 'remove-all') {
				return updateTournamentRoundHiddenInput(container, round, (currentIds) =>
					currentIds.filter((id) =>
						availableGameIds.has(String(id || '').trim()),
					),
				);
			}
			if (action === 'replace-all') {
				const safeReplacementId = String(replacementId || '').trim();
				if (!safeReplacementId) return null;
				return updateTournamentRoundHiddenInput(container, round, (currentIds) =>
					currentIds.map((id) =>
						availableGameIds.has(String(id || '').trim())
							? id
							: safeReplacementId,
					),
				);
			}
			return null;
		};
		const updateModalRoundActionState = (round) => {
			const actionSelect = modal.querySelector(
				`.tournament-missing-action-select[data-tournament-round="${round}"]`,
			);
			const replacementDiv = modal.querySelector(
				`.tournament-missing-action-replacement[data-tournament-round="${round}"]`,
			);
			const replacementSelect = modal.querySelector(
				`.tournament-missing-replacement-select[data-tournament-round="${round}"]`,
			);
			const applyBtn = modal.querySelector(
				`.tournament-missing-action-apply-btn[data-tournament-round="${round}"]`,
			);
			const action = String(actionSelect?.value || '').trim();
			const replacementId = String(replacementSelect?.value || '').trim();
			if (replacementDiv) {
				replacementDiv.style.display =
					action === 'replace-all' ? 'block' : 'none';
			}
			if (applyBtn) {
				applyBtn.disabled =
					!action || (action === 'replace-all' && !replacementId);
			}
		};

		// Bind handlers
		modal
			.querySelectorAll('.tournament-missing-action-select')
			.forEach((select) => {
				select.addEventListener('change', function () {
					updateModalRoundActionState(
						Number(this.dataset.tournamentRound || 0),
					);
				});
			});
		modal
			.querySelectorAll('.tournament-missing-replacement-select')
			.forEach((select) => {
				select.addEventListener('change', function () {
					updateModalRoundActionState(
						Number(this.dataset.tournamentRound || 0),
					);
				});
			});

		// Close modal
		const closeButtons = modal.querySelectorAll('.modal-close-btn');
		closeButtons.forEach((btn) => {
			btn.addEventListener('click', () => {
				modal.remove();
			});
		});

		// Apply individual round changes
		modal
			.querySelectorAll('.tournament-missing-action-apply-btn')
			.forEach((btn) => {
				btn.addEventListener('click', function () {
					const round = Number(this.dataset.tournamentRound);
					const actionSelect = modal.querySelector(
						`.tournament-missing-action-select[data-tournament-round="${round}"]`,
					);
					const action = String(actionSelect?.value || '').trim();
					let replacementId = '';
					if (action === 'replace-all') {
						const replacementSelect = modal.querySelector(
							`.tournament-missing-replacement-select[data-tournament-round="${round}"]`,
						);
						replacementId = String(replacementSelect?.value || '').trim();
						if (!replacementId) {
							showToast('Choose a replacement game first.', 'warning');
							return;
						}
					}
					const updated = applyMissingRoundAction(
						round,
						action,
						replacementId,
					);
					if (!updated) return;
					applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
						globalTargetMode,
						persistActive,
						persistWorkingState: !persistActive,
					});
					showToast(`Round ${round} updated successfully.`, 'success');
				});
			});

		// Apply all changes
		const applyAllBtn = modal.querySelector(
			'.tournament-missing-games-apply-all-btn',
		);
		if (applyAllBtn) {
			applyAllBtn.addEventListener('click', function () {
				const actions = [];
				modal
					.querySelectorAll('.tournament-missing-action-select')
					.forEach((select) => {
						if (select.value) {
							const replacement =
								select.value === 'replace-all'
									? String(
											modal.querySelector(
												`.tournament-missing-replacement-select[data-tournament-round="${select.dataset.tournamentRound}"]`,
											)?.value || '',
										).trim()
									: '';
							actions.push({
								round: Number(select.dataset.tournamentRound),
								action: select.value,
								replacement,
							});
						}
					});
				const invalidReplacement = actions.find(
					(item) => item.action === 'replace-all' && !item.replacement,
				);
				if (invalidReplacement) {
					showToast(
						`Choose a replacement game for round ${invalidReplacement.round} first.`,
						'warning',
					);
					return;
				}

				// Apply all actions
				actions.forEach((item) => {
					applyMissingRoundAction(
						item.round,
						item.action,
						item.replacement,
					);
				});

				applyTournamentRoundAssignmentsChange(activeTournament, rounds, {
					globalTargetMode,
					persistActive,
					persistWorkingState: !persistActive,
				});
				modal.remove();
				showToast('All missing games resolved successfully.', 'success');
			});
		}
	}

	function applyRecommendedTournamentSetup() {
		const format = String(
			byId('tournamentFormat')?.value || 'elimination',
		).trim();
		const participants = parseIntInRange(
			byId('tournamentMaxParticipants')?.value,
			16,
			2,
			512,
		);
		const recommendedRounds = estimateRecommendedRounds(format, participants);
		if (byId('tournamentRounds')) {
			byId('tournamentRounds').value = String(recommendedRounds);
		}
		const collected = collectTournamentRoundAssignments(recommendedRounds, {
			includeAllRounds: true,
		});
		setTournamentRoundDraft(
			collected,
			byId('tournamentTargetMode')?.value,
			{ persistWorkingState: true },
		);
		renderTournamentRecommendations();
		renderTournamentRoundAssignments();
		showToast('Applied recommended tournament setup', 'success');
	}

	function bindTournamentPlannerControls() {
		const controlIds = getTournamentPlannerControlIds();
		controlIds.forEach((id) => {
			const field = byId(id);
			if (!field || field.dataset.bound === 'true') return;
			field.dataset.bound = 'true';

			const handler = () => {
				const configuredRounds = parseIntInRange(
					byId('tournamentRounds')?.value,
					4,
					1,
					25,
				);
				const collected = collectTournamentRoundAssignments(configuredRounds, {
					includeAllRounds: true,
				});
				setTournamentRoundDraft(
					collected,
					byId('tournamentTargetMode')?.value,
					{ persistWorkingState: true },
				);
				renderTournamentRecommendations();
				renderTournamentRoundAssignments();
			};
			field.addEventListener('change', handler);
			field.addEventListener('input', handler);
		});
		const tournamentNameField = byId('tournamentName');
		if (
			tournamentNameField &&
			tournamentNameField.dataset.plannerNameBound !== 'true'
		) {
			tournamentNameField.dataset.plannerNameBound = 'true';
			const persistName = () => {
				if (state.tournamentPlannerHistoryMode === true || getActiveTournament()) {
					return;
				}
				saveTournamentPlannerWorkingState();
			};
			tournamentNameField.addEventListener('input', persistName);
			tournamentNameField.addEventListener('change', persistName);
		}
		const applyBtn = byId('applyTournamentRecommendationBtn');
		if (applyBtn && applyBtn.dataset.bound !== 'true') {
			applyBtn.dataset.bound = 'true';
			applyBtn.addEventListener('click', applyRecommendedTournamentSetup);
		}
		const saveBtn = byId('saveTournamentPlannerBtn');
		if (saveBtn && saveBtn.dataset.bound !== 'true') {
			saveBtn.dataset.bound = 'true';
			saveBtn.addEventListener('click', saveTournamentPlannerDraft);
		}
		bindTournamentSyncEvents();
		initTournamentStudioTabs();
	}

	function formatTournamentDate(value) {
		const date = value ? new Date(value) : null;
		if (!date || Number.isNaN(date.getTime())) return '-';
		return date.toLocaleString();
	}

	function getTournamentLeaderboard(activeTournament, options = {}) {
		if (!activeTournament || !activeTournament.id) return [];
		const includeZero = Boolean(options.includeZero);
		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}

		const tournamentId = String(activeTournament.id);
		const participantIds = new Set(
			(Array.isArray(activeTournament.participants)
				? activeTournament.participants
				: []
			)
				.map((entry) => String(entry?.userId || entry?.id || '').trim())
				.filter(Boolean),
		);
		const entries = users
			.filter(
				(user) =>
					String(user?.role || '').toLowerCase() === 'student' &&
					(!participantIds.size ||
						participantIds.has(String(user?.id || '').trim())),
			)
			.map((user) => {
				const scoreMap =
					user?.tournamentScores && typeof user.tournamentScores === 'object'
						? user.tournamentScores
						: {};
				const points = Number(scoreMap[tournamentId]) || 0;
				return {
					id: user.id || '',
					name:
						user.name ||
						user.fullName ||
						user.username ||
						user.studentName ||
						'Student',
					className: user.className || user.class || '',
					points,
					exp: Number(user.exp) || 0,
				};
			})
			.filter((entry) => includeZero || entry.points > 0)
			.sort(
				(a, b) =>
					b.points - a.points ||
					b.exp - a.exp ||
					String(a.name).localeCompare(String(b.name)),
			)
			.map((entry, index) => ({
				...entry,
				rank: index + 1,
			}));

		return entries;
	}

	function buildTournamentGamesLookup() {
		const lookup = new Map();
		const games = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
		(Array.isArray(games) ? games : []).forEach((game) => {
			if (!game?.id) return;
			lookup.set(String(game.id), game);
		});
		return lookup;
	}

	function getTournamentManagedAudienceTarget(game) {
		if (!isTournamentManagedGame(game)) return 0;
		return getAdminLobbyExpectedPlayers(game);
	}

	function getTournamentRoundGameSummaries(roundData, gamesLookup) {
		const detailedGames = Array.isArray(roundData?.gameDetails)
			? roundData.gameDetails
			: [];
		const gameIds = Array.isArray(roundData?.gameIds) ? roundData.gameIds : [];
		const source = detailedGames.length
			? detailedGames
			: gameIds.map((id) => ({ id }));
		return source
			.map((entry) => {
				const templateGameId = String(
					entry?.sourceGameId || entry?.id || '',
				).trim();
				const instanceId = String(
					entry?.instanceId || entry?.gameInstanceId || '',
				).trim();
				const gameId = instanceId || templateGameId;
				const liveGame = gameId ? gamesLookup.get(gameId) : null;
				if (!liveGame) {
					const isPendingTournamentCopy = Boolean(instanceId);
					return {
						id: gameId,
						templateId: templateGameId,
						name: entry?.name || 'Removed Game',
						type: entry?.type || 'race',
						mode: entry?.mode || 'solo',
						status: isPendingTournamentCopy ? 'open' : 'removed',
						session: {},
						participantCount: 0,
						expectedPlayers: 0,
						readyCount: 0,
						lobbyLabel: isPendingTournamentCopy
							? 'Syncing lobby'
							: 'Fresh lobby',
						minPlayersNeeded: 1,
						watchable: false,
						isTournamentManaged: Boolean(instanceId),
						pendingSync: isPendingTournamentCopy,
						missing: !isPendingTournamentCopy,
					};
				}
				const rawStatus = String(
					liveGame.status || entry?.status || 'pending',
				).toLowerCase();
				const status = rawStatus === 'draft' ? 'open' : rawStatus;
				const session = liveGame.session || {};
				const participants = Array.isArray(session?.participants)
					? session.participants
					: [];
				const readyCount = participants.filter(
					(participant) => participant?.ready,
				).length;
				const normalizedType = String(
					liveGame.type || entry?.type || 'race',
				).toLowerCase();
				const requiresTwoPlayers =
					normalizedType === 'cards' ||
					normalizedType === 'cards-draw' ||
					normalizedType === 'sprint-race' ||
					normalizedType === 'hot-potato' ||
					normalizedType === 'last-survivor';
				const expectedPlayers = getAdminLobbyExpectedPlayers(liveGame);
				return {
					id: gameId,
					templateId: templateGameId,
					name: liveGame.name || entry?.name || 'Untitled Game',
					type: liveGame.type || entry?.type || 'race',
					mode: liveGame.mode || entry?.mode || 'solo',
					status,
					session,
					participantCount: participants.length,
					expectedPlayers,
					readyCount,
					lobbyLabel:
						String(session?.lobbyLabel || 'Fresh lobby').trim() ||
						'Fresh lobby',
					minPlayersNeeded: Math.max(
						expectedPlayers || 0,
						requiresTwoPlayers || isTournamentManagedGame(liveGame) ? 2 : 1,
					),
					watchable:
						status === 'live' ||
						status === 'completed' ||
						participants.length > 0 ||
						(Array.isArray(liveGame.lobbyHistory) &&
							liveGame.lobbyHistory.length > 0),
					isTournamentManaged: isTournamentManagedGame(liveGame),
					missing: false,
				};
			})
			.filter((entry) => entry.id);
	}

	function getTournamentParticipantRoundStatus(
		participant,
		roundGames,
		roundState,
	) {
		const participantId = String(
			participant?.userId || participant?.id || '',
		).trim();
		if (!participantId) {
			return { label: 'Unknown', tone: 'muted', detail: '' };
		}
		if (!roundGames.length) {
			return {
				label: 'Waiting',
				tone: 'muted',
				detail: 'No round games assigned yet.',
			};
		}

		for (const game of roundGames) {
			const participants = Array.isArray(game?.session?.participants)
				? game.session.participants
				: [];
			const joinedGame = participants.find(
				(entry) =>
					String(entry?.userId || '')
						.trim()
						.toLowerCase() === participantId.toLowerCase(),
			);
			const participantState = String(joinedGame?.state || '').toLowerCase();
			if (participantState === 'forfeited') {
				return {
					label: 'Forfeited',
					tone: 'danger',
					detail: `${game.name} counted as a loss.`,
				};
			}
			if (participantState === 'eliminated') {
				return {
					label: 'Eliminated',
					tone: 'warning',
					detail: `${game.name} removed this player from contention.`,
				};
			}
			if (game.status === 'live' && joinedGame) {
				return {
					label: 'Playing',
					tone: 'live',
					detail: `Currently live in ${game.name}.`,
				};
			}
			if (game.status === 'open' && joinedGame) {
				return {
					label: 'In Lobby',
					tone: 'waiting',
					detail: `Joined ${game.name} and waiting to start.`,
				};
			}
			if (game.status === 'completed' && joinedGame) {
				return {
					label: 'Finished',
					tone: 'done',
					detail: `${game.name} is completed.`,
				};
			}
		}

		if (String(roundState || '').toLowerCase() === 'completed') {
			return {
				label: 'Round Closed',
				tone: 'muted',
				detail: 'This round is already completed.',
			};
		}

		return {
			label: 'Not Joined',
			tone: 'warning',
			detail: 'Has not entered a game in the active round.',
		};
	}

	function renderTournamentPanels(activeTournament = getActiveTournament()) {
		const metaEl = byId('tournamentDashboardStatus');
		const lifecycleSummaryEl = byId('tournamentLifecycleSummary');
		const lifecycleStateEl = byId('tournamentLifecycleState');
		const lifecycleNextActionEl = byId('tournamentLifecycleNextAction');
		const lifecyclePrimaryBtn = byId('tournamentLifecyclePrimaryBtn');
		const sidebarEl = byId('tournamentSidebarInfo');
		const leaderboardEl = byId('tournamentLeaderboardList');
		const historyEl = byId('tournamentHistoryList');
		const participantsEl = byId('tournamentParticipantsList');
		const roundGamesEl = byId('roundGamesList');
		const roundLabelEl = byId('currentRoundLabel');
		const roundNumberEl = byId('currentRoundNumber');
		const roundSuffixEl = byId('currentRoundSuffix');
		const progressPercentageEl = byId('roundCompletionPercentage');
		const progressBarEl = byId('tournamentRoundProgressBar');

		const startBtn = byId('startTournamentBtn');
		const endBtn = byId('endTournamentBtn');
		const pauseBtn = byId('pauseTournamentBtn');
		const resumeBtn = byId('resumeTournamentBtn');
		const advanceBtn = byId('advanceRoundBtn');

		const hasActiveTournament = Boolean(activeTournament);
		const plannerDraft =
			state.tournamentPlannerHistoryMode === true
				? null
				: getTournamentPlannerDraft();
		const hasPlannerDraft = Boolean(plannerDraft);
		const leaderboard = hasActiveTournament
			? getTournamentLeaderboard(activeTournament, { includeZero: false })
			: [];
		const gamesLookup = buildTournamentGamesLookup();
		const currentRoundNumber = Math.max(
			Number(activeTournament?.currentRound) || 1,
			1,
		);
		const totalRounds = Math.max(
			parseIntInRange(activeTournament?.rounds, 1, 1, 25),
			1,
		);
		const isPaused =
			String(activeTournament?.status || '').toLowerCase() === 'paused';
		const currentRoundData =
			activeTournament?.roundAssignments?.[currentRoundNumber - 1];
		const currentRoundGames = currentRoundData
			? getTournamentRoundGameSummaries(currentRoundData, gamesLookup)
			: [];
		const activeCurrentRoundGames = currentRoundGames.filter(
			(game) => game.missing !== true,
		);
		const completedCount = activeCurrentRoundGames.filter(
			(game) => game.status === 'completed',
		).length;
		const liveCount = activeCurrentRoundGames.filter(
			(game) => game.status === 'live',
		).length;
		const totalCount = activeCurrentRoundGames.length;
		const isFinalRoundComplete =
			hasActiveTournament &&
			currentRoundNumber >= totalRounds &&
			totalCount > 0 &&
			completedCount === totalCount;
		let lifecycleState = hasPlannerDraft ? 'Draft ready' : 'No active event';
		let lifecycleNextAction = hasPlannerDraft
			? 'A saved planner draft is ready to launch.'
			: 'Open Planner to create the setup.';
		let lifecyclePrimaryAction = hasPlannerDraft ? 'start' : 'planner';
		let lifecyclePrimaryLabel = hasPlannerDraft
			? 'Start Tournament'
			: 'Open Planner';
		let lifecyclePrimaryGameId = '';

		if (metaEl) {
			metaEl.innerHTML = hasActiveTournament
				? isPaused
					? 'Paused'
					: 'Active'
				: 'Inactive';
			metaEl.className = hasActiveTournament
				? `tournament-status-chip ${isPaused ? 'is-warning' : 'is-active'}`
				: 'tournament-status-chip is-inactive';
		}

		if (startBtn) {
			startBtn.disabled = hasActiveTournament;
			startBtn.title = hasActiveTournament
				? 'End the current tournament before starting a new one.'
				: 'Start the planned tournament.';
		}
		if (endBtn) {
			endBtn.disabled = !hasActiveTournament;
			endBtn.title = hasActiveTournament
				? 'End the current tournament and archive standings.'
				: 'No tournament is currently active.';
		}
		if (pauseBtn) {
			pauseBtn.style.display =
				hasActiveTournament && !isPaused ? 'inline-block' : 'none';
			pauseBtn.disabled = !hasActiveTournament || isPaused;
		}
		if (resumeBtn) {
			resumeBtn.style.display =
				hasActiveTournament && isPaused ? 'inline-block' : 'none';
			resumeBtn.disabled = !hasActiveTournament || !isPaused;
		}
		if (advanceBtn) {
			advanceBtn.style.display = hasActiveTournament ? 'inline-block' : 'none';
			advanceBtn.disabled = !hasActiveTournament;
			advanceBtn.textContent =
				hasActiveTournament && currentRoundNumber >= totalRounds
					? 'Finish Tournament'
					: 'Advance to Next Round';
			advanceBtn.title =
				hasActiveTournament && currentRoundNumber >= totalRounds
					? 'Finish the final round and archive the tournament.'
					: 'Move the tournament to the next round.';
		}

		if (lifecycleSummaryEl) {
			if (!hasActiveTournament) {
				lifecycleSummaryEl.textContent = hasPlannerDraft
					? 'A saved tournament draft is ready to go.'
					: 'No tournament is live right now.';
			} else if (isPaused) {
				lifecycleSummaryEl.textContent = `Play is paused in round ${currentRoundNumber}.`;
			} else if (!totalCount) {
				lifecycleSummaryEl.textContent =
					'This round needs playable games before it can continue.';
			} else if (liveCount > 0) {
				lifecycleSummaryEl.textContent = `${liveCount} live match${
					liveCount === 1 ? '' : 'es'
				} running right now.`;
			} else if (isFinalRoundComplete) {
				lifecycleSummaryEl.textContent = 'The final round is complete.';
			} else if (completedCount === totalCount) {
				lifecycleSummaryEl.textContent = `Round ${currentRoundNumber} is complete.`;
			} else {
				lifecycleSummaryEl.textContent = `Round ${currentRoundNumber} is in progress.`;
			}
		}
		if (hasActiveTournament) {
			if (isPaused) {
				lifecycleState = 'Paused';
				lifecycleNextAction = `Resume the tournament when students are ready to continue round ${currentRoundNumber}/${totalRounds}.`;
				lifecyclePrimaryAction = 'resume';
				lifecyclePrimaryLabel = 'Resume Tournament';
			} else if (!totalCount) {
				lifecycleState = 'Needs games';
				lifecycleNextAction =
					'Open Planner to replace or assign the games for this round.';
				lifecyclePrimaryAction = 'planner';
				lifecyclePrimaryLabel = 'Open Planner';
			} else if (liveCount > 0) {
				const liveGame = activeCurrentRoundGames.find(
					(game) => game.status === 'live',
				);
				lifecycleState = 'Matches live';
				lifecycleNextAction = `${liveCount} live match${
					liveCount === 1 ? '' : 'es'
				} are running in round ${currentRoundNumber}.`;
				lifecyclePrimaryAction = liveGame ? 'watch' : 'monitor';
				lifecyclePrimaryLabel = liveGame
					? 'Watch Live Match'
					: 'Open Round Monitor';
				lifecyclePrimaryGameId = liveGame?.id ? String(liveGame.id).trim() : '';
			} else if (isFinalRoundComplete) {
				lifecycleState = 'Ready to finish';
				lifecycleNextAction =
					'Finish the tournament to archive the final standings.';
				lifecyclePrimaryAction = 'finish';
				lifecyclePrimaryLabel = 'Finish Tournament';
			} else if (completedCount === totalCount) {
				lifecycleState = 'Round complete';
				lifecycleNextAction = `Advance when you are ready to unlock round ${Math.min(
					currentRoundNumber + 1,
					totalRounds,
				)}.`;
				lifecyclePrimaryAction = 'advance';
				lifecyclePrimaryLabel = 'Advance Round';
			} else {
				lifecycleState = 'Ready to run';
				lifecycleNextAction =
					'Open the round monitor to start matches or follow round progress.';
				lifecyclePrimaryAction = 'monitor';
				lifecyclePrimaryLabel = 'Open Round Monitor';
			}
		}
		if (lifecycleStateEl) lifecycleStateEl.textContent = lifecycleState;
		if (lifecycleNextActionEl)
			lifecycleNextActionEl.textContent = lifecycleNextAction;
		if (lifecyclePrimaryBtn) {
			lifecyclePrimaryBtn.textContent = lifecyclePrimaryLabel;
			lifecyclePrimaryBtn.dataset.action = lifecyclePrimaryAction;
			lifecyclePrimaryBtn.dataset.gameId = lifecyclePrimaryGameId;
			lifecyclePrimaryBtn.disabled =
				lifecyclePrimaryAction === 'watch' && !lifecyclePrimaryGameId;
		}

		if (sidebarEl) {
			if (hasActiveTournament) {
				sidebarEl.innerHTML = `
					<div class="sidebar-info-grid">
						<div class="info-item">
							<small>Mode</small>
							<div>${escapeHtml(getTournamentModeLabel(activeTournament.targetMode))}</div>
						</div>
						<div class="info-item">
							<small>Format</small>
							<div>${escapeHtml(getTournamentFormatLabel(activeTournament.format))}</div>
						</div>
						<div class="info-item">
							<small>Status</small>
							<div>${escapeHtml(isPaused ? 'Paused' : 'Active')}</div>
						</div>
						<div class="info-item">
							<small>Structure</small>
							<div>${totalRounds} Round(s)</div>
						</div>
						<div class="info-item">
							<small>Multiplier</small>
							<div>x${activeTournament.pointMultiplier || 1} Points</div>
						</div>
						<div class="info-item">
							<small>Current Round</small>
							<div>${currentRoundNumber}/${totalRounds}</div>
						</div>
						<div class="info-item full">
							<small>Started At</small>
							<div>${formatTournamentDate(
								activeTournament.startedAt || activeTournament.createdAt,
							)}</div>
						</div>
					</div>
				`;
			} else {
				sidebarEl.innerHTML =
					'<div class="empty-state-small">No active tournament.</div>';
			}
		}

		if (roundLabelEl) {
			roundLabelEl.textContent = hasActiveTournament
				? 'Round'
				: 'No tournament';
		}
		if (roundNumberEl) {
			roundNumberEl.textContent = hasActiveTournament
				? String(currentRoundNumber)
				: '';
		}
		if (roundSuffixEl) {
			roundSuffixEl.textContent = hasActiveTournament ? 'Progress' : '';
		}

		if (roundGamesEl) {
			if (!hasActiveTournament) {
				roundGamesEl.innerHTML = `<div class="tournament-round-empty-panel">
						<div class="tournament-round-empty-eyebrow">Tournament Studio</div>
						<div class="tournament-round-empty-title">No tournament</div>
						<div class="tournament-round-empty-copy">Create or start a tournament to see the live round schedule here.</div>
					</div>`;
				if (progressPercentageEl)
					progressPercentageEl.textContent = 'No tournament';
				if (progressBarEl) progressBarEl.style.width = '0%';
			} else if (!currentRoundData) {
				roundGamesEl.innerHTML = `<div class="tournament-round-empty-panel is-warning">
						<div class="tournament-round-empty-eyebrow">Round Monitor</div>
						<div class="tournament-round-empty-title">Round data not found</div>
						<div class="tournament-round-empty-copy">This tournament is active, but the current round schedule could not be loaded.</div>
					</div>`;
				if (progressPercentageEl)
					progressPercentageEl.textContent = 'Round unavailable';
				if (progressBarEl) progressBarEl.style.width = '0%';
			} else {
				const percent =
					totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

				if (progressPercentageEl) {
					progressPercentageEl.textContent = `${percent}% Complete${
						liveCount ? ` | ${liveCount} live` : ''
					}`;
				}
				if (progressBarEl) progressBarEl.style.width = `${percent}%`;

				roundGamesEl.innerHTML =
					currentRoundGames
						.map((game) => {
							const isCompleted = game.status === 'completed';
							const isLive = game.status === 'live';
							const isMissing =
								game.missing === true || game.status === 'removed';
							const isPendingSync = game.pendingSync === true;
							const isPausedPendingStart =
								isPaused && !isCompleted && !isLive && !isMissing;
							const canOpenLobby =
								!isPausedPendingStart &&
								!isCompleted &&
								!isLive &&
								!isMissing &&
								!isPendingSync;
							const requiredPlayers = Math.max(
								game.minPlayersNeeded || 1,
								1,
							);
							const readinessBase = Math.max(
								Number(game.expectedPlayers) || 0,
								game.participantCount || 0,
								requiredPlayers,
							);
							const readyToLaunch =
								(game.readyCount || 0) >= readinessBase;
							const canStartMatch =
								canOpenLobby &&
								game.participantCount >= requiredPlayers &&
								readyToLaunch;
							const participantLabel = game.expectedPlayers
								? `${game.participantCount}/${game.expectedPlayers} joined`
								: `${game.participantCount} joined`;
							const readinessLabel = `${game.readyCount || 0}/${readinessBase} ready`;
							const stateLabel = isMissing
								? 'Unavailable'
								: isPendingSync
									? 'Syncing'
									: isCompleted
										? 'Completed'
										: isLive
											? 'Live now'
											: isPausedPendingStart
												? 'Paused'
												: canStartMatch
													? 'Ready to start'
													: 'Waiting for players';
							const stateTone = isMissing
								? 'removed'
								: isPendingSync
									? 'waiting'
									: isCompleted
										? 'completed'
										: isLive
											? 'live'
											: isPausedPendingStart
												? 'paused'
												: canStartMatch
													? 'ready'
													: 'waiting';
							const detailCopy = isMissing
								? 'This round slot still points to a removed template and needs a replacement.'
								: isPendingSync
									? 'The fresh tournament lobby is still syncing to this device. It will appear here automatically.'
									: isCompleted
										? 'This tournament copy is finished. Review the result without affecting the original template.'
										: isLive
											? 'This tournament copy is live right now. All participant actions should appear here in real time.'
											: isPausedPendingStart
												? 'The tournament is paused before this match starts.'
												: canStartMatch
													? 'Lobby is ready. Start this tournament-only copy when everyone is prepared.'
													: `This fresh tournament lobby needs ${Math.max(readinessBase - (game.participantCount || 0), 0)} more joined player(s) and ${Math.max(readinessBase - (game.readyCount || 0), 0)} more ready signal(s) before the match can start.`;
							const primaryActionLabel = isMissing
								? 'Unavailable'
								: isCompleted
									? 'Review Match'
									: isLive
										? 'Watch Live'
										: isPausedPendingStart
											? 'Tournament Paused'
											: 'Start Match';
							return `
								<div class="round-game-card ${[
									isCompleted ? 'completed' : '',
									isLive ? 'live' : '',
									isMissing ? 'removed' : '',
								]
									.filter(Boolean)
									.join(' ')}">
									<div class="round-game-card-top">
										<div>
											<div class="game-card-name">${escapeHtml(game.name)}</div>
											<div class="round-game-subtitle">${escapeHtml(
												game.isTournamentManaged
													? 'Fresh tournament-only copy of the selected template'
													: 'Shared tournament game',
											)}</div>
										</div>
										<span class="round-game-state-pill is-${escapeHtml(
											stateTone,
										)}">${escapeHtml(stateLabel)}</span>
									</div>
									<div class="game-card-header">
										<span class="game-type-badge">${escapeHtml(getGameTypeLabel(game.type))}</span>
										<span class="game-mode-badge">${escapeHtml(
											game.mode === 'team' ? 'Team vs Team' : '1 vs 1',
										)}</span>
										<span class="round-game-lobby-badge">${escapeHtml(
											game.lobbyLabel || 'Fresh lobby',
										)}</span>
									</div>
									<div class="round-game-overview">
										<div class="round-game-stat">
											<span>Joined</span>
											<strong>${escapeHtml(participantLabel)}</strong>
										</div>
										<div class="round-game-stat">
											<span>Ready</span>
											<strong>${escapeHtml(readinessLabel)}</strong>
										</div>
										<div class="round-game-stat">
											<span>Flow</span>
											<strong>${escapeHtml(
												game.isTournamentManaged ? 'Fresh copy' : 'Shared',
											)}</strong>
										</div>
									</div>
									<div class="game-card-status">${escapeHtml(detailCopy)}</div>
									<div class="round-game-actions">
										${
											canOpenLobby
												? `<button class="btn btn-sm btn-secondary-soft" onclick="openGameLobby('${escapeHtml(
														game.id,
													)}')">Open Lobby</button>`
												: ''
										}
										<button class="btn btn-sm btn-primary-soft round-game-action" ${
											isMissing ||
											isPausedPendingStart ||
											(!isLive && !isCompleted && !canStartMatch)
												? 'disabled'
												: ''
										} onclick="${
											isLive || isCompleted
												? `openAdminGameWatch('${escapeHtml(game.id)}')`
												: canStartMatch
													? `startGameSession('${escapeHtml(game.id)}')`
													: 'return false'
										}">
											${escapeHtml(primaryActionLabel)}
										</button>
									</div>
								</div>
							`;
						})
						.join('') ||
					'<div class="empty-state-small">No games assigned to this round.</div>';
			}
		}

		if (participantsEl) {
			const participants = Array.isArray(activeTournament?.participants)
				? activeTournament.participants
				: [];
			if (!hasActiveTournament) {
				participantsEl.innerHTML =
					'<div class="empty-state-small">Start a tournament to monitor participant status.</div>';
			} else if (!participants.length) {
				participantsEl.innerHTML =
					'<div class="empty-state-small">No participants joined yet.</div>';
			} else {
				const leaderboardByUser = new Map(
					leaderboard.map((entry) => [String(entry?.id || '').trim(), entry]),
				);
				participantsEl.innerHTML = participants
					.map((p) => {
						const participantId = String(p?.userId || p?.id || '').trim();
						const status = getTournamentParticipantRoundStatus(
							p,
							currentRoundGames,
							currentRoundData?.status,
						);
						const scoreEntry = leaderboardByUser.get(participantId);
						return `
							<div class="participant-row">
								<div>
									<div class="participant-name">${escapeHtml(
										p.name || p.username || 'Student',
									)}</div>
									<div class="participant-meta">${escapeHtml(
										status.detail ||
											`${Number(scoreEntry?.points) || 0} pts total`,
									)}</div>
								</div>
								<div class="participant-status ${escapeHtml(
									status.tone,
								)}">${escapeHtml(status.label)}</div>
							</div>
						`;
					})
					.join('');
			}
		}

		if (leaderboardEl) {
			if (!hasActiveTournament) {
				leaderboardEl.innerHTML =
					'<div class="empty-state-small">Start a tournament to see standings.</div>';
			} else if (!leaderboard.length) {
				leaderboardEl.innerHTML =
					'<div class="empty-state-small">No scores yet. Standings update as games complete.</div>';
			} else {
				leaderboardEl.innerHTML = leaderboard
					.slice(0, 50)
					.map(
						(entry) => `
						<div class="gamification-leaderboard-row ${entry.rank === 1 ? 'top' : ''}">
							<div class="gamification-leaderboard-rank">#${entry.rank}</div>
							<div class="gamification-leaderboard-player">
								<div>${escapeHtml(entry.name)}</div>
								${entry.className ? `<small>${escapeHtml(entry.className)}</small>` : ''}
							</div>
							<div class="gamification-leaderboard-score">${escapeHtml(
								String(entry.points),
							)} pts</div>
						</div>
					`,
					)
					.join('');
			}
		}

		if (historyEl) {
			const history = getTournamentHistory()
				.slice()
				.sort((a, b) =>
					String(b.endedAt || b.startedAt || '').localeCompare(
						String(a.endedAt || a.startedAt || ''),
					),
				)
				.slice(0, 20);
			if (!history.length) {
				historyEl.innerHTML =
					'<div class="empty-state-small">No tournaments recorded yet.</div>';
			} else {
				historyEl.innerHTML = history
					.map((entry) => {
						const winnerName =
							entry.winnerName ||
							entry.finalStandings?.[0]?.name ||
							'No winner';
						const winnerPoints = Number(
							entry.winnerPoints || entry.finalStandings?.[0]?.points || 0,
						);
						return `
							<div class="gamification-history-row">
								<div class="gamification-history-title">${escapeHtml(
									entry.name || 'Tournament',
								)}</div>
								<div class="gamification-history-meta">${escapeHtml(
									getTournamentModeLabel(entry.targetMode),
								)} - ${escapeHtml(
									getTournamentFormatLabel(entry.format),
								)} - ${escapeHtml(
									String(parseIntInRange(entry.rounds, 1, 1, 25)),
								)} round(s) - ${escapeHtml(
									entry.status === 'active'
										? 'Active'
										: entry.status === 'completed'
											? 'Completed'
											: 'Paused',
								)} - ${escapeHtml(
									formatTournamentDate(entry.endedAt || entry.startedAt),
								)}</div>
								<div class="gamification-history-winner">Winner: ${escapeHtml(
									winnerName,
								)} (${escapeHtml(String(winnerPoints))} pts)</div>
								<div class="gamification-history-actions">
									<button type="button" class="btn btn-sm btn-secondary-soft" data-tournament-history-action="edit" data-tournament-id="${escapeHtml(entry.id)}">Edit/Copy</button>
									<button type="button" class="btn btn-sm btn-danger-soft" data-tournament-history-action="delete" data-tournament-id="${escapeHtml(entry.id)}">Delete</button>
								</div>
							</div>
						`;
					})
					.join('');
			}
		}
	}

	function handleTournamentLifecycleAction() {
		const button = byId('tournamentLifecyclePrimaryBtn');
		const action = String(button?.dataset?.action || '')
			.trim()
			.toLowerCase();
		const gameId = String(button?.dataset?.gameId || '').trim();
		switch (action) {
			case 'start':
				startTournament();
				return;
			case 'resume':
				resumeTournament();
				return;
			case 'advance':
				advanceTournamentRound();
				return;
			case 'finish':
				stopTournament();
				return;
			case 'watch':
				if (gameId) {
					openAdminGameWatch(gameId);
					return;
				}
				break;
			case 'monitor': {
				const target =
					byId('roundGamesList') ||
					document.querySelector('.tournament-round-progress');
				if (target && typeof target.scrollIntoView === 'function') {
					target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
				return;
			}
			case 'planner':
			default:
				setTournamentStudioTab('planner');
				return;
		}
		setTournamentStudioTab('planner');
	}
	window.handleTournamentLifecycleAction = handleTournamentLifecycleAction;

	function deleteTournament(id) {
		if (
			!confirm('Are you sure you want to delete this tournament from history?')
		)
			return;
		let history = getTournamentHistory();
		const normalizedId = String(id || '').trim();
		history = history.filter(
			(t) => String(t?.id || '').trim() !== normalizedId,
		);
		saveTournamentHistory(history);

		const active = getActiveTournament();
		if (active && String(active?.id || '').trim() === normalizedId) {
			localStorage.removeItem('quizTournamentActive');
		}
		if (state.tournamentPlannerHistoryId === normalizedId) {
			clearTournamentPlannerHistoryMode();
		}

		syncGamificationState();
		loadGamificationUI();
		showToast('Tournament deleted', 'success');
	}

	function editTournament(id) {
		const history = getTournamentHistory();
		const normalizedId = String(id || '').trim();
		const target = history.find(
			(t) => String(t?.id || '').trim() === normalizedId,
		);
		if (!target) return;

		state.tournamentPlannerHistoryMode = true;
		state.tournamentPlannerHistoryId = normalizedId;
		setTournamentStudioTab('planner');
		applyTournamentConfigToForm(target, { keepName: false });
		setTournamentRoundDraft(target.roundAssignments, target.targetMode || 'any', {
			persistWorkingState: false,
		});
		renderTournamentRoundAssignments(target, {
			useDomDraft: false,
			forceUnlocked: true,
		});
		setTournamentPlannerFormLocked(Boolean(getActiveTournament()));
		showToast(
			getActiveTournament()
				? 'Tournament copy loaded into planner. The current live tournament still stays active.'
				: 'Tournament configuration loaded into planner.',
			'info',
		);
	}

	function pauseTournament() {
		const active = getActiveTournament();
		if (!active || active.status !== 'active') return;
		active.status = 'paused';
		active.pausedAt = new Date().toISOString();
		localStorage.setItem('quizTournamentActive', JSON.stringify(active));
		syncGamificationState();
		renderTournamentPanels(active);
		showToast('Tournament paused', 'info');
	}

	function resumeTournament() {
		const active = getActiveTournament();
		if (!active || active.status !== 'paused') return;
		active.status = 'active';
		active.pausedAt = null;
		localStorage.setItem('quizTournamentActive', JSON.stringify(active));
		syncGamificationState();
		renderTournamentPanels(active);
		showToast('Tournament resumed', 'success');
	}

	function advanceTournamentRound() {
		const active = getActiveTournament();
		if (!active || active.status === 'completed') return;

		const totalRounds = parseIntInRange(active.rounds, 1, 1, 25);
		const currentRound = active.currentRound || 1;

		if (currentRound >= totalRounds) {
			if (confirm('This is the final round. End tournament?')) {
				stopTournament();
			}
			return;
		}

		if (
			!confirm(
				`Advance from Round ${currentRound} to Round ${currentRound + 1}?`,
			)
		)
			return;

		active.currentRound = currentRound + 1;

		// Update round statuses in assignments
		if (Array.isArray(active.roundAssignments)) {
			active.roundAssignments.forEach((round, idx) => {
				if (idx < active.currentRound - 1) round.status = 'completed';
				else if (idx === active.currentRound - 1) round.status = 'active';
				else round.status = 'pending';
			});
		}

		localStorage.setItem('quizTournamentActive', JSON.stringify(active));
		syncGamificationState();
		renderTournamentPanels(active);
		showToast(`Advanced to Round ${active.currentRound}`, 'success');
	}

	function syncGamificationState(configOverride = null) {
		if (typeof window.syncGamificationSettings !== 'function') return;
		window.syncGamificationSettings(configOverride);
		const syncedAt = new Date().toISOString();
		localStorage.setItem('quizGamificationSyncedAt', syncedAt);
		updateTournamentSyncStatus({ lastSyncAt: syncedAt });
	}

	function loadGamificationUI() {
		bindTournamentHistoryActions();
		const config = getGamificationConfig();
		if (byId('expPerCorrect'))
			byId('expPerCorrect').value = config.expPerCorrect;
		if (byId('expPerWin')) byId('expPerWin').value = config.expPerWin;
		if (byId('autoAwardBadges'))
			byId('autoAwardBadges').checked = config.autoAwardBadges;
		bindTournamentPlannerControls();
		initTournamentStudioTabs();

		const activeTournament = getActiveTournament();
		const plannerDraft =
			state.tournamentPlannerHistoryMode === true
				? null
				: getTournamentPlannerDraft();
		const workingPlannerState =
			state.tournamentPlannerHistoryMode === true || activeTournament
				? null
				: getTournamentPlannerWorkingState();
		const statusEl = byId('tournamentStatusDisplay');
		const dashboardStatusEl = byId('tournamentDashboardStatus');
		let plannerSource =
			activeTournament || workingPlannerState || plannerDraft || null;

		if (activeTournament && statusEl) {
			const rounds = parseIntInRange(activeTournament.rounds, 1, 1, 25);
			const label = `${activeTournament.name} (${getTournamentModeLabel(activeTournament.targetMode)} | ${rounds} round${rounds === 1 ? '' : 's'})`;
			statusEl.textContent = `Active: ${label}`;
			statusEl.classList.remove('is-inactive');
			statusEl.classList.add('is-active');
		} else if (statusEl) {
			statusEl.textContent = 'Inactive';
			statusEl.classList.remove('is-active');
			statusEl.classList.add('is-inactive');
		}
		if (state.tournamentPlannerHistoryMode !== true) {
			const workingPlannerState = activeTournament
				? null
				: getTournamentPlannerWorkingState();
			if (activeTournament) {
				applyTournamentConfigToForm(activeTournament, { keepName: false });
				setTournamentRoundDraft(
					activeTournament.roundAssignments,
					activeTournament.targetMode || 'any',
					{ persistWorkingState: false },
				);
				plannerSource = activeTournament;
			} else if (workingPlannerState) {
				applyTournamentConfigToForm(workingPlannerState, {
					keepName: false,
				});
				setTournamentRoundDraft(
					workingPlannerState.roundAssignments,
					workingPlannerState.targetMode || 'any',
					{ persistWorkingState: false },
				);
				plannerSource = workingPlannerState;
			} else if (plannerDraft) {
				applyTournamentConfigToForm(plannerDraft, { keepName: false });
				setTournamentRoundDraft(
					plannerDraft.roundAssignments,
					plannerDraft.targetMode || 'any',
					{ persistWorkingState: false },
				);
				plannerSource = plannerDraft;
			} else {
				applyTournamentConfigToForm({}, { keepName: false });
				setTournamentRoundDraft([], 'any', {
					persistWorkingState: false,
				});
			}
		}

		renderTournamentRecommendations();
		renderTournamentRoundAssignments(plannerSource, {
			useDomDraft: false,
			forceUnlocked: state.tournamentPlannerHistoryMode === true,
		});
		setTournamentPlannerFormLocked(Boolean(activeTournament));
		renderTournamentPanels(activeTournament);
		updateTournamentSyncStatus({
			lastSyncAt: localStorage.getItem('quizGamificationSyncedAt') || '',
		});
	}

	function saveGamificationConfig() {
		const expPerCorrect = Math.max(
			parseInt(byId('expPerCorrect')?.value, 10) || 10,
			0,
		);
		const expPerWin = Math.max(
			parseInt(byId('expPerWin')?.value, 10) || 100,
			0,
		);
		const autoAwardBadges = byId('autoAwardBadges')?.checked !== false;

		const config = { expPerCorrect, expPerWin, autoAwardBadges };
		localStorage.setItem('quizGamification', JSON.stringify(config));
		showToast('Gamification settings saved', 'success');
		syncGamificationState(config);
		loadGamificationUI();
	}

	function getActiveTournament() {
		try {
			return JSON.parse(localStorage.getItem('quizTournamentActive') || 'null');
		} catch (e) {
			return null;
		}
	}

	function collectTournamentRoundAssignments(roundCount, options = {}) {
		const assignments = [];
		const includeAllRounds = options?.includeAllRounds === true;
		const requireControls = options?.requireControls === true;
		const globalTargetMode = normalizeTournamentModeValue(
			byId('tournamentTargetMode')?.value,
			'any',
		);
		const safeRounds = Math.max(parseIntInRange(roundCount, 1, 1, 25), 1);
		for (let round = 1; round <= safeRounds; round++) {
			const modeSelect = document.querySelector(
				`.tournament-round-target-mode[data-tournament-round="${round}"]`,
			);
			const hiddenGamesInput = document.querySelector(
				`.tournament-round-games-hidden[data-tournament-round="${round}"]`,
			);
			const gamesSelect = document.querySelector(
				`.tournament-round-games-select[data-tournament-round="${round}"]`,
			);
			if (requireControls && !hiddenGamesInput && !gamesSelect && !modeSelect)
				continue;
			if (!hiddenGamesInput && !gamesSelect && !modeSelect && !includeAllRounds)
				continue;

			const modeOverride = modeSelect
				? normalizeTournamentModeValue(modeSelect.value, '', true)
				: '';
			const targetMode = normalizeTournamentModeValue(
				modeOverride || globalTargetMode,
				globalTargetMode,
			);

			const gameIds = hiddenGamesInput
				? parseTournamentRoundGameIdsValue(hiddenGamesInput.value)
				: Array.from(gamesSelect?.selectedOptions || [])
						.map((opt) => String(opt.value || '').trim())
						.filter(Boolean);

			assignments.push({
				round,
				modeOverride,
				targetMode,
				gameIds,
			});
		}
		// Return raw assignments - let caller handle normalization
		return assignments;
	}

	function startTournament() {
		const name = byId('tournamentName')?.value.trim();
		if (!name) {
			showToast('Please enter a tournament name', 'error');
			return;
		}
		const existing = getActiveTournament();
		if (existing?.status === 'active' || existing?.status === 'paused') {
			showToast(
				'An active tournament already exists. End it first.',
				'warning',
			);
			return;
		}

		const planner = buildTournamentFormConfig();
		const targetMode = byId('tournamentTargetMode')?.value || 'any';
		if (planner.rounds < 1) {
			showToast('Tournament rounds must be at least 1', 'error');
			return;
		}
		if (planner.maxParticipants < 2) {
			showToast('Tournament must allow at least 2 participants', 'error');
			return;
		}
		clearTournamentPlannerHistoryMode();
		clearTournamentPlannerWorkingState();
		const roundAssignments = collectTournamentRoundAssignments(planner.rounds, {
			includeAllRounds: true,
		});

		// Validate that all assigned games still exist in the system
		const availableGameIds = getAvailableTournamentGameIds();
		let hasMissingGames = false;
		const missingRounds = [];

		roundAssignments.forEach((roundAssignment) => {
			const round = Number(roundAssignment?.round);
			const gameIds = Array.isArray(roundAssignment?.gameIds)
				? roundAssignment.gameIds
				: [];
			const missingInRound = gameIds.filter(
				(id) => !availableGameIds.has(String(id).trim()),
			);
			if (missingInRound.length > 0) {
				hasMissingGames = true;
				missingRounds.push(round);
			}
		});

		if (hasMissingGames) {
			showToast(
				`Cannot start tournament. Games are missing from rounds: ${missingRounds.join(', ')}. Please replace or remove them first.`,
				'error',
			);
			// Scroll to missing games panel
			const missingPanel = byId(
				'tournamentRoundGameAssignments',
			)?.querySelector('.tournament-missing-games-panel');
			if (missingPanel) {
				missingPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
			return;
		}

		// Create tournament-only copies for every selected round template so the
		// tournament never reuses old public session data.
		const allGames = GameCore.getQuizGames ? GameCore.getQuizGames() : [];
		const gameMap = new Map();
		allGames.forEach((game) => {
			if (game && game.id) gameMap.set(String(game.id), game);
		});
		const user = getCurrentUser();
		const nowIso = new Date().toISOString();
		const tournamentId = 'tourney-' + Date.now();
		const instanceBundle = buildTournamentInstanceAssignments(
			roundAssignments,
			{ id: tournamentId },
			gameMap,
		);
		const enrichedAssignments = instanceBundle.assignments;
		const createdTournamentGames = instanceBundle.createdGames;
		persistTournamentGameInstances(createdTournamentGames);
		const tournament = {
			id: tournamentId,
			name,
			targetMode,
			format: planner.format,
			maxParticipants: planner.maxParticipants,
			rounds: planner.rounds,
			currentRound: 1,
			recommendedRounds: planner.recommendedRounds,
			matchMinutes: planner.matchMinutes,
			bestOf: planner.bestOf,
			pointMultiplier: planner.pointMultiplier,
			winnerBonus: planner.winnerBonus,
			rewardExpBonus: planner.rewardExpBonus,
			rewardBadge: planner.rewardBadge,
			notes: planner.notes,
			autoSeeding: planner.autoSeeding,
			allowReentry: planner.allowReentry,
			estimatedMatches: planner.estimatedMatches,
			estimatedDurationHours: planner.estimatedDurationHours,
			roundAssignments: enrichedAssignments,
			participants: [],
			status: 'active',
			createdAt: nowIso,
			startedAt: nowIso,
			pausedAt: null,
			createdBy: user?.id || '',
		};
		setTournamentRoundDraft(enrichedAssignments, targetMode, {
			persistWorkingState: false,
		});
		localStorage.setItem('quizTournamentActive', JSON.stringify(tournament));

		const history = getTournamentHistory();
		history.push(tournament);
		saveTournamentHistory(history);

		if (createdTournamentGames.length) {
			console.log(
				`[Tournament] Created ${createdTournamentGames.length} tournament game instance(s).`,
			);
		}

		showToast('Tournament started!', 'success');
		loadGamificationUI();
		syncGamificationState();
		setTournamentStudioTab('dashboard');
	}

	function applyTournamentFinalRewards(tournament, winnerEntry) {
		if (!tournament || !winnerEntry?.id) return null;
		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}
		if (!users.length) return null;
		const winnerId = String(winnerEntry.id || '').trim();
		if (!winnerId) return null;
		const index = users.findIndex(
			(entry) => String(entry?.id || '').trim() === winnerId,
		);
		if (index < 0) return null;
		const winnerUser = {
			...users[index],
		};
		const rewardExpBonus = parseIntInRange(
			tournament.rewardExpBonus,
			0,
			0,
			5000,
		);
		winnerUser.exp = Math.max(Number(winnerUser.exp) || 0, 0) + rewardExpBonus;
		winnerUser.badges = Array.isArray(winnerUser.badges)
			? winnerUser.badges
			: [];
		const rewardBadgeName = String(tournament.rewardBadge || '').trim();
		if (rewardBadgeName) {
			const badgeId = `tournament_champion_${String(tournament.id || '').trim()}`;
			const hasBadge = winnerUser.badges.some(
				(badge) => badge && String(badge.id || '').trim() === badgeId,
			);
			if (!hasBadge) {
				winnerUser.badges.push({
					id: badgeId,
					icon: 'TCH',
					name: rewardBadgeName,
					desc: `Champion of ${tournament.name || 'Tournament'}.`,
					earnedAt: Date.now(),
				});
			}
		}
		users[index] = winnerUser;
		window.__DI_CONTAINER__.repo.setAll_sync('users', users);
		if (typeof window.syncUsersToClients === 'function') {
			window.syncUsersToClients();
		}
		return {
			exp: rewardExpBonus,
			badge: rewardBadgeName || '',
		};
	}

	function stopTournament() {
		clearTournamentPlannerHistoryMode();
		const active = getActiveTournament();
		if (!active) {
			showToast('No active tournament to stop', 'info');
			return;
		}

		const finalStandings = getTournamentLeaderboard(active, {
			includeZero: false,
		});
		const winner = finalStandings[0] || null;
		active.status = 'completed';
		active.endedAt = new Date().toISOString();
		active.participantCount = finalStandings.length;
		active.winnerId = winner?.id || '';
		active.winnerName = winner?.name || '';
		active.winnerPoints = winner?.points || 0;
		active.finalStandings = finalStandings.slice(0, 20);
		const finalReward = applyTournamentFinalRewards(active, winner);
		if (finalReward) {
			active.finalReward = finalReward;
		}

		const history = getTournamentHistory();
		const index = history.findIndex((t) => t.id === active.id);
		if (index >= 0) {
			history[index] = active;
		} else {
			history.push(active);
		}
		saveTournamentHistory(history);

		localStorage.removeItem('quizTournamentActive');
		const winnerLabelBase = winner
			? `Winner: ${winner.name} (${winner.points} pts)`
			: 'Tournament ended';
		const winnerLabel =
			winner && finalReward
				? `${winnerLabelBase} + ${finalReward.exp} EXP${
						finalReward.badge ? `, Badge: ${finalReward.badge}` : ''
					}`
				: winnerLabelBase;
		showToast(winnerLabel, 'success');
		clearTournamentPlannerWorkingState();
		setTournamentRoundDraft([], 'any', {
			persistWorkingState: false,
		});
		loadGamificationUI();
		syncGamificationState();
		setTournamentStudioTab('history');
	}

	window.saveGamificationConfig = saveGamificationConfig;
	window.startTournament = startTournament;
	window.stopTournament = stopTournament;
	window.pauseTournament = pauseTournament;
	window.resumeTournament = resumeTournament;
	window.advanceTournamentRound = advanceTournamentRound;
	window.deleteTournament = deleteTournament;
	window.editTournament = editTournament;
	window.loadGamificationUI = loadGamificationUI;
	window.renderTournamentLeaderboard = renderTournamentPanels;

	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(loadGamificationUI, 500); // Allow DOM elements to settle
		const watchModal = byId('adminGameWatchModal');
		if (watchModal && watchModal.dataset.bound !== 'true') {
			watchModal.dataset.bound = 'true';
			watchModal.addEventListener('click', (event) => {
				if (event.target === watchModal) {
					closeAdminGameWatch();
				}
			});
		}
		window.addEventListener('quiz:games-updated', () => {
			renderAdminGameWatch();
		});

		// Real-time socket listeners for live game state refresh
		const bindSocketListeners = () => {
			const socket = window.clientSocket;
			if (!socket || socket.__gamesManagementBound) return;
			socket.__gamesManagementBound = true;

			socket.on('game:stateUpdate', (gameSnapshot) => {
				if (gameSnapshot && gameSnapshot.id) {
					// Update local game data
					const games = GameCore.getQuizGames();
					const idx = games.findIndex((g) => g.id === gameSnapshot.id);
					if (idx >= 0) {
						games[idx] = gameSnapshot;
					} else {
						games.push(gameSnapshot);
					}
					GameCore.saveQuizGames(games);

					// If this game just completed & is a tournament game, apply scores
					if (
						gameSnapshot.status === 'completed' &&
						gameSnapshot.tournamentContext?.tournamentId
					) {
						applyTournamentScoresAfterGameEnd(gameSnapshot);
					}
				}
				// Refresh all relevant UI
				renderGameList();
				renderLobby();
				renderAdminGameWatch();
				renderTournamentPanels();
			});

			socket.on('admin:syncGamification', (payload) => {
				if (payload?.quizTournamentActive !== undefined) {
					if (payload.quizTournamentActive) {
						localStorage.setItem(
							'quizTournamentActive',
							JSON.stringify(payload.quizTournamentActive),
						);
					} else {
						localStorage.removeItem('quizTournamentActive');
					}
				}
				if (Array.isArray(payload?.quizTournamentsHistory)) {
					localStorage.setItem(
						'quizTournamentsHistory',
						JSON.stringify(payload.quizTournamentsHistory),
					);
				}
				if (payload?.quizGamification) {
					localStorage.setItem(
						'quizGamification',
						JSON.stringify(payload.quizGamification),
					);
				}
				loadGamificationUI();
			});
		};

		// Bind now if socket exists, or wait for it
		bindSocketListeners();
		const socketCheckInterval = setInterval(() => {
			if (window.clientSocket) {
				bindSocketListeners();
				clearInterval(socketCheckInterval);
			}
		}, 1000);
		setTimeout(() => clearInterval(socketCheckInterval), 30000);
	});

	window.addEventListener('storage', (event) => {
		const watchedKeys = new Set([
			'quizUsers',
			'quizGamification',
			'quizTournamentActive',
			'quizTournamentsHistory',
		]);
		if (!event || !event.key || watchedKeys.has(event.key)) {
			loadGamificationUI();
		}
	});

	window.toggleGameRulesVisibility = toggleGameRulesVisibility;
})();

// Student Workspace Logic
(function () {
	'use strict';

	const state = {
		filter: 'all',
		trainingFilter: 'all',
		gameFilter: 'open',
		workspaceTab: 'overview',
		activeGameId: null,
		gameActionsBound: false,
		profileDirty: false,
		profileEditingRequestId: '',
		avatarDraft: '',
		gameTicker: null,
		socketBound: false,
		lastStageGameId: '',
		lastStageSignature: '',
		lastStageUiSignature: '',
		hintUsed: false,
		lastHintQuestionKey: '',
		profileDockRaf: 0,
		selectedGameWordEl: null,
		draggedGameOption: null,
		headerRowsCollapsed: false,
		selectedSpecialCards: {},
		selectedReminderRules: {},
		multiSelectSelections: {},
		lastRealtimeWarningAt: 0,
		lastViewerScores: {},
	};
	const DEBUG_GAME_STAGE = localStorage.getItem('debugGameStage') === 'true';
	const GAME_SYNC_RENDER_INTERVAL_MS = 7000;

	const ACTIVE_GAME_KEY = 'studentActiveGameId';
	const gameSnapshotCache = new Map();
	const gameSyncRequestTimes = new Map();
	const htmlByElementCache = new Map();
	const savedGameResultIds = new Set();
	const pendingReadyRequests = new Set();
	const pendingReadyTimers = new Map();

	function setActiveGameId(gameId) {
		const nextId = gameId ? String(gameId) : '';
		state.activeGameId = nextId || null;
		try {
			if (nextId) {
				sessionStorage.setItem(ACTIVE_GAME_KEY, nextId);
			} else {
				sessionStorage.removeItem(ACTIVE_GAME_KEY);
			}
		} catch (e) {}
	}

	function restoreActiveGameId() {
		if (state.activeGameId) return;
		try {
			const stored = sessionStorage.getItem(ACTIVE_GAME_KEY);
			if (stored) state.activeGameId = stored;
		} catch (e) {}
	}

	function cacheGameSnapshot(game) {
		if (!game || !game.id) return;
		gameSnapshotCache.set(String(game.id), game);
	}

	function getCachedGame(gameId) {
		const key = String(gameId || '');
		return gameSnapshotCache.get(key) || null;
	}

	const GAME_INPUT_IDS = new Set([
		'warmupAnswerInput',
		'raceAnswerInput',
		'cardAnswerInput',
		'tieBreakAnswerInput',
	]);

	function isGameInputFocused() {
		const active = document.activeElement;
		return Boolean(
			active &&
			(GAME_INPUT_IDS.has(active.id) ||
				active.classList?.contains('game-fill-input')),
		);
	}

	function requestGameSync(gameId, context, minIntervalMs = 5000) {
		const socket = getSocket();
		if (!socket || !socket.connected || !gameId || !context) return;
		const key = String(gameId);
		const now = Date.now();
		const last = gameSyncRequestTimes.get(key) || 0;
		if (now - last < minIntervalMs) return;
		gameSyncRequestTimes.set(key, now);
		socket.emit('game:sync', { gameId: key, userId: context.user.id });
	}

	function mergeServerGameSnapshot(game) {
		if (!game?.id) return null;
		const gameId = String(game.id || '').trim();
		if (!gameId) return null;
		const normalizedGame = window.GameCore?.normalizeGame
			? window.GameCore.normalizeGame(game)
			: {
					...game,
					id: gameId,
				};
		serverGames.set(gameId, normalizedGame);
		cacheGameSnapshot(normalizedGame);
		const existingGames = getGamesStore();
		const index = existingGames.findIndex(
			(entry) => String(entry?.id || '').trim() === gameId,
		);
		if (index >= 0) {
			existingGames[index] = {
				...existingGames[index],
				...normalizedGame,
				id: gameId,
			};
		} else {
			existingGames.push({
				...normalizedGame,
				id: gameId,
			});
		}
		saveGamesStore(existingGames);
		return normalizedGame;
	}

	function syncGameStateNow(gameId, context) {
		return new Promise((resolve) => {
			const socket = getSocket();
			if (!socket || !socket.connected || !gameId || !context) {
				resolve(null);
				return;
			}
			socket.emit(
				'game:sync',
				{
					gameId: String(gameId || '').trim(),
					userId: context.user.id,
				},
				(response) => {
					if (!response?.ok || !response?.game) {
						resolve(null);
						return;
					}
					resolve(mergeServerGameSnapshot(response.game));
				},
			);
		});
	}

	// Server-authoritative game state cache
	const serverGames = new Map(); // gameId -> game state from server

	const GAME_TYPE_LABELS = {
		race: 'Race',
		'sprint-race': 'Sprint Race',
		cards: 'Card Battle',
		'cards-draw': 'Card Draw Battle',
		'hot-potato': 'Hot Potato',
		'last-survivor': 'Last Survivor',
		training: 'Training',
		warmup: 'Warm-up',
		tiebreak: 'Tie-break',
	};

	function getGameTypeLabel(type) {
		return GAME_TYPE_LABELS[type] || 'Game';
	}

	function getSocket() {
		return window.clientSocket || null;
	}

	function notifyRealtimeDisconnected() {
		const now = Date.now();
		const lastAt = Number(state.lastRealtimeWarningAt || 0);
		if (now - lastAt < 3000) return;
		state.lastRealtimeWarningAt = now;
		showToast(
			'Realtime server disconnected. Waiting for reconnection...',
			'warning',
		);
	}

	function getServerGame(gameId) {
		return serverGames.get(gameId) || null;
	}

	// Override getGameById to prefer server state
	function getGameByIdResolved(gameId) {
		const targetId = String(gameId || '');
		return (
			getServerGame(targetId) ||
			getGamesStore().find((g) => String(g.id) === targetId) ||
			null
		);
	}

	function getLocalGameUiSignature(gameId) {
		const id = String(gameId || '').trim();
		const selectedSpecial = normalizeSpecialCardId(
			state.selectedSpecialCards?.[id] || '',
		);
		const selectedReminderRule = String(
			state.selectedReminderRules?.[id] || '',
		).trim();
		return [
			id,
			selectedSpecial,
			selectedReminderRule,
			state.headerRowsCollapsed ? 'rows:1' : 'rows:0',
			state.hintUsed ? 'hint:1' : 'hint:0',
		].join('|');
	}

	function isReadyTogglePending(gameId) {
		const id = String(gameId || '').trim();
		return Boolean(id && pendingReadyRequests.has(id));
	}

	function setReadyTogglePending(gameId) {
		const id = String(gameId || '').trim();
		if (!id) return;
		pendingReadyRequests.add(id);
		const existingTimer = pendingReadyTimers.get(id);
		if (existingTimer) clearTimeout(existingTimer);
		const timeoutId = setTimeout(() => {
			pendingReadyTimers.delete(id);
			if (pendingReadyRequests.delete(id)) {
				window.dispatchEvent(new CustomEvent('quiz:games-updated'));
			}
		}, 5000);
		pendingReadyTimers.set(id, timeoutId);
	}

	function clearReadyTogglePending(gameId) {
		const id = String(gameId || '').trim();
		if (!id) return false;
		const existingTimer = pendingReadyTimers.get(id);
		if (existingTimer) {
			clearTimeout(existingTimer);
			pendingReadyTimers.delete(id);
		}
		return pendingReadyRequests.delete(id);
	}

	function byId(id) {
		return document.getElementById(id);
	}

	function isDesktopWorkspaceViewport() {
		return window.innerWidth > 960;
	}

	function updateStickyProfileDock() {
		const tabsBar = byId('studentWorkspaceTabs');
		const tabsDock = byId('workspaceTabsProfileDock');
		const dropdown = byId('studentWorkspaceDropdown');
		const headerActions = document.querySelector(
			'.workspace-header .workspace-actions',
		);
		if (!tabsBar || !tabsDock || !dropdown || !headerActions) return;

		const isSticky = tabsBar.getBoundingClientRect().top <= 12.5;
		const dropdownVisible = !dropdown.classList.contains('hidden');
		const shouldDock =
			isDesktopWorkspaceViewport() && dropdownVisible && isSticky;
		const isDocked = tabsDock.contains(dropdown);

		if (shouldDock && !isDocked) {
			closeStudentDropdown();
			tabsDock.appendChild(dropdown);
		} else if (!shouldDock && isDocked) {
			closeStudentDropdown();
			headerActions.appendChild(dropdown);
		}

		tabsBar.classList.toggle(
			'workspace-tabs-profile-active',
			shouldDock && tabsDock.contains(dropdown),
		);
	}

	function queueStickyProfileDockUpdate() {
		if (state.profileDockRaf) return;
		state.profileDockRaf = window.requestAnimationFrame(() => {
			state.profileDockRaf = 0;
			updateStickyProfileDock();
		});
	}

	function bindStickyProfileDock() {
		window.addEventListener('scroll', queueStickyProfileDockUpdate, {
			passive: true,
		});
		window.addEventListener('resize', queueStickyProfileDockUpdate, {
			passive: true,
		});
	}

	function getGamesStore() {
		if (window.GameCore) return window.GameCore.getQuizGames();
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('games');
		} catch (e) {
			return [];
		}
	}

	function saveGamesStore(games, options = {}) {
		const syncedAt = new Date().toISOString();
		if (window.GameCore) {
			window.GameCore.saveQuizGames(games);
			localStorage.setItem('quizGamesSyncedAt', syncedAt);
			queueGameSync(games, syncedAt, options);
			return;
		}
		window.__DI_CONTAINER__.repo.setAll_sync('games', games);
		localStorage.setItem('quizGamesSyncedAt', syncedAt);
		queueGameSync(games, syncedAt, options);
	}

	let gameSyncTimer = null;
	let lastGameSyncSignature = '';
	function queueGameSync(games, syncedAt, options = {}) {
		const isAdmin =
			typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
		const isTeacher =
			typeof window.Auth?.isTeacher === 'function' && window.Auth.isTeacher();
		const canSyncGames = isAdmin || isTeacher;
		if (!canSyncGames) return;
		const socket = window.clientSocket;
		if (!socket || !socket.connected) return;
		let signature = '';
		try {
			signature = JSON.stringify(games);
		} catch (e) {
			signature = String(Date.now());
		}
		if (signature && signature === lastGameSyncSignature) return;
		if (signature) lastGameSyncSignature = signature;
		if (gameSyncTimer) clearTimeout(gameSyncTimer);
		const payload = {
			quizGames: games,
			syncedAt: syncedAt || new Date().toISOString(),
			cache: true,
		};
		if (options.scope) {
			payload.scope = options.scope;
		}
		gameSyncTimer = setTimeout(() => {
			socket.emit('client:syncGames', payload);
		}, 200);
	}

	function updateGameStore(gameId, updater, options = {}) {
		const games = getGamesStore();
		const targetId = String(gameId || '');
		const index = games.findIndex((g) => String(g.id) === targetId);
		if (index === -1) return null;
		const updated = window.GameCore
			? window.GameCore.normalizeGame(updater({ ...games[index] }))
			: updater({ ...games[index] });
		games[index] = updated;
		saveGamesStore(games, options);
		return updated;
	}

	function getGameById(gameId) {
		const targetId = String(gameId || '').trim();
		if (!targetId) return null;
		const store = getGamesStore();
		// Robust match: check strictly and loosely
		return store.find((g) => String(g.id).trim() === targetId) || null;
	}

	function showAuthModal() {
		if (window.Auth?.showStudentAuthModal) {
			window.Auth.showStudentAuthModal();
			return;
		}
		const modal = byId('studentAuthModal');
		if (!modal) return;
		modal.style.display = 'flex';
		modal.classList.add('active');
	}

	function hideAuthModal() {
		if (window.Auth?.hideStudentAuthModal) {
			window.Auth.hideStudentAuthModal();
			return;
		}
		const modal = byId('studentAuthModal');
		if (!modal) return;
		modal.style.display = 'none';
		modal.classList.remove('active');
	}

	function getStudentContext() {
		let user = window.Auth?.getCurrentUser
			? window.Auth.getCurrentUser()
			: null;
		if (!user) return null;
		if (window.Auth?.getUsers) {
			const fresh = window.Auth.getUsers().find((u) => u.id === user.id);
			if (fresh) user = fresh;
		}
		const normalizedRole = String(user?.role || '')
			.trim()
			.toLowerCase();
		if (
			normalizedRole &&
			normalizedRole !== 'student' &&
			normalizedRole !== 'learner' &&
			normalizedRole !== 'participant'
		) {
			return null;
		}

		const identity = window.Auth.getStudentIdentity
			? window.Auth.getStudentIdentity(user)
			: null;
		if (!identity) return null;

		const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
		let classRecord = null;
		if (identity.classId) {
			classRecord = classes.find((c) => c.id === identity.classId) || null;
		}
		if (!classRecord && identity.class) {
			classRecord = classes.find((c) => c.name === identity.class) || null;
		}

		return { user, identity, classRecord };
	}
	window.getStudentContext = getStudentContext;

	function getJoinPayload(context, game, participant) {
		if (!context || !game) return null;
		const user = context.user || {};
		const identity = context.identity || {};
		return {
			gameId: game.id,
			userId: user.id,
			userName: user.name || user.username || identity?.name || 'Student',
			classId: user.classId || identity?.classId || '',
			teamId: participant?.teamId || '',
		};
	}

	function rejoinLiveGames(context) {
		const socket = getSocket();
		if (!socket || !socket.connected || !context) return;
		const games = getGamesStore();
		games.forEach((game) => {
			if (!game || !game.id) return;
			if (game.status !== 'live' && game.status !== 'open') return;
			const participant = game.session?.participants?.find((p) =>
				sameUserIdValue(p?.userId, context?.user?.id),
			);
			if (!participant) return;
			const payload = getJoinPayload(context, game, participant);
			if (payload) socket.emit('game:join', payload);
		});
	}

	function syncKnownGames(context, minIntervalMs = 12000) {
		const socket = getSocket();
		if (!socket || !socket.connected || !context) return;
		const games = getGamesStore();
		games.forEach((game) => {
			if (!game?.id) return;
			requestGameSync(String(game.id), context, minIntervalMs);
		});
	}

	function setGamesRefreshButtonBusy(isBusy) {
		const button = byId('studentGamesRefreshBtn');
		if (!button) return;
		if (!button.dataset.labelDefault) {
			button.dataset.labelDefault = button.textContent || 'Refresh';
		}
		if (isBusy) {
			button.disabled = true;
			button.textContent = 'Syncing...';
			return;
		}
		button.disabled = false;
		button.textContent = button.dataset.labelDefault || 'Refresh';
	}

	function applyServerGameListSnapshot(serverGamesList, context) {
		const incoming = Array.isArray(serverGamesList)
			? serverGamesList.filter((game) => game && game.id)
			: [];
		const existingGames = getGamesStore();
		const existingById = new Map(
			existingGames.map((game) => [String(game?.id || ''), game]),
		);
		const mergedById = new Map(
			existingGames.map((game) => [String(game?.id || ''), game]),
		);
		incoming.forEach((game) => {
			const id = String(game.id);
			const previous = existingById.get(id) || {};
			const combined = {
				...previous,
				...game,
				id,
			};
			const normalized = window.GameCore?.normalizeGame
				? window.GameCore.normalizeGame(combined)
				: combined;
			mergedById.set(id, normalized);
		});
		const merged = Array.from(mergedById.values()).filter(
			(game) => game && game.id,
		);
		saveGamesStore(merged);

		incoming.forEach((game) => {
			requestGameSync(String(game.id), context, 0);
		});
	}

	function refreshGamesFromAdmin(context) {
		if (!context) return;
		const socket = getSocket();
		if (!socket || !socket.connected) {
			showToast(
				'Realtime server is offline. Showing local games only.',
				'warning',
			);
			renderGamesPanel(context);
			renderGameStage(context);
			return;
		}

		setGamesRefreshButtonBusy(true);
		let settled = false;
		const timeoutId = setTimeout(() => {
			if (settled) return;
			settled = true;
			setGamesRefreshButtonBusy(false);
			showToast('Sync requested. Waiting for server response...', 'info');
		}, 5000);

		// Ask server for the latest admin-side game sync payload.
		socket.emit('client:requestGames');
		socket.emit('game:list', (response) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			setGamesRefreshButtonBusy(false);

			if (response?.error) {
				showToast(response.error, 'error');
				return;
			}
			if (!response?.ok || !Array.isArray(response.games)) {
				showToast('Could not fetch latest games from server.', 'error');
				return;
			}

			const syncedGameIds = response.games
				.map((game) => String(game?.id || '').trim())
				.filter(Boolean);
			applyServerGameListSnapshot(response.games, context);
			Promise.all(
				syncedGameIds.map((gameId) =>
					syncGameStateNow(gameId, context).catch(() => null),
				),
			).finally(() => {
				renderGamesPanel(context);
				renderGameStage(context);
				showToast(`Synced ${response.games.length} game(s).`, 'success');
			});
		});
	}

	function bindGameSocket() {
		const socket = getSocket();
		if (!socket || state.socketBound) return;
		state.socketBound = true;
		socket.on('connect', () => {
			const context = getStudentContext();
			if (!context) return;
			gameSyncRequestTimes.clear();
			rejoinLiveGames(context);
			// Recover missed status changes (e.g., reopened lobbies while offline).
			syncKnownGames(context, 0);
			startGameTicker(context);
		});
		socket.on('disconnect', () => {
			const context = getStudentContext();
			if (!context) return;
			startGameTicker(context);
		});
		socket.on('game:stateUpdate', (game) => {
			if (game && game.id) {
				mergeServerGameSnapshot(game);
				// The realtime-client handles localStorage syncing, but this guarantees 
				// the student workspace's isolated serverGames map is instantly updated.
				window.dispatchEvent(new CustomEvent('quiz:games-updated'));
			}
		});
	}

	function collectExamResults(identity) {
		const results = [];

		const examResultsStore = JSON.parse(
			localStorage.getItem('examResults') || '{}',
		);
		Object.values(examResultsStore).forEach((examData) => {
			if (!examData || !Array.isArray(examData.students)) return;
			examData.students.forEach((student) => {
				const info = student.studentInfo || {};
				if (
					String(info.numero) === String(identity.numero) &&
					String(info.class) === String(identity.class)
				) {
					results.push({
						examId: examData.examId || student.examId,
						examName: examData.examName || student.examName,
						score: student.score || 0,
						totalQuestions: student.totalQuestions || 0,
						timeSpent: student.timeSpent || 0,
						date: student.date || student.completedAt || '',
					});
				}
			});
		});

		const activeSession = JSON.parse(
			localStorage.getItem('examActiveSession') || '{}',
		);
		if (activeSession && Array.isArray(activeSession.completedResults)) {
			activeSession.completedResults.forEach((entry) => {
				const info = entry.studentInfo || {};
				if (
					String(info.numero) === String(identity.numero) &&
					String(info.class) === String(identity.class)
				) {
					results.push({
						examId: entry.examId,
						examName: entry.examName,
						score: entry.results?.score || 0,
						totalQuestions: entry.results?.totalQuestions || 0,
						timeSpent: entry.results?.timeSpent || 0,
						date: entry.completedAt || '',
					});
				}
			});
		}

		return results;
	}

	function buildResultsMap(results) {
		const map = new Map();
		results.forEach((result) => {
			if (!result.examId) return;
			const existing = map.get(result.examId);
			if (!existing) {
				map.set(result.examId, result);
				return;
			}
			const existingDate = existing.date ? new Date(existing.date) : null;
			const currentDate = result.date ? new Date(result.date) : null;
			if (currentDate && (!existingDate || currentDate > existingDate)) {
				map.set(result.examId, result);
			}
		});
		return map;
	}

	function getAssignedExams(classRecord) {
		if (!classRecord) return [];
		const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
		return exams.filter(
			(exam) =>
				Array.isArray(exam.classes) && exam.classes.includes(classRecord.id),
		);
	}

	function getTrainingResults(identity) {
		let results = [];
		try {
			results = window.__DI_CONTAINER__.repo.getAll_sync('results');
		} catch (e) {
			results = [];
		}
		const studentNumber = String(identity?.numero || '').trim();
		const classId = String(identity?.classId || '').trim();
		const className = String(identity?.class || '')
			.trim()
			.toLowerCase();
		return results
			.filter((result) => {
				if (!result || typeof result !== 'object') return false;
				if (result.gameId) return false;
				const mode = String(result.mode || '').toLowerCase();
				if (mode && mode !== 'training') return false;

				const resultNumber = String(
					result.numero || result.studentNumber || '',
				).trim();
				const resultClassId = String(result.classId || '').trim();
				const resultClass = String(result.class || result.className || '')
					.trim()
					.toLowerCase();
				if (!resultNumber) return false;
				const classMatchesByName = className && resultClass === className;
				const classMatchesById = classId && resultClassId === classId;
				return (
					resultNumber === studentNumber &&
					(classMatchesByName || classMatchesById)
				);
			})
			.map((result, index) => {
				const score = Number(result.score);
				const totalQuestions = Number(
					result.totalQuestions || result.totalPoints || 0,
				);
				return {
					id: result.id || `training-${index}`,
					title: result.examTitle || 'Training Quiz',
					score: Number.isFinite(score) ? score : 0,
					totalQuestions: Number.isFinite(totalQuestions) ? totalQuestions : 0,
					date: result.date || result.dateTaken || '',
				};
			})
			.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
	}

	function dedupeTrainingResultsByExam(trainingResults = []) {
		const seen = new Map();
		trainingResults.forEach((result) => {
			const key = String(result.examId || result.title || 'training quiz')
				.trim()
				.toLowerCase();
			if (!key || seen.has(key)) return;
			seen.set(key, result);
		});
		return Array.from(seen.values());
	}

	function renderHeader(context) {
		const chip = byId('workspaceUserChip');
		const classChip = byId('workspaceClassChip');
		const avatar = byId('workspaceAvatar');
		const menuName = byId('workspaceMenuName');
		const menuMeta = byId('workspaceMenuMeta');
		if (chip) chip.textContent = context.identity.name || 'Student';
		if (classChip) classChip.textContent = context.identity.class || 'Class';
		if (menuName)
			menuName.textContent =
				context.identity.name || context.user.name || 'Student';
		if (menuMeta) {
			const className =
				context.identity.class ||
				context.user.className ||
				context.user.class ||
				'';
			const studentNumber = context.user.studentNumber || '';
			if (className && studentNumber) {
				menuMeta.textContent = `${className} - #${studentNumber}`;
			} else if (className) {
				menuMeta.textContent = className;
			} else if (studentNumber) {
				menuMeta.textContent = `#${studentNumber}`;
			} else {
				menuMeta.textContent = 'Class';
			}
		}
		if (avatar) {
			const baseName = (
				context.identity.name ||
				context.user.name ||
				'S'
			).trim();
			avatar.textContent = baseName ? baseName.charAt(0).toUpperCase() : 'S';
		}

		const subtitle = byId('workspaceSubtitle');
		if (subtitle) {
			subtitle.textContent = `Welcome back, ${context.identity.name}`;
		}
	}

	function getWorkspaceSectionTabs(sectionValue) {
		if (!sectionValue) return [];
		return String(sectionValue)
			.split(/[,\s]+/)
			.map((value) => value.trim().toLowerCase())
			.filter(Boolean);
	}

	function applyWorkspaceTabVisibility() {
		const activeTab = String(state.workspaceTab || 'overview').toLowerCase();
		const sections = document.querySelectorAll('[data-workspace-section]');
		sections.forEach((section) => {
			const allowedTabs = getWorkspaceSectionTabs(
				section.dataset.workspaceSection,
			);
			const shouldShow = allowedTabs.includes(activeTab);
			section.classList.toggle('workspace-tab-hidden', !shouldShow);
		});

		document.querySelectorAll('.workspace-tab-btn').forEach((btn) => {
			btn.classList.toggle(
				'active',
				String(btn.dataset.workspaceTab || '').toLowerCase() === activeTab,
			);
		});

		let columnVisible = false;
		let sidebarVisible = false;
		const column = document.querySelector('.workspace-column');
		const sidebar = document.querySelector('.workspace-sidebar');
		if (column) {
			const hasVisible = Boolean(
				column.querySelector(
					'[data-workspace-section]:not(.workspace-tab-hidden)',
				),
			);
			column.classList.toggle('workspace-tab-hidden', !hasVisible);
			columnVisible = hasVisible;
		}
		if (sidebar) {
			const hasVisible = Boolean(
				sidebar.querySelector(
					'[data-workspace-section]:not(.workspace-tab-hidden)',
				),
			);
			sidebar.classList.toggle('workspace-tab-hidden', !hasVisible);
			sidebarVisible = hasVisible;
		}

		const grid = document.querySelector('.workspace-grid');
		if (grid) {
			const singleColumn = columnVisible !== sidebarVisible;
			const sidebarOnly = !columnVisible && sidebarVisible;
			grid.classList.toggle('workspace-grid--single-tab', singleColumn);
			grid.classList.toggle('workspace-grid--sidebar-only', sidebarOnly);
		}
	}

	function switchWorkspaceTab(tabKey) {
		const normalized = String(tabKey || '')
			.trim()
			.toLowerCase();
		const allowedTabs = new Set([
			'overview',
			'exams',
			'training',
			'games',
			'tournament',
			'results',
		]);
		state.workspaceTab = allowedTabs.has(normalized) ? normalized : 'overview';
		applyWorkspaceTabVisibility();
		if (state.workspaceTab === 'games') {
			const context = getStudentContext();
			if (context) {
				renderGamesPanel(context);
				renderGameStage(context);
			}
		}
		if (state.workspaceTab === 'tournament') {
			const context = getStudentContext();
			if (context) {
				renderGamificationUI(context);
			}
		}
	}

		function getProfileRequestsForUser(userId) {
			const requests = window.Auth?.getProfileRequests
				? window.Auth.getProfileRequests()
				: (function() { var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo; return r ? r.getValue_sync('profile_requests', []) : JSON.parse(localStorage.getItem('quizProfileRequests') || '[]'); })();
		return requests
			.filter((req) => req.userId === userId)
			.sort((a, b) => {
				const dateA =
					a.createdAt ||
					a.requestedAt ||
					a.receivedAt ||
					new Date(0).toISOString();
				const dateB =
					b.createdAt ||
					b.requestedAt ||
					b.receivedAt ||
					new Date(0).toISOString();
				return dateB.localeCompare(dateA);
			});
	}

	function renderProfileGamificationChips(user) {
		const pointsChip = byId('studentProfilePointsChip');
		const badgesChip = byId('studentProfileBadgesChip');
		const expValue = Math.max(Number(user?.exp) || 0, 0);
		const badgesCount = Array.isArray(user?.badges) ? user.badges.length : 0;
		if (pointsChip) pointsChip.textContent = `Points: ${expValue}`;
		if (badgesChip) badgesChip.textContent = `Badges: ${badgesCount}`;
	}

	function formatCompactProfileMetric(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return '0';
		try {
			return new Intl.NumberFormat(undefined, {
				notation: numeric >= 1000 ? 'compact' : 'standard',
				maximumFractionDigits: numeric >= 1000 ? 1 : 0,
			}).format(numeric);
		} catch (e) {
			return String(Math.round(numeric));
		}
	}

	function getStudentProfileStats(context) {
		const userId = String(context?.user?.id || '').trim();
		const results = (() => {
			try {
				const parsed = window.__DI_CONTAINER__.repo.getAll_sync('results');
				return Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				return [];
			}
		})();
		const myResults = results.filter(
			(entry) => String(entry?.userId || '').trim() === userId,
		);
		const totalSessions = myResults.length;
		const wins = myResults.filter(
			(entry) => String(entry?.label || '').trim().toLowerCase() === 'winner',
		).length;
		const totalScore = myResults.reduce(
			(sum, entry) => sum + Math.max(Number(entry?.score) || 0, 0),
			0,
		);
		const averageScore = totalSessions ? Math.round(totalScore / totalSessions) : 0;
		const expValue = Math.max(Number(context?.user?.exp) || 0, 0);
		const level = Math.floor(expValue / 200) + 1;
		const nextLevelFloor = 200;
		const progressIntoLevel = expValue % 200;
		const progressPercent = Math.min(
			100,
			Math.max(0, Math.round((progressIntoLevel / 200) * 100)),
		);
		const badges = Array.isArray(context?.user?.badges)
			? context.user.badges.slice()
			: [];
		const latestBadge = badges
			.slice()
			.sort((a, b) => Number(b?.earnedAt || 0) - Number(a?.earnedAt || 0))[0];
		const tournamentScoreMap =
			context?.user?.tournamentScores &&
			typeof context.user.tournamentScores === 'object'
				? context.user.tournamentScores
				: {};
		const tournamentPoints = Object.values(tournamentScoreMap).reduce(
			(sum, value) => sum + (Number(value) || 0),
			0,
		);
		const rewardsCount = badges.length + Object.keys(tournamentScoreMap).length;
		return {
			level,
			expValue,
			nextLevelFloor,
			progressIntoLevel,
			progressPercent,
			tournamentPoints,
			rewardsCount,
			totalSessions,
			wins,
			averageScore,
			latestBadge,
			winRate:
				totalSessions > 0 ? Math.round((wins / totalSessions) * 100) : 0,
		};
	}

	function renderProfilePerformanceSnapshot(context) {
		const stats = getStudentProfileStats(context);
		const setText = (id, value) => {
			const el = byId(id);
			if (el) el.textContent = value;
		};
		setText('studentProfileLevelValue', formatCompactProfileMetric(stats.level));
		setText('studentProfileExpValue', formatCompactProfileMetric(stats.expValue));
		setText(
			'studentProfileTournamentPointsValue',
			formatCompactProfileMetric(stats.tournamentPoints),
		);
		setText(
			'studentProfileRewardsValue',
			formatCompactProfileMetric(stats.rewardsCount),
		);
		setText(
			'studentProfileSessionsValue',
			formatCompactProfileMetric(stats.totalSessions),
		);
		setText('studentProfileWinsValue', formatCompactProfileMetric(stats.wins));
		setText(
			'studentProfileAverageScoreValue',
			formatCompactProfileMetric(stats.averageScore),
		);
		setText(
			'studentProfileLatestRewardValue',
			stats.latestBadge?.name || 'No reward yet',
		);
		setText(
			'studentProfileSeasonSummary',
			stats.totalSessions
				? `${stats.winRate}% win rate across ${stats.totalSessions} recorded sessions`
				: 'Play a live game to unlock your performance summary',
		);
		setText(
			'studentProfileProgressValue',
			`${formatCompactProfileMetric(stats.progressIntoLevel)} / ${formatCompactProfileMetric(
				stats.nextLevelFloor,
			)} XP to next level`,
		);
		setText('studentProfileWinRateValue', `${stats.winRate}%`);
		const progressFill = byId('studentProfileProgressFill');
		if (progressFill) {
			progressFill.style.width = `${stats.progressPercent}%`;
		}
	}

	function populateProfileForm(context) {
		const user = context.user;
		const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');

		const nameInput = byId('studentProfileFullName');
		const usernameInput = byId('studentProfileUsername');
		const numberInput = byId('studentProfileNumberInput');
		const classSelect = byId('studentProfileClassSelect');
		const avatarImg = byId('studentProfileAvatarImage');
		const avatarFallback = byId('studentProfileAvatarFallback');
		const profileName = byId('studentProfileName');
		const profileClass = byId('studentProfileClass');
		const profileNumber = byId('studentProfileNumber');

		if (profileName)
			profileName.textContent = user.name || user.username || 'Student';
		if (profileClass)
			profileClass.textContent =
				user.className || context.identity.class || 'Class';
		if (profileNumber)
			profileNumber.textContent = user.studentNumber
				? `#${user.studentNumber}`
				: '#--';
		renderProfileGamificationChips(user);
		renderProfilePerformanceSnapshot(context);

		const avatar = state.avatarDraft || user.avatar || '';
		if (avatarImg) {
			if (avatar) {
				avatarImg.src = avatar;
				avatarImg.style.display = 'block';
				if (avatarFallback) avatarFallback.style.display = 'none';
			} else {
				avatarImg.src = '';
				avatarImg.style.display = 'none';
				if (avatarFallback) {
					avatarFallback.style.display = 'flex';
					avatarFallback.textContent = (user.name || user.username || 'S')
						.trim()
						.charAt(0)
						.toUpperCase();
				}
			}
		}

		if (classSelect && !classSelect.options.length) {
			classSelect.innerHTML =
				'<option value="">Select class</option>' +
				classes
					.map(
						(cls) =>
							`<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`,
					)
					.join('');
		}

		if (!state.profileDirty) {
			if (nameInput) nameInput.value = user.name || '';
			if (usernameInput) usernameInput.value = user.username || '';
			if (numberInput) numberInput.value = user.studentNumber || '';
			if (classSelect) classSelect.value = user.classId || '';
		}
	}

	function renderProfileRequestStatus(context) {
		const container = byId('studentProfileRequestStatus');
		if (!container) return;
		const requests = getProfileRequestsForUser(context.user.id);
		if (!requests.length) {
			container.innerHTML =
				'<div class="empty-state">No profile requests yet.</div>';
			return;
		}
		const latest = requests[0];
		container.innerHTML = `
			<div class="request-status-card ${escapeHtml(latest.status)}">
				<div>
					<div class="request-title">Latest Request</div>
					<div class="request-subtitle">${new Date(latest.createdAt).toLocaleString()}</div>
				</div>
				<span class="request-pill ${escapeHtml(latest.status)}">${escapeHtml(latest.status)}</span>
			</div>
		`;
	}

	function renderProfileSection(context) {
		populateProfileForm(context);
		renderProfileStatus(context);
	}

	function openStudentProfileModal() {
		const modal = byId('studentProfileModal');
		if (!modal) return;
		const context = getStudentContext();
		if (!context) {
			showAuthModal();
			return;
		}
		renderProfileSection(context);
		switchStudentProfileTab('profile');
		closeStudentDropdown();
		modal.style.display = 'flex';
		modal.classList.add('active');
	}

	function closeStudentProfileModal() {
		const modal = byId('studentProfileModal');
		if (!modal) return;
		modal.style.display = 'none';
		modal.classList.remove('active');
	}

	function switchStudentProfileTab(tabKey) {
		document.querySelectorAll('.profile-section').forEach((section) => {
			if (section.id === `${tabKey}-tab`) {
				section.classList.remove('hidden');
			} else {
				section.classList.add('hidden');
			}
		});
		document.querySelectorAll('.profile-tab-btn').forEach((btn) => {
			btn.classList.toggle('active', btn.dataset.profileTab === tabKey);
		});
	}

	function openStudentSettingsTab(tabKey) {
		openStudentProfileModal();
		const context = getStudentContext();
		if (!context) return;
		switchStudentProfileTab(tabKey);
		renderProfileSection(context);
	}

	function toggleStudentDropdown() {
		const menu = byId('studentWorkspaceMenu');
		const dropdown = byId('studentWorkspaceDropdown');
		if (!menu) return;
		const shouldOpen = !menu.classList.contains('active');
		menu.classList.toggle('active', shouldOpen);
		if (dropdown) dropdown.classList.toggle('active', shouldOpen);
	}

	function closeStudentDropdown() {
		const menu = byId('studentWorkspaceMenu');
		const dropdown = byId('studentWorkspaceDropdown');
		if (!menu) return;
		menu.classList.remove('active');
		if (dropdown) dropdown.classList.remove('active');
	}

	// Legacy local-only profile submit (kept for reference).
	function handleProfileSubmitLegacy(context) {
		const nameInput = byId('studentProfileFullName');
		const usernameInput = byId('studentProfileUsername');
		const numberInput = byId('studentProfileNumberInput');
		const classSelect = byId('studentProfileClassSelect');
		const noteInput = byId('studentProfileNote');

		const changes = {};
		if (
			nameInput &&
			nameInput.value.trim() &&
			nameInput.value.trim() !== context.user.name
		)
			changes.name = nameInput.value.trim();
		if (
			usernameInput &&
			usernameInput.value.trim() &&
			usernameInput.value.trim() !== context.user.username
		)
			changes.username = usernameInput.value.trim();
		if (
			numberInput &&
			numberInput.value.trim() &&
			numberInput.value.trim() !== context.user.studentNumber
		)
			changes.studentNumber = numberInput.value.trim();
		if (
			classSelect &&
			classSelect.value &&
			classSelect.value !== context.user.classId
		)
			changes.classId = classSelect.value;

		if (!Object.keys(changes).length && !state.avatarDraft) {
			showToast('No changes detected', 'info');
			return;
		}

		const existing = getProfileRequestsForUser(context.user.id).find(
			(req) => req.status === 'pending',
		);
		if (existing) {
			showToast('You already have a pending request', 'warning');
			return;
		}

		const request = window.Auth?.submitProfileRequest
			? window.Auth.submitProfileRequest({
					userId: context.user.id,
					changes,
					avatar: state.avatarDraft,
					note: noteInput ? noteInput.value.trim() : '',
					currentSnapshot: {
						name: context.user.name,
						username: context.user.username,
						studentNumber: context.user.studentNumber,
						classId: context.user.classId,
					},
				})
			: null;

		if (request) {
			showToast('Profile update request sent', 'success');
			state.profileDirty = false;
			renderProfileRequestStatus(context);
		} else {
			showToast('Unable to send request', 'error');
		}
	}

	async function handlePasswordSubmit(context) {
		const currentInput = byId('studentPasswordCurrent');
		const newInput = byId('studentPasswordNew');
		const confirmInput = byId('studentPasswordConfirm');

		if (!currentInput || !newInput || !confirmInput) return;
		const currentPassword = currentInput.value;
		const newPassword = newInput.value;
		const confirmPassword = confirmInput.value;

		if (!currentPassword || !newPassword) {
			showToast('Please fill all password fields', 'error');
			return;
		}
		if (newPassword.length < 6) {
			showToast('New password must be at least 6 characters', 'error');
			return;
		}
		if (newPassword !== confirmPassword) {
			showToast('Passwords do not match', 'error');
			return;
		}

		if (window.Auth?.updateUserPassword) {
			const result = await window.Auth.updateUserPassword(
				context.user.id,
				currentPassword,
				newPassword,
			);
			if (result.ok) {
				showToast('Password updated successfully', 'success');
				currentInput.value = '';
				newInput.value = '';
				confirmInput.value = '';
			} else {
				showToast(result.message || 'Password update failed', 'error');
			}
		}
	}

	function handleAvatarUpload(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			state.avatarDraft = reader.result;
			state.profileDirty = true;
			const avatarImg = byId('studentProfileAvatarImage');
			const avatarFallback = byId('studentProfileAvatarFallback');
			if (avatarImg) {
				avatarImg.src = reader.result;
				avatarImg.style.display = 'block';
			}
			if (avatarFallback) avatarFallback.style.display = 'none';
		};
		reader.readAsDataURL(file);
	}

	function resetProfileForm(context) {
		state.profileDirty = false;
		state.profileEditingRequestId = '';
		state.avatarDraft = '';
		populateProfileForm(context);
		const noteInput = byId('studentProfileNote');
		if (noteInput) noteInput.value = '';
	}

	function renderHeroStats(exams, resultsMap) {
		const total = exams.length;
		const completed = exams.filter((exam) => resultsMap.has(exam.id)).length;
		const scores = Array.from(resultsMap.values()).map((r) =>
			r.totalQuestions ? (r.score / r.totalQuestions) * 100 : 0,
		);
		const average = scores.length
			? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
			: 0;

		const nextExam = exams.find((exam) => !resultsMap.has(exam.id));

		if (byId('heroTotalExams')) byId('heroTotalExams').textContent = total;
		if (byId('heroCompletedExams'))
			byId('heroCompletedExams').textContent = completed;
		if (byId('heroAverageScore'))
			byId('heroAverageScore').textContent = `${average}%`;
		if (byId('heroNextExam'))
			byId('heroNextExam').textContent = nextExam ? nextExam.name : 'All done';
	}

	function renderExamCards(exams, resultsMap) {
		const grid = byId('studentExamGrid');
		if (!grid) return;

		const filtered = exams.filter((exam) => {
			const completed = resultsMap.has(exam.id);
			if (state.filter === 'completed') return completed;
			if (state.filter === 'available') return !completed;
			return true;
		});

		if (filtered.length === 0) {
			grid.innerHTML =
				'<div class="empty-state">No exams found for this filter.</div>';
			return;
		}

		grid.innerHTML = filtered
			.map((exam) => {
				const result = resultsMap.get(exam.id);
				const completed = Boolean(result);
				const totalQuestions =
					result?.totalQuestions || exam.questions?.length || 0;
				const scorePercent = result?.totalQuestions
					? Math.round((result.score / result.totalQuestions) * 100)
					: 0;

				return `
					<div class="exam-card ${completed ? 'status-completed' : 'status-available'}">
						<div class="exam-card-header">
							<span class="exam-status">${completed ? 'Completed' : 'Available'}</span>
							<span class="exam-tag">${exam.duration ? `${exam.duration} min` : 'Exam'}</span>
						</div>
						<h3>${escapeHtml(exam.name)}</h3>
						<p>${totalQuestions} questions - ${
							exam.passingScore ? `Pass: ${exam.passingScore}%` : 'Graded'
						}</p>
						<div class="exam-performance">
							<div class="score-display">${
								completed
									? `${result.score}/${result.totalQuestions}`
									: 'Not taken'
							}</div>
							<div class="performance-bar">
								<span style="width: ${completed ? scorePercent : 0}%"></span>
							</div>
						</div>
						<button class="workspace-btn small" onclick="openExam('${exam.id}')">
							${completed ? 'Open Exam' : 'Start Exam'}
						</button>
					</div>
				`;
			})
			.join('');
	}

	function renderPerformanceList(exams, resultsMap) {
		const container = byId('studentPerformanceList');
		if (!container) return;

		if (exams.length === 0) {
			container.innerHTML =
				'<div class="empty-state">No exams assigned yet.</div>';
			return;
		}

		container.innerHTML = exams
			.map((exam) => {
				const result = resultsMap.get(exam.id);
				const percent = result?.totalQuestions
					? Math.round((result.score / result.totalQuestions) * 100)
					: 0;
				return `
					<div class="performance-row">
						<div>
							<div class="performance-title">${escapeHtml(exam.name)}</div>
							<div class="performance-subtitle">${
								result
									? `Score ${result.score}/${result.totalQuestions}`
									: 'Not attempted'
							}</div>
						</div>
						<div class="performance-metric">
							<span>${result ? `${percent}%` : '-'}</span>
							<div class="performance-bar">
								<span style="width: ${percent}%"></span>
							</div>
						</div>
					</div>
				`;
			})
			.join('');
	}

	function getScorePercent(score, totalQuestions) {
		if (!Number.isFinite(score) || !Number.isFinite(totalQuestions)) return 0;
		if (totalQuestions <= 0) return 0;
		return Math.max(
			0,
			Math.min(100, Math.round((score / totalQuestions) * 100)),
		);
	}

	function renderTrainingCards(trainingResults) {
		const grid = byId('studentTrainingGrid');
		if (!grid) return;

		const uniqueByExam = dedupeTrainingResultsByExam(trainingResults);
		const filtered =
			state.trainingFilter === 'recent'
				? uniqueByExam.slice(0, 6)
				: uniqueByExam;

		if (!trainingResults.length) {
			grid.innerHTML = `
				<div class="empty-state">
					No training attempts yet.
					<div style="margin-top: 10px;">
						<button class="workspace-btn small" onclick="openTrainingMode()">Start Training</button>
					</div>
				</div>
			`;
			return;
		}

		if (!filtered.length) {
			grid.innerHTML =
				'<div class="empty-state">No training attempts for this filter.</div>';
			return;
		}

		grid.innerHTML = filtered
			.map((result) => {
				const total = Number(result.totalQuestions || 0);
				const score = Number(result.score || 0);
				const percent = getScorePercent(score, total);
				const title = result.title || 'Training Quiz';
				return `
					<div class="exam-card status-completed">
						<div class="exam-card-header">
							<span class="exam-status">Completed</span>
							<span class="exam-tag">Training</span>
						</div>
						<h3>${escapeHtml(title)}</h3>
						<p>${result.date ? new Date(result.date).toLocaleString() : 'No date'}</p>
						<div class="exam-performance">
							<div class="score-display">${score}/${total || '-'}</div>
							<div class="performance-bar">
								<span style="width: ${percent}%"></span>
							</div>
						</div>
						<button class="workspace-btn small" onclick="openTrainingMode()">Start Training</button>
					</div>
				`;
			})
			.join('');
	}

	function renderTrainingPerformanceList(trainingResults) {
		const container = byId('studentTrainingPerformanceList');
		if (!container) return;

		if (!trainingResults.length) {
			container.innerHTML =
				'<div class="empty-state">No training data yet. Complete a training quiz to see progress.</div>';
			return;
		}

		const validScores = trainingResults.filter(
			(item) =>
				Number.isFinite(Number(item.score)) &&
				Number.isFinite(Number(item.totalQuestions)) &&
				Number(item.totalQuestions) > 0,
		);
		const percents = validScores.map((item) =>
			getScorePercent(Number(item.score), Number(item.totalQuestions)),
		);
		const average = percents.length
			? Math.round(
					percents.reduce((sum, value) => sum + value, 0) / percents.length,
				)
			: 0;
		const best = percents.length ? Math.max(...percents) : 0;

		const summaryRows = `
			<div class="performance-row">
				<div>
					<div class="performance-title">Total Attempts</div>
					<div class="performance-subtitle">Completed training sessions</div>
				</div>
				<div class="performance-metric"><span>${trainingResults.length}</span></div>
			</div>
			<div class="performance-row">
				<div>
					<div class="performance-title">Average Score</div>
					<div class="performance-subtitle">Across all scored attempts</div>
				</div>
				<div class="performance-metric">
					<span>${average}%</span>
					<div class="performance-bar"><span style="width: ${average}%"></span></div>
				</div>
			</div>
			<div class="performance-row">
				<div>
					<div class="performance-title">Best Score</div>
					<div class="performance-subtitle">Highest training result</div>
				</div>
				<div class="performance-metric">
					<span>${best}%</span>
					<div class="performance-bar"><span style="width: ${best}%"></span></div>
				</div>
			</div>
		`;

		const attemptsRows = trainingResults
			.slice(0, 6)
			.map((result, index) => {
				const total = Number(result.totalQuestions || 0);
				const score = Number(result.score || 0);
				const percent = getScorePercent(score, total);
				return `
					<div class="performance-row">
						<div>
							<div class="performance-title">Attempt ${trainingResults.length - index}</div>
							<div class="performance-subtitle">${
								result.date ? new Date(result.date).toLocaleString() : ''
							}</div>
						</div>
						<div class="performance-metric">
							<span>${score}/${total || '-'}</span>
							<div class="performance-bar"><span style="width: ${percent}%"></span></div>
						</div>
					</div>
				`;
			})
			.join('');

		window.safeSetHTML ? window.safeSetHTML(container, summaryRows + attemptsRows, true) : (container.innerHTML = summaryRows + attemptsRows);
	}

	function renderMessages(context) {
		const container = byId('studentMessages');
		if (!container) return;
			const messages = (function() { var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo; return r ? r.getValue_sync('teacher_messages', []) : JSON.parse(localStorage.getItem('teacherMessages') || '[]'); })();
		const filtered = messages.filter((message) => {
			if (!message) return false;
			if (!context.classRecord) return false;
			return (
				!message.classId ||
				message.classId === context.classRecord.id ||
				message.className === context.classRecord.name
			);
		});

		if (filtered.length === 0) {
			container.innerHTML =
				'<div class="empty-state">No messages yet. Check back soon.</div>';
			return;
		}

		container.innerHTML = filtered
			.slice(0, 6)
			.map(
				(message) => `
				<div class="message-card">
					<div class="message-title">${escapeHtml(message.title || 'Message')}</div>
					<div class="message-body">${escapeHtml(message.message || '')}</div>
					<div class="message-meta">${
						message.teacherName ? `By ${escapeHtml(message.teacherName)}` : ''
					} - ${message.date ? new Date(message.date).toLocaleDateString() : ''}
					</div>
				</div>
			`,
			)
			.join('');
	}

	function renderAssignments(exams, resultsMap) {
		const container = byId('studentAssignments');
		if (!container) return;

			const assignments = (function() { var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo; return r ? r.getValue_sync('teacher_assignments', []) : JSON.parse(localStorage.getItem('teacherAssignments') || '[]'); })();

		if (assignments.length > 0) {
			container.innerHTML = assignments
				.slice(0, 6)
				.map(
					(item) => `
				<div class="assignment-card">
					<div class="assignment-title">${escapeHtml(item.title || 'Assignment')}</div>
					<div class="assignment-body">${escapeHtml(item.description || '')}</div>
					<div class="assignment-meta">${
						item.dueDate
							? `Due ${new Date(item.dueDate).toLocaleDateString()}`
							: ''
					}</div>
				</div>
			`,
				)
				.join('');
			return;
		}

		const pending = exams.filter((exam) => !resultsMap.has(exam.id));
		if (pending.length === 0) {
			container.innerHTML =
				'<div class="empty-state">You are all caught up.</div>';
			return;
		}

		container.innerHTML = pending
			.slice(0, 6)
			.map(
				(exam) => `
				<div class="assignment-card">
					<div class="assignment-title">${escapeHtml(exam.name)}</div>
					<div class="assignment-body">Complete this exam to unlock your performance insights.</div>
					<div class="assignment-meta">${
						exam.duration ? `${exam.duration} min` : 'Exam'
					}</div>
				</div>
			`,
			)
			.join('');
	}

	function getGameResults(context) {
		let results = [];
		try {
			results = window.__DI_CONTAINER__.repo.getAll_sync('results');
		} catch (e) {
			results = [];
		}
		const userId = String(context?.user?.id || '').trim();
		const studentNumber = String(
			context?.user?.studentNumber || context?.identity?.numero || '',
		).trim();
		const classId = String(
			context?.identity?.classId ||
				context?.classRecord?.id ||
				context?.user?.classId ||
				'',
		).trim();
		const className = String(
			context?.identity?.class ||
				context?.classRecord?.name ||
				context?.user?.className ||
				'',
		)
			.trim()
			.toLowerCase();
		const identityName = String(
			context?.identity?.name ||
				context?.user?.name ||
				context?.user?.username ||
				'',
		)
			.trim()
			.toLowerCase();
		const byLobbyKey = new Map();
		results.forEach((result, index) => {
			if (!result || typeof result !== 'object') return;
			const looksLikeGameResult =
				Boolean(result.gameId) ||
				String(result.mode || '').toLowerCase() === 'game' ||
				String(result.gameMode || '').toLowerCase() === 'game';
			if (!looksLikeGameResult) return;

			const resultUserId = String(result.userId || '').trim();
			const resultStudentNumber = String(
				result.studentNumber || result.numero || '',
			).trim();
			const resultClassId = String(result.classId || '').trim();
			const resultClassName = String(result.class || result.className || '')
				.trim()
				.toLowerCase();
			const resultName = String(result.studentName || result.name || '')
				.trim()
				.toLowerCase();

			let belongsToCurrentStudent = false;
			if (userId && resultUserId) {
				belongsToCurrentStudent = resultUserId === userId;
			} else if (studentNumber && resultStudentNumber) {
				const classMatches =
					(classId && resultClassId === classId) ||
					(className && resultClassName === className) ||
					(!classId && !className);
				belongsToCurrentStudent =
					resultStudentNumber === studentNumber && classMatches;
			} else if (identityName && resultName) {
				belongsToCurrentStudent = resultName === identityName;
			}
			if (!belongsToCurrentStudent) return;

			const score = Number(result.score);
			const scoreLabel = Number.isFinite(score) ? `${score} pts` : '0 pts';
			const rankValue = String(result.rank || '').trim();
			const rankLabel =
				rankValue && rankValue !== '-' ? `Rank ${rankValue}` : '';
			const outcomeLabel = String(result.label || '').trim();
			const summary = [outcomeLabel, rankLabel, scoreLabel]
				.filter(Boolean)
				.join(' - ');
			const gameName = String(result.gameName || 'Game').trim() || 'Game';
			const lobbyLabel = String(result.lobbyLabel || '').trim();
			const key = `${result.gameId || 'game'}::${result.lobbyId || index}`;
			const existing = byLobbyKey.get(key);
			const entry = {
				id: key,
				type: lobbyLabel ? `${gameName} (${lobbyLabel})` : gameName,
				score: summary || scoreLabel,
				date: result.date || result.savedAt || '',
			};
			if (!existing) {
				byLobbyKey.set(key, entry);
				return;
			}
			const existingDate = new Date(existing.date || 0).getTime();
			const currentDate = new Date(entry.date || 0).getTime();
			if (currentDate >= existingDate) {
				byLobbyKey.set(key, entry);
			}
		});
		return Array.from(byLobbyKey.values()).sort(
			(a, b) => new Date(b.date || 0) - new Date(a.date || 0),
		);
	}

	function renderResultsList(context) {
		const container = byId('studentResults');
		if (!container) return;
		if (!context) {
			container.innerHTML = '<div class="empty-state">No results yet.</div>';
			return;
		}

		const trainingResults = getTrainingResults(context.identity);
		const examResults = collectExamResults(context.identity);
		const gameResults = getGameResults(context);
		const allResults = [
			...trainingResults.map((r) => ({
				type: r.title || 'Training',
				score: `${r.score}/${r.totalQuestions}`,
				date: r.date,
			})),
			...examResults.map((r) => ({
				type: r.examName || 'Exam',
				score: `${r.score}/${r.totalQuestions}`,
				date: r.date,
			})),
			...gameResults,
		];

		allResults.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

		if (allResults.length === 0) {
			container.innerHTML = '<div class="empty-state">No results yet.</div>';
			return;
		}

		container.innerHTML = allResults
			.slice(0, 6)
			.map(
				(result) => `
				<div class="result-row">
					<div>
						<div class="result-title">${escapeHtml(result.type)}</div>
						<div class="result-subtitle">${
							result.date ? new Date(result.date).toLocaleString() : ''
						}</div>
					</div>
					<div class="result-score">${escapeHtml(result.score)}</div>
				</div>
			`,
			)
			.join('');
	}

	function getStudentClassId(context) {
		return (
			context.identity.classId ||
			context.classRecord?.id ||
			context.user.classId ||
			''
		);
	}

	function getStudentClassAccessKeys(context) {
		const keys = new Set();
		[
			context?.identity?.classId,
			context?.classRecord?.id,
			context?.user?.classId,
			context?.identity?.class,
			context?.classRecord?.name,
			context?.user?.className,
		]
			.map((value) => String(value || '').trim())
			.filter(Boolean)
			.forEach((value) => {
				keys.add(value);
				keys.add(value.toLowerCase());
			});
		return keys;
	}

	function gameMatchesStudentClass(game, context) {
		const classKeys = getStudentClassAccessKeys(context);
		const gameClassIds = Array.isArray(game?.classIds)
			? game.classIds
					.map((value) => String(value || '').trim())
					.filter(Boolean)
			: [];
		if (!gameClassIds.length || !classKeys.size) return true;
		if (
			getParticipant(game?.session || {}, context?.user?.id) ||
			String(game?.ownerId || '').trim() === String(context?.user?.id || '').trim()
		) {
			return true;
		}
		return gameClassIds.some((value) => {
			const trimmed = String(value || '').trim();
			return classKeys.has(trimmed) || classKeys.has(trimmed.toLowerCase());
		});
	}

	function getAvailableGames(context) {
		return getGamesStore().filter((game) => {
			if (!game || !game.id) return false;
			if (isTournamentManagedGame(game)) return false;
			return gameMatchesStudentClass(game, context);
		});
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

	function getGameLobbyExpectedPlayers(game, tournament = null) {
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
		const activeTournament =
			tournament && String(tournament?.id || '').trim()
				? tournament
				: getActiveTournamentRecord();
		const sameTournament =
			String(activeTournament?.id || '').trim() ===
			String(game?.tournamentContext?.tournamentId || '').trim();
		const participantCount = sameTournament
			? normalizeTournamentParticipants(activeTournament).length
			: 0;
		return Math.max(configuredTarget, tournamentTarget, participantCount, 2);
	}

	function getParticipant(session, userId) {
		return (
			session?.participants?.find((p) => sameUserIdValue(p?.userId, userId)) ||
			null
		);
	}

	function getTeamName(game, teamId) {
		const teamNames = game.settings?.teamNames || { a: 'Team A', b: 'Team B' };
		return teamId === 'team-b' ? teamNames.b : teamNames.a;
	}

	function buildGameScope(game, context) {
		if (!game) return null;
		const classIds = Array.isArray(game.classIds)
			? game.classIds.filter(Boolean)
			: [];
		if (!classIds.length && context?.user?.classId) {
			classIds.push(context.user.classId);
		}
		return {
			type: 'game',
			gameId: game.id,
			classIds,
			allowAll: classIds.length === 0,
		};
	}

	function getCategoriesStore() {
		try {
			return window.__DI_CONTAINER__.repo.getAll_sync('categories');
		} catch (e) {
			return [];
		}
	}

	function buildCategoryMap() {
		const map = new Map();
		getCategoriesStore().forEach((cat) => {
			const id = String(cat.id || '').trim();
			const name = String(cat.name || '').trim();
			if (id) map.set(id, name || id);
			if (name) map.set(name.toLowerCase(), name);
		});
		return map;
	}

	function getQuestionCategoryLabel(question, categoryMap) {
		const raw = String(question.categoryId || question.category || '').trim();
		if (!raw) return 'Uncategorized';
		if (categoryMap.has(raw)) return categoryMap.get(raw);
		const lower = raw.toLowerCase();
		if (categoryMap.has(lower)) return categoryMap.get(lower);
		return raw;
	}

	const CARD_SUITS = [
		{ symbol: '\u2660', color: 'black' },
		{ symbol: '\u2665', color: 'red' },
		{ symbol: '\u2666', color: 'red' },
		{ symbol: '\u2663', color: 'black' },
	];

	function getSuitForCard(cardId) {
		const str = String(cardId || '');
		let hash = 0;
		for (let i = 0; i < str.length; i += 1) {
			hash = (hash + str.charCodeAt(i) * (i + 1)) % CARD_SUITS.length;
		}
		return CARD_SUITS[hash] || CARD_SUITS[0];
	}

	function formatQuestionType(type) {
		if (!type) return 'Multiple Choice';
		return String(type).replace(/-/g, ' ');
	}

	function normalizePreviewAnswerValue(value) {
		if (value === null || value === undefined) return '';
		if (Array.isArray(value)) {
			return value
				.map((item) => normalizePreviewAnswerValue(item))
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
				const raw = normalizePreviewAnswerValue(value?.[field]);
				if (raw) return raw;
			}
			try {
				const json = JSON.stringify(value);
				return json && json !== '{}' ? json : '';
			} catch (e) {
				return '';
			}
		}
		return String(value).trim();
	}

	function getCardPreviewAnswerText(question) {
		if (!question || typeof question !== 'object') {
			return 'No answer key available';
		}
		const directCandidates = [
			question?.answer,
			question?.correctAnswer,
			question?.correct,
			question?.expectedAnswer,
			question?.solution,
		];
		for (const candidate of directCandidates) {
			const normalized = normalizePreviewAnswerValue(candidate);
			if (normalized) return normalized;
		}
		const matchingPairs = extractMatchingPairs(question);
		if (matchingPairs.length) {
			return matchingPairs
				.map((pair) => `${pair.left} -> ${pair.right}`)
				.join(' | ');
		}
		const fillMap = parseFillBlankAnswer(
			question?.answer || question?.correctAnswer || '',
		);
		const fillKeys = Object.keys(fillMap);
		if (fillKeys.length) {
			return fillKeys
				.map((blankId) => {
					const entries = Array.isArray(fillMap[blankId])
						? fillMap[blankId]
						: [];
					return `${blankId}: ${entries.join(' / ')}`;
				})
				.join(' | ');
		}
		const rawChoices = Array.isArray(question?.choices)
			? question.choices
			: Array.isArray(question?.options)
				? question.options
				: [];
		const correctChoices = rawChoices
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return '';
				const isCorrect =
					Boolean(entry.isCorrect) ||
					Boolean(entry.correct) ||
					String(entry.status || '').toLowerCase() === 'correct';
				if (!isCorrect) return '';
				return normalizePreviewAnswerValue(
					entry.text ??
						entry.label ??
						entry.value ??
						entry.option ??
						entry.choice,
				);
			})
			.filter(Boolean);
		if (correctChoices.length) {
			return correctChoices.join(' | ');
		}
		return 'No answer key available';
	}

	function formatDifficulty(value) {
		if (!value) return 'Medium';
		const text = String(value);
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function normalizeGameTypeValue(type) {
		const raw = String(type || '')
			.trim()
			.toLowerCase();
		if (!raw) return 'race';
		if (
			raw === 'cards-draw' ||
			raw === 'card-draw' ||
			raw === 'card draw' ||
			(raw.includes('card') && raw.includes('draw')) ||
			(raw.includes('card') && raw.includes('blind'))
		) {
			return 'cards-draw';
		}
		if (
			raw === 'sprint-race' ||
			raw === 'sprint race' ||
			(raw.includes('sprint') && raw.includes('race'))
		) {
			return 'sprint-race';
		}
		if (raw.includes('card')) return 'cards';
		if (raw.includes('hot')) return 'hot-potato';
		if (raw.includes('survivor')) return 'last-survivor';
		return 'race';
	}

	function parseTimestampMs(value) {
		if (value === null || value === undefined || value === '') return null;
		const numeric = Number(value);
		if (Number.isFinite(numeric) && numeric > 0) {
			// Treat 10-digit timestamps as seconds.
			return numeric < 1e11 ? numeric * 1000 : numeric;
		}
		const parsed = Date.parse(String(value));
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
		return null;
	}

	function filterAnswersForCurrentRound(
		answers,
		startedAt,
		toleranceMs = 1000,
	) {
		const list = Array.isArray(answers) ? answers : [];
		const startedMs = parseTimestampMs(startedAt);
		if (!Number.isFinite(startedMs) || startedMs <= 0) return list;
		return list.filter((entry) => {
			const answeredMs = parseTimestampMs(entry?.answeredAt);
			if (!Number.isFinite(answeredMs) || answeredMs <= 0) return true;
			return answeredMs + Math.max(0, Number(toleranceMs) || 0) >= startedMs;
		});
	}

	function normalizeUserIdValue(value) {
		return String(value || '')
			.trim()
			.toLowerCase();
	}

	function normalizeCardQuestionIdValue(value) {
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

	function sameCardQuestionIdValue(left, right) {
		const normalizedLeft = normalizeCardQuestionIdValue(left).toLowerCase();
		const normalizedRight = normalizeCardQuestionIdValue(right).toLowerCase();
		return Boolean(
			normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
		);
	}

	function sameUserIdValue(left, right) {
		const normalizedLeft = normalizeUserIdValue(left);
		const normalizedRight = normalizeUserIdValue(right);
		return Boolean(
			normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
		);
	}

	function getNormalizedQuestionIdValue(value) {
		return normalizeCardQuestionIdValue(value);
	}

	function sameQuestionIdValue(left, right) {
		return sameCardQuestionIdValue(left, right);
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
			'instruction',
			'content',
			'value',
			'label',
			'statement',
		];
		for (const key of candidateKeys) {
			if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
			const resolved = extractQuestionTextCandidate(value[key], depth + 1);
			if (resolved) return resolved;
		}
		return '';
	}

	function getGameQuestionPrompt(question) {
		if (!question || typeof question !== 'object') return '';
		const directCandidates = [
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
		let fallbackPrompt = '';
		for (const candidate of directCandidates) {
			const resolved = extractQuestionTextCandidate(candidate);
			if (!resolved) continue;
			if (!fallbackPrompt) fallbackPrompt = resolved;
			if (!isPlaceholder(resolved)) return resolved;
		}
		return fallbackPrompt;
	}

	function getScoreDeltaForViewer(gameId, viewerId, currentScore) {
		const normalizedViewerId = normalizeUserIdValue(viewerId);
		const normalizedGameId = String(gameId || '').trim();
		const scoreValue = Number(currentScore);
		if (
			!normalizedViewerId ||
			!normalizedGameId ||
			!Number.isFinite(scoreValue)
		) {
			return 0;
		}
		const scoreKey = `${normalizedGameId}:${normalizedViewerId}`;
		const previousScore = Number(state.lastViewerScores[scoreKey]);
		state.lastViewerScores[scoreKey] = scoreValue;
		if (!Number.isFinite(previousScore)) return 0;
		if (scoreValue <= previousScore) return 0;
		return scoreValue - previousScore;
	}

	function getUserHandById(hands, userId) {
		if (!hands || typeof hands !== 'object') return [];
		const normalizeHand = (hand) =>
			Array.isArray(hand)
				? hand
						.map((entry) => normalizeCardQuestionIdValue(entry))
						.filter(Boolean)
				: [];
		const direct = hands[userId];
		if (Array.isArray(direct)) return normalizeHand(direct);
		const normalizedUserId = normalizeUserIdValue(userId);
		if (!normalizedUserId) return [];
		const mappedKey = Object.keys(hands).find((key) =>
			sameUserIdValue(key, normalizedUserId),
		);
		if (!mappedKey) return [];
		const mappedHand = hands[mappedKey];
		return normalizeHand(mappedHand);
	}

	function getViewerIdentityTokens(context) {
		const user = context?.user || {};
		return [
			normalizeUserIdValue(user?.name),
			normalizeUserIdValue(user?.username),
		].filter(Boolean);
	}

	function participantMatchesViewerIdentity(participant, viewerTokens) {
		if (!participant || !Array.isArray(viewerTokens) || !viewerTokens.length) {
			return false;
		}
		const participantTokens = [
			normalizeUserIdValue(participant?.name),
			normalizeUserIdValue(participant?.username),
		].filter(Boolean);
		return participantTokens.some((token) => viewerTokens.includes(token));
	}

	function matchesViewerSessionParticipant(session, candidateUserId, context) {
		if (sameUserIdValue(candidateUserId, context?.user?.id)) return true;
		const candidateParticipant = getParticipant(session, candidateUserId);
		if (!candidateParticipant) return false;
		const viewerTokens = getViewerIdentityTokens(context);
		return participantMatchesViewerIdentity(candidateParticipant, viewerTokens);
	}

	function getViewerHandForCardState(session, cardState, context) {
		const hands = cardState?.hands || {};
		let hand = getUserHandById(hands, context?.user?.id);
		if (hand.length) return hand;
		const viewerTokens = getViewerIdentityTokens(context);
		if (!viewerTokens.length) return hand;
		const fallbackParticipant = (session?.participants || []).find(
			(participant) =>
				participantMatchesViewerIdentity(participant, viewerTokens),
		);
		if (!fallbackParticipant?.userId) return hand;
		return getUserHandById(hands, fallbackParticipant.userId);
	}

	function toPositiveNumber(value, fallback) {
		const direct = Number(value);
		if (Number.isFinite(direct) && direct > 0) return direct;
		const compact = String(value ?? '').replace(/[^0-9.]/g, '');
		const parsed = Number(compact);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
		return fallback;
	}

	function formatReadableSeconds(value, options = {}) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0) {
			return String(options.fallback || '0s');
		}
		const roundedSeconds = Math.max(Math.ceil(numeric), 0);
		const hours = Math.floor(roundedSeconds / 3600);
		const minutes = Math.floor((roundedSeconds % 3600) / 60);
		const seconds = roundedSeconds % 60;
		if (hours > 0) {
			return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
		}
		if (minutes > 0) {
			return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
		}
		if (
			options.allowDecimal === true &&
			numeric < 10 &&
			Math.abs(numeric - roundedSeconds) > 0.05
		) {
			return `${numeric.toFixed(1)}s`;
		}
		return `${roundedSeconds}s`;
	}

	function formatReadableDurationMs(value, options = {}) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0) {
			return String(options.fallback || '0s');
		}
		if (numeric < 1000) {
			return `${Math.round(numeric)}ms`;
		}
		return formatReadableSeconds(numeric / 1000, {
			allowDecimal: options.allowDecimal === true,
			fallback: options.fallback || '0s',
		});
	}

	function formatTimerCardValue(
		startedAt,
		limitSeconds,
		idleLabel = 'Ready',
		unitLabel = '',
	) {
		const normalizedLimit = Number(limitSeconds);
		if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
			return {
				label: idleLabel || 'No limit',
				running: false,
				startedAt: null,
				limitSeconds: null,
				remainingSeconds: null,
				unitLabel: '',
			};
		}
		const started = parseTimestampMs(startedAt);
		if (!Number.isFinite(started) || started <= 0) {
			return {
				label: idleLabel,
				running: false,
				startedAt: null,
				limitSeconds: normalizedLimit,
				remainingSeconds: null,
				unitLabel: String(unitLabel || '').trim(),
			};
		}
		const elapsedMs = Date.now() - started;
		const remainingSeconds = Math.max(
			Math.ceil(normalizedLimit - elapsedMs / 1000),
			0,
		);
		const normalizedUnitLabel = String(unitLabel || '').trim();
		const remainingLabel = formatReadableSeconds(remainingSeconds, {
			allowDecimal: false,
			fallback: '0s',
		});
		const totalLabel = formatReadableSeconds(normalizedLimit, {
			allowDecimal: false,
			fallback: '0s',
		});
		return {
			label: normalizedUnitLabel
				? `${remainingLabel} / ${normalizedUnitLabel}`
				: `${remainingLabel} / ${totalLabel}`,
			running: true,
			startedAt: started,
			limitSeconds: normalizedLimit,
			remainingSeconds,
			unitLabel: normalizedUnitLabel,
		};
	}

	function getActiveSpecialRuleBadges(
		game,
		normalizedType = normalizeGameTypeValue(game?.type),
	) {
		const rules = game?.settings?.gameRules || {};
		const badges = [];
		if (rules.mirrorCard) badges.push({ id: 'mirror', label: 'Mirror' });
		if (rules.timeWarp) badges.push({ id: 'time-warp', label: 'Time Warp' });
		if (rules.doubleOrNothing) {
			badges.push({ id: 'double-or-nothing', label: 'Double or Nothing' });
		}
		if (rules.shieldCard) badges.push({ id: 'shield', label: 'Shield' });
		if (rules.freezeCard) badges.push({ id: 'freeze', label: 'Freeze' });
		if (rules.stealCard) badges.push({ id: 'steal', label: 'Steal' });
		if (rules.fogCard) badges.push({ id: 'fog', label: 'Fog' });
		if (rules.comboBreakerCard)
			badges.push({ id: 'combo-breaker', label: 'Combo Breaker' });
		if (rules.overclockCard)
			badges.push({ id: 'overclock', label: 'Overclock' });
		if (rules.streakMultiplier) {
			badges.push({ id: 'streak-multiplier', label: 'On Fire' });
		}
		if (rules.bountyBonus)
			badges.push({ id: 'bounty-bonus', label: 'Bounty Bonus' });
		if (rules.teamBetting)
			badges.push({ id: 'team-betting', label: 'Team Betting' });
		if (rules.suddenDeath)
			badges.push({ id: 'sudden-death', label: 'Sudden Death' });
		if (rules.hintCost) badges.push({ id: 'hint-cost', label: 'Hint Cost' });
		if (
			(normalizedType === 'cards' || normalizedType === 'cards-draw') &&
			(game?.settings?.autoPlayTurnTimeoutCard ??
				rules.autoPlayTimeoutCard ??
				true)
		) {
			badges.push({
				id: 'auto-play-timeout-card',
				label: 'Auto-Play Timeout Card',
			});
		}
		if (normalizedType === 'hot-potato') {
			if (rules.hotPotato?.autoRotate) {
				badges.push({ id: 'auto-rotate', label: 'Auto Rotate' });
			}
			if (rules.hotPotato?.showCountdown) {
				badges.push({ id: 'countdown', label: 'Countdown' });
			}
		}
		if (normalizedType === 'last-survivor') {
			if (rules.lastSurvivor?.eliminateOnFirstWrong) {
				badges.push({ id: 'elimination', label: 'Elimination' });
			}
			if (Number.isFinite(Number(rules.lastSurvivor?.bonusPoints))) {
				badges.push({
					id: 'survivor-bonus',
					label: `Survivor Bonus +${Number(rules.lastSurvivor.bonusPoints)}`,
				});
			}
		}
		return badges;
	}

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

	function getSpecialCardLabel(specialCardId) {
		if (specialCardId === 'mirror') return 'Mirror';
		if (specialCardId === 'time-warp') return 'Time Warp';
		if (specialCardId === 'double-or-nothing') return 'Double or Nothing';
		if (specialCardId === 'shield') return 'Shield';
		if (specialCardId === 'freeze') return 'Freeze';
		if (specialCardId === 'steal') return 'Steal';
		if (specialCardId === 'fog') return 'Fog';
		if (specialCardId === 'combo-breaker') return 'Combo Breaker';
		if (specialCardId === 'overclock') return 'Overclock';
		return '';
	}

	function getSpecialCardStyleClass(
		specialCardId,
		prefix = 'special-card-btn--',
	) {
		const normalized = normalizeSpecialCardId(specialCardId);
		if (!normalized) return '';
		return `${prefix}${normalized}`;
	}

	function getUsedSpecialCardsForGame(game) {
		if (!game) return new Set();
		const usedList = Array.isArray(game?.session?.card?.usedSpecialCards)
			? game.session.card.usedSpecialCards
			: [];
		return new Set(
			usedList.map((id) => normalizeSpecialCardId(id)).filter(Boolean),
		);
	}

	function isSpecialCardEnabledForGame(game, specialCardId) {
		const normalized = normalizeSpecialCardId(specialCardId);
		if (!normalized) return false;
		const rules = game?.settings?.gameRules || {};
		if (normalized === 'mirror') return Boolean(rules.mirrorCard);
		if (normalized === 'time-warp') return Boolean(rules.timeWarp);
		if (normalized === 'double-or-nothing')
			return Boolean(rules.doubleOrNothing);
		if (normalized === 'shield') return Boolean(rules.shieldCard);
		if (normalized === 'freeze') return Boolean(rules.freezeCard);
		if (normalized === 'steal') return Boolean(rules.stealCard);
		if (normalized === 'fog') return Boolean(rules.fogCard);
		if (normalized === 'combo-breaker') return Boolean(rules.comboBreakerCard);
		if (normalized === 'overclock') return Boolean(rules.overclockCard);
		return false;
	}

	function isSpecialCardAvailableForGame(game, specialCardId) {
		const normalized = normalizeSpecialCardId(specialCardId);
		if (!normalized) return false;
		if (!isSpecialCardEnabledForGame(game, normalized)) return false;
		return !getUsedSpecialCardsForGame(game).has(normalized);
	}

	function getCardSpecialCardCatalog(game) {
		const rules = game?.settings?.gameRules || {};
		const usedSpecialCards = getUsedSpecialCardsForGame(game);
		const list = [];
		if (rules.mirrorCard) {
			const id = 'mirror';
			list.push({
				id,
				label: 'Mirror',
				description: 'Wrong answer gives the attacker double points.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.timeWarp) {
			const id = 'time-warp';
			list.push({
				id,
				label: 'Time Warp',
				description: 'Target timer is reduced for this card.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.doubleOrNothing) {
			const id = 'double-or-nothing';
			list.push({
				id,
				label: 'Double or Nothing',
				description: 'This card is worth double points.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.shieldCard) {
			const id = 'shield';
			list.push({
				id,
				label: 'Shield',
				description: 'Wrong answer keeps this card in your deck.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.freezeCard) {
			const id = 'freeze';
			list.push({
				id,
				label: 'Freeze',
				description: 'Target timer is heavily reduced for this card.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.stealCard) {
			const id = 'steal';
			list.push({
				id,
				label: 'Steal',
				description: 'If target misses, steal one random card from their deck.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.fogCard) {
			const id = 'fog';
			list.push({
				id,
				label: 'Fog',
				description:
					'Question text and options are visually obscured for target.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.comboBreakerCard) {
			const id = 'combo-breaker';
			list.push({
				id,
				label: 'Combo Breaker',
				description:
					'Target reward is reduced on correct; owner bonus on wrong.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		if (rules.overclockCard) {
			const id = 'overclock';
			list.push({
				id,
				label: 'Overclock',
				description: 'Faster timer and boosted points for whoever scores.',
				themeClass: getSpecialCardStyleClass(id),
				used: usedSpecialCards.has(id),
			});
		}
		return list;
	}

	function canViewerActivateCardSpecial(game, context) {
		if (!game || game.status !== 'live') return false;
		const normalizedType = normalizeGameTypeValue(game?.type);
		if (normalizedType !== 'cards' && normalizedType !== 'cards-draw')
			return false;
		const session = ensureSession(game);
		const cardState = session.card || {};
		if (cardState.pendingCard) return false;
		const turnUserId = cardState.turnOrder?.[cardState.turnIndex] || '';
		const viewerId = normalizeUserIdValue(context?.user?.id);
		return (
			matchesViewerSessionParticipant(session, turnUserId, context) ||
			sameUserIdValue(turnUserId, viewerId)
		);
	}

	function getLobbyHowToPlaySteps(game) {
		const normalizedType = normalizeGameTypeValue(game?.type);
		const pointsPerCorrect = Number.isFinite(
			Number(game?.settings?.pointsCorrect),
		)
			? Number(game.settings.pointsCorrect)
			: 10;
		if (normalizedType === 'cards') {
			return [
				'Solve the warmup challenge to decide who starts the first turn.',
				'On your turn, pick one card from your own deck and send it to the target player.',
				'Optionally arm one special card before sending your selected card.',
				'If target answers correctly: target gets points. If wrong/timeout: owner gets points.',
				`Base points per resolved card: ${pointsPerCorrect} pts.`,
			];
		}
		if (normalizedType === 'cards-draw') {
			return [
				'Solve the warmup challenge to decide who starts the first turn.',
				'On your turn, pick one hidden card from your opponent deck.',
				'Optionally arm one special card before picking your hidden challenge.',
				'You answer the card you picked. Correct gives you points, wrong/timeout gives points to deck owner.',
				'Each player answers exactly 5 picked challenges; fastest consistent player wins.',
				`Base points per resolved card: ${pointsPerCorrect} pts.`,
			];
		}
		if (normalizedType === 'sprint-race') {
			return [
				'Each player gets their own question stream in the same lobby.',
				'You move to the next question only when your current answer is correct.',
				'Wrong answers keep you on the same question, so speed + accuracy matter.',
				'First player to finish all questions wins instantly.',
			];
		}
		if (normalizedType === 'hot-potato') {
			return [
				'The current carrier must answer before time runs out.',
				'Correct answers score points and keep the round moving.',
				'Timeout or wrong answer rotates pressure to the next player.',
				'Track the timer and answer quickly to avoid forced rotation.',
			];
		}
		if (normalizedType === 'last-survivor') {
			return [
				'Everyone answers each question under time pressure.',
				'Wrong answers can eliminate players depending on lobby rules.',
				'Last active player wins and can receive bonus points.',
				`Base points per correct answer: ${pointsPerCorrect} pts.`,
			];
		}
		return [
			'Answer each question as fast and accurately as possible.',
			'Correct answers score points and improve your ranking.',
			'Question timer and active rules can change scoring behavior.',
			`Base points per correct answer: ${pointsPerCorrect} pts.`,
		];
	}

	function renderLobbyHowToPlayGuide(game) {
		const steps = getLobbyHowToPlaySteps(game);
		if (!steps.length) return '';
		const normalizedType = normalizeGameTypeValue(game?.type);
		const specialCards =
			normalizedType === 'cards' || normalizedType === 'cards-draw'
				? getCardSpecialCardCatalog(game)
				: [];
		const specialLegend = specialCards.length
			? `
				<div class="game-howto-special-legend">
					<div class="game-howto-special-title">Special Card Colors</div>
					<div class="game-howto-special-list">
						${specialCards
							.map((card) => {
								const chipClass = getSpecialCardStyleClass(
									card.id,
									'game-howto-special-chip--',
								);
								return `<span class="game-howto-special-chip ${escapeHtml(chipClass)}">${escapeHtml(card.label)}</span>`;
							})
							.join('')}
					</div>
				</div>
			`
			: '';
		return `
			<div class="game-howto-card">
				<div class="game-howto-title">How To Play</div>
				<ol class="game-howto-steps">
					${steps
						.map(
							(step) => `<li class="game-howto-step">${escapeHtml(step)}</li>`,
						)
						.join('')}
				</ol>
				${specialLegend}
			</div>
		`;
	}

	function getSelectedSpecialCard(gameId) {
		if (!gameId) return '';
		return normalizeSpecialCardId(
			state.selectedSpecialCards?.[String(gameId)] || '',
		);
	}

	function setSelectedSpecialCard(gameId, specialCardId) {
		if (!gameId) return;
		const id = String(gameId);
		const normalized = normalizeSpecialCardId(specialCardId);
		state.selectedSpecialCards = state.selectedSpecialCards || {};
		if (!normalized) {
			delete state.selectedSpecialCards[id];
			return;
		}
		state.selectedSpecialCards[id] = normalized;
	}

	function getSelectedReminderRule(gameId) {
		if (!gameId) return '';
		return String(state.selectedReminderRules?.[String(gameId)] || '').trim();
	}

	function setSelectedReminderRule(gameId, ruleId) {
		if (!gameId) return;
		const id = String(gameId);
		const normalizedRuleId = String(ruleId || '').trim();
		state.selectedReminderRules = state.selectedReminderRules || {};
		if (!normalizedRuleId) {
			delete state.selectedReminderRules[id];
			return;
		}
		state.selectedReminderRules[id] = normalizedRuleId;
	}

	function toggleSelectedReminderRule(gameId, ruleId) {
		if (!gameId) return;
		const normalizedRuleId = String(ruleId || '').trim();
		if (!normalizedRuleId) {
			setSelectedReminderRule(gameId, '');
			return;
		}
		setSelectedReminderRule(gameId, normalizedRuleId);
	}

	function buildRuleReminderEntry(id, label, right, wrong) {
		return {
			id: String(id || '').trim(),
			label: String(label || '').trim() || 'Rule',
			right: String(right || '').trim() || 'No additional right-side rule.',
			wrong: String(wrong || '').trim() || 'No additional wrong-side rule.',
		};
	}

	function getGameRuleReminderItems(
		game,
		normalizedType = normalizeGameTypeValue(game?.type),
	) {
		const rules = game?.settings?.gameRules || {};
		const basePoints = Number.isFinite(Number(game?.settings?.pointsCorrect))
			? Number(game.settings.pointsCorrect)
			: 10;
		const reminderItems = [];
		let baseRight = `Correct answer: +${basePoints} pts.`;
		let baseWrong = 'Wrong answer or timeout: no points.';

		if (normalizedType === 'cards' || normalizedType === 'cards-draw') {
			baseRight = `Correct answer on a received card: +${basePoints} pts for you.`;
			baseWrong = `Wrong answer or timeout on a received card: +${basePoints} pts for the card owner.`;
		} else if (normalizedType === 'hot-potato') {
			const pointsPerCorrect = Number.isFinite(
				Number(rules.hotPotato?.pointsPerCorrect),
			)
				? Number(rules.hotPotato.pointsPerCorrect)
				: basePoints;
			baseRight = `Correct pass: +${pointsPerCorrect} pts.`;
			baseWrong = 'Wrong pass or timeout: no points and turn rotates.';
		}

		reminderItems.push(
			buildRuleReminderEntry('base-scoring', 'Scoring', baseRight, baseWrong),
		);

		if (
			(normalizedType === 'cards' || normalizedType === 'cards-draw') &&
			(game?.settings?.autoPlayTurnTimeoutCard ??
				rules.autoPlayTimeoutCard ??
				true)
		) {
			reminderItems.push(
				buildRuleReminderEntry(
					'auto-play-timeout-card',
					'Auto-Play Timeout Card',
					'Choose a card before the timer ends to keep control of your move.',
					'If you wait too long, one random card is auto-played for you.',
				),
			);
		}
		if (rules.mirrorCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'mirror',
					'Mirror',
					'Use Mirror to punish a wrong answer with double points to the attacker.',
					'If you are the target and miss, the attacker receives 2x points.',
				),
			);
		}
		if (rules.timeWarp) {
			reminderItems.push(
				buildRuleReminderEntry(
					'time-warp',
					'Time Warp',
					'Time Warp cuts the target timer for this challenge (minimum 5 seconds).',
					'As a target, be ready for a much shorter countdown on that card.',
				),
			);
		}
		if (rules.doubleOrNothing) {
			reminderItems.push(
				buildRuleReminderEntry(
					'double-or-nothing',
					'Double or Nothing',
					'Correct target answer grants double points on that card.',
					'Wrong or timeout gives double points to the card owner.',
				),
			);
		}
		if (rules.shieldCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'shield',
					'Shield',
					'If target answers correctly, scoring remains standard.',
					'If target answers wrong or time runs out, the owner keeps that card in deck.',
				),
			);
		}
		if (rules.freezeCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'freeze',
					'Freeze',
					'No point modifier: normal score rules still apply.',
					'Target gets a much shorter answer timer on that challenge.',
				),
			);
		}
		if (rules.stealCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'steal',
					'Steal',
					'No extra effect when target is correct.',
					'Wrong or timeout lets owner steal one random card from target.',
				),
			);
		}
		if (rules.fogCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'fog',
					'Fog',
					'No score modifier; challenge uses normal point values.',
					'Target sees obscured question UI and no hint button for this card.',
				),
			);
		}
		if (rules.comboBreakerCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'combo-breaker',
					'Combo Breaker',
					'Correct answer gives reduced points to the target.',
					'Wrong or timeout gives bonus points to the owner.',
				),
			);
		}
		if (rules.overclockCard) {
			reminderItems.push(
				buildRuleReminderEntry(
					'overclock',
					'Overclock',
					'Whoever scores on this card gets boosted points.',
					'Answer timer is reduced and pressure is higher on this challenge.',
				),
			);
		}
		if (rules.streakMultiplier) {
			reminderItems.push(
				buildRuleReminderEntry(
					'streak-multiplier',
					'On Fire',
					'Consecutive correct answers increase your score multiplier.',
					'A wrong answer resets your streak multiplier.',
				),
			);
		}
		if (rules.bountyBonus) {
			reminderItems.push(
				buildRuleReminderEntry(
					'bounty-bonus',
					'Bounty Bonus',
					'Defeating the leader can grant an extra point bonus.',
					'No bounty bonus is awarded if your answer is wrong.',
				),
			);
		}
		if (rules.teamBetting) {
			reminderItems.push(
				buildRuleReminderEntry(
					'team-betting',
					'Team Betting',
					'Correct predictions can amplify your team score.',
					'Wrong predictions can reduce the expected gain.',
				),
			);
		}
		if (rules.suddenDeath) {
			reminderItems.push(
				buildRuleReminderEntry(
					'sudden-death',
					'Sudden Death',
					'Late rounds run with tighter time limits and higher pressure.',
					'Mistakes in sudden death can quickly swing the outcome.',
				),
			);
		}
		if (rules.hintCost) {
			reminderItems.push(
				buildRuleReminderEntry(
					'hint-cost',
					'Hint Cost',
					'Using hint keeps the chance to score, but with reduced points.',
					'Hints reduce awarded points by 50% on that question.',
				),
			);
		}
		if (normalizedType === 'hot-potato' && rules.hotPotato?.autoRotate) {
			reminderItems.push(
				buildRuleReminderEntry(
					'auto-rotate',
					'Auto Rotate',
					'Turn passes automatically after each valid answer.',
					'Timeout rotates the turn immediately to the next player.',
				),
			);
		}
		if (normalizedType === 'hot-potato' && rules.hotPotato?.showCountdown) {
			reminderItems.push(
				buildRuleReminderEntry(
					'countdown',
					'Countdown',
					'Watch the pass countdown to plan faster decisions.',
					'When the countdown reaches zero, the turn is forced to rotate.',
				),
			);
		}
		if (
			normalizedType === 'last-survivor' &&
			rules.lastSurvivor?.eliminateOnFirstWrong
		) {
			reminderItems.push(
				buildRuleReminderEntry(
					'elimination',
					'Elimination',
					'Stay accurate to remain active in the survivor round.',
					'One wrong answer can eliminate you immediately.',
				),
			);
		}
		if (
			normalizedType === 'last-survivor' &&
			Number.isFinite(Number(rules.lastSurvivor?.bonusPoints))
		) {
			const bonus = Number(rules.lastSurvivor.bonusPoints);
			reminderItems.push(
				buildRuleReminderEntry(
					'survivor-bonus',
					`Survivor Bonus +${bonus}`,
					`Last remaining player earns +${bonus} bonus points.`,
					'If you are eliminated, you miss the survivor bonus round.',
				),
			);
		}

		return reminderItems;
	}

	function renderGameScoreboardInfo({
		game,
		session,
		context,
		mode = 'race',
		questionIndex = null,
		questionTotal = null,
		timerStartedAt = null,
		timerLimitSeconds = null,
		timerIdleLabel = 'Ready',
		handCount = null,
		deckRemaining = null,
		turnLabel = '',
	}) {
		const participants = Array.isArray(session?.participants)
			? session.participants
			: [];
		const me =
			participants.find((p) => sameUserIdValue(p?.userId, context?.user?.id)) ||
			null;
		const leader = participants.reduce((best, current) => {
			const bestScore = Number(best?.score) || 0;
			const currentScore = Number(current?.score) || 0;
			return !best || currentScore > bestScore ? current : best;
		}, null);
		const normalizedType = normalizeGameTypeValue(game?.type);
		const rules = game?.settings?.gameRules || {};
		const timer = formatTimerCardValue(
			timerStartedAt,
			timerLimitSeconds,
			timerIdleLabel,
			mode === 'card'
				? 'turn'
				: mode === 'sprint-race'
					? 'sprint'
					: mode === 'race' ||
						  mode === 'tiebreak' ||
						  mode === 'hot-potato' ||
						  mode === 'last-survivor'
						? 'question'
						: '',
		);
		let pointsPerCorrect = Number.isFinite(
			Number(game?.settings?.pointsCorrect),
		)
			? Number(game.settings.pointsCorrect)
			: 10;
		if (normalizedType === 'hot-potato') {
			const hotPotatoPoints = Number.isFinite(
				Number(session?.hotPotato?.pointsPerCorrect),
			)
				? Number(session.hotPotato.pointsPerCorrect)
				: Number.isFinite(Number(rules.hotPotato?.pointsPerCorrect))
					? Number(rules.hotPotato.pointsPerCorrect)
					: null;
			if (Number.isFinite(hotPotatoPoints) && hotPotatoPoints > 0) {
				pointsPerCorrect = hotPotatoPoints;
			}
		}
		const meScore = Number.isFinite(Number(me?.score)) ? Number(me.score) : 0;
		const scoreDelta = getScoreDeltaForViewer(
			game?.id,
			context?.user?.id,
			meScore,
		);
		const hasPositiveScoreDelta = Number.isFinite(scoreDelta) && scoreDelta > 0;
		const infoCards = [
			{
				label:
					mode === 'sprint-race'
						? 'Sprint Timer'
						: mode === 'card'
							? 'Turn Timer'
							: 'Question Timer',
				value: timer.label,
				isTimer: true,
				timer,
			},
			{
				label: 'Your Score',
				value: `${meScore} pts`,
				cardClass: hasPositiveScoreDelta ? 'score-pop' : '',
				valueClass: hasPositiveScoreDelta
					? 'game-info-value score-pop-value'
					: 'game-info-value',
				fxHtml: hasPositiveScoreDelta
					? `<span class="game-score-float">+${escapeHtml(String(Math.round(scoreDelta)))} pts</span>`
					: '',
			},
			{
				label: 'Round Points',
				value: `+${pointsPerCorrect} pts`,
				cardClass: hasPositiveScoreDelta ? 'round-points-pop' : '',
				valueClass: hasPositiveScoreDelta
					? 'game-info-value round-points-value'
					: 'game-info-value',
				fxHtml: hasPositiveScoreDelta
					? `<span class="game-round-float">+${escapeHtml(String(Math.round(scoreDelta)))} pts</span>`
					: '',
			},
		];
		if (leader) {
			infoCards.push({
				label: 'Leader',
				value: `${leader.name || 'Player'} (${Number(leader.score) || 0})`,
			});
		}
		if (
			Number.isFinite(Number(questionIndex)) &&
			Number.isFinite(Number(questionTotal)) &&
			Number(questionTotal) > 0
		) {
			infoCards.push({
				label: 'Question',
				value: `${Number(questionIndex)}/${Number(questionTotal)}`,
			});
		}
		if (mode === 'card') {
			if (Number.isFinite(Number(handCount))) {
				infoCards.push({
					label: 'Your Cards',
					value: String(Number(handCount)),
				});
			}
			if (Number.isFinite(Number(deckRemaining))) {
				infoCards.push({
					label: 'Deck Remaining',
					value: String(Number(deckRemaining)),
				});
			}
			if (turnLabel) {
				infoCards.push({
					label: 'Turn State',
					value: String(turnLabel),
				});
			}
		}
		if (normalizedType === 'hot-potato') {
			const turnDuration = Number.isFinite(
				Number(rules.hotPotato?.turnDuration),
			)
				? Number(rules.hotPotato.turnDuration)
				: null;
			if (turnDuration) {
				infoCards.push({
					label: 'Pass Timer',
					value: `${turnDuration}s`,
				});
			}
		}

		const cardsHtml = infoCards
			.map((card) => {
				const timerAttrs =
					card.isTimer && card.timer?.running
						? ` data-timer-limit="${card.timer.limitSeconds}" data-timer-started="${card.timer.startedAt}" data-timer-unit="${escapeHtml(card.timer.unitLabel || '')}"`
						: '';
				const timerClass = card.isTimer
					? card.timer?.running &&
						Number.isFinite(card.timer.remainingSeconds) &&
						card.timer.remainingSeconds <= 5
						? 'game-info-value game-timer-value urgent'
						: 'game-info-value game-timer-value'
					: 'game-info-value';
				const valueClass = card.valueClass || timerClass;
				const cardClass = `game-info-card ${card.isTimer ? 'timer' : ''} ${
					card.cardClass || ''
				}`.trim();
				return `
					<div class="${cardClass}">
						<span class="game-info-label">${escapeHtml(card.label)}</span>
						<span class="${valueClass}"${timerAttrs}>${escapeHtml(card.value)}</span>
						${card.fxHtml || ''}
					</div>
				`;
			})
			.join('');

		const isCardMode =
			mode === 'card' &&
			(normalizedType === 'cards' || normalizedType === 'cards-draw');
		let selectedSpecialId = '';
		let canActivateSpecial = false;
		if (isCardMode) {
			selectedSpecialId = getSelectedSpecialCard(game?.id);
			if (
				selectedSpecialId &&
				!isSpecialCardAvailableForGame(game, selectedSpecialId)
			) {
				setSelectedSpecialCard(game?.id, '');
				selectedSpecialId = '';
			}
			canActivateSpecial = canViewerActivateCardSpecial(game, context);
		}
		const rawSpecialBadges = getActiveSpecialRuleBadges(game, normalizedType);
		const specialBadges = rawSpecialBadges.filter((badge) => {
			if (!isCardMode) return true;
			const specialId = normalizeSpecialCardId(badge?.id);
			if (!specialId) return true;
			return isSpecialCardAvailableForGame(game, specialId);
		});
		const reminderItems = getGameRuleReminderItems(game, normalizedType);
		const selectedReminderRule = getSelectedReminderRule(game?.id);
		const selectedReminderExists =
			Boolean(selectedReminderRule) &&
			reminderItems.some((item) => item.id === selectedReminderRule);
		const selectedReminderVisible =
			!selectedReminderRule ||
			specialBadges.some((badge) => badge.id === selectedReminderRule);
		if (
			selectedReminderRule &&
			(!selectedReminderExists || !selectedReminderVisible)
		) {
			setSelectedReminderRule(game?.id, '');
		}
		const activeReminderRule =
			selectedReminderExists && selectedReminderVisible
				? selectedReminderRule
				: '';
		const visibleReminders = activeReminderRule
			? reminderItems.filter((item) => item.id === activeReminderRule)
			: reminderItems;
		const selectedBadge = specialBadges.find(
			(badge) => badge.id === activeReminderRule,
		);
		const reminderTitle = selectedBadge
			? `Quick Reminder - ${selectedBadge.label}`
			: 'Quick Reminder';
		const remindersHtml = (
			visibleReminders.length ? visibleReminders : reminderItems
		)
			.map(
				(reminder) => `
				<div class="rule-reminder-item">
					<div class="rule-reminder-title">${escapeHtml(reminder.label)}</div>
					<div class="rule-line">
						<span class="rule-key">Right:</span>
						<span>${escapeHtml(reminder.right)}</span>
					</div>
					<div class="rule-line">
						<span class="rule-key">Wrong:</span>
						<span>${escapeHtml(reminder.wrong)}</span>
					</div>
				</div>
			`,
			)
			.join('');

		return `
			<div class="game-info-grid">
				${cardsHtml}
			</div>
			<div class="game-special-section">
				<div class="game-info-title">Special Cards & Rules</div>
				<div class="game-special-list">
					${
						specialBadges.length
							? `
								<button
									type="button"
									class="game-special-chip ${!activeReminderRule ? 'active' : ''}"
									data-action="toggle-reminder-rule"
									data-rule-id=""
									data-special-card=""
									data-game-id="${escapeHtml(game?.id || '')}"
								>
									All Rules
								</button>
								${specialBadges
									.map((badge) => {
										const specialId = isCardMode
											? normalizeSpecialCardId(badge?.id)
											: '';
										const styleClass = specialId
											? `game-special-chip--${specialId}`
											: '';
										const isSpecialSelected =
											Boolean(specialId) && selectedSpecialId === specialId;
										const title = specialId
											? canActivateSpecial
												? `${badge.label}: click to arm this special card and show its reminder.`
												: `${badge.label}: reminder is active. Special selection unlocks on your turn.`
											: '';
										const className = `game-special-chip ${
											activeReminderRule === badge.id ? 'active' : ''
										} ${styleClass} ${
											isSpecialSelected ? 'special-selected' : ''
										}`.trim();
										return `
											<button
												type="button"
												class="${escapeHtml(className)}"
												data-action="toggle-reminder-rule"
												data-rule-id="${escapeHtml(badge.id)}"
												data-special-card="${escapeHtml(specialId)}"
												data-game-id="${escapeHtml(game?.id || '')}"
												title="${escapeHtml(title)}"
											>
												${escapeHtml(badge.label)}
											</button>
										`;
									})
									.join('')}
							`
							: '<span class="game-special-chip muted">Standard</span>'
					}
				</div>
			</div>
			<div class="game-rule-note">
				<div class="game-info-title">${escapeHtml(reminderTitle)}</div>
				${remindersHtml}
			</div>
		`;
	}

	function renderGameHeaderRows(rowsHtml) {
		const rows = String(rowsHtml || '').trim();
		if (!rows) return '';
		return `<div class="game-header-score-rows ${state.headerRowsCollapsed ? 'collapsed' : ''}">${rows}</div>`;
	}

	function renderHeaderRowsToggleControl() {
		const isCollapsed = Boolean(state.headerRowsCollapsed);
		const label = isCollapsed ? 'Expand' : 'Hide';
		const icon = isCollapsed ? '>' : 'v';
		const tip = isCollapsed ? 'Expand player rows' : 'Hide player rows';
		return `<button type="button" class="workspace-btn ghost small header-toggle-btn" data-action="toggle-header-rows" title="${tip}" data-tooltip="${tip}">${icon} ${label}</button>`;
	}

	function applyHeaderRowsToggle(stage) {
		if (!stage) return;
		const rows = stage.querySelector('.game-header-score-rows');
		if (rows) {
			rows.classList.toggle('collapsed', Boolean(state.headerRowsCollapsed));
		}
		const button = stage.querySelector(
			'button[data-action="toggle-header-rows"]',
		);
		if (button) {
			const isCollapsed = Boolean(state.headerRowsCollapsed);
			button.textContent = `${isCollapsed ? '>' : 'v'} ${isCollapsed ? 'Expand' : 'Hide'}`;
			button.title = isCollapsed ? 'Expand player rows' : 'Hide player rows';
			button.dataset.tooltip = button.title;
		}
	}

	function refreshGameScoreboardTimers() {
		const timerNodes = document.querySelectorAll(
			'.game-stage [data-timer-limit][data-timer-started]',
		);
		let hasExpiredTimer = false;
		timerNodes.forEach((node) => {
			if (!(node instanceof HTMLElement)) return;
			const limit = Number(node.dataset.timerLimit);
			const started = parseTimestampMs(node.dataset.timerStarted);
			const unitLabel = String(node.dataset.timerUnit || '').trim();
			if (!Number.isFinite(limit) || limit <= 0) return;
			if (!Number.isFinite(started) || started <= 0) return;
			const elapsedMs = Date.now() - started;
			const remainingSeconds = Math.max(Math.ceil(limit - elapsedMs / 1000), 0);
			node.textContent = unitLabel
				? `${remainingSeconds}s / ${unitLabel}`
				: `${remainingSeconds}s / ${Math.ceil(limit)}s`;
			node.classList.toggle('urgent', remainingSeconds <= 5);
			if (remainingSeconds <= 0) {
				hasExpiredTimer = true;
			}
		});
		document.querySelectorAll('.game-stage').forEach((stageNode) => {
			if (!(stageNode instanceof HTMLElement)) return;
			const hasUrgentTimer = Boolean(
				stageNode.querySelector('.game-timer-value.urgent'),
			);
			stageNode.classList.toggle('emergency', hasUrgentTimer);
		});
		return hasExpiredTimer;
	}

	function encodeDataValue(value) {
		return encodeURIComponent(String(value ?? ''));
	}

	function decodeDataValue(value) {
		try {
			return decodeURIComponent(String(value ?? ''));
		} catch (e) {
			return String(value ?? '');
		}
	}

	function normalizeAnswerToken(value) {
		return String(value || '')
			.trim()
			.replace(/\s+/g, ' ')
			.toLowerCase();
	}

	function splitChoiceAnswerTokens(value) {
		return splitAnswerTokens(value, /[|,\n;،]+/);
	}

	function hasMeaningfulGameAnswerValue(value) {
		if (value === null || value === undefined) return false;
		if (typeof value === 'boolean') return false;
		if (typeof value === 'number') return Number.isFinite(value);
		if (typeof value === 'string') return Boolean(value.trim());
		if (Array.isArray(value)) {
			return value.some((entry) => hasMeaningfulGameAnswerValue(entry));
		}
		if (typeof value === 'object') {
			return Object.keys(value).length > 0;
		}
		return false;
	}

	function normalizeImageOptionToken(value) {
		const normalized = normalizeAnswerToken(String(value || '').replace(/[_-]+/g, ' '));
		const imageMatch = normalized.match(/^(?:image|img)\s*(\d+)$/i);
		if (!imageMatch) return normalized;
		return `image ${imageMatch[1]}`;
	}

	function findQuestionOptionEntryByToken(optionEntries = [], rawToken) {
		const token = String(rawToken || '').trim();
		if (!token || !Array.isArray(optionEntries) || !optionEntries.length) {
			return null;
		}
		const normalizedToken = normalizeImageOptionToken(token);
		const directToken = normalizeAnswerToken(token);
		return (
			optionEntries.find((option, index) => {
				const optionText = String(option?.text || '').trim();
				const optionId = String(option?.id || '').trim();
				const optionNumber = String(option?.number || index + 1).trim();
				if (
					optionText &&
					normalizeImageOptionToken(optionText) === normalizedToken
				) {
					return true;
				}
				if (optionId && normalizeAnswerToken(optionId) === directToken) {
					return true;
				}
				return Boolean(
					optionNumber && normalizedToken === `image ${optionNumber}`,
				);
			}) || null
		);
	}

	function mapAnswerTokenToOptionText(rawToken, optionEntries = []) {
		const token = String(rawToken || '').trim();
		if (!token) return '';
		if (!Array.isArray(optionEntries) || !optionEntries.length) return token;

		const numeric = Number.parseInt(token, 10);
		if (
			Number.isFinite(numeric) &&
			String(numeric) === token &&
			numeric >= 1 &&
			numeric <= optionEntries.length
		) {
			return String(optionEntries[numeric - 1]?.text || token).trim() || token;
		}

		const imageTokenMatch = token.match(/^img_(\d+)$/i);
		if (imageTokenMatch) {
			const imageIndex = Number.parseInt(imageTokenMatch[1], 10);
			if (
				Number.isFinite(imageIndex) &&
				imageIndex >= 0 &&
				imageIndex < optionEntries.length
			) {
				return (
					String(optionEntries[imageIndex]?.text || token).trim() || token
				);
			}
			if (
				Number.isFinite(imageIndex) &&
				imageIndex > 0 &&
				imageIndex <= optionEntries.length
			) {
				return (
					String(optionEntries[imageIndex - 1]?.text || token).trim() || token
				);
			}
		}

		const letterMatch = token.match(/^[A-H]$/i);
		if (letterMatch) {
			const optionIndex =
				letterMatch[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
			if (optionIndex >= 0 && optionIndex < optionEntries.length) {
				return (
					String(optionEntries[optionIndex]?.text || token).trim() || token
				);
			}
		}

		const directMatch = findQuestionOptionEntryByToken(optionEntries, token);
		return String(directMatch?.text || token).trim() || token;
	}

	function splitChoiceAnswerTokensFlexible(value) {
		if (value === null || value === undefined) return [];
		if (Array.isArray(value)) {
			return value.flatMap((entry) => splitChoiceAnswerTokensFlexible(entry));
		}
		if (value && typeof value === 'object') {
			if (parseMatchingPairsAnswer(value).length) return [];
			if (Object.keys(parseFillBlankAnswer(value)).length) return [];
			const normalized = normalizePreviewAnswerValue(value);
			if (!normalized || normalized === '{}' || normalized === '[]') return [];
			return splitChoiceAnswerTokens(normalized);
		}
		return splitChoiceAnswerTokens(value);
	}

	function getQuestionExpectedAnswerValue(question) {
		const directCandidates = [
			question?.answer,
			question?.correctAnswer,
			question?.correctAnswers,
			question?.expectedAnswer,
			question?.solution,
			question?.correct,
		];
		for (const candidate of directCandidates) {
			if (hasMeaningfulGameAnswerValue(candidate)) return candidate;
		}
		const rawCollections = [
			question?.optionData,
			question?.options,
			question?.choices,
			question?.answers,
			question?.answerOptions,
		];
		const flaggedOptions = [];
		rawCollections.forEach((collection) => {
			if (!Array.isArray(collection)) return;
			collection.forEach((entry, index) => {
				if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
				const hasOptionFields =
					Object.prototype.hasOwnProperty.call(entry, 'text') ||
					Object.prototype.hasOwnProperty.call(entry, 'label') ||
					Object.prototype.hasOwnProperty.call(entry, 'value') ||
					Object.prototype.hasOwnProperty.call(entry, 'option') ||
					Object.prototype.hasOwnProperty.call(entry, 'choice') ||
					Object.prototype.hasOwnProperty.call(entry, 'image');
				if (!hasOptionFields) return;
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
				if (resolved) flaggedOptions.push(resolved);
			});
		});
		if (flaggedOptions.length === 1) return flaggedOptions[0];
		if (flaggedOptions.length > 1) return flaggedOptions.join(',');
		return '';
	}

	function getGameQuestionSelectionKey(question, options = []) {
		const normalizedId = getNormalizedQuestionIdValue(question?.id);
		if (normalizedId) {
			return String(normalizedId).toLowerCase();
		}
		const promptToken = normalizeAnswerToken(getGameQuestionPrompt(question));
		const answerToken = normalizeAnswerToken(
			normalizePreviewAnswerValue(getQuestionExpectedAnswerValue(question)),
		);
		const optionTokens = (Array.isArray(options) ? options : [])
			.map((option) =>
				normalizeAnswerToken(option?.text || option?.image || option),
			)
			.filter(Boolean)
			.join('|');
		return [promptToken, answerToken, optionTokens].filter(Boolean).join('||');
	}

	function getMultiSelectSelectionKey(gameId, questionKey) {
		const gameKey = String(gameId || '').trim();
		const normalizedQuestionKey = String(questionKey || '').trim();
		if (!gameKey || !normalizedQuestionKey) return '';
		return `${gameKey}::${normalizedQuestionKey}`;
	}

	function getSavedMultiSelectValues(gameId, questionKey) {
		const key = getMultiSelectSelectionKey(gameId, questionKey);
		const savedValues = key ? state.multiSelectSelections?.[key] : null;
		if (!Array.isArray(savedValues)) return [];
		const seen = new Set();
		const uniqueValues = [];
		savedValues.forEach((value) => {
			const normalized = normalizeAnswerToken(value);
			if (!normalized || seen.has(normalized)) return;
			seen.add(normalized);
			uniqueValues.push(String(value).trim());
		});
		return uniqueValues;
	}

	function saveMultiSelectValues(gameId, questionKey, values) {
		const key = getMultiSelectSelectionKey(gameId, questionKey);
		if (!key) return [];
		const seen = new Set();
		const uniqueValues = [];
		(values || []).forEach((value) => {
			const trimmed = String(value || '').trim();
			const normalized = normalizeAnswerToken(trimmed);
			if (!normalized || seen.has(normalized)) return;
			seen.add(normalized);
			uniqueValues.push(trimmed);
		});
		if (!uniqueValues.length) {
			delete state.multiSelectSelections[key];
			return [];
		}
		state.multiSelectSelections[key] = uniqueValues;
		return uniqueValues;
	}

	function toggleSavedMultiSelectValue(
		gameId,
		questionKey,
		value,
		forceSelected = null,
	) {
		const trimmedValue = String(value || '').trim();
		const normalizedValue = normalizeAnswerToken(trimmedValue);
		if (!normalizedValue) return [];
		const currentValues = getSavedMultiSelectValues(gameId, questionKey);
		const alreadySelected = currentValues.some(
			(entry) => normalizeAnswerToken(entry) === normalizedValue,
		);
		const shouldSelect =
			forceSelected == null ? !alreadySelected : Boolean(forceSelected);
		const nextValues = shouldSelect
			? alreadySelected
				? currentValues
				: [...currentValues, trimmedValue]
			: currentValues.filter(
					(entry) => normalizeAnswerToken(entry) !== normalizedValue,
				);
		return saveMultiSelectValues(gameId, questionKey, nextValues);
	}

	function clearSavedMultiSelectForGame(gameId) {
		const normalizedGameId = String(gameId || '').trim();
		if (!normalizedGameId) return;
		const keyPrefix = `${normalizedGameId}::`;
		Object.keys(state.multiSelectSelections || {}).forEach((key) => {
			if (key.startsWith(keyPrefix)) {
				delete state.multiSelectSelections[key];
			}
		});
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
			const answerTokens = splitChoiceAnswerTokens(answer).map((item) =>
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
				camelParts.some(
					(part) => normalizeAnswerToken(part) === normalizedAnswer,
				)
			) {
				return camelParts;
			}
		}

		return [normalizeOptionCandidate(raw)];
	}

	function normalizePairToken(value) {
		return normalizeOptionCandidate(value);
	}

	function parseMatchingPairToken(token) {
		const raw = normalizePairToken(token);
		if (!raw) return null;

		const splitBySeparator = (separatorRegex) => {
			const parts = raw
				.split(separatorRegex)
				.map((item) => normalizePairToken(item))
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
			const left = normalizePairToken(entry[0]);
			const right = normalizePairToken(entry[1]);
			if (!left || !right) return null;
			return { left, right };
		}

		const left = normalizePairToken(
			entry.left ??
				entry.term ??
				entry.key ??
				entry.source ??
				entry.prompt ??
				entry.item1 ??
				entry.a ??
				'',
		);
		const right = normalizePairToken(
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
			const inferredLeft = normalizePairToken(entry[keys[0]]);
			const inferredRight = normalizePairToken(entry[keys[1]]);
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
				const primitiveEntries = candidate
					.map((entry) =>
						typeof entry === 'string' || typeof entry === 'number'
							? normalizePairToken(entry)
							: '',
					)
					.filter(Boolean);
				if (primitiveEntries.length >= 4 && primitiveEntries.length % 2 === 0) {
					const inferred = [];
					for (let index = 0; index < primitiveEntries.length; index += 2) {
						const left = primitiveEntries[index];
						const right = primitiveEntries[index + 1];
						if (!left || !right) {
							inferred.length = 0;
							break;
						}
						inferred.push({ left, right });
					}
					if (inferred.length >= 2) {
						inferred.forEach((pair) => collected.push(pair));
						return;
					}
				}
				candidate.forEach((entry) => collect(entry, depth + 1));
				return;
			}
			if (candidate && typeof candidate === 'object') {
				const directPair = parseMatchingPairObject(candidate);
				if (directPair) {
					collected.push(directPair);
					return;
				}
				const hasKnownMetadataKeys = [
					'id',
					'type',
					'question',
					'text',
					'prompt',
					'answer',
					'correctAnswer',
					'expectedAnswer',
					'instruction',
				].some((key) => Object.prototype.hasOwnProperty.call(candidate, key));
				if (!hasKnownMetadataKeys) {
					const keyValuePairs = Object.entries(candidate)
						.map(([leftKey, rightValue]) => ({
							left: normalizePairToken(leftKey),
							right:
								typeof rightValue === 'string' || typeof rightValue === 'number'
									? normalizePairToken(rightValue)
									: '',
						}))
						.filter((pair) => pair.left && pair.right);
					if (keyValuePairs.length >= 2) {
						keyValuePairs.forEach((pair) => collected.push(pair));
						return;
					}
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
			const normalizedRaw = raw
				.replace(/\r/g, '\n')
				.replace(/\\r\\n|\\n|\\r/g, '\n')
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/&rarr;|&rightarrow;|&#8594;/gi, '\u2192')
				.replace(/&gt;/gi, '>');
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
			const parsedBeforeTokenScan = collected.length;
			tokens.forEach((token) => {
				const parsed = parseMatchingPairToken(token);
				if (parsed) collected.push(parsed);
			});
			if (collected.length === parsedBeforeTokenScan) {
				const inlinePairPattern =
					/([^|;\n]+?)\s*(?:-->|->|=>|\u2192|::|=)\s*([^|;\n]+?)(?=\s+[^|;\n]+?\s*(?:-->|->|=>|\u2192|::|=)|$)/g;
				let inlineMatch;
				while (
					(inlineMatch = inlinePairPattern.exec(flattenedArrowBlocks)) !== null
				) {
					const left = normalizePairToken(inlineMatch[1]);
					const right = normalizePairToken(inlineMatch[2]);
					if (!left || !right) continue;
					collected.push({ left, right });
				}
			}
			if (collected.length === parsedBeforeTokenScan) {
				const alternatingLines = normalizedRaw
					.split(/\n+/)
					.map((entry) => normalizePairToken(entry))
					.filter(Boolean);
				if (alternatingLines.length >= 4 && alternatingLines.length % 2 === 0) {
					const inferred = [];
					for (let index = 0; index < alternatingLines.length; index += 2) {
						const left = alternatingLines[index];
						const right = alternatingLines[index + 1];
						if (!left || !right) {
							inferred.length = 0;
							break;
						}
						inferred.push({ left, right });
					}
					if (inferred.length >= 2) {
						inferred.forEach((pair) => collected.push(pair));
					}
				}
			}
		};

		collect(value, 0);
		return dedupeMatchingPairs(collected);
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

		const optionTexts = extractQuestionOptions(question)
			.map((option) => String(option?.text || '').trim())
			.filter(Boolean);
		if (optionTexts.length >= 4 && optionTexts.length % 2 === 0) {
			const sequentialPairs = [];
			for (let index = 0; index < optionTexts.length; index += 2) {
				const left = normalizePairToken(optionTexts[index]);
				const right = normalizePairToken(optionTexts[index + 1]);
				if (!left || !right) continue;
				sequentialPairs.push({ left, right });
			}
			return dedupeMatchingPairs(sequentialPairs);
		}

		return [];
	}

	function parseFillBlankAnswer(value) {
		const result = {};
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			Object.entries(value).forEach(([blankId, answers]) => {
				const key = String(blankId).trim();
				const normalized = splitAnswerTokens(answers);
				if (key && normalized.length) {
					result[key] = normalized;
				}
			});
			return result;
		}

		const raw = String(value || '').trim();
		if (!raw) return result;
		const segments = raw
			.split('|')
			.map((segment) => segment.trim())
			.filter(Boolean);
		segments.forEach((segment) => {
			const separatorIndex = segment.indexOf(':');
			if (separatorIndex <= 0) return;
			const blankId = segment.slice(0, separatorIndex).trim();
			const answersRaw = segment.slice(separatorIndex + 1);
			const answers = splitAnswerTokens(answersRaw, /[,]/);
			if (blankId && answers.length) {
				result[blankId] = answers;
			}
		});
		return result;
	}

	function extractQuestionOptions(question) {
		const options = [];
		const isLikelyResponseEntry = (entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry))
				return false;
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
		};
		const rawAnswer = getQuestionExpectedAnswerValue(question);
		const rawSources = [];
		const collectOptionSourceEntries = (value) => {
			if (Array.isArray(value)) return value.slice();
			if (typeof value !== 'string') return [value];
			const raw = String(value || '').trim();
			if (!raw) return [];
			if (
				(raw.startsWith('[') && raw.endsWith(']')) ||
				(raw.startsWith('{') && raw.endsWith('}'))
			) {
				try {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed)) return parsed;
					if (parsed && typeof parsed === 'object') {
						if (Array.isArray(parsed.options)) return parsed.options;
						if (Array.isArray(parsed.choices)) return parsed.choices;
						if (Array.isArray(parsed.items)) return parsed.items;
						return Object.keys(parsed).length ? [parsed] : [];
					}
				} catch (e) {}
			}
			return [value];
		};
		rawSources.push(...collectOptionSourceEntries(question?.optionData));
		if (Array.isArray(question?.choices)) {
			rawSources.push(...question.choices);
		} else if (typeof question?.choices === 'string') {
			rawSources.push(...collectOptionSourceEntries(question.choices));
		}
		if (Array.isArray(question?.options)) {
			rawSources.push(...question.options);
		} else if (typeof question?.options === 'string') {
			rawSources.push(...collectOptionSourceEntries(question.options));
		}
		if (Array.isArray(question?.answers)) {
			rawSources.push(
				...question.answers.filter((entry) => !isLikelyResponseEntry(entry)),
			);
		}
		if (Array.isArray(question?.answerOptions)) {
			rawSources.push(...question.answerOptions);
		} else if (typeof question?.answerOptions === 'string') {
			rawSources.push(...collectOptionSourceEntries(question.answerOptions));
		}

		const pushOptionEntry = (entry, index) => {
			if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
				if (isLikelyResponseEntry(entry)) return;
				const textCandidates = [
					entry.text,
					entry.label,
					entry.value,
					entry.option,
					entry.choice,
					entry.answer,
					entry.content,
					entry.title,
					entry.name,
					entry.statement,
				];
				let optionText = '';
				for (const candidate of textCandidates) {
					const candidateText = String(candidate ?? '').trim();
					if (candidateText) {
						optionText = candidateText;
						break;
					}
				}
				const optionImage = String(
					entry.image ??
						entry.imageUrl ??
						entry.src ??
						entry.thumbnail ??
						entry.url ??
						'',
				).trim();
				const optionNumber = String(
					entry.number ?? entry.imageNumber ?? index + 1,
				).trim();
				const splitTextOptions =
					optionText && !optionImage
						? splitOptionText(optionText, rawAnswer)
						: [optionText];
				splitTextOptions.forEach((textValue, textIndex) => {
					const normalizedText = String(textValue || '').trim();
					const fallbackLabel = optionImage ? `Image ${optionNumber}` : '';
					const resolvedText = normalizedText || fallbackLabel;
					if (!resolvedText && !optionImage) return;
					options.push({
						text: resolvedText,
						image: optionImage,
						isImageOnly: Boolean(
							entry.isImageOnly ||
								(optionImage &&
									(!normalizedText ||
										/^(?:image|img)[-_\s]*\d+$/i.test(normalizedText))),
						),
						id: String(
							entry.id || entry.imageId || `opt_${index + textIndex + 1}`,
						),
						number: optionImage ? optionNumber : '',
						correct:
							Boolean(entry.isCorrect) ||
							Boolean(entry.correct) ||
							String(entry.status || '').toLowerCase() === 'correct',
					});
				});
				return;
			}

			const rawText = String(entry || '').trim();
			if (!rawText) return;
			const imageTokenMatch = rawText.match(/^img_(\d+)$/i);
			if (imageTokenMatch) {
				const rawIndex = Number.parseInt(imageTokenMatch[1], 10);
				const imageNumber = Number.isFinite(rawIndex) ? rawIndex + 1 : index + 1;
				options.push({
					text: `Image ${imageNumber}`,
					image: '',
					isImageOnly: false,
					id: rawText,
					number: String(imageNumber),
					correct: false,
				});
				return;
			}
			splitOptionText(rawText, rawAnswer).forEach((part, partIndex) => {
				const normalizedText = String(part || '').trim();
				if (!normalizedText) return;
				options.push({
					text: normalizedText,
					image: '',
					isImageOnly: false,
					id: `opt_${index + partIndex + 1}`,
					number: '',
					correct: false,
				});
			});
		};

		rawSources.forEach((entry, index) => {
			pushOptionEntry(entry, index);
		});

		const seen = new Set();
		return options.filter((option) => {
			const key = `${normalizeImageOptionToken(option.text)}|${option.image || ''}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function canonicalizeGameQuestionType(value) {
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
		if (
			raw.includes('match') ||
			raw.includes('pair') ||
			raw.includes('assoc')
		) {
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

	function normalizeGameQuestionType(question) {
		let raw = canonicalizeGameQuestionType(
			question?.type || question?.questionType || '',
		);
		// For code questions, the answer mechanic is determined by codeAnswerMode
		if (raw === 'code' && question?.codeAnswerMode) {
			raw = canonicalizeGameQuestionType(question.codeAnswerMode);
		}
		const promptText = String(
			getGameQuestionPrompt(question) || question?.instruction || '',
		)
			.trim()
			.toLowerCase();
		const expectedAnswer = getQuestionExpectedAnswerValue(question);
		const answerPreview = normalizePreviewAnswerValue(expectedAnswer);
		const options = extractQuestionOptions(question);
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
							normalizeAnswerToken(option.text) === normalizeAnswerToken(token),
					),
				);
			if (raw.includes('drag') && !explicitOrderSignal && looksLikeChoiceList) {
				return 'multiple-choice';
			}
			return 'draggable';
		}
		if (raw.includes('matching') || raw.includes('pair')) {
			return 'matching-pairs';
		}
		if (raw.includes('fill') || raw.includes('blank')) {
			return 'fill-blank';
		}
		if (raw.includes('odd')) {
			return 'odd-one-out';
		}
		if (/(\d+\s*:).+/.test(answerPreview) && answerPreview.includes('|')) {
			return 'fill-blank';
		}
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
						normalizeAnswerToken(option.text) === normalizeAnswerToken(token),
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

	function shouldRenderAsMultiSelect(question, options = []) {
		if (question?.allowMultipleAnswers) return true;
		const expectedAnswer = getQuestionExpectedAnswerValue(question);
		const answerPreview = normalizePreviewAnswerValue(expectedAnswer);
		if (!hasMeaningfulGameAnswerValue(expectedAnswer) && !answerPreview) {
			return false;
		}
		const answerTokens = splitChoiceAnswerTokensFlexible(expectedAnswer)
			.map((item) => mapAnswerTokenToOptionText(item, options))
			.map((item) => normalizeAnswerToken(item))
			.filter(Boolean);
		if (answerTokens.length <= 1) return false;
		const optionPool = (options || [])
			.map((option) => normalizeAnswerToken(option?.text || option))
			.filter(Boolean);
		if (!optionPool.length) return false;
		if (!answerTokens.every((token) => optionPool.includes(token)))
			return false;
		if (normalizeGameQuestionType(question) !== 'multiple-choice') return false;
		return (
			answerTokens.length < optionPool.length ||
			String(answerPreview || '').includes('|')
		);
	}

	function answerMatchesQuestion(question, providedAnswer) {
		const type = normalizeGameQuestionType(question);
		const expected = getQuestionExpectedAnswerValue(question);
		const optionPool = extractQuestionOptions(question);

		if (type === 'draggable') {
			const expectedOrder = splitChoiceAnswerTokensFlexible(expected)
				.map((token) => mapAnswerTokenToOptionText(token, optionPool))
				.filter(Boolean);
			const providedOrder = splitChoiceAnswerTokensFlexible(providedAnswer)
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
			const providedPairs = parseMatchingPairsAnswer(providedAnswer);
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
			const providedMap = parseFillBlankAnswer(providedAnswer);
			const blankIds = Object.keys(expectedMap);
			if (!blankIds.length) {
				return (
					normalizeAnswerToken(providedAnswer) ===
					normalizeAnswerToken(normalizePreviewAnswerValue(expected))
				);
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
			const optionTexts = optionPool.map(
				(option) => option.text,
			);
			const optionTokens = new Set(
				optionTexts
					.map((option) => normalizeAnswerToken(option))
					.filter(Boolean),
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
				String(normalizePreviewAnswerValue(expected) || '').includes('|');
			const treatAsMulti =
				answersFitOptions &&
				(hasExplicitMultiSignal || expectedTokens.length < optionTokens.size);
			if (treatAsMulti) {
				const expectedSet = new Set(expectedTokens);
				const providedSet = new Set(
					splitChoiceAnswerTokensFlexible(providedAnswer)
						.map((item) => mapAnswerTokenToOptionText(item, optionPool))
						.map((item) => normalizeAnswerToken(item)),
				);
				if (expectedSet.size !== providedSet.size) return false;
				for (const item of expectedSet) {
					if (!providedSet.has(item)) return false;
				}
				return true;
			}
			if (expectedTokens.length === 1) {
				const providedToken = normalizeAnswerToken(
					mapAnswerTokenToOptionText(providedAnswer, optionPool),
				);
				return Boolean(providedToken && providedToken === expectedTokens[0]);
			}
		}

		const mappedExpected = mapAnswerTokenToOptionText(
			normalizePreviewAnswerValue(expected),
			optionPool,
		);
		const mappedProvided = mapAnswerTokenToOptionText(
			providedAnswer,
			optionPool,
		);
		return (
			normalizeAnswerToken(mappedProvided) === normalizeAnswerToken(mappedExpected)
		);
	}

	function getQuestionTypeBadge(type) {
		const normalized = String(type || '').toLowerCase();
		if (normalized === 'draggable') {
			return '<div class="question-type-badge draggable">Arrange in order</div>';
		}
		if (normalized === 'matching-pairs') {
			return '<div class="question-type-badge matching-pairs">Match the pairs</div>';
		}
		if (normalized === 'fill-blank') {
			return '<div class="question-type-badge fill-blank">Fill in the blanks</div>';
		}
		if (normalized === 'odd-one-out') {
			return '<div class="question-type-badge odd-one-out">Find the odd one out</div>';
		}
		if (normalized === 'code') {
			return '<div class="question-type-badge code">Code snippet</div>';
		}
		return '<div class="question-type-badge">Multiple choice</div>';
	}

	function prepareFillBlankQuestion(question) {
		let questionText = String(getGameQuestionPrompt(question) || '').trim();
		const existingIds = [];
		const idPattern = /\{\{(\d+)\}\}/g;
		let idMatch;
		while ((idMatch = idPattern.exec(questionText)) !== null) {
			const id = parseInt(idMatch[1], 10);
			if (Number.isFinite(id)) existingIds.push(id);
		}
		let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;
		questionText = questionText.replace(/_{3,}/g, () => `{{${nextId++}}}`);

		const blanks = [];
		const blankPattern = /\{\{(\d+)\}\}/g;
		let blankMatch;
		while ((blankMatch = blankPattern.exec(questionText)) !== null) {
			const id = String(blankMatch[1]).trim();
			if (id && !blanks.includes(id)) blanks.push(id);
		}

		const expectedMap = parseFillBlankAnswer(
			getQuestionExpectedAnswerValue(question),
		);
		if (!blanks.length && Object.keys(expectedMap).length) {
			Object.keys(expectedMap).forEach((id) => {
				if (!blanks.includes(id)) blanks.push(id);
			});
		}

		const optionPool = [];
		Object.values(expectedMap).forEach((answers) => {
			(answers || []).forEach((item) => {
				const value = String(item || '').trim();
				if (value) optionPool.push(value);
			});
		});
		extractQuestionOptions(question).forEach((option) => {
			const value = String(option.text || '').trim();
			if (value) optionPool.push(value);
		});
		if (Array.isArray(question?.distractors)) {
			question.distractors.forEach((item) => {
				const value = String(item || '').trim();
				if (value) optionPool.push(value);
			});
		}
		const seen = new Set();
		const wordBank = optionPool.filter((item) => {
			const key = normalizeAnswerToken(item);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		const useWordBank = Boolean(
			question?.useWordBank || wordBank.length >= blanks.length,
		);

		let questionMarkup = escapeHtml(questionText || 'Fill in the blanks');
		if (blanks.length) {
			blanks.forEach((blankId) => {
				const marker = new RegExp(`\\{\\{${blankId}\\}\\}`, 'g');
				const replacement = useWordBank
					? `<span class="fill-blank-wrapper"><span class="blank-number-badge">${escapeHtml(blankId)}</span><div class="fill-blank-drop-zone" data-blank-id="${escapeHtml(blankId)}"></div></span>`
					: `<span class="fill-blank-wrapper"><span class="blank-number-badge">${escapeHtml(blankId)}</span><input type="text" class="form-control game-fill-input" data-blank-id="${escapeHtml(blankId)}" placeholder="..." /></span>`;
				questionMarkup = questionMarkup.replace(marker, replacement);
			});
		}

		return {
			blanks,
			useWordBank,
			wordBank,
			questionMarkup,
		};
	}

	function renderGameQuestionInterface({
		game,
		question,
		mode,
		answered = false,
		allowHint = false,
		specialCardId = '',
		questionIndex = 0,
	}) {
		const text = String(getGameQuestionPrompt(question) || '').trim();
		const questionType = normalizeGameQuestionType(question);
		const expectedAnswer = getQuestionExpectedAnswerValue(question);
		const options = extractQuestionOptions(question);
		const isMultipleChoiceQuestion =
			questionType === 'multiple-choice' && options.length > 0;
		const isMultiSelectQuestion =
			isMultipleChoiceQuestion && shouldRenderAsMultiSelect(question, options);
		const questionSelectionKey = getGameQuestionSelectionKey(question, options);
		const instruction = String(question?.instruction || '').trim();
		const image = String(question?.image || '').trim();
		const activeSpecialCardId =
			mode === 'card' ? normalizeSpecialCardId(specialCardId) : '';
		const fogMode = activeSpecialCardId === 'fog';
		const freezeMode = activeSpecialCardId === 'freeze';
		const hintAllowed = allowHint && !fogMode && !freezeMode;
		let effectNotice = '';
		if (fogMode) {
			effectNotice =
				'<div class="game-special-question-note game-special-question-note--fog">Fog effect active: question content is obscured.</div>';
		} else if (freezeMode) {
			effectNotice =
				'<div class="game-special-question-note game-special-question-note--freeze">Freeze effect active: timer is heavily reduced.</div>';
		} else if (activeSpecialCardId === 'overclock') {
			effectNotice =
				'<div class="game-special-question-note game-special-question-note--overclock">Overclock active: faster timer and boosted points.</div>';
		}
		const actionByMode = {
			race: {
				optionAction: 'answer-race',
				textSubmitAction: 'submit-race-text',
				textInputId: 'raceAnswerInput',
			},
			card: {
				optionAction: 'answer-card',
				textSubmitAction: 'submit-card-text',
				textInputId: 'cardAnswerInput',
			},
			tiebreak: {
				optionAction: 'answer-tiebreak',
				textSubmitAction: 'submit-tiebreak-text',
				textInputId: 'tieBreakAnswerInput',
			},
		};
		const actions = actionByMode[mode] || actionByMode.race;

		// Refactored Header to match Exam Mode (script.js)
		const typeBadge = getQuestionTypeBadge(questionType);
		const choiceModeIndicator = isMultipleChoiceQuestion
			? `<div class="question-answer-mode ${isMultiSelectQuestion ? 'multiple' : 'single'}">${isMultiSelectQuestion ? 'Multiple answers' : 'Single answer'}</div>`
			: '';

		const isFillBlank = questionType === 'fill-blank';
		const fillData = isFillBlank ? prepareFillBlankQuestion(question) : null;
		const displayPromptText = isFillBlank ? (fillData?.questionMarkup || text) : text;
		
		let codeSnippetHtml = '';
		if ((question?.type === 'code' || question?.questionType === 'code') && question?.codeSnippet) {
			codeSnippetHtml = `
			  <div class="code-snippet-block">
				<div class="code-snippet-header">
				  <div class="code-snippet-dots">
					<span></span>
					<span></span>
					<span></span>
				  </div>
				  <div class="code-language-badge">${escapeHtml(question.codeLanguage || 'code')}</div>
				</div>
				<pre><code class="language-${escapeHtml(question.codeLanguage || 'javascript')}">${escapeHtml(question.codeSnippet)}</code></pre>
			  </div>`;
		}

		const prompt = `
			<div class="instruction-wrapper">
				${instruction ? `<div class="question-instruction">${escapeHtml(instruction)}</div>` : ''}
				<div class="question-badges">
					${typeBadge}
					${choiceModeIndicator}
				</div>
			</div>
			${codeSnippetHtml}
			<div class="question-header">
				<div class="question-text ${isFillBlank ? 'fill-blank-question' : ''}">${isFillBlank ? displayPromptText : escapeHtml(displayPromptText || 'Question')}</div>
			</div>
			${
				image
					? `<div class="question-image-container"><img src="${escapeHtml(image)}" alt="Question image"></div>`
					: ''
			}
		`;

		let body = '';
		if (questionType === 'draggable') {
			const orderSource = options.length
				? options
				: splitChoiceAnswerTokensFlexible(expectedAnswer)
						.map((token, index) => {
							const resolvedText = String(token || '').trim();
							if (!resolvedText) return null;
							return {
								text: resolvedText,
								image: '',
								isImageOnly: false,
								id: `fallback-${index + 1}`,
								number: '',
							};
						})
						.filter(Boolean);
			if (!orderSource.length) {
				body = `
					<div class="game-answer-box">
						<input type="text" id="${actions.textInputId}" class="form-control" placeholder="Type the correct order" ${answered ? 'disabled' : ''} />
						<button type="button" class="workspace-btn small" data-action="${actions.textSubmitAction}" data-game-id="${game.id}" ${answered ? 'disabled' : ''}>Submit</button>
					</div>
				`;
			} else {
				body = `
					<div class="draggable-container game-draggable-list">
						${orderSource
							.map((option) => {
								const optionValue = String(option?.text || '').trim();
								const optionImage = String(option?.image || '').trim();
								const showLabel =
									!option?.isImageOnly || !optionImage || !optionValue;
								return `
							<div class="draggable-option game-draggable-option ${optionImage ? 'image-option' : ''} ${option?.isImageOnly ? 'image-only' : ''}" draggable="${answered ? 'false' : 'true'}" data-value="${encodeDataValue(optionValue)}">
								${
									optionImage
										? `<div class="option-image-container"><img src="${escapeHtml(optionImage)}" class="option-image" alt="${escapeHtml(optionValue || 'Option image')}"></div>`
										: ''
								}
								${
									showLabel
										? `<div class="option-label">${escapeHtml(optionValue)}</div>`
										: ''
								}
							</div>
						`;
							})
							.join('')}
					</div>
					<button type="button" class="workspace-btn small" data-action="submit-structured-answer" data-mode="${escapeHtml(mode)}" data-game-id="${escapeHtml(game.id)}" ${answered ? 'disabled' : ''}>
						Submit Order
					</button>
				`;
			}
		} else if (questionType === 'matching-pairs') {
			const pairs = extractMatchingPairs(question);
			if (!pairs.length) {
				body = `
					<div class="game-answer-box">
						<input type="text" id="${actions.textInputId}" class="form-control" placeholder="Type your answer" ${answered ? 'disabled' : ''} />
						<button type="button" class="workspace-btn small" data-action="${actions.textSubmitAction}" data-game-id="${game.id}" ${answered ? 'disabled' : ''}>Submit</button>
					</div>
				`;
			} else {
				const leftItems = pairs.map((pair, index) => ({
					key: `left-${index}`,
					value: pair.left,
					option: findQuestionOptionEntryByToken(options, pair.left),
				}));
				const rightItems = pairs.map((pair, index) => ({
					key: `right-${index}`,
					value: pair.right,
					option: findQuestionOptionEntryByToken(options, pair.right),
				}));
				body = `
				<div class="matching-pairs-quiz game-match-board" data-total-pairs="${pairs.length}" data-pairs="[]">
					<div class="matching-columns">
						<div class="matching-column quiz-left-column">
							<h4>Left Column</h4>
							${leftItems
								.map(
									(item) => `
								<button type="button" class="matching-item quiz-item game-match-item" data-column="left" data-key="${encodeDataValue(item.key)}" data-value="${encodeDataValue(item.value)}">
									${
										item.option?.image
											? `<div class="matching-item-image-container"><img src="${escapeHtml(item.option.image)}" class="matching-item-image" alt="${escapeHtml(item.value)}"></div>`
											: ''
									}
									<div class="matching-item-text">${escapeHtml(item.value)}</div>
								</button>
							`,
								)
								.join('')}
						</div>
						<div class="matching-column quiz-right-column">
							<h4>Right Column</h4>
							${rightItems
								.map(
									(item) => `
								<button type="button" class="matching-item quiz-item game-match-item" data-column="right" data-key="${encodeDataValue(item.key)}" data-value="${encodeDataValue(item.value)}">
									${
										item.option?.image
											? `<div class="matching-item-image-container"><img src="${escapeHtml(item.option.image)}" class="matching-item-image" alt="${escapeHtml(item.value)}"></div>`
											: ''
									}
									<div class="matching-item-text">${escapeHtml(item.value)}</div>
								</button>
							`,
								)
								.join('')}
						</div>
					</div>
					<div class="matching-status">
						<div class="status-item">
							<span class="status-label">Pairs matched:</span>
							<span class="status-value" data-match-count>0</span>
						</div>
						<div class="status-item">
							<span class="status-label">Total pairs:</span>
							<span class="status-value">${pairs.length}</span>
						</div>
					</div>
					<div class="game-match-pairs"></div>
				</div>
				<button type="button" class="workspace-btn small" data-action="submit-structured-answer" data-mode="${escapeHtml(mode)}" data-game-id="${escapeHtml(game.id)}" ${answered ? 'disabled' : ''}>
					Submit Matches
				</button>
			`;
			}
		} else if (questionType === 'fill-blank') {
			const fill = fillData || prepareFillBlankQuestion(question);
			const hasInlineBlanks = fill.questionMarkup.includes('data-blank-id=');
			const generatedBlankFields =
				!hasInlineBlanks && fill.blanks.length
					? `<div class="game-fill-fallback-fields">
				${fill.blanks
					.map((blankId) =>
						fill.useWordBank
							? `<span class="fill-blank-wrapper"><span class="blank-number-badge">${escapeHtml(blankId)}</span><div class="fill-blank-drop-zone" data-blank-id="${escapeHtml(blankId)}"></div></span>`
							: `<span class="fill-blank-wrapper"><span class="blank-number-badge">${escapeHtml(blankId)}</span><input type="text" class="form-control game-fill-input" data-blank-id="${escapeHtml(blankId)}" placeholder="..." /></span>`,
					)
					.join('')}
			</div>`
					: '';
			const wordBankHtml = fill.useWordBank
				? `<div class="word-bank-items game-word-bank">
				${fill.wordBank
					.map(
						(word, index) => `
					<button
						type="button"
						class="word-bank-item"
						draggable="${answered ? 'false' : 'true'}"
						data-word-token="${escapeHtml(String(index))}"
						data-word-value="${encodeDataValue(word)}"
						${answered ? 'disabled' : ''}
					>
						${escapeHtml(word)}
					</button>
				`,
					)
					.join('')}
			</div>`
				: '';
			body = `
			<div class="fill-blank-body">
				${generatedBlankFields}
				${wordBankHtml}
				<button type="button" class="workspace-btn small" data-action="submit-structured-answer" data-mode="${escapeHtml(mode)}" data-game-id="${escapeHtml(game.id)}" ${answered ? 'disabled' : ''}>
					Submit Answers
				</button>
			</div>
		`;
		} else if (questionType === 'odd-one-out' && options.length) {
			body = `
				<div class="game-options odd-one-out-container">
					${options
						.map((option) => {
							const optionValue = String(option?.text || '').trim();
							const optionImage = String(option?.image || '').trim();
							const showLabel =
								!option?.isImageOnly || !optionImage || !optionValue;
							return `
						<button type="button" class="option-btn odd-one-option ${optionImage ? 'image-option' : ''} ${option?.isImageOnly ? 'image-only' : ''}" data-action="${actions.optionAction}" data-game-id="${game.id}" data-answer="${escapeHtml(optionValue)}" aria-pressed="false" ${answered ? 'disabled' : ''}>
							${
								optionImage
									? `<div class="option-image-container"><img src="${escapeHtml(optionImage)}" class="option-image" alt="${escapeHtml(optionValue || 'Option image')}"></div>`
									: ''
							}
							${
								showLabel
									? `<div class="option-label">${escapeHtml(optionValue)}</div>`
									: ''
							}
						</button>
					`;
						})
						.join('')}
				</div>
				${
					hintAllowed && !answered
						? `<button class="workspace-btn ghost small hint-btn" data-action="use-hint" data-game-id="${game.id}" style="margin-top: 12px; width: 100%;">Hint (50/50)</button>`
						: ''
				}
			`;
		} else if (options.length) {
			const isMultiSelect = isMultiSelectQuestion;
			const selectedMultiValues = isMultiSelect
				? getSavedMultiSelectValues(game.id, questionSelectionKey)
				: [];
			const selectedMultiSet = new Set(
				selectedMultiValues.map((value) => normalizeAnswerToken(value)),
			);
			body = `
				<div class="game-options ${isMultiSelect ? 'multi-select' : ''}" ${
					isMultiSelect
						? `data-multi-select="true" data-question-key="${escapeHtml(
								questionSelectionKey,
							)}"`
						: ''
				}>
					${options
						.map((option) => {
							const optionValue = String(option?.text || '').trim();
							const optionImage = String(option?.image || '').trim();
							const showLabel =
								!option?.isImageOnly || !optionImage || !optionValue;
							const optionSelected =
								isMultiSelect &&
								!answered &&
								selectedMultiSet.has(normalizeAnswerToken(optionValue));
							return `
						<button type="button" class="option-btn ${optionImage ? 'image-option' : ''} ${option.isImageOnly ? 'image-only' : ''} ${
							optionSelected ? 'selected' : ''
						}" data-action="${
							isMultiSelect ? 'toggle-multi-option' : actions.optionAction
						}" data-game-id="${game.id}" data-answer="${escapeHtml(optionValue)}" ${
							isMultiSelect
								? `data-question-key="${escapeHtml(
										questionSelectionKey,
									)}" aria-pressed="${optionSelected ? 'true' : 'false'}"`
								: 'aria-pressed="false"'
						} ${answered ? 'disabled' : ''}>
							${
								optionImage
									? `<div class="option-image-container"><img src="${escapeHtml(optionImage)}" class="option-image" alt="${escapeHtml(optionValue || 'Option image')}"></div>`
									: ''
							}
							${
								showLabel
									? `<div class="option-label">${escapeHtml(optionValue)}</div>`
									: ''
							}
						</button>
					`;
						})
						.join('')}
				</div>
				${
					isMultiSelect
						? `<button type="button" class="workspace-btn small" data-action="submit-multi-answer" data-mode="${escapeHtml(mode)}" data-game-id="${escapeHtml(game.id)}" data-question-key="${escapeHtml(questionSelectionKey)}" ${answered ? 'disabled' : ''}>Submit Selection</button>`
						: ''
				}
				${
					hintAllowed && !answered
						? `<button class="workspace-btn ghost small hint-btn" data-action="use-hint" data-game-id="${game.id}" style="margin-top: 12px; width: 100%;">Hint (50/50)</button>`
						: ''
				}
			`;
		} else {
			body = `
				<div class="game-answer-box">
					<input type="text" id="${actions.textInputId}" class="form-control" placeholder="Your answer" ${answered ? 'disabled' : ''} />
					<button type="button" class="workspace-btn small" data-action="${actions.textSubmitAction}" data-game-id="${game.id}" ${answered ? 'disabled' : ''}>Submit</button>
				</div>
			`;
		}

		return `
			<div class="game-quiz-shell ${fogMode ? 'is-foggy' : ''} ${freezeMode ? 'is-frozen' : ''}" data-game-id="${escapeHtml(game.id)}" data-question-key="${escapeHtml(questionSelectionKey)}" data-question-type="${escapeHtml(questionType)}" data-special-card="${escapeHtml(activeSpecialCardId)}" data-question-index="${questionIndex}">
				<div class="game-question-container">
					${effectNotice}
					${prompt}
					<div class="game-question-body">
						${body}
					</div>
				</div>
			</div>
		`;
	}

	function clearSelectedGameWord() {
		if (state.selectedGameWordEl?.classList) {
			state.selectedGameWordEl.classList.remove('selected-for-drop');
		}
		state.selectedGameWordEl = null;
	}

	function findWordBankItemByToken(host, token) {
		if (!host || token == null) return null;
		return (
			Array.from(host.querySelectorAll('.word-bank-item')).find(
				(item) => String(item.dataset.wordToken || '') === String(token),
			) || null
		);
	}

	function clearFillBlankZone(zone) {
		const host = zone.closest('.game-quiz-shell');
		const token = zone.dataset.wordToken;
		if (token && host) {
			const sourceItem = findWordBankItemByToken(host, token);
			if (sourceItem) {
				sourceItem.classList.remove('used');
				sourceItem.disabled = false;
				sourceItem.draggable = true;
			}
		}
		zone.classList.remove('filled');
		zone.innerHTML = '';
		delete zone.dataset.value;
		delete zone.dataset.wordToken;
	}

	function fillBlankZone(zone, word, token = '') {
		if (!zone) return;
		const host = zone.closest('.game-quiz-shell');
		if (zone.dataset.wordToken) {
			clearFillBlankZone(zone);
		}
		zone.dataset.value = String(word || '');
		zone.dataset.wordToken = String(token || '');
		zone.classList.add('filled');
		zone.innerHTML = `
			<span class="filled-word">${escapeHtml(word)}</span>
			<button type="button" class="remove-word-btn" aria-label="Remove answer">x</button>
		`;
		if (host && token) {
			const sourceItem = findWordBankItemByToken(host, token);
			if (sourceItem) {
				sourceItem.classList.add('used');
				sourceItem.disabled = true;
				sourceItem.draggable = false;
			}
		}
		clearSelectedGameWord();
	}

	function handleGameWordItemClick(item) {
		if (!item || item.classList.contains('used') || item.disabled) return;
		if (state.selectedGameWordEl === item) {
			clearSelectedGameWord();
			return;
		}
		clearSelectedGameWord();
		item.classList.add('selected-for-drop');
		state.selectedGameWordEl = item;
	}

	function handleGameDropZoneClick(zone) {
		if (!zone) return;
		if (state.selectedGameWordEl) {
			const word = decodeDataValue(state.selectedGameWordEl.dataset.wordValue);
			const token = state.selectedGameWordEl.dataset.wordToken || '';
			fillBlankZone(zone, word, token);
			return;
		}
		if (zone.classList.contains('filled')) {
			clearFillBlankZone(zone);
		}
	}

	function getGameDragAfterElement(container, y) {
		const draggableElements = [
			...container.querySelectorAll('.game-draggable-option:not(.dragging)'),
		];
		return draggableElements.reduce(
			(closest, child) => {
				const box = child.getBoundingClientRect();
				const offset = y - box.top - box.height / 2;
				if (offset < 0 && offset > closest.offset) {
					return { offset, element: child };
				}
				return closest;
			},
			{ offset: Number.NEGATIVE_INFINITY, element: null },
		).element;
	}

	function getMatchingPairsState(board) {
		try {
			const raw = board?.dataset?.pairs || '[]';
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	}

	function setMatchingPairsState(board, pairs) {
		if (!board) return;
		board.dataset.pairs = JSON.stringify(pairs || []);
		board.querySelectorAll('.game-match-item').forEach((item) => {
			item.classList.remove('paired');
			item.classList.remove('matched');
			item.classList.remove('selected');
			item.classList.remove('active-selection');
		});

		const pairContainer = board.querySelector('.game-match-pairs');
		const countEl = board.querySelector('[data-match-count]');
		const rows = (pairs || []).map((pair, index) => {
			const left = String(pair.left || '');
			const right = String(pair.right || '');
			const leftKey = String(pair.leftKey || '');
			const rightKey = String(pair.rightKey || '');
			const leftItem = board.querySelector(
				leftKey
					? `.game-match-item[data-column="left"][data-key="${encodeDataValue(leftKey)}"]`
					: `.game-match-item[data-column="left"][data-value="${encodeDataValue(left)}"]`,
			);
			const rightItem = board.querySelector(
				rightKey
					? `.game-match-item[data-column="right"][data-key="${encodeDataValue(rightKey)}"]`
					: `.game-match-item[data-column="right"][data-value="${encodeDataValue(right)}"]`,
			);
			if (leftItem) {
				leftItem.classList.add('paired');
				leftItem.classList.add('matched');
			}
			if (rightItem) {
				rightItem.classList.add('paired');
				rightItem.classList.add('matched');
			}
			return `<div class="game-match-pair-chip">${index + 1}. ${escapeHtml(left)} -> ${escapeHtml(right)}</div>`;
		});

		if (pairContainer) {
			window.safeSetHTML ? window.safeSetHTML(pairContainer, rows.join(''), true) : (pairContainer.innerHTML = rows.join(''));
		}
		if (countEl) {
			countEl.textContent = String((pairs || []).length);
		}
	}

	function handleGameMatchItemClick(item) {
		const board = item?.closest('.game-match-board');
		if (!board || item.disabled) return;
		const column = item.dataset.column || '';
		const key = decodeDataValue(item.dataset.key);
		const value = decodeDataValue(item.dataset.value);
		let pairs = getMatchingPairsState(board);
		const normalize = (token) => normalizeAnswerToken(token);

		if (item.classList.contains('paired')) {
			if (column === 'left') {
				pairs = pairs.filter((pair) =>
					pair.leftKey
						? normalize(pair.leftKey) !== normalize(key)
						: normalize(pair.left) !== normalize(value),
				);
			} else if (column === 'right') {
				pairs = pairs.filter((pair) =>
					pair.rightKey
						? normalize(pair.rightKey) !== normalize(key)
						: normalize(pair.right) !== normalize(value),
				);
			}
			setMatchingPairsState(board, pairs);
			return;
		}

		const selectedSameColumn = board.querySelector(
			`.game-match-item.selected[data-column="${column}"]`,
		);
		if (selectedSameColumn && selectedSameColumn !== item) {
			selectedSameColumn.classList.remove('selected');
			selectedSameColumn.classList.remove('active-selection');
		}
		item.classList.toggle('selected');
		item.classList.toggle(
			'active-selection',
			item.classList.contains('selected'),
		);

		const selectedLeft = board.querySelector(
			'.game-match-item.selected[data-column="left"]',
		);
		const selectedRight = board.querySelector(
			'.game-match-item.selected[data-column="right"]',
		);
		if (!selectedLeft || !selectedRight) {
			return;
		}

		const leftValue = decodeDataValue(selectedLeft.dataset.value);
		const rightValue = decodeDataValue(selectedRight.dataset.value);
		const leftKey = decodeDataValue(selectedLeft.dataset.key);
		const rightKey = decodeDataValue(selectedRight.dataset.key);
		pairs = pairs.filter(
			(pair) =>
				(pair.leftKey
					? normalize(pair.leftKey) !== normalize(leftKey)
					: normalize(pair.left) !== normalize(leftValue)) &&
				(pair.rightKey
					? normalize(pair.rightKey) !== normalize(rightKey)
					: normalize(pair.right) !== normalize(rightValue)),
		);
		pairs.push({
			left: leftValue,
			right: rightValue,
			leftKey,
			rightKey,
		});
		selectedLeft.classList.remove('selected');
		selectedLeft.classList.remove('active-selection');
		selectedRight.classList.remove('selected');
		selectedRight.classList.remove('active-selection');
		setMatchingPairsState(board, pairs);
	}

	function applySingleChoiceSelection(button) {
		const container = button?.closest('.game-options');
		if (!container) return;
		container.querySelectorAll('.option-btn').forEach((optionBtn) => {
			const isSelected = optionBtn === button;
			optionBtn.classList.toggle('selected', isSelected);
			optionBtn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
		});
	}

	function collectStructuredGameAnswer(host) {
		if (!host) return { ok: false, message: 'Question UI not ready yet.' };
		const type = String(host.dataset.questionType || '').toLowerCase();

		if (type === 'draggable') {
			const ordered = Array.from(
				host.querySelectorAll('.game-draggable-option'),
			).map((item) => decodeDataValue(item.dataset.value));
			if (!ordered.length) {
				return { ok: false, message: 'No draggable options found.' };
			}
			return { ok: true, value: ordered.join(',') };
		}

		if (type === 'matching-pairs') {
			const board = host.querySelector('.game-match-board');
			const pairs = getMatchingPairsState(board);
			const totalPairs = Number(board?.dataset?.totalPairs || 0);
			if (!pairs.length || (totalPairs > 0 && pairs.length < totalPairs)) {
				return { ok: false, message: 'Complete all matches first.' };
			}
			const value = pairs
				.map((pair) => `${pair.left}->${pair.right}`)
				.join('|');
			return { ok: true, value };
		}

		if (type === 'fill-blank') {
			const dropZones = Array.from(
				host.querySelectorAll('.fill-blank-drop-zone[data-blank-id]'),
			);
			const inputs = Array.from(
				host.querySelectorAll('.game-fill-input[data-blank-id]'),
			);
			const answerMap = {};

			if (dropZones.length) {
				for (const zone of dropZones) {
					const blankId = String(zone.dataset.blankId || '').trim();
					const value = String(zone.dataset.value || '').trim();
					if (!blankId || !value) {
						return { ok: false, message: 'Please fill in all blanks first.' };
					}
					answerMap[blankId] = value;
				}
			} else if (inputs.length) {
				for (const input of inputs) {
					const blankId = String(input.dataset.blankId || '').trim();
					const value = String(input.value || '').trim();
					if (!blankId || !value) {
						return { ok: false, message: 'Please fill in all blanks first.' };
					}
					answerMap[blankId] = value;
				}
			} else {
				return { ok: false, message: 'No fill-blank inputs found.' };
			}

			const serialized = Object.keys(answerMap)
				.sort((a, b) => Number(a) - Number(b))
				.map((blankId) => `${blankId}:${answerMap[blankId]}`)
				.join('|');
			return { ok: true, value: serialized };
		}

		return { ok: false, message: 'Unsupported question type for this action.' };
	}

	function collectMultiSelectGameAnswer(host) {
		if (!host) return { ok: false, message: 'Question UI not ready yet.' };
		const container = host.querySelector(
			'.game-options[data-multi-select="true"]',
		);
		if (!container) {
			return {
				ok: false,
				message: 'This question is not a multi-select question.',
			};
		}
		const gameId = String(host.dataset.gameId || '').trim();
		const questionKey = String(
			host.dataset.questionKey || container.dataset.questionKey || '',
		).trim();
		const savedValues = getSavedMultiSelectValues(gameId, questionKey);
		if (savedValues.length) {
			return { ok: true, value: savedValues.join(',') };
		}
		const selectedValues = Array.from(
			container.querySelectorAll(
				'.option-btn.selected, .option-btn[aria-pressed="true"]',
			),
		)
			.map((button) => String(button.dataset.answer || '').trim())
			.filter(Boolean);
		if (!selectedValues.length) {
			return { ok: false, message: 'Select at least one option first.' };
		}
		const uniqueValues = [];
		const seen = new Set();
		selectedValues.forEach((value) => {
			const key = normalizeAnswerToken(value);
			if (!key || seen.has(key)) return;
			seen.add(key);
			uniqueValues.push(value);
		});
		if (gameId && questionKey && uniqueValues.length) {
			saveMultiSelectValues(gameId, questionKey, uniqueValues);
		}
		return { ok: true, value: uniqueValues.join(',') };
	}

	function ensureSession(game) {
		if (window.GameCore) {
			return window.GameCore.ensureGameSession(game);
		}
		game.session = game.session || { participants: [] };
		return game.session;
	}

	function ensureParticipantForGame(game, context, teamId) {
		if (window.GameCore) {
			return window.GameCore.ensureParticipant(game, context.user, teamId);
		}
		const session = ensureSession(game);
		let participant = session.participants.find((p) =>
			sameUserIdValue(p?.userId, context?.user?.id),
		);
		if (!participant) {
			participant = {
				userId: context.user.id,
				name: context.user.name || context.user.username || 'Student',
				classId: context.user.classId || '',
				teamId: teamId || '',
				score: 0,
				timeSpent: 0,
				ready: false,
				joinedAt: new Date().toISOString(),
			};
			session.participants.push(participant);
		} else if (teamId) {
			participant.teamId = teamId;
		}
		return participant;
	}

	// startLiveGame - REMOVED: handled by game-server.js

	function joinGame(gameId, context, teamId) {
		return new Promise((resolve) => {
			const socket = getSocket();
			if (socket && socket.connected) {
				socket.emit(
					'game:join',
					{
						gameId,
						userId: context.user.id,
						userName: context.user.name || context.user.username || 'Student',
						classId: context.user.classId || '',
						teamId: teamId || '',
					},
					(response) => {
						if (response?.error) {
							showToast(response.error, 'error');
						}
						resolve(response || null);
					},
				);
				return;
			}
			notifyRealtimeDisconnected();
			resolve({ error: 'Realtime server disconnected' });
		});
	}

	function openGameStageForStudent(gameId, context) {
		if (!gameId || !context) return;
		setActiveGameId(gameId);
		renderGameStage(context);
		requestGameSync(gameId, context, 0);
	}

	function toggleReady(gameId, context) {
		const normalizedGameId = String(gameId || '').trim();
		if (!normalizedGameId || !context?.user?.id) return;
		if (isReadyTogglePending(normalizedGameId)) return;
		const socket = getSocket();
		if (socket && socket.connected) {
			setReadyTogglePending(normalizedGameId);
			socket.emit(
				'game:ready',
				{
					gameId: normalizedGameId,
					userId: context.user.id,
				},
				(response) => {
					clearReadyTogglePending(normalizedGameId);
					if (response?.error) {
						showToast(response.error, 'error');
						syncGameStateNow(normalizedGameId, context).finally(() => {
							window.dispatchEvent(new CustomEvent('quiz:games-updated'));
						});
						return;
					}
					if (response?.game) {
						mergeServerGameSnapshot(response.game);
						window.dispatchEvent(new CustomEvent('quiz:games-updated'));
						return;
					}
					syncGameStateNow(normalizedGameId, context).finally(() => {
						window.dispatchEvent(new CustomEvent('quiz:games-updated'));
					});
				},
			);
			return;
		}
		notifyRealtimeDisconnected();
	}

	function forfeitLiveGame(gameId, context, reason = 'left-stage') {
		const activeGame =
			getGameByIdResolved(gameId) || getCachedGame(gameId) || getGameById(gameId);
		if (!activeGame || String(activeGame?.status || '').toLowerCase() !== 'live') {
			return false;
		}
		if (!getParticipant(ensureSession(activeGame), context?.user?.id)) {
			return false;
		}
		const socket = getSocket();
		if (!socket || !socket.connected) {
			return false;
		}
		socket.emit('game:forfeit', {
			gameId,
			userId: context.user.id,
			reason,
		});
		return true;
	}

	function leaveLobbyGame(gameId, context) {
		const activeGame =
			getGameByIdResolved(gameId) || getCachedGame(gameId) || getGameById(gameId);
		const status = String(activeGame?.status || '').toLowerCase();
		if (!activeGame || (status !== 'open' && status !== 'draft')) {
			return false;
		}
		if (!getParticipant(ensureSession(activeGame), context?.user?.id)) {
			return false;
		}
		const socket = getSocket();
		if (!socket || !socket.connected) {
			return false;
		}
		socket.emit(
			'game:leave',
			{
				gameId,
				userId: context.user.id,
			},
			(response) => {
				if (response?.error) {
					showToast(response.error, 'error');
					return;
				}
				if (response?.game) {
					mergeServerGameSnapshot(response.game);
				}
				window.dispatchEvent(new CustomEvent('quiz:games-updated'));
			},
		);
		return true;
	}

	function leaveGameStage(options = {}) {
		const gameId = state.activeGameId;
		const context = options?.context || getStudentContext();
		const leftLobby =
			!options?.skipForfeit &&
			gameId &&
			context &&
			leaveLobbyGame(gameId, context);
		const forfeited =
			!options?.skipForfeit &&
			!leftLobby &&
			gameId &&
			context &&
			forfeitLiveGame(gameId, context, options?.reason || 'left-stage');
		if (gameId) {
			clearSavedMultiSelectForGame(gameId);
		}
		setActiveGameId(null);
		state.lastStageGameId = '';
		state.lastStageSignature = '';
		renderGameStage(null);
		if (forfeited) {
			showToast(
				'You left a live match, so this round is counted as a loss.',
				'warning',
			);
		} else if (leftLobby) {
			showToast('You left the lobby and everyone sees the update in real time.', 'info');
		}
		if (context) renderGamesPanel(context);
	}

	function formatDuration(ms) {
		return formatReadableDurationMs(ms, {
			allowDecimal: true,
			fallback: '-',
		});
	}

	function setInnerHTMLForIds(ids, html) {
		ids.forEach((id) => {
			const el = byId(id);
			if (!el) return;
			const previous = htmlByElementCache.get(id);
			if (previous === html) return;
			window.safeSetHTML ? window.safeSetHTML(el, html, true) : (el.innerHTML = html);
			htmlByElementCache.set(id, html);
		});
	}

	function getGameOutcome(game, context) {
		const results = game.results;
		if (!results || !results.leaderboard) return null;
		const myUserId = String(context?.user?.id || '');
		if (game.mode === 'team') {
			const participant = game.session?.participants?.find(
				(p) => String(p?.userId || '') === myUserId,
			);
			if (!participant) return null;
			const teamId = String(participant.teamId || 'team-a');
			const entry = results.leaderboard.find(
				(e) => String(e?.id || '') === teamId,
			);
			const rank =
				results.leaderboard.findIndex((e) => String(e?.id || '') === teamId) +
				1;
			const isWinner = results.winners?.some(
				(w) => String(w?.id || '') === teamId,
			);
			const hasWinner =
				Array.isArray(results.winners) && results.winners.length > 0;
			return {
				label: hasWinner ? (isWinner ? 'Winner' : 'Lost') : 'No Winner',
				rank,
				score: entry?.score ?? 0,
				timeSpent: entry?.timeSpent ?? 0,
				name: entry?.name || getTeamName(game, teamId),
			};
		}
		const entry = results.leaderboard.find(
			(e) => String(e?.userId || e?.id || '') === myUserId,
		);
		const rank =
			results.leaderboard.findIndex(
				(e) => String(e?.userId || e?.id || '') === myUserId,
			) + 1;
		const isWinner = results.winners?.some(
			(w) => String(w?.userId || w?.id || '') === myUserId,
		);
		const hasWinner =
			Array.isArray(results.winners) && results.winners.length > 0;
		return entry
			? {
					label: hasWinner ? (isWinner ? 'Winner' : 'Lost') : 'No Winner',
					rank,
					score: entry.score ?? 0,
					timeSpent: entry.timeSpent ?? 0,
					name: entry.name || context.user.name,
				}
			: null;
	}

	function getStudentGameViewModel(game, context) {
		const session = game?.session || {};
		const participant = getParticipant(session, context?.user?.id);
		const participantState = String(participant?.state || '').toLowerCase();
		const baseStatus = String(game?.status || 'draft').toLowerCase();
		const viewerFinished =
			participantState === 'forfeited' ||
			participantState === 'eliminated' ||
			baseStatus === 'completed';
		const displayStatus =
			viewerFinished && baseStatus === 'live' ? 'completed' : baseStatus;
		const displayStatusLabel =
			participantState === 'forfeited'
				? 'match finished'
				: participantState === 'eliminated'
					? 'round finished'
					: displayStatus;
		return {
			participant,
			participantState,
			baseStatus,
			displayStatus,
			displayStatusLabel,
			viewerFinished,
			joined: Boolean(participant),
		};
	}

	function getLobbyLabelForGame(game) {
		if (!game) return 'Lobby #1';
		const sessionLabel = String(game.session?.lobbyLabel || '').trim();
		if (sessionLabel) return sessionLabel;
		const resultLabel = String(game.results?.lobbyLabel || '').trim();
		if (resultLabel) return resultLabel;
		const counter = Number(game.lobbyCounter);
		return Number.isFinite(counter) && counter > 0
			? `Lobby #${Math.floor(counter)}`
			: 'Lobby #1';
	}

	function buildGameResultRecords(games) {
		const records = [];
		(games || []).forEach((game) => {
			if (!game || !game.id) return;
			const currentLobbyId = String(
				game.session?.lobbyId ||
					game.results?.lobbyId ||
					`${game.id}-lobby-${game.lobbyCounter || 1}`,
			);
			if (game.status === 'completed' && game.results) {
				records.push({
					id: `${game.id}::${currentLobbyId}`,
					gameId: game.id,
					gameName: game.name,
					type: game.type,
					mode: game.mode,
					lobbyId: currentLobbyId,
					lobbyLabel: getLobbyLabelForGame(game),
					results: game.results,
					participants: game.session?.participants || [],
					teamNames: game.settings?.teamNames || { a: 'Team A', b: 'Team B' },
					endedAt: game.results?.endedAt || game.session?.endedAt || '',
				});
			}
			const history = Array.isArray(game.lobbyHistory) ? game.lobbyHistory : [];
			history.forEach((entry, index) => {
				if (!entry || !entry.results) return;
				const lobbyId = String(
					entry.lobbyId || `${game.id}-history-${index + 1}`,
				);
				records.push({
					id: `${game.id}::${lobbyId}`,
					gameId: game.id,
					gameName: game.name,
					type: entry.type || game.type,
					mode: entry.mode || game.mode,
					lobbyId,
					lobbyLabel: entry.lobbyLabel || `Lobby #${index + 1}`,
					results: entry.results,
					participants: entry.participants || [],
					teamNames: entry.teamNames ||
						game.settings?.teamNames || { a: 'Team A', b: 'Team B' },
					endedAt:
						entry.endedAt || entry.results?.endedAt || entry.archivedAt || '',
				});
			});
		});
		const deduped = [];
		const seen = new Set();
		records
			.sort((a, b) =>
				String(b.endedAt || '').localeCompare(String(a.endedAt || '')),
			)
			.forEach((record) => {
				const key = `${record.gameId}::${record.lobbyId}`;
				if (seen.has(key)) return;
				seen.add(key);
				deduped.push(record);
			});
		return deduped;
	}

	function getGameRecordOutcome(record, context) {
		if (!record || !record.results) return null;
		const pseudoGame = {
			mode: record.mode,
			results: record.results,
			session: { participants: record.participants || [] },
			settings: {
				teamNames: record.teamNames || { a: 'Team A', b: 'Team B' },
			},
		};
		return getGameOutcome(pseudoGame, context);
	}

	function renderGameStats(
		games,
		context,
		targetIds = ['studentGameStatsMain'],
	) {
		if (!targetIds.some((id) => byId(id))) return;
		const liveCount = games.filter((g) => g.status === 'live').length;
		const openCount = games.filter(
			(g) => g.status === 'open' || g.status === 'draft',
		).length;
		const resultRecords = buildGameResultRecords(games);
		const outcomes = resultRecords
			.map((record) => getGameRecordOutcome(record, context))
			.filter(Boolean);
		const playedCount = outcomes.length;
		const wins = outcomes.filter(
			(outcome) => outcome.label === 'Winner',
		).length;
		const winRate = playedCount ? Math.round((wins / playedCount) * 100) : 0;
		const averageScore = playedCount
			? Math.round(
					outcomes.reduce(
						(sum, outcome) => sum + Number(outcome.score || 0),
						0,
					) / playedCount,
				)
			: 0;
		const completedCount = resultRecords.length;

		if (byId('heroLiveGames')) {
			byId('heroLiveGames').textContent = liveCount;
		}
		if (byId('heroLobbiesPlayed')) {
			byId('heroLobbiesPlayed').textContent = completedCount;
		}

		const html = `
			<div class="game-stat-card">
				<div class="stat-label">Open Games</div>
				<div class="stat-value">${openCount}</div>
			</div>
			<div class="game-stat-card">
				<div class="stat-label">Live Now</div>
				<div class="stat-value">${liveCount}</div>
			</div>
			<div class="game-stat-card">
				<div class="stat-label">Lobbies Played</div>
				<div class="stat-value">${completedCount}</div>
			</div>
			<div class="game-stat-card highlight">
				<div class="stat-label">Your Wins</div>
				<div class="stat-value">${wins}</div>
			</div>
			<div class="game-stat-card">
				<div class="stat-label">Win Rate</div>
				<div class="stat-value">${winRate}%</div>
			</div>
			<div class="game-stat-card">
				<div class="stat-label">Avg Score</div>
				<div class="stat-value">${averageScore}</div>
			</div>
		`;
		setInnerHTMLForIds(targetIds, html);
	}

	function getWorkspaceGameTypeLabel(gameType) {
		const type = String(gameType || '').toLowerCase();
		if (
			type.includes('cards-draw') ||
			(type.includes('card') && type.includes('draw'))
		) {
			return 'Card Draw Battle';
		}
		if (type.includes('card')) return 'Card Battle';
		if (type.includes('sprint') && type.includes('race')) return 'Sprint Race';
		if (type.includes('race')) return 'Lightning Race';
		if (type.includes('hot')) return 'Hot Potato';
		if (type.includes('survivor')) return 'Last Survivor';
		return 'Game';
	}

	function renderGameResultsPanel(
		games,
		context,
		targetIds = ['studentGameResultsMain'],
	) {
		if (!targetIds.some((id) => byId(id))) return;
		const completed = buildGameResultRecords(games);

		if (!completed.length) {
			setInnerHTMLForIds(
				targetIds,
				'<div class="empty-state">No completed games yet.</div>',
			);
			return;
		}

		const html = completed
			.map((record) => {
				const winner =
					record.results?.winners?.[0]?.name ||
					record.results?.winners?.[0]?.id ||
					'-';
				const outcome = getGameRecordOutcome(record, context);
				const outcomeLabel = outcome?.label || 'Not Played';
				const outcomeClass =
					outcome?.label === 'Winner'
						? 'win'
						: outcome?.label === 'Lost'
							? 'lose'
							: 'neutral';
				return `
				<div class="game-result-card">
					<div>
						<div class="result-title">${escapeHtml(record.gameName)} <small>(${escapeHtml(record.lobbyLabel || 'Lobby')})</small></div>
						<div class="result-subtitle">${escapeHtml(
							getWorkspaceGameTypeLabel(record.type),
						)} - Winner: ${escapeHtml(winner)}</div>
					</div>
					<div class="result-outcome ${outcomeClass}">
						<div>${escapeHtml(outcomeLabel)}</div>
						${
							outcome
								? `<small>Rank ${outcome.rank || '-'}</small>
							<small>${outcome.score} pts - ${formatDuration(outcome.timeSpent)}</small>`
								: '<small>Not in this game</small>'
						}
					</div>
				</div>
			`;
			})
			.join('');
		setInnerHTMLForIds(targetIds, html);
	}

	function renderGamesPanel(context) {
		const listIds = ['studentGameListMain'];
		const lists = listIds.map((id) => byId(id)).filter(Boolean);
		if (!lists.length) return;
		syncKnownGames(context, 12000);
		const games = getAvailableGames(context);
		games.forEach(cacheGameSnapshot);
		renderGameStats(games, context);
		renderGameResultsPanel(games, context);
		const filtered = games.filter((game) => {
			const viewModel = getStudentGameViewModel(game, context);
			// Filter by status
			let matchesStatus = false;
			if (state.gameFilter === 'open')
				matchesStatus =
					viewModel.displayStatus === 'open' ||
					viewModel.displayStatus === 'draft';
			else if (state.gameFilter === 'live')
				matchesStatus = viewModel.displayStatus === 'live';
			else if (state.gameFilter === 'completed')
				matchesStatus =
					viewModel.displayStatus === 'completed' ||
					(Array.isArray(game.lobbyHistory) &&
						game.lobbyHistory.some((entry) => entry?.results));
			else matchesStatus = true;

			// Don't filter by tournament mode - scoring validates game type for points
			return matchesStatus;
		});

		if (!filtered.length) {
			setInnerHTMLForIds(
				listIds,
				'<div class="empty-state">No games available for this view.</div>',
			);
			return;
		}

		const html = filtered
			.map((game) => {
				const session = game.session || {};
				const viewModel = getStudentGameViewModel(game, context);
				const joined = viewModel.joined;
				const participant = viewModel.participant;
				const participantState = viewModel.participantState;
				const status = viewModel.displayStatus || 'draft';
				const globalStatus = viewModel.baseStatus || status;
				const statusClass =
					status === 'live' || status === 'open' || status === 'completed'
						? status
						: 'draft';
				const expected = getGameLobbyExpectedPlayers(game);
				const lobbyLabel = getLobbyLabelForGame(game);
				const joinLabel = game.mode === 'team' ? 'Choose Team' : 'Join Lobby';
				const outcome =
					globalStatus === 'completed' ? getGameOutcome(game, context) : null;
				const outcomeLabel = outcome?.label || 'Not Played';
				const outcomeClass =
					outcome?.label === 'Winner'
						? 'win'
						: outcome?.label === 'Lost'
							? 'lose'
							: 'neutral';
				const isForfeited = participantState === 'forfeited';
				const isEliminated = participantState === 'eliminated';
				const showFinishedNotice =
					(globalStatus === 'live' || globalStatus === 'completed') &&
					(isForfeited || isEliminated);
				let enterLabel = 'Open Lobby';
				if (globalStatus === 'completed') {
					enterLabel = 'View Results';
				} else if (globalStatus === 'live' && (isForfeited || isEliminated)) {
					enterLabel = 'Match Finished';
				} else if (globalStatus === 'live') {
					enterLabel = 'Open Match';
				}
				return `
				<div class="game-card ${escapeHtml(statusClass)}">
					<div class="game-card-header">
						<div>
							<h3>${escapeHtml(game.name)}</h3>
							<p class="game-type-badges">
								<span class="game-badge">${escapeHtml(
									getWorkspaceGameTypeLabel(game.type),
								)}</span>
								<span class="game-badge ghost">${escapeHtml(
									game.mode === 'team' ? 'Team vs Team' : '1 vs 1',
								)}</span>
								<span class="game-badge ghost">${escapeHtml(lobbyLabel)}</span>
							</p>
						</div>
						<span class="game-pill ${escapeHtml(status)}">${escapeHtml(
							viewModel.displayStatusLabel || status,
						)}</span>
					</div>
					<div class="game-meta">
						<span>${game.questions.length} questions</span>
						<span>${
							expected
								? `${session.participants?.length || 0}/${expected} joined`
								: `${session.participants?.length || 0} joined`
						}</span>
					</div>
					${
						status === 'completed' && globalStatus === 'completed'
							? `<div class="game-result-inline ${outcomeClass}">
								<span>${escapeHtml(outcomeLabel)}</span>
								${
									outcome
										? `<span>Rank ${outcome.rank}</span>
								<span>${outcome.score} pts - ${formatDuration(outcome.timeSpent)}</span>`
										: '<span>Not in this game</span>'
								}
							</div>`
							: ''
					}
					${
						showFinishedNotice
							? `<div class="game-result-inline lose">
								<span>Match finished</span>
								<span>${
									isForfeited
										? 'You left the live match, so it counted as a loss.'
										: 'You are out of this live match.'
								}</span>
							</div>`
							: ''
					}
					<div class="game-actions">
						${
							globalStatus === 'open' ||
							globalStatus === 'draft'
								? game.mode === 'team'
									? `
								${
									joined
										? ''
										: `
								<button class="workspace-btn small" data-action="join-team" data-game-id="${game.id}" data-team="team-a">Join ${escapeHtml(
									getTeamName(game, 'team-a'),
								)}</button>
								<button class="workspace-btn small ghost" data-action="join-team" data-game-id="${game.id}" data-team="team-b">Join ${escapeHtml(
									getTeamName(game, 'team-b'),
								)}</button>
								`
								}
							`
									: `
								${
									joined
										? ''
										: `
								<button class="workspace-btn small" data-action="join-game" data-game-id="${game.id}">${escapeHtml(
									joinLabel,
								)}</button>
								`
								}
							`
								: ''
						}
						${
							joined
								? `
								<button class="workspace-btn small" data-action="enter-game" data-game-id="${game.id}" ${
									globalStatus === 'live' &&
									(isForfeited || isEliminated)
										? 'disabled'
										: ''
								}>
									${escapeHtml(enterLabel)}
								</button>
							`
								: ''
						}
					</div>
				</div>
			`;
			})
			.join('');
		setInnerHTMLForIds(listIds, html);
	}

	function renderGameStage(context) {
		const stage = byId('studentGameStage');
		if (!stage) return;
		const modal = byId('studentGameModal');
		const shouldShow = Boolean(state.activeGameId && context);

		if (!shouldShow) {
			clearSelectedGameWord();
			state.draggedGameOption = null;
			state.hintUsed = false;
			state.lastHintQuestionKey = '';
			state.multiSelectSelections = {};
			stage.classList.add('hidden');
			stage.innerHTML = '';
			state.lastStageUiSignature = '';
			if (modal) {
				modal.style.display = 'none';
				modal.classList.remove('active');
			}
			if (document.body) document.body.classList.remove('game-modal-open');
			return;
		}

		if (document.body) document.body.classList.add('game-modal-open');
		requestGameSync(state.activeGameId, context, GAME_SYNC_RENDER_INTERVAL_MS);
		const game =
			getGameByIdResolved(state.activeGameId) ||
			getCachedGame(state.activeGameId);
		if (DEBUG_GAME_STAGE) {
			console.log(
				'[GameStage] Rendering game:',
				state.activeGameId,
				game ? 'Found' : 'Not Found',
			);
		}

		if (!game) {
			stage.innerHTML = `
				<div class="empty-state">
					<h3>Syncing game...</h3>
					<p>We're loading the latest game state. Please wait a moment.</p>
					<button class="workspace-btn small" data-action="leave-stage">Close</button>
				</div>
			`;
			return;
		}

		cacheGameSnapshot(game);
		const session = ensureSession(game);
		const viewerParticipant = getParticipant(session, context.user.id);
		if (String(game.status || '').toLowerCase() === 'live' && !viewerParticipant) {
			requestGameSync(game.id, context, 0);
			stage.innerHTML = `
				<div class="empty-state">
					<h3>Preparing your match...</h3>
					<p>We are syncing the latest lobby state before opening the game.</p>
					<button class="workspace-btn small" data-action="leave-stage">Close</button>
				</div>
			`;
			return;
		}
		const currentSig = getGameStageSignature(game);
		const currentUiSig = getLocalGameUiSignature(game.id);
		const modalVisible = Boolean(
			modal &&
			modal.classList.contains('active') &&
			stage &&
			!stage.classList.contains('hidden'),
		);
		if (
			modalVisible &&
			state.lastStageGameId === String(game.id) &&
			state.lastStageSignature === currentSig &&
			state.lastStageUiSignature === currentUiSig
		) {
			return;
		}
		const beforeSig = state.lastStageSignature;

		// Reset hint when active question changes.
		const questionId = getActiveQuestionKeyFromStageSignature(currentSig);
		const lastQuestionId = getActiveQuestionKeyFromStageSignature(beforeSig);
		if (questionId !== lastQuestionId) {
			state.hintUsed = false;
			state.lastHintQuestionKey = String(questionId || '').trim();
			clearSavedMultiSelectForGame(game.id);
		}

		state.lastStageGameId = String(game.id);
		state.lastStageSignature = currentSig;
		state.lastStageUiSignature = currentUiSig;
		clearSelectedGameWord();
		state.draggedGameOption = null;
		stage.classList.remove('hidden');
		if (modal) {
			modal.style.display = 'flex';
			modal.style.zIndex = '5000'; // Ensure it's on top
			setTimeout(() => modal.classList.add('active'), 10);
		}

		try {
			if (game.status === 'completed') {
				if (typeof renderCompletedStage === 'function') {
					renderCompletedStage(stage, game, context);
				} else {
					// fallback or results stage
					renderResultsStage(stage, game, context);
				}
				return;
			}

			if (game.status !== 'live') {
				renderLobbyStage(stage, game, context);
				return;
			}

			const normalizedType = normalizeGameTypeValue(game?.type);
			if (normalizedType === 'cards' || normalizedType === 'cards-draw') {
				renderCardStage(stage, game, context);
			} else if (normalizedType === 'sprint-race') {
				renderSprintRaceStage(stage, game, context);
			} else {
				renderRaceStage(stage, game, context);
			}
		} catch (e) {
			console.error('[GameStage] Rendering error:', e);
			stage.innerHTML = `<div class="empty-state"><h3>Rendering Error</h3><p>${e.message}</p><button class="workspace-btn small" data-action="leave-stage">Close</button></div>`;
		} finally {
			refreshGameScoreboardTimers();
		}
	}

	function renderLobbyStage(stage, game, context) {
		const session = ensureSession(game);
		const lobbyLabel = getLobbyLabelForGame(game);
		const howToPlayGuide = renderLobbyHowToPlayGuide(game);
		const participant = getParticipant(session, context.user.id);
		const readyPending = isReadyTogglePending(game.id);
		const activeTournament = getActiveTournamentRecord();
		const expected = getGameLobbyExpectedPlayers(game, activeTournament);
		const remaining = expected
			? Math.max(expected - session.participants.length, 0)
			: 0;
		const autoStartEnabled = game.settings?.autoStart === true;
		const scoreboardInfo = renderGameScoreboardInfo({
			game,
			session,
			context,
			mode: 'lobby',
			timerStartedAt: null,
			timerLimitSeconds: null,
			timerIdleLabel: expected
				? `${session.participants.length}/${expected} joined`
				: 'Waiting for start',
		});
		const headerRows = session.participants
			.map(
				(p) => `
					<div class="score-row">
						<span>${escapeHtml(p.name)}</span>
						<span class="score-pill ${p.ready ? 'ready' : ''}">${
							p.ready ? 'Ready' : 'Waiting'
						}</span>
					</div>
				`,
			)
			.join('');
		stage.innerHTML = `
			<div class="game-stage-header with-toggle">
				${renderHeaderRowsToggleControl()}
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>${escapeHtml(lobbyLabel)} open - ${session.participants.length} joined</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Leave Lobby</button>
				</div>
				${renderGameHeaderRows(headerRows)}
			</div>
			<div class="game-stage-body">
				<div class="game-scoreboard">
					${scoreboardInfo}
				</div>
				<div class="game-main">
					<h4>Waiting for players</h4>
					<p>${
						expected
							? remaining === 0
								? autoStartEnabled
									? 'All players are in the lobby. The match will auto-start when everyone marks ready.'
									: 'All players are in the lobby. Wait for the teacher to start the match.'
								: `${session.participants.length}/${expected} connected`
							: autoStartEnabled
								? 'Auto-start is enabled. The match will begin once the ready players reach the target.'
								: 'Wait for the teacher to review the lobby and start the match.'
					}</p>
					${howToPlayGuide}
					${
						participant
							? `<button class="workspace-btn" data-action="toggle-ready" data-game-id="${game.id}" ${
									readyPending ? 'disabled' : ''
								}>
								${
									readyPending
										? 'Updating...'
										: participant.ready
											? 'Ready'
											: 'Mark Ready'
								}
							</button>`
							: ''
					}
				</div>
			</div>
		`;
	}

	function renderTieBreakStage(stage, game, context) {
		const session = ensureSession(game);
		const tieBreak = session.tieBreak;
		const question = game.penaltyQuestions.find((q) =>
			sameQuestionIdValue(q?.id, tieBreak?.questionId),
		);
		const answers = filterAnswersForCurrentRound(
			tieBreak?.answers,
			tieBreak?.startedAt,
		);
		const participant = getParticipant(session, context.user.id);
		const participantTeam = participant?.teamId || '';
		const candidates = Array.isArray(tieBreak?.candidates)
			? tieBreak.candidates
			: [];
		const isCandidate =
			!candidates.length ||
			candidates.some((candidateId) =>
				sameUserIdValue(candidateId, context.user.id),
			) ||
			(participantTeam &&
				candidates.some((candidateId) =>
					sameUserIdValue(candidateId, participantTeam),
				));
		const answeredByUser = answers.some((a) =>
			sameUserIdValue(a?.userId, context.user.id),
		);
		const tieLimitSeconds = toPositiveNumber(
			game.settings?.questionTimeLimit,
			20,
		);
		const scoreboardInfo = renderGameScoreboardInfo({
			game,
			session,
			context,
			mode: 'tiebreak',
			questionIndex: (Number(tieBreak?.index) || 0) + 1,
			questionTotal:
				game.penaltyQuestions?.length || game.questions?.length || 0,
			timerStartedAt: tieBreak?.startedAt || null,
			timerLimitSeconds: tieLimitSeconds,
			timerIdleLabel: `${formatReadableSeconds(tieLimitSeconds)} / question`,
		});
		const headerRows = session.participants
			.map(
				(p) => `
					<div class="score-row">
						<div>
							<div class="score-name">${escapeHtml(p.name)}</div>
							<div class="score-meta">${p.score || 0} pts</div>
						</div>
						<span class="status-pill ${
							answers.some((a) => sameUserIdValue(a?.userId, p.userId))
								? 'answered'
								: 'thinking'
						}">${
							answers.some((a) => sameUserIdValue(a?.userId, p.userId))
								? 'Answered'
								: 'Thinking'
						}</span>
					</div>
				`,
			)
			.join('');
		stage.innerHTML = `
			<div class="game-stage-header with-toggle">
				${renderHeaderRowsToggleControl()}
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>Tie-breaker question - first correct answer wins</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Leave Match</button>
				</div>
				${renderGameHeaderRows(headerRows)}
			</div>
			<div class="game-stage-body">
				<div class="game-scoreboard">
					${scoreboardInfo}
				</div>
				<div class="game-main">
					${renderGameQuestionInterface({
						game,
						question,
						mode: 'tiebreak',
						answered: answeredByUser || !isCandidate,
						allowHint: false,
					})}
					${
						!isCandidate
							? '<p class="game-hint">Waiting for tie-break candidates to answer...</p>'
							: ''
					}
					${
						answeredByUser
							? '<p class="game-hint">Answer submitted. Waiting for tie-break resolution...</p>'
							: ''
					}
				</div>
			</div>
		`;
	}

	function renderRaceProgressTrack(session, game) {
		const participants = Array.isArray(session?.participants)
			? session.participants
			: [];
		if (!participants.length) return '';
		const totalQuestions = Math.max(
			Number(Array.isArray(game?.questions) ? game.questions.length : 0),
			1,
		);
		const winsByUser = new Map();
		(Array.isArray(session?.roundHistory) ? session.roundHistory : []).forEach(
			(round) => {
				const winnerId = String(round?.winnerId || '').trim();
				if (!winnerId) return;
				winsByUser.set(winnerId, Number(winsByUser.get(winnerId) || 0) + 1);
			},
		);
		const rows = participants
			.map((participant) => {
				const wins = Number(winsByUser.get(participant.userId) || 0);
				const progressPct = Math.max(
					0,
					Math.min(Math.round((wins / totalQuestions) * 100), 100),
				);
				const initials = String(participant.name || '?')
					.trim()
					.slice(0, 2)
					.toUpperCase();
				return `
					<div class="race-track-row">
						<div class="race-track-name">${escapeHtml(participant.name || 'Player')}</div>
						<div class="race-track-lane">
							<div class="race-track-line"></div>
							<div class="race-track-start">S</div>
							<div class="race-track-finish">F</div>
							<div class="race-track-runner" style="left:${progressPct}%;">
								<span>${escapeHtml(initials)}</span>
							</div>
						</div>
						<div class="race-track-meta">${wins}/${totalQuestions}</div>
					</div>
				`;
			})
			.join('');
		return `
			<div class="race-track-board">
				<div class="race-track-title">Live Race Track</div>
				${rows}
			</div>
		`;
	}

	function getSprintEntryForUser(sprintState, userId) {
		const byUser = sprintState?.byUser || {};
		const direct = byUser?.[userId];
		if (direct && typeof direct === 'object') return direct;
		const normalizedUserId = normalizeUserIdValue(userId);
		if (!normalizedUserId) return null;
		const mappedKey = Object.keys(byUser).find((key) =>
			sameUserIdValue(key, normalizedUserId),
		);
		if (!mappedKey) {
			return null;
		}
		const mapped = byUser?.[mappedKey];
		return mapped && typeof mapped === 'object' ? mapped : null;
	}

	function renderSprintProgressTrack(session, game) {
		const participants = Array.isArray(session?.participants)
			? session.participants
			: [];
		if (!participants.length) return '';
		const sprint = session?.sprint || {};
		const totalQuestions = Math.max(
			Number(
				sprint?.totalQuestions ||
					(Array.isArray(game?.questions) ? game.questions.length : 0),
			),
			1,
		);
		const rows = participants
			.map((participant) => {
				const entry = getSprintEntryForUser(sprint, participant?.userId) || {};
				const questionIndex = Math.max(
					0,
					Math.floor(Number(entry?.questionIndex || 0)),
				);
				const progress = Math.min(questionIndex, totalQuestions);
				const progressPct = Math.max(
					0,
					Math.min(Math.round((progress / totalQuestions) * 100), 100),
				);
				const initials = String(participant?.name || '?')
					.trim()
					.slice(0, 2)
					.toUpperCase();
				return `
					<div class="race-track-row">
						<div class="race-track-name">${escapeHtml(participant?.name || 'Player')}</div>
						<div class="race-track-lane">
							<div class="race-track-line"></div>
							<div class="race-track-start">S</div>
							<div class="race-track-finish">F</div>
							<div class="race-track-runner" style="left:${progressPct}%;">
								<span>${escapeHtml(initials)}</span>
							</div>
						</div>
						<div class="race-track-meta">${progress}/${totalQuestions}</div>
					</div>
				`;
			})
			.join('');
		return `
			<div class="race-track-board">
				<div class="race-track-title">Sprint Progress</div>
				${rows}
			</div>
		`;
	}

	function getInactiveParticipantStatusMeta(participant) {
		const participantState = String(participant?.state || '').toLowerCase();
		if (participantState === 'forfeited') {
			return {
				statusClass: 'thinking',
				statusLabel: 'Left match',
			};
		}
		if (participantState === 'eliminated') {
			return {
				statusClass: 'thinking',
				statusLabel: 'Eliminated',
			};
		}
		return null;
	}

	function renderSprintRaceStage(stage, game, context) {
		const session = ensureSession(game);
		if (session.tieBreak && !session.tieBreak.resolved) {
			renderTieBreakStage(stage, game, context);
			return;
		}
		const sprint = session.sprint || {};
		const totalQuestionsRaw = Number(
			sprint.totalQuestions ||
				(Array.isArray(game.questions) ? game.questions.length : 0),
		);
		const totalQuestions = Number.isFinite(totalQuestionsRaw)
			? Math.max(Math.floor(totalQuestionsRaw), 0)
			: 0;
		const me = getParticipant(session, context.user.id);
		const meSprint =
			getSprintEntryForUser(sprint, me?.userId || context?.user?.id) || {};
		const myQuestionIndex = Math.max(
			0,
			Math.floor(Number(meSprint?.questionIndex || 0)),
		);
		const isFinished =
			totalQuestions > 0
				? myQuestionIndex >= totalQuestions ||
					Boolean(parseTimestampMs(meSprint?.finishedAt))
				: true;

		const activeQuestion =
			!isFinished && totalQuestions
				? game.questions[Math.min(myQuestionIndex, totalQuestions - 1)] || null
				: null;

		const sprintGlobalLimitRaw = Number(sprint?.globalTimeLimitMs);
		const sprintGlobalLimitMs =
			Number.isFinite(sprintGlobalLimitRaw) && sprintGlobalLimitRaw > 0
				? Math.floor(
						sprintGlobalLimitRaw < 1000
							? sprintGlobalLimitRaw * 1000
							: sprintGlobalLimitRaw,
					)
				: Math.floor(
						Math.max(
							toPositiveNumber(game.settings?.questionTimeLimit, 20) *
								Math.max(totalQuestions, 1) *
								2,
							30,
						) * 1000,
					);
		const sprintGlobalLimitSeconds = Math.max(
			1,
			Math.ceil(sprintGlobalLimitMs / 1000),
		);
		const timerStartedAt = sprint?.startedAt || session?.startedAt || null;
		const winnerId = String(sprint?.winnerId || '').trim();
		const winnerParticipant = (session.participants || []).find((participant) =>
			sameUserIdValue(participant?.userId, winnerId),
		);
		const winnerName = winnerParticipant?.name || '';
		const scoreboardInfo = renderGameScoreboardInfo({
			game,
			session,
			context,
			mode: 'sprint-race',
			questionIndex: totalQuestions
				? Math.min(
						isFinished ? totalQuestions : myQuestionIndex + 1,
						totalQuestions,
					)
				: 0,
			questionTotal: totalQuestions,
			timerStartedAt,
			timerLimitSeconds: sprintGlobalLimitSeconds,
			timerIdleLabel: `${formatReadableSeconds(sprintGlobalLimitSeconds)} / sprint`,
		});
		const sprintTrack = renderSprintProgressTrack(session, game);
		const headerRows = (session.participants || [])
			.map((participant) => {
				const inactiveStatus = getInactiveParticipantStatusMeta(participant);
				const entry = getSprintEntryForUser(sprint, participant?.userId) || {};
				const index = Math.max(
					0,
					Math.floor(Number(entry?.questionIndex || 0)),
				);
				const finished =
					totalQuestions > 0
						? index >= totalQuestions ||
							Boolean(parseTimestampMs(entry?.finishedAt))
						: true;
				const isWinner =
					winnerId && sameUserIdValue(participant?.userId, winnerId);
				const statusClass = isWinner
					? 'winner'
					: finished
						? 'answered'
						: 'thinking';
				const statusLabel = isWinner
					? 'Winner'
					: finished
						? 'Finished'
						: totalQuestions
							? `Q ${Math.min(index + 1, totalQuestions)}/${totalQuestions}`
							: 'Waiting';
				const effectiveStatusClass =
					inactiveStatus?.statusClass || statusClass;
				const effectiveStatusLabel =
					inactiveStatus?.statusLabel || statusLabel;
				return `
					<div class="score-row">
						<div>
							<div class="score-name">${escapeHtml(participant?.name || 'Player')}</div>
							<div class="score-meta">${participant?.score || 0} pts</div>
						</div>
						<span class="status-pill ${effectiveStatusClass}">${effectiveStatusLabel}</span>
					</div>
				`;
			})
			.join('');
		let stageHint =
			'<p class="game-hint">Sprint mode: answer correctly to unlock your next question. Wrong answers keep you on the same one.</p>';
		if (isFinished) {
			if (winnerId && sameUserIdValue(winnerId, context.user.id)) {
				stageHint =
					'<p class="game-hint">You finished first. Sprint victory!</p>';
			} else if (winnerName) {
				stageHint = `<p class="game-hint">Sprint finished. Winner: ${escapeHtml(winnerName)}.</p>`;
			} else {
				stageHint =
					'<p class="game-hint">You finished your sprint run. Waiting for final sync...</p>';
			}
		}

		stage.innerHTML = `
			<div class="game-stage-header with-toggle">
				${renderHeaderRowsToggleControl()}
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>Sprint Race - First finisher wins, timeout uses highest progress</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Leave Match</button>
				</div>
				${renderGameHeaderRows(headerRows)}
			</div>
			<div class="game-stage-body">
				<div class="game-scoreboard">
					${scoreboardInfo}
				</div>
				<div class="game-main">
					${sprintTrack}
					${
						!totalQuestions
							? '<p class="game-hint">No questions are configured for this sprint.</p>'
							: isFinished
								? ''
								: activeQuestion
									? renderGameQuestionInterface({
											game,
											question: activeQuestion,
											mode: 'race',
											answered: false,
											allowHint: Boolean(game.settings?.gameRules?.hintCost),
											questionIndex: myQuestionIndex,
										})
									: '<p class="game-hint">Loading your sprint question...</p>'
					}
					${stageHint}
				</div>
			</div>
		`;
	}

	function renderSpecialCardPicker(game, selectedSpecialId) {
		const specialCards = getCardSpecialCardCatalog(game);
		if (!specialCards.length) return '';
		const availableSpecialCards = specialCards.filter((card) => !card.used);
		const selected = normalizeSpecialCardId(selectedSpecialId);
		const selectedStillAvailable = availableSpecialCards.some(
			(card) => card.id === selected,
		);
		const effectiveSelected = selectedStillAvailable ? selected : '';
		return `
			<div class="special-card-toolbar">
				<div class="special-card-toolbar-title">Special Effect (optional)</div>
				<div class="special-card-toolbar-list">
					<button type="button" class="special-card-btn ${!effectiveSelected ? 'active' : ''}" data-action="set-special-card" data-special-card="" data-game-id="${escapeHtml(game.id)}">
						No Special
					</button>
					${availableSpecialCards
						.map(
							(card) => `
						<button
							type="button"
							class="special-card-btn ${escapeHtml(card.themeClass || '')} ${
								effectiveSelected === card.id ? 'active' : ''
							}"
							data-action="set-special-card"
							data-special-card="${escapeHtml(card.id)}"
							data-game-id="${escapeHtml(game.id)}"
							title="${escapeHtml(card.description)}"
						>
							${escapeHtml(card.label)}
						</button>
					`,
						)
						.join('')}
				</div>
				${
					availableSpecialCards.length
						? ''
						: '<div class="game-hint" style="margin-top:8px;">All special cards are already used in this lobby.</div>'
				}
			</div>
		`;
	}

	function getPendingCardTimerLimitSeconds(game, pendingCard) {
		const fallbackSeconds = toPositiveNumber(game?.settings?.turnTimeLimit, 30);
		const explicitLimitMs = Number(pendingCard?.timeLimitMs);
		if (Number.isFinite(explicitLimitMs) && explicitLimitMs > 0) {
			return Math.max(explicitLimitMs / 1000, 1);
		}
		return fallbackSeconds;
	}

	function getPendingCardTimeLimitMs(game, pendingCard) {
		const explicitLimitMs = Number(pendingCard?.timeLimitMs);
		if (Number.isFinite(explicitLimitMs) && explicitLimitMs > 0) {
			return explicitLimitMs;
		}
		return toPositiveNumber(game?.settings?.turnTimeLimit, 30) * 1000;
	}

	function describeSpecialCardImpact(cardState, viewerUserId) {
		if (!cardState) return '';
		const viewerId = String(viewerUserId || '').trim();
		const pending = cardState.pendingCard || null;
		const isPendingOwner =
			pending && String(pending.ownerId || '') === viewerId;
		const isPendingTarget =
			pending && String(pending.targetId || '') === viewerId;
		if (pending?.specialCard && (isPendingOwner || isPendingTarget)) {
			const label =
				pending.specialCardLabel || getSpecialCardLabel(pending.specialCard);
			if (!label) return '';
			let impact = '';
			if (pending.specialCard === 'time-warp') {
				impact = isPendingTarget
					? 'Time Warp active: your answer timer is reduced.'
					: 'Timer reduced for this challenge.';
			} else if (pending.specialCard === 'freeze') {
				impact = isPendingTarget
					? 'Freeze active: you have very little time to answer.'
					: 'Target timer is heavily reduced.';
			} else if (pending.specialCard === 'double-or-nothing') {
				impact = isPendingTarget
					? 'Double or Nothing: correct gives double points, wrong gives double to attacker.'
					: 'Points are doubled for this card.';
			} else if (pending.specialCard === 'mirror') {
				impact = isPendingTarget
					? 'Mirror active: wrong answer gives double points to the attacker.'
					: 'Wrong answer gives double points to the attacker.';
			} else if (pending.specialCard === 'shield') {
				impact = isPendingTarget
					? 'Shield active: if you miss, owner keeps this card.'
					: 'Shield is armed: wrong answer keeps this card in your deck.';
			} else if (pending.specialCard === 'steal') {
				impact = isPendingTarget
					? 'Steal active: wrong answer lets owner steal one of your cards.'
					: 'Steal is armed: wrong answer steals one target card.';
			} else if (pending.specialCard === 'fog') {
				impact = isPendingTarget
					? 'Fog active: question content is visually obscured.'
					: 'Fog is armed: target question will be obscured.';
			} else if (pending.specialCard === 'combo-breaker') {
				impact = isPendingTarget
					? 'Combo Breaker: your correct reward is reduced, wrong gives owner bonus.'
					: 'Combo Breaker is armed for bonus pressure.';
			} else if (pending.specialCard === 'overclock') {
				impact = isPendingTarget
					? 'Overclock: faster timer and boosted points on this card.'
					: 'Overclock is armed: faster timer and boosted points.';
			}
			const styleClass = getSpecialCardStyleClass(
				pending.specialCard,
				'special-effect-banner--',
			);
			return `
				<div class="special-effect-banner live ${escapeHtml(styleClass)}">
					<span class="special-effect-badge">${escapeHtml(
						isPendingTarget ? `${label} incoming` : label,
					)}</span>
					<span class="special-effect-text">${escapeHtml(impact)}</span>
				</div>
			`;
		}
		const last = cardState.lastResult || null;
		if (last?.specialCard) {
			const label =
				last.specialCardLabel || getSpecialCardLabel(last.specialCard);
			if (!label) return '';
			const points = Number(last.pointsAwarded || 0);
			const pointsRecipientId = String(last.pointsRecipientId || '').trim();
			const isViewerRecipient =
				Boolean(viewerId) &&
				Boolean(pointsRecipientId) &&
				sameUserIdValue(pointsRecipientId, viewerId);
			const resolvedText =
				pointsRecipientId && points > 0
					? isViewerRecipient
						? `You gained ${points} pts.`
						: `Points awarded: ${points} pts.`
					: 'No points awarded.';
			const outcomeText = String(last.specialOutcome || '').trim();
			const fullResolvedText = outcomeText
				? `${resolvedText} ${outcomeText}`
				: resolvedText;
			const styleClass = getSpecialCardStyleClass(
				last.specialCard,
				'special-effect-banner--',
			);
			return `
				<div class="special-effect-banner resolved ${escapeHtml(styleClass)}">
					<span class="special-effect-badge">${escapeHtml(label)} resolved</span>
					<span class="special-effect-text">${escapeHtml(fullResolvedText)}</span>
				</div>
			`;
		}
		return '';
	}

	function renderSelectedSpecialQueueBanner(
		selectedSpecialId,
		canActivateNow = false,
	) {
		const normalized = normalizeSpecialCardId(selectedSpecialId);
		if (!normalized) return '';
		const label = getSpecialCardLabel(normalized);
		if (!label) return '';
		const styleClass = getSpecialCardStyleClass(
			normalized,
			'special-effect-banner--',
		);
		const statusText = canActivateNow
			? 'Armed for your next sent card.'
			: 'Queued until your turn becomes active.';
		return `
			<div class="special-effect-banner queued ${escapeHtml(styleClass)}">
				<span class="special-effect-badge">${escapeHtml(label)} armed</span>
				<span class="special-effect-text">${escapeHtml(statusText)}</span>
			</div>
		`;
	}

	function renderRaceStage(stage, game, context) {
		const session = ensureSession(game);
		if (session.tieBreak && !session.tieBreak.resolved) {
			renderTieBreakStage(stage, game, context);
			return;
		}
		const round = session.round || {};
		const normalizedType = normalizeGameTypeValue(game?.type);
		const isHotPotato = normalizedType === 'hot-potato';
		const isLastSurvivor = normalizedType === 'last-survivor';
		const question = game.questions.find((q) =>
			sameQuestionIdValue(q?.id, round?.questionId),
		);
		const roundAnswers = filterAnswersForCurrentRound(
			round?.answers,
			round?.startedAt,
		);
		const answerMap = new Map(
			roundAnswers.map((entry) => [normalizeUserIdValue(entry?.userId), entry]),
		);
		const me = getParticipant(session, context.user.id);
		const hotPotato = session.hotPotato || {};
		const currentCarrierId = hotPotato.currentPlayerId || '';
		const currentCarrier = (session.participants || []).find((participant) =>
			sameUserIdValue(participant?.userId, currentCarrierId),
		);
		const currentCarrierName = currentCarrier?.name || 'Current player';
		const isCurrentCarrierSelf = sameUserIdValue(
			currentCarrierId,
			context.user.id,
		);
		const turnStartedAt = parseTimestampMs(hotPotato.turnStartedAt) || 0;
		const currentTurnAnswered = isHotPotato
			? roundAnswers.some((entry) => {
					if (!sameUserIdValue(entry?.userId, context.user.id)) return false;
					if (!turnStartedAt) return true;
					const entryTurnStartedAt =
						parseTimestampMs(entry?.turnStartedAt || entry?.answeredAt) || 0;
					return entryTurnStartedAt >= turnStartedAt;
				})
			: false;
		const eliminatedSelf =
			isLastSurvivor && String(me?.state || '').toLowerCase() === 'eliminated';
		const answered = isHotPotato
			? !isCurrentCarrierSelf || currentTurnAnswered
			: isLastSurvivor
				? eliminatedSelf ||
					roundAnswers.some((entry) =>
						sameUserIdValue(entry?.userId, context.user.id),
					)
				: roundAnswers.some((entry) =>
						sameUserIdValue(entry?.userId, context.user.id),
					);
		const suddenDeathActive =
			normalizedType === 'race' &&
			Boolean(game.settings?.gameRules?.suddenDeath) &&
			session.roundIndex >= Math.max((game.questions?.length || 0) - 3, 0);
		const baseQuestionLimit = toPositiveNumber(
			game.settings?.questionTimeLimit,
			20,
		);
		let effectiveQuestionLimit = suddenDeathActive
			? Math.max(baseQuestionLimit / 2, 1)
			: baseQuestionLimit;
		let timerStartedAt = round?.startedAt || null;
		if (isHotPotato) {
			const configuredTotalTimer = Number.isFinite(
				Number(hotPotato.totalTimeLimitMs),
			)
				? Number(hotPotato.totalTimeLimitMs) / 1000
				: toPositiveNumber(
						game.settings?.gameRules?.hotPotato?.totalTimer,
						baseQuestionLimit,
					);
			effectiveQuestionLimit = Math.max(configuredTotalTimer, 1);
			timerStartedAt = hotPotato.roundStartedAt || round?.startedAt || null;
		} else if (isLastSurvivor) {
			const lastSurvivor = session.lastSurvivor || {};
			const configuredEliminationTimer = Number.isFinite(
				Number(lastSurvivor.eliminationTimerMs),
			)
				? Number(lastSurvivor.eliminationTimerMs) / 1000
				: toPositiveNumber(
						game.settings?.gameRules?.lastSurvivor?.eliminationTimer,
						baseQuestionLimit,
					);
			effectiveQuestionLimit = Math.max(configuredEliminationTimer, 1);
		}
		const raceTrackHtml =
			normalizedType === 'race' ? renderRaceProgressTrack(session, game) : '';
		const scoreboardInfo = renderGameScoreboardInfo({
			game,
			session,
			context,
			mode: normalizedType,
			questionIndex: (session.roundIndex || 0) + 1,
			questionTotal: game.questions?.length || 0,
			timerStartedAt,
			timerLimitSeconds: effectiveQuestionLimit,
			timerIdleLabel: `${formatReadableSeconds(effectiveQuestionLimit)} / question`,
		});
		const headerRows = session.participants
			.map((p) => {
				const participantKey = normalizeUserIdValue(p?.userId);
				const inactiveStatus = getInactiveParticipantStatusMeta(p);
				let statusClass = 'thinking';
				let statusLabel = 'Thinking';

				if (inactiveStatus) {
					statusClass = inactiveStatus.statusClass;
					statusLabel = inactiveStatus.statusLabel;
				} else if (isHotPotato) {
					const isCurrentCarrier = sameUserIdValue(p?.userId, currentCarrierId);
					const participantAnsweredThisTurn = roundAnswers.some((entry) => {
						if (!sameUserIdValue(entry?.userId, p?.userId)) return false;
						if (!turnStartedAt) return true;
						const entryTurnStartedAt =
							parseTimestampMs(entry?.turnStartedAt || entry?.answeredAt) || 0;
						return entryTurnStartedAt >= turnStartedAt;
					});
					if (isCurrentCarrier) {
						statusClass = 'answered';
						statusLabel = 'Holding';
					} else if (participantAnsweredThisTurn) {
						statusClass = 'answered';
						statusLabel = 'Answered';
					} else {
						statusClass = 'thinking';
						statusLabel = 'Waiting';
					}
				} else if (isLastSurvivor) {
					const eliminated =
						String(p?.state || '').toLowerCase() === 'eliminated';
					if (eliminated) {
						statusClass = 'thinking';
						statusLabel = 'Eliminated';
					} else if (answerMap.has(participantKey)) {
						statusClass = 'answered';
						statusLabel = 'Answered';
					} else {
						statusClass = 'thinking';
						statusLabel = 'Active';
					}
				} else {
					statusClass = answerMap.has(participantKey) ? 'answered' : 'thinking';
					statusLabel = answerMap.has(participantKey) ? 'Answered' : 'Thinking';
				}

				const streakLabel =
					normalizedType === 'race' && (p.winningStreak || 0) >= 3
						? 'HOT '
						: '';
				return `
					<div class="score-row">
						<div>
							<div class="score-name">${streakLabel}${escapeHtml(p.name)}</div>
							<div class="score-meta">${p.score || 0} pts</div>
						</div>
						<span class="status-pill ${statusClass}">${statusLabel}</span>
					</div>
				`;
			})
			.join('');
		let stageSubtitle = `Lightning Race - Question ${session.roundIndex + 1}/${game.questions.length}`;
		if (suddenDeathActive) {
			stageSubtitle +=
				' <span style="color: #ff4d4d; font-weight: bold; margin-left: 10px;">SUDDEN DEATH</span>';
		}
		if (isHotPotato) {
			stageSubtitle = `Hot Potato - Carrier: ${escapeHtml(
				currentCarrierName,
			)} - Question ${session.roundIndex + 1}/${game.questions.length}`;
		} else if (isLastSurvivor) {
			const activeCount = (session.participants || []).filter(
				(participant) =>
					String(participant?.state || 'active').toLowerCase() !== 'eliminated',
			).length;
			stageSubtitle = `Last Survivor - Question ${session.roundIndex + 1}/${game.questions.length} - Active ${activeCount}`;
		}
		let stageHint = '';
		if (isHotPotato) {
			if (isCurrentCarrierSelf && currentTurnAnswered) {
				stageHint =
					'<p class="game-hint">Answer submitted. Waiting for turn flow...</p>';
			} else if (!isCurrentCarrierSelf) {
				stageHint = `<p class="game-hint">Waiting for ${escapeHtml(
					currentCarrierName,
				)} to answer...</p>`;
			}
		} else if (isLastSurvivor && eliminatedSelf) {
			stageHint =
				'<p class="game-hint">You are eliminated in this lobby, but you can keep watching.</p>';
		} else if (answered) {
			stageHint =
				'<p class="game-hint">Answer submitted. Waiting for others...</p>';
		}
		const hideRaceQuestionAfterSubmit =
			normalizedType === 'race' && answered && !round?.resolved;
		stage.innerHTML = `
			<div class="game-stage-header with-toggle">
				${renderHeaderRowsToggleControl()}
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>${stageSubtitle}</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Leave Match</button>
				</div>
				${renderGameHeaderRows(headerRows)}
			</div>
			<div class="game-stage-body">
				<div class="game-scoreboard">
					${scoreboardInfo}
				</div>
				<div class="game-main">
					${raceTrackHtml}
					${
						hideRaceQuestionAfterSubmit
							? ''
							: renderGameQuestionInterface({
									game,
									question,
									mode: 'race',
									answered,
									allowHint: Boolean(game.settings?.gameRules?.hintCost),
									questionIndex: session?.roundIndex || 0,
								})
					}
					${stageHint}
				</div>
			</div>
		`;
	}

	function renderCardStage(stage, game, context) {
		const session = ensureSession(game);
		if (session.tieBreak && !session.tieBreak.resolved) {
			renderTieBreakStage(stage, game, context);
			return;
		}
		const warmup = session.warmup || null;
		const warmupMap = new Map(
			(warmup?.answers || []).map((a) => [a.userId, a]),
		);
		const cardState = session.card || {};
		const normalizedType = normalizeGameTypeValue(game?.type);
		const isDrawMode =
			normalizedType === 'cards-draw' ||
			String(cardState.turnMode || '').trim() === 'target-picks-opponent';
		const turnOrder = Array.isArray(cardState.turnOrder)
			? cardState.turnOrder
			: [];
		const turnIndexRaw = Number(cardState.turnIndex);
		const turnIndex =
			turnOrder.length && Number.isFinite(turnIndexRaw) && turnIndexRaw >= 0
				? Math.floor(turnIndexRaw) % turnOrder.length
				: 0;
		const pickerUserId = turnOrder[turnIndex] || '';
		const sourceOwnerId = turnOrder.length
			? turnOrder[(turnIndex + 1) % turnOrder.length] || ''
			: '';
		const pickerParticipant = getParticipant(session, pickerUserId);
		const sourceOwnerParticipant = getParticipant(session, sourceOwnerId);
		const pending = cardState.pendingCard;
		const pendingQuestionId = normalizeCardQuestionIdValue(pending?.questionId);
		const viewerId = normalizeUserIdValue(context?.user?.id);
		const isTurnPicker =
			matchesViewerSessionParticipant(session, pickerUserId, context) ||
			sameUserIdValue(pickerUserId, viewerId);
		const isTarget =
			Boolean(pending) &&
			(matchesViewerSessionParticipant(session, pending?.targetId, context) ||
				sameUserIdValue(pending?.targetId, viewerId));
		const myDeck = getViewerHandForCardState(session, cardState, context);
		const hasCards = myDeck.length > 0;
		const categoryMap = buildCategoryMap();
		const opponentDeck = getUserHandById(cardState.hands || {}, sourceOwnerId);
		const canPickFromOpponent = opponentDeck.length > 0;
		const answerLimitPerPlayer = Math.max(
			1,
			Math.floor(Number(cardState.answerLimitPerPlayer || 5)),
		);
		const getAnswerCount = (userId) => {
			const map = cardState.answersByPlayer || {};
			const direct = Number(map?.[userId]);
			if (Number.isFinite(direct) && direct >= 0) return Math.floor(direct);
			const mappedKey = Object.keys(map).find((key) =>
				sameUserIdValue(key, userId),
			);
			const mapped = mappedKey ? Number(map?.[mappedKey]) : NaN;
			return Number.isFinite(mapped) && mapped >= 0 ? Math.floor(mapped) : 0;
		};
		const myAnsweredCount = getAnswerCount(context?.user?.id);
		const question =
			pending &&
			game.questions.find((q) =>
				sameCardQuestionIdValue(q?.id, pendingQuestionId),
			);
		const deckRemaining = Object.values(cardState.hands || {}).reduce(
			(total, cards) => total + (Array.isArray(cards) ? cards.length : 0),
			0,
		);
		const myPickLimitReached = myAnsweredCount >= answerLimitPerPlayer;
		const turnLabel = pending
			? isTarget
				? 'Answer now'
				: isTurnPicker
					? 'Waiting answer'
					: 'Spectating'
			: isTurnPicker
				? isDrawMode
					? 'Pick hidden card'
					: 'Play a card'
				: 'Waiting turn';
		const activeTurnLimit = getPendingCardTimerLimitSeconds(game, pending);
		const activeTimerStartedAt =
			pending?.startedAt || cardState.turnStartedAt || null;
		let selectedSpecial = getSelectedSpecialCard(game.id);
		if (
			selectedSpecial &&
			!isSpecialCardAvailableForGame(game, selectedSpecial)
		) {
			setSelectedSpecialCard(game.id, '');
			selectedSpecial = '';
		}
		const canActivateSpecial = canViewerActivateCardSpecial(game, context);
		const specialPicker = renderSpecialCardPicker(game, selectedSpecial);
		const specialImpactBanner = describeSpecialCardImpact(
			cardState,
			context?.user?.id,
		);
		const selectedSpecialPreview = renderSelectedSpecialQueueBanner(
			selectedSpecial,
			canActivateSpecial,
		);
		const selectedSpecialCardClass = getSpecialCardStyleClass(
			selectedSpecial,
			'play-card--',
		);
		const selectedSpecialLabel = getSpecialCardLabel(selectedSpecial);
		const warmupLimit = toPositiveNumber(game.settings?.turnTimeLimit, 30);
		if (isTarget && pending && !question) {
			requestGameSync(game.id, context, 0);
		}

		if (warmup && !warmup.resolved) {
			const warmupMaxAttempts = Math.floor(
				toPositiveNumber(warmup?.maxAttempts, 5),
			);
			const warmupAttempts = Number(warmup?.attempts || 0);
			const attemptsLeft = Math.max(warmupMaxAttempts - warmupAttempts, 0);
			const warmupInfo = renderGameScoreboardInfo({
				game,
				session,
				context,
				mode: 'card',
				timerStartedAt: warmup?.startedAt || null,
				timerLimitSeconds: warmupLimit,
				timerIdleLabel: `${formatReadableSeconds(warmupLimit)} / turn`,
				handCount: myDeck.length,
				deckRemaining,
				turnLabel: `Warmup (${attemptsLeft} left)`,
			});
			const headerRows = session.participants
				.map(
					(p) => `
						<div class="score-row">
							<div>
								<div class="score-name">${escapeHtml(p.name)}</div>
								<div class="score-meta">${p.score || 0} pts</div>
							</div>
							<span class="status-pill ${
								warmup.resolved && warmup.winnerId === p.userId
									? 'winner'
									: warmupMap.has(p.userId)
										? 'answered'
										: 'thinking'
							}">${
								warmup.resolved && warmup.winnerId === p.userId
									? 'Starter'
									: warmupMap.has(p.userId)
										? 'Answered'
										: 'Thinking'
							}</span>
						</div>
					`,
				)
				.join('');
			stage.innerHTML = `
				<div class="game-stage-header with-toggle">
					${renderHeaderRowsToggleControl()}
					<div class="game-stage-header-main">
						<h3>${escapeHtml(game.name)}</h3>
						<p>Warmup Challenge - Answer fast to start</p>
					</div>
					<div class="game-stage-actions">
						<button class="workspace-btn ghost small" data-action="leave-stage">Leave Match</button>
					</div>
					${renderGameHeaderRows(headerRows)}
				</div>
				<div class="game-stage-body">
					<div class="game-scoreboard">
						${warmupInfo}
					</div>
					<div class="game-main">
						<div class="game-question">${escapeHtml(warmup.question || '')}</div>
						<p class="game-hint">Attempts left before a new operation: ${attemptsLeft}</p>
						<div class="game-answer-box">
							<input type="text" id="warmupAnswerInput" class="form-control" placeholder="Your answer" />
							<button type="button" class="workspace-btn small" data-action="submit-warmup" data-game-id="${game.id}">Submit</button>
						</div>
					</div>
				</div>
			`;
			return;
		}

		const cardInfo = renderGameScoreboardInfo({
			game,
			session,
			context,
			mode: 'card',
			timerStartedAt: activeTimerStartedAt,
			timerLimitSeconds: activeTurnLimit,
			timerIdleLabel: `${formatReadableSeconds(activeTurnLimit)} / turn`,
			handCount: myDeck.length,
			deckRemaining,
			turnLabel,
		});
		const headerRows = session.participants
			.map(
				(p) => {
					const inactiveStatus = getInactiveParticipantStatusMeta(p);
					const statusClass = inactiveStatus
						? inactiveStatus.statusClass
						: pending
							? sameUserIdValue(p.userId, pending?.targetId)
								? 'answering'
								: sameUserIdValue(p.userId, pending?.pickerId || pickerUserId)
									? 'turn'
									: sameUserIdValue(p.userId, pending?.ownerId)
										? 'waiting'
										: 'waiting'
							: sameUserIdValue(p.userId, pickerUserId)
								? 'turn'
								: 'waiting';
					const statusLabel = inactiveStatus
						? inactiveStatus.statusLabel
						: pending
							? sameUserIdValue(p.userId, pending?.targetId)
								? 'Answering'
								: sameUserIdValue(p.userId, pending?.pickerId || pickerUserId)
									? 'Picked'
									: sameUserIdValue(p.userId, pending?.ownerId)
										? 'Deck Used'
										: 'Waiting'
							: sameUserIdValue(p.userId, pickerUserId)
								? sameUserIdValue(p.userId, context?.user?.id)
									? 'Your Turn'
									: 'Picking'
								: sameUserIdValue(p.userId, sourceOwnerId)
									? 'Defending'
									: 'Waiting';
					return `
						<div class="score-row">
							<div>
								<div class="score-name">${(p.winningStreak || 0) >= 3 ? 'HOT ' : ''}${escapeHtml(p.name)}</div>
								<div class="score-meta">${p.score || 0} pts</div>
							</div>
							<span class="status-pill ${statusClass}">${statusLabel}</span>
						</div>
					`;
				},
			)
			.join('');

		const cardModeTitle = isDrawMode ? 'Card Draw Battle' : 'Card Battle';
		let stageSubtitle = `${cardModeTitle} - ${
			isTurnPicker && !pending
				? isDrawMode
					? `Pick from ${sourceOwnerParticipant?.name || 'opponent'} deck`
					: 'Choose a card to send'
				: pending
					? `${getParticipant(session, pending?.targetId)?.name || 'Target'} is answering`
					: `Waiting for ${pickerParticipant?.name || 'opponent'}`
		}`;

		stage.innerHTML = `
			<div class="game-stage-header with-toggle">
				${renderHeaderRowsToggleControl()}
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>${escapeHtml(stageSubtitle)}</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Leave Match</button>
				</div>
				${renderGameHeaderRows(headerRows)}
			</div>
			<div class="game-stage-body">
				<div class="game-scoreboard">
					${cardInfo}
				</div>
				<div class="game-main">
					${specialImpactBanner}
					${selectedSpecialPreview}
					<div class="game-hint">
						${
							isDrawMode
								? `Challenge progress: ${myAnsweredCount}/${answerLimitPerPlayer} answered.`
								: `Cards left in your deck: ${myDeck.length}`
						}
					</div>
					${
						isTurnPicker && !pending
							? `
						<div class="game-hint">${
							isDrawMode
								? `Pick one hidden card from ${escapeHtml(sourceOwnerParticipant?.name || 'your opponent')} deck. You will answer it.`
								: 'Choose one card from your deck to challenge the target player.'
						}</div>
						${specialPicker}
						<div class="card-hand">
							<div class="card-count">${
								isDrawMode
									? `${escapeHtml(sourceOwnerParticipant?.name || 'Opponent')} deck: ${opponentDeck.length} hidden card(s)`
									: `Cards left: ${myDeck.length}`
							}</div>
							${
								isDrawMode
									? !myPickLimitReached && canPickFromOpponent
										? opponentDeck
												.map((cardId, index) => {
													const suit = getSuitForCard(cardId);
													return `
										<button
											type="button"
											class="play-card play-card--hidden ${escapeHtml(selectedSpecialCardClass)}"
											data-action="play-card"
											data-game-id="${game.id}"
											data-card-id="${cardId}"
										>
											<div class="play-card-face">
												${
													selectedSpecialLabel
														? `<div class="play-card-special-tag">${escapeHtml(
																selectedSpecialLabel,
															)}</div>`
														: ''
												}
												<div class="play-card-corner top">
													<span class="play-card-rank">#${escapeHtml(String(index + 1))}</span>
													<span class="play-card-suit ${escapeHtml(suit.color)}">${suit.symbol}</span>
												</div>
												<div class="play-card-question">Hidden Challenge</div>
												<div class="play-card-meta-grid">
													<div class="meta-item">
														<span class="meta-label">Source</span>
														<span class="meta-value">${escapeHtml(sourceOwnerParticipant?.name || 'Opponent')}</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Reveal</span>
														<span class="meta-value">After pick</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Difficulty</span>
														<span class="meta-value">Unknown</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Action</span>
														<span class="meta-value">Tap to draw</span>
													</div>
												</div>
												<div class="play-card-corner bottom">
													<span class="play-card-rank">#${escapeHtml(String(index + 1))}</span>
													<span class="play-card-suit ${escapeHtml(suit.color)}">${suit.symbol}</span>
												</div>
											</div>
										</button>
									`;
												})
												.join('')
										: myPickLimitReached
											? `<span class="game-hint">You completed your ${answerLimitPerPlayer} card challenges in this lobby.</span>`
											: `<span class="game-hint">No hidden cards available in ${escapeHtml(sourceOwnerParticipant?.name || 'opponent')} deck.</span>`
									: hasCards
										? myDeck
												.map((cardId) => {
													const card = game.questions.find((q) =>
														sameCardQuestionIdValue(q?.id, cardId),
													);
													const cardIndex =
														game.questions.findIndex((q) =>
															sameCardQuestionIdValue(q?.id, cardId),
														) + 1;
													const suit = getSuitForCard(cardId);
													const questionText =
														card?.text || card?.question || '';
													const difficulty = formatDifficulty(
														card?.difficulty || 'medium',
													);
													const points = Number.isFinite(card?.points)
														? card.points
														: game.settings?.pointsCorrect || 10;
													const typeLabel = formatQuestionType(
														card?.type || 'multiple-choice',
													);
													const categoryLabel = card
														? getQuestionCategoryLabel(card, categoryMap)
														: 'Uncategorized';
													const answerText = getCardPreviewAnswerText(card);
													const explanationText =
														card?.explanation || 'No explanation provided.';
													return `
										<button type="button" class="play-card ${escapeHtml(
											selectedSpecialCardClass,
										)}" data-action="play-card" data-game-id="${game.id}" data-card-id="${cardId}">
											<div class="play-card-face">
													${
														selectedSpecialLabel
															? `<div class="play-card-special-tag">${escapeHtml(
																	selectedSpecialLabel,
																)}</div>`
															: ''
													}
													<div class="play-card-corner top">
														<span class="play-card-rank">Q${escapeHtml(String(cardIndex || '?'))}</span>
														<span class="play-card-suit ${escapeHtml(suit.color)}">${suit.symbol}</span>
													</div>
												<div class="play-card-question">
													${escapeHtml(questionText || 'Question')}
												</div>
												<div class="play-card-meta-grid">
													<div class="meta-item">
														<span class="meta-label">Difficulty</span>
														<span class="meta-value">${escapeHtml(difficulty)}</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Points</span>
														<span class="meta-value">${escapeHtml(String(points))}</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Type</span>
														<span class="meta-value">${escapeHtml(typeLabel)}</span>
													</div>
													<div class="meta-item">
														<span class="meta-label">Category</span>
														<span class="meta-value">${escapeHtml(categoryLabel)}</span>
													</div>
												</div>
												<div class="play-card-answer-block">
													<div class="answer-label">Correct Answer</div>
													<div class="answer-value">${escapeHtml(answerText)}</div>
													<div class="answer-label">Explanation</div>
													<div class="answer-value">${escapeHtml(explanationText)}</div>
												</div>
													<div class="play-card-corner bottom">
														<span class="play-card-rank">Q${escapeHtml(String(cardIndex || '?'))}</span>
														<span class="play-card-suit ${escapeHtml(suit.color)}">${suit.symbol}</span>
													</div>
											</div>
										</button>
									`;
												})
												.join('')
										: `<span class="game-hint">No cards left in your deck.</span>`
							}
						</div>
					`
							: ''
					}
					${
						pending && isTurnPicker && !isTarget
							? `<p class="game-hint">Card sent to ${escapeHtml(
									getParticipant(session, pending.targetId)?.name || 'opponent',
								)}. Waiting for their answer.</p>`
							: ''
					}
					${
						isTarget && question
							? `
                        <div class="question-effect-frame ${escapeHtml(
													getSpecialCardStyleClass(
														pending?.specialCard,
														'question-effect-frame--',
													),
												)}">
							${
								pending?.specialCard
									? `<div class="question-effect-label">${escapeHtml(
											pending?.specialCardLabel ||
												getSpecialCardLabel(pending?.specialCard),
										)} effect applied</div>`
									: ''
							}
                        	${renderGameQuestionInterface({
														game,
														question,
														mode: 'card',
														answered: false,
														allowHint: Boolean(
															game.settings?.gameRules?.hintCost,
														),
														specialCardId: pending?.specialCard || '',
													})}
						</div>
                    `
							: ''
					}
					${
						isTarget && pending && !question
							? '<p class="game-hint">Loading your question...</p>'
							: ''
					}
                    ${
											!isTurnPicker && !isTarget
												? pending
													? `<p class="game-hint">Waiting for ${escapeHtml(
															getParticipant(session, pending?.targetId)
																?.name || 'opponent',
														)} to answer...</p>`
													: `<p class="game-hint">Waiting for ${escapeHtml(
															getParticipant(session, pickerUserId)?.name ||
																'opponent',
														)} to ${isDrawMode ? 'pick a hidden card' : 'play a card'}.</p>`
												: ''
										}
				</div>
			</div>
		`;
	}

	function renderCompletedStage(stage, game, context) {
		const renderCompletedQuestionCorrections = (currentGame) => {
			const collectCompletedReviewQuestionEntries = (targetGame) => {
				const primaryQuestions = Array.isArray(targetGame?.questions)
					? targetGame.questions
					: [];
				const penaltyQuestions = Array.isArray(targetGame?.penaltyQuestions)
					? targetGame.penaltyQuestions
					: [];
				const allEntries = [
					...primaryQuestions.map((question) => ({
						question,
						source: 'main',
					})),
					...penaltyQuestions.map((question) => ({
						question,
						source: 'penalty',
					})),
				];
				if (!allEntries.length) return [];

				const orderedIds = [];
				const seenIds = new Set();
				const pushId = (questionId) => {
					const normalized = getNormalizedQuestionIdValue(questionId)
						.toLowerCase()
						.trim();
					if (!normalized || seenIds.has(normalized)) return;
					seenIds.add(normalized);
					orderedIds.push(normalized);
				};

				const resultsQuestionIds = Array.isArray(
					targetGame?.results?.questionReviewIds,
				)
					? targetGame.results.questionReviewIds
					: [];
				resultsQuestionIds.forEach((questionId) => pushId(questionId));

				const session = targetGame?.session || {};
				(Array.isArray(session.roundHistory)
					? session.roundHistory
					: []
				).forEach((round) => {
					pushId(round?.questionId);
				});
				(Array.isArray(session.card?.history)
					? session.card.history
					: []
				).forEach((entry) => {
					pushId(entry?.questionId);
				});
				(Array.isArray(session.tieBreakHistory)
					? session.tieBreakHistory
					: []
				).forEach((entry) => {
					pushId(entry?.questionId);
				});
				if (session.tieBreak?.resolved) {
					pushId(session.tieBreak?.questionId);
				}

				const matchedEntries = orderedIds
					.map((questionId) =>
						allEntries.find((entry) =>
							sameQuestionIdValue(entry?.question?.id, questionId),
						),
					)
					.filter(Boolean);
				if (matchedEntries.length) return matchedEntries;
				if (primaryQuestions.length) {
					return primaryQuestions.map((question) => ({
						question,
						source: 'main',
					}));
				}
				return penaltyQuestions.map((question) => ({
					question,
					source: 'penalty',
				}));
			};

			const reviewEntries = collectCompletedReviewQuestionEntries(currentGame);
			if (!reviewEntries.length) return '';

			const cardsHtml = reviewEntries
				.map((entry, index) => {
					const question = entry?.question || {};
					const prompt =
						getGameQuestionPrompt(question) || 'Question text not available';
					const answerText =
						getCardPreviewAnswerText(question) || 'No answer key available';
					const typeLabel = formatQuestionType(
						normalizeGameQuestionType(question) || 'question',
					);
					const penaltyTag =
						entry?.source === 'penalty'
							? '<span class="completed-correction-tag">Penalty</span>'
							: '';
					return `
						<article class="completed-correction-item">
							<div class="completed-correction-top">
								<span class="completed-correction-number">Q${index + 1}</span>
								<span class="completed-correction-type">${escapeHtml(typeLabel)}</span>
								${penaltyTag}
							</div>
							<div class="completed-correction-question">${escapeHtml(prompt)}</div>
							<div class="completed-correction-answer-label">Correct answer</div>
							<div class="completed-correction-answer">${escapeHtml(answerText)}</div>
						</article>
					`;
				})
				.join('');

			return `
				<section class="completed-corrections">
					<div class="completed-corrections-header">
						<h4>Corrections &amp; Answer Key</h4>
						<p>Review the lobby questions together and learn from the correct answers.</p>
					</div>
					<div class="completed-corrections-list">
						${cardsHtml}
					</div>
				</section>
			`;
		};

		const results = game.results || {};
		const winners = Array.isArray(results.winners) ? results.winners : [];
		const leaderboard = Array.isArray(results.leaderboard)
			? results.leaderboard
			: [];
		const lobbyLabel = getLobbyLabelForGame(game);
		const outcome = context ? getGameOutcome(game, context) : null;
		const winnerNames = winners
			.map((winner) => winner?.name || winner?.id || '')
			.filter(Boolean);
		const winnerLabel = winnerNames.length
			? winnerNames.join(', ')
			: 'No winner';
		const sprintResolution = results?.sprintResolution || null;
		const sprintNoWinnerNote =
			!winnerNames.length &&
			normalizeGameTypeValue(game?.type) === 'sprint-race' &&
			sprintResolution?.timedOut
				? `<div class="game-hint">Sprint timer ended. Highest progress was ${escapeHtml(
						String(sprintResolution.highestProgress || 0),
					)}. No winner was declared.</div>`
				: '';
		const finishedAt = results?.endedAt || game?.session?.endedAt || '';
		const finishedAtLabel = finishedAt
			? new Date(finishedAt).toLocaleString()
			: 'Recently';

		stage.innerHTML = `
			<div class="game-stage-header completed-stage-header">
				<div class="game-stage-header-main">
					<h3>${escapeHtml(game.name)}</h3>
					<p>${escapeHtml(lobbyLabel)} completed - Congratulations!</p>
				</div>
				<div class="game-stage-actions">
					<button class="workspace-btn ghost small" data-action="leave-stage">Close</button>
				</div>
			</div>
			<div class="game-stage-body completed-stage-body">
				<div class="game-main completed-stage-main">
					<div class="game-scoreboard completed-scoreboard">
						${
							leaderboard.length
								? leaderboard
										.map(
											(entry, index) => `
								<div class="score-row">
									<span>${escapeHtml(`#${index + 1} ${entry.name || entry.id || 'Player'}`)}</span>
									<span class="score-pill">${escapeHtml(String(entry.score || 0))} pts</span>
								</div>
							`,
										)
										.join('')
								: '<div class="empty-state">No leaderboard data available.</div>'
						}
					</div>
					<div class="completed-stage-hero">
						<div class="winner-banner">Champion: ${escapeHtml(winnerLabel)}</div>
						${sprintNoWinnerNote}
						<div class="completed-stage-meta">
							<span class="game-badge">${escapeHtml(getWorkspaceGameTypeLabel(game.type))}</span>
							<span class="game-badge ghost">${escapeHtml(
								game.mode === 'team' ? 'Team vs Team' : '1 vs 1',
							)}</span>
							<span class="game-badge ghost">${escapeHtml(finishedAtLabel)}</span>
						</div>
					</div>
					<div class="completed-stage-grid">
						<div class="completed-stage-card">
							<div class="stat-label">Your Result</div>
							<div class="stat-value">${escapeHtml(outcome?.label || 'Not Played')}</div>
							<div class="stat-note">${
								outcome
									? `Rank ${escapeHtml(String(outcome.rank || '-'))} - ${escapeHtml(
											String(outcome.score || 0),
										)} pts`
									: 'You were not in this lobby'
							}</div>
							${
								outcome
									? `<div class="stat-note">Time ${escapeHtml(
											formatDuration(outcome.timeSpent),
										)}</div>`
									: ''
							}
						</div>
						<div class="completed-stage-card">
							<div class="stat-label">Lobby Summary</div>
							<div class="stat-value">${escapeHtml(lobbyLabel)}</div>
							<div class="stat-note">${escapeHtml(String(leaderboard.length || 0))} ranked players</div>
						</div>
					</div>
					${renderCompletedQuestionCorrections(game)}
				</div>
			</div>
		`;
	}

	function resolveRaceRound(game) {
		const session = ensureSession(game);
		if (!session.round && game.questions.length) {
			session.roundIndex = session.roundIndex || 0;
			session.round = {
				questionId: game.questions[session.roundIndex]?.id || '',
				startedAt: Date.now(),
				answers: [],
				resolved: false,
			};
			return;
		}
		const round = session.round;
		if (!round || round.resolved) return;
		const answers = round.answers || [];
		const participants = session.participants || [];
		const allAnswered = participants.length
			? answers.length >= participants.length
			: false;
		const timeLimit =
			toPositiveNumber(game.settings?.questionTimeLimit, 20) * 1000;
		const expired = Date.now() - round.startedAt >= timeLimit;

		if (!allAnswered && !expired) return;

		const correctAnswers = answers.filter((a) => a.correct);
		let winner = null;
		if (correctAnswers.length) {
			winner = correctAnswers.sort((a, b) => a.answeredAt - b.answeredAt)[0];
		}

		answers.forEach((answer) => {
			const participant = participants.find((p) => p.userId === answer.userId);
			if (participant) {
				participant.timeSpent += answer.answeredAt - round.startedAt;
			}
		});

		if (winner) {
			const participant = participants.find((p) => p.userId === winner.userId);
			if (participant) {
				participant.score += game.settings?.pointsCorrect || 10;
			}
		}

		round.resolved = true;
		round.winnerId = winner ? winner.userId : '';
		session.roundHistory = session.roundHistory || [];
		session.roundHistory.push(round);

		session.roundIndex += 1;
		if (session.roundIndex >= game.questions.length) {
			finalizeGame(game);
			return;
		}
		session.round = {
			questionId: game.questions[session.roundIndex]?.id || '',
			startedAt: Date.now(),
			answers: [],
			resolved: false,
		};
	}

	function resolveCardTimeout(game) {
		const session = ensureSession(game);
		const cardState = session.card;
		const pending = cardState?.pendingCard;
		if (!pending) return;
		const limit = getPendingCardTimeLimitMs(game, pending);
		if (Date.now() - pending.startedAt < limit) return;
		resolveCardAnswer(game, pending, '', false, true);
	}

	function resolveOwnerCardSelectionTimeout(game) {
		const session = ensureSession(game);
		const cardState = session.card;
		if (!cardState || cardState.pendingCard) return false;
		const rules = game.settings?.gameRules || {};
		const autoEnabled = Boolean(
			game.settings?.autoPlayTurnTimeoutCard ??
			rules.autoPlayTimeoutCard ??
			true,
		);
		if (!autoEnabled) return false;
		const order = cardState.turnOrder || [];
		if (order.length < 2) return false;
		const ownerId = order[cardState.turnIndex];
		const hand = cardState.hands?.[ownerId] || [];
		if (!hand.length) return false;
		const limit = toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
		const startedAt = parseTimestampMs(cardState.turnStartedAt);
		if (!startedAt) {
			cardState.turnStartedAt = Date.now();
			return false;
		}
		if (Date.now() - startedAt < limit) return false;
		const cardId = normalizeCardQuestionIdValue(
			hand[Math.floor(Math.random() * hand.length)],
		);
		if (!cardId) return false;
		const targetId = order[(cardState.turnIndex + 1) % order.length];
		cardState.pendingCard = {
			ownerId,
			targetId,
			questionId: cardId,
			startedAt: Date.now(),
			autoPlayed: true,
			specialCard: '',
			specialCardLabel: '',
			timeLimitMs: null,
		};
		cardState.turnStartedAt = null;
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
		const session = ensureSession(game);
		const cardState = session.card;
		const participants = session.participants || [];
		const ownerId = String(pending?.ownerId || '');
		const targetId = String(pending?.targetId || '');
		const questionId = normalizeCardQuestionIdValue(pending?.questionId);
		const owner = participants.find((p) => String(p.userId || '') === ownerId);
		const target = participants.find(
			(p) => String(p.userId || '') === targetId,
		);
		const points = game.settings?.pointsCorrect || 10;
		const specialCardId = normalizeSpecialCardId(pending?.specialCard);
		const specialCardLabel =
			pending?.specialCardLabel || getSpecialCardLabel(specialCardId);

		if (target) {
			const timeoutLimitMs = getPendingCardTimeLimitMs(game, pending);
			const timeSpent = timedOut
				? timeoutLimitMs
				: Date.now() - pending.startedAt;
			target.timeSpent += timeSpent;
		}

		const specialOutcomeNotes = [];
		let keptOwnerCard = false;
		let stolenCardId = '';
		let pointsAwarded = 0;
		let pointsRecipientId = '';
		if (isCorrect) {
			if (target) {
				let awardedPoints = points;
				if (specialCardId === 'double-or-nothing') {
					awardedPoints *= 2;
					specialOutcomeNotes.push('Double or Nothing doubled the reward.');
				} else if (specialCardId === 'combo-breaker') {
					awardedPoints = Math.max(1, Math.round(awardedPoints * 0.5));
					specialOutcomeNotes.push('Combo Breaker reduced the reward by half.');
				} else if (specialCardId === 'overclock') {
					awardedPoints = Math.max(1, Math.round(awardedPoints * 1.5));
					specialOutcomeNotes.push('Overclock boosted the reward.');
				} else if (specialCardId === 'shield') {
					specialOutcomeNotes.push(
						'Shield did not trigger because the answer was correct.',
					);
				}
				if (game.settings?.gameRules?.hintCost && hintUsed) {
					awardedPoints = Math.round(awardedPoints * 0.5);
				}
				target.score += awardedPoints;
				pointsAwarded = awardedPoints;
				pointsRecipientId = target.userId;
			}
		} else if (owner) {
			let ownerPoints = points;
			if (specialCardId === 'mirror' || specialCardId === 'double-or-nothing') {
				ownerPoints *= 2;
				if (specialCardId === 'mirror') {
					specialOutcomeNotes.push('Mirror doubled the penalty points.');
				} else {
					specialOutcomeNotes.push(
						'Double or Nothing doubled the penalty points.',
					);
				}
			} else if (specialCardId === 'combo-breaker') {
				ownerPoints = Math.max(1, Math.round(ownerPoints * 1.5));
				specialOutcomeNotes.push(
					'Combo Breaker granted a bonus on wrong answer.',
				);
			} else if (specialCardId === 'overclock') {
				ownerPoints = Math.max(1, Math.round(ownerPoints * 1.5));
				specialOutcomeNotes.push('Overclock boosted the penalty points.');
			} else if (specialCardId === 'shield') {
				keptOwnerCard = true;
				specialOutcomeNotes.push(
					'Shield protected this card from being discarded.',
				);
			}
			owner.score += ownerPoints;
			pointsAwarded = ownerPoints;
			pointsRecipientId = owner.userId;
		}

		const normalizeHand = (hand) =>
			Array.isArray(hand)
				? hand
						.map((cardId) => normalizeCardQuestionIdValue(cardId))
						.filter(Boolean)
				: [];
		if (!isCorrect && specialCardId === 'steal' && owner && target) {
			const targetHand = normalizeHand(cardState.hands?.[targetId] || []);
			const stealable = targetHand.filter(
				(cardId) => !sameCardQuestionIdValue(cardId, questionId),
			);
			if (stealable.length) {
				stolenCardId = stealable[Math.floor(Math.random() * stealable.length)];
				cardState.hands[targetId] = targetHand.filter(
					(cardId) => !sameCardQuestionIdValue(cardId, stolenCardId),
				);
				const ownerHandWithStolen = normalizeHand(
					cardState.hands?.[ownerId] || [],
				);
				if (
					!ownerHandWithStolen.some((cardId) =>
						sameCardQuestionIdValue(cardId, stolenCardId),
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

		const ownerHand = normalizeHand(cardState.hands?.[ownerId] || []);
		cardState.hands[ownerId] = keptOwnerCard
			? ownerHand
			: ownerHand.filter(
					(cardId) => !sameCardQuestionIdValue(cardId, questionId),
				);

		cardState.pendingCard = null;
		cardState.lastResult = {
			ownerId: pending.ownerId,
			targetId: pending.targetId,
			questionId,
			answer,
			isCorrect,
			hintUsed: Boolean(hintUsed),
			timedOut: Boolean(timedOut),
			autoPlayed: Boolean(pending?.autoPlayed),
			specialCard: specialCardId,
			specialCardLabel,
			specialOutcome: specialOutcomeNotes.join(' '),
			keptOwnerCard: Boolean(keptOwnerCard),
			stolenCardId: stolenCardId || '',
			pointsAwarded,
			pointsRecipientId,
			endedAt: Date.now(),
		};

		const turnOrder = cardState.turnOrder || [];
		const targetIndex = turnOrder.findIndex(
			(id) => String(id || '') === targetId,
		);
		cardState.turnIndex = targetIndex >= 0 ? targetIndex : 0;
		cardState.turnStartedAt = Date.now();

		if (allHandsEmpty(cardState.hands)) {
			finalizeGame(game);
		}
	}

	function allHandsEmpty(hands = {}) {
		return Object.values(hands).every((hand) => !hand || hand.length === 0);
	}

	function computeResults(game) {
		const session = ensureSession(game);
		const lobbyId = String(
			session.lobbyId || `${game.id}-lobby-${game.lobbyCounter || 1}`,
		);
		const lobbyLabel = String(session.lobbyLabel || getLobbyLabelForGame(game));
		const participants = session.participants || [];
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
				endedAt: new Date().toISOString(),
				lobbyId,
				lobbyLabel,
			};
		}
		const leaderboard = participants
			.map((p) => ({ ...p }))
			.sort((a, b) => {
				if ((b.score || 0) !== (a.score || 0))
					return (b.score || 0) - (a.score || 0);
				return (a.timeSpent || 0) - (b.timeSpent || 0);
			});
		return {
			winners: leaderboard.slice(0, 1),
			leaderboard,
			endedAt: new Date().toISOString(),
			lobbyId,
			lobbyLabel,
		};
	}

	function getLeaderboardId(entry, game) {
		if (game.mode === 'team') return entry.id;
		return entry.userId || entry.id;
	}

	function startTieBreak(game, candidateIds) {
		const session = ensureSession(game);
		if (!game.penaltyQuestions || !game.penaltyQuestions.length) return false;
		const index = session.tieBreak?.index || 0;
		const question =
			game.penaltyQuestions[index % game.penaltyQuestions.length];
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
		const session = ensureSession(game);
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
					session.tieBreak = session.tieBreak;
					return null;
				}
			}
		}

		game.status = 'completed';
		session.status = 'completed';
		game.results = results;
		return results;
	}

	function finalizeTieBreak(game, winnerId) {
		const session = ensureSession(game);
		const results = computeResults(game);
		const leaderboard = results?.leaderboard || [];
		const winnerEntry = leaderboard.find(
			(entry) => getLeaderboardId(entry, game) === winnerId,
		);
		results.winners = winnerEntry ? [winnerEntry] : results.winners;
		game.results = results;
		game.status = 'completed';
		session.status = 'completed';
		if (session.tieBreak) {
			session.tieBreak.resolved = true;
			session.tieBreak.winnerId = winnerId;
		}
		return results;
	}

	function getGameStageSignature(game) {
		if (!game) return '';
		const session = game.session || {};
		const round = session.round || {};
		const card = session.card || {};
		const hotPotato = session.hotPotato || {};
		const lastSurvivor = session.lastSurvivor || {};
		const pending = card.pendingCard || {};
		const warmup = session.warmup || {};
		const tieBreak = session.tieBreak || {};
		const roundQuestionId = getNormalizedQuestionIdValue(round.questionId);
		const pendingQuestionId = normalizeCardQuestionIdValue(pending.questionId);
		const tieBreakQuestionId = getNormalizedQuestionIdValue(
			tieBreak.questionId,
		);
		const questionList = Array.isArray(game.questions) ? game.questions : [];
		const penaltyQuestionList = Array.isArray(game.penaltyQuestions)
			? game.penaltyQuestions
			: [];
		const getQuestionRenderSignature = (collection, questionId) => {
			const targetId = normalizeCardQuestionIdValue(questionId);
			if (!targetId) return '';
			const match = (collection || []).find((item) =>
				sameCardQuestionIdValue(item?.id, targetId),
			);
			if (!match) return `${targetId}:missing`;
			const promptText = String(match?.text || match?.question || '').trim();
			const choiceCount = Array.isArray(match?.choices)
				? match.choices.length
				: Array.isArray(match?.options)
					? match.options.length
					: 0;
			return `${targetId}:ready:${promptText.length}:${choiceCount}`;
		};
		const roundQuestionSignature = getQuestionRenderSignature(
			questionList,
			roundQuestionId,
		);
		const pendingQuestionSignature = getQuestionRenderSignature(
			questionList,
			pendingQuestionId,
		);
		const tieBreakQuestionSignature = getQuestionRenderSignature(
			penaltyQuestionList,
			tieBreakQuestionId,
		);
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const participantsSummary = participants
			.map(
				(p) =>
					`${p.userId || ''}:${p.score || 0}:${p.ready ? '1' : '0'}:${
						p.teamId || ''
					}:${p.timeSpent || 0}:${p.state || ''}:${String(
						p.eliminationReason || '',
					)
						.trim()
						.toLowerCase()}`,
			)
			.sort()
			.join(',');
		const roundAnswers = filterAnswersForCurrentRound(
			round.answers || [],
			round.startedAt,
		)
			.map((a) => `${a.userId || ''}:${a.correct ? '1' : '0'}`)
			.sort()
			.join(',');
		const warmupAnswers = (warmup.answers || [])
			.map((a) => `${a.userId || ''}:${a.correct ? '1' : '0'}`)
			.sort()
			.join(',');
		const tieBreakAnswers = filterAnswersForCurrentRound(
			tieBreak.answers || [],
			tieBreak.startedAt,
		)
			.map((a) => `${a.userId || ''}:${a.correct ? '1' : '0'}`)
			.sort()
			.join(',');
		const handSizes = Object.entries(card.hands || {})
			.map(
				([userId, hand]) =>
					`${userId}:${Array.isArray(hand) ? hand.length : 0}`,
			)
			.sort()
			.join(',');
		const hotPotatoSignature = [
			hotPotato.currentPlayerId || '',
			hotPotato.currentPlayerIndex ?? '',
			hotPotato.turnStartedAt || '',
			hotPotato.roundStartedAt || '',
			hotPotato.winnerId || '',
			hotPotato.lastRotationReason || '',
		].join(':');
		const lastSurvivorSignature = [
			Array.isArray(lastSurvivor.activeParticipantIds)
				? lastSurvivor.activeParticipantIds
						.map((id) => normalizeUserIdValue(id))
						.filter(Boolean)
						.sort()
						.join(',')
				: '',
			Array.isArray(lastSurvivor.eliminatedParticipantIds)
				? lastSurvivor.eliminatedParticipantIds
						.map((id) => normalizeUserIdValue(id))
						.filter(Boolean)
						.sort()
						.join(',')
				: '',
			lastSurvivor.winnerId || '',
			lastSurvivor.bonusAwarded ? '1' : '0',
		].join(':');

		const sprint = session.sprint || {};
		const sprintSignature = Object.entries(sprint.byUser || {})
			.map(
				([uid, entry]) =>
					`${uid}:${entry.questionIndex || 0}:${entry.finishedAt ? '1' : '0'}`,
			)
			.sort()
			.join(',');

		return [
			game.status || '',
			session.lobbyId || '',
			session.lobbyLabel || '',
			roundQuestionId,
			round.resolved ? '1' : '0',
			roundAnswers,
			roundQuestionSignature,
			card.turnIndex ?? '',
			pendingQuestionId,
			pending.targetId || '',
			handSizes,
			pendingQuestionSignature,
			warmup.resolved ? '1' : '0',
			warmup.winnerId || '',
			warmup.startedAt || '',
			warmup.attempts || 0,
			warmup.round || 0,
			warmup.question || '',
			warmupAnswers,
			tieBreak.resolved ? '1' : '0',
			tieBreakQuestionId,
			tieBreak.startedAt || '',
			tieBreakAnswers,
			tieBreakQuestionSignature,
			participants.length,
			participantsSummary,
			hotPotatoSignature,
			lastSurvivorSignature,
			sprintSignature,
			game.results?.endedAt || '',
		].join('|');
	}

	function getActiveQuestionKeyFromStageSignature(signature) {
		const parts = String(signature || '').split('|');
		// Indexes follow getGameStageSignature() order:
		// 3 => round.questionId, 8 => pending.questionId, 20 => tieBreak.questionId
		const roundQuestionId = String(parts[3] || '');
		const pendingQuestionId = String(parts[8] || '');
		const tieBreakQuestionId = String(parts[20] || '');
		return pendingQuestionId || tieBreakQuestionId || roundQuestionId;
	}

	function ensureCardTurnHasCards(game) {
		const session = ensureSession(game);
		const cardState = session.card;
		if (!cardState || cardState.pendingCard) return;
		const order = cardState.turnOrder || [];
		if (!order.length) return;
		if (allHandsEmpty(cardState.hands)) {
			finalizeGame(game);
			return;
		}
		const previousTurnIndex = Number(cardState.turnIndex) || 0;
		let guard = order.length;
		while (guard > 0) {
			const ownerId = order[cardState.turnIndex];
			const hand = cardState.hands?.[ownerId] || [];
			if (hand.length) {
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
	}

	function tickActiveGame(context) {
		if (!context) return;
		const socket = getSocket();
		if (socket && socket.connected) return;
		const games = getGamesStore().filter((g) => g && g.status === 'live');
		games.forEach((current) => {
			const hostId = current.session?.hostId;
			if (hostId && context.user.id !== hostId) return;
			const scope = buildGameScope(current, context);

			let shouldUpdate = false;
			if (
				normalizeGameTypeValue(current?.type) === 'cards' ||
				normalizeGameTypeValue(current?.type) === 'cards-draw'
			) {
				const session = current.session || {};
				const warmup = session.warmup;
				const warmupPending = Boolean(warmup && !warmup.resolved);
				if (warmup && !warmup.resolved) {
					const warmupLimit =
						toPositiveNumber(current.settings?.turnTimeLimit, 30) * 1000;
					const startedMs = parseTimestampMs(warmup.startedAt) || 0;
					shouldUpdate = Date.now() - startedMs >= warmupLimit;
				}
				const cardState = session.card || {};
				if (!shouldUpdate && !warmupPending) {
					const pending = cardState.pendingCard;
					if (pending) {
						const limit = getPendingCardTimeLimitMs(current, pending);
						shouldUpdate = Date.now() - pending.startedAt >= limit;
					} else {
						const order = cardState.turnOrder || [];
						if (order.length) {
							const ownerId = order[cardState.turnIndex];
							const hands = cardState.hands || {};
							const ownerHand = hands?.[ownerId] || [];
							const anyCards = Object.values(hands).some(
								(hand) => hand && hand.length,
							);
							if (anyCards && ownerHand.length === 0) {
								shouldUpdate = true;
							} else if (anyCards && ownerHand.length) {
								const rules = current.settings?.gameRules || {};
								const autoEnabled = Boolean(
									current.settings?.autoPlayTurnTimeoutCard ??
									rules.autoPlayTimeoutCard ??
									true,
								);
								if (autoEnabled) {
									const startedAtMs =
										parseTimestampMs(cardState.turnStartedAt) || 0;
									const limit =
										toPositiveNumber(current.settings?.turnTimeLimit, 30) *
										1000;
									shouldUpdate =
										startedAtMs > 0 ? Date.now() - startedAtMs >= limit : true;
								}
							}
						}
					}
				}
			} else {
				const session = current.session || {};
				const round = session.round;
				if (round && !round.resolved) {
					const participants = session.participants || [];
					const answers = round.answers || [];
					const allAnswered = participants.length
						? answers.length >= participants.length
						: false;
					const timeLimit =
						toPositiveNumber(current.settings?.questionTimeLimit, 20) * 1000;
					const expired = Date.now() - round.startedAt >= timeLimit;
					shouldUpdate = allAnswered || expired;
				}
			}

			if (!shouldUpdate) return;

			const beforeSig = getGameStageSignature(current);
			const updated = updateGameStore(
				current.id,
				(game) => {
					if (!game || game.status !== 'live') return game;
					if (
						normalizeGameTypeValue(game?.type) === 'cards' ||
						normalizeGameTypeValue(game?.type) === 'cards-draw'
					) {
						const warmup = game.session?.warmup;
						if (warmup && !warmup.resolved) {
							const warmupLimit =
								toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
							const startedMs = parseTimestampMs(warmup.startedAt) || 0;
							if (Date.now() - startedMs >= warmupLimit) {
								resetLocalWarmupChallenge(game, 'timeout');
							}
							return game;
						}
						ensureCardTurnHasCards(game);
						resolveOwnerCardSelectionTimeout(game);
						resolveCardTimeout(game);
					} else {
						resolveRaceRound(game);
					}
					return game;
				},
				{ sync: true, scope },
			);
			const afterSig = getGameStageSignature(updated);
			renderGamesPanel(context);
			if (state.activeGameId === current.id && beforeSig !== afterSig) {
				renderGameStage(context);
			}
		});
	}

	function submitRaceAnswer(gameId, context, answer, questionIndex) {
		if (!answer) return;
		const socket = getSocket();
		if (socket && socket.connected) {
			socket.emit(
				'game:answer',
				{
					gameId,
					userId: context.user.id,
					answer: String(answer).trim(),
					hintUsed: state.hintUsed || false,
					questionIndex: Number.isFinite(Number(questionIndex))
						? Number(questionIndex)
						: null,
				},
				(response) => {
					if (response?.error) {
						showToast(response.error, 'error');
						setSelectedSpecialCard(gameId, '');
						requestGameSync(gameId, context, 0);
						return;
					}
					requestGameSync(gameId, context, 0);
				},
			);
			return;
		}
		notifyRealtimeDisconnected();
		return;
		// Fallback: local
		const scope = buildGameScope(getGameById(gameId), context);
		updateGameStore(
			gameId,
			(game) => {
				if (!game || game.status !== 'live') return game;
				const session = ensureSession(game);
				const round = session.round;
				if (!round || round.resolved) return game;
				if (round.answers?.some((a) => a.userId === context.user.id))
					return game;
				const question = game.questions.find((q) =>
					sameQuestionIdValue(q?.id, round?.questionId),
				);
				const correct = answerMatchesQuestion(question, String(answer).trim());
				round.answers = round.answers || [];
				round.answers.push({
					userId: context.user.id,
					answer: String(answer).trim(),
					correct,
					answeredAt: Date.now(),
				});
				session.round = round;
				return game;
			},
			{ sync: true, scope },
		);
		renderGameStage(context);
	}

	function generateLocalMathChallenge(game) {
		const operators =
			Array.isArray(game?.settings?.mathOperators) &&
			game.settings.mathOperators.length
				? game.settings.mathOperators
				: ['+'];
		const op = operators[Math.floor(Math.random() * operators.length)];
		const minVal = Number.isFinite(Number(game?.settings?.mathMin))
			? Number(game.settings.mathMin)
			: 1;
		const maxVal = Number.isFinite(Number(game?.settings?.mathMax))
			? Number(game.settings.mathMax)
			: 12;
		const a = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
		const b = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
		let result = 0;
		if (op === '+') result = a + b;
		else if (op === '-') result = a - b;
		else result = a * b;
		return { question: `${a} ${op} ${b} = ?`, answer: String(result) };
	}

	function resetLocalWarmupChallenge(game, reason = '') {
		const session = ensureSession(game);
		const challenge = generateLocalMathChallenge(game);
		const previousRound = Number(session.warmup?.round || 0);
		session.warmup = {
			question: challenge.question,
			answer: challenge.answer,
			startedAt: Date.now(),
			answers: [],
			winnerId: '',
			resolved: false,
			attempts: 0,
			maxAttempts: Math.floor(
				toPositiveNumber(game.settings?.warmupMaxAttempts, 5),
			),
			round: previousRound + 1,
			lastResetReason: String(reason || ''),
		};
		return session.warmup;
	}

	function submitWarmupAnswer(gameId, context, answer) {
		if (!answer) return;
		const socket = getSocket();
		if (socket && socket.connected) {
			socket.emit(
				'game:warmupAnswer',
				{
					gameId,
					userId: context.user.id,
					answer: String(answer).trim(),
				},
				(response) => {
					if (response?.error) {
						showToast(response.error, 'error');
					} else if (response?.rotated && response?.reason === 'attempts') {
						showToast('New math operation generated after 5 attempts.', 'info');
					} else if (response?.rotated && response?.reason === 'timeout') {
						showToast('Time is up. New math operation generated.', 'warning');
					}
					requestGameSync(gameId, context, 0);
				},
			);
			return;
		}
		notifyRealtimeDisconnected();
		return;
		// Fallback: local
		const scope = buildGameScope(getGameById(gameId), context);
		updateGameStore(
			gameId,
			(game) => {
				if (!game || game.status !== 'live') return game;
				const session = ensureSession(game);
				const warmup = session.warmup;
				if (!warmup || warmup.resolved) return game;
				const warmupLimit =
					toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000;
				const startedMs = parseTimestampMs(warmup.startedAt) || 0;
				if (Date.now() - startedMs >= warmupLimit) {
					resetLocalWarmupChallenge(game, 'timeout');
					return game;
				}
				warmup.answers = warmup.answers || [];
				const alreadyCorrect = warmup.answers.some(
					(a) => a.userId === context.user.id && a.correct,
				);
				if (alreadyCorrect) return game;
				const correct =
					String(answer).trim().toLowerCase() ===
					String(warmup.answer || '')
						.trim()
						.toLowerCase();
				warmup.answers = warmup.answers.filter(
					(a) => a.userId !== context.user.id,
				);
				warmup.answers.push({
					userId: context.user.id,
					answer: String(answer).trim(),
					correct,
					answeredAt: Date.now(),
				});
				if (correct && !warmup.resolved) {
					warmup.resolved = true;
					warmup.winnerId = context.user.id;
					const order = session.card?.turnOrder || [];
					const winnerIndex = order.indexOf(context.user.id);
					if (winnerIndex >= 0) session.card.turnIndex = winnerIndex;
					if (session.card) session.card.turnStartedAt = Date.now();
				} else {
					const maxAttempts = Math.floor(
						toPositiveNumber(
							warmup.maxAttempts || game.settings?.warmupMaxAttempts,
							5,
						),
					);
					warmup.attempts = Number(warmup.attempts || 0) + 1;
					if (warmup.attempts >= maxAttempts) {
						resetLocalWarmupChallenge(game, 'attempts');
						return game;
					}
				}
				session.warmup = warmup;
				return game;
			},
			{ sync: true, scope },
		);
		renderGameStage(context);
	}

	function resolveCardPlaySpecialSelection(gameId, context) {
		const game = getGameByIdResolved(gameId) || getCachedGame(gameId) || null;
		if (!game) return '';
		let selectedSpecialCard = getSelectedSpecialCard(gameId);
		if (
			selectedSpecialCard &&
			!isSpecialCardAvailableForGame(game, selectedSpecialCard)
		) {
			setSelectedSpecialCard(gameId, '');
			return '';
		}
		return selectedSpecialCard || '';
	}

	function playCard(gameId, context, cardId, specialCardOverride = undefined) {
		const hasSpecialOverride = specialCardOverride !== undefined;
		const selectedSpecialCard = hasSpecialOverride
			? normalizeSpecialCardId(specialCardOverride)
			: getSelectedSpecialCard(gameId);
		const socket = getSocket();
		if (socket && socket.connected) {
			const payload = {
				gameId,
				userId: context.user.id,
				cardId: cardId || '',
				specialCard: selectedSpecialCard,
			};
			console.log('[GameClient] Emitting game:playCard', payload);
			socket.emit('game:playCard', payload, (response) => {
				console.log('[GameClient] game:playCard ack', response || null);
				if (response?.error) {
					showToast(response.error, 'error');
					requestGameSync(gameId, context, 0);
					return;
				}
				if (selectedSpecialCard) {
					const label =
						getSpecialCardLabel(selectedSpecialCard) || 'Special card';
					showToast(`${label} attached to this question card.`, 'info');
				}
				if (!hasSpecialOverride || selectedSpecialCard) {
					setSelectedSpecialCard(gameId, '');
				}
				requestGameSync(gameId, context, 0);
			});
			return;
		}
		notifyRealtimeDisconnected();
		return;
		// Fallback: local
		const scope = buildGameScope(getGameById(gameId), context);
		updateGameStore(
			gameId,
			(game) => {
				if (!game || game.status !== 'live') return game;
				const session = ensureSession(game);
				const cardState = session.card;
				if (!cardState || cardState.pendingCard) return game;
				const ownerId = cardState.turnOrder?.[cardState.turnIndex];
				if (!sameUserIdValue(ownerId, context.user.id)) return game;
				const order = cardState.turnOrder || [];
				if (order.length < 2) return game;
				const hand = cardState.hands?.[ownerId] || [];
				let selectedId = normalizeCardQuestionIdValue(cardId);
				const selectedInHand = hand.some((handCardId) =>
					sameCardQuestionIdValue(handCardId, selectedId),
				);
				if (!selectedId || !selectedInHand) {
					if (!hand.length) return game;
					const randomIndex = Math.floor(Math.random() * hand.length);
					selectedId = normalizeCardQuestionIdValue(hand[randomIndex]);
				} else {
					selectedId =
						hand.find((handCardId) =>
							sameCardQuestionIdValue(handCardId, selectedId),
						) || selectedId;
					selectedId = normalizeCardQuestionIdValue(selectedId);
				}
				if (!selectedId) return game;
				const targetIndex = (cardState.turnIndex + 1) % order.length;
				const targetId = order[targetIndex];
				let timeLimitMs = null;
				let specialCardId = normalizeSpecialCardId(selectedSpecialCard);
				let specialCardLabel = getSpecialCardLabel(specialCardId);
				if (
					specialCardId &&
					!isSpecialCardAvailableForGame(game, specialCardId)
				) {
					specialCardId = '';
					specialCardLabel = '';
				}
				if (specialCardId === 'time-warp') {
					timeLimitMs = Math.max(
						Math.round(
							toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000 * 0.5,
						),
						5000,
					);
				} else if (specialCardId === 'freeze') {
					timeLimitMs = Math.max(
						Math.round(
							toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000 * 0.35,
						),
						3000,
					);
				} else if (specialCardId === 'overclock') {
					timeLimitMs = Math.max(
						Math.round(
							toPositiveNumber(game.settings?.turnTimeLimit, 30) * 1000 * 0.6,
						),
						4000,
					);
				}
				cardState.pendingCard = {
					ownerId,
					targetId,
					questionId: selectedId,
					startedAt: Date.now(),
					specialCard: specialCardId,
					specialCardLabel,
					timeLimitMs,
				};
				if (specialCardId) {
					cardState.usedSpecialCards = Array.isArray(cardState.usedSpecialCards)
						? cardState.usedSpecialCards
						: [];
					if (
						!cardState.usedSpecialCards.some(
							(id) => normalizeSpecialCardId(id) === specialCardId,
						)
					) {
						cardState.usedSpecialCards.push(specialCardId);
					}
				}
				cardState.turnStartedAt = null;
				if (!hasSpecialOverride || selectedSpecialCard) {
					setSelectedSpecialCard(gameId, '');
				}
				return game;
			},
			{ sync: true, scope },
		);
		renderGameStage(context);
	}

	function submitCardAnswer(gameId, context, answer) {
		if (!answer) return;
		const socket = getSocket();
		if (socket && socket.connected) {
			socket.emit(
				'game:cardAnswer',
				{
					gameId,
					userId: context.user.id,
					answer: String(answer).trim(),
					hintUsed: state.hintUsed || false,
				},
				(response) => {
					if (response?.error) {
						showToast(response.error, 'error');
						requestGameSync(gameId, context, 0);
						return;
					}
					requestGameSync(gameId, context, 0);
				},
			);
			return;
		}
		notifyRealtimeDisconnected();
		return;
		// Fallback: local
		const scope = buildGameScope(getGameById(gameId), context);
		updateGameStore(
			gameId,
			(game) => {
				if (!game || game.status !== 'live') return game;
				const session = ensureSession(game);
				const cardState = session.card;
				const pending = cardState?.pendingCard;
				if (!pending || !sameUserIdValue(pending.targetId, context.user.id)) {
					return game;
				}
				const pendingQuestionId = normalizeCardQuestionIdValue(
					pending.questionId,
				);
				const question = game.questions.find((q) =>
					sameCardQuestionIdValue(q?.id, pendingQuestionId),
				);
				const correct = answerMatchesQuestion(question, String(answer).trim());
				resolveCardAnswer(
					game,
					pending,
					String(answer).trim(),
					correct,
					false,
					state.hintUsed || false,
				);
				return game;
			},
			{ sync: true, scope },
		);
		renderGameStage(context);
	}

	function submitTieBreakAnswer(gameId, context, answer) {
		if (!answer) return;
		const socket = getSocket();
		if (socket && socket.connected) {
			socket.emit(
				'game:tieBreakAnswer',
				{
					gameId,
					userId: context.user.id,
					answer: String(answer).trim(),
				},
				(response) => {
					if (response?.error) {
						showToast(response.error, 'error');
						requestGameSync(gameId, context, 0);
						return;
					}
					requestGameSync(gameId, context, 0);
				},
			);
			return;
		}
		notifyRealtimeDisconnected();
		return;
		// Fallback: local
		const scope = buildGameScope(getGameById(gameId), context);
		updateGameStore(
			gameId,
			(game) => {
				const session = ensureSession(game);
				const tieBreak = session.tieBreak;
				if (!tieBreak || tieBreak.resolved) return game;
				const participant = getParticipant(session, context.user.id);
				const participantTeam = participant?.teamId || '';
				if (tieBreak.candidates && tieBreak.candidates.length) {
					const allowed =
						tieBreak.candidates.some((candidateId) =>
							sameUserIdValue(candidateId, context.user.id),
						) ||
						(participantTeam &&
							tieBreak.candidates.some((candidateId) =>
								sameUserIdValue(candidateId, participantTeam),
							));
					if (!allowed) return game;
				}
				if (
					tieBreak.answers?.some((a) =>
						sameUserIdValue(a?.userId, context.user.id),
					)
				) {
					return game;
				}
				const question = game.penaltyQuestions.find((q) =>
					sameQuestionIdValue(q?.id, tieBreak?.questionId),
				);
				const correct = answerMatchesQuestion(question, String(answer).trim());
				tieBreak.answers = tieBreak.answers || [];
				tieBreak.answers.push({
					userId: context.user.id,
					answer: String(answer).trim(),
					correct,
					answeredAt: Date.now(),
				});
				if (correct && !tieBreak.resolved) {
					const correctAnswers = tieBreak.answers.filter((a) => a.correct);
					const sameTime =
						correctAnswers.length > 1 &&
						correctAnswers.every(
							(a) => a.answeredAt === correctAnswers[0].answeredAt,
						);
					if (sameTime && game.penaltyQuestions?.length) {
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
								: context.user.id;
						finalizeTieBreak(game, winnerId);
					}
				}
				session.tieBreak = tieBreak;
				return game;
			},
			{ sync: true, scope },
		);
		renderGameStage(context);
	}

	function renderWorkspace() {
		const context = getStudentContext();
		const loginBtn = byId('workspaceLoginButton');
		const profileDropdown = byId('studentWorkspaceDropdown');

		if (!context) {
			if (loginBtn) loginBtn.style.display = 'inline-flex';
			if (profileDropdown) profileDropdown.classList.add('hidden');
			queueStickyProfileDockUpdate();
			showAuthModal();
			setActiveGameId(null);
			renderGameStage(null);
			closeStudentDropdown();
			if (state.gameTicker) {
				clearInterval(state.gameTicker);
				state.gameTicker = null;
			}
			return;
		}

		closeStudentProfileModal();
		hideAuthModal();
		if (loginBtn) loginBtn.style.display = 'none';
		if (profileDropdown) profileDropdown.classList.remove('hidden');
		queueStickyProfileDockUpdate();

		renderHeader(context);

		const exams = getAssignedExams(context.classRecord);
		const examResults = collectExamResults(context.identity);
		const resultsMap = buildResultsMap(examResults);
		const trainingResults = getTrainingResults(context.identity);

		renderHeroStats(exams, resultsMap);
		renderExamCards(exams, resultsMap);
		renderPerformanceList(exams, resultsMap);
		renderTrainingCards(trainingResults);
		renderTrainingPerformanceList(trainingResults);
		renderMessages(context);
		renderAssignments(exams, resultsMap);
		renderResultsList(context);
		renderProfileSection(context);
		renderGamesPanel(context);
		renderGameStage(context);
		renderGamificationUI(context);
		applyWorkspaceTabVisibility();
		startGameTicker(context);
	}

	function getTournamentModeDisplay(mode) {
		const normalized = String(mode || 'any').trim();
		if (!normalized || normalized === 'any') return 'All Modes';
		const labels = {
			race: 'Lightning Race',
			'sprint-race': 'Sprint Race',
			cards: 'Card Battle',
			'cards-draw': 'Card Draw Battle',
			'hot-potato': 'Hot Potato',
			'last-survivor': 'Last Survivor',
		};
		return labels[normalized] || normalized;
	}

	function getTournamentFormatDisplay(format) {
		const normalized = String(format || 'elimination')
			.trim()
			.toLowerCase();
		if (normalized === 'round-robin') return 'Round Robin';
		if (normalized === 'swiss') return 'Swiss System';
		return 'Single Elimination';
	}

	function normalizeTournamentModeValue(mode, fallback = 'any', allowEmpty = false) {
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

	function isTournamentModeMatch(targetMode, gameType) {
		const normalizedTarget = normalizeTournamentModeValue(targetMode, 'any');
		if (normalizedTarget === 'any') return true;
		return normalizedTarget === normalizeTournamentModeValue(gameType, 'any');
	}

	function getNormalizedTournamentRoundAssignments(tournament) {
		const globalMode = normalizeTournamentModeValue(tournament?.targetMode, 'any');
		return (Array.isArray(tournament?.roundAssignments)
			? tournament.roundAssignments
			: []
		)
			.map((assignment) => {
				const round = Number(assignment?.round);
				if (!Number.isFinite(round) || round < 1) return null;
				const modeOverride = normalizeTournamentModeValue(
					assignment?.modeOverride,
					'',
					true,
				);
				const targetMode = normalizeTournamentModeValue(
					modeOverride || assignment?.targetMode || globalMode,
					globalMode,
				);
				const gameIds = [
					...new Set(
						(Array.isArray(assignment?.gameIds) ? assignment.gameIds : [])
							.map((id) => String(id || '').trim())
							.filter(Boolean),
					),
				];
				return {
					round,
					modeOverride:
						modeOverride && modeOverride !== globalMode ? modeOverride : '',
					targetMode,
					gameIds,
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.round - b.round);
	}

	function isTournamentGameEligible(tournament, gameId, gameType) {
		const normalizedGameId = String(gameId || '').trim();
		const gameSnapshot = normalizedGameId
			? getTournamentGameSnapshot(normalizedGameId)
			: null;
		const sourceGameId = String(
			gameSnapshot?.tournamentContext?.sourceGameId || '',
		).trim();
		const globalMode = normalizeTournamentModeValue(tournament?.targetMode, 'any');
		const roundAssignments = getNormalizedTournamentRoundAssignments(tournament);
		if (!roundAssignments.length) {
			return {
				eligible: isTournamentModeMatch(globalMode, gameType),
				roundMatches: [],
				assignmentDriven: false,
			};
		}

		const roundMatches = [];
		roundAssignments.forEach((assignment) => {
			const explicitGameMatch =
				normalizedGameId && assignment.gameIds.includes(normalizedGameId);
			const sourceGameMatch =
				sourceGameId && assignment.gameIds.includes(sourceGameId);
			const modeMatch = isTournamentModeMatch(assignment.targetMode, gameType);
			if (
				explicitGameMatch ||
				sourceGameMatch ||
				(assignment.gameIds.length === 0 && modeMatch)
			) {
				roundMatches.push(assignment.round);
			}
		});

		return {
			eligible: roundMatches.length > 0,
			roundMatches,
			assignmentDriven: true,
		};
	}

	function getBadgeDisplayIcon(badge) {
		const raw = String(badge?.icon || '').trim();
		if (raw && raw.length <= 4 && /^[\x20-\x7E]+$/.test(raw)) {
			return raw.toUpperCase();
		}
		const compact = String(badge?.name || 'Badge')
			.split(/\s+/)
			.map((part) =>
				String(part || '')
					.trim()
					.charAt(0),
			)
			.join('')
			.toUpperCase()
			.slice(0, 3);
		return compact || 'BDG';
	}

	function getBadgeVisualMeta(badge) {
		const badgeText = `${String(badge?.id || '')} ${String(
			badge?.name || '',
		)} ${String(badge?.desc || '')}`.toLowerCase();
		let tier = 'sky';
		let label = 'Achievement';
		if (
			/(champion|winner|first|1st|gold|legend|master|elite|victory)/.test(
				badgeText,
			)
		) {
			tier = 'gold';
			label = 'Gold Medal';
		} else if (/(runner|second|2nd|silver|finalist)/.test(badgeText)) {
			tier = 'silver';
			label = 'Silver Medal';
		} else if (/(third|3rd|bronze|semi)/.test(badgeText)) {
			tier = 'bronze';
			label = 'Bronze Medal';
		} else if (/(tournament|arena|streak|win|battle|challenge)/.test(badgeText)) {
			tier = 'emerald';
			label = 'Arena Medal';
		}
		return {
			tier,
			label,
			icon: getBadgeDisplayIcon(badge),
		};
	}

	function getActiveTournamentRecord() {
		try {
			const parsed = JSON.parse(
				localStorage.getItem('quizTournamentActive') || 'null',
			);
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function normalizeTournamentParticipants(tournament) {
		if (!tournament || !Array.isArray(tournament.participants)) return [];
		return tournament.participants
			.map((entry) => ({
				userId: String(entry?.userId || entry?.id || '').trim(),
				name: String(entry?.name || '').trim(),
				joinedAt: entry?.joinedAt || '',
			}))
			.filter((entry) => entry.userId);
	}

	function isUserTournamentParticipant(tournament, userId) {
		const targetUserId = String(userId || '').trim();
		if (!targetUserId) return false;
		return normalizeTournamentParticipants(tournament).some(
			(entry) => entry.userId === targetUserId,
		);
	}

	function saveActiveTournamentRecord(tournament) {
		if (!tournament || !tournament.id) return;
		localStorage.setItem('quizTournamentActive', JSON.stringify(tournament));
	}

	function ensureTournamentJoinBadge(context, tournamentName) {
		if (!context?.user?.id) return;
		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}
		const index = users.findIndex(
			(entry) =>
				String(entry?.id || '').trim() === String(context.user.id || '').trim(),
		);
		if (index < 0) return;

		const user = { ...users[index] };
		user.badges = Array.isArray(user.badges) ? user.badges : [];
		const joinBadgeId = 'tournament_joiner';
		const hasJoinBadge = user.badges.some(
			(badge) => badge && String(badge.id || '').trim() === joinBadgeId,
		);
		if (!hasJoinBadge) {
			user.badges.push({
				id: joinBadgeId,
				icon: 'ARE',
				name: 'Arena Challenger',
				desc: 'Joined a live tournament arena.',
				earnedAt: Date.now(),
			});
		}
		const tournamentBadgeId = `tournament_join_${String(tournamentName || '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')}`;
		const hasTournamentBadge = user.badges.some(
			(badge) => badge && String(badge.id || '').trim() === tournamentBadgeId,
		);
		if (!hasTournamentBadge) {
			user.badges.push({
				id: tournamentBadgeId,
				icon: 'TJR',
				name: 'Tournament Joiner',
				desc: `Joined ${String(tournamentName || 'an active tournament')}.`,
				earnedAt: Date.now(),
			});
		}
		users[index] = user;
		window.__DI_CONTAINER__.repo.setAll_sync('users', users);
		context.user.badges = user.badges;
	}

	function getTournamentLobbyAudienceTarget(tournament, game = null) {
		return Math.max(getGameLobbyExpectedPlayers(game, tournament), 2);
	}

	function syncTournamentLobbyAudienceTargets(tournament) {
		const tournamentId = String(tournament?.id || '').trim();
		if (!tournamentId) return [];
		const games = getGamesStore();
		if (!Array.isArray(games) || !games.length) return [];
		const syncedAt = new Date().toISOString();
		const changedGames = [];
		const nextGames = games.map((game) => {
			const gameTournamentId = String(
				game?.tournamentContext?.tournamentId || '',
			).trim();
			const status = String(game?.status || '').toLowerCase();
			if (
				!gameTournamentId ||
				gameTournamentId !== tournamentId ||
				status === 'live' ||
				status === 'completed'
			) {
				return game;
			}
			const nextExpectedPlayers = getTournamentLobbyAudienceTarget(
				tournament,
				game,
			);
			const currentExpectedPlayers = Math.max(
				Number(game?.settings?.expectedPlayers) || 0,
				0,
			);
			const currentTournamentTarget = Math.max(
				Number(game?.settings?.tournamentExpectedPlayers) || 0,
				0,
			);
			if (
				currentExpectedPlayers === nextExpectedPlayers &&
				currentTournamentTarget === nextExpectedPlayers
			) {
				return game;
			}
			const nextGame = window.GameCore?.normalizeGame
				? window.GameCore.normalizeGame({
						...game,
						settings: {
							...(game.settings || {}),
							expectedPlayers: nextExpectedPlayers,
							tournamentExpectedPlayers: nextExpectedPlayers,
						},
						updatedAt: syncedAt,
					})
				: {
						...game,
						settings: {
							...(game.settings || {}),
							expectedPlayers: nextExpectedPlayers,
							tournamentExpectedPlayers: nextExpectedPlayers,
						},
						updatedAt: syncedAt,
					};
			changedGames.push(nextGame);
			return nextGame;
		});
		if (!changedGames.length) return [];
		saveGamesStore(nextGames);
		window.dispatchEvent(
			new CustomEvent('quiz:games-updated', {
				detail: { games: nextGames },
			}),
		);
		const socket = getSocket();
		if (socket && socket.connected) {
			changedGames.forEach((game) => {
				socket.emit('game:update', game, () => {});
			});
		}
		return changedGames;
	}

	function syncTournamentUpdate(tournament) {
		if (!tournament || !tournament.id) return;
		const socket = getSocket();
		if (!socket || !socket.connected) {
			console.warn('Socket not connected, tournament update may not sync');
			return;
		}
		socket.emit(
			'student:updateTournament',
			{
				tournamentId: tournament.id,
				tournamentData: tournament,
			},
			(response) => {
				if (response?.ok) {
					console.log('Tournament update synced successfully');
				} else {
					console.warn('Failed to sync tournament update:', response?.error);
				}
			},
		);
	}

	function joinActiveTournament(context) {
		const activeTournament = getActiveTournamentRecord();
		if (
			!activeTournament ||
			String(activeTournament.status || '').toLowerCase() !== 'active'
		) {
			showToast('No active tournament is available to join', 'info');
			return;
		}
		const userId = String(context?.user?.id || '').trim();
		if (!userId) {
			showToast('Please sign in to join the tournament', 'error');
			return;
		}

		const participants = normalizeTournamentParticipants(activeTournament);
		if (participants.some((entry) => entry.userId === userId)) {
			showToast('You have already joined this tournament', 'info');
			renderWorkspace();
			return;
		}

		const cap = Math.max(Number(activeTournament.maxParticipants) || 0, 0);
		if (cap && participants.length >= cap) {
			showToast('Tournament is full', 'warning');
			return;
		}

		participants.push({
			userId,
			name:
				context?.user?.name ||
				context?.identity?.name ||
				context?.user?.username ||
				'Student',
			joinedAt: new Date().toISOString(),
		});
		activeTournament.participants = participants;
		activeTournament.updatedAt = new Date().toISOString();
		saveActiveTournamentRecord(activeTournament);
		syncTournamentLobbyAudienceTargets(activeTournament);
		syncTournamentUpdate(activeTournament);
		ensureTournamentJoinBadge(context, activeTournament.name);
		showToast('Joined tournament arena successfully', 'success');
		renderWorkspace();
	}

	function leaveActiveTournament(context) {
		const activeTournament = getActiveTournamentRecord();
		if (
			!activeTournament ||
			String(activeTournament.status || '').toLowerCase() !== 'active'
		) {
			showToast('No active tournament is running', 'info');
			return;
		}
		if (activeTournament.allowReentry !== true) {
			showToast('Leaving is disabled for this tournament', 'warning');
			return;
		}
		const userId = String(context?.user?.id || '').trim();
		if (!userId) return;
		const participants = normalizeTournamentParticipants(activeTournament);
		if (!participants.some((entry) => entry.userId === userId)) {
			showToast('You are not joined in this tournament', 'info');
			return;
		}
		activeTournament.participants = participants.filter(
			(entry) => entry.userId !== userId,
		);
		activeTournament.updatedAt = new Date().toISOString();
		saveActiveTournamentRecord(activeTournament);
		syncTournamentLobbyAudienceTargets(activeTournament);
		syncTournamentUpdate(activeTournament);
		showToast('You left the tournament. Re-entry remains available.', 'info');
		renderWorkspace();
	}

	function getStudentTournamentLeaderboard(tournamentId, options = {}) {
		if (!tournamentId) return [];
		const includeJoinedWithoutPoints =
			options && options.includeJoinedWithoutPoints === true;
		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}

		const activeTournament = getActiveTournamentRecord();
		const participantIds = new Set(
			normalizeTournamentParticipants(activeTournament).map(
				(entry) => entry.userId,
			),
		);

		return users
			.filter((user) => {
				const normalizedRole = String(user?.role || '')
					.trim()
					.toLowerCase();
				const isStudentLike =
					!normalizedRole ||
					normalizedRole === 'student' ||
					normalizedRole === 'learner' ||
					normalizedRole === 'participant';
				return (
					isStudentLike &&
					(!participantIds.size ||
						participantIds.has(String(user?.id || '').trim()))
				);
			})
			.map((user) => {
				const scoreMap =
					user?.tournamentScores && typeof user.tournamentScores === 'object'
						? user.tournamentScores
						: {};
				return {
					id: user.id || '',
					name:
						user.name ||
						user.fullName ||
						user.username ||
						user.studentName ||
						'Student',
					points: Number(scoreMap[tournamentId]) || 0,
					exp: Number(user.exp) || 0,
				};
			})
			.filter(
				(entry) =>
					entry.points > 0 ||
					(includeJoinedWithoutPoints &&
						participantIds.has(String(entry.id || '').trim())),
			)
			.sort(
				(a, b) =>
					b.points - a.points ||
					b.exp - a.exp ||
					String(a.name).localeCompare(String(b.name)),
			);
	}

	function getTournamentGameSnapshot(gameId) {
		const normalizedGameId = String(gameId || '').trim();
		if (!normalizedGameId) return null;
		return (
			getGameByIdResolved(normalizedGameId) ||
			getCachedGame(normalizedGameId) ||
			getGameById(normalizedGameId) ||
			null
		);
	}

	function getTournamentParticipantEntry(game, userId) {
		const participants = Array.isArray(game?.session?.participants)
			? game.session.participants
			: [];
		return (
			participants.find((entry) => sameUserIdValue(entry?.userId, userId)) || null
		);
	}

	function getTournamentGameOutcomeForUser(game, userId, userName = 'Student') {
		if (!game || String(game?.status || '').toLowerCase() !== 'completed') {
			return null;
		}
		return getGameOutcome(game, {
			user: {
				id: userId,
				name: userName,
			},
		});
	}

	function renderStudentTournamentStatusPill(label, tone = 'muted') {
		return `<span class="student-tournament-status-pill ${escapeHtml(
			tone,
		)}">${escapeHtml(label)}</span>`;
	}

	function isTournamentGameFinishedForViewer(game) {
		if (!game) return false;
		return (
			game.missing === true ||
			game.status === 'completed' ||
			game.participantState === 'forfeited' ||
			game.participantState === 'eliminated'
		);
	}

	function getFocusedTournamentRoundView(roundViews, tournament) {
		const views = Array.isArray(roundViews) ? roundViews : [];
		const currentRoundNumber = Math.max(Number(tournament?.currentRound) || 1, 1);
		const currentRoundView =
			views.find((view) => view.round === currentRoundNumber) || null;
		const nextRoundView =
			views.find((view) => view.round > currentRoundNumber) || null;

		if (
			currentRoundView?.preferredActionGame &&
			!currentRoundView.isFuture &&
			!currentRoundView.viewerRoundFinished
		) {
			return {
				view: currentRoundView,
				currentRoundView,
				mode: 'current',
			};
		}

		if (currentRoundView?.viewerRoundFinished) {
			if (nextRoundView) {
				return {
					view: nextRoundView,
					currentRoundView,
					mode: 'next',
				};
			}
			return {
				view: currentRoundView,
				currentRoundView,
				mode: 'finished',
			};
		}

		if (currentRoundView?.allCompleted && nextRoundView) {
			return {
				view: nextRoundView,
				currentRoundView,
				mode: 'next',
			};
		}

		return {
			view: currentRoundView || nextRoundView || views[0] || null,
			currentRoundView,
			mode: currentRoundView ? 'current' : nextRoundView ? 'next' : 'empty',
		};
	}

	function getTournamentRoundViews(tournament, context) {
		const currentRoundNumber = Math.max(Number(tournament?.currentRound) || 1, 1);
		const assignments =
			Array.isArray(tournament?.roundAssignments) && tournament.roundAssignments.length
				? tournament.roundAssignments
				: getNormalizedTournamentRoundAssignments(tournament);
		const tournamentStatus = String(tournament?.status || '').toLowerCase();

		return assignments.map((assignment, index) => {
			const roundNumber = Math.max(Number(assignment?.round) || index + 1, 1);
			const sourceGames =
				Array.isArray(assignment?.gameDetails) && assignment.gameDetails.length
					? assignment.gameDetails
					: (Array.isArray(assignment?.gameIds) ? assignment.gameIds : []).map(
							(id) => ({ id }),
						);

			const games = sourceGames
				.map((gameEntry) => {
					const templateGameId = String(
						gameEntry?.sourceGameId || gameEntry?.id || '',
					).trim();
					const instanceId = String(
						gameEntry?.instanceId || gameEntry?.gameInstanceId || '',
					).trim();
					const gameId = instanceId || templateGameId;
					if (!gameId) return null;
					const actualGame = getTournamentGameSnapshot(gameId);
					if (!actualGame) {
						const isPendingTournamentCopy = Boolean(instanceId);
						return {
							id: gameId,
							templateId: templateGameId,
							name: gameEntry?.name || 'Untitled Game',
							type: gameEntry?.type || 'race',
							mode: gameEntry?.mode || 'solo',
							status: isPendingTournamentCopy ? 'open' : 'removed',
							actualGame: null,
							participantEntry: null,
							participantState: '',
							myStatusLabel: isPendingTournamentCopy
								? 'Preparing lobby'
								: 'Unavailable',
							myStatusTone: 'waiting',
							myJoined: false,
							viewerFinished: false,
							participantCount: 0,
							expectedPlayers: 0,
							missing: !isPendingTournamentCopy,
							pendingSync: isPendingTournamentCopy,
						};
					}
					const rawStatus = String(
						actualGame.status || gameEntry?.status || 'pending',
					).toLowerCase();
					const status = rawStatus === 'draft' ? 'open' : rawStatus;
					const participantEntry = getTournamentParticipantEntry(
						actualGame,
						context?.user?.id,
					);
					const participantState = String(
						participantEntry?.state || '',
					).toLowerCase();
					const outcome = actualGame
						? getTournamentGameOutcomeForUser(
								actualGame,
								context?.user?.id,
								context?.user?.name || context?.identity?.name || 'Student',
							)
						: null;

					let myStatusLabel = 'Not joined';
					let myStatusTone = 'waiting';
					if (participantState === 'forfeited') {
						myStatusLabel = 'Match finished';
						myStatusTone = 'danger';
					} else if (participantState === 'eliminated') {
						myStatusLabel = 'Match finished';
						myStatusTone = 'warning';
					} else if (status === 'completed' && participantEntry) {
						if (outcome?.label === 'Winner') {
							myStatusLabel = 'Won';
							myStatusTone = 'done';
						} else if (outcome?.label === 'Lost') {
							myStatusLabel = 'Lost';
							myStatusTone = 'danger';
						} else {
							myStatusLabel = 'Finished';
							myStatusTone = 'done';
						}
					} else if (status === 'live' && participantEntry) {
						myStatusLabel = 'Match live';
						myStatusTone = 'live';
					} else if (status === 'open' && participantEntry) {
						myStatusLabel = participantEntry?.ready ? 'Ready' : 'Joined';
						myStatusTone = 'waiting';
					} else if (status === 'completed') {
						myStatusLabel = 'Round closed';
						myStatusTone = 'muted';
					}

					const participants = Array.isArray(actualGame?.session?.participants)
						? actualGame.session.participants
						: [];
					return {
						id: gameId,
						templateId: templateGameId,
						name: actualGame.name || gameEntry?.name || 'Untitled Game',
						type: actualGame.type || gameEntry?.type || 'race',
						mode: actualGame.mode || gameEntry?.mode || 'solo',
						status,
						actualGame,
						participantEntry,
						participantState,
						myStatusLabel,
						myStatusTone,
						myJoined: Boolean(participantEntry),
						viewerFinished:
							status === 'completed' ||
							participantState === 'forfeited' ||
							participantState === 'eliminated',
						participantCount: participants.length,
						expectedPlayers: getGameLobbyExpectedPlayers(
							actualGame,
							tournament,
						),
						missing: false,
					};
				})
				.filter(Boolean);

			const totalCount = games.length;
			const completedCount = games.filter(
				(game) => game.status === 'completed',
			).length;
			const liveCount = games.filter((game) => game.status === 'live').length;
			const openCount = games.filter((game) => game.status === 'open').length;
			const joinedCount = games.filter((game) => game.myJoined).length;
			const finishedCount = games.filter(
				(game) => game.myJoined && isTournamentGameFinishedForViewer(game),
			).length;
			const isCurrent = roundNumber === currentRoundNumber;
			const isFuture = roundNumber > currentRoundNumber;
			const allCompleted = totalCount > 0 && completedCount === totalCount;
			const viewerRoundFinished =
				joinedCount > 0 && finishedCount >= joinedCount;
			const percent =
				totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

			let status = String(assignment?.status || '').toLowerCase();
			if (allCompleted || roundNumber < currentRoundNumber) {
				status = 'completed';
			} else if (tournamentStatus === 'paused') {
				status = 'paused';
			} else if (isCurrent) {
				status = liveCount > 0 ? 'live' : 'active';
			} else {
				status = status || 'pending';
			}

			let statusLabel = 'Locked';
			let statusTone = 'muted';
			if (status === 'completed') {
				statusLabel = 'Completed';
				statusTone = 'done';
			} else if (status === 'paused') {
				statusLabel = 'Paused';
				statusTone = 'warning';
			} else if (status === 'live') {
				statusLabel = 'Live Round';
				statusTone = 'live';
			} else if (isFuture || status === 'pending') {
				statusLabel = 'Upcoming';
				statusTone = 'waiting';
			} else if (status === 'active') {
				statusLabel = 'Ready';
				statusTone = 'waiting';
			}

			const preferredActionGame =
				games.find(
					(game) =>
						game.status === 'live' &&
						game.myJoined &&
						game.participantState !== 'forfeited' &&
						game.participantState !== 'eliminated',
				) ||
				games.find(
					(game) =>
						game.status === 'open' &&
						game.myJoined &&
						game.participantState !== 'forfeited' &&
						game.participantState !== 'eliminated',
				) ||
				games.find(
					(game) =>
						game.status === 'open' &&
						game.participantState !== 'forfeited' &&
						game.participantState !== 'eliminated',
				) ||
				null;

			return {
				round: roundNumber,
				games,
				totalCount,
				completedCount,
				liveCount,
				openCount,
				joinedCount,
				finishedCount,
				isCurrent,
				isFuture,
				allCompleted,
				viewerRoundFinished,
				percent,
				status,
				statusLabel,
				statusTone,
				preferredActionGame,
			};
		});
	}

	function getTournamentParticipantStatusSummary(
		participant,
		tournament,
		roundViews,
	) {
		const participantId = String(
			participant?.userId || participant?.id || '',
		).trim();
		if (!participantId) {
			return { label: 'Unknown', tone: 'muted', detail: '' };
		}
		const currentRoundNumber = Math.max(Number(tournament?.currentRound) || 1, 1);
		const currentRoundView =
			roundViews.find((view) => view.round === currentRoundNumber) || null;

		if (String(tournament?.status || '').toLowerCase() === 'paused') {
			return {
				label: 'Paused',
				tone: 'warning',
				detail: 'Tournament is paused right now.',
			};
		}
		if (!currentRoundView || !currentRoundView.games.length) {
			return {
				label: 'Waiting',
				tone: 'muted',
				detail: 'Round games are still being prepared.',
			};
		}

		let joinedGames = 0;
		let finishedGames = 0;
		for (const game of currentRoundView.games) {
			const joinedGame = getTournamentParticipantEntry(game.actualGame, participantId);
			const participantState = String(joinedGame?.state || '').toLowerCase();
			if (!joinedGame) continue;
			joinedGames += 1;
			if (participantState === 'forfeited') {
				finishedGames += 1;
				return {
					label: 'Match finished',
					tone: 'danger',
					detail: `${game.name} counted as a loss. Waiting for the next round.`,
				};
			}
			if (participantState === 'eliminated') {
				finishedGames += 1;
				return {
					label: 'Match finished',
					tone: 'warning',
					detail: `${game.name} is finished for this student. Waiting for the next round.`,
				};
			}
			if (game.status === 'live' && joinedGame) {
				return {
					label: 'Match live',
					tone: 'live',
					detail: `${game.name} is live for this student.`,
				};
			}
			if (game.status === 'open' && joinedGame) {
				return {
					label: 'Joined',
					tone: 'waiting',
					detail: joinedGame?.ready
						? `Ready in ${game.name}.`
						: `Joined ${game.name} and waiting.`,
				};
			}
			if (game.status === 'completed' && joinedGame) {
				finishedGames += 1;
				const outcome = getTournamentGameOutcomeForUser(
					game.actualGame,
					participantId,
					participant?.name || 'Student',
				);
				if (outcome?.label === 'Winner') {
					return {
						label: 'Won round',
						tone: 'done',
						detail: `${game.name} finished with a win.`,
					};
				}
				return {
					label: 'Finished',
					tone: 'muted',
					detail: `${game.name} is completed.`,
				};
			}
		}

		if (joinedGames > 0 && finishedGames >= joinedGames) {
			return {
				label: 'Match finished',
				tone: 'muted',
				detail: 'Current match is finished. Waiting for the next round.',
			};
		}

		if (currentRoundView.allCompleted) {
			return {
				label: 'Round closed',
				tone: 'muted',
				detail: 'Waiting for the next round to open.',
			};
		}

		return {
			label: 'Waiting',
			tone: 'waiting',
			detail: 'Joined tournament, not in a live round game yet.',
		};
	}

	function buildTournamentJourneyHtml({
		hasJoined,
		isPaused,
		currentRoundView,
		focusedRoundView,
		primaryActionGame,
		focusMode,
	}) {
		let tone = 'waiting';
		let title = 'Stand by';
		let copy =
			'This arena updates automatically in real time and only shows the current tournament step.';
		let note = '';

		if (!hasJoined) {
			tone = 'warning';
			title = 'Join when ready';
			copy =
				'There is an active tournament, but you are not in it yet. Join once and this arena will switch to your live round automatically.';
			note = 'You do not need to manage rounds manually.';
		} else if (isPaused) {
			tone = 'warning';
			title = 'Tournament paused';
			copy =
				'The teacher paused this tournament. Stay here and wait for the next live update.';
			note = 'Your current match will appear again when the tournament resumes.';
		} else if (!currentRoundView) {
			tone = 'waiting';
			title = 'Round loading';
			copy =
				'The tournament is active, but your current round is still being prepared.';
			note = 'This page will update as soon as your round is ready.';
		} else if (focusMode === 'next' && focusedRoundView) {
			tone = 'done';
			title = `Next round ${focusedRoundView.round}`;
			copy =
				'Your current match is finished. The next round will appear here automatically when the tournament advances.';
			note =
				'Finished matches stay closed. If you left a live match, that loss is already recorded.';
		} else if (focusMode === 'finished') {
			tone = 'done';
			title = 'Match finished';
			copy =
				'Your current tournament match is finished. Stay here for final standings or the next update.';
			note = 'Finished matches cannot be reopened from this arena.';
		} else if (currentRoundView.allCompleted) {
			tone = 'done';
			title = 'Round finished';
			copy = `Round ${currentRoundView.round} is complete for now.`;
			note = 'Wait here for the next round or the final standings.';
		} else if (
			primaryActionGame?.status === 'live' &&
			primaryActionGame?.myJoined
		) {
			tone = 'live';
			title = 'Your match is live';
			copy = `${primaryActionGame.name} is live now. Open the match from the main action button below.`;
			note = 'Leaving a live match counts as a loss.';
		} else if (primaryActionGame) {
			tone = 'waiting';
			title = 'Your next match';
			copy = `${primaryActionGame.name} is the only tournament action you need right now.`;
			note = 'Future rounds stay locked until they actually open.';
		} else if (currentRoundView) {
			tone = 'waiting';
			title = `Round ${currentRoundView.round} active`;
			copy =
				'Your current round is running. Wait here until your match becomes available.';
			note = 'Only the current round is shown so you can stay focused.';
		}

		return `
			<article class="student-tournament-focus-card is-${escapeHtml(tone)}">
				<div class="student-tournament-focus-kicker">What Matters Now</div>
				<div class="student-tournament-focus-title">${escapeHtml(title)}</div>
				<div class="student-tournament-focus-copy">${escapeHtml(copy)}</div>
				${
					note
						? `<div class="student-tournament-focus-note">${escapeHtml(note)}</div>`
						: ''
				}
			</article>
		`;
	}

	function renderGamificationUIV2(context) {
		const exp = Number(context?.user?.exp) || 0;
		const level = Math.floor(exp / 200) + 1;
		const tournamentScores =
			context?.user?.tournamentScores &&
			typeof context.user.tournamentScores === 'object'
				? context.user.tournamentScores
				: {};
		const totalTournamentPoints = Object.values(tournamentScores).reduce(
			(sum, value) => sum + (Number(value) || 0),
			0,
		);

		if (byId('studentExpDisplay'))
			byId('studentExpDisplay').textContent = String(exp);
		if (byId('studentLevelDisplay'))
			byId('studentLevelDisplay').textContent = String(level);
		if (byId('heroTournamentPoints')) {
			byId('heroTournamentPoints').textContent = String(totalTournamentPoints);
		}
		renderProfileGamificationChips(context?.user || {});
		renderProfilePerformanceSnapshot(context);

		const badgesList = byId('studentBadgesList');
		if (badgesList) {
			const badges = Array.isArray(context?.user?.badges)
				? context.user.badges
						.slice()
						.sort((a, b) => Number(b?.earnedAt || 0) - Number(a?.earnedAt || 0))
				: [];
			if (!badges.length) {
				badgesList.innerHTML =
					'<div class="empty-state-small" style="grid-column: 1 / -1;">No badges earned yet. Keep playing!</div>';
			} else {
				badgesList.innerHTML = badges
					.map((badge) => {
						const visualMeta = getBadgeVisualMeta(badge);
						const earnedAt =
							badge?.earnedAt && Number.isFinite(Number(badge.earnedAt))
								? new Date(Number(badge.earnedAt)).toLocaleDateString()
								: '';
						return `
							<article class="student-badge-card tier-${escapeHtml(
								visualMeta.tier,
							)}">
								<div class="student-badge-medal" aria-hidden="true">
									<span class="student-badge-ribbon left"></span>
									<span class="student-badge-ribbon right"></span>
									<div class="student-badge-icon">${escapeHtml(
										visualMeta.icon,
									)}</div>
								</div>
								<div class="student-badge-body">
									<div class="student-badge-pill">${escapeHtml(
										visualMeta.label,
									)}</div>
									<div class="student-badge-title">${escapeHtml(
										badge?.name || 'Badge',
									)}</div>
									<div class="student-badge-desc">${escapeHtml(
										badge?.desc || '',
									)}</div>
									${
										earnedAt
											? `<div class="student-badge-date">Earned ${escapeHtml(
													earnedAt,
												)}</div>`
											: ''
									}
								</div>
							</article>
						`;
					})
					.join('');
			}
		}

		try {
			const activeTournament = getActiveTournamentRecord();
			const tDesc = byId('studentActiveTournamentDesc');
			const tBadge = byId('studentTournamentBadge');
			const scoreEl = byId('studentTournamentScore');
			const rankEl = byId('studentTournamentRank');
			const playersEl = byId('studentTournamentPlayers');
			const boardEl = byId('studentTournamentLeaderboard');
			const participantsEl = byId('studentTournamentParticipants');
			const metaEl = byId('studentTournamentMeta');
			const howItWorksEl = byId('studentTournamentHowItWorks');
			const actionsEl = byId('studentTournamentActions');
			const journeyEl = byId('studentTournamentJourney');
			const roundProgressEl = byId('studentTournamentRoundProgress');
			const userId = String(context?.user?.id || '').trim();

			if (activeTournament) {
				syncTournamentLobbyAudienceTargets(activeTournament);
				const modeLabel = getTournamentModeDisplay(activeTournament.targetMode);
				const formatLabel = getTournamentFormatDisplay(activeTournament.format);
				const rounds = Math.max(Number(activeTournament.rounds) || 0, 0);
				const participantsCap = Math.max(
					Number(activeTournament.maxParticipants) || 0,
					0,
				);
				const matchMinutes = Math.max(
					Number(activeTournament.matchMinutes) || 0,
					0,
				);
				const bestOf = Math.max(Number(activeTournament.bestOf) || 1, 1);
				const pointMultiplier = Number(activeTournament.pointMultiplier) || 1;
				const winnerBonus = Math.max(
					Number(activeTournament.winnerBonus) || 0,
					0,
				);
				const rewardBadge = String(activeTournament.rewardBadge || '').trim();
				const rewardExpBonus = Math.max(
					Number(activeTournament.rewardExpBonus) || 0,
					0,
				);
				const autoSeedingEnabled = activeTournament.autoSeeding !== false;
				const allowReentryEnabled = activeTournament.allowReentry === true;
				const participants = normalizeTournamentParticipants(activeTournament);
				const joinedCount = participants.length;
				const hasJoined = isUserTournamentParticipant(activeTournament, userId);
				const leaderboard = getStudentTournamentLeaderboard(
					activeTournament.id,
					{
						includeJoinedWithoutPoints: true,
					},
				);
				const myIndex = leaderboard.findIndex(
					(entry) => String(entry?.id || '').trim() === userId,
				);
				const myRank = myIndex >= 0 ? myIndex + 1 : '-';
				const myScore =
					myIndex >= 0
						? leaderboard[myIndex].points
						: Number(context?.user?.tournamentScores?.[activeTournament.id]) ||
							0;
				const leaderboardByUser = new Map(
					leaderboard.map((entry) => [String(entry?.id || '').trim(), entry]),
				);
				const roundViews = getTournamentRoundViews(activeTournament, context);
				const currentRoundNumber = Math.max(Number(activeTournament.currentRound) || 1, 1);
				const focusedRoundMeta = getFocusedTournamentRoundView(
					roundViews,
					activeTournament,
				);
				const currentRoundView =
					focusedRoundMeta.currentRoundView ||
					roundViews.find((view) => view.round === currentRoundNumber) ||
					null;
				const focusedRoundView = focusedRoundMeta.view || currentRoundView;
				const focusMode = focusedRoundMeta.mode || 'current';
				const primaryActionGame =
					focusedRoundView?.preferredActionGame || null;
				const roundProgressLabel = focusedRoundView
					? focusedRoundView.isFuture
						? 'Locked'
						: focusedRoundView.totalCount
							? `${focusedRoundView.completedCount}/${focusedRoundView.totalCount}`
							: 'No games'
					: '-';

				const isPaused =
					String(activeTournament.status || '').toLowerCase() === 'paused';
				const statusLabel = isPaused ? 'Paused' : 'Active';
				const statusClass = isPaused ? 'warning' : 'active';
				
				if (tDesc) {
					tDesc.textContent = `${activeTournament.name} - ${statusLabel}`;
				}
				if (tBadge) {
					tBadge.textContent = statusLabel;
					tBadge.classList.remove('active', 'inactive', 'warning');
					tBadge.classList.add(statusClass);
				}
				if (scoreEl) scoreEl.textContent = String(myScore);
				if (rankEl) rankEl.textContent = String(myRank);
				if (playersEl) {
					playersEl.textContent = String(
						joinedCount || leaderboard.length || 0,
					);
				}
				if (roundProgressEl) {
					roundProgressEl.textContent = roundProgressLabel;
				}
				if (byId('heroTournamentRank')) {
					byId('heroTournamentRank').textContent = String(myRank);
				}
				if (actionsEl) {
					const canJoin =
						!hasJoined && (!participantsCap || joinedCount < participantsCap);
					const canPlayPrimary =
						Boolean(primaryActionGame) &&
						hasJoined &&
						!isPaused &&
						!Boolean(focusedRoundView?.isFuture) &&
						!Boolean(focusedRoundView?.allCompleted) &&
						!Boolean(focusedRoundView?.viewerRoundFinished) &&
						String(primaryActionGame?.status || '') !== 'completed' &&
						!(
							String(primaryActionGame?.status || '') === 'live' &&
							!primaryActionGame?.myJoined
						) &&
						primaryActionGame?.participantState !== 'forfeited' &&
						primaryActionGame?.participantState !== 'eliminated';
					let playLabel = 'Open match';
					if (!hasJoined) playLabel = 'Join Tournament';
					else if (isPaused) playLabel = 'Tournament paused';
					else if (!focusedRoundView) playLabel = 'Waiting for round';
					else if (focusMode === 'next' || focusedRoundView.isFuture)
						playLabel = 'Waiting for next round';
					else if (focusMode === 'finished' || focusedRoundView.viewerRoundFinished)
						playLabel = 'Match finished';
					else if (focusedRoundView.allCompleted) playLabel = 'Round completed';
					else if (!primaryActionGame && currentRoundView?.liveCount > 0)
						playLabel = 'Match already started';
					else if (!primaryActionGame) playLabel = 'Waiting for match';
					else if (
						primaryActionGame?.status === 'live' &&
						primaryActionGame?.myJoined
					) {
						playLabel = 'Open live match';
					} else if (
						primaryActionGame?.status === 'open' &&
						primaryActionGame?.myJoined
					) {
						playLabel = 'Open lobby';
					} else if (primaryActionGame?.status === 'open') {
						playLabel = 'Join match';
					}
					actionsEl.innerHTML = `
						${
							hasJoined
								? '<div class="tournament-joined-mini">Joined tournament</div>'
								: `<button type="button" class="workspace-btn small primary" ${
										canJoin && !isPaused ? '' : 'disabled'
									} onclick="joinActiveTournament()">Join Tournament</button>`
						}
						${
							hasJoined
								? `<button type="button" class="workspace-btn small" ${
										canPlayPrimary ? '' : 'disabled'
									} onclick="${
										canPlayPrimary
											? `joinGameLobby('${escapeHtml(primaryActionGame.id)}')`
											: 'return false'
									}">
										${escapeHtml(playLabel)}
									</button>`
								: ''
						}
						${
							hasJoined && allowReentryEnabled
								? '<button type="button" class="workspace-btn small ghost" onclick="leaveActiveTournament()">Leave Tournament</button>'
								: ''
						}
						${
							isPaused
								? '<div class="tournament-paused-mini">Tournament Paused</div>'
								: ''
						}
					`;
				}
				if (journeyEl) {
					journeyEl.innerHTML = buildTournamentJourneyHtml({
						hasJoined,
						isPaused,
						currentRoundView,
						focusedRoundView,
						primaryActionGame,
						focusMode,
					});
				}
				// Show only the current round so students stay focused on what matters now.
				const gamesEl = byId('studentTournamentGames');
				if (gamesEl) {
					if (!focusedRoundView) {
						gamesEl.innerHTML =
							'<div class="empty-state-small">Your current round will appear here as soon as it is ready.</div>';
					} else {
						const roundView = focusedRoundView;
						const isUpcomingFocus =
							focusMode === 'next' || roundView.isFuture;
						const roundCardClasses = [
							'student-tournament-round-card',
							isUpcomingFocus ? 'is-upcoming' : 'is-current',
							roundView.status === 'completed' ? 'is-completed' : '',
						]
							.filter(Boolean)
							.join(' ');
						const roundCopy = !hasJoined
							? 'Join the tournament to unlock your current round.'
							: isPaused
								? 'This round is paused right now. Wait for the next update.'
								: focusMode === 'next'
									? 'Your current match is finished. The next round stays here and unlocks automatically when the teacher advances the tournament.'
									: focusMode === 'finished'
										? 'Your current tournament match is finished. Stay here for the final standings or the next update.'
								: roundView.allCompleted
									? 'This round is finished. Stay here and wait for the next round to open.'
									: isUpcomingFocus
										? 'This next round is prepared but still locked until the current round closes.'
									: 'Only the current round is shown here so you can focus on the match in front of you.';
						const gamesGridHtml = roundView.games.length
							? `<div class="student-tournament-game-grid">
								${roundView.games
									.map((game) => {
										const canPlayGame =
											hasJoined &&
											!isPaused &&
											!roundView.allCompleted &&
											!isUpcomingFocus &&
											!(game.status === 'live' && !game.myJoined) &&
											game.status !== 'completed' &&
											game.participantState !== 'forfeited' &&
											game.participantState !== 'eliminated';
										let buttonLabel = 'Open match';
										if (!hasJoined) buttonLabel = 'Join Tournament';
										else if (isPaused) buttonLabel = 'Paused';
										else if (isUpcomingFocus) buttonLabel = 'Locked';
										else if (
											game.participantState === 'forfeited' ||
											game.participantState === 'eliminated'
										) {
											buttonLabel = 'Finished';
										} else if (
											game.status === 'completed' ||
											roundView.status === 'completed'
										) {
											buttonLabel = 'Completed';
										} else if (game.status === 'live' && !game.myJoined)
											buttonLabel = 'Already started';
										else if (game.status === 'live' && game.myJoined) {
											buttonLabel = 'Open live match';
										} else if (game.status === 'open' && game.myJoined) {
											buttonLabel = 'Open lobby';
										} else if (game.status === 'open') {
											buttonLabel = hasJoined
												? 'Join match'
												: 'Join Tournament';
										}
										const inlineNote =
											game.participantState === 'forfeited'
												? 'You left this live match, so it counted as a loss.'
												: game.participantState === 'eliminated'
													? 'This round is finished for you.'
													: isUpcomingFocus
														? 'This next round will unlock here when the tournament advances.'
														: game.status === 'completed'
															? 'This match is already finished.'
															: game.status === 'live' && !game.myJoined
																? 'This match already started before you entered its lobby.'
																: game.status === 'live' && game.myJoined
																	? 'Your match is live now.'
																	: game.status === 'open' && game.myJoined
																		? 'Your lobby is open now, and ready, leave, start, and answer updates should appear here in real time.'
																		: 'This is part of your current round.';
										return `
											<article class="student-tournament-game-card ${[
												isUpcomingFocus
													? 'is-pending'
													: `is-${game.status || 'open'}`,
											]
												.filter(Boolean)
												.map((value) => escapeHtml(value))
												.join(' ')}">
												<div>
													<div class="student-tournament-game-title">${escapeHtml(
														game.name,
													)}</div>
													<div class="student-tournament-game-meta">${escapeHtml(
														getTournamentModeDisplay(game.mode || game.type),
													)}</div>
												</div>
												<div class="student-tournament-game-meta">
													${renderStudentTournamentStatusPill(
														game.myStatusLabel,
														game.myStatusTone,
													)}
												</div>
												<div class="student-tournament-inline-note">${escapeHtml(
													inlineNote,
												)}</div>
												<div class="student-tournament-game-actions">
													<button type="button" class="workspace-btn small" ${
														!hasJoined && !isPaused
															? ''
															: canPlayGame
																? ''
																: 'disabled'
													} onclick="${
														!hasJoined
															? 'joinActiveTournament()'
															: canPlayGame
																? `joinGameLobby('${escapeHtml(game.id)}')`
																: 'return false'
													}">
														${escapeHtml(buttonLabel)}
													</button>
												</div>
											</article>
										`;
									})
									.join('')}
							</div>`
							: `<div class="empty-state-small">${
									isUpcomingFocus
										? 'Your next round will appear here as soon as it is published.'
										: 'No games are assigned to your current round yet.'
								}</div>`;
						gamesEl.innerHTML = `
							<article class="${roundCardClasses}">
								<div class="student-tournament-round-head">
									<div>
										<div class="student-tournament-round-title">${escapeHtml(
											focusMode === 'next'
												? `Next Round ${roundView.round}`
												: focusMode === 'finished'
													? `Round ${roundView.round} Finished`
													: `Current Round ${roundView.round}`,
										)}</div>
										<div class="student-tournament-round-copy">${escapeHtml(
											roundCopy,
										)}</div>
									</div>
									${renderStudentTournamentStatusPill(
										roundView.statusLabel,
										roundView.statusTone,
									)}
								</div>
								<div class="student-tournament-round-progress-row">
									<span>${escapeHtml(
										roundView.totalCount
											? `${roundView.completedCount}/${roundView.totalCount} completed`
											: 'No games assigned',
									)}</span>
									<span>${escapeHtml(String(roundView.percent))}%</span>
								</div>
								<div class="student-tournament-progress-track">
									<div class="student-tournament-progress-bar" style="width:${escapeHtml(
										String(roundView.percent),
									)}%"></div>
								</div>
								<div class="student-tournament-round-stats">
									<span class="student-tournament-round-chip">Live: ${escapeHtml(
										String(roundView.liveCount),
									)}</span>
									<span class="student-tournament-round-chip">Open: ${escapeHtml(
										String(roundView.openCount),
									)}</span>
									<span class="student-tournament-round-chip">Completed: ${escapeHtml(
										String(roundView.completedCount),
									)}</span>
								</div>
								${gamesGridHtml}
							</article>
						`;
					}
				}
				if (metaEl) {
					metaEl.innerHTML = `
						<span class="tournament-meta-chip">${escapeHtml(
							focusMode === 'next' && focusedRoundView
								? `Next Round ${focusedRoundView.round}`
								: `Current Round ${currentRoundNumber}`,
						)}</span>
						<span class="tournament-meta-chip">${escapeHtml(
							String(joinedCount),
						)} participants</span>
						${
							currentRoundView
								? `<span class="tournament-meta-chip">${escapeHtml(
										currentRoundView.statusLabel,
									)}</span>`
								: ''
						}
						${
							primaryActionGame
								? `<span class="tournament-meta-chip">${escapeHtml(
										primaryActionGame.name,
									)}</span>`
								: ''
						}
						${isPaused ? '<span class="tournament-meta-chip warning">PAUSED</span>' : ''}
					`;
				}
				if (howItWorksEl) {
					const focusText = !hasJoined
						? 'Join once and this arena will switch to your current round automatically.'
						: isPaused
							? 'The tournament is paused. Wait here for the teacher to resume it.'
							: focusMode === 'next'
								? 'Your current match is finished. The next round will unlock here automatically when the tournament advances.'
								: focusMode === 'finished'
									? 'Your current match is finished. Stay here for final standings or the next tournament update.'
							: currentRoundView?.allCompleted
								? 'Your current round is finished. Stay here for the next round update.'
								: primaryActionGame
									? 'Use the main play button when your match is ready. Ready, leave, start, and answer updates should appear here in real time.'
									: 'Stay on this page. Your current round will update here automatically.';
					howItWorksEl.innerHTML = `
						<div class="student-tournament-benefits-title">Current Focus</div>
						<p>${escapeHtml(focusText)}</p>
					`;
				}

				if (participantsEl) {
					if (!participants.length) {
						participantsEl.innerHTML =
							'<div class="empty-state-small">No participants joined yet.</div>';
					} else {
						const sortedParticipants = participants
							.slice()
							.sort((left, right) => {
								const leftId = String(left?.userId || '').trim();
								const rightId = String(right?.userId || '').trim();
								if (sameUserIdValue(leftId, userId)) return -1;
								if (sameUserIdValue(rightId, userId)) return 1;
								const leftPoints =
									Number(leaderboardByUser.get(leftId)?.points) || 0;
								const rightPoints =
									Number(leaderboardByUser.get(rightId)?.points) || 0;
								return (
									rightPoints - leftPoints ||
									String(left?.name || '').localeCompare(String(right?.name || ''))
								);
							});
						participantsEl.innerHTML = sortedParticipants
							.map((participant) => {
								const participantId = String(
									participant?.userId || '',
								).trim();
								const points =
									Number(leaderboardByUser.get(participantId)?.points) || 0;
								const status = getTournamentParticipantStatusSummary(
									participant,
									activeTournament,
									roundViews,
								);
								const isSelf = sameUserIdValue(participantId, userId);
								return `
									<div class="student-tournament-participant-row ${
										isSelf ? 'is-self' : ''
									}">
										<div class="student-tournament-participant-main">
											<div class="student-tournament-participant-name">${escapeHtml(
												participant?.name || 'Student',
											)}${isSelf ? ' (You)' : ''}</div>
											<div class="student-tournament-participant-meta">${escapeHtml(
												status.detail || 'Waiting for round data.',
											)} - ${escapeHtml(String(points))} pts</div>
										</div>
										${renderStudentTournamentStatusPill(
											status.label,
											status.tone,
										)}
									</div>
								`;
							})
							.join('');
					}
				}

				if (boardEl) {
					const scoredLeaderboard = leaderboard.filter(
						(entry) => Number(entry.points) > 0,
					);
					if (!leaderboard.length) {
						boardEl.innerHTML =
							'<div class="empty-state-small">No participants yet. Join this tournament to appear on the board.</div>';
					} else {
						boardEl.innerHTML = leaderboard
							.slice(0, 5)
							.map((entry, index) => {
								const isSelf =
									userId && String(entry?.id || '').trim() === userId;
								return `
									<div class="student-tournament-row ${isSelf ? 'is-self' : ''}">
										<div class="student-tournament-row-rank">#${index + 1}</div>
										<div class="student-tournament-row-name">${escapeHtml(entry.name)}</div>
										<div class="student-tournament-row-points">${escapeHtml(
											String(entry.points),
										)} pts${Number(entry.points) <= 0 ? ' - waiting' : ''}</div>
									</div>
								`;
							})
							.join('');
						if (!scoredLeaderboard.length) {
							boardEl.insertAdjacentHTML(
								'beforeend',
								'<div class="empty-state-small" style="margin-top:8px;">No scored rounds yet. Finish a round game after joining to update the leaderboard.</div>',
							);
						}
					}
				}
			} else {
				if (tDesc) tDesc.textContent = 'No active tournaments running.';
				if (tBadge) {
					tBadge.textContent = 'Inactive';
					tBadge.classList.remove('active', 'warning');
					tBadge.classList.add('inactive');
				}
				if (scoreEl) scoreEl.textContent = '0';
				if (rankEl) rankEl.textContent = '-';
				if (playersEl) playersEl.textContent = '0';
				if (roundProgressEl) roundProgressEl.textContent = '-';
				if (metaEl) {
					metaEl.innerHTML =
						'<span class="tournament-meta-chip muted">No active tournament setup</span>';
				}
				if (actionsEl) {
					actionsEl.innerHTML = '';
				}
				if (journeyEl) {
					journeyEl.innerHTML =
						'<div class="empty-state-small">When a tournament starts, this area will only show the current step you need.</div>';
				}
				if (byId('studentTournamentGames')) {
					byId('studentTournamentGames').innerHTML =
						'<div class="empty-state-small">No round cards are available yet.</div>';
				}
				if (participantsEl) {
					participantsEl.innerHTML =
						'<div class="empty-state-small">Participants status will appear here when a tournament starts.</div>';
				}
				if (howItWorksEl) {
					howItWorksEl.innerHTML =
						'<div class="empty-state-small">Your tournament rules and benefits will appear here when a tournament starts.</div>';
				}
				if (byId('heroTournamentRank')) {
					byId('heroTournamentRank').textContent = '-';
				}
				if (boardEl) {
					boardEl.innerHTML =
						'<div class="empty-state-small">No leaderboard data yet.</div>';
				}
			}
		} catch (e) {
			console.error('Error rendering tournament status', e);
		}
	}

	function renderGamificationUI(context) {
		renderGamificationUIV2(context);
		return;
		const exp = context.user?.exp || 0;
		const level = Math.floor(exp / 200) + 1;

		if (byId('studentExpDisplay')) byId('studentExpDisplay').textContent = exp;
		if (byId('studentLevelDisplay'))
			byId('studentLevelDisplay').textContent = level;

		const badgesList = byId('studentBadgesList');
		if (badgesList) {
			const badges = Array.isArray(context.user?.badges)
				? context.user.badges
				: [];
			if (!badges.length) {
				badgesList.innerHTML =
					'<div class="empty-state-small" style="grid-column: 1 / -1;">No badges earned yet. Keep playing!</div>';
			} else {
				badgesList.innerHTML = badges
					.map(
						(b) => `
					<div style="background: var(--surface-color); padding: 1rem; border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">
						<div style="font-size: 2rem; margin-bottom: 0.5rem;">${b.icon || '🏆'}</div>
						<div style="font-weight: 600; font-size: 0.9rem;">${escapeHtml(b.name || 'Badge')}</div>
						<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(b.desc || '')}</div>
					</div>
				`,
					)
					.join('');
			}
		}

		try {
			const activeTournament = JSON.parse(
				localStorage.getItem('quizTournamentActive') || 'null',
			);
			const tDesc = byId('studentActiveTournamentDesc');
			const tBadge = byId('studentTournamentBadge');

			if (activeTournament && tDesc && tBadge) {
				tDesc.textContent = activeTournament.name;
				tBadge.textContent =
					'Active - ' +
					(activeTournament.targetMode === 'any'
						? 'All Modes'
						: activeTournament.targetMode);
				tBadge.style.color = 'var(--success-color, #10b981)';
				tBadge.style.background = 'rgba(16, 185, 129, 0.1)';
			} else if (tDesc && tBadge) {
				tDesc.textContent = 'No active tournaments running.';
				tBadge.textContent = 'Inactive';
				tBadge.style.color = 'var(--text-muted, #6b7280)';
				tBadge.style.background = 'var(--bg-color, #f3f4f6)';
			}
		} catch (e) {
			console.error('Error rendering tournament status', e);
		}
	}

	function bindWorkspaceTabs() {
		document.querySelectorAll('.workspace-tab-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				switchWorkspaceTab(btn.dataset.workspaceTab || 'overview');
			});
		});
	}

	function attachFilters() {
		document.querySelectorAll('.filter-chip[data-filter]').forEach((chip) => {
			chip.addEventListener('click', () => {
				document
					.querySelectorAll('.filter-chip[data-filter]')
					.forEach((el) => el.classList.remove('active'));
				chip.classList.add('active');
				state.filter = chip.dataset.filter || 'all';
				renderWorkspace();
			});
		});
	}

	function attachGameFilters() {
		document
			.querySelectorAll('.filter-chip[data-game-filter]')
			.forEach((chip) => {
				chip.addEventListener('click', () => {
					document
						.querySelectorAll('.filter-chip[data-game-filter]')
						.forEach((el) => el.classList.remove('active'));
					chip.classList.add('active');
					state.gameFilter = chip.dataset.gameFilter || 'open';
					const context = getStudentContext();
					if (context) renderGamesPanel(context);
				});
			});
	}

	function attachGameRefreshControl() {
		const button = byId('studentGamesRefreshBtn');
		if (!button || button.dataset.bound === 'true') return;
		button.dataset.bound = 'true';
		button.addEventListener('click', () => {
			const context = getStudentContext();
			if (!context) return;
			refreshGamesFromAdmin(context);
		});
	}

	function attachTrainingFilters() {
		document
			.querySelectorAll('.filter-chip[data-training-filter]')
			.forEach((chip) => {
				chip.addEventListener('click', () => {
					document
						.querySelectorAll('.filter-chip[data-training-filter]')
						.forEach((el) => el.classList.remove('active'));
					chip.classList.add('active');
					state.trainingFilter = chip.dataset.trainingFilter || 'all';
					const context = getStudentContext();
					if (!context) return;
					const trainingResults = getTrainingResults(context.identity);
					renderTrainingCards(trainingResults);
				});
			});
	}

	function bindProfileActions() {
		const headerProfileBtn = byId('workspaceProfileButton');
		if (headerProfileBtn) {
			headerProfileBtn.addEventListener('click', (event) => {
				event.stopPropagation();
				toggleStudentDropdown();
			});
		}

		document.querySelectorAll('.profile-tab-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				switchStudentProfileTab(btn.dataset.profileTab || 'profile');
			});
		});

		const settingsBtn = byId('studentDropdownSettings');
		if (settingsBtn) {
			settingsBtn.addEventListener('click', () => {
				openStudentSettingsTab('profile');
				closeStudentDropdown();
			});
		}

		const logoutBtn = byId('studentDropdownLogout');
		if (logoutBtn) {
			logoutBtn.addEventListener('click', () => {
				closeStudentDropdown();
				if (window.authLogout) window.authLogout();
			});
		}

		const profileForm = byId('studentProfileForm');
		if (profileForm) {
			profileForm.addEventListener('submit', (event) => {
				event.preventDefault();
				const context = getStudentContext();
				if (context) handleProfileSubmit(context);
			});
		}

		const resetBtn = byId('studentProfileReset');
		if (resetBtn) {
			resetBtn.addEventListener('click', () => {
				const context = getStudentContext();
				if (context) resetProfileForm(context);
			});
		}

		const avatarInput = byId('studentProfileAvatarInput');
		if (avatarInput) {
			avatarInput.addEventListener('change', handleAvatarUpload);
		}

		const profileInputs = document.querySelectorAll(
			'#studentProfileForm input, #studentProfileForm select, #studentProfileForm textarea',
		);
		profileInputs.forEach((input) => {
			input.addEventListener('input', () => {
				state.profileDirty = true;
			});
		});

		const passwordForm = byId('studentPasswordForm');
		if (passwordForm) {
			passwordForm.addEventListener('submit', (event) => {
				event.preventDefault();
				const context = getStudentContext();
				if (context) handlePasswordSubmit(context);
			});
		}

		document.addEventListener('click', (event) => {
			const dropdown = byId('studentWorkspaceDropdown');
			if (!dropdown) return;
			if (!dropdown.contains(event.target)) {
				closeStudentDropdown();
			}
		});
	}

	function useHint(gameId) {
		const game = getGameByIdResolved(gameId);
		const context = getStudentContext();
		if (!game || !context) return;

		const session = game.session || {};
		let question = null;
		let options = null;
		let currentQuestionKey = '';
		const normalizedType = normalizeGameTypeValue(game?.type);

		if (normalizedType === 'cards' || normalizedType === 'cards-draw') {
			const pending = session.card?.pendingCard;
			const pendingQuestionId = normalizeCardQuestionIdValue(
				pending?.questionId,
			);
			question =
				pending &&
				game.questions.find((q) =>
					sameCardQuestionIdValue(q?.id, pendingQuestionId),
				);
			currentQuestionKey =
				pendingQuestionId || getNormalizedQuestionIdValue(question?.id) || '';
		} else if (normalizedType === 'sprint-race') {
			const sprint = session.sprint || {};
			const me = getParticipant(session, context.user.id);
			const mySprint =
				getSprintEntryForUser(sprint, me?.userId || context?.user?.id) || {};
			const totalQuestionsRaw = Number(
				sprint.totalQuestions ||
					(Array.isArray(game.questions) ? game.questions.length : 0),
			);
			const totalQuestions = Number.isFinite(totalQuestionsRaw)
				? Math.max(Math.floor(totalQuestionsRaw), 0)
				: 0;
			const myQuestionIndex = Math.max(
				0,
				Math.floor(Number(mySprint?.questionIndex || 0)),
			);
			const isFinished =
				totalQuestions > 0
					? myQuestionIndex >= totalQuestions ||
						Boolean(parseTimestampMs(mySprint?.finishedAt))
					: true;
			question =
				!isFinished && totalQuestions
					? game.questions[Math.min(myQuestionIndex, totalQuestions - 1)] ||
						null
					: null;
			currentQuestionKey =
				getNormalizedQuestionIdValue(question?.id) ||
				`sprint:${myQuestionIndex}`;
		} else {
			const round = session.round;
			question =
				round &&
				game.questions.find((q) =>
					sameQuestionIdValue(q?.id, round?.questionId),
				);
			currentQuestionKey =
				getNormalizedQuestionIdValue(round?.questionId) ||
				getNormalizedQuestionIdValue(question?.id) ||
				'';
		}

		const normalizedKey = String(currentQuestionKey || '').trim();
		if (normalizedKey && state.lastHintQuestionKey !== normalizedKey) {
			state.hintUsed = false;
			state.lastHintQuestionKey = normalizedKey;
		}
		if (state.hintUsed) {
			showToast('Hint already used for this question.', 'info');
			return;
		}
		if (!question) {
			showToast(
				'Hint unavailable for this sprint question right now.',
				'warning',
			);
			return;
		}

		const optionEntries = extractQuestionOptions(question);
		options = optionEntries
			.map((option) => String(option?.text || option?.image || '').trim())
			.filter(Boolean);
		if (!options || options.length < 3) {
			showToast(
				'Hint works on multiple-choice questions with at least 3 options.',
				'info',
			);
			return;
		}

		const expectedAnswer = getQuestionExpectedAnswerValue(question);
		const correctAnswers = splitChoiceAnswerTokensFlexible(expectedAnswer)
			.map((value) => mapAnswerTokenToOptionText(value, optionEntries))
			.map((value) => normalizeAnswerToken(value))
			.filter(Boolean);
		if (!correctAnswers.length) {
			correctAnswers.push(
				normalizeAnswerToken(
					mapAnswerTokenToOptionText(
						normalizePreviewAnswerValue(expectedAnswer),
						optionEntries,
					),
				),
			);
		}
		const incorrectIndices = [];
		options.forEach((opt, idx) => {
			const normalizedOption = normalizeAnswerToken(opt);
			if (!correctAnswers.includes(normalizedOption)) {
				incorrectIndices.push(idx);
			}
		});

		if (incorrectIndices.length < 2) {
			showToast(
				'Hint could not hide enough incorrect options for this question.',
				'info',
			);
			return;
		}

		// Randomly pick 2 to hide
		const toHide = [];
		while (toHide.length < 2 && incorrectIndices.length > 0) {
			const randIdx = Math.floor(Math.random() * incorrectIndices.length);
			toHide.push(incorrectIndices.splice(randIdx, 1)[0]);
		}

		// Disable the buttons in the DOM
		const stage = byId('studentGameStage');
		if (stage) {
			const buttons = stage.querySelectorAll('.game-options .option-btn');
			toHide.forEach((idx) => {
				if (buttons[idx]) {
					buttons[idx].classList.remove('selected');
					buttons[idx].setAttribute('aria-pressed', 'false');
					buttons[idx].disabled = true;
					buttons[idx].style.opacity = '0.2';
					buttons[idx].style.pointerEvents = 'none';
				}
			});
			// Hide the hint button itself
			const hintBtn = stage.querySelector('.hint-btn');
			if (hintBtn) hintBtn.style.display = 'none';
		}

		state.hintUsed = true;
		if (normalizedKey) {
			state.lastHintQuestionKey = normalizedKey;
		}
		showToast('50/50 applied! Points will be reduced if correct.', 'info');
	}

	function bindGameActions() {
		if (state.gameActionsBound) return;
		state.gameActionsBound = true;

		const getEventTargetElement = (event) => {
			const rawTarget = event?.target;
			if (!rawTarget) return null;
			if (rawTarget.nodeType === 1) return rawTarget;
			if (rawTarget.parentElement && rawTarget.parentElement.nodeType === 1) {
				return rawTarget.parentElement;
			}
			return null;
		};

		const closestFromEvent = (event, selector) => {
			const start = getEventTargetElement(event);
			if (!start || !selector) return null;
			if (typeof start.closest === 'function') {
				return start.closest(selector);
			}
			let current = start;
			while (current && current.nodeType === 1) {
				const matcher =
					current.matches ||
					current.msMatchesSelector ||
					current.webkitMatchesSelector;
				if (typeof matcher === 'function' && matcher.call(current, selector)) {
					return current;
				}
				current = current.parentElement;
			}
			return null;
		};

		const gameLists = document.querySelectorAll('#studentGameListMain');
		gameLists.forEach((gameList) => {
			gameList.addEventListener('click', (event) => {
				const button = closestFromEvent(event, 'button');
				if (!button) return;
				const gameId = button.dataset.gameId;
				if (!gameId) return;
				const action = button.dataset.action;
				const team = button.dataset.team;
				const context = getStudentContext();
				if (!context) return;

				if (action === 'join-game') {
					joinGame(gameId, context);
				}
				if (action === 'join-team') {
					joinGame(gameId, context, team);
				}
				if (action === 'toggle-ready') {
					toggleReady(gameId, context);
				}
				if (action === 'enter-game') {
					syncGameStateNow(gameId, context).finally(() => {
						openGameStageForStudent(gameId, context);
					});
				}
				renderGamesPanel(context);
			});
		});

		const submitStructuredAnswerByMode = (
			mode,
			gameId,
			context,
			answerValue,
			questionIndex,
		) => {
			if (!answerValue) return;
			const requestedMode = String(mode || '').toLowerCase();
			const currentGame =
				getGameByIdResolved(gameId) || getCachedGame(gameId) || null;
			const session = currentGame?.session || {};
			const hasActiveTieBreak =
				Boolean(session.tieBreak) && !Boolean(session.tieBreak?.resolved);
			const normalizedType = String(currentGame?.type || '').toLowerCase();
			const isCardGame =
				normalizedType === 'cards' ||
				normalizedType === 'card' ||
				normalizedType.includes('card');

			let effectiveMode = requestedMode;
			if (hasActiveTieBreak) {
				effectiveMode = 'tiebreak';
			} else if (isCardGame) {
				effectiveMode = 'card';
			} else {
				effectiveMode = 'race';
			}

			if (effectiveMode === 'card') {
				submitCardAnswer(gameId, context, answerValue);
				return;
			}
			if (effectiveMode === 'tiebreak') {
				submitTieBreakAnswer(gameId, context, answerValue);
				return;
			}
			submitRaceAnswer(gameId, context, answerValue, questionIndex);
		};

		const stage = byId('studentGameStage');
		if (stage) {
			const stagePointerSupportedActions = new Set([
				'leave-stage',
				'toggle-header-rows',
				'toggle-ready',
				'set-special-card',
				'toggle-reminder-rule',
				'use-hint',
				'toggle-multi-option',
				'submit-multi-answer',
				'submit-structured-answer',
				'answer-race',
				'submit-race-text',
				'submit-warmup',
				'play-card',
				'answer-card',
				'submit-card-text',
				'answer-tiebreak',
				'submit-tiebreak-text',
			]);

			stage.addEventListener('click', (event) => {
				const removeWordBtn = closestFromEvent(event, '.remove-word-btn');
				if (removeWordBtn) {
					const zone = removeWordBtn.closest('.fill-blank-drop-zone');
					if (zone) {
						clearFillBlankZone(zone);
					}
					return;
				}

				const wordItem = closestFromEvent(event, '.word-bank-item');
				if (wordItem) {
					handleGameWordItemClick(wordItem);
					return;
				}

				const dropZone = closestFromEvent(event, '.fill-blank-drop-zone');
				if (dropZone) {
					handleGameDropZoneClick(dropZone);
					return;
				}

				const matchItem = closestFromEvent(event, '.game-match-item');
				if (matchItem) {
					handleGameMatchItemClick(matchItem);
					return;
				}

				const button = closestFromEvent(event, 'button');
				if (!button) return;
				const hasPointerSynthFlag =
					String(button.dataset.edgePointerSynthClick || '') === '1';
				const lastPointerHandledAt = Number(
					button.dataset.edgePointerHandledAt || 0,
				);
				if (
					!hasPointerSynthFlag &&
					Number.isFinite(lastPointerHandledAt) &&
					lastPointerHandledAt > 0 &&
					Date.now() - lastPointerHandledAt < 250
				) {
					return;
				}
				if (hasPointerSynthFlag) {
					delete button.dataset.edgePointerSynthClick;
					const handledAt = Date.now();
					button.dataset.edgePointerHandledAt = String(handledAt);
					setTimeout(() => {
						if (
							button &&
							button.dataset &&
							String(button.dataset.edgePointerHandledAt || '') ===
								String(handledAt)
						) {
							delete button.dataset.edgePointerHandledAt;
						}
					}, 700);
				}
				const action = button.dataset.action;
				const gameId = button.dataset.gameId || state.activeGameId;
				const context = getStudentContext();
				if (!context || !gameId) return;

				if (action === 'leave-stage') {
					leaveGameStage();
					return;
				}
				if (action === 'toggle-header-rows') {
					state.headerRowsCollapsed = !state.headerRowsCollapsed;
					applyHeaderRowsToggle(stage);
					return;
				}
				if (action === 'toggle-ready') {
					toggleReady(gameId, context);
					renderGameStage(context);
					return;
				}
				if (action === 'set-special-card') {
					const requestedSpecial = normalizeSpecialCardId(
						button.dataset.specialCard || '',
					);
					const activeGame =
						getGameByIdResolved(gameId) || getCachedGame(gameId) || null;
					if (
						requestedSpecial &&
						!isSpecialCardAvailableForGame(activeGame, requestedSpecial)
					) {
						showToast(
							'This special card is already used in this lobby.',
							'warning',
						);
						setSelectedSpecialCard(gameId, '');
						renderGameStage(context);
						return;
					}
					setSelectedSpecialCard(gameId, requestedSpecial);
					if (requestedSpecial) {
						const label =
							getSpecialCardLabel(requestedSpecial) || 'Special effect';
						const canActivateNow = canViewerActivateCardSpecial(
							activeGame,
							context,
						);
						showToast(
							canActivateNow
								? `${label} selected. It will be applied to your next sent question.`
								: `${label} armed. It will apply when your turn starts.`,
							'info',
						);
					} else {
						showToast('Special effect cleared for your next question.', 'info');
					}
					renderGameStage(context);
					return;
				}
				if (action === 'toggle-reminder-rule') {
					const ruleId = button.dataset.ruleId || '';
					toggleSelectedReminderRule(gameId, ruleId);
					const activeGame =
						getGameByIdResolved(gameId) || getCachedGame(gameId) || null;
					const selectedFromBadge = normalizeSpecialCardId(
						button.dataset.specialCard || ruleId,
					);
					const isCardMode =
						normalizeGameTypeValue(activeGame?.type) === 'cards' ||
						normalizeGameTypeValue(activeGame?.type) === 'cards-draw';
					if (isCardMode && selectedFromBadge) {
						if (!isSpecialCardAvailableForGame(activeGame, selectedFromBadge)) {
							setSelectedSpecialCard(gameId, '');
							showToast(
								'This special card is already used in this lobby.',
								'warning',
							);
						} else {
							const currentSpecial = getSelectedSpecialCard(gameId);
							const nextSpecial =
								currentSpecial === selectedFromBadge ? '' : selectedFromBadge;
							setSelectedSpecialCard(gameId, nextSpecial);
							if (nextSpecial) {
								const label =
									getSpecialCardLabel(nextSpecial) || 'Special effect';
								const canActivateNow = canViewerActivateCardSpecial(
									activeGame,
									context,
								);
								showToast(
									canActivateNow
										? `${label} selected for your next sent card.`
										: `${label} armed. It will apply when your turn starts.`,
									'info',
								);
							} else {
								showToast('Special effect cleared.', 'info');
							}
						}
					}
					renderGameStage(context);
					return;
				}
				if (action === 'use-hint') {
					useHint(gameId);
				}
				if (action === 'toggle-multi-option') {
					if (button.disabled) return;
					event.preventDefault();
					const host = button.closest('.game-quiz-shell');
					const questionKey = String(
						button.dataset.questionKey || host?.dataset.questionKey || '',
					).trim();
					const targetGameId = String(
						button.dataset.gameId ||
							host?.dataset.gameId ||
							gameId ||
							state.activeGameId ||
							'',
					).trim();
					const answerValue = String(button.dataset.answer || '').trim();
					const nextSelected = !button.classList.contains('selected');
					button.classList.toggle('selected', nextSelected);
					button.setAttribute('aria-pressed', nextSelected ? 'true' : 'false');
					if (targetGameId && questionKey && answerValue) {
						toggleSavedMultiSelectValue(
							targetGameId,
							questionKey,
							answerValue,
							nextSelected,
						);
					}
					return;
				}
				if (action === 'submit-multi-answer') {
					const host = button.closest('.game-quiz-shell');
					const collected = collectMultiSelectGameAnswer(host);
					if (!collected.ok) {
						showToast(
							collected.message || 'Please select one or more options first.',
							'warning',
						);
						return;
					}
					submitStructuredAnswerByMode(
						String(button.dataset.mode || 'race').toLowerCase(),
						gameId,
						context,
						collected.value,
						host?.dataset.questionIndex,
					);
					return;
				}
				if (action === 'submit-structured-answer') {
					const host = button.closest('.game-quiz-shell');
					const collected = collectStructuredGameAnswer(host);
					if (!collected.ok) {
						showToast(
							collected.message || 'Please complete the question first.',
							'warning',
						);
						return;
					}
					submitStructuredAnswerByMode(
						String(button.dataset.mode || 'race').toLowerCase(),
						gameId,
						context,
						collected.value,
						host?.dataset.questionIndex,
					);
					return;
				}
				if (action === 'answer-race') {
					if (button.disabled) return;
					applySingleChoiceSelection(button);
					const shell = button.closest('.game-quiz-shell');
					submitRaceAnswer(
						gameId,
						context,
						button.dataset.answer,
						shell?.dataset.questionIndex,
					);
					return;
				}
				if (action === 'submit-race-text') {
					const input = byId('raceAnswerInput');
					const shell = input?.closest('.game-quiz-shell');
					if (input && input.value.trim()) {
						submitRaceAnswer(
							gameId,
							context,
							input.value.trim(),
							shell?.dataset.questionIndex,
						);
						input.value = '';
					}
					return;
				}
				if (action === 'submit-warmup') {
					const input = byId('warmupAnswerInput');
					if (input && input.value.trim()) {
						submitWarmupAnswer(gameId, context, input.value.trim());
						input.value = '';
					}
				}
				if (action === 'play-card') {
					event.preventDefault();
					const specialChoice = resolveCardPlaySpecialSelection(
						gameId,
						context,
					);
					if (specialChoice === null) return;
					playCard(gameId, context, button.dataset.cardId, specialChoice);
				}
				if (action === 'answer-card') {
					if (button.disabled) return;
					applySingleChoiceSelection(button);
					submitCardAnswer(gameId, context, button.dataset.answer);
					return;
				}
				if (action === 'submit-card-text') {
					const input = byId('cardAnswerInput');
					if (input && input.value.trim()) {
						submitCardAnswer(gameId, context, input.value.trim());
						input.value = '';
					}
				}
				if (action === 'answer-tiebreak') {
					if (button.disabled) return;
					applySingleChoiceSelection(button);
					submitTieBreakAnswer(gameId, context, button.dataset.answer);
					return;
				}
				if (action === 'submit-tiebreak-text') {
					const input = byId('tieBreakAnswerInput');
					if (input && input.value.trim()) {
						submitTieBreakAnswer(gameId, context, input.value.trim());
						input.value = '';
					}
				}
			});

			stage.addEventListener('pointerup', (event) => {
				if (typeof event.button === 'number' && event.button !== 0) return;
				const pointerType = String(event.pointerType || '').toLowerCase();
				if (!pointerType || pointerType === 'mouse') return;
				const button = closestFromEvent(event, 'button');
				if (!button || button.disabled) return;
				const action = String(button.dataset.action || '').trim();
				if (!action || !stagePointerSupportedActions.has(action)) return;
				button.dataset.edgePointerSynthClick = '1';
				event.preventDefault();
				if (typeof button.click === 'function') {
					button.click();
				}
				setTimeout(() => {
					if (
						button &&
						button.dataset &&
						String(button.dataset.edgePointerSynthClick || '') === '1'
					) {
						delete button.dataset.edgePointerSynthClick;
					}
				}, 500);
			});

			stage.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter') return;
				const target = event.target;
				if (!target || !(target instanceof HTMLElement)) return;
				const context = getStudentContext();
				const gameId = state.activeGameId;
				if (!context || !gameId) return;

				if (target.id === 'warmupAnswerInput' && target.value.trim()) {
					event.preventDefault();
					submitWarmupAnswer(gameId, context, target.value.trim());
					target.value = '';
				}
				if (target.id === 'raceAnswerInput' && target.value.trim()) {
					event.preventDefault();
					const host = target.closest('.game-quiz-shell');
					submitRaceAnswer(
						gameId,
						context,
						target.value.trim(),
						host?.dataset.questionIndex,
					);
					target.value = '';
				}
				if (target.id === 'cardAnswerInput' && target.value.trim()) {
					event.preventDefault();
					submitCardAnswer(gameId, context, target.value.trim());
					target.value = '';
				}
				if (target.id === 'tieBreakAnswerInput' && target.value.trim()) {
					event.preventDefault();
					submitTieBreakAnswer(gameId, context, target.value.trim());
					target.value = '';
				}
				if (target.classList?.contains('game-fill-input')) {
					const submitBtn = target
						.closest('.game-quiz-shell')
						?.querySelector('button[data-action="submit-structured-answer"]');
					if (submitBtn && !submitBtn.disabled) {
						event.preventDefault();
						submitBtn.click();
					}
				}
			});

			stage.addEventListener('dragstart', (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				if (!event.dataTransfer) return;

				const wordItem = target.closest('.word-bank-item');
				if (
					wordItem &&
					!wordItem.classList.contains('used') &&
					!wordItem.disabled
				) {
					event.dataTransfer.effectAllowed = 'copy';
					event.dataTransfer.setData(
						'text/plain',
						decodeDataValue(wordItem.dataset.wordValue),
					);
					event.dataTransfer.setData(
						'application/x-word-token',
						String(wordItem.dataset.wordToken || ''),
					);
					wordItem.classList.add('dragging');
					handleGameWordItemClick(wordItem);
					return;
				}

				const draggableOption = target.closest('.game-draggable-option');
				if (draggableOption) {
					state.draggedGameOption = draggableOption;
					draggableOption.classList.add('dragging');
					event.dataTransfer.effectAllowed = 'move';
					event.dataTransfer.setData('text/plain', '');
				}
			});

			stage.addEventListener('dragend', (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				target.classList.remove('dragging');
				state.draggedGameOption = null;
				stage
					.querySelectorAll('.fill-blank-drop-zone.drag-over')
					.forEach((zone) => {
						zone.classList.remove('drag-over');
					});
			});

			stage.addEventListener('dragover', (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				const draggableList = target.closest('.game-draggable-list');
				if (draggableList && state.draggedGameOption) {
					event.preventDefault();
					const afterElement = getGameDragAfterElement(
						draggableList,
						event.clientY,
					);
					if (!afterElement) {
						draggableList.appendChild(state.draggedGameOption);
					} else if (afterElement !== state.draggedGameOption) {
						draggableList.insertBefore(state.draggedGameOption, afterElement);
					}
				}

				const dropZone = target.closest('.fill-blank-drop-zone');
				if (dropZone) {
					event.preventDefault();
					dropZone.classList.add('drag-over');
				}
			});

			stage.addEventListener('drop', (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				if (!event.dataTransfer) return;
				const dropZone = target.closest('.fill-blank-drop-zone');
				if (dropZone) {
					event.preventDefault();
					dropZone.classList.remove('drag-over');
					const draggedWord =
						event.dataTransfer.getData('text/plain') ||
						decodeDataValue(state.selectedGameWordEl?.dataset?.wordValue || '');
					const token =
						event.dataTransfer.getData('application/x-word-token') ||
						String(state.selectedGameWordEl?.dataset?.wordToken || '');
					if (draggedWord) {
						fillBlankZone(dropZone, draggedWord, token);
					}
					return;
				}

				const draggableList = target.closest('.game-draggable-list');
				if (draggableList && state.draggedGameOption) {
					event.preventDefault();
				}
			});
		}
	}
	function handleProfileSubmit(context) {
		const fullName = String(byId('studentProfileFullName')?.value || '').trim();
		const username = String(byId('studentProfileUsername')?.value || '').trim();
		const studentNumber = String(
			byId('studentProfileNumberInput')?.value || '',
		).trim();
		const classId = String(
			byId('studentProfileClassSelect')?.value || '',
		).trim();
		const email = String(byId('studentProfileEmail')?.value || '').trim();
		const note = String(byId('studentProfileNote')?.value || '').trim();

		if (!fullName || !username || !studentNumber || !classId) {
			showToast('Please fill in all required fields', 'error');
			return;
		}

		const pendingRequest = getProfileRequestsForUser(context.user.id).find(
			(req) => req.status === 'pending',
		);

		const user = context.user || {};
		const changes = {};
		if (fullName !== String(user.name || '').trim()) changes.name = fullName;
		if (username !== String(user.username || '').trim())
			changes.username = username;
		if (studentNumber !== String(user.studentNumber || '').trim()) {
			changes.studentNumber = studentNumber;
		}
		if (classId !== String(user.classId || '').trim())
			changes.classId = classId;
		if (email !== String(user.email || '').trim()) changes.email = email;

		const classList = window.__DI_CONTAINER__.repo.getAll_sync('classes');
		const className =
			classList.find((cls) => String(cls.id) === classId)?.name ||
			context.identity?.class ||
			'';
		const currentSnapshot = {
			name: user.name || fullName,
			username: user.username || username,
			studentNumber: user.studentNumber || studentNumber,
			classId: user.classId || classId,
			className: user.className || className,
			email: user.email || '',
		};

		if (
			!window.Auth?.submitProfileRequest ||
			!window.Auth?.updateProfileRequest
		) {
			showToast('Profile request service is not available', 'error');
			return;
		}

		const targetRequestId = String(
			state.profileEditingRequestId || pendingRequest?.id || '',
		).trim();
		const noteChanged = targetRequestId
			? note !== String(pendingRequest?.note || '').trim()
			: Boolean(note);
		if (!Object.keys(changes).length && !state.avatarDraft && !noteChanged) {
			showToast('No changes detected', 'info');
			return;
		}
		const request = targetRequestId
			? window.Auth.updateProfileRequest(targetRequestId, context.user.id, {
					changes,
					avatar: state.avatarDraft,
					note,
					currentSnapshot,
				})
			: window.Auth.submitProfileRequest({
					userId: context.user.id,
					changes,
					avatar: state.avatarDraft,
					note,
					currentSnapshot,
				});
		if (!request) {
			showToast(
				targetRequestId
					? 'Unable to update pending request'
					: 'Unable to send request',
				'error',
			);
			return;
		}
		state.profileEditingRequestId = String(request.id || '');

		const socket = getSocket();
		if (socket && socket.connected) {
			socket.emit(
				'student:requestProfileUpdate',
				{
					requestId: request.id,
					createdAt: request.createdAt,
					userId: context.user.id,
					changes,
					avatar: state.avatarDraft,
					note,
					currentSnapshot,
					fullName,
					username,
					studentNumber,
					classId,
					email,
				},
				(response) => {
					if (response?.error) {
						showToast(response.error, 'error');
					}
				},
			);
		}

		showToast(
			targetRequestId
				? 'Pending profile request updated'
				: 'Profile update request sent to admin',
			'success',
		);
		state.profileDirty = false;
		renderProfileStatus(context);
	}

	function loadProfileRequestForEdit(requestId, context) {
		const request = getProfileRequestsForUser(context.user.id).find(
			(entry) =>
				String(entry.id || '').trim() === String(requestId || '').trim() &&
				String(entry.status || '').toLowerCase() === 'pending',
		);
		if (!request) {
			showToast('Pending request not found', 'error');
			return;
		}

		const merged = {
			...(request.currentSnapshot || {}),
			...(request.changes || {}),
		};
		const fullNameInput = byId('studentProfileFullName');
		const usernameInput = byId('studentProfileUsername');
		const numberInput = byId('studentProfileNumberInput');
		const classSelect = byId('studentProfileClassSelect');
		const emailInput = byId('studentProfileEmail');
		const noteInput = byId('studentProfileNote');

		if (fullNameInput) fullNameInput.value = String(merged.name || '').trim();
		if (usernameInput)
			usernameInput.value = String(merged.username || '').trim();
		if (numberInput) {
			numberInput.value = String(merged.studentNumber || '').trim();
		}
		if (classSelect) classSelect.value = String(merged.classId || '').trim();
		if (emailInput) emailInput.value = String(merged.email || '').trim();
		if (noteInput) noteInput.value = String(request.note || '').trim();

		state.avatarDraft = String(request.avatar || '').trim();
		if (state.avatarDraft) {
			const avatarImg = byId('studentProfileAvatarImage');
			const avatarFallback = byId('studentProfileAvatarFallback');
			if (avatarImg) {
				avatarImg.src = state.avatarDraft;
				avatarImg.style.display = 'block';
			}
			if (avatarFallback) avatarFallback.style.display = 'none';
		}

		state.profileEditingRequestId = String(request.id || '');
		state.profileDirty = true;
		renderProfileStatus(context);
		showToast('Loaded pending request into form. Save to update it.', 'info');
	}

	function deletePendingProfileRequest(requestId, context) {
		if (!window.Auth?.deleteProfileRequest) {
			showToast('Profile request service is not available', 'error');
			return;
		}
		const removed = window.Auth.deleteProfileRequest(
			requestId,
			context.user.id,
		);
		if (!removed) {
			showToast('Unable to delete pending request', 'error');
			return;
		}
		if (
			String(state.profileEditingRequestId || '') === String(requestId || '')
		) {
			resetProfileForm(context);
		}
		renderProfileStatus(context);
		showToast('Pending profile request deleted', 'success');
	}

	function renderProfileStatus(context) {
		const container = byId('studentProfileRequestStatus');
		if (!container) return;

		const submitBtn = document.querySelector(
			'#studentProfileForm button[type="submit"]',
		);
		const requests = getProfileRequestsForUser(context.user.id);
		const pendingRequest = requests.find(
			(entry) => String(entry.status || '').toLowerCase() === 'pending',
		);
		if (!pendingRequest) {
			state.profileEditingRequestId = '';
		} else if (!state.profileEditingRequestId) {
			state.profileEditingRequestId = String(pendingRequest.id || '');
		}

		if (submitBtn) {
			submitBtn.disabled = false;
			submitBtn.textContent = pendingRequest
				? 'Update Pending Request'
				: 'Send Update Request';
		}

		if (!requests.length) {
			container.innerHTML =
				'<div class="empty-state">No profile requests yet. Submit a request when you need profile changes.</div>';
			return;
		}

		const rows = requests.slice(0, 6).map((request) => {
			const status = String(request.status || 'pending').toLowerCase();
			const createdAt =
				request.createdAt || request.requestedAt || request.receivedAt;
			const createdLabel = createdAt
				? new Date(createdAt).toLocaleString()
				: 'Unknown time';
			const reviewLabel = request.reviewedAt
				? new Date(request.reviewedAt).toLocaleString()
				: '';
			const isPending = status === 'pending';
			const isEditing =
				isPending &&
				String(state.profileEditingRequestId || '') ===
					String(request.id || '');
			return `
				<div class="profile-request-row ${escapeHtml(status)} ${isEditing ? 'is-editing' : ''}">
					<div class="profile-request-main">
						<div class="request-title">Request ${escapeHtml(
							String(request.id || '').slice(0, 8) || '-',
						)}</div>
						<div class="request-subtitle">${escapeHtml(createdLabel)}</div>
						${
							request.note
								? `<div class="request-note">${escapeHtml(request.note)}</div>`
								: ''
						}
						${
							request.reviewNote
								? `<div class="request-review-note">Review note: ${escapeHtml(
										request.reviewNote,
									)}</div>`
								: ''
						}
						${
							reviewLabel
								? `<div class="request-subtitle">Reviewed: ${escapeHtml(reviewLabel)}</div>`
								: ''
						}
					</div>
					<div class="profile-request-side">
						<span class="request-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>
						${
							isPending
								? `<div class="profile-request-actions">
										<button type="button" class="workspace-btn ghost small" onclick="loadStudentProfileRequest('${escapeHtml(
											String(request.id || ''),
										)}')">Edit</button>
										<button type="button" class="workspace-btn ghost small" onclick="deleteStudentProfileRequest('${escapeHtml(
											String(request.id || ''),
										)}')">Delete</button>
									</div>`
								: ''
						}
					</div>
				</div>
			`;
		});

		container.innerHTML = `<div class="profile-request-list">${rows.join('')}</div>`;
	}

	function startGameTicker(context) {
		// Keep a single ticker that dynamically switches between
		// server-authoritative rendering and offline fallback logic.
		if (state.gameTicker) {
			clearInterval(state.gameTicker);
		}
		state.gameTicker = setInterval(() => {
			const liveContext = getStudentContext() || context;
			if (!liveContext) return;
			const socket = getSocket();
			const connected = Boolean(socket && socket.connected);
			const hasExpiredTimer = refreshGameScoreboardTimers();

			if (connected && hasExpiredTimer && state.activeGameId) {
				requestGameSync(state.activeGameId, liveContext, 0);
			}

			if (connected) {
				if (!state.activeGameId) return;
				const liveGame =
					getGameByIdResolved(state.activeGameId) ||
					getCachedGame(state.activeGameId);
				const signature = liveGame ? getGameStageSignature(liveGame) : '';
				const signatureChanged =
					!liveGame ||
					state.lastStageGameId !== String(state.activeGameId) ||
					state.lastStageSignature !== signature;
				if (signatureChanged) {
					renderGameStage(liveContext);
				} else {
					requestGameSync(
						state.activeGameId,
						liveContext,
						GAME_SYNC_RENDER_INTERVAL_MS,
					);
				}
				return;
			}
			// Do not mutate multiplayer game state locally while disconnected.
			// Wait for server reconnection and authoritative updates.
			return;
		}, 1000);
	}

	window.openExam = function (examId) {
		if (!examId) return;
		window.location.href = `index.html?examId=${examId}`;
	};

	window.openTrainingMode = function () {
		window.location.href = 'index.html?mode=training';
	};

	window.joinActiveTournament = function () {
		const context = getStudentContext();
		if (!context) {
			showAuthModal();
			return;
		}
		joinActiveTournament(context);
	};

	window.leaveActiveTournament = function () {
		const context = getStudentContext();
		if (!context) {
			showAuthModal();
			return;
		}
		leaveActiveTournament(context);
	};

	window.openTournamentGames = function () {
		const tournament = getActiveTournamentRecord();
		if (!tournament || !tournament.id) {
			console.warn('No active tournament found');
			return;
		}
		state.activeTournamentMode = tournament.targetMode;
		renderWorkspace();
		const arena = byId('studentTournamentGames');
		if (arena && typeof arena.scrollIntoView === 'function') {
			arena.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	window.joinGameLobby = function (gameId) {
		if (!gameId) {
			console.warn('No game ID provided');
			return;
		}
		const context = getStudentContext();
		if (!context) {
			showToast('Please sign in to play', 'error');
			return;
		}
		syncGameStateNow(gameId, context).then((latestGame) => {
			const game =
				latestGame ||
				getGameByIdResolved(gameId) ||
				getCachedGame(gameId) ||
				getGameById(gameId);
			const status = String(game?.status || 'draft').toLowerCase();
			const participant = game
				? getParticipant(ensureSession(game), context.user.id)
				: null;
			const participantState = String(participant?.state || '').toLowerCase();

			if (status === 'completed') {
				showToast('This game is already completed.', 'info');
				return;
			}

			if (
				status === 'live' &&
				(participantState === 'forfeited' || participantState === 'eliminated')
			) {
				showToast(
					'This match is already finished for you. Wait for the next round or final results.',
					'info',
				);
				return;
			}

			if (participant && (status === 'open' || status === 'draft' || status === 'live')) {
				openGameStageForStudent(gameId, context);
				return;
			}

			if (!game || status === 'open' || status === 'draft') {
				joinGame(gameId, context).then((response) => {
					if (response?.error) return;
					syncGameStateNow(gameId, context).finally(() => {
						openGameStageForStudent(gameId, context);
					});
				});
				return;
			}

			if (status === 'live') {
				showToast(
					'This match is already live, so new players cannot join it now.',
					'warning',
				);
				return;
			}

			showToast('This game is not ready yet.', 'warning');
		});
	};

	window.loadStudentProfileRequest = function (requestId) {
		const context = getStudentContext();
		if (!context) {
			showAuthModal();
			return;
		}
		loadProfileRequestForEdit(requestId, context);
	};

	window.deleteStudentProfileRequest = function (requestId) {
		const context = getStudentContext();
		if (!context) {
			showAuthModal();
			return;
		}
		if (!confirm('Delete this pending profile request?')) return;
		deletePendingProfileRequest(requestId, context);
	};

	document.addEventListener('DOMContentLoaded', () => {
		bindWorkspaceTabs();
		attachFilters();
		attachGameFilters();
		attachGameRefreshControl();
		attachTrainingFilters();
		bindProfileActions();
		bindGameActions();
		bindGameSocket();
		bindStickyProfileDock();
		restoreActiveGameId();
		const loginBtn = byId('workspaceLoginButton');
		if (loginBtn) loginBtn.addEventListener('click', showAuthModal);

		renderWorkspace();
		queueStickyProfileDockUpdate();
	});

	window.addEventListener('auth:changed', () => {
		bindGameSocket();
		renderWorkspace();
	});

	// Safety net: the SaaS login bridge may succeed without firing the
	// `auth:changed` event this page relies on to render (missing globals on a
	// stale auth.js, a swallowed error, etc.). When that happens the page would
	// otherwise stay on the sign-in modal with an unloaded workspace. Detect a
	// persisted session whose user was never applied and recover by applying it.
	setInterval(() => {
		try {
			if (window.Auth?.getCurrentUser?.()) return; // already applied — stay idle
			const raw =
				sessionStorage.getItem('quizSession') ||
				localStorage.getItem('quizSession');
			const session = raw ? JSON.parse(raw) : null;
			if (!session || !session.token || !session.userId) return;
			// A session exists but currentUser was never set — apply it now.
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users') || [];
			const user = users.find(
				(u) => String(u && u.id) === String(session.userId),
			);
			if (!user) return; // bootstrap hasn't delivered users yet — retry next tick
			if (typeof window.Auth?.setCurrentUser === 'function') {
				window.Auth.setCurrentUser(user, session);
			}
			renderWorkspace();
		} catch (_) {
			/* non-fatal */
		}
	}, 800);

	function saveGameResult(game, context) {
		try {
			if (!game?.id) return;
			const session = game.session || {};
			const lobbyId = String(
				session.lobbyId ||
					game.results?.lobbyId ||
					`${game.id}-lobby-${game.lobbyCounter || 1}`,
			);
			const lobbyLabel = String(
				session.lobbyLabel ||
					game.results?.lobbyLabel ||
					getLobbyLabelForGame(game),
			);
			const resultKey = `${game.id}::${lobbyId}`;
			if (savedGameResultIds.has(resultKey)) return;
			// Calculate outcome if not already present
			const outcome = getGameOutcome(game, context);
			if (!outcome) return;

			const results = window.__DI_CONTAINER__.repo.getAll_sync('results');
			// Check if result already exists for this game ID to avoid duplicates
			const existingIndex = results.findIndex(
				(r) => `${r.gameId || ''}::${r.lobbyId || ''}` === resultKey,
			);

			// Construct result entry from game state
			const studentName =
				context.identity?.name ||
				context.user?.name ||
				context.user?.username ||
				'Student';
			const studentNumber =
				context.user?.studentNumber || context.identity?.numero || '';
			const className =
				context.classRecord?.name ||
				context.identity?.class ||
				context.user?.className ||
				'';
			const winnerEntry = game.results?.winners?.[0] || null;
			let winnerName = winnerEntry?.name || '';
			let winnerId = winnerEntry?.id || winnerEntry?.userId || '';
			if (!winnerName && winnerId && game.mode === 'team') {
				winnerName = getTeamName(game, winnerId);
			}
			if (!winnerName && winnerId && game.mode !== 'team') {
				const winnerParticipant = game.session?.participants?.find(
					(p) => p.userId === winnerId,
				);
				winnerName = winnerParticipant?.name || '';
			}
			if (!winnerName && winnerId) {
				winnerName = winnerId;
			}

			const participantEntries = (game.session?.participants || []).map((p) => {
				const name =
					p.name ||
					p.username ||
					p.displayName ||
					p.studentName ||
					p.userId ||
					'';
				return {
					id: p.userId || p.id || '',
					name: name || 'Player',
					teamId: p.teamId || '',
				};
			});
			const participantNames = [
				...new Set(
					participantEntries
						.map((p) => p.name)
						.filter((n) => n && n !== 'Player'),
				),
			];
			if (!participantNames.length && studentName) {
				participantNames.push(studentName);
			}
			const tournamentContext =
				game?.tournamentContext && typeof game.tournamentContext === 'object'
					? game.tournamentContext
					: null;

			const resultEntry = {
				gameId: game.id,
				sourceGameId:
					String(tournamentContext?.sourceGameId || '').trim() || game.id,
				lobbyId,
				lobbyLabel,
				gameName: game.name || 'Untitled Game',
				gameType: game.type || 'race',
				gameMode: game.mode || 'standard',
				type: game.type || 'race',
				mode: game.mode || 'standard',
				studentName,
				studentNumber,
				name: studentName,
				classId: context.classRecord ? context.classRecord.id : 'unknown',
				className,
				class: className || '',
				userId: context.user?.id || '',
				score: outcome.score || 0,
				rank: outcome.rank || '-',
				label: outcome.label || 'Completed',
				winnerName,
				winnerId,
				participants: participantNames,
				participantDetails: participantEntries,
				participantCount:
					participantNames.length || participantEntries.length || 0,
				totalQuestions: game.questions ? game.questions.length : 0,
				isTournamentGame: Boolean(
					String(tournamentContext?.tournamentId || '').trim(),
				),
				tournamentId: String(tournamentContext?.tournamentId || '').trim(),
				tournamentRound: Math.max(Number(tournamentContext?.round) || 0, 0),
				date: new Date().toISOString(),
				// Store the full game ID to prevent re-saving
				savedAt: Date.now(),
			};

			if (existingIndex >= 0) {
				savedGameResultIds.add(resultKey);
				// Optional: update if needed, but usually results are final once completed
				// For now, only update if the new score differs (which shouldn't happen for completed games)
				if (results[existingIndex].score !== resultEntry.score) {
					results[existingIndex] = resultEntry;
					window.__DI_CONTAINER__.repo.setAll_sync('results', results);
					window.dispatchEvent(new Event('storage'));
				}
			} else {
				savedGameResultIds.add(resultKey);
				results.unshift(resultEntry);
				window.__DI_CONTAINER__.repo.setAll_sync('results', results);

				awardGamification(resultEntry, context);

				// Manually trigger storage event for this tab if needed,
				// though usually we want to re-render the results list if it exists
				const resultsContainer = document.getElementById('studentResults');
				if (resultsContainer && typeof renderResultsList === 'function') {
					// re-render if we had that function exposed
				}
				// Force workspace render to update stats
				if (typeof renderWorkspace === 'function') {
					// debounced render might be better but this is fine
				}
			}
		} catch (e) {
			console.error('Failed to save game result:', e);
		}
	}

	let gameUiRefreshTimer = null;
	function scheduleGameUiRefresh(context) {
		if (!context) return;
		if (gameUiRefreshTimer) return;
		gameUiRefreshTimer = setTimeout(() => {
			gameUiRefreshTimer = null;
			renderGamesPanel(context);
			renderGameStage(context);
			renderGamificationUI(context);

			// Check for completed games and save results
			const games = getGamesStore();
			games.forEach((game) => {
				if (game.status === 'completed') {
					saveGameResult(game, context);
				}
			});
		}, 120);
	}

	window.addEventListener('quiz:games-updated', () => {
		const context = getStudentContext();
		scheduleGameUiRefresh(context);
	});

	window.addEventListener('storage', (event) => {
		const key = event?.key || '';
		if (
			!key ||
			key === 'quizGames' ||
			key === 'quizUsers' ||
			key === 'quizProfileRequests' ||
			key === 'quizResults' ||
			key === 'examResults' ||
			key === 'quizGamification' ||
			key === 'quizTournamentActive' ||
			key === 'quizTournamentsHistory'
		) {
			renderWorkspace();
		}
	});

	window.addEventListener('quiz:gamification-updated', () => {
		const context = getStudentContext();
		if (!context) return;
		renderGamificationUI(context);
	});

	function awardGamificationV2(resultEntry, context) {
		if (!context?.user?.id || !resultEntry) return;
		try {
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
			const userIndex = users.findIndex((u) => u.id === context.user.id);
			if (userIndex === -1) return;

			const user = { ...users[userIndex] };
			let gConfig = {
				expPerCorrect: 10,
				expPerWin: 100,
				autoAwardBadges: true,
			};
			try {
				var _r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var parsed = _r ? _r.getValue_sync('gamification', {}) : JSON.parse(localStorage.getItem('quizGamification') || '{}');
				gConfig = {
					expPerCorrect: Number(parsed.expPerCorrect) || 10,
					expPerWin: Number(parsed.expPerWin) || 100,
					autoAwardBadges: parsed.autoAwardBadges !== false,
				};
			} catch (e) {
				// Keep defaults
			}

			user.exp = Number(user.exp) || 0;
			user.badges = Array.isArray(user.badges) ? user.badges : [];
			user.tournamentScores =
				user.tournamentScores && typeof user.tournamentScores === 'object'
					? user.tournamentScores
					: {};

			const score = Math.max(Number(resultEntry.score) || 0, 0);
			const totalQuestions = Math.max(
				Number(resultEntry.totalQuestions) || 0,
				0,
			);
			const rankValue = String(resultEntry.rank || '').trim();
			const isWinner =
				String(resultEntry.winnerId || '').trim() ===
				String(user.id || '').trim();

			let expGained = 0;
			if (isWinner) expGained += gConfig.expPerWin;
			expGained += score * gConfig.expPerCorrect;
			user.exp += expGained;

			const hasBadge = (badgeId) =>
				user.badges.some((badge) => badge && badge.id === badgeId);
			const addBadge = (id, icon, name, desc) => {
				if (gConfig.autoAwardBadges === false) return;
				if (hasBadge(id)) return;
				user.badges.push({ id, icon, name, desc, earnedAt: Date.now() });
				showToast(`Badge earned: ${name}`, 'success');
			};

			if (gConfig.autoAwardBadges !== false) {
				if (isWinner) {
					addBadge(
						'first_win',
						'W1',
						'First Victory',
						'Won a multiplayer match.',
					);
				}
				if (score >= 100) {
					addBadge(
						'centurion',
						'100+',
						'Centurion',
						'Scored at least 100 points.',
					);
				}
				if (score >= 500) {
					addBadge(
						'unstoppable',
						'500+',
						'Unstoppable',
						'Scored at least 500 points.',
					);
				}
				if (resultEntry.gameType === 'cards' && isWinner) {
					addBadge('card_master', 'CARD', 'Card Master', 'Won a Card Battle.');
				}
				if (resultEntry.gameType === 'sprint-race' && isWinner) {
					addBadge('speedster', 'SPD', 'Speedster', 'Won a Sprint Race.');
				}
				if (totalQuestions > 0 && score >= totalQuestions) {
					addBadge(
						'perfect_run',
						'PER',
						'Perfect Run',
						'Finished with full points in one session.',
					);
				}
				if (rankValue === '1' || rankValue === '2' || rankValue === '3') {
					addBadge('podium', 'TOP', 'Podium', 'Finished in the top 3.');
				}
			}

			const activeTournament = getActiveTournamentRecord();
			if (activeTournament && activeTournament.id) {
				const tournamentEligibility = isTournamentGameEligible(
					activeTournament,
					resultEntry.gameId,
					resultEntry.gameType,
				);
				const joined = isUserTournamentParticipant(activeTournament, user.id);
				if (tournamentEligibility.eligible && joined) {
					const key = String(activeTournament.id);
					const current = Number(user.tournamentScores[key]) || 0;
					const multiplier = Math.max(
						Number(activeTournament.pointMultiplier) || 1,
						0,
					);
					const winnerBonus = isWinner
						? Math.max(Number(activeTournament.winnerBonus) || 0, 0)
						: 0;
					const tournamentPoints = Math.max(
						Math.round(expGained * multiplier + winnerBonus),
						0,
					);
					user.tournamentScores[key] = current + tournamentPoints;
					const totalTournamentScore = Object.values(
						user.tournamentScores,
					).reduce((sum, value) => sum + (Number(value) || 0), 0);
					if (totalTournamentScore >= 250) {
						addBadge(
							'tournament_rookie',
							'TRK',
							'Tournament Rookie',
							'Earned at least 250 tournament points.',
						);
					}
					if (totalTournamentScore >= 1000) {
						addBadge(
							'tournament_elite',
							'TEL',
							'Tournament Elite',
							'Earned at least 1000 tournament points.',
						);
					}
				}
			}

			user.lastGamificationSyncAt = new Date().toISOString();
			users[userIndex] = user;
			window.__DI_CONTAINER__.repo.setAll_sync('users', users);

			context.user.exp = user.exp;
			context.user.badges = user.badges;
			context.user.tournamentScores = user.tournamentScores;

			renderGamificationUI(context);

			if (window.clientSocket && window.clientSocket.connected) {
				window.clientSocket.emit(
					'student:syncStoredData',
					{
						source: 'gamification',
						userId: user.id,
						userPatch: {
							exp: user.exp,
							badges: user.badges,
							tournamentScores: user.tournamentScores,
							lastGamificationSyncAt: user.lastGamificationSyncAt,
						},
						quizUsers: users,
					},
					(response) => {
						if (response && response.ok === false) {
							console.warn('Gamification sync rejected:', response.error);
						}
					},
				);
			}
		} catch (e) {
			console.error('Gamification Engine Error', e);
		}
	}

	function awardGamification(resultEntry, context) {
		awardGamificationV2(resultEntry, context);
		return;
		if (!context?.user?.id) return;
		try {
			const users = window.__DI_CONTAINER__.repo.getAll_sync('users');
			const userIndex = users.findIndex((u) => u.id === context.user.id);
			if (userIndex === -1) return;

			const user = users[userIndex];
			const gConfig = (function() { var _r2 = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo; return _r2 ? _r2.getValue_sync('gamification', {}) : JSON.parse(localStorage.getItem('quizGamification') || '{"expPerCorrect":10,"expPerWin":100,"autoAwardBadges":true}'); })();

			// Init arrays
			user.exp = user.exp || 0;
			user.badges = user.badges || [];
			user.tournamentScores = user.tournamentScores || {};

			let expGained = 0;
			const isWinner = resultEntry.winnerId === user.id;
			if (isWinner) expGained += Number(gConfig.expPerWin) || 100;
			expGained +=
				(Number(resultEntry.score) || 0) *
				(Number(gConfig.expPerCorrect) || 10);
			user.exp += expGained;

			if (gConfig.autoAwardBadges !== false) {
				const hasBadge = (badgeId) => user.badges.some((b) => b.id === badgeId);
				const addBadge = (id, icon, name, desc) => {
					if (!hasBadge(id)) {
						user.badges.push({ id, icon, name, desc, earnedAt: Date.now() });
						showToast(`🏆 Badge Earned: ${name}!`, 'success');
					}
				};

				if (isWinner)
					addBadge(
						'first_win',
						'🥇',
						'First Victory',
						'Won a multiplayer match.',
					);
				if (resultEntry.score >= 100)
					addBadge('centurion', '🔥', 'Centurion', 'Scored over 100 points.');
				if (resultEntry.score >= 500)
					addBadge(
						'unstoppable',
						'⚡',
						'Unstoppable',
						'Scored over 500 points.',
					);
				if (resultEntry.gameType === 'cards' && isWinner)
					addBadge('card_master', '🃏', 'Card Master', 'Won a Card Battle.');
				if (resultEntry.gameType === 'sprint-race' && isWinner)
					addBadge('speedster', '🚀', 'Speedster', 'Won a Sprint Race.');
			}

			const activeTournament = JSON.parse(
				localStorage.getItem('quizTournamentActive') || 'null',
			);
			if (activeTournament) {
				const isTargetMode =
					activeTournament.targetMode === 'any' ||
					activeTournament.targetMode === resultEntry.gameType;
				if (isTargetMode) {
					user.tournamentScores[activeTournament.id] =
						(user.tournamentScores[activeTournament.id] || 0) + expGained;
				}
			}

			users[userIndex] = user;
			window.__DI_CONTAINER__.repo.setAll_sync('users', users);

			context.user.exp = user.exp;
			context.user.badges = user.badges;
			context.user.tournamentScores = user.tournamentScores;

			renderGamificationUI(context);

			// Tell Realtime Server (if connected) to sync the user update
			if (window.clientSocket && window.clientSocket.connected) {
				window.clientSocket.emit('student:syncStoredData', {
					quizUsers: users,
				});
			}
		} catch (e) {
			console.error('Gamification Engine Error', e);
		}
	}

	window.openStudentProfileModal = openStudentProfileModal;
	window.closeStudentProfileModal = closeStudentProfileModal;
})();

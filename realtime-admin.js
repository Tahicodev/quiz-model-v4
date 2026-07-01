(function () {
	let session = null;
	try {
		const raw =
			sessionStorage.getItem('quizSession') ||
			localStorage.getItem('quizSessionRemember');
		session = raw ? JSON.parse(raw) : null;
	} catch (e) {
		session = null;
	}

	if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
		return;
	}

	const SERVER = (
		localStorage.getItem('quizServerHost') ||
		window.QUIZ_SERVER_HOST ||
		location.origin
	).replace(/\/$/, '');
	const REALTIME_ADMIN_RUNTIME_KEY = '__QUIZ_REALTIME_ADMIN_RUNTIME__';
	const existingRuntime = window[REALTIME_ADMIN_RUNTIME_KEY];
	if (existingRuntime?.initialized && existingRuntime.socket) {
		window.adminSocket = existingRuntime.socket;
		window.clientSocket = existingRuntime.socket;
		return;
	}
	const socket = existingRuntime?.socket || (window.io ? io(SERVER) : null);
	if (!socket) return;
	window[REALTIME_ADMIN_RUNTIME_KEY] = {
		initialized: true,
		socket,
		server: SERVER,
	};

	// Export socket globally so other scripts can use it
	// Export socket globally so other scripts can use it
	window.adminSocket = socket;
	window.clientSocket = socket; // Alias for shared code compatibility

	const panelId = 'devices-panel';

	function createPanel() {
		if (document.getElementById(panelId)) return;
		const panel = document.createElement('div');
		panel.id = panelId;
		panel.style.position = 'fixed';
		panel.style.right = '12px';
		panel.style.top = '80px';
		panel.style.width = '340px';
		panel.style.maxHeight = '70vh';
		panel.style.overflow = 'auto';
		panel.style.background = 'var(--card-bg, #fff)';
		panel.style.border = '1px solid #ddd';
		panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
		panel.style.padding = '12px';
		panel.style.zIndex = 9999;
		panel.style.display = 'none'; /* Hidden by default */

		panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Devices (LAN)</strong>
        <div>
          <button id="devices-refresh" style="margin-right:4px">Refresh</button>
          <button id="devices-merge">Merge All</button>
          <button id="devices-close" style="background:none;border:none;cursor:pointer;font-size:16px;">×</button>
        </div>
      </div>
      <div id="devices-list">Loading...</div>
    `;

		document.body.appendChild(panel);

		document.getElementById('devices-refresh').addEventListener('click', () => {
			// request instant broadcast from server by reconnecting identify
			socket.emit('identify', { role: 'admin' });
		});

		document.getElementById('devices-merge').addEventListener('click', () => {
			mergeAllDevices();
		});

		document.getElementById('devices-close').addEventListener('click', () => {
			panel.style.display = 'none';
		});

		// Store reference to show the panel when needed
		window.showDevicesPanel = () => {
			const p = document.getElementById(panelId);
			if (p) p.style.display = 'block';
		};
	}

	function renderClients(list) {
		createPanel();
		const container = document.getElementById('devices-list');
		if (!container) return;
		if (!list || list.length === 0) {
			container.innerHTML = '<div>No devices connected</div>';
			return;
		}
		container.innerHTML = '';
		list.forEach((c) => {
			const el = document.createElement('div');
			el.style.borderTop = '1px solid #eee';
			el.style.padding = '8px 0';
			el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600">${escapeHtml(
							c.name || c.deviceId || c.ip,
						)}</div>
            <div style="font-size:12px;color:#666">${escapeHtml(c.ip)} • ${
							c.status || 'unknown'
						}</div>
            <div style="font-size:11px;color:#888">Last: ${
							c.lastSeen ? new Date(c.lastSeen).toLocaleTimeString() : '-'
						}</div>
          </div>
          <div style="text-align:right">
            <button data-socketid="${
							c.socketId
						}" class="btn-request">Request</button>
            <button data-socketid="${
							c.socketId
						}" class="btn-download">Download</button>
          </div>
        </div>
      `;
			container.appendChild(el);
		});

		// attach handlers
		container.querySelectorAll('.btn-request').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const sid = e.currentTarget.dataset.socketid;
				socket.emit('admin:requestClientData', { socketId: sid });
				// server will prompt client to send localStorageUpdate; admins also get clients:update with data
			});
		});

		container.querySelectorAll('.btn-download').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const sid = e.currentTarget.dataset.socketid;
				// find client data from last known list
				const found = lastClients.find((x) => x.socketId === sid);
				if (found && found.data) downloadJson(found.data, `device-${sid}.json`);
				else alert('No data available for this device yet');
			});
		});
	}

	function escapeHtml(s) {
		if (!s) return '';
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}
	function downloadJson(obj, name) {
		const blob = new Blob([JSON.stringify(obj, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	let lastClients = [];

	function persistAdminGames(games, syncedAt = '') {
		if (typeof window.applyAuthoritativeGameList === 'function') {
			return window.applyAuthoritativeGameList(games, {
				syncedAt: syncedAt || new Date().toISOString(),
			});
		}
		const safeGames = Array.isArray(games) ? games : [];
		localStorage.setItem('quizGames', JSON.stringify(safeGames));
		localStorage.setItem(
			'quizGamesSyncedAt',
			String(syncedAt || new Date().toISOString()),
		);
		window.dispatchEvent(
			new CustomEvent('quiz:games-updated', {
				detail: { games: safeGames },
			}),
		);
		return safeGames;
	}

	function upsertAdminGame(game) {
		let existingGames = [];
		try {
			const parsed = JSON.parse(localStorage.getItem('quizGames') || '[]');
			existingGames = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			existingGames = [];
		}
		const gameId = String(game?.id || '').trim();
		if (!gameId) return existingGames;
		const index = existingGames.findIndex(
			(entry) => String(entry?.id || '').trim() === gameId,
		);
		if (index >= 0) {
			existingGames[index] = {
				...existingGames[index],
				...game,
				id: gameId,
			};
		} else {
			existingGames.push({
				...game,
				id: gameId,
			});
		}
		return persistAdminGames(existingGames, new Date().toISOString());
	}

	socket.on('connect', () => {
		socket.emit('identify', { role: 'admin' });
		socket.emit('game:list', (response) => {
			if (!response?.ok || !Array.isArray(response.games)) return;

			let existingGames = [];
			try {
				const parsed = JSON.parse(localStorage.getItem('quizGames') || '[]');
				existingGames = Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				existingGames = [];
			}

			// If server has 0 games, but admin has local games, it means the authoritative
			// server lost its in-memory state. Admin should HYDRATE the server, not wipe local.
			if (response.games.length === 0 && existingGames.length > 0) {
				console.warn('[RealtimeAdmin] Server returned 0 games but local has games. Hydrating server...');
				existingGames.forEach((game) => {
					socket.emit('game:hydrate', game);
				});
				return; // Do not overwrite local games with empty array!
			}

			persistAdminGames(response.games, new Date().toISOString());
		});
	});

	socket.on('admin:requestUserSync', () => {
		if (typeof window.syncUsersToClients === 'function') {
			window.syncUsersToClients();
		}
	});

	socket.on('admin:requestGameSync', () => {
		if (typeof window.syncGamesToClients === 'function') {
			window.syncGamesToClients();
		}
	});

	socket.on('admin:requestGamificationSync', () => {
		if (typeof window.syncGamificationSettings === 'function') {
			window.syncGamificationSettings();
		}
	});

	socket.on('admin:syncUsers', (payload) => {
		if (!payload || !Array.isArray(payload.quizUsers)) return;
		try {
			let existingUsers = [];
			try {
				const parsed = JSON.parse(localStorage.getItem('quizUsers') || '[]');
				existingUsers = Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				existingUsers = [];
			}

			const adminUsers = existingUsers.filter(
				(user) => String(user?.role || '').toLowerCase() === 'admin',
			);
			const merged = [...adminUsers];
			const seen = new Set(adminUsers.map((user) => String(user?.id || '')));
			payload.quizUsers.forEach((user) => {
				const id = String(user?.id || '').trim();
				if (!id || seen.has(id)) return;
				seen.add(id);
				merged.push(user);
			});

			localStorage.setItem('quizUsers', JSON.stringify(merged));
			if (payload.syncedAt) {
				localStorage.setItem('quizUsersSyncedAt', payload.syncedAt);
			}
			if (typeof window.renderUsersTable === 'function') {
				window.renderUsersTable();
			}
			if (typeof window.loadGamificationUI === 'function') {
				window.loadGamificationUI();
			}
		} catch (error) {
			console.error('Failed to apply synced users payload on admin:', error);
		}
	});

	socket.on('admin:syncGames', (payload) => {
		if (payload?.quizGames) {
			const statusRank = { draft: 0, open: 1, live: 2, completed: 3 };
			const normalizeQuestionIdRef = (value) => String(value || '').trim();
			const normalizeCardHandArray = (hand) => {
				if (!Array.isArray(hand)) return [];
				const normalized = [];
				const seen = new Set();
				hand.forEach((entry) => {
					const cardId = normalizeQuestionIdRef(entry);
					if (!cardId) return;
					const key = cardId.toLowerCase();
					if (seen.has(key)) return;
					seen.add(key);
					normalized.push(cardId);
				});
				return normalized;
			};
			const mergeAnswers = (existingList = [], incomingList = []) => {
				const map = new Map();
				existingList.forEach((entry) => {
					if (entry && entry.userId) map.set(entry.userId, entry);
				});
				incomingList.forEach((entry) => {
					if (!entry || !entry.userId) return;
					const prev = map.get(entry.userId);
					if (!prev) {
						map.set(entry.userId, entry);
						return;
					}
					const prevTime = prev.answeredAt || 0;
					const nextTime = entry.answeredAt || 0;
					if (entry.correct && !prev.correct) {
						map.set(entry.userId, { ...prev, ...entry });
						return;
					}
					if (nextTime > prevTime) {
						map.set(entry.userId, { ...prev, ...entry });
					}
				});
				return Array.from(map.values());
			};
			const mergeParticipants = (existingList = [], incomingList = []) => {
				const map = new Map();
				existingList.forEach((p) => {
					if (p && p.userId) map.set(p.userId, { ...p });
				});
				incomingList.forEach((p) => {
					if (!p || !p.userId) return;
					const prev = map.get(p.userId) || {};
					map.set(p.userId, { ...prev, ...p });
				});
				return Array.from(map.values());
			};
			const mergeWarmup = (existingWarmup, incomingWarmup) => {
				if (incomingWarmup === null) return null;
				if (incomingWarmup === undefined) return existingWarmup || null;
				if (!existingWarmup) return incomingWarmup || null;
				const merged = { ...existingWarmup, ...incomingWarmup };
				const warmupReset =
					Number(incomingWarmup.round || 0) !== Number(existingWarmup.round || 0) ||
					String(incomingWarmup.startedAt || '') !==
						String(existingWarmup.startedAt || '');
				if (Array.isArray(incomingWarmup.answers) && warmupReset) {
					merged.answers = incomingWarmup.answers.slice();
				} else {
					merged.answers = mergeAnswers(
						existingWarmup.answers || [],
						incomingWarmup.answers || [],
					);
				}
				merged.resolved = Boolean(
					existingWarmup.resolved || incomingWarmup.resolved,
				);
				merged.winnerId =
					incomingWarmup.winnerId || existingWarmup.winnerId || '';
				merged.startedAt = incomingWarmup.startedAt || existingWarmup.startedAt;
				return merged;
			};
			const mergeRound = (existingRound, incomingRound) => {
				if (incomingRound === null) return null;
				if (incomingRound === undefined) return existingRound || null;
				if (!existingRound) return incomingRound || null;
				const merged = { ...existingRound, ...incomingRound };
				const incomingQuestionId = normalizeQuestionIdRef(
					incomingRound.questionId,
				);
				const existingQuestionId = normalizeQuestionIdRef(
					existingRound.questionId,
				);
				const roundReset =
					incomingQuestionId !== existingQuestionId ||
					String(incomingRound.startedAt || '') !==
						String(existingRound.startedAt || '');
				if (Array.isArray(incomingRound.answers) && roundReset) {
					merged.answers = incomingRound.answers.slice();
				} else {
					merged.answers = mergeAnswers(
						existingRound.answers || [],
						incomingRound.answers || [],
					);
				}
				merged.resolved = Boolean(
					existingRound.resolved || incomingRound.resolved,
				);
				merged.startedAt = incomingRound.startedAt || existingRound.startedAt;
				merged.questionId = incomingQuestionId || existingQuestionId;
				return merged;
			};
			const mergeTieBreak = (existingTie, incomingTie) => {
				if (incomingTie === null) return null;
				if (incomingTie === undefined) return existingTie || null;
				if (!existingTie) return incomingTie || null;
				const merged = { ...existingTie, ...incomingTie };
				const incomingQuestionId = normalizeQuestionIdRef(
					incomingTie.questionId,
				);
				const existingQuestionId = normalizeQuestionIdRef(
					existingTie.questionId,
				);
				const tieReset =
					incomingQuestionId !== existingQuestionId ||
					String(incomingTie.startedAt || '') !==
						String(existingTie.startedAt || '') ||
					Number(incomingTie.index || 0) !== Number(existingTie.index || 0);
				if (Array.isArray(incomingTie.answers) && tieReset) {
					merged.answers = incomingTie.answers.slice();
				} else {
					merged.answers = mergeAnswers(
						existingTie.answers || [],
						incomingTie.answers || [],
					);
				}
				merged.resolved = Boolean(
					existingTie.resolved || incomingTie.resolved,
				);
				merged.startedAt = incomingTie.startedAt || existingTie.startedAt;
				merged.questionId = incomingQuestionId || existingQuestionId;
				merged.candidates =
					incomingTie.candidates || existingTie.candidates || [];
				return merged;
			};
			const mergeCard = (existingCard, incomingCard) => {
				if (incomingCard === null) return null;
				if (incomingCard === undefined) return existingCard || null;
				if (!existingCard) {
					if (!incomingCard) return null;
					const clonedIncoming = { ...incomingCard };
					const normalizedHands = {};
					Object.keys(clonedIncoming.hands || {}).forEach((userId) => {
						normalizedHands[userId] = normalizeCardHandArray(
							clonedIncoming.hands[userId],
						);
					});
					clonedIncoming.hands = normalizedHands;
					if (
						clonedIncoming.pendingCard &&
						typeof clonedIncoming.pendingCard === 'object'
					) {
						clonedIncoming.pendingCard.questionId = normalizeQuestionIdRef(
							clonedIncoming.pendingCard.questionId,
						);
					}
					if (
						clonedIncoming.lastResult &&
						typeof clonedIncoming.lastResult === 'object'
					) {
						clonedIncoming.lastResult.questionId = normalizeQuestionIdRef(
							clonedIncoming.lastResult.questionId,
						);
					}
					return clonedIncoming;
				}
				const merged = { ...existingCard, ...incomingCard };
				const incomingHands =
					incomingCard.hands && typeof incomingCard.hands === 'object'
						? incomingCard.hands
						: null;
				const existingHands =
					existingCard.hands && typeof existingCard.hands === 'object'
						? existingCard.hands
						: {};
				if (incomingHands) {
					const handKeys = new Set([
						...Object.keys(existingHands),
						...Object.keys(incomingHands),
					]);
					const handMap = {};
					handKeys.forEach((userId) => {
						const incomingHand = incomingHands[userId];
						if (Array.isArray(incomingHand)) {
							handMap[userId] = normalizeCardHandArray(incomingHand);
							return;
						}
						handMap[userId] = normalizeCardHandArray(existingHands[userId]);
					});
					merged.hands = handMap;
				} else {
					const handMap = {};
					Object.keys(existingHands).forEach((userId) => {
						handMap[userId] = normalizeCardHandArray(existingHands[userId]);
					});
					merged.hands = handMap;
				}
				merged.turnOrder =
					(incomingCard.turnOrder && incomingCard.turnOrder.length
						? incomingCard.turnOrder
						: existingCard.turnOrder) || [];
				if (Number.isFinite(Number(incomingCard.turnIndex))) {
					merged.turnIndex = Number(incomingCard.turnIndex);
				} else if (Number.isFinite(Number(existingCard.turnIndex))) {
					merged.turnIndex = Number(existingCard.turnIndex);
				} else {
					merged.turnIndex = 0;
				}
				if (Object.prototype.hasOwnProperty.call(incomingCard, 'pendingCard')) {
					merged.pendingCard = incomingCard.pendingCard || null;
				} else {
					merged.pendingCard = existingCard.pendingCard || null;
				}
				if (merged.pendingCard && typeof merged.pendingCard === 'object') {
					merged.pendingCard.questionId = normalizeQuestionIdRef(
						merged.pendingCard.questionId,
					);
				}
				if (Object.prototype.hasOwnProperty.call(incomingCard, 'lastResult')) {
					merged.lastResult = incomingCard.lastResult || null;
				} else {
					merged.lastResult = existingCard.lastResult || null;
				}
				if (merged.lastResult && typeof merged.lastResult === 'object') {
					merged.lastResult.questionId = normalizeQuestionIdRef(
						merged.lastResult.questionId,
					);
				}
				merged.usedSpecialCards = Array.isArray(incomingCard.usedSpecialCards)
					? incomingCard.usedSpecialCards.slice()
					: Array.isArray(existingCard.usedSpecialCards)
						? existingCard.usedSpecialCards.slice()
						: [];
				return merged;
			};
			const mergeSprint = (existingSprint, incomingSprint) => {
				if (incomingSprint === null) return null;
				if (incomingSprint === undefined) return existingSprint || null;
				if (!existingSprint) return incomingSprint || null;
				const merged = { ...existingSprint, ...incomingSprint };
				merged.byUser = {
					...(existingSprint.byUser || {}),
					...(incomingSprint.byUser || {}),
				};
				merged.finishOrder = Array.isArray(incomingSprint.finishOrder)
					? [...incomingSprint.finishOrder]
					: Array.isArray(existingSprint.finishOrder)
						? [...existingSprint.finishOrder]
						: [];
				return merged;
			};
			const mergeHotPotato = (existingPotato, incomingPotato) => {
				if (incomingPotato === null) return null;
				if (incomingPotato === undefined) return existingPotato || null;
				if (!existingPotato) return incomingPotato || null;
				return { ...existingPotato, ...incomingPotato };
			};
			const mergeLastSurvivor = (existingSurvivor, incomingSurvivor) => {
				if (incomingSurvivor === null) return null;
				if (incomingSurvivor === undefined) return existingSurvivor || null;
				if (!existingSurvivor) return incomingSurvivor || null;
				return { ...existingSurvivor, ...incomingSurvivor };
			};
			const mergeGame = (existingGame, incomingGame) => {
				if (!existingGame) return incomingGame;
				if (!incomingGame) return existingGame;
				const merged = { ...existingGame, ...incomingGame };
				const existingSession = existingGame.session || {};
				const incomingSession = incomingGame.session || {};
				merged.session = { ...existingSession, ...incomingSession };
				merged.session.participants = mergeParticipants(
					existingSession.participants || [],
					incomingSession.participants || [],
				);
				merged.session.warmup = mergeWarmup(
					existingSession.warmup,
					incomingSession.warmup,
				);
				merged.session.round = mergeRound(
					existingSession.round,
					incomingSession.round,
				);
				merged.session.tieBreak = mergeTieBreak(
					existingSession.tieBreak,
					incomingSession.tieBreak,
				);
				merged.session.card = mergeCard(
					existingSession.card,
					incomingSession.card,
				);
				merged.session.sprint = mergeSprint(
					existingSession.sprint,
					incomingSession.sprint,
				);
				merged.session.hotPotato = mergeHotPotato(
					existingSession.hotPotato,
					incomingSession.hotPotato,
				);
				merged.session.lastSurvivor = mergeLastSurvivor(
					existingSession.lastSurvivor,
					incomingSession.lastSurvivor,
				);
				if (
					Array.isArray(existingSession.roundHistory) ||
					Array.isArray(incomingSession.roundHistory)
				) {
					const existingHistory = existingSession.roundHistory || [];
					const incomingHistory = incomingSession.roundHistory || [];
					merged.session.roundHistory =
						incomingHistory.length >= existingHistory.length
							? incomingHistory
							: existingHistory;
				}
				const existingStatus = existingGame.status || existingSession.status || '';
				const incomingStatus = incomingGame.status || incomingSession.status || '';
				const existingRank = statusRank[existingStatus] ?? 0;
				const incomingRank = statusRank[incomingStatus] ?? 0;
				if (existingRank > incomingRank) {
					merged.status = existingGame.status || existingStatus;
					merged.session.status = existingSession.status || merged.session.status;
					merged.session.startedAt =
						existingSession.startedAt || merged.session.startedAt;
					merged.session.warmup =
						existingSession.warmup || merged.session.warmup;
					merged.session.round = existingSession.round || merged.session.round;
					merged.session.tieBreak =
						existingSession.tieBreak || merged.session.tieBreak;
					merged.session.card = existingSession.card || merged.session.card;
					merged.session.sprint =
						existingSession.sprint || merged.session.sprint;
					merged.session.hotPotato =
						existingSession.hotPotato || merged.session.hotPotato;
					merged.session.lastSurvivor =
						existingSession.lastSurvivor || merged.session.lastSurvivor;
				}
				if (existingGame.results && !incomingGame.results) {
					merged.results = existingGame.results;
				}
				return merged;
			};

			const scope = payload.scope;
			if (scope?.type === 'teacher') {
				const user =
					typeof window.Auth?.getCurrentUser === 'function'
						? window.Auth.getCurrentUser()
						: null;
				const isTeacher =
					typeof window.Auth?.isTeacher === 'function' && window.Auth.isTeacher();
				if (!isTeacher || !user || scope.teacherId !== user.id) {
					return;
				}
			}
			if (scope?.type === 'game') {
				const isAdmin =
					typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
				const isTeacher =
					typeof window.Auth?.isTeacher === 'function' && window.Auth.isTeacher();
				if (!isAdmin && isTeacher) {
					const teacherClassIds =
						typeof window.Auth?.getTeacherClassIds === 'function'
							? window.Auth.getTeacherClassIds()
							: [];
					const allowed =
						scope.allowAll ||
						(Array.isArray(scope.classIds)
							? scope.classIds.some((id) => teacherClassIds.includes(id))
							: false);
					if (!allowed) return;
				}
			}
			const incomingTime = payload.syncedAt
				? new Date(payload.syncedAt).getTime()
				: 0;
			const currentTime = localStorage.getItem('quizGamesSyncedAt')
				? new Date(localStorage.getItem('quizGamesSyncedAt')).getTime()
				: 0;
			if (incomingTime && currentTime && incomingTime < currentTime) {
				if (scope?.type === 'game') {
					try {
						const existingGames = JSON.parse(
							localStorage.getItem('quizGames') || '[]',
						);
						const shouldAccept = payload.quizGames.some((incoming) => {
							const current = existingGames.find((g) => g.id === incoming.id);
							if (!current) return true;
							const incomingCount =
								incoming.session?.participants?.length || 0;
							const currentCount =
								current.session?.participants?.length || 0;
							const incomingStatus =
								incoming.status || incoming.session?.status || '';
							const currentStatus =
								current.status || current.session?.status || '';
							const incomingRank = statusRank[incomingStatus] ?? 0;
							const currentRank = statusRank[currentStatus] ?? 0;
							if (incomingCount > currentCount) return true;
							if (incomingRank > currentRank) return true;
							if (
								incoming.session?.startedAt &&
								!current.session?.startedAt
							) {
								return true;
							}
							if (
								incoming.session?.warmup?.resolved &&
								!current.session?.warmup?.resolved
							) {
								return true;
							}
							return false;
						});
						if (!shouldAccept) return;
					} catch (e) {
						// accept if comparison fails
					}
				} else {
					return;
				}
			}

			if (scope?.type === 'game') {
				let mergedGames = payload.quizGames;
				try {
					const existingGames = JSON.parse(
						localStorage.getItem('quizGames') || '[]',
					);
					const existingMap = new Map(
						existingGames.map((game) => [game.id, game]),
					);
					mergedGames = payload.quizGames.map((incomingGame) =>
						mergeGame(existingMap.get(incomingGame.id), incomingGame),
					);
					existingGames.forEach((existingGame) => {
						if (!existingGame?.id) return;
						if (!mergedGames.some((g) => g.id === existingGame.id)) {
							mergedGames.push(existingGame);
						}
					});
				} catch (e) {
					mergedGames = payload.quizGames;
				}
				persistAdminGames(mergedGames, payload.syncedAt);
			} else {
				persistAdminGames(payload.quizGames, payload.syncedAt);
			}
			if (typeof window.renderGameList === 'function') {
				window.renderGameList();
			}
			if (typeof window.renderGameLobby === 'function') {
				window.renderGameLobby();
			}
			if (typeof window.renderTournamentLeaderboard === 'function') {
				window.renderTournamentLeaderboard();
			}
			if (typeof window.renderAdminGameWatch === 'function') {
				window.renderAdminGameWatch();
			}
		}
	});

	socket.on('admin:syncGamification', (payload) => {
		if (!payload || typeof payload !== 'object') return;
		try {
			if (payload.quizGamification) {
				localStorage.setItem(
					'quizGamification',
					JSON.stringify(payload.quizGamification),
				);
			}
			if (Object.prototype.hasOwnProperty.call(payload, 'quizTournamentActive')) {
				if (payload.quizTournamentActive) {
					localStorage.setItem(
						'quizTournamentActive',
						JSON.stringify(payload.quizTournamentActive),
					);
				} else {
					localStorage.removeItem('quizTournamentActive');
				}
			}
			if (Array.isArray(payload.quizTournamentsHistory)) {
				localStorage.setItem(
					'quizTournamentsHistory',
					JSON.stringify(payload.quizTournamentsHistory),
				);
			}
			if (payload.syncedAt) {
				localStorage.setItem('quizGamificationSyncedAt', payload.syncedAt);
			}
			if (typeof window.loadGamificationUI === 'function') {
				window.loadGamificationUI();
			}
		} catch (error) {
			console.error('Failed to apply synced gamification payload:', error);
		}
	});

	// Server-authoritative game state updates for admin
	socket.on('game:stateUpdate', (game) => {
		if (!game || !game.id) return;
		try {
			upsertAdminGame(game);

			// Update UI if relevant functions exist
			if (typeof window.renderGameList === 'function') {
				window.renderGameList();
			}
			if (typeof window.renderGameLobby === 'function') {
				window.renderGameLobby();
			}
			if (typeof window.renderTournamentLeaderboard === 'function') {
				window.renderTournamentLeaderboard();
			}
			if (typeof window.renderAdminGameWatch === 'function') {
				window.renderAdminGameWatch();
			}
		} catch (e) {
			console.error('[AdminClient] Failed to update local game store:', e);
		}
	});

	// Profile Requests from students
	socket.on('admin:profileRequest', (request) => {
		if (!request || !request.userId) return;
		try {
			const requestList = JSON.parse(
				localStorage.getItem('quizProfileRequests') || '[]',
			);
			const changes = { ...(request.changes || {}) };
			if (!changes.name && request.fullName) changes.name = request.fullName;
			if (!changes.username && request.username) changes.username = request.username;
			if (!changes.studentNumber && request.studentNumber) {
				changes.studentNumber = request.studentNumber;
			}
			if (!changes.classId && request.classId) changes.classId = request.classId;
			if (
				!Object.prototype.hasOwnProperty.call(changes, 'email') &&
				Object.prototype.hasOwnProperty.call(request, 'email')
			) {
				changes.email = request.email || '';
			}

			const createdAt =
				request.createdAt || request.requestedAt || new Date().toISOString();
			const normalized = {
				id: request.requestId || request.id || `${request.userId}-${createdAt}`,
				userId: request.userId,
				createdAt,
				status: 'pending',
				changes,
				avatar: request.avatar || '',
				note: request.note || '',
				currentSnapshot: request.currentSnapshot || {},
			};

			const existingIndex = requestList.findIndex(
				(item) => item && item.id === normalized.id,
			);
			if (existingIndex >= 0) {
				requestList[existingIndex] = {
					...requestList[existingIndex],
					...normalized,
				};
			} else {
				requestList.unshift(normalized);
			}
			localStorage.setItem('quizProfileRequests', JSON.stringify(requestList));
			localStorage.removeItem('adminProfileRequests');
			
			// Refresh list if function exists
			if (typeof window.renderProfileRequests === 'function') {
				window.renderProfileRequests();
			}
			if (typeof window.syncProfileRequestNotifications === 'function') {
				window.syncProfileRequestNotifications();
			}
			
			// Show toast notification
			if (typeof window.showToast === 'function') {
				const studentName =
					request.currentSnapshot?.name ||
					request.fullName ||
					request.username ||
					'Student';
				window.showToast(`New profile request from ${studentName}`, 'info');
			}
		} catch (e) {
			console.error('Error handling profile request', e);
		}
	});

	socket.on('clients:update', (list) => {
		lastClients = list || [];
		renderClients(lastClients);
	});

	function mergeAllDevices() {
		if (!lastClients || lastClients.length === 0) {
			alert('No devices to merge');
			return;
		}
		const merged = { devices: {}, mergedAt: new Date().toISOString() };
		lastClients.forEach((c) => {
			merged.devices[c.socketId] = {
				ip: c.ip,
				name: c.name,
				status: c.status,
				data: c.data,
			};
		});
		// show download prompt
		downloadJson(merged, 'merged-devices-' + Date.now() + '.json');
	}
})();

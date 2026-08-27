(function () {
	const SERVER = (
		localStorage.getItem('quizServerHost') ||
		window.QUIZ_SERVER_HOST ||
		location.origin
	).replace(/\/$/, '');
	const REALTIME_CLIENT_BUILD = '2026-02-20-card-debug-v2';
	const REALTIME_RUNTIME_KEY = '__QUIZ_REALTIME_CLIENT_RUNTIME__';
	const existingRuntime = window[REALTIME_RUNTIME_KEY];
	if (existingRuntime?.initialized && existingRuntime.socket) {
		window.clientSocket = existingRuntime.socket;
		window.REALTIME_CLIENT_BUILD = REALTIME_CLIENT_BUILD;
		return;
	}
	const socket = existingRuntime?.socket || (window.io ? window.getSocket() : null);
	if (!socket) return;
	window[REALTIME_RUNTIME_KEY] = {
		initialized: true,
		socket,
		build: REALTIME_CLIENT_BUILD,
		server: SERVER,
	};
	window.clientSocket = socket;
	window.REALTIME_CLIENT_BUILD = REALTIME_CLIENT_BUILD;
	console.log('[RealtimeClient] Build:', REALTIME_CLIENT_BUILD);

	let lastPayloadString = null;
	let lastSyncedGamesKey = null;
	let lastSyncedUsersKey = null;
	let lastSyncedGamificationKey = null;
	let receivedInitialGamesSync = false;
	let receivedInitialUsersSync = false;
	let receivedInitialGamificationSync = false;
	let initialSyncRequestTimer = null;
	let lastCardDebugLogKey = null;

	function buildSyncPayloadKey(payload, listKey) {
		if (!payload || typeof payload !== 'object') {
			return 'invalid-payload';
		}
		const scopeType = payload.scope?.type || 'global';
		const scopeTeacherId = payload.scope?.teacherId || '';
		const list = Array.isArray(payload[listKey]) ? payload[listKey] : [];
		const idSample = list
			.slice(0, 12)
			.map((item) => {
				if (!item || typeof item !== 'object') {
					return '';
				}
				return (
					item.id ||
					item.userId ||
					item.numero ||
					item.username ||
					item.name ||
					''
				);
			})
			.join('|');
		return [
			payload.syncedAt || '',
			scopeType,
			scopeTeacherId,
			list.length,
			payload.cache ? 'cache' : 'live',
			idSample,
		].join('::');
	}

	function buildGamificationPayloadKey(payload) {
		if (!payload || typeof payload !== 'object') {
			return 'invalid-gamification-payload';
		}
		const cfg = payload.quizGamification || {};
		const active = payload.quizTournamentActive || null;
		const history = Array.isArray(payload.quizTournamentsHistory)
			? payload.quizTournamentsHistory
			: [];
		return [
			payload.syncedAt || '',
			Number(cfg.expPerCorrect) || 0,
			Number(cfg.expPerWin) || 0,
			cfg.autoAwardBadges === false ? '0' : '1',
			active?.id || '',
			active?.status || '',
			history.length,
		].join('::');
	}

	function shouldSkipDuplicateSync(payload, listKey, syncType) {
		const nextKey =
			syncType === 'gamification'
				? buildGamificationPayloadKey(payload)
				: buildSyncPayloadKey(payload, listKey);
		if (syncType === 'games') {
			if (nextKey === lastSyncedGamesKey) {
				return true;
			}
			lastSyncedGamesKey = nextKey;
			return false;
		}
		if (syncType === 'users') {
			if (nextKey === lastSyncedUsersKey) {
				return true;
			}
			lastSyncedUsersKey = nextKey;
			return false;
		}
		if (syncType === 'gamification') {
			if (nextKey === lastSyncedGamificationKey) {
				return true;
			}
			lastSyncedGamificationKey = nextKey;
			return false;
		}
		return false;
	}

	function normalizeCardQuestionIdRef(value) {
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

	function normalizeCardHandArray(hand) {
		if (!Array.isArray(hand)) return [];
		const normalized = [];
		const seen = new Set();
		hand.forEach((entry) => {
			const cardId = normalizeCardQuestionIdRef(entry);
			if (!cardId) return;
			const key = cardId.toLowerCase();
			if (seen.has(key)) return;
			seen.add(key);
			normalized.push(cardId);
		});
		return normalized;
	}

	function normalizeRealtimeCardSession(session) {
		const card = session?.card;
		if (!card || typeof card !== 'object') return;
		if (card.hands && typeof card.hands === 'object') {
			Object.keys(card.hands).forEach((ownerId) => {
				card.hands[ownerId] = normalizeCardHandArray(card.hands[ownerId]);
			});
		}
		if (card.pendingCard && typeof card.pendingCard === 'object') {
			card.pendingCard.questionId = normalizeCardQuestionIdRef(
				card.pendingCard.questionId,
			);
		}
		if (card.lastResult && typeof card.lastResult === 'object') {
			card.lastResult.questionId = normalizeCardQuestionIdRef(
				card.lastResult.questionId,
			);
		}
	}

	function normalizeDebugUserKey(value) {
		return String(value || '')
			.trim()
			.toLowerCase();
	}

	function readStoredGamesSnapshot() {
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('games');
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	}

	function resolveCardDebugGame(preferredGameId = '') {
		const games = readStoredGamesSnapshot();
		let targetId = String(preferredGameId || '').trim();
		if (!targetId) {
			try {
				targetId = String(
					sessionStorage.getItem('studentActiveGameId') || '',
				).trim();
			} catch (e) {
				targetId = '';
			}
		}
		let game = targetId
			? games.find((entry) => String(entry?.id || '').trim() === targetId) ||
				null
			: null;
		if (!game) {
			game =
				games.find(
					(entry) =>
						String(entry?.type || '')
							.toLowerCase()
							.includes('card') &&
						String(entry?.status || '').toLowerCase() === 'live',
				) ||
				games.find((entry) =>
					String(entry?.type || '')
						.toLowerCase()
						.includes('card'),
				) ||
				null;
		}
		return game;
	}

	function buildCardDebugSnapshot(game) {
		if (!game) return null;
		const session = game.session || {};
		const card = session.card || {};
		const pending = card.pendingCard || null;
		const turnOrder = Array.isArray(card.turnOrder) ? card.turnOrder : [];
		const turnIndex = Number.isFinite(Number(card.turnIndex))
			? Number(card.turnIndex)
			: 0;
		const turnOwnerId = turnOrder[turnIndex] || '';
		const user =
			typeof window.Auth?.getCurrentUser === 'function'
				? window.Auth.getCurrentUser() || {}
				: {};
		const meId = String(user?.id || '').trim();
		const meIdKey = normalizeDebugUserKey(meId);
		const meNameKey = normalizeDebugUserKey(user?.name || user?.username || '');
		const participants = Array.isArray(session.participants)
			? session.participants
			: [];
		const matchedParticipant =
			participants.find((participant) => {
				const participantIdKey = normalizeDebugUserKey(participant?.userId);
				if (meIdKey && participantIdKey && participantIdKey === meIdKey) {
					return true;
				}
				const participantNameKey = normalizeDebugUserKey(
					participant?.name || participant?.username || '',
				);
				return Boolean(
					meNameKey && participantNameKey && meNameKey === participantNameKey,
				);
			}) || null;
		const effectiveMeId = String(
			matchedParticipant?.userId || meId || '',
		).trim();
		const effectiveMeKey = normalizeDebugUserKey(effectiveMeId);
		const pendingQuestionId = normalizeCardQuestionIdRef(pending?.questionId);
		const questionMatch = Array.isArray(game.questions)
			? game.questions.find(
					(question) =>
						normalizeCardQuestionIdRef(question?.id) === pendingQuestionId,
				) || null
			: null;
		const hands =
			card.hands && typeof card.hands === 'object' ? card.hands : {};
		const handSizes = {};
		Object.keys(hands).forEach((ownerId) => {
			handSizes[ownerId] = Array.isArray(hands[ownerId])
				? hands[ownerId].length
				: 0;
		});
		const findHandSizeByUserId = (candidateUserId) => {
			const candidateKey = normalizeDebugUserKey(candidateUserId);
			if (!candidateKey) return 0;
			const direct = handSizes[candidateUserId];
			if (Number.isFinite(Number(direct))) return Number(direct);
			const mappedKey = Object.keys(handSizes).find(
				(ownerId) => normalizeDebugUserKey(ownerId) === candidateKey,
			);
			return mappedKey ? Number(handSizes[mappedKey] || 0) : 0;
		};
		const pendingOwnerKey = normalizeDebugUserKey(pending?.ownerId);
		const pendingTargetKey = normalizeDebugUserKey(pending?.targetId);
		const turnOwnerKey = normalizeDebugUserKey(turnOwnerId);

		return {
			gameId: String(game.id || ''),
			gameType: String(game.type || ''),
			status: String(game.status || ''),
			me: {
				id: meId,
				name: String(user?.name || ''),
				username: String(user?.username || ''),
				matchedParticipantId: String(matchedParticipant?.userId || ''),
				effectiveId: effectiveMeId,
			},
			card: {
				turnIndex,
				turnOwnerId: String(turnOwnerId || ''),
				turnStartedAt: card.turnStartedAt || null,
				pendingCard: pending
					? {
							ownerId: String(pending.ownerId || ''),
							targetId: String(pending.targetId || ''),
							questionId: String(pendingQuestionId || ''),
							startedAt: pending.startedAt || null,
							timeLimitMs:
								Number.isFinite(Number(pending.timeLimitMs)) &&
								Number(pending.timeLimitMs) > 0
									? Number(pending.timeLimitMs)
									: null,
						}
					: null,
				isTurnOwner: Boolean(
					effectiveMeKey && turnOwnerKey && effectiveMeKey === turnOwnerKey,
				),
				isPendingOwner: Boolean(
					effectiveMeKey &&
					pendingOwnerKey &&
					effectiveMeKey === pendingOwnerKey,
				),
				isPendingTarget: Boolean(
					effectiveMeKey &&
					pendingTargetKey &&
					effectiveMeKey === pendingTargetKey,
				),
				meHandCount: findHandSizeByUserId(effectiveMeId || meId),
				turnOwnerHandCount: findHandSizeByUserId(turnOwnerId),
				handSizes,
			},
			questionLookup: {
				pendingQuestionId: String(pendingQuestionId || ''),
				found: Boolean(questionMatch),
				questionId: String(questionMatch?.id || ''),
				promptPreview: String(
					questionMatch?.text || questionMatch?.question || '',
				).slice(0, 120),
			},
			participants: participants.map((participant) => ({
				id: String(participant?.userId || ''),
				name: String(participant?.name || ''),
			})),
		};
	}

	function logCardDebugSnapshot(trigger = 'manual', preferredGameId = '') {
		try {
			const game = resolveCardDebugGame(preferredGameId);
			if (!game) return;
			if (
				!String(game.type || '')
					.toLowerCase()
					.includes('card')
			)
				return;
			const snapshot = buildCardDebugSnapshot(game);
			if (!snapshot) return;
			const card = snapshot.card || {};
			const pendingCard = card.pendingCard || {};
			const logKey = [
				trigger,
				snapshot.gameId || '',
				snapshot.status || '',
				card.turnIndex ?? '',
				card.turnOwnerId || '',
				card.turnStartedAt || '',
				pendingCard.ownerId || '',
				pendingCard.targetId || '',
				pendingCard.questionId || '',
				pendingCard.startedAt || '',
				snapshot.questionLookup?.found ? '1' : '0',
			].join('|');
			if (logKey === lastCardDebugLogKey) return;
			lastCardDebugLogKey = logKey;
			const pending = snapshot.card?.pendingCard || {};
			console.log(
				`[CardDebugSummary][${trigger}] game=${snapshot.gameId} status=${snapshot.status} me=${snapshot.me?.effectiveId || ''} isTurnOwner=${snapshot.card?.isTurnOwner ? '1' : '0'} isPendingTarget=${snapshot.card?.isPendingTarget ? '1' : '0'} meHand=${snapshot.card?.meHandCount ?? 0} turnOwner=${snapshot.card?.turnOwnerId || ''} turnOwnerHand=${snapshot.card?.turnOwnerHandCount ?? 0} pendingOwner=${pending.ownerId || ''} pendingTarget=${pending.targetId || ''} pendingQ=${pending.questionId || ''} qFound=${snapshot.questionLookup?.found ? '1' : '0'} turnStartedAt=${snapshot.card?.turnStartedAt || ''} pendingStartedAt=${pending.startedAt || ''}`,
			);
			console.log(`[CardDebug][${trigger}]`, snapshot);
		} catch (error) {
			console.warn('[CardDebug] Failed to build snapshot', error);
		}
	}

	window.logCardDebugSnapshot = logCardDebugSnapshot;

	function sendLocalStorageUpdate(force = false) {
		try {
			const payload = collectLocalStorage();
			const payloadString = JSON.stringify(payload);
			if (!force && payloadString === lastPayloadString) {
				return;
			}
			lastPayloadString = payloadString;
			socket.emit('localStorageUpdate', payload);
		} catch (e) {
			// If serialization fails, fall back to a direct emit
			socket.emit('localStorageUpdate', collectLocalStorage());
		}
	}

	socket.on('connect', () => {
		receivedInitialGamesSync = false;
		receivedInitialUsersSync = false;
		receivedInitialGamificationSync = false;
		if (initialSyncRequestTimer) {
			clearTimeout(initialSyncRequestTimer);
		}
		socket.emit('identify', { role: 'client' });
		initialSyncRequestTimer = setTimeout(() => {
			if (!receivedInitialGamesSync) {
				socket.emit('client:requestGames');
			}
			if (!receivedInitialUsersSync) {
				socket.emit('client:requestUsers');
			}
			if (!receivedInitialGamificationSync) {
				socket.emit('client:requestGamification');
			}
		}, 250);

		const deviceId =
			localStorage.getItem('deviceId') ||
			'device-' + Math.random().toString(36).slice(2, 10);
		localStorage.setItem('deviceId', deviceId);
		if (!localStorage.getItem('quizServerHost')) {
			localStorage.setItem('quizServerHost', SERVER);
		}

		const payload = {
			deviceId,
			name: navigator.userAgent || 'browser',
			localStorage: collectLocalStorage(),
		};
		socket.emit('register', payload);
		// Reset cache after initial register to avoid skipping next update
		lastPayloadString = null;
	});

	socket.on('disconnect', (reason) => {
		console.warn('[RealtimeClient] Socket disconnected:', reason || 'unknown');
	});

	socket.on('requestLocalStorage', () => {
		sendLocalStorageUpdate(true);
	});

	// Receive exam/training session from admin
	socket.on('session:receive', (sessionPackage) => {
		try {
			console.log('Received session:', sessionPackage.examName);
			console.log('Session package:', sessionPackage);

			// Validate session package
			if (!sessionPackage || typeof sessionPackage !== 'object') {
				console.error('Invalid session package received:', sessionPackage);
				return;
			}

			// Check if we already have this exact session to prevent reload loop
			const existingSession = localStorage.getItem('examActiveSession');
			if (existingSession) {
				try {
					const existing = JSON.parse(existingSession);
					// If same exam ID and timestamp, skip to prevent infinite loop
					if (
						existing.examId === sessionPackage.examId &&
						existing.pushedAt === sessionPackage.pushedAt
					) {
						console.log(
							'Session already received (same examId and pushedAt), skipping reload',
						);
						return;
					}
				} catch (e) {
					// If parsing fails, continue with saving new session
				}
			}

			// Store in examActiveSession
			const serialized = JSON.stringify(sessionPackage);
			console.log(
				'Attempting to save to localStorage, size:',
				serialized.length,
			);
			localStorage.setItem('examActiveSession', serialized);

			// Verify it was saved immediately
			const saved = localStorage.getItem('examActiveSession');
			if (saved) {
				console.log('✓ Session successfully saved to localStorage');
				console.log('Saved data length:', saved.length);
				console.log('Saved examName:', JSON.parse(saved).examName);
			} else {
				console.error(
					'✗ Failed to save session to localStorage - getItem returned null',
				);
			}

			// Show notification to user
			showSessionNotification(sessionPackage);

			// Reload page if on quiz interface to pick up new session
			if (
				window.location.pathname.includes('index.html') ||
				window.location.pathname === '/'
			) {
				console.log('Reloading page in 1.5 seconds to load exam...');
				setTimeout(() => {
					window.location.reload();
				}, 1500);
			}
		} catch (error) {
			console.error('Error handling session:receive:', error);
			console.error('Error stack:', error.stack);
		}
	});

	// Clear session from admin - clear all quiz-related keys
	socket.on('session:clear', () => {
		console.log('Session cleared by admin');
		localStorage.removeItem('examActiveSession');
		localStorage.removeItem('quizSettings');
		localStorage.removeItem('quizQuestions');
		// Reload page to reset UI
		if (
			window.location.pathname.includes('index.html') ||
			window.location.pathname === '/'
		) {
			setTimeout(() => window.location.reload(), 500);
		}
	});

	// Stop only the active exam/training session from admin
	socket.on('session:stop', () => {
		console.log('Exam session stopped by admin');
		localStorage.removeItem('examActiveSession');
		// Reload page if on quiz interface
		if (
			window.location.pathname.includes('index.html') ||
			window.location.pathname === '/'
		) {
			setTimeout(() => window.location.reload(), 500);
		}
	});

	// Receive pushed settings from admin
	socket.on('admin:pushSettings', (payload) => {
		console.log('Received pushed settings:', payload);
		if (payload.quizSettings) {
			localStorage.setItem(
				'quizSettings',
				JSON.stringify(payload.quizSettings),
			);
		}
		if (payload.quizQuestions) {
			localStorage.setItem(
				'quizQuestions',
				JSON.stringify(payload.quizQuestions),
			);
		}
		if (payload.quizUsers) {
			applySyncedUsersPayload(payload.quizUsers);
		}
		if (payload.quizSettings || payload.quizQuestions) {
			showSessionNotification({
				mode: 'training',
				examName: 'Default Settings Updated',
			});
		}

		// Reload to apply settings if on quiz interface
		if (
			window.location.pathname.includes('index.html') ||
			window.location.pathname === '/'
		) {
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		}
	});

	// Receive synced questions from admin
	socket.on('admin:syncQuestions', (payload) => {
		console.log('Received synced questions:', payload);
		if (payload.quizQuestions) {
			localStorage.setItem(
				'quizQuestions',
				JSON.stringify(payload.quizQuestions),
			);
			showSessionNotification({
				mode: 'training',
				examName: `${payload.quizQuestions.length} Questions Synced`,
			});
		}
	});

	// Receive synced games from admin
	socket.on('admin:syncGames', (payload) => {
		receivedInitialGamesSync = true;
		if (shouldSkipDuplicateSync(payload, 'quizGames', 'games')) {
			return;
		}
		console.log('Received synced games:', payload);
		if (payload.quizGames) {
			const scope = payload.scope;
			const statusRank = { draft: 0, open: 1, live: 2, completed: 3 };
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
					String(incomingWarmup.question || '') !==
						String(existingWarmup.question || '') ||
					Number(incomingWarmup.round || 0) !==
						Number(existingWarmup.round || 0) ||
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
				if (!existingRound) {
					const normalizedRound = incomingRound ? { ...incomingRound } : null;
					if (normalizedRound) {
						normalizedRound.questionId = normalizeCardQuestionIdRef(
							normalizedRound.questionId,
						);
					}
					return normalizedRound;
				}
				const merged = { ...existingRound, ...incomingRound };
				const incomingQuestionId = normalizeCardQuestionIdRef(
					incomingRound.questionId,
				);
				const existingQuestionId = normalizeCardQuestionIdRef(
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
				if (!existingTie) {
					const normalizedTie = incomingTie ? { ...incomingTie } : null;
					if (normalizedTie) {
						normalizedTie.questionId = normalizeCardQuestionIdRef(
							normalizedTie.questionId,
						);
					}
					return normalizedTie;
				}
				const merged = { ...existingTie, ...incomingTie };
				const incomingQuestionId = normalizeCardQuestionIdRef(
					incomingTie.questionId,
				);
				const existingQuestionId = normalizeCardQuestionIdRef(
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
				merged.resolved = Boolean(existingTie.resolved || incomingTie.resolved);
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
					normalizeRealtimeCardSession({ card: clonedIncoming });
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
						const existingHand = existingHands[userId];
						handMap[userId] = normalizeCardHandArray(existingHand);
					});
					merged.hands = handMap;
				} else {
					const handMap = {};
					Object.keys(existingHands).forEach((userId) => {
						handMap[userId] = normalizeCardHandArray(existingHands[userId]);
					});
					merged.hands = handMap;
				}
				merged.turnOrder = Array.isArray(incomingCard.turnOrder)
					? incomingCard.turnOrder.slice()
					: Array.isArray(existingCard.turnOrder)
						? existingCard.turnOrder.slice()
						: [];
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
					merged.pendingCard.questionId = normalizeCardQuestionIdRef(
						merged.pendingCard.questionId,
					);
				}
				if (Object.prototype.hasOwnProperty.call(incomingCard, 'lastResult')) {
					merged.lastResult = incomingCard.lastResult || null;
				} else {
					merged.lastResult = existingCard.lastResult || null;
				}
				if (merged.lastResult && typeof merged.lastResult === 'object') {
					merged.lastResult.questionId = normalizeCardQuestionIdRef(
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
				const existingStatus =
					existingGame.status || existingSession.status || '';
				const incomingStatus =
					incomingGame.status || incomingSession.status || '';
				const preserveAuthoritativeLiveSession =
					scope?.type === 'game' &&
					String(existingStatus || '').toLowerCase() === 'live' &&
					String(incomingStatus || '').toLowerCase() === 'live';
				if (preserveAuthoritativeLiveSession) {
					merged.status = existingGame.status || merged.status;
					merged.session.status =
						existingSession.status || merged.session.status;
					merged.session.startedAt =
						existingSession.startedAt || merged.session.startedAt;
					merged.session.participants =
						Array.isArray(existingSession.participants) &&
						existingSession.participants.length
							? existingSession.participants
							: merged.session.participants;
					merged.session.round = existingSession.round || merged.session.round;
					merged.session.card = existingSession.card || merged.session.card;
					merged.session.warmup =
						existingSession.warmup || merged.session.warmup;
					merged.session.tieBreak =
						existingSession.tieBreak || merged.session.tieBreak;
					if (existingGame.results && !incomingGame.results) {
						merged.results = existingGame.results;
					}
					return merged;
				}
				const existingRank = statusRank[existingStatus] ?? 0;
				const incomingRank = statusRank[incomingStatus] ?? 0;
				if (existingRank > incomingRank) {
					merged.status = existingGame.status || existingStatus;
					merged.session.status =
						existingSession.status || merged.session.status;
					merged.session.startedAt =
						existingSession.startedAt || merged.session.startedAt;
					merged.session.round = existingSession.round || merged.session.round;
					merged.session.card = existingSession.card || merged.session.card;
					merged.session.warmup =
						existingSession.warmup || merged.session.warmup;
					merged.session.tieBreak =
						existingSession.tieBreak || merged.session.tieBreak;
				}
				if (existingGame.results && !incomingGame.results) {
					merged.results = existingGame.results;
				}
				return merged;
			};
			const resolveStudentClassId = (user) => {
				if (!user) return '';
				let classId = user.classId || '';
				if (classId) return classId;
				const identity =
					typeof window.Auth?.getStudentIdentity === 'function'
						? window.Auth.getStudentIdentity(user)
						: null;
				if (identity?.classId) return identity.classId;
				if (identity?.class) {
					try {
						const classes = JSON.parse(
							JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')) || '[]',
						);
						const match = classes.find((c) => c.name === identity.class);
						if (match?.id) return match.id;
					} catch (e) {}
				}
				return '';
			};
			if (scope?.type === 'teacher') {
				const user =
					typeof window.Auth?.getCurrentUser === 'function'
						? window.Auth.getCurrentUser()
						: null;
				const isAdmin =
					typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
				const isTeacher =
					typeof window.Auth?.isTeacher === 'function' &&
					window.Auth.isTeacher();
				if (isAdmin) {
					return;
				}
				if (isTeacher) {
					if (!user || scope.teacherId !== user.id) return;
				} else {
					const classId = resolveStudentClassId(user);
					const allowed =
						scope.allowAll ||
						(Array.isArray(scope.classIds)
							? scope.classIds.includes(classId)
							: false);
					if (!allowed) return;
				}
			}
			if (scope?.type === 'game') {
				const user =
					typeof window.Auth?.getCurrentUser === 'function'
						? window.Auth.getCurrentUser()
						: null;
				const isAdmin =
					typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
				if (isAdmin) {
					// admins accept all game updates
				} else {
					const isTeacher =
						typeof window.Auth?.isTeacher === 'function' &&
						window.Auth.isTeacher();
					if (isTeacher) {
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
					} else {
						const classId = resolveStudentClassId(user);
						const allowed =
							scope.allowAll ||
							(Array.isArray(scope.classIds)
								? scope.classIds.includes(classId)
								: false);
						if (!allowed) return;
					}
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
							JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('games')) || '[]',
						);
						const statusRank = {
							draft: 0,
							open: 1,
							live: 2,
							completed: 3,
						};
						const shouldAccept = payload.quizGames.some((incoming) => {
							const current = existingGames.find(
								(g) => String(g?.id || '') === String(incoming?.id || ''),
							);
							if (!current) return true;
							const incomingCount = incoming.session?.participants?.length || 0;
							const currentCount = current.session?.participants?.length || 0;
							const incomingStatus =
								incoming.status || incoming.session?.status || '';
							const currentStatus =
								current.status || current.session?.status || '';
							const incomingRank = statusRank[incomingStatus] ?? 0;
							const currentRank = statusRank[currentStatus] ?? 0;
							if (incomingCount > currentCount) return true;
							if (incomingRank > currentRank) return true;
							if (incoming.session?.startedAt && !current.session?.startedAt) {
								return true;
							}
							if (
								incoming.session?.warmup?.resolved &&
								!current.session?.warmup?.resolved
							) {
								return true;
							}
							// CHECK: Warmup state changes even if not resolved
							const incomingWarmup = incoming.session?.warmup;
							const currentWarmup = current.session?.warmup;
							if (incomingWarmup && currentWarmup) {
								// New answers submitted
								const incomingAnswerCount = (incomingWarmup.answers || [])
									.length;
								const currentAnswerCount = (currentWarmup.answers || []).length;
								if (incomingAnswerCount > currentAnswerCount) return true;

								// Attempts counter changed
								if (
									(incomingWarmup.attempts || 0) !==
									(currentWarmup.attempts || 0)
								) {
									return true;
								}

								// Challenge reset (new question or round)
								if (
									String(incomingWarmup.question || '') !==
										String(currentWarmup.question || '') ||
									Number(incomingWarmup.round || 0) !==
										Number(currentWarmup.round || 0)
								) {
									return true;
								}

								// Winner assigned
								if (!currentWarmup.winnerId && incomingWarmup.winnerId) {
									return true;
								}
							}
							return false;
						});
						if (!shouldAccept) return;
					} catch (e) {
						// If comparison fails, accept update to avoid stale lock
					}
				} else {
					return;
				}
			}
			// The two branches below were identical (the `scope?.type === 'game'`
			// and the `else` branch did the same union-merge). The union-merge
			// was the source of the orphan-games bug: any game missing from the
			// server payload stayed in localStorage forever. Now we replace the
			// local cache when the payload is authoritative (scope is missing
			// or carry-allowAll), and only union-merge for partial scopes that
			// intentionally carry a classIds filter.
			const isAuthoritativeScope =
				!scope ||
				scope?.allowAll === true ||
				(scope?.type === 'game' && scope?.allowAll === true);
			let finalGames = Array.isArray(payload.quizGames) ? payload.quizGames : [];
			if (!isAuthoritativeScope) {
				try {
					const existingGames = JSON.parse(
						JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('games')) || '[]',
					);
					const existingMap = new Map(
						existingGames.map((game) => [String(game?.id || ''), game]),
					);
					const merged = payload.quizGames.map((incomingGame) =>
						mergeGame(
							existingMap.get(String(incomingGame?.id || '')),
							incomingGame,
						),
					);
					existingGames.forEach((existingGame) => {
						if (!existingGame?.id) return;
						if (
							!merged.some(
								(g) => String(g?.id || '') === String(existingGame?.id || ''),
							)
						) {
							merged.push(existingGame);
						}
					});
					finalGames = merged;
				} catch (e) {
					finalGames = payload.quizGames;
				}
			}
			const normalizedFinalGames = finalGames.map((entry) => {
				const normalized = window.GameCore?.normalizeGame
					? window.GameCore.normalizeGame(entry)
					: entry;
				if (normalized?.session) {
					normalizeRealtimeCardSession(normalized.session);
				}
				return normalized;
			});
			localStorage.setItem(
				'quizGames',
				JSON.stringify(normalizedFinalGames),
			);
			// Mark the wall-clock time of the last realtime write so the
			// bootstrap reconciliation in legacy-bridge.js can back off if
			// the realtime sync is fresher than the DB snapshot. The
			// value is consumed by reconcileGamesFromBootstrap.
			try {
				localStorage.setItem(
					'quizGamesLastRealtimeAt',
					String(Date.now()),
				);
			} catch (_) {}
			if (payload.syncedAt) {
				localStorage.setItem('quizGamesSyncedAt', payload.syncedAt);
			}
			logCardDebugSnapshot('admin:syncGames');
			window.dispatchEvent(new CustomEvent('quiz:games-updated'));
		}
	});

	// Server tells us a single game was deleted (admin-initiated). Drop it
	// from the local cache so it stops showing as an orphan in the Games tab.
	socket.on('game:deleted', ({ gameId } = {}) => {
		if (!gameId) return;
		const targetId = String(gameId);
		try {
			if (window.GameCore?.getQuizGames && window.GameCore?.saveQuizGames) {
				const existing = window.GameCore.getQuizGames() || [];
				const filtered = existing.filter(
					(g) => String(g?.id || '') !== targetId,
				);
				if (filtered.length !== existing.length) {
					window.GameCore.saveQuizGames(filtered);
				}
			} else if (window.__DI_CONTAINER__?.repo) {
				const existing =
					window.__DI_CONTAINER__.repo.getAll_sync('games') || [];
				const filtered = existing.filter(
					(g) => String(g?.id || '') !== targetId,
				);
				if (filtered.length !== existing.length) {
					window.__DI_CONTAINER__.repo.setAll_sync('games', filtered);
				}
			}
			const raw = localStorage.getItem('quizGames');
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed)) {
						const filtered = parsed.filter(
							(g) => String(g?.id || '') !== targetId,
						);
						if (filtered.length !== parsed.length) {
							localStorage.setItem('quizGames', JSON.stringify(filtered));
						}
					}
				} catch (_) {}
			}
		} catch (err) {
			console.warn('[realtime-client] game:deleted handler failed', err);
		}
		window.dispatchEvent(new CustomEvent('quiz:games-updated'));
	});

	// Server tells us every game was wiped (admin-initiated deleteAll).
	// Wipe the local cache so the union-merge in admin:syncGames doesn't
	// resurrect orphans from a still-stale local copy.
	socket.on('game:deletedAll', () => {
		try {
			if (window.GameCore?.saveQuizGames) {
				window.GameCore.saveQuizGames([]);
			} else if (window.__DI_CONTAINER__?.repo) {
				window.__DI_CONTAINER__.repo.setAll_sync('games', []);
			}
			localStorage.setItem('quizGames', JSON.stringify([]));
		} catch (err) {
			console.warn('[realtime-client] game:deletedAll handler failed', err);
		}
		window.dispatchEvent(new CustomEvent('quiz:games-updated'));
	});

	// Server-authoritative game state updates
	socket.on('game:stateUpdate', (game) => {
		if (!game || !game.id) return;
		try {
			const gameId = String(game.id || '');
			const normalizedGame = window.GameCore?.normalizeGame
				? window.GameCore.normalizeGame(game)
				: game;
			if (normalizedGame?.session) {
				normalizeRealtimeCardSession(normalizedGame.session);
			}

			let updateSuccess = false;

			// Primary: Update GameCore cache
			if (window.GameCore?.getQuizGames && window.GameCore?.saveQuizGames) {
				try {
					const existingGames = window.GameCore.getQuizGames();
					const index = existingGames.findIndex(
						(g) => String(g?.id || '') === gameId,
					);
					if (index >= 0) {
						existingGames[index] = { ...normalizedGame, id: gameId };
					} else {
						existingGames.push({ ...normalizedGame, id: gameId });
					}
					window.GameCore.saveQuizGames(existingGames);
					updateSuccess = true;
				} catch (cacheErr) {
					console.warn(
						'[GameClient] GameCore cache update failed, falling back:',
						cacheErr,
					);
					updateSuccess = false;
				}
			}

			// Fallback: Always sync to localStorage to maintain consistency
			try {
				const existingGames = JSON.parse(
					JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('games')) || '[]',
				);
				const index = existingGames.findIndex(
					(g) => String(g?.id || '') === gameId,
				);
				if (index >= 0) {
					existingGames[index] = { ...normalizedGame, id: gameId };
				} else {
					existingGames.push({ ...normalizedGame, id: gameId });
				}

				// Deduplicate and save
				const dedupedGames = [];
				const seenGameIds = new Set();
				existingGames.forEach((entry) => {
					const id = String(entry?.id || '');
					if (!id || seenGameIds.has(id)) return;
					seenGameIds.add(id);
					dedupedGames.push(entry);
				});
				window.__DI_CONTAINER__.repo.setAll_sync('games', dedupedGames);

				// If GameCore update failed, also update GameCore from localStorage
				if (!updateSuccess && window.GameCore?.saveQuizGames) {
					try {
						window.GameCore.saveQuizGames(dedupedGames);
						updateSuccess = true;
					} catch (recoveryErr) {
						console.warn('[GameClient] GameCore recovery failed:', recoveryErr);
					}
				}
			} catch (lsErr) {
				console.error('[GameClient] localStorage sync failed:', lsErr);
			}

			localStorage.setItem('quizGamesSyncedAt', new Date().toISOString());
		} catch (e) {
			console.error('[GameClient] Failed to update local game store:', e);
		}

		logCardDebugSnapshot('game:stateUpdate', game.id);
		window.dispatchEvent(new CustomEvent('quiz:games-updated'));
	});

	// Server-side question lock — immediate feedback to all clients
	socket.on('game:questionLocked', (data) => {
		if (!data) return;
		console.log(
			'[GameClient] Question locked in round',
			data.roundIndex,
			'winner:',
			data.winnerId,
		);
		// The stateUpdate will follow shortly — this is for instant visual feedback
		window.dispatchEvent(
			new CustomEvent('quiz:question-locked', { detail: data }),
		);
	});

	// Warm-up resolved — immediate notification before full state update
	socket.on('game:warmupResolved', (data) => {
		if (!data) return;
		console.log('[GameClient] Warm-up resolved! Winner:', data.winnerId);
		// Immediate UI feedback that warmup is over
		window.dispatchEvent(
			new CustomEvent('quiz:warmup-resolved', { detail: data }),
		);
	});

	// Receive synced user accounts from admin
	socket.on('admin:syncUsers', (payload) => {
		receivedInitialUsersSync = true;
		if (shouldSkipDuplicateSync(payload, 'quizUsers', 'users')) {
			return;
		}
		console.log('Received synced users:', payload);
		if (payload.quizUsers) {
			if (payload.syncedAt) {
				localStorage.setItem('quizUsersSyncedAt', payload.syncedAt);
			}
			applySyncedUsersPayload(payload.quizUsers, {
				silent: payload.source === 'student',
			});
		}
	});

	socket.on('admin:syncGamification', (payload) => {
		receivedInitialGamificationSync = true;
		if (
			shouldSkipDuplicateSync(payload, 'quizTournamentsHistory', 'gamification')
		) {
			return;
		}
		try {
			if (payload.quizGamification) {
				localStorage.setItem(
					'quizGamification',
					JSON.stringify(payload.quizGamification),
				);
			}
			if (
				Object.prototype.hasOwnProperty.call(payload, 'quizTournamentActive')
			) {
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
			window.dispatchEvent(new CustomEvent('quiz:gamification-updated'));
		} catch (error) {
			console.error('Failed to apply synced gamification payload:', error);
		}
	});

	socket.on('adminCommand', (cmd) => {
		console.log('adminCommand', cmd);
		if (cmd === 'forceSync') {
			sendLocalStorageUpdate(true);
		}
	});

	/**
	 * Collect localStorage data - now sends ONLY results, not full questions
	 */
	function collectLocalStorage() {
		const out = {};

		// Get device identification
		out.deviceId = localStorage.getItem('deviceId');

		// Get active session results (if any)
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || '{}',
			);
			if (activeSession.examId) {
				out.examActiveSession = {
					examId: activeSession.examId,
					examName: activeSession.examName,
					mode: activeSession.mode,
					studentInfo: activeSession.studentInfo,
					results: activeSession.results,
					completedResults: activeSession.completedResults, // Send cumulative results
					startedAt: activeSession.startedAt,
					completedAt: activeSession.completedAt,
				};
			}
		} catch (e) {}

		// Get completed quiz results
		try {
			const results = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results'));
			if (results) out.quizResults = JSON.parse(results);
		} catch (e) {}

		// Get quiz activity
		try {
			const activity = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('audit_logs'));
			if (activity) out.quizActivity = JSON.parse(activity);
		} catch (e) {}

		return out;
	}

	function applySyncedUsersPayload(users, options = {}) {
		try {
			const incoming = Array.isArray(users) ? users : [];
			let existing = [];
			try {
				const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
				existing = Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				existing = [];
			}

			const adminUsers = existing.filter(
				(user) => String(user?.role || '').toLowerCase() === 'admin',
			);
			const merged = [...adminUsers];
			const seen = new Set(adminUsers.map((user) => String(user?.id || '')));
			incoming.forEach((user) => {
				const id = String(user?.id || '').trim();
				if (!id) return;
				if (seen.has(id)) return;
				seen.add(id);
				merged.push(user);
			});

			window.__DI_CONTAINER__.repo.setAll_sync('users', merged);
			if (typeof window.checkStudentAuthState === 'function') {
				window.checkStudentAuthState();
			}
			if (!options.silent && typeof window.showToast === 'function') {
				window.showToast('User accounts synced', 'success');
			}
		} catch (e) {
			console.error('Failed to apply synced users:', e);
		}
	}

	/**
	 * Show notification for new session
	 */
	function showSessionNotification(session) {
		// Create floating notification
		const notification = document.createElement('div');
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: linear-gradient(135deg, #10b981 0%, #059669 100%);
			color: white;
			padding: 16px 24px;
			border-radius: 12px;
			box-shadow: 0 10px 40px rgba(0,0,0,0.2);
			z-index: 10000;
			font-family: system-ui, -apple-system, sans-serif;
			animation: slideIn 0.3s ease-out;
		`;
		notification.innerHTML = `
			<div style="font-weight: 600; margin-bottom: 4px;">📚 New ${session.mode === 'exam' ? 'Exam' : 'Training'} Available</div>
			<div style="opacity: 0.9; font-size: 14px;">${session.examName}</div>
		`;

		// Add animation style
		const style = document.createElement('style');
		style.textContent = `
			@keyframes slideIn {
				from { transform: translateX(100%); opacity: 0; }
				to { transform: translateX(0); opacity: 1; }
			}
		`;
		document.head.appendChild(style);
		document.body.appendChild(notification);

		// Auto-remove after 5 seconds
		setTimeout(() => {
			notification.style.animation = 'slideIn 0.3s ease-out reverse';
			setTimeout(() => notification.remove(), 300);
		}, 5000);
	}

	// heartbeat + periodic sync (send only results, not full data)
	setInterval(() => {
		try {
			socket.emit('heartbeat');
			sendLocalStorageUpdate();
		} catch (e) {}
	}, 5000);
})();

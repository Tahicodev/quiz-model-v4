const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { initGameServer } = require('./game-server');

const app = express();
const port = process.env.PORT || 3000;
const configuredAdminSecret = String(process.env.QUIZ_ADMIN_SECRET || '').trim();
const adminSecret =
	configuredAdminSecret || crypto.randomBytes(24).toString('base64url');
const corsOrigins = String(process.env.QUIZ_CORS_ORIGIN || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

if (!configuredAdminSecret) {
	console.log(
		`QUIZ_ADMIN_SECRET was not set. Temporary Admin Secret for this server run: ${adminSecret}`,
	);
}

app.use((req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'SAMEORIGIN');
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.setHeader(
		'Content-Security-Policy',
		"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http: https: ws: wss:;",
	);
	next();
});

app.use((req, res, next) => {
	const normalizedPath = decodeURIComponent(req.path || '').replace(/\\/g, '/');
	const blocked = [
		/^\/\.git(?:\/|$)/i,
		/^\/node_modules(?:\/|$)/i,
		/^\/(?:server|game-server|start-server)\.js$/i,
		/^\/package(?:-lock)?\.json$/i,
		/^\/Security\.md$/i,
		/^\/\.env/i,
	].some((pattern) => pattern.test(normalizedPath));
	if (blocked) return res.status(404).send('Not found');
	next();
});

app.use(express.static(process.cwd()));

const server = http.createServer(app);
const io = new Server(server, {
	cors: { origin: corsOrigins.length ? corsOrigins : true },
});

function isAdminSocket(socket) {
	return socket?.role === 'admin' && socket.adminAuthenticated === true;
}

function requireAdminSocket(socket, eventName) {
	if (isAdminSocket(socket)) return true;
	socket.emit('admin:auth:error', {
		event: eventName,
		message: 'Admin Secret is required for this realtime action.',
	});
	return false;
}

function sanitizeUsersForSync(payload = {}) {
	const cleanUsers = Array.isArray(payload.quizUsers)
		? payload.quizUsers.map((user) => {
				const { passwordHash, password, ...safeUser } = user || {};
				return safeUser;
			})
		: [];
	return { ...payload, quizUsers: cleanUsers };
}

// Initialize server-authoritative game engine
initGameServer(io);

// In-memory client registry
const clients = {}; // socketId -> { socketId, ip, deviceId, name, lastSeen, status, data }
let lastPushedSession = null; // Store the last pushed exam/training session
let lastSyncedUsers = null; // Store the last synced user accounts (admin scope)
let lastSyncedGamesGlobal = null; // Store the last synced games from admin
let lastSyncedGamesByTeacher = {}; // teacherId -> payload
let lastSyncedGamification = null; // Store gamification + tournament state
let lastSyncedUsersFingerprint = '';
let lastSyncedUsersBroadcastAt = 0;
const USERS_SYNC_DUPLICATE_WINDOW_MS = 5000;

function buildUsersFingerprint(users = []) {
	return (Array.isArray(users) ? users : [])
		.map((user) =>
			[
				String(user?.id || '').trim(),
				String(user?.updatedAt || '').trim(),
				String(user?.status || '').trim(),
				String(user?.role || '').trim(),
			].join(':'),
		)
		.filter(Boolean)
		.sort()
		.join('|');
}

io.on('connection', (socket) => {
	const ip = socket.handshake.address || socket.conn.remoteAddress || 'unknown';
	console.log('socket connected', socket.id, ip);

	socket.on('identify', (payload = {}) => {
		const requestedRole = payload.role || 'client';
		if (requestedRole === 'admin') {
			const providedSecret = String(
				payload.adminSecret || payload.secret || '',
			).trim();
			if (!providedSecret || providedSecret !== adminSecret) {
				socket.role = 'unauthorized';
				socket.adminAuthenticated = false;
				socket.emit('admin:auth:error', {
					message: 'Invalid or missing Admin Secret.',
				});
				return;
			}
			socket.role = 'admin';
			socket.adminAuthenticated = true;
		} else {
			socket.role = requestedRole;
			socket.adminAuthenticated = false;
		}
		if (socket.role === 'admin') {
			socket.emit('clients:update', Object.values(clients));
			if (lastSyncedGamification) {
				socket.emit('admin:syncGamification', lastSyncedGamification);
			}
		} else if (socket.role === 'client' && lastPushedSession) {
			// Send the last pushed session to newly connected clients
			console.log(
				'Sending stored session to new client:',
				socket.id,
				'- Session:',
				lastPushedSession.examName,
			);
			socket.emit('session:receive', lastPushedSession);
		}
		if (socket.role === 'client' && lastSyncedUsers) {
			socket.emit('admin:syncUsers', lastSyncedUsers);
		}
		if (socket.role === 'client') {
			if (lastSyncedGamesGlobal) {
				socket.emit('admin:syncGames', lastSyncedGamesGlobal);
			}
			Object.values(lastSyncedGamesByTeacher).forEach((payload) => {
				socket.emit('admin:syncGames', payload);
			});
			if (lastSyncedGamification) {
				socket.emit('admin:syncGamification', lastSyncedGamification);
			}
		}
	});

	socket.on('client:requestUsers', () => {
		if (socket.role !== 'client') return;
		if (lastSyncedUsers) {
			socket.emit('admin:syncUsers', lastSyncedUsers);
			return;
		}
		// Ask any connected admin to push user accounts
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'admin') {
				s.emit('admin:requestUserSync');
			}
		});
	});

	socket.on('client:requestGames', () => {
		if (socket.role !== 'client') return;
		let sent = false;
		if (lastSyncedGamesGlobal) {
			socket.emit('admin:syncGames', lastSyncedGamesGlobal);
			sent = true;
		}
		Object.values(lastSyncedGamesByTeacher).forEach((payload) => {
			socket.emit('admin:syncGames', payload);
			sent = true;
		});
		if (!sent) {
			io.sockets.sockets.forEach((s) => {
				if (s.role === 'admin') {
					s.emit('admin:requestGameSync');
				}
			});
		}
	});

	socket.on('client:requestGamification', () => {
		if (socket.role !== 'client') return;
		if (lastSyncedGamification) {
			socket.emit('admin:syncGamification', lastSyncedGamification);
			return;
		}
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'admin') {
				s.emit('admin:requestGamificationSync');
			}
		});
	});

	socket.on('register', (payload = {}) => {
		clients[socket.id] = {
			socketId: socket.id,
			ip,
			deviceId: payload.deviceId || socket.id,
			name: payload.name || '',
			lastSeen: Date.now(),
			status: 'online',
			data: payload.localStorage || {},
		};
		broadcastClients();
	});

	// ─── Profile Update Request Handler ───
	socket.on('student:requestProfileUpdate', (data, ack) => {
		const createdAt = data?.createdAt || new Date().toISOString();
		const requestId =
			data?.requestId || `${data?.userId || socket.id}-${Date.now()}`;
		const payload = {
			...data,
			requestId,
			id: requestId,
			createdAt,
			requestedAt: createdAt,
			socketId: socket.id,
		};

		// Broadcast to all admins
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'admin') {
				s.emit('admin:profileRequest', payload);
			}
		});

		if (typeof ack === 'function') ack({ ok: true, requestId, createdAt });
	});

	socket.on('heartbeat', () => {
		if (clients[socket.id]) {
			clients[socket.id].lastSeen = Date.now();
			clients[socket.id].status = 'online';
		}
	});

	socket.on('localStorageUpdate', (payload = {}) => {
		if (clients[socket.id]) {
			clients[socket.id].data = payload;
			clients[socket.id].lastSeen = Date.now();
			clients[socket.id].status = 'online';
		}
		broadcastClients();
	});

	socket.on('requestLocalStorage', (cb) => {
		if (clients[socket.id]) {
			cb && cb(clients[socket.id].data);
		} else {
			cb && cb(null);
		}
	});

	socket.on('admin:requestClientData', ({ socketId }) => {
		if (!requireAdminSocket(socket, 'admin:requestClientData')) return;
		const target = io.sockets.sockets.get(socketId);
		if (target) {
			target.emit('requestLocalStorage');
		}
	});

	// Push exam/training session to all client devices
	socket.on('admin:pushSession', (sessionPackage) => {
		if (!requireAdminSocket(socket, 'admin:pushSession')) return;
		try {
			console.log('Broadcasting session:', sessionPackage?.examName);
			console.log('Session package received:', {
				mode: sessionPackage?.mode,
				examName: sessionPackage?.examName,
				questionsCount: sessionPackage?.questions?.length,
			});
			// Store the session for late-arriving clients
			lastPushedSession = sessionPackage;
			console.log('Stored session for late arrivals, now broadcasting...');
			io.sockets.sockets.forEach((s) => {
				if (s.role === 'client') {
					console.log('Sending session to client:', s.id);
					s.emit('session:receive', sessionPackage);
				}
			});
			console.log('Session broadcast complete');
		} catch (error) {
			console.error('Error in admin:pushSession handler:', error);
		}
	});

	// Clear active session on all client devices
	socket.on('admin:clearSession', () => {
		if (!requireAdminSocket(socket, 'admin:clearSession')) return;
		lastPushedSession = null; // Clear stored session
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client') {
				s.emit('session:clear');
			}
		});
	});

	// Stop only the active exam/training session (preserve settings/questions)
	socket.on('admin:stopExam', () => {
		if (!requireAdminSocket(socket, 'admin:stopExam')) return;
		console.log('Stopping active exam session on all devices');
		lastPushedSession = null;
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client') {
				s.emit('session:stop');
			}
		});
	});

	// Push default settings (training questions + settings) to all client devices
	socket.on('admin:pushSettings', (payload) => {
		if (!requireAdminSocket(socket, 'admin:pushSettings')) return;
		console.log('Broadcasting default settings:', {
			questionsCount: payload.quizQuestions?.length || 0,
			settingKeys: Object.keys(payload.quizSettings || {}),
		});
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client') {
				s.emit('admin:pushSettings', payload);
			}
		});
	});

	// Sync only questions to all client devices
	socket.on('admin:syncQuestions', (payload) => {
		if (!requireAdminSocket(socket, 'admin:syncQuestions')) return;
		console.log('Broadcasting synced questions:', {
			questionsCount: payload.quizQuestions?.length || 0,
		});
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client') {
				s.emit('admin:syncQuestions', payload);
			}
		});
	});

	// Sync user accounts to all client devices
	socket.on('admin:syncUsers', (payload) => {
		if (!requireAdminSocket(socket, 'admin:syncUsers')) return;
		payload = sanitizeUsersForSync(payload);
		const users = Array.isArray(payload?.quizUsers) ? payload.quizUsers : [];
		const fingerprint = buildUsersFingerprint(users);
		const nowMs = Date.now();
		const isDuplicateWithinWindow =
			Boolean(fingerprint) &&
			fingerprint === lastSyncedUsersFingerprint &&
			nowMs - lastSyncedUsersBroadcastAt < USERS_SYNC_DUPLICATE_WINDOW_MS;
		if (payload?.cache) {
			lastSyncedUsers = payload;
		}
		if (isDuplicateWithinWindow) {
			return;
		}
		lastSyncedUsersFingerprint = fingerprint;
		lastSyncedUsersBroadcastAt = nowMs;
		console.log('Broadcasting synced users:', {
			userCount: users.length,
		});
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client' || s.role === 'admin') {
				s.emit('admin:syncUsers', payload);
			}
		});
	});

	socket.on('admin:syncGames', (payload) => {
		if (!requireAdminSocket(socket, 'admin:syncGames')) return;
		console.log('Broadcasting synced games:', {
			gameCount: payload.quizGames?.length || 0,
		});
		if (payload.cache) {
			if (payload.scope?.type === 'teacher') {
				const teacherId = payload.scope.teacherId || 'unknown';
				lastSyncedGamesByTeacher[teacherId] = payload;
			} else {
				lastSyncedGamesGlobal = payload;
			}
		}
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client' || s.role === 'admin') {
				s.emit('admin:syncGames', payload);
			}
		});
	});

	socket.on('admin:syncGamification', (payload) => {
		if (!requireAdminSocket(socket, 'admin:syncGamification')) return;
		console.log('Broadcasting synced gamification:', {
			hasConfig: Boolean(payload?.quizGamification),
			activeTournamentId: payload?.quizTournamentActive?.id || '',
		});
		if (payload?.cache) {
			lastSyncedGamification = payload;
		}
		io.sockets.sockets.forEach((s) => {
			if (s.role === 'client' || s.role === 'admin') {
				s.emit('admin:syncGamification', payload);
			}
		});
	});

	socket.on('student:syncStoredData', (payload = {}, ack) => {
		if (socket.role !== 'client') {
			if (typeof ack === 'function') ack({ ok: false, error: 'forbidden' });
			return;
		}

		try {
			const baseUsers = Array.isArray(lastSyncedUsers?.quizUsers)
				? lastSyncedUsers.quizUsers.map((user) => ({ ...user }))
				: [];
			const fallbackUsers = Array.isArray(payload.quizUsers)
				? payload.quizUsers.map((user) => ({ ...user }))
				: [];
			const patchId = String(payload.userId || '').trim();
			const patchRaw =
				payload.userPatch && typeof payload.userPatch === 'object'
					? payload.userPatch
					: null;
			let nextUsers = baseUsers;

			if (patchId && patchRaw) {
				if (!nextUsers.length && fallbackUsers.length) {
					nextUsers = fallbackUsers;
				}

				const index = nextUsers.findIndex(
					(user) => String(user?.id || '').trim() === patchId,
				);
				if (index >= 0) {
					const sanitizedPatch = {};
					if (Number.isFinite(Number(patchRaw.exp))) {
						sanitizedPatch.exp = Math.max(0, Number(patchRaw.exp));
					}
					if (Array.isArray(patchRaw.badges)) {
						sanitizedPatch.badges = patchRaw.badges;
					}
					if (
						patchRaw.tournamentScores &&
						typeof patchRaw.tournamentScores === 'object'
					) {
						sanitizedPatch.tournamentScores = patchRaw.tournamentScores;
					}
					if (typeof patchRaw.lastGamificationSyncAt === 'string') {
						sanitizedPatch.lastGamificationSyncAt =
							patchRaw.lastGamificationSyncAt;
					}
					nextUsers[index] = { ...nextUsers[index], ...sanitizedPatch };
				}
			} else if (!nextUsers.length && fallbackUsers.length) {
				nextUsers = fallbackUsers;
			}

			if (!nextUsers.length) {
				if (typeof ack === 'function') ack({ ok: false, error: 'no_users' });
				return;
			}

			const syncPayload = {
				quizUsers: nextUsers,
				syncedAt: new Date().toISOString(),
				cache: true,
				source: 'student',
			};
			lastSyncedUsers = syncPayload;

			io.sockets.sockets.forEach((s) => {
				if (s.role === 'client' || s.role === 'admin') {
					s.emit('admin:syncUsers', syncPayload);
				}
			});

			if (typeof ack === 'function') ack({ ok: true });
		} catch (error) {
			console.error('student:syncStoredData error:', error);
			if (typeof ack === 'function') ack({ ok: false, error: 'sync_failed' });
		}
	});

	socket.on('student:updateTournament', (payload = {}, ack) => {
		if (socket.role !== 'client') {
			if (typeof ack === 'function') ack({ ok: false, error: 'forbidden' });
			return;
		}

		try {
			const tournamentData = payload?.tournamentData;
			if (!tournamentData || !tournamentData.id) {
				if (typeof ack === 'function')
					ack({ ok: false, error: 'invalid_data' });
				return;
			}

			// Update the cached tournament and broadcast to all clients
			if (tournamentData?.cache !== false) {
				lastSyncedGamification = {
					...lastSyncedGamification,
					quizTournamentActive: tournamentData,
					syncedAt: new Date().toISOString(),
				};
			}

			// Broadcast updated tournament to all clients and admins
			io.sockets.sockets.forEach((s) => {
				if (s.role === 'client' || s.role === 'admin') {
					s.emit('admin:syncGamification', {
						quizTournamentActive: tournamentData,
						syncedAt: new Date().toISOString(),
						cache: true,
						source: 'student',
					});
				}
			});

			if (typeof ack === 'function') ack({ ok: true });
		} catch (error) {
			console.error('student:updateTournament error:', error);
			if (typeof ack === 'function') ack({ ok: false, error: 'sync_failed' });
		}
	});

	socket.on('client:syncGames', (payload) => {
		if (socket.role !== 'client') return;
		if (payload?.scope?.type !== 'game') return;
		// Game state is server-authoritative. Ignore client-originated game snapshots
		// to prevent local fallback state from overriding live sessions.
		return;
	});

	socket.on('disconnect', () => {
		if (clients[socket.id]) {
			clients[socket.id].status = 'disconnected';
			clients[socket.id].lastSeen = Date.now();
		}
		broadcastClients();
	});
});

function broadcastClients() {
	const list = Object.values(clients).map((c) => ({
		socketId: c.socketId,
		ip: c.ip,
		deviceId: c.deviceId,
		name: c.name,
		lastSeen: c.lastSeen,
		status: c.status,
		data: c.data,
	}));

	io.sockets.sockets.forEach((s) => {
		if (s.role === 'admin') s.emit('clients:update', list);
	});
}

// Periodic check to mark offline clients
setInterval(() => {
	const now = Date.now();
	Object.values(clients).forEach((c) => {
		if (now - c.lastSeen > 15000) c.status = 'offline';
	});
	broadcastClients();
}, 5000);

server.listen(port, () =>
	console.log(`Quiz realtime server listening on :${port}`),
);

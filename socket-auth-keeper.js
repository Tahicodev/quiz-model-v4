/**
 * socket-auth-keeper.js — keeps the shared legacy socket authenticated.
 *
 * Why this exists: the admin dashboard and the student workspace can run in
 * TWO TABS of the same browser. sessionStorage is per-tab, but localStorage
 * (quizSession / quizAuthToken) is shared across tabs — and every login
 * (admin OR student) overwrites it. The consequences we must survive:
 *
 *   1. A new student tab builds its socket from the ADMIN's token that the
 *      previous login left in shared localStorage. The socket then carries
 *      the wrong identity — and when that token expires (15 minutes), the
 *      socket.io client replays the same dead token on every reconnect
 *      attempt, so the handshake is rejected with UNAUTHORIZED forever.
 *   2. The REST layer (legacy-bridge invalidateAuthSession) reacts to a 401
 *      by calling socket.disconnect() on the cached socket. A MANUAL
 *      disconnect makes socket.io stop reconnecting — the socket stays a
 *      corpse cached in window.__QUIZ_LEGACY_SOCKET__, and getSocket() keeps
 *      handing it out. The student then sees "Realtime server disconnected"
 *      when trying to mark ready.
 *
 * Strategy: NEVER cache a socket identity forever. The keeper maps the
 * ACTIVE session (this tab's sessionStorage first, then the shared
 * localStorage) to a token, refreshes expired access tokens via the httpOnly
 * cookie (POST /api/v1/auth/refresh), and re-authenticates the EXISTING
 * socket object in place (socket.auth.token = fresh) before asking it to
 * reconnect — so every listener bound by page code survives.
 *
 * Load AFTER legacy-bridge.js and the Socket.IO CDN script (defer is fine;
 * the keeper polls for window.io), BEFORE scripts that call getSocket().
 */
(function () {
	'use strict';

	var KEEPER_KEY = '__QUIZ_SOCKET_AUTH_KEEPER__';
	if (window[KEEPER_KEY]) return; // already installed
	var keeper = { version: '1.0', installedAt: Date.now() };
	window[KEEPER_KEY] = keeper;

	// ── Session resolution (same precedence the pages use) ──────────────────────
	// sessionStorage is per-tab and always represents THIS tab's login; the
	// shared localStorage copy is the last login from ANY tab of this browser.
	function readSessionFrom(store) {
		if (!store) return null;
		try {
			var raw = store.getItem('quizSession');
			if (!raw) return null;
			var parsed = JSON.parse(raw);
			return parsed && parsed.token ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function readActiveSession() {
		return (
			readSessionFrom(sessionStorage) || // this tab's login (never clobbered by other tabs)
			readSessionFrom(localStorage) // last login in this browser (fallback for restored tabs)
		);
	}

	function getBaseUrl() {
		return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
	}

	// The active session's token — NOT the shared localStorage token, so an
	// admin tab can never leak its identity into a student tab's socket.
	function readActiveToken() {
		var session = readActiveSession();
		if (session && session.token) return session.token;
		return '';
	}

	function persistToken(session, newToken) {
		if (!session || !newToken) return;
		try {
			session.token = newToken;
			if (sessionStorage.getItem('quizSession')) {
				sessionStorage.setItem('quizSession', JSON.stringify(session));
			}
			// Only touch the SHARED localStorage copy when it belongs to the
			// same user — refreshing the admin tab must never overwrite the
			// student tab's remembered session (and vice versa).
			var shared = readSessionFrom(localStorage);
			if (
				shared &&
				String(shared.userId || '') === String(session.userId || '') &&
				shared.role === session.role
			) {
				shared.token = newToken;
				localStorage.setItem('quizSession', JSON.stringify(shared));
				if (localStorage.getItem('quizSessionRemember')) {
					var remember = JSON.parse(localStorage.getItem('quizSessionRemember'));
					if (
						remember &&
						String(remember.userId || '') === String(session.userId || '')
					) {
						remember.token = newToken;
						localStorage.setItem('quizSessionRemember', JSON.stringify(remember));
					}
				}
			}
			// The raw-token key is a legacy convenience cache used by the admin
			// page's getSocket; keep it in sync for THIS session's user.
			window.__authToken = newToken;
			window.__AUTH_SESSION_EXPIRED__ = false;
			var tokenIsShared =
				shared &&
				String(shared.userId || '') === String(session.userId || '') &&
				shared.role === session.role;
			if (tokenIsShared) {
				try {
					localStorage.setItem('quizAuthToken', newToken);
				} catch (e) {}
			}
		} catch (e) {
			/* non-fatal — the in-memory window.__authToken still updates */
		}
	}

	// ── Access-token refresh (single-flight) ───────────────────────────────────
	// Mirrors legacy-bridge refreshAccessToken but keys the refresh to the
	// ACTIVE session so a 401 in the student tab cannot rotate the admin
	// tab's refresh cookie state mid-flight.
	var refreshInFlight = null;

	function refreshAccessToken() {
		// Share the legacy bridge's refresh promise with REST/bootstrap callers.
		// Separate refresh locks can rotate the same cookie twice and make the
		// second request fail with "Invalid refresh token".
		if (typeof window.__legacyBridgeRefresh === 'function') {
			return window.__legacyBridgeRefresh();
		}
		if (refreshInFlight) return refreshInFlight;
		refreshInFlight = fetch(getBaseUrl() + '/auth/refresh', {
			method: 'POST',
			credentials: 'include', // sends the refreshToken httpOnly cookie
			headers: { 'Content-Type': 'application/json' },
			// Name this tab's portal so the server rotates the matching
			// cookie — admin and student tabs of one browser each keep
			// their own refresh token.
			body: JSON.stringify({ portal: window.APP_PORTAL || undefined }),
		})
			.then(function (r) {
				if (!r.ok) {
					var err = new Error('Refresh failed (' + r.status + ')');
					err.status = r.status;
					throw err;
				}
				return r.json();
			})
			.then(function (data) {
				var newToken = data && (data.accessToken || data.token);
				if (!newToken) throw new Error('Refresh returned no token');
				var session = readActiveSession();
				persistToken(session, newToken);
				return newToken;
			})
			.finally(function () {
				refreshInFlight = null;
			});
		return refreshInFlight;
	}

	// ── Token identity check ───────────────────────────────────────────────────
	// JWT payload.id/role/exp — lets us detect "the cached socket was built
	// with the admin's token, but this tab is now the student" and whether a
	// token is still usable (handshake-wise) before swapping onto it.
	function decodeJwt(token) {
		try {
			var parts = String(token || '').split('.');
			if (parts.length < 2) return null;
			var encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
			while (encoded.length % 4) encoded += '=';
			var payload = JSON.parse(atob(encoded));
			return payload && payload.id ? payload : null;
		} catch (e) {
			return null;
		}
	}

	function isTokenUsable(token) {
		var payload = decodeJwt(token);
		if (!payload) return false;
		if (!payload.exp) return true; // no expiry claim — assume valid
		// 5s clock-skew margin.
		return Number(payload.exp) * 1000 > Date.now() + 5000;
	}

	// ── Socket re-authentication (in place — bindings survive) ────────────────
	var reauthInFlight = false;
	var lastReauthAt = 0;
	var REAUTH_MIN_INTERVAL = 2000; // don't hammer the auth endpoint
	// When a refresh returns a DIFFERENT user's token (another tab in this
	// browser owns the shared refresh cookie), back off hard — retrying just
	// burns refresh rotations (each one revokes the previous token).
	var lastIdentityMismatchAt = 0;
	var IDENTITY_MISMATCH_COOLDOWN = 60000;

	// Re-authenticate the cached socket with the given token. The socket
	// OBJECT is kept (every page binds listeners to it); only its auth
	// credentials and connection attempt are renewed.
	function reauthenticateSocket(socket, token) {
		if (!socket || !token) return false;
		try {
			socket.auth = socket.auth && typeof socket.auth === 'object' ? socket.auth : {};
			socket.auth.token = token;
			// A socket disconnected by invalidateAuthSession() (manual
			// disconnect) never reconnects on its own — socket.io only
			// auto-retries transport errors, not explicit disconnect calls.
			// connect() is a no-op when already connected, so a socket that
			// is LIVE but carries the wrong identity (another tab's token)
			// must be torn down first — otherwise it stays connected with
			// the stale credentials forever.
			if (socket.connected) {
				socket.disconnect();
			}
			socket.connect();
			return true;
		} catch (e) {
			console.warn('[socket-auth-keeper] re-auth connect failed:', e);
			return false;
		}
	}

	// Full recovery: refresh the access token, then re-auth + reconnect the
	// cached socket in place. Called on socket UNAUTHORIZED connect errors
	// and by the watchdog below.
	//
	// Identity guard: the httpOnly refresh cookie jar is browser-wide — the
	// LAST login in ANY tab owns it. A refresh fired from this tab can
	// therefore return the OTHER user's token (e.g. the admin tab's socket
	// drops after the student logged in last in this browser). Blindly
	// applying it would re-auth the socket under the wrong identity and set
	// up an infinite flap (watchdog swap → refresh → mismatch → swap …).
	// Only tokens matching THIS tab's active session user are applied; a
	// mismatch means this tab's refresh cookie is gone (another login
	// rotated it) and the honest answer is: leave the socket alone.
	function recoverSocket(socket, onRecovered) {
		if (!socket || reauthInFlight) return Promise.resolve(null);
		var now = Date.now();
		if (now - lastReauthAt < REAUTH_MIN_INTERVAL) return Promise.resolve(null);
		if (now - lastIdentityMismatchAt < IDENTITY_MISMATCH_COOLDOWN) {
			// Another tab in this browser owns the shared refresh cookie —
			// wait out the cooldown before rotating anything again.
			return Promise.resolve(null);
		}
		reauthInFlight = true;
		lastReauthAt = now;
		return refreshAccessToken()
			.then(function (newToken) {
				var active = readActiveSession();
				var activeIdentity = decodeJwt(active && active.token);
				var freshIdentity = decodeJwt(newToken);
				var identityMatches =
					!activeIdentity ||
					!freshIdentity ||
					(freshIdentity.id === activeIdentity.id &&
						String(freshIdentity.role || '') === String(activeIdentity.role || ''));
				if (!identityMatches) {
					lastIdentityMismatchAt = Date.now();
					console.warn(
						'[socket-auth-keeper] refresh returned a token for a different user ' +
							'(' +
							(freshIdentity && freshIdentity.id) +
							') than the active session (' +
							(activeIdentity && activeIdentity.id) +
							') — another tab owns the refresh cookie; leaving socket untouched',
					);
					return null;
				}
				reauthenticateSocket(socket, newToken);
				if (typeof onRecovered === 'function') onRecovered(newToken);
				keeper.lastRecoveredAt = Date.now();
				return newToken;
			})
			.catch(function (err) {
				console.warn(
					'[socket-auth-keeper] token refresh failed; will retry on next auth error:',
					err && err.message,
				);
				return null;
			})
			.finally(function () {
				reauthInFlight = false;
			});
	}

	// ── Watchdog: revive corpse sockets and wrong-identity sockets ────────────
	// Runs on every keeper tick. Two failure modes it heals:
	//   (a) manually-disconnected corpse (invalidateAuthSession killed it) —
	//       socket.io never retries a manual disconnect, so we must connect().
	//   (b) the cached socket's token belongs to a DIFFERENT user/role than
	//       the active session (admin tab token built the student tab's
	//       socket): re-auth in place with the active session's token.
	function reviveCachedSocket() {
		var socket = window.__QUIZ_LEGACY_SOCKET__;
		if (!socket) return;

		var activeToken = readActiveToken();
		var activeIdentity = decodeJwt(activeToken);
		if (!activeIdentity) return; // anonymous — nothing to revive into

		var socketToken =
			(socket.auth && socket.auth.token) ||
			'';
		var socketIdentity = decodeJwt(socketToken);

		// `socket.active` only exists in socket.io ≥ 4.6 (the CDN here ships
		// 4.5.4), so detect a truly-dead socket via the manager state: a
		// manually-disconnected or exhausted socket leaves the manager in
		// 'closed', while an in-flight (re)connect attempt shows 'opening'.
		var mgr = socket.io;
		var connecting = !!(
			mgr &&
			(mgr.readyState === 'opening' || mgr.readyState === 'open')
		);
		var socketDead = !socket.connected && !connecting;
		var wrongIdentity =
			socketIdentity &&
			(socketIdentity.id !== activeIdentity.id ||
				String(socketIdentity.role || '') !== String(activeIdentity.role || ''));

		if (!socketDead && !wrongIdentity) return;

		if (wrongIdentity && socketIdentity) {
			console.warn(
				'[socket-auth-keeper] cached socket identity (' +
					socketIdentity.id +
					'/' +
					socketIdentity.role +
					') differs from active session (' +
					activeIdentity.id +
					'/' +
					activeIdentity.role +
					') — re-authenticating in place',
			);
		}

		// If the active token is not the one the socket carries, re-auth the
		// socket with it — but only when it's actually usable (unexpired).
		// An expired active token would just be rejected at the handshake;
		// recoverSocket() performs the refresh + re-auth instead, so here we
		// never churn dead tokens onto a live socket.
		if (activeToken && socketToken !== activeToken) {
			if (!isTokenUsable(activeToken)) {
				// Socket is dead AND the stored token is expired — the classic
				// "Chrome student tab" corpse. Kick the refresh + in-place
				// re-auth recovery now (no connect_error will ever fire on a
				// socket that isn't even attempting to connect).
				if (socketDead) recoverSocket(socket);
				return;
			}
			reauthenticateSocket(socket, activeToken);
		} else if (socketDead) {
			// Same token, dead socket (manual disconnect from a REST 401).
			// If the token is still usable, just redial; otherwise refresh.
			if (isTokenUsable(activeToken)) {
				socket.connect();
			} else {
				recoverSocket(socket);
			}
		}
	}

	// ── Wiring: attach connect_error recovery to every socket getSocket makes ─
	// The keeper monitors the shared cached socket, so pages that never load
	// this script directly still benefit as long as the page hosting them
	// loads it once.
	function attachSocketGuards(socket) {
		if (!socket) return;
		if (socket.__QUIZ_AUTH_GUARD__) return; // already guarded
		try {
			socket.__QUIZ_AUTH_GUARD__ = true;

			socket.on('connect_error', function (error) {
				var message = (error && error.message) || '';
				var isAuthFailure = /unauthorized|invalid.*token|expired|token.*required|jwt/i.test(
					message,
				);
				if (!isAuthFailure) return;
				console.warn(
					'[socket-auth-keeper] socket auth rejected:',
					message,
					'— refreshing token and re-authenticating in place',
				);
				recoverSocket(socket);
			});
		} catch (e) {
			console.warn('[socket-auth-keeper] failed to attach guards:', e);
		}
	}

	// ── Public surface (used by page getSocket bridges) ───────────────────────
	// getSocket bridges consult the keeper BEFORE building or returning a
	// cached socket:
	//   - No cached socket  → build one with the ACTIVE session token (never
	//     blindly from shared localStorage).
	//   - Cached socket belongs to a different identity than the active
	//     session → re-auth it in place first.
	keeper.getActiveToken = function () {
		var token = readActiveToken();
		if (!token) return '';
		// Prefer window.__authToken when it belongs to the same user — the
		// REST layer may have rotated it more recently than storage.
		if (window.__authToken) {
			var stored = decodeJwt(token);
			var live = decodeJwt(window.__authToken);
			if (
				stored &&
				live &&
				stored.id === live.id &&
				String(stored.role || '') === String(live.role || '')
			) {
				return window.__authToken;
			}
		}
		return token;
	};

	keeper.reviveCachedSocket = reviveCachedSocket;
	keeper.reauthenticateSocket = reauthenticateSocket;
	keeper.attachSocketGuards = attachSocketGuards;
	keeper.readActiveSession = readActiveSession;
	keeper.refreshAccessToken = refreshAccessToken;
	keeper.recoverSocket = recoverSocket;

	// ── Watchdog loop ──────────────────────────────────────────────────────────
	// Cheap (a couple of JSON parses per tick). 5s catches both corpse
	// revival and identity swaps quickly after a login in another tab of the
	// same browser (which fires storage events we could otherwise listen for).
	setInterval(function () {
		try {
			reviveCachedSocket();
			if (window.__QUIZ_LEGACY_SOCKET__) {
				attachSocketGuards(window.__QUIZ_LEGACY_SOCKET__);
			}
		} catch (e) {
			/* never break the page over keeper maintenance */
		}
	}, 5000);

	// Storage events from OTHER tabs (admin tab login overwrites shared
	// localStorage) — react immediately instead of waiting for the tick.
	window.addEventListener('storage', function (event) {
		try {
			if (event && event.key === 'quizAuthToken') reviveCachedSocket();
		} catch (e) {}
	});

	// Login flows dispatch auth:changed in-page (no reload) — re-check right
	// away so the fresh identity reaches the socket without waiting a tick.
	window.addEventListener('auth:changed', function () {
		try {
			reviveCachedSocket();
		} catch (e) {}
	});

	console.log('[socket-auth-keeper] installed');
})();

/**
 * kids-store.js — one place for "who is playing" and "which championship".
 *
 * The kids area grew three separate identity stores: kids-player.js kept the
 * avatar in `kidAvatar`, kids-championship.js kept name+avatar in
 * `kidChampionshipPlayer`, and both carried their own copy of the same
 * token-resolver. A kid who typed their name once was asked again on the next
 * screen, and only the lobby knew about their championship.
 *
 * This module is deliberately tiny and dependency-free: the hub, the player
 * and the championship lobby all load it, read the same values, and write
 * through to the legacy keys so a page still running from an older cache
 * keeps working during the rollout.
 *
 * Every consumer must treat it as optional (`window.KidsStore && ...`) — the
 * jsdom unit tests eval a single file in isolation, where this one is absent.
 */
(function () {
	'use strict';

	var AVATARS = ['🦊', '🐸', '🐵', '🐼', '🦁', '🐯', '🐨', '🐷', '🐰', '🐙'];
	var PLAYER_KEY = 'kidPlayer';               // canonical: { name, avatar }
	var CHAMP_KEY = 'kidChampionship';          // canonical: { id, code, name, emoji, rank, points }
	var LEGACY_PLAYER = 'kidChampionshipPlayer';// lobby-only, pre-unification
	var LEGACY_AVATAR = 'kidAvatar';            // player-only, pre-unification

	/** localStorage reads never throw at the caller: a kid in private mode
	 * still gets a working game, just without remembered details. */
	function read(key) {
		try { return localStorage.getItem(key); } catch (_) { return null; }
	}
	function write(key, value) {
		try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
	}
	function drop(key) {
		try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
	}
	function readJson(key) {
		var raw = read(key);
		if (!raw) return null;
		try { return JSON.parse(raw); } catch (_) { return null; }
	}

	function payloadOf(token) {
		try {
			var parts = String(token || '').split('.');
			if (parts.length !== 3) return null;
			return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
		} catch (_) { return null; }
	}
	function jwtExpiresAt(token) {
		var payload = payloadOf(token);
		return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	}

	/** Login required (boot gate) — the same sources kids-player.js scans,
	 * in the same portal priority: student copies first so a shared browser
	 * never mistakes another portal's tab for the student. */
	function token() {
		var sources = [];
		try {
			if (window.__authToken) sources.push({ token: window.__authToken, scoped: false });
			var s = JSON.parse(sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession') || 'null');
			if (s && s.token) sources.push({ token: s.token, scoped: false });
		} catch (_) { /* ignore */ }
		try {
			var scopedStudent = read('quizAuthToken:student');
			if (scopedStudent) sources.push({ token: scopedStudent, scoped: true });
			var sessRaw = read('quizSession:student') || read('quizSessionRemember');
			var parsed = sessRaw ? JSON.parse(sessRaw) : null;
			if (parsed && parsed.token) sources.push({ token: parsed.token, scoped: true });
		} catch (_) { /* ignore */ }
		try {
			var scopedStaff = read('quizAuthToken:teacher') || read('quizAuthToken:admin') || read('quizAuthToken:super_admin');
			if (scopedStaff) sources.push({ token: scopedStaff, scoped: false });
		} catch (_) { /* ignore */ }
		try {
			var shared = read('quizAuthToken');
			if (shared) sources.push({ token: shared, scoped: false });
		} catch (_) { /* ignore */ }
		for (var i = 0; i < sources.length; i++) {
			var exp = jwtExpiresAt(sources[i].token);
			if (exp !== null && exp <= Date.now()) {
				// Only student-scoped copies are ever cleared: a stale shared
				// token may still be the staff member's live session.
				if (sources[i].scoped) {
					drop('quizAuthToken:student');
					drop('quizSession:student');
				}
				continue;
			}
			return sources[i].token;
		}
		return null;
	}

	/** Account display name: stored user copy first, then the JWT payload. */
	function accountName() {
		var copies = [read('quizCurrentUser:student'), read('quizCurrentUser')];
		for (var i = 0; i < copies.length; i++) {
			try {
				var u = JSON.parse(copies[i] || 'null');
				if (u && (u.name || u.username)) return String(u.name || u.username);
			} catch (_) { /* ignore */ }
		}
		var payload = payloadOf(token());
		if (payload && (payload.name || payload.username)) return String(payload.name || payload.username);
		return '';
	}

	/** Remembered player, merged across the three historical stores so a kid
	 * who played before this refactor keeps their name and avatar. */
	function player() {
		var canon = readJson(PLAYER_KEY) || {};
		var legacy = readJson(LEGACY_PLAYER) || {};
		var avatar = canon.avatar || read(LEGACY_AVATAR) || legacy.avatar || AVATARS[0];
		var name = canon.name || legacy.name || accountName();
		return {
			name: String(name || ''),
			avatar: AVATARS.indexOf(avatar) >= 0 ? avatar : AVATARS[0],
		};
	}

	function setPlayer(next) {
		var current = player();
		var merged = {
			name: next && next.name != null ? String(next.name) : current.name,
			avatar: next && next.avatar ? next.avatar : current.avatar,
		};
		write(PLAYER_KEY, JSON.stringify(merged));
		// Mirror to the legacy keys while pages may still be running cached
		// copies of the pre-refactor scripts.
		write(LEGACY_AVATAR, merged.avatar);
		if (merged.name) write(LEGACY_PLAYER, JSON.stringify({ name: merged.name, avatar: merged.avatar }));
		return merged;
	}

	/** "Not me" — drop the explicit name and avatar. The account name can
	 * still resolve afterwards, which is correct: the logged-in student's
	 * account name is authoritative, the stored one is a nickname. */
	function forgetPlayer() {
		drop(PLAYER_KEY);
		drop(LEGACY_PLAYER);
		drop(LEGACY_AVATAR);
	}

	/** The championship a kid is currently playing for. Written by the lobby
	 * when they join or pick one, and by the player when it auto-detects that
	 * this game is a challenge — that is what powers the hub's "back in" door. */
	function championship() {
		var c = readJson(CHAMP_KEY);
		if (!c || !c.id) return null;
		return {
			id: String(c.id),
			code: c.code ? String(c.code).toUpperCase() : '',
			name: c.name ? String(c.name) : '',
			emoji: c.emoji || '🏆',
			rank: Number(c.rank) || 0,
			points: Number(c.points) || 0,
		};
	}

	function setChampionship(next) {
		if (!next || !next.id) return null;
		var current = championship() || {};
		var merged = {
			id: String(next.id),
			code: next.code != null ? String(next.code).toUpperCase() : current.code,
			name: next.name || current.name || '',
			emoji: next.emoji || current.emoji || '🏆',
			rank: next.rank != null ? Number(next.rank) || 0 : current.rank || 0,
			points: next.points != null ? Number(next.points) || 0 : current.points || 0,
		};
		write(CHAMP_KEY, JSON.stringify(merged));
		return merged;
	}

	/** Rank/points refresh only — used after a run so the hub shows the new
	 * standing without losing the name the kid joined with. */
	function setStanding(rank, points) {
		var current = championship();
		if (!current) return null;
		return setChampionship({ id: current.id, rank: rank, points: points });
	}

	function clearChampionship() {
		drop(CHAMP_KEY);
	}

	/** The run a game is being played for, chosen on the play screen when the
	 * game belongs to one or more active championships. sessionStorage: it is
	 * a property of this visit, not of the kid. */
	function run() {
		try { return sessionStorage.getItem('kidChampionshipRun') || null; } catch (_) { return null; }
	}
	function setRun(id) {
		try {
			if (id) sessionStorage.setItem('kidChampionshipRun', String(id));
			else sessionStorage.removeItem('kidChampionshipRun');
		} catch (_) { /* ignore */ }
	}

	/** Recently played PINs, newest first — the hub's "Play again" chips. */
	function recentGames() {
		var list = readJson('kidRecentGames');
		return Array.isArray(list) ? list.filter(function (g) { return g && g.pin; }).slice(0, 4) : [];
	}
	function rememberGame(game) {
		if (!game || !game.pin) return [];
		var pin = String(game.pin).toUpperCase();
		var list = recentGames().filter(function (g) { return String(g.pin).toUpperCase() !== pin; });
		list.unshift({ pin: pin, name: String(game.name || '').slice(0, 60), icon: String(game.icon || '🎮').slice(0, 4) });
		list = list.slice(0, 4);
		write('kidRecentGames', JSON.stringify(list));
		return list;
	}

	function playUrl(pin) {
		return window.location.origin + '/kids/play/' + encodeURIComponent(String(pin || '').toUpperCase());
	}

	window.KidsStore = {
		AVATARS: AVATARS,
		token: token,
		accountName: accountName,
		player: player,
		setPlayer: setPlayer,
		forgetPlayer: forgetPlayer,
		championship: championship,
		setChampionship: setChampionship,
		setStanding: setStanding,
		clearChampionship: clearChampionship,
		run: run,
		setRun: setRun,
		recentGames: recentGames,
		rememberGame: rememberGame,
		playUrl: playUrl,
		/** Exposed for the hub's sound toggle and tests. */
		readJson: readJson,
	};
})();

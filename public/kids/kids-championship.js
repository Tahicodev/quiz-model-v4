/**
 * kids-championship.js — 🏆 Kids Championship lobby (kid-facing).
 *
 * Entry: /kids/championship?code=LION (join code) or ?id=<uuid> (back-link
 * from the play page). No login required — kids type their first name and
 * pick an avatar once, then play each challenge in the kids player. The
 * server keeps the leaderboard (best score per challenge counts) and this
 * lobby polls it every 5 seconds, celebrating every rank improvement.
 */
(function () {
	'use strict';

	var API = '/api/v1/kids/championships';
	var AVATARS = ['🦊', '🐸', '🐵', '🐼', '🦁', '🐯', '🐨', '🐷', '🐰', '🐙'];
	var STORE_KEY = 'kidChampionshipPlayer';
	var SFX_CELEBRATE = '/kids/assets/sfx-celebration.mp3';

	var state = {
		view: 'boot',
		championship: null,
		challenges: [],
		leaderboard: [],
		player: null, // { name, avatar }
		playerDetail: null,
		code: null,
		pollTimer: null,
		lastRank: null,
		muted: false,
		loading: false,
	};

	function $(id) { return document.getElementById(id); }
	function escapeName(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function screen(html) { ($('kcScreen') || {}).innerHTML = html; }

	function readStored() {
		try {
			var raw = localStorage.getItem(STORE_KEY);
			if (raw) return JSON.parse(raw);
		} catch (_) { /* ignore */ }
		return null;
	}
	function storePlayer(p) {
		try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (_) { /* ignore */ }
	}

	function loud(kind) {
		if (state.muted) return;
		try {
			var a = new Audio(SFX_CELEBRATE);
			a.play().catch(function () { /* autoplay guard */ });
		} catch (_) { /* silent */ }
	}

	function starsRain(n) {
		var rain = $('kcStarsRain');
		if (!rain) return;
		rain.hidden = false;
		var emojis = ['⭐', '🌟', '✨', '🎉'];
		for (var i = 0; i < n; i++) {
			(function () {
				var s = document.createElement('span');
				s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
				s.style.left = Math.random() * 100 + 'vw';
				s.style.animationDuration = (1.2 + Math.random() * 1.8) + 's';
				s.style.fontSize = (1 + Math.random() * 1.4) + 'rem';
				rain.appendChild(s);
				setTimeout(function () { s.remove(); }, 3200);
			})();
		}
		setTimeout(function () { if (!rain.children.length) rain.hidden = true; }, 3400);
	}

	// ─── Views ────────────────────────────────────────────────────────────

	function codeEntryScreen() {
		if (!state.player) $('kcTitle').textContent = 'Kids Championship';
		var html = '<div class="kid-card kid-card-wide" style="margin-top:6vh">' +
			'<div class="kid-hero">🏆</div>' +
			'<h2>Kids Championship</h2>' +
			'<p class="hint">Ask your teacher for the <b>4-letter championship code</b> and type it here! 🎈</p>' +
			'<input id="kcCodeInput" class="kid-pin-input kc-code-input" maxlength="4" autocomplete="off" placeholder="••••" aria-label="Championship code" style="display:block" />' +
			'<button id="kcCodeGoBtn" class="kid-btn">Let\'s Go! ▶</button>' +
			'<div id="kcCodeErr" class="kid-error" role="alert"></div>' +
			'<p class="hint" style="margin-top:10px"><a href="/kids/">🎮 Playing a single game instead? Back to PIN entry</a></p>' +
			'</div>';
		screen(html);
		var input = $('kcCodeInput');
		var err = $('kcCodeErr');
		function go() {
			var code = String(input.value || '').trim().toUpperCase();
			if (!/^[A-Z2-9]{4}$/.test(code)) {
				err.textContent = 'Hmm, a code has 4 letters or numbers. Try again! 🔍';
				return;
			}
			err.textContent = '';
			history.replaceState(null, '', '/kids/championship?code=' + code);
			requestCode(code);
		}
		$('kcCodeGoBtn').addEventListener('click', go);
		input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
		input.focus();
	}

	function identityScreen() {
		var html = '<div class="kid-card kid-card-wide" style="margin-top:4vh">' +
			'<div class="kid-hero">🚀</div>' +
			'<h2>Who\'s playing?</h2>' +
			'<p class="hint">Type your first name and pick your animal — we cheer for you by name! 📣</p>' +
			'<input id="kcName" class="kid-name-input" maxlength="50" placeholder="Your name" autocomplete="off" style="display:block;margin:6px auto" />' +
			'<div class="kc-avatar-row" id="kcAvatars"></div>' +
			'<button id="kcJoinBtn" class="kid-btn green" style="margin-top:14px">Join the Championship ⭐</button>' +
			'<div id="kcJoinErr" class="kid-error"></div>' +
			'</div>';
		screen(html);
		var chosen = AVATARS[0];
		var row = $('kcAvatars');
		row.innerHTML = AVATARS.map(function (a, i) {
			return '<button type="button" class="kc-emoji' + (i === 0 ? ' selected' : '') + '" data-a="' + a + '">' + a + '</button>';
		}).join('');
		row.addEventListener('click', function (e) {
			var b = e.target.closest('.kc-emoji');
			if (!b) return;
			chosen = b.getAttribute('data-a');
			row.querySelectorAll('.kc-emoji').forEach(function (x) {
				x.classList.toggle('selected', x === b);
			});
		});
		function join() {
			var name = String(($('kcName') || {}).value || '').trim();
			if (!name) { ($('kcJoinErr') || {}).textContent = 'Tell me your name so I can cheer for you! 📣'; return; }
			state.player = { name: name, avatar: chosen };
			storePlayer(state.player);
			renderLobby();
		}
		$('kcJoinBtn').addEventListener('click', join);
		$('kcName').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
		$('kcName').focus();
	}

	// ─── Data ─────────────────────────────────────────────────────────────

	function playerQuery() {
		return state.player ? ('&player=' + encodeURIComponent(state.player.name)) : '';
	}

	function requestCode(code) {
		state.view = 'load';
		screen('<div class="kid-card"><h2>Looking for your championship… 🔍</h2><p class="hint">One moment!</p></div>');
		$('kcTitle').textContent = 'Kids Championship';
		$('kcSub').textContent = 'Hold on…';
		var url = API + '/code/' + encodeURIComponent(code) + '?limit=50' + playerQuery();
		fetch(url)
			.then(function (r) {
				if (!r.ok) throw new Error('code');
				return r.json();
			})
			.then(loadSuccess)
			.catch(function () {
				state.view = 'code';
				screen('<div class="kid-card"><h2>No championship found 😢</h2><p class="hint">Check the code with your teacher.</p><button class="kid-btn" onclick="location.reload()">Try again</button></div>');
			});
	}

	function requestById(id) {
		state.view = 'load';
		var url = API + '/view/' + encodeURIComponent(id) + '?limit=50' + playerQuery();
		fetch(url)
			.then(function (r) { return r.json(); })
			.then(loadSuccess)
			.catch(function () {
				state.view = 'code';
				codeEntryScreen();
			});
	}

	function loadSuccess(data) {
		state.championship = data.championship;
		state.challenges = data.challenges || [];
		state.leaderboard = data.leaderboard || [];
		state.playerDetail = data.player || null;
		state.code = data.championship.code || state.code;
		$('kcTitle').textContent = state.championship.emoji + ' ' + state.championship.name;
		$('kcSub').textContent = 'Every challenge is worth up to 100 points — best score wins! ⭐';
		if (!state.player) {
			state.view = 'identity';
			identityScreen();
			return;
		}
		state.view = 'lobby';
		renderLobby();
		lastRankSeen();
		if (state.championship.status === 'active') startPolling();
		else stopPolling();
	}

	// ─── Lobby ────────────────────────────────────────────────────────────

	function meOnBoard() {
		if (!state.player) return null;
		for (var i = 0; i < state.leaderboard.length; i++) {
			if (state.leaderboard[i].player_name === state.player.name) return state.leaderboard[i];
		}
		return null;
	}

	function rankBadge(me) {
		if (!state.player) return '';
		if (!me) return '<div class="kc-rank-badge">No points yet · play to climb! 🚀</div>';
		var medal = me.rank === 1 ? ' 🥇' : me.rank === 2 ? ' 🥈' : me.rank === 3 ? ' 🥉' : '';
		return '<div class="kc-rank-badge" id="kcRankBadge">' + me.rank + meditateSuffix(me.rank) + medal + '</div>';
	}
	function meditateSuffix(n) {
		return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
	}

	function renderLobby() {
		var c = state.championship;
		var me = meOnBoard();
		var pd = state.playerDetail;
		var status = c.status === 'finished'
			? '<span class="kc-status-chip done">🏁 Finished</span>'
			: '<span class="kc-status-chip live">▶ Live!</span>';
		var banner = c.status === 'finished'
			? '<div class="kc-banner finished">🏁 The championship is finished! Here are your champions. 🎉</div>'
			: '<div class="kc-banner live">🚀 It\'s live! Play a challenge below — your best score counts. Every challenge is worth up to <b>100 points</b>!</div>';

		var html =
			'<div class="kid-card kid-card-wide" style="max-width:760px;margin-top:2vh">' +
			'<div class="kc-lobby-head">' +
			'<div class="kc-lobby-emoji">' + escapeName(c.emoji || '🏆') + '</div>' +
			'<div class="kc-lobby-title"><h2>' + escapeName(c.name) + ' ' + status + '</h2>' +
			'<p>' + (c.description ? escapeName(c.description) : 'Play every challenge and climb the podium!') + '</p></div>' +
			rankBadge(me) +
			'</div>' +
			banner +
			podiumHtml(me) +
			'<div class="kc-section-title">🎮 Your challenges</div>' +
			'<div class="kc-challenges">' + challengesHtml() + '</div>' +
			'<div class="kc-section-title">⭐ Standings</div>' +
			'<div class="kc-standings">' + standingsHtml() + '</div>' +
			'<p class="hint" style="margin-top:12px">' +
			'<a class="kid-btn" href="javascript:switchIdentity()">Not ' + escapeName(state.player.name) + '? Change name</a>' +
			'<a class="kid-btn" href="/kids/">Exit</a>' +
			'</p>' +
			'</div>';
		screen(html);
		bindChallengeButtons();
	}

	function podiumHtml(me) {
		var top = state.leaderboard.slice(0, 3);
		var medals = ['🥇', '🥈', '🥉'];
		if (!top.length) {
			return '<div class="kc-podium"><div class="kc-podium-step"><div class="kc-podium-medal">🥇</div><div class="kc-podium-avatar">🤔</div><div class="kc-podium-name">Be first!</div><div class="kc-podium-points">0 pts</div></div></div>';
		}
		while (top.length < 3) {
			top.push({ player_name: '…', avatar: '⭐', points: 0, rank: top.length + 1 });
		}
		return '<div class="kc-podium">' + top.map(function (p, i) {
			var isMe = state.player && p.player_name === state.player.name;
			return '<div class="kc-podium-step kc-medal-' + (i + 1) + (isMe ? ' kc-me' : '') + '">' +
				'<div class="kc-podium-medal">' + medals[i] + '</div>' +
				'<div class="kc-podium-avatar">' + escapeName(p.avatar || '🐣') + '</div>' +
				'<div class="kc-podium-name">' + escapeName(p.player_name) + (isMe ? ' (you)' : '') + '</div>' +
				'<div class="kc-podium-points">' + p.points + ' pts</div>' +
				'</div>';
		}).join('') + '</div>';
	}

	function challengesHtml() {
		if (!state.challenges.length) return '<p class="hint">No challenges yet — check with your teacher.</p>';
		return state.challenges.map(function (g) {
			var best = (state.playerDetail && state.playerDetail.scores_by_game && state.playerDetail.scores_by_game[g.id]) || null;
			var done = !!best;
			var playable = g.pin && state.championship.status !== 'finished';
			return '<div class="kc-challenge' + (done ? ' kc-challenge-done' : '') + '">' +
				'<div class="kc-challenge-icon">' + gameIcon(g.game_type) + '</div>' +
				'<div class="kc-challenge-info">' +
				'<div class="kc-challenge-name">' + escapeName(g.name) + '</div>' +
				'<div class="kc-challenge-best">' + (done
					? 'Best: <b>' + best.points + '</b> pts · ' + '⭐'.repeat(best.stars) + ' ✓'
					: 'Not played yet · worth 100 pts') + '</div>' +
				'</div>' +
				(playable
					? '<button class="kid-btn green" data-pin="' + escapeName(g.pin) + '">' + (done ? 'Play again 🔁' : 'Play ▶') + '</button>'
					: done
						? ''
						: '<button class="kid-btn" disabled style="opacity:.5;cursor:default">Hold on…</button>') +
				'</div>';
		}).join('');
	}

	function standingsHtml() {
		if (!state.leaderboard.length) return '<p class="hint">No players yet — you could be first! 🚀</p>';
		return state.leaderboard.map(function (p, i) {
			var isMe = state.player && p.player_name === state.player.name;
			var medal = p.rank === 1 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(p.rank) + '.';
			return '<div class="kc-row' + (isMe ? ' kc-me' : '') + '">' +
				'<div class="kc-rank">' + medal + '</div>' +
				'<div class="kc-avatar">' + escapeName(p.avatar || '🐣') + '</div>' +
				'<div class="kc-name">' + escapeName(p.player_name) + (isMe ? ' (you)' : '') + '</div>' +
				'<div class="kc-stars">' + p.stars + ' ⭐</div>' +
				'<div class="kc-points">' + p.points + ' pts</div>' +
				'</div>';
		}).join('');
	}

	function bindChallengeButtons() {
		var screen = $('kcScreen');
		if (!screen) return;
		screen.querySelectorAll('[data-pin]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var pin = btn.getAttribute('data-pin');
				var id = state.championship.id;
				window.location.href = '/kids/play/' + encodeURIComponent(pin) + '?championship=' + encodeURIComponent(id);
			});
		});
	}

	function switchIdentity() {
		stopPolling();
		state.player = null;
		try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
		identityScreen();
	}

	function gameIcon(type) {
		return {
			'bubble-pop': '🫧', 'star-collector': '🌟', 'leap-frog': '🐸',
			'sort-it-out': '🧺', 'pair-party': '🎴', 'build-a-tower': '🏗️',
			'magic-words': '🪄', 'code-explorer': '🔭',
		}[type] || '🎮';
	}

	// ─── Polling + celebration ────────────────────────────────────────────

	function startPolling() {
		stopPolling();
		state.pollTimer = setInterval(refresh, 5000);
	}
	function stopPolling() {
		if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
	}

	function refresh() {
		if (!state.championship) return;
		var url = API + '/view/' + encodeURIComponent(state.championship.id) + '?limit=50' + playerQuery();
		fetch(url)
			.then(function (r) { return r.json(); })
			.then(function (data) {
				state.championship = data.championship;
				state.challenges = data.challenges || state.challenges;
				state.leaderboard = data.leaderboard || state.leaderboard;
				state.playerDetail = data.player || state.playerDetail;
				if (state.championship.status === 'finished') stopPolling();
				renderLobby();
				celebrateImprovement();
			})
			.catch(function () { /* transient — keep the current lobby */ });
	}

	function lastRankSeen() {
		var me = meOnBoard();
		state.lastRank = me ? me.rank : null;
	}

	function celebrateImprovement() {
		var me = meOnBoard();
		if (!me) return;
		var prev = state.lastRank;
		state.lastRank = me.rank;
		if (prev != null && me.rank < prev) {
			starsRain(40);
			loud('celebrate');
			var badge = $('kcRankBadge');
			if (badge) { badge.classList.add('kc-flash'); setTimeout(function () { badge.classList.remove('kc-flash'); }, 1700); }
		}
	}

	// ─── Boot ─────────────────────────────────────────────────────────────

	function boot() {
		var soundBtn = $('kcSoundBtn');
		if (soundBtn) soundBtn.addEventListener('click', function () {
			state.muted = !state.muted;
			soundBtn.textContent = state.muted ? '🔇' : '🔊';
		});
		state.player = readStored();
		var params = new URLSearchParams(window.location.search);
		var code = params.get('code');
		var id = params.get('id');
		if (code && /^[A-Z2-9]{4}$/i.test(code)) {
			requestCode(String(code).toUpperCase());
		} else if (id) {
			requestById(id);
		} else {
			state.view = 'code';
			codeEntryScreen();
		}
	}

	document.addEventListener('DOMContentLoaded', boot);
	window.switchIdentity = switchIdentity;
})();
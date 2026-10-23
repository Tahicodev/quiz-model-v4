/**
 * kids-hub.js — the /kids/ entrance.
 *
 * Two jobs, in this order: (1) who is playing, (2) which door they walk
 * through. Every value it remembers is written to kids-store.js so the player
 * and the championship lobby never ask a second time.
 *
 * The PIN/join-code contract is unchanged from the original page: 4 chars,
 * A–Z and 2–9, then /kids/play/<PIN> — the URL the tests and the teacher's
 * share card both depend on.
 */
(function () {
	'use strict';

	var PIN_RE = /^[A-Z2-9]{4}$/;
	var SOUND_KEY = 'kidSoundMuted';

	function $(id) { return document.getElementById(id); }
	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	/** The store is always loaded in production; the guards keep this module
	 * usable in isolation (unit tests eval it alone) and in private mode. */
	function store() { return window.KidsStore || null; }
	function storeGet(fn, fallback) {
		var s = store();
		try { return s && typeof s[fn] === 'function' ? s[fn]() : fallback; } catch (_) { return fallback; }
	}

	/* ── Code entry ───────────────────────────────────────────────────────── */

	/** Codes never contain 0 or 1 (they look like O and I), so characters that
	 * could never match are dropped as they are typed — a kid cannot build a
	 * code that has no chance of working. */
	function sanitize(raw) {
		return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
	}
	function isComplete(value) {
		return PIN_RE.test(String(value || ''));
	}
	function playTarget(pin) {
		return '/kids/play/' + encodeURIComponent(String(pin || '').toUpperCase());
	}
	function championshipTarget(code) {
		return '/kids/championship?code=' + encodeURIComponent(String(code || '').toUpperCase());
	}
	function championshipById(id) {
		return '/kids/championship?id=' + encodeURIComponent(String(id || ''));
	}

	/** Wires one code field: live-filtered input, a GO button that starts
	 * pulsing when the code is complete, and friendly errors that shake the
	 * field instead of just printing red text. */
	function wireCodeEntry(opts) {
		var input = $(opts.inputId);
		var button = $(opts.buttonId);
		var error = $(opts.errorId);
		if (!input || !button) return;
		var door = input.closest('.kid-hub-door');

		function refresh() {
			button.classList.toggle('ready', isComplete(input.value));
		}
		function fail(message) {
			if (error) error.textContent = message;
			if (door) {
				door.classList.remove('kid-hub-shake');
				void door.offsetWidth;
				door.classList.add('kid-hub-shake');
			}
			input.focus();
		}
		function submit() {
			var code = sanitize(input.value);
			input.value = code;
			if (!isComplete(code)) {
				fail(opts.tooShort || 'Codes have 4 letters or numbers 🔤');
				return;
			}
			if (error) error.textContent = '';
			opts.onComplete(code);
		}
		input.addEventListener('input', function () {
			var clean = sanitize(input.value);
			if (clean !== input.value) input.value = clean;
			if (error) error.textContent = '';
			refresh();
		});
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') { e.preventDefault(); submit(); }
		});
		button.addEventListener('click', submit);
		refresh();
		return { submit: submit, refresh: refresh };
	}

	/* ── Greeting + identity ──────────────────────────────────────────────── */

	function renderGreeting() {
		var box = $('hubGreeting');
		if (!box) return;
		var p = storeGet('player', { name: '', avatar: '🧸' }) || {};
		var name = String(p.name || '').trim();
		box.innerHTML =
			'<div class="kid-hub-face" aria-hidden="true">' + esc(name ? (p.avatar || '🦊') : '🧸') + '</div>' +
			'<div>' +
				'<div class="hello">' + (name ? 'Hi, ' + esc(name) + '! 👋' : 'Hi there! 👋') + '</div>' +
				'<div class="sub">' + (name ? 'Ready for a new adventure?' : 'Tap here and pick your name and animal!') + '</div>' +
			'</div>' +
			'<div class="spacer"></div>' +
			'<button class="kid-hub-change" id="hubChangeBtn" type="button">' + (name ? 'Change ✏️' : 'Pick 🎨') + '</button>';
		var btn = $('hubChangeBtn');
		if (btn) btn.addEventListener('click', function () { toggleIdentity(true); });
	}

	function toggleIdentity(open) {
		var panel = $('hubIdentity');
		if (!panel) return;
		panel.hidden = !open;
		if (!open) return;
		var current = storeGet('player', { name: '', avatar: '🦊' }) || {};
		var avatars = (store() && store().AVATARS) || ['🦊'];
		var chosen = current.avatar && avatars.indexOf(current.avatar) >= 0 ? current.avatar : avatars[0];
		panel.querySelector('#hubAvatars').innerHTML = avatars.map(function (a) {
			return '<button type="button" class="kid-avatar' + (a === chosen ? ' selected' : '') + '" data-a="' + esc(a) + '" aria-label="Avatar ' + esc(a) + '">' + esc(a) + '</button>';
		}).join('');
		panel.querySelector('#hubNameInput').value = current.name || '';
		panel.querySelector('#hubIdentityErr').textContent = '';
		var row = panel.querySelector('#hubAvatars');
		row.addEventListener('click', function (e) {
			var b = e.target.closest('.kid-avatar');
			if (!b) return;
			chosen = b.dataset.a;
			row.querySelectorAll('.kid-avatar').forEach(function (x) { x.classList.toggle('selected', x === b); });
		});
		panel.querySelector('#hubSaveBtn').addEventListener('click', function () {
			var name = String(panel.querySelector('#hubNameInput').value || '').trim();
			if (!name) {
				panel.querySelector('#hubIdentityErr').textContent = 'Tell me your name so I can cheer for you! 📣';
				return;
			}
			var s = store();
			if (s && s.setPlayer) s.setPlayer({ name: name, avatar: chosen });
			panel.hidden = true;
			renderGreeting();
		});
		var nameInput = panel.querySelector('#hubNameInput');
		nameInput.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') { e.preventDefault(); panel.querySelector('#hubSaveBtn').click(); }
		});
		nameInput.focus();
	}

	/* ── My championship / recent games ───────────────────────────────────── */

	function medalFor(rank) {
		return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎖';
	}

	function renderMine() {
		var box = $('hubMine');
		var field = $('hubChampField');
		var link = $('hubChampLink');
		if (!box) return;
		var c = storeGet('championship', null);
		if (!c || !c.id) {
			box.hidden = true;
			return;
		}
		var standing = c.rank
			? '<span class="standing">' + medalFor(c.rank) + ' #' + c.rank + (c.points ? ' · ' + c.points + ' pts' : '') + '</span>'
			: '<span class="standing">No points yet — play a challenge! 🎯</span>';
		box.innerHTML =
			'<span class="emoji" aria-hidden="true">' + esc(c.emoji || '🏆') + '</span>' +
			'<span class="info"><span class="name">' + esc(c.name || 'My championship') + '</span>' + standing + '</span>' +
			'<button class="kid-btn green" id="hubMineGo" type="button">Back in 🏆</button>' +
			'<button class="kid-hub-chip" id="hubMineForget" type="button" aria-label="Leave this championship">✕</button>';
		box.hidden = false;
		var go = $('hubMineGo');
		if (go) go.addEventListener('click', function () { window.location.href = championshipById(c.id); });
		var forget = $('hubMineForget');
		if (forget) forget.addEventListener('click', function () {
			var s = store();
			if (s && s.clearChampionship) s.clearChampionship();
			renderMine();
		});
		// The kid can still walk in with a fresh class code.
		if (field) field.hidden = false;
		if (link) link.hidden = false;
	}

	function renderRecent() {
		var box = $('hubRecent');
		if (!box) return;
		var list = storeGet('recentGames', []) || [];
		if (!list.length) { box.innerHTML = ''; return; }
		box.innerHTML = '<span class="kid-hub-chip" style="pointer-events:none">Play again ▸</span>' +
			list.map(function (g) {
				return '<button class="kid-hub-chip" type="button" data-pin="' + esc(g.pin) + '">' +
					esc(g.icon || '🎮') + ' ' + esc(g.name || g.pin) + '</button>';
			}).join('');
		box.addEventListener('click', function (e) {
			var chip = e.target.closest('[data-pin]');
			if (chip) window.location.href = playTarget(chip.dataset.pin);
		});
	}

	/* ── Sound toggle (persists into the game) ────────────────────────────── */
	function wireSound() {
		var btn = $('hubSoundBtn');
		if (!btn) return;
		var muted = false;
		try { muted = localStorage.getItem(SOUND_KEY) === '1'; } catch (_) { /* ignore */ }
		function paint() {
			btn.textContent = muted ? '🔇' : '🔊';
			btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
			btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
		}
		btn.addEventListener('click', function () {
			muted = !muted;
			try { localStorage.setItem(SOUND_KEY, muted ? '1' : '0'); } catch (_) { /* ignore */ }
			paint();
			// A blip only when turning sound back ON: it is the answer to the
			// kid's own click, so autoplay rules allow it.
			if (!muted) { try { var a = new Audio('/kids/assets/sfx-hint.mp3'); a.play().catch(function () { /* ignore */ }); } catch (_) { /* ignore */ } }
		});
		paint();
	}

	/* ── Boot ─────────────────────────────────────────────────────────────── */
	function init() {
		renderGreeting();
		wireSound();
		renderMine();
		renderRecent();

		wireCodeEntry({
			inputId: 'pinInput',
			buttonId: 'pinGoBtn',
			errorId: 'pinError',
			tooShort: 'Oops! A game code has 4 letters or numbers 🔤',
			onComplete: function (pin) {
				var s = store();
				if (s && s.rememberGame) {
					s.rememberGame({ pin: pin, name: '', icon: '🎮' });
					// Enrich the chip once the game name is known — done on the
					// play page, so the hub never blocks on a request.
				}
				window.location.href = playTarget(pin);
			},
		});

		wireCodeEntry({
			inputId: 'champCodeInput',
			buttonId: 'champGoBtn',
			errorId: 'champError',
			tooShort: 'Oops! A class code has 4 letters or numbers 🔤',
			onComplete: function (code) { window.location.href = championshipTarget(code); },
		});

		var mine = storeGet('championship', null);
		if (mine && mine.code) {
			var input = $('champCodeInput');
			if (input) {
				input.value = sanitize(mine.code);
				input.dispatchEvent(new Event('input'));
			}
		}

		var pin = $('pinInput');
		if (pin) pin.focus();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();

	window.KidsHub = {
		sanitize: sanitize,
		isComplete: isComplete,
		playTarget: playTarget,
		championshipTarget: championshipTarget,
		championshipById: championshipById,
		renderGreeting: renderGreeting,
		renderMine: renderMine,
		renderRecent: renderRecent,
		init: init,
	};
})();

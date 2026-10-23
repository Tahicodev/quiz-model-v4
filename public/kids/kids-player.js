/**
 * kids-player.js — KidsPlayerEngine (plan §4 + §12).
 *
 * Login required: PIN → valid session check → logged-in players skip
 * name entry (account name is used, results link by token) → one
 * renderer per question → results. Without a valid session the player
 * bounces to the workspace sign-in and back. Answer formats follow
 * plan §12; the server re-checks authoritatively, the client check is
 * only for instant feedback.
 */
(function () {
	'use strict';

	var API = '/api/v1/kids';
	var AVATARS = ['🦊', '🐸', '🐵', '🐼', '🦁', '🐯', '🐨', '🐷', '🐰', '🐙'];
	var BUBBLE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
	var MASCOT_EMOJI = { idle: '🦊', happy: '😄', encourage: '💪', excited: '🤩', amazed: '😲', celebrate: '🎉' };
	/* Mirrors the teacher-side icon map: used for the hub's "Play again" chips. */
	var GAME_TYPE_ICONS = {
		'bubble-pop': '🫧', 'star-collector': '🌟', 'leap-frog': '🐸',
		'sort-it-out': '🧺', 'pair-party': '🎴', 'build-a-tower': '🏗️',
		'magic-words': '🪄', 'code-explorer': '🔭', 'math-quest': '🧮',
	};
	/* Kid themes (mirrors src/shared KIDS_THEMES): each gets its own CSS
	 * presentation world on body.kid-theme-<name> — scenery, palette and
	 * floating decorations match the mascot theme the teacher picked. */
	var KIDS_THEME_KEYS = [
		'jungle', 'space', 'ocean', 'farm', 'castle', 'dinosaur',
		'forest', 'city', 'circus', 'magic', 'school', 'superhero',
	];

	/* ── Asset probing (extensions vary) ─────────────────────────────────── */
	function probeImage(urls) {
		return new Promise(function (resolve) {
			var i = 0;
			function next() {
				if (i >= urls.length) return resolve(null);
				var img = new Image();
				img.onload = function () { resolve(urls[i]); };
				img.onerror = function () { i += 1; next(); };
				img.src = urls[i];
			}
			next();
		});
	}
	function themeBackgrounds(theme) {
		return ['/kids/assets/bg-' + theme + '.png', '/kids/assets/bg-' + theme + '.jpg', '/kids/assets/bg-' + theme + '.jpeg'];
	}
	function mascotSources(state) {
		return ['/kids/assets/mascot-' + state + '.jpg', '/kids/assets/mascot-' + state + '.png'];
	}
	function badgeSources(kind) {
		return ['/kids/assets/badge-' + kind + '.png', '/kids/assets/badge-' + kind + '.jpg'];
	}

	/* ── SoundManager (plan §9.1) ────────────────────────────────────────── */
	var SoundManager = {
		muted: false,
		cache: {},
		file: function (kind) {
			return { correct: '/kids/assets/sfx-correct.mp3', retry: '/kids/assets/sfx-retry.mp3', celebration: '/kids/assets/sfx-celebration.mp3', hint: '/kids/assets/sfx-hint.mp3' }[kind];
		},
		play: function (kind) {
			if (this.muted) return;
			try {
				var src = this.file(kind);
				var audio = this.cache[src] || (this.cache[src] = new Audio(src));
				audio.currentTime = 0;
				var p = audio.play();
				if (p && p.catch) p.catch(function () { /* autoplay guard */ });
			} catch (_) { /* silent */ }
		},
		toggle: function () {
			this.muted = !this.muted;
			return this.muted;
		},
	};

	/* ── MascotManager (plan §9.1) ───────────────────────────────────────── */
	var MascotManager = {
		el: null,
		set: function (state) {
			var el = this.el;
			if (!el) return;
			el.classList.remove('bounce');
			void el.offsetWidth;
			el.classList.add('bounce');
			probeImage(mascotSources(state)).then(function (src) {
				if (src) {
					if (el.tagName === 'IMG') el.src = src;
					else {
						var img = document.createElement('img');
						img.className = el.className;
						img.id = el.id;
						img.alt = 'Mascot';
						img.src = src;
						el.replaceWith(img);
						MascotManager.el = img;
					}
				} else {
					var emoji = MASCOT_EMOJI[state] || MASCOT_EMOJI.idle;
					if (el.tagName === 'IMG') {
						var div = document.createElement('div');
						div.className = el.className;
						div.id = el.id;
						div.textContent = emoji;
						el.replaceWith(div);
						MascotManager.el = div;
					} else {
						el.textContent = emoji;
					}
				}
			});
		},
	};

	/* ── Client-side answer check (mirror of backend, plan §12) ──────────── */
	function escapeHtml(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function splitTokens(raw) {
		return String(raw == null ? '' : raw).split(/[|,;]/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
	}
	function clientCheck(question, given) {
		var type = String(question.type || 'multiple-choice');
		var answer = String(question.answer == null ? '' : question.answer);
		var g = String(given == null ? '' : given);
		if (type === 'multiple-choice' && question.allowMultipleAnswers) {
			var ga = splitTokens(g).sort(), aa = splitTokens(answer).sort();
			return ga.length > 0 && JSON.stringify(ga) === JSON.stringify(aa);
		}
		if (type === 'multiple-choice' || type === 'true-false' || type === 'odd-one-out' || type === 'fill-blank') {
			return g.trim().toLowerCase() === answer.trim().toLowerCase();
		}
		if (type === 'matching') {
			var gp = g.split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
			var ap = answer.split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
			return gp.length > 0 && JSON.stringify(gp) === JSON.stringify(ap);
		}
		if (type === 'draggable') return g.trim() === answer.trim();
		if (type === 'code') {
			var mode = question.codeAnswerMode || 'multiple-choice';
			if (mode === 'fill-blank') return g.trim().toLowerCase() === answer.trim().toLowerCase();
			if (mode === 'matching') {
				var g2 = g.split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
				var a2 = answer.split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
				return g2.length > 0 && JSON.stringify(g2) === JSON.stringify(a2);
			}
			return g.trim().toLowerCase() === answer.trim().toLowerCase();
		}
		return g.trim().toLowerCase() === answer.trim().toLowerCase();
	}

	function kidOptions(question) {
		var raw = question.options_json;
		if (typeof raw === 'string') {
			try { raw = JSON.parse(raw); } catch (_) { raw = []; }
		}
		if (!Array.isArray(raw)) return [];
		return raw.map(function (o) {
			if (typeof o === 'string') return o;
			if (o && typeof o === 'object') return String(o.text != null ? o.text : (o.label != null ? o.label : ''));
			return String(o == null ? '' : o);
		}).filter(function (s) { return s !== ''; });
	}

	/** Matching-pairs block data for a question. Mirrors the training-mode
	 * parser (split tokens on | and newlines, single-token commas, arrows
	 * -->, ->, =>, →, ::, = and ":"). Pairs may live in the ANSWER only
	 * (canonical stored format) or in the option strings. Each pair keeps
	 * its raw token so submissions grade byte-for-byte against the answer. */
	function kidPairs(question) {
		var out = [];
		var seen = {};
		function remember(left, right, raw) {
			var key = left + '\u0001' + right;
			if (seen[key]) return;
			seen[key] = 1;
			out.push({ raw: raw, left: left, right: right });
		}
		function pushToken(raw) {
			raw = String(raw || '').trim();
			if (!raw) return;
			var seps = ['-->', '->', '=>', '→', '::', '='];
			for (var si = 0; si < seps.length; si++) {
				var i = raw.indexOf(seps[si]);
				if (i > 0) {
					var left = raw.slice(0, i).trim();
					var right = raw.slice(i + seps[si].length).trim();
					if (left && right) remember(left, right, raw);
					return;
				}
			}
			var c = raw.indexOf(':');
			if (c > 0) {
				var l2 = raw.slice(0, c).trim();
				var r2 = raw.slice(c + 1).trim();
				if (l2 && r2) remember(l2, r2, raw);
			}
		}
		// Splits "A-->1|B-->2" and pipe/newline variants; a lone token with
		// commas (the kid-canonical comma-joined form) splits there instead.
		function collectTokens(chunk) {
			var tokens = [];
			String(chunk).split(/[\|]+/).forEach(function (piece) {
				piece.split(/\r?\n/).forEach(function (t) {
					t = t.trim();
					if (t) tokens.push(t);
				});
			});
			if (tokens.length === 1 && tokens[0].indexOf(',') >= 0) {
				tokens = tokens[0].split(',').map(function (t) { return t.trim(); }).filter(Boolean);
			}
			return tokens;
		}
		// 1) Canonical stored format: pairs live in the answer.
		var answer = String((question && question.answer) || '').trim();
		if (answer.indexOf('meta::') === 0) {
			var parts = answer.split('::');
			if (parts.length >= 3) answer = parts.slice(2).join('::');
		}
		if (answer) collectTokens(answer).forEach(pushToken);
		if (out.length) return out;
		// 2) Option strings carrying pair syntax ("A-->1").
		var opts = kidOptions(question);
		opts.forEach(function (opt) { collectTokens(opt).forEach(pushToken); });
		if (out.length) return out;
		// 3) Flat alternating options: ["left1","right1","left2","right2"].
		if (opts.length >= 4 && opts.length % 2 === 0 && !opts.some(function (s) { return /-->|->|=>|→|::/.test(s); })) {
			for (var i = 0; i + 1 < opts.length; i += 2) {
				if (opts[i] && opts[i + 1]) remember(opts[i], opts[i + 1], opts[i] + '-->' + opts[i + 1]);
			}
		}
		return out;
	}
	function shuffle(arr) {
		var a = arr.slice();
		for (var i = a.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var t = a[i]; a[i] = a[j]; a[j] = t;
		}
		return a;
	}

	/* ── Engine ──────────────────────────────────────────────────────────── */
	var engine = {
		pin: null,
		game: null,
		config: {},
		sessionId: null,
		player: { name: '', avatar: '🦊' },
		index: 0,
		answers: [],
		score: 0,
		timerId: null,
		timeLeft: 0,
		questionStart: 0,
		renderer: null,
		locked: false,

		init: function () {
			MascotManager.el = document.getElementById('kidMascot');
			this.pin = this.pinFromUrl();
			// The hub's sound toggle is written to the same flag, so a kid who
			// turned sound off at the entrance is not blasted by the first blip.
			try { SoundManager.muted = localStorage.getItem('kidSoundMuted') === '1'; } catch (_) { /* ignore */ }
			var soundBtn = document.getElementById('kidSoundBtn');
			if (soundBtn) {
				soundBtn.textContent = SoundManager.muted ? '🔇' : '🔊';
				soundBtn.addEventListener('click', function () {
					var muted = SoundManager.toggle();
					soundBtn.textContent = muted ? '🔇' : '🔊';
					try { localStorage.setItem('kidSoundMuted', muted ? '1' : '0'); } catch (_) { /* ignore */ }
				});
			}
			if (!this.pin) {
				this.screen('<div class="kid-card"><h2>Oops! 😅</h2><p class="hint">No game PIN found.</p><a class="kid-btn" href="/kids/">Back</a></div>');
				return;
			}
			// Direct links require a valid login so results count. Without
			// one, bounce to the workspace sign-in and back afterwards; if
			// the bounce guard tripped, offer a manual re-sign-in instead.
			if (!this.requireLogin()) {
				this.expiredScreen();
				return;
			}
			this.load();
		},
		pinFromUrl: function () {
			var m = window.location.pathname.match(/\/kids\/play\/([A-Za-z0-9]+)/);
			if (m) return m[1].toUpperCase();
			var q = new URLSearchParams(window.location.search).get('pin');
			return q ? q.toUpperCase() : null;
		},
		tournamentFromUrl: function () {
			var q = new URLSearchParams(window.location.search).get('tournament');
			return q ? String(q) : null;
		},
		/** The championship this run counts for: the lobby passes it in the
		 * URL, and when the kid instead walks in through the hub and picks a
		 * championship on the offer screen, the choice is stashed for the rest
		 * of the visit. Both paths must resolve here — this single function
		 * feeds the session PATCH, the results card and the Math Quest bypass,
		 * so nothing downstream needs to know which door was used. */
		championshipFromUrl: function () {
			var q = new URLSearchParams(window.location.search).get('championship');
			if (q) return String(q);
			if (window.KidsStore && window.KidsStore.run) return window.KidsStore.run();
			try { return sessionStorage.getItem('kidChampionshipRun') || null; } catch (_) { return null; }
		},
		/** `game_ids` is a JSON string in the DB and an array after the service
		 * parses it — accept both rather than trusting the transport. */
		championshipGameIds: function (c) {
			var raw = c && c.game_ids;
			if (Array.isArray(raw)) return raw.map(String);
			if (typeof raw === 'string' && raw) {
				try {
					var parsed = JSON.parse(raw);
					return Array.isArray(parsed) ? parsed.map(String) : [];
				} catch (_) { return []; }
			}
			return [];
		},
		/** Welcome-line text for a championship run: name it when we know it,
		 * so the kid sees where the points are going. */
		championshipBadge: function () {
			var name = this.champInfo && this.champInfo.name;
			var emoji = (this.champInfo && this.champInfo.emoji) || '🏆';
			return name
				? 'Counts for ' + escapeHtml(emoji + ' ' + name) + ' — every point helps! ⭐'
				: 'Kids Championship ' + emoji + ' — this run counts for your best score, so every point helps!';
		},
		/** Active championships this game is a challenge of. Runs before the
		 * first question so the kid can opt in; any failure (offline, stale
		 * token, no login) resolves to [] so play is never blocked. */
		detectChampionship: function () {
			var self = this;
			var token = this.validStoredToken();
			if (!token || !this.game || !this.game.id) return Promise.resolve([]);
			return fetch(API + '/championships/browse?status=active&limit=100', {
				headers: { 'Authorization': 'Bearer ' + token },
			})
				.then(function (r) { return r.ok ? r.json() : null; })
				.then(function (payload) {
					var rows = payload && (payload.data || payload.items) ? (payload.data || payload.items) : (Array.isArray(payload) ? payload : []);
					return rows
						.filter(function (c) { return self.championshipGameIds(c).indexOf(String(self.game.id)) >= 0; })
						.map(function (c) {
							return {
								id: String(c.id),
								name: c.name || 'Championship',
								emoji: c.emoji || '🏆',
								code: c.code ? String(c.code).toUpperCase() : '',
							};
						});
				})
				.catch(function () { return []; });
		},
		/** Name/emoji of a championship we only know by id. The lobby usually
		 * stored it a moment ago (same visit), so this is usually free; the
		 * public `/view/:id` endpoint covers every other case. */
		resolveChampInfo: function (id) {
			var self = this;
			var stored = window.KidsStore && window.KidsStore.championship ? window.KidsStore.championship() : null;
			if (stored && stored.id === String(id)) {
				this.champInfo = stored;
				return Promise.resolve(stored);
			}
			return fetch('/api/v1/kids/championships/view/' + encodeURIComponent(id))
				.then(function (r) { return r.ok ? r.json() : null; })
				.then(function (c) {
					if (!c || !c.id) return null;
					var info = { id: String(c.id), name: c.name || '', emoji: c.emoji || '🏆', code: c.code ? String(c.code).toUpperCase() : '' };
					self.champInfo = info;
					if (window.KidsStore && window.KidsStore.setChampionship) window.KidsStore.setChampionship(info);
					return info;
				})
				.catch(function () { return null; });
		},
		/** The one funnel from "we know who is playing" to the first question:
		 * a championship this game belongs to may claim the run first. */
		afterIdentity: function () {
			var self = this;
			var id = this.championshipFromUrl();
			if (id) {
				this.resolveChampInfo(id).then(function () { self.createSession(); });
				return;
			}
			this.detectChampionship().then(function (list) {
				if (!list.length) { self.createSession(); return; }
				self.offerChampionship(list);
			});
		},
		/** "This counts for 🏆 Jungle Cup!" — one championship confirms, several
		 * are picked from chips, and "Just play" is always one tap away. */
		offerChampionship: function (list) {
			var self = this;
			MascotManager.set('excited');
			var single = list.length === 1 ? list[0] : null;
			var html = '<div class="kid-card kid-champ-offer">' +
				'<div class="kid-champ-offer-emoji" aria-hidden="true">' + escapeHtml(single ? single.emoji : '🏆') + '</div>' +
				(single
					? '<h2>This game counts for<br>' + escapeHtml(single.name) + '!</h2>' +
						'<p class="hint">Play it and your best score goes on the podium. Every point helps! ⭐</p>'
					: '<h2>Which championship is this for?</h2>' +
						'<p class="hint">This game is a challenge in ' + list.length + ' championships. Pick one — or just play! 🎮</p>') +
				(single
					? '<button class="kid-btn green" id="kidChampYes">Yes, count my score 🏆</button>'
					: '<div class="kid-champ-offer-list">' + list.map(function (c, i) {
						return '<button class="kid-champ-chip" data-i="' + i + '">' + escapeHtml(c.emoji) + ' ' + escapeHtml(c.name) + '</button>';
					}).join('') + '</div>') +
				'<button class="kid-btn ghost" id="kidChampNo">' + (single ? 'Just play 🎮' : 'Not now 🎮') + '</button>' +
				'</div>';
			this.screen(html);
			var pick = function (c) {
				if (window.KidsStore && window.KidsStore.setRun) window.KidsStore.setRun(c.id);
				else { try { sessionStorage.setItem('kidChampionshipRun', c.id); } catch (_) { /* ignore */ } }
				self.champInfo = c;
				if (window.KidsStore && window.KidsStore.setChampionship) window.KidsStore.setChampionship(c);
				SoundManager.play('celebration');
				self.createSession();
			};
			var yes = document.getElementById('kidChampYes');
			if (yes && single) yes.addEventListener('click', function () { pick(single); });
			var listEl = document.querySelector('.kid-champ-offer-list');
			if (listEl) listEl.addEventListener('click', function (e) {
				var b = e.target.closest('.kid-champ-chip');
				if (b) pick(list[Number(b.getAttribute('data-i'))]);
			});
			document.getElementById('kidChampNo').addEventListener('click', function () {
				if (window.KidsStore && window.KidsStore.setRun) window.KidsStore.setRun(null);
				self.createSession();
			});
		},
		/** Logged-in students play linked (results count); else anonymous PIN.
		 * Student portal copies are checked first so a shared browser never
		 * mistakes another portal's tab for the student. Staff tokens also
		 * count (teacher preview) — the server authorizes each call. */
		storedToken: function () {
			try {
				if (window.__authToken) return window.__authToken;
				var s = JSON.parse(sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession') || 'null');
				if (s && s.token) return s.token;
			} catch (_) { /* ignore */ }
			try {
				var scopedStudent = localStorage.getItem('quizAuthToken:student');
				if (scopedStudent) return scopedStudent;
				var sessRaw =
					localStorage.getItem('quizSession:student') ||
					localStorage.getItem('quizSessionRemember');
				if (sessRaw) {
					try {
						var parsed = JSON.parse(sessRaw);
						if (parsed && parsed.token) return parsed.token;
					} catch (_) { /* not JSON — ignore */ }
				}
				var scopedStaff =
					localStorage.getItem('quizAuthToken:teacher') ||
					localStorage.getItem('quizAuthToken:admin') ||
					localStorage.getItem('quizAuthToken:super_admin');
				if (scopedStaff) return scopedStaff;
			} catch (_) { /* ignore */ }
			try { return localStorage.getItem('quizAuthToken') || null; } catch (_) { return null; }
		},
		jwtExpiresAt: function (token) {
			try {
				var parts = String(token || '').split('.');
				if (parts.length !== 3) return null;
				var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
				return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
			} catch (_) { return null; }
		},
		/** Token the player may actually use: present AND not expired.
		 * Sources are scanned in portal priority (student copies first).
		 * Expired student copies are dropped and scanning continues, so a
		 * stale student login falls through to any other valid session
		 * instead of failing; only student-scoped copies are ever cleared.
		 * Non-JWT/opaque tokens are returned optimistically (no exp claim
		 * to check) — the server is the final judge. */
		validStoredToken: function () {
			var sources = [];
			try {
				if (window.__authToken) sources.push({ token: window.__authToken, scoped: false });
				var s = JSON.parse(sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession') || 'null');
				if (s && s.token) sources.push({ token: s.token, scoped: false });
			} catch (_) { /* ignore */ }
			try {
				var scopedStudent = localStorage.getItem('quizAuthToken:student');
				if (scopedStudent) sources.push({ token: scopedStudent, scoped: true });
				var sessRaw =
					localStorage.getItem('quizSession:student') ||
					localStorage.getItem('quizSessionRemember');
				if (sessRaw) {
					try {
						var parsed = JSON.parse(sessRaw);
						if (parsed && parsed.token) sources.push({ token: parsed.token, scoped: true });
					} catch (_) { /* not JSON — ignore */ }
				}
				var scopedStaff =
					localStorage.getItem('quizAuthToken:teacher') ||
					localStorage.getItem('quizAuthToken:admin') ||
					localStorage.getItem('quizAuthToken:super_admin');
				if (scopedStaff) sources.push({ token: scopedStaff, scoped: false });
			} catch (_) { /* ignore */ }
			try {
				var shared = localStorage.getItem('quizAuthToken');
				if (shared) sources.push({ token: shared, scoped: false });
			} catch (_) { /* ignore */ }
			for (var i = 0; i < sources.length; i++) {
				var exp = this.jwtExpiresAt(sources[i].token);
				if (exp !== null && exp <= Date.now()) {
					if (sources[i].scoped) {
						try {
							localStorage.removeItem('quizAuthToken:student');
							localStorage.removeItem('quizSession:student');
						} catch (_) { /* ignore */ }
					}
					continue;
				}
				return sources[i].token;
			}
			return null;
		},
		loginUrl: function () {
			var next = encodeURIComponent(window.location.pathname + window.location.search);
			return '/student-workspace.html?login=1&next=' + next;
		},
		/** Direct links require a valid login so results count. Without one,
		 * bounce to the workspace sign-in and back afterwards. A bounce
		 * guard stops redirect loops when the sign-in itself cannot
		 * produce a usable token (then a re-sign-in screen is shown). */
		requireLogin: function () {
			if (this.validStoredToken()) {
				try { sessionStorage.removeItem('kidsLoginBounceAt'); } catch (_) { /* ignore */ }
				return true;
			}
			var last = 0;
			try { last = Number(sessionStorage.getItem('kidsLoginBounceAt') || 0); } catch (_) { /* ignore */ }
			if (Date.now() - last < 3 * 60 * 1000) return false;
			try { sessionStorage.setItem('kidsLoginBounceAt', String(Date.now())); } catch (_) { /* ignore */ }
			window.location.href = this.loginUrl();
			return false;
		},
		expiredScreen: function () {
			this.screen('<div class="kid-card kid-signin">' +
				'<div class="kid-signin-lock" aria-hidden="true">🔑</div>' +
				'<p class="kid-win-kicker">Magic key expired</p>' +
				'<h2 class="kid-win-title">Let\u2019s sign in again!</h2>' +
				'<p class="kid-signin-copy">Your session went to sleep 😴 — sign in again so your stars and scores keep counting!</p>' +
				'<div class="kid-signin-steps" aria-hidden="true">' +
					'<span>1 · Sign in</span><span>2 · Come back</span><span>3 · Keep playing</span>' +
				'</div>' +
				'<div class="kid-signin-actions">' +
					'<a class="kid-btn green kid-win-cta" href="' + this.loginUrl() + '">Sign In 🔑</a>' +
					'<a class="kid-btn ghost" href="/kids/">Back to Kids Hub 🏠</a>' +
				'</div></div>');
		},
		/** Display name for a logged-in player: account copy first, then
		 * the JWT payload. Empty when nothing resolves (the server still
		 * links results by token). */
		resolveAccountName: function () {
			var copies = [];
			try {
				copies.push(localStorage.getItem('quizCurrentUser:student'));
				copies.push(localStorage.getItem('quizCurrentUser'));
			} catch (_) { /* ignore */ }
			for (var i = 0; i < copies.length; i++) {
				try {
					var u = JSON.parse(copies[i] || 'null');
					if (u && (u.name || u.username)) return String(u.name || u.username);
				} catch (_) { /* ignore */ }
			}
			try {
				var token = this.validStoredToken();
				var parts = String(token || '').split('.');
				if (parts.length === 3) {
					var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
					if (payload && (payload.name || payload.username)) {
						return String(payload.name || payload.username);
					}
				}
			} catch (_) { /* ignore */ }
			return '';
		},
		screen: function (html) {
			document.getElementById('kidScreen').innerHTML = html;
		},
		/** Theme presentation: body.kid-theme-<theme> drives the CSS world
		 * (scenery, palette, drifting decorations). When the school drops a
		 * real bg-<theme> photo into /kids/assets, it is layered under the
		 * theme sky (kid-theme-photo) so painted art and floaters compose;
		 * otherwise the pure-CSS scene stands alone. */
		applyTheme: function () {
			var raw = (this.game && this.game.theme) || 'jungle';
			var theme = KIDS_THEME_KEYS.indexOf(String(raw)) >= 0 ? String(raw) : 'jungle';
			var body = document.body;
			KIDS_THEME_KEYS.forEach(function (t) {
				body.classList.remove('kid-theme-' + t);
			});
			body.classList.remove('kid-theme-photo');
			body.classList.add('kid-theme-' + theme);
			body.style.background = '';
			probeImage(themeBackgrounds(theme)).then(function (src) {
				if (src) {
					body.style.background = 'url("' + src + '") center/cover no-repeat fixed';
					body.classList.add('kid-theme-photo');
				}
			});
		},
		load: function () {
			var self = this;
			fetch(API + '/play/' + encodeURIComponent(this.pin))
				.then(function (r) {
					if (!r.ok) throw new Error('Game not found');
					return r.json();
				})
				.then(function (game) {
					self.game = game;
					self.config = game.config || {};
					document.getElementById('kidGameName').textContent = game.name || 'Kids Game';
					document.getElementById('kidGameSub').textContent = (game.grade ? String(game.grade).toUpperCase() + ' · ' : '') + (game.subject || 'Have fun! 🎉');
					self.applyTheme();
					MascotManager.set('idle');
					// Feed the hub's "Play again" chips with the real name and
					// icon — the hub can only know the PIN when the kid types it.
					if (window.KidsStore && window.KidsStore.rememberGame) {
						window.KidsStore.rememberGame({
							pin: self.pin,
							name: game.name || '',
							icon: GAME_TYPE_ICONS[game.game_type] || '🎮',
						});
					}
					self.welcome();
				})
				.catch(function () {
					self.screen('<div class="kid-card"><h2>Game not found 😢</h2><p class="hint">Check the PIN with your teacher.</p><a class="kid-btn" href="/kids/">Try again</a></div>');
				});
		},
		welcome: function () {
			var self = this;
			var n = (this.game.questions || []).length;
			// Logged-in players skip name entry entirely: the account name
			// is used and the server links results by token.
			if (this.validStoredToken()) {
				var remembered = window.KidsStore && window.KidsStore.player ? window.KidsStore.player() : null;
				var avatar = '🦊';
				try { avatar = localStorage.getItem('kidAvatar') || avatar; } catch (_) { /* ignore */ }
				self.player = {
					name: this.resolveAccountName() || (remembered && remembered.name) || '',
					avatar: (remembered && remembered.avatar) || avatar,
				};
				this.afterIdentity();
				return;
			}
			var badges = '';
			if (this.tournamentFromUrl()) badges += '<p class="hint">Tournament mode 🏆 — your score feeds the leaderboard!</p>';
			if (this.championshipFromUrl()) badges += '<p class="hint">' + this.championshipBadge() + '</p>';
			// Note: logged-in players never see this form — welcome()
			// auto-starts them above, so no "logged in" badge is needed.
			var html = '<div class="kid-card"><h2>Hi! 👋</h2>' +
				'<p class="hint">This game has <b>' + n + '</b> question' + (n === 1 ? '' : 's') + '. What is your first name?</p>' + badges +
				'<input id="kidName" class="kid-name-input" maxlength="50" placeholder="Your name" autocomplete="off" />' +
				'<div class="kid-avatar-row" id="kidAvatars">' +
				AVATARS.map(function (a, i) { return '<button class="kid-avatar' + (i === 0 ? ' selected' : '') + '" data-a="' + a + '">' + a + '</button>'; }).join('') +
				'</div><button id="kidStart" class="kid-btn green">Start ▶</button>' +
				'<div id="kidWelcomeErr" class="kid-error"></div></div>';
			this.screen(html);
			var chosen = AVATARS[0];
			document.getElementById('kidAvatars').addEventListener('click', function (e) {
				var b = e.target.closest('.kid-avatar');
				if (!b) return;
				chosen = b.dataset.a;
				document.querySelectorAll('.kid-avatar').forEach(function (x) { x.classList.toggle('selected', x === b); });
			});
			var start = function () {
				var name = String(document.getElementById('kidName').value || '').trim();
				if (!name) { document.getElementById('kidWelcomeErr').textContent = 'Tell me your name so I can cheer for you! 📣'; return; }
				try { localStorage.setItem('kidAvatar', chosen); } catch (_) { /* ignore */ }
				if (window.KidsStore && window.KidsStore.setPlayer) window.KidsStore.setPlayer({ name: name, avatar: chosen });
				self.player = { name: name, avatar: chosen };
				self.afterIdentity();
			};
			document.getElementById('kidStart').addEventListener('click', start);
			document.getElementById('kidName').addEventListener('keydown', function (e) { if (e.key === 'Enter') start(); });
			// Pre-fill the remembered player so a kid never types their name
			// twice: the hub, the championship lobby and this form all read
			// the same store (with the lobby's legacy key as a fallback).
			var remembered = window.KidsStore && window.KidsStore.player ? window.KidsStore.player() : null;
			if (!remembered) {
				try { remembered = JSON.parse(localStorage.getItem('kidChampionshipPlayer') || 'null'); } catch (_) { /* ignore */ }
			}
			if (remembered && remembered.name) {
				document.getElementById('kidName').value = remembered.name;
			}
			if (remembered && remembered.avatar && AVATARS.indexOf(remembered.avatar) >= 0) {
				chosen = remembered.avatar;
				document.querySelectorAll('.kid-avatar').forEach(function (x) { x.classList.toggle('selected', x.dataset.a === remembered.avatar); });
			}
		},
		createSession: function () {
			var self = this;
			this.screen('<div class="kid-card"><h2>Get ready… 🚀</h2><p class="hint">Starting your adventure!</p></div>');
			// Login is required (boot gate), so play is always linked.
			// Re-validate here: the token may have expired while welcome
			// was on screen.
			var token = this.validStoredToken();
			var tournamentId = this.tournamentFromUrl();
			if (!token || !this.game || !this.game.id) {
				window.location.href = this.loginUrl();
				return;
			}
			var sessionBody = { avatar: this.player.avatar };
			// player_name is optional server-side but rejects empty strings,
			// so only send it when the welcome form (or account) provided one.
			if (this.player.name) sessionBody.player_name = this.player.name;
			if (tournamentId) sessionBody.tournament_id = tournamentId;
			fetch(API + '/games/' + encodeURIComponent(this.game.id) + '/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
				body: JSON.stringify(sessionBody),
			}).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
				.then(function (res) {
					if (res.ok && res.j && res.j.session) {
						self.loggedIn = true;
						self.sessionId = res.j.session.id;
						self.index = 0;
						self.answers = [];
						self.score = 0;
						document.getElementById('kidProgress').hidden = false;
						// Math Quest (guarded): the adventure map owns the flow after
						// a session starts — EXCEPT championship challenge runs,
						// which play the whole game exactly like every other kids
						// game (no map, no per-level scoping). All other game types
						// keep the original behavior unchanged.
						if (self.game && self.game.game_type === 'math-quest' && window.MathQuestUI && !self.championshipFromUrl()) {
							window.MathQuestUI.afterSessionStart(self);
							return;
						}
						self.next();
						return;
					}
					if (res.status === 401 || res.status === 403) {
						// Session rejected after passing the boot gate (expired
						// or revoked mid-flow): re-sign-in instead of silently
						// falling back to anonymous play.
						window.location.href = self.loginUrl();
						return;
					}
					throw new Error((res.j && res.j.message) || 'Could not start');
				})
				.catch(function (e) {
					self.screen('<div class="kid-card"><h2>Oops 😅</h2><p class="hint">' + e.message + '</p><button class="kid-btn" onclick="window.location.reload()">Retry</button></div>');
				});
		},
		timePerQ: function () {
			var t = Number(this.config.time_per_q) || 15;
			return Math.min(120, Math.max(5, t));
		},
		next: function () {
			var questions = this.game.questions || [];
			if (this.index >= questions.length) { this.finish(); return; }
			// A fresh question dismisses the previous toast immediately.
			try {
				var oldToast = document.getElementById('kidToast');
				if (oldToast) oldToast.classList.remove('show');
				if (this.nudgeTimer) { clearTimeout(this.nudgeTimer); this.nudgeTimer = null; }
			} catch (_) { /* ignore */ }
			var q = questions[this.index];
			this.locked = false;
			this.questionStart = Date.now();
			this.renderChrome(q);
			this.startTimer();
			this.mountRenderer(q);
		},
		renderChrome: function (q) {
			var total = (this.game.questions || []).length;
			document.getElementById('kidProgressLabel').textContent = (this.index + 1) + '/' + total + ' · ⭐' + this.score;
			document.getElementById('kidProgressFill').style.width = Math.round((this.index / total) * 100) + '%';
		},
		startTimer: function () {
			var self = this;
			this.stopTimer();
			this.timeLeft = this.timePerQ();
			var ring = document.getElementById('kidTimerRing');
			var num = document.getElementById('kidTimerNum');
			function tick() {
				if (self.locked) return;
				self.timeLeft -= 0.2;
				var pct = Math.max(0, (self.timeLeft / self.timePerQ()) * 100);
				if (ring) ring.style.setProperty('--p', pct + '%');
				if (num) num.textContent = String(Math.ceil(Math.max(0, self.timeLeft)));
				if (self.timeLeft <= 0) {
					self.stopTimer();
					self.onTimeout();
				}
			}
			num.textContent = String(this.timeLeft);
			this.timerId = setInterval(tick, 200);
		},
		stopTimer: function () {
			if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
		},
		onTimeout: function () {
			if (this.locked) return;
			this.answer('', true);
		},
		/** Called by renderers with the kid's answer string (plan §12). */
		answer: function (given, timedOut) {
			if (this.locked) return;
			this.locked = true;
			this.stopTimer();
			var q = this.game.questions[this.index];
			var timeMs = Date.now() - this.questionStart;
			var correct = !timedOut && clientCheck(q, given);
			var pts = correct ? (Number(q.points) || 1) : 0;
			this.score += pts;
			this.answers.push({ question_id: q.id, given: String(given == null ? '' : given), correct: correct, time_ms: timeMs });
			var self = this;
			try { if (this.renderer && this.renderer.lock) this.renderer.lock(correct, given); } catch (_) { }
			// Every message goes through the mascot toast — no inline text.
			if (timedOut) {
				this.nudge("Time's up! Watch it glow", '⏰');
				MascotManager.set('encourage');
				SoundManager.play('retry');
			} else if (correct) {
				var cheers = [['Bravo!', '🎉'], ['Awesome!', '⭐'], ['Super!', '🌈']];
				var cheer = cheers[Math.floor(Math.random() * cheers.length)];
				this.nudge(cheer[0], cheer[1]);
				MascotManager.set(this.score >= 3 ? 'excited' : 'happy');
				SoundManager.play('correct');
				this.starsRain(24);
			} else {
				this.nudge('Good try! Look at the glowing answer', '💡');
				MascotManager.set('encourage');
				SoundManager.play('retry');
			}
			this.renderChrome(q);
			setTimeout(function () { self.index += 1; self.next(); }, 1600);
		},
		mountRenderer: function (q) {
			var map = {
				'bubble-pop': 'bubble-pop', 'star-collector': 'star-collector', 'leap-frog': 'leap-frog',
				'sort-it-out': 'sort-it-out', 'pair-party': 'pair-party', 'build-a-tower': 'build-a-tower',
				'magic-words': 'magic-words', 'code-explorer': 'code-explorer', 'math-quest': 'math-quest',
			};
			var key = map[this.game.game_type] || 'bubble-pop';
			// Question-type delegation (same pattern as Math Quest core): the
			// kid matching UI lives in pair-party, so a matching question in
			// any other game falls through to it. math-quest delegates by
			// question type itself — never bypass its quest wrapper here.
			var qType = String(q.type || '');
			if ((qType === 'matching' || qType === 'matching-pairs') && key !== 'pair-party' && key !== 'math-quest') {
				key = 'pair-party';
			}
			var Ctor = (window.KidsGameRenderers || {})[key];
			if (!Ctor) {
				this.screen('<div class="kid-card"><p class="hint">This game is not available yet.</p></div>');
				return;
			}
			if (this.renderer && this.renderer.destroy) { try { this.renderer.destroy(); } catch (_) { } }
			this.renderer = new Ctor(this, document.getElementById('kidScreen'), q, this.config);
			this.renderer.render();
		},
		finish: function () {
			var self = this;
			this.stopTimer();
			document.getElementById('kidProgress').hidden = true;
			this.screen('<div class="kid-card"><h2>Counting your stars… ⭐</h2><p class="hint">One moment!</p></div>');
			var totalPoints = (this.game.questions || []).reduce(function (s, q) { return s + (Number(q.points) || 1); }, 0);
			var clientStars = totalPoints === 0 ? 0 : ((this.score / totalPoints) * 100 >= 90 ? 3 : (this.score / totalPoints) * 100 >= 70 ? 2 : (this.score / totalPoints) * 100 >= 50 ? 1 : 0);
			fetch(API + '/play/session/' + encodeURIComponent(this.sessionId), {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					answers_json: JSON.stringify(this.answers),
					score: this.score,
					stars: clientStars,
					completed: true,
					championship_id: this.championshipFromUrl() || undefined,
					// Math Quest hint (server re-validates against the answers)
					level_id: (window.MathQuestUI && window.MathQuestUI.currentLevelId
						&& window.MathQuestUI.currentLevelId()) || undefined,
				}),
		}).then(function (r) { return r.json(); })
			.then(function (res) {
				// Math Quest: mark the response as the server-verified payload
				// so the quest results screen can distinguish it from the
				// offline fallback (which skips this tagging).
				if (res) res.mq_verified = true;
				self.results(res);
			})
			.catch(function () { self.results({ score: self.score, stars: clientStars, totalPoints: totalPoints, percent: 0 }); });
		},
		results: function (res) {
			// Math Quest (guarded): deck out the results screen in quest art
			// and give the kid a way back to the adventure map — EXCEPT
			// championship runs, which keep the platform's original results.
			if (this.game && this.game.game_type === 'math-quest' && window.MathQuestUI && !this.championshipFromUrl()) {
				window.MathQuestUI.showResults(this, res);
				return;
			}
			var stars = Number(res.stars) || 0;
			var total = (this.game.questions || []).length;
			// Score is in POINTS, questions are in COUNT: they only coincide
			// when every question is worth 1. Use the server's total when it
			// sent one, and fall back to summing the deck locally.
			var totalPoints = Number(res.totalPoints) || (this.game.questions || []).reduce(function (s, q) { return s + (Number(q.points) || 1); }, 0);
			MascotManager.set('celebrate');
			SoundManager.play('celebration');
			this.starsRain(60);
			var badge = stars >= 3 ? 'star-master' : 'finish';
			var self = this;
			var earned = Number(res.score) || 0;
			var pct = totalPoints ? Math.min(100, Math.round((earned / totalPoints) * 100)) : 0;
			var html = '<div class="kid-card kid-win">' +
				'<div class="kid-win-glow" aria-hidden="true"></div>' +
				'<div class="kid-win-medal" aria-hidden="true">🏅</div>' +
				'<p class="kid-win-kicker">Quest complete!</p>' +
				'<h2 class="kid-win-title">Well done, ' + escapeHtml(this.player.name) + '!</h2>' +
				'<div class="kid-stars-big kid-win-stars" role="img" aria-label="' + stars + ' of 3 stars">' +
					[0, 1, 2].map(function (i) {
						return '<span class="' + (i < stars ? 'lit pop' : 'dim') + '" style="--pop-i:' + i + '">⭐</span>';
					}).join('') +
				'</div>' +
				'<div class="kid-win-score">' +
					'<svg class="kid-win-ring" viewBox="0 0 96 96" role="img" aria-label="Accuracy ' + pct + ' percent">' +
						'<defs><linearGradient id="kidRingGrad" x1="0" y1="0" x2="1" y2="1">' +
							'<stop offset="0%" style="stop-color:var(--kid-primary, #6d28d9)"/>' +
							'<stop offset="100%" style="stop-color:var(--kid-primary-2, #4f46e5)"/>' +
						'</linearGradient></defs>' +
						'<circle class="kid-win-ring-track" cx="48" cy="48" r="40"/>' +
						'<circle class="kid-win-ring-fill" cx="48" cy="48" r="40" style="--kid-ring:' + Math.min(100, pct) + '"/>' +
					'</svg>' +
					'<div class="kid-win-pct"><b>' + pct + '%</b></div>' +
				'</div>' +
				'<p class="kid-win-caption">Score: <b>' + earned + '</b> / ' + totalPoints + ' points' +
					(total !== totalPoints ? ' · ' + total + ' question' + (total === 1 ? '' : 's') : '') + '</p>' +
				championshipPodium(res) +
				'<img class="kid-badge" id="kidBadge" alt="Badge" style="display:none" />' +
				'<div class="kid-win-actions">' +
					'<button class="kid-btn green kid-win-cta" id="kidAgain">Play Again 🔁</button>' +
					'<a class="kid-btn ghost" href="/kids/">New PIN</a>' +
				'</div></div>';
			this.screen(html);
			probeImage(badgeSources('finish')).then(function () { /* warm cache */ });
			probeImage(badgeSources(badge)).then(function (src) {
				var img = document.getElementById('kidBadge');
				if (img && src) { img.src = src; img.style.display = 'block'; }
			});
			document.getElementById('kidAgain').addEventListener('click', function () {
				if (self.config.allow_replay === false) {
					self.screen('<div class="kid-card"><h2>Thanks for playing! 🌈</h2><p class="hint">Ask your teacher for a new game.</p><a class="kid-btn" href="/kids/">Back</a></div>');
					return;
				}
				self.index = 0; self.answers = []; self.score = 0;
				self.createSession();
			});
			/** The champion's card on the results screen: what this run was
			 * worth, where it put the kid, and who they are chasing. Built
			 * from `res.championship`, which the server only sends when the
			 * run actually counted. */
			function championshipPodium(res) {
				var ch = res.championship;
				var runId = self.championshipFromUrl();
				var back = '/kids/championship?id=' + encodeURIComponent(runId || '');
				// A championship run the server refused to record has to say so:
				// silence looks exactly like a lost score to a nine-year-old.
				if (!ch || !ch.recorded) {
					if (!runId) return '';
					return '<div class="kid-champ-podium missed">' +
						'<div class="kid-podium-head"><span aria-hidden="true">🎗️</span><b>Not counted this time</b></div>' +
						'<p class="kid-podium-line">Your stars are saved! ⭐ Ask your teacher to check the championship.</p>' +
						'<a class="kid-btn ghost" href="' + escapeHtml(back) + '">Back to Championship 🏆</a></div>';
				}
				var my = ch.my || null;
				var board = Array.isArray(ch.leaderboard) ? ch.leaderboard : [];
				var rank = my ? Number(my.rank) || 0 : 0;
				var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎖️';
				var players = board.length || (my ? 1 : 0);
				var champName = (self.champInfo && self.champInfo.name) || ch.name || '';
				var line = rank === 1
					? '<b>You are #1 — champion of ' + (champName ? escapeHtml(champName) : 'the championship') + '! 🏆</b>'
					: rank
						? 'You are <b>#' + rank + '</b> of ' + players + ' player' + (players === 1 ? '' : 's') + ' ' + medal
						: 'Your score is on the board! ' + medal;
				// Who is just ahead, who is right behind — the whole point of a
				// championship when you are nine. Only rendered when there is
				// somebody else to compare with.
				var rows = '';
				if (rank) {
					[rank - 1, rank, rank + 1].forEach(function (r) {
						if (r < 1) return;
						var row = null;
						for (var i = 0; i < board.length; i++) {
							if (Number(board[i].rank) === r) { row = board[i]; break; }
						}
						if (!row) return;
						rows += '<div class="kid-podium-row' + (r === rank ? ' me' : '') + '">' +
							'<span class="pos">' + (r === rank ? medal : '#' + r) + '</span>' +
							'<span class="who">' + escapeHtml(r === rank ? 'You' : (row.player_name || '')) + '</span>' +
							'<span class="pts">' + (Number(row.points) || 0) + ' pts</span></div>';
					});
				}
				// Keep the hub's shortcut fresh: it shows rank + points in one tap.
				if (my && window.KidsStore && window.KidsStore.setStanding) {
					window.KidsStore.setStanding(my.rank, my.points);
				}
				return '<div class="kid-champ-podium">' +
					'<div class="kid-podium-head"><span aria-hidden="true">🏆</span><b>+' + (Number(ch.points) || 0) + ' pts</b>' +
						(ch.improved ? '<span class="kid-podium-best">your best yet! 🎉</span>' : '') + '</div>' +
					'<p class="kid-podium-line">' + line + '</p>' +
					(rows ? '<div class="kid-podium-rows">' + rows + '</div>' : '') +
					'<div class="kid-podium-actions">' +
						'<a class="kid-btn" href="' + escapeHtml(back) + '">Back to Championship 🏆</a>' +
						'<a class="kid-btn ghost" href="/kids/">More games 🎮</a>' +
					'</div></div>';
			}
		},
		/**
		 * Kid-friendly nudge toast for "do something first" hints (pick an
		 * option, connect every pair…). Bouncy, auto-dismissing, with a soft
		 * blip — much harder to miss than static helper text.
		 */
		nudge: function (text, icon) {
			var self = this;
			var toast = document.getElementById('kidToast');
			if (!toast) {
				toast = document.createElement('div');
				toast.className = 'kid-toast';
				toast.id = 'kidToast';
				toast.setAttribute('role', 'status');
				document.body.appendChild(toast);
			}
			toast.innerHTML = '<span class="kid-toast-emoji"></span>' +
				'<span class="kid-toast-text"></span>';
			toast.querySelector('.kid-toast-emoji').textContent = String(icon || '👆');
			toast.querySelector('.kid-toast-text').textContent = String(text || '');
			toast.classList.remove('show');
			// Force reflow so re-nudges replay the spring animation.
			void toast.offsetWidth;
			toast.classList.add('show');
			try { SoundManager.play('hint'); } catch (_) { /* silent */ }
			if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
			this.nudgeTimer = setTimeout(function () {
				toast.classList.remove('show');
				self.nudgeTimer = null;
			}, 1900);
		},
		starsRain: function (n) {
			var rain = document.getElementById('kidStarsRain');
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
		},
	};

	/* Expose helpers to renderers. Merge into any existing registry instead
	   of overwriting it, so script order can never wipe registrations. */
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.engine = engine;
	window.KidsPlayer.options = kidOptions;
	window.KidsPlayer.pairs = kidPairs;
	window.KidsPlayer.shuffle = shuffle;
	window.KidsPlayer.check = clientCheck;
	window.KidsPlayer.colors = BUBBLE_COLORS;
	window.KidsPlayer.sound = SoundManager;
	window.KidsPlayer.mascot = MascotManager;
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsGameRenderers = window.KidsPlayer.renderers;
	window.KidsPlayerEngine = engine;

	document.addEventListener('DOMContentLoaded', function () { engine.init(); });
})();

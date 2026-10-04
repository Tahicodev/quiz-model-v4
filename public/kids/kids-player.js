/**
 * kids-player.js — KidsPlayerEngine (plan §4 + §12).
 *
 * No login: PIN → welcome (name + avatar) → one renderer per question →
 * results. Answer formats follow plan §12; the server re-checks
 * authoritatively, the client check is only for instant feedback.
 */
(function () {
	'use strict';

	var API = '/api/v1/kids';
	var AVATARS = ['🦊', '🐸', '🐵', '🐼', '🦁', '🐯', '🐨', '🐷', '🐰', '🐙'];
	var BUBBLE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
	var THEME_FALLBACK = {
		jungle: 'linear-gradient(135deg,#166534,#4ade80)', space: 'linear-gradient(135deg,#0f172a,#7c3aed)',
		ocean: 'linear-gradient(135deg,#0c4a6e,#38bdf8)', farm: 'linear-gradient(135deg,#65a30d,#fef08a)',
		castle: 'linear-gradient(135deg,#4c1d95,#c4b5fd)', dinosaur: 'linear-gradient(135deg,#14532d,#a3e635)',
		forest: 'linear-gradient(135deg,#052e16,#34d399)', city: 'linear-gradient(135deg,#1e3a8a,#93c5fd)',
		circus: 'linear-gradient(135deg,#9a3412,#fbbf24)', magic: 'linear-gradient(135deg,#581c87,#f0abfc)',
		school: 'linear-gradient(135deg,#0f766e,#99f6e0)', superhero: 'linear-gradient(135deg,#b91c1c,#fca5a5)',
	};
	var MASCOT_EMOJI = { idle: '🦊', happy: '😄', encourage: '💪', excited: '🤩', amazed: '😲', celebrate: '🎉' };

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
			var soundBtn = document.getElementById('kidSoundBtn');
			if (soundBtn) soundBtn.addEventListener('click', function () {
				var muted = SoundManager.toggle();
				soundBtn.textContent = muted ? '🔇' : '🔊';
			});
			if (!this.pin) {
				this.screen('<div class="kid-card"><h2>Oops! 😅</h2><p class="hint">No game PIN found.</p><a class="kid-btn" href="/kids/">Back</a></div>');
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
		screen: function (html) {
			document.getElementById('kidScreen').innerHTML = html;
		},
		applyTheme: function () {
			var theme = (this.game && this.game.theme) || 'jungle';
			probeImage(themeBackgrounds(theme)).then(function (src) {
				document.body.style.background = src
					? 'url("' + src + '") center/cover no-repeat fixed'
					: (THEME_FALLBACK[theme] || THEME_FALLBACK.jungle);
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
					self.welcome();
				})
				.catch(function () {
					self.screen('<div class="kid-card"><h2>Game not found 😢</h2><p class="hint">Check the PIN with your teacher.</p><a class="kid-btn" href="/kids/">Try again</a></div>');
				});
		},
		welcome: function () {
			var self = this;
			var n = (this.game.questions || []).length;
			var html = '<div class="kid-card"><h2>Hi! 👋</h2>' +
				'<p class="hint">This game has <b>' + n + '</b> question' + (n === 1 ? '' : 's') + '. What is your first name?</p>' +
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
				self.player = { name: name, avatar: chosen };
				self.createSession();
			};
			document.getElementById('kidStart').addEventListener('click', start);
			document.getElementById('kidName').addEventListener('keydown', function (e) { if (e.key === 'Enter') start(); });
		},
		createSession: function () {
			var self = this;
			this.screen('<div class="kid-card"><h2>Get ready… 🚀</h2><p class="hint">Starting your adventure!</p></div>');
			fetch(API + '/play/' + encodeURIComponent(this.pin) + '/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ player_name: this.player.name, avatar: this.player.avatar }),
			}).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
				.then(function (res) {
					if (!res.ok) throw new Error((res.j && res.j.message) || 'Could not start');
					self.sessionId = res.j.session.id;
					self.index = 0;
					self.answers = [];
					self.score = 0;
					document.getElementById('kidProgress').hidden = false;
					self.next();
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
			var fb = document.getElementById('kidFeedback');
			if (timedOut) {
				if (fb) { fb.textContent = "Time's up! The answer glows below ⏰"; fb.className = 'kid-feedback bad'; }
				MascotManager.set('encourage');
				SoundManager.play('retry');
			} else if (correct) {
				if (fb) { fb.textContent = ['Bravo! 🎉', 'Awesome! ⭐', 'Super! 🌈'][Math.floor(Math.random() * 3)]; fb.className = 'kid-feedback good'; }
				MascotManager.set(this.score >= 3 ? 'excited' : 'happy');
				SoundManager.play('correct');
				this.starsRain(24);
			} else {
				if (fb) { fb.textContent = 'Good try! Look at the glowing answer 💡'; fb.className = 'kid-feedback bad'; }
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
				'magic-words': 'magic-words', 'code-explorer': 'code-explorer',
			};
			var key = map[this.game.game_type] || 'bubble-pop';
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
				body: JSON.stringify({ answers_json: JSON.stringify(this.answers), score: this.score, stars: clientStars, completed: true }),
			}).then(function (r) { return r.json(); })
				.then(function (res) { self.results(res); })
				.catch(function () { self.results({ score: self.score, stars: clientStars, totalPoints: totalPoints, percent: 0 }); });
		},
		results: function (res) {
			var stars = Number(res.stars) || 0;
			var total = (this.game.questions || []).length;
			MascotManager.set('celebrate');
			SoundManager.play('celebration');
			this.starsRain(60);
			var badge = stars >= 3 ? 'star-master' : 'finish';
			var self = this;
			var html = '<div class="kid-card"><h2>Well done, ' + escapeName(this.player.name) + '! 🎉</h2>' +
				'<div class="kid-stars-big">' + [0, 1, 2].map(function (i) {
					return '<span class="' + (i < stars ? 'lit' : 'dim') + '">⭐</span>';
				}).join('') + '</div>' +
				'<p class="hint">Score: <b>' + res.score + '</b> / ' + total + ' questions</p>' +
				'<img class="kid-badge" id="kidBadge" alt="Badge" style="display:none" />' +
				'<div><button class="kid-btn green" id="kidAgain">Play Again 🔁</button> ' +
				'<a class="kid-btn" href="/kids/">New PIN</a></div></div>';
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
			function escapeName(s) {
				return String(s).replace(/[&<>"']/g, function (c) {
					return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
				});
			}
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

/**
 * MathQuestGame.js — the Math Quest kids game (stage 2: multi-level quests).
 *
 * MUST be loaded AFTER kids-player.js and the existing renderers: the quiz
 * phase DELEGATES every question to the existing renderer for that question
 * type (bubble-pop for single MCQ), so answer evaluation, timers, feedback,
 * session lifecycle and server-side grading stay 100% the platform's own.
 * Math Quest owns: the adventure map (locked → playable ✔ best stars), the
 * per-level scoped quiz (engine.question list is the LEVEL's questions), and
 * a quest-flavored results screen fed ONLY by server-verified PATCH replies.
 *
 * Progress: the platform shell requires login, so map progress is loaded
 * from GET /kids/games/:id/quest-progress (server-computed unlock chain over
 * KidQuestProgress rows — stars written ONLY by the server after re-grading).
 * Anonymous PIN play has no progress rows here; the map stays session-only.
 * Championship challenge runs (championshipFromUrl) bypass the map so the
 * whole game plays as one run, exactly like every other kids game.
 *
 * Pure logic lives in math-quest-core.js; this file owns DOM only.
 */
(function () {
	'use strict';
	var CORE = window.MathQuestCore;

	/* ── tiny escaping + asset probing helpers (same convention as shell) ── */
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function probe(url) {
		return new Promise(function (resolve) {
			try {
				var img = new Image();
				img.onload = function () { resolve(url); };
				img.onerror = function () { resolve(null); };
				img.src = url;
			} catch (_) { resolve(null); }
		});
	}
	/** Only assigns an <img> when the URL actually loads; otherwise the
	 * placeholder (CSS gradient/emoji) that already rendered stays. */
	function setImg(selector, url) {
		var img = document.querySelector(selector);
		if (!img || !url) return;
		probe(url).then(function (src) {
			if (img && src) img.src = src;
		});
	}

	/* ════════════════ State (per page load, in-session only) ═════════════ */
	var ui = {
		screen: CORE.SCREENS.MAP,
		sessionStarted: false,
		processing: false,
		pendingLevelIndex: null,
		levelCount: 1,
		levelIndex: 0,
		completed: [null],   // best stars per level this session (transient)
		data: null,          // last run data {score, stars, verified}
		lastLevels: [],      // normalized plan (full question list era)
		fullQuestions: null, // whole-game payload saved while a level runs
		serverProgress: null, // authoritative rows from quest-progress GET
		champMode: false,    // championship runs play the whole game, no map
		sessionSpent: false, // boot session consumed → next pick mints a new one
	};
	function state() { return ui; }
	function dispatch(event, payload) {
		if (payload) ui.data = Object.assign({}, ui.data || {}, payload);
		return Object.assign(ui, CORE.next(ui, event));
	}
	function bestStars(idx, stars) {
		var prev = Number(ui.completed[idx]) || 0;
		ui.completed[idx] = Math.max(prev, Math.max(0, Math.min(3, Number(stars) || 0)));
	}
	/** Stars shown on the map: server rows first, the current session's
	 * verified completions layered on top (right after a fresh run). */
	function displayedStars(level) {
		var server = 0;
		if (ui.serverProgress && Array.isArray(ui.serverProgress.levels)) {
			for (var i = 0; i < ui.serverProgress.levels.length; i++) {
				if (ui.serverProgress.levels[i].id === level.id) {
					server = Number(ui.serverProgress.levels[i].best_stars) || 0;
					break;
				}
			}
		}
		return Math.max(server, Number(ui.completed[level.index]) || 0);
	}
	/** Client preview of the unlock chain — replaced by the authoritative
	 * server response once the progress GET answers (best-effort UI). */
	function localProgress(levels) {
		var best = {};
		levels.forEach(function (lv) {
			var s = Number(ui.completed[lv.index]) || 0;
			var srv = 0;
			if (ui.serverProgress && Array.isArray(ui.serverProgress.levels)) {
				for (var i = 0; i < ui.serverProgress.levels.length; i++) {
					if (ui.serverProgress.levels[i].id === lv.id) { srv = Number(ui.serverProgress.levels[i].best_stars) || 0; break; }
				}
			}
			best[lv.id] = Math.max(s, srv);
		});
		return CORE.computeProgress(levels, best);
	}

	/* ── level question scoping (engine list = the level's questions) ───── */
	function levelQuestions(engine, level) {
		var qs = engine.game && engine.game.questions || [];
		var allowed = {};
		(level.questionIds || []).forEach(function (id) { allowed[String(id)] = true; });
		var scoped = qs.filter(function (q) { return allowed[String(q.id)]; });
		return scoped.length ? scoped : qs;
	}
	function rememberFullQuestions(engine) {
		if (ui.fullQuestions === null && engine.game) ui.fullQuestions = engine.game.questions || [];
	}
	function restoreFullQuestions(engine) {
		if (ui.fullQuestions !== null && engine.game) engine.game.questions = ui.fullQuestions;
	}

	/* ── progress fetch (best-effort; never blocks the map from drawing) ── */
	var KIDS_API = '/api/v1'; // same root the shell uses
	function fetchProgress(engine) {
		if (!engine || !engine.validStoredToken || !engine.game) return;
		var token = engine.validStoredToken();
		if (!token) return;
		try {
			fetch(KIDS_API + '/games/' + encodeURIComponent(engine.game.id) + '/quest-progress', {
				method: 'GET',
				headers: { 'Authorization': 'Bearer ' + token },
			}).then(function (r) { return r.json(); })
				.then(function (body) {
					if (!body || !Array.isArray(body.levels)) return;
					ui.serverProgress = body;
					if (ui.screen === CORE.SCREENS.MAP) rerenderMap(engine);
				})
				.catch(function () { /* offline map keeps session-only stars */ });
		} catch (_) { /* never break the map */ }
	}

	/* ════════════════ Single-scene chrome (Math Quest only) ═════════════ */
	/** Math Quest replaces the shell's big header with ONE compact header
	 * (player info + sound control). The shell's header element stays in the
	 * DOM (mascot/sound logic keep working) — it is only hidden while Math
	 * Quest runs, and only for math-quest play pages. */
	function activateMqChrome(engine) {
		var wrap = document.querySelector('.kid-wrap');
		if (!wrap) return;
		// Reset previous MQ classes before re-applying (defensive re-entry).
		wrap.classList.remove('mq-header-ready', 'mq-map-mode', 'mq-quiz-mode');
		var header = wrap.querySelector('.mq-header');
		if (!header) {
			header = document.createElement('div');
			header.className = 'mq-header';
			header.setAttribute('role', 'banner');
			header.innerHTML =
				'<span class="mq-player" title="Signed-in player">' +
					'<span class="mq-player-avatar" aria-hidden="true">🦖</span>' +
					'<span class="mq-player-name">Explorer</span>' +
				'</span>' +
				'<span class="mq-title"></span>' +
				'<button type="button" class="mq-sound" aria-label="Toggle sound">🔊</button>';
			// One source of truth for sound: mirror the shell's own toggle.
			var snd = header.querySelector('.mq-sound');
			snd.addEventListener('click', function () {
				var real = document.getElementById('kidSoundBtn');
				if (real) real.click();
			});
			wrap.insertBefore(header, wrap.firstChild);
		}
		// Player info may settle AFTER the first map render (welcome flow) —
		// refresh it on every activation instead of freezing the boot value.
		var nameEl = header.querySelector('.mq-player-name');
		var avEl = header.querySelector('.mq-player-avatar');
		if (nameEl) nameEl.textContent = engine.player.name || 'Explorer';
		if (avEl) avEl.textContent = engine.player.avatar || '🦖';
		wrap.classList.add('mq-header-ready');
	}
	function setMqHeader(text) {
		var el = document.querySelector('.kid-wrap .mq-header .mq-title');
		if (el) el.textContent = String(text || '');
	}
	function sceneMode(mode) { // 'map' | 'quiz' | null
		var wrap = document.querySelector('.kid-wrap');
		if (!wrap) return;
		wrap.classList.remove('mq-map-mode', 'mq-quiz-mode');
		if (mode === 'map') wrap.classList.add('mq-map-mode');
		else if (mode === 'quiz') wrap.classList.add('mq-quiz-mode');
	}

	/* ════════════════ MAP SCREEN ════════════════════════════════════════ */
	function plan(engine) {
		return CORE.planLevels(engine.config, engine.game.questions || []);
	}

	function showMap(engine) {
		if (ui.screen === CORE.SCREENS.QUIZ) return; // never show the map mid-quiz
		if (ui.champMode) return; // championship runs keep the plain platform look
		activateMqChrome(engine);
		sceneMode('map'); // ONE dominant scene: adventure landscape on the wrap itself
		setMqHeader((engine.game && engine.game.name) || 'Math Quest');
		restoreFullQuestions(engine);
		var levels = plan(engine);
		ui.levelCount = Math.max(1, levels.length);
		ui.lastLevels = levels;
		dispatch('session-started');
		renderMap(engine, levels, localProgress(levels));
		fetchProgress(engine);
	}
	function rerenderMap(engine) {
		if (ui.screen !== CORE.SCREENS.MAP) return;
		var levels = ui.lastLevels.length ? ui.lastLevels : plan(engine);
		ui.levelCount = Math.max(1, levels.length);
		renderMap(engine, levels, ui.serverProgress ? (function () {
			// authoritative unlock chain over the server rows, current-run
			// verified completions layered on top
			var best = {};
			ui.serverProgress.levels.forEach(function (row) { best[row.id] = Number(row.best_stars) || 0; });
			levels.forEach(function (lv) {
				var s = Number(ui.completed[lv.index]) || 0;
				best[lv.id] = Math.max(best[lv.id] || 0, s);
			});
			return CORE.computeProgress(levels, best);
		})() : localProgress(levels));
	}

	var THUMB_FOR_ART = {
		home: 'levelHome', treasure: 'levelTreasure',
		temple: 'levelTemple', sunset: 'levelSunset',
	};

	function renderMap(engine, levels, progress) {
		try { document.getElementById('kidProgress').hidden = true; } catch (_) { }
		var cards = levels.map(function (lv) {
			var idx = lv.index;
			var p = (progress && progress[idx]) || { unlocked: idx === 0, bestStars: 0, passed: false };
			var unlocked = !!p.unlocked;
			var stars = displayedStars(lv);
			var done = stars > 0;
			var stateCls = !unlocked ? 'mq-locked' : (done ? 'mq-done' : 'mq-ready');
			var starHtml = '';
			for (var s = 0; s < 3; s++) {
				starHtml += '<span class="mq-star' + (s < stars ? ' lit' : '') + '">' + (s < stars ? '⭐' : '☆') + '</span>';
			}
			var cta = !unlocked ? 'Locked 🔒' : (done ? 'Play again 🔁' : 'Start ▶');
			var meta = !unlocked
				? 'Pass level ' + idx + ' with ' + lv.thresholdStars + ' star(s) to unlock'
				: esc(String(lv.questionIds.length) + ' questions');
			var artKey = THUMB_FOR_ART[lv.art] || 'levelHome';
			return (
				'<div class="mq-level-node ' + stateCls + '" data-level="' + idx + '" role="listitem">' +
					'<span class="mq-node-thumb" aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-node-gate" aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-node-lock" aria-hidden="true">🔒</span>' +
					'<div class="mq-node-body">' +
						'<h3 class="mq-node-name">' + esc(lv.name) + '</h3>' +
						'<p class="mq-node-meta">' + meta + '</p>' +
						'<span class="mq-stars-big" title="Best stars on this level">' + starHtml + '</span>' +
					'</div>' +
					'<button class="mq-node-btn" data-art="' + artKey + '" ' + (unlocked ? '' : 'disabled aria-disabled="true"') + ' type="button">' + cta + '</button>' +
				'</div>'
			);
		}).join('');

		engine.screen(
			// No scene of its own: the adventure landscape lives on the wrap —
			// characters, props and UI layer directly over it.
			'<div class="mq-map" role="region" aria-label="Adventure map">' +
				'<div class="mq-map-sign" role="heading" aria-level="2">' +
					'<p class="mq-map-hello">Ready, ' + esc(engine.player.name || 'explorer') + '? 🗺️</p>' +
					'<h2>Pick a level and let the quest begin!</h2>' +
				'</div>' +
				'<div class="mq-level-list mq-trail" role="list">' + cards + '</div>' +
				'<img class="mq-prop mq-prop-palm" src="" alt="" aria-hidden="true" />' +
				'<img class="mq-prop mq-prop-rock" src="" alt="" aria-hidden="true" />' +
				'<img class="mq-map-dino" src="" alt="Dino mascot waiting on the trail" />' +
			'</div>'
		);
		setImg('.mq-map-dino', CORE.ASSETS.dinoIdle);
		setImg('.mq-prop-palm', CORE.ASSETS.palm);
		setImg('.mq-prop-rock', CORE.ASSETS.rock);
		Array.prototype.forEach.call(document.querySelectorAll('.mq-level-node'), function (node) {
			if (node.classList.contains('mq-locked')) return;
			var btn = node.querySelector('.mq-node-btn');
			var artKey = (btn && btn.dataset.art) || 'levelHome';
			var thumb = node.querySelector('.mq-node-thumb img');
			var gate = node.querySelector('.mq-node-gate img');
			if (thumb && CORE.ASSETS[artKey]) probe(CORE.ASSETS[artKey]).then(function (src) { if (thumb && src) thumb.src = src; });
			if (gate) probe(CORE.ASSETS.gate).then(function (src) { if (gate && src) gate.src = src; });
		});

		// Playable = every UNLOCKED level (lock chain honors thresholds).
		Array.prototype.forEach.call(document.querySelectorAll('.mq-level-node'), function (node) {
			if (node.classList.contains('mq-locked')) return;
			var btn = node.querySelector('.mq-node-btn');
			if (!btn) return;
			btn.addEventListener('click', function () {
				var idx = Number(node.dataset.level) || 0;
				var lv = ui.lastLevels[idx];
				if (!lv) return;
				if (ui.screen !== CORE.SCREENS.MAP || ui.processing) return;
				if (!dispatch('level-picked').processing) return; // machine must accept
				ui.pendingLevelIndex = idx;
				rememberFullQuestions(engine);      // save the whole-game list
				engine.game.questions = levelQuestions(engine, lv);
				engine.index = 0;                    // the level is its own run
				engine.answers = [];
				engine.score = 0;
				engine.locked = false;
				if (engine.sessionId && !ui.sessionSpent) {
					// First run: reuse the session the shell minted at boot —
					// one attempt = one session, no orphan rows.
					beginLevelRun(engine);
					return;
				}
				// Any later run needs a FRESH session (a completed session can
				// never be graded twice — the server refuses double-completion).
				engine.sessionId = null;
				engine.createSession();
			});
		});
	}

	/* ════════════════ SESSION-START HOOK (called by kids-player.js) ═════ */
	function afterSessionStart(engine) {
		if (engine.championshipFromUrl && engine.championshipFromUrl()) {
			// Championship challenges play the WHOLE game like every other
			// kids game (no map, no per-level scoping, original results).
			ui.champMode = true;
			rememberFullQuestions(engine);
			engine.index = 0;
			engine.answers = [];
			engine.score = 0;
			engine.next();
			return;
		}
		if (ui.pendingLevelIndex == null) {
			showMap(engine); // fresh load → show adventure map
			return;
		}
		beginLevelRun(engine);
	}

	/** Level-picked + session-started converge here; both end in the quiz. */
	function beginLevelRun(engine) {
		var idx = ui.pendingLevelIndex;
		if (idx == null) { showMap(engine); return; }
		ui.pendingLevelIndex = null;
		ui.levelIndex = Math.max(0, Math.min(idx, ui.levelCount - 1)); // results star overlay targets this level
		dispatch('session-started', { levelIndex: idx }); // MAP → QUIZ
		if (ui.screen !== CORE.SCREENS.QUIZ) { showMap(engine); return; }
		sessionReady(engine);
	}

	function sessionReady(engine) {
		if (ui.screen !== CORE.SCREENS.QUIZ) return;
		ui.levelIndex = Math.max(0, Math.min(ui.levelIndex, Math.max(0, ui.levelCount - 1)));
		// Focused quiz: leave the adventure scene (no map behind the questions)
		// but keep Math Quest's compact header — the level name tells the kid
		// exactly where on the quest they are.
		sceneMode('quiz');
		var lv = (ui.lastLevels || [])[ui.levelIndex];
		setMqHeader(lv ? 'Level ' + (ui.levelIndex + 1) + ' — ' + lv.name : 'Quiz');
		try { document.getElementById('kidProgress').hidden = false; } catch (_) { }
		engine.index = Math.max(0, Math.min(engine.index, Math.max(0, (engine.game.questions || []).length - 1)));
		engine.next();
	}

	/* ════════════════ RESULTS (server-verified data only) ═══════════════ */
	function showResults(engine, res) {
		if (ui.champMode) {
			// Championship safety net: reroute to the platform's OWN results
			// screen (the shell guard normally prevents this call entirely).
			engine.results(res);
			return;
		}
		res = res || {};
		var payload = { score: Number(res.score) || 0, stars: Number(res.stars) || 0, verified: res.mq_verified === true };
		// The pure machine treats 'level-complete' (verified) and 'level-failed'
		// (degraded/offline completion) as distinct terminal events.
		dispatch(payload.verified ? 'level-complete' : 'level-failed', payload);
		if (payload.verified && res.quest && res.quest.level_id) {
			// Map the server's level id back onto our plan index so the map's
			// in-session star overlay is right until the authoritative GET.
			var match = (ui.lastLevels || []).some(function (lv, i) {
				if (lv.id === res.quest.level_id) { ui.levelIndex = i; return true; }
				return false;
			});
			if (!match) ui.levelIndex = 0;
		}
		// Drain the boot session: the NEXT level pick must mint a fresh one.
		ui.sessionSpent = true;
		bestStars(ui.levelIndex, payload.stars);
		renderResults(engine, ui, ui.levelIndex);
	}

	function renderResults(engine, st, levelIdx) {
		// Results live IN the adventure scene (the landscape persists behind
		// the card) — they are never a second, complete game screen.
		sceneMode('map');
		setMqHeader((engine.game && engine.game.name) || 'Math Quest');
		var levels = (st.lastLevels && st.lastLevels.length) ? st.lastLevels : plan(engine);
		var lv = levels[levelIdx] || levels[0];
		var stars = Number(st.data && st.data.stars) || 0;
		var score = Number(st.data && st.data.score) || 0;
		var verified = !!st.data && Boolean(st.data.verified);
		var total = (engine.game.questions || []).length;
		var starHtml = '';
		for (var s = 0; s < 3; s++) {
			starHtml += '<span class="mq-star' + (s < stars ? ' lit' : '') + '">' + (s < stars ? '⭐' : '☆') + '</span>';
		}
		var coins = CORE.coinsForStars(stars);
		var coinHtml = '';
		for (var c = 0; c < 3; c++) {
			coinHtml += '<span class="mq-coin' + (c < coins ? ' lit' : '') + '"></span>';
		}
		var mood = stars >= 3 ? 'dinoCelebrate' : (stars === 0 ? 'dinoEncourage' : 'dinoIdle');
		var thresholdLine = '';
		if (verified && lv && lv.thresholdStars && stars < lv.thresholdStars && levels[levelIdx + 1]) {
			thresholdLine = '<p class="hint">Next level unlocks at ' + lv.thresholdStars + ' star(s) — try again 🔁</p>';
		}
		engine.screen(
			'<div class="mq-results" role="region" aria-label="Level results">' +
				'<div class="mq-card mq-result-card">' +
					'<h2>' + esc(lv && lv.name || 'Level') + ' — ' + esc(String(score)) + ' / ' + esc(String(total)) + ' correct</h2>' +
					'<div class="mq-stars-big" aria-label="' + stars + ' of 3 stars">' + starHtml + '</div>' +
					'<div class="mq-coins-big" title="Cosmetic treasure only — coins are not saved">' + coinHtml + '</div>' +
					'<p class="hint">' + (verified ? 'Score &amp; stars confirmed on the server ✔' : 'Offline — showing your in-session score') + '</p>' +
					thresholdLine +
					'<div class="mq-results-actions">' +
						'<button class="kid-btn green" id="mqBackToMap" type="button">Back to the map 🗺️</button>' +
					'</div>' +
				'</div>' +
				'<img class="mq-prop mq-prop-chest" src="" alt="Treasure chest with your reward" />' +
				(stars >= 3 ? '<img class="mq-prop mq-prop-trophy" src="" alt="Trophy reward" />' : '') +
				(stars > 0 ? '<img class="mq-prop mq-confetti-art" src="" alt="" aria-hidden="true" />' : '') +
				'<img class="mq-result-dino" src="" alt="Dino mascot' + (stars >= 3 ? ' celebrating' : ' cheering you on') + '" />' +
			'</div>'
		);
		try { document.getElementById('kidProgress').hidden = true; } catch (_) { }
		try { window.KidsPlayer.sound.play('celebration'); } catch (_) { }
		try { window.KidsPlayer.engine.starsRain(40); } catch (_) { }
		setImg('.mq-prop-chest', CORE.ASSETS.chest);
		setImg('.mq-prop-trophy', CORE.ASSETS.trophy);
		setImg('.mq-confetti-art', CORE.ASSETS.confetti);
		var dino = document.querySelector('.mq-result-dino');
		if (dino) probe(CORE.ASSETS[mood]).then(function (src) { if (dino && src) dino.src = src; });
		probe(CORE.ASSETS.coin).then(function (src) {
			if (!src) return;
			var box = document.querySelector('.mq-coins-big');
			if (!box) return;
			box.classList.add('mq-coin-art');
			Array.prototype.slice.call(box.querySelectorAll('.mq-coin.lit')).forEach(function (el) {
				var img = document.createElement('img');
				img.className = 'mq-coin-art-img';
				img.src = src;
				img.alt = '';
				el.replaceWith(img);
			});
		});
		var btn = document.getElementById('mqBackToMap');
		if (btn) btn.addEventListener('click', function () {
			dispatch('back-to-map');
			showMap(engine);
		});
	}

	/* ════════════════ QUIZ — delegate to the platform's pipeline ════════ */
	function MathQuestGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.childKey = CORE.delegateKey(question);
		var delegated = window.KidsGameRenderers || {};
		this.child = null;
		var Ctor = delegated[this.childKey];
		if (Ctor) this.child = new Ctor(engine, root, question, config);
	}
	MathQuestGame.prototype.render = function () {
		if (this.child) { this.child.render(); return; }
		// Delegate unavailable: plain readable fallback so the kid can still play.
		var opts = (window.KidsPlayer && window.KidsPlayer.options ? window.KidsPlayer.options(this.question) : []);
		this.root.innerHTML = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<div id="mqFallbackOpts">' + opts.map(function (o, i) {
				return '<button class="kid-btn mq-fallback-opt" data-i="' + i + '" type="button">' + esc(o) + '</button> ';
			}).join('') + '</div></div>';
		var self = this;
		Array.prototype.forEach.call(document.querySelectorAll('.mq-fallback-opt'), function (b) {
			b.addEventListener('click', function () {
				var chosen = window.KidsPlayer.options(self.question)[Number(b.dataset.i) || 0];
				self.engine.answer(chosen);
			});
		});
	};
	MathQuestGame.prototype.lock = function (correct, given) {
		if (this.child && this.child.lock) { try { this.child.lock(correct, given); } catch (_) { } }
	};
	MathQuestGame.prototype.destroy = function () {
		if (this.child && this.child.destroy) { try { this.child.destroy(); } catch (_) { } }
		this.child = null;
	};

	/* ════════════════ Expose (merge, never wipe) ════════════════════════ */
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsGameRenderers = window.KidsGameRenderers || window.KidsPlayer.renderers;
	window.KidsGameRenderers['math-quest'] = MathQuestGame;
	/** server hint (optional): which level this run belongs to — the server
	 * re-checks it against the answers, never trusting the client. */
	window.MathQuestUI = {
		state: state,
		afterSessionStart: afterSessionStart,
		showResults: showResults,
		showMap: showMap,
		currentLevelId: function () {
			if (ui.champMode) return null;
			var lv = (ui.lastLevels || [])[ui.levelIndex];
			return lv ? lv.id : null;
		},
	};
})();

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

	/* Path-anchored map: the trail background (mq-adventure-trail.webp,
	 * 1536×1024) paints the walking route from the foreground stone steps
	 * (lower-left) up to the ancient temple stair (upper-right). The slots
	 * below are NORMALIZED image coordinates verified against the asset at
	 * 1:1 — centre of each gate rides the painted path. --gs shrinks the
	 * gate ART with distance (perspective); plates/buttons stay readable. */
	var TRAIL_SLOT_CHAIN = [
		{ x: .285, y: .78, gs: 1 },    // 0 · foreground stone steps (start)
		{ x: .465, y: .73, gs: .9 },   // 1 · on the lower bend
		{ x: .555, y: .66, gs: .83 },  // 2 · past the round tree
		{ x: .645, y: .575, gs: .77 }, // 3 · center-right bend
		{ x: .745, y: .475, gs: .71 }, // 4 · upper climb
		{ x: .83, y: .385, gs: .65 },  // 5 · temple approach
	];
	var TRAIL_SLOTS_FOR = {
		1: [0], 2: [0, 4], 3: [0, 3, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 3, 5],
	};
	/* Subtle dotted guide that follows the PAINTED trail (viewBox = the
	 * image's own pixel space; the stage keeps the exact 3:2 ratio, so this
	 * overlays the art without distortion). Ends at the temple stair base. */
	var TRAIL_ROUTE = [
		[400, 952], [553, 865], [699, 783], [837, 701], [975, 614],
		[1075, 548], [1144, 466], [1190, 394], [1229, 338], [1284, 282],
	];
	function trailSlots(count) {
		var fixed = TRAIL_SLOTS_FOR[count];
		if (fixed) return fixed;
		var out = [];
		for (var i = 0; i < count; i++) {
			out.push(i === 0 ? 0 : Math.min(5, Math.round(i * 5 / (count - 1))));
		}
		// duplicates (very large plans) step one gate toward the temple
		for (var j = 1; j < out.length; j++) {
			if (out[j] <= out[j - 1]) out[j] = Math.min(5, out[j - 1] + 1);
		}
		return out;
	}

	function renderMap(engine, levels, progress) {
		try { document.getElementById('kidProgress').hidden = true; } catch (_) { }
		var slots = trailSlots(Math.max(1, levels.length));
		var cards = levels.map(function (lv, i) {
			var idx = lv.index;
			var slot = TRAIL_SLOT_CHAIN[slots[i] || 0] || TRAIL_SLOT_CHAIN[0];
			var pos = ' style="left:' + Math.round(slot.x * 1000) / 10 + '%;top:' +
				Math.round(slot.y * 1000) / 10 + '%;--gs:' + slot.gs + ';"';
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
			// The gate IS the level marker (one transparent asset per node);
			// number, name, stars, lock and CTA are dynamic DOM overlays —
			// nothing is baked into the artwork.
			var artKey = THUMB_FOR_ART[lv.art] || 'levelHome';
			return (
				'<div class="mq-level-node ' + stateCls + '" data-level="' + idx + '" data-art="' + artKey + '"' + pos + ' role="listitem">' +
					// One coherent node: the gate artwork block owns the number
					// badge and the padlock (positioned ON the art), while the
					// information plate follows in normal flow — nothing leans
					// on accidental overlap.
					'<div class="mq-node-art">' +
						'<span class="mq-node-gate" aria-hidden="true"><img src="" alt="" /></span>' +
						'<span class="mq-node-lock" aria-hidden="true">🔒</span>' +
						'<span class="mq-gate-num" aria-hidden="true">' + (idx + 1) + '</span>' +
					'</div>' +
					'<div class="mq-node-plate">' +
						'<h3 class="mq-node-name">' + esc(lv.name) + '</h3>' +
						'<p class="mq-node-meta">' + meta + '</p>' +
						'<span class="mq-stars-big mq-gate-stars" title="Best stars on this level">' + starHtml + '</span>' +
						'<button class="mq-node-btn" ' + (unlocked ? '' : 'disabled aria-disabled="true"') + ' type="button">' + cta + '</button>' +
					'</div>' +
				'</div>'
			);
		}).join('');

		engine.screen(
			// The adventure landscape IS the whole kid body: the .mq-map covers
			// the page below the shell header and .mq-map-canvas is a CENTERED
			// 3:2 cover box of the 1536×1024 trail art, so the full-screen image
			// and the nodes/percentages share one coordinate space at any size.
			'<div class="mq-map" role="region" aria-label="Adventure map">' +
				'<div class="mq-map-sign" role="heading" aria-level="2">' +
					'<p class="mq-map-hello">Ready, ' + esc(engine.player.name || 'explorer') + '? 🗺️</p>' +
					'<h2>Pick a level and let the quest begin!</h2>' +
				'</div>' +
				'<div class="mq-map-canvas mq-level-list mq-trail" role="list" ' +
					'style="--level-n:' + Math.max(1, levels.length) + '">' +
					'<svg class="mq-map-route" viewBox="0 0 1536 1024" preserveAspectRatio="none" aria-hidden="true">' +
						'<polyline points="' + TRAIL_ROUTE.map(function (pt) { return pt.join(','); }).join(' ') + '" />' +
					'</svg>' +
					cards +
					'<img class="mq-map-dino" src="" alt="Dino mascot waiting by the temple path" />' +
				'</div>' +
			'</div>'
		);
		setImg('.mq-map-dino', CORE.ASSETS.dinoIdle);
		// EVERY gate gets the artwork — locked included (a greyed-open gate is
		// exactly the "locked level" metaphor; state coloring is CSS).
		Array.prototype.forEach.call(document.querySelectorAll('.mq-level-node'), function (node) {
			var gate = node.querySelector('.mq-node-gate img');
			if (gate) probe(CORE.ASSETS.gate).then(function (src) { if (gate && src) gate.src = src; });
		});

		// Playable = every UNLOCKED level (lock chain honors thresholds).
		Array.prototype.forEach.call(document.querySelectorAll('.mq-level-node'), function (node) {
			if (node.classList.contains('mq-locked')) return;
			var btn = node.querySelector('.mq-node-btn');
			if (!btn) return;
			btn.addEventListener('click', function () {
				startLevel(engine, Number(node.dataset.level) || 0);
			});
		});
		fitMapCanvas();
	}

	/* On short-wide desktops the 3:2 cover canvas towers over the map area
	 * and the CENTERED crop hides the FIRST gate's plate — including its
	 * Start ▶ button. This anchors the canvas so the bottom-anchored gates
	 * always stay on screen (the art's top sky is what yields). Desktop
	 * viewport only: ≤1079px uses the in-flow horizontal scroller. */
	function fitMapCanvas() {
		var canvas = document.querySelector('.mq-map-canvas');
		var map = canvas && canvas.parentElement;
		if (!canvas || !map) return;
		if (!window.matchMedia('(min-width: 1080px)').matches) {
			canvas.style.transform = '';
			return;
		}
		var mapH = map.clientHeight;
		var canvasR = canvas.getBoundingClientRect();
		if (!mapH || !canvasR.height) return;
		var f = 0.5; // default anchor — the CSS translate(-50%,-50%)
		var node0 = canvas.querySelector('.mq-level-node');
		if (node0) {
			var nodeBottom = node0.getBoundingClientRect().bottom - canvasR.top;
			var over = (mapH / 2 - 0.5 * canvasR.height) + nodeBottom - (mapH - 12);
			if (over > 0) f += over / canvasR.height;
			f = Math.min(0.92, Math.max(0.15, f));
		}
		canvas.style.transform = 'translate(-50%,' + (-(f * 100)).toFixed(2) + '%)';
	}
	window.addEventListener('resize', function () {
		requestAnimationFrame(fitMapCanvas);
	});

	/* ONE start routine — the map's node buttons, the results-screen "keep
	 * playing" CTAs and any future entry point share it, so every path obeys
	 * the same machine gate (level-picked accepted only from MAP) and the
	 * same one-attempt-per-session rule. Returns true when the run began. */
	function startLevel(engine, idx) {
		var lv = (ui.lastLevels || [])[idx];
		if (!lv) return false;
		if (ui.screen !== CORE.SCREENS.MAP || ui.processing) return false;
		if (!dispatch('level-picked').processing) return false; // machine must accept
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
			return true;
		}
		// Any later run needs a FRESH session (a completed session can
		// never be graded twice — the server refuses double-completion).
		engine.sessionId = null;
		engine.createSession();
		return true;
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
		/* One loud verdict banner + a DIRECT "keep playing" CTA: the kid can
		 * continue (next level unlocked) or retry (threshold not met) without
		 * going back through the map. Back-to-map stays as the calm option. */
		var passed = stars >= ((lv && lv.thresholdStars) || 1);
		var hasNext = !!(levels && levels[levelIdx + 1]);
		var bannerCls = stars >= 3 ? 'mq-perfect' : (passed ? 'mq-pass' : 'mq-retry');
		var banner = passed && !hasNext
			? 'Quest complete! Every trail beaten! 🏆'
			: (stars >= 3 ? 'Level complete! Perfect run! 🎉'
				: (stars > 0 ? 'Level complete! Well played 👏' : 'Almost there — give it another go 💪'));
		var nextIdx = ui.levelIndex + 1;
		var ctaLabel = !passed ? 'Try again 🔁' : (hasNext ? 'Continue the trail ▶' : '');
		var actionHtml = '';
		if (ctaLabel) actionHtml += '<button class="kid-btn green" id="mqNextBtn" type="button">' + ctaLabel + '</button>';
		actionHtml += '<button class="kid-btn mq-secondary" id="mqBackToMap" type="button">Back to the map 🗺️</button>';
		engine.screen(
			'<div class="mq-results" role="region" aria-label="Level results">' +
				'<div class="mq-card mq-result-card">' +
					'<div class="mq-result-banner ' + bannerCls + '" role="heading" aria-level="2">' + banner + '</div>' +
					'<h2>' + esc(lv && lv.name || 'Level') + ' — ' + esc(String(score)) + ' / ' + esc(String(total)) + ' correct</h2>' +
					'<div class="mq-stars-big" aria-label="' + stars + ' of 3 stars">' + starHtml + '</div>' +
					'<div class="mq-coins-big" title="Cosmetic treasure only — coins are not saved">' + coinHtml + '</div>' +
					'<p class="hint">' + (verified ? 'Score &amp; stars confirmed on the server ✔' : 'Offline — showing your in-session score') + '</p>' +
					thresholdLine +
					'<div class="mq-results-actions">' + actionHtml + '</div>' +
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
		var nextBtn = document.getElementById('mqNextBtn');
		if (nextBtn) nextBtn.addEventListener('click', function () {
			// land on the MAP machine state first (level-picked is only
			// accepted there), then reuse the exact same start routine
			// the map nodes use — fallback to the map if the machine refuses.
			dispatch('back-to-map');
			showMap(engine);
			if (!startLevel(engine, passed ? nextIdx : ui.levelIndex)) showMap(engine);
		});
	}

	/* ════════════════ QUIZ — MQ templates, platform pipeline ════════════ */
	function MathQuestGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.template = null;        // MQ presentation layer (stage 3)
		this.childKey = CORE.delegateKey(question);
		var delegated = window.KidsGameRenderers || {};
		this.child = null;
	}
	MathQuestGame.prototype.render = function () {
		// Math Quest picks its OWN presentation template first; only types
		// without a complete template (or a template that fails to mount)
		// fall back to the platform renderer — which stays byte-compatible
		// with the old games' behavior. A teacher's per-level presentation
		// pick (stage 5) wins over the automatic inference when it actually
		// fits the question data.
		var gameCfg = (this.engine && this.engine.game && this.engine.game.config) || null;
		var tplKey = CORE.teacherTemplateFor(this.question, gameCfg, ui.levelIndex);
		var Tpl = (tplKey && window.MQTemplates && window.MQTemplates[tplKey]) || null;
		if (Tpl) {
			try {
				this.template = new Tpl(this.engine, this.root, this.question, this.config);
				this.template.render();
				return;
			} catch (e) {
				try { if (this.template && this.template.destroy) this.template.destroy(); } catch (_) { }
				this.template = null; // fall through to the legacy renderer
			}
		}
		var delegated = window.KidsGameRenderers || {};
		var Ctor = delegated[this.childKey];
		if (Ctor) this.child = new Ctor(this.engine, this.root, this.question, this.config);
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
		if (this.template && this.template.lock) { try { this.template.lock(correct, given); } catch (_) { } }
		if (this.child && this.child.lock) { try { this.child.lock(correct, given); } catch (_) { } }
	};
	MathQuestGame.prototype.destroy = function () {
		if (this.template && this.template.destroy) { try { this.template.destroy(); } catch (_) { } }
		if (this.child && this.child.destroy) { try { this.child.destroy(); } catch (_) { } }
		this.destroyed = true; // renderers signal teardown (mountRenderer contract)
		this.template = null;
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
		/** Stage-5 teacher wizard: the verified path-anchored slot chain +
		 * route polyline, for the studio's structural map preview. Read-only. */
		trailPreview: {
			slots: TRAIL_SLOT_CHAIN,
			slotsFor: TRAIL_SLOTS_FOR,
			route: TRAIL_ROUTE,
		},
	};
})();

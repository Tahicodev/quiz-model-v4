/**
 * math-quest-core.js — pure logic for the Math Quest kids game.
 *
 * No DOM, no framework — usable directly in node/vitest tests. Owns:
 *  - level planning from the teacher's `config_json.levels` (with an
 *    explicit, documented fallback when the game ships without levels),
 *  - the explicit map → quiz → level-results screen state machine,
 *  - the asset catalogue for /kids/assets/math-quest/ (with emoji/gradient
 *    fallbacks so a missing file can never break the game).
 *
 * Coins are COSMETIC in v1: they are derived here from server-verified
 * stars purely for display and are never persisted or presented as saved
 * currency.
 */
(function (global) {
	'use strict';

	/* ── Screen state machine (map → quiz → results → map …) ────────────── */
	var SCREENS = { MAP: 'map', QUIZ: 'quiz', LEVEL_RESULTS: 'level-results' };

	/** Pure transition function.
	 * state = { screen, sessionStarted, pendingLevelIndex, levelCount,
	 *           completed: [{ stars: 0..3 } | null], levelIndex }
	 * Events: 'session-started' (engine created a session),
	 *         'level-picked' (kid taps an available level),
	 *         'level-answered' (a question answering finished),
	 *         'level-complete' (PATCH succeeded for the run),
	 *         'level-failed' (PATCH failed),
	 *         'back-to-map' (results acknowledged).
	 * Illegal transitions return the current state (never throw). */
	function next(state, event) {
		var s = Object.assign({}, state, { completed: (state.completed || []).slice() });
		var L = Math.max(1, s.levelCount || 1);
		if (s.completed.length < L) {
			while (s.completed.length < L) s.completed.push(null);
		}
		var idx = Math.min(Math.max(s.levelIndex || 0, 0), L - 1);
		switch (event) {
			case 'session-started':
				if (s.processing) {
					// Session was created for a pending level pick → quiz begins
					s.screen = SCREENS.QUIZ;
					s.sessionStarted = true;
					s.pendingLevelIndex = null;
					s.processing = false;
					return s;
				}
				if (s.screen === SCREENS.QUIZ) return s; // never interrupts a live quiz
				s.screen = SCREENS.MAP;
				s.sessionStarted = true;
				return s;
			case 'level-picked':
				if (s.screen !== SCREENS.MAP || s.processing) return s; // replay allowed; the UI decides which level is playable
				s.processing = true; // level click → a fresh session is requested
				return s;
			case 'level-answered':
				if (s.screen !== SCREENS.QUIZ) return s;
				return s; // shell keeps driving questions; state stays QUIZ
			case 'level-complete':
				if (s.screen !== SCREENS.QUIZ) return s;
				s.data = Object.assign({}, s.data, {
					verified: true,
					score: (state.data && state.data.score) || 0,
					stars: (state.data && state.data.stars) || 0,
				});
				s.completed[idx] = s.data.stars;
				s.screen = SCREENS.LEVEL_RESULTS;
				return s;
			case 'level-failed':
				if (s.screen !== SCREENS.QUIZ) return s;
				s.data = Object.assign({}, s.data, { verified: false, score: (state.data && state.data.score) || 0, stars: (state.data && state.data.stars) || 0 });
				s.screen = SCREENS.LEVEL_RESULTS;
				return s;
			case 'back-to-map':
				if (s.screen !== SCREENS.LEVEL_RESULTS) return s;
				s.screen = SCREENS.MAP;
				s.sessionStarted = false; // next pick must create a fresh session
				return s;
			default:
				return s;
		}
	}

	/* ═══════════════ Level planning + unlock rules ═══════════════════════ */
	/**
	 * Normalizes the teacher's config_json.levels into printable levels.
	 * Stage 2 rules — deliberately MIRRORED on the server (KidsGameService):
	 * every level needs a stable id + an explicit question list; the ids must
	 * form a partition of the question payload; pass_stars (1..3) is the
	 * threshold the NEXT level unlocks with (default 1). Anything else falls
	 * back to ONE default level covering all questions — always playable.
	 */
	function planLevels(config, questions) {
		var qs = Array.isArray(questions) ? questions : [];
		var byId = {};
		qs.forEach(function (q) { if (q && q.id) byId[String(q.id)] = q; });
		var raw = (config && Array.isArray(config.levels)) ? config.levels : null;
		function isStableId(v) {
			return typeof v === 'string' && v.trim() !== '' && v.length <= 80;
		}
		var valid = Array.isArray(raw) && raw.length > 0 && raw.length <= 12 &&
			raw.every(function (l) {
				return l && typeof l === 'object' &&
					isStableId(l.id) &&
					typeof l.name === 'string' && l.name.trim() !== '' &&
					Array.isArray(l.questions) && l.questions.length > 0 &&
					l.questions.every(function (id) { return Object.prototype.hasOwnProperty.call(byId, String(id)); }) &&
					(l.pass_stars == null || (Number.isInteger(l.pass_stars) && l.pass_stars >= 1 && l.pass_stars <= 3));
			});
		// ids must be a partition of the question list (no dupes, none lost)
		if (valid) {
			var seen = {}, seenIds = {}, total = 0;
			for (var i = 0; i < raw.length; i++) {
				var lid = String(raw[i].id);
				if (seenIds[lid]) { valid = false; break; } // progress keys are stable per level id
				seenIds[lid] = true;
				for (var j = 0; j < raw[i].questions.length; j++) {
					var id = String(raw[i].questions[j]);
					if (seen[id]) { valid = false; break; }
					seen[id] = true; total++;
				}
				if (!valid) break;
			}
			if (valid && total !== qs.length) valid = false;
		}
		if (!valid) {
			return [{
				index: 0,
				id: 'default',
				name: 'Level 1',
				questionIds: qs.map(function (q) { return q.id; }),
				thresholdStars: 1,
				art: 'home',
			}];
		}
		return raw.map(function (l, i) {
			return {
				index: i,
				id: l.id.trim().slice(0, 80),
				name: String(l.name).trim(),
				questionIds: l.questions.map(function (q) { return String(q); }),
				thresholdStars: l.pass_stars || 1,
				art: (typeof l.art === 'string' && ['home', 'treasure', 'temple', 'sunset'].indexOf(l.art) >= 0) ? l.art : 'home',
			};
		});
	}

	/**
	 * Deterministic unlock chain for a planned level list and a map of best
	 * stars: level 0 is always unlocked; level i+1 unlocks only when level i
	 * is passed (best stars >= its threshold). Mirrored on the server in
	 * KidsGameService.questProgress; the client should prefer the server's
	 * authoritative response and use this only for instant UI previews.
	 */
	function computeProgress(levels, bestByLevelId) {
		var best = bestByLevelId || {};
		var out = [];
		var prevPassed = true;
		for (var i = 0; i < levels.length; i++) {
			var b = best[levels[i].id];
			b = (b == null) ? 0 : Math.max(0, Math.min(3, Number(b) || 0));
			var threshold = levels[i].thresholdStars || 1;
			var unlocked = prevPassed;
			var passed = b >= threshold;
			prevPassed = prevPassed && passed;
			out.push({ unlocked: unlocked, bestStars: b, passed: passed });
		}
		return out;
	}

	/** Map level idx → playable? (kept for stage-1 call sites) */
	function levelPlayable(level) { return level.index === 0; }

	/* ── Assets (all optional — graceful fallbacks) ─────────────────────── */
	var RAW = '/kids/assets/math-quest/';
	var ASSETS = {
		// map + backgrounds
		trail: RAW + 'backgrounds/mq-adventure-trail.webp',
		home: RAW + 'backgrounds/mq-jungle-home.webp',
		clearing: RAW + 'backgrounds/mq-treasure-clearing.webp',
		// characters ("/kids/assets/…" absolute; probing may swap formats later)
		dinoIdle: RAW + 'characters/mq-dino-idle.png',
		dinoCelebrate: RAW + 'characters/mq-dino-celebrate.png',
		dinoEncourage: RAW + 'characters/mq-dino-encourage.png',
		dinoThinking: RAW + 'characters/mq-dino-thinking.png',
		dinoSurprised: RAW + 'characters/mq-dino-surprised.png',
		// props + rewards
		gate: RAW + 'props/mq-gate.png',
		signpost: RAW + 'props/mq-signpost.png',
		chest: RAW + 'props/mq-chest-open-glow.png',
		chestClosed: RAW + 'props/mq-chest-closed.png',
		pedestal: RAW + 'props/mq-pedestal.png',
		palm: RAW + 'decorations/mq-decor-palm.png',
		rock: RAW + 'decorations/mq-decor-rock.png',
		coin: RAW + 'rewards/mq-coin.png',
		star: RAW + 'rewards/mq-star.png',
		trophy: RAW + 'rewards/mq-trophy.png',
		confetti: RAW + 'effects/mq-confetti.png',
		// thumbnails
		levelHome: RAW + 'thumbnails/mq-level-home.png',
		levelTreasure: RAW + 'thumbnails/mq-level-treasure.png',
		levelTemple: RAW + 'thumbnails/mq-level-temple.png',
		levelSunset: RAW + 'thumbnails/mq-level-sunset.png',
	};

	var DINO_FOR_MOOD = {
		idle: 'dinoIdle', celebrate: 'dinoCelebrate', encourage: 'dinoEncourage',
		thinking: 'dinoThinking', amazed: 'dinoSurprised',
	};

	/* ── Question-type → existing-pipeline renderer delegation ──────────── */
	var DELEGATES = {
		'multiple-choice': 'bubble-pop',        // single answer → floating bubbles
		'true-false': 'leap-frog',
		'fill-blank': 'magic-words',
		'order': 'build-a-tower',
		'matching': 'pair-party',
		'odd-one-out': 'sort-it-out',
		'code': 'code-explorer',
	};
	/** Preferred delegate for one question, based on its own type. */
	function delegateKey(question) {
		var type = String(question.type || 'multiple-choice');
		if (type === 'multiple-choice' && question.allowMultipleAnswers) {
			return 'star-collector';
		}
		return DELEGATES[type] || 'bubble-pop';
	}

	var MathQuestCore = {
		VERSION: 'stage-2',
		SCREENS: SCREENS,
		ASSETS: ASSETS,
		DINO_FOR_MOOD: DINO_FOR_MOOD,
		next: next,
		planLevels: planLevels,
		computeProgress: computeProgress,
		levelPlayable: levelPlayable,
		delegateKey: delegateKey,
		/** Cosmetic coin count: 1 coin per server-verified star (0..3). */
		coinsForStars: function (stars) {
			return Math.max(0, Math.min(3, Number(stars) || 0));
		},
	};

 	global.MathQuestCore = MathQuestCore;
	if (typeof module === 'object' && module.exports) {
		module.exports = { MathQuestCore: MathQuestCore, ASSETS: ASSETS };
	}
})(typeof window !== 'undefined' ? window : globalThis);

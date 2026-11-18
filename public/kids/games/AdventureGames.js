/* AdventureGames.js — five world-flavoured presentations of the same
   single-answer multiple-choice question.

   They exist because "Choose how to play" should mean a different adventure,
   not a different assessment: every renderer below draws the SAME options and
   submits the SAME option label through engine.answer(), exactly once. The
   engine still owns grading, scoring, stars, timers, streaks and hints.

   Contract (identical to BubblePopGame / SubjectGames):
     new Renderer(engine, root, question, config)
     .render()               draw into root
     .lock(correct, given)   feedback once engine.answer() ran
     .destroy()              clear listeners and pending timers

   Artwork is optional: every prop <img> hides itself on error and the emoji
   underneath stays visible, so a missing asset never blocks an answer. */
(function () {
	'use strict';

	var RAW = '/kids/assets/';
	var CHOSEN_MS = 300; // tap → answer, so the selection animation lands first

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function escAttr(s) { return esc(s); }
	function options(q) {
		var KP = window.KidsPlayer;
		return KP && KP.shuffle ? KP.shuffle(KP.options(q)) : [];
	}
	/** An image that disappears instead of showing a broken icon. */
	function art(file, cls, alt) {
		return '<span class="kid-adv-art ' + cls + '">' +
			'<img src="' + escAttr(RAW + file) + '" alt="' + escAttr(alt || '') + '" onerror="this.style.display=\'none\'" />' +
		'</span>';
	}
	/** Shared constructor state: one answer, one timer, one teardown. */
	function init(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.done = false;
		this.timer = null;
	}
	/** Bind every [data-opt] choice: exactly one quick tap answers the question. */
	function bindChoices(self, selector, chosenClass, delay) {
		var buttons = Array.prototype.slice.call(self.root.querySelectorAll(selector));
		buttons.forEach(function (btn) {
			btn.addEventListener('click', function () {
				if (self.done || self.engine.locked) return;
				self.done = true;
				btn.classList.add(chosenClass || 'kid-adv-chosen');
				try { window.KidsPlayer.sound.play('hint'); } catch (_) { /* silent */ }
				self.timer = setTimeout(function () {
					self.timer = null;
					self.engine.answer(btn.dataset.opt);
				}, delay || CHOSEN_MS);
			});
		});
		return buttons;
	}
	/** Mark every choice right/wrong once the engine has graded the answer. */
	function lockChoices(self, selector, given) {
		var answer = String(self.question.answer == null ? '' : self.question.answer).trim().toLowerCase();
		Array.prototype.forEach.call(self.root.querySelectorAll(selector), function (btn) {
			btn.disabled = true;
			btn.classList.remove('kid-adv-chosen');
			var picked = given != null && btn.dataset.opt === String(given);
			var good = btn.dataset.opt.trim().toLowerCase() === answer;
			if (good) btn.classList.add('kid-adv-correct');
			else btn.classList.add(picked ? 'kid-adv-wrong' : 'kid-adv-dim');
			btn.setAttribute('aria-disabled', 'true');
		});
	}
	function teardown(self) {
		if (self.timer) { clearTimeout(self.timer); self.timer = null; }
		self.done = true;
	}

	/* ── 🗝️ Treasure Hunt — three chests, the right one opens ─────────────── */
	function TreasureHuntGame(engine, root, question, config) {
		init.call(this, engine, root, question, config);
	}
	TreasureHuntGame.prototype.render = function () {
		var opts = options(this.question);
		this.root.innerHTML = '<div class="kid-card kid-adv kid-adv-treasure">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-adv-tip">Tap the chest that holds the right answer! 🗝️</p>' +
			'<div class="kid-adv-stage kid-adv-treasure-stage">' +
				art('prop-adventure-treasure.jpg', 'kid-adv-treasure-prop', 'Treasure chest') +
				'<div class="kid-adv-choices kid-adv-chests">' +
					opts.map(function (o, i) {
						return '<button type="button" class="kid-adv-choice kid-adv-chest" data-opt="' + escAttr(o) + '" ' +
							'aria-label="' + escAttr(o) + '" style="--i:' + i + '">' +
							'<span class="kid-adv-chest-lid" aria-hidden="true">🎁</span>' +
							'<span class="kid-adv-label">' + esc(o) + '</span>' +
						'</button>';
					}).join('') +
				'</div>' +
			'</div></div>';
		bindChoices(this, '.kid-adv-chest', 'kid-adv-chosen');
	};
	TreasureHuntGame.prototype.lock = function (correct, given) {
		lockChoices(this, '.kid-adv-chest', given);
		var stage = this.root.querySelector('.kid-adv-treasure-stage');
		if (stage) stage.classList.add(correct ? 'kid-adv-win' : 'kid-adv-miss');
	};
	TreasureHuntGame.prototype.destroy = function () { teardown(this); };

	/* ── 🚀 Space Mission — tap a planet, the rocket flies there ───────────── */
	function SpaceMissionGame(engine, root, question, config) {
		init.call(this, engine, root, question, config);
	}
	SpaceMissionGame.prototype.render = function () {
		var opts = options(this.question);
		this.root.innerHTML = '<div class="kid-card kid-adv kid-adv-space">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-adv-tip">Pick the planet with the right answer to refuel! 🚀</p>' +
			'<div class="kid-adv-stage kid-adv-space-stage">' +
				'<div class="kid-adv-rocket" aria-hidden="true">🚀</div>' +
				'<div class="kid-adv-choices kid-adv-planets">' +
					opts.map(function (o, i) {
						return '<button type="button" class="kid-adv-choice kid-adv-planet" data-opt="' + escAttr(o) + '" ' +
							'aria-label="' + escAttr(o) + '" style="--i:' + i + '">' +
							art('prop-immersive-planets.jpg', 'kid-adv-planet-art', '') +
							'<span class="kid-adv-planet-emoji" aria-hidden="true">🪐</span>' +
							'<span class="kid-adv-label">' + esc(o) + '</span>' +
						'</button>';
					}).join('') +
				'</div>' +
			'</div></div>';
		bindChoices(this, '.kid-adv-planet', 'kid-adv-chosen', 380);
	};
	SpaceMissionGame.prototype.lock = function (correct, given) {
		lockChoices(this, '.kid-adv-planet', given);
		var stage = this.root.querySelector('.kid-adv-space-stage');
		if (stage) stage.classList.add(correct ? 'kid-adv-win' : 'kid-adv-miss');
	};
	SpaceMissionGame.prototype.destroy = function () { teardown(this); };

	/* ── 🌱 Seed & Grow — water the right seed ─────────────────────────────── */
	function SeedGrowGame(engine, root, question, config) {
		init.call(this, engine, root, question, config);
	}
	SeedGrowGame.prototype.render = function () {
		var opts = options(this.question);
		this.root.innerHTML = '<div class="kid-card kid-adv kid-adv-garden-card">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-adv-tip">Water the seed with the right answer and watch it grow! 🌱</p>' +
			'<div class="kid-adv-stage kid-adv-garden">' +
				art('prop-immersive-seeds.png', 'kid-adv-garden-prop', 'Seeds and crops') +
				'<div class="kid-adv-choices kid-adv-seeds">' +
					opts.map(function (o, i) {
						return '<button type="button" class="kid-adv-choice kid-adv-seed" data-opt="' + escAttr(o) + '" ' +
							'aria-label="' + escAttr(o) + '" style="--i:' + i + '">' +
							'<span class="kid-adv-sprout" aria-hidden="true">🌱</span>' +
							'<span class="kid-adv-label">' + esc(o) + '</span>' +
						'</button>';
					}).join('') +
				'</div>' +
			'</div></div>';
		bindChoices(this, '.kid-adv-seed', 'kid-adv-chosen', 360);
	};
	SeedGrowGame.prototype.lock = function (correct, given) {
		lockChoices(this, '.kid-adv-seed', given);
		var garden = this.root.querySelector('.kid-adv-garden');
		if (garden) garden.classList.add(correct ? 'kid-adv-win' : 'kid-adv-miss');
	};
	SeedGrowGame.prototype.destroy = function () { teardown(this); };

	/* ── 🐾 Rescue Mission — free the right animal ─────────────────────────── */
	function RescueMissionGame(engine, root, question, config) {
		init.call(this, engine, root, question, config);
	}
	RescueMissionGame.prototype.render = function () {
		var opts = options(this.question);
		this.root.innerHTML = '<div class="kid-card kid-adv kid-adv-rescue">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-adv-tip">Tap the cage with the right answer to set a friend free! 🐾</p>' +
			'<div class="kid-adv-stage kid-adv-rescue-stage">' +
				art('prop-immersive-animals.jpg', 'kid-adv-rescue-prop', 'Friendly animals') +
				'<div class="kid-adv-choices kid-adv-cages">' +
					opts.map(function (o, i) {
						return '<button type="button" class="kid-adv-choice kid-adv-cage" data-opt="' + escAttr(o) + '" ' +
							'aria-label="' + escAttr(o) + '" style="--i:' + i + '">' +
							'<span class="kid-adv-pet" aria-hidden="true">🐶</span>' +
							'<span class="kid-adv-bars" aria-hidden="true"></span>' +
							'<span class="kid-adv-label">' + esc(o) + '</span>' +
						'</button>';
					}).join('') +
				'</div>' +
			'</div></div>';
		bindChoices(this, '.kid-adv-cage', 'kid-adv-chosen', 320);
	};
	RescueMissionGame.prototype.lock = function (correct, given) {
		lockChoices(this, '.kid-adv-cage', given);
		var stage = this.root.querySelector('.kid-adv-rescue-stage');
		if (stage) stage.classList.add(correct ? 'kid-adv-win' : 'kid-adv-miss');
	};
	RescueMissionGame.prototype.destroy = function () { teardown(this); };

	/* ── 🧩 Puzzle Reveal — every pick lifts a puzzle piece ────────────────── */
	function PuzzleRevealGame(engine, root, question, config) {
		init.call(this, engine, root, question, config);
	}
	PuzzleRevealGame.prototype.render = function () {
		var opts = options(this.question);
		var cols = opts.length <= 4 ? 2 : 3;
		this.root.innerHTML = '<div class="kid-card kid-adv kid-adv-puzzle">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-adv-tip">Pick the piece that fits the right answer! 🧩</p>' +
			'<div class="kid-adv-stage kid-adv-puzzle-stage">' +
				art('puzzle-reveal-template.png', 'kid-adv-puzzle-prop', '') +
				'<div class="kid-adv-choices kid-adv-pieces" style="--cols:' + cols + '">' +
					opts.map(function (o, i) {
						return '<button type="button" class="kid-adv-choice kid-adv-piece" data-opt="' + escAttr(o) + '" ' +
							'aria-label="' + escAttr(o) + '" style="--i:' + i + '">' +
							'<span class="kid-adv-notch" aria-hidden="true"></span>' +
							'<span class="kid-adv-label">' + esc(o) + '</span>' +
						'</button>';
					}).join('') +
				'</div>' +
			'</div></div>';
		bindChoices(this, '.kid-adv-piece', 'kid-adv-chosen');
	};
	PuzzleRevealGame.prototype.lock = function (correct, given) {
		lockChoices(this, '.kid-adv-piece', given);
		var stage = this.root.querySelector('.kid-adv-puzzle-stage');
		if (stage) stage.classList.add(correct ? 'kid-adv-win' : 'kid-adv-miss');
	};
	PuzzleRevealGame.prototype.destroy = function () { teardown(this); };

	/* ── Registration — merge into the shared registry, never replace it. ─── */
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['treasure-hunt'] = TreasureHuntGame;
	window.KidsPlayer.renderers['space-mission'] = SpaceMissionGame;
	window.KidsPlayer.renderers['seed-grow'] = SeedGrowGame;
	window.KidsPlayer.renderers['rescue-mission'] = RescueMissionGame;
	window.KidsPlayer.renderers['puzzle-reveal'] = PuzzleRevealGame;
})();
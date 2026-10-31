/* SubjectGames.js — Bespoke, kid-joy presentations for the built-in
   Math / French / Arabic multiple-choice games.

   WHY THIS EXISTS
   These games used to render with the generic Bubble Pop (translucent bubbles
   scattered on a stage), which made a comparison like "Compare les deux
   nombres : 1 … 3" feel like popping random bubbles. Here each question is
   presented in a way that MATCHES ITS INTENT, while keeping the EXACT SAME
   answer contract: the renderer still calls engine.answer(<option label>) with
   the option string, so server grading (KidsGameService.checkAnswer), the
   client mirror (clientCheck), PIN results, stars and championships are all
   completely untouched. Math / French / Arabic only change HOW the choices look.

   Routing lives in kids-player.js mountRenderer: it asks
   window.KidsPlayer.pickSubjectPresentation(q, game) which returns one of these
   keys (or '' to keep Bubble Pop). It is only consulted for subject games whose
   generic key is 'bubble-pop', so towers, magic-words, custom games and the
   existing tests behave exactly as before. */
(function () {
	'use strict';

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	/* ── Intent helpers (used by the router + renderers) ──────────────────── */
	function subjectKeyOf(game) {
		var subj = String((game && game.subject) || '');
		var raw = subj.toLowerCase();
		if (raw.indexOf('math') >= 0) return 'math';
		if (raw.indexOf('ara') >= 0 || /[\u0600-\u06FF]/.test(subj)) return 'arabic';
		if (raw.indexOf('fre') >= 0 || raw.indexOf('fran') >= 0) return 'french';
		return '';
	}

	/* Two numbers framed by an ellipsis / dots: "… : 1 … 3" -> {left:'1',right:'3'}. */
	function parseCompare(text) {
		var s = String(text || '');
		var m = s.match(/(\d+)\s*(?:…|\.{2,3})\s*(\d+)/);
		if (!m) m = s.match(/(\d+)[^\d]+(\d+)/);
		if (!m) return null;
		return { left: m[1], right: m[2] };
	}

	/* The countable emoji run in a question ("… ? 🍎🍎🍎" -> ['🍎','🍎','🍎']). */
	var EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
	function extractObjects(text) {
		try { return String(text || '').match(EMOJI_RE) || []; } catch (_) { return []; }
	}
	function stripEmoji(text) {
		try { return String(text || '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim(); } catch (_) { return String(text || ''); }
	}

	/* Decide which bespoke presentation a question deserves ('' = keep Bubble Pop). */
	function pickSubjectPresentation(q, game) {
		if (!subjectKeyOf(game)) return '';
		if (String(q.type || 'multiple-choice') !== 'multiple-choice') return '';
		var opts = (window.KidsPlayer.options(q) || []).map(function (s) { return String(s).trim(); });
		if (!opts.length) return '';
		// Comparison: every option is one of the three signs and we can read two numbers.
		var onlySigns = opts.every(function (s) { return s === '<' || s === '=' || s === '>'; });
		if (onlySigns && opts.length >= 2 && parseCompare(q.text)) return 'num-balance';
		// Counting: numeric options plus an emoji run to actually count on screen.
		var allNumeric = opts.every(function (s) { return /^\d{1,3}$/.test(s); });
		if (allNumeric && extractObjects(q.text).length >= 1) return 'count-tap';
		// Any other subject multiple-choice gets the readable choice-board layout.
		return 'subj-choice';
	}

	/* ── 🐊 Number Balance — comparison (< = >) as a crocodile seesaw ─────── */
	function NumBalanceGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.done = false;
	}
	NumBalanceGame.prototype.render = function () {
		var KP = window.KidsPlayer, self = this;
		var pair = parseCompare(this.question.text);
		var left = pair ? pair.left : '?', right = pair ? pair.right : '?';
		this.root.innerHTML =
			'<div class="kid-card kid-balance-card">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<div class="kid-balance" id="kidBalance">' +
				'<div class="kid-pan kid-pan-left"><span class="kid-pan-face">🐸</span><span class="kid-pan-num">' + esc(left) + '</span></div>' +
				'<div class="kid-fulcrum"><span class="kid-croc">🐊</span><span class="kid-post"></span></div>' +
				'<div class="kid-pan kid-pan-right"><span class="kid-pan-face">🐸</span><span class="kid-pan-num">' + esc(right) + '</span></div>' +
			'</div>' +
			'<p class="hint">Le crocodile croque toujours le plus grand ! Quel signe ? ⚖️</p>' +
			'<div class="kid-signs">' +
				['<', '=', '>'].map(function (s) {
					return '<button class="kid-sign" data-opt="' + esc(s) + '" aria-label="' + esc(s) + '"><span class="kid-sign-glyph">' + esc(s) + '</span></button>';
				}).join('') +
			'</div></div>';
		this.root.querySelectorAll('.kid-sign').forEach(function (btn) {
			btn.addEventListener('click', function () {
				if (self.done) return;
				self.done = true;
				btn.classList.add('chosen');
				try { KP.sound.play('hint'); } catch (_) { }
				setTimeout(function () { self.engine.answer(btn.dataset.opt); }, 260);
			});
		});
	};
	NumBalanceGame.prototype.lock = function (correct, given) {
		var answer = String(this.question.answer || '').trim();
		var beam = this.root.querySelector('#kidBalance');
		var nums = parseCompare(this.question.text);
		if (beam && nums) {
			var l = Number(nums.left), r = Number(nums.right);
			beam.classList.add(l > r ? 'tip-left' : (r > l ? 'tip-right' : 'tip-even'));
		}
		this.root.querySelectorAll('.kid-sign').forEach(function (btn) {
			btn.classList.add('locked');
			var v = btn.dataset.opt.trim();
			if (v === answer) btn.classList.add('correct');
			if (given && v === String(given).trim() && v !== answer) btn.classList.add('wrong');
		});
	};
	NumBalanceGame.prototype.destroy = function () { };

	/* ── 🔢 Count & Tap — counting questions with real tappable objects ───── */
	function CountTapGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.done = false;
	}
	CountTapGame.prototype.render = function () {
		var KP = window.KidsPlayer, self = this;
		var objs = extractObjects(this.question.text);
		var prompt = stripEmoji(this.question.text) || 'Compte les objets ! 🔢';
		var opts = KP.shuffle(KP.options(this.question));
		this.root.innerHTML =
			'<div class="kid-card kid-count-card">' +
			'<p class="kid-question">' + esc(prompt) + '</p>' +
			'<div class="kid-meadow" id="kidMeadow">' +
				objs.map(function (e, i) { return '<button class="kid-cnt-obj" data-i="' + i + '">' + esc(e) + '</button>'; }).join('') +
			'</div>' +
			'<p class="hint">Touche chaque objet pour le compter, puis choisis le bon nombre ! 👆</p>' +
			'<div class="kid-cnt-nums">' +
				opts.map(function (o, i) {
					return '<button class="kid-cnt-num" data-opt="' + esc(o) + '" style="background:' + KP.colors[i % KP.colors.length] + '">' + esc(o) + '</button>';
				}).join('') +
			'</div></div>';
		var counted = 0;
		this.root.querySelectorAll('.kid-cnt-obj').forEach(function (obj) {
			obj.addEventListener('click', function () {
				if (self.done || obj.classList.contains('picked')) return;
				obj.classList.add('picked');
				counted += 1;
				obj.textContent = obj.textContent + ' ✓';
				try { KP.sound.play('hint'); } catch (_) { }
			});
		});
		this.root.querySelectorAll('.kid-cnt-num').forEach(function (num) {
			num.addEventListener('click', function () {
				if (self.done) return;
				self.done = true;
				num.classList.add('chosen');
				setTimeout(function () { self.engine.answer(num.dataset.opt); }, 200);
			});
		});
	};
	CountTapGame.prototype.lock = function (correct, given) {
		var answer = String(this.question.answer || '').trim();
		this.root.querySelectorAll('.kid-cnt-num').forEach(function (num) {
			num.classList.add('locked');
			var v = num.dataset.opt.trim();
			if (v === answer) num.classList.add('correct');
			if (given && v === String(given).trim() && v !== answer) num.classList.add('wrong');
		});
	};
	CountTapGame.prototype.destroy = function () { };

	/* ── 🎯 Choice Board — other subject MCQs as a bright, readable grid ──── */
	function SubjChoiceGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.done = false;
	}
	SubjChoiceGame.prototype.render = function () {
		var KP = window.KidsPlayer, self = this;
		var opts = KP.shuffle(KP.options(this.question));
		this.root.innerHTML =
			'<div class="kid-card kid-choice-card">' +
			'<div class="kid-choice-board"><p class="kid-question">' + esc(this.question.text) + '</p></div>' +
			'<p class="hint">Touche la bonne carte ! 👇</p>' +
			'<div class="kid-choice-grid">' +
				opts.map(function (o, i) {
					return '<button class="kid-choice-card-btn" data-opt="' + esc(o) + '" style="background:' + KP.colors[i % KP.colors.length] + '"><span class="kid-choice-tick">✓</span>' + esc(o) + '</button>';
				}).join('') +
			'</div></div>';
		this.root.querySelectorAll('.kid-choice-card-btn').forEach(function (card) {
			card.addEventListener('click', function () {
				if (self.done) return;
				self.done = true;
				card.classList.add('chosen');
				try { KP.sound.play('hint'); } catch (_) { }
				setTimeout(function () { self.engine.answer(card.dataset.opt); }, 220);
			});
		});
	};
	SubjChoiceGame.prototype.lock = function (correct, given) {
		var answer = String(this.question.answer || '').trim().toLowerCase();
		this.root.querySelectorAll('.kid-choice-card-btn').forEach(function (card) {
			card.classList.add('locked');
			var v = card.dataset.opt.trim().toLowerCase();
			if (v === answer) card.classList.add('correct');
			if (given && v === String(given).trim().toLowerCase() && v !== answer) card.classList.add('wrong');
		});
	};
	SubjChoiceGame.prototype.destroy = function () { };

	/* ── Register (merge, never overwrite, so script order is safe) ───────── */
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['num-balance'] = NumBalanceGame;
	window.KidsPlayer.renderers['count-tap'] = CountTapGame;
	window.KidsPlayer.renderers['subj-choice'] = SubjChoiceGame;
	window.KidsPlayer.pickSubjectPresentation = pickSubjectPresentation;
})();

/**
 * MathQuestTemplates.js — Math Quest question presentation layer (stages 3+4).
 *
 * Templates own ONLY how a question looks and interacts. Answer evaluation,
 * stars/score, timers, duplicate-answer locking, session submission and
 * server-side grading stay 100% in the player engine: every submission goes
 * through engine.answer() exactly once, exactly like the platform renderers.
 *
 * Contract (identical to the existing kid renderers):
 *   new Template(engine, root, question, config)
 *   .render()               draw the template into root
 *   .lock(correct, given)   feedback state once engine.answer() ran
 *   .destroy()              remove listeners; DOM dies with the swap anyway
 *
 * A template throws on data it can't present (missing pieces, misaligned
 * art, …); MathQuestGame catches that and falls back to the platform's own
 * renderer for the question type — templates are never allowed to break a
 * run or to grade anything.
 *
 * Hygiene: listeners are removed in destroy() (mountRenderer destroys the
 * previous renderer before every new question); animations are pure CSS —
 * no JS timers, nothing to accumulate across questions or levels.
 * Reduced motion: every animated piece is disabled under
 * prefers-reduced-motion. Missing artwork hides itself (error listener);
 * the template stays fully playable as text.
 */
(function () {
	'use strict';
	var RAW = '/kids/assets/math-quest/';
	var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function escAttr(s) { return esc(s); }
	/** Assign directly; a broken asset hides itself (graceful text fallback). */
	function setImg(root, selector, url) {
		var img = root.querySelector(selector);
		if (!img) return;
		img.addEventListener('error', function () { img.style.display = 'none'; });
		img.src = url;
	}
	/** Reward art popped onto a winning element (missing art hides itself). */
	function starImg() {
		var star = document.createElement('img');
		star.className = 'mq-card-star';
		star.alt = '';
		star.setAttribute('aria-hidden', 'true');
		star.src = RAW + 'rewards/mq-star.png';
		star.addEventListener('error', function () { star.style.display = 'none'; });
		return star;
	}
	/** Parchment scroll chrome shared by the stage-4 templates (dino + gem
	 * already exist in the manifest's unused roles — now on duty). */
	function scrollBody(foregroundHtml, media) {
		return '<div class="mq-scroll">' +
			'<span class="mq-scroll-dino" aria-hidden="true"><img src="" alt="" /></span>' +
			'<span class="mq-scroll-gem" aria-hidden="true"><img src="" alt="" /></span>' +
			(media ? '<figure class="mq-scroll-media"><img src="" alt="" /></figure>' : '') +
			foregroundHtml +
		'</div>';
	}
	function dressScroll(root, media) {
		setImg(root, '.mq-scroll-dino img', RAW + 'characters/mq-dino-thinking.png');
		setImg(root, '.mq-scroll-gem img', RAW + 'props/mq-crystal.png');
		if (media) setImg(root, '.mq-scroll-media img', media);
	}
	/** Lead-out state the engine's ~1.6s swap waits on. */
	function fadePanel(root) {
		var panel = root.querySelector('.mq-panel');
		if (panel) panel.classList.add('mq-leave');
	}

	/* ── story-cards: single-answer multiple-choice ──────────────────────
	 * Deliberately different composition from the bubble game:
	 *   parchment scroll question panel (thinking dino + crystal prop,
	 *   optional question illustration) → parchment answer CARDS in an
	 *   adaptive grid → select-then-confirm interaction.
	 * Never touches scoring: picking/confirming routes through engine.answer(). */
	function StoryCards(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.picked = null;
		this.done = false;
		this._optBtns = [];
		this._onOpt = null;
		this._onConfirm = null;
	}
	StoryCards.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options) throw new Error('story-cards needs the kid platform');
		var self = this;
		var opts = KP.options(this.question);
		if (opts.length < 2) throw new Error('story-cards needs at least two options');
		var media = this.question.media_url ? String(this.question.media_url) : null;
		var cards = opts.map(function (o, i) {
			return (
				'<button type="button" class="mq-card-opt" data-opt="' + escAttr(o) + '" aria-pressed="false">' +
					'<span class="mq-card-key" aria-hidden="true">' + esc(LETTERS[i % LETTERS.length]) + '</span>' +
					'<span class="mq-card-text">' + esc(o) + '</span>' +
				'</button>'
			);
		}).join('');
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				'<div class="mq-scroll">' +
					'<span class="mq-scroll-dino" aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-scroll-gem" aria-hidden="true"><img src="" alt="" /></span>' +
					(media ? '<figure class="mq-scroll-media"><img src="" alt="" /></figure>' : '') +
					'<p class="mq-q">' + esc(this.question.text || '') + '</p>' +
				'</div>' +
				'<div class="mq-cards" role="group" aria-label="Answer choices">' + cards + '</div>' +
				'<div class="mq-panel-actions">' +
					'<button type="button" class="kid-btn green mq-confirm" disabled aria-disabled="true">Answer ✔</button>' +
				'</div>' +
			'</div>';
		// Theme assets (mind the unused-manifest roles: thinking dino + crystal)
		setImg(this.root, '.mq-scroll-dino img', RAW + 'characters/mq-dino-thinking.png');
		setImg(this.root, '.mq-scroll-gem img', RAW + 'props/mq-crystal.png');
		if (media) {
			setImg(this.root, '.mq-scroll-media img', media);
		}
		// Select-then-confirm: clear selected state, one confirmed submission.
		this._optBtns = Array.prototype.slice.call(this.root.querySelectorAll('.mq-card-opt'));
		this._onOpt = function (ev) { self.select(ev.currentTarget); };
		this._onConfirm = function () { self.submit(); };
		this._optBtns.forEach(function (b) { b.addEventListener('click', self._onOpt); });
		this._confirm = this.root.querySelector('.mq-confirm');
		this._confirm.addEventListener('click', this._onConfirm);
	};
	StoryCards.prototype.select = function (btn) {
		if (this.done || this.engine.locked) return;
		this.picked = btn.getAttribute('data-opt');
		var self = this;
		this._optBtns.forEach(function (el) {
			var is = el === btn;
			el.classList.toggle('mq-picked', is);
			el.setAttribute('aria-pressed', is ? 'true' : 'false');
		});
		this._confirm.disabled = false;
		this._confirm.setAttribute('aria-disabled', 'false');
	};
	StoryCards.prototype.submit = function () {
		// Layers of duplicate prevention: this.done, AND engine.locked inside
		// answer() (the platform's own guard — scoring can never double-trigger).
		if (this.done || this.picked == null || this.engine.locked) return;
		this.done = true;
		this._confirm.disabled = true;
		this._confirm.setAttribute('aria-disabled', 'true');
		this.engine.answer(this.picked);
	};
	StoryCards.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		var self = this;
		this._optBtns.forEach(function (el) { el.disabled = true; });
		if (this._confirm) {
			this._confirm.disabled = true;
			this._confirm.setAttribute('aria-disabled', 'true');
		}
		// Mark the kid's card and (on a miss) the truly correct one.
		var chosen = given != null
			? this._optBtns.filter(function (el) { return el.getAttribute('data-opt') === given; })[0]
			: null;
		if (chosen) {
			if (correct) {
				chosen.classList.add('mq-correct');
				// reward art (mq-star) pops on the winning card — plain CSS pop,
				// reduced-motion has a static outline instead
				var star = document.createElement('img');
				star.className = 'mq-card-star';
				star.alt = '';
				star.setAttribute('aria-hidden', 'true');
				star.src = RAW + 'rewards/mq-star.png';
				star.addEventListener('error', function () { star.style.display = 'none'; });
				chosen.appendChild(star);
			} else {
				chosen.classList.add('mq-wrong');
				var answer = String(this.question.answer == null ? '' : this.question.answer);
				this._optBtns.forEach(function (el) {
					if (String(el.getAttribute('data-opt')).trim().toLowerCase() === answer.trim().toLowerCase()) {
						el.classList.add('mq-correct');
					}
				});
			}
		}
		// Gentle lead-out; the engine swaps the question ~1.6s later.
		var panel = this.root.querySelector('.mq-panel');
		if (panel) panel.classList.add('mq-leave');
	};
	StoryCards.prototype.destroy = function () {
		try {
			var self = this;
			this._optBtns.forEach(function (b) { if (self._onOpt) b.removeEventListener('click', self._onOpt); });
			if (this._confirm && this._onConfirm) this._confirm.removeEventListener('click', this._onConfirm);
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this._optBtns = [];
		this._onOpt = null;
		this._onConfirm = null;
		this._confirm = null;
		this.picked = null;
	};

	/* ── order-cards: arrange-the-steps ('order' → kid type 'draggable') ──
	 * Tower-style reordering in Math Quest clothes: a numbered parchment
	 * sequence the kid fixes with ▲ ▼, then confirms. Grading stays in the
	 * engine: submit goes through engine.answer() ONCE with the current
	 * sequence joined top→bottom by ',' — exactly the token string the
	 * server compares for 'order' questions (see KidsGameService.checkAnswer).
	 * Shuffled start uses the platform shuffle; missing artwork hides itself. */
	function OrderCards(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.done = false;
		this.destroyed = false;
		this.order = [];
	}
	OrderCards.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options) throw new Error('order-cards needs the kid platform');
		var self = this;
		var opts = KP.options(this.question);
		if (opts.length < 2) throw new Error('order-cards needs at least two steps');
		var media = this.question.media_url ? String(this.question.media_url) : null;
		this.order = KP.shuffle(opts.slice());
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				'<div class="mq-scroll">' +
					'<span class="mq-scroll-dino" aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-scroll-gem" aria-hidden="true"><img src="" alt="" /></span>' +
					(media ? '<figure class="mq-scroll-media"><img src="" alt="" /></figure>' : '') +
					'<p class="mq-q">' + esc(this.question.text || '') + '</p>' +
				'</div>' +
				'<div class="mq-seq" role="list" aria-label="Steps in order">' +
					this.order.map(function (label, i) { return self.rowHtml(label, i); }).join('') +
				'</div>' +
				'<div class="mq-panel-actions">' +
					'<button type="button" class="kid-btn green mq-confirm">Validate ▲▼</button>' +
				'</div>' +
			'</div>';
		setImg(this.root, '.mq-scroll-dino img', RAW + 'characters/mq-dino-thinking.png');
		setImg(this.root, '.mq-scroll-gem img', RAW + 'props/mq-crystal.png');
		if (media) setImg(this.root, '.mq-scroll-media img', media);
		this._confirm = this.root.querySelector('.mq-confirm');
		this._seq = this.root.querySelector('.mq-seq');
		this._onMethod = null;
		this._onConfirm = function () { self.submit(); };
		this._onMove = function (ev) {
			var btn = ev.target && ev.target.closest ? ev.target.closest('.mq-seq-btn') : null;
			if (!btn || btn.disabled || self.done || self.engine.locked) return;
			var dir = btn.getAttribute('data-move');
			var i = Number(btn.getAttribute('data-i')) || 0;
			var j = dir === 'up' ? i - 1 : i + 1;
			if (j < 0 || j >= self.order.length) return;
			var t = self.order[j]; self.order[j] = self.order[i]; self.order[i] = t;
			self.draw(); // container level: one listener survives every re-draw
		};
		this._confirm.addEventListener('click', this._onConfirm);
		this._seq.addEventListener('click', this._onMove);
	};
	OrderCards.prototype.rowHtml = function (label, i) {
		return (
			'<div class="mq-seq-row" role="listitem">' +
				'<span class="mq-seq-pos" aria-hidden="true">' + (i + 1) + '</span>' +
				'<span class="mq-seq-label">' + esc(label) + '</span>' +
				'<span class="mq-seq-controls">' +
					'<button type="button" class="mq-seq-btn" data-move="up" data-i="' + i + '" aria-label="' + escAttr(label) + ' — up" ' + (i === 0 ? 'disabled' : '') + '>▲</button>' +
					'<button type="button" class="mq-seq-btn" data-move="down" data-i="' + i + '" aria-label="' + escAttr(label) + ' — down" ' + (i === this.order.length - 1 ? 'disabled' : '') + '>▼</button>' +
				'</span>' +
			'</div>'
		);
	};
	OrderCards.prototype.draw = function () {
		if (!this._seq) return;
		var self = this;
		this._seq.innerHTML = this.order.map(function (label, i) {
			return self.rowHtml(label, i);
		}).join('');
	};
	OrderCards.prototype.submit = function () {
		// Duplicate layers: this.done + engine.locked inside answer() — the
		// sequence can only be submitted once (mirrors BuildATowerGame).
		if (this.done || this.engine.locked) return;
		this.done = true;
		this._confirm.disabled = true;
		this._confirm.setAttribute('aria-disabled', 'true');
		this.engine.answer(this.order.join(','));
	};
	OrderCards.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		if (this._confirm) {
			this._confirm.disabled = true;
			this._confirm.setAttribute('aria-disabled', 'true');
		}
		var rows = Array.prototype.slice.call(this.root.querySelectorAll('.mq-seq-row'));
		if (correct) {
			rows.forEach(function (r) { r.classList.add('mq-correct'); });
			var first = rows[0];
			if (first) {
				var star = document.createElement('img');
				star.className = 'mq-card-star';
				star.alt = '';
				star.setAttribute('aria-hidden', 'true');
				star.src = RAW + 'rewards/mq-star.png';
				star.addEventListener('error', function () { star.style.display = 'none'; });
				first.appendChild(star);
			}
		} else {
			// tower parity: every row whose label is not where it belongs is wrong
			var expected = String(this.question.answer == null ? '' : this.question.answer).trim();
			var expParts = expected.split(',').map(function (s) { return s.trim(); });
			rows.forEach(function (row, i) {
				var label = row.querySelector('.mq-seq-label');
				var text = label ? label.textContent : '';
				var place = expParts[i] != null ? expParts[i].trim().toLowerCase() : '';
				row.classList.add(text.trim().toLowerCase() === place && place ? 'mq-correct' : 'mq-wrong');
			});
		}
		var panel = this.root.querySelector('.mq-panel');
		if (panel) panel.classList.add('mq-leave');
	};
	OrderCards.prototype.destroy = function () {
		try {
			if (this._seq && this._onMove) this._seq.removeEventListener('click', this._onMove);
			if (this._confirm && this._onConfirm) this._confirm.removeEventListener('click', this._onConfirm);
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this.order = [];
		this._onMove = null;
		this._onConfirm = null;
		this._seq = null;
		this._confirm = null;
	};

	/* ── art-pick: image answer cards (stage 4) ──────────────────────────
	 * For single-answer multiple-choice where EVERY option carries art
	 * (`option_images`, aligned with the option order by the server
	 * normalizer). Distinct composition: big framed picture CARDS with the
	 * caption always visible underneath — art never replaces the text, so
	 * the card stays readable while images load (or fail to load).
	 * Submission is the option LABEL through engine.answer(), byte-identical
	 * with story-cards; incomplete art throws → story-cards fallback. */
	function ArtPick(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.picked = null;
		this.done = false;
		this._optBtns = [];
		this._onOpt = null;
		this._onConfirm = null;
	}
	ArtPick.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options) throw new Error('art-pick needs the kid platform');
		var self = this;
		var opts = KP.options(this.question);
		var imgs = Array.isArray(this.question.option_images) ? this.question.option_images : null;
		if (!imgs || imgs.length !== opts.length || opts.length < 2) {
			throw new Error('art-pick needs art aligned with every option');
		}
		for (var i = 0; i < imgs.length; i++) {
			if (typeof imgs[i] !== 'string' || !imgs[i].trim()) {
				throw new Error('art-pick needs art for every option');
			}
		}
		this._imgs = imgs;
		var media = this.question.media_url ? String(this.question.media_url) : null;
		var cards = opts.map(function (o, i) {
			return (
				'<button type="button" class="mq-art-card" data-opt="' + escAttr(o) + '" aria-pressed="false">' +
					'<span class="mq-art-frame" aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-art-key" aria-hidden="true">' + esc(LETTERS[i % LETTERS.length]) + '</span>' +
					'<span class="mq-card-text">' + esc(o) + '</span>' +
				'</button>'
			);
		}).join('');
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				scrollBody('<p class="mq-q">' + esc(this.question.text || '') + '</p>', media) +
				'<div class="mq-art-cards" role="group" aria-label="Answer choices">' + cards + '</div>' +
				'<div class="mq-panel-actions">' +
					'<button type="button" class="kid-btn green mq-confirm" disabled aria-disabled="true">Answer ✔</button>' +
				'</div>' +
			'</div>';
		dressScroll(this.root, media);
		// Each framed image loads on its own; a broken one keeps the CSS
		// rune-tape placeholder visible (caption never disappears).
		var frames = this.root.querySelectorAll('.mq-art-frame img');
		Array.prototype.forEach.call(frames, function (img, i) {
			img.addEventListener('error', function () { img.style.display = 'none'; });
			img.src = self._imgs[i];
		});
		// Same select-then-confirm shape as story-cards.
		this._optBtns = Array.prototype.slice.call(this.root.querySelectorAll('.mq-art-card'));
		this._onOpt = function (ev) { self.select(ev.currentTarget); };
		this._onConfirm = function () { self.submit(); };
		this._optBtns.forEach(function (b) { b.addEventListener('click', self._onOpt); });
		this._confirm = this.root.querySelector('.mq-confirm');
		this._confirm.addEventListener('click', this._onConfirm);
	};
	ArtPick.prototype.select = function (btn) {
		if (this.done || this.engine.locked) return;
		this.picked = btn.getAttribute('data-opt');
		this._optBtns.forEach(function (el) {
			var is = el === btn;
			el.classList.toggle('mq-picked', is);
			el.setAttribute('aria-pressed', is ? 'true' : 'false');
		});
		this._confirm.disabled = false;
		this._confirm.setAttribute('aria-disabled', 'false');
	};
	ArtPick.prototype.submit = function () {
		if (this.done || this.picked == null || this.engine.locked) return;
		this.done = true;
		this._confirm.disabled = true;
		this._confirm.setAttribute('aria-disabled', 'true');
		this.engine.answer(this.picked);
	};
	ArtPick.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		this._optBtns.forEach(function (el) { el.disabled = true; });
		if (this._confirm) {
			this._confirm.disabled = true;
			this._confirm.setAttribute('aria-disabled', 'true');
		}
		var chosen = given != null
			? this._optBtns.filter(function (el) { return el.getAttribute('data-opt') === given; })[0]
			: null;
		if (chosen) {
			if (correct) {
				chosen.classList.add('mq-correct');
				chosen.appendChild(starImg());
			} else {
				chosen.classList.add('mq-wrong');
				var answer = String(this.question.answer == null ? '' : this.question.answer);
				this._optBtns.forEach(function (el) {
					if (String(el.getAttribute('data-opt')).trim().toLowerCase() === answer.trim().toLowerCase()) {
						el.classList.add('mq-correct');
					}
				});
			}
		}
		fadePanel(this.root);
	};
	ArtPick.prototype.destroy = function () {
		try {
			var self = this;
			this._optBtns.forEach(function (b) { if (self._onOpt) b.removeEventListener('click', self._onOpt); });
			if (this._confirm && this._onConfirm) this._confirm.removeEventListener('click', this._onConfirm);
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this._optBtns = [];
		this._onOpt = null;
		this._onConfirm = null;
		this._confirm = null;
		this.picked = null;
		this._imgs = null;
	};

	/* ── gate-choose: true/false as two temple gates (stage 4) ───────────
	 * Uses the two options the kid-canonical question carries (Vrai/Faux,
	 * true/false, …). One tap = one commit (a binary choice needs no
	 * confirm); the chosen gate lights up right or wrong after
	 * engine.answer() ran. Gate artwork mirrors on the second gate (CSS) —
	 * question UI is DOM only, nothing baked into the asset. */
	function GateChoose(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.done = false;
		this.destroyed = false;
		this._onGate = null;
	}
	GateChoose.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options) throw new Error('gate-choose needs the kid platform');
		var self = this;
		var opts = KP.options(this.question);
		if (opts.length !== 2) throw new Error('gate-choose needs exactly two options');
		this.done = false;
		var gates = opts.map(function (o, i) {
			return (
				'<button type="button" class="mq-gate-btn" data-opt="' + escAttr(o) + '" aria-label="' + escAttr(o) + '">' +
					'<span class="mq-gate-art"' + (i === 1 ? ' data-flip="true"' : '') + ' aria-hidden="true"><img src="" alt="" /></span>' +
					'<span class="mq-gate-key" aria-hidden="true">' + esc(LETTERS[i]) + '</span>' +
					'<span class="mq-gate-label">' + esc(o) + '</span>' +
				'</button>'
			);
		}).join('');
		var media = this.question.media_url ? String(this.question.media_url) : null;
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				scrollBody(
					'<p class="mq-q">' + esc(this.question.text || '') + '</p>' +
					'<p class="mq-gate-hint">Open ONE gate — no way back! ⚠️</p>',
					media
				) +
				'<div class="mq-gates" role="group" aria-label="Choose a gate">' + gates + '</div>' +
			'</div>';
		dressScroll(this.root, media);
		// Both gates carry the gate artwork; the second mirrors it via CSS.
		this.root.querySelectorAll('.mq-gate-art img').forEach(function (img) {
			img.addEventListener('error', function () { img.style.display = 'none'; });
			img.src = RAW + 'props/mq-gate.png';
		});
		this._gates = Array.prototype.slice.call(this.root.querySelectorAll('.mq-gate-btn'));
		this._onGate = function (ev) { self.pick(ev.currentTarget); };
		this._gates.forEach(function (b) { b.addEventListener('click', self._onGate); });
	};
	GateChoose.prototype.pick = function (btn) {
		if (this.done || this.engine.locked) return;
		this.done = true;
		this.engine.answer(btn.getAttribute('data-opt'));
	};
	GateChoose.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		// Freeze the gates (listener removal stays in destroy()).
		if (this._gates) this._gates.forEach(function (b) { b.disabled = true; });
		var chosen = given != null
			? this._gates.filter(function (b) { return b.getAttribute('data-opt') === given; })[0]
			: null;
		if (chosen) {
			if (correct) {
				chosen.classList.add('mq-correct');
				chosen.appendChild(starImg());
			} else {
				chosen.classList.add('mq-wrong');
				var answer = String(this.question.answer == null ? '' : this.question.answer).trim().toLowerCase();
				this._gates.forEach(function (b) {
					if (String(b.getAttribute('data-opt')).trim().toLowerCase() === answer) {
						b.classList.add('mq-correct');
					}
				});
			}
		}
		fadePanel(this.root);
	};
	GateChoose.prototype.destroy = function () {
		try {
			var self = this;
			this._gates.forEach(function (b) { if (self._onGate) b.removeEventListener('click', self._onGate); });
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this._onGate = null;
		this._gates = [];
	};

	/* ── pair-match: matching pairs as matching-pairs ritual (stage 4) ────
	 * Kid-canonical 'matching' questions: tap a left rune stone, then its
	 * partner on the right — bindings show as breakable chips under the
	 * board. Submission joins the KP.pairs RAW tokens with ',' — the exact
	 * byte string the platform monitors for matching (token separator
	 * preserved), so grading stays 100% engine/server. Only a COMPLETE link
	 * set can be confirmed; the pairs themselves are never re-invented by
	 * this template (it refuses unknown left/right combinations, falling
	 * back to pair-party for anything weirder). */
	function PairMatch(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.done = false;
		this.destroyed = false;
		this.pairs = [];
		this.lefts = [];
		this.rights = [];
		this.links = [];
		this.pickedLeft = null;
	}
	PairMatch.prototype.linked = function (left, right) {
		for (var i = 0; i < this.links.length; i++) {
			if (this.links[i].left === left && this.links[i].right === right) return true;
		}
		return false;
	};
	PairMatch.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options || !KP.pairs || !KP.shuffle) throw new Error('pair-match needs the kid platform');
		var self = this;
		var pairs = KP.pairs(this.question);
		if (pairs.length < 2) throw new Error('pair-match needs at least two pairs');
		this.pairs = pairs;
		this.links = [];
		this.pickedLeft = null;
		function uniqOrder(vals) {
			var out = [];
			vals.forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
			return out;
		}
		this.lefts = KP.shuffle(uniqOrder(pairs.map(function (p) { return p.left; })));
		var rights = KP.shuffle(uniqOrder(pairs.map(function (p) { return p.right; })));
		var media = this.question.media_url ? String(this.question.media_url) : null;
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				scrollBody('<p class="mq-q">' + esc(this.question.text || '') + '</p>', media) +
				'<div class="mq-pair-board">' +
					'<div class="mq-pair-col" role="group" aria-label="Match these stones">' +
						this.lefts.map(function (l) {
							return '<button type="button" class="mq-pair-stone mq-pair-left" data-left="' + escAttr(l) + '">' + esc(l) + '</button>';
						}).join('') +
					'</div>' +
					'<div class="mq-pair-col" role="group" aria-label="with their partners">' +
						rights.map(function (r) {
							return '<button type="button" class="mq-pair-stone mq-pair-right" data-right="' + escAttr(r) + '">' + esc(r) + '</button>';
						}).join('') +
					'</div>' +
				'</div>' +
				'<div class="mq-pair-links" role="list" aria-label="Linked pairs"></div>' +
				'<div class="mq-panel-actions">' +
					'<button type="button" class="kid-btn green mq-confirm">Confirm the pairs ✔</button>' +
				'</div>' +
			'</div>';
		dressScroll(this.root, media);
		this._board = this.root.querySelector('.mq-pair-board');
		this._linksEl = this.root.querySelector('.mq-pair-links');
		this._confirm = this.root.querySelector('.mq-confirm');
		this._onBoard = function (ev) {
			var t = ev.target && ev.target.closest ? ev.target : null;
			if (!t) return;
			var left = t.closest ? t.closest('.mq-pair-left') : null;
			var right = t.closest ? t.closest('.mq-pair-right') : null;
			if (left) self.tapLeft(left);
			else if (right) self.tapRight(right);
		};
		this._onLinks = function (ev) {
			if (!ev.target || !ev.target.closest) return;
			var undo = ev.target.closest('.mq-pair-undo');
			if (!undo || self.done || self.engine.locked) return;
			self.unlink(Number(undo.getAttribute('data-i')) || 0);
		};
		this._onConfirm = function () { self.submit(); };
		this._board.addEventListener('click', this._onBoard);
		this._linksEl.addEventListener('click', this._onLinks);
		this._confirm.addEventListener('click', this._onConfirm);
		this.drawChips();
	};
	PairMatch.prototype.tapLeft = function (btn) {
		if (this.done || this.engine.locked) return;
		this.pickedLeft = btn.getAttribute('data-left');
		var self = this;
		Array.prototype.forEach.call(this._board.querySelectorAll('.mq-pair-left'), function (el) {
			var is = el === btn;
			el.classList.toggle('mq-picked', is);
			el.setAttribute('aria-pressed', is ? 'true' : 'false');
		});
	};
	PairMatch.prototype.tapRight = function (btn) {
		if (this.done || this.engine.locked) return;
		var label = btn.getAttribute('data-right');
		if (!this.pickedLeft) {
			this.engine.nudge('Pick a stone on the left first! 🔮', '🔮');
			return;
		}
		// Bind only pairs that actually exist in the question data — the raw
		// token (with its original separator) is what the server compares.
		var found = null;
		for (var i = 0; i < this.pairs.length && !found; i++) {
			if (this.pairs[i].left === this.pickedLeft && this.pairs[i].right === label && !this.linked(this.pairs[i].left, this.pairs[i].right)) {
				found = this.pairs[i];
			}
		}
		if (!found) {
			this.engine.nudge('Those stones don’t match — try another pair! 🧩', '🧩');
			this.pickedLeft = null;
			Array.prototype.forEach.call(this._board.querySelectorAll('.mq-pair-left'), function (el) {
				el.classList.remove('mq-picked');
				el.setAttribute('aria-pressed', 'false');
			});
			return;
		}
		var leftName = found.left;
		this.links.push({ left: found.left, right: found.right, raw: found.raw });
		this.drawChips();
		// Stone is spent: mark it so the kid can see the progress at a glance.
		Array.prototype.forEach.call(this._board.querySelectorAll('.mq-pair-left'), function (el) {
			if (el.getAttribute('data-left') === leftName) {
				el.classList.remove('mq-picked');
				el.setAttribute('aria-pressed', 'false');
				el.classList.add('mq-used');
			}
		});
		this.pickedLeft = null;
		try { window.KidsPlayer.sound.play('hint'); } catch (_) { }
	};
	PairMatch.prototype.unlink = function (i) {
		if (i < 0 || i >= this.links.length) return;
		var gone = this.links.splice(i, 1)[0];
		Array.prototype.forEach.call(this._board.querySelectorAll('.mq-pair-left'), function (el) {
			if (gone && el.getAttribute('data-left') === gone.left) el.classList.remove('mq-used');
		});
		this.drawChips();
	};
	PairMatch.prototype.drawChips = function () {
		if (!this._linksEl) return;
		var self = this;
		this._linksEl.innerHTML = this.links.map(function (l, i) {
			return (
				'<span class="mq-pair-chip" role="listitem">' +
					esc(l.left + ' ⟶ ' + l.right) +
					'<button type="button" class="mq-pair-undo" data-i="' + i + '" aria-label="Unlink ' + escAttr(l.left + ' ' + l.right) + '">✕</button>' +
				'</span>'
			);
		}).join('');
	};
	PairMatch.prototype.submit = function () {
		if (this.done || this.engine.locked) return;
		if (this.links.length !== this.pairs.length) {
			this.engine.nudge('Link every pair first!', '🔗');
			return;
		}
		this.done = true;
		this._confirm.disabled = true;
		this._confirm.setAttribute('aria-disabled', 'true');
		// Byte-exact with the canonical matching answer: original tokens,
		// comma-joined in link order.
		this.engine.answer(this.links.map(function (l) { return l.raw; }).join(','));
	};
	PairMatch.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		if (this._confirm) {
			this._confirm.disabled = true;
			this._confirm.setAttribute('aria-disabled', 'true');
		}
		// Freeze the stones the way pair-party freezes links.
		var board = this._board;
		if (board) {
			Array.prototype.forEach.call(board.querySelectorAll('.mq-pair-stone'), function (b) { b.disabled = true; });
		}
		var tokens = String(this.question.answer == null ? '' : this.question.answer).split(',').map(function (s) { return s.trim().toLowerCase(); });
		var chips = Array.prototype.slice.call(this.root.querySelectorAll('.mq-pair-chip'));
		if (correct) {
			chips.forEach(function (c) { c.classList.add('mq-correct'); });
			if (chips[0]) chips[0].appendChild(starImg());
		} else {
			// A chip survives only when its raw token really is part of the
			// expected answer; crossed/stray links light up wrong.
			chips.forEach(function (c, i) {
				var raw = this.links[i] ? String(this.links[i].raw).toLowerCase() : '';
				if (raw && tokens.indexOf(raw) < 0) c.classList.add('mq-wrong');
			}, this);
		}
		fadePanel(this.root);
	};
	PairMatch.prototype.destroy = function () {
		try {
			if (this._board && this._onBoard) this._board.removeEventListener('click', this._onBoard);
			if (this._linksEl && this._onLinks) this._linksEl.removeEventListener('click', this._onLinks);
			if (this._confirm && this._onConfirm) this._confirm.removeEventListener('click', this._onConfirm);
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this._onBoard = null;
		this._onLinks = null;
		this._onConfirm = null;
		this._board = null;
		this._linksEl = null;
		this._confirm = null;
		this.pairs = [];
		this.lefts = [];
		this.rights = [];
		this.links = [];
		this.pickedLeft = null;
	};

	/* ── rune-word: fill-in-the-blank on a carved rune scroll (stage 4) ──
	 * Mirrors the MagicWords semantics byte for byte: ((1))/[1] markers and
	 * the word bank (kid-canonical options) fill the blanks, several blanks
	 * submit '1:word|2:word', and an empty bank falls back to a typed input.
	 * Distinct composition: blanks are carved INTO the rune sentence, the
	 * word bank sits below as rune keys. One engine.answer() per question. */
	function RuneWord(engine, root, question, config) {
		this.engine = engine;
		this.root = root;
		this.question = question;
		this.config = config || {};
		this.done = false;
		this.destroyed = false;
		this.slots = [];
		this.bank = [];
	}
	RuneWord.prototype.parts = function () {
		var text = String(this.question.text || '');
		// Normalize ((1)) / [1] style markers to ___ — MagicWords parity.
		text = text.replace(/\(\(\s*\d+\s*\)\)/g, '___').replace(/\[\s*\d+\s*\]/g, '___');
		return text.split('___');
	};
	RuneWord.prototype.render = function () {
		var KP = window.KidsPlayer;
		if (!KP || !KP.options || !KP.shuffle) throw new Error('rune-word needs the kid platform');
		var self = this;
		this.done = false;
		this.bank = KP.shuffle(KP.options(this.question));
		var parts = this.parts();
		var blanks = Math.max(parts.length - 1, 1);
		this.slots = [];
		for (var i = 0; i < blanks; i++) this.slots.push(null);
		var media = this.question.media_url ? String(this.question.media_url) : null;
		var sentence = '';
		for (var p = 0; p < parts.length; p++) {
			sentence += esc(parts[p]);
			if (p < parts.length - 1) sentence += '<button type="button" class="mq-rune-slot" data-slot="' + p + '" aria-label="Blank ' + (p + 1) + '; tap to clear">✧?</button>';
		}
		if (parts.length === 1) sentence += ' <button type="button" class="mq-rune-slot" data-slot="0" aria-label="Blank 1; tap to clear">✧?</button>';
		this.root.innerHTML =
			'<div class="mq-panel mq-panel-in" role="region" aria-label="Adventure question">' +
				scrollBody('<p class="mq-q mq-rune-q">' + sentence + '</p>', media) +
				(this.bank.length
					? '<div class="mq-rune-bank" role="group" aria-label="Word bank">' +
						this.bank.map(function (w) { return '<button type="button" class="mq-rune-key" data-w="' + escAttr(w) + '">' + esc(w) + '</button>'; }).join('') +
					'</div>'
					: '<div class="mq-rune-typed"><input type="text" class="mq-rune-input" autocomplete="off" aria-label="Type the word" placeholder="Type the rune word…" /></div>') +
				'<div class="mq-panel-actions">' +
					'<button type="button" class="kid-btn green mq-confirm">Unlock ✔</button>' +
				'</div>' +
			'</div>';
		dressScroll(this.root, media);
		this._panel = this.root.querySelector('.mq-panel');
		this._confirm = this.root.querySelector('.mq-confirm');
		this._onPanel = function (ev) {
			var t = ev.target && ev.target.closest ? ev.target : null;
			if (!t) return;
			var key = t.closest('.mq-rune-key');
			if (key && !key.classList.contains('mq-used')) { self.tapKey(key); return; }
			var slot = t.closest('.mq-rune-slot');
			if (slot) self.tapSlot(slot);
		};
		this._onConfirm = function () { self.submit(); };
		this._panel.addEventListener('click', this._onPanel);
		this._confirm.addEventListener('click', this._onConfirm);
		this.paint();
	};
	RuneWord.prototype.tapKey = function (chip) {
		if (this.done || this.engine.locked) return;
		var slot = -1;
		for (var i = 0; i < this.slots.length; i++) if (!this.slots[i]) { slot = i; break; }
		if (slot < 0) { this.engine.nudge('Every blank is full — tap a blank to clear it first!', '✧'); return; }
		this.slots[slot] = chip.getAttribute('data-w');
		chip.classList.add('mq-used');
		chip.setAttribute('data-slot', String(slot));
		this.paint();
		try { window.KidsPlayer.sound.play('hint'); } catch (_) { }
	};
	RuneWord.prototype.tapSlot = function (slotEl) {
		if (this.done || this.engine.locked) return;
		var i = Number(slotEl.getAttribute('data-slot')) || 0;
		if (!this.slots[i]) return;
		var word = this.slots[i];
		this.slots[i] = null;
		this._panel.querySelectorAll('.mq-rune-key').forEach(function (chip) {
			if (chip.getAttribute('data-slot') === String(i) && chip.getAttribute('data-w') === word) {
				chip.classList.remove('mq-used');
				chip.removeAttribute('data-slot');
			}
		});
		this.paint();
	};
	RuneWord.prototype.paint = function () {
		var self = this;
		if (!this._panel) return;
		this._panel.querySelectorAll('.mq-rune-slot').forEach(function (el) {
			var w = self.slots[Number(el.getAttribute('data-slot')) || 0];
			el.textContent = w || '✧?';
			el.classList.toggle('mq-filled', !!w);
		});
	};
	RuneWord.prototype.submit = function () {
		if (this.done || this.engine.locked) return;
		var typed = this._panel ? this._panel.querySelector('.mq-rune-input') : null;
		var given;
		if (typed) {
			// MagicWords parity: no bank → one typed word per question.
			given = String(typed.value || '').trim();
			if (!given) { this.engine.nudge('Type the rune word!', '✏️'); return; }
		} else {
			if (this.slots.some(function (s) { return !s; })) {
				this.engine.nudge('Fill every blank first!', '✧');
				return;
			}
			given = this.slots.length > 1
				? this.slots.map(function (w, i) { return (i + 1) + ':' + w; }).join('|')
				: this.slots[0];
		}
		this.done = true;
		this._confirm.disabled = true;
		this._confirm.setAttribute('aria-disabled', 'true');
		this.engine.answer(given);
	};
	RuneWord.prototype.lock = function (correct, given) {
		this.done = true;
		if (!this.root || !this.root.contains) return;
		if (this._confirm) {
			this._confirm.disabled = true;
			this._confirm.setAttribute('aria-disabled', 'true');
		}
		if (this._panel) {
			this._panel.querySelectorAll('.mq-rune-key').forEach(function (b) { b.disabled = true; });
			this._panel.querySelectorAll('.mq-rune-slot').forEach(function (b) { b.disabled = true; });
			var typed = this._panel.querySelector('.mq-rune-input');
			if (typed) typed.disabled = true;
		}
		// Per-slot grading hint (presentation only — the server re-grades):
		// expected words come from the canonical answer, exactly like
		// MagicWords builds them.
		var expected = String(this.question.answer == null ? '' : this.question.answer);
		var expectedMulti = {};
		expected.split('|').forEach(function (token) {
			var c = token.indexOf(':');
			if (c > 0) expectedMulti[token.slice(0, c)] = token.slice(c + 1);
		});
		var slots = Array.prototype.slice.call(this._panel ? this._panel.querySelectorAll('.mq-rune-slot') : []);
		if (correct) {
			slots.forEach(function (el) { el.classList.add('mq-correct'); });
			if (slots[0]) slots[0].appendChild(starImg());
		} else {
			slots.forEach(function (el, i) {
				var want = expectedMulti[String(i + 1)] || expected;
				var have = String(this.slots[i] == null ? '' : this.slots[i]);
				if (have.trim().toLowerCase() === want.trim().toLowerCase()) el.classList.add('mq-correct');
				else el.classList.add('mq-wrong');
			}, this);
		}
		fadePanel(this.root);
	};
	RuneWord.prototype.destroy = function () {
		try {
			if (this._panel && this._onPanel) this._panel.removeEventListener('click', this._onPanel);
			if (this._confirm && this._onConfirm) this._confirm.removeEventListener('click', this._onConfirm);
		} catch (_) { }
		this.destroyed = true; // mountRenderer contract: previous instance signals its teardown
		this._onPanel = null;
		this._onConfirm = null;
		this._panel = null;
		this._confirm = null;
		this.slots = [];
		this.bank = [];
	};

	window.MQTemplates = window.MQTemplates || {};
	window.MQTemplates['story-cards'] = StoryCards;
	window.MQTemplates['order-cards'] = OrderCards;
	window.MQTemplates['art-pick'] = ArtPick;
	window.MQTemplates['gate-choose'] = GateChoose;
	window.MQTemplates['pair-match'] = PairMatch;
	window.MQTemplates['rune-word'] = RuneWord;
})();

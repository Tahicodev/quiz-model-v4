/* CodeExplorerGame — 🔭 code puzzles in a kid console.
   Terminal chrome, typed prompt, snippet scroll, and a console menu ([1], [2]…)
   for multiple-choice mechanics; other codeAnswerModes delegate to their
   matching game renderer (plan §1.1 note). */
(function () {
	'use strict';

	var MODE_TO_GAME = {
		'matching': 'pair-party',
		'matching-pairs': 'pair-party',
		'draggable': 'build-a-tower',
		'order': 'build-a-tower',
		'fill-blank': 'magic-words',
		'odd-one-out': 'sort-it-out',
		'true-false': 'leap-frog',
	};

	function splitPromptAndCode(text, snippet) {
		var code = String(snippet || '');
		var prompt = String(text || '');
		if (!code.trim()) {
			var fenced = prompt.match(/```(\w*)\s*\n([\s\S]*?)```/);
			if (fenced) {
				code = fenced[2].trim();
				prompt = prompt.replace(fenced[0], '').trim();
				return { prompt: prompt, code: code, language: fenced[1] || null };
			}
		}
		prompt = prompt.replace(/```(\w*)\s*\n([\s\S]*?)```/g, '').trim();
		return { prompt: prompt, code: code.trim(), language: null };
	}

	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

	function CodeExplorerGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.inner = null;
		this.picked = null;
		this.typeTimer = null;
	}
	CodeExplorerGame.prototype.isMenuMode = function () {
		var mode = String(this.question.codeAnswerMode || 'multiple-choice');
		return mode === 'multiple-choice';
	};
	CodeExplorerGame.prototype.render = function () {
		var self = this;
		var q = this.question;
		var parts = splitPromptAndCode(q.text, q.codeSnippet);
		var language = q.codeLanguage || parts.language || 'code';
		var head = '<div class="kid-terminal">' +
			'<div class="kid-term-bar"><span class="kid-term-dots"><i></i><i></i><i></i></span>' +
			'<span class="kid-term-title">console — kidcoder</span></div>' +
			'<div class="kid-term-body">' +
			'<div class="kid-term-prompt">$ <span id="kidTermTyped"></span><span class="kid-cursor">▊</span></div>';
		var frame = parts.code
			? '<div class="kid-code-frame"><div class="kid-code-lang">' + esc(language) + '</div>' + esc(parts.code) + '</div>'
			: '';
		if (this.isMenuMode()) {
			var KP = window.KidsPlayer;
			var opts = KP.shuffle(KP.options(q));
			var menu = '<div class="kid-console-menu" id="kidConsoleMenu">' +
				opts.map(function (o, i) {
					return '<button class="kid-console-opt" data-v="' + esc(o) + '"><span class="kid-console-key">[' + (i + 1) + ']</span><span>' + esc(o) + '</span></button>';
				}).join('') + '</div>' +
				'<button class="kid-run-btn" id="kidRunBtn">$ run ⏎</button>';
			this.root.innerHTML = '<div class="kid-card kid-terminal-card">' + head + frame + menu + '</div></div>';
			this.typePrompt(parts.prompt || 'Pick the right output.');
			var menuEl = this.root.querySelector('#kidConsoleMenu');
			menuEl.addEventListener('click', function (e) {
				var btn = e.target && e.target.closest ? e.target.closest('.kid-console-opt') : null;
				if (!btn || self.done) return;
				menuEl.querySelectorAll('.kid-console-opt').forEach(function (x) { x.classList.remove('selected'); });
				btn.classList.add('selected');
				self.picked = btn.dataset.v;
				window.KidsPlayer.sound.play('hint');
			});
			this.root.querySelector('#kidRunBtn').addEventListener('click', function () {
				if (self.done) return;
				if (self.picked == null) {
					self.engine.nudge('Pick an option first!', '👆');
					return;
				}
				self.done = true;
				self.engine.answer(self.picked);
			});
			return;
		}
		// Other mechanics: matching / order / blanks / odd-one-out / true-false.
		var key = MODE_TO_GAME[String(q.codeAnswerMode || 'multiple-choice')] || 'bubble-pop';
		var Ctor = (window.KidsPlayer.renderers || {})[key] || (window.KidsPlayer.renderers || {})['bubble-pop'];
		var delegateQ = Object.assign({}, q);
		if (key === 'sort-it-out') delegateQ.text = parts.prompt || 'Which one is different? 🧺';
		else if (key === 'leap-frog') delegateQ.text = parts.prompt || 'True or false? 🐸';
		else delegateQ.text = parts.prompt;
		this.root.innerHTML = '<div class="kid-card kid-terminal-card">' + head + frame +
			'<div id="kidCodeInner"></div></div></div>';
		this.typePrompt(parts.prompt);
		this.inner = new Ctor(
			{
				answer: this.engine.answer.bind(this.engine),
				nudge: this.engine.nudge.bind(this.engine),
			},
			this.root.querySelector('#kidCodeInner'),
			delegateQ,
			this.config,
		);
		this.inner.render();
	};
	/** Typewriter prompt (skipped for reduced motion or long text). */
	CodeExplorerGame.prototype.typePrompt = function (text) {
		var self = this;
		var el = this.root.querySelector('#kidTermTyped');
		if (!el) return;
		var full = String(text || '');
		var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion || full.length > 140) { el.textContent = full; return; }
		var i = 0;
		this.typeTimer = setInterval(function () {
			i += 2;
			el.textContent = full.slice(0, i);
			if (i >= full.length && self.typeTimer) { clearInterval(self.typeTimer); self.typeTimer = null; }
		}, 24);
	};
	CodeExplorerGame.prototype.lock = function (correct) {
		var self = this;
		if (this.inner && this.inner.lock) {
			try { this.inner.lock.apply(this.inner, arguments); } catch (_) { /* ignore */ }
			return;
		}
		var answer = String(this.question.answer || '').trim().toLowerCase();
		Array.prototype.forEach.call(this.root.querySelectorAll('.kid-console-opt'), function (b) {
			b.style.pointerEvents = 'none';
			if ((b.dataset.v || '').trim().toLowerCase() === answer) b.classList.add('was-correct');
			else b.classList.add('was-wrong-dim');
		});
		var run = this.root.querySelector('#kidRunBtn');
		if (run) run.disabled = true;
	};
	CodeExplorerGame.prototype.destroy = function () {
		if (this.typeTimer) { clearInterval(this.typeTimer); this.typeTimer = null; }
		if (this.inner && this.inner.destroy) { try { this.inner.destroy(); } catch (_) { /* ignore */ } }
	};
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['code-explorer'] = CodeExplorerGame;
})();

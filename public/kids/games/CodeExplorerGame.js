/* CodeExplorerGame — 🔭 code puzzles. Friendly "scroll" frame, then the
   interaction of the question's codeAnswerMode (plan §1.1 note). */
(function () {
	'use strict';
	function CodeExplorerGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.inner = null;
	}
	CodeExplorerGame.prototype.render = function () {
		var mode = String(this.question.codeAnswerMode || 'multiple-choice');
		var map = {
			'multiple-choice': 'bubble-pop', 'fill-blank': 'magic-words', 'matching': 'pair-party',
			'matching-pairs': 'pair-party', 'draggable': 'build-a-tower', 'order': 'build-a-tower',
			'odd-one-out': 'sort-it-out', 'true-false': 'leap-frog',
		};
		var key = map[mode] || 'bubble-pop';
		var Ctor = (window.KidsPlayer.renderers || {})[key];
		var code = this.question.codeSnippet || '';
		var text = String(this.question.text || '');
		var frameBody = code ? code : text;
		// Split prompt from code when the text embeds both: keep it simple —
		// the scroll shows the snippet (or full text), the delegate shows the prompt.
		this.root.innerHTML = '<div class="kid-card"><p class="hint">An ancient robot scroll appeared! 🤖📜 Read it, then play:</p>' +
			'<div class="kid-code-frame">' + esc(frameBody) + '</div>' +
			'<div id="kidCodeInner"></div></div>';
		var innerRoot = this.root.querySelector('#kidCodeInner');
		// Delegate question: hide duplicated prompt for option modes.
		var delegateQ = Object.assign({}, this.question);
		if (key === 'bubble-pop') delegateQ.text = code ? 'What is the answer? 🤔' : text;
		if (key === 'sort-it-out' && code) delegateQ.text = 'Which one is different? 🧺';
		this.inner = new Ctor(this.engineProxy(), innerRoot, delegateQ, this.config);
		this.inner.render();
		// Move the delegate feedback line into our card flow is unnecessary —
		// delegates render their own #kidFeedback inside innerRoot.
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	};
	CodeExplorerGame.prototype.engineProxy = function () {
		var engine = this.engine, self = this;
		return {
			answer: function (given, timedOut) { engine.answer(given, timedOut); },
		};
	};
	CodeExplorerGame.prototype.lock = function (correct, given) {
		if (this.inner && this.inner.lock) { try { this.inner.lock(correct, given); } catch (_) { } }
	};
	CodeExplorerGame.prototype.destroy = function () {
		if (this.inner && this.inner.destroy) { try { this.inner.destroy(); } catch (_) { } }
	};
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['code-explorer'] = CodeExplorerGame;
})();

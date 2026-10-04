/* BubblePopGame — 🫧 multiple-choice (single). Tap the correct floating bubble. */
(function () {
	'use strict';
	function BubblePopGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.popped = false;
	}
	BubblePopGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var opts = KP.shuffle(KP.options(this.question));
		var self = this;
		var html = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<div class="kid-stage" id="kidStage">' +
			opts.map(function (o, i) {
				var size = 110 + (o.length > 14 ? 30 : o.length > 8 ? 18 : 0);
				return '<div class="kid-bubble" data-opt="' + escAttr(o) + '" data-i="' + i + '" ' +
					'style="width:' + size + 'px;height:' + size + 'px;font-size:' + (size > 130 ? 1 : 0.85) + 'rem;' +
					'background:' + KP.colors[i % KP.colors.length] + ';animation-delay:' + (i * 0.35) + 's">' + esc(o) + '</div>';
			}).join('') + '</div><div id="kidFeedback" class="kid-feedback"></div></div>';
		this.root.innerHTML = html;
		// Scatter bubbles pseudo-randomly inside the stage.
		var stage = this.root.querySelector('#kidStage');
		var bubbles = Array.prototype.slice.call(stage.querySelectorAll('.kid-bubble'));
		var cols = bubbles.length <= 2 ? bubbles.length : 2;
		bubbles.forEach(function (b, i) {
			var col = i % cols, row = Math.floor(i / cols);
			b.style.left = (4 + col * (92 / Math.max(cols, 1)) + Math.random() * 6) + '%';
			b.style.top = (6 + row * 34 + Math.random() * 8) + '%';
			b.addEventListener('click', function () {
				if (self.popped) return;
				self.popped = true;
				b.classList.add('popped');
				setTimeout(function () { self.engine.answer(b.dataset.opt); }, 300);
			});
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
		function escAttr(s) { return esc(s); }
		this._esc = esc;
	};
	BubblePopGame.prototype.lock = function (correct, given) {
		var answer = String(this.question.answer || '').trim().toLowerCase();
		Array.prototype.forEach.call(this.root.querySelectorAll('.kid-bubble'), function (b) {
			if (b.dataset.opt.trim().toLowerCase() === answer) b.classList.add('correct-glow');
			else b.classList.add('wrong-dim');
		});
	};
	BubblePopGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['bubble-pop'] = BubblePopGame;
})();

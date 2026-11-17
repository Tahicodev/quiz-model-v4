/* BubblePopGame — 🫧 multiple-choice (single). Tap the correct floating bubble.
   Choices are real buttons: keyboard-operable, focus-visible, and each bubble
   drifts on its own two-axis path from a CSS custom-property seed. */
(function () {
	'use strict';
	function BubblePopGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.popped = false;
	}
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	BubblePopGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var opts = KP.shuffle(KP.options(this.question));
		var self = this;
		var stage = '<div class="kid-stage' + (opts.length > 4 ? ' kid-stage-dense' : '') + '" id="kidStage">';
		opts.forEach(function (o, i) {
			var size = 116 + (o.length > 18 ? 40 : o.length > 10 ? 22 : 0);
			var dx = 5 + Math.round((i % 3) * 3);
			var dy = 7 + Math.round((i % 2) * 4);
			var dur = 4.2 + (i % 5) * 0.55;
			stage += '<button type="button" class="kid-bubble" data-opt="' + esc(o) + '" data-i="' + i + '" ' +
				'aria-label="' + esc(o) + '" ' +
				'style="--b-size:' + size + 'px;--dx:' + dx + 'px;--dy:' + dy + 'px;--dur:' + dur.toFixed(2) + 's;' +
				'--delay:' + (i * 0.43).toFixed(2) + 's;--rot:' + (i % 2 ? -1 : 1) * 4 + 'deg;' +
				'background:' + KP.colors[i % KP.colors.length] + '">' + esc(o) + '</button>';
		});
		stage += '</div>';
		this.root.innerHTML = '<div class="kid-card kid-bubble-card">' +
			'<p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="kid-bubble-tip">Pop the bubble with the right answer! 🫧</p>' + stage + '</div>';
		var stageEl = this.root.querySelector('#kidStage');
		var bubbles = Array.prototype.slice.call(stageEl.querySelectorAll('.kid-bubble'));
		layoutBubbles(stageEl, bubbles, opts.length);
		bubbles.forEach(function (b) {
			b.addEventListener('click', function () {
				if (self.popped) return;
				self.popped = true;
				stageEl.classList.add('kid-stage-popped');
				b.classList.add('popped');
				setTimeout(function () { self.engine.answer(b.dataset.opt); }, 300);
			});
		});
	};
	/** Place bubbles on a responsive grid with a little organic jitter. The
	   grid is computed from the stage width so narrow phones never clip. */
	function layoutBubbles(stage, bubbles, count) {
		var width = Math.max(260, stage.clientWidth || 320);
		var cols = width < 430 ? 1 : (count <= 2 ? 2 : (count <= 4 ? 2 : 3));
		var rows = Math.ceil(count / cols);
		var stageH = Math.max(360, rows * (width < 430 ? 150 : 170));
		stage.style.minHeight = stageH + 'px';
		bubbles.forEach(function (b, i) {
			var col = i % cols, row = Math.floor(i / cols);
			var cellW = 100 / cols, cellH = 100 / rows;
			var jx = (Math.random() - 0.5) * Math.min(5, cellW * 0.16);
			var jy = (Math.random() - 0.5) * Math.min(5, cellH * 0.2);
			b.style.left = 'calc(' + (col * cellW + cellW / 2) + '% + ' + jx.toFixed(2) + '%)';
			b.style.top = 'calc(' + (row * cellH + cellH / 2) + '% + ' + jy.toFixed(2) + '%)';
		});
	}
	BubblePopGame.prototype.lock = function (correct, given) {
		var answer = String(this.question.answer || '').trim().toLowerCase();
		Array.prototype.forEach.call(this.root.querySelectorAll('.kid-bubble'), function (b) {
			b.disabled = true;
			if (b.dataset.opt.trim().toLowerCase() === answer) b.classList.add('correct-glow');
			else b.classList.add('wrong-dim');
		});
	};
	BubblePopGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['bubble-pop'] = BubblePopGame;
})();

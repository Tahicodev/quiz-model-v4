/* LeapFrogGame — 🐸 true-false. Hop the frog LEFT (false) or RIGHT (true). */
(function () {
	'use strict';
	function LeapFrogGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.hopped = false;
	}
	LeapFrogGame.prototype.render = function () {
		var self = this;
		this.root.innerHTML = '<div class="kid-card"><div class="kid-speech">' + esc(this.question.text) + '</div>' +
			'<div class="kid-frog-scene">' +
			'<button class="kid-pad pad-false" data-v="false">❌<br>FALSE</button>' +
			'<div class="kid-frog" id="kidFrog">🐸</div>' +
			'<button class="kid-pad pad-true" data-v="true">✅<br>TRUE</button>' +
			'</div><div id="kidFeedback" class="kid-feedback"></div></div>';
		this.root.querySelectorAll('.kid-pad').forEach(function (p) {
			p.addEventListener('click', function () {
				if (self.hopped) return;
				self.hopped = true;
				p.classList.add('picked');
				var frog = self.root.querySelector('#kidFrog');
				if (frog) frog.classList.add(p.dataset.v === 'true' ? 'hop-right' : 'hop-left');
				setTimeout(function () { self.engine.answer(p.dataset.v); }, 550);
			});
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	};
	LeapFrogGame.prototype.lock = function () { };
	LeapFrogGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['leap-frog'] = LeapFrogGame;
})();

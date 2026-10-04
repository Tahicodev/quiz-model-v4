/* StarCollectorGame — 🌟 multiple-choice (multi). Tap ALL correct stars, then Check. */
(function () {
	'use strict';
	function StarCollectorGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.selected = {};
	}
	StarCollectorGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var opts = KP.shuffle(KP.options(this.question));
		var self = this;
		this.root.innerHTML = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text) + '</p>' +
			'<p class="hint">Tap ALL the correct stars, then press Check! ⭐</p>' +
			'<div class="kid-stars-grid" id="kidStars">' +
			opts.map(function (o) {
				return '<button class="kid-star" data-opt="' + escAttr(o) + '"><span class="star-ico">⭐</span>' + esc(o) + '</button>';
			}).join('') + '</div>' +
			'<button class="kid-btn green" id="kidCheck">Check! ✅</button>' +
			'<div id="kidFeedback" class="kid-feedback"></div></div>';
		this.root.querySelectorAll('.kid-star').forEach(function (s) {
			s.addEventListener('click', function () {
				if (self.done) return;
				var k = s.dataset.opt;
				if (self.selected[k]) { delete self.selected[k]; s.classList.remove('selected'); }
				else { self.selected[k] = true; s.classList.add('selected'); }
				KP.sound.play('hint');
			});
		});
		this.root.querySelector('#kidCheck').addEventListener('click', function () {
			if (self.done) return;
			self.done = true;
			self.engine.answer(Object.keys(self.selected).join(','));
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
		function escAttr(s) { return esc(s); }
	};
	StarCollectorGame.prototype.lock = function (correct, given) {
		var good = {};
		String(this.question.answer || '').split(',').forEach(function (s) { good[s.trim().toLowerCase()] = true; });
		Array.prototype.forEach.call(this.root.querySelectorAll('.kid-star'), function (s) {
			s.classList.add('locked');
			var isGood = !!good[s.dataset.opt.trim().toLowerCase()];
			s.classList.add(isGood ? 'was-correct' : 'was-wrong');
			if (isGood) s.querySelector('.star-ico').style.filter = 'none';
		});
		var btn = this.root.querySelector('#kidCheck');
		if (btn) btn.disabled = true;
	};
	StarCollectorGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['star-collector'] = StarCollectorGame;
})();

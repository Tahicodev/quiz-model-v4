/* SortItOutGame — 🧺 odd-one-out. Find the item that doesn't belong. */
(function () {
	'use strict';
	function SortItOutGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.picked = null;
	}
	SortItOutGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var opts = KP.shuffle(KP.options(this.question));
		var self = this;
		this.root.innerHTML = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text || 'Find the one that doesn\'t belong! 🧺') + '</p>' +
			'<div class="kid-tiles" id="kidTiles">' +
			opts.map(function (o) {
				var img = '';
				if (self.question.media_url && opts.length <= 4) { /* per-option images unsupported: show shared media */ }
				return '<button class="kid-tile" data-opt="' + escAttr(o) + '">' + img + esc(o) + '</button>';
			}).join('') + '</div>' +
			'<button class="kid-btn green" id="kidCheck">That one! 👆</button></div>';
		this.root.querySelectorAll('.kid-tile').forEach(function (t) {
			t.addEventListener('click', function () {
				if (self.done) return;
				self.root.querySelectorAll('.kid-tile').forEach(function (x) { x.classList.remove('selected'); });
				t.classList.add('selected');
				self.picked = t.dataset.opt;
			});
		});
		this.root.querySelector('#kidCheck').addEventListener('click', function () {
			if (self.done) return;
			if (self.picked == null) {
				self.engine.nudge('Which one is different? Tap it!', '🧺');
				return;
			}
			self.done = true;
			self.engine.answer(self.picked);
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
		function escAttr(s) { return esc(s); }
	};
	SortItOutGame.prototype.lock = function (correct) {
		var answer = String(this.question.answer || '').trim().toLowerCase();
		Array.prototype.forEach.call(this.root.querySelectorAll('.kid-tile'), function (t) {
			t.classList.add('locked');
			if (t.dataset.opt.trim().toLowerCase() === answer) t.classList.add('was-correct');
		});
		var btn = this.root.querySelector('#kidCheck');
		if (btn) btn.disabled = true;
	};
	SortItOutGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['sort-it-out'] = SortItOutGame;
})();

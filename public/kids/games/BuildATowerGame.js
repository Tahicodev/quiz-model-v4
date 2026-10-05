/* BuildATowerGame — 🏗️ draggable (order). Stack the blocks in the correct order. */
(function () {
	'use strict';
	function BuildATowerGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.order = [];
	}
	BuildATowerGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		this.order = KP.shuffle(KP.options(this.question));
		var self = this;
		this.root.innerHTML = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text || 'Build the tower in order! 🏗️') + '</p>' +
			'<p class="hint">Use ▲ ▼ to move the blocks, then press Build!</p>' +
			'<div class="kid-tower" id="kidTower"></div>' +
			'<button class="kid-btn green" id="kidCheck">Build! 🏗️</button></div>';
		this.draw();
		this.root.querySelector('#kidCheck').addEventListener('click', function () {
			if (self.done) return;
			self.done = true;
			self.engine.answer(self.order.join(','));
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	};
	BuildATowerGame.prototype.draw = function () {
		var self = this;
		var tower = this.root.querySelector('#kidTower');
		tower.innerHTML = '';
		this.order.forEach(function (label, i) {
			var row = document.createElement('div');
			row.className = 'kid-block';
			var up = document.createElement('button');
			up.textContent = '▲'; up.setAttribute('aria-label', 'Move up');
			up.disabled = (i === 0) || self.done;
			up.addEventListener('click', function () {
				if (self.done || i === 0) return;
				var t = self.order[i - 1]; self.order[i - 1] = self.order[i]; self.order[i] = t;
				self.draw();
			});
			var down = document.createElement('button');
			down.textContent = '▼'; down.setAttribute('aria-label', 'Move down');
			down.disabled = (i === self.order.length - 1) || self.done;
			down.addEventListener('click', function () {
				if (self.done || i === self.order.length - 1) return;
				var t = self.order[i + 1]; self.order[i + 1] = self.order[i]; self.order[i] = t;
				self.draw();
			});
			var txt = document.createElement('span');
			txt.className = 'txt';
			txt.textContent = label;
			row.appendChild(up); row.appendChild(txt); row.appendChild(down);
			tower.appendChild(row);
		});
	};
	BuildATowerGame.prototype.lock = function (correct) {
		if (!correct) {
			var expected = String(this.question.answer || '').split(',').map(function (s) { return s.trim(); });
			var blocks = this.root.querySelectorAll('.kid-block');
			for (var i = 0; i < blocks.length && i < expected.length; i++) {
				if (String(this.order[i]).trim() !== expected[i]) blocks[i].classList.add('was-wrong');
			}
		}
		var btn = this.root.querySelector('#kidCheck');
		if (btn) btn.disabled = true;
	};
	BuildATowerGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['build-a-tower'] = BuildATowerGame;
})();

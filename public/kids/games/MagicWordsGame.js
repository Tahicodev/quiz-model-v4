/* MagicWordsGame — 🪄 fill-blank. Drag (tap) words from the bank into the blanks. */
(function () {
	'use strict';
	function MagicWordsGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.slots = [];
	}
	MagicWordsGame.prototype.parts = function () {
		var text = String(this.question.text || '');
		// Normalize ((1)) / [1] style markers to ___.
		text = text.replace(/\(\(\s*\d+\s*\)\)/g, '___').replace(/\[\s*\d+\s*\]/g, '___');
		return text.split('___');
	};
	MagicWordsGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var bank = KP.shuffle(KP.options(this.question));
		var parts = this.parts();
		var blanks = Math.max(parts.length - 1, 1);
		this.slots = [];
		for (var i = 0; i < blanks; i++) this.slots.push(null);
		var self = this;
		var sentence = '';
		for (var p = 0; p < parts.length; p++) {
			sentence += esc(parts[p]);
			if (p < parts.length - 1) sentence += '<span class="kid-blank" data-slot="' + p + '">✨?</span>';
		}
		if (parts.length === 1) sentence += ' <span class="kid-blank" data-slot="0">✨?</span>';
		this.root.innerHTML = '<div class="kid-card"><p class="hint">Tap a magic word, it flies into the spell! 🪄</p>' +
			'<div class="kid-sentence" id="kidSentence">' + sentence + '</div>' +
			'<div class="kid-wordbank" id="kidBank">' +
			bank.map(function (w) { return '<button class="kid-word" data-w="' + escAttr(w) + '">' + esc(w) + '</button>'; }).join('') +
			'</div>' +
			(!bank.length ? '<div style="margin-top:12px"><input id="kidTyped" class="kid-name-input" placeholder="Type the magic word…" autocomplete="off" /></div>' : '') +
			'<br><button class="kid-btn green" id="kidCheck">Cast the spell! ✨</button></div>';
		this.root.querySelectorAll('.kid-word').forEach(function (chip) {
			chip.addEventListener('click', function () {
				if (self.done || chip.classList.contains('used')) return;
				var slot = -1;
				for (var i = 0; i < self.slots.length; i++) if (!self.slots[i]) { slot = i; break; }
				if (slot < 0) return;
				self.slots[slot] = chip.dataset.w;
				chip.classList.add('used');
				chip.dataset.slot = String(slot);
				self.paintSlots();
				KP.sound.play('hint');
			});
		});
		this.root.querySelectorAll('.kid-blank').forEach(function (sp) {
			sp.addEventListener('click', function () {
				if (self.done) return;
				var i = Number(sp.dataset.slot);
				var word = self.slots[i];
				if (!word) return;
				self.slots[i] = null;
				self.root.querySelectorAll('.kid-word').forEach(function (c) {
					if (c.dataset.slot === String(i)) { c.classList.remove('used'); delete c.dataset.slot; }
				});
				self.paintSlots();
			});
		});
		this.root.querySelector('#kidCheck').addEventListener('click', function () {
			if (self.done) return;
			var typed = self.root.querySelector('#kidTyped');
			var given;
			if (typed) {
				given = String(typed.value || '').trim();
				if (!given) { self.engine.nudge('Type the magic word!', '✏️'); return; }
			} else {
				if (self.slots.some(function (s) { return !s; })) {
					self.engine.nudge('Fill every blank first!', '✨');
					return;
				}
				given = self.slots.length > 1
					? self.slots.map(function (w, i) { return (i + 1) + ':' + w; }).join('|')
					: self.slots[0];
			}
			self.done = true;
			self.engine.answer(given);
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
		function escAttr(s) { return esc(s); }
	};
	MagicWordsGame.prototype.paintSlots = function () {
		var self = this;
		this.root.querySelectorAll('.kid-blank').forEach(function (sp) {
			var w = self.slots[Number(sp.dataset.slot)];
			sp.textContent = w || '✨?';
			sp.classList.toggle('filled', !!w);
		});
	};
	MagicWordsGame.prototype.lock = function () {
		var btn = this.root.querySelector('#kidCheck');
		if (btn) btn.disabled = true;
	};
	MagicWordsGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['magic-words'] = MagicWordsGame;
})();

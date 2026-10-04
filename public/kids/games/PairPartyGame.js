/* PairPartyGame — 🎴 matching. Tap a left card, then its partner on the right. */
(function () {
	'use strict';
	function splitPair(s) {
		var str = String(s);
		var i = str.indexOf('-->');
		if (i >= 0) return [str.slice(0, i).trim(), str.slice(i + 3).trim()];
		var j = str.indexOf(':');
		if (j >= 0) return [str.slice(0, j).trim(), str.slice(j + 1).trim()];
		return [str.trim(), ''];
	}
	function PairPartyGame(engine, root, question, config) {
		this.engine = engine; this.root = root; this.question = question; this.config = config || {};
		this.pairs = [];
		this.links = [];
		this.pickedLeft = null;
	}
	PairPartyGame.prototype.render = function () {
		var KP = window.KidsPlayer;
		var self = this;
		var raws = KP.options(this.question);
		this.pairs = raws.map(function (r) {
			var p = splitPair(r);
			return { raw: r, left: p[0], right: p[1] };
		}).filter(function (p) { return p.left && p.right; });
		var lefts = KP.shuffle(this.pairs.map(function (p) { return p.left; }));
		var rights = KP.shuffle(this.pairs.map(function (p) { return p.right; }));
		this.root.innerHTML = '<div class="kid-card"><p class="kid-question">' + esc(this.question.text || 'Match the pairs! 🎴') + '</p>' +
			'<div class="kid-pair-cols"><div class="kid-pair-col" id="kidLeft">' +
			lefts.map(function (l) { return '<button class="kid-pair-item" data-side="left" data-v="' + escAttr(l) + '">' + esc(l) + '</button>'; }).join('') +
			'</div><div class="kid-pair-col" id="kidRight">' +
			rights.map(function (r) { return '<button class="kid-pair-item" data-side="right" data-v="' + escAttr(r) + '">' + esc(r) + '</button>'; }).join('') +
			'</div></div>' +
			'<div class="kid-links" id="kidLinks"></div>' +
			'<button class="kid-btn green" id="kidCheck">Check! ✅</button>' +
			'<div id="kidFeedback" class="kid-feedback"></div></div>';
		this.root.querySelectorAll('.kid-pair-item').forEach(function (el) {
			el.addEventListener('click', function () { self.tap(el); });
		});
		this.root.querySelector('#kidCheck').addEventListener('click', function () {
			if (self.done) return;
			if (self.links.length !== self.pairs.length) {
				var fb = self.root.querySelector('#kidFeedback');
				if (fb) { fb.textContent = 'Connect every pair first! 🔗'; fb.className = 'kid-feedback bad'; }
				return;
			}
			self.done = true;
			self.engine.answer(self.links.map(function (l) { return l.raw; }).join(','));
		});
		function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
		function escAttr(s) { return esc(s); }
	};
	PairPartyGame.prototype.tap = function (el) {
		if (this.done || el.classList.contains('linked')) return;
		var side = el.dataset.side, v = el.dataset.v;
		if (side === 'left') {
			this.root.querySelectorAll('#kidLeft .kid-pair-item').forEach(function (x) { x.classList.remove('picked'); });
			el.classList.add('picked');
			this.pickedLeft = v;
			return;
		}
		if (this.pickedLeft == null) return;
		var raw = null;
		for (var i = 0; i < this.pairs.length; i++) {
			if (this.pairs[i].left === this.pickedLeft && this.pairs[i].right === v) { raw = this.pairs[i].raw; break; }
		}
		if (!raw) raw = this.pickedLeft + '-->' + v;
		// Prevent reusing the same cards twice.
		for (var j = 0; j < this.links.length; j++) {
			if (this.links[j].left === this.pickedLeft || this.links[j].right === v) return;
		}
		this.links.push({ left: this.pickedLeft, right: v, raw: raw });
		var self = this;
		this.root.querySelectorAll('.kid-pair-item').forEach(function (x) {
			if (x.dataset.v === self.pickedLeft && x.dataset.side === 'left') x.classList.add('linked');
			if (x.dataset.v === v && x.dataset.side === 'right') x.classList.add('linked');
			x.classList.remove('picked');
		});
		this.pickedLeft = null;
		this.renderLinks();
		window.KidsPlayer.sound.play('hint');
	};
	PairPartyGame.prototype.renderLinks = function () {
		var wrap = this.root.querySelector('#kidLinks');
		var self = this;
		wrap.innerHTML = '';
		this.links.forEach(function (l, idx) {
			var chip = document.createElement('span');
			chip.className = 'kid-link-chip';
			chip.textContent = l.left + ' ↔ ' + l.right + ' ';
			var x = document.createElement('button');
			x.textContent = '✕';
			x.setAttribute('aria-label', 'Remove link');
			x.addEventListener('click', function () {
				if (self.done) return;
				self.links.splice(idx, 1);
				self.root.querySelectorAll('.kid-pair-item').forEach(function (el) {
					if ((el.dataset.side === 'left' && el.dataset.v === l.left) ||
						(el.dataset.side === 'right' && el.dataset.v === l.right)) el.classList.remove('linked');
				});
				self.renderLinks();
			});
			chip.appendChild(x);
			wrap.appendChild(chip);
		});
	};
	PairPartyGame.prototype.lock = function (correct) {
		this.root.querySelectorAll('.kid-pair-item').forEach(function (el) {
			el.style.pointerEvents = 'none';
			if (!correct) el.classList.add('picked');
		});
		var btn = this.root.querySelector('#kidCheck');
		if (btn) btn.disabled = true;
	};
	PairPartyGame.prototype.destroy = function () { };
	window.KidsPlayer = window.KidsPlayer || {};
	window.KidsPlayer.renderers = window.KidsPlayer.renderers || {};
	window.KidsPlayer.renderers['pair-party'] = PairPartyGame;
})();

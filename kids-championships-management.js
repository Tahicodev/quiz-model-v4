/**
 * kids-championships-management.js — 🏆 Kids Championships (admin).
 *
 * A kid-friendly tournament over Kids Games, managed from its own
 * 🏆 Kids Championships studio tab. Completely separate from the collège/lycée Tournament stack:
 * teacher picks challenges from the published kids games, kids join with a
 * 4-char code, every challenge is worth up to 100 points (best run counts).
 */
(function () {
	'use strict';

	var BASE = '/kids/championships';
	var EMOJIS = ['🏆', '🎉', '⭐', '🥇', '🎈', '🍭', '🚀', '🌈', '🎯', '🦁'];
	var GAME_TYPE_ICONS = {
		'bubble-pop': '🫧', 'star-collector': '🌟', 'leap-frog': '🐸',
		'sort-it-out': '🧺', 'pair-party': '🎴', 'build-a-tower': '🏗️',
		'magic-words': '🪄', 'code-explorer': '🔭',
	};
	var MAX_GAMES = 8; // mirrors KidsChampionshipCreateSchema.game_ids max
	var TOTAL_STEPS = 3;

	var state = {
		editingId: null,
		editingCode: null,
		step: 1,
		maxReached: 1,
		selectedEmoji: '🏆',
		selectedGameIds: [],
		loadedGames: [],
		gamesLoaded: false,
		gameSearch: '',
		saving: false,
		results: null,
		resultsPollTimer: null,
		currentResultsId: null,
	};

	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function parseJsonSafe(v, fb) { if (v == null || v === '') return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (_) { return fb; } }
	function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type || 'info'); }

	function api(method, path, body) {
		if (!window.API || typeof window.API.raw !== 'function') {
			return Promise.reject(new Error('API client not ready'));
		}
		return window.API.raw(method, BASE + path, body);
	}

	function isPaneActive() {
		var pane = document.querySelector('[data-games-studio-pane="kids-championships"]');
		return !!(pane && pane.classList.contains('active'));
	}

	function normalizeList(payload) {
		if (Array.isArray(payload)) return payload;
		return (payload && (payload.data || payload.items)) || [];
	}

	// ─── List ────────────────────────────────────────────────────────────

	function render() {
		if (!isPaneActive()) return;
		var el = $('kidsChampionshipList');
		if (!el) return;
		el.innerHTML = '<p class="text-muted">Loading championships…</p>';
		api('GET', '/?limit=100')
			.then(function (res) {
				var list = normalizeList(res);
				if (!list.length) {
					el.innerHTML = '<div class="empty-state-small">No championships yet. Create one and give your class the code! 🏆</div>';
					return;
				}
				el.innerHTML = list.map(cardHtml).join('');
				bindCardActions(el);
			})
			.catch(function (err) {
				el.innerHTML = '<div class="empty-state-small">Could not load championships: ' + esc((err && err.message) || 'network error') + '</div>';
			});
	}

	function statusLabel(status) {
		return status === 'finished'
			? '<span class="kids-championship-chip finished">🏁 Finished</span>'
			: '<span class="kids-championship-chip active">▶ Running</span>';
	}

	function cardHtml(c) {
		var challenges = Array.isArray(c.game_ids) ? c.game_ids.length : 0;
		var players = Number(c.players || c.player_count || 0);
		var logo = c.emoji || '🏆';
		var finished = c.status === 'finished';
		var stateBtn = finished
			? '<button class="kcc-btn kcc-btn-reopen" title="Reopen the championship for more plays" onclick="KidsChampionships.reopen(\'' + esc(c.id) + '\')">▶ Reopen</button>'
			: '<button class="kcc-btn kcc-btn-finish" title="Freeze the podium and end the championship" onclick="KidsChampionships.finish(\'' + esc(c.id) + '\')">🏁 Finish</button>';
		return '' +
			'<div class="kids-championship-card ' + (finished ? 'status-finished' : 'status-active') + '">' +
			'<div class="kcc-top">' +
			'<div class="kids-championship-logo" aria-hidden="true">' + esc(logo) + '</div>' +
			'<div class="kids-championship-info">' +
			'<div class="kids-championship-head">' +
			'<h4>' + esc(c.name) + '</h4>' + statusLabel(c.status) +
			'</div>' +
			'<div class="kids-championship-code" title="Kids join with this code">Join code <b>' + esc(c.code) + '</b>' +
			'<button class="kcc-copy" data-copy="' + esc(c.code) + '" title="Copy the join code">📋 Copy</button></div>' +
			'<div class="kids-championship-meta">' +
			'<span class="kcc-stat" title="Challenge games">🎮 ' + challenges + '</span>' +
			'<span class="kcc-stat" title="Kids on the leaderboard">🧒 ' + players + '</span>' +
			'<span class="kcc-stat" title="Total points up for grabs">⭐ ' + (challenges * 100) + '</span>' +
			'</div>' +
			'</div>' +
			'</div>' +
			'<div class="kids-championship-actions">' +
			'<button class="kcc-btn kcc-btn-results" title="Watch the live podium and standings" onclick="KidsChampionships.openResults(\'' + esc(c.id) + '\')">👁 Results</button>' +
			stateBtn +
			'<span class="kcc-sep"></span>' +
			'<button class="kcc-btn kcc-btn-edit" title="Rename, change mascot or challenges" onclick="KidsChampionships.openEdit(\'' + esc(c.id) + '\')">✏️ Edit</button>' +
			'<button class="kcc-btn kcc-btn-delete" title="Delete the championship and all its scores" onclick="KidsChampionships.remove(\'' + esc(c.id) + '\', \'' + esc(c.name) + '\')">🗑 Delete</button>' +
			'</div>' +
			'</div>';
	}

	function bindCardActions(el) {
		el.querySelectorAll('[data-copy]').forEach(function (btn) {
			btn.addEventListener('click', function () { copyCode(btn.getAttribute('data-copy')); });
		});
	}

	function copyCode(code) {
		var done = function () { toast('Code ' + code + ' copied — share it with your class!', 'success'); };
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
		} else { fallbackCopy(code); done(); }
	}
	function fallbackCopy(code) {
		try {
			var ta = document.createElement('textarea');
			ta.value = code;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		} catch (_) { /* ignore */ }
	}

	// ─── Create / edit modal ─────────────────────────────────────────────

	function setModal(id, open) {
		var modal = $(id);
		if (!modal) return;
		if (open) { modal.classList.add('active'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); }
		else { modal.classList.remove('active'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
	}

	function openCreate() {
		state.editingId = null;
		state.editingCode = null;
		state.selectedEmoji = '🏆';
		state.selectedGameIds = [];
		state.gameSearch = '';
		setFormValue('kidsChampionshipId', '');
		setFormValue('kidsChampionshipName', '');
		setFormValue('kidsChampionshipDescription', '');
		setFormValue('kidsChampionshipGameSearch', '');
		$('kidsChampionshipModalTitle').textContent = 'New Championship';
		$('saveKidsChampionshipBtn').textContent = 'Start Championship 🚀';
		renderEmojiRow();
		goStep(1, { force: true });
		loadGames();
		setModal('kidsChampionshipModal', true);
	}

	function openEdit(id) {
		state.editingId = id;
		api('GET', '/' + encodeURIComponent(id))
			.then(function (c) {
				$('kidsChampionshipModalTitle').textContent = 'Edit Championship';
				$('saveKidsChampionshipBtn').textContent = 'Save Changes';
				setFormValue('kidsChampionshipId', c.id);
				setFormValue('kidsChampionshipName', c.name || '');
				setFormValue('kidsChampionshipDescription', c.description || '');
				setFormValue('kidsChampionshipGameSearch', '');
				state.editingCode = c.code || null;
				state.selectedEmoji = c.emoji || '🏆';
				state.gameSearch = '';
				state.selectedGameIds = Array.isArray(c.game_ids) ? c.game_ids.slice() : parseJsonSafe(c.game_ids, []);
				renderEmojiRow();
				goStep(1, { force: true });
				loadGames();
				setModal('kidsChampionshipModal', true);
			})
			.catch(function (err) { toast('Could not load championship: ' + ((err && err.message) || 'network error'), 'error'); });
	}

	// ─── Wizard (Basics → Challenges → Review) ──────────────────────────

	function goStep(n, opts) {
		n = Math.max(1, Math.min(TOTAL_STEPS, Number(n) || 1));
		if (!opts || !opts.force) {
			if (n === state.step) return;
			if (n < 1 || n > TOTAL_STEPS) return;
		}
		state.step = n;
		state.maxReached = Math.max(state.maxReached, n);
		renderWizard();
		var body = document.querySelector('#kidsChampionshipModal .kids-wizard-body');
		if (body) body.scrollTop = 0;
	}

	function nextStep() {
		if (!validateStep(state.step)) return;
		if (state.step < TOTAL_STEPS) goStep(state.step + 1);
	}

	function validateStep(s) {
		if (s === 1) {
			var name = String(($('kidsChampionshipName') || {}).value || '').trim();
			if (!name) {
				toast('Give the championship a fun name first!', 'error');
				var input = $('kidsChampionshipName');
				if (input) input.focus();
				return false;
			}
			return true;
		}
		if (s === 2) {
			var gameIds = collectSelected();
			var err = $('kidsChampionshipGamesErr') || {};
			if (!gameIds.length) {
				err.textContent = 'Pick at least one challenge game to continue.';
				toast('Pick at least one challenge game', 'error');
				return false;
			}
			err.textContent = '';
			return true;
		}
		return true;
	}

	function renderWizard() {
		var modal = $('kidsChampionshipModal');
		if (!modal) return;
		modal.querySelectorAll('.kw-step-panel[data-kc-step]').forEach(function (panel) {
			panel.classList.toggle('active', Number(panel.getAttribute('data-kc-step')) === state.step);
		});
		modal.querySelectorAll('[data-kc-step-link]').forEach(function (li) {
			var n = Number(li.getAttribute('data-kc-step-link'));
			li.classList.toggle('active', n === state.step);
			li.classList.toggle('completed', n < state.step || (n <= state.maxReached && n !== state.step));
			li.classList.toggle('locked', n > state.maxReached);
		});
		var back = $('kidsChampionshipBackBtn');
		var next = $('kidsChampionshipNextBtn');
		var saveBtn = $('saveKidsChampionshipBtn');
		var hint = $('kidsChampionshipStepHint');
		if (back) back.hidden = state.step === 1;
		if (next) next.hidden = state.step === TOTAL_STEPS;
		if (saveBtn) saveBtn.hidden = state.step !== TOTAL_STEPS;
		if (hint) hint.textContent = 'Step ' + state.step + ' of ' + TOTAL_STEPS;
		if (state.step === 1) renderPreview();
		if (state.step === 3) renderReview();
	}

	function currentDraft() {
		return {
			name: String(($('kidsChampionshipName') || {}).value || '').trim(),
			emoji: state.selectedEmoji || '🏆',
			description: String(($('kidsChampionshipDescription') || {}).value || '').trim(),
			gameIds: collectSelected(),
		};
	}

	function gameById(id) {
		for (var i = 0; i < state.loadedGames.length; i++) {
			if (String(state.loadedGames[i].id) === String(id)) return state.loadedGames[i];
		}
		return null;
	}

	function renderPreview() {
		var el = $('kidsChampionshipPreview');
		if (!el) return;
		var d = currentDraft();
		var n = d.gameIds.length;
		el.innerHTML = '<div class="kc-preview-card">' +
			'<div class="kc-preview-emoji">' + esc(d.emoji) + '</div>' +
			'<div class="kc-preview-info">' +
			'<div class="kc-preview-name">' + esc(d.name || 'Your championship name') + '</div>' +
			(d.description ? '<div class="kc-preview-desc">' + esc(d.description) + '</div>' : '') +
			'<div class="kc-preview-meta">🎮 ' + n + ' challenge' + (n === 1 ? '' : 's') +
			(n ? ' · up to ' + (n * 100) + ' pts' : ' — pick them in step 2 →') + '</div>' +
			'</div></div>';
	}

	function renderReview() {
		var el = $('kidsChampionshipReview');
		if (!el) return;
		var d = currentDraft();
		var n = d.gameIds.length;
		var rows = d.gameIds.map(function (id, i) {
			var g = gameById(id);
			var icon = GAME_TYPE_ICONS[g && g.game_type] || '🎮';
			var questions = g ? parseJsonSafe(g.questions_json, []).length : '?';
			return '<div class="kc-review-row">' +
				'<span class="kc-review-num">' + (i + 1) + '</span>' +
				'<span class="kcg-icon">' + icon + '</span>' +
				'<span class="kc-review-name">' + esc(g ? g.name : id) + '</span>' +
				'<span class="kc-review-meta">' + questions + ' q · 100 pts</span>' +
				'</div>';
		}).join('');
		el.innerHTML =
			'<div class="kc-preview-card kc-review-hero">' +
			'<div class="kc-preview-emoji">' + esc(d.emoji) + '</div>' +
			'<div class="kc-preview-info">' +
			'<div class="kc-preview-name">' + esc(d.name || 'Untitled championship') + '</div>' +
			(d.description ? '<div class="kc-preview-desc">' + esc(d.description) + '</div>' : '') +
			'<div class="kc-preview-meta">🎮 ' + n + ' challenge' + (n === 1 ? '' : 's') + ' · up to ' + (n * 100) + ' pts total</div>' +
			'</div></div>' +
			(state.editingCode ? '<div class="kc-review-code">Join code <b>' + esc(state.editingCode) + '</b> — kids keep using it after you save.</div>' : '<div class="kc-review-code">A 4-letter join code is generated when you start — share it with your class. 🏆</div>') +
			'<div class="kc-review-list">' + rows + '</div>';
	}

	function renderEmojiRow() {
		var el = $('kidsChampionshipEmoji');
		if (!el) return;
		el.innerHTML = EMOJIS.map(function (e) {
			return '<button type="button" class="kids-championship-emoji' + (e === state.selectedEmoji ? ' selected' : '') + '" data-e="' + esc(e) + '">' + esc(e) + '</button>';
		}).join('');
		el.querySelectorAll('[data-e]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				state.selectedEmoji = btn.getAttribute('data-e');
				renderEmojiRow();
				renderPreview();
			});
		});
	}

	// ─── Challenge picker ────────────────────────────────────────────────
	// state.selectedGameIds is the single source of truth. Every checkbox
	// change syncs to it immediately, so async reloads, search filtering and
	// edit-mode pre-selections can never wipe a teacher's picks. The old
	// label-click handler manually re-toggled the input AFTER the browser's
	// native label toggle — net effect: clicking a card did nothing. It is
	// gone; the native label → input → change flow below is the whole story.

	function loadGames() {
		state.loadedGames = [];
		state.gamesLoaded = false;
		renderGamesGrid();
		if (!window.API || typeof window.API.raw !== 'function') { updateSelectionUI(); return; }
		window.API.raw('GET', '/kids?status=published&limit=100&orderBy=name&direction=asc')
			.then(function (res) {
				state.loadedGames = normalizeList(res);
				state.gamesLoaded = true;
				// Drop ids that no longer exist (game deleted/unpublished).
				var known = {};
				state.loadedGames.forEach(function (g) { known[g.id] = true; });
				state.selectedGameIds = state.selectedGameIds.filter(function (id) { return known[id]; });
				renderGamesGrid();
				updateSelectionUI();
			})
			.catch(function () {
				state.gamesLoaded = true;
				renderGamesGrid();
				updateSelectionUI();
			});
	}

	function filteredGames() {
		var q = String(state.gameSearch || '').trim().toLowerCase();
		if (!q) return state.loadedGames;
		return state.loadedGames.filter(function (g) {
			return String(g.name || '').toLowerCase().indexOf(q) !== -1 ||
				String(g.game_type || '').toLowerCase().indexOf(q) !== -1;
		});
	}

	function isSelected(id) {
		return state.selectedGameIds.indexOf(id) !== -1;
	}

	function toggleGame(id, checked) {
		id = String(id);
		var at = state.selectedGameIds.indexOf(id);
		if (checked && at === -1) {
			if (state.selectedGameIds.length >= MAX_GAMES) {
				toast('A championship holds max ' + MAX_GAMES + ' challenges — unpick one first', 'error');
				paintGridSelection();
				return;
			}
			state.selectedGameIds.push(id);
		} else if (!checked && at !== -1) {
			state.selectedGameIds.splice(at, 1);
		}
		paintGridSelection();
		updateSelectionUI();
	}

	function selectAllVisible() {
		var ids = filteredGames().map(function (g) { return String(g.id); });
		if (ids.length > MAX_GAMES) {
			toast('Picked the first ' + MAX_GAMES + ' games (max ' + MAX_GAMES + ' challenges)', 'info');
			ids = ids.slice(0, MAX_GAMES);
		}
		state.selectedGameIds = ids;
		paintGridSelection();
		updateSelectionUI();
	}

	function clearSelection() {
		state.selectedGameIds = [];
		paintGridSelection();
		updateSelectionUI();
	}

	function unpick(id) {
		toggleGame(id, false);
	}

	function renderGamesGrid() {
		var el = $('kidsChampionshipGames');
		if (!el) return;
		if (!state.gamesLoaded) {
			el.innerHTML = '<p class="text-muted">Loading games…</p>';
			return;
		}
		if (!state.loadedGames.length) {
			el.innerHTML = '<p class="text-muted">No published kids games yet — publish a kids game first, then come back here. 🎮</p>';
			return;
		}
		var games = filteredGames();
		if (!games.length) {
			el.innerHTML = '<p class="text-muted">No games match "' + esc(state.gameSearch) + '". Try another search. 🔍</p>';
			return;
		}
		el.innerHTML = games.map(function (g) {
			var icon = GAME_TYPE_ICONS[g.game_type] || '🎮';
			var questions = parseJsonSafe(g.questions_json, []).length;
			var checked = isSelected(g.id);
			return '<label class="kids-championship-game' + (checked ? ' checked' : '') + '" data-id="' + esc(g.id) + '">' +
				'<input type="checkbox" data-game-check="' + esc(g.id) + '"' + (checked ? ' checked' : '') + ' />' +
				'<span class="kcg-icon">' + icon + '</span>' +
				'<span class="kcg-name">' + esc(g.name) + '</span>' +
				'<span class="kcg-meta">' + questions + ' q · ' + esc(g.grade || 'all') + '</span>' +
				'</label>';
		}).join('');
		// Native label clicks toggle the input; only listen to change —
		// never toggle manually or the card un-checks itself.
		el.querySelectorAll('[data-game-check]').forEach(function (input) {
			input.addEventListener('change', function () {
				toggleGame(input.getAttribute('data-game-check'), input.checked);
			});
		});
	}

	// Refresh highlight state after a toggle without rebuilding the grid
	// (no focus loss, no scroll jump).
	function paintGridSelection() {
		var el = $('kidsChampionshipGames');
		if (!el) return;
		el.querySelectorAll('.kids-championship-game').forEach(function (label) {
			var id = label.getAttribute('data-id');
			var checked = isSelected(id);
			label.classList.toggle('checked', checked);
			var input = label.querySelector('input[data-game-check]');
			if (input && input.checked !== checked) input.checked = checked;
		});
	}

	function updateSelectionUI() {
		var count = $('kidsChampionshipCount');
		var n = state.selectedGameIds.length;
		if (count) {
			count.textContent = n + ' / ' + MAX_GAMES + ' selected' + (n ? ' · up to ' + (n * 100) + ' pts' : '');
			count.classList.toggle('full', n >= MAX_GAMES);
		}
		renderPicked();
		renderPreview();
	}

	function renderPicked() {
		var el = $('kidsChampionshipPicked');
		if (!el) return;
		if (!state.selectedGameIds.length) {
			el.hidden = true;
			el.innerHTML = '';
			return;
		}
		var byId = {};
		state.loadedGames.forEach(function (g) { byId[g.id] = g; });
		el.hidden = false;
		el.innerHTML = '<span class="kcg-picked-label">Your challenges:</span> ' + state.selectedGameIds.map(function (id, i) {
			var g = byId[id];
			var name = g ? g.name : id;
			return '<button type="button" class="kcg-chip" data-unpick="' + esc(id) + '" title="Remove">' +
				'<span class="kcg-chip-num">' + (i + 1) + '</span> ' + esc(name) + ' ✕</button>';
		}).join(' ');
		el.querySelectorAll('[data-unpick]').forEach(function (btn) {
			btn.addEventListener('click', function () { unpick(btn.getAttribute('data-unpick')); });
		});
	}

	function collectSelected() {
		var known = {};
		state.loadedGames.forEach(function (g) { known[g.id] = true; });
		var seen = {};
		return state.selectedGameIds.filter(function (id) {
			if (seen[id]) return false;
			seen[id] = true;
			return !state.gamesLoaded || known[id];
		});
	}

	function save(e) {
		if (e && e.preventDefault) e.preventDefault();
		// The footer form submits on Enter too — route it through the wizard:
		// steps 1–2 advance, only the review step performs the save.
		if (state.step < TOTAL_STEPS) { nextStep(); return; }
		if (state.saving) return;
		var name = String(($('kidsChampionshipName') || {}).value || '').trim();
		var err = $('kidsChampionshipGamesErr') || {};
		err.textContent = '';
		if (!name) { toast('Give the championship a fun name!', 'error'); $('kidsChampionshipName').focus(); return; }
		var gameIds = collectSelected();
		if (!gameIds.length) { err.textContent = 'Pick at least one challenge game.'; toast('Pick at least one challenge game', 'error'); return; }
		var payload = {
			name: name,
			emoji: state.selectedEmoji,
			description: String(($('kidsChampionshipDescription') || {}).value || '').trim() || null,
			game_ids: gameIds,
		};
		state.saving = true;
		var saveBtn = $('saveKidsChampionshipBtn');
		var saveLabel = saveBtn ? saveBtn.textContent : '';
		if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
		var req = state.editingId
			? api('PATCH', '/' + encodeURIComponent(state.editingId), payload)
			: api('POST', '/', payload);
		req.then(function (res) {
			setModal('kidsChampionshipModal', false);
			if (state.editingId) {
				toast('Championship updated', 'success');
			} else {
				copyCode(res && res.code);
				toast('Championship started! Code: ' + (res && res.code) + ' — share it with your class 🏆', 'success');
			}
			render();
		}).catch(function (err2) {
			err.textContent = (err2 && err2.message) || 'Could not save championship';
			toast(err.textContent, 'error');
		}).then(function () {
			state.saving = false;
			if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveLabel; }
		});
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────

	function finish(id) {
		api('PATCH', '/' + encodeURIComponent(id), { status: 'finished' })
			.then(function () { toast('Championship finished — the podium is frozen 🏁', 'success'); render(); })
			.catch(function (err) { toast('Could not finish: ' + ((err && err.message) || 'error'), 'error'); });
	}

	function reopen(id) {
		api('PATCH', '/' + encodeURIComponent(id), { status: 'active' })
			.then(function () { toast('Championship is live again ▶', 'success'); render(); })
			.catch(function (err) { toast('Could not reopen: ' + ((err && err.message) || 'error'), 'error'); });
	}

	function remove(id, name) {
		if (!window.confirm('Delete the championship "' + name + '" and all of its scores?')) return;
		api('DELETE', '/' + encodeURIComponent(id))
			.then(function () { toast('Championship deleted', 'info'); render(); })
			.catch(function (err) { toast('Could not delete: ' + ((err && err.message) || 'error'), 'error'); });
	}

	// ─── Results modal ───────────────────────────────────────────────────

	function openResults(id) {
		state.currentResultsId = id;
		stopResultsPoll();
		setModal('kidsChampionshipResultsModal', true);
		refreshResults();
		startResultsPoll();
	}

	function stopResultsPoll() {
		if (state.resultsPollTimer) { clearInterval(state.resultsPollTimer); state.resultsPollTimer = null; }
	}

	function startResultsPoll() {
		state.resultsPollTimer = setInterval(function () {
			if (state.currentResultsId && isPaneActive()) refreshResults();
			else stopResultsPoll();
		}, 5000);
	}

	function refreshResults() {
		var id = state.currentResultsId;
		if (!id) return;
		api('GET', '/' + encodeURIComponent(id))
			.then(function (c) {
				state.results = c;
				var title = $('kidsChampionshipResultsTitle');
				if (title) title.textContent = (c.emoji || '🏆') + ' ' + c.name;
				var codeBar = $('kidsChampionshipResultsCode');
				if (codeBar) {
					var status = c.status === 'finished'
						? '<span class="kids-championship-chip finished">🏁 Finished</span>'
						: '<span class="kids-championship-chip active">▶ Running · live!</span>';
					codeBar.innerHTML = '<div>Join code <b>' + esc(c.code) + '</b></div>' + status +
						'<div class="spacer"></div><span class="text-muted">Refreshing every 5s</span>';
				}
				renderResults(c.leaderboard || []);
			})
			.catch(function () { /* keep last results on transient errors */ });
	}

	function renderResults(board) {
		var el = $('kidsChampionshipResults');
		if (!el) return;
		if (!board.length) {
			el.innerHTML = '<div class="empty-state-small">No scores yet — share the code and let the kids play! 🎮</div>';
			return;
		}
		var podium = board.slice(0, 3);
		var medals = ['🥇', '🥈', '🥉'];
		var podiumHtml = '<div class="kids-championship-podium">' + podium.map(function (p, i) {
			return '<div class="kcp-step kcp-' + (i + 1) + '">' +
				'<div class="kcp-avatar">' + esc(p.avatar || '🐣') + '</div>' +
				'<div class="kcp-name">' + esc(p.player_name) + '</div>' +
				'<div class="kcp-medal">' + medals[i] + '</div>' +
				'<div class="kcp-points"><b>' + p.points + '</b> pts</div>' +
				'</div>';
		}).join('') + '</div>';

		var tableHtml = '<div class="kids-championship-table-wrap"><table class="kids-championship-table"><thead><tr>' +
			'<th>Rank</th><th>Player</th><th>Points</th><th>⭐</th><th>Games</th></tr></thead><tbody>' +
			board.map(function (p) {
				var medal = p.rank <= 3 ? medals[p.rank - 1] + ' ' : p.rank + '.';
				return '<tr' + (p.rank === 1 ? ' class="kct-first"' : '') + '>' +
					'<td>' + medal + '</td>' +
					'<td>' + esc(p.avatar || '🐣') + ' ' + esc(p.player_name) + '</td>' +
					'<td><b>' + p.points + '</b></td>' +
					'<td>' + p.stars + '⭐</td>' +
					'<td>' + p.games_played + '</td>' +
					'</tr>';
			}).join('') + '</tbody></table></div>';

		el.innerHTML =
			'<p class="text-muted" style="font-size:.85em;margin:0 0 12px;">Each challenge is worth up to 100 points — best run per challenge counts.</p>' +
			podiumHtml + tableHtml;
	}

	function closeResults() {
		stopResultsPoll();
		state.currentResultsId = null;
		setModal('kidsChampionshipResultsModal', false);
	}

	// ─── Init ────────────────────────────────────────────────────────────

	function setFormValue(id, value) {
		var el = $(id);
		if (el) el.value = value;
	}

	var initialized = false;

	function init() {
		// Bind once: admin can re-fire DOMContentLoaded-style setup (and
		// test harnesses dispatch it manually), which would otherwise
		// double-bind every button — Back/Next would then step twice.
		if (initialized) return;
		initialized = true;
		var addBtn = $('addKidsChampionshipBtn');
		if (addBtn) addBtn.addEventListener('click', openCreate);
		var form = $('kidsChampionshipForm');
		if (form) form.addEventListener('submit', save);
		var closeBtn = $('closeKidsChampionshipBtn');
		if (closeBtn) closeBtn.addEventListener('click', function () { setModal('kidsChampionshipModal', false); });
		var backBtn = $('kidsChampionshipBackBtn');
		if (backBtn) backBtn.addEventListener('click', function () {
			if (state.step > 1) goStep(state.step - 1);
		});
		var nextBtn = $('kidsChampionshipNextBtn');
		if (nextBtn) nextBtn.addEventListener('click', nextStep);
		var steps = $('kidsChampionshipSteps');
		if (steps) steps.addEventListener('click', function (e) {
			var li = e.target.closest ? e.target.closest('[data-kc-step-link]') : null;
			if (!li) return;
			var n = Number(li.getAttribute('data-kc-step-link'));
			if (n === state.step) return;
			if (n < state.step) {
				// Backward jumps are free.
				goStep(n);
			} else if (n <= state.maxReached) {
				// Forward jumps behave exactly like Next: advance a single
				// validated step so no step's validation can be skipped.
				nextStep();
			} else {
				toast('Finish the current step first', 'info');
			}
		});
		var nameInput = $('kidsChampionshipName');
		if (nameInput) nameInput.addEventListener('input', renderPreview);
		var descInput = $('kidsChampionshipDescription');
		if (descInput) descInput.addEventListener('input', renderPreview);
		var closeResBtn = $('closeKidsChampionshipResultsBtn');
		if (closeResBtn) closeResBtn.addEventListener('click', closeResults);
		var search = $('kidsChampionshipGameSearch');
		if (search) search.addEventListener('input', function () {
			state.gameSearch = search.value;
			renderGamesGrid();
		});
		var selectAllBtn = $('kidsChampionshipSelectAll');
		if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllVisible);
		var clearBtn = $('kidsChampionshipClear');
		if (clearBtn) clearBtn.addEventListener('click', clearSelection);

		// The games-studio tab switch (owned by games-management.js) calls
		// window.KidsChampionships.render for our pane; it is guarded and
		// lazy. We hook the same tab activation ourselves so this module
		// stays independent of script load order.
		var tabBtn = document.querySelector('[data-games-studio-tab="kids-championships"]');
		if (tabBtn) tabBtn.addEventListener('click', function () { setTimeout(render, 60); });
		if (isPaneActive()) setTimeout(render, 120);
	}

	var api2 = {
		render: render,
		openResults: openResults,
		closeResults: closeResults,
		finish: finish,
		reopen: reopen,
		remove: remove,
		openCreate: openCreate,
		openEdit: openEdit,
	};
	window.KidsChampionships = api2;

	document.addEventListener('DOMContentLoaded', init);
})();
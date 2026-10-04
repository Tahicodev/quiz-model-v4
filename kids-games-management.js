/**
 * kids-games-management.js — Teacher/Admin UI for the Kids Games Studio.
 *
 * Implements plan §5.1–§5.3 + §13 (list, filters, 5-step creator wizard,
 * PIN/QR share modal, per-game results). Loaded by admin.html AFTER
 * games-management.js. Talks to the backend exclusively through
 * window.API.raw() (auth + refresh handled there).
 *
 * Games = presentation wrappers over the existing Question schema (plan §0):
 * every question stored in a kids game is normalized to the canonical kid
 * shape { type, text, options_json, answer, … } before it is sent.
 */
(function () {
	'use strict';

	/* ── Constants (plan §1 + §7) ─────────────────────────────────────────── */
	var KIDS_GAME_TYPES = [
		{ id: 'bubble-pop', icon: '🫧', label: 'Bubble Pop', desc: 'Tap the correct floating bubble', kidType: 'multiple-choice' },
		{ id: 'star-collector', icon: '🌟', label: 'Star Collector', desc: 'Tap ALL stars that are correct', kidType: 'multiple-choice', multi: true },
		{ id: 'leap-frog', icon: '🐸', label: 'Leap Frog', desc: 'Hop LEFT (false) or RIGHT (true)', kidType: 'true-false' },
		{ id: 'sort-it-out', icon: '🧺', label: 'Sort It Out', desc: "Find the one that doesn't belong", kidType: 'odd-one-out' },
		{ id: 'pair-party', icon: '🎴', label: 'Pair Party', desc: 'Connect the matching pairs', kidType: 'matching' },
		{ id: 'build-a-tower', icon: '🏗️', label: 'Build-a-Tower', desc: 'Stack blocks in the correct order', kidType: 'draggable' },
		{ id: 'magic-words', icon: '🪄', label: 'Magic Words', desc: 'Drag words into the blanks', kidType: 'fill-blank' },
		{ id: 'code-explorer', icon: '🔭', label: 'Code Explorer', desc: 'Code puzzles, space style (CM1/CM2)', kidType: 'code' },
	];
	var KIDS_THEMES = ['jungle', 'space', 'ocean', 'farm', 'castle', 'dinosaur', 'forest', 'city', 'circus', 'magic', 'school', 'superhero'];
	var KIDS_GRADES = ['maternelle', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'];
	var THEME_BG = {
		jungle: 'linear-gradient(135deg,#166534,#4ade80)', space: 'linear-gradient(135deg,#0f172a,#7c3aed)',
		ocean: 'linear-gradient(135deg,#0c4a6e,#38bdf8)', farm: 'linear-gradient(135deg,#65a30d,#fef08a)',
		castle: 'linear-gradient(135deg,#4c1d95,#c4b5fd)', dinosaur: 'linear-gradient(135deg,#14532d,#a3e635)',
		forest: 'linear-gradient(135deg,#052e16,#34d399)', city: 'linear-gradient(135deg,#1e3a8a,#93c5fd)',
		circus: 'linear-gradient(135deg,#9a3412,#fbbf24)', magic: 'linear-gradient(135deg,#581c87,#f0abfc)',
		school: 'linear-gradient(135deg,#0f766e,#99f6e0)', superhero: 'linear-gradient(135deg,#b91c1c,#fca5a5)',
	};

	var state = {
		games: [],
		filters: { game_type: '', grade: '', subject: '', status: '', teacher_id: '', search: '' },
		wizardStep: 1,
		editingId: null,
		wizard: { game_type: null, theme: 'jungle', questions: [] },
		bank: [],
		bankTypeFilter: 'all',
		aiResults: [],
		manualList: [],
		lastPublished: null,
	};

	/* ── Small helpers ─────────────────────────────────────────────────────── */
	function $(id) { return document.getElementById(id); }
	function esc(s) {
		if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function toast(msg, type) {
		if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
		else if (type === 'error') console.error(msg);
		else console.log(msg);
	}
	function apiBase() { return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1'; }
	function currentUser() {
		try { return (window.Auth && window.Auth.getCurrentUser && window.Auth.getCurrentUser()) || null; }
		catch (_) { return null; }
	}
	function isAdmin() {
		var r = String((currentUser() || {}).role || '').toLowerCase();
		return r === 'admin' || r === 'super_admin';
	}
	function kidsApi(method, path, body) {
		if (!window.API || typeof window.API.raw !== 'function') return Promise.reject(new Error('API client not ready'));
		return window.API.raw(method, '/kids' + path, body);
	}
	function gameTypeMeta(id) {
		for (var i = 0; i < KIDS_GAME_TYPES.length; i++) if (KIDS_GAME_TYPES[i].id === id) return KIDS_GAME_TYPES[i];
		return null;
	}
	function parseJsonSafe(v, fb) {
		if (v == null || v === '') return fb;
		if (typeof v !== 'string') return v;
		try { return JSON.parse(v); } catch (_) { return fb; }
	}

	/** Client-side mirror of backend normalizeKidQuestion (DB row → kid shape). */
	function normalizeKidQuestion(raw) {
		var q = Object.assign({}, raw || {});
		var answer = String(q.answer == null ? '' : q.answer);
		var multi = false, meta = null;
		if (answer.indexOf('multi::') === 0) { multi = true; answer = answer.slice('multi::'.length); }
		else if (answer.indexOf('meta::') === 0) {
			var parts = answer.split('::');
			if (parts.length >= 3) {
				try { meta = JSON.parse(decodeURIComponent(escape(window.atob(parts[1])))); } catch (_) { meta = {}; }
				answer = parts.slice(2).join('::');
			}
		}
		meta = meta || {};
		var alias = { mcq: 'multiple-choice', 'multiple-choice-multi': 'multiple-choice', 'matching-pairs': 'matching', order: 'draggable' };
		var type = String(q.type || 'multiple-choice').trim();
		if (alias[type]) type = alias[type];
		if (meta.multi) multi = true;
		if (meta.odd) type = 'odd-one-out';
		if ((meta.drag || q.isDraggable) && type === 'multiple-choice') type = 'draggable';
		var codeMode = q.codeAnswerMode || null;
		if (meta.code) { type = 'code'; codeMode = codeMode || meta.code.mode || 'multiple-choice'; }
		if ((multi || type === 'matching') && answer.indexOf('|') >= 0 && answer.indexOf(',') < 0) {
			answer = answer.split('|').map(function (s) { return String(s).trim(); }).filter(Boolean).join(',');
		}
		var rawOpts = parseJsonSafe(q.options_json != null ? q.options_json : q.options, []);
		var labels = [];
		if (Array.isArray(rawOpts)) {
			labels = rawOpts.map(function (o) {
				if (typeof o === 'string') return o;
				if (o && typeof o === 'object') return String(o.text != null ? o.text : (o.label != null ? o.label : ''));
				return String(o == null ? '' : o);
			}).filter(Boolean);
		}
		return {
			id: q.id || ('kidq-' + Math.random().toString(36).slice(2, 10)),
			type: type,
			text: q.text || q.question || q.title || '',
			options_json: JSON.stringify(labels),
			answer: answer,
			explanation: q.explanation || q.instruction || null,
			points: Number(q.points) || 1,
			difficulty: q.difficulty || 'easy',
			media_url: q.media_url || q.mediaUrl || q.image || null,
			allowMultipleAnswers: Boolean(q.allowMultipleAnswers || multi),
			codeAnswerMode: codeMode,
			codeSnippet: q.codeSnippet || (meta.code && meta.code.snippet) || null,
			codeLanguage: q.codeLanguage || (meta.code && meta.code.language) || null,
		};
	}

	/* ── Studio tab hook ───────────────────────────────────────────────────── */
	function isKidsPaneActive() {
		var pane = document.querySelector('[data-games-studio-pane="kids-games-studio"]');
		return !!(pane && pane.classList.contains('active'));
	}
	function hookStudioTabs() {
		// Tab switching (and the kids-list refresh) is owned by
		// setGamesStudioTab in games-management.js — see its
		// 'kids-games-studio' branch. Nothing to bind here besides the
		// initial-load case handled below.
	}

	/* ── List + filters (plan §5.1/§5.2) ───────────────────────────────────── */
	function readFilters() {
		state.filters.game_type = ($('kidsGameFilterGameType') || {}).value || '';
		state.filters.grade = ($('kidsGameFilterGrade') || {}).value || '';
		state.filters.subject = String(($('kidsGameFilterSubject') || {}).value || '').trim();
		state.filters.status = ($('kidsGameFilterStatus') || {}).value || '';
		state.filters.teacher_id = ($('kidsGameFilterTeacher') || {}).value || '';
		state.filters.search = String(($('kidsGameFilterSearch') || {}).value || '').trim();
	}
	function applyKidsGameFilters() { readFilters(); renderKidsGameList(); }
	function resetKidsGameFilters() {
		state.filters = { game_type: '', grade: '', subject: '', status: '', teacher_id: '', search: '' };
		['kidsGameFilterGameType', 'kidsGameFilterGrade', 'kidsGameFilterSubject', 'kidsGameFilterStatus', 'kidsGameFilterTeacher', 'kidsGameFilterSearch'].forEach(function (id) {
			var el = $(id); if (el) el.value = '';
		});
		renderKidsGameList();
		toast('Kids game filters cleared', 'info');
	}

	function renderKidsGameList() {
		var container = $('kidsGameList');
		if (!container) return;
		readFilters();
		var qs = { limit: 100, offset: 0 };
		Object.keys(state.filters).forEach(function (k) { if (state.filters[k]) qs[k] = state.filters[k]; });
		container.innerHTML = '<div class="empty-state">Loading kids games…</div>';
		kidsApi('GET', '?' + new URLSearchParams(qs).toString())
			.then(function (res) {
				var games = (res && res.data) || [];
				state.games = games;
				maybeShowTeacherFilter();
				if (!games.length) {
					container.innerHTML = '<div class="empty-state">No kids games yet. Click “New Kids Game” to create one. 🧸</div>';
					return;
				}
				container.innerHTML = games.map(kidsCardHtml).join('');
			})
			.catch(function (err) {
				container.innerHTML = '<div class="empty-state">Could not load kids games: ' + esc(err && err.message) + '</div>';
			});
	}

	function maybeShowTeacherFilter() {
		var group = $('kidsGameFilterTeacherGroup');
		if (!group) return;
		if (!isAdmin()) { group.hidden = true; return; }
		group.hidden = false;
		var sel = $('kidsGameFilterTeacher');
		if (!sel || sel.options.length > 1) return;
		window.API.list('users', { limit: 200 }).then(function (res) {
			var users = (res && res.data) || res || [];
			users.filter(function (u) { return String(u.role) === 'teacher'; }).forEach(function (t) {
				var opt = document.createElement('option');
				opt.value = t.id; opt.textContent = t.name || t.username;
				sel.appendChild(opt);
			});
		}).catch(function () { /* non-fatal */ });
	}

	function kidsCardHtml(game) {
		var meta = gameTypeMeta(game.game_type) || { icon: '🎮', label: game.game_type };
		var questions = parseJsonSafe(game.questions_json, []);
		var status = game.status || 'draft';
		var grade = game.grade ? '<span class="meta-item">🎓 ' + esc(String(game.grade).toUpperCase()) + '</span>' : '';
		var subject = game.subject ? '<span class="meta-item">📚 ' + esc(game.subject) + '</span>' : '';
		var pin = game.pin ? '<span class="meta-item">🔑 PIN ' + esc(game.pin) + '</span>' : '';
		var bg = THEME_BG[game.theme] || THEME_BG.jungle;
		return '' +
			'<div class="kids-game-card">' +
			'<div class="kids-game-card-thumb" style="background:' + bg + '">' +
			'<span class="kids-game-card-type-badge">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
			'<span class="kids-game-card-status ' + esc(status) + '">' + esc(status) + '</span>' +
			'</div>' +
			'<div class="kids-game-card-body">' +
			'<h4 class="kids-game-card-name">' + esc(game.name) + '</h4>' +
			'<div class="kids-game-card-meta">' + grade + subject + pin +
			'<span class="meta-item">❓ ' + questions.length + ' questions</span></div>' +
			'<div class="kids-game-card-stats">' +
			'<span class="stat">▶️ ' + (Number(game.play_count) || 0) + ' plays</span>' +
			'</div></div>' +
			'<div class="kids-game-card-actions">' +
			'<div class="kids-card-main-actions">' +
			'<button class="btn btn-sm btn-secondary" onclick="editKidsGame(\'' + esc(game.id) + '\')">Edit</button>' +
			(game.pin
				? '<button class="btn btn-sm btn-primary" onclick="openKidsShareModal(\'' + esc(game.id) + '\')">Share PIN</button>'
				: '<button class="btn btn-sm btn-primary" onclick="publishKidsGame(\'' + esc(game.id) + '\')">Publish</button>') +
			'</div>' +
			'<div class="kids-card-more-actions">' +
			'<button class="kids-mini-btn" title="Preview as a kid" onclick="previewKidsGame(\'' + esc(game.id) + '\')">Preview</button>' +
			'<button class="kids-mini-btn" title="Play results" onclick="openKidsResultsModal(\'' + esc(game.id) + '\')">Results</button>' +
			'<button class="kids-mini-btn danger" title="Archive game" onclick="archiveKidsGame(\'' + esc(game.id) + '\')">Archive</button>' +
			'</div>' +
			'</div></div>';
	}

	/* ── Wizard (plan §5.3) ────────────────────────────────────────────────── */
	function setModal(id, open) {
		var modal = $(id);
		if (!modal) return;
		if (open) { modal.classList.add('active'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); }
		else { modal.classList.remove('active'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
	}

	function setFormValue(id, value) {
		var el = $(id);
		if (el) el.value = value;
	}
	function setChecked(id, checked) {
		var el = $(id);
		if (el) el.checked = !!checked;
	}
	function openKidsGameWizard(editId) {
		// The modal opens FIRST so a failure in any data-loading step can
		// never leave the teacher with a dead button and no feedback.
		try {
			state.editingId = editId || null;
			state.wizardStep = 1;
			state.maxWizardStep = 1;
			state.wizard = { game_type: null, theme: 'jungle', questions: [] };
			state.aiResults = [];
			state.manualList = [];
			setFormValue('kidsGameWizardId', editId || '');
			var titleEl = $('kidsWizardTitle');
			if (titleEl) titleEl.textContent = editId ? 'Edit Kids Game' : 'Create Kids Game';
			buildGameTypeGrid();
			buildThemeGrid();
			buildBankTypeFilters();
			buildManualForm();
			if (editId) {
				kidsApi('GET', '/' + encodeURIComponent(editId)).then(function (game) {
					state.wizard.game_type = game.game_type;
					state.wizard.theme = game.theme || 'jungle';
					state.wizard.questions = parseJsonSafe(game.questions_json, []).map(normalizeKidQuestion);
					var cfg = parseJsonSafe(game.config_json, {});
					setFormValue('kidsGameName', game.name || '');
					setFormValue('kidsGameSubject', game.subject || '');
					setFormValue('kidsGameGrade', game.grade || '');
					setFormValue('kidsGameDescription', game.description || '');
					if (cfg.time_per_q) setFormValue('kidsGameTimePerQ', cfg.time_per_q);
					if (cfg.max_hints != null) setFormValue('kidsGameMaxHints', cfg.max_hints);
					if (cfg.mascot_theme) setFormValue('kidsGameMascotTheme', cfg.mascot_theme);
					setChecked('kidsGameAllowReplay', cfg.allow_replay !== false);
					setChecked('kidsGameShowExplanations', cfg.show_explanations !== false);
					syncWizardSelectionUI();
					renderKidsWizardSelectedQuestions();
					safeLoadKidsBank();
				}).catch(function (err) { toast('Could not load game: ' + (err && err.message), 'error'); });
			} else {
				setFormValue('kidsGameName', '');
				setFormValue('kidsGameSubject', '');
				setFormValue('kidsGameGrade', '');
				setFormValue('kidsGameDescription', '');
				renderKidsWizardSelectedQuestions();
				safeLoadKidsBank();
			}
			goToWizardStep(1);
			setModal('kidsGameWizardModal', true);
			refreshKidsAIModels();
		} catch (err) {
			if (window.console && console.error) console.error('[KidsGames] openKidsGameWizard failed:', err);
			toast('Could not open the wizard: ' + (err && err.message), 'error');
		}
	}
	/** Bank loading must never throw synchronously (missing API, etc.). */
	function safeLoadKidsBank() {
		try {
			loadKidsBank();
		} catch (err) {
			if (window.console && console.error) console.error('[KidsGames] question bank unavailable:', err);
			var bankEl = $('kidsWizardQuestionBank');
			if (bankEl) bankEl.innerHTML = '<div class="empty-state-small">Question bank unavailable — use AI Generate or Manual Entry.</div>';
		}
	}
	function editKidsGame(id) { openKidsGameWizard(id); }
	function closeKidsGameWizard() { setModal('kidsGameWizardModal', false); }

	var KIDS_STEP_HINTS = {
		1: 'Pick a game for the kids to play',
		2: 'Choose the world (background + mascot)',
		3: 'Add at least one question',
		4: 'Name the game and tune the rules',
		5: 'Review and publish to get the PIN',
	};
	/** Per-step gate used by Next and by clicking progress steps ahead. */
	function validateWizardStep(n) {
		if (n === 1 && !state.wizard.game_type) { toast('Pick a game type first', 'warning'); return false; }
		if (n === 3 && !state.wizard.questions.length) { toast('Add at least one question', 'warning'); return false; }
		if (n === 4 && !String(($('kidsGameName') || {}).value || '').trim()) { toast('Give your game a name', 'warning'); return false; }
		return true;
	}
	function goToWizardStep(n) {
		state.wizardStep = Math.min(5, Math.max(1, n));
		if (state.maxWizardStep == null || state.wizardStep > state.maxWizardStep) state.maxWizardStep = state.wizardStep;
		var stepInput = $('kidsGameWizardStep');
		if (stepInput) stepInput.value = String(state.wizardStep);
		document.querySelectorAll('#kidsGameWizardModal .kw-step-panel').forEach(function (p) {
			p.classList.toggle('active', Number(p.dataset.step) === state.wizardStep);
		});
		document.querySelectorAll('#kidsWizardProgress .kw-step').forEach(function (s) {
			var sn = Number(s.dataset.step);
			s.classList.toggle('active', sn === state.wizardStep);
			s.classList.toggle('completed', sn < state.wizardStep);
			s.classList.toggle('locked', sn > (state.maxWizardStep || 1));
		});
		if (state.wizardStep === 5) updateKidsWizardPreview();
		var nextBtn = $('kidsWizardNextBtn'), backBtn = $('kidsWizardBackBtn'), pubBtn = $('kidsWizardPublishBtn');
		if (nextBtn) {
			nextBtn.hidden = state.wizardStep === 5;
			nextBtn.textContent = state.wizardStep === 4 ? 'Review →' : 'Next →';
		}
		if (backBtn) backBtn.disabled = state.wizardStep === 1;
		if (pubBtn) pubBtn.hidden = state.wizardStep !== 5;
		var hint = $('kidsWizardStepHint');
		if (hint) hint.textContent = 'Step ' + state.wizardStep + ' of 5 — ' + (KIDS_STEP_HINTS[state.wizardStep] || '');
		// Keep the active panel scrolled to top on step change.
		var body = document.querySelector('#kidsGameWizardModal .kids-wizard-body');
		if (body) body.scrollTop = 0;
	}
	function kidsWizardNextStep() {
		if (!validateWizardStep(state.wizardStep)) return;
		goToWizardStep(state.wizardStep + 1);
	}
	function kidsWizardPrevStep() { goToWizardStep(state.wizardStep - 1); }
	/** Progress header steps are clickable: back freely, forward through validation. */
	function kidsWizardGoToStep(n) {
		n = Math.min(5, Math.max(1, Number(n) || 1));
		if (n === state.wizardStep) return;
		if (n < state.wizardStep) { goToWizardStep(n); return; }
		if (n > (state.maxWizardStep || 1)) { toast('Finish the current step first', 'info'); return; }
		for (var s = state.wizardStep; s < n; s++) {
			if (!validateWizardStep(s)) return;
		}
		goToWizardStep(n);
	}

	/* Step 1 — game type */
	function buildGameTypeGrid() {
		var grid = $('kidsGameTypeGrid');
		if (!grid) return;
		grid.innerHTML = '';
		KIDS_GAME_TYPES.forEach(function (t) {
			var card = document.createElement('div');
			card.className = 'kids-game-type-card' + (state.wizard.game_type === t.id ? ' selected' : '');
			card.innerHTML = '<div class="kids-game-type-icon">' + t.icon + '</div>' +
				'<div class="kids-game-type-name">' + esc(t.label) + '</div>' +
				'<div class="kids-game-type-desc">' + esc(t.desc) + '</div>';
			card.addEventListener('click', function () { selectKidsGameType(t.id); });
			grid.appendChild(card);
		});
	}
	function selectKidsGameType(id) {
		state.wizard.game_type = id;
		buildGameTypeGrid();
		loadKidsBank();
		buildManualForm();
	}

	/* Step 2 — theme */
	function buildThemeGrid() {
		var grid = $('kidsThemeGrid');
		if (!grid) return;
		grid.innerHTML = '';
		KIDS_THEMES.forEach(function (t) {
			var card = document.createElement('div');
			card.className = 'kids-theme-card' + (state.wizard.theme === t ? ' selected' : '');
			card.style.background = THEME_BG[t];
			card.innerHTML = '<div class="kids-theme-name">' + esc(t) + '</div>';
			card.addEventListener('click', function () { selectKidsTheme(t); });
			grid.appendChild(card);
		});
	}
	function selectKidsTheme(id) { state.wizard.theme = id; buildThemeGrid(); }
	function syncWizardSelectionUI() { buildGameTypeGrid(); buildThemeGrid(); }

	/* Step 3 — question sources */
	function kidsWizardSwitchSource(src, btn) {
		document.querySelectorAll('.kids-q-source-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
		document.querySelectorAll('.kids-q-source-panel').forEach(function (p) {
			p.classList.toggle('active', p.dataset.source === src);
		});
		if (src === 'ai') refreshKidsAIModels();
	}
	function wizardKidType() {
		var meta = gameTypeMeta(state.wizard.game_type);
		return meta ? meta.kidType : 'multiple-choice';
	}
	function buildBankTypeFilters() {
		var wrap = $('kidsWizardTypeFilters');
		if (!wrap) return;
		wrap.innerHTML = '';
		[{ id: 'all', label: 'All' }, { id: 'multiple-choice', label: 'MC' }, { id: 'true-false', label: 'T/F' },
			{ id: 'odd-one-out', label: 'Odd' }, { id: 'matching', label: 'Match' }, { id: 'draggable', label: 'Order' },
			{ id: 'fill-blank', label: 'Fill' }, { id: 'code', label: 'Code' }].forEach(function (t) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'filter-badge' + (state.bankTypeFilter === t.id ? ' active' : '');
			b.textContent = t.label;
			b.addEventListener('click', function () { state.bankTypeFilter = t.id; buildBankTypeFilters(); renderKidsBankList(); });
			wrap.appendChild(b);
		});
	}
	function loadKidsBank() {
		var bankEl = $('kidsWizardQuestionBank');
		var catSel = $('kidsWizardCategorySelect');
		if (catSel && catSel.options.length <= 1) {
			window.API.list('categories', { limit: 200 }).then(function (res) {
				var cats = (res && res.data) || res || [];
				cats.forEach(function (c) {
					var opt = document.createElement('option');
					opt.value = c.id; opt.textContent = c.name;
					catSel.appendChild(opt);
				});
			}).catch(function () { });
		}
		if (bankEl) bankEl.innerHTML = '<div class="empty-state-small">Loading question bank…</div>';
		window.API.list('questions', { limit: 200 }).then(function (res) {
			var rows = (res && res.data) || res || [];
			state.bankRawRows = {};
			rows.forEach(function (r) { if (r && r.id) state.bankRawRows[r.id] = r; });
			state.bank = rows.map(normalizeKidQuestion);
			renderKidsBankList();
		}).catch(function (err) {
			if (bankEl) bankEl.innerHTML = '<div class="empty-state-small">Bank unavailable: ' + esc(err && err.message) + '</div>';
		});
	}
	function filterKidsWizardQuestions() { renderKidsBankList(); }
	function renderKidsBankList() { renderKidsWizardQuestionBank(); }
	function renderKidsWizardQuestionBank() {
		var bankEl = $('kidsWizardQuestionBank');
		if (!bankEl) return;
		var search = String(($('kidsWizardQuestionSearch') || {}).value || '').toLowerCase();
		var cat = ($('kidsWizardCategorySelect') || {}).value || '';
		var wantType = wizardKidType();
		var selectedIds = {};
		state.wizard.questions.forEach(function (q) { selectedIds[q.id] = true; });
		var items = state.bank.filter(function (q) {
			if (state.wizard.game_type !== 'code-explorer' && q.type !== wantType) return false;
			if (state.bankTypeFilter !== 'all' && q.type !== state.bankTypeFilter) return false;
			if (search && String(q.text || '').toLowerCase().indexOf(search) < 0) return false;
			if (cat) {
				var rawRow = (state.bankRawRows || {})[q.id] || {};
				if (String(rawRow.category_id || '') !== String(cat)) return false;
			}
			return true;
		});
		if (!items.length) {
			bankEl.innerHTML = '<div class="empty-state-small">No matching questions. Try the 🤖 AI Generate tab.</div>';
			return;
		}
		bankEl.innerHTML = '';
		items.slice(0, 120).forEach(function (q) {
			var row = document.createElement('div');
			row.className = 'kids-bank-question-item' + (selectedIds[q.id] ? ' selected' : '');
			row.innerHTML = '<input type="checkbox" class="kids-bank-question-check"' + (selectedIds[q.id] ? ' checked' : '') + ' />' +
				'<span class="kids-bank-question-text">' + esc(q.text) + '</span>' +
				'<span class="kids-bank-question-type">' + esc(q.type) + '</span>';
			row.addEventListener('click', function (e) {
				if (e.target && e.target.tagName === 'INPUT') return;
				toggleKidsWizardQuestionSelect(q.id);
			});
			var box = row.querySelector('input');
			box.addEventListener('change', function () { toggleKidsWizardQuestionSelect(q.id); });
			bankEl.appendChild(row);
		});
	}
	function toggleKidsWizardQuestionSelect(id) {
		var idx = -1;
		for (var i = 0; i < state.wizard.questions.length; i++) {
			if (String(state.wizard.questions[i].id) === String(id)) { idx = i; break; }
		}
		if (idx >= 0) { state.wizard.questions.splice(idx, 1); }
		else {
			var found = null;
			for (var j = 0; j < state.bank.length; j++) {
				if (String(state.bank[j].id) === String(id)) { found = state.bank[j]; break; }
			}
			if (found) state.wizard.questions.push(found);
		}
		renderKidsWizardSelectedQuestions();
		renderKidsBankList();
	}
	function renderKidsWizardSelectedQuestions() {
		var list = $('kidsSelectedQuestionsList');
		var count = $('kidsSelectedCount');
		if (count) count.textContent = String(state.wizard.questions.length);
		if (!list) return;
		if (!state.wizard.questions.length) {
			list.innerHTML = '<div class="empty-state-small">No questions selected yet.</div>';
			return;
		}
		list.innerHTML = '';
		state.wizard.questions.forEach(function (q) {
			var row = document.createElement('div');
			row.className = 'kids-selected-item';
			row.innerHTML = '<span>' + esc(q.text) + ' <small>(' + esc(q.type) + ')</small></span>';
			var btn = document.createElement('button');
			btn.type = 'button'; btn.className = 'remove-btn'; btn.textContent = '✕';
			btn.addEventListener('click', function () { removeKidsWizardSelectedQuestion(q.id); });
			row.appendChild(btn);
			list.appendChild(row);
		});
	}
	function removeKidsWizardSelectedQuestion(id) {
		state.wizard.questions = state.wizard.questions.filter(function (q) { return String(q.id) !== String(id); });
		renderKidsWizardSelectedQuestions();
		renderKidsBankList();
	}

	/* Step 3 — AI generate (plan §3/§8) */
	/* Step 3 — AI model picker (shares the school's AI configs). */
	function kidsAIConfigs() { return state.aiConfigs || []; }
	function showKidsAIError(msg, showSettingsHint) {
		var box = $('kidsAIError');
		if (!box) { toast(msg, 'error'); return; }
		box.hidden = false;
		box.innerHTML = '';
		var p = document.createElement('p');
		p.textContent = msg;
		box.appendChild(p);
		if (showSettingsHint) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'btn btn-secondary';
			btn.textContent = 'Open AI Settings';
			btn.addEventListener('click', openKidsAISettings);
			box.appendChild(btn);
		}
	}
	function hideKidsAIError() {
		var box = $('kidsAIError');
		if (box) { box.hidden = true; box.innerHTML = ''; }
	}
	function openKidsAISettings() {
		if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
		else toast('Open Settings → AI Generation to configure a model', 'info');
	}
	function refreshKidsAIModels() {
		var sel = $('kidsAIModel');
		var warn = $('kidsAINoModel');
		if (!sel) return;
		if (!window.API || typeof window.API.raw !== 'function') {
			state.aiConfigs = [];
			sel.innerHTML = '<option value="">No models available</option>';
			if (warn) warn.hidden = false;
			return;
		}
		var render = function () {
			var configs = kidsAIConfigs();
			sel.innerHTML = '';
			if (!configs.length) {
				var opt = document.createElement('option');
				opt.value = '';
				opt.textContent = 'No models available';
				sel.appendChild(opt);
				if (warn) warn.hidden = false;
				return;
			}
			if (warn) warn.hidden = true;
			var shared = configs.filter(function (c) { return c.is_shared; });
			var mine = configs.filter(function (c) { return !c.is_shared; });
			var addGroup = function (label, list) {
				if (!list.length) return;
				var group = document.createElement('optgroup');
				group.label = label;
				list.forEach(function (c) {
					var opt = document.createElement('option');
					opt.value = c.id;
					opt.textContent = (c.name || c.model_id) + ' (' + (c.provider || '?') + ')' + (c.is_default ? ' ★' : '');
					group.appendChild(opt);
				});
				sel.appendChild(group);
			};
			addGroup('Shared models', shared);
			addGroup('My models', mine);
			// Restore the teacher's last pick (shared with the main AI
			// generator), else the school default, else the first entry.
			var saved = null;
			try { saved = localStorage.getItem('quizAISelectedConfig'); } catch (_) {}
			var has = function (id) { return configs.some(function (c) { return String(c.id) === String(id); }); };
			if (saved && has(saved)) sel.value = saved;
			else {
				var def = configs.filter(function (c) { return c.is_default; })[0] || configs[0];
				if (def) sel.value = def.id;
			}
		};
		if (state.aiConfigs) { render(); return; }
		window.API.raw('GET', '/ai/configs').then(function (res) {
			var list = Array.isArray(res) ? res : ((res && (res.data || res.configs || res.items)) || []);
			state.aiConfigs = Array.isArray(list) ? list : [];
			render();
		}).catch(function () {
			state.aiConfigs = [];
			render();
		});
	}
	function generateKidsAIQuestions() {
		if (!state.wizard.game_type) { toast('Pick a game type first (Step 1)', 'warning'); return; }
		var topic = String(($('kidsAITopic') || {}).value || '').trim();
		if (!topic) { toast('Enter a topic', 'warning'); return; }
		hideKidsAIError();
		var btn = $('kidsAIGenerateBtn');
		if (btn) { btn.disabled = true; var loader = btn.querySelector('.btn-loader'); if (loader) loader.hidden = false; }
		var configId = ($('kidsAIModel') || {}).value || null;
		kidsApi('POST', '/ai/generate', {
			game_type: state.wizard.game_type,
			topic: topic,
			count: Number(($('kidsAICount') || {}).value) || 5,
			grade: ($('kidsAIGrade') || {}).value || 'cp',
			language: ($('kidsAILanguage') || {}).value || 'fr',
			configId: configId,
		}).then(function (res) {
			state.aiResults = ((res && res.data) || []).map(normalizeKidQuestion);
			if (!state.aiResults.length) {
				showKidsAIError('The model returned no usable questions — try again or pick a stronger model.', false);
				return;
			}
			renderAiResults();
			toast(state.aiResults.length + ' questions generated', 'success');
		}).catch(function (err) {
			var msg = String((err && err.message) || 'Generation failed');
			var noModel = /NO_AI_CONFIG|No AI model/i.test(msg);
			showKidsAIError(
				noModel
					? 'No AI model is available. Ask an admin to add a shared model in Settings → AI Generation, or add your own personal model there.'
					: ('AI generation failed: ' + msg),
				noModel,
			);
			toast('AI generation failed', 'error');
		}).finally(function () {
			if (btn) { btn.disabled = false; var loader = btn.querySelector('.btn-loader'); if (loader) loader.hidden = true; }
		});
	}
	function renderAiResults() {
		var wrap = $('kidsAIGeneratedQuestions');
		var list = $('kidsAIGeneratedList');
		if (!wrap || !list) return;
		wrap.hidden = !state.aiResults.length;
		list.innerHTML = '';
		state.aiResults.forEach(function (q) {
			var div = document.createElement('div');
			div.className = 'kids-ai-question-item';
			div.innerHTML = '<span class="kids-ai-question-type">' + esc(q.type) + '</span>' +
				'<span class="kids-ai-question-text">' + esc(q.text) + '<br><small>' + esc((parseJsonSafe(q.options_json, []).join(' · '))) + '</small></span>';
			list.appendChild(div);
		});
	}
	function addKidsAIQuestionsToGame() {
		if (!state.aiResults.length) return;
		var have = {};
		state.wizard.questions.forEach(function (q) { have[q.id] = true; });
		state.aiResults.forEach(function (q) { if (!have[q.id]) state.wizard.questions.push(q); });
		renderKidsWizardSelectedQuestions();
		toast(state.aiResults.length + ' AI questions added', 'success');
	}

	/* Step 3 — manual entry */
	function buildManualForm() {
		var form = $('kidsManualQuestionForm');
		if (!form) return;
		var t = wizardKidType();
		var optionsHint = 'Comma-separated options (first = correct), e.g. Shark, Lion, Eagle';
		if (t === 'true-false') optionsHint = null;
		if (t === 'matching') optionsHint = 'One pair per line as "left --> right", e.g. Cat --> Chat';
		if (t === 'draggable') optionsHint = 'Items in the CORRECT order, comma-separated';
		if (t === 'fill-blank') optionsHint = 'Word bank, comma-separated (answer = correct word)';
		form.innerHTML =
			'<div class="form-group"><label>Question text' + (t === 'fill-blank' ? ' (use ___ for the blank)' : '') + '</label>' +
			'<input type="text" id="kidsManualText" class="form-control" placeholder="e.g. Which animal lives in the ocean?" /></div>' +
			(optionsHint ? '<div class="form-group"><label>Options</label>' +
				(t === 'matching'
					? '<textarea id="kidsManualOptions" class="form-control" rows="3" placeholder="Cat --> Chat&#10;Dog --> Chien"></textarea>'
					: '<input type="text" id="kidsManualOptions" class="form-control" placeholder="' + esc(optionsHint) + '" />') + '</div>' : '') +
			'<div class="form-row"><div class="form-group half"><label>Answer</label>' +
			(t === 'true-false'
				? '<select id="kidsManualAnswer" class="form-control"><option value="true">True ✅</option><option value="false">False ❌</option></select>'
				: '<input type="text" id="kidsManualAnswer" class="form-control" placeholder="Exact correct answer" />') +
			'</div><div class="form-group half"><label>Points</label>' +
			'<input type="number" id="kidsManualPoints" class="form-control" min="1" max="10" value="1" /></div></div>';
		renderKidsManualQuestions();
	}
	function addKidsManualQuestion() {
		var t = wizardKidType();
		var text = String(($('kidsManualText') || {}).value || '').trim();
		var answer = String(($('kidsManualAnswer') || {}).value || '').trim();
		var optionsRaw = ($('kidsManualOptions') || {}).value || '';
		if (!text || !answer) { toast('Text and answer are required', 'warning'); return; }
		var options = [];
		if (t === 'true-false') options = ['True', 'False'];
		else if (t === 'matching') {
			options = String(optionsRaw).split('\n').map(function (s) { return String(s).trim(); }).filter(Boolean);
			answer = options.slice(0, 4).join(',');
		} else {
			options = String(optionsRaw).split(',').map(function (s) { return String(s).trim(); }).filter(Boolean);
		}
		var q = normalizeKidQuestion({
			type: t, text: text,
			options_json: JSON.stringify(options),
			answer: answer,
			points: Number(($('kidsManualPoints') || {}).value) || 1,
			difficulty: 'easy',
		});
		if (state.wizard.game_type === 'star-collector') q.allowMultipleAnswers = true;
		state.wizard.questions.push(q);
		state.manualList.push(q);
		$('kidsManualText').value = '';
		if ($('kidsManualOptions')) $('kidsManualOptions').value = '';
		if ($('kidsManualAnswer') && $('kidsManualAnswer').tagName === 'INPUT') $('kidsManualAnswer').value = '';
		renderKidsWizardSelectedQuestions();
		renderKidsManualQuestions();
	}
	function renderKidsManualQuestions() {
		var list = $('kidsManualSelectedList');
		var count = $('kidsManualSelectedCount');
		if (count) count.textContent = String(state.manualList.length);
		if (!list) return;
		list.innerHTML = state.manualList.length
			? ''
			: '<div class="empty-state-small">No manual questions yet.</div>';
		state.manualList.forEach(function (q) {
			var row = document.createElement('div');
			row.className = 'kids-selected-item';
			row.textContent = q.text;
			list.appendChild(row);
		});
	}

	/* Step 5 — preview + publish */
	function collectWizardPayload() {
		return {
			name: String($('kidsGameName').value || '').trim(),
			description: String($('kidsGameDescription').value || '').trim() || null,
			game_type: state.wizard.game_type,
			theme: state.wizard.theme || 'jungle',
			grade: $('kidsGameGrade').value || null,
			subject: String($('kidsGameSubject').value || '').trim() || null,
			questions_json: JSON.stringify(state.wizard.questions),
			config_json: JSON.stringify({
				time_per_q: Number($('kidsGameTimePerQ').value) || 15,
				max_hints: Number($('kidsGameMaxHints').value) || 0,
				mascot_theme: $('kidsGameMascotTheme').value || null,
				allow_replay: $('kidsGameAllowReplay').checked !== false,
				show_explanations: $('kidsGameShowExplanations').checked !== false,
			}),
		};
	}
	function updateKidsWizardPreview() {
		var prev = $('kidsWizardPreview');
		if (!prev) return;
		var meta = gameTypeMeta(state.wizard.game_type) || {};
		prev.innerHTML =
			'<div class="preview-row"><span class="preview-label">Game</span><span class="preview-value">' + esc(meta.icon || '') + ' ' + esc(meta.label || state.wizard.game_type) + '</span></div>' +
			'<div class="preview-row"><span class="preview-label">Name</span><span class="preview-value">' + esc($('kidsGameName').value || '—') + '</span></div>' +
			'<div class="preview-row"><span class="preview-label">Theme / Grade / Subject</span><span class="preview-value">' + esc(state.wizard.theme) + ' · ' + esc($('kidsGameGrade').value || '—') + ' · ' + esc($('kidsGameSubject').value || '—') + '</span></div>' +
			'<div class="preview-row"><span class="preview-label">Questions</span><span class="preview-value">' + state.wizard.questions.length + ' question(s)</span></div>';
	}
	function publishKidsGame(presetId) {
		var id = presetId || state.editingId || ($('kidsGameWizardId') || {}).value || null;
		var doPublish = function (gameId) {
			return kidsApi('POST', '/' + encodeURIComponent(gameId) + '/publish').then(function (game) {
				state.lastPublished = game;
				closeKidsGameWizard();
				renderKidsGameList();
				openKidsShareModal(game.id, game);
				toast('Game published! PIN: ' + game.pin, 'success');
			});
		};
		if (id && String(id).length > 10) {
			// Publish an existing (possibly edited) game.
			var payload;
			try { payload = collectWizardPayload(); } catch (_) { payload = null; }
			var chain = payload && payload.name && state.wizard.questions.length
				? kidsApi('PATCH', '/' + encodeURIComponent(id), payload)
				: Promise.resolve(null);
			return chain.then(function () { return doPublish(id); })
				.catch(function (err) { toast('Publish failed: ' + (err && err.message), 'error'); });
		}
		var data;
		try { data = collectWizardPayload(); } catch (e) { toast('Could not read the form', 'error'); return Promise.resolve(); }
		if (!data.name) { toast('Give your game a name (Step 4)', 'warning'); return Promise.resolve(); }
		if (!data.game_type) { toast('Pick a game type (Step 1)', 'warning'); return Promise.resolve(); }
		if (!state.wizard.questions.length) { toast('Add at least one question (Step 3)', 'warning'); return Promise.resolve(); }
		return kidsApi('POST', '', data).then(function (game) {
			state.editingId = game.id;
			return doPublish(game.id);
		}).catch(function (err) { toast('Publish failed: ' + (err && err.message), 'error'); });
	}

	/* Share modal (plan §5.3 step 5) */
	function playUrl(pin) { return window.location.origin + '/kids/play/' + encodeURIComponent(pin); }
	function openKidsShareModal(id, preloaded) {
		var done = function (game) {
			state.lastPublished = game;
			$('kidsSharePin').textContent = game.pin || '----';
			$('kidsShareUrl').textContent = game.pin ? playUrl(game.pin) : '—';
			var qr = $('kidsShareQR');
			if (qr) {
				qr.innerHTML = '';
				try {
					if (game.pin && window.qrcode) {
						var qrObj = window.qrcode(0, 'M');
						qrObj.addData(playUrl(game.pin));
						qrObj.make();
						qr.innerHTML = qrObj.createImgTag(4, 4);
					} else if (game.pin) {
						qr.innerHTML = '<a href="' + esc(playUrl(game.pin)) + '">' + esc(playUrl(game.pin)) + '</a>';
					}
				} catch (_) { qr.textContent = game.pin ? playUrl(game.pin) : ''; }
			}
			setModal('kidsGameShareModal', true);
		};
		if (preloaded && preloaded.pin) { done(preloaded); return; }
		kidsApi('GET', '/' + encodeURIComponent(id)).then(done)
			.catch(function (err) { toast('Could not load game: ' + (err && err.message), 'error'); });
	}
	function closeKidsShareModal() { setModal('kidsGameShareModal', false); }
	function printKidsPinCard() {
		var game = state.lastPublished;
		if (!game || !game.pin) { toast('Nothing to print yet', 'warning'); return; }
		var meta = gameTypeMeta(game.game_type) || {};
		var w = window.open('', '_blank');
		if (!w) return;
		w.document.write('<!DOCTYPE html><html><head><title>' + esc(game.name) + ' — PIN card</title><style>' +
			'body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;margin:0}' +
			'.card{background:#fff;border-radius:24px;padding:48px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.15)}' +
			'.pin{font-size:72px;font-weight:800;letter-spacing:.3em;font-family:monospace}' +
			'</style></head><body><div class="card"><div style="font-size:48px">' + (meta.icon || '🧸') + '</div>' +
			'<h1>' + esc(game.name) + '</h1><div class="pin">' + esc(game.pin) + '</div>' +
			'<p>Go to <b>' + esc(playUrl(game.pin)) + '</b> and type this PIN 🎮</p>' +
			'</div><script>window.print()<\/script></body></html>');
		w.document.close();
	}
	function copyKidsShareUrl() {
		var game = state.lastPublished;
		if (!game || !game.pin) return;
		var url = playUrl(game.pin);
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url);
		toast('Link copied: ' + url, 'success');
	}
	function previewKidsGame(id) {
		var open = function (game) {
			if (!game.pin) { toast('Publish the game first to preview it as a kid', 'warning'); return; }
			window.open(playUrl(game.pin), '_blank');
		};
		if (id && !state.games.length) { kidsApi('GET', '/' + encodeURIComponent(id)).then(open).catch(function (e) { toast(e.message, 'error'); }); return; }
		var game = null;
		for (var i = 0; i < state.games.length; i++) if (String(state.games[i].id) === String(id)) game = state.games[i];
		if (game) open(game);
		else if (id) kidsApi('GET', '/' + encodeURIComponent(id)).then(open).catch(function (e) { toast(e.message, 'error'); });
	}

	/* Card actions */
	function deleteKidsGame(id) {
		if (!window.confirm('Delete this kids game permanently?')) return;
		kidsApi('DELETE', '/' + encodeURIComponent(id)).then(function () {
			toast('Kids game deleted', 'success');
			renderKidsGameList();
		}).catch(function (err) { toast('Delete failed: ' + (err && err.message), 'error'); });
	}
	function archiveKidsGame(id) {
		kidsApi('POST', '/' + encodeURIComponent(id) + '/archive').then(function () {
			toast('Kids game archived', 'success');
			renderKidsGameList();
		}).catch(function (err) { toast('Archive failed: ' + (err && err.message), 'error'); });
	}

	/* Results (plan §13) */
	function openKidsResultsModal(id) {
		kidsApi('GET', '/' + encodeURIComponent(id) + '/sessions').then(function (res) {
			var sessions = (res && res.data) || [];
			var game = null;
			for (var i = 0; i < state.games.length; i++) if (String(state.games[i].id) === String(id)) game = state.games[i];
			var questions = game ? parseJsonSafe(game.questions_json, []) : [];
			var totalPlays = sessions.length;
			var avgScore = totalPlays ? sessions.reduce(function (s, x) { return s + (Number(x.score) || 0); }, 0) / totalPlays : 0;
			var avgStars = totalPlays ? sessions.reduce(function (s, x) { return s + (Number(x.stars) || 0); }, 0) / totalPlays : 0;
			var acc = {};
			sessions.forEach(function (sess) {
				(parseJsonSafe(sess.answers_json, [])).forEach(function (a) {
					if (!acc[a.question_id]) acc[a.question_id] = { ok: 0, n: 0 };
					acc[a.question_id].n += 1;
					if (a.correct) acc[a.question_id].ok += 1;
				});
			});
			var qRows = questions.map(function (q) {
				var st = acc[q.id] || { ok: 0, n: 0 };
				var pct = st.n ? Math.round((st.ok / st.n) * 100) : null;
				return '<tr><td>' + esc(String(q.text || '').slice(0, 80)) + '</td><td>' + (pct == null ? '—' : pct + '% (' + st.ok + '/' + st.n + ')') + '</td></tr>';
			}).join('');
			var sRows = sessions.slice(0, 100).map(function (s) {
				return '<tr><td>' + esc(s.player_name || '—') + ' ' + esc(s.avatar || '') + '</td><td>' + esc(s.score) + '</td><td>' + esc(s.stars) + '⭐</td><td>' + esc(String(s.created_at || '').slice(0, 16).replace('T', ' ')) + '</td></tr>';
			}).join('');
			var overlay = document.createElement('div');
			overlay.className = 'modal arena-editor-modal';
			overlay.style.display = 'flex';
			overlay.innerHTML = '<div class="modal-content modal-lg arena-editor-content" style="max-width:720px">' +
				'<div class="modal-header arena-editor-header"><div><span class="arena-eyebrow">Kids Games Studio</span>' +
				'<h2>Results — ' + esc(game ? game.name : '') + '</h2></div>' +
				'<button type="button" class="arena-modal-close" aria-label="Close">×</button></div>' +
				'<div style="padding:20px;overflow-y:auto;max-height:65vh">' +
				'<p><b>' + totalPlays + '</b> plays · avg score <b>' + avgScore.toFixed(1) + '</b> · avg <b>' + avgStars.toFixed(1) + '⭐</b></p>' +
				'<h4>Per-question accuracy</h4><div class="table-container"><table class="data-table"><thead><tr><th>Question</th><th>Accuracy</th></tr></thead><tbody>' + (qRows || '<tr><td colspan="2">No data yet</td></tr>') + '</tbody></table></div>' +
				'<h4 style="margin-top:16px">Sessions</h4><div class="table-container"><table class="data-table"><thead><tr><th>Player</th><th>Score</th><th>Stars</th><th>Date</th></tr></thead><tbody>' + (sRows || '<tr><td colspan="4">No plays yet</td></tr>') + '</tbody></table></div>' +
				'</div></div>';
			document.body.appendChild(overlay);
			var close = function () { overlay.remove(); };
			overlay.querySelector('.arena-modal-close').addEventListener('click', close);
			overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
		}).catch(function (err) { toast('Could not load results: ' + (err && err.message), 'error'); });
	}

	/* ── Init ──────────────────────────────────────────────────────────────── */
	/**
	 * Document-level safety net: if a control was (re)created without a
	 * direct binding (DOM replacement, binding skipped, etc.), the click
	 * still reaches the wizard. Directly-bound elements carry __kidsBound
	 * and are skipped here so handlers never fire twice.
	 */
	function bindDelegatedFallback() {
		if (document.__kidsDelegatedFallback) return;
		document.__kidsDelegatedFallback = true;
		document.addEventListener('click', function (e) {
			if (!e || !e.target || !e.target.closest) return;
			var addBtn = e.target.closest('#addKidsGameBtn');
			if (addBtn && !addBtn.__kidsBound) {
				e.preventDefault();
				openKidsGameWizard(null);
			}
		});
	}
	function bindStaticControls() {
		var addBtn = $('addKidsGameBtn');
		if (addBtn && !addBtn.__kidsBound) { addBtn.__kidsBound = true; addBtn.addEventListener('click', function () { openKidsGameWizard(null); }); }
		var closeBtn = $('closeKidsWizardBtn');
		if (closeBtn && !closeBtn.__kidsBound) { closeBtn.__kidsBound = true; closeBtn.addEventListener('click', closeKidsGameWizard); }
		var closeShare = $('closeKidsShareBtn');
		if (closeShare && !closeShare.__kidsBound) { closeShare.__kidsBound = true; closeShare.addEventListener('click', closeKidsShareModal); }
		var aiBtn = $('kidsAIGenerateBtn');
		if (aiBtn && !aiBtn.__kidsBound) { aiBtn.__kidsBound = true; aiBtn.addEventListener('click', generateKidsAIQuestions); }
		var aiAdd = $('kidsAIAddAllBtn');
		if (aiAdd && !aiAdd.__kidsBound) { aiAdd.__kidsBound = true; aiAdd.addEventListener('click', addKidsAIQuestionsToGame); }
		var aiModel = $('kidsAIModel');
		if (aiModel && !aiModel.__kidsBound) {
			aiModel.__kidsBound = true;
			aiModel.addEventListener('change', function () {
				try { localStorage.setItem('quizAISelectedConfig', aiModel.value || ''); } catch (_) {}
			});
		}
		var aiSettingsBtn = $('kidsAIModelSettingsBtn');
		if (aiSettingsBtn && !aiSettingsBtn.__kidsBound) { aiSettingsBtn.__kidsBound = true; aiSettingsBtn.addEventListener('click', openKidsAISettings); }
		var aiOpenSettings = $('kidsAIOpenSettingsBtn');
		if (aiOpenSettings && !aiOpenSettings.__kidsBound) { aiOpenSettings.__kidsBound = true; aiOpenSettings.addEventListener('click', openKidsAISettings); }
		var manAdd = $('kidsAddManualQuestionBtn');
		if (manAdd && !manAdd.__kidsBound) { manAdd.__kidsBound = true; manAdd.addEventListener('click', addKidsManualQuestion); }
		var qSearch = $('kidsWizardQuestionSearch');
		if (qSearch && !qSearch.__kidsBound) { qSearch.__kidsBound = true; qSearch.addEventListener('input', filterKidsWizardQuestions); }
		var qCat = $('kidsWizardCategorySelect');
		if (qCat && !qCat.__kidsBound) { qCat.__kidsBound = true; qCat.addEventListener('change', filterKidsWizardQuestions); }
		['kidsGameFilterGameType', 'kidsGameFilterGrade', 'kidsGameFilterSubject', 'kidsGameFilterStatus', 'kidsGameFilterTeacher'].forEach(function (id) {
			var el = $(id);
			if (el && !el.__kidsBound) { el.__kidsBound = true; el.addEventListener('change', applyKidsGameFilters); }
		});
		var sEl = $('kidsGameFilterSearch');
		if (sEl && !sEl.__kidsBound) { sEl.__kidsBound = true; sEl.addEventListener('input', applyKidsGameFilters); }
		document.querySelectorAll('.kids-q-source-btn').forEach(function (b) {
			if (b.__kidsBound) return;
			b.__kidsBound = true;
			b.addEventListener('click', function () { kidsWizardSwitchSource(b.dataset.source, b); });
		});
		var form = $('kidsGameWizardForm');
		if (form && !form.__kidsBound) {
			form.__kidsBound = true;
			form.addEventListener('submit', function (e) { e.preventDefault(); kidsWizardNextStep(); });
		}
		var backBtn = $('kidsWizardBackBtn');
		if (backBtn && !backBtn.__kidsBound) { backBtn.__kidsBound = true; backBtn.addEventListener('click', kidsWizardPrevStep); }
		var nextBtn = $('kidsWizardNextBtn');
		if (nextBtn && !nextBtn.__kidsBound) { nextBtn.__kidsBound = true; nextBtn.addEventListener('click', kidsWizardNextStep); }
		var pubBtn = $('kidsWizardPublishBtn');
		if (pubBtn && !pubBtn.__kidsBound) { pubBtn.__kidsBound = true; pubBtn.addEventListener('click', function () { publishKidsGame(); }); }
		var sharePrint = $('kidsSharePrintBtn');
		if (sharePrint && !sharePrint.__kidsBound) { sharePrint.__kidsBound = true; sharePrint.addEventListener('click', printKidsPinCard); }
		var shareCopy = $('kidsShareCopyBtn');
		if (shareCopy && !shareCopy.__kidsBound) { shareCopy.__kidsBound = true; shareCopy.addEventListener('click', copyKidsShareUrl); }
		var sharePrev = $('kidsSharePreviewBtn');
		if (sharePrev && !sharePrev.__kidsBound) {
			sharePrev.__kidsBound = true;
			sharePrev.addEventListener('click', function () {
				var game = state.lastPublished;
				previewKidsGame(game && game.id);
			});
		}
		document.querySelectorAll('#kidsWizardProgress .kw-step').forEach(function (s) {
			if (s.__kidsBound) return;
			s.__kidsBound = true;
			s.addEventListener('click', function () { kidsWizardGoToStep(Number(s.dataset.step)); });
		});
	}

	/* Globals required by admin.html inline handlers */
	window.switchGamesStudioTab = function (tab) {
		if (tab === 'kids-games-studio') setTimeout(renderKidsGameList, 0);
	};
	window.renderKidsGameList = renderKidsGameList;
	window.applyKidsGameFilters = applyKidsGameFilters;
	window.resetKidsGameFilters = resetKidsGameFilters;
	window.openKidsGameWizard = openKidsGameWizard;
	window.closeKidsGameWizard = closeKidsGameWizard;
	window.kidsWizardNextStep = kidsWizardNextStep;
	window.kidsWizardPrevStep = kidsWizardPrevStep;
	window.kidsWizardGoToStep = kidsWizardGoToStep;
	window.selectKidsGameType = selectKidsGameType;
	window.selectKidsTheme = selectKidsTheme;
	window.kidsWizardSwitchSource = kidsWizardSwitchSource;
	window.renderKidsWizardQuestionBank = renderKidsWizardQuestionBank;
	window.filterKidsWizardQuestions = filterKidsWizardQuestions;
	window.toggleKidsWizardQuestionSelect = toggleKidsWizardQuestionSelect;
	window.renderKidsWizardSelectedQuestions = renderKidsWizardSelectedQuestions;
	window.removeKidsWizardSelectedQuestion = removeKidsWizardSelectedQuestion;
	window.generateKidsAIQuestions = generateKidsAIQuestions;
	window.addKidsAIQuestionsToGame = addKidsAIQuestionsToGame;
	window.refreshKidsAIModels = refreshKidsAIModels;
	window.addKidsManualQuestion = addKidsManualQuestion;
	window.renderKidsManualQuestions = renderKidsManualQuestions;
	window.updateKidsWizardPreview = updateKidsWizardPreview;
	window.publishKidsGame = publishKidsGame;
	window.openKidsShareModal = openKidsShareModal;
	window.closeKidsShareModal = closeKidsShareModal;
	window.printKidsPinCard = printKidsPinCard;
	window.copyKidsShareUrl = copyKidsShareUrl;
	window.previewKidsGame = previewKidsGame;
	window.editKidsGame = editKidsGame;
	window.deleteKidsGame = deleteKidsGame;
	window.archiveKidsGame = archiveKidsGame;
	window.openKidsResultsModal = openKidsResultsModal;
	window.KidsGames = {
		renderList: renderKidsGameList,
		openWizard: openKidsGameWizard,
		state: state,
		normalize: normalizeKidQuestion,
	};

	document.addEventListener('DOMContentLoaded', function () {
		hookStudioTabs();
		bindStaticControls();
		bindDelegatedFallback();
		if (isKidsPaneActive()) renderKidsGameList();
	});
	// The admin shell swaps tabs without reload; bind eagerly too.
	hookStudioTabs();
	bindStaticControls();
	bindDelegatedFallback();
})();

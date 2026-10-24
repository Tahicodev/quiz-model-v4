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
		{ id: 'math-quest', icon: '🦖', label: 'Math Quest', desc: 'Jungle adventure with a map between levels', kidType: 'multiple-choice' },
	];
	var KIDS_THEMES = ['jungle', 'space', 'ocean', 'farm', 'castle', 'dinosaur', 'forest', 'city', 'circus', 'magic', 'school', 'superhero'];
	var KIDS_GRADES = ['maternelle', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'];
	/* Math Quest level editor (config_json.levels) */
	var MQ_ART_VALUES = ['home', 'treasure', 'temple', 'sunset'];
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
		wizard: { game_type: null, theme: 'jungle', questions: [], mqLevels: [] },
		bank: [],
		bankTypeFilter: 'all',
		aiResults: [],
		manualList: [],
		lastPublished: null,
		/** Set once step 5 published successfully: drives the inline PIN block
		 * and turns the footer action into "Done". Cleared on every open. */
		publishedGame: null,
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
	function notifyKidsCatalogChanged() {
		if (typeof window.syncKidsGamesToClients !== 'function') return;
		Promise.resolve(window.syncKidsGamesToClients()).catch(function (err) {
			console.warn('[kids-games] realtime catalog notification failed:', err);
		});
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
	function kidsStudioDenied() {
		try {
			return typeof window.Auth?.canAccessKidsStudio === 'function' &&
				!window.Auth.canAccessKidsStudio();
		} catch (_) { return false; }
	}
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
		// Owner badges are admin-only (hide-owner CSS).
		try {
			container.classList.toggle('hide-owner', !isAdmin());
		} catch (_) { /* ignore */ }
		if (kidsStudioDenied()) {
			container.innerHTML = '<div class="empty-state">Kids Games are not enabled for your account. Ask an admin to grant access in Settings → Teacher Access.</div>';
			return;
		}
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
		// Owner badge (admin-only via hide-owner CSS on the list container).
		var ownerBadge = '';
		try {
			var ownerTid = String(game.teacher_id || game.teacherId || '');
			if (ownerTid) {
				var ownerName = window.TeacherFilter
					? window.TeacherFilter.resolveOwnerName({ ownerId: ownerTid })
					: ownerTid;
				if (ownerName) {
					ownerBadge = '<span class="q-owner-badge" title="Created by">' + esc(ownerName) + '</span>';
				}
			}
		} catch (_) { ownerBadge = ''; }
		return '' +
			'<div class="kids-game-card">' +
			'<div class="kids-game-card-thumb" style="background:' + bg + '">' +
			'<span class="kids-game-card-type-badge">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
			'<span class="kids-game-card-status ' + esc(status) + '">' + esc(status) + '</span>' +
			'</div>' +
			'<div class="kids-game-card-body">' +
			'<h4 class="kids-game-card-name">' + esc(game.name) + '</h4>' +
			'<div class="kids-game-card-meta">' + grade + subject + pin +
			'<span class="meta-item">❓ ' + questions.length + ' questions</span>' + ownerBadge + '</div>' +
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
		if (kidsStudioDenied()) {
			toast('Kids Games are not enabled for your account. Ask an admin to grant access.', 'error');
			return;
		}
		// The modal opens FIRST so a failure in any data-loading step can
		// never leave the teacher with a dead button and no feedback.
		try {
			state.editingId = editId || null;
			state.wizardStep = 1;
			state.maxWizardStep = 1;
			state.wizard = { game_type: null, theme: 'jungle', questions: [], mqLevels: [] };
			state.aiResults = [];
			state.manualList = [];
			state.publishedGame = null;
			resetPublishResultPanels();
			setFormValue('kidsGameWizardId', editId || '');
			var titleEl = $('kidsWizardTitle');
			if (titleEl) titleEl.textContent = editId ? 'Edit Kids Game' : 'Create Kids Game';
			buildGameTypeGrid();
			buildThemeGrid();
			buildBankTypeFilters();
			renderKidsManualQuestions();
			if (editId) {
				kidsApi('GET', '/' + encodeURIComponent(editId)).then(function (game) {
					state.wizard.game_type = game.game_type;
					state.wizard.theme = game.theme || 'jungle';
					state.wizard.questions = parseJsonSafe(game.questions_json, []).map(normalizeKidQuestion);
					var cfg = parseJsonSafe(game.config_json, {});
					hydrateMqLevels(cfg);
					setFormValue('kidsGameName', game.name || '');
					setFormValue('kidsGameSubject', game.subject || '');
					setFormValue('kidsAIGrade', game.grade || 'cp');
					setFormValue('kidsGameDescription', game.description || '');
					if (cfg.time_per_q) setFormValue('kidsGameTimePerQ', cfg.time_per_q);
					if (cfg.max_hints != null) setFormValue('kidsGameMaxHints', cfg.max_hints);
					if (cfg.mascot_theme) setFormValue('kidsGameMascotTheme', cfg.mascot_theme);
					setChecked('kidsGameAllowReplay', cfg.allow_replay !== false);
					setChecked('kidsGameShowExplanations', cfg.show_explanations !== false);
					syncWizardSelectionUI();
					renderKidsWizardSelectedQuestions();
					syncMqLevelsVisibility();
					safeLoadKidsBank();
				}).catch(function (err) { toast('Could not load game: ' + (err && err.message), 'error'); });
			} else {
				setFormValue('kidsGameName', '');
				setFormValue('kidsGameSubject', '');
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
		if (n === 3 && incompatibleSelected().length) {
			toast(incompatibleSelected().length + ' selected question(s) cannot be played in this game type — remove them first', 'warning');
			return false;
		}
		if (n === 4 && !String(($('kidsGameName') || {}).value || '').trim()) { toast('Give your game a name', 'warning'); return false; }
		if (n === 4 && state.wizard.game_type === 'math-quest') {
			ensureMqLevels(); // auto-align the plan with the current questions
			var covered = 0;
			state.wizard.mqLevels.forEach(function (lv) { covered += Math.max(0, Math.floor(Number(lv.count) || 0)); });
			if (covered !== state.wizard.questions.length) { toast('Level plan does not cover every question', 'warning'); return false; }
		}
		return true;
	}
	function goToWizardStep(n) {
		state.wizardStep = Math.min(5, Math.max(1, n));
		if (state.maxWizardStep == null || state.wizardStep > state.maxWizardStep) state.maxWizardStep = state.wizardStep;
		// Math Quest: re-sync the level plan with the current questions every
		// time step 4 is entered (questions are picked in step 3, AFTER the
		// plan was first initialized at game-type selection).
		if (state.wizardStep === 4) { ensureMqLevels(); }
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
		if (state.wizardStep === 5) { renderPublishChecklist(); updateKidsWizardPreview(); }
		var nextBtn = $('kidsWizardNextBtn'), backBtn = $('kidsWizardBackBtn'), pubBtn = $('kidsWizardPublishBtn');
		if (nextBtn) {
			nextBtn.hidden = state.wizardStep === 5;
			nextBtn.textContent = state.wizardStep === 4 ? 'Review →' : 'Next →';
		}
		if (backBtn) backBtn.disabled = state.wizardStep === 1;
		if (pubBtn) {
			pubBtn.hidden = state.wizardStep !== 5;
			// After publishing the same button finishes the job — the wizard
			// stays open so the teacher can read the PIN, copy it, or make a
			// championship out of the game they just published.
			pubBtn.textContent = state.publishedGame ? 'Done ✓' : 'Publish Game 🚀';
			pubBtn.className = state.publishedGame ? 'btn btn-secondary' : 'btn btn-success';
		}
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
		renderKidsWizardSelectedQuestions();
		syncMqLevelsVisibility();
	}

	/* ── Math Quest multi-level editor (step 4, math-quest only) ─────────
	   Every question is assigned to exactly one level via contiguous ranges
	   over state.wizard.questions (same order the kid plays them in). A
	   level entry stores its question COUNT; the level ids are stable
	   random strings, kept across splits/merges so saved progress in the
	   KidQuestProgress table survives edits of level names/titles. */
	function mqNewLevelId() { return 'lv-' + Math.random().toString(36).slice(2, 10); }
	function mqSinglePlan() {
		state.wizard.mqLevels = [{
			id: mqNewLevelId(), name: 'Level 1', pass_stars: 1, art: 'home',
			count: state.wizard.questions.length || 0,
		}];
	}
	/** Edit modal: turn a persisted config_json.levels plan into editor rows. */
	function hydrateMqLevels(cfg) {
		var type = state.wizard.game_type;
		if (type !== 'math-quest' || !cfg || !Array.isArray(cfg.levels) || !cfg.levels.length) {
			state.wizard.mqLevels = [];
			if (type === 'math-quest') mqSinglePlan();
			return;
		}
		state.wizard.mqLevels = cfg.levels.map(function (lv, i) {
			return {
				id: String(lv.id || mqNewLevelId()).slice(0, 80),
				name: String(lv.name || '').trim().slice(0, 60) || ('Level ' + (i + 1)),
				pass_stars: Math.min(3, Math.max(1, Math.floor(Number(lv.pass_stars) || 1))),
				art: MQ_ART_VALUES.indexOf(lv.art) >= 0 ? lv.art : 'home',
				count: Math.max(0, Math.min(30, (Array.isArray(lv.questions) ? lv.questions : []).length)),
			};
		});
	}
	/** Keep the plan valid when the question list changes (add/remove/swap).
	   Added questions go to the last level; after removals, trailing levels
	   are clamped or dropped (always keeping at least one level). */
	function ensureMqLevels() {
		if (state.wizard.game_type !== 'math-quest') return;
		if (!Array.isArray(state.wizard.mqLevels) || !state.wizard.mqLevels.length) mqSinglePlan();
		var total = 0;
		state.wizard.mqLevels.forEach(function (lv) { total += Math.max(0, Math.floor(Number(lv.count) || 0)); });
		var len = state.wizard.questions.length;
		if (total === len) { syncMqLevelsVisibility(); return; }
		if (!len) { mqSinglePlan(); syncMqLevelsVisibility(); return; }
		if (total < len) {
			var last = state.wizard.mqLevels[state.wizard.mqLevels.length - 1];
			last.count = Math.max(0, Math.floor(Number(last.count) || 0)) + (len - total);
			syncMqLevelsVisibility();
			return;
		}
		var remaining = len, kept = [];
		state.wizard.mqLevels.forEach(function (lv) {
			if (remaining <= 0) return;
			var c = Math.min(Math.max(0, Math.floor(Number(lv.count) || 0)), remaining);
			if (c > 0) { kept.push(Object.assign({}, lv, { count: c })); remaining -= c; }
		});
		if (!kept.length) mqSinglePlan(); else state.wizard.mqLevels = kept;
		syncMqLevelsVisibility();
	}
	function syncMqLevelsVisibility() {
		var group = $('kidsMqLevelsGroup');
		if (!group) return;
		var show = state.wizard.game_type === 'math-quest';
		group.hidden = !show;
		if (show) renderKidsMqLevels();
	}
	/** Star threshold picker for one level. pass_stars is the score the kid
	   must reach on THIS level to pass it and open the next one, so the label
	   names that outcome instead of repeating one sentence per option (the
	   native <option> list this replaced read as three identical
	   "n⭐ to unlock next" rows). Native radios keep arrow-key navigation and
	   screen-reader semantics for free; the star glyphs are decorative and a
	   hidden text label carries the real name. */
	function mqStarPickerHtml(idx, lv, isLast) {
		var current = Math.min(3, Math.max(1, Math.floor(Number(lv.pass_stars) || 1)));
		var label = isLast ? 'Stars to clear the final level' : 'Opens the next level at';
		var pills = [1, 2, 3].map(function (n) {
			var text = n === 1 ? '1 star' : n + ' stars';
			return '<label class="kids-mq-star' + (n === current ? ' is-on' : '') + '" title="' + text + '">' +
				'<input type="radio" class="kids-mq-star-input" name="kidsMqPass' + idx + '" value="' + n + '" data-field="pass_stars"' + (n === current ? ' checked' : '') + ' />' +
				'<span class="kids-mq-star-glyphs" aria-hidden="true">' + '⭐'.repeat(n) + '</span>' +
				'<span class="sr-only">' + text + '</span>' +
			'</label>';
		}).join('');
		return '<div class="kids-mq-control">' +
			'<span class="kids-mq-control-label">' + label + '</span>' +
			'<div class="kids-mq-star-group" role="radiogroup" aria-label="' + esc(label + ' for level ' + (idx + 1)) + '">' + pills + '</div>' +
		'</div>';
	}
	/** A level the teacher never renamed follows its position, so splitting or
	   merging can never leave two cards reading "Level 2". The test is the
	   auto-name shape rather than the level's own number: after a merge the
	   surviving "Level 3" sits at index 2, and matching its number instead of
	   the pattern would fossilise the gap as if the teacher had typed it. */
	function mqIsAutoLevelName(lv) {
		var name = String((lv && lv.name) || '').trim();
		return !name || /^level\s*\d+$/i.test(name);
	}
	function mqRenumberAutoLevels() {
		state.wizard.mqLevels.forEach(function (lv, i) {
			if (mqIsAutoLevelName(lv)) lv.name = 'Level ' + (i + 1);
		});
	}
	function renderKidsMqLevels() {
		var group = $('kidsMqLevelsGroup');
		if (!group || group.hidden) return;
		var list = $('kidsMqLevelsList');
		if (!list) return;
		var offset = 0, parts = [];
		state.wizard.mqLevels.forEach(function (lv, i) {
			var count = Math.max(0, Math.floor(Number(lv.count) || 0));
			var qs = state.wizard.questions.slice(offset, offset + count);
			offset += count;
			var isLast = i === state.wizard.mqLevels.length - 1;
			var chips = qs.map(function (q) {
				var t = String(q.text || '').trim();
				var short = t.length > 38 ? t.slice(0, 37) + '…' : (t || '—');
				return '<span class="kids-mq-chip" title="' + esc(t) + '">' + esc(short) + '</span>';
			}).join('');
			if (!chips) chips = '<span class="kids-mq-chip kids-mq-chip-empty">no questions yet — add some in step 3</span>';
			var canSplit = qs.length >= 2 && state.wizard.mqLevels.length < 12;
			var nextName = isLast ? '' : String((state.wizard.mqLevels[i + 1] || {}).name || '').trim();
			var summary = qs.length + (qs.length === 1 ? ' question' : ' questions') +
				(isLast ? ' · final level' : ' · unlocks “' + (nextName || ('Level ' + (i + 2))) + '”');
			var prevName = String((state.wizard.mqLevels[i - 1] || {}).name || '').trim() || ('Level ' + i);
			parts.push(
				'<div class="kids-mq-level" data-idx="' + i + '">' +
					'<div class="kids-mq-level-head">' +
						'<span class="kids-mq-level-num">' + (i + 1) + '</span>' +
						'<input type="text" class="form-control kids-mq-name" maxlength="60" placeholder="Level name" data-field="name" value="' + esc(lv.name || '') + '" />' +
					'</div>' +
					'<div class="kids-mq-level-controls">' +
						mqStarPickerHtml(i, lv, isLast) +
						'<div class="kids-mq-control">' +
							'<span class="kids-mq-control-label">Artwork</span>' +
							'<select class="form-control kids-mq-art" data-field="art" title="Level artwork on the adventure map">' +
								[['home', '🏠 Home'], ['treasure', '💎 Treasure'], ['temple', '🏛️ Temple'], ['sunset', '🌅 Sunset']].map(function (a) {
									return '<option value="' + a[0] + '"' + (lv.art === a[0] ? ' selected' : '') + '>' + a[1] + '</option>';
								}).join('') +
							'</select>' +
						'</div>' +
					'</div>' +
					'<div class="kids-mq-chips">' + chips + '</div>' +
					'<div class="kids-mq-level-actions">' +
						(canSplit ? '<button type="button" class="kids-mq-act" data-act="split" title="Cut this level in two">✂ Split</button>' : '') +
						(i > 0 ? '<button type="button" class="kids-mq-act kids-mq-act-danger" data-act="merge" title="Merge this level into the one above">⤴ Merge into ' + esc(prevName) + '</button>' : '') +
						'<span class="kids-mq-summary">' + esc(summary) + '</span>' +
					'</div>' +
				'</div>'
			);
		});
		list.innerHTML = parts.join('');
		// Field events (no re-render on typing — keeps the caret in place).
		Array.prototype.forEach.call(list.querySelectorAll('.kids-mq-level'), function (row) {
			var idx = Number(row.dataset.idx) || 0;
			var lv = state.wizard.mqLevels[idx];
			if (!lv) return;
			var inEl = row.querySelector('[data-field="name"]');
			if (inEl) {
				inEl.addEventListener('input', function () { lv.name = inEl.value; });
			}
			Array.prototype.forEach.call(row.querySelectorAll('[data-field="pass_stars"]'), function (input) {
				input.addEventListener('change', function () {
					if (!input.checked) return;
					lv.pass_stars = Math.min(3, Math.max(1, Number(input.value) || 1));
					// Repaint the selected pill in place; a full re-render here
					// would drop focus mid keyboard navigation.
					var starsGroup = input.closest('.kids-mq-star-group');
					if (starsGroup) Array.prototype.forEach.call(starsGroup.querySelectorAll('.kids-mq-star'), function (lbl) {
						var radio = lbl.querySelector('input');
						lbl.classList.toggle('is-on', !!radio && radio.checked);
					});
				});
			});
			var artEl = row.querySelector('[data-field="art"]');
			if (artEl) {
				artEl.addEventListener('change', function () { lv.art = MQ_ART_VALUES.indexOf(artEl.value) >= 0 ? artEl.value : 'home'; });
			}
			var splitBtn = row.querySelector('[data-act="split"]');
			if (splitBtn) splitBtn.addEventListener('click', function () { mqSplitLevel(idx); });
			var mergeBtn = row.querySelector('[data-act="merge"]');
			if (mergeBtn) mergeBtn.addEventListener('click', function () { mqMergeLevel(idx); });
		});
	}
	function mqSplitLevel(idx) {
		var plan = state.wizard.mqLevels;
		var lv = plan[idx];
		var count = lv ? Math.floor(Number(lv.count) || 0) : 0;
		if (!lv || count < 2) { toast('Need at least 2 questions to split', 'warning'); return; }
		if (plan.length >= 12) { toast('A game can have 12 levels at most', 'warning'); return; }
		var first = Math.max(1, Math.floor(count / 2));
		lv.count = first;
		plan.splice(idx + 1, 0, {
			id: mqNewLevelId(),
			name: 'Level ' + (idx + 2),
			pass_stars: 1,
			art: 'home',
			count: count - first,
		});
		mqRenumberAutoLevels();
		renderKidsMqLevels();
	}
	function mqMergeLevel(idx) {
		var plan = state.wizard.mqLevels;
		if (idx <= 0 || !plan[idx]) return;
		plan[idx - 1].count += Math.max(0, Math.floor(Number(plan[idx].count) || 0));
		plan.splice(idx, 1);
		if (!plan.length) mqSinglePlan();
		mqRenumberAutoLevels();
		renderKidsMqLevels();
	}
	function mqAddLevel() {
		var plan = state.wizard.mqLevels;
		if (plan.length >= 12) { toast('A game can have 12 levels at most', 'warning'); return; }
		var last = plan[plan.length - 1];
		if (!last || Math.floor(Number(last.count) || 0) < 2) { toast('Split a level or add questions first', 'warning'); return; }
		last.count -= 1;
		plan.push({ id: mqNewLevelId(), name: 'Level ' + (plan.length + 1), pass_stars: 1, art: 'home', count: 1 });
		mqRenumberAutoLevels();
		renderKidsMqLevels();
	}
	function mqResetLevels() { mqSinglePlan(); renderKidsMqLevels(); }

	/** config_json for the wizard payload — Math Quest carries the level plan. */
	function buildKidsGameConfig() {
		var base = {
			time_per_q: Number($('kidsGameTimePerQ').value) || 15,
			max_hints: Number($('kidsGameMaxHints').value) || 0,
			mascot_theme: $('kidsGameMascotTheme').value || null,
			allow_replay: $('kidsGameAllowReplay').checked !== false,
			show_explanations: $('kidsGameShowExplanations').checked !== false,
		};
		if (state.wizard.game_type !== 'math-quest') return base;
		ensureMqLevels();
		var offset = 0, levels = [];
		state.wizard.mqLevels.forEach(function (lv, i) {
			var count = Math.max(0, Math.floor(Number(lv.count) || 0));
			var ids = state.wizard.questions.slice(offset, offset + count).map(function (q) { return String(q.id); });
			offset += count;
			levels.push({
				id: String(lv.id || mqNewLevelId()).slice(0, 80),
				name: String(lv.name || '').trim().slice(0, 60) || ('Level ' + (i + 1)),
				questions: ids,
				pass_stars: Math.min(3, Math.max(1, Math.floor(Number(lv.pass_stars) || 1))),
				art: MQ_ART_VALUES.indexOf(lv.art) >= 0 ? lv.art : 'home',
			});
		});
		return Object.assign(base, { levels: levels });
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
	function kidOptionList(q) {
		try {
			var parsed = JSON.parse(q.options_json || '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch (_) { return []; }
	}
	/**
	 * Only questions whose shape a game can actually play are selectable.
	 * In particular Code Explorer accepts code questions only, Bubble Pop
	 * needs single-answer options, and Star Collector needs multi-answer ones.
	 */
	function isQuestionCompatible(gameType, q) {
		if (!q) return false;
		var opts = kidOptionList(q);
		switch (gameType) {
			case 'bubble-pop':
				return q.type === 'multiple-choice' && !q.allowMultipleAnswers && opts.length >= 2;
			case 'star-collector':
				return q.type === 'multiple-choice' && !!q.allowMultipleAnswers && opts.length >= 2;
			case 'leap-frog':
				return q.type === 'true-false';
			case 'sort-it-out':
				return q.type === 'odd-one-out' && opts.length >= 3;
			case 'pair-party':
				return q.type === 'matching' && opts.length >= 2;
			case 'build-a-tower':
				return q.type === 'draggable' && opts.length >= 2;
			case 'magic-words':
				return q.type === 'fill-blank';
			case 'code-explorer':
				return q.type === 'code';
			default:
				return true;
		}
	}
	function incompatibleSelected() {
		var bad = [];
		for (var i = 0; i < state.wizard.questions.length; i++) {
			if (!isQuestionCompatible(state.wizard.game_type, state.wizard.questions[i])) bad.push(state.wizard.questions[i]);
		}
		return bad;
	}
	// Code Explorer plays code questions. Automatic intake (AI, and manual
	// builds whose editor type was switched) is coerced into code shape
	// instead of being blocked: multiple-choice grading is identical in both
	// shapes, and every other type maps to its codeAnswerMode twin.
	var CODE_MODE_FOR_TYPE = {
		'multiple-choice': 'multiple-choice',
		'true-false': 'multiple-choice',
		'matching': 'matching',
		'matching-pairs': 'matching',
		'draggable': 'draggable',
		'order': 'draggable',
		'fill-blank': 'fill-blank',
		'odd-one-out': 'odd-one-out'
	};
	function coerceToCodeExplorer(q) {
		if (!q || q.type === 'code') return q;
		var mode = CODE_MODE_FOR_TYPE[q.type];
		if (!mode) return q;
		var out = Object.assign({}, q, { type: 'code', codeAnswerMode: mode });
		if (!out.codeSnippet) out.codeSnippet = '';
		if (!out.codeLanguage) out.codeLanguage = 'javascript';
		return out;
	}
	function renderKidsWizardQuestionBank() {
		var bankEl = $('kidsWizardQuestionBank');
		if (!bankEl) return;
		var search = String(($('kidsWizardQuestionSearch') || {}).value || '').toLowerCase();
		var cat = ($('kidsWizardCategorySelect') || {}).value || '';
		var selectedIds = {};
		state.wizard.questions.forEach(function (q) { selectedIds[q.id] = true; });
		var hiddenIncompatible = 0;
		var items = state.bank.filter(function (q) {
			if (!isQuestionCompatible(state.wizard.game_type, q)) { hiddenIncompatible += 1; return false; }
			if (state.bankTypeFilter !== 'all' && q.type !== state.bankTypeFilter) return false;
			if (search && String(q.text || '').toLowerCase().indexOf(search) < 0) return false;
			if (cat) {
				var rawRow = (state.bankRawRows || {})[q.id] || {};
				if (String(rawRow.category_id || '') !== String(cat)) return false;
			}
			return true;
		});
		if (!items.length) {
			var hint = state.wizard.game_type === 'code-explorer'
				? 'No code questions found. Generate some with the AI tab (Code Explorer) or add them manually.'
				: state.wizard.game_type === 'star-collector'
					? 'No multi-answer questions found. Generate some with the AI tab or add them manually.'
					: 'No compatible questions found. Try the AI Generate tab or Manual Entry.';
			bankEl.innerHTML = '<div class="empty-state-small">' + esc(hint) + '</div>';
			return;
		}
		bankEl.innerHTML = '';
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
		if (hiddenIncompatible > 0) {
			var note = document.createElement('div');
			note.className = 'empty-state-small';
			note.textContent = hiddenIncompatible + ' incompatible question(s) hidden for this game type.';
			bankEl.appendChild(note);
		}
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
			var compatible = isQuestionCompatible(state.wizard.game_type, q);
			var row = document.createElement('div');
			row.className = 'kids-selected-item' + (compatible ? '' : ' incompatible');
			if (!compatible) row.title = 'Incompatible with this game type — remove it to continue';
			row.innerHTML = '<span>' + (compatible ? '' : '⚠ ') + esc(q.text) + ' <small>(' + esc(q.type) + ')</small></span>';
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
		var coerced = 0;
		state.aiResults.forEach(function (q) {
			var nq = state.wizard.game_type === 'code-explorer' ? coerceToCodeExplorer(q) : q;
			if (nq !== q) coerced += 1;
			if (!have[nq.id]) { state.wizard.questions.push(nq); have[nq.id] = true; }
		});
		renderKidsWizardSelectedQuestions();
		toast(state.aiResults.length + ' AI questions added' + (coerced ? ' (' + coerced + ' styled for Code Explorer)' : ''), 'success');
	}

	/* Step 3 — manual entry via the real question editor.
	   Launches the Questions tab's full editor (same fields, validation and
	   per-type builders) and captures the built object into the game. */
	var KIDS_EDITOR_TYPE = {
		'bubble-pop': 'multiple-choice',
		'star-collector': 'multiple-choice',
		'leap-frog': 'true-false',
		'sort-it-out': 'odd-one-out',
		'pair-party': 'matching-pairs',
		'build-a-tower': 'draggable',
		'magic-words': 'fill-blank',
		'code-explorer': 'code',
	};
	function openKidsManualEditor() {
		if (!state.wizard.game_type) { toast('Pick a game type first (Step 1)', 'warning'); return; }
		if (typeof window.openQuestionFormModal !== 'function') {
			toast('Question editor unavailable on this page', 'error');
			return;
		}
		var editorType = KIDS_EDITOR_TYPE[state.wizard.game_type] || 'multiple-choice';
		window.__kidsManualCapture = function (built) {
			var q = normalizeKidQuestion(built);
			if (!q.text || !q.answer) { toast('That question has no usable text/answer', 'warning'); return; }
			if (!isQuestionCompatible(state.wizard.game_type, q)) {
				if (state.wizard.game_type === 'code-explorer') {
					q = coerceToCodeExplorer(q);
					toast('Converted to Code Explorer format', 'info');
				} else {
					toast('That question type cannot be played in this game — pick a matching type', 'warning');
					return;
				}
			}
			state.wizard.questions.push(q);
			state.manualList.push(q);
			renderKidsWizardSelectedQuestions();
			renderKidsManualQuestions();
			toast('Question added to the game', 'success');
		};
		try {
			window.openQuestionFormModal(null);
			var radio = document.querySelector('input[name="questionType"][value="' + editorType + '"]');
			if (radio) {
				radio.checked = true;
				if (typeof window.toggleQuestionType === 'function') {
					try { window.toggleQuestionType(); } catch (_) { /* editor default stands */ }
				}
			}
			if (state.wizard.game_type === 'star-collector') {
				var multi = document.getElementById('allow-multiple-answers');
				if (multi && !multi.checked) {
					multi.checked = true;
					try { if (typeof window.toggleMultipleAnswers === 'function') window.toggleMultipleAnswers(); } catch (_) {}
				}
			}
			var titleEl = document.getElementById('question-action-text');
			if (titleEl) titleEl.textContent = 'Add Question for Kids Game';
			var saveBtn = document.getElementById('add-update-question-btn');
			if (saveBtn) saveBtn.textContent = 'Add to Game';
		} catch (err) {
			window.__kidsManualCapture = null;
			toast('Could not open the question editor: ' + (err && err.message), 'error');
		}
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
			grade: ($('kidsAIGrade') || {}).value || 'cp',
			subject: String($('kidsGameSubject').value || '').trim() || null,
			questions_json: JSON.stringify(state.wizard.questions),
			config_json: JSON.stringify(buildKidsGameConfig()),
		};
	}
	/** Readiness of the four things that can actually break a game, each with
	 * the step that fixes it. Kept next to the preview because they answer the
	 * same question the teacher has on step 5: "is this ready for my class?" */
	function publishChecks() {
		var name = String(($('kidsGameName') || {}).value || '').trim();
		var type = state.wizard.game_type;
		var meta = gameTypeMeta(type) || {};
		var questions = state.wizard.questions.length;
		var cfg = {};
		try { cfg = buildKidsGameConfig(); } catch (_) { cfg = {}; }
		var checks = [
			{
				ok: !!type,
				label: 'Game type',
				value: type ? (meta.icon || '') + ' ' + (meta.label || type) : 'Not chosen yet',
				step: 1,
				fix: 'Choose a game',
			},
			{
				ok: !!name,
				label: 'Game name',
				value: name || 'Not named yet',
				step: 4,
				fix: 'Name it',
			},
			{
				ok: questions > 0,
				label: 'Questions',
				value: questions ? questions + ' question' + (questions === 1 ? '' : 's') + ' ready' : 'No questions yet',
				step: 3,
				fix: 'Add questions',
			},
			{
				ok: true,
				label: 'Play rules',
				value: (cfg.time_per_q || 15) + 's per question · ' + (cfg.max_hints ? cfg.max_hints + ' hint' + (cfg.max_hints === 1 ? '' : 's') : 'no hints') +
					(cfg.allow_replay === false ? ' · no replay' : ' · replay on') +
					(cfg.show_explanations === false ? ' · answers hidden' : ' · explanations on'),
				step: 4,
				fix: 'Adjust',
			},
		];
		// Math Quest splits the same deck across levels, so an empty level means
		// a kid walks into a dead map — worth flagging before publishing.
		if (type === 'math-quest' && questions > 0) {
			ensureMqLevels();
			var empty = state.wizard.mqLevels.filter(function (lv) { return Math.max(0, Math.floor(Number(lv.count) || 0)) === 0; }).length;
			checks.push({
				ok: empty === 0,
				label: 'Adventure levels',
				value: empty ? empty + ' empty level' + (empty === 1 ? '' : 's') : state.wizard.mqLevels.length + ' level' + (state.wizard.mqLevels.length === 1 ? '' : 's') + ' with questions',
				step: 3,
				fix: 'Fix levels',
			});
		}
		return checks;
	}

	/** Step 5 top block: what is ready, what is not, and a link straight to the
	 * step that fixes it (all four are earlier steps, so the jump is free). */
	function renderPublishChecklist() {
		var box = $('kidsPublishChecklist');
		if (!box) return;
		var published = !!state.publishedGame;
		var checks = publishChecks();
		var blockers = published ? 0 : checks.filter(function (c) { return !c.ok; }).length;
		box.innerHTML =
			'<div class="kids-pub-head">' +
				(published
					? '<span class="kids-pub-flag ok">🚀 Published</span><span class="kids-pub-sum">The kids can play it right now.</span>'
					: blockers
						? '<span class="kids-pub-flag wait">⚠️ ' + blockers + ' thing' + (blockers === 1 ? '' : 's') + ' to fix</span><span class="kids-pub-sum">Fix them below — or publish anyway and edit later.</span>'
						: '<span class="kids-pub-flag ok">✅ All set</span><span class="kids-pub-sum">Everything a kid needs is in place.</span>') +
			'</div>' +
			checks.map(function (c) {
				return '<div class="kids-pub-check' + (c.ok ? ' ok' : ' todo') + '">' +
					'<span class="kids-pub-check-mark" aria-hidden="true">' + (c.ok ? '✓' : '!') + '</span>' +
					'<span class="kids-pub-check-label">' + esc(c.label) + '</span>' +
					'<span class="kids-pub-check-value">' + esc(c.value) + '</span>' +
					(c.ok ? '' : '<button type="button" class="kids-pub-fix" data-jump="' + c.step + '">' + esc(c.fix) + ' →</button>') +
					'</div>';
			}).join('');
		box.querySelectorAll('[data-jump]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				kidsWizardGoToStep(Number(btn.getAttribute('data-jump')) || 1);
			});
		});
	}

	/** Step 5 card: the game as the kids will meet it — theme colours, the
	 * rules that change how it feels, and the level path for Math Quest. */
	function updateKidsWizardPreview() {
		var prev = $('kidsWizardPreview');
		if (!prev) return;
		var meta = gameTypeMeta(state.wizard.game_type) || {};
		var theme = state.wizard.theme || 'jungle';
		var grade = ($('kidsAIGrade') || {}).value || '—';
		var subject = String(($('kidsGameSubject') || {}).value || '').trim();
		var cfg = {};
		try { cfg = buildKidsGameConfig(); } catch (_) { cfg = {}; }
		var questions = state.wizard.questions.length;
		var rules = [
			'⏱ ' + (cfg.time_per_q || 15) + 's',
			'💡 ' + (cfg.max_hints ? cfg.max_hints + ' hint' + (cfg.max_hints === 1 ? '' : 's') : 'no hints'),
			cfg.allow_replay === false ? '🚫 no replay' : '🔁 replay',
			cfg.show_explanations === false ? '🙈 no explanations' : '💬 explanations',
		];
		var levels = '';
		if (state.wizard.game_type === 'math-quest' && questions) {
			ensureMqLevels();
			levels = '<div class="kids-pub-levels">' +
				state.wizard.mqLevels.map(function (lv, i) {
					var last = i === state.wizard.mqLevels.length - 1;
					return '<div class="kids-pub-level">' +
						'<span class="kids-pub-level-name">' + esc(String(lv.name || 'Level ' + (i + 1)).slice(0, 40)) + '</span>' +
						'<span class="kids-pub-level-meta">' + Math.max(0, Math.floor(Number(lv.count) || 0)) + ' q · ' +
							(lv.pass_stars || 1) + '⭐ ' + (last ? 'final' : 'to pass') + '</span></div>';
				}).join('<span class="kids-pub-arrow" aria-hidden="true">→</span>') +
				'</div>';
		}
		prev.innerHTML =
			'<div class="kids-pub-kid" style="background:' + (THEME_BG[theme] || THEME_BG.jungle) + '">' +
				'<div class="kids-pub-kid-icon" aria-hidden="true">' + esc(meta.icon || '🎮') + '</div>' +
				'<div class="kids-pub-kid-title">' + esc(String(($('kidsGameName') || {}).value || '').trim() || 'Your game') + '</div>' +
				'<div class="kids-pub-kid-sub">' + esc(meta.label || state.wizard.game_type || '—') + ' · ' + esc(String(grade).toUpperCase()) + (subject ? ' · ' + esc(subject) : '') + '</div>' +
				'<div class="kids-pub-kid-count">' + questions + ' question' + (questions === 1 ? '' : 's') + '</div>' +
				'<div class="kids-pub-kid-rules">' + rules.map(function (r) { return '<span>' + esc(r) + '</span>'; }).join('') + '</div>' +
			'</div>' +
			'<p class="kids-pub-note">👀 What the kids see when they type your PIN' +
				(theme !== (($('kidsGameMascotTheme') || {}).value || theme) ? ' · mascot ' + esc(String(($('kidsGameMascotTheme') || {}).value || theme)) : '') +
			'</p>' +
			levels;
	}

	/** Step 5 after a successful publish: the PIN, QR and share actions stay
	 * INSIDE the step instead of covering it with a modal — the teacher keeps
	 * the checklist, the preview and the code in one place. */
	function renderPublishResult(game) {
		var box = $('kidsPublishResult');
		if (!box) return;
		var pin = game.pin || '----';
		var url = game.pin ? playUrl(game.pin) : '';
		var meta = gameTypeMeta(game.game_type) || {};
		box.hidden = false;
		box.innerHTML =
			'<div class="kids-pub-pin">' +
				'<div class="kids-pub-pin-label">Tell your class this PIN</div>' +
				'<div class="kids-pub-pin-code" id="kidsPublishPin">' + esc(pin) + '</div>' +
				'<div class="kids-pub-pin-url"><a id="kidsPublishUrl" href="' + esc(url || '#') + '" target="_blank" rel="noopener">' + esc(url || '—') + '</a></div>' +
			'</div>' +
			'<div class="kids-pub-qr" id="kidsPublishQR"></div>' +
			'<div class="kids-pub-actions">' +
				'<button type="button" class="btn btn-primary" id="kidsPublishCopyBtn">📋 Copy PIN</button>' +
				'<button type="button" class="btn btn-secondary" id="kidsPublishCopyUrlBtn">🔗 Copy link</button>' +
				'<button type="button" class="btn btn-secondary" id="kidsPublishPrintBtn">🖨 Print card</button>' +
				'<button type="button" class="btn btn-secondary" id="kidsPublishPreviewBtn">▶ Preview as a kid</button>' +
				'<button type="button" class="btn btn-ghost" id="kidsPublishShareBtn">More sharing options</button>' +
			'</div>';
		renderPinQR($('kidsPublishQR'), url);
		var bind = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
		bind('kidsPublishCopyBtn', function () { copyTextToClipboard(pin, 'PIN ' + pin + ' copied'); });
		bind('kidsPublishCopyUrlBtn', function () { if (url) copyTextToClipboard(url, 'Link copied'); });
		bind('kidsPublishPrintBtn', function () { printKidsPinCard(); });
		bind('kidsPublishPreviewBtn', function () { if (url) window.open(url, '_blank'); });
		bind('kidsPublishShareBtn', function () { openKidsShareModal(game.id, game); });
		// Publish-step championship bridge: this game, one tap, ready to join.
		var champBox = $('kidsPublishChamp');
		if (champBox) {
			champBox.hidden = false;
			champBox.innerHTML =
				'<div class="kids-pub-champ-emoji" aria-hidden="true">🏆</div>' +
				'<div class="kids-pub-champ-copy">' +
					'<b>Turn it into a championship?</b>' +
					'<span>One tap creates a Kids Championship with ' + esc(meta.label || 'this game') + ' as a challenge — you get a class code to share.</span>' +
				'</div>' +
				'<button type="button" class="btn btn-success" id="kidsPublishChampBtn">Make a championship 🏆</button>';
			var champBtn = $('kidsPublishChampBtn');
			if (champBtn) champBtn.addEventListener('click', function () {
				var tabBtn = document.querySelector('[data-games-studio-tab="kids-championships"]');
				if (tabBtn) tabBtn.click();
				if (window.KidsChampionships && window.KidsChampionships.openCreate) {
					window.KidsChampionships.openCreate({
						gameIds: [game.id],
						name: game.name ? game.name + ' Championship' : '',
					});
				} else {
					toast('Open the 🏆 Kids Championships tab to create it', 'info');
				}
			});
		}
	}

	/** One QR renderer for the share modal and the publish step. */
	function renderPinQR(container, url) {
		if (!container) return;
		container.innerHTML = '';
		if (!url) return;
		try {
			if (window.qrcode) {
				var qrObj = window.qrcode(0, 'M');
				qrObj.addData(url);
				qrObj.make();
				container.innerHTML = qrObj.createImgTag(4, 4);
				return;
			}
		} catch (_) { /* fall through to the plain link */ }
		container.innerHTML = '<a href="' + esc(url) + '">' + esc(url) + '</a>';
	}

	/** Hide the post-publish blocks when the wizard is opened (or reopened for
	 * another game) so a stale PIN never lingers under a fresh draft. */
	function resetPublishResultPanels() {
		var result = $('kidsPublishResult');
		if (result) { result.hidden = true; result.innerHTML = ''; }
		var champ = $('kidsPublishChamp');
		if (champ) { champ.hidden = true; champ.innerHTML = ''; }
	}

	/** Publish succeeded: show the PIN inline, re-render the checklist as all
	 * green and let the footer button close the wizard. */
	function setKidsWizardPublished(game) {
		renderPublishResult(game);
		renderPublishChecklist();
		goToWizardStep(5);
		var hint = $('kidsWizardStepHint');
		if (hint) hint.textContent = 'Published ✓ — PIN ' + (game.pin || '----') + ' is ready to share';
		var result = $('kidsPublishResult');
		if (result && result.scrollIntoView) {
			try { result.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { /* older browsers */ }
		}
	}

	function publishKidsGame(presetId) {
		if (state.publishedGame) { closeKidsGameWizard(); return Promise.resolve(); }
		var id = presetId || state.editingId || ($('kidsGameWizardId') || {}).value || null;
		var doPublish = function (gameId) {
			return kidsApi('POST', '/' + encodeURIComponent(gameId) + '/publish').then(function (game) {
				state.lastPublished = game;
				state.publishedGame = game;
				renderKidsGameList();
				// Stay on step 5: the PIN appears inline next to the checklist
				// instead of a modal stacked on top of the wizard.
				setKidsWizardPublished(game);
				notifyKidsCatalogChanged();
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
			var meta = gameTypeMeta(game.game_type) || {};
			var nameEl = $('kidsShareGameName');
			if (nameEl) nameEl.textContent = game.name || 'Kids Game';
			var metaEl = $('kidsShareGameMeta');
			if (metaEl) {
				var bits = [];
				if (meta.label) bits.push(meta.label);
				if (game.grade) bits.push(String(game.grade).toUpperCase());
				if (game.subject) bits.push(game.subject);
				metaEl.textContent = bits.length ? bits.join(' · ') : '—';
			}
			var iconEl = $('kidsShareGameIcon');
			if (iconEl) iconEl.textContent = meta.icon || '🎮';
			$('kidsSharePin').textContent = game.pin || '----';
			var urlEl = $('kidsShareUrl');
			if (urlEl) {
				var url = game.pin ? playUrl(game.pin) : '—';
				urlEl.textContent = url;
				if (game.pin) urlEl.href = url;
				else urlEl.removeAttribute('href');
			}
			renderPinQR($('kidsShareQR'), game.pin ? playUrl(game.pin) : '');
			setModal('kidsGameShareModal', true);
		};
		if (preloaded && preloaded.pin) { done(preloaded); return; }
		kidsApi('GET', '/' + encodeURIComponent(id)).then(done)
			.catch(function (err) { toast('Could not load game: ' + (err && err.message), 'error'); });
	}
	function copyTextToClipboard(text, okMsg) {
		var done = function () { toast(okMsg || 'Copied', 'success'); };
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(String(text)).then(done, function () { toast('Copy failed — select and copy manually', 'warning'); });
				return;
			}
		} catch (_) { /* fall through */ }
		try {
			var helper = document.createElement('textarea');
			helper.value = String(text);
			helper.setAttribute('readonly', '');
			helper.style.position = 'fixed';
			helper.style.opacity = '0';
			document.body.appendChild(helper);
			helper.select();
			document.execCommand('copy');
			helper.remove();
			done();
		} catch (_) { toast('Copy failed — select and copy manually', 'warning'); }
	}
	function copyKidsPin() {
		var game = state.lastPublished;
		if (!game || !game.pin) { toast('Nothing to copy yet', 'warning'); return; }
		copyTextToClipboard(game.pin, 'PIN ' + game.pin + ' copied');
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
		copyTextToClipboard(playUrl(game.pin), 'Link copied');
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
			notifyKidsCatalogChanged();
		}).catch(function (err) { toast('Delete failed: ' + (err && err.message), 'error'); });
	}
	function archiveKidsGame(id) {
		kidsApi('POST', '/' + encodeURIComponent(id) + '/archive').then(function () {
			toast('Kids game archived', 'success');
			renderKidsGameList();
			notifyKidsCatalogChanged();
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
		var bestScore = sessions.reduce(function (m, s) { return Math.max(m, Number(s.score) || 0); }, 0);
		var accClass = function (pct) {
			if (pct == null) return 'kres-acc-none';
			if (pct >= 80) return 'kres-acc-high';
			if (pct >= 50) return 'kres-acc-mid';
			return 'kres-acc-low';
		};
		var qRows = questions.map(function (q) {
			var st = acc[q.id] || { ok: 0, n: 0 };
			var pct = st.n ? Math.round((st.ok / st.n) * 100) : null;
			return '<div class="kres-qrow">' +
				'<div class="kres-qrow-top"><span class="kres-qtext">' + esc(String(q.text || '').slice(0, 80)) + '</span>' +
				'<span class="kres-acc-badge ' + accClass(pct) + '">' + (pct == null ? '—' : pct + '%') + '</span></div>' +
				'<div class="kres-acc-bar"><span style="width:' + (pct == null ? 0 : pct) + '%"></span></div>' +
				'<div class="kres-qcount">' + (st.n ? st.ok + '/' + st.n + ' correct' : 'No answers yet') + '</div>' +
				'</div>';
		}).join('');
		var ranked = sessions.slice(0, 100);
		var rankMedal = function (i) {
			return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
		};
		var sRows = ranked.map(function (s, i) {
			var isBest = Number(s.score) === bestScore && totalPlays > 0;
			return '<div class="kres-srow' + (isBest ? ' kres-best' : '') + '">' +
				'<span class="kres-rank">' + rankMedal(i) + '</span>' +
				'<span class="kres-avatar">' + esc(s.avatar || '🦊') + '</span>' +
				'<span class="kres-pname">' + esc(s.player_name || '—') + (isBest ? '<span class="kres-best-tag">Best</span>' : '') + '</span>' +
				'<span class="kres-score">' + esc(s.score) + ' pts</span>' +
				'<span class="kres-stars">' + esc(s.stars) + '⭐</span>' +
				'<span class="kres-date">' + esc(String(s.created_at || '').slice(0, 16).replace('T', ' ')) + '</span>' +
				'</div>';
		}).join('');
		var overlay = document.createElement('div');
		overlay.className = 'modal arena-editor-modal kids-modal kids-results-modal';
		overlay.style.display = 'flex';
		overlay.innerHTML = '<div class="modal-content modal-lg kids-wizard-content">' +
			'<div class="modal-header kids-wizard-header"><div class="kids-wizard-title-row"><div>' +
			'<span class="arena-eyebrow">Kids Games Studio</span>' +
			'<h2>Results — ' + esc(game ? game.name : '') + '</h2></div>' +
			'<button type="button" class="arena-modal-close" aria-label="Close">×</button></div></div>' +
			'<div class="kres-body">' +
			'<div class="kres-stats">' +
			'<div class="kres-stat"><span class="kres-stat-num">' + totalPlays + '</span><span class="kres-stat-label">Plays</span></div>' +
			'<div class="kres-stat"><span class="kres-stat-num">' + avgScore.toFixed(1) + '</span><span class="kres-stat-label">Avg score</span></div>' +
			'<div class="kres-stat"><span class="kres-stat-num">' + avgStars.toFixed(1) + '⭐</span><span class="kres-stat-label">Avg stars</span></div>' +
			'</div>' +
			'<h4 class="kres-section-title">Per-question accuracy</h4>' +
			(totalPlays ? '<div class="kres-qlist">' + qRows + '</div>' : '<div class="kres-empty">No data yet — share the PIN and let the kids play! 🎮</div>') +
			'<h4 class="kres-section-title">Sessions</h4>' +
			(ranked.length ? '<div class="kres-slist">' + sRows + '</div>' : '<div class="kres-empty">No plays yet. 🧸</div>') +
			'<div class="kres-footer"><button type="button" class="btn btn-secondary">Close</button></div>' +
			'</div></div>';
		document.body.appendChild(overlay);
		var close = function () { overlay.remove(); };
		overlay.querySelector('.arena-modal-close').addEventListener('click', close);
		overlay.querySelector('.kres-footer .btn').addEventListener('click', close);
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
		var editorBtn = $('kidsOpenEditorBtn');
		if (editorBtn && !editorBtn.__kidsBound) { editorBtn.__kidsBound = true; editorBtn.addEventListener('click', openKidsManualEditor); }
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
		var mqAdd = $('kidsMqAddLevel');
		if (mqAdd && !mqAdd.__kidsBound) { mqAdd.__kidsBound = true; mqAdd.addEventListener('click', mqAddLevel); }
		var mqReset = $('kidsMqResetLevels');
		if (mqReset && !mqReset.__kidsBound) { mqReset.__kidsBound = true; mqReset.addEventListener('click', mqResetLevels); }
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
		var pinCard = $('kidsSharePinCard');
		if (pinCard && !pinCard.__kidsBound) {
			pinCard.__kidsBound = true;
			pinCard.addEventListener('click', function (e) {
				if (e.target && e.target.closest && e.target.closest('a')) return;
				copyKidsPin();
			});
			pinCard.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyKidsPin(); }
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
	window.openKidsManualEditor = openKidsManualEditor;
	window.renderKidsManualQuestions = renderKidsManualQuestions;
	window.updateKidsWizardPreview = updateKidsWizardPreview;
	window.renderPublishChecklist = renderPublishChecklist;
	window.renderPublishResult = renderPublishResult;
	window.setKidsWizardPublished = setKidsWizardPublished;
	window.renderPinQR = renderPinQR;
	window.publishKidsGame = publishKidsGame;
	window.openKidsShareModal = openKidsShareModal;
	window.closeKidsShareModal = closeKidsShareModal;
	window.printKidsPinCard = printKidsPinCard;
	window.copyKidsPin = copyKidsPin;
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

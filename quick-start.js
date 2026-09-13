/**
 * quick-start.js
 *
 * First-setup wizard for the admin app. Shown automatically the first time
 * an admin logs into an empty instance (no classes/students/questions/exams/
 * games and the setup-complete marker absent), and reopenable any time from
 * Settings → Data → "Run Quick Start".
 *
 * Each step either opens the app's existing create-modal for that entity
 * (the wizard pauses and resumes when the modal closes) or loads a backup
 * file. Skipping / "Later" marks setup complete so it never nags again.
 */

(function () {
	'use strict';

	var SETUP_COMPLETE_KEY = 'quizSetupComplete';
	var state = {
		currentStep: 0,
		open: false,
	};

	// Step definitions — id, title, icon, live count getter, "Add" action.
	var STEPS = [
		{
			id: 'classes',
			title: 'Classes',
			icon: '🏫',
			description: 'Create your first classes — they group students and organize exams and games.',
			count: function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var list = r ? r.getAll_sync('classes', {}) : [];
				return (list || []).length;
			},
			add: function () { window.createNewClass && window.createNewClass(); },
		},
		{
			id: 'students',
			title: 'Students',
			icon: '🧑‍🎓',
			description: 'Add student accounts and assign them to classes. Students log in with these accounts to take exams and join games.',
			count: function () {
				var users = (window.Auth && window.Auth.getUsers) ? window.Auth.getUsers() : [];
				return (users || []).filter(function (u) { return u.role === 'student'; }).length;
			},
			add: function () {
				if (window.openUserModal) window.openUserModal(null);
			},
		},
		{
			id: 'categories',
			title: 'Categories',
			icon: '🗂️',
			description: 'Categories organize the question bank by topic (e.g. Algebra, History) and power the random exam generators.',
			count: function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var list = r ? r.getAll_sync('categories', {}) : [];
				return (list || []).length;
			},
			add: function () { window.createNewCategory && window.createNewCategory(); },
		},
		{
			id: 'questions',
			title: 'Questions',
			icon: '❓',
			description: 'Build the question bank — manually, or generate questions with AI (OpenAI, Claude, Gemini, or a free OpenRouter model).',
			count: function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var list = r ? r.getAll_sync('questions', {}) : [];
				return (list || []).length;
			},
			add: function () { window.openQuestionFormModal && window.openQuestionFormModal(null); },
			alt: {
				label: '⚡ Generate with AI',
				action: function () { window.openAIGeneratorModal && window.openAIGeneratorModal(); },
			},
		},
		{
			id: 'exams',
			title: 'Exams',
			icon: '📝',
			description: 'Assemble questions into exams, assign classes and a passing score. Exams show up in the student workspace automatically.',
			count: function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var list = r ? r.getAll_sync('exams', {}) : [];
				return (list || []).length;
			},
			add: function () { window.createNewExam && window.createNewExam(); },
		},
		{
			id: 'games',
			title: 'Games',
			icon: '🎮',
			description: 'Create live games (Lightning Race, Card Battle, Hot Potato…) — students join with a code from the game lobby.',
			count: function () {
				var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
				var list = r ? r.getAll_sync('games', {}) : [];
				return (list || []).length;
			},
			add: function () { window.openGameEditorModal && window.openGameEditorModal(); },
		},
		{
			id: 'done',
			title: 'Finish',
			icon: '✅',
			description: '',
			count: function () { return 0; },
			add: null,
		},
	];

	function getSetupComplete() {
		try { return localStorage.getItem(SETUP_COMPLETE_KEY) === 'true'; } catch (_) { return false; }
	}

	function setSetupComplete(value) {
		try { localStorage.setItem(SETUP_COMPLETE_KEY, value ? 'true' : 'false'); } catch (_) {}
	}

	function isInstanceEmpty() {
		try {
			var classes = STEPS[0].count();
			var students = STEPS[1].count();
			var questions = STEPS[3].count();
			var exams = STEPS[4].count();
			var games = STEPS[5].count();
			return classes + students + questions + exams + games === 0;
		} catch (_) {
			return false;
		}
	}

	// ─── Rendering ─────────────────────────────────────────────────────────────

	function stepBadge(count) {
		if (count > 0) return '<span class="qs-count done">' + count + ' added</span>';
		return '<span class="qs-count">0</span>';
	}

	function renderSteps() {
		var container = document.getElementById('quickStartSteps');
		if (!container) return;
		container.innerHTML = STEPS.map(function (step, index) {
			var count = safeCount(step);
			var cls = index === state.currentStep ? 'active' : (index < state.currentStep ? 'visited' : '');
			var clickable = index <= maxReachableStep() ? 'onclick="window.quickStartGoTo(' + index + ')"' : '';
			return '<div class="qs-step ' + cls + '" ' + clickable + ' data-step="' + step.id + '">' +
				'<span class="qs-step-num">' + (index + 1) + '</span>' +
				'<span class="qs-step-icon">' + step.icon + '</span>' +
				'<span class="qs-step-label">' + escapeHtml(step.title) + '</span>' +
				(step.id !== 'done' ? stepBadge(count) : '') +
				'</div>';
		}).join('');
	}

	function safeCount(step) {
		try { return step.count() || 0; } catch (_) { return 0; }
	}

	function maxReachableStep() {
		// Any step is reachable once data exists past it; otherwise linear.
		return STEPS.length - 1;
	}

	function renderStepContent() {
		var panel = document.getElementById('quickStartStepContent');
		if (!panel) return;
		var step = STEPS[state.currentStep];
		if (!step) return;

		if (step.id === 'done') {
			panel.innerHTML = renderDoneContent();
		} else {
			var count = safeCount(step);
			panel.innerHTML =
				'<h3 class="qs-title">' + step.icon + ' ' + escapeHtml(step.title) + '</h3>' +
				'<p class="qs-desc">' + escapeHtml(step.description) + '</p>' +
				'<div class="qs-status ' + (count > 0 ? 'ok' : '') + '">' +
				(count > 0 ? '✓ ' + count + ' ' + escapeHtml(step.title.toLowerCase()) + ' already added' : 'Nothing added yet — that\'s fine, you can also skip this step.') +
				'</div>' +
				'<div class="qs-actions">' +
				(step.add ? '<button type="button" class="btn btn-primary" onclick="window.quickStartAdd()">' + stepBadge(count).replace('added', '→ Add ' + escapeHtml(step.title.toLowerCase())) + ' ' + step.title + '</button>' : '') +
				(step.alt ? '<button type="button" class="btn btn-secondary" onclick="window.quickStartAlt()">' + escapeHtml(step.alt.label) + '</button>' : '') +
				'</div>' +
				'<div class="qs-load">' +
				'<p class="text-muted">Prefer loading everything at once? Restore a backup file exported from another instance:</p>' +
				'<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'quickStartLoadInput\').click()">📂 Load backup file</button>' +
				'<input type="file" id="quickStartLoadInput" accept=".json" style="display:none" onchange="window.quickStartLoadBackup(this)" />' +
				'</div>';
		}

		var backBtn = document.getElementById('quickStartBackBtn');
		var nextBtn = document.getElementById('quickStartNextBtn');
		if (backBtn) backBtn.style.visibility = state.currentStep === 0 ? 'hidden' : 'visible';
		if (nextBtn) {
			nextBtn.textContent = state.currentStep === STEPS.length - 1 ? 'Finish' : 'Next';
		}
	}

	function renderDoneContent() {
		var summary = STEPS.slice(0, -1).map(function (step) {
			var count = safeCount(step);
			return '<li><strong>' + escapeHtml(step.title) + ':</strong> ' + count + '</li>';
		}).join('');
		return '<h3 class="qs-title">✅ You\'re all set!</h3>' +
			'<p class="qs-desc">Here\'s what your instance contains now:</p>' +
			'<ul class="qs-summary">' + summary + '</ul>' +
			'<p class="qs-desc" style="margin-top:14px;">You can reopen this wizard any time from <strong>Settings → Data → Run Quick Start</strong>.</p>';
	}

	function escapeHtml(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	// ─── Navigation ────────────────────────────────────────────────────────────

	function openQuickStart(manual) {
		var modal = document.getElementById('quickStartModal');
		if (!modal) return;
		if (!manual && getSetupComplete()) return;
		if (manual) setSetupComplete(true); // opened deliberately — never auto-show again
		state.currentStep = 0;
		state.open = true;
		if (modal.parentElement && modal.parentElement !== document.body) {
			document.body.appendChild(modal);
		}
		modal.style.display = 'flex';
		renderSteps();
		renderStepContent();
	}

	function closeQuickStartModal() {
		var modal = document.getElementById('quickStartModal');
		if (modal) modal.style.display = 'none';
		state.open = false;
	}

	function dismissQuickStart(mode) {
		// 'later' = keep setup complete so it never auto-shows again; the
		// manual button in Settings → Data always reopens it.
		if (mode === 'later') setSetupComplete(true);
		closeQuickStartModal();
	}

	function quickStartGo(direction) {
		if (state.currentStep === STEPS.length - 1 && direction > 0) {
			// Finish
			setSetupComplete(true);
			closeQuickStartModal();
			if (typeof showToast === 'function') showToast('Setup complete — welcome aboard! 🚀', 'success');
			return;
		}
		var next = Math.min(Math.max(state.currentStep + direction, 0), STEPS.length - 1);
		state.currentStep = next;
		renderSteps();
		renderStepContent();
	}

	function quickStartGoTo(index) {
		if (typeof index !== 'number' || index < 0 || index >= STEPS.length) return;
		state.currentStep = index;
		renderSteps();
		renderStepContent();
	}

	function quickStartAdd() {
		var step = STEPS[state.currentStep];
		if (step && step.add) step.add();
	}

	function quickStartAlt() {
		var step = STEPS[state.currentStep];
		if (step && step.alt) step.alt.action();
	}

	function quickStartLoadBackup(input) {
		if (!input || !input.files || !input.files[0]) return;
		// Reuse the full backup importer from settings.js.
		if (window.importAllData) {
			window.importAllData(input);
		} else if (typeof showToast === 'function') {
			showToast('Backup import is unavailable on this page.', 'error');
		}
	}

	// Refresh the visible counts (called after entity create-modals close, by
	// other modules, or on tab focus).
	function updateQuickStartCounts() {
		if (!state.open) return;
		renderSteps();
		renderStepContent();
	}

	// ─── Auto-show detection ───────────────────────────────────────────────────

	function maybeAutoShow(markCompleteIfData) {
		if (!window.Auth || !window.Auth.getCurrentUser) return;
		var user = window.Auth.getCurrentUser();
		if (!user) return;
		var role = String(user.role || '').toLowerCase();
		if (role !== 'admin' && role !== 'super_admin') return;
		var empty = isInstanceEmpty();
		if (empty && getSetupComplete()) {
			// Empty instance with a stale completion flag (e.g. the flag was
			// set before a data reset) — self-heal it and show the wizard.
			setSetupComplete(false);
		} else if (getSetupComplete() && !empty) {
			return;
		}
		if (!empty) {
			// Data already exists. Only the bootstrap-confirmed check may
			// permanently mark setup complete — a plain-load timer can race
			// ahead of the server sync and see stale localStorage mirrors.
			if (markCompleteIfData) setSetupComplete(true);
			return;
		}
		openQuickStart(false);
	}

	function init() {
		// After the server bootstrap lands, the local mirrors are
		// authoritative — this is the only path allowed to mark complete.
		window.addEventListener('quiz:bootstrap-ready', function () {
			setTimeout(function () { maybeAutoShow(true); }, 1200);
		});

		// Plain page loads: bootstrap may already be cached. Never mark
		// complete here (stale mirrors) — only auto-open if truly empty.
		if (document.readyState === 'complete' || document.readyState === 'interactive') {
			setTimeout(function () { maybeAutoShow(false); }, 2500);
		} else {
			document.addEventListener('DOMContentLoaded', function () {
				setTimeout(function () { maybeAutoShow(false); }, 2500);
			});
		}
	}

	// ─── Exports ───────────────────────────────────────────────────────────────

	window.openQuickStart = openQuickStart;
	window.dismissQuickStart = dismissQuickStart;
	window.quickStartGo = quickStartGo;
	window.quickStartGoTo = quickStartGoTo;
	window.quickStartAdd = quickStartAdd;
	window.quickStartAlt = quickStartAlt;
	window.quickStartLoadBackup = quickStartLoadBackup;
	window.updateQuickStartCounts = updateQuickStartCounts;
	window.__QUICK_START_STATE__ = state;

	init();
})();

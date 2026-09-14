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
			id: 'security',
			title: 'School & Security',
			icon: '🔐',
			description: 'Your school\'s identity and credentials — school information, admin password and recovery code, and teacher accounts. Each school gets its own setup.',
			count: function () {
				var ok = 0;
				if (getSchoolProfileCached().named) ok += 1;
				if (getSchoolProfileCached().secured) ok += 1;
				return ok;
			},
			add: null,
			complete: function () {
				return getSchoolProfileCached().named && getSchoolProfileCached().secured;
			},
		},
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

	// ─── Security step state ──────────────────────────────────────────────────
	// The school profile is fetched once per wizard open and cached here. The
	// completion flags drive the step badge without re-hitting the API on
	// every render.
	var schoolProfileCache = { loaded: false, profile: null };
	var pendingLogoBase64 = null;

	function getSchoolProfileCached() {
		var profile = schoolProfileCache.profile || {};
		var named = !!(profile.name && String(profile.name).trim() && profile.name !== 'My School') || !!schoolProfileCache.namedByWizard;
		// "Secured" = the admin changed the password away from the seed
		// default AND a recovery code hash exists server-side. The wizard
		// marks these when each action succeeds, plus the initial fetch
		// reports them.
		var secured = !!schoolProfileCache.passwordChanged && !!schoolProfileCache.recoverySet;
		return { named: named, secured: secured };
	}

	function fetchSchoolProfile() {
		if (!(window.API && window.API.raw)) return Promise.resolve(null);
		return window.API.raw('GET', '/school/profile/full')
			.then(function (profile) {
				schoolProfileCache.profile = profile;
				schoolProfileCache.loaded = true;
				return profile;
			})
			.catch(function () {
				schoolProfileCache.loaded = true;
				return null;
			});
	}

	function teacherCount() {
		var users = (window.Auth && window.Auth.getUsers) ? window.Auth.getUsers() : [];
		return (users || []).filter(function (u) { return u.role === 'teacher'; }).length;
	}

	function getSetupComplete() {
		try { return localStorage.getItem(SETUP_COMPLETE_KEY) === 'true'; } catch (_) { return false; }
	}

	function setSetupComplete(value) {
		try { localStorage.setItem(SETUP_COMPLETE_KEY, value ? 'true' : 'false'); } catch (_) {}
	}

	function isInstanceEmpty() {
		try {
			// Indexes shifted by the Security step at index 0:
			// 0 security, 1 classes, 2 students, 3 categories, 4 questions,
			// 5 exams, 6 games, 7 done. The security step never counts toward
			// emptiness — a school can be fully identified on an empty instance.
			var classes = STEPS[1].count();
			var students = STEPS[2].count();
			var questions = STEPS[4].count();
			var exams = STEPS[5].count();
			var games = STEPS[6].count();
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
		} else if (step.id === 'security') {
			renderSecurityContent(panel);
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

	// ─── Security step (index 0) ──────────────────────────────────────────────

	function renderSecurityContent(panel) {
		var profile = schoolProfileCache.profile || {};
		var teachers = teacherCount();
		panel.innerHTML =
			'<h3 class="qs-title">🔐 School & Security</h3>' +
			'<p class="qs-desc">Each school has its own identity, credentials, and staff. Fill this in once — it powers the login page branding, per-school data, and password recovery.</p>' +

			'<div class="qs-security">' +
			'<h4 class="qs-section-title">🏫 School Information</h4>' +
			'<div class="qs-form-grid">' +
			'<div class="qs-field qs-field-full"><label for="qsSchoolName">School Name</label>' +
			'<input type="text" id="qsSchoolName" class="form-control" placeholder="Lycée Al Khawarizmi" value="' + escapeHtml(profile.name || '') + '"></div>' +
			'<div class="qs-field"><label for="qsSchoolType">School Type</label>' +
			'<select id="qsSchoolType" class="form-control">' +
			'<option value="primaire"' + (profile.school_type === 'primaire' ? ' selected' : '') + '>Primaire (Primary)</option>' +
			'<option value="college"' + (profile.school_type === 'college' ? ' selected' : '') + '>Collège (Middle School)</option>' +
			'<option value="lycee"' + (profile.school_type === 'lycee' ? ' selected' : '') + '>Lycée (High School)</option>' +
			'</select></div>' +
			'<div class="qs-field"><label for="qsSchoolCity">City</label>' +
			'<input type="text" id="qsSchoolCity" class="form-control" placeholder="Casablanca" value="' + escapeHtml(profile.city || '') + '"></div>' +
			'<div class="qs-field qs-field-full"><label for="qsSchoolAddress">Address</label>' +
			'<input type="text" id="qsSchoolAddress" class="form-control" placeholder="12 Rue des Écoles" value="' + escapeHtml(profile.address || '') + '"></div>' +
			'<div class="qs-field"><label for="qsSchoolPhone">Phone</label>' +
			'<input type="tel" id="qsSchoolPhone" class="form-control" placeholder="+212 5 22 00 00 00" value="' + escapeHtml(profile.phone || '') + '"></div>' +
			'<div class="qs-field"><label for="qsSchoolEmail">Email</label>' +
			'<input type="email" id="qsSchoolEmail" class="form-control" placeholder="contact@school.com" value="' + escapeHtml(profile.email || '') + '"></div>' +
			'<div class="qs-field qs-field-full"><label>Logo</label>' +
			'<div class="qs-logo-row">' +
			'<div class="qs-logo-preview" id="qsLogoPreview">' + (profile.logo_url ? '<img src="' + escapeHtml(profile.logo_url) + '" alt="School logo">' : '🖼️') + '</div>' +
			'<div class="qs-logo-actions">' +
			'<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'qsLogoInput\').click()">Upload Logo</button>' +
			'<button type="button" class="btn btn-secondary qs-logo-clear" onclick="window.quickStartClearLogo()">Remove</button>' +
			'<small class="text-muted">PNG/JPG/GIF/WebP/SVG — max 300&nbsp;KB. Shown on the login page and header.</small>' +
			'</div></div>' +
			'<input type="file" id="qsLogoInput" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none" onchange="window.quickStartPickLogo(this)">' +
			'</div>' +
			'<div class="qs-actions">' +
			'<button type="button" class="btn btn-primary" onclick="window.quickStartSaveSchool()">💾 Save School Info</button>' +
			'</div>' +

			'<h4 class="qs-section-title">🔑 Admin Credentials</h4>' +
			'<div class="qs-cred-grid">' +
			'<div class="qs-cred-card">' +
			'<h5>Change Admin Password</h5>' +
			'<div class="qs-field"><label for="qsCurrentPassword">Current Password</label>' +
			'<input type="password" id="qsCurrentPassword" class="form-control" autocomplete="current-password"></div>' +
			'<div class="qs-field"><label for="qsNewPassword">New Password</label>' +
			'<input type="password" id="qsNewPassword" class="form-control" autocomplete="new-password" placeholder="Min 6 characters"></div>' +
			'<div class="qs-field"><label for="qsConfirmPassword">Confirm New Password</label>' +
			'<input type="password" id="qsConfirmPassword" class="form-control" autocomplete="new-password"></div>' +
			'<button type="button" class="btn btn-secondary" onclick="window.quickStartChangePassword()">Update Password</button>' +
			'<small class="text-muted">Changing it keeps your session alive on this device.</small>' +
			'</div>' +
			'<div class="qs-cred-card">' +
			'<h5>Recovery Code</h5>' +
			'<p class="text-muted qs-cred-note">If you ever forget the admin password, this code unlocks a reset — from any device, not just this browser.</p>' +
			'<div class="qs-field"><label for="qsRecoveryCode">Recovery Code</label>' +
			'<input type="text" id="qsRecoveryCode" class="form-control" placeholder="e.g. SAFETY-2026-XYZ" autocomplete="off"></div>' +
			'<div class="qs-field"><label for="qsRecoveryCodeConfirm">Confirm Code</label>' +
			'<input type="text" id="qsRecoveryCodeConfirm" class="form-control" placeholder="Repeat the code" autocomplete="off"></div>' +
			'<button type="button" class="btn btn-secondary" onclick="window.quickStartSaveRecovery()">Set Recovery Code</button>' +
			'<small class="text-muted">Stored as a bcrypt hash on the server — write it down somewhere safe.</small>' +
			'</div>' +
			'</div>' +

			'<h4 class="qs-section-title">🧑‍🏫 Teachers</h4>' +
			'<div class="qs-status ' + (teachers > 0 ? 'ok' : '') + '">' +
			(teachers > 0 ? '✓ ' + teachers + ' teacher(s) already added' : 'No teachers yet — add their accounts with full profiles (numero, phone, email, subjects, classes).') +
			'</div>' +
			'<div class="qs-actions">' +
			'<button type="button" class="btn btn-primary" onclick="window.quickStartAddTeacher()">➕ Add teacher</button>' +
			'</div>' +
			'</div>';

		if (!schoolProfileCache.loaded) {
			fetchSchoolProfile().then(function () {
				if (STEPS[state.currentStep] && STEPS[state.currentStep].id === 'security') {
					renderSecurityContent(panel);
				}
			});
		}
	}

	window.quickStartPickLogo = function (input) {
		if (!input || !input.files || !input.files[0]) return;
		var file = input.files[0];
		if (file.size > 300 * 1024) {
			showToastSafe('Logo too large — maximum 300 KB', 'error');
			input.value = '';
			return;
		}
		var reader = new FileReader();
		reader.onload = function (e) {
			pendingLogoBase64 = String(e.target.result || '');
			var preview = document.getElementById('qsLogoPreview');
			if (preview) preview.innerHTML = '<img src="' + escapeHtml(pendingLogoBase64) + '" alt="School logo preview">';
		};
		reader.readAsDataURL(file);
	};

	window.quickStartClearLogo = function () {
		pendingLogoBase64 = '';
		var preview = document.getElementById('qsLogoPreview');
		if (preview) preview.innerHTML = '🖼️';
	};

	function showToastSafe(message, type) {
		if (typeof showToast === 'function') showToast(message, type);
		else if (window.showToast) window.showToast(message, type);
	}

	window.quickStartSaveSchool = function () {
		var nameEl = document.getElementById('qsSchoolName');
		var typeEl = document.getElementById('qsSchoolType');
		var cityEl = document.getElementById('qsSchoolCity');
		var addressEl = document.getElementById('qsSchoolAddress');
		var phoneEl = document.getElementById('qsSchoolPhone');
		var emailEl = document.getElementById('qsSchoolEmail');
		var name = nameEl ? nameEl.value.trim() : '';
		if (!name) {
			showToastSafe('School name is required', 'error');
			return;
		}
		var body = {
			name: name,
			school_type: typeEl ? typeEl.value : 'primaire',
			city: (cityEl ? cityEl.value : '').trim() || null,
			address: (addressEl ? addressEl.value : '').trim() || null,
			phone: (phoneEl ? phoneEl.value : '').trim() || null,
			email: (emailEl ? emailEl.value : '').trim() || null,
		};
		// Only send the logo when the user picked/cleared one — otherwise the
		// existing one is kept server-side.
		if (pendingLogoBase64 !== null) body.logo_url = pendingLogoBase64;

		if (!(window.API && window.API.raw)) {
			showToastSafe('Server API unavailable', 'error');
			return;
		}
		window.API.raw('PUT', '/school/profile', body)
			.then(function (updated) {
				schoolProfileCache.profile = updated;
				pendingLogoBase64 = null;
				if (updated && updated.name && updated.name !== 'My School') {
					schoolProfileCache.namedByWizard = true;
				}
				showToastSafe('School information saved', 'success');
				renderSteps();
				renderStepContent();
			})
			.catch(function (err) {
				showToastSafe('Failed to save school info: ' + (err && err.message ? err.message : 'network error'), 'error');
			});
	};

	window.quickStartChangePassword = function () {
		var currentEl = document.getElementById('qsCurrentPassword');
		var newEl = document.getElementById('qsNewPassword');
		var confirmEl = document.getElementById('qsConfirmPassword');
		var currentPassword = currentEl ? currentEl.value : '';
		var newPassword = newEl ? newEl.value : '';
		var confirmPassword = confirmEl ? confirmEl.value : '';

		if (!currentPassword || !newPassword) {
			showToastSafe('Current and new password are required', 'error');
			return;
		}
		if (newPassword.length < 6) {
			showToastSafe('New password must be at least 6 characters', 'error');
			return;
		}
		if (newPassword !== confirmPassword) {
			showToastSafe('New passwords do not match', 'error');
			return;
		}

		if (!(window.API && window.API.raw)) {
			showToastSafe('Server API unavailable', 'error');
			return;
		}
		window.API.raw('POST', '/auth/change-password', { oldPassword: currentPassword, newPassword: newPassword })
			.then(function () {
				schoolProfileCache.passwordChanged = true;
				if (currentEl) currentEl.value = '';
				if (newEl) newEl.value = '';
				if (confirmEl) confirmEl.value = '';
				showToastSafe('Password updated — session stays active', 'success');
				renderSteps();
			})
			.catch(function (err) {
				showToastSafe('Password change failed: ' + (err && err.message ? err.message : 'error'), 'error');
			});
	};

	window.quickStartSaveRecovery = function () {
		var codeEl = document.getElementById('qsRecoveryCode');
		var confirmEl = document.getElementById('qsRecoveryCodeConfirm');
		var code = codeEl ? codeEl.value.trim() : '';
		var confirmCode = confirmEl ? confirmEl.value.trim() : '';

		if (!code || code.length < 4) {
			showToastSafe('Recovery code must be at least 4 characters', 'error');
			return;
		}
		if (code !== confirmCode) {
			showToastSafe('Recovery codes do not match', 'error');
			return;
		}

		if (!(window.API && window.API.raw)) {
			showToastSafe('Server API unavailable', 'error');
			return;
		}
		// POST /auth/recover/set — authenticated admin session; the server
		// bcrypts the code and stores ONLY the hash in a system-visibility
		// settings row that no GET can ever return.
		window.API.raw('POST', '/auth/recover/set', { code: code })
			.then(function () {
				schoolProfileCache.recoverySet = true;
				if (codeEl) codeEl.value = '';
				if (confirmEl) confirmEl.value = '';
				showToastSafe('Recovery code saved — store it somewhere safe 🔐', 'success');
				renderSteps();
			})
			.catch(function (err) {
				showToastSafe('Failed to save recovery code: ' + (err && err.message ? err.message : 'error'), 'error');
			});
	};

	window.quickStartAddTeacher = function () {
		// Reuse the existing user modal — pre-select the teacher role so the
		// new teacher-profile fields (numero/phone/email/subjects) appear.
		if (window.openUserModal) {
			window.openUserModal(null);
			var roleSelect = document.getElementById('userRole');
			if (roleSelect) {
				roleSelect.value = 'teacher';
				if (typeof window.updateUserRoleFields === 'function') window.updateUserRoleFields();
				else if (roleSelect.dispatchEvent) {
					roleSelect.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
		}
	};

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
		// Opening on the Security step needs the school profile (name/type/
		// contacts pre-fill) — warm the cache before the first render happens
		// with empty values. renderSecurityContent re-renders on arrival.
		if (!schoolProfileCache.loaded) fetchSchoolProfile();
	}

	function closeQuickStartModal() {
		var modal = document.getElementById('quickStartModal');
		if (modal) modal.style.display = 'none';
		state.open = false;
	}

	function dismissQuickStart(mode) {
		// 'later' = keep setup complete so it never auto-shows again; the
		// manual button in Settings → Data always reopens it.
		if (mode === 'later') {
			setSetupComplete(true);
			markDismissed();
		}
		closeQuickStartModal();
	}

	function quickStartGo(direction) {
		if (state.currentStep === STEPS.length - 1 && direction > 0) {
			// Finish
			setSetupComplete(true);
			markDismissed();
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

	// A conscious dismissal ("Later" / Finish) records *when* it happened. The
	// auto-show never reopens over it — even on an empty instance — until the
	// reset flow explicitly clears the marker (a fresh first setup).
	function getDismissedAt() {
		try {
			var raw = localStorage.getItem('quizQuickStartDismissedAt');
			return raw ? Number(raw) : 0;
		} catch (_) { return 0; }
	}

	function markDismissed() {
		try { localStorage.setItem('quizQuickStartDismissedAt', String(Date.now())); } catch (_) {}
	}

	function maybeAutoShow(markCompleteIfData) {
		if (!window.Auth || !window.Auth.getCurrentUser) return;
		var user = window.Auth.getCurrentUser();
		if (!user) return;
		var role = String(user.role || '').toLowerCase();
		if (role !== 'admin' && role !== 'super_admin') return;
		if (state.open) return;
		var dismissed = getDismissedAt() > 0;
		if (getSetupComplete() && dismissed) return;
		var empty = isInstanceEmpty();
		if (empty) {
			// Empty instance (bootstrap-confirmed when markCompleteIfData is
			// set) with a stale completion flag — e.g. the flag survived a
			// server-side reset done outside the UI. Self-heal and show.
			// A conscious dismissal still wins: never nag over "Later".
			if (getSetupComplete() && !dismissed) setSetupComplete(false);
			if (dismissed) return;
		} else if (getSetupComplete()) {
			return;
		} else {
			// Data already exists. Only the bootstrap-confirmed check may
			// permanently mark setup complete — a plain-load timer can race
			// ahead of the server sync and see stale localStorage mirrors.
			if (markCompleteIfData) setSetupComplete(true);
			return;
		}
		openQuickStart(false);
	}

	function init() {
		var ranBootstrapCheck = false;

		// Bootstrap-confirmed check: the local mirrors are authoritative.
		// This is the only path allowed to mark setup complete.
		function bootstrapCheck() {
			ranBootstrapCheck = true;
			maybeAutoShow(true);
		}

		window.addEventListener('quiz:bootstrap-ready', bootstrapCheck);

		// Race guard: legacy-bridge.js is a NON-defer script whose bootstrap
		// fetch can resolve before this deferred script registers the
		// listener above — the event would be lost. The bridge timestamps
		// every successful bootstrap, so if it already landed run the check
		// directly instead of waiting for an event that already fired.
		if (window.__legacyBridgeBootstrappedAt) {
			bootstrapCheck();
		} else {
			// Bootstrap still in flight — poll for the timestamp as backup
			// (covers any other path where the listener misses the event).
			var pollStart = Date.now();
			var poll = setInterval(function () {
				if (window.__legacyBridgeBootstrappedAt || Date.now() - pollStart > 30000) {
					clearInterval(poll);
					if (window.__legacyBridgeBootstrappedAt) bootstrapCheck();
					else if (!ranBootstrapCheck) maybeAutoShow(false);
				}
			}, 1000);
		}

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

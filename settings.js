// Settings Management

// Default settings object
const DEFAULT_SETTINGS = {
	totalQuestions: 5,
	timeLimit: 300,
	penalty: 5,
	primaryColor: '#2563eb',
	secondaryColor: '#1e40af',
	backgroundColor: '#f8fafc',
	textColor: '#1e293b',
	inputFocusColor: '#3b82f6',
	fontFamily: "'Segoe UI', system-ui",
	welcomeTitle: 'Welcome to the Quiz',
	welcomeMessage: 'Test your knowledge with our interactive quiz!',
	// Realtime settings
	serverHost: '',
	recoveryCodeHash: '',
	realtimeEnabled: false,
	autoSync: true,
	broadcastUpdates: true,
	realtimeSyncInterval: 5,
	// Training mode settings
	trainingPresetId: '',
	// Teacher access controls
	teacherAccess: {
		tabs: {
			overview: true,
			questions: true,
			categories: true,
			exams: true,
			classes: true,
			games: true,
			results: true,
			activity: true,
		},
		settings: true,
		settingsTabs: {
			general: true,
			presets: true,
			// Data and Realtime are school-wide admin concerns
			// (full backups, LAN server config) — off for teachers by default.
			data: false,
			realtime: false,
			'ai-generation': true,
			users: true,
			games: true,
		},
	},
};

// Current settings object
let currentSettings = { ...DEFAULT_SETTINGS };
let settingsAutoSaveTimer = null;
let settingsAutosaveStatusTimer = null;
let settingsAutoSaveBound = false;
let settingsAutoSaveInFlight = false;
let settingsAutoSaveQueued = false;
let settingsAutoSaveDirty = false;
let settingsPageScrollLocked = false;
let settingsPageScrollY = 0;
const SETTINGS_AUTOSAVE_DELAY_MS = 650;

// Initialize settings on load
document.addEventListener('DOMContentLoaded', () => {
	console.log('Settings.js: DOMContentLoaded - Loading settings...');
	loadSettings();
	applySettings();
	bindSettingsAutoSave();
	console.log('Settings.js: Settings loaded and applied.');
	console.log('window.openSettingsModal is:', typeof window.openSettingsModal);
});

// Load settings from localStorage
function loadSettings() {
	try {
		const savedSettings = localStorage.getItem('quizSettings');
		if (savedSettings) {
			currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
		}
	} catch (e) {
		console.error('Error loading settings:', e);
	}
}

// Apply settings to the application (Theme & Config)
function applySettings() {
	const root = document.documentElement;

	// Apply CSS Variables
	root.style.setProperty('--primary', currentSettings.primaryColor);
	root.style.setProperty('--primary-dark', currentSettings.secondaryColor); // Using secondary for primary-dark
	root.style.setProperty('--bg-body', currentSettings.backgroundColor);
	root.style.setProperty('--text-main', currentSettings.textColor);
	root.style.setProperty('--border-focus', currentSettings.inputFocusColor);
	root.style.setProperty('--font-sans', currentSettings.fontFamily);

	const welcomeTitleNodes = document.querySelectorAll(
		'#welcome-title, .welcome-title, .welcome-page h1, [data-setting="welcomeTitle"]',
	);
	welcomeTitleNodes.forEach((node) => {
		if (currentSettings.welcomeTitle) node.textContent = currentSettings.welcomeTitle;
	});

	const welcomeMessageNodes = document.querySelectorAll(
		'#welcome-message, .welcome-message, [data-setting="welcomeMessage"]',
	);
	welcomeMessageNodes.forEach((node) => {
		if (currentSettings.welcomeMessage) node.textContent = currentSettings.welcomeMessage;
	});

	// You might want to update other theme variables derived from these
	// e.g., --primary-light could be a lighter version of primaryColor
}

// Open Settings Modal
function openSettingsModal() {
	if (window.Auth && typeof window.Auth.canAccessTab === 'function') {
		if (!window.Auth.canAccessTab('settings')) {
			if (typeof showToast === 'function') {
				showToast('Access denied', 'error');
			}
			return;
		}
	}
	const modal = document.getElementById('settingsModal');
	if (!modal) return;
	const isMobileSettings = isMobileSettingsViewport();
	applySettingsSidebarState(
		isMobileSettings
			? localStorage.getItem('settingsMobileMenuCollapsed') !== 'false'
			: localStorage.getItem('settingsSidebarCollapsed') === 'true',
	);

	// Populate fields
	document.getElementById('setting-totalQuestions').value =
		currentSettings.totalQuestions;
	document.getElementById('setting-timeLimit').value =
		currentSettings.timeLimit;
	document.getElementById('setting-penalty').value = currentSettings.penalty;

	document.getElementById('setting-primaryColor').value =
		currentSettings.primaryColor;
	document.getElementById('setting-primaryColor-text').value =
		currentSettings.primaryColor;

	document.getElementById('setting-secondaryColor').value =
		currentSettings.secondaryColor;
	document.getElementById('setting-secondaryColor-text').value =
		currentSettings.secondaryColor;

	document.getElementById('setting-backgroundColor').value =
		currentSettings.backgroundColor;
	document.getElementById('setting-backgroundColor-text').value =
		currentSettings.backgroundColor;

	document.getElementById('setting-textColor').value =
		currentSettings.textColor;
	document.getElementById('setting-textColor-text').value =
		currentSettings.textColor;

	document.getElementById('setting-inputFocusColor').value =
		currentSettings.inputFocusColor;
	document.getElementById('setting-inputFocusColor-text').value =
		currentSettings.inputFocusColor;

	document.getElementById('setting-fontFamily').value =
		currentSettings.fontFamily;

	document.getElementById('setting-welcomeTitle').value =
		currentSettings.welcomeTitle;
	document.getElementById('setting-welcomeMessage').value =
		currentSettings.welcomeMessage;

	// Populate training preset dropdown
	window.refreshTrainingPresetDropdown();

	// Populate realtime settings
	const serverHostInput = document.getElementById('setting-serverHost');
	if (serverHostInput) serverHostInput.value = currentSettings.serverHost || '';

	const recoveryCodeInput = document.getElementById('setting-recoveryCode');
	if (recoveryCodeInput) recoveryCodeInput.value = '';

	const realtimeEnabledInput = document.getElementById(
		'setting-realtimeEnabled',
	);
	if (realtimeEnabledInput)
		realtimeEnabledInput.checked = currentSettings.realtimeEnabled || false;

	const autoSyncInput = document.getElementById('setting-autoSync');
	if (autoSyncInput) autoSyncInput.checked = currentSettings.autoSync !== false;

	const broadcastUpdatesInput = document.getElementById(
		'setting-broadcastUpdates',
	);
	if (broadcastUpdatesInput)
		broadcastUpdatesInput.checked = currentSettings.broadcastUpdates !== false;

	const syncIntervalInput = document.getElementById(
		'setting-realtimeSyncInterval',
	);
	if (syncIntervalInput)
		syncIntervalInput.value = currentSettings.realtimeSyncInterval || 5;

	// Populate teacher access controls
	populateTeacherAccessForm();

	// Reset tabs
	switchSettingsTab(null, 'general');
	const activeBtn = document.querySelector('.settings-tab-btn.active');
	if (activeBtn && activeBtn.classList.contains('role-hidden')) {
		const firstVisible = Array.from(
			document.querySelectorAll('.settings-tab-btn'),
		).find((btn) => !btn.classList.contains('role-hidden'));
		if (firstVisible) {
			switchSettingsTab(
				{ currentTarget: firstVisible },
				firstVisible.dataset.settingsTab,
			);
		}
	}

	// Show modal
	modal.style.display = 'block';
	lockSettingsPageScroll();
	settingsAutoSaveDirty = false;
	setSettingsAutosaveStatus('Auto-save on', 'idle');

	// Force content visibility (debug fix)
	const content = modal.querySelector('.modal-content');
	if (content) {
		content.style.opacity = '1';
		content.style.transform = 'translateY(0)';
		content.style.backgroundColor = '#ffffff'; // Ensure background
		content.style.display = 'flex';
	}

	// close dropdown menu if open
	const profileMenu = document.getElementById('profileMenu');
	if (profileMenu) profileMenu.classList.remove('active');

	// Refresh user list if available
	if (typeof window.renderUsersTable === 'function') {
		window.renderUsersTable();
	}
	if (typeof window.renderProfileRequests === 'function') {
		window.renderProfileRequests();
	}
}

// Close Settings Modal
function closeSettingsModal(options = {}) {
	if (!options.skipAutoSave) {
		const form = document.getElementById('settingsForm');
		if (form?.contains(document.activeElement)) {
			document.activeElement.blur();
		}
		void flushSettingsAutoSave();
	}
	const modal = document.getElementById('settingsModal');
	if (modal) modal.style.display = 'none';
	unlockSettingsPageScroll();
}

function lockSettingsPageScroll() {
	if (settingsPageScrollLocked) return;

	settingsPageScrollLocked = true;
	settingsPageScrollY =
		window.scrollY ||
		document.documentElement.scrollTop ||
		document.body.scrollTop ||
		0;
	document.documentElement.classList.add('settings-modal-open');
	document.body.classList.add('settings-modal-open');
	if (isMobileSettingsViewport()) {
		document.body.style.top = `-${settingsPageScrollY}px`;
	}
}

function unlockSettingsPageScroll() {
	if (!settingsPageScrollLocked) return;

	settingsPageScrollLocked = false;
	document.documentElement.classList.remove('settings-modal-open');
	document.body.classList.remove('settings-modal-open');
	document.body.style.top = '';
	window.scrollTo(0, settingsPageScrollY);
	settingsPageScrollY = 0;
}

function setSettingsAutosaveStatus(message, state = 'idle') {
	const status = document.getElementById('settingsAutosaveStatus');
	if (!status) return;
	status.textContent = message;
	status.dataset.state = state;
	if (settingsAutosaveStatusTimer) {
		clearTimeout(settingsAutosaveStatusTimer);
		settingsAutosaveStatusTimer = null;
	}
	if (state === 'saved') {
		settingsAutosaveStatusTimer = setTimeout(() => {
			setSettingsAutosaveStatus('Auto-save on', 'idle');
		}, 1800);
	}
}

function syncSettingsColorInputs(changedTarget = null) {
	const colorPairs = [
		['setting-primaryColor', 'setting-primaryColor-text'],
		['setting-secondaryColor', 'setting-secondaryColor-text'],
		['setting-backgroundColor', 'setting-backgroundColor-text'],
		['setting-textColor', 'setting-textColor-text'],
		['setting-inputFocusColor', 'setting-inputFocusColor-text'],
	];

	colorPairs.forEach(([colorId, textId]) => {
		const colorInput = document.getElementById(colorId);
		const textInput = document.getElementById(textId);
		if (!colorInput || !textInput) return;
		if (changedTarget === colorInput) {
			textInput.value = colorInput.value;
			return;
		}
		const textValue = String(textInput.value || '').trim();
		if (/^#[0-9a-f]{6}$/i.test(textValue)) {
			colorInput.value = textValue;
		}
	});
}

function shouldAutoSaveSettingsTarget(target, eventType) {
	if (!target?.matches?.('input, select, textarea')) return false;
	if (target.matches('[type="file"], [data-no-autosave]')) return false;
	if (target.id === 'setting-recoveryCode' && eventType === 'input') return false;
	return Boolean(target.closest('#settingsForm'));
}

function bindSettingsAutoSave() {
	if (settingsAutoSaveBound) return;
	const form = document.getElementById('settingsForm');
	if (!form) return;
	settingsAutoSaveBound = true;

	form.addEventListener('input', (event) => {
		if (!shouldAutoSaveSettingsTarget(event.target, 'input')) return;
		scheduleSettingsAutoSave(event.target);
	});

	form.addEventListener('change', (event) => {
		if (!shouldAutoSaveSettingsTarget(event.target, 'change')) return;
		scheduleSettingsAutoSave(event.target, 120);
	});

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		void saveSettingsForm();
	});
}

function scheduleSettingsAutoSave(changedTarget = null, delay = SETTINGS_AUTOSAVE_DELAY_MS) {
	syncSettingsColorInputs(changedTarget);
	settingsAutoSaveDirty = true;
	if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
	setSettingsAutosaveStatus('Saving...', 'saving');
	settingsAutoSaveTimer = setTimeout(() => {
		void flushSettingsAutoSave();
	}, delay);
}

async function flushSettingsAutoSave() {
	if (settingsAutoSaveTimer) {
		clearTimeout(settingsAutoSaveTimer);
		settingsAutoSaveTimer = null;
	}
	if (!settingsAutoSaveDirty) return;
	if (settingsAutoSaveInFlight) {
		settingsAutoSaveQueued = true;
		return;
	}
	settingsAutoSaveInFlight = true;
	try {
		settingsAutoSaveDirty = false;
		await saveSettingsForm({
			closeModal: false,
			notify: false,
			source: 'auto',
		});
	} catch (error) {
		settingsAutoSaveDirty = true;
		console.error('Settings auto-save failed:', error);
		setSettingsAutosaveStatus('Save failed', 'error');
	} finally {
		settingsAutoSaveInFlight = false;
		if (settingsAutoSaveQueued || settingsAutoSaveDirty) {
			settingsAutoSaveQueued = false;
			scheduleSettingsAutoSave(null, 120);
		}
	}
}

function isMobileSettingsViewport() {
	return Boolean(
		window.matchMedia?.('(max-width: 760px)').matches ||
			window.innerWidth <= 760,
	);
}

function applySettingsSidebarState(collapsed) {
	const modal = document.getElementById('settingsModal');
	const toggle = document.getElementById('settingsSidebarToggle');
	if (!modal) return;

	modal.classList.toggle('settings-sidebar-collapsed', Boolean(collapsed));
	if (toggle) {
		toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		const label = toggle.querySelector('span');
		if (label) {
			label.textContent = isMobileSettingsViewport()
				? 'Sections'
				: collapsed
					? 'Show Tabs'
					: 'Hide Tabs';
		}
		toggle.setAttribute(
			'aria-label',
			collapsed ? 'Show settings sections' : 'Hide settings sections',
		);
	}
}

function toggleSettingsSidebar(forceCollapsed) {
	const modal = document.getElementById('settingsModal');
	if (!modal) return;

	const collapsed =
		typeof forceCollapsed === 'boolean'
			? forceCollapsed
			: !modal.classList.contains('settings-sidebar-collapsed');
	applySettingsSidebarState(collapsed);
	localStorage.setItem(
		isMobileSettingsViewport()
			? 'settingsMobileMenuCollapsed'
			: 'settingsSidebarCollapsed',
		String(collapsed),
	);
}

function populateTeacherAccessForm() {
	const access = currentSettings.teacherAccess || DEFAULT_SETTINGS.teacherAccess;
	const tabMap = {
		overview: 'teacher-access-overview',
		questions: 'teacher-access-questions',
		categories: 'teacher-access-categories',
		exams: 'teacher-access-exams',
		classes: 'teacher-access-classes',
		games: 'teacher-access-games',
		results: 'teacher-access-results',
		activity: 'teacher-access-activity',
	};
	const settingsMap = {
		general: 'teacher-access-settings-general',
		presets: 'teacher-access-settings-presets',
		data: 'teacher-access-settings-data',
		realtime: 'teacher-access-settings-realtime',
		'ai-generation': 'teacher-access-settings-ai',
		users: 'teacher-access-settings-users',
		games: 'teacher-access-settings-games',
	};

	Object.entries(tabMap).forEach(([key, id]) => {
		const el = document.getElementById(id);
		if (el)
			el.checked =
				access.tabs?.[key] !== undefined
					? access.tabs[key]
					: DEFAULT_SETTINGS.teacherAccess.tabs[key];
	});

	const settingsToggle = document.getElementById('teacher-access-settings');
	if (settingsToggle)
		settingsToggle.checked =
			access.settings !== undefined
				? access.settings
				: DEFAULT_SETTINGS.teacherAccess.settings;

	Object.entries(settingsMap).forEach(([key, id]) => {
		const el = document.getElementById(id);
		if (el)
			el.checked =
				access.settingsTabs?.[key] !== undefined
					? access.settingsTabs[key]
					: DEFAULT_SETTINGS.teacherAccess.settingsTabs[key];
	});
}

function readTeacherAccessForm() {
	const access = currentSettings.teacherAccess || DEFAULT_SETTINGS.teacherAccess;
	const tabMap = {
		overview: 'teacher-access-overview',
		questions: 'teacher-access-questions',
		categories: 'teacher-access-categories',
		exams: 'teacher-access-exams',
		classes: 'teacher-access-classes',
		games: 'teacher-access-games',
		results: 'teacher-access-results',
		activity: 'teacher-access-activity',
	};
	const settingsMap = {
		general: 'teacher-access-settings-general',
		presets: 'teacher-access-settings-presets',
		data: 'teacher-access-settings-data',
		realtime: 'teacher-access-settings-realtime',
		'ai-generation': 'teacher-access-settings-ai',
		users: 'teacher-access-settings-users',
		games: 'teacher-access-settings-games',
	};

	const nextAccess = {
		tabs: { ...access.tabs },
		settings: access.settings,
		settingsTabs: { ...access.settingsTabs },
	};

	Object.entries(tabMap).forEach(([key, id]) => {
		const el = document.getElementById(id);
		if (el) nextAccess.tabs[key] = el.checked;
	});

	const settingsToggle = document.getElementById('teacher-access-settings');
	if (settingsToggle) nextAccess.settings = settingsToggle.checked;

	Object.entries(settingsMap).forEach(([key, id]) => {
		const el = document.getElementById(id);
		if (el) nextAccess.settingsTabs[key] = el.checked;
	});

	return nextAccess;
}

// Switch Tabs
function switchSettingsTab(event, tabName) {
	// Role guard: admin-only tabs (teacher-access, data, realtime) can never be
	// opened by a teacher, even via console calls or stale cached buttons.
	if (
		typeof window.Auth === 'object' &&
		window.Auth &&
		typeof window.Auth.isTeacher === 'function' &&
		window.Auth.isTeacher() &&
		!window.Auth.canAccessSettingsTab(tabName)
	) {
		if (typeof showToast === 'function')
			showToast('This settings section is admin-only', 'error');
		return;
	}

	// Hide all sections
	document
		.querySelectorAll('.settings-section')
		.forEach((el) => el.classList.add('hidden'));

	// Show selected section
	const target = document.getElementById(`${tabName}-settings`);
	if (target) {
		target.classList.remove('hidden');
		// Dynamically refresh preset dropdown when entering General tab
		if (tabName === 'general' && window.refreshTrainingPresetDropdown) {
			window.refreshTrainingPresetDropdown();
		}
		if (tabName === 'presets' && window.refreshGamePresetSettings) {
			window.refreshGamePresetSettings();
		}
		if (tabName === 'presets') {
			const activePresetTabBtn = document.querySelector(
				'#presets-settings .preset-settings-tab-btn.active',
			);
			const presetTab = activePresetTabBtn?.dataset.presetTab || 'quiz';
			switchPresetSettingsTab(null, presetTab);
		}
		if (tabName === 'users') {
			const activeUsersTabBtn = document.querySelector(
				'#users-settings .user-settings-tab-btn.active',
			);
			const usersTab = activeUsersTabBtn?.dataset.userTab || 'management';
			switchUsersSettingsTab(null, usersTab);
			// Refresh the pending-imports badge as soon as Users opens.
			if (typeof window.refreshPendingImportsBadge === 'function') {
				window.refreshPendingImportsBadge();
			}
		}
		// Refresh AI model lists (shared models, admin catalog, personal models)
		// whenever the AI Generation tab is opened.
		if (tabName === 'ai-generation' && window.refreshAIConfigLists) {
			window.refreshAIConfigLists();
		}
	}

	// Update buttons
	if (event) {
		const activeButton =
			event.currentTarget ||
			event.target?.closest?.('.settings-tab-btn') ||
			event.target;
		document
			.querySelectorAll('.settings-tabs button')
			.forEach((btn) => btn.classList.remove('active'));
		if (activeButton?.classList) activeButton.classList.add('active');
		if (isMobileSettingsViewport()) toggleSettingsSidebar(true);
	} else {
		// Find button for this tab and activate it
		const buttons = document.querySelectorAll('.settings-tabs button');
		buttons.forEach((btn) => {
			const key =
				btn.dataset.settingsTab ||
				btn.innerText.toLowerCase().trim().replace(/\s+/g, '-');
			if (key === tabName) btn.classList.add('active');
			else btn.classList.remove('active');
		});
	}
}

function switchUsersSettingsTab(event, tabName) {
	const scope = document.getElementById('users-settings');
	if (!scope) return;

	// The imports review queue is admin-only: hide its tab from teachers
	// (staged imports wait for admin confirmation).
	const importsTab = scope.querySelector('.user-settings-tab-btn[data-user-tab="imports"]');
	if (importsTab) {
		const isAdmin =
			window.Auth && typeof window.Auth.isAdmin === 'function'
				? window.Auth.isAdmin()
				: false;
		importsTab.classList.toggle('hidden', !isAdmin);
	}

	const safeTab =
		tabName === 'requests' || tabName === 'imports' ? tabName : 'management';

	scope
		.querySelectorAll('.user-settings-panel')
		.forEach((panel) => panel.classList.add('hidden'));
	const targetPanel = scope.querySelector(
		`.user-settings-panel[data-user-tab="${safeTab}"]`,
	);
	if (targetPanel) targetPanel.classList.remove('hidden');

	scope.querySelectorAll('.user-settings-tab-btn').forEach((btn) => {
		const active = btn.dataset.userTab === safeTab;
		btn.classList.toggle('active', active);
		btn.setAttribute('aria-selected', active ? 'true' : 'false');
		btn.tabIndex = active ? 0 : -1;
	});

	if (safeTab === 'management' && typeof window.renderUsersTable === 'function') {
		window.renderUsersTable();
	}
	if (safeTab === 'imports' && typeof window.renderPendingImports === 'function') {
		window.renderPendingImports();
	}
	if (safeTab === 'requests' && typeof window.renderProfileRequests === 'function') {
		window.renderProfileRequests();
	}
}

function switchPresetSettingsTab(event, tabName) {
	const scope = document.getElementById('presets-settings');
	if (!scope) return;

	const safeTab = tabName === 'game' ? 'game' : 'quiz';

	scope
		.querySelectorAll('.preset-settings-panel')
		.forEach((panel) => panel.classList.add('hidden'));
	const targetPanel = scope.querySelector(
		`.preset-settings-panel[data-preset-tab="${safeTab}"]`,
	);
	if (targetPanel) targetPanel.classList.remove('hidden');

	scope.querySelectorAll('.preset-settings-tab-btn').forEach((btn) => {
		btn.classList.toggle('active', btn.dataset.presetTab === safeTab);
	});

	if (safeTab === 'quiz' && typeof window.loadPresetsList === 'function') {
		window.loadPresetsList();
	}
	if (
		safeTab === 'game' &&
		typeof window.refreshGamePresetSettings === 'function'
	) {
		window.refreshGamePresetSettings();
	}
}

// Save Settings
async function saveSettingsForm(options = {}) {
	const {
		closeModal: shouldCloseModal = true,
		notify = true,
		source = 'manual',
	} = options;
	syncSettingsColorInputs();
	if (source === 'auto') setSettingsAutosaveStatus('Saving...', 'saving');

	let recoveryCodeHash = currentSettings.recoveryCodeHash || '';
	const recoveryCodeInput = document.getElementById('setting-recoveryCode');
	const recoveryCode = String(
		recoveryCodeInput?.value || '',
	).trim();
	if (recoveryCode) {
		// The server-side hash (Setting system.recovery_code_hash) is what the
		// sign-in page's recovery panel actually verifies against. POST it while
		// the admin is signed in — the localStorage SHA-256 below stays as the
		// offline fallback. Raw code only travels inside this authenticated
		// session; only its bcrypt hash is persisted server-side.
		if (window.Auth?.isAdmin?.() && window.API?.raw && recoveryCode.length >= 4) {
			try {
				await window.API.raw('POST', '/auth/recover/set', { code: recoveryCode });
				if (typeof showToast === 'function') {
					showToast('Recovery code saved to the server — store it somewhere safe 🔐', 'success');
				}
			} catch (err) {
				console.warn('[settings] recovery code server save failed:', err);
				if (typeof showToast === 'function') {
					showToast(
						'Recovery code NOT saved on server: ' + (err?.message || 'error'),
						'error',
					);
				}
			}
		}
		if (window.Auth?.hashText) {
			recoveryCodeHash = await window.Auth.hashText(recoveryCode);
		}
	}
	// Gather values
	const newSettings = {
		totalQuestions:
			parseInt(document.getElementById('setting-totalQuestions').value) ||
			DEFAULT_SETTINGS.totalQuestions,
		timeLimit:
			parseInt(document.getElementById('setting-timeLimit').value) ||
			DEFAULT_SETTINGS.timeLimit,
		penalty: parseInt(document.getElementById('setting-penalty').value) || 0,

		primaryColor: document.getElementById('setting-primaryColor').value,
		secondaryColor: document.getElementById('setting-secondaryColor').value,
		backgroundColor: document.getElementById('setting-backgroundColor').value,
		textColor: document.getElementById('setting-textColor').value,
		inputFocusColor: document.getElementById('setting-inputFocusColor').value,
		fontFamily: document.getElementById('setting-fontFamily').value,

		welcomeTitle: document.getElementById('setting-welcomeTitle').value,
		welcomeMessage: document.getElementById('setting-welcomeMessage').value,

		trainingPresetId: document.getElementById('setting-trainingPreset')
			? document.getElementById('setting-trainingPreset').value
			: currentSettings.trainingPresetId || '',

		// Realtime settings
		serverHost: document.getElementById('setting-serverHost')
			? document.getElementById('setting-serverHost').value
			: currentSettings.serverHost || '',
		recoveryCodeHash,
		realtimeEnabled: document.getElementById('setting-realtimeEnabled')
			? document.getElementById('setting-realtimeEnabled').checked
			: currentSettings.realtimeEnabled || false,
		autoSync: document.getElementById('setting-autoSync')
			? document.getElementById('setting-autoSync').checked
			: currentSettings.autoSync !== undefined
				? currentSettings.autoSync
				: true,
		broadcastUpdates: document.getElementById('setting-broadcastUpdates')
			? document.getElementById('setting-broadcastUpdates').checked
			: currentSettings.broadcastUpdates !== undefined
				? currentSettings.broadcastUpdates
				: true,
		realtimeSyncInterval: document.getElementById(
			'setting-realtimeSyncInterval',
		)
			? parseInt(document.getElementById('setting-realtimeSyncInterval').value)
			: currentSettings.realtimeSyncInterval || 5,

		teacherAccess: readTeacherAccessForm(),
	};

	// Save
	currentSettings = newSettings;
	localStorage.setItem('quizSettings', JSON.stringify(currentSettings));
	if (source !== 'auto') settingsAutoSaveDirty = false;
	// Clean up any Admin Secret left over from the old shared-secret flow —
	// realtime auth now rides on the login JWT instead.
	localStorage.removeItem('quizAdminSecret');
	window.dispatchEvent(new CustomEvent('quiz:settings-applied', { detail: currentSettings }));

	// Apply
	applySettings();
	if (window.Auth && typeof window.Auth.applyRolePermissions === 'function') {
		window.Auth.applyRolePermissions();
	}

	// Save AI settings if available
	if (typeof window.saveAISettings === 'function') {
		window.saveAISettings();
	}

	if (recoveryCode && !shouldCloseModal && recoveryCodeInput) {
		recoveryCodeInput.value = '';
		recoveryCodeInput.placeholder = 'Recovery code updated';
	}

	if (notify && typeof showToast === 'function') {
		showToast('Settings saved successfully!');
	}
	if (shouldCloseModal) {
		closeSettingsModal({ skipAutoSave: true });
	} else {
		setSettingsAutosaveStatus('Saved', 'saved');
	}

	// Broadcast Updates if enabled
	if (newSettings.broadcastUpdates) {
		console.log('Broadcast Updates enabled, triggering sync after settings change...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
}

// Reset Settings
function resetSettings() {
	if (confirm('Are you sure you want to reset all settings to default?')) {
		currentSettings = { ...DEFAULT_SETTINGS };
		localStorage.setItem('quizSettings', JSON.stringify(currentSettings));
		applySettings();
		openSettingsModal(); // Reload form
		showToast('Settings reset to defaults.');
	}
}

// Make globally available
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleSettingsSidebar = toggleSettingsSidebar;
window.saveSettingsForm = saveSettingsForm;
window.switchSettingsTab = switchSettingsTab;
window.switchUsersSettingsTab = switchUsersSettingsTab;
window.switchPresetSettingsTab = switchPresetSettingsTab;
window.resetSettings = resetSettings;
window.getAppSettings = () => currentSettings; // Helper for other files

// ── Storage repo shim for export/import/activity flows ─────────────────────
// Routes localStorage calls through the synchronous bridge so they traverse
// the repository layer (cache + API sync) rather than raw localStorage.
function __repo()   { return (window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) || null; }
function __get(entity, fallback) {
  var r = __repo(); var fb = arguments.length >= 2 ? fallback : (entity === 'settings' || entity === 'gamification' ? {} : []);
  if (!r) { try { return JSON.parse(localStorage.getItem(entity) || JSON.stringify(fb)); } catch(e) { return fb; } }
  if (entity === 'settings' || entity === 'gamification') { return r.getValue_sync ? r.getValue_sync(entity, fb) : r.getAll_sync(entity); }
  return r.getAll_sync(entity);
}
function __set(entity, data) {
  var r = __repo();
  if (!r) { try { localStorage.setItem(entity, JSON.stringify(data)); } catch(e) {} return; }
  if (entity === 'settings' || entity === 'gamification') { if (r.setValue_sync) r.setValue_sync(entity, data); else r.setAll_sync(entity, data); }
  else { r.setAll_sync(entity, data); }
}
// ────────────────────────────────────────────────────────────────────────────

// ==========================================
// IMPORT / EXPORT DATA FUNCTIONALITY
// ==========================================

/**
 * Exports all application data to a JSON file
 */
	/**
	 * Collects every application store for the backup payload. Reads all entity
	 * tables plus the extra admin stores the bootstrap keeps in localStorage, so
	 * "Export All Data" really exports ALL data.
	 */
	function collectAllStores() {
		const arrayStores = {
			users: 'quizUsers',
			classes: 'quizClasses',
			categories: 'quizCategories',
			questions: 'quizQuestions',
			exams: 'quizExams',
			results: 'quizResults',
			games: 'quizGames',
			tournaments: 'quizTournaments',
			exam_sessions: 'quizExamSessions',
			exam_questions: 'quizExamQuestions',
			exam_classes: 'quizExamClasses',
			game_sessions: 'quizGameSessions',
			tournament_entries: 'quizTournamentEntries',
			tournament_history: 'quizTournamentsHistory',
			game_presets: 'gamePresets',
			profile_requests: 'quizProfileRequests',
			account_requests: 'quizAccountRequests',
			notifications: 'adminNotifications',
			teacher_messages: 'teacherMessages',
			teacher_assignments: 'teacherAssignments',
		};
		const collected = {};
		// Entity tables go through the repository shim (server-backed).
		for (const [entity, lsKey] of Object.entries(arrayStores)) {
			try {
				if (entity === 'game_presets') {
					// game presets are stored as an object map, not an array
					collected[entity] = safeReadLS(lsKey, {});
				} else {
					collected[entity] = safeReadLS(lsKey, []);
				}
			} catch (e) {
				collected[entity] = [];
			}
		}
		// The repository shim already mirrors these through STORE_KEYS, but read
		// them through it anyway so exported values match what the app displays.
		collected.activity = __get('activity', []);
		try {
			collected.gamification = JSON.parse(
				localStorage.getItem('quizGamification') || '{}',
			);
		} catch (e) {
			collected.gamification = {};
		}
		try {
			collected.settings = __get('settings', {});
		} catch (e) {
			collected.settings = {};
		}
		return collected;
	}

	// Safe JSON read from localStorage with fallback (used by backups/imports).
	function safeReadLS(key, fallback) {
		try {
			const raw = localStorage.getItem(key);
			if (raw === null || raw === undefined) return fallback;
			const parsed = JSON.parse(raw);
			if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
			return parsed && typeof parsed === 'object' ? parsed : fallback;
		} catch (e) {
			return fallback;
		}
	}

	function exportAllData() {
		try {
			const timestamp = new Date().toISOString();
			const collected = collectAllStores();
			const exportData = {
				version: '2.0',
				timestamp: timestamp,
				type: 'quiz-app-backup',
				data: {
						...collected,
						// Legacy key kept so old imports and tooling keep working
						activityLog: collected.activity,
					},
			};

		const dataStr = JSON.stringify(exportData, null, 2);
		const dataUri =
			'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const fileName = `quiz-app-backup-${new Date()
			.toISOString()
			.slice(0, 10)}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', fileName);
		linkElement.click();

		showToast('Backup created successfully!');

		try {
			const author = 'Admin';
			const activity = {
				type: 'export',
				name: `Exported backup ${fileName}`,
				date: timestamp,
				author: author,
				isValid: true,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
				color: 'icon-rose',
			};
				const activities = __get('activity', []);
				activities.unshift(activity);
				__set('activity', activities);
			} catch (e) {
				console.warn('Could not record export activity:', e);
		}
	} catch (error) {
		console.error('Export failed:', error);
		showToast('Failed to export data: ' + error.message, 'error');
	}
}

/**
 * Imports application data from a JSON file
 * @param {HTMLInputElement} inputElement - The file input element
 */
function importAllData(inputElement) {
	const file = inputElement.files[0];
	if (!file) return;

	// Confirm with user before proceeding
	if (
		!confirm(
			'WARNING: This will replace ALL existing data (questions, exams, classes, etc.) with the data from the backup file.\n\nThis action cannot be undone.\n\nDo you want to proceed?',
		)
	) {
		inputElement.value = ''; // Reset input
		return;
	}

	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			const content = e.target.result;
			const parsedData = JSON.parse(content);

			// Basic validation
			if (
				!parsedData.type ||
				parsedData.type !== 'quiz-app-backup' ||
				!parsedData.data
			) {
				// Try to determine if it's a valid structure anyway (legacy or manual creation)
				if (!parsedData.questions && !parsedData.categories) {
					throw new Error('Invalid backup file format.');
				}
			}

			const data = parsedData.data || parsedData; // Handle both wrapped and unwrapped data

				// Update LocalStorage with imported data
				if (data.settings)
					__set('settings', data.settings);

				// Ensure imported questions have a dateCreated field so activity shows proper dates
				if (data.questions) {
					try {
						const processedQuestions = data.questions.map((q) => {
							const dateFrom =
								q.dateCreated || q.createdAt || q.date || q.created || null;
							return {
								...q,
								dateCreated: dateFrom || new Date().toISOString(),
							};
						});
						__set('questions', processedQuestions);
					} catch (e) {
						// Fallback to raw data if something goes wrong
						__set('questions', data.questions);
					}
				}

				if (data.categories)
					__set('categories', data.categories);
				if (data.exams)
					__set('exams', data.exams);
				if (data.classes)
					__set('classes', data.classes);

				// Full-backup stores (v2 backups): every entity table the app
				// keeps, restored only when present so legacy backups stay valid.
				if (data.users && Array.isArray(data.users))
					__set('users', data.users);
				if (data.games && Array.isArray(data.games))
					__set('games', data.games);
				if (data.tournaments && Array.isArray(data.tournaments))
					__set('tournaments', data.tournaments);
				if (data.exam_sessions && Array.isArray(data.exam_sessions))
					__set('exam_sessions', data.exam_sessions);
				if (data.exam_questions && Array.isArray(data.exam_questions))
					__set('exam_questions', data.exam_questions);
				if (data.exam_classes && Array.isArray(data.exam_classes))
					__set('exam_classes', data.exam_classes);
				if (data.game_sessions && Array.isArray(data.game_sessions))
					__set('game_sessions', data.game_sessions);
				if (data.tournament_entries && Array.isArray(data.tournament_entries))
					__set('tournament_entries', data.tournament_entries);
				if (data.tournament_history && Array.isArray(data.tournament_history))
					__set('tournament_history', data.tournament_history);
				if (data.profile_requests && Array.isArray(data.profile_requests))
					__set('profile_requests', data.profile_requests);
				if (data.account_requests && Array.isArray(data.account_requests))
					__set('account_requests', data.account_requests);
				if (data.notifications && Array.isArray(data.notifications))
					__set('notifications', data.notifications);
				if (data.teacher_messages && Array.isArray(data.teacher_messages))
					__set('teacher_messages', data.teacher_messages);
				if (data.teacher_assignments && Array.isArray(data.teacher_assignments))
					__set('teacher_assignments', data.teacher_assignments);
				if (data.gamification && typeof data.gamification === 'object')
					__set('gamification', data.gamification);
				if (data.game_presets && typeof data.game_presets === 'object')
					__set('game_presets', data.game_presets);

				if (data.results) {
					try {
						const processedResults = data.results.map((r) => {
							const dateFrom =
								r.dateTaken ||
								r.takenAt ||
								r.date ||
								r.createdAt ||
								r.created ||
								null;
							return {
								...r,
								dateTaken: dateFrom || new Date().toISOString(),
							};
						});
						__set('results', processedResults);
					} catch (e) {
						// Fallback to raw data if processing fails
						__set('results', data.results);
					}
				}
				if (data.activityLog)
					__set('activity', data.activityLog);

			showToast('Data imported successfully! Reloading...');

			try {
				const author = 'Admin';
				const timestampImport = new Date().toISOString();
				const qCount = data.questions ? data.questions.length : 0;
				const cCount = data.categories ? data.categories.length : 0;
				const eCount = data.exams ? data.exams.length : 0;
				const clCount = data.classes ? data.classes.length : 0;
				const rCount = data.results ? data.results.length : 0;

				const parts = [];
				if (qCount) parts.push(`${qCount} questions`);
				if (cCount) parts.push(`${cCount} categories`);
				if (eCount) parts.push(`${eCount} exams`);
				if (clCount) parts.push(`${clCount} classes`);
				if (rCount) parts.push(`${rCount} results`);

				const summary = parts.length
					? `Imported backup (${parts.join(', ')})`
					: 'Imported backup';

				const activity = {
					type: 'import',
					name: summary,
					date: timestampImport,
					author: author,
					isValid: true,
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
					color: 'icon-indigo',
				};

				const activities = __get('activity', []);
				activities.unshift(activity);
				__set('activity', activities);
			} catch (e) {
				console.warn('Could not record import activity:', e);
			}

			// Reload page to apply changes
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (error) {
			console.error('Import failed:', error);
			showToast('Failed to import data: ' + error.message, 'error');
			inputElement.value = ''; // Reset input
		}
	};

	reader.onerror = function () {
		showToast('Error reading file', 'error');
		inputElement.value = '';
	};

	reader.readAsText(file);
}

// Make globally available
window.exportAllData = exportAllData;
window.importAllData = importAllData;
window.safeReadLS = safeReadLS; // used by importDeviceData result mapping

/**
 * Imports device data from a JSON file (data downloaded from device)
 * Appends results to existing data instead of replacing
 * @param {HTMLInputElement} inputElement - The file input element
 */
function importDeviceData(inputElement) {
	const file = inputElement.files[0];
	if (!file) return;

	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			const content = e.target.result;
			const fileData = JSON.parse(content);

			// Per-store counters so the write guard and the summary are accurate
			let resultsImported = 0;
			let examsImported = 0;
			let questionsImported = 0;
			let classesImported = 0;
			let studentsImported = 0;
			let activityImported = 0;

			console.log('Importing device data:', fileData);

			// Extract the actual data from the wrapped structure
			const deviceData = fileData.data || fileData;

			// examActiveSession holds BOTH the legacy single-result shape
			// ({examId, studentInfo, results}) and the shared-device cumulative
			// list (completedResults[]) written after each submission.
			const examSession = deviceData.examActiveSession;

			// Normalize one raw session result (legacy or completedResults entry)
			// into the app's result shape.
			const mapSessionResult = (entry, fallbackKey) => {
				if (!entry) return null;
				// Legacy single-result shape keeps the root results object
				const res = entry.results || {};
				const info = entry.studentInfo || {};
				const rawId =
					entry.id ||
					`${entry.examId || 'exam'}-${info.numero || ''}-${entry.completedAt || ''}`;
				return {
					id: rawId || `imported-${Date.now()}`,
					examId: entry.examId,
					examName: entry.examName || 'Imported Exam',
					mode: entry.mode || 'exam',
					studentName: info.name || 'Unknown',
					studentNumber: info.numero || '',
					className: info.class || '',
					score: res.score ?? res.earnedPoints ?? 0,
					totalQuestions: res.totalQuestions ?? 0,
					answers: res.answers || [],
					timeSpent: res.timeSpent ?? 0,
					dateTaken: entry.completedAt || new Date().toISOString(),
					deviceId: fileData.deviceId || fallbackKey || 'imported',
					deviceName: fileData.deviceName || 'Unknown Device',
				};
			};

			const existingResults = __get('results', []);
			const pushUniqueResult = (candidate) => {
				if (!candidate || !candidate.examId) return;
				if (existingResults.some((r) => String(r.id) === String(candidate.id))) return;
				existingResults.push(candidate);
				resultsImported++;
			};

				// Handle examActiveSession — legacy single result
				if (examSession?.results) {
					pushUniqueResult(
						mapSessionResult(
							{
								...examSession,
								// legacy root shape has no id — synthesize one
								id: `${examSession.examId}-${fileData.deviceId || 'imported'}`,
							},
							'active-session',
						),
					);
				}

				// Handle examActiveSession.completedResults (shared-device list)
				if (Array.isArray(examSession?.completedResults)) {
					examSession.completedResults.forEach((entry) =>
						pushUniqueResult(mapSessionResult(entry, 'completed')),
					);
				}

				if (resultsImported > 0) {
					__set('results', existingResults);
				}

				// Handle quizResults array
				if (deviceData.quizResults && Array.isArray(deviceData.quizResults)) {
					deviceData.quizResults.forEach((result) => {
						if (
							!existingResults.some(
								(r) => String(r.id) === String(result.id),
							)
						) {
							// Result records come from the repo and use various field
							// spellings (user_id/userId, date_taken/date) depending on
							// which side wrote them. Keep the record as-is — it is
							// already the app's canonical shape — only stamp the
							// device provenance if missing.
							const stamped = { ...result };
							if (!stamped.deviceId && fileData.deviceId)
								stamped.deviceId = fileData.deviceId;
							if (!stamped.deviceName && fileData.deviceName)
								stamped.deviceName = fileData.deviceName;
							existingResults.push(stamped);
							resultsImported++;
						}
					});
					if (resultsImported > 0) {
						__set('results', existingResults);
					}
				}

				// Handle quizExams
				if (deviceData.quizExams && Array.isArray(deviceData.quizExams)) {
					const existingExams = __get('exams', []);
					deviceData.quizExams.forEach((exam) => {
						if (!existingExams.some((e) => String(e.id) === String(exam.id))) {
							existingExams.push(exam);
							examsImported++;
						}
					});
					if (examsImported > 0) {
						__set('exams', existingExams);
					}
				}

				// Handle quizQuestions
				if (deviceData.quizQuestions && Array.isArray(deviceData.quizQuestions)) {
					const existingQuestions = __get('questions', []);
					deviceData.quizQuestions.forEach((q) => {
						if (!existingQuestions.some((eq) => String(eq.id) === String(q.id))) {
							existingQuestions.push(q);
							questionsImported++;
						}
					});
					if (questionsImported > 0) {
						__set('questions', existingQuestions);
					}
				}

				// Handle quizClasses
				if (deviceData.quizClasses && Array.isArray(deviceData.quizClasses)) {
					const existingClasses = __get('classes', []);
					deviceData.quizClasses.forEach((cls) => {
						if (!existingClasses.some((ec) => String(ec.id) === String(cls.id))) {
							existingClasses.push(cls);
							classesImported++;
							studentsImported += cls.students?.length || 0;
						}
					});
					if (classesImported > 0) {
						__set('classes', existingClasses);
					}
				}

				// Handle quizActivity
				if (deviceData.quizActivity && Array.isArray(deviceData.quizActivity)) {
					const existingActivity = __get('activity', []);

					deviceData.quizActivity.forEach(activity => {
						// Filter out 'noisy' or redundant activities
						if (activity.type === 'quiz_started' || activity.type === 'answer_submitted' || activity.type === 'result') return;

						const activityDate = activity.date || activity.timestamp || '';
						const isDuplicate = existingActivity.some(a =>
							a.type === activity.type &&
							(a.date || a.timestamp || '') === activityDate &&
							a.studentNumber === activity.studentNumber &&
							a.name === activity.name
						);

						if (!isDuplicate) {
							// Add device context if missing from the import source if available
							if (!activity.deviceName && fileData.deviceName) activity.deviceName = fileData.deviceName;
							if (!activity.deviceIp && fileData.ip) activity.deviceIp = fileData.ip;
							existingActivity.unshift(activity);
							activityImported++;
						}
					});

					if (activityImported > 0) {
						existingActivity.sort((a, b) => {
							const dateA = new Date(a.date || a.timestamp || 0);
							const dateB = new Date(b.date || b.timestamp || 0);
							return dateB - dateA;
						});
						__set('activity', existingActivity.slice(0, 1000));
					}
				}

			// Summary
			const totalImported =
				resultsImported + examsImported + questionsImported + classesImported;
			if (totalImported > 0 || studentsImported > 0 || activityImported > 0) {
				const summary = [];
				if (resultsImported > 0) summary.push(`${resultsImported} result(s)`);
				if (examsImported > 0) summary.push(`${examsImported} exam(s)`);
				if (questionsImported > 0) summary.push(`${questionsImported} question(s)`);
				if (classesImported > 0) summary.push(`${classesImported} class(es)`);
				if (studentsImported > 0) summary.push(`${studentsImported} student(s)`);
				if (activityImported > 0) summary.push(`${activityImported} activities`);
				showToast(`✅ Imported: ${summary.join(', ')}`, 'success');

				// Refresh UIs
				if (window.loadResults) window.loadResults();
				if (typeof window.renderRecentActivity === 'function') window.renderRecentActivity();
				if (typeof window.updateExamList === 'function') window.updateExamList();
				if (typeof window.updateQuestionList === 'function') window.updateQuestionList();
				if (typeof window.updateClassList === 'function') window.updateClassList();
			} else {
				showToast('ℹ️ No new data to import', 'info');
			}

			inputElement.value = ''; // Reset input
		} catch (error) {
			console.error('Import device data failed:', error);
			showToast('❌ Failed to import: ' + error.message, 'error');
			inputElement.value = '';
		}
	};

	reader.onerror = function () {
		showToast('❌ Error reading file', 'error');
		inputElement.value = '';
	};

	reader.readAsText(file);
}

window.importDeviceData = importDeviceData;

/**
 * Refresh the "Training Preset" dropdown in General settings
 */
window.refreshTrainingPresetDropdown = function () {
	console.log('Refreshing training preset dropdown...');
	const trainingPresetSelect = document.getElementById(
		'setting-trainingPreset',
	);
	if (trainingPresetSelect && window.getAllPresets) {
		const presets = window.getAllPresets();
		const currentVal = trainingPresetSelect.value;
		
		// Re-read settings from storage to avoid using stale global variable if needed
		const latestSettings = JSON.parse(localStorage.getItem('quizSettings') || '{}');
		
		trainingPresetSelect.innerHTML =
			'<option value="">-- Use Default Settings --</option>';
		presets.forEach((preset) => {
			const option = document.createElement('option');
			option.value = preset.id;
			option.textContent = preset.name;
			trainingPresetSelect.appendChild(option);
		});
		
		console.log(`Dropdown refreshed with ${presets.length} presets.`);

		// Restore previous selection if still valid, otherwise use settings value
		if (currentVal && [...trainingPresetSelect.options].some(o => o.value === currentVal)) {
			trainingPresetSelect.value = currentVal;
		} else {
			trainingPresetSelect.value = latestSettings.trainingPresetId || '';
		}
	} else {
		console.warn('Cannot refresh preset dropdown: Select element or getAllPresets missing');
	}
};

// ─── Reset Data (Settings → Data tab) ────────────────────────────────────────
// Wipes the school back to first-setup state via POST /api/v1/admin/reset-data
// (admin-only), then clears the local mirrors so the page reload bootstraps a
// clean server state instead of re-uploading the cached rows.

const RESET_DATA_MIRROR_KEYS = [
	'quizUsers', 'quizClasses', 'quizCategories', 'quizQuestions', 'quizExams',
	'quizResults', 'quizGames', 'quizTournaments', 'quizTournamentsHistory',
	'quizExamSessions', 'quizExamQuestions', 'quizExamClasses', 'quizGameSessions',
	'quizTournamentEntries', 'quizAuditLogs', 'quizSettings', 'quizActivity',
	'quizGamification', 'quizProfileRequests', 'quizAccountRequests',
	'adminNotifications', 'teacherMessages', 'teacherAssignments',
	'gamePresets', 'gamePresetsInitialized', 'adminProfileRequests',
];

function openResetDataModal() {
	const modal = document.getElementById('resetDataModal');
	const input = document.getElementById('resetDataConfirmInput');
	if (!modal) return;
	if (input) input.value = '';
	updateResetDataButtonState();
	if (modal.parentElement && modal.parentElement !== document.body) {
		document.body.appendChild(modal);
	}
	modal.style.display = 'flex';
}

function closeResetDataModal() {
	const modal = document.getElementById('resetDataModal');
	if (modal) modal.style.display = 'none';
}

function updateResetDataButtonState() {
	const input = document.getElementById('resetDataConfirmInput');
	const btn = document.getElementById('resetDataConfirmBtn');
	if (!btn) return;
	const confirmed = String(input?.value || '').trim() === 'RESET';
	btn.disabled = !confirmed;
	btn.style.opacity = confirmed ? '1' : '0.5';
	btn.style.cursor = confirmed ? 'pointer' : 'not-allowed';
}

async function resetAllData() {
	const btn = document.getElementById('resetDataConfirmBtn');
	if (btn?.disabled) return;
	if (String(document.getElementById('resetDataConfirmInput')?.value || '').trim() !== 'RESET') return;

	const originalText = btn.textContent;
	btn.disabled = true;
	btn.textContent = 'Resetting…';
	try {
		const result = await window.API.raw('POST', '/admin/reset-data', {
			confirm: 'RESET',
		});
		if (!result || result.success === false) {
			throw new Error(result?.message || 'The server rejected the reset.');
		}

		showToast('Data reset complete. Reloading…', 'success');
		closeResetDataModal();

		// Drop every local mirror + wizard flag so the reload comes back as a
		// genuine first setup. Auth/session keys are untouched — the admin
		// stays logged in.
		RESET_DATA_MIRROR_KEYS.forEach((key) => {
			try { localStorage.removeItem(key); } catch (_) {}
		});
		try { localStorage.removeItem('quizSetupComplete'); } catch (_) {}
		try { localStorage.removeItem('quizQuickStartDismissedAt'); } catch (_) {}

		setTimeout(() => window.location.reload(), 800);
	} catch (err) {
		console.error('Reset failed:', err);
		showToast(`Reset failed: ${err?.message || 'server error'}`, 'error');
		btn.disabled = false;
		btn.textContent = originalText;
	}
}

window.openResetDataModal = openResetDataModal;
window.closeResetDataModal = closeResetDataModal;
window.updateResetDataButtonState = updateResetDataButtonState;
window.resetAllData = resetAllData;

// ─── Import AI-generated questions (Settings → Data tab) ─────────────────────
// Accepts the raw JSON output of an external model (ChatGPT/Claude), repairs
// it and turns the rows into real questions through the normal import path.

function importAIQuestions(inputElement) {
	const file = inputElement?.files?.[0];
	if (!file) return;
	const reader = new FileReader();

	reader.onload = (e) => {
		try {
			const rawText = String(e.target.result || '');
			let questions = null;

			try {
				const parsed = JSON.parse(rawText);
				if (Array.isArray(parsed)) questions = parsed;
				else if (Array.isArray(parsed?.questions)) questions = parsed.questions;
				else if (parsed && typeof parsed === 'object') questions = [parsed];
			} catch (_) {
				// Tolerant parse: pull out top-level {...} objects.
				const matches = rawText.match(/\{[\s\S]*?\}/g) || [];
				const candidates = matches
					.map((m) => { try { return JSON.parse(m); } catch (_) { return null; } })
					.filter((o) => o && (o.question || o.text));
				if (candidates.length) questions = candidates;
			}

			if (!questions || !questions.length) {
				showToast('No questions found in that file — expected the JSON structure from the copy-prompt step.', 'error');
				return;
			}

			const normalized = questions
				.map((q) => {
					try { return window.normalizeImportedAIQuestion ? window.normalizeImportedAIQuestion(q) : q; } catch (_) { return null; }
				})
				.filter(Boolean);

			if (!normalized.length) {
				showToast('The file contained rows, but none matched the question structure.', 'error');
				return;
			}

			const apply = confirm(
				`Import ${normalized.length} AI-generated question${normalized.length === 1 ? '' : 's'} into your Questions bank?`,
			);
			if (!apply) return;

			(async () => {
				let imported = 0;
				for (const question of normalized) {
					try {
						await window.API.create('questions', question);
						imported += 1;
					} catch (err) {
						console.warn('AI question import row failed:', err);
					}
				}
				showToast(`Imported ${imported}/${normalized.length} questions.`, imported ? 'success' : 'error');
				if (window.refreshQuestionsList) window.refreshQuestionsList();
				if (imported && window.updateQuickStartCounts) window.updateQuickStartCounts();
			})();
		} catch (err) {
			console.error('AI questions import failed:', err);
			showToast(`Import failed: ${err?.message || 'invalid file'}`, 'error');
		} finally {
			inputElement.value = '';
		}
	};

	reader.readAsText(file);
}

window.importAIQuestions = importAIQuestions;

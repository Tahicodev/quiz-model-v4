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
	adminSecret: '',
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
			data: true,
			realtime: true,
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

	const adminSecretInput = document.getElementById('setting-adminSecret');
	if (adminSecretInput) adminSecretInput.value = currentSettings.adminSecret || '';

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

	const safeTab = tabName === 'requests' ? 'requests' : 'management';

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
		adminSecret: document.getElementById('setting-adminSecret')
			? document.getElementById('setting-adminSecret').value.trim()
			: currentSettings.adminSecret || '',
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
	if (currentSettings.adminSecret) {
		localStorage.setItem('quizAdminSecret', currentSettings.adminSecret);
	} else {
		localStorage.removeItem('quizAdminSecret');
	}
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
function exportAllData() {
	try {
		const timestamp = new Date().toISOString();
		const exportData = {
			version: '1.0',
			timestamp: timestamp,
			type: 'quiz-app-backup',
			data: {
					settings: __get('settings', {}),
					questions: __get('questions', []),
					categories: __get('categories', []),
					exams: __get('exams', []),
					classes: __get('classes', []),
					results: __get('results', []),
					activityLog: __get('activity', []),
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

			let importedCount = 0;
			let importedStudents = 0;

			console.log('Importing device data:', fileData);

			// Extract the actual data from the wrapped structure
			const deviceData = fileData.data || fileData;
			const examSession =
				deviceData.examActiveSession || fileData.data?.examActiveSession;

				// Handle examActiveSession results
				if (examSession?.results) {
					const existingResults = __get('results', []);

					const newResult = {
						id:
							examSession.examId +
							'-' +
							(fileData.deviceId || 'imported-' + Date.now()),
						examId: examSession.examId,
						examName: examSession.examName,
						mode: examSession.mode || 'exam',
						studentName: examSession.studentInfo?.name || 'Unknown',
						studentNumber: examSession.studentInfo?.numero || '',
						className: examSession.studentInfo?.class || '',
						score: examSession.results.score || 0,
						totalQuestions: examSession.results.totalQuestions || 0,
						answers: examSession.results.answers || [],
						timeSpent: examSession.results.timeSpent || 0,
						dateTaken: examSession.completedAt || new Date().toISOString(),
						deviceId: fileData.deviceId || 'imported',
						deviceName: fileData.deviceName || 'Unknown Device',
					};

					if (!existingResults.some((r) => r.id === newResult.id)) {
						existingResults.push(newResult);
						__set('results', existingResults);
						importedCount++;
					}
				}

				// Handle quizResults array
				if (deviceData.quizResults && Array.isArray(deviceData.quizResults)) {
					const existingResults = __get('results', []);
					deviceData.quizResults.forEach((result) => {
						if (
							!existingResults.some(
								(r) => r.id === result.id && r.dateTaken === result.dateTaken,
							)
						) {
							existingResults.push(result);
							importedCount++;
						}
					});
					__set('results', existingResults);
				}

				// Handle quizExams
				if (deviceData.quizExams && Array.isArray(deviceData.quizExams)) {
					const existingExams = __get('exams', []);
					deviceData.quizExams.forEach((exam) => {
						if (!existingExams.some((e) => e.id === exam.id)) {
							existingExams.push(exam);
							importedCount++;
						}
					});
					if (importedCount > 0) {
						__set('exams', existingExams);
					}
				}

				// Handle quizQuestions
				if (deviceData.quizQuestions && Array.isArray(deviceData.quizQuestions)) {
					const existingQuestions = __get('questions', []);
					deviceData.quizQuestions.forEach((q) => {
						if (!existingQuestions.some((eq) => eq.id === q.id)) {
							existingQuestions.push(q);
							importedCount++;
						}
					});
					if (importedCount > 0) {
						__set('questions', existingQuestions);
					}
				}

				// Handle quizClasses
				if (deviceData.quizClasses && Array.isArray(deviceData.quizClasses)) {
					const existingClasses = __get('classes', []);
					deviceData.quizClasses.forEach((cls) => {
						if (!existingClasses.some((ec) => ec.id === cls.id)) {
							existingClasses.push(cls);
							importedStudents += cls.students?.length || 0;
						}
					});
					if (importedCount > 0) {
						__set('classes', existingClasses);
					}
				}

				// Handle quizActivity
				let activityImported = 0;
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
			if (importedCount > 0 || importedStudents > 0 || activityImported > 0) {
				const summary = [];
				if (importedCount > 0) summary.push(`${importedCount} result(s)`);
				if (importedStudents > 0) summary.push(`${importedStudents} student(s)`);
				if (activityImported > 0) summary.push(`${activityImported} activities`);
				showToast(`✅ Imported: ${summary.join(', ')}`, 'success');
				
				// Refresh UIs
				if (window.loadResults) window.loadResults();
				if (typeof window.renderRecentActivity === 'function') window.renderRecentActivity();
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

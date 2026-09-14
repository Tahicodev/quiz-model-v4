// Authentication & Role Management
// Handles user accounts, sessions, and role-based permissions

(function () {
	'use strict';

	const AUTH_STORAGE_KEY = 'quizUsers';
	const SESSION_STORAGE_KEY = 'quizSession';
	const SESSION_REMEMBER_KEY = 'quizSessionRemember';
	const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
	const PROFILE_REQUESTS_KEY = 'quizProfileRequests';
	const ACCOUNT_REQUESTS_KEY = 'quizAccountRequests';
	const PENDING_IMPORTS_KEY = 'quizPendingImports';
	const DEFAULT_RECOVERY_CODE = 'QuizAdminRecovery2024';
	const RECOVERY_UNLOCK_TTL_MS = 1000 * 60 * 15;

	const ROLE_ADMIN = 'admin';
	const ROLE_TEACHER = 'teacher';
	const ROLE_STUDENT = 'student';
	const USER_CLASS_GUEST_VALUE = '__guest__';
	const GUEST_CLASS_NAME = 'Guest';

	let currentUser = null;
	let currentSession = null;
	let selectedUserIds = new Set();
	let recoveryUnlockedUntil = 0;
	// Server-issued recovery ticket (JWT, 15 min). When present it replaces the
	// client-side timestamp gate — the reset then goes through the server and
	// works from any device, not just this browser's localStorage.
	let recoveryTicket = null;

	function safeJsonParse(value, fallback) {
		try {
			return value ? JSON.parse(value) : fallback;
		} catch (e) {
			return fallback;
		}
	}

	function getUsers() {
		return safeJsonParse(localStorage.getItem(AUTH_STORAGE_KEY), []);
	}

	function saveUsers(users) {
		localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
	}

	function getUsersForSync(options = {}) {
		const includeAdmins = options.includeAdmins === true;
		const roleFilter = options.role ? String(options.role).toLowerCase() : '';
		const allowedClassIds = Array.isArray(options.classIds)
			? options.classIds.map((id) => String(id))
			: null;
		const users = getUsers();
		return users
			.filter((user) => includeAdmins || user.role !== ROLE_ADMIN)
			.filter((user) => {
				if (!roleFilter) return true;
				return String(user.role || '').toLowerCase() === roleFilter;
			})
			.filter((user) => {
				if (!allowedClassIds || allowedClassIds.length === 0) return true;
				return user.classId && allowedClassIds.includes(String(user.classId));
			})
			.map((user) => ({
				id: user.id,
				name: user.name,
				username: user.username,
				role: user.role,
				status: user.status,
				avatar: user.avatar || '',
				classIds: Array.isArray(user.classIds) ? user.classIds : [],
				studentNumber: user.studentNumber || '',
				classId: user.classId || '',
				className: user.className || '',
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			}));
	}

	function applySyncedUsers(users) {
		if (!Array.isArray(users)) return false;
		const sanitized = users
			.filter(
				(user) =>
					user &&
					user.id &&
					user.username &&
					String(user.role || '').toLowerCase() !== ROLE_ADMIN,
			)
			.map((user) => normalizeUser(user));
		const existing = getUsers();
		const adminUsers = existing.filter(
			(user) => String(user.role || '').toLowerCase() === ROLE_ADMIN,
		);
		const mergedMap = new Map();
		adminUsers.forEach((user) => {
			mergedMap.set(user.id, user);
		});
		sanitized.forEach((user) => {
			mergedMap.set(user.id, user);
		});
		saveUsers(Array.from(mergedMap.values()));

		if (typeof checkAuthState === 'function') {
			checkAuthState();
		}
		if (typeof checkStudentAuthState === 'function') {
			checkStudentAuthState();
		}

		return true;
	}

	function normalizeUser(user) {
		const now = new Date().toISOString();
		// Never fall back to Date.now() — the backend sanitizer drops non-UUID
		// ids so the row becomes invisible on reload. crypto.randomUUID covers
		// every modern browser; generateUUID is the project-wide helper.
		const genId = () => {
			if (typeof generateUUID === 'function') return generateUUID();
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
			// Ancient-browser fallback: RFC-4122 uuid v4 pattern via Math.random.
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
				const r = (Math.random() * 16) | 0;
				return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
			});
		};
		return {
			id: user.id || genId(),
			name: (user.name || '').trim(),
			username: (user.username || user.email || '').trim(),
			role: user.role || ROLE_STUDENT,
			status: user.status || 'active',
			passwordHash: user.passwordHash || '',
			avatar: user.avatar || user.profileImage || '',
			classIds: Array.isArray(user.classIds) ? user.classIds : [],
			studentNumber: user.studentNumber || user.numero || '',
			classId: user.classId || '',
			className: user.className || '',
			// Teacher/staff contacts (kept in the local cache so the user modal
			// can pre-fill them between bootstraps).
			email: user.email || '',
			phone: user.phone || '',
			subjects: Array.isArray(user.subjects)
				? user.subjects
				: [],
			createdAt: user.createdAt || now,
			updatedAt: now,
		};
	}

	function getNormalizedUserRole(user) {
		return String(user?.role || '')
			.trim()
			.toLowerCase();
	}

	function isStudentLikeUser(user) {
		if (!user) return false;
		const role = getNormalizedUserRole(user);
		return (
			!role ||
			role === ROLE_STUDENT ||
			role === 'learner' ||
			role === 'participant'
		);
	}

	function getEffectiveUserRole(user) {
		if (isStudentLikeUser(user)) return ROLE_STUDENT;
		return getNormalizedUserRole(user);
	}

	function simpleHash(value) {
		let hash = 0;
		for (let i = 0; i < value.length; i++) {
			hash = (hash << 5) - hash + value.charCodeAt(i);
			hash |= 0;
		}
		return `simple-${hash}`;
	}

	async function hashPassword(password) {
		const text = String(password || '');
		try {
			if (window.crypto && window.crypto.subtle) {
				const data = new TextEncoder().encode(text);
				const digest = await window.crypto.subtle.digest('SHA-256', data);
				return Array.from(new Uint8Array(digest))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			}
		} catch (e) {
			// Fallback below
		}
		return simpleHash(text);
	}

	async function verifyRecoveryCodeValue(code) {
		const entered = String(code || '').trim();
		if (!entered) return false;
		const enteredHash = await hashPassword(entered);
		const settings = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('settings')), {});
		const savedHash = String(settings.recoveryCodeHash || '').trim();
		const defaultHash = await hashPassword(DEFAULT_RECOVERY_CODE);
		if (savedHash && enteredHash === savedHash) return true;
		return enteredHash === defaultHash;
	}

	function setRecoveryStatus(message, type = 'info') {
		const status = document.getElementById('authRecoveryStatus');
		if (status) {
			status.textContent = message || '';
			status.className = `auth-recovery-status ${type}`;
		}
		if (message && typeof showToast === 'function') {
			showToast(message, type === 'error' ? 'error' : type);
		}
	}

	function setRecoveryPanelMode(mode) {
		const unlockPanel = document.getElementById('authRecoveryUnlock');
		const resetPanel = document.getElementById('authRecoveryReset');
		const recoveryToggle = document.getElementById('authRecoveryToggle');
		const isExpanded = mode === 'open' || mode === 'reset';
		if (recoveryToggle) {
			recoveryToggle.setAttribute('aria-expanded', String(isExpanded));
			recoveryToggle.classList.toggle('is-open', isExpanded);
		}
		if (unlockPanel) {
			unlockPanel.style.setProperty(
				'display',
				mode === 'open' ? 'block' : 'none',
				'important',
			);
		}
		if (resetPanel) {
			resetPanel.style.setProperty(
				'display',
				mode === 'reset' && Date.now() < recoveryUnlockedUntil
					? 'block'
					: 'none',
				'important',
			);
		}
		if (mode === 'open') {
			requestAnimationFrame(() => {
				unlockPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				document.getElementById('authRecoveryCode')?.focus({ preventScroll: true });
			});
		}
		if (mode === 'reset') {
			requestAnimationFrame(() => {
				resetPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				document.getElementById('authRecoveryUsername')?.focus({ preventScroll: true });
			});
		}
	}

	function toggleRecoveryPanel() {
		const unlockPanel = document.getElementById('authRecoveryUnlock');
		const isOpen = unlockPanel && unlockPanel.style.display !== 'none';
		setRecoveryPanelMode(isOpen ? 'closed' : 'open');
	}

	async function verifyRecoveryCodeFromForm(formEl) {
		const code = formEl?.querySelector('[data-recovery="code"]')?.value || '';
		if (!code || !String(code).trim()) {
			recoveryUnlockedUntil = 0;
			recoveryTicket = null;
			setRecoveryPanelMode('open');
			setRecoveryStatus('Enter your recovery code.', 'error');
			return;
		}

		// Server-side verification first (bcrypt against the school's
		// system.recovery_code_hash). The raw code never leaves the browser in
		// the fallback path either — only here, to the verify endpoint.
		if (window.API && typeof window.API.raw === 'function') {
			try {
				const result = await window.API.raw('POST', '/auth/recover/verify', {
					code: String(code).trim(),
				});
				if (result && result.ticket) {
					recoveryTicket = result.ticket;
					recoveryUnlockedUntil =
						Date.now() + (result.expiresInMinutes || 15) * 60 * 1000;
					setRecoveryPanelMode('reset');
					setRecoveryStatus(
						'Recovery verified. You can reset the admin password for 15 minutes.',
						'success',
					);
					return;
				}
			} catch (err) {
				// Distinguish "code wrong/unset" from "server unreachable": a
				// 401/403/422 means the server answered and rejected the code —
				// surface that and stop. Network-level failures fall through to
				// the legacy local verification.
				const status = err && err.status;
				if (status) {
					recoveryUnlockedUntil = 0;
					recoveryTicket = null;
					setRecoveryPanelMode('open');
					setRecoveryStatus(
						err?.message || 'Recovery code is incorrect',
						'error',
					);
					return;
				}
				console.warn('[auth] server recovery verify unreachable — falling back to local', err);
			}
		}

		// Legacy local fallback (offline / server down): hash-compare against
		// the localStorage settings blob or the factory default code.
		const ok = await verifyRecoveryCodeValue(code);
		if (!ok) {
			recoveryUnlockedUntil = 0;
			recoveryTicket = null;
			setRecoveryPanelMode('open');
			setRecoveryStatus('Recovery code is incorrect', 'error');
			return;
		}
		recoveryTicket = null;
		recoveryUnlockedUntil = Date.now() + RECOVERY_UNLOCK_TTL_MS;
		setRecoveryPanelMode('reset');
		setRecoveryStatus('Recovery verified. You can reset the dashboard password for 15 minutes.', 'success');
	}

	async function resetDashboardPasswordFromForm(formEl) {
		const unlocked = recoveryTicket || Date.now() < recoveryUnlockedUntil;
		if (!unlocked) {
			setRecoveryPanelMode('open');
			setRecoveryStatus('Recovery verification expired. Verify the code again.', 'error');
			return;
		}
		const username = String(
			formEl?.querySelector('[data-recovery="username"]')?.value || '',
		).trim();
		const password = String(
			formEl?.querySelector('[data-recovery="password"]')?.value || '',
		);
		if (!username || password.length < 6) {
			setRecoveryStatus('Enter a username and a password with at least 6 characters.', 'error');
			return;
		}

		// Server-side reset when we hold a server ticket — updates the real DB
		// and revokes every refresh token (assumed-compromised account).
		if (recoveryTicket && window.API && typeof window.API.raw === 'function') {
			try {
				await window.API.raw('POST', '/auth/recover/reset', {
					ticket: recoveryTicket,
					username,
					newPassword: password,
				});
				recoveryTicket = null;
				recoveryUnlockedUntil = 0;
				setRecoveryPanelMode('closed');
				if (formEl) formEl.reset();
				setRecoveryStatus('Admin password reset. Sign in with the new password.', 'success');
				return;
			} catch (err) {
				const status = err && err.status;
				if (status) {
					// 401 = ticket expired/rejected → back to code entry.
					if (status === 401) {
						recoveryTicket = null;
						recoveryUnlockedUntil = 0;
						setRecoveryPanelMode('open');
					}
					setRecoveryStatus(
						err?.message || 'Password reset failed',
						'error',
					);
					return;
				}
				console.warn('[auth] server recovery reset unreachable — falling back to local', err);
			}
		}

		// Legacy localStorage-only fallback (offline).
		const users = await ensureDefaultAdmin();
		let user = findUserByUsername(users, username);
		if (!user) {
			user =
				users.find((entry) => String(entry.role || '').toLowerCase() === ROLE_ADMIN) ||
				normalizeUser({
					name: 'Administrator',
					username,
					role: ROLE_ADMIN,
					status: 'active',
				});
			if (!users.includes(user)) users.push(user);
		}
		user.username = username;
		user.role = user.role || ROLE_ADMIN;
		user.status = 'active';
		user.passwordHash = await hashPassword(password);
		user.updatedAt = new Date().toISOString();
		saveUsers(users);
		clearStoredSession();
		sessionStorage.removeItem('adminLoggedIn');
		recoveryUnlockedUntil = 0;
		setRecoveryPanelMode('closed');
		if (formEl) formEl.reset();
		setRecoveryStatus('Dashboard password reset. Sign in with the new password.', 'success');
	}

	function findUserByUsername(users, username) {
		const normalized = String(username || '')
			.trim()
			.toLowerCase();
		if (!normalized) return null;
		return users.find(
			(u) =>
				String(u.username || '')
					.trim()
					.toLowerCase() === normalized ||
				String(u.email || '')
					.trim()
					.toLowerCase() === normalized ||
				String(u.studentNumber || '')
					.trim()
					.toLowerCase() === normalized,
		);
	}

	function getUserById(users, id) {
		return users.find((u) => u.id === id);
	}

	async function ensureDefaultAdmin() {
		const users = getUsers();
		const hasAdmin = users.some((u) => u.role === ROLE_ADMIN);
		if (users.length > 0 && hasAdmin) {
			let changed = false;
			for (const user of users) {
				if (user.role !== ROLE_ADMIN) continue;
				if (!String(user.username || '').trim()) {
					user.username = 'admin';
					changed = true;
				}
				if (!String(user.passwordHash || '').trim()) {
					user.passwordHash = await hashPassword('admin123');
					user.updatedAt = new Date().toISOString();
					changed = true;
				}
			}
			if (changed) saveUsers(users);
			return users;
		}

		const admin = normalizeUser({
			name: 'Administrator',
			username: 'admin',
			role: ROLE_ADMIN,
			status: 'active',
		});

		admin.passwordHash = await hashPassword('admin123');
		admin.createdAt = new Date().toISOString();
		admin.updatedAt = admin.createdAt;

		users.push(admin);
		saveUsers(users);
		return users;
	}

	function buildSession(user, remember) {
		const now = Date.now();
		return {
			userId: user.id,
			role: user.role,
			issuedAt: now,
			expiresAt: now + SESSION_TTL_MS,
			remember: Boolean(remember),
		};
	}

	function persistSession(session) {
		sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
		if (session.remember) {
			localStorage.setItem(SESSION_REMEMBER_KEY, JSON.stringify(session));
		} else {
			localStorage.removeItem(SESSION_REMEMBER_KEY);
		}
	}

	function clearStoredSession() {
		sessionStorage.removeItem(SESSION_STORAGE_KEY);
		localStorage.removeItem(SESSION_REMEMBER_KEY);
		// Also drop the role-scoped copies so a logout leaves no stale
		// identity for either portal to rehydrate from.
		['admin', 'teacher', 'student', 'super_admin', 'user'].forEach((role) => {
			localStorage.removeItem(`${SESSION_STORAGE_KEY}:${role}`);
		});
	}

	function loadSession(allowedRoles, options = {}) {
		const onWrongRole = typeof options.onWrongRole === 'function'
			? options.onWrongRole
			: null;
		const raw =
			sessionStorage.getItem(SESSION_STORAGE_KEY) ||
			localStorage.getItem(SESSION_REMEMBER_KEY);
		const session = safeJsonParse(raw, null);
		if (!session) return null;

		if (session.expiresAt && Date.now() > session.expiresAt) {
			clearStoredSession();
			return null;
		}

		const users = getUsers();
		const user = getUserById(users, session.userId);
		if (!user || user.status === 'disabled') {
			clearStoredSession();
			return null;
		}

		if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
			const role = getEffectiveUserRole(user);
			if (!allowedRoles.includes(role)) {
				// This tab holds no session of its own. Before giving up, try
				// the role-scoped copy for the roles this page allows — the
				// shared keys may be owned by the OTHER portal's tab in this
				// same browser (admin + student workspace open together).
				const scopedSession = loadScopedSession(allowedRoles, users);
				if (scopedSession) return scopedSession;
				// No portal-owned session exists: the sessionStorage copy holds
				// ANOTHER portal's identity (this tab was reused across
				// portals). Drop it so it can never leak into this page or
				// resurface after a reload — each portal adopts only its own
				// role; the user re-logs in cleanly. Report the rejected role
				// so the caller (e.g. the admin portal) can bounce the
				// student to their own surface instead of showing a login
				// modal over exposed chrome.
				if (sessionStorage.getItem(SESSION_STORAGE_KEY)) {
					sessionStorage.removeItem(SESSION_STORAGE_KEY);
				}
				if (onWrongRole) onWrongRole(role);
				return null;
			}
		}

		return { session, user };
	}

	// Role-scoped fallback: quizSession:<role> keys are written at login so
	// each portal keeps its own identity even when a different portal's tab
	// logged in last in this browser. The scoped session still has to pass
	// the same user/expiry/role validation as the primary one.
	function loadScopedSession(allowedRoles, users) {
		for (const role of allowedRoles) {
			const raw = localStorage.getItem(`${SESSION_STORAGE_KEY}:${role}`);
			const session = safeJsonParse(raw, null);
			if (!session) continue;
			if (session.expiresAt && Date.now() > session.expiresAt) {
				localStorage.removeItem(`${SESSION_STORAGE_KEY}:${role}`);
				continue;
			}
			const user = getUserById(users, session.userId);
			if (!user || user.status === 'disabled') continue;
			if (!allowedRoles.includes(getEffectiveUserRole(user))) continue;
			// Adopt it as THIS tab's session so the workspace owns it.
			sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
			return { session, user };
		}
		return null;
	}

	function setCurrentUser(user, session) {
		currentUser = user;
		currentSession = session;
		window.currentUser = user;
		window.currentSession = session;
		if (isStudentLikeUser(user)) {
			const identity = getStudentIdentity(user);
			if (identity) {
				sessionStorage.setItem('studentInfo', JSON.stringify(identity));
			}
		} else {
			sessionStorage.removeItem('studentInfo');
		}
	}

	function notifyAuthChange() {
		window.dispatchEvent(
			new CustomEvent('auth:changed', { detail: { user: currentUser } }),
		);
		if (typeof window.applyStudentAuth === 'function') {
			window.applyStudentAuth(currentUser);
		}
		if (
			currentUser?.role === ROLE_ADMIN &&
			typeof window.syncUsersToClients === 'function'
		) {
			setTimeout(() => window.syncUsersToClients(), 500);
		}
	}

	function getCurrentUser() {
		return currentUser;
	}

	function getCurrentRole() {
		return currentUser ? currentUser.role : null;
	}

	function isAdmin() {
		return getCurrentRole() === ROLE_ADMIN;
	}

	function isTeacher() {
		return getCurrentRole() === ROLE_TEACHER;
	}

	function isStudent() {
		return isStudentLikeUser(currentUser);
	}

	// Teacher → class assignments persisted server-side in the settings table
	// (key "teacherClassAssignments": { userId: [classId, ...] }). The local
	// mirror is written by saveUserForm and refreshed by bootstrap.
	function getTeacherClassAssignments() {
		try {
			const raw = localStorage.getItem('quizTeacherClassAssignments');
			const parsed = raw ? JSON.parse(raw) : {};
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (e) {
			return {};
		}
	}

	function getTeacherClassIds(user = currentUser) {
		const own = Array.isArray(user?.classIds) ? user.classIds : [];
		if (own.length > 0) return own;
		// Fallback: the local assignments mirror (survives reloads even when
		// the users row lost its classIds during a sync round trip).
		const mirrored = getTeacherClassAssignments()[user?.id || ''];
		return Array.isArray(mirrored) ? mirrored : [];
	}

	function getAccessibleClasses() {
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		if (isTeacher()) {
			const teacherClassIds = getTeacherClassIds();
			return classes.filter((cls) => teacherClassIds.includes(cls.id));
		}
		return classes;
	}

	function findGuestClass(classes = []) {
		return classes.find(
			(cls) =>
				String(cls.name || '')
					.trim()
					.toLowerCase() === 'guest',
		);
	}

	function createGuestClass(ownerId) {
		return {
			id: typeof generateUUID === 'function' ? generateUUID() : `${Date.now()}`,
			name: GUEST_CLASS_NAME,
			ownerId: ownerId || '',
			dateCreated: new Date().toISOString(),
			students: [],
		};
	}

	function ensureGuestClass(classes, ownerId) {
		let guest = findGuestClass(classes);
		if (!guest) {
			guest = createGuestClass(ownerId);
			classes.push(guest);
		}
		if (!Array.isArray(guest.students)) guest.students = [];
		return guest;
	}

	function canManageUser(target) {
		if (!target) return false;
		if (isAdmin()) return true;
		if (isTeacher()) {
			if (!isStudentLikeUser(target)) return false;
			const classIds = getTeacherClassIds();
			return classIds.includes(target.classId);
		}
		return false;
	}

	function getStudentIdentity(user = currentUser) {
		if (!user) return null;
		if (!isStudentLikeUser(user)) return null;

		let className = user.className;
		if (!className && user.classId) {
			const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
			const match = classes.find((c) => c.id === user.classId);
			if (match) className = match.name;
		}

		return {
			numero: user.studentNumber || '',
			name: user.name || '',
			class: className || '',
			classId: user.classId || '',
			avatar: user.avatar || '',
		};
	}

	const DEFAULT_TEACHER_ACCESS = {
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
			// Data and Realtime manage school-wide datasets and the LAN server —
			// admin-only by default now (markup gates them with data-roles="admin").
			data: false,
			realtime: false,
			'ai-generation': true,
			users: true,
		},
	};

	function getTeacherAccessSettings() {
		const settings = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('settings')), {});
		const stored = settings.teacherAccess || {};
		return {
			tabs: { ...DEFAULT_TEACHER_ACCESS.tabs, ...(stored.tabs || {}) },
			settings:
				stored.settings === undefined
					? DEFAULT_TEACHER_ACCESS.settings
					: stored.settings,
			settingsTabs: {
				...DEFAULT_TEACHER_ACCESS.settingsTabs,
				...(stored.settingsTabs || {}),
			},
		};
	}

	function canAccessItem(type, item) {
		if (!currentUser || !item) return false;
		if (isAdmin()) return true;

		if (isTeacher()) {
			if (type === 'category') {
				return item.id === 'uncategorized' || item.ownerId === currentUser.id;
			}
			if (type === 'question' || type === 'exam') {
				return item.ownerId === currentUser.id;
			}
			if (type === 'class') {
				const classIds = getTeacherClassIds();
				return classIds.includes(item.id) || item.ownerId === currentUser.id;
			}
			if (type === 'result') {
				const classIds = getTeacherClassIds();
				if (!classIds.length) return false;
				const classId = item.classId || '';
				if (classId && classIds.includes(classId)) return true;

				const className = item.class || item.className || '';
				if (!className) return false;
				const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
				const match = classes.find((c) => c.name === className);
				return Boolean(match && classIds.includes(match.id));
			}
		}

		if (isStudent()) {
			if (type === 'result') {
				const identity = getStudentIdentity();
				if (!identity) return false;
				return (
					String(item.numero || item.studentNumber || '') ===
						String(identity.numero) &&
					String(item.class || item.className || '') === String(identity.class)
				);
			}
		}

		return false;
	}

	function filterItemsByRole(type, items = []) {
		if (!Array.isArray(items)) return [];
		if (isAdmin()) return items;
		return items.filter((item) => canAccessItem(type, item));
	}

	function ensureOwnershipDefaults() {
		if (!currentUser || currentUser.role !== ROLE_ADMIN) return;
		const keys = [
			'quizQuestions',
			'quizCategories',
			'quizExams',
			'quizClasses',
		];
		keys.forEach((key) => {
			const items = safeJsonParse(localStorage.getItem(key), []);
			let changed = false;
			items.forEach((item) => {
				if (item && !item.ownerId) {
					item.ownerId = currentUser.id;
					changed = true;
				}
			});
			if (changed) {
				localStorage.setItem(key, JSON.stringify(items));
			}
		});
	}

	function applyRoleVisibility() {
		if (!currentUser) return;
		document.body.setAttribute('data-role', currentUser.role);

		document.querySelectorAll('[data-roles]').forEach((el) => {
			const allowed = String(el.dataset.roles || '')
				.split(',')
				.map((r) => r.trim())
				.filter(Boolean);
			if (allowed.length === 0 || allowed.includes(currentUser.role)) {
				el.classList.remove('role-hidden');
			} else {
				el.classList.add('role-hidden');
			}
		});
	}

	function canAccessTab(tabName) {
		if (isAdmin()) return true;
		if (isTeacher()) {
			const access = getTeacherAccessSettings();
			if (tabName === 'settings') {
				return access.settings !== false;
			}
			if (access.tabs && access.tabs[tabName] === false) {
				return false;
			}
		}
		const btn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
		const section = document.getElementById(tabName);

		const rolesSource = btn?.dataset?.roles || section?.dataset?.roles || '';
		const roles = String(rolesSource)
			.split(',')
			.map((r) => r.trim())
			.filter(Boolean);

		if (!roles.length) return true;
		return roles.includes(currentUser?.role);
	}

	// Settings-section guard (mirror of canAccessTab for .settings-section).
	// Some sections are school-wide admin concerns (teacher access control,
	// data backup/import, LAN realtime server) and must never open for a
	// teacher even if a stale teacherAccess settings value says otherwise.
	// The rest honor the admin-configurable teacherAccess.settingsTabs map.
	function canAccessSettingsTab(tabName) {
		if (isAdmin()) return true;
		if (isTeacher()) {
			if (
				tabName === 'teacher-access' ||
				tabName === 'data' ||
				tabName === 'realtime'
			) {
				return false;
			}
			const access = getTeacherAccessSettings();
			if (access.settings === false) return false;
			if (access.settingsTabs && access.settingsTabs[tabName] === false) {
				return false;
			}
			const section = document.getElementById(`${tabName}-settings`);
			const rolesSource = section?.dataset?.roles || '';
			const roles = String(rolesSource)
				.split(',')
				.map((r) => r.trim())
				.filter(Boolean);
			if (roles.length) return roles.includes(currentUser?.role);
			return true;
		}
		return false;
	}

	function applyTeacherAccess() {
		if (!isTeacher()) return;
		const access = getTeacherAccessSettings();

		document.querySelectorAll('.nav-tab[data-tab]').forEach((btn) => {
			const tab = btn.dataset.tab;
			if (!tab) return;
			if (access.tabs && access.tabs[tab] === false) {
				btn.classList.add('role-hidden');
			} else {
				btn.classList.remove('role-hidden');
			}
		});

		document.querySelectorAll('.tab-content[id]').forEach((section) => {
			const tab = section.id;
			if (!tab) return;
			if (access.tabs && access.tabs[tab] === false) {
				section.classList.add('role-hidden');
			} else {
				section.classList.remove('role-hidden');
			}
		});

		const settingsLink = document.querySelector('[data-permission="settings"]');
		if (settingsLink) {
			if (access.settings === false) {
				settingsLink.classList.add('role-hidden');
			} else {
				settingsLink.classList.remove('role-hidden');
			}
		}

		document
			.querySelectorAll('.settings-tab-btn[data-settings-tab]')
			.forEach((btn) => {
				const key = btn.dataset.settingsTab;
				if (!key) return;
				// Admin-only sections must stay hidden for teachers regardless of
				// the settingsTabs map (which never lists them).
				if (key === 'teacher-access' || key === 'data' || key === 'realtime') {
					btn.classList.add('role-hidden');
					return;
				}
				if (access.settingsTabs && access.settingsTabs[key] === false) {
					btn.classList.add('role-hidden');
				} else {
					btn.classList.remove('role-hidden');
				}
			});

		document
			.querySelectorAll('.settings-section[data-settings-tab]')
			.forEach((section) => {
				const key = section.dataset.settingsTab;
				if (!key) return;
				// Same admin-only protection for the section panels themselves.
				if (key === 'teacher-access' || key === 'data' || key === 'realtime') {
					section.classList.add('role-hidden');
					return;
				}
				if (access.settingsTabs && access.settingsTabs[key] === false) {
					section.classList.add('role-hidden');
				} else {
					section.classList.remove('role-hidden');
				}
			});
	}

	// ── School branding ───────────────────────────────────────────────────────
	// Pulls the school's name + logo from the public profile endpoint and swaps
	// the header branding (SVG placeholder → logo image, title → school name).
	// Cached per session; refreshed live via the school:profile-updated socket
	// event (see realtime-admin.js).
	var schoolBrandingCache = { loaded: false, profile: null };

	function applySchoolBranding() {
		var titleEl = document.getElementById('dashboardTitle');
		var logoBox = document.querySelector('.header-branding .brand-logo');
		if (!titleEl && !logoBox) return;

		var apply = function (profile) {
			if (!profile) return;
			var isTeacher = currentUser && currentUser.role === ROLE_TEACHER;
			if (titleEl && profile.name) {
				titleEl.textContent = isTeacher
					? profile.name + ' — Teachers'
					: profile.name;
			}
			if (logoBox && profile.logo_url) {
				logoBox.innerHTML =
					'<img src="' + profile.logo_url + '" alt="School logo" style="width:100%;height:100%;object-fit:contain;border-radius:50%;" />';
			}
		};

		if (schoolBrandingCache.loaded) {
			apply(schoolBrandingCache.profile);
			return;
		}

		// The full profile needs auth; fall back to the public subset
		// (name/type/city/logo) which is enough for branding.
		var finish = function (profile) {
			schoolBrandingCache.loaded = true;
			schoolBrandingCache.profile = profile || {};
			apply(schoolBrandingCache.profile);
		};
		if (window.API && typeof window.API.raw === 'function') {
			window.API
				.raw('GET', '/school/profile')
				.then(finish)
				.catch(function () {
					finish(null);
				});
		}
	}

	// Live refresh hook for the realtime handler.
	function refreshSchoolBranding() {
		schoolBrandingCache.loaded = false;
		applySchoolBranding();
	}

	function applyRolePermissions() {
		if (!currentUser) return;
		applyRoleVisibility();
		applyTeacherAccess();

		const nameEl = document.getElementById('currentUserName');
		if (nameEl) {
			nameEl.textContent = currentUser.name || currentUser.username || 'User';
		}

		const emailEl = document.getElementById('currentUserEmail');
		if (emailEl) {
			emailEl.textContent = currentUser.username || 'user';
		}

		const avatarEl = document.querySelector('.avatar-circle');
		if (avatarEl) {
			const label = currentUser.name || currentUser.username || 'U';
			avatarEl.textContent = label.trim().charAt(0).toUpperCase();
		}

		const greetingEl = document.getElementById('dashboardGreeting');
		if (greetingEl) {
			const label = currentUser.name || currentUser.username || 'User';
			greetingEl.textContent = `Welcome back, ${label}`;
		}

		const titleEl = document.getElementById('dashboardTitle');
		if (titleEl) {
			titleEl.textContent =
				currentUser.role === ROLE_TEACHER
					? 'Teacher Dashboard'
					: 'Admin Dashboard';
		}

		applySchoolBranding();

		const navButtons = Array.from(document.querySelectorAll('.nav-tab'));
		const allowedButtons = navButtons.filter((btn) => {
			const tabName = btn.dataset.tab || '';
			return tabName ? canAccessTab(tabName) : true;
		});

		const activeTab = document.querySelector('.tab-content.active');
		const activeTabId = activeTab ? activeTab.id : null;
		if (activeTabId && !canAccessTab(activeTabId)) {
			if (allowedButtons.length > 0 && typeof openTab === 'function') {
				openTab(null, allowedButtons[0].dataset.tab);
				allowedButtons[0].classList.add('active');
			}
		}
	}

	async function handleLogin(formEl, allowedRole) {
		const usernameInput = formEl.querySelector('[data-auth="username"]');
		const passwordInput = formEl.querySelector('[data-auth="password"]');
		const rememberInput = formEl.querySelector('[data-auth="remember"]');

		const username = usernameInput ? usernameInput.value.trim() : '';
		const password = passwordInput ? passwordInput.value : '';
		const remember = rememberInput ? rememberInput.checked : false;

		if (!username || !password) {
			showToast('Please enter your username and password', 'error');
			return;
		}

		const users = getUsers();
		const user = findUserByUsername(users, username);
		if (!user) {
			showToast('Invalid username or password', 'error');
			return;
		}

		if (user.status === 'disabled') {
			showToast('This account is disabled', 'error');
			return;
		}

		// Student portal is strictly for student accounts. Admins and
		// teachers must use the admin portal instead.
		if (allowedRole && getEffectiveUserRole(user) !== allowedRole) {
			showToast('This account cannot access this portal', 'error');
			return;
		}

		const hashed = await hashPassword(password);
		const acceptsMigratedStudentDefault =
			user.role === ROLE_STUDENT &&
			String(password) === '123' &&
			String(user.studentNumber || '').trim();
		if (hashed !== user.passwordHash && !acceptsMigratedStudentDefault) {
			showToast('Invalid username or password', 'error');
			return;
		}
		if (acceptsMigratedStudentDefault && hashed !== user.passwordHash) {
			user.passwordHash = hashed;
			user.updatedAt = new Date().toISOString();
			saveUsers(users);
		}

		const session = buildSession(user, remember);
		persistSession(session);
		setCurrentUser(user, session);

		if (document.getElementById('authModal')) {
			sessionStorage.setItem('adminLoggedIn', 'true');
			applyRolePermissions();
			notifyAuthChange();
			window.location.reload();
			return;
		}

		if (document.getElementById('studentAuthModal')) {
			notifyAuthChange();
			applyStudentAuthUI(user);
			hideStudentAuthModal();
			return;
		}
	}

	function showAuthModal() {
		const modal = document.getElementById('authModal');
		if (!modal) return;
		// Defensive: admin.html has a malformed #settingsModal wrapper that never
		// closes, which swallows #authModal and keeps it at display:none even when
		// we request display:flex. Reparent to <body> so it always renders.
		if (modal.parentElement && modal.parentElement !== document.body) {
			document.body.appendChild(modal);
		}
		// Reveal the modal (but keep the dashboard hidden) while gated.
		if (document.documentElement.classList.contains('auth-pending')) {
			document.documentElement.classList.add('auth-ready');
		} else {
			// Session existed but was invalid/expired: hide the dashboard chrome
			// behind the modal as well so content isn't reachable unauthenticated.
			document.documentElement.classList.add('auth-pending', 'auth-ready');
		}
		modal.style.display = 'flex';
		setTimeout(() => modal.classList.add('active'), 10);
		document.body.classList.add('auth-locked');
	}

		function hideAuthModal() {
			const modal = document.getElementById('authModal');
			if (!modal) return;
			modal.style.display = 'none';
			modal.classList.remove('active');
			document.body.classList.remove('auth-locked');
			document.documentElement.classList.remove('auth-pending', 'auth-ready');
		}

	function showStudentAuthModal() {
		const modal = document.getElementById('studentAuthModal');
		if (!modal) return;
		populateStudentAccountRequestClassSelect();
		setStudentAccountRequestStatus('');
		setStudentAuthMode('signin');
		modal.style.display = 'flex';
		setTimeout(() => modal.classList.add('active'), 10);
	}

	function hideStudentAuthModal() {
		const modal = document.getElementById('studentAuthModal');
		if (!modal) return;
		modal.style.display = 'none';
		modal.classList.remove('active');
	}

	function setStudentAuthMode(mode = 'signin') {
		const signInSection = document.getElementById('studentAuthSignInSection');
		const requestSection = document.getElementById('studentAuthRequestSection');
		if (!signInSection || !requestSection) return;

		const normalizedMode =
			String(mode || '').toLowerCase() === 'request' ? 'request' : 'signin';
		const isRequest = normalizedMode === 'request';
		signInSection.style.display = isRequest ? 'none' : '';
		requestSection.style.display = isRequest ? '' : 'none';
	}

	function populateStudentAccountRequestClassSelect() {
		const classSelect = document.getElementById('student-request-class');
		if (!classSelect) return;
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const options = classes
			.filter((cls) => cls && cls.id && cls.name)
			.map(
				(cls) =>
					`<option value="${escapeHtml(String(cls.id))}">${escapeHtml(
						String(cls.name),
					)}</option>`,
			)
			.join('');
		classSelect.innerHTML =
			'<option value="">Select your class</option>' + options;
	}

	function setStudentAccountRequestStatus(message, type = '') {
		const statusEl = document.getElementById('studentAccountRequestStatus');
		if (!statusEl) return;
		statusEl.textContent = message || '';
		statusEl.className = type
			? `auth-request-status ${type}`
			: 'auth-request-status';
	}

	async function handleStudentAccountRequest(formEl) {
		if (!formEl) return;
		const fullName = String(
			document.getElementById('student-request-full-name')?.value || '',
		).trim();
		const username = String(
			document.getElementById('student-request-username')?.value || '',
		).trim();
		const password = String(
			document.getElementById('student-request-password')?.value || '',
		).trim();
		const studentNumber = String(
			document.getElementById('student-request-number')?.value || '',
		).trim();
		const classId = String(
			document.getElementById('student-request-class')?.value || '',
		).trim();
		const note = String(
			document.getElementById('student-request-note')?.value || '',
		).trim();

		const result = await submitAccountRequest({
			fullName,
			username,
			password,
			studentNumber,
			classId,
			note,
		});

		if (!result?.ok) {
			const errorMessage =
				result?.message || 'Unable to submit account request';
			setStudentAccountRequestStatus(errorMessage, 'error');
			showToast(errorMessage, 'error');
			return;
		}

		formEl.reset();
		populateStudentAccountRequestClassSelect();
		setStudentAccountRequestStatus(
			'Request sent. A teacher or admin will review it soon.',
			'success',
		);
		showToast('Account request sent successfully', 'success');
	}

	function handleStudentAuthClose() {
		const landingActions = document.getElementById('landing-actions');
		const examEntry = document.getElementById('exam-entry');
		if (landingActions || examEntry) {
			hideStudentAuthModal();
			if (landingActions) landingActions.classList.remove('hidden');
			if (examEntry) examEntry.classList.add('hidden');
			sessionStorage.removeItem('landingMode');
			const welcome = document.getElementById('welcome-title');
			if (welcome) {
				welcome.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
			return;
		}

		window.location.href = 'index.html';
	}

	function applyStudentAuthUI(user) {
		const statusEl = document.getElementById('studentAuthStatus');
		const loginBtn = document.getElementById('studentLoginButton');
		const logoutBtn = document.getElementById('studentLogoutButton');
		const resultsBtn = document.getElementById('studentResultsButton');

		if (isStudentLikeUser(user)) {
			if (statusEl) {
				statusEl.textContent = `Signed in as ${user.name || user.username}`;
			}
			if (loginBtn) loginBtn.classList.add('hidden');
			if (logoutBtn) logoutBtn.classList.remove('hidden');
			if (resultsBtn) resultsBtn.classList.remove('hidden');
		} else {
			if (statusEl) statusEl.textContent = 'Not signed in';
			if (loginBtn) loginBtn.classList.remove('hidden');
			if (logoutBtn) logoutBtn.classList.add('hidden');
			if (resultsBtn) resultsBtn.classList.add('hidden');
		}
	}

	function authLogout() {
		clearStoredSession();
		sessionStorage.removeItem('adminLoggedIn');
		currentUser = null;
		currentSession = null;
		window.currentUser = null;
		window.currentSession = null;
		window.location.reload();
	}

	function syncStudentToClasses(user, previousUser) {
		if (!isStudentLikeUser(user)) return;
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		let changed = false;

		if (
			previousUser &&
			isStudentLikeUser(previousUser) &&
			previousUser.classId
		) {
			const oldClass = classes.find((c) => c.id === previousUser.classId);
			if (oldClass && Array.isArray(oldClass.students)) {
				const before = oldClass.students.length;
				oldClass.students = oldClass.students.filter(
					(s) => String(s.number) !== String(previousUser.studentNumber),
				);
				if (oldClass.students.length !== before) changed = true;
			}
		}

		if (user.classId) {
			const target = classes.find((c) => c.id === user.classId);
			if (target) {
				if (!Array.isArray(target.students)) target.students = [];
				const existing = target.students.find(
					(s) => String(s.number) === String(user.studentNumber),
				);
				if (existing) {
					existing.name = user.name;
				} else {
					target.students.push({
						number: user.studentNumber,
						name: user.name,
					});
				}
				changed = true;
			}
		}

		if (changed) {
			window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);
		}
	}

	function normalizeStudentRosterEntry(entry) {
		if (!entry) return null;
		const number = String(
			entry.number || entry.studentNumber || entry.numero || '',
		).trim();
		const nameRaw = String(entry.name || entry.fullName || '').trim();
		const username = String(entry.username || '').trim();
		const status = String(entry.status || '').trim();
		if (!number) return null;
		const name = nameRaw || username || number;
		return { number, name, username, status };
	}

	function dedupeStudentRoster(entries = []) {
		const map = new Map();
		entries.forEach((entry) => {
			const normalized = normalizeStudentRosterEntry(entry);
			if (!normalized) return;
			const key = String(normalized.number);
			if (!map.has(key)) {
				map.set(key, normalized);
				return;
			}
			const existing = map.get(key);
			if (!existing.name && normalized.name) {
				map.set(key, { ...existing, name: normalized.name });
			}
		});
		return Array.from(map.values());
	}

	function ensureUniqueUsername(base, users, reserved = new Set()) {
		let candidate = String(base || '').trim();
		if (!candidate) candidate = 'student';
		let counter = 2;
		while (
			findUserByUsername(users, candidate) ||
			reserved.has(candidate.toLowerCase())
		) {
			candidate = `${base || 'student'}-${counter}`;
			counter += 1;
		}
		reserved.add(candidate.toLowerCase());
		return candidate;
	}

	async function syncClassStudentsFromClassData(
		classData,
		rawStudents,
		options = {},
	) {
		if (!classData || !classData.id) {
			return { created: 0, updated: 0, removed: 0 };
		}
		const classId = String(classData.id);
		const className = String(classData.name || '');
		const students = dedupeStudentRoster(rawStudents || []);
		const incomingNumbers = new Set(students.map((s) => String(s.number)));

		const users = getUsers();
		const reservedUsernames = new Set(
			users.map((u) => String(u.username || '').toLowerCase()).filter(Boolean),
		);
		let created = 0;
		let updated = 0;
		let removed = 0;
		const now = new Date().toISOString();
		const removeMissing = options.removeMissing !== false;

		for (const student of students) {
			const existingInClass = users.find(
				(u) =>
					u.role === ROLE_STUDENT &&
					String(u.classId || '') === classId &&
					String(u.studentNumber || '') === String(student.number),
			);
			const existingByNumber = users.find(
				(u) =>
					u.role === ROLE_STUDENT &&
					String(u.studentNumber || '') === String(student.number),
			);
			const existing = existingInClass || existingByNumber;

			if (existing) {
				const previousUser = { ...existing };
				let changed = false;
				if (student.name && existing.name !== student.name) {
					existing.name = student.name;
					changed = true;
				}
				if (String(existing.classId || '') !== classId) {
					existing.classId = classId;
					changed = true;
				}
				if (existing.className !== className) {
					existing.className = className;
					changed = true;
				}
				if (existing.studentNumber !== student.number) {
					existing.studentNumber = student.number;
					changed = true;
				}
				if (student.status && existing.status !== student.status) {
					existing.status = student.status;
					changed = true;
				}
				if (changed) {
					existing.updatedAt = now;
					syncStudentToClasses(existing, previousUser);
					updated += 1;
				}
				continue;
			}

			const baseUsername = student.username || student.name || student.number;
			const username = ensureUniqueUsername(
				baseUsername,
				users,
				reservedUsernames,
			);
			const status = student.status || options.status || 'active';
			const defaultPassword =
				typeof options.defaultPassword === 'string' &&
				options.defaultPassword.trim()
					? options.defaultPassword.trim()
					: '123';

			const newUser = normalizeUser({
				name: student.name,
				username,
				role: ROLE_STUDENT,
				status,
				studentNumber: student.number,
				classId,
				className,
			});
			newUser.passwordHash = await hashPassword(defaultPassword);
			newUser.createdAt = now;
			newUser.updatedAt = now;
			users.push(newUser);
			created += 1;
		}

		if (removeMissing) {
			users.forEach((user) => {
				if (
					user.role === ROLE_STUDENT &&
					String(user.classId || '') === classId &&
					!incomingNumbers.has(String(user.studentNumber || ''))
				) {
					user.classId = '';
					user.className = '';
					user.updatedAt = now;
					removed += 1;
				}
			});
		}

		if (created || updated || removed) {
			saveUsers(users);
			if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
				window.syncUsersToClients();
			}
			if (typeof window.renderUsersTable === 'function') {
				window.renderUsersTable();
			}
		}

		return { created, updated, removed };
	}

	function downloadJsonPayload(payload, filename) {
		const dataStr = JSON.stringify(payload, null, 2);
		const dataUri =
			'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', filename);
		document.body.appendChild(linkElement);
		linkElement.click();
		linkElement.remove();
	}

	function getSelectedUserClassScope() {
		const classFilter = document.getElementById('userClassFilter');
		const value = classFilter ? String(classFilter.value || '') : '';
		if (value === USER_CLASS_GUEST_VALUE) {
			return { mode: 'guest' };
		}
		if (value) {
			return { mode: 'class', classId: value };
		}
		return { mode: 'all' };
	}

	function exportUserData() {
		const roleFilter = document.getElementById('userRoleFilter');
		const role = roleFilter ? String(roleFilter.value || '') : '';
		if (role === ROLE_ADMIN) {
			showToast('Admin export is not supported', 'error');
			return;
		}
		if (!role) {
			if (isAdmin()) {
				return exportAllUsersWithClasses();
			}
			return exportUsersWithClasses();
		}
		if (role === ROLE_TEACHER) {
			if (!isAdmin()) {
				showToast('Only admins can export teachers', 'error');
				return;
			}
			return exportTeachersOnly();
		}
		return exportUsersWithClasses();
	}

	function importUserData() {
		const roleFilter = document.getElementById('userRoleFilter');
		const role = roleFilter ? String(roleFilter.value || '') : '';
		if (!role) {
			showToast('Select a role before importing', 'error');
			return;
		}
		if (role === ROLE_ADMIN) {
			showToast('Admin import is not supported', 'error');
			return;
		}
		if (role === ROLE_TEACHER) {
			if (!isAdmin()) {
				showToast('Only admins can import teachers', 'error');
				return;
			}
			return importTeachersOnly();
		}
		return importUsersWithClasses();
	}

	function refreshUserClassFilter() {
		const classFilter = document.getElementById('userClassFilter');
		if (!classFilter) return;
		const current = classFilter.value;
		const classes = getAccessibleClasses();
		const options = [
			{ value: '', label: 'All Classes' },
			{
				value: USER_CLASS_GUEST_VALUE,
				label: `${GUEST_CLASS_NAME} (no class)`,
			},
			...classes.map((cls) => ({
				value: cls.id,
				label: cls.name,
			})),
		];
		classFilter.innerHTML = options
			.map(
				(option) =>
					`<option value="${escapeHtml(option.value)}">${escapeHtml(
						option.label,
					)}</option>`,
			)
			.join('');
		const hasCurrent = options.some((option) => option.value === current);
		classFilter.value = hasCurrent ? current : '';
	}

	function buildClassNameMap(classes = []) {
		return new Map(classes.map((cls) => [String(cls.id), cls.name]));
	}

	function resolveUserClassName(user, classMap) {
		if (!user) return '';
		if (user.className) return user.className;
		if (user.classId && classMap.has(String(user.classId))) {
			return classMap.get(String(user.classId));
		}
		if (user.role === ROLE_STUDENT && !user.classId) {
			return GUEST_CLASS_NAME;
		}
		return '';
	}

	function extractImportedStudents(parsed) {
		if (Array.isArray(parsed)) return parsed;
		if (parsed && Array.isArray(parsed.students)) return parsed.students;
		if (parsed && Array.isArray(parsed.classes)) {
			return parsed.classes.flatMap((cls) => cls.students || []);
		}
		return [];
	}

	function exportUsersWithClasses() {
		if (!isAdmin() && !isTeacher()) {
			showToast('Only admins or teachers can export students', 'error');
			return;
		}
		const scope = getSelectedUserClassScope();
		const allClasses = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const accessibleClasses = isTeacher() ? getAccessibleClasses() : allClasses;
		const classMap = buildClassNameMap(allClasses);
		const filteredUsers = getFilteredUsers(getUsers()).filter((u) => {
			if (isAdmin()) return true;
			if (isTeacher()) return canManageUser(u);
			return false;
		});
		let scopedStudents = filteredUsers.filter((u) => u.role === ROLE_STUDENT);

		if (scope.mode === 'class') {
			scopedStudents = scopedStudents.filter(
				(u) => String(u.classId || '') === String(scope.classId),
			);
		} else if (scope.mode === 'guest') {
			scopedStudents = scopedStudents.filter((u) => !u.classId);
		}

		const studentsByClass = new Map();
		scopedStudents.forEach((student) => {
			if (!student.classId) return;
			const key = String(student.classId);
			if (!studentsByClass.has(key)) {
				studentsByClass.set(key, []);
			}
			studentsByClass.get(key).push(student);
		});

		let scopedClasses = accessibleClasses;
		if (scope.mode === 'class') {
			scopedClasses = accessibleClasses.filter(
				(cls) => String(cls.id) === String(scope.classId),
			);
		} else if (scope.mode === 'guest') {
			scopedClasses = [];
		}

		const guestUsers = scopedStudents.filter((u) => !u.classId);
		const needsGuest =
			scope.mode === 'guest' || (scope.mode === 'all' && guestUsers.length);
		let guestClass = null;
		if (needsGuest) {
			guestClass =
				findGuestClass(allClasses) || createGuestClass(currentUser?.id);
			if (scope.mode === 'guest') {
				scopedClasses = [guestClass];
			} else if (
				!scopedClasses.some(
					(cls) => String(cls.name || '').toLowerCase() === 'guest',
				)
			) {
				scopedClasses = [...scopedClasses, guestClass];
			}
		}

		const guestRoster = guestUsers.map((u) => ({
			number: u.studentNumber,
			name: u.name || u.username || '',
		}));
		const payload = {
			version: 1,
			exportedAt: new Date().toISOString(),
			classes: scopedClasses.map((cls) => ({
				id: cls.id,
				name: cls.name,
				ownerId: cls.ownerId || '',
				dateCreated: cls.dateCreated || '',
				students:
					guestClass && cls.id === guestClass.id
						? guestRoster
						: (studentsByClass.get(String(cls.id)) || []).map((student) => ({
								number: student.studentNumber,
								name: student.name || student.username || '',
							})),
			})),
			students: scopedStudents.map((u) => {
				const className = resolveUserClassName(u, classMap);
				const classId = u.classId || guestClass?.id || '';
				const resolvedClassName =
					className || (guestClass ? guestClass.name : '');
				return {
					name: u.name,
					username: u.username,
					studentNumber: u.studentNumber,
					classId,
					className: resolvedClassName,
					status: u.status,
				};
			}),
		};

		const dateTag = new Date().toISOString().split('T')[0];
		let filename = `quiz-classes-students-${dateTag}.json`;
		if (scope.mode === 'class' && scopedClasses[0]) {
			filename = `class-${scopedClasses[0].name}-${dateTag}.json`;
		} else if (scope.mode === 'guest') {
			filename = `guest-students-${dateTag}.json`;
		}
		downloadJsonPayload(payload, filename);
	}

	function exportAllUsersWithClasses() {
		if (!isAdmin()) {
			showToast('Only admins can export all roles', 'error');
			return;
		}
		const scope = getSelectedUserClassScope();
		const allClasses = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const classMap = buildClassNameMap(allClasses);
		const filteredUsers = getFilteredUsers(getUsers()).filter(
			(u) => u.role !== ROLE_ADMIN,
		);
		let scopedStudents = filteredUsers.filter((u) => u.role === ROLE_STUDENT);
		let scopedTeachers = filteredUsers.filter((u) => u.role === ROLE_TEACHER);

		if (scope.mode === 'class') {
			const classExists = allClasses.some(
				(cls) => String(cls.id) === String(scope.classId),
			);
			if (!classExists) {
				showToast('Selected class not found', 'error');
				return;
			}
			scopedStudents = scopedStudents.filter(
				(u) => String(u.classId || '') === String(scope.classId),
			);
			scopedTeachers = scopedTeachers.filter((u) =>
				Array.isArray(u.classIds)
					? u.classIds.map(String).includes(String(scope.classId))
					: false,
			);
		} else if (scope.mode === 'guest') {
			scopedStudents = scopedStudents.filter((u) => !u.classId);
			scopedTeachers = [];
		}

		const studentsByClass = new Map();
		scopedStudents.forEach((student) => {
			if (!student.classId) return;
			const key = String(student.classId);
			if (!studentsByClass.has(key)) {
				studentsByClass.set(key, []);
			}
			studentsByClass.get(key).push(student);
		});

		let scopedClasses = allClasses;
		if (scope.mode === 'class') {
			scopedClasses = allClasses.filter(
				(cls) => String(cls.id) === String(scope.classId),
			);
		} else if (scope.mode === 'guest') {
			scopedClasses = [];
		}

		const guestUsers = scopedStudents.filter((u) => !u.classId);
		const needsGuest =
			scope.mode === 'guest' || (scope.mode === 'all' && guestUsers.length);
		let guestClass = null;
		if (needsGuest) {
			guestClass =
				findGuestClass(allClasses) || createGuestClass(currentUser?.id);
			if (scope.mode === 'guest') {
				scopedClasses = [guestClass];
			} else if (
				!scopedClasses.some(
					(cls) => String(cls.name || '').toLowerCase() === 'guest',
				)
			) {
				scopedClasses = [...scopedClasses, guestClass];
			}
		}

		const guestRoster = guestUsers.map((u) => ({
			number: u.studentNumber,
			name: u.name || u.username || '',
		}));

		const payload = {
			version: 1,
			exportedAt: new Date().toISOString(),
			classes: scopedClasses.map((cls) => ({
				id: cls.id,
				name: cls.name,
				ownerId: cls.ownerId || '',
				dateCreated: cls.dateCreated || '',
				students:
					guestClass && cls.id === guestClass.id
						? guestRoster
						: (studentsByClass.get(String(cls.id)) || []).map((student) => ({
								number: student.studentNumber,
								name: student.name || student.username || '',
							})),
			})),
			students: scopedStudents.map((u) => {
				const className = resolveUserClassName(u, classMap);
				const classId = u.classId || guestClass?.id || '';
				const resolvedClassName =
					className || (guestClass ? guestClass.name : '');
				return {
					name: u.name,
					username: u.username,
					studentNumber: u.studentNumber,
					classId,
					className: resolvedClassName,
					status: u.status,
				};
			}),
			teachers: scopedTeachers.map((u) => ({
				name: u.name,
				username: u.username,
				classIds: Array.isArray(u.classIds) ? u.classIds : [],
				classNames: Array.isArray(u.classIds)
					? u.classIds.map((id) => classMap.get(String(id))).filter(Boolean)
					: [],
				status: u.status,
			})),
		};

		const dateTag = new Date().toISOString().split('T')[0];
		let filename = `quiz-users-${dateTag}.json`;
		if (scope.mode === 'class' && scopedClasses[0]) {
			filename = `class-${scopedClasses[0].name}-users-${dateTag}.json`;
		} else if (scope.mode === 'guest') {
			filename = `guest-users-${dateTag}.json`;
		}
		downloadJsonPayload(payload, filename);
	}

	function resolveTeacherClassIds(raw, classes) {
		if (!raw) return [];
		const classByName = new Map(
			classes.map((cls) => [String(cls.name || '').toLowerCase(), cls.id]),
		);
		const ids = Array.isArray(raw.classIds)
			? raw.classIds.map((id) => String(id))
			: [];
		const names = Array.isArray(raw.classNames)
			? raw.classNames.map((name) => String(name))
			: [];
		const resolved = new Set();
		ids.forEach((id) => {
			if (classes.some((cls) => String(cls.id) === id)) {
				resolved.add(id);
			}
		});
		names.forEach((name) => {
			const id = classByName.get(name.toLowerCase());
			if (id) resolved.add(id);
		});
		return Array.from(resolved);
	}

	function exportTeachersOnly() {
		if (!isAdmin()) {
			showToast('Only admins can export teachers', 'error');
			return;
		}
		const scope = getSelectedUserClassScope();
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const classMap = buildClassNameMap(classes);
		let teachers = getFilteredUsers(getUsers()).filter(
			(u) => u.role === ROLE_TEACHER,
		);

		if (scope.mode === 'class') {
			teachers = teachers.filter((u) =>
				Array.isArray(u.classIds)
					? u.classIds.map(String).includes(String(scope.classId))
					: false,
			);
		} else if (scope.mode === 'guest') {
			teachers = [];
		}

		const payload = {
			version: 1,
			exportedAt: new Date().toISOString(),
			teachers: teachers.map((u) => ({
				name: u.name,
				username: u.username,
				classIds: Array.isArray(u.classIds) ? u.classIds : [],
				classNames: Array.isArray(u.classIds)
					? u.classIds.map((id) => classMap.get(String(id))).filter(Boolean)
					: [],
				status: u.status,
			})),
		};

		const dateTag = new Date().toISOString().split('T')[0];
		let filename = `teachers-${dateTag}.json`;
		if (scope.mode === 'class') {
			const className = classMap.get(String(scope.classId)) || 'class';
			filename = `teachers-${className}-${dateTag}.json`;
		}
		downloadJsonPayload(payload, filename);
	}

	function normalizeClassImportRecord(raw, fallbackOwnerId) {
		if (!raw) return null;
		const name = String(raw.name || raw.className || '').trim();
		if (!name) return null;
		const id =
			String(raw.id || '').trim() ||
			(typeof generateUUID === 'function' ? generateUUID() : `${Date.now()}`);
		const students = Array.isArray(raw.students)
			? raw.students
					.map((student) => normalizeStudentRosterEntry(student))
					.filter(Boolean)
					.map((student) => ({ number: student.number, name: student.name }))
			: [];
		return {
			id,
			name,
			ownerId: raw.ownerId || fallbackOwnerId || '',
			dateCreated: raw.dateCreated || new Date().toISOString(),
			students,
		};
	}

	function mergeImportedClasses(existing, imported, ownerId) {
		const merged = new Map(
			existing.map((cls) => [
				cls.id,
				{
					...cls,
					students: Array.isArray(cls.students) ? cls.students : [],
				},
			]),
		);

		imported.forEach((raw) => {
			const normalized = normalizeClassImportRecord(raw, ownerId);
			if (!normalized) return;
			let target = merged.get(normalized.id);
			if (!target) {
				target = Array.from(merged.values()).find(
					(cls) => cls.name === normalized.name,
				);
			}
			if (target) {
				target.name = target.name || normalized.name;
				target.ownerId = target.ownerId || normalized.ownerId;
				target.dateCreated = target.dateCreated || normalized.dateCreated;
				const combined = dedupeStudentRoster([
					...(target.students || []),
					...(normalized.students || []),
				]);
				target.students = combined.map((s) => ({
					number: s.number,
					name: s.name,
				}));
			} else {
				merged.set(normalized.id, normalized);
			}
		});

		return Array.from(merged.values());
	}

	function buildImportedStudentEntries(rawStudents, classes, options = {}) {
		const classById = new Map(classes.map((cls) => [cls.id, cls]));
		const classByName = new Map(
			classes.map((cls) => [String(cls.name || '').toLowerCase(), cls]),
		);
		const entries = new Map();
		const guestClass = options.guestClass || null;

		function addEntry(student, classId, className) {
			const normalized = normalizeStudentRosterEntry(student);
			if (!normalized) return;
			let resolvedClassId = classId || '';
			let resolvedClassName = className || '';
			if (!resolvedClassId && guestClass) {
				resolvedClassId = guestClass.id;
				resolvedClassName = guestClass.name;
			}
			if (!resolvedClassId) return;
			if (!resolvedClassName) {
				resolvedClassName = classById.get(resolvedClassId)?.name || '';
			}
			const key = `${resolvedClassId}::${normalized.number}`;
			if (!entries.has(key)) {
				entries.set(key, {
					...normalized,
					classId: resolvedClassId,
					className: resolvedClassName,
				});
			}
		}

		(rawStudents || []).forEach((student) => {
			const classId = String(student.classId || '').trim();
			const className = String(student.className || '').trim();
			const resolvedClass =
				classById.get(classId) || classByName.get(className.toLowerCase());
			addEntry(
				student,
				resolvedClass?.id || classId,
				resolvedClass?.name || className,
			);
		});

		classes.forEach((cls) => {
			(cls.students || []).forEach((student) => {
				addEntry(student, cls.id, cls.name);
			});
		});

		return Array.from(entries.values());
	}

	function importUsersWithClasses() {
		if (!isAdmin() && !isTeacher()) {
			showToast('Only admins or teachers can import students', 'error');
			return;
		}
		const scope = getSelectedUserClassScope();
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = (event) => {
			const file = event.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				try {
					const parsed = JSON.parse(e.target.result);
					const parsedArray = Array.isArray(parsed) ? parsed : null;
					const arrayLooksLikeClasses =
						parsedArray &&
						parsedArray.some((item) => Array.isArray(item?.students));
					const rawClasses =
						parsedArray && arrayLooksLikeClasses
							? parsedArray
							: Array.isArray(parsed?.classes)
								? parsed.classes
								: [];
					const rawStudents =
						parsedArray && !arrayLooksLikeClasses
							? parsedArray
							: parsed && Array.isArray(parsed.students)
								? parsed.students
								: [];
					const extractedStudents = extractImportedStudents(parsed);

					if (
						!rawClasses.length &&
						!rawStudents.length &&
						!extractedStudents.length
					) {
						showToast('No classes or students found in file', 'error');
						return;
					}

					// ── Teacher gate: stage the import for admin confirmation ──
					// Teachers may prepare imports for their own classes, but the
					// roster is only materialized once an admin confirms it. Admins
					// keep the previous direct-apply behaviour.
					if (isTeacher()) {
						if (scope.mode !== 'class') {
							showToast('Select one of your classes before importing', 'error');
							return;
						}
						const allowedClassIds = getTeacherClassIds();
						if (!allowedClassIds.includes(String(scope.classId))) {
							showToast('You can only import into your classes', 'error');
							return;
						}
						const staged = stagePendingImport({
							classId: scope.classId,
							students: extractedStudents,
							sourceFileName: file.name || 'import.json',
						});
						if (staged) {
							showToast(
								`Import staged: ${staged.studentCount} student(s) sent to admin for confirmation`,
								'success',
							);
						}
						return;
					}

					const existingClasses = safeJsonParse(
						JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')),
						[],
					);
					const ownerId = currentUser?.id || '';

					if (scope.mode === 'class' || scope.mode === 'guest') {
						const classes = existingClasses;
						const targetClass =
							scope.mode === 'guest'
								? ensureGuestClass(classes, ownerId)
								: classes.find(
										(cls) => String(cls.id) === String(scope.classId),
									);
						if (!targetClass) {
							showToast('Selected class not found', 'error');
							return;
						}

						const incomingRoster = dedupeStudentRoster(extractedStudents);
						if (!incomingRoster.length) {
							showToast('No students found in file', 'error');
							return;
						}

						const mergedRoster = dedupeStudentRoster([
							...(targetClass.students || []),
							...incomingRoster,
						]);
						targetClass.students = mergedRoster.map((student) => ({
							number: student.number,
							name: student.name,
						}));

						window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);
						await syncClassStudentsFromClassData(targetClass, mergedRoster, {
							removeMissing: false,
						});

						if (typeof window.updateClassList === 'function') {
							window.updateClassList(classes);
						}
						if (typeof window.renderUsersTable === 'function') {
							window.renderUsersTable();
						}
						showToast(
							`Imported ${incomingRoster.length} student(s) into ${targetClass.name}`,
							'success',
						);
						return;
					}

					const mergedClasses = mergeImportedClasses(
						existingClasses,
						rawClasses,
						ownerId,
					);

					let guestClass = null;
					const needsGuest = rawStudents.some(
						(student) => !student.classId && !student.className,
					);
					if (needsGuest) {
						guestClass = ensureGuestClass(mergedClasses, ownerId);
					}

					const studentEntries = buildImportedStudentEntries(
						rawStudents,
						mergedClasses,
						{ guestClass },
					);
					const studentsByClass = new Map();
					studentEntries.forEach((entry) => {
						if (!studentsByClass.has(entry.classId)) {
							studentsByClass.set(entry.classId, []);
						}
						studentsByClass.get(entry.classId).push(entry);
					});

					const classMap = new Map(mergedClasses.map((cls) => [cls.id, cls]));
					studentsByClass.forEach((entries, classId) => {
						const cls = classMap.get(classId);
						if (!cls) return;
						const combined = dedupeStudentRoster([
							...(cls.students || []),
							...entries,
						]);
						cls.students = combined.map((student) => ({
							number: student.number,
							name: student.name,
						}));
					});

					window.__DI_CONTAINER__.repo.setAll_sync('classes', mergedClasses);

					for (const cls of mergedClasses) {
						const roster = studentsByClass.get(cls.id) || [];
						if (roster.length) {
							await syncClassStudentsFromClassData(cls, roster, {
								removeMissing: false,
							});
						}
					}

					if (typeof window.updateClassList === 'function') {
						window.updateClassList(mergedClasses);
					}
					if (typeof window.renderUsersTable === 'function') {
						window.renderUsersTable();
					}
					showToast('Import completed successfully', 'success');
				} catch (error) {
					console.error('Import users failed:', error);
					showToast('Error importing users: ' + error.message, 'error');
				}
			};
			reader.readAsText(file);
		};

		input.click();
	}

	function importTeachersOnly() {
		if (!isAdmin()) {
			showToast('Only admins can import teachers', 'error');
			return;
		}
		const scope = getSelectedUserClassScope();
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = (event) => {
			const file = event.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				try {
					const parsed = JSON.parse(e.target.result);
					const rawTeachers = Array.isArray(parsed)
						? parsed
						: Array.isArray(parsed?.teachers)
							? parsed.teachers
							: [];

					if (!rawTeachers.length) {
						showToast('No teachers found in file', 'error');
						return;
					}

					const classes = safeJsonParse(
						JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')),
						[],
					);
					const users = getUsers();
					const now = new Date().toISOString();
					let created = 0;
					let updated = 0;
					let skipped = 0;

					for (const raw of rawTeachers) {
						const username = String(raw.username || raw.email || '').trim();
						if (!username) {
							skipped += 1;
							continue;
						}
						const existing = findUserByUsername(users, username);
						const resolvedClassIds = resolveTeacherClassIds(raw, classes);
						if (
							scope.mode === 'class' &&
							!resolvedClassIds.includes(String(scope.classId))
						) {
							skipped += 1;
							continue;
						}
						if (scope.mode === 'guest') {
							skipped += 1;
							continue;
						}
						const status = raw.status || 'active';

						if (existing) {
							if (
								existing.role === ROLE_ADMIN ||
								existing.role === ROLE_STUDENT
							) {
								skipped += 1;
								continue;
							}
							existing.role = ROLE_TEACHER;
							if (raw.name) existing.name = String(raw.name).trim();
							existing.status = status;
							existing.classIds = resolvedClassIds;
							existing.updatedAt = now;
							updated += 1;
							continue;
						}

						const uniqueUsername = ensureUniqueUsername(username, users);
						const teacherName = String(raw.name || '').trim() || uniqueUsername;
						const newUser = normalizeUser({
							name: teacherName,
							username: uniqueUsername,
							role: ROLE_TEACHER,
							status,
							classIds: resolvedClassIds,
						});
						const defaultPassword =
							typeof raw.defaultPassword === 'string' &&
							raw.defaultPassword.trim()
								? raw.defaultPassword.trim()
								: 'teacher123';
						newUser.passwordHash = await hashPassword(defaultPassword);
						newUser.createdAt = now;
						newUser.updatedAt = now;
						users.push(newUser);
						created += 1;
					}

					if (created || updated) {
						saveUsers(users);
						if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
							window.syncUsersToClients();
						}
						if (typeof window.renderUsersTable === 'function') {
							window.renderUsersTable();
						}
					}

					const detail = skipped ? ` (${skipped} skipped)` : '';
					showToast(
						`Imported teachers: ${created} created, ${updated} updated${detail}`,
						'success',
					);
				} catch (error) {
					console.error('Import teachers failed:', error);
					showToast('Error importing teachers: ' + error.message, 'error');
				}
			};
			reader.readAsText(file);
		};

		input.click();
	}

	function getFilteredUsers(users) {
		const searchInput = document.getElementById('userSearchInput');
		const roleFilter = document.getElementById('userRoleFilter');
		const statusFilter = document.getElementById('userStatusFilter');
		const classFilter = document.getElementById('userClassFilter');

		const term = (searchInput?.value || '').trim().toLowerCase();
		const role = roleFilter?.value || '';
		const status = statusFilter?.value || '';
		const classScope = classFilter?.value || '';

		return users.filter((u) => {
			if (role && u.role !== role) return false;
			if (status && u.status !== status) return false;
			if (classScope) {
				if (classScope === USER_CLASS_GUEST_VALUE) {
					if (u.role !== ROLE_STUDENT || u.classId) return false;
				} else if (u.role === ROLE_TEACHER) {
					const teacherClassIds = Array.isArray(u.classIds)
						? u.classIds.map(String)
						: [];
					if (!teacherClassIds.includes(String(classScope))) return false;
				} else if (String(u.classId || '') !== String(classScope)) {
					return false;
				}
			}

			if (!term) return true;
			const haystack = [
				u.name,
				u.username,
				u.studentNumber,
				u.className,
				u.role,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return haystack.includes(term);
		});
	}

	function renderUsersTable() {
		const tableBody = document.getElementById('usersTableBody');
		if (!tableBody) return;
		refreshUserClassFilter();

		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const classMap = buildClassNameMap(classes);
		const rosterNameMap = new Map();
		classes.forEach((cls) => {
			(cls.students || []).forEach((student) => {
				const number = String(student?.number || '').trim();
				if (!number) return;
				const key = `${cls.id}::${number}`;
				if (!rosterNameMap.has(key)) {
					rosterNameMap.set(key, student?.name || '');
				}
			});
		});

		const users = getFilteredUsers(getUsers()).filter((u) => {
			if (!currentUser) return true;
			if (isAdmin()) return true;
			if (isTeacher()) return canManageUser(u);
			return false;
		});

		const selectableIds = new Set(
			users.filter((u) => canManageUser(u)).map((u) => u.id),
		);
		selectedUserIds.forEach((id) => {
			if (!selectableIds.has(id)) {
				selectedUserIds.delete(id);
			}
		});

		if (users.length === 0) {
			tableBody.innerHTML =
				'<tr><td colspan="8" class="text-center">No users found.</td></tr>';
			updateBulkSelectionState();
			return;
		}

		const emptyCell = '<span class="text-muted">-</span>';

		tableBody.innerHTML = users
			.map((u) => {
				const roleLabel =
					u.role === ROLE_ADMIN
						? 'Admin'
						: u.role === ROLE_TEACHER
							? 'Teacher'
							: 'Student';
				const statusLabel = u.status === 'disabled' ? 'Disabled' : 'Active';
				const statusBadge =
					u.status === 'disabled'
						? 'status-badge inactive'
						: 'status-badge active';
				const canManage = canManageUser(u);
				const statusAction = u.status === 'disabled' ? 'Activate' : 'Suspend';
				const statusClass =
					u.status === 'disabled' ? 'btn-secondary' : 'btn-danger-soft';
				const className = resolveUserClassName(u, classMap);
				const classDisplay =
					u.role === ROLE_STUDENT ? className || GUEST_CLASS_NAME : '';
				const studentNumberDisplay =
					u.role === ROLE_STUDENT ? u.studentNumber || '' : '';
				const usernameDisplay =
					u.role === ROLE_STUDENT &&
					u.studentNumber &&
					String(u.username || '') === String(u.studentNumber || '')
						? ''
						: u.username || '';
				const isSelected = selectedUserIds.has(u.id);
				return `
        <tr class="${isSelected ? 'is-selected' : ''}">
						<td class="checkbox-cell">
							<input
								type="checkbox"
								class="table-checkbox user-select-checkbox"
								data-user-id="${escapeHtml(u.id)}"
								${canManage ? '' : 'disabled'}
								${isSelected ? 'checked' : ''}
							/>
						</td>
            <td>${escapeHtml(
							u.name ||
								rosterNameMap.get(`${u.classId}::${u.studentNumber}`) ||
								u.username ||
								'User',
						)}</td>
            <td>${usernameDisplay ? escapeHtml(usernameDisplay) : emptyCell}</td>
            <td>${studentNumberDisplay ? escapeHtml(studentNumberDisplay) : emptyCell}</td>
            <td>${classDisplay ? escapeHtml(classDisplay) : emptyCell}</td>
            <td><span class="user-role ${escapeHtml(u.role)}">${roleLabel}</span></td>
            <td><span class="${statusBadge}">${escapeHtml(statusLabel)}</span></td>
            <td>
								<div class="user-actions">
									${
										canManage
											? `<button class="btn btn-sm btn-secondary" onclick="openUserModal('${escapeHtml(u.id)}')">Edit</button>`
											: ''
									}
									${
										canManage
											? `<button class="btn btn-sm ${statusClass}" onclick="toggleUserStatus('${escapeHtml(u.id)}')">${statusAction}</button>`
											: ''
									}
									${
										canManage
											? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${escapeHtml(u.id)}')">Delete</button>`
											: ''
									}
				</div>
            </td>
        </tr>
      `;
			})
			.join('');
		updateBulkSelectionState();
	}

	function updateBulkSelectionState() {
		const bulkBar = document.getElementById('usersBulkActions');
		const countEl = document.getElementById('usersSelectedCount');
		const selectAll = document.getElementById('usersSelectAll');
		const checkboxes = Array.from(
			document.querySelectorAll('.user-select-checkbox'),
		).filter((checkbox) => !checkbox.disabled);
		const checkedCount = checkboxes.filter(
			(checkbox) => checkbox.checked,
		).length;

		if (selectAll) {
			selectAll.checked =
				checkboxes.length > 0 && checkedCount === checkboxes.length;
			selectAll.indeterminate =
				checkedCount > 0 && checkedCount < checkboxes.length;
		}

		if (countEl) {
			countEl.textContent = `${selectedUserIds.size} selected`;
		}
		if (bulkBar) {
			bulkBar.classList.toggle('hidden', selectedUserIds.size === 0);
		}
	}

	function handleUserSelectAll(checked) {
		const checkboxes = Array.from(
			document.querySelectorAll('.user-select-checkbox'),
		);
		checkboxes.forEach((checkbox) => {
			if (checkbox.disabled) return;
			checkbox.checked = checked;
			const userId = checkbox.dataset.userId;
			if (!userId) return;
			if (checked) {
				selectedUserIds.add(userId);
			} else {
				selectedUserIds.delete(userId);
			}
		});
		updateBulkSelectionState();
	}

	function handleUserCheckboxChange(checkbox) {
		const userId = checkbox?.dataset?.userId;
		if (!userId) return;
		if (checkbox.checked) {
			selectedUserIds.add(userId);
		} else {
			selectedUserIds.delete(userId);
		}
		updateBulkSelectionState();
	}

	function bulkSetUserStatus(nextStatus) {
		if (!selectedUserIds.size) return;
		const users = getUsers();
		const now = new Date().toISOString();
		let updated = 0;
		let skipped = 0;
		let activeAdminCount = users.filter(
			(u) => u.role === ROLE_ADMIN && u.status !== 'disabled',
		).length;

		selectedUserIds.forEach((userId) => {
			const user = users.find((u) => u.id === userId);
			if (!user) {
				skipped += 1;
				return;
			}
			if (!canManageUser(user) && !isAdmin()) {
				skipped += 1;
				return;
			}
			if (user.status === nextStatus) return;
			if (user.role === ROLE_ADMIN && nextStatus === 'disabled') {
				if (activeAdminCount <= 1 && user.status !== 'disabled') {
					skipped += 1;
					return;
				}
				activeAdminCount -= 1;
			}
			user.status = nextStatus;
			user.updatedAt = now;
			updated += 1;
		});

		if (updated) {
			saveUsers(users);
			if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
				window.syncUsersToClients();
			}
			renderUsersTable();
		}

		if (updated || skipped) {
			const actionLabel = nextStatus === 'disabled' ? 'suspended' : 'activated';
			const detail = skipped ? ` (${skipped} skipped)` : '';
			showToast(`Users ${actionLabel}${detail}`, updated ? 'success' : 'info');
		}
	}

	function bulkActivateUsers() {
		bulkSetUserStatus('active');
	}

	function bulkSuspendUsers() {
		bulkSetUserStatus('disabled');
	}

	function bulkDeleteUsers() {
		if (!selectedUserIds.size) return;
		const users = getUsers();
		const selectedCount = selectedUserIds.size;
		if (
			!confirm(
				`Delete ${selectedCount} selected user(s)? This cannot be undone.`,
			)
		) {
			return;
		}

		let adminCount = users.filter((u) => u.role === ROLE_ADMIN).length;
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		let classesChanged = false;
		let deleted = 0;
		let skipped = 0;
		const remaining = [];

		users.forEach((user) => {
			if (!selectedUserIds.has(user.id)) {
				remaining.push(user);
				return;
			}
			if (!canManageUser(user) && !isAdmin()) {
				remaining.push(user);
				skipped += 1;
				return;
			}
			if (user.role === ROLE_ADMIN && adminCount <= 1) {
				remaining.push(user);
				skipped += 1;
				return;
			}
			if (user.role === ROLE_ADMIN) {
				adminCount -= 1;
			}
			if (user.role === ROLE_STUDENT && user.classId) {
				const target = classes.find((cls) => cls.id === user.classId);
				if (target && Array.isArray(target.students)) {
					const before = target.students.length;
					target.students = target.students.filter(
						(s) => String(s.number) !== String(user.studentNumber),
					);
					if (before !== target.students.length) classesChanged = true;
				}
			}
			deleted += 1;
		});

		if (deleted) {
			saveUsers(remaining);
			if (classesChanged) {
				window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);
			}
			if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
				window.syncUsersToClients();
			}
			selectedUserIds.clear();
			renderUsersTable();
		}

		if (deleted || skipped) {
			const detail = skipped ? ` (${skipped} skipped)` : '';
			showToast(
				`Deleted ${deleted} user(s)${detail}`,
				deleted ? 'success' : 'info',
			);
		}
	}

	function populateUserForm(user) {
		const form = document.getElementById('userForm');
		if (!form) return;

		form.reset();
		form.dataset.userId = user?.id || '';

		const nameInput = document.getElementById('userName');
		const usernameInput = document.getElementById('userUsername');
		const roleSelect = document.getElementById('userRole');
		const statusSelect = document.getElementById('userStatus');
		const studentNumberInput = document.getElementById('studentNumberField');
		const studentClassSelect = document.getElementById('studentClassSelect');

		if (nameInput) nameInput.value = user?.name || '';
		if (usernameInput) usernameInput.value = user?.username || '';
		const isTeacherUser = isTeacher();
		if (roleSelect) {
			roleSelect.value = user?.role || ROLE_STUDENT;
			if (isTeacherUser) {
				roleSelect.value = ROLE_STUDENT;
				roleSelect.disabled = true;
			} else {
				roleSelect.disabled = false;
			}
		}
		if (statusSelect) statusSelect.value = user?.status || 'active';
		if (studentNumberInput)
			studentNumberInput.value = user?.studentNumber || '';

		// Teacher/staff contacts (numero doubles as the teacher staff number).
		const teacherNumeroInput = document.getElementById('teacherNumeroField');
		const teacherPhoneInput = document.getElementById('teacherPhoneField');
		const teacherEmailInput = document.getElementById('teacherEmailField');
		const teacherSubjectsInput = document.getElementById('teacherSubjectsField');
		if (teacherNumeroInput)
			teacherNumeroInput.value = user?.numero || user?.studentNumber || '';
		if (teacherPhoneInput) teacherPhoneInput.value = user?.phone || '';
		if (teacherEmailInput) teacherEmailInput.value = user?.email || '';
		if (teacherSubjectsInput)
			teacherSubjectsInput.value = (user?.subjects || []).join(', ');

		if (studentClassSelect) {
			const classes = safeJsonParse(
				JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')),
				[],
			).filter((cls) => {
				if (!isTeacherUser) return true;
				const teacherClassIds = getTeacherClassIds();
				return teacherClassIds.includes(cls.id);
			});
			studentClassSelect.innerHTML =
				'<option value="">Select class</option>' +
				classes
					.map(
						(c) =>
							`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`,
					)
					.join('');
			if (user?.classId) studentClassSelect.value = user.classId;
			if (!user?.classId && classes.length === 1) {
				studentClassSelect.value = classes[0].id;
			}
		}

		const teacherClassList = document.getElementById('teacherClassList');
		if (teacherClassList) {
			const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
			// Use the app-wide custom checkbox pattern (.custom-checkbox +
			// .custom-checkmark from styles.css) so the box is actually visible.
			// The native input stays zero-sized and is toggled by the
			// makeCheckboxItemsClickable() label handler in admin-main.js.
			const assignedClassIds = Array.isArray(user?.classIds)
				? user.classIds
				: getTeacherClassAssignments()[user?.id] || [];
			teacherClassList.innerHTML = classes
				.map((c) => {
					const checked = assignedClassIds.includes(c.id) ? 'checked' : '';
					return `
            <label class="checkbox-list-item">
                <div class="custom-checkbox-container">
                    <input type="checkbox" class="custom-checkbox" value="${escapeHtml(c.id)}" ${checked}>
                    <span class="custom-checkmark" aria-hidden="true"></span>
                </div>
                <span class="checkbox-label">${escapeHtml(c.name)}</span>
            </label>
          `;
				})
				.join('');
		}

		updateUserRoleFields();
	}

	function updateUserRoleFields() {
		const roleSelect = document.getElementById('userRole');
		const teacherFields = document.getElementById('teacherFields');
		const studentFields = document.getElementById('studentFields');
		if (!roleSelect) return;

		const role = roleSelect.value;
		if (teacherFields) {
			teacherFields.style.display = role === ROLE_TEACHER ? 'block' : 'none';
		}
		if (studentFields) {
			studentFields.style.display = role === ROLE_STUDENT ? 'block' : 'none';
		}
	}

	function openUserModal(userId) {
		const modal = document.getElementById('userModal');
		if (!modal) return;
		let user = null;
		if (userId) {
			const users = getUsers();
			user = users.find((u) => u.id === userId) || null;
			if (user && !canManageUser(user) && !isAdmin()) {
				showToast('Access denied', 'error');
				return;
			}
		}
		populateUserForm(user);
		modal.style.display = 'flex';
		setTimeout(() => modal.classList.add('active'), 10);
	}

	function closeUserModal() {
		const modal = document.getElementById('userModal');
		if (!modal) return;
		modal.style.display = 'none';
		modal.classList.remove('active');
	}

	async function saveUserForm() {
		const form = document.getElementById('userForm');
		if (!form) return;
		const users = getUsers();
		const existingUserId = form.dataset.userId || '';
		const existingUser = existingUserId
			? users.find((u) => u.id === existingUserId)
			: null;

		const nameInput = document.getElementById('userName');
		const usernameInput = document.getElementById('userUsername');
		const roleSelect = document.getElementById('userRole');
		const statusSelect = document.getElementById('userStatus');
		const passwordInput = document.getElementById('userPassword');

		const name = nameInput ? nameInput.value.trim() : '';
		const username = usernameInput ? usernameInput.value.trim() : '';
		let role = roleSelect ? roleSelect.value : ROLE_STUDENT;
		const status = statusSelect ? statusSelect.value : 'active';
		const password = passwordInput ? passwordInput.value : '';

		if (!name || !username) {
			showToast('Name and username are required', 'error');
			return;
		}

		if (!existingUser && !password) {
			showToast(
				'Password is required for a new account (blank is only allowed when editing)',
				'error',
			);
			return;
		}

		const duplicate = users.find(
			(u) =>
				u.username?.toLowerCase() === username.toLowerCase() &&
				u.id !== existingUserId,
		);
		if (duplicate) {
			showToast('Username already exists', 'error');
			return;
		}

		const isTeacherUser = isTeacher();
		if (isTeacherUser) {
			role = ROLE_STUDENT;
		}

		let updatedUser = normalizeUser({
			...existingUser,
			name,
			username,
			role,
			status,
		});

		if (password) {
			updatedUser.passwordHash = await hashPassword(password);
		} else if (existingUser?.passwordHash) {
			updatedUser.passwordHash = existingUser.passwordHash;
		}

		if (role === ROLE_TEACHER) {
			const teacherClassList = document.getElementById('teacherClassList');
			if (teacherClassList) {
				const selected = Array.from(
					teacherClassList.querySelectorAll('input[type="checkbox"]:checked'),
				).map((el) => el.value);
				updatedUser.classIds = selected;
			}

			// Teacher/staff profile: numero, phone, email, subjects.
			const numeroInput = document.getElementById('teacherNumeroField');
			const phoneInput = document.getElementById('teacherPhoneField');
			const emailInput = document.getElementById('teacherEmailField');
			const subjectsInput = document.getElementById('teacherSubjectsField');
			updatedUser.numero = numeroInput ? numeroInput.value.trim() : '';
			updatedUser.studentNumber = updatedUser.numero;
			updatedUser.phone = phoneInput ? phoneInput.value.trim() : '';
			updatedUser.email = emailInput ? emailInput.value.trim() : '';
			updatedUser.subjects = (subjectsInput ? subjectsInput.value : '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		} else {
			updatedUser.classIds = [];
			updatedUser.numero = '';
			updatedUser.phone = '';
			updatedUser.email = '';
			updatedUser.subjects = [];
		}

		if (role === ROLE_STUDENT) {
			const studentNumberInput = document.getElementById('studentNumberField');
			const studentClassSelect = document.getElementById('studentClassSelect');
			const studentNumber = studentNumberInput
				? studentNumberInput.value.trim()
				: '';
			const classId = studentClassSelect ? studentClassSelect.value : '';

			if (!studentNumber || !classId) {
				showToast(
					!studentNumber
						? 'Student number is required for a student account'
						: 'A class is required for a student account',
					'error',
				);
				return;
			}

			if (isTeacherUser) {
				const allowedClassIds = getTeacherClassIds();
				if (!allowedClassIds.includes(classId)) {
					showToast('You can only assign students to your classes', 'error');
					return;
				}
			}

			updatedUser.studentNumber = studentNumber;
			updatedUser.classId = classId;

			const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
			const classMatch = classes.find((c) => c.id === classId);
			updatedUser.className = classMatch ? classMatch.name : '';
		} else {
			// Teachers keep their staff numero (set in the teacher branch
			// above); only the student-specific class linkage is cleared.
			updatedUser.studentNumber = role === ROLE_TEACHER ? updatedUser.numero : '';
			updatedUser.classId = '';
			updatedUser.className = '';
		}

		if (existingUser) {
				const idx = users.findIndex((u) => u.id === existingUserId);
				if (idx !== -1 && !canManageUser(users[idx]) && !isAdmin()) {
					showToast('Access denied', 'error');
					return;
				}
				users[idx] = updatedUser;
			} else {
				users.push(updatedUser);
			}

			// ── Persist to the backend FIRST, then mirror locally ───────────────
			// The legacy path used to write only localStorage via saveUsers(); the
			// DB never saw the new user, so a student login afterwards wouldn't
			// find the account. We now hit POST/PATCH /api/v1/users directly and
			// only fall back to localStorage on explicit network failure.
			const payload = {
				username: updatedUser.username,
				name: updatedUser.name,
				role: updatedUser.role,
				status: updatedUser.status || 'active',
			};
			if (password) payload.password = password;
			if (updatedUser.classId) payload.class_id = updatedUser.classId;
			if (updatedUser.studentNumber) payload.numero = updatedUser.studentNumber;
			// Teacher/staff contacts — sent for every role (null clears them
			// server-side; students/admins simply have no values).
			payload.email = updatedUser.email || null;
			payload.phone = updatedUser.phone || null;
			payload.subjects = updatedUser.subjects || [];

			let savedToServer = false;
			if (window.API && typeof window.API.create === 'function') {
				try {
					let serverUser = null;
					if (existingUser) {
						serverUser = await window.API.update('users', existingUserId, payload);
					} else {
						serverUser = await window.API.create('users', payload);
					}
					if (serverUser && serverUser.id) {
						// Adopt the server's canonical shape (snake_case) so the
						// local cache matches what bootstrap will return next time.
						updatedUser.id = serverUser.id;
						updatedUser.classId = serverUser.class_id || updatedUser.classId || '';
						updatedUser.studentNumber = serverUser.numero || updatedUser.studentNumber || '';
						updatedUser.email = serverUser.email || '';
						updatedUser.phone = serverUser.phone || '';
						updatedUser.subjects = Array.isArray(serverUser.subjects)
							? serverUser.subjects
							: updatedUser.subjects || [];
						updatedUser.createdAt = serverUser.created_at || updatedUser.createdAt;
						updatedUser.updatedAt = serverUser.updated_at || updatedUser.updatedAt;
						// Replace any local stub with the server-authoritative row.
						const i = users.findIndex((u) => u.id === updatedUser.id || u.username === updatedUser.username);
						if (i !== -1) users[i] = updatedUser;
						savedToServer = true;
					}

					// Teacher class assignments have no User column — persist
					// them through the settings table so they survive a DB
					// round trip (bootstrap rehydrates user.classIds from the
					// same key). Only admins reach here: teachers can't edit
					// teacher rows.
					if (role === ROLE_TEACHER && Array.isArray(updatedUser.classIds)) {
						try {
							const settingsRepo =
								window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
							let assignments = {};
							if (settingsRepo && settingsRepo.getValue_sync) {
								const raw = settingsRepo.getValue_sync('settings', {});
								const row = Array.isArray(raw?.settings)
									? raw.settings.find(
											(s) => s && s.key === 'teacherClassAssignments',
										)
									: null;
								if (row?.value) {
									try {
										assignments = JSON.parse(row.value) || {};
									} catch (_) {}
								}
							}
							assignments[updatedUser.id] = updatedUser.classIds;
							const serialized = JSON.stringify(assignments);
							if (window.API && typeof window.API.update === 'function') {
								// PATCH /settings/teacherClassAssignments — value is a
								// string per SettingUpdateSchema.
								await window.API.update(
									'settings',
									'teacherClassAssignments',
									{
										key: 'teacherClassAssignments',
										value: serialized,
										visibility: 'admin',
									},
								);
							}
							// Mirror locally so the modal shows the right state
							// before the next bootstrap.
							localStorage.setItem(
								'quizTeacherClassAssignments',
								serialized,
							);
						} catch (assignmentErr) {
							console.warn(
								'[auth] teacher class assignments save failed:',
								assignmentErr,
							);
						}
					}
				} catch (apiErr) {
					console.warn('[auth] API save user failed:', apiErr);
					showToast(
						'Failed to save user to server: ' + (apiErr?.message || 'network error'),
						'error',
					);
					// Do NOT save to localStorage on API failure — that would be a
					// lie the user only discovers later when the data isn't there.
					return;
				}
			}

			saveUsers(users);
			syncStudentToClasses(updatedUser, existingUser);
			if (savedToServer && typeof window.syncUsersToClients === 'function' && isAdmin()) {
				window.syncUsersToClients();
			}
			closeUserModal();
			renderUsersTable();
			showToast('User saved successfully', 'success');
		}

	async function toggleUserStatus(userId) {
		if (!userId) return;
		const users = getUsers();
		const user = users.find((u) => u.id === userId);
		if (!user) return;
		if (!canManageUser(user) && !isAdmin()) {
			showToast('Access denied', 'error');
			return;
		}

		if (user.role === ROLE_ADMIN) {
			const adminCount = users.filter((u) => u.role === ROLE_ADMIN).length;
			if (adminCount <= 1 && user.status === 'active') {
				showToast('At least one admin account must remain active', 'error');
				return;
			}
		}

		user.status = user.status === 'disabled' ? 'active' : 'disabled';
			user.updatedAt = new Date().toISOString();

			// Persist the status flip to the backend. The backend User.status
			// enum is {active, inactive, suspended}; the legacy UI uses 'disabled',
			// so translate before sending.
			if (window.API && typeof window.API.update === 'function') {
				try {
					const apiStatus = user.status === 'disabled' ? 'suspended' : 'active';
					await window.API.update('users', userId, { status: apiStatus });
				} catch (apiErr) {
					console.warn('[auth] API toggle status failed:', apiErr);
					showToast(
						'Failed to update status on server: ' + (apiErr?.message || 'network error'),
						'error',
					);
					return; // don't touch localStorage either — keep the two in sync
				}
			}

			saveUsers(users);
			if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
				window.syncUsersToClients();
			}
			renderUsersTable();
			showToast(
				`User ${user.status === 'disabled' ? 'suspended' : 'activated'}`,
				'success',
			);
		}

		async function deleteUser(userId) {
			if (!userId) return;
			const users = getUsers();
			const user = users.find((u) => u.id === userId);
			if (!user) return;
			if (!canManageUser(user) && !isAdmin()) {
				showToast('Access denied', 'error');
				return;
			}
			if (user.role === ROLE_ADMIN) {
				const adminCount = users.filter((u) => u.role === ROLE_ADMIN).length;
				if (adminCount <= 1) {
					showToast('At least one admin account is required', 'error');
					return;
				}
			}

			if (confirm(`Delete user "${user.name || user.username}"?`)) {
				// Persist the delete to the backend first; only drop local state
				// after the server has confirmed the row is gone.
				if (window.API && typeof window.API.remove === 'function') {
					try {
						await window.API.remove('users', userId);
					} catch (apiErr) {
						console.warn('[auth] API delete user failed:', apiErr);
						showToast(
							'Failed to delete user on server: ' + (apiErr?.message || 'network error'),
							'error',
						);
						return;
					}
				}

				const filtered = users.filter((u) => u.id !== userId);
				saveUsers(filtered);
				if (typeof window.syncUsersToClients === 'function' && isAdmin()) {
					window.syncUsersToClients();
				}
				if (user.role === ROLE_STUDENT && user.classId) {
					const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
					let changed = false;
					const target = classes.find((c) => c.id === user.classId);
					if (target && Array.isArray(target.students)) {
						const before = target.students.length;
						target.students = target.students.filter(
							(s) => String(s.number) !== String(user.studentNumber),
						);
						if (before !== target.students.length) changed = true;
					}
					if (changed) {
						window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);
					}
				}
				renderUsersTable();
				showToast('User deleted', 'success');
			}
		}

		// ── Pending student imports (teacher-staged, admin-confirmed) ───────────
	// Teachers can prepare CSV/JSON student imports for their own classes, but
	// nothing materializes until an admin confirms the request — mirroring the
	// account-requests review flow.

	function getPendingImports() {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		return r
			? r.getValue_sync('pending_imports', [])
			: safeJsonParse(localStorage.getItem(PENDING_IMPORTS_KEY), []);
	}

	function savePendingImports(imports) {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		if (r) {
			r.setAll_sync('pending_imports', imports);
		} else {
			localStorage.setItem(PENDING_IMPORTS_KEY, JSON.stringify(imports));
		}
	}

	function stagePendingImport({ classId, students, sourceFileName }) {
		const roster = dedupeStudentRoster(students || []);
		if (!roster.length) {
			showToast('No students found in file', 'error');
			return null;
		}
		const className = resolveClassNameById(classId);
		if (!className) {
			showToast('Selected class not found', 'error');
			return null;
		}

		const imports = getPendingImports();
		const request = {
			id:
				typeof generateUUID === 'function'
					? generateUUID()
					: `pi-${Date.now()}`,
			type: 'pending_import',
			createdAt: new Date().toISOString(),
			status: 'pending',
			teacherId: currentUser?.id || '',
			teacherName: currentUser?.name || currentUser?.username || '',
			classId: String(classId),
			className,
			sourceFileName: String(sourceFileName || ''),
			studentCount: roster.length,
			students: roster.map((s) => ({ number: s.number, name: s.name })),
			reviewerId: '',
			reviewedAt: '',
			reviewNote: '',
		};
		imports.unshift(request);
		savePendingImports(imports);

		if (typeof logActivity === 'function') {
			logActivity(
				'pending_import',
				`${request.teacherName || 'Teacher'} staged ${roster.length} student import`,
				'requested',
				{ importId: request.id, classId, className },
			);
		}
		if (typeof window.addAdminNotification === 'function') {
			window.addAdminNotification({
				type: 'pending_import',
				message: `${request.teacherName || 'A teacher'} staged an import of ${roster.length} student(s) for ${className}`,
				data: { importId: request.id, classId, className },
			});
		}
		if (typeof window.refreshPendingImportsBadge === 'function') {
			window.refreshPendingImportsBadge();
		}
		return request;
	}

	async function applyPendingImport(importId) {
		if (!isAdmin()) {
			showToast('Only admins can confirm staged imports', 'error');
			return null;
		}
		const imports = getPendingImports();
		const request = imports.find((entry) => entry.id === importId);
		if (!request || request.status !== 'pending') return null;

		const classes = safeJsonParse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')),
			[],
		);
		const targetClass = classes.find(
			(cls) => String(cls.id) === String(request.classId),
		);
		if (!targetClass) {
			request.status = 'rejected';
			request.reviewNote = 'Class no longer exists';
			request.reviewedAt = new Date().toISOString();
			savePendingImports(imports);
			showToast('Import rejected: class no longer exists', 'error');
			return null;
		}

		const incomingRoster = dedupeStudentRoster(request.students || []);
		if (!incomingRoster.length) {
			showToast('Staged import has no students', 'error');
			return null;
		}

		const mergedRoster = dedupeStudentRoster([
			...(targetClass.students || []),
			...incomingRoster,
		]);
		targetClass.students = mergedRoster.map((student) => ({
			number: student.number,
			name: student.name,
		}));

		window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);
		await syncClassStudentsFromClassData(targetClass, mergedRoster, {
			removeMissing: false,
		});

		request.status = 'approved';
		request.reviewerId = currentUser?.id || '';
		request.reviewedAt = new Date().toISOString();
		savePendingImports(imports);

		if (typeof window.updateClassList === 'function') {
			window.updateClassList(classes);
		}
		if (typeof window.renderUsersTable === 'function') {
			window.renderUsersTable();
		}
		if (typeof logActivity === 'function') {
			logActivity(
				'pending_import',
				`Import of ${incomingRoster.length} student(s) into ${targetClass.name}`,
				'approved',
				{ importId: request.id, classId: targetClass.id },
			);
		}
		return request;
	}

	function rejectPendingImport(importId, note = '') {
		if (!isAdmin()) {
			showToast('Only admins can review staged imports', 'error');
			return null;
		}
		const imports = getPendingImports();
		const request = imports.find((entry) => entry.id === importId);
		if (!request || request.status !== 'pending') return null;
		request.status = 'rejected';
		request.reviewNote = note;
		request.reviewerId = currentUser?.id || '';
		request.reviewedAt = new Date().toISOString();
		savePendingImports(imports);
		if (typeof logActivity === 'function') {
			logActivity(
				'pending_import',
				`Staged import for ${request.className}`,
				'rejected',
				{ importId: request.id, classId: request.classId },
			);
		}
		return request;
	}

	function renderPendingImports() {
		const container = document.getElementById('pendingImportsList');
		if (!container) return;
		const imports = getPendingImports();
		const pending = imports.filter(
			(entry) => String(entry.status || 'pending') === 'pending',
		);

		if (typeof window.refreshPendingImportsBadge === 'function') {
			window.refreshPendingImportsBadge();
		}

		if (!pending.length) {
			container.innerHTML =
				'<div class="empty-state">No staged imports waiting for confirmation.</div>';
			return;
		}

		container.innerHTML = pending
			.map((req) => {
				const rosterPreview = (req.students || [])
					.slice(0, 5)
					.map(
						(s) =>
							`<span class="pending-import-chip">${escapeHtml(
								String(s.number || ''),
							)} · ${escapeHtml(String(s.name || ''))}</span>`,
					)
					.join('');
				const remaining = (req.students || []).length - 5;
				return `
					<div class="pending-import-card" data-import-id="${escapeHtml(req.id)}">
						<div class="pending-import-main">
							<div>
								<div class="pending-import-title">${escapeHtml(
									req.className || 'Class',
								)} — ${escapeHtml(String(req.studentCount || 0))} student(s)</div>
								<div class="pending-import-meta">
									By ${escapeHtml(req.teacherName || 'Teacher')} · ${new Date(
									req.createdAt,
								).toLocaleString()}
									${req.sourceFileName ? ` · ${escapeHtml(req.sourceFileName)}` : ''}
								</div>
								<div class="pending-import-roster">${rosterPreview}${
									remaining > 0
										? `<span class="pending-import-chip muted">+${remaining} more</span>`
										: ''
								}</div>
							</div>
							<div class="pending-import-actions">
								<button class="btn btn-sm btn-primary" onclick="approvePendingImport('${escapeHtml(req.id)}')">Confirm</button>
								<button class="btn btn-sm btn-danger-soft" onclick="rejectPendingImportUI('${escapeHtml(req.id)}')">Reject</button>
							</div>
						</div>
					</div>
				`;
			})
			.join('');
	}

	function getProfileRequests() {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
			return r ? r.getValue_sync('profile_requests', []) : safeJsonParse(localStorage.getItem(PROFILE_REQUESTS_KEY), []);
		}

		function saveProfileRequests(requests) {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
			if (r) { r.setAll_sync('profile_requests', requests); } else { localStorage.setItem(PROFILE_REQUESTS_KEY, JSON.stringify(requests)); }
		}

		function getAccountRequests() {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
			return r ? r.getValue_sync('account_requests', []) : safeJsonParse(localStorage.getItem(ACCOUNT_REQUESTS_KEY), []);
		}

		function saveAccountRequests(requests) {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
			if (r) { r.setAll_sync('account_requests', requests); } else { localStorage.setItem(ACCOUNT_REQUESTS_KEY, JSON.stringify(requests)); }
		}

	function resolveClassNameById(classId) {
		if (!classId) return '';
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const match = classes.find((cls) => String(cls.id) === String(classId));
		return match ? String(match.name || '') : '';
	}

	function canReviewAccountRequest(request) {
		if (!request) return false;
		if (isAdmin()) return true;
		if (!isTeacher()) return false;
		const classId = String(request.classId || '').trim();
		if (!classId) return false;
		const teacherClassIds = getTeacherClassIds();
		return teacherClassIds.includes(classId);
	}

	async function submitAccountRequest(payload = {}) {
		const fullName = String(payload.fullName || payload.name || '').trim();
		const username = String(payload.username || '').trim();
		const studentNumber = String(payload.studentNumber || '').trim();
		const classId = String(payload.classId || '').trim();
		const note = String(payload.note || '').trim();
		const passwordHash = String(payload.passwordHash || '').trim();
		const plainPassword = String(payload.password || '').trim();
		if (!fullName || !username || !studentNumber || !classId) {
			return { ok: false, message: 'Please complete all required fields' };
		}
		if (!passwordHash && !plainPassword) {
			return { ok: false, message: 'Password is required for account request' };
		}
		const className = resolveClassNameById(classId);
		if (!className) {
			return { ok: false, message: 'Please select a valid class' };
		}

		const users = getUsers();
		const usernameTaken = users.some(
			(user) =>
				String(user.username || '')
					.trim()
					.toLowerCase() === username.toLowerCase(),
		);
		if (usernameTaken) {
			return { ok: false, message: 'Username already exists' };
		}
		const studentNumberTaken = users.some(
			(user) =>
				user.role === ROLE_STUDENT &&
				String(user.studentNumber || '').trim() === studentNumber,
		);
		if (studentNumberTaken) {
			return { ok: false, message: 'Student number already exists' };
		}

		const requests = getAccountRequests();
		const pendingDuplicate = requests.find(
			(request) =>
				String(request.status || 'pending') === 'pending' &&
				String(request.username || '')
					.trim()
					.toLowerCase() === username.toLowerCase(),
		);
		if (pendingDuplicate) {
			return {
				ok: false,
				message: 'An account request with this username is already pending',
			};
		}
		const pendingNumberDuplicate = requests.find(
			(request) =>
				String(request.status || 'pending') === 'pending' &&
				String(request.studentNumber || '').trim() === studentNumber,
		);
		if (pendingNumberDuplicate) {
			return {
				ok: false,
				message:
					'An account request with this student number is already pending',
			};
		}

		const hashedPassword = passwordHash || (await hashPassword(plainPassword));

		// ── Backend-first: submit to the API so the request lands in the DB ──
		// The account-requests endpoint is public + rate-limited; the server
		// bcrypts the plaintext password itself (never send our client hash —
		// it's not a bcrypt hash the server can recognize).
		if (window.API && typeof window.API.raw === 'function') {
			try {
				const created = await window.API.raw('POST', '/account-requests', {
					username,
					full_name: fullName,
					student_number: studentNumber,
					class_id: classId,
					class_name: className,
					password: plainPassword || '',
					note,
				});
				// Local mirror so the admin queue UI refreshes from cache too.
				const requests = getAccountRequests();
				requests.unshift({
					id: created.id,
					type: 'account_request',
					createdAt: created.created_at || new Date().toISOString(),
					status: 'pending',
					fullName,
					username,
					studentNumber,
					classId,
					className,
					passwordHash: hashedPassword,
					note,
					reviewerId: '',
					reviewedAt: '',
					reviewNote: '',
					createdUserId: '',
				});
				saveAccountRequests(requests);

				if (typeof logActivity === 'function') {
					logActivity(
						'account_request',
						`${fullName} account request`,
						'requested',
						{ requestId: created.id, username, studentNumber, classId, className },
					);
				}
				if (typeof window.addAdminNotification === 'function') {
					window.addAdminNotification({
						type: 'account_request',
						message: `${fullName} requested a new student account`,
						data: { requestId: created.id, username, classId },
					});
				}
				return { ok: true, request: created };
			} catch (err) {
				return { ok: false, message: err && err.message ? err.message : 'Account request failed' };
			}
		}

		// ── Legacy fallback (API not loaded): localStorage only ─────────────
		const request = {
			id: typeof generateUUID === 'function' ? generateUUID() : `${Date.now()}`,
			type: 'account_request',
			createdAt: new Date().toISOString(),
			status: 'pending',
			fullName,
			username,
			studentNumber,
			classId,
			className,
			passwordHash: hashedPassword,
			note,
			reviewerId: '',
			reviewedAt: '',
			reviewNote: '',
			createdUserId: '',
		};

		requests.unshift(request);
		saveAccountRequests(requests);

		if (typeof logActivity === 'function') {
			logActivity(
				'account_request',
				`${fullName} account request`,
				'requested',
				{
					requestId: request.id,
					username,
					studentNumber,
					classId,
					className,
				},
			);
		}
		if (typeof window.addAdminNotification === 'function') {
			window.addAdminNotification({
				type: 'account_request',
				message: `${fullName} requested a new student account`,
				data: { requestId: request.id, username, classId },
			});
		}

		return { ok: true, request };
	}

	async function approveAccountRequest(requestId, reviewerId, note = '') {
		const requests = getAccountRequests();
		const request = requests.find((entry) => entry.id === requestId);
		if (!request || request.status !== 'pending') return null;
		if (!canReviewAccountRequest(request)) {
			showToast('Access denied', 'error');
			return null;
		}

		const users = getUsers();
		const existingByUsername = findUserByUsername(users, request.username);
		if (existingByUsername) {
			showToast('Username already exists', 'error');
			return null;
		}
		const existingByNumber = users.find(
			(user) =>
				user.role === ROLE_STUDENT &&
				String(user.studentNumber || '') ===
					String(request.studentNumber || ''),
		);
		if (existingByNumber) {
			showToast('Student number already exists', 'error');
			return null;
		}

		// ── Backend-first: the server materializes the User + marks approved ──
		if (window.API && typeof window.API.raw === 'function' && request.id) {
			try {
				const result = await window.API.raw('POST', '/account-requests/' + encodeURIComponent(request.id) + '/approve', { note });
				const newUserId = result && result.userId;
				request.status = 'approved';
				request.reviewNote = note;
				request.reviewerId = reviewerId || '';
				request.reviewedAt = result?.request?.reviewed_at || new Date().toISOString();
				request.createdUserId = newUserId || '';
				saveAccountRequests(requests);

				// Mirror the new user into the local cache so the admin table refreshes.
				if (newUserId) {
					const classId = String(request.classId || '').trim();
					const className = resolveClassNameById(classId) || String(request.className || '');
					const newUser = normalizeUser({
						id: newUserId,
						name: request.fullName,
						username: request.username,
						role: ROLE_STUDENT,
						status: 'active',
						studentNumber: request.studentNumber,
						classId,
						className,
					});
					newUser.passwordHash = request.passwordHash || '';
					newUser.createdAt = new Date().toISOString();
					newUser.updatedAt = newUser.createdAt;
					users.push(newUser);
					saveUsers(users);
					syncStudentToClasses(newUser, null);
				}

				if (typeof logActivity === 'function') {
					logActivity('account_request', `${request.fullName} account request`, 'approved', {
						requestId: request.id, username: request.username,
						studentNumber: request.studentNumber, classId: request.classId,
						className: request.className, userId: newUserId || '',
						reviewerId: reviewerId || '', reviewNote: note,
					});
				}
				if (typeof window.addAdminNotification === 'function') {
					window.addAdminNotification({
						type: 'account_request',
						message: `Account request approved for ${request.fullName}`,
						data: { requestId: request.id, username: request.username, classId: request.classId, userId: newUserId },
					});
				}
				return request;
			} catch (err) {
				showToast((err && err.message) || 'Approval failed', 'error');
				return null;
			}
		}

		// ── Legacy fallback (API not loaded) ────────────────────────────────
		const classId = String(request.classId || '').trim();
		const className =
			resolveClassNameById(classId) || String(request.className || '');
		const newUser = normalizeUser({
			name: request.fullName,
			username: request.username,
			role: ROLE_STUDENT,
			status: 'active',
			studentNumber: request.studentNumber,
			classId,
			className,
		});
		newUser.passwordHash = request.passwordHash || '';
		if (!newUser.passwordHash) {
			showToast('Invalid account request password data', 'error');
			return null;
		}
		newUser.createdAt = new Date().toISOString();
		newUser.updatedAt = newUser.createdAt;
		users.push(newUser);
		saveUsers(users);
		syncStudentToClasses(newUser, null);

		request.status = 'approved';
		request.reviewNote = note;
		request.reviewerId = reviewerId || '';
		request.reviewedAt = new Date().toISOString();
		request.createdUserId = newUser.id;
		saveAccountRequests(requests);

		// Log account approval activity
		if (typeof logActivity === 'function') {
			logActivity(
				'account_request',
				`${request.fullName} account request`,
				'approved',
				{
					requestId: request.id,
					username: request.username,
					studentNumber: request.studentNumber,
					classId: request.classId,
					className: request.className,
					userId: newUser.id,
					reviewerId: reviewerId || '',
					reviewNote: note,
				},
			);
		}

		// Send admin notification
		if (typeof window.addAdminNotification === 'function') {
			window.addAdminNotification({
				type: 'account_request',
				message: `Account request approved for ${request.fullName}`,
				data: {
					requestId: request.id,
					username: request.username,
					classId: request.classId,
					userId: newUser.id,
				},
			});
		}

		return request;
	}

	async function rejectAccountRequest(requestId, reviewerId, note = '') {
		const requests = getAccountRequests();
		const request = requests.find((entry) => entry.id === requestId);
		if (!request || request.status !== 'pending') return null;
		if (!canReviewAccountRequest(request)) {
			showToast('Access denied', 'error');
			return null;
		}

		// ── Backend-first ────────────────────────────────────────────────────
		if (window.API && typeof window.API.raw === 'function' && request.id) {
			try {
				await window.API.raw('POST', '/account-requests/' + encodeURIComponent(request.id) + '/reject', { note });
			} catch (err) {
				showToast((err && err.message) || 'Rejection failed', 'error');
				return null;
			}
		}

		request.status = 'rejected';
		request.reviewNote = note;
		request.reviewerId = reviewerId || '';
		request.reviewedAt = new Date().toISOString();
		saveAccountRequests(requests);

		// Log account rejection activity
		if (typeof logActivity === 'function') {
			logActivity(
				'account_request',
				`${request.fullName} account request`,
				'rejected',
				{
					requestId: request.id,
					username: request.username,
					studentNumber: request.studentNumber,
					classId: request.classId,
					className: request.className,
					reviewerId: reviewerId || '',
					reviewNote: note,
				},
			);
		}

		// Send admin notification
		if (typeof window.addAdminNotification === 'function') {
			window.addAdminNotification({
				type: 'account_request',
				message: `Account request rejected for ${request.fullName}`,
				data: { requestId: request.id, username: request.username },
			});
		}

		return request;
	}

	async function submitProfileRequest(payload) {
		if (!payload || !payload.userId) return null;
		const displayName =
			payload.currentSnapshot?.name || payload.changes?.name || 'Student';

		// ── Backend-first: persist to ProfileRequest table ──────────────────
		if (window.API && typeof window.API.create === 'function') {
			try {
				const created = await window.API.create('profile-requests', {
					changes: payload.changes || {},
					avatar: payload.avatar || '',
					note: payload.note || '',
					snapshot: payload.currentSnapshot || {},
				});
				// Mirror into the local cache so the queue UI refreshes.
				const requests = getProfileRequests();
				const request = {
					id: created.id,
					userId: created.user_id || payload.userId,
					createdAt: created.created_at || new Date().toISOString(),
					status: created.status || 'pending',
					changes: payload.changes || {},
					avatar: created.avatar ?? (payload.avatar || ''),
					note: created.note ?? (payload.note || ''),
					currentSnapshot: payload.currentSnapshot || {},
				};
				requests.unshift(request);
				saveProfileRequests(requests);

				let className = payload.currentSnapshot?.className || '';
				if (!className && payload.currentSnapshot?.classId && window.__DI_CONTAINER__?.repo) {
					const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
					const match = classes.find((c) => c.id === payload.currentSnapshot.classId);
					if (match) className = match.name;
				}
				if (typeof logActivity === 'function') {
					logActivity('profile_request', `${displayName} profile update request`, 'requested', {
						requestId: request.id, userId: payload.userId, studentName: displayName,
						studentNumber: payload.currentSnapshot?.studentNumber || '', className: className,
					});
				}
				if (typeof window.addAdminNotification === 'function') {
					window.addAdminNotification({
						type: 'profile_request',
						message: `${displayName} sent a profile update request`,
						data: { requestId: request.id, userId: payload.userId },
					});
				}
				return request;
			} catch (err) {
				console.warn('[auth] profile-request API call failed, falling back to local:', err);
			}
		}

		// ── Legacy fallback (API not loaded or request failed) ──────────────
		const requests = getProfileRequests();
		const request = {
			id: typeof generateUUID === 'function' ? generateUUID() : `${Date.now()}`,
			userId: payload.userId,
			createdAt: new Date().toISOString(),
			status: 'pending',
			changes: payload.changes || {},
			avatar: payload.avatar || '',
			note: payload.note || '',
			currentSnapshot: payload.currentSnapshot || {},
		};
		requests.unshift(request);
		saveProfileRequests(requests);
		let className = payload.currentSnapshot?.className || '';
		if (!className && payload.currentSnapshot?.classId && window.__DI_CONTAINER__?.repo) {
			const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
			const match = classes.find(
				(c) => c.id === payload.currentSnapshot.classId,
			);
			if (match) className = match.name;
		}
		if (typeof logActivity === 'function') {
			logActivity(
				'profile_request',
				`${displayName} profile update request`,
				'requested',
				{
					requestId: request.id,
					userId: payload.userId,
					studentName: displayName,
					studentNumber: payload.currentSnapshot?.studentNumber || '',
					className: className,
				},
			);
		}
		if (typeof window.addAdminNotification === 'function') {
			window.addAdminNotification({
				type: 'profile_request',
				message: `${displayName} sent a profile update request`,
				data: { requestId: request.id, userId: payload.userId },
			});
		}
		return request;
	}

	async function updateProfileRequest(requestId, userId, payload = {}) {
		const targetId = String(requestId || '').trim();
		const actorId = String(userId || '').trim();
		if (!targetId || !actorId) return null;
		const requests = getProfileRequests();
		const index = requests.findIndex((entry) => entry.id === targetId);
		if (index < 0) return null;
		const existing = requests[index];
		if (String(existing.userId || '').trim() !== actorId) return null;
		if (String(existing.status || '').toLowerCase() !== 'pending') return null;

		// ── Backend-first ────────────────────────────────────────────────────
		if (window.API && typeof window.API.update === 'function') {
			try {
				await window.API.update('profile-requests', targetId, {
					changes: payload.changes != null ? payload.changes : undefined,
					avatar: Object.prototype.hasOwnProperty.call(payload, 'avatar') ? (payload.avatar || '') : undefined,
					note: Object.prototype.hasOwnProperty.call(payload, 'note') ? (payload.note || '') : undefined,
					snapshot: payload.currentSnapshot != null ? payload.currentSnapshot : undefined,
				});
			} catch (err) {
				console.warn('[auth] profile-request update failed:', err);
				return null;
			}
		}

		requests[index] = {
			...existing,
			changes: payload.changes || existing.changes || {},
			avatar: Object.prototype.hasOwnProperty.call(payload, 'avatar')
				? payload.avatar || ''
				: existing.avatar || '',
			note: Object.prototype.hasOwnProperty.call(payload, 'note')
				? payload.note || ''
				: existing.note || '',
			currentSnapshot:
				payload.currentSnapshot || existing.currentSnapshot || {},
			updatedAt: new Date().toISOString(),
		};
		saveProfileRequests(requests);
		return requests[index];
	}

	async function deleteProfileRequest(requestId, userId) {
		const targetId = String(requestId || '').trim();
		const actorId = String(userId || '').trim();
		if (!targetId || !actorId) return null;
		const requests = getProfileRequests();
		const index = requests.findIndex((entry) => entry.id === targetId);
		if (index < 0) return null;
		const existing = requests[index];
		if (String(existing.userId || '').trim() !== actorId) return null;
		if (String(existing.status || '').toLowerCase() !== 'pending') return null;

		// ── Backend-first ────────────────────────────────────────────────────
		if (window.API && typeof window.API.remove === 'function') {
			try {
				await window.API.remove('profile-requests', targetId);
			} catch (err) {
				console.warn('[auth] profile-request delete failed:', err);
				return null;
			}
		}

		const [removed] = requests.splice(index, 1);
		saveProfileRequests(requests);
		return removed || null;
	}

	function updateUserById(userId, updates = {}) {
		const users = getUsers();
		const index = users.findIndex((u) => u.id === userId);
		if (index === -1) return null;
		const existing = users[index];
		const next = normalizeUser({ ...existing, ...updates });
		next.passwordHash = existing.passwordHash;
		next.createdAt = existing.createdAt || next.createdAt;
		users[index] = next;
		saveUsers(users);
		return next;
	}

	async function updateUserPassword(userId, currentPassword, newPassword) {
		const users = getUsers();
		const user = users.find((u) => u.id === userId);
		if (!user) {
			return { ok: false, message: 'User not found' };
		}
		const currentHash = await hashPassword(currentPassword || '');
		if (currentHash !== user.passwordHash) {
			return { ok: false, message: 'Current password is incorrect' };
		}
		user.passwordHash = await hashPassword(newPassword || '');
		user.updatedAt = new Date().toISOString();
		saveUsers(users);
		return { ok: true };
	}

	function approveProfileRequest(requestId, reviewerId, note = '') {
		const requests = getProfileRequests();
		const request = requests.find((r) => r.id === requestId);
		if (!request || request.status !== 'pending') return null;

		const users = getUsers();
		const user = users.find((u) => u.id === request.userId);
		if (!user) {
			request.status = 'rejected';
			request.reviewNote = 'User not found';
			request.reviewedAt = new Date().toISOString();
			saveProfileRequests(requests);
			return null;
		}

		if (!canManageUser(user) && !isAdmin()) {
			showToast('Access denied', 'error');
			return null;
		}

		const duplicate = request.changes?.username
			? users.find(
					(u) =>
						u.username?.toLowerCase() ===
							String(request.changes.username).toLowerCase() &&
						u.id !== user.id,
				)
			: null;
		if (duplicate) {
			showToast('Username already exists', 'error');
			return null;
		}

		const previousUser = { ...user };
		if (request.changes?.name) user.name = request.changes.name;
		if (request.changes?.studentNumber)
			user.studentNumber = request.changes.studentNumber;
		if (request.changes?.username) user.username = request.changes.username;
		if (request.changes?.classId) user.classId = request.changes.classId;
		if (Object.prototype.hasOwnProperty.call(request.changes || {}, 'email')) {
			user.email = request.changes.email || '';
		}
		if (request.avatar) user.avatar = request.avatar;

		if (user.classId) {
			const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
			const match = classes.find((c) => c.id === user.classId);
			user.className = match ? match.name : user.className;
		}

		user.updatedAt = new Date().toISOString();
		saveUsers(users);
		syncStudentToClasses(user, previousUser);

		request.status = 'approved';
		request.reviewNote = note;
		request.reviewerId = reviewerId || '';
		request.reviewedAt = new Date().toISOString();
		saveProfileRequests(requests);
		return request;
	}

	function rejectProfileRequest(requestId, reviewerId, note = '') {
		const requests = getProfileRequests();
		const request = requests.find((r) => r.id === requestId);
		if (!request || request.status !== 'pending') return null;
		const users = getUsers();
		const user = users.find((u) => u.id === request.userId);
		if (user && !canManageUser(user) && !isAdmin()) {
			showToast('Access denied', 'error');
			return null;
		}
		request.status = 'rejected';
		request.reviewNote = note;
		request.reviewerId = reviewerId || '';
		request.reviewedAt = new Date().toISOString();
		saveProfileRequests(requests);
		return request;
	}

	function renderProfileRequests() {
		const container = document.getElementById('profileRequestsList');
		if (!container) return;
		const requests = getProfileRequests();
		const users = getUsers();
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')), []);
		const classMap = new Map(classes.map((c) => [c.id, c.name]));
		let scopedRequests = requests;
		if (isTeacher()) {
			const teacherClassIds = getTeacherClassIds();
			scopedRequests = requests.filter((req) => {
				const user = users.find((u) => u.id === req.userId);
				const classId = user?.classId || req.currentSnapshot?.classId || '';
				return classId && teacherClassIds.includes(classId);
			});
		}

		if (!scopedRequests.length) {
			container.innerHTML =
				'<div class="empty-state">No profile requests yet.</div>';
			return;
		}

		container.innerHTML = scopedRequests
			.slice(0, 10)
			.map((req) => {
				const user = users.find((u) => u.id === req.userId);
				const name = user?.name || req.currentSnapshot?.name || 'Student';
				const changes = Object.entries(req.changes || {})
					.map(([key, value]) => {
						if (!value) return '';
						const label =
							key === 'studentNumber'
								? 'Student #'
								: key === 'classId'
									? 'Class'
									: key.charAt(0).toUpperCase() + key.slice(1);
						const displayValue =
							key === 'classId' ? classMap.get(value) || value : value;
						return `<span>${escapeHtml(label)}: ${escapeHtml(
							String(displayValue),
						)}</span>`;
					})
					.filter(Boolean)
					.join('');
				return `
				<div class="profile-request-card ${escapeHtml(req.status)}">
					<div class="request-main">
						<div>
							<div class="request-title">${escapeHtml(name)}</div>
							<div class="request-meta">${new Date(req.createdAt).toLocaleString()}</div>
							<div class="request-changes">${changes || '<span>No field changes</span>'}</div>
							${req.note ? `<div class="request-note">${escapeHtml(req.note)}</div>` : ''}
						</div>
						<div class="request-status ${escapeHtml(req.status)}">${escapeHtml(req.status)}</div>
					</div>
					${
						req.avatar
							? `<div class="request-avatar"><img src="${req.avatar}" alt="Profile request" /></div>`
							: ''
					}
					${
						req.status === 'pending'
							? `
						<div class="request-actions">
							<button class="btn btn-primary" onclick="approveProfileRequest('${req.id}')">Approve</button>
							<button class="btn btn-danger-soft" onclick="rejectProfileRequest('${req.id}')">Reject</button>
						</div>
					`
							: req.reviewNote
								? `<div class="request-review-note">${escapeHtml(req.reviewNote)}</div>`
								: ''
					}
				</div>
			`;
			})
			.join('');
	}

	async function checkAuthState() {
		await ensureDefaultAdmin();
		let wrongRoleDetected = null;
		const result = loadSession([ROLE_ADMIN, ROLE_TEACHER], {
			onWrongRole: (role) => {
				wrongRoleDetected = role;
			},
		});
		if (!result) {
			sessionStorage.removeItem('adminLoggedIn');
			// Hard role gate: a student session on the admin portal must not
			// linger here. loadSession already dropped the wrong-role session
			// store; bounce the student to the landing page (their workspace
			// link lives there) instead of parking them on a login modal over
			// admin chrome.
			if (wrongRoleDetected === ROLE_STUDENT) {
				setCurrentUser(null, null);
				window.location.replace('index.html');
				return;
			}
			showAuthModal();
			return;
		}

		// Defense in depth: loadSession can still resolve to a student via a
		// student-like role normalized to ROLE_STUDENT (e.g. 'learner').
		const effectiveRole = getEffectiveUserRole(result.user);
		if (effectiveRole === ROLE_STUDENT) {
			sessionStorage.removeItem(SESSION_STORAGE_KEY);
			sessionStorage.removeItem('adminLoggedIn');
			setCurrentUser(null, null);
			window.location.replace('index.html');
			return;
		}

		setCurrentUser(result.user, result.session);
		sessionStorage.setItem('adminLoggedIn', 'true');
		ensureOwnershipDefaults();
		applyRolePermissions();
		notifyAuthChange();
		hideAuthModal();
	}

	async function checkStudentAuthState() {
		await ensureDefaultAdmin();
		const result = loadSession([ROLE_STUDENT]);
		if (result) {
			setCurrentUser(result.user, result.session);
		} else {
			setCurrentUser(null, null);
		}

		notifyAuthChange();
		applyStudentAuthUI(result ? result.user : null);
	}

	function bindAuthPasswordToggles() {
		document.querySelectorAll('.auth-toggle-password').forEach((toggle) => {
			if (toggle.dataset.bound === 'true') return;
			toggle.dataset.bound = 'true';
			toggle.addEventListener('click', () => {
				const targetId = String(toggle.dataset.target || '').trim();
				if (!targetId) return;
				const input = document.getElementById(targetId);
				if (!input) return;
				const reveal = input.type === 'password';
				input.type = reveal ? 'text' : 'password';
				toggle.textContent = reveal ? 'Hide' : 'Show';
				toggle.setAttribute(
					'aria-label',
					reveal ? 'Hide password' : 'Show password',
				);
				toggle.setAttribute('aria-pressed', reveal ? 'true' : 'false');
			});
		});
	}

	function bindAuthUI() {
		const authForm = document.getElementById('authLoginForm');
		// Skip if legacy-auth-bridge.js has already claimed this form (it routes
		// the login through the real backend instead of localStorage password
		// verification).
		if (authForm && !window.__AUTH_BRIDGE_OWNS_LOGIN__ && authForm.getAttribute('data-bridge-owned') !== 'true') {
			authForm.addEventListener('submit', (e) => {
				e.preventDefault();
				handleLogin(authForm);
			});
		}
		const recoveryToggle = document.getElementById('authRecoveryToggle');
		if (recoveryToggle) {
			recoveryToggle.addEventListener('click', toggleRecoveryPanel);
		}
		const recoveryUnlockForm = document.getElementById('authRecoveryUnlockForm');
		if (recoveryUnlockForm) {
			recoveryUnlockForm.addEventListener('submit', (e) => {
				e.preventDefault();
				verifyRecoveryCodeFromForm(recoveryUnlockForm);
			});
			recoveryUnlockForm
				.querySelector('[data-recovery-action="verify"]')
				?.addEventListener('click', (e) => {
					e.preventDefault();
					verifyRecoveryCodeFromForm(recoveryUnlockForm);
				});
		}
		const recoveryResetForm = document.getElementById('authRecoveryResetForm');
		if (recoveryResetForm) {
			recoveryResetForm.addEventListener('submit', (e) => {
				e.preventDefault();
				resetDashboardPasswordFromForm(recoveryResetForm);
			});
			recoveryResetForm
				.querySelector('[data-recovery-action="reset"]')
				?.addEventListener('click', (e) => {
					e.preventDefault();
					resetDashboardPasswordFromForm(recoveryResetForm);
				});
		}
		setRecoveryPanelMode('closed');

		const studentForm = document.getElementById('studentLoginForm');
		if (studentForm) {
			studentForm.addEventListener('submit', (e) => {
				e.preventDefault();
				handleLogin(studentForm, ROLE_STUDENT);
			});
		}
		const accountRequestForm = document.getElementById(
			'studentAccountRequestForm',
		);
		if (accountRequestForm) {
			accountRequestForm.addEventListener('submit', async (e) => {
				e.preventDefault();
				await handleStudentAccountRequest(accountRequestForm);
			});
		}
		const showRequestBtn = document.getElementById('studentAuthShowRequestBtn');
		if (showRequestBtn) {
			showRequestBtn.addEventListener('click', () => {
				populateStudentAccountRequestClassSelect();
				setStudentAuthMode('request');
			});
		}
		const showSignInBtn = document.getElementById('studentAuthShowSignInBtn');
		if (showSignInBtn) {
			showSignInBtn.addEventListener('click', () => {
				setStudentAuthMode('signin');
			});
		}

		const loginBtn = document.getElementById('studentLoginButton');
		if (loginBtn) {
			loginBtn.addEventListener('click', () => showStudentAuthModal());
		}
		const workspaceLoginBtn = document.getElementById('workspaceLoginButton');
		if (workspaceLoginBtn) {
			workspaceLoginBtn.addEventListener(
				'click',
				populateStudentAccountRequestClassSelect,
			);
		}

		const logoutBtn = document.getElementById('studentLogoutButton');
		if (logoutBtn) {
			logoutBtn.addEventListener('click', () => authLogout());
		}

		const userForm = document.getElementById('userForm');
		if (userForm) {
			userForm.addEventListener('submit', (e) => {
				e.preventDefault();
				saveUserForm();
			});
		}

		const roleSelect = document.getElementById('userRole');
		if (roleSelect) {
			roleSelect.addEventListener('change', updateUserRoleFields);
		}

		const searchInput = document.getElementById('userSearchInput');
		if (searchInput) {
			searchInput.addEventListener('input', () => renderUsersTable());
		}

		const roleFilter = document.getElementById('userRoleFilter');
		if (roleFilter) {
			roleFilter.addEventListener('change', () => renderUsersTable());
		}

		const statusFilter = document.getElementById('userStatusFilter');
		if (statusFilter) {
			statusFilter.addEventListener('change', () => renderUsersTable());
		}

		const classFilter = document.getElementById('userClassFilter');
		if (classFilter) {
			classFilter.addEventListener('change', () => renderUsersTable());
		}

		bindAuthPasswordToggles();
		setStudentAuthMode('signin');

		const usersTable = document.getElementById('usersTable');
		if (usersTable) {
			usersTable.addEventListener('change', (event) => {
				const target = event.target;
				if (!target) return;
				if (target.id === 'usersSelectAll') {
					handleUserSelectAll(target.checked);
					return;
				}
				if (
					target.classList &&
					target.classList.contains('user-select-checkbox')
				) {
					handleUserCheckboxChange(target);
				}
			});
		}
	}

	document.addEventListener('DOMContentLoaded', () => {
		bindAuthUI();
		populateStudentAccountRequestClassSelect();
		if (document.getElementById('authModal')) {
			checkAuthState();
		}
		if (document.getElementById('studentAuthModal')) {
			checkStudentAuthState();
		}
		if (document.getElementById('usersTableBody')) {
			renderUsersTable();
		}
	});

	window.Auth = {
		getUsers,
		saveUsers,
		getUsersForSync,
		applySyncedUsers,
		getCurrentUser,
		getCurrentRole,
		isAdmin,
		isTeacher,
		isStudent,
		isStudentLikeUser,
		getEffectiveUserRole,
		getTeacherClassIds,
		getTeacherAccessSettings,
		getStudentIdentity,
		filterItemsByRole,
		canAccessItem,
		ensureOwnershipDefaults,
		setCurrentUser,
		applyRolePermissions,
		applySchoolBranding,
		refreshSchoolBranding,
		canAccessTab,
		canAccessSettingsTab,
		updateUserById,
		updateUserPassword,
		getProfileRequests,
		submitProfileRequest,
		updateProfileRequest,
		deleteProfileRequest,
		approveProfileRequest,
		rejectProfileRequest,
		getPendingImports,
		stagePendingImport,
		applyPendingImport,
		rejectPendingImport,
		renderPendingImports,
		getAccountRequests,
		submitAccountRequest,
		approveAccountRequest,
		rejectAccountRequest,
		showStudentAuthModal,
		hideStudentAuthModal,
		applyStudentAuthUI,
		setStudentAuthMode,
		syncClassStudentsFromClassData,
		hashText: hashPassword,
		verifyRecoveryCode: verifyRecoveryCodeValue,
	};

	window.checkAuthState = checkAuthState;
	window.checkStudentAuthState = checkStudentAuthState;
	// Student-portal role gate used by legacy-auth-bridge.js after a SaaS
	// login: only student-like accounts may enter the student workspace.
	window.isStudentLikeUser = isStudentLikeUser;
	window.getEffectiveUserRole = getEffectiveUserRole;
	// legacy-auth-bridge.js looks these up as flat window globals after a
	// successful SaaS login. Expose them there (not just under window.Auth) so
	// the post-login path can apply the authed UI and close the modal — without
	// these, the sign-in modal stayed open and the workspace never rendered.
	window.applyStudentAuthUI = applyStudentAuthUI;
	window.hideStudentAuthModal = hideStudentAuthModal;
	window.openUserModal = openUserModal;
	window.closeUserModal = closeUserModal;
	window.saveUserForm = saveUserForm;
	window.deleteUser = deleteUser;
	window.toggleUserStatus = toggleUserStatus;
	window.renderUsersTable = renderUsersTable;
	window.renderProfileRequests = renderProfileRequests;
	window.renderPendingImports = renderPendingImports;
	window.approvePendingImport = async function (importId) {
		const result = await applyPendingImport(importId);
		if (result) {
			showToast('Staged import confirmed and applied', 'success');
			renderPendingImports();
		}
	};
	window.rejectPendingImportUI = function (importId) {
		const result = rejectPendingImport(importId);
		if (result) {
			showToast('Staged import rejected', 'info');
			renderPendingImports();
		}
	};
	window.refreshPendingImportsBadge = function () {
		const badge = document.getElementById('pendingImportsBadge');
		if (!badge) return;
		const pending = getPendingImports().filter(
			(entry) => String(entry.status || 'pending') === 'pending',
		).length;
		badge.textContent = String(pending);
		badge.classList.toggle('hidden', pending === 0);
	};
	window.exportUserData = exportUserData;
	window.importUserData = importUserData;
	window.exportUsersWithClasses = exportUsersWithClasses;
	window.importUsersWithClasses = importUsersWithClasses;
	window.exportTeachersOnly = exportTeachersOnly;
	window.importTeachersOnly = importTeachersOnly;
	window.bulkActivateUsers = bulkActivateUsers;
	window.bulkSuspendUsers = bulkSuspendUsers;
	window.bulkDeleteUsers = bulkDeleteUsers;
	window.handleStudentAuthClose = handleStudentAuthClose;
	window.approveProfileRequest = function (requestId) {
		const reviewerId = currentUser?.id || '';
		const result = approveProfileRequest(requestId, reviewerId);
		if (result) {
			showToast('Profile request approved', 'success');
			renderProfileRequests();
			renderUsersTable();
		}
	};
	window.rejectProfileRequest = function (requestId) {
		const reviewerId = currentUser?.id || '';
		const result = rejectProfileRequest(requestId, reviewerId);
		if (result) {
			showToast('Profile request rejected', 'info');
			renderProfileRequests();
		}
	};
	window.authLogout = authLogout;
})();

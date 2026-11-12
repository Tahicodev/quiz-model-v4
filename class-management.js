// Class Management State
let classes = [];
let currentClassId = null;
let classSortDirection = 'asc';
let classListenersBound = false;

// Initialize class management
function initClassManagement() {
	loadClasses();
	if (window.BulkSelect) {
		window.BulkSelect.register('students', {
			checkboxClass: 'student-checkbox',
			selectAllId: 'selectAllStudents',
			barId: 'bulk-actions-students',
			countId: 'selected-count-students',
			rowSelectedClass: 'question-row-selected',
		});
	}
	updateClassList();
	setupClassEventListeners();

	const sortDirectionButton = document.getElementById('sortClassDirection');
	if (sortDirectionButton) {
		sortDirectionButton.classList.add('desc');
	}
}

function loadClasses() {
	const savedClasses = JSON.stringify(
		window.__DI_CONTAINER__.repo.getAll_sync('classes'),
	);
	classes = savedClasses ? JSON.parse(savedClasses) : [];
}

function saveClasses() {
	// Save classes to localStorage
	window.__DI_CONTAINER__.repo.setAll_sync('classes', classes);

	// Make sure exams have the classes array initialized
	// This doesn't actually update the exam assignments - that's done in saveClassForm
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	let updated = false;

	exams.forEach((exam) => {
		if (!exam.classes) {
			exam.classes = [];
			updated = true;
		}
	});

	// Only save if we made changes
	if (updated) {
		window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);
	}

	// Update Dashboard if available
	if (window.initDashboard) {
		window.initDashboard();
	}

	console.log('Classes saved. Current exams:', exams);
}

function createNewClass() {
	console.log('createNewClass called');
	try {
		currentClassId = null;
		document.getElementById('classModalTitle').textContent = 'Create New Class';
		document.getElementById('classForm').reset();
		openClassModal();
		console.log('createNewClass completed');
	} catch (e) {
		console.error('Error in createNewClass:', e);
	}
}

function openClassModal() {
	const modal = document.getElementById('classModal');
	if (modal) {
		promoteClassModal(modal);
		modal.classList.add('is-open');
		modal.setAttribute('aria-hidden', 'false');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('role', 'dialog');
		document.documentElement.classList.add('modal-open');
		document.body.classList.add('modal-open');
		setTimeout(() => {
			modal.classList.add('active');
			document.getElementById('className')?.focus();
		}, 10);
		console.log('Modal opened:', modal.style.display);
	} else {
		console.error('classModal element not found!');
	}
}

function closeClassModal() {
	const modal = document.getElementById('classModal');
	if (modal) {
		modal.style.setProperty('display', 'none', 'important');
		[
			'position',
			'inset',
			'z-index',
			'opacity',
			'visibility',
			'pointer-events',
		].forEach((property) => modal.style.removeProperty(property));
		modal.classList.remove('active', 'is-open');
		modal.setAttribute('aria-hidden', 'true');
		modal.removeAttribute('aria-modal');
		modal.removeAttribute('role');
		document.documentElement.classList.remove('modal-open');
		document.body.classList.remove('modal-open');
	}
}

function promoteClassModal(modal) {
	if (modal.parentElement !== document.body) {
		document.body.appendChild(modal);
	}

	const profileMenu = document.getElementById('profileMenu');
	if (profileMenu) profileMenu.classList.remove('active');

	modal.style.setProperty('display', 'flex', 'important');
	modal.style.setProperty('position', 'fixed', 'important');
	modal.style.setProperty('inset', '0', 'important');
	// Escalating z-index: every promoted modal used to share one hardcoded
	// value, so any two open modals tied and DOM order decided — opening an
	// assign modal while another promoted modal was up could leave it
	// hidden behind. The most recently opened modal always wins now.
	modal.style.setProperty('z-index', String(nextModalZIndex()), 'important');
	modal.style.setProperty('opacity', '1', 'important');
	modal.style.setProperty('visibility', 'visible', 'important');
	modal.style.setProperty('pointer-events', 'auto', 'important');
}

// Modal stacking order. Monotonic (never reused) and capped at the
// previous hardcoded max, so long sessions can't wrap around.
let modalTopZIndex = 3000;
function nextModalZIndex() {
	modalTopZIndex = Math.min(2147483000, modalTopZIndex + 10);
	return modalTopZIndex;
}

// Generic open/close for the dedicated assign modals: same promotion treatment
// as the main entity modals, plus the modal-open body lock and an optional
// focus target inside the modal.
function openModalLike(modal, focusId) {
	if (!modal) return;
	promoteClassModal(modal);
	modal.classList.add('is-open');
	modal.setAttribute('aria-hidden', 'false');
	modal.setAttribute('aria-modal', 'true');
	modal.setAttribute('role', 'dialog');
	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
	setTimeout(() => {
		modal.classList.add('active');
		// Autofocus only with a fine pointer (see openAssignModalLike):
		// avoids the mobile keyboard jump hiding modal content.
		if (
			focusId &&
			window.matchMedia &&
			window.matchMedia('(pointer: fine)').matches
		) {
			document.getElementById(focusId)?.focus();
		}
	}, 10);
}

function closeModalLike(modal) {
	if (!modal) return;
	modal.style.setProperty('display', 'none', 'important');
	[
		'position',
		'inset',
		'z-index',
		'opacity',
		'visibility',
		'pointer-events',
	].forEach((property) => modal.style.removeProperty(property));
	modal.classList.remove('active', 'is-open');
	modal.setAttribute('aria-hidden', 'true');
	modal.removeAttribute('aria-modal');
	modal.removeAttribute('role');
	document.documentElement.classList.remove('modal-open');
	document.body.classList.remove('modal-open');
}
window.openModalLike = openModalLike;
window.closeModalLike = closeModalLike;

function loadAvailableExams() {
	const savedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const visibleExams = savedExams.filter((exam) =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('exam', exam) : true,
	);
	const container = document.getElementById('availableExams');

	// Get all questions from localStorage
	const allQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');

	container.innerHTML = visibleExams
		.map((exam) => {
			// Get the actual number of questions from the exam's questions array
			const questionCount = exam.questions ? exam.questions.length : 0;

			// Check if the exam has valid questions
			const validQuestions = exam.questions
				? exam.questions.filter((index) => allQuestions[index])
				: [];
			const validQuestionCount = validQuestions.length;
			const hasValidQuestions = validQuestionCount > 0;

			// Create a class for exams with no valid questions
			const examClass = hasValidQuestions
				? 'exam-item'
				: 'exam-item disabled-exam';

			return `
            <div class="${examClass}" data-exam-id="${
							exam.id
						}" onclick="toggleExamSelection(this)">
                <div class="exam-item-details">
                    <div class="exam-name">${escapeHtml(exam.name)}</div>
                    <div class="exam-info">
                        Questions: ${validQuestionCount}/${questionCount} | Duration: ${
													exam.duration || 0
												}min
                    </div>
                    ${
											!hasValidQuestions
												? '<div class="exam-warning">No valid questions</div>'
												: ''
										}
                </div>
            </div>
        `;
		})
		.join('');

	// Add CSS for disabled exams if it doesn't exist
	if (!document.getElementById('disabled-exam-styles-class')) {
		const styleElement = document.createElement('style');
		styleElement.id = 'disabled-exam-styles-class';
		styleElement.textContent = `
            .exam-item.disabled-exam {
                opacity: 0.7;
                background-color: #f8f9fa;
                position: relative;
            }
            .exam-warning {
                color: #856404;
                background-color: #fff3cd;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                margin-top: 4px;
                display: inline-block;
            }
        `;
		document.head.appendChild(styleElement);
	}
}

function addStudent() {
	// The manual number/name entry row was removed: students are now enrolled
	// through the Add Students modal (create a new account, enroll an existing
	// one, or approve a pending signup). Kept as a safe stub for stale callers.
	showToast(
		'Use Add Students to create an account, enroll an existing student, or approve a signup',
		'info',
	);
}

function normalizeStudentEntry(entry) {
	if (!entry) return null;
	const number = String(
		entry.number || entry.studentNumber || entry.numero || '',
	).trim();
	const name = String(entry.name || entry.fullName || '').trim();
	if (!number) return null;
	const safeName = name || number;
	return { number, name: safeName };
}

function mergeStudentEntries(listA = [], listB = []) {
	const merged = new Map();
	listA.forEach((entry) => {
		const normalized = normalizeStudentEntry(entry);
		if (!normalized) return;
		merged.set(normalized.number, normalized);
	});
	listB.forEach((entry) => {
		const normalized = normalizeStudentEntry(entry);
		if (!normalized) return;
		const existing = merged.get(normalized.number);
		if (!existing || !existing.name) {
			merged.set(normalized.number, normalized);
		} else if (normalized.name && normalized.name !== existing.name) {
			merged.set(normalized.number, { ...existing, name: normalized.name });
		}
	});
	return Array.from(merged.values());
}

function getStudentsFromUsers(classId) {
	if (!classId || !window.Auth?.getUsers) return [];
	const users = window.Auth.getUsers();
	return users
		.filter(
			(u) =>
				u.role === 'student' && String(u.classId || '') === String(classId),
		)
		.map((u) => ({
			number: String(u.studentNumber || ''),
			name: u.name || u.username || '',
		}))
		.filter((entry) => entry.number);
}

function getStudentUsersForPicker() {
	if (!window.Auth?.getUsers) return [];
	const users = window.Auth.getUsers();
	return users
		.filter((user) => String(user.role || '').toLowerCase() === 'student')
		.filter((user) => String(user.studentNumber || '').trim())
		.sort((a, b) => {
			const nameA = String(a.name || a.username || '').toLowerCase();
			const nameB = String(b.name || b.username || '').toLowerCase();
			return nameA.localeCompare(nameB);
		});
}

function getClassLookupMap() {
	const allClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	return new Map(
		(Array.isArray(allClasses) ? allClasses : []).map((cls) => [
			String(cls.id),
			cls,
		]),
	);
}

function getUserClassMeta(user, classById = new Map()) {
	const classId = String(user?.classId || '').trim();
	let className = String(user?.className || user?.class || '').trim();

	if (!className && classId) {
		const classEntry = classById.get(classId);
		if (classEntry) className = String(classEntry.name || '').trim();
	}

	if (!classId && !className) {
		return {
			classId: '',
			className: '',
			classKey: 'unassigned',
			classLabel: 'Unassigned',
			isUnassigned: true,
		};
	}

	if (classId) {
		return {
			classId,
			className,
			classKey: `id:${classId}`,
			classLabel: className || `Class ${classId}`,
			isUnassigned: false,
		};
	}

	return {
		classId: '',
		className,
		classKey: `name:${className.toLowerCase()}`,
		classLabel: className,
		isUnassigned: false,
	};
}

function getStudentClassFilterValue() {
	const filterSelect = document.getElementById('studentClassFilter');
	const value = String(filterSelect?.value || 'all').trim();
	return value || 'all';
}

function getStudentPickerSearchValue() {
	const searchInput = document.getElementById('studentPickerSearch');
	return String(searchInput?.value || '')
		.trim()
		.toLowerCase();
}

function populateStudentClassFilterOptions(users = getStudentUsersForPicker()) {
	const filterSelect = document.getElementById('studentClassFilter');
	if (!filterSelect) return;

	const currentValue = getStudentClassFilterValue();
	const classById = getClassLookupMap();
	const counters = new Map();
	const labels = new Map();

	users.forEach((user) => {
		const classMeta = getUserClassMeta(user, classById);
		const key = classMeta.classKey;
		counters.set(key, (counters.get(key) || 0) + 1);
		if (!labels.has(key)) labels.set(key, classMeta.classLabel);
	});

	const classOptions = Array.from(labels.entries())
		.filter(([key]) => key !== 'unassigned')
		.sort((a, b) => String(a[1]).localeCompare(String(b[1])));

	let optionsHtml = `<option value="all">All Classes (${users.length})</option>`;
	if (counters.has('unassigned')) {
		optionsHtml += `<option value="unassigned">Unassigned (${counters.get(
			'unassigned',
		)})</option>`;
	}

	optionsHtml += classOptions
		.map(
			([key, label]) =>
				`<option value="${escapeHtml(String(key))}">${escapeHtml(
					String(label),
				)} (${counters.get(key) || 0})</option>`,
		)
		.join('');

	window.safeSetHTML
		? window.safeSetHTML(filterSelect, optionsHtml, true)
		: (filterSelect.innerHTML = optionsHtml);

	const hasCurrentValue = Array.from(filterSelect.options).some(
		(option) => String(option.value) === currentValue,
	);
	filterSelect.value = hasCurrentValue ? currentValue : 'all';
}

function getFilteredStudentUsersForPicker(users = getStudentUsersForPicker()) {
	const filterValue = getStudentClassFilterValue();
	const term = getStudentPickerSearchValue();
	const classById = getClassLookupMap();
	return users.filter((user) => {
		if (filterValue !== 'all') {
			if (getUserClassMeta(user, classById).classKey !== filterValue) {
				return false;
			}
		}
		if (term) {
			const haystack =
				`${user.studentNumber || ''} ${user.name || ''} ${user.username || ''}`.toLowerCase();
			if (!haystack.includes(term)) return false;
		}
		return true;
	});
}

function getSelectedStudentNumbers() {
	return new Set(
		Array.from(
			document.querySelectorAll('#selectedStudentsList .selected-student-item'),
		).map((el) => String(el.dataset.number || '').trim()),
	);
}

function enableStudentPickerClickSelection(picker) {
	// Legacy no-op: the native multi-select picker was replaced by the
	// checkbox list rendered by renderStudentPickerList(). Kept as a stub so
	// stale callers don't crash.
}

// ── Add Students modal: Create New / Existing & Signups ────────────────────
// Roster edits persist immediately (there is no Save Roster step), so this
// modal is the single enrollment surface: it creates a complete student
// account, enrolls existing accounts, and approves pending online signups.

function getRosterClassContext() {
	if (!assignClassStudentsId) return null;
	return (
		classes.find(
			(c) => String(c.id) === String(assignClassStudentsId),
		) || null
	);
}

function openAddStudentsPickerModal(options = {}) {
	const modal = document.getElementById('addStudentsPickerModal');
	if (!modal) {
		showToast('Add Students modal not found', 'error');
		return;
	}
	const classData = getRosterClassContext();
	if (!classData) {
		showToast('Open a class roster before adding students', 'error');
		return;
	}

	const titleEl = document.getElementById('addStudentsPickerTitle');
	if (titleEl) titleEl.textContent = `Add Students to ${classData.name}`;

	const classFilter = document.getElementById('studentClassFilter');
	if (classFilter) classFilter.value = 'all';
	const pickerSearch = document.getElementById('studentPickerSearch');
	if (pickerSearch) pickerSearch.value = '';

	// Reset the create form for every open (callers may pre-fill a roster row
	// that has no account yet).
	const form = document.getElementById('addStudentForm');
	if (form) form.reset();
	const classLabel = document.getElementById('newStudentClassLabel');
	if (classLabel) classLabel.textContent = classData.name;
	const prefill = options.prefill || {};
	const nameInput = document.getElementById('newStudentName');
	if (nameInput) nameInput.value = String(prefill.name || '');
	const numberInput = document.getElementById('newStudentNumber');
	if (numberInput) numberInput.value = String(prefill.number || '');
	const passwordInput = document.getElementById('newStudentPassword');
	if (passwordInput) {
		passwordInput.type = 'password';
		const toggleLabel = document.getElementById(
			'newStudentPasswordToggleLabel',
		);
		if (toggleLabel) toggleLabel.textContent = 'Show';
	}

	switchAddStudentsTab('new');
	openModalLike(modal, 'newStudentName');
	renderPendingSignups();
	renderStudentPickerList();
}

function switchAddStudentsTab(tab) {
	const nextTab = tab === 'existing' ? 'existing' : 'new';
	const newBtn = document.getElementById('addStudentsTabNewBtn');
	const existingBtn = document.getElementById('addStudentsTabExistingBtn');
	const newPanel = document.getElementById('addStudentsNewPanel');
	const existingPanel = document.getElementById('addStudentsExistingPanel');
	const isNew = nextTab === 'new';

	if (newBtn) {
		newBtn.classList.toggle('is-active', isNew);
		newBtn.setAttribute('aria-selected', isNew ? 'true' : 'false');
	}
	if (existingBtn) {
		existingBtn.classList.toggle('is-active', !isNew);
		existingBtn.setAttribute('aria-selected', isNew ? 'false' : 'true');
	}
	if (newPanel) newPanel.classList.toggle('hidden', !isNew);
	if (existingPanel) existingPanel.classList.toggle('hidden', isNew);

	if (!isNew) {
		renderPendingSignups();
		renderStudentPickerList();
	}
}

function toggleNewStudentPassword() {
	const input = document.getElementById('newStudentPassword');
	if (!input) return;
	const show = input.type === 'password';
	input.type = show ? 'text' : 'password';
	const label = document.getElementById('newStudentPasswordToggleLabel');
	if (label) label.textContent = show ? 'Hide' : 'Show';
}

function generateNewStudentPassword() {
	const input = document.getElementById('newStudentPassword');
	if (!input) return;
	// Readable but non-trivial: no ambiguous 0/O/1/l characters.
	const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let password = '';
	const cryptoObj = window.crypto || window.msCrypto;
	for (let i = 0; i < 10; i += 1) {
		const random = cryptoObj?.getRandomValues
			? cryptoObj.getRandomValues(new Uint32Array(1))[0] % alphabet.length
			: Math.floor(Math.random() * alphabet.length);
		password += alphabet[random];
	}
	input.type = 'text';
	input.value = password;
	const toggleLabel = document.getElementById('newStudentPasswordToggleLabel');
	if (toggleLabel) toggleLabel.textContent = 'Hide';
}

function closeAddStudentsPickerModal() {
	closeModalLike(document.getElementById('addStudentsPickerModal'));
}

function renderStudentPickerList() {
	const listEl = document.getElementById('studentPickerList');
	if (!listEl) return;

	const allUsers = getStudentUsersForPicker();
	populateStudentClassFilterOptions(allUsers);
	const users = getFilteredStudentUsersForPicker(allUsers);
	const classById = getClassLookupMap();
	const rosteredNumbers = getSelectedStudentNumbers();

	if (!users.length) {
		listEl.innerHTML =
			'<div class="student-picker-empty">No student accounts match your search.</div>';
		updateStudentPickerCount(0);
		return;
	}

	const html = users
		.map((user) => {
			const number = String(user.studentNumber || '').trim();
			const name = String(user.name || user.username || '').trim();
			const classMeta = getUserClassMeta(user, classById);
			const alreadyRostered = rosteredNumbers.has(number);
			const status = String(user.status || 'active').toLowerCase();
			const isDisabled = isDisabledAccountStatus(status);
			return `
				<label class="student-picker-item${alreadyRostered ? ' is-rostered' : ''}">
					<input type="checkbox"
						class="student-picker-checkbox"
						data-user-id="${escapeHtml(String(user.id))}"
						data-number="${escapeHtml(number)}"
						${alreadyRostered ? 'disabled' : ''}>
					<span class="student-picker-avatar">${escapeHtml(number)}</span>
					<span class="student-picker-meta">
						<span class="student-picker-name">${escapeHtml(name)}</span>
						<span class="student-picker-class">${escapeHtml(classMeta.classLabel)}</span>
					</span>
					${
						alreadyRostered
							? '<span class="student-picker-tag tag-rostered">In roster</span>'
							: isDisabled
								? '<span class="student-picker-tag tag-disabled">Disabled</span>'
								: ''
					}
				</label>
			`;
		})
		.join('');

	window.safeSetHTML
		? window.safeSetHTML(listEl, html)
		: (listEl.innerHTML = html);

	// Footer button reflects how many rows are checked (starts at 0).
	updateStudentPickerCount(0);
	listEl
		.querySelectorAll('.student-picker-checkbox')
		.forEach((checkbox) => {
			checkbox.addEventListener('change', () => updateStudentPickerCount());
		});
}

function populateStudentUserPicker() {
	// Legacy entry point (still called after roster mutations). The picker is
	// now a modal; refresh its list only while it is open.
	const modal = document.getElementById('addStudentsPickerModal');
	if (modal && !modal.classList.contains('hidden')) {
		renderStudentPickerList();
	}
}

function updateStudentPickerCount(n) {
	// Two surfaces: the modal footer "Add Selected (N)" button reflects the
	// checked rows; the old #studentPickerCount badge is gone.
	const confirmBtn = document.getElementById('addStudentsPickerConfirmBtn');
	if (!confirmBtn) return;
	const listEl = document.getElementById('studentPickerList');
	let checkedCount = n;
	if (checkedCount == null) {
		checkedCount = listEl
			? listEl.querySelectorAll('.student-picker-checkbox:checked').length
			: 0;
	}
	const countEl = document.getElementById('addStudentsPickerCount');
	if (countEl) countEl.textContent = String(checkedCount);
	confirmBtn.disabled = checkedCount === 0;
}

function onStudentClassFilterChange() {
	renderStudentPickerList();
}

// ── Immediate roster persistence helpers ───────────────────────────────────
// There is no Save Roster step: every add/remove writes the student's class
// assignment to the backend first (when the API is available) and then mirrors
// it locally, so the roster can never drift from the users table again.

function isDisabledAccountStatus(status) {
	const value = String(status || 'active').toLowerCase();
	return value === 'disabled' || value === 'inactive' || value === 'suspended';
}

function toServerAccountStatus(status) {
	// The backend enum is active | inactive | suspended; the UI uses
	// active | disabled (legacy rows may also carry inactive).
	return isDisabledAccountStatus(status) ? 'suspended' : 'active';
}

function toLocalAccountStatus(status) {
	return isDisabledAccountStatus(status) ? 'disabled' : 'active';
}

async function persistStudentClassAssignment(userId, classId) {
	if (!userId || !window.API || typeof window.API.raw !== 'function') return;
	// The legacy mapper drops falsy class ids, so an explicit null is the only
	// way to unassign through the API.
	await window.API.raw('PATCH', '/users/' + encodeURIComponent(String(userId)), {
		class_id: classId || null,
	});
}

function updateLocalStudentAccount(userId, updates = {}) {
	if (!userId || !window.Auth?.getUsers) return null;
	const users = window.Auth.getUsers();
	const target = users.find((u) => String(u.id) === String(userId));
	if (!target) return null;
	Object.assign(target, updates, { updatedAt: new Date().toISOString() });
	window.Auth.saveUsers(users);
	return target;
}

function detachStudentFromOtherClassRosters(number, keepClassId) {
	const target = String(number || '').trim();
	if (!target) return;
	classes.forEach((cls) => {
		if (String(cls.id) === String(keepClassId)) return;
		if (!Array.isArray(cls.students)) return;
		cls.students = cls.students.filter(
			(entry) => String(entry?.number || '').trim() !== target,
		);
	});
}

function updateRosterHeroKpis() {
	const classData = getRosterClassContext();
	if (!classData) return;
	const studentCount = Array.isArray(classData.students)
		? classData.students.length
		: 0;
	const kpiStudents = document.getElementById('classKpiStudentsCount');
	if (kpiStudents) kpiStudents.textContent = String(studentCount);

	const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
	const activeCount = users.filter(
		(u) =>
			String(u.role || '').toLowerCase() === 'student' &&
			String(u.classId || '') === String(classData.id) &&
			!isDisabledAccountStatus(u.status),
	).length;
	const kpiActive = document.getElementById('classKpiActiveAccounts');
	if (kpiActive) kpiActive.textContent = String(activeCount);
}

function pruneRosterMirrorAgainstAccounts() {
	// class.students is a legacy mirror; the account's class_id is the source
	// of truth. Drop mirror rows whose account has moved to another class so a
	// student can never appear in two rosters after an Edit User move.
	if (!window.Auth?.getUsers) return;
	const accountsByNumber = new Map();
	window.Auth.getUsers().forEach((user) => {
		if (String(user.role || '').toLowerCase() !== 'student') return;
		const number = String(user.studentNumber || '').trim();
		if (number) accountsByNumber.set(number, user);
	});
	classes.forEach((cls) => {
		if (!Array.isArray(cls.students)) return;
		cls.students = cls.students.filter((entry) => {
			const account = accountsByNumber.get(String(entry?.number || '').trim());
			if (!account) return true; // roster-only row — nothing to verify
			const accountClassId = String(account.classId || '').trim();
			if (!accountClassId) return true; // unassigned accounts keep a stub row
			return accountClassId === String(cls.id);
		});
	});
}

function refreshRosterAfterMutation() {
	const classData = getRosterClassContext();
	if (!classData) return;
	if (!Array.isArray(classData.students)) classData.students = [];
	pruneRosterMirrorAgainstAccounts();
	classData.students = mergeStudentEntries(
		classData.students,
		getStudentsFromUsers(classData.id),
	);
	saveClasses();
	updateClassList();
	updateRosterHeroKpis();
	if (typeof window.renderUsersTable === 'function') {
		window.renderUsersTable();
	}
	// Re-seed the staging rows before rendering so the table always reflects
	// the merged source, not whatever happened to be left in the DOM.
	const studentsList = document.getElementById('selectedStudentsList');
	if (studentsList) {
		studentsList.innerHTML = '';
		classData.students.forEach((student) => {
			studentsList.appendChild(
				createStudentItem(student.number, student.name),
			);
		});
	}
	renderStudentRosterTable();
	renderStudentPickerList();
	renderPendingSignups();
	if (
		typeof window.syncUsersToClients === 'function' &&
		window.Auth?.isAdmin?.()
	) {
		window.syncUsersToClients();
	}
}

async function enrollExistingStudent(user) {
	const classData = getRosterClassContext();
	if (!classData || !user) return false;
	const number = String(user.studentNumber || '').trim();
	const name = String(user.name || user.username || '').trim();
	if (!number || !name) return false;
	if (getSelectedStudentNumbers().has(number)) return false;

	// Backend first: a failed assignment must not leave a phantom roster row.
	await persistStudentClassAssignment(user.id, classData.id);
	updateLocalStudentAccount(user.id, {
		classId: String(classData.id),
		className: classData.name,
	});
	classData.students = mergeStudentEntries(classData.students || [], [
		{ number, name },
	]);
	detachStudentFromOtherClassRosters(number, classData.id);
	const studentsList = document.getElementById('selectedStudentsList');
	if (studentsList) studentsList.appendChild(createStudentItem(number, name, user.id));
	return true;
}

async function addStudentFromUserPicker() {
	const listEl = document.getElementById('studentPickerList');
	if (!listEl) return;
	const checkedBoxes = Array.from(
		listEl.querySelectorAll('.student-picker-checkbox:checked'),
	);
	if (!checkedBoxes.length) {
		showToast('Select one or more student users first', 'warning');
		return;
	}
	const confirmBtn = document.getElementById('addStudentsPickerConfirmBtn');
	if (confirmBtn) confirmBtn.disabled = true;

	const byId = new Map(
		getStudentUsersForPicker().map((entry) => [String(entry.id), entry]),
	);
	let addedCount = 0;
	let failedCount = 0;
	for (const checkbox of checkedBoxes) {
		const user = byId.get(String(checkbox.dataset.userId || '').trim());
		if (!user) continue;
		try {
			if (await enrollExistingStudent(user)) addedCount += 1;
		} catch (err) {
			failedCount += 1;
			console.warn('[classes] student enrollment failed:', err);
		}
	}
	if (confirmBtn) confirmBtn.disabled = false;

	if (!addedCount) {
		showToast(
			failedCount
				? 'Students could not be assigned — check the connection and try again'
				: 'No new students were added',
			failedCount ? 'error' : 'info',
		);
		renderStudentPickerList();
		return;
	}
	refreshRosterAfterMutation();
	closeAddStudentsPickerModal();
	if (failedCount) {
		showToast(
			`${addedCount} student(s) added; ${failedCount} could not be assigned`,
			'warning',
		);
	} else {
		showToast(`Added ${addedCount} student(s) to the class`, 'success');
	}
}

async function addAllStudentsFromUsers() {
	const availableUsers = getFilteredStudentUsersForPicker(
		getStudentUsersForPicker(),
	).filter(
		(user) =>
			!getSelectedStudentNumbers().has(String(user.studentNumber || '').trim()),
	);
	if (!availableUsers.length) {
		showToast('No available students to add', 'info');
		return;
	}
	const confirmBtn = document.getElementById('addStudentsPickerConfirmBtn');
	if (confirmBtn) confirmBtn.disabled = true;
	let addedCount = 0;
	let failedCount = 0;
	for (const user of availableUsers) {
		try {
			if (await enrollExistingStudent(user)) addedCount += 1;
		} catch (err) {
			failedCount += 1;
			console.warn('[classes] student enrollment failed:', err);
		}
	}
	if (confirmBtn) confirmBtn.disabled = false;
	refreshRosterAfterMutation();
	closeAddStudentsPickerModal();
	showToast(
		failedCount
			? `${addedCount} student(s) added; ${failedCount} could not be assigned`
			: `Added ${addedCount} student(s) to the class`,
		failedCount ? 'warning' : 'success',
	);
}

function deselectAllStudentsInPicker() {
	document
		.querySelectorAll('#studentPickerList .student-picker-checkbox:checked')
		.forEach((checkbox) => {
			checkbox.checked = false;
		});
	updateStudentPickerCount();
}

function createStudentItem(number, name, userId = '') {
	// Legacy staging element: the roster table reads `.selected-student-item`
	// rows from #selectedStudentsList (a <tbody>), so we render a <tr> carrying
	// the same dataset contract (number/name/userId) the save flow reads.
	const row = document.createElement('tr');
	row.className = 'selected-student-item';
	row.dataset.number = number;
	row.dataset.name = name;
	if (userId) row.dataset.userId = String(userId);
	return row;
}

// ── Pending online signups (account requests) ───────────────────────────────
// A student who requested an account from the student workspace lands here.
// Approving materializes the account (server-first via Auth), assigns it to
// this class and activates it — no Settings detour needed.

function getPendingSignupsForClass() {
	const classData = getRosterClassContext();
	if (!classData || !window.Auth?.getAccountRequests) return [];
	const isAdminSession = window.Auth.isAdmin?.() === true;
	return window.Auth
		.getAccountRequests()
		.filter((request) => String(request.status || 'pending') === 'pending')
		.filter((request) => {
			const requestClassId = String(request.classId || '').trim();
			if (requestClassId) return requestClassId === String(classData.id);
			// Class-less requests can only be attached by an admin (teachers are
			// scoped to requests that already target one of their classes).
			return isAdminSession;
		})
		.sort((a, b) =>
			String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
		);
}

function updatePendingSignupBadge(count) {
	const badge = document.getElementById('addStudentsPendingCount');
	if (!badge) return;
	badge.textContent = String(count);
	badge.classList.toggle('hidden', count === 0);
}

function renderPendingSignups() {
	const section = document.getElementById('pendingSignupsSection');
	const listEl = document.getElementById('pendingSignupsList');
	const pending = getPendingSignupsForClass();
	updatePendingSignupBadge(pending.length);
	if (!section || !listEl) return;

	if (!pending.length) {
		section.classList.add('hidden');
		listEl.innerHTML = '';
		return;
	}

	const classData = getRosterClassContext();
	const rows = pending
		.map((request) => {
			const name = String(request.fullName || request.username || 'Student');
			const initial = name.trim().charAt(0).toUpperCase() || '?';
			const meta = [
				request.username ? `@${request.username}` : '',
				request.studentNumber ? `#${request.studentNumber}` : '',
				request.classId
					? ''
					: `→ ${classData ? classData.name : 'this class'}`,
			]
				.filter(Boolean)
				.join(' · ');
			const requestedAt = request.createdAt
				? new Date(request.createdAt).toLocaleDateString()
				: '';
			return `
				<div class="pending-signup-card">
					<span class="pending-signup-avatar">${escapeHtml(initial)}</span>
					<div class="pending-signup-meta">
						<span class="pending-signup-name">${escapeHtml(name)}</span>
						<span class="pending-signup-info">${escapeHtml(meta)}${requestedAt ? ` · ${escapeHtml(requestedAt)}` : ''}</span>
						${request.note ? `<span class="pending-signup-note">${escapeHtml(request.note)}</span>` : ''}
					</div>
					<div class="pending-signup-actions">
						<button type="button" class="btn btn-sm btn-primary" onclick="approvePendingSignup('${escapeHtml(String(request.id))}')">
							Approve &amp; add
						</button>
						<button type="button" class="btn btn-sm btn-ghost" onclick="rejectPendingSignup('${escapeHtml(String(request.id))}')">
							Reject
						</button>
					</div>
				</div>
			`;
		})
		.join('');

	if (window.safeSetHTML) window.safeSetHTML(listEl, rows);
	else listEl.innerHTML = rows;
	section.classList.remove('hidden');
}

async function approvePendingSignup(requestId) {
	const classData = getRosterClassContext();
	if (!classData || !window.Auth?.approveAccountRequest) return;
	const request = (window.Auth.getAccountRequests?.() || []).find(
		(entry) => String(entry.id) === String(requestId),
	);
	if (!request) return;

	const button = document.querySelector(
		`.pending-signup-card [onclick*="${CSS.escape(String(requestId))}"]`,
	);
	if (button) button.disabled = true;

	const reviewerId = window.Auth.getCurrentUser?.()?.id || '';
	const approved = await window.Auth.approveAccountRequest(requestId, reviewerId);
	if (!approved) {
		if (button) button.disabled = false;
		return;
	}

	const userId = approved.createdUserId || '';
	const targetClassId = String(classData.id);
	const sourceClassId = String(
		approved.classId || request.classId || '',
	).trim();

	// Approval materializes the account with the request's class; make sure it
	// is active and attached to the class the teacher is managing right now.
	try {
		await persistStudentClassAssignment(userId, targetClassId);
		if (sourceClassId !== targetClassId) {
			updateLocalStudentAccount(userId, {
				classId: targetClassId,
				className: classData.name,
			});
		}
		updateLocalStudentAccount(userId, { status: 'active' });
	} catch (err) {
		console.warn('[classes] approved signup class assignment failed:', err);
		showToast(
			'Signup approved, but assigning the class failed — retry from Edit User',
			'warning',
		);
	}

	let account = (window.Auth.getUsers?.() || []).find(
		(u) => String(u.id) === String(userId),
	);
	if (!account && userId && window.API?.get) {
		try {
			const remote = await window.API.get('users', userId);
			if (remote) {
				account = buildLocalStudentUser({
					id: remote.id,
					name: remote.name,
					title: remote.title,
					username: remote.username,
					status: remote.status,
					studentNumber: remote.numero,
					classId: remote.class_id || targetClassId,
					className: classData.name,
					createdAt: remote.created_at,
					updatedAt: remote.updated_at,
				});
				const users = window.Auth.getUsers();
				users.push(account);
				window.Auth.saveUsers(users);
			}
		} catch (err) {
			console.warn('[classes] approved signup refresh failed:', err);
		}
	}

	const number = String(
		approved.studentNumber || account?.studentNumber || '',
	).trim();
	const name = String(
		approved.fullName || account?.name || approved.username || '',
	).trim();
	if (number && name && !getSelectedStudentNumbers().has(number)) {
		classData.students = mergeStudentEntries(classData.students || [], [
			{ number, name },
		]);
		detachStudentFromOtherClassRosters(number, classData.id);
		const studentsList = document.getElementById('selectedStudentsList');
		if (studentsList) {
			studentsList.appendChild(
				createStudentItem(number, name, userId),
			);
		}
	}

	refreshRosterAfterMutation();
	showToast(
		`${name || 'Student'} approved and added to ${classData.name}`,
		'success',
	);
}

async function rejectPendingSignup(requestId) {
	if (!window.Auth?.rejectAccountRequest) return;
	if (
		!confirm(
			'Reject this signup request? The student will need to request an account again.',
		)
	) {
		return;
	}
	const reviewerId = window.Auth.getCurrentUser?.()?.id || '';
	const rejected = await window.Auth.rejectAccountRequest(
		requestId,
		reviewerId,
	);
	if (rejected) {
		renderPendingSignups();
		showToast('Signup request rejected', 'info');
	}
}

// ── Create New student ──────────────────────────────────────────────────────
// Creates the User row (identity + credentials + access/status) and enrolls it
// in the class in one step. The backend hashes the password; the local mirror
// is only written after the server confirms.

function generateLocalUserId() {
	if (typeof generateUUID === 'function') return generateUUID();
	if (window.crypto?.randomUUID) return window.crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
		const random = (Math.random() * 16) | 0;
		const value = char === 'x' ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

function buildLocalStudentUser(data = {}) {
	const now = new Date().toISOString();
	const title =
		data.title === 'Mr' || data.title === 'Mme' ? data.title : '';
	return {
		id: data.id || generateLocalUserId(),
		name: String(data.name || '').trim(),
		title,
		username: String(data.username || '').trim(),
		role: 'student',
		status: toLocalAccountStatus(data.status),
		passwordHash: data.passwordHash || '',
		avatar: '',
		classIds: [],
		studentNumber: String(data.studentNumber || '').trim(),
		classId: String(data.classId || ''),
		className: String(data.className || ''),
		email: '',
		phone: '',
		subjects: [],
		createdAt: data.createdAt || now,
		updatedAt: data.updatedAt || now,
	};
}

function setCreateStudentBusy(busy) {
	const button = document.getElementById('createStudentSubmitBtn');
	if (!button) return;
	button.disabled = busy;
	const label = button.querySelector('span');
	if (label) {
		label.textContent = busy ? 'Creating…' : 'Create & Add Student';
	}
}

async function submitNewStudentForm(event) {
	event?.preventDefault?.();
	const classData = getRosterClassContext();
	if (!classData) {
		showToast('Open a class roster before adding students', 'error');
		return;
	}

	const name = String(
		document.getElementById('newStudentName')?.value || '',
	).trim();
	const studentNumber = String(
		document.getElementById('newStudentNumber')?.value || '',
	).trim();
	const username = String(
		document.getElementById('newStudentUsername')?.value || '',
	).trim();
	const password = String(
		document.getElementById('newStudentPassword')?.value || '',
	);
	const titleValue = String(
		document.getElementById('newStudentTitle')?.value || '',
	).trim();
	const title = titleValue === 'Mr' || titleValue === 'Mme' ? titleValue : '';
	const status = String(
		document.getElementById('newStudentStatus')?.value || 'active',
	).toLowerCase();

	if (!name || !studentNumber || !username) {
		showToast('Name, student number and username are required', 'error');
		return;
	}
	if (password.length < 6) {
		showToast('Password must be at least 6 characters', 'error');
		return;
	}

	const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
	if (
		users.some(
			(user) =>
				String(user.username || '').toLowerCase() === username.toLowerCase(),
		)
	) {
		showToast('Username already exists', 'error');
		return;
	}
	if (
		users.some(
			(user) =>
				String(user.role || '').toLowerCase() === 'student' &&
				String(user.studentNumber || '').trim() === studentNumber,
		)
	) {
		showToast('Student number already exists', 'error');
		return;
	}
	if (getSelectedStudentNumbers().has(studentNumber)) {
		showToast('This student number is already in the roster', 'info');
		return;
	}

	const pendingDuplicate = window.Auth?.getAccountRequests
		? window.Auth.getAccountRequests().find(
				(request) =>
					String(request.status || 'pending') === 'pending' &&
					String(request.username || '').toLowerCase() ===
						username.toLowerCase(),
			)
		: null;
	if (pendingDuplicate) {
		showToast(
			'A pending signup already uses this username — approve it from Existing & Signups',
			'warning',
		);
		return;
	}

	setCreateStudentBusy(true);
	try {
		let localUser = null;
		if (window.API && typeof window.API.create === 'function') {
			const created = await window.API.create('users', {
				username,
				password,
				name,
				title: title || null,
				role: 'student',
				status: toServerAccountStatus(status),
				class_id: String(classData.id),
				numero: studentNumber,
			});
			localUser = buildLocalStudentUser({
				id: created.id,
				name: created.name,
				title: created.title,
				username: created.username,
				status: created.status,
				studentNumber: created.numero,
				classId: created.class_id || classData.id,
				className: classData.name,
				createdAt: created.created_at,
				updatedAt: created.updated_at,
			});
		} else {
			// Offline / legacy bundle: mirror the account locally with a hashed
			// password, matching what the server would have stored.
			const passwordHash = window.Auth?.hashText
				? await window.Auth.hashText(password)
				: '';
			localUser = buildLocalStudentUser({
				name,
				title,
				username,
				status,
				studentNumber,
				classId: classData.id,
				className: classData.name,
				passwordHash,
			});
		}

		// Re-read after the await so a concurrent change is never overwritten.
		// A realtime sync may already have mirrored the new row; replace it
		// rather than duplicating the user.
		const latestUsers = window.Auth.getUsers();
		const existingIndex = latestUsers.findIndex(
			(u) =>
				String(u.id) === String(localUser.id) ||
				String(u.username || '').toLowerCase() ===
					String(localUser.username || '').toLowerCase(),
		);
		if (existingIndex === -1) latestUsers.push(localUser);
		else latestUsers[existingIndex] = localUser;
		window.Auth.saveUsers(latestUsers);

		classData.students = mergeStudentEntries(classData.students || [], [
			{ number: studentNumber, name },
		]);
		detachStudentFromOtherClassRosters(studentNumber, classData.id);
		const studentsList = document.getElementById('selectedStudentsList');
		if (studentsList) {
			studentsList.appendChild(
				createStudentItem(studentNumber, name, localUser.id),
			);
		}

		refreshRosterAfterMutation();
		const form = document.getElementById('addStudentForm');
		if (form) form.reset();
		closeAddStudentsPickerModal();
		showToast(
			`${name} was created and added to ${classData.name}${
				isDisabledAccountStatus(status) ? ' (account disabled)' : ''
			}`,
			'success',
		);
	} catch (err) {
		console.error('[classes] create student failed:', err);
		showToast(
			'Failed to create student: ' +
				(err?.message || 'network error'),
			'error',
		);
	} finally {
		setCreateStudentBusy(false);
	}
}

// ── Roster table rendering ──────────────────────────────────────────────────
// The Assign Students modal shows the full roster as a data table: number,
// name, account presence, status and per-row actions. Auth info (username /
// password) is managed through the single "Edit User" action.

function getRosterAccountInfo(number) {
	// Find the student user matching this roster number (any class).
	if (!number || !window.Auth?.getUsers) return null;
	const users = window.Auth.getUsers();
	return (
		users.find(
			(u) =>
				String(u.role || '').toLowerCase() === 'student' &&
				String(u.studentNumber || '').trim() === String(number).trim(),
		) || null
	);
}

function buildRosterRows() {
	// Materialize the staged roster (tbody rows) into rich row descriptors.
	return Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item'),
	).map((el) => {
		const number = String(el.dataset.number || '').trim();
		const name = String(el.dataset.name || '').trim();
		const userId = String(el.dataset.userId || '').trim();
		const account = getRosterAccountInfo(number);
		return {
			el,
			number,
			name,
			userId: userId || (account ? String(account.id) : ''),
			account,
		};
	});
}

// Roster sort state (Name / Student # / Status + asc/desc toggle)
let rosterSortDirection = 'asc';

function sortStudentRosterRows(rows) {
	const sortByEl = document.getElementById('studentRosterSortBy');
	const sortBy = String(sortByEl?.value || 'name');
	const dir = rosterSortDirection === 'desc' ? -1 : 1;
	const statusRank = (row) => {
		if (!row.account) return 2; // no account yet
		const status = String(row.account.status || 'active').toLowerCase();
		return isDisabledAccountStatus(status) ? 1 : 0;
	};
	return rows.sort((a, b) => {
		let cmp = 0;
		if (sortBy === 'number') {
			cmp = String(a.number).localeCompare(String(b.number), undefined, {
				numeric: true,
			});
		} else if (sortBy === 'status') {
			cmp = statusRank(a) - statusRank(b);
			if (!cmp) cmp = String(a.name).localeCompare(String(b.name));
		} else {
			cmp = String(a.name).localeCompare(String(b.name));
		}
		return cmp * dir;
	});
}

function sortStudentRoster() {
	// Re-render from the staged rows so the sort is visible immediately.
	renderStudentRosterTable();
}

function toggleRosterSortDirection() {
	rosterSortDirection = rosterSortDirection === 'asc' ? 'desc' : 'asc';
	const btn = document.getElementById('sortRosterDirection');
	if (btn) btn.classList.toggle('desc', rosterSortDirection === 'desc');
	renderStudentRosterTable();
}

function renderStudentRosterTable() {
	const tbody = document.getElementById('selectedStudentsList');
	const emptyState = document.getElementById('rosterEmptyState');
	const summary = document.getElementById('assignClassRosterSummary');
	if (!tbody) return;

	const rows = sortStudentRosterRows(buildRosterRows());
	const classId = assignClassStudentsId;
	const classData = classId ? classes.find((c) => c.id === classId) : null;
	const className = classData ? classData.name : '';

	if (summary) {
		summary.textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}`;
	}
	if (!rows.length) {
		tbody.innerHTML = '';
		if (emptyState) {
			emptyState.classList.remove('hidden');
			emptyState.innerHTML =
				'No students in this class yet — add them with <strong>Add Students</strong>.';
		}
		if (window.BulkSelect) window.BulkSelect.clear('students');
		applyRosterPagination();
		return;
	}

	const html = rows
		.map(({ number, name, userId, account }, index) => {
			const hasAccount = Boolean(account);
			const status = String(account?.status || 'active').toLowerCase();
			const isDisabled = isDisabledAccountStatus(status);
			const statusLabel = !hasAccount
				? 'No account yet'
				: isDisabled
					? 'Disabled'
					: 'Active';
			const statusClass = !hasAccount
				? 'roster-status roster-status-pending'
				: isDisabled
					? 'roster-status roster-status-disabled'
					: 'roster-status roster-status-active';
			// Keep the canonical status on the row so the status filter can
			// read it without re-querying the users store on every keystroke.
			const statusValue = !hasAccount
				? 'no-account'
				: isDisabled
					? 'disabled'
					: 'active';
			const accountLabel = hasAccount
				? escapeHtml(String(account.name || account.username || ''))
				: '—';
			const safeNumber = escapeHtml(number);
			const safeName = escapeHtml(name);

			return `
				<tr class="selected-student-item" data-id="${safeNumber}" data-number="${safeNumber}" data-name="${safeName}" data-account-status="${statusValue}"${userId ? ` data-user-id="${escapeHtml(userId)}"` : ''}>
					<td class="checkbox-cell" data-label="Select">
						<input type="checkbox"
							class="student-checkbox"
							data-id="${safeNumber}"
							onchange="toggleBulkRowSelection(this,'students')">
					</td>
					<td class="qnum-cell" data-label="#">${index + 1}</td>
					<td class="student-number-cell" data-label="Student #">${safeNumber}</td>
					<td class="student-name-cell" data-label="Name">${safeName}</td>
					<td class="student-account-cell" data-label="Account">${accountLabel}</td>
					<td data-label="Status"><span class="${statusClass}">${statusLabel}</span></td>
				</tr>
			`;
		})
		.join('');

	window.safeSetHTML
		? window.safeSetHTML(tbody, html)
		: (tbody.innerHTML = html);

	if (emptyState) emptyState.classList.add('hidden');

	// The row is the single entry point for per-student actions: a click (or
	// tap) opens the action sheet with Edit User / Remove from Roster. There is
	// no per-row Actions column, so this works the same on every viewport.
	// Controls inside the row keep their own behavior.
	tbody.querySelectorAll('tr.selected-student-item').forEach((row) => {
		row.addEventListener('click', (e) => {
			if (e.target.closest('button, input, select, a, .checkbox-cell')) return;
			const number = row.dataset.number || '';
			const name = row.dataset.name || '';
			if (number) openStudentActionSheet(number, name);
		});
	});

	// Restore bulk selection after re-render (filter/sort safe) + refresh bulk bar
	if (window.BulkSelect) window.BulkSelect.restore('students');

	// Re-apply the client-side search/status filters to the fresh rows.
	filterStudentRosterTable();
}

function filterStudentRosterTable() {
	const searchInput = document.getElementById('studentRosterSearch');
	const statusFilter = document.getElementById('studentRosterStatusFilter');
	const term = String(searchInput?.value || '')
		.trim()
		.toLowerCase();
	const statusValue = String(statusFilter?.value || 'all');

	const rows = document.querySelectorAll(
		'#selectedStudentsList .selected-student-item',
	);
	let visibleCount = 0;

	rows.forEach((row) => {
		const number = String(row.dataset.number || '').toLowerCase();
		const name = String(row.dataset.name || '').toLowerCase();
		const matchesSearch = !term || number.includes(term) || name.includes(term);

		const rowStatus = String(row.dataset.accountStatus || 'no-account');
		const matchesStatus = statusValue === 'all' || rowStatus === statusValue;

		const visible = matchesSearch && matchesStatus;
		row.style.display = visible ? '' : 'none';
		// Pagination reads this flag to page only over matched rows.
		row.dataset.filteredOut = visible ? 'false' : 'true';
		if (visible) visibleCount += 1;
	});

	const emptyState = document.getElementById('rosterEmptyState');
	if (emptyState) {
		const total = rows.length;
		if (visibleCount === 0) {
			emptyState.classList.remove('hidden');
			emptyState.innerHTML = total
				? 'No students match your search.'
				: 'No students in this class yet — add them with <strong>Add Students</strong>.';
		} else {
			emptyState.classList.add('hidden');
		}
	}

	applyRosterPagination();

	// Keep the bulk bar in sync with the rows the filter left visible.
	if (window.BulkSelect) window.BulkSelect.updateBar('students');
}

// ── Roster pagination (questions-table identity) ────────────────────────────
const ROSTER_ITEMS_PER_PAGE = 15;

function applyRosterPagination() {
	const tbody = document.getElementById('selectedStudentsList');
	if (!tbody) return;

	const rows = Array.from(tbody.querySelectorAll('.selected-student-item'));
	// "Matched" rows are those the search/status filter left visible.
	const matchedRows = rows.filter((row) => row.dataset.filteredOut !== 'true');
	const totalPages = Math.max(
		1,
		Math.ceil(matchedRows.length / ROSTER_ITEMS_PER_PAGE),
	);
	let currentPage = parseInt(
		document.getElementById('rosterCurrentPage')?.textContent || '1',
	);
	if (Number.isNaN(currentPage) || currentPage < 1) currentPage = 1;
	if (currentPage > totalPages) currentPage = totalPages;

	const startIndex = (currentPage - 1) * ROSTER_ITEMS_PER_PAGE;
	const endIndex = Math.min(startIndex + ROSTER_ITEMS_PER_PAGE, matchedRows.length);

	rows.forEach((row) => {
		row.style.display = 'none';
	});
	for (let i = startIndex; i < endIndex; i++) {
		if (matchedRows[i]) matchedRows[i].style.display = '';
	}

	const startDisplay = matchedRows.length > 0 ? startIndex + 1 : 0;
	const setText = (id, value) => {
		const el = document.getElementById(id);
		if (el) el.textContent = String(value);
	};
	setText('rosterPaginationStart', startDisplay);
	setText('rosterPaginationEnd', endIndex);
	setText('rosterPaginationTotal', matchedRows.length);
	setText('rosterCurrentPage', currentPage);
	setText('rosterTotalPages', totalPages);
	const prevBtn = document.getElementById('rosterPrevPage');
	if (prevBtn) prevBtn.disabled = currentPage <= 1;
	const nextBtn = document.getElementById('rosterNextPage');
	if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
	const paginationEl = document.getElementById('rosterPagination');
	if (paginationEl) {
		paginationEl.classList.toggle('hidden', rows.length === 0);
	}
}

function changeRosterPage(direction) {
	const currentPageEl = document.getElementById('rosterCurrentPage');
	if (!currentPageEl) return;
	const current = parseInt(currentPageEl.textContent) || 1;
	currentPageEl.textContent = String(current + direction);
	applyRosterPagination();
	// Re-sync the bulk bar: it counts only rows visible on the current page.
	if (window.BulkSelect) window.BulkSelect.updateBar('students');
}

function editRosterStudent(number, name = '') {
	// A roster row with an account opens the single User editor (identity,
	// credentials, access & role). A row without an account opens the Create
	// New tab pre-filled — no dead end.
	const account = getRosterAccountInfo(number);
	if (!account) {
		openAddStudentsPickerModal({
			prefill: { number: String(number || ''), name: String(name || '') },
		});
		return;
	}
	if (typeof window.openUserModal === 'function') {
		window.openUserModal(account.id);
	}
}

async function unenrollStudentFromClass(number) {
	const classData = getRosterClassContext();
	if (!classData) return false;
	const row = document.querySelector(
		`#selectedStudentsList .selected-student-item[data-number="${CSS.escape(String(number))}"]`,
	);
	const account = getRosterAccountInfo(number);

	// Backend first: never remove the row if the server still has the student
	// in this class (that is exactly how rosters used to drift after reloads).
	if (account?.id) {
		await persistStudentClassAssignment(account.id, null);
		updateLocalStudentAccount(account.id, { classId: '', className: '' });
	}

	if (row) row.remove();
	classData.students = (classData.students || []).filter(
		(entry) => String(entry?.number || '').trim() !== String(number).trim(),
	);
	return true;
}

async function removeRosterStudent(number) {
	try {
		const removed = await unenrollStudentFromClass(number);
		if (!removed) return;
		refreshRosterAfterMutation();
		showToast('Student removed from the class roster', 'info');
	} catch (err) {
		console.warn('[classes] remove student failed:', err);
		showToast(
			'Could not remove the student — check the connection and try again',
			'error',
		);
	}
}

// ── Student CRUD + action sheet (questions-table identity) ──────────────────

function editStudent(number, name = '') {
	editRosterStudent(number, name);
}

function openStudentActionSheet(number, name) {
	const account = getRosterAccountInfo(number);
	const hasAccount = Boolean(account);
	const actions = [
		{
			// One account editor only: "Open Account" used to duplicate this.
			label: hasAccount ? 'Edit User' : 'Create User Account',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
			onClick: () => editStudent(number, name),
		},
		{
			label: 'Remove from Roster',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
			variant: 'danger',
			onClick: () => removeRosterStudent(number),
		},
	];
	if (window.MobileActionSheet) {
		// MobileActionSheet sets the title with textContent, so pass the raw
		// name instead of an HTML-escaped string.
		window.MobileActionSheet.open(`Student: ${name || number}`, actions);
	}
}

async function deleteSelectedStudents() {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('students')
		: [];
	if (!ids.length) {
		showToast('No students selected', 'error');
		return;
	}
	if (
		!confirm(
			`Are you sure you want to remove ${ids.length} student(s) from the roster?`,
		)
	) {
		return;
	}
	let removed = 0;
	let failed = 0;
	for (const number of ids) {
		try {
			if (await unenrollStudentFromClass(number)) removed += 1;
		} catch (err) {
			failed += 1;
			console.warn('[classes] bulk remove student failed:', err);
		}
	}
	if (removed) {
		refreshRosterAfterMutation();
		if (window.BulkSelect) window.BulkSelect.clear('students');
		showToast(
			failed
				? `Removed ${removed} student(s); ${failed} could not be removed`
				: `Removed ${removed} student(s) from the roster`,
			failed ? 'warning' : 'success',
		);
		if (typeof logActivity === 'function') {
			logActivity('class', `${removed} student(s)`, 'removed from roster', {
				classId: assignClassStudentsId,
				count: removed,
			});
		}
	} else {
		showToast(
			failed
				? 'Students could not be removed — check the connection and try again'
				: 'No students were removed',
			failed ? 'error' : 'info',
		);
	}
}

// ── Bulk account actions (admin-only, questions-table identity) ─────────────
// Enable/Disable flips the selected students' user accounts. Persistence
// mirrors Auth.toggleUserStatus: API first (User.status enum maps 'disabled'
// → 'suspended'), then the localStorage mirror — never both on failure.

async function bulkSetStudentAccounts(targetStatus) {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('students')
		: [];
	if (!ids.length) {
		showToast('No students selected', 'error');
		return;
	}

	const targets = [];
	ids.forEach((number) => {
		const account = getRosterAccountInfo(number);
		if (!account) return; // no account yet — nothing to enable/disable
		const status = String(account.status || 'active').toLowerCase();
		const isDisabled = isDisabledAccountStatus(status);
		if (targetStatus === 'active' && isDisabled) targets.push(account);
		if (targetStatus === 'disabled' && !isDisabled) targets.push(account);
	});

	if (!targets.length) {
		showToast(
			targetStatus === 'active'
				? 'Selected students are already active (or have no account)'
				: 'Selected students are already disabled (or have no account)',
			'info',
		);
		return;
	}

	const verb = targetStatus === 'active' ? 'activate' : 'suspend';
	if (
		!confirm(
			`Are you sure you want to ${verb} ${targets.length} student account(s)?`,
		)
	) {
		return;
	}

	const users = window.Auth.getUsers ? window.Auth.getUsers() : [];
	let succeeded = 0;
	for (const account of targets) {
		if (window.API && typeof window.API.update === 'function') {
			try {
				await window.API.update('users', account.id, {
					status: targetStatus === 'active' ? 'active' : 'suspended',
				});
			} catch (apiErr) {
				console.warn('[classes] bulk status API update failed:', apiErr);
				continue; // leave this account untouched on both sides
			}
		}
		const user = users.find((u) => String(u.id) === String(account.id));
		if (user) {
			user.status = targetStatus;
			user.updatedAt = new Date().toISOString();
		}
		succeeded += 1;
	}

	if (succeeded) {
		if (window.Auth.saveUsers) window.Auth.saveUsers(users);
		refreshRosterAfterMutation();
		showToast(
			`${succeeded} account(s) ${targetStatus === 'active' ? 'activated' : 'suspended'}`,
			'success',
		);
		if (typeof logActivity === 'function') {
			logActivity(
				'class',
				`${succeeded} student account(s)`,
				targetStatus === 'active' ? 'activated' : 'suspended',
				{ classId: assignClassStudentsId, count: succeeded },
			);
		}
	}
	if (succeeded < targets.length) {
		showToast(
			`${targets.length - succeeded} account(s) could not be updated on the server`,
			'error',
		);
	}
}

// Export just the selected students as CSV (number, name, account, status).
function exportSelectedStudents() {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('students')
		: [];
	if (!ids.length) {
		showToast('No students selected', 'error');
		return;
	}
	const idSet = new Set(ids.map(String));
	const students = Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item'),
	)
		.filter((el) => idSet.has(String(el.dataset.number || '').trim()))
		.map((el) => {
			const account = getRosterAccountInfo(el.dataset.number);
			const status = !account
				? 'no account'
				: isDisabledAccountStatus(account.status)
					? 'disabled'
					: 'active';
			return {
				number: String(el.dataset.number || '').trim(),
				name: String(el.dataset.name || '').trim(),
				account: account ? String(account.username || '') : '',
				status,
			};
		});

	if (!students.length) {
		showToast('No selected students found in the roster', 'warning');
		return;
	}

	let csv = 'Number,Name,Account,Status\n';
	students.forEach((student) => {
		csv += `"${student.number}","${student.name}","${student.account}","${student.status}"\n`;
	});

	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	const assignedClass = assignClassStudentsId
		? classes.find((c) => c.id === assignClassStudentsId)
		: null;
	const className = assignedClass?.name || 'students';
	link.setAttribute('href', url);
	link.setAttribute(
		'download',
		`${className}_selected_students_${new Date().toISOString().split('T')[0]}.csv`,
	);
	link.click();
	showToast(`Exported ${students.length} selected student(s)`, 'success');
}

function setupClassEventListeners() {
	if (classListenersBound) return;
	classListenersBound = true;

	document.getElementById('classForm').addEventListener('submit', function (e) {
		e.preventDefault();
		saveClassForm();
	});

	document
		.getElementById('classSearch')
		.addEventListener('keyup', filterClasses);

	const teacherFilterEl = document.getElementById('classTeacherFilter');
	if (teacherFilterEl) {
		teacherFilterEl.addEventListener('change', filterClasses);
	}
}

async function saveClassForm() {
	const className = document.getElementById('className').value;

	// Roster and exam assignments are managed by the dedicated Assign
	// Students / Assign Exams modals (table actions). Preserve whatever the
	// class already has.
	const existing = currentClassId
		? classes.find((c) => c.id === currentClassId)
		: null;
	const students = Array.isArray(existing?.students) ? existing.students : [];

	const classData = {
		id: currentClassId || generateUUID(),
		name: className,
		students: students,
		dateCreated: currentClassId
			? classes.find((c) => c.id === currentClassId).dateCreated
			: new Date().toISOString(),
		ownerId: currentClassId
			? classes.find((c) => c.id === currentClassId)?.ownerId ||
				window.Auth?.getCurrentUser?.()?.id ||
				''
			: window.Auth?.getCurrentUser?.()?.id || '',
	};

	if (currentClassId) {
		const index = classes.findIndex((c) => c.id === currentClassId);
		classes[index] = classData;
	} else {
		classes.push(classData);
	}

	// ── Persist to the backend FIRST ─────────────────────────────────────────
	// Mirror on localStorage happens implicitly via saveClasses() below, but
	// the server is the source of truth. If this call fails, we abort with an
	// error so the admin knows the row never made it to the DB.
	if (window.API && typeof window.API.create === 'function') {
		try {
			const payload = {
				name: classData.name,
				// Class schema doesn't carry a students array or ownerId — those
				// live in our local cache only. Just send the persistable fields.
				description: classData.description || '',
			};
			let saved = null;
			if (currentClassId) {
				saved = await window.API.update('classes', currentClassId, payload);
			} else {
				saved = await window.API.create('classes', payload);
			}
			if (saved && saved.id) {
				// Adopt the server id so subsequent updates/deletes hit the
				// right row instead of creating orphans.
				classData.id = saved.id;
				const i = classes.findIndex(
					(c) => c.id === currentClassId || c.name === classData.name,
				);
				if (i !== -1) classes[i] = classData;
				// Teachers may only place students in assigned classes, and the
				// server just auto-assigned this new class to them — mirror
				// that here so their Users view works immediately instead of
				// waiting for the next bootstrap/refresh.
				try {
					const me = window.Auth?.getCurrentUser?.();
					if (
						me &&
						String(me.role || '').toLowerCase() === 'teacher' &&
						!currentClassId
					) {
						const raw = localStorage.getItem('quizTeacherClassAssignments');
						const map = raw ? JSON.parse(raw) : {};
						const ids = new Set(
							(Array.isArray(map[me.id]) ? map[me.id] : []).map(String),
						);
						ids.add(String(saved.id));
						map[me.id] = [...ids];
						localStorage.setItem(
							'quizTeacherClassAssignments',
							JSON.stringify(map),
						);
						sessionStorage.setItem('quizTeacherClassAssignmentsDirty', '1');
					}
				} catch (_) {
					/* mirror is best-effort; the server holds the truth */
				}
			}
		} catch (apiErr) {
			console.warn('[classes] API save failed:', apiErr);
			showToast(
				'Failed to save class on server: ' +
					(apiErr?.message || 'network error'),
				'error',
			);
			return; // don't update localStorage either — keep both sides aligned
		}
	}

	// Log activity
	if (typeof logActivity === 'function') {
		logActivity(
			'class',
			classData.name,
			currentClassId ? 'edited' : 'created',
			{
				id: classData.id,
				studentCount: students.length,
			},
		);
	}

	// Save classes and update UI
	saveClasses();
	updateClassList();
	closeClassModal();

	// If teacher, ensure this class is assigned to them
	if (window.Auth?.isTeacher && window.Auth.isTeacher()) {
		const user = window.Auth.getCurrentUser();
		if (user && Array.isArray(user.classIds)) {
			if (!user.classIds.includes(classData.id)) {
				user.classIds.push(classData.id);
				const users = window.Auth.getUsers ? window.Auth.getUsers() : [];
				const idx = users.findIndex((u) => u.id === user.id);
				if (idx !== -1) {
					users[idx].classIds = user.classIds;
					window.Auth.saveUsers && window.Auth.saveUsers(users);
					if (window.currentUser && window.currentUser.id === user.id) {
						window.currentUser.classIds = user.classIds;
					}
				}
			}
		}
	}

	showToast('Class saved successfully!');
}

function editClass(classId) {
	loadClasses();
	currentClassId = classId;
	const classData = classes.find((c) => c.id === classId);
	if (!classData) {
		showToast('Class not found', 'error');
		return;
	}

	// Roster and exam assignments are managed via the dedicated Assign modals.
	document.getElementById('classModalTitle').textContent = 'Edit Class';
	document.getElementById('className').value = classData.name;

	openClassModal();
}

// ============================================
// ASSIGN STUDENTS MODAL (class ↔ students)
// ============================================
// Roster management was split out of the create/edit modal: the classes
// table's "Assign Students" action opens this dedicated modal. The roster
// markup keeps its original element IDs (studentNumber, studentName,
// selectedStudentsList, studentUserPicker, …) so the existing roster helpers
// keep working unchanged.

let assignClassStudentsId = null;

function openAssignClassStudents(classId) {
	loadClasses();
	const classData = classes.find((c) => String(c.id) === String(classId));
	if (!classData) {
		showToast('Class not found', 'error');
		return;
	}

	assignClassStudentsId = classId;
	currentClassId = classId;

	// Ensure Classes tab is active
	if (typeof window.openTab === 'function') {
		const classesTab = document.getElementById('classes');
		if (classesTab && !classesTab.classList.contains('active')) {
			window.openTab(null, 'classes');
		}
	}

	const listPane = document.getElementById('classListPane');
	const studentsPane = document.getElementById('classStudentsPane');
	if (listPane && studentsPane) {
		listPane.classList.add('hidden');
		studentsPane.classList.remove('hidden');
	}

	// Update Breadcrumb & Header Title
	const breadcrumbText = document.getElementById('classStudentsBreadcrumbText');
	if (breadcrumbText) {
		breadcrumbText.textContent = `Classes › ${classData.name} › Students`;
	}
	const titleEl = document.getElementById('assignClassStudentsTitle');
	if (titleEl) {
		titleEl.textContent = `Students Management — ${classData.name}`;
	}

	// Update Hero KPIs
	const kpiStudents = document.getElementById('classKpiStudentsCount');
	if (kpiStudents) {
		kpiStudents.textContent = Array.isArray(classData.students) ? classData.students.length : 0;
	}
	const exams = (window.__DI_CONTAINER__?.repo?.getAll_sync
		? window.__DI_CONTAINER__.repo.getAll_sync('exams')
		: []) || [];
	const kpiExams = document.getElementById('classKpiExamsCount');
	if (kpiExams) {
		kpiExams.textContent = exams.filter((e) => Array.isArray(e.classes) && e.classes.includes(classId)).length;
	}
	const allUsers = (window.__DI_CONTAINER__?.repo?.getAll_sync
		? window.__DI_CONTAINER__.repo.getAll_sync('users')
		: []) || [];
	const activeCount = allUsers.filter(
		(u) => String(u.role || '').toLowerCase() === 'student' &&
			String(u.classId || '') === String(classId) &&
			!u.disabled,
	).length;
	const kpiActive = document.getElementById('classKpiActiveAccounts');
	if (kpiActive) {
		kpiActive.textContent = activeCount;
	}

	// Seed the roster with the class's current students
	const studentsList = document.getElementById('selectedStudentsList');
	if (studentsList) studentsList.innerHTML = '';
	const mergedStudents = mergeStudentEntries(
		classData.students || [],
		getStudentsFromUsers(classId),
	);
	mergedStudents.forEach((student) => {
		studentsList.appendChild(createStudentItem(student.number, student.name));
	});
	// Reset the roster toolbar controls (search / status / sort / pagination
	// page) so every class opens on a clean, page-1 view.
	const classFilter = document.getElementById('studentClassFilter');
	if (classFilter) classFilter.value = 'all';
	const pickerSearch = document.getElementById('studentPickerSearch');
	if (pickerSearch) pickerSearch.value = '';
	const rosterSearch = document.getElementById('studentRosterSearch');
	if (rosterSearch) rosterSearch.value = '';
	const rosterStatus = document.getElementById('studentRosterStatusFilter');
	if (rosterStatus) rosterStatus.value = 'all';
	const rosterSortBy = document.getElementById('studentRosterSortBy');
	if (rosterSortBy) rosterSortBy.value = 'name';
	rosterSortDirection = 'asc';
	const sortDirBtn = document.getElementById('sortRosterDirection');
	if (sortDirBtn) sortDirBtn.classList.remove('desc');
	const rosterPageEl = document.getElementById('rosterCurrentPage');
	if (rosterPageEl) rosterPageEl.textContent = '1';

	// Bulk Enable/Disable touch user accounts — an admin-only operation.
	// Hide the buttons for teacher sessions.
	const isAdminSession = window.Auth?.isAdmin?.() === true;
	document
		.querySelectorAll('#classStudentsPane .admin-only-bulk-action')
		.forEach((btn) => {
			btn.classList.toggle('hidden', !isAdminSession);
		});

	renderStudentRosterTable();

	// Legacy fallback if modal exists instead of pane
	const modal = document.getElementById('assignClassStudentsModal');
	if (modal && !studentsPane) {
		if (typeof window.promoteAssignModal === 'function') {
			window.promoteAssignModal(modal);
		}
		openModalLike(modal, 'className');
	}

	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeAssignClassStudents() {
	const listPane = document.getElementById('classListPane');
	const studentsPane = document.getElementById('classStudentsPane');
	if (listPane && studentsPane) {
		studentsPane.classList.add('hidden');
		listPane.classList.remove('hidden');
	}
	const modal = document.getElementById('assignClassStudentsModal');
	if (modal && typeof closeModalLike === 'function') {
		closeModalLike(modal);
	}
	assignClassStudentsId = null;
	updateClassList();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openClassExamsAction() {
	if (currentClassId) openAssignClassExams(currentClassId);
}

function openClassGamesAction() {
	if (currentClassId && typeof window.openClassGamesModal === 'function') {
		window.openClassGamesModal(currentClassId);
	}
}

function openClassEditAction() {
	if (currentClassId) editClass(currentClassId);
}

async function openClassDeleteAction() {
	if (currentClassId) {
		const targetId = currentClassId;
		if (confirm('Are you sure you want to delete this class?')) {
			const deleted = await deleteClass(targetId);
			if (deleted !== false) {
				closeAssignClassStudents();
			}
		}
	}
}

// Icons for the class row actions (shared by the row bar and the action
// sheet; the CSS scales them to the right size for each surface).
const CLASS_ACTION_ICONS = {
	students:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
		'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>' +
		'<circle cx="9" cy="7" r="4"></circle>' +
		'<path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>' +
		'<path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
	assignExams:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
		'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
		'<polyline points="14 2 14 8 20 8"></polyline>' +
		'<line x1="16" y1="13" x2="8" y2="13"></line>' +
		'<line x1="16" y1="17" x2="8" y2="17"></line></svg>',
	games:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
		'<rect x="2" y="6" width="20" height="12" rx="4"></rect>' +
		'<line x1="6" y1="10" x2="6" y2="14"></line>' +
		'<line x1="10" y1="10" x2="10" y2="14"></line>' +
		'<line x1="14" y1="10" x2="14" y2="14"></line>' +
		'<line x1="18" y1="10" x2="18" y2="14"></line></svg>',
	edit:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
		'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
		'<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
	remove:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
		'<polyline points="3 6 5 6 21 6"></polyline>' +
		'<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
};

// Actions offered on a class row.
//
// The class name is already a link to the roster (openAssignClassStudents)
// and the desktop row click opens the same page, so the "Manage Students"
// icon button was a third way to reach it: it stays in the mobile sheet (the
// only way in on a phone, where the sheet is the row's whole interface) but
// is no longer repeated on the desktop row.
//
// The desktop row keeps four icon buttons — Assign Exams, Add Game, Edit,
// Delete — and anything beyond that lands in the "…" popover.
function classRowActions(cls) {
	const id = cls.id;
	return [
		{
			key: 'students',
			label: 'Manage Students',
			title: 'Manage Students',
			hint: 'Roster and enrollment',
			cls: 'exam-classes-btn',
			icon: CLASS_ACTION_ICONS.students,
			onclick: `openAssignClassStudents('${id}')`,
			run: () => openAssignClassStudents(id),
			desktop: 'none',
		},
		{
			key: 'games',
			label: 'Add Game',
			title: 'Add Game',
			hint: 'Attach a game to this class',
			cls: 'exam-classes-btn',
			icon: CLASS_ACTION_ICONS.games,
			onclick: `openClassGamesModal('${id}')`,
			run: () => {
				if (typeof window.openClassGamesModal === 'function') {
					window.openClassGamesModal(id);
				}
			},
			desktop: 'visible',
		},
		{
			key: 'assign-exams',
			label: 'Assign Exams',
			title: 'Assign Exams',
			hint: 'Give exams to this class',
			cls: 'exam-assign-btn',
			icon: CLASS_ACTION_ICONS.assignExams,
			onclick: `openAssignClassExams('${id}')`,
			run: () => openAssignClassExams(id),
			desktop: 'visible',
		},
		{
			key: 'edit',
			label: 'Edit Class',
			title: 'Edit',
			hint: 'Name, teacher and options',
			cls: 'exam-edit-btn',
			icon: CLASS_ACTION_ICONS.edit,
			onclick: `editClass('${id}')`,
			run: () => editClass(id),
			desktop: 'visible',
		},
		{
			key: 'delete',
			label: 'Delete Class',
			title: 'Delete',
			hint: 'Remove the class and its roster',
			cls: 'exam-delete-btn',
			icon: CLASS_ACTION_ICONS.remove,
			onclick: `deleteClass('${id}')`,
			run: () => deleteClass(id),
			variant: 'danger',
			tone: 'danger',
			desktop: 'overflow',
		},
	];
}

// Mobile action sheet for a class row (mirrors the roster's student sheet).
function openClassActionSheet(classId) {
	const classData = classes.find((c) => String(c.id) === String(classId));
	if (!classData) return;
	if (window.MobileActionSheet) {
		window.MobileActionSheet.open(
			`Class: ${escapeHtml(classData.name)}`,
			window.RowActions.sheetItems(classRowActions(classData)),
		);
	}
}

window.openClassExamsAction = openClassExamsAction;
window.openClassGamesAction = openClassGamesAction;
window.openClassEditAction = openClassEditAction;
window.openClassDeleteAction = openClassDeleteAction;

// ============================================
// ASSIGN EXAMS MODAL (class ↔ exams)
// ============================================
// The classes table's "Assign Exams" action opens the exam selection list;
// saving syncs exam.classes across the exam cache (legacy local shape).

let assignClassExamsId = null;

function openAssignClassExams(classId) {
	loadClasses();
	const modal = document.getElementById('assignClassExamsModal');
	if (!modal) {
		showToast('Assign Exams modal not found', 'error');
		return;
	}
	const classData = classes.find((c) => c.id === classId);
	if (!classData) {
		showToast('Class not found', 'error');
		return;
	}

	assignClassExamsId = classId;

	const titleEl = document.getElementById('assignClassExamsTitle');
	if (titleEl) titleEl.textContent = `Assign Exams — ${classData.name}`;

	// Render the exam list and pre-mark exams already assigned to this class
	loadAvailableExams();
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const assignedExams = exams.filter((exam) => exam.classes?.includes(classId));
	assignedExams.forEach((exam) => {
		const examElement = document.querySelector(
			`.exam-item[data-exam-id="${exam.id}"]`,
		);
		if (examElement) {
			examElement.classList.add('selected');
		}
	});
	updateAssignClassExamsCount();

	const searchEl = document.getElementById('examSearchInClass');
	if (searchEl) searchEl.value = '';

	if (typeof window.promoteAssignModal === 'function') {
		window.promoteAssignModal(modal);
	}
	openModalLike(modal, 'examSearchInClass');
}

function closeAssignClassExams() {
	const modal = document.getElementById('assignClassExamsModal');
	if (modal) {
		closeModalLike(modal);
	}
	assignClassExamsId = null;
}

function updateAssignClassExamsCount() {
	const countEl = document.getElementById('assignClassExamsCount');
	if (!countEl) return;
	const selected = document.querySelectorAll(
		'#availableExams .exam-item.selected',
	).length;
	countEl.textContent = `${selected} selected`;
}

async function saveAssignClassExams() {
	if (!assignClassExamsId) return;
	const classId = assignClassExamsId;
	const classData = classes.find((c) => c.id === classId);
	if (!classData) {
		showToast('Class not found', 'error');
		return;
	}

	const selectedExams = Array.from(
		document.querySelectorAll('#availableExams .exam-item.selected'),
	).map((el) => el.dataset.examId);

	// Mirror the assignment into every exam's classes array (local cache)
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const updatedExams = [];
	exams.forEach((exam) => {
		if (!exam.classes) exam.classes = [];
		if (selectedExams.includes(exam.id)) {
			if (!exam.classes.includes(classId)) {
				exam.classes.push(classId);
				updatedExams.push(exam.name);
			}
		} else if (exam.classes.includes(classId)) {
			exam.classes = exam.classes.filter((id) => id !== classId);
			updatedExams.push(exam.name);
		}
	});
	window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);

	// Persist touched exams to the backend
	if (window.API && typeof window.API.update === 'function') {
		for (const exam of exams) {
			if (!updatedExams.includes(exam.name)) continue;
			try {
				await window.API.update('exams', exam.id, {
					name: exam.name,
					duration: exam.duration,
					passingScore: exam.passingScore,
					questions: Array.isArray(exam.questions) ? exam.questions : [],
					classes: exam.classes,
					presetId: exam.presetId || null,
				});
			} catch (apiErr) {
				console.warn('[classes] API exam assignment sync failed:', apiErr);
			}
		}
	}

	closeAssignClassExams();
	updateClassList();
	if (typeof window.updateExamList === 'function') {
		window.updateExamList();
	}
	if (window.initDashboard) window.initDashboard();

	showToast(
		updatedExams.length
			? `${updatedExams.length} exam assignment(s) updated for "${classData.name}"!`
			: 'No exam assignment changes.',
		'success',
	);

	if (typeof logActivity === 'function') {
		logActivity('class', classData.name, 'assigned exams', {
			id: classData.id,
			examCount: selectedExams.length,
		});
	}
}

async function deleteClass(classId) {
	if (confirm('Are you sure you want to delete this class?')) {
		// Persist the delete to the backend first. Only when the server
		// confirms the row is gone do we update the local cache and the
		// dependent exam / teacher records.
		if (window.API && typeof window.API.remove === 'function') {
			try {
				await window.API.remove('classes', classId);
			} catch (apiErr) {
				console.warn('[classes] API delete failed:', apiErr);
				showToast(
					'Failed to delete class on server: ' +
						(apiErr?.message || 'network error'),
					'error',
				);
				return;
			}
		}

		// Remove class from exams
		const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
		exams.forEach((exam) => {
			if (exam.classes) {
				exam.classes = exam.classes.filter((id) => id !== classId);
			}
		});
		window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);

		// Remove class
		classes = classes.filter((c) => c.id !== classId);
		saveClasses();
		updateClassList();
		showToast('Class deleted successfully!');

		// Remove class assignment from teachers
		if (window.Auth?.getUsers && window.Auth?.saveUsers) {
			const users = window.Auth.getUsers();
			let changed = false;
			users.forEach((u) => {
				if (Array.isArray(u.classIds) && u.classIds.includes(classId)) {
					u.classIds = u.classIds.filter((id) => id !== classId);
					changed = true;
				}
			});
			if (changed) {
				window.Auth.saveUsers(users);
			}
		}
		// ... and from the local assignments mirror (flagged newer than the
		// repo cache) so the deleted id stops matching in every teacher view.
		try {
			const raw = localStorage.getItem('quizTeacherClassAssignments');
			if (raw) {
				const map = JSON.parse(raw) || {};
				let changed = false;
				Object.keys(map).forEach((tid) => {
					if (
						Array.isArray(map[tid]) &&
						map[tid].map(String).includes(String(classId))
					) {
						map[tid] = map[tid]
							.map(String)
							.filter((id) => id !== String(classId));
						changed = true;
					}
				});
				if (changed) {
					localStorage.setItem(
						'quizTeacherClassAssignments',
						JSON.stringify(map),
					);
					sessionStorage.setItem('quizTeacherClassAssignmentsDirty', '1');
				}
			}
		} catch (_) {
			/* mirror is best-effort; the server holds the truth */
		}
	}
}

function getClassTeacherIndex() {
	const users = window.Auth?.getUsers ? window.Auth.getUsers() : [];
	const teachers = users
		.filter((u) => String(u.role || '').toLowerCase() === 'teacher')
		.sort((a, b) =>
			String(a.name || a.username || '').localeCompare(
				String(b.name || b.username || ''),
			),
		);
	const nameById = new Map(
		teachers.map((t) => [String(t.id), t.name || t.username || 'Teacher']),
	);
	// Same freshness contract as the users table: the fresher assignments
	// map (mirror if this tab saved after bootstrap, else repo cache),
	// unioned with each teacher row — a stale single source must never
	// hide a class.
	let dirty = false;
	try {
		dirty =
			sessionStorage.getItem('quizTeacherClassAssignmentsDirty') === '1';
	} catch (_) {}
	let map = {};
	const readMirror = () => {
		try {
			const raw = localStorage.getItem('quizTeacherClassAssignments');
			const parsed = raw ? JSON.parse(raw) : {};
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (_) {
			return {};
		}
	};
	if (!dirty) {
		try {
			const repo = window.__DI_CONTAINER__?.repo;
			const raw = repo?.getValue_sync?.('settings', {});
			const row =
				raw && Array.isArray(raw.settings)
					? raw.settings.find((s) => s && s.key === 'teacherClassAssignments')
					: null;
			if (row?.value) {
				const parsed = JSON.parse(row.value);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					map = parsed;
				}
			}
		} catch (_) {}
	}
	if (!Object.keys(map).length) map = readMirror();
	const namesByClass = new Map();
	const classIdsByTeacher = new Map();
	teachers.forEach((t) => {
		const tid = String(t.id);
		const ids = [
			...new Set([
				...((map[tid] || []).map(String)),
				...((t.classIds || []).map(String)),
			]),
		];
		classIdsByTeacher.set(tid, ids);
		ids.forEach((cid) => {
			if (!cid) return;
			if (!namesByClass.has(cid)) namesByClass.set(cid, []);
			namesByClass.get(cid).push(nameById.get(tid));
		});
	});
	return {
		teachers: teachers.map((t) => ({
			id: String(t.id),
			name: nameById.get(String(t.id)),
		})),
		namesByClass,
		classIdsByTeacher,
	};
}

function refreshClassTeacherFilter() {
	const sel = document.getElementById('classTeacherFilter');
	if (!sel) return;
	const wrap = document.getElementById('classTeacherFilterWrap');
	const admin = !!(window.Auth?.isAdmin && window.Auth.isAdmin());
	if (wrap) wrap.style.display = admin ? '' : 'none';
	if (!admin) {
		sel.value = '';
		return;
	}
	const current = sel.value;
	const { teachers } = getClassTeacherIndex();
	sel.innerHTML =
		'<option value="">All Teachers</option>' +
		teachers
			.map(
				(t) =>
					`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`,
			)
			.join('');
	sel.value = teachers.some((t) => t.id === String(current)) ? current : '';
}

function filterClasses() {
	const searchTerm = (
		document.getElementById('classSearch').value || ''
	).toLowerCase();
	const teacherEl = document.getElementById('classTeacherFilter');
	const teacherScope = teacherEl ? String(teacherEl.value || '') : '';
	let teacherClassIds = null;
	if (teacherScope) {
		const { classIdsByTeacher } = getClassTeacherIndex();
		teacherClassIds = new Set(classIdsByTeacher.get(teacherScope) || []);
	}
	const filteredClasses = classes.filter((c) => {
		if (teacherClassIds && !teacherClassIds.has(String(c.id))) return false;
		return (
			String(c.name || '')
				.toLowerCase()
				.includes(searchTerm) ||
			(Array.isArray(c.students) ? c.students : []).some(
				(s) =>
					String((s && s.name) || '')
						.toLowerCase()
						.includes(searchTerm) ||
					String((s && (s.number ?? s.numero)) || '')
						.toLowerCase()
						.includes(searchTerm),
			)
		);
	});
	updateClassList(filteredClasses);
}

function filterExamsInClass() {
	const searchTerm = document
		.getElementById('examSearchInClass')
		.value.toLowerCase();
	const examItems = document.querySelectorAll('.exam-item');

	examItems.forEach((item) => {
		const examName = item.querySelector('.exam-name').textContent.toLowerCase();
		const examInfo = item.querySelector('.exam-info').textContent.toLowerCase();
		const shouldShow =
			examName.includes(searchTerm) || examInfo.includes(searchTerm);
		item.style.display = shouldShow ? '' : 'none';
	});
}

function toggleClassSortDirection() {
	const button = document.getElementById('sortClassDirection');
	classSortDirection = classSortDirection === 'asc' ? 'desc' : 'asc';
	button.classList.toggle('desc', classSortDirection === 'desc');
	sortClasses();
}

function sortClasses() {
	const sortBy = document.getElementById('classSortBy').value;
	const tbody = document.querySelector('#classList tbody');
	const rows = Array.from(tbody.querySelectorAll('tr'));

	rows.sort((a, b) => {
		let aValue, bValue;

		// NOTE: first <td> is the bulk checkbox cell — data cells start after it.
		const dataCells = (row) =>
			Array.from(row.querySelectorAll('td:not(.checkbox-cell)'));
		switch (sortBy) {
			case 'name':
				aValue = dataCells(a)[0]?.textContent || '';
				bValue = dataCells(b)[0]?.textContent || '';
				break;
			case 'date':
				aValue = new Date(dataCells(a)[1]?.textContent || '');
				bValue = new Date(dataCells(b)[1]?.textContent || '');
				break;
			case 'students':
				aValue = parseInt(dataCells(a)[2]?.textContent || '0');
				bValue = parseInt(dataCells(b)[2]?.textContent || '0');
				break;
		}

		if (classSortDirection === 'desc') {
			[aValue, bValue] = [bValue, aValue];
		}

		if (typeof aValue === 'string') {
			return aValue.localeCompare(bValue);
		}
		return aValue - bValue;
	});

	// Clear and re-append sorted rows
	tbody.innerHTML = '';
	rows.forEach((row) => tbody.appendChild(row));
}

function updateClassList(classesList = classes) {
	const tbody = document.querySelector('#classList tbody');
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const teacherIndex = getClassTeacherIndex();
	refreshClassTeacherFilter();
	const classTable = document.getElementById('classList');
	if (classTable) {
		// Teachers see only their own classes — a Teacher column repeating
		// their name on every row is noise, so hide it for them (same
		// pattern as the users table teacher-view).
		classTable.classList.toggle(
			'teacher-view',
			!!(window.Auth?.isTeacher && window.Auth.isTeacher()),
		);
	}

	// Clear existing table rows
	tbody.innerHTML = '';

	// Admin-only teacher scope (the class filter dropdown is hidden for
	// non-admins by refreshClassTeacherFilter, so this is a no-op for them).
	const classTeacherScope = (() => {
		try {
			if (!(window.Auth?.isAdmin && window.Auth.isAdmin())) return '';
			const el = document.getElementById('classTeacherFilter');
			return el ? String(el.value || '') : '';
		} catch (_) {
			return '';
		}
	})();

	const visibleClasses = classesList.filter((cls) => {
		if (
			window.Auth?.canAccessItem &&
			!window.Auth.canAccessItem('class', cls)
		) {
			return false;
		}
		if (classTeacherScope) {
			if (window.TeacherFilter) {
				if (!window.TeacherFilter.matchesClass(cls, classTeacherScope)) {
					return false;
				}
			} else {
				const scoped = new Set(
					teacherIndex.classIdsByTeacher.get(classTeacherScope) || [],
				);
				if (!scoped.has(String(cls.id))) return false;
			}
		}
		return true;
	});

	// Sort logic (using visibleClasses for role-safe display)
	const sortedClasses = [...visibleClasses].sort((a, b) => {
		const sortBy = document.getElementById('classSortBy').value; // Get current sort criteria
		const sortDirection = classSortDirection; // Get current sort direction

		let valA, valB;
		switch (sortBy) {
			case 'name':
				valA = a.name;
				valB = b.name;
				break;
			case 'date': // Assuming 'date' maps to 'dateCreated'
				valA = new Date(a.dateCreated);
				valB = new Date(b.dateCreated);
				break;
			case 'students': // Assuming 'students' maps to student count
				valA = a.students ? a.students.length : 0;
				valB = b.students ? b.students.length : 0;
				break;
			default: // Default to sorting by name if sortBy is not recognized
				valA = a.name;
				valB = b.name;
		}

		if (typeof valA === 'string') {
			const comparison = valA.toLowerCase().localeCompare(valB.toLowerCase());
			return sortDirection === 'asc' ? comparison : -comparison;
		} else {
			const comparison = valA - valB;
			return sortDirection === 'asc' ? comparison : -comparison;
		}
	});

	sortedClasses.forEach((cls) => {
		const row = document.createElement('tr');
		row.setAttribute('data-id', cls.id);
		row.classList.add('clickable-class-row');

		// Click anywhere on the class row navigates directly to the Students
		// page — except on mobile, where the tap opens the action sheet
		// (same identity as the questions/exams tables) and navigation goes
		// through the sheet's "Manage Students" action.
		row.addEventListener('click', (e) => {
			// Don't trigger if clicking action button, input or checkbox directly
			if (e.target.closest('button, input, select, .checkbox-cell, a')) return;
			if (window.innerWidth <= 768) return;
			e.stopPropagation();
			openAssignClassStudents(cls.id);
		});

		const studentCount = cls.students ? cls.students.length : 0;
		const classTeachers =
			teacherIndex.namesByClass.get(String(cls.id)) || [];
		const teacherCell = classTeachers.length
			? escapeHtml(classTeachers.join(', '))
			: '<span class="text-muted">Unassigned</span>';
		const assignedExams = exams
			.filter((e) => e.classes?.includes(cls.id))
			.filter((e) =>
				window.Auth?.canAccessItem
					? window.Auth.canAccessItem('exam', e)
					: true,
			)
			.map((e) => e.name);
		const examCount = assignedExams.length;
		// Note: averageScore is not part of the current classData structure.
		// It would need to be calculated or stored if desired.
		const averageScore = '-'; // Placeholder as it's not available in classData

		const rawCreatedAt =
			cls.dateCreated || cls.created_at || cls.createdAt || cls.date_created;
		const parsedCreatedAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
		const dateCreated =
			parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
				? parsedCreatedAt.toLocaleDateString()
				: '-';

		row.innerHTML = `
            <td class="checkbox-cell" data-label="Select">
                <input type="checkbox"
                    class="class-checkbox"
                    data-id="${cls.id}"
                    onchange="toggleBulkRowSelection(this,'classes')">
            </td>
            <td data-label="Class"><a href="javascript:void(0)" class="class-name-link" onclick="openAssignClassStudents('${cls.id}'); event.stopPropagation();" title="Manage students in ${escapeHtml(cls.name)}">${escapeHtml(cls.name)}</a></td>
            <td data-label="Created">${dateCreated}</td>
            <td data-label="Students"><span class="badge badge-subtle">${studentCount} students</span></td>
            <td data-label="Teacher">${teacherCell}</td>
            <td data-label="Exams">${examCount}</td>
            <td class="class-assigned-games-cell" data-label="Games">${
							window.renderClassGamesCell
								? window.renderClassGamesCell(cls.id)
								: 'No games'
						}</td>
            <td class="owner-col" data-label="By">${window.TeacherFilter ? window.TeacherFilter.ownerBadge(cls) : ''}</td>
            <td class="actions-cell" data-label="Actions">
                <div class="exam-actions">
                    ${window.RowActions.render(classRowActions(cls))}
                </div>
            </td>
        `;
		tbody.appendChild(row);
	});

	// Mobile: tap a class row to open the action sheet (same identity as the
	// roster / questions tables). Controls keep their own behavior.
	if (window.innerWidth <= 768) {
		tbody.querySelectorAll('tr.clickable-class-row').forEach((rowEl) => {
			rowEl.addEventListener('click', (e) => {
				if (e.target.closest('button, input, select, a')) return;
				const classId = rowEl.dataset.id;
				if (classId) openClassActionSheet(classId);
			});
		});
	}

	// Owner badges are admin-only (see teacher-filter.js + hide-owner-col CSS).
	if (classTable) {
		const admin = window.TeacherFilter
			? window.TeacherFilter.isAdminSession()
			: !!(window.Auth?.isAdmin && window.Auth.isAdmin());
		classTable.classList.toggle('hide-owner-col', !admin);
	}

	// Restore bulk selection (filter/sort safe) + refresh bulk bar
	if (window.BulkSelect) window.BulkSelect.restore('classes');
}

// Function to render exam items in class modal
function renderExamItem(exam) {
	const questionCount = exam.questions ? exam.questions.length : 0;

	// Get all questions from localStorage
	const allQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');

	// Check if the exam has valid questions
	const validQuestions = exam.questions
		? exam.questions.filter((index) => allQuestions[index])
		: [];
	const validQuestionCount = validQuestions.length;
	const hasValidQuestions = validQuestionCount > 0;

	// Create a class for exams with no valid questions
	const examClass = hasValidQuestions ? 'exam-item' : 'exam-item disabled-exam';

	return `
        <div class="${examClass}" onclick="toggleExamSelection(this)" data-exam-id="${
					exam.id
				}">
            <div class="exam-item-details">
                <div class="exam-name">${escapeHtml(exam.name)}</div>
                <div class="exam-info">
                    Questions: ${validQuestionCount}/${questionCount} | Duration: ${
											exam.duration || 0
										}min
                </div>
                ${
									!hasValidQuestions
										? '<div class="exam-warning">No valid questions</div>'
										: ''
								}
            </div>
        </div>
    `;
}

function toggleExamSelection(element) {
	element.classList.toggle('selected');

	// Get selected exams and update count
	const selectedExams = getSelectedExams();

	// Update UI elements showing selected count
	updateSelectedExamsCount(selectedExams.length);
	updateAssignClassExamsCount();
}

function getSelectedExams() {
	return Array.from(document.querySelectorAll('.exam-item.selected')).map(
		(item) => item.dataset.examId,
	);
}

function updateSelectedExamsCount(count) {
	const countElement = document.getElementById('selectedExamsCount');
	if (countElement) {
		countElement.textContent = count;
	}
}

function exportClasses() {
	const classes = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const dataStr = JSON.stringify(classes, null, 2);
	const dataUri =
		'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', 'quiz-classes.json');
	linkElement.click();
}

function importClasses() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (e) => {
		const file = e.target.files[0];
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const newClasses = JSON.parse(event.target.result);

				// Validate structure
				if (
					!Array.isArray(newClasses) ||
					!newClasses.every(isValidClassStructure)
				) {
					throw new Error('Invalid class data structure');
				}

				// Merge with existing classes, avoiding duplicates
				const existingClasses =
					window.__DI_CONTAINER__.repo.getAll_sync('classes');
				const mergedClasses = mergeClasses(existingClasses, newClasses);

				window.__DI_CONTAINER__.repo.setAll_sync('classes', mergedClasses);
				updateClassList(mergedClasses);
				showToast('Classes imported successfully!');
			} catch (error) {
				showToast('Error importing classes: ' + error.message, 'error');
			}
		};

		reader.readAsText(file);
	};

	input.click();
}

function isValidClassStructure(classObj) {
	return (
		classObj &&
		typeof classObj.id === 'string' &&
		typeof classObj.name === 'string' &&
		Array.isArray(classObj.students) &&
		typeof classObj.dateCreated === 'string'
	);
}

function mergeClasses(existing, imported) {
	const classMap = new Map(existing.map((c) => [c.id, c]));

	imported.forEach((newClass) => {
		if (!classMap.has(newClass.id)) {
			classMap.set(newClass.id, newClass);
		}
	});

	return Array.from(classMap.values());
}

function exportStudentsLegacy() {
	// Get students from the selected students list in the modal
	const students = Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item'),
	).map((el) => {
		const text = el.querySelector('span').textContent;
		const [number, name] = text.split(' - ');
		return {
			number: number.trim(),
			name: name.trim(),
		};
	});

	if (students.length === 0) {
		showToast('No students to export');
		return;
	}

	const dataStr = JSON.stringify(students, null, 2);
	const dataUri =
		'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', 'students.json');
	linkElement.click();
}

// Helper function to escape HTML special characters
function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
	document
		.getElementById('classSortBy')
		.addEventListener('change', sortClasses);
	loadAvailableExams();
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initClassManagement);
window.addEventListener('quiz:bootstrap-ready', function () {
	if (!document.getElementById('classList')) return;
	loadClasses();
	updateClassList();
	loadAvailableExams();
});

// Expose functions to window for HTML onclick handlers
window.createNewClass = createNewClass;
window.openClassModal = openClassModal;
window.closeClassModal = closeClassModal;
window.saveClass = saveClassForm;
window.editClass = editClass;
window.deleteClass = deleteClass;
window.addStudent = addStudent;
window.addStudentFromUserPicker = addStudentFromUserPicker;
window.addAllStudentsFromUsers = addAllStudentsFromUsers;
window.deselectAllStudentsInPicker = deselectAllStudentsInPicker;
window.onStudentClassFilterChange = onStudentClassFilterChange;
window.populateStudentUserPicker = populateStudentUserPicker;
window.filterStudentRosterTable = filterStudentRosterTable;
window.editRosterStudent = editRosterStudent;
window.removeRosterStudent = removeRosterStudent;
window.renderStudentRosterTable = renderStudentRosterTable;
window.refreshRosterAfterMutation = refreshRosterAfterMutation;
window.editStudent = editStudent;
window.openStudentActionSheet = openStudentActionSheet;
window.exportStudents = exportStudents;
window.exportSelectedStudents = exportSelectedStudents;
window.bulkSetStudentAccounts = bulkSetStudentAccounts;
window.openAddStudentsPickerModal = openAddStudentsPickerModal;
window.closeAddStudentsPickerModal = closeAddStudentsPickerModal;
window.switchAddStudentsTab = switchAddStudentsTab;
window.submitNewStudentForm = submitNewStudentForm;
window.approvePendingSignup = approvePendingSignup;
window.rejectPendingSignup = rejectPendingSignup;
window.toggleNewStudentPassword = toggleNewStudentPassword;
window.generateNewStudentPassword = generateNewStudentPassword;
window.renderStudentPickerList = renderStudentPickerList;
window.sortStudentRoster = sortStudentRoster;
window.toggleRosterSortDirection = toggleRosterSortDirection;
window.changeRosterPage = changeRosterPage;
window.openClassActionSheet = openClassActionSheet;
window.openAssignClassStudents = openAssignClassStudents;
window.closeAssignClassStudents = closeAssignClassStudents;
window.openAssignClassExams = openAssignClassExams;
window.closeAssignClassExams = closeAssignClassExams;
window.saveAssignClassExams = saveAssignClassExams;
window.updateAssignClassExamsCount = updateAssignClassExamsCount;

// ============================================
// BULK SELECTION - DELETE SELECTED (question-tab style)
// ============================================
async function deleteSelectedClasses() {
	const ids = window.BulkSelect
		? window.BulkSelect.getSelectedIds('classes')
		: [];
	const targets = ids.filter((id) =>
		classes.some((c) => String(c.id) === String(id)),
	);
	if (!targets.length) {
		showToast('No classes selected', 'error');
		return;
	}
	if (
		!confirm(
			`Are you sure you want to delete ${targets.length} class(es)?`,
		)
	) {
		return;
	}
	const failed = [];
	for (const classId of targets) {
		if (window.API && typeof window.API.remove === 'function') {
			try {
				await window.API.remove('classes', classId);
			} catch (apiErr) {
				console.warn('[classes] bulk API delete failed:', apiErr);
				failed.push(classId);
				continue;
			}
		}
	}
	const okIds = new Set(targets.filter((id) => !failed.includes(id)));
	if (okIds.size) {
		// Mirror deleteClass local cleanup in one pass.
		const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams') || [];
		exams.forEach((exam) => {
			if (Array.isArray(exam.classes)) {
				exam.classes = exam.classes.filter((id) => !okIds.has(String(id)));
			}
		});
		window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);
		classes = classes.filter((c) => !okIds.has(String(c.id)));
		saveClasses();
		updateClassList();
		if (window.BulkSelect) window.BulkSelect.clear('classes');
		if (typeof logActivity === 'function') {
			logActivity('class', `${okIds.size} Classes`, 'deleted', {
				count: okIds.size,
			});
		}
		try {
			const raw = localStorage.getItem('quizTeacherClassAssignments');
			if (raw) {
				const map = JSON.parse(raw) || {};
				let changed = false;
				Object.keys(map).forEach((tid) => {
					if (Array.isArray(map[tid])) {
						const next = map[tid]
							.map(String)
							.filter((id) => !okIds.has(id));
						if (next.length !== map[tid].length) {
							map[tid] = next;
							changed = true;
						}
					}
				});
				if (changed) {
					localStorage.setItem(
						'quizTeacherClassAssignments',
						JSON.stringify(map),
					);
					sessionStorage.setItem('quizTeacherClassAssignmentsDirty', '1');
				}
			}
		} catch (_) {
			/* mirror is best-effort */
		}
	}
	if (failed.length) {
		showToast(
			`Deleted ${okIds.size}; ${failed.length} failed on server — kept locally so you can retry`,
			'error',
		);
	} else {
		showToast(`Deleted ${okIds.size} class(es)!`);
	}
}
	window.deleteSelectedClasses = deleteSelectedClasses;
	window.deleteSelectedStudents = deleteSelectedStudents;

// Export students as CSV
function exportStudents() {
	const students = Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item'),
	).map((el) => ({
		number: String(el.dataset.number || '').trim(),
		name: String(el.dataset.name || '').trim(),
	}));

	if (students.length === 0) {
		showToast('No students to export', 'warning');
		return;
	}

	// Create CSV content
	let csv = 'Number,Name\n';
	students.forEach((student) => {
		csv += `"${student.number}","${student.name}"\n`;
	});

	// Download CSV
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	const assignedClass = assignClassStudentsId
		? classes.find((c) => c.id === assignClassStudentsId)
		: null;
	const className = assignedClass?.name || 'students';
	link.setAttribute('href', url);
	link.setAttribute(
		'download',
		`${className}_students_${new Date().toISOString().split('T')[0]}.csv`,
	);
	link.click();
	showToast('Students exported successfully', 'success');
}

// Class Management State
let classes = [];
let currentClassId = null;
let classSortDirection = 'asc';
let classListenersBound = false;

// Initialize class management
function initClassManagement() {
	loadClasses();
	updateClassList();
	setupClassEventListeners();

	const sortDirectionButton = document.getElementById('sortClassDirection');
	if (sortDirectionButton) {
		sortDirectionButton.classList.add('desc');
	}
}

function loadClasses() {
	const savedClasses = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes'));
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
		document.getElementById('selectedStudentsList').innerHTML = '';
		const classFilter = document.getElementById('studentClassFilter');
		if (classFilter) classFilter.value = 'all';
		populateStudentUserPicker();
		loadAvailableExams();
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
	modal.style.setProperty('z-index', '2147483000', 'important');
	modal.style.setProperty('opacity', '1', 'important');
	modal.style.setProperty('visibility', 'visible', 'important');
	modal.style.setProperty('pointer-events', 'auto', 'important');
}

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
	const numberInput = document.getElementById('studentNumber');
	const nameInput = document.getElementById('studentName');

	const number = numberInput.value.trim();
	const name = nameInput.value.trim();

	if (!number || !name) {
		showToast('Please enter both student number and name');
		return;
	}

	const existingNumbers = Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item'),
	).map((el) => String(el.dataset.number || '').trim());
	if (existingNumbers.includes(number)) {
		showToast('Student number already added');
		return;
	}

	const studentsList = document.getElementById('selectedStudentsList');
	studentsList.appendChild(createStudentItem(number, name));
	numberInput.value = '';
	nameInput.value = '';
	numberInput.focus();
	populateStudentUserPicker();
}

function normalizeStudentEntry(entry) {
	if (!entry) return null;
	const number = String(
		entry.number || entry.studentNumber || entry.numero || ''
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
				u.role === 'student' &&
				String(u.classId || '') === String(classId),
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

	window.safeSetHTML ? window.safeSetHTML(filterSelect, optionsHtml, true) : (filterSelect.innerHTML = optionsHtml);

	const hasCurrentValue = Array.from(filterSelect.options).some(
		(option) => String(option.value) === currentValue,
	);
	filterSelect.value = hasCurrentValue ? currentValue : 'all';
}

function getFilteredStudentUsersForPicker(users = getStudentUsersForPicker()) {
	const filterValue = getStudentClassFilterValue();
	if (filterValue === 'all') return users;

	const classById = getClassLookupMap();
	return users.filter((user) => {
		const classMeta = getUserClassMeta(user, classById);
		return classMeta.classKey === filterValue;
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
	if (!picker || picker.dataset.clickSelectEnabled === 'true') return;
	picker.dataset.clickSelectEnabled = 'true';

	picker.addEventListener('mousedown', (event) => {
		const target = event.target;
		if (!target || target.tagName !== 'OPTION') return;
		event.preventDefault();
		target.selected = !target.selected;
		picker.focus();
	});
}

function populateStudentUserPicker() {
	const picker = document.getElementById('studentUserPicker');
	if (!picker) return;

	const allUsers = getStudentUsersForPicker();
	populateStudentClassFilterOptions(allUsers);
	const users = getFilteredStudentUsersForPicker(allUsers);
	const classById = getClassLookupMap();
	const selectedNumbers = getSelectedStudentNumbers();
	const availableUsers = users
		.filter((user) => !selectedNumbers.has(String(user.studentNumber || '').trim()))
		.map((user) => {
			const classMeta = getUserClassMeta(user, classById);
			const classLabel = ` (${classMeta.classLabel})`;
			return {
				...user,
				label: `${user.studentNumber} - ${user.name || user.username}${classLabel}`,
			};
		});

	if (!availableUsers.length) {
		picker.innerHTML = '<option value="" disabled>No student users available</option>';
		enableStudentPickerClickSelection(picker);
		return;
	}

	picker.innerHTML = availableUsers
		.map(
			(user) =>
				`<option value="${escapeHtml(String(user.id))}">${escapeHtml(user.label)}</option>`,
		)
		.join('');
	enableStudentPickerClickSelection(picker);
}

function onStudentClassFilterChange() {
	populateStudentUserPicker();
}

function appendStudentFromUser(user, options = {}) {
	const quiet = options.quiet === true;
	if (!user) return false;
	const number = String(user.studentNumber || '').trim();
	const name = String(user.name || user.username || '').trim();
	if (!number || !name) {
		if (!quiet) showToast('Student user is missing number or name', 'error');
		return false;
	}

	const existingNumbers = getSelectedStudentNumbers();
	if (existingNumbers.has(number)) {
		if (!quiet) showToast('Student already added to this class', 'info');
		return false;
	}

	const studentsList = document.getElementById('selectedStudentsList');
	if (!studentsList) return false;
	studentsList.appendChild(createStudentItem(number, name, user.id));
	return true;
}

function addStudentFromUserPicker() {
	const picker = document.getElementById('studentUserPicker');
	if (!picker) return;
	const selectedIds = Array.from(picker.selectedOptions || [])
		.map((option) => String(option.value || '').trim())
		.filter(Boolean);
	if (!selectedIds.length) {
		showToast('Select one or more student users first', 'warning');
		return;
	}
	const byId = new Map(
		getStudentUsersForPicker().map((entry) => [String(entry.id), entry]),
	);
	let addedCount = 0;
	selectedIds.forEach((userId) => {
		const user = byId.get(userId);
		if (appendStudentFromUser(user, { quiet: true })) {
			addedCount += 1;
		}
	});
	if (!addedCount) {
		showToast('No new students were added', 'info');
		populateStudentUserPicker();
		return;
	}
	showToast(`Added ${addedCount} student(s) from users`, 'success');
	populateStudentUserPicker();
}

function addAllStudentsFromUsers() {
	const availableUsers = getFilteredStudentUsersForPicker(
		getStudentUsersForPicker(),
	).filter(
		(user) => !getSelectedStudentNumbers().has(String(user.studentNumber || '').trim()),
	);
	if (!availableUsers.length) {
		showToast('No available students to add', 'info');
		return;
	}
	let addedCount = 0;
	availableUsers.forEach((user) => {
		if (appendStudentFromUser(user, { quiet: true })) {
			addedCount += 1;
		}
	});
	showToast(`Added ${addedCount} student(s) from users`, 'success');
	populateStudentUserPicker();
}

function deselectAllStudentsInPicker() {
	const picker = document.getElementById('studentUserPicker');
	if (!picker) return;
	Array.from(picker.options || []).forEach((option) => {
		option.selected = false;
	});
	picker.blur();
}

function createStudentItem(number, name, userId = '') {
	const studentItem = document.createElement('div');
	studentItem.className = 'selected-student-item';
	studentItem.dataset.number = number;
	studentItem.dataset.name = name;
	if (userId) studentItem.dataset.userId = String(userId);
	studentItem.innerHTML = `
        <span>${escapeHtml(number)} - ${escapeHtml(name)}</span>
        <button type="button" class="remove-btn" onclick="this.parentElement.remove(); if (typeof populateStudentUserPicker === 'function') populateStudentUserPicker();">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;
	return studentItem;
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
}

async function saveClassForm() {
	const className = document.getElementById('className').value;

	// Get students
	const students = mergeStudentEntries(
		Array.from(
			document.querySelectorAll(
				'#selectedStudentsList .selected-student-item',
			),
		).map((el) => {
			const number =
				String(el.dataset.number || '').trim() ||
				String(el.querySelector('span')?.textContent || '').split(' - ')[0] ||
				'';
			const name =
				String(el.dataset.name || '').trim() ||
				String(el.querySelector('span')?.textContent || '').split(' - ')[1] ||
				'';
			return { number: number.trim(), name: name.trim() };
		}),
	);

	// Get selected exams
	const selectedExams = Array.from(
		document.querySelectorAll('#availableExams .exam-item.selected')
	).map((el) => el.dataset.examId);

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

	// Update exam assignments
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	console.log('Updating exam assignments for class:', classData.name);
	console.log('Selected exams:', selectedExams);

	// Track which exams were updated
	const updatedExams = [];

	exams.forEach((exam) => {
		// Initialize classes array if it doesn't exist
		if (!exam.classes) exam.classes = [];

		// If exam is selected, make sure class is in the exam's classes array
		if (selectedExams.includes(exam.id)) {
			if (!exam.classes.includes(classData.id)) {
				exam.classes.push(classData.id);
				updatedExams.push(exam.name);
				console.log(`Added class ${classData.name} to exam ${exam.name}`);
			}
		} else {
			// If exam is not selected, make sure class is not in the exam's classes array
			if (exam.classes.includes(classData.id)) {
				exam.classes = exam.classes.filter((id) => id !== classData.id);
				console.log(`Removed class ${classData.name} from exam ${exam.name}`);
			}
		}
	});

	// Save updated exams to localStorage
	window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);
	console.log('Updated exams saved to localStorage');

	// Log activity
	if (typeof logActivity === 'function') {
		logActivity(
			'class',
			classData.name,
			currentClassId ? 'edited' : 'created',
			{
				id: classData.id,
				studentCount: students.length,
				examCount: selectedExams.length,
			}
		);
	}

	// Save classes and update UI
	saveClasses();
	updateClassList();
	closeClassModal();

	if (window.Auth?.syncClassStudentsFromClassData) {
		try {
			await window.Auth.syncClassStudentsFromClassData(classData, students);
		} catch (error) {
			console.error('Failed to sync class students:', error);
		}
	}

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

	// Show success message with details of updated exams
	if (updatedExams.length > 0) {
		showToast(
			`Class saved with ${updatedExams.length} exam assignments updated!`
		);
	} else {
		showToast('Class saved successfully!');
	}
}

function editClass(classId) {
	loadClasses();
	currentClassId = classId;
	const classData = classes.find((c) => c.id === classId);
	if (!classData) {
		showToast('Class not found', 'error');
		return;
	}

	document.getElementById('classModalTitle').textContent = 'Edit Class';
	document.getElementById('className').value = classData.name;

	// Load students
	const studentsList = document.getElementById('selectedStudentsList');
	studentsList.innerHTML = '';
	const mergedStudents = mergeStudentEntries(
		classData.students || [],
		getStudentsFromUsers(classId),
	);
	mergedStudents.forEach((student) => {
		studentsList.appendChild(createStudentItem(student.number, student.name));
	});
	const classFilter = document.getElementById('studentClassFilter');
	if (classFilter) classFilter.value = 'all';
	populateStudentUserPicker();

	// Load and mark selected exams
	loadAvailableExams();
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const assignedExams = exams.filter((exam) => exam.classes?.includes(classId));

	// Mark assigned exams as selected
	assignedExams.forEach((exam) => {
		const examElement = document.querySelector(
			`.exam-item[data-exam-id="${exam.id}"]`
		);
		if (examElement) {
			examElement.classList.add('selected');
		}
	});

	// Update selected count
	updateSelectedExamsCount(assignedExams.length);

	openClassModal();
}

function deleteClass(classId) {
	if (confirm('Are you sure you want to delete this class?')) {
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
	}
}

function filterClasses() {
	const searchTerm = document.getElementById('classSearch').value.toLowerCase();
	const filteredClasses = classes.filter(
		(c) =>
			c.name.toLowerCase().includes(searchTerm) ||
			c.students.some(
				(s) =>
					s.name.toLowerCase().includes(searchTerm) ||
					s.number.includes(searchTerm)
			)
	);
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

		switch (sortBy) {
			case 'name':
				aValue = a.querySelector('td:first-child').textContent;
				bValue = b.querySelector('td:first-child').textContent;
				break;
			case 'date':
				aValue = new Date(a.querySelector('td:nth-child(2)').textContent);
				bValue = new Date(b.querySelector('td:nth-child(2)').textContent);
				break;
			case 'students':
				aValue = parseInt(a.querySelector('td:nth-child(3)').textContent);
				bValue = parseInt(b.querySelector('td:nth-child(3)').textContent);
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

	// Clear existing table rows
	tbody.innerHTML = '';

	const visibleClasses = classesList.filter((cls) =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('class', cls) : true,
	);

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

		// Mobile click handler
		row.addEventListener('click', (e) => {
			// Only trigger on mobile
			if (window.innerWidth > 768) return;

			// Don't trigger if clicking action button directly
			if (e.target.closest('button')) return;
			e.stopPropagation();

			// Open mobile action sheet
			MobileActionSheet.open(`Class: ${cls.name}`, [
				// Changed cls.className to cls.name
				{
					label: 'Edit Class',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
					onClick: () => editClass(cls.id),
				},
				{
					label: 'Delete Class',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
					variant: 'danger',
					onClick: () => deleteClass(cls.id),
				},
			]);
		});

		const studentCount = cls.students ? cls.students.length : 0;
		const assignedExams = exams
			.filter((e) => e.classes?.includes(cls.id))
			.filter((e) =>
				window.Auth?.canAccessItem ? window.Auth.canAccessItem('exam', e) : true,
			)
			.map((e) => e.name);
		const examCount = assignedExams.length;
		// Note: averageScore is not part of the current classData structure.
		// It would need to be calculated or stored if desired.
		const averageScore = '-'; // Placeholder as it's not available in classData

		const dateCreated = cls.dateCreated
			? new Date(cls.dateCreated).toLocaleDateString()
			: '-';

		row.innerHTML = `
            <td>${escapeHtml(cls.name)}</td>
            <td>${dateCreated}</td>
            <td>${studentCount}</td>
            <td>${examCount}</td>
            <td class="actions-cell">
                <div class="exam-actions">
                    <button class="exam-action-btn exam-edit-btn" onclick="editClass('${
											cls.id
										}')" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="exam-action-btn exam-delete-btn" onclick="deleteClass('${
											cls.id
										}')" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        `;
		tbody.appendChild(row);
	});
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
}

function getSelectedExams() {
	return Array.from(document.querySelectorAll('.exam-item.selected')).map(
		(item) => item.dataset.examId
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
				const existingClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
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
		document.querySelectorAll('#selectedStudentsList .selected-student-item')
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

function importStudentsLegacy() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (e) => {
		const file = e.target.files[0];
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const newStudents = JSON.parse(event.target.result);

				if (
					!Array.isArray(newStudents) ||
					!newStudents.every(isValidStudentStructure)
				) {
					throw new Error('Invalid student data structure');
				}

				const studentsList = document.getElementById('selectedStudentsList');

				// Add each imported student to the list
				newStudents.forEach((student) => {
					const normalized = normalizeStudentEntry(student);
					if (!normalized) return;
					studentsList.appendChild(
						createStudentItem(normalized.number, normalized.name),
					);
				});
				populateStudentUserPicker();

				showToast('Students imported successfully!');
			} catch (error) {
				showToast('Error importing students: ' + error.message, 'error');
			}
		};

		reader.readAsText(file);
	};

	input.click();
}

function isValidStudentStructure(student) {
	return (
		student &&
		typeof student.number === 'string' &&
		typeof student.name === 'string'
	);
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
window.exportStudents = exportStudents;
window.importStudents = importStudents;

// Export students as CSV
function exportStudents() {
	const students = Array.from(
		document.querySelectorAll('#selectedStudentsList .selected-student-item')
	).map((el) => {
		const text = el.querySelector('span').textContent;
		const [number, name] = text.split(' - ');
		return { number: number.trim(), name: name.trim() };
	});

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
	const className = document.getElementById('className').value || 'students';
	link.setAttribute('href', url);
	link.setAttribute(
		'download',
		`${className}_students_${new Date().toISOString().split('T')[0]}.csv`
	);
	link.click();
	showToast('Students exported successfully', 'success');
}

// Import students from CSV
function importStudents() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.csv';
	input.onchange = (e) => {
		const file = e.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			try {
				const csv = event.target.result;
				const lines = csv.split('\n').filter((line) => line.trim());

				// Skip header if present
				let startIndex = 0;
				if (
					lines[0].toLowerCase().includes('number') &&
					lines[0].toLowerCase().includes('name')
				) {
					startIndex = 1;
				}

				let importedCount = 0;
				for (let i = startIndex; i < lines.length; i++) {
					// Parse CSV line (handle quoted values)
					const match = lines[i].match(/"([^"]+)"|[^,]+/g);
					if (!match || match.length < 2) continue;

					let number = match[0].replace(/"/g, '').trim();
					let name = match[1].replace(/"/g, '').trim();

					if (!number || !name) continue;

					// Add student
					const studentsList = document.getElementById('selectedStudentsList');
					const studentItem = document.createElement('div');
					studentItem.className = 'selected-student-item';
					studentItem.innerHTML = `
						<span>${escapeHtml(number)} - ${escapeHtml(name)}</span>
						<button type="button" class="remove-btn" onclick="this.parentElement.remove()">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					`;
					studentsList.appendChild(studentItem);
					importedCount++;
				}

				if (importedCount > 0) {
					populateStudentUserPicker();
					showToast(
						`Imported ${importedCount} student(s) successfully`,
						'success'
					);
				} else {
					showToast('No valid students found in file', 'warning');
				}
			} catch (error) {
				console.error('Error importing students:', error);
				showToast('Error importing students: ' + error.message, 'error');
			}
		};
		reader.readAsText(file);
	};
	input.click();
}

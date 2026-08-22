// ============================================
// EXAM MANAGEMENT - STATE & CONFIGURATION
// ============================================
// This file manages the exam modal functionality
// Uses element IDs: availableQuestions, selectedQuestionsList,
// selectedQuestionCount, availableQuestionCount

// Exam Management State
let exams = [];
let currentExamId = null;
let examSortDirection = 'desc'; // Initialize as desc to match initial UI state
let selectedQuestions = [];
let availableQuestions = [];
let questionSearchTimeout;
let debounceTimer;
let quickFilterActive = '';
let examListenersBound = false;

// ============================================
// INITIALIZATION
// ============================================

// Initialize exam management
function initExamManagement() {
	console.log('Initializing exam management...');
	loadExams();
	console.log('About to update exam list with', exams.length, 'exams');
	updateExamList();
	setupEventListeners();

	// Set initial sort direction state in UI using specific ID
	const sortDirectionButton = document.getElementById('sortExamDirection');
	if (sortDirectionButton) {
		sortDirectionButton.classList.add('desc');
	}

	// Don't auto-open modal - let user click "Create New Exam" button
}

// Function to open exam modal on first load
function openExamModalOnFirstLoad() {
	currentExamId = null;
	document.getElementById('examModalTitle').textContent = 'Create New Exam';
	document.getElementById('examForm').reset();
	populateCategoryFilter();
	loadAvailableQuestions();
	openExamModal();
}

function loadExams() {
	const savedExams = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('exams'));
	exams = savedExams ? JSON.parse(savedExams) : [];
	console.log('Loaded exams from localStorage:', exams);
}

function saveExams() {
	window.__DI_CONTAINER__.repo.setAll_sync('exams', exams);
	console.log('Saved exams to localStorage:', exams);
}

function refreshExamList() {
	console.log('Refreshing exam list...');
	loadExams();
	updateExamList();
	console.log('Exam list refreshed. Current exams:', exams);
}

// ============================================
// EXAM CRUD OPERATIONS
// ============================================

function createNewExam() {
	currentExamId = null;
	document.getElementById('examModalTitle').textContent = 'Create New Exam';
	document.getElementById('examForm').reset();

	// Clear selected questions
	const selectedContainer = document.getElementById('selectedQuestionsList');
	if (selectedContainer) {
		selectedContainer.innerHTML = '';
	}

	// Open modal first
	openExamModal();

	// Load categories and questions after modal is shown
	setTimeout(() => {
		populateCategoryFilter();
		loadAvailableQuestions();
		// loadAvailableQuestions() already calls updateSelectedCount() at the end
	}, 100);
}

function openExamModal() {
	const modal = document.getElementById('examModal');
	if (modal) {
		promoteExamModal(modal);
		modal.classList.add('is-open');
		modal.setAttribute('aria-hidden', 'false');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('role', 'dialog');
		document.documentElement.classList.add('modal-open');
		document.body.classList.add('modal-open');
		setTimeout(() => {
			modal.classList.add('active');
			document.getElementById('examName')?.focus();
		}, 10);
	}
	// Populate preset dropdown
	populatePresetDropdown();
}

// Populate preset dropdown with available presets
function populatePresetDropdown() {
	const select = document.getElementById('examPreset');
	if (!select) return;

	const presets = window.getAllPresets ? window.getAllPresets() : [];
	select.innerHTML =
		'<option value="">-- Select Preset (Optional) --</option>' +
		presets
			.map(
				(p) =>
					`<option value="${p.id}">${escapeHtml(p.name)} (${Math.floor(p.timeLimit / 60)}min, ${p.penalty}pts penalty)</option>`,
			)
			.join('');
}

function closeExamModal() {
	const modal = document.getElementById('examModal');
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

function promoteExamModal(modal) {
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

function populateCategoryFilter() {
	const categoryFilter = document.getElementById('categoryFilterExam');
	if (!categoryFilter) return;

	const savedCategories = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('categories')) || '[]',
	);
	const visibleCategories = savedCategories.filter((category) =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('category', category) : true,
	);

	// Clear existing options except the first "All Categories" option
	categoryFilter.innerHTML = '<option value="">All Categories</option>';

	// Add categories
	visibleCategories.forEach((category) => {
		const option = document.createElement('option');
		option.value = category.id;
		option.textContent = category.name;
		categoryFilter.appendChild(option);
	});
}

// ============================================
// EXAM MODAL - LOAD & RENDER QUESTIONS
// ============================================

function loadAvailableQuestions() {
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const questions = savedQuestions || [];
	const container = document.getElementById('availableQuestions');

	// Get categories for display
	const savedCategories = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('categories')) || '[]',
	);
	const visibleCategories = savedCategories.filter((category) =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('category', category) : true,
	);

	// Get currently selected questions from the selected list
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	);
	const selectedQuestionIndices = Array.from(selectedQuestions).map((q) =>
		parseInt(q.dataset.index),
	);

	// Group questions by category
	const questionsByCategory = {};
	questions.forEach((q, index) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('question', q)) {
			return;
		}
		const categoryId = q.category || 'uncategorized';
		if (!questionsByCategory[categoryId]) {
			questionsByCategory[categoryId] = [];
		}
		questionsByCategory[categoryId].push({ question: q, index });
	});

	// Build HTML with category grouping
	let html = '';
	let hasVisibleQuestions = false;

	Object.keys(questionsByCategory).forEach((categoryId) => {
		const categoryQuestions = questionsByCategory[categoryId];
		const category = visibleCategories.find((cat) => cat.id === categoryId) || {
			name: 'Uncategorized',
			color: '#9ca3af',
			id: 'uncategorized',
		};

		// Filter out selected questions - these should NOT be shown in available
		const availableQuestions = categoryQuestions.filter(
			({ index }) => !selectedQuestionIndices.includes(index),
		);

		// Only show category if it has available questions
		if (availableQuestions.length > 0) {
			hasVisibleQuestions = true;

			// Add category folder with uncategorized style for all categories
			html += `
            <div class="category-folder" data-category="${categoryId}">
                <div class="category-header" onclick="toggleCategoryFolder('${categoryId}')">
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="category-name">${escapeHtml(
											category.name,
										)}</span>
                    <span class="question-count" id="count-${categoryId}">(${
											availableQuestions.length
										}/${categoryQuestions.length})</span>
                    <div class="category-header-actions">
                        <button class="category-action-btn move-all-btn" onclick="event.stopPropagation(); moveEntireCategoryToSelected('${categoryId}'); return false;" title="Move all questions">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="category-questions" id="questions-${categoryId}">
            `;

			// Add questions in this category (only available ones that are NOT selected)
			availableQuestions.forEach(({ question, index }) => {
				// Determine question type for display using robust detector
				const questionType = detectQuestionType(question);

				html += `
                <div class="question-item categorized" data-index="${index}" data-draggable="${
									question.isDraggable
								}" data-category="${categoryId}" data-type="${questionType}" data-points="${Number.parseFloat(question.points) || 1}" onclick="toggleQuestionSelection(this)" style="display: block;">
                    <div class="question-content">
                        ${window.renderQuestionContent(
													question.question,
													question,
													questionType,
													question.options,
													question.image,
													true,
												)}
                    </div>
                </div>
                `;
			});

			html += `
                </div>
            </div>
            `;
		}
	});

	// Show empty state if no questions are available
	if (!hasVisibleQuestions) {
		html = `
        <div class="no-questions-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path>
                <rect x="9" y="3" width="6" height="4" rx="2"></rect>
            </svg>
            <h3>No Available Questions</h3>
            <p>All questions have been selected or there are no questions in this category.</p>
        </div>
        `;
	}

	window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);

	// Update all counters after loading questions
	updateSelectedCount();
}

function toggleQuestionSelection(element) {
	console.log('toggleQuestionSelection called', element);
	const questionId = element.dataset.index;
	const questionCategory = element.dataset.category;
	console.log('Question ID:', questionId, 'Category:', questionCategory);

	// Check if question is already in selected list
	const existingSelected = document.querySelector(
		`#selectedQuestionsList .question-item[data-index="${questionId}"]`,
	);
	console.log('Already selected?', !!existingSelected);

	if (existingSelected) {
		// If already selected, remove it from selected list and add back to available
		removeQuestionFromSelected(questionId, questionCategory);
	} else {
		// If not selected, add it to selected list
		addQuestionToSelected(element);
	}

	// Ensure counters are updated after toggle
	updateSelectedCount();
}

function addQuestionToSelected(element) {
	console.log('addQuestionToSelected called');
	const questionId = element.dataset.index;
	const questionCategory = element.dataset.category;

	// Hide the question from available side
	element.style.display = 'none';
	console.log('Hid original element');

	// Clone the question element for the selected list
	const questionClone = element.cloneNode(true);
	questionClone.classList.add('selected');
	questionClone.style.display = 'block';
	questionClone.onclick = () =>
		removeQuestionFromSelected(questionId, questionCategory);
	console.log('Created clone');

	// Add to selected container
	const selectedList = document.getElementById('selectedQuestionsList');
	console.log('selectedQuestionsList element:', selectedList);
	if (selectedList) {
		selectedList.appendChild(questionClone);
		console.log('Appended clone to selectedQuestionsList');
	} else {
		console.error('selectedQuestionsList element NOT FOUND!');
	}

	// Update counts - updateSelectedCount handles everything
	updateSelectedCount();
}

function removeQuestionFromSelected(questionId, questionCategory) {
	// Remove from selected list
	const selectedQuestion = document.querySelector(
		`#selectedQuestionsList .question-item[data-index="${questionId}"]`,
	);
	if (selectedQuestion) {
		selectedQuestion.remove();
	}

	// Find and show the question in available side
	const availableQuestion = document.querySelector(
		`#availableQuestions .question-item[data-index="${questionId}"]`,
	);
	if (availableQuestion) {
		availableQuestion.style.display = 'block';
		availableQuestion.classList.remove('selected');
	}

	// Update counts - only use updateSelectedCount which handles everything
	updateSelectedCount();
}

function removeSelectedQuestion(element) {
	const questionId = element.dataset.index;
	const questionCategory =
		element.dataset.category ||
		element.closest('.category-folder')?.dataset.category;

	if (questionCategory) {
		removeQuestionFromSelected(questionId, questionCategory);
	}
}

// Legacy function - redirects to main update
function updateGlobalAvailableCount() {
	updateSelectedCount();
}

// Legacy function - redirects to main update
function updatePremiumQuestionsCount() {
	updateSelectedCount();
}

// Legacy function - redirects to main update
function updateCategoryQuestionCounts() {
	updateSelectedCount();
}

function updateSelectedCount() {
	const selectedCount = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	).length;
	const selectedCountElement = document.getElementById('selectedQuestionCount');
	if (selectedCountElement) {
		selectedCountElement.textContent = selectedCount;
	}
	const selectedPointsElement = document.getElementById('selectedQuestionPoints');
	const selectedPointsBadgeElement = document.getElementById('selectedQuestionPointsBadge');
	if (selectedPointsElement || selectedPointsBadgeElement) {
		const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
		const totalPoints = Array.from(
			document.querySelectorAll('#selectedQuestionsList .question-item'),
		).reduce((sum, questionEl) => {
			const index = Number.parseInt(questionEl.dataset.index, 10);
			const fromData = Number.parseFloat(questionEl.dataset.points);
			const fromStorage = Number.parseFloat(savedQuestions[index]?.points);
			return sum + (Number.isFinite(fromData) ? fromData : Number.isFinite(fromStorage) ? fromStorage : 1);
		}, 0);
		const totalPointsText = Number.isInteger(totalPoints)
			? String(totalPoints)
			: totalPoints.toFixed(1);
		if (selectedPointsElement) selectedPointsElement.textContent = totalPointsText;
		if (selectedPointsBadgeElement) selectedPointsBadgeElement.textContent = totalPointsText;
	}

	// Calculate total available questions across ALL category folders (sum)
	let totalAvailable = 0;

	// Update category folder counts and sum up total available
	document
		.querySelectorAll('#availableQuestions .category-folder')
		.forEach((folder) => {
			const categoryId = folder.dataset.category;
			const allQuestionsInFolder = folder.querySelectorAll('.question-item');
			const questionsInFolder = allQuestionsInFolder.length;

			// Count only visible questions (not hidden with display:none)
			let availableInFolder = 0;
			allQuestionsInFolder.forEach((q) => {
				if (q.style.display !== 'none') {
					availableInFolder++;
				}
			});

			// Add to total sum
			totalAvailable += availableInFolder;

			// Update individual folder count display
			const countElement = folder.querySelector('.question-count');
			if (countElement) {
				countElement.textContent = `(${availableInFolder}/${questionsInFolder})`;
			}

			// Also update count-{categoryId} if it exists
			const categoryCountElement = document.getElementById(
				`count-${categoryId}`,
			);
			if (categoryCountElement) {
				categoryCountElement.textContent = availableInFolder;
			}
		});

	// Update the main available question count with the total sum
	const availableCountElement = document.getElementById(
		'availableQuestionCount',
	);
	if (availableCountElement) {
		availableCountElement.textContent = totalAvailable;
	}

	// Update premium summary stats
	updatePremiumSummaryStats();
}

function updatePremiumSummaryStats() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	);
	let total = 0;
	let easy = 0;
	let medium = 0;
	let hard = 0;

	selectedQuestions.forEach((questionEl) => {
		total++;
		const difficulty = questionEl.dataset.difficulty || 'medium';
		if (difficulty === 'easy') easy++;
		else if (difficulty === 'medium') medium++;
		else if (difficulty === 'hard') hard++;
	});

	// Update counts only if elements exist
	const totalEl = document.getElementById('totalSelectedCount');
	const easyEl = document.getElementById('easySelectedCount');
	const mediumEl = document.getElementById('mediumSelectedCount');
	const hardEl = document.getElementById('hardSelectedCount');

	if (totalEl) totalEl.textContent = total;
	if (easyEl) easyEl.textContent = easy;
	if (mediumEl) mediumEl.textContent = medium;
	if (hardEl) hardEl.textContent = hard;
}

function clearAllSelected() {
	if (confirm('Are you sure you want to clear all selected questions?')) {
		const selectedQuestions = document.querySelectorAll(
			'#selectedQuestionsList .question-item',
		);
		selectedQuestions.forEach((question) => {
			const questionId = question.dataset.index;
			const questionCategory = question.dataset.category;

			// Show the question back in the available side
			const availableQuestion = document.querySelector(
				`#availableQuestions .question-item[data-index="${questionId}"]`,
			);
			if (availableQuestion) {
				availableQuestion.style.display = 'block';
				availableQuestion.classList.remove('selected');
			}

			// Remove from selected list
			question.remove();
		});

		// Update all counts
		updateSelectedCount();
		updateCategoryQuestionCounts();
		updateGlobalAvailableCount();
		updatePremiumSummaryStats();

		showToast('All selections cleared');
	}
}

function toggleDropdown(button) {
	const dropdown = button.parentElement;
	dropdown.classList.toggle('active');

	// Close dropdown when clicking outside
	document.addEventListener('click', function closeDropdown(e) {
		if (!dropdown.contains(e.target)) {
			dropdown.classList.remove('active');
			document.removeEventListener('click', closeDropdown);
		}
	});
}

// Legacy filter function - redirect to enhanced version
function filterExamQuestions() {
	filterExamQuestionsEnhanced();
}

// Category folder functionality
function toggleCategoryFolder(categoryId) {
	const folder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${categoryId}"]`,
	);
	if (!folder) return false;

	// Toggle the 'open' class on the folder
	folder.classList.toggle('open');

	// Update question counts after toggle
	updateCategoryQuestionCounts();

	// Prevent any default behavior and stop event propagation
	return false;
}

// ============================================
// EXAM MODAL - CATEGORY FOLDER ACTIONS
// ============================================

function toggleCategoryFolderWithSelectAll(categoryId) {
	// First toggle the folder
	toggleCategoryFolder(categoryId);

	// If it's now open, select all questions in this category
	const folder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${categoryId}"]`,
	);
	if (!folder) return;
	const questionsContainer = folder.querySelector('.category-questions');
	const header = folder.querySelector('.category-header');

	if (questionsContainer.style.display === 'block') {
		selectAllQuestionsInCategory(categoryId);
	}
}

function selectAllQuestionsInCategory(categoryId) {
	const categoryFolder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${categoryId}"]`,
	);
	if (!categoryFolder) return;
	const questions = categoryFolder.querySelectorAll('.question-item');
	const selectAllBtn = categoryFolder.querySelector(
		'.category-action-btn.select-all',
	);

	// Check if all questions are already selected
	const allSelected = Array.from(questions).every((question) =>
		question.classList.contains('selected'),
	);

	questions.forEach((question) => {
		if (allSelected) {
			question.classList.remove('selected');
		} else {
			question.classList.add('selected');
		}
	});

	// Update button appearance and show toast
	if (allSelected) {
		selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
            </svg>
            <span class="btn-text">Select All</span>
        `;
		selectAllBtn.title = 'Select all questions in this category';
		showToast(
			`Deselected all questions in ${
				categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'
			}`,
			'info',
		);
	} else {
		selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span class="btn-text">Deselect All</span>
        `;
		selectAllBtn.title = 'Deselect all questions in this category';
		showToast(
			`Selected all questions in ${
				categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'
			}`,
			'success',
		);
	}

	// Update question counts
	updateCategoryQuestionCounts();
	updateSelectedCount();
}

function moveSelectedQuestionsToSelected(categoryId) {
	const categoryFolder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${categoryId}"]`,
	);
	if (!categoryFolder) return;
	const selectedQuestions = categoryFolder.querySelectorAll(
		'.question-item.selected',
	);

	if (selectedQuestions.length === 0) {
		showToast('Please select at least one question', 'error');
		return;
	}

	// Move selected questions to the selected questions container
	const selectedContainer = document.getElementById('selectedQuestionsList');
	if (!selectedContainer) {
		console.error('Selected questions container not found');
		return;
	}

	selectedQuestions.forEach((question) => {
		// Clone the question element to avoid removing from original
		const questionClone = question.cloneNode(true);
		questionClone.classList.add('selected');

		// Add remove functionality
		questionClone.onclick = () => removeQuestionFromSelection(questionClone);

		// Add to selected container
		selectedContainer.appendChild(questionClone);

		// Remove from original container
		question.remove();
	});

	// Update question counts
	updateCategoryQuestionCounts();
	updateSelectedCount();

	// Show success toast
	showToast(
		`Moved ${selectedQuestions.length} question${
			selectedQuestions.length > 1 ? 's' : ''
		} to selected`,
		'success',
	);
}

function moveEntireCategoryToSelected(categoryId) {
	const categoryFolder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${categoryId}"]`,
	);
	if (!categoryFolder) return false;
	const allQuestions = categoryFolder.querySelectorAll('.question-item');

	if (allQuestions.length === 0) {
		showToast('No questions in this category', 'error');
		return false;
	}

	// Move all questions to the selected questions container
	const selectedContainer = document.getElementById('selectedQuestionsList');
	if (!selectedContainer) {
		console.error('Selected questions container not found');
		return false;
	}

	let movedCount = 0;
	allQuestions.forEach((question) => {
		const questionIndex = question.dataset.index;
		const questionCategory = question.dataset.category;

		// Hide the question from available side
		question.style.display = 'none';

		// Check if this question is already in the selected list to avoid duplicates
		const existingSelected = document.querySelector(
			`#selectedQuestionsList .question-item[data-index="${questionIndex}"]`,
		);
		if (!existingSelected) {
			// Clone the question element for the selected list
			const questionClone = question.cloneNode(true);
			questionClone.classList.add('selected');
			questionClone.style.display = 'block';
			questionClone.onclick = () =>
				removeQuestionFromSelected(questionIndex, questionCategory);

			// Add to selected container
			selectedContainer.appendChild(questionClone);
			movedCount++;
		}
	});

	// Update question counts
	updateCategoryQuestionCounts();
	updateSelectedCount();
	updateGlobalAvailableCount();

	// Show success toast
	showToast(
		`Moved ${movedCount} question${movedCount > 1 ? 's' : ''} from ${
			categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'
		} to selected`,
		'success',
	);

	return false;
}

function removeQuestionFromSelection(questionElement) {
	const questionId = questionElement.dataset.questionId;
	const originalCategory = questionElement.dataset.category;

	// Remove from selected container
	questionElement.remove();

	// Add back to original category
	const categoryFolder = document.querySelector(
		`#availableQuestions .category-folder[data-category="${originalCategory}"]`,
	);
	if (categoryFolder) {
		const questionsContainer = categoryFolder.querySelector(
			'.category-questions',
		);
		if (questionsContainer) {
			questionsContainer.appendChild(questionElement);
		}
	}

	// Update question counts
	updateQuestionCounts();

	showToast('Question moved back to available questions', 'info');
}

// Legacy function - remove duplicate, redirect to main update
function updateQuestionCounts() {
	updateSelectedCount();
}

// Enhanced filter functionality
function setQuickFilter(filterType) {
	quickFilterActive = filterType;
	filterExamQuestionsEnhanced();
}

// Update the applyQuickFilter function to work like checkboxes
function applyQuickFilter(filterType) {
	// If no active filters yet, initialize as array
	if (!quickFilterActive) {
		quickFilterActive = [];
	}

	// If it's not already an array, convert it
	if (!Array.isArray(quickFilterActive)) {
		quickFilterActive = [quickFilterActive];
	}

	// Toggle the filter - add if not present, remove if present
	const index = quickFilterActive.indexOf(filterType);
	if (index > -1) {
		// Remove filter
		quickFilterActive.splice(index, 1);
	} else {
		// Add filter
		quickFilterActive.push(filterType);
	}

	// Update UI to show active filters
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		const btnFilter = btn
			.getAttribute('onclick')
			.match(/applyQuickFilter\('([^']+)'\)/);
		if (btnFilter && btnFilter[1]) {
			if (quickFilterActive.includes(btnFilter[1])) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	});

	// Apply the filter
	filterExamQuestionsEnhanced();
}

// Update the clearAllFiltersAndSelections function to handle array filters
function clearAllFiltersAndSelectionsLegacy() {
	// Clear all filter inputs
	document.getElementById('categoryFilterExam').value = '';
	document.getElementById('typeFilterExam').value = '';
	document.getElementById('difficultyFilterExam').value = '';
	const pointFilterExamMin = document.getElementById('pointFilterExamMin');
	if (pointFilterExamMin) pointFilterExamMin.value = '';
	const pointFilterExamMax = document.getElementById('pointFilterExamMax');
	if (pointFilterExamMax) pointFilterExamMax.value = '';
	document.getElementById('examQuestionSearch').value = '';

	// Clear quick filters (set to empty array)
	quickFilterActive = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Clear selections
	clearAllSelectedSilent();

	// Re-apply filters (which will now show all questions)
	filterExamQuestionsEnhanced();

	showToast('All filters and selections cleared', 'info');
}

// Update the clearQuickFilters function to handle array filters
function clearQuickFiltersLegacy() {
	quickFilterActive = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Apply the filter (which will now show all questions)
	filterExamQuestionsEnhanced();
}

// Update the enhanced filtering function to handle multiple filters
function filterExamQuestionsEnhanced() {
	// Get all filter values from the HTML elements
	const searchTerm = (
		document.getElementById('examQuestionSearch')?.value || ''
	).toLowerCase();
	const categoryFilter =
		document.getElementById('categoryFilterExam')?.value || '';
	const typeFilter = document.getElementById('typeFilterExam')?.value || '';
	const difficultyFilter =
		document.getElementById('difficultyFilterExam')?.value || '';
	const pointFilterMin = document.getElementById('pointFilterExamMin')?.value || '';
	const pointFilterMax = document.getElementById('pointFilterExamMax')?.value || '';

	// Get all question items
	const questions = document.querySelectorAll(
		'#availableQuestions .question-item',
	);

	let visibleQuestionCount = 0;
	const visibleCategories = new Set();

	// Get all questions data for filtering
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');

	questions.forEach((question) => {
		const questionIndex = parseInt(question.dataset.index);
		const questionData = savedQuestions[questionIndex];
		const questionCategory = question.dataset.category || '';
		const questionType = question.dataset.type || 'multiple-choice';
		const questionDifficulty = questionData?.difficulty || 'medium';
		const questionPoints = Number.parseFloat(
			question.dataset.points || questionData?.points || 1,
		);

		// Check if question matches search term (search in question text)
		let matchesSearch = true;
		if (searchTerm) {
			const questionText = (questionData?.question || '').toLowerCase();
			matchesSearch = questionText.includes(searchTerm);
		}

		// Apply category filter
		let matchesCategory = true;
		if (categoryFilter) {
			matchesCategory = questionCategory === categoryFilter;
		}

		// Apply type filter
		let matchesType = true;
		if (typeFilter) {
			matchesType = questionType === typeFilter;
		}

		// Apply difficulty filter
		let matchesDifficulty = true;
		if (difficultyFilter) {
			matchesDifficulty = questionDifficulty === difficultyFilter;
		}

		let matchesPoints = true;
		if (pointFilterMin || pointFilterMax) {
			const minPoints = pointFilterMin ? Number.parseFloat(pointFilterMin) : 0;
			const maxPoints = pointFilterMax ? Number.parseFloat(pointFilterMax) : Infinity;
			matchesPoints = questionPoints >= minPoints && questionPoints <= maxPoints;
		}

		// Apply quick filters (multiple can be active)
		let matchesQuickFilter = true;
		if (
			quickFilterActive &&
			Array.isArray(quickFilterActive) &&
			quickFilterActive.length > 0
		) {
			// All active filters must match (AND logic)
			matchesQuickFilter = quickFilterActive.every((filterType) => {
				switch (filterType) {
					case 'recent':
						// Show recently added questions (last 25% of questions)
						const totalQuestions = savedQuestions.length;
						const recentThreshold = Math.floor(totalQuestions * 0.75);
						return questionIndex >= recentThreshold;

					case 'hard':
						// Show hard questions
						return questionDifficulty === 'hard';

					case 'images':
						// Show questions with images
						return !!questionData?.image;

					case 'popular':
						// Show questions used in exams
						const usageCount = quizResults.filter(
							(result) =>
								result.questions && result.questions.includes(questionIndex),
						).length;
						return usageCount > 0;

					case 'unused':
						// Show questions not used in any exam
						const isUsed = quizResults.some(
							(result) =>
								result.questions && result.questions.includes(questionIndex),
						);
						return !isUsed;

					default:
						return true;
				}
			});
		}

		// Combine all filters
		const shouldShow =
			matchesSearch &&
			matchesCategory &&
			matchesType &&
			matchesDifficulty &&
			matchesPoints &&
			matchesQuickFilter;

		if (shouldShow) {
			question.style.display = '';
			visibleQuestionCount++;
			visibleCategories.add(questionCategory);
		} else {
			question.style.display = 'none';
		}
	});

	// Update category folder visibility
	updateCategoryFolderVisibility(visibleCategories);

	// Show appropriate message if no questions match filters
	showFilterResultsMessage(
		visibleQuestionCount,
		searchTerm,
		typeFilter,
		categoryFilter,
		difficultyFilter,
	);

	// Update UI to show active filter
	updateActiveFilterUI();
}

function updateCategoryFolderVisibility(visibleCategories) {
	const categoryFolders = document.querySelectorAll('.category-folder');

	categoryFolders.forEach((folder) => {
		const categoryId = folder.dataset.category;
		const hasVisibleQuestions = visibleCategories.has(categoryId);
		const questions = folder.querySelectorAll('.question-item');
		const visibleQuestions = Array.from(questions).filter(
			(q) => q.style.display !== 'none',
		);

		// Hide category folder if it has no visible questions and is not the currently filtered category
		if (!hasVisibleQuestions && questions.length > 0) {
			folder.style.display = 'none';
		} else {
			folder.style.display = 'block';

			// Update question count
			const countElement = folder.querySelector('.question-count');
			if (countElement) {
				countElement.textContent = `(${visibleQuestions.length}/${questions.length})`;
			}
		}
	});
}

function showFilterResultsMessage(
	visibleQuestionCount,
	searchTerm,
	filterType,
	categoryFilter,
	difficultyFilter,
) {
	const container = document.getElementById('availableQuestions');
	const existingMessage = container.querySelector('.filter-results-message');

	// Remove existing message
	if (existingMessage) {
		existingMessage.remove();
	}

	// Show message if no questions match filters
	if (visibleQuestionCount === 0) {
		let message = 'No questions found matching your criteria.';

		// Add specific filter information
		const filters = [];
		if (searchTerm) filters.push(`search: "${searchTerm}"`);
		if (filterType && filterType !== 'all') filters.push(`type: ${filterType}`);
		if (categoryFilter && categoryFilter !== '') {
			const savedCategories = JSON.parse(
				JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('categories')) || '[]',
			);
			const categoryName =
				savedCategories.find((c) => c.id === categoryFilter)?.name ||
				categoryFilter;
			filters.push(`category: ${categoryName}`);
		}
		if (difficultyFilter && difficultyFilter !== '')
			filters.push(`difficulty: ${difficultyFilter}`);
		if (quickFilterActive) filters.push(`filter: ${quickFilterActive}`);

		if (filters.length > 0) {
			message += ` Applied filters: ${filters.join(', ')}.`;
		}

		message += ' Try adjusting your search or filters.';

		const messageHtml = `
        <div class="filter-results-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
                <path d="M8 11h6"></path>
            </svg>
            <h3>No Results Found</h3>
            <p>${message}</p>
            <button onclick="clearAllFilters()" class="clear-filters-btn">Clear All Filters</button>
        </div>
        `;

		container.insertAdjacentHTML('afterbegin', messageHtml);
	}
}

function clearAllFilters() {
	// Clear all filter inputs
	document.getElementById('examQuestionSearch').value = '';
	document.getElementById('categoryFilterExam').value = '';
	document.getElementById('typeFilterExam').value = '';
	document.getElementById('difficultyFilterExam').value = '';
	const pointFilterExamMin = document.getElementById('pointFilterExamMin');
	if (pointFilterExamMin) pointFilterExamMin.value = '';
	const pointFilterExamMax = document.getElementById('pointFilterExamMax');
	if (pointFilterExamMax) pointFilterExamMax.value = '';
	quickFilterActive = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Remove filter results message
	const container = document.getElementById('availableQuestions');
	const filterMessage = container.querySelector('.filter-results-message');
	if (filterMessage) {
		filterMessage.remove();
	}

	// Reload and filter questions
	loadAvailableQuestions();
	filterExamQuestions();

	showToast('All filters cleared', 'info');
}

function updateActiveFilterUI() {
	// Update quick filter buttons to show active state
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		// Extract filter type from onclick attribute
		const onclickAttr = btn.getAttribute('onclick');
		if (onclickAttr) {
			const match = onclickAttr.match(/applyQuickFilter\('([^']+)'\)/);
			if (match && match[1]) {
				const filterType = match[1];
				// Check if this filter is active (in the array)
				if (
					Array.isArray(quickFilterActive) &&
					quickFilterActive.includes(filterType)
				) {
					btn.classList.add('active');
				} else {
					btn.classList.remove('active');
				}
			}
		}
	});
}

// Debounce function for search
function debounceFilterExamQuestionsLegacy() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		filterExamQuestions();
	}, 300);
}

// Refresh available questions
function refreshAvailableQuestions() {
	loadAvailableQuestions();
	filterExamQuestions();
	showToast('Questions refreshed!');
}

// Bulk action functions
function selectAllAvailable() {
	document
		.querySelectorAll('#availableQuestions .question-item')
		.forEach((question) => {
			question.classList.add('selected');
		});
	updateSelectedCount();
	showToast('All questions selected', 'success');
}

function deselectAllSelected() {
	document
		.querySelectorAll('#selectedQuestionsList .question-item')
		.forEach((question) => {
			question.remove();
		});
	updateSelectedCount();
	showToast('All selections cleared', 'info');
}

function removeSelected() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	);
	selectedQuestions.forEach((question) => {
		question.remove();
	});
	updateSelectedCount();
	showToast('Selected questions removed', 'info');
}

function updateBulkActionButtons() {
	const selectedCount = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	).length;
	const availableCount = document.querySelectorAll(
		'#availableQuestions .question-item',
	).length;

	// Update select all button
	const selectAllBtn = document.getElementById('selectAllBtn');
	if (selectAllBtn) {
		selectAllBtn.disabled = availableCount === 0;
	}

	// Update deselect all button
	const deselectAllBtn = document.getElementById('deselectAllBtn');
	if (deselectAllBtn) {
		deselectAllBtn.disabled = selectedCount === 0;
	}

	// Update remove selected button
	const removeSelectedBtn = document.getElementById('removeSelectedBtn');
	if (removeSelectedBtn) {
		removeSelectedBtn.disabled = selectedCount === 0;
	}
}

// Category-specific bulk action functions
function selectAllAvailableForCategory() {
	document
		.querySelectorAll('#availableQuestionsForCategory .question-item')
		.forEach((question) => {
			question.classList.add('selected');
		});
	updateCategoryQuestionCounts();
	showToast('All questions selected', 'success');
}

function deselectAllSelectedForCategory() {
	document
		.querySelectorAll('#selectedQuestionsForCategory .question-item')
		.forEach((question) => {
			question.remove();
		});
	updateCategoryQuestionCounts();
	showToast('All selections cleared', 'info');
}

function removeSelectedForCategory() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsForCategory .question-item',
	);
	selectedQuestions.forEach((question) => {
		question.remove();
	});
	updateCategoryQuestionCounts();
	showToast('Selected questions removed', 'info');
}

function updateBulkActionButtonsForCategory() {
	const selectedCount = document.querySelectorAll(
		'#selectedQuestionsForCategory .question-item',
	).length;
	const availableCount = document.querySelectorAll(
		'#availableQuestionsForCategory .question-item',
	).length;

	// Update select all button
	const selectAllBtn = document.getElementById('selectAllBtn');
	if (selectAllBtn) {
		selectAllBtn.disabled = availableCount === 0;
	}
	// Update deselect all button
	const deselectAllBtn = document.getElementById('deselectAllBtn');
	if (deselectAllBtn) {
		deselectAllBtn.disabled = selectedCount === 0;
	}

	// Update remove selected button
	const removeSelectedBtn = document.getElementById('removeSelectedBtn');
	if (removeSelectedBtn) {
		removeSelectedBtn.disabled = selectedCount === 0;
	}
}

function clearAllSelectedForCategory() {
	if (confirm('Are you sure you want to clear all selected questions?')) {
		deselectAllSelectedForCategory();
	}
}

/* This function was incorrectly placed here and has been removed - see category-management.js */

function filterExams() {
	const searchEl = document.getElementById('examSearch');
	const searchTerm = searchEl ? String(searchEl.value).toLowerCase() : '';
	const filteredExams = exams.filter((exam) =>
		String(exam.name || '').toLowerCase().includes(searchTerm),
	);
	updateExamList(filteredExams);
}

function sortExams() {
	const sortByEl = document.getElementById('examSortBy');
	const sortBy = sortByEl ? sortByEl.value : 'date';
	const direction = examSortDirection === 'asc' ? 1 : -1;

	exams.sort((a, b) => {
		switch (sortBy) {
			case 'date':
				return direction * (new Date(b.dateCreated) - new Date(a.dateCreated));
			case 'name':
				return direction * a.name.localeCompare(b.name);
			case 'questions':
				return direction * (a.questions.length - b.questions.length);
			default:
				return 0;
		}
	});

	updateExamList();
}

function toggleExamSortDirection() {
	// Toggle the direction
	examSortDirection = examSortDirection === 'desc' ? 'asc' : 'desc';

	// Get the button using the specific ID
	const sortDirectionButton = document.getElementById('sortExamDirection');
	if (sortDirectionButton) {
		if (examSortDirection === 'desc') {
			sortDirectionButton.classList.add('desc');
		} else {
			sortDirectionButton.classList.remove('desc');
		}
	}

	sortExams();
}

// Function to check if an exam has valid questions
function examHasValidQuestions(exam) {
	// Get all questions from settings
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const allQuestions = savedQuestions || [];

	// If the exam has no questions, it's invalid
	if (!exam.questions || exam.questions.length === 0) {
		return false;
	}

	// Check if at least one question exists in allQuestions
	return exam.questions.some((questionIndex) => allQuestions[questionIndex]);
}

// Update exam list table
function updateExamList(examsList = exams) {
	const tbody = document.querySelector('#examList tbody');
	const visibleExams = examsList.filter((exam) =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('exam', exam) : true,
	);
	console.log('updateExamList called with', visibleExams.length, 'exams');
	if (!tbody) {
		console.error('exam list tbody not found');
		return;
	}

	tbody.innerHTML = visibleExams
		.map((exam) => {
			// Calculate stats
			const questionCount = exam.questions ? exam.questions.length : 0;
			const duration = exam.duration || 0;
			const dateCreated = new Date(exam.dateCreated).toLocaleDateString();

			// Escape content
			const safeName = escapeHtml(exam.name);

			return `
            <tr data-id="${exam.id}">
                <td>${safeName}</td>
                <td>${dateCreated}</td>
                <td>${questionCount}</td>
                <td>${duration} min</td>
                <td class="actions-cell">
                    <div class="exam-actions">
                        <button class="exam-action-btn exam-edit-btn" onclick="editExam('${
													exam.id
												}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
						<button class="exam-action-btn exam-push-btn" onclick="pushExamToDevices('${
													exam.id
												}')" title="Push to Devices" style="background: #10b981; color: white;">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 2L11 13"></path>
								<path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
							</svg>
						</button>
						<button class="exam-action-btn exam-stop-btn" onclick="stopExamOnDevices('${
													exam.id
												}')" title="Stop Exam on Devices" style="background: #ef4444; color: white;">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
							</svg>
						</button>
						<button class="exam-action-btn exam-delete-btn" onclick="deleteExam('${
													exam.id
												}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
		})
		.join('');
		
	// Add mobile click listeners after rows are rendered
	visibleExams.forEach((exam) => {
		const row = tbody.querySelector(`tr[data-id="${exam.id}"]`);
		if (row) {
			row.addEventListener('click', (e) => {
				if (window.innerWidth > 768) return;
				if (e.target.closest('button')) return;
				e.stopPropagation();

				const safeName = escapeHtml(exam.name);
				MobileActionSheet.open(`Exam: ${safeName}`, [
					{
						label: 'Edit Exam',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
						onClick: () => editExam(exam.id)
					},
					{
						label: 'Push to Devices',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
						onClick: () => pushExamToDevices(exam.id),
						variant: 'primary'
					},
					{
						label: 'Stop Exam on Devices',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
						onClick: () => stopExamOnDevices(exam.id),
						variant: 'danger'
					},
					{
						label: 'Delete Exam',
						icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
						variant: 'danger',
						onClick: () => deleteExam(exam.id)
					}
				]);
			});
		}
	});

	// Add CSS for disabled exams if it doesn't exist
	if (!document.getElementById('disabled-exam-styles')) {
		const styleElement = document.createElement('style');
		styleElement.id = 'disabled-exam-styles';
		styleElement.textContent = `
            .disabled-exam {
                opacity: 0.7;
                background-color: #f8f9fa;
            }
            .exam-action-btn.disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background-color: #e9ecef;
            }
            .tooltip {
                position: relative;
                display: inline-block;
            }
            .tooltip .tooltiptext {
                visibility: hidden;
                width: 200px;
                background-color: #555;
                color: #fff;
                text-align: center;
                border-radius: 6px;
                padding: 5px;
                position: absolute;
                z-index: 1;
                bottom: 125%;
                left: 50%;
                margin-left: -100px;
                opacity: 0;
                transition: opacity 0.3s;
            }
            .tooltip:hover .tooltiptext {
                visibility: visible;
                opacity: 1;
            }
        `;
		document.head.appendChild(styleElement);
	}
}

// Function to show a message when trying to launch an exam with no valid questions
function showNoQuestionsMessage() {
	showToast(
		'This exam has no valid questions. Please edit the exam and add questions.',
		'error',
	);
}

function setupEventListeners() {
	if (examListenersBound) return;
	examListenersBound = true;

	const examFormEl = document.getElementById('examForm');
	if (examFormEl) {
		examFormEl.addEventListener('submit', function (e) {
			e.preventDefault();
			saveExamForm();
		});
	}

	// Add event listener for exam search (guarded)
	const examSearchEl = document.getElementById('examSearch');
	if (examSearchEl) {
		examSearchEl.addEventListener('keyup', filterExams);
	}
}

async function saveExamForm() {
	// Safely read form values (guard for missing elements)
	const examNameEl = document.getElementById('examName');
	const examDurationEl = document.getElementById('examDuration');
	const passingScoreEl = document.getElementById('passingScore');

	const examName = examNameEl ? String(examNameEl.value).trim() : '';
	const duration = examDurationEl ? parseInt(examDurationEl.value) : NaN;
	const passingScore = passingScoreEl
		? parseInt(passingScoreEl.value) || 60
		: 60;

	// Get selected preset
	const examPresetEl = document.getElementById('examPreset');
	const presetId = examPresetEl ? examPresetEl.value : '';

	if (!examName || isNaN(duration)) {
		showToast('Please fill in all required fields', 'error');
		return;
	}

	// Get selected questions from the selected questions list
	const selectedQuestions = Array.from(
		document.querySelectorAll('#selectedQuestionsList .question-item'),
	).map((el) => parseInt(el.dataset.index));

	if (selectedQuestions.length === 0) {
		showToast('Please select at least one question for the exam', 'error');
		return;
	}

	const currentUserId = window.Auth?.getCurrentUser?.()?.id || '';
	const existingExam = currentExamId
		? exams.find((e) => e.id === currentExamId) || null
		: null;

	const examData = {
		...(existingExam || {}),
		id: currentExamId || generateUUID(),
		name: examName,
		duration: duration,
		passingScore: passingScore,
		presetId: presetId || null,
		questions: selectedQuestions,
		// Preserve class assignments when an exam is edited from the exam modal.
		classes: Array.isArray(existingExam?.classes) ? [...existingExam.classes] : [],
		dateCreated: existingExam?.dateCreated || new Date().toISOString(),
		ownerId: existingExam?.ownerId || currentUserId,
	};

	if (currentExamId) {
		const index = exams.findIndex((e) => e.id === currentExamId);
		exams[index] = examData;
	} else {
		exams.push(examData);
	}

	// ── Persist to the backend FIRST ─────────────────────────────────────────
	// The server assigns the canonical id and resolves the creator FK. If the
	// call fails, we abort; otherwise we mirror into localStorage below.
	if (window.API && typeof window.API.create === 'function') {
		try {
			const payload = {
				name: examData.name,
				duration: examData.duration,
				passingScore: examData.passingScore,
				questions: examData.questions,
				classes: examData.classes,
				presetId: examData.presetId,
			};
			let saved = null;
			if (currentExamId) {
				saved = await window.API.update('exams', currentExamId, payload);
			} else {
				saved = await window.API.create('exams', payload);
			}
			if (saved && saved.id) {
				examData.id = saved.id;
				const i = exams.findIndex((e) => e.id === currentExamId || e.name === examData.name);
				if (i !== -1) exams[i] = examData;
			}
		} catch (apiErr) {
			console.warn('[exams] API save failed:', apiErr);
			showToast(
				'Failed to save exam on server: ' + (apiErr?.message || 'network error'),
				'error',
			);
			return;
		}

		if (currentExamId) {
			showToast('Exam updated successfully!');
		} else {
			showToast('Exam created successfully!');
		}
	} else {
		// No API client — keep the legacy behaviour so the page still works
		// when the bridge hasn't loaded yet.
		if (currentExamId) {
			showToast('Exam updated successfully!');
		} else {
			showToast('Exam created successfully!');
		}
	}

	saveExams();
	
	// Log activity
	if (typeof logActivity === 'function') {
		logActivity('exam', examData.name, currentExamId ? 'edited' : 'created', {
			id: examData.id,
			questionCount: selectedQuestions.length,
			duration: duration
		});
	}

	// Update Dashboard if available
	if (window.initDashboard) {
		window.initDashboard();
	}

	updateExamList();
	closeExamModal();

	// Broadcast Updates if enabled
	if (document.getElementById('setting-broadcastUpdates')?.checked) {
		console.log('Broadcast Updates enabled, triggering sync after exam save...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
}

function editExam(examId) {
	currentExamId = examId;
	const exam = exams.find((e) => e.id === examId);

	const modalTitleEl = document.getElementById('examModalTitle');
	const examNameEl = document.getElementById('examName');
	const examDurationEl = document.getElementById('examDuration');

	if (modalTitleEl) modalTitleEl.textContent = 'Edit Exam';
	if (examNameEl) examNameEl.value = exam.name || '';
	if (examDurationEl) examDurationEl.value = exam.duration || '';

	// Clear the selected questions list first
	document.getElementById('selectedQuestionsList').innerHTML = '';

	// Open modal first (this also populates preset dropdown)
	openExamModal();

	// Set preset selection after dropdown is populated
	const examPresetEl = document.getElementById('examPreset');
	if (examPresetEl && exam.presetId) {
		examPresetEl.value = exam.presetId;
	}

	// Load categories and questions after modal is shown
	setTimeout(() => {
		populateCategoryFilter();
		loadAvailableQuestions();

		// Wait for questions to be loaded, then select them
		setTimeout(() => {
			// For each question in the exam, select it and move to selected list
			exam.questions.forEach((qIndex) => {
				const questionEl = document.querySelector(
					`#availableQuestions .question-item[data-index="${qIndex}"]`,
				);
				if (questionEl) {
					// Hide from available and add to selected
					addQuestionToSelected(questionEl);
				}
			});

			// Update the counters
			updateSelectedCount();
			updateGlobalAvailableCount();
			updatePremiumSummaryStats();
		}, 200);
	}, 100);
}

async function deleteExam(examId) {
	if (confirm('Are you sure you want to delete this exam?')) {
		// Persist to server first; only after confirmation do we drop the
		// local row. This keeps the DB the source of truth.
		if (window.API && typeof window.API.remove === 'function') {
			try {
				await window.API.remove('exams', examId);
			} catch (apiErr) {
				console.warn('[exams] API delete failed:', apiErr);
				showToast(
					'Failed to delete exam on server: ' + (apiErr?.message || 'network error'),
					'error',
				);
				return;
			}
		}
		exams = exams.filter((e) => e.id !== examId);
		saveExams();
		updateExamList();
		showToast('Exam deleted successfully!');

		// Broadcast Updates if enabled
		if (document.getElementById('setting-broadcastUpdates')?.checked) {
			console.log('Broadcast Updates enabled, triggering sync after exam deletion...');
			if (window.syncQuestionsToClients) window.syncQuestionsToClients();
		}
	}
}

function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c == 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

function launchExam(examId) {
	const exam = exams.find((e) => e.id === examId);
	if (!exam) {
		showToast('Exam not found', 'error');
		return;
	}

	// Check if the exam has valid questions
	if (!examHasValidQuestions(exam)) {
		showNoQuestionsMessage();
		return;
	}

	// Show test mode modal instead of launching the exam
	showTestModeModal(exam);
}

function exportExams() {
	const exams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const dataStr = JSON.stringify(exams, null, 2);
	const dataUri =
		'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', 'quiz-exams.json');
	linkElement.click();
}

function importExams() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (e) => {
		const file = e.target.files[0];
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const newExams = JSON.parse(event.target.result);

				if (!Array.isArray(newExams) || !newExams.every(isValidExamStructure)) {
					throw new Error('Invalid exam data structure');
				}

				// Merge with existing exams, avoiding duplicates
				const existingExams = JSON.parse(
					JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('exams')) || '[]',
				);
				const mergedExams = mergeExams(existingExams, newExams);

				window.__DI_CONTAINER__.repo.setAll_sync('exams', mergedExams);
				updateExamList(mergedExams);
				showToast('Exams imported successfully!');
			} catch (error) {
				showToast('Error importing exams: ' + error.message, 'error');
			}
		};

		reader.readAsText(file);
	};

	input.click();
}

function isValidExamStructure(exam) {
	return (
		exam &&
		typeof exam.id === 'string' &&
		typeof exam.name === 'string' &&
		Array.isArray(exam.questions) &&
		typeof exam.duration === 'number' &&
		typeof exam.dateCreated === 'string'
	);
}

function mergeExams(existing, imported) {
	const examMap = new Map(existing.map((e) => [e.id, e]));

	imported.forEach((newExam) => {
		if (!examMap.has(newExam.id)) {
			examMap.set(newExam.id, newExam);
		}
	});

	return Array.from(examMap.values());
}

// Helper function to safely escape HTML
function escapeHtml(unsafe) {
	if (unsafe === null || unsafe === undefined) {
		return '';
	}

	try {
		// Convert to string if it's not already a string
		const safeStr = String(unsafe);

		return safeStr
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	} catch (e) {
		console.error('Error in escapeHtml:', e);
		return '[Error: Could not convert to string]';
	}
}

// Robust question type detector to handle multiple data shapes
function detectQuestionType(q) {
	if (!q) return 'multiple-choice';
	if (window.QuizTypes?.normalize) return window.QuizTypes.normalize(q.type || q.questionType, q);
	const raw = (q.type || '').toString().trim().toLowerCase();
	if (raw) {
		if (['draggable', 'ordering', 'arrange', 'order'].includes(raw))
			return 'draggable';
		if (['odd-one-out', 'oddoneout', 'odd_one_out'].includes(raw))
			return 'odd-one-out';
		if (['matching-pairs', 'matching'].includes(raw)) return 'matching-pairs';
		if (
			['fill-blank', 'fill-in', 'fill-in-the-blank', 'fillblank'].includes(raw)
		)
			return 'fill-blank';
		if (['true-false', 'truefalse'].includes(raw)) return 'true-false';
		return raw;
	}
	if (q.isDraggable) return 'draggable';
	return 'multiple-choice';
}

// Test Mode Modal Functions
function showTestModeModal(exam) {
	console.log('Showing test mode modal for exam:', exam);

	// Create modal container if it doesn't exist
	let modalContainer = document.getElementById('test-mode-modal');
	if (!modalContainer) {
		modalContainer = document.createElement('div');
		modalContainer.id = 'test-mode-modal';
		modalContainer.className = 'modal';
		document.body.appendChild(modalContainer);
	}

	try {
		// Create a simple display of the exam details
		modalContainer.innerHTML = `
            <div class="modal-content test-mode-content">
                <div class="modal-header">
                    <h2>Test Mode: ${escapeHtml(exam.name)}</h2>
                    <button class="close-btn" onclick="closeTestModeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="test-mode-info">
                        <p><strong>Exam Duration:</strong> ${
													exam.duration
												} minutes</p>
                        <p><strong>Total Questions:</strong> ${
													exam.questions.length
												}</p>
                    </div>
                    <div class="test-mode-questions">
                        <h3>Questions Preview</h3>
                        <div id="exam-questions-container"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn primary-btn" onclick="closeTestModeModal()">Close</button>
                </div>
            </div>
        `;

		// Show the modal
		modalContainer.style.display = 'block';

		// Add styles if they don't exist
		if (!document.getElementById('test-mode-styles')) {
			const styleElement = document.createElement('style');
			styleElement.id = 'test-mode-styles';
			styleElement.textContent = `
                .test-mode-content {
                    width: 90%;
                    max-width: 1000px;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                .test-mode-questions {
                    margin-top: 20px;
                }
                .test-mode-question {
                    background-color: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .question-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .question-number {
                    font-weight: bold;
                    color: #495057;
                }
                .question-type-badge {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    background-color: #e9ecef;
                    color: #495057;
                }
                .question-type-badge.draggable {
                    background-color: #d1ecf1;
                    color: #0c5460;
                }
                .question-type-badge.odd-one-out {
                    background-color: #f8d7da;
                    color: #721c24;
                }
                .question-text {
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .question-details {
                    background-color: #ffffff;
                    border-radius: 4px;
                    padding: 10px;
                }
                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .no-questions-message {
                    background-color: #f8d7da;
                    color: #721c24;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    text-align: center;
                    font-weight: bold;
                }
                .options-list {
                    list-style-type: none;
                    padding-left: 0;
                }
                .option-item {
                    padding: 8px 12px;
                    margin-bottom: 5px;
                    background-color: #f1f3f5;
                    border-radius: 4px;
                }
                .option-item.correct {
                    background-color: #d4edda;
                    border-color: #c3e6cb;
                    color: #155724;
                    font-weight: bold;
                }
                .correct-answer {
                    color: #28a745;
                    font-weight: bold;
                }
            `;
			document.head.appendChild(styleElement);
		}

		// Load the questions after the modal is shown
		loadExamQuestions(exam);
	} catch (error) {
		console.error('Error showing test mode modal:', error);
		modalContainer.innerHTML = `
            <div class="modal-content test-mode-content">
                <div class="modal-header">
                    <h2>Test Mode Error</h2>
                    <button class="close-btn" onclick="closeTestModeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="no-questions-message">
                        An error occurred while loading the test mode. Please try again.
                        <br><br>
                        Error details: ${error.message}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn primary-btn" onclick="closeTestModeModal()">Close</button>
                </div>
            </div>
        `;
		modalContainer.style.display = 'block';
	}
}

// Helper function to format answer for display
function formatAnswer(answer) {
	if (!answer) return '';

	let formattedAnswer = '';

	if (typeof answer === 'string') {
		formattedAnswer = escapeHtml(answer);
	} else if (Array.isArray(answer)) {
		formattedAnswer = escapeHtml(answer.join(', '));
	} else {
		formattedAnswer = escapeHtml(String(answer));
	}

	// Wrap the answer in a span with the correct-answer class
	return `<span class="correct-answer">${formattedAnswer}</span>`;
}

function loadExamQuestions(exam) {
	const container = document.getElementById('exam-questions-container');
	if (!container) return;

	// Get all questions from settings
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const allQuestions = savedQuestions || [];

	console.log('Loading exam questions:', exam);
	console.log('All available questions:', allQuestions);
	console.log('Question indices in this exam:', exam.questions);

	if (exam.questions.length === 0) {
		container.innerHTML = `<div class="no-questions-message">No questions found for this exam.</div>`;
		return;
	}

	// Check if there are any valid questions
	const validQuestions = exam.questions.filter((index) => allQuestions[index]);
	if (validQuestions.length === 0) {
		container.innerHTML = `<div class="no-questions-message">
            <p>This exam has no valid questions.</p>
            <p>All questions referenced by this exam have been deleted.</p>
            <p>Please edit the exam and add new questions.</p>
        </div>`;
		return;
	}

	// Build HTML for each question
	let questionsHtml = '';
	let validQuestionCount = 0;

	exam.questions.forEach((questionIndex) => {
		const question = allQuestions[questionIndex];
		if (!question) {
			// Skip invalid questions instead of showing "Question not found"
			return;
		}

		validQuestionCount++;

		// Determine question type and label using detector
		const qType = detectQuestionType(question);
		let typeLabel = '<span class="question-type-badge">Multiple choice</span>';

		if (qType === 'odd-one-out') {
			typeLabel =
				'<span class="question-type-badge odd-one-out">Find the odd one out</span>';
		} else if (qType === 'draggable') {
			typeLabel =
				'<span class="question-type-badge draggable">Arrange in order</span>';
		} else if (qType === 'matching-pairs') {
			typeLabel =
				'<span class="question-type-badge matching-pairs">Matching Pairs</span>';
		} else if (qType === 'fill-blank') {
			typeLabel =
				'<span class="question-type-badge fill-blank">Fill in the Blank</span>';
		} else if (qType === 'code') {
			typeLabel =
				'<span class="question-type-badge code">Code</span>';
		}

		// Format options based on question type
		let optionsHtml = '';
		let options = [];

		// Handle different formats of options (string, array, or undefined)
		if (question.options) {
			if (typeof question.options === 'string') {
				// If options is a string, split by comma
				options = question.options.split(',').map((o) => o.trim());
			} else if (Array.isArray(question.options)) {
				// If options is already an array
				options = question.options.map((o) => o.toString().trim());
			}
		}

		if (options.length > 0) {
			optionsHtml = '<ul class="options-list">';

			// Get the actual correct answer for exact comparison
			let correctAnswer = question.answer;

			if (correctAnswer) {
				if (typeof correctAnswer === 'string') {
					correctAnswer = correctAnswer.trim();
				} else if (Array.isArray(correctAnswer)) {
					correctAnswer = correctAnswer.map((a) => a.toString().trim());
				} else {
					correctAnswer = correctAnswer.toString().trim();
				}
			}

			options.forEach((option) => {
				let isCorrect = false;
				const trimmedOption = option.trim();

				// Check if this option is the correct answer (exact match only)
				if (correctAnswer) {
					if (typeof correctAnswer === 'string') {
						// If answer is a string, check if it exactly equals the option
						isCorrect = correctAnswer === trimmedOption;
					} else if (Array.isArray(correctAnswer)) {
						// If answer is an array, check if it includes the option exactly
						isCorrect = correctAnswer.includes(trimmedOption);
					} else {
						// For any other type, convert to string and compare
						isCorrect = correctAnswer === trimmedOption;
					}
				}

				optionsHtml += `
                    <li class="option-item ${isCorrect ? 'correct' : ''}">
                        ${escapeHtml(option)} ${
													isCorrect ? '<strong>✓ (Correct)</strong>' : ''
												}
                    </li>
                `;
			});

			optionsHtml += '</ul>';
		}

		questionsHtml += `
            <div class="test-mode-question">
                <div class="question-header">
                    <span class="question-number">Question ${validQuestionCount}</span>
                    ${typeLabel}
                </div>
                <p class="question-text">${escapeHtml(
									question.question || '',
								)}</p>
                ${
					question.type === 'code' && question.codeSnippet
						? `<div class="code-snippet-block" style="margin-bottom: 15px;">
                               <div class="code-snippet-header">
                                 <div class="code-snippet-dots">
                                   <span></span><span></span><span></span>
                                 </div>
                                 <div class="code-language-badge">${escapeHtml(question.codeLanguage || 'code')}</div>
                               </div>
                               <pre><code class="language-${escapeHtml(question.codeLanguage || 'javascript')}">${escapeHtml(question.codeSnippet)}</code></pre>
                             </div>`
						: ''
				}
                <div class="question-details">
                    <p><strong>Options:</strong></p>
                    ${optionsHtml}
                    <p><strong>Correct Answer:</strong> ${formatAnswer(
											question.answer,
										)}</p>
                    ${
											question.explanation
												? `<p><strong>Explanation:</strong> ${escapeHtml(
														question.explanation,
													)}</p>`
												: ''
										}
                </div>
            </div>
        `;
	});

	// Update the exam info to show valid question count
	const infoElement = document.querySelector('.test-mode-info');
	if (infoElement) {
		const totalQuestions = exam.questions.length;
		const invalidCount = totalQuestions - validQuestionCount;

		if (invalidCount > 0) {
			infoElement.innerHTML += `
                <p class="warning-text"><strong>Note:</strong> ${invalidCount} question(s) could not be found and have been skipped.</p>
            `;

			// Add style for warning text if not already added
			if (!document.getElementById('warning-text-style')) {
				const style = document.createElement('style');
				style.id = 'warning-text-style';
				style.textContent = `
                    .warning-text {
                        color: #856404;
                        background-color: #fff3cd;
                        padding: 8px;
                        border-radius: 4px;
                        margin-top: 10px;
                    }
                `;
				document.head.appendChild(style);
			}
		}
	}

	window.safeSetHTML ? window.safeSetHTML(container, questionsHtml, true) : (container.innerHTML = questionsHtml);
}

function closeTestModeModal() {
	const modalContainer = document.getElementById('test-mode-modal');
	if (modalContainer) {
		modalContainer.style.display = 'none';
	}
}

function undoQuestionSelections() {
	// Store current selections before clearing
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	);

	if (selectedQuestions.length === 0) {
		showToast('No selections to undo', 'info');
		return;
	}

	// Confirm with user
	if (
		confirm(
			`Are you sure you want to undo ${selectedQuestions.length} selections?`,
		)
	) {
		// Move all selected questions back to available
		selectedQuestions.forEach((question) => {
			const questionId = question.dataset.index;

			// Remove from selected list
			question.remove();

			// Show in available questions
			const availableQuestion = document.querySelector(
				`#availableQuestions .question-item[data-index="${questionId}"]`,
			);
			if (availableQuestion) {
				availableQuestion.style.display = 'block';
				availableQuestion.classList.remove('selected');
			}
		});

		// Update counts
		updateSelectedCount();

		showToast(`Undid ${selectedQuestions.length} selections`, 'success');
	}
}

function clearAllFiltersAndSelections() {
	// Clear all filter inputs
	document.getElementById('categoryFilterExam').value = '';
	document.getElementById('typeFilterExam').value = '';
	document.getElementById('difficultyFilterExam').value = '';
	const pointFilterExamMin = document.getElementById('pointFilterExamMin');
	if (pointFilterExamMin) pointFilterExamMin.value = '';
	const pointFilterExamMax = document.getElementById('pointFilterExamMax');
	if (pointFilterExamMax) pointFilterExamMax.value = '';
	document.getElementById('examQuestionSearch').value = '';

	// Clear quick filters (set to empty array)
	quickFilterActive = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Clear selections
	clearAllSelected();

	// Re-apply filters (which will now show all questions)
	filterExamQuestionsEnhanced();

	showToast('All filters and selections cleared', 'info');
}

// Enhanced version of clearAllSelected that doesn't show confirmation dialog
function clearAllSelectedSilent() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsList .question-item',
	);
	selectedQuestions.forEach((question) => {
		const questionId = question.dataset.index;
		const questionCategory = question.dataset.category;

		// Show the question back in the available side
		const availableQuestion = document.querySelector(
			`#availableQuestions .question-item[data-index="${questionId}"]`,
		);
		if (availableQuestion) {
			availableQuestion.style.display = 'block';
			availableQuestion.classList.remove('selected');
		}

		// Remove from selected list
		question.remove();
	});

	// Update all counts
	updateSelectedCount();
	updateCategoryQuestionCounts();
	updateGlobalAvailableCount();
	updatePremiumSummaryStats();
}

// Update the clearQuickFilters function to handle array filters
function clearQuickFilters() {
	quickFilterActive = [];

	// Remove active class from all quick filter buttons
	const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
	quickFilterButtons.forEach((btn) => {
		btn.classList.remove('active');
	});

	// Apply the filter (which will now show all questions)
	filterExamQuestionsEnhanced();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initExamManagement);

// Expose functions to window for HTML onclick handlers
window.createNewExam = createNewExam;
window.openExamModal = openExamModal;
window.closeExamModal = closeExamModal;
window.saveExam = saveExamForm;
window.editExam = editExam;
window.deleteExam = deleteExam;
window.toggleQuestionSelection = toggleQuestionSelection;
window.addQuestionToSelected = addQuestionToSelected;
window.removeQuestionFromSelected = removeQuestionFromSelected;
window.toggleCategoryFolder = toggleCategoryFolder;
window.moveEntireCategoryToSelected = moveEntireCategoryToSelected;
window.filterExamQuestions = filterExamQuestions;
window.updateSelectedCount = updateSelectedCount;

// Update the debounce function to use the enhanced filter
function debounceFilterExamQuestions() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		filterExamQuestionsEnhanced();
	}, 300);
}

// Update the search input to use the enhanced filter with debounce
document.addEventListener('DOMContentLoaded', function () {
	const searchInput = document.getElementById('examQuestionSearch');
	if (searchInput) {
		searchInput.addEventListener('keyup', debounceFilterExamQuestions);
	}
});

// ============================================
// EXAM ACTIVE SESSION PACKAGING
// ============================================

/**
 * Create an examActiveSession package for pushing to student devices
 * @param {string} examId - The exam ID to package
 * @returns {Object} examActiveSession object ready for student localStorage
 */
function createExamPackage(examId) {
	// Always resolve from latest storage first, because class assignments can be
	// updated in class-management without mutating this module's in-memory `exams`.
	const persistedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	const sourceExams =
		Array.isArray(persistedExams) && persistedExams.length ? persistedExams : exams;
	if (Array.isArray(persistedExams) && persistedExams.length) {
		exams = persistedExams;
	}
	const exam = sourceExams.find((e) => String(e.id) === String(examId));
	if (!exam) {
		console.error('Exam not found:', examId);
		return null;
	}

	// Get all questions from localStorage
	const allQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);

	// Get only the questions for this exam (supports index, id, or object entries)
	const resolveExamQuestionEntry = (entry) => {
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const hasQuestionPayload =
				entry.question ||
				entry.text ||
				Array.isArray(entry.options) ||
				Array.isArray(entry.optionData);
			if (hasQuestionPayload) {
				return { ...entry };
			}

			const candidateIndex = Number.parseInt(
				entry.questionIndex ?? entry.index ?? '',
				10,
			);
			if (Number.isInteger(candidateIndex) && allQuestions[candidateIndex]) {
				return {
					...allQuestions[candidateIndex],
					...entry,
				};
			}

			const candidateId = String(
				entry.id ?? entry.questionId ?? entry.uuid ?? '',
			).trim();
			if (candidateId) {
				const byId = allQuestions.find((question) => {
					if (!question || typeof question !== 'object') return false;
					const questionId = String(
						question.id ?? question.questionId ?? question.uuid ?? '',
					).trim();
					return questionId && questionId === candidateId;
				});
				if (byId) {
					return {
						...byId,
						...entry,
					};
				}
			}

			return null;
		}

		const numericRef =
			typeof entry === 'number'
				? entry
				: Number.parseInt(String(entry || '').trim(), 10);
		if (Number.isInteger(numericRef) && allQuestions[numericRef]) {
			return { ...allQuestions[numericRef] };
		}

		const idRef = String(entry || '').trim();
		if (!idRef) return null;
		const byId = allQuestions.find((question) => {
			if (!question || typeof question !== 'object') return false;
			const questionId = String(
				question.id ?? question.questionId ?? question.uuid ?? '',
			).trim();
			return questionId && questionId === idRef;
		});
		return byId ? { ...byId } : null;
	};

	const examQuestions = (Array.isArray(exam.questions) ? exam.questions : [])
		.map((entry) => resolveExamQuestionEntry(entry))
		.filter((question) => question);

	// Get preset settings if assigned
	let presetSettings = {};
	if (exam.presetId && window.getPresetById) {
		const preset = window.getPresetById(exam.presetId);
		if (preset) {
			presetSettings = {
				timeLimit: preset.timeLimit,
				penalty: preset.penalty,
				shuffleQuestions: preset.shuffleQuestions,
				showExplanations: preset.showExplanations,
				primaryColor: preset.primaryColor,
				secondaryColor: preset.secondaryColor,
				backgroundColor: preset.backgroundColor,
				textColor: preset.textColor,
				inputFocusColor: preset.inputFocusColor,
				fontFamily: preset.fontFamily,
				passingScore: preset.passingScore,
				welcomeTitle: preset.welcomeTitle,
				welcomeMessage: preset.welcomeMessage,
			};
		}
	}

	// Get current app settings as fallback
	const appSettings = (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});

	// Get allowed students from class rosters (quizClasses.students)
	let allowedStudents = [];
	const allClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	const rawClassRefs =
		Array.isArray(exam.classes) && exam.classes.length
			? exam.classes
			: Array.isArray(exam.classIds)
				? exam.classIds
				: [];
	const examClassRefs = rawClassRefs
		.map((ref) => {
			if (ref && typeof ref === 'object') {
				return (
					ref.id ||
					ref.classId ||
					ref.classID ||
					ref.name ||
					ref.className
				);
			}
			return ref;
		})
		.filter(Boolean)
		.map((ref) => String(ref));
	const hasClassFilter = examClassRefs.length > 0;

	const assignedClasses = hasClassFilter
		? allClasses.filter((c) => {
				const classId = String(c.id);
				const className = String(c.name || '');
				return examClassRefs.some(
					(ref) =>
						ref === classId ||
						(className && ref.toLowerCase() === className.toLowerCase()),
				);
			})
		: allClasses;

	const normalizeAllowedStudent = (student, className, classId = '') => {
		if (!student) return null;
		const number = String(
			student.number || student.studentNumber || student.numero || '',
		).trim();
		const name = String(
			student.name || student.fullName || student.username || '',
		).trim();
		const normalizedClassName = String(
			className || student.className || student.class || '',
		).trim();
		const normalizedClassId = String(student.classId || classId || '').trim();
		if (!number || !name || (!normalizedClassName && !normalizedClassId))
			return null;
		return {
			number,
			name,
			className: normalizedClassName || normalizedClassId,
			classId: normalizedClassId || undefined,
		};
	};

	const allowedStudentsMap = new Map();
	const pushAllowedStudent = (student, className, classId = '') => {
		const normalized = normalizeAllowedStudent(student, className, classId);
		if (!normalized) return;
		const dedupeClassKey = (normalized.classId || normalized.className)
			.toLowerCase()
			.trim();
		const dedupeKey = `${normalized.number.toLowerCase()}|${dedupeClassKey}`;
		if (!allowedStudentsMap.has(dedupeKey)) {
			allowedStudentsMap.set(dedupeKey, normalized);
		}
	};

	assignedClasses.forEach((cls) => {
		if (cls.students && Array.isArray(cls.students)) {
			cls.students.forEach((student) => {
				pushAllowedStudent(student, cls.name, cls.id);
			});
		}
	});

	// Also include users assigned to these classes (covers user-tab-only assignments)
	if (window.Auth?.getUsers) {
		const users = window.Auth.getUsers();
		const classById = new Map(assignedClasses.map((cls) => [String(cls.id), cls]));
		const classByName = new Map(
			assignedClasses.map((cls) => [String(cls.name || '').toLowerCase(), cls]),
		);

		users
			.filter(
				(user) =>
					String(user.role || '').toLowerCase() === 'student' &&
					String(user.status || '').toLowerCase() !== 'disabled',
			)
			.forEach((user) => {
				const classId = String(user.classId || '').trim();
				const classNameRef = String(user.className || '')
					.trim()
					.toLowerCase();
				const matchedClass =
					(classId && classById.get(classId)) ||
					(classNameRef && classByName.get(classNameRef));
				const refMatchedWithoutClass =
					!matchedClass &&
					(hasClassFilter
						? examClassRefs.some(
								(ref) =>
									ref === classId ||
									(classNameRef && ref.toLowerCase() === classNameRef),
							)
						: Boolean(classId || classNameRef));
				if (!matchedClass && !refMatchedWithoutClass) return;

				pushAllowedStudent(
					{
						number: user.studentNumber || user.number || user.numero || '',
						name: user.name || user.username || '',
					},
					matchedClass?.name || user.className || user.class || '',
					matchedClass?.id || classId,
				);
			});
	}

	allowedStudents = Array.from(allowedStudentsMap.values());

	if (hasClassFilter && assignedClasses.length === 0) {
		console.warn(
			'No matching classes found for exam.classes. Expected:',
			examClassRefs,
		);
	}

	// Build the examActiveSession package
	const sessionPackage = {
		version: '1.0',
		mode: 'exam',
		examId: exam.id,
		examName: exam.name,
		duration: exam.duration,
		timeLimit:
			presetSettings.timeLimit ||
			exam.duration * 60 ||
			appSettings.timeLimit ||
			3600,
		penalty: presetSettings.penalty ?? appSettings.penalty ?? 0,
		passingScore: presetSettings.passingScore || exam.passingScore || 60,
		shuffleQuestions: presetSettings.shuffleQuestions ?? true,
		showExplanations: presetSettings.showExplanations ?? false,
		questions: examQuestions,
		allowedStudents: allowedStudents, // Include allowlist
		settings: {
			primaryColor:
				presetSettings.primaryColor || appSettings.primaryColor || '#2563eb',
			secondaryColor:
				presetSettings.secondaryColor || appSettings.secondaryColor || '#1e40af',
			backgroundColor:
				presetSettings.backgroundColor || appSettings.backgroundColor || '#f8fafc',
			textColor: presetSettings.textColor || appSettings.textColor || '#1e293b',
			inputFocusColor:
				presetSettings.inputFocusColor ||
				appSettings.inputFocusColor ||
				'#3b82f6',
			fontFamily:
				presetSettings.fontFamily || appSettings.fontFamily || "'Segoe UI', system-ui",
			welcomeTitle: presetSettings.welcomeTitle || exam.name,
			welcomeMessage:
				presetSettings.welcomeMessage ||
				`You have ${exam.duration} minutes to complete this exam.`,
		},
		pushedAt: new Date().toISOString(),
		startedAt: null,
		completedAt: null,
		studentInfo: null,
		results: null,
	};

	return sessionPackage;
}

/**
 * Create a training mode examActiveSession package
 * @returns {Object} examActiveSession object for training mode
 */
function createTrainingPackage() {
	const allQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const appSettings = (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});

	// Get training preset if configured
	const trainingPresetId = appSettings.trainingPresetId || '';
	let presetSettings = {};
	if (trainingPresetId && window.getPresetById) {
		const preset = window.getPresetById(trainingPresetId);
		if (preset) {
			presetSettings = {
				timeLimit: preset.timeLimit,
				penalty: preset.penalty,
				shuffleQuestions: preset.shuffleQuestions,
				showExplanations: preset.showExplanations,
				primaryColor: preset.primaryColor,
				secondaryColor: preset.secondaryColor,
				backgroundColor: preset.backgroundColor,
				textColor: preset.textColor,
				inputFocusColor: preset.inputFocusColor,
				fontFamily: preset.fontFamily,
				welcomeTitle: preset.welcomeTitle,
				welcomeMessage: preset.welcomeMessage,
			};
		}
	}

	return {
		version: '1.0',
		mode: 'training',
		examId: 'training',
		examName: 'Training Quiz',
		timeLimit: presetSettings.timeLimit || appSettings.timeLimit || 300,
		penalty: presetSettings.penalty ?? appSettings.penalty ?? 0,
		shuffleQuestions: presetSettings.shuffleQuestions ?? true,
		showExplanations: presetSettings.showExplanations ?? true,
		questions: allQuestions,
		settings: {
			primaryColor:
				presetSettings.primaryColor || appSettings.primaryColor || '#2563eb',
			secondaryColor:
				presetSettings.secondaryColor || appSettings.secondaryColor || '#1e40af',
			backgroundColor:
				presetSettings.backgroundColor || appSettings.backgroundColor || '#f8fafc',
			textColor: presetSettings.textColor || appSettings.textColor || '#1e293b',
			inputFocusColor:
				presetSettings.inputFocusColor ||
				appSettings.inputFocusColor ||
				'#3b82f6',
			fontFamily:
				presetSettings.fontFamily || appSettings.fontFamily || "'Segoe UI', system-ui",
			welcomeTitle:
				presetSettings.welcomeTitle ||
				appSettings.welcomeTitle ||
				'Training Quiz',
			welcomeMessage:
				presetSettings.welcomeMessage ||
				appSettings.welcomeMessage ||
				'Practice your knowledge!',
		},
		pushedAt: new Date().toISOString(),
		startedAt: null,
		completedAt: null,
		studentInfo: null,
		results: null,
	};
}

/**
 * Push exam package to all connected devices via socket
 * @param {string} examId - The exam ID to push
 */
function pushExamToDevices(examId) {
	if (window.Auth?.isAdmin && !window.Auth.isAdmin()) {
		showToast('Access denied', 'error');
		return;
	}
	const sessionPackage = createExamPackage(examId);
	if (!sessionPackage) {
		showToast('Failed to create exam package', 'error');
		return;
	}

	// Add pushed timestamp to prevent duplicate processing on client (infinite loop fix)
	sessionPackage.pushedAt = Date.now();

	console.log('pushExamToDevices called with examId:', examId);
	console.log('Session package to send:', sessionPackage);

	// Emit via socket if available
	if (window.io) {
		// Use the existing admin socket if available, otherwise create a new one
		let socket = window.adminSocket;
		console.log('window.adminSocket exists:', !!socket);
		console.log('socket.connected:', socket && socket.connected);

		if (!socket || !socket.connected) {
			console.log('Creating new admin socket...');
			const SERVER = (
				localStorage.getItem('quizServerHost') ||
				window.QUIZ_SERVER_HOST ||
				location.origin
			).replace(/\/$/, '');

			socket = window.getSocket();
			if (!socket) {
				showToast('Sign in before pushing an exam to devices', 'error');
				return;
			}
			// Wait for connection, then identify as admin, then emit the session
			socket.on('connect', () => {
				console.log('New admin socket connected, identifying...');
				socket.emit('identify', { role: 'admin' });
				// Give server time to process identify before emitting session
				setTimeout(() => {
					console.log('Emitting admin:pushSession...');
					socket.emit('admin:pushSession', sessionPackage);
					console.log('Exam pushed to devices:', sessionPackage.examName);
					// Track last pushed ID for automatic refinement/broadcast
					localStorage.setItem('lastPushedExamId', examId);
					showToast(
						`Exam "${sessionPackage.examName}" pushed to devices`,
						'success',
					);
					// Log activity
					if (window.logDeviceActivity) {
						window.logDeviceActivity(
							'push_exam',
							`Pushed exam "${sessionPackage.examName}"`,
							`Assigned to ${sessionPackage.questions?.length || 0} questions`,
							'Admin',
							{
								examId: sessionPackage.examId,
								examName: sessionPackage.examName,
								questionCount: sessionPackage.questions?.length || 0,
							},
						);
					}
				}, 100);
			});
		} else {
			// Use existing admin socket
			console.log('Using existing admin socket');
			socket.emit('admin:pushSession', sessionPackage);
			console.log('Exam pushed to devices:', sessionPackage.examName);
			// Track last pushed ID for automatic refinement/broadcast
			localStorage.setItem('lastPushedExamId', examId);
			showToast(
				`Exam "${sessionPackage.examName}" pushed to devices`,
				'success',
			);
			// Log activity
			if (window.logDeviceActivity) {
				window.logDeviceActivity(
					'push_exam',
					`Pushed exam "${sessionPackage.examName}"`,
					`Assigned to ${sessionPackage.questions?.length || 0} questions`,
					'Admin',
					{
						examId: sessionPackage.examId,
						examName: sessionPackage.examName,
						questionCount: sessionPackage.questions?.length || 0,
					},
				);
			}
		}
	} else {
		console.error('window.io not available');
		showToast('Socket.IO not available. Cannot push to devices.', 'error');
	}
}

/**
 * Stop active exam on all connected devices
 * @param {string} examId - The exam ID to stop (optional context)
 */
function stopExamOnDevices(examId) {
	if (window.Auth?.isAdmin && !window.Auth.isAdmin()) {
		showToast('Access denied', 'error');
		return;
	}
	const exam = exams.find((e) => e.id === examId);
	const examName = exam ? exam.name : 'Active Exam';

	if (
		!confirm(
			`Are you sure you want to stop the exam "${examName}" on all devices? Clients will be returned to training mode.`,
		)
	) {
		return;
	}

	// Clear tracking
	localStorage.removeItem('lastPushedExamId');

	if (window.adminSocket && window.adminSocket.connected) {
		window.adminSocket.emit('admin:stopExam');
		showToast(`Stopped exam session on all devices`, 'success');
		// Log activity
		if (window.logDeviceActivity) {
			window.logDeviceActivity(
				'stop_exam',
				`Stopped exam session: "${examName}"`,
				`Returned all devices to training mode`,
			);
		}
	} else if (window.io) {
		// Fallback: try using the global IO to send it if adminSocket is not set
		const SERVER = (
			localStorage.getItem('quizServerHost') ||
			window.QUIZ_SERVER_HOST ||
			location.origin
		).replace(/\/$/, '');
		const socket = window.getSocket();
		if (!socket) {
			showToast('Sign in before stopping exams on devices', 'error');
			return;
		}
		socket.on('connect', () => {
			socket.emit('identify', { role: 'admin' });
			setTimeout(() => {
				socket.emit('admin:stopExam');
				showToast(`Stopped exam session on all devices`, 'success');
				// Log activity
				if (window.logDeviceActivity) {
					window.logDeviceActivity(
						'stop_exam',
						`Stopped exam session: "${examName}"`,
						`Returned all devices to training mode`,
					);
				}
				socket.disconnect();
			}, 100);
		});
	} else {
		showToast('Not connected to server', 'error');
	}
}
window.stopExamOnDevices = stopExamOnDevices;

/**
 * Push training package to all connected devices
 */
function pushTrainingToDevices() {
	const sessionPackage = createTrainingPackage();

	if (window.io) {
		// Use the existing admin socket if available, otherwise create a new one
		let socket = window.adminSocket;
		if (!socket || !socket.connected) {
			const SERVER = (
				localStorage.getItem('quizServerHost') ||
				window.QUIZ_SERVER_HOST ||
				location.origin
			).replace(/\/$/, '');

			socket = window.getSocket();
			if (!socket) {
				showToast('Sign in before pushing training to devices', 'error');
				return;
			}
			// Wait for connection, then identify as admin, then emit the session
			socket.on('connect', () => {
				console.log('New admin socket connected, identifying...');
				socket.emit('identify', { role: 'admin' });
				// Give server time to process identify before emitting session
				setTimeout(() => {
					socket.emit('admin:pushSession', sessionPackage);
					console.log('Training mode pushed to devices');
					showToast('Training mode pushed to devices', 'success');
				}, 100);
			});
		} else {
			// Use existing admin socket
			socket.emit('admin:pushSession', sessionPackage);
			console.log('Training mode pushed to devices');
			showToast('Training mode pushed to devices', 'success');
		}
	} else {
		showToast('Socket.IO not available. Cannot push to devices.', 'error');
	}
}

// Expose packaging functions
window.createExamPackage = createExamPackage;
window.createTrainingPackage = createTrainingPackage;
window.pushExamToDevices = pushExamToDevices;
window.pushTrainingToDevices = pushTrainingToDevices;
window.refreshExamList = refreshExamList;
window.loadExams = loadExams;
window.updateExamList = updateExamList;

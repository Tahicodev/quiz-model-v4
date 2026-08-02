// ============================================
// CATEGORY MANAGEMENT - STATE & CONFIGURATION
// ============================================
// This file manages the category modal functionality
// Uses unique element IDs: availableQuestionsCategory, selectedQuestionsListCategory,
// selectedQuestionCountCategory, availableQuestionCountCategory

// Category Management State
let categories = [];
let currentCategoryId = null;
let categorySortDirection = 'asc';
let selectedQuestionsForCategory = [];
let availableQuestionsForCategory = [];
let categoryDebounceTimer;

// ============================================
// QUICK CATEGORY CREATION MODAL
// ============================================
// Function to add new category inline from question modal
function addNewCategoryInline() {
    // Open the quick category modal instead of using prompt
    openQuickCategoryModal();
}

// Quick Category Modal Functions
function openQuickCategoryModal() {
    const modal = document.getElementById('quickCategoryModal');
    if (modal) {
        modal.style.display = 'block';
        // Focus on the name input
        setTimeout(() => {
            document.getElementById('quickCategoryName').focus();
        }, 100);
    }
}

function closeQuickCategoryModal() {
    const modal = document.getElementById('quickCategoryModal');
    if (modal) {
        modal.style.display = 'none';
        // Reset the form
        document.getElementById('quickCategoryForm').reset();
        document.getElementById('quickCategoryColor').value = '#3b82f6';
    }
}

function setQuickCategoryColor(color) {
    const colorInput = document.getElementById('quickCategoryColor');
    if (colorInput) {
        colorInput.value = color;
    }
}

function saveQuickCategoryForm() {
    const categoryName = document.getElementById('quickCategoryName').value.trim();
    const categoryColor = document.getElementById('quickCategoryColor').value;
    
    if (!categoryName) {
        showToast('Please enter a category name', 'error');
        return;
    }
    
    // Check if category already exists
    const existingCategory = categories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
    if (existingCategory) {
        showToast('Category with this name already exists', 'error');
        return;
    }
    
    const newCategory = {
        id: generateUUID(),
        name: categoryName,
        color: categoryColor,
        questionCount: 0,
        dateCreated: new Date().toISOString(),
        ownerId: window.Auth?.getCurrentUser?.()?.id || ''
    };
    
    categories.push(newCategory);
    saveCategories();
    updateCategoryList();
    loadCategoriesIntoSelect();
    
    // Select the newly created category
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
        categorySelect.value = newCategory.id;
    }
    
    closeQuickCategoryModal();
    showToast('Category created successfully!');
    
    // Log activity
    if (typeof logActivity === 'function') {
        logActivity('category', newCategory.name, 'created', {
            id: newCategory.id,
            questionCount: 0
        });
    }
}

// Default category colors
const DEFAULT_CATEGORY_COLORS = [
 '#3b82f6', // blue
 '#10b981', // green
 '#f59e0b', // amber
 '#ef4444', // red
 '#8b5cf6', // violet
 '#06b6d4', // cyan
 '#f97316', // orange
 '#84cc16', // lime
 '#ec4899', // pink
 '#6366f1'  // indigo
];

// Initialize category management
function initCategoryManagement() {
    loadCategories();
    // Recalculate question counts based on actual questions in localStorage
    updateQuestionCategoryCounts();
    updateCategoryList();
    setupCategoryEventListeners();
    loadCategoriesIntoSelect();
    loadCategoriesIntoFilters();
    
    // Set initial sort direction state in UI
    const sortDirectionButton = document.getElementById('sortCategoryDirection');
    if (sortDirectionButton) {
        sortDirectionButton.classList.add('desc');
    }
}

function loadCategories() {
    const savedCategories = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('categories'));
    categories = savedCategories ? JSON.parse(savedCategories) : [];
    
    // If no categories exist, create a default uncategorized category
    if (categories.length === 0) {
        createDefaultCategories();
    } else {
        // Ensure uncategorized category exists and has correct ID
        let uncategorizedIndex = categories.findIndex(cat =>
            cat.id === 'uncategorized' || cat.name.toLowerCase() === 'uncategorized'
        );
        
        if (uncategorizedIndex === -1) {
            // Create uncategorized category if it doesn't exist
            categories.unshift({
                id: 'uncategorized',
                name: 'Uncategorized',
                description: 'Questions without category assignment',
                color: '#6b7280',
                questionCount: 0,
                dateCreated: new Date().toISOString(),
                isSystem: true
            });
            saveCategories();
        } else if (categories[uncategorizedIndex].id !== 'uncategorized') {
            // Fix ID if it exists but has wrong ID (UUID instead of 'uncategorized')
            const oldId = categories[uncategorizedIndex].id;
            categories[uncategorizedIndex].id = 'uncategorized';
            categories[uncategorizedIndex].isSystem = true;
            
            // Update all questions using the old ID to use 'uncategorized'
            const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
            let questionsUpdated = false;
            savedQuestions.forEach(question => {
                if (question.category === oldId) {
                    question.category = 'uncategorized';
                    questionsUpdated = true;
                }
            });
            
            if (questionsUpdated) {
                window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
            }
            
            saveCategories();
        }
    }

}

function createDefaultCategories() {
    categories = [
        {
            id: 'uncategorized',
            name: 'Uncategorized',
            description: 'Questions without category assignment',
            color: '#6b7280',
            questionCount: 0,
            dateCreated: new Date().toISOString(),
            isSystem: true
        }
    ];
    saveCategories();
}

function saveCategories() {
    window.__DI_CONTAINER__.repo.setAll_sync('categories', categories);
    
    // Update Dashboard if available
    if (window.initDashboard) {
        window.initDashboard();
    }
    updateQuestionCategoryCounts();
}

function updateQuestionCategoryCounts() {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    const questions = savedQuestions || [];
    
    // Reset all category counts
    categories.forEach(category => {
        category.questionCount = 0;
    });
    
    // Count questions per category
    questions.forEach(question => {
        const questionCategoryId = question.category || 'uncategorized';
        const categoryObj = categories.find(c => c.id === questionCategoryId);
        if (categoryObj) {
            categoryObj.questionCount++;
        }
    });
    
    // Save updated categories
    window.__DI_CONTAINER__.repo.setAll_sync('categories', categories);
}

// Populate category filter in category modal
function populateCategoryFilter() {
    console.log('populateCategoryFilter called');
    const categoryFilterCategory = document.getElementById('categoryFilterCategory');
    if (!categoryFilterCategory) {
        console.error('categoryFilterCategory element not found');
        return;
    }

    // Always fetch fresh from localStorage to match loadAvailableQuestionsForCategory
    let savedCategories = [];
    try {
        savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
    } catch (e) {
        console.error('Error loading categories:', e);
        savedCategories = [];
    }

    console.log('Loaded categories for filter:', savedCategories.length);
    
    // Clear and set defaults
    categoryFilterCategory.innerHTML = `
        <option value="">All Categories</option>
        <option value="recent">Recent</option>
        <option value="unused">Unused</option>
        <option value="popular">Popular</option>
        <option value="uncategorized">Uncategorized</option>
    `;
    
    // Add categories
    if (Array.isArray(savedCategories)) {
        savedCategories.forEach(category => {
            if (category && category.id && category.name && !category.isSystem) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categoryFilterCategory.appendChild(option);
            }
        });
    }
    
    // Debug: check resulting options
    console.log('Filter options count:', categoryFilterCategory.options.length);

    // Add event listener if not already present
    if (!categoryFilterCategory.dataset.listenerAttached) {
        categoryFilterCategory.addEventListener('change', filterCategoryQuestions);
        categoryFilterCategory.dataset.listenerAttached = 'true';
    }
}

function createNewCategory() {
    currentCategoryId = null;
    document.getElementById('categoryModalTitle').textContent = 'Create New Category';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryColor').value = getRandomCategoryColor();
    
    // Clear selected questions
    const selectedContainer = document.getElementById('selectedQuestionsListCategory');
    if (selectedContainer) {
        selectedContainer.innerHTML = '';
    }
    
    // Show modal first
    openCategoryModal();
    
    // Load available questions after a small delay
    setTimeout(() => {
        populateCategoryFilter();
        loadAvailableQuestionsForCategory();
        updateCategoryQuestionCountsUI();
        console.log('New category modal opened and questions loaded');
    }, 100);
}

function editCategory(categoryId) {
    currentCategoryId = categoryId;
    const category = categories.find(c => c.id === categoryId);
    
    if (!category) {
        showToast('Category not found', 'error');
        return;
    }
    
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryName').value = category.name || '';
    document.getElementById('categoryDescription').value = category.description || '';
    document.getElementById('categoryColor').value = category.color || '#3b82f6';
    
    // Clear selected questions container
    const selectedContainer = document.getElementById('selectedQuestionsListCategory');
    if (selectedContainer) {
        selectedContainer.innerHTML = '';
    }
    
    // Show modal first
    openCategoryModal();
    
    // Load available questions - selected questions are now handled inside loadAvailableQuestionsForCategory
    setTimeout(() => {
        populateCategoryFilter();
        loadAvailableQuestionsForCategory();
        updateCategoryQuestionCountsUI();
        updateBulkActionButtonsForCategory();
        console.log('Edit category modal opened and questions loaded');
    }, 100);
}

function deleteCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    
    if (category.isDefault) {
        showToast('Cannot delete default categories', 'error');
        return;
    }
    
    if (confirm(`Are you sure you want to delete "${category.name}"? All questions in this category will become uncategorized.`)) {
        // Remove category from questions
        const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
        const questions = savedQuestions || [];
        
        questions.forEach(question => {
            if (question.category === category.name || question.category === category.id) {
                question.category = '';
            }
        });
        
        window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
        
        // Remove category
        categories = categories.filter(c => c.id !== categoryId);
        saveCategories();
        updateCategoryList();
        loadCategoriesIntoFilters();
        showToast('Category deleted successfully!');
    }
}

function saveCategoryForm() {
    const name = document.getElementById('categoryName').value.trim();
    const description = document.getElementById('categoryDescription').value.trim();
    const color = document.getElementById('categoryColor').value;
    
    if (!name) {
        showToast('Please enter a category name', 'error');
        return;
    }
    
    // Check for duplicate names (excluding current category if editing)
    const existingCategory = categories.find(c =>
        c.name.toLowerCase() === name.toLowerCase() && c.id !== currentCategoryId
    );
    
    if (existingCategory) {
        showToast('A category with this name already exists', 'error');
        return;
    }
    
    // Get assigned questions from the selected questions list in the modal
    const selectedQuestionElements = document.querySelectorAll('#selectedQuestionsListCategory .premium-question-item, #selectedQuestionsListCategory .question-item');
    const assignedQuestionIds = Array.from(selectedQuestionElements).map(el => parseInt(el.dataset.questionId || el.dataset.index));
    
    const categoryData = {
        id: currentCategoryId || generateUUID(),
        name: name,
        description: description || '',
        color: color,
        questions: assignedQuestionIds,
        questionCount: assignedQuestionIds.length,
        dateCreated: currentCategoryId ?
            categories.find(c => c.id === currentCategoryId)?.dateCreated || new Date().toISOString() :
            new Date().toISOString(),
        isSystem: false,
        ownerId: currentCategoryId
			? categories.find(c => c.id === currentCategoryId)?.ownerId || window.Auth?.getCurrentUser?.()?.id || ''
			: window.Auth?.getCurrentUser?.()?.id || ''
    };
    
    if (currentCategoryId) {
        const index = categories.findIndex(c => c.id === currentCategoryId);
        if (index !== -1) {
            categories[index] = categoryData;
        }
    } else {
        categories.push(categoryData);
    }
    
    // Update questions with category assignment FIRST
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    
    // First, remove this category from all questions
    savedQuestions.forEach(question => {
        if (question.category === categoryData.id) {
            question.category = 'uncategorized';
        }
    });
    
    // Then assign the category to selected questions
    assignedQuestionIds.forEach(questionId => {
        if (savedQuestions[questionId]) {
            savedQuestions[questionId].category = categoryData.id;
        }
    });
    
    // Save updated questions
    window.__DI_CONTAINER__.repo.setAll_sync('questions', savedQuestions);
    
    // NOW save categories and update UI (counts will be correct now)
    saveCategories();
    updateCategoryList();
    loadCategoriesIntoSelect();
    loadCategoriesIntoFilters();
    
    closeCategoryModal();
    showToast('Category saved successfully!', 'success');
    
    // Log activity
    if (typeof logActivity === 'function') {
        logActivity('category', categoryData.name, currentCategoryId ? 'edited' : 'created', {
            id: categoryData.id,
            questionCount: assignedQuestionIds.length
        });
    }
}

// Initialize Color Picker
function initColorPicker() {
    const container = document.getElementById('colorSwatches');
    if (!container) return;

    container.innerHTML = '';
    
    // Use default colors or fallback
    const colors = typeof DEFAULT_CATEGORY_COLORS !== 'undefined' ? DEFAULT_CATEGORY_COLORS : [
        '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', 
        '#ec4899', '#6366f1', '#f97316', '#14b8a6', '#06b6d4', '#6b7280'
    ];

    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'color-swatch-btn';
        btn.style.backgroundColor = color;
        btn.onclick = () => selectColorSwatch(color);
        container.appendChild(btn);
    });
}

function selectColorSwatch(color) {
    const input = document.getElementById('categoryColor');
    if (input) {
        input.value = color;
    }

    // Update UI
    document.querySelectorAll('.color-swatch-btn').forEach(btn => {
        if (btn.style.backgroundColor === color || 
           (color.startsWith('#') && rgbToHex(btn.style.backgroundColor) === color.toLowerCase())) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Helper to handle RGB to Hex comparison if needed
function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb;
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    const rgbVals = rgb.substr(4).split(")")[0].split(sep);
    let r = (+rgbVals[0]).toString(16),
        g = (+rgbVals[1]).toString(16),
        b = (+rgbVals[2]).toString(16);
    if (r.length == 1) r = "0" + r;
    if (g.length == 1) g = "0" + g;
    if (b.length == 1) b = "0" + b;
    return "#" + r + g + b;
}

function openCategoryModal() {
    // Reset selected questions
    selectedQuestionsForCategory = [];
    
    // Show modal first
    const modal = document.getElementById('categoryModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    }
    
    // Initialize color picker logic
    initColorPicker();
    
    // Set initial color state
    const currentColor = document.getElementById('categoryColor').value;
    selectColorSwatch(currentColor);
    
    // Load available questions after a small delay to ensure DOM is ready
    setTimeout(() => {
        populateCategoryFilter();
        setupCategoryModalFilters();
        loadAvailableQuestionsForCategory();
        updateCategoryQuestionCountsUI();
        console.log('Category modal opened and questions loaded');
    }, 100);
}

function setupCategoryModalFilters() {
    const searchInput = document.getElementById('questionSearchCategory');
    const typeFilter = document.getElementById('questionFilterCategory');
    const categoryFilter = document.getElementById('categoryFilterCategory');
    const difficultyFilter = document.getElementById('difficultyFilterCategory');
    const pointFilterMin = document.getElementById('pointFilterCategoryMin');
    const pointFilterMax = document.getElementById('pointFilterCategoryMax');

    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', debounceFilterCategoryQuestions);
        searchInput.dataset.listenerAttached = 'true';
    }
    if (typeFilter && !typeFilter.dataset.listenerAttached) {
        typeFilter.addEventListener('change', filterCategoryQuestionsEnhanced);
        typeFilter.dataset.listenerAttached = 'true';
    }
    if (categoryFilter && !categoryFilter.dataset.listenerAttached) {
        categoryFilter.addEventListener('change', filterCategoryQuestionsEnhanced);
        categoryFilter.dataset.listenerAttached = 'true';
    }
    if (difficultyFilter && !difficultyFilter.dataset.listenerAttached) {
        difficultyFilter.addEventListener('change', filterCategoryQuestionsEnhanced);
        difficultyFilter.dataset.listenerAttached = 'true';
    }
    if (pointFilterMin && !pointFilterMin.dataset.listenerAttached) {
        pointFilterMin.addEventListener('input', debounceFilterCategoryQuestions);
        pointFilterMin.dataset.listenerAttached = 'true';
    }
    if (pointFilterMax && !pointFilterMax.dataset.listenerAttached) {
        pointFilterMax.addEventListener('input', debounceFilterCategoryQuestions);
        pointFilterMax.dataset.listenerAttached = 'true';
    }
}

function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    
    // Reset selected questions
    selectedQuestionsForCategory = [];
    availableQuestionsForCategory = [];
    
    // Clear filters
    currentFilterForCategory = {
        search: '',
        type: 'all',
        category: '',
        difficulty: '',
        points: ''
    };
    
    // Clear form
    document.getElementById('categoryForm').reset();
}

// Helper function to determine question type
function getQuestionType(question) {
    if (window.QuizTypes?.normalize) return window.QuizTypes.normalize(question.type || question.questionType, question);
    if (question.type) return question.type;
    if (question.isDraggable) return 'draggable';
    return 'multiple-choice';
}

function assignQuestionsToUncategorized() {
    currentCategoryId = 'uncategorized';
    document.getElementById('categoryModalTitle').textContent = 'Assign Questions to Uncategorized';
    document.getElementById('categoryForm').reset();
    
    console.log('Opening assign to uncategorized modal');
    
    // Reset selected questions
    selectedQuestionsForCategory = [];
    
    // Load available questions
    loadAvailableQuestionsForCategory();
    
    // Show modal
    document.getElementById('categoryModal').style.display = 'block';
    
    console.log('Modal should be open now');
}

// Load questions for category assignment interface with premium question selection grid
function loadCategoryQuestions() {
    // This function is deprecated and replaced by loadAvailableQuestionsForCategory
    // Keeping it for backward compatibility
    loadAvailableQuestionsForCategory();
}

// ============================================
// CATEGORY MODAL - UI UPDATE FUNCTIONS
// ============================================

// Update category question counts in UI
function updateCategoryQuestionCountsUI() {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    
    // Calculate total available questions across ALL category folders (sum)
    let totalAvailable = 0;
    
    // Update category folder counts and sum up total available
    document.querySelectorAll('#availableQuestionsCategory .category-folder').forEach(folder => {
        const categoryId = folder.dataset.category;
        const allQuestionsInFolder = folder.querySelectorAll('.question-item');
        const questionsInFolder = allQuestionsInFolder.length;
        
        // Count only visible questions (not hidden with display:none)
        let availableInFolder = 0;
        allQuestionsInFolder.forEach(q => {
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
        const categoryCountElement = document.getElementById(`count-${categoryId}`);
        if (categoryCountElement) {
            categoryCountElement.textContent = availableInFolder;
        }
    });
    
    // Update the main available question count with the total sum
    const availableCountElement = document.getElementById('availableQuestionCountCategory');
    if (availableCountElement) {
        availableCountElement.textContent = totalAvailable;
    }
    
    // Update selected questions count and difficulty breakdown
    // Support both .premium-question-item and .question-item classes
    const selectedQuestions = document.querySelectorAll('#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item');
    const selectedCount = selectedQuestions.length;
    const selectedCountElement = document.getElementById('selectedQuestionCountCategory');
    if (selectedCountElement) {
        selectedCountElement.textContent = selectedCount;
    }

    const selectedPointsElement = document.getElementById('selectedQuestionPointsCategory');
    if (selectedPointsElement) {
        const totalPoints = Array.from(selectedQuestions).reduce((sum, questionElement) => {
            const questionId = parseInt(questionElement.dataset.questionId || questionElement.dataset.index);
            const fromData = Number.parseFloat(questionElement.dataset.points);
            const fromStorage = Number.parseFloat(savedQuestions[questionId]?.points);
            return sum + (Number.isFinite(fromData) ? fromData : Number.isFinite(fromStorage) ? fromStorage : 1);
        }, 0);
        selectedPointsElement.textContent = Number.isInteger(totalPoints)
            ? String(totalPoints)
            : totalPoints.toFixed(1);
    }
    
    // Update total selected count
    const totalSelectedCountElement = document.getElementById('totalSelectedCountCategory');
    if (totalSelectedCountElement) {
        totalSelectedCountElement.textContent = selectedCount;
    }
    
    // Count by difficulty
    let easyCount = 0;
    let mediumCount = 0;
    let hardCount = 0;
    
    selectedQuestions.forEach(questionElement => {
        // Support both data-question-id and data-index
        const questionId = parseInt(questionElement.dataset.questionId || questionElement.dataset.index);
        const question = savedQuestions[questionId];
        if (question) {
            const difficulty = question.difficulty || 'medium';
            if (difficulty === 'easy') easyCount++;
            else if (difficulty === 'medium') mediumCount++;
            else if (difficulty === 'hard') hardCount++;
        }
    });
    
    // Update difficulty counts
    const easyElement = document.getElementById('easySelectedCountCategory');
    if (easyElement) easyElement.textContent = easyCount;
    
    const mediumElement = document.getElementById('mediumSelectedCountCategory');
    if (mediumElement) mediumElement.textContent = mediumCount;
    
    const hardElement = document.getElementById('hardSelectedCountCategory');
    if (hardElement) hardElement.textContent = hardCount;
    
    // Update bulk action buttons
    updateBulkActionButtonsForCategory();
}

// Create HTML for a single question (for folder display) - Premium version
function createPremiumQuestionHtmlForCategory(question, questionId, questionType, category, difficulty) {
    const questionContent = createCleanQuestionContent(question, questionType, category);
    
    return `
        <div class="premium-question-item" data-question-id="${questionId}" data-question-type="${questionType}" data-difficulty="${difficulty}" data-points="${Number.parseFloat(question.points) || 1}" onclick="togglePremiumQuestionSelectionForCategory(this)">
            <div class="premium-question-header">
                <span class="premium-question-number">#${questionId + 1}</span>
                <div class="premium-question-title">${escapeHtml(question.question.substring(0, 50))}${question.question.length > 50 ? '...' : ''}</div>
                <div class="premium-question-actions">
                    <button class="premium-action-btn" onclick="event.stopPropagation(); previewQuestionForCategory(${questionId})" title="Preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="premium-question-preview">${escapeHtml(question.question.substring(0, 100))}${question.question.length > 100 ? '...' : ''}</div>
            <div class="premium-question-meta">
                <span class="premium-badge premium-type-badge">${questionType}</span>
                <span class="premium-badge premium-difficulty-badge premium-difficulty-${difficulty}">${difficulty}</span>
                <span class="premium-badge premium-category-badge">${escapeHtml(category.name)}</span>
            </div>
            ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-question-image">` : ''}
            <div class="premium-question-footer">
                <span class="premium-question-date">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    ${new Date(question.dateCreated || Date.now()).toLocaleDateString()}
                </span>
            </div>
        </div>
    `;
}

// Create premium question element for assigned questions
function createPremiumQuestionElementForCategory(question, questionId, questionType, category, difficulty, isAssigned) {
    const questionElement = document.createElement('div');
    questionElement.className = 'premium-question-item';
    questionElement.dataset.questionId = questionId;
    questionElement.dataset.questionType = questionType;
    questionElement.dataset.difficulty = difficulty;
    
    questionElement.innerHTML = `
        <div class="premium-question-header">
            <span class="premium-question-number">#${questionId + 1}</span>
            <div class="premium-question-title">${escapeHtml(question.question.substring(0, 50))}${question.question.length > 50 ? '...' : ''}</div>
            <div class="premium-question-actions">
                <button class="premium-action-btn" onclick="event.stopPropagation(); previewQuestionForCategory(${questionId})" title="Preview">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
                <button class="premium-action-btn" onclick="event.stopPropagation(); removeQuestionFromCategoryAssignment(${questionId})" title="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="premium-question-preview">${escapeHtml(question.question.substring(0, 100))}${question.question.length > 100 ? '...' : ''}</div>
        <div class="premium-question-meta">
            <span class="premium-badge premium-type-badge">${questionType}</span>
            <span class="premium-badge premium-difficulty-badge premium-difficulty-${difficulty}">${difficulty}</span>
            <span class="premium-badge premium-category-badge">${escapeHtml(category.name)}</span>
        </div>
        ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-question-image">` : ''}
        <div class="premium-question-footer">
            <span class="premium-question-date">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${new Date(question.dateCreated || Date.now()).toLocaleDateString()}
            </span>
        </div>
    `;
    
    return questionElement;
}

// Add event listeners for premium category headers
function addPremiumCategoryHeaderListeners() {
    // Initialize all folders as expanded by default, but don't toggle if already expanded
    document.querySelectorAll('#availableQuestionsCategory .premium-category-folder').forEach(folder => {
        const categoryId = folder.dataset.category;
        const content = folder.querySelector('.premium-category-content');
        
        // Only expand folders that are initially collapsed
        if (!content.classList.contains('expanded')) {
            content.classList.add('expanded');
            content.classList.remove('collapsed');
        }
    });
}

// Toggle premium category folder visibility for category modal
function togglePremiumCategoryFolderForCategory(categoryId) {
    if (window.event) {
        window.event.stopPropagation();
    }
    
    const folder = document.querySelector(`#availableQuestionsCategory .premium-category-folder[data-category="${categoryId}"]`);
    if (!folder) return;
    
    const content = folder.querySelector('.premium-category-content');
    const header = folder.querySelector('.premium-category-header');
    const isCollapsed = content.classList.contains('collapsed');
    
    if (isCollapsed) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        header.classList.add('expanded');
    } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        header.classList.remove('expanded');
    }
}

// Select all questions in a category
function selectAllQuestionsInCategory(categoryId) {
    if (window.event) {
        window.event.stopPropagation();
    }
    
    const categoryFolder = document.querySelector(`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`);
    if (!categoryFolder) return;
    
    const questions = categoryFolder.querySelectorAll('.question-item:not(.assigned)');
    const selectAllBtn = categoryFolder.querySelector('.category-action-btn.select-all');
    
    // Check if all questions are already selected
    const allSelected = Array.from(questions).every(question => question.classList.contains('selected'));
    
    questions.forEach(questionElement => {
        if (allSelected) {
            questionElement.classList.remove('selected');
            // Remove from selected list if it's there
            const selectedQuestion = document.querySelector(`#selectedQuestions .question-item[data-question-id="${questionElement.dataset.questionId}"]`);
            if (selectedQuestion) {
                selectedQuestion.remove();
            }
        } else {
            questionElement.classList.add('selected');
            assignQuestionToCategory(questionElement);
        }
    });

    // Mark category header as selected
    const header = categoryFolder.querySelector('.category-header');
    if (header) {
        header.classList.add('selected');
    }
    
    // Update button appearance and show toast
    if (allSelected) {
        selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
            </svg>
            <span class="btn-text">Select All</span>
        `;
        selectAllBtn.title = 'Select all questions in this category';
        showToast(`Deselected all questions in ${categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'}`, 'info');
    } else {
        selectAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span class="btn-text">Deselect All</span>
        `;
        selectAllBtn.title = 'Deselect all questions in this category';
        showToast(`Selected all questions in ${categoryId === 'uncategorized' ? 'Uncategorized' : 'this category'}`, 'success');
    }
    
    updateCategoryQuestionCountsUI();
}

// Function to update category counts in the UI
function updateCategoryCounts() {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    
    // Update counts for each category
    categories.forEach(category => {
        const categoryCount = savedQuestions.filter(q => q.category === category.id).length;
        const countElement = document.getElementById(`count-${category.id}`);
        if (countElement) {
            countElement.textContent = categoryCount;
        }
    });
    
    // Update uncategorized count
    const uncategorizedCount = savedQuestions.filter(q => !q.category || q.category === 'uncategorized').length;
    const uncategorizedElement = document.getElementById('count-uncategorized');
    if (uncategorizedElement) {
        uncategorizedElement.textContent = uncategorizedCount;
    }
}

// Function to update premium questions count specifically
function updatePremiumQuestionsCount() {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    const premiumCount = savedQuestions.filter(q => q.categoryId === 'premium').length;
    const premiumElement = document.getElementById('count-premium');
    if (premiumElement) {
        premiumElement.textContent = `(${premiumCount}/${savedQuestions.filter(q => q.categoryId === 'premium').length})`;
    }
}

function processSelectedQuestions(categoryId) {
    if (window.event) {
        window.event.stopPropagation();
    }
    
    const categoryFolder = document.querySelector(`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`);
    if (!categoryFolder) return;
    
    const selectedQuestions = categoryFolder.querySelectorAll('.question-item.selected');
    
    if (selectedQuestions.length === 0) {
        showToast('Please select at least one question', 'error');
        return;
    }
    
    // Move selected questions to the selected questions container
    const selectedContainer = document.getElementById('selectedQuestions');
    if (!selectedContainer) {
        console.error('Selected questions container not found');
        return;
    }
    
    selectedQuestions.forEach(question => {
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
    updateCategoryQuestionCountsUI();
    
    // Show success toast
    showToast(`Moved ${selectedQuestions.length} question${selectedQuestions.length > 1 ? 's' : ''} to selected`, 'success');
}

function removeQuestionFromSelection(questionElement) {
    const questionId = questionElement.dataset.questionId;
    const originalCategory = questionElement.dataset.category;
    
    // Remove from selected container
    questionElement.remove();
    
    // Add back to original category
    const categoryFolder = document.querySelector(`#availableQuestionsCategory .category-folder[data-category="${originalCategory}"]`);
    if (categoryFolder) {
        const questionsContainer = categoryFolder.querySelector('.category-questions');
        if (questionsContainer) {
            questionsContainer.appendChild(questionElement);
        }
    }
    
    // Update question counts
    updateCategoryQuestionCountsUI();
    
    showToast('Question moved back to available questions', 'info');
}

// ============================================
// CATEGORY MODAL - QUESTION SELECTION
// ============================================

// Toggle premium question selection for category modal
function togglePremiumQuestionSelectionForCategory(element) {
    const questionId = element.dataset.questionId;
    
    // Check if question is already in selected list
    const existingSelected = document.querySelector(`#selectedQuestionsListCategory .premium-question-item[data-question-id="${questionId}"]`);
    
    if (existingSelected) {
        // If already selected, remove it from selected side and show in available side
        element.classList.remove('selected');
        element.style.display = 'block'; // Show the question in available side
        existingSelected.remove();
    } else {
        // If not selected, hide from available side and add to selected side
        element.classList.add('selected');
        element.style.display = 'none'; // Hide the question from available side
        const question = element.cloneNode(true);
        question.style.display = 'block'; // Ensure clone is visible
        question.onclick = () => removePremiumQuestionFromCategoryAssignment(question);
        document.getElementById('selectedQuestionsListCategory').appendChild(question);
    }
    
    updateCategoryQuestionCountsUI();
}

// Remove premium question from category assignment
function removePremiumQuestionFromCategoryAssignment(element) {
    const questionId = element.dataset.questionId;
    const availableQuestion = document.querySelector(`#availableQuestionsCategory .premium-question-item[data-question-id="${questionId}"]`);
    if (availableQuestion) {
        availableQuestion.classList.remove('selected');
        availableQuestion.style.display = 'block'; // Show the question in available side
    }
    element.remove();
    updateCategoryQuestionCountsUI();
}

// Update bulk action buttons for category modal
function updateBulkActionButtonsForCategoryLegacy() {
    const selectedCount = document.querySelectorAll('#selectedQuestionsListCategory .premium-question-item').length;
    const availableCount = document.querySelectorAll('#availableQuestionsCategory .premium-question-item').length;
    
    document.getElementById('selectAllBtnForCategory').disabled = selectedCount >= availableCount;
    document.getElementById('deselectAllBtnForCategory').disabled = selectedCount === 0;
    document.getElementById('removeSelectedBtnForCategory').disabled = selectedCount === 0;
    
    // Update selected count
    document.getElementById('selectedQuestionCountCategory').textContent = selectedCount;
}

// Preview question for category modal
function previewQuestionForCategory(questionId) {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    const question = savedQuestions[questionId];
    
    if (!question) return;
    
    // Create a modal to preview the question
    const modal = document.createElement('div');
    modal.className = 'premium-preview-modal';
    modal.innerHTML = `
        <div class="premium-preview-modal-content">
            <div class="premium-preview-modal-header">
                <h3>Question Preview</h3>
                <button class="premium-preview-close" onclick="this.closest('.premium-preview-modal').remove()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="premium-preview-modal-body">
                <div class="premium-preview-question">
                    <h4>Question #${questionId + 1}</h4>
                    <p>${escapeHtml(question.question)}</p>
                    ${question.image ? `<img src="${question.image}" alt="Question image" class="premium-preview-image">` : ''}
                </div>
                <div class="premium-preview-meta">
                    <span class="premium-badge premium-type-badge">${getQuestionType(question)}</span>
                    <span class="premium-badge premium-difficulty-badge premium-difficulty-${question.difficulty || 'medium'}">${question.difficulty || 'medium'}</span>
                    <span class="premium-badge premium-category-badge">${getCategoryName(question.category || 'uncategorized')}</span>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}


function createCleanQuestionContent(question, questionType, category) {
    // Create category badge
    const categoryBadge = `
        <span class="category-badge" style="background-color: ${category.color}; color: white;">
            ${escapeHtml(category.name)}
        </span>
    `;

    // Determine question type display and class
    let questionTypeClass = 'multiple-choice-type';
    let questionTypeDisplay = 'Multiple Choice';
    
    if (questionType === 'draggable' || (question && question.isDraggable)) {
        questionTypeClass = 'draggable-type';
        questionTypeDisplay = 'Drag & Drop';
    } else if (questionType === 'odd-one-out') {
        questionTypeClass = 'odd-one-type';
        questionTypeDisplay = 'Odd One Out';
    } else if (questionType === 'matching-pairs') {
        questionTypeClass = 'matching-pairs-type';
        questionTypeDisplay = 'Matching Pairs';
    } else if (questionType === 'fill-blank') {
        questionTypeClass = 'fill-blank-type';
        questionTypeDisplay = 'Fill in the Blank';
    } else if (questionType === 'true-false') {
        questionTypeClass = 'true-false-type';
        questionTypeDisplay = 'True / False';
    } else if (questionType === 'code') {
        questionTypeClass = 'code-type';
        questionTypeDisplay = 'Code Snippet';
    }

    // Create type badge with proper styling
    const typeBadge = `
        <span class="type-badge ${questionTypeClass}">
            ${questionTypeDisplay}
        </span>
    `;

    // Create question content
    const questionText = escapeHtml(question.question || 'No question text');

    const content = `
        <div class="question-content">
            <div class="question-text">${questionText}</div>
            <div class="question-meta">
                ${categoryBadge}
                ${typeBadge}
            </div>
        </div>
    `;
    
    return content;
}

// Create question element for category assignment
function createQuestionElementForCategory(question, questionId, questionType, isAssigned) {
    const questionElement = document.createElement('div');
    questionElement.className = 'question-item';
    questionElement.dataset.questionId = questionId;
    questionElement.dataset.questionType = questionType;
    
    // Get category information
    const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
    const categoryId = question.category || 'uncategorized';
    const category = savedCategories.find(cat => cat.id === categoryId || cat.name === categoryId) ||
                    { name: 'Uncategorized', color: '#9ca3af' };
    
    // Create clean question content without duplicating type badges
    const questionContent = createCleanQuestionContent(question, questionType, category);
    
    questionElement.innerHTML = `
        <span class="question-number">#${questionId + 1}</span>
        ${questionContent}
        ${isAssigned ? '<button class="remove-btn" onclick="removeQuestionFromCategory(this)" title="Remove from category"><svg class="icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>' : ''}
    `;
    
    if (!isAssigned) {
        questionElement.addEventListener('click', () => assignQuestionToCategory(questionElement));
    }
    
    return questionElement;
}

// ============================================
// CATEGORY MODAL - QUESTION MOVEMENT FUNCTIONS (LEGACY - NOT USED)
// ============================================
// Note: These legacy functions are kept for backwards compatibility
// but are not actively used. The active functions are at line 1980+

// Legacy functions for compatibility
function assignQuestionToCategory(questionElement) {
    toggleQuestionSelection(questionElement);
}

function removeQuestionFromCategory(removeButton) {
    // Prevent event bubbling
    if (window.event) {
        window.event.stopPropagation();
    }
    
    const questionElement = removeButton.closest('.question-item');
    if (questionElement) {
        removeQuestionToAvailable(questionElement);
    }
}

// Legacy function - redirects to UI update function
function updateCategoryQuestionCounts() {
    updateCategoryQuestionCountsUI();
}

// Deprecated - keeping for backwards compatibility
function updateCategoryQuestionCountsLegacy() {
    const availableCount = document.querySelectorAll('#availableQuestionsCategory .question-item').length;
    const assignedCount = document.querySelectorAll('#selectedQuestionsListCategory .question-item').length;
    // Update section titles to match exam modal structure
    const selectedQuestionCountElement = document.getElementById('selectedQuestionCount');
    if (selectedQuestionCountElement) {
        selectedQuestionCountElement.textContent = assignedCount;
    }
}

// Setup category question filters
function setupCategoryQuestionFilters() {
    const searchInput = document.getElementById('categoryQuestionSearch');
    const filterSelect = document.getElementById('categoryQuestionFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterCategoryQuestions);
    }
    
    if (filterSelect) {
        filterSelect.addEventListener('change', filterCategoryQuestions);
    }
}



// Function to load categories into select elements
function loadCategoriesIntoSelect(selectElementId = 'category') {
    const selectElement = document.getElementById(selectElementId);
    if (!selectElement) return;
    
    // Get current value to preserve selection
    const currentValue = selectElement.value;
    
    // Clear existing options
    selectElement.innerHTML = '';
    
    // Add "Uncategorized" option first
    const uncategorizedOption = document.createElement('option');
    uncategorizedOption.value = 'uncategorized';
    uncategorizedOption.textContent = 'Uncategorized';
    selectElement.appendChild(uncategorizedOption);
    
    const visibleCategories = categories.filter(category =>
        window.Auth?.canAccessItem ? window.Auth.canAccessItem('category', category) : true
    );

    // Add categories to select
    visibleCategories.forEach(category => {
        if (!category.isSystem) { // Don't add system categories like "Uncategorized"
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            selectElement.appendChild(option);
        }
    });
    
    // Restore previous selection if it still exists
    if (currentValue && selectElement.querySelector(`option[value="${currentValue}"]`)) {
        selectElement.value = currentValue;
    } else {
        // Default to Uncategorized if previous value is invalid or empty
        selectElement.value = 'uncategorized';
    }
}

// Function to load categories into modal filters (Exam and Category)
function loadCategoriesIntoFilters() {
    const filters = ['categoryFilterExam', 'categoryFilterCategory'];
    
    filters.forEach(filterId => {
        const categoryFilter = document.getElementById(filterId);
        if (!categoryFilter) return;
        
        // Preserve current value
        const currentValue = categoryFilter.value;
        
        // Clear existing options
        categoryFilter.innerHTML = '';
        
        // Add "All Categories" option first
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All Categories';
        categoryFilter.appendChild(allOption);
        
        // Add "Uncategorized" option
        const uncategorizedOption = document.createElement('option');
        uncategorizedOption.value = 'uncategorized';
        uncategorizedOption.textContent = 'Uncategorized';
        categoryFilter.appendChild(uncategorizedOption);
        
        const visibleCategories = categories.filter(category =>
            window.Auth?.canAccessItem ? window.Auth.canAccessItem('category', category) : true
        );

        // Add categories to select
        visibleCategories.forEach(category => {
            if (!category.isSystem) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categoryFilter.appendChild(option);
            }
        });

        // Restore value if it still exists
        if (currentValue && categoryFilter.querySelector(`option[value="${currentValue}"]`)) {
            categoryFilter.value = currentValue;
        }
    });
}

function updateCategoryList(categoriesList = categories) {
	const tbody = document.querySelector('#categoryList tbody');
	if (!tbody) return;
    
	// Get all questions from localStorage
	let savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	if (window.Auth?.canAccessItem) {
		savedQuestions = savedQuestions.filter((q) =>
			window.Auth.canAccessItem('question', q),
		);
	}
    
	const visibleCategories = categoriesList.filter(category =>
		window.Auth?.canAccessItem ? window.Auth.canAccessItem('category', category) : true
	);

	// Count questions for each category - handle both category ID and name for backward compatibility
	visibleCategories.forEach(category => {
        if (category.isSystem || category.id === 'uncategorized') {
            // Count questions without category
            category.questionCount = savedQuestions.filter(q =>
                !q.category ||
                q.category === '' ||
                q.category === 'uncategorized' ||
                q.category === 'Uncategorized'
            ).length;
        } else {
            // Count by ID first, then by name as fallback
            category.questionCount = savedQuestions.filter(q =>
                q.category === category.id ||
                q.category === category.name
            ).length;
        }
    });
    
    // Add "Uncategorized" category if it doesn't exist
	let uncategorizedExists = visibleCategories.some(cat => cat.name.toLowerCase() === 'uncategorized');
	if (!uncategorizedExists) {
		visibleCategories.unshift({
            id: 'uncategorized',
            name: 'Uncategorized',
            color: '#9ca3af',
            questionCount: 0,
            dateCreated: new Date().toISOString(),
            isSystem: true
        });
    }
    
    tbody.innerHTML = ''; // Clear existing rows
    
	visibleCategories.forEach(category => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', category.id);
        if (category.isSystem) {
            row.classList.add('system-category');
        }
        
        // Mobile Action Handler via event listener
        row.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (e.target.closest('button')) return;
                e.stopPropagation();
                MobileActionSheet.open(`Category: ${escapeHtml(category.name)}`, [
                    {
                        label: 'Edit Category',
                        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
                        onClick: () => editCategory(category.id)
                    },
                    {
                        label: 'Delete Category',
                        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
                        variant: 'danger',
                        onClick: () => deleteCategory(category.id)
                    }
                ]);
            }
        });

        row.innerHTML = `
            <td>
                <div class="category-info">
                    <div class="category-color" style="background-color: ${category.color}"></div>
                    <span class="category-name">${escapeHtml(category.name)}</span>
                </div>
            </td>
            <td>${escapeHtml(category.description || '')}</td>
            <td>${category.questionCount}</td>
            <td>${new Date(category.dateCreated).toLocaleDateString()}</td>
            <td class="actions-cell">
                ${category.isSystem ? `
                    <span class="no-actions">-</span>
                ` : `
                    <div class="exam-actions">
                        <button class="exam-action-btn exam-edit-btn" onclick="editCategory('${category.id}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="exam-action-btn exam-delete-btn" onclick="deleteCategory('${category.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `}
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // Add CSS for system categories if it doesn't exist
    if (!document.getElementById('system-category-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'system-category-styles';
        styleElement.textContent = `
            .system-category {
                opacity: 0.8;
                background-color: #f9fafb;
            }
            .system-category .category-name {
                font-style: italic;
                color: #6b7280;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

function filterCategories() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
    const filteredCategories = categories.filter(category =>
        category.name.toLowerCase().includes(searchTerm) ||
        category.description.toLowerCase().includes(searchTerm)
    );
    updateCategoryList(filteredCategories);
}

function sortCategories() {
    const sortBy = document.getElementById('categorySortBy').value;
    const direction = categorySortDirection === 'asc' ? 1 : -1;
    
    // Separate uncategorized from other categories
    const uncategorized = categories.filter(c => c.isSystem || c.id === 'uncategorized');
    const otherCategories = categories.filter(c => !c.isSystem && c.id !== 'uncategorized');
    
    // Sort only non-system categories
    otherCategories.sort((a, b) => {
        switch(sortBy) {
            case 'name':
                return direction * a.name.localeCompare(b.name);
            case 'date':
                return direction * (new Date(b.dateCreated) - new Date(a.dateCreated));
            case 'questions':
                return direction * (a.questionCount - b.questionCount);
            default:
                return 0;
        }
    });
    
    // Keep uncategorized at the top, then sorted categories
    categories = [...uncategorized, ...otherCategories];
    
    updateCategoryList();
}

function toggleCategorySortDirection() {
    categorySortDirection = categorySortDirection === 'desc' ? 'asc' : 'desc';
    
    const sortDirectionButton = document.getElementById('sortCategoryDirection');
    if (sortDirectionButton) {
        if (categorySortDirection === 'desc') {
            sortDirectionButton.classList.add('desc');
        } else {
            sortDirectionButton.classList.remove('desc');
        }
    }
    
    sortCategories();
}

function getCategorySelectOptions(selectedCategory = '') {
    return categories.map(category => `
        <option value="${category.id}" ${selectedCategory === category.id ? 'selected' : ''}>
            ${escapeHtml(category.name)}
        </option>
    `).join('');
}

function getCategoryName(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Uncategorized';
}

function getCategoryColor(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.color : '#6b7280';
}

function getRandomCategoryColor() {
    const availableColors = DEFAULT_CATEGORY_COLORS.filter(color => 
        !categories.some(cat => cat.color === color)
    );
    
    if (availableColors.length === 0) {
        return DEFAULT_CATEGORY_COLORS[Math.floor(Math.random() * DEFAULT_CATEGORY_COLORS.length)];
    }
    
    return availableColors[Math.floor(Math.random() * availableColors.length)];
}

function exportCategories() {
    const dataStr = JSON.stringify(categories, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'quiz-categories.json');
    linkElement.click();
}

function importCategories() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = event => {
            try {
                const newCategories = JSON.parse(event.target.result);
                
                if (!Array.isArray(newCategories) || !newCategories.every(isValidCategoryStructure)) {
                    throw new Error('Invalid category data structure');
                }
                
                // Merge with existing categories, avoiding duplicates
                const existingCategories = [...categories];
                const mergedCategories = mergeCategories(existingCategories, newCategories);
                
                window.__DI_CONTAINER__.repo.setAll_sync('categories', mergedCategories);
                categories = mergedCategories;
                updateCategoryList();
                updateQuestionCategoryCounts();
                showToast('Categories imported successfully!');
            } catch (error) {
                showToast('Error importing categories: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

function isValidCategoryStructure(category) {
    return category
        && typeof category.id === 'string'
        && typeof category.name === 'string'
        && typeof category.description === 'string'
        && typeof category.color === 'string'
        && typeof category.questionCount === 'number'
        && typeof category.dateCreated === 'string';
}

function mergeCategories(existing, imported) {
    const categoryMap = new Map(existing.map(c => [c.id, c]));
    
    imported.forEach(newCategory => {
        if (!categoryMap.has(newCategory.id)) {
            categoryMap.set(newCategory.id, newCategory);
        }
    });
    
    return Array.from(categoryMap.values());
}

function setupCategoryEventListeners() {
    document.getElementById('categoryForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCategoryForm();
    });
    
    document.getElementById('categorySearch').addEventListener('keyup', filterCategories);
}

// Helper function to safely escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    
    try {
        const safeStr = String(unsafe);
        return safeStr
            .replace(/&/g, "&amp;")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    } catch (e) {
        console.error('Error in escapeHtml:', e);
        return '[Error: Could not convert to string]';
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Initialize category management when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the admin page and category management tab
    if (document.getElementById('categoryList')) {
        initCategoryManagement();
    }
});

// Enhanced toggle category folder for uncategorized - select all questions when clicked
function toggleCategoryFolderWithSelectAll(categoryId) {
	if (window.event) {
		window.event.stopPropagation();
	}
	
	const folder = document.querySelector(`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`);
	if (!folder) return;
    
    const questionsContainer = folder.querySelector('.category-questions');
    const isCollapsed = folder.classList.contains('collapsed');
    
    if (isCollapsed) {
        questionsContainer.style.display = 'block';
        folder.classList.remove('collapsed');
        
        // If this is the uncategorized folder, select all questions
        if (categoryId === 'uncategorized') {
            const questions = questionsContainer.querySelectorAll('.question-item:not(.assigned)');
            questions.forEach(questionElement => {
                if (!questionElement.classList.contains('selected')) {
                    assignQuestionToCategory(questionElement);
                }
            });
        }
    } else {
        questionsContainer.style.display = 'none';
        folder.classList.add('collapsed');
    }
}

// Load available questions for category assignment (Premium version)
// ============================================
// CATEGORY MODAL - LOAD & RENDER QUESTIONS
// ============================================

function loadAvailableQuestionsForCategory(keepSelection = true) {
    const savedQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
    const questions = savedQuestions || [];
    const container = document.getElementById('availableQuestionsCategory');
    const selectedContainer = document.getElementById('selectedQuestionsListCategory');
    
    console.log('Loading questions for category modal...');
    console.log('Total questions:', questions.length);
    console.log('Current category ID:', currentCategoryId);
    
    if (!container) {
        console.error('Container "availableQuestionsCategory" not found');
        return;
    }
    
    if (questions.length === 0) {
        container.innerHTML = '<div class="premium-no-questions-state"><h3>No Questions Available</h3><p>Please create some questions first in the Questions tab.</p></div>';
        if (selectedContainer) selectedContainer.innerHTML = '';
        return;
    }
    
    // Get categories for display
    const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
    const categoryMap = new Map();
    savedCategories.forEach((cat) => {
        if (!cat) return;
        if (cat.id) categoryMap.set(cat.id, cat);
        if (cat.name) categoryMap.set(cat.name, cat);
    });
    const quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');
    
    // FIRST: Preserve currently selected questions before reloading
    // Get selected question IDs from DOM BEFORE clearing anything
    let selectedQuestionIds = [];
    
    if (keepSelection) {
        const currentlySelectedQuestions = document.querySelectorAll('#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item');
        const preservedSelections = Array.from(currentlySelectedQuestions).map(el => {
            const id = parseInt(el.dataset.questionId || el.dataset.index);
            return { id, element: el.cloneNode(true) };
        });
        
        console.log('Current category ID:', currentCategoryId);
        console.log('Currently selected questions count:', currentlySelectedQuestions.length);
        console.log('Preserved selections:', preservedSelections.length);
        
        // ALWAYS preserve current selections when refreshing (don't reload from localStorage)
        selectedContainer.innerHTML = '';
        selectedQuestionIds = preservedSelections.map(s => s.id);
        
        // Re-add preserved selections with proper event handlers
        preservedSelections.forEach(({ id, element }) => {
            // Re-attach the onclick handler since cloneNode doesn't copy event listeners
            element.onclick = () => removeQuestionFromCategoryAssignment(element);
            selectedContainer.appendChild(element);
        });
        
        console.log('Restored selections after refresh:', selectedQuestionIds.length);
    } else {
        // If not keeping selection, just clear the container
        selectedContainer.innerHTML = '';
        console.log('Selection cleared, not preserving.');
    }
    
    // Group questions by category (normalize ID vs name)
    const questionsByCategory = {};
    questions.forEach((q, index) => {
        if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('question', q)) {
            return;
        }
        const rawCategory = q.category || 'uncategorized';
        const resolvedCategory = categoryMap.get(rawCategory);
        const categoryId = resolvedCategory?.id || rawCategory || 'uncategorized';
        if (!questionsByCategory[categoryId]) {
            questionsByCategory[categoryId] = [];
        }
        questionsByCategory[categoryId].push({
            question: q,
            index,
            categoryName: resolvedCategory?.name || rawCategory,
        });
    });
    
    console.log('Questions grouped by category:', Object.keys(questionsByCategory));
    console.log('Category groups:', Object.keys(questionsByCategory).map(catId => ({
        id: catId,
        count: questionsByCategory[catId].length
    })));
    
    // Build HTML with category grouping (Premium style)
    let html = '';
    let hasVisibleQuestions = false;
    
    // Filter logic
    const categoryFilter = document.getElementById('categoryFilterCategory');
    const selectedFilterId = categoryFilter ? categoryFilter.value : '';
    
    const typeFilter = document.getElementById('questionFilterCategory');
    const selectedType = typeFilter ? typeFilter.value : 'all';

    const difficultyFilter = document.getElementById('difficultyFilterCategory');
    const selectedDifficulty = difficultyFilter ? difficultyFilter.value : '';

    const pointFilterMin = document.getElementById('pointFilterCategoryMin');
    const pointFilterMax = document.getElementById('pointFilterCategoryMax');
    const selectedPointsMin = pointFilterMin ? pointFilterMin.value : '';
    const selectedPointsMax = pointFilterMax ? pointFilterMax.value : '';

    // Search logic
    const searchInput = document.getElementById('questionSearchCategory');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    Object.keys(questionsByCategory).forEach(categoryId => {
        // Apply category filter
        if (selectedFilterId && !['recent', 'unused', 'popular'].includes(selectedFilterId) && categoryId !== selectedFilterId) {
            return;
        }

        const categoryQuestions = questionsByCategory[categoryId];
        const isSpecialFilter = ['recent', 'unused', 'popular'].includes(selectedFilterId);
        // Apply search and other filters
        const filteredCategoryQuestions = categoryQuestions.filter(({ question, index }) => {
            // Safety check for question object
            if (!question) return false;
            
            // Search filter
            if (searchTerm) {
                const qText = question.question || '';
                if (!qText.toLowerCase().includes(searchTerm)) return false;
            }

            // Type filter
            if (selectedType && selectedType !== 'all') {
                const qType = getQuestionType(question);
                if (qType !== selectedType) return false;
            }

            // Difficulty filter
            if (selectedDifficulty && selectedDifficulty !== 'all' && question.difficulty !== selectedDifficulty) {
                return false;
            }

            if (selectedPointsMin || selectedPointsMax) {
                const points = Number.parseFloat(question.points) || 1;
                const min = selectedPointsMin ? Number.parseFloat(selectedPointsMin) : 0;
                const max = selectedPointsMax ? Number.parseFloat(selectedPointsMax) : Infinity;
                if (points < min || points > max) return false;
            }

            // Special category filters (recent, unused, popular)
            if (isSpecialFilter) {
                if (selectedFilterId === 'recent') {
                    const totalQuestions = questions.length;
                    const recentThreshold = Math.floor(totalQuestions * 0.75);
                    if (index < recentThreshold) return false;
                }
                if (selectedFilterId === 'unused') {
                    const isUsed = question.used === true || quizResults.some(
                        (result) =>
                            result.questions && result.questions.includes(index),
                    );
                    if (isUsed) return false;
                }
                if (selectedFilterId === 'popular') {
                    const usageCount = quizResults.filter(
                        (result) =>
                            result.questions && result.questions.includes(index),
                    ).length;
                    if (usageCount === 0 && question.popular !== true) return false;
                }
            }

            // Quick filters (AND logic)
            if (window.quickFilterActiveForCategory && Array.isArray(window.quickFilterActiveForCategory) && window.quickFilterActiveForCategory.length > 0) {
                const matchesQuickFilter = window.quickFilterActiveForCategory.every(filterType => {
                    switch (filterType) {
                        case 'recent': {
                            const totalQuestions = questions.length;
                            const recentThreshold = Math.floor(totalQuestions * 0.75);
                            return index >= recentThreshold;
                        }
                        case 'hard':
                            return question.difficulty === 'hard';
                        case 'unused': {
                            const isUsed = question.used === true || quizResults.some(
                                (result) =>
                                    result.questions && result.questions.includes(index),
                            );
                            return !isUsed;
                        }
                        case 'popular': {
                            const usageCount = quizResults.filter(
                                (result) =>
                                    result.questions && result.questions.includes(index),
                            ).length;
                            return usageCount > 0 || question.popular === true;
                        }
                        default:
                            return true;
                    }
                });

                if (!matchesQuickFilter) return false;
            }
            
            return true;
        });
        
        console.log(` Category ${categoryId}: ${categoryQuestions.length} total, ${filteredCategoryQuestions.length} matching search`);
        
        // If no questions match search, skip this category
        if (filteredCategoryQuestions.length === 0) return;

        // Find category object - ensure savedCategories exists
        const category =
            categoryMap.get(categoryId) ||
            (savedCategories &&
                savedCategories.find(
                    (cat) => cat.id === categoryId || cat.name === categoryId,
                )) || {
                name: 'Uncategorized',
                color: '#9ca3af',
                id: 'uncategorized',
            };
        
        // Filter out already selected questions from the SEARCH FILTERED list
        const availableQuestions = filteredCategoryQuestions.filter(({ index }) => !selectedQuestionIds.includes(index));
        
        console.log(`  Available to render: ${availableQuestions.length}`);
        
        // Only show category if it has available questions
        if (availableQuestions.length > 0) {
            hasVisibleQuestions = true;
            console.log(`  -> Rendering category "${category.name}"`);
            
            html += `
            <div class="category-folder" data-category="${categoryId}">
                <div class="category-header" onclick="toggleCategoryFolderForCategoryModal('${categoryId}')">
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="category-name">${escapeHtml(category.name)}</span>
                    <span class="question-count">(${availableQuestions.length}/${categoryQuestions.length})</span>
                    <div class="category-header-actions">
                        <button type="button" class="category-action-btn move-all-btn" onclick="event.stopPropagation(); selectAllQuestionsInCategoryForCategory('${categoryId}'); return false;" title="Select all">
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
                const questionType = getQuestionType(question);

                // Render content using global helper or fallback
                const content = typeof window.renderQuestionContent === 'function' 
                    ? window.renderQuestionContent(question.question, question, questionType, question.options, question.image, true) 
                    : escapeHtml(question.question || 'Question Text Missing');

                html += `
                <div class="question-item categorized" data-index="${index}" data-draggable="${question.isDraggable || false}" data-category="${categoryId}" data-type="${questionType}" data-points="${Number.parseFloat(question.points) || 1}" onclick="toggleQuestionSelectionForCategory(this)" style="display: block;">
                    <div class="question-content">
                        ${content}
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
    
    // Show empty state if no questions are available and no filters are active
    if (!hasVisibleQuestions) {
        // Check if any filters are active
        const searchInput = document.getElementById('questionSearchCategory');
        const typeFilter = document.getElementById('questionFilterCategory');
        const categoryFilter = document.getElementById('categoryFilterCategory');
        const difficultyFilter = document.getElementById('difficultyFilterCategory');
        
        const isSearchActive = searchInput && searchInput.value.trim() !== '';
        const isTypeFilterActive = typeFilter && typeFilter.value !== 'all';
        const isCategoryFilterActive = categoryFilter && categoryFilter.value !== '';
        const isDifficultyFilterActive =
            difficultyFilter && difficultyFilter.value !== '' && difficultyFilter.value !== 'all';
        const isQuickFilterActive = window.quickFilterActiveForCategory && Array.isArray(window.quickFilterActiveForCategory) && window.quickFilterActiveForCategory.length > 0;
        
        if (isSearchActive || isTypeFilterActive || isCategoryFilterActive || isDifficultyFilterActive || isQuickFilterActive) {
            // Show filter results message instead of empty state when filters are active
            let message = 'No questions found matching your criteria.';
            
            // Add specific filter information
            const filters = [];
            if (isSearchActive) filters.push(`search: "${searchInput.value}"`);
            if (isTypeFilterActive) filters.push(`type: ${typeFilter.value}`);
            if (isCategoryFilterActive) {
                const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
                const categoryName = savedCategories.find(c => c.id === categoryFilter.value)?.name || categoryFilter.value;
                filters.push(`category: ${categoryName}`);
            }
            if (isDifficultyFilterActive) filters.push(`difficulty: ${difficultyFilter.value}`);
            if (isQuickFilterActive) filters.push(`quick: ${window.quickFilterActiveForCategory.join(', ')}`);
            
            if (filters.length > 0) {
                message += ` Applied filters: ${filters.join(', ')}.`;
            }
            
            message += ' Try adjusting your search or filters.';
            
            html = `
            <div class="filter-results-message">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <path d="M8 11h6"></path>
                </svg>
                <h3>No Results Found</h3>
                <p>${message}</p>
                <button onclick="clearAllCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
            </div>
            `;
        } else {
            // Show regular empty state when no filters are active
            html = `
            <div class="premium-no-questions-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path>
                    <rect x="9" y="3" width="6" height="4" rx="2"></rect>
                </svg>
                <h3>No Available Questions</h3>
                <p>All questions have been selected or there are no questions available.</p>
            </div>
            `;
        }
    }
    
    window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);
    
    // Update counts
    updateCategoryQuestionCountsUI();
    updateBulkActionButtonsForCategory();
}

// ============================================
// CATEGORY MODAL - BULK ACTIONS
// ============================================

// Refresh available questions for category
function refreshAvailableQuestionsForCategory() {
    loadAvailableQuestionsForCategory();
    showToast('Questions refreshed!', 'success');
}

// Clear all selected questions for category
function clearAllSelectedForCategory() {
    if (confirm('Are you sure you want to clear all selected questions?')) {
        const selectedQuestions = document.querySelectorAll('#selectedQuestionsListCategory .question-item');
        selectedQuestions.forEach(question => {
            const questionId = question.dataset.index;
            const questionCategory = question.dataset.category;
            
            // Show the question back in the available side
            const availableQuestion = document.querySelector(`#availableQuestionsCategory .question-item[data-index="${questionId}"]`);
            if (availableQuestion) {
                availableQuestion.style.display = 'block';
                availableQuestion.classList.remove('selected');
            }
            
            // Remove from selected list
            question.remove();
        });
        
        // Update all counts
        updateCategoryQuestionCountsUI();
        updateBulkActionButtonsForCategory();
        
        showToast('All selections cleared', 'info');
    }
}

// Select all available for category
function selectAllAvailableForCategory() {
    const availableQuestions = document.querySelectorAll('#availableQuestionsCategory .premium-question-item:not(.selected)');
    availableQuestions.forEach(question => {
        if (!question.classList.contains('selected')) {
            togglePremiumQuestionSelectionForCategory(question);
        }
    });
    updateBulkActionButtonsForCategory();
    showToast('All available questions selected', 'success');
}

// Deselect all selected for category
function deselectAllSelectedForCategory() {
    const selectedQuestions = document.querySelectorAll('#selectedQuestionsListCategory .premium-question-item');
    selectedQuestions.forEach(question => {
        const questionId = question.dataset.questionId;
        const availableQuestion = document.querySelector(`#availableQuestionsCategory .premium-question-item[data-question-id="${questionId}"]`);
        if (availableQuestion) {
            availableQuestion.classList.remove('selected');
            availableQuestion.style.display = 'block'; // Show the question in available side
        }
        question.remove();
    });
    updateCategoryQuestionCountsUI(); // Update counters
    updateBulkActionButtonsForCategory();
    showToast('All selections cleared', 'info');
}

// Remove selected for category
function removeSelectedForCategoryLegacy() {
    deselectAllSelectedForCategory();
}

function undoCategorySelections() {
	const selectedQuestions = document.querySelectorAll(
		'#selectedQuestionsListCategory .question-item, #selectedQuestionsListCategory .premium-question-item',
	);

	if (selectedQuestions.length === 0) {
		showToast('No selections to undo', 'info');
		return;
	}

	if (
		confirm(
			`Are you sure you want to undo ${selectedQuestions.length} selections?`,
		)
	) {
		selectedQuestions.forEach((question) => {
			const questionId = question.dataset.questionId || question.dataset.index;
			question.remove();

			const availableQuestion =
				document.querySelector(
					`#availableQuestionsCategory .question-item[data-question-id="${questionId}"]`,
				) ||
				document.querySelector(
					`#availableQuestionsCategory .question-item[data-index="${questionId}"]`,
				);

			if (availableQuestion) {
				availableQuestion.style.display = 'block';
				availableQuestion.classList.remove('selected');
			}
		});

		updateCategoryQuestionCountsUI();
		updateBulkActionButtonsForCategory();
		showToast(`Undid ${selectedQuestions.length} selections`, 'success');
	}
}

// Debounce filter for category questions
function debounceFilterCategoryQuestionsLegacy() {
    clearTimeout(categoryDebounceTimer);
    categoryDebounceTimer = setTimeout(() => {
        filterCategoryQuestions();
    }, 300);
}

// Filter category questions - updated to use enhanced filtering
function filterCategoryQuestionsLegacy() {
    // Apply the enhanced filtering which handles all filtering logic
    filterCategoryQuestionsEnhanced();
}

// Clear all filters for category modal
function clearAllCategoryFiltersLegacy() {
    // Clear all filter inputs
    const searchInput = document.getElementById('questionSearchCategory');
    const typeFilter = document.getElementById('questionFilterCategory');
    const categoryFilter = document.getElementById('categoryFilterCategory');
    const difficultyFilter = document.getElementById('difficultyFilterCategory');
    const pointFilter = document.getElementById('pointFilterCategory');
    
    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = 'all';
    if (categoryFilter) categoryFilter.value = '';
    if (difficultyFilter) difficultyFilter.value = '';
    if (pointFilter) pointFilter.value = '';
    
    // Clear quick filters (set to empty array)
    window.quickFilterActiveForCategory = [];
    
    // Remove active class from all quick filter buttons
    const quickFilterButtons = document.querySelectorAll('#categoryModal .quick-filter-btn');
    quickFilterButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Remove filter results message
    const container = document.getElementById('availableQuestionsCategory');
    const filterMessage = container.querySelector('.filter-results-message') ||
        container.querySelector('.category-filter-results-message');
    if (filterMessage) {
        filterMessage.remove();
    }
    
    // Also remove empty state if present
    const emptyState = container.querySelector('.premium-no-questions-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Reload and filter questions
    loadAvailableQuestionsForCategory();
    
    showToast('All filters cleared', 'info');
}

// Keep the original clearCategoryFilters function for backward compatibility
function clearCategoryFiltersLegacy() {
    clearAllCategoryFilters();
}



// Show notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Category modal specific functions
function toggleQuestionSelectionForCategory(questionElement) {
    const questionId = questionElement.dataset.index;
    
    // Check if question is already in selected list
    const existingSelected = document.querySelector(`#selectedQuestionsListCategory .question-item[data-index="${questionId}"]`);
    
    if (existingSelected) {
        // If already selected, remove it from selected side and show in available side
        questionElement.classList.remove('selected');
        questionElement.style.display = 'block'; // Show the question in available side
        existingSelected.remove();
    } else {
        // If not selected, hide from available side and add to selected side
        questionElement.classList.add('selected');
        questionElement.style.display = 'none'; // Hide the question from available side
        
        // Clone the question for selected list
        const questionClone = questionElement.cloneNode(true);
        questionClone.style.display = 'block'; // Ensure clone is visible
        questionClone.onclick = () => removeQuestionFromCategoryAssignment(questionClone);
        
        document.getElementById('selectedQuestionsListCategory').appendChild(questionClone);
    }
    
    updateCategoryQuestionCountsUI();
}

function removeQuestionFromCategoryAssignment(questionElement) {
    const questionId = questionElement.dataset.index;
    
    // Find and show the question in available side
    const availableQuestion = document.querySelector(`#availableQuestionsCategory .question-item[data-index="${questionId}"]`);
    if (availableQuestion) {
        availableQuestion.classList.remove('selected');
        availableQuestion.style.display = 'block'; // Show the question in available side
    }
    
    // Remove from selected container
    questionElement.remove();
    
    // Update counts
    updateCategoryQuestionCountsUI();
}

// Category modal specific functions - matching exam modal structure
let currentFilterForCategory = {
    search: '',
    type: 'all',
    category: '',
    difficulty: '',
    points: ''
};

// Apply filters to category questions
function applyFiltersToCategoryQuestions() {
    // Legacy hook: delegate to the unified filtering pipeline
    filterCategoryQuestionsEnhanced();
}

// Show filter results message for category modal
function showCategoryFilterResultsMessage(filteredCount, originalCount, searchTerm, typeFilter, categoryFilter, difficultyFilter) {
    const container = document.getElementById('availableQuestionsCategory');
    if (!container) return;
    
    // Remove existing message
    const existingMessage = container.querySelector('.filter-results-message') ||
        container.querySelector('.category-filter-results-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Show message if no questions match filters
    if (filteredCount === 0 && originalCount > 0) {
        let message = 'No questions found matching your criteria.';
        
        // Add specific filter information
        const filters = [];
        if (searchTerm) filters.push(`search: "${searchTerm}"`);
        if (typeFilter && typeFilter !== 'all') filters.push(`type: ${typeFilter}`);
        if (categoryFilter) {
            const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
            const categoryName =
                savedCategories.find(c => c.id === categoryFilter)?.name || categoryFilter;
            filters.push(`category: ${categoryName}`);
        }
        if (difficultyFilter && difficultyFilter !== 'all') filters.push(`difficulty: ${difficultyFilter}`);
        
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
            <button onclick="clearCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
        </div>
        `;
        
        container.insertAdjacentHTML('afterbegin', messageHtml);
    }
}

// Clear all filters for category modal
function clearCategoryFilters() {
    // Clear all filter inputs
    document.getElementById('questionSearchCategory').value = '';
    document.getElementById('questionFilterCategory').value = 'all';
    document.getElementById('categoryFilterCategory').value = ''; // Corrected to match "All Categories" option value
    document.getElementById('difficultyFilterCategory').value = '';
    const pointFilterCategoryMin = document.getElementById('pointFilterCategoryMin');
    if (pointFilterCategoryMin) pointFilterCategoryMin.value = '';
    const pointFilterCategoryMax = document.getElementById('pointFilterCategoryMax');
    if (pointFilterCategoryMax) pointFilterCategoryMax.value = '';
    
    // Reset filter state
    currentFilterForCategory = {
        search: '',
        type: 'all',
        category: '',
        difficulty: '',
        points: ''
    };
    
    // Remove filter results message
    const container = document.getElementById('availableQuestionsCategory');
    const filterMessage = container.querySelector('.filter-results-message') ||
        container.querySelector('.category-filter-results-message');
    if (filterMessage) {
        filterMessage.remove();
    }
    
    // Reload and filter questions
    loadAvailableQuestionsForCategory();
    
    showToast('All filters cleared', 'info');
}

// Render available questions for category modal
function renderAvailableQuestionsForCategory() {
    const container = document.getElementById('availableQuestionsCategory');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Get all categories for display
    const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
    
    // Group questions by category
    const questionsByCategory = {};
    availableQuestionsForCategory.forEach((question, index) => {
        const categoryId = question.category || 'uncategorized';
        if (!questionsByCategory[categoryId]) {
            questionsByCategory[categoryId] = [];
        }
        questionsByCategory[categoryId].push({ question, index });
    });
    
    // Build HTML with category grouping
    let html = '';
    let hasVisibleQuestions = false;
    
    Object.keys(questionsByCategory).forEach(categoryId => {
        const categoryQuestions = questionsByCategory[categoryId];
        const category = savedCategories.find(cat => cat.id === categoryId) ||
                        { name: 'Uncategorized', color: '#9ca3af', id: 'uncategorized' };
        
        // Only show category if it has questions
        if (categoryQuestions.length > 0) {
            hasVisibleQuestions = true;
            
            // Add category folder
            html += `
            <div class="category-folder" data-category="${categoryId}">
                <div class="category-header" onclick="toggleCategoryFolderForCategoryModal('${categoryId}')">
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="category-name">${escapeHtml(category.name)}</span>
                    <span class="question-count">(${categoryQuestions.length})</span>
                    <div class="category-header-actions">
                        <button class="category-action-btn select-all" onclick="event.stopPropagation(); selectAllQuestionsInCategoryForCategory('${categoryId}')" title="Select all questions">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 11 12 14 22 4"></polyline>
                                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                            </svg>
                            <span class="btn-text">Select All</span>
                        </button>
                        <button class="category-action-btn go-btn" onclick="event.stopPropagation(); processSelectedQuestionsForCategory('${categoryId}')" title="Process selected questions">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"></path>
                            </svg>
                            <span class="btn-text">Go</span>
                        </button>
                        <button class="category-action-btn toggle-view" onclick="event.stopPropagation(); toggleCategoryFolderForCategoryModal('${categoryId}')" title="Toggle category">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 9l6 6 6-6"></path>
                            </svg>
                            <span class="btn-text">Toggle</span>
                        </button>
                    </div>
                </div>
                <div class="category-questions">
            `;
            
            // Add questions in this category - same structure as exam modal
            categoryQuestions.forEach(({ question, index }) => {
                const questionType = getQuestionType(question);
                const difficulty = question.difficulty || 'medium';
                
                html += `
                <div class="question-item categorized" data-index="${index}" data-draggable="${question.isDraggable}" data-category="${categoryId}" data-type="${questionType}" data-points="${Number.parseFloat(question.points) || 1}" onclick="toggleQuestionSelectionForCategory(this)">
                    <div class="question-content">
                        ${window.renderQuestionContent(question.question, question, questionType, question.options, question.image, true)}
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
            <p>All questions have been selected or there are no questions available for assignment.</p>
        </div>
        `;
    }
    
    window.safeSetHTML ? window.safeSetHTML(container, html, true) : (container.innerHTML = html);
}

// Render selected questions for category modal
function renderSelectedQuestionsForCategory() {
    const container = document.getElementById('selectedQuestionsListCategory');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (selectedQuestionsForCategory.length === 0) {
        container.innerHTML = '<div class="no-questions">No questions selected</div>';
        return;
    }
    
    selectedQuestionsForCategory.forEach((question, index) => {
        const questionElement = createSelectedQuestionElementForCategoryModal(question, index);
        container.appendChild(questionElement);
    });
}

// Create question element for category modal
function createQuestionElementForCategoryModal(question, index) {
    const questionElement = document.createElement('div');
    questionElement.className = 'premium-question-item';
    questionElement.dataset.index = index;
    questionElement.dataset.points = Number.parseFloat(question.points) || 1;
    
    const questionType = question.type || (question.isDraggable ? 'draggable' : 'multiple-choice');
    const difficultyBadge = question.difficulty ? `<span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>` : '';
    const typeClass = questionType === 'code' ? 'code-type' : '';
    
    questionElement.innerHTML = `
        <div class="question-content">
            <div class="question-header">
                <span class="question-type-badge ${typeClass}">${questionType}</span>
                ${difficultyBadge}
            </div>
            <div class="question-text">${escapeHtml(question.question)}</div>
            ${question.image ? `<div class="question-image-preview"><img src="${question.image}" alt="Question preview"></div>` : ''}
        </div>
        <div class="question-actions">
            <button class="select-btn" onclick="selectQuestionForCategory(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                </svg>
            </button>
        </div>
    `;
    
    return questionElement;
}

// Create selected question element for category modal
function createSelectedQuestionElementForCategoryModal(question, index) {
    const questionElement = document.createElement('div');
    questionElement.className = 'premium-question-item selected';
    questionElement.dataset.index = index;
    questionElement.dataset.points = Number.parseFloat(question.points) || 1;
    
    const questionType = question.type || (question.isDraggable ? 'draggable' : 'multiple-choice');
    const difficultyBadge = question.difficulty ? `<span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>` : '';
    const typeClass = questionType === 'code' ? 'code-type' : '';
    
    questionElement.innerHTML = `
        <div class="question-content">
            <div class="question-header">
                <span class="question-type-badge ${typeClass}">${questionType}</span>
                ${difficultyBadge}
            </div>
            <div class="question-text">${escapeHtml(question.question)}</div>
            ${question.image ? `<div class="question-image-preview"><img src="${question.image}" alt="Question preview"></div>` : ''}
        </div>
        <div class="question-actions">
            <button class="deselect-btn" onclick="deselectQuestionForCategory(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;
    
    return questionElement;
}

// Select question for category
function selectQuestionForCategory(index) {
    const question = availableQuestionsForCategory[index];
    if (!question) return;
    
    // Add to selected questions
    selectedQuestionsForCategory.push(question);
    
    // Remove from available questions
    availableQuestionsForCategory.splice(index, 1);
    
    // Update UI
    renderAvailableQuestionsForCategory();
    renderSelectedQuestionsForCategory();
    updateCategoryQuestionCounts();
    updateBulkActionButtonsForCategory();
}

// Deselect question for category
function deselectQuestionForCategory(index) {
    const question = selectedQuestionsForCategory[index];
    if (!question) return;
    
    // Add back to available questions
    availableQuestionsForCategory.push(question);
    
    // Remove from selected questions
    selectedQuestionsForCategory.splice(index, 1);
    
    // Update UI
    renderAvailableQuestionsForCategory();
    renderSelectedQuestionsForCategory();
    updateCategoryQuestionCounts();
    updateBulkActionButtonsForCategory();
}

// Update bulk action buttons for category
function updateBulkActionButtonsForCategoryLegacy2() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const removeSelectedBtn = document.getElementById('removeSelectedBtn');
    
    if (selectAllBtn) {
        selectAllBtn.disabled = availableQuestionsForCategory.length === 0;
    }
    
    if (deselectAllBtn) {
        deselectAllBtn.disabled = selectedQuestionsForCategory.length === 0;
    }
    
    if (removeSelectedBtn) {
        removeSelectedBtn.disabled = selectedQuestionsForCategory.length === 0;
    }
}

// Remove selected questions for category
function removeSelectedForCategoryLegacy2() {
    availableQuestionsForCategory = [...availableQuestionsForCategory, ...selectedQuestionsForCategory];
    selectedQuestionsForCategory = [];
    
    renderAvailableQuestionsForCategory();
    renderSelectedQuestionsForCategory();
    updateCategoryQuestionCounts();
    updateBulkActionButtonsForCategory();
}

// Filter category questions
// Set quick filter for category
function setQuickFilterForCategory(filterType) {
    // If no active filters yet, initialize as array
    if (!window.quickFilterActiveForCategory) {
        window.quickFilterActiveForCategory = [];
    }
    
    // If it's not already an array, convert it
    if (!Array.isArray(window.quickFilterActiveForCategory)) {
        window.quickFilterActiveForCategory = [window.quickFilterActiveForCategory];
    }
    
    // Toggle the filter - add if not present, remove if present
    const index = window.quickFilterActiveForCategory.indexOf(filterType);
    if (index > -1) {
        // Remove filter
        window.quickFilterActiveForCategory.splice(index, 1);
    } else {
        // Add filter
        window.quickFilterActiveForCategory.push(filterType);
    }
    
    // Update UI to show active filters
    const quickFilterButtons = document.querySelectorAll('#categoryModal .quick-filter-btn');
    quickFilterButtons.forEach(btn => {
        const btnFilter = btn.getAttribute('onclick').match(/setQuickFilterForCategory\('([^']+)'/);
        if (btnFilter && btnFilter[1]) {
            if (window.quickFilterActiveForCategory.includes(btnFilter[1])) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    
    // Apply the filter
    filterCategoryQuestionsEnhanced();
}

// Function to handle category question filtering
function filterCategoryQuestionsLegacy2() {
    // Update active class on quick filter buttons
    const categoryFilter = document.getElementById('categoryFilterCategory');
    const difficultyFilter = document.getElementById('difficultyFilterCategory');
    const quickFilterButtons = document.querySelectorAll('#categoryModal .quick-filter-btn');
    
    if (categoryFilter && difficultyFilter) {
        const currentCategoryFilter = categoryFilter.value;
        const currentDifficultyFilter = difficultyFilter.value;
        
        quickFilterButtons.forEach(btn => {
            const onclick = btn.getAttribute('onclick');
            if (onclick.includes(`'${currentCategoryFilter}'`) && currentCategoryFilter !== '') {
                btn.classList.add('active');
            } else if (onclick.includes(`'${currentDifficultyFilter}'`) && currentDifficultyFilter !== '') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    loadAvailableQuestionsForCategory(true); // true to keep current selections
}

// Debounce filter for category questions - updated to use enhanced filtering
function debounceFilterCategoryQuestionsLegacy2() {
    clearTimeout(categoryDebounceTimer);
    categoryDebounceTimer = setTimeout(() => {
        filterCategoryQuestionsEnhanced();
    }, 300);
}

// Enhanced filter functionality for category modal
function filterCategoryQuestionsEnhanced() {
    // Unified filter path: re-render with current filters (matches exam modal behavior)
    loadAvailableQuestionsForCategory(true);
    updateActiveFilterUIForCategory();
}

function updateCategoryFolderVisibilityForCategory(visibleCategories) {
    const categoryFolders = document.querySelectorAll('#availableQuestionsCategory .category-folder');
    
    categoryFolders.forEach(folder => {
        const categoryId = folder.dataset.category;
        const hasVisibleQuestions = visibleCategories.has(categoryId);
        const questions = folder.querySelectorAll('.question-item');
        const visibleQuestions = Array.from(questions).filter(q => q.style.display !== 'none');
        
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

function updateActiveFilterUIForCategory() {
    // Update quick filter buttons to show active state
    const quickFilterButtons = document.querySelectorAll('#categoryModal .quick-filter-btn');
    quickFilterButtons.forEach(btn => {
        // Extract filter type from onclick attribute
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr) {
            const match = onclickAttr.match(/setQuickFilterForCategory\('([^']+)'/);
            if (match && match[1]) {
                const filterType = match[1];
                // Check if this filter is active (in the array)
                if (Array.isArray(window.quickFilterActiveForCategory) && window.quickFilterActiveForCategory.includes(filterType)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        }
    });
}

function showFilterResultsMessageForCategory(visibleQuestionCount, searchTerm, filterType, categoryFilter, difficultyFilter) {
    const container = document.getElementById('availableQuestionsCategory');
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
            const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
            const categoryName = savedCategories.find(c => c.id === categoryFilter)?.name || categoryFilter;
            filters.push(`category: ${categoryName}`);
        }
        if (difficultyFilter && difficultyFilter !== '') filters.push(`difficulty: ${difficultyFilter}`);
        if (window.quickFilterActiveForCategory && Array.isArray(window.quickFilterActiveForCategory) && window.quickFilterActiveForCategory.length > 0) {
            filters.push(`quick: ${window.quickFilterActiveForCategory.join(', ')}`);
        }
        
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
            <button onclick="clearAllCategoryFilters()" class="clear-filters-btn">Clear All Filters</button>
        </div>
        `;
        
        container.insertAdjacentHTML('afterbegin', messageHtml);
    }
}

// Clear all filters for category modal
function clearAllCategoryFilters() {
    // Clear all filter inputs
    document.getElementById('questionSearchCategory').value = '';
    document.getElementById('categoryFilterCategory').value = '';
    document.getElementById('questionFilterCategory').value = 'all';
    document.getElementById('difficultyFilterCategory').value = '';
    const pointFilterCategoryMin = document.getElementById('pointFilterCategoryMin');
    if (pointFilterCategoryMin) pointFilterCategoryMin.value = '';
    const pointFilterCategoryMax = document.getElementById('pointFilterCategoryMax');
    if (pointFilterCategoryMax) pointFilterCategoryMax.value = '';
    
    // Clear quick filters (set to empty array)
    window.quickFilterActiveForCategory = [];
    
    // Remove active class from all quick filter buttons
    const quickFilterButtons = document.querySelectorAll('#categoryModal .quick-filter-btn');
    quickFilterButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Remove filter results message
    const container = document.getElementById('availableQuestionsCategory');
    const filterMessage = container.querySelector('.filter-results-message');
    if (filterMessage) {
        filterMessage.remove();
    }
    
    // Also remove empty state if present
    const emptyState = container.querySelector('.premium-no-questions-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Reload and filter questions
    loadAvailableQuestionsForCategory();
    
    showToast('All filters cleared', 'info');
}

// Debounce filter for category questions
let debounceTimerForCategory;
function debounceFilterCategoryQuestions() {
    clearTimeout(debounceTimerForCategory);
    debounceTimerForCategory = setTimeout(() => {
        const searchTerm = document.getElementById('questionSearchCategory')?.value || '';
        currentFilterForCategory.search = searchTerm.toLowerCase();
        filterCategoryQuestionsEnhanced();
    }, 300);
}


// Get current category ID
function getCurrentCategoryId() {
    // Use the global currentCategoryId variable
    return currentCategoryId;
}

// Open category modal with specific category ID
function openCategoryModalWithCategoryId(categoryId) {
    // Set current category ID
    window.currentCategoryId = categoryId;
    
    // Reset selected questions
    selectedQuestionsForCategory = [];
    
    // Load available questions
    loadAvailableQuestionsForCategory();
    
    // Show modal
    document.getElementById('categoryModal').style.display = 'block';
}


function selectAllQuestionsInCategoryForCategory(categoryId) {
    const categoryFolder = document.querySelector(`.category-folder[data-category="${categoryId}"]`);
    const questions = categoryFolder.querySelectorAll('.question-item');
    
    questions.forEach(question => {
        if (question.style.display !== 'none') { // Only select visible questions
            toggleQuestionSelectionForCategory(question);
        }
    });
}

function toggleCategoryFolderForCategoryModal(categoryId) {
    if (window.event) {
        window.event.stopPropagation();
    }

    const folder = document.querySelector(`#availableQuestionsCategory .category-folder[data-category="${categoryId}"]`);
    if (!folder) return;
    const questionsContainer = folder.querySelector('.category-questions');
    const header = folder.querySelector('.category-header');
    
    if (questionsContainer.style.display === 'none') {
        questionsContainer.style.display = 'block';
        header.classList.remove('collapsed');
    } else {
        questionsContainer.style.display = 'none';
        header.classList.add('collapsed');
    }
}

function updateBulkActionButtonsForCategory() {
    const selectedCount = document.querySelectorAll('#selectedQuestionsListCategory .question-item').length;
    const deselectAllBtn = document.getElementById('deselectAllBtnForCategory');
    const removeSelectedBtn = document.getElementById('removeSelectedBtnForCategory');
    const clearAllBtn = document.getElementById('clearAllBtnForCategory');
    
    // Enable/disable buttons based on selection
    if (deselectAllBtn) {
        deselectAllBtn.disabled = selectedCount === 0;
    }
    
    if (removeSelectedBtn) {
        removeSelectedBtn.disabled = selectedCount === 0;
    }
    
    if (clearAllBtn) {
        clearAllBtn.disabled = selectedCount === 0;
    }
}

// Process selected questions for category modal
function processSelectedQuestionsForCategory(categoryId) {
    const categoryQuestions = document.querySelectorAll(`.category-folder[data-category="${categoryId}"] .question-item.selected`);
    
    if (categoryQuestions.length === 0) {
        showEnhancedToast('Please select at least one question', 'error');
        return;
    }
    
    // Process each selected question
    categoryQuestions.forEach(questionElement => {
        const questionIndex = parseInt(questionElement.dataset.index);
        const question = availableQuestionsForCategory[questionIndex];
        
        if (question) {
            // Add to selected questions
            selectedQuestionsForCategory.push(question);
            
            // Remove from available questions
            const availableIndex = availableQuestionsForCategory.findIndex(q => q.id === question.id);
            if (availableIndex > -1) {
                availableQuestionsForCategory.splice(availableIndex, 1);
            }
        }
    });
    
    // Update UI
    renderAvailableQuestionsForCategory();
    renderSelectedQuestionsForCategory();
    updateCategoryQuestionCounts();
    updateBulkActionButtonsForCategory();
    
    showEnhancedToast(`${categoryQuestions.length} question(s) selected`, 'success');
}
// Expose functions to window for HTML onclick handlers
window.createNewCategory = createNewCategory;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategoryForm;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

// ============================================
// INLINE CATEGORY CREATION
// ============================================

function toggleInlineCategoryInput() {
    const selectContainer = document.getElementById('category-select-container');
    const inputContainer = document.getElementById('category-input-container');
    const inlineInput = document.getElementById('inlineCategoryInput');
    const toggleBtn = document.getElementById('addCategoryToggleBtn');
    
    if (inputContainer.style.display === 'none' || inputContainer.classList.contains('hidden')) {
        // Show Input
        selectContainer.style.display = 'none';
        inputContainer.style.display = 'flex';
        inputContainer.classList.remove('hidden');
        if (toggleBtn) toggleBtn.style.visibility = 'hidden'; // Hide the "New Category" link while adding
        inlineInput.value = '';
        inlineInput.focus();
    } else {
        // Show Select
        selectContainer.style.display = 'block';
        inputContainer.style.display = 'none';
        inputContainer.classList.add('hidden');
        if (toggleBtn) toggleBtn.style.visibility = 'visible';
    }
}

function saveInlineCategory() {
    const nameInput = document.getElementById('inlineCategoryInput');
    const categoryName = nameInput.value.trim();
    
    if (!categoryName) {
        showToast('Please enter a category name', 'error');
        return;
    }
    
    // Check duplicates
    if (categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
        showToast('Category already exists', 'error');
        return;
    }
    
    // Pick random color
    const color = DEFAULT_CATEGORY_COLORS[Math.floor(Math.random() * DEFAULT_CATEGORY_COLORS.length)];
    
    const newCategory = {
        id: generateUUID(),
        name: categoryName,
        color: color,
        questionCount: 0,
        dateCreated: new Date().toISOString()
    };
    
    categories.push(newCategory);
    saveCategories();
    updateCategoryList();
    loadCategoriesIntoSelect(); // Updates all selects including #category
    
    // Select the new category
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
        categorySelect.value = newCategory.id;
    }
    
    showToast('Category added!');
    toggleInlineCategoryInput(); // Switch back to select
}

// Expose to window
window.toggleInlineCategoryInput = toggleInlineCategoryInput;
window.saveInlineCategory = saveInlineCategory;

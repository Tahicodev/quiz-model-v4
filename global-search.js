/**
 * Global Search Functionality
 * Provides real-time search across all admin sections
 */

// Search state
let globalSearchResults = [];
let globalSearchIndex = 0;
let globalSearchActive = false;

/**
 * Initialize Global Search
 * Called when DOM is ready
 */
function initGlobalSearch() {
	const searchInput = document.getElementById('globalSearchInput');

	if (!searchInput) return;

	// Real-time search as user types
	searchInput.addEventListener('input', (e) => {
		handleGlobalSearchInput(e.target.value);
	});

	// Handle Enter key
	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			performGlobalSearch(e.target.value);
		}
	});

	// Handle keyboard shortcut (Cmd+K or Ctrl+K)
	document.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
			e.preventDefault();
			searchInput.focus();
		}
	});

	// Close search results on Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeGlobalSearchResults();
		}
	});
}

/**
 * Handle input changes in search box
 * @param {string} searchTerm - The search term
 */
function handleGlobalSearchInput(searchTerm) {
	if (!searchTerm.trim()) {
		closeGlobalSearchResults();
		return;
	}

	globalSearchResults = [];
	globalSearchIndex = 0;

	// Search across all sections
	searchQuestions(searchTerm);
	searchCategories(searchTerm);
	searchExams(searchTerm);
	searchClasses(searchTerm);
	searchResults(searchTerm);

	if (globalSearchResults.length > 0) {
		displayGlobalSearchResults(globalSearchResults);
		globalSearchActive = true;
	} else {
		displayNoResults();
	}
}

/**
 * Perform the actual search when Enter is pressed
 * @param {string} searchTerm - The search term
 */
function performGlobalSearch(searchTerm) {
	if (!searchTerm.trim()) return;

	handleGlobalSearchInput(searchTerm);
}

/**
 * Search in Questions
 * @param {string} searchTerm - The search term
 */
function searchQuestions(searchTerm) {
	const savedQuestions = JSON.parse(
		localStorage.getItem('quizQuestions') || '[]'
	);
	const term = searchTerm.toLowerCase();

	savedQuestions.forEach((question, index) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('question', question)) {
			return;
		}
		const questionMatch =
			question.question && question.question.toLowerCase().includes(term);
		const optionsMatch =
			question.options &&
			JSON.stringify(question.options).toLowerCase().includes(term);
		const answerMatch =
			question.answer && question.answer.toLowerCase().includes(term);

		if (questionMatch || optionsMatch || answerMatch) {
			const categoryName = question.category
				? getCategoryName(question.category)
				: 'Uncategorized';
			globalSearchResults.push({
				type: 'question',
				id: question.id,
				title: question.question.substring(0, 80),
				description: `Question • ${categoryName}`,
				category: question.category,
				index: index,
				fullData: question,
			});
		}
	});
}

/**
 * Search in Categories
 * @param {string} searchTerm - The search term
 */
function searchCategories(searchTerm) {
	const savedCategories = JSON.parse(
		localStorage.getItem('quizCategories') || '[]'
	);
	const term = searchTerm.toLowerCase();

	savedCategories.forEach((category) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('category', category)) {
			return;
		}
		if (category.name.toLowerCase().includes(term)) {
			globalSearchResults.push({
				type: 'category',
				id: category.id,
				title: category.name,
				description: `Category • ${category.questionCount || 0} questions`,
				color: category.color,
				fullData: category,
			});
		}
	});
}

/**
 * Search in Exams
 * @param {string} searchTerm - The search term
 */
function searchExams(searchTerm) {
	const savedExams = JSON.parse(localStorage.getItem('quizExams') || '[]');
	const term = searchTerm.toLowerCase();

	savedExams.forEach((exam) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('exam', exam)) {
			return;
		}
		if (
			exam.name.toLowerCase().includes(term) ||
			(exam.description && exam.description.toLowerCase().includes(term))
		) {
			const questionCount = exam.questions ? exam.questions.length : 0;
			globalSearchResults.push({
				type: 'exam',
				id: exam.id,
				title: exam.name,
				description: `Exam • ${questionCount} questions, ${
					exam.duration || 0
				}min`,
				fullData: exam,
			});
		}
	});
}

/**
 * Search in Classes
 * @param {string} searchTerm - The search term
 */
function searchClasses(searchTerm) {
	const savedClasses = JSON.parse(localStorage.getItem('quizClasses') || '[]');
	const term = searchTerm.toLowerCase();

	savedClasses.forEach((classItem) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('class', classItem)) {
			return;
		}
		if (classItem.name.toLowerCase().includes(term)) {
			const studentCount = classItem.students ? classItem.students.length : 0;
			globalSearchResults.push({
				type: 'class',
				id: classItem.id,
				title: classItem.name,
				description: `Class • ${studentCount} students`,
				fullData: classItem,
			});
		}
	});
}

/**
 * Search in Results
 * @param {string} searchTerm - The search term
 */
function searchResults(searchTerm) {
	const savedResults = JSON.parse(localStorage.getItem('quizResults') || '[]');
	const term = searchTerm.toLowerCase();

	savedResults.forEach((result) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('result', result)) {
			return;
		}
		const nameMatch = result.name && result.name.toLowerCase().includes(term);
		const studentIdMatch =
			result.studentId && result.studentId.toString().includes(term);

		if (nameMatch || studentIdMatch) {
			globalSearchResults.push({
				type: 'result',
				id: result.id,
				title: result.name || result.studentId,
				description: `Result • Score: ${result.score}/${
					result.totalScore
				}, Class: ${result.class || 'N/A'}`,
				fullData: result,
			});
		}
	});
}

/**
 * Display search results in a dropdown
 * @param {Array} results - The search results
 */
function displayGlobalSearchResults(results) {
	let resultsDropdown = document.getElementById('globalSearchResults');

	if (!resultsDropdown) {
		const searchWrapper = document.querySelector('.header-global-search');
		if (!searchWrapper) return;

		resultsDropdown = document.createElement('div');
		resultsDropdown.id = 'globalSearchResults';
		resultsDropdown.className = 'global-search-results';
		searchWrapper.appendChild(resultsDropdown);
	}

	const groupedResults = groupResultsByType(results);
	let html = '';

	// Limit results to 15 total
	const limitedResults = results.slice(0, 15);

	Object.keys(groupedResults).forEach((type) => {
		const typeResults = groupedResults[type].slice(0, 5); // 5 per category
		if (typeResults.length === 0) return;

		html += `<div class="search-result-group">
                    <div class="search-group-title">${getTypeLabel(
											type
										)}</div>`;

		typeResults.forEach((result, idx) => {
			html += `
                <div class="search-result-item" onclick="handleSearchResultClick('${
									result.type
								}', '${result.id}', ${
				result.index !== undefined ? result.index : 'null'
			})">
                    <div class="search-result-icon">${getTypeIcon(
											result.type
										)}</div>
                    <div class="search-result-content">
                        <div class="search-result-title">${escapeHtml(
													result.title
												)}</div>
                        <div class="search-result-description">${escapeHtml(
													result.description
												)}</div>
                    </div>
                </div>
            `;
		});

		html += '</div>';
	});

	if (html === '') {
		html = '<div class="search-no-results">No results found</div>';
	}

	resultsDropdown.innerHTML = html;
	resultsDropdown.style.display = 'block';

	// Close dropdown when clicking outside
	setTimeout(() => {
		document.addEventListener('click', closeSearchOnOutsideClick);
	}, 0);
}

/**
 * Display no results message
 */
function displayNoResults() {
	let resultsDropdown = document.getElementById('globalSearchResults');

	if (!resultsDropdown) {
		const searchWrapper = document.querySelector('.header-global-search');
		if (!searchWrapper) return;

		resultsDropdown = document.createElement('div');
		resultsDropdown.id = 'globalSearchResults';
		resultsDropdown.className = 'global-search-results';
		searchWrapper.appendChild(resultsDropdown);
	}

	resultsDropdown.innerHTML =
		'<div class="search-no-results">No results found</div>';
	resultsDropdown.style.display = 'block';
}

/**
 * Close search results dropdown
 */
function closeGlobalSearchResults() {
	const resultsDropdown = document.getElementById('globalSearchResults');
	if (resultsDropdown) {
		resultsDropdown.style.display = 'none';
	}
	document.removeEventListener('click', closeSearchOnOutsideClick);
}

/**
 * Close search when clicking outside
 */
function closeSearchOnOutsideClick(e) {
	const searchInput = document.getElementById('globalSearchInput');
	const resultsDropdown = document.getElementById('globalSearchResults');

	if (
		searchInput &&
		resultsDropdown &&
		!searchInput.contains(e.target) &&
		!resultsDropdown.contains(e.target)
	) {
		closeGlobalSearchResults();
	}
}

/**
 * Group results by type
 * @param {Array} results - The search results
 * @returns {Object} Grouped results
 */
function groupResultsByType(results) {
	const grouped = {};

	results.forEach((result) => {
		if (!grouped[result.type]) {
			grouped[result.type] = [];
		}
		grouped[result.type].push(result);
	});

	return grouped;
}

/**
 * Get label for result type
 * @param {string} type - The result type
 * @returns {string} The label
 */
function getTypeLabel(type) {
	const labels = {
		question: '📝 Questions',
		category: '🏷️ Categories',
		exam: '📋 Exams',
		class: '👥 Classes',
		result: '📊 Results',
	};
	return labels[type] || type;
}

/**
 * Get icon for result type
 * @param {string} type - The result type
 * @returns {string} The icon SVG
 */
function getTypeIcon(type) {
	const icons = {
		question:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>',
		category:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
		exam: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
		class:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
		result:
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
	};
	return icons[type] || '';
}

/**
 * Handle search result click
 * @param {string} type - The result type
 * @param {string} id - The result id
 * @param {number} index - The result index
 */
function handleSearchResultClick(type, id, index) {
	closeGlobalSearchResults();
	document.getElementById('globalSearchInput').value = '';

	// Determine the target tab based on type
	let tabToOpen = '';
	let highlightId = id;
	let highlightIndex = index;

	switch (type) {
		case 'question':
			tabToOpen = 'questions';
			// Highlight the question row
			setTimeout(() => {
				highlightSearchResult('question', highlightIndex);
				// Scroll to the highlighted element
				const highlightedRow = document.querySelector(`tr[data-id="${id}"]`);
				if (highlightedRow) {
					highlightedRow.scrollIntoView({
						behavior: 'smooth',
						block: 'center',
					});
				}
			}, 300);
			break;
		case 'category':
			tabToOpen = 'categories';
			setTimeout(() => {
				highlightSearchResult('category', id);
			}, 300);
			break;
		case 'exam':
			tabToOpen = 'exams';
			setTimeout(() => {
				highlightSearchResult('exam', id);
			}, 300);
			break;
		case 'class':
			tabToOpen = 'classes';
			setTimeout(() => {
				highlightSearchResult('class', id);
			}, 300);
			break;
		case 'result':
			tabToOpen = 'results';
			setTimeout(() => {
				highlightSearchResult('result', id);
			}, 300);
			break;
	}

	// Open the tab
	if (tabToOpen) {
		const tabButton = document.querySelector(
			`button[onclick="openTab(event, '${tabToOpen}')"]`
		);
		if (tabButton) {
			const event = new Event('click', { bubbles: true });
			tabButton.dispatchEvent(event);
		}
	}
}

/**
 * Highlight search result in the page
 * @param {string} type - The result type
 * @param {string|number} identifier - The id or index to highlight
 */
function highlightSearchResult(type, identifier) {
	// Remove previous highlights
	document.querySelectorAll('.global-search-highlight').forEach((el) => {
		el.classList.remove('global-search-highlight');
	});

	let elementToHighlight = null;

	switch (type) {
		case 'question':
			// For questions, highlight by index in the table
			const questionTable = document.getElementById('question-list');
			if (questionTable) {
				const allRows = questionTable.querySelectorAll('tbody tr');
				let visibleIndex = 0;
				allRows.forEach((row, idx) => {
					if (
						row.style.display !== 'none' &&
						!row.classList.contains('filtered-out')
					) {
						if (visibleIndex === identifier) {
							elementToHighlight = row;
						}
						visibleIndex++;
					}
				});
			}
			break;
		case 'category':
			// Categories are in a table with data-id
			elementToHighlight = document.querySelector(
				`#categoryList tr[data-id="${identifier}"]`
			);
			break;
		case 'exam':
			// Exams are in a table with data-id
			elementToHighlight = document.querySelector(
				`#examList tr[data-id="${identifier}"]`
			);
			break;
		case 'class':
			// Classes are in a table with data-id
			elementToHighlight = document.querySelector(
				`#classList tr[data-id="${identifier}"]`
			);
			break;
		case 'result':
			elementToHighlight = document.querySelector(
				`[data-result-id="${identifier}"]`
			);
			break;
	}

	if (elementToHighlight) {
		elementToHighlight.classList.add('global-search-highlight');
		elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });

		// Remove highlight after 3 seconds
		setTimeout(() => {
			elementToHighlight.classList.remove('global-search-highlight');
		}, 3000);
	}
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initGlobalSearch);

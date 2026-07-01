// Global variables for question management
let editIndex = -1; // -1 indicates adding a new question, otherwise the index being edited
let currentImageData = ''; // Store the current image data
let sortAscending = true;
let currentQuestionType = 'multiple-choice'; // Default question type
let selectedQuestionsForAssignment = [];
let currentCategoryAssignmentButton = null;
let currentOptionImageData = '';
let currentMainQuestionTypeFilter = 'all';

// Define utility functions first
function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

const STORAGE_CODE_ANSWER_MODES = [
	'multiple-choice',
	'fill-blank',
	'odd-one-out',
	'draggable',
	'matching-pairs',
];

const STORAGE_TYPE_ALIASES = {
	'multiple-choice': 'multiple-choice',
	'multiple-choice-multi': 'multiple-choice',
	'multiple-choice-multiple': 'multiple-choice',
	'multiple-answer': 'multiple-choice',
	'multi-select': 'multiple-choice',
	'single-choice': 'multiple-choice',
	'true-false': 'true-false',
	truefalse: 'true-false',
	boolean: 'true-false',
	'true-or-false': 'true-false',
	mcq: 'multiple-choice',
	mc: 'multiple-choice',
	choice: 'multiple-choice',
	'fill-blank': 'fill-blank',
	'fill-in-blank': 'fill-blank',
	'fill-in-the-blank': 'fill-blank',
	'fill-the-blank': 'fill-blank',
	blank: 'fill-blank',
	draggable: 'draggable',
	'drag-drop': 'draggable',
	'drag-and-drop': 'draggable',
	dragdrop: 'draggable',
	order: 'draggable',
	ordering: 'draggable',
	sequence: 'draggable',
	sequencing: 'draggable',
	'odd-one-out': 'odd-one-out',
	'odd-one': 'odd-one-out',
	'odd-out': 'odd-one-out',
	oddoneout: 'odd-one-out',
	odd: 'odd-one-out',
	'matching-pairs': 'matching-pairs',
	'match-pairs': 'matching-pairs',
	'match-the-pairs': 'matching-pairs',
	matching: 'matching-pairs',
	match: 'matching-pairs',
	pairs: 'matching-pairs',
	code: 'code',
	coding: 'code',
	'code-question': 'code',
	programming: 'code',
};

function normalizeStorageKey(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[_\s]+/g, '-')
		.replace(/[^a-z0-9-]/g, '');
}

function inferQuestionTypeForStorage(question = {}) {
	if (question.codeSnippet || question.codeAnswerMode) return 'code';
	if (question.isDraggable) return 'draggable';
	const answer = String(question.answer || '');
	if (answer.includes('-->')) return 'matching-pairs';
	if (question.useWordBank || String(question.question || '').includes('___')) {
		return 'fill-blank';
	}
	return 'multiple-choice';
}

function normalizeQuestionTypeForStorage(rawType, question = {}) {
	if (window.QuizTypes?.normalize) {
		return window.QuizTypes.normalize(rawType, question);
	}
	const key = normalizeStorageKey(rawType);
	if (!key || ['undefined', 'null', 'none', 'na', 'nan'].includes(key)) {
		return inferQuestionTypeForStorage(question);
	}

	const canonical = STORAGE_TYPE_ALIASES[key];
	if (canonical) {
		if (
			canonical !== 'code' &&
			(question.codeSnippet || question.codeAnswerMode)
		) {
			return 'code';
		}
		return canonical;
	}

	return inferQuestionTypeForStorage(question);
}

function normalizeCodeAnswerModeForStorage(rawMode, fallback = 'multiple-choice') {
	const fallbackMode = STORAGE_CODE_ANSWER_MODES.includes(fallback)
		? fallback
		: 'multiple-choice';
	const key = normalizeStorageKey(rawMode);
	if (!key || ['undefined', 'null', 'none', 'na', 'nan', 'code'].includes(key)) {
		return fallbackMode;
	}

	const canonical = STORAGE_TYPE_ALIASES[key];
	if (STORAGE_CODE_ANSWER_MODES.includes(canonical)) return canonical;
	if (key.includes('choice')) return 'multiple-choice';
	if (key.includes('blank')) return 'fill-blank';
	if (key.includes('odd')) return 'odd-one-out';
	if (key.includes('drag') || key.includes('order') || key.includes('sequence')) {
		return 'draggable';
	}
	if (key.includes('match') || key.includes('pair')) return 'matching-pairs';

	return fallbackMode;
}

// Helper to get category name
function getCategoryName(categoryId) {
	if (!categoryId || categoryId === 'uncategorized') return 'Uncategorized';

	// Try to find in global categories if available
	let category = null;
	if (typeof categories !== 'undefined' && Array.isArray(categories)) {
		category = categories.find((c) => c.id === categoryId);
	}

	// Fallback to localStorage
	if (!category) {
		const savedCategories = JSON.parse(
			localStorage.getItem('quizCategories') || '[]'
		);
		category = savedCategories.find((c) => c.id === categoryId);
	}

	return category ? category.name : 'Unknown';
}

// Define createQuestionRow function
function createQuestionRow(question, index) {
	const row = document.createElement('tr');
	row.className = 'question-table-row';
	row.setAttribute('data-id', question.id || ''); // Add unique ID for highlighting feature

	// Add visual class for categorized vs uncategorized
	const categoryId = question.category || '';
	if (categoryId) {
		row.classList.add('categorized');
	} else {
		row.classList.add('uncategorized');
	}

	// Set data attributes
	row.setAttribute('data-question', question.question);
	row.setAttribute(
		'data-options',
		Array.isArray(question.options)
			? question.options.join(',')
			: question.options
	);
	row.setAttribute('data-answer', question.answer);
	row.setAttribute('data-explanation', question.explanation || '');
	row.setAttribute('data-image', question.image || '');
	row.setAttribute('data-is-draggable', question.isDraggable || false);
	row.setAttribute(
		'data-type',
		normalizeQuestionTypeForStorage(question.type, question)
	);
	row.setAttribute(
		'data-allow-multiple-answers',
		question.allowMultipleAnswers || false
	);
	row.setAttribute('data-category', categoryId);
	row.setAttribute('data-difficulty', question.difficulty || 'medium');
	row.setAttribute('data-instruction', question.instruction || ''); // Add instruction attribute

	// Store optionData as JSON string if it exists
	if (question.optionData && Array.isArray(question.optionData)) {
		console.log('Storing optionData in row:', question.optionData);
		row.setAttribute('data-option-data', JSON.stringify(question.optionData));
	} else {
		console.log('No optionData to store for question:', question.question);
	}

	// Add fill-blank specific attributes
	if (question.type === 'fill-blank') {
		if (question.useWordBank !== undefined)
			row.setAttribute('data-use-word-bank', question.useWordBank);
		if (question.distractors && question.distractors.length > 0) {
			row.setAttribute(
				'data-distractors',
				JSON.stringify(question.distractors)
			);
		}
	}

	// Add code question specific attributes
	if (question.type === 'code') {
		row.setAttribute('data-code-snippet', question.codeSnippet || '');
		row.setAttribute('data-code-language', question.codeLanguage || 'javascript');
		row.setAttribute('data-code-answer-mode', question.codeAnswerMode || 'multiple-choice');
	}

	// Use renderQuestionContent for the merged column
	const questionType = normalizeQuestionTypeForStorage(question.type, question);

	row.innerHTML = `
        <td class="checkbox-cell" data-label="Select">
            <input type="checkbox" 
                   class="question-checkbox" 
                   data-index="${index}"
                   onchange="toggleBulkQuestionSelection(this)">
        </td>
        <td data-label="#">${index + 1}</td>
        <td class="question-cell" data-label="Question">
            <div class="question-content-text">
                ${renderQuestionContent(
									question.question,
									question,
									questionType,
									question.options,
									question.image,
									true,
									false
								)}
            </div>
        </td>
        <td class="options-cell" data-label="Options">
            ${(() => {
							// Check if we have optionData with images
							if (question.optionData && Array.isArray(question.optionData)) {
								return question.optionData
									.map((opt) => {
										if (opt.image) {
											// Check if this is image-only (no text or auto-generated text)
											const isImageOnly =
												opt.isImageOnly ||
												!opt.text ||
												opt.text.trim() === '' ||
												/^(image|img)[-_\s]*\d+$/i.test(opt.text.trim());

											// Option has an image
											return `<div class="option-with-image">
                                <img src="${escapeHtml(opt.image)}" 
                                     alt="${escapeHtml(opt.text || 'Option')}" 
                                     class="option-mini-thumbnail"
                                     onclick="openLightbox('${escapeHtml(
																				opt.image
																			)}')"
                                     title="Click to view full size">
                                ${
																	!isImageOnly
																		? `<span class="option-badge">${escapeHtml(
																				opt.text
																		  )}</span>`
																		: ''
																}
                            </div>`;
										} else {
											// Text-only option
											return `<span class="option-badge">${escapeHtml(
												opt.text
											)}</span>`;
										}
									})
									.join('');
							} else if (Array.isArray(question.options)) {
								// Fallback to simple text options
								return question.options
									.map(
										(opt) =>
											`<span class="option-badge">${escapeHtml(opt)}</span>`
									)
									.join('');
							} else {
								return '<span class="text-muted">No options</span>';
							}
						})()}
        </td>
        <td class="image-cell" data-label="Image">
            ${
							question.image
								? `
                <img src="${escapeHtml(question.image)}" 
                     class="question-thumbnail" 
                     alt="Question Image" 
                     onclick="openLightbox('${escapeHtml(question.image)}')"
                     style="max-width: 80px; max-height: 60px; cursor: pointer; border-radius: 4px; object-fit: cover;">
            `
								: '<span class="text-muted">-</span>'
						}
        </td>
        <td class="points-cell" data-label="Points"><span class="points-badge">${escapeHtml(String(question.points || 1))} pts</span></td>
        <td class="answer-cell" data-label="Answer">${formatCorrectAnswers(
					question
				)}</td>
        <td class="actions-cell" data-label="Actions">
            <div class="exam-actions">
                <button class="exam-action-btn exam-edit-btn" onclick="editQuestion(${index})" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </div>
        </td>
    `;

	// Add click event listener to the image after creating the row
	const thumbnail = row.querySelector('.image-cell .question-thumbnail');
	if (thumbnail && question.image) {
		thumbnail.addEventListener('click', () => openLightbox(question.image));
	}

	return row;
}

// Function to format correct answers for display
function formatCorrectAnswers(question) {
	console.log('Formatting correct answers for question:', question);

	const storedType =
		question.type || (question.isDraggable ? 'draggable' : 'multiple-choice');
	const type = storedType === 'code'
		? normalizeCodeAnswerModeForStorage(
				question.codeAnswerMode,
				'multiple-choice',
			)
		: normalizeQuestionTypeForStorage(storedType, question);
	const answer = question.answer || '';

	if (!answer) {
		return '<span class="correct-answer-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><circle cx="12" cy="12" r="10"></circle></svg>Not set</span>';
	}

	// Helper to render answer badge with optional image
	const renderAnswerBadge = (text) => {
		// Check if this answer has an associated image in optionData
		let image = '';
		let isImageOnly = false;
		let matchedOption = null;

		if (question.optionData && Array.isArray(question.optionData)) {
			// First, try to find by exact text match
			matchedOption = question.optionData.find((opt) => opt.text === text);

			// If not found and text looks like "image-X" or similar, try to match by number
			if (!matchedOption) {
				const imageNumberMatch = text.match(/^(?:image|img)[-_\s]*(\d+)$/i);
				if (imageNumberMatch) {
					const number = imageNumberMatch[1];
					matchedOption = question.optionData.find(
						(opt) =>
							opt.number === number ||
							opt.number === parseInt(number) ||
							(opt.id && opt.id.includes(number))
					);
				}
			}

			// If still not found, try to match by index (for backward compatibility)
			if (
				!matchedOption &&
				question.options &&
				Array.isArray(question.options)
			) {
				const optionIndex = question.options.indexOf(text);
				if (optionIndex >= 0 && optionIndex < question.optionData.length) {
					matchedOption = question.optionData[optionIndex];
				}
			}

			if (matchedOption && matchedOption.image) {
				image = matchedOption.image;
				// Check if this is image-only
				isImageOnly =
					matchedOption.isImageOnly ||
					!matchedOption.text ||
					matchedOption.text.trim() === '' ||
					/^(image|img)[-_\s]*\d+$/i.test(matchedOption.text.trim());
			}
		}

		if (image) {
			// Determine display text for image-only options
			let displayText = text;
			if (isImageOnly && matchedOption) {
				// Use the image number if available
				displayText = matchedOption.number
					? `Image ${matchedOption.number}`
					: text;
			}

			return `<div class="option-with-image" style="background: #e6fffa; border-color: #38b2ac;">
                <img src="${escapeHtml(image)}" 
                     alt="${escapeHtml(displayText)}" 
                     class="option-mini-thumbnail"
                     onclick="openLightbox('${escapeHtml(image)}')"
                     title="Click to view full size">
                ${
									!isImageOnly
										? `<span class="correct-answer-badge" style="background: none; padding: 0; color: #234e52;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><polyline points="9 11 12 14 22 4"></polyline></svg>${escapeHtml(
												text
										  )}</span>`
										: ''
								}
            </div>`;
		}
		return `<span class="correct-answer-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><polyline points="9 11 12 14 22 4"></polyline></svg>${escapeHtml(
			text
		)}</span>`;
	};

	// If it's a multiple choice question with multiple answers
	if (
		type === 'multiple-choice' &&
		question.allowMultipleAnswers &&
		answer.includes(',')
	) {
		console.log('Formatting multiple choice with multiple answers:', answer);
		const answers = answer
			.split(',')
			.map((ans) => ans.trim())
			.filter((ans) => ans);

		if (answers.length === 0) {
			return '<span class="correct-answer-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><circle cx="12" cy="12" r="10"></circle></svg>Not set</span>';
		}

		// Create a separate badge for each answer
		return (
			'<div class="answer-badges-container">' +
			answers.map((ans) => renderAnswerBadge(ans)).join('') +
			'</div>'
		);
	} else if (type === 'draggable' && answer.includes(',')) {
		// For draggable, show the order with images
		console.log('Formatting draggable answers:', answer);
		const answers = answer
			.split(',')
			.map((ans) => ans.trim())
			.filter((ans) => ans);

		if (answers.length === 0) {
			return '<span class="correct-answer-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><circle cx="12" cy="12" r="10"></circle></svg>Not set</span>';
		}

		// Helper to render draggable answer item with image
		const renderDraggableItem = (text, index) => {
			let image = '';
			let isImageOnly = false;
			let matchedOption = null;

			if (question.optionData && Array.isArray(question.optionData)) {
				// First, try to find by exact text match
				matchedOption = question.optionData.find((opt) => opt.text === text);

				// If not found and text looks like "image-X" or similar, try to match by number
				if (!matchedOption) {
					const imageNumberMatch = text.match(/^(?:image|img)[-_\s]*(\d+)$/i);
					if (imageNumberMatch) {
						const number = imageNumberMatch[1];
						matchedOption = question.optionData.find(
							(opt) =>
								opt.number === number ||
								opt.number === parseInt(number) ||
								(opt.id && opt.id.includes(number))
						);
					}
				}

				// If still not found, try to match by index
				if (
					!matchedOption &&
					question.options &&
					Array.isArray(question.options)
				) {
					const optionIndex = question.options.indexOf(text);
					if (optionIndex >= 0 && optionIndex < question.optionData.length) {
						matchedOption = question.optionData[optionIndex];
					}
				}

				if (matchedOption && matchedOption.image) {
					image = matchedOption.image;
					isImageOnly =
						matchedOption.isImageOnly ||
						!matchedOption.text ||
						matchedOption.text.trim() === '' ||
						/^(image|img)[-_\s]*\d+$/i.test(matchedOption.text.trim());
				}
			}

			if (image) {
				// Display image with order number overlay
				let displayText = text;
				if (isImageOnly && matchedOption) {
					displayText = matchedOption.number
						? `Image ${matchedOption.number}`
						: text;
				}

				return `<div class="option-with-image" style="background: #eef2ff; border-color: #c7d2fe;">
                    <div class="order-badge-mini">${index + 1}</div>
                    <img src="${escapeHtml(image)}" 
                         alt="${escapeHtml(displayText)}" 
                         class="option-mini-thumbnail"
                         onclick="openLightbox('${escapeHtml(image)}')"
                         title="Click to view full size">
                </div>`;
			}

			// Fallback to text with order number
			return `<span class="correct-answer-badge order-badge-item">
                <span class="order-number-pill">${index + 1}</span>
                ${escapeHtml(text)}
            </span>`;
		};

		// Create items with arrows between them
		return (
			'<div class="answer-badges-container draggable-order">' +
			answers
				.map((ans, idx) => renderDraggableItem(ans, idx))
				.join('<span class="order-arrow">→</span>') +
			'</div>'
		);

	} else if (type === 'matching-pairs') {
		// Format Matching Pairs: Key1:Value1|Key2:Value2 or Key1-->Value1|Key2-->Value2
		if (!answer) return '<span class="text-muted">Not set</span>';
		
		const pairs = answer.split('|');
		return '<div class="answer-badges-container validation-list" style="display: flex; flex-direction: column; gap: 4px;">' + 
			pairs.map(pair => {
				// Support both : and --> as separators
				let key, val;
				if (pair.includes('-->')) {
					[key, val] = pair.split('-->');
				} else {
					[key, val] = pair.split(':');
				}
				
				return `<span class="validation-badge" style="display: inline-flex; align-items: center; background: #f3f4f6; padding: 4px 8px; border-radius: 4px; border: 1px solid #e5e7eb;">
					<span class="term" style="font-weight: 500;">${escapeHtml((key || '').trim())}</span>
					<span class="arrow" style="margin: 0 8px; color: #8b5cf6; font-weight: bold;">→</span>
					<span class="def">${escapeHtml((val || '').trim())}</span>
				</span>`;
			}).join('') + 
			'</div>';
	} else if (type === 'fill-blank') {
		// For fill-blank, parse and display blanks with their answers
		console.log('Formatting fill-blank answers:', answer);
		if (!answer || (!answer.includes(':') && !answer.includes('|'))) {
			return '<span class="correct-answer-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><circle cx="12" cy="12" r="10"></circle></svg>Not set</span>';
		}

		// Parse format: "1:answer1,answer2|2:answer3,answer4"
		const blanks = answer.split('|').map((blank) => {
			const [id, answers] = blank.split(':');
			return {
				id: id,
				answers: answers ? answers.split(',').map((a) => a.trim()) : [],
			};
		});

		return (
			'<div class="answer-badges-container">' +
			blanks
				.map(
					(blank) =>
						`<span class="blank-answer-badge">
                    <span class="blank-number">${
											blank.id
										}</span>: ${blank.answers
							.map((a) => escapeHtml(a))
							.join(', ')}
                </span>`
				)
				.join('') +
			'</div>'
		);
	} else {
		// Single answer (default) - Check if it's draggable but treated as single string
		if (type === 'draggable' && answer) {
			const items = answer.split(',').map(s => s.trim());
			return '<div class="draggable-list" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">' +
				items.map((item, i) => `
					<span style="background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 2px 8px; border-radius: 999px; font-size: 0.85em;">
						<span style="font-weight:bold; margin-right:4px;">${i+1}.</span>${escapeHtml(item)}
					</span>
					${i < items.length - 1 ? '<span style="color:#9ca3af;">→</span>' : ''}
				`).join('') +
				'</div>';
		}
		
		console.log('Formatting single answer:', answer);
		return renderAnswerBadge(answer);
	}
}

function openCategoryAssignmentModal(button) {
	currentCategoryAssignmentButton = button;
	const row = button.closest('tr');
	const questionIndex =
		parseInt(row.querySelector('td:first-child').textContent) - 1;

	// Initialize selected questions array
	selectedQuestionsForAssignment = [questionIndex];

	// Load categories into select
	loadCategoriesForAssignment();

	// Update selected questions display
	updateSelectedQuestionsList();

	// Show modal
	document.getElementById('categoryAssignmentModal').style.display = 'block';
}

function closeCategoryAssignmentModal() {
	document.getElementById('categoryAssignmentModal').style.display = 'none';
	// Clear selection
	selectedQuestionsForAssignment = [];
	updateBulkDeleteButtons();

	// Broadcast Updates if enabled
	if (document.getElementById('setting-broadcastUpdates')?.checked) {
		console.log('Broadcast Updates enabled, triggering sync after bulk delete...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
	currentCategoryAssignmentButton = null;
}

function loadCategoriesForAssignment() {
	const select = document.getElementById('assignmentCategorySelect');
	const savedCategories = JSON.parse(
		localStorage.getItem('quizCategories') || '[]'
	);

	select.innerHTML = '<option value="">-- Select a category --</option>';

	savedCategories.forEach((category) => {
		const option = document.createElement('option');
		option.value = category.id;
		option.textContent = category.name;
		select.appendChild(option);
	});
}

function updateSelectedQuestionsList() {
	const savedQuestions = JSON.parse(
		localStorage.getItem('quizQuestions') || '[]'
	);
	const questions = savedQuestions || [];
	const container = document.getElementById('selectedQuestionsList');
	const countElement = document.getElementById('selectedQuestionsCount');

	countElement.textContent = selectedQuestionsForAssignment.length;

	container.innerHTML = selectedQuestionsForAssignment
		.map((index) => {
			const question = questions[index];
			if (!question) return '';

			// Category and type information is now handled in the reusable function
			return `
            <div class="selected-question-item">
                <span class="question-number">${index + 1}.</span>
                ${renderQuestionContent(
									question.question.substring(0, 50) +
										(question.question.length > 50 ? '...' : ''),
									question,
									question.type,
									null,
									null,
									true
								)}
            </div>
        `;
		})
		.join('');
}

function saveCategoryAssignment() {
	const categoryId = document.getElementById('assignmentCategorySelect').value;

	if (!categoryId) {
		showToast('Please select a category', 'error');
		return;
	}

	// Update selected questions with the category
	const savedQuestions = JSON.parse(
		localStorage.getItem('quizQuestions') || '[]'
	);
	const questions = savedQuestions || [];

	let updatedCount = 0;
	selectedQuestionsForAssignment.forEach((index) => {
		if (questions[index]) {
			questions[index].category = categoryId;
			updatedCount++;
		}
	});

	// Save updated questions
	localStorage.setItem('quizQuestions', JSON.stringify(questions));

	// Update the question list to reflect changes
	updateQuestionList();

	// Close modal
	closeCategoryAssignmentModal();

	showToast(`Successfully assigned ${updatedCount} question(s) to category`);

	// Broadcast Updates if enabled
	if (document.getElementById('setting-broadcastUpdates')?.checked) {
		console.log('Broadcast Updates enabled, triggering sync after categorization...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
}

function getQuestions() {
	const questionList = document.getElementById('question-list');
	const rows = questionList.getElementsByTagName('tr');
	const questions = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];

		// Skip if it's the "no questions" message row
		if (row.classList.contains('empty-message')) {
			continue;
		}

		// Get basic data attributes from the row
		const questionObj = {
			question: row.getAttribute('data-question'),
			options: row.getAttribute('data-options').split(','),
			answer: row.getAttribute('data-answer'),
			explanation: row.getAttribute('data-explanation') || '',
			image: row.getAttribute('data-image') || '',
			isDraggable: row.getAttribute('data-is-draggable') === 'true',
			type: row.getAttribute('data-type') || 'multiple-choice',
			allowMultipleAnswers:
				row.getAttribute('data-allow-multiple-answers') === 'true',
			category: row.getAttribute('data-category') || '',
			difficulty: row.getAttribute('data-difficulty') || 'medium',
			instruction: row.getAttribute('data-instruction') || '',
		};

		// Retrieve optionData if it exists
		const optionDataStr = row.getAttribute('data-option-data');
		console.log(
			'Retrieved optionData string from row:',
			optionDataStr ? optionDataStr.substring(0, 100) + '...' : 'null'
		);
		if (optionDataStr) {
			try {
				questionObj.optionData = JSON.parse(optionDataStr);
			} catch (e) {
				console.error('Error parsing optionData:', e);
				// Fallback to creating optionData from options
				questionObj.optionData = questionObj.options.map((opt) => ({
					text: opt,
					image: '',
				}));
			}
		} else {
			// Create basic optionData from options if not present
			questionObj.optionData = questionObj.options.map((opt) => ({
				text: opt,
				image: '',
			}));
		}

		// Add fill-blank specific fields if present
		if (questionObj.type === 'fill-blank') {
			const useWordBank = row.getAttribute('data-use-word-bank');
			if (useWordBank !== null) {
				questionObj.useWordBank = useWordBank === 'true';
			}
			const distractors = row.getAttribute('data-distractors');
			if (distractors) {
				try {
					questionObj.distractors = JSON.parse(distractors);
				} catch (e) {
					console.error('Error parsing distractors:', e);
				}
			}
		}

		// Add code question specific fields if present
		if (questionObj.type === 'code') {
			questionObj.codeSnippet = row.getAttribute('data-code-snippet') || '';
			questionObj.codeLanguage = row.getAttribute('data-code-language') || 'javascript';
			questionObj.codeAnswerMode = row.getAttribute('data-code-answer-mode') || 'multiple-choice';
		}

		questions.push(questionObj);
	}

	return questions;
}

// Helper to get selected checkbox values
function getSelectedCheckboxValues() {
	const container = document.getElementById('multiple-answers-list');
	const imageContainer = document.getElementById('mc-image-multiple-grid');

	// First check if we have image selections
	if (imageContainer && !imageContainer.closest('.hidden')) {
		const selectedCards = imageContainer.querySelectorAll(
			'.image-answer-card.selected'
		);
		if (selectedCards.length > 0) {
			return Array.from(selectedCards).map((card) => card.dataset.value);
		}
	}

	// Fallback to checkbox list
	if (!container) return [];

	// Convert NodeList to Array and map to values
	return Array.from(
		container.querySelectorAll('input[type="checkbox"]:checked')
	).map((cb) => cb.value);
}

function normalizeOptionDataForStorage(optionData = []) {
	const normalized = [];
	let nextImageNumber = 1;

	(optionData || []).forEach((entry, index) => {
		const isObjectEntry = entry && typeof entry === 'object';
		const rawText = isObjectEntry ? entry.text : entry;
		const rawImage = isObjectEntry ? entry.image : '';
		const textValue = String(rawText || '').trim();
		const imageValue = String(rawImage || '').trim();
		const numberCandidate = Number.parseInt(
			String(
				isObjectEntry
					? entry.number || entry.imageNumber || ''
					: '',
			),
			10,
		);
		const imageNumber = Number.isFinite(numberCandidate) && numberCandidate > 0
			? numberCandidate
			: nextImageNumber;
		const fallbackImageToken = imageValue ? `image-${imageNumber}` : '';
		const normalizedText = textValue || fallbackImageToken;
		const normalizedImage = imageValue;

		if (!normalizedText && !normalizedImage) return;

		const isImageOnly =
			Boolean(isObjectEntry && entry.isImageOnly) ||
			(Boolean(normalizedImage) && /^image[-_\s]*\d+$/i.test(normalizedText));

		normalized.push({
			text: normalizedText,
			image: normalizedImage,
			isImageOnly,
			id: isObjectEntry
				? String(entry.id || entry.imageId || `opt_${index + 1}`)
				: `opt_${index + 1}`,
			number: normalizedImage ? String(imageNumber) : '',
		});

		if (normalizedImage) {
			nextImageNumber = Math.max(nextImageNumber, imageNumber + 1);
		}
	});

	return normalized;
}

function normalizeAnswerTokensForOptionData(answer, optionData = []) {
	const rawAnswer = String(answer || '').trim();
	if (!rawAnswer || !/img_\d+/i.test(rawAnswer)) {
		return rawAnswer;
	}

	const normalizedOptions = normalizeOptionDataForStorage(optionData);
	if (!normalizedOptions.length) return rawAnswer;

	return rawAnswer
		.split(',')
		.map((token) => {
			const trimmedToken = String(token || '').trim();
			const imageIndexMatch = trimmedToken.match(/^img_(\d+)$/i);
			if (!imageIndexMatch) return trimmedToken;
			const optionIndex = Number.parseInt(imageIndexMatch[1], 10);
			const mapped = normalizedOptions[optionIndex];
			return mapped && mapped.text ? mapped.text : trimmedToken;
		})
		.join(',');
}

function normalizeQuestionOptionStructure(question = {}) {
	const normalizedQuestion = { ...(question || {}) };
	let optionData = [];

	if (Array.isArray(normalizedQuestion.optionData)) {
		optionData = normalizedQuestion.optionData;
	} else if (
		Array.isArray(normalizedQuestion.options) &&
		normalizedQuestion.options.some((entry) => entry && typeof entry === 'object')
	) {
		optionData = normalizedQuestion.options;
	} else if (Array.isArray(normalizedQuestion.options)) {
		optionData = normalizedQuestion.options.map((entry) => ({
			text: String(entry || '').trim(),
			image: '',
		}));
	} else if (typeof normalizedQuestion.options === 'string') {
		optionData = normalizedQuestion.options
			.split(',')
			.map((entry) => ({
				text: String(entry || '').trim(),
				image: '',
			}))
			.filter((entry) => entry.text);
	}

	optionData = normalizeOptionDataForStorage(optionData);
	normalizedQuestion.optionData = optionData;
	normalizedQuestion.options = optionData.map((entry) => entry.text).filter(Boolean);
	normalizedQuestion.answer = normalizeAnswerTokensForOptionData(
		normalizedQuestion.answer,
		optionData,
	);
	const rawType = normalizedQuestion.type || normalizedQuestion.questionType || '';
	normalizedQuestion.type = normalizeQuestionTypeForStorage(rawType, normalizedQuestion);
	if (normalizedQuestion.type === 'code') {
		const fallbackModeFromType = normalizeCodeAnswerModeForStorage(rawType, '');
		normalizedQuestion.codeAnswerMode = normalizeCodeAnswerModeForStorage(
			normalizedQuestion.codeAnswerMode || fallbackModeFromType,
			fallbackModeFromType || 'multiple-choice',
		);
		normalizedQuestion.codeSnippet = String(normalizedQuestion.codeSnippet || '');
		normalizedQuestion.codeLanguage = String(
			normalizedQuestion.codeLanguage || 'javascript',
		);
	}
	normalizedQuestion.allowMultipleAnswers = Boolean(
		normalizedQuestion.allowMultipleAnswers,
	);

	return normalizedQuestion;
}

// Validation function
function validateQuestionForm() {
	// 1. Validate Question Text
	const questionText = document.getElementById('question').value.trim();
	if (!questionText) {
		console.log('Validation failed: Question text empty');
		showToast('Please enter the question text', 'error');
		return false;
	}

	// Get selected type
	let selectedType = 'multiple-choice';
	const typeRadios = document.getElementsByName('questionType');
	for (const radio of typeRadios) {
		if (radio.checked) {
			selectedType = radio.value;
			break;
		}
	}

	// 2. Validate Options (for types that need them)
	if (selectedType !== 'fill-blank' && selectedType !== 'true-false') {
		let options = [];
		const optionsField = document.getElementById('options');

		if (optionsField && optionsField.dataset.optionData) {
			try {
				const optionData = JSON.parse(optionsField.dataset.optionData);
				options = optionData.map((opt) => opt.text);
			} catch (e) {
				console.error(e);
			}
		}

		if (options.length === 0 && optionsField) {
			options = optionsField.value
				.trim()
				.split(',')
				.map((o) => o.trim())
				.filter((o) => o);
		}

		if (options.length < 2) {
			console.log('Validation failed: Fewer than 2 options', options);
			showToast('Please add at least 2 options', 'error');
			return false;
		}
	}

	// 3. Validate Answer
	if (selectedType === 'true-false') {
		const answerSelect = document.getElementById('answer-select-mc');
		if (!answerSelect || !answerSelect.value) {
			showToast('Please select True or False', 'error');
			return false;
		}
	} else if (selectedType === 'multiple-choice') {
		const allowMultiple = document.getElementById(
			'allow-multiple-answers'
		).checked;
		if (allowMultiple) {
			const container = document.getElementById('multiple-answers-list');
			const checkboxes = container
				? container.querySelectorAll('input[type="checkbox"]:checked')
				: [];
			if (checkboxes.length === 0) {
				console.log('Validation failed: No multiple answers selected');
				showToast('Please select at least one correct answer', 'error');
				return false;
			}
		} else {
			const answerSelect = document.getElementById('answer-select-mc');
			if (!answerSelect || !answerSelect.value) {
				console.log('Validation failed: No single answer selected');
				showToast('Please select a correct answer', 'error');
				return false;
			}
		}
	} else if (selectedType === 'draggable') {
		const answer = document.getElementById('answer').value.trim();
		if (!answer) {
			console.log('Validation failed: Draggable order not set');
			showToast('Please set the correct order', 'error');
			return false;
		}
	} else if (selectedType === 'odd-one-out') {
		const answer = document.getElementById('answer-select-ooo').value;
		if (!answer) {
			console.log('Validation failed: Odd one out not selected');
			showToast('Please select the odd one out', 'error');
			return false;
		}
	} else if (selectedType === 'matching-pairs') {
		const answer = document.getElementById('matching-answer').value;
		if (!answer) {
			console.log('Validation failed: Matching pairs not configured');
			showToast('Please configure matching pairs', 'error');
			return false;
		}
	} else if (selectedType === 'fill-blank') {
		const answer = document.getElementById('fill-blank-answer').value;
		if (!answer) {
			console.log('Validation failed: Fill blank answer empty');
			showToast('Please configure the fill-in-the-blank answer', 'error');
			return false;
		}
	}

	return true;
}

function addOrUpdateQuestion() {
	try {
		console.log('Starting addOrUpdateQuestion...');
		if (!validateQuestionForm()) {
			console.log('Validation failed');
			return;
		}
		console.log('Validation passed');

		const question = document.getElementById('question').value.trim();

		// Get option data with images if available
		let optionData = [];
		const optionsField = document.getElementById('options');
		if (optionsField && optionsField.dataset.optionData) {
			try {
				optionData = JSON.parse(optionsField.dataset.optionData);
				console.log('Using option data with images:', optionData);
			} catch (e) {
				console.error('Error parsing option data:', e);
			}
		}
		optionData = normalizeOptionDataForStorage(optionData);

		// Fallback to simple options if no option data available
		let options =
			optionData.length > 0
				? optionData.map((opt) => opt.text)
				: document
						.getElementById('options')
						.value.trim()
						.split(',')
						.map((opt) => opt.trim());
		options = options.filter((opt) => opt !== ''); // Filter out empty options

		// Get question type from radio buttons with enhanced detection
		const typeRadios = document.getElementsByName('questionType');
		let selectedType = null;

		// First, check radio buttons
		for (const radio of typeRadios) {
			if (radio.checked) {
				selectedType = radio.value;
				console.log('Found checked radio button:', selectedType);
				break;
			}
		}

		// If no radio is checked, use the global currentQuestionType or fallback to multiple-choice
		if (!selectedType) {
			if (window.currentQuestionType) {
				selectedType = window.currentQuestionType;
				console.log('Using window.currentQuestionType:', selectedType);
			} else if (
				typeof currentQuestionType !== 'undefined' &&
				currentQuestionType
			) {
				selectedType = currentQuestionType;
				console.log('Using global currentQuestionType:', selectedType);
			} else {
				selectedType = 'multiple-choice'; // Default fallback
				console.log('Using default fallback: multiple-choice');
			}

			// Sync the radio button to match the selected type
			const radioToCheck = document.getElementById(
				'type' +
					selectedType
						.split('-')
						.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
						.join('')
						.replace('Choice', 'Choice')
			);

			if (radioToCheck) {
				radioToCheck.checked = true;
				console.log('Synced radio button for type:', selectedType);
			}
		}

		// Update global variable to maintain consistency
		window.currentQuestionType = selectedType;
		if (typeof currentQuestionType !== 'undefined') {
			currentQuestionType = selectedType;
		}

		console.log(
			'Final selectedType:',
			selectedType,
			'from enhanced detection and sync'
		);

		// Get answer based on question type
		let answer = '';
		
		// For code type, we delegate to the sub-type
		const typeForAnswer = selectedType === 'code' 
			? (document.getElementById('code-answer-mode')?.value || 'multiple-choice')
			: selectedType;

		if (selectedType === 'true-false') {
			options = ['True', 'False'];
			optionData = options.map((opt) => ({ text: opt, image: '' }));
			answer = document.getElementById('answer-select-mc')?.value || 'True';
		} else if (typeForAnswer === 'draggable') {
			const answerElement = document.getElementById('answer');
			if (answerElement) {
				answer = answerElement.value.trim();
				console.log('Using draggable answer:', answer);
			} else {
				console.error('Draggable answer element not found');
			}
		} else if (selectedType === 'odd-one-out') {
			// Check image grid first
			const oooImageGrid = document.getElementById('ooo-image-answer-grid');
			const oooImageWrapper = document.getElementById(
				'ooo-image-answer-grid-wrapper'
			);

			if (oooImageWrapper && !oooImageWrapper.classList.contains('hidden')) {
				const selectedCard = oooImageGrid?.querySelector(
					'.image-answer-card.selected'
				);
				if (selectedCard) {
					answer = selectedCard.dataset.value;
					console.log('Using odd-one-out image grid answer:', answer);
				}
			}

			// Fallback to dropdown
			if (!answer) {
				const answerElement = document.getElementById('answer-select-ooo');
				if (answerElement) {
					answer = answerElement.value.trim();
					console.log('Using odd-one-out answer:', answer);
				} else {
					console.error('Odd-one-out answer element not found');
				}
			}
		} else if (selectedType === 'matching-pairs') {
			const answerElement = document.getElementById('matching-answer');
			if (answerElement) {
				answer = answerElement.value.trim();
				console.log('Using matching pairs answer:', answer);
			} else {
				console.error('Matching pairs answer element not found');
			}
		} else if (selectedType === 'fill-blank') {
			const answerElement = document.getElementById('fill-blank-answer');
			if (answerElement) {
				answer = answerElement.value.trim();
				console.log('Using fill-blank answer:', answer);
			} else {
				console.error('Fill-blank answer element not found');
			}
		} else {
			// multiple-choice
			// Check if multiple answers are allowed
			const allowMultiple = document.getElementById(
				'allow-multiple-answers'
			).checked;
			console.log(
				'Multiple choice question with allowMultiple:',
				allowMultiple
			);

			if (allowMultiple) {
				// Get selected checkboxes
				const selectedValues = getSelectedCheckboxValues();
				answer = selectedValues.join(',');
				console.log('Using multiple choice answers:', selectedValues);
				console.log('Joined answer string:', answer);

				// Double-check that we have values
				if (!answer && selectedValues.length === 0) {
					// Try getting the value from the hidden answer field
					const answerField = document.getElementById('answer');
					if (answerField && answerField.value) {
						answer = answerField.value;
						console.log('Using answer field value instead:', answer);
					}
				}
			} else {
				// Get single answer from dropdown or image grid
				const imageGrid = document.getElementById('mc-image-answer-grid');
				const imageGridWrapper = document.getElementById(
					'image-answer-grid-wrapper'
				);

				// Check if image grid is visible and has a selection
				if (
					imageGridWrapper &&
					!imageGridWrapper.classList.contains('hidden')
				) {
					const selectedCard = imageGrid?.querySelector(
						'.image-answer-card.selected'
					);
					if (selectedCard) {
						answer = selectedCard.dataset.value;
						console.log('Using image grid answer:', answer);
					}
				}

				// Fallback to dropdown
				if (!answer) {
					const answerElement = document.getElementById('answer-select-mc');
					if (answerElement) {
						answer = answerElement.value.trim();
						console.log('Using multiple choice answer:', answer);
					} else {
						console.error('Multiple choice answer element not found');
					}
				}
			}
		}
		answer = normalizeAnswerTokensForOptionData(answer, optionData);

		const explanation = document.getElementById('explanation').value;

		// For backward compatibility, set isDraggable based on the type
		const isDraggable = selectedType === 'draggable';

		// Check if multiple answers are allowed for multiple choice questions
		const allowMultipleAnswers =
			selectedType === 'multiple-choice'
				? document.getElementById('allow-multiple-answers').checked
				: false;

		// Get category from form
		const category = document.getElementById('category').value;

		// Get difficulty from form
		const difficulty = document.getElementById('difficulty').value;
		const points = parseFloat(document.getElementById('points').value) || 1;

		// Create question object with type property and option images
		const questionObj = {
			question: question,
			options: options,
			optionData:
				optionData.length > 0
					? optionData
					: options.map((opt) => ({ text: opt, image: '' })),
			answer: answer,
			explanation: explanation,
			image: currentImageData,
			isDraggable: isDraggable,
			type: selectedType,
			allowMultipleAnswers: allowMultipleAnswers,
			category: category || '',
			difficulty: difficulty || 'medium',
			points: points,
		};
		Object.assign(questionObj, normalizeQuestionOptionStructure(questionObj));
		
		if (selectedType === 'code') {
			questionObj.codeSnippet = document.getElementById('code-snippet')?.value || '';
			questionObj.codeLanguage = document.getElementById('code-language')?.value || 'javascript';
			questionObj.codeAnswerMode = document.getElementById('code-answer-mode')?.value || 'multiple-choice';
		}

		// Debug: Check selectedType before fill-blank processing
		console.log(
			'About to check fill-blank. selectedType is:',
			selectedType,
			'Type:',
			typeof selectedType
		);

		// Add fill-blank specific fields only for fill-blank questions
		if (selectedType === 'fill-blank') {
			console.log('Processing fill-blank question...');

			const useWordBankEl = document.getElementById('use-word-bank');
			const fillBlankInstructionEl = document.getElementById(
				'fill-blank-instruction'
			);

			console.log('Fill-blank elements:', {
				useWordBankEl: useWordBankEl ? 'found' : 'NOT FOUND',
				fillBlankInstructionEl: fillBlankInstructionEl ? 'found' : 'NOT FOUND',
			});

			const useWordBank = useWordBankEl ? useWordBankEl.checked : false;
			const fillBlankInstruction = fillBlankInstructionEl
				? fillBlankInstructionEl.value.trim()
				: '';

			questionObj.useWordBank = useWordBank;
			questionObj.instruction = fillBlankInstruction; // Set instruction from fill-blank field

			// If word bank is enabled, the 'options' field (which is general options) becomes the distractors
			// We save them in the 'options' field as requested
			if (useWordBank) {
				questionObj.options = options;
				// We don't use distractors field anymore, but we can keep it empty or undefined
				delete questionObj.distractors;
			} else {
				questionObj.options = [];
			}

			// The fill-blank specific instruction field is now the general instruction field
			// The fill-blank specific category and difficulty are also now the general ones

			console.log('Fill-blank specific data:', {
				useWordBank,
				distractors: questionObj.options,
			});
		}

		console.log(
			'Created question object:',
			JSON.stringify(questionObj, null, 2)
		);

		if (editIndex === -1) {
			// Add creation date for activity feed
			questionObj.dateCreated = new Date().toISOString();
			questionObj.id = generateUUID(); // Add unique ID for highlighting feature
			questionObj.ownerId = window.Auth?.getCurrentUser?.()?.id || '';

			// Save new question to localStorage
			const savedQuestions = JSON.parse(
				localStorage.getItem('quizQuestions') || '[]'
			);
			savedQuestions.push(questionObj);
			localStorage.setItem('quizQuestions', JSON.stringify(savedQuestions));

			// Log the activity
			if (typeof logActivity === 'function') {
				logActivity('question', question, 'created', {
					id: questionObj.id,
					type: selectedType,
					category: category || 'uncategorized',
					difficulty: difficulty || 'medium',
					number: savedQuestions.length,
					text: question.length > 50 ? question.substring(0, 50) + '...' : question
				});
			}

			// Update Dashboard if available
			if (window.initDashboard) {
				window.initDashboard();
			}

			addQuestionToList(questionObj);
			showToast('Question added successfully!');

			// Update category counts
			if (typeof updateQuestionCategoryCounts === 'function') {
				updateQuestionCategoryCounts();
			}
			if (typeof updateCategoryList === 'function') {
				updateCategoryList();
			}

			closeQuestionFormModal();
		} else {
			updateQuestionInTable(editIndex, questionObj);

			// Log the activity
			if (typeof logActivity === 'function') {
				logActivity('question', question, 'edited', {
					id: questionObj.id,
					type: selectedType,
					category: category || 'uncategorized',
					difficulty: difficulty || 'medium',
					number: editIndex + 1,
					text: question.length > 50 ? question.substring(0, 50) + '...' : question
				});
			}

			editIndex = -1;
			document.getElementById('question-action-text').textContent =
				'Add Question';
			document.getElementById('add-update-question-btn').textContent =
				'Add Question';
			document.getElementById('cancel-edit-btn').classList.add('hidden');
			showToast('Question updated successfully!');
			closeQuestionFormModal();

			// Update category counts
			if (typeof updateQuestionCategoryCounts === 'function') {
				updateQuestionCategoryCounts();
			}
			if (typeof updateCategoryList === 'function') {
				updateCategoryList();
			}
		}

		clearQuestionForm();
		// saveSettings(false); // Removed undefined function call

		// Broadcast Updates if enabled
		if (document.getElementById('setting-broadcastUpdates')?.checked) {
			console.log('Broadcast Updates enabled, triggering sync...');
			if (window.syncQuestionsToClients) window.syncQuestionsToClients();
		}
	} catch (e) {
		console.error('Error adding question:', e);
		showToast(
			'An error occurred while adding the question: ' + e.message,
			'error'
		);
	}
}

// Reusable function to render question content with consistent styling
function renderQuestionContent(
	question,
	questionObj,
	type,
	options,
	image,
	showFullQuestion = true,
	showPointsBadge = true
) {
	// Get category information
	const savedCategories = JSON.parse(
		localStorage.getItem('quizCategories') || '[]'
	);
	const categoryId = questionObj.category || 'uncategorized';
	const category = savedCategories.find(
		(cat) => cat.id === categoryId || cat.name === categoryId
	) || { name: 'Uncategorized', color: '#9ca3af' };

	// Create category badge
	const categoryBadge = `
        <span class="category-badge" style="background-color: ${
					category.color
				}; color: white;">
            ${escapeHtml(category.name)}
        </span>
    `;

	// Determine question type display and answer type
	let questionTypeDisplay = 'Multiple Choice';
	let typeClass = 'multiple-choice-type';
	let answerTypeIndicator = '';
	let isCodeQuestion = type === 'code';

	if (isCodeQuestion) {
		const subMode = normalizeCodeAnswerModeForStorage(
			questionObj && questionObj.codeAnswerMode,
			'multiple-choice',
		);
		const modeLabels = {
			'multiple-choice': 'Multiple Choice',
			'draggable': 'Drag & Drop',
			'odd-one-out': 'Odd One Out',
			'matching-pairs': 'Matching Pairs',
			'fill-blank': 'Fill in the Blank'
		};
		const modeClasses = {
			'multiple-choice': 'multiple-choice-type',
			'draggable': 'draggable-type',
			'odd-one-out': 'odd-one-type',
			'matching-pairs': 'matching-pairs-type',
			'fill-blank': 'fill-blank-type'
		};
		
		questionTypeDisplay = modeLabels[subMode] || 'Multiple Choice';
		typeClass = modeClasses[subMode] || 'multiple-choice-type';
	} else if (type === 'true-false') {
		questionTypeDisplay = 'True / False';
		typeClass = 'true-false-type';
	} else if (type === 'draggable' || (questionObj && questionObj.isDraggable)) {
		questionTypeDisplay = 'Drag & Drop';
		typeClass = 'draggable-type';
	} else if (type === 'odd-one-out') {
		questionTypeDisplay = 'Odd One Out';
		typeClass = 'odd-one-type';
	} else if (type === 'matching-pairs') {
		questionTypeDisplay = 'Matching Pairs';
		typeClass = 'matching-pairs-type';
	} else if (type === 'fill-blank') {
		questionTypeDisplay = 'Fill in the Blank';
		typeClass = 'fill-blank-type';
	} else {
		// Multiple choice questions
		const isMulti = questionObj && questionObj.allowMultipleAnswers;
		questionTypeDisplay = 'Multiple Choice';
		typeClass = 'multiple-choice-type';
		
		if (isMulti) {
			answerTypeIndicator = `
                <span class="multiple-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 11 12 14 22 4"></polyline>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    Multiple
                </span>`;
		} else {
			answerTypeIndicator = `
                <span class="single-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="4" fill="currentColor"></circle>
                    </svg>
                    Single
                </span>`;
		}
	}

	// Create type badge
	let badgesHtml = `
        <span class="type-badge ${typeClass} scale-effect">
            ${questionTypeDisplay}
        </span>
    `;

	// Add special code badge if applicable
	if (isCodeQuestion) {
		badgesHtml += `
            <span class="type-badge code-badge scale-effect">
                💻 Code
            </span>
        `;
	}

	// Add points badge if requested
	let pointsBadgeHtml = '';
	if (showPointsBadge) {
		const points = questionObj && questionObj.points ? Number.parseFloat(questionObj.points) : 1;
		pointsBadgeHtml = `
            <span class="type-badge points-badge scale-effect" style="background-color: #f59e0b; color: white; border-color: #d97706;">
                ⭐ ${points} pt${points !== 1 ? 's' : ''}
            </span>
        `;
	}

	const typeBadge = badgesHtml;

	// Create question content
	const questionText = showFullQuestion
		? escapeHtml(question)
		: escapeHtml(question.substring(0, 50)) +
		  (question.length > 50 ? '...' : '');

	return `
        <div class="question-content">
            <div class="question-text">${questionText}</div>
            <div class="question-meta">
                ${categoryBadge}
                ${pointsBadgeHtml}
                ${typeBadge}
                ${answerTypeIndicator}
            </div>
        </div>
    `;
}

function addQuestionToList(questionObj) {
	const questionList = document.getElementById('question-list');

	// Remove "no questions" message if it exists
	const emptyMessage = questionList.querySelector('.empty-message');
	if (emptyMessage) {
		emptyMessage.remove();
	}

	// Create row using the standardized createQuestionRow function
	const index = questionList.children.length; // 0-based index

	// Construct a question object if we don't have one (for old format calls)
	let qObj =
		typeof questionObj === 'object'
			? questionObj
			: {
					question: questionObj, // Assuming questionObj is the question string in old format
					options: arguments[1],
					answer: arguments[2],
					explanation: arguments[3] || '',
					image: arguments[4] || '',
					isDraggable: arguments[5],
					type: arguments[5] ? 'draggable' : 'multiple-choice', // isDraggable is arguments[5]
					allowMultipleAnswers: false,
					category: '',
					difficulty: 'medium',
			  };

	// Ensure isDraggable is boolean and type is correctly set based on it
	qObj.isDraggable =
		typeof qObj.isDraggable === 'string'
			? qObj.isDraggable === 'true'
			: Boolean(qObj.isDraggable);
	qObj.type = normalizeQuestionTypeForStorage(qObj.type, qObj);

	console.log('Adding question to list:', qObj.question, 'type:', qObj.type);

	const row = createQuestionRow(qObj, index);
	questionList.appendChild(row);

	// Add click event listener to the image after adding to DOM
	const thumbnail = row.querySelector('.question-thumbnail');
	if (thumbnail) {
		thumbnail.addEventListener('click', () => openLightbox(image));
	}
}

function updateQuestionInTable(index, questionObj) {
	const questionList = document.getElementById('question-list');
	const rows = questionList.getElementsByTagName('tr');

	if (index >= 0 && index < rows.length) {
		const row = rows[index];

		// Handle both old and new formats
		let question, options, answer, explanation, image, isDraggable, type;

		if (typeof questionObj === 'object' && questionObj.question) {
			// New format - object with properties
			question = questionObj.question;
			options = questionObj.options;
			answer = questionObj.answer;
			explanation = questionObj.explanation || '';
			image = questionObj.image || '';
			isDraggable = questionObj.isDraggable;
			type =
				questionObj.type || (isDraggable ? 'draggable' : 'multiple-choice');
		} else {
			// Old format - individual parameters
			question = questionObj;
			options = arguments[2];
			answer = arguments[3];
			explanation = arguments[4] || '';
			image = arguments[5] || '';
			isDraggable = arguments[6];
			type = isDraggable ? 'draggable' : 'multiple-choice';
		}

		// Convert isDraggable to boolean if it's a string
		const isDraggableBool =
			typeof isDraggable === 'string'
				? isDraggable === 'true'
				: Boolean(isDraggable);

		console.log('Updating question in table:', question, 'type:', type);

		// Update data attributes
		row.setAttribute('data-question', question);
		row.setAttribute(
			'data-options',
			Array.isArray(options) ? options.join(',') : options
		);
		row.setAttribute('data-answer', answer);
		row.setAttribute('data-explanation', explanation || '');
		row.setAttribute('data-image', image || '');
		row.setAttribute('data-is-draggable', isDraggableBool);
		type = normalizeQuestionTypeForStorage(type, questionObj);
		row.setAttribute('data-type', type);
		row.setAttribute(
			'data-allow-multiple-answers',
			typeof questionObj === 'object' ? questionObj.allowMultipleAnswers : false
		);

		// Update category and difficulty attributes
		if (typeof questionObj === 'object') {
			const categoryId = questionObj.category || '';
			row.setAttribute('data-category', categoryId);
			row.setAttribute('data-difficulty', questionObj.difficulty || 'medium');

			// Update visual class for categorized vs uncategorized
			if (categoryId) {
				row.classList.add('categorized');
				row.classList.remove('uncategorized');
			} else {
				row.classList.add('uncategorized');
				row.classList.remove('categorized');
			}
		}

		// Update visible content with merged question column using reusable function
		// cells[0] = checkbox, cells[1] = #, cells[2] = Question, cells[3] = Options, cells[4] = Image, cells[5] = Points, cells[6] = Answer, cells[7] = Actions
		row.cells[2].innerHTML = `<div class="question-content-text">${renderQuestionContent(
			question,
			questionObj,
			type,
			options,
			image,
			true,
			false
		)}</div>`;
		row.cells[3].innerHTML = Array.isArray(options)
			? options
					.map((opt) => `<span class="option-badge">${escapeHtml(opt)}</span>`)
					.join('')
			: options
					.split(',')
					.map(
						(opt) =>
							`<span class="option-badge">${escapeHtml(opt.trim())}</span>`
					)
					.join('');
		row.cells[4].innerHTML = image
			? `<img src="${escapeHtml(image)}"
                alt="Question image"
                class="question-thumbnail"
                onclick="openLightbox('${escapeHtml(image)}')"
                style="max-width: 80px; max-height: 60px; cursor: pointer; border-radius: 4px; object-fit: cover;">
            `
			: '<span class="text-muted">-</span>';
		row.cells[5].innerHTML = `<span class="points-badge">${escapeHtml(String(questionObj.points || 1))} pts</span>`;
		row.cells[6].innerHTML = formatCorrectAnswers({
			type,
			answer,
			allowMultipleAnswers:
				typeof questionObj === 'object'
					? questionObj.allowMultipleAnswers
					: false,
			isDraggable: isDraggable,
		});

		console.log(
			'Updated row with answer:',
			answer,
			'allowMultipleAnswers:',
			questionObj.allowMultipleAnswers
		);

		// Add click event listener to the new image
		const thumbnail = row.querySelector('.question-thumbnail');
		if (thumbnail) {
			thumbnail.addEventListener('click', () => openLightbox(image));
		}

		// Update the questions array in localStorage
		const savedQuestions = JSON.parse(
			localStorage.getItem('quizQuestions') || '[]'
		);
		if (savedQuestions[index]) {
			const existing = savedQuestions[index];
			savedQuestions[index] = {
				question: questionObj.question,
				options: questionObj.options,
				optionData: questionObj.optionData,
				answer: questionObj.answer,
				explanation: questionObj.explanation || '',
				image: questionObj.image || '',
				isDraggable: questionObj.isDraggable,
				type: questionObj.type,
				allowMultipleAnswers: questionObj.allowMultipleAnswers || false,
				category: questionObj.category || '',
				difficulty: questionObj.difficulty || 'medium',
				useWordBank: questionObj.useWordBank || false,
				instruction: questionObj.instruction || '',
				points: questionObj.points || 1,
				id: existing.id || questionObj.id || generateUUID(),
				ownerId: existing.ownerId || questionObj.ownerId || window.Auth?.getCurrentUser?.()?.id || '',
			};
			localStorage.setItem('quizQuestions', JSON.stringify(savedQuestions));
			console.log('Updated question in localStorage:', savedQuestions[index]);
		}
	}
}

// Make functions globally available
window.createQuestionRow = createQuestionRow;
window.formatCorrectAnswers = formatCorrectAnswers;
window.openCategoryAssignmentModal = openCategoryAssignmentModal;
window.renderQuestionContent = renderQuestionContent;
window.escapeHtml = escapeHtml;
window.setMainTypeFilter = setMainTypeFilter;
window.closeCategoryAssignmentModal = closeCategoryAssignmentModal;
window.saveCategoryAssignment = saveCategoryAssignment;

function editQuestionByRow(button) {
	const row = button.closest('tr');
	editIndex = Array.from(row.parentNode.children).indexOf(row);

	// Get the question data from localStorage for complete information including option images
	const savedQuestions = JSON.parse(
		localStorage.getItem('quizQuestions') || '[]'
	);
	const questions = savedQuestions || [];
	const questionIndex = Array.from(row.parentNode.children).indexOf(row);

	let question;

	if (questions[questionIndex]) {
		// Use the full question object from localStorage
		question = questions[questionIndex];
		console.log(
			'Loaded question with option data from localStorage:',
			question
		);
	} else {
		// Fallback to data attributes if not found in localStorage
		question = {
			question: row.getAttribute('data-question'),
			options: row.getAttribute('data-options').split(','),
			answer: row.getAttribute('data-answer'),
			explanation: row.getAttribute('data-explanation'),
			image: row.getAttribute('data-image'),
			isDraggable: row.getAttribute('data-is-draggable') === 'true',
			type: row.getAttribute('data-type') || 'multiple-choice',
		};
		console.log(
			'Loaded question from data attributes (no option images):',
			question
		);
	}

	// Open the modal FIRST before trying to access form elements
	const modal = document.getElementById('questionFormModal');
	if (modal) {
		// Prevent double opening if already open/opening
		if (modal.classList.contains('active') || modal.style.display === 'flex') {
			// If already open, just repopulate
			populateEditForm(question);
			return;
		}

		modal.style.display = 'flex';
		// Add class in next frame for animation
		requestAnimationFrame(() => {
			modal.classList.add('active');
		});
	}

	// Wait for modal to be ready, then populate form
	setTimeout(() => {
		populateEditForm(question);
	}, 50);
}

// Separate function to populate the form after modal is open
function populateEditForm(question) {
	// Fill the form with question data
	const questionElement = document.getElementById('question');
	if (questionElement) {
		questionElement.value = question.question;
	}

	const optionsElement = document.getElementById('options');
	if (optionsElement) {
		optionsElement.value = question.options.join(',');
	}

	const explanationElement = document.getElementById('explanation');
	if (explanationElement) {
		explanationElement.value = question.explanation;
	}

	const pointsElement = document.getElementById('points');
	if (pointsElement) {
		pointsElement.value = question.points || 1;
	}

	// Populate the options list with option data if available
	if (question.optionData && question.optionData.length) {
		// Store option data in the options field
		const optionsField = document.getElementById('options');
		if (optionsField) {
			optionsField.dataset.optionData = JSON.stringify(question.optionData);
		}

		// Populate the options list with the option data
		populateOptionsList(question.optionData);
	} else if (question.options && question.options.length) {
		// Fallback to simple options
		populateOptionsList(question.options.join(','));
	}

	// Set the answer based on question type
	// First, ensure the correct radio button is checked and UI is updated
	if (question.type) {
		// Construct ID based on convention typeMultipleChoice, typeFillBlank, etc.
		const typeId =
			'type' +
			question.type
				.split('-')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join('');

		console.log(
			'Attempting to switch UI to:',
			question.type,
			'using ID:',
			typeId
		);

		const radio = document.getElementById(typeId);
		if (radio) {
			radio.checked = true;
			// Also update the global variable
			if (typeof currentQuestionType !== 'undefined')
				currentQuestionType = question.type;
			if (window.currentQuestionType)
				window.currentQuestionType = question.type;

			// Trigger UI update
			if (typeof toggleQuestionType === 'function') {
				console.log('Calling toggleQuestionType()...');
				toggleQuestionType();
			}

			// Dispatch event as backup
			radio.dispatchEvent(new Event('change', { bubbles: true }));
		} else {
			console.warn('Radio button for type not found:', typeId);
			// Fallback: search by value
			const radios = document.getElementsByName('questionType');
			for (const r of radios) {
				if (r.value === question.type) {
					r.checked = true;
					if (typeof toggleQuestionType === 'function') toggleQuestionType();
					r.dispatchEvent(new Event('change', { bubbles: true }));
					break;
				}
			}
		}
	}

	if (question.type === 'true-false') {
		setTrueFalseOptions(question.answer);
	} else if (question.type === 'draggable') {
		const answerElement = document.getElementById('answer');
		if (answerElement) {
			answerElement.value = question.answer;
			answerElement.classList.remove('hidden');
		}
	} else if (question.type === 'odd-one-out') {
		const answerElement = document.getElementById('answer-select-ooo');
		if (answerElement) {
			// Populate the options list with support for images
			const optionsList = document.getElementById('selected-options-list');
			if (optionsList) {
				optionsList.innerHTML = '';

				// Check if we have rich option data (with images)
				let optionData = [];
				if (question.optionData) {
					optionData = question.optionData;
				} else {
					// Backward compatibility or simple text options
					optionData = question.options.map((opt) => {
						if (
							typeof opt === 'string' &&
							opt.startsWith('img_') &&
							window.imageOptionMap &&
							window.imageOptionMap[opt]
						) {
							const imgData = window.imageOptionMap[opt];
							return {
								text: opt,
								image: imgData.image,
								id: opt,
								number: imgData.number,
								isImageOnly: true,
							};
						}
						return { text: opt, image: '' };
					});
				}

				optionData.forEach((opt) => {
					const optionItem = document.createElement('div');
					const isImage = opt.image || (opt.isImageOnly && opt.image);

					optionItem.className = isImage
						? 'selected-option-item image-only'
						: 'selected-option-item';

					if (isImage) {
						optionItem.dataset.image = opt.image;
						optionItem.dataset.imageId = opt.id || '';
						optionItem.dataset.imageNumber = opt.number || '';
						optionItem.dataset.isImageOnly = 'true';

						optionItem.innerHTML = `
                            <img src="${
															opt.image
														}" class="option-thumbnail" alt="Option image" onclick="openLightbox('${
							opt.image
						}')">
                            <span></span>
                            <div class="image-number">Image ${
															opt.number || '?'
														}</div>
                            <button type="button" class="remove-btn" onclick="removeOption(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        `;
					} else {
						optionItem.innerHTML = `
                            <span>${opt.text || opt}</span>
                            <button type="button" class="remove-btn" onclick="removeOption(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        `;
					}
					optionsList.appendChild(optionItem);
				});
			}

			// Update the hidden options field and select dropdowns
			updateOptionsField();

			// Store the current answer value for restoration
			answerElement.setAttribute('data-current-value', question.answer);

			// Set the selected value
			answerElement.value = question.answer;
			answerElement.classList.remove('hidden');
			// Trigger change event to update preview
			answerElement.dispatchEvent(new Event('change'));
		}
	} else if (question.type === 'fill-blank') {
		const answerElement = document.getElementById('fill-blank-answer');
		if (answerElement) {
			answerElement.value = question.answer;
		}

		// Populate fill-blank-statement field
		const fillBlankStatement = document.getElementById('fill-blank-statement');
		if (fillBlankStatement) {
			fillBlankStatement.value = question.question || '';
			// Trigger blank detection
			if (typeof detectAndUpdateBlanks === 'function') {
				detectAndUpdateBlanks();
			}
		}

		// Populate new fields
		const useWordBankCheckbox = document.getElementById('use-word-bank');
		if (useWordBankCheckbox) {
			useWordBankCheckbox.checked = question.useWordBank || false;
			if (typeof toggleWordBank === 'function') {
				toggleWordBank();
			}
		}

		// Populate instruction
		const instructionElement = document.getElementById('instruction');
		if (instructionElement) {
			instructionElement.value = question.instruction || '';
		}

		// Populate options for fill-blank (previously distractors)
		if (question.type === 'fill-blank') {
			const optionsElement = document.getElementById('options');
			if (optionsElement) {
				// If we have options (new format), use them
				if (question.options && question.options.length > 0) {
					optionsElement.value = question.options.join(', ');
				}
				// Backward compatibility: if we have distractors but no options, use distractors
				else if (question.distractors && question.distractors.length > 0) {
					optionsElement.value = question.distractors.join(', ');
				} else {
					optionsElement.value = '';
				}
			}
		}
	} else {
		// multiple-choice
		console.log('Editing multiple choice question:', question);

		// Check if this question allows multiple answers
		const allowMultipleCheckbox = document.getElementById(
			'allow-multiple-answers'
		);
		if (allowMultipleCheckbox) {
			console.log(
				'Setting allowMultipleAnswers checkbox to:',
				question.allowMultipleAnswers || false
			);
			allowMultipleCheckbox.checked = question.allowMultipleAnswers || false;

			// Toggle the appropriate containers
			const singleAnswerContainer = document.getElementById(
				'text-answer-select-wrapper'
			);
			const multipleAnswersContainer = document.getElementById(
				'multiple-answers-container'
			);

			// Ensure containers exist before manipulating them
			if (!singleAnswerContainer || !multipleAnswersContainer) {
				console.warn(
					'Answer containers not found in DOM. Modal may not be open yet.'
				);
				// Try to open modal first if it's not open
				if (typeof openQuestionFormModal === 'function') {
					openQuestionFormModal(question);
					// Wait a bit for DOM to update, then retry
					setTimeout(() => {
						const retrySingle = document.getElementById(
							'text-answer-select-wrapper'
						);
						const retryMultiple = document.getElementById(
							'multiple-answers-container'
						);
						if (retrySingle && retryMultiple) {
							if (question.allowMultipleAnswers) {
								retrySingle.classList.add('hidden');
								retryMultiple.classList.remove('hidden');
							} else {
								retrySingle.classList.remove('hidden');
								retryMultiple.classList.add('hidden');
							}
						}
					}, 100);
				}
				return; // Exit early if containers don't exist
			}

			// Populate the options list with support for images
			const optionsList = document.getElementById('selected-options-list');
			if (optionsList) {
				optionsList.innerHTML = '';

				// Check if we have rich option data (with images)
				let optionData = [];
				if (question.optionData) {
					optionData = question.optionData;
				} else {
					// Backward compatibility or simple text options
					optionData = question.options.map((opt) => {
						if (
							typeof opt === 'string' &&
							opt.startsWith('img_') &&
							window.imageOptionMap &&
							window.imageOptionMap[opt]
						) {
							const imgData = window.imageOptionMap[opt];
							return {
								text: opt,
								image: imgData.image,
								id: opt,
								number: imgData.number,
								isImageOnly: true,
							};
						}
						return { text: opt, image: '' };
					});
				}

				optionData.forEach((opt) => {
					const optionItem = document.createElement('div');
					const isImage = opt.image || (opt.isImageOnly && opt.image);

					optionItem.className = isImage
						? 'selected-option-item image-only'
						: 'selected-option-item';

					if (isImage) {
						optionItem.dataset.image = opt.image;
						optionItem.dataset.imageId = opt.id || '';
						optionItem.dataset.imageNumber = opt.number || '';
						optionItem.dataset.isImageOnly = 'true';

						optionItem.innerHTML = `
                            <div class="option-image-container">
                                <img src="${
																	opt.image
																}" class="option-thumbnail" alt="Option image" onclick="openLightbox('${
							opt.image
						}')">
                            </div>
                            <span></span>
                            <div class="image-number">Image ${
															opt.number || '?'
														}</div>
                            <button type="button" class="remove-btn" onclick="removeOption(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        `;
					} else {
						optionItem.innerHTML = `
                            <span>${opt.text || opt}</span>
                            <button type="button" class="remove-btn" onclick="removeOption(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        `;
					}
					optionsList.appendChild(optionItem);
				});
			}

			// Update the hidden options field and select dropdowns
			updateOptionsField();

			if (question.allowMultipleAnswers) {
				console.log(
					'Question allows multiple answers, showing multiple answers container'
				);
				if (singleAnswerContainer) {
					singleAnswerContainer.classList.add('hidden');
				}
				if (multipleAnswersContainer) {
					multipleAnswersContainer.classList.remove('hidden');
				}

				// Populate checkboxes with the correct answers
				const answers = question.answer.split(',').map((ans) => ans.trim());
				populateMultipleAnswersCheckboxes(question.options, answers);
			} else {
				console.log(
					'Question does not allow multiple answers, showing single answer container'
				);
				if (singleAnswerContainer) {
					singleAnswerContainer.classList.remove('hidden');
				}
				if (multipleAnswersContainer) {
					multipleAnswersContainer.classList.add('hidden');
				}

				// Set the single answer dropdown
				const answerElement = document.getElementById('answer-select-mc');
				if (answerElement) {
					answerElement.value = question.answer;
					answerElement.classList.remove('hidden');
					// Trigger change event to update preview
					answerElement.dispatchEvent(new Event('change'));
				}
			}
		} else {
			// Fallback to single answer if checkbox not found
			const answerElement = document.getElementById('answer-select-mc');
			if (answerElement) {
				// Populate the options list with support for images
				const optionsList = document.getElementById('selected-options-list');
				if (optionsList) {
					optionsList.innerHTML = '';

					// Check if we have rich option data (with images)
					let optionData = [];
					if (question.optionData) {
						optionData = question.optionData;
					} else {
						// Backward compatibility or simple text options
						optionData = question.options.map((opt) => {
							return { text: opt, image: '' };
						});
					}

					optionData.forEach((opt) => {
						const optionItem = document.createElement('div');
						const isImage = opt.image || (opt.isImageOnly && opt.image);

						optionItem.className = isImage
							? 'selected-option-item image-only'
							: 'selected-option-item';

						if (isImage) {
							optionItem.dataset.image = opt.image;
							optionItem.dataset.imageId = opt.id || '';
							optionItem.dataset.imageNumber = opt.number || '';
							optionItem.dataset.isImageOnly = 'true';

							optionItem.innerHTML = `
                                <img src="${
																	opt.image
																}" class="option-thumbnail" alt="Option image" onclick="openLightbox('${
								opt.image
							}')">
                                <span></span>
                                <div class="image-number">Image ${
																	opt.number || '?'
																}</div>
                                <button type="button" class="remove-btn" onclick="removeOption(this)">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            `;
						} else {
							optionItem.innerHTML = `
                                <span>${opt.text || opt}</span>
                                <button type="button" class="remove-btn" onclick="removeOption(this)">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            `;
						}
						optionsList.appendChild(optionItem);
					});
				}

				// Update the hidden options field and select dropdowns
				updateOptionsField();

				// Set the selected value
				answerElement.value = question.answer;
				answerElement.classList.remove('hidden');
				// Trigger change event to update preview
				answerElement.dispatchEvent(new Event('change'));
			}
		}
	}

	// Set the appropriate question type radio button
	const typeRadios = document.getElementsByName('questionType');
	for (const radio of typeRadios) {
		if (radio.value === question.type) {
			radio.checked = true;
			break;
		}
	}

	// Ensure code-answer-mode is set BEFORE calling toggleQuestionType
	if (question.type === 'code') {
		const codeSnippetEl = document.getElementById('code-snippet');
		if (codeSnippetEl) codeSnippetEl.value = question.codeSnippet || '';
		const codeLanguageEl = document.getElementById('code-language');
		if (codeLanguageEl) codeLanguageEl.value = question.codeLanguage || 'javascript';
		const codeAnswerModeEl = document.getElementById('code-answer-mode');
		if (codeAnswerModeEl) {
			codeAnswerModeEl.value = question.codeAnswerMode || 'multiple-choice';
		}
	}

	// Call toggleQuestionType to show the appropriate form based on the loaded type
	if (typeof toggleQuestionType === 'function') {
		console.log('Populating edit form: Triggering dynamic UI update for type:', question.type);
		toggleQuestionType();
	}


	// Handle image preview
	if (question.image) {
		currentImageData = question.image;
		const previewContainer = document.querySelector('.image-preview-container');
		const previewImage = document.getElementById('image-preview');
		previewImage.src = question.image;
		previewContainer.classList.remove('hidden');
	} else {
		currentImageData = '';
		const previewContainer = document.querySelector('.image-preview-container');
		if (previewContainer) {
			previewContainer.classList.add('hidden');
		}
	}

	// Update UI to show we're editing
	const actionText = document.getElementById('question-action-text');
	const updateBtn = document.getElementById('add-update-question-btn');
	const cancelBtn = document.getElementById('cancel-edit-btn');

	if (actionText) actionText.textContent = 'Edit Question';
	if (updateBtn) updateBtn.textContent = 'Update Question';
	if (cancelBtn) cancelBtn.classList.remove('hidden');

	// Scroll to the form
	setTimeout(() => {
		const questionElement = document.getElementById('question');
		if (questionElement) {
			questionElement.scrollIntoView({ behavior: 'smooth' });
		}
	}, 100);
}

function cancelEdit() {
	editIndex = -1;
	document.getElementById('question-action-text').textContent = 'Add Question';
	document.getElementById('add-update-question-btn').textContent =
		'Add Question';
	document.getElementById('cancel-edit-btn').classList.add('hidden');
	clearQuestionForm();
	updateQuestionList();
}

function removeQuestionByRow(button) {
	if (!confirm('Are you sure you want to delete this question?')) return;

	const row = button.closest('tr');
	row.remove();

	// Reorder remaining question numbers
	const questionList = document.getElementById('question-list');
	Array.from(questionList.children).forEach((row, index) => {
		row.cells[0].textContent = index + 1;
	});

	// Save changes
	if (typeof saveSettings === 'function') {
		saveSettings();
	} else if (typeof saveSettingsForm === 'function') {
		saveSettingsForm();
	}
	showToast('Question removed successfully!');

	// Broadcast Updates if enabled
	if (document.getElementById('setting-broadcastUpdates')?.checked) {
		console.log('Broadcast Updates enabled, triggering sync after deletion...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
}

// Bulk Delete Functions
function toggleBulkQuestionSelection(checkbox) {
	try {
		console.log('toggleBulkQuestionSelection called', checkbox.checked);
		const row = checkbox.closest('tr');
		if (!row) {
			console.error('Row not found for checkbox');
			return;
		}
		if (checkbox.checked) {
			row.classList.add('question-row-selected');
		} else {
			row.classList.remove('question-row-selected');
		}
		console.log('About to call updateBulkDeleteButtons');
		updateBulkDeleteButtons();
		console.log('updateBulkDeleteButtons called successfully');
	} catch (error) {
		console.error('Error in toggleBulkQuestionSelection:', error);
	}
}
// Make function globally accessible
window.toggleBulkQuestionSelection = toggleBulkQuestionSelection;

function updateBulkDeleteButtons() {
	try {
		const checkedBoxes = document.querySelectorAll(
			'.question-checkbox:checked'
		);
		const bulkActionsContainer = document.getElementById(
			'bulk-actions-container'
		);
		const countSpan = document.getElementById('selected-count');
		const selectAllCheckbox = document.getElementById('selectAllQuestions');
		const checkboxes = document.querySelectorAll('.question-checkbox');
		const editBtn = document.getElementById('bulk-edit-btn');
		const addBtn = document.getElementById('add-question-btn');

		const selectedCount = checkedBoxes.length;

		// Update count
		if (countSpan) {
			countSpan.textContent = selectedCount;
		}

		// Toggle container visibility
		if (bulkActionsContainer) {
			if (selectedCount > 0) {
				bulkActionsContainer.classList.remove('hidden');
				if (addBtn) addBtn.style.display = 'none'; // Hide Add button
			} else {
				bulkActionsContainer.classList.add('hidden');
				if (addBtn) addBtn.style.display = ''; // Show Add button
			}
		}

		// Show/hide edit button on mobile when exactly one question is selected
		// Hide if any row is expanded on mobile
		if (editBtn) {
			const hasExpandedRow = document.querySelector(
				'#question-list tr.expanded'
			);
			const isMobile = window.innerWidth <= 768;

			if (selectedCount === 1 && isMobile && !hasExpandedRow) {
				editBtn.classList.remove('hidden');
			} else {
				editBtn.classList.add('hidden');
			}
		}

		// Also update on window resize
		if (typeof window.updateBulkDeleteButtonsOnResize === 'undefined') {
			let resizeTimeout;
			window.addEventListener('resize', () => {
				clearTimeout(resizeTimeout);
				resizeTimeout = setTimeout(() => {
					if (
						document.querySelectorAll('.question-checkbox:checked').length > 0
					) {
						updateBulkDeleteButtons();
					}
				}, 100);
			});
			window.updateBulkDeleteButtonsOnResize = true;
		}

		// Update select all checkbox state
		if (selectAllCheckbox) {
			selectAllCheckbox.checked =
				checkboxes.length > 0 && selectedCount === checkboxes.length;
			selectAllCheckbox.indeterminate =
				selectedCount > 0 && selectedCount < checkboxes.length;
		}
	} catch (e) {
		console.error('Error updating bulk buttons:', e);
	}
}

// Function to edit question by index
function editQuestion(index) {
	const questionList = document.getElementById('question-list');
	const rows = questionList.getElementsByTagName('tr');

	if (index >= 0 && index < rows.length) {
		const row = rows[index];
		const editButton = row.querySelector('.exam-edit-btn');
		if (editButton) {
			editQuestionByRow(editButton);
		} else {
			// Fallback: create a mock button element
			const mockButton = document.createElement('button');
			mockButton.closest = () => row;
			editQuestionByRow(mockButton);
		}
	}
}

// Function to edit the selected question (mobile toolbar)
function editSelectedQuestion() {
	const checkedBoxes = document.querySelectorAll('.question-checkbox:checked');
	if (checkedBoxes.length !== 1) {
		return;
	}

	const checkbox = checkedBoxes[0];
	const row = checkbox.closest('tr');
	if (!row) {
		return;
	}

	// Get the index from the checkbox data attribute
	const index = parseInt(checkbox.getAttribute('data-index'));
	if (isNaN(index)) {
		// Fallback: find index by row position
		const questionList = document.getElementById('question-list');
		const rows = Array.from(questionList.children);
		const questionIndex = rows.indexOf(row);
		if (questionIndex >= 0) {
			editQuestion(questionIndex);
		}
	} else {
		editQuestion(index);
	}

	// Uncheck the checkbox after editing
	checkbox.checked = false;
	updateBulkDeleteButtons();
}

function toggleBulkSelectAll(checkbox) {
	const questionCheckboxes = document.querySelectorAll('.question-checkbox');
	questionCheckboxes.forEach((cb) => {
		cb.checked = checkbox.checked;
		const row = cb.closest('tr');
		if (row) {
			// Check if row exists
			if (checkbox.checked) {
				row.classList.add('question-row-selected');
			} else {
				row.classList.remove('question-row-selected');
			}
		}
	});
	updateBulkDeleteButtons();
}

function selectAllBulkQuestions() {
	const questionCheckboxes = document.querySelectorAll('.question-checkbox');
	questionCheckboxes.forEach((cb) => {
		cb.checked = true;
		const row = cb.closest('tr');
		if (row) {
			// Check if row exists
			row.classList.add('question-row-selected');
		}
	});
	updateBulkDeleteButtons();
}

function deselectAllBulkQuestions() {
	const questionCheckboxes = document.querySelectorAll('.question-checkbox');
	questionCheckboxes.forEach((cb) => {
		cb.checked = false;
		const row = cb.closest('tr');
		if (row) {
			// Check if row exists
			row.classList.remove('question-row-selected');
		}
	});
	updateBulkDeleteButtons();
}

function deleteBulkSelectedQuestions() {
	const checkedBoxes = document.querySelectorAll('.question-checkbox:checked');
	const selectedCount = checkedBoxes.length;

	if (selectedCount === 0) {
		return;
	}

	// Confirm deletion
	if (
		!confirm(
			`Are you sure you want to delete ${selectedCount} question(s)? This action cannot be undone.`
		)
	) {
		return;
	}

	// Get indices of selected questions
	const indicesToDelete = Array.from(checkedBoxes).map((cb) =>
		parseInt(cb.dataset.index)
	);

	// Sort indices in descending order to delete from end to start
	indicesToDelete.sort((a, b) => b - a);

	// Get current questions
	let questions = JSON.parse(localStorage.getItem('quizQuestions')) || [];

	// Delete questions
	indicesToDelete.forEach((index) => {
		questions.splice(index, 1);
	});

	// Save updated questions
	localStorage.setItem('quizQuestions', JSON.stringify(questions));

	// Update Dashboard if available
	if (window.initDashboard) {
		window.initDashboard();
	}

	// Show success message
	showToast(`Successfully deleted ${selectedCount} question(s)`);

	// Refresh the question list
	updateQuestionList();

	// Reset bulk actions
	updateBulkDeleteButtons();

	// Broadcast Updates if enabled
	if (document.getElementById('setting-broadcastUpdates')?.checked) {
		console.log('Broadcast Updates enabled, triggering sync after bulk delete...');
		if (window.syncQuestionsToClients) window.syncQuestionsToClients();
	}
}

// Make all bulk delete functions globally accessible
window.toggleBulkSelectAll = toggleBulkSelectAll;
window.selectAllBulkQuestions = selectAllBulkQuestions;
window.deselectAllBulkQuestions = deselectAllBulkQuestions;
window.deleteBulkSelectedQuestions = deleteBulkSelectedQuestions;
window.updateBulkDeleteButtons = updateBulkDeleteButtons;

// Variable to store current option image
// Variable to store current option image (already declared at top)
// let currentOptionImageData = '';

// Function to switch between text and image option tabs
function switchOptionTab(tabName) {
	// Update tab buttons
	document.querySelectorAll('.option-tab').forEach((tab) => {
		tab.classList.toggle('active', tab.dataset.tab === tabName);
	});

	// Update tab content
	document
		.getElementById('text-option-tab')
		.classList.toggle('active', tabName === 'text');
	document
		.getElementById('image-option-tab')
		.classList.toggle('active', tabName === 'image');

	// Reset inputs
	const optionInput = document.getElementById('option-input');
	if (optionInput) optionInput.value = '';

	// Reset image upload
	removeOptionImage();
	const optionImageInput = document.getElementById('option-image');
	if (optionImageInput) optionImageInput.value = '';
}

// Function to handle option image upload
function handleOptionImageUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	if (!file.type.match('image.*')) {
		showToast('Please select an image file');
		return;
	}

	const reader = new FileReader();
	reader.onload = function (e) {
		currentOptionImageData = e.target.result;

		// Show a brief preview
		const previewContainer = document.getElementById(
			'option-image-preview-container'
		);
		const previewImage = document.getElementById('option-image-preview');

		previewImage.src = currentOptionImageData;
		previewContainer.classList.remove('hidden');

		// Automatically add the image option after a brief delay to show preview
		setTimeout(() => {
			addImageOption();
			// Hide the preview after adding
			previewContainer.classList.add('hidden');
		}, 500);
	};
	reader.readAsDataURL(file);
}

// Function to remove option image
function removeOptionImage() {
	currentOptionImageData = '';
	const previewContainer = document.getElementById(
		'option-image-preview-container'
	);
	if (previewContainer) {
		previewContainer.classList.add('hidden');
	}

	// Disable the Add Image Option button
	const addImageBtn = document.querySelector('.image-only-add');
	if (addImageBtn) {
		addImageBtn.disabled = true;
	}
}

// Function to add an image-only option
function addImageOption() {
	if (!currentOptionImageData) {
		showToast('Please upload an image first');
		return;
	}

	const optionsList = document.getElementById('selected-options-list');
	console.log('Options list found:', optionsList);

	// Create a unique identifier for this image option
	const imageId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

	// Get the image number for display (legacy support)
	const imageNumber =
		document.querySelectorAll('.selected-option-item.image-only').length + 1;

	// Create option object with empty text and image
	const optionObj = {
		text: `image-${imageNumber}`,
		image: currentOptionImageData,
		id: imageId, // Store the ID for reference
		number: imageNumber, // Store the image number
	};

	// Create option item element
	const optionItem = document.createElement('div');
	optionItem.className = 'selected-option-item image-only';

	// Store the image data, ID and number as data attributes
	optionItem.dataset.image = currentOptionImageData;
	optionItem.dataset.imageId = imageId;
	optionItem.dataset.imageNumber = imageNumber;
	optionItem.dataset.isImageOnly = 'true';

	optionItem.innerHTML = `
        <div class="option-image-container">
            <img src="${currentOptionImageData}" class="option-thumbnail" alt="Option image" onclick="openLightbox('${currentOptionImageData}')">
        </div>
        <span></span>
        <div class="image-number">Image ${imageNumber}</div>
        <button type="button" class="remove-btn" onclick="removeOption(this)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;

	optionsList.appendChild(optionItem);

	// Reset option image
	removeOptionImage();

	// Update the hidden options field
	updateOptionsField();

	// If in draggable mode, add to draggable container
	if (currentQuestionType === 'draggable') {
		// For draggable questions, we need to populate the draggable container with all current options
		const optionsList = document.getElementById('selected-options-list');
		if (optionsList && optionsList.children.length > 0) {
			const options = Array.from(optionsList.children)
				.map(
					(item) =>
						item.textContent || item.querySelector('span')?.textContent || ''
				)
				.filter((option) => option.trim() !== '');

			if (options.length > 0) {
				populateDraggableAnswerContainer(options.join(','));
			}
		}
	}

	// If in draggable mode, make the new option draggable
	if (optionsList.classList.contains('draggable-mode')) {
		console.log('Adding draggable functionality to new image option');

		// Add handle to the new option
		const newItem = optionsList.lastElementChild;
		if (newItem) {
			// Add handle
			const handle = document.createElement('div');
			handle.className = 'handle';
			handle.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
            `;
			newItem.insertBefore(handle, newItem.firstChild);

			// Make draggable
			newItem.setAttribute('draggable', 'true');

			// Add drag event listeners
			newItem.addEventListener('dragstart', handleOptionsItemDragStart);
			newItem.addEventListener('dragend', handleOptionsItemDragEnd);

			console.log('Added draggable functionality to new image option');
		}
	}

	// Add click handlers to option thumbnails
	addImagePreviewHandlers();
}

// Function to add click handlers to option thumbnails
function addImagePreviewHandlers() {
	// Add click handlers to all option thumbnails
	const thumbnails = document.querySelectorAll(
		'#selected-options-list .option-thumbnail'
	);
	thumbnails.forEach((thumbnail) => {
		thumbnail.addEventListener('click', function () {
			// Get the image source
			const src = this.getAttribute('src');
			if (src) {
				// Show the image in a modal
				openLightbox(src);
			}
		});
	});
}

// Function to add an option to the list
function addOption(event) {
	if (event) {
		event.preventDefault();
		event.stopPropagation();
	}
	console.log('Adding option');
	console.log(
		'Current question type:',
		currentQuestionType,
		'Window type:',
		window.currentQuestionType
	);
	const optionInput = document.getElementById('option-input');
	const option = optionInput.value.trim();

	if (!option) {
		showToast('Please enter an option');
		return;
	}

	// Check for duplicates
	const existingOptions = Array.from(
		document.querySelectorAll(
			'#selected-options-list .selected-option-item span'
		)
	).map((span) => span.textContent);

	if (existingOptions.includes(option)) {
		showToast('This option already exists');
		optionInput.focus();
		return;
	}

	const optionsList = document.getElementById('selected-options-list');
	console.log('Options list found:', optionsList);
	console.log(
		'Is in draggable mode:',
		optionsList.classList.contains('draggable-mode')
	);

	// Create option object with text and image
	const optionObj = {
		text: option,
		image: currentOptionImageData,
	};

	// Create option item element
	const optionItem = document.createElement('div');
	optionItem.className = currentOptionImageData
		? 'selected-option-item with-image'
		: 'selected-option-item';

	// Add image thumbnail if available
	let imageHtml = '';
	if (currentOptionImageData) {
		imageHtml = `<div class="option-image-container" onclick="openLightbox('${currentOptionImageData}')">
            <img src="${currentOptionImageData}" class="option-thumbnail" alt="Option image">
            <div class="image-overlay">Image</div>
        </div>`;
		// Store the image data as a data attribute
		optionItem.dataset.image = currentOptionImageData;
	}

	optionItem.innerHTML = `
        ${imageHtml}
        <span>${escapeHtml(option)}</span>
        <button type="button" class="remove-btn" onclick="removeOption(this)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;

	optionsList.appendChild(optionItem);
	optionInput.value = '';
	optionInput.focus();

	// Reset option image
	removeOptionImage();

	// Update the hidden options field
	updateOptionsField();

	// Initialize the appropriate form based on question type
	if (currentQuestionType === 'draggable') {
		// For draggable questions, we need to populate the draggable container with all current options
		const optionsList = document.getElementById('selected-options-list');
		if (optionsList && optionsList.children.length > 0) {
			const options = Array.from(optionsList.children)
				.map(
					(item) =>
						item.textContent || item.querySelector('span')?.textContent || ''
				)
				.filter((option) => option.trim() !== '');

			if (options.length > 0) {
				populateDraggableAnswerContainer(options.join(','));
			}
		}
	} else if (currentQuestionType === 'matching-pairs') {
		// For matching pairs, reinitialize the matching interface
		const optionsList = document.getElementById('selected-options-list');
		if (optionsList && optionsList.children.length > 0) {
			const options = Array.from(optionsList.children)
				.map(
					(item) =>
						item.textContent || item.querySelector('span')?.textContent || ''
				)
				.filter((option) => option.trim() !== '');

			if (options.length > 0) {
				initializeMatchingPairs(options.join(','));
			}
		}
	} else if (currentQuestionType === 'odd-one-out') {
		// For odd-one-out, update the select dropdown
		const options = document.getElementById('options').value.trim();
		if (options) {
			updateOddOneOutSelect(options);
		}
	} else if (currentQuestionType === 'fill-blank') {
		// For fill-blank, we don't need to update any select dropdowns
		// Options are used as distractors for the word bank
		console.log('Fill-blank option added, no select dropdown update needed');
	} else {
		// For multiple choice, update the select dropdown
		const options = document.getElementById('options').value.trim();
		if (options) {
			updateMultipleChoiceSelect(options);
		}
	}

	// Add click handlers to option thumbnails
	addImagePreviewHandlers();
}

// Function to remove an option from the list
function removeOption(button) {
	const optionsList = document.getElementById('selected-options-list');
	const optionItem = button.parentElement;
	const optionText = optionItem.querySelector('span').textContent;
	console.log('Removing option:', optionText);

	// Check if this is an image-only option
	const isImageOnly = optionItem.classList.contains('image-only');
	const imageId = optionItem.dataset.imageId;
	const imageNumber = optionItem.dataset.imageNumber;

	// For image-only options, we need to use the formatted image number
	const formattedImageNumber = isImageOnly
		? `image-${imageNumber}`
		: optionText;
	console.log('Formatted image number:', formattedImageNumber);

	// Remove the option from the list
	optionItem.remove();

	// Update the hidden options field
	updateOptionsField();

	// Remove the option from all select dropdowns
	if (isImageOnly) {
		// For image-only options, use the formatted image number
		removeOptionFromAllSelects(formattedImageNumber);

		// Also try to remove by image ID (for backward compatibility)
		if (imageId) {
			removeOptionFromAllSelects(imageId);
		}
	} else {
		// For text options, use the text
		removeOptionFromAllSelects(optionText);
	}

	// Update the draggable container with current options
	if (currentQuestionType === 'draggable') {
		// Get the optionData from the options field to preserve image information
		const optionsField = document.getElementById('options');
		let optionData = [];

		if (optionsField && optionsField.dataset.optionData) {
			try {
				optionData = JSON.parse(optionsField.dataset.optionData);
				console.log('Using optionData for draggable container:', optionData);

				// Pass the option data to populate function
				if (optionData.length > 0) {
					// Create options string from optionData
					const optionsString = optionData.map((opt) => opt.text).join(',');
					populateDraggableAnswerContainer(optionsString, optionData);
				} else {
					// Clear the draggable container if no options left
					const draggableContainer = document.getElementById(
						'draggable-answer-container'
					);
					if (draggableContainer) {
						draggableContainer.innerHTML = '';
					}
				}
			} catch (e) {
				console.error('Error parsing optionData:', e);
				// Fallback to text-only approach
				const remainingOptions = Array.from(optionsList.children)
					.map(
						(item) =>
							item.textContent || item.querySelector('span')?.textContent || ''
					)
					.filter((option) => option.trim() !== '');

				if (remainingOptions.length > 0) {
					populateDraggableAnswerContainer(remainingOptions.join(','));
				} else {
					// Clear the draggable container if no options left
					const draggableContainer = document.getElementById(
						'draggable-answer-container'
					);
					if (draggableContainer) {
						draggableContainer.innerHTML = '';
					}
				}
			}
		} else {
			// Fallback: use text content from remaining options
			const remainingOptions = Array.from(optionsList.children)
				.map(
					(item) =>
						item.textContent || item.querySelector('span')?.textContent || ''
				)
				.filter((option) => option.trim() !== '');

			if (remainingOptions.length > 0) {
				populateDraggableAnswerContainer(remainingOptions.join(','));
			} else {
				// Clear the draggable container if no options left
				const draggableContainer = document.getElementById(
					'draggable-answer-container'
				);
				if (draggableContainer) {
					draggableContainer.innerHTML = '';
				}
			}
		}
	} else if (currentQuestionType === 'matching-pairs') {
		// For matching pairs, reinitialize with remaining options
		const remainingOptions = Array.from(optionsList.children)
			.map(
				(item) =>
					item.textContent || item.querySelector('span')?.textContent || ''
			)
			.filter((option) => option.trim() !== '');

		if (remainingOptions.length > 0) {
			initializeMatchingPairs(remainingOptions.join(','));
		} else {
			// Clear matching pairs if no options left
			const leftColumn = document.getElementById('left-column-items');
			const rightColumn = document.getElementById('right-column-items');
			const pairsList = document.getElementById('pairs-list');
			if (leftColumn) leftColumn.innerHTML = '';
			if (rightColumn) rightColumn.innerHTML = '';
			if (pairsList) pairsList.innerHTML = '';
			const answerField = document.getElementById('matching-answer');
			if (answerField) answerField.value = '';
		}
	} else if (currentQuestionType === 'odd-one-out') {
		const options = document.getElementById('options').value.trim();
		if (options) {
			updateOddOneOutSelect(options);
		}
	} else {
		const options = document.getElementById('options').value.trim();
		if (options) {
			updateMultipleChoiceSelect(options);
		}
	}

	// Update the appropriate answer field based on the question type
	if (currentQuestionType === 'draggable') {
		// Update the indices and the answer field
		if (typeof updateDraggableAnswer === 'function') {
			updateDraggableAnswer();
		}
	}
}

// Function to remove an option from all select dropdowns
function removeOptionFromAllSelects(optionText) {
	// List of all select elements that might contain options
	const selectElements = [
		document.getElementById('answer-select-mc'),
		document.getElementById('answer-select-ooo'),
	];

	// Remove the option from each select element
	selectElements.forEach((selectElement) => {
		if (selectElement) {
			// We need to check both value and text content
			for (let i = 0; i < selectElement.options.length; i++) {
				const option = selectElement.options[i];
				if (option.value === optionText || option.textContent === optionText) {
					selectElement.remove(i);
					console.log(`Removed option '${optionText}' from select dropdown`);
					// Don't break, continue checking in case there are duplicates
					i--; // Adjust index since we removed an item
				}
			}
		}
	});
}

// Function to remove an option from the draggable container
function removeOptionFromDraggableContainer(optionText) {
	const draggableContainer = document.getElementById(
		'draggable-answer-container'
	);
	if (draggableContainer) {
		const draggableItems = draggableContainer.querySelectorAll(
			'.draggable-answer-item'
		);
		let removed = false;

		// First pass: check for exact text match
		draggableItems.forEach((item) => {
			// Check if the item contains the option text
			const itemText = item.querySelector('span')?.textContent;
			if (itemText === optionText) {
				item.remove();
				removed = true;
				console.log(`Removed option '${optionText}' from draggable container`);
			}
		});

		// Second pass: check data-value attribute
		if (!removed) {
			draggableItems.forEach((item) => {
				if (item.dataset.value === optionText) {
					item.remove();
					removed = true;
					console.log(
						`Removed option '${optionText}' from draggable container using data-value`
					);
				}
			});
		}

		// Third pass: check for image number in the image-number div
		if (!removed && optionText.startsWith('image-')) {
			const imageNumber = optionText.split('-')[1];
			draggableItems.forEach((item) => {
				// Check if this is an image-only item with the matching number
				if (
					item.dataset.isImageOnly === 'true' &&
					item.dataset.imageNumber === imageNumber
				) {
					item.remove();
					removed = true;
					console.log(
						`Removed image option with number ${imageNumber} from draggable container`
					);
				}

				// Also check the image-number div content
				const imageNumberDiv = item.querySelector('.image-number');
				if (imageNumberDiv && imageNumberDiv.textContent === optionText) {
					item.remove();
					removed = true;
					console.log(
						`Removed image option with number div content ${optionText} from draggable container`
					);
				}
			});
		}
	}
}

// Function to add an option to all select dropdowns

// Function to add an option to the draggable container
function addOptionToDraggableContainer(option) {
	console.log('Adding option to draggable container:', option);
	const draggableContainer = document.getElementById(
		'draggable-answer-container'
	);
	if (draggableContainer) {
		// Handle different option formats
		let optionValue, optionText, optionImage, optionNumber;

		if (typeof option === 'string') {
			// Simple string option
			optionValue = option;
			optionText = option;
			optionImage = '';
		} else if (typeof option === 'object') {
			// Object with text and possibly image
			optionValue = option.text || '';
			optionText = option.text || '';
			optionImage = option.image || '';

			// For image-only options, use a special identifier
			if (optionImage && !optionText) {
				// If this is an object with an id, use that
				if (typeof option === 'object' && option.id) {
					optionValue = option.id;
					optionNumber =
						option.number ||
						Object.keys(window.imageOptionMap || {}).length + 1;
				} else {
					// Create a unique identifier for this image option
					const imageId =
						'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
					optionValue = imageId;

					// Get the image number for display
					optionNumber = Object.keys(window.imageOptionMap || {}).length + 1;

					// Store the mapping between ID and image data
					if (!window.imageOptionMap) {
						window.imageOptionMap = {};
					}
					window.imageOptionMap[imageId] = {
						image: optionImage,
						number: optionNumber,
					};
				}
			}
		} else {
			// Fallback for other types
			optionValue = option.toString();
			optionText = option.toString();
			optionImage = '';
		}

		// Create a new draggable item
		const item = document.createElement('div');
		item.className = optionImage
			? 'draggable-answer-item image-option'
			: 'draggable-answer-item';
		if (!optionText && optionImage) {
			item.classList.add('image-only');
		}
		item.draggable = true;

		// Store the value in the dataset
		// For image-only options, store a reference to the image
		if (optionImage && !optionText) {
			// For image-only options, we need to store both the ID and the image
			item.dataset.value = optionValue; // This is the ID
			item.dataset.isImageOnly = 'true';
		} else {
			item.dataset.value = optionValue;
		}

		// Store image data if available
		if (optionImage) {
			item.dataset.image = optionImage;
		}

		// Set the index to be the last item
		const currentItems = draggableContainer.querySelectorAll(
			'.draggable-answer-item'
		);
		item.dataset.index = currentItems.length + 1;

		// Create HTML content based on option type
		let contentHtml = '';

		if (optionImage) {
			// For image-only options, add a number indicator
			const isImageOnly = !optionText && optionImage;
			let imageNumberHtml = '';

			if (isImageOnly) {
				// Use the stored option number if available, otherwise use the map size
				const displayNumber =
					optionNumber || Object.keys(window.imageOptionMap || {}).length;

				// Add number to the HTML
				imageNumberHtml = `<div class="image-number">image-${displayNumber}</div>`;

				// Store the number in the dataset for reference
				item.dataset.imageNumber = displayNumber;
			}

			contentHtml = `
                <div class="handle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </div>
                <div class="option-image-container">
                    <img src="${optionImage}" class="option-image" alt="Option image">
                    ${imageNumberHtml}
                </div>
            `;

			// Add text span only if there is text
			if (optionText) {
				contentHtml += `<span class="option-label">${escapeHtml(
					optionText
				)}</span>`;
			}
		} else {
			contentHtml = `
                <div class="handle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </div>
                <span>${escapeHtml(optionText)}</span>
            `;
		}

		item.innerHTML = contentHtml;

		// Add drag event listeners
		item.addEventListener('dragstart', handleDragStart);
		item.addEventListener('dragover', handleDragOver);
		item.addEventListener('drop', handleDrop);
		item.addEventListener('dragend', updateDraggableAnswer);
		item.addEventListener('dragenter', function (e) {
			e.preventDefault();
		});
		item.addEventListener('dragleave', function (e) {
			e.preventDefault();
		});

		draggableContainer.appendChild(item);

		// Make sure the container is visible
		draggableContainer.classList.remove('hidden');

		// Update the answer field
		if (typeof updateDraggableAnswer === 'function') {
			updateDraggableAnswer();
		}
	}
}

// Function to populate the options list from a comma-separated string or JSON data
function populateOptionsList(optionsData) {
	const optionsList = document.getElementById('selected-options-list');
	optionsList.innerHTML = '';

	if (!optionsData) return;

	let options = [];

	// Check if we have JSON data in the dataset attribute
	const optionsField = document.getElementById('options');
	if (optionsField && optionsField.dataset.optionData) {
		try {
			// Try to parse the JSON data
			options = JSON.parse(optionsField.dataset.optionData);
			console.log('Loaded options from JSON data:', options);
		} catch (e) {
			console.error('Error parsing options data:', e);
		}
	}

	// If no JSON data, use the comma-separated string
	if (!options.length && typeof optionsData === 'string') {
		options = optionsData.split(',').map((opt) => ({
			text: opt.trim(),
			image: '',
		}));
		console.log('Loaded options from string:', options);
	}
	options = normalizeOptionDataForStorage(options);

	options.forEach((option, index) => {
		if (!option) return;

		const optionText = String(option.text || '').trim();
		const optionImage = String(option.image || '').trim();
		const isImageOnly =
			Boolean(option.isImageOnly) ||
			(Boolean(optionImage) && /^image[-_\s]*\d+$/i.test(optionText));
		const imageNumber = String(option.number || index + 1);
		const imageId = String(option.id || `img_opt_${index + 1}`);

		if (!optionText && !optionImage) return;

		// Create option item
		const optionItem = document.createElement('div');
		optionItem.className = optionImage
			? `selected-option-item ${isImageOnly ? 'image-only' : 'with-image'}`
			: 'selected-option-item';

		// Store image data as a data attribute if available
		if (optionImage) {
			optionItem.dataset.image = optionImage;
			optionItem.dataset.imageId = imageId;
			optionItem.dataset.imageNumber = imageNumber;
		}
		if (isImageOnly) {
			optionItem.dataset.isImageOnly = 'true';
		}

		// Add image thumbnail if available
		let imageHtml = '';
		if (optionImage) {
			imageHtml = `<img src="${optionImage}" class="option-thumbnail" alt="Option image">`;
		}
		const labelHtml = isImageOnly
			? '<span></span>'
			: `<span>${escapeHtml(optionText)}</span>`;
		const imageNumberHtml =
			optionImage && isImageOnly
				? `<div class="image-number">Image ${escapeHtml(imageNumber)}</div>`
				: '';

		optionItem.innerHTML = `
            ${imageHtml}
            ${labelHtml}
            ${imageNumberHtml}
            <button type="button" class="remove-btn" onclick="removeOption(this)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;

		optionsList.appendChild(optionItem);
	});

	// Update the select dropdown after populating options
	updateOptionsField();
}

// Function to clear the question form
function clearQuestionForm() {
	document.getElementById('question').value = '';
	document.getElementById('options').value = '';
	document.getElementById('answer').value = '';
	document.getElementById('explanation').value = '';

	// Clear points field
	const pointsField = document.getElementById('points');
	if (pointsField) pointsField.value = '1';

	// Clear fill-blank specific fields
	const fillBlankText = document.getElementById('fill-blank-text');
	if (fillBlankText) fillBlankText.value = '';

	const fillBlankInstruction = document.getElementById(
		'fill-blank-instruction'
	);
	if (fillBlankInstruction) fillBlankInstruction.value = '';

	const distractors = document.getElementById('distractors');
	if (distractors) distractors.value = '';

	const useWordBank = document.getElementById('use-word-bank');
	if (useWordBank) useWordBank.checked = false;

	// Clear code specific fields
	const codeSnippet = document.getElementById('code-snippet');
	if (codeSnippet) codeSnippet.value = '';
	const codeLanguage = document.getElementById('code-language');
	if (codeLanguage) codeLanguage.value = 'javascript';
	const codeAnswerMode = document.getElementById('code-answer-mode');
	if (codeAnswerMode) codeAnswerMode.value = 'multiple-choice';

	// Reset image
	currentImageData = '';
	const imagePreview = document.getElementById('image-preview');
	if (imagePreview) imagePreview.src = '';
	const imagePreviewContainer = document.querySelector(
		'.image-preview-container'
	);
	if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
	const imageUpload = document.getElementById('image-upload');
	if (imageUpload) imageUpload.value = '';

	// Reset option image
	removeOptionImage();

	// Clear options list
	const optionsList = document.getElementById('selected-options-list');
	if (optionsList) {
		optionsList.innerHTML = '';
		// Reset draggable mode
		optionsList.classList.remove('draggable-mode');
	}

	// Clear draggable answer container
	const draggableContainer = document.getElementById(
		'draggable-answer-container'
	);
	if (draggableContainer) {
		draggableContainer.innerHTML = '';
		draggableContainer.classList.add('hidden');
	}

	// Clear matching pairs
	const leftColumn = document.getElementById('left-column-items');
	const rightColumn = document.getElementById('right-column-items');
	const pairsList = document.getElementById('pairs-list');
	if (leftColumn) leftColumn.innerHTML = '';
	if (rightColumn) rightColumn.innerHTML = '';
	if (pairsList) pairsList.innerHTML = '';

	// Clear hidden inputs
	const matchingAnswer = document.getElementById('matching-answer');
	if (matchingAnswer) matchingAnswer.value = '';

	const draggableAnswer = document.getElementById('draggable-answer');
	if (draggableAnswer) draggableAnswer.value = '';

	// Reset UI
	editIndex = -1;
	document.getElementById('question-action-text').textContent = 'Add Question';
	document.getElementById('add-update-question-btn').textContent =
		'Add Question';
	document.getElementById('cancel-edit-btn').classList.add('hidden');

	// Reset category assignment
	const categorySelect = document.getElementById('question-category');
	if (categorySelect) categorySelect.value = '';

	// Reset difficulty
	const difficultySelect = document.getElementById('question-difficulty');
	if (difficultySelect) difficultySelect.value = 'medium';

	// Reset multiple answers checkbox
	const multipleAnswers = document.getElementById('allow-multiple-answers');
	if (multipleAnswers) multipleAnswers.checked = false;

	// Reset question type to default (multiple choice)
	// We don't reset the radio button to avoid jarring UX, but we update the UI
	// handleQuestionTypeChange(currentQuestionType);

	// Clear error messages
	clearErrorMessages();
}

// Function to update the question list in the table
function updateQuestionList() {
	const questionList = document.getElementById('question-list');
	if (!questionList) return;

	// Normalize questions: ensure all have unique IDs
	const questions = JSON.parse(localStorage.getItem('quizQuestions')) || [];
	let updated = false;
	questions.forEach((q, idx) => {
		if (!q.id) {
			q.id = generateUUID();
			updated = true;
		}
		const normalizedQuestion = normalizeQuestionOptionStructure(q);
		const hasStructureChanges =
			JSON.stringify(normalizedQuestion.options || []) !==
				JSON.stringify(q.options || []) ||
			JSON.stringify(normalizedQuestion.optionData || []) !==
				JSON.stringify(q.optionData || []) ||
			String(normalizedQuestion.answer || '') !== String(q.answer || '') ||
			String(normalizedQuestion.type || '') !== String(q.type || '') ||
			Boolean(normalizedQuestion.allowMultipleAnswers) !==
				Boolean(q.allowMultipleAnswers);
		if (hasStructureChanges) {
			questions[idx] = normalizedQuestion;
			updated = true;
		}
	});
	if (updated) {
		localStorage.setItem('quizQuestions', JSON.stringify(questions));
	}

	questionList.innerHTML = '';

	let visibleCount = 0;
	questions.forEach((q, index) => {
		if (window.Auth?.canAccessItem && !window.Auth.canAccessItem('question', q)) {
			return;
		}
		const normalizedType = normalizeQuestionTypeForStorage(q.type || q.questionType, q);
		if (
			currentMainQuestionTypeFilter &&
			currentMainQuestionTypeFilter !== 'all' &&
			normalizedType !== currentMainQuestionTypeFilter
		) {
			return;
		}
		addQuestionToList(q, index);
		visibleCount += 1;
	});

	if (visibleCount === 0) {
		questionList.innerHTML =
			'<tr><td colspan="8" class="text-center">No questions found.</td></tr>';
		return;
	}

	// Update bulk delete buttons
	updateBulkDeleteButtons();
}

function setMainTypeFilter(type, badgeEl) {
	currentMainQuestionTypeFilter = type || 'all';
	document.querySelectorAll('.type-filter-badge').forEach((badge) => {
		badge.classList.toggle('active', badge === badgeEl);
	});
	updateQuestionList();
}

// Function to validate the question form
function validateQuestionForm() {
	let isValid = true;
	clearErrorMessages();

	const question = document.getElementById('question').value.trim();
	const typeRadios = document.getElementsByName('questionType');
	let selectedType = 'multiple-choice';
	for (const radio of typeRadios) {
		if (radio.checked) {
			selectedType = radio.value;
			break;
		}
	}

	// Validate Question Text
	if (!question) {
		showToast('Question text is required', 'error');
		isValid = false;
	}

	const options = getCurrentOptionsData
		? getCurrentOptionsData().filter((opt) => {
				if (!opt || typeof opt !== 'object') return false;
				return Boolean(String(opt.text || '').trim() || String(opt.image || '').trim());
			})
		: [];

	// Validate Options and Answer based on type
	if (selectedType === 'code') {
		// Validate code snippet
		const codeSnippet = document.getElementById('code-snippet')?.value?.trim() || '';
		if (!codeSnippet) {
			showToast('Code snippet is required for code questions', 'error');
			isValid = false;
		}
		// Delegate further validation to the selected answer mode sub-type
		const codeAnswerMode = document.getElementById('code-answer-mode')?.value || 'multiple-choice';
		if (codeAnswerMode === 'fill-blank') {
			if (!question.includes('___')) {
				showError('question', 'Text must contain at least one blank (___) for fill-blank answer mode');
				isValid = false;
			}
			const fillBlankAnswer = document.getElementById('fill-blank-answer')?.value || '';
			if (!String(fillBlankAnswer).trim()) {
				showError('fill-blank-answer', 'Please configure the fill-in-the-blank answer');
				isValid = false;
			}
		} else if (codeAnswerMode === 'matching-pairs') {
			const matchingAnswer = document.getElementById('matching-answer')?.value;
			if (!matchingAnswer) {
				showError('matching-answer', 'Please create at least one matching pair');
				isValid = false;
			}
		} else if (codeAnswerMode === 'draggable') {
			if (options.length < 2) {
				showError('options', 'At least two options are required');
				isValid = false;
			}
		} else if (codeAnswerMode === 'odd-one-out') {
			if (options.length < 2) {
				showError('options', 'At least two options are required');
				isValid = false;
			}
		} else {
			// Multiple choice sub-type
			if (options.length < 2) {
				showError('options', 'At least two options are required');
				isValid = false;
			}
		}
	} else if (selectedType === 'fill-blank') {
		// For fill-blank, the question text itself must contain the blanks
		if (!question.includes('___')) {
			showError('question', 'Text must contain at least one blank (___)');
			isValid = false;
		}
		const fillBlankAnswer = document.getElementById('fill-blank-answer')?.value || '';
		if (!String(fillBlankAnswer).trim()) {
			showError(
				'fill-blank-answer',
				'Please configure the fill-in-the-blank answer',
			);
			isValid = false;
		}
	} else if (selectedType === 'matching-pairs') {
		const matchingAnswer = document.getElementById('matching-answer').value;
		if (!matchingAnswer) {
			showError('matching-answer', 'Please create at least one matching pair');
			isValid = false;
		}
	} else if (selectedType === 'draggable') {
		if (options.length < 2) {
			showError('options', 'At least two options are required');
			isValid = false;
		}
		const draggableAnswerElement = document.getElementById('answer');
		const draggableAnswer = draggableAnswerElement
			? draggableAnswerElement.value
			: '';
		if (!draggableAnswer) {
			showError('answer', 'Please arrange the items in the correct order');
			isValid = false;
		}
	} else if (selectedType === 'odd-one-out') {
		if (options.length < 2) {
			showError('options', 'At least two options are required');
			isValid = false;
		}
		const imageWrapper = document.getElementById('ooo-image-answer-grid-wrapper');
		if (imageWrapper && !imageWrapper.classList.contains('hidden')) {
			const selectedImageCard = imageWrapper.querySelector(
				'.image-answer-card.selected',
			);
			if (!selectedImageCard) {
				showError('answer-select-ooo', 'Please select the odd one out');
				isValid = false;
			}
		} else {
			const answerValue =
				document.getElementById('answer-select-ooo')?.value || '';
			if (!String(answerValue).trim()) {
				showError('answer-select-ooo', 'Please select the odd one out');
				isValid = false;
			}
		}
	} else if (selectedType === 'true-false') {
		setTrueFalseOptions(document.getElementById('answer-select-mc')?.value || 'True');
		const answerValue = document.getElementById('answer-select-mc')?.value || '';
		if (!String(answerValue).trim()) {
			showError('answer-select-mc', 'Please select True or False');
			isValid = false;
		}
	} else {
		// Multiple Choice
		if (options.length < 2) {
			showError('options', 'At least two options are required');
			isValid = false;
		}

		const allowMultiple = document.getElementById(
			'allow-multiple-answers'
		).checked;
		const imageWrapper = document.getElementById('image-answer-grid-wrapper');
		const imageMultipleWrapper = document.getElementById(
			'image-multiple-answers-container',
		);

		if (allowMultiple) {
			if (
				imageMultipleWrapper &&
				!imageMultipleWrapper.classList.contains('hidden')
			) {
				const selectedCards = imageMultipleWrapper.querySelectorAll(
					'.image-answer-card.selected',
				);
				if (!selectedCards.length) {
					showError(
						'allow-multiple-answers',
						'Please select at least one correct answer',
					);
					isValid = false;
				}
			} else {
				const selectedChecks = document.querySelectorAll(
					'#multiple-answers-list input[type="checkbox"]:checked',
				);
				if (!selectedChecks.length) {
					showError(
						'allow-multiple-answers',
						'Please select at least one correct answer',
					);
					isValid = false;
				}
			}
		} else if (imageWrapper && !imageWrapper.classList.contains('hidden')) {
			const selectedImageCard = imageWrapper.querySelector(
				'.image-answer-card.selected',
			);
			if (!selectedImageCard) {
				showError('answer-select-mc', 'Please select a correct answer');
				isValid = false;
			}
		} else {
			const answerValue =
				document.getElementById('answer-select-mc')?.value || '';
			if (!String(answerValue).trim()) {
				showError('answer-select-mc', 'Please select a correct answer');
				isValid = false;
			}
		}
	}

	return isValid;
}

// Function to show error message
function showError(fieldId, message) {
	const field = document.getElementById(fieldId);
	if (field) {
		field.classList.add('error');
		// Remove any existing error message element if it exists (cleanup)
		const existingError = field.parentElement.querySelector('.error-message');
		if (existingError) {
			existingError.remove();
		}
	}
	// Always show toast for the error
	showToast(message, 'error');
}

// Function to clear error messages
function clearErrorMessages() {
	document
		.querySelectorAll('.error')
		.forEach((el) => el.classList.remove('error'));
	document.querySelectorAll('.error-message').forEach((el) => el.remove());
}

// Function to handle question image upload
function handleQuestionImageUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	if (!file.type.match('image.*')) {
		showToast('Please select an image file');
		return;
	}

	const reader = new FileReader();
	reader.onload = function (e) {
		currentImageData = e.target.result;
		const previewImage = document.getElementById('image-preview');
		const previewContainer = document.querySelector(
			'.question-image-preview-container'
		);
		if (previewImage) {
			previewImage.src = currentImageData;
		}
		if (previewContainer) {
			previewContainer.classList.remove('hidden');
		}
	};
	reader.readAsDataURL(file);
}

// Function to remove question image
function removeImage() {
	currentImageData = '';
	const imageUpload = document.getElementById('image');
	const imagePreview = document.getElementById('image-preview');
	const previewContainer = document.querySelector(
		'.question-image-preview-container'
	);

	if (imageUpload) imageUpload.value = '';
	if (imagePreview) imagePreview.src = '';
	if (previewContainer) previewContainer.classList.add('hidden');
}

// Function to update the hidden options field and populate select dropdowns
function updateOptionsField() {
	console.log('Updating options field and select dropdown');

	// Get all option items
	const optionItems = Array.from(
		document.querySelectorAll('#selected-options-list .selected-option-item')
	);

	// Extract text and image data
	let optionData = optionItems.map((el, index) => {
		const textCandidate =
			el.querySelector('.option-label')?.textContent ||
			el.querySelector('input.option-text-input')?.value ||
			el.querySelector('span')?.textContent ||
			'';
		const image = String(el.dataset.image || '').trim();
		const isImageOnly = el.dataset.isImageOnly === 'true';
		const imageId = el.dataset.imageId || '';
		const imageNumber = el.dataset.imageNumber || '';
		const fallbackText = image ? `image-${imageNumber || index + 1}` : '';
		const text = String(textCandidate || '').trim() || fallbackText;

		return {
			text,
			image,
			isImageOnly,
			id: imageId,
			number: imageNumber || '',
		};
	});
	optionData = normalizeOptionDataForStorage(optionData);

	// Update the options field value (comma-separated text)
	const optionsField = document.getElementById('options');
	if (optionsField) {
		const optionsText = optionData.map((opt) => opt.text).join(',');
		optionsField.value = optionsText;

		// Store the full option data including images
		optionsField.dataset.optionData = JSON.stringify(optionData);
		console.log('Updated options field:', optionsText);
		console.log('Stored option data:', optionData);
	}

	// Update all select dropdowns with the new options
	updateMultipleChoiceSelect(optionsField ? optionsField.value : '');
	updateOddOneOutSelect(optionsField ? optionsField.value : '');

	// Refresh dynamic answer selectors based on current question type
	const currentType = window.currentQuestionType || 'multiple-choice';
	if (typeof refreshAnswerSelector === 'function') {
		if (currentType === 'multiple-choice' || currentType === 'odd-one-out') {
			refreshAnswerSelector(currentType);
		}
	}

	// Initialize draggable sorter if in draggable mode
	if (
		currentType === 'draggable' &&
		typeof initDraggableSorter === 'function'
	) {
		initDraggableSorter();
	}

	// Initialize matching pairs if in matching pairs mode
	if (
		currentType === 'matching-pairs' &&
		typeof initMatchingPairsBuilder === 'function'
	) {
		initMatchingPairsBuilder();
	}
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
	// Load and display questions on page load
	updateQuestionList();

	// Load categories into the category select dropdown
	if (typeof loadCategoriesIntoSelect === 'function') {
		loadCategoriesIntoSelect();
	}
});

// Expose all functions to window object for global access
window.getQuestions = getQuestions;
window.addOrUpdateQuestion = addOrUpdateQuestion;
window.renderQuestionContent = renderQuestionContent;
window.addQuestionToList = addQuestionToList;
window.updateQuestionInTable = updateQuestionInTable;
window.editQuestion = editQuestion;
window.editQuestionByRow = editQuestionByRow;
window.editSelectedQuestion = editSelectedQuestion;
window.cancelEdit = cancelEdit;
window.removeQuestionByRow = removeQuestionByRow;
window.toggleBulkQuestionSelection = toggleBulkQuestionSelection;
window.updateBulkDeleteButtons = updateBulkDeleteButtons;
window.toggleBulkSelectAll = toggleBulkSelectAll;
window.selectAllBulkQuestions = selectAllBulkQuestions;
window.deselectAllBulkQuestions = deselectAllBulkQuestions;
window.deleteBulkSelectedQuestions = deleteBulkSelectedQuestions;
window.switchOptionTab = switchOptionTab;
window.handleOptionImageUpload = handleOptionImageUpload;
window.removeOptionImage = removeOptionImage;
window.addImageOption = addImageOption;
window.addImagePreviewHandlers = addImagePreviewHandlers;
window.addOption = addOption;
window.removeOption = removeOption;
window.removeOptionFromAllSelects = removeOptionFromAllSelects;
window.removeOptionFromDraggableContainer = removeOptionFromDraggableContainer;
window.addOptionToDraggableContainer = addOptionToDraggableContainer;
window.populateOptionsList = populateOptionsList;
window.clearQuestionForm = clearQuestionForm;
window.updateQuestionList = updateQuestionList;
window.validateQuestionForm = validateQuestionForm;
window.showError = showError;
window.clearErrorMessages = clearErrorMessages;
window.handleQuestionImageUpload = handleQuestionImageUpload;
window.removeImage = removeImage;
window.updateOptionsField = updateOptionsField;
window.formatCorrectAnswers = formatCorrectAnswers;
window.createQuestionRow = createQuestionRow;
window.escapeHtml = escapeHtml;

/* =========================================
   MISSING MODAL & FORM HANDLERS
   ========================================= */

function openQuestionFormModal(questionToEdit = null) {
	const modal = document.getElementById('questionFormModal');
	const form = document.getElementById('questionForm');
	const title = document.getElementById('question-action-text');
	const btn = document.getElementById('add-update-question-btn');
	const cancelBtn = document.getElementById('cancel-edit-btn');

	// Reset state
	form.reset();
	document.getElementById('selected-options-list').innerHTML = '';
	document.getElementById('multiple-answers-list').innerHTML = '';
	document.getElementById('options').dataset.optionData = '';

	// Reset custom dropdowns
	const imageWrapper = document.getElementById('image-answer-select-wrapper');
	if (imageWrapper) {
		imageWrapper.classList.add('hidden');
		imageWrapper.querySelector('.selected-option-display').innerHTML =
			'<span class="placeholder">Select Correct Answer</span>';
	}

	if (questionToEdit) {
		// Edit Mode
		title.textContent = 'Edit Question';
		btn.textContent = 'Update Question';
		cancelBtn.classList.remove('hidden');

		// Populate form (logic handled in editQuestionByRow, but we set basics here)
		// Note: editQuestionByRow usually calls this function or handles population itself.
		// If this is called with an object, we assume it's for editing.
	} else {
		// Add Mode
		editIndex = -1;
		title.textContent = 'Add Question';
		btn.textContent = 'Add Question';
		cancelBtn.classList.add('hidden');

		// Default to multiple choice
		document.querySelector(
			'input[name="questionType"][value="multiple-choice"]'
		).checked = true;
		toggleQuestionType();
	}

	// Prevent double opening
	if (modal.classList.contains('active') || modal.style.display === 'flex') {
		return;
	}

	modal.style.display = 'flex';
	// Small delay to allow display:flex to apply before adding active class for transition
	requestAnimationFrame(() => {
		modal.classList.add('active');
	});
}

let closeQuestionModalTimer;
function closeQuestionFormModal() {
	const modal = document.getElementById('questionFormModal');
	if (!modal) return;

	// If already hidden/inactive, ignore
	if (modal.style.display === 'none' && !modal.classList.contains('active'))
		return;

	modal.classList.remove('active');

	// Clear any existing timer to prevent double-execution
	if (closeQuestionModalTimer) clearTimeout(closeQuestionModalTimer);

	closeQuestionModalTimer = setTimeout(() => {
		modal.style.display = 'none';
		document.getElementById('questionForm').reset();
		editIndex = -1;
		closeQuestionModalTimer = null;
	}, 300);
}

function toggleQuestionType() {
	const types = document.getElementsByName('questionType');
	let selectedType = 'multiple-choice';

	for (const type of types) {
		if (type.checked) {
			selectedType = type.value;
			break;
		}
	}

	// Update global state
	currentQuestionType = selectedType;
	if (window.currentQuestionType) window.currentQuestionType = selectedType;

	// Show/Hide containers
	const optionsContainer = document.getElementById('options-container');
	const answerContainer = document.getElementById('answer-container');
	const fillBlankSpecifics = document.getElementById('fill-blank-specifics');

	// Reset visibility
	optionsContainer.classList.remove('hidden');
	answerContainer.classList.remove('hidden');
	if (fillBlankSpecifics) fillBlankSpecifics.classList.add('hidden');

	// Hide all answer wrappers first
	const mcWrapper = document.getElementById('mc-answer-wrapper');
	const oooWrapper = document.getElementById('ooo-answer-wrapper');
	const draggableWrapper = document.getElementById('draggable-answer-wrapper');
	const matchingWrapper = document.getElementById('matching-pairs-wrapper');
	const fillBlankWrapper = document.getElementById('fill-blank-answer-wrapper');

	if (mcWrapper) mcWrapper.classList.add('hidden');
	if (oooWrapper) oooWrapper.classList.add('hidden');
	if (draggableWrapper) draggableWrapper.classList.add('hidden');
	if (matchingWrapper) matchingWrapper.classList.add('hidden');
	if (fillBlankWrapper) fillBlankWrapper.classList.add('hidden');

	// Show/hide code snippet container
	const codeSnippetContainer = document.getElementById('code-snippet-container');
	if (codeSnippetContainer) {
		codeSnippetContainer.style.display = selectedType === 'code' ? 'block' : 'none';
	}

	// For code type, delegate answer UI to the selected sub-type (codeAnswerMode)
	const effectiveType = selectedType === 'code'
		? (document.getElementById('code-answer-mode')?.value || 'multiple-choice')
		: selectedType;

	// Show relevant wrapper based on question type (or code answer mode)
	switch (effectiveType) {
		case 'true-false':
			if (mcWrapper) mcWrapper.classList.remove('hidden');
			if (optionsContainer) optionsContainer.classList.add('hidden');
			setTrueFalseOptions();
			break;
		case 'multiple-choice':
			if (mcWrapper) mcWrapper.classList.remove('hidden');
			// Refresh the answer selector with current options
			refreshAnswerSelector('multiple-choice');
			break;
		case 'draggable':
			if (draggableWrapper) draggableWrapper.classList.remove('hidden');
			// Initialize draggable sorter
			initDraggableSorter();
			break;
		case 'odd-one-out':
			if (oooWrapper) oooWrapper.classList.remove('hidden');
			// Refresh the answer selector
			refreshAnswerSelector('odd-one-out');
			break;
		case 'matching-pairs':
			if (matchingWrapper) matchingWrapper.classList.remove('hidden');
			// Initialize matching pairs builder
			initMatchingPairsBuilder();
			break;
		case 'fill-blank':
			if (fillBlankWrapper) fillBlankWrapper.classList.remove('hidden');
			if (fillBlankSpecifics) fillBlankSpecifics.classList.remove('hidden');
			// Initialize fill-blank builder with a delay to ensure function is available
			console.log('Fill-blank selected, scheduling initFillBlankBuilder...');
			setTimeout(function () {
				console.log('Timeout fired, checking for initFillBlankBuilder...');
				console.log(
					'typeof initFillBlankBuilder:',
					typeof initFillBlankBuilder
				);
				console.log(
					'typeof window.initFillBlankBuilder:',
					typeof window.initFillBlankBuilder
				);

				if (typeof window.initFillBlankBuilder === 'function') {
					console.log('Calling window.initFillBlankBuilder()');
					window.initFillBlankBuilder();
				} else if (typeof initFillBlankBuilder === 'function') {
					console.log('Calling initFillBlankBuilder()');
					initFillBlankBuilder();
				} else {
					console.error('initFillBlankBuilder function not found!');
				}
			}, 200);
			break;
	}
}

function setTrueFalseOptions(answerValue) {
	const optionsField = document.getElementById('options');
	if (optionsField) {
		optionsField.value = 'True, False';
		optionsField.dataset.optionData = JSON.stringify([
			{ text: 'True', image: '' },
			{ text: 'False', image: '' },
		]);
	}
	const answerSelect = document.getElementById('answer-select-mc');
	if (answerSelect) {
		answerSelect.innerHTML = '<option value="">Select correct answer</option><option value="True">True</option><option value="False">False</option>';
		answerSelect.value = answerValue === 'False' ? 'False' : 'True';
	}
	const multipleToggle = document.getElementById('allow-multiple-answers');
	if (multipleToggle) multipleToggle.checked = false;
}

// Handler for when code answer mode selector changes
function handleCodeAnswerModeChange() {
	// Re-trigger toggleQuestionType to show the correct answer UI for the selected sub-type
	toggleQuestionType();
}

function toggleMultipleAnswers() {
	const isChecked = document.getElementById('allow-multiple-answers').checked;
	const selectWrapper = document.getElementById('text-answer-select-wrapper');
	const multipleContainer = document.getElementById(
		'multiple-answers-container'
	);

	if (isChecked) {
		selectWrapper.classList.add('hidden');
		multipleContainer.classList.remove('hidden');
		// Populate checkboxes based on current options
		updateMultipleAnswerCheckboxes();
	} else {
		selectWrapper.classList.remove('hidden');
		multipleContainer.classList.add('hidden');
	}
}

function updateMultipleAnswerCheckboxes() {
	const container = document.getElementById('multiple-answers-list');
	container.innerHTML = '';

	// Get current options
	let options = [];
	const optionsField = document.getElementById('options');

	if (optionsField.dataset.optionData) {
		try {
			const data = JSON.parse(optionsField.dataset.optionData);
			options = data.map((o) => o.text);
		} catch (e) {
			options = [];
		}
	}

	if (options.length === 0) {
		const raw = optionsField.value.trim();
		if (raw) options = raw.split(',').map((s) => s.trim());
	}

	options.forEach((opt) => {
		if (!opt) return;
		const label = document.createElement('label');
		label.className = 'checkbox-item';
		label.innerHTML = `
            <input type="checkbox" value="${escapeHtml(
							opt
						)}" name="correct_answers">
            <span>${escapeHtml(opt)}</span>
        `;
		container.appendChild(label);
	});
}

function handleOptionImages(input) {
	if (!input.files || input.files.length === 0) return;

	const files = Array.from(input.files);
	const optionsField = document.getElementById('options');
	let currentData = [];

	if (optionsField.dataset.optionData) {
		try {
			currentData = normalizeOptionDataForStorage(
				JSON.parse(optionsField.dataset.optionData),
			);
		} catch (e) {
			currentData = [];
		}
	}

	// Process each file
	let processedCount = 0;
	let imageCount = currentData.filter((entry) => entry.image).length;

	files.forEach((file) => {
		const reader = new FileReader();
		reader.onload = function (e) {
			imageCount += 1;
			currentData.push({
				text: `image-${imageCount}`,
				image: e.target.result,
				id: generateUUID(),
				number: String(imageCount),
				isImageOnly: true,
			});

			processedCount++;
			if (processedCount === files.length) {
				currentData = normalizeOptionDataForStorage(currentData);
				optionsField.dataset.optionData = JSON.stringify(currentData);
				populateOptionsList(currentData);
			}
		};
		reader.readAsDataURL(file);
	});

	// Reset input
	input.value = '';
}

function renderSelectedOptions(data) {
	const container = document.getElementById('selected-options-list');
	container.innerHTML = '';

	data.forEach((item, index) => {
		const div = document.createElement('div');
		div.className = 'selected-option-item';
		div.innerHTML = `
            <span class="option-number">${index + 1}</span>
            ${
							item.image ? `<img src="${item.image}" class="option-thumb">` : ''
						}
            <input type="text" class="option-text-input" value="${escapeHtml(
							item.text || ''
						)}" placeholder="Option text (optional)" onchange="updateOptionText(${index}, this.value)">
            <button type="button" class="remove-option-btn" onclick="removeOptionByIndex(${index})">&times;</button>
        `;
		container.appendChild(div);
	});

	// Update the main textarea for backward compatibility
	const optionsField = document.getElementById('options');
	optionsField.value = data
		.map((d) => d.text)
		.filter((t) => t)
		.join(', ');
}

function updateOptionText(index, value) {
	const optionsField = document.getElementById('options');
	if (optionsField.dataset.optionData) {
		const data = JSON.parse(optionsField.dataset.optionData);
		if (data[index]) {
			data[index].text = value;
			optionsField.dataset.optionData = JSON.stringify(data);

			// Update backward compatibility
			optionsField.value = data
				.map((d) => d.text)
				.filter((t) => t)
				.join(', ');

			// Update dropdowns
			if (typeof updateAnswerDropdowns === 'function') {
				updateAnswerDropdowns();
			}
		}
	}
}

function removeOptionByIndex(index) {
	const optionsField = document.getElementById('options');
	if (optionsField.dataset.optionData) {
		const data = JSON.parse(optionsField.dataset.optionData);
		data.splice(index, 1);
		optionsField.dataset.optionData = JSON.stringify(data);
		renderSelectedOptions(data);

		// Update dropdowns
		if (typeof updateAnswerDropdowns === 'function') {
			updateAnswerDropdowns();
		}
	}
}

function cancelEdit() {
	closeQuestionFormModal();
}

function updateAnswerDropdowns() {
	const optionsField = document.getElementById('options');
	let options = [];

	// Try to get structured data first
	if (optionsField.dataset.optionData) {
		try {
			const data = JSON.parse(optionsField.dataset.optionData);
			options = data;
		} catch (e) {
			options = [];
		}
	}

	// Fallback to text
	if (options.length === 0) {
		const raw = optionsField.value.trim();
		if (raw) {
			options = raw.split(',').map((s) => ({ text: s.trim(), image: null }));
		}
	}

	const currentAnswer = document.getElementById('answer-select-mc').value;

	// Update MC Select
	if (typeof showCustomDropdown === 'function') {
		showCustomDropdown('mc', options, currentAnswer);
	} else if (typeof showStandardSelect === 'function') {
		showStandardSelect(
			'mc',
			options.map((o) => o.text),
			currentAnswer
		);
	}

	// Update OOO Select
	const currentOOO = document.getElementById('answer-select-ooo').value;
	if (typeof showCustomDropdown === 'function') {
		showCustomDropdown('ooo', options, currentOOO);
	} else if (typeof showStandardSelect === 'function') {
		showStandardSelect(
			'ooo',
			options.map((o) => o.text),
			currentOOO
		);
	}

	// Update Multiple Answers Checkboxes
	if (document.getElementById('allow-multiple-answers').checked) {
		updateMultipleAnswerCheckboxes();
	}
}

/* =========================================
   MISSING SELECT UPDATE FUNCTIONS
   ========================================= */

function updateMultipleChoiceSelect(optionsString) {
	const select = document.getElementById('answer-select-mc');
	if (!select) return;

	const currentValue = select.value;
	select.innerHTML = '<option value="">Select Correct Answer</option>';

	if (!optionsString) return;

	const options = optionsString
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s);
	options.forEach((opt) => {
		const option = document.createElement('option');
		option.value = opt;
		option.textContent = opt;
		if (opt === currentValue) option.selected = true;
		select.appendChild(option);
	});
}

function updateOddOneOutSelect(optionsString) {
	const select = document.getElementById('answer-select-ooo');
	if (!select) return;

	const currentValue = select.value;
	select.innerHTML = '<option value="">Select Odd One Out</option>';

	if (!optionsString) return;

	const options = optionsString
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s);
	options.forEach((opt) => {
		const option = document.createElement('option');
		option.value = opt;
		option.textContent = opt;
		if (opt === currentValue) option.selected = true;
		select.appendChild(option);
	});
}

function switchOptionTab(tabName) {
	// Update tab buttons
	document.querySelectorAll('.option-tab-btn').forEach((btn) => {
		btn.classList.remove('active');
	});
	document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

	// Update tab content - hide all first
	document.querySelectorAll('.option-tab-content').forEach((content) => {
		content.classList.remove('active');
		content.style.display = 'none';
	});

	// Show selected tab
	const selectedTab = document.getElementById(`${tabName}-options-tab`);
	if (selectedTab) {
		selectedTab.classList.add('active');
		selectedTab.style.display = 'block';
	}
}

// Expose to window
window.updateMultipleChoiceSelect = updateMultipleChoiceSelect;
window.updateOddOneOutSelect = updateOddOneOutSelect;
window.addOption = addOption;
window.switchOptionTab = switchOptionTab;

/* =========================================
   FIX: Update options from textarea
   ========================================= */

function updateOptionsFromTextarea() {
	const optionsField = document.getElementById('options');
	if (!optionsField) return;

	const optionsText = optionsField.value.trim();
	if (!optionsText) return;

	// Update dropdown
	updateMultipleChoiceSelect(optionsText);
	updateOddOneOutSelect(optionsText);

	// Update draggable container if visible
	populateDraggableAnswerContainer();
}

// Fix: Ensure tab content starts with correct visibility
document.addEventListener('DOMContentLoaded', function () {
	// Initialize tabs - hide non-active
	const tabContents = document.querySelectorAll('.option-tab-content');
	tabContents.forEach((content) => {
		if (!content.classList.contains('active')) {
			content.style.display = 'none';
		} else {
			content.style.display = 'block';
		}
	});
});

// Expose to window
window.updateOptionsFromTextarea = updateOptionsFromTextarea;

/* =========================================
   DYNAMIC ANSWER SELECTION FUNCTIONS
   ========================================= */

// Get current options data (text and/or images)
function getCurrentOptionsData() {
	const optionsField = document.getElementById('options');
	let optionData = [];

	if (optionsField && optionsField.dataset.optionData) {
		try {
			optionData = JSON.parse(optionsField.dataset.optionData);
		} catch (e) {
			console.error('Error parsing option data:', e);
		}
	}

	// Fallback to text options
	if (optionData.length === 0 && optionsField) {
		const raw = optionsField.value.trim();
		if (raw) {
			optionData = raw.split(',').map((s, i) => ({
				text: s.trim(),
				image: '',
				id: 'opt_' + i,
			}));
		}
	}

	return normalizeOptionDataForStorage(optionData);
}

// Check if options contain images
function hasImageOptions(options) {
	return options.some((opt) => opt.image && opt.image.length > 0);
}

// Refresh answer selector based on question type and options
function refreshAnswerSelector(questionType) {
	const options = getCurrentOptionsData();
	const hasImages = hasImageOptions(options);

	if (questionType === 'multiple-choice') {
		const textWrapper = document.getElementById('text-answer-select-wrapper');
		const imageWrapper = document.getElementById('image-answer-grid-wrapper');
		const multipleContainer = document.getElementById(
			'multiple-answers-container'
		);
		const imageMultipleContainer = document.getElementById(
			'image-multiple-answers-container'
		);
		const allowMultiple = document.getElementById(
			'allow-multiple-answers'
		).checked;

		if (hasImages) {
			// Show image grid
			if (textWrapper) textWrapper.classList.add('hidden');
			if (multipleContainer) multipleContainer.classList.add('hidden');

			if (allowMultiple) {
				if (imageWrapper) imageWrapper.classList.add('hidden');
				if (imageMultipleContainer)
					imageMultipleContainer.classList.remove('hidden');
				renderImageAnswerGrid('mc-image-multiple-grid', options, true);
			} else {
				if (imageWrapper) imageWrapper.classList.remove('hidden');
				if (imageMultipleContainer)
					imageMultipleContainer.classList.add('hidden');
				renderImageAnswerGrid('mc-image-answer-grid', options, false);
			}
		} else {
			// Show text select/checkboxes
			if (imageWrapper) imageWrapper.classList.add('hidden');
			if (imageMultipleContainer)
				imageMultipleContainer.classList.add('hidden');

			if (allowMultiple) {
				if (textWrapper) textWrapper.classList.add('hidden');
				if (multipleContainer) multipleContainer.classList.remove('hidden');
				updateMultipleAnswerCheckboxes();
			} else {
				if (textWrapper) textWrapper.classList.remove('hidden');
				if (multipleContainer) multipleContainer.classList.add('hidden');
				updateMultipleChoiceSelect(options.map((o) => o.text).join(','));
			}
		}
	} else if (questionType === 'odd-one-out') {
		const select = document.getElementById('answer-select-ooo');
		const imageWrapper = document.getElementById(
			'ooo-image-answer-grid-wrapper'
		);

		if (hasImages) {
			if (select) select.classList.add('hidden');
			if (imageWrapper) imageWrapper.classList.remove('hidden');
			renderImageAnswerGrid('ooo-image-answer-grid', options, false);
		} else {
			if (select) select.classList.remove('hidden');
			if (imageWrapper) imageWrapper.classList.add('hidden');
			updateOddOneOutSelect(options.map((o) => o.text).join(','));
		}
	}
}

// Render image answer grid for visual selection
function renderImageAnswerGrid(containerId, options, allowMultiple = false) {
	const container = document.getElementById(containerId);
	if (!container) return;

	container.innerHTML = '';

	if (options.length === 0) {
		container.innerHTML = `
            <div class="answer-selection-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p>Add options above to select the correct answer</p>
            </div>
        `;
		return;
	}

	options.forEach((opt, index) => {
		const card = document.createElement('div');
		card.className = 'image-answer-card';
		card.dataset.value = opt.text || `img_${index}`;
		card.dataset.index = index;

		const imgSrc = opt.image || '';
		const label = opt.text || `Image ${index + 1}`;

		card.innerHTML = `
            <span class="option-number">${index + 1}</span>
            ${
							imgSrc
								? `<img src="${imgSrc}" alt="${escapeHtml(label)}">`
								: `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:var(--bg-surface-alt);font-size:var(--text-sm);color:var(--text-muted);">${escapeHtml(
										label
								  )}</div>`
						}
            ${
							imgSrc && label
								? `<div class="card-label">${escapeHtml(label)}</div>`
								: ''
						}
            <div class="check-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        `;

		card.addEventListener('click', () => {
			if (allowMultiple) {
				card.classList.toggle('selected');
			} else {
				// Single selection - deselect others
				container
					.querySelectorAll('.image-answer-card')
					.forEach((c) => c.classList.remove('selected'));
				card.classList.add('selected');
			}
			// Update hidden input
			updateAnswerFromImageGrid(containerId, allowMultiple);
		});

		container.appendChild(card);
	});
}

// Update answer input based on image grid selection
function updateAnswerFromImageGrid(containerId, allowMultiple) {
	const container = document.getElementById(containerId);
	if (!container) return;

	const selected = container.querySelectorAll('.image-answer-card.selected');
	const values = Array.from(selected).map((card) => card.dataset.value);

	// Determine which hidden input to update
	if (containerId.includes('mc') || containerId.includes('multiple')) {
		const answerSelect = document.getElementById('answer-select-mc');
		if (answerSelect) {
			answerSelect.value = values.join(',');
		}
	} else if (containerId.includes('ooo')) {
		const answerSelect = document.getElementById('answer-select-ooo');
		if (answerSelect) {
			answerSelect.value = values[0] || '';
		}
	}
}

// Initialize draggable sorter for drag & drop questions
function initDraggableSorter() {
	const container = document.getElementById('draggable-answer-sorter');
	if (!container) return;

	const options = getCurrentOptionsData();
	const hint = container.querySelector('.sorter-hint');

	// Clear existing items except hint
	Array.from(container.children).forEach((child) => {
		if (!child.classList.contains('sorter-hint')) {
			child.remove();
		}
	});

	if (options.length === 0) {
		if (hint) hint.style.display = 'block';
		return;
	}

	if (hint) hint.style.display = 'none';

	options.forEach((opt, index) => {
		const item = document.createElement('div');
		item.className = 'sortable-answer-item';
		item.draggable = true;
		item.dataset.value = opt.text || `img_${index}`;
		item.dataset.index = index;

		item.innerHTML = `
            <div class="drag-handle">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="8" y2="6.01"></line>
                    <line x1="8" y1="12" x2="8" y2="12.01"></line>
                    <line x1="8" y1="18" x2="8" y2="18.01"></line>
                    <line x1="16" y1="6" x2="16" y2="6.01"></line>
                    <line x1="16" y1="12" x2="16" y2="12.01"></line>
                    <line x1="16" y1="18" x2="16" y2="18.01"></line>
                </svg>
            </div>
            <span class="position-badge">${index + 1}</span>
            <div class="item-content">
                ${
									opt.image
										? `<img src="${opt.image}" class="item-image" alt="">`
										: ''
								}
                <span class="item-text">${escapeHtml(
									opt.text || `Image ${index + 1}`
								)}</span>
            </div>
        `;

		// Drag events
		item.addEventListener('dragstart', handleDragStart);
		item.addEventListener('dragend', handleDragEnd);
		item.addEventListener('dragover', handleDragOver);
		item.addEventListener('drop', handleDrop);
		item.addEventListener('dragenter', handleDragEnter);
		item.addEventListener('dragleave', handleDragLeave);

		container.appendChild(item);
	});

	// Update the answer input
	updateDraggableAnswer();
}

let draggedItem = null;

function handleDragStart(e) {
	draggedItem = this;
	this.classList.add('dragging');
	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData('text/plain', this.dataset.value);
}

function handleDragEnd(e) {
	this.classList.remove('dragging');
	document.querySelectorAll('.sortable-answer-item').forEach((item) => {
		item.classList.remove('drag-over');
	});
	draggedItem = null;
	updateDraggableAnswer();
}

function handleDragOver(e) {
	e.preventDefault();
	e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
	e.preventDefault();
	if (this !== draggedItem) {
		this.classList.add('drag-over');
	}
}

function handleDragLeave(e) {
	this.classList.remove('drag-over');
}

function handleDrop(e) {
	e.preventDefault();
	e.stopPropagation();

	if (draggedItem !== this) {
		const container = this.parentNode;
		const allItems = Array.from(
			container.querySelectorAll('.sortable-answer-item')
		);
		const draggedIndex = allItems.indexOf(draggedItem);
		const targetIndex = allItems.indexOf(this);

		if (draggedIndex < targetIndex) {
			container.insertBefore(draggedItem, this.nextSibling);
		} else {
			container.insertBefore(draggedItem, this);
		}

		// Update position badges
		updatePositionBadges();
	}

	this.classList.remove('drag-over');
}

function updatePositionBadges() {
	const container = document.getElementById('draggable-answer-sorter');
	if (!container) return;

	const items = container.querySelectorAll('.sortable-answer-item');
	items.forEach((item, index) => {
		const badge = item.querySelector('.position-badge');
		if (badge) badge.textContent = index + 1;
	});
}

function updateDraggableAnswer() {
	const container = document.getElementById('draggable-answer-sorter');
	const answerInput = document.getElementById('answer');
	if (!container || !answerInput) return;

	const items = container.querySelectorAll('.sortable-answer-item');
	const values = Array.from(items).map((item) => item.dataset.value);
	answerInput.value = values.join(',');
}

// Matching pairs state
let matchingState = {
	selectedLeft: null,
	pairs: [],
};

// Initialize matching pairs builder
function initMatchingPairsBuilder() {
	const leftColumn = document.getElementById('matching-left-column');
	const rightColumn = document.getElementById('matching-right-column');
	const pairsList = document.getElementById('matching-pairs-list');

	if (!leftColumn || !rightColumn) return;

	const options = getCurrentOptionsData();

	// Reset state
	matchingState = { selectedLeft: null, pairs: [] };

	// Clear columns (keep headers)
	Array.from(leftColumn.children).forEach((child) => {
		if (!child.classList.contains('matching-column-header')) child.remove();
	});
	Array.from(rightColumn.children).forEach((child) => {
		if (!child.classList.contains('matching-column-header')) child.remove();
	});

	if (options.length === 0) {
		leftColumn.innerHTML = `<div class="matching-column-header">Left Items</div>
            <div class="answer-selection-empty" style="padding:12px;">Add options above</div>`;
		rightColumn.innerHTML = `<div class="matching-column-header">Right Items</div>
            <div class="answer-selection-empty" style="padding:12px;">Add options above</div>`;
		return;
	}

	if (options.length < 2) {
		leftColumn.innerHTML = `<div class="matching-column-header">Left Items</div>
            <div class="answer-selection-empty" style="padding:12px;">Add at least 2 options for matching</div>`;
		rightColumn.innerHTML = `<div class="matching-column-header">Right Items</div>
            <div class="answer-selection-empty" style="padding:12px;">Add at least 2 options for matching</div>`;
		return;
	}

	// Ensure headers are present
	if (!leftColumn.querySelector('.matching-column-header')) {
		leftColumn.innerHTML =
			'<div class="matching-column-header">Left Items</div>';
	}
	if (!rightColumn.querySelector('.matching-column-header')) {
		rightColumn.innerHTML =
			'<div class="matching-column-header">Right Items</div>';
	}

	// Split options between left and right columns
	// First half goes to left, second half goes to right
	const midpoint = Math.ceil(options.length / 2);
	const leftOptions = options.slice(0, midpoint);
	const rightOptions = options.slice(midpoint);

	// Add left column items
	leftOptions.forEach((opt, index) => {
		const leftItem = createMatchingItem(opt, index, 'left');
		leftColumn.appendChild(leftItem);
	});

	// Add right column items
	rightOptions.forEach((opt, index) => {
		const rightItem = createMatchingItem(opt, midpoint + index, 'right');
		rightColumn.appendChild(rightItem);
	});

	// Clear pairs list
	if (pairsList) {
		// Keep header
		const header = pairsList.querySelector('.matching-pairs-list-header');
		pairsList.innerHTML = '';
		if (header) pairsList.appendChild(header);
		else
			pairsList.innerHTML =
				'<div class="matching-pairs-list-header">Created Pairs</div>';
	}
}

function createMatchingItem(opt, index, side) {
	const item = document.createElement('div');
	item.className = 'matching-item';
	item.dataset.value = opt.text || `img_${index}`;
	item.dataset.index = index;
	item.dataset.side = side;

	item.innerHTML = `
        ${opt.image ? `<img src="${opt.image}" alt="">` : ''}
        <span class="item-label">${escapeHtml(
					opt.text || `Image ${index + 1}`
				)}</span>
        <span class="match-indicator">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </span>
    `;

	item.addEventListener('click', () => handleMatchingItemClick(item, side));

	return item;
}

function handleMatchingItemClick(item, side) {
	const value = item.dataset.value;

	if (side === 'left') {
		// Select left item
		document
			.querySelectorAll('#matching-left-column .matching-item')
			.forEach((i) => {
				i.classList.remove('active-selection');
			});

		if (matchingState.selectedLeft === value) {
			matchingState.selectedLeft = null;
		} else {
			matchingState.selectedLeft = value;
			item.classList.add('active-selection');
		}
	} else if (side === 'right' && matchingState.selectedLeft) {
		// Create pair
		const leftValue = matchingState.selectedLeft;
		const rightValue = value;

		// Check if either is already paired
		const leftPaired = matchingState.pairs.some((p) => p.left === leftValue);
		const rightPaired = matchingState.pairs.some((p) => p.right === rightValue);

		if (!leftPaired && !rightPaired) {
			// Create new pair
			matchingState.pairs.push({ left: leftValue, right: rightValue });

			// Mark as matched
			document
				.querySelectorAll('#matching-left-column .matching-item')
				.forEach((i) => {
					if (i.dataset.value === leftValue) {
						i.classList.add('matched');
						i.classList.remove('active-selection');
					}
				});
			document
				.querySelectorAll('#matching-right-column .matching-item')
				.forEach((i) => {
					if (i.dataset.value === rightValue) {
						i.classList.add('matched');
					}
				});

			// Update pairs list UI
			updateMatchingPairsList();

			// Update hidden input
			updateMatchingAnswer();
		}

		matchingState.selectedLeft = null;
	}
}

function updateMatchingPairsList() {
	const pairsList = document.getElementById('matching-pairs-list');
	if (!pairsList) return;

	// Keep header
	pairsList.innerHTML =
		'<div class="matching-pairs-list-header">Created Pairs</div>';

	if (matchingState.pairs.length === 0) {
		pairsList.innerHTML +=
			'<div style="color:var(--text-muted);font-size:var(--text-sm);text-align:center;padding:8px;">Click a left item, then a right item to create a pair</div>';
		return;
	}

	matchingState.pairs.forEach((pair, index) => {
		const pairItem = document.createElement('div');
		pairItem.className = 'matching-pair-item';
		pairItem.innerHTML = `
            <div class="pair-left">${escapeHtml(pair.left)}</div>
            <span class="pair-arrow">→</span>
            <div class="pair-right">${escapeHtml(pair.right)}</div>
            <button type="button" class="remove-pair-btn" onclick="removeMatchingPair(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
		pairsList.appendChild(pairItem);
	});
}

function removeMatchingPair(index) {
	const pair = matchingState.pairs[index];
	if (!pair) return;

	// Remove from array
	matchingState.pairs.splice(index, 1);

	// Remove matched class from items
	document
		.querySelectorAll('#matching-left-column .matching-item')
		.forEach((i) => {
			if (i.dataset.value === pair.left) i.classList.remove('matched');
		});
	document
		.querySelectorAll('#matching-right-column .matching-item')
		.forEach((i) => {
			if (i.dataset.value === pair.right) i.classList.remove('matched');
		});

	// Update UI
	updateMatchingPairsList();
	updateMatchingAnswer();
}

function updateMatchingAnswer() {
	const answerInput = document.getElementById('matching-answer');
	if (!answerInput) return;

	// Format: left1-->right1,left2-->right2
	const answerStr = matchingState.pairs
		.map((p) => `${p.left}-->${p.right}`)
		.join(',');
	answerInput.value = answerStr;
}

// Update toggleMultipleAnswers to work with images
const originalToggleMultipleAnswers = toggleMultipleAnswers;
window.toggleMultipleAnswers = function () {
	refreshAnswerSelector('multiple-choice');
};

/* =========================================
   FILL-IN-BLANK BUILDER FUNCTIONS
   ========================================= */

// State for fill-in-blank
let fillBlankState = {
	blanks: [], // Array of blank positions
	assignments: {}, // { blankIndex: word }
};

// Initialize fill-in-blank builder
function initFillBlankBuilder() {
	console.log('initFillBlankBuilder called');

	const previewContent = document.getElementById('fill-blank-preview-content');
	const wordBank = document.getElementById('fill-blank-word-bank');
	const questionInput = document.getElementById('question');

	console.log('Preview content:', previewContent);
	console.log('Word bank:', wordBank);
	console.log('Question input:', questionInput);

	if (!previewContent || !wordBank) {
		console.log('Missing required elements, exiting');
		return;
	}

	// Reset state
	fillBlankState = { blanks: [], assignments: {} };

	// Get question text and parse blanks
	const questionText = questionInput ? questionInput.value : '';
	console.log('Question text:', questionText);

	renderFillBlankPreview(questionText);

	// Populate word bank from options
	populateFillBlankWordBank();

	// Update assignments list
	updateFillBlankAssignmentsList();

	// Add listener for question text changes
	if (questionInput) {
		// Remove existing listener if any
		questionInput.removeEventListener('input', handleQuestionTextChange);
		questionInput.addEventListener('input', handleQuestionTextChange);
		console.log('Added input listener to question');
	}
}

// Expose immediately so it's available when called from toggleQuestionType
window.initFillBlankBuilder = initFillBlankBuilder;

// Handle question text changes
function handleQuestionTextChange(e) {
	if (window.currentQuestionType === 'fill-blank') {
		renderFillBlankPreview(e.target.value);
	}
}

// Render question preview with drop zones
function renderFillBlankPreview(questionText) {
	const previewContent = document.getElementById('fill-blank-preview-content');
	if (!previewContent) {
		console.log('Preview content element not found');
		return;
	}

	console.log('Rendering fill-blank preview with text:', questionText);

	// Check for various blank formats: ___, ______, etc.
	// Use simple underscore check first
	const hasBlank = questionText.includes('___');

	if (!questionText || !hasBlank) {
		previewContent.innerHTML =
			'<div class="preview-placeholder">Enter question text with ___ to mark blanks</div>';
		fillBlankState.blanks = [];
		console.log('No blanks found in question text');
		return;
	}

	console.log('Blanks detected in question text');

	// Split by blank pattern (3 or more underscores)
	const blankPattern = /_{3,}/g;
	const parts = questionText.split(blankPattern);
	let html = '';
	let blankIndex = 0;

	fillBlankState.blanks = [];

	parts.forEach((part, i) => {
		html += escapeHtml(part);

		if (i < parts.length - 1) {
			fillBlankState.blanks.push(blankIndex);
			const assignedWord = fillBlankState.assignments[blankIndex] || '';
			const filledClass = assignedWord ? 'filled' : '';

			html += `
                <span class="blank-drop-zone ${filledClass}" 
                      data-blank-index="${blankIndex}"
                      ondragover="handleFillBlankDragOver(event)"
                      ondragleave="handleFillBlankDragLeave(event)"
                      ondrop="handleFillBlankDrop(event)"
                      onclick="handleBlankClick(${blankIndex})">
                    <span class="blank-number">[${blankIndex + 1}]</span>
                    ${
											assignedWord
												? `
                        <span class="filled-word">${escapeHtml(
													assignedWord
												)}</span>
                        <button type="button" class="remove-word-btn" onclick="event.stopPropagation(); removeFillBlankAssignment(${blankIndex})">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    `
												: ''
										}
                </span>
            `;
			blankIndex++;
		}
	});

	console.log('Created', blankIndex, 'blank drop zones');
	previewContent.innerHTML = html;

	// Refresh word bank to update assigned status
	populateFillBlankWordBank();
}

// Populate word bank with draggable badges
function populateFillBlankWordBank() {
	const wordBank = document.getElementById('fill-blank-word-bank');
	if (!wordBank) return;

	const options = getCurrentOptionsData();
	wordBank.innerHTML = '';

	if (options.length === 0) {
		return; // CSS handles empty state
	}

	// Get assigned words
	const assignedWords = Object.values(fillBlankState.assignments);

	options.forEach((opt, index) => {
		const word = opt.text || `Image ${index + 1}`;
		const isAssigned = assignedWords.includes(word);

		const badge = document.createElement('div');
		badge.className = `word-badge ${isAssigned ? 'assigned' : ''}`;
		badge.draggable = !isAssigned;
		badge.dataset.word = word;
		badge.dataset.index = index;

		badge.innerHTML = `
            ${opt.image ? `<img src="${opt.image}" alt="">` : ''}
            <span>${escapeHtml(word)}</span>
        `;

		if (!isAssigned) {
			badge.addEventListener('dragstart', handleWordBadgeDragStart);
			badge.addEventListener('dragend', handleWordBadgeDragEnd);
		}

		wordBank.appendChild(badge);
	});
}

// Drag handlers for word badges
let draggedWordBadge = null;

function handleWordBadgeDragStart(e) {
	draggedWordBadge = this;
	this.classList.add('dragging');
	e.dataTransfer.effectAllowed = 'copy';
	e.dataTransfer.setData('text/plain', this.dataset.word);
}

function handleWordBadgeDragEnd(e) {
	this.classList.remove('dragging');
	draggedWordBadge = null;

	// Remove drag-over from all drop zones
	document.querySelectorAll('.blank-drop-zone').forEach((zone) => {
		zone.classList.remove('drag-over');
	});
}

// Drop zone handlers
function handleFillBlankDragOver(e) {
	e.preventDefault();
	e.dataTransfer.dropEffect = 'copy';
	e.currentTarget.classList.add('drag-over');
}

function handleFillBlankDragLeave(e) {
	e.currentTarget.classList.remove('drag-over');
}

function handleFillBlankDrop(e) {
	e.preventDefault();
	e.currentTarget.classList.remove('drag-over');

	const blankIndex = parseInt(e.currentTarget.dataset.blankIndex);
	const word = e.dataTransfer.getData('text/plain');

	if (word && !isNaN(blankIndex)) {
		assignWordToBlank(blankIndex, word);
	}
}

// Click handler for blanks (shows a selection UI if needed)
function handleBlankClick(blankIndex) {
	// If already filled, don't do anything (use remove button)
	if (fillBlankState.assignments[blankIndex]) return;

	// Show available words in a quick picker
	const options = getCurrentOptionsData();
	const assignedWords = Object.values(fillBlankState.assignments);
	const availableOptions = options.filter((opt) => {
		const word = opt.text || `Image ${options.indexOf(opt) + 1}`;
		return !assignedWords.includes(word);
	});

	if (availableOptions.length === 0) {
		showToast('All words have been assigned', 'info');
		return;
	}

	// Simple approach: show a prompt or use the first available
	// For a better UX, we could show a popup menu
	// For now, let's use a simple prompt-like approach with the word bank
	showToast('Drag a word from the word bank to this blank', 'info');
}

// Assign word to blank
function assignWordToBlank(blankIndex, word) {
	// Check if word is already assigned somewhere else
	const existingBlank = Object.entries(fillBlankState.assignments).find(
		([_, w]) => w === word
	);

	if (existingBlank) {
		// Remove from previous blank
		delete fillBlankState.assignments[parseInt(existingBlank[0])];
	}

	// Assign to new blank
	fillBlankState.assignments[blankIndex] = word;

	// Re-render
	const questionInput = document.getElementById('question');
	renderFillBlankPreview(questionInput ? questionInput.value : '');
	updateFillBlankAssignmentsList();
	updateFillBlankAnswer();
}

// Remove assignment
function removeFillBlankAssignment(blankIndex) {
	delete fillBlankState.assignments[blankIndex];

	// Re-render
	const questionInput = document.getElementById('question');
	renderFillBlankPreview(questionInput ? questionInput.value : '');
	updateFillBlankAssignmentsList();
	updateFillBlankAnswer();
}

// Update assignments list UI
function updateFillBlankAssignmentsList() {
	const listContainer = document.getElementById('fill-blank-assignments-list');
	if (!listContainer) return;

	const assignments = Object.entries(fillBlankState.assignments);

	if (assignments.length === 0) {
		listContainer.innerHTML =
			'<div class="assignments-placeholder">Drag words to blanks above to assign answers</div>';
		return;
	}

	listContainer.innerHTML = '';

	assignments
		.sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
		.forEach(([blankIdx, word]) => {
			const item = document.createElement('div');
			item.className = 'assignment-item';
			item.innerHTML = `
            <span class="blank-label">Blank ${parseInt(blankIdx) + 1}</span>
            <span class="assignment-arrow">→</span>
            <span class="assigned-word">${escapeHtml(word)}</span>
            <button type="button" class="remove-assignment-btn" onclick="removeFillBlankAssignment(${blankIdx})">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
			listContainer.appendChild(item);
		});
}

// Update the hidden fill-blank-answer input
function updateFillBlankAnswer() {
	const answerInput = document.getElementById('fill-blank-answer');
	if (!answerInput) return;

	// Format: 1:answer1|2:answer2
	const answerParts = Object.entries(fillBlankState.assignments)
		.sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
		.map(([idx, word]) => `${parseInt(idx) + 1}:${word}`);

	answerInput.value = answerParts.join('|');
}

// Update updateOptionsField to refresh fill-blank builder
const originalUpdateOptionsField = window.updateOptionsField;
window.updateOptionsField = function () {
	// Call original if it exists
	if (typeof originalUpdateOptionsField === 'function') {
		originalUpdateOptionsField.call(this);
	}

	// If fill-blank is active, refresh word bank
	if (window.currentQuestionType === 'fill-blank') {
		populateFillBlankWordBank();
	}
};

// Expose fill-blank functions to window
window.initFillBlankBuilder = initFillBlankBuilder;
window.handleFillBlankDragOver = handleFillBlankDragOver;
window.handleFillBlankDragLeave = handleFillBlankDragLeave;
window.handleFillBlankDrop = handleFillBlankDrop;
window.handleBlankClick = handleBlankClick;
window.removeFillBlankAssignment = removeFillBlankAssignment;
window.updateFillBlankAnswer = updateFillBlankAnswer;

// Expose new functions to window
window.getCurrentOptionsData = getCurrentOptionsData;
window.hasImageOptions = hasImageOptions;
window.refreshAnswerSelector = refreshAnswerSelector;
window.renderImageAnswerGrid = renderImageAnswerGrid;
window.initDraggableSorter = initDraggableSorter;
window.initMatchingPairsBuilder = initMatchingPairsBuilder;
window.removeMatchingPair = removeMatchingPair;
window.updateDraggableAnswer = updateDraggableAnswer;
window.updateMatchingAnswer = updateMatchingAnswer;

// =========================================
// AI QUESTION GENERATOR INTEGRATION
// =========================================

// Global AI Generator instance
let aiGenerator = null;
let aiGeneratedQuestions = [];
let aiSelectedQuestions = new Set();

// Initialize AI Generator when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	// Wait a bit for ai-question-generator.js to load
	setTimeout(() => {
		if (typeof AIQuestionGenerator !== 'undefined') {
			aiGenerator = new AIQuestionGenerator();
			initAISettingsUI();
			console.log('AI Question Generator initialized');
		} else {
			console.warn('AIQuestionGenerator not available');
		}
	}, 100);
});

// Initialize AI Settings UI
function initAISettingsUI() {
	if (!aiGenerator) return;
	
	const config = aiGenerator.config;
	
	// Set provider
	const providerSelect = document.getElementById('ai-provider-select');
	if (providerSelect) {
		providerSelect.value = config.provider;
	}
	
	// Set API key if exists
	const apiKeyInput = document.getElementById('ai-api-key');
	if (apiKeyInput && config.apiKeys[config.provider]) {
		apiKeyInput.value = config.apiKeys[config.provider];
	}
	
	// Set custom model if exists
	const customModelInput = document.getElementById('ai-custom-model');
	if (customModelInput && config.customModel) {
		customModelInput.value = config.customModel;
	}
	
	// Set parameters
	const tempSlider = document.getElementById('ai-temperature');
	if (tempSlider) {
		tempSlider.value = config.temperature;
		const tempValue = document.getElementById('ai-temp-value');
		if (tempValue) tempValue.textContent = config.temperature;
	}
	
	const maxTokens = document.getElementById('ai-max-tokens');
	if (maxTokens) maxTokens.value = config.maxTokens;
	
	const cooldown = document.getElementById('ai-cooldown');
	if (cooldown) cooldown.value = config.cooldownSeconds;
	
	const timeout = document.getElementById('ai-timeout');
	if (timeout) timeout.value = config.timeoutSeconds;
	
	const debugMode = document.getElementById('ai-debug-mode');
	if (debugMode) debugMode.checked = config.debug;
	
	// Populate models
	updateAIModelSelect();
	
	// Init help link
	const helpLink = document.getElementById('ai-api-help-link');
	
	// Init Custom Base URL
	const baseUrlInput = document.getElementById('ai-base-url');
	const baseUrlGroup = document.getElementById('ai-base-url-group');
	if (baseUrlInput) {
		baseUrlInput.value = config.customBaseUrl || '';
		if (baseUrlGroup) {
			if (config.provider === 'custom') {
				baseUrlGroup.classList.remove('hidden');
			} else {
				baseUrlGroup.classList.add('hidden');
			}
		}
	}

	const providerConfig = aiGenerator.getProviderConfig();
	if (helpLink) {
		if (providerConfig && providerConfig.helpLink) {
			helpLink.href = providerConfig.helpLink;
			helpLink.style.display = 'block';
		} else {
			helpLink.style.display = 'none';
		}
	}
}

// Handle provider change
window.onAIProviderChange = function() {
	const providerSelect = document.getElementById('ai-provider-select');
	if (!providerSelect || !aiGenerator) return;
	
	const provider = providerSelect.value;
	aiGenerator.saveConfig({ provider });
	
	// Show/hide Base URL field
	const baseUrlGroup = document.getElementById('ai-base-url-group');
	if (baseUrlGroup) {
		if (provider === 'custom') {
			baseUrlGroup.classList.remove('hidden');
		} else {
			baseUrlGroup.classList.add('hidden');
		}
	}
	
	// Load API key for this provider if exists
	const apiKeyInput = document.getElementById('ai-api-key');
	if (apiKeyInput) {
		apiKeyInput.value = aiGenerator.config.apiKeys[provider] || '';
	}
	
	// Update Help Link
	const helpLink = document.getElementById('ai-api-help-link');
	const providerConfig = aiGenerator.getProviderConfig();
	if (helpLink) {
		if (providerConfig && providerConfig.helpLink) {
			helpLink.href = providerConfig.helpLink;
			helpLink.style.display = 'block';
		} else {
			helpLink.style.display = 'none';
		}
	}
	
	// Update status
	const status = document.getElementById('ai-connection-status');
	if (status) {
		status.innerHTML = 'Status: Not configured';
		status.className = 'mt-2 text-muted';
	}
	
	// Update models
	updateAIModelSelect();
};

// Recommendations for different providers
const MODEL_RECOMMENDATIONS = {
	'openrouter': [
		'google/gemini-2.0-flash-exp:free',
		'meta-llama/llama-3.1-8b-instruct:free',
		'deepseek/deepseek-chat',
		'anthropic/claude-3.5-sonnet',
		'openai/gpt-4o'
	],
	'google': ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-image'],
	'openai': ['gpt-4o-mini', 'gpt-4o']
};

// Handle model select change
window.onAIModelSelectChange = function() {
	const modelSelect = document.getElementById('ai-model-select');
	const customModelInput = document.getElementById('ai-custom-model');
	
	// If a standard model is selected, clear the custom input
	if (modelSelect && modelSelect.value && customModelInput) {
		customModelInput.value = '';
	}
};

// Update model select options
async function updateAIModelSelect() {
	if (!aiGenerator) return;
	
	const modelSelect = document.getElementById('ai-model-select');
	const customModelInput = document.getElementById('ai-custom-model');
	if (!modelSelect) return;
	
	const providerId = aiGenerator.config.provider;
	const recommendations = MODEL_RECOMMENDATIONS[providerId] || [];
	
	modelSelect.innerHTML = '<option value="">-- Fetching Models... --</option>';
	modelSelect.disabled = true;

	try {
		const models = await aiGenerator.fetchAvailableModels();
		modelSelect.innerHTML = '';
		modelSelect.disabled = false;
		
		// Add default option
		const defaultOption = document.createElement('option');
		defaultOption.value = "";
		defaultOption.textContent = "-- Select Model --";
		modelSelect.appendChild(defaultOption);
		
		if (models.length === 0) {
			// Fallback if something went wrong
			const errorOpt = document.createElement('option');
			errorOpt.disabled = true;
			errorOpt.textContent = "No models found. Check API key.";
			modelSelect.appendChild(errorOpt);
		} else {
			// Sort models: 1. Recommendations + Free, 2. Free, 3. Recommendations + Premium, 4. Others
			const sortedModels = [...models].sort((a, b) => {
				const aRec = recommendations.includes(a.id);
				const bRec = recommendations.includes(b.id);
				const aFree = a.isFree || (a.id && a.id.endsWith(':free'));
				const bFree = b.isFree || (b.id && b.id.endsWith(':free'));
				
				if (aRec && !bRec) return -1;
				if (!aRec && bRec) return 1;
				if (aFree && !bFree) return -1;
				if (!aFree && bFree) return 1;
				return (a.name || a.id).localeCompare(b.name || b.id);
			});

			sortedModels.forEach(model => {
				const isFree = model.isFree || (model.id && model.id.endsWith(':free'));
				const isRec = recommendations.includes(model.id);
				
				const option = document.createElement('option');
				option.value = model.id;
				
				let prefix = '';
				if (isRec && isFree) prefix = '✨ [REC] ';
				else if (isRec) prefix = '💎 [REC] ';
				else if (isFree) prefix = '✨ ';
				
				option.textContent = `${prefix}${model.name || model.id}`;
				if (isRec) option.style.fontWeight = 'bold';
				modelSelect.appendChild(option);
			});
		}

		// Restore selection
		const currentModel = aiGenerator.config.model;
		if (currentModel) {
			modelSelect.value = currentModel;
		}
	} catch (error) {
		console.error('Error updating model select:', error);
		modelSelect.innerHTML = '<option value="">-- Error loading models --</option>';
		modelSelect.disabled = false;
	}
}

// Toggle API key visibility
window.toggleAIKeyVisibility = function() {
	const input = document.getElementById('ai-api-key');
	const icon = document.getElementById('ai-key-eye-icon');
	if (!input) return;
	
	if (input.type === 'password') {
		input.type = 'text';
		icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
	} else {
		input.type = 'password';
		icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
	}
};

// Test AI connection
window.testAIConnection = async function() {
	if (!aiGenerator) {
		showToast('AI Generator not initialized', 'error');
		return;
	}
	
	const apiKeyInput = document.getElementById('ai-api-key');
	const providerSelect = document.getElementById('ai-provider-select');
	const modelSelect = document.getElementById('ai-model-select');
	const customModelInput = document.getElementById('ai-custom-model');
	const status = document.getElementById('ai-connection-status');
	
	if (!apiKeyInput || !apiKeyInput.value.trim()) {
		if (status) {
			status.innerHTML = '<span class="ai-status-badge error">❌ Please enter an API key</span>';
		}
		return;
	}
	
	// Determine model to use
	let model = modelSelect?.value;
	let customModel = customModelInput?.value?.trim();
	
	// Use custom model if standard one is not selected or if custom overrides
	if (customModel) {
		model = customModel;
	}
	
	// Save current settings (temporary save for test)
	const provider = providerSelect?.value || 'openrouter';
	const apiKeys = { ...aiGenerator.config.apiKeys };
	apiKeys[provider] = apiKeyInput.value.trim();
	
	aiGenerator.saveConfig({ 
		provider, 
		model,
		customModel: customModel || '', // Save custom model text too
		apiKeys 
	});
	
	// Update status to testing
	if (status) {
		status.innerHTML = '<span class="ai-status-badge pending">⏳ Testing connection...</span>';
	}
	
	try {
		const result = await aiGenerator.testConnection();
		if (status) {
			status.innerHTML = `<span class="ai-status-badge success">✅ ${result.message}</span>`;
		}
		showToast('Connection successful!', 'success');
		
		// Update models after successful connection
		updateAIModelSelect();
	} catch (error) {
		if (status) {
			status.innerHTML = `<span class="ai-status-badge error">❌ ${error.message}</span>`;
		}
		showToast(`Connection failed: ${error.message}`, 'error');
	}
};

// Save AI settings (called when settings modal is saved)
function saveAISettings() {
	if (!aiGenerator) return;
	
	const provider = document.getElementById('ai-provider-select')?.value;
	const apiKey = document.getElementById('ai-api-key')?.value;
	
	// Model logic
	const modelSelect = document.getElementById('ai-model-select');
	const customModelInput = document.getElementById('ai-custom-model');
	
	let model = modelSelect?.value;
	const customModel = customModelInput?.value?.trim();
	const customBaseUrl = document.getElementById('ai-base-url')?.value?.trim();
	
	// If custom model is provided, it takes precedence if standard is empty or user typed detailed one
	if (customModel) {
		model = customModel;
	}
	
	const temperature = parseFloat(document.getElementById('ai-temperature')?.value) || 0.7;
	const maxTokens = parseInt(document.getElementById('ai-max-tokens')?.value) || 2000;
	const cooldownSeconds = parseInt(document.getElementById('ai-cooldown')?.value) || 10;
	const timeoutSeconds = parseInt(document.getElementById('ai-timeout')?.value) || 60;
	const debug = document.getElementById('ai-debug-mode')?.checked || false;
	
	const apiKeys = { ...aiGenerator.config.apiKeys };
	if (provider && apiKey) {
		apiKeys[provider] = apiKey;
	}
	
	aiGenerator.saveConfig({
		provider,
		model,
		customModel: customModel || '',
		customBaseUrl: customBaseUrl || '',
		apiKeys,
		temperature,
		maxTokens,
		cooldownSeconds,
		timeoutSeconds,
		debug
	});
}

// Open AI Generator Modal
function openAIGeneratorModal() {
	const modal = document.getElementById('aiGeneratorModal');
	if (!modal) return;
	
	// Check if AI is configured
	if (!aiGenerator) {
		showToast('Please configure AI settings first (Settings → AI Generation)', 'warning');
		return;
	}
	const isAIConfigured = Boolean(
		aiGenerator.config.apiKeys[aiGenerator.config.provider],
	);
	if (!isAIConfigured) {
		showToast('Please configure AI settings first (Settings → AI Generation)', 'warning');
	}
	
	// Update active model indicator
	const modelNameEl = document.getElementById('ai-current-model-name');
	if (modelNameEl && aiGenerator && aiGenerator.config) {
		const currentModel = aiGenerator.config.model || 'Default';
		// Clean up model name for display (remove provider prefix if present)
		const displayName = currentModel.split('/').pop().replace(':free', '').replace(/-/g, ' ');
		modelNameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
	}

	// Reset state
	aiGeneratedQuestions = [];
	aiSelectedQuestions.clear();
	resetAIGenerator();
	updateSelectedCount(); // Ensure counter is 0 on open
	if (!isAIConfigured) {
		const errorDiv = document.getElementById('ai-error-message');
		if (errorDiv) {
			errorDiv.textContent =
				'AI is not configured yet. Add an API key in Settings → AI Generation before generating questions.';
			errorDiv.classList.remove('hidden');
		}
	}
	
	// Default tab
	switchAIGeneratorTab('standard');
	
	// Populate categories
	populateAICategorySelect();
	
	// Show modal
	promoteAIGeneratorModal(modal);
	modal.classList.add('is-open');
	modal.setAttribute('aria-hidden', 'false');
	modal.setAttribute('aria-modal', 'true');
	modal.setAttribute('role', 'dialog');
	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
	setTimeout(() => {
		document.getElementById('ai-topic')?.focus();
	}, 10);
}

// Close AI Generator Modal
function closeAIGeneratorModal() {
	const modal = document.getElementById('aiGeneratorModal');
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
	aiGeneratedQuestions = [];
	aiSelectedQuestions.clear();
}

function promoteAIGeneratorModal(modal) {
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

// Populate AI category select
function populateAICategorySelect() {
	const selects = ['ai-category', 'docCategory'];
	
	selects.forEach(id => {
		const select = document.getElementById(id);
		if (!select) return;
		
		const firstOptionText = id === 'ai-category' ? '-- No Category (General) --' : '-- No Category --';
		select.innerHTML = `<option value="">${firstOptionText}</option>`;
		
		try {
			const categories = JSON.parse(localStorage.getItem('quizCategories') || '[]');
			categories.forEach(cat => {
				const option = document.createElement('option');
				option.value = cat.id || cat.name;
				option.textContent = cat.name;
				select.appendChild(option);
			});
		} catch (e) {
			console.error('Error loading categories:', e);
		}
	});
}

// Current active AI tab
let currentAITab = 'standard';

// Switch AI Generator Tab
window.switchAIGeneratorTab = function(tab) {
	currentAITab = tab;
	
	// Update Tab UI
	const tabs = document.querySelectorAll('.ai-modal-tab');
	tabs.forEach(t => {
		t.classList.remove('active');
		t.style.color = '#64748b';
		t.style.borderBottomColor = 'transparent';
	});
	
	const activeTab = document.getElementById(`tab-ai-${tab}`);
	if (activeTab) {
		activeTab.classList.add('active');
		activeTab.style.color = '#6366f1';
		activeTab.style.borderBottomColor = '#6366f1';
	}
	
	// Update Content visibility
	const standardForm = document.getElementById('ai-generator-form');
	const documentForm = document.getElementById('ai-document-form');
	
	if (tab === 'standard') {
		standardForm.style.display = 'block';
		documentForm.style.display = 'none';
	} else {
		standardForm.style.display = 'none';
		documentForm.style.display = 'block';
		
		// Initialize Document Generator if needed
		if (typeof initDocumentGenerator === 'function') {
			initDocumentGenerator();
		}
	}
	
	// Clear any previous error
	const errorDiv = document.getElementById('ai-error-message');
	if (errorDiv) errorDiv.classList.add('hidden');
};

function getCodeTypeCounts(tab) {
	const counts = {};
	STORAGE_CODE_ANSWER_MODES.forEach((mode) => {
		counts[mode] =
			parseInt(
				document.getElementById(`count-${tab}-code-${mode}`)?.textContent,
				10,
			) || 0;
	});
	return counts;
}

function getCodeTypeTotal(codeTypeCounts = {}) {
	return STORAGE_CODE_ANSWER_MODES.reduce(
		(total, mode) => total + (parseInt(codeTypeCounts[mode], 10) || 0),
		0,
	);
}

function validateCodeTypeDistribution(typeCounts = {}, codeTypeCounts = {}) {
	const codeCount = parseInt(typeCounts.code, 10) || 0;
	if (!codeCount) return;

	const codeFormatTotal = getCodeTypeTotal(codeTypeCounts);
	if (codeFormatTotal !== codeCount) {
		throw new Error(
			`Code format counts must add up to ${codeCount}. Current total: ${codeFormatTotal}.`,
		);
	}
}

// Generate questions with AI
window.generateQuestionsWithAI = async function() {
	if (!aiGenerator) {
		showToast('AI Generator not initialized', 'error');
		return;
	}
	
	const generateBtn = document.getElementById('ai-generate-action-btn');
	const errorDiv = document.getElementById('ai-error-message');
	
	// Get form values based on active tab
	const topic = document.getElementById('ai-topic')?.value?.trim();
	const difficulty = document.getElementById('ai-difficulty')?.value || 'medium';
	const category = document.getElementById('ai-category')?.value || '';
	
	// Get type counts from steppers
	const typeCounts = getTypeCounts(currentAITab);
	const types = Object.keys(typeCounts).filter(t => typeCounts[t] > 0);
	const count = Object.values(typeCounts).reduce((sum, v) => sum + v, 0);
	
	// Validation
	if (currentAITab === 'standard' && !topic) {
		showError('Please enter a topic or subject');
		return;
	}
	
	if (types.length === 0 || count === 0) {
		showError('Please select at least one question type and set a count > 0');
		return;
	}
	
	// Hide error, show loading
	hideError();
	setGenerateButtonLoading(true);
	
	try {
		let questions = [];
		
		if (currentAITab === 'standard') {
			const language = document.getElementById('ai-language')?.value || 'fr';
			const points = parseInt(document.getElementById('ai-points')?.value) || 1;
			
			const codeTypeCounts = getCodeTypeCounts('standard');
			validateCodeTypeDistribution(typeCounts, codeTypeCounts);
			
			questions = await aiGenerator.generate({
				topic,
				types,
				typeCounts,
				count,
				difficulty,
				category,
				codeTypeCounts,
				language
			});
			
			// Apply points
			if (questions) questions.forEach(q => { q.points = points; });
		} else {
			// Document-based generation (RAG)
			if (typeof documentQuestionGenerator === 'undefined') {
				throw new Error('Document Generator not initialized');
			}
			
			// Get RAG parameters from steppers
			const docTypeCounts = getTypeCounts('document');
			const docTypes = Object.keys(docTypeCounts).filter(t => docTypeCounts[t] > 0);
			const docCount = Object.values(docTypeCounts).reduce((s, v) => s + v, 0);
			const docDifficulty = document.getElementById('docDifficulty')?.value || 'medium';
			const docCategory = document.getElementById('docCategory')?.value || '';
			const docPoints = parseInt(document.getElementById('docPoints')?.value) || 1;
			const strategy = document.querySelector('input[name="generationMode"]:checked')?.value || 'auto';
			
			const codeTypeCounts = getCodeTypeCounts('document');
			validateCodeTypeDistribution(docTypeCounts, codeTypeCounts);
			
			if (docTypes.length === 0 || docCount === 0) {
				throw new Error('Please select at least one question type and set a count > 0');
			}
			
			questions = await documentQuestionGenerator.generateFromDocument({
				count: docCount,
				difficulty: docDifficulty,
				category: docCategory,
				types: docTypes,
				typeCounts: docTypeCounts,
				strategy: strategy,
				points: docPoints,
				codeTypeCounts
			});
		}
		
		if (questions && questions.length > 0) {
			aiGeneratedQuestions = questions;
			displayAIPreview(questions);
			showToast(`✨ Generated ${questions.length} question(s)!`, 'success');
		} else {
			showError('No questions were generated. Please try again.');
		}
	} catch (error) {
		console.error('AI Generation error:', error);
		
		let errorMsg = error.message || 'Failed to generate questions';
		
		// Handle rate limits specific messaging
		if (errorMsg.includes('Rate limit') || errorMsg.includes('429')) {
			errorMsg = "⚠️ Rate Limit Reached. Cooldown started. Please wait before trying again.";
			// Enforce UI cooldown even if generator didn't set it
			if (aiGenerator && !aiGenerator.isInCooldown()) {
				// Manually trigger a short cooldown visual for rate limits
				aiGenerator.cooldownEndTime = Date.now() + 15000; // 15s wait
				startCooldownUI();
			} else {
				startCooldownUI();
			}
		}
		
		showError(errorMsg);
		
		// Handle generic cooldown or wait messages
		if (errorMsg.includes('wait') || errorMsg.includes('Cooldown')) {
			startCooldownUI();
		}
	} finally {
		setGenerateButtonLoading(false);
	}
	
	function showError(msg) {
		if (errorDiv) {
			errorDiv.textContent = msg;
			errorDiv.classList.remove('hidden');
		}
	}
	
	function hideError() {
		if (errorDiv) {
			errorDiv.classList.add('hidden');
		}
	}
};

// Set generate button loading state
function setGenerateButtonLoading(loading) {
	const btn = document.getElementById('ai-generate-action-btn');
	if (!btn) return;
	
	if (loading) {
		btn.disabled = true;
		btn.innerHTML = `
			<div class="ai-loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
			<span>Generating...</span>
		`;
	} else {
		btn.disabled = false;
		btn.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
				<path d="M12 2L2 7l10 5 10-5-10-5z"></path>
				<path d="M2 17l10 5 10-5"></path>
				<path d="M2 12l10 5 10-5"></path>
			</svg>
			<span>Generate Questions</span>
		`;
	}
}

// Start cooldown UI animation
function startCooldownUI() {
	if (!aiGenerator) return;
	
	const container = document.getElementById('ai-cooldown-container');
	const progress = document.getElementById('ai-cooldown-progress');
	const text = document.getElementById('ai-cooldown-text');
	const btn = document.getElementById('ai-generate-action-btn');
	
	if (!container || !progress || !text) return;
	
	container.classList.remove('hidden');
	if (btn) btn.disabled = true;
	
	const cooldownMs = aiGenerator.config.cooldownSeconds * 1000;
	const startTime = Date.now();
	
	function updateCooldown() {
		const elapsed = Date.now() - startTime;
		const remaining = cooldownMs - elapsed;
		
		if (remaining <= 0) {
			container.classList.add('hidden');
			progress.style.width = '0%';
			if (btn) btn.disabled = false;
			return;
		}
		
		const percent = (elapsed / cooldownMs) * 100;
		progress.style.width = `${percent}%`;
		text.textContent = `Please wait ${Math.ceil(remaining / 1000)}s...`;
		
		requestAnimationFrame(updateCooldown);
	}
	
	updateCooldown();
}

// Display AI preview
function displayAIPreview(questions) {
	const formSection = document.getElementById('ai-generator-form');
	const previewSection = document.getElementById('ai-preview-section');
	const previewList = document.getElementById('ai-questions-preview');
	const countSpan = document.getElementById('ai-preview-count');
	
	if (!previewSection || !previewList) return;
	
	// Hide form, show preview
	if (formSection) formSection.style.display = 'none';
	previewSection.classList.remove('hidden');
	
	// Show preview footer actions
	document.getElementById('ai-form-footer-actions')?.classList.add('hidden');
	document.getElementById('ai-preview-footer-actions')?.classList.remove('hidden');
	
	// Update count
	if (countSpan) countSpan.textContent = questions.length;
	
	// Clear and populate preview list
	previewList.innerHTML = '';
	aiSelectedQuestions.clear(); // Reset selections for new batch
	
	questions.forEach((q, idx) => {
		const card = createPreviewCard(q, idx);
		previewList.appendChild(card);
		
		// Auto-select all by default
		aiSelectedQuestions.add(idx);
	});
	
	// Trigger syntax highlighting
	if (typeof hljs !== 'undefined') {
		previewList.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block);
		});
	}
	
	updateSelectedCount();
}

// Create preview card for a question
function createPreviewCard(question, index) {
	const card = document.createElement('div');
	card.className = 'ai-preview-card selected';
	card.dataset.index = index;
	
	const typeLabels = {
		'multiple-choice': 'Multiple Choice',
		'true-false': 'True / False',
		'draggable': 'Drag & Drop',
		'odd-one-out': 'Odd One Out',
		'matching-pairs': 'Matching Pairs',
		'fill-blank': 'Fill in Blank',
		'code': 'Code'
	};
	
	let optionsHtml = '';
	if (question.options && question.options.length > 0) {
		optionsHtml = `
			<div class="ai-preview-options">
				${question.options.map((opt, i) => {
					const isCorrect = question.answer && (
						question.answer === opt ||
						question.answer.includes(opt) ||
						question.answer === String(i)
					);
					return `<span class="ai-preview-option ${isCorrect ? 'correct' : ''}">${escapeHtml(opt)}</span>`;
				}).join('')}
			</div>
		`;
	}
	
	// Add click listener to the card (excluding the checkbox itself)
	card.addEventListener('click', (e) => {
		if (e.target.type !== 'checkbox' && !e.target.closest('button')) {
			const checkbox = card.querySelector('.ai-preview-checkbox');
			if (checkbox) {
				checkbox.checked = !checkbox.checked;
				toggleAIQuestionSelection(index, checkbox.checked);
			}
		}
	});

	const normalizedType = normalizeQuestionTypeForStorage(question.type, question);
	const isCode = normalizedType === 'code';
	const subMode = normalizeCodeAnswerModeForStorage(
		question.codeAnswerMode || question.type,
		'multiple-choice',
	);
	const typeLabel = isCode
		? (typeLabels[subMode] || 'Multiple Choice')
		: (typeLabels[normalizedType] || 'Multiple Choice');
	
	card.innerHTML = `
		<div class="ai-preview-header">
			<input type="checkbox" class="ai-preview-checkbox" checked onchange="toggleAIQuestionSelection(${index}, this.checked)" />
			<div style="display: flex; gap: 6px; align-items: center;">
				<span class="ai-preview-type">${typeLabel}</span>
				${isCode ? '<span class="ai-preview-type code-badge">💻 Code</span>' : ''}
			</div>
			<span style="margin-left: auto; font-size: 0.85rem; color: var(--text-muted);">Q${index + 1}</span>
		</div>
		<div class="ai-preview-question">${escapeHtml(question.question)}</div>
		${question.codeSnippet ? `
			<div class="code-snippet-block" style="margin: 12px 0;">
				<div class="code-snippet-header">
					<div class="code-snippet-dots">
						<span></span><span></span><span></span>
					</div>
					<div class="code-language-badge">${question.codeLanguage || 'code'}</div>
				</div>
				<pre style="margin:0;"><code class="language-${question.codeLanguage || 'javascript'}">${escapeHtml(question.codeSnippet)}</code></pre>
			</div>
		` : ''}
		${optionsHtml}
		<div class="ai-preview-answer">
			<strong>Answer:</strong> ${escapeHtml(question.answer || 'N/A')}
		</div>
	`;
	
	return card;
}

// Toggle question selection
window.toggleAIQuestionSelection = function(index, checked) {
	if (checked) {
		aiSelectedQuestions.add(index);
	} else {
		aiSelectedQuestions.delete(index);
	}
	
	// Update card visual
	const cards = document.querySelectorAll('.ai-preview-card');
	cards.forEach(card => {
		const cardIndex = parseInt(card.dataset.index);
		if (cardIndex === index) {
			card.classList.toggle('selected', checked);
			// Sync checkbox if called from card click
			const checkbox = card.querySelector('.ai-preview-checkbox');
			if (checkbox) checkbox.checked = checked;
		}
	});

	updateSelectedCount();
}

// Select/deselect all
window.selectAllAIQuestions = function() {
	aiGeneratedQuestions.forEach((_, idx) => aiSelectedQuestions.add(idx));
	document.querySelectorAll('.ai-preview-checkbox').forEach(cb => cb.checked = true);
	document.querySelectorAll('.ai-preview-card').forEach(card => card.classList.add('selected'));
	updateSelectedCount();
};

window.deselectAllAIQuestions = function() {
	aiSelectedQuestions.clear();
	document.querySelectorAll('.ai-preview-checkbox').forEach(cb => cb.checked = false);
	document.querySelectorAll('.ai-preview-card').forEach(card => card.classList.remove('selected'));
	updateSelectedCount();
};

// Update selected count display
function updateSelectedCount() {
	const importBtn = document.getElementById('ai-import-btn');
	
	if (importBtn) {
		importBtn.disabled = aiSelectedQuestions.size === 0;
		importBtn.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
			Import Selected (${aiSelectedQuestions.size})
		`;
	}
}

// Reset AI generator to form view
window.resetAIGenerator = function() {
	const formSection = document.getElementById('ai-generator-form');
	const previewSection = document.getElementById('ai-preview-section');
	const previewList = document.getElementById('ai-questions-preview');
	const errorDiv = document.getElementById('ai-error-message');
	const cooldownContainer = document.getElementById('ai-cooldown-container');
	
	if (formSection) formSection.style.display = 'block';
	if (previewSection) previewSection.classList.add('hidden');
	if (previewList) previewList.innerHTML = '';
	if (errorDiv) errorDiv.classList.add('hidden');
	if (cooldownContainer) cooldownContainer.classList.add('hidden');
	
	// Hide code options
	const standardCodeOptions = document.getElementById('ai-standard-code-options');
	const documentCodeOptions = document.getElementById('ai-document-code-options');
	if (standardCodeOptions) standardCodeOptions.style.display = 'none';
	if (documentCodeOptions) documentCodeOptions.style.display = 'none';
	
	// Reset footer actions
	document.getElementById('ai-form-footer-actions')?.classList.remove('hidden');
	document.getElementById('ai-preview-footer-actions')?.classList.add('hidden');
	
	aiSelectedQuestions.clear();
	updateSelectedCount();
	setGenerateButtonLoading(false);
};

function mapAnswerTokenToOptionText(rawToken, options = []) {
	const token = String(rawToken || '').trim();
	if (!token) return '';
	if (!Array.isArray(options) || !options.length) return token;

	const numeric = Number.parseInt(token, 10);
	if (
		Number.isFinite(numeric) &&
		String(numeric) === token &&
		numeric >= 1 &&
		numeric <= options.length
	) {
		return options[numeric - 1];
	}

	const letterMatch = token.match(/^[A-H]$/i);
	if (letterMatch) {
		const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
		if (idx >= 0 && idx < options.length) {
			return options[idx];
		}
	}

	const normalizedToken = token.toLowerCase();
	const directMatch = options.find(
		(option) => String(option || '').trim().toLowerCase() === normalizedToken,
	);
	return directMatch || token;
}

function normalizeImportedAIQuestion(question, fallbackCategoryId = '') {
	const q = { ...(question || {}) };
	const rawTypeValue = q.type || q.questionType || '';
	const rawType = normalizeStorageKey(rawTypeValue);
	if (
		(rawType === 'multiple-choice-multi' ||
			rawType === 'multiple-choice-multiple') &&
		!q.codeSnippet &&
		!q.codeAnswerMode
	) {
		q.type = 'multiple-choice';
		q.allowMultipleAnswers = true;
	} else {
		q.type = normalizeQuestionTypeForStorage(rawTypeValue, q);
	}
	if (q.type === 'code') {
		const fallbackModeFromType = normalizeCodeAnswerModeForStorage(
			rawTypeValue,
			'',
		);
		q.codeAnswerMode = normalizeCodeAnswerModeForStorage(
			q.codeAnswerMode || fallbackModeFromType,
			fallbackModeFromType || 'multiple-choice',
		);
		q.codeSnippet = String(q.codeSnippet || '').trim();
		q.codeLanguage = String(q.codeLanguage || 'javascript').trim() || 'javascript';
	}
	q.question = String(q.question || q.text || '').trim();
	if (!q.question) return null;

	const optionDataSource = Array.isArray(q.optionData)
		? q.optionData
		: Array.isArray(q.options)
			? q.options
			: [];
	let optionData = optionDataSource.map((entry, index) => {
		if (entry && typeof entry === 'object') {
			return {
				text: String(entry.text || entry.label || entry.value || '').trim(),
				image: String(entry.image || '').trim(),
				isImageOnly: Boolean(entry.isImageOnly),
				id: String(entry.id || entry.imageId || `opt_${index + 1}`),
				number: String(entry.number || ''),
			};
		}
		return { text: String(entry || '').trim(), image: '' };
	});
	optionData = normalizeOptionDataForStorage(optionData);
	q.optionData = optionData;
	q.options = optionData.map((entry) => entry.text).filter(Boolean);

	const answerRaw = String(q.answer || '').trim();
	const effectiveAnswerType =
		q.type === 'code'
			? normalizeCodeAnswerModeForStorage(q.codeAnswerMode, 'multiple-choice')
			: q.type;
	if (
		(effectiveAnswerType === 'multiple-choice' ||
			effectiveAnswerType === 'odd-one-out' ||
			effectiveAnswerType === 'draggable') &&
		answerRaw
	) {
		const answerTokens = answerRaw
			.split(',')
			.map((token) => mapAnswerTokenToOptionText(token, q.options))
			.filter(Boolean);
		q.answer = answerTokens.join(',');
	} else {
		q.answer = answerRaw;
	}

	q.allowMultipleAnswers =
		q.type === 'multiple-choice'
			? Boolean(
					q.allowMultipleAnswers ||
						rawType === 'multiple-choice-multi' ||
						rawType === 'multiple-choice-multiple' ||
						(q.answer.includes(',') &&
							q.answer
								.split(',')
								.map((item) => item.trim())
								.filter(Boolean).length > 1),
				)
			: false;
	q.isDraggable = q.type === 'draggable';
	if (q.type === 'fill-blank') {
		q.useWordBank = Boolean(
			Object.prototype.hasOwnProperty.call(q, 'useWordBank')
				? q.useWordBank
				: true,
		);
	}

	q.explanation = String(q.explanation || '').trim();
	q.difficulty = String(q.difficulty || 'medium').trim() || 'medium';
	q.points = Number.parseFloat(q.points) || 1;
	q.category = String(q.category || fallbackCategoryId || '').trim();
	q.categoryId = String(q.categoryId || q.category || fallbackCategoryId || '').trim();
	q.dateCreated = q.dateCreated || new Date().toISOString();
	q.id = q.id || generateUUID();
	q.ownerId = q.ownerId || window.Auth?.getCurrentUser?.()?.id || '';
	q.aiGenerated = true;

	return normalizeQuestionOptionStructure(q);
}

// Import selected AI questions
window.importSelectedAIQuestions = function() {
	if (aiSelectedQuestions.size === 0) {
		showToast('No questions selected', 'warning');
		return;
	}
	
	try {
		// Get existing questions
		let existingQuestions = JSON.parse(localStorage.getItem('quizQuestions') || '[]');
		
		// Get selected questions to import
		const questionsToImport = [];
		const selectedCategory = document.getElementById('ai-category')?.value || '';
		aiSelectedQuestions.forEach(idx => {
			if (aiGeneratedQuestions[idx]) {
				const normalizedQuestion = normalizeImportedAIQuestion(
					aiGeneratedQuestions[idx],
					selectedCategory,
				);
				if (normalizedQuestion) {
					questionsToImport.push(normalizedQuestion);
				}
			}
		});
		if (!questionsToImport.length) {
			showToast('No valid questions to import', 'error');
			return;
		}
		
		// Add to existing questions
		existingQuestions = [...existingQuestions, ...questionsToImport];
		
		// Save to localStorage
		localStorage.setItem('quizQuestions', JSON.stringify(existingQuestions));
		
		// Log activity
		if (typeof logActivity === 'function') {
			logActivity('question', 'AI Generated Questions', 'imported', { count: questionsToImport.length });
		}
		
		showToast(`✅ Imported ${questionsToImport.length} question(s)!`, 'success');
		
		// Close modal
		closeAIGeneratorModal();
		
		// Refresh questions list UI
		if (typeof updateQuestionList === 'function') {
			updateQuestionList();
		} else if (typeof loadQuestions === 'function') {
			loadQuestions();
		} else if (typeof renderQuestions === 'function') {
			renderQuestions(); // Fallback if loadQuestions (fetch) not available
		} else {
			// Reload page as last resort
			setTimeout(() => window.location.reload(), 1000);
		}
		
	} catch (error) {
		console.error('Error importing questions:', error);
		showToast('Failed to import questions', 'error');
	}
};

// Expose AI functions to window
window.openAIGeneratorModal = openAIGeneratorModal;
window.closeAIGeneratorModal = closeAIGeneratorModal;
window.generateQuestionsWithAI = generateQuestionsWithAI;
window.resetAIGenerator = resetAIGenerator;
window.importSelectedAIQuestions = importSelectedAIQuestions;
window.selectAllAIQuestions = selectAllAIQuestions;
window.deselectAllAIQuestions = deselectAllAIQuestions;
window.toggleAIQuestionSelection = toggleAIQuestionSelection;
window.saveAISettings = saveAISettings;

/**
 * Toggles the visibility of code-specific options in the AI generator
 * @param {string} tab - 'standard' or 'document'
 */
window.toggleAICodeOptions = function(tab) {
	const name = tab === 'standard' ? 'ai-question-type' : 'docQuestionType';
	const containerId = tab === 'standard' ? 'ai-standard-code-options' : 'ai-document-code-options';
	
	const codeCheckbox = document.querySelector(`input[name="${name}"][value="code"]`);
	const container = document.getElementById(containerId);
	
	if (codeCheckbox && container) {
		const isVisible = codeCheckbox.checked;
		container.style.display = isVisible ? 'block' : 'none';
		
		if (isVisible) {
			container.classList.add('visible');
			container.style.animation = 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
			
			// Optional: Scroll to make sure it's visible if it's at the bottom
			setTimeout(() => {
				container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 100);
		} else {
			container.classList.remove('visible');
		}
	}
};

// =========================================
// AI TYPE GRID V2 — Stepper Functions
// =========================================

function syncCodeSubTypeVisualState(tab) {
	STORAGE_CODE_ANSWER_MODES.forEach((mode) => {
		const countEl = document.getElementById(`count-${tab}-code-${mode}`);
		const card = countEl?.closest('.ai-type-card-v2');
		if (!countEl || !card) return;
		card.classList.toggle(
			'selected',
			(parseInt(countEl.textContent, 10) || 0) > 0,
		);
		card.style.borderColor = '';
		card.style.background = '';
	});
}

/**
 * Toggle a question type card on/off
 * @param {HTMLInputElement} checkbox - The checkbox that was toggled
 * @param {string} tab - 'standard' or 'document'
 */
window.onAITypeToggle = function(checkbox, tab) {
	const card = checkbox.closest('.ai-type-card-v2');
	const type = checkbox.value;
	const stepperId = `stepper-${tab}-${type}`;
	const countId = `count-${tab}-${type}`;
	const stepper = document.getElementById(stepperId);
	const countEl = document.getElementById(countId);
	
	// Disable logic for Code type
	const checkboxName = tab === 'standard' ? 'ai-question-type' : 'docQuestionType';
	const allCheckboxes = document.querySelectorAll(`input[name="${checkboxName}"]`);
	
	if (type === 'code' && checkbox.checked) {
		// When Code is selected, uncheck and disable all other types
		allCheckboxes.forEach(cb => {
			if (cb.value !== 'code') {
				cb.checked = false;
				cb.disabled = true;
				const otherCard = cb.closest('.ai-type-card-v2');
				otherCard?.classList.add('disabled-opacity');
				otherCard?.classList.remove('selected');
				
				const otherStepper = document.getElementById(`stepper-${tab}-${cb.value}`);
				if (otherStepper) otherStepper.classList.add('hidden');
				
				const otherCount = document.getElementById(`count-${tab}-${cb.value}`);
				if (otherCount) otherCount.textContent = '0';
			}
		});
	} else if (type === 'code' && !checkbox.checked) {
		// When Code is unselected, re-enable everything
		allCheckboxes.forEach(cb => {
			cb.disabled = false;
			const otherCard = cb.closest('.ai-type-card-v2');
			otherCard?.classList.remove('disabled-opacity');
		});
	}

	if (checkbox.checked) {
		card?.classList.add('selected');
		if (stepper) stepper.classList.remove('hidden');
		// Set default count to 1 if currently 0
		if (countEl && parseInt(countEl.textContent) === 0) {
			countEl.textContent = '1';
			// If this is the code type, also initialize its default sub-type
			if (type === 'code') {
				const mcEl = document.getElementById(`count-${tab}-code-multiple-choice`);
				if (mcEl) mcEl.textContent = '1';
				syncCodeSubTypeVisualState(tab);
			}
		}
	} else {
		card?.classList.remove('selected');
		if (stepper) stepper.classList.add('hidden');
		if (countEl) countEl.textContent = '0';
		
		// If this is the code type, zero out all sub-types
		if (type === 'code') {
			const subTypes = ['multiple-choice', 'fill-blank', 'odd-one-out', 'draggable', 'matching-pairs'];
			subTypes.forEach(st => {
				const stEl = document.getElementById(`count-${tab}-code-${st}`);
				if (stEl) stEl.textContent = '0';
			});
			syncCodeSubTypeVisualState(tab);
		}
	}
	
	// Toggle code options panel
	toggleAICodeOptions(tab);
	
	// Recalculate total
	recalcAITotal(tab);
};

/**
 * Adjust the count for a specific question type
 * @param {string} tab - 'standard' or 'document'
 * @param {string} type - Question type key
 * @param {number} delta - +1 or -1
 */
window.adjustTypeCount = function(tab, type, delta) {
	const countId = `count-${tab}-${type}`;
	const countEl = document.getElementById(countId);
	if (!countEl) return;
	
	let current = parseInt(countEl.textContent) || 0;
	let newVal = Math.max(0, Math.min(20, current + delta));
	
	// If going to 0, uncheck the card
	if (newVal === 0) {
		const checkboxName = tab === 'standard' ? 'ai-question-type' : 'docQuestionType';
		const checkbox = document.querySelector(`input[name="${checkboxName}"][value="${type}"]`);
		if (checkbox) {
			checkbox.checked = false;
			const card = checkbox.closest('.ai-type-card-v2');
			card?.classList.remove('selected');
			const stepper = document.getElementById(`stepper-${tab}-${type}`);
			if (stepper) stepper.classList.add('hidden');
			
			// NEW: Re-enable other types if this was code
			if (type === 'code') {
				const allCbs = document.querySelectorAll(`input[name="${checkboxName}"]`);
				allCbs.forEach(cb => {
					cb.disabled = false;
					const otherCard = cb.closest('.ai-type-card-v2');
					otherCard?.classList.remove('disabled-opacity');
				});
			}
		}
		toggleAICodeOptions(tab);
	}
	
	countEl.textContent = newVal;

	// If this is the code type, sync the default sub-type (multiple-choice) to match the delta
	if (type === 'code') {
		const mcEl = document.getElementById(`count-${tab}-code-multiple-choice`);
		if (mcEl) {
			let currentMc = parseInt(mcEl.textContent) || 0;
			mcEl.textContent = Math.max(0, currentMc + delta);
		}
		syncCodeSubTypeVisualState(tab);
	}

	recalcAITotal(tab);
};

/**
 * Adjust the count for a specific code sub-type
 */
window.adjustCodeSubTypeCount = function(tab, subType, delta) {
	const countEl = document.getElementById(`count-${tab}-code-${subType}`);
	if (!countEl) return;
	
	let currentVal = parseInt(countEl.textContent) || 0;
	let newVal = Math.max(0, currentVal + delta);
	countEl.textContent = newVal;
	
	// Sum all sub-types to update main code stepper
	const subTypes = ['multiple-choice', 'fill-blank', 'odd-one-out', 'draggable', 'matching-pairs'];
	let totalCode = 0;
	subTypes.forEach(st => {
		const stEl = document.getElementById(`count-${tab}-code-${st}`);
		if (stEl) totalCode += parseInt(stEl.textContent) || 0;
	});
	
	const mainCodeEl = document.getElementById(`count-${tab}-code`);
	if (mainCodeEl) mainCodeEl.textContent = totalCode;
	
	syncCodeSubTypeVisualState(tab);
	
	// Ensure main code card is activated if total > 0
	const checkboxName = tab === 'standard' ? 'ai-question-type' : 'docQuestionType';
	const checkbox = document.querySelector(`input[name="${checkboxName}"][value="code"]`);
	if (checkbox && totalCode === 0 && checkbox.checked) {
		checkbox.checked = false;
		onAITypeToggle(checkbox, tab);
	} else if (checkbox && !checkbox.checked && totalCode > 0) {
		checkbox.checked = true;
		onAITypeToggle(checkbox, tab);
	}
	
	recalcAITotal(tab);
};

/**
 * Convenience function to toggle/increment sub-type when clicking the card itself
 */
window.toggleCodeSubType = function(tab, subType) {
	window.adjustCodeSubTypeCount(tab, subType, 1);
};

/**
 * Recalculate the total question count for a tab
 * @param {string} tab - 'standard' or 'document'
 */
function recalcAITotal(tab) {
	const grid = document.getElementById(`ai-type-grid-${tab}`);
	if (!grid) return;
	
	let total = 0;
	const countEls = grid.querySelectorAll('.stepper-val');
	countEls.forEach(el => {
		// Only count standard types, not the sub-types which contain '-code-' in their ID
		if (el.id.includes('-code-')) return;
		total += parseInt(el.textContent) || 0;
	});
	
	// Update total badge
	const totalEl = document.getElementById(`ai-total-count-${tab}`);
	if (totalEl) totalEl.textContent = total;
	
	// Update hidden count field for backwards compat
	if (tab === 'standard') {
		const hiddenCount = document.getElementById('ai-count');
		if (hiddenCount) hiddenCount.value = total;
	} else {
		const hiddenCount = document.getElementById('docQuestionCount');
		if (hiddenCount) hiddenCount.value = total;
	}
}

/**
 * Get type counts map from steppers for a tab
 * @param {string} tab - 'standard' or 'document'
 * @returns {Object} Map of { type: count }
 */
function getTypeCounts(tab) {
	const counts = {};
	const grid = document.getElementById(`ai-type-grid-${tab}`);
	if (!grid) return counts;
	
	grid.querySelectorAll('.ai-type-card-v2').forEach(card => {
		const type = card.dataset.type;
		const countEl = card.querySelector('.stepper-val');
		const checkbox = card.querySelector('.ai-type-check');
		
		if (checkbox?.checked && countEl) {
			const val = parseInt(countEl.textContent) || 0;
			if (val > 0) counts[type] = val;
		}
	});
	
	return counts;
}

/**
 * Update pro tips based on selected configuration (placeholder for future dynamic tips)
 * @param {string} tab - 'standard' or 'document'
 */
window.updateProTips = function(tab) {
	// Currently static tips - could be made dynamic based on difficulty/type selection
	console.log('[AI Generator] Pro tips updated for tab:', tab);
};

// Expose new functions
window.recalcAITotal = recalcAITotal;
window.getTypeCounts = getTypeCounts;

/**
 * Initialize global event listeners for AI Generator
 */
document.addEventListener('click', function(e) {
	// Handle AI Type Card toggling
	const card = e.target.closest('.ai-type-card-v2');
	if (!card) return;
	
	// Skip if it's a sub-type card (they have their own onclick handles)
	if (card.onclick || card.hasAttribute('onclick')) return;
	
	// Skip if clicking interactive elements inside (buttons or checkbox)
	if (e.target.closest('.stepper-btn') || e.target.classList.contains('ai-type-check')) return;
	
	const checkbox = card.querySelector('.ai-type-check');
	if (checkbox && !checkbox.disabled) {
		checkbox.checked = !checkbox.checked;
		
		// Determine tab from context
		let tab = card.dataset.tab;
		if (!tab) {
			tab = card.closest('#ai-generator-form') ? 'standard' : 'document';
		}
		
		// Trigger toggle logic
		if (typeof window.onAITypeToggle === 'function') {
			window.onAITypeToggle(checkbox, tab);
		}
	}
});

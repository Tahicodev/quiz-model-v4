// Quiz configuration
const quizConfig = {
	totalQuestions: 5,
	timeLimit: 300, // 5 minutes
	penalty: 5, // seconds penalty per wrong answer
};

// Quiz modes
const quizModes = {
	training: 'training',
	exam: 'exam',
};

// Quiz state
let currentQuestion = 0;
let score = 0;
let timeRemaining = quizConfig.timeLimit;
let timerId = null;
let currentMode = quizModes.training;
let currentExam = null;

// Questions data structure
// Shuffle array function
function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

function normalizeQuestionToken(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

function splitQuestionOptionText(value, answer = '') {
	const raw = String(value || '').replace(/\r/g, '').trim();
	if (!raw) return [];

	const splitBy = (regex) =>
		raw
			.split(regex)
			.map((item) => String(item || '').trim())
			.filter(Boolean);

	const hardDelimiters = [/\n+/, /\|+/, /;+/, /[•·]+/];
	for (const delimiter of hardDelimiters) {
		const parts = splitBy(delimiter);
		if (parts.length > 1) return parts;
	}

	if (raw.includes(',')) {
		const commaParts = splitBy(/,+/);
		const normalizedAnswer = normalizeQuestionToken(answer);
		const includesFullAnswer =
			normalizedAnswer &&
			commaParts.some((part) => normalizeQuestionToken(part) === normalizedAnswer);
		const safeCommaList =
			commaParts.length >= 2 &&
			commaParts.length <= 8 &&
			commaParts.every((part) => part.length <= 96);
		if (
			safeCommaList &&
			(!String(answer || '').includes(',') || includesFullAnswer)
		) {
			return commaParts;
		}
	}

	const camelParts = splitBy(/(?<=[a-z0-9])(?=[A-Z])/);
	if (camelParts.length > 1) {
		const normalizedAnswer = normalizeQuestionToken(answer);
		if (
			!normalizedAnswer ||
			camelParts.some((part) => normalizeQuestionToken(part) === normalizedAnswer)
		) {
			return camelParts;
		}
	}

	return [raw];
}

function normalizeQuestionOptionEntry(entry, answer = '', fallbackIndex = 0) {
	const normalizedEntries = [];

	if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
		const rawTextCandidates = [
			entry.text,
			entry.label,
			entry.value,
			entry.option,
			entry.choice,
			entry.answer,
			entry.content,
			entry.title,
		];
		let optionText = '';
		for (const candidate of rawTextCandidates) {
			const candidateText = String(candidate ?? '').trim();
			if (candidateText) {
				optionText = candidateText;
				break;
			}
		}

		const optionImage = String(entry.image || entry.imageUrl || '').trim();
		const splitTextOptions =
			optionText && !optionImage
				? splitQuestionOptionText(optionText, answer)
				: [optionText];

		splitTextOptions.forEach((textValue, textIndex) => {
			const normalizedText = String(textValue || '').trim();
			const resolvedText =
				normalizedText || (optionImage ? `Image ${fallbackIndex + textIndex + 1}` : '');
			if (!resolvedText && !optionImage) return;

			normalizedEntries.push({
				text: resolvedText,
				image: optionImage,
				isImageOnly: Boolean(
					entry.isImageOnly || (optionImage && !normalizedText),
				),
			});
		});
		return normalizedEntries;
	}

	if (typeof entry === 'string' && entry.trim().startsWith('img_')) {
		const imageData =
			window.imageOptionMap && window.imageOptionMap[entry.trim()]
				? window.imageOptionMap[entry.trim()]
				: null;
		if (imageData) {
			const imageSrc =
				typeof imageData === 'object' ? imageData.image || '' : String(imageData || '');
			normalizedEntries.push({
				text: `Image ${fallbackIndex + 1}`,
				image: imageSrc,
				isImageOnly: true,
			});
			return normalizedEntries;
		}
	}

	const rawParts = splitQuestionOptionText(entry, answer);
	rawParts.forEach((part) => {
		const normalizedText = String(part || '').trim();
		if (!normalizedText) return;
		normalizedEntries.push({
			text: normalizedText,
			image: '',
			isImageOnly: false,
		});
	});

	return normalizedEntries;
}

function extractQuestionOptionData(question = {}) {
	const answer = question.answer || '';
	const rawSources = [];

	if (Array.isArray(question.optionData)) {
		rawSources.push(...question.optionData);
	}
	if (Array.isArray(question.options)) {
		rawSources.push(...question.options);
	} else if (typeof question.options === 'string') {
		rawSources.push(question.options);
	}
	if (Array.isArray(question.choices)) {
		rawSources.push(...question.choices);
	} else if (typeof question.choices === 'string') {
		rawSources.push(question.choices);
	}

	const normalized = [];
	rawSources.forEach((entry, index) => {
		normalized.push(...normalizeQuestionOptionEntry(entry, answer, index));
	});

	const seen = new Set();
	return normalized.filter((entry) => {
		const key = `${normalizeQuestionToken(entry.text)}|${String(entry.image || '').trim()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function normalizeQuestionAnswerAgainstOptions(answer, optionData = []) {
	const rawAnswer = String(answer || '').trim();
	if (!rawAnswer || !/img_\d+/i.test(rawAnswer)) return rawAnswer;

	return rawAnswer.replace(/img_(\d+)/gi, (_, optionIndex) => {
		const parsedIndex = Number.parseInt(optionIndex, 10);
		const mapped = optionData[parsedIndex];
		if (!mapped) return `Image ${parsedIndex + 1}`;
		return String(mapped.text || `Image ${parsedIndex + 1}`);
	});
}

function resolveQuestionReferences(rawQuestions, questionBank = []) {
	if (!Array.isArray(rawQuestions)) return [];

	const bank = Array.isArray(questionBank) ? questionBank : [];
	const resolved = [];

	rawQuestions.forEach((entry) => {
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const candidateIndex = Number.parseInt(
				entry.questionIndex ?? entry.index ?? '',
				10,
			);
			if (
				(!entry.question && !entry.text) &&
				Number.isInteger(candidateIndex) &&
				bank[candidateIndex]
			) {
				resolved.push({
					...bank[candidateIndex],
					...entry,
				});
				return;
			}
			resolved.push({ ...entry });
			return;
		}

		const numericRef =
			typeof entry === 'number'
				? entry
				: Number.parseInt(String(entry || '').trim(), 10);

		if (Number.isInteger(numericRef) && bank[numericRef]) {
			resolved.push({ ...bank[numericRef] });
			return;
		}

		const entryId = String(entry || '').trim();
		if (!entryId) return;

		const byId = bank.find((question) => {
			if (!question || typeof question !== 'object') return false;
			const questionId = String(
				question.id ?? question.questionId ?? question.uuid ?? '',
			).trim();
			return questionId && questionId === entryId;
		});
		if (byId) {
			resolved.push({ ...byId });
		}
	});

	return resolved;
}

function splitChoiceAnswerTokens(value) {
	return String(value || '')
		.replace(/\r/g, '\n')
		.split(/[|,\n;،]+/)
		.map((item) => String(item || '').trim())
		.filter(Boolean);
}

function isQuestionMultiAnswer(question = {}) {
	if (!question || typeof question !== 'object') return false;
	if (question.allowMultipleAnswers === true) return true;

	const answerTokens = splitChoiceAnswerTokens(question.answer);
	if (answerTokens.length <= 1) return false;

	const rawOptions = Array.isArray(question.options)
		? question.options
		: Array.isArray(question.choices)
			? question.choices
			: [];
	if (!rawOptions.length) return true;

	const optionTokens = new Set(
		rawOptions
			.map((entry) => {
				if (entry && typeof entry === 'object') {
					return normalizeQuestionToken(
						entry.text ??
							entry.label ??
							entry.value ??
							entry.option ??
							entry.choice ??
							'',
					);
				}
				return normalizeQuestionToken(entry);
			})
			.filter(Boolean),
	);
	if (!optionTokens.size) return true;

	return answerTokens.every((token) =>
		optionTokens.has(normalizeQuestionToken(token)),
	);
}

function hasExplicitOrderQuestionSignal(question = {}) {
	const rawType = String(question.type || question.questionType || '').toLowerCase();
	const textBlob = [
		question.question,
		question.text,
		question.instruction,
	]
		.map((item) => String(item || '').toLowerCase())
		.join(' ');
	if (
		rawType.includes('drag') ||
		rawType.includes('order') ||
		rawType.includes('ordon')
	) {
		return true;
	}
	if (
		textBlob.includes('order') ||
		textBlob.includes('ordon') ||
		textBlob.includes('arrange') ||
		textBlob.includes('sequence') ||
		textBlob.includes('rank')
	) {
		return true;
	}
	return String(question.answer || '').includes('|');
}

/**
 * Validate and fix questions to ensure each question has correct options
 * Ensures options arrays belong to their questions and are not mixed up
 */
function validateAndFixQuestions(questionsArray) {
	if (!Array.isArray(questionsArray) || questionsArray.length === 0) {
		console.warn('Invalid questions array');
		return;
	}

	questionsArray.forEach((question, index) => {
		if (!question || typeof question !== 'object') {
			console.warn(`Question ${index} is not a valid object`);
			questionsArray[index] = {
				question: '',
				text: '',
				options: [],
				optionData: [],
				answer: '',
				type: 'multiple-choice',
				questionType: 'multiple-choice',
				allowMultipleAnswers: false,
			};
			return;
		}

		const normalizedPrompt = String(
			question.question || question.text || '',
		).trim();
		question.question = normalizedPrompt;
		if (!question.text) {
			question.text = normalizedPrompt;
		}

		// Ensure question has required fields
		if (!question.question) {
			console.warn(`Question ${index} missing question text`);
		}

		const optionData = extractQuestionOptionData(question);
		question.optionData = optionData;
		question.options = optionData
			.map((entry) => String(entry.text || '').trim())
			.filter(Boolean);

		// Ensure options are not empty
		if (question.options.length === 0) {
			console.warn(`Question ${index} has no options`);
		}

		// Ensure answer exists
		if (!question.answer) {
			console.warn(`Question ${index} missing answer`);
			question.answer = question.options[0] || '';
		} else {
			question.answer = normalizeQuestionAnswerAgainstOptions(
				question.answer,
				question.optionData,
			);
		}

		if (question.allowMultipleAnswers === undefined) {
			question.allowMultipleAnswers = false;
		}
		if (question.allowMultipleAnswers && String(question.answer || '').includes(',')) {
			const answerTokens = String(question.answer || '')
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
				.map((item) => normalizeQuestionToken(item));
			const optionTokens = new Set(
				(question.options || []).map((item) => normalizeQuestionToken(item)),
			);
			const looksLikeTrueMulti =
				answerTokens.length > 1 &&
				answerTokens.every((token) => optionTokens.has(token));
			if (!looksLikeTrueMulti) {
				question.allowMultipleAnswers = false;
			}
		}

		const rawType = String(question.type || question.questionType || '')
			.trim()
			.toLowerCase();
		if (
			rawType === 'draggable' &&
			!hasExplicitOrderQuestionSignal(question)
		) {
			question.type = 'multiple-choice';
			question.questionType = 'multiple-choice';
			question.isDraggable = false;
		}

		// Log question validation
		console.log(
			`Question ${index + 1}: "${question.question?.substring(0, 50)}..." - Options: ${question.options.length}`,
		);
	});

	console.log(
		`Validated ${questionsArray.length} questions - all options are correctly assigned`,
	);
}

// Questions data structure
let questions = [
	{
		question: 'Quel est le menu principal de Windows 7 ?',
		options: ['Menu Démarrer', 'Menu Windows', 'Menu Principal'],
		answer: 'Menu Démarrer',
		explanation:
			"Le menu Démarrer est l'élément central de l'interface utilisateur de Windows 7.",
	},
	{
		question:
			'Quelle combinaison de touches permet de basculer entre les applications ouvertes ?',
		options: ['Alt + Tab', 'Ctrl + Tab', 'Windows + Tab'],
		answer: 'Alt + Tab',
		explanation:
			'Alt + Tab permet de naviguer entre les applications récemment utilisées.',
	},
	{
		question: 'Comment accéder au Gestionnaire des tâches ?',
		options: ['Ctrl + Alt + Suppr', 'Ctrl + Maj + Échap', 'Les deux réponses'],
		answer: 'Les deux réponses',
		explanation:
			"Les deux combinaisons permettent d'accéder au Gestionnaire des tâches.",
	},
	{
		question: 'Quel outil permet de défragmenter le disque dur ?',
		options: [
			'Nettoyage de disque',
			'Défragmenteur de disque',
			'Moniteur de ressources',
		],
		answer: 'Défragmenteur de disque',
		explanation:
			'Le Défragmenteur de disque réorganise les données fragmentées pour optimiser les performances.',
	},
	{
		question: 'Où trouve-t-on la liste des programmes au démarrage ?',
		options: [
			'Gestionnaire de périphériques',
			'Gestionnaire des tâches > Démarrage',
			'Panneau de configuration > Programmes',
		],
		answer: 'Gestionnaire des tâches > Démarrage',
		explanation:
			'Le Gestionnaire des tâches inclut désormais un onglet Démarrage pour gérer les programmes lancés au démarrage.',
	},
	{
		question: 'Give the correct order to create a folder on desktop:',
		options: [
			'Click on desktop',
			'Click right',
			'Select new folder',
			'Push enter',
		],
		answer: 'Click on desktop,Click right,Select new folder,Push enter',
		isDraggable: true,
		explanation:
			'This is the correct sequence to create a new folder on desktop.',
	},
];

// Remove initial shuffle - questions will be shuffled in initQuiz()

// DOM Elements - Get them lazily to ensure they exist
let quizContainer = null;
let questionEl = null;
let optionsEl = null;
let timerEl = null;
let scoreEl = null;
let progressEl = null;
let initialQuizContainerMarkup = '';

function initializeDOM() {
	if (!quizContainer) {
		quizContainer = document.getElementById('quiz-container');
	}
	if (
		quizContainer &&
		!initialQuizContainerMarkup &&
		quizContainer.querySelector('.quiz-content')
	) {
		initialQuizContainerMarkup = quizContainer.innerHTML;
	}
	if (!questionEl) {
		questionEl = document.getElementById('question');
	}
	if (!optionsEl) {
		optionsEl = document.getElementById('options');
	}
	if (!timerEl) {
		timerEl = document.getElementById('timer');
	}
	if (!scoreEl) {
		scoreEl = document.getElementById('score');
	}
	if (!progressEl) {
		progressEl = document.getElementById('progress');
	}
}

function showQuizInterface() {
	const welcomePage = document.getElementById('welcome-page');
	const quizContent = document.querySelector('.quiz-content');

	if (welcomePage) {
		welcomePage.style.display = 'none';
	}
	if (quizContent) {
		quizContent.style.display = 'block';
	}

	return Boolean(quizContent);
}

/**
 * Helper function to check exam mode and get appropriate settings
 * Returns { mode, settings, examActiveSession } where:
 * - mode: 'exam' or 'training'
 * - settings: examActiveSession.settings (if exam) or quizSettings (if training)
 * - examActiveSession: the active session object (if exam) or null
 *
 * IMPORTANT: Exam mode requires both examActiveSession AND verified studentInfo
 * If studentInfo is missing, falls back to training mode with quizQuestions
 */
function getExamMode() {
	try {
		const activeSession = JSON.parse(
			localStorage.getItem('examActiveSession') || 'null',
		);

		// Check if exam session exists with studentInfo (already started)
		if (activeSession && activeSession.examId && activeSession.studentInfo) {
			const { numero, name, class: classInfo } = activeSession.studentInfo;

			// Verify that student and class are present
			if (numero && name && classInfo) {
				console.log(
					'Exam mode detected with verified student:',
					activeSession.examName,
					'Student:',
					name,
				);

				// Use examActiveSession settings as the primary settings, fall back to defaults
				const examSettings = activeSession.settings || {};

				return {
					mode: quizModes.exam,
					settings: examSettings,
					examActiveSession: activeSession,
				};
			} else {
				console.log(
					'Exam session exists but studentInfo incomplete, showing student form to complete it',
				);
				// Don't remove - let student complete the info and continue
				return {
					mode: quizModes.exam,
					settings: activeSession.settings || {},
					examActiveSession: activeSession,
				};
			}
		} else if (activeSession && activeSession.examId) {
			// Exam session exists but no studentInfo yet - show student form to start
			console.log(
				'Exam session received, waiting for student info before starting',
			);
			return {
				mode: quizModes.exam,
				settings: activeSession.settings || {},
				examActiveSession: activeSession,
			};
		}
	} catch (e) {
		console.error('Error loading examActiveSession:', e);
		localStorage.removeItem('examActiveSession');
	}

	// Training mode fallback - load from quizQuestions (uncategorized/default questions)
	console.log(
		'Training mode: loading from quizQuestions (default/uncategorized questions)',
	);
	const trainingSettings = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('settings')) || '{}',
	);

	return {
		mode: quizModes.training,
		settings: trainingSettings,
		examActiveSession: null,
	};
}

function loadQuizMode() {
	console.log('Loading quiz mode...');

	// Get exam mode and settings using the helper
	const { mode, settings, examActiveSession } = getExamMode();
	currentMode = mode;

	if (currentMode === quizModes.exam && examActiveSession) {
		// EXAM MODE
		console.log('Setting up EXAM mode with exam:', examActiveSession.examName);

		const questionBank = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
		);
		let resolvedExamQuestions = resolveQuestionReferences(
			examActiveSession.questions || [],
			questionBank,
		);

		if (!resolvedExamQuestions.length && examActiveSession.examId) {
			const savedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
			const sourceExam = savedExams.find(
				(exam) => String(exam.id) === String(examActiveSession.examId),
			);
			if (sourceExam && Array.isArray(sourceExam.questions)) {
				resolvedExamQuestions = resolveQuestionReferences(
					sourceExam.questions,
					questionBank,
				);
			}
		}

		currentExam = {
			id: examActiveSession.examId,
			name: examActiveSession.examName,
			questions: resolvedExamQuestions,
			duration: examActiveSession.duration || 60,
		};

		// Apply examActiveSession settings (overrides quizSettings)
		const examSettings = examActiveSession.settings || {};

		// Configure quiz with exam settings
				Object.assign(quizConfig, {
			totalQuestions: currentExam.questions.length,
			timeLimit: examActiveSession.timeLimit || currentExam.duration * 60,
			penalty: examSettings.penalty ?? examActiveSession.penalty ?? 0,
		});

		// Load questions from exam
		questions = [...currentExam.questions];

		// Update welcome screen with exam-specific settings
		const welcomeTitleEl = document.getElementById('welcome-title');
		const welcomeMessageEl = document.getElementById('welcome-message');

		console.log('Updating welcome screen for exam:');
		console.log('- examSettings.welcomeTitle:', examSettings.welcomeTitle);
		console.log('- examSettings.welcomeMessage:', examSettings.welcomeMessage);
		console.log('- examActiveSession.examName:', examActiveSession.examName);
		console.log('- examActiveSession.duration:', examActiveSession.duration);
		console.log('- welcomeTitleEl found:', !!welcomeTitleEl);
		console.log('- welcomeMessageEl found:', !!welcomeMessageEl);

		if (welcomeTitleEl) {
			const newTitle = examSettings.welcomeTitle || examActiveSession.examName;
			console.log('Setting welcome title to:', newTitle);
			welcomeTitleEl.textContent = newTitle;
		}
		if (welcomeMessageEl) {
			const newMessage =
				examSettings.welcomeMessage ||
				`You have ${examActiveSession.duration} minutes to complete this exam.`;
			console.log('Setting welcome message to:', newMessage);
			welcomeMessageEl.textContent = newMessage;
		}

		// Check if student info is already present (Resuming functionality)
		if (examActiveSession.studentInfo && examActiveSession.studentInfo.numero) {
			console.log(
				'Resuming exam for student:',
				examActiveSession.studentInfo.name,
			);

			// Fill form if possible
			const studentInfoForm = document.getElementById('student-info');
			if (studentInfoForm) {
				studentInfoForm.numero.value = examActiveSession.studentInfo.numero;
				studentInfoForm.name.value = examActiveSession.studentInfo.name;
				studentInfoForm.class.value = examActiveSession.studentInfo.class;
			}
		}

		console.log(
			'Exam mode ready with',
			currentExam.questions.length,
			'questions',
		);
		return;
	}

	// TRAINING MODE (default fallback)
	console.log('Setting up TRAINING mode');
	currentMode = quizModes.training;
	currentExam = null;

	// Load questions from training storage
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	questions = savedQuestions;

	// Use the settings from getExamMode (which loads quizSettings for training mode)
	const trainingSettings = settings;

	// Update welcome screen with training settings
	const welcomeTitleEl = document.getElementById('welcome-title');
	const welcomeMessageEl = document.getElementById('welcome-message');

	if (welcomeTitleEl) {
		welcomeTitleEl.textContent = trainingSettings.welcomeTitle || 'Quiz Portal';
	}
	if (welcomeMessageEl) {
		welcomeMessageEl.textContent =
			trainingSettings.welcomeMessage ||
			'Welcome! Please enter your details to begin the assessment.';
	}

	// Configure quiz with training settings
	Object.assign(quizConfig, {
		totalQuestions: Math.min(
			trainingSettings.totalQuestions || 5,
			questions.length,
		),
		timeLimit: trainingSettings.timeLimit || 300,
		penalty: trainingSettings.penalty || 0,
	});

	console.log('Training mode ready');
}

/**
 * Helper function to save answer to appropriate storage based on mode
 * In EXAM mode: saves to examActiveSession
 * In TRAINING mode: saves to question object (for later save to quizActivity/quizResult)
 */
function saveAnswer(questionIndex, userAnswer, isCorrect, questionPoints) {
	const q = questions[questionIndex];

	// Always save to question object for final results processing
	q.userAnswer = userAnswer;
	q.isCorrect = isCorrect;
	q.timeTaken = q.timeTaken || 0;

	// In EXAM mode, also update examActiveSession in real-time
	if (currentMode === quizModes.exam) {
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || '{}',
			);
			if (activeSession.examId) {
				// Initialize answers array if not present
				if (!activeSession.answers) {
					activeSession.answers = [];
				}

				// Find or create answer record
				let answerRecord = activeSession.answers.find(
					(a) => a.questionIndex === questionIndex,
				);
				if (!answerRecord) {
					answerRecord = {
						questionIndex: questionIndex,
						questionId: q.id,
						questionText: q.question,
					};
					activeSession.answers.push(answerRecord);
				}

				// Update answer data
				answerRecord.userAnswer = userAnswer;
				answerRecord.isCorrect = isCorrect;
				answerRecord.points = questionPoints || q.points || 1;
				answerRecord.pointsAwarded = isCorrect
					? questionPoints || q.points || 1
					: 0;
				answerRecord.type = q.type || 'multiple-choice';
				answerRecord.timestamp = new Date().toISOString();

				// Save back to localStorage
				localStorage.setItem(
					'examActiveSession',
					JSON.stringify(activeSession),
				);
				console.log(`Saved answer ${questionIndex} to examActiveSession`);
			}
		} catch (e) {
			console.error('Error saving answer to examActiveSession:', e);
		}
	}
}

/**
 * Helper function to log student activity to quizActivity
 * Logs both exam and training mode activities for unified activity log
 */
function logActivity(type, details = {}) {
	try {
		const studentInfoForm = document.getElementById('student-info');
		const studentInfo = {
			numero: studentInfoForm?.numero?.value || 'Unknown',
			name: studentInfoForm?.name?.value || 'Student',
			class: studentInfoForm?.class?.value || 'Unknown',
		};

		let activityEntry = {
			type: type,
			timestamp: new Date().toISOString(),
			date: new Date().toISOString(),
			dateDisplay: new Date().toLocaleString(),
			mode: currentMode,
			studentName: studentInfo.name,
			studentNumber: studentInfo.numero,
			class: studentInfo.class,
			isValid: true,
		};

		// Merge additional details
		Object.assign(activityEntry, details);

		// Get existing activity or initialize empty array
		let quizActivity = [];
		try {
			quizActivity = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
		} catch (e) {
			console.error('Error parsing quizActivity:', e);
			quizActivity = [];
		}

		// Add new activity
		quizActivity.unshift(activityEntry);

		// Deduplicate by type+studentNumber+timestamp if needed (keep last 1000 entries)
		const dedup = [];
		const seen = new Set();
		for (const a of quizActivity) {
			const key =
				(a.type || '') +
				'||' +
				(a.studentNumber || '') +
				'||' +
				(a.timestamp || '');
			if (!seen.has(key)) {
				seen.add(key);
				dedup.push(a);
				if (dedup.length >= 1000) break; // Keep last 1000 activities
			}
		}

		window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', dedup);
		console.log(`Logged activity: ${type}`, activityEntry);

		// Try to refresh dashboard/activity UI if available
		if (typeof window.initDashboard === 'function') window.initDashboard();
		else if (typeof window.renderRecentActivity === 'function')
			window.renderRecentActivity();
	} catch (err) {
		console.error('Failed to log activity:', err);
	}
}

function hasStudentTakenExam(examId, studentNumber, studentClass) {
	if (!examId || !studentNumber) return false;

	try {
		const quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');

		// Check if student has already taken this specific exam
		return quizResults.some((result) => {
			return (
				result.examId === examId &&
				String(result.numero) === String(studentNumber) &&
				String(result.class) === String(studentClass)
			);
		});
	} catch (e) {
		console.error('Error checking student exam status:', e);
		return false;
	}
}

function sanitizeStudentInfo(raw = {}) {
	return {
		numero: String(
			raw.numero ?? raw.number ?? raw.studentNumber ?? '',
		).trim(),
		name: String(raw.name ?? raw.fullName ?? raw.username ?? '').trim(),
		class: String(raw.class ?? raw.className ?? '').trim(),
	};
}

function getStudentInfoFromForm() {
	const form = document.getElementById('student-info');
	return sanitizeStudentInfo({
		numero: form?.numero?.value || '',
		name: form?.name?.value || '',
		class: form?.class?.value || '',
	});
}

function isStudentAllowedInSession(activeSession = {}, studentInfo = {}) {
	const normalizedStudent = sanitizeStudentInfo(studentInfo);
	const allowedStudents = Array.isArray(activeSession.allowedStudents)
		? activeSession.allowedStudents
		: [];
	if (!allowedStudents.length) return false;

	return allowedStudents.some((entry) => {
		const allowed = sanitizeStudentInfo({
			numero: entry.number ?? entry.numero ?? entry.studentNumber ?? '',
			class: entry.className ?? entry.class ?? entry.classId ?? '',
		});
		const allowedClassId = String(entry.classId ?? '').trim().toLowerCase();
		const studentClass = normalizedStudent.class.toLowerCase();
		const classMatch =
			allowed.class.toLowerCase() === studentClass ||
			(allowedClassId && allowedClassId === studentClass);
		return (
			allowed.numero === normalizedStudent.numero &&
			classMatch
		);
	});
}

function initQuiz() {
	console.log('Initializing quiz...');

	// Set initial quiz mode display
	const quizModeEl = document.getElementById('quiz-mode');
	if (quizModeEl) {
		quizModeEl.textContent =
			currentMode === quizModes.training ? 'Training' : 'Exam';
	}

	// If currentExam is already set, we don't need to load quiz mode
	if (!currentExam) {
		console.log('No current exam set, loading quiz mode...');
		// Load quiz mode and check for available exams
		loadQuizMode();
	} else {
		console.log('Current exam already set:', currentExam.name);
	}

	// Initialize quiz state
	currentQuestion = 0;
	score = 0;
	timeRemaining = quizConfig.timeLimit;

	// Enforce exam allowlist before loading questions
	if (currentMode === quizModes.exam) {
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || '{}',
			);
			const hasAllowedStudents =
				Array.isArray(activeSession.allowedStudents) &&
				activeSession.allowedStudents.length > 0;

			if (!hasAllowedStudents) {
				showPremiumModal({
					title: 'Student Verification Required',
					message:
						'This exam requires student verification, but no allowed students were provided. Please contact your teacher/admin.',
					type: 'security',
					options: {
						showGoBack: true,
						showTrainingMode: true,
					},
				});
				return;
			}

			const sessionStudent = sanitizeStudentInfo(activeSession.studentInfo || {});
			const formStudent = getStudentInfoFromForm();
			const studentInfo = sessionStudent.numero ? sessionStudent : formStudent;

			if (!studentInfo.numero || !studentInfo.name || !studentInfo.class) {
				showToast('Please fill in all student information', 'error');
				return;
			}

			if (!isStudentAllowedInSession(activeSession, studentInfo)) {
				showPremiumModal({
					title: 'Access Denied',
					message: `Student number "${studentInfo.numero}" is not registered for this exam.`,
					type: 'security',
					options: {
						showGoBack: true,
						showTrainingMode: true,
					},
				});
				return;
			}

			// Persist validated student info to active session if missing
			if (!sessionStudent.numero) {
				activeSession.studentInfo = studentInfo;
				activeSession.startedAt =
					activeSession.startedAt || new Date().toISOString();
				localStorage.setItem('examActiveSession', JSON.stringify(activeSession));
			}
		} catch (error) {
			console.error('Exam allowlist validation failed:', error);
			showToast('Unable to validate exam access. Please refresh.', 'error');
			return;
		}
	}

	// QUESTIONS LOADING LOGIC - Use the appropriate data source based on mode
	if (currentMode === quizModes.exam && currentExam && currentExam.questions) {
		console.log('EXAM MODE: Using questions from examActiveSession');
		const questionBank = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
		);
		questions = resolveQuestionReferences(currentExam.questions, questionBank);

		// Validate and sanitize questions
		validateAndFixQuestions(questions);

		quizConfig.totalQuestions = questions.length;

		// Shuffle if configured
		shuffleArray(questions);
		console.log(`Loaded ${questions.length} questions for exam`);
	} else {
		// TRAINING MODE: Load from quizQuestions storage
		console.log('TRAINING MODE: Using questions from quizQuestions storage');
		const savedQuestions = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
		);

		questions = savedQuestions.length > 0 ? [...savedQuestions] : [];

		// Validate and sanitize questions
		validateAndFixQuestions(questions);

		// Shuffle
		shuffleArray(questions);

		// Limit to totalQuestions setting
		if (questions.length > quizConfig.totalQuestions) {
			questions = questions.slice(0, quizConfig.totalQuestions);
		}

		console.log(`Prepared ${questions.length} questions for training`);
	}

	// Make sure we have questions to display
	if (!questions || questions.length === 0) {
		console.error('No questions available for the quiz');

		// If we're in exam mode but have no questions, try to load default questions
		if (currentMode === quizModes.exam && currentExam) {
			console.log('Trying to load default questions for exam...');
			const savedQuestions = JSON.parse(
				JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
			);
			if (savedQuestions && savedQuestions.length > 0) {
				// Use the first 5 questions as a fallback and shuffle them
				questions = savedQuestions.slice(0, 5);
				shuffleArray(questions);
				console.log(
					`Loaded and shuffled ${questions.length} default questions as fallback`,
				);
			}
		}

		// If we still have no questions, show an error
		if (!questions || questions.length === 0) {
			showPremiumModal({
				title: '⚠️ No Questions Available',
				message: 'There are no questions available for this quiz.',
				type: 'security',
				options: {
					showTrainingMode: true,
					showGoBack: true,
				},
			});
			return;
		}
	}

	console.log('Final questions array length:', questions.length);
	console.log(
		'First question sample:',
		questions.length > 0 ? questions[0].question : 'No questions',
	);

	updateTimerDisplay();
	updateScoreDisplay();
	showQuestion(currentQuestion);

	startTimer();
}

function startTimer() {
	timerId = setInterval(() => {
		timeRemaining--;
		updateTimerDisplay();
		if (timeRemaining <= 0) endQuiz();
	}, 1000);
}

function applyTimePenalty() {
	timeRemaining = Math.max(0, timeRemaining - quizConfig.penalty);
	updateTimerDisplay();
}

function showQuestion(index) {
	console.log('=== showQuestion CALLED with index:', index);

	// Ensure DOM elements are available
	initializeDOM();

	if (!questionEl || !optionsEl || !progressEl) {
		console.error('Cannot display question - DOM elements not found', {
			questionEl: !!questionEl,
			optionsEl: !!optionsEl,
			progressEl: !!progressEl,
		});
		return;
	}

	const q = questions[index];
	if (!q) {
		console.error('Invalid question index:', index);
		return;
	}
	const questionPrompt = String(q.question || q.text || '').trim();

	// Determine question type
	const questionType =
		q.type ||
		(q.isDraggable
			? 'draggable'
			: q.answer && q.answer.includes('→')
				? 'matching-pairs'
				: 'multiple-choice');
	const isMultipleChoiceQuestion = questionType === 'multiple-choice';
	const isMultiAnswerMode =
		isMultipleChoiceQuestion && isQuestionMultiAnswer(q);

	// Set question text with image if available
	questionEl.innerHTML = q.image
		? `<img src="${q.image}" alt="Question illustration"><br>${escapeHtml(
				questionPrompt,
			)}`
		: escapeHtml(questionPrompt);

	// Add question type indicator for clarity
	let typeIndicator = '';

	if (questionType === 'odd-one-out') {
		typeIndicator = `<div class="question-type-badge odd-one-out">Find the odd one out</div>`;
	} else if (questionType === 'draggable') {
		typeIndicator = `<div class="question-type-badge draggable">Arrange in order</div>`;
	} else if (questionType === 'matching-pairs') {
		typeIndicator = `<div class="question-type-badge matching-pairs">Match the pairs</div>`;
	} else if (questionType === 'fill-blank') {
		typeIndicator = `<div class="question-type-badge fill-blank">Fill in the blanks</div>`;
	} else {
		typeIndicator = `<div class="question-type-badge">Multiple choice</div>`;
	}
	const choiceModeIndicator = isMultipleChoiceQuestion
		? `<div class="question-answer-mode ${
				isMultiAnswerMode ? 'multiple' : 'single'
			}">${isMultiAnswerMode ? 'Multiple answers' : 'Single answer'}</div>`
		: '';

	// Display instruction if available
	const instructionHtml = q.instruction
		? `<div class="question-instruction">${escapeHtml(q.instruction)}</div>`
		: '';

	// Create a wrapper for the question with the type indicator positioned to the right
	questionEl.innerHTML = `
    <div class="instruction-wrapper">
      ${instructionHtml}
      <div class="question-badges">
        ${typeIndicator}
        ${choiceModeIndicator}
      </div>
    </div>
    <div class="question-header">
      <div class="question-text">${escapeHtml(questionPrompt)}</div>
    </div>
    ${
			q.image
				? `
      <div class="question-image-container" onclick="previewImage('${q.image}')">
        <img src="${q.image}" alt="Question illustration">
      </div>
    `
				: ''
		}
  `;

  // Render code snippet if it's a code question
  if (q.type === 'code' && q.codeSnippet) {
	const codeHtml = `
	  <div class="code-snippet-block">
        <div class="code-snippet-header">
          <div class="code-snippet-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="code-language-badge">${q.codeLanguage || 'code'}</div>
        </div>
        <pre><code class="language-${q.codeLanguage || 'javascript'}">${escapeHtml(q.codeSnippet)}</code></pre>
      </div>
	`;
	questionEl.innerHTML += codeHtml;
	
	// Trigger syntax highlighting
	const codeBlock = questionEl.querySelector('.code-snippet-block pre code');
	if (codeBlock && typeof hljs !== 'undefined') {
		hljs.highlightElement(codeBlock);
	}
  }

	// Get option data with images if available
	console.log('Question options raw:', q.options);
	console.log('Question optionData raw:', q.optionData);
	console.log('Full question object:', q);

	const optionData = extractQuestionOptionData(q);
	q.optionData = optionData;
	q.options = optionData
		.map((entry) => String(entry.text || '').trim())
		.filter(Boolean);

	// Get the effective question type (delegate to sub-type if it's a code question)
	const effectiveQuestionType = (q.type === 'code' && q.codeAnswerMode) ? q.codeAnswerMode : questionType;

	// Handle different question types
	if (effectiveQuestionType === 'draggable') {
		optionsEl.innerHTML = `
      <div class="draggable-container">
        ${optionData
					.map((option) => {
						const optionText =
							typeof option === 'string' ? option : option.text;
						const optionImage =
							typeof option === 'object' && option.image ? option.image : '';
						const isImageOnly =
							option.isImageOnly || (optionImage && !optionText);

						return `
          <div class="draggable-option ${optionImage ? 'image-option' : ''} ${
						isImageOnly ? 'image-only' : ''
					}" draggable="true">
            ${
							optionImage
								? `
              <div class="option-image-container" onclick="event.stopPropagation(); previewImage('${optionImage}')">
                <img src="${optionImage}" class="option-image" alt="Option image">
              </div>
            `
								: ''
						}
            ${
							!isImageOnly
								? `<div class="option-label">${escapeHtml(optionText)}</div>`
								: ''
						}
          </div>
        `;
					})
					.join('')}
      </div>
      <button class="next-question-btn" onclick="handleDraggableNext()">Next Question</button>
    `;

		initializeDragAndDrop();
	} else if (questionType === 'odd-one-out') {
		optionsEl.innerHTML = `
      <div class="odd-one-out-container">
        ${optionData
					.map((option, i) => {
						const optionText =
							typeof option === 'string' ? option : option.text;
						const optionImage =
							typeof option === 'object' && option.image ? option.image : '';
						const isImageOnly =
							option.isImageOnly || (optionImage && !optionText);

						return `
          <button class="odd-one-option ${optionImage ? 'image-option' : ''} ${
						isImageOnly ? 'image-only' : ''
					}" onclick="selectOption(${i})">
            ${
							optionImage
								? `
              <div class="option-image-container" onclick="event.stopPropagation(); previewImage('${optionImage}')">
                <img src="${optionImage}" class="option-image" alt="Option image">
              </div>
            `
								: ''
						}
            ${
							!isImageOnly
								? `<div class="option-label">${escapeHtml(optionText)}</div>`
								: ''
						}
          </button>
        `;
					})
					.join('')}
      </div>
    `;
	} else if (questionType === 'matching-pairs') {
		// ... (matching pairs code remains unchanged) ...
		// Parse the answer to get the pairs
		const answer = q.answer || '';
		const pairs = (answer.includes('|') ? answer.split('|') : answer.split(',')).map((pair) => {
			// Support '→', '-->', and ':' separators
			let left, right;
			if (pair.includes('→')) {
				[left, right] = pair.split('→').map((item) => item.trim());
			} else if (pair.includes('-->')) {
				[left, right] = pair.split('-->').map((item) => item.trim());
			} else if (pair.includes(':')) {
				[left, right] = pair.split(':').map((item) => item.trim());
			} else {
				[left, right] = [pair.trim(), ''];
			}
			return { left, right };
		});

		// Create unique lists for left and right columns
		let leftItems = [...new Set(pairs.map((p) => p.left))];
		let rightItems = [...new Set(pairs.map((p) => p.right))];

		// Shuffle both columns independently for variety
		shuffleArray(leftItems);
		shuffleArray(rightItems);

		// Helper to find image for an item
		const getItemImage = (text) => {
			if (!q.optionData || !Array.isArray(q.optionData)) return null;
			if (!text) return null;

			// Try exact match
			let match = q.optionData.find((opt) => opt.text === text);

			// Try match by image number/ID if text looks like "Image X"
			if (!match && typeof text === 'string') {
				const imageNumberMatch = text.match(/^(?:image|img)[-_\s]*(\d+)$/i);
				if (imageNumberMatch) {
					const number = imageNumberMatch[1];
					match = q.optionData.find(
						(opt) =>
							opt.number === number ||
							opt.number === parseInt(number) ||
							(opt.id && opt.id.includes(number)),
					);
				}
			}

			return match ? match.image : null;
		};

		optionsEl.innerHTML = `
      <div class="matching-pairs-quiz">
        <div class="matching-columns">
        <div class="matching-column quiz-left-column">
          <h4>Left Column</h4>
          ${leftItems
						.map((item, i) => {
							const image = getItemImage(item);
							return `
            <div class="matching-item quiz-item ${
							image ? 'has-image' : ''
						}" data-value="${item}" data-column="left" data-index="${i}">
              ${
								image
									? `
                <div class="matching-item-image-container" onclick="event.stopPropagation(); previewImage('${image}')">
                  <img src="${image}" class="matching-item-image" alt="${item}">
                </div>
              `
									: ''
							}
              <div class="matching-item-text">${item}</div>
            </div>
          `;
						})
						.join('')}
        </div>
        <div class="matching-column quiz-right-column">
          <h4>Right Column</h4>
          ${rightItems
						.map((item, i) => {
							const image = getItemImage(item);
							return `
            <div class="matching-item quiz-item ${
							image ? 'has-image' : ''
						}" data-value="${item}" data-column="right" data-index="${i}">
              ${
								image
									? `
                <div class="matching-item-image-container" onclick="event.stopPropagation(); previewImage('${image}')">
                  <img src="${image}" class="matching-item-image" alt="${item}">
                </div>
              `
									: ''
							}
              <div class="matching-item-text">${item}</div>
            </div>
          `;
						})
						.join('')}
        </div>
        </div>
        <div class="matching-connections quiz-connections">
          ${pairs
						.map(
							(pair) => `
            <div class="matching-connection quiz-connection"
                 data-left="${pair.left}"
                 data-right="${pair.right}"
                 style="display: none;">
            </div>
          `,
						)
						.join('')}
        </div>
        <div class="matching-status">
          <div class="status-item">
            <span class="status-label">Pairs matched:</span>
            <span id="matched-pairs-count" class="status-value">0</span>
          </div>
          <div class="status-item">
            <span class="status-label">Total pairs:</span>
            <span id="total-pairs-count" class="status-value">${
							pairs.length
						}</span>
          </div>
        </div>
      </div>
    `;

		// Initialize matching pairs interaction
		initializeMatchingPairsQuiz();
	} else if (questionType === 'fill-blank') {
		// ... (fill-blank code remains unchanged) ...
		// Fill in the blank question type
		// Fill in the blank question type
		let questionText = q.question;

		// Support "___" pattern by converting to {{id}}
		// First, find the maximum existing ID to avoid collisions
		let maxId = 0;
		const idCheckPattern = /\{\{(\d+)\}\}/g;
		let idMatch;
		// Create a temp copy to scan for max ID so we don't mess up the regex state on the main text yet
		while ((idMatch = idCheckPattern.exec(questionText)) !== null) {
			const id = parseInt(idMatch[1]);
			if (id > maxId) maxId = id;
		}

		// Replace underscores (3 or more) with new IDs
		let nextId = maxId + 1;
		// We use a regex to find 3 or more underscores
		questionText = questionText.replace(/_{3,}/g, () => {
			return `{{${nextId++}}}`;
		});

		const blankPattern = /\{\{(\d+)\}\}/g;
		const blanks = [];
		let match;

		// Find all blanks
		while ((match = blankPattern.exec(questionText)) !== null) {
			const blankId = parseInt(match[1]);
			if (!blanks.find((b) => b.id === blankId)) {
				blanks.push({ id: blankId });
			}
		}

		// Sort blanks by ID
		blanks.sort((a, b) => a.id - b.id);

		// Replace {{number}} with input fields or drop zones
		let questionWithInputs = escapeHtml(questionText);

		// Check if word bank is enabled
		const useWordBank = q.useWordBank || false;

		blanks.forEach((blank) => {
			const regex = new RegExp(`\\{\\{${blank.id}\\}\\}`, 'g');
			if (useWordBank) {
				questionWithInputs = questionWithInputs.replace(
					regex,
					`<span class="fill-blank-wrapper">
            <span class="blank-number-badge">${blank.id}</span>
            <div 
              class="fill-blank-drop-zone" 
              id="blank-drop-${blank.id}"
              data-blank-id="${blank.id}"
              ondragover="allowDrop(event)"
              ondrop="handleDrop(event)"
              onclick="handleDropZoneClick(this)"
            ></div>
          </span>`,
				);
			} else {
				questionWithInputs = questionWithInputs.replace(
					regex,
					`<span class="fill-blank-wrapper">
            <span class="blank-number-badge">${blank.id}</span>
            <input 
              type="text" 
              class="fill-blank-input" 
              id="blank-input-${blank.id}"
              data-blank-id="${blank.id}"
              placeholder="..."
              autocomplete="off"
            >
          </span>`,
				);
			}
		});

		// Update question element with inputs
		// Note: We need to update the question text specifically for fill-blank,
		// but keep the structure we set up above
		const questionTextEl = questionEl.querySelector('.question-text');
		if (questionTextEl) {
			window.safeSetHTML ? window.safeSetHTML(questionTextEl, questionWithInputs, true) : (questionTextEl.innerHTML = questionWithInputs);
			questionTextEl.classList.add('fill-blank-question');
		}

		if (useWordBank) {
			// Prepare word bank options
			let wordBankOptions = [];

			// Get correct answers
			if (q.answer) {
				// Parse serialized answer: "1:ans1|2:ans2"
				const parts = q.answer.split('|');
				parts.forEach((part) => {
					const [id, val] = part.split(':');
					if (val) {
						// Handle multiple correct answers for a blank (comma separated)
						// For word bank, we usually pick the first one or split them?
						// Let's assume the first one is the primary answer for the bank.
						const answers = val.split(',');
						answers.forEach((a) => {
							if (a.trim()) wordBankOptions.push(a.trim());
						});
					}
				});
			}

			// Add distractors (from options field or optionData)
			// We want to preserve the full object structure if possible to keep images
			if (
				q.optionData &&
				Array.isArray(q.optionData) &&
				q.optionData.length > 0
			) {
				// Use optionData as the primary source
				wordBankOptions = [...wordBankOptions, ...q.optionData];
			} else if (
				q.options &&
				Array.isArray(q.options) &&
				q.options.length > 0
			) {
				wordBankOptions = [...wordBankOptions, ...q.options];
			} else if (q.distractors && Array.isArray(q.distractors)) {
				wordBankOptions = [...wordBankOptions, ...q.distractors];
			}

			// Remove duplicates based on text content
			const uniqueOptions = [];
			const seenTexts = new Set();

			wordBankOptions.forEach((opt) => {
				const text = typeof opt === 'object' ? opt.text || '' : opt;
				if (!seenTexts.has(text) && text !== '') {
					seenTexts.add(text);
					uniqueOptions.push(opt);
				}
			});

			wordBankOptions = uniqueOptions;
			shuffleArray(wordBankOptions);

			optionsEl.innerHTML = `
        <div class="fill-blank-container">
          <div class="fill-blank-hint">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 7h16M4 12h10M4 17h16"></path>
            </svg>
            Drag words to the blanks above
          </div>
          <div class="word-bank" id="word-bank">
            ${wordBankOptions
							.map((item, i) => {
								const text = typeof item === 'object' ? item.text || '' : item;
								const image = typeof item === 'object' ? item.image || '' : '';
								return `
              <div class="word-bank-item ${image ? 'has-image' : ''}" 
                   draggable="true" 
                   ondragstart="handleDragStart(event)" 
                   onclick="handleWordClick(this)"
                   data-word="${escapeHtml(text)}">
                ${
									image
										? `<img src="${image}" alt="${escapeHtml(
												text,
											)}" class="word-bank-image">`
										: ''
								}
                <span>${escapeHtml(text)}</span>
              </div>
            `;
							})
							.join('')}
          </div>
          <button class="fill-blank-submit" onclick="validateFillBlankAnswer()">
            Submit Answer
          </button>
        </div>
      `;
		} else {
			// Render submit button in options area (standard)
			optionsEl.innerHTML = `
        <div class="fill-blank-container">
          <div class="fill-blank-hint">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4M12 8h.01"></path>
            </svg>
            Fill in all ${blanks.length} blank${
							blanks.length > 1 ? 's' : ''
						} above
          </div>
          <button class="fill-blank-submit" onclick="validateFillBlankAnswer()">
            Submit Answer
          </button>
        </div>
      `;
		}

		// Auto-focus first input
		setTimeout(() => {
			const firstInput = document.getElementById(`blank-input-${blanks[0].id}`);
			if (firstInput) firstInput.focus();
		}, 100);

		// Add Enter key navigation
		blanks.forEach((blank, index) => {
			const input = document.getElementById(`blank-input-${blank.id}`);
			if (input) {
				input.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (index < blanks.length - 1) {
							// Move to next blank
							const nextInput = document.getElementById(
								`blank-input-${blanks[index + 1].id}`,
							);
							if (nextInput) nextInput.focus();
						} else {
							// Submit on last blank
							validateFillBlankAnswer();
						}
					}
				});
			}
		});
	} else {
		// Default multiple choice
		if (isMultiAnswerMode) {
			// Multi-select with checkboxes
			optionsEl.innerHTML =
				optionData
					.map((option, i) => {
						const optionText =
							typeof option === 'string' ? option : option.text || '';
						const optionImage =
							typeof option === 'object' && option.image ? option.image : '';
						// Check if this is image-only: explicit flag, or has image with empty/auto-generated text
						const isImageOnly =
							option.isImageOnly ||
							(optionImage &&
								(!optionText ||
									optionText.trim() === '' ||
									/^(image|img)[-_\s]*\d+$/i.test(optionText.trim())));

						return `
        <label class="multi-option ${optionImage ? 'image-option' : ''} ${
					isImageOnly ? 'image-only' : ''
				}">
          <input type="checkbox" name="option-${currentQuestion}" value="${i}">
          ${
						optionImage
							? `
            <div class="option-image-container" onclick="event.preventDefault(); previewImage('${optionImage}')">
              <img src="${optionImage}" class="option-image" alt="Option image">
              <div class="image-overlay">${escapeHtml(
								optionText || `Image ${i + 1}`,
							)}</div>
            </div>
          `
							: ''
					}
          ${
						!isImageOnly
							? `<div class="option-label">${escapeHtml(optionText)}</div>`
							: ''
					}
        </label>
      `;
					})
					.join('') +
				`<button class="submit-btn" onclick="submitMultiSelect(${currentQuestion})">Submit Answer</button>`;
		} else {
			// Original button-based rendering for single-select
			optionsEl.innerHTML = optionData
				.map((option, i) => {
					const optionText =
						typeof option === 'string' ? option : option.text || '';
					const optionImage =
						typeof option === 'object' && option.image ? option.image : '';
					// Check if this is image-only: explicit flag, or has image with empty/auto-generated text
					const isImageOnly =
						option.isImageOnly ||
						(optionImage &&
							(!optionText ||
								optionText.trim() === '' ||
								/^(image|img)[-_\s]*\d+$/i.test(optionText.trim())));

					return `
        <button class="option-btn ${optionImage ? 'image-option' : ''} ${
					isImageOnly ? 'image-only' : ''
				}" onclick="selectOption(${i})">
          ${
						optionImage
							? `
            <div class="option-image-container" onclick="event.stopPropagation(); previewImage('${optionImage}')">
              <img src="${optionImage}" class="option-image" alt="Option image">
            </div>
          `
							: ''
					}
          ${
						!isImageOnly
							? `<div class="option-label">${escapeHtml(optionText)}</div>`
							: ''
					}
        </button>
      `;
				})
				.join('');
		}
	}

	// Update progress indicator
	initializeDOM();
	if (progressEl) {
		progressEl.textContent = `${index + 1}/${quizConfig.totalQuestions}`;
	}

	// Update quiz mode display
	const quizModeEl = document.getElementById('quiz-mode');
	if (quizModeEl) {
		quizModeEl.textContent =
			currentMode === quizModes.training ? 'Training' : 'Exam';
	}
}

function selectOption(selectedIndex) {
	console.log('=== selectOption CALLED ===');
	console.log('selectedIndex:', selectedIndex);
	console.log('currentQuestion before increment:', currentQuestion);

	const q = questions[currentQuestion];
	const questionType =
		q.type || (q.isDraggable ? 'draggable' : 'multiple-choice');

	console.log('Question type detected:', questionType);
	console.log('Question text:', q.question?.substring(0, 50));

	// Skip multi-select questions - they will be handled by submitMultiSelect
	if (questionType === 'multiple-choice' && isQuestionMultiAnswer(q)) {
		console.log('Skipping - multi-select question');
		return;
	}

	// Skip matching pairs questions - they will be handled by handleMatchingPairsNext
	if (questionType === 'matching-pairs') {
		return;
	}

	// Skip fill-blank questions - they will be handled by validateFillBlankAnswer
	if (questionType === 'fill-blank') {
		return;
	}

	// Get the appropriate buttons based on question type
	let buttons;
	if (questionType === 'odd-one-out') {
		buttons = optionsEl.querySelectorAll('.odd-one-option');
	} else {
		buttons = optionsEl.getElementsByTagName('button');
	}

	// Disable all buttons
	Array.from(buttons).forEach((btn) => (btn.disabled = true));

	// Get option data with images if available
	const optionData = extractQuestionOptionData(q);

	// Get the selected option text
	const selectedOption = optionData[selectedIndex];
	if (!selectedOption) {
		console.warn('Invalid selected option index:', selectedIndex, optionData);
		return;
	}
	const selectedText =
		typeof selectedOption === 'string' ? selectedOption : selectedOption.text;

	// Get the correct answer(s)
	const correctAnswer = q.answer;

	// Check if this is a multiple choice question with multiple correct answers
	const isMultipleCorrectAnswers =
		questionType === 'multiple-choice' &&
		isQuestionMultiAnswer(q) &&
		/[|,\n;،]/.test(String(correctAnswer || ''));

	// For multiple correct answers, split into an array
	const correctAnswers = isMultipleCorrectAnswers
		? splitChoiceAnswerTokens(correctAnswer)
		: [correctAnswer];

	console.log('Question type:', q.type);
	console.log('Allow multiple answers:', isQuestionMultiAnswer(q));
	console.log('Correct answers:', correctAnswers);
	console.log('Selected text:', selectedText);

	// Check if the selected answer is correct
	const isCorrect = correctAnswers.includes(selectedText);

	// Get question points for scoring
	const questionPoints = q.points || 1;

	// Save answer to appropriate storage (uses saveAnswer helper)
	saveAnswer(currentQuestion, selectedText, isCorrect, questionPoints);

	if (currentMode === quizModes.training) {
		// Use existing feedback logic
		if (isCorrect) {
			score += questionPoints;
			buttons[selectedIndex].classList.add('correct');
			updateScoreDisplay();

			// If there are multiple correct answers, highlight them all
			if (isMultipleCorrectAnswers) {
				// Find and highlight all other correct answers
				Array.from(buttons).forEach((btn, idx) => {
					if (idx !== selectedIndex) {
						const btnOption = optionData[idx];
						const btnText =
							typeof btnOption === 'string' ? btnOption : btnOption.text;

						if (correctAnswers.includes(btnText)) {
							btn.classList.add('correct');
						}
					}
				});
			}
		} else {
			buttons[selectedIndex].classList.add('incorrect');
			applyTimePenalty();
		}
	} else {
		// Exam mode - just record the answer without visual feedback
		if (isCorrect) {
			score += questionPoints;
			updateScoreDisplay();
		}
	}

	setTimeout(() => {
		try {
			console.log('=== selectOption setTimeout triggered ===');
			console.log('currentQuestion before increment:', currentQuestion);
			currentQuestion++;
			console.log('currentQuestion after increment:', currentQuestion);
			console.log(
				'Total questions:',
				Math.min(questions.length, quizConfig.totalQuestions),
			);

			// Fixed the condition to properly end the quiz
			if (
				currentQuestion >= Math.min(questions.length, quizConfig.totalQuestions)
			) {
				console.log('Quiz ending - reached max questions');
				endQuiz();
			} else {
				console.log(
					'Moving to next question - calling showQuestion(' +
						currentQuestion +
						')',
				);
				showQuestion(currentQuestion);
				console.log('showQuestion completed');
			}
		} catch (error) {
			console.error('ERROR in selectOption setTimeout:', error);
			console.error('Error stack:', error.stack);
		}
	}, 100);
}

function submitMultiSelect(questionIndex) {
	const q = questions[questionIndex];
	const questionType = q.type || (q.isDraggable ? 'draggable' : 'multiple-choice');
	const selected = [];
	document
		.querySelectorAll(`input[name="option-${questionIndex}"]:checked`)
		.forEach((checkbox) => {
			selected.push(parseInt(checkbox.value));
		});

	// Get option data with images if available
	const optionData = extractQuestionOptionData(q);

	// Get the selected option texts
	const selectedOptions = selected
		.map((idx) => {
			const selectedOption = optionData[idx];
			if (!selectedOption) return '';
			return typeof selectedOption === 'string'
				? selectedOption
				: selectedOption.text;
		})
		.map((value) => String(value || '').trim())
		.filter(Boolean);

	// Get the correct answer(s)
	const correctAnswer = q.answer;

	// Check if this is a multiple choice question with multiple correct answers
	const isMultipleCorrectAnswers =
		questionType === 'multiple-choice' &&
		isQuestionMultiAnswer(q) &&
		/[|,\n;،]/.test(String(correctAnswer || ''));

	// For multiple correct answers, split into an array
	const correctAnswers = isMultipleCorrectAnswers
		? splitChoiceAnswerTokens(correctAnswer)
		: [correctAnswer];

	console.log('Multi-select question type:', q.type);
	console.log('Allow multiple answers:', isQuestionMultiAnswer(q));
	console.log('Correct answers:', correctAnswers);
	console.log('Selected options:', selectedOptions);

	// Check if the selected answers are correct
	const isCorrect =
		selectedOptions.length === correctAnswers.length &&
		selectedOptions.every((opt) => correctAnswers.includes(opt));

	// Get question points for scoring
	const questionPoints = q.points || 1;

	// Save answer to appropriate storage (uses saveAnswer helper)
	saveAnswer(questionIndex, selectedOptions, isCorrect, questionPoints);

	if (currentMode === quizModes.training) {
		// Use existing feedback logic
		if (isCorrect) {
			score += questionPoints;
			// Highlight all selected options as correct
			document
				.querySelectorAll(`input[name="option-${questionIndex}"]:checked`)
				.forEach((checkbox) => {
					const label = checkbox.closest('.multi-option');
					if (label) {
						label.classList.add('correct');
					}
				});
			updateScoreDisplay();
		} else {
			// Highlight selected options as incorrect
			document
				.querySelectorAll(`input[name="option-${questionIndex}"]:checked`)
				.forEach((checkbox) => {
					const label = checkbox.closest('.multi-option');
					if (label) {
						label.classList.add('incorrect');
					}
				});
			applyTimePenalty();
		}
	} else {
		// Exam mode - just record the answer without visual feedback
		if (isCorrect) {
			score += questionPoints;
			updateScoreDisplay();
		}
	}

	setTimeout(() => {
		console.log('=== submitMultiSelect setTimeout triggered ===');
		console.log('currentQuestion before increment:', currentQuestion);
		currentQuestion++;
		console.log('currentQuestion after increment:', currentQuestion);
		console.log(
			'Total questions:',
			Math.min(questions.length, quizConfig.totalQuestions),
		);

		// Fixed the condition to properly end the quiz
		if (
			currentQuestion >= Math.min(questions.length, quizConfig.totalQuestions)
		) {
			console.log('Quiz ending - reached max questions');
			endQuiz();
		} else {
			console.log(
				'Moving to next question - calling showQuestion(' +
					currentQuestion +
					')',
			);
			showQuestion(currentQuestion);
		}
	}, 100);
}

function validateFillBlankAnswer() {
	const q = questions[currentQuestion];

	// Get all blank inputs and drop zones
	const blankInputs = document.querySelectorAll('.fill-blank-input');
	const dropZones = document.querySelectorAll('.fill-blank-drop-zone');
	const userAnswers = {};

	// Collect user answers from inputs
	blankInputs.forEach((input) => {
		const blankId = input.dataset.blankId;
		const value = input.value.trim();
		userAnswers[blankId] = value;
	});

	// Collect user answers from drop zones
	dropZones.forEach((zone) => {
		const blankId = zone.dataset.blankId;
		const value = zone.textContent.trim();
		userAnswers[blankId] = value;
	});

	// Check if any field is empty
	const hasEmptyFields =
		Array.from(blankInputs).some((input) => !input.value.trim()) ||
		Array.from(dropZones).some((zone) => !zone.dataset.value);

	if (hasEmptyFields) {
		showToast('📝 Please fill in all blanks before submitting', 'warning');
		return;
	}

	// Parse correct answers from format: "1:answer1,answer2|2:answer3"
	const correctAnswersData = {};
	if (q.answer && q.answer.includes(':')) {
		const blanks = q.answer.split('|');
		blanks.forEach((blank) => {
			const [id, answers] = blank.split(':');
			if (answers) {
				correctAnswersData[id] = answers.split(',').map((a) => a.trim());
			}
		});
	}

	// Check case sensitivity
	const caseSensitive = q.caseSensitive || false;

	// Validate each blank
	let allCorrect = true;
	const submitButton = document.querySelector('.fill-blank-submit');
	if (submitButton) submitButton.disabled = true;

	// Validate inputs
	blankInputs.forEach((input) => {
		const blankId = input.dataset.blankId;
		const userAnswer = userAnswers[blankId];
		const correctAnswers = correctAnswersData[blankId] || [];

		// Check if user answer matches any correct answer
		let isCorrect = false;
		if (caseSensitive) {
			isCorrect = correctAnswers.includes(userAnswer);
		} else {
			const userAnswerLower = userAnswer.toLowerCase();
			isCorrect = correctAnswers.some(
				(ans) => ans.toLowerCase() === userAnswerLower,
			);
		}

		// Apply visual feedback in training mode
		if (currentMode === quizModes.training) {
			if (isCorrect) {
				input.classList.add('blank-correct');
				input.classList.remove('blank-incorrect');
			} else {
				input.classList.add('blank-incorrect');
				input.classList.remove('blank-correct');
				allCorrect = false;
			}
		} else {
			// In exam mode, just track correctness without visual feedback
			if (!isCorrect) {
				allCorrect = false;
			}
		}

		// Disable input
		input.disabled = true;
	});

	// Validate drop zones
	dropZones.forEach((zone) => {
		const blankId = zone.dataset.blankId;
		const userAnswer = userAnswers[blankId];
		const correctAnswers = correctAnswersData[blankId] || [];

		// Check if user answer matches any correct answer
		let isCorrect = false;
		if (caseSensitive) {
			isCorrect = correctAnswers.includes(userAnswer);
		} else {
			const userAnswerLower = userAnswer.toLowerCase();
			isCorrect = correctAnswers.some(
				(ans) => ans.toLowerCase() === userAnswerLower,
			);
		}

		// Apply visual feedback in training mode
		if (currentMode === quizModes.training) {
			if (isCorrect) {
				zone.classList.add('blank-correct');
				zone.classList.remove('blank-incorrect');
			} else {
				zone.classList.add('blank-incorrect');
				zone.classList.remove('blank-correct');
				allCorrect = false;
			}
		} else {
			// In exam mode, just track correctness without visual feedback
			if (!isCorrect) {
				allCorrect = false;
			}
		}

		// Disable drop zone
		zone.removeAttribute('ondragover');
		zone.removeAttribute('ondrop');
		zone.removeAttribute('onclick');
		zone.classList.add('disabled');
		zone.draggable = false;
	});

	// Store answer logic
	q.userAnswer = userAnswers;
	q.isCorrect = allCorrect;
	q.timeTaken = 0;

	// Get question points for scoring
	const questionPoints = q.points || 1;

	// Save answer to appropriate storage (uses saveAnswer helper)
	saveAnswer(currentQuestion, userAnswers, allCorrect, questionPoints);

	// Update score
	if (allCorrect) {
		score += questionPoints;
		updateScoreDisplay();
	} else if (currentMode === quizModes.training) {
		applyTimePenalty();
	}

	// Move to next question
	// Move to next question immediately
	setTimeout(() => {
		currentQuestion++;
		if (
			currentQuestion >= Math.min(questions.length, quizConfig.totalQuestions)
		) {
			endQuiz();
		} else {
			showQuestion(currentQuestion);
		}
	}, 100);
}

function initializeDefaultQuestions() {
	const existingQuestions = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions'));
	const existingSettings = JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('settings'));

	// Initialize quizSettings if it doesn't exist
	if (!existingSettings) {
		const defaultSettings = {
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
		};
		window.__DI_CONTAINER__.repo.setAll_sync('settings', defaultSettings);
		console.log('Initialized default quizSettings');
	}

	// Initialize quizQuestions if it doesn't exist
	if (!existingQuestions) {
		const defaultQuestions = questions.map((q) => ({
			question: q.question,
			options: q.options,
			answer: q.answer,
			explanation: q.explanation || '',
			image: q.image || '',
			isDraggable: q.isDraggable || false,
			type: q.type || (q.isDraggable ? 'draggable' : 'multiple-choice'),
			difficulty: q.difficulty || 'medium', // Add difficulty field with default value
			allowMultipleAnswers: Boolean(q.allowMultipleAnswers),
		}));
		window.__DI_CONTAINER__.repo.setAll_sync('questions', defaultQuestions);
		console.log(
			'Initialized default quizQuestions with',
			defaultQuestions.length,
			'questions',
		);
	}

	// Always load the latest questions
	const currentQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	if (currentQuestions && Array.isArray(currentQuestions)) {
		questions = [...currentQuestions];
		console.log('Loaded', questions.length, 'questions from localStorage');
	} else {
		console.warn(
			'No valid questions found in localStorage, using default questions',
		);
		questions = [...questions]; // Use the initial questions array
	}
}

function ensureQuizSettings() {
	const settings = (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});

	// If settings is empty or invalid, recreate it
	if (!settings || Object.keys(settings).length === 0) {
		console.log('quizSettings not found or empty, recreating...');
		const defaultSettings = {
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
		};
		window.__DI_CONTAINER__.repo.setAll_sync('settings', defaultSettings);
		console.log('Recreated default quizSettings');
		return defaultSettings;
	}

	return settings;
}

function verifySettings() {
	const settings = ensureQuizSettings(); // Use the new function to ensure settings exist
	const questions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	console.log('Current settings:', settings);
	console.log('Current questions:', questions);
	console.log('Current questions count:', questions?.length || 0);

	// Initialize exam and class data if not present
	initializeExamAndClassData();
}

function initializeExamAndClassData() {
	// NOTE: quizExams and quizClasses are no longer initialized on student devices
	// Student/class verification now happens via examActiveSession.studentInfo only
	// This function is kept for backward compatibility but does nothing
	console.log('Student device - no local exam/class storage needed');
}

// Initialize welcome page and quiz
document.addEventListener('DOMContentLoaded', () => {
	console.log('DOM loaded, initializing quiz app...');

	// Initialize DOM elements (must be done after DOM is loaded)
	initializeDOM();

	// Verify DOM elements are available
	if (!questionEl || !optionsEl || !progressEl) {
		console.error('Critical DOM elements not found!', {
			questionEl: !!questionEl,
			optionsEl: !!optionsEl,
			progressEl: !!progressEl,
		});
	}

	initializeDefaultQuestions();
	verifySettings();

	// Check URL parameters
	const urlParams = new URLSearchParams(window.location.search);
	const examId = urlParams.get('examId');
	const mode = urlParams.get('mode');

	// Check if we should start in training mode
	if (mode === 'training') {
		console.log(
			'Training mode parameter found in URL, starting training mode...',
		);
		// The legacy bridge bootstraps Prisma data asynchronously. Always wait
		// for a fresh question snapshot before starting training; otherwise a
		// stale local cache wins and the student sees old/empty questions after
		// an admin has added or removed questions.
		if (document.getElementById('welcome-page')) {
			const bootstrap = window.__legacyBridgeBootstrap;
			if (typeof bootstrap === 'function' && !window.__trainingBootstrapStarted) {
				window.__trainingBootstrapStarted = true;
				Promise.resolve(bootstrap())
					.catch(() => undefined)
					.finally(() => startTrainingMode());
			} else {
				startTrainingMode();
			}
			return; // Exit early as we're starting training mode
		}
	}

	// Check for direct URL access to exams
	if (examId) {
		console.log('Exam ID found in URL:', examId);
		// Store the exam ID globally for later verification
		window.examId = examId;

		// Check if we have this exam in our database
		const savedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
		const exam = savedExams.find((e) => e.id === examId);
		if (exam) {
			console.log('Found exam in database:', exam.name);

			// Check if we have student info in session storage
			const storedStudentInfo = sessionStorage.getItem('studentInfo');
			if (storedStudentInfo) {
				try {
					const studentInfo = JSON.parse(storedStudentInfo);
					console.log('Found stored student info:', studentInfo);

					// Auto-fill the student info form if it exists
					const studentInfoForm = document.getElementById('student-info');
					if (studentInfoForm) {
						if (studentInfoForm.numero)
							studentInfoForm.numero.value = studentInfo.numero;
						if (studentInfoForm.name)
							studentInfoForm.name.value = studentInfo.name;
						if (studentInfoForm.class)
							studentInfoForm.class.value = studentInfo.class;
						console.log('Auto-filled student info form');

						// Instead of clicking the button, directly start the exam
						setTimeout(async () => {
							console.log('Directly starting exam with ID:', examId);
							// Set up the exam mode
							currentMode = quizModes.exam;
							const questionBank = JSON.parse(
								JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
							);
							const activeSession = JSON.parse(
								localStorage.getItem('examActiveSession') || 'null',
							);
							const useSessionQuestions =
								activeSession &&
								String(activeSession.examId || '') === String(examId) &&
								Array.isArray(activeSession.questions);
							const resolvedQuestions = resolveQuestionReferences(
								useSessionQuestions
									? activeSession.questions
									: exam.questions || [],
								questionBank,
							);
							currentExam = {
								...exam,
								id: useSessionQuestions ? activeSession.examId : exam.id,
								name: useSessionQuestions
									? activeSession.examName || exam.name
									: exam.name,
								duration: useSessionQuestions
									? activeSession.duration || exam.duration
									: exam.duration,
								questions: resolvedQuestions,
							};
							const sessionSettings =
								useSessionQuestions &&
								activeSession.settings &&
								typeof activeSession.settings === 'object'
									? activeSession.settings
									: {};

							// Configure the quiz
							Object.assign(quizConfig, {
								totalQuestions: currentExam.questions.length,
								timeLimit:
									(useSessionQuestions ? activeSession.timeLimit : 0) ||
									currentExam.duration * 60,
					penalty: sessionSettings.penalty ?? 0,
				});

				// Create the authoritative Prisma attempt before the first question
				// is shown. Keep the local snapshot as a resilient offline/cache
				// fallback, but use its server id whenever the API is available.
				const runtimeStudentInfo = JSON.parse(
					sessionStorage.getItem('studentInfo') || 'null',
				);
				const signedInStudent = window.Auth?.getCurrentUser?.() || {};
				const fallbackAllowedStudent = {
					number:
						runtimeStudentInfo?.numero ||
						signedInStudent.studentNumber ||
						signedInStudent.numero ||
						'',
					name: runtimeStudentInfo?.name || signedInStudent.name || signedInStudent.username || '',
					classId:
						runtimeStudentInfo?.classId ||
						signedInStudent.classId ||
						signedInStudent.class_id ||
						'',
					className:
						runtimeStudentInfo?.class ||
						signedInStudent.className ||
						'',
				};
				const runtimeSession = {
					...(activeSession || {}),
					examId,
					examName: currentExam.name,
					duration: currentExam.duration,
					timeLimit: quizConfig.timeLimit,
					passingScore: currentExam.passing_score ?? currentExam.passingScore ?? 50,
					questions: resolvedQuestions,
					studentInfo: runtimeStudentInfo,
					allowedStudents:
						Array.isArray(activeSession?.allowedStudents) && activeSession.allowedStudents.length
							? activeSession.allowedStudents
							: [fallbackAllowedStudent],
				};
				try {
					if (window.API?.raw && !runtimeSession.id) {
						const created = await window.API.raw('POST', '/sessions', {
							exam_id: examId,
							duration_minutes: currentExam.duration || 60,
						});
						runtimeSession.id = created?.id || '';
					}
				} catch (sessionError) {
					console.warn('Exam API session unavailable; keeping local recovery state:', sessionError);
				}
				localStorage.setItem('examActiveSession', JSON.stringify(runtimeSession));

							// Hide welcome page and show quiz content
							if (document.getElementById('welcome-page')) {
								document.getElementById('welcome-page').style.display = 'none';
							}
							if (document.querySelector('.quiz-content')) {
								document.querySelector('.quiz-content').style.display = 'block';
							}

							// Initialize the quiz
							initQuiz();
						}, 500);
					}
				} catch (e) {
					console.error('Error parsing stored student info:', e);
				}
			}
		} else {
			window.addEventListener('quiz:bootstrap-ready', () => window.location.reload(), { once: true });
			console.warn('Exam ID not found in database:', examId);
		}
	}

	// NOTE: Class dropdown no longer populated from quizClasses storage
	// Students can freely enter any class name - verification happens via examActiveSession for exams
	console.log('Student form ready - class field is open for any input');

	const startQuizBtn = document.getElementById('start-quiz');
	if (startQuizBtn) {
		startQuizBtn.addEventListener('click', (e) => {
			e.preventDefault();
			console.log('Start quiz button clicked');

			// First validate the form
			if (!validateForm()) {
				console.log('Form validation failed');
				return;
			}

			console.log('Form valid, starting quiz...');
			showQuizInterface();
			initQuiz();
		});
	}
});

function validateForm() {
	console.log('Validating student form...');
	const studentInfoForm = document.getElementById('student-info');

	if (!studentInfoForm) {
		console.error('Student info form not found');
		return false;
	}

	const hasStudentAccounts = window.Auth?.getUsers
		? window.Auth.getUsers().some((u) => u.role === 'student' && u.status !== 'disabled')
		: false;

	if (hasStudentAccounts && (!window.Auth?.isStudent || !window.Auth.isStudent())) {
		showToast('Please sign in to start the quiz', 'error');
		return false;
	}

	let studentInfo = sanitizeStudentInfo({
		numero: studentInfoForm.numero.value,
		name: studentInfoForm.name.value,
		class: studentInfoForm.class.value,
	});

	const identity = window.Auth?.getStudentIdentity
		? window.Auth.getStudentIdentity()
		: null;
	if (identity && identity.numero) {
		studentInfo = sanitizeStudentInfo(identity);
		studentInfoForm.numero.value = identity.numero;
		studentInfoForm.name.value = identity.name;
		studentInfoForm.class.value = identity.class;
	}

	console.log('Student info from form:', studentInfo);

	if (!studentInfo.numero || !studentInfo.name || !studentInfo.class) {
		showToast('Please fill in all student information', 'error');
		return false;
	}

	if (currentMode === quizModes.exam) {
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || '{}',
			);
			if (activeSession.examId) {
				const hasAllowedStudents =
					Array.isArray(activeSession.allowedStudents) &&
					activeSession.allowedStudents.length > 0;
				if (!hasAllowedStudents) {
					showPremiumModal({
						title: 'Student Verification Required',
						message:
							'This exam requires student verification, but no allowed students were provided. Please contact your teacher/admin.',
						type: 'security',
						options: {
							showGoBack: true,
							showTrainingMode: true,
						},
					});
					return false;
				}

				if (!isStudentAllowedInSession(activeSession, studentInfo)) {
					showPremiumModal({
						title: 'Access Denied',
						message: `Student number "${studentInfo.numero}" is not registered for this exam.`,
						type: 'security',
						options: {
							showGoBack: true,
							showTrainingMode: true,
						},
					});
					return false;
				}

				activeSession.studentInfo = studentInfo;
				activeSession.startedAt =
					activeSession.startedAt || new Date().toISOString();
				localStorage.setItem(
					'examActiveSession',
					JSON.stringify(activeSession),
				);
				console.log(
					'Updated examActiveSession with student info:',
					studentInfo,
				);
			} else {
				console.warn('Exam mode active but no examActiveSession found');
				showToast('Error: Exam session not found. Please refresh.', 'error');
				return false;
			}
		} catch (e) {
			console.error('Error updating session:', e);
			return false;
		}
	} else {
		console.log('Training mode: Student info valid');
	}

	return true;
}

function showExamCompletionAlert(examName) {
	const alertHtml = `
    <div class="custom-alert">
      <div class="alert-header">
        <h3>⚠️ Exam Already Completed</h3>
        <button class="close-alert" onclick="closeAlert()">×</button>
      </div>
      <div class="alert-content">
        <p>You have already completed the exam: <strong>${examName}</strong></p>
        <p>You cannot take the same exam twice.</p>
        <p>Would you like to practice in training mode instead?</p>
      </div>
      <div class="alert-actions">
        <button class="quiz-btn primary-btn" onclick="startTrainingMode()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="M10 8l6 4-6 4V8z"/>
          </svg>
          Start Training Mode
        </button>
        <button class="quiz-btn secondary-btn" onclick="goBack()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Go Back
        </button>
      </div>
    </div>
    <div class="alert-overlay"></div>
  `;

	// Remove any existing alert
	closeAlert();

	// Insert alert into DOM
	document.body.insertAdjacentHTML('beforeend', alertHtml);
}

function closeAlert() {
	const existingAlert = document.querySelector('.custom-alert');
	const existingOverlay = document.querySelector('.alert-overlay');
	if (existingAlert) existingAlert.remove();
	if (existingOverlay) existingOverlay.remove();
}

function startTrainingMode() {
	console.log('Starting training mode...');
	closeAlert();

	// CRITICAL: Clear the exam data to prevent the completion modal from showing again
	try {
		localStorage.removeItem('examActiveSession');
		console.log('Cleared examActiveSession from localStorage');
	} catch (e) {
		console.warn('Could not clear examActiveSession:', e);
	}

	// Explicitly set training mode and clear any exam data
	currentMode = quizModes.training;
	currentExam = null;

	// Force reset any previous exam questions and URL parameters
	window.examId = null;

	// If completion screen replaced the quiz container, restore base quiz markup.
	const hasQuizContent = Boolean(document.querySelector('.quiz-content'));
	if (!hasQuizContent && quizContainer && initialQuizContainerMarkup) {
		window.safeSetHTML ? window.safeSetHTML(quizContainer, initialQuizContainerMarkup, true) : (quizContainer.innerHTML = initialQuizContainerMarkup);
		questionEl = null;
		optionsEl = null;
		timerEl = null;
		scoreEl = null;
		progressEl = null;
		initializeDOM();
	}

	// If we're on a page with an exam ID in the URL, redirect to the training page
	const currentExamId = new URLSearchParams(window.location.search).get(
		'examId',
	);
	if (currentExamId) {
		console.log('Redirecting to training mode page...');
		// Use a special parameter to indicate we want to start training mode after redirect
		window.location.href = 'index.html?mode=training';
		return; // Stop execution here as we're redirecting
	}

	// Load all default questions from quizQuestions (not just exam questions)
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const defaultQuestions = savedQuestions || [];

	// Make sure we have questions to display
	if (defaultQuestions.length > 0) {
		// Create a fresh copy of all questions
		questions = [...defaultQuestions];
		// Shuffle them for variety
		shuffleArray(questions);
	} else {
		// If no questions in settings, use the initial default questions
		initializeDefaultQuestions();
	}

	// Reset to training mode configuration using settings
	const savedSettings = ensureQuizSettings();
	Object.assign(quizConfig, {
		totalQuestions: Math.min(
			savedSettings.totalQuestions || 5,
			questions.length,
		), // Use configured number or 5
		timeLimit: savedSettings.timeLimit || 300, // Use configured time or 5 minutes
		penalty: savedSettings.penalty || 5, // Use configured penalty or 5
	});

	if (!showQuizInterface()) {
		window.location.href = 'index.html?mode=training';
		console.warn(
			'Training mode requested but .quiz-content was not found in current DOM',
		);
		return;
	}
	initQuiz();

	console.log(
		'Started training mode with',
		quizConfig.totalQuestions,
		'questions',
	);
}

function goBack() {
	closeAlert();
	// Clear form fields
	const form = document.getElementById('student-info');
	if (form) {
		form.reset();
	}
}

function updateTimerDisplay() {
	initializeDOM();
	if (!timerEl) return;
	const minutes = Math.floor(timeRemaining / 60);
	const seconds = timeRemaining % 60;
	timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateScoreDisplay() {
	initializeDOM();
	if (!scoreEl) return;
	scoreEl.textContent = `${score}/${quizConfig.totalQuestions}`;
}

async function syncExamAttemptToApi(activeSession, answers) {
	if (!activeSession?.id || !window.API?.raw) return null;
	for (const entry of answers || []) {
		if (!entry?.questionId || entry.userAnswer == null) continue;
		await window.API.raw('POST', `/sessions/${encodeURIComponent(activeSession.id)}/answer`, {
			session_id: activeSession.id,
			question_id: entry.questionId,
			answer: typeof entry.userAnswer === 'string'
				? entry.userAnswer
				: JSON.stringify(entry.userAnswer),
		});
	}
	return window.API.raw('POST', `/sessions/${encodeURIComponent(activeSession.id)}/submit`, {});
}

async function endQuiz() {
	if (timerId) {
		clearInterval(timerId);
		timerId = null;
	}

	// Get student info from the form
	const studentInfoForm = document.getElementById('student-info');
	const studentInfo = {
		numero: studentInfoForm.numero.value,
		name: studentInfoForm.name.value,
		class: studentInfoForm.class.value,
	};

	// Class name is stored directly - no need to resolve classId on student device
	// Class verification happens via examActiveSession for exams
	const classId = '';
	console.log('Student class:', studentInfo.class);

	// Calculate total possible points from all questions taken
	const totalPoints =
		Math.min(questions.length, quizConfig.totalQuestions) > 0
			? questions
					.slice(0, Math.min(questions.length, quizConfig.totalQuestions))
					.reduce((sum, q) => sum + (q.points || 1), 0)
			: quizConfig.totalQuestions; // Fallback to question count if points not available

	if (currentMode === quizModes.exam && currentExam) {
		// Collect comprehensive answer data from questions array
		const answers = questions.map((q) => ({
			questionId: q.id,
			questionText: q.question, // useful context
			userAnswer: q.userAnswer !== undefined ? q.userAnswer : null,
			isCorrect: !!q.isCorrect,
			points: q.points || 1,
			pointsAwarded: q.isCorrect ? q.points || 1 : 0,
			type: q.type || 'multiple-choice',
		}));

		console.log('Collected answers for exam:', answers);

		// detailed result logging
		// Save exam result using the same format as training results but ONLY for active session
		// We do NOT save to 'quizResults' for Exam Mode as requested.

		// Update examActiveSession with complete data for realtime sync
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || '{}',
			);
			if (activeSession.examId) {
				// Create result entry for this student
				const sessionResult = {
					id: `${activeSession.examId}-${studentInfo.numero}-${new Date().getTime()}`,
					examId: activeSession.examId,
					examName: activeSession.examName,
					completedAt: new Date().toISOString(),
					studentInfo: studentInfo,
					mode: 'exam',
					results: {
						score: score,
						totalPoints: totalPoints,
						totalQuestions: quizConfig.totalQuestions,
						timeSpent: quizConfig.timeLimit - timeRemaining,
						answers: answers,
						passed:
							(score / totalPoints) * 100 >= (activeSession.passingScore || 60),
					},
				};

				let apiResult = null;
				try {
					apiResult = await syncExamAttemptToApi(activeSession, answers);
				} catch (apiError) {
					console.warn('Could not submit exam attempt to the API:', apiError);
				}

				// Keep the normalized Prisma result store authoritative as well as
				// the shared-device session snapshot. The bridge maps this legacy
				// shape to Result.user_id using the signed-in student's UUID/number.
				if (!apiResult) {
					try {
						const dbResults = window.__DI_CONTAINER__.repo.getAll_sync('results') || [];
						const canonical = {
						id: sessionResult.id,
						examId: activeSession.examId,
						examTitle: activeSession.examName,
						userId: window.Auth?.getCurrentUser?.()?.id || '',
						numero: studentInfo.numero,
						name: studentInfo.name,
						studentName: studentInfo.name,
						class: studentInfo.class,
						score,
						totalPoints,
						totalQuestions: quizConfig.totalQuestions,
						earnedPoints: score,
						timeSpent: quizConfig.timeLimit - timeRemaining,
						date: sessionResult.completedAt,
						mode: 'exam',
						passed: sessionResult.results.passed,
						};
						const withoutDuplicate = dbResults.filter((item) => String(item.id) !== String(canonical.id));
						window.__DI_CONTAINER__.repo.setAll_sync('results', [...withoutDuplicate, canonical]);
					} catch (persistError) {
						console.warn('Could not persist exam result to the API bridge:', persistError);
					}
				}

				// Add to cumulative results list for shared devices
				if (!activeSession.completedResults) {
					activeSession.completedResults = [];
				}
				activeSession.completedResults.push(sessionResult);

				// Mirror latest result to root for backward compatibility
				activeSession.completedAt = sessionResult.completedAt;
				activeSession.studentInfo = sessionResult.studentInfo;
				activeSession.results = sessionResult.results;

				// Clear root session data so next person starts fresh on shared device
				// We keep activeSession definition but clear the "active attempt" metadata
				const updatedSession = {
					...activeSession,
				};
				delete updatedSession.studentInfo;
				delete updatedSession.results;
				delete updatedSession.completedAt;
				delete updatedSession.answers;

				localStorage.setItem(
					'examActiveSession',
					JSON.stringify(updatedSession),
				);
				console.log(
					'Updated examActiveSession with completion data and cleared root for next student',
				);
			}
		} catch (e) {
			console.error('Failed to update examActiveSession:', e);
		}
	} else {
		// Save training result (normalize fields for activity log)
		const trainingResult = {
			id: `${studentInfo.numero}-${new Date().toISOString()}`,
			numero: studentInfo.numero,
			name: studentInfo.name,
			studentName: studentInfo.name, // normalized key used elsewhere
			class: studentInfo.class,
			classId: classId,
			score: score,
			totalPoints: totalPoints,
			totalQuestions: quizConfig.totalQuestions,
			time: timeRemaining,
			date: new Date().toISOString(),
			dateTaken: new Date().toISOString(), // alias expected by activity renderer
			examTitle: 'Training Quiz', // best-effort title for training mode
			mode: 'training',
		};

		// Get existing quiz results or initialize empty array
		let quizResults = [];
		try {
			quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');
		} catch (e) {
			console.error('Error parsing quizResults:', e);
			quizResults = [];
		}

		// Add new result
		quizResults.push(trainingResult);

		// Save back to localStorage
		window.__DI_CONTAINER__.repo.setAll_sync('results', quizResults);
	}

	// Display completion screen
	const quizContainer = document.querySelector('.quiz-container');
	quizContainer.innerHTML = `
    <div class="quiz-complete">
      <div class="celebration">🎉</div>
      <h2>Quiz Terminé!</h2>
      <div class="stats-grid">
        <div class="stat-box score">
          <span class="stat-label">Score Final</span>
          <span class="stat-value">${score}/${quizConfig.totalQuestions}</span>
        </div>
        <div class="stat-box time">
          <span class="stat-label">${
						currentMode === quizModes.exam ? 'Temps Utilisé' : 'Temps Restant'
					}</span>
          <span class="stat-value">${Math.floor(timeRemaining / 60)}:${(
						timeRemaining % 60
					)
						.toString()
						.padStart(2, '0')}</span>
        </div>
      </div>
      <div class="quiz-actions">
        ${
					currentMode === quizModes.training
						? `
          <button class="action-btn" onclick="showCorrection()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Show Corrections
          </button>
          <button class="action-btn secondary" onclick="startTrainingMode()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Training Again
          </button>
          <button class="action-btn secondary" onclick="sessionStorage.removeItem('landingMode'); window.location.href='student-workspace.html';">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10.5l9-7 9 7V20a1 1 0 01-1 1h-5a1 1 0 01-1-1v-6H10v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-9.5z" />
            </svg>
            Go to Workspace
          </button>
        `
						: `
          <button class="action-btn" onclick="window.location.href='index.html'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Take Exam Again
          </button>
          <button class="action-btn secondary" onclick="sessionStorage.removeItem('landingMode'); window.location.href='student-workspace.html';">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10.5l9-7 9 7V20a1 1 0 01-1 1h-5a1 1 0 01-1-1v-6H10v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-9.5z" />
            </svg>
            Go to Workspace
          </button>
        `
			}
        <button class="action-btn" onclick="togglePreviousResults()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Show Previous Results
        </button>
      </div>
      <div id="corrections" class="hidden"></div>
      <div id="previous-results" class="hidden"></div>
    </div>
  `;

	// Verify storage after saving
	if (currentMode === quizModes.exam) {
		const savedResults = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
		);
		console.log('Verified quizResults in localStorage:', savedResults); // Debug log

		// Clear the stored student info from session storage
		// This ensures that when the student goes back to the form, they need to enter their info again
		console.log('Clearing stored student info from session storage');
		sessionStorage.removeItem('studentInfo');

		// Clear the exam ID from the URL to prevent auto-starting the exam again
		if (window.history && window.history.replaceState) {
			window.history.replaceState({}, document.title, 'index.html');
		}
	}
}

function showCorrection() {
	const correctionsDiv = document.getElementById('corrections');
	const resultsDiv = document.getElementById('previous-results');
	const correctionsButton = document.querySelector('.action-btn:first-child');
	const resultsButton = document.querySelector('.action-btn:last-child');

	// Hide results if they're showing
	resultsDiv.classList.add('hidden');
	resultsButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    Show Previous Results
  `;

	if (correctionsDiv.classList.contains('hidden')) {
		correctionsDiv.innerHTML = `
      <div class="corrections-container">
        <h3>Corrections</h3>
        ${questions
					.slice(0, quizConfig.totalQuestions)
					.map((q, i) => {
						// Determine question type
						const questionType =
							q.type || (q.isDraggable ? 'draggable' : 'multiple-choice');
						const multiAnswer =
							questionType === 'multiple-choice' && isQuestionMultiAnswer(q);
						let typeLabel = '';

						if (questionType === 'odd-one-out') {
							typeLabel =
								'<span class="question-type-badge odd-one-out">Find the odd one out</span>';
						} else if (questionType === 'draggable') {
							typeLabel =
								'<span class="question-type-badge draggable">Arrange in order</span>';
						} else if (questionType === 'matching-pairs') {
							typeLabel =
								'<span class="question-type-badge matching-pairs">Match the pairs</span>';
						} else {
							typeLabel =
								'<span class="question-type-badge">Multiple choice</span>';
						}

						// Format correct answers for display
						let correctAnswerDisplay = q.answer;

						// Check if this is a multiple choice question with multiple correct answers
						if (multiAnswer) {
							const answers = splitChoiceAnswerTokens(q.answer);
							correctAnswerDisplay =
								'<div class="answer-badges-container">' +
								answers
									.map(
										(ans) =>
											`<span class="correct-answer-badge">${escapeHtml(
												ans,
											)}</span>`,
									)
									.join('') +
								'</div>';
						} else if (q.type === 'draggable' && q.answer.includes(',')) {
							// For draggable, show the order
							const answers = q.answer.split(',').map((ans) => ans.trim());
							correctAnswerDisplay =
								'<div class="answer-badges-container">' +
								answers
									.map(
										(ans, idx) =>
											`<span class="answer-order-badge">${
												idx + 1
											}. ${escapeHtml(ans)}</span>`,
									)
									.join('') +
								'</div>';
						} else if (q.type === 'matching-pairs') {
							// For matching pairs, show the pairs
							const pairs = q.answer.split(',').map((pair) => {
								let left, right;
								if (pair.includes('→')) {
									[left, right] = pair.split('→').map((item) => item.trim());
								} else if (pair.includes('-->')) {
									[left, right] = pair.split('-->').map((item) => item.trim());
								} else {
									[left, right] = [pair.trim(), ''];
								}
								return { left, right };
							});
							correctAnswerDisplay =
								'<div class="answer-badges-container">' +
								pairs
									.map(
										(pair) =>
											`<span class="correct-answer-badge">${escapeHtml(
												pair.left || '',
											)} → ${escapeHtml(pair.right || '')}</span>`,
									)
									.join('') +
								'</div>';
						} else {
							correctAnswerDisplay = `<span class="correct-answer-badge">${escapeHtml(
								q.answer,
							)}</span>`;
						}

						return `
          <div class="correction-item">
            <p><strong>Question ${i + 1}:</strong> ${typeLabel} ${
							q.question
						}</p>
            <p><strong>Correct Answer${
							multiAnswer ? 's' : ''
						}:</strong> ${correctAnswerDisplay}</p>
            ${
							q.explanation
								? `<p><strong>Explanation:</strong> ${q.explanation}</p>`
								: ''
						}
          </div>
        `;
					})
					.join('')}
      </div>
    `;
		correctionsDiv.classList.remove('hidden');
		correctionsButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Hide Corrections
    `;
	} else {
		correctionsDiv.classList.add('hidden');
		correctionsButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Show Corrections
    `;
	}
}

function showPreviousResults() {
	const results = window.__DI_CONTAINER__.repo.getAll_sync('results');
	const container = document.getElementById('previous-results');

	// Remove the code that creates a new toggle button
	const resultsHtml = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Student Number</th>
          <th>Name</th>
          <th>Class</th>
          <th>Score</th>
          <th>Time</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${
					results.length
						? results
								.reverse()
								.map(
									(r) => `
          <tr class="result-row">
            <td>${r.numero}</td>
            <td>${r.name}</td>
            <td>${r.class}</td>
            <td>${r.score}/${quizConfig.totalQuestions}</td>
            <td>${Math.floor(r.time / 60)}:${(r.time % 60)
							.toString()
							.padStart(2, '0')}</td>
            <td>${new Date(r.date).toLocaleString()}</td>
          </tr>
        `,
								)
								.join('')
						: `
          <tr>
            <td colspan="6" class="no-results">No previous results found</td>
          </tr>
        `
				}
      </tbody>
    </table>
  `;

	window.safeSetHTML ? window.safeSetHTML(container, resultsHtml, true) : (container.innerHTML = resultsHtml);
}

function saveQuizResult() {
	if (currentMode === quizModes.exam && currentExam) {
		// First check if student has already taken this exam
		if (
			hasStudentTakenExam(currentExam.id, studentInfo.numero, studentInfo.class)
		) {
			showToast('You have already taken this exam', 'error');
			return false;
		}

		const examResult = {
			id: `${studentInfo.numero}-${new Date().toISOString()}`,
			examId: currentExam.id,
			examTitle: currentExam.name,
			numero: studentInfo.numero,
			name: studentInfo.name,
			studentName: studentInfo.name,
			class: studentInfo.class,
			score: score,
			totalPoints: quizConfig.totalQuestions, // Using totalPoints for consistency
			totalQuestions: quizConfig.totalQuestions,
			timeSpent: quizConfig.timeLimit - timeRemaining,
			date: new Date().toISOString(),
			mode: 'exam',
		};

		// Get existing quiz results or initialize empty array
		let quizResults = [];
		try {
			quizResults = window.__DI_CONTAINER__.repo.getAll_sync('results');
		} catch (e) {
			console.error('Error parsing quizResults:', e);
			quizResults = [];
		}

		// Add new result
		quizResults.push(examResult);

		// Save back to localStorage
		window.__DI_CONTAINER__.repo.setAll_sync('results', quizResults);

		console.log('Exam result saved:', examResult);
		return true;
	}
	return false;
}

function applyWelcomeSettings() {
	const savedSettings = ensureQuizSettings();
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const welcomePage = document.getElementById('welcome-page');

	if (welcomePage) {
		// Update title
		const welcomeTitle = welcomePage.querySelector('h1');
		if (welcomeTitle && savedSettings.welcomeTitle) {
			welcomeTitle.textContent = savedSettings.welcomeTitle;
		}

		// Update message
			let welcomeMessage = welcomePage.querySelector('.welcome-message');
			if (!welcomeMessage) {
				welcomeMessage = document.createElement('p');
				welcomeMessage.className = 'welcome-message';
				// insertBefore requires the reference node to be a *child* of
				// welcomePage. On the legacy exam page #student-info lives inside
				// #welcome-page, but on the entry/auth-gate page it is a sibling,
				// so insertBefore would throw NotFoundError there. Only use it as
				// the anchor when it's actually a descendant; otherwise append.
				const studentForm = welcomePage.querySelector('#student-info');
				if (studentForm) {
					welcomePage.insertBefore(welcomeMessage, studentForm);
				} else {
					welcomePage.appendChild(welcomeMessage);
				}
			}
		if (savedSettings.welcomeMessage) {
			welcomeMessage.textContent = savedSettings.welcomeMessage;
		}
	}
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', applyWelcomeSettings);

// Function to apply all styles and settings
function applyAllSettings() {
	const savedSettings = ensureQuizSettings();
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);

	let settingsToUse = savedSettings;
	const examActiveSession = JSON.parse(
		localStorage.getItem('examActiveSession') || 'null',
	);
	if (examActiveSession && examActiveSession.settings) {
		settingsToUse = { ...savedSettings, ...examActiveSession.settings };
	}

	// Apply styles
	const styles = {
		'--primary-color': settingsToUse.primaryColor || '#2563eb',
		'--secondary-color': settingsToUse.secondaryColor || '#1e40af',
		'--background-color': settingsToUse.backgroundColor || '#f8fafc',
		'--text-color': settingsToUse.textColor || '#1e293b',
		'--input-focus-color': settingsToUse.inputFocusColor || '#3b82f6',
		'--font-family': settingsToUse.fontFamily || "'Segoe UI', system-ui",
	};

	// Apply CSS variables
	Object.entries(styles).forEach(([property, value]) => {
		document.documentElement.style.setProperty(property, value);
	});

	// Add CSS for correct answer badges
	const styleElement = document.createElement('style');
	styleElement.textContent = `
        .correct-answer-badge {
            display: inline-block;
            background-color: #10b981;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            margin: 2px;
            font-size: 0.9em;
        }

        .answer-order-badge {
            display: inline-block;
            background-color: #eff6ff;
            color: #1e40af;
            padding: 4px 8px;
            border-radius: 4px;
            margin: 2px;
            font-size: 0.9em;
        }

        .answer-badges-container {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
    `;
	document.head.appendChild(styleElement);

	// Apply welcome text
	const welcomeTitle = document.querySelector('.welcome-page h1');
	const welcomeMessage = document.querySelector('.welcome-message');
	const startButton = document.getElementById('start-quiz');

	if (welcomeTitle) {
		welcomeTitle.textContent =
			settingsToUse.welcomeTitle || 'Welcome to the Quiz';
	}

	if (welcomeMessage) {
		welcomeMessage.textContent =
			settingsToUse.welcomeMessage ||
			'Test your knowledge with our interactive quiz!';
	}

	if (startButton) {
		startButton.style.backgroundColor = settingsToUse.primaryColor || '#2563eb';
		startButton.style.color = '#ffffff';
		startButton.addEventListener('mouseenter', function () {
			this.style.backgroundColor = settingsToUse.secondaryColor || '#1e40af';
		});
		startButton.addEventListener('mouseleave', function () {
			this.style.backgroundColor = settingsToUse.primaryColor || '#2563eb';
		});
	}

	// Style form inputs
	const inputs = document.querySelectorAll('input');
	inputs.forEach((input) => {
		input.style.borderColor = settingsToUse.primaryColor || '#2563eb';
		input.style.color = settingsToUse.textColor || '#1e293b';
		input.style.backgroundColor = settingsToUse.backgroundColor || '#f8fafc';
	});
}

// Apply settings when DOM loads
document.addEventListener('DOMContentLoaded', function () {
	applyAllSettings();
});

// Reapply settings when they change
window.addEventListener('storage', function (e) {
	if (e.key === 'quizSettings' || e.key === 'quizQuestions') {
		applyAllSettings();
	}
});

function initializeDragAndDrop() {
	const draggables = document.querySelectorAll('.draggable-option');
	const container = document.querySelector('.draggable-container');

	draggables.forEach((draggable) => {
		// Prevent click events from interfering with drag
		draggable.addEventListener('click', (e) => e.preventDefault());

		draggable.addEventListener('dragstart', (e) => {
			draggable.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', ''); // Required for Firefox
		});

		draggable.addEventListener('dragend', () => {
			draggable.classList.remove('dragging');
		});
	});

	container.addEventListener('dragover', (e) => {
		e.preventDefault();
		const afterElement = getDragAfterElement(container, e.clientY);
		const draggable = document.querySelector('.dragging');
		if (draggable) {
			if (afterElement == null) {
				container.appendChild(draggable);
			} else {
				container.insertBefore(draggable, afterElement);
			}
		}
	});

	container.addEventListener('dragenter', (e) => {
		e.preventDefault();
	});

	container.addEventListener('drop', (e) => {
		e.preventDefault();
	});
}

function getDragAfterElement(container, y) {
	const draggableElements = [
		...container.querySelectorAll('.draggable-option:not(.dragging)'),
	];

	return draggableElements.reduce(
		(closest, child) => {
			const box = child.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;

			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child };
			} else {
				return closest;
			}
		},
		{ offset: Number.NEGATIVE_INFINITY },
	).element;
}

function handleDraggableNext() {
	const q = questions[currentQuestion];
	const currentOrder = Array.from(
		document.querySelectorAll('.draggable-option'),
	).map((option) => option.textContent.trim());
	const correctOrder = q.answer.split(',').map((opt) => opt.trim());

	const isCorrect = currentOrder.join(',') === correctOrder.join(',');

	// Get question points for scoring
	const questionPoints = q.points || 1;

	// Save answer to appropriate storage (uses saveAnswer helper)
	saveAnswer(currentQuestion, currentOrder, isCorrect, questionPoints);

	if (currentMode === quizModes.training) {
		if (isCorrect) {
			score += questionPoints;
			document.querySelectorAll('.draggable-option').forEach((opt) => {
				opt.classList.add('correct');
			});
		} else {
			document.querySelectorAll('.draggable-option').forEach((opt) => {
				opt.classList.add('incorrect');
			});
			applyTimePenalty();
		}
	} else {
		if (isCorrect) {
			score += questionPoints;
		}
	}

	updateScoreDisplay();

	// Disable dragging
	document.querySelectorAll('.draggable-option').forEach((opt) => {
		opt.setAttribute('draggable', 'false');
	});

	// Disable the Next Question button
	const nextButton = document.querySelector('.next-question-btn');
	if (nextButton) {
		nextButton.disabled = true;
	}

	setTimeout(() => {
		currentQuestion++;
		// Fixed the condition to properly end the quiz
		if (
			currentQuestion >= Math.min(questions.length, quizConfig.totalQuestions)
		) {
			endQuiz();
		} else {
			showQuestion(currentQuestion);
		}
	}, 1000);
}

function togglePreviousResults() {
	const resultsDiv = document.getElementById('previous-results');
	resultsDiv.classList.toggle('hidden');

	if (!resultsDiv.classList.contains('hidden')) {
		const identity = window.Auth?.getStudentIdentity
			? window.Auth.getStudentIdentity()
			: null;
		if (currentMode === quizModes.exam && currentExam) {
			// Show exam results
			const examResults = JSON.parse(
				localStorage.getItem('examResults') || '{}',
			);
			const currentExamData = examResults[currentExam.id];
			const examStudents = identity && currentExamData?.students
				? currentExamData.students.filter(
					(r) =>
						String(r.studentInfo.numero) === String(identity.numero) &&
						String(r.studentInfo.class) === String(identity.class),
				)
				: currentExamData?.students || [];

			resultsDiv.innerHTML = `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student Number</th>
                            <th>Name</th>
                            <th>Class</th>
                            <th>Score</th>
                            <th>Time Spent</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
													examStudents.length
														? examStudents
																.map(
																	(r) => `
                            <tr>
                                <td>${r.studentInfo.numero}</td>
                                <td>${r.studentInfo.name}</td>
                                <td>${r.studentInfo.class}</td>
                                <td>${r.score}/${r.totalQuestions}</td>
                                <td>${Math.floor(r.timeSpent / 60)}:${(
																	r.timeSpent % 60
																)
																	.toString()
																	.padStart(2, '0')}</td>
                                <td>${new Date(r.date).toLocaleString()}</td>
                            </tr>
                        `,
																)
																.join('')
														: `
                            <tr>
                                <td colspan="6" class="no-results">No previous results found for this exam</td>
                            </tr>
                        `
												}
                    </tbody>
                </table>
            `;
		} else {
			// Show training results
			let results = window.__DI_CONTAINER__.repo.getAll_sync('results');
			if (identity) {
				results = results.filter(
					(r) =>
						String(r.numero) === String(identity.numero) &&
						String(r.class) === String(identity.class),
				);
			}
			resultsDiv.innerHTML = `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student Number</th>
                            <th>Name</th>
                            <th>Class</th>
                            <th>Score</th>
                            <th>Time Remaining</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
													results.length
														? results
																.map(
																	(r) => `
                            <tr>
                                <td>${r.numero}</td>
                                <td>${r.name}</td>
                                <td>${r.class}</td>
                                <td>${r.score}/${r.totalQuestions}</td>
                                <td>${Math.floor(r.time / 60)}:${(r.time % 60)
																	.toString()
																	.padStart(2, '0')}</td>
                                <td>${new Date(r.date).toLocaleString()}</td>
                            </tr>
                        `,
																)
																.join('')
														: `
                            <tr>
                                <td colspan="6" class="no-results">No previous results found</td>
                            </tr>
                        `
												}
                    </tbody>
                </table>
            `;
		}
	}
}

function applyStudentAuth(user) {
	const form = document.getElementById('student-info');
	if (!form) return;

	const identity = window.Auth?.getStudentIdentity
		? window.Auth.getStudentIdentity(user)
		: null;

	const fields = ['numero', 'name', 'class'];
	if (identity && identity.numero) {
		form.numero.value = identity.numero;
		form.name.value = identity.name;
		form.class.value = identity.class;
		fields.forEach((field) => {
			if (form[field]) {
				form[field].readOnly = true;
			}
		});
	} else {
		fields.forEach((field) => {
			if (form[field]) {
				form[field].readOnly = false;
			}
		});
	}
}

function showStudentResults() {
	const panel = document.getElementById('student-results-panel');
	if (!panel) return;
	panel.classList.toggle('hidden');
	if (panel.classList.contains('hidden')) return;

	const identity = window.Auth?.getStudentIdentity
		? window.Auth.getStudentIdentity()
		: null;

	if (!identity) {
		panel.innerHTML =
			'<div class="no-results">Sign in to view your results.</div>';
		return;
	}

	const trainingResults = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
	).filter(
		(r) =>
			String(r.numero) === String(identity.numero) &&
			String(r.class) === String(identity.class),
	);

	const examResultsStore = JSON.parse(
		localStorage.getItem('examResults') || '{}',
	);
	const examResults = [];
	Object.values(examResultsStore).forEach((examData) => {
		if (!examData?.students) return;
		examData.students.forEach((student) => {
			if (
				String(student.studentInfo.numero) === String(identity.numero) &&
				String(student.studentInfo.class) === String(identity.class)
			) {
				examResults.push({
					exam: examData.examName || 'Exam',
					score: `${student.score}/${student.totalQuestions}`,
					time: Math.floor(student.timeSpent / 60) +
						':' +
						String(student.timeSpent % 60).padStart(2, '0'),
					date: student.date,
				});
			}
		});
	});

	panel.innerHTML = `
		<div class="results-wrapper">
			<h3 style="margin-bottom: 12px;">My Results</h3>
			<table class="results-table">
				<thead>
					<tr>
						<th>Type</th>
						<th>Score</th>
						<th>Time</th>
						<th>Date</th>
					</tr>
				</thead>
				<tbody>
					${
						trainingResults.length || examResults.length
							? `
						${trainingResults
							.map(
								(r) => `
							<tr>
								<td>Training</td>
								<td>${r.score}/${r.totalQuestions}</td>
								<td>${Math.floor(r.time / 60)}:${String(
									r.time % 60,
								).padStart(2, '0')}</td>
								<td>${new Date(r.date).toLocaleString()}</td>
							</tr>
						`,
							)
							.join('')}
						${examResults
							.map(
								(r) => `
							<tr>
								<td>${escapeHtml(r.exam)}</td>
								<td>${r.score}</td>
								<td>${r.time}</td>
								<td>${new Date(r.date).toLocaleString()}</td>
							</tr>
						`,
							)
							.join('')}
						`
							: `
						<tr>
							<td colspan="4" class="no-results">No results found.</td>
						</tr>
						`
					}
				</tbody>
			</table>
		</div>
	`;
}

window.applyStudentAuth = applyStudentAuth;
window.showStudentResults = showStudentResults;

let currentLightboxImages = [];
let currentLightboxIndex = 0;
let currentZoomLevel = 1;
let lightboxKeyHandlerBound = false;

function updateLightboxCounter() {
	const counter = document.getElementById('lightbox-counter');
	if (!counter) return;
	if (!currentLightboxImages.length) {
		counter.textContent = '0 / 0';
		return;
	}
	counter.textContent = `${currentLightboxIndex + 1} / ${currentLightboxImages.length}`;
}

function updateNavigationButtons() {
	const prevBtn = document.querySelector('.lightbox-prev');
	const nextBtn = document.querySelector('.lightbox-next');
	if (!prevBtn || !nextBtn) return;
	if (currentLightboxImages.length <= 1) {
		prevBtn.style.display = 'none';
		nextBtn.style.display = 'none';
		return;
	}
	prevBtn.style.display = 'flex';
	nextBtn.style.display = 'flex';
}

function ensureLightboxControls() {
	if (
		window.closeLightbox &&
		window.navigateLightbox &&
		window.zoomLightboxImage &&
		window.resetLightboxZoom
	) {
		return;
	}

	window.closeLightbox = function () {
		const modal = document.getElementById('image-lightbox-modal');
		if (!modal) return;
		modal.classList.remove('active');
		setTimeout(() => {
			modal.style.display = 'none';
			document.body.style.overflow = '';
			currentLightboxImages = [];
			currentLightboxIndex = 0;
			currentZoomLevel = 1;
			const img = document.getElementById('lightbox-image');
			if (img) img.style.transform = 'scale(1)';
			updateLightboxCounter();
			updateNavigationButtons();
		}, 300);
	};

	window.navigateLightbox = function (direction) {
		if (currentLightboxImages.length <= 1) return;
		currentLightboxIndex += direction;
		if (currentLightboxIndex < 0) {
			currentLightboxIndex = currentLightboxImages.length - 1;
		} else if (currentLightboxIndex >= currentLightboxImages.length) {
			currentLightboxIndex = 0;
		}

		const img = document.getElementById('lightbox-image');
		if (!img) return;
		img.style.opacity = '0';
		setTimeout(() => {
			img.src = currentLightboxImages[currentLightboxIndex];
			currentZoomLevel = 1;
			img.style.transform = 'scale(1)';
			img.style.opacity = '1';
			updateLightboxCounter();
		}, 150);
	};

	window.zoomLightboxImage = function (delta) {
		currentZoomLevel = Math.max(0.5, Math.min(3, currentZoomLevel + delta));
		const img = document.getElementById('lightbox-image');
		if (img) img.style.transform = `scale(${currentZoomLevel})`;
	};

	window.resetLightboxZoom = function () {
		currentZoomLevel = 1;
		const img = document.getElementById('lightbox-image');
		if (img) img.style.transform = 'scale(1)';
	};

	if (!lightboxKeyHandlerBound) {
		document.addEventListener('keydown', (e) => {
			const modal = document.getElementById('image-lightbox-modal');
			if (!modal || modal.style.display === 'none') return;
			if (e.key === 'Escape') window.closeLightbox();
			if (e.key === 'ArrowLeft') window.navigateLightbox(-1);
			if (e.key === 'ArrowRight') window.navigateLightbox(1);
			if (e.key === '+' || e.key === '=') window.zoomLightboxImage(0.2);
			if (e.key === '-' || e.key === '_') window.zoomLightboxImage(-0.2);
			if (e.key === '0') window.resetLightboxZoom();
		});
		lightboxKeyHandlerBound = true;
	}
}

function previewImage(src) {
	ensureLightboxControls();
	// Check if modal exists, if not create it
	let modal = document.getElementById('image-lightbox-modal');

	if (!modal) {
		// Create modal if it doesn't exist (using the premium structure from admin)
		const modalHTML = `
            <div id="image-lightbox-modal" class="lightbox-modal" style="display: none;">
                <div class="lightbox-overlay" onclick="closeLightbox()"></div>
                <div class="lightbox-content">
                    <button class="lightbox-close" onclick="closeLightbox()" title="Close (ESC)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                    
                    <div class="lightbox-image-container">
                        <img id="lightbox-image" src="" alt="Preview">
                    </div>
                    
                    <div class="lightbox-zoom-controls">
                        <button onclick="zoomLightboxImage(-0.2)" title="Zoom Out (-)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="M21 21l-4.35-4.35M8 11h6"/>
                            </svg>
                        </button>
                        <button onclick="resetLightboxZoom()" title="Reset Zoom (0)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="M21 21l-4.35-4.35"/>
                            </svg>
                        </button>
                        <button onclick="zoomLightboxImage(0.2)" title="Zoom In (+)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
		document.body.insertAdjacentHTML('beforeend', modalHTML);
		modal = document.getElementById('image-lightbox-modal');
	}

	const modalImg = document.getElementById('lightbox-image');
	currentLightboxImages = [src];
	currentLightboxIndex = 0;

	// Set image source and show modal
	modalImg.src = src;
	modal.style.display = 'flex';
	currentZoomLevel = 1;
	modalImg.style.transform = 'scale(1)';

	// Prevent body scroll
	document.body.style.overflow = 'hidden';

	updateLightboxCounter();
	updateNavigationButtons();

	// Add fade-in animation
	setTimeout(() => modal.classList.add('active'), 10);

	// Close on close button click (if a specific close button exists, though lightbox-close handles it)
	const closeBtn = modal.querySelector('.modal-close-btn'); // This might be redundant with lightbox-close
	if (closeBtn) {
		closeBtn.onclick = window.closeLightbox;
	}

	// Close on Escape key (handled by global event listener now)
	// document.addEventListener('keydown', escKeyHandler); // This is now handled by the global keydown listener
}

// Add this to ensure the function is available globally
window.previewImage = previewImage;

document.addEventListener('DOMContentLoaded', () => {
	if (document.getElementById('image-lightbox-modal')) {
		ensureLightboxControls();
		updateNavigationButtons();
		updateLightboxCounter();
	}
});

function updateResultsDisplay(results) {
	const resultsTable = document.getElementById('results-list');
	if (!resultsTable) {
		console.error('Results table not found');
		return;
	}

	resultsTable.innerHTML = results.length
		? results
				.map((result) => {
					// Calculate score on 20-point scale
					const score20 = (result.score / result.totalQuestions) * 20;
					const isPassed = score20 >= 10;
					const statusClass = isPassed ? 'passed' : 'failed';

					return `
            <tr class="${statusClass}-row">
                <td>${result.numero || ''}</td>
                <td>${result.name || ''}</td>
                <td>${result.class || ''}</td>
                <td>${score20.toFixed(2)}/20</td>
                <td><span class="status-badge ${statusClass}">${
									isPassed ? 'PASSED' : 'FAILED'
								}</span></td>
                <td>${new Date(result.date).toLocaleString()}</td>
            </tr>
        `;
				})
				.join('')
		: '<tr><td colspan="6" class="no-results">No results found</td></tr>';
}

// Add missing escapeHtml function if not already defined
function escapeHtml(unsafe) {
	if (unsafe === undefined || unsafe === null) return '';
	if (typeof unsafe !== 'string') unsafe = String(unsafe);
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Enhanced toast notification system
// Wrap everything in a DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function () {
	// Define the functions in global scope
	window.saveAllSettings = function () {
		// Save quiz settings
		if (typeof saveSettings === 'function') {
			saveSettings();
		}

		// Save exams
		if (typeof saveExams === 'function') {
			saveExams();
		}

		// Save classes
		if (typeof saveClasses === 'function') {
			saveClasses();
		}

		showToast('All settings saved successfully!');
	};

	window.exportAllSettings = function () {
		const settings = {
			quizSettings: (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {}),
			quizQuestions: window.__DI_CONTAINER__.repo.getAll_sync('questions'),
			quizExams: window.__DI_CONTAINER__.repo.getAll_sync('exams'),
			quizClasses: window.__DI_CONTAINER__.repo.getAll_sync('classes'),
			version: '1.0',
		};

		const dataStr = JSON.stringify(settings, null, 2);
		const blob = new Blob([dataStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', url);
		linkElement.setAttribute('download', 'quiz-all-settings.json');

		// Add click event listener to show toast after download starts
		linkElement.addEventListener('click', () => {
			setTimeout(() => {
				showToast('All settings exported successfully!');
				// Cleanup
				URL.revokeObjectURL(url);
			}, 100);
		});

		document.body.appendChild(linkElement);
		linkElement.click();
		document.body.removeChild(linkElement);
	};

	window.importAllSettings = function () {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = (e) => {
			const file = e.target.files[0];
			const reader = new FileReader();

			reader.onload = (event) => {
				try {
					const settings = JSON.parse(event.target.result);

					// Validate structure
					if (
						!settings.quizSettings ||
						!settings.quizQuestions ||
						!Array.isArray(settings.quizExams) ||
						!Array.isArray(settings.quizClasses)
					) {
						throw new Error('Invalid settings structure');
					}

					// Import all settings
					localStorage.setItem(
						'quizSettings',
						JSON.stringify(settings.quizSettings),
					);
					localStorage.setItem(
						'quizQuestions',
						JSON.stringify(settings.quizQuestions),
					);
					window.__DI_CONTAINER__.repo.setAll_sync('exams', settings.quizExams);
					localStorage.setItem(
						'quizClasses',
						JSON.stringify(settings.quizClasses),
					);

					// Immediate UI refresh
					refreshAllUIComponents();

					// Additional component refreshes
					if (typeof loadQuizMode === 'function') loadQuizMode();
					if (typeof initializeDefaultQuestions === 'function')
						initializeDefaultQuestions();
					if (typeof loadAdminSettings === 'function') loadAdminSettings();

					// Force re-render of all admin components
					const adminContainer = document.querySelector('.admin-container');
					if (adminContainer) {
						// Re-render admin settings form
						const settingsForm = document.getElementById('admin-settings-form');
						if (settingsForm && typeof loadAdminSettings === 'function') {
							loadAdminSettings();
						}
					}

					// Trigger storage event for cross-tab updates
					window.dispatchEvent(
						new StorageEvent('storage', {
							key: 'quizSettings',
							newValue: JSON.stringify(settings.quizSettings),
						}),
					);

					window.dispatchEvent(
						new StorageEvent('storage', {
							key: 'quizQuestions',
							newValue: JSON.stringify(settings.quizQuestions),
						}),
					);
					window.dispatchEvent(
						new StorageEvent('storage', {
							key: 'quizQuestions',
							newValue: JSON.stringify(settings.quizQuestions),
						}),
					);

					showToast('All settings imported successfully!');
				} catch (error) {
					showToast('Error importing settings: ' + error.message, 'error');
				}
			};

			reader.readAsText(file);
		};

		input.click();
	};

	// Add the CSS
	document.head.insertAdjacentHTML(
		'beforeend',
		`
        <style>
            .settings-actions {
                background: var(--background-color);
                padding: 10px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .settings-actions button {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
            }

            .settings-actions button svg {
                width: 16px;
                height: 16px;
            }
        </style>
    `,
	);
});

function refreshAllUIComponents() {
	// Refresh quiz settings
	const savedSettings = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('settings')) || '{}',
	);
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);

	// Update colors and styles
	document.documentElement.style.setProperty(
		'--primary-color',
		savedSettings.primaryColor || '#2563eb',
	);
	document.documentElement.style.setProperty(
		'--secondary-color',
		savedSettings.secondaryColor || '#1e40af',
	);
	document.documentElement.style.setProperty(
		'--background-color',
		savedSettings.backgroundColor || '#f8fafc',
	);
	document.documentElement.style.setProperty(
		'--text-color',
		savedSettings.textColor || '#1e293b',
	);
	document.documentElement.style.setProperty(
		'--input-focus-color',
		savedSettings.inputFocusColor || '#3b82f6',
	);
	document.documentElement.style.setProperty(
		'--font-family',
		savedSettings.fontFamily || "'Segoe UI', system-ui",
	);

	// Update welcome page content if it exists
	const welcomeTitle = document.querySelector('.welcome-title');
	if (welcomeTitle) {
		welcomeTitle.textContent =
			savedSettings.welcomeTitle || 'Welcome to the Quiz';
	}

	const welcomeMessage = document.querySelector('.welcome-message');
	if (welcomeMessage) {
		welcomeMessage.textContent =
			savedSettings.welcomeMessage ||
			'Test your knowledge with our interactive quiz!';
	}

	// Refresh admin components if they exist and their update functions are available
	// Questions list
	const questionsList = document.getElementById('questions-list');
	if (
		questionsList &&
		window.updateQuestionList &&
		typeof window.updateQuestionList === 'function'
	) {
		window.updateQuestionList();
	}

	// Exams list
	const examsList = document.getElementById('exams-list');
	if (
		examsList &&
		window.updateExamList &&
		typeof window.updateExamList === 'function'
	) {
		window.updateExamList();
	}

	// Classes list
	const classesList = document.getElementById('classes-list');
	if (
		classesList &&
		window.updateClassList &&
		typeof window.updateClassList === 'function'
	) {
		window.updateClassList();
	}
}

function verifyExamAccess() {
	// Get the exam ID from the URL or global variable
	const examId =
		new URLSearchParams(window.location.search).get('examId') || window.examId;

	// If no specific exam requested, continue normal flow
	if (!examId) return true;

	const studentInfoForm = document.getElementById('student-info');
	if (!studentInfoForm) return false;

	const studentInfo = {
		numero: studentInfoForm.numero?.value,
		name: studentInfoForm.name?.value,
		class: studentInfoForm.class?.value,
	};

	if (!studentInfo.numero || !studentInfo.name || !studentInfo.class) {
		showSecurityAlert(
			'Please fill in all student information to access this exam.',
		);
		return false;
	}

	console.log('Verifying access for student:', studentInfo);

	// Check if student belongs to a class that has this exam assigned
	const savedClasses = window.__DI_CONTAINER__.repo.getAll_sync('classes');
	console.log('Available classes:', savedClasses);

	// First try to find by class name
	let studentClass = savedClasses.find((c) => c.name === studentInfo.class);

	// If not found by name, try by ID (in case the class name in the form is actually the ID)
	if (!studentClass) {
		studentClass = savedClasses.find((c) => c.id === studentInfo.class);
	}

	// Now check if the student is in this class
	if (!studentClass) {
		console.log('Class not found:', studentInfo.class);
		showPremiumModal({
			title: 'Access Denied',
			message: 'Class not found.',
			type: 'security',
			options: {
				showTrainingMode: true,
				showGoBack: true,
			},
		});
		return false;
	}

	// Log all students in the class for debugging
	console.log('Students in class:', studentClass.students);
	console.log('Looking for student with number:', studentInfo.numero);

	// Check if student exists in the class
	const studentExists = studentClass.students.some((s) => {
		console.log(
			'Comparing with student:',
			s.number,
			typeof s.number,
			'vs',
			studentInfo.numero,
			typeof studentInfo.numero,
		);
		// Convert both to strings for comparison to avoid type issues
		return String(s.number) === String(studentInfo.numero);
	});

	if (!studentExists) {
		console.log('Student not found in class');
		showPremiumModal({
			title: 'Access Denied',
			message: 'You are not registered in this class.',
			type: 'security',
			options: {
				showTrainingMode: true,
				showGoBack: true,
			},
		});
		return false;
	}

	console.log('Student found in class:', studentClass);

	const savedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
	console.log('Available exams:', savedExams);

	const requestedExam = savedExams.find((e) => e.id === examId);
	console.log('Requested exam:', requestedExam);

	// Check if exam exists
	if (!requestedExam) {
		showPremiumModal({
			title: '⚠️ Exam Not Found',
			message: 'The requested exam does not exist.',
			type: 'security',
			options: {
				showTrainingMode: true,
				showGoBack: true,
			},
		});
		return false;
	}

	// Check if exam is assigned to student's class
	console.log('Checking if exam is assigned to class:', studentClass.name);
	console.log('Exam classes array:', requestedExam.classes);
	console.log('Class ID to check:', studentClass.id);
	console.log('Class ID type:', typeof studentClass.id);

	// Always use string comparison to avoid type mismatch issues
	const classIdFound = requestedExam.classes?.some(
		(id) => String(id) === String(studentClass.id),
	);
	console.log('Class ID found with string comparison:', classIdFound);

	if (!classIdFound) {
		console.error('Exam not assigned to class!');
		console.log('Exam classes:', JSON.stringify(requestedExam.classes));
		console.log('Class ID:', studentClass.id);

		showPremiumModal({
			title: '⚠️ Unauthorized Access',
			message: 'This exam is not available for your class.',
			type: 'security',
			options: {
				showTrainingMode: true,
				showGoBack: true,
			},
		});
		return false;
	} else {
		console.log('Class ID found with string comparison, continuing...');
	}

	console.log('Exam is assigned to class');

	// Check if student has already taken this exam
	if (hasStudentTakenExam(examId, studentInfo.numero, studentInfo.class)) {
		console.log('Student has already taken this exam');
		// Get other available exams for this student
		const availableExams = savedExams.filter(
			(exam) =>
				exam.classes?.some((id) => String(id) === String(studentClass.id)) &&
				!hasStudentTakenExam(exam.id, studentInfo.numero, studentInfo.class) &&
				exam.id !== examId,
		);

		showPremiumModal({
			title: '📝 Exam Already Completed',
			message: `You have already completed the exam: <strong>${requestedExam.name}</strong>`,
			type: 'premium',
			options: {
				showTrainingMode: true,
				showGoBack: true,
				showOtherExams: availableExams.length > 0,
				availableExams: availableExams,
			},
		});
		return false;
	}

	// Get all available exams for this student
	const availableExams = savedExams.filter(
		(exam) =>
			exam.classes?.some((id) => String(id) === String(studentClass.id)) &&
			!hasStudentTakenExam(exam.id, studentInfo.numero, studentInfo.class),
	);

	console.log('Available exams for this student:', availableExams);

	// Log each exam's details for debugging
	availableExams.forEach((exam) => {
		console.log(`Exam ${exam.name} (ID: ${exam.id}):`);
		console.log(`- Classes: ${JSON.stringify(exam.classes)}`);
		console.log(`- Questions: ${exam.questions.length}`);
		console.log(`- Duration: ${exam.duration} minutes`);
	});

	// Check how many exams are available
	console.log(
		`Found ${availableExams.length} available exams for this student`,
	);

	// If there are multiple exams available, always show the selection modal
	if (availableExams.length > 1) {
		console.log('Multiple exams available, showing selection modal');
		showPremiumModal({
			title: '📝 Multiple Exams Available',
			message: 'You have multiple exams available. Please select one:',
			type: 'premium',
			options: {
				showTrainingMode: true,
				showGoBack: true,
				showExamSelection: true,
				availableExams: availableExams,
			},
		});
		return false;
	}

	// If there's exactly one exam available and no specific exam requested, show the single exam modal
	if (
		availableExams.length === 1 &&
		(!examId || examId !== availableExams[0].id)
	) {
		console.log('One exam available, showing single exam modal');
		showPremiumModal({
			title: '📝 Exam Available',
			message: 'You have one exam available:',
			type: 'premium',
			options: {
				showTrainingMode: true,
				showGoBack: true,
				showExamSelection: true,
				availableExams: availableExams,
			},
		});
		return false;
	}

	// If there's a specific exam requested in the URL and it's available, proceed with that exam
	if (examId) {
		const isRequestedExamAvailable = availableExams.some(
			(exam) => exam.id === examId,
		);
		if (isRequestedExamAvailable) {
			console.log('Requested exam is available, proceeding with exam');
			return true;
		} else {
			console.log('Requested exam is not available');
			// If the requested exam is not available but other exams are, show the modal
			if (availableExams.length > 0) {
				showPremiumModal({
					title: '📝 Exam Not Available',
					message:
						'The requested exam is not available, but you have other exams available:',
					type: 'premium',
					options: {
						showTrainingMode: true,
						showGoBack: true,
						showExamSelection: true,
						availableExams: availableExams,
					},
				});
				return false;
			}
		}
	}

	// If we're here, the student is authorized to take this exam
	console.log('Student is authorized to take this exam');
	return true;
}

function showSecurityAlert(message) {
	showPremiumModal({
		title: 'Access Denied',
		message: message,
		type: 'security',
		options: {
			showGoBack: true,
		},
	});
}

/**
 * Shows a premium modal with various options
 * @param {Object} config - Configuration object
 * @param {string} config.title - Modal title
 * @param {string} config.message - Modal message (can include HTML)
 * @param {string} config.type - Modal type ('premium', 'security', etc.)
 * @param {Object} config.options - Modal options
 * @param {boolean} config.options.showTrainingMode - Show training mode button
 * @param {boolean} config.options.showGoBack - Show go back button
 * @param {boolean} config.options.showOtherExams - Show other exams button
 * @param {boolean} config.options.showExamSelection - Show exam selection grid
 * @param {Array} config.options.availableExams - Available exams for selection
 */
function showPremiumModal(config) {
	// Default values
	const {
		title = 'Notice',
		message = '',
		type = 'premium',
		options = {},
	} = config;

	const {
		showTrainingMode = false,
		showGoBack = false,
		showOtherExams = false,
		showExamSelection = false,
		availableExams = [],
	} = options;

	// Build available exams HTML if needed
	let availableExamsHtml = '';
	if (availableExams.length > 0) {
		if (showExamSelection) {
			availableExamsHtml = `
                <p>Please click on an exam to start:</p>
                <div class="exams-grid">
                    ${availableExams
											.map(
												(exam) => `
                        <div class="exam-card clickable-exam-item" onclick="startExam('${exam.id}')">
                            <h4>${exam.name}</h4>
                            <div class="exam-details">
                                <span>${exam.questions.length} questions</span>
                                <span>${exam.duration} minutes</span>
                            </div>
                        </div>
                    `,
											)
											.join('')}
                </div>
            `;
		} else {
			availableExamsHtml = `
                <p>You have ${
									availableExams.length
								} other exam(s) available. Click on an exam to start:</p>
                <ul class="available-exams-list">
                    ${availableExams
											.map(
												(exam) => `
                        <li onclick="startExam('${exam.id}')" class="clickable-exam-item">
                            <strong>${exam.name}</strong>
                            (${exam.questions.length} questions, ${exam.duration} minutes)
                        </li>
                    `,
											)
											.join('')}
                </ul>
            `;
		}
	}

	// Build action buttons
	let actionsHtml = '';

	if (showGoBack) {
		actionsHtml += `
            <button class="quiz-btn secondary-btn" onclick="window.location.href='index.html'">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Go Back
            </button>
        `;
	}

	// Only show the 'Take Another Exam' button if there are available exams
	if (showOtherExams && availableExams.length > 0) {
		console.log('Adding Take Another Exam button with exams:', availableExams);

		// We need to pass the exams as a variable, not as a JSON string
		// This will create a global variable to hold the exams
		window.tempAvailableExams = availableExams;

		actionsHtml += `
            <button class="quiz-btn primary-btn" onclick="showAvailableExamsModal(window.tempAvailableExams)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
                Take Another Exam
            </button>
        `;
	}

	if (showTrainingMode) {
		actionsHtml += `
            <button class="quiz-btn info-btn" onclick="startTrainingMode()">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="M10 8l6 4-6 4V8z"/>
                </svg>
                Practice in Training Mode
            </button>
        `;
	}

	// Build the complete modal HTML
	const modalHtml = `
        <div class="custom-alert premium-modal ${type}-modal">
            <div class="alert-header">
                <h3>${title}</h3>
                <button class="close-alert" onclick="closeAlert()">×</button>
            </div>
            <div class="alert-content">
                <p>${message}</p>
                ${availableExamsHtml}
            </div>
            <div class="alert-actions">
                ${actionsHtml}
            </div>
        </div>
        <div class="alert-overlay"></div>
    `;

	// Remove any existing alert
	closeAlert();

	// Insert alert into DOM
	document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function showAvailableExamsModal(availableExams) {
	console.log('Showing available exams modal with exams:', availableExams);

	// Make sure availableExams is an array
	if (!Array.isArray(availableExams)) {
		console.error('availableExams is not an array:', availableExams);
		availableExams = [];
	}

	// Log each exam for debugging
	availableExams.forEach((exam, index) => {
		console.log(`Exam ${index + 1}: ${exam.name} (ID: ${exam.id})`);
	});

	showPremiumModal({
		title: '📝 Available Exams',
		message: 'Please select an exam to take:',
		type: 'premium',
		options: {
			showGoBack: true,
			showTrainingMode: true,
			showExamSelection: true,
			availableExams: availableExams,
		},
	});
}

// Add premium modal styles
const styles = `
    <style>
        /* Premium Modal Styles */
        .premium-modal {
            max-width: 600px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            border-top: 5px solid var(--primary-color);
        }

        .security-modal {
            border-top-color: #ef4444;
        }

        .premium-modal .alert-header {
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        .premium-modal .alert-header h3 {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .premium-modal .alert-content {
            padding: 1.5rem;
            text-align: left;
        }

        .premium-modal .alert-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            padding: 1rem 1.5rem 1.5rem;
            justify-content: flex-end;
        }

        .premium-modal .quiz-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.25rem;
            border-radius: 8px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .premium-modal .primary-btn {
            background-color: var(--primary-color);
            color: white;
        }

        .premium-modal .secondary-btn {
            background-color: #e5e7eb;
            color: #374151;
        }

        .premium-modal .info-btn {
            background-color: #dbeafe;
            color: #1e40af;
        }

        .premium-modal .quiz-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .premium-modal .quiz-btn svg {
            width: 18px;
            height: 18px;
        }

        .custom-alert {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 1001;
            background: white;
            width: 90%;
            max-width: 600px;
        }

        .available-exams-list {
            margin: 15px 0;
            padding-left: 20px;
            list-style-type: disc;
        }

        .available-exams-list li {
            margin-bottom: 8px;
            padding: 8px;
            background-color: #f3f4f6;
            border-radius: 6px;
        }

        .clickable-exam-item {
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }

        .clickable-exam-item:hover {
            background-color: var(--primary-color);
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border-color: var(--primary-color);
        }

        .exams-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }

        .exam-card {
            padding: 20px;
            border: 1px solid var(--primary-color);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .exam-card:hover {
            background: var(--primary-color);
            color: white;
            transform: translateY(-3px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
        }

        .exam-card h4 {
            margin-top: 0;
            margin-bottom: 12px;
            font-size: 1.1rem;
        }

        .exam-details {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-size: 0.9em;
            opacity: 0.8;
        }
    </style>
`;

// Insert styles once when the script loads
document.head.insertAdjacentHTML('beforeend', styles);

function showCustomAlert(alertHtml) {
	// Remove any existing alert
	closeAlert();

	// Insert alert into DOM
	document.body.insertAdjacentHTML('beforeend', alertHtml);
}

/**
 * Start an exam with the given ID
 * @param {string} examId - The ID of the exam to start
 */
function startExam(examId) {
	console.log('Starting exam with ID:', examId);
	closeAlert();

	// Check if we're already on a page with an examId parameter
	const currentExamId = new URLSearchParams(window.location.search).get(
		'examId',
	);

	if (currentExamId === examId) {
		console.log('Already on the correct exam page, starting exam...');
		// We're already on the correct exam page, just start the exam
		const savedExams = window.__DI_CONTAINER__.repo.getAll_sync('exams');
		const matchedExam = savedExams.find((exam) => exam.id === examId);
		const questionBank = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
		);
		const activeSession = JSON.parse(
			localStorage.getItem('examActiveSession') || 'null',
		);

		if (matchedExam) {
			const useSessionQuestions =
				activeSession &&
				String(activeSession.examId || '') === String(examId) &&
				Array.isArray(activeSession.questions);
			const resolvedQuestions = resolveQuestionReferences(
				useSessionQuestions
					? activeSession.questions
					: matchedExam.questions || [],
				questionBank,
			);
			currentExam = {
				...matchedExam,
				id: useSessionQuestions ? activeSession.examId : matchedExam.id,
				name: useSessionQuestions
					? activeSession.examName || matchedExam.name
					: matchedExam.name,
				duration: useSessionQuestions
					? activeSession.duration || matchedExam.duration
					: matchedExam.duration,
				questions: resolvedQuestions,
			};
			const sessionSettings =
				useSessionQuestions &&
				activeSession.settings &&
				typeof activeSession.settings === 'object'
					? activeSession.settings
					: {};
			console.log('Found exam:', currentExam.name);
			currentMode = quizModes.exam;
			Object.assign(quizConfig, {
				totalQuestions: currentExam.questions.length,
				timeLimit:
					(useSessionQuestions ? activeSession.timeLimit : 0) ||
					currentExam.duration * 60,
				penalty: sessionSettings.penalty ?? 0,
			});

			if (!showQuizInterface()) {
				console.warn(
					'Exam requested but .quiz-content was not found in current DOM',
				);
				return;
			}
			initQuiz();
		} else {
			console.log('Exam not found in database');
			showPremiumModal({
				title: '⚠️ Exam Not Found',
				message: 'The requested exam could not be found.',
				type: 'security',
				options: {
					showTrainingMode: true,
					showGoBack: true,
				},
			});
		}
	} else {
		console.log('Redirecting to exam page...');

		// Get student info from the form if available
		const studentInfoForm = document.getElementById('student-info');
		if (studentInfoForm) {
			const studentInfo = {
				numero: studentInfoForm.numero?.value,
				name: studentInfoForm.name?.value,
				class: studentInfoForm.class?.value,
			};

			if (studentInfo.numero && studentInfo.name && studentInfo.class) {
				console.log('Including student info in redirect URL');
				// Store student info in session storage to preserve it across redirects
				sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));

				// We need to redirect to the exam page with the examId parameter
				const examUrl = `index.html?examId=${examId}`;
				console.log('Redirecting to:', examUrl);
				window.location.href = examUrl;
			} else {
				console.error('Missing student information, cannot start exam');
				showSecurityAlert(
					'Please fill in all student information to access this exam.',
				);
			}
		} else {
			// If we're in a modal and don't have access to the form, try to get student info from session storage
			const storedStudentInfo = sessionStorage.getItem('studentInfo');
			if (storedStudentInfo) {
				// We need to redirect to the exam page with the examId parameter
				const examUrl = `index.html?examId=${examId}`;
				console.log('Redirecting to:', examUrl);
				window.location.href = examUrl;
			} else {
				console.error('No student info form found and no stored student info');
				showSecurityAlert(
					'Please fill in student information to access this exam.',
				);
			}
		}
	}
}

// Enhanced Matching Pairs Quiz Interface with Performance Optimization
class MatchingPairsManager {
	constructor() {
		this.selectedLeftItem = null;
		this.selectedRightItem = null;
		this.connections = new Map();
		this.eventListeners = new Map();
		this.animationQueue = [];
		this.isAnimating = false;
		this.resizeObserver = null;
		this.pairColors = [
			'#ef4444',
			'#3b82f6',
			'#10b981',
			'#f59e0b',
			'#8b5cf6',
			'#ec4899',
			'#06b6d4',
			'#84cc16',
		];

		// Debounced functions for performance
		this.debouncedUpdateConnections = this.debounce(
			this.updateConnectionPositions.bind(this),
			16,
		);
		this.debouncedResize = this.debounce(this.handleResize.bind(this), 100);

		this.init();
	}

	init() {
		try {
			console.log('Initializing enhanced matching pairs quiz interface');
			this.setupEventListeners();
			this.setupResizeObserver();
			this.setupConnectionsContainer();
			this.initializeConnectionPositions();
		} catch (error) {
			console.error('Error initializing matching pairs:', error);
			this.showErrorMessage('Failed to initialize matching pairs interface');
		}
	}

	setupEventListeners() {
		const matchingItems = document.querySelectorAll('.quiz-item');

		matchingItems.forEach((item) => {
			try {
				const clickHandler = this.createClickHandler(item);
				const mouseEnterHandler = this.createMouseEnterHandler(item);
				const mouseLeaveHandler = this.createMouseLeaveHandler(item);

				item.addEventListener('click', clickHandler, { passive: false });
				item.addEventListener('mouseenter', mouseEnterHandler, {
					passive: true,
				});
				item.addEventListener('mouseleave', mouseLeaveHandler, {
					passive: true,
				});

				// Store handlers for cleanup
				this.eventListeners.set(item, {
					click: clickHandler,
					mouseenter: mouseEnterHandler,
					mouseleave: mouseLeaveHandler,
				});
			} catch (error) {
				console.error(
					'Error setting up event listeners for item:',
					item,
					error,
				);
			}
		});
	}

	createClickHandler(item) {
		return (event) => {
			try {
				event.preventDefault();
				event.stopPropagation();

				const column = item.dataset.column;
				const value = item.dataset.value;

				if (!column || !value) {
					console.warn('Missing data attributes on item:', item);
					return;
				}

				console.log('Matching item clicked:', value, 'in column:', column);

				// If item is already paired, show connection highlight
				if (item.classList.contains('paired')) {
					this.highlightConnection(item);
					return;
				}

				if (column === 'left') {
					this.handleLeftColumnClick(item);
				} else if (column === 'right') {
					this.handleRightColumnClick(item);
				}
			} catch (error) {
				console.error('Error handling click:', error);
				this.showErrorMessage(
					'An error occurred while processing your selection',
				);
			}
		};
	}

	createMouseEnterHandler(item) {
		return () => {
			try {
				if (
					!item.classList.contains('paired') &&
					!item.classList.contains('selected')
				) {
					this.addHoverEffect(item);
				}
			} catch (error) {
				console.error('Error in mouse enter handler:', error);
			}
		};
	}

	createMouseLeaveHandler(item) {
		return () => {
			try {
				if (
					!item.classList.contains('paired') &&
					!item.classList.contains('selected')
				) {
					this.removeHoverEffect(item);
				}
			} catch (error) {
				console.error('Error in mouse leave handler:', error);
			}
		};
	}

	addHoverEffect(item) {
		requestAnimationFrame(() => {
			item.style.transform = 'translateY(-2px) scale(1.02)';
			item.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
		});
	}

	removeHoverEffect(item) {
		requestAnimationFrame(() => {
			item.style.transform = '';
			item.style.boxShadow = '';
		});
	}

	debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	setupResizeObserver() {
		if ('ResizeObserver' in window) {
			this.resizeObserver = new ResizeObserver(this.debouncedResize);
			const quizContainer = document.querySelector('.quiz-container');
			if (quizContainer) {
				this.resizeObserver.observe(quizContainer);
			}
		} else {
			// Fallback for older browsers
			window.addEventListener('resize', this.debouncedResize, {
				passive: true,
			});
		}
	}

	setupConnectionsContainer() {
		let connectionsContainer = document.querySelector('.quiz-connections');
		if (!connectionsContainer) {
			connectionsContainer = document.createElement('div');
			connectionsContainer.className = 'quiz-connections';
			connectionsContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 5;
      `;

			const quizContainer = document.querySelector('.quiz-container');
			if (quizContainer) {
				quizContainer.appendChild(connectionsContainer);
			}
		}
	}

	initializeConnectionPositions() {
		// Use requestAnimationFrame for smooth initialization
		requestAnimationFrame(() => {
			this.updateConnectionPositions();
		});
	}

	handleResize() {
		this.updateConnectionPositions();
	}

	showErrorMessage(message) {
		const errorDiv = document.createElement('div');
		errorDiv.className = 'matching-error-message';
		errorDiv.textContent = message;
		errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      z-index: 9999;
      animation: slideInRight 0.3s ease;
    `;

		document.body.appendChild(errorDiv);

		setTimeout(() => {
			errorDiv.style.animation = 'slideOutRight 0.3s ease';
			setTimeout(() => errorDiv.remove(), 300);
		}, 3000);
	}

	cleanup() {
		// Clean up event listeners
		this.eventListeners.forEach((handlers, item) => {
			item.removeEventListener('click', handlers.click);
			item.removeEventListener('mouseenter', handlers.mouseenter);
			item.removeEventListener('mouseleave', handlers.mouseleave);
		});
		this.eventListeners.clear();

		// Clean up resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		} else {
			window.removeEventListener('resize', this.debouncedResize);
		}

		// Clear connections
		this.connections.clear();
	}

	handleLeftColumnClick(item) {
		try {
			// Remove previous left selection
			if (this.selectedLeftItem && this.selectedLeftItem !== item) {
				this.clearSelection(this.selectedLeftItem);
			}

			// Toggle selection on this item
			if (item.classList.contains('selected')) {
				this.clearSelection(item);
				this.selectedLeftItem = null;
				return;
			} else {
				const pairNumber = this.connections.size + 1;
				this.selectItem(item, pairNumber);
				this.selectedLeftItem = item;

				// If we have a right item selected, create connection
				if (
					this.selectedRightItem &&
					!this.selectedRightItem.classList.contains('paired')
				) {
					this.createConnection(item, this.selectedRightItem, pairNumber);
					this.selectedLeftItem = null;
					this.selectedRightItem = null;
				}
			}
		} catch (error) {
			console.error('Error handling left column click:', error);
			this.showErrorMessage('Error selecting left item');
		}
	}

	handleRightColumnClick(item) {
		try {
			// Remove previous right selection
			if (this.selectedRightItem && this.selectedRightItem !== item) {
				this.clearSelection(this.selectedRightItem);
			}

			// Toggle selection on this item
			if (item.classList.contains('selected')) {
				this.clearSelection(item);
				this.selectedRightItem = null;
				return;
			} else {
				const pairNumber = this.connections.size + 1;
				this.selectItem(item, pairNumber);
				this.selectedRightItem = item;

				// If we have a left item selected, create connection
				if (
					this.selectedLeftItem &&
					!this.selectedLeftItem.classList.contains('paired')
				) {
					this.createConnection(this.selectedLeftItem, item, pairNumber);
					this.selectedLeftItem = null;
					this.selectedRightItem = null;
				}
			}
		} catch (error) {
			console.error('Error handling right column click:', error);
			this.showErrorMessage('Error selecting right item');
		}
	}

	selectItem(item, pairNumber) {
		try {
			const color = this.pairColors[(pairNumber - 1) % this.pairColors.length];

			item.classList.add('selected');

			// Use requestAnimationFrame for smooth animations
			requestAnimationFrame(() => {
				item.style.backgroundColor = color;
				item.style.color = 'white';
				item.style.transform = 'scale(1.05)';
				item.style.position = 'relative';

				// Add animated number badge
				this.addNumberBadge(item, pairNumber, color);
			});
		} catch (error) {
			console.error('Error selecting item:', error);
		}
	}

	addNumberBadge(item, pairNumber, color) {
		try {
			// Remove existing badge
			const existingBadge = item.querySelector('.pair-number');
			if (existingBadge) {
				existingBadge.remove();
			}

			const numberBadge = document.createElement('div');
			numberBadge.className = 'pair-number';
			numberBadge.textContent = pairNumber;
			numberBadge.style.cssText = `
        position: absolute;
        top: -12px;
        ${item.dataset.column === 'left' ? 'left: -12px;' : 'right: -12px;'}
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${color};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 0.9rem;
        border: 3px solid white;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 10;
        animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      `;

			item.appendChild(numberBadge);
		} catch (error) {
			console.error('Error adding number badge:', error);
		}
	}

	clearSelection(item) {
		try {
			item.classList.remove('selected');

			requestAnimationFrame(() => {
				item.style.backgroundColor = '';
				item.style.color = '';
				item.style.transform = '';
			});

			const badge = item.querySelector('.pair-number');
			if (badge) {
				badge.style.animation = 'fadeOut 0.3s ease';
				setTimeout(() => {
					if (badge.parentNode) {
						badge.remove();
					}
				}, 300);
			}
		} catch (error) {
			console.error('Error clearing selection:', error);
		}
	}

	createConnection(leftItem, rightItem, pairNumber) {
		try {
			const color = this.pairColors[(pairNumber - 1) % this.pairColors.length];
			const connectionId = `${leftItem.dataset.value}-${rightItem.dataset.value}`;

			// Clear selections and mark as paired
			this.clearSelection(leftItem);
			this.clearSelection(rightItem);

			leftItem.classList.add('paired');
			rightItem.classList.add('paired');

			// Store connection
			this.connections.set(connectionId, {
				left: leftItem.dataset.value,
				right: rightItem.dataset.value,
				color: color,
				pairNumber: pairNumber,
			});

			// Style paired items
			this.stylePairedItems(leftItem, rightItem, color);

			// Add permanent badges
			this.addPermanentBadge(leftItem, pairNumber, color, 'left');
			this.addPermanentBadge(rightItem, pairNumber, color, 'right');

			// Create visual connection line
			this.createVisualConnection(leftItem, rightItem, color, connectionId);

			// Add success feedback
			this.showPairSuccessAnimation(leftItem, rightItem);

			// Update positions
			this.debouncedUpdateConnections();
		} catch (error) {
			console.error('Error creating connection:', error);
			this.showErrorMessage('Error creating connection');
		}
	}

	stylePairedItems(leftItem, rightItem, color) {
		const pairedStyle = `
      background: linear-gradient(135deg, ${color}, ${color}dd) !important;
      color: white !important;
      transform: scale(1.02) !important;
      border-color: ${color} !important;
      box-shadow: 0 4px 12px ${color}33 !important;
    `;

		requestAnimationFrame(() => {
			leftItem.style.cssText += pairedStyle;
			rightItem.style.cssText += pairedStyle;
		});
	}

	addPermanentBadge(item, pairNumber, color, position) {
		try {
			// Remove existing badges
			const existingBadges = item.querySelectorAll('.pair-number');
			existingBadges.forEach((badge) => badge.remove());

			const badge = document.createElement('div');
			badge.className = 'pair-number permanent';
			badge.textContent = pairNumber;
			badge.style.cssText = `
        position: absolute;
        top: -12px;
        ${position === 'left' ? 'left: -12px;' : 'right: -12px;'}
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${color};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 0.9rem;
        border: 3px solid white;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 10;
        animation: successPulse 0.6s ease;
      `;

			item.appendChild(badge);
		} catch (error) {
			console.error('Error adding permanent badge:', error);
		}
	}

	createVisualConnection(leftItem, rightItem, color, connectionId) {
		try {
			const connectionsContainer = document.querySelector('.quiz-connections');
			if (!connectionsContainer) return;

			const connection = document.createElement('div');
			connection.className = 'quiz-connection';
			connection.dataset.left = leftItem.dataset.value;
			connection.dataset.right = rightItem.dataset.value;
			connection.dataset.connectionId = connectionId;
			connection.style.cssText = `
        position: absolute;
        background: ${color};
        height: 3px;
        pointer-events: auto;
        box-shadow: 0 2px 8px ${color}44;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.3s ease;
        z-index: 6;
      `;

			// Add click handler to remove connection
			connection.addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeConnection(connectionId);
			});

			// Add hover effects
			connection.addEventListener('mouseenter', () => {
				connection.style.height = '4px';
				connection.style.background = '#ef4444';
				connection.style.boxShadow = '0 3px 12px rgba(239, 68, 68, 0.4)';
			});

			connection.addEventListener('mouseleave', () => {
				connection.style.height = '3px';
				connection.style.background = color;
				connection.style.boxShadow = `0 2px 8px ${color}44`;
			});

			connectionsContainer.appendChild(connection);

			// Animate connection appearance
			requestAnimationFrame(() => {
				connection.style.animation = 'connectionSlideIn 0.5s ease';
				this.updateConnectionPositions();
			});
		} catch (error) {
			console.error('Error creating visual connection:', error);
		}
	}

	removeConnection(connectionId) {
		try {
			const connection = this.connections.get(connectionId);
			if (!connection) return;

			// Find and reset the paired items
			const leftItem = document.querySelector(
				`.quiz-item[data-value="${connection.left}"][data-column="left"]`,
			);
			const rightItem = document.querySelector(
				`.quiz-item[data-value="${connection.right}"][data-column="right"]`,
			);

			if (leftItem && rightItem) {
				// Reset styles
				[leftItem, rightItem].forEach((item) => {
					item.classList.remove('paired');
					item.style.cssText = '';

					// Remove badges
					const badges = item.querySelectorAll('.pair-number');
					badges.forEach((badge) => badge.remove());
				});
			}

			// Remove visual connection
			const connectionElement = document.querySelector(
				`.quiz-connection[data-connection-id="${connectionId}"]`,
			);
			if (connectionElement) {
				connectionElement.style.animation = 'connectionSlideOut 0.3s ease';
				setTimeout(() => connectionElement.remove(), 300);
			}

			// Remove from connections map
			this.connections.delete(connectionId);
		} catch (error) {
			console.error('Error removing connection:', error);
		}
	}

	highlightConnection(item) {
		try {
			const value = item.dataset.value;
			const column = item.dataset.column;

			// Find the connection
			const connection = document.querySelector(
				`.quiz-connection[data-${column}="${value}"]`,
			);

			if (connection) {
				// Highlight the connection temporarily
				const originalColor = connection.style.background;
				connection.style.background = '#fbbf24';
				connection.style.height = '5px';
				connection.style.boxShadow = '0 4px 16px rgba(251, 191, 36, 0.6)';
				connection.style.animation = 'connectionHighlight 1s ease';

				setTimeout(() => {
					connection.style.background = originalColor;
					connection.style.height = '3px';
					connection.style.boxShadow = `0 2px 8px ${originalColor}44`;
					connection.style.animation = '';
				}, 1000);
			}
		} catch (error) {
			console.error('Error highlighting connection:', error);
		}
	}

	showPairSuccessAnimation(leftItem, rightItem) {
		try {
			// Create floating success indicators
			[leftItem, rightItem].forEach((item, index) => {
				const success = document.createElement('div');
				success.textContent = '✓';
				success.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #10b981;
          font-size: 1.5rem;
          font-weight: bold;
          z-index: 20;
          animation: successFloat 1s ease;
          pointer-events: none;
        `;

				item.appendChild(success);

				setTimeout(() => {
					if (success.parentNode) {
						success.remove();
					}
				}, 1000);
			});
		} catch (error) {
			console.error('Error showing success animation:', error);
		}
	}

	updateConnectionPositions() {
		try {
			const connections = document.querySelectorAll('.quiz-connection');
			const leftColumn = document.querySelector('.quiz-left-column');
			const rightColumn = document.querySelector('.quiz-right-column');

			if (!leftColumn || !rightColumn) return;

			const leftRect = leftColumn.getBoundingClientRect();
			const rightRect = rightColumn.getBoundingClientRect();

			connections.forEach((connection) => {
				const leftValue = connection.dataset.left;
				const rightValue = connection.dataset.right;

				const leftItem = document.querySelector(
					`.quiz-item[data-value="${leftValue}"][data-column="left"]`,
				);
				const rightItem = document.querySelector(
					`.quiz-item[data-value="${rightValue}"][data-column="right"]`,
				);

				if (leftItem && rightItem) {
					const leftItemRect = leftItem.getBoundingClientRect();
					const rightItemRect = rightItem.getBoundingClientRect();

					const leftX = leftItemRect.right - leftRect.left;
					const leftY =
						leftItemRect.top - leftRect.top + leftItemRect.height / 2;
					const rightX = rightItemRect.left - leftRect.left;
					const rightY =
						rightItemRect.top - leftRect.top + rightItemRect.height / 2;

					const length = Math.sqrt(
						Math.pow(rightX - leftX, 2) + Math.pow(rightY - leftY, 2),
					);
					const angle =
						(Math.atan2(rightY - leftY, rightX - leftX) * 180) / Math.PI;

					connection.style.width = `${length}px`;
					connection.style.left = `${leftX}px`;
					connection.style.top = `${leftY}px`;
					connection.style.transform = `rotate(${angle}deg)`;
					connection.style.transformOrigin = '0 50%';
				}
			});
		} catch (error) {
			console.error('Error updating connection positions:', error);
		}
	}
}

// Performance monitoring and error tracking for matching pairs
class MatchingPairsPerformanceMonitor {
	constructor() {
		this.metrics = {
			clickResponses: [],
			animationFrames: [],
			memoryUsage: [],
			errors: [],
		};
		this.isMonitoring = false;
		this.startTime = 0;

		// Start monitoring if in development mode
		if (this.isDevelopmentMode()) {
			this.startMonitoring();
		}
	}

	isDevelopmentMode() {
		return (
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1' ||
			window.location.search.includes('debug=true')
		);
	}

	startMonitoring() {
		this.isMonitoring = true;
		this.startTime = performance.now();

		// Monitor memory usage periodically
		if (performance.memory) {
			setInterval(() => {
				this.recordMemoryUsage();
			}, 5000);
		}

		// Monitor long animation frames
		if ('PerformanceObserver' in window) {
			try {
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.duration > 16) {
							// Longer than 16ms (60fps)
							this.recordSlowFrame(entry);
						}
					}
				});
				observer.observe({ entryTypes: ['measure'] });
			} catch (error) {
				console.warn('Performance observer not available:', error);
			}
		}
	}

	recordClickResponse(startTime, endTime) {
		if (!this.isMonitoring) return;

		const responseTime = endTime - startTime;
		this.metrics.clickResponses.push({
			timestamp: Date.now(),
			responseTime,
			isSlowResponse: responseTime > 100,
		});

		// Keep only last 100 entries
		if (this.metrics.clickResponses.length > 100) {
			this.metrics.clickResponses.shift();
		}

		if (responseTime > 100) {
			console.warn(`Slow click response detected: ${responseTime}ms`);
		}
	}

	recordMemoryUsage() {
		if (!performance.memory) return;

		const usage = {
			timestamp: Date.now(),
			used: performance.memory.usedJSHeapSize,
			total: performance.memory.totalJSHeapSize,
			limit: performance.memory.jsHeapSizeLimit,
		};

		this.metrics.memoryUsage.push(usage);

		// Keep only last 50 entries
		if (this.metrics.memoryUsage.length > 50) {
			this.metrics.memoryUsage.shift();
		}

		// Warn if memory usage is high
		const usagePercent = (usage.used / usage.limit) * 100;
		if (usagePercent > 80) {
			console.warn(`High memory usage detected: ${usagePercent.toFixed(1)}%`);
		}
	}

	recordSlowFrame(entry) {
		this.metrics.animationFrames.push({
			timestamp: Date.now(),
			duration: entry.duration,
			name: entry.name,
		});

		console.warn(
			`Slow animation frame: ${entry.name} took ${entry.duration}ms`,
		);
	}

	recordError(error, context = '') {
		const errorInfo = {
			timestamp: Date.now(),
			message: error.message,
			stack: error.stack,
			context,
			userAgent: navigator.userAgent,
		};

		this.metrics.errors.push(errorInfo);

		// Keep only last 20 errors
		if (this.metrics.errors.length > 20) {
			this.metrics.errors.shift();
		}

		// In development, also log to console
		if (this.isDevelopmentMode()) {
			console.error('Matching pairs error:', errorInfo);
		}
	}

	getPerformanceReport() {
		const avgClickResponse =
			this.metrics.clickResponses.length > 0
				? this.metrics.clickResponses.reduce(
						(sum, entry) => sum + entry.responseTime,
						0,
					) / this.metrics.clickResponses.length
				: 0;

		const slowClicks = this.metrics.clickResponses.filter(
			(entry) => entry.isSlowResponse,
		).length;
		const totalClicks = this.metrics.clickResponses.length;

		return {
			uptime: performance.now() - this.startTime,
			averageClickResponse: avgClickResponse,
			slowClickPercentage:
				totalClicks > 0 ? (slowClicks / totalClicks) * 100 : 0,
			totalErrors: this.metrics.errors.length,
			slowFrames: this.metrics.animationFrames.length,
			memoryTrend: this.getMemoryTrend(),
		};
	}

	getMemoryTrend() {
		if (this.metrics.memoryUsage.length < 2) return 'stable';

		const recent = this.metrics.memoryUsage.slice(-5);
		const first = recent[0].used;
		const last = recent[recent.length - 1].used;

		const change = ((last - first) / first) * 100;

		if (change > 10) return 'increasing';
		if (change < -10) return 'decreasing';
		return 'stable';
	}

	// Public method to get metrics for debugging
	exportMetrics() {
		return {
			...this.metrics,
			report: this.getPerformanceReport(),
		};
	}
}

// Global performance monitor instance
const performanceMonitor = new MatchingPairsPerformanceMonitor();

// Enhanced error boundary for matching pairs
class MatchingPairsErrorBoundary {
	constructor(fallbackCallback) {
		this.fallbackCallback = fallbackCallback;
		this.errorCount = 0;
		this.maxErrors = 5;
		this.setupGlobalErrorHandler();
	}

	setupGlobalErrorHandler() {
		// Capture unhandled errors in matching pairs
		const originalError = window.onerror;
		window.onerror = (message, source, lineno, colno, error) => {
			if (
				source &&
				source.includes('script.js') &&
				(message.includes('matching') || message.includes('pair'))
			) {
				this.handleError(error || new Error(message), 'global');
			}

			// Call original handler
			if (originalError) {
				return originalError(message, source, lineno, colno, error);
			}
		};

		// Capture unhandled promise rejections
		const originalUnhandledRejection = window.onunhandledrejection;
		window.onunhandledrejection = (event) => {
			if (
				event.reason &&
				event.reason.stack &&
				event.reason.stack.includes('MatchingPairs')
			) {
				this.handleError(event.reason, 'promise');
				event.preventDefault();
			}

			// Call original handler
			if (originalUnhandledRejection) {
				return originalUnhandledRejection(event);
			}
		};
	}

	handleError(error, context) {
		this.errorCount++;
		performanceMonitor.recordError(error, context);

		console.error(
			`Matching pairs error (${this.errorCount}/${this.maxErrors}):`,
			error,
		);

		// If too many errors, switch to fallback mode
		if (this.errorCount >= this.maxErrors) {
			console.warn(
				'Too many errors in matching pairs, switching to fallback mode',
			);
			this.switchToFallbackMode();
		}
	}

	switchToFallbackMode() {
		try {
			// Clean up existing enhanced implementation
			if (window.matchingPairsManager) {
				window.matchingPairsManager.cleanup();
				window.matchingPairsManager = null;
			}

			// Switch to basic implementation
			if (this.fallbackCallback) {
				this.fallbackCallback();
			}

			// Show user notification
			const notification = document.createElement('div');
			notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f59e0b;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;
			notification.textContent =
				'Matching pairs switched to basic mode for better stability';

			document.body.appendChild(notification);

			setTimeout(() => {
				if (notification.parentNode) {
					notification.remove();
				}
			}, 5000);
		} catch (fallbackError) {
			console.error('Error in fallback mode:', fallbackError);
		}
	}

	reset() {
		this.errorCount = 0;
	}
}

// Initialize error boundary
const errorBoundary = new MatchingPairsErrorBoundary(() => {
	// Fallback to basic implementation
	setTimeout(() => {
		try {
			initializeBasicMatchingPairs();
		} catch (error) {
			console.error('Even basic matching pairs failed:', error);
		}
	}, 100);
});

// Enhanced matching pairs initialization with error handling
function initializeMatchingPairsQuiz() {
	console.log('Initializing interactive matching pairs quiz');

	// Initialize quiz-specific matching pairs variables
	window.quizSelectedItem = null;
	window.quizMatchedPairs = [];
	window.quizPairColors = [
		'#ef4444',
		'#3b82f6',
		'#10b981',
		'#f59e0b',
		'#8b5cf6',
		'#ec4899',
		'#06b6d4',
		'#84cc16',
	];

	const matchingItems = document.querySelectorAll('.quiz-item');

	matchingItems.forEach((item) => {
		item.addEventListener('click', function () {
			handleQuizMatchingItemClick(this);
		});

		// Add hover effects
		item.addEventListener('mouseenter', function () {
			if (
				!this.classList.contains('paired') &&
				!this.classList.contains('selected')
			) {
				this.style.backgroundColor = '#eff6ff';
				this.style.transform = 'translateY(-2px)';
			}
		});

		item.addEventListener('mouseleave', function () {
			if (
				!this.classList.contains('paired') &&
				!this.classList.contains('selected')
			) {
				this.style.backgroundColor = '';
				this.style.transform = '';
			}
		});
	});

	// Update status display
	updateMatchingStatus();
}

// Handle quiz matching item clicks
function handleQuizMatchingItemClick(item) {
	console.log(
		'Quiz matching item clicked:',
		item.dataset.value,
		'column:',
		item.dataset.column,
	);

	const column = item.dataset.column;

	// Check if this item is already paired
	if (item.classList.contains('paired')) {
		console.log(
			'Item is already paired, breaking connection for:',
			item.dataset.value,
		);

		// Find the pair that includes this item
		const itemValue = item.dataset.value;
		let pairToRemove = null;

		// Find the pair in our matched pairs array
		for (let i = 0; i < window.quizMatchedPairs.length; i++) {
			const pair = window.quizMatchedPairs[i];
			if (pair.left === itemValue || pair.right === itemValue) {
				pairToRemove = pair;
				break;
			}
		}

		if (pairToRemove) {
			// Find both items in the pair
			const leftItem = document.querySelector(
				`.quiz-item[data-value="${pairToRemove.left}"][data-column="left"]`,
			);
			const rightItem = document.querySelector(
				`.quiz-item[data-value="${pairToRemove.right}"][data-column="right"]`,
			);

			// Remove styling and badges from both items
			[leftItem, rightItem].forEach((pairItem) => {
				if (pairItem) {
					pairItem.classList.remove('paired');
					pairItem.style.backgroundColor = '';
					pairItem.style.color = '';

					// Remove number badges
					const badges = pairItem.querySelectorAll('.pair-number-badge');
					badges.forEach((badge) => badge.remove());
				}
			});

			// Remove from matched pairs array
			window.quizMatchedPairs = window.quizMatchedPairs.filter(
				(pair) =>
					!(
						pair.left === pairToRemove.left && pair.right === pairToRemove.right
					),
			);

			// Remove visual connection
			const connections = document.querySelectorAll(
				'.quiz-connection.active-connection',
			);
			connections.forEach((connection) => {
				if (
					connection.dataset.left === pairToRemove.left &&
					connection.dataset.right === pairToRemove.right
				) {
					connection.remove();
				}
			});

			// Update status
			updateMatchingStatus();

			console.log(
				'Connection broken successfully. Remaining pairs:',
				window.quizMatchedPairs.length,
			);
		}

		return;
	}

	if (column === 'left') {
		// Check if this item is already selected
		if (item.classList.contains('selected')) {
			// Unselect the item (student changed their mind)
			item.classList.remove('selected');
			item.style.backgroundColor = '';
			item.style.color = '';
			const badge = item.querySelector('.pair-number-badge');
			if (badge) badge.remove();
			window.quizSelectedItem = null;
			return;
		}

		// Handle left column selection
		const prevSelected = document.querySelector(
			'.quiz-item.selected[data-column="left"]',
		);
		if (prevSelected) {
			prevSelected.classList.remove('selected');
			prevSelected.style.backgroundColor = '';
			prevSelected.style.color = '';
			const badge = prevSelected.querySelector('.pair-number-badge');
			if (badge) badge.remove();
		}

		// Select this item
		item.classList.add('selected');
		const pairNumber = window.quizMatchedPairs.length + 1;
		const color =
			window.quizPairColors[(pairNumber - 1) % window.quizPairColors.length];

		item.style.backgroundColor = color;
		item.style.color = 'white';

		// Add enhanced number badge
		const numberBadge = document.createElement('div');
		numberBadge.className = 'pair-number-badge';
		numberBadge.textContent = pairNumber;
		numberBadge.style.cssText = `
      position: absolute;
      top: -14px;
      right: -14px;
      width: 32px;
      height: 32px;
      background-color: white;
      color: ${color};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1.1rem;
      border: 3px solid ${color};
      z-index: 9999;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
    `;

		item.appendChild(numberBadge);
		window.quizSelectedItem = item;
	} else if (column === 'right') {
		// Check if this item is already selected as right item (shouldn't normally happen, but handle for completeness)
		if (item.classList.contains('selected')) {
			console.log('Right item was selected, unselecting:', item.dataset.value);
			item.classList.remove('selected');
			item.style.backgroundColor = '';
			item.style.color = '';
			const badge = item.querySelector('.pair-number-badge');
			if (badge) badge.remove();
			return;
		}

		// Handle right column selection when left item is selected
		if (window.quizSelectedItem) {
			const leftItem = window.quizSelectedItem;
			const pairNumber = window.quizMatchedPairs.length + 1;
			const color =
				window.quizPairColors[(pairNumber - 1) % window.quizPairColors.length];

			// Style the right item
			item.style.backgroundColor = color;
			item.style.color = 'white';

			// Add enhanced number badge to right item
			const numberBadge = document.createElement('div');
			numberBadge.className = 'pair-number-badge';
			numberBadge.textContent = pairNumber;
			numberBadge.style.cssText = `
        position: absolute;
        top: -14px;
        right: -14px;
        width: 32px;
        height: 32px;
        background-color: white;
        color: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 1.1rem;
        border: 3px solid ${color};
        z-index: 9999;
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
      `;

			item.appendChild(numberBadge);

			// Mark both items as paired
			leftItem.classList.remove('selected');
			leftItem.classList.add('paired');
			item.classList.add('paired');

			// Add to matched pairs
			window.quizMatchedPairs.push({
				left: leftItem.dataset.value,
				right: item.dataset.value,
				color: color,
				number: pairNumber,
			});

			// Clear selected item
			window.quizSelectedItem = null;

			// Create visual connection
			createQuizConnection(leftItem, item, color);

			// Update status
			updateMatchingStatus();

			// Check if all pairs are matched
			checkAllPairsMatched();
		} else {
			// No left item selected, show feedback
			item.style.animation = 'shake 0.3s ease';
			setTimeout(() => {
				item.style.animation = '';
			}, 300);
		}
	}
}

// Create visual connection between matched items
function createQuizConnection(leftItem, rightItem, color) {
	const connectionsContainer = document.querySelector('.quiz-connections');
	if (!connectionsContainer) return;

	const connection = document.createElement('div');
	connection.className = 'quiz-connection active-connection';
	connection.dataset.left = leftItem.dataset.value;
	connection.dataset.right = rightItem.dataset.value;
	connection.style.cssText = `
    position: absolute;
    background: ${color};
    height: 3px;
    z-index: 1;
    border-radius: 2px;
    box-shadow: 0 2px 8px ${color}44;
    cursor: pointer;
    transition: all 0.3s ease;
    overflow: visible;
  `;

	// Create arrow element
	const arrow = document.createElement('div');
	arrow.className = 'connection-arrow';
	arrow.style.cssText = `
    position: absolute;
    right: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid currentColor;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    z-index: 10;
    pointer-events: none;
  `;
	connection.appendChild(arrow);

	// Add click handler to remove connection
	connection.addEventListener('click', function (e) {
		e.stopPropagation();
		removeQuizConnection(this);
	});

	// Add hover effects
	connection.addEventListener('mouseenter', function () {
		this.style.height = '5px';
		this.style.background = '#ef4444';
		this.style.boxShadow = '0 3px 12px rgba(239, 68, 68, 0.4)';
		// Update arrow color on hover
		const arrow = this.querySelector('.connection-arrow');
		if (arrow) {
			arrow.style.borderLeftColor = '#ef4444';
		}
	});

	connection.addEventListener('mouseleave', function () {
		this.style.height = '3px';
		this.style.background = color;
		this.style.boxShadow = `0 2px 8px ${color}44`;
		// Restore arrow color
		const arrow = this.querySelector('.connection-arrow');
		if (arrow) {
			arrow.style.borderLeftColor = color;
		}
	});

	connectionsContainer.appendChild(connection);

	// Position the connection
	setTimeout(() => {
		updateQuizConnectionPositions();
	}, 10);
}

// Remove quiz connection
function removeQuizConnection(connection) {
	const leftValue = connection.dataset.left;
	const rightValue = connection.dataset.right;

	// Find and restore the items
	const leftItem = document.querySelector(
		`.quiz-item[data-value="${leftValue}"][data-column="left"]`,
	);
	const rightItem = document.querySelector(
		`.quiz-item[data-value="${rightValue}"][data-column="right"]`,
	);

	if (leftItem && rightItem) {
		// Remove paired class and styling
		leftItem.classList.remove('paired');
		rightItem.classList.remove('paired');
		leftItem.style.backgroundColor = '';
		leftItem.style.color = '';
		rightItem.style.backgroundColor = '';
		rightItem.style.color = '';

		// Remove number badges
		const leftBadge = leftItem.querySelector('.pair-number-badge');
		const rightBadge = rightItem.querySelector('.pair-number-badge');
		if (leftBadge) leftBadge.remove();
		if (rightBadge) rightBadge.remove();
	}

	// Remove from matched pairs array
	window.quizMatchedPairs = window.quizMatchedPairs.filter(
		(pair) => !(pair.left === leftValue && pair.right === rightValue),
	);

	// Remove connection element
	connection.remove();

	// Update status
	updateMatchingStatus();
}

// Update matching status display
function updateMatchingStatus() {
	const matchedCount = document.getElementById('matched-pairs-count');
	const totalCount = document.getElementById('total-pairs-count');

	if (matchedCount) {
		matchedCount.textContent = window.quizMatchedPairs.length;
	}
}

// Check if all pairs are matched
function checkAllPairsMatched() {
	const totalPairsElement = document.getElementById('total-pairs-count');
	const totalPairs = totalPairsElement
		? parseInt(totalPairsElement.textContent)
		: 0;

	// Count all unpaired items
	const unpairedItems = document.querySelectorAll('.quiz-item:not(.paired)');
	const unpairedCount = unpairedItems.length;

	console.log(
		`Pairs matched: ${window.quizMatchedPairs.length}, Total expected: ${totalPairs}, Unpaired items: ${unpairedCount}`,
	);

	// Only auto-progress if we have the expected pairs AND no unpaired items
	if (
		window.quizMatchedPairs.length === totalPairs &&
		totalPairs > 0 &&
		unpairedCount === 0
	) {
		console.log(
			'All pairs matched and no unpaired items! Auto-progressing to next question.',
		);

		// Show success animation
		const quizContainer = document.querySelector('.matching-pairs-quiz');
		if (quizContainer) {
			quizContainer.style.animation = 'successPulse 0.8s ease';
		}

		// Add celebration effect to all paired items
		const pairedItems = document.querySelectorAll('.quiz-item.paired');
		pairedItems.forEach((item, index) => {
			setTimeout(() => {
				item.style.animation = 'successPulse 0.6s ease';
			}, index * 100);
		});

		// Update score
		const questionPoints = questions[currentQuestion].points || 1;
		score += questionPoints;
		updateScoreDisplay();

		// Auto-progress to next question after a brief delay
		setTimeout(() => {
			currentQuestion++;
			// Fixed the condition to properly end the quiz
			if (
				currentQuestion >= Math.min(questions.length, quizConfig.totalQuestions)
			) {
				endQuiz();
			} else {
				showQuestion(currentQuestion);
			}
		}, 1500);
	}
}

// Fallback basic implementation
function initializeBasicMatchingPairs() {
	console.log('Using fallback matching pairs implementation');
	const matchingItems = document.querySelectorAll('.quiz-item');
	matchingItems.forEach((item) => {
		item.addEventListener('click', function () {
			console.log('Basic matching item clicked:', this.dataset.value);
		});
	});
}

function createVisualConnection(leftItem, rightItem, color) {
	const connectionsContainer = document.querySelector('.quiz-connections');
	if (!connectionsContainer) return;

	const connection = document.createElement('div');
	connection.className = 'quiz-connection';
	connection.dataset.left = leftItem.dataset.value;
	connection.dataset.right = rightItem.dataset.value;
	connection.style.background = color;
	connection.style.height = '3px';
	connection.style.boxShadow = `0 2px 8px ${color}44`;

	// Add click handler to remove connection
	connection.addEventListener('click', function (e) {
		e.stopPropagation();
		removeConnection(this);
	});

	// Add hover effects
	connection.addEventListener('mouseenter', function () {
		this.style.height = '4px';
		this.style.background = '#ef4444';
		this.style.boxShadow = '0 3px 12px rgba(239, 68, 68, 0.4)';
		this.style.cursor = 'pointer';
	});

	connection.addEventListener('mouseleave', function () {
		this.style.height = '3px';
		this.style.background = color;
		this.style.boxShadow = `0 2px 8px ${color}44`;
	});

	connectionsContainer.appendChild(connection);

	// Animate connection appearance
	setTimeout(() => {
		connection.style.display = 'block';
		connection.style.animation = 'connectionSlideIn 0.5s ease';
		updateConnectionPositions();
	}, 10);
}

function removeConnection(connectionElement) {
	const leftValue = connectionElement.dataset.left;
	const rightValue = connectionElement.dataset.right;

	// Find and reset the paired items
	const leftItem = document.querySelector(
		`.quiz-item[data-value="${leftValue}"][data-column="left"]`,
	);
	const rightItem = document.querySelector(
		`.quiz-item[data-value="${rightValue}"][data-column="right"]`,
	);

	if (leftItem && rightItem) {
		// Reset styles
		[leftItem, rightItem].forEach((item) => {
			item.classList.remove('paired');
			item.style.cssText = '';

			// Remove badges
			const badges = item.querySelectorAll('.pair-number');
			badges.forEach((badge) => badge.remove());
		});
	}

	// Animate connection removal
	connectionElement.style.animation = 'connectionSlideOut 0.3s ease';
	setTimeout(() => connectionElement.remove(), 300);
}

function highlightConnection(item) {
	const value = item.dataset.value;
	const column = item.dataset.column;

	// Find the connection
	const connection = document.querySelector(
		`.quiz-connection[data-${column}="${value}"]`,
	);

	if (connection) {
		// Highlight the connection temporarily
		const originalColor = connection.style.background;
		connection.style.background = '#fbbf24';
		connection.style.height = '5px';
		connection.style.boxShadow = '0 4px 16px rgba(251, 191, 36, 0.6)';
		connection.style.animation = 'connectionHighlight 1s ease';

		setTimeout(() => {
			connection.style.background = originalColor;
			connection.style.height = '3px';
			connection.style.boxShadow = `0 2px 8px ${originalColor}44`;
			connection.style.animation = '';
		}, 1000);
	}
}

function showPairSuccessAnimation(leftItem, rightItem) {
	// Create floating success indicators
	[leftItem, rightItem].forEach((item, index) => {
		const success = document.createElement('div');
		success.textContent = '✓';
		success.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #10b981;
      font-size: 1.5rem;
      font-weight: bold;
      z-index: 20;
      animation: successFloat 1s ease;
      pointer-events: none;
    `;

		item.appendChild(success);

		setTimeout(() => success.remove(), 1000);
	});
}

// Add enhanced CSS animations for matching pairs with error handling fallbacks
const matchingPairsAnimations = document.createElement('style');
matchingPairsAnimations.textContent = `
  @keyframes successPulse {
    0% { transform: scale(0); opacity: 0; }
    50% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  
  @keyframes bounceIn {
    0% { 
      transform: scale(0) rotate(180deg); 
      opacity: 0; 
    }
    60% { 
      transform: scale(1.25) rotate(25deg); 
      opacity: 1; 
    }
    100% { 
      transform: scale(1) rotate(0deg); 
      opacity: 1; 
    }
  }
  
  @keyframes fadeOut {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.8); }
  }
  
  @keyframes connectionSlideIn {
    0% { 
      opacity: 0; 
      transform: scaleX(0) rotate(var(--connection-angle, 0deg)); 
    }
    100% { 
      opacity: 1; 
      transform: scaleX(1) rotate(var(--connection-angle, 0deg)); 
    }
  }
  
  @keyframes connectionSlideOut {
    0% { 
      opacity: 1; 
      transform: scaleX(1) rotate(var(--connection-angle, 0deg)); 
    }
    100% { 
      opacity: 0; 
      transform: scaleX(0) rotate(var(--connection-angle, 0deg)); 
    }
  }
  
  @keyframes connectionHighlight {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(1.5); }
  }
  
  @keyframes successFloat {
    0% { 
      transform: translate(-50%, -50%) scale(0) rotate(-180deg); 
      opacity: 0; 
    }
    50% { 
      transform: translate(-50%, -80%) scale(1.2) rotate(0deg); 
      opacity: 1; 
    }
    100% { 
      transform: translate(-50%, -100%) scale(1) rotate(180deg); 
      opacity: 0; 
    }
  }
  
  @keyframes slideInRight {
    0% {
      transform: translateX(100%);
      opacity: 0;
    }
    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutRight {
    0% {
      transform: translateX(0);
      opacity: 1;
    }
    100% {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }
  
  /* Enhanced quiz item transitions */
  .quiz-item {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }
  
  .quiz-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: -200px;
    width: 200px;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    transition: left 0.5s;
  }
  
  .quiz-item:hover::before {
    left: 100%;
  }
  
  .quiz-connection {
    transition: all 0.3s ease;
    transform-origin: 0 50%;
    position: absolute;
  }
  
  .quiz-connection::after {
    content: '';
    position: absolute;
    top: 50%;
    right: -6px;
    width: 0;
    height: 0;
    border-left: 6px solid currentColor;
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
    transform: translateY(-50%);
  }
  
  /* Performance optimized animations */
  .quiz-item.selected {
    will-change: transform;
  }
  
  .quiz-connection {
    will-change: transform, opacity;
  }
  
  /* Error state styling */
  .matching-error-message {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    pointer-events: auto;
  }
  
  .quiz-item.error {
    animation: errorShake 0.5s ease-in-out;
    border-color: #ef4444 !important;
    background-color: #fef2f2 !important;
  }
  
  @keyframes errorShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  
  /* Loading state */
  .quiz-item.loading {
    background: linear-gradient(
      90deg,
      #f0f0f0 25%,
      #e0e0e0 50%,
      #f0f0f0 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .quiz-item {
      border-width: 2px;
    }
    
    .quiz-connection {
      height: 4px !important;
    }
    
    .pair-number {
      border-width: 2px !important;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .quiz-item,
    .quiz-connection,
    .pair-number {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// Safely add animations with error handling
try {
	if (!document.head.querySelector('style[data-matching-pairs-animations]')) {
		matchingPairsAnimations.setAttribute(
			'data-matching-pairs-animations',
			'true',
		);
		document.head.appendChild(matchingPairsAnimations);
	}
} catch (error) {
	console.warn('Could not add matching pairs animations:', error);
}

// Function to create a matching connection in quiz mode
function createMatchingConnectionQuiz(leftItem, rightItem) {
	console.log(
		'Creating connection between:',
		leftItem.dataset.value,
		'and',
		rightItem.dataset.value,
	);

	const connectionsContainer = document.querySelector('.quiz-connections');
	if (!connectionsContainer) return;

	// Create connection line
	const connection = document.createElement('div');
	connection.className = 'quiz-connection';
	connection.dataset.left = leftItem.dataset.value;
	connection.dataset.right = rightItem.dataset.value;

	// Add click handler to remove connection
	connection.addEventListener('click', function (e) {
		e.stopPropagation();
		this.remove();
	});

	connectionsContainer.appendChild(connection);

	// Show the connection
	setTimeout(() => {
		connection.style.display = 'block';
		updateConnectionPositions();

		// Add animation effect
		connection.classList.add('new-connection');
	}, 10);
}

// Function to// Update connection positions
function updateQuizConnectionPositions() {
	const connections = document.querySelectorAll(
		'.quiz-connection.active-connection',
	);
	const connectionsContainer = document.querySelector('.quiz-connections');

	if (!connectionsContainer) return;

	// Get the reference container (parent of connections)
	const containerRect = connectionsContainer.getBoundingClientRect();

	connections.forEach((connection) => {
		const leftValue = connection.dataset.left;
		const rightValue = connection.dataset.right;

		const leftItem = document.querySelector(
			`.quiz-item[data-value="${leftValue}"][data-column="left"]`,
		);
		const rightItem = document.querySelector(
			`.quiz-item[data-value="${rightValue}"][data-column="right"]`,
		);

		if (leftItem && rightItem) {
			const leftItemRect = leftItem.getBoundingClientRect();
			const rightItemRect = rightItem.getBoundingClientRect();

			// Calculate positions relative to the connections container
			const leftX = leftItemRect.right - containerRect.left;
			const leftY =
				leftItemRect.top - containerRect.top + leftItemRect.height / 2;
			const rightX = rightItemRect.left - containerRect.left;
			const rightY =
				rightItemRect.top - containerRect.top + rightItemRect.height / 2;

			const length = Math.sqrt(
				Math.pow(rightX - leftX, 2) + Math.pow(rightY - leftY, 2),
			);
			const angle =
				(Math.atan2(rightY - leftY, rightX - leftX) * 180) / Math.PI;

			connection.style.width = length + 'px';
			connection.style.left = leftX + 'px';
			connection.style.top = leftY + 'px';
			connection.style.transform = `rotate(${angle}deg)`;
			connection.style.transformOrigin = '0 50%';
		}
	});
}

// Function to handle matching pairs next question (DEPRECATED - replaced with auto-progression)
/*
function handleMatchingPairsNext() {
  console.log('Handling matching pairs next question');
  
  const connections = document.querySelectorAll('.quiz-connection');
  const userAnswer = [];
  
  // Show loading state
  const nextBtn = document.querySelector('.next-question-btn');
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.innerHTML = `
      <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Checking Answer...
    `;
  }
  
  connections.forEach(connection => {
    const left = connection.dataset.left;
    const right = connection.dataset.right;
    userAnswer.push(`${left} → ${right}`);
  });
  
  const answerString = userAnswer.join(',');
  console.log('User answer:', answerString);
  
  // Check if the answer is correct
  const q = questions[currentQuestion];
  const correctAnswer = q.answer || '';
  
  let isCorrect = false;
  if (answerString === correctAnswer) {
    isCorrect = true;
  } else {
    // Try to match the pairs regardless of order
    const userPairs = answerString.split(',').map(pair => {
      const [left, right] = pair.split('→').map(item => item.trim());
      return { left, right };
    });
    
    const correctPairs = correctAnswer.split(',').map(pair => {
      const [left, right] = pair.split('→').map(item => item.trim());
      return { left, right };
    });
    
    // Check if all pairs match (order doesn't matter)
    const userPairsSet = new Set(userPairs.map(p => `${p.left}-${p.right}`));
    const correctPairsSet = new Set(correctPairs.map(p => `${p.left}-${p.right}`));
    
    isCorrect = userPairsSet.size === correctPairsSet.size &&
                [...userPairsSet].every(pair => correctPairsSet.has(pair));
  }
  
  // Show visual feedback
  setTimeout(() => {
    if (nextBtn) {
      if (isCorrect) {
        nextBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Correct! Next Question
        `;
        nextBtn.style.background = '#10b981';
        
        // Add success animation to connections
        connections.forEach(connection => {
          connection.style.animation = 'successPulse 0.6s ease';
        });
        
      } else {
        nextBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12"/>
          </svg>
          Try Again
        `;
        nextBtn.style.background = '#ef4444';
        
        // Shake animation for incorrect answer
        const quizContainer = document.querySelector('.matching-pairs-quiz');
        if (quizContainer) {
          quizContainer.style.animation = 'shake 0.5s ease';
        }
      }
    }
    
    // Add shake animation CSS if not exists
    if (!document.getElementById('shake-animation')) {
      const shakeStyle = document.createElement('style');
      shakeStyle.id = 'shake-animation';
      shakeStyle.textContent = `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(shakeStyle);
    }
    
    if (isCorrect) {
      const questionPoints = questions[currentQuestion].points || 1;
      score += questionPoints;
      updateScoreDisplay();
      showToast('Perfect match! Well done! 🎉', 'success');
      
      // Store answer before proceeding
      const q = questions[currentQuestion];
      const questionPoints = q.points || 1;
      saveAnswer(currentQuestion, userAnswer, isCorrect, questionPoints);
      
      // Proceed to next question after delay
      setTimeout(() => {
        currentQuestion++;
        if (currentQuestion >= quizConfig.totalQuestions) {
          endQuiz();
        } else {
          showQuestion(currentQuestion);
        }
      }, 1500);
    } else {
      applyTimePenalty();
      showToast('Not quite right. Check your pairs and try again! 🤔', 'error');
      
      // Reset button after delay
      setTimeout(() => {
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.innerHTML = 'Next Question';
          nextBtn.style.background = '';
        }
        
        // Remove shake animation
        const quizContainer = document.querySelector('.matching-pairs-quiz');
        if (quizContainer) {
          quizContainer.style.animation = '';
        }
      }, 2000);
    }
  }, 1000);
}
*/

// Add CSS for matching pairs quiz
const matchingPairsQuizStyles = document.createElement('style');
matchingPairsQuizStyles.textContent = `
  .matching-pairs-quiz {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .quiz-left-column,
  .quiz-right-column {
    min-height: 200px;
    border: 2px dashed #e2e8f0;
    border-radius: 0.5rem;
    padding: 1rem;
    background: #f8fafc;
    position: relative;
  }
  
  .quiz-left-column h4,
  .quiz-right-column h4 {
    margin: 0 0 1rem 0;
    color: #64748b;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: center;
  }
  
  .quiz-item {
    padding: 0.75rem;
    margin: 0.5rem 0;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: center;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-height: 45px;
  }
  
  .quiz-item:hover:not(.paired) {
    border-color: var(--primary-color);
    background-color: #eff6ff;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  }
  
  .quiz-item.selected {
    transform: scale(1.05);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3);
    z-index: 2 !important;
    border-color: var(--primary-color) !important;
    background-color: #eff6ff !important;
  }
  
  .quiz-item.paired {
    cursor: not-allowed;
    opacity: 0.8;
  }
  
  .pair-number {
    animation: bounceIn 0.5s ease;
  }
  
  @keyframes bounceIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.8;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    font-size: 0.9rem;
  }
  
  .quiz-item:hover {
    border-color: var(--primary-color);
    background-color: #eff6ff;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  }
  
  .quiz-item.selected {
    border-color: var(--primary-color);
    background-color: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  
  .quiz-connection {
    position: absolute;
    height: 2px;
    background: var(--primary-color);
    pointer-events: auto;
    cursor: pointer;
    transition: all 0.2s ease;
    transform-origin: 0 50%;
    display: none;
  }
  
  .quiz-connection::before {
    content: '';
    position: absolute;
    right: -4px;
    top: -3px;
    width: 0;
    height: 0;
    border-left: 8px solid var(--primary-color);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
  }
  
  .quiz-connection::after {
    content: '';
    position: absolute;
    left: -4px;
    top: -3px;
    width: 0;
    height: 0;
    border-right: 8px solid var(--primary-color);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
  }
  
  .quiz-connection:hover {
    background: #ef4444;
  }
  
  .quiz-connection:hover::before {
    border-left-color: #ef4444;
  }
  
  .quiz-connection:hover::after {
    border-right-color: #ef4444;
  }
  
  @media (max-width: 768px) {
    .matching-columns {
      flex-direction: column;
      gap: 1rem;
    }
    
    .quiz-left-column,
    .quiz-right-column {
      min-height: 100px;
    }
  }
`;
document.head.appendChild(matchingPairsQuizStyles);

// Add success animation CSS if not exists
if (!document.getElementById('matching-success-animation')) {
	const successStyle = document.createElement('style');
	successStyle.id = 'matching-success-animation';
	successStyle.textContent = `
    @keyframes successPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); background-color: rgba(16, 185, 129, 0.1); }
      100% { transform: scale(1); }
    }
    
    .pair-number-badge {
      position: absolute !important;
      top: -14px !important;
      right: -14px !important;
      width: 32px !important;
      height: 32px !important;
      border-radius: 50% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-weight: bold !important;
      font-size: 1.1rem !important;
      z-index: 9999 !important;
      animation: bounceIn 0.5s ease !important;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4) !important;
      border: 3px solid white !important;
      backdrop-filter: blur(4px) !important;
    }
    
    @keyframes bounceIn {
      0% { transform: scale(0); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
    
    .quiz-item {
      position: relative;
    }
    
    .matching-item.paired::before,
    .quiz-item.paired::before {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 2rem;
      color: rgba(255, 255, 255, 0.9);
      z-index: 100;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      font-weight: bold;
    }
    
    .quiz-item.paired {
      cursor: pointer !important;
      opacity: 0.9;
      position: relative;
    }
    
    .quiz-item.paired:hover {
      opacity: 1;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .quiz-item.paired:hover::after {
      content: 'Click to unlink';
      position: absolute;
      bottom: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(239, 68, 68, 0.95);
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      z-index: 1001;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .matching-status {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-top: 1rem;
      padding: 1rem;
      background: rgba(59, 130, 246, 0.05);
      border-radius: 0.5rem;
      border: 1px solid rgba(59, 130, 246, 0.1);
    }
    
    .status-item {
      text-align: center;
    }
    
    .status-label {
      display: block;
      font-size: 0.875rem;
      color: #64748b;
      margin-bottom: 0.25rem;
    }
    
    .status-value {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--primary-color);
    }
    
    // Render question content function for modals
    window.renderQuestionContent = function(questionText, question, questionType, options, image, showTypeBadge = false, showPointsBadge = true) {
        // Create category badge
        const savedCategories = window.__DI_CONTAINER__.repo.getAll_sync('categories');
        const categoryId = question.category || 'uncategorized';
        const category = savedCategories.find(cat => cat.id === categoryId || cat.name === categoryId) ||
                        { name: 'Uncategorized', color: '#9ca3af' };
        
        const categoryBadge = '<span class="category-badge" style="background-color: ' + category.color + '">' + escapeHtml(category.name) + '</span>';
        
        // Create points badge
        let pointsBadge = '';
        if (showPointsBadge) {
            const points = question && question.points ? Number.parseFloat(question.points) : 1;
            pointsBadge = '<span class="type-badge points-badge" style="background-color: #f59e0b; color: white; border-color: #d97706;">⭐ ' + points + ' pt' + (points !== 1 ? 's' : '') + '</span>';
        }
        
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
        }
        
        // Create type badge with proper styling
        const typeBadge = showTypeBadge ? '<span class="type-badge ' + questionTypeClass + '">' + questionTypeDisplay + '</span>' : '';
        
        // Create question content
        const questionTextHtml = escapeHtml(questionText || 'No question text');
        
        const content = '<div class="question-content"><div class="question-text">' + questionTextHtml + '</div><div class="question-meta">' + categoryBadge + pointsBadge + typeBadge + '</div></div>';
        
        return content;
    };
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      50% { transform: translateX(5px); }
      75% { transform: translateX(-5px); }
    }
    
    .quiz-item.shake {
      animation: shake 0.3s ease;
    }
  `;
	document.head.appendChild(successStyle);
}

// Add window resize listener for connection positioning
window.addEventListener('resize', function () {
	if (typeof updateQuizConnectionPositions === 'function') {
		updateQuizConnectionPositions();
	}
});

// Ensure all questions have difficulty field
function ensureQuestionsHaveDifficulty() {
	const savedQuestions = JSON.parse(
		JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
	);
	const questions = savedQuestions || [];

	let updated = false;
	const updatedQuestions = questions.map((question) => {
		if (!question.difficulty) {
			updated = true;
			return {
				...question,
				difficulty: 'medium', // Default difficulty
			};
		}
		return question;
	});

	if (updated) {
		window.__DI_CONTAINER__.repo.setAll_sync('questions', updatedQuestions);
		console.log(
			'Updated',
			updatedQuestions.length - questions.length,
			'questions to include difficulty field',
		);
	}

	return updated;
}

// Initialize difficulty fields for all questions
function initializeQuestionDifficulty() {
	ensureQuestionsHaveDifficulty();
}

// Call this function when the app loads
document.addEventListener('DOMContentLoaded', function () {
	initializeQuestionDifficulty();
});

// Test function to verify localStorage structure
function testLocalStorageStructure() {
	console.log('=== Testing localStorage structure ===');

	// Test quizSettings
	const settings = (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});
	console.log('quizSettings:', settings);
	console.log('quizSettings keys:', Object.keys(settings));
	console.log('quizSettings has penalty:', settings.penalty !== undefined);
	console.log('quizSettings has timeLimit:', settings.timeLimit !== undefined);

	// Test quizQuestions
	const questions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
	console.log('quizQuestions array length:', questions.length);
	console.log('quizQuestions is array:', Array.isArray(questions));
	console.log(
		'First question sample:',
		questions.length > 0 ? questions[0] : 'No questions',
	);

	// Verify structure
	const hasSettings = Object.keys(settings).length > 0;
	const hasQuestions = Array.isArray(questions) && questions.length > 0;

	console.log('Structure validation:');
	console.log('- quizSettings exists and has data:', hasSettings);
	console.log('- quizQuestions exists and is array:', Array.isArray(questions));
	console.log('- quizQuestions has questions:', questions.length > 0);

	return { hasSettings, hasQuestions, settings, questions };
}

// Make test function available globally for debugging
window.testLocalStorageStructure = testLocalStorageStructure;

/* =========================================
   Fill-in-the-Blank Interaction Logic
   ========================================= */

let selectedWordItem = null; // For tap-to-select interaction

function handleDragStart(e) {
	if (e.target.classList.contains('word-bank-item')) {
		const word = e.target.dataset.word;
		e.dataTransfer.setData('text/plain', word);
		e.dataTransfer.effectAllowed = 'copy';
		e.target.classList.add('dragging');

		// Mobile fallback: Select on drag start too, just in case
		handleWordClick(e.target);
	}
}

function handleDragEnd(e) {
	if (e.target.classList.contains('word-bank-item')) {
		e.target.classList.remove('dragging');
	}
}

function allowDrop(e) {
	e.preventDefault();
	if (e.target.classList.contains('fill-blank-drop-zone')) {
		e.target.classList.add('drag-over');
	}
}

function handleDrop(e) {
	e.preventDefault();
	const dropZone = e.target.closest('.fill-blank-drop-zone');

	if (dropZone) {
		dropZone.classList.remove('drag-over');
		const word = e.dataTransfer.getData('text/plain');
		if (word) {
			fillBlankValue(dropZone, word);
			markWordAsUsed(word);
		}
	}
}

function handleWordClick(element) {
	// If we have a selected drop zone waiting (unlikely flow, but possible)
	const activeDropZone = document.querySelector(
		'.fill-blank-drop-zone.active-drop-target',
	);
	if (activeDropZone) {
		const word = element.dataset.word;
		fillBlankValue(activeDropZone, word);
		markWordAsUsed(word);
		activeDropZone.classList.remove('active-drop-target');
		return;
	}

	// Toggle selection
	if (selectedWordItem === element) {
		// Deselect
		element.classList.remove('selected');
		selectedWordItem = null;
		document
			.querySelectorAll('.fill-blank-drop-zone')
			.forEach((el) => el.classList.remove('active-drop-target'));
	} else {
		// Select new
		if (selectedWordItem) selectedWordItem.classList.remove('selected');
		selectedWordItem = element;
		element.classList.add('selected');

		// Highlight compatible drop zones
		document.querySelectorAll('.fill-blank-drop-zone').forEach((el) => {
			if (!el.classList.contains('filled')) {
				el.classList.add('active-drop-target');
			}
		});
	}
}

function handleDropZoneClick(element) {
	// If a word is selected, place it here
	if (selectedWordItem) {
		const word = selectedWordItem.dataset.word;
		fillBlankValue(element, word);
		markWordAsUsed(word);

		// Clear selection
		selectedWordItem.classList.remove('selected');
		selectedWordItem = null;
		document
			.querySelectorAll('.fill-blank-drop-zone')
			.forEach((el) => el.classList.remove('active-drop-target'));
	} else if (element.classList.contains('filled')) {
		// If already filled, perhaps remove the word?
		const word = element.dataset.value;
		if (word) {
			// Return word to bank
			markWordAsUnused(word);
			// Clear drop zone
			element.innerHTML = '';
			element.className = 'fill-blank-drop-zone';
			delete element.dataset.value;
		}
	}
}

function fillBlankValue(dropZone, word) {
	// If previously filled, return old word to bank
	if (dropZone.dataset.value) {
		markWordAsUnused(dropZone.dataset.value);
	}

	dropZone.innerHTML = `
        <span class="filled-word">${escapeHtml(word)}</span>
        <button class="remove-word-btn" onclick="event.stopPropagation(); clearDropZone(this.parentElement)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
        </button>
    `;
	dropZone.classList.add('filled');
	dropZone.dataset.value = word;
}

function clearDropZone(dropZone) {
	const word = dropZone.dataset.value;
	if (word) {
		markWordAsUnused(word);
	}
	dropZone.innerHTML = '';
	dropZone.className = 'fill-blank-drop-zone';
	delete dropZone.dataset.value;
}

function markWordAsUsed(word) {
	const wordItems = document.querySelectorAll('.word-bank-item');
	for (const item of wordItems) {
		if (item.dataset.word === word && !item.classList.contains('used')) {
			item.classList.add('used');
			item.draggable = false;
			break;
		}
	}
}

function markWordAsUnused(word) {
	// Find a used instance of this word and unmark it
	const wordItems = document.querySelectorAll('.word-bank-item.used');
	for (const item of wordItems) {
		if (item.dataset.word === word) {
			item.classList.remove('used');
			item.draggable = true;
			break;
		}
	}
}

// Ensure these are global
window.handleDragStart = handleDragStart;
window.handleDrop = handleDrop;
window.allowDrop = allowDrop;
window.handleWordClick = handleWordClick;
window.handleDropZoneClick = handleDropZoneClick;

// Legacy Cleanup - Remove keys not needed on client
(function () {
	try {
		// No-op: keep quizClasses/quizExams for admin persistence.
	} catch (e) {
		console.warn('Cleanup failed:', e);
	}

	// Initialize the quiz mode (Training vs Exam) and update Welcome UI
	if (typeof loadQuizMode === 'function') {
		loadQuizMode();
	}
})();

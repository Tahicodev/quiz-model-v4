(function () {
	'use strict';

	function byId(id) {
		return document.getElementById(id);
	}

	function escapeText(value) {
		const text = value === undefined || value === null ? '' : String(value);
		return window.escapeHtml ? window.escapeHtml(text) : text;
	}

	function safeJsonParse(value, fallback) {
		try {
			return JSON.parse(value);
		} catch (e) {
			return fallback;
		}
	}

	function getExamActiveSession() {
		return safeJsonParse(localStorage.getItem('examActiveSession') || 'null', null);
	}

	function getAssignedExams(identity) {
		if (!identity) return [];
		const exams = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('exams')) || '[]', []);
		if (!Array.isArray(exams) || !exams.length) return [];
		const classes = safeJsonParse(JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('classes')) || '[]', []);
		let classId = identity.classId || '';
		if (!classId && identity.class) {
			const match = classes.find((c) => c.name === identity.class);
			if (match) classId = match.id;
		}
		if (!classId) return [];
		return exams.filter(
			(exam) =>
				Array.isArray(exam.classes) &&
				exam.classes.some((id) => String(id) === String(classId)),
		);
	}

	function syncStudentInfoForm(identity) {
		const form = byId('student-info');
		if (!form || !identity) return;
		if (form.numero) form.numero.value = identity.numero || '';
		if (form.name) form.name.value = identity.name || '';
		if (form.class) form.class.value = identity.class || '';
	}

	function setExamStatus(pill, message, variant) {
		if (!pill) return;
		pill.classList.remove('success', 'warning', 'info');
		if (variant) pill.classList.add(variant);
		pill.textContent = message;
	}

	function renderExamSelection(assignedExams) {
		const panel = byId('examSelectionPanel');
		const list = byId('examSelectionList');
		const empty = byId('examSelectionEmpty');
		if (!panel || !list || !empty) return;

		if (!assignedExams || assignedExams.length === 0) {
			list.innerHTML = '';
			empty.classList.remove('hidden');
			panel.classList.remove('hidden');
			return;
		}

		empty.classList.add('hidden');
		panel.classList.remove('hidden');
		list.innerHTML = assignedExams
			.map((exam) => {
				const title = escapeText(exam.name || 'Exam');
				const questions = Number(exam.questions?.length || 0);
				const duration = Number(exam.duration || 0);
				return `
          <button type="button" class="exam-selection-card" data-exam-id="${escapeText(
						exam.id,
					)}">
            <div>
              <h4>${title}</h4>
              <p>${questions} questions · ${duration} min</p>
            </div>
            <span class="exam-selection-cta">Start</span>
          </button>
        `;
			})
			.join('');
	}

	function updateExamEntryAvailability() {
		const pill = byId('examAvailabilityPill');
		const text = byId('examAvailabilityText');
		const startBtn = byId('start-quiz');
		const trainingBtn = byId('start-training');
		const selectionPanel = byId('examSelectionPanel');
		if (!pill || !text) return;

		const user = window.Auth?.getCurrentUser ? window.Auth.getCurrentUser() : null;
		const isStudent = user && user.role === 'student';
		const identity = isStudent && window.Auth?.getStudentIdentity
			? window.Auth.getStudentIdentity(user)
			: null;
		const activeSession = getExamActiveSession();
		const assignedExams = identity ? getAssignedExams(identity) : [];
		const hasStudentAccounts = window.Auth?.getUsers
			? window.Auth
					.getUsers()
					.some((u) => u.role === 'student' && u.status !== 'disabled')
			: false;

		if (!isStudent) {
			setExamStatus(pill, 'Sign in required', 'warning');
			text.textContent =
				'Sign in to view your exams and unlock training mode.';
			if (startBtn) startBtn.disabled = true;
			if (trainingBtn) trainingBtn.disabled = true;
			if (selectionPanel) selectionPanel.classList.add('hidden');
			return;
		}

		if (identity) syncStudentInfoForm(identity);

		if (activeSession && activeSession.examId) {
			setExamStatus(pill, 'Exam ready', 'success');
			text.textContent = activeSession.examName
				? `Exam ready: ${activeSession.examName}. You can start now or choose training.`
				: 'An exam is ready on this device. You can start now or choose training.';
			if (startBtn) {
				startBtn.disabled = false;
				startBtn.classList.remove('hidden');
			}
			if (trainingBtn) trainingBtn.disabled = false;
			renderExamSelection(assignedExams);
			return;
		}

		if (assignedExams.length > 0) {
			setExamStatus(pill, 'Exam assigned', 'info');
			text.textContent = `You have ${assignedExams.length} exam${
				assignedExams.length === 1 ? '' : 's'
			} assigned. Select an exam below or start training mode.`;
			if (startBtn) {
				startBtn.disabled = true;
				startBtn.classList.add('hidden');
			}
			if (trainingBtn) trainingBtn.disabled = false;
			renderExamSelection(assignedExams);
			return;
		}

		setExamStatus(pill, 'No exam', 'warning');
		text.textContent =
			'No exams are assigned to your class yet. You can start a training exam instead.';
		if (startBtn) {
			startBtn.disabled = true;
			startBtn.classList.add('hidden');
		}
		if (trainingBtn) trainingBtn.disabled = false;
		renderExamSelection([]);
	}

		function redirectIfLoggedIn() {
			if (isExamFlowActive()) return false;
			const user = window.Auth?.getCurrentUser ? window.Auth.getCurrentUser() : null;
			if (!user) return false;
			if (user.role === 'student') {
				window.location.href = 'student-workspace.html';
				return true;
			}
			if (user.role === 'admin' || user.role === 'super_admin') {
				window.location.href = 'admin.html';
				return true;
			}
			return false;
		}

	function openStudentAuthModal() {
		const modal = byId('studentAuthModal');
		if (!modal) return;
		modal.style.display = 'flex';
		modal.classList.add('active');
	}

	function isExamFlowActive() {
		const params = new URLSearchParams(window.location.search);
		if (params.get('examId') || params.get('mode') === 'training') return true;
		return (
			sessionStorage.getItem('landingMode') === 'exam' || shouldAutoShowExam()
		);
	}

	function showExamEntry() {
		const actions = byId('landing-actions');
		const examEntry = byId('exam-entry');
		if (actions) actions.classList.add('hidden');
		if (examEntry) examEntry.classList.remove('hidden');
		sessionStorage.setItem('landingMode', 'exam');
		if (examEntry) {
			examEntry.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		updateExamEntryAvailability();
	}

	function showLanding() {
		const actions = byId('landing-actions');
		const examEntry = byId('exam-entry');
		if (actions) actions.classList.remove('hidden');
		if (examEntry) examEntry.classList.add('hidden');
		sessionStorage.removeItem('landingMode');
		const welcome = byId('welcome-title');
		if (welcome) {
			welcome.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function shouldAutoShowExam() {
		try {
			const activeSession = JSON.parse(
				localStorage.getItem('examActiveSession') || 'null',
			);
			return Boolean(activeSession && activeSession.examId);
		} catch (e) {
			return false;
		}
	}

	function tryStartExam() {
		if (!shouldAutoShowExam()) return;
		const startBtn = byId('start-quiz');
		if (!startBtn) return;
	}

	function bindLandingActions() {
		const examButton = byId('landingExamButton');
		if (examButton) {
			examButton.addEventListener('click', () => {
				showExamEntry();
				const user = window.Auth?.getCurrentUser
					? window.Auth.getCurrentUser()
					: null;
				if (!user || user.role !== 'student') {
					openStudentAuthModal();
				} else {
					updateExamEntryAvailability();
				}
			});
		}

		const workspaceButton = byId('landingWorkspaceButton');
		if (workspaceButton) {
			workspaceButton.addEventListener('click', () => {
				sessionStorage.removeItem('landingMode');
				window.location.href = 'student-workspace.html';
			});
		}

		const backButton = byId('landingBackButton');
		if (backButton) {
			backButton.addEventListener('click', () => {
				showLanding();
			});
		}

		const trainingButton = byId('start-training');
		if (trainingButton) {
			trainingButton.addEventListener('click', () => {
				const isStudent = window.Auth?.isStudent ? window.Auth.isStudent() : false;
				if (!isStudent) {
					openStudentAuthModal();
					return;
				}
				const identity = window.Auth?.getStudentIdentity
					? window.Auth.getStudentIdentity()
					: null;
				if (identity) syncStudentInfoForm(identity);
				sessionStorage.removeItem('landingMode');
				if (typeof window.startTrainingMode === 'function') {
					window.startTrainingMode();
				}
			});
		}

		const selectionList = byId('examSelectionList');
		if (selectionList) {
			selectionList.addEventListener('click', (event) => {
				const card = event.target.closest('[data-exam-id]');
				if (!card) return;
				const examId = card.dataset.examId;
				if (!examId) return;
				const identity = window.Auth?.getStudentIdentity
					? window.Auth.getStudentIdentity()
					: null;
				if (identity) syncStudentInfoForm(identity);
				if (typeof window.startExam === 'function') {
					window.startExam(examId);
				} else {
					window.location.href = `index.html?examId=${encodeURIComponent(
						examId,
					)}`;
				}
			});
		}
	}

	document.addEventListener('DOMContentLoaded', () => {
		bindLandingActions();
		if (isExamFlowActive()) {
			showExamEntry();
			return;
		}
		redirectIfLoggedIn();
		updateExamEntryAvailability();
	});

		window.addEventListener('auth:changed', (event) => {
			const user = event?.detail?.user;
			if (!user) {
				updateExamEntryAvailability();
				return;
			}
			if (user.role === 'student') {
				if (isExamFlowActive()) {
					showExamEntry();
					updateExamEntryAvailability();
					return;
				}
				window.location.href = 'student-workspace.html';
			} else if (user.role === 'admin' || user.role === 'super_admin') {
				window.location.href = 'admin.html';
			} else {
				updateExamEntryAvailability();
			}
		});

	window.addEventListener('storage', (event) => {
		if (event.key === 'examActiveSession' || event.key === 'quizExams') {
			updateExamEntryAvailability();
		}
	});
})();

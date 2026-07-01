/**
 * Quiz Presets Management
 * Handles CRUD operations for reusable quiz configuration presets
 */

(function () {
	// Initialize presets on load
	document.addEventListener('DOMContentLoaded', () => {
		loadPresetsList();
	});

	/**
	 * Load all presets from localStorage
	 * @returns {Array} Array of preset objects
	 */
	function loadPresets() {
		try {
			const presets = JSON.parse(localStorage.getItem('quizPresets') || '[]');
			// Initialize default preset if empty (helps usage)
			if (presets.length === 0) {
				const defaultPreset = {
					id: 'preset-default-demo',
					name: 'Standard Quick Quiz',
					timeLimit: 300,
					penalty: 0,
					shuffleQuestions: true,
					showExplanations: false,
					primaryColor: '#2563eb',
					secondaryColor: '#1e40af',
					backgroundColor: '#f8fafc',
					textColor: '#1e293b',
					inputFocusColor: '#3b82f6',
					fontFamily: "'Segoe UI', system-ui",
					passingScore: 50,
					welcomeTitle: 'Quick Quiz',
					welcomeMessage: 'Good luck!',
					createdAt: new Date().toISOString()
				};
				savePresetsToStorage([defaultPreset]);
				return [defaultPreset];
			}
			return presets;
		} catch (e) {
			console.error('Error loading presets:', e);
			return [];
		}
	}

	/**
	 * Save presets to localStorage
	 * @param {Array} presets - Array of preset objects
	 */
	function savePresetsToStorage(presets) {
		localStorage.setItem('quizPresets', JSON.stringify(presets));
	}

	/**
	 * Generate a unique ID for presets
	 */
	function generatePresetId() {
		return 'preset-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
	}

	/**
	 * Render the presets list in the settings modal
	 */
	function loadPresetsList() {
		const container = document.getElementById('presetsList');
		if (!container) return;

		const presets = loadPresets();

		if (presets.length === 0) {
			container.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">No presets created yet</div>';
			return;
		}

		container.innerHTML = presets.map(preset => `
			<div class="preset-item" data-preset-id="${preset.id}" style="
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 12px 16px;
				border-bottom: 1px solid #e2e8f0;
				background: white;
			">
				<div style="display: flex; align-items: center; gap: 12px;">
					<div style="
						width: 12px;
						height: 12px;
						border-radius: 50%;
						background: ${preset.primaryColor || '#2563eb'};
					"></div>
					<div>
						<div style="font-weight: 600; color: #1e293b;">${escapeHtml(preset.name)}</div>
						<div style="font-size: 12px; color: #64748b;">
							${formatTime(preset.timeLimit)} • ${preset.penalty || 0}pts penalty • ${preset.passingScore || 50}% to pass
						</div>
					</div>
				</div>
				<div style="display: flex; gap: 8px;">
					<button type="button" class="btn btn-sm btn-secondary" onclick="editPreset('${preset.id}')" title="Edit">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
						</svg>
					</button>
					<button type="button" class="btn btn-sm btn-danger-soft" onclick="deletePreset('${preset.id}')" title="Delete">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6"></polyline>
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
						</svg>
					</button>
				</div>
			</div>
		`).join('');
	}

	/**
	 * Format time in seconds to readable format
	 */
	function formatTime(seconds) {
		if (!seconds) return '5 min';
		if (seconds < 60) return seconds + 's';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (secs === 0) return mins + ' min';
		return mins + 'm ' + secs + 's';
	}

	/**
	 * Save a new preset or update existing one
	 */
	function savePreset() {
		const editingId = document.getElementById('editingPresetId')?.value;
		const name = document.getElementById('preset-name')?.value?.trim();
		const timeLimit = parseInt(document.getElementById('preset-timeLimit')?.value) || 300;
		const penalty = parseInt(document.getElementById('preset-penalty')?.value) || 0;
		const shuffleQuestions = document.getElementById('preset-shuffleQuestions')?.checked ?? true;
		const showExplanations = document.getElementById('preset-showExplanations')?.checked ?? false;
		const primaryColor = document.getElementById('preset-primaryColor')?.value || '#2563eb';
		const secondaryColor = document.getElementById('preset-secondaryColor')?.value || '#1e40af';
		const backgroundColor = document.getElementById('preset-backgroundColor')?.value || '#f8fafc';
		const textColor = document.getElementById('preset-textColor')?.value || '#1e293b';
		const inputFocusColor = document.getElementById('preset-inputFocusColor')?.value || '#3b82f6';
		const fontFamily = document.getElementById('preset-fontFamily')?.value || "'Segoe UI', system-ui";
		const passingScore = parseInt(document.getElementById('preset-passingScore')?.value) || 50;
		const welcomeTitle = document.getElementById('preset-welcomeTitle')?.value || '';
		const welcomeMessage = document.getElementById('preset-welcomeMessage')?.value || '';

		if (!name) {
			showToast('Please enter a preset name', 'error');
			return;
		}

		const presets = loadPresets();

		const presetData = {
			id: editingId || generatePresetId(),
			name,
			timeLimit,
			penalty,
			shuffleQuestions,
			showExplanations,
			primaryColor,
			secondaryColor,
			backgroundColor,
			textColor,
			inputFocusColor,
			fontFamily,
			passingScore,
			welcomeTitle,
			welcomeMessage,
			updatedAt: new Date().toISOString()
		};

		if (editingId) {
			// Update existing preset
			const index = presets.findIndex(p => p.id === editingId);
			if (index !== -1) {
				presetData.createdAt = presets[index].createdAt;
				presets[index] = presetData;
				showToast('Preset updated successfully', 'success');
			}
		} else {
			// Create new preset
			presetData.createdAt = new Date().toISOString();
			presets.push(presetData);
			showToast('Preset created successfully', 'success');
		}

		savePresetsToStorage(presets);
		loadPresetsList();
		cancelPresetEdit();

		// Refresh dropdown in General settings
		if (window.refreshTrainingPresetDropdown) window.refreshTrainingPresetDropdown();

		// Scroll to the saved preset

		// Scroll to the saved preset
		setTimeout(() => {
			const presetElement = document.querySelector(`.preset-item[data-preset-id="${presetData.id}"]`);
			if (presetElement) {
				presetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				// Add a highlight effect
				presetElement.style.transition = 'background-color 0.5s ease';
				presetElement.style.backgroundColor = '#ecfccb'; // Light green highlight
				setTimeout(() => {
					presetElement.style.backgroundColor = 'white';
				}, 2000);
			}
		}, 100);
	}

	/**
	 * Edit an existing preset
	 */
	function editPreset(presetId) {
		const presets = loadPresets();
		const preset = presets.find(p => p.id === presetId);
		if (!preset) {
			showToast('Preset not found', 'error');
			return;
		}

		// Populate form
		document.getElementById('editingPresetId').value = preset.id;
		document.getElementById('presetFormTitle').textContent = 'Edit Preset';
		document.getElementById('preset-name').value = preset.name;
		document.getElementById('preset-timeLimit').value = preset.timeLimit || 300;
		document.getElementById('preset-penalty').value = preset.penalty || 0;
		document.getElementById('preset-shuffleQuestions').checked = preset.shuffleQuestions ?? true;
		document.getElementById('preset-showExplanations').checked = preset.showExplanations ?? false;
		document.getElementById('preset-primaryColor').value = preset.primaryColor || '#2563eb';
		document.getElementById('preset-primaryColor-text').value = preset.primaryColor || '#2563eb';
		document.getElementById('preset-secondaryColor').value = preset.secondaryColor || '#1e40af';
		document.getElementById('preset-secondaryColor-text').value = preset.secondaryColor || '#1e40af';
		document.getElementById('preset-backgroundColor').value = preset.backgroundColor || '#f8fafc';
		document.getElementById('preset-backgroundColor-text').value = preset.backgroundColor || '#f8fafc';
		document.getElementById('preset-textColor').value = preset.textColor || '#1e293b';
		document.getElementById('preset-textColor-text').value = preset.textColor || '#1e293b';
		document.getElementById('preset-inputFocusColor').value = preset.inputFocusColor || '#3b82f6';
		document.getElementById('preset-inputFocusColor-text').value = preset.inputFocusColor || '#3b82f6';
		document.getElementById('preset-fontFamily').value = preset.fontFamily || "'Segoe UI', system-ui";
		document.getElementById('preset-passingScore').value = preset.passingScore || 50;

		// Optional fields
		document.getElementById('preset-welcomeTitle').value = preset.welcomeTitle || '';
		document.getElementById('preset-welcomeMessage').value = preset.welcomeMessage || '';

		// Scroll to form for better UX
		document.querySelector('.preset-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	/**
	 * Delete a preset
	 */
	function deletePreset(presetId) {
		if (!confirm('Are you sure you want to delete this preset?')) return;

		const presets = loadPresets();
		const filtered = presets.filter(p => p.id !== presetId);
		savePresetsToStorage(filtered);
		loadPresetsList();
		showToast('Preset deleted', 'success');

		// Refresh dropdown in General settings
		if (window.refreshTrainingPresetDropdown) window.refreshTrainingPresetDropdown();
	}

	/**
	 * Cancel editing and reset form
	 */
	function cancelPresetEdit() {
		document.getElementById('editingPresetId').value = '';
		document.getElementById('presetFormTitle').textContent = 'Create New Preset';
		document.getElementById('preset-name').value = '';
		document.getElementById('preset-timeLimit').value = 300;
		document.getElementById('preset-penalty').value = 0;
		document.getElementById('preset-shuffleQuestions').checked = true;
		document.getElementById('preset-showExplanations').checked = false;
		document.getElementById('preset-primaryColor').value = '#2563eb';
		document.getElementById('preset-primaryColor-text').value = '#2563eb';
		document.getElementById('preset-secondaryColor').value = '#1e40af';
		document.getElementById('preset-secondaryColor-text').value = '#1e40af';
		document.getElementById('preset-backgroundColor').value = '#f8fafc';
		document.getElementById('preset-backgroundColor-text').value = '#f8fafc';
		document.getElementById('preset-textColor').value = '#1e293b';
		document.getElementById('preset-textColor-text').value = '#1e293b';
		document.getElementById('preset-inputFocusColor').value = '#3b82f6';
		document.getElementById('preset-inputFocusColor-text').value = '#3b82f6';
		document.getElementById('preset-fontFamily').value = "'Segoe UI', system-ui";
		document.getElementById('preset-passingScore').value = 50;
		document.getElementById('preset-welcomeTitle').value = '';
		document.getElementById('preset-welcomeMessage').value = '';
	}

	/**
	 * Get a preset by ID
	 */
	function getPresetById(presetId) {
		const presets = loadPresets();
		return presets.find(p => p.id === presetId) || null;
	}

	/**
	 * Get all presets for dropdown
	 */
	function getAllPresets() {
		return loadPresets();
	}

	/**
	 * Escape HTML to prevent XSS
	 */
	function escapeHtml(text) {
		if (!text) return '';
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	// Expose to window for onclick handlers
	window.savePreset = savePreset;
	window.editPreset = editPreset;
	window.deletePreset = deletePreset;
	window.cancelPresetEdit = cancelPresetEdit;
	window.getPresetById = getPresetById;
	window.getAllPresets = getAllPresets;
	window.loadPresetsList = loadPresetsList;
})();

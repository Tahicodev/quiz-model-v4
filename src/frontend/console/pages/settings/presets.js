/**
 * src/frontend/console/pages/settings/presets.js
 *
 * Presets — the ready-made configurations a teacher starts from.
 *
 * Ported from the legacy "Presets" settings tab, which held TWO kinds of
 * preset that live in two different places:
 *
 *   • QUIZ presets live in the browser's localStorage (`quizPresets`). They
 *     are a per-browser convenience: the shape, the colours and the wording
 *     of a quick quiz. The console shares the origin with the classroom
 *     surface, so it reads and writes the SAME store — no migration, no
 *     duplicate, and what the teacher sees in the console is exactly what
 *     the classroom panel will offer.
 *
 *   • GAME presets live on the SERVER (`/api/v1/game-presets`). They are
 *     the arena configuration a whole school shares, so they belong to the
 *     organization and are administered here.
 */

import { api } from '../../core/api.js';
import { toast, confirmDialog, openModal } from '../../components/ui.js';
import { renderTable } from '../../components/table.js';
import { select, checkbox } from '../../components/form.js';
import { panel, field, escapeHtml, loadSettings, saveSetting } from './index.js';

const QUIZ_PRESET_KEY = 'quizPresets';

const GAME_TYPES = [
	{ value: 'quiz', label: 'Quiz' },
	{ value: 'battle', label: 'Battle' },
	{ value: 'tournament', label: 'Tournament' },
	{ value: 'kids', label: 'Kids game' },
];

const GAME_MODES = [
	{ value: 'individual', label: 'Individual' },
	{ value: 'team', label: 'Team' },
	{ value: 'tournament', label: 'Tournament' },
];

/** Read the browser's quiz presets. */
function readQuizPresets() {
	try {
		const raw = localStorage.getItem(QUIZ_PRESET_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Write the browser's quiz presets. */
function writeQuizPresets(presets) {
	try {
		localStorage.setItem(QUIZ_PRESET_KEY, JSON.stringify(presets));
		return true;
	} catch {
		return false;
	}
}

/**
 * The quiz preset editor.
 *
 * The legacy panel opened a modal with all seventeen fields of a preset. The
 * console offers the same editor — the same field names, the same defaults —
 * so a preset created in one place is understood by the other.
 *
 * The presets live in the browser's `localStorage`, which both surfaces
 * share: the console and the classroom panel are the same origin.
 */
const QUIZ_PRESET_FIELDS = [
	{ key: 'name', label: 'Name', type: 'text', width: 'full' },
	{ key: 'totalQuestions', label: 'Questions', type: 'number' },
	{
		key: 'timerMode',
		label: 'Timer mode',
		type: 'select',
		options: [
			{ value: 'fixed', label: 'One limit for the whole quiz' },
			{ value: 'per-question', label: 'A limit per question' },
			{ value: 'none', label: 'No limit' },
		],
	},
	{ key: 'perQuestionTime', label: 'Seconds per question', type: 'number' },
	{ key: 'timeLimit', label: 'Total time (seconds)', type: 'number' },
	{ key: 'penalty', label: 'Penalty per wrong answer', type: 'number' },
	{ key: 'passingScore', label: 'Passing score (%)', type: 'number' },
	{ key: 'shuffleQuestions', label: 'Shuffle the questions', type: 'checkbox' },
	{ key: 'showExplanations', label: 'Show the explanations', type: 'checkbox' },
	{ key: 'primaryColor', label: 'Primary colour', type: 'color' },
	{ key: 'secondaryColor', label: 'Secondary colour', type: 'color' },
	{ key: 'backgroundColor', label: 'Background colour', type: 'color' },
	{ key: 'textColor', label: 'Text colour', type: 'color' },
	{ key: 'inputFocusColor', label: 'Input focus colour', type: 'color' },
	{ key: 'fontFamily', label: 'Typeface', type: 'text', width: 'full' },
	{ key: 'welcomeTitle', label: 'Welcome title', type: 'text', width: 'full' },
	{ key: 'welcomeMessage', label: 'Welcome message', type: 'text', width: 'full' },
];

const QUIZ_PRESET_DEFAULTS = {
	name: '',
	totalQuestions: 5,
	timerMode: 'fixed',
	perQuestionTime: 60,
	timeLimit: 300,
	penalty: 0,
	passingScore: 50,
	shuffleQuestions: true,
	showExplanations: false,
	primaryColor: '#2563eb',
	secondaryColor: '#1e40af',
	backgroundColor: '#f8fafc',
	textColor: '#1e293b',
	inputFocusColor: '#3b82f6',
	fontFamily:
		"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
	welcomeTitle: '',
	welcomeMessage: '',
};

/** Render one control of the preset editor. */
function presetControl(preset, field) {
	const id = `preset-${field.key}`;
	const value = preset?.[field.key] ?? QUIZ_PRESET_DEFAULTS[field.key];
	if (field.type === 'checkbox') {
		return `<label class="ac-check">
			<input type="checkbox" id="${escapeHtml(id)}" ${value ? 'checked' : ''} />
			<span><span class="ac-check__label">${escapeHtml(field.label)}</span></span>
		</label>`;
	}
	if (field.type === 'select') {
		return `<div class="ac-field">
			<label class="ac-field__label" for="${escapeHtml(id)}">${escapeHtml(field.label)}</label>
			<select class="ac-select" id="${escapeHtml(id)}">
				${field.options
					.map(
						(option) =>
							`<option value="${escapeHtml(option.value)}"${
								String(option.value) === String(value) ? ' selected' : ''
							}>${escapeHtml(option.label)}</option>`,
					)
					.join('')}
			</select>
		</div>`;
	}
	return `<div class="ac-field${field.width === 'full' ? ' ac-field--full' : ''}">
		<label class="ac-field__label" for="${escapeHtml(id)}">${escapeHtml(field.label)}</label>
		<input class="ac-input ac-input--full" id="${escapeHtml(id)}" type="${escapeHtml(field.type)}" value="${escapeHtml(
		value ?? '',
	)}" autocomplete="off" />
	</div>`;
}

export async function presetsSection(ctx) {
	const [gamePayload, settings] = await Promise.all([
		api.get('game-presets').catch(() => []),
		loadSettings(),
	]);

	const gamePresets = Array.isArray(gamePayload) ? gamePayload : [];
	const quizPresets = readQuizPresets();
	const trainingPresetId = settings.get('trainingPresetId')?.value ?? '';

	const markup = [
		panel({
			title: 'Quiz presets',
			subtitle:
				'The ready-made quick-quiz configurations. They are stored in this browser and are shared with the classroom panel.',
			actions:
				'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-preset-new>New quiz preset</button>',
			body: `${
				quizPresets.length
					? renderTable({
							columns: [
								{
									key: 'name',
									label: 'Preset',
									render: (row) =>
										`<span class="ac-table__primary">${escapeHtml(row.name || '')}</span><br><span class="ac-table__muted">${escapeHtml(
											row.id || '',
										)}</span>`,
								},
								{
									key: 'totalQuestions',
									label: 'Questions',
									align: 'right',
									render: (row) => String(row.totalQuestions ?? '—'),
								},
								{
									key: 'timeLimit',
									label: 'Time limit (s)',
									align: 'right',
									render: (row) => String(row.timeLimit ?? '—'),
								},
								{
									key: 'passingScore',
									label: 'Passing score',
									align: 'right',
									render: (row) => String(row.passingScore ?? '—'),
								},
								{
									key: 'actions',
									label: '',
									align: 'right',
									render: (row) =>
										`<button type="button" class="ac-btn ac-btn--sm" data-ac-preset-edit="${escapeHtml(
											row.id,
										)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-rename="${escapeHtml(
											row.id,
										)}">Rename</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-delete="${escapeHtml(
											row.id,
										)}">Delete</button>`,
								},
							],
							rows: quizPresets,
						})
					: '<p class="ac-empty__message">No quiz preset is stored in this browser yet. Create one here, or in the classroom panel.</p>'
			}
			<div class="ac-field-grid" style="margin-top:16px">
				${field({
					id: 'set-training-preset',
					label: 'The preset used for training mode',
					value: trainingPresetId,
					hint: 'The id of the quiz preset a training session starts from. Leave it blank for the default.',
				})}
			</div>
			<div class="ac-toolbar" style="margin-bottom:0">
				<div class="ac-toolbar__row">
					<button type="button" class="ac-btn ac-btn--primary" data-ac-save-training-preset>Save training preset</button>
					<span class="ac-table__muted" data-ac-training-preset-status></span>
				</div>
			</div>`,
		}),
		panel({
			title: 'Game presets',
			subtitle: 'The arena configurations this organization shares.',
			actions:
				'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-game-preset-new>New game preset</button>',
			body: gamePresets.length
				? renderTable({
						columns: [
							{
								key: 'name',
								label: 'Preset',
								render: (row) =>
									`<span class="ac-table__primary">${escapeHtml(row.name || '')}</span><br><span class="ac-table__muted">${escapeHtml(
										row.game_type || '',
									)} · ${escapeHtml(row.game_mode || '')}</span>`,
							},
							{
								key: 'is_default',
								label: 'Default',
								render: (row) =>
									row.is_default
										? '<span class="ac-badge ac-badge--success">yes</span>'
										: '<span class="ac-badge">no</span>',
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-edit="${escapeHtml(
										row.id,
									)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-delete="${escapeHtml(
										row.id,
									)}">Delete</button>`,
							},
						],
						rows: gamePresets,
					})
				: '<p class="ac-empty__message">No game preset yet.</p>',
		}),
	].join('');

	function bind(root) {
		// ── Quiz presets (browser store) ─────────────────────────────────
		const openPresetEditor = (preset) => {
			const isNew = !preset;
			const current = { ...QUIZ_PRESET_DEFAULTS, ...(preset || {}) };
			const modal = openModal({
				title: isNew ? 'Create a quiz preset' : 'Edit the quiz preset',
				subtitle:
					'A preset is stored in this browser and is shared with the classroom panel, so it is offered there too.',
				wide: true,
				body: `<div class="ac-field-grid">
						${QUIZ_PRESET_FIELDS.map((field) => presetControl(current, field)).join('')}
					</div>`,
				footer: `
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${
						isNew ? 'Create the preset' : 'Save the preset'
					}</button>
				`,
			});
			const root2 = modal.root;
			root2.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
			root2.querySelector('[data-ac-confirm]').addEventListener('click', () => {
				const next = { ...current };
				for (const field of QUIZ_PRESET_FIELDS) {
					const el = root2.querySelector(`#preset-${field.key}`);
					if (!el) continue;
					if (field.type === 'checkbox') next[field.key] = el.checked;
					else if (field.type === 'number')
						next[field.key] = el.value === '' ? 0 : Number(el.value);
					else next[field.key] = el.value;
				}
				if (!String(next.name || '').trim()) {
					toast('A preset needs a name.', 'error');
					return;
				}
				const presets = readQuizPresets();
				if (isNew) {
					next.id = `preset-${Date.now()}`;
					next.createdAt = new Date().toISOString();
					presets.push(next);
				} else {
					const index = presets.findIndex((row) => row.id === preset.id);
					if (index !== -1) presets[index] = { ...presets[index], ...next };
				}
				if (!writeQuizPresets(presets)) {
					toast('The browser refused to save the preset.', 'error');
					return;
				}
				modal.close();
				toast(isNew ? 'The preset was created.' : 'The preset was saved.', 'success');
				ctx.rerender();
			});
		};

		root.querySelector('[data-ac-preset-new]')?.addEventListener('click', () => openPresetEditor(null));

		root.querySelectorAll('[data-ac-preset-edit]').forEach((button) => {
			button.addEventListener('click', () => {
				const preset = quizPresets.find((row) => row.id === button.dataset.acPresetEdit);
				if (preset) openPresetEditor(preset);
			});
		});

		root.querySelectorAll('[data-ac-preset-rename]').forEach((button) => {
			button.addEventListener('click', () => {
				const id = button.dataset.acPresetRename;
				const presets = readQuizPresets();
				const preset = presets.find((row) => row.id === id);
				if (!preset) return;
				const modal = openModal({
					title: 'Rename this preset',
					body: `<div class="ac-field">
							<label class="ac-field__label" for="ac-preset-name">Name</label>
							<input class="ac-input ac-input--full" id="ac-preset-name" type="text" value="${escapeHtml(
								preset.name || '',
							)}" />
						</div>`,
					footer: `
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Rename</button>
					`,
				});
				modal.root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
				modal.root.querySelector('[data-ac-confirm]').addEventListener('click', () => {
					const name = modal.root.querySelector('#ac-preset-name').value.trim();
					if (!name) {
						toast('A preset needs a name.', 'error');
						return;
					}
					preset.name = name;
					if (writeQuizPresets(presets)) {
						modal.close();
						toast('Preset renamed.', 'success');
						ctx.rerender();
					} else {
						toast('The browser refused to save the preset.', 'error');
					}
				});
			});
		});

		root.querySelectorAll('[data-ac-preset-delete]').forEach((button) => {
			button.addEventListener('click', async () => {
				const id = button.dataset.acPresetDelete;
				const confirmed = await confirmDialog({
					title: 'Delete this preset?',
					message: 'It is removed from this browser. The classroom panel will not offer it any more.',
					confirmLabel: 'Delete preset',
					danger: true,
				});
				if (!confirmed) return;
				const presets = readQuizPresets().filter((row) => row.id !== id);
				if (writeQuizPresets(presets)) {
					toast('Preset deleted.', 'success');
					ctx.rerender();
				} else {
					toast('The browser refused to save the preset.', 'error');
				}
			});
		});

		root.querySelector('[data-ac-save-training-preset]')?.addEventListener('click', async () => {
			const status = root.querySelector('[data-ac-training-preset-status]');
			try {
				await saveSetting(
					'trainingPresetId',
					root.querySelector('#set-training-preset')?.value ?? '',
				);
				if (status) status.textContent = 'Saved.';
				toast('The training preset was saved.', 'success');
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		// ── Game presets (server) ────────────────────────────────────────
		const openGamePreset = (preset) => {
			const modal = openModal({
				title: preset ? 'Edit the game preset' : 'New game preset',
				body: `<div class="ac-field-grid">
						${field({
							id: 'set-game-name',
							label: 'Name',
							value: preset?.name ?? '',
							full: true,
						})}
						${select({
							id: 'set-game-type',
							label: 'Game type',
							options: GAME_TYPES,
							value: preset?.game_type ?? GAME_TYPES[0]?.value ?? '',
						})}
						${select({
							id: 'set-game-mode',
							label: 'Game mode',
							options: GAME_MODES,
							value: preset?.game_mode ?? GAME_MODES[0]?.value ?? '',
						})}
						${field({
							id: 'set-game-rules',
							label: 'Rules (JSON)',
							value: safeJson(preset?.rules_json),
							full: true,
							hint: 'The rule set of the arena. It is stored as JSON.',
						})}
					</div>
					${checkbox({
						id: 'set-game-default',
						label: 'The default preset',
						hint: 'Used when a game starts without an explicit preset.',
						checked: Boolean(preset?.is_default),
					})}`,
				footer: `
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${
						preset ? 'Save the preset' : 'Create the preset'
					}</button>
				`,
			});
			modal.root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
			modal.root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
				const name = modal.root.querySelector('#set-game-name').value.trim();
				if (!name) {
					toast('A preset needs a name.', 'error');
					return;
				}
				const payload = {
					name,
					game_type: modal.root.querySelector('#set-game-type').value,
					game_mode: modal.root.querySelector('#set-game-mode').value,
					rules: modal.root.querySelector('#set-game-rules').value,
					is_default: modal.root.querySelector('#set-game-default').checked,
				};
				try {
					if (preset) {
						await api.patch(`game-presets/${encodeURIComponent(preset.id)}`, payload);
					} else {
						await api.post('game-presets', payload);
					}
					modal.close();
					toast('The game preset was saved.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		};

		root.querySelector('[data-ac-game-preset-new]')?.addEventListener('click', () => openGamePreset(null));
		root.querySelectorAll('[data-ac-game-preset-edit]').forEach((button) => {
			button.addEventListener('click', () => {
				const preset = gamePresets.find((row) => row.id === button.dataset.acGamePresetEdit);
				if (preset) openGamePreset(preset);
			});
		});
		root.querySelectorAll('[data-ac-game-preset-delete]').forEach((button) => {
			button.addEventListener('click', async () => {
				const confirmed = await confirmDialog({
					title: 'Delete this game preset?',
					message: 'It is removed for the whole organization.',
					confirmLabel: 'Delete preset',
					danger: true,
				});
				if (!confirmed) return;
				try {
					await api.del(`game-presets/${encodeURIComponent(button.dataset.acGamePresetDelete)}`);
					toast('The game preset was deleted.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});
	}

	return { markup, bind };
}

/** Render a JSON blob for editing, tolerating anything. */
function safeJson(value) {
	if (!value) return '';
	if (typeof value === 'object') return JSON.stringify(value, null, 2);
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return String(value);
	}
}

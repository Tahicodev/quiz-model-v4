/**
 * src/frontend/console/pages/settings/general.js
 *
 * General — the organization identity and the application's appearance.
 *
 * Ported from the legacy "General" settings tab, which held the school
 * information. The identity fields are the same records; they are written to
 * the school profile (the same row the login page branding reads), not to a
 * duplicated settings key.
 *
 * The appearance values (the quiz defaults and the theme colours) are the
 * legacy settings keys, still stored under the same names so nothing that
 * already reads them breaks.
 */

import { api } from '../../core/api.js';
import { toast } from '../../components/ui.js';
import { panel, field, select, escapeHtml, loadSettings, saveSetting } from './index.js';

const SCHOOL_TYPES = [
	{ value: 'primaire', label: 'Primaire (Primary)' },
	{ value: 'college', label: 'Collège (Middle School)' },
	{ value: 'lycee', label: 'Lycée (High School)' },
	{ value: 'autre', label: 'Autre (Other)' },
];

/** The appearance keys the legacy settings tab owned. */
const APPEARANCE = [
	{
		key: 'primaryColor',
		label: 'Primary colour',
		type: 'color',
		hint: 'Buttons, links and highlights across the classroom surface.',
	},
	{
		key: 'secondaryColor',
		label: 'Secondary colour',
		type: 'color',
		hint: 'The darker companion of the primary colour.',
	},
	{
		key: 'backgroundColor',
		label: 'Background colour',
		type: 'color',
		hint: 'The page background of the classroom surface.',
	},
	{
		key: 'textColor',
		label: 'Text colour',
		type: 'color',
		hint: 'The default body text colour.',
	},
	{
		key: 'inputFocusColor',
		label: 'Input focus colour',
		type: 'color',
		hint: 'The ring shown around a focused input.',
	},
];

const QUIZ_DEFAULTS = [
	{
		key: 'totalQuestions',
		label: 'Questions per quiz',
		type: 'number',
		hint: 'The default length offered when a teacher creates a quiz.',
	},
	{
		key: 'timeLimit',
		label: 'Time limit (seconds)',
		type: 'number',
		hint: 'The default countdown of a quiz.',
	},
	{
		key: 'penalty',
		label: 'Penalty per wrong answer',
		type: 'number',
		hint: 'Points deducted for a wrong answer.',
	},
];

const WELCOME = [
	{ key: 'welcomeTitle', label: 'Welcome title', hint: 'Shown above the quiz on the student workspace.' },
	{ key: 'welcomeMessage', label: 'Welcome message', hint: 'The line under the welcome title.' },
];

export async function generalSection(ctx) {
	const [profile, settings] = await Promise.all([
		api.get('school/profile/full'),
		loadSettings(),
	]);

	const org = profile || {};
	const value = (key) => {
		const row = settings.get(key);
		return row?.value ?? '';
	};

	const markup = [
		panel({
			title: 'Organization information',
			subtitle:
				'How this organization appears on the sign-in page, in the classroom header and on the generated documents.',
			body: `<div class="ac-field-grid">
					${field({
						id: 'set-school-name',
						label: 'Name',
						value: org.name ?? '',
						full: true,
						hint: 'Shown on the sign-in page and on every generated document.',
					})}
					${select({
						id: 'set-school-type',
						label: 'Type',
						options: SCHOOL_TYPES,
						value: org.school_type ?? '',
					})}
					${field({
						id: 'set-school-year',
						label: 'Academic year',
						value: org.school_year ?? '',
						placeholder: '2025-2026',
						hint: 'Also names the year archive.',
					})}
					${field({ id: 'set-school-city', label: 'City', value: org.city ?? '' })}
					${field({ id: 'set-school-phone', label: 'Phone', value: org.phone ?? '' })}
					${field({ id: 'set-school-email', label: 'Email', value: org.email ?? '' })}
					${field({
						id: 'set-school-address',
						label: 'Address',
						value: org.address ?? '',
						full: true,
					})}
					${field({
						id: 'set-school-logo',
						label: 'Logo URL',
						value: org.logo_url ?? '',
						full: true,
						hint: 'An absolute URL or a /uploads/… path.',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-org>Save organization</button>
						<span class="ac-table__muted" data-ac-org-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Quiz defaults',
			subtitle: 'The starting values a teacher gets when creating a quiz.',
			body: `<div class="ac-field-grid">
					${QUIZ_DEFAULTS.map((setting) =>
						field({
							id: `set-${setting.key}`,
							label: setting.label,
							value: value(setting.key),
							type: setting.type,
							hint: setting.hint,
						}),
					).join('')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-quiz>Save quiz defaults</button>
						<span class="ac-table__muted" data-ac-quiz-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Appearance',
			subtitle: 'The colours the classroom surface paints itself with.',
			body: `<div class="ac-field-grid">
					${APPEARANCE.map((setting) =>
						field({
							id: `set-${setting.key}`,
							label: setting.label,
							value: value(setting.key) || '#2563eb',
							type: 'color',
							hint: setting.hint,
						}),
					).join('')}
				</div>
				<div class="ac-field-grid">
					${WELCOME.map((setting) =>
						field({
							id: `set-${setting.key}`,
							label: setting.label,
							value: value(setting.key),
							hint: setting.hint,
						}),
					).join('')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-appearance>Save appearance</button>
						<span class="ac-table__muted" data-ac-appearance-status></span>
					</div>
				</div>`,
		}),
	].join('');

	function bind(root) {
		const status = (selector) => root.querySelector(selector);

		root.querySelector('[data-ac-save-org]')?.addEventListener('click', async () => {
			const el = status('[data-ac-org-status]');
			const read = (id) => root.querySelector(`#${id}`)?.value ?? '';
			try {
				await api.put('school/profile', {
					name: read('set-school-name'),
					school_type: read('set-school-type'),
					school_year: read('set-school-year'),
					city: read('set-school-city'),
					phone: read('set-school-phone'),
					email: read('set-school-email'),
					address: read('set-school-address'),
					logo_url: read('set-school-logo'),
				});
				if (el) el.textContent = 'Saved.';
				toast('Organization information saved.', 'success');
			} catch (err) {
				if (el) el.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		const saveGroup = async (buttonSelector, statusSelector, keys, message) => {
			root.querySelector(buttonSelector)?.addEventListener('click', async () => {
				const el = status(statusSelector);
				try {
					for (const key of keys) {
						const input = root.querySelector(`#set-${key}`);
						if (!input) continue;
						const raw = input.value;
						const numeric = Number(raw);
						await saveSetting(key, input.type === 'number' && raw !== '' ? numeric : raw);
					}
					if (el) el.textContent = 'Saved.';
					toast(message, 'success');
				} catch (err) {
					if (el) el.textContent = err.message;
					toast(err.message, 'error');
				}
			});
		};

		saveGroup(
			'[data-ac-save-quiz]',
			'[data-ac-quiz-status]',
			QUIZ_DEFAULTS.map((s) => s.key),
			'Quiz defaults saved.',
		);
		saveGroup(
			'[data-ac-save-appearance]',
			'[data-ac-appearance-status]',
			[...APPEARANCE, ...WELCOME].map((s) => s.key),
			'Appearance saved.',
		);
	}

	return { markup, bind };
}

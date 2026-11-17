/**
 * src/frontend/console/pages/settings/teaching.js
 *
 * Teacher access — what a teacher may reach in the classroom surface.
 *
 * Ported from the legacy "Teacher Access" settings tab. The seventeen
 * toggles are the same seventeen, and they are stored in the SAME setting
 * key (`teacherAccess`, revision 4) with the SAME shape, so the classroom
 * surface keeps reading them without a migration.
 *
 * Two tabs are NOT offered, on purpose:
 *
 *   • the activity log is an administrator-only view and has no toggle in
 *     the legacy modal either — it is hard-hidden for teachers
 *   • the notifications tab is scoped server-side, so it is never revocable
 *
 * Both are forced by the classroom surface itself, not by this page.
 */

import { toast } from '../../components/ui.js';
import { panel, switchRow, escapeHtml, loadSettings, saveSetting } from './index.js';

const TEACHER_ACCESS_KEY = 'teacherAccess';
const TEACHER_ACCESS_REV = 4;

/** The eight dashboard tabs a teacher may be given. */
const TABS = [
	{ key: 'overview', label: 'Overview', hint: 'The teacher dashboard.' },
	{ key: 'questions', label: 'Questions', hint: 'The question bank.' },
	{ key: 'subjects', label: 'Subjects', hint: 'The subject and category tree.' },
	{ key: 'exams', label: 'Exams', hint: 'Creating and running exams.' },
	{ key: 'classes', label: 'Classes', hint: 'The classes and their students.' },
	{ key: 'games', label: 'Games', hint: 'The game arena.' },
	{ key: 'kidsGames', label: 'Kids Games', hint: 'The Kids arena.' },
	{ key: 'results', label: 'Results', hint: 'The results of the attempts.' },
];

/** The eight settings tabs a teacher may be given. */
const SETTINGS_TABS = [
	{ key: 'general', label: 'General' },
	{ key: 'profile', label: 'My profile' },
	{ key: 'presets', label: 'Presets' },
	{ key: 'data', label: 'Data' },
	{ key: 'realtime', label: 'Realtime' },
	{ key: 'ai-generation', label: 'AI generation' },
	{ key: 'users', label: 'Users' },
	{ key: 'games', label: 'Game presets' },
];

/** The defaults, mirroring the classroom surface's own defaults. */
function defaults() {
	return {
		rev: TEACHER_ACCESS_REV,
		tabs: {
			overview: true,
			questions: true,
			subjects: true,
			exams: true,
			classes: true,
			games: true,
			kidsGames: true,
			results: true,
			notifications: true,
			activity: false,
		},
		settings: true,
		settingsTabs: {
			general: true,
			profile: true,
			presets: true,
			data: true,
			realtime: true,
			'ai-generation': true,
			users: true,
			games: true,
		},
	};
}

/** Read the stored value, tolerating a missing or malformed row. */
function parseStored(raw) {
	const base = defaults();
	if (!raw) return base;
	let stored = raw;
	if (typeof raw === 'string') {
		try {
			stored = JSON.parse(raw);
		} catch {
			return base;
		}
	}
	if (!stored || typeof stored !== 'object') return base;
	return {
		rev: TEACHER_ACCESS_REV,
		tabs: { ...base.tabs, ...(stored.tabs || {}) },
		settings: stored.settings === undefined ? base.settings : Boolean(stored.settings),
		settingsTabs: { ...base.settingsTabs, ...(stored.settingsTabs || {}) },
	};
}

export async function teachingSection() {
	const settings = await loadSettings();
	const access = parseStored(settings.get(TEACHER_ACCESS_KEY)?.value);

	const markup = [
		panel({
			title: 'Teacher access control',
			subtitle:
				'Choose which dashboard tabs and settings tabs a teacher may reach in the classroom surface.',
			body: `<h4 class="ac-section-panel__title" style="margin:0 0 8px">Dashboard tabs</h4>
				${TABS.map((tab) =>
					switchRow({
						id: `set-teacher-tab-${tab.key}`,
						label: tab.label,
						hint: tab.hint,
						checked: access.tabs[tab.key] !== false,
					}),
				).join('')}
				${switchRow({
					id: 'set-teacher-settings',
					label: 'The settings modal',
					hint: 'Whether a teacher may open the settings dialog at all.',
					checked: access.settings !== false,
				})}
				<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Settings tabs</h4>
				${SETTINGS_TABS.map((tab) =>
					switchRow({
						id: `set-teacher-settings-${tab.key}`,
						label: tab.label,
						checked: access.settingsTabs[tab.key] !== false,
					}),
				).join('')}
				<div class="ac-alert ac-alert--info" style="margin-top:16px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Two tabs are not offered</p>
						<p class="ac-alert__text">The activity log is an administrator-only view and the notifications feed is scoped to the signed-in teacher on the server. Neither can be revoked from here, so neither is shown as a switch.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:16px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-teacher-access>Save teacher access</button>
						<button type="button" class="ac-btn" data-ac-reset-teacher-access>Restore the defaults</button>
						<span class="ac-table__muted" data-ac-teacher-access-status></span>
					</div>
				</div>`,
		}),
	].join('');

	function bind(root) {
		const status = root.querySelector('[data-ac-teacher-access-status]');
		const collect = () => {
			const next = {
				rev: TEACHER_ACCESS_REV,
				tabs: { ...defaults().tabs },
				settings: root.querySelector('#set-teacher-settings')?.getAttribute('aria-checked') === 'true',
				settingsTabs: { ...defaults().settingsTabs },
			};
			for (const tab of TABS) {
				const el = root.querySelector(`#set-teacher-tab-${tab.key}`);
				if (el) next.tabs[tab.key] = el.getAttribute('aria-checked') === 'true';
			}
			for (const tab of SETTINGS_TABS) {
				const el = root.querySelector(`#set-teacher-settings-${tab.key}`);
				if (el) next.settingsTabs[tab.key] = el.getAttribute('aria-checked') === 'true';
			}
			return next;
		};

		// The switches are buttons with a role, so the click handler is bound
		// here rather than in the shared markup helper.
		root.querySelectorAll('.ac-switch').forEach((button) => {
			button.addEventListener('click', () => {
				const next = button.getAttribute('aria-checked') === 'true' ? 'false' : 'true';
				button.setAttribute('aria-checked', next);
			});
		});

		const save = async (value) => {
			try {
				await saveSetting(TEACHER_ACCESS_KEY, JSON.stringify(value));
				if (status) status.textContent = 'Saved.';
				toast('Teacher access saved.', 'success');
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		};

		root.querySelector('[data-ac-save-teacher-access]')?.addEventListener('click', () => {
			save(collect());
		});

		root.querySelector('[data-ac-reset-teacher-access]')?.addEventListener('click', async () => {
			const value = defaults();
			// Put the switches back into the shape the defaults describe.
			for (const tab of TABS) {
				const el = root.querySelector(`#set-teacher-tab-${tab.key}`);
				if (el) el.setAttribute('aria-checked', value.tabs[tab.key] ? 'true' : 'false');
			}
			const settingsToggle = root.querySelector('#set-teacher-settings');
			if (settingsToggle) {
				settingsToggle.setAttribute('aria-checked', value.settings ? 'true' : 'false');
			}
			for (const tab of SETTINGS_TABS) {
				const el = root.querySelector(`#set-teacher-settings-${tab.key}`);
				if (el) el.setAttribute('aria-checked', value.settingsTabs[tab.key] ? 'true' : 'false');
			}
			await save(value);
		});
	}

	return { markup, bind };
}

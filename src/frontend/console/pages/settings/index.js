/**
 * src/frontend/console/pages/settings/index.js
 *
 * Application settings — a PAGE, not a modal.
 *
 * The legacy classroom surface keeps its settings modal for the classroom
 * flow; the control center owns the administrative settings as a real page
 * with a collapsible RIGHT-HAND section menu, so the operator can work
 * through the sections without a dialog covering the screen.
 *
 * Every section reads and writes REAL data through the existing API. There
 * is nothing decorative here: a switch that does not change a setting is a
 * lie, so each one is bound to a real key.
 *
 * The sections below are the complete port of the legacy settings modal.
 * `docs/ADMIN_CONSOLE_ARCHITECTURE.md` carries the accounting table that
 * says, for every legacy control, where it went and why.
 */

import { api } from '../../core/api.js';
import { navigate } from '../../core/router.js';
import { renderSectionMenu, bindSectionMenu, menuWasCollapsed } from '../../components/sectionMenu.js';
import { loadingBlock, errorState } from '../../components/states.js';

import { generalSection } from './general.js';
import { profileSection } from './profile.js';
import { accessSection } from './access.js';
import { teachingSection } from './teaching.js';
import { realtimeSection } from './realtime.js';
import { presetsSection } from './presets.js';
import { documentsSection } from './documents.js';
import { setupSection } from './setup.js';
import { aiSection } from './ai.js';
import { rolesSection } from './roles.js';
import { deploymentSection } from './deployment.js';

export const SECTIONS = [
	{ id: 'general', label: 'General', icon: 'general' },
	{ id: 'profile', label: 'My profile', icon: 'profile' },
	{ id: 'access', label: 'Users & access', icon: 'access' },
	{ id: 'teaching', label: 'Teacher access', icon: 'teaching' },
	{ id: 'realtime', label: 'Realtime', icon: 'realtime' },
	{ id: 'presets', label: 'Presets', icon: 'presets' },
	{ id: 'documents', label: 'Documents & data', icon: 'data' },
	{ id: 'setup', label: 'Setup & diagnostics', icon: 'setup' },
	{ id: 'ai', label: 'Artificial intelligence', icon: 'ai' },
	{ id: 'roles', label: 'Roles & permissions', icon: 'roles' },
	{ id: 'deployment', label: 'Deployment & session', icon: 'deployment' },
];

const RENDERERS = {
	general: generalSection,
	profile: profileSection,
	access: accessSection,
	teaching: teachingSection,
	realtime: realtimeSection,
	presets: presetsSection,
	documents: documentsSection,
	setup: setupSection,
	ai: aiSection,
	roles: rolesSection,
	deployment: deploymentSection,
};

export const settingsPage = {
	id: 'settings',
	path: '/settings',
	title: 'Application Settings',
	description:
		'General configuration, the organization profile, access, data and the deployment — as a page, not a dialog.',
	permission: ['platform.settings.manage', 'school.settings.manage'],
	async render(host, ctx, route) {
		const active = SECTIONS.some((s) => s.id === route.query?.section)
			? route.query.section
			: SECTIONS[0].id;

		host.innerHTML = `<div class="ac-split" data-ac-settings>
			<div class="ac-split__main" data-ac-settings-main>${loadingBlock(5)}</div>
			<div data-ac-settings-menu></div>
		</div>`;

		const split = host.querySelector('.ac-split');
		const menuHost = host.querySelector('[data-ac-settings-menu]');
		const main = host.querySelector('[data-ac-settings-main]');
		let renderToken = 0;

		const collapsed = menuWasCollapsed();
		split.classList.toggle('ac-split--collapsed', collapsed);
		menuHost.innerHTML = renderSectionMenu({ sections: SECTIONS, active, collapsed });

		bindSectionMenu(host, {
			onSelect: (id) => {
				// `replace` keeps the section switch OUT of the navigation
				// trail: the Back button walks between pages, not between
				// the sections of one page.
				navigate(`/settings?section=${encodeURIComponent(id)}`, { replace: true });
			},
		});

		const render = async (sectionId) => {
			// A render token: if the operator picks another section while this
			// one is still loading, the older render must not land on top of
			// the newer one and wipe it.
			const token = ++renderToken;
			main.innerHTML = loadingBlock(4);
			const renderer = RENDERERS[sectionId];
			if (!renderer) {
				main.innerHTML = errorState({
					title: 'Unknown section',
					message: `There is no settings section called "${sectionId}".`,
				});
				return;
			}
			try {
				// The route is handed to the section so a section can read
				// its own query (the setup wizard uses `?step=`).
				const { markup, bind } = await renderer(ctx, route);
				if (token !== renderToken) return;
				main.innerHTML = markup;
				if (typeof bind === 'function') bind(main, ctx);
			} catch (err) {
				if (token !== renderToken) return;
				main.innerHTML = errorState({
					title: 'This section could not be loaded',
					message: err.message,
				});
			}
		};

		await render(active);
	},
};

/**
 * The shared helpers every section uses.
 *
 * The form primitives live in `components/form.js` so that the settings
 * page, the account dialogs and the preset editors all render the same
 * control in the same way.
 */
export {
	panel,
	field,
	textarea,
	select,
	switchRow,
	checkbox,
	escapeHtml,
} from '../../components/form.js';

import { panel, field, textarea, select, switchRow, escapeHtml } from '../../components/form.js';

/**
 * Load the admin-tier settings and index them by key.
 *
 * @returns {Promise<Map<string, {key:string, value:any, visibility:string}>>}
 */
export async function loadSettings() {
	const rows = await api.get('settings/admin');
	const map = new Map();
	for (const row of Array.isArray(rows) ? rows : []) map.set(row.key, row);
	return map;
}

/**
 * Write one setting.
 *
 * The server re-checks the visibility tier against the caller's role, so a
 * teacher can never write an administrator-only key.
 *
 * Two details the endpoint insists on:
 *
 *   • the body carries the key as well as the URL — the update schema
 *     validates `key`, `value` and an optional `visibility`
 *   • the value is a STRING. The column is a string, so an object is
 *     stored as its JSON. The legacy panel did exactly this, so the two
 *     write the same thing.
 */
export async function saveSetting(key, value) {
	const stored = typeof value === 'string' ? value : JSON.stringify(value);
	await api.patch(`settings/${encodeURIComponent(key)}`, { key, value: stored });
}

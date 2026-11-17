/**
 * src/frontend/console/components/sectionMenu.js
 *
 * The collapsible section menu used by the settings page.
 *
 * It is a RIGHT-HAND rail: collapsed it shows the section icons only, expanded
 * it shows the section names. The content column never reflows when the menu
 * toggles — the grid column simply changes width, so the operator's scroll
 * position and reading context are preserved.
 *
 * The menu is a navigation aid, not a router: selecting a section switches
 * the panel below it. The section is addressable through the hash
 * (`#/settings/users`) so a specific section can be linked to.
 */

import { esc } from '../viz/charts.js';

const ICONS = {
	general:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
	organization:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',
	profile:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
	realtime:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
	presets:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.2L21 10l-5.4 4 1.6 6.6L12 17l-5.2 3.6L8.4 14 3 10l6.6-1.8z"/></svg>',
	access:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
	teaching:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
	data:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',
	setup:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
	ai:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',
	roles:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
	deployment:
		'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
};

export const SECTION_ICONS = ICONS;

/**
 * Render the section menu.
 *
 * @param {{ sections:Array<{id:string,label:string,icon?:string,badge?:number|string}>,
 *           active:string, collapsed?:boolean }} options
 * @returns {string} markup
 */
export function renderSectionMenu({ sections, active, collapsed = false }) {
	const items = sections
		.map((section) => {
			const icon = ICONS[section.icon] || ICONS.general;
			const badge =
				section.badge == null
					? ''
					: `<span class="ac-section-menu__badge">${esc(String(section.badge))}</span>`;
			return `<button type="button" class="ac-section-menu__item${
				section.id === active ? ' is-active' : ''
			}" data-ac-section="${esc(section.id)}" title="${esc(section.label)}" aria-current="${
				section.id === active ? 'true' : 'false'
			}">
				<span class="ac-section-menu__icon">${icon}</span>
				<span class="ac-section-menu__label">${esc(section.label)}</span>
				${badge}
			</button>`;
		})
		.join('');

	return `<nav class="ac-section-menu${collapsed ? ' ac-section-menu--collapsed' : ''}" aria-label="Settings sections">
		<div class="ac-section-menu__head">
			<span>Sections</span>
			<button type="button" class="ac-section-menu__toggle" data-ac-menu-toggle aria-label="${
				collapsed ? 'Expand the section menu' : 'Collapse the section menu'
			}" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '»' : '«'}</button>
		</div>
		<div class="ac-section-menu__list">${items}</div>
	</nav>`;
}

/**
 * Bind the section menu: selecting a section, and collapsing / expanding.
 *
 * @param {HTMLElement} root
 * @param {{ onSelect:(id:string)=>void }} handlers
 */
export function bindSectionMenu(root, { onSelect }) {
	root.querySelectorAll('[data-ac-section]').forEach((button) => {
		button.addEventListener('click', () => onSelect(button.dataset.acSection));
	});

	const toggle = root.querySelector('[data-ac-menu-toggle]');
	if (toggle) {
		toggle.addEventListener('click', () => {
			const menu = root.querySelector('.ac-section-menu');
			const split = root.querySelector('.ac-split');
			if (!menu || !split) return;
			const collapsed = !menu.classList.contains('ac-section-menu--collapsed');
			menu.classList.toggle('ac-section-menu--collapsed', collapsed);
			split.classList.toggle('ac-split--collapsed', collapsed);
			toggle.textContent = collapsed ? '»' : '«';
			toggle.setAttribute(
				'aria-label',
				collapsed ? 'Expand the section menu' : 'Collapse the section menu',
			);
			try {
				localStorage.setItem('quizConsoleSettingsMenuCollapsed', collapsed ? '1' : '0');
			} catch {
				/* storage is optional */
			}
		});
	}
}

/** Was the section menu collapsed last time? */
export function menuWasCollapsed() {
	try {
		return localStorage.getItem('quizConsoleSettingsMenuCollapsed') === '1';
	} catch {
		return false;
	}
}

/**
 * src/frontend/console/core/shell.js
 *
 * The console shell: responsive sidebar, sticky header, content region.
 *
 * The shell owns the CHROME (navigation, scope badge, user card, theme
 * toggle). Pages own their CONTENT. A page never renders the sidebar.
 */

import { esc } from '../viz/charts.js';

const ICONS = {
	overview:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
	organizations:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',
	users:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
	analytics:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
	audit:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
	health:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
	settings:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
	search:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
	menu:
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
	sun:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
	moon:
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
	external:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
	logo:
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
};

export const ICON_SET = ICONS;

const THEME_KEY = 'quizConsoleTheme';

function initials(name) {
	const text = String(name || '?').trim();
	const parts = text.split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Apply the stored (or preferred) theme. */
export function applyTheme(theme) {
	const root = document.documentElement;
	const resolved =
		theme ||
		localStorage.getItem(THEME_KEY) ||
		(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
	root.setAttribute('data-console-theme', resolved);
	localStorage.setItem(THEME_KEY, resolved);
	return resolved;
}

export function toggleTheme() {
	const next =
		document.documentElement.getAttribute('data-console-theme') === 'dark' ? 'light' : 'dark';
	applyTheme(next);
	return next;
}

/**
 * Build the shell DOM.
 *
 * @param {HTMLElement} root
 * @param {{ session:object, navItems:Array<{id,path,title,icon,permission}>,
 *           canAny:(permissions:string[])=>boolean, onNavigate:(path:string)=>void }} options
 */
export function renderShell(root, { session, navItems, canAny, onNavigate }) {
	const user = session.user;
	const isPlatform = Boolean(session.scope?.isPlatform);
	const organization = session.scope?.organization;

	const visibleNav = navItems.filter((item) => {
		if (!item.permission) return true;
		const required = Array.isArray(item.permission) ? item.permission : [item.permission];
		return canAny(required);
	});

	const scopeLabel = isPlatform
		? 'Platform scope'
		: organization?.name
			? organization.name
			: 'Organization scope';

	root.innerHTML = `
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${ICONS.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${esc(
						isPlatform ? 'All organizations' : organization?.name || 'Organization',
					)}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${visibleNav
					.map(
						(item) => `
					<button type="button" class="ac-nav__item" data-ac-nav="${esc(item.id)}" data-ac-path="${esc(
							item.path,
						)}">
						${ICONS[item.icon] || ICONS.overview}
						<span class="ac-nav__label">${esc(item.title)}</span>
					</button>`,
					)
					.join('')}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${esc(initials(user.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${esc(user.name || user.username)}</p>
						<p class="ac-user__role">${esc(user.roleLabel || user.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${ICONS.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${isPlatform ? ' ac-scope--platform' : ''}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${esc(scopeLabel)}
					</span>
					<div class="ac-search">
						${ICONS.search}
						<input type="search" id="ac-global-search" placeholder="Search…" aria-label="Search the console" autocomplete="off" />
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${ICONS.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${ICONS.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`;

	root.hidden = false;

	const sidebar = root.querySelector('#ac-sidebar');
	root.querySelector('[data-ac-menu]')?.addEventListener('click', () => {
		sidebar.classList.toggle('is-open');
	});
	root.querySelector('[data-ac-theme]')?.addEventListener('click', (event) => {
		const next = toggleTheme();
		event.currentTarget.innerHTML = next === 'dark' ? ICONS.moon : ICONS.sun;
	});
	root.querySelectorAll('[data-ac-nav]').forEach((button) => {
		button.addEventListener('click', () => {
			sidebar.classList.remove('is-open');
			onNavigate(button.dataset.acPath);
		});
	});

	return {
		content: root.querySelector('#ac-content'),
		title: root.querySelector('#ac-page-title'),
		description: root.querySelector('#ac-page-description'),
		setActive(path) {
			root.querySelectorAll('[data-ac-nav]').forEach((button) => {
				button.classList.toggle(
					'is-active',
					button.dataset.acPath === path ||
						(path !== '/' && button.dataset.acPath !== '/' && path.startsWith(button.dataset.acPath)),
				);
			});
		},
	};
}

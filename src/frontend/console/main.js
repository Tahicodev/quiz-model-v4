/**
 * src/frontend/console/main.js
 *
 * Admin control center entry point.
 *
 * Boot sequence:
 *   1. Apply the stored theme (before first paint to avoid a flash).
 *   2. Resolve the session from the server — the server decides the scope and
 *      the permission set; the frontend never guesses.
 *   3. Render the shell and the permission-filtered navigation.
 *   4. Start the hash router.
 */

import './styles/console.css';

import { loadSession, canAny, getState, setPeriod, reset } from './core/store.js';
import { setUnauthorizedHandler } from './core/api.js';
import { defineRoutes, start, setNavigationHandler, setContext, navigate, canGoBack, goBack, backTarget } from './core/router.js';
import { renderShell, applyTheme } from './core/shell.js';
import { buildPlaceIndex, runSearch } from './core/search.js';

import { overviewPage } from './pages/overview.js';
import { organizationsPage } from './pages/organizations.js';
import { usersHubPage } from './pages/users/index.js';
import { teachersPage } from './pages/users/teachers.js';
import { studentsPage } from './pages/users/students.js';
import { administratorsPage } from './pages/users/administrators.js';
import { analyticsPage } from './pages/analytics.js';
import { teachingPage } from './pages/teaching.js';
import { auditPage } from './pages/audit.js';
import { healthPage } from './pages/health.js';
import { settingsPage, SECTIONS } from './pages/settings/index.js';
import { organizationDetailPage } from './pages/details/organization.js';
import { userDetailPage } from './pages/details/user.js';

const NAV = [
	{ id: 'overview', path: '/', title: 'Overview', icon: 'overview', permission: ['platform.console', 'school.console'] },
	// Analytics: the teaching view first (what is happening in classrooms),
	// then the platform adoption view (how the product is being used).
	{ id: 'teaching', path: '/teaching', title: 'Teaching & Learning', icon: 'analytics', group: 'Analytics', permission: ['platform.analytics.read', 'school.analytics.read'] },
	{ id: 'analytics', path: '/analytics', title: 'Platform Analytics', icon: 'analytics', group: 'Analytics', permission: ['platform.analytics.read', 'school.analytics.read'] },
	// Manage: everything that changes the installation rather than reports on it.
	{ id: 'organizations', path: '/organizations', title: 'Organizations', icon: 'organizations', group: 'Manage', permission: ['platform.organizations.read', 'school.profile.read'] },
	{ id: 'users', path: '/users', title: 'Users & Access', icon: 'users', group: 'Manage', permission: ['platform.users.read', 'school.users.read'] },
	{ id: 'audit', path: '/audit', title: 'Activity & Audit', icon: 'audit', group: 'Manage', permission: ['platform.audit.read', 'school.audit.read'] },
	{ id: 'health', path: '/health', title: 'System Health', icon: 'health', group: 'Manage', permission: ['platform.health.read', 'school.health.read'] },
	{ id: 'settings', path: '/settings', title: 'Settings', icon: 'settings', group: 'Manage', permission: ['platform.settings.manage', 'school.settings.manage'] },
];

const PAGES = [
	overviewPage,
	// The overview answers to '#/' and to '#/overview', so the label in the
	// navigation is a real address and not a dead end.
	{ ...overviewPage, id: 'overview-alias', path: '/overview' },
	organizationsPage,
	organizationDetailPage,
	usersHubPage,
	teachersPage,
	studentsPage,
	administratorsPage,
	userDetailPage,
	analyticsPage,
	teachingPage,
	auditPage,
	healthPage,
	settingsPage,
];

const bootRoot = document.getElementById('ac-boot');
const root = document.getElementById('ac-root');

/** Where an administrator goes when the console cannot resolve a session. */
const SIGN_IN_PATH = '/admin.html';

/* ── Boot failure surface ───────────────────────────────────────────────── */

const ICON_PATHS = {
	cap: ['M22 10v6M2 10l10-5 10 5-10 5-10-5z', 'M6 12v5c3 3 9 3 12 0v-5'],
	lock: ['M7 10V7a5 5 0 0 1 10 0v3', 'M5 10h14v11H5z', 'M12 15v2'],
	warning: [
		'M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
		'M12 9v4',
		'M12 17h.01',
	],
};

function node(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text != null) el.textContent = text;
	return el;
}

/** Stroke icon in the same visual language as the shell (no icon font). */
function icon(paths, size = 22) {
	const svgNS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNS, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('width', String(size));
	svg.setAttribute('height', String(size));
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '1.8');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	for (const d of paths) {
		const path = document.createElementNS(svgNS, 'path');
		path.setAttribute('d', d);
		svg.appendChild(path);
	}
	return svg;
}

/**
 * Turn the boot screen into a failure card.
 *
 * The card answers three questions in order: what is this page, what went
 * wrong, and what do I do now. It is built from DOM nodes rather than an HTML
 * string because `message` comes from the API layer (server copy, error
 * codes) and must never be parsed as markup.
 */
function renderBootFailure({
	message,
	hint = '',
	code = '',
	meta = '',
	tone = 'danger',
	actions = [],
}) {
	if (!bootRoot) return;

	document.title = 'Could not open · Control Center';
	bootRoot.classList.add('ac-boot--error');
	bootRoot.replaceChildren();

	const card = node('div', 'ac-boot__card');
	card.setAttribute('role', 'alert');

	const brand = node('div', 'ac-boot__brand');
	const brandMark = node('span', 'ac-boot__brand-mark');
	brandMark.appendChild(icon(ICON_PATHS.cap, 13));
	brand.append(brandMark, node('span', 'ac-boot__brand-text', 'Platform Control Center'));

	const badge = node('div', `ac-boot__icon ac-boot__icon--${tone}`);
	badge.setAttribute('aria-hidden', 'true');
	badge.appendChild(icon(tone === 'warning' ? ICON_PATHS.warning : ICON_PATHS.lock));

	const heading = node('h1', 'ac-boot__title', 'Could not open the control center');
	const body = node('p', 'ac-boot__message', message);

	card.append(brand, badge, heading, body);

	if (hint) card.appendChild(node('p', 'ac-boot__hint', hint));

	if (actions.length) {
		const list = node('div', 'ac-boot__actions');
		for (const action of actions) {
			if (action.href) {
				const link = node('a', `ac-btn ${action.variant || ''}`.trim(), action.label);
				link.href = action.href;
				list.appendChild(link);
			} else {
				const button = node('button', `ac-btn ${action.variant || ''}`.trim(), action.label);
				button.type = 'button';
				button.addEventListener('click', action.onClick);
				list.appendChild(button);
			}
		}
		card.appendChild(list);
	}

	if (code || meta) {
		const footer = node('p', 'ac-boot__meta');
		if (code) footer.appendChild(node('span', 'ac-boot__code', code));
		if (meta) footer.appendChild(document.createTextNode(meta));
		card.appendChild(footer);
	}

	bootRoot.appendChild(card);
}

const retry = () => window.location.reload();

function showSessionEnded() {
	renderBootFailure({
		message: 'Your session has ended. Please sign in again.',
		meta: 'Signing in again reopens this console.',
		actions: [
			{ label: 'Go to the sign-in page', href: SIGN_IN_PATH, variant: 'ac-btn--primary' },
			{ label: 'Try again', onClick: retry, variant: 'ac-btn--ghost' },
		],
	});
}

let currentRoute = null;
/** Called with every page container after it renders (the in-page Back button). */
let afterRender = null;

async function boot() {
	applyTheme();

	setUnauthorizedHandler(() => {
		// The session is gone. `boot()` renders the sign-in guidance; this
		// handler only clears the local state so nothing stale is shown.
		reset();
	});

	let session;
	try {
		session = await loadSession();
	} catch (err) {
		const expired = err?.status === 401 || err?.code === 'UNAUTHORIZED';
		if (expired) {
			showSessionEnded();
		} else {
			renderBootFailure({
				message: err?.message || 'The console could not reach the server.',
				hint: 'Check that the server is running, then try again.',
				code: err?.code || '',
				tone: 'warning',
				actions: [
					{ label: 'Try again', onClick: retry, variant: 'ac-btn--primary' },
					{ label: 'Go to the sign-in page', href: SIGN_IN_PATH },
				],
			});
		}
		return;
	}

	if (!session?.user) {
		showSessionEnded();
		return;
	}

	const shell = renderShell(root, {
		session,
		navItems: NAV,
		canAny,
		onNavigate: (path) => navigate(path),
	});

	const context = {
		canAny,
		session,
		organization: session.scope?.organization || null,
		isPlatform: Boolean(session.scope?.isPlatform),
		/** Deployment topology (offline | saas). A topology, never a privilege. */
		deployment: session.deployment || {},
		isOffline: Boolean(session.deployment?.isOffline),
		getState,
		/**
		 * Changing the reporting period re-renders the page that owns the
		 * selector. The store itself has no page knowledge, so the wiring lives
		 * here: a chip click updates the shared value and asks for a fresh
		 * render, keeping every panel on the same window.
		 */
		setPeriod: (period, customRange) => {
			setPeriod(period, customRange);
			renderPage(shell, context, currentRoute);
		},
		rerender: () => renderPage(shell, context, currentRoute),
		/** Detail pages can refine the header once their record is loaded. */
		setTitle: (title, description) => {
			if (title) shell.title.textContent = title;
			if (description !== undefined) shell.description.textContent = description;
			document.title = `${title || shell.title.textContent} · Control Center`;
		},
	};

	setContext(context);

	defineRoutes(PAGES, {
		notFound: {
			id: 'not-found',
			path: '/not-found',
			title: 'Page not found',
			description: 'That section does not exist in the control center.',
			render(host) {
				host.innerHTML = `<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`;
			},
		},
	});

	setNavigationHandler((route) => {
		currentRoute = route;
		shell.title.textContent = route.title;
		shell.description.textContent = route.description || '';
		shell.setActive(route.path);
		document.title = `${route.title} · Control Center`;
		renderPage(shell, context, route);
	});

	/**
	 * The Back button — INSIDE the page, not in the console header.
	 *
	 * After a page renders, the button joins the page's own toolbar, next
	 * to the Refresh button it sits beside. It is offered whenever there is
	 * somewhere to go back to: the page the operator actually came from, or
	 * — when the console was opened directly on a deep link — the parent
	 * page (a roster → the hub, a detail → its list). A page without a
	 * toolbar gets no button at all, so nothing appears floating — and a
	 * page that already offers its own way back ("← All accounts" on an
	 * account detail, "← All organizations" on an organization detail)
	 * gets no second one.
	 */
	const BACK_ICON =
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>';

	function injectBackButton(container) {
		const target = backTarget();
		if (!target) return;
		// The page's own back link wins: one way back is enough.
		const ownBack = Array.from(container.querySelectorAll('a, button')).find((el) =>
			/^←\s/.test(el.textContent.trim()),
		);
		if (ownBack) return;
		const push = container.querySelector('.ac-toolbar__push');
		if (!push || push.querySelector('.ac-back-btn')) return;
		const button = document.createElement('button');
		button.type = 'button';
		// Not --ghost: it must look exactly like the Refresh button it
		// stands beside — same size, same chrome.
		button.className = 'ac-btn ac-back-btn';
		button.innerHTML = `${BACK_ICON}<span class="ac-back-btn__label">Back</span>`;
		const label = routeTitleFor(target);
		if (label) button.title = `Back to ${label}`;
		button.setAttribute('aria-label', label ? `Back to ${label}` : 'Back to the previous page');
		button.addEventListener('click', () => goBack());
		push.prepend(button);
	}

	/** The title of a hash target, so the Back button can name its destination. */
	function routeTitleFor(hash) {
		const path = String(hash || '').replace(/^#/, '').split('?')[0];
		const route = PAGES.find((page) => page.path === path);
		if (route) return route.title;
		if (path.startsWith('/users/')) return 'Users & Access';
		if (path.startsWith('/organizations/')) return 'Organizations';
		return null;
	}

	afterRender = injectBackButton;

	/**
	 * The global search.
	 *
	 * The header input used to be decoration: rendered, never wired. It now
	 * opens one panel that searches the places of the console (pages,
	 * settings sections — local, instant) and the records the session may
	 * read (accounts and organizations — live from the API, server-scoped).
	 */
	function wireGlobalSearch() {
		const input = document.getElementById('ac-global-search');
		const panel = document.getElementById('ac-search-panel');
		const clear = document.getElementById('ac-search-clear');
		if (!input || !panel) return;

		const places = buildPlaceIndex(PAGES, SECTIONS);
		let items = [];
		let active = -1;
		let debounce = null;

		/** The clear "×" exists only while there is something to clear. */
		const syncClear = () => {
			if (clear) clear.hidden = input.value.length === 0;
		};

		const close = () => {
			panel.hidden = true;
			panel.innerHTML = '';
			items = [];
			active = -1;
			syncClear();
		};

		const go = (path) => {
			close();
			input.value = '';
			input.blur();
			syncClear();
			navigate(path);
		};

		const render = (results) => {
			items = results;
			panel.innerHTML = results.length
				? groupResults(results)
				: `<p class="ac-search__empty">Nothing matches “${escapeSearchHtml(input.value.trim())}”.</p>`;
			panel.hidden = false;
			active = -1;
		};

		const refresh = async () => {
			const value = input.value.trim();
			if (value.length < 2) {
				close();
				return;
			}
			const results = await runSearch(value, {
				places,
				canUsers: context.canAny(['platform.users.read', 'school.users.read']),
				canOrganizations: context.canAny(['platform.organizations.read', 'school.profile.read']),
			});
			// The operator may have typed on while the request ran.
			if (input.value.trim() !== value) return;
			render(results);
		};

		input.addEventListener('input', () => {
			syncClear();
			clearTimeout(debounce);
			debounce = setTimeout(refresh, 180);
		});
		// One click empties the box and closes the panel — the "×" the
		// operator expects in a search field, in the app's own style.
		clear?.addEventListener('click', () => {
			input.value = '';
			syncClear();
			close();
			input.focus();
		});
		input.addEventListener('focus', () => {
			syncClear();
			if (input.value.trim().length >= 2) refresh();
		});
		input.addEventListener('keydown', (event) => {
			if (panel.hidden) {
				if (event.key === 'Enter' && input.value.trim().length >= 2) refresh();
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveActive(1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveActive(-1);
			} else if (event.key === 'Enter') {
				event.preventDefault();
				const target = items[active] || items[0];
				if (target) go(target.path);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				close();
				input.blur();
			}
		});
		// A click anywhere else closes the panel; a click ON a result goes there.
		panel.addEventListener('mousedown', (event) => {
			const button = event.target.closest('[data-ac-search-path]');
			if (button) {
				event.preventDefault();
				go(button.dataset.acSearchPath);
			} else {
				event.preventDefault(); // keep the input's focus
			}
		});
		document.addEventListener('mousedown', (event) => {
			if (!panel.hidden && !event.target.closest('.ac-search')) close();
		});

		function moveActive(delta) {
			if (!items.length) return;
			active = (active + delta + items.length) % items.length;
			panel.querySelectorAll('.ac-search__item').forEach((el, index) => {
				el.classList.toggle('is-active', index === active);
			});
		}
	}

	/** Group the results: the places first, then the accounts, then the organizations. */
	function groupResults(results) {
		const groups = [];
		for (const item of results) {
			const label =
				item.kind === 'settings' ? 'Settings' : item.kind === 'user' ? 'Accounts' : item.kind === 'organization' ? 'Organizations' : 'Go to';
			let group = groups.find((g) => g.label === label);
			if (!group) {
				group = { label, items: [] };
				groups.push(group);
			}
			group.items.push(item);
		}
		return groups
			.map(
				(group) =>
					`<p class="ac-search__group">${group.label}</p>${group.items
						.map(
							(item) =>
								`<button type="button" class="ac-search__item" data-ac-search-path="${escapeSearchHtml(item.path)}">
									<span class="ac-search__item-title">${escapeSearchHtml(item.title)}</span>
									${item.sub ? `<span class="ac-search__item-sub">${escapeSearchHtml(item.sub)}</span>` : ''}
									<span class="ac-search__badge${item.kind === 'user' ? ' ac-search__badge--user' : ''}">${escapeSearchHtml(item.badge || '')}</span>
								</button>`,
						)
						.join('')}`,
			)
			.join('');
	}

	function escapeSearchHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	wireGlobalSearch();

	start();

	// The boot screen is replaced by the shell.
	bootRoot.remove();
}

/**
 * Render one page into the content region.
 *
 * Each render gets its OWN container element. Without that, two renders
 * share one host: a slow page (one that awaits an API call) that finishes
 * AFTER the operator has already moved on writes its result over the page
 * that is currently on screen — which shows up as a blank page or a
 * "could not be rendered" error on quick navigation.
 */
let renderToken = 0;

async function renderPage(shell, context, route) {
	const token = ++renderToken;
	const container = document.createElement('div');
	container.className = 'ac-page';
	shell.content.replaceChildren(container);
	container.innerHTML = `<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;
	try {
		await route.render(container, context, route);
		// A newer render took over while this one was loading: this result
		// belongs to a page the operator has already left.
		if (token !== renderToken) return;
		// The in-page Back button joins the page's own toolbar, next to
		// Refresh — offered only when there is somewhere to go back to.
		if (afterRender) afterRender(container);
	} catch (err) {
		if (token !== renderToken) return;
		console.error('[console] page render failed', err);
		container.innerHTML = `<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${err.message}</p>
			</div>
		</div>`;
	}
}

boot();

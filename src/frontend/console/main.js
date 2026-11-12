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
import { defineRoutes, start, setNavigationHandler, setContext, navigate } from './core/router.js';
import { renderShell, applyTheme } from './core/shell.js';

import { overviewPage } from './pages/overview.js';
import { organizationsPage } from './pages/organizations.js';
import { usersPage } from './pages/users.js';
import { analyticsPage } from './pages/analytics.js';
import { auditPage } from './pages/audit.js';
import { healthPage } from './pages/health.js';
import { settingsPage } from './pages/settings.js';
import { organizationDetailPage } from './pages/details/organization.js';
import { userDetailPage } from './pages/details/user.js';

const NAV = [
	{ id: 'overview', path: '/', title: 'Overview', icon: 'overview', permission: ['platform.console', 'school.console'] },
	{ id: 'organizations', path: '/organizations', title: 'Organizations', icon: 'organizations', permission: ['platform.organizations.read', 'school.profile.read'] },
	{ id: 'users', path: '/users', title: 'Users & Access', icon: 'users', permission: ['platform.users.read', 'school.users.read'] },
	{ id: 'analytics', path: '/analytics', title: 'Platform Analytics', icon: 'analytics', permission: ['platform.analytics.read', 'school.analytics.read'] },
	{ id: 'audit', path: '/audit', title: 'Activity & Audit', icon: 'audit', permission: ['platform.audit.read', 'school.audit.read'] },
	{ id: 'health', path: '/health', title: 'System Health', icon: 'health', permission: ['platform.health.read', 'school.health.read'] },
	{ id: 'settings', path: '/settings', title: 'Settings', icon: 'settings', permission: ['platform.settings.manage', 'school.settings.manage'] },
];

const PAGES = [
	overviewPage,
	organizationsPage,
	organizationDetailPage,
	usersPage,
	userDetailPage,
	analyticsPage,
	auditPage,
	healthPage,
	settingsPage,
];

const bootStatus = document.getElementById('ac-boot-status');
const bootRoot = document.getElementById('ac-boot');
const root = document.getElementById('ac-root');

function bootError(message, hint = '') {
	if (!bootStatus) return;
	bootStatus.textContent = message;
	bootStatus.style.color = 'var(--ac-danger)';
	const host = bootStatus.parentElement;
	if (hint) {
		const extra = document.createElement('p');
		extra.className = 'ac-boot__status';
		extra.style.marginTop = '10px';
		extra.innerHTML = hint;
		host.appendChild(extra);
	}
}

let currentRoute = null;

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
		bootError(
			'Could not open the control center.',
			`${err.message}<br><br><a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>`,
		);
		return;
	}

	if (!session?.user) {
		bootError(
			'Could not open the control center.',
			'<a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>',
		);
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
		getState,
		setPeriod,
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

	start();

	// The boot screen is replaced by the shell.
	bootRoot.remove();
}

async function renderPage(shell, context, route) {
	const host = shell.content;
	host.innerHTML = `<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;
	try {
		await route.render(host, context, route);
	} catch (err) {
		console.error('[console] page render failed', err);
		host.innerHTML = `<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${err.message}</p>
			</div>
		</div>`;
	}
}

boot();

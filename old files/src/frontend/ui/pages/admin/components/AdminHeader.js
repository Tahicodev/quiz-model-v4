/**
 * src/frontend/ui/pages/admin/components/AdminHeader.js
 * Top header for the admin dashboard: app title, current user info, logout button.
 */

import { getContainer } from '../../../../container.js';
import { withError } from '../../../../utils/eventBus.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { escapeHTML } from '../../../../utils/sanitize.js';

/**
 * Render the header into the given container.
 * @param {HTMLElement} container
 * @param {string} [title] - optional page title shown next to the app name
 * @returns {{ setTitle: (title: string) => void }}
 */
export function renderHeader(container, title = 'Dashboard') {
	if (!container) return { setTitle() {} };

	const { authSvc } = getContainer();
	const user = authSvc.getCurrentUser();

	const header = document.createElement('header');
	header.className = 'admin-header';

	// Left: app name + current page title
	const brand = document.createElement('div');
	brand.className = 'admin-header__brand';

	const appName = document.createElement('span');
	appName.className = 'admin-header__app-name';
	appName.textContent = 'Quiz Admin';

	const titleEl = document.createElement('span');
	titleEl.className = 'admin-header__title';
	titleEl.textContent = title;

	brand.append(appName, titleEl);

	// Center: legacy-style global search bar
	const searchWrap = document.createElement('div');
	searchWrap.className = 'admin-header__search-wrap';

	const searchInput = document.createElement('input');
	searchInput.id = 'globalSearchInput';
	searchInput.type = 'text';
	searchInput.className = 'admin-header__search';
	searchInput.placeholder = 'Search anything... (Cmd+K)';
	searchInput.setAttribute('aria-label', 'Global search');
	searchInput.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchInput.focus();
		}
		if (e.key === 'Escape') {
			searchInput.value = '';
		}
	});
	searchWrap.appendChild(searchInput);

	// Right: user chip + profile menu + logout
	const actions = document.createElement('div');
	actions.className = 'admin-header__actions';

	const userChip = document.createElement('button');
	userChip.type = 'button';
	userChip.className = 'admin-header__user-btn';
	userChip.setAttribute('aria-haspopup', 'menu');
	userChip.setAttribute('aria-expanded', 'false');
	userChip.innerHTML = `
    <span class="admin-header__avatar">${(user?.name || user?.username || 'A').charAt(0).toUpperCase()}</span>
    <span class="admin-header__user-name">${user?.name ? `${user.name} (${user.role})` : (user?.username ?? 'Admin')}</span>
  `;

	const profileMenu = document.createElement('div');
	profileMenu.id = 'profileMenu';
	profileMenu.className = 'admin-header__profile-menu';
	profileMenu.innerHTML = `
    <div class="admin-header__profile-mail">${escapeHTML(user?.email || user?.username || 'admin@example.com')}</div>
    <button type="button" class="admin-header__menu-item" data-action="settings">Settings</button>
    <button type="button" class="admin-header__menu-item admin-header__menu-item--danger" data-action="logout">Logout</button>
  `;

	profileMenu
		.querySelector('[data-action="settings"]')
		.addEventListener('click', () => {
			window.openSettingsModal?.();
			profileMenu.classList.remove('is-open');
			userChip.setAttribute('aria-expanded', 'false');
		});

	profileMenu
		.querySelector('[data-action="logout"]')
		.addEventListener('click', () => {
			withError(async () => {
				await authSvc.logout();
				logger.info('Admin logged out');
				Router.navigate('/');
			});
		});

	userChip.addEventListener('click', () => {
		const willOpen = !profileMenu.classList.contains('is-open');
		profileMenu.classList.toggle('is-open', willOpen);
		userChip.setAttribute('aria-expanded', String(willOpen));
	});

	const logoutBtn = document.createElement('button');
	logoutBtn.type = 'button';
	logoutBtn.className = 'btn btn-secondary admin-header__logout';
	logoutBtn.textContent = 'Logout';
	logoutBtn.addEventListener('click', () => {
		withError(async () => {
			await authSvc.logout();
			logger.info('Admin logged out');
			Router.navigate('/');
		});
	});

	actions.append(userChip, profileMenu, logoutBtn);
	header.append(brand, searchWrap, actions);
	container.replaceChildren(header);

	window.toggleProfileMenu = () => {
		const nextState = !profileMenu.classList.contains('is-open');
		profileMenu.classList.toggle('is-open', nextState);
		userChip.setAttribute('aria-expanded', String(nextState));
	};

	window.openSettingsModal = () => {
		const hash = location.hash.replace('#', '');
		if (hash !== 'settings') {
			history.replaceState(null, '', '#settings');
		}
		window.dispatchEvent(new HashChangeEvent('hashchange'));
	};

	return {
		setTitle(newTitle) {
			titleEl.textContent = newTitle;
		},
	};
}

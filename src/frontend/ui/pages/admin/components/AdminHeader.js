/**
 * src/frontend/ui/pages/admin/components/AdminHeader.js
 * Top header for the admin dashboard: app title, current user info, logout button.
 */

import { getContainer }      from '../../../../container.js';
import { withError }         from '../../../../utils/eventBus.js';
import { Router }            from '../../../router.js';
import { logger }            from '../../../../utils/logger.js';
import { escapeHTML }        from '../../../../utils/sanitize.js';

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

  // Right: user info + logout
  const actions = document.createElement('div');
  actions.className = 'admin-header__actions';

  const userChip = document.createElement('span');
  userChip.className = 'admin-header__user';
  userChip.textContent = user?.name ? `${user.name} (${user.role})` : (user?.username ?? 'Admin');

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn btn-secondary admin-header__logout';
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', () => {
    withError(async () => {
      await authSvc.logout();
      logger.info('Admin logged out');
      Router.navigate('/login.html');
    });
  });

  actions.append(userChip, logoutBtn);
  header.append(brand, actions);
  container.replaceChildren(header);

  return {
    setTitle(newTitle) {
      titleEl.textContent = newTitle;
    },
  };
}

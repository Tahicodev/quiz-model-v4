/**
 * src/frontend/ui/pages/admin/AdminPage.js
 * Main admin dashboard layout: header + sidebar + content area.
 * Tab switching is SPA-style; each tab lazy-imports its page module and calls
 * its init() function, passing the content host and a refresh trigger.
 *
 * Entry point called from main.js after login for admin users.
 */

import { renderHeader }    from './components/AdminHeader.js';
import { renderSidebar, ADMIN_TABS } from './components/AdminSidebar.js';
import { logger }          from '../../../utils/logger.js';
import { getContainer }    from '../../../container.js';

// Page modules are imported lazily on first show so unrelated code stays
// out of the initial bundle.
const PAGE_LOADERS = {
  dashboard:  () => import('./DashboardPage.js').then(m => m.initDashboardPage),
  questions:  () => import('./QuestionsPage.js').then(m => m.initQuestionsPage),
  exams:      () => import('./ExamsPage.js').then(m => m.initExamsPage),
  classes:    () => import('./ClassesPage.js').then(m => m.initClassesPage),
  categories: () => import('./CategoriesPage.js').then(m => m.initCategoriesPage),
  users:      () => import('./UsersPage.js').then(m => m.initUsersPage),
  results:    () => import('./ResultsPage.js').then(m => m.initResultsPage),
  settings:   () => import('./SettingsPage.js').then(m => m.initSettingsPage),
};

/** @type {string|null} the currently active tab id */
let activeTab = null;
/** @type {{ setActive(tabId:string)=>void }|null} */
let sidebarCtl = null;
/** @type {{ setTitle(title:string)=>void }|null} */
let headerCtl = null;
/** @type {Map<string, { init: Function, refresh?: Function }>} per-tab page controllers */
const pageCache = new Map();
/** @type {HTMLElement|null} the content host */
let contentHost = null;

/**
 * Initialize the admin dashboard. Mounts the layout into <main id="app">.
 * Reads the initial tab from location.hash (SPA-style deeplinking).
 */
export function initAdminPage() {
  const { authSvc } = getContainer();
  if (!authSvc.isAuthenticated() || !authSvc.isAdmin()) {
    logger.warn('Non-admin attempted to load admin page; redirecting to login');
    window.location.href = '/';
    return;
  }

  const root = document.getElementById('app') || document.body;
  root.replaceChildren();
  root.className = 'admin-root';

  // Layout grid: [header full-width][sidebar | content]
  const headerSlot = document.createElement('div');
  headerSlot.id = 'admin-header-slot';
  const body = document.createElement('div');
  body.className = 'admin-body';

  const sidebarSlot = document.createElement('aside');
  sidebarSlot.id = 'admin-sidebar-slot';
  sidebarSlot.className = 'admin-sidebar-slot';
  sidebarSlot.setAttribute('aria-label', 'Admin navigation');

  contentHost = document.createElement('main');
  contentHost.id = 'admin-content';
  contentHost.className = 'admin-content';
  contentHost.setAttribute('role', 'main');

  body.append(sidebarSlot, contentHost);
  root.append(headerSlot, body);

  headerCtl = renderHeader(headerSlot, 'Dashboard');
  sidebarCtl = renderSidebar(sidebarSlot, (tabId) => switchTab(tabId), 'dashboard');

  // Deeplink from hash (#questions, #exams, ...)
  const initial = (location.hash || '').replace('#', '');
  const safeInitial = ADMIN_TABS.some(t => t.id === initial) ? initial : 'dashboard';

  switchTab(safeInitial);

  // React to hash changes (browser back/forward)
  window.addEventListener('hashchange', () => {
    const next = (location.hash || '').replace('#', '');
    if (ADMIN_TABS.some(t => t.id === next) && next !== activeTab) {
      switchTab(next);
    }
  });
}

/**
 * Switch to the given tab. Loads the page module lazily, inits it once,
 * caches the controller, and refreshes its data on subsequent visits.
 * @param {string} tabId
 */
async function switchTab(tabId) {
  if (tabId === activeTab) return;
  activeTab = tabId;
  sidebarCtl?.setActive(tabId);
  const tabDef = ADMIN_TABS.find(t => t.id === tabId);
  headerCtl?.setTitle(tabDef?.label ?? tabId);
  // Reflect the tab in the URL hash for shareable links + back/forward.
  if ((location.hash || '').replace('#', '') !== tabId) {
    history.replaceState(null, '', `#${tabId}`);
  }

  try {
    let page = pageCache.get(tabId);
    if (!page) {
      const loader = PAGE_LOADERS[tabId];
      if (!loader) {
        contentHost.replaceChildren();
        contentHost.textContent = `Unknown section: ${tabId}`;
        return;
      }
      const init = await loader();
      page = { init };
      pageCache.set(tabId, page);
    }

    // Clear and (re-)load the page.
    contentHost.replaceChildren();
    const refresh = await page.init(contentHost);
    page.refresh = typeof refresh === 'function' ? refresh : null;
  } catch (err) {
    logger.error(`Failed to load admin tab "${tabId}"`, err);
    contentHost.replaceChildren();
    const errBox = document.createElement('div');
    errBox.className = 'admin-error';
    errBox.textContent = `Failed to load ${tabId}: ${err.message}`;
    contentHost.appendChild(errBox);
  }
}

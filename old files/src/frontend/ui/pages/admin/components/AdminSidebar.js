/**
 * src/frontend/ui/pages/admin/components/AdminSidebar.js
 * Sidebar tab navigation for the admin dashboard.
 * Emits a `tab:change` event on the provided callback whenever the active tab changes.
 */

/**
 * Tab definitions. Each `id` maps to a page init function in AdminPage.
 * Order here is the display order in the sidebar.
 */
export const ADMIN_TABS = Object.freeze([
  { id: 'dashboard',   label: 'Dashboard',   icon: '📊' },
  { id: 'questions',    label: 'Questions',   icon: '❓' },
  { id: 'exams',        label: 'Exams',       icon: '📝' },
  { id: 'classes',      label: 'Classes',     icon: '🏫' },
  { id: 'categories',   label: 'Categories', icon: '🏷️' },
  { id: 'users',        label: 'Users',       icon: '👥' },
  { id: 'results',      label: 'Results',     icon: '📈' },
  { id: 'games',        label: 'Live Games',  icon: '🎮' },
  { id: 'settings',     label: 'Settings',    icon: '⚙️' },
]);

/**
 * Render the sidebar into the given container element.
 * @param {HTMLElement} container
 * @param {(tabId: string) => void} onTabChange - called when a tab is clicked
 * @param {string} initialTab - tab id to mark active on first render
 * @returns {{ setActive: (tabId: string) => void }}
 */
export function renderSidebar(container, onTabChange, initialTab = 'dashboard') {
  if (!container) return { setActive() {} };

  const nav = document.createElement('nav');
  nav.className = 'admin-sidebar';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Admin sections');

  const list = document.createElement('ul');
  list.className = 'admin-tab-list';

  for (const tab of ADMIN_TABS) {
    const li = document.createElement('li');
    li.className = 'admin-tab' + (tab.id === initialTab ? ' admin-tab--active' : '');
    li.setAttribute('data-tab', tab.id);
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');

    // Icon + label as plain text (no user content → XSS-safe)
    const icon = document.createElement('span');
    icon.className = 'admin-tab__icon';
    icon.textContent = tab.icon;
    const label = document.createElement('span');
    label.className = 'admin-tab__label';
    label.textContent = tab.label;

    li.append(icon, label);
    li.addEventListener('click', () => onTabChange(tab.id));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTabChange(tab.id);
      }
    });
    list.appendChild(li);
  }

  nav.appendChild(list);
  container.replaceChildren(nav);

  return {
    setActive(tabId) {
      for (const li of list.querySelectorAll('.admin-tab')) {
        li.classList.toggle('admin-tab--active', li.getAttribute('data-tab') === tabId);
      }
    },
  };
}

/**
 * src/frontend/main.js
 * Master entry point for the frontend application.
 * Initializes DI, EventBus, Router, and global state.
 *
 * In both the legacy MPA and the admin SPA, the container is created once and
 * exposed to legacy scripts via window.__DI_CONTAINER__ during the transition.
 * When an authenticated admin is detected without a legacy host element, the
 * admin dashboard is mounted lazily (so admin code is only loaded for admins).
 */

import { initEventBus }    from './utils/eventBus.js';
import { createContainer } from './container.js';
import { logger }          from './utils/logger.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Init event bus (toasts, error handling)
    initEventBus();

    // 2. Initialize DI container
    const container = createContainer();
    logger.info('Quiz App Initialized', { mode: window.APP_CONFIG?.mode });

    // 3. Legacy support: Expose container so legacy script.js files can use it
    //    during the MPA → SPA transition.
    window.__DI_CONTAINER__ = container;

    // 4. Admin-aware mounting. If the host document has an empty #app shell and
    //    the logged-in user is an admin, mount the admin dashboard lazily. This
    //    keeps admin code out of the student/legacy bundle path.
    const appShell = document.getElementById('app');
    if (appShell && appShell.children.length === 0 && container.authSvc.isAuthenticated() && container.authSvc.isAdmin()) {
      const { initAdminPage } = await import('./ui/pages/admin/AdminPage.js');
      initAdminPage();
    }
  } catch (err) {
    logger.error('Failed to initialize application', err);
    document.body.innerHTML = `
      <div style="padding: 2rem; color: red; text-align: center; font-family: sans-serif;">
        <h2>Application Error</h2>
        <p>Failed to load the application. Check the console for details.</p>
      </div>
    `;
  }
});

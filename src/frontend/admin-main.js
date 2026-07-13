/**
 * src/frontend/admin-main.js
 * Entry point for the admin SPA shell (admin.html).
 *
 * Initializes the EventBus + DI container, then mounts the AdminPage.
 * Mirrors the bootstrap done in main.js but routes straight into the admin
 * dashboard instead of the legacy MPA entry.
 */

import { initEventBus }    from './utils/eventBus.js';
import { createContainer } from './container.js';
import { logger }          from './utils/logger.js';
import { initAdminPage }    from './ui/pages/admin/AdminPage.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initEventBus();
    const container = createContainer();
    logger.info('Admin SPA initialized', { mode: window.APP_CONFIG?.mode });

    // Expose container for debugging / legacy interop during transition
    window.__DI_CONTAINER__ = container;

    initAdminPage();
  } catch (err) {
    logger.error('Failed to initialize admin app', err);
    document.body.innerHTML = `
      <div style="padding: 2rem; color: #b91c1c; text-align: center; font-family: sans-serif;">
        <h2>Application Error</h2>
        <p>Failed to load the admin dashboard. Check the console for details.</p>
      </div>`;
  }
});

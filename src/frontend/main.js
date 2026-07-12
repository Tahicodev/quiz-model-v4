/**
 * src/frontend/main.js
 * Master entry point for the frontend application.
 * Initializes DI, EventBus, Router, and global state.
 */

import { initEventBus }    from './utils/eventBus.js';
import { createContainer } from './container.js';
import { logger }          from './utils/logger.js';
// import { initRouter }      from './ui/router.js'; // to be created next

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Init event bus (toasts, error handling)
    initEventBus();

    // 2. Initialize DI container
    const container = createContainer();
    logger.info('Quiz App Initialized', { mode: window.APP_CONFIG?.mode });

    // 3. Mount Router (Phase 3 UI foundation — currently we rely on legacy MPA pages)
    // initRouter(container);
    
    // Legacy support: Expose container to window so legacy script.js files can use it during transition
    window.__DI_CONTAINER__ = container;

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

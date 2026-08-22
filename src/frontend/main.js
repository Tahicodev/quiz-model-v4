/**
 * src/frontend/main.js
 * Master entry point for the frontend application.
 * Initializes DI, EventBus, Router, and global state.
 *
 * In both the legacy MPA and the admin SPA, the container is created once and
 * exposed to legacy scripts via window.__DI_CONTAINER__ during the transition.
 * When an authenticated admin is detected without a legacy host element, the
 * admin dashboard is mounted lazily (so admin code is only loaded for admins).
 *
 * Client-side hash routing (Phase 2 — realtime UI):
 *   #/lobby                      → Game lobby
 *   #/games/:id                  → In-game screen
 *   #/tournaments/:id            → Tournament
 *   #/tournaments/:id/register   → Tournament registration
 *   #/sessions/:id               → Exam session
 *   #/sessions/:id/results       → Exam results
 */

import { initEventBus }    from './utils/eventBus.js';
import { createContainer } from './container.js';
import { logger }          from './utils/logger.js';
import { Router }          from './ui/router.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Init event bus (toasts, error handling)
    initEventBus();

    // 2. Initialize DI container
    const container = createContainer();
    logger.info('Quiz App Initialized', { mode: window.APP_CONFIG?.mode });

    // 3. Legacy support: the legacy-bridge.js sibling has already published
    //    window.__DI_CONTAINER__ with the synchronous cache-backed repo that
    //    legacy scripts expect (`getAll_sync`, `setAll_sync`, …). Promote the
    //    SPA services alongside it for hash-routed pages — but never overwrite
    //    the repo, or the legacy shall break.
    if (!window.__DI_CONTAINER__ || typeof window.__DI_CONTAINER__.repo?.getAll_sync !== 'function') {
      window.__DI_CONTAINER__ = container; // legacy-bridge didn't run (SPA-only page)
    } else {
      Object.assign(window.__DI_CONTAINER__, container, { repo: window.__DI_CONTAINER__.repo });
    }

    // 4. Client-side hash routing for realtime pages
    const appShell = document.getElementById('app');
    const isAdminLoggedIn = container.authSvc.isAuthenticated() && container.authSvc.isAdmin();

    // If admin and no hash-route, show admin dashboard
    if (appShell && isAdminLoggedIn && !location.hash) {
      const { initAdminPage } = await import('./ui/pages/admin/AdminPage.js');
      initAdminPage();
      return;
    }

    // Route hash-based pages
    await routeHash();

    window.addEventListener('hashchange', routeHash);
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

/**
 * Parse location.hash and load the corresponding page module.
 */
async function routeHash() {
  const hash = location.hash || '';
  const app = document.getElementById('app');
  if (!app) return;

  // Use simple path matching
  let m;

  // #/lobby → Game lobby
  if (hash === '#/lobby' || hash === '#/games') {
    const { initGamePage } = await import('./ui/pages/games/GamePage.js');
    app.replaceChildren();
    initGamePage(null);
    return;
  }

  // #/games/:id → In-game
  if ((m = hash.match(/^#\/games\/([^/]+)$/))) {
    const { initGamePage } = await import('./ui/pages/games/GamePage.js');
    app.replaceChildren();
    initGamePage(m[1]);
    return;
  }

  // #/tournaments/:id → Tournament page
  if ((m = hash.match(/^#\/tournaments\/([^/]+)$/))) {
    const { initTournamentPage } = await import('./ui/pages/tournaments/TournamentPage.js');
    app.replaceChildren();
    initTournamentPage(m[1]);
    return;
  }

  // #/tournaments/:id/register → Tournament registration
  if ((m = hash.match(/^#\/tournaments\/([^/]+)\/register$/))) {
    const { initTournamentRegister } = await import('./ui/pages/tournaments/TournamentRegister.js');
    app.replaceChildren();
    initTournamentRegister(m[1]);
    return;
  }

  // #/sessions/:id → Exam session
  if ((m = hash.match(/^#\/sessions\/([^/]+)$/))) {
    const { initSessionPage } = await import('./ui/pages/sessions/SessionPage.js');
    app.replaceChildren();
    initSessionPage(m[1]);
    return;
  }

  // #/sessions/:id/results → Exam results
  if ((m = hash.match(/^#\/sessions\/([^/]+)\/results$/))) {
    const { initSessionResults } = await import('./ui/pages/sessions/SessionResults.js');
    app.replaceChildren();
    initSessionResults(m[1]);
    return;
  }

  // #/results/:id → completed result
  if ((m = hash.match(/^#\/results\/([^/]+)$/))) {
    const { initSessionResults } = await import('./ui/pages/sessions/SessionResults.js');
    app.replaceChildren();
    initSessionResults(m[1]);
    return;
  }

  // If no hash match and user is authenticated admin, load admin dashboard
  const { getContainer } = await import('./container.js');
  const c = getContainer();
  if (c.authSvc.isAuthenticated() && c.authSvc.isAdmin()) {
    const { initAdminPage } = await import('./ui/pages/admin/AdminPage.js');
    app.replaceChildren();
    initAdminPage();
    return;
  }

  logger.info('No matching route; showing landing page', { hash });
}

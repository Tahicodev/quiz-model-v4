/**
 * src/frontend/student-main.js
 * Entry point for the student SPA shell (index.html) — mirrors admin-main.js.
 *
 * Initializes the EventBus + DI container, then mounts the StudentLanding
 * component into <main id="app"></main>. The legacy student scripts
 * (utils.js, auth.js, script.js, landing.js, realtime-client.js,
 * legacy-auth-bridge.js) are pulled in via ./ui/pages/student/legacyBootstrap.js
 * so esbuild bundles them alongside this entry into public/student-bundle.js.
 *
 * Notably this entry does NOT import ./main.js (which drives the admin SPA's
 * hash-routes). Keeping main.js out of the student bundle avoids a
 * double-bootstrap; main.js remains the entry for admin sub-routes.
 */

import './ui/pages/student/legacyBootstrap.js';

import { initEventBus }    from './utils/eventBus.js';
import { createContainer } from './container.js';
import { logger }          from './utils/logger.js';
import { initStudentLanding } from './ui/pages/student/StudentLanding.js';

/**
 * Bootstrap synchronously so the DOM is painted before DOMContentLoaded fires.
 * The bundle runs before DOMContentLoaded (it's defer), so we paint the landing
 * DOM now — then the legacy DOMContentLoaded listeners (registered by the
 * legacyScripts.js imports above) will find all the elements they expect.
 */
(function bootstrap() {
  try {
    initEventBus();
    const container = createContainer();
    logger.info('Student SPA initialized', { mode: window.APP_CONFIG?.mode });

    // Expose container for legacy interop during transition (legacy scripts
    // already read window.__DI_CONTAINER__.repo.getAll_sync('exams') etc.).
    // Never clobber the legacy-bridge repo — legacy student scripts rely on
    // its synchronous getAll_sync / setAll_sync contract.
    if (!window.__DI_CONTAINER__ || typeof window.__DI_CONTAINER__.repo?.getAll_sync !== 'function') {
      window.__DI_CONTAINER__ = container;
    } else {
      Object.assign(window.__DI_CONTAINER__, container, { repo: window.__DI_CONTAINER__.repo });
    }

    // Bridge: if the user is logged in as admin via the legacy auth system,
    // persist the new session format so admin.html (which uses the modern
    // AuthService) can find it. Without this bridge, admin.html's auth guard
    // redirects back to / (index.html) which redirects back to admin.html,
    // creating a redirect loop.
    //
    // window.Auth is defined synchronously by auth.js (bundled in this
    // bundle at module evaluation time), so it is available here.
    try {
      const legacyUser = window.Auth?.getCurrentUser?.();
      if (legacyUser && (legacyUser.role === 'admin' || legacyUser.role === 'super_admin')) {
        // Only set if the new format isn't already present (admin may have
        // logged in through the new UI already).
        if (!sessionStorage.getItem('__quiz_session__')) {
          const safeUser = (({ password, password_hash, ...rest }) => rest)(legacyUser);
          sessionStorage.setItem('__quiz_session__', JSON.stringify({
            user: safeUser,
            ts: Date.now(),
          }));
        }
      }
    } catch { /* window.Auth may be absent or incomplete — ignore */ }

    // Paint the DOM synchronously — legacy listeners fire later on
    // DOMContentLoaded and will find the painted elements.
    initStudentLanding(document.getElementById('app'));
  } catch (err) {
    logger.error('Failed to initialize student app', err);
    document.body.innerHTML = `
      <div style="padding: 2rem; color: #b91c1c; text-align: center; font-family: sans-serif;">
        <h2>Application Error</h2>
        <p>Failed to load the quiz portal. Check the console for details.</p>
      </div>`;
  }
})();

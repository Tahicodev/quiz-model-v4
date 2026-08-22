/**
 * src/frontend/ui/pages/entry/EntryPage.js
 * Entry-page component for the quiz portal (index.html).
 *
 * Renders a full-screen, center-anchored AUTH GATE instead of the legacy
 * student landing page. The gate is a single unified sign-in form whose
 * design reuses the exact `.auth-modal` / `.auth-modal-content` /
 * `.admin-auth` / `.auth-modal-brand` / `.auth-input` design language that
 * was established in admin.html's login modal (see styles.css ~20934).
 *
 * Behaviour:
 *  • Page paints with the body hidden behind a full-viewport backdrop so the
 *    portal chrome (header, navigation, quizzes) is never visible before auth.
 *  • On render, the unified auth form is shown (always visible — the modal IS
 *    the page). The `auth-pending` / `auth-ready` classes drive visibility.
 *  • On submit the credentials are POSTed to `${APP_CONFIG.apiUrl}/auth/login`
 *    (the same SaaS JWT endpoint the legacy-auth-bridge uses).
 *  • Based on the returned user's role we redirect:
 *      admin / super_admin / teacher → admin.html
 *      student                        → student-workspace.html
 *  • A "locked" card shows friendly errors if authentication fails.
 *
 * This page is the ONLY mount target for index.html in the new flow — the
 * legacy landing UI (landing-actions, exam-entry) are intentionally NOT
 * rendered. However, the exam-runtime DOM required by script.js (the
 * `#welcome-page` container, `#student-info` form and `.quiz-content`) are
 * kept HIDDEN so direct links like `index.html?examId=...` or `?mode=training`
 * still work for signed-in students — after login, script.js's URL-param
 * handling reveals `.quiz-content` and starts the exam.
 */

/**
 * Full entry markup — auth gate + hidden exam-runtime shells.
 * Kept as one string so all SVG markup, ARIA attributes and inline ids stay
 * diffable, mirroring the legacy StudentLanding pattern.
 */
const ENTRY_HTML = `
<div class="app-container entry-gate-container">
  <main class="app-content entry-gate-main">
    <!--
      ══════════════════════════════════════════════════════════════════════
       AUTH GATE — always-visible, full-screen login. Reuses admin.html's
       .auth-modal component classes so it inherits the same look exactly.
      ══════════════════════════════════════════════════════════════════════
    -->
    <div
      id="entryAuthModal"
      class="modal auth-modal entry-gate-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-auth-title"
    >
      <div class="modal-content small-modal auth-modal-content admin-auth">
        <div class="modal-header auth-modal-header">
          <div class="auth-modal-brand">
            <div class="auth-modal-mark" aria-hidden="true" id="entryAuthMark">Q</div>
            <div class="auth-modal-brand-text">
              <h2 id="entry-auth-title">Welcome to Quiz Portal</h2>
              <p>Sign in to continue to your dashboard or workspace.</p>
            </div>
          </div>
        </div>
        <div class="modal-body auth-modal-body">
          <form id="entryAuthForm" class="auth-form" novalidate>
            <p class="auth-form-intro">
              Enter your credentials. You'll be taken to the admin panel if you
              sign in as an admin, or to the student workspace if you sign in
              as a student.
            </p>
            <div class="form-group auth-field">
              <label for="entry-auth-username">Username</label>
              <input
                type="text"
                id="entry-auth-username"
                data-auth="username"
                class="form-control auth-input"
                placeholder="Enter your username"
                autocomplete="username"
                required
              />
            </div>
            <div class="form-group auth-field">
              <label for="entry-auth-password">Password</label>
              <div class="auth-password-wrap">
                <input
                  type="password"
                  id="entry-auth-password"
                  data-auth="password"
                  class="form-control auth-input"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  required
                />
                <button
                  type="button"
                  class="auth-toggle-password"
                  data-target="entry-auth-password"
                  aria-label="Show password"
                  aria-pressed="false"
                >
                  Show
                </button>
              </div>
            </div>
            <div class="auth-meta-row">
              <label class="auth-remember" for="entry-auth-remember">
                <input type="checkbox" id="entry-auth-remember" data-auth="remember" />
                <span>Remember me</span>
              </label>
            </div>
            <button type="submit" class="btn btn-primary auth-submit-btn" id="entryAuthSubmitBtn">
              Sign In
            </button>
            <div
              id="entryAuthStatus"
              class="auth-recovery-status"
              role="status"
              aria-live="polite"
            ></div>
            <p class="auth-footnote">
              Students sign in with their account credentials.
            </p>
          </form>
        </div>
      </div>
    </div>

    <!--
      ══════════════════════════════════════════════════════════════════════
       HIDDEN EXAM-RUNTIME SHELL
       script.js (the quiz engine) runs on this page and requires the DOM
       below to handle direct exam links like index.html?examId=... or
       ?mode=training. Kept invisible until login + URL-param start the exam.
       Exam start reveals the .quiz-content block and hides this wrapper.
      ══════════════════════════════════════════════════════════════════════
    -->
    <div
      class="quiz-container"
      id="quiz-container"
      style="display: none"
      aria-hidden="true"
    >
      <div class="welcome-page" id="welcome-page" style="display: none"></div>

      <div class="quiz-content" id="quiz-content" style="display: none">
        <!-- Quiz Header -->
        <div class="quiz-header-grid">
          <div class="header-card">
            <div class="header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="header-content">
              <span class="header-label">Time</span>
              <div class="header-value" id="timer">00:00</div>
            </div>
          </div>

          <div class="header-card">
            <div class="header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="header-content">
              <span class="header-label">Score</span>
              <div class="header-value" id="score">0</div>
            </div>
          </div>

          <div class="header-card">
            <div class="header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="header-content">
              <span class="header-label">Progress</span>
              <div class="header-value" id="progress">0/0</div>
            </div>
          </div>

          <div class="header-card">
            <div class="header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div class="header-content">
              <span class="header-label">Mode</span>
              <div class="header-value" id="quiz-mode">Training</div>
            </div>
          </div>
        </div>

        <!-- Question Area -->
        <div class="quiz-card">
          <div class="question" id="question"></div>
          <div class="options" id="options"></div>
        </div>
      </div>

      <!--
        Hidden student-info form — script.js (validateForm / startTrainingMode /
        showCustomAlert paths) reads numero/name/class from here. On exam start,
        these are populated from the signed-in student's identity.
      -->
      <form id="student-info" style="display: none" aria-hidden="true" tabindex="-1">
        <input type="hidden" name="numero" id="entry-si-numero" />
        <input type="hidden" name="name" id="entry-si-name" />
        <input type="hidden" name="class" id="entry-si-class" />
      </form>
    </div>

    <!-- results panel container — script.js renders into this when needed -->
    <div id="student-results-panel" class="hidden"></div>
  </main>
</div>
`;

/**
 * Backend base URL — mirrors legacy-auth-bridge.js's resolution so the SaaS
 * login endpoint is always hit regardless of how the page was reached.
 */
function getApiBase() {
  return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
}

/**
 * Show a transient inline status message inside the gate card.
 * Reuses the .auth-recovery-status styles from the legacy modal.
 */
function setAuthStatus(message, type) {
  const el = document.getElementById('entryAuthStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'auth-recovery-status' + (type ? ' ' + type : '');
}

/**
 * Persist a session in exactly the shape the legacy codebase expects —
 * this mirrors legacy-auth-bridge.js's buildSession / persistSession and
 * allows admin.html / student-workspace.html (both of which speak the legacy
 * session format from localStorage + sessionStorage) to pick up the user
 * with no secondary login prompt.
 *
 * @param {Object} payload - The /api/v1/auth/login response body.
 * @param {boolean} remember - Whether the user ticked "remember me".
 */
function persistLegacySession(payload, remember) {
  const user = payload.user || payload;
  const token = payload.accessToken || payload.token || '';
  const now = new Date();
  const ttlDays = remember ? 30 : 1;
  const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const session = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    numero: user.numero || user.studentNumber || '',
    classId: user.class_id || user.classId || '',
    className: user.class_name || user.className || '',
    token,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
    lastActivity: now.toISOString(),
  };

  try {
    // Session keys the legacy code reads on load. Write to BOTH
    // sessionStorage and localStorage so whichever the legacy page reads first
    // finds it (admin.html uses sessionStorage + localStorage remember key).
    sessionStorage.setItem('quizSession', JSON.stringify(session));
    localStorage.setItem('quizSession', JSON.stringify(session));
    if (remember) {
      localStorage.setItem('quizSessionRemember', JSON.stringify(session));
    } else {
      localStorage.removeItem('quizSessionRemember');
    }
    if (token) {
      localStorage.setItem('quizAuthToken', token);
    }

    // Seed quizCurrentUser + quizUsers so legacy pages that rehydrate from
    // localStorage find the user synchronously before the legacy-bridge
    // async preload completes.
    if (user && user.id) {
      const currentUser = {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role,
        numero: user.numero || user.studentNumber || '',
        studentNumber: user.studentNumber || user.numero || '',
        classId: user.class_id || user.classId || '',
        className: user.class_name || user.className || '',
        status: 'active',
      };
      localStorage.setItem('quizCurrentUser', JSON.stringify(currentUser));

      let users = [];
      try {
        users = JSON.parse(localStorage.getItem('quizUsers') || '[]');
      } catch (_) {
        /* ignore */
      }
      if (!Array.isArray(users)) users = [];
      let found = false;
      users = users.map((u) => {
        if (u && u.id === currentUser.id) {
          found = true;
          return Object.assign({}, u, currentUser);
        }
        return u;
      });
      if (!found) users.push(currentUser);
      localStorage.setItem('quizUsers', JSON.stringify(users));
    }
    window.__authToken = token;

    // For a student, also seed sessionStorage.studentInfo so script.js's
    // validateForm() and startExam() pick it up without prompting.
    if (String(user.role || '').toLowerCase() === 'student') {
      try {
        sessionStorage.setItem(
          'studentInfo',
          JSON.stringify({
            numero: user.studentNumber || user.numero || '',
            name: user.name || user.username,
            class:
              user.className ||
              user.class_name ||
              user.classId ||
              user.class_id ||
              '',
            classId: user.classId || user.class_id || '',
            avatar: user.avatar || '',
          }),
        );
      } catch (_) {
        /* ignore */
      }
    } else {
      sessionStorage.removeItem('studentInfo');
    }
  } catch (err) {
    console.warn('[entry-auth] session persist failed:', err);
  }

  return session;
}

/**
 * Redirect the browser after a successful login.
 * @param {string} role - The role returned from the backend.
 * @param {Object} sessionPayload - The full login response (carries token).
 */
function redirectAfterLogin(role) {
  const normalized = String(role || '').toLowerCase();
  if (
    normalized === 'admin' ||
    normalized === 'super_admin' ||
    normalized === 'teacher'
  ) {
    window.location.href = 'admin.html';
    return;
  }
  // Default — students (and anything unrecognized, treated as student) go to
  // the student workspace where the Auth check + student-workspace.js flow
  // takes over.
  const params = new URLSearchParams(window.location.search);
  const runtimeQuery = params.get('examId') || params.get('mode') === 'training'
    ? window.location.search
    : '';
  window.location.href = runtimeQuery
    ? `index.html${runtimeQuery}`
    : 'student-workspace.html';
}

/**
 * Bind the unified login form to the SaaS backend login endpoint.
 *
 * Waits for DOMContentLoaded (or runs immediately if the document is already
 * interactive — esbuild's IIFE bundle executes after parse).
 */
function bindAuthGate() {
  const form = document.getElementById('entryAuthForm');
  if (!form || form.dataset.bridgeBound === 'true') return;
  form.dataset.bridgeBound = 'true';

  // Wire the show/hide password toggle.
  const toggle = form.querySelector('.auth-toggle-password');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.target);
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.textContent = reveal ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const username = (form.querySelector('[data-auth="username"]') || {}).value || '';
    const password = (form.querySelector('[data-auth="password"]') || {}).value || '';
    const remember = Boolean(
      (form.querySelector('[data-auth="remember"]') || {}).checked,
    );

    if (!username.trim() || !password) {
      setAuthStatus('Please enter both your username and password.', 'error');
      return;
    }

    const submitBtn = document.getElementById('entryAuthSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
    }
    setAuthStatus('', '');

    try {
      const res = await fetch(getApiBase() + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          (data && data.error && data.error.message) ||
          (data && data.message) ||
          'Invalid username or password.';
        setAuthStatus(msg, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Sign In';
        }
        return;
      }

      const payload = data && (data.user || data.data) ? data : { user: data };
      const user = payload.user || payload;
      const token = payload.accessToken || payload.token || '';

      // Persist in the legacy shape so downstream pages (admin.html,
      // student-workspace.html) instantly recognise the session.
      persistLegacySession({ ...payload, user, accessToken: token }, remember);
      sessionStorage.setItem(
        user.role === 'student' ? 'studentLoggedIn' : 'adminLoggedIn',
        'true',
      );

      setAuthStatus('Signed in — redirecting…', 'success');
      // Small delay so the user sees the success state before the redirect.
      setTimeout(() => redirectAfterLogin(user.role), 300);
    } catch (err) {
      console.error('[entry-auth] login request failed:', err);
      setAuthStatus(
        'Could not reach the server — check your connection and try again.',
        'error',
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In';
      }
    }
  }, { capture: true }); // capture=true so we win if auth.js also bound first
}

/**
 * If the user is already signed in, skip the gate and redirect immediately.
 * Returns true when a redirect was issued.
 */
function redirectIfAlreadySignedIn() {
  try {
    // Exam/training links are a real authenticated runtime route. Do not
    // bounce them back to the workspace, otherwise every Start button loops
    // between index.html and student-workspace.html.
    const params = new URLSearchParams(window.location.search);
    if (params.get('examId') || params.get('mode') === 'training') return false;
    const raw =
      sessionStorage.getItem('quizSession') ||
      localStorage.getItem('quizSessionRemember');
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session || !session.role) return false;
    if (session.expiresAt && Date.now() > Date.parse(session.expiresAt)) {
      sessionStorage.removeItem('quizSession');
      localStorage.removeItem('quizSessionRemember');
      return false;
    }
    redirectAfterLogin(session.role);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Mount the entry page (auth gate) into the app container.
 * Called by student-main.js's bootstrap, which runs synchronously before
 * DOMContentLoaded, so we paint the gate immediately and bind listeners.
 *
 * @param {HTMLElement} container - the <main id="app"></main> shell host.
 */
export function initEntryPage(container) {
  if (!container) return;

  // Already signed in? Skip the gate entirely — redirect before paint.
  // Check both the canonical localStorage remember key and any existing
  // sessionStorage session so admins hitting / with a remembered session
  // go straight to admin.html (same for students → workspace).
  if (redirectIfAlreadySignedIn()) return;

  // Paint the gate + the hidden exam runtime markup.
  const tpl = document.createElement('template');
  tpl.innerHTML = ENTRY_HTML.trim();
  container.replaceChildren(tpl.content.cloneNode(true));

  // Direct exam/training links use this page as the runtime host after an
  // authenticated student arrives. Avoid leaving the quiz container hidden.
  const runtimeParams = new URLSearchParams(window.location.search);
  const isRuntimeRoute = Boolean(
    runtimeParams.get('examId') || runtimeParams.get('mode') === 'training',
  );
  if (isRuntimeRoute) {
    try {
      const raw =
        sessionStorage.getItem('quizSession') ||
        localStorage.getItem('quizSessionRemember') ||
        localStorage.getItem('quizSession');
      const session = raw ? JSON.parse(raw) : null;
      if (String(session?.role || '').toLowerCase() === 'student') {
        const modal = document.getElementById('entryAuthModal');
        modal?.classList.add('hidden');
        // The entry-gate CSS intentionally uses !important so the modal is
        // visible on the anonymous landing page. Override it explicitly once
        // a signed-in student returns to a runtime URL.
        modal?.style.setProperty('display', 'none', 'important');
        const runtime = document.getElementById('quiz-container');
        runtime?.style.setProperty('display', 'block', 'important');
        runtime?.setAttribute('aria-hidden', 'false');
        container.classList.add('entry-runtime-active');
      }
    } catch (_) {
      /* Keep the visible auth gate when the session cannot be read. */
    }
  }

  // Apply the legacy gating CSS so the backdrop + gating scroll-lock CSS rules
  // hide any potential flash-of-content. We deliberately do NOT toggle the
  // `auth-pending` class here: that class sets `pointer-events:none` on
  // `.app-container` (used by admin.html to block interaction with the
  // dashboard), and because our gate itself lives INSIDE `.app-container`
  // doing so would make the login form un-clickable. Instead we rely on the
  // modal's own backdrop + z-index to gate the page.

  // Bind the auth form.
  const bindNow = () => {
    try {
      bindAuthGate();
    } catch (err) {
      console.error('[entry-auth] failed to bind:', err);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindNow, { once: true });
  } else {
    bindNow();
  }

  // NOTE: We deliberately do NOT hook window-level 'error' events here. The
  // quiz runtime (script.js) and the realtime client emit a number of
  // non-fatal runtime events during page bootstrap (missing DOM references
  // for hidden exam paths, etc.) — listening to 'error' at the document root
  // used to surface those as misleading "exam failed" messages on the login
  // card before the user had a chance to sign in. Exam-flow errors surface
  // naturally once the user is authenticated and the quiz is actually running.

  // Seed the hidden student-info fields from an already-authenticated session
  // (e.g. first hit with a remembered session and ?examId — after redirect
  // we'd be gone, but on the rare page where redirect is delayed we must
  // not leave them blank, otherwise script.js's validateForm() fails. These
  // are populated here purely for robustness.
  try {
    const raw =
      sessionStorage.getItem('quizSession') ||
      localStorage.getItem('quizSessionRemember');
    if (raw) {
      const session = JSON.parse(raw);
      const users = JSON.parse(localStorage.getItem('quizUsers') || '[]');
      const user = users.find((u) => u && u.id === session.userId);
      if (user) {
        const numero = document.getElementById('entry-si-numero');
        const name = document.getElementById('entry-si-name');
        const cls = document.getElementById('entry-si-class');
        if (numero) numero.value = user.studentNumber || '';
        if (name) name.value = user.name || user.username || '';
        if (cls) cls.value = user.className || '';
      }
    }
  } catch (_) {
    /* best-effort seed */
  }
}

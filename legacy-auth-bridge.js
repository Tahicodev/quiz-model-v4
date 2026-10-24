/**
 * legacy-auth-bridge.js â€” SaaS-only auth wiring for the legacy MPA pages
 *
 * Intercepts the legacy login form submissions and routes them through the
 * SaaS backend (bcrypt + JWT + httpOnly refresh cookie) instead of any
 * localStorage-based check.
 *
 * Load this AFTER auth.js so the DOM event listeners are already attached;
 * it will clone-replace the login forms to remove the original listeners
 * before attaching API-aware ones.
 */

(function () {
  'use strict';

  if (window.__AUTH_BRIDGE__) return;
  window.__AUTH_BRIDGE__ = true;

  var baseUrl = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';

  // â”€â”€ Direct Storage access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Instance-method wrappers (NOT bare prototype references â€” calling those
  // without a receiver throws "Illegal invocation" under strict mode and the
  // catch below would silently swallow every persistSession write after the
  // first). They intentionally route through whatever Storage.prototype
  // methods are current: legacy-bridge.js's patch is a passthrough for the
  // auth keys, and quizUsers seeding through the patch is exactly what the
  // pre-bridge code did (keeps the repo cache coherent).
  var _origGetLS = function (k) { return localStorage.getItem(k); };
  var _origSetLS = function (k, v) { localStorage.setItem(k, v); };
  var _origRemoveLS = function (k) { localStorage.removeItem(k); };

  // â”€â”€ Helper: show toast if available â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function showMsg(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
    } else {
      console.log('[' + type + '] ' + msg);
    }
  }

  // â”€â”€ Shared login POST with single-session handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Resolves { body } on success. Rejects with err.code === 'SESSION_ACTIVE'
  // (status 409) when the account already holds a live session elsewhere â€”
  // the caller offers the "sign out the other session" take-over instead of
  // a dead-end error. Network failures reject with a plain Error.
  function postLoginRequest(portal, username, password, force) {
    return fetch(baseUrl + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        password: password,
        // Scope the refresh cookie to this portal so a student login in
        // another tab of the same browser never rotates it.
        portal: portal,
        force: force === true,
      }),
      credentials: 'include',
    }).then(function (res) {
      return res.json().then(
        function (body) {
          return { res: res, body: body || {} };
        },
        function () {
          return { res: res, body: {} };
        },
      );
    }).then(function (out) {
      if (
        out.res.status === 409 &&
        out.body &&
        out.body.error &&
        out.body.error.code === 'SESSION_ACTIVE'
      ) {
        var conflict = new Error(
          out.body.error.message || 'Already signed in on another device or tab.',
        );
        conflict.code = 'SESSION_ACTIVE';
        conflict.status = 409;
        throw conflict;
      }
      if (!out.res.ok) {
        var msg =
          (out.body && out.body.error && out.body.error.message) ||
          'Invalid username or password';
        var err = new Error(msg);
        err.status = out.res.status;
        throw err;
      }
      return out.body;
    });
  }

  // Inline take-over prompt inside the login form (no stylesheet needed).
  // Returns true when rendered; the caller falls back to a toast otherwise.
  function showSessionConflictConfirm(form, onTakeOver) {
    try {
      if (!form || !form.appendChild) return false;
      var old = form.querySelector('[data-session-conflict]');
      if (old) old.remove();
      var bar = document.createElement('div');
      bar.setAttribute('data-session-conflict', 'true');
      bar.setAttribute('role', 'alert');
      bar.style.cssText =
        'margin:12px 0;padding:0;border:1px solid #fcd34d;' +
        'border-left:5px solid #f59e0b;border-radius:12px;background:' +
        'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);' +
        'box-shadow:0 8px 24px rgba(245,158,11,0.18);overflow:hidden;' +
        'animation:sessionConflictIn 0.25s ease-out;';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px 0;';
      var icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⚠️';
      icon.style.cssText =
        'display:inline-grid;place-items:center;width:34px;height:34px;flex:0 0 auto;' +
        'border-radius:50%;background:#f59e0b;color:#fff;font-size:18px;' +
        'box-shadow:0 2px 8px rgba(245,158,11,0.45);';
      var title = document.createElement('strong');
      title.textContent = 'Already signed in';
      title.style.cssText = 'color:#78350f;font-size:0.98rem;letter-spacing:-0.01em;';
      head.appendChild(icon);
      head.appendChild(title);
      var msg = document.createElement('div');
      msg.textContent =
        'This account is already signed in on another device or tab. ' +
        'Only one session is allowed at a time.';
      msg.style.cssText = 'padding:8px 14px 0;color:#92400e;font-size:0.88rem;line-height:1.5;';
      var hint = document.createElement('div');
      hint.textContent =
        'Ask your teacher or admin to end your other session, or take over below.';
      hint.style.cssText = 'padding:4px 14px 0;color:#b45309;font-size:0.8rem;line-height:1.5;';
      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.padding = '12px 14px 14px';
      row.style.flexWrap = 'wrap';
      var takeOver = document.createElement('button');
      takeOver.type = 'button';
      takeOver.textContent = 'Sign out the other session and continue';
      takeOver.style.cssText =
        'flex:1;min-width:200px;padding:10px 14px;border:none;border-radius:9px;' +
        'background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;' +
        'font-weight:700;font-size:0.88rem;cursor:pointer;' +
        'box-shadow:0 4px 14px rgba(99,102,241,0.35);transition:transform 0.15s ease;';
      takeOver.onmouseover = function () { takeOver.style.transform = 'translateY(-1px)'; };
      takeOver.onmouseout = function () { takeOver.style.transform = 'none'; };
      takeOver.onclick = function () {
        try { bar.remove(); } catch (_) {}
        onTakeOver();
      };
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.style.cssText =
        'padding:10px 16px;border:1px solid #d1d5db;border-radius:9px;' +
        'background:#fff;color:#374151;font-weight:600;font-size:0.88rem;cursor:pointer;';
      cancel.onclick = function () {
        try { bar.remove(); } catch (_) {}
      };
      row.appendChild(takeOver);
      row.appendChild(cancel);
      bar.appendChild(head);
      bar.appendChild(msg);
      bar.appendChild(hint);
      bar.appendChild(row);
      ensureConflictAnimation();
      form.appendChild(bar);
      try { takeOver.focus(); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  // One-shot keyframes for the conflict notice entrance (inline <style> so
  // the login page needs no stylesheet changes).
  var conflictAnimationAdded = false;
  function ensureConflictAnimation() {
    if (conflictAnimationAdded) return;
    conflictAnimationAdded = true;
    try {
      var style = document.createElement('style');
      style.setAttribute('data-session-conflict-style', 'true');
      style.textContent =
        '@keyframes sessionConflictIn{' +
        'from{opacity:0;transform:translateY(-6px);}' +
        'to{opacity:1;transform:none;}' +
        '}';
      document.head.appendChild(style);
    } catch (_) {}
  }

  // â”€â”€ Single-session watchdog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // While signed in, ask the server (cheap, ~1 indexed query) whether THIS
  // tab is still the live session: every 60s and whenever the tab regains
  // focus. A 409 means another tab/device took over â†’ end this session with
  // an explanation instead of letting it linger half-alive.
  var sessionWatchTimer = null;
  var lastSessionCheck = 0;
  var sessionEnded = false;

  function checkSessionAlive(manual) {
    if (sessionEnded) return Promise.resolve(false);
    var token = window.__authToken || '';
    if (!token) return Promise.resolve(false);
    var now = Date.now();
    if (!manual && now - lastSessionCheck < 45000) return Promise.resolve(true);
    lastSessionCheck = now;
    return fetch(baseUrl + '/auth/session', {
      method: 'GET',
      credentials: 'include',
      headers: { Authorization: 'Bearer ' + token },
    }).then(function (res) {
      if (res.status === 409) {
        handleSessionSuperseded();
        return false;
      }
      return res.ok;
    }).catch(function () {
      // Network trouble must never log anyone out.
      return true;
    });
  }

  function handleSessionSuperseded() {
    if (sessionEnded) return;
    sessionEnded = true;
    try {
      if (sessionWatchTimer) {
        clearInterval(sessionWatchTimer);
        sessionWatchTimer = null;
      }
    } catch (_) {}
    // Wipe THIS tab's session only. Never call server logout here: the
    // browser's refresh cookie already belongs to the NEW session, and
    // revoking it would kill the session that just took over.
    try {
      sessionStorage.removeItem('quizSession');
      localStorage.removeItem('quizSession');
      localStorage.removeItem('quizSessionRemember');
      window.__authToken = null;
    } catch (_) {}
    showMsg(
      'Signed in on another device or tab. This session has ended.',
      'error',
    );
    setTimeout(function () {
      window.location.href = '/';
    }, 2500);
  }
  window.__sessionSuperseded = handleSessionSuperseded;

  function startSessionWatchdog() {
    if (sessionWatchTimer) return;
    try {
      sessionWatchTimer = setInterval(function () {
        checkSessionAlive(false);
      }, 60000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkSessionAlive(true);
      });
      window.addEventListener('focus', function () {
        checkSessionAlive(true);
      });
    } catch (_) {}
  }

  // â”€â”€ Helper: replace a form element to strip old event listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function replaceForm(id) {
    var form = document.getElementById(id);
    if (!form) return null;
    var clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);
    return clone;
  }

  // â”€â”€ Build session object in the format auth.js expects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function buildSession(user, token, remember) {
    var now = new Date();
    var ttl = remember ? 30 : 1; // days
    var expires = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000);

    return {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      token: token,
      expiresAt: expires.toISOString(),
      createdAt: now.toISOString(),
      lastActivity: now.toISOString(),
    };
  }

  // A Kids session-expiry recovery arrives on the workspace with
  // ?login=1&next=/kids/....  The workspace also listens for auth:changed,
  // but make the post-login return explicit here: this is the one place that
  // knows the server has accepted the new student session.
  function returnToKidsAfterStudentLogin() {
    try {
      var next = new URLSearchParams(window.location.search).get('next');
      if (!next) return false;
      var destination = new URL(next, window.location.origin);
      if (destination.origin !== window.location.origin) return false;
      if (destination.pathname !== '/kids' && destination.pathname.indexOf('/kids/') !== 0) {
        return false;
      }
      window.location.replace(destination.pathname + destination.search + destination.hash);
      return true;
    } catch (_) {
      return false;
    }
  }

  // â”€â”€ Persist session in the format auth.js expects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // sessionStorage is per-tab and always safe. The localStorage copies are
  // SHARED with every other tab of this browser: the admin portal and the
  // student workspace both read/write the same keys, so a student login in
  // one tab used to overwrite the admin tab's identity (quizSession /
  // quizAuthToken / quizCurrentUser). Guard those writes:
  //   - write the role-scoped copy (quizSession:student etc.) unconditionally
  //   - only overwrite the SHARED unscoped keys when the previous shared
  //     session belongs to the same user+role (a refresh), or when there is
  //     no session in this tab (a genuine first login in this tab)
  function persistSession(session, remember) {
    try {
      sessionStorage.setItem('quizSession', JSON.stringify(session));

      var role = String(session.role || '').toLowerCase();
      var scopedKey = 'quizSession:' + (role || 'user');
      var scopedTokenKey = 'quizAuthToken:' + (role || 'user');
      var scopedUserKey = 'quizCurrentUser:' + (role || 'user');
      _origSetLS(scopedKey, JSON.stringify(session));
      if (session.token) _origSetLS(scopedTokenKey, session.token);

      // This tab's previous session (per-tab source of truth). When the SAME
      // tab logs in again (re-login or role change within this tab) the shared
      // copies may follow the new identity.
      var thisTabBefore = _origGetLS('quizSession');
      var thisTabBeforeUser = null;
      try { thisTabBeforeUser = thisTabBefore ? JSON.parse(thisTabBefore).userId : null; } catch (_) {}
      var sameUserBefore = thisTabBefore !== null &&
        String(thisTabBeforeUser || '') === String(session.userId || '');

      // The shared unscoped session: only replace when it is absent, or it
      // already matches this session's user (token refresh) â€” otherwise the
      // other portal's tab owns it and must keep its identity.
      var sharedRaw = _origGetLS('quizSession');
      var sharedSession = null;
      try { sharedSession = sharedRaw ? JSON.parse(sharedRaw) : null; } catch (_) {}
      var sharedMatches = sharedSession &&
        String(sharedSession.userId || '') === String(session.userId || '') &&
        String(sharedSession.role || '').toLowerCase() === role;

      if (!sharedRaw || sharedMatches || sameUserBefore) {
        _origSetLS('quizSession', JSON.stringify(session));
        if (session.token) _origSetLS('quizAuthToken', session.token);
        if (session.userId) {
          var currentUser = {
            id: session.userId,
            username: session.username,
            name: session.name || session.username,
            role: session.role,
            status: 'active',
          };
          _origSetLS('quizCurrentUser', JSON.stringify(currentUser));
        }
        if (remember) {
          _origSetLS('quizSessionRemember', JSON.stringify(session));
        } else {
          _origRemoveLS('quizSessionRemember');
        }
      } else if (session.userId) {
        // The shared identity belongs to the other portal's tab â€” keep it,
        // but mirror this session's user in the role-scoped slot so this
        // portal's pages can always find their own identity.
        _origSetLS(scopedUserKey, JSON.stringify({
          id: session.userId,
          username: session.username,
          name: session.name || session.username,
          role: session.role,
          status: 'active',
        }));
      }
      if (session.userId) {
        var scopedUser2 = {
          id: session.userId,
          username: session.username,
          name: session.name || session.username,
          role: session.role,
          status: 'active',
        };
        // Always refresh the scoped user copy.
        var existingScopedRaw = _origGetLS(scopedUserKey);
        var existingScoped = null;
        try { existingScoped = existingScopedRaw ? JSON.parse(existingScopedRaw) : null; } catch (_) {}
        if (!existingScoped || String(existingScoped.id || '') === String(session.userId || '')) {
          _origSetLS(scopedUserKey, JSON.stringify(scopedUser2));
        }
      }

      // Seed the local auth view immediately. The SaaS preload is
      // asynchronous, while auth.js validates a session synchronously on
      // the next page load.
      var users = [];
      try { users = JSON.parse(_origGetLS('quizUsers') || '[]'); } catch (_) {}
      if (!Array.isArray(users)) users = [];
      var found = false;
      users = users.map(function (user) {
        if (user && user.id === session.userId) {
          found = true;
          return Object.assign({}, user, {
            id: session.userId,
            username: session.username,
            name: session.name || session.username,
            role: session.role,
            status: 'active',
          });
        }
        return user;
      });
      if (!found && session.userId) users.push({
        id: session.userId,
        username: session.username,
        name: session.name || session.username,
        role: session.role,
        status: 'active',
      });
      _origSetLS('quizUsers', JSON.stringify(users));
      // Store token for the API repo
      window.__authToken = session.token;
      window.__AUTH_SESSION_EXPIRED__ = false;
    } catch (e) {
      console.warn('[legacy-auth] persistSession error:', e);
    }
  }

  // â”€â”€ Fetch the full user record from bootstrap and merge it into the seed â”€â”€
  // The login response only carries {id, username, name, role, status}; the
  // student workspace needs studentNumber/classId/className/avatar to render
  // the profile, so we call /api/v1/bootstrap right after login and merge the
  // authoritative row into both the returned user and the quizUsers seed.
  function hydrateFullUser(user, token) {
    if (!user || !user.id || !token) return Promise.resolve(user);
    var url = baseUrl + '/bootstrap';
    return fetch(url, {
      credentials: 'include',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (payload) {
        var data = payload && payload.data;
        if (!data) return user;
        var serverUsers = Array.isArray(data.users) ? data.users : [];
        var full = serverUsers.find(function (u) { return u && u.id === user.id; });
        if (!full) return user;
        // Merge snake_case from server into the camelCase shape auth.js expects.
        var merged = Object.assign({}, user, {
          id: full.id,
          username: full.username,
          name: full.name,
          role: full.role,
          status: full.status,
          classId: full.class_id || '',
          class_id: full.class_id || '',
          studentNumber: full.numero || '',
          numero: full.numero || '',
          lastLogin: full.last_login || '',
        });
        // Resolve class name from the classes table for display chips.
        var serverClasses = Array.isArray(data.classes) ? data.classes : [];
        var cls = serverClasses.find(function (c) { return c && c.id === merged.classId; });
        if (cls) merged.className = cls.name;
        return merged;
      })
      .catch(function () { return user; }); // best effort â€” never block login
  }

  // â”€â”€ Bind admin login form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function bindAdminLogin() {
    var form = replaceForm('authLoginForm');
    if (!form) return;

    // Flag so auth.js (or any legacy handler) can detect the bridge owns this
    // form and skip its own localStorage-based login. auth.js may still have
    // attached listeners *before* us if it ran first; the clone above strips
    // them, but belt-and-braces: also mark the form.
    form.setAttribute('data-bridge-owned', 'true');
    window.__AUTH_BRIDGE_OWNS_LOGIN__ = true;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var username = (this.querySelector('[data-auth="username"]') || {}).value;
      var password = (this.querySelector('[data-auth="password"]') || {}).value;
      var remember = (this.querySelector('[data-auth="remember"]') || {}).checked;

      if (!username || !password) {
        showMsg('Please enter your username and password', 'error');
        return;
      }
      // One in-flight login per form: double-clicks would otherwise mint
      // twin sessions that both look live and lock each other out.
      if (form.dataset.loggingIn === 'true') return;
      form.dataset.loggingIn = 'true';

      var attempt = function (force) {
        return postLoginRequest('admin', username.trim(), password, force).then(function (data) {
          var user = data.user || data;
          var token = data.accessToken || data.token || '';

          var session = buildSession(user, token, remember);
          persistSession(session, remember);
          sessionStorage.setItem('adminLoggedIn', 'true');
          // Clear the gate classes so hideAuthModal state is clean post-reload.
          try {
            document.documentElement.classList.remove('auth-pending', 'auth-ready');
          } catch (_) {}

          sessionEnded = false;
          startSessionWatchdog();
          showMsg('Login successful', 'success');
          window.location.reload();
        }).catch(function (err) {
          // Admin portal: newest session always wins — no conflict dead-end.
          // (The safety-net notice below only fires if a forced takeover
          // itself ever races a 409.)
          if (err && err.code === 'SESSION_ACTIVE') {
            form.dataset.loggingIn = '';
            var shown = showSessionConflictConfirm(form, function () {
              form.dataset.loggingIn = 'true';
              attempt(true);
            });
            if (!shown) {
              showMsg(err.message || 'Already signed in on another device or tab.', 'error');
            }
            return;
          }
          showMsg((err && err.message) || 'Invalid username or password', 'error');
          form.dataset.loggingIn = '';
        });
      };
      // Admins take over immediately: the newest admin session ends any
      // older one server-side (students keep the confirm-takeover prompt).
      attempt(true).catch(function (err) {
        form.dataset.loggingIn = '';
        showMsg('Connection error: ' + (err.message || 'network error'), 'error');
      });
    }, true); // capture=true so this runs before any non-capture listener
  }

  // â”€â”€ Bind student login form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function bindStudentLogin() {
    var form = replaceForm('studentLoginForm');
    if (!form) return;

    form.setAttribute('data-bridge-owned', 'true');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var username = (this.querySelector('[data-auth="username"]') || {}).value;
      var password = (this.querySelector('[data-auth="password"]') || {}).value;
      var remember = (this.querySelector('[data-auth="remember"]') || {}).checked;

      if (!username || !password) {
        showMsg('Please enter your username and password', 'error');
        return;
      }
      // One in-flight login per form: double-clicks would otherwise mint
      // twin sessions that both look live and lock each other out.
      if (form.dataset.loggingIn === 'true') return;
      form.dataset.loggingIn = 'true';

      var attempt = function (force) {
        var loginToken = '';
        return postLoginRequest('student', username.trim(), password, force).then(function (data) {
          var user = data.user || data;
          loginToken = data.accessToken || data.token || '';
          // Fetch the full user record (with classId/studentNumber/className)
          // before persisting or notifying the UI, so the student workspace
          // renders the real profile instead of an empty shell.
          return hydrateFullUser(user, loginToken);
        }).then(function (user) {
          // Student workspace is for student accounts only. Admins and
          // teachers must use the admin portal â€” reject before any session
          // is persisted so no stale admin session lingers here.
          var authNS0 = window.Auth || {};
          var roleCheck = window.isStudentLikeUser || authNS0.isStudentLikeUser;
          var effectiveRole =
            typeof roleCheck === 'function'
              ? (roleCheck(user) ? 'student' : String(user.role || ''))
              : String(user.role || '');
          if (effectiveRole !== 'student') {
            showMsg('Only student accounts can sign in here. Admins and teachers must use the admin portal.', 'error');
            return;
          }

          var session = buildSession(user, loginToken, remember);
          persistSession(session, remember);
          sessionEnded = false;
          startSessionWatchdog();

	        // Apply the user to auth.js BEFORE notifying anyone. The bridge
	        // previously persisted the session but left Auth.getCurrentUser()
	        // null, so the `auth:changed` handlers re-ran renderWorkspace with
	        // no context and re-opened the sign-in modal right after the
	        // bridge had just hidden it â€” the "modal persists after login" bug.
	        var authNSApply = window.Auth || {};
	        if (typeof authNSApply.setCurrentUser === 'function') {
	          try { authNSApply.setCurrentUser(user, session); } catch (e) {
	            console.warn('[legacy-auth] setCurrentUser failed:', e);
	          }
	        }

	        // Re-prime the legacy-bridge cache with the now-authenticated user's
        // tenant data so the student UI has fresh state without waiting for
        // a page reload. Fire-and-forget â€” UI hooks below still run.
        if (typeof window.__legacyBridgeBootstrap === 'function') {
          window.__legacyBridgeBootstrap().catch(function () { /* best effort */ });
        }

        // Drive the post-login UI. auth.js exposes these both as flat globals
        // and under window.Auth depending on version â€” resolve at call time
        // via either so a stale script on one side never leaves the modal open.
        // Each call is isolated so a throw in one never skips the rest (a
        // single failure used to leave the modal open and the workspace blank).
        var authNS = window.Auth || {};
        var notifyAuth = window.notifyAuthChange || authNS.notifyAuthChange;
        var applyAuthUI = window.applyStudentAuthUI || authNS.applyStudentAuthUI;
        var hideModal = window.hideStudentAuthModal || authNS.hideStudentAuthModal;
        if (typeof notifyAuth === 'function') {
          try { notifyAuth(); } catch (e) { console.warn('[legacy-auth] notifyAuthChange failed:', e); }
        }
        if (typeof applyAuthUI === 'function') {
          try { applyAuthUI(user); } catch (e) { console.warn('[legacy-auth] applyStudentAuthUI failed:', e); }
        }
        if (typeof hideModal === 'function') {
          try { hideModal(); } catch (e) { console.warn('[legacy-auth] hideStudentAuthModal failed:', e); }
        }

        showMsg('Login successful', 'success');
        returnToKidsAfterStudentLogin();
      }).catch(function (err) {
        if (err && err.code === 'SESSION_ACTIVE') {
          form.dataset.loggingIn = '';
          var shown = showSessionConflictConfirm(form, function () {
            form.dataset.loggingIn = 'true';
            attempt(true);
          });
          if (!shown) {
            showMsg(err.message || 'Already signed in on another device or tab.', 'error');
          }
          return;
        }
        showMsg((err && err.message) || 'Invalid username or password', 'error');
        form.dataset.loggingIn = '';
      });
      };
      attempt(false).catch(function (err) {
        form.dataset.loggingIn = '';
        showMsg('Connection error: ' + (err.message || 'network error'), 'error');
      });
    }, true); // capture=true
  }

  // â”€â”€ Override logout to call API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function overrideLogout() {
    if (typeof window.authLogout === 'function') {
      var origLogout = window.authLogout;
      window.authLogout = function () {
        // Call API logout (fire-and-forget). Name this portal so the server
        // only revokes THIS portal's refresh cookie â€” the other portal's tab
        // (e.g. a student workspace in the same browser) keeps its session.
        var portal = null;
        try {
          var s = JSON.parse(sessionStorage.getItem('quizSession') || 'null');
          var role = String((s && s.role) || '').toLowerCase();
          portal = role === 'student' ? 'student' : 'admin';
        } catch (_) {}
        fetch(baseUrl + '/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (window.__authToken || ''),
          },
          body: JSON.stringify(portal ? { portal: portal } : {}),
        }).catch(function () { /* ignore */ });

        // Clear legacy tokens. Both the shared unscoped keys and this
        // session's role-scoped copies â€” a logout must not leave any stale
        // identity behind for either portal to rehydrate from.
        try {
          var activeRole = '';
          try {
            var s = JSON.parse(sessionStorage.getItem('quizSession') || 'null');
            activeRole = String((s && s.role) || '').toLowerCase();
          } catch (_) {}
          localStorage.removeItem('quizSession');
          sessionStorage.removeItem('quizSession');
          localStorage.removeItem('quizSessionRemember');
          localStorage.removeItem('quizAuthToken');
          localStorage.removeItem('quizCurrentUser');
          sessionStorage.removeItem('adminLoggedIn');
          ['admin', 'student', 'teacher', 'super_admin', 'user'].forEach(function (r) {
            localStorage.removeItem('quizSession:' + r);
            localStorage.removeItem('quizAuthToken:' + r);
            localStorage.removeItem('quizCurrentUser:' + r);
          });
          if (activeRole) {
            localStorage.removeItem('quizCurrentUser:' + activeRole);
          }
        } catch (_) {}

        window.__authToken = null;
        window.location.href = '/';
      };
    }
  }

  // â”€â”€ Init on DOMContentLoaded â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function init() {
    bindAdminLogin();
    bindStudentLogin();
    overrideLogout();
    // Resume supervising an already-signed-in tab (reload, second page).
    try {
      if (
        window.__authToken ||
        sessionStorage.getItem('quizSession')
      ) {
        startSessionWatchdog();
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

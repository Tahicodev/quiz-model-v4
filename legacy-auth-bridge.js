/**
 * legacy-auth-bridge.js — SaaS-only auth wiring for the legacy MPA pages
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

  // ── Helper: show toast if available ─────────────────────────────────────────
  function showMsg(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
    } else {
      console.log('[' + type + '] ' + msg);
    }
  }

  // ── Helper: replace a form element to strip old event listeners ─────────────
  function replaceForm(id) {
    var form = document.getElementById(id);
    if (!form) return null;
    var clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);
    return clone;
  }

  // ── Build session object in the format auth.js expects ──────────────────────
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

  // ── Persist session in the format auth.js expects ───────────────────────────
  function persistSession(session, remember) {
    try {
      // auth.js reads the active session from sessionStorage and the
      // remembered session from localStorage. Keep both stores in the shape
      // expected by the legacy UI while retaining the API token.
      sessionStorage.setItem('quizSession', JSON.stringify(session));
      localStorage.setItem('quizSession', JSON.stringify(session));
      if (remember) {
        localStorage.setItem('quizSessionRemember', JSON.stringify(session));
      } else {
        localStorage.removeItem('quizSessionRemember');
      }
      // Also set the auth token in the legacy format
      if (session.token) {
        localStorage.setItem('quizAuthToken', session.token);
      }
      if (session.userId) {
        var currentUser = {
          id: session.userId,
          username: session.username,
          name: session.name || session.username,
          role: session.role,
          status: 'active',
        };
        localStorage.setItem('quizCurrentUser', JSON.stringify(currentUser));

        // Seed the local auth view immediately. The SaaS preload is
        // asynchronous, while auth.js validates a session synchronously on
        // the next page load.
        var users = [];
        try { users = JSON.parse(localStorage.getItem('quizUsers') || '[]'); } catch (_) {}
        if (!Array.isArray(users)) users = [];
        var found = false;
        users = users.map(function (user) {
          if (user && user.id === currentUser.id) {
            found = true;
            return Object.assign({}, user, currentUser);
          }
          return user;
        });
        if (!found) users.push(currentUser);
        localStorage.setItem('quizUsers', JSON.stringify(users));
      }
      // Store token for the API repo
      window.__authToken = session.token;
    } catch (e) {
      console.warn('[legacy-auth] persistSession error:', e);
    }
  }

  // ── Fetch the full user record from bootstrap and merge it into the seed ──
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
      .catch(function () { return user; }); // best effort — never block login
  }

  // ── Bind admin login form ───────────────────────────────────────────────────
  function bindAdminLogin() {
    var form = replaceForm('authLoginForm');
    if (!form) return;

    // Flag so auth.js (or any legacy handler) can detect the bridge owns this
    // form and skip its own localStorage-based login. auth.js may still have
    // attached listeners *before* us if it ran first; the clone above strips
    // them, but belt-and-braces: also mark the form.
    form.setAttribute('data-bridge-owned', 'true');
    window.__AUTH_BRIDGE_OWNS_LOGIN__ = true;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var username = (this.querySelector('[data-auth="username"]') || {}).value;
      var password = (this.querySelector('[data-auth="password"]') || {}).value;
      var remember = (this.querySelector('[data-auth="remember"]') || {}).checked;

      if (!username || !password) {
        showMsg('Please enter your username and password', 'error');
        return;
      }

      try {
        var res = await fetch(baseUrl + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password: password }),
          credentials: 'include',
        });

        if (!res.ok) {
          var errBody;
          try { errBody = await res.json(); } catch (_) { errBody = {}; }
          showMsg(errBody?.error?.message || 'Invalid username or password', 'error');
          return;
        }

        var data = await res.json();
        var user = data.user || data;
        var token = data.accessToken || data.token || '';

        var session = buildSession(user, token, remember);
        persistSession(session, remember);
        sessionStorage.setItem('adminLoggedIn', 'true');
        // Clear the gate classes so hideAuthModal state is clean post-reload.
        try {
          document.documentElement.classList.remove('auth-pending', 'auth-ready');
        } catch (_) {}

        showMsg('Login successful', 'success');
        window.location.reload();
      } catch (err) {
        showMsg('Connection error: ' + err.message, 'error');
      }
    }, true); // capture=true so this runs before any non-capture listener
  }

  // ── Bind student login form ────────────────────────────────────────────────
  function bindStudentLogin() {
    var form = replaceForm('studentLoginForm');
    if (!form) return;

    form.setAttribute('data-bridge-owned', 'true');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var username = (this.querySelector('[data-auth="username"]') || {}).value;
      var password = (this.querySelector('[data-auth="password"]') || {}).value;
      var remember = (this.querySelector('[data-auth="remember"]') || {}).checked;

      if (!username || !password) {
        showMsg('Please enter your username and password', 'error');
        return;
      }

      try {
        var res = await fetch(baseUrl + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password: password }),
          credentials: 'include',
        });

        if (!res.ok) {
          var errBody;
          try { errBody = await res.json(); } catch (_) { errBody = {}; }
          showMsg(errBody?.error?.message || 'Invalid username or password', 'error');
          return;
        }

        var data = await res.json();
        var user = data.user || data;
        var token = data.accessToken || data.token || '';

        // Fetch the full user record (with classId/studentNumber/className)
        // before persisting or notifying the UI, so the student workspace
        // renders the real profile instead of an empty shell.
        user = await hydrateFullUser(user, token);

        var session = buildSession(user, token, remember);
        persistSession(session, remember);

        // Re-prime the legacy-bridge cache with the now-authenticated user's
        // tenant data so the student UI has fresh state without waiting for
        // a page reload. Fire-and-forget — UI hooks below still run.
        if (typeof window.__legacyBridgeBootstrap === 'function') {
          window.__legacyBridgeBootstrap().catch(function () { /* best effort */ });
        }

        // Drive the post-login UI. auth.js exposes these both as flat globals
        // and under window.Auth depending on version — resolve at call time
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
      } catch (err) {
        showMsg('Connection error: ' + err.message, 'error');
      }
    }, true); // capture=true
  }

  // ── Override logout to call API ────────────────────────────────────────────
  function overrideLogout() {
    if (typeof window.authLogout === 'function') {
      var origLogout = window.authLogout;
      window.authLogout = function () {
        // Call API logout (fire-and-forget)
        fetch(baseUrl + '/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Authorization': 'Bearer ' + (window.__authToken || '') },
        }).catch(function () { /* ignore */ });

        // Clear legacy tokens
        try {
          localStorage.removeItem('quizSession');
          sessionStorage.removeItem('quizSession');
          localStorage.removeItem('quizSessionRemember');
          localStorage.removeItem('quizAuthToken');
          localStorage.removeItem('quizCurrentUser');
          sessionStorage.removeItem('adminLoggedIn');
        } catch (_) {}

        window.__authToken = null;
        window.location.href = '/';
      };
    }
  }

  // ── Init on DOMContentLoaded ───────────────────────────────────────────────
  function init() {
    bindAdminLogin();
    bindStudentLogin();
    overrideLogout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

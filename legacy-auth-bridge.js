/**
 * legacy-auth-bridge.js
 *
 * Auth bridge for SaaS mode. Intercepts login form submissions and
 * routes them through the backend API instead of localStorage.
 *
 * Load this AFTER auth.js so the DOM event listeners are already
 * attached; it will clone-replace the login forms to remove the
 * original listeners before attaching API-aware ones.
 *
 * In local mode this script is a no-op.
 */

(function () {
  'use strict';

  if (window.__AUTH_BRIDGE__) return;
  window.__AUTH_BRIDGE__ = true;

  var mode = (window.APP_CONFIG && window.APP_CONFIG.mode) || 'local';
  if (mode !== 'saas') return;

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

  // ── Bind admin login form ───────────────────────────────────────────────────
  function bindAdminLogin() {
    var form = replaceForm('authLoginForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

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

        showMsg('Login successful', 'success');
        window.location.reload();
      } catch (err) {
        showMsg('Connection error: ' + err.message, 'error');
      }
    });
  }

  // ── Bind student login form ────────────────────────────────────────────────
  function bindStudentLogin() {
    var form = replaceForm('studentLoginForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

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

        // Notify auth change (auth.js exposes this)
        if (typeof window.notifyAuthChange === 'function') {
          window.notifyAuthChange();
        }
        if (typeof window.applyStudentAuthUI === 'function') {
          window.applyStudentAuthUI(user);
        }
        if (typeof window.hideStudentAuthModal === 'function') {
          window.hideStudentAuthModal();
        }

        showMsg('Login successful', 'success');
      } catch (err) {
        showMsg('Connection error: ' + err.message, 'error');
      }
    });
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

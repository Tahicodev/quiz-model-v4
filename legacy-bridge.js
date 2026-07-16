/**
 * legacy-bridge.js
 *
 * Bridge that initializes `window.__DI_CONTAINER__` — the synchronous
 * repository interface that the refactored legacy management files use
 * instead of raw localStorage calls.
 *
 * Two modes (controlled by window.APP_CONFIG.mode):
 *
 *   local  — wraps native localStorage (default, no network needed)
 *   saas   — uses the REST API; data is cached in both memory + localStorage
 *            for synchronous access. An async preloader fetches from the
 *            backend so that by the time UI sections initialize the data is
 *            available locally.
 *
 * Load this script SYNCHRONOUSLY (without `defer`) before any management
 * script so that __DI_CONTAINER__ is defined when they execute.
 */

(function () {
  'use strict';

  if (window.__DI_CONTAINER__) return; // already initialised

  // ── Entity → localStorage key mapping (identical to LocalStorageRepository) ──
  var STORE_KEYS = {
    users:              'quizUsers',
    classes:            'quizClasses',
    categories:         'quizCategories',
    questions:          'quizQuestions',
    exams:              'quizExams',
    results:            'quizResults',
    games:              'quizGames',
    tournaments:        'quizTournaments',
    exam_sessions:      'quizExamSessions',
    settings:           'quizSettings',
    audit_logs:         'quizAuditLogs',
    exam_questions:     'quizExamQuestions',
    exam_classes:       'quizExamClasses',
    game_sessions:      'quizGameSessions',
    tournament_entries: 'quizTournamentEntries',
    refresh_tokens:     'quizRefreshTokens',
  };

  // Reverse mapping: localStorage key → entity name
  var KEY_TO_ENTITY = {};
  for (var e in STORE_KEYS) {
    if (STORE_KEYS.hasOwnProperty(e)) {
      KEY_TO_ENTITY[STORE_KEYS[e]] = e;
    }
  }

  // ── Save references to native localStorage methods BEFORE patching them ──────
  // so our internal helpers don't trigger the proxy.
  var _origGetItem = Storage.prototype.getItem;
  var _origSetItem = Storage.prototype.setItem;

  // ── Sync helpers (used by both modes) ────────────────────────────────────────

  function readAll(table) {
    var key = STORE_KEYS[table] || table;
    try {
      return JSON.parse(_origGetItem.call(localStorage, key) || '[]');
    } catch (_) { return []; }
  }

  function writeAll(table, data) {
    var key = STORE_KEYS[table] || table;
    _origSetItem.call(localStorage, key, JSON.stringify(data));
  }

  function findById(table, id) {
    return readAll(table).find(function (i) { return i.id === id; }) || null;
  }

  // ── Local-mode repo (pure localStorage) ──────────────────────────────────────

  function createLocalRepo() {
    return {
      getAll_sync:  readAll,
      getById_sync: findById,
      setAll_sync:  writeAll,
    };
  }

  // ── SaaS-mode repo (memory cache + API sync) ─────────────────────────────────

  function createSaaSRepo() {
    // In-memory cache for synchronous reads.
    var cache = {};
    var syncInProgress = false;
    var syncPromise = null;

    // Seed from whatever is already in localStorage (e.g., from a previous session).
    for (var t in STORE_KEYS) {
      if (STORE_KEYS.hasOwnProperty(t)) {
        cache[t] = readAll(t);
      }
    }

    function getBaseUrl() {
      return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
    }

    // ── Fetch all data from the backend and populate cache + localStorage ──────
    function fetchAll() {
      if (syncPromise) return syncPromise;

      syncInProgress = true;
      syncPromise = fetch(getBaseUrl() + '/migrate/export', {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + (window.__authToken || '') },
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Preload failed: ' + r.status);
          return r.json();
        })
        .then(function (payload) {
          var data = payload && payload.data;
          if (!data) return;
          for (var table in data) {
            if (data.hasOwnProperty(table) && Array.isArray(data[table])) {
              cache[table] = data[table];
              writeAll(table, data[table]);
            }
          }
          syncInProgress = false;
        })
        .catch(function (err) {
          syncInProgress = false;
          console.warn('[legacy-bridge] Preload failed, using localStorage fallback:', err);
          // If fetch fails, keep whatever was in cache/localStorage.
        });
      return syncPromise;
    }

    // ── Sync a single table back to the API ─────────────────────────────────────
    function syncToApi(table, items) {
      var url = getBaseUrl() + '/' + table;
      // Fire-and-forget: legacy code doesn't need to wait.
      // For simplicity, if the array is empty skip.
      if (!items || items.length === 0) return;

      // Ideally we'd PUT the whole array, but the API supports CRUD per-item.
      // For the scope of this bridge we rely on the fact that most writes
      // are handled by the new service layer; this is a safety net.
      fetch(url + '/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (window.__authToken || ''),
        },
        body: JSON.stringify({ items: items }),
      }).catch(function (err) {
        console.warn('[legacy-bridge] syncToApi failed for ' + table, err);
      });
    }

    // Start preload immediately (fire-and-forget).
    fetchAll();

    return {
      getAll_sync: function (table) {
        // Always prefer cache (populated by fetchAll or local writes).
        if (cache[table] !== undefined) return cache[table];
        return readAll(table);
      },

      getById_sync: function (table, id) {
        var items = this.getAll_sync(table);
        return items.find(function (i) { return i.id === id; }) || null;
      },

      setAll_sync: function (table, data) {
        cache[table] = data;
        writeAll(table, data);
        // Fire-and-forget sync to API.
        syncToApi(table, data);
      },
    };
  }

  // ── Select implementation based on mode ──────────────────────────────────────
  var mode = (window.APP_CONFIG && window.APP_CONFIG.mode) || 'local';
  var repo = mode === 'saas' ? createSaaSRepo() : createLocalRepo();

  window.__DI_CONTAINER__ = { repo: repo };

  // ── Legacy-auth token shim ────────────────────────────────────────────────────
  // The new AuthService stores tokens differently. The legacy code reads
  // localStorage.ensure('quizAuthToken') and localStorage.ensure('quizCurrentUser').
  // In SaaS mode the bridge can optionally populate these from the preload.
  // We leave them to be populated by the login flow; the bridge only ensures
  // the __DI_CONTAINER__ contract is met.

  // ── Intercept remaining direct localStorage calls for known keys ────────────
  // Some low-level code may still call localStorage.getItem/setItem directly.
  // We monkey-patch the Storage prototype so that known quiz keys also flow
  // through the repo, keeping cache coherent.
  (function patchLocalStorage() {
    Storage.prototype.getItem = function (key) {
      var entity = KEY_TO_ENTITY[key];
      if (entity && window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) {
        var items = window.__DI_CONTAINER__.repo.getAll_sync(entity);
        return JSON.stringify(items);
      }
      return _origGetItem.call(this, key);
    };

    Storage.prototype.setItem = function (key, value) {
      var entity = KEY_TO_ENTITY[key];
      if (entity && window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) {
        try {
          var parsed = JSON.parse(value);
          window.__DI_CONTAINER__.repo.setAll_sync(entity, parsed);
        } catch (_) {
          // Not JSON — pass through to native
          _origSetItem.call(this, key, value);
        }
        return;
      }
      _origSetItem.call(this, key, value);
    };
  })();
})();

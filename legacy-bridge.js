/**
 * legacy-bridge.js — SaaS-only compatibility shim
 *
 * Initializes `window.__DI_CONTAINER__` with a cache-backed repository that
 * the legacy management scripts (admin-main.js, category-management.js, …)
 * use in place of raw localStorage. In this build:
 *
 *   - All persistence ultimately goes through the SaaS REST API
 *     (`/api/v1/<table>`, `/api/v1/bulk/<table>`).
 *   - On startup, a one-shot bootstrap GET `/api/v1/bootstrap` downloads the
 *     caller's tenant data into an in-memory cache + localStorage so the
 *     legacy synchronous reads stay correct.
 *   - localStorage is a read-through/write-through cache only — never the
 *     source of truth. The backend is.
 *
 * Load this script SYNCHRONOUSLY (without `defer`) before any management
 * script so that __DI_CONTAINER__ is defined when they execute.
 */

(function () {
  'use strict';

  if (window.__DI_CONTAINER__) return; // already initialised

  // ── Entity → localStorage key mapping ─────────────────────────────────────
  // Kept stable because legacy code reads these keys directly elsewhere.
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
    activity:               'quizActivity',
    gamification:           'quizGamification',
    tournament_history:     'quizTournamentsHistory',
    game_presets:           'gamePresets',
    profile_requests:       'quizProfileRequests',
    account_requests:       'quizAccountRequests',
    notifications:          'adminNotifications',
    teacher_messages:       'teacherMessages',
    teacher_assignments:    'teacherAssignments',
    profile_requests_legacy: 'adminProfileRequests',
  };

  // Reverse mapping: localStorage key → entity name
  var KEY_TO_ENTITY = {};
  for (var e in STORE_KEYS) {
    if (STORE_KEYS.hasOwnProperty(e)) {
      KEY_TO_ENTITY[STORE_KEYS[e]] = e;
    }
  }

  // ── Stores that hold a single object (not an array table) ──────────────────
  var OBJECT_STORES = {
    gamification: true,
  };

  // ── Save references to native localStorage methods BEFORE patching them ──────
  // so our internal helpers don't trigger the proxy.
  var _origGetItem = Storage.prototype.getItem;
  var _origSetItem = Storage.prototype.setItem;
  var _origRemoveItem = Storage.prototype.removeItem;

  // ── Sync helpers (cache + localStorage mirror) ───────────────────────────────

  function readAll(table) {
    var key = STORE_KEYS[table] || table;
    try {
      return JSON.parse(_origGetItem.call(localStorage, key) || '[]');
    } catch (_) { return []; }
  }

  // Object-tolerant read — returns the raw parsed JSON (array OR object).
  function readValue(table, fallback) {
    var key = STORE_KEYS[table] || table;
    try {
      var raw = _origGetItem.call(localStorage, key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (_) { return fallback; }
  }

  function writeAll(table, data) {
    var key = STORE_KEYS[table] || table;
    _origSetItem.call(localStorage, key, JSON.stringify(data));
  }

  function removeAll(table) {
    var key = STORE_KEYS[table] || table;
    try {
      _origRemoveItem.call(localStorage, key);
    } catch (_) { /* ignore */ }
  }

  function findById(table, id) {
    return readAll(table).find(function (i) { return i.id === id; }) || null;
  }

  function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ── Per-record mutations (array-typed tables only) ──────────────────────────
  function createRecord(table, data) {
    var items = readAll(table);
    var now = new Date().toISOString();
    var record = Object.assign({}, data, {
      id: (data && data.id) || genId(),
      created_at: (data && data.created_at) || now,
      updated_at: (data && data.updated_at) || now,
    });
    items.push(record);
    writeAll(table, items);
    return record;
  }

  function updateRecord(table, id, patch) {
    var items = readAll(table);
    var idx = items.findIndex(function (i) { return i.id === id; });
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch, {
      id: id,
      updated_at: new Date().toISOString(),
    });
    writeAll(table, items);
    return items[idx];
  }

  function deleteRecord(table, id) {
    var items = readAll(table);
    var filtered = items.filter(function (i) { return i.id !== id; });
    if (filtered.length === items.length) return false;
    writeAll(table, filtered);
    return true;
  }

  // ── SaaS repo (memory cache + API sync) ─────────────────────────────────────

  function createSaaSRepo() {
    var cache = {};

    // Seed from whatever is already in localStorage (from a prior preload).
    for (var t in STORE_KEYS) {
      if (STORE_KEYS.hasOwnProperty(t)) {
        cache[t] = readAll(t);
      }
    }

    function getBaseUrl() {
      return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
    }

    function getToken() {
      return window.__authToken || '';
    }

    // ── Fetch all data from the backend and populate cache + localStorage ──────
    // Skipped silently when no token is present (anonymous landing page) — the
    // cached data, if any, remains visible; the bootstrap re-runs after login
    // via window.__legacyBridgeBootstrap().
    function fetchAll() {
      var token = getToken();
      if (!token) {
        // Anonymous — nothing to bootstrap. Leave the cache as-is.
        return Promise.resolve();
      }
      return fetch(getBaseUrl() + '/bootstrap', {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + token },
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Bootstrap failed: ' + r.status);
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
        })
        .catch(function (err) {
          // If the bootstrap fails (e.g. token expired between page load and
          // fetch), keep whatever was in cache/localStorage. The next login
          // cycle will re-bootstrap cleanly.
          console.warn('[legacy-bridge] Bootstrap failed, using cached data:', err.message);
        });
    }

    // ── Sync a single change back to the API ──────────────────────────────────
    //   'bulk'   → POST   /api/v1/bulk/<table>      { items | value }
    //   'create' → POST   /api/v1/<table>           <record>
    //   'update' → PATCH  /api/v1/<table>/<id>      <patch>
    //   'delete' → DELETE /api/v1/<table>/<id>
    // Fire-and-forget: failures are logged but the cache has already been
    // updated synchronously, so the UI stays correct; a later bootstrap will
    // reconcile against the server.
    function syncToApi(table, payload, kind) {
      var base = getBaseUrl() + '/' + table;
      var init = {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken(),
        },
      };

      if (kind === 'create') {
        init.method = 'POST';
        init.body = JSON.stringify(payload);
        fire(base, init, table);
      } else if (kind === 'update') {
        init.method = 'PATCH';
        init.body = JSON.stringify(payload.patch);
        fire(base + '/' + encodeURIComponent(payload.id), init, table);
      } else if (kind === 'delete') {
        init.method = 'DELETE';
        fire(base + '/' + encodeURIComponent(payload.id), init, table);
      } else {
        // 'bulk' — used by setAll_sync / setValue_sync.
        if (!payload || (Array.isArray(payload) && payload.length === 0)) return;
        init.method = 'POST';
        var body = Array.isArray(payload) ? { items: payload } : { value: payload };
        init.body = JSON.stringify(body);
        fire(getBaseUrl() + '/bulk/' + encodeURIComponent(table), init, table);
      }
    }

    function fire(url, init, table) {
      fetch(url, init).catch(function (err) {
        console.warn('[legacy-bridge] syncToApi failed for ' + table, err);
      });
    }

    // Kick off the one-shot bootstrap immediately (no-op if anonymous).
    fetchAll();

    // Expose a re-bootstrap hook so login flows can re-prime the cache once a
    // token becomes available without forcing a full page reload.
    window.__legacyBridgeBootstrap = fetchAll;

    return {
      getAll_sync: function (table) {
        if (cache[table] !== undefined) return cache[table];
        return readAll(table);
      },

      getById_sync: function (table, id) {
        var items = this.getAll_sync(table);
        return items.find(function (i) { return i.id === id; }) || null;
      },

      getValue_sync: function (table, fallback) {
        var cached = cache[table];
        if (cached !== undefined && cached !== null) return cached;
        return readValue(table, fallback);
      },

      setAll_sync: function (table, data) {
        cache[table] = data;
        writeAll(table, data);
        syncToApi(table, data, 'bulk');
      },

      setValue_sync: function (table, value) {
        cache[table] = value;
        writeAll(table, value);
        syncToApi(table, value, 'bulk');
      },

      create_sync: function (table, data) {
        var record = createRecord(table, data);
        cache[table] = readAll(table);
        syncToApi(table, record, 'create');
        return record;
      },

      update_sync: function (table, id, patch) {
        var updated = updateRecord(table, id, patch);
        if (updated) {
          cache[table] = readAll(table);
          syncToApi(table, { id: id, patch: patch }, 'update');
        }
        return updated;
      },

      delete_sync: function (table, id) {
        var removed = deleteRecord(table, id);
        if (removed) {
          cache[table] = readAll(table);
          syncToApi(table, { id: id }, 'delete');
        }
        return removed;
      },

      remove_sync: function (table) {
        delete cache[table];
        removeAll(table);
        // No remote drop endpoint — legacy "clear after merge" flows are local
        // only; the next bootstrap refresh reconciles.
      },
    };
  }

  // ── Restore any previously-minted access token so the bootstrap can auth ────
  if (!window.__authToken) {
    try {
      var savedSession = JSON.parse(_origGetItem.call(localStorage, 'quizSession') || 'null');
      window.__authToken = savedSession && savedSession.token;
    } catch (_) { /* ignore malformed legacy sessions */ }
    if (!window.__authToken) {
      window.__authToken = _origGetItem.call(localStorage, 'quizAuthToken') || '';
    }
  }

  window.__DI_CONTAINER__ = { repo: createSaaSRepo() };

  // ── Intercept remaining direct localStorage calls for known keys ────────────
  // Some legacy code still calls localStorage.getItem/setItem directly. We
  // monkey-patch the Storage prototype so that known quiz keys also flow
  // through the repo, keeping the cache coherent.
  (function patchLocalStorage() {
    Storage.prototype.getItem = function (key) {
      var entity = KEY_TO_ENTITY[key];
      if (entity && window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) {
        var repo = window.__DI_CONTAINER__.repo;
        if (OBJECT_STORES[entity] && typeof repo.getValue_sync === 'function') {
          var val = repo.getValue_sync(entity, null);
          return val === null || val === undefined ? null : JSON.stringify(val);
        }
        return JSON.stringify(repo.getAll_sync(entity));
      }
      return _origGetItem.call(this, key);
    };

    Storage.prototype.setItem = function (key, value) {
      var entity = KEY_TO_ENTITY[key];
      if (entity && window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) {
        try {
          var parsed = JSON.parse(value);
          var repo = window.__DI_CONTAINER__.repo;
          if (OBJECT_STORES[entity] && typeof repo.setValue_sync === 'function') {
            repo.setValue_sync(entity, parsed);
          } else {
            repo.setAll_sync(entity, parsed);
          }
        } catch (_) {
          _origSetItem.call(this, key, value);
        }
        return;
      }
      _origSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function (key) {
      var entity = KEY_TO_ENTITY[key];
      if (entity && window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo) {
        var repo = window.__DI_CONTAINER__.repo;
        if (typeof repo.remove_sync === 'function') {
          repo.remove_sync(entity);
        }
        return;
      }
      _origRemoveItem.call(this, key);
    };
  })();
})();

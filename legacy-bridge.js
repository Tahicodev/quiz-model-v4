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
    // ── Operational keys added during the localStorage → repository migration ──
    // Real-data stores that previously bypassed the bridge. Values unchanged
    // so existing data is preserved; the monkey-patch below now intercepts
    // these too, keeping the in-memory cache coherent in SaaS mode.
    activity:               'quizActivity',
    gamification:           'quizGamification',
    tournament_history:     'quizTournamentsHistory',
    game_presets:           'gamePresets',
    profile_requests:       'quizProfileRequests',
    account_requests:       'quizAccountRequests',
    notifications:          'adminNotifications',
    teacher_messages:       'teacherMessages',
    teacher_assignments:    'teacherAssignments',
    // Legacy merge-source map used once by admin-main.js (cleared after merge).
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
  // The monkey-patch below picks the right repo method for these vs. array
  // tables so reads/writes return the original shape (object, not coerced []).
  var OBJECT_STORES = {
    gamification: true,
  };

  // ── Save references to native localStorage methods BEFORE patching them ──────
  // so our internal helpers don't trigger the proxy.
  var _origGetItem = Storage.prototype.getItem;
  var _origSetItem = Storage.prototype.setItem;
  var _origRemoveItem = Storage.prototype.removeItem;

  // ── Sync helpers (used by both modes) ────────────────────────────────────────

  function readAll(table) {
    var key = STORE_KEYS[table] || table;
    try {
      return JSON.parse(_origGetItem.call(localStorage, key) || '[]');
    } catch (_) { return []; }
  }

  // Object-tolerant read — returns the raw parsed JSON (array OR object).
  // Used for stores that hold a single object (gamification config, etc.)
  // rather than an array table. `readAll` always coerces to []; this never does.
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

  // Remove a key entirely (mirrors localStorage.removeItem semantics) while
  // keeping the cache coherent when in SaaS mode. Uses the native method
  // directly to avoid re-entering the patched removeItem (infinite recursion).
  function removeAll(table) {
    var key = STORE_KEYS[table] || table;
    try {
      _origRemoveItem.call(localStorage, key);
    } catch (_) { /* ignore */ }
  }

  function findById(table, id) {
    return readAll(table).find(function (i) { return i.id === id; }) || null;
  }

  // Simple unique-id generator (crypto when available, fallback to timestamp+rand).
  function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ── Per-record mutations (array-typed tables only) ──────────────────────────
  // Used by create_sync/update_sync/delete_sync. They mutate the table array,
  // persist via writeAll, and (in SaaS mode) fire a single endpoint call.
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

  // ── Local-mode repo (pure localStorage) ──────────────────────────────────────

  function createLocalRepo() {
    return {
      getAll_sync:  readAll,
      getById_sync: findById,
      setAll_sync:  writeAll,
      // Object-tolerant getter — returns raw parsed JSON or `fallback`.
      getValue_sync: function (table, fallback) {
        return readValue(table, fallback);
      },
      // Per-record mutations (array-typed tables only). In local mode they
      // just persist to localStorage — no network involved.
      create_sync: function (table, data) {
        return createRecord(table, data);
      },
      update_sync: function (table, id, patch) {
        return updateRecord(table, id, patch);
      },
      delete_sync: function (table, id) {
        return deleteRecord(table, id);
      },
      remove_sync: removeAll,
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
    // `kind` controls the endpoint shape:
    //   'bulk'   → POST   /api/v1/<table>/bulk  { items: array }        (setAll_sync)
    //   'create' → POST   /api/v1/<table>        <record>               (create_sync)
    //   'update' → PATCH  /api/v1/<table>/<id>   <patch>                (update_sync)
    //   'delete' → DELETE /api/v1/<table>/<id>                          (delete_sync)
    // All fire-and-forget; failures are swallowed (the cache/localStorage is
    // already updated synchronously, so the UI stays correct).
    function syncToApi(table, payload, kind) {
      var base = getBaseUrl() + '/' + table;
      var init = {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (window.__authToken || ''),
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
        // 'bulk' (default) — used by setAll_sync and setValue_sync.
        if (!payload || (Array.isArray(payload) && payload.length === 0)) return;
        init.method = 'POST';
        var body = Array.isArray(payload)
          ? { items: payload }
          : { value: payload }; // object store (e.g. gamification config)
        init.body = JSON.stringify(body);
        fire(base + '/bulk', init, table);
      }
    }

    function fire(url, init, table) {
      fetch(url, init).catch(function (err) {
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

      // Object-tolerant getter. Not cache-backed (the cache only holds arrays);
      // reads fresh so a preceding setValue_sync/setAll_sync is always visible.
      getValue_sync: function (table, fallback) {
        var cached = cache[table];
        if (cached !== undefined && cached !== null) return cached;
        return readValue(table, fallback);
      },

      setAll_sync: function (table, data) {
        cache[table] = data;
        writeAll(table, data);
        // Fire-and-forget sync to API (array shape).
        syncToApi(table, data, 'bulk');
      },

      // Object-valued store write (e.g. gamification config). Same persistence
      // path as setAll_sync but flagged so the legacy "clear after merge"
      // removeItem flows can call this with {} to clear cleanly.
      setValue_sync: function (table, value) {
        cache[table] = value;
        writeAll(table, value);
        syncToApi(table, value, 'bulk');
      },

      create_sync: function (table, data) {
        // Mutates the table array, persists locally (keeps cache coherent),
        // then fires a single-record POST.
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
        // No API call — there's no "drop table" endpoint; this just clears
        // the local copy (used by the legacy "clear after merge" flows).
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
        var repo = window.__DI_CONTAINER__.repo;
        // Object-typed stores must not be coerced to [] by getAll_sync.
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
          // Not JSON — pass through to native
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

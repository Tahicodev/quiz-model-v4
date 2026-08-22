/**
 * api-client.js — REST client for the legacy MPA pages
 *
 * Bridges the gap between the legacy management scripts (which were written
 * against localStorage) and the real backend REST API. Each legacy "save"
 * should call this client BEFORE (or instead of) writing to localStorage,
 * so the database becomes the source of truth.
 *
 * Endpoint conventions (see src/backend/routes/*.routes.js):
 *   POST   /api/v1/<entity>            create
 *   PATCH  /api/v1/<entity>/<id>       update
 *   DELETE /api/v1/<entity>/<id>       delete
 *
 * The client:
 *   - injects the current access token (window.__authToken) and handles 401
 *     refresh once via POST /api/v1/auth/refresh
 *   - maps legacy camelCase keys to the snake_case the Prisma schemas expect
 *   - throws on non-2xx with a parsed message so callers can surface it
 *
 * Load AFTER legacy-bridge.js (so window.__authToken is available) and BEFORE
 * the management scripts that call it.
 */

(function () {
  'use strict';

  if (window.API) return; // already loaded

  function getBaseUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
  }

  function getToken() {
    if (window.__authToken) return window.__authToken;
    try {
      var s = JSON.parse(localStorage.getItem('quizSession') || 'null');
      return (s && s.token) || localStorage.getItem('quizAuthToken') || '';
    } catch (_) {
      return localStorage.getItem('quizAuthToken') || '';
    }
  }

  function setToken(newToken) {
    if (!newToken) return;
    window.__authToken = newToken;
    authUnavailable = false;
    window.__AUTH_SESSION_EXPIRED__ = false;
    try {
      var s = JSON.parse(localStorage.getItem('quizSession') || 'null');
      if (s) {
        s.token = newToken;
        localStorage.setItem('quizSession', JSON.stringify(s));
        sessionStorage.setItem('quizSession', JSON.stringify(s));
      }
      localStorage.setItem('quizAuthToken', newToken);
    } catch (_) { /* non-fatal */ }
  }

  var refreshing = null;
  var authUnavailable = false;

  function invalidateAuthSession() {
    authUnavailable = true;
    window.__authToken = '';
    window.__AUTH_SESSION_EXPIRED__ = true;
    try {
      if (window.__QUIZ_LEGACY_SOCKET__) window.__QUIZ_LEGACY_SOCKET__.disconnect();
    } catch (_) { /* non-fatal */ }
    try {
      localStorage.removeItem('quizSession');
      localStorage.removeItem('quizSessionRemember');
      localStorage.removeItem('quizAuthToken');
      localStorage.removeItem('quizCurrentUser');
      sessionStorage.removeItem('quizSession');
    } catch (_) { /* non-fatal */ }
    try {
      window.dispatchEvent(new CustomEvent('quiz:auth-expired'));
    } catch (_) { /* non-fatal */ }
  }

  function refreshAccessToken() {
    if (refreshing) return refreshing;
    if (authUnavailable) {
      var blocked = new Error('Session expired');
      blocked.status = 401;
      return Promise.reject(blocked);
    }
    refreshing = fetch(getBaseUrl() + '/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(function (r) {
        if (!r.ok) {
          var err = new Error('Refresh failed (' + r.status + ')');
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then(function (data) {
        var t = data && (data.accessToken || data.token);
        if (!t) throw new Error('Refresh returned no token');
        setToken(t);
        return t;
      })
      .finally(function () {
        refreshing = null;
      });
    return refreshing;
  }

  function parseError(res, body) {
    try {
      var j = JSON.parse(body);
      return (
        (j && j.error && j.error.message) ||
        (j && j.message) ||
        body ||
        ('HTTP ' + res.status)
      );
    } catch (_) {
      return body || ('HTTP ' + res.status);
    }
  }

  function request(method, path, body, _retried) {
    var url = getBaseUrl() + path;
    var init = {
      method: method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      },
    };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (res) {
      if (res.status === 401 && !_retried) {
        return refreshAccessToken()
          .then(function () { return request(method, path, body, true); })
          .catch(function (err) {
            if (err && err.status === 401) invalidateAuthSession();
            throw err;
          });
      }
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        if (!res.ok) {
          var err = new Error(parseError(res, text));
          err.status = res.status;
          throw err;
        }
        if (!text) return null;
        try { return JSON.parse(text); } catch (_) { return text; }
      });
    });
  }

  // ─── Legacy → backend field mapping ─────────────────────────────────────
  // Each mapper takes the legacy object and returns the wire shape expected
  // by the REST endpoint. Unknown fields are dropped; missing required fields
  // cause the API to return a 4xx that we surface to the caller.
  var MAPPERS = {
    users: function (u) {
      var out = {
        username: u.username,
        name: u.name,
        role: u.role,
        status: u.status || 'active',
      };
      // Only send password when caller supplied a NEW one. The API bcrypts
      // it server-side; never send our client-side passwordHash.
      if (u.password) out.password = u.password;
      if (u.classId) out.class_id = u.classId;
      if (u.class_id) out.class_id = u.class_id;
      if (u.studentNumber) out.numero = u.studentNumber;
      if (u.numero) out.numero = u.numero;
      return out;
    },

    classes: function (c) {
      return {
        name: c.name,
        description: c.description || '',
      };
    },

    categories: function (c) {
      var out = {
        name: c.name,
      };
      if (c.icon != null) out.icon = String(c.icon);
      if (c.color != null) out.color = String(c.color);
      var parent = c.parent_id || c.parentId;
      if (parent) out.parent_id = String(parent);
      return out;
    },

    questions: function (q) {
      var TYPE_MAP = {
        'multiple-choice': 'mcq', 'mcq': 'mcq',
        'true-false': 'true-false', 'true_false': 'true-false',
        'matching-pairs': 'matching', 'matching': 'matching',
        'ordering': 'order', 'draggable': 'order', 'order': 'order',
        'fill-blank': 'fill-blank', 'fill_blank': 'fill-blank',
        // The legacy/AI UI supports code questions, while the Prisma schema
        // stores them as MCQ-compatible records with their answer metadata in
        // the legacy cache. Never send the unsupported "code" enum to Zod.
        'code': 'mcq',
      };
      var type = String(q.type || 'multiple-choice');
      var mappedType = TYPE_MAP[type] || 'mcq';

      var rawOptions = Array.isArray(q.optionData) && q.optionData.length
        ? q.optionData.map(function (o) { return typeof o === 'string' ? o : (o && o.text) || ''; })
        : (Array.isArray(q.options) ? q.options : []);
      var optionsJson = rawOptions.length ? JSON.stringify(rawOptions) : undefined;

      var answer = q.answer;
      if (typeof answer !== 'string') {
        answer = Array.isArray(answer) ? JSON.stringify(answer)
               : answer == null ? '' : String(answer);
      }

      var out = {
        type: mappedType,
        text: q.text || q.question || q.title || '',
        answer: answer,
        points: q.points != null ? Number(q.points) : 1,
        difficulty: q.difficulty || 'medium',
      };
      if (optionsJson !== undefined) out.options_json = optionsJson;
      if (q.explanation != null) out.explanation = String(q.explanation);
      if (q.instruction != null && !out.explanation) out.explanation = String(q.instruction);
      if (q.media_url) out.media_url = String(q.media_url);
      if (q.mediaUrl) out.media_url = String(q.mediaUrl);
      if (q.image && q.image !== '') out.media_url = String(q.image);
      if (q.tags != null) {
        out.tags = Array.isArray(q.tags) ? q.tags.join(',') : String(q.tags);
      }
      var cat = q.category_id || q.categoryId || q.category;
      // QuestionCreateSchema requires a UUID category FK. Legacy category
      // names and placeholders are display-only and must not be sent.
      if (cat && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(cat))) {
        out.category_id = String(cat);
      }
      return out;
    },

    exams: function (e) {
      var out = {
        name: e.name || e.title || 'Untitled exam',
        description: e.description || '',
        passing_score: e.passing_score != null ? Number(e.passing_score)
                     : e.passingScore != null ? Number(e.passingScore) : 50,
      };
      if (e.duration != null) out.duration = Number(e.duration);
      if (e.durationMinutes != null) out.duration = Number(e.durationMinutes);
      if (e.status != null) out.status = String(e.status);
      if (e.is_training != null) out.is_training = !!e.is_training;
      if (e.isTraining != null) out.is_training = !!e.isTraining;
      if (e.randomize != null) out.randomize = !!e.randomize;
      if (e.max_attempts != null) out.max_attempts = Number(e.max_attempts);
      if (e.maxAttempts != null) out.max_attempts = Number(e.maxAttempts);
      // Preserve legacy arrays in options_json so nothing is lost.
      var legacy = {};
      if (Array.isArray(e.questions)) legacy.questions = e.questions;
      if (Array.isArray(e.classes)) legacy.classes = e.classes;
      if (e.presetId != null) legacy.presetId = e.presetId;
      if (e.dateCreated != null) legacy.dateCreated = e.dateCreated;
      if (Object.keys(legacy).length > 0) out.options_json = JSON.stringify(legacy);
      return out;
    },

    games: function (g) {
      var status = String(g.status || 'waiting');
      if (status === 'open') status = 'waiting';
      else if (status === 'live') status = 'active';
      else if (status === 'completed') status = 'finished';
      else if (status !== 'active' && status !== 'paused' && status !== 'finished') status = 'waiting';
      var questionIds = Array.isArray(g.questions)
        ? g.questions.map(function (q) { return (q && (q.id || q.question_id)) || q; }).filter(Boolean)
        : (Array.isArray(g.question_ids) ? g.question_ids : []);
      var settings = Object.assign({}, g.settings || {});
      if (Array.isArray(g.classIds)) settings.classIds = g.classIds;
      if (g.session) settings.session = g.session;
      if (g.results) settings.results = g.results;
      if (g.lobbyCounter != null) settings.lobbyCounter = g.lobbyCounter;
      if (Array.isArray(g.lobbyHistory)) settings.lobbyHistory = g.lobbyHistory;
      return {
        name: g.name || 'Untitled game',
        type: g.type || g.mode || 'custom',
        status: status,
        settings_json: JSON.stringify(settings),
        question_ids: JSON.stringify(questionIds),
        join_code: g.joinCode || g.join_code || undefined,
      };
    },

    results: function (r) {
      return {
        exam_id: r.exam_id || r.examId,
        score: r.score != null ? Number(r.score) : 0,
        total_points: r.totalPoints != null ? Number(r.totalPoints) : 0,
        earned_points: r.earnedPoints != null ? Number(r.earnedPoints) : 0,
        answers_json: typeof r.answers_json === 'string' ? r.answers_json : JSON.stringify(r.answers || {}),
        mode: r.mode || 'exam',
        passed: r.passed != null ? !!r.passed : undefined,
      };
    },

    // ── Full-persistence stores (Phase 3) ────────────────────────────────
    'profile-requests': function (r) {
      var changes = r.changes_json != null ? r.changes_json : (r.changes || {});
      return {
        changes_json: typeof changes === 'string' ? changes : JSON.stringify(changes),
        avatar: r.avatar != null ? String(r.avatar) : undefined,
        note: r.note != null ? String(r.note) : undefined,
        snapshot_json: r.snapshot_json != null
          ? (typeof r.snapshot_json === 'string' ? r.snapshot_json : JSON.stringify(r.snapshot_json))
          : (r.snapshot != null ? JSON.stringify(r.snapshot) : undefined),
      };
    },

    'account-requests': function (r) {
      return {
        username: r.username,
        full_name: r.full_name || r.fullName || r.name,
        student_number: r.student_number || r.studentNumber || r.numero,
        password: r.password,
        class_id: r.class_id || r.classId || undefined,
        class_name: r.class_name || r.className || undefined,
        note: r.note != null ? String(r.note) : undefined,
      };
    },

    'game-presets': function (p2) {
      var rules = p2.rules_json != null ? p2.rules_json : (p2.rules || {});
      return {
        name: p2.name,
        game_type: p2.game_type || p2.gameType || p2.type,
        game_mode: p2.game_mode || p2.gameMode || p2.mode,
        rules_json: typeof rules === 'string' ? rules : JSON.stringify(rules),
        is_default: p2.is_default != null ? !!p2.is_default : (p2.isDefault != null ? !!p2.isDefault : false),
      };
    },

    notifications: function (n) {
      return {
        type: n.type || 'admin_notice',
        message: n.message || n.text || n.title || '',
        data: n.data != null ? n.data : (n.data_json != null ? n.data_json : undefined),
      };
    },

    gamification: function (g) {
      var out = {};
      if (g.exp_per_correct != null) out.exp_per_correct = Number(g.exp_per_correct);
      if (g.expPerCorrect != null) out.exp_per_correct = Number(g.expPerCorrect);
      if (g.exp_per_win != null) out.exp_per_win = Number(g.exp_per_win);
      if (g.expPerWin != null) out.exp_per_win = Number(g.expPerWin);
      if (g.auto_award_badges != null) out.auto_award_badges = !!g.auto_award_badges;
      if (g.autoAwardBadges != null) out.auto_award_badges = !!g.autoAwardBadges;
      return out;
    },

    'teacher-messages': function (m) {
      return {
        title: m.title,
        body: m.body || m.message || m.text,
        class_id: m.class_id || m.classId || undefined,
        class_name: m.class_name || m.className || undefined,
        date: m.date || m.createdAt || undefined,
      };
    },

    'teacher-assignments': function (a) {
      return {
        title: a.title,
        description: a.description != null ? String(a.description) : undefined,
        class_id: a.class_id || a.classId || undefined,
        due_date: a.due_date || a.dueDate || undefined,
      };
    },
  };

  function mapPayload(entity, data) {
    var mapper = MAPPERS[entity];
    return mapper ? mapper(data || {}) : (data || {});
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  window.API = {
    /** GET /api/v1/<entity>[?query] */
    list: function (entity, query) {
      var qs = '';
      if (query && typeof query === 'object') {
        var parts = [];
        for (var k in query) {
          if (query[k] != null && query[k] !== '') {
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
          }
        }
        if (parts.length) qs = '?' + parts.join('&');
      }
      return request('GET', '/' + entity + qs);
    },

    /** GET /api/v1/<entity>/<id> */
    get: function (entity, id) {
      return request('GET', '/' + entity + '/' + encodeURIComponent(id));
    },

    /** POST /api/v1/<entity> — payload is mapped through MAPPERS first. */
    create: function (entity, data) {
      return request('POST', '/' + entity, mapPayload(entity, data));
    },

    /** PATCH /api/v1/<entity>/<id> */
    update: function (entity, id, patch) {
      return request('PATCH', '/' + entity + '/' + encodeURIComponent(id), mapPayload(entity, patch));
    },

    /** DELETE /api/v1/<entity>/<id> */
    remove: function (entity, id) {
      return request('DELETE', '/' + entity + '/' + encodeURIComponent(id));
    },

    /** POST /api/v1/auth/login */
    login: function (username, password) {
      return request('POST', '/auth/login', { username: username, password: password });
    },

    /** GET /api/v1/bootstrap */
    bootstrap: function () {
      return request('GET', '/bootstrap');
    },

    /** Expose a raw request for arbitrary paths (e.g. custom routes). */
    raw: request,
  };
})();

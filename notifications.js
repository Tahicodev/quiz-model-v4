/**
 * notifications.js — role-scoped activity inbox.
 *
 * One server feed powers three surfaces:
 *   - the badge on the profile button
 *   - the 5 most recent activities in the profile menu
 *   - the Notifications tab
 *
 * Scoping is enforced by the server (`GET /api/v1/notifications/feed`):
 * admin = whole school, teacher = self + own classes/students, student = self.
 * The client never combines the badge with the admin-only Activity tab, so a
 * teacher no longer gets an "Access denied" toast by clicking the badge.
 */
(function () {
  'use strict';

  var state = {
    items: [],
    unread: 0,
    lastSeenAt: null,
    scope: '',
    filters: { search: '', type: '', role: '', user: '', period: '' },
    loading: false,
    loaded: false,
    error: '',
    lastFetchedAt: 0,
  };

  var refreshPromise = null;
  var pollTimer = null;

  var ICONS = {
    result:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
    exam:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    question:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    class:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    user:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 4-7 8-7s8 3 8 7"></path></svg>',
    auth:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>',
    device:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="12" rx="2"></rect><line x1="8" y1="20" x2="16" y2="20"></line><line x1="12" y1="16" x2="12" y2="20"></line></svg>',
    course:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
    game:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 8 4-16 3 8h4"></path></svg>',
    request:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
    default:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>',
  };

  var TARGET_SELECTORS = {
    result: function (id) {
      return document.querySelector('tr[data-result-id="' + cssEscape(id) + '"]');
    },
    question: function (id) {
      return document.querySelector('#question-list tbody tr[data-id="' + cssEscape(id) + '"]');
    },
    exam: function (id) {
      return document.querySelector('#examList [data-id="' + cssEscape(id) + '"]');
    },
    class: function (id) {
      return document.querySelector('#classList [data-id="' + cssEscape(id) + '"]');
    },
    category: function (id) {
      return document.querySelector('[data-category-id="' + cssEscape(id) + '"]');
    },
    subject: function (id) {
      return document.querySelector('#subjectTabBar [data-subject-id="' + cssEscape(id) + '"]');
    },
    course: function (id) {
      return document.querySelector('#courseList tbody tr[data-id="' + cssEscape(id) + '"]');
    },
    user: function (id) {
      return document.querySelector('#usersTableBody tr[data-user-id="' + cssEscape(id) + '"]');
    },
    game: function (id) {
      return document.querySelector('#gameList [data-game-id="' + cssEscape(id) + '"]');
    },
    tournament: function (id) {
      return document.querySelector('#tournamentList [data-tournament-id="' + cssEscape(id) + '"]');
    },
    device: function (id) {
      return document.querySelector('#devicesTableBody tr[data-id="' + cssEscape(id) + '"]');
    },
  };

  function cssEscape(value) {
    return String(value == null ? '' : value).replace(/["\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function iconFor(type) {
    if (type === 'profile_request' || type === 'account_request') return ICONS.request;
    return ICONS[type] || ICONS.default;
  }

  function roleLabel(role) {
    var map = {
      super_admin: 'Super admin',
      admin: 'Admin',
      teacher: 'Teacher',
      student: 'Student',
    };
    return map[String(role || '').toLowerCase()] || '';
  }

  function formatRelative(iso) {
    var date = new Date(iso || '');
    if (Number.isNaN(date.getTime())) return '';
    var diff = Date.now() - date.getTime();
    if (diff < 45 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + 'd ago';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function itemDetails(item) {
    return item && Array.isArray(item.details) ? item.details : [];
  }

  function detailSummary(item, max) {
    return itemDetails(item)
      .slice(0, max)
      .map(function (detail) {
        return String((detail && detail.value) || '').trim();
      })
      .filter(Boolean)
      .join(' • ');
  }

  function renderDetailTags(item) {
    var details = itemDetails(item).slice(0, 6);
    if (!details.length) return '';
    var html = details
      .map(function (detail) {
        var label = String((detail && detail.label) || '').trim();
        var value = String((detail && detail.value) || '').trim();
        if (!value) return '';
        return (
          '<span class="notification-tag">' +
          (label
            ? '<span class="notification-tag-label">' + escapeHtml(label) + '</span>'
            : '') +
          '<span class="notification-tag-value">' + escapeHtml(value) + '</span>' +
          '</span>'
        );
      })
      .join('');
    return html ? '<div class="notification-card-tags">' + html + '</div>' : '';
  }

  function apiAvailable() {
    return !!(window.API && typeof window.API.raw === 'function' && window.__authToken);
  }

  function hasSession() {
    try {
      return !!(
        window.__authToken ||
        sessionStorage.getItem('quizSession') ||
        localStorage.getItem('quizSession')
      );
    } catch (_) {
      return false;
    }
  }

  function entityTypeLabel(value) {
    var labels = {
      profile_request: 'Profile request',
      account_request: 'Account request',
      student_activity: 'Student activity',
    };
    var key = String(value || '');
    if (labels[key]) return labels[key];
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
  }

  function matchesPeriod(iso, period) {
    if (!period) return true;
    var date = new Date(iso || '');
    if (Number.isNaN(date.getTime())) return false;
    var now = new Date();
    if (period === 'today') {
      return date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (period === 'month') {
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    }
    var days = parseInt(period, 10);
    if (!Number.isFinite(days)) return true;
    return date >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  function filteredItems() {
    var filters = state.filters;
    return state.items.filter(function (item) {
      var actor = item.actor || {};
      var role = String(actor.role || '').toLowerCase();
      var type = String(item.entityType || item.type || '').toLowerCase();

      if (filters.type && type !== filters.type) return false;
      if (filters.role && role !== filters.role) return false;
      if (filters.user && String(actor.name || '') !== filters.user) return false;
      if (!matchesPeriod(item.createdAt, filters.period)) return false;
      if (filters.search) {
        var detailText = itemDetails(item)
          .map(function (detail) {
            return [detail.label, detail.value].filter(Boolean).join(' ');
          })
          .join(' ');
        var haystack = [
          item.title,
          item.description,
          item.type,
          item.entityType,
          item.entityName,
          detailText,
          actor.name,
          role,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (haystack.indexOf(filters.search) === -1) return false;
      }
      return true;
    });
  }

  function readFilterInputs() {
    return {
      search: String(document.getElementById('notificationsSearch')?.value || '')
        .trim()
        .toLowerCase(),
      type: String(document.getElementById('notificationsTypeFilter')?.value || ''),
      role: String(document.getElementById('notificationsRoleFilter')?.value || ''),
      user: String(document.getElementById('notificationsUserFilter')?.value || ''),
      period: String(document.getElementById('notificationsDateFilter')?.value || ''),
    };
  }

  function syncFilterOptions() {
    var typeSelect = document.getElementById('notificationsTypeFilter');
    if (typeSelect) {
      var seenTypes = {};
      var types = [];
      state.items.forEach(function (item) {
        var key = String(item.entityType || item.type || '').toLowerCase();
        if (!key || seenTypes[key]) return;
        seenTypes[key] = true;
        types.push({ key: key, label: entityTypeLabel(key) });
      });
      types.sort(function (a, b) {
        return a.label.localeCompare(b.label);
      });
      var typeSignature = types
        .map(function (type) {
          return type.key;
        })
        .join('\u0000');
      if (typeSelect.dataset.signature !== typeSignature) {
        typeSelect.innerHTML =
          '<option value="">All types</option>' +
          types
            .map(function (type) {
              return (
                '<option value="' +
                escapeHtml(type.key) +
                '">' +
                escapeHtml(type.label) +
                '</option>'
              );
            })
            .join('');
        typeSelect.dataset.signature = typeSignature;
        if (seenTypes[state.filters.type]) typeSelect.value = state.filters.type;
        else state.filters.type = '';
      }
    }

    var userSelect = document.getElementById('notificationsUserFilter');
    if (userSelect) {
      var seenUsers = {};
      var users = [];
      state.items.forEach(function (item) {
        var name = String((item.actor && item.actor.name) || '').trim();
        if (!name || seenUsers[name]) return;
        seenUsers[name] = true;
        users.push(name);
      });
      users.sort(function (a, b) {
        return a.localeCompare(b);
      });
      var userSignature = users.join('\u0000');
      if (userSelect.dataset.signature !== userSignature) {
        userSelect.innerHTML =
          '<option value="">All users</option>' +
          users
            .map(function (name) {
              return (
                '<option value="' +
                escapeHtml(name) +
                '">' +
                escapeHtml(name) +
                '</option>'
              );
            })
            .join('');
        userSelect.dataset.signature = userSignature;
        if (seenUsers[state.filters.user]) userSelect.value = state.filters.user;
        else state.filters.user = '';
      }
    }
  }

  function scopeLabel() {
    if (state.scope === 'school') return 'Whole school activity';
    if (state.scope === 'teacher') return 'Your activity, classes and students';
    return 'Your activity';
  }

  // ── Badge ──────────────────────────────────────────────────────────────
  function renderBadge() {
    var badge = document.getElementById('adminNotificationBadge');
    var inboxTab = document.querySelector('.nav-tab[data-tab="notifications"]');
    var count = Number(state.unread) || 0;

    if (badge) {
      badge.textContent = count > 99 ? '99+' : count > 0 ? String(count) : '';
      badge.classList.toggle('active', count > 0);
      badge.setAttribute(
        'title',
        count > 0 ? count + ' unread activit' + (count === 1 ? 'y' : 'ies') : 'No new activity',
      );
      badge.setAttribute(
        'aria-label',
        count > 0 ? count + ' unread notification' + (count === 1 ? '' : 's') : 'Notifications',
      );
    }
    if (inboxTab) inboxTab.classList.toggle('has-notification', count > 0);
  }

  // ── Profile-menu preview (5 most recent) ──────────────────────────────
  function renderMenu() {
    var list = document.getElementById('profileNotificationList');
    if (!list) return;

    if (!state.loaded && state.loading) {
      list.innerHTML = '<div class="profile-notification-empty">Loading activity…</div>';
      return;
    }
    if (!state.items.length) {
      list.innerHTML =
        '<div class="profile-notification-empty">' +
        (state.error ? 'Activity unavailable right now.' : 'No recent activity yet.') +
        '</div>';
      return;
    }

    var html = '';
    state.items.slice(0, 5).forEach(function (item, index) {
      var actor = item.actor || {};
      var meta = [roleLabel(actor.role), formatRelative(item.createdAt)]
        .filter(Boolean)
        .join(' • ');
      var tags = detailSummary(item, 2);
      var tooltip = [item.title, item.description, detailSummary(item, 6)]
        .filter(Boolean)
        .join(' — ');
      html +=
        '<button type="button" class="profile-notification-item' +
        (item.unread ? ' is-unread' : '') +
        '" data-notification-index="' + index + '" title="' + escapeHtml(tooltip) + '">' +
        '<span class="profile-notification-icon type-' + escapeHtml(item.entityType || item.type) + '">' +
        iconFor(item.type) +
        '</span>' +
        '<span class="profile-notification-body">' +
        '<span class="profile-notification-title">' + escapeHtml(item.title) + '</span>' +
        '<span class="profile-notification-meta">' + escapeHtml(meta) + '</span>' +
        (tags
          ? '<span class="profile-notification-tags">' + escapeHtml(tags) + '</span>'
          : '') +
        '</span>' +
        (item.unread ? '<span class="profile-notification-dot" aria-hidden="true"></span>' : '') +
        '</button>';
    });
    list.innerHTML = html;
  }

  // ── Notifications tab ─────────────────────────────────────────────────
  function renderTab() {
    var feed = document.getElementById('notificationsFeed');
    if (!feed) return;

    syncFilterOptions();

    var scope = document.getElementById('notificationsScopeLabel');
    if (scope) scope.textContent = scopeLabel();

    var markAll = document.getElementById('notificationsMarkAll');
    if (markAll) markAll.disabled = !(Number(state.unread) > 0);

    if (!state.loaded && state.loading) {
      feed.innerHTML = '<div class="notifications-empty">Loading activity…</div>';
      return;
    }
    if (state.error && !state.items.length) {
      feed.innerHTML =
        '<div class="notifications-empty">Could not load activity. ' +
        escapeHtml(state.error) +
        '</div>';
      return;
    }

    var items = filteredItems();
    if (!items.length) {
      feed.innerHTML =
        '<div class="notifications-empty">' +
        (state.items.length
          ? 'No activity matches the current filters.'
          : 'No activity yet. Student attempts and staff changes will appear here.') +
        '</div>';
      return;
    }

    var html = '';
    items.forEach(function (item) {
      var originalIndex = state.items.indexOf(item);
      var actor = item.actor || {};
      var role = roleLabel(actor.role);
      var metaBits = [];
      if (actor.name) metaBits.push(actor.name);
      if (role) metaBits.push(role);
      if (actor.studentNumber) metaBits.push('#' + actor.studentNumber);
      if (actor.className) metaBits.push(actor.className);

      html +=
        '<article class="notification-card' +
        (item.unread ? ' is-unread' : '') +
        '" data-notification-index="' + originalIndex + '" role="button" tabindex="0">' +
        '<span class="notification-card-icon type-' + escapeHtml(item.entityType || item.type) + '">' +
        iconFor(item.type) +
        '</span>' +
        '<div class="notification-card-body">' +
        '<div class="notification-card-title">' + escapeHtml(item.title) + '</div>' +
        (item.description
          ? '<div class="notification-card-desc">' + escapeHtml(item.description) + '</div>'
          : '') +
        renderDetailTags(item) +
        '<div class="notification-card-meta">' +
        '<span class="notification-card-actor">' + escapeHtml(metaBits.join(' • ')) + '</span>' +
        '<span class="notification-card-time">' + escapeHtml(formatRelative(item.createdAt)) + '</span>' +
        '</div>' +
        '</div>' +
        (item.unread ? '<span class="notification-card-dot" aria-label="Unread"></span>' : '') +
        '</article>';
    });
    feed.innerHTML = html;
  }

  function renderAll() {
    renderBadge();
    renderMenu();
    renderTab();
  }

  // ── Data ──────────────────────────────────────────────────────────────
  function refresh() {
    if (refreshPromise) return refreshPromise;
    if (!apiAvailable()) {
      // The auth bootstrap may still be running; retry shortly and stay quiet.
      if (hasSession() && !state.loaded) {
        setTimeout(function () {
          if (apiAvailable()) refresh();
        }, 1200);
      }
      return Promise.resolve(state);
    }

    state.loading = true;
    if (!state.loaded) renderAll();

    refreshPromise = window.API.raw('GET', '/notifications/feed?limit=60')
      .then(function (payload) {
        state.items = Array.isArray(payload && payload.items) ? payload.items : [];
        state.unread = Number(payload && payload.unread) || 0;
        state.lastSeenAt = (payload && payload.lastSeenAt) || null;
        state.scope = (payload && payload.scope) || '';
        state.error = '';
        state.loaded = true;
        state.lastFetchedAt = Date.now();
        return state;
      })
      .catch(function (err) {
        state.error = (err && err.message) || 'Network error';
        if (!state.loaded) state.loaded = true;
        return state;
      })
      .finally(function () {
        state.loading = false;
        refreshPromise = null;
        renderAll();
      });

    return refreshPromise;
  }

  function applySeenState() {
    state.items.forEach(function (item) {
      item.unread = false;
    });
    state.unread = 0;
    state.lastSeenAt = new Date().toISOString();
    renderAll();
  }

  function markSeen() {
    if (!Number(state.unread)) {
      applySeenState();
      return Promise.resolve(state);
    }
    applySeenState();
    if (!apiAvailable()) return Promise.resolve(state);
    return window.API.raw('PATCH', '/notifications/read', {})
      .then(function (payload) {
        if (payload && payload.lastSeenAt) state.lastSeenAt = payload.lastSeenAt;
        return state;
      })
      .catch(function () {
        // Local state already reflects the read action; the next refresh heals.
        return state;
      });
  }

  function openInbox(event) {
    if (typeof window.openTab === 'function') {
      window.openTab(event || null, 'notifications');
    }
    document.querySelectorAll('.nav-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === 'notifications');
    });
    markSeen();
    refresh();
  }

  // ── Navigation from an item ───────────────────────────────────────────
  var TAB_FOR_ENTITY = {
    result: 'results',
    question: 'questions',
    exam: 'exams',
    class: 'classes',
    category: 'subjects',
    subject: 'subjects',
    course: 'subjects',
    game: 'games',
    tournament: 'games',
    device: 'devices',
    user: 'settings',
  };

  function pulse(element) {
    if (!element) return;
    element.classList.add('notification-target-hit');
    setTimeout(function () {
      element.classList.remove('notification-target-hit');
    }, 2600);
  }

  function highlightWhenReady(entityType, entityId) {
    var finder = TARGET_SELECTORS[entityType];
    if (!finder || !entityId) return;
    var attempts = 0;
    var tick = function () {
      var target = finder(entityId);
      if (target) {
        pulse(target);
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }
      if (attempts++ < 16) setTimeout(tick, 180);
    };
    setTimeout(tick, 250);
  }

  function openUserDirectory(userId) {
    try {
      window.openSettingsModal && window.openSettingsModal();
    } catch (_) {}
    try {
      window.switchSettingsTab && window.switchSettingsTab(null, 'users');
      window.switchUsersSettingsTab && window.switchUsersSettingsTab(null, 'management');
    } catch (_) {}
    ['userSearchInput', 'userRoleFilter', 'userStatusFilter', 'userClassFilter', 'userTeacherFilter']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    try {
      window.renderUsersTable && window.renderUsersTable();
    } catch (_) {}
    highlightWhenReady('user', userId);
  }

  function navigateToItem(item) {
    if (!item) return;
    var entityType = String(item.entityType || item.type || '');
    var entityId = String(item.entityId || '');
    var tab = TAB_FOR_ENTITY[entityType];

    if (!tab || !entityId) {
      openInbox();
      return;
    }

    closeProfileMenu();
    markSeen();

    if (tab === 'settings') {
      openUserDirectory(entityId);
      return;
    }

    if (typeof window.openTab === 'function') {
      window.openTab(null, tab);
    }
    document.querySelectorAll('.nav-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    highlightWhenReady(entityType, entityId);
  }

  function closeProfileMenu() {
    var dropdown = document.querySelector('.user-profile-dropdown');
    if (dropdown) dropdown.classList.remove('active');
  }

  function refreshMenu() {
    renderMenu();
    if (Date.now() - state.lastFetchedAt > 30000) refresh();
  }

  // ── Filters / export (same controls the retired Activity Log offered) ──
  function applyFilters() {
    state.filters = readFilterInputs();
    renderTab();
  }

  function clearFilters() {
    [
      'notificationsSearch',
      'notificationsTypeFilter',
      'notificationsRoleFilter',
      'notificationsUserFilter',
      'notificationsDateFilter',
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyFilters();
  }

  function exportCsv() {
    var rows = filteredItems();
    if (!rows.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('No activity to export', 'warning');
      } else {
        window.alert('No activity to export');
      }
      return;
    }
    var quote = function (value) {
      return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    };
    var header = ['Type', 'Title', 'Description', 'Context', 'User', 'Role', 'Date'].join(',');
    var body = rows
      .map(function (item) {
        var actor = item.actor || {};
        var occurred = item.createdAt ? new Date(item.createdAt) : null;
        var context = itemDetails(item)
          .map(function (detail) {
            return [detail.label, detail.value].filter(Boolean).join(': ');
          })
          .join(' | ');
        return [
          quote(item.entityType || item.type || 'activity'),
          quote(item.title || ''),
          quote(item.description || ''),
          quote(context),
          quote(actor.name || ''),
          quote(actor.role || ''),
          quote(
            occurred && !Number.isNaN(occurred.getTime())
              ? occurred.toLocaleString()
              : '',
          ),
        ].join(',');
      })
      .join('\n');
    var link = document.createElement('a');
    link.href =
      'data:text/csv;charset=utf-8,' + encodeURIComponent(header + '\n' + body);
    link.download = 'notifications.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── Events ────────────────────────────────────────────────────────────
  function bind() {
    var menuList = document.getElementById('profileNotificationList');
    if (menuList && !menuList.dataset.bound) {
      menuList.dataset.bound = '1';
      menuList.addEventListener('click', function (event) {
        var target = event.target.closest('[data-notification-index]');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        var index = Number(target.dataset.notificationIndex);
        var item = state.items[index];
        if (!item) return;
        if (TAB_FOR_ENTITY[String(item.entityType || item.type)] && item.entityId) {
          navigateToItem(item);
        } else {
          openInbox();
        }
      });
    }

    var viewAll = document.getElementById('profileNotificationsViewAll');
    if (viewAll && !viewAll.dataset.bound) {
      viewAll.dataset.bound = '1';
      viewAll.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeProfileMenu();
        openInbox();
      });
    }

    var feed = document.getElementById('notificationsFeed');
    if (feed && !feed.dataset.bound) {
      feed.dataset.bound = '1';
      feed.addEventListener('click', function (event) {
        var target = event.target.closest('[data-notification-index]');
        if (!target) return;
        var item = state.items[Number(target.dataset.notificationIndex)];
        navigateToItem(item);
      });
      feed.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var target = event.target.closest('[data-notification-index]');
        if (!target) return;
        event.preventDefault();
        navigateToItem(state.items[Number(target.dataset.notificationIndex)]);
      });
    }

    var markAll = document.getElementById('notificationsMarkAll');
    if (markAll && !markAll.dataset.bound) {
      markAll.dataset.bound = '1';
      markAll.addEventListener('click', function (event) {
        event.preventDefault();
        markSeen();
      });
    }

    var searchInput = document.getElementById('notificationsSearch');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = '1';
      searchInput.addEventListener('input', applyFilters);
    }

    [
      'notificationsTypeFilter',
      'notificationsRoleFilter',
      'notificationsUserFilter',
      'notificationsDateFilter',
    ].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select || select.dataset.bound) return;
      select.dataset.bound = '1';
      select.addEventListener('change', applyFilters);
    });

    var clearBtn = document.getElementById('notificationsClearFilters');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        clearFilters();
      });
    }

    var exportBtn = document.getElementById('notificationsExportBtn');
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = '1';
      exportBtn.addEventListener('click', function (event) {
        event.preventDefault();
        exportCsv();
      });
    }
  }

  function init() {
    bind();
    renderAll();
    refresh();

    window.addEventListener('quiz:bootstrap-ready', function () {
      refresh();
    });
    window.addEventListener('admin:notifications-updated', function () {
      setTimeout(refresh, 400);
    });
    window.addEventListener('focus', function () {
      if (Date.now() - state.lastFetchedAt > 30000) refresh();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - state.lastFetchedAt > 30000) {
        refresh();
      }
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.visibilityState !== 'hidden') refresh();
    }, 60000);
  }

  window.QuizNotifications = {
    refresh: refresh,
    refreshMenu: refreshMenu,
    markSeen: markSeen,
    openInbox: openInbox,
    render: renderAll,
    getState: function () {
      return state;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

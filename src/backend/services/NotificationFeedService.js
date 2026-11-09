/**
 * src/backend/services/NotificationFeedService.js
 *
 * Role-scoped activity feed behind the Notifications tab and the profile-menu
 * bell. It merges the three sources that describe what happened in a school:
 *
 *   - notifications  : client-recorded actions (questions/exams/requests…)
 *   - audit_logs     : server-recorded mutations + sign-ins
 *   - results        : student attempts (the "student activity" stream)
 *
 * Scope is decided by the viewer, never by the client:
 *   admin / super_admin → the whole school
 *   teacher             → their own actions + their assigned classes/students
 *   student             → their own actions only
 *
 * Read state is a per-user watermark stored in a SYSTEM settings row, so one
 * user reading the feed never clears another user's badge.
 *
 * Titles are rebuilt from the structured payload (actor + action + entity)
 * instead of the raw client message. Client rows historically stored only
 * "name action" ("cours pratique created"), and batch rows stored a UUID as
 * the name, so the feed resolves names from the tenant tables and returns a
 * `details` chip list (type, difficulty, subject, counts…) that the UI renders
 * under each card.
 */

import { ROLES } from '../../shared/constants.js';

const SOURCE_LIMIT = 500;
const MAX_NAME_LENGTH = 80;
const MAX_TEXT_LENGTH = 120;
const MAX_DETAILS = 6;
const TEACHER_NOTIFICATION_REQUEST_TYPES = new Set([
  'profile_request',
  'account_request',
]);

const AUDIT_VERBS = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  login: 'signed in',
  logout: 'signed out',
  assign: 'assigned',
  export: 'exported',
  publish: 'published',
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  'revoke-sessions': 'revoked sessions for',
  migrate: 'migrated',
  push_exam: 'pushed an exam to',
};

// Client `logActivity` verbs reuse the same vocabulary so one title builder
// covers both streams.
const ACTION_LABELS = {
  ...AUDIT_VERBS,
  created: 'created',
  edited: 'updated',
  moved: 'moved',
  imported: 'imported',
  'training enabled': 'enabled training for',
  'training disabled': 'disabled training for',
  'assigned questions': 'assigned questions to',
  'assigned classes': 'assigned classes to',
  'assigned exams': 'assigned exams to',
  'removed from roster': 'removed students from',
  activated: 'activated',
  suspended: 'suspended',
  requested: 'requested',
  approved: 'approved',
  rejected: 'rejected',
};

const ENTITY_META = {
  question: { singular: 'question', plural: 'questions', article: 'a' },
  exam: { singular: 'exam', plural: 'exams', article: 'an' },
  class: { singular: 'class', plural: 'classes', article: 'a' },
  category: { singular: 'category', plural: 'categories', article: 'a' },
  subject: { singular: 'subject', plural: 'subjects', article: 'a' },
  course: { singular: 'course', plural: 'courses', article: 'a' },
  lesson: { singular: 'lesson', plural: 'lessons', article: 'a' },
  user: { singular: 'user account', plural: 'user accounts', article: 'a' },
  game: { singular: 'game', plural: 'games', article: 'a' },
  tournament: { singular: 'tournament', plural: 'tournaments', article: 'a' },
  device: { singular: 'device', plural: 'devices', article: 'a' },
  setting: { singular: 'setting', plural: 'settings', article: 'a' },
  auth: { singular: 'session', plural: 'sessions', article: 'a' },
  import: { singular: 'student import', plural: 'student imports', article: 'a' },
  account_request: {
    singular: 'account request',
    plural: 'account requests',
    article: 'an',
  },
  profile_request: {
    singular: 'profile request',
    plural: 'profile requests',
    article: 'a',
  },
  result: { singular: 'quiz result', plural: 'quiz results', article: 'a' },
  activity: { singular: 'activity', plural: 'activities', article: 'an' },
};

const QUESTION_TYPE_LABELS = {
  mcq: 'Multiple choice',
  'multiple-choice': 'Multiple choice',
  'true-false': 'True/False',
  'fill-blank': 'Fill in the blank',
  matching: 'Matching',
  order: 'Ordering',
  draggable: 'Drag & drop',
};

const NOTIFICATION_COVERED_ENTITIES = new Set([
  'question',
  'exam',
  'class',
  'category',
]);
const NOTIFICATION_DEDUPE_WINDOW_MS = 15_000;
const AUDIT_SHADOW_WINDOW_MS = 60_000;

// Kids-game catalog sync runs on every boot and would otherwise flood the
// inbox with identical "synced a game" rows.
const SKIPPED_AUDIT_ACTIONS = new Set(['bank-sync']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super admin',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.TEACHER]: 'Teacher',
  [ROLES.STUDENT]: 'Student',
};

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function roleLabel(role) {
  return ROLE_LABELS[String(role || '')] || 'User';
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timeOf(item) {
  return item.createdAt ? new Date(item.createdAt).getTime() : 0;
}

function truncate(value, max = MAX_NAME_LENGTH) {
  const text = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isIdentifier(value) {
  return UUID_RE.test(String(value || '').trim());
}

function normalizeEntityType(type, meta = {}) {
  const raw = String(type || '').trim();
  if (!raw) return 'activity';
  if (raw === 'category' && String(meta.kind || '') === 'subject') return 'subject';
  if (raw === 'kidsGame' || raw === 'kids_game') return 'game';
  if (raw === 'pending_import') return 'import';
  if (raw === 'student_activity' || raw === 'admin_notice' || raw === 'activity') {
    return 'activity';
  }
  return raw;
}

function entityMeta(type) {
  const key = String(type || 'activity');
  return (
    ENTITY_META[key] || {
      singular: humanize(key) || 'activity',
      plural: `${humanize(key) || 'activity'}s`,
      article: 'a',
    }
  );
}

function cleanEntityName(value) {
  return String(value || '')
    .replace(/\s+(account|profile)(\s+update)?\s+request$/i, '')
    .trim();
}

function subjectNameFor(meta, maps) {
  const direct = meta.subject_id || meta.subjectId;
  if (direct) {
    const subject = maps.subjectsById.get(String(direct));
    if (subject?.name) return subject.name;
  }
  const categoryId = meta.categoryId || meta.category_id || meta.category;
  if (categoryId) {
    const category = maps.categoriesById.get(String(categoryId));
    if (category?.subject_id) {
      const subject = maps.subjectsById.get(String(category.subject_id));
      if (subject?.name) return subject.name;
    }
  }
  return '';
}

function resolveEntityName({ entityType, candidate, meta, maps }) {
  const raw = cleanEntityName(candidate || meta.name);
  const id = String(meta.id || meta.entityId || meta.entity_id || '').trim();
  if (raw && !isIdentifier(raw)) return raw;
  const lookupId = raw && isIdentifier(raw) ? raw : id;
  if (!lookupId) return '';

  const userName = (userId) => {
    const user = maps.usersById.get(String(userId));
    return user ? user.name || user.username || '' : '';
  };
  const deviceName = (deviceId) => {
    const device = maps.devicesById.get(String(deviceId));
    return device ? device.note || device.hostname || device.device_type || '' : '';
  };

  switch (entityType) {
    case 'category':
      return maps.categoriesById.get(lookupId)?.name || '';
    case 'subject':
      return (
        maps.subjectsById.get(lookupId)?.name ||
        maps.categoriesById.get(lookupId)?.name ||
        ''
      );
    case 'question':
      return maps.questionsById.get(lookupId)?.text || '';
    case 'exam':
      return maps.examsById.get(lookupId)?.name || '';
    case 'class':
      return maps.classesById.get(lookupId)?.name || '';
    case 'course':
      return maps.coursesById.get(lookupId)?.name || '';
    case 'game':
      return maps.gamesById.get(lookupId)?.name || '';
    case 'tournament':
      return maps.tournamentsById.get(lookupId)?.name || '';
    case 'device':
      return deviceName(lookupId);
    case 'user':
      return userName(lookupId);
    default:
      return '';
  }
}

function buildTitle({ actorName, action, entityType, entityName, count, className }) {
  const label = entityMeta(entityType);
  const verb = ACTION_LABELS[action] || humanize(action || 'updated');
  const name = cleanEntityName(entityName);
  const shortName = name ? truncate(name, 70) : '';
  const quoted = shortName ? ` “${shortName}”` : '';

  // Imports carry a fully-formed sentence in `name`: keep it as-is.
  if (entityType === 'import') {
    return shortName || `${actorName} ${verb} a student import`;
  }
  if (entityType === 'auth') return `${actorName} ${verb}`.trim();

  if (action === 'removed from roster') {
    const amount = count > 0 ? count : null;
    const students =
      amount === 1 ? '1 student' : amount ? `${amount} students` : 'students';
    return `${actorName} removed ${students}${
      className ? ` from ${className}` : ' from a class'
    }`;
  }

  if (action === 'training enabled' || action === 'training disabled') {
    return `${actorName} ${verb} ${
      shortName ? `category “${shortName}”` : 'a category'
    }`;
  }

  if (action === 'activated' || action === 'suspended') {
    const amount = count > 0 ? count : null;
    return `${actorName} ${verb} ${
      amount ? `${amount} student account${amount === 1 ? '' : 's'}` : 'student accounts'
    }`;
  }

  if (
    action === 'requested' &&
    (entityType === 'account_request' || entityType === 'profile_request')
  ) {
    const what = entityType === 'account_request' ? 'an account' : 'a profile update';
    return `${actorName} requested ${what}${shortName ? ` for ${shortName}` : ''}`;
  }

  // Batch events log a summary name ("40 Categories", "AI Generated
  // Questions") plus a count.
  const summaryName =
    /^\d+\s/.test(name) ||
    /^ai generated questions$/i.test(name) ||
    /^questions? assigned$/i.test(name);
  if (count > 0 && (!name || summaryName)) {
    const batchVerb = /^questions? assigned$/i.test(name) ? 'assigned' : verb;
    return `${actorName} ${batchVerb} ${count} ${
      count === 1 ? label.singular : label.plural
    }`;
  }

  const needsArticle = !verb.endsWith(' to');
  return `${actorName} ${verb} ${needsArticle ? `${label.article} ` : ''}${
    label.singular
  }${quoted}`;
}

function pushDetail(details, label, value) {
  if (value == null || value === '') return;
  const text = truncate(value, 90);
  if (!text) return;
  const duplicate = details.some(
    (detail) => detail.label === label && detail.value === text,
  );
  if (duplicate) return;
  details.push({ label, value: text });
}

function buildNotificationDetails({ entityType, meta, data, maps }) {
  const details = [];
  const categoryId =
    meta.category && meta.category !== 'uncategorized' ? meta.category : '';
  const category = categoryId
    ? maps.categoriesById.get(String(categoryId))
    : null;
  const classId = meta.classId || data.classId;
  const classRow = classId ? maps.classesById.get(String(classId)) : null;
  const subjectName = subjectNameFor(meta, maps);

  switch (entityType) {
    case 'question':
      pushDetail(
        details,
        'Type',
        QUESTION_TYPE_LABELS[meta.type] || humanize(meta.type),
      );
      pushDetail(details, 'Difficulty', humanize(meta.difficulty));
      pushDetail(details, 'Category', category?.name);
      break;
    case 'category':
    case 'subject':
      pushDetail(details, 'Subject', subjectName);
      pushDetail(details, 'Questions', meta.questionCount);
      break;
    case 'exam':
      pushDetail(details, 'Questions', meta.questionCount);
      pushDetail(
        details,
        'Duration',
        meta.duration != null ? `${meta.duration} min` : '',
      );
      pushDetail(details, 'Classes', meta.classCount);
      pushDetail(details, 'New assignments', meta.added);
      break;
    case 'class':
      pushDetail(details, 'Students', meta.studentCount);
      pushDetail(details, 'Exams', meta.examCount);
      pushDetail(details, 'Class', classRow?.name || meta.className);
      pushDetail(details, 'Students', meta.count);
      break;
    case 'account_request':
    case 'profile_request':
      pushDetail(details, 'Student', data.studentName || meta.studentName);
      pushDetail(details, 'Username', data.username || meta.username);
      pushDetail(
        details,
        'Class',
        data.className || meta.className || classRow?.name,
      );
      pushDetail(details, 'Student #', data.studentNumber || meta.studentNumber);
      break;
    case 'import':
      pushDetail(details, 'Class', meta.className || classRow?.name);
      break;
    default:
      break;
  }

  if (
    meta.count != null &&
    !details.some(
      (detail) => detail.label === 'Students' || detail.label === 'Count',
    )
  ) {
    pushDetail(details, 'Count', meta.count);
  }

  return details.slice(0, MAX_DETAILS);
}

function buildNotificationDescription({
  row,
  data,
  meta,
  entityType,
  maps,
  actor,
}) {
  const explicit = String(data.description || data.details || '').trim();
  if (explicit) return explicit;

  if (entityType === 'question') {
    const text = String(meta.text || data.name || '').trim();
    if (text && !isIdentifier(text)) return `“${truncate(text, MAX_TEXT_LENGTH)}”`;
  }
  if (entityType === 'exam') {
    const bits = [];
    if (meta.questionCount != null) {
      bits.push(
        `${meta.questionCount} question${Number(meta.questionCount) === 1 ? '' : 's'}`,
      );
    }
    if (meta.duration != null) bits.push(`${meta.duration} min`);
    if (bits.length) return bits.join(' • ');
  }
  if (entityType === 'class' && meta.studentCount != null) {
    return `${meta.studentCount} student${Number(meta.studentCount) === 1 ? '' : 's'}`;
  }
  if (entityType === 'category' || entityType === 'subject') {
    const subject = subjectNameFor(meta, maps);
    if (subject) return `Subject: ${subject}`;
  }
  if (entityType === 'account_request' || entityType === 'profile_request') {
    const bits = [];
    const className = data.className || meta.className;
    if (className) bits.push(className);
    const studentNumber = data.studentNumber || meta.studentNumber;
    if (studentNumber) bits.push(`#${studentNumber}`);
    if (bits.length) return bits.join(' • ');
  }

  return '';
}

function auditEntityName({ entityType, entityId, diff, maps }) {
  const fromDiff =
    diff?.after?.name ||
    diff?.after?.title ||
    diff?.before?.name ||
    diff?.before?.title ||
    '';
  if (fromDiff) return String(fromDiff);

  const id = String(entityId || '');
  if (!id) return '';
  const userName = (userId) => {
    const user = maps.usersById.get(String(userId));
    return user ? user.name || user.username || '' : '';
  };
  const deviceName = (deviceId) => {
    const device = maps.devicesById.get(String(deviceId));
    return device
      ? device.note || device.hostname || device.device_type || ''
      : '';
  };

  switch (entityType) {
    case 'question':
      return truncate(maps.questionsById.get(id)?.text || '', 80);
    case 'category':
      return maps.categoriesById.get(id)?.name || '';
    case 'subject':
      return maps.subjectsById.get(id)?.name || '';
    case 'course':
      return maps.coursesById.get(id)?.name || '';
    case 'exam':
      return maps.examsById.get(id)?.name || '';
    case 'class':
      return maps.classesById.get(id)?.name || '';
    case 'user':
      return userName(id);
    case 'game':
      return maps.gamesById.get(id)?.name || '';
    case 'tournament':
      return maps.tournamentsById.get(id)?.name || '';
    case 'device':
      return deviceName(id);
    default:
      return '';
  }
}

function auditContext({ entityType, entityId, maps, actor }) {
  const bits = [];
  if (entityType === 'category' || entityType === 'subject') {
    const category = maps.categoriesById.get(String(entityId || ''));
    const subject = category?.subject_id
      ? maps.subjectsById.get(String(category.subject_id))
      : maps.subjectsById.get(String(entityId || ''));
    if (subject?.name) bits.push(`Subject: ${subject.name}`);
  }
  if (entityType === 'class') {
    const name = maps.classesById.get(String(entityId || ''))?.name;
    if (name) bits.push(`Class: ${name}`);
  }
  if (!bits.length && actor?.className) bits.push(actor.className);
  return bits.join(' • ');
}

export class NotificationFeedService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  #seenKey(userId) {
    return `notifications.lastSeen.${userId}`;
  }

  async #readWatermark(schoolId, userId, { createIfMissing = false } = {}) {
    const key = this.#seenKey(userId);
    const { data } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key },
      limit: 1,
    });
    const row = data[0];
    if (row) {
      const iso = toIso(row.value);
      if (iso) return { lastSeenAt: iso, existed: true };
    }
    if (!createIfMissing) return { lastSeenAt: null, existed: false };

    // First visit: anchor the badge to "now" so a fresh install does not
    // greet the user with hundreds of historical unread events.
    const now = new Date().toISOString();
    try {
      await this.#repo.modelFor('settings').upsert({
        where: { school_id_key: { school_id: schoolId, key } },
        create: { school_id: schoolId, key, value: now, visibility: 'system' },
        update: { value: now },
      });
    } catch (_) {
      /* read-only fallback: still report zero unread for this response */
    }
    return { lastSeenAt: now, existed: false };
  }

  async markSeen({ schoolId, userId }) {
    const key = this.#seenKey(userId);
    const now = new Date().toISOString();
    await this.#repo.modelFor('settings').upsert({
      where: { school_id_key: { school_id: schoolId, key } },
      create: { school_id: schoolId, key, value: now, visibility: 'system' },
      update: { value: now },
    });
    return { lastSeenAt: now };
  }

  /**
   * @param {object} input
   * @param {string} input.schoolId
   * @param {{ id: string, role: string }} input.viewer
   * @param {string[]} [input.teacherClassIds] classes assigned to a teacher
   * @param {number} [input.limit]
   */
  async build({ schoolId, viewer, teacherClassIds = [], limit = 50 }) {
    const viewerId = String(viewer?.id || '');
    const role = String(viewer?.role || '');
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isTeacher = role === ROLES.TEACHER;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const [
      usersRes,
      classesRes,
      examsRes,
      categoriesRes,
      subjectsRes,
      coursesRes,
      gamesRes,
      tournamentsRes,
      devicesRes,
    ] = await Promise.all([
      this.#repo.getAll('users', {
        filters: { school_id: schoolId },
        limit: 100000,
      }),
      this.#repo.getAll('classes', {
        filters: { school_id: schoolId },
        limit: 100000,
      }),
      this.#repo.getAll('exams', {
        filters: { school_id: schoolId },
        limit: 100000,
      }),
      this.#repo.getAll('categories', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
      this.#repo.getAll('subjects', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
      this.#repo.getAll('courses', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
      this.#repo.getAll('games', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
      this.#repo.getAll('tournaments', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
      this.#repo.getAll('devices', {
        filters: { school_id: schoolId },
        limit: 20000,
      }),
    ]);

    const maps = {
      usersById: new Map(
        (usersRes.data || []).map((user) => [String(user.id), user]),
      ),
      classesById: new Map(
        (classesRes.data || []).map((cls) => [String(cls.id), cls]),
      ),
      examsById: new Map(
        (examsRes.data || []).map((exam) => [String(exam.id), exam]),
      ),
      categoriesById: new Map(
        (categoriesRes.data || []).map((category) => [String(category.id), category]),
      ),
      subjectsById: new Map(
        (subjectsRes.data || []).map((subject) => [String(subject.id), subject]),
      ),
      coursesById: new Map(
        (coursesRes.data || []).map((course) => [String(course.id), course]),
      ),
      gamesById: new Map(
        (gamesRes.data || []).map((game) => [String(game.id), game]),
      ),
      tournamentsById: new Map(
        (tournamentsRes.data || []).map((tournament) => [
          String(tournament.id),
          tournament,
        ]),
      ),
      devicesById: new Map(
        (devicesRes.data || []).map((device) => [String(device.id), device]),
      ),
      questionsById: new Map(),
    };

    const classIds = isTeacher
      ? new Set((teacherClassIds || []).map(String).filter(Boolean))
      : null;
    const studentIds = new Set();
    if (isTeacher) {
      for (const user of maps.usersById.values()) {
        if (String(user.role) === ROLES.STUDENT && classIds.has(String(user.class_id))) {
          studentIds.add(String(user.id));
        }
      }
    } else if (!isAdmin) {
      studentIds.add(viewerId);
    }

    const actorAllowed = (actorId) => {
      if (isAdmin) return true;
      if (!actorId) return false;
      if (isTeacher) {
        return String(actorId) === viewerId || studentIds.has(String(actorId));
      }
      return String(actorId) === viewerId;
    };

    const [notificationsRes, auditsRes, resultsRes, watermark] = await Promise.all([
      this.#repo.getAll('notifications', {
        filters: { school_id: schoolId },
        orderBy: 'created_at',
        limit: SOURCE_LIMIT,
      }),
      this.#repo.getAll('audit_logs', {
        filters: { school_id: schoolId },
        orderBy: 'occurred_at',
        limit: SOURCE_LIMIT,
      }),
      this.#repo.getAll('results', {
        filters: { school_id: schoolId },
        orderBy: 'date_taken',
        limit: SOURCE_LIMIT,
      }),
      this.#readWatermark(schoolId, viewerId, { createIfMissing: true }),
    ]);

    const notificationRows = notificationsRes.data || [];
    const auditRows = auditsRes.data || [];

    // Question rows only store the row id in some flows (bulk delete, audit
    // shadows). Fetch just those ids instead of the whole question bank.
    const questionIds = new Set();
    for (const row of notificationRows) {
      const data = parseJson(row.data_json, {}) || {};
      const meta = parseJson(data.metadata, {}) || {};
      const entityType = normalizeEntityType(
        data.entityType || meta.entityType || row.type,
        meta,
      );
      if (entityType !== 'question') continue;
      const candidate = String(data.name || meta.text || '');
      const id = String(meta.id || data.entityId || meta.entityId || '');
      if ((!candidate || isIdentifier(candidate)) && id) questionIds.add(id);
    }
    for (const row of auditRows) {
      if (String(row.entity_type || '') === 'question' && row.entity_id) {
        questionIds.add(String(row.entity_id));
      }
    }
    if (questionIds.size) {
      try {
        const ids = [...questionIds].slice(0, 500);
        const { data } = await this.#repo.getAll('questions', {
          filters: { school_id: schoolId, id: { in: ids } },
          limit: ids.length,
        });
        for (const question of data || []) {
          maps.questionsById.set(String(question.id), question);
        }
      } catch (_) {
        /* names are a nicety; never fail the feed for them */
      }
    }

    const actorFor = (rawActor, fallbackUserId) => {
      const source = rawActor && typeof rawActor === 'object' ? rawActor : null;
      const user =
        maps.usersById.get(String(source?.id || fallbackUserId || '')) || null;
      const id = String(source?.id || user?.id || fallbackUserId || '');
      if (!id && !source) return null;
      const name =
        source?.name ||
        user?.name ||
        user?.username ||
        (id ? 'User' : 'System');
      const className =
        source?.className ||
        (user?.class_id ? maps.classesById.get(String(user.class_id))?.name : '') ||
        '';
      return {
        id,
        name,
        username: source?.username || user?.username || '',
        role: source?.role || user?.role || '',
        studentNumber:
          source?.studentNumber || source?.numero || user?.numero || '',
        className,
      };
    };

    const items = [];

    // ── notifications ────────────────────────────────────────────────────
    for (const row of notificationRows) {
      const data = parseJson(row.data_json, {}) || {};
      const meta = parseJson(data.metadata, {}) || {};
      const rawActor = data.actor || null;
      const actor = actorFor(rawActor, data.userId || meta.userId);
      const type = String(row.type || data.type || 'activity');
      const createdAt = toIso(row.created_at);

      if (!isAdmin) {
        if (actor?.id) {
          if (!actorAllowed(actor.id)) continue;
        } else if (isTeacher && TEACHER_NOTIFICATION_REQUEST_TYPES.has(type)) {
          const requestUser = String(data.userId || meta.userId || '');
          const requestClass = String(data.classId || meta.classId || '');
          if (!studentIds.has(requestUser) && !classIds.has(requestClass)) continue;
        } else {
          continue;
        }
      }

      const action = String(data.action || meta.action || '').trim();
      const entityType = normalizeEntityType(
        data.entityType || meta.entityType || type,
        meta,
      );
      const count = Number(meta.count) || 0;
      const entityName = resolveEntityName({
        entityType,
        candidate: data.name || meta.name,
        meta,
        maps,
      });
      const classId = meta.classId || data.classId;
      const className =
        meta.className ||
        (classId ? maps.classesById.get(String(classId))?.name : '') ||
        '';
      const structured = Boolean(action && (data.name || meta.name || meta.id));
      const title = structured
        ? buildTitle({
            actorName: actor?.name || 'User',
            action,
            entityType,
            entityName,
            count,
            className,
          })
        : String(row.message || data.message || 'Activity');

      items.push({
        id: `notification:${row.id}`,
        source: 'notification',
        type,
        action,
        title,
        description: structured
          ? buildNotificationDescription({
              row,
              data,
              meta,
              entityType,
              maps,
              actor,
            })
          : String(data.description || data.details || '') ||
            (actor
              ? `${roleLabel(actor.role)}${actor.className ? ` • ${actor.className}` : ''}`
              : 'System notice'),
        details: buildNotificationDetails({ entityType, meta, data, maps }),
        actor,
        createdAt,
        entityType,
        entityId: String(data.entityId || meta.entityId || meta.id || ''),
        entityName,
      });
    }

    // Client request flows historically wrote the same event twice (once via
    // logActivity, once via addAdminNotification). Collapse identical,
    // near-simultaneous rows so the feed does not show duplicates. The action
    // and entity id/name keep distinct rows (e.g. two questions in one minute)
    // from being folded together.
    const notificationItems = items.filter((item) => item.source === 'notification');
    const dedupedNotifications = [];
    const lastSeenByKey = new Map();
    for (const item of notificationItems.sort((a, b) => timeOf(b) - timeOf(a))) {
      const identity = item.entityId || item.entityName || item.title;
      const key = `${item.type}|${item.action || ''}|${identity}`;
      const previous = lastSeenByKey.get(key);
      if (previous != null && previous - timeOf(item) < NOTIFICATION_DEDUPE_WINDOW_MS) {
        continue;
      }
      lastSeenByKey.set(key, timeOf(item));
      dedupedNotifications.push(item);
    }

    // ── audit_logs ───────────────────────────────────────────────────────
    const auditItems = [];
    for (const row of auditRows) {
      const actor = actorFor(null, row.actor_id);
      const createdAt = toIso(row.occurred_at);
      if (!isAdmin && !actorAllowed(row.actor_id)) continue;
      if (!isAdmin && !row.actor_id) continue;

      const entityType = String(row.entity_type || 'activity');
      const action = String(row.action || 'updated');
      if (SKIPPED_AUDIT_ACTIONS.has(action)) continue;

      // The client already logged these domains in `notifications`; keep the
      // richer client entry and drop the near-simultaneous audit shadow.
      if (NOTIFICATION_COVERED_ENTITIES.has(entityType) && actor?.id) {
        const shadow = dedupedNotifications.some(
          (item) =>
            item.actor?.id === actor.id &&
            Math.abs(timeOf(item) - timeOf({ createdAt })) < AUDIT_SHADOW_WINDOW_MS,
        );
        if (shadow) continue;
      }

      const diff = parseJson(row.diff_json, null) || {};
      const entityId = String(row.entity_id || '');
      const entityName = auditEntityName({
        entityType,
        entityId,
        diff,
        maps,
      });
      const actorName = actor?.name || 'System';
      const verb = ACTION_LABELS[action] || humanize(action);
      const label = entityMeta(entityType);
      const shortName = entityName ? ` “${truncate(entityName, 70)}”` : '';
      const needsArticle = !verb.endsWith(' to');
      const title =
        entityType === 'auth'
          ? `${actorName} ${verb}`
          : `${actorName} ${verb} ${needsArticle ? `${label.article} ` : ''}${
              label.singular
            }${shortName}`;

      auditItems.push({
        id: `audit:${row.id}`,
        source: 'audit',
        type: entityType,
        action,
        title,
        description: auditContext({ entityType, entityId, maps, actor }),
        details: [],
        actor,
        createdAt,
        entityType,
        entityId,
        entityName,
      });
    }

    // ── results ──────────────────────────────────────────────────────────
    const resultItems = [];
    for (const row of resultsRes.data || []) {
      const userId = row.user_id ? String(row.user_id) : null;
      if (!isAdmin) {
        if (!userId || !studentIds.has(userId)) continue;
      }
      const actor = actorFor(null, userId);
      const payload = parseJson(row.answers_json, {}) || {};
      const exam =
        (row.exam_id && maps.examsById.get(String(row.exam_id))) || null;
      const examTitle =
        exam?.name ||
        payload.examTitle ||
        payload.examName ||
        payload.gameName ||
        (String(row.mode || '').toLowerCase() === 'training'
          ? 'Training Quiz'
          : 'Quiz');
      const score = Math.round(Number(row.score) || 0);
      const details = [];
      pushDetail(details, 'Score', `${score}%`);
      pushDetail(details, 'Class', actor?.className);
      pushDetail(details, 'Mode', humanize(row.mode));
      if (row.time_spent) {
        const seconds = Number(row.time_spent);
        pushDetail(
          details,
          'Time',
          seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`,
        );
      }
      resultItems.push({
        id: `result:${row.id}`,
        source: 'result',
        type: 'result',
        action: 'completed',
        title: `${actor?.name || 'Student'} completed ${examTitle}`,
        description: [
          `Score ${score}%`,
          actor?.className,
          row.mode
            ? `${String(row.mode).replace(/^\w/, (char) => char.toUpperCase())} mode`
            : '',
        ]
          .filter(Boolean)
          .join(' • '),
        details,
        actor,
        createdAt: toIso(row.date_taken),
        entityType: 'result',
        entityId: String(row.id),
        entityName: examTitle,
      });
    }

    const merged = [...dedupedNotifications, ...auditItems, ...resultItems]
      .filter((item) => item.createdAt)
      .sort((a, b) => timeOf(b) - timeOf(a));

    const lastSeenMs = watermark.lastSeenAt
      ? new Date(watermark.lastSeenAt).getTime()
      : 0;
    let unread = 0;
    for (const item of merged) {
      if (!lastSeenMs || timeOf(item) > lastSeenMs) {
        item.unread = true;
        unread += 1;
      } else {
        item.unread = false;
      }
    }

    return {
      items: merged.slice(0, safeLimit),
      unread,
      lastSeenAt: watermark.lastSeenAt,
      scope: isAdmin ? 'school' : isTeacher ? 'teacher' : 'self',
      generatedAt: new Date().toISOString(),
    };
  }
}

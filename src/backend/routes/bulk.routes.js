/**
 * src/backend/routes/bulk.routes.js
 *
 * Generic bulk-create endpoint for all entities.
 * The frontend ApiRepository (and legacy-bridge.js setAll_sync) calls
 * POST /api/v1/bulk/:table with a payload shaped by the *legacy* admin UI.
 *
 * The legacy UI does NOT share the Prisma schema's field names. It sends
 * things like `dateCreated` instead of `created_at`, `questionCount` /
 * `isSystem` on categories, `students` arrays on classes, etc. Handing
 * those row objects straight to Prisma crashes the request with
 * `Unknown argument` (Prisma error P2009-style) and the entire bulk write
 * fails — which is the root cause of "Add Class / Add User don't save".
 *
 * The sanitizer below maps each legacy payload to the actual Prisma schema:
 * - drops fields the model doesn't have                (with a warn log)
 * - renames camelCase → snake_case for known fields
 * - coerces types where the legacy UI uses looser ones (dates, ints, bools)
 *
 * Accepts:  { items: object[] }
 * Returns:  201 { count: number }
 * Requires: JWT auth + admin role + tenant scoping.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN), enforceTenant);

// ─── Helpers ────────────────────────────────────────────────────────────────

const pickDate = (v) => {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const pickInt = (v) => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

const pickBool = (v) => (v === undefined ? undefined : Boolean(v));

const pickStr = (v) => (v == null ? undefined : String(v));

/**
 * Per-table sanitizers. Each receives the legacy row + the tenant school_id
 * and returns a row whose keys are exactly the columns the Prisma model
 * expects. Unknown fields are returned on `dropped` so we can warn.
 */
const SANITIZERS = {
  // model Category { id, school_id, name, parent_id?, icon?, color?,
  //                  created_at, updated_at }
  categories: (row, schoolId) => ({
    ...(row.id && { id: String(row.id) }),
    school_id: schoolId,
    name: String(row.name ?? '').trim() || 'Untitled',
    ...(row.parent_id && { parent_id: String(row.parent_id) }),
    ...(row.parentId && { parent_id: String(row.parentId) }),
    ...(row.icon != null && { icon: pickStr(row.icon) }),
    ...(row.color != null && { color: pickStr(row.color) }),
    // legacy fields `description`, `questionCount`, `dateCreated`,
    // `isSystem`, `ownerId` are not in the schema — dropped.
  }),

  // model Class { id, school_id, name, description?, created_at, updated_at }
  classes: (row, schoolId) => ({
    ...(row.id && { id: String(row.id) }),
    school_id: schoolId,
    name: String(row.name ?? '').trim() || 'Untitled',
    // The legacy UI sends `students` (array of {number,name}) and `ownerId`;
    // neither exists on Class. We keep `description` if explicitly sent.
    ...(row.description != null && { description: pickStr(row.description) }),
  }),

  // model User { id, school_id, class_id?, username, password_hash, role,
  //              name, numero?, status, last_login?, created_at, updated_at }
  users: (row, schoolId) => {
    // The legacy UI stores client-hashed passwords under `passwordHash` and
    // uses `studentNumber` instead of `numero`.
    const passwordHash =
      row.password_hash || row.passwordHash || row.password || undefined;
    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(row.class_id && { class_id: String(row.class_id) }),
      ...(row.classId && { class_id: String(row.classId) }),
      username: String(row.username ?? row.email ?? '').trim(),
      ...(passwordHash && { password_hash: String(passwordHash) }),
      role: pickStr(row.role) || 'student',
      name: pickStr(row.name) || pickStr(row.username) || 'Unknown',
      ...(row.numero != null && { numero: pickStr(row.numero) }),
      ...(row.studentNumber != null && { numero: pickStr(row.studentNumber) }),
      status: pickStr(row.status) || 'active',
      ...(row.last_login && { last_login: pickDate(row.last_login) }),
      ...(row.lastLogin && { last_login: pickDate(row.lastLogin) }),
    };
  },

  // model Question { id, school_id, category_id?, type, text, options_json?,
  //                  answer, explanation?, points, difficulty, tags?,
  //                  media_url?, created_at, updated_at }
  questions: (row, schoolId) => {
    const optionsJson =
      row.options_json ??
      (Array.isArray(row.options) ? JSON.stringify(row.options) : undefined) ??
      (row.options != null ? pickStr(row.options) : undefined);
    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(row.category_id && { category_id: String(row.category_id) }),
      ...(row.categoryId && { category_id: String(row.categoryId) }),
      ...(row.category && typeof row.category === 'string' && { category_id: row.category }),
      type: pickStr(row.type) || 'mcq',
      text: pickStr(row.text) ?? pickStr(row.question) ?? pickStr(row.title) ?? '',
      ...(optionsJson !== undefined && { options_json: String(optionsJson) }),
      answer: pickStr(row.answer) ?? '',
      ...(row.explanation != null && { explanation: pickStr(row.explanation) }),
      ...(row.points != null && { points: pickInt(row.points) ?? 1 }),
      ...(row.difficulty != null && { difficulty: pickStr(row.difficulty) }),
      ...(row.tags != null && {
        tags: Array.isArray(row.tags) ? row.tags.join(',') : pickStr(row.tags),
      }),
      ...(row.media_url != null && { media_url: pickStr(row.media_url) }),
      ...(row.mediaUrl != null && { media_url: pickStr(row.mediaUrl) }),
    };
  },

  // model Exam { id, school_id, creator_id, name, description?, duration?,
  //              passing_score, status, is_training, randomize, max_attempts?,
  //              created_at, updated_at }
  exams: (row, schoolId, actorId) => ({
    ...(row.id && { id: String(row.id) }),
    school_id: schoolId,
    creator_id: String(row.creator_id || row.creatorId || row.ownerId || actorId),
    name: pickStr(row.name) ?? pickStr(row.title) ?? 'Untitled exam',
    ...(row.description != null && { description: pickStr(row.description) }),
    ...(row.duration != null && { duration: pickInt(row.duration) }),
    ...(row.durationMinutes != null && { duration: pickInt(row.durationMinutes) }),
    ...(row.passing_score != null && { passing_score: pickInt(row.passing_score) }),
    ...(row.passingScore != null && { passing_score: pickInt(row.passingScore) }),
    ...(row.status != null && { status: pickStr(row.status) }),
    ...(row.is_training != null && { is_training: pickBool(row.is_training) }),
    ...(row.isTraining != null && { is_training: pickBool(row.isTraining) }),
    ...(row.randomize != null && { randomize: pickBool(row.randomize) }),
    ...(row.max_attempts != null && { max_attempts: pickInt(row.max_attempts) }),
    ...(row.maxAttempts != null && { max_attempts: pickInt(row.maxAttempts) }),
    // legacy `classes: string[]`, `questions: [...]` are junctions —
    // dropped here; they belong on exam_classes / exam_questions.
  }),

  // model Setting { id, school_id, key, value, visibility, updated_at }
  // Note when items are given as a `{key:value}` object map, the caller
  // should send [{key, value}, ...]; we accept both shapes below.
  settings: (row, schoolId) => {
    if (row && typeof row === 'object' && 'key' in row) {
      return {
        ...(row.id && { id: String(row.id) }),
        school_id: schoolId,
        key: String(row.key),
        value: row.value == null ? '' : String(row.value),
        ...(row.visibility && { visibility: pickStr(row.visibility) }),
      };
    }
    // row is already reduced to key/value via routes below
    return null;
  },

  // game_presets does NOT exist in the Prisma schema. Skip silently so we
  // don't poison other writes; the frontend cache loses durability for
  // presets only.
  game_presets: () => null,

  // model AuditLog { id, school_id, actor_id?, entity_type, entity_id,
  //                  action, diff_json?, ip_address?, user_agent?, occurred_at }
  // The legacy UI writes "activity" entries shaped like
  //   { type, action, name, details, date, author, icon, color, ... }
  // which has NO entity_id at all. We map them to a minimal valid AuditLog,
  // treating the UI's `type` as entity_type and synthesizing entity_id from
  // the row's own id. Purely-visual events (no real backing entity) are
  // dropped because `entity_id` is required.
  audit_logs: (row, schoolId, actorId) => {
    // entity_id is required by the schema; if the legacy row has nothing
    // entity-like, skip the write rather than rejecting the whole batch.
    const entityId = row.entity_id || row.entityId || row.targetId;
    if (!entityId) return null;
    const entityType =
      row.entity_type || row.entityType || row.type || 'unknown';
    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(actorId && { actor_id: actorId }),
      entity_type: String(entityType),
      entity_id: String(entityId),
      action: pickStr(row.action) || 'unknown',
      ...(row.diff_json != null && { diff_json: pickStr(row.diff_json) }),
      ...(row.diffJson != null && { diff_json: pickStr(row.diffJson) }),
      ...(row.ip_address != null && { ip_address: pickStr(row.ip_address) }),
      ...(row.user_agent != null && { user_agent: pickStr(row.user_agent) }),
      ...(row.date && { occurred_at: pickDate(row.date) }),
      ...(row.occurred_at && { occurred_at: pickDate(row.occurred_at) }),
    };
  },
};

/**
 * For `settings`, the legacy UI often calls setValue_sync('settings', {...})
 * and the bridge wraps it as `{value: {...}}` instead of `{items: [...]}`.
 * Accept that alternative shape and flat-map it into [{key, value}] rows.
 */
function normalizeSettingsBody(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (body && typeof body.value === 'object' && body.value !== null) {
    return Object.entries(body.value).map(([key, value]) => ({
      key,
      value: value == null ? '' : String(value),
    }));
  }
  return null;
}

/**
 * POST /api/v1/bulk/:table
 * Body: { items: object[] } | { value: object } (settings only)
 *
 * Each row is passed through a per-table sanitizer that maps legacy
 * UI fields to the actual Prisma schema, then createMany()-ed.
 * school_id is always taken from the JWT (never trusted from the body).
 */
router.post('/:table', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { table } = req.params;
    let { items } = req.body;

    // Settings accept either {items:[{key,value}]} or {value:{k:v}} shape.
    if (table === 'settings' && !Array.isArray(items)) {
      items = normalizeSettingsBody(req.body);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'items must be a non-empty array',
      });
    }

    const sanitize = SANITIZERS[table];
    const scoped = [];
    const droppedPerRow = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (!sanitize) {
        // Unknown table — pass through with only school_id injected, but warn
        // loudly so we notice a missing sanitizer the first time it happens.
        logger.warn(`bulk.routes: no sanitizer registered for table "${table}" — passing through verbatim`);
        scoped.push({ ...item, school_id: req.schoolId });
        continue;
      }

      const cleaned = sanitize(item, req.schoolId, req.user?.id);
      if (!cleaned) continue; // sanitizer chose to skip this row (e.g. game_presets)

      // Track which legacy keys we discarded so the warning is actionable.
      const kept = new Set(Object.keys(cleaned));
      const dropped = Object.keys(item).filter(
        (k) => !kept.has(k) && k !== 'school_id' && item[k] !== undefined,
      );
      droppedPerRow.push(dropped);
      scoped.push(cleaned);
    }

    if (scoped.length === 0) {
      // Either the table is intentionally skipped (game_presets) or every row
      // was rejected by the sanitizer. Return success with count 0 — telling
      // the truth (nothing was written) but not breaking the UI.
      return res.status(201).json({ count: 0, skipped: items.length });
    }

    if (droppedPerRow.some((d) => d.length > 0)) {
      logger.info('bulk.routes: dropped legacy-only fields', {
        table,
        sample: droppedPerRow[0],
      });
    }

    // The legacy UI sends the entire array each time (not just new rows), so
    // we must UPSERT — createMany alone would skip updates to existing rows.
    // Prisma has no efficient bulk-upsert on SQLite; doing per-row upsert is
    // fine for the data sizes involved (classes/categories/users in the low
    // hundreds at most) and avoids silently dropping edits.
    const model = repo.modelFor ? repo.modelFor(table) : null;
    let upserted = 0;
    if (model && typeof model.upsert === 'function') {
      for (const row of scoped) {
        // Strip the id from the update payload so Prisma doesn't try to set
        // the primary key on update (some drivers reject that).
        const { id, ...rest } = row;
        if (id) {
          await model.upsert({
            where: { id: String(id) },
            create: row,
            update: rest,
          });
        } else {
          await model.create({ data: row });
        }
        upserted += 1;
      }
      return res.status(201).json({ count: upserted });
    }

    // Fallback: if the repo doesn't expose the underlying Prisma model,
    // use createMany (idempotent on ids) — updates to existing rows will be
    // dropped, but at least new rows are persisted.
    const result = await repo.createMany(table, scoped);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

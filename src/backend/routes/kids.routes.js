/**
 * src/backend/routes/kids.routes.js
 *
 * REST API routes for Kids Space:
 * - Templates catalog & Game Selection Engine
 * - Activities & Levels CRUD (Teacher / Admin)
 * - Real-time Gameplay & Answer Submission (Student / Player)
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { requirePrimaireSchool } from '../middleware/kids-gate.js';
import { validate, validateQuery } from '../middleware/validate.js';
import {
  KidsActivityCreateSchema,
  KidsActivityUpdateSchema,
  KidsActivityFilterSchema,
  KidsActivityLevelCreateSchema,
  KidsActivityLevelUpdateSchema,
  KidsAIGenerateSchema,
  KidsAnswerSubmissionSchema,
  KidsHintRequestSchema,
} from '../../shared/schemas/kids-activity.schema.js';
import { ROLES, SOCKET_EVENTS } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { GameTemplateRegistry } from '../services/kids/GameTemplateRegistry.js';
import { getIO } from '../realtime/socket.server.js';
import { ROOM } from '../realtime/socket.rooms.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const TEACHER_ROLES = [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN];

/**
 * Educators may open an unpublished activity in order to preview it before
 * publishing. Students may not.
 */
const isEducatorRole = (user) => !!user && TEACHER_ROLES.includes(user.role);

// ── 1. Game Templates Catalog ───────────────────────────────────────────────

router.get('/templates', (req, res) => {
  const templates = GameTemplateRegistry.getAll();
  res.json({ templates });
});

router.post('/templates/select', requireRole(TEACHER_ROLES), requirePrimaireSchool, (req, res) => {
  const { kidsGameSelector } = getContainer();
  const ranked = kidsGameSelector.selectGames(req.body);
  const best = kidsGameSelector.selectBest(req.body);
  res.json({ best, ranked });
});

// ── 2. Teacher Dashboard ────────────────────────────────────────────────────

router.get('/dashboard', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const data = await kidsActivitySvc.getDashboard(req.schoolId, req.user.role === ROLES.TEACHER ? req.user.id : null);
    res.json(data);
  } catch (err) { next(err); }
});

// ── 3. Activities CRUD ──────────────────────────────────────────────────────

router.get('/activities', requireRole(TEACHER_ROLES), requirePrimaireSchool, validateQuery(KidsActivityFilterSchema), async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const result = await kidsActivitySvc.list(req.query, req.schoolId);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/activities', requireRole(TEACHER_ROLES), requirePrimaireSchool, validate(KidsActivityCreateSchema), async (req, res, next) => {
  try {
    const { kidsActivitySvc, auditSvc } = getContainer();
    const activity = await kidsActivitySvc.create(req.body, req.schoolId, req.user.id);
    if (auditSvc) {
      await auditSvc.log({
        schoolId: req.schoolId,
        actorId: req.user.id,
        entityType: 'kids_activity',
        entityId: activity.id,
        action: 'create',
        ip: req.ip,
      });
    }
    res.status(201).json(activity);
  } catch (err) { next(err); }
});

// Lists the AI models this teacher may use in Game Studio. Registered before
// /activities/:id so "models" is never swallowed as an activity id.
router.get('/ai/models', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsAISvc } = getContainer();
    const items = await kidsAISvc.listAvailableModels(req.schoolId, req.user.id);
    res.json({ items, count: items.length });
  } catch (err) { next(err); }
});

router.post('/activities/generate', requireRole(TEACHER_ROLES), requirePrimaireSchool, validate(KidsAIGenerateSchema), async (req, res, next) => {
  try {
    const { kidsAISvc } = getContainer();
    // Returns { ..., levels, source, warnings, model }: the wizard shows the
    // model badge and the warnings so fallback content is never silent.
    const generated = await kidsAISvc.generateActivity(req.body, req.schoolId, req.user.id);
    res.json(generated);
  } catch (err) { next(err); }
});

router.get('/activities/:id', async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.getById(req.params.id, req.schoolId);
    res.json(activity);
  } catch (err) { next(err); }
});

router.put('/activities/:id', requireRole(TEACHER_ROLES), requirePrimaireSchool, validate(KidsActivityUpdateSchema), async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const updated = await kidsActivitySvc.update(req.params.id, req.body, req.schoolId);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/activities/:id', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const result = await kidsActivitySvc.delete(req.params.id, req.schoolId);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/activities/:id/publish', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.publish(req.params.id, req.schoolId);
    res.json(activity);
  } catch (err) { next(err); }
});

router.post('/activities/:id/archive', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.archive(req.params.id, req.schoolId);
    res.json(activity);
  } catch (err) { next(err); }
});

router.post('/activities/:id/duplicate', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.duplicate(req.params.id, req.schoolId, req.user.id);
    res.status(201).json(activity);
  } catch (err) { next(err); }
});

router.post('/activities/:id/favorite', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.toggleFavorite(req.params.id, req.schoolId);
    res.json(activity);
  } catch (err) { next(err); }
});

router.post('/activities/:id/change-template', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const { templateId } = req.body;
    const activity = await kidsActivitySvc.changeGameTemplate(req.params.id, templateId, req.schoolId);
    res.json(activity);
  } catch (err) { next(err); }
});

// ── 4. Levels Management ────────────────────────────────────────────────────

router.post('/activities/:id/levels', requireRole(TEACHER_ROLES), requirePrimaireSchool, validate(KidsActivityLevelCreateSchema), async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const level = await kidsActivitySvc.addLevel(req.params.id, req.body, req.schoolId);
    res.status(201).json(level);
  } catch (err) { next(err); }
});

// --- Shared question bank -------------------------------------------------
// Game Studio reuses the same Question/Category rows as the Questions tab.
// Registered under its own prefix so it cannot collide with /activities/:id.

router.get('/bank/categories', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsBankSvc } = getContainer();
    const items = await kidsBankSvc.listCategories(req.schoolId);
    res.json({ items, count: items.length });
  } catch (err) { next(err); }
});

router.get('/bank/questions', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsBankSvc } = getContainer();
    const { categoryId, type, search, limit } = req.query;
    const items = await kidsBankSvc.listQuestions(req.schoolId, { categoryId, type, search, limit });
    res.json({ items, count: items.length });
  } catch (err) { next(err); }
});

// Adds a bank question to an activity as a new linked level.
router.post('/bank/questions/:questionId/attach', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsBankSvc } = getContainer();
    const level = await kidsBankSvc.addQuestionToActivity({
      activityId: req.body?.activity_id,
      questionId: req.params.questionId,
      schoolId: req.schoolId,
    });
    res.status(201).json(level);
  } catch (err) { next(err); }
});

router.put('/levels/:levelId', requireRole(TEACHER_ROLES), requirePrimaireSchool, validate(KidsActivityLevelUpdateSchema), async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const level = await kidsActivitySvc.updateLevel(req.params.levelId, req.body, req.schoolId);
    res.json(level);
  } catch (err) { next(err); }
});

router.delete('/levels/:levelId', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const result = await kidsActivitySvc.removeLevel(req.params.levelId, req.schoolId);
    res.json(result);
  } catch (err) { next(err); }
});

router.put('/activities/:id/levels/reorder', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const { orderedIds } = req.body;
    await kidsActivitySvc.reorderLevels(req.params.id, orderedIds, req.schoolId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── 5. Teacher Results View ─────────────────────────────────────────────────

router.get('/activities/:id/results', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    const results = await kidsSessionSvc.getActivityResults(req.params.id, req.schoolId);
    res.json(results);
  } catch (err) { next(err); }
});

router.get('/activities/:id/analytics', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    res.json(await kidsSessionSvc.getActivityAnalytics(req.params.id, req.schoolId));
  } catch (err) { next(err); }
});

/** Snapshot for the teacher live monitor panel (polled once on open). */
router.get('/activities/:id/live', requireRole(TEACHER_ROLES), requirePrimaireSchool, async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    res.json(await kidsSessionSvc.listLiveSessions(req.params.id, req.schoolId));
  } catch (err) { next(err); }
});

// ── 6. Student Gameplay Endpoints (Open to all students & teachers in school) ─

router.get('/play/join/:code', async (req, res, next) => {
  try {
    const { kidsActivitySvc } = getContainer();
    const activity = await kidsActivitySvc.getByJoinCode(req.params.code);
    res.json({
      id: activity.id,
      title: activity.title,
      description: activity.description,
      subject: activity.subject,
      grade: activity.grade,
      age_min: activity.age_min,
      age_max: activity.age_max,
      game_template: activity.game_template,
      theme: activity.theme,
      totalLevels: activity.levels.length,
    });
  } catch (err) { next(err); }
});

router.post('/play/:activityId/start', async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    const sessionData = await kidsSessionSvc.startOrResume(
      req.params.activityId,
      req.user.id,
      req.schoolId,
      { isEducator: isEducatorRole(req.user) }
    );
    res.json(sessionData);
  } catch (err) { next(err); }
});

router.post('/play/session/:sessionId/answer', validate(KidsAnswerSubmissionSchema), async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    const { level_id, answer, time_ms, attempts } = req.body;
    const result = await kidsSessionSvc.submitAnswer(
      req.params.sessionId,
      level_id,
      answer,
      time_ms,
      attempts,
      req.user
    );

    // Notify room if Socket.io is active
    try {
      const io = getIO();
      const activityId = result.session.activity_id;
      io.to(ROOM.kidsActivity(activityId)).emit(SOCKET_EVENTS.KIDS_PROGRESS, {
        userId: req.user.id,
        name: req.user.name || req.user.username,
        score: result.newScore,
        levelIndex: result.session.current_level,
        stars: result.stars,
        completed: result.completed,
      });
    } catch (_) {}

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/play/session/:sessionId/hint', validate(KidsHintRequestSchema), async (req, res, next) => {
  try {
    const { kidsSessionSvc } = getContainer();
    const hintData = await kidsSessionSvc.requestHint(req.params.sessionId, req.body.level_id, req.user);
    res.json(hintData);
  } catch (err) { next(err); }
});

export default router;

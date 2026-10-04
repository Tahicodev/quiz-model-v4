/**
 * src/backend/routes/kids.routes.js
 * Kids Games API — Teacher/Admin CRUD + Public Player Endpoints
 * Mounted at /api/v1/kids (registered in server.js)
 *
 * Layout: public PIN-player routes are registered BEFORE the auth middleware
 * so kids can play without a login (plan §6.2). Everything else requires
 * JWT + tenant (plan §6.1).
 */

import { randomUUID } from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ROLES } from '../../shared/constants.js';
import {
  KidsGameCreateSchema,
  KidsGameUpdateSchema,
  KidsGameFilterSchema,
  KidsSessionCreateSchema,
  KidsSessionCompleteSchema,
  KidsAIGenerateSchema,
} from '../../shared/schemas/kids-game.schema.js';
import { normalizeKidQuestion, KidsGameService } from '../../frontend/services/KidsGameService.js';
import { getContainer } from '../container.js';
import { NotFoundError } from '../../shared/errors.js';

const router = Router();

// ─── Public Kid Player Endpoints (no auth, plan §6.2) ───
// Registered BEFORE requireAuth so PIN play works without a login.

const publicRouter = Router();

// GET /api/v1/kids/play/:pin — Get published game data by PIN (no answers)
publicRouter.get('/:pin', async (req, res, next) => {
  try {
    const { kidsGameSvc } = getContainer();
    const game = await kidsGameSvc.getByPin(req.params.pin);
    res.json(game);
  } catch (err) { next(err); }
});

// POST /api/v1/kids/play/:pin/session — Start a game session
publicRouter.post('/:pin/session', validate(KidsSessionCreateSchema), async (req, res, next) => {
  try {
    const { kidsGameSvc } = getContainer();
    const { session, game, totalPoints } = await kidsGameSvc.startSession(req.params.pin, req.body);
    res.json({ session: { id: session.id, gameId: session.game_id }, game, totalPoints });
  } catch (err) { next(err); }
});

// PATCH /api/v1/kids/play/session/:sessionId — Submit answers + complete session
publicRouter.patch('/session/:sessionId', validate(KidsSessionCompleteSchema), async (req, res, next) => {
  try {
    const { kidsGameSvc, repo } = getContainer();
    const session = await repo.getById('kidsGameSessions', req.params.sessionId);
    if (!session) throw new NotFoundError('Session');

    const game = await kidsGameSvc.getById(session.game_id);
    const questions = Array.isArray(game.questions_json) ? game.questions_json : [];
    const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

    const result = await kidsGameSvc.submitAnswers(req.params.sessionId, req.body, totalPoints);
    res.json(result);
  } catch (err) { next(err); }
});

router.use('/play', publicRouter);

// ─── Teacher/Admin Endpoints (auth required, plan §6.1) ───
router.use(requireAuth, enforceTenant);

const KIDS_CRUD_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

router.get('/', validateQuery(KidsGameFilterSchema), async (req, res, next) => {
  try {
    const { kidsGameSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, teacher_id, ...filters } = req.query;

    // Teachers only see their own games; admins see all (or filter by teacher_id)
    const effectiveFilters = { ...filters, school_id: req.schoolId };
    if (req.user.role === ROLES.TEACHER) {
      effectiveFilters.teacher_id = req.user.id;
    } else if (teacher_id) {
      effectiveFilters.teacher_id = teacher_id;
    }

    const result = await kidsGameSvc.list(effectiveFilters, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireRole(KIDS_CRUD_ROLES), validate(KidsGameCreateSchema), async (req, res, next) => {
  try {
    const { kidsGameSvc, auditSvc } = getContainer();
    const game = await kidsGameSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'kidsGame', entityId: game.id, action: 'create', ip: req.ip });
    res.status(201).json(game);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { kidsGameSvc } = getContainer();
    const game = await kidsGameSvc.getById(req.params.id, req.schoolId);
    // Teachers can only see their own games
    if (req.user.role === ROLES.TEACHER && game.teacher_id !== req.user.id) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Not your game' });
    }
    res.json(game);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(KIDS_CRUD_ROLES), validate(KidsGameUpdateSchema), async (req, res, next) => {
  try {
    const { kidsGameSvc, auditSvc } = getContainer();
    const updated = await kidsGameSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'kidsGame', entityId: req.params.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(KIDS_CRUD_ROLES), async (req, res, next) => {
  try {
    const { kidsGameSvc, auditSvc } = getContainer();
    await kidsGameSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'kidsGame', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/publish', requireRole(KIDS_CRUD_ROLES), async (req, res, next) => {
  try {
    const { kidsGameSvc, auditSvc } = getContainer();
    const game = await kidsGameSvc.publish(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'kidsGame', entityId: req.params.id, action: 'publish', ip: req.ip });
    res.json(game);
  } catch (err) { next(err); }
});

router.post('/:id/archive', requireRole(KIDS_CRUD_ROLES), async (req, res, next) => {
  try {
    const { kidsGameSvc, auditSvc } = getContainer();
    const game = await kidsGameSvc.archive(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'kidsGame', entityId: req.params.id, action: 'archive', ip: req.ip });
    res.json(game);
  } catch (err) { next(err); }
});

router.get('/:id/sessions', async (req, res, next) => {
  try {
    const { kidsGameSvc } = getContainer();
    const sessions = await kidsGameSvc.getSessions(req.params.id, req.user);
    res.json({ data: sessions });
  } catch (err) { next(err); }
});

// ─── AI Generation for Kids Games (plan §3 / §8) ───
// Wraps the existing AI pipeline: game_type → question type, kid audience
// params injected, output converted to canonical kid questions.

/** AI-service draft shape → canonical kid question (plan §2.3). */
function aiDraftToKidQuestion(draft, extra = {}) {
  const options = Array.isArray(draft.options)
    ? draft.options.map((o) => (o && typeof o === 'object' ? String(o.label ?? o.text ?? '') : String(o ?? '')).trim()).filter(Boolean)
    : [];
  return normalizeKidQuestion({
    id: draft.id || randomUUID(),
    type: draft.type || 'multiple-choice',
    text: draft.question || draft.text || '',
    options_json: JSON.stringify(options),
    answer: draft.answer || '',
    explanation: draft.explanation || '',
    points: draft.points ?? 1,
    difficulty: draft.difficulty || 'easy',
    media_url: draft.media_url || null,
    ...extra,
  });
}

router.post('/ai/generate', requireRole(KIDS_CRUD_ROLES), validate(KidsAIGenerateSchema), async (req, res, next) => {
  try {
    const { aiSvc, aiConfigSvc } = getContainer();
    const { game_type, topic, count, grade, language, configId } = req.body;

    // AIService.buildStructurePrompt speaks legacy type names.
    const aiTypeMap = {
      'bubble-pop': 'multiple-choice',
      'star-collector': 'multiple-choice-multi',
      'leap-frog': 'true-false',
      'sort-it-out': 'odd-one-out',
      'pair-party': 'matching-pairs',
      'build-a-tower': 'draggable',
      'magic-words': 'fill-blank',
      'code-explorer': 'code',
    };
    const aiType = aiTypeMap[game_type] || 'multiple-choice';

    // Resolve a generation-ready config (with decrypted key). An explicit
    // pick wins; otherwise the school default, otherwise the first visible
    // config — same policy as POST /ai/generate/structured.
    let config = null;
    if (configId) {
      try {
        config = await aiConfigSvc.resolveForGeneration(req.user, req.schoolId, configId);
      } catch {
        config = null; // stale/deleted pick — fall through to the default
      }
    }
    if (!config) {
      const listed = await aiConfigSvc.list(req.user, req.schoolId);
      const visible = Array.isArray(listed) ? listed : (listed?.data ?? []);
      const pick = visible.find((c) => c.is_default) ?? visible[0] ?? null;
      if (pick) {
        config = await aiConfigSvc.resolveForGeneration(req.user, req.schoolId, pick.id);
      }
    }
    if (!config) {
      return res.status(422).json({
        code: 'NO_AI_CONFIG',
        message: 'No AI model is available. Ask an admin to add a shared model in Settings → AI Generation, or add your own personal model there.',
      });
    }

    const drafts = await aiSvc.generateWithProvider(config, {
      topic,
      typeCounts: { [aiType]: count },
      difficulty: 'easy',
      points: 1,
      language,
      imageOptions: false,
    });

    const extra = KidsGameService.getAIConfigForGame(game_type);
    const questions = (Array.isArray(drafts) ? drafts : []).map((d) => aiDraftToKidQuestion(d, extra));

    res.json({ data: questions, count: questions.length });
  } catch (err) { next(err); }
});

export default router;

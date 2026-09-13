/**
 * src/backend/routes/ai.routes.js
 *
 * AI/LLM endpoints for question generation and RAG.
 * Mount at /api/v1/ai (registered in server.js).
 *
 * All endpoints require JWT + admin role.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { listProviderModels } from '../services/AIConfigService.js';
import { z } from 'zod';

const router = Router();
router.use(requireAuth, enforceTenant);

// ── Schemas ──────────────────────────────────────────────────────────────────

const GenerateSchema = z.object({
  topic:      z.string().min(1).max(500),
  count:      z.coerce.number().int().min(1).max(20).default(3),
  type:       z.enum(['mcq','true-false','fill-blank','matching','order']).default('mcq'),
  difficulty: z.enum(['easy','medium','hard']).default('medium'),
});

const GenerateTextSchema = z.object({
  text:  z.string().min(1).max(10000),
  count: z.coerce.number().int().min(1).max(20).default(3),
  type:  z.enum(['mcq','true-false','fill-blank','matching','order']).default('mcq'),
});

const RAGQuerySchema = z.object({
  question: z.string().min(1).max(1000),
});

const IngestSchema = z.object({
  content:  z.string().min(1).max(50000),
  filename: z.string().max(200).optional().default('unnamed.txt'),
});

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai/generate
 * Generate questions about a topic via LLM.
 */
router.post('/generate', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }

    const { aiSvc } = getContainer();
    const result = await aiSvc.generateQuestions({
      ...parsed.data,
      schoolId: req.schoolId,
    });
    res.json({ data: result, count: result.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/generate/text
 * Extract questions from provided source text.
 */
router.post('/generate/text', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const parsed = GenerateTextSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }

    const { aiSvc } = getContainer();
    const result = await aiSvc.generateFromText(parsed.data);
    res.json({ data: result, count: result.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/rag/ingest
 * Ingest a document (provide raw text content).
 */
router.post('/rag/ingest', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const parsed = IngestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }

    const { ragSvc } = getContainer();
    const result = await ragSvc.ingestDocument({
      content: parsed.data.content,
      filename: parsed.data.filename,
      schoolId: req.schoolId,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/rag/query
 * Query the RAG store with a question.
 */
router.post('/rag/query', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const parsed = RAGQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }

    const { ragSvc } = getContainer();
    const result = await ragSvc.query({
      question: parsed.data.question,
      schoolId: req.schoolId,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/ai/rag/documents
 * List all ingested documents.
 */
router.get('/rag/documents', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { ragSvc } = getContainer();
    const docs = await ragSvc.listDocuments(req.schoolId);
    res.json({ data: docs });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/v1/ai/rag/documents/:id
 * Delete an ingested document.
 */
router.delete('/rag/documents/:id', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { ragSvc } = getContainer();
    await ragSvc.deleteDocument(req.params.id, req.schoolId);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ───────────────────────────────────────────────────────────────────────────
// Model configuration (Settings → AI Generation).
// Admins manage shared models (key encrypted server-side, never exposed);
// teachers pick a shared model or register their own personal provider.
// Everyone sees only their school's shared models + their own entries;
// admins see every entry in the school.
// ───────────────────────────────────────────────────────────────────────────

const AI_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

const ConfigCreateSchema = z.object({
  provider: z.enum(['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'custom']),
  name: z.string().min(1).max(120),
  model_id: z.string().min(1).max(200),
  base_url: z.string().max(500).optional(),
  api_key: z.string().max(500).optional(),
  shared: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
});

/**
 * GET /api/v1/ai/configs
 * List AI configs visible to the caller (keys never included).
 */
router.get('/configs', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const { aiConfigSvc } = getContainer();
    const data = await aiConfigSvc.list(req.user, req.schoolId);
    res.json({ data });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/configs
 * Create a shared (admin) or personal (any role) AI config.
 */
router.post('/configs', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const parsed = ConfigCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }
    const { aiConfigSvc } = getContainer();
    const config = await aiConfigSvc.create(req.user, req.schoolId, parsed.data);
    res.status(201).json({ data: config });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/v1/ai/configs/:id
 * Delete a config (admins: any; teachers: own only).
 */
router.delete('/configs/:id', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const { aiConfigSvc } = getContainer();
    await aiConfigSvc.remove(req.user, req.schoolId, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/configs/:id/test
 * Verify a stored config actually reaches its provider.
 */
router.post('/configs/:id/test', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const { aiConfigSvc } = getContainer();
    const result = await aiConfigSvc.test(req.user, req.schoolId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/models/refresh
 * Live-fetch the provider's current model list (admin "load models" flow).
 * Body: { provider, api_key?, base_url? }
 */
router.post('/models/refresh', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const provider = String(req.body?.provider || '').toLowerCase();
    if (!provider) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: { provider: ['Provider is required'] } });
    }
    const models = await listProviderModels({
      provider,
      apiKey: req.body?.api_key || undefined,
      baseUrl: req.body?.base_url || undefined,
    });
    res.json({ data: models, count: models.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/generate/structured
 * Generate questions in the app's exact structure using either a stored
 * config (configId) or a one-off custom provider block. Runs server-side.
 */
const StructuredGenerateSchema = z.object({
  configId: z.string().max(100).optional(),
  custom: z.object({
    provider: z.enum(['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'custom']).optional(),
    model_id: z.string().max(200).optional(),
    base_url: z.string().max(500).optional(),
    api_key: z.string().max(500).optional(),
    save: z.boolean().optional(),
    name: z.string().max(120).optional(),
  }).optional(),
  topic: z.string().min(1).max(8000),
  typeCounts: z.record(z.string(), z.coerce.number().int().min(0).max(20)).optional().default({}),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  points: z.coerce.number().int().min(1).max(100).default(1),
  language: z.string().max(40).default('English'),
});

router.post('/generate/structured', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const parsed = StructuredGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }
    const { aiConfigSvc, aiSvc } = getContainer();
    const params = parsed.data;

    let config = null;
    if (params.configId) {
      config = await aiConfigSvc.resolveForGeneration(req.user, req.schoolId, params.configId);
    } else if (params.custom?.model_id) {
      const c = params.custom;
      config = {
        provider: c.provider || 'custom',
        model_id: c.model_id,
        base_url: c.base_url || null,
        api_key: c.api_key || null,
      };
      // Teacher typed a custom setup and asked to remember it — store as a
      // personal config (key encrypted; never returned).
      if (c.save) {
        try {
          await aiConfigSvc.create(req.user, req.schoolId, {
            provider: c.provider || 'custom',
            name: c.name || `${c.model_id} (mine)`,
            model_id: c.model_id,
            base_url: c.base_url,
            api_key: c.api_key,
            shared: false,
          });
        } catch (e) {
          // Non-fatal: generation still proceeds with the one-off config.
        }
      }
    } else {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: { configId: ['Pick a model or provide a custom one'] } });
    }

    const questions = await aiSvc.generateWithProvider(config, {
      topic: params.topic,
      typeCounts: params.typeCounts,
      difficulty: params.difficulty,
      points: params.points,
      language: params.language,
    });
    res.json({ data: questions, count: questions.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/ai/prompt
 * Returns the exact structure prompt for keyless users to paste into
 * ChatGPT/Claude — the generated JSON can then be imported via
 * Settings → Data → "Import AI-Generated Questions".
 */
router.post('/prompt', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const { aiSvc } = getContainer();
    const prompt = aiSvc.buildStructurePrompt({
      topic: String(req.body?.topic || 'general knowledge'),
      typeCounts: req.body?.typeCounts || {},
      difficulty: ['easy', 'medium', 'hard'].includes(req.body?.difficulty) ? req.body.difficulty : 'medium',
      points: Number(req.body?.points) > 0 ? Math.min(Number(req.body.points), 100) : 1,
      language: String(req.body?.language || 'English'),
    });
    res.json({ prompt });
  } catch (err) { next(err); }
});

export default router;

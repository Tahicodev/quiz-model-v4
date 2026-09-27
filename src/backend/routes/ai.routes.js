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
import { AppError } from '../../shared/errors.js';
import { z } from 'zod';
import { isImageOnlyModel } from '../services/AIService.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// ── Schemas ──────────────────────────────────────────────────────────────────

const GenerateSchema = z.object({
  topic:      z.string().min(1).max(500),
  count:      z.coerce.number().int().min(1).max(20).default(3),
  type:       z.enum(['mcq','true-false','fill-blank','matching','order']).default('mcq'),
  difficulty: z.enum(['easy','medium','hard','mixed']).default('medium'),
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
 * POST /api/v1/ai/generate/image-question
 * Build ONE manually-authored question (Images option style). The teacher
 * writes the question text and describes the picture for every option; the
 * chosen Image Model renders those descriptions into real uploaded images.
 * No LLM text generation happens — only the image provider is called.
 */
const ImageQuestionSchema = z.object({
  imageConfigId: z.string().max(100),
  questionText: z.string().min(1).max(8000),
  options: z.array(
    z.object({
      label: z.string().max(200),
      // The teacher's description of what the image must show (draft prompt).
      image: z.string().min(1).max(2000),
    }),
  ).min(2).max(10),
  answer: z.string().max(200),
  points: z.coerce.number().int().min(1).max(100).default(1),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  language: z.string().max(40).default('English'),
});

router.post('/generate/image-question', requireRole(AI_ROLES), async (req, res, next) => {
  try {
    const parsed = ImageQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
    }
    const { aiConfigSvc, imageGenSvc } = getContainer();
    const params = parsed.data;

    const imageConfig = await aiConfigSvc.resolveForGeneration(req.user, req.schoolId, params.imageConfigId);
    const provider = String(imageConfig.provider || '').toLowerCase();
    const model = String(imageConfig.model_id || '').trim();
    const canImage = imageGenSvc.isImageProvider(provider) || (provider === 'google' && isImageOnlyModel(model));
    if (!canImage) {
      throw new AppError('AI_MODEL_UNSUPPORTED', `"${imageConfig.model_id}" cannot generate images. Pick an OpenAI, OpenRouter or Google image (e.g. Nano Banana) model.`, 422);
    }

    // Craft a single multiple-choice draft: the option "image" field holds the
    // teacher's description, which render() turns into a real picture.
    const draft = {
      type: 'multiple-choice',
      question: params.questionText,
      options: params.options.map((o) => ({ label: o.label, image: o.image })),
      answer: params.answer,
      imageMode: true,
      requireImages: true,
      difficulty: params.difficulty,
      points: params.points,
      explanation: '',
    };

    const { questions, note } = await imageGenSvc.render({ config: imageConfig, questions: [draft] });
    const generatedQuestion = questions?.[0];
    if (!generatedQuestion?.imageMode || !(generatedQuestion.options || []).some((option) => option?.image)) {
      throw new AppError(
        'AI_IMAGE_GENERATION_FAILED',
        note || 'The selected image model did not return option images. Check its API key, model access, and image-generation support, then try again.',
        502,
      );
    }
    res.json({ data: questions, count: questions.length, note });
  } catch (err) {
    // AppError (bad config / unsupported model) flows through normally.
    if (err instanceof AppError) return next(err);
    const detail = err && err.message ? String(err.message) : 'The image generation call failed — check your key and model, then try again.';
    next(new AppError('AI_IMAGE_GENERATION_FAILED', detail, 502));
  }
});

/**
 * POST /api/v1/ai/generate/structured
 * Generate questions in the app's exact structure using either a stored
 * config (configId) or a one-off custom provider block. Runs server-side.
 */
const StructuredGenerateSchema = z.object({
  configId: z.string().max(100).optional(),
  // When the teacher picks distinct models for questions and option images,
  // the TEXT config keeps writing the questions while imageConfigId is the
  // config that renders the option pictures. Falls back to the text config.
  // .nullish() tolerates the client sending null when "Auto" is selected.
  imageConfigId: z.string().max(100).nullish(),
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
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  points: z.coerce.number().int().min(1).max(100).default(1),
  language: z.string().max(40).default('English'),
  // Image-option generation for multiple-choice / multi / odd-one-out /
  // draggable. Only OpenAI and OpenRouter providers auto-generate real
  // images; everything else falls back to text options.
  imageOptions: z.boolean().optional().default(true),
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

    // An explicit Image Model picker lets the teacher render the option images
    // with a different config (own provider/key). Resolve it up-front so a bad
    // id fails fast instead of after wasting text-generation tokens.
    const imageConfig = params.imageConfigId
      ? await aiConfigSvc.resolveForGeneration(req.user, req.schoolId, params.imageConfigId)
      : null;

    const questions = await aiSvc.generateWithProvider(config, {
      topic: params.topic,
      typeCounts: params.typeCounts,
      difficulty: params.difficulty,
      points: params.points,
      language: params.language,
      imageOptions: params.imageOptions,
    });

    // Image-option questions (multiple-choice, multi, odd-one-out, draggable)
    // arrive as drafts whose options are { label, image-prompt }. Turn those
    // prompts into real pictures for OpenAI/OpenRouter/Google image models, or
    // fall back to text. The image config renders the options when chosen.
    const { imageGenSvc } = getContainer();
    const { questions: finalQuestions, note } = await imageGenSvc.render({ config: imageConfig || config, questions });
    // Only describe the auto-pairing when no explicit image config was chosen —
    // render()'s own note already says which model produced the pictures.
    const pairingNote = (!params.imageConfigId && config?._imageOnlyOriginalModel)
      ? ` "${config._imageOnlyOriginalModel}" only generates images, so the question text was written via ${config.model_id} (same key) and the option images via ${config._imageOnlyOriginalModel}.`
      : '';
    res.json({ data: finalQuestions, count: finalQuestions.length, note: note + pairingNote });
  } catch (err) {
    // ValidationError / AppError flow through the normal handler (422 & co).
    // Plain provider/fetch errors get a readable 502 instead of a masked 500.
    if (err instanceof AppError) return next(err);
    const detail = err && err.message ? String(err.message) : 'The AI provider call failed — check your connection, key and model, then try again.';
    next(new AppError('AI_PROVIDER_ERROR', detail, 502));
  }
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
      difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(req.body?.difficulty) ? req.body.difficulty : 'medium',
      points: Number(req.body?.points) > 0 ? Math.min(Number(req.body.points), 100) : 1,
      language: String(req.body?.language || 'English'),
      imageOptions: req.body?.imageOptions !== false,
    });
    res.json({ prompt });
  } catch (err) { next(err); }
});

export default router;

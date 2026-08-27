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

export default router;

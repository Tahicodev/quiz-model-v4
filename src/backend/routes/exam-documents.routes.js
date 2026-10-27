/**
 * src/backend/routes/exam-documents.routes.js
 *
 * Authorized server-side generation of printable exam documents:
 *
 *   GET   /api/v1/exam-documents/:examId/header   → saved header + resolved defaults
 *   PUT   /api/v1/exam-documents/:examId/header   → persist the header slice
 *   POST  /api/v1/exam-documents/:examId/preview  → { html, printHtml, model, scoring, warnings }
 *   POST  /api/v1/exam-documents/:examId/export   → binary PDF / DOCX
 *
 * Generation happens here and NOT in the browser on purpose:
 *  - the teacher answer key must never be reachable by a student, and a
 *    client-side generator would have to receive the answers first;
 *  - files leave the server as an in-memory response body — nothing is written
 *    to disk, so there is no predictable answer-key URL to guess and no temp
 *    file to clean up;
 *  - the /20 rule is enforced server-side: an exam whose points do not add up
 *    is refused unless the teacher explicitly confirmed the normalization.
 *
 * Access model copied from exams.routes.js: authoring roles only, and a teacher
 * can only document their own exams.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import {
  ExamDocBuildSchema,
  ExamDocExportSchema,
  ExamDocHeaderSchema,
} from '../../shared/schemas/examDocument.schema.js';
import { getContainer } from '../container.js';
import { renderExamDocumentHtml, renderPrintablePage } from '../services/exam-doc/htmlPreview.js';
import { EXAM_DOC_PAPER_CSS, EXAM_DOC_PRINT_CSS } from '../services/exam-doc/previewCss.js';
import { renderExamDocumentPdf } from '../services/exam-doc/pdfRenderer.js';
import { renderExamDocumentDocx } from '../services/exam-doc/docxRenderer.js';

const router = Router();
router.use(requireAuth, enforceTenant, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]));

const EXAM_DOC_MIME = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

/** Teachers document only the exams they created; admins document any of their school. */
function assertExamOwnership(exam, user) {
  if (!exam) return;
  if (user.role !== ROLES.TEACHER) return;
  if (exam.creator_id !== user.id) {
    throw new ForbiddenError('Not your exam');
  }
}

/** Tenant-scoped existence + ownership check, shared by every route. */
async function loadExam(examSvc, examId, req) {
  const exam = await examSvc.getWithQuestions(String(examId), req.schoolId).catch(() => null);
  if (!exam) throw new NotFoundError('Exam');
  assertExamOwnership(exam, req.user);
  return exam;
}

/** `Devoir surveillé n°1 🕒` → `devoir-surveille-n-1` (safe in every OS). */
function slugify(value) {
  return String(value || 'exam')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'exam';
}

function documentSlug(document) {
  return document === 'answer_key' ? 'answer-key' : 'student';
}

router.get('/:examId/header', async (req, res, next) => {
  try {
    const { examSvc, examDocSvc } = getContainer();
    await loadExam(examSvc, req.params.examId, req);
    const result = await examDocSvc.resolveHeader(req.params.examId, req.schoolId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:examId/header', validate(ExamDocHeaderSchema), async (req, res, next) => {
  try {
    const { examSvc, examDocSvc, auditSvc } = getContainer();
    const exam = await loadExam(examSvc, req.params.examId, req);
    // Read-modify-write of one key inside options_json: presetSnapshot,
    // class assignments and every other slice keep surviving.
    const result = await examDocSvc.saveHeader(exam.id, req.schoolId, req.body);
    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'exam',
      entityId: exam.id,
      action: 'update-document-header',
      ip: req.ip,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:examId/preview', validate(ExamDocBuildSchema), async (req, res, next) => {
  try {
    const { examSvc, examDocSvc } = getContainer();
    await loadExam(examSvc, req.params.examId, req);
    const model = await examDocSvc.buildExamDocument({
      examId: req.params.examId,
      schoolId: req.schoolId,
      document: req.body.document,
      header: req.body.header || null,
      normalization: req.body.normalization || null,
    });
    const html = renderExamDocumentHtml(model);
    res.json({
      meta: model.meta,
      header: model.header,
      scoring: model.scoring,
      warnings: model.warnings,
      confidentiality: model.confidentiality,
      sections: model.sections.map((s) => ({ id: s.id, title: s.title, subtotal: s.subtotal, count: s.items.length })),
      html,
      printHtml: renderPrintablePage(model, `${EXAM_DOC_PAPER_CSS}\n${EXAM_DOC_PRINT_CSS}`),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:examId/export', validate(ExamDocExportSchema), async (req, res, next) => {
  try {
    const { examSvc, examDocSvc, auditSvc } = getContainer();
    const exam = await loadExam(examSvc, req.params.examId, req);
    const model = await examDocSvc.buildExamDocument({
      examId: exam.id,
      schoolId: req.schoolId,
      document: req.body.document,
      header: req.body.header || null,
      normalization: req.body.normalization || null,
    });

    // The barème rule is a hard gate: never print a total that pretends to be
    // /20 while the stored points say otherwise, unless the teacher confirmed
    // the document-only normalization.
    if (model.scoring.error) {
      return res.status(400).json({
        error: model.scoring.error,
        scoring: model.scoring,
        warnings: model.warnings,
      });
    }

    const format = req.body.format;
    const rendered =
      format === 'pdf'
        ? await renderExamDocumentPdf(model)
        : await renderExamDocumentDocx(model);
    const warnings = rendered.warnings || [];
    if (warnings.length) res.setHeader('X-Exam-Doc-Warnings', encodeURIComponent(JSON.stringify(warnings)));

    const filename = `exam-${slugify(exam.name)}-${documentSlug(req.body.document)}.${format}`;
    res.setHeader('Content-Type', EXAM_DOC_MIME[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', String(rendered.buffer.length));
    res.setHeader('Cache-Control', 'no-store');

    if (req.body.document === 'answer_key') {
      // Confidential artefacts are traced: who printed an answer key, when.
      await auditSvc
        .log({
          schoolId: req.schoolId,
          actorId: req.user.id,
          entityType: 'exam',
          entityId: exam.id,
          action: 'export-answer-key',
          ip: req.ip,
        })
        .catch(() => {});
    }

    res.send(rendered.buffer);
  } catch (err) {
    next(err);
  }
});

export default router;

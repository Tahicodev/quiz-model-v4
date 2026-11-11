/**
 * src/backend/routes/generated-documents.routes.js
 *
 * Library of the documents the app generated for teachers. Every export
 * (course booklet, lesson prep sheet, exercise with correction, exam paper) is
 * written under uploads/generated/... and registered here, so the teacher can
 * find it again, see its in-app path, download or delete it.
 *
 *   GET    /api/v1/generated-documents          → { data, total }
 *   GET    /api/v1/generated-documents/:id/download → the stored binary
 *   DELETE /api/v1/generated-documents/:id      → removes row + file
 *
 * Tenant scoping comes from enforceTenant; teachers additionally only ever see
 * and delete the documents they created.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]));

const MIME_BY_EXT = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

const isTeacher = (user) => user.role === ROLES.TEACHER;

router.get('/', async (req, res, next) => {
  try {
    const { genDocSvc } = getContainer();
    const { kind, courseId, lessonId, examId, search = '', limit = 100, offset = 0 } = req.query;
    const result = await genDocSvc.list({
      schoolId: req.schoolId,
      kind: kind || null,
      courseId: courseId || null,
      lessonId: lessonId || null,
      examId: examId || null,
      search,
      limit,
      offset,
      mineUserId: isTeacher(req.user) ? req.user.id : null,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const { genDocSvc } = getContainer();
    const { row, buffer } = await genDocSvc.readFile(req.params.id, {
      schoolId: req.schoolId,
      userId: req.user.id,
      role: req.user.role,
    });
    const ext = String(row.format || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${row.file_name}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { genDocSvc } = getContainer();
    await genDocSvc.remove(req.params.id, {
      schoolId: req.schoolId,
      userId: req.user.id,
      role: req.user.role,
    });
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
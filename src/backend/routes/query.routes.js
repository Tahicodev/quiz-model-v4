/**
 * src/backend/routes/query.routes.js
 *
 * Generic query dispatcher. The frontend ApiRepository calls
 * POST /api/v1/query/:name for operations that don't fit generic
 * CRUD (e.g. exam.withQuestions, game.sessions).
 *
 * This router delegates to PrismaRepository.query().
 *
 * TWO RULES KEEP IT SAFE
 * ───────────────────────
 * 1. ALLOW-LISTS. Only names that PrismaRepository actually implements are
 *    reachable. A name in the allow-list but not in the repository used to
 *    fall through to `default:` and throw → HTTP 500. The lists below are
 *    derived from the implemented queries, so an unknown name is a 403 and a
 *    known-but-unimplemented one is impossible.
 *
 * 2. PARAMETER CLAMPING. A caller may not choose a visibility tier above its
 *    role, and may not ask for another user's data. The dispatcher rewrites
 *    the parameters before they reach the repository — the repository is not
 *    an authorization boundary.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();

router.use(requireAuth, enforceTenant);

/**
 * Queries an administrator or teacher may run.
 * Every name here MUST exist in PrismaRepository.query().
 */
const INSTRUCTOR_QUERY_ALLOWLIST = new Set([
  'exam.withQuestions',
  'exam.availableForStudent',
  'course.withLessons',
  'course.availableForStudent',
  'game.sessions',
  'game.activeSessions',
  'session.expiredSessions',
  'settings.byVisibility',
  'tournament.leaderboard',
]);

/**
 * Queries a student may run. A student's access to their own rows is decided
 * by the repository, which scopes by the user's own school.
 */
const STUDENT_QUERY_ALLOWLIST = new Set([
  'game.sessions',
  'exam.availableForStudent',
  'course.availableForStudent',
  'settings.byVisibility',
]);

/** The highest settings visibility tier a role may read. */
const VISIBILITY_CEILING = Object.freeze({
  [ROLES.STUDENT]: 'public',
  [ROLES.TEACHER]: 'teacher',
  [ROLES.ADMIN]: 'admin',
  [ROLES.SUPER_ADMIN]: 'admin',
});

const VISIBILITY_ORDER = ['public', 'teacher', 'admin', 'system'];

/**
 * Clamp the requested settings visibility to the caller's ceiling.
 * The 'system' tier (recovery hash, backup key) is NEVER reachable through
 * this endpoint, whatever the caller asks for.
 */
function clampVisibility(requested, role) {
  const ceiling = VISIBILITY_CEILING[role] || 'public';
  const systemIndex = VISIBILITY_ORDER.indexOf('system');
  const requestedIndex = VISIBILITY_ORDER.indexOf(String(requested ?? ''));

  // An unknown or 'system' request falls back to 'public'.
  const safeIndex = requestedIndex > 0 && requestedIndex < systemIndex ? requestedIndex : 0;
  const ceilingIndex = VISIBILITY_ORDER.indexOf(ceiling);

  // Both are indices into the same array, so the comparison is numeric.
  return VISIBILITY_ORDER[Math.min(safeIndex, ceilingIndex)];
}

/**
 * POST /api/v1/query/:name
 * Body: arbitrary JSON params passed to the named query.
 * schoolId from JWT is merged into params automatically.
 */
router.post('/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    const role = req.user.role;
    const isInstructor = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(role);

    if (isInstructor) {
      if (!INSTRUCTOR_QUERY_ALLOWLIST.has(name)) {
        return next(new ForbiddenError(`Unknown or forbidden query: ${name}`));
      }
    } else if (!STUDENT_QUERY_ALLOWLIST.has(name)) {
      return next(new ForbiddenError(`Unknown or forbidden query: ${name}`));
    }

    const { repo } = getContainer();
    const params = { ...req.body, schoolId: req.schoolId };

    // ── Parameter clamping ────────────────────────────────────────────────
    // The repository is a data layer, not an authorization boundary. The
    // dispatcher decides what a caller may ask for.
    if (name === 'settings.byVisibility') {
      params.visibility = clampVisibility(params.visibility, role);
    }

    // "Available for student" queries must describe the CALLER, never an
    // arbitrary user id supplied in the body.
    if (name === 'exam.availableForStudent' || name === 'course.availableForStudent') {
      if (!isInstructor) {
        params.userId = req.user.id;
      } else if (params.userId) {
        // An instructor may only look up a student inside their own
        // organization; the repository scopes the query by the user's school.
        const target = await repo.getById('users', params.userId);
        if (!target || target.school_id !== req.schoolId) {
          return next(new ForbiddenError('That account is not in your organization'));
        }
      }
    }

    if (name === 'game.sessions' && !isInstructor) {
      // A student may only read the sessions of a game they joined.
      params.userId = req.user.id;
    }

    const result = await repo.query(name, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

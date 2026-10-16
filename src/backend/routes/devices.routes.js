/**
 * src/backend/routes/devices.routes.js
 *
 * Classroom device registry — the admin UI's "Classroom Devices" tab.
 *
 *   GET    /api/v1/devices             list devices for the caller's school
 *   PATCH  /api/v1/devices/:id         allow/block, assign to a student, rename
 *   DELETE /api/v1/devices/:id         forget a device
 *
 * Blocking is a hard block: live sockets for the device are told and
 * disconnected immediately, and the socket `register` handler refuses future
 * reconnects until the device is allowed again.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { getTeacherClassIds } from './users.routes.js';
import { getIO } from '../realtime/socket.server.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Classroom devices is a staff surface — teachers manage their own lab, admins
// manage the whole school.
const DEVICE_ROLES = [ROLES.ADMIN, ROLES.TEACHER];

/** Disconnect every live socket that belongs to a (now blocked) device. */
function kickDeviceSockets(schoolId, deviceKey) {
	if (!deviceKey) return 0;
	let kicked = 0;
	try {
		const io = getIO();
		for (const socket of io.sockets.sockets.values()) {
			if (String(socket.data?.user?.school_id || '') !== String(schoolId)) continue;
			if (String(socket.data?.deviceId || '') !== String(deviceKey)) continue;
			try {
				socket.emit('device:blocked', {
					deviceId: deviceKey,
					message: 'This device has been blocked by a teacher.',
				});
			} catch { /* socket already gone */ }
			socket.disconnect(true);
			kicked += 1;
		}
	} catch (err) {
		// Socket layer may not be up (unit/route-only runs) — the DB block still
		// applies on the next register.
		logger.warn({ err: err?.message }, 'devices.routes: kick skipped');
	}
	return kicked;
}

router.get('/', requireRole(DEVICE_ROLES), async (req, res, next) => {
  try {
    const { deviceSvc, repo } = getContainer();
    const rows = await deviceSvc.list(req.schoolId);
    // Teacher isolation: own machine + machines of own students +
    // unassigned hardware. Other teachers' machines stay invisible.
    if (req.user.role === ROLES.TEACHER) {
      const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
      const { data: students } = await repo.getAll('users', {
        filters: { school_id: req.schoolId, role: 'student' },
        limit: 100000,
      });
      const ownStudentIds = new Set(
        (students || [])
          .filter((s) => s?.id && s.class_id && classIds.includes(String(s.class_id)))
          .map((s) => String(s.id)),
      );
      return res.json(
        rows.filter(
          (d) =>
            !d.assigned_user_id ||
            String(d.assigned_user_id) === String(req.user.id) ||
            ownStudentIds.has(String(d.assigned_user_id)),
        ),
      );
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// Teacher isolation on writes: a teacher may only touch unassigned
// hardware, their own machine, or machines of their own students. Relinking
// checks both ends, so nobody can steal or unlink another scope's machine.
async function assertTeacherDevice(req, deviceId, nextAssignedUserId = undefined) {
  if (req.user.role !== ROLES.TEACHER) return;
  const { deviceSvc, repo } = getContainer();
  const row = await deviceSvc.getById(req.schoolId, deviceId);
  if (!row) throw new NotFoundError('Device');
  const checkIds =
    nextAssignedUserId !== undefined
      ? [row.assigned_user_id, nextAssignedUserId]
      : [row.assigned_user_id];
  let students = null;
  const loadStudents = async () => {
    if (students) return students;
    const { data } = await repo.getAll('users', {
      filters: { school_id: req.schoolId, role: 'student' },
      limit: 100000,
    });
    students = data || [];
    return students;
  };
  const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
  for (const linkedId of checkIds) {
    if (!linkedId) continue;
    if (String(linkedId) === String(req.user.id)) continue;
    const roster = await loadStudents();
    const ok = roster.some(
      (s) =>
        String(s.id) === String(linkedId) &&
        s.class_id &&
        classIds.includes(String(s.class_id)),
    );
    if (!ok) throw new ForbiddenError('Not your device');
  }
}

router.patch('/:id', requireRole(DEVICE_ROLES), async (req, res, next) => {
  try {
    const { deviceSvc, auditSvc } = getContainer();
    const { status, assigned_user_id, hostname, note } = req.body || {};

    await assertTeacherDevice(req, req.params.id, assigned_user_id);

		let device = null;
		if (status !== undefined) {
			device = await deviceSvc.setStatus(req.schoolId, req.params.id, status);
		}
		if (assigned_user_id !== undefined) {
			device = await deviceSvc.assign(req.schoolId, req.params.id, assigned_user_id);
		}
		if (hostname !== undefined || note !== undefined) {
			device = await deviceSvc.rename(req.schoolId, req.params.id, { hostname, note });
		}
		if (!device) device = await deviceSvc.getById(req.schoolId, req.params.id);
		if (!device) return res.status(404).json({ error: 'Device not found' });

		await auditSvc.log({
			schoolId: req.schoolId,
			actorId: req.user.id,
			entityType: 'device',
			entityId: device.id,
			action: status === 'blocked' ? 'block' : status === 'allowed' ? 'allow' : 'update',
			ip: req.ip,
		});

		let kicked = 0;
		if (device.status === 'blocked') kicked = kickDeviceSockets(req.schoolId, device.device_key);

		res.json({ ...device, onlineKicked: kicked });
	} catch (err) { next(err); }
});

router.delete('/:id', requireRole(DEVICE_ROLES), async (req, res, next) => {
  try {
    const { deviceSvc, auditSvc } = getContainer();
    await assertTeacherDevice(req, req.params.id);
    await deviceSvc.remove(req.schoolId, req.params.id);
		await auditSvc.log({
			schoolId: req.schoolId,
			actorId: req.user.id,
			entityType: 'device',
			entityId: req.params.id,
			action: 'delete',
			ip: req.ip,
		});
		res.status(204).send();
	} catch (err) { next(err); }
});

export default router;

/**
 * src/backend/realtime/legacy-sync.bridge.js
 *
 * The relay surface the legacy browser clients expect beyond the game engine
 * itself. The unwired root server.js owned these handlers; under `npm start`
 * (SaaS server) they were missing, which broke:
 *   - `identify`      → admin panels never marked their socket as admin, so
 *                       game:start answered "Admin Secret is required".
 *   - `game:list`     → admin arenas could not load the authoritative lobby
 *                       list from the engine's activeGames map.
 *   - `admin:syncGames`/`admin:syncUsers`/`admin:syncGamification` → admin
 *                       panels could not push data snapshots to students.
 *
 * Auth model: sockets arrive pre-authenticated by socket.auth.js (JWT only),
 * which stamps `socket.data.user`. `identify` keeps the legacy shape
 * ({role:'admin'}) for old panels and upgrades the role from the verified
 * JWT — staff (admin/teacher/super_admin) get the admin relay surface, no
 * shared secret involved.
 */

import { logger } from '../logger.js';

const STAFF_ROLES = new Set(['admin', 'teacher', 'super_admin']);

/** Staff JWTs (verified at handshake) carry the admin relay surface. */
function isAdminSocket(socket) {
  return STAFF_ROLES.has(String(socket.data?.user?.role || '').toLowerCase());
}

function isClientSocket(socket) {
  // Under the SaaS server every authenticated socket is a "client" of the
  // relay surface; staff additionally accepts the admin-only events.
  return true;
}

/**
 * @param {import('socket.io').Server} io
 */
export function registerLegacySyncHandlers(io) {
  // School-scoped sync cache so students connecting between pushes still get
  // the last snapshot without a full bootstrap round trip.
  const syncCache = new Map(); // schoolId -> { games?, users?, gamification? }

  io.on('connection', (socket) => {
    // ── identify ────────────────────────────────────────────────────────────
    socket.on('identify', (payload = {}) => {
      const requestedRole = String(payload.role || 'client').toLowerCase();
      const jwtUser = socket.data?.user || {};
      const jwtRole = String(jwtUser.role || '').toLowerCase();
      const isStaff = STAFF_ROLES.has(jwtRole);

      // Role comes from the handshake JWT only — the shared Admin Secret is
      // gone. Staff sockets get the admin relay surface regardless of the
      // legacy `role` the panel asked for; everyone else is a plain client.
      socket.role = isStaff ? 'admin' : 'client';
      socket.adminAuthenticated = isStaff;
      if (requestedRole === 'admin' && !isStaff) {
        socket.emit('admin:auth:error', {
          message: 'Admin access requires an admin or teacher account.',
        });
      }

      const schoolId = String(jwtUser.school_id || '').trim();
      if (socket.role === 'admin') {
        const cache = schoolId ? syncCache.get(schoolId) : null;
        if (cache?.gamification) {
          socket.emit('admin:syncGamification', cache.gamification);
        }
      } else {
        if (schoolId) {
          const cache = syncCache.get(schoolId);
          if (cache?.users) socket.emit('admin:syncUsers', cache.users);
          if (cache?.games) socket.emit('admin:syncGames', cache.games);
          if (cache?.gamification) socket.emit('admin:syncGamification', cache.gamification);
        }
      }
    });

    // ── client:requestGames ──────────────────────────────────────────────────
    socket.on('client:requestGames', () => {
      if (!isClientSocket(socket)) return;
      const schoolId = String(socket.data?.user?.school_id || '').trim();
      const cache = schoolId ? syncCache.get(schoolId) : null;
      if (cache?.games) socket.emit('admin:syncGames', cache.games);
    });

    // ── client:requestUsers ───────────────────────────────────────────────────
    socket.on('client:requestUsers', () => {
      if (!isClientSocket(socket)) return;
      const schoolId = String(socket.data?.user?.school_id || '').trim();
      const cache = schoolId ? syncCache.get(schoolId) : null;
      if (cache?.users) socket.emit('admin:syncUsers', cache.users);
    });

    // ── Admin push relays ────────────────────────────────────────────────────
    const schoolIdOf = () => String(socket.data?.user?.school_id || '').trim();

    socket.on('admin:syncUsers', (payload = {}) => {
      if (!isAdminSocket(socket)) return;
      const cleanUsers = Array.isArray(payload.quizUsers)
        ? payload.quizUsers.map((user) => {
            const { passwordHash, password, ...safeUser } = user || {};
            return safeUser;
          })
        : [];
      const cleanPayload = { ...payload, quizUsers: cleanUsers };
      const schoolId = schoolIdOf();
      if (schoolId) {
        const cache = syncCache.get(schoolId) || {};
        cache.users = cleanPayload;
        syncCache.set(schoolId, cache);
        io.to(`school:${schoolId}`).emit('admin:syncUsers', cleanPayload);
        logger.debug({ schoolId, count: cleanUsers.length }, 'legacy bridge: users synced');
      } else {
        // No school scope (token without school_id): broadcast.
        io.emit('admin:syncUsers', cleanPayload);
      }
    });

    socket.on('admin:syncGames', (payload = {}) => {
      if (!isAdminSocket(socket)) return;
      const schoolId = schoolIdOf();
      if (schoolId) {
        const cache = syncCache.get(schoolId) || {};
        cache.games = payload;
        syncCache.set(schoolId, cache);
        io.to(`school:${schoolId}`).emit('admin:syncGames', payload);
        logger.debug({ schoolId, count: payload.quizGames?.length || 0 }, 'legacy bridge: games synced');
      } else {
        io.emit('admin:syncGames', payload);
      }
    });

    socket.on('admin:syncGamification', (payload = {}) => {
      if (!isAdminSocket(socket)) return;
      const schoolId = schoolIdOf();
      if (schoolId) {
        const cache = syncCache.get(schoolId) || {};
        cache.gamification = payload;
        syncCache.set(schoolId, cache);
        io.to(`school:${schoolId}`).emit('admin:syncGamification', payload);
      } else {
        io.emit('admin:syncGamification', payload);
      }
    });

    // ── student patches (fire-and-forget in the legacy server; kept no-op-safe)
    socket.on('student:syncStoredData', (payload = {}, ack) => {
      if (typeof ack === 'function') ack({ ok: true, note: 'handled by REST persistence' });
    });
  });

  logger.info('Legacy sync relay handlers registered');
}

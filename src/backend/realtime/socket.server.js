/**
 * src/backend/realtime/socket.server.js
 *
 * THE single Socket.io `io()` call for the entire backend (spec Section 11
 * non-negotiable: "One `io()` call — here. Never call it again anywhere.").
 *
 * initSocketServer attaches:
 *   - JWT handshake auth middleware (socket.auth.js) on every connection
 *   - Auto-join to the caller's school room for school-wide broadcasts
 *   - The three domain handlers (game / tournament / session)
 *   - Disconnect cleanup (socket.cleanup.js)
 *   - Optional Redis adapter for SaaS multi-instance — only loaded when
 *     config.isSaaS && config.redisUrl; local mode never imports `redis` or
 *     `@socket.io/redis-adapter` (the deps are present but unused there).
 */

import { Server } from 'socket.io';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { setAdminSecret, socketAuthMiddleware } from './socket.auth.js';
import { registerGameHandlers } from './handlers/game.handler.js';
import { registerTournamentHandlers } from './handlers/tournament.handler.js';
import { registerSessionHandlers } from './handlers/session.handler.js';
import { handleDisconnect } from './socket.cleanup.js';
import { ROOM } from './socket.rooms.js';

let _io = null;

/**
 * Initialize the Socket.io server on top of an existing httpServer. Must be
 * called exactly once — a second call throws (singleton guard).
 *
 * @param {import('http').Server} httpServer
 * @param {{ gameService: import('../../frontend/services/GameService.js').GameService,
 *           tournamentService: import('../../frontend/services/TournamentService.js').TournamentService,
 *           sessionService: import('../../frontend/services/SessionService.js').SessionService }} services
 * @returns {Promise<import('socket.io').Server>}
 */
export async function initSocketServer(httpServer, services) {

  if (_io) throw new Error('Socket.io already initialized M-bM-^@M-^T do not call initSocketServer twice');
  if (services.adminSecret) {
    setAdminSecret(services.adminSecret);
  }

  _io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    // Reconnection is handled client-side; the server just tracks connections.
  });

  // Attach Redis adapter for multi-instance SaaS (skip in local mode). The
  // dynamic imports keep local mode free of any redis module resolution.
  if (config.isSaaS && config.redisUrl) {
    const { createClient } = await import('redis');
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    _io.adapter(createAdapter(pub, sub));
    logger.info('Socket.io Redis adapter attached');
  }

  // Verify JWT on every socket connection before any event fires.
  _io.use(socketAuthMiddleware);

  _io.on('connection', (socket) => {
    logger.info({ userId: socket.data.user.id, socketId: socket.id }, 'Socket connected');

    // Auto-join the caller's school room for school-wide targeting.
    socket.join(ROOM.school(socket.data.user.school_id));

    // Register domain handlers.
    registerGameHandlers(socket, _io, services);
    registerTournamentHandlers(socket, _io, services);
    registerSessionHandlers(socket, _io, services);

    socket.on('disconnect', (reason) => {
      logger.info({ userId: socket.data.user.id, reason }, 'Socket disconnected');
      handleDisconnect(socket, _io, services);
    });
  });

  return _io;
}

/** @returns {import('socket.io').Server} */
export function getIO() {
  if (!_io) throw new Error('Socket.io not initialized. Call initSocketServer first.');
  return _io;
}

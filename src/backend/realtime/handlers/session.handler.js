/**
 * src/backend/realtime/handlers/session.handler.js
 *
 * Exam-session socket events. The only client→server session event defined in
 * SOCKET_EVENTS is SESSION_HEARTBEAT — keep-alive for an in-progress exam
 * session. When a student heartbeats, we:
 *   1. Join them to the `exam:{examId}` room so the server can later broadcast
 *      `SESSION_EXPIRED` to everyone taking that exam (e.g. when the timer hits
 *      the deadline, or the periodic cleanup job expires the session).
 *   2. Call SessionService.heartbeat() which updates last_heartbeat so the
 *      session is treated as active (vs. abandoned).
 *
 * The expiry broadcast itself is driven by the periodic cleanup job in
 * server.js (SessionService.cleanupExpiredSessions), which can use getIO() to
 * emit SESSION_EXPIRED to the affected exam room.
 */

import { SOCKET_EVENTS } from '../../../shared/constants.js';
import { joinRoom, ROOM } from '../socket.rooms.js';

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ sessionService: import('../../../frontend/services/SessionService.js').SessionService }} services
 */
export function registerSessionHandlers(socket, io, { sessionService }) {

  socket.on(SOCKET_EVENTS.SESSION_HEARTBEAT, async ({ sessionId, examId }) => {
    try {
      // Join the exam room so the server can target this session's takers
      // for expiry broadcasts. examId is optional but recommended.
      if (examId) {
        joinRoom(socket, 'exam', examId);
        socket.data.activeExamId = examId;
      }

      await sessionService.heartbeat(sessionId);
    } catch (err) {
      // Heartbeat is best-effort; never tear down the socket over a heartbeat error
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });
}

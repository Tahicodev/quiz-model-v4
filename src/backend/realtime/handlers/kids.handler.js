/**
 * src/backend/realtime/handlers/kids.handler.js
 *
 * Real-time event handlers for Kids Space activities.
 */

import { SOCKET_EVENTS, ROLES } from '../../../shared/constants.js';
import { joinRoom, leaveRoom, ROOM } from '../socket.rooms.js';
import { logger } from '../../logger.js';

const EDUCATOR_ROLES = [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN];

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ kidsSessionSvc: import('../../services/kids/KidsGameSessionService.js').KidsGameSessionService,
 *           kidsActivitySvc: import('../../services/kids/KidsActivityService.js').KidsActivityService }} services
 */
export function registerKidsHandlers(socket, io, { kidsSessionSvc, kidsActivitySvc }) {
  const user = socket.data.user;

  // ── Kids Join Activity ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.KIDS_JOIN, async ({ activityId, joinCode }, callback) => {
    try {
      let targetActivityId = activityId;
      if (!targetActivityId && joinCode) {
        const activity = await kidsActivitySvc.getByJoinCode(joinCode);
        targetActivityId = activity.id;
      }

      if (!targetActivityId) {
        throw new Error('Activity ID or valid Join Code required');
      }

      // Join room
      joinRoom(socket, 'kidsActivity', targetActivityId);
      socket.data.activeKidsActivityId = targetActivityId;

      // Start or resume session for this student
      const sessionData = await kidsSessionSvc.startOrResume(
        targetActivityId,
        user.id,
        user.school_id,
        { isEducator: EDUCATOR_ROLES.includes(user.role) }
      );

      // Notify the room that student joined (for teacher live monitor)
      socket.to(ROOM.kidsActivity(targetActivityId)).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId: user.id,
        name: user.name || user.username,
        score: sessionData.session.score,
        currentLevel: sessionData.session.current_level,
      });

      if (typeof callback === 'function') {
        callback({ success: true, data: sessionData });
      } else {
        socket.emit(SOCKET_EVENTS.KIDS_ACTIVITY_STATE, sessionData);
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Error in KIDS_JOIN');
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      } else {
        socket.emit(SOCKET_EVENTS.ERROR, { code: err.code || 'KIDS_JOIN_ERROR', message: err.message });
      }
    }
  });

  // ── Kids Answer Submission ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.KIDS_ANSWER, async ({ sessionId, levelId, answer, timeMs, attempts }, callback) => {
    try {
      const result = await kidsSessionSvc.submitAnswer(
        sessionId,
        levelId,
        answer,
        timeMs,
        attempts,
        user
      );

      // Return result directly to student
      socket.emit(SOCKET_EVENTS.KIDS_ANSWER_RESULT, result);
      if (typeof callback === 'function') callback({ success: true, data: result });

      // If activity complete, emit completion event
      if (result.completed) {
        socket.emit(SOCKET_EVENTS.KIDS_ACTIVITY_COMPLETE, {
          score: result.newScore,
          stars: result.stars,
          streak: result.session.best_streak,
        });
      }

      // Broadcast progress update to activity room (teacher monitoring)
      const activityId = socket.data.activeKidsActivityId || result.session.activity_id;
      if (activityId) {
        io.to(ROOM.kidsActivity(activityId)).emit(SOCKET_EVENTS.KIDS_PROGRESS, {
          userId: user.id,
          name: user.name || user.username,
          score: result.newScore,
          levelIndex: result.session.current_level,
          stars: result.stars,
          completed: result.completed,
        });
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Error in KIDS_ANSWER');
      if (typeof callback === 'function') callback({ success: false, error: err.message });
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code || 'KIDS_ANSWER_ERROR', message: err.message });
    }
  });

  // ── Kids Hint Request ───────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.KIDS_HINT_REQUEST, async ({ sessionId, levelId }, callback) => {
    try {
      const hintData = await kidsSessionSvc.requestHint(sessionId, levelId, user);
      socket.emit(SOCKET_EVENTS.KIDS_HINT_RESPONSE, hintData);
      if (typeof callback === 'function') callback({ success: true, data: hintData });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Error in KIDS_HINT_REQUEST');
      if (typeof callback === 'function') callback({ success: false, error: err.message });
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code || 'KIDS_HINT_ERROR', message: err.message });
    }
  });

  // ── Teacher Broadcast to Kids Activity ──────────────────────────────────
  socket.on(SOCKET_EVENTS.KIDS_TEACHER_BROADCAST, ({ activityId, message, type }) => {
    try {
      if (!EDUCATOR_ROLES.includes(user.role)) {
        return;
      }
      io.to(ROOM.kidsActivity(activityId)).emit(SOCKET_EVENTS.KIDS_TEACHER_BROADCAST, {
        sender: user.name || 'Enseignant',
        message,
        type: type || 'cheer',
      });
    } catch (err) {
      logger.error({ err }, 'Error in KIDS_TEACHER_BROADCAST');
    }
  });

  // ── Teacher Live Monitor ───────────────────────────────────────────────
  // Lets a teacher subscribe to `kids:{activityId}` so they receive
  // PLAYER_JOINED / KIDS_PROGRESS / PLAYER_LEFT. Deliberately does NOT call
  // startOrResume: monitoring must never create a session for the teacher.
  socket.on(SOCKET_EVENTS.KIDS_MONITOR, async ({ activityId }, callback) => {
    try {
      if (!EDUCATOR_ROLES.includes(user.role)) {
        throw new Error('Monitoring is reserved for teachers.');
      }
      if (!activityId) throw new Error('activityId required');

      const activity = await kidsActivitySvc.getById(activityId, user.school_id);
      joinRoom(socket, 'kidsActivity', activity.id);
      socket.data.monitoringKidsActivityId = activity.id;

      const snapshot = await kidsSessionSvc.listLiveSessions(activity.id, user.school_id);
      if (typeof callback === 'function') callback({ success: true, data: snapshot });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Error in KIDS_MONITOR');
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      } else {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'KIDS_MONITOR_ERROR', message: err.message });
      }
    }
  });

  // ── Kids Leave ──────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.KIDS_LEAVE, ({ activityId }) => {
    try {
      const targetId = activityId || socket.data.activeKidsActivityId;
      if (targetId) {
        leaveRoom(socket, 'kidsActivity', targetId);
        socket.to(ROOM.kidsActivity(targetId)).emit(SOCKET_EVENTS.PLAYER_LEFT, {
          userId: user.id,
          name: user.name || user.username,
        });
        delete socket.data.activeKidsActivityId;
      }
      const monitorId = socket.data.monitoringKidsActivityId;
      if (monitorId) {
        leaveRoom(socket, 'kidsActivity', monitorId);
        delete socket.data.monitoringKidsActivityId;
      }
    } catch (err) {
      logger.error({ err }, 'Error in KIDS_LEAVE');
    }
  });
}

/**
 * src/backend/realtime/handlers/tournament.handler.js
 *
 * Tournament socket traffic is deliberately isolated from ordinary games:
 * separate event names, separate room, and separate service methods.
 */

import { SOCKET_EVENTS } from '../../../shared/constants.js';
import { joinRoom, leaveRoom, ROOM } from '../socket.rooms.js';

function emitError(socket, err) {
  socket.emit(SOCKET_EVENTS.ERROR, {
    code: err?.code || 'TOURNAMENT_ERROR',
    message: err?.message || 'Tournament operation failed',
  });
}
/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ tournamentService: import('../../../frontend/services/TournamentService.js').TournamentService }} services
 */
export function registerTournamentHandlers(socket, io, { tournamentService }) {
  socket.on(SOCKET_EVENTS.TOURNAMENT_JOIN, async ({ tournamentId } = {}) => {
    try {
      await tournamentService.register(tournamentId, socket.data.user.id);

      if (socket.data.activeTournamentId && socket.data.activeTournamentId !== tournamentId) {
        leaveRoom(socket, 'tournament', socket.data.activeTournamentId);
      }
      joinRoom(socket, 'tournament', tournamentId);
      socket.data.activeTournamentId = tournamentId;

      io.to(ROOM.tournament(tournamentId)).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId: socket.data.user.id,
        username: socket.data.user.username,
      });
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on(SOCKET_EVENTS.TOURNAMENT_ANSWER, async ({ tournamentId, questionId, answer } = {}) => {
    try {
      const result = await tournamentService.recordAnswer({
        tournamentId,
        userId: socket.data.user.id,
        questionId,
        answer,
      });

      socket.emit(SOCKET_EVENTS.ANSWER_RESULT, {
        correct: result.correct,
        points: result.points,
        score: result.score,
        ...(result.showAnswer && { correctAnswer: result.correctAnswer }),
      });

      const leaderboard = await tournamentService.getLeaderboard(tournamentId);
      io.to(ROOM.tournament(tournamentId)).emit(SOCKET_EVENTS.TOURNAMENT_SCORES, leaderboard);
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on(SOCKET_EVENTS.TOURNAMENT_LEAVE, ({ tournamentId } = {}) => {
    const activeId = socket.data.activeTournamentId || tournamentId;
    if (!activeId) return;
    leaveRoom(socket, 'tournament', activeId);
    socket.data.activeTournamentId = null;
    io.to(ROOM.tournament(activeId)).emit(SOCKET_EVENTS.PLAYER_LEFT, {
      userId: socket.data.user.id,
    });
  });
}

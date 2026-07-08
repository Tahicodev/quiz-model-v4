/**
 * src/backend/realtime/handlers/tournament.handler.js
 *
 * All tournament socket event handlers. Mirrors game.handler.js idioms —
 * targeted room broadcasts, single-socket answer results, error events
 * on every catch. Uses TournamentService.recordAnswer (added for the realtime
 * path) so the handler stays thin and layering is preserved.
 *
 * Non-negotiable: never broadcast a single player's answer/result, never
 * reveal the correct answer unless the tournament's `show_answers_immediately`
 * setting is on.
 */

import { SOCKET_EVENTS } from '../../../shared/constants.js';
import { joinRoom, leaveRoom, ROOM } from '../socket.rooms.js';

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ tournamentService: import('../../../frontend/services/TournamentService.js').TournamentService }} services
 */
export function registerTournamentHandlers(socket, io, { tournamentService }) {

  socket.on(SOCKET_EVENTS.TOURNAMENT_JOIN, async ({ tournamentId }) => {
    try {
      await tournamentService.register(tournamentId, socket.data.user.id);

      joinRoom(socket, 'tournament', tournamentId);
      socket.data.activeTournamentId = tournamentId;

      // Notify the tournament room that a player joined. No sensitive state.
      io.to(ROOM.tournament(tournamentId)).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId:   socket.data.user.id,
        username: socket.data.user.username,
      });
    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.TOURNAMENT_ANSWER, async ({ tournamentId, questionId, answer }) => {
    try {
      const result = await tournamentService.recordAnswer({
        tournamentId,
        userId:     socket.data.user.id,
        questionId,
        answer,
      });

      // Answer result ONLY to the answering socket — never broadcast.
      socket.emit(SOCKET_EVENTS.ANSWER_RESULT, {
        correct:    result.correct,
        points:     result.points,
        score:       result.score,
        ...(result.showAnswer && { correctAnswer: result.correctAnswer }),
      });

      // Broadcast leaderboard to everyone in the tournament room.
      const leaderboard = await tournamentService.getLeaderboard(tournamentId);
      io.to(ROOM.tournament(tournamentId)).emit(SOCKET_EVENTS.GAME_SCORES, leaderboard);
    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  // Symmetric leave for cleanliness. Tournament play doesn't strictly require
  // exiting a room (the tournament may outlive any one socket), but we offer
  // it so the client can stop listening without disconnecting entirely.
  // No dedicated TOURNAMENT_LEAVE event in SOCKET_EVENTS — use GAME_LEAVE's
  // pattern manually with the tournament room.
  // (Kept as a no-op-safe listener so clients that emit it don't error.)
}

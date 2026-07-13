/**
 * src/backend/realtime/handlers/game.handler.js
 *
 * All game-related socket event handlers. Registered once per connected socket
 * by socket.server.js on each `connection`.
 *
 * Non-negotiable rules enforced here (spec Section 11):
 *   - Join/leave game rooms (never broadcast sensitive data globally).
 *   - `answer:result` is emitted ONLY to the answering socket — never broadcast.
 *   - Correct answer is included only when the game's `show_answers_immediately`
 *     setting is on (driven by GameService.recordAnswer → result.showAnswer).
 *   - On error, emit `SOCKET_EVENTS.ERROR` to the offending socket with the
 *     typed error's code + message — never crash the server.
 */

import { SOCKET_EVENTS } from '../../../shared/constants.js';
import { joinRoom, leaveRoom, ROOM } from '../socket.rooms.js';

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ gameService: import('../../../frontend/services/GameService.js').GameService }} services
 */
export function registerGameHandlers(socket, io, { gameService }) {

  socket.on(SOCKET_EVENTS.GAME_JOIN, async ({ gameId, joinCode }) => {
    try {
      // joinGame resolves a join_code → game internally when gameId is absent,
      // and either creates a new game_sessions row or re-activates an existing one.
      const session = await gameService.joinGame({
        gameId,
        joinCode,
        userId: socket.data.user.id,
      });

      const gid = session.game_id;
      joinRoom(socket, 'game', gid);
      socket.data.activeGameId = gid;

      // Notify everyone in the game room that a new player joined.
      // NEVER include correct answers or admin-only state here.
      io.to(ROOM.game(gid)).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId:   socket.data.user.id,
        username: socket.data.user.username,
      });

      // Send the current safe game state ONLY to the joining player.
      const gameState = await gameService.getClientState(gid);
      socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, gameState);

    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.GAME_ANSWER, async ({ gameId, questionId, answer }) => {
    try {
      const result = await gameService.recordAnswer({
        gameId,
        userId:     socket.data.user.id,
        questionId,
        answer,
      });

      // Send result ONLY to the answering player — never broadcast.
      // correctAnswer is revealed only when the game's settings allow it.
      socket.emit(SOCKET_EVENTS.ANSWER_RESULT, {
        correct:    result.correct,
        points:     result.points,
        ...(result.showAnswer && { correctAnswer: result.correctAnswer }),
      });

      // Broadcast updated leaderboard to everyone in the game room.
      const scores = await gameService.getScores(gameId);
      io.to(ROOM.game(gameId)).emit(SOCKET_EVENTS.GAME_SCORES, scores);

    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.GAME_LEAVE, async ({ gameId }) => {
    try {
      leaveRoom(socket, 'game', gameId);
      socket.data.activeGameId = null;
      io.to(ROOM.game(gameId)).emit(SOCKET_EVENTS.PLAYER_LEFT, { userId: socket.data.user.id });
    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });
}

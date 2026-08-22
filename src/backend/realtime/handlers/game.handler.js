/**
 * src/backend/realtime/handlers/game.handler.js
 *
 * Socket handlers for ordinary multiplayer games only. Tournament traffic has
 * its own handler, room, and event namespace.
 *
 * The handler never computes scores or exposes answers. GameService owns all
 * validation, progression, tenant checks, and scoring.
 */

import { SOCKET_EVENTS } from '../../../shared/constants.js';
import { joinRoom, leaveRoom, ROOM } from '../socket.rooms.js';

function emitError(socket, err) {
  socket.emit(SOCKET_EVENTS.ERROR, {
    code: err?.code || 'GAME_ERROR',
    message: err?.message || 'Game operation failed',
  });
}
/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ gameService: import('../../../frontend/services/GameService.js').GameService }} services
 */
export function registerGameHandlers(socket, io, { gameService }) {
  socket.on(SOCKET_EVENTS.GAME_JOIN, async ({ gameId, joinCode } = {}) => {
    try {
      // A socket represents one active game at a time. Leaving the old room
      // prevents cross-game score/question broadcasts after navigation.
      if (socket.data.activeGameId && socket.data.activeGameId !== gameId) {
        if (typeof gameService.leaveGame === 'function') {
          await gameService.leaveGame({
            gameId: socket.data.activeGameId,
            userId: socket.data.user.id,
            schoolId: socket.data.user.school_id,
          });
        }
        leaveRoom(socket, 'game', socket.data.activeGameId);
      }

      const session = await gameService.joinGame({
        gameId,
        joinCode,
        userId: socket.data.user.id,
        schoolId: socket.data.user.school_id,
      });

      const gid = session.game_id;
      joinRoom(socket, 'game', gid);
      socket.data.activeGameId = gid;

      io.to(ROOM.game(gid)).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId: socket.data.user.id,
        username: socket.data.user.username,
      });

      // Send a safe state and the current question only to this player. The
      // service strips the answer and question id list before returning it.
      const gameState = await gameService.getClientState(gid, {
        schoolId: socket.data.user.school_id,
        userId: socket.data.user.id,
      });
      socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, gameState);
      if (gameState.currentQuestion) {
        socket.emit(SOCKET_EVENTS.GAME_QUESTION, gameState.currentQuestion);
      }
      socket.emit(
        SOCKET_EVENTS.GAME_SCORES,
        await gameService.getScores(gid, socket.data.user.school_id),
      );
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on(SOCKET_EVENTS.GAME_ANSWER, async ({ gameId, questionId, answer } = {}) => {
    try {
      if (socket.data.activeGameId && socket.data.activeGameId !== gameId) {
        const error = new Error('This socket is not joined to that game');
        error.code = 'GAME_NOT_JOINED';
        throw error;
      }

      const result = await gameService.recordAnswer({
        gameId,
        userId: socket.data.user.id,
        questionId,
        answer,
        schoolId: socket.data.user.school_id,
      });

      // Send answer feedback only to the answering player.
      socket.emit(SOCKET_EVENTS.ANSWER_RESULT, {
        correct: result.correct,
        points: result.points,
        completed: result.completed,
        alreadyAnswered: result.alreadyAnswered,
        ...(result.showAnswer && { correctAnswer: result.correctAnswer }),
      });

      // Progression is per player, so a fast player receives the next safe
      // question only on their own socket.
      if (result.nextQuestion) {
        socket.emit(SOCKET_EVENTS.GAME_QUESTION, result.nextQuestion);
      }

      const scores = await gameService.getScores(gameId, socket.data.user.school_id);
      io.to(ROOM.game(gameId)).emit(SOCKET_EVENTS.GAME_SCORES, scores);
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on(SOCKET_EVENTS.GAME_LEAVE, async ({ gameId } = {}) => {
    try {
      const activeGameId = socket.data.activeGameId || gameId;
      if (typeof gameService.leaveGame === 'function' && activeGameId) {
        await gameService.leaveGame({
          gameId: activeGameId,
          userId: socket.data.user.id,
          schoolId: socket.data.user.school_id,
        });
      }
      if (activeGameId) {
        leaveRoom(socket, 'game', activeGameId);
        io.to(ROOM.game(activeGameId)).emit(SOCKET_EVENTS.PLAYER_LEFT, {
          userId: socket.data.user.id,
        });
      }
      socket.data.activeGameId = null;
    } catch (err) {
      emitError(socket, err);
    }
  });
}

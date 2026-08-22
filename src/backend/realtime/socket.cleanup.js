/**
 * src/backend/realtime/socket.cleanup.js
 *
 * Handles application-level cleanup when a socket disconnects. Socket.io
 * automatically removes the socket from all rooms on disconnect — we only
 * need to clean up our own application state:
 *   1. Mark the player as disconnected in any active game_sessions.
 *   2. Notify the game room so other participants see the player go offline.
 *
 * Non-fatal: a disconnecting player may not have been in a game at all.
 */

import { SOCKET_EVENTS } from '../../shared/constants.js';
import { ROOM } from './socket.rooms.js';
import { logger } from '../logger.js';

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {{ gameService: import('../../frontend/services/GameService.js').GameService,
 *           sessionService: import('../../frontend/services/SessionService.js').SessionService }} services
 */
export async function handleDisconnect(socket, io, { gameService, sessionService }) {
  const { user } = socket.data;

  // Mark player as disconnected in any active game sessions
  const activeGameId = socket.data.activeGameId;
  if (gameService && user?.id) {
    try {
      await gameService.markPlayerDisconnected(user.id, user.school_id, activeGameId);
    } catch (err) {
      // Non-fatal — player may not have been in a game, or the session was already cleaned up
      logger.debug({ err, userId: user.id }, 'markPlayerDisconnected skipped (non-fatal)');
    }
  }

  // Notify the game room that the player disconnected (others see them as offline).
  // We track the active game id on socket.data in game.handler.js on GAME_JOIN.
  if (activeGameId) {
    io.to(ROOM.game(activeGameId)).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, { userId: user.id });
  }
}

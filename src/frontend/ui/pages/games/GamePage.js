/**
 * src/frontend/ui/pages/games/GamePage.js
 *
 * Reference implementation of the MANDATORY socket page pattern (spec §11,
 * "Mandatory pattern for every page that uses sockets"). Every page that
 * registers socket listeners MUST follow this shape:
 *
 *   1. Declare ONE `PAGE_EVENTS` array listing every event this page listens to.
 *   2. Get the singleton socket via `getSocket(token)`.
 *   3. Connect, register handlers, and emit the join event.
 *   4. Register a cleanup that emits the LEAVE event and removes ALL listeners
 *      for `PAGE_EVENTS` (prevents handler accumulation on re-navigation).
 *
 * Tournament/Exam pages should copy this structure when they get sockets wired.
 */

import { getSocket, cleanupSocketListeners } from '../../../infrastructure/socket.client.js';
import { SOCKET_EVENTS }                   from '../../../../shared/constants.js';
import { getContainer }                     from '../../../container.js';
import { Router }                           from '../../router.js';
import { logger }                           from '../../../utils/logger.js';

// ── 1. Declare every event this page listens to ──────────────────────────────
const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_STATE_UPDATE,
  SOCKET_EVENTS.GAME_QUESTION,
  SOCKET_EVENTS.GAME_SCORES,
  SOCKET_EVENTS.GAME_FINISHED,
  SOCKET_EVENTS.SESSION_EXPIRED,
  SOCKET_EVENTS.PLAYER_JOINED,
  SOCKET_EVENTS.PLAYER_LEFT,
  SOCKET_EVENTS.ANSWER_RESULT,
];

/** @type {import('socket.io-client').Socket|null} */
let socket = null;
let activeGameId = null;

/**
 * Initialize the game page for a given game id.
 * @param {string} gameId
 */
export function initGamePage(gameId) {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  activeGameId = gameId;

  if (!socket.connected) socket.connect();

  // ── 3. Register handlers (one per declared event) ─────────────────────────
  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, renderGameState);
  socket.on(SOCKET_EVENTS.GAME_QUESTION,     renderQuestion);
  socket.on(SOCKET_EVENTS.GAME_SCORES,       renderScoreboard);
  socket.on(SOCKET_EVENTS.GAME_FINISHED,     renderFinished);
  socket.on(SOCKET_EVENTS.PLAYER_JOINED,     handlePlayerJoined);
  socket.on(SOCKET_EVENTS.PLAYER_LEFT,      handlePlayerLeft);
  socket.on(SOCKET_EVENTS.ANSWER_RESULT,    handleAnswerResult);
  socket.on(SOCKET_EVENTS.SESSION_EXPIRED,  handleExpired);

  // Join the game room — server scopes all subsequent broadcasts to game:{id}.
  socket.emit(SOCKET_EVENTS.GAME_JOIN, { gameId });

  // ── 4. Register cleanup so a navigation/unload doesn't leak handlers ───────
  Router.registerCleanup(PAGE_EVENTS);
  // Also emit GAME_LEAVE on unload so the server removes us from the room and
  // notifies other players. (beforeunload fires before the socket disconnects.)
  window.addEventListener('beforeunload', leaveGame);
}

/** Explicit teardown when navigating away without a full unload. */
export function teardownGamePage() {
  leaveGame();
  cleanupSocketListeners(PAGE_EVENTS);
}

function leaveGame() {
  if (socket && activeGameId) {
    try {
      socket.emit(SOCKET_EVENTS.GAME_LEAVE, { gameId: activeGameId });
    } catch (err) {
      logger.warn('Failed to emit GAME_LEAVE on teardown', err);
    }
  }
}

// ── Render handlers (UI shell — wire to real DOM/components per feature work) ─
function renderGameState(state)        { logger.debug('game:state_update', state); }
function renderQuestion(question)      { logger.debug('game:question', question); }
function renderScoreboard(scores)      { logger.debug('game:scores', scores); }
function renderFinished()              { logger.info('game:finished'); }
function handlePlayerJoined(payload)   { logger.debug('player:joined', payload); }
function handlePlayerLeft(payload)     { logger.debug('player:left', payload); }
function handleAnswerResult(result)    { logger.debug('answer:result', result); }
function handleExpired()                { logger.warn('session:expired'); }

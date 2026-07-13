/**
 * src/frontend/ui/pages/games/GamePage.js
 * @description Orchestrates game components: Lobby, Question, Scoreboard, Results.
 * Follows mandatory socket page pattern (spec §11).
 */

import { getSocket, cleanupSocketListeners } from '../../../infrastructure/socket.client.js';
import { SOCKET_EVENTS }                   from '../../../../shared/constants.js';
import { getContainer }                     from '../../../container.js';
import { Router }                           from '../../router.js';
import { logger }                           from '../../../utils/logger.js';
import { safeSetHTML }                      from '../../../utils/sanitize.js';

import { initGameLobby, teardownGameLobby } from './components/GameLobby.js';
import { initGameQuestion, teardownGameQuestion } from './components/GameQuestion.js';
import { initGameScoreboard, teardownGameScoreboard } from './components/GameScoreboard.js';
import { initGameResults, teardownGameResults } from './components/GameResults.js';

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

let socket = null;
let activeGameId = null;

/**
 * Initialize the game page.
 * If gameId is provided, renders the full game UI; otherwise shows the lobby.
 */
export function initGamePage(gameId) {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  activeGameId = gameId;

  if (!socket.connected) socket.connect();

  // Render the game page shell
  const app = document.getElementById('app') || document.body;
  safeSetHTML(app, `
    <div id="game-lobby"></div>
    <div id="game-question"></div>
    <div id="game-scoreboard"></div>
    <div id="game-results"></div>
  `);

  if (!gameId) {
    initGameLobby();
    return;
  }

  // Register socket handlers
  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (s) => logger.debug('Game state', s));
  socket.on(SOCKET_EVENTS.GAME_QUESTION,     initGameQuestion);
  socket.on(SOCKET_EVENTS.GAME_SCORES,       initGameScoreboard);
  socket.on(SOCKET_EVENTS.GAME_FINISHED,     initGameResults);
  socket.on(SOCKET_EVENTS.PLAYER_JOINED,     (p) => logger.debug('Player joined', p));
  socket.on(SOCKET_EVENTS.PLAYER_LEFT,       (p) => logger.debug('Player left', p));
  socket.on(SOCKET_EVENTS.ANSWER_RESULT,     (r) => logger.debug('Answer result', r));
  socket.on(SOCKET_EVENTS.SESSION_EXPIRED,   () => logger.warn('Session expired'));

  // Join game room
  socket.emit(SOCKET_EVENTS.GAME_JOIN, { gameId });

  Router.registerCleanup(PAGE_EVENTS);
  window.addEventListener('beforeunload', leaveGame);
}

export function teardownGamePage() {
  leaveGame();
  cleanupSocketListeners(PAGE_EVENTS);
  teardownGameLobby();
  teardownGameQuestion();
  teardownGameScoreboard();
  teardownGameResults();
}

function leaveGame() {
  if (socket && activeGameId) {
    try { socket.emit(SOCKET_EVENTS.GAME_LEAVE, { gameId: activeGameId }); }
    catch (err) { logger.warn('Failed to emit GAME_LEAVE', err); }
  }
}

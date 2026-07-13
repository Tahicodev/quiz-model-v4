/**
 * src/frontend/ui/pages/games/components/GameResults.js
 * @description Final game results display.
 */

import { getSocket } from '../../../../infrastructure/socket.client.js';
import { getContainer } from '../../../../container.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { safeSetHTML } from '../../../../utils/sanitize.js';
import { SOCKET_EVENTS } from '../../../../../shared/constants.js';

export const PAGE_EVENTS = [SOCKET_EVENTS.GAME_FINISHED];

let socket = null;

export function initGameResults() {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_FINISHED, renderResults);
  Router.registerCleanup(PAGE_EVENTS);
}

export function teardownGameResults() {
  if (socket) socket.off(SOCKET_EVENTS.GAME_FINISHED, renderResults);
}

function renderResults(payload) {
  const el = document.getElementById('game-results');
  if (!el) return logger.error('Missing #game-results element');

  const results = payload?.results || payload?.scores || [];
  const rows = results
    .map(r => `<tr><td>${r.playerName || r.name || '—'}</td><td>${r.finalScore ?? r.score ?? 0}</td></tr>`)
    .join('');

  safeSetHTML(el, `
    <h2>Game Over</h2>
    <table class="data-table">
      <thead><tr><th>Player</th><th>Final Score</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">No results.</td></tr>'}</tbody>
    </table>
    <button class="btn btn-primary" id="play-again">Play Again</button>
  `);

  const again = document.getElementById('play-again');
  if (again) again.addEventListener('click', () => { window.location.href = '/#/lobby'; });
}

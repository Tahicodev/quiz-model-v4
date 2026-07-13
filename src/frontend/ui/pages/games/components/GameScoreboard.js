/**
 * src/frontend/ui/pages/games/components/GameScoreboard.js
 * @description Live scoreboard display.
 */

import { getSocket } from '../../../../infrastructure/socket.client.js';
import { getContainer } from '../../../../container.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { safeSetHTML } from '../../../../utils/sanitize.js';
import { SOCKET_EVENTS } from '../../../../../shared/constants.js';

export const PAGE_EVENTS = [SOCKET_EVENTS.GAME_SCORES];

let socket = null;

export function initGameScoreboard() {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_SCORES, renderScores);
  Router.registerCleanup(PAGE_EVENTS);
}

export function teardownGameScoreboard() {
  if (socket) socket.off(SOCKET_EVENTS.GAME_SCORES, renderScores);
}

function renderScores(scores) {
  const el = document.getElementById('game-scoreboard');
  if (!el) return logger.error('Missing #game-scoreboard element');

  const rows = (scores || [])
    .map(s => `<tr><td>${s.playerName || s.name || '—'}</td><td>${s.score ?? 0}</td></tr>`)
    .join('');
  safeSetHTML(el, `
    <h3>Live Scores</h3>
    <table class="data-table">
      <thead><tr><th>Player</th><th>Score</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">No scores yet.</td></tr>'}</tbody>
    </table>
  `);
}

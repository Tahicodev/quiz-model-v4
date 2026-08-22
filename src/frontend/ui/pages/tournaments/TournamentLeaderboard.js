/**
 * src/frontend/ui/pages/tournaments/TournamentLeaderboard.js
 * @description Live leaderboard display for tournaments.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export function initTournamentLeaderboard() {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.TOURNAMENT_SCORES, (scores) => {
    const el = document.getElementById('tournament-leaderboard');
    if (!el) return;
    const rows = (scores || []).map(s => `<tr><td>${s.playerName || s.name}</td><td>${s.score ?? 0}</td></tr>`).join('');
    safeSetHTML(el, `
      <h3>Leaderboard</h3>
      <table class="data-table"><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No entries.</td></tr>'}</tbody></table>
    `);
  });

  Router.registerCleanup([SOCKET_EVENTS.TOURNAMENT_SCORES]);
}

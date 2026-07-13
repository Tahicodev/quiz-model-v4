/**
 * src/frontend/ui/pages/tournaments/TournamentRegister.js
 * @description Register for a tournament.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export function initTournamentRegister(tournamentId) {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  const el = document.getElementById('app');
  safeSetHTML(el, `
    <h2>Register for Tournament</h2>
    <p>Click below to join tournament <strong>${tournamentId}</strong>.</p>
    <button class="btn btn-primary" id="register-btn">Register</button>
  `);
  document.getElementById('register-btn')?.addEventListener('click', withError(() => {
    socket.emit(SOCKET_EVENTS.TOURNAMENT_JOIN, { tournamentId });
    window.location.hash = `#/tournaments/${tournamentId}/play`;
  }));
}

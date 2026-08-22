/**
 * src/frontend/ui/pages/tournaments/TournamentRegister.js
 * @description Register for a tournament.
 */

import { getContainer } from '../../../container.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';

export function initTournamentRegister(tournamentId) {
  const { authSvc } = getContainer();
  const { tournamentSvc } = getContainer();

  const el = document.getElementById('app');
  safeSetHTML(el, `
    <h2>Register for Tournament</h2>
    <p>Click below to join tournament <strong>${tournamentId}</strong>.</p>
    <button class="btn btn-primary" id="register-btn">Register</button>
  `);
  document.getElementById('register-btn')?.addEventListener('click', withError(async () => {
    await tournamentSvc.register(tournamentId, authSvc.getCurrentUser?.()?.id);
    window.location.hash = `#/tournaments/${tournamentId}`;
  }));
}

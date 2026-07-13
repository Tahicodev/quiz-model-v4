/**
 * src/frontend/ui/pages/tournaments/TournamentQuestion.js
 * @description Handles rendering question and answer submission for tournaments.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export function initTournamentQuestion(tournamentId) {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_QUESTION, (q) => {
    const el = document.getElementById('tournament-question-host');
    if (!el) return;
    const opts = (q?.options || []).map(o => `<label><input type="radio" name="t-answer" value="${o}" /> ${o}</label>`).join('<br/>');
    safeSetHTML(el, `
      <h3>${q?.text}</h3>
      <form id="t-q-form">
        ${opts}
        <button type="submit" class="btn btn-primary">Submit Answer</button>
      </form>
    `);
    document.getElementById('t-q-form')?.addEventListener('submit', withError((e) => {
      e.preventDefault();
      const answer = document.querySelector('input[name=t-answer]:checked')?.value;
      if (!answer) return;
      socket.emit(SOCKET_EVENTS.TOURNAMENT_ANSWER, { tournamentId, questionId: q?.id, answer });
    }));
  });

  Router.registerCleanup([SOCKET_EVENTS.GAME_QUESTION]);
}

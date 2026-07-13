/**
 * src/frontend/ui/pages/games/components/GameQuestion.js
 * @description Renders the current game question with answer options.
 */

import { getSocket } from '../../../../infrastructure/socket.client.js';
import { getContainer } from '../../../../container.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { safeSetHTML } from '../../../../utils/sanitize.js';
import { withError } from '../../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../../shared/constants.js';

export const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_QUESTION,
];

let socket = null;
let currentQuestion = null;

export function initGameQuestion() {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_QUESTION, handleQuestion);
  Router.registerCleanup(PAGE_EVENTS);
}

export function teardownGameQuestion() {
  if (socket) socket.off(SOCKET_EVENTS.GAME_QUESTION, handleQuestion);
}

function handleQuestion(q) {
  currentQuestion = q;
  const el = document.getElementById('game-question');
  if (!el) return logger.error('Missing #game-question element');

  const opts = (q.options || [])
    .map(o => `<label><input type="radio" name="answer" value="${o.replace(/"/g,'&quot;')}" /> ${o}</label>`)
    .join('<br/>');

  safeSetHTML(el, `
    <h3 class="question-text">${q.text}</h3>
    <form id="q-form">
      ${opts}
      <button type="submit" class="btn btn-primary">Answer</button>
    </form>
  `);

  document.getElementById('q-form').addEventListener('submit', withError((e) => {
    e.preventDefault();
    const answer = document.querySelector('input[name=answer]:checked')?.value;
    if (!answer) return;
    socket.emit(SOCKET_EVENTS.GAME_ANSWER, { questionId: q.id, answer });
  }));
}

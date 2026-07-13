/**
 * src/frontend/ui/pages/sessions/SessionPage.js
 * @description Exam session page (student). Connect socket, render questions, track progress.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_QUESTION,
  SOCKET_EVENTS.GAME_STATE_UPDATE,
  SOCKET_EVENTS.GAME_SCORES,
  SOCKET_EVENTS.GAME_FINISHED,
  SOCKET_EVENTS.SESSION_EXPIRED,
];

let socket = null;
let activeSessionId = null;

export function initSessionPage(sessionId) {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  activeSessionId = sessionId;
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, renderState);
  socket.on(SOCKET_EVENTS.GAME_QUESTION, renderQuestion);
  socket.on(SOCKET_EVENTS.GAME_SCORES, (s) => logger.debug('Session scores', s));
  socket.on(SOCKET_EVENTS.GAME_FINISHED, renderFinished);
  socket.on(SOCKET_EVENTS.SESSION_EXPIRED, () => {
    logger.warn('Session expired');
    safeSetHTML(document.getElementById('app'), `<h2>Session Expired</h2><p>Please contact your instructor.</p>`);
  });

  socket.emit('session:join', { sessionId });

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    if (socket?.connected) socket.emit(SOCKET_EVENTS.SESSION_HEARTBEAT, { sessionId });
  }, 30000);

  Router.registerCleanup(PAGE_EVENTS);
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
    if (socket && activeSessionId) socket.emit('session:leave', { sessionId: activeSessionId });
  });
}

function renderState(state) {
  safeSetHTML(document.getElementById('app'), `
    <h2>Exam Session</h2>
    <p>${state?.examName || 'Loading…'}</p>
    <div id="session-question"></div>
    <div id="session-progress"></div>
  `);
}

function renderQuestion(question) {
  const el = document.getElementById('session-question');
  if (!el) return;
  const opts = (question?.options || []).map(o => `<label><input type="radio" name="s-answer" value="${o}" /> ${o}</label>`).join('<br/>');
  safeSetHTML(el, `
    <h3>${question?.text}</h3>
    <form id="s-q-form">
      ${opts}
      <button type="submit" class="btn btn-primary">Next</button>
    </form>
  `);
  document.getElementById('s-q-form')?.addEventListener('submit', withError((e) => {
    e.preventDefault();
    const answer = document.querySelector('input[name=s-answer]:checked')?.value;
    if (!answer) return;
    socket.emit(SOCKET_EVENTS.GAME_ANSWER, { sessionId: activeSessionId, questionId: question?.id, answer });
  }));
}

function renderFinished(payload) {
  safeSetHTML(document.getElementById('app'), `
    <h2>Exam Complete</h2>
    <p>Your score: ${payload?.score ?? '—'}</p>
    <p>Thank you for completing the exam.</p>
  `);
}

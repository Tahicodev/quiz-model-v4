/**
 * src/frontend/ui/pages/sessions/SessionQuestion.js
 * @description Question rendering component for exam sessions.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export function initSessionQuestion(sessionId) {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_QUESTION, (q) => {
    const el = document.getElementById('session-question');
    if (!el) return;
    const opts = (q?.options || []).map((o, i) => {
      const opt = o && typeof o === 'object' ? o : { text: o, image: '' };
      const text = String(opt.text ?? opt.label ?? opt.value ?? '').trim() || String(i + 1);
      const image = String(opt.image ?? opt.imageUrl ?? opt.src ?? '').trim();
      const inner = image
        ? `<span class="sq-option-image"><img src="${image}" alt="${text}"></span>`
        : `<span class="sq-option-label">${text}</span>`;
      return `<label class="sq-option"><input type="radio" name="sq-answer" value="${text}" /> ${inner}</label>`;
    }).join('<br/>');
    safeSetHTML(el, `
      <h3>${q?.text}</h3>
      <form id="sq-form">
        ${opts}
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    `);
    document.getElementById('sq-form')?.addEventListener('submit', withError((e) => {
      e.preventDefault();
      const answer = document.querySelector('input[name=sq-answer]:checked')?.value;
      if (!answer) return;
      socket.emit(SOCKET_EVENTS.GAME_ANSWER, { sessionId, questionId: q?.id, answer });
    }));
  });

  Router.registerCleanup([SOCKET_EVENTS.GAME_QUESTION]);
}

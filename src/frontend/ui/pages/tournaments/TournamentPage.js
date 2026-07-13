/**
 * src/frontend/ui/pages/tournaments/TournamentPage.js
 * @description Main tournament page: register, answer questions, view leaderboard.
 */

import { getSocket } from '../../../infrastructure/socket.client.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';

export const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_STATE_UPDATE,
  SOCKET_EVENTS.GAME_QUESTION,
  SOCKET_EVENTS.GAME_SCORES,
  SOCKET_EVENTS.GAME_FINISHED,
  SOCKET_EVENTS.PLAYER_JOINED,
  SOCKET_EVENTS.PLAYER_LEFT,
  SOCKET_EVENTS.ANSWER_RESULT,
];

let socket = null;
let activeTournamentId = null;

export function initTournamentPage(tournamentId) {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  activeTournamentId = tournamentId;
  if (!socket.connected) socket.connect();

  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, renderState);
  socket.on(SOCKET_EVENTS.GAME_QUESTION, renderQuestion);
  socket.on(SOCKET_EVENTS.GAME_SCORES, renderLeaderboard);
  socket.on(SOCKET_EVENTS.GAME_FINISHED, renderFinished);
  socket.on(SOCKET_EVENTS.PLAYER_JOINED, (p) => logger.debug('Player joined tournament', p));
  socket.on(SOCKET_EVENTS.PLAYER_LEFT, (p) => logger.debug('Player left tournament', p));
  socket.on(SOCKET_EVENTS.ANSWER_RESULT, (r) => logger.debug('Answer result', r));
  socket.on(SOCKET_EVENTS.SESSION_EXPIRED, () => logger.warn('Tournament session expired'));

  socket.emit(SOCKET_EVENTS.TOURNAMENT_JOIN, { tournamentId });

  Router.registerCleanup(PAGE_EVENTS);
  window.addEventListener('beforeunload', leaveTournament);
}

export function teardownTournamentPage() {
  leaveTournament();
  if (socket) socket.off(PAGE_EVENTS);
}

function leaveTournament() {
  if (socket && activeTournamentId) {
    try { socket.emit('tournament:leave', { tournamentId: activeTournamentId }); }
    catch (err) { logger.warn('Failed to leave tournament', err); }
  }
}

const tournamentApp = document.getElementById('app') || document.body;

function renderState(state) {
  safeSetHTML(tournamentApp, `
    <h2>Tournament: ${state?.name || 'Unknown'}</h2>
    <p>Status: ${state?.status || 'loading…'}</p>
    <div id="tournament-question"></div>
    <div id="tournament-leaderboard"></div>
    <div id="tournament-results"></div>
  `);
}

function renderQuestion(question) {
  const el = document.getElementById('tournament-question');
  if (!el) return;
  const opts = (question?.options || []).map(o => `<label><input type="radio" name="t-answer" value="${o}" /> ${o}</label>`).join('<br/>');
  safeSetHTML(el, `
    <h3>${question?.text}</h3>
    <form id="t-q-form">
      ${opts}
      <button type="submit" class="btn btn-primary">Submit</button>
    </form>
  `);
  document.getElementById('t-q-form')?.addEventListener('submit', withError((e) => {
    e.preventDefault();
    const answer = document.querySelector('input[name=t-answer]:checked')?.value;
    if (!answer) return;
    socket.emit(SOCKET_EVENTS.TOURNAMENT_ANSWER, { tournamentId: activeTournamentId, questionId: question?.id, answer });
  }));
}

function renderLeaderboard(scores) {
  const el = document.getElementById('tournament-leaderboard');
  if (!el) return;
  const rows = (scores || []).map(s => `<tr><td>${s.playerName || s.name}</td><td>${s.score ?? 0}</td></tr>`).join('');
  safeSetHTML(el, `
    <h3>Leaderboard</h3>
    <table class="data-table"><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No data.</td></tr>'}</tbody></table>
  `);
}

function renderFinished(payload) {
  const el = document.getElementById('tournament-results') || tournamentApp;
  const results = payload?.results || payload?.scores || [];
  const rows = results.map(r => `<tr><td>${r.playerName || r.name}</td><td>${r.finalScore ?? r.score ?? 0}</td></tr>`).join('');
  safeSetHTML(el, `
    <h2>Tournament Finished</h2>
    <table class="data-table"><thead><tr><th>Player</th><th>Final</th></tr></thead><tbody>${rows}</tbody></table>
  `);
}

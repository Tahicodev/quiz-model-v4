/**
 * src/frontend/ui/pages/games/components/GameLobby.js
 * @description Simple lobby UI – let the user enter a join code.
 */

import { getSocket } from '../../../../infrastructure/socket.client.js';
import { getContainer } from '../../../../container.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { safeSetHTML } from '../../../../utils/sanitize.js';
import { withError } from '../../../../utils/eventBus.js';

export const PAGE_EVENTS = [];
let socket = null;

export function initGameLobby(initialCode = '') {
  const { authSvc } = getContainer();
  socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  const hub = document.getElementById('game-lobby');
  if (!hub) return logger.error('Missing #game-lobby container');

  safeSetHTML(hub, `
    <h2>Game Lobby</h2>
    <form id="lobby-form">
      <input type="text" id="join-code" placeholder="Join code" value="${initialCode}" required />
      <button type="submit">Join</button>
    </form>
    <h3>Players</h3>
    <ul id="players"></ul>
  `);

  document.getElementById('lobby-form').addEventListener('submit', withError((e) => {
    e.preventDefault();
    const code = document.getElementById('join-code').value.trim();
    if (!code) return;
    socket.emit('game:join', { joinCode: code });
  }));

  Router.registerCleanup(PAGE_EVENTS);
}

export function teardownGameLobby() {
  if (socket) {
    socket.off('game:join');
  }
}

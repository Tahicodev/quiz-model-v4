/**
 * src/frontend/ui/pages/games/components/GameLobby.js
 * @description Simple lobby UI – let the user enter a join code.
 */

import { getContainer } from '../../../../container.js';
import { Router } from '../../../router.js';
import { logger } from '../../../../utils/logger.js';
import { safeSetHTML } from '../../../../utils/sanitize.js';
import { withError } from '../../../../utils/eventBus.js';

export const PAGE_EVENTS = [];
let socket = null;

export function initGameLobby(initialCode = '') {
  const { gameSvc } = getContainer();

  const hub = document.getElementById('game-lobby');
  if (!hub) return logger.error('Missing #game-lobby container');

  safeSetHTML(hub, `
    <h2>Game Lobby</h2>
    <form id="lobby-form">
      <input type="text" id="join-code" placeholder="Join code" value="${initialCode}" required />
      <button type="submit">Join</button>
    </form>
    <p class="lobby-help">Enter the six-character code your teacher shared with you.</p>
  `);

  document.getElementById('lobby-form').addEventListener('submit', withError(async (e) => {
    e.preventDefault();
    const code = document.getElementById('join-code').value.trim();
    if (!code) return;
    const session = await gameSvc.joinGame({ joinCode: code });
    window.location.hash = `#/games/${encodeURIComponent(session.game_id)}`;
  }));

  Router.registerCleanup(PAGE_EVENTS);
}

export function teardownGameLobby() {
  socket = null;
}

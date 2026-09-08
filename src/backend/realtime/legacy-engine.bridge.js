/**
 * src/backend/realtime/legacy-engine.bridge.js
 *
 * Mounts the legacy server-authoritative game engine (root game-server.cjs,
 * CommonJS) onto the SaaS Socket.io server (src/backend/realtime/socket.server.js).
 *
 * Why: the legacy student workspace + admin arena speak the engine's protocol
 * (game:join, game:ready, game:answer, game:playCard, game:start, game:sync,
 * game:stateUpdate, …). Those handlers only existed on the unwired root
 * server.js, so under `npm start` (SaaS server) every lobby action died with
 * "Realtime server disconnected" — the socket connected fine but had no
 * handlers for those events. This bridge reuses the whole engine instead of
 * re-implementing it, and adds the small relay surface the legacy clients also
 * expect (identify / game:list / admin:syncGames distribution).
 *
 * The file is CommonJS-compatible at the boundary: game-server.cjs stays
 * CommonJS, this module imports it via createRequire (the backend is ESM).
 */

import { createRequire } from 'module';
import { logger } from '../logger.js';
import { registerLegacySyncHandlers } from './legacy-sync.bridge.js';

const require = createRequire(import.meta.url);

/**
 * @param {import('socket.io').Server} io
 * @returns {Map<string, object>} the engine's activeGames map (for inspection/tests)
 */
export function mountLegacyGameEngine(io) {
  // NOTE: this file lives at src/backend/realtime/, so the project root (where
  // game-server.cjs sits) is three levels up — ../../../game-server.cjs.
  const engine = require('../../../game-server.cjs');
  engine.registerGameEngine(io);
  logger.info('Legacy game engine mounted on SaaS socket server');

  // Legacy client ↔ admin relay surface (identify / game:list /
  // admin:syncGames fan-out) previously owned by the unwired root server.js.
  registerLegacySyncHandlers(io);

  return engine.activeGames;
}

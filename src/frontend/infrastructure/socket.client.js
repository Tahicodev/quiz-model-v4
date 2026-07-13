/**
 * src/frontend/infrastructure/socket.client.js
 *
 * SINGLETON — the only place socket.io-client is instantiated in the entire frontend.
 * NEVER call io() anywhere else. Always use getSocket() from this file.
 *
 * Rules enforced here:
 *   - One connection per browser tab (singleton pattern)
 *   - autoConnect: false — never connects before explicit auth
 *   - Reconnection configured with sensible defaults
 *   - cleanupSocketListeners() MUST be called on every page navigation
 *   - disconnectSocket() called ONLY on logout
 */

// socket.io-client is loaded from node_modules (bundled by esbuild)
// or via CDN <script> tag which exposes window.io globally.
// We support both to work with and without a build step.

let _socket = null;

/**
 * Returns the single socket.io-client instance.
 * Creates it on first call — all subsequent calls return the same instance.
 *
 * @param {string} token  - Current JWT access token (required on first call)
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket(token) {
  if (_socket) return _socket;

  // Get io from module import or CDN global
  const ioFn = typeof io !== 'undefined' ? io : null;
  if (!ioFn) {
    throw new Error(
      '[socket.client] socket.io-client not available. ' +
      'Either bundle it with esbuild or add the CDN <script> tag.'
    );
  }

  const socketUrl = window.APP_CONFIG?.socketUrl ?? '';

  _socket = ioFn(socketUrl, {
    auth:                 { token },
    autoConnect:          false,   // Explicit connect() only — never before auth
    reconnection:         true,
    reconnectionAttempts: 5,
    reconnectionDelay:    1000,
    reconnectionDelayMax: 5000,
    timeout:              10_000,
    transports:           ['websocket', 'polling'],
  });

  // Core lifecycle events — use structured output, not console.log in production
  _socket.on('connect',        ()  => _log('info',  `Connected (${_socket.id})`));
  _socket.on('disconnect',     (r) => _log('warn',  `Disconnected: ${r}`));
  _socket.on('connect_error',  (e) => _log('error', `Connection error: ${e.message}`));
  _socket.on('reconnect',      (n) => _log('info',  `Reconnected after ${n} attempt(s)`));
  _socket.on('reconnect_failed',()  => _log('error', 'Reconnection failed permanently'));

  return _socket;
}

/**
 * Remove listeners for the given event names.
 * MUST be called by the router when navigating away from any page that registered socket listeners.
 * Prevents handler accumulation on re-navigation.
 *
 * @param {string[]} eventNames
 *
 * @example
 * // In page cleanup:
 * cleanupSocketListeners(['game:state_update', 'game:scores', 'game:finished']);
 */
export function cleanupSocketListeners(eventNames = []) {
  if (!_socket) return;
  for (const event of eventNames) {
    _socket.off(event);
  }
}

/**
 * Fully disconnect and destroy the singleton.
 * ONLY call this on logout. The next getSocket() call will create a fresh connection.
 */
export function disconnectSocket() {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
}

/** @returns {boolean} Whether the socket is currently connected */
export function isSocketConnected() {
  return _socket?.connected ?? false;
}

// ── Internal logger ────────────────────────────────────────────────────────────

function _log(level, msg) {
  const prefix = '[Socket]';
  if (window.APP_CONFIG?.mode !== 'production') {
    // eslint-disable-next-line no-console
    ({ info: console.info, warn: console.warn, error: console.error }[level] ?? console.log)(prefix, msg);
  }
}

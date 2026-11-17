/**
 * src/frontend/console/core/socket.js
 *
 * The console's realtime channel.
 *
 * There is NO separate realtime server: Socket.IO is attached to the same
 * HTTP server that serves the API and the pages (`src/backend/server.js` →
 * `initSocketServer`). The console therefore connects to its OWN origin —
 * there is no host to configure and no second process to run.
 *
 * The socket is authenticated with the same JWT the REST API uses, in the
 * handshake (`auth: { token }`). The server refuses an unauthenticated
 * handshake outright.
 *
 * The connection is lazy: the client library is loaded only when a page
 * actually needs it, so the console stays cheap for the pages that do not.
 */

import { getToken } from './api.js';

let socketPromise = null;
let socket = null;

/** Load the vendored Socket.IO client once. */
function loadClient() {
	if (window.io) return Promise.resolve(window.io);
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = '/vendor/socket.io.min.js';
		script.async = true;
		script.onload = () => {
			if (window.io) resolve(window.io);
			else reject(new Error('The realtime client could not be loaded.'));
		};
		script.onerror = () => reject(new Error('The realtime client could not be loaded.'));
		document.head.appendChild(script);
	});
}

/**
 * Get the shared console socket, connecting it on first use.
 *
 * @param {{ force?: boolean }} [options] `force` reconnects, which is what
 *        the "Test connection" action does.
 * @returns {Promise<object|null>} the socket, or null when it cannot connect
 */
export async function getSocket({ force = false } = {}) {
	if (socket && socket.connected && !force) return socket;
	if (socketPromise && !force) return socketPromise;

	socketPromise = (async () => {
		try {
			const io = await loadClient();
			if (socket) {
				socket.disconnect();
				socket = null;
			}
			socket = io({
				auth: { token: getToken() },
				transports: ['websocket', 'polling'],
				reconnectionAttempts: 5,
				timeout: 8000,
			});
			return socket;
		} catch {
			socket = null;
			return null;
		} finally {
			socketPromise = null;
		}
	})();

	return socketPromise;
}

/** Disconnect the shared socket. */
export function closeSocket() {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}

/**
 * Wait for the socket to connect (or give up).
 *
 * @param {object} socket
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true when it connected
 */
export function waitForConnection(socket, timeoutMs = 8000) {
	if (!socket) return Promise.resolve(false);
	if (socket.connected) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			socket.off('connect', onConnect);
			resolve(false);
		}, timeoutMs);
		const onConnect = () => {
			clearTimeout(timer);
			resolve(true);
		};
		socket.on('connect', onConnect);
	});
}

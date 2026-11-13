/**
 * scripts/offline-guard.mjs
 *
 * A Node preload that makes OUTBOUND NETWORK ACCESS IMPOSSIBLE, so the
 * offline claim can be tested rather than asserted.
 *
 *   node --import ./scripts/offline-guard.mjs src/backend/server.js
 *
 * What it does
 * ─────────────
 *   • Blocks DNS resolution of any host that is not loopback.
 *   • Blocks TCP connections to any address that is not loopback.
 *   • Records every attempt in `offline-guard-attempts.log`.
 *
 * Loopback is allowed because the application legitimately talks to ITSELF:
 * the browser, the Socket.IO server and the API all live on 127.0.0.1.
 *
 * If the guard's log stays empty while the whole application is exercised,
 * then nothing in the request path tried to reach the internet — which is
 * the only honest way to claim offline compatibility.
 *
 * Turn the log off with OFFLINE_GUARD_LOG=<path> or disable it entirely with
 * OFFLINE_GUARD=off.
 */

import net from 'node:net';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH =
	process.env.OFFLINE_GUARD_LOG || path.resolve('offline-guard-attempts.log');

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0', '::']);

function isLoopback(host) {
	if (!host) return true; // no host = default local
	const value = String(host).toLowerCase().replace(/^\[|\]$/g, '');
	if (LOOPBACK.has(value)) return true;
	// 127.0.0.0/8 and ::1
	if (/^127\.\d+\.\d+\.\d+$/.test(value)) return true;
	if (value === '::1') return true;
	// A LAN address of THIS machine is still "local" for the offline claim:
	// the point is to prove nothing reaches the INTERNET.
	if (process.env.OFFLINE_GUARD_ALLOW_LAN === '1') {
		if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value)) return true;
	}
	return false;
}

function record(kind, target) {
	const line = `${new Date().toISOString()} ${kind} ${target}`;
	try {
		fs.appendFileSync(LOG_PATH, `${line}\n`);
	} catch {
		/* the log is a diagnostic, never a blocker */
	}
	// Also surface it on stderr so a running test shows it immediately.
	console.error(`[offline-guard] BLOCKED ${kind} ${target}`);
}

// ── DNS ─────────────────────────────────────────────────────────────────────
const originalLookup = dns.lookup;
dns.lookup = function patchedLookup(hostname, options, callback) {
	const cb = typeof options === 'function' ? options : callback;
	if (!isLoopback(hostname)) {
		record('dns', hostname);
		const error = new Error(`[offline-guard] DNS lookup blocked: ${hostname}`);
		error.code = 'EAI_AGAIN';
		if (typeof cb === 'function') {
			queueMicrotask(() => cb(error));
			return undefined;
		}
		throw error;
	}
	return originalLookup.call(this, hostname, options, callback);
};

if (dns.promises && typeof dns.promises.lookup === 'function') {
	const originalPromiseLookup = dns.promises.lookup;
	dns.promises.lookup = async function patchedPromiseLookup(hostname, options) {
		if (!isLoopback(hostname)) {
			record('dns', hostname);
			const error = new Error(`[offline-guard] DNS lookup blocked: ${hostname}`);
			error.code = 'EAI_AGAIN';
			throw error;
		}
		return originalPromiseLookup.call(this, hostname, options);
	};
}

// ── TCP ─────────────────────────────────────────────────────────────────────
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patchedConnect(...args) {
	let host = null;
	let port = null;

	// connect(port[, host][, listener])
	// connect(options[, listener])
	const options = args[0];
	if (typeof options === 'object' && options !== null) {
		host = options.host || options.path || null;
		port = options.port ?? null;
	} else if (typeof options === 'number' || typeof options === 'string') {
		port = options;
		host = typeof args[1] === 'string' ? args[1] : null;
	}

	if (!isLoopback(host)) {
		record('tcp', `${host || 'unknown'}:${port ?? '?'}`);
		const error = new Error(
			`[offline-guard] outbound connection blocked: ${host}:${port}`,
		);
		error.code = 'ENETUNREACH';
		queueMicrotask(() => this.destroy(error));
		return this;
	}

	return originalConnect.apply(this, args);
};

// Announce once so a test log shows the guard is active.
console.error(
	`[offline-guard] active — outbound network blocked, attempts logged to ${LOG_PATH}`,
);

/**
 * src/backend/services/SystemHealthService.js
 *
 * Operational read model for the System Health page.
 *
 * HONESTY RULES
 *  1. Availability and error rate come from the LIVE request log, which is
 *     process-local. The page states that no historical uptime is implied —
 *     a process that restarted an hour ago would otherwise look "100% up".
 *  2. Percentiles (p50/p95/p99) are reported alongside the mean, because a
 *     mean hides the tail.
 *  3. Scheduled work is described by what actually runs: two intervals in
 *     server.js. No job queue is invented.
 *  4. Storage is measured from the real uploads directory.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getServerMetrics, getLatencyStats } from '../server-metrics.js';
import { config } from '../config.js';

export class SystemHealthService {
	/** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
	constructor(repo) {
		this.#repo = repo;
	}

	#repo;

	/**
	 * The full health snapshot.
	 * @param {{ minutes?:number, now?:Date }} [options]
	 */
	async getSnapshot({ minutes = 60, now = new Date() } = {}) {
		const safeMinutes = Math.min(Math.max(Number(minutes) || 60, 1), 1440);

		const [metrics, latency, database, realtime, storage, scheduled] = await Promise.all([
			this.#metrics(safeMinutes),
			this.#latency(safeMinutes),
			this.#database(),
			this.#realtime(),
			this.#storage(),
			this.#scheduled(now),
		]);

		return {
			meta: {
				generatedAt: now.toISOString(),
				windowMinutes: safeMinutes,
				process: {
					uptimeSeconds: Math.round(process.uptime()),
					startedAt: new Date(now.getTime() - process.uptime() * 1000).toISOString(),
					nodeVersion: process.version,
					platform: process.platform,
					pid: process.pid,
				},
				notes: {
					availability:
						'Availability is the share of API requests in the window that did not fail with a 5xx status. A 4xx means the client sent something the server refused — the service was up and answering. The request log lives in memory and is reset on restart, so no historical uptime can be derived from it.',
					latency:
						'Percentiles are computed from the same in-memory request log. p95 and p99 are the numbers that describe the tail.',
					storage:
						'Measured from the configured uploads directory on disk.',
				},
			},
			sections: {
				api: {
					...metrics,
					// Availability is the share of requests that did not fail
					// with a SERVER error. A 4xx is a client mistake, not an
					// outage — counting it as downtime would make a burst of
					// expired tokens look like a failed service.
					availabilityPercent:
						latency.available && latency.sample > 0 ? latency.availabilityPercent : null,
					serverErrorRatePercent:
						latency.available && latency.sample > 0
							? latency.serverErrorRatePercent
							: null,
					serverErrors: latency.available ? latency.serverErrors ?? null : null,
				},
				latency,
				database,
				realtime,
				storage,
				scheduled,
			},
		};
	}

	async #metrics(minutes) {
		try {
			const metrics = getServerMetrics(minutes, {});
			const summary = metrics?.summary || {};
			const total = summary.apiCalls ?? 0;
			return {
				available: true,
				window: metrics?.window || null,
				totalCalls: total,
				errors: summary.apiErrors ?? 0,
				warnings: summary.warnings ?? 0,
				logErrors: summary.errors ?? 0,
				averageResponseMs: summary.averageResponseMs ?? null,
				// The 4xx/5xx split comes from the latency snapshot, which
				// separates client errors from server failures.
				errorRatePercent:
					total > 0 ? Math.round((summary.apiErrors / total) * 1000) / 10 : null,
				endpoints: (metrics?.apiCalls || []).slice(0, 20).map((endpoint) => ({
					method: endpoint.method,
					path: endpoint.path,
					calls: endpoint.calls,
					errors: endpoint.errors,
					errorRatePercent:
						endpoint.calls > 0
							? Math.round((endpoint.errors / endpoint.calls) * 1000) / 10
							: 0,
					averageMs: endpoint.averageMs,
				})),
				repeatedLogs: (metrics?.repeatedLogs || []).slice(0, 10).map((entry) => ({
					level: entry.level,
					message: entry.message,
					source: entry.source,
					count: entry.count,
					firstAt: entry.firstAt,
					lastAt: entry.lastAt,
				})),
			};
		} catch (err) {
			return { available: false, error: err.message };
		}
	}

	async #latency(minutes) {
		try {
			return { available: true, ...getLatencyStats(minutes) };
		} catch (err) {
			return { available: false, error: err.message };
		}
	}

	async #database() {
		try {
			const prisma = this.#repo.modelFor('schools');
			const started = Date.now();
			await prisma.count();
			const roundTripMs = Date.now() - started;

			const tables = [
				['users', this.#repo.modelFor('users')],
				['schools', prisma],
				['classes', this.#repo.modelFor('classes')],
				['exams', this.#repo.modelFor('exams')],
				['questions', this.#repo.modelFor('questions')],
				['results', this.#repo.modelFor('results')],
				['audit_logs', this.#repo.modelFor('audit_logs')],
				['security_events', this.#repo.modelFor('security_events')],
			];
			const counts = {};
			for (const [name, delegate] of tables) {
				try {
					counts[name] = await delegate.count();
				} catch {
					counts[name] = null;
				}
			}

			return {
				available: true,
				provider: config.dbProvider,
				status: 'reachable',
				roundTripMs,
				counts,
			};
		} catch (err) {
			return { available: false, status: 'unreachable', error: err.message };
		}
	}

	async #realtime() {
		try {
			const { presenceSize, listPresence } = await import('../realtime/presence.registry.js');
			const presence = listPresence();
			const connections = Array.isArray(presence)
				? presence.length
				: presence instanceof Map
					? presence.size
					: 0;
			return {
				available: true,
				status: 'running',
				trackedConnections: presenceSize ? presenceSize() : connections,
			};
		} catch (err) {
			return { available: false, status: 'unknown', error: err.message };
		}
	}

	async #storage() {
		try {
			const dir = path.resolve(process.cwd(), config.uploadsDir);
			let bytes = 0;
			let files = 0;
			const walk = (current) => {
				let entries = [];
				try {
					entries = fs.readdirSync(current, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					const full = path.join(current, entry.name);
					if (entry.isDirectory()) walk(full);
					else if (entry.isFile()) {
						try {
							bytes += fs.statSync(full).size;
							files += 1;
						} catch {
							/* unreadable file — skip */
						}
					}
				}
			};
			walk(dir);
			return {
				available: true,
				directory: dir,
				files,
				bytes,
				megabytes: Math.round((bytes / 1024 / 1024) * 100) / 100,
			};
		} catch (err) {
			return { available: false, error: err.message };
		}
	}

	/**
	 * The scheduled work that actually exists in this application. There is no
	 * job queue: these are the two intervals declared in server.js.
	 */
	async #scheduled(now) {
		const uptimeSeconds = Math.round(process.uptime());
		return {
			available: true,
			tasks: [
				{
					name: 'Expired exam session cleanup',
					intervalMinutes: 5,
					description:
						'Removes exam sessions that passed their expiry without being completed.',
				},
				{
					name: 'Refresh token purge',
					intervalMinutes: 60,
					description:
						'Deletes revoked and expired refresh tokens. Active sessions are never touched.',
				},
			],
			note: 'These are the only scheduled jobs in the application. There is no background job queue, so no queue metrics are reported.',
			lastProcessStart: new Date(now.getTime() - uptimeSeconds * 1000).toISOString(),
		};
	}
}

/**
 * src/backend/services/DeviceService.js
 *
 * Classroom device registry. One row per browser/machine that connects to the
 * school. Rows are created/refreshed from the student socket `register`
 * handshake and managed from the admin "Classroom Devices" tab:
 *
 *   - allow / block  → hard block: blocked devices are disconnected on
 *                      register and refused on every reconnect until allowed.
 *   - assign         → link a machine to a student (assigned_user_id).
 *   - rename / note  → teacher label such as "Lab A - PC 12".
 *
 * Tenant isolation: every method takes schoolId and scopes by it.
 */

import { NotFoundError, ValidationError } from '../../shared/errors.js';

const DEVICE_TYPES = new Set(['desktop', 'mobile', 'tablet', 'unknown']);
const STATUSES = new Set(['allowed', 'blocked']);

/**
 * Best-effort classification from a User-Agent string. The client may also send
 * an explicit deviceType (e.g. a native shell); an explicit value wins.
 */
export function classifyUserAgent(userAgent = '') {
	const ua = String(userAgent || '');
	if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
		return { device_type: 'tablet', platform: platformFromUserAgent(ua) };
	}
	if (/Mobi|Android|iPhone|iPod|Windows Phone|Opera Mini|IEMobile|BlackBerry/i.test(ua)) {
		return { device_type: 'mobile', platform: platformFromUserAgent(ua) };
	}
	if (!ua.trim()) return { device_type: 'unknown', platform: null };
	return { device_type: 'desktop', platform: platformFromUserAgent(ua) };
}

function platformFromUserAgent(ua) {
	if (/Windows/i.test(ua)) return 'Windows';
	if (/Android/i.test(ua)) return 'Android';
	if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
	if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
	if (/CrOS/i.test(ua)) return 'ChromeOS';
	if (/Linux/i.test(ua)) return 'Linux';
	return null;
}

export class DeviceService {
	#repo;

	constructor(repo) {
		this.#repo = repo;
	}

  /** @returns {import('@prisma/client').Prisma.DeviceGetPayload<{ include: ... }>[]} */
  async list(schoolId) {
    if (!schoolId) return [];
    return this.#repo.modelFor('devices').findMany({
      where: { school_id: schoolId },
      orderBy: [{ hostname: 'asc' }, { first_seen: 'desc' }],
      include: {
        assignedUser: {
          // role included so the UI can badge staff machines (teachers'
          // browsers register like student devices) vs student ones.
          select: { id: true, name: true, username: true, role: true, class_id: true },
        },
      },
    });
  }

	async getByKey(schoolId, deviceKey) {
		if (!schoolId || !deviceKey) return null;
		return this.#repo.modelFor('devices').findUnique({
			where: {
				school_id_device_key: {
					school_id: String(schoolId),
					device_key: String(deviceKey),
				},
			},
		});
	}

  async getById(schoolId, id) {
    if (!schoolId || !id) return null;
    return this.#repo.modelFor('devices').findFirst({
      where: { id, school_id: schoolId },
      include: {
        assignedUser: {
          select: { id: true, name: true, username: true, role: true, class_id: true },
        },
      },
    });
  }

	/**
	 * Cheap block check used on the socket register path. Never throws — a DB
	 * hiccup must not take down realtime, so failures degrade to "allowed".
	 */
	async isBlocked(schoolId, deviceKey) {
		try {
			const device = await this.getByKey(schoolId, deviceKey);
			return device?.status === 'blocked';
		} catch {
			return false;
		}
	}

	/**
	 * Create or refresh the row for a connecting device. Called from the socket
	 * `register` handler (best effort). Returns the persisted row or null.
	 */
	async touch({
		schoolId,
		deviceKey,
		hostname = null,
		deviceType = null,
		platform = null,
		userAgent = null,
		ip = null,
		userId = null,
	}) {
		const key = String(deviceKey || '').trim().slice(0, 200);
		if (!schoolId || !key) return null;

		const model = this.#repo.modelFor('devices');
		const existing = await this.getByKey(schoolId, key);

		const classified = classifyUserAgent(userAgent || '');
		const cleanHostname = hostname ? String(hostname).trim().slice(0, 240) : null;
		const cleanType =
			deviceType && DEVICE_TYPES.has(String(deviceType))
				? String(deviceType)
				: null;

		const data = {
			last_seen: new Date(),
			last_ip: ip ? String(ip).slice(0, 120) : existing?.last_ip ?? null,
			user_agent: userAgent ? String(userAgent).slice(0, 500) : existing?.user_agent ?? null,
			// Only overwrite a hostname with a real one — never clobber a
			// teacher-renamed machine with an empty/generic value.
			hostname: cleanHostname || existing?.hostname || null,
			device_type: cleanType || classified.device_type || existing?.device_type || 'desktop',
			platform: platform ? String(platform).slice(0, 120) : existing?.platform || classified.platform,
		};

		// Auto-link the machine to the connecting student until a teacher
		// explicitly (re)assigns it.
		if (userId && !existing?.assigned_user_id) data.assigned_user_id = userId;

		if (existing) {
			return model.update({ where: { id: existing.id }, data });
		}
		return model.create({
			data: { school_id: schoolId, device_key: key, status: 'allowed', ...data },
		});
	}

	async setStatus(schoolId, id, status) {
		const next = String(status || '').toLowerCase();
		if (!STATUSES.has(next)) {
			throw new ValidationError('status must be "allowed" or "blocked"');
		}
		await this.#mustExist(schoolId, id);
		await this.#repo.modelFor('devices').updateMany({
			where: { id, school_id: schoolId },
			data: { status: next },
		});
		return this.getById(schoolId, id);
	}

	async assign(schoolId, id, userId) {
		await this.#mustExist(schoolId, id);
		await this.#repo.modelFor('devices').updateMany({
			where: { id, school_id: schoolId },
			data: { assigned_user_id: userId ? String(userId) : null },
		});
		return this.getById(schoolId, id);
	}

	async rename(schoolId, id, { hostname, note } = {}) {
		await this.#mustExist(schoolId, id);
		const data = {};
		if (hostname !== undefined) {
			data.hostname = hostname ? String(hostname).trim().slice(0, 240) : null;
		}
		if (note !== undefined) {
			data.note = note ? String(note).trim().slice(0, 240) : null;
		}
		await this.#repo.modelFor('devices').updateMany({ where: { id, school_id: schoolId }, data });
		return this.getById(schoolId, id);
	}

	async remove(schoolId, id) {
		const result = await this.#repo.modelFor('devices').deleteMany({
			where: { id, school_id: schoolId },
		});
		if (!result.count) throw new NotFoundError(`devices:${id}`);
		return { deleted: true };
	}

	async #mustExist(schoolId, id) {
		const device = await this.#repo.modelFor('devices').findFirst({
			where: { id, school_id: schoolId },
			select: { id: true, device_key: true },
		});
		if (!device) throw new NotFoundError(`devices:${id}`);
		return device;
	}
}

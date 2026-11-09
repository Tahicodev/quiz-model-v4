/**
 * src/backend/realtime/presence.registry.js
 *
 * Live presence of authenticated sockets, shared by the realtime bridge
 * (writer) and the teacher analytics read model (reader).
 *
 * Why module state: presence answers "right now" and is only meaningful for
 * sockets owned by this server process. Multi-worker deployments with a Redis
 * adapter would need a shared store; readers degrade to zero rather than
 * report a partial roster as complete.
 *
 * Students are identified by their verified JWT user id. Multiple sockets for
 * the same user are intentionally kept as separate rows so device-level
 * consumers (Classroom Devices) still see each machine; analytics dedupes by
 * user id.
 */

const presenceBySocket = new Map();

function normalise(info = {}) {
	const socketId = String(info.socketId || '').trim();
	if (!socketId) return null;
	const role = String(info.role || '').toLowerCase() || null;
	return {
		socketId,
		userId: info.userId == null ? null : String(info.userId),
		schoolId: info.schoolId == null ? null : String(info.schoolId),
		role,
		kind: info.kind || (role === 'student' ? 'student' : 'staff'),
		deviceId: info.deviceId == null ? null : String(info.deviceId),
		name: info.name || null,
		hostname: info.hostname || null,
		deviceType: info.deviceType || null,
		platform: info.platform || null,
		ip: info.ip || '',
		status: 'online',
		connectedAt: info.connectedAt || new Date().toISOString(),
		lastSeen: info.lastSeen || new Date().toISOString(),
	};
}

/** Insert or refresh one socket. Returns the stored row. */
export function upsertPresence(info) {
	const row = normalise(info);
	if (!row) return null;
	presenceBySocket.set(row.socketId, { ...row, lastSeen: new Date().toISOString() });
	return presenceBySocket.get(row.socketId);
}

/** Remove a socket and return its last known row (null when unknown). */
export function removePresence(socketId) {
	const key = String(socketId || '');
	const row = presenceBySocket.get(key) || null;
	presenceBySocket.delete(key);
	return row;
}

/**
 * Snapshot of connected sockets.
 * @param {{ schoolId?: string|null, role?: string|null, kind?: string|null }} [filter]
 */
export function listPresence({ schoolId = null, role = null, kind = null } = {}) {
	const school = schoolId == null ? null : String(schoolId);
	const wantedRole = role == null ? null : String(role).toLowerCase();
	const rows = [];
	for (const row of presenceBySocket.values()) {
		if (school != null && school !== '' && row.schoolId !== school) continue;
		if (wantedRole && row.role !== wantedRole) continue;
		if (kind && row.kind !== kind) continue;
		rows.push({ ...row });
	}
	return rows;
}

/** Test helper — never called by production code. */
export function clearPresence() {
	presenceBySocket.clear();
}

export function presenceSize() {
	return presenceBySocket.size;
}

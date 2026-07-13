/**
 * src/backend/realtime/socket.rooms.js
 *
 * Centralized room-naming conventions for Socket.io targeting.
 *
 * Non-negotiable rule (spec Section 11): never emit sensitive data globally —
 * always target a room. The three room formats mandated by the spec are:
 *   school:{id}      — auto-joined on connect, used for school-wide broadcasts
 *   game:{id}        — game session participants
 *   exam:{id}        — exam session participants
 * We also add tournament:{id} for parity with the tournament handler.
 *
 * Use these helpers everywhere instead of raw `game:${id}` string literals,
 * so the room format is defined in exactly one place.
 */

export const ROOM = Object.freeze({
  school:     (id) => `school:${id}`,
  game:       (id) => `game:${id}`,
  exam:       (id) => `exam:${id}`,
  tournament: (id) => `tournament:${id}`,
});

/**
 * Join a socket to a typed room.
 * @param {import('socket.io').Socket} socket
 * @param {'school'|'game'|'exam'|'tournament'} type
 * @param {string} id
 */
export function joinRoom(socket, type, id) {
  socket.join(ROOM[type](id));
}

/**
 * Remove a socket from a typed room.
 * @param {import('socket.io').Socket} socket
 * @param {'school'|'game'|'exam'|'tournament'} type
 * @param {string} id
 */
export function leaveRoom(socket, type, id) {
  socket.leave(ROOM[type](id));
}

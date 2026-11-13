/** tmp: probe what the socket actually emits. */
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3123';

async function login(username, password) {
	const res = await fetch(`${BASE}/api/v1/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password, force: true }),
	});
	const body = await res.json();
	return body.accessToken;
}

const token = await login('v-teacher', 'Validate2026!');
console.log('token?', Boolean(token));

const socket = io(BASE, {
	transports: ['websocket', 'polling'],
	auth: { token },
	reconnection: false,
	timeout: 8000,
});

socket.onAny((event, payload) => {
	console.log('EVENT', event, JSON.stringify(payload)?.slice(0, 160));
});

socket.on('connect', () => {
	console.log('connected', socket.id);
	socket.emit('game:join', { gameId: 'v-game', name: 'Probe' });
	socket.emit('game:sync', { gameId: 'v-game' });
});

socket.on('connect_error', (err) => console.log('connect_error', err?.message));

await new Promise((r) => setTimeout(r, 5000));
socket.close();
process.exit(0);

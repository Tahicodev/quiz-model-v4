/**
 * scripts/e2e-lobby-test.mjs
 *
 * End-to-end simulation of the legacy lobby flow against the SaaS-mounted
 * game engine (no DB, no HTTP routes — just socket.io + the engine bridge):
 *   admin identify → game:create → openLobby → student join → mark ready →
 *   admin game:start → student answer → game:sync → game:list
 *
 * Run: node scripts/e2e-lobby-test.mjs
 * Exits 0 when every step acks as expected; prints the first failure otherwise.
 */
import http from 'http';
import { Server } from 'socket.io';
import { mountLegacyGameEngine } from '../src/backend/realtime/legacy-engine.bridge.js';

const httpServer = http.createServer();
const io = new Server(httpServer, { cors: { origin: '*', credentials: true } });
// Mimic src/backend/realtime/socket.auth.js: stamp socket.data.user from the
// handshake auth BEFORE any connection handler (and the engine) binds.
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  if (auth.token === 'staff-token') {
    socket.data.user = { id: 'admin-1', role: 'teacher', school_id: 'school-1', username: 'teacher' };
  } else {
    socket.data.user = { id: 'stu-e2e', role: 'student', school_id: 'school-1', username: 'alice' };
  }
  next();
});
mountLegacyGameEngine(io);

const step = (name, fn) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`FAIL: ${name} — timed out`);
      process.exit(1);
    }, 8000);
    Promise.resolve(fn()).then(
      (value) => {
        clearTimeout(timer);
        console.log(`ok: ${name}`, value === undefined ? '' : JSON.stringify(value));
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        console.error(`FAIL: ${name} —`, err?.message || err);
        process.exit(1);
      },
    );
  });

const emitAck = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    // Some engine events (game:list) take the ack as their ONLY argument.
    const args = payload === undefined ? [] : [payload];
    socket.timeout(6000).emit(event, ...args, (err, response) => {
      if (err) return reject(new Error(err));
      if (response && response.error) return reject(new Error(response.error));
      resolve(response);
    });
  });

try {
  await new Promise((r) => httpServer.listen(3123, r));

  const { io: Client } = await import('socket.io-client');
  const admin = Client('http://localhost:3123', { transports: ['websocket'], auth: { token: 'staff-token' } });
  const student = Client('http://localhost:3123', { transports: ['websocket'], auth: {} });

  await step('connect', async () => {
    await Promise.all([
      new Promise((r) => admin.on('connect', r)),
      new Promise((r) => student.on('connect', r)),
    ]);
  });

  // Staff identify — sets socket.role='admin' via the legacy-sync bridge for
  // engine broadcast targeting (admins get sanitizeForAdmin snapshots).
  admin.emit('identify', { role: 'admin' });
  student.emit('identify', { role: 'client' });
  await new Promise((r) => setTimeout(r, 300));

  await step('game:create', () =>
    emitAck(admin, 'game:create', {
      id: 'g-e2e-1',
      name: 'E2E Race',
      type: 'race',
      status: 'open',
      mode: 'individual',
      questions: [{ id: 'q1', question: '2+2?', answer: '4', options: ['3', '4'] }],
      settings: {},
      classIds: [],
    }),
  );

  await step('game:openLobby', () => emitAck(admin, 'game:openLobby', { gameId: 'g-e2e-1' }));

  const joinAck = await step('game:join', () =>
    emitAck(student, 'game:join', { gameId: 'g-e2e-1', userId: 'stu-e2e', userName: 'Alice', classId: 'class-a' }),
  );
  if (!joinAck?.ok) throw new Error('join did not ack ok');

  const readyAck = await step('game:ready', () =>
    emitAck(student, 'game:ready', { gameId: 'g-e2e-1', userId: 'stu-e2e' }),
  );
  const readyFlag = readyAck?.game?.session?.participants?.find((p) => p.userId === 'stu-e2e')?.ready;
  if (readyFlag !== true) throw new Error('participant ready flag not set');

  // game:start fires from the staff socket. socket.data.user was stamped by the
  // io.use middleware at handshake time (role: teacher), which the engine's
  // multi-path admin gate accepts — no adminSecret needed.
  const startAck = await step('game:start', () =>
    emitAck(admin, 'game:start', { gameId: 'g-e2e-1' }),
  );
  if (startAck?.game?.status !== 'live') throw new Error(`expected live status, got ${startAck?.game?.status}`);

  const answerAck = await step('game:answer', () =>
    emitAck(student, 'game:answer', { gameId: 'g-e2e-1', userId: 'stu-e2e', answer: '4', questionIndex: 0 }),
  );

  const syncAck = await step('game:sync', () =>
    emitAck(student, 'game:sync', { gameId: 'g-e2e-1', userId: 'stu-e2e' }),
  );

  // Student game:list — engine expects the ack as the only argument.
  const listAck = await step('game:list', () => emitAck(student, 'game:list'));

  console.log('\nE2E RESULT: PASS');
  console.log('  join:', joinAck.ok, '| ready:', readyFlag, '| status after start:', startAck.game.status);
  console.log('  answer ack keys:', Object.keys(answerAck || {}).slice(0, 6).join(','));
  console.log('  sync status:', syncAck?.game?.status, '| participants:', syncAck?.game?.session?.participants?.length);
  console.log('  list games:', listAck?.games?.length);
  process.exit(0);
} catch (err) {
  console.error('E2E RESULT: FAIL —', err.message);
  process.exit(1);
}

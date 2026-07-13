/**
 * tests/integration/socket.handshake.test.js
 *
 * SuperTest + Socket.io integration tests for the realtime layer (Phase D + §25
 * "All socket connections authenticated via JWT").
 *
 * Tests:
 *   1. Connecting with a valid JWT → socket connects successfully
 *   2. Connecting without a token → UNAUTHORIZED error
 *   3. Connecting with a bad token → UNAUTHORIZED error
 *   4. Sending GAME_JOIN with a valid gameId → room scoping + broadcast works
 *
 * Spins a dedicated httpServer + socket.io server with mocked services so
 * no real database is needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ioc } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { config } from '../../src/backend/config.js';
import { initSocketServer } from '../../src/backend/realtime/socket.server.js';

/** @type {import('http').Server} */
let httpServer;
/** @type {import('socket.io').Server} */
let ioServer;
/** @type {number} */
let port;

// Generate a valid JWT for the test user
const VALID_TOKEN = jwt.sign(
  { id: 'test-user-id', username: 'test', role: 'admin', school_id: 'school-test' },
  config.jwtSecret,
  { expiresIn: '15m' }
);

const EXPIRED_TOKEN = jwt.sign(
  { id: 'test-user-id', username: 'test', role: 'admin', school_id: 'school-test' },
  config.jwtSecret,
  { expiresIn: '0s' }
);

// Mock services for the socket server — no DB needed
const mockServices = {
  gameService: {
    joinGame: async ({ gameId, userId }) => ({ game_id: gameId, id: 'session-1' }),
    getClientState: async () => ({ id: 'game-1', name: 'Test Game', type: 'quiz', status: 'waiting', settings_json: '{}' }),
    getScores: async () => [{ userId: 'test-user-id', score: 0 }],
    markPlayerDisconnected: async () => {},
  },
  tournamentService: {
    register: async () => {},
    getLeaderboard: async () => [],
    recordAnswer: async () => ({ correct: true, points: 1, score: 1, showAnswer: false, correctAnswer: null }),
  },
  sessionService: {
    heartbeat: async () => {},
  },
};

beforeAll(async () => {
  httpServer = http.createServer();
  ioServer = await initSocketServer(httpServer, mockServices);

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterAll(() => {
  ioServer.close();
  httpServer.close();
});

describe('Socket.io handshake', () => {
  it('connects with a valid JWT and receives the connect event', async () => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token: VALID_TOKEN },
      transports: ['websocket'],
      autoConnect: false,
      timeout: 3000,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        expect(socket.connected).toBe(true);
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      socket.connect();
    });
  });

  it('rejects a connection without a token', async () => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      timeout: 3000,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        reject(new Error('Should not have connected without a token'));
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        expect(err.message).toContain('UNAUTHORIZED');
        socket.disconnect();
        resolve();
      });
      socket.connect();
    });
  });

  it('rejects a connection with an expired token', async () => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token: EXPIRED_TOKEN },
      transports: ['websocket'],
      autoConnect: false,
      timeout: 3000,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        reject(new Error('Should not have connected with expired token'));
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        expect(err.message).toContain('UNAUTHORIZED');
        socket.disconnect();
        resolve();
      });
      socket.connect();
    });
  });

  it('GAME_JOIN targets a game room and broadcasts player:joined to other room members', async () => {
    const GAME_ID = 'test-game-1';

    // Two client sockets
    const socket1 = ioc(`http://localhost:${port}`, {
      auth: { token: VALID_TOKEN },
      transports: ['websocket'],
      autoConnect: false,
      timeout: 3000,
    });

    const socket2 = ioc(`http://localhost:${port}`, {
      auth: { token: jwt.sign(
        { id: 'user-2', username: 'player2', role: 'student', school_id: 'school-test' },
        config.jwtSecret,
        { expiresIn: '15m' }
      )},
      transports: ['websocket'],
      autoConnect: false,
      timeout: 3000,
    });

    // Connect both sockets
    await Promise.all([
      new Promise((resolve) => { socket1.on('connect', () => resolve()); socket1.connect(); }),
      new Promise((resolve) => { socket2.on('connect', () => resolve()); socket2.connect(); }),
    ]);

    // Both join the same game room
    await Promise.all([
      new Promise((resolve) => { socket1.on('game:state_update', () => resolve()); socket1.emit('game:join', { gameId: GAME_ID }); }),
      new Promise((resolve) => { socket2.on('game:state_update', () => resolve()); socket2.emit('game:join', { gameId: GAME_ID }); }),
    ]);

    // Now that both are in the room, socket2 listens for player:joined.
    // Socket1 joins again (mocked joinGame returns the existing session,
    // so the handler will still emit player:joined to the room).
    const joinedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('player:joined timeout')), 3000);
      socket2.on('player:joined', (data) => {
        clearTimeout(timeout);
        expect(data.userId).toBe('test-user-id');
        resolve(data);
      });
    });

    // Socket1 emits join again — the mock handler will still trigger player:joined
    socket1.emit('game:join', { gameId: GAME_ID });

    const joinedData = await joinedPromise;
    expect(joinedData.username).toBe('test');

    socket1.disconnect();
    socket2.disconnect();
  });
});

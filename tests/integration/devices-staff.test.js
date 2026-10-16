/**
 * tests/integration/devices-staff.test.js
 *
 * Staff presence in Classroom Devices: a teacher's socket register creates a
 * device row linked to them (visible on login), the list exposes the linked
 * role, teachers only see their own + unassigned machines, and they cannot
 * touch other scopes' rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { io as ioc } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { config } from '../../src/backend/config.js';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

// NOTE: socket.server.js is imported dynamically in beforeAll (after
// setupTestDb switches DATABASE_URL). A static import would evaluate the
// shared Prisma client while it still points at dev.db, and every socket
// handler + the app container would then read the wrong database.

let app;
let prisma;
let httpServer;
let ioServer;
let port;
let adminToken;
let teacher1Token;
let teacher2Token;
let teacher1Id;
let teacher2Id;
let class1Id;

const mockServices = {
  gameService: {
    joinGame: async () => ({}),
    getClientState: async () => ({}),
    getScores: async () => [],
    markPlayerDisconnected: async () => {},
  },
  tournamentService: {
    register: async () => {},
    getLeaderboard: async () => [],
    recordAnswer: async () => ({}),
  },
  sessionService: { heartbeat: async () => {} },
};

function staffToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      school_id: 'school-test',
    },
    config.jwtSecret,
    { expiresIn: '15m' },
  );
}

function connectSocket(token) {
  const socket = ioc(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
    timeout: 5000,
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    socket.connect();
  });
}

async function waitForDevice(deviceKey, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.device.findFirst({
      where: { school_id: 'school-test', device_key: deviceKey },
    });
    if (row) return row;
    if (Date.now() > deadline) throw new Error('device row timeout: ' + deviceKey);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;
  const { initSocketServer } = await import(
    '../../src/backend/realtime/socket.server.js'
  );
  httpServer = http.createServer();
  ioServer = await initSocketServer(httpServer, mockServices);
  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });

  const passwordHash = await bcrypt.hash('teacher123', 4);
  const t1 = await prisma.user.create({
    data: {
      school_id: 'school-test', username: 't1', name: 'Teacher One',
      password_hash: passwordHash, role: 'teacher', status: 'active',
    },
  });
  const t2 = await prisma.user.create({
    data: {
      school_id: 'school-test', username: 't2', name: 'Teacher Two',
      password_hash: passwordHash, role: 'teacher', status: 'active',
    },
  });
  teacher1Id = t1.id;
  teacher2Id = t2.id;

  const login = async (username, password) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password, force: true });
    expect(res.status).toBe(200);
    return res.body.accessToken;
  };
  adminToken = await login('admin', 'admin123');
  teacher1Token = await login('t1', 'teacher123');
  teacher2Token = await login('t2', 'teacher123');

  const cls = await request(app)
    .post('/api/v1/classes')
    .set('Authorization', `Bearer ${teacher1Token}`)
    .send({ name: 'T1 Class' });
  expect(cls.status).toBe(201);
  class1Id = cls.body.id;
}, 60000);

afterAll(async () => {
  ioServer.close();
  httpServer.close();
  await teardownTestDb();
});

describe('staff devices', () => {
  it('teacher socket register creates a linked device row', async () => {
    const socket = await connectSocket(
      staffToken({ id: teacher1Id, username: 't1', role: 'teacher' }),
    );
    socket.emit('identify', { role: 'admin' });
    socket.emit('register', { deviceId: 'hicham-pc-1' });
    const row = await waitForDevice('hicham-pc-1');
    expect(String(row.assigned_user_id)).toBe(String(teacher1Id));
    expect(row.status).toBe('allowed');
    socket.disconnect();
  });

  it('admin device list exposes the linked teacher role', async () => {
    const res = await request(app)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((d) => d.device_key === 'hicham-pc-1');
    expect(row).toBeTruthy();
    expect(row.assignedUser?.role).toBe('teacher');
    expect(row.assignedUser?.name).toBe('Teacher One');
  });

  it('teachers see only their own machine plus unassigned hardware', async () => {
    await prisma.device.create({
      data: { school_id: 'school-test', device_key: 'lab-pc-9', status: 'allowed' },
    });
    const mine = await request(app)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${teacher1Token}`);
    expect(mine.status).toBe(200);
    const keys = mine.body.map((d) => d.device_key);
    expect(keys).toContain('hicham-pc-1');
    expect(keys).toContain('lab-pc-9');

    const other = await request(app)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${teacher2Token}`);
    expect(other.status).toBe(200);
    const otherKeys = other.body.map((d) => d.device_key);
    expect(otherKeys).not.toContain('hicham-pc-1');
    expect(otherKeys).toContain('lab-pc-9');
  });

  it('teachers cannot touch other scopes device rows', async () => {
    const row = await prisma.device.findFirst({
      where: { school_id: 'school-test', device_key: 'hicham-pc-1' },
    });
    const blocked = await request(app)
      .patch('/api/v1/devices/' + row.id)
      .set('Authorization', `Bearer ${teacher2Token}`)
      .send({ status: 'blocked' });
    expect(blocked.status).toBe(403);
    const renamed = await request(app)
      .patch('/api/v1/devices/' + row.id)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({ hostname: 'Hicham PC' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.hostname).toBe('Hicham PC');
  });

  it('admin can end sessions from the device-linked user', async () => {
    const before = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 't1', password: 'teacher123', force: true });
    expect(before.status).toBe(200);
    const kill = await request(app)
      .delete('/api/v1/users/' + teacher1Id + '/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(kill.status).toBe(200);
    expect(kill.body.revoked).toBeGreaterThan(0);
    const again = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 't1', password: 'teacher123' });
    expect(again.status).toBe(200);
  });
});

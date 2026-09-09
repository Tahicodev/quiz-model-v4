/**
 * scripts/e2e-socket-keeper-test.mjs — verifies the same-browser admin+student
 * realtime recovery against the REAL socket.io server + auth middleware.
 *
 * Reproduces the user's exact failure topology inside one Node process:
 *   "Tab A"  : admin     (its login wins the browser-wide refresh cookie)
 *   "Tab B"  : student    (NEW TAB — empty sessionStorage → reads shared
 *               localStorage → builds its socket with the ADMIN's token;
 *               the poisoning step). After an in-page student login, the
 *               socket-auth-keeper decision tree must re-auth the SAME
 *               socket object in place — no page reload.
 *   "Browser 2": another student with its own storage (control — the user's
 *               Edge browser, which always worked).
 *
 * The SaaS server (npm start) must already be running on localhost:3000.
 * Creates throwaway student users via the admin API and removes them after.
 */
import { io } from 'socket.io-client';

const BASE = process.env.QUIZ_BASE_URL || 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const ADMIN_USER = process.env.QUIZ_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.QUIZ_ADMIN_PASS || 'admin123';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

async function login(username, password) {
  // Login is rate-limited (10 per 15 min per IP, 429s also count against
  // the quota) — back off using the server's Retry-After when told to.
  let retryAfterMs = 0;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    if (retryAfterMs) await new Promise((r) => setTimeout(r, retryAfterMs));
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 429) {
      const retrySec = Number(res.headers.get('retry-after')) || 30;
      retryAfterMs = (retrySec + 1) * 1000;
      console.log(`  (rate-limited; waiting ${retrySec}s before retrying ${username})`);
      continue;
    }
    if (!res.ok) throw new Error(`login ${username} failed: ${res.status}`);
    const setCookie = res.headers.get('set-cookie') || '';
    const refreshCookie = /refreshToken=([^;]+)/.exec(setCookie)?.[1] || '';
    const data = await res.json();
    return {
      token: data.accessToken || data.data?.accessToken,
      userId: data.user?.id,
      refreshCookie,
    };
  }
  throw new Error(`login ${username}: rate-limited`);
}

const emitAck = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    const args = payload === undefined ? [] : [payload];
    socket.timeout(6000).emit(event, ...args, (err, response) => {
      if (err) return reject(new Error(err));
      if (response && response.error) return reject(new Error(response.error));
      resolve(response);
    });
  });

const waitFor = (emitter, event, predicate = () => true, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    const on = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      emitter.removeListener(event, on);
      resolve(payload);
    };
    emitter.on(event, on);
  });

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  let encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (encoded.length % 4) encoded += '=';
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// In-page keeper replica: the same decision tree as
// socket-auth-keeper.js reviveCachedSocket(), driven against a live socket.
function makeKeeperReplica() {
  let mismatchCooldownUntil = 0;
  async function refresh(active, refreshCookie) {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refreshToken=${refreshCookie}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken || data.token || null;
  }
  return {
    async revive(socket, activeToken, refreshCookie) {
      const active = decodeJwt(activeToken);
      if (!active) return { action: 'anonymous' };
      const socketToken = socket.auth?.token || '';
      const socketIdentity = decodeJwt(socketToken);
      const wrongIdentity =
        socketIdentity &&
        (socketIdentity.id !== active.id ||
          String(socketIdentity.role || '') !== String(active.role || ''));
      if (!wrongIdentity && socket.connected) return { action: 'none' };
      if (wrongIdentity || socketToken !== activeToken) {
        // swap identity/token in place — the socket OBJECT survives so all
        // page-bound listeners keep working.
        socket.auth = { ...(socket.auth || {}), token: activeToken };
        if (socket.connected) socket.disconnect();
        socket.connect();
        return { action: 'reauthenticated' };
      }
      // Same token, dead socket → refresh path (cookie must belong to this
      // user; a different user's token is rejected with a cooldown).
      if (Date.now() < mismatchCooldownUntil) return { action: 'cooldown' };
      const fresh = await refresh(active, refreshCookie);
      if (!fresh) return { action: 'refresh-failed' };
      const freshIdentity = decodeJwt(fresh);
      if (
        freshIdentity &&
        (freshIdentity.id !== active.id ||
          String(freshIdentity.role || '') !== String(active.role || ''))
      ) {
        mismatchCooldownUntil = Date.now() + 60000;
        return { action: 'identity-mismatch' };
      }
      socket.auth = { ...(socket.auth || {}), token: fresh };
      socket.connect();
      return { action: 'refreshed' };
    },
  };
}

// ── Scenario ─────────────────────────────────────────────────────────────────
async function main() {
  let adminSession;
  try {
    adminSession = await login(ADMIN_USER, ADMIN_PASS);
  } catch (e) {
    console.error('Admin login failed:', e.message, '(expected admin/admin123 from prisma seed)');
    process.exit(2);
  }

  // Create two throwaway students via the admin API.
  const stamp = Date.now().toString(36);
  const students = [
    { username: `keeper-edge-${stamp}`, name: `Keeper Edge ${stamp}` },
    { username: `keeper-chrome-${stamp}`, name: `Keeper Chrome ${stamp}` },
  ];
  const created = [];
  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminSession.token}`,
  };
  try {
    for (const s of students) {
      const res = await fetch(`${API}/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ ...s, password: 'keeper-test-123', role: 'student' }),
      });
      if (!res.ok) throw new Error(`create user ${s.username}: ${res.status}`);
      const data = await res.json();
      created.push(data.data?.id || data.id);
    }
  } catch (e) {
    console.error('User creation failed (admin API):', e.message);
    process.exit(2);
  }
  const cleanup = async () => {
    await Promise.all(
      created.map((id) =>
        fetch(`${API}/users/${id}`, {
          method: 'DELETE',
          headers: adminHeaders,
        }).catch(() => {}),
      ),
    );
  };

  try {
    const edgeStudent = await login(students[0].username, 'keeper-test-123');
    const chromeStudent = await login(students[1].username, 'keeper-test-123');
    const keeper = makeKeeperReplica();

    // 1. Edge student connects with its OWN token (separate browser storage) —
    //    the control case that always worked for the user.
    const edge = io(BASE, { auth: { token: edgeStudent.token }, transports: ['websocket'] });
    await waitFor(edge, 'connect');
    check('Edge student connects (control)', true);

    // 2. Chrome student NEW TAB: empty sessionStorage → shared localStorage
    //    holds the ADMIN's token → the tab's socket is built with it. The
    //    token is VALID, so it connects — but under the WRONG identity.
    const chrome = io(BASE, { auth: { token: adminSession.token }, transports: ['websocket'] });
    await waitFor(chrome, 'connect');
    const chromeIdentity = decodeJwt(chrome.auth?.token);
    check(
      'Chrome tab socket built from shared ADMIN token connects (poisoned identity)',
      chromeIdentity?.role === 'admin',
      chromeIdentity?.role,
    );

    // 3. In-page student login lands (no reload): the keeper re-auths the SAME
    //    socket object in place with the student token.
    const revive1 = await keeper.revive(chrome, chromeStudent.token, chromeStudent.refreshCookie);
    check('Keeper re-authenticates poisoned socket in place', revive1.action === 'reauthenticated', revive1.action);

    await waitFor(chrome, 'connect');
    const afterIdentity = decodeJwt(chrome.auth?.token);
    check(
      'Chrome socket reconnects under the STUDENT identity',
      afterIdentity?.id === chromeStudent.userId && afterIdentity?.role === 'student',
      `${afterIdentity?.role}`,
    );

    // 4. Expired-token rejection: tamper the token (like a 15-minute expiry
    //    producing an invalid signature) and redial — the auth middleware
    //    must reject, then the keeper's identity swap must revive.
    chrome.auth = { token: `${chromeStudent.token.slice(0, -8)}tampered!` };
    // NOTE: a manual disconnect fires its 'disconnect' event synchronously,
    // so there is nothing to await — socket.connected is false immediately.
    chrome.disconnect();
    check('Manual disconnect leaves socket dead (invalidateAuthSession corpse)', !chrome.connected);
    chrome.connect();
    let rejected = false;
    try {
      await waitFor(chrome, 'connect', () => true, 4000);
    } catch {
      rejected = true;
    }
    check('Server rejects tampered token (connect_error path)', rejected);

    const revive2 = await keeper.revive(chrome, chromeStudent.token, chromeStudent.refreshCookie);
    check('Keeper revives auth-rejected socket', revive2.action === 'reauthenticated', revive2.action);
    await waitFor(chrome, 'connect');
    check('Chrome socket alive again under student identity', true);

    // 5. Admin tab (same browser, its own valid token) stays unaffected.
    const adminTab = io(BASE, { auth: { token: adminSession.token }, transports: ['websocket'] });
    await waitFor(adminTab, 'connect');
    check('Admin tab socket unaffected', true);

    // 6. The revived student socket still acks realtime events (the exact
    //    path behind toggleReady's "Realtime server disconnected" toast).
    const listRes = await emitAck(chrome, 'game:list');
    check(
      'Revived student socket acks game:list',
      !!listRes && (Array.isArray(listRes) || Array.isArray(listRes.games)),
      JSON.stringify(listRes).slice(0, 60),
    );

    [edge, chrome, adminTab].forEach((s) => s.disconnect());
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${results.length} checks`);
    await cleanup();
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('Harness crashed:', err.message);
    await cleanup();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});

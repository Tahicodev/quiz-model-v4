# Migration Failure Report

Updated: 2026-08-05

This report documents the **SaaS-only migration** — removal of the localStorage / LAN mode from the codebase. It lists what was changed, what still works, and what was non-trivially broken (and fixed) along the way.

---

## Migration goal

Move the project from a dual-mode codebase (`APP_MODE=local|saas`) to **SaaS-only**:

- Remove the localStorage-backed repository (`LocalStorageRepository`) and its synchronous-cache decorator (`CacheDecorator`).
- Strip every `config.mode === 'local'` / `config.isLocal` branch from the frontend and backend.
- Drop the localStorage→database migration tool (it was a one-shot, not part of the SaaS runtime).
- Preserve the legacy admin/student UI exactly — still rendered by `admin.html`, `index.html`, and `student-workspace.html` — by having those pages read and write through the SaaS REST API.

The migration changes the **structure** of the application; the legacy DOM, classes, and user flows remain byte-identical.

---

## What was removed

| Path | Reason |
|------|--------|
| `src/frontend/infrastructure/LocalStorageRepository.js` | LocalStorage-backed repo, only used in local mode |
| `src/frontend/infrastructure/CacheDecorator.js` | Only wrapped the localStorage repo |
| `src/frontend/ui/pages/migrate/MigratePage.js` (whole `migrate/` folder) | One-shot localStorage→DB import tool |
| `src/frontend/ui/pages/admin/MigrationPage.js` | Admin tab wrapper around the above |
| `src/backend/routes/migrate.routes.js` | `POST/GET /api/v1/migrate*` corresponds to the removed page |
| `tests/integration/LocalStorageRepository.contract.test.js` | Test file for a deleted class |
| `tests/integration/migrate.routes.test.js` | Test file for deleted routes |
| `src/frontend/services/AuthService.js` local-mode branch | Plaintext/compare fallback, base64 "JWT", local-user verification path |
| `src/frontend/container.js` mode checks | Now always instantiates `ApiRepository` |
| `src/backend/config.js` APP_MODE branches | `mode` is now the constant `'saas'`; `isLocal` always `false`; `JWT_SECRET` minimum 64 chars enforced unconditionally |
| `src/backend/realtime/socket.auth.js` strategy 3 | Base64-encoded legacy "local-mode token" no longer accepted |
| `install.sh` local-mode `.env` template | `APP_MODE=local` and `DEFAULT_SCHOOL_ID=local` dropped |
| `prisma/seed.js` "local" default school id | Now seeds `saas-default` (overridable via `DEFAULT_SCHOOL_ID`) |
| Frontend/admin `school_id ?? 'local'` fallbacks | All 14 services / pages updated to use the authenticated `school_id` (no silent fallback) |
| `package.json` description | Updated from "local LAN and SaaS modes" to "SaaS deployment" |
| `README.md` | Rewritten to describe the SaaS-only runtime contract |

## What was preserved (UI / UX)

- `admin.html`, `index.html`, `student-workspace.html` — rendered byte-for-byte from the legacy page surfaces.
- All root-level legacy scripts (`script.js`, `auth.js`, `admin-main.js`, `student-workspace.js`, `game-server.js`, `games-core.js`, `realtime-client.js`, `realtime-admin.js`, `realtime-settings.js`, etc.) — untouched.
- `legacy-bridge.js` and `legacy-auth-bridge.js` — rewritten to SaaS-only, but the legacy pages still see the same `window.__DI_CONTAINER__` API they always did.

## What was added

- **`src/backend/routes/bootstrap.routes.js`** — `GET /api/v1/bootstrap`. Returns every tenant-scoped table the legacy preloaders need, in one request, with the caller's `school_id` enforced via middleware. Replaces the previous `/api/v1/migrate/export` endpoint with a name that reflects its actual purpose (read-only preload, not data migration).

---

## Failures encountered and how they were fixed

### 1. Test suite failure: `auth.routes.test.js` (and all integration tests) — module not found

**Symptom:** `Error: Cannot find module '../../../src/backend/routes/migrate.routes.js'`

**Root cause:** the test helper `tests/integration/helpers/app.js` builds its own Express app and still imported the deleted `migrate.routes.js`.

**Fix:**
- Updated `tests/integration/helpers/app.js` to import `bootstrap.routes.js` instead.
- Removed the `app.use('/api/v1/migrate', …)` mount; added `app.use('/api/v1/bootstrap', …)`.
- Dropped the `mode: config.mode` field from the test `/health` handler to match the new server.

**Verification:** `npm test` → 14 files / 113 tests, all passing.

### 2. Residual `'local'` schoolId fallbacks across frontend services

**Symptom:** after removing `APP_MODE`, a grep for the literal string `'local'` still showed 14 uses across `src/frontend/services/*.js` and `src/frontend/ui/pages/admin/*.js`. These silently defaulted `school_id` to `'local'`, breaking tenant isolation.

**Fix:** removed the `?? 'local'` fallbacks. Call sites now rely on `c.authSvc.getCurrentUser()?.school_id` (or `session.school_id`) — if the user isn't authenticated, the call chain simply doesn't run, which is the correct failure mode in a SaaS-only build.

### 3. Residual `'local'` schoolId fallbacks in backend services

**Symptom:** `src/backend/services/AIService.js`, `RAGService.js`, and `src/backend/routes/settings.routes.js` still defaulted their `schoolId` parameter / query fallback to `'local'`.

**Fix:**
- `AIService.js` / `RAGService.js`: changed parameter default from `'local'` to `null` (callers are still free to pass their own; the in-memory RAG store is keyed by whatever id is provided).
- `settings.routes.js`: the unauthenticated `GET /api/v1/settings/public` route now resolves to `process.env.DEFAULT_SCHOOL_ID || 'saas-default'` to match `prisma/seed.js`.

### 4. Socket auth still referenced `defaultSchoolId`

**Symptom:** `src/backend/realtime/socket.auth.js` strategy 2 used `config.defaultSchoolId` for its admin-secret branch, but `config.js` no longer signs the default as `'local'`.

**Fix:** reworked the admin-secret branch in `socket.auth.js` to read `school_id` from the socket handshake payload instead (or leave it `null` if not provided), eliminating the dependency on a "default school" that doesn't exist as a row in production.

### 5. Backend logger included the removed `mode` field

**Symptom:** every log line carried `mode: 'local'` even after the mode concept was removed.

**Fix:** removed the `mode` field from the pino `base` in `src/backend/logger.js`.

### 6. Server health endpoint leaked the removed mode concept

**Symptom:** `GET /health` returned `{ status, timestamp, mode: 'local' }`.

**Fix:** simplified to `{ status, timestamp }` in both `src/backend/server.js` and `tests/integration/helpers/app.js`.

### 7. `/api/v1/admin-secret` was world-readable

**Symptom:** `GET /api/v1/admin-secret` returned the realtime admin pairing secret to *any* HTTP client, with no auth. On a shared school LAN, any student could grab it and authenticate sockets with admin privileges.

**Fix (2026-08-06):** gated the route in `src/backend/server.js`:

```js
app.get('/api/v1/admin-secret', requireAuth, requireRole([ROLES.ADMIN]), (req, res) => { ... });
```

**Impact on legacy UI:** none. A repo-wide sweep (`grep -rn "/api/v1/admin-secret"`) shows **zero HTTP callers** — the legacy realtime settings panel pulls the secret out of the `settings` table (`utils.js getStoredAdminSecret`), not from this endpoint. The route existed only for the SPA realtime settings panel that was never wired to call it.

**Verification:**
- Anonymous `GET /api/v1/admin-secret` → **401** `UNAUTHORIZED: Missing token`.
- Login `admin / admin123` → 200 with access token.
- Authenticated admin `GET /api/v1/admin-secret` with Bearer → **200** `{ secret: ... }`.
- Full suite: `npm test` → 14 files / 113 tests, all passing.

### 8. `QUIZ_ADMIN_SECRET` was not pinned across restarts

**Symptom:** the realtime admin pairing secret was randomly generated on every boot. Admins had to re-pair the realtime settings panel after each server restart.

**Fix (2026-08-06):** `install.sh` now writes `QUIZ_ADMIN_SECRET` (a freshly generated base64url random 24-byte value) into the generated `.env` file alongside `JWT_SECRET`. Existing `.env` files are untouched.

---

## Final verification

| Check | Result |
|-------|--------|
| `npm run build` | ✓ admin-bundle.js (817 kb), student-bundle.js (998 kb) built |
| `npm test` | ✓ 14 test files, 113 passed, 0 failed |
| Server boots (`node src/backend/server.js`) | ✓ starts, `GET /health` returns 200 |
| HTML served with SaaS config | ✓ `GET /` returns 200 with `window.APP_CONFIG = { mode: 'saas', … }` injected |
| No residual `'local'` school fallbacks | ✓ grep across `src/` returns 0 hits |
| No residual `APP_MODE` branches | ✓ grep across `src/` returns 0 hits |

---

## Known follow-up items (non-blocking)

These are documented for a later pass; they do not block the SaaS-only migration.

### A. Legacy MPA scripts still use `localStorage` as a synchronous cache
- Scope: `script.js`, `auth.js`, `admin-main.js`, `student-workspace.js`, etc. — all read `localStorage` via the shimmed `Storage.prototype` installed by `legacy-bridge.js`.
- Status: **intentional**. Each read/write goes through the cache-backed repo, which syncs to `/api/v1/<table>`. There is no path where `localStorage` is treated as source-of-truth.
- Later fix: rewrite the legacy pages onto the SPA architecture in `src/frontend/ui/pages/` so the shim and the monkey-patched `Storage` prototype can be removed entirely. Until then, do not strip `localStorage` calls without first replacing the page.

### B. SPA rewrite of the admin/student pages (staged pass)
- Scope: replace each legacy root script with the corresponding SPA page (`src/frontend/ui/pages/admin/*`, `sessions/*`, `games/*`, `tournaments/*`).
- Status: not started. The SPA admin shell (`src/frontend/ui/pages/admin/AdminPage.js`) exists and is reachable via `main.js` when an admin user is authenticated and no legacy host element is present.
- Later fix: wire `main.js` to always mount the SPA for admins (instead of the hybrid MPA/SPA boot) once visual parity with the legacy admin is confirmed. Then delete `admin.html`, `script.js`, `auth.js`, and the rest of the legacy surface.

### C. Visual QA sweep for the SPA
- Compare each SPA page against the legacy admin pixel-for-pixel before flipping the default mount.
- The DOM ids/classes used by `styles.css` are the contract — preserve them exactly.

### D. Optional settings hardening
- `GET /api/v1/settings/public` currently allows an optional `?school_id=` query parameter. If the deployment always resolves to a single tenant, consider locking that down.

---

## Validation commands

```powershell
npm.cmd run build
npm.cmd test
```

Both currently pass clean.

## Outcome

The codebase no longer supports two modes. `APP_MODE` is gone. `LocalStorageRepository` and `CacheDecorator` are gone. The localStorage → database migration tool is gone. The legacy admin/student UI is preserved byte-for-byte but is now backed by the SaaS REST API end-to-end, with `legacy-bridge.js` acting as a thin compatibility layer that will be retired once the SPA rewrite (follow-up items B/C) completes.

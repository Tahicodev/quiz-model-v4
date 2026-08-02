# Migration Failure Report

Updated: 2026-08-03

This report contains failures that are still blocked or require a separate deployment/environment decision. Issues fixed during the current pass are listed separately so they are not mistaken for open work.

## Fixed in the current pass

- Restored the legacy `admin.html` structure, original CSS, feature markup, and script order.
- Fixed duplicate top-level declarations that prevented legacy admin scripts from parsing.
- Fixed SaaS bridge token restoration and the bulk endpoint path.
- Added legacy-to-Prisma migration normalization for users, classes, categories, questions, exams, exam questions/classes, results, games, tournaments, and settings.
- Fixed the integration test database bootstrap by creating the empty SQLite file before `prisma migrate deploy`.
- Applied the same SQLite bootstrap fix to the Prisma repository contract suite.
- Fixed migration sanitization and status/export queries for tenant-scoped tables, join tables, sessions, settings, and result timestamps.
- Fixed the duplicate `crypto` import in the integration test helper.
- `npm.cmd run build:admin` passes.
- All unit tests pass: 86 tests in 11 files.
- `npm.cmd test -- tests/integration/migrate.routes.test.js` passes: 6 tests.

## Remaining failures

### 1. Socket handshake security tests fail in local mode

- Tests: `tests/integration/socket.handshake.test.js`
- Failures:
  - rejects a connection without a token
  - rejects a connection with an expired token
- Cause: `src/backend/realtime/socket.auth.js` intentionally accepts anonymous connections in local mode as a compatibility fallback for the legacy local UI.
- Impact: this conflicts with the migration security requirement that every socket handshake be authenticated with JWT or an explicit trusted credential.
- Later fix:
  1. Add a dedicated local-mode realtime credential flow for legacy admin/student clients, or pass the configured admin secret only to the admin client.
  2. Remove the anonymous fallback from `socketAuthMiddleware`.
  3. Keep the two handshake tests as the acceptance check.

### 2. The restored legacy admin page does not expose the new Migration tab

- `admin.html` intentionally keeps the original legacy navigation and UI unchanged.
- The new migration page remains in `src/frontend/ui/pages/migrate/MigratePage.js` and is bundled for the new admin application, but it is not displayed by the restored legacy page.
- Later fix: add a migration entry point to the legacy admin settings/tools area, or expose the new migration page as a separate admin-only route without changing the existing feature UI.

## Validation commands

```powershell
npm.cmd run build:admin
npm.cmd test -- tests/unit
npm.cmd test
```

Final validation:

- `npm.cmd run build:admin`: passed.
- `npm.cmd test -- tests/unit`: 11 files, 86 tests passed.
- `npm.cmd test -- tests/integration/migrate.routes.test.js`: 6 tests passed.
- `npm.cmd test -- tests/integration/PrismaRepository.contract.test.js`: 12 tests passed.
- `npm.cmd test`: 15 files passed, 1 file failed; 126 tests passed, 2 failed, 1 skipped. Both failures are the socket-auth cases listed above.

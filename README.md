# quiz-model-v4

Quiz application — SaaS build.

This distribution is single-mode (SaaS). All authentication, persistence, and realtime coordination goes through the SaaS backend (Express + Prisma + Socket.IO). The legacy localStorage / LAN mode is no longer supported.

## Quick start

```bash
./install.sh
```

Then open http://localhost:3000 and sign in with the default admin account (`admin` / `admin123`). Change the password immediately on first login.

## Runtime contract

- `window.APP_CONFIG.mode` is always `'saas'` (kept only for backward compatibility with legacy page scripts; never used as a branch point).
- `JWT_SECRET` must be at least 64 characters.
- All API traffic is tenant-scoped via the authenticated user's `school_id`.
- The legacy MPA pages (admin.html, index.html, student-workspace.html) are preserved as-is. They receive data via `legacy-bridge.js`, which performs a one-shot `/api/v1/bootstrap` preload into a synchronous cache and then writes through to the SaaS REST API. There is no offline mode and no LocalStorage-as-truth path.

## Layout

- `src/backend/` — Express server, Prisma repository, Socket.IO, services
- `src/frontend/` — Modern SPA sources (admin dashboard, realtime pages)
- `src/shared/` — Zod schemas, error classes, constants shared across backend & frontend
- `prisma/` — Schema, migrations, seed script
- `legacy-bridge.js`, `legacy-auth-bridge.js` — compatibility shims for the legacy MPA pages
- `public/` — Built SPA bundles
- `tests/` — Vitest suites (unit, integration, contract)

## Scripts

| Command              | Purpose                                 |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Backend with hot reload                 |
| `npm start`          | Production start                        |
| `npm run build`      | Bundle admin + student SPAs             |
| `npm test`           | Run the test suite                      |
| `npm run db:migrate` | Apply Prisma migrations (dev)           |
| `npm run db:seed`    | Seed the default admin + settings       |

## Migrating from v3 / earlier LAN installs

There is no longer an in-app "migrate from localStorage" tool. If you are moving from a legacy LAN install, contact your administrator for the offline export/import procedure.

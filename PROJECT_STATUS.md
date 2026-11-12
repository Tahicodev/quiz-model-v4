# PROJECT_STATUS.md

Educational SaaS platform — active work log.

---

## Current focus

**Transform the Admin session into a professional SaaS platform control center.**

Plan & audit: [`docs/ADMIN_CONSOLE_AUDIT.md`](docs/ADMIN_CONSOLE_AUDIT.md)
Console entry point: `http://localhost:3000/console`

Status legend: `todo` · `in-progress` · `done` · `blocked` · `deferred`

---

## Phase 1 — Audit & Architecture

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Audit backend (routes, middleware, services, auth model) | `done` | 36 route files mounted at `/api/v1/*`. `requireRole` + `enforceTenant` were the only authorization primitives. |
| 1.2 | Audit frontend (admin.html, admin-main.js, teacher analytics, modular stack) | `done` | `admin.html` = 503 KB combined teacher + school-admin console; `teacher-analytics.js` = reusable SVG chart kit. |
| 1.3 | Audit database schema + live data | `done` | 2 organizations, 14 users, 5 096 questions, 104 results, 1 199 audit rows. |
| 1.4 | Map existing functionality → administrative destinations | `done` | Audit §2 and §6. |
| 1.5 | Define permission model | `done` | Scope-based: `platform` (super_admin) / `school` (admin) / `class` (teacher). 25 permissions, 3 groups. |
| 1.6 | Map source tables + exact calculation for every proposed KPI | `done` | Audit §5 (definitions table) — now pinned by tests. |
| 1.7 | Propose final Admin information architecture | `done` | Audit §6 — 7 sections, all built. |
| 1.8 | Confirm open decisions Q1–Q6 with product owner | `done` | All resolved; see audit §8. |

## Phase 2 — Admin Foundation

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | `src/shared/permissions.js` — permission catalog + role map | `done` | 25 permissions; `ROLE_PERMISSIONS` is the enforcement default. |
| 2.2 | `src/backend/middleware/permission.js` — `requirePermission`, `resolveScope`, `resolveTargetSchool`, `requireActiveAccount` | `done` | Fail-closed `scopeFilter`. |
| 2.3 | Cross-tenant read path | `done` | Implemented as **explicit scope parameters**, not by activating the implicit `withTenant()` helper — a silent where-clause strip would have leaked across tenants in existing routes. |
| 2.4 | Migrations: `School.status`, `AuditLog.outcome/severity`, `Role`, `RolePermission`, `UserPermissionOverride`, `SecurityEvent` + indexes | `done` | `prisma/migrations/20261112_admin_platform_governance/` — additive only, no table rebuilt. |
| 2.5 | Enforce active account status on the console's routes | `done` | `requireActiveAccount` re-reads the account so a suspension bites immediately, not after the 15-minute token lifetime. |
| 2.6 | Console shell, hash router, design system, chart-kit port | `done` | `src/frontend/console/**`; light + dark themes; responsive sidebar. |
| 2.7 | Landing page routing → `/console` for admin / super_admin | `deferred` | The console is reachable directly at `/console`; the landing page still sends admins to `admin.html`. Wiring the landing page is a Phase 5 item so the legacy surface stays reachable meanwhile. |

## Phase 3 — Platform read model & Overview

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `PlatformAnalyticsService` + `GET /api/v1/console/overview` | `done` | Overview, trends, organization metrics, user list. |
| 3.2 | `SecurityEvent` model + auth-event write hooks | `done` | Login success/failure, logout, password change, session revoked. |
| 3.3 | Overview page: KPI strip, trends, org table, engagement, participation, alerts | `done` | 7 primary KPIs, then sections. Alerts derive from real records with explicit thresholds. |

## Phase 4 — Management modules

| # | Item | Status | Notes |
|---|---|---|---|
| 4.1 | Organizations list + status + usage | `done` | List, search, status filter, sorting, pagination, per-organization metrics and alerts. |
| 4.2 | Users & Access: account list, role/status filters | `done` | List view complete. |
| 4.3 | Platform Analytics module | `done` | Activity, adoption, organizational comparison, content usage. |
| 4.4 | Activity & Audit module | `done` | Two streams (administrative actions / security events), facets, search, pagination, failed-sign-in source analysis. |
| 4.5 | System Health & Operations module | `done` | Availability (5xx only), p50/p95/p99, endpoint table, database, storage, realtime, scheduled work. |
| 4.6 | Platform Settings module | `done` | Role catalog, permission catalog, session scope. Plan/quota shown as observed, not enforced. |
| 4.7 | Organization detail page | `done` | Profile, status, administrators, teachers, students, classes, usage, administrative history. Suspend / reactivate with a recorded reason. |
| 4.8 | Account detail page | `done` | Profile, organization, class, activity, permission overrides, recent attempts, administrative history. Suspend / reactivate, change role, grant / deny / remove a permission, revoke sessions. |
| 4.9 | Account lifecycle actions (backend) | `done` | `AdminActionService` — scope-checked, audit-logged with outcome + severity, mirrored into the security trail. Guards: an administrator cannot change their own role or suspend themselves; the last active platform administrator cannot be suspended. |

## Phase 5 — Backend & security hardening

| # | Item | Status |
|---|---|---|
| 5.1 | Restrict + scope `GET /api/v1/admin/metrics` (currently teacher-readable, process-global) | `todo` |
| 5.2 | Stop serving the whole project root via `express.static('./')` (exposes `prisma/dev.db`) | `todo` |
| 5.3 | Fix `query.routes.js` allowlist vs `PrismaRepository.query()` mismatch | `todo` |
| 5.4 | Add `enforceTenant` to exports / imports / uploads | `todo` |
| 5.5 | Audit-log sensitive admin actions with outcome + severity | `partially done` — the columns and the console's read path exist; the remaining call sites are the legacy admin surfaces. |
| 5.6 | Indexes + pagination on all console tables | `done` |
| 5.7 | Landing page routes admins to `/console` | `todo` |
| 5.8 | Global search in the console header | `todo` (the input is present; it is not yet wired to a search endpoint) |
| 5.9 | Organization detail page + user detail page | `done` |
| 5.10 | Account lifecycle actions (activate / suspend / reactivate / assign role / grant permission) | `done` |

## Phase 6 — QA

| # | Item | Status |
|---|---|---|
| 6.1 | Route-by-route console test pass | `done` (visual, via `scripts/console-screenshots.mjs`) |
| 6.2 | KPI ↔ database reconciliation suite | `done` — `tests/integration/platform-analytics.test.js` (14 hand-computed assertions) |
| 6.3 | Permission-boundary + tenant-isolation tests | `done` — `tests/integration/console.permissions.test.js` (15 assertions) |
| 6.4 | Permission catalog tests | `done` — `tests/unit/permissions.test.js` (15 assertions) |
| 6.5 | Empty / loading / error state checks | `done` — every panel has all three |
| 6.6 | Responsive checks (desktop / tablet / mobile) | `partially done` — CSS breakpoints implemented; a full visual pass at each width is still to run |
| 6.7 | Regression: teacher + student sessions unchanged | `done` — full suite green apart from two pre-existing issues (below) |

---

## Known issues

| Issue | Kind | Detail |
|---|---|---|
| `tests/integration/questions.game-studio-scope.test.js` fails | **pre-existing** | The test calls `prisma.kidsActivity.create(...)` but no `KidsActivity` model exists in `prisma/schema.prisma` (never has). Last touched in commit `af87546`, before this work. |
| Three integration suites intermittently time out in `beforeAll` | **pre-existing** | `prisma migrate deploy` runs as a child process per suite and contends for CPU under parallel vitest. `vitest.config.js` already documents this and raises the hook timeout to 60 s. All three pass when the suite is run without contention. |

---

## Constraints in force

1. Student session must not be redesigned. — **honoured**
2. Teacher analytics must not be damaged or copied into Admin. — **honoured** (the chart kit was *ported*, not copied; the read models are separate)
3. No fake metrics, no hardcoded statistics, no simulated activity. — **honoured**
4. No duplicate management functionality. — **honoured** (the console does not duplicate the authoring surfaces)
5. No frontend-only security. — **honoured** (every console route validates scope and permission server-side)
6. No new technologies without an architectural reason. — **honoured** (esbuild was already a dependency; zod, Prisma, Socket.IO all reused)
7. Existing API contracts must not change silently. — **honoured** (the console uses a NEW router; no existing route was modified except additive ones)
8. No page is "done" until its data, actions, permissions and backend integration work. — **honoured**

---

## Change log

| Date | Phase | Summary |
|---|---|---|
| 2026-11-12 | 1 | Architectural audit completed. Findings in `docs/ADMIN_CONSOLE_AUDIT.md`. 6 open decisions raised (Q1–Q6). No application code modified. |
| 2026-11-12 | 2 | Permission catalog + scope middleware + additive migration `20261112_admin_platform_governance` + role/security-event services + console shell, router, design system and chart-kit port. |
| 2026-11-12 | 3 | `PlatformAnalyticsService`, `SecurityEvent` write hooks, `GET /api/v1/console/overview` + `/trends`, and the Overview page (KPIs, trends, organization table, engagement, participation, alerts). |
| 2026-11-12 | 4 | Console API + pages: Organizations, Users & Access, Platform Analytics, Activity & Audit, System Health, Settings. 44 new assertions across three test files. |
| 2026-11-12 | 4b | Organization + account detail pages and the administrative actions behind them (suspend / reactivate, role change, permission grant / deny / remove, session revocation). `AuditService` now records `outcome` and `severity`. |

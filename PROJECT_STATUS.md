# PROJECT_STATUS.md

Educational SaaS platform — active work log.

---

## Current focus

**Transform the Admin session into a professional SaaS platform control center.**

Plan & audit: [`docs/ADMIN_CONSOLE_AUDIT.md`](docs/ADMIN_CONSOLE_AUDIT.md)
Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/DATABASE.md`](docs/DATABASE.md) · [`docs/ADMIN_CONSOLE_ARCHITECTURE.md`](docs/ADMIN_CONSOLE_ARCHITECTURE.md)

Console entry point: `http://localhost:3000/console`

Status legend: `todo` · `in-progress` · `done` · `blocked` · `deferred`

---

## Phase 5 — Offline/LAN compatibility, SaaS readiness and security hardening

| # | Item | Status | Notes |
|---|---|---|---|
| 5.1 | Static asset allow-list replacing `express.static('./')` | `done` | `src/backend/staticAssets.js`. The live database, the schema, the migration history, the backend source, `package.json` and every project directory are no longer served. Verified by HTTP against a running server. |
| 5.2 | Deny-list as a second line of defence | `done` | Databases, env files, keys, backups, source maps, `.ts` sources, the dependency tree and the offline bundle are refused wherever they appear. |
| 5.3 | Rotate the bootstrap administrator credentials | `done` | `prisma/seed.js` has no published password: it uses `BOOTSTRAP_ADMIN_PASSWORD` or generates a random one and prints it once. An account still carrying the historical default is rotated on the next seed run. The legacy client-side default (`admin123`) and the hard-coded recovery code are gone too. |
| 5.4 | Remove the default credentials from the installers | `done` | `install.sh`, `setup.bat`, `docker-start.sh`, `docker-start.bat` no longer print `admin / admin123`. |
| 5.5 | Secure first-run provisioning | `done` | `npm run admin:create -- --username=… --password=…` provisions a platform administrator. |
| 5.6 | Hard-coded AI encryption key removed | `done` | `AIConfigService` no longer falls back to a published literal. |
| 5.7 | Teacher → administrator privilege escalation | `done` | A teacher could overwrite `system.recovery_code_hash` through the bulk settings endpoint, mint a recovery ticket and reset an administrator's password. The `system.*` namespace and every admin-tier key are now refused, and the visibility tier is enforced on the bulk path too. |
| 5.8 | Query dispatcher's allow-list mismatch | `done` | The allow-lists now match the implemented queries (no more 500s), and the dispatcher CLAMPS the settings visibility tier and refuses cross-organization lookups. |
| 5.9 | `GET /admin/metrics` exposure | `done` | Administrator-only, and scoped to the caller's organization. The legacy Monitoring tab is administrator-only too. |
| 5.10 | Landing page → `/console` | `done` | Administrators land in the control center; the classroom surface stays one click away. |
| 5.11 | The obsolete `KidsActivity` test | `done` | The model was renamed to `KidsGame` and the flag it tested was replaced by authorship scoping. The test was rewritten against the rule actually enforced (`tests/integration/questions.author-scope.test.js`); no model was added to silence it. |
| 5.12 | Deployment mode (`offline` \| `saas`) | `done` | `config.deploymentMode`, resolved from `DEPLOYMENT_MODE` → `APP_MODE` → `DB_PROVIDER`. A topology, never a privilege. The console labels its scope accordingly. |
| 5.13 | Organization lifecycle without bricking an offline install | `done` | Suspending an organization no longer cascades into its accounts. It blocks sign-ins at the auth layer; the organization administrator keeps a route to reactivate their own organization. |
| 5.14 | Session cookie over plain HTTP | `done` | `Secure` now follows the actual transport (`COOKIE_SECURE` / `TLS_ENABLED`), not `NODE_ENV`. Deriving it from `NODE_ENV` silently ended every session on a plain-HTTP LAN. |
| 5.15 | `docker-compose.yml` (the "SaaS stack") | `done` | It could not boot: a PostgreSQL URL against a SQLite client, a 47-character `JWT_SECRET`, and a hard-coded database password. It now deploys the multi-tenant platform on SQLite with persistent volumes, a required secret and an optional Redis profile. |
| 5.16 | Offline / LAN validation | `done` | `scripts/offline-lan-validation.mjs` — **37/37 checks pass** with the outbound network blocked and the guard log empty. |
| 5.17 | SaaS / multi-tenant validation | `done` | `scripts/saas-validation.mjs` — **32/32 checks pass**. |
| 5.18 | Exam-session creation (pre-existing defect) | `done` | `POST /api/v1/sessions` never set `school_id`, so the REST exam path returned 500 and the attempt could not be graded. Found by the offline validation. |
| 5.19 | PostgreSQL support | **not supported** | The migration history is SQLite SQL and the Prisma schema pins the provider. A port needs a parallel migration tree. See `docs/DATABASE.md`. |
| 5.20 | Global search in the console header | `todo` | The input is present but not yet wired to a search endpoint. |
| 5.21 | Offline npm bundle regeneration | `todo` | `vendor/offline/` was generated on 2026-09-25 and lacks `pdfkit`, `docx`, `mammoth`, `pdf-parse`, `fontkit`, `jszip`. It must be regenerated on an internet machine before an air-gapped install. |

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
| 6.7 | Regression: teacher + student sessions unchanged | `done` — full suite green |
| 6.8 | Security-hardening tests | `done` — `tests/integration/security-hardening.test.js` (14 assertions) |
| 6.9 | Static allow-list tests | `done` — `tests/unit/staticAssets.test.js` (41 assertions) + `scripts/verify-static-exposure.mjs` (HTTP-level) |
| 6.10 | Offline / LAN validation | `done` — `scripts/offline-lan-validation.mjs` — **37/37** |
| 6.11 | SaaS / multi-tenant validation | `done` — `scripts/saas-validation.mjs` — **32/32** |

### Suite status

**112 test files · 1 409 assertions · all green.**

---

## Phase 6 — Product surface corrections

> Driven by operator feedback: the entry page, the role routing, the settings
> surface, the account rosters and the administrator's overview.

| # | Item | Status | Notes |
|---|---|---|---|
| 6.1 | The entry page always shows the sign-in form | `done` | It used to redirect a signed-in visitor away silently, so the sign-in form was never seen and there was no way to sign in as somebody else. An existing session is now offered as an explicit **Continue** choice. |
| 6.2 | Role routing after sign-in | `done` | Administrator → `/console`; teacher → `/admin.html` (the classroom workspace); student → `/student-workspace.html`. The classroom surface routes an administrator to the console too, so the two audiences never mix. |
| 6.3 | Application settings as a page | `done` | `#/settings` — a page with a collapsible RIGHT-HAND section menu, nine sections, each bound to real API calls. The legacy settings modal stays in the classroom surface. |
| 6.4 | Users & Access split into three rosters | `done` | `#/users` is a hub; `#/users/teachers`, `#/users/students` and `#/users/administrators` are the rosters. On SaaS the administrators page shows both the directors and the platform administrators, labelled. |
| 6.5 | A new administrator's overview | `done` | The Overview is now the administrator's workbench: control, access, credentials, maintenance, activity, analytics, documents, notes to teachers and planning. |
| 6.6 | Notes to teachers from the console | `done` | `POST /console/notes` reuses the platform's existing `TeacherMessage` mechanism. |
| 6.7 | **Password reset repaired** | `done` | The reported symptom — "I reset the password and reconnect, it gives me incorrect username or password" — had a single root cause: the edit-user form sends `password` in a `PATCH /users/:id` body, `UserUpdateSchema` had no `password` key, so zod **stripped it**; the database kept the old hash while the UI reported success. Fixed on three levels: the schema accepts it, the service hashes it, and the legacy client routes it to the credential endpoint. |
| 6.8 | Credential reset in the console | `done` | `POST /console/users/:id/credential` — bcrypt, revokes the target's sessions, audited in both trails. |
| 6.9 | Cross-tenant write closed | `done` | `PATCH /users/:id` and `DELETE /users/:id` never checked the target's organization: an administrator could edit or delete an account of another organization by id. Now refused. |
| 6.10 | A bulk sync can no longer store a plaintext password | `done` | The bulk sanitizer accepted a client-sent `password` and stored it RAW as `password_hash`, producing accounts that could never sign in. It is hashed with bcrypt before the row is written. |
| 6.11 | A legacy-hash account can change its own password | `done` | `change-password` compared with bcrypt only, so an account still on a `simple-`/SHA-256 hash could sign in but never change its password. All three hash generations are now accepted. |
| 6.12 | The recovery panel no longer lies | `done` | When the server was unreachable it changed the credential **in this browser only** and reported success; the sign-in went through the server and failed. It now says the password was not changed. |
| 6.13 | Validation scripts use an isolated database | `done` | They seeded their fixtures into the development database and left them behind. They now migrate and seed their own SQLite file and delete it afterwards. |
| 6.14 | A regression in the static allow-list | `done` | `index.html` loads `public/student-bundle.js`; removing the catch-all mount broke it. The `public/` directory is now mounted at both `/` and `/public` on purpose. |

---

## Phase 7 — The settings port and the classroom surface

> Driven by the operator's report: the toolbar was ruining the panels, the
> classroom surface had no way back to the console, and the legacy App
> Settings still held features the console did not have.

| # | Item | Status | Notes |
|---|---|---|---|
| 7.1 | The console toolbar is two rows | `done` | Row 1: the chip group on the left and the trailing action (Refresh) pushed to the right edge. Row 2: the field filters (`ac-field`) and the audit filters (`data-ac-audit-filters`) on a line of their own. Applies to Organizations, Activity & Audit, the three account rosters, System Health, the detail pages and the period toolbar. |
| 7.2 | A link from the classroom surface to the console | `done` | A **Control Center** link in the header and in the profile menu of `admin.html`, shown only to the administrator roles. The console keeps its **Classroom** link back. |
| 7.3 | The redundant **Monitoring** tab removed | `done` | The tab, its section and `server-monitoring.js` are gone. It showed the server-wide request log — usernames, roles and source addresses of every user — and duplicated the console's System Health. `GET /admin/metrics` remains, administrator-only and organization-scoped. |
| 7.4 | The legacy App Settings ported into the console | `done` | Eleven sections: General, My profile, Users & access, Teacher access, Realtime, Presets, Documents & data, Setup & diagnostics, Artificial intelligence, Roles & permissions, Deployment & session. Every legacy control is accounted for in `docs/ADMIN_CONSOLE_ARCHITECTURE.md` §10.1 — where it went, or why it did not and what was done instead. |
| 7.5 | Recent documents with a clickable file and its folder | `done` | The title opens the document at its public URL, a **Folder** column shows its path, and a Download button hits the download endpoint. |
| 7.6 | AI providers, keys and models, in full | `done` | The six providers, the encrypted key, the base URL for a custom/local server, the live model list with a filter, publishing the selected models as shared, a personal model, and Test / Delete on every model. |
| 7.7 | **The "LAN Realtime Server" question, answered** | `done` | There is **no separate realtime server**: Socket.IO is attached to the same HTTP server as the pages and the API (`initSocketServer`); there is no `realtime-server` process and no npm script for one. The legacy switch never started a server — it decided whether the administration session *used* the shared socket. The console keeps the switch, renamed for what it does, and carries the device registry and every broadcast action. |
| 7.8 | The export now takes the DATABASE, not the browser cache | `done` | The legacy export wrote the localStorage of whichever computer the administrator was sitting at. `GET /console/export` snapshots the organization's rows, scoped to the caller, with the password hashes stripped — a backup file is not a credential store. |
| 7.9 | A stale-render race in the console router | `done` | Two renders shared one host: a slow page that finished after the operator had already navigated wrote over the page on screen, which showed up as a blank panel or a render error. Each render now gets its own container and a token. |
| 7.10 | The overview answers to `#/overview` too | `done` | The navigation label is now a real address, and the active item is resolved by prefix with the overview as the fallback. |

---

## Phase 8 — The gaps the settings port left open

> Driven by the operator's question: "did the Classroom Setup Wizard move?
> are all the modals moved? should I delete the app settings from the
> admin session?"

| # | Item | Status | Notes |
|---|---|---|---|
| 8.1 | **The Classroom Setup Wizard** | `done` | It was NOT moved — only its facts were. It is now the console's **Setup & diagnostics** section: the same six steps (Server & network, Student access, Windows firewall, Database safety, Offline & CDNs, Summary), the same facts, the same actions, as a **stepper** whose step is in the URL (`#/settings?section=setup&step=firewall`). The QR code is generated by the same vendored library. |
| 8.2 | **Add an account** | `done` | The console could not create an account at all. `POST /console/users` now exists — tenant-scoped, audited, bcrypt, and a platform administrator may name another organization. The dialog is on every roster and on the hub. |
| 8.3 | **Delete an account** | `done` | `DELETE /console/users/:id`, deliberately separate from *suspend*: suspending ends the access and keeps the record, deleting removes the person. An administrator cannot delete their own account. |
| 8.4 | **The quiz preset editor** | `done` | The console could only rename and delete a preset. It now carries **all seventeen fields** of the legacy editor, with the same names and the same defaults, and writes the same browser store the classroom panel reads. |
| 8.5 | The shared form primitives | `done` | `components/form.js` — the panel, field, select, switch, checkbox and textarea helpers now live in one place, so the settings page, the account dialogs and the preset editors render the same control the same way. |
| 8.6 | The ownership rule is written down | `done` | `docs/ADMIN_CONSOLE_ARCHITECTURE.md` §12.1 says which surface owns which setting, and **why the classroom settings modal must not be deleted**: it carries the teacher's profile, their presets, their own data export and their classroom sync — four things a teacher cannot get anywhere else, because the console is administrator-only. |
| 8.7 | The first-run experience is documented | `done` | On a **fresh installation** the **Quick Start** wizard appears automatically (an empty instance + no `quizSetupComplete` marker). It stays in the classroom surface, because each of its steps opens a classroom *create*-modal. The Classroom Setup Wizard does **not** auto-show. |
| 8.8 | The two redundant admin tabs removed from the classroom panel | `done` | **Teacher Access** and **Setup** were administrator-only and are now in the console, so they were removed from the classroom settings modal — together with the orphaned `setup-wizard.js`. A **Control Center** link in the tab strip points administrators at the console. The remaining tabs (General, My Profile, Presets, Data, Realtime, AI Generation, Users) are the teacher's share. |
| 8.9 | One setting, one writer | `done` | The classroom panel used to WRITE the `teacherAccess` map as well as read it, so a stale local copy could overwrite what the console had just saved. It now reads it (and keeps it in the local cache as an offline fallback) but never writes it. |

---

## Known issues

| Issue | Kind | Detail |
|---|---|---|
| The offline npm bundle is stale | **pre-existing** | `vendor/offline/` was generated on 2026-09-25, before `pdfkit`, `docx`, `mammoth`, `pdf-parse`, `fontkit` and `jszip` were added. `npm ci --offline` against the current lockfile will fail. Regenerate on an internet machine before shipping an air-gapped install. |
| PostgreSQL is not supported | **documented limitation** | The Prisma schema pins the provider to SQLite and all 22 migrations are SQLite SQL. `docker-compose.yml` therefore deploys the multi-tenant platform on SQLite. |
| Availability has no history | **by design** | The request log is process-local and resets on restart, so the console reports a windowed figure and says so, rather than implying uptime it cannot know. |
| `CORS_ORIGIN` is advisory | **pre-existing** | The CORS handler reflects any origin after logging a warning, because the product is deployed on a school LAN with unknown client addresses. A SaaS deployment behind a known domain should set it and the handler should be tightened. |

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
| 2026-11-13 | 5 | Offline/LAN compatibility, SaaS readiness and security hardening. Static allow-list replaces `express.static('./')`; no default password anywhere; teacher→administrator escalation closed; query dispatcher clamped and its allow-lists realigned; `/admin/metrics` scoped to administrators; landing page → `/console`; the obsolete `KidsActivity` test rewritten against the rule actually enforced; deployment mode (`offline` \| `saas`) introduced; organization suspension no longer bricks an offline install; exam-session creation fixed. **37/37** offline checks with the network blocked, **32/32** SaaS checks, **111 files / 1 399 assertions** green. |
| 2026-11-14 | 6 | Product surface corrections. Entry page always shows the sign-in form with an explicit **Continue**; role routing (administrator → `/console`, teacher → classroom, student → student workspace); application settings rebuilt as a page with a collapsed right-hand section menu; Users & Access split into three rosters; a new administrator's workbench as the Overview; notes to teachers from the console. **Password reset repaired** (the edit-user form's password was silently stripped by the update schema — the account kept its old credential while the UI reported success), plus four related credential and tenant-boundary fixes. Validation scripts moved to an isolated database. **112 files / 1 409 assertions** green. |
| 2026-11-15 | 7 | The settings port and the classroom surface. The console toolbar became two rows (chips + the right-aligned refresh on row one, the field and audit filters on row two); a **Control Center** link added to the classroom surface; the redundant **Monitoring** tab removed (it exposed the server-wide request log and duplicated System Health); the legacy App Settings ported into the console as eleven sections, with every legacy control accounted for in `docs/ADMIN_CONSOLE_ARCHITECTURE.md` §10.1. The **"LAN Realtime Server" question answered**: there is no separate realtime server — Socket.IO is served by the main HTTP server, and the legacy switch only decided whether the session used the shared socket. The export now snapshots the database instead of the browser cache, and a stale-render race in the console router was fixed. **112 files / 1 409 assertions** green, **37/37** offline, **32/32** SaaS. |
| 2026-11-16 | 8 | The gaps the settings port left open, closed. The **Classroom Setup Wizard** was ported properly — it is now the console's Setup & diagnostics section, a six-step stepper whose step is in the URL. The console could not **create** an account (`POST /console/users` now exists, tenant-scoped and audited) nor **delete** one (`DELETE /console/users/:id`, deliberately separate from *suspend*). The **quiz preset editor** now carries all seventeen fields of the legacy editor. The shared form primitives moved to `components/form.js`. And the ownership question is settled in writing: `docs/ADMIN_CONSOLE_ARCHITECTURE.md` §12.1 says which surface owns which setting, and why the classroom settings modal must **not** be deleted — it carries the teacher's profile, their presets, their own data export and their classroom sync, and the console is administrator-only. **112 files / 1 409 assertions** green, **37/37** offline, **32/32** SaaS. |

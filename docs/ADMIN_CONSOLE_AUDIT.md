# Admin Session → SaaS Platform Control Center
## Phase 1 — Architectural Audit & Proposed Information Architecture

**Status:** audit complete; Phases 2–4 delivered (see §11).
**Date:** 2026-11-12
**Scope:** `D:\Work\MyProjects\quiz-model-v4`

---

## 0. Executive summary

The application already contains most of the *data* a platform control center needs, and it
contains a genuinely good *analytics read-model pattern* (`TeacherOverviewService` +
`OverviewAnalyticsService`) plus a dependency-free SVG chart kit (`teacher-analytics.js`).

What it does **not** contain is:

| Missing capability | Current state |
|---|---|
| Platform-level (cross-tenant) administration | `super_admin` role exists in `src/shared/constants.js` but is treated as "admin-like" everywhere; **no cross-tenant query path exists at all** |
| Organizations / Schools management | No list/create/suspend API. `School` rows can only be read one-at-a-time for the caller's own tenant |
| Audit log **read** API | 1 199 audit rows exist, 22 route files *write* them, **no endpoint reads them back** |
| Security event persistence | Failed logins live only in an in-memory ring buffer; `logout` / `password_change` produce no audit row at all |
| Permission model | Only `requireRole(role)` — no permissions, no scopes, no per-user grants |
| School lifecycle status | `School` has `plan` but no `status` (`active/pending/suspended`) |
| Service-health history | `server-metrics.js` is process-local, resets on restart, has no availability %, no error *rate*, no percentiles |
| Admin UI as a distinct product surface | `admin.html` (503 KB, 50+ scripts) is a **combined teacher + school-admin** console; teacher and admin share every tab |

The Admin session today is a *school administrator* panel that happens to reuse the teacher's
interface. Transforming it into a platform control center is therefore mostly a matter of
**adding a platform/tenant scope, a permission model, an audit read path, and a dedicated UI** —
not of inventing features.

---

## 1. What already exists and can be reused

### 1.1 Backend — read models (the highest-value asset)

| Asset | Path | Why it is reusable |
|---|---|---|
| `OverviewAnalyticsService` | `src/backend/services/OverviewAnalyticsService.js` | Already a **server-aggregated read model** returning `{meta, sections:{glance, content, achievement, engagement, teacherInsights}}`. Explicitly documents thresholds, `meta.unavailable`, `meta.filterSemantics`, and refuses to fake metrics. |
| `TeacherOverviewService` | `src/backend/services/TeacherOverviewService.js` | 3 000-line reference implementation of the *admin-console pattern*: server does all aggregation, client only renders. Contains `meta.sample.*` caps, `meta.unavailable` declarations, and a rule-based insight engine (`#buildInsights`, ≤12 deterministic insights with `{id, domain, severity, observation, metric, scope, target, action, link}`). |
| `AuditService.log()` | `src/backend/services/AuditService.js` | Already writes `{schoolId, actorId, entityType, entityId, action, diff, ip, userAgent}`. 22 route files call it. **Never crashes the caller.** |
| `resolvePeriodWindow()` / `parseAcademicYearWindow()` / `precedingWindow()` | `OverviewAnalyticsService.js` (module-level exports) | Reusable period algebra: `today / 7d / 30d / week / month / term / all / custom`. Returns `{key,label,start,end}`. `precedingWindow()` gives the equal-length comparison window needed for trend deltas. |
| `server-metrics.js` | `src/backend/server-metrics.js` | `recordRequest` / `recordLog` / `getServerMetrics(minutes,{user})`. Bounded 10 000-entry buffers, 24 h max window. Gives call counts, error counts, mean latency, per-endpoint breakdown, repeated-log clusters. |
| `presence.registry.js` | `src/backend/realtime/presence.registry.js` | Live socket presence — the **only** truthful source for "online now". |
| `NotificationFeedService` | `src/backend/services/NotificationFeedService.js` | Already merges `audit_logs` + notifications + results into a role-scoped inbox (proves the audit read path exists internally). |
| `PrismaRepository` | `src/backend/infrastructure/PrismaRepository.js` | Generic `IStorageRepository` contract + `query(name, params)` dispatcher + bulk upsert. |
| `container.js` DI | `src/backend/container.js` | Every service is injected here — the single wiring point for new admin services. |
| Zod schemas | `src/shared/schemas/*.js` (19 files) | `validateBody` / `validateQuery` middleware pattern to copy for new admin endpoints. |

### 1.2 Backend — authorization primitives

| Asset | Path | Notes |
|---|---|---|
| `requireAuth` | `src/backend/middleware/auth.js` | Verifies JWT, sets `req.user` from the token payload. |
| `requireRole(roles)` | `src/backend/middleware/role.js` | **⚠ `SUPER_ADMIN` is a universal bypass** — it skips every role check but *not* tenant scoping. |
| `enforceTenant` | `src/backend/middleware/tenant.js` | Sets `req.schoolId` from the token. **Always tenant-pinned.** |
| `withTenant(req, where)` | `src/backend/middleware/tenant.js` | The only cross-tenant escape hatch — **currently dead code** (exported, never used). This is the hook the platform scope must be built on. |
| `requireActiveUser(prisma)` | `src/backend/middleware/auth.js` | Exists but is **never used** → a suspended account keeps working for the 15-min access-token lifetime and can keep refreshing. |
| `ROLES` | `src/shared/constants.js` | `super_admin / admin / teacher / student`. |

### 1.3 Frontend — chart & UI kit

| Asset | Path | Reuse decision |
|---|---|---|
| `TeacherAnalytics` (SVG kit) | `teacher-analytics.js` (581 lines) | **Reuse as-is.** Exports `lineChart, barChart, stackedBarChart, groupedBarChart, columnChart, histogram, donut, ring, heatmap, sparkline, panel, stat, legend, empty, esc/num/round/trim/truncate/color/toneOf`. Dependency-free inline SVG, CSS-variable themed, `null` renders as "no data" not `0`, every mark has a `<title>` tooltip. Only issue: class prefix `ta-` — rename to a neutral `ac-`/`viz-` prefix, or keep and share. |
| `teacher-analytics.css` | `teacher-analytics.css` | Reuse chart chrome (`.ta-chart__*`, `.ta-legend`, `.ta-stat`, `.ta-ring`). |
| Teacher filter / period-selector UX | `teacher-overview.js` (L401-512), `teacher-domain-analytics.js` (L241-258) | Reuse the chip-based filter bar, the filter-signature cache, and the link-registry + event-delegation pattern. |
| Intervention-table markup | `teacher-domain-analytics.js` (L1126-1181) | `.data-table` + `data-label` responsive table markup — reuse for all console tables. |
| `Modal / Table / Toast / Spinner` | `src/frontend/ui/components/` | Modern ESM components — reuse. |
| `ApiRepository` | `src/frontend/infrastructure/ApiRepository.js` | Generic REST + named-query + bulk + single-flight 401→refresh. **No new infra layer needed.** |
| `src/frontend/ui/router.js` | | ⚠ Only a 34-line MPA stub (`window.location.href = url`) — **not** a router. The console needs its own hash router. |
| `qx-ui.js`, `utils.js`, `api-client.js`, `global-search.js`, `notifications.js` | root | Reusable utilities (legacy IIFE style). |

### 1.4 Database — real data available today

Verified against `prisma/dev.db` (2026-11-12):

| Table | Rows | Table | Rows |
|---|---|---|---|
| `school` | **2** | `audit_log` | **1 199** |
| `user` | **14** (2 admin, 3 teacher, 9 student — all `active`) | `notification` | 202 |
| `question` | 5 096 | `device` | 26 |
| `result` | 104 (2 exam, 42 training, 60 game) | `kids_game` | 28 |
| `exam` | 2 | `kids_game_session` | 199 |
| `course` | 5 (`lesson` 34) | `category` | 201 |
| `class` | 2 | `subject` | 2 |
| `account_request` | 1 | `refresh_token` | 7 |
| `setting` | 37 | `generated_document` | 1 |
| `game` / `game_session` / `tournament` / `exam_session` | **0** | `profile_request` | 0 |

Real event sources available for activity windows:
`users.last_login` · `audit_logs.occurred_at` (incl. `entity_type='auth'`, `action='login'`) ·
`results.date_taken` · `exam_sessions.started_at` · `game_sessions.joined_at` ·
`kids_game_sessions.created_at` · `tournament_entries.registered_at` · `device.last_seen` ·
`refresh_tokens.created_at`.

---

## 2. What needs to be moved or separated

| Current location | Problem | Destination |
|---|---|---|
| `admin.html` — tabs `overview, subjects, questions, exams, classes, results, games, notifications, monitoring, devices` | Teacher and school-admin share **all** tabs. `data-roles="admin,teacher"` on 6 of 10 tabs. | Split: **authoring/teaching surfaces stay** in `admin.html`; **governance surfaces move** to the new console. |
| `admin.html` → settings modal tabs `general, profile, users, teacher-access, realtime, presets, data, setup, ai-generation` | "Teacher Access" (who may use what) is *governance*, not classroom authoring. | → Console → **Users & Access / Platform Settings**. |
| `admin.html` → Overview dashboard (`overview-dashboard.js` → `loadAdminOverview()` → `GET /admin/overview`) | Renders school-scoped pedagogical KPIs (avg score, pass rate, top class). This is **teacher analytics at school scale**, not platform governance. | Keep as the *school-level* view inside the console (renamed), and build a **separate platform read-model**. |
| `admin.html` → Monitoring tab (`server-monitoring.js` → `GET /admin/metrics`) | Process-global request log **readable by teachers**, exposes other users' usernames/roles/IPs. | → Console → **System Health**; restrict `GET /admin/metrics` to `admin`/`super_admin` and scope it. |
| `admin.html` → Classroom Devices | Legitimately a classroom/teaching tool (teacher + admin). | **Stays** in `admin.html`. Console links to it. |
| `admin.html` → Notifications inbox | Shared by both roles already; server-side role scoping exists. | **Stays** in `admin.html`. Console shows *platform alerts* separately. |

**Explicitly not moved:** Student session (`src/frontend/**`, `student-workspace.*`), Teacher
analytics (`teacher-analytics.js`, `teacher-overview.js`, `teacher-domain-analytics.js`,
`teacher-filter.js`), and every authoring module.

---

## 3. What needs to be developed

### 3.1 Backend

| # | Deliverable | Path (proposed) |
|---|---|---|
| B1 | `Permission` catalog + `ROLE_PERMISSIONS` map | `src/shared/permissions.js` (new) |
| B2 | `requirePermission(perm)` middleware + `resolveScope(req)` → `{scope:'platform'\|'school', schoolIds}` | `src/backend/middleware/permission.js` (new) |
| B3 | Cross-tenant read path (activate `withTenant`, add `platformScope`) | `src/backend/middleware/tenant.js` (extend) |
| B4 | `PlatformAnalyticsService` — platform-wide read model (schools, users, activity, engagement, risk) | `src/backend/services/PlatformAnalyticsService.js` (new) |
| B5 | `OrganizationService` — school CRUD + status transitions + plan | `src/backend/services/OrganizationService.js` (new) |
| B6 | `AuditQueryService` — searchable/filterable/paginated audit read | `src/backend/services/AuditQueryService.js` (new) |
| B7 | `SecurityEventService` — persist auth events (success/failure/logout/password/session revoke) | `src/backend/services/SecurityEventService.js` (new) |
| B8 | `SystemHealthService` — availability %, error rate, p50/p95, uptime, DB size, realtime presence | `src/backend/services/SystemHealthService.js` (new) |
| B9 | New routers | `src/backend/routes/platform.routes.js`, `src/backend/routes/organizations.routes.js`, `src/backend/routes/audit.routes.js`, `src/backend/routes/health.routes.js` |
| B10 | Wire into `container.js` + `server.js` (4 new mounts) | `src/backend/container.js`, `src/backend/server.js` |

### 3.2 Database (additive migrations only — no destructive change)

| # | Migration | Rationale |
|---|---|---|
| D1 | `School.status` (`active\|pending\|suspended`), `suspended_at`, `suspended_reason` | Organization lifecycle is required by "Manage school status and access". |
| D2 | `AuditLog.outcome` (`success\|denied\|error`), `AuditLog.severity` (`info\|warning\|critical`) | The brief requires the audit record to carry the **outcome**; `diff_json` is not a substitute. |
| D3 | New model `SecurityEvent` | Failed logins, logouts, password changes and session revocations must be **durable**. Today they only exist in a volatile in-memory buffer. |
| D4 | New model `Role` + `RolePermission` (seeded from `ROLE_PERMISSIONS`) | Makes the Roles & Permissions page real rather than a hardcoded label. |
| D5 | New model `UserPermissionOverride` (`user_id`, `school_id`, `permission`, `effect`) | Per-user grant/revoke + org-scoped delegation. |
| D6 | `School.suspended_at` index + `AuditLog(occurred_at, entity_type)` composite index | Query performance for the console's hot paths. |

> No existing column is dropped or renamed. No existing relationship changes. All existing
> migrations remain valid.

### 3.3 Frontend — new, self-contained console

| # | Deliverable | Path (proposed) |
|---|---|---|
| F1 | Console entry page | `console.html` (new) |
| F2 | Console bootstrap (auth gate, scope detection, shell render) | `src/frontend/console/main.js` (new) |
| F3 | Hash router with permission-aware guards | `src/frontend/console/router.js` (new) |
| F4 | Shell: responsive sidebar, global search, page header, command palette | `src/frontend/console/shell.js` (new) |
| F5 | Shared design system (`ac-` prefix, CSS vars, cards/tables/badges/modals/toasts) | `src/frontend/console/styles/console.css` (new) |
| F6 | Reused chart kit | `src/frontend/console/viz/charts.js` (ported from `teacher-analytics.js`, `ta-` → `ac-`) |
| F7 | Reused console primitives (KPI card, data table, filter bar, empty/loading/error states) | `src/frontend/console/components/*.js` (new) |
| F8 | 7 page modules (Overview, Organizations, Users & Access, Analytics, Audit, Health, Settings) | `src/frontend/console/pages/*.js` (new) |
| F9 | Detail views (school detail, user detail, event detail) | `src/frontend/console/pages/details/*.js` (new) |
| F10 | Console services (typed wrappers over the new APIs) | `src/frontend/console/services/*.js` (new) |
| F11 | Build step (esbuild IIFE, mirrors `scripts/build-student.js`) | `scripts/build-console.js` (new) |
| F12 | Route integration (landing page → console for `admin`/`super_admin`; teachers keep `admin.html`) | `landing.js`, `index.html` |

---

## 4. What needs architectural improvement

| # | Issue (verified) | Impact | Fix |
|---|---|---|---|
| A1 | `requireRole` treats `SUPER_ADMIN` as a universal bypass, but `enforceTenant` still pins `req.schoolId` | A platform admin **cannot read any school** — the role is a lie | Introduce explicit **scope resolution**: `super_admin` → `platform` scope (all schools, unless explicitly restricted), `admin` → `school` scope (own tenant), `teacher` → `class` scope. |
| A2 | `withTenant()` is dead code | No cross-tenant path exists | Activate it inside a permission-aware `resolveScope()`. |
| A3 | `requireActiveUser()` is never used | A suspended account keeps its access token for 15 min and can refresh indefinitely | Enforce `status === 'active'` in `requireAuth` (or a new `requireActiveAccount` on protected routers). **Behaviour change for suspended accounts — intentional and required.** |
| A4 | `GET /api/v1/admin/metrics` is teacher-readable and process-global | Teachers see every user's username, role and IP across all tenants | Restrict to `admin`/`super_admin`; scope to the caller's school unless platform scope. |
| A5 | `express.static('./')` at `server.js:381` serves the **whole project root**, including `prisma/dev.db` (4.6 MB SQLite database) | The database is downloadable by anyone who can reach the server | Replace with an explicit allowlist of served directories/files. **Security fix — flagged separately.** |
| A6 | Failed logins are never persisted | "Monitor failed login attempts" is impossible across restarts | New `SecurityEvent` table (D3). |
| A7 | `logout` and `change-password` produce no audit row | Missing traceability for sensitive operations | Write them to `SecurityEvent` + `AuditLog`. |
| A8 | `server-metrics.js` state is process-local and resets on restart | No historical availability; no error *rate*; no percentiles | Extend to compute availability %, error rate, p50/p95, and persist daily rollups (optional table `ServiceMetricDaily`). |
| A9 | `query.routes.js` allowlist vs `PrismaRepository.query()` mismatch | 7 allow-listed names are unimplemented → HTTP 500; `settings.byVisibility` is implemented but unreachable (403) | Fix allowlists; the console will use dedicated endpoints, not the generic dispatcher. |
| A10 | `exports.routes.js`, `imports.routes.js`, `uploads.routes.js` omit `enforceTenant` | Upload/export paths are effectively global, not per-tenant | Add tenant scoping. |
| A11 | `admin.html` and `student-workspace.html` are served without a server-side auth gate | HTML shell is public (data is not) | Acceptable as-is (API is the boundary) — but document it. |
| A12 | Period filters support `today/7d/30d/week/month/term/all/custom` — **no `90d`** | The brief asks for a 90-day window | Add `90d` to `resolvePeriodWindow` (purely additive). |
| A13 | `School.school_year` is a free-text string, so the academic year is a *derived date window* (Sept 1 → Aug 31), not a record tag | Historical comparison must use the date window, not a tag | Keep the existing derivation; document it in every admin chart tooltip. |
| A14 | `Result` has no `class_id` (nullable `user_id` only) | Per-class aggregation requires a join through `users.class_id` | Already handled in `OverviewAnalyticsService.#classComparison` — reuse the same pattern; do not re-derive. |
| A15 | `Exam.options_json` holds legacy row indices; `exam_classes` is unreliable for legacy exams | Assignment-completion rate cannot be computed honestly | Declare it **unavailable** (as `OverviewAnalyticsService` already does) rather than estimating. |

---

## 5. Missing data required for reliable administrative analytics

| Gap | Consequence | Resolution |
|---|---|---|
| No durable auth-event log | Failed logins, logouts, password changes unmeasurable | New `SecurityEvent` table (D3) + write hooks in `auth.routes.js` |
| No school lifecycle status | Cannot answer "active / pending / suspended schools" | `School.status` column (D1) |
| No teacher activity log | "Active teacher" would have to be inferred | Define **active teacher** = (logged in in window) ∪ (created/updated content in window) ∪ (published exam / assigned course in window). All sources are real rows. Document the rule in the KPI tooltip. |
| No school-level "last activity" column | Every school table would need a max() scan | Compute via indexed `max()` per table, or persist `School.last_activity_at` updated on writes |
| No health history | No uptime trend, no incident list | Extend `server-metrics.js` (rolling windows) + optional daily rollup table |
| No `Result.class_id` | Per-class aggregates need a join | Join via `users.class_id` (documented, already the pattern) |
| No error-rate instrumentation for background jobs | "Background jobs" section cannot show failures | Only scheduled work today = session cleanup (5 min) + refresh-token purge (60 min). Show them as **named scheduled tasks with last-run time** derived from process start — **do not fake a job queue**. |

### Definitions to be fixed in code (and surfaced in every tooltip)

| KPI | Exact definition |
|---|---|
| Active school | School with `status='active'` **and** ≥1 recorded activity event in the selected window (login, result, exam creation, kids/game session). |
| Active teacher | `User.role='teacher'` with ≥1 activity event in window (as defined above). **Not** "account exists". |
| Active student | `User.role='student'` with ≥1 `Result` (any mode) **or** `KidsGameSession` **or** `ExamSession` in window. |
| Exams conducted | Distinct `Exam.id` with `status='active'` **and** `is_training=false` that has ≥1 completed `Result` with `mode='exam'` in window. |
| Total attempts | Count of `Result` rows (all modes) — **never** conflated with unique students. |
| Average score | Reported **per attempt** and **per student** separately. `/20` scale = `score / 5` (scores are stored 0–100 %). Pass = `score ≥ 50` = `10/20`. |
| Participation rate | Unique students with ≥1 completed attempt ÷ students enrolled in the scope. |
| Error rate | `requests with status ≥ 400 ÷ total requests` in the window (per endpoint and overall). |
| Failed authentication | `SecurityEvent` rows with `event_type='login_failure'`, grouped by IP and by attempted username. |

---

## 6. Proposed Admin information architecture

```
┌─ Console Shell ────────────────────────────────────────────────────────────┐
│  Brand  │ Scope badge (Platform / <School>) │ Global search │ Health dot │
├──────────────┬────────────────────────────────────────────────────────────┤
│ 1. Overview │  Platform Control Center                                      │
│ 2. Organizations │  A. KPI strip (6–8 primary)                                 │
│ 3. Users & Access │  B. Activity trends (period-filtered)                     │
│ 4. Analytics │  C. Organizational overview table (needs attention)          │
│ 5. Activity & Audit │  D. Teacher engagement │ Student participation (summary) │
│ 6. System Health │  E. Alerts & required actions                             │
│ 7. Settings │                                                              │
└──────────────┴────────────────────────────────────────────────────────────┘
```

### 1. Overview — Platform Control Center
* **A. KPI strip (8 primary):** Organizations · Active orgs (30d) · Teachers (active/total) · Students (active/total) · Exams conducted · Attempts · Avg score /20 · Service availability.
  Secondary metrics fold into labelled sections, never more cards on top.
* **B. Trends:** new orgs · account growth (teacher/student) · DAU/MAU · exams conducted · attempts · platform usage by org (top-N bar) · game activity.
* **C. Organizational overview table:** org · teachers · students · active users · attempts · last activity · status · alerts. Sortable, searchable, filterable, click-through.
* **D. Teacher engagement:** active vs inactive, zero-activity teachers, content creators, distribution across orgs.
* **E. Student participation:** active vs inactive, participation in assessments, participation in games, low-participation orgs.
* **F. Alerts:** inactive orgs, failed-login spikes, suspended accounts, pending invitations, drop in activity, service errors. Each with a deep link.

### 2. Organizations / Schools
List (all orgs at platform scope / one org at school scope) → detail page:
general info · status & access · administrators · teachers · classes · students · usage analytics · recent activity · administrative history.
*Analytical question:* *which organizations are growing, engaged, or at risk?* — not *"how did my class score?"*

### 3. Users & Access
All users · administrators · teachers · students · invitations (account requests) · roles & permissions · access policies.
*Analytical question:* *who has access, how active are they, what changed?*
Actions: activate / deactivate / suspend / reactivate, assign/revoke role, grant/revoke permission, revoke sessions, reset password.

### 4. Platform Analytics
Educational activity · teacher engagement · student participation · exams & assessments · courses & questions usage · games usage · org comparison · historical trends.
*Analytical question:* *how is the platform being used, and how is that changing?*

### 5. Activity & Audit Logs
Administrative actions · authentication events · user-management events · permission changes · security events · system events.
*Analytical question:* *who did what, when, with what outcome?*
Searchable by actor, action, entity, outcome, severity, date range. Paginated. Detail inspection.

### 6. System Health & Operations
API/service status · database health · error trends · response-time percentiles · storage/resource usage · realtime connections · scheduled tasks · historical incidents.
*Analytical question:* *is the platform healthy, and what is broken?*

### 7. Platform Settings
Global configuration · security policies · defaults · feature availability · organizational policies.
Distinguish **platform-level** settings from **school-level** settings; the console shows the right tier for the current scope.

### Page → Teacher-section mapping (same data, different question)

| Teacher section | Teacher's question | Admin's question | Admin page |
|---|---|---|---|
| Courses | course quality & student progress | adoption & usage across orgs | Analytics |
| Questions | question quality & effectiveness | distribution & usage platform-wide | Analytics |
| Exams | performance & student results | assessment activity & participation by org | Analytics |
| Students | individual progress & difficulties | participation & account activity by org | Analytics / Users |
| Classes | class performance | org activity & class distribution | Organizations |
| Games | learning engagement | adoption, usage & technical activity | Analytics |
| — | — | account & access lifecycle | Users & Access |
| — | — | traceability & suspicious activity | Audit |
| — | — | availability & errors | Health |

---

## 7. Implementation plan

### Phase 1 — Audit & Architecture ✅ *(this document)*
Audit, mapping, permission model, KPI source table, IA.

### Phase 2 — Admin Foundation
1. `src/shared/permissions.js` — permission catalog + role→permission map.
2. `src/backend/middleware/permission.js` — `requirePermission`, `resolveScope`.
3. Extend `tenant.js` — activate `withTenant`, add `platformScope` guard.
4. Migrations D1/D2/D4/D5/D6.
5. `src/backend/middleware/auth.js` — enforce active account on protected routers.
6. Console shell + router + design system + chart kit port (no pages yet).
7. Landing page routes `admin`/`super_admin` → `/console`; teachers unchanged.

### Phase 3 — Platform read model & Overview
8. `PlatformAnalyticsService` (B4) + `GET /api/v1/platform/overview`.
9. `SecurityEvent` model + write hooks (D3, B7).
10. Overview page: KPI strip, trends, org table, engagement/participation summaries, alerts.

### Phase 4 — Management modules
11. `organizations.routes.js` (list/detail/status/plan) + Organizations page + school detail.
12. `users.routes.js` extensions (status transitions, role assignment, permission overrides, invitations) + Users & Access page + user detail.
13. `audit.routes.js` (search/filter/paginate) + Audit page.
14. `analytics.routes.js` (platform analytics read model) + Analytics page.
15. `health.routes.js` + Health page.
16. Settings page (platform tier vs school tier).

### Phase 5 — Backend & security hardening
17. Restrict `GET /admin/metrics`; scope it.
18. Fix `express.static('./')` exposure (A5).
19. Fix `query.routes.js` allowlist mismatch (A9).
20. Add `enforceTenant` to exports/imports/uploads (A10).
21. Audit-log every sensitive admin action with outcome + severity.
22. Query indexes; pagination on all console tables.

### Phase 6 — QA
23. Route-by-route admin test pass.
24. KPI↔DB reconciliation script (every KPI asserted against raw SQL/Prisma counts).
25. Permission-boundary + tenant-isolation tests (new vitest suites).
26. Empty/loading/error states; responsive checks (desktop / tablet / mobile).
27. Regression: teacher + student sessions verified unchanged.

---

## 8. Open decisions — RESOLVED

| # | Question | Decision |
|---|---|---|
| Q1 | New standalone console or new tabs in `admin.html`? | **New standalone console at `/console`.** `admin.html` keeps authoring and is untouched; the console deep-links into it. |
| Q2 | Platform operator or organization administrator? | **Both, with explicit scope.** `super_admin` → platform scope (all organizations, may narrow with `?school_id=`); `admin` → school scope (own organization only). One console, two scopes. |
| Q3 | Database changes allowed? | **Yes, additive migrations only.** `20261112_admin_platform_governance` adds `School.status`, `AuditLog.outcome/severity`, and the `SecurityEvent` / `Role` / `RolePermission` / `UserPermissionOverride` tables. No column dropped or renamed; no existing table rebuilt. |
| Q5 | Student-level exposure in the platform console? | **Aggregated by default.** Organization and class aggregates everywhere; student identity only in Users & Access. |
| Q6 | Billing / subscriptions / quotas? | **Prepare only.** `School.plan` and `School.max_students` are surfaced as observed configuration; nothing is enforced, and the Settings page says so explicitly. |

---

## 11. What was built (Phases 2–4)

### 11.1 Backend

| File | Purpose |
|---|---|
| `src/shared/permissions.js` | **New.** Permission catalog (25 permissions in 3 scope groups), role→permission map, override resolution. Shared by frontend and backend. |
| `src/backend/middleware/permission.js` | **New.** `resolveScope`, `scopeFilter`, `resolveTargetSchool`, `requirePermission`, `requireScope`, `requireActiveAccount`. |
| `src/backend/services/RoleService.js` | **New.** Mirrors the code catalog into the `Role`/`RolePermission` tables; per-user grants and denies. |
| `src/backend/services/SecurityEventService.js` | **New.** Durable authentication/access trail (login success/failure, logout, password change, session revoked). Never stores secrets. |
| `src/backend/services/PlatformAnalyticsService.js` | **New.** The platform read model: overview, trends, organization metrics, user list. |
| `src/backend/services/AuditQueryService.js` | **New.** Searchable, paginated administrative-action trail + security-event trail + facets. |
| `src/backend/services/SystemHealthService.js` | **New.** Availability, latency percentiles, database, storage, realtime, scheduled work. |
| `src/backend/services/AdminActionService.js` | **New.** Administrative writes: organization status, account status, role change, permission grant/deny. Every action is scope-checked, audit-logged with an outcome and a severity, and mirrored into the security trail. |
| `src/backend/services/AuditService.js` | **Extended.** `log()` now accepts `outcome` and `severity` and persists them. |
| `src/backend/routes/console.routes.js` | **New.** Mounted at `/api/v1/console`. Session, roles, permissions, overview, trends, organizations (+ detail, + status/profile patch), users (+ detail, + status/role patch, + permission overrides, + session revocation), audit, audit/summary, health. |
| `src/backend/server-metrics.js` | **Extended.** `getLatencyStats()` — p50/p95/p99, status-code split, availability computed from **5xx only**. |
| `src/backend/container.js` | Wired the four new services; `AuthService` now receives the security-event writer. |
| `src/backend/server.js` | Mounts `/api/v1/console`, serves `/console`, syncs the role catalog at boot. |
| `src/backend/services/AuthService.js` | Writes login success/failure, logout and password-change security events. |
| `src/backend/routes/users.routes.js` | Records a `session_revoked` security event. |
| `src/backend/services/OverviewAnalyticsService.js` | Added the `90d` period (purely additive). |

### 11.2 Frontend — the console

`console.html` + `src/frontend/console/**` + `scripts/build-console.js` → `public/console-bundle.js|css`.

```
src/frontend/console/
  main.js                 boot, route registry, permission-filtered nav
  core/    api.js  store.js  router.js  shell.js
  viz/     charts.js            (ported from teacher-analytics.js, ta- → ac-)
  components/ ui.js  table.js  filters.js  states.js
  pages/   overview.js  organizations.js  users.js  analytics.js
           audit.js  health.js  settings.js
  pages/details/  organization.js  user.js
  styles/  console.css          (standalone design system, light + dark)
```

### 11.4 Detail pages and administrative actions

| Page | Contents | Actions |
|---|---|---|
| **Organization detail** (`#/organizations/:id`) | Profile, status, administrators, teachers, students, classes, usage metrics, administrative history | Suspend / reactivate the organization (with a recorded reason). Suspending also suspends the organization's accounts, because the account status is what the auth layer reads. |
| **Account detail** (`#/users/:id`) | Profile, organization, class, activity summary, permission overrides, recent attempts, administrative history | Suspend / reactivate, change role, grant or deny a permission, remove an override, revoke every session. |

All of them are server-validated, scope-checked and audit-logged. The guards refuse the
obvious foot-guns: an administrator cannot change their own role or suspend themselves, and
the last active platform administrator cannot be suspended.

### 11.3 Database

`prisma/migrations/20261112_admin_platform_governance/migration.sql` — additive only:
`School.status/suspended_at/suspended_reason` · `AuditLog.outcome/severity` ·
new tables `SecurityEvent`, `Role`, `RolePermission`, `UserPermissionOverride` ·
six supporting indexes.

### 11.4 Operational tooling

| File | Purpose |
|---|---|
| `scripts/create-platform-admin.mjs` | Provisions a `super_admin`. There is no self-service path to platform scope — granting it is an operator action taken on the server. |
| `scripts/console-screenshots.mjs` | Captures every console route at a chosen viewport for visual review. |
| `scripts/teacher-regression-shot.mjs` | Signs in through the real legacy teacher login form and screenshots the teacher Overview — the regression guard for the analytics that must not be damaged. |

### 11.5 Tests

| File | Coverage |
|---|---|
| `tests/unit/permissions.test.js` | Catalog integrity, role map, override grant/deny. |
| `tests/integration/console.permissions.test.js` | Teacher/student refused, suspended account refused, tenant isolation on users/organizations/audit/overview, platform scope + narrowing. |
| `tests/integration/platform-analytics.test.js` | The KPI numbers themselves, hand-computed from a seeded dataset (active teacher, active student, attempts vs unique students, exams conducted, average /20, tenant scoping, trends). |

Full suite: **96 test files / 1 211 assertions green**. The single failure
(`tests/integration/questions.game-studio-scope.test.js`) is pre-existing: it calls
`prisma.kidsActivity.create(...)` but no `KidsActivity` model has ever existed in
`prisma/schema.prisma` (the test predates this work — last touched in commit `af87546`).


---


---

## 9. Reuse ledger (what we will **not** rewrite)

| Existing | Verdict |
|---|---|
| `teacher-analytics.js` chart kit | **Port + rename** (`ta-` → `ac-`), no logic rewrite |
| `teacher-analytics.css` | Port + rename |
| `OverviewAnalyticsService` | Reuse as the school-scope read model; extend `resolvePeriodWindow` with `90d` |
| `TeacherOverviewService` | Reuse as the architectural template for `PlatformAnalyticsService` (patterns, caps, `unavailable` discipline) |
| `AuditService.log()` | Reuse; add `outcome`/`severity` params |
| `server-metrics.js` | Extend (availability %, error rate, p50/p95) |
| `presence.registry.js` | Reuse for realtime connection status |
| `src/frontend/ui/components/*` | Reuse (Modal, Table, Toast, Spinner) |
| `src/frontend/infrastructure/ApiRepository.js` | Reuse as-is |
| `src/shared/schemas/*` | Reuse the zod + `validate` pattern |
| `landing.js`, `index.html` | Extend for console routing |
| `admin.html` (authoring surfaces) | **Untouched** |
| `admin.html` (governance surfaces) | Replaced by console links (Phase 4) |
| Student session | **Untouched** |
| Teacher analytics | **Untouched** |

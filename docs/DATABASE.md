# Database & Migrations

## The provider

**SQLite.** `prisma/schema.prisma` pins the datasource:

```prisma
datasource db {
  // Prisma requires a literal provider (env() is not supported here — only in `url`).
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Prisma bakes the provider into the generated client, so `DB_PROVIDER` is
**informational** — it labels the health panel, it does not select a driver.
Changing the URL to `postgresql://…` against a SQLite client fails at the
first query with a provider mismatch.

### Why not PostgreSQL?

The deployed migration history is SQLite SQL. All 22 migrations use SQLite
column types (`TEXT`, `INTEGER`, `DATETIME` — PostgreSQL has no `DATETIME`),
four of them toggle `PRAGMA foreign_keys` and rebuild tables with
`RENAME TO`. Every structured column is a `String` holding JSON, because
SQLite has no `Json` type.

A PostgreSQL deployment therefore needs a **parallel migration tree** — a
fresh baseline generated from the schema, not a rewrite of the deployed
history. That work has not been done and has not been verified here, so
PostgreSQL is **not supported**. `docs/DEPLOYMENT.md` §6 has the full list of
what a port would involve.

One behaviour difference is worth recording even so: Prisma's `contains` is
case-insensitive on SQLite and case-sensitive on PostgreSQL. Around twenty
search paths use it. A port would need `mode: 'insensitive'` throughout.

---

## Running migrations

```bash
npx prisma migrate deploy      # apply every pending migration (production)
npx prisma migrate dev         # create + apply a migration (development)
npx prisma generate            # regenerate the client after a schema change
```

`migrate deploy` is what the Docker image runs on every start, and what the
installers run.

### The role catalog is synced at boot, not by a migration

`RoleService.ensureSeeded()` mirrors `src/shared/permissions.js` into the
`Role` and `RolePermission` tables on every start. It is idempotent and it
removes rows for permissions a role no longer carries.

---

## The migration history

| Migration | What it does |
|---|---|
| `20260701144253_init_v4_multitenant` | The multi-tenant baseline: `School`, `User`, `Class`, `Question`, `Exam`, `Result`, `Game`, `Setting`, `AuditLog`, … |
| `20260702140027_join_tables_surrogate_id` | Surrogate keys on the join tables |
| `20260810_normalize_full_persistence` | Moves the remaining legacy stores into the database |
| `20260912_add_ai_configs` | Encrypted AI provider configuration |
| `20260913_add_school_profile_user_contacts` | Organization profile fields, staff contacts |
| `20260923_add_school_year_and_archives` | School year + end-of-year archives |
| `20260923_repair_schema_drift` | Repairs a drift between the live database and the history |
| `20261003_kids_tables` | The Kids Space (`KidsGame`, `KidsGameSession`, championships) |
| `20261004_kids_attribution` | Author attribution + bank-sync target |
| `20261005_kids_sessions_unified` | Unified kids sessions (logged-in + anonymous) |
| `20261006_tournament_question_set` | Tournament question sets |
| `20261007_user_civility_title` | Civility / title |
| `20261010_question_time_limits` | Per-question time limits |
| `20261013_add_classroom_devices` | Classroom devices |
| `20261021232132_kid_quest_progress` | Math Quest per-level progress |
| `20261101_add_courses` | Courses, lessons, course↔class |
| `20261102_add_lesson_nesting` | Nested lessons |
| `20261103_add_subject_scoped_categories` | Subject-scoped categories |
| `20261105_add_course_document_header` | Course document header |
| `20261105_add_lesson_prep_sheet` | Lesson preparation sheets |
| `20261110_add_lesson_exercise_and_documents` | Lesson exercises + the generated-document registry |
| `20261112_admin_platform_governance` | **The Admin console phase** — see below |

> The history is append-only. Nothing has been rewritten or deleted.

---

## `20261112_admin_platform_governance` — the governance migration

Additive only. No table is dropped, renamed or rebuilt; no existing column is
retyped.

| Change | Why |
|---|---|
| `School.status` (`active` \| `pending` \| `suspended`) | An organization's lifecycle. `School.plan` said what it was *entitled* to; `status` says whether it may *operate* |
| `School.suspended_at`, `School.suspended_reason` | Why an organization was suspended, and when |
| `AuditLog.outcome` (`success` \| `denied` \| `error`) | The action alone could not distinguish a completed action from a refused one |
| `AuditLog.severity` (`info` \| `warning` \| `critical`) | How urgent the event is. Independent of the action |
| `SecurityEvent` (new table) | A durable authentication / access trail. Failed sign-ins used to live only in a volatile in-memory buffer; `logout` and `password_change` produced nothing at all |
| `Role` (new table) | The role catalog, so the console can show the real permission set instead of a hardcoded list |
| `RolePermission` (new table) | Which permissions each role carries |
| `UserPermissionOverride` (new table) | A single permission granted to, or denied from, one account — optionally limited to one organization |
| Six supporting indexes | The console's hot paths |

### Applying it

```bash
npx prisma migrate deploy
npx prisma generate
```

It applies cleanly to a **fresh** database and to an existing one: every
statement either creates a new table or adds a column with a constant
default, which SQLite back-fills onto the existing rows. The integration test
suite proves the fresh-database path — every integration test boots its own
throwaway database by running the whole migration history from empty.

---

## Tenant isolation

`School` is the tenant root. Every data table carries `school_id`, and the
isolation is enforced in three places:

1. **`enforceTenant`** (`src/backend/middleware/tenant.js`) — pins
   `req.schoolId` from the signed token. A request can never choose its own
   tenant.
2. **`resolveScope` + `scopeFilter`** (`src/backend/middleware/permission.js`)
   — the console's read models take an explicit organization list. A platform
   request may narrow it; an organization request cannot widen it.
3. **Service-level scope checks** (`AdminActionService.#assertScope`) — every
   administrative write re-checks the target organization against the
   caller's scope.

`School.status = 'suspended'` blocks sign-ins from that organization at the
authentication layer (`AuthService.login` / `refresh`) and at
`requireActiveAccount`. The organization-management routes opt out of that
check (`allowSuspendedOrganization`), so an organization administrator can
always restore their own organization.

---

## Data the console can and cannot see

| | Visible to |
|---|---|
| Organization totals, usage, alerts | Platform scope, and the organization itself |
| Class-level aggregates | The organization, and its teachers |
| Individual student identities | The organization's administrators, and a platform operator — **audited** |
| `system.*` settings | Never. The settings visibility tiers cap them at `admin`, and the generic query dispatcher clamps the tier to the caller's role |
| Another organization's audit trail | Only a platform operator |

---

## Verifying a migration

```bash
# Applies the whole history to a throwaway database and runs the suite.
npx vitest run

# The governance migration on its own.
npx prisma migrate deploy
npx prisma generate
```

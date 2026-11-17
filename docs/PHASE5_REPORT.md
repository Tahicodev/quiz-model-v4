# Phase 5 — Final Report
## Offline/LAN compatibility, SaaS readiness and security hardening

**Date:** 2026-11-13
**Scope:** validate and preserve both deployment models of one educational
platform.

Every claim below is marked:

- **Verified** — proven by a test or a script in this repository.
- **Implemented, not tested** — the code exists but was not exercised here.
- **Not implemented** — deliberately absent.
- **Not supported** — a documented limitation.

---

## 1. What was already compatible

| Finding | Status |
|---|---|
| The core application never needed the internet | **Verified.** Every core feature works with outbound DNS and TCP blocked. |
| Socket.IO is vendored locally (`vendor/socket.io.min.js`), not loaded from a CDN | **Verified.** All three entry pages reference the local file. |
| AI features are optional and degrade gracefully | **Verified.** No key ⇒ mock questions; a provider failure ⇒ text fallback; RAG synthesis failure ⇒ a `null` answer. |
| PDF/DOCX export works offline | **Verified.** `pdfkit` and `docx` are bundled; remote images in exports are explicitly refused. |
| The setup wizard's CDN probe never blocks startup | **Verified.** It runs only inside an admin-only endpoint, is wrapped in `allSettled`, and aborts after 4 s. |
| The database is SQLite with a coherent multi-tenant schema | **Verified.** `School` is the tenant root; every data table carries `school_id`. |
| Authentication was already sound: bcrypt, SHA-256-hashed refresh tokens, rotation, single live session, rate limiting | **Verified.** |
| The Admin console already used the scope + permission model | **Verified.** |

---

## 2. What required changes

| Area | Before | After |
|---|---|---|
| Deployment mode | A frozen constant `MODE = 'saas'`; `APP_MODE` and `DB_PROVIDER` were written by installers but read by nothing | A real, validated configuration: `DEPLOYMENT_MODE` → `APP_MODE` → `DB_PROVIDER` → default. An unknown value stops the server at boot. |
| Static file serving | `express.static('./')` published the whole project tree | An explicit allow-list (`src/backend/staticAssets.js`) plus a deny-list |
| Default credentials | `admin123` in the seed, in the legacy client, in every installer banner, and a hard-coded recovery code | No published password anywhere; a random one-time password on first run; legacy defaults rotated on the next seed |
| Teacher privileges on the bulk endpoint | A teacher could write `system.recovery_code_hash`, mint a recovery ticket and reset an administrator's password | The `system.*` namespace and every admin-tier key are refused; the visibility tier is enforced on the bulk path too |
| The generic query dispatcher | Seven allow-listed names were not implemented (⇒ HTTP 500); two implemented names were unreachable (⇒ 403); a student could ask for the admin settings tier; a teacher could resolve another organization's student | Allow-lists match the implementation; the dispatcher clamps the visibility tier and refuses cross-organization lookups |
| `GET /admin/metrics` | Teacher-readable and process-global — every user's username, role and IP across all tenants | Administrator-only, scoped to the caller's organization |
| The landing page | Sent administrators to `admin.html` | Sends them to `/console` |
| The refresh cookie | `Secure` derived from `NODE_ENV`, so a plain-HTTP LAN silently dropped it and every session ended on the first reload | Derived from the actual transport (`COOKIE_SECURE` / `TLS_ENABLED`) |
| The "SaaS" Docker stack | Could not boot: a PostgreSQL URL against a SQLite client, a 47-character `JWT_SECRET`, a hard-coded database password, `db seed` on every start, no uploads volume | Deploys the multi-tenant platform on SQLite with persistent volumes, a required secret, and an optional Redis profile |
| Organization suspension | Cascaded into every account's status — a single-organization offline install could never be restored | The organization status is the gate; accounts are untouched; the administrator keeps a route to reactivate their own organization |
| Exam sessions (REST) | `POST /api/v1/sessions` never set `school_id` ⇒ HTTP 500, and the attempt could not be graded | The session carries its organization, derived from the signed token |
| The obsolete `KidsActivity` test | Asserted against a model deleted many releases ago | Rewritten against the rule actually enforced (authorship scoping + tenant isolation). **No model was added to silence a test.** |

---

## 3. What was fixed

### 3.1 The static exposure — the most serious finding

`express.static('./')` served the entire project root. **Verified before the
fix:** `GET /prisma/dev.db` returned **5 169 152 bytes** of the live SQLite
database to any client that could reach the server. Also served: the Prisma
schema, the migration history, `package.json`, the backend source, the
migration SQL and the `node_modules` tree.

**Verified after the fix** (`scripts/verify-static-exposure.mjs`): 22 sensitive
paths refused, 33 public assets served.

### 3.2 A teacher could become an administrator

`POST /api/v1/bulk/settings` accepted any key. A teacher could write
`system.recovery_code_hash` — the bcrypt hash of the organization's recovery
code — then mint a recovery ticket and reset an administrator's password.

The `system.*` namespace is now refused on the bulk path, the visibility tier
is enforced there too, and the tier lookup **fails closed** if it cannot be
read.

### 3.3 The offline install could not be restored

Suspending an organization cascaded into its accounts' status. On a
single-organization installation the administrator was then locked out of the
only route back — the organization itself.

Suspending an organization now blocks sign-ins at the authentication layer
(`AuthService.login`, `AuthService.refresh`) and at `requireActiveAccount`,
while the organization-management routes stay reachable for the
administrator of that organization.

### 3.4 The exam path returned 500

`POST /api/v1/sessions` never set `school_id`. The column is `NOT NULL`, so
every session creation failed, and `ResultService.createFromSession` inherits
the session's organization — so the attempt could not be graded either. Found
by the offline validation, not by inspection.

---

## 4. Database providers tested

| Provider | Status | Detail |
|---|---|---|
| **SQLite** | **Verified** | The only supported provider. The full migration history applies cleanly to a fresh database (every integration test proves this) and to the live one. |
| PostgreSQL | **Not supported** | The Prisma schema pins `provider = "sqlite"`, and all 22 migrations are SQLite SQL (`TEXT`/`INTEGER`/`DATETIME`, `PRAGMA foreign_keys`, table-rebuild `RENAME TO`). A port needs a **parallel** migration tree, not a rewrite of the deployed history. |

The port would also have to address three provider-specific behaviours that
are documented in `docs/DATABASE.md`:

1. Prisma's `contains` is case-insensitive on SQLite and case-sensitive on
   PostgreSQL — around twenty search paths would silently change.
2. Every structured column is a `String` holding JSON, because SQLite has no
   `Json` type.
3. `skipDuplicates` is unsupported on SQLite, so the repository's
   `createMany` already avoids it.

No PostgreSQL migration was written or verified: Docker and a PostgreSQL
server are unavailable in this environment, and shipping an untested migration
tree would be worse than documenting the gap.

---

## 5. Offline tests performed

`scripts/offline-lan-validation.mjs` boots the **real server** with
`scripts/offline-guard.mjs` — a Node preload that makes outbound DNS
resolution and outbound TCP connections impossible, and records every
attempt.

**Result: 37/37 checks passed, and the guard log was empty.**

| Area | Checks |
|---|---|
| Boot | The server starts with the network blocked |
| Authentication | Local administrator, teacher and student sign in; a teacher is refused the console |
| Console | Opens with the school scope; reports the `offline` deployment mode |
| Analytics | The overview answers with real numbers |
| Audit | The administrative trail and the security events are readable |
| User management | The user list is organization-scoped; suspend, reactivate, grant a permission, remove an override |
| Organization lifecycle | Suspend; sign-in refused; the administrator reactivates their own organization; sign-in works again |
| Questions & exams | A question and a published exam are stored; the student sees the exam assigned to their class; starts a session; answers; submits |
| Results & grading | The teacher sees the graded result; the result is stored at 100% |
| Games | Join, start, finish |
| Realtime | **Two clients**: the second client's join is broadcast to the first (`player:joined`) |
| Concurrency | **20 distinct clients** sign in and read the console (20/20, 902 ms) and submit attempts (20/20, 212 ms) |
| Persistence | The server restarts; the graded results and the audit trail survive |
| **The verdict** | **No feature attempted an outbound connection** |

### Also verified

| Check | Result |
|---|---|
| `npm run verify:static` | 22 sensitive paths blocked, 33 public assets served |
| `npm run teacher:regression` | The teacher session signs in through the real legacy form; 9 tabs visible, Monitoring correctly hidden, 48 overview panels, the analytics intact |
| Student workspace | Loads and renders |
| Full test suite | **111 files · 1 399 assertions · all green** |

---

## 6. LAN tests performed

| Check | Result |
|---|---|
| The server binds `0.0.0.0` and is reachable on the LAN | **Verified** (`scripts/lan-ip.mjs` reports the address; the installers print it) |
| 20 simultaneous clients doing real work | **Verified** — 20/20 console reads in 902 ms, 20/20 attempt writes in 212 ms |
| One live session per account | **Verified** — the second sign-in is refused with `SESSION_ACTIVE` unless `force` is set. This is why the concurrency fixture uses 20 **distinct** accounts. |
| Restart with persistence | **Verified** — results and the audit trail survive |
| The LAN install needs no internet | **Verified** — the guard log is empty |

### Not verified here

- Real hardware on a physical school LAN (the environment has one host).
- Wi-Fi AP behaviour, captive portals, or a school proxy that intercepts
  outbound traffic.
- Twenty *different* physical machines. The concurrency test uses 20 distinct
  accounts against one server, which exercises the same code paths but not
  separate TCP stacks or browsers.

---

## 7. SaaS tests performed

`scripts/saas-validation.mjs` — **32/32 checks passed**, against three
fixture organizations plus the ones already in the database.

| Check | Result |
|---|---|
| The platform administrator gets the platform scope | **Verified** |
| An organization administrator gets the organization scope and holds no platform permission | **Verified** |
| A teacher is refused the console | **Verified** |
| The platform administrator sees every organization | **Verified** |
| An organization administrator sees only their own | **Verified** |
| An organization administrator cannot widen the scope to another organization | **Verified** — 403 |
| Cross-tenant analytics aggregate; an organization-scoped overview sees one | **Verified** |
| A platform request can be narrowed to one organization | **Verified** |
| The audit trail and the security events are tenant-isolated | **Verified** |
| The user list is tenant-isolated; another organization's account is 404 | **Verified** |
| A permission **deny** removes a capability the role carries; removing it restores the baseline | **Verified** |
| An account can be suspended and restored, and the sign-in outcome follows | **Verified** |
| An organization can be suspended and restored by the platform operator | **Verified** |
| The organization scope cannot be widened in SaaS mode either | **Verified** |
| No outbound connection | **Verified** |

---

## 8. Security issues resolved

| # | Issue | Severity | Resolution |
|---|---|---|---|
| 1 | `express.static('./')` served the live database, the schema, the migrations and the source | **Critical** | Explicit allow-list + deny-list; HTTP-verified |
| 2 | A teacher could take over an administrator's account through the bulk settings endpoint | **Critical** | `system.*` and admin-tier keys refused; the tier is enforced and fails closed |
| 3 | `admin123` was published in the source, in the seed, in four installer banners and in the shipped bundle | **Critical** | No published password; a one-time generated password; legacy defaults rotated |
| 4 | A hard-coded client-side recovery code (`QuizAdminRecovery2024`) could unlock any administrator account | **High** | Generated per browser profile, never published |
| 5 | `GET /admin/metrics` was teacher-readable and process-global | **High** | Administrator-only and organization-scoped |
| 6 | The query dispatcher let a student request the admin settings tier | **High** | The tier is clamped to the caller's role |
| 7 | The query dispatcher let a teacher resolve another organization's student | **High** | Refused with 403 |
| 8 | `Secure` on the session cookie was derived from `NODE_ENV`, breaking plain-HTTP LAN sessions | **High** | Derived from the actual transport |
| 9 | A published fallback encryption key for stored AI provider keys | **Medium** | Removed; the service refuses to run without a real secret |
| 10 | `docker-compose.yml` had a 47-character `JWT_SECRET` and a hard-coded database password | **Medium** | A required secret; the password comes from the environment |
| 11 | `db seed` ran on every container start, re-creating a default administrator | **Medium** | The seed is idempotent and never resets an existing password |
| 12 | The `system.*` settings tier was unreachable through the query dispatcher but reachable through bulk | **Medium** | Closed on both paths |

---

## 9. Remaining limitations

| Limitation | Status |
|---|---|
| PostgreSQL | **Not supported.** The migration history is SQLite-bound. Documented in `docs/DATABASE.md`. |
| The offline npm bundle is stale | **Not implemented.** `vendor/offline/` predates `pdfkit`, `docx`, `mammoth`, `pdf-parse`, `fontkit` and `jszip`. It must be regenerated on an internet machine before an air-gapped install. |
| Availability has no history | **By design.** The request log is process-local; the console reports a windowed figure and says so. A daily rollup table would give history — **not implemented**. |
| Global search in the console header | **Not implemented.** The input is present but not wired to an endpoint. |
| `CORS_ORIGIN` is advisory | **Pre-existing.** The handler reflects any origin after logging a warning, because a school LAN has unknown client addresses. A SaaS deployment should set it and the handler should be tightened. |
| The browser access token lives in `localStorage` | **Pre-existing.** `legacy-auth-bridge.js` persists it, contradicting the SPA service's own "memory only" claim. Mitigated by `httpOnly` + `sameSite: strict` on the refresh cookie and by a strict CSP, but an XSS would still yield a 15-minute bearer token. |
| Twenty *physical* machines | **Not verified.** Twenty concurrent clients against one server were verified; separate physical hosts were not available. |

---

## 10. Migration and deployment risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The offline installer fails on an air-gapped machine | **High** if the bundle is not regenerated | Regenerate `vendor/offline/` and `dist/` on an internet machine. Documented in `docs/DEPLOYMENT.md` §5. |
| The `quiz-data` volume shadows the migrations inside the image | **Medium** | The volume is seeded from the image on first creation; after an upgrade that adds a migration, re-run the migrations inside the container. Noted in the compose file. |
| An operator sets `DB_PROVIDER=postgresql` expecting a Postgres deployment | **Medium** | The server now validates the provider value, and `docs/DATABASE.md` explains that the provider is fixed by the schema. The compose file no longer suggests Postgres. |
| An operator sets `COOKIE_SECURE=true` on a plain-HTTP LAN | **Medium** | Documented prominently in `.env.example` and `docs/DEPLOYMENT.md`. The default is `false`. |
| The `20261112_admin_platform_governance` migration is not applied | **Low** | Additive only; applies cleanly to a fresh and to an existing database. `prisma migrate deploy` runs on every container start. |
| A suspended organization locks out a single-organization installation | **Resolved** | The organization-management routes are reachable while suspended, and the administrator can reactivate their own organization. Verified in the offline validation. |

---

## 11. How to reproduce every claim

```bash
npm test                            # 111 files · 1 399 assertions
npm run verify:static               # nothing sensitive is served
npm run verify:offline              # 37/37 with the network blocked
npm run verify:saas                 # 32/32 multi-tenant checks
npm run teacher:regression          # the teacher session still works
npm run console:shots               # every console route, captured
```

Documentation:

- `docs/DEPLOYMENT.md` — the two modes, the environment, the installers, the
  offline guarantees, the security notes
- `docs/DATABASE.md` — the provider, the migration history, tenant isolation
- `docs/ADMIN_CONSOLE_ARCHITECTURE.md` — the console's layers, scope model
  and API
- `docs/ADMIN_CONSOLE_AUDIT.md` — the original audit and the Phase 4 record
- `PROJECT_STATUS.md` — the running status of every item

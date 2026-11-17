# Deployment Guide

One educational platform. Two deployment shapes. **The same application, the
same database schema, the same authentication, the same console.**

| | OFFLINE / LAN | SAAS |
|---|---|---|
| What it is | A school installation on its own machine | A cloud deployment of the same product |
| The server | **Is** the platform — one node, no cluster | One node of a multi-tenant product |
| Database | SQLite file on the server | SQLite file on the node (see [PostgreSQL](#postgresql)) |
| Organizations | The ones hosted on this server | Every organization on the platform |
| Super administrator | Administers *this installation* | Administers *every* organization |
| Organization administrator | Administers their own organization | Administers their own organization |
| Internet | **Not required** for any feature | Not required by any core feature either |
| Redis / multi-instance | Not used | Optional (`REDIS_URL`) |

**Deployment mode is a topology, never a privilege.** It decides which
infrastructure may be used and how the administration surface is labelled. It
never grants or removes a capability: an organization administrator is scoped
to their own organization in *both* modes, and a super administrator reaches
every organization in *both* modes.

---

## 1. Choosing the mode

The mode is read from the environment, in this order:

1. `DEPLOYMENT_MODE` — `offline` or `saas` (`local` is accepted as an alias
   of `offline`)
2. `APP_MODE` — the historical key, same values
3. `DB_PROVIDER` — `postgresql` implies `saas`, `sqlite` implies `offline`
4. default — `saas`, the behaviour the application has always had when
   nothing is configured

An unrecognised value is a **startup error**. Guessing the topology of a
deployment is how the wrong thing ends up exposed.

```bash
# Offline / LAN installation
DEPLOYMENT_MODE=offline

# SaaS deployment
DEPLOYMENT_MODE=saas
```

The resolved mode is visible at runtime:

- `GET /health` → the server logs `deploymentMode` at boot
- `GET /api/v1/console/session` → `deployment.mode`, `deployment.label`,
  `deployment.description`, `deployment.dbProvider`
- the browser receives `window.APP_CONFIG = { mode, deploymentMode, … }`
  (`mode` is the legacy `'saas' | 'local'` spelling)

---

## 2. Environment configuration

Copy `.env.example` to `.env` and fill it in. The keys that matter:

### Required

| Key | Purpose |
|---|---|
| `JWT_SECRET` | **64+ characters.** Signs every access token. A short or missing value stops the server at boot — it is a cross-tenant forgery risk, not a formality. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_URL` | `file:./dev.db` (SQLite, relative to `prisma/`) |
| `PORT` | Default `3000`. The server binds `0.0.0.0` so every device on the LAN can reach it |

### Deployment

| Key | Default | Purpose |
|---|---|---|
| `DEPLOYMENT_MODE` | derived | `offline` \| `saas` |
| `DEFAULT_SCHOOL_ID` | — | The organization a sign-in without an explicit tenant resolves to. On a LAN install this is the local school |
| `CORS_ORIGIN` | `http://localhost:3000` | The allowed browser origin. Set it to the LAN address for a school install |
| `COOKIE_SECURE` | `false` | Set `true` when the public URL is `https://` (a TLS-terminating proxy). **Leave it `false` on a plain-HTTP LAN** — a `Secure` cookie is dropped by the browser over HTTP and every session ends on the first reload |

### Database

| Key | Default | Purpose |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | Informational. The provider is fixed by `prisma/schema.prisma` and the migration history — see [PostgreSQL](#postgresql) |

### Auth

| Key | Default | Purpose |
|---|---|---|
| `JWT_ACCESS_EXPIRES` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh-token lifetime |
| `SESSION_ACTIVE_WINDOW_MINUTES` | `30` | One live session per account; a second sign-in inside this window is refused unless `force` is set |
| `REFRESH_ROTATION_GRACE_MS` | `30000` | Window in which a rotated refresh token may be replayed by the same browser |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost |

### First run

| Key | Default | Purpose |
|---|---|---|
| `BOOTSTRAP_ADMIN_PASSWORD` | — | The administrator's first password. **Minimum 10 characters.** When it is not set, the seed generates a random 20-character password and prints it **once** |

### Optional

`AI_KEY_SECRET` (encryption key for stored AI provider keys — falls back to
`JWT_SECRET`), `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` (legacy env-driven AI
generation), `AI_IMAGE_*`, `EXAM_DOC_FONT_TTF` (a local TTF for non-Latin
scripts in exported PDFs), `UPLOADS_DIR`, `TLS_ENABLED` / `TLS_CERT_PATH` /
`TLS_KEY_PATH` (HTTPS with the bundled `mkcert`), `REDIS_URL` (multi-instance
Socket.IO adapter), `LOG_LEVEL`, `RATE_LIMIT_DISABLED`.

---

## 3. Installing

### Offline / LAN (a school)

```bash
# 1. Configure
cp .env.example .env
#    DEPLOYMENT_MODE=offline
#    DEFAULT_SCHOOL_ID=local
#    CORS_ORIGIN=http://<school-server-ip>:3000
#    JWT_SECRET=<64+ chars>
#    BOOTSTRAP_ADMIN_PASSWORD=<choose one>

# 2. Install and prepare the database
npm ci
npx prisma migrate deploy     # applies every migration
npx prisma db seed            # creates the administrator

# 3. Run
npm start
```

On Windows `setup.bat` and on Linux/macOS `install.sh` do all of the above and
print the LAN address the classroom should use. `docker-start.bat` /
`docker-start.sh` do the same through Docker.

**There is no default password.** The seed either uses
`BOOTSTRAP_ADMIN_PASSWORD` or prints a one-time generated password. If you
lose it before the first sign-in:

```bash
npm run admin:create -- --username=admin --password='<a new strong password>'
```

### SaaS

```bash
cp .env.example .env
#    DEPLOYMENT_MODE=saas
#    JWT_SECRET=<64+ chars>
#    BOOTSTRAP_ADMIN_PASSWORD=<choose one>
#    CORS_ORIGIN=https://<your-domain>

npm ci
npx prisma migrate deploy
npx prisma db seed
npm start
```

Behind a TLS-terminating reverse proxy, set `COOKIE_SECURE=true` and bind the
Node process to `127.0.0.1`.

With Docker: `docker compose up -d` (the SaaS stack) or
`docker compose -f docker-compose.local.yml up -d` (the LAN stack).

---

## 4. Offline guarantees

**Verified, not asserted.** `scripts/offline-lan-validation.mjs` boots the real
server with `scripts/offline-guard.mjs` — a Node preload that makes outbound
DNS resolution and outbound TCP connections impossible — and then exercises
every workflow a school depends on. The verdict is the guard's log: if it
stays empty while all 37 checks pass, nothing in the request path reached the
internet.

```bash
node scripts/offline-lan-validation.mjs
```

What is covered: administrator / teacher / student sign-in, the console,
organization and user management, analytics, the audit trail, security events,
questions and exams, answering and grading, results, educational games,
Socket.IO realtime between two clients, 20 concurrent clients, an application
restart and a persistence check.

What genuinely needs the internet (and is optional everywhere):

| Feature | Behaviour without internet |
|---|---|
| AI question generation | Falls back to a generated mock set; never an error |
| AI option images | Falls back to plain-text options |
| RAG retrieval | Fully local; only answer synthesis needs a provider |
| Google Fonts | The system font stack is used instead |
| Setup-wizard CDN probe | The four vendored hosts answer instantly; the one remote probe aborts after 4 s and the endpoint still returns 200 |

Nothing in the exam, results, games, console or audit paths calls out.

---

## 4.1 Do I need a "LAN Realtime Server"?

**No. There is no such thing to install.**

Socket.IO is attached to the **same HTTP server** that serves the pages, the
API and the console (`src/backend/server.js` → `initSocketServer`). There is
no `realtime-server` process, no second npm script, and no second port. On a
LAN installation the one server you already run **is** the realtime server:

```
┌─────────────────────────────────────────────┐
│  node src/backend/server.js   (port 3000)   │
│                                             │
│   /            the pages                    │
│   /api/v1      the REST API                 │
│   /console     the control center           │
│   /socket.io   the realtime channel  ◄─────┤── same process, same port
└─────────────────────────────────────────────┘
```

The legacy settings modal had a switch labelled **"LAN Realtime Server"**, and
it is worth being precise about what it did: it never started a server. It
decided whether the *administration panel* used the shared socket — whether it
broadcasted updates and listed the connected devices. Turning it off stopped
that; it deliberately did **not** disconnect the socket, because that socket
is shared with the whole application (the comment in the legacy code says so).

The control center keeps the switch under the honest name **"Use this session
for realtime broadcasts"** (`#/settings?section=realtime`), together with the
device registry and every broadcast action. The channel authenticates with
the signed-in session, so there is no shared secret to configure either.

What a classroom installation *does* need is the firewall rule, which the
console prints for you under **Setup & diagnostics**:

```powershell
New-NetFirewallRule -DisplayName "Quiz Portal 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
```

---

## 5. The offline package

`scripts/generate-offline-bundle.mjs` (run on an internet machine) packs every
npm dependency and the Prisma engines into `vendor/offline/`.
`npm run offline:package` then produces `dist/quiz-app-v4-offline.zip` with
the application, the bundled dependencies and a bundled `mkcert`, so the
target machine never needs npm or a registry.

> **The offline bundle is stale.** It was generated on 2026-09-25, before
> `pdfkit`, `docx`, `mammoth`, `pdf-parse`, `fontkit` and `jszip` were added to
> `package.json`. `npm ci --offline` against the current lockfile will fail.
> **Regenerate the bundle before shipping an air-gapped installation:**
>
> ```bash
> node scripts/generate-offline-bundle.mjs
> npm run offline:package
> ```

---

## 6. PostgreSQL

**Not supported by the current migration history.** This is a deliberate,
documented limitation, not an oversight:

- `prisma/schema.prisma` pins the datasource to `provider = "sqlite"`.
  Prisma bakes the provider into the generated client; a `postgresql` URL
  against a SQLite client fails at the first query.
- All 22 migrations are SQLite SQL: `TEXT` / `INTEGER` / `DATETIME` column
  types (PostgreSQL has no `DATETIME`), `PRAGMA foreign_keys` toggles, and
  table-rebuild `RENAME TO` patterns.
- Every structured column is a `String` holding JSON, because SQLite has no
  `Json` type. A PostgreSQL port would either need a `jsonb` rewrite or a
  deliberate decision to keep text columns.
- Prisma's `contains` is **case-insensitive on SQLite and case-sensitive on
  PostgreSQL**. Around twenty search paths (the console's organization and
  user search, the audit and security-event search, the repository's
  `SEARCH_FIELDS`) would silently change behaviour without
  `mode: 'insensitive'`.

A PostgreSQL deployment therefore requires a **parallel migration tree** — a
fresh baseline generated from the schema, not a rewrite of the deployed
history. That work has not been done, and no PostgreSQL migration has been
verified in this environment.

**What is supported today:** the multi-tenant platform runs on SQLite, on one
node, with real tenant isolation. `docker-compose.yml` deploys exactly that.

---

## 7. Security notes for an operator

| Concern | Where it lives |
|---|---|
| Which files the server publishes | `src/backend/staticAssets.js` — an explicit allow-list plus a denylist. Verify with `node scripts/verify-static-exposure.mjs` |
| The live database, the schema, the migrations, the source | Not served. `express.static('./')` was removed |
| Cross-tenant access | `src/backend/middleware/permission.js` — scope + permission, enforced server-side on every console route |
| The audit trail | `audit_logs` (administrative actions, with an outcome and a severity) and `security_events` (authentication and access events) |
| Failed sign-ins | Persisted in `security_events`, grouped by source address and attempted username on the console's Audit page |
| Password storage | bcrypt, cost from `BCRYPT_ROUNDS`; legacy `simple-` and SHA-256 hashes are transparently upgraded on the next successful sign-in |
| Refresh tokens | SHA-256 hashed at rest, rotated on every use, single live session per account, revocable by an administrator |

The session and refresh-token cookie is `httpOnly` + `sameSite: strict`. The
`Secure` attribute follows the actual transport (`COOKIE_SECURE` /
`TLS_ENABLED`), not `NODE_ENV` — deriving it from `NODE_ENV` silently broke
every session on a plain-HTTP LAN.

---

## 8. Where each role lands

The three roles live in three different surfaces. The entry page (`/`) is
always the sign-in form; an existing session is offered as an explicit
**Continue** choice, never applied as a silent redirect.

| Role | Lands on | Surface |
|---|---|---|
| Student | `/student-workspace.html` | Learning, assessments, games |
| Teacher | `/admin.html` | The classroom workspace: authoring, classes, results |
| Administrator / Platform administrator | `/console` | The control center: organizations, accounts, access, audit, health |

The classroom surface keeps a **Classroom** link back to the console, so
content authoring and governance stay one click apart without either one
importing the other.

---

## 9. Verifying a deployment

```bash
# Static exposure — nothing sensitive is published, every asset is.
node scripts/verify-static-exposure.mjs http://<host>:3000

# Offline / LAN behaviour with the network blocked.
node scripts/offline-lan-validation.mjs

# Multi-tenant behaviour.
node scripts/saas-validation.mjs

# The teacher session still works.
node scripts/teacher-regression-shot.mjs

# The whole test suite.
npm test
```

> The two validation scripts migrate and seed **their own** SQLite database
> under `prisma/` and delete it when they are done, so running them never
> touches the deployment's data.


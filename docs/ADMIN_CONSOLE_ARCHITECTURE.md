# Admin Console Architecture

The console at `/console` is the platform's administration surface. It is a
standalone single-page application: it does not share a page, a bundle or a
navigation model with the classroom surface at `/admin.html`.

```
console.html                    the entry document (nothing but a boot screen)
public/console-bundle.js        the built application   (esbuild, IIFE)
public/console-bundle.css       the design system
```

---

## 1. Why a separate application

`admin.html` is a 503 KB combined teacher + school-admin page with 50+
scripts and a flat tab switcher. The teacher session's analytics were built
inside it and must not be disturbed. The console needed a different shape:
permission-aware routing, a scope badge, a read-model-driven data layer and a
different visual language.

Rather than bolt seven more modules onto that page, the console was built as
its own application that **links into** the classroom surface. Content
authoring (questions, exams, courses, games) stays where it is; governance
(who, where, how healthy, what changed) lives in the console.

---

## 2. Layers

```
src/frontend/console/
  main.js          boot: resolve the session, build the shell, start the router
  core/
    api.js         fetch wrapper: bearer token, single-flight refresh, ApiError
    store.js       session, permissions, deployment mode, period
    router.js      hash router with permission-aware guards
    shell.js       sidebar, header, scope badge, theme toggle
  viz/
    charts.js      dependency-free inline SVG chart kit (12 chart types)
  components/
    ui.js          toast, modal, confirm dialog, formatting helpers
    table.js       dense data table with sorting and server-side pagination
    filters.js     period chips, search fields, selects
    states.js      loading / empty / error states
  pages/
    overview.js        the platform control center
    organizations.js   the tenant list
    users.js           accounts and access
    analytics.js       platform-wide adoption and engagement
    audit.js           administrative actions + security events
    health.js          service health
    settings.js        roles, permissions, deployment, session scope
    details/
      organization.js   one organization: profile, accounts, usage, history
      user.js           one account: access, activity, actions
```

### Build

```bash
npm run build:console     # → public/console-bundle.js + .css
```

`scripts/build-console.js` is a thin esbuild wrapper. Unlike the student
bundle there is nothing to concatenate: the console is written as ES modules
from the start.

---

## 3. The data flow

```
page ──► api.js ──► /api/v1/console/*  ──►  middleware  ──►  service  ──►  Prisma
                     (Bearer token)       requireAuth        read model     (server-side
                                         resolveScope       (aggregates)   aggregation)
                                         requirePermission
                                         requireActiveAccount
```

**The server aggregates; the client renders.** No page computes a KPI from a
row dump. The read models are:

| Service | Answers |
|---|---|
| `PlatformAnalyticsService` | What is happening, how is it growing, who is active |
| `AuditQueryService` | Who did what, when, with what outcome |
| `SystemHealthService` | Is it healthy, and what is broken |
| `RoleService` | What may this caller do |
| `AdminActionService` | Carrying out an administrative change |

---

## 4. Scope and permissions

Two independent ideas, kept apart on purpose.

**Scope** — *which slice of the data*:

| Scope | Who | Sees |
|---|---|---|
| `platform` | `super_admin` | Every organization; may narrow to one with `?school_id=` |
| `school` | `admin` | Exactly its own organization; cannot widen |
| `class` | `teacher` | Its own assigned classes |

**Permission** — *which capability*: a dotted id from
`src/shared/permissions.js` (25 permissions in three scope groups:
`platform.*`, `school.*`, `class.*`).

The role map is the enforcement default. `UserPermissionOverride` rows add a
single permission (grant) or remove one (deny) for one account, optionally
limited to one organization.

`resolveScope` derives the scope from the **signed token**, never from a query
parameter. A query parameter can only NARROW a platform request.

### Middleware

| Middleware | Responsibility |
|---|---|
| `requireAuth` | Verify the JWT, attach `req.user` |
| `resolveScope` | Derive `req.scope` from the token |
| `requirePermission(permission, { allow })` | Check the role map + DB overrides |
| `requireActiveAccount({ allowSuspendedOrganization })` | Re-read the account and its organization |
| `resolveTargetSchool(req, requested)` | Resolve the organization a request targets, refusing to widen it |

`requireActiveAccount` exists because an access token lives up to 15
minutes: without it, a suspension would take that long to bite. The
`allowSuspendedOrganization` option keeps the organization-management routes
reachable while an organization is suspended — otherwise an organization
administrator could never restore it, and a single-organization installation
would be bricked by its own suspension.

---

## 5. Deployment mode in the console

The console reads `deployment` from `/console/session` and uses it to label
its scope and frame its copy:

| | Offline | SaaS |
|---|---|---|
| Scope badge | "Local installation" | "Platform scope" |
| Sidebar subtitle | "This installation" | "All organizations" |
| Organizations page | "Every organization hosted on this installation" | "Every organization on the platform" |

It never changes what the caller may reach. The permission model is identical
in both modes.

---

## 6. The chart kit

`src/frontend/console/viz/charts.js` is a port of the teacher session's
`teacher-analytics.js`, with the `ta-` class prefix renamed to `ac-` and the
tones re-pointed at the console's design tokens.

It is dependency-free inline SVG: no chart library, no canvas. Every figure
carries an `aria-label`, every mark carries a `<title>` tooltip, and a `null`
value renders as "no data" rather than zero — a missing measurement must
never look like a zero.

Available: `lineChart`, `barChart`, `stackedBarChart`, `groupedBarChart`,
`columnChart`, `histogram`, `donut`, `ring`, `heatmap`, `sparkline`, plus the
`panel` / `stat` / `legend` / `empty` chrome.

---

## 7. The API

All under `/api/v1/console`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/session` | Who the caller is, their scope, their permissions, the deployment mode |
| GET | `/roles` | The role catalog and the permission catalog |
| GET | `/permissions` | The caller's effective permissions |
| GET | `/permissions/overrides` | The caller's permission overrides |
| GET | `/overview` | The control-center read model |
| GET | `/workbench` | The administrator's workbench (access, documents, notes, planning, maintenance) |
| GET | `/trends` | Time series for the charts |
| GET | `/organizations` | The organization table |
| GET | `/organizations/:id` | One organization in full |
| PATCH | `/organizations/:id` | Lifecycle status or profile |
| GET | `/users` | The account table (`role` may name several roles) |
| GET | `/users/:id` | One account in full |
| PATCH | `/users/:id` | Status or role |
| POST | `/users/:id/credential` | Reset the credential (bcrypt, revokes sessions, audited) |
| POST | `/users/:id/permissions` | Grant or deny a permission |
| DELETE | `/users/:id/permissions/:permission` | Remove an override |
| DELETE | `/users/:id/sessions` | Revoke every session of an account |
| POST | `/notes` | Send a note to a teacher |
| GET | `/audit` | Administrative actions (`stream=actions`) or security events (`stream=security`) |
| GET | `/audit/summary` | Counts, facets, failed-sign-in sources |
| GET | `/health` | Availability, latency, database, storage, realtime, scheduled work |

Every one of them validates scope and permission server-side.

---

## 8. What the console deliberately does NOT do

- **It does not aggregate student identities into a platform view.** The
  Overview and Analytics pages report organization and class aggregates.
  Individual students appear only in Users & Access, and reaching one is an
  explicit administrative action.
- **It does not fake a metric.** A measurement that cannot be made is
  reported as unavailable, with the reason. The availability figure on the
  Health page says plainly that it comes from a process-local log.
- **It does not present "no data" as "zero".** Every chart, KPI and table has
  an explicit empty state.
- **It does not duplicate the classroom surface.** Content authoring stays in
  `/admin.html`; the console links to it.

---

## 9. The administrator's workbench (Overview)

The Overview is shaped like the administrator's day, not like the database.
Nine responsibilities, nine panels, each backed by a real read model:

| Responsibility | What it answers | Source |
|---|---|---|
| **Control** | What does this installation look like right now? | `PlatformAnalyticsService.getOverview` |
| **Access** | Who is waiting for access to be granted? | `getWorkbench` → `access` |
| **Credentials** | Which accounts were provisioned but never used? | `getWorkbench` → `access.unusedCredentials` |
| **Maintenance** | Is it healthy, and what has been done lately? | `getWorkbench` → `maintenance` + `SystemHealthService` |
| **Activity** | Are the teachers and the students actually working? | `getOverview` → `glance` |
| **Analytics** | How is usage moving? | `getOverview` + `getTrends` |
| **Documents** | What has been produced? | `getWorkbench` → `documents` (GeneratedDocument) |
| **Notes** | What has been said to the teachers? | `getWorkbench` → `notes` (TeacherMessage) + `POST /console/notes` |
| **Planning** | What is coming up? | `getWorkbench` → `planning` (assignments, exams, year archives) |

The "notes" panel reuses the platform's existing `TeacherMessage` mechanism
rather than inventing a second messaging system, and the console can post a
note through `POST /console/notes`.

**Planning is honest about its limits.** There is no calendar model in the
schema, so the panel shows what actually exists — assignments with a due date,
recent exams, and the year archives — and does not pretend to be a scheduler.

---

## 10. Application settings as a page

The settings are a **page**, not a modal: `#/settings`, with a collapsible
RIGHT-HAND section menu (`components/sectionMenu.js`). Collapsed it is a rail
of icons; expanded it shows the section names. The content column does not
reflow when the menu toggles — the grid column only changes width, so the
operator keeps their scroll position and reading context.

Eleven sections, each bound to real API calls:

| Section | Reads / writes |
|---|---|
| General | the organization profile (`GET/PUT /school/profile`) + the quiz defaults and the appearance keys |
| My profile | `PATCH /users/me`, `POST /auth/change-password` |
| Users & access | the account counts, the pending account requests and the pending profile requests |
| Teacher access | the `teacherAccess` setting (17 switches) |
| Realtime | the realtime keys, the recovery code, the device registry, the broadcast actions |
| Presets | the quiz presets (browser store) + the game presets (`/api/v1/game-presets`) |
| Documents & data | the generated-document registry, the export, the import, the archives, the factory reset |
| Setup & diagnostics | the classroom setup wizard — six steps, `GET /admin/setup/diagnostics` |
| Artificial intelligence | the full AI configuration CRUD |
| Roles & permissions | the role + permission catalog |
| Deployment & session | the deployment mode, the scope, the effective permissions |

Each section is addressable (`#/settings?section=access`), so a section can be
linked to.

---

## 10.1 The setup wizard is a stepper, not a modal

The legacy **Classroom Setup Wizard** was a six-step modal behind
"Settings → Setup". It is now the console's **Setup & diagnostics** section:
the same six steps, in the same order, with the same facts and the same
actions — and the step you are on is in the URL.

| Step | URL | What it does |
|---|---|---|
| Server & network | `#/settings?section=setup&step=server` | The bind address, the port, `NODE_ENV`, the cookie security, the platform and the host name |
| Student access | `…&step=access` | The LAN address the students must use, the QR code, every other address |
| Windows firewall | `…&step=firewall` | The network profile (switch it to Private from here), the inbound rule, the manual checklist |
| Database safety | `…&step=database` | Where the data lives, the path-consistency warning, the backup |
| Offline & CDNs | `…&step=offline` | Which libraries are vendored locally and which are remote |
| Summary | `…&step=summary` | Every check with its verdict, and the manual firewall checklist |

A modal was the wrong shape for it: the console is a page-based application,
and a step whose result is a URL that a support ticket can point at is worth
more than a dialog that closes.

---

## 10.2 The accounting: every legacy control, and where it went

The legacy administration panel held a settings modal with nine tabs. Every
control in it is listed here, with the place it lives now — or the reason it
does not, and what was done instead.

### General → **General** (`#/settings?section=general`)

| Legacy control | Now | Notes |
|---|---|---|
| School name, year, type, city, phone, email, address | General | Same records — the school profile row. `PUT /school/profile`, audited, and broadcast live to every open tab. |
| Quiz defaults (`totalQuestions`, `timeLimit`, `penalty`) | General | Same setting keys. |
| Theme colours (`primaryColor` … `inputFocusColor`), `fontFamily` | General | Same setting keys. |
| `welcomeTitle`, `welcomeMessage` | General | Same setting keys. |
| "Reset defaults" button | **Not carried over** | It replaced every setting with `DEFAULT_SETTINGS`, which would have silently reverted the organization profile, the teacher-access map and the AI configuration as well. The console saves each group explicitly, and the only "restore" action is the **Restore the defaults** button on **Teacher access**, which touches that one setting. |

### My Profile → **My profile** (`#/settings?section=profile`)

| Legacy control | Now | Notes |
|---|---|---|
| Title, full name, email, phone | My profile | `PATCH /users/me`. |
| Change password (current / new / confirm) | My profile | `POST /auth/change-password`. The server verifies the current credential and revokes the other sessions. |
| Role, status, class | **Not editable here** | They were never editable here either — the legacy modal said so. They live on the console's account page (`#/users/:id`), where the change is audited. |

### Users → **Users & access** (`#/settings?section=access`) + the roster pages

| Legacy control | Now | Notes |
|---|---|---|
| The user management table | `#/users/teachers`, `#/users/students`, `#/users/administrators` | Split by population. One table of every account, with a search box, was the reason the old list was unusable. |
| **Add User** | **Add an account** on every roster and on the hub | `POST /console/users`. The account is created in the caller's organization; a platform administrator may name another one. The password is hashed with bcrypt and never returned. |
| Edit an account | The account page (`#/users/:id`) | Suspend / reactivate, change the role, grant or deny a permission, revoke the sessions, reset the credential, **delete the account**. |
| Delete an account | The account page | `DELETE /console/users/:id`. Deliberately separate from "suspend": suspending ends the access and keeps the record, deleting removes the person. An administrator cannot delete their own account. |
| Profile & Account Requests | Users & access | `GET /profile-requests`, `GET /account-requests`, with approve and reject. Granting access is what this page is about. |
| Pending Imports | **Stays in the classroom surface** | It is a teaching-time tool (a teacher importing a roster into their own class), not a governance one. It is still in the classroom panel's settings modal, where the teacher already is. |

### Teacher Access → **Teacher access** (`#/settings?section=teaching`)

| Legacy control | Now | Notes |
|---|---|---|
| The 8 dashboard-tab switches | Teacher access | Same keys, same `teacherAccess` setting (revision 4), same JSON shape. The classroom surface reads it without a migration. |
| The "Settings Modal" switch | Teacher access | Same. |
| The 8 settings-tab switches | Teacher access | Same. |
| Activity / Monitoring switches | **Not offered** | Neither had a switch in the legacy modal: the activity log is administrator-only and the monitoring view has been removed from the classroom surface. The activity flag is forced off server-side and in the client. |

### Realtime → **Realtime** (`#/settings?section=realtime`)

**The "LAN Realtime Server" question, answered.** There is **no separate
realtime server**. Socket.IO is attached to the same HTTP server that serves
the pages and the API (`src/backend/server.js` → `initSocketServer`); there is
no `realtime-server` process and no npm script that starts one. On a LAN
installation the one server you already run **is** the realtime server — same
port, same process, no extra installation.

The legacy "LAN Realtime Server" switch therefore never started a server.
What it did was decide whether the administration panel **used** the shared
socket: turning it off stopped the broadcasting and the device list, and
deliberately did **not** disconnect the socket (the legacy code says so in a
comment), because that socket is shared with the whole application.

| Legacy control | Now | Notes |
|---|---|---|
| "LAN Realtime Server" switch | Realtime | Renamed **"Use this session for realtime broadcasts"** — the same switch, described for what it does. |
| Server host / port + "Test Connection" | Realtime | The channel always connects to the address the page was served from, so the host is only a fallback for the classroom panel. The console says that. "Test connection" is kept and now really tests the socket. |
| Recovery code | Realtime | `POST /auth/recover/set`. The code is stored as a server-side hash and is never sent back to a browser. |
| Connected devices + count, Refresh, Show Online Only | Realtime | The registry comes from `GET /devices`; the live roster arrives over the socket (`clients:update`). |
| Sync All Data | Realtime | `admin:refreshStudentBootstrap` + `admin:syncUsers` + `admin:syncGamification`. |
| Sync User Accounts | Realtime | `admin:syncUsers`. |
| Sync My Classroom Data | Realtime | `admin:refreshStudentBootstrap`. |
| Sync Regular + Kids Games | Realtime | `admin:syncGames` + `admin:syncKidsGames`. |
| Auto-Sync Results, Broadcast Updates, Auto-Sync Questions, Sync Interval | Realtime | The same setting keys. |
| "Realtime access" note ("no secret to enter") | Realtime | The statement holds and is now in the console: the channel authenticates with the signed-in session, there is no shared secret. |

### Presets → **Presets** (`#/settings?section=presets`)

| Legacy control | Now | Notes |
|---|---|---|
| Quiz presets (add / edit / delete / apply) | Presets | They live in the browser's `localStorage` and the console shares the origin, so it reads and writes the **same** store. The editor carries **all seventeen fields** of the legacy editor — the same names, the same defaults — so a preset created in one place is understood by the other. |
| The training preset | Presets | The `trainingPresetId` setting. |
| Game presets (add / edit / delete / default) | Presets | Server-backed (`/api/v1/game-presets`) — they belong to the organization, so they are administered in the console. Full CRUD. |

### Data → **Documents & data** (`#/settings?section=documents`)

| Legacy control | Now | Notes |
|---|---|---|
| Recent documents | Documents & data | The registry, **with the folder and a clickable file**: the title opens the document at its public URL, the folder column shows its path, and a Download button hits the download endpoint. |
| Export JSON | Documents & data | **Changed, and better.** The legacy export wrote the *browser cache* — the localStorage of whichever computer the administrator happened to be at. The console exports the **database** rows of the organization (`GET /console/export`), scoped to the caller's organization. |
| Export ZIP | Documents & data | The same snapshot, packaged by the existing `POST /exports/bundle`, which also carries the uploaded media. |
| Import JSON / ZIP | Documents & data | A JSON file is applied through the bulk endpoints; a ZIP is staged by `POST /imports/bundle`, its media restored by `POST /imports/bundle/commit`, and its records applied the same way. |
| Import device data | **Stays in the classroom surface** | It writes to the **browser cache** of the machine that runs it — `localStorage` results, exams, questions, classes — and never touches the server. A copy of it in the console would merge a device's data into the administrator's own browser and nothing else, which would look like it worked and change nothing. It stays in the classroom panel, where the teacher actually uses it. |
| Import AI-generated questions | **Stays in the classroom surface** | It creates the module/chapter tree and the questions — a content-authoring operation. It remains in the classroom panel, where the question bank is. |
| School-year archives (create / open / delete) | Documents & data | The same `GET/POST/DELETE /archives` endpoints. |
| Factory reset | Documents & data | `POST /admin/reset-data` with the `confirm: 'RESET'` guard. Tenant-scoped: no other organization is touched. |
| Activity log entries written by the backup | **Not carried over** | It appended "Exported backup …" rows to the *browser's* activity log. The console writes to the durable audit trail instead, which is where an action belongs. |
| The per-store export picker | **Simplified** | The picker let the operator choose which stores to put in a backup. The console exports the whole organization in one file: a backup that silently omits the questions, or the results, because a box was unticked, is worse than no backup. |

### Setup → **Setup & diagnostics** (`#/settings?section=setup`)

The classroom setup wizard is here, as a stepper — see §10.1.

| Legacy control | Now | Notes |
|---|---|---|
| The setup wizard's summary | Setup & diagnostics | `GET /admin/setup/diagnostics` — the same facts, measured. |
| The reachable addresses | Setup & diagnostics | The LAN interfaces, the recommended one first. |
| The student QR code | Setup & diagnostics | Kept, using the same vendored generator. |
| The firewall commands | Setup & diagnostics | Kept, with a copy button. |
| The Windows network profile | Setup & diagnostics | `POST /admin/setup/network-profile`. |
| Download Backup | Setup & diagnostics | The same database snapshot as the export. |
| The manual firewall checklist | Setup & diagnostics | Kept, and it feeds the Summary step. |

### AI Generation → **Artificial intelligence** (`#/settings?section=ai`)

| Legacy control | Now | Notes |
|---|---|---|
| The provider list (6 providers) | Artificial intelligence | The same list, including **Custom / Local** for an Ollama or LM Studio server on the local network. |
| The API key | Artificial intelligence | Encrypted on the server (AES-256-GCM), never returned to a browser. The list shows a four-character hint only. |
| The base URL (custom provider) | Artificial intelligence | Shown only for the custom provider. |
| "Load models (live)" + the filter | Artificial intelligence | `POST /ai/models/refresh`, with the same live list and the same filter box. |
| "Test connection" | Artificial intelligence | Kept. |
| "Expose selected to teachers" | Artificial intelligence | The same publish action — each selected model is created with `shared: true`. |
| The shared-model catalogue | Artificial intelligence | Listed, with Test and Delete. |
| "Your own model (private to you)" | Artificial intelligence | Created with `shared: false`, so it belongs to the person who registered it. |
| The model list of a personal model | Artificial intelligence | Listed, with Test and Delete. |
| The question-structure guide | **Stays in the classroom surface** | It documents the format the AI question generator must output. It sits with the generator, where it is read. |
| "Save & use it now" | **Not carried over** | "Use it now" set the browser's current model choice. In the console the current model is chosen where the content is generated, not in a settings page. Saving is carried over. |

### Roles & permissions → **Roles & permissions** (`#/settings?section=roles`)

New in the console. The roles and the permission catalog are read from
`GET /console/roles`. They are the code's enforcement default, so they are
**not** editable here — what an administrator changes is the per-account
override, on the account page.

### Deployment & session → **Deployment & session** (`#/settings?section=deployment`)

New in the console. It reports the deployment mode, the database provider, the
scope and the effective permissions. The mode is decided by the environment
when the server starts, so there is deliberately **no switch**: a runtime
toggle would leave the server running in the old mode while the screen claimed
otherwise.

---

## 11. Users & Access — three rosters

The account list is split into the populations they actually serve. Mixing
them in one table is what made the old list unusable.

| Page | Population | Offline | SaaS |
|---|---|---|---|
| `#/users/teachers` | The teaching staff | teacher accounts | teacher accounts |
| `#/users/students` | The enrolled pupils | student accounts | student accounts |
| `#/users/administrators` | The people who can administer | the school's director | the directors **and** the platform administrators, labelled |

`#/users` is the hub: the counts, the "never signed in" warning, and the three
cards.

### 11.1 Every record-holding list carries full CRUD

The rosters and the Organizations page offer the same strip of row actions —
**Open · Suspend/Reactivate · Edit · Delete** — rendered by one shared
component (`components/actions.js`), wired with one delegated listener per
table. The creation dialogs are shared too: `POST /console/users` (rosters)
and `POST /console/organizations` (platform scope only).

The Organization delete is the most destructive act in the console, so it
requires an explicit `confirm: "DELETE"` in the request body, is refused for
the organization the caller is signed into, and is audited with `critical`
severity. **The junction tables (`exam_questions`, `exam_classes`) carry no
`school_id` — they are scoped through their parent exam. Any delete of an
organization must resolve that organization's exam ids first and scope the
junction removal with `exam_id IN (…)`. A blanket `deleteMany({})` strips
every other organization's exam links** — this was a real bug, caught by the
create→link→delete round trip, and both the console route and the legacy
factory reset now scope it.

### 11.2 The Back button

The header offers a Back control whenever there is somewhere to go: the page
the operator actually came from, or — when the console was opened directly on
a deep link — the parent page (a roster → the hub, a detail → its list). The
console keeps its own trail in `core/router.js`; switching a section *inside*
one page (the settings menu, the setup stepper) replaces the trail entry with
`replace: true`, so Back walks between PAGES, never between sections.

---

## 12. Where each role lands after signing in

The three roles live in three different surfaces. The entry page routes by
role, and the classroom surface routes administrators to the console:

| Role | Lands on |
|---|---|
| Student | `/student-workspace.html` |
| Teacher | `/admin.html` — the classroom workspace |
| Administrator / Platform administrator | `/console` — the control center |

The entry page **always shows the sign-in form**. When the browser already
holds a session it is offered as an explicit **Continue** choice, never
applied as a silent redirect — otherwise there would be no way to sign in as
somebody else.

The classroom surface keeps a **Classroom** link back to the console, so
content authoring and governance stay one click apart without either one
importing the other. In the other direction, the classroom surface carries a
**Control Center** link in its header and in the profile menu, shown only to
the administrator roles (`data-roles="admin,super_admin"`) — a teacher has no
access to the console, and offering the link would be a dead end.

---

## 12.1 Which surface owns the settings

**The settings are not "the same feature in two places". They are two
different audiences, and the console cannot serve both.**

The console is reachable by the **administrator roles** only (`school.console`
/ `platform.console`). A teacher cannot open it — the console shows
organizations, the audit trail and the platform health, none of which are
the teacher's business.

So the settings split by audience, not by duplication:

| Setting | Console | Classroom modal | Why |
|---|---|---|---|
| Organization profile | ✅ | — | Governance. The console owns it. |
| Quiz defaults, appearance | ✅ | ✅ (same keys) | Both write the same setting keys, so they agree. |
| My profile | ✅ | ✅ | An administrator edits their own profile in the console; a **teacher** edits theirs in the classroom panel, because they cannot reach the console. |
| Teacher access | ✅ | — | Governance. Admin-only. |
| Users & access | ✅ | — | Governance. |
| Realtime (the broadcast switches) | ✅ | ✅ | An administrator broadcasts to the whole organization; a **teacher** pushes games and exams to their own class. Both need it. |
| Presets | ✅ | ✅ | A teacher's quiz presets are theirs; the console edits the same browser store, because they are shared. |
| Documents & data (export / import / archives / reset) | ✅ | ✅ (teacher-scoped parts) | The console does the organization-wide export, the import and the reset; a **teacher** exports and imports **their own** data from the classroom panel. |
| Setup & diagnostics | ✅ (wizard) | ✅ (wizard) | The same facts. An administrator runs it from the console; a teacher on a classroom machine runs it from the panel. |
| Artificial intelligence | ✅ | ✅ | An administrator publishes the shared models; a **teacher** registers a personal one. |
| Quick Start | — | ✅ | It is a **first-run** experience, not a setting. See below. |

**So: do not delete the classroom settings modal.** Removing it would take
away the teacher's profile, their presets, their own data export and their
classroom sync — four things a teacher genuinely needs and cannot get
anywhere else.

What *can* be removed from the classroom modal is the part that is
administrator-only and now duplicated: the **Teacher Access** tab and the
**Setup** tab. They are the two tabs an administrator no longer needs there,
because the console owns them.

**And they have been removed** — see §13. What is left in the classroom
modal is exactly the teacher's share of the settings, plus a Control Center
link for the administrator.

### The first-run experience is not a setting

On a **fresh installation**, the application shows the **Quick Start wizard**
(`quick-start.js`): it appears automatically the first time an administrator
signs in to an *empty* instance — no classes, no students, no questions, no
exams, no games — and the `quizSetupComplete` marker is absent. It walks
through the school identity and credentials, the classes, the students, the
teachers, the categories, the questions, the exams, the games and the finish.

It stays in the classroom surface, and it must: each of its steps opens the
**classroom create-modal** for that entity (`createNewClass`,
`openUserModal`, `createNewCategory`, `openQuestionFormModal`,
`createNewExam`, `openGameEditorModal`). Those are content modals, and the
console does not own content authoring.

Skipping it (or "Later") marks the setup complete, so it never nags again.
It is reopenable any time from **Settings → Data → "Run Quick Start"**.

**The Classroom Setup Wizard does NOT auto-show.** It is opened deliberately,
from Settings → Setup — or, now, from the console's Setup & diagnostics
section.

---

## 13. What was removed from the classroom surface

The classroom surface (`admin.html`) is the content-authoring surface. Five
things were taken out of it, each with a reason:

| Removed | Why | What replaced it |
|---|---|---|
| The **Monitoring** tab (and `server-monitoring.js`) | It showed the server-wide request log, which carried the usernames, roles and source addresses of every user. It duplicated the console's System Health page, and it was the surface the audit had already flagged. The endpoint `/admin/metrics` remains, administrator-only and organization-scoped. | The console's **System Health** page, which reports the same facts without exposing the request log to the classroom surface. |
| The **Monitoring** entry in the teacher-access map | The tab it unlocked is gone. | The activity log stays administrator-only, forced off in the client and on the server. |
| The **Teacher Access** settings tab | It was administrator-only, and the control center now owns that map (`#/settings?section=teaching`) — with the audit trail recording every change. | The console's **Teacher access** section. The classroom surface still READS the map and enforces it. |
| The **Setup** settings tab and `setup-wizard.js` | The classroom setup wizard moved to the console, where it is a six-step stepper. | The console's **Setup & diagnostics** section (`#/settings?section=setup`). |
| The silent redirect on the entry page | It made the sign-in form unreachable and left no way to sign in as somebody else. | The entry page always shows the form, with an explicit **Continue** for an existing session. |

The remaining tabs — Overview, Subjects, Questions, Exams, Classes, Results,
Games, Notifications and Classroom Devices — are the teaching surface, and
they stay.

### The settings modal that stays, and why

The classroom settings modal keeps **General, My Profile, Presets, Data,
Realtime, AI Generation and Users** — the settings a *teacher* needs — plus a
**Control Center** link that points administrators at the console.

It was not deleted, because the console is administrator-only and these are
teacher's settings: their own profile, their quiz presets, their own data
export and import, the classroom realtime actions that push games to their
own students, and their own personal AI model. Removing the modal would take
those away with nothing to replace them.

The two administrator-only tabs it used to carry — Teacher Access and Setup —
were the duplication, and they are the two that were removed.

### The one thing that must not be written from two places

The **teacher-access map** is written by the console only. The classroom panel
used to write it too, which meant a stale local copy could overwrite the map
the console had just saved — the two surfaces would fight over one setting.
The classroom panel still READS it (it enforces it) and still keeps it in the
local cache as an offline fallback, but it no longer writes it.




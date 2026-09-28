# Audit: In-Memory / LocalStorage State Bypassing the Database

> Generated 2026-08-26 in response to user request: *"I want my app to work with my database fluently and without issue but respect roles of users."*

## Scope and methodology

Two architectural patterns to flag before anything else:

- The project has **two server entry points**:
  - `src/backend/server.js` — the proper Prisma-backed REST + Socket.io SaaS server (the canonical backend).
  - `server.js` (root) — a separate legacy Express+Socket.io process that **does NOT touch Prisma** and is wired to the same `game-server.js`. Both are loaded by the root `package.json` start scripts. The legacy `server.js` is the primary source of stateful out-of-sync issues.
- The legacy admin panel writes directly to `localStorage.quiz*` and broadcasts via socket; only some entities are mirrored to Prisma via REST.

The audit covers six areas:
1. Server-side in-memory state that bypasses Prisma.
2. Client-side state that bypasses REST.
3. REST endpoints defined but never called from the client.
4. Role gates that are too restrictive (`requireRole(ROLES.ADMIN)` that should allow TEACHER).
5. Role gates that are too permissive (any authenticated user can do something admin-only).
6. Consolidated file:line inventory of issues.

---

## 1. Server-side in-memory state that bypasses Prisma

### 1A. `server.js` (root legacy server) — entire file is non-Prisma

| Line | Symbol | Data held | Also in Prisma? | Divergence risk |
|------|--------|-----------|-----------------|-----------------|
| 83 | `const clients = {}` | socketId → { ip, deviceId, name, lastSeen, status, data (full localStorage dump) } | No (transient presence) | Low (presence only) but `data` is the client's entire localStorage — actively propagates stale state. |
| 84 | `let lastPushedSession` | Last `admin:pushSession` payload | Yes (`ExamSession`) | High — server replays stale session to any new client connect. |
| 85 | `let lastSyncedUsers` | Last `admin:syncUsers` payload | Yes (`User`) | High — bootstrap fallback returns admin-localStorage snapshot, not DB. |
| 86 | `let lastSyncedGamesGlobal` | Last `admin:syncGames` payload | Yes (`Game`) | **Critical** — entire game cache held in memory; on server restart, in-flight lobbies vanish. |
| 87 | `let lastSyncedGamesByTeacher` | teacherId → payload | Yes (`Game`) | High — teacher-scoped game state lives only here. |
| 88 | `let lastSyncedGamification` | Last gamification + active tournament | Yes (`GamificationConfig`, `Tournament`) | High — admin sync writes here, students read from here. |
| 89–90 | `lastSyncedUsersFingerprint` / `lastSyncedUsersBroadcastAt` | Dedup helpers | n/a | Used as input to L85. |
| 419–495 | `student:syncStoredData` | Mutates `lastSyncedUsers` with student-supplied patch (exp, badges, tournamentScores) | Yes (`User`) | **Critical** — any connected student can patch the cached `users` array, which the server rebroadcasts to all admins. No DB write, no auth, no validation. |
| 497–537 | `student:updateTournament` | Mutates `lastSyncedGamification.quizTournamentActive` | Yes (`Tournament`) | **Critical** — any student can overwrite the active tournament. |

### 1B. `game-server.js` (in-memory lobby state)

| Line | Symbol | DB table | Divergence risk |
|------|--------|----------|-----------------|
| 2467 | `activeGames = new Map()` | `Game` + `GameSession` | **Critical** — every state transition only mutates this map. Server restart drops every active game. |
| 2468 | `playerSockets = new Map()` | n/a | Low (transport). |
| 2469 | `socketPlayers = new Map()` | n/a | Low (transport). |
| 2471 | `playerDisconnectTimers = new Map()` | n/a | Low. |

State transitions that touch only the in-memory map (no Prisma): `game:hydrate` (4148), `game:create` (4178), `game:update` (4198), `game:openLobby` (4227), `game:leave` (4385), `game:ready` (4435), `game:forfeit` (4479), `game:start` (4503), `game:answer`, `game:playCard`, `game:warmupAnswer`, `game:tieBreakAnswer`, `game:deleteAll` (5059), `game:end` (5369), `game:reset` (5387), `game:delete` (5409).

### 1C. `realtime-*.js` — client-side only

The Maps in `realtime-admin.js` and `realtime-client.js` are client-side only (de-dup, merging payloads) but `realtime-settings.js:1094 syncUsersToClients`, L1220 `syncGamesToClients`, L1403 `syncGamificationSettings` push client-localStorage state back to all peers.

---

## 2. Client-side state that bypasses REST

### 2A. `games-management.js`

| Line | Action | Should be |
|------|--------|-----------|
| 2379 | `socket.emit('game:delete', { gameId })` (no REST) | Add `API.remove('games', gameId)` first. **Done in prior turn.** |
| 2457 | `socket.emit('game:deleteAll', ...)` (no REST bulk delete) | Add per-row delete before broadcasting. **Done in prior turn.** |
| 2522 | `socket.emit('game:openLobby', ...)` | Add `API.update('games', gameId, { status: 'waiting' })`. |
| 2581 | `socket.emit('game:start', ...)` | Add `API.raw('POST', '/games/:id/start', {})`. |
| 2747 | `socket.emit('game:end', ...)` | Add `API.raw('POST', '/games/:id/finish', {})`. |
| 3033 | `socket.emit('game:reset', ...)` | Add `API.update('games', gameId, { status: 'waiting' })`. |
| 5124–5142, 5642 | `localStorage.setItem` for `gamePresets` | Wrap in `API.create/update('game-presets', ...)`. |
| 6089, 6661, 9074, 9092, 9130, 9500 | `localStorage.setItem('quizTournamentActive', ...)` | Use `tournaments.routes.js`. |
| 6188 | `localStorage.setItem('quizTournamentsHistory', ...)` | Add a `tournament-history.routes.js` first. |
| 9259 | `localStorage.setItem('quizGamification', ...)` | Use `gamification.routes.js`. |
| 9699–9714 | `localStorage.setItem` for settings | Use `settings.routes.js`. |

### 2B. `exam-management.js`

- L2897, 2924, 3048, 3055 — `socket.emit('admin:pushSession', sessionPackage)` should be preceded by `API.create('exams', ...)`.
- L3000–3002 — `socket.emit('admin:stopExam')` should also call a new `POST /api/v1/sessions/:id/stop`.

### 2C. `auth.js`

- L40, 2864, 2874 — `localStorage.setItem` for `quizUsers`/`quizProfileRequests`/`quizAccountRequests` should use the corresponding REST endpoints.
- L449, 1261, 2087, 2364, 2440, 2742, 2789, 2834 — `window.syncUsersToClients()` publishes the whole users table; eliminate in favor of server-driven broadcast after audit-logged Prisma changes.

### 2D. `admin-main.js`

- L1981 — `localStorage.setItem('quizProfileRequests', ...)` → REST.
- L2123–2126, 2165–2168 — same as 2C.

### 2E. `overview-dashboard.js`

- L373 — `localStorage.setItem('quizOverview', ...)` → compute from `GET /api/v1/bootstrap` instead.

### 2F. `settings.js`

- L444, 736, 781, 811 — `localStorage.setItem('quizSettings', ...)` → REST.
- **L739 — `localStorage.setItem('quizAdminSecret', ...)` must be removed entirely; the admin secret is server-only.**

### 2G. `script.js`

- L823, 1042, 2523, 2650, 2972, 4141–4150 — `localStorage.setItem('examActiveSession', ...)` → use `sessions.routes.js`.

### 2H. `student-workspace.js`

- L9763 — `localStorage.setItem('quizTournamentActive', ...)` → REST.
- L12712 — `localStorage.setItem(getTrainingStorageKey(), ...)` → use `results.routes.js` or `POST /api/v1/bulk/results`.

### 2I. `legacy-bridge.js`

Already correct architecturally — write-through cache for the SaaS REST API. The one gap is the local-only `reconcileGamesFromBootstrap` (L159–196) which is OK because the DB is the source of truth.

### 2J. `src/frontend/ui/pages/entry/EntryPage.js`

- L319 — `localStorage.setItem('quizUsers', ...)` → use `API.list('users')`.

---

## 3. REST endpoints defined but never called from the client

| Endpoint | Defined at | Notes |
|----------|-----------|-------|
| `GET /api/v1/results` | `results.routes.js:13` | Never called — `results-management.js` reads localStorage. |
| `GET /api/v1/results/exam/:examId` | `results.routes.js:24` | Never called. |
| `GET /api/v1/results/:id` | `results.routes.js:33` | Never called. |
| `GET /api/v1/results/exam/:examId/stats` | `results.routes.js:41` | Never called. |
| `GET /api/v1/results/user/:userId/stats` | `results.routes.js:49` | Never called. |
| `GET /api/v1/notifications` | `notifications.routes.js:13` | Never called. |
| `GET /api/v1/notifications/count` | `notifications.routes.js:21` | Never called. |
| `PATCH /api/v1/notifications/read-all` | `notifications.routes.js:28` | Never called. |
| `POST /api/v1/notifications` | `notifications.routes.js:36` | Never called. |
| `GET /api/v1/gamification` | `gamification.routes.js:15` | Never called. |
| `POST /api/v1/tournaments` | `tournaments.routes.js:34` | Never called. |
| `PATCH /api/v1/tournaments/:id` | `tournaments.routes.js:43` | Never called. |
| `POST /api/v1/tournaments/:id/open` | `tournaments.routes.js:60` | Never called. |
| `POST /api/v1/tournaments/:id/close` | `tournaments.routes.js:68` | Never called. |
| `POST /api/v1/tournaments/:id/finish` | `tournaments.routes.js:108` | Never called. |
| `GET /api/v1/tournaments/:id/leaderboard` | `tournaments.routes.js:99` | Never called. |
| `POST /api/v1/sessions` | `sessions.routes.js:55` | Never called. |
| `GET /api/v1/sessions/:id` | `sessions.routes.js:82` | Never called. |
| `GET /api/v1/sessions/active/:examId` | `sessions.routes.js:92` | Never called. |
| `POST /api/v1/sessions/:id/answer` | `sessions.routes.js:102` | Never called. |
| `POST /api/v1/sessions/:id/heartbeat` | `sessions.routes.js:119` | Never called. |
| `POST /api/v1/sessions/:id/submit` | `sessions.routes.js:131` | Never called. |
| `GET /api/v1/games/:id/scores` | `games.routes.js:109` | Never called. |
| `POST /api/v1/games/join` | `games.routes.js:68` | Never called (only socket). |
| `POST /api/v1/games/:id/answer` | `games.routes.js:100` | Never called (only socket). |
| `GET /api/v1/categories/tree` | `categories.routes.js:26` | Never called. |
| `GET /api/v1/classes/:id/students` | `classes.routes.js:34` | Never called. |
| `POST /api/v1/exams/:id/questions` | `exams.routes.js:90` | Never called. |
| `DELETE /api/v1/exams/:id/questions/:qid` | `exams.routes.js:98` | Never called. |
| `PUT /api/v1/exams/:id/questions/order` | `exams.routes.js:106` | Never called. |
| `POST /api/v1/exams/:id/publish` | `exams.routes.js:115` | Never called. |
| `POST /api/v1/exams/:id/archive` | `exams.routes.js:123` | Never called. |
| `POST /api/v1/exams/:id/classes` | `exams.routes.js:132` | Never called. |
| `DELETE /api/v1/exams/:id/classes/:cid` | `exams.routes.js:140` | Never called. |
| `GET /api/v1/exams/:id/classes` | `exams.routes.js:48` | Never called. |
| `POST /api/v1/teacher-messages` | `teacher-messages.routes.js:25` | Never called. |
| `PATCH /api/v1/teacher-messages/:id` | `teacher-messages.routes.js:32` | Never called. |
| `DELETE /api/v1/teacher-messages/:id` | `teacher-messages.routes.js:39` | Never called. |
| `POST /api/v1/teacher-assignments` | `teacher-assignments.routes.js:25` | Never called. |
| `PATCH /api/v1/teacher-assignments/:id` | `teacher-assignments.routes.js:32` | Never called. |
| `DELETE /api/v1/teacher-assignments/:id` | `teacher-assignments.routes.js:39` | Never called. |
| `GET /api/v1/settings/teacher` | `settings.routes.js:35` | Never called. |
| `GET /api/v1/settings/admin` | `settings.routes.js:43` | Never called. |
| `POST /api/v1/settings/bulk` | `settings.routes.js:75` | Never called. |
| `GET /api/v1/users` | `users.routes.js:20` | Never called. |
| `GET /api/v1/users/:id` | `users.routes.js:30` | Never called. |
| `POST /api/v1/users/:id/reset-password` | `users.routes.js:69` | Never called. |
| `POST /api/v1/ai/*` | `ai.routes.js` | Never called. |
| `GET /api/v1/game-presets` | `game-presets.routes.js:18` | Never called. |
| `GET /api/v1/game-presets/defaults` | `game-presets.routes.js:26` | Never called. |
| `POST /api/v1/query/:name` | `query.routes.js:25` | Never called. |

**Missing route** `tournament_history` — add `src/backend/routes/tournament-history.routes.js` and a corresponding Prisma service.

---

## 4. Role gates that are too restrictive

| File:line | Current | Should be | Why |
|-----------|---------|-----------|-----|
| `categories.routes.js:42, 51, 60` | `requireRole(ROLES.ADMIN)` | `requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER])` | Teachers authoring questions need a category to file them under. |
| `exams.routes.js:48, 62, 71, 80, 90, 98, 106, 115, 123, 132, 140` | `requireRole(ROLES.ADMIN)` | Same | Teachers need to author and publish their own exams. |
| `settings.routes.js:35, 43, 51, 62, 75` | `requireRole(ROLES.ADMIN)` | Teacher for `/teacher` and PATCH on teacher-visible keys; keep admin for `/admin`, `adminSecret`, `recoveryCode`, bulk. | Teachers already share the realtime settings panel. |
| `tournaments.routes.js:34, 43` | `requireRole(ROLES.ADMIN)` | Allow TEACHER for create/update; keep admin for `open`/`close`/`finish`. | |
| `ai.routes.js:52, 72, 89, 110, 130, 142` | `requireRole(ROLES.ADMIN)` | Allow TEACHER. | Question authoring is the teacher's core task. |
| `users.routes.js:20, 30, 39, 49, 59, 69` | `requireRole(ROLES.ADMIN)` | `requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN])` | Use array form. |
| `teacher-messages.routes.js:25, 32, 39` | `adminOnly` | Mixed — POST should allow teacher, PATCH/DELETE owner-or-admin. | |
| `teacher-assignments.routes.js:25, 32, 39` | `adminOnly` | Same as above. | |
| `bulk.routes.js:43` | `TEACHER_WRITABLE_TABLES = {'settings'}` | Extend to `['settings', 'game_presets', 'tournaments', 'teacher_messages', 'teacher_assignments']`. | |

---

## 5. Role gates that are too permissive

| File:line | Endpoint | Problem | Fix |
|-----------|----------|---------|-----|
| `notifications.routes.js:36` | `POST /api/v1/notifications` | Any authenticated user can post notifications school-wide. | Add `requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER])`. |
| `results.routes.js:13` | `GET /api/v1/results?userId=…` | A student can pass any `userId` and read that user's results. | Add student → self check. |
| `results.routes.js:49` | `GET /api/v1/results/user/:userId/stats` | Same. | Same. |
| `tournaments.routes.js:76` | `POST /api/v1/tournaments/:id/register` | Any authenticated user can register. | Restrict to students (or block admins). |
| `tournaments.routes.js:86` | `POST /api/v1/tournaments/:id/answer` | No status check; no registration check. | Add both. |
| `tournaments.routes.js:99` | `GET /api/v1/tournaments/:id/leaderboard` | Returns leaderboard for `draft` tournaments. | Filter to `open|active|finished` for non-admins. |
| `tournaments.routes.js:26` | `GET /api/v1/tournaments/:id` | Returns `draft` to anyone. | Same. |
| `games.routes.js:68` | `POST /api/v1/games/join` | Any user can join any game. | Add status + class-scope check. |
| `games.routes.js:100` | `POST /api/v1/games/:id/answer` | No participation check. | Add one. |
| `query.routes.js:25` | `POST /api/v1/query/:name` | Generic dispatcher, no role gate. | Add per-query allowlist. |

---

## 6. Consolidated file:line inventory

See the implementation pass in this commit. **The round-1 fixes (this commit) are: 17 role-gate fixes (4 + 5 above), the games CRUD REST wiring (already done in prior turns), and graceful fallback when REST returns 403.**

The remaining 70+ items (retire `server.js`, persist every `activeGames.set/delete`, move all socket-only CRUD to REST, add the missing `tournament-history` route) are deferred to a future round — they require a larger refactor that should be planned separately and likely paired with a database migration.

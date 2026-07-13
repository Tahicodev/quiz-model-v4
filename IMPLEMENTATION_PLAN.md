# Quiz Application — Complete Implementation Plan

> **Goal:** Take the project from its current state to production-ready.
> **Audience:** AI coding model or developer continuing the work.
> **Branches:** `feature/frontend`, `feature/backend`, `feature/admin`, `feature/realtime`, `feature/ai` → `feature/rewrite-v4` → `main`

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Current State](#2-current-state)
3. [Branch Strategy](#3-branch-strategy)
4. [Phase 1: Admin Dashboard (`feature/admin`)](#4-phase-1-admin-dashboard)
5. [Phase 2: Frontend Realtime UI (`feature/realtime`)](#5-phase-2-frontend-realtime-ui)
6. [Phase 3: AI Features (`feature/ai`)](#6-phase-3-ai-features)
7. [Phase 4: Integration & Merge (`feature/rewrite-v4`)](#7-phase-4-integration--merge)
8. [Phase 5: Production Hardening](#8-phase-5-production-hardening)
9. [Phase 6: Tests & CI](#9-phase-6-tests--ci)
10. [File-by-File Checklist](#10-file-by-file-checklist)
11. [Reference: Master Prompt Phase Mapping](#11-reference-master-prompt-phase-mapping)

---

## 1. Project Architecture

```
quiz-app/
├── prisma/                          # Database schema + migrations
│   ├── schema.prisma                # Single source of truth
│   ├── seed.js                      # Default admin + school + settings
│   └── migrations/
│
├── src/
│   ├── shared/                      # Shared between frontend + backend
│   │   ├── schemas/                 # Zod validation schemas (10 files)
│   │   ├── errors.js                # Domain error classes
│   │   └── constants.js             # Enums + SOCKET_EVENTS + STORAGE_KEYS
│   │
│   ├── backend/                     # Express + Socket.io server
│   │   ├── server.js                # Bootstrap: HTTP + Socket.io + middleware
│   │   ├── config.js                # Env var validation
│   │   ├── prisma.js                # PrismaClient singleton
│   │   ├── logger.js                # Pino structured logger
│   │   ├── container.js             # DI container
│   │   ├── infrastructure/
│   │   │   └── PrismaRepository.js  # Prisma → IStorageRepository contract
│   │   ├── middleware/              # auth, error, role, tenant, validate
│   │   ├── routes/                  # 12 route files
│   │   ├── services/                # Auth, User, Audit
│   │   └── realtime/                # Socket.io (7 files)
│   │
│   └── frontend/                    # Browser SPA
│       ├── main.js                  # Entry point
│       ├── config.js                # window.APP_CONFIG reader
│       ├── container.js             # DI container (repo + services)
│       ├── infrastructure/          # IStorageRepository, LocalStorage, Api, CacheDecorator, socket.client
│       ├── services/                # 11 business services (shared with backend)
│       ├── ui/
│       │   ├── router.js            # MPA navigation helper
│       │   ├── components/          # Modal, Spinner, Table, Toast
│       │   └── pages/              # auth/, games/, migrate/
│       └── utils/                   # eventBus, format, logger, sanitize
│
├── tests/
│   ├── unit/                        # Service unit tests (4 of 11 done)
│   ├── integration/                 # Contract + HTTP + socket tests
│   └── e2e/                         # Manual checklist
│
├── Dockerfile                       # Multi-stage build
├── docker-compose.yml               # SaaS stack (app + postgres + redis)
├── install.sh                       # One-command local installer
├── vitest.config.js
└── public/
    └── bundle.js                    # Built frontend SPA
```

### Key Rules (from Master Prompt)

1. **One `io()` call** — in `src/backend/realtime/socket.server.js`. Never elsewhere.
2. **All storage through repository** — never call `localStorage` directly from services/UI.
3. **No business logic in route handlers** — delegate to services.
4. **Zero `.innerHTML = userContent`** — always use `safeSetHTML()`.
5. **Zero `console.log`** — use Pino (backend) or structured logger (frontend).
6. **Every service gets `(repo, logger)`** — no exceptions.
7. **Refresh tokens stored as SHA-256 hash** — never raw.
8. **Passwords hashed with bcrypt, rounds >= 12**.

---

## 2. Current State

### ✅ Already Done

| Area | Files | Branch |
|------|-------|--------|
| Database schema + migrations | `prisma/schema.prisma`, `seed.js`, migrations | `feature/backend` |
| Shared schemas (Zod) | 10 files in `src/shared/schemas/` | `feature/backend` |
| Errors + constants | `errors.js`, `constants.js` | `feature/backend` |
| Backend config + logger + prisma | `config.js`, `logger.js`, `prisma.js` | `feature/backend` |
| DI container | `container.js` | `feature/backend` |
| PrismaRepository | 22 queries + full CRUD | `feature/backend` |
| Middleware (5 files) | auth, error, role, tenant, validate | `feature/backend` |
| Routes (12 files) | All CRUD + auth + migrate + sessions | `feature/backend` |
| Backend services (3) | AuthService, UserService, AuditService | `feature/backend` |
| Realtime server (7 files) | socket.server, auth, rooms, cleanup, game/tournament/session handlers | `feature/backend` |
| server.js | HTTP server, Socket.io init, APP_CONFIG injection, cleanup jobs, graceful shutdown | `feature/backend` |
| Frontend infrastructure | IStorageRepository, LocalStorage, Api, CacheDecorator, socket.client | `feature/backend` |
| Frontend services (11) | All business services | `feature/backend` |
| Frontend container + config | DI, APP_CONFIG reader | `feature/backend` |
| Login page | SPA login with API auth | `feature/backend` |
| GamePage stub | PAGE_EVENTS pattern | `feature/backend` |
| Migrate page + route | LocalStorage → DB migration | `feature/backend` |
| Tests (77 passing) | 4 unit + 5 integration + 2 contract | `feature/backend` |
| Docker | Dockerfile + docker-compose.yml + install.sh | `feature/backend` |

### ❌ What Remains

| Area | Missing | Priority |
|------|---------|----------|
| Security hardening | OWASP checklist items (C2, C3, M5/A4, A1, rate limiting) | ✅ **Done** |
| PostgreSQL verification | Run on real PG | Medium |
| Complete test coverage | 7 services untested | Medium |
| E2E automated tests | Currently manual only | Low |

---

## 3. Branch Strategy

```
feature/admin ─┐
                │
feature/backend ─┤
                  ├──→ feature/rewrite-v4 ──→ main
feature/frontend ─┤
                  │
feature/realtime ─┤
                  │
feature/ai ───────┘
```

### Merge Order

```bash
# 1. Merge backend (already ready)
git checkout feature/rewrite-v4
git merge feature/backend

# 2. Merge frontend
git merge feature/frontend

# 3. After finishing admin dashboard:
git checkout feature/rewrite-v4
git merge feature/admin

# 4. After finishing realtime UI:
git merge feature/realtime

# 5. After finishing AI features:
git merge feature/ai

# 6. Production hardening directly on rewrite-v4 or a release branch
# 7. Merge to main
git checkout main
git merge feature/rewrite-v4
```

---

## 4. Phase 1: Admin Dashboard (`feature/admin`)

### Goal
Build a proper admin SPA that replaces the legacy `admin.html` and consumes the backend API.

### Files to Create

```
src/frontend/ui/pages/admin/
├── AdminPage.js              # Main admin layout + tab navigation
├── DashboardPage.js          # Overview KPIs, charts
├── UsersPage.js              # User CRUD + roles
├── QuestionsPage.js          # Question bank management
├── ExamsPage.js              # Exam CRUD + publish
├── ClassesPage.js            # Class management
├── CategoriesPage.js         # Category management
├── ResultsPage.js            # Results view + export
├── SettingsPage.js           # App settings (admin visibility)
└── components/
    ├── AdminHeader.js        # Nav bar, user info
    ├── AdminSidebar.js       # Tab navigation
    ├── DataTable.js          # Reusable sortable table
    └── ConfirmDialog.js      # Delete confirmations
```

### Implementation Steps

#### Step 1: Create AdminPage layout

```javascript
// src/frontend/ui/pages/admin/AdminPage.js
// Layout: sidebar with tabs, header with user info, content area
// Exports: initAdminPage()
// Called from main.js after login for admin users
```

**Key behaviors:**
- Sidebar with tabs: Dashboard, Questions, Exams, Classes, Categories, Users, Results, Settings
- Header shows current user name + logout button
- Each tab loads its corresponding page component
- Tab switching is SPA-style (history API or hash-based)

#### Step 2: Dashboard page

```javascript
// src/frontend/ui/pages/admin/DashboardPage.js
// Calls:
//   GET /api/v1/exams?limit=5&orderBy=created_at
//   GET /api/v1/results?limit=5
//   GET /api/v1/users?limit=5
// Shows: total questions, exams, users, results
// Recent activity list
// Quick action buttons
```

#### Step 3: Questions page

```javascript
// src/frontend/ui/pages/admin/QuestionsPage.js
// Calls:
//   GET  /api/v1/questions?filters[type]=mcq&search=...&limit=50
//   POST /api/v1/questions
//   PATCH /api/v1/questions/:id
//   DELETE /api/v1/questions/:id
//
// Features:
// - Table with columns: text, type, difficulty, category, actions
// - Search + filter by type/difficulty/category
// - Modal for create/edit (Zod validation from shared schemas)
// - Pagination, sortable columns
// - Bulk delete
```

**Important:** Must use `safeSetHTML()` for all dynamic content (see `src/frontend/utils/sanitize.js`). Never use `innerHTML` directly.

#### Step 4: Exams page

```javascript
// src/frontend/ui/pages/admin/ExamsPage.js
// Calls:
//   GET  /api/v1/exams
//   POST /api/v1/exams
//   PATCH /api/v1/exams/:id
//   DELETE /api/v1/exams/:id
//   POST /api/v1/exams/:id/publish
//   POST /api/v1/exams/:id/archive
//   GET  /api/v1/exams/:id/questions
//   POST /api/v1/exams/:id/questions
//   DELETE /api/v1/exams/:id/questions/:questionId
//   PUT  /api/v1/exams/:id/questions/order
//   POST /api/v1/exams/:id/classes
//   DELETE /api/v1/exams/:id/classes/:classId
//
// Features:
// - Exam list with status badges (draft/active/archived)
// - Create/edit exam modal
// - Question selector (multi-select from question bank)
// - Class assignment
// - Publish flow validation (must have ≥1 question)
```

#### Step 5: Users page

```javascript
// src/frontend/ui/pages/admin/UsersPage.js
// Calls:
//   GET  /api/v1/users
//   POST /api/v1/users
//   PATCH /api/v1/users/:id
//   DELETE /api/v1/users/:id
//   POST /api/v1/users/:id/reset-password
//
// Features:
// - User table (name, username, role, class, status)
// - Create/edit user modal
// - Role selector (admin/student)
// - Class assignment dropdown
// - Reset password button
```

#### Step 6: Classes, Categories, Results, Settings pages

Follow the same pattern — each calls the corresponding API endpoints and provides CRUD UI.

**ClassesPage:**
- `GET/POST/PATCH/DELETE /api/v1/classes`
- `GET /api/v1/classes/:id/students`

**CategoriesPage:**
- `GET/POST/PATCH/DELETE /api/v1/categories`
- `GET /api/v1/categories/tree` (hierarchical view)

**ResultsPage:**
- `GET /api/v1/results`
- `GET /api/v1/results/exam/:examId/stats`
- `GET /api/v1/results/user/:userId/stats`

**SettingsPage:**
- `GET /api/v1/settings/public`
- `GET /api/v1/settings/admin`
- `PATCH /api/v1/settings/:key`
- `POST /api/v1/settings/bulk`

#### Step 7: Wire into main.js

```javascript
// In src/frontend/main.js, replace:
import { initLoginPage } from './ui/pages/auth/LoginPage.js';
// With admin-aware routing:
import { initAdminPage } from './ui/pages/admin/AdminPage.js';
import { initLoginPage } from './ui/pages/auth/LoginPage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = createContainer();
  
  // Check if already logged in + is admin → show admin page
  // Otherwise → show login page
  if (container.authSvc.isAuthenticated() && container.authSvc.isAdmin()) {
    initAdminPage();
  } else {
    initLoginPage();
  }
});
```

### API Call Pattern (for every page)

```javascript
import { config } from '../../../config.js';
import { getContainer } from '../../../container.js';
import { withError } from '../../../utils/eventBus.js';

async function api(method, path, body = null) {
  const { authSvc } = getContainer();
  const baseUrl = config.apiUrl || '';
  const headers = { 'Content-Type': 'application/json' };
  const token = authSvc.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || 'Request failed');
  }
  
  return res.json();
}

// Usage:
// const questions = await api('GET', '/api/v1/questions?limit=50');
// const created = await api('POST', '/api/v1/questions', { text: '...', type: 'mcq', answer: 'A' });
```

---

## 5. Phase 2: Frontend Realtime UI (`feature/realtime`)

### Goal
Build frontend pages that connect via Socket.io for live games, tournaments, and exam sessions.

### Files to Create

```
src/frontend/ui/pages/games/
├── components/
│   ├── GameLobby.js          # Join game by code, player list
│   ├── GameQuestion.js       # Display question + answer options
│   ├── GameScoreboard.js     # Live scoreboard
│   └── GameResults.js        # Final results screen
│
src/frontend/ui/pages/tournaments/
├── TournamentPage.js         # Tournament main page
├── TournamentRegister.js     # Registration UI
├── TournamentQuestion.js     # Question answering
├── TournamentLeaderboard.js  # Live leaderboard
│
src/frontend/ui/pages/sessions/
├── SessionPage.js            # Exam session (student)
├── SessionQuestion.js        # Question navigation
└── SessionResults.js         # Exam results
```

### Implementation Steps

#### Step 1: Game Lobby

```javascript
// src/frontend/ui/pages/games/components/GameLobby.js
// Uses: getSocket(token) from socket.client.js
// Events:
// - Emit GAME_JOIN with { joinCode }
// - Listen for game:state_update → show game info + player list
// - Listen for player:joined / player:left → update player list
// - Listen for game:question → transition to answering phase
//
// PAGE_EVENTS declaration (mandatory per spec):
const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_STATE_UPDATE,
  SOCKET_EVENTS.GAME_QUESTION,
  SOCKET_EVENTS.GAME_SCORES,
  SOCKET_EVENTS.GAME_FINISHED,
  SOCKET_EVENTS.PLAYER_JOINED,
  SOCKET_EVENTS.PLAYER_LEFT,
  SOCKET_EVENTS.ANSWER_RESULT,
  SOCKET_EVENTS.SESSION_EXPIRED,
  'player:joined',
  'player:left',
  'answer:result',
];
```

#### Step 2: Game Question + Answer

```javascript
// src/frontend/ui/pages/games/components/GameQuestion.js
// Shows the current question (text + options)
// Emit: GAME_ANSWER with { gameId, questionId, answer }
// Listen: answer:result → show correct/wrong feedback
// Listen: game:scores → update scoreboard
// Listen: game:finished → show results screen
```

#### Step 3: Tournament Page

Same pattern as Game pages but using tournament events:
- `TOURNAMENT_JOIN` / `TOURNAMENT_ANSWER`
- Listens for `game:scores` (reused constant for leaderboard updates)
- Shows leaderboard instead of per-player scoreboard

**Important:** Both GamePage and TournamentPage must follow the mandatory `PAGE_EVENTS` + `cleanupSocketListeners` + `Router.registerCleanup` pattern (see spec §11).

### Mandatory Socket Page Pattern

Every page that uses sockets MUST follow this exact structure:

```javascript
import { getSocket, cleanupSocketListeners } from '../../../infrastructure/socket.client.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';
import { getContainer } from '../../../container.js';
import { Router } from '../../router.js';
import { logger } from '../../../utils/logger.js';

const PAGE_EVENTS = [ /* all events this page listens to */ ];

export function initGamePage(gameId) {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());
  if (!socket.connected) socket.connect();

  // Register ALL handlers
  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, renderState);
  // ... etc.

  // Emit join
  socket.emit(SOCKET_EVENTS.GAME_JOIN, { gameId });

  // Register cleanup
  Router.registerCleanup(PAGE_EVENTS);
  window.addEventListener('beforeunload', () => {
    socket.emit(SOCKET_EVENTS.GAME_LEAVE, { gameId });
  });
}
```

---

## 6. Phase 3: AI Features (`feature/ai`)

### Goal
Add AI-powered question generation and RAG (Retrieval-Augmented Generation) for intelligent quiz creation.

### Files to Create

```
src/backend/routes/ai.routes.js          # /api/v1/ai/generate, /api/v1/ai/rag
src/backend/services/AIService.js        # OpenAI/LLM integration
src/backend/services/RAGService.js        # Document ingestion + retrieval
src/frontend/ui/pages/admin/
├── components/
│   ├── AIGeneratorModal.js    # Question generation UI
│   └── RAGUploader.js         # Document upload for RAG
```

### Implementation Steps

#### Step 1: AI Service

```javascript
// src/backend/services/AIService.js
// Methods:
//   generateQuestions({ topic, count, type, difficulty, schoolId })
//     → calls OpenAI/LLM API → parses response → returns Question[]
//   generateFromText({ text, count, type })
//     → extracts questions from provided text
//
// Configuration via env:
//   AI_PROVIDER=openai|anthropic|ollama
//   AI_API_KEY=sk-...
//   AI_MODEL=gpt-4o-mini
```

#### Step 2: RAG Service

```javascript
// src/backend/services/RAGService.js
// Methods:
//   ingestDocument({ file, schoolId })
//     → extracts text (PDF/docx/txt) → chunks → embeds → stores
//   query({ question, schoolId })
//     → embeds question → retrieves relevant chunks → generates answer
//
// Storage: use a vector DB (pgvector on PostgreSQL, or in-memory for SQLite)
```

#### Step 3: AI Routes

```javascript
// src/backend/routes/ai.routes.js
// Mount at /api/v1/ai
// Endpoints:
//   POST /generate       → { topic, count, type, difficulty } → Question[]
//   POST /generate/text  → { text, count, type } → Question[]
//   POST /rag/ingest     → multipart file upload → { chunks, status }
//   POST /rag/query      → { question } → { answer, sources }
//
// All require JWT + admin role
```

---

## 7. Phase 4: Integration & Merge

### Step 1: Create the Integration Branch

```bash
# From feature/rewrite-v4 (already exists)
git checkout feature/rewrite-v4

# Merge all completed branches
git merge feature/frontend
git merge feature/backend
```

### Step 2: Resolve Conflicts

Expected conflict areas:
- `src/frontend/main.js` — both branches may have modified it
- `src/backend/server.js` — if frontend modified it
- `package.json` — dependency additions

### Step 3: Integration Testing

After merging, run the full test suite:

```bash
npm test
```

Then test manually:
1. Start server: `npm start`
2. Open `http://localhost:3000`
3. Login with `admin` / `admin123`
4. Verify all admin pages work
5. Create a question → exam → verify via API

### Step 4: Merge Remaining Branches

```bash
git merge feature/admin
git merge feature/realtime
git merge feature/ai
```

### Step 5: Merge to Main

```bash
git checkout main
git merge feature/rewrite-v4
```

---

## 8. Phase 5: Production Hardening

### 8.1 Security Checklist (from Master Prompt §25)

- [ ] `.env` is in `.gitignore` — never committed
- [ ] `JWT_SECRET` is minimum 64 hex characters
- [ ] Refresh tokens stored as SHA-256 hash (never raw)
- [ ] `npx prisma migrate deploy` (not `migrate dev`) in production
- [ ] Default admin password (`admin123`) changed after first login
- [ ] All socket connections authenticated via JWT
- [ ] Socket rooms used for targeting — no global broadcasts
- [ ] Expired exam sessions cleaned up every 5 min
- [ ] Orphaned refresh tokens purged every hour
- [ ] Reconnection tested (kill/restart server)
- [ ] No `console.log` in any service, route, or socket handler
- [ ] No `innerHTML` with user content — use `safeSetHTML()`
- [ ] Password changes revoke all existing refresh tokens
- [ ] Rate limiting on auth endpoints (10 req/15min per IP)

### 8.2 PostgreSQL Verification

```bash
# 1. Update .env
DB_PROVIDER=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/quizdb

# 2. Regenerate Prisma client for PG
npx prisma generate

# 3. Apply migrations
npx prisma migrate deploy

# 4. Seed
npx prisma db seed

# 5. Start and test
npm start
```

Verify identical behavior:
- All CRUD endpoints respond
- Auth flow works
- Socket connections work
- Migration tool works
- All tests pass with PG

### 8.3 Remaining Backend Fixes (from AUDIT_REPORT.md)

| Issue | Fix |
|-------|-----|
| C2: Direct `repo.delete()` in routes | Add service methods (e.g., `gameService.delete()`) that enforce business rules |
| C3: `innerHTML` in components | Replace with `safeSetHTML()` |
| C4: Direct `localStorage` in LoginPage | Move storage logic to a repository method |
| M1: Weak local-mode token | Use bcrypt in frontend when available |
| M2: Missing `school_id` in exam sessions | Add school_id to createSession calls |
| M3/M4: Plaintext passwords | Hash with bcrypt in frontend services |
| M5/A4: `requireRole` bypass | Fix middleware to check exact roles |
| A1: CacheDecorator in SaaS mode | Only wrap in local mode |
| A2: Missing logger in services | Inject logger to all frontend services |
| A5: console.log usage | Replace with structured logger calls |

---

## 9. Phase 6: Tests & CI

### 9.1 Missing Unit Tests

Create tests for these services (follow the same pattern as existing tests in `tests/unit/`):

| Service | Test file | Key scenarios |
|---------|-----------|---------------|
| `UserService` | `tests/unit/UserService.test.js` | CRUD, reset password, admin gate |
| `QuestionService` | `tests/unit/QuestionService.test.js` | CRUD, filter, search |
| `ResultService` | `tests/unit/ResultService.test.js` | Get by exam, get by user, stats |
| `ClassService` | `tests/unit/ClassService.test.js` | CRUD, student list |
| `CategoryService` | `tests/unit/CategoryService.test.js` | CRUD, tree |
| `TournamentService` | `tests/unit/TournamentService.test.js` | CRUD, open/close, register, leaderboard, recordAnswer |
| `SessionService` | `tests/unit/SessionService.test.js` | Create, answer, heartbeat, submit, cleanup |

### 9.2 Unit Test Pattern

Every unit test follows this exact pattern (from spec §23):

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceName } from '../../src/frontend/services/ServiceName.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';

function makeRepo(overrides = {}) {
  return {
    getAll:     vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById:    vi.fn().mockResolvedValue(null),
    create:     vi.fn(),
    update:     vi.fn(),
    delete:     vi.fn(),
    query:      vi.fn().mockResolvedValue([]),
    createMany: vi.fn(),
    ...overrides,
  };
}

describe('ServiceName', () => {
  let service, repo;
  
  beforeEach(() => {
    repo = makeRepo();
    service = new ServiceName(repo);
  });
  
  // Test cases...
});
```

### 9.3 CI Configuration

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx prisma generate
      - run: npm test
```

---

## 10. File-by-File Checklist

### `feature/admin` — New Files to Create

```
☐ src/frontend/ui/pages/admin/AdminPage.js
☐ src/frontend/ui/pages/admin/DashboardPage.js
☐ src/frontend/ui/pages/admin/UsersPage.js
☐ src/frontend/ui/pages/admin/QuestionsPage.js
☐ src/frontend/ui/pages/admin/ExamsPage.js
☐ src/frontend/ui/pages/admin/ClassesPage.js
☐ src/frontend/ui/pages/admin/CategoriesPage.js
☐ src/frontend/ui/pages/admin/ResultsPage.js
☐ src/frontend/ui/pages/admin/SettingsPage.js
☐ src/frontend/ui/pages/admin/components/AdminHeader.js
☐ src/frontend/ui/pages/admin/components/AdminSidebar.js
☐ src/frontend/ui/pages/admin/components/DataTable.js
☐ src/frontend/ui/pages/admin/components/ConfirmDialog.js
```

### `feature/admin` — Existing Files to Modify

```
☐ src/frontend/main.js               → Wire admin page after login
```

### `feature/realtime` — New Files to Create

```
✅ src/frontend/ui/pages/games/components/GameLobby.js
✅ src/frontend/ui/pages/games/components/GameQuestion.js
✅ src/frontend/ui/pages/games/components/GameScoreboard.js
✅ src/frontend/ui/pages/games/components/GameResults.js
✅ src/frontend/ui/pages/tournaments/TournamentPage.js
✅ src/frontend/ui/pages/tournaments/TournamentRegister.js
✅ src/frontend/ui/pages/tournaments/TournamentQuestion.js
✅ src/frontend/ui/pages/tournaments/TournamentLeaderboard.js
✅ src/frontend/ui/pages/sessions/SessionPage.js
✅ src/frontend/ui/pages/sessions/SessionQuestion.js
✅ src/frontend/ui/pages/sessions/SessionResults.js
```

> Phase 2 (Frontend Realtime UI) is **complete** on `feature/realtime`.
> Container integration: `main.js` updated with hash routing for all realtime pages.
> Tests baseline preserved: 77 passing / 1 skipped.

### `feature/ai` — New Files to Create

```
✅ src/backend/routes/ai.routes.js
✅ src/backend/services/AIService.js
✅ src/backend/services/RAGService.js
✅ src/frontend/ui/pages/admin/components/AIGeneratorModal.js
✅ src/frontend/ui/pages/admin/components/RAGUploader.js
```

> Phase 3 (AI Features) is **complete** on `feature/ai`.
> AIService supports OpenAI, Anthropic, and Ollama (configurable via env vars).
> RAGService provides document ingestion, keyword retrieval, and simulated
>   embedding (in-memory for SQLite, pgvector-ready for PostgreSQL).
> AI routes mounted at `/api/v1/ai` with admin-only JWT protection.
> Container and server.js updated to wire all new services and routes.
> Tests baseline preserved: 77 passing / 1 skipped.

### Production Hardening — Files to Modify

```
☐ src/backend/server.js → Add cookie-parser ✅ (DONE)
☐ src/backend/middleware/role.js → Fix requireRole bypass
☐ src/backend/routes/games.routes.js → Add service delete method
☐ src/backend/routes/tournaments.routes.js → Add service delete method
☐ src/frontend/ui/components/Modal.js → Use safeSetHTML
☐ src/frontend/ui/components/Spinner.js → Use safeSetHTML
☐ src/frontend/ui/components/Table.js → Use safeSetHTML
☐ src/frontend/ui/pages/auth/LoginPage.js → Use repo for localStorage
☐ src/frontend/services/AuthService.js → Hash passwords, strengthen token
☐ src/frontend/services/UserService.js → Hash passwords
☐ src/frontend/services/SessionService.js → Add school_id
☐ src/frontend/container.js → Conditional CacheDecorator
☐ All frontend services → Add logger parameter
```

### Tests — New Files to Create

```
☐ tests/unit/UserService.test.js
☐ tests/unit/QuestionService.test.js
☐ tests/unit/ResultService.test.js
☐ tests/unit/ClassService.test.js
☐ tests/unit/CategoryService.test.js
☐ tests/unit/TournamentService.test.js
☐ tests/unit/SessionService.test.js
☐ .github/workflows/ci.yml
```

---

## 11. Reference: Master Prompt Phase Mapping

The master prompt (`quiz_app_master_implementation_prompt.md`) defines these phases:

| Phase | Name | Status | Branch |
|-------|------|--------|--------|
| 0 | Foundations | ✅ Done | `feature/backend` |
| 1 | Full Backend Setup | ✅ Done | `feature/backend` |
| 2 | Schema Tests | ✅ Done | `feature/backend` |
| 3 | Repository + Services | ✅ Done | `feature/backend` |
| 4 | Frontend Refactoring | ✅ Done | `feature/frontend` |
| 5 | Backend Routes | ✅ Done | `feature/backend` |
| 6 | Settings Split | ✅ Done | `feature/backend` |
| 7 | API Mode Switch | ✅ Done | `feature/backend` |
| 8 | Migration Tool | ✅ Done | `feature/backend` |
| 9 | PostgreSQL | ⏳ Pending | `main` |
| 10 | Security Hardening | ✅ Done | `main` |
| 11 | Testing | ⏳ Pending (partial) | `main` |

### Additional User-Defined Features

| Feature | Status | Branch |
|---------|--------|--------|
| Admin Dashboard | ✅ **Done** | `feature/admin` |
| Frontend Realtime UI | ✅ **Done** | `feature/realtime` |
| AI Question Generation | ✅ **Done** | `feature/ai` |

---

## Summary: Recommended Order

```
1.  feature/admin     → Admin dashboard ✅ **Done**
2.  feature/realtime  → Frontend realtime UI ✅ **Done**
3.  feature/ai        → AI question generation + RAG ✅ **Done**
4.  feature/rewrite-v4 → Merge backend + frontend + admin + realtime + AI|
5.  Security fixes    → Fix C2, C3, C4, M5/A4 (from AUDIT_REPORT.md)
6.  Merge all         → feature/rewrite-v4 → main
7.  Tests             → 7 missing service tests + CI
8.  PostgreSQL        → Verify on real PG
9.  Production        → Deploy
```

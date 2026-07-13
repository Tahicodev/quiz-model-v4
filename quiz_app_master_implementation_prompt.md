# Quiz Application — Master Implementation Prompt (v2 — Complete)

> **For the coding model:** Read this entire document before writing a single line of code.
> Every section is a hard requirement. Do not skip, summarize, or defer any section.
> Work through phases in strict order. After each phase confirm completion before proceeding.
> Do NOT assume the existing architecture is correct — challenge every decision, identify all technical debt, and refactor when necessary.

---

## 0. Pre-Work: Architecture Audit (Do This Before Touching Any Code)

Before writing any code, audit the existing codebase and produce a written report covering all of the following. This report must be completed and confirmed before Phase 1 begins.

### 0.1 Technical Debt Report
Identify and document every instance of:
- Direct `localStorage` / `sessionStorage` calls outside any abstraction layer
- Business logic embedded inside UI event handlers or DOM manipulation code
- Hardcoded configuration values (URLs, keys, timeouts, limits)
- Duplicate data stored in multiple places (same question stored in both a question list and inside an exam object, etc.)
- Circular dependencies between modules
- Missing error handling (bare `try/catch` with empty catch blocks, unhandled promise rejections)
- Dead code, unused variables, unreachable branches

### 0.2 Security Audit
Identify every instance of:
- Admin secrets, recovery codes, or passwords visible to the client
- Private settings being broadcast to all users via Socket.io events
- Sensitive data stored in `localStorage` without any protection
- User content rendered with `.innerHTML` without sanitization
- Authentication state managed insecurely (role stored in localStorage without server verification)
- Missing CSRF protection
- Missing rate limiting on any endpoint that accepts credentials

### 0.3 Scalability Audit
Identify every instance of:
- Data loaded entirely into memory with no pagination
- N+1 query patterns (fetching a list then fetching details for each item individually)
- Calculations repeated on every render that could be computed once
- Global mutable state that would not survive multi-instance deployment

### 0.4 Socket.io / Realtime Audit (if the app uses Socket.io)
Identify every instance of:
- Multiple `io()` calls from the same browser tab (ghost connections)
- Socket event listeners added without corresponding cleanup on disconnect/page change
- Missing reconnection handling
- Sensitive data (answers, admin state) being broadcast to all connected sockets instead of targeted rooms
- Memory leaks from sockets not removed from tracking maps on disconnect
- Duplicate event handlers registered on each reconnect

### 0.5 Session Audit
Identify every instance of:
- Sessions that persist beyond their intended lifetime
- Sessions that are never cleaned up (orphan sessions)
- Duplicate sessions for the same user
- Session data stored in a structure that grows unboundedly

**Output:** A numbered list of every issue found, categorized by the sections above. The coding model must confirm this list before Phase 1 begins. Issues found here drive the refactoring work in Phase 4.

---

## 1. Context & Non-Negotiable Constraints

### What already exists
- A working quiz/exam/gamification application running entirely on browser `localStorage`.
- Direct `localStorage.getItem()` / `localStorage.setItem()` calls are scattered across UI files.
- There is no service layer, no abstraction, no authentication, and no validation.
- The app may include Socket.io for realtime features (games, tournaments, live sessions).
- The app is **not correct by assumption** — bugs, redundancies, and tight coupling exist and must be found and fixed during the rebuild.
- All existing user data and IDs must be preserved and safely migrated.

### Two deployment targets — one codebase
| | **Target 1: Local School (LAN)** | **Target 2: SaaS / Cloud** |
|---|---|---|
| Infrastructure | Local machine or LAN server | Remote VPS / cloud host |
| Internet required | No | Yes |
| Database | SQLite (via Prisma) | PostgreSQL (via Prisma) |
| Auth | Username/password, JWT stored in memory | JWT (access) + refresh token in httpOnly cookie |
| Multi-tenancy | Single school, no tenant isolation | Full `school_id` row-level isolation |
| Realtime | Socket.io on local network | Socket.io with Redis adapter for multi-instance |
| Install complexity | `npm install && npm start`, zero config | Docker Compose |

### Technology stack (non-negotiable)
- **Frontend:** Vanilla JS, HTML, CSS — no framework migration. Keep existing UI; refactor internals only.
- **Backend:** Node.js + Express
- **Realtime:** Socket.io (server) + socket.io-client (browser)
- **ORM:** Prisma (SQLite locally, PostgreSQL in SaaS — one env variable switches between them)
- **Validation:** Zod (shared between frontend and backend — import the same schema file in both places)
- **Passwords:** bcrypt (rounds ≥ 12)
- **Tokens:** jsonwebtoken
- **Logging:** Pino (structured JSON logs, replaces all `console.log`)
- **Testing:** Vitest
- **Linting:** ESLint

### Cardinal rules — never violate these
1. **Never trust the client for `school_id`** — always derive it from the server-decoded JWT.
2. **Never store plaintext passwords** — bcrypt with salt rounds ≥ 12, even in local mode.
3. **Never call `localStorage` directly** from a service, UI component, or Socket handler — all storage goes through the repository interface.
4. **The same business logic must run in both modes** — the only thing that changes is the repository implementation injected at startup.
5. **Validate before persisting** — every `create` and `update` goes through a Zod schema before the repository.
6. **`school_id` is never sent by the client** — appended server-side from the JWT on every query.
7. **One socket connection per browser tab** — never call `io()` more than once; always clean up listeners on navigation.
8. **Never broadcast secrets** — admin settings, recovery codes, correct answers (before submission), and private config must never be emitted to all sockets.
9. **Separate public from private settings** — settings are split into `PublicSettings`, `TeacherSettings`, `AdminSettings`, `SystemSettings`. Only `PublicSettings` is sent to unauthenticated clients.
10. **Structured logs only** — no `console.log` in production. Use Pino with `[INFO]`, `[WARN]`, `[ERROR]`, `[SECURITY]` levels.

---

## 2. Clean Architecture — Layer Responsibilities

The application is organized into four strict layers. Dependencies only flow inward (Presentation → Application → Domain → Infrastructure is forbidden; arrows go the other direction or are injected).

```
┌─────────────────────────────────────────┐
│  Presentation Layer (UI)                │  HTML pages, DOM handlers, Socket.io client events
│  — no business logic                   │  Only calls Application Services
│  — no direct storage access            │  Receives DTOs, renders them
├─────────────────────────────────────────┤
│  Application Layer (Services)           │  QuestionService, ExamService, GameService...
│  — contains all business rules         │  Validates input, enforces permissions
│  — no knowledge of storage engine      │  Calls Repositories via injected interface
│  — no DOM access                       │  Emits domain events
├─────────────────────────────────────────┤
│  Domain Layer (Entities & Interfaces)   │  IStorageRepository, typed errors, constants
│  — pure definitions                    │  No implementation code
│  — no I/O of any kind                  │  Shared between frontend and backend
├─────────────────────────────────────────┤
│  Infrastructure Layer (Implementations) │  LocalStorageRepository, PrismaRepository
│  — all I/O lives here                  │  Socket.io server setup, Pino logger
│  — implements domain interfaces        │  CacheDecorator, IdGenerator
└─────────────────────────────────────────┘
```

**Enforcement rules:**
- A Service must never `import` from `infrastructure/`.
- A UI file must never `import` from `infrastructure/` or call a Repository directly.
- A Repository must never contain business logic (no `if score > passingScore` inside a repo).
- The only place that knows which concrete implementation is used is `container.js`.

---

## 3. Final Project Structure

Implement this exact structure. Do not add folders not listed here.

```
quiz-app/
├── prisma/
│   ├── schema.prisma              # Single source of truth for ALL database tables
│   ├── seed.js                    # Seed script: creates default admin + school for local mode
│   └── migrations/                # Auto-generated by Prisma — never edit manually
│
├── src/
│   ├── shared/                    # Code imported by BOTH frontend and backend
│   │   ├── schemas/               # Zod validation schemas — one file per entity
│   │   │   ├── user.schema.js
│   │   │   ├── question.schema.js
│   │   │   ├── exam.schema.js
│   │   │   ├── result.schema.js
│   │   │   ├── class.schema.js
│   │   │   ├── category.schema.js
│   │   │   ├── game.schema.js
│   │   │   ├── tournament.schema.js
│   │   │   ├── session.schema.js
│   │   │   └── settings.schema.js
│   │   ├── errors.js              # Typed domain errors (AppError subclasses)
│   │   └── constants.js           # All enums: ROLES, QUESTION_TYPES, GAME_STATUS, etc.
│   │
│   ├── backend/
│   │   ├── server.js              # Express + Socket.io bootstrap
│   │   ├── config.js              # All env vars validated at startup
│   │   ├── prisma.js              # Prisma client singleton
│   │   ├── logger.js              # Pino structured logger singleton
│   │   │
│   │   ├── infrastructure/
│   │   │   ├── PrismaRepository.js         # Repository interface → Prisma
│   │   │   ├── IdGenerator.js              # crypto.randomUUID() wrapper
│   │   │   └── SessionStore.js             # In-memory or Redis session store
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js          # Verify JWT, attach req.user
│   │   │   ├── tenant.middleware.js        # Set req.schoolId from JWT — never from body
│   │   │   ├── role.middleware.js          # requireRole(...roles) factory
│   │   │   ├── validate.middleware.js      # Zod validation on req.body and req.query
│   │   │   ├── error.middleware.js         # Global Express error handler
│   │   │   ├── rateLimit.middleware.js     # express-rate-limit — applied per route group
│   │   │   └── logging.middleware.js       # Pino HTTP request logger
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.js             # /api/v1/auth — public
│   │   │   ├── users.routes.js            # /api/v1/users — admin only
│   │   │   ├── classes.routes.js          # /api/v1/classes
│   │   │   ├── categories.routes.js       # /api/v1/categories
│   │   │   ├── questions.routes.js        # /api/v1/questions
│   │   │   ├── exams.routes.js            # /api/v1/exams
│   │   │   ├── results.routes.js          # /api/v1/results
│   │   │   ├── games.routes.js            # /api/v1/games
│   │   │   ├── tournaments.routes.js      # /api/v1/tournaments
│   │   │   ├── settings.routes.js         # /api/v1/settings — split public/private
│   │   │   └── migrate.routes.js          # /api/v1/migrate — one-time LocalStorage import
│   │   │
│   │   ├── services/
│   │   │   ├── AuthService.js
│   │   │   ├── UserService.js
│   │   │   ├── QuestionService.js
│   │   │   ├── ExamService.js
│   │   │   ├── ResultService.js
│   │   │   ├── ClassService.js
│   │   │   ├── CategoryService.js
│   │   │   ├── GameService.js
│   │   │   ├── TournamentService.js
│   │   │   ├── SessionService.js          # Manages active game/exam sessions
│   │   │   ├── SettingsService.js         # Public vs private settings split
│   │   │   └── AuditService.js            # Structured audit logging
│   │   │
│   │   └── realtime/
│   │       ├── socket.server.js           # Socket.io server — single io() init
│   │       ├── socket.auth.js             # Middleware: verify JWT on socket handshake
│   │       ├── socket.rooms.js            # Room naming conventions + join/leave helpers
│   │       ├── handlers/
│   │       │   ├── game.handler.js        # All game socket events
│   │       │   ├── tournament.handler.js  # All tournament socket events
│   │       │   └── session.handler.js     # Exam session events (start, answer, submit)
│   │       └── socket.cleanup.js          # On disconnect: remove from rooms, clean state
│   │
│   └── frontend/
│       ├── index.html
│       ├── main.js                        # Entry: createContainer(), initRouter()
│       ├── container.js                   # DI — wires all services with correct repo
│       ├── config.js                      # Reads window.APP_CONFIG injected by server
│       │
│       ├── infrastructure/
│       │   ├── IStorageRepository.js      # Abstract base class — the contract
│       │   ├── LocalStorageRepository.js  # Implements contract using localStorage
│       │   ├── ApiRepository.js           # Implements contract using fetch → Express API
│       │   ├── CacheDecorator.js          # Wraps any repo with in-memory TTL cache
│       │   ├── IdGenerator.js             # crypto.randomUUID() — browser native
│       │   └── socket.client.js           # Single socket.io-client instance (singleton)
│       │
│       ├── services/                      # Pure business logic — no DOM, no storage
│       │   ├── AuthService.js
│       │   ├── UserService.js
│       │   ├── QuestionService.js
│       │   ├── ExamService.js
│       │   ├── ResultService.js
│       │   ├── ClassService.js
│       │   ├── CategoryService.js
│       │   ├── GameService.js
│       │   ├── TournamentService.js
│       │   ├── SessionService.js
│       │   └── SettingsService.js
│       │
│       ├── ui/
│       │   ├── router.js                  # Client-side routing
│       │   ├── components/                # Reusable UI components (toast, modal, table)
│       │   └── pages/                     # One folder per feature area
│       │       ├── auth/
│       │       ├── questions/
│       │       ├── exams/
│       │       ├── results/
│       │       ├── games/
│       │       ├── tournaments/
│       │       ├── settings/
│       │       └── migrate/               # Migration tool UI (admin only)
│       │
│       └── utils/
│           ├── eventBus.js               # Global error + notification event bus
│           ├── sanitize.js               # XSS prevention — safeSetHTML()
│           ├── format.js                 # Date, score, duration formatters
│           └── logger.js                 # Browser-side structured logger (dev only)
│
├── tests/
│   ├── unit/                             # Service tests — inject mock repositories
│   ├── integration/                      # Repository contract tests (run against both impls)
│   └── e2e/                              # Critical user flows (Playwright or manual checklist)
│
├── .env.example                          # Template — commit this
├── .env                                  # Never committed — in .gitignore
├── .gitignore
├── docker-compose.yml                    # SaaS deployment
├── Dockerfile
├── install.sh                            # Local school one-command installer
└── package.json
```

---

## 4. Environment Configuration

### `.env.example`
```env
# ── Mode ──────────────────────────────────────────────────────────────────────
APP_MODE=local
# "local" → SQLite, single school, no internet required
# "saas"  → PostgreSQL, multi-tenant, cloud deployment

# ── Database ──────────────────────────────────────────────────────────────────
DB_PROVIDER=sqlite
DATABASE_URL=file:./dev.db
# For SaaS:
# DB_PROVIDER=postgresql
# DATABASE_URL=postgresql://user:password@localhost:5432/quizdb

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET=replace_with_64_char_random_hex_string
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
BCRYPT_ROUNDS=12

# ── Server ────────────────────────────────────────────────────────────────────
PORT=3000
CORS_ORIGIN=http://localhost:3000

# ── Realtime ──────────────────────────────────────────────────────────────────
# For SaaS multi-instance only — leave blank for local mode
# REDIS_URL=redis://localhost:6379

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL=info
# "debug" in development, "info" in production, "warn" for quiet production

# ── SaaS only ─────────────────────────────────────────────────────────────────
# SCHOOL_REGISTRATION_OPEN=false
# MAX_STUDENTS_PER_SCHOOL=500
```

### `src/backend/config.js`
```javascript
import 'dotenv/config';

function require_env(key) {
  if (!process.env[key]) throw new Error(`Missing required env variable: ${key}`);
  return process.env[key];
}

export const config = {
  mode:               process.env.APP_MODE || 'local',
  isSaaS:             process.env.APP_MODE === 'saas',
  isLocal:            process.env.APP_MODE !== 'saas',
  port:               parseInt(process.env.PORT || '3000'),
  jwtSecret:          require_env('JWT_SECRET'),
  jwtAccessExpires:   process.env.JWT_ACCESS_EXPIRES  || '15m',
  jwtRefreshExpires:  process.env.JWT_REFRESH_EXPIRES || '7d',
  bcryptRounds:       parseInt(process.env.BCRYPT_ROUNDS || '12'),
  corsOrigin:         process.env.CORS_ORIGIN || 'http://localhost:3000',
  redisUrl:           process.env.REDIS_URL   || null,
  logLevel:           process.env.LOG_LEVEL   || 'info',
};
```

---

## 5. Shared: Domain Errors & Constants

### `src/shared/errors.js`
```javascript
export class AppError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name   = 'AppError';
    this.code   = code;
    this.statusCode = statusCode;
  }
}
export class NotFoundError    extends AppError {
  constructor(entity)   { super('NOT_FOUND',         `${entity} not found`,     404); }
}
export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') { super('UNAUTHORIZED', msg, 401); }
}
export class ForbiddenError   extends AppError {
  constructor()         { super('FORBIDDEN',          'Access denied',           403); }
}
export class ValidationError  extends AppError {
  constructor(fields)   {
    super('VALIDATION_ERROR', 'Validation failed', 422);
    this.fields = fields; // { fieldName: ['error message'] }
  }
}
export class ConflictError    extends AppError {
  constructor(msg)      { super('CONFLICT',           msg,                       409); }
}
export class RateLimitError   extends AppError {
  constructor()         { super('RATE_LIMITED',       'Too many requests',       429); }
}
export class SessionError     extends AppError {
  constructor(msg)      { super('SESSION_ERROR',      msg,                       400); }
}
```

### `src/shared/constants.js`
```javascript
export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin', // SaaS platform admin (manages schools)
  ADMIN:       'admin',       // School admin / teacher
  STUDENT:     'student',
});

export const QUESTION_TYPES = Object.freeze({
  MCQ:        'mcq',
  TRUE_FALSE: 'true-false',
  FILL_BLANK: 'fill-blank',
  MATCHING:   'matching',
  ORDER:      'order',
});

export const EXAM_STATUS = Object.freeze({
  DRAFT:    'draft',
  ACTIVE:   'active',
  ARCHIVED: 'archived',
});

export const GAME_TYPES = Object.freeze({
  QUIZ:      'quiz',
  FLASHCARD: 'flashcard',
  MEMORY:    'memory',
  SPEED:     'speed',     // timed individual challenge
  BATTLE:    'battle',    // head-to-head
});

export const GAME_STATUS = Object.freeze({
  WAITING:  'waiting',   // lobby open, waiting for players
  ACTIVE:   'active',
  PAUSED:   'paused',
  FINISHED: 'finished',
});

export const TOURNAMENT_STATUS = Object.freeze({
  DRAFT:    'draft',
  OPEN:     'open',       // registration open
  ACTIVE:   'active',
  FINISHED: 'finished',
});

export const RESULT_MODE = Object.freeze({
  EXAM:       'exam',
  TRAINING:   'training',
  GAME:       'game',
  TOURNAMENT: 'tournament',
});

export const DIFFICULTY = Object.freeze({
  EASY:   'easy',
  MEDIUM: 'medium',
  HARD:   'hard',
});

export const SESSION_STATUS = Object.freeze({
  PENDING:   'pending',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  EXPIRED:   'expired',
  ABANDONED: 'abandoned',
});

export const SETTINGS_VISIBILITY = Object.freeze({
  PUBLIC:  'public',   // sent to all clients including unauthenticated
  TEACHER: 'teacher',  // sent only to admin/teacher role
  ADMIN:   'admin',    // sent only to admin role
  SYSTEM:  'system',   // never sent to any client
});

export const LOG_LEVELS = Object.freeze({
  DEBUG:    'debug',
  INFO:     'info',
  WARN:     'warn',
  ERROR:    'error',
  SECURITY: 'security', // login failures, unauthorized access attempts, etc.
});

export const SOCKET_EVENTS = Object.freeze({
  // Server → Client
  GAME_STATE_UPDATE:     'game:state_update',
  GAME_QUESTION:         'game:question',
  GAME_SCORES:           'game:scores',
  GAME_FINISHED:         'game:finished',
  SESSION_EXPIRED:       'session:expired',
  ERROR:                 'app:error',
  // Client → Server
  GAME_JOIN:             'game:join',
  GAME_ANSWER:           'game:answer',
  GAME_LEAVE:            'game:leave',
  TOURNAMENT_JOIN:       'tournament:join',
  TOURNAMENT_ANSWER:     'tournament:answer',
  SESSION_HEARTBEAT:     'session:heartbeat',
});
```

---

## 6. Prisma Schema — Complete Data Model

This is the single source of truth. Generate SQL from this. Never write raw SQL elsewhere.

### `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = env("DB_PROVIDER")
  url      = env("DATABASE_URL")
}

// ─── SaaS Only ────────────────────────────────────────────────────────────────
model School {
  id         String   @id @default(uuid())
  name       String
  slug       String   @unique   // myschool.yourdomain.com
  plan       String   @default("free")  // free | pro | enterprise
  max_students Int    @default(100)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  users       User[]
  classes     Class[]
  categories  Category[]
  questions   Question[]
  exams       Exam[]
  results     Result[]
  games       Game[]
  tournaments Tournament[]
  settings    Setting[]
  auditLogs   AuditLog[]
  sessions    ExamSession[]
}

// ─── Users & Auth ─────────────────────────────────────────────────────────────
model User {
  id            String   @id @default(uuid())
  school_id     String
  class_id      String?
  username      String
  password_hash String
  role          String   @default("student")
  name          String
  numero        String?  // student registration number
  status        String   @default("active")   // active | inactive | suspended
  last_login    DateTime?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  school        School         @relation(fields: [school_id], references: [id], onDelete: Cascade)
  class         Class?         @relation(fields: [class_id], references: [id])
  results       Result[]
  createdExams  Exam[]         @relation("ExamCreator")
  gameSessions  GameSession[]
  tournamentEntries TournamentEntry[]
  examSessions  ExamSession[]
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]

  @@unique([school_id, username])
  @@index([school_id])
  @@index([class_id])
  @@index([status])
}

model RefreshToken {
  id         String   @id @default(uuid())
  user_id    String
  token_hash String   @unique  // SHA-256 of the raw token — NEVER store raw
  expires_at DateTime
  revoked    Boolean  @default(false)
  user_agent String?
  ip_address String?
  created_at DateTime @default(now())

  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@index([user_id])
  @@index([expires_at])
}

// ─── Organization ─────────────────────────────────────────────────────────────
model Class {
  id          String   @id @default(uuid())
  school_id   String
  name        String
  description String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  school      School      @relation(fields: [school_id], references: [id], onDelete: Cascade)
  users       User[]
  examClasses ExamClass[]

  @@unique([school_id, name])
  @@index([school_id])
}

// ─── Question Bank ────────────────────────────────────────────────────────────
model Category {
  id         String    @id @default(uuid())
  school_id  String
  name       String
  parent_id  String?
  icon       String?
  color      String?   // hex color for UI
  created_at DateTime  @default(now())

  school     School     @relation(fields: [school_id], references: [id], onDelete: Cascade)
  parent     Category?  @relation("CategoryTree", fields: [parent_id], references: [id])
  children   Category[] @relation("CategoryTree")
  questions  Question[]

  @@unique([school_id, name])
  @@index([school_id])
  @@index([parent_id])
}

model Question {
  id           String   @id @default(uuid())
  school_id    String
  category_id  String?
  type         String   // QUESTION_TYPES constant
  text         String
  options_json String?  // JSON: string[] — only for MCQ, MATCHING, ORDER types
  answer       String   // correct answer (serialized as string always)
  explanation  String?  // shown to student after answering
  points       Int      @default(1)
  difficulty   String   @default("medium")
  tags         String?  // comma-separated tags for filtering
  media_url    String?  // optional image/audio attachment
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  school        School         @relation(fields: [school_id], references: [id], onDelete: Cascade)
  category      Category?      @relation(fields: [category_id], references: [id])
  examQuestions ExamQuestion[]

  @@index([school_id])
  @@index([category_id])
  @@index([type])
  @@index([difficulty])
}

// ─── Exams ────────────────────────────────────────────────────────────────────
model Exam {
  id            String   @id @default(uuid())
  school_id     String
  creator_id    String
  name          String
  description   String?
  duration      Int?     // minutes — null means no time limit
  passing_score Int      @default(50)  // percentage 0-100
  status        String   @default("draft")
  is_training   Boolean  @default(false)  // show answers immediately after each question
  randomize     Boolean  @default(false)  // shuffle questions per session
  max_attempts  Int?     // null = unlimited
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  school        School         @relation(fields: [school_id], references: [id], onDelete: Cascade)
  creator       User           @relation("ExamCreator", fields: [creator_id], references: [id])
  examQuestions ExamQuestion[]
  examClasses   ExamClass[]
  results       Result[]
  sessions      ExamSession[]

  @@index([school_id])
  @@index([status])
  @@index([creator_id])
}

model ExamQuestion {
  exam_id      String
  question_id  String
  order_index  Int      @default(0)
  points_override Int?  // override question's default points for this exam

  exam         Exam     @relation(fields: [exam_id], references: [id], onDelete: Cascade)
  question     Question @relation(fields: [question_id], references: [id], onDelete: Cascade)

  @@id([exam_id, question_id])
  @@index([exam_id])
}

model ExamClass {
  exam_id     String
  class_id    String
  assigned_at DateTime @default(now())

  exam        Exam  @relation(fields: [exam_id], references: [id], onDelete: Cascade)
  class       Class @relation(fields: [class_id], references: [id], onDelete: Cascade)

  @@id([exam_id, class_id])
}

// ─── Active Exam Sessions ─────────────────────────────────────────────────────
// Tracks in-progress exam attempts. Different from Result (which is a completed attempt).
model ExamSession {
  id              String   @id @default(uuid())
  school_id       String
  exam_id         String
  user_id         String
  status          String   @default("active")  // SESSION_STATUS constant
  answers_json    String   @default("{}")  // work-in-progress answers
  current_question_index Int @default(0)
  started_at      DateTime @default(now())
  expires_at      DateTime // exam start + duration
  last_heartbeat  DateTime @default(now())
  completed_at    DateTime?

  school          School  @relation(fields: [school_id], references: [id], onDelete: Cascade)
  exam            Exam    @relation(fields: [exam_id], references: [id])
  user            User    @relation(fields: [user_id], references: [id])

  @@unique([exam_id, user_id])  // one active session per user per exam
  @@index([school_id])
  @@index([status])
  @@index([expires_at])        // for cleanup queries
}

// ─── Results ──────────────────────────────────────────────────────────────────
model Result {
  id             String   @id @default(uuid())
  school_id      String
  exam_id        String
  user_id        String
  score          Float    // percentage 0–100
  total_points   Int
  earned_points  Int
  time_spent     Int?     // seconds
  answers_json   String   // { questionId: userAnswer } — immutable record
  mode           String   @default("exam")  // RESULT_MODE constant
  passed         Boolean
  attempt_number Int      @default(1)
  date_taken     DateTime @default(now())

  school         School  @relation(fields: [school_id], references: [id], onDelete: Cascade)
  exam           Exam    @relation(fields: [exam_id], references: [id])
  user           User    @relation(fields: [user_id], references: [id])

  @@index([school_id])
  @@index([user_id])
  @@index([exam_id])
  @@index([date_taken])
}

// ─── Games ────────────────────────────────────────────────────────────────────
model Game {
  id            String   @id @default(uuid())
  school_id     String
  creator_id    String
  name          String
  type          String   // GAME_TYPES constant
  status        String   @default("waiting")
  settings_json String?  // game-type-specific config (time per question, max players, etc.)
  join_code     String?  @unique   // 6-char alphanumeric, shown to students
  question_ids  String   @default("[]")  // JSON: string[] — ordered list of question IDs for this game
  started_at    DateTime?
  ended_at      DateTime?
  created_at    DateTime @default(now())

  school        School        @relation(fields: [school_id], references: [id], onDelete: Cascade)
  sessions      GameSession[]

  @@index([school_id])
  @@index([status])
  @@index([join_code])
}

model GameSession {
  id             String   @id @default(uuid())
  game_id        String
  user_id        String
  school_id      String
  score          Float    @default(0)
  answers_json   String   @default("{}")
  rank           Int?     // final rank — set when game finishes
  completed      Boolean  @default(false)
  connected      Boolean  @default(true)  // socket connection status
  joined_at      DateTime @default(now())
  completed_at   DateTime?

  game           Game @relation(fields: [game_id], references: [id], onDelete: Cascade)
  user           User @relation(fields: [user_id], references: [id])

  @@unique([game_id, user_id])
  @@index([game_id])
  @@index([user_id])
}

// ─── Tournaments ──────────────────────────────────────────────────────────────
model Tournament {
  id            String   @id @default(uuid())
  school_id     String
  creator_id    String
  name          String
  description   String?
  status        String   @default("draft")  // TOURNAMENT_STATUS constant
  settings_json String?
  starts_at     DateTime?
  ends_at       DateTime?
  created_at    DateTime @default(now())

  school        School            @relation(fields: [school_id], references: [id], onDelete: Cascade)
  entries       TournamentEntry[]

  @@index([school_id])
  @@index([status])
}

model TournamentEntry {
  id            String   @id @default(uuid())
  tournament_id String
  user_id       String
  school_id     String
  score         Float    @default(0)
  rank          Int?
  completed     Boolean  @default(false)
  registered_at DateTime @default(now())
  completed_at  DateTime?

  tournament    Tournament @relation(fields: [tournament_id], references: [id], onDelete: Cascade)
  user          User       @relation(fields: [user_id], references: [id])

  @@unique([tournament_id, user_id])
  @@index([tournament_id])
  @@index([user_id])
}

// ─── Settings ─────────────────────────────────────────────────────────────────
// Replaces all scattered settings. Every setting has a visibility level.
model Setting {
  id         String   @id @default(uuid())
  school_id  String
  key        String   // e.g. "app.name", "game.max_players", "auth.allow_student_register"
  value      String   // always stored as string — parse on read
  visibility String   @default("admin")  // SETTINGS_VISIBILITY constant
  updated_at DateTime @updatedAt

  school     School @relation(fields: [school_id], references: [id], onDelete: Cascade)

  @@unique([school_id, key])
  @@index([school_id, visibility])
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
model AuditLog {
  id          String   @id @default(uuid())
  school_id   String
  actor_id    String?  // null = system action
  entity_type String   // "question" | "exam" | "user" | "game" | "setting" | "auth"
  entity_id   String
  action      String   // "create" | "update" | "delete" | "login" | "logout" | "export" | "migrate"
  diff_json   String?  // { before: {}, after: {} } for updates
  ip_address  String?
  user_agent  String?
  occurred_at DateTime @default(now())

  school      School @relation(fields: [school_id], references: [id], onDelete: Cascade)
  actor       User?  @relation(fields: [actor_id], references: [id])

  @@index([school_id])
  @@index([actor_id])
  @@index([entity_type, entity_id])
  @@index([occurred_at])
}
```

---

## 7. Normalization Verification

Verify each of the following before accepting the schema as final.

**1NF (No repeating groups):**
- `options_json` is a JSON column — acceptable because the options array is atomic to the question and is always parsed together. Verdict: 1NF satisfied.
- `answers_json` in ExamSession and Result is a JSON snapshot — acceptable as an immutable record. Verdict: 1NF satisfied.
- `tags` stored as comma-separated string — acceptable for simple filtering, but if tag-based analytics are needed later, extract to a `QuestionTag` join table.

**2NF (No partial dependencies on composite keys):**
- `ExamQuestion` composite key is `[exam_id, question_id]`. `order_index` and `points_override` depend on the full composite key. Verdict: 2NF satisfied.
- `ExamClass` composite key is `[exam_id, class_id]`. `assigned_at` depends on the full key. Verdict: 2NF satisfied.

**3NF (No transitive dependencies):**
- `Result` stores `school_id` directly even though `exam_id → school_id` could derive it. This is intentional denormalization for performance and tenant isolation — every tenant query filters by `school_id` first. Verdict: justified and documented.
- `GameSession` stores `school_id` for the same reason. Verdict: justified.

**BCNF:**
- No non-trivial functional dependencies outside primary keys. Verdict: BCNF satisfied.

**Eliminated redundancies from existing codebase:**
- Questions are no longer embedded inside exam objects — they live in `Question` and join via `ExamQuestion`.
- Results are no longer stored inside exam objects — they live in `Result`.
- Game state is no longer duplicated between a game object and individual player objects — `Game` holds global state, `GameSession` holds per-player state.
- Settings are no longer scattered across multiple localStorage keys — all consolidated in `Setting` with visibility levels.

---

## 8. Repository Pattern — Complete Definition

### `src/frontend/infrastructure/IStorageRepository.js`
```javascript
/**
 * The contract every storage implementation must satisfy.
 * Services depend ONLY on this interface — never on a concrete implementation.
 */
export class IStorageRepository {
  /**
   * @param {string} table  - Entity name (e.g. 'questions', 'exams')
   * @param {object} options
   * @param {object}   options.filters   - Exact-match field filters
   * @param {number}   options.limit     - Page size (default 50)
   * @param {number}   options.offset    - Pagination offset (default 0)
   * @param {string}   options.orderBy   - Field to sort by (default 'created_at')
   * @param {string}   options.direction - 'asc' | 'desc' (default 'desc')
   * @param {string}   options.search    - Full-text search string
   * @returns {Promise<{ data: object[], total: number }>}
   */
  async getAll(table, options = {})      { throw new Error('Not implemented: getAll'); }

  /** @returns {Promise<object|null>} */
  async getById(table, id)               { throw new Error('Not implemented: getById'); }

  /** @returns {Promise<object>} The created record including generated id */
  async create(table, data)              { throw new Error('Not implemented: create'); }

  /** @returns {Promise<object>} The updated record */
  async update(table, id, data)          { throw new Error('Not implemented: update'); }

  /** @returns {Promise<void>} */
  async delete(table, id)                { throw new Error('Not implemented: delete'); }

  /** Batch insert — used only by the migration tool */
  async createMany(table, dataArray) {
    return Promise.all(dataArray.map(d => this.create(table, d)));
  }

  /**
   * Custom query for operations that don't fit the generic CRUD pattern.
   * Implementations may override this for specific optimized queries.
   * @param {string} queryName - Identifier for the custom query
   * @param {object} params
   */
  async query(queryName, params = {})    { throw new Error(`Not implemented: query(${queryName})`); }
}
```

### Named Repository Interfaces (document these — implement via `IStorageRepository` + `query()`)

Each of the following is a semantic alias that clarifies which table is being accessed. Services use named methods; the `query()` escape hatch handles complex joins.

```
UserRepository       → table: 'users'
QuestionRepository   → table: 'questions'
ExamRepository       → table: 'exams'
ResultRepository     → table: 'results'
GameRepository       → table: 'games'
TournamentRepository → table: 'tournaments'
SessionRepository    → table: 'exam_sessions'
SettingsRepository   → table: 'settings'
AuditRepository      → table: 'audit_logs'
```

Complex operations not covered by `getAll`/`getById`/`create`/`update`/`delete` must use `query(queryName, params)`:
```javascript
// Example custom queries — implement in both LocalStorageRepository and PrismaRepository:
repo.query('exam.withQuestions',        { examId })
repo.query('result.byUserAndExam',      { userId, examId })
repo.query('game.activeSessions',       { gameId })
repo.query('tournament.leaderboard',    { tournamentId, limit })
repo.query('session.expiredSessions',   { before: new Date() })
repo.query('settings.byVisibility',     { schoolId, visibility })
repo.query('user.byClassWithResults',   { classId })
```

### `src/frontend/infrastructure/LocalStorageRepository.js`
```javascript
import { IStorageRepository } from './IStorageRepository.js';
import { IdGenerator } from './IdGenerator.js';
import { NotFoundError } from '../../shared/errors.js';

// Maps entity names to existing localStorage keys — preserves all current data
const TABLE_KEYS = {
  users:         'quizUsers',
  classes:       'quizClasses',
  categories:    'quizCategories',
  questions:     'quizQuestions',
  exams:         'quizExams',
  results:       'quizResults',
  games:         'quizGames',
  tournaments:   'quizTournaments',
  exam_sessions: 'quizExamSessions',
  settings:      'quizSettings',
  audit_logs:    'quizAuditLogs',
};

const CUSTOM_QUERIES = {
  'exam.withQuestions': (store, { examId }) => {
    const exam = store.getById_sync('exams', examId);
    if (!exam) return null;
    const examQuestions = store.getAll_sync('exam_questions').filter(eq => eq.exam_id === examId);
    const questionIds = examQuestions.map(eq => eq.question_id);
    const questions = store.getAll_sync('questions').filter(q => questionIds.includes(q.id));
    return { ...exam, questions };
  },
  'settings.byVisibility': (store, { visibility }) => {
    const all = store.getAll_sync('settings');
    const visOrder = ['public', 'teacher', 'admin', 'system'];
    const maxLevel = visOrder.indexOf(visibility);
    return all.filter(s => visOrder.indexOf(s.visibility) <= maxLevel);
  },
  'session.expiredSessions': (store, { before }) => {
    return store.getAll_sync('exam_sessions').filter(s =>
      s.status === 'active' && new Date(s.expires_at) < new Date(before)
    );
  },
  // Add remaining custom queries following this pattern
};

export class LocalStorageRepository extends IStorageRepository {
  #readTable(table) {
    const key = TABLE_KEYS[table] || table;
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }

  #writeTable(table, data) {
    localStorage.setItem(TABLE_KEYS[table] || table, JSON.stringify(data));
  }

  // Synchronous helpers used by custom queries only
  getById_sync(table, id)  { return this.#readTable(table).find(i => i.id === id) ?? null; }
  getAll_sync(table)        { return this.#readTable(table); }

  async getAll(table, {
    filters = {}, limit = 50, offset = 0,
    orderBy = 'created_at', direction = 'desc', search = null
  } = {}) {
    let data = this.#readTable(table);
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) data = data.filter(i => i[k] === v);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(i => Object.values(i).some(v => typeof v === 'string' && v.toLowerCase().includes(q)));
    }
    const total = data.length;
    data = [...data].sort((a, b) => {
      const cmp = String(a[orderBy] ?? '').localeCompare(String(b[orderBy] ?? ''), undefined, { numeric: true });
      return direction === 'desc' ? -cmp : cmp;
    });
    return { data: data.slice(offset, offset + limit), total };
  }

  async getById(table, id) { return this.getById_sync(table, id); }

  async create(table, data) {
    const items  = this.#readTable(table);
    const record = { ...data, id: data.id || IdGenerator.generate(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    items.push(record);
    this.#writeTable(table, items);
    return record;
  }

  async update(table, id, data) {
    const items = this.#readTable(table);
    const idx   = items.findIndex(i => i.id === id);
    if (idx === -1) throw new NotFoundError(table);
    items[idx] = { ...items[idx], ...data, id, updated_at: new Date().toISOString() };
    this.#writeTable(table, items);
    return items[idx];
  }

  async delete(table, id) {
    const items    = this.#readTable(table);
    const filtered = items.filter(i => i.id !== id);
    if (filtered.length === items.length) throw new NotFoundError(table);
    this.#writeTable(table, filtered);
  }

  async query(queryName, params = {}) {
    const fn = CUSTOM_QUERIES[queryName];
    if (!fn) throw new Error(`Unknown custom query: ${queryName}`);
    return fn(this, params);
  }
}
```

### `src/frontend/infrastructure/CacheDecorator.js`
```javascript
import { IStorageRepository } from './IStorageRepository.js';

export class CacheDecorator extends IStorageRepository {
  #inner; #cache = new Map(); #ttl;

  constructor(inner, ttlMs = 30000) { super(); this.#inner = inner; this.#ttl = ttlMs; }

  #key(table, opts) { return `${table}::${JSON.stringify(opts)}`; }
  #invalidate(table) { for (const k of this.#cache.keys()) if (k.startsWith(`${table}::`)) this.#cache.delete(k); }

  async getAll(table, opts = {}) {
    const k = this.#key(table, opts);
    const cached = this.#cache.get(k);
    if (cached && Date.now() - cached.ts < this.#ttl) return cached.data;
    const result = await this.#inner.getAll(table, opts);
    this.#cache.set(k, { data: result, ts: Date.now() });
    return result;
  }

  async getById(table, id)       { return this.#inner.getById(table, id); }
  async create(table, data)      { const r = await this.#inner.create(table, data);    this.#invalidate(table); return r; }
  async update(table, id, data)  { const r = await this.#inner.update(table, id, data); this.#invalidate(table); return r; }
  async delete(table, id)        { await this.#inner.delete(table, id);                 this.#invalidate(table); }
  async query(name, params)      { return this.#inner.query(name, params); }
}
```

### `src/frontend/infrastructure/ApiRepository.js`
```javascript
import { IStorageRepository } from './IStorageRepository.js';
import { UnauthorizedError, AppError, NotFoundError } from '../../shared/errors.js';

export class ApiRepository extends IStorageRepository {
  #baseUrl; #getToken; #onUnauthorized;

  constructor({ baseUrl, getToken, onUnauthorized }) {
    super();
    this.#baseUrl       = baseUrl.replace(/\/$/, '');
    this.#getToken      = getToken;
    this.#onUnauthorized = onUnauthorized || (() => { window.location.href = '/login'; });
  }

  async #fetch(method, path, body = null) {
    const token   = this.#getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${this.#baseUrl}${path}`, {
      method, headers, credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      const refreshed = await this.#tryRefresh();
      if (refreshed) {
        // Retry once with new token
        headers['Authorization'] = `Bearer ${this.#getToken()}`;
        res = await fetch(`${this.#baseUrl}${path}`, {
          method, headers, credentials: 'include',
          body: body ? JSON.stringify(body) : undefined,
        });
      } else {
        this.#onUnauthorized();
        throw new UnauthorizedError();
      }
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) throw new NotFoundError(json.message || path);
      throw new AppError(json.code || 'API_ERROR', json.message || 'Request failed', res.status);
    }
    return json;
  }

  async #tryRefresh() {
    try {
      const res = await fetch(`${this.#baseUrl}/api/v1/auth/refresh`, {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) return false;
      const { accessToken } = await res.json();
      window.__AUTH_REFRESH_CALLBACK__?.(accessToken);
      return true;
    } catch { return false; }
  }

  async getAll(table, { filters = {}, limit = 50, offset = 0, orderBy = 'created_at', direction = 'desc', search = null } = {}) {
    const p = new URLSearchParams({ limit, offset, orderBy, direction, ...filters });
    if (search) p.set('search', search);
    return this.#fetch('GET', `/api/v1/${table}?${p}`);
  }

  async getById(table, id)       { return this.#fetch('GET',    `/api/v1/${table}/${id}`); }
  async create(table, data)      { return this.#fetch('POST',   `/api/v1/${table}`, data); }
  async update(table, id, data)  { return this.#fetch('PATCH',  `/api/v1/${table}/${id}`, data); }
  async delete(table, id)        { return this.#fetch('DELETE', `/api/v1/${table}/${id}`); }
  async query(name, params)      { return this.#fetch('POST',   `/api/v1/query/${name}`, params); }
}
```

---

## 9. Settings Architecture

Settings are no longer a flat object. They are split into four visibility tiers. This is enforced in both the data model and the API.

### Settings split — implement in `SettingsService.js`
```javascript
// Visibility tiers (matches SETTINGS_VISIBILITY constant):
// PUBLIC  — sent to any browser, even before login (app name, logo, login page message)
// TEACHER — sent after login to admin/teacher role (exam defaults, question limits)
// ADMIN   — sent after login to admin role only (registration codes, recovery settings)
// SYSTEM  — NEVER sent to any client (internal keys, integration secrets)

export class SettingsService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  // Returns ONLY public settings — safe to call from unauthenticated pages
  async getPublicSettings(schoolId) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: 'public' });
  }

  // Returns public + teacher settings — requires authenticated teacher/admin
  async getTeacherSettings(schoolId) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: 'teacher' });
  }

  // Returns public + teacher + admin settings — requires admin role
  async getAdminSettings(schoolId) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: 'admin' });
  }

  // NEVER has a getSystemSettings() method — system settings are never returned to any client

  async updateSetting(schoolId, key, value, actorId) {
    const existing = await this.#repo.getAll('settings', { filters: { school_id: schoolId, key } });
    if (existing.data.length > 0) {
      return this.#repo.update('settings', existing.data[0].id, { value });
    }
    return this.#repo.create('settings', { school_id: schoolId, key, value });
  }
}
```

### Settings API route — enforces visibility on every response
```javascript
// GET /api/v1/settings/public — no auth required
router.get('/public', async (req, res) => {
  const schoolId = req.query.school_id || config.defaultSchoolId;
  const settings = await settingsService.getPublicSettings(schoolId);
  res.json(settings);
});

// GET /api/v1/settings/teacher — requires teacher/admin
router.get('/teacher', authMiddleware, requireRole(ROLES.ADMIN), async (req, res) => {
  res.json(await settingsService.getTeacherSettings(req.schoolId));
});

// GET /api/v1/settings/admin — requires admin
router.get('/admin', authMiddleware, requireRole(ROLES.ADMIN), async (req, res) => {
  res.json(await settingsService.getAdminSettings(req.schoolId));
});

// No route for SYSTEM settings — they are never exposed via API.
```

---

## 10. Session Management

Active exam sessions must be tracked, time-limited, and cleaned up automatically.

### Session lifecycle
```
Student opens exam → ExamSession created (status: active, expires_at = now + duration)
Student answers    → ExamSession.answers_json updated + last_heartbeat updated
Student submits    → ExamSession status = completed → Result created
Timeout reached    → ExamSession status = expired → Result created with partial answers
Student abandons   → Heartbeat stops → Cleanup job marks session abandoned after 5 min
```

### `src/backend/services/SessionService.js`
```javascript
import { SessionError, NotFoundError } from '../../shared/errors.js';
import { SESSION_STATUS } from '../../shared/constants.js';

export class SessionService {
  #repo; #logger;

  constructor(repo, logger) {
    this.#repo   = repo;
    this.#logger = logger;
  }

  async createSession({ schoolId, examId, userId, durationMinutes }) {
    // Enforce: one active session per user per exam
    const existing = await this.#repo.getAll('exam_sessions', {
      filters: { exam_id: examId, user_id: userId, status: SESSION_STATUS.ACTIVE }
    });
    if (existing.total > 0) {
      // Return existing session — student may have refreshed the page
      return existing.data[0];
    }

    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h default if no limit

    return this.#repo.create('exam_sessions', {
      school_id:   schoolId,
      exam_id:     examId,
      user_id:     userId,
      status:      SESSION_STATUS.ACTIVE,
      answers_json: '{}',
      current_question_index: 0,
      expires_at:  expiresAt.toISOString(),
      last_heartbeat: new Date().toISOString(),
    });
  }

  async saveAnswer({ sessionId, questionId, answer }) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session) throw new NotFoundError('ExamSession');
    if (session.status !== SESSION_STATUS.ACTIVE) throw new SessionError('Session is not active');
    if (new Date(session.expires_at) < new Date()) throw new SessionError('Session has expired');

    const answers = JSON.parse(session.answers_json || '{}');
    answers[questionId] = answer;

    return this.#repo.update('exam_sessions', sessionId, {
      answers_json:   JSON.stringify(answers),
      last_heartbeat: new Date().toISOString(),
    });
  }

  async heartbeat(sessionId) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session || session.status !== SESSION_STATUS.ACTIVE) return;
    await this.#repo.update('exam_sessions', sessionId, {
      last_heartbeat: new Date().toISOString(),
    });
  }

  async completeSession(sessionId, resultService) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session) throw new NotFoundError('ExamSession');

    const result = await resultService.createFromSession(session);
    await this.#repo.update('exam_sessions', sessionId, {
      status:       SESSION_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
    });
    return result;
  }

  // Called by a periodic cleanup job (every 5 minutes)
  async cleanupExpiredSessions() {
    const expired = await this.#repo.query('session.expiredSessions', { before: new Date() });
    for (const session of expired) {
      this.#logger.warn({ sessionId: session.id }, 'Auto-expiring abandoned session');
      await this.#repo.update('exam_sessions', session.id, { status: SESSION_STATUS.EXPIRED });
    }
    return expired.length;
  }
}
```

### Session cleanup job — run in `server.js`
```javascript
// Run cleanup every 5 minutes
setInterval(async () => {
  try {
    const count = await sessionService.cleanupExpiredSessions();
    if (count > 0) logger.info({ count }, 'Expired sessions cleaned up');
  } catch (err) {
    logger.error({ err }, 'Session cleanup failed');
  }
}, 5 * 60 * 1000);
```

---

## 11. Socket.io Architecture (Realtime)

### Non-negotiable rules
- **One `io()` call** — in `src/backend/realtime/socket.server.js`. Never call it again anywhere.
- **One socket per browser tab** — `src/frontend/infrastructure/socket.client.js` is a singleton.
- **JWT on every socket** — verify the token during the Socket.io handshake before allowing any event.
- **Rooms for targeting** — never emit sensitive data globally. Use rooms: `school:{id}`, `game:{id}`, `exam:{id}`.
- **Cleanup on disconnect** — every player removed from all rooms, game session marked disconnected.
- **Never send correct answers** to the client before the answer phase.

### `src/backend/realtime/socket.server.js`
```javascript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter'; // only in SaaS mode
import { config } from '../config.js';
import { socketAuthMiddleware } from './socket.auth.js';
import { registerGameHandlers } from './handlers/game.handler.js';
import { registerTournamentHandlers } from './handlers/tournament.handler.js';
import { registerSessionHandlers } from './handlers/session.handler.js';
import { handleDisconnect } from './socket.cleanup.js';
import { logger } from '../logger.js';

let _io = null;

export function initSocketServer(httpServer, services) {
  if (_io) throw new Error('Socket.io already initialized — do not call initSocketServer twice');

  _io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    // Reconnection handled client-side — server just tracks connections
  });

  // Attach Redis adapter for multi-instance SaaS (skip for local mode)
  if (config.isSaaS && config.redisUrl) {
    const { createClient } = await import('redis');
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    _io.adapter(createAdapter(pub, sub));
    logger.info('Socket.io Redis adapter attached');
  }

  // Verify JWT on every socket connection before any event fires
  _io.use(socketAuthMiddleware);

  _io.on('connection', (socket) => {
    logger.info({ userId: socket.data.user.id, socketId: socket.id }, 'Socket connected');

    // Join user's school room automatically
    socket.join(`school:${socket.data.user.school_id}`);

    // Register domain event handlers
    registerGameHandlers(socket, _io, services);
    registerTournamentHandlers(socket, _io, services);
    registerSessionHandlers(socket, _io, services);

    socket.on('disconnect', (reason) => {
      logger.info({ userId: socket.data.user.id, reason }, 'Socket disconnected');
      handleDisconnect(socket, _io, services);
    });
  });

  return _io;
}

export function getIO() {
  if (!_io) throw new Error('Socket.io not initialized. Call initSocketServer first.');
  return _io;
}
```

### `src/backend/realtime/socket.auth.js`
```javascript
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function socketAuthMiddleware(socket, next) {
  // Token can come from handshake auth or as query param for clients that can't set headers
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('UNAUTHORIZED: No token provided'));

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    socket.data.user = payload; // { id, school_id, role, username }
    next();
  } catch {
    next(new Error('UNAUTHORIZED: Invalid or expired token'));
  }
}
```

### `src/backend/realtime/socket.cleanup.js`
```javascript
export async function handleDisconnect(socket, io, { gameService, sessionService }) {
  const { user } = socket.data;

  // Mark player as disconnected in any active game sessions
  try {
    await gameService.markPlayerDisconnected(user.id);
  } catch (err) {
    // Non-fatal — player may not have been in a game
  }

  // Notify game room that player disconnected (others see them as offline)
  const gameRoom = socket.data.activeGameId;
  if (gameRoom) {
    io.to(`game:${gameRoom}`).emit('player:disconnected', { userId: user.id });
  }

  // Socket.io automatically removes the socket from all rooms on disconnect
  // We only need to clean up our application-level state above
}
```

### `src/backend/realtime/handlers/game.handler.js`
```javascript
import { SOCKET_EVENTS } from '../../../shared/constants.js';

export function registerGameHandlers(socket, io, { gameService }) {

  socket.on(SOCKET_EVENTS.GAME_JOIN, async ({ gameId, joinCode }) => {
    try {
      const session = await gameService.joinGame({
        gameId: gameId || await gameService.findByJoinCode(joinCode),
        userId:   socket.data.user.id,
        schoolId: socket.data.user.school_id,
      });

      socket.join(`game:${session.game_id}`);
      socket.data.activeGameId = session.game_id;

      // Notify everyone in the room that a new player joined
      io.to(`game:${session.game_id}`).emit('player:joined', {
        userId:   socket.data.user.id,
        username: socket.data.user.username,
        // NEVER include correct answers or admin state here
      });

      // Send current game state ONLY to the joining player
      const gameState = await gameService.getClientState(session.game_id);
      socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, gameState);

    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.GAME_ANSWER, async ({ gameId, questionId, answer }) => {
    try {
      const result = await gameService.recordAnswer({
        gameId, userId: socket.data.user.id, questionId, answer,
      });

      // Send result ONLY to the answering player — not broadcast
      socket.emit('answer:result', {
        correct:    result.correct,
        points:     result.points,
        // correct answer revealed only if game settings allow immediate feedback
        ...(result.showAnswer && { correctAnswer: result.correctAnswer }),
      });

      // Broadcast updated leaderboard to everyone in the game room
      const scores = await gameService.getScores(gameId);
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.GAME_SCORES, scores);

    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: err.code, message: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.GAME_LEAVE, async ({ gameId }) => {
    socket.leave(`game:${gameId}`);
    socket.data.activeGameId = null;
    io.to(`game:${gameId}`).emit('player:left', { userId: socket.data.user.id });
  });
}
```

### `src/frontend/infrastructure/socket.client.js` — Singleton
```javascript
import { io } from 'socket.io-client';

let _socket = null;

/**
 * Returns the single socket.io-client instance for the entire app.
 * Creates it on first call. All subsequent calls return the same instance.
 * NEVER call io() anywhere else in the frontend codebase.
 */
export function getSocket(token) {
  if (_socket) return _socket;

  _socket = io(window.APP_CONFIG?.socketUrl || '', {
    auth:                  { token },
    autoConnect:           false,   // Connect explicitly — never connects before auth
    reconnection:          true,
    reconnectionAttempts:  5,
    reconnectionDelay:     1000,
    reconnectionDelayMax:  5000,
    timeout:               10000,
  });

  _socket.on('connect',       ()  => console.info('[Socket] Connected:', _socket.id));
  _socket.on('disconnect',    (r) => console.warn('[Socket] Disconnected:', r));
  _socket.on('connect_error', (e) => console.error('[Socket] Connection error:', e.message));
  _socket.on('reconnect',     (n) => console.info('[Socket] Reconnected after', n, 'attempts'));
  _socket.on('reconnect_failed', () => console.error('[Socket] Reconnection failed permanently'));

  return _socket;
}

/**
 * Remove ALL listeners for the given event names.
 * Call this when navigating away from a page that registered socket listeners.
 * Prevents duplicate handlers accumulating on re-navigation.
 *
 * Usage:
 *   // On page load:
 *   socket.on('game:scores', handleScores);
 *   // On page unload / router change:
 *   cleanupSocketListeners(['game:scores', 'game:question', 'game:finished']);
 */
export function cleanupSocketListeners(eventNames = []) {
  if (!_socket) return;
  for (const event of eventNames) {
    _socket.off(event);
  }
}

/**
 * Full disconnect. Call ONLY on logout.
 * Resets the singleton so the next login creates a fresh connection.
 */
export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket.removeAllListeners();
    _socket = null;
  }
}
```

### Mandatory pattern for every page that uses sockets

Every page/component that registers socket listeners MUST follow this pattern. No exceptions.

```javascript
// src/frontend/ui/pages/games/GamePage.js
import { getSocket, cleanupSocketListeners } from '../../../infrastructure/socket.client.js';
import { SOCKET_EVENTS } from '../../../../shared/constants.js';
import { getContainer } from '../../../container.js';

// Declare ALL events this page listens to in ONE place
const PAGE_EVENTS = [
  SOCKET_EVENTS.GAME_STATE_UPDATE,
  SOCKET_EVENTS.GAME_QUESTION,
  SOCKET_EVENTS.GAME_SCORES,
  SOCKET_EVENTS.GAME_FINISHED,
  SOCKET_EVENTS.SESSION_EXPIRED,
  'player:joined',
  'player:left',
  'answer:result',
];

export function initGamePage(gameId) {
  const { authSvc } = getContainer();
  const socket = getSocket(authSvc.getToken());

  if (!socket.connected) socket.connect();

  // Register handlers
  socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, renderGameState);
  socket.on(SOCKET_EVENTS.GAME_QUESTION,     renderQuestion);
  socket.on(SOCKET_EVENTS.GAME_SCORES,       renderScoreboard);
  socket.on(SOCKET_EVENTS.GAME_FINISHED,     renderFinished);
  socket.on('player:joined',                 handlePlayerJoined);
  socket.on('player:left',                   handlePlayerLeft);
  socket.on('answer:result',                 handleAnswerResult);
  socket.on(SOCKET_EVENTS.SESSION_EXPIRED,   handleExpired);

  // Join the game room
  socket.emit(SOCKET_EVENTS.GAME_JOIN, { gameId });

  // Return cleanup function — router MUST call this on navigation
  return function cleanup() {
    socket.emit(SOCKET_EVENTS.GAME_LEAVE, { gameId });
    cleanupSocketListeners(PAGE_EVENTS);
  };
}
```

---

## 12. Structured Logging

Replace every `console.log`, `console.warn`, and `console.error` with Pino. This is mandatory.

### `src/backend/logger.js`
```javascript
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  base:  { service: 'quiz-app', mode: config.mode },
  // Human-readable in development, raw JSON in production
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
  }),
});

/**
 * Security-specific log helper.
 * Always written at WARN level regardless of LOG_LEVEL setting.
 * Use for: login failures, unauthorized access, admin mutations, data exports.
 */
export function securityLog(event, details = {}) {
  logger.warn({ type: 'SECURITY', event, ...details });
}
```

### Log level policy — enforce this in every file

| Level | When to use |
|---|---|
| `logger.debug` | Development only. Socket events, cache hits, DB query details. Never in production. |
| `logger.info` | Normal notable events. Session started, exam submitted, user logged in successfully. |
| `logger.warn` | Unexpected but handled. Login failure, rate limit hit, session expired, deprecated usage. |
| `logger.error` | Something failed that should not. DB error, unhandled exception, third-party failure. |
| `securityLog()` | Always log. Login failures, unauthorized route access, admin actions, bulk exports, migration runs. |

### Request logging middleware

```javascript
// src/backend/middleware/logging.middleware.js
import { logger } from '../logger.js';

export function loggingMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'debug';               // API traffic is debug — don't flood info logs
    logger[level]({
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      ms,
      userId:   req.user?.id || null,
    });
  });
  next();
}
```

---

## 13. Service Layer — Full Catalogue & Patterns

All services share this pattern. Implement every service listed. No exceptions.

```javascript
// Universal service pattern
export class SomeService {
  #repo;
  #logger;

  // Dependencies injected — never instantiated inside
  constructor(repo, logger) {
    this.#repo   = repo;
    this.#logger = logger;
  }

  // Every method: validate → enforce permissions → execute → log → return
  async doSomething(data, currentUser) {
    // 1. Validate input (Zod schema already ran in route middleware — this is domain-level)
    if (!data.requiredField) throw new ValidationError({ requiredField: ['Required'] });

    // 2. Enforce ownership / tenant isolation
    const existing = await this.#repo.getById('table', data.id);
    if (!existing)                          throw new NotFoundError('Entity');
    if (existing.school_id !== currentUser.school_id) throw new ForbiddenError();

    // 3. Apply business rules
    if (existing.status === 'archived')     throw new ValidationError({ status: ['Cannot modify archived entity'] });

    // 4. Persist
    const result = await this.#repo.update('table', data.id, data);

    // 5. Log (never log passwords, tokens, or full answer keys)
    this.#logger.info({ entityId: data.id, actorId: currentUser.id }, 'Entity updated');

    return result;
  }
}
```

### Complete service responsibilities

**AuthService**
- `login(username, password, schoolSlug?)` → `{ accessToken, user }`
- `logout(refreshToken)` → revoke token
- `refresh(rawRefreshToken)` → `{ accessToken }`
- `changePassword(userId, oldPassword, newPassword)` → void
- `getToken()` → string (frontend only — stores access token in memory)
- `getCurrentUser()` → User | null
- `isAuthenticated()` → boolean
- `hasRole(...roles)` → boolean

**UserService**
- `list(filters, pagination)` → `{ data, total }`
- `getById(id)` → User
- `create(data)` → User (hashes password internally)
- `update(id, data)` → User
- `delete(id)` → void (check: cannot delete self, cannot delete last admin)
- `changeStatus(id, status)` → User
- `assignToClass(userId, classId)` → User
- `resetPassword(userId, newPassword)` → void (admin action)

**QuestionService**
- `list(filters, pagination)` → `{ data, total }`
- `getById(id)` → Question
- `create(data)` → Question
- `update(id, data)` → Question
- `delete(id)` → void (check: cannot delete if used in active exam)
- `bulkImport(questionsArray)` → `{ imported, errors }`
- `getByCategory(categoryId)` → Question[]
- `getStats(schoolId)` → `{ total, byType, byDifficulty }`

**ExamService**
- `list(filters, pagination)` → `{ data, total }`
- `getById(id)` → Exam
- `getWithQuestions(id)` → Exam & { questions: Question[] }
- `create(data)` → Exam
- `update(id, data)` → Exam
- `delete(id)` → void (check: cannot delete if has results)
- `addQuestion(examId, questionId, orderIndex?)` → ExamQuestion
- `removeQuestion(examId, questionId)` → void
- `reorderQuestions(examId, orderedQuestionIds)` → void
- `publish(examId)` → Exam (validates ≥1 question, status=draft)
- `archive(examId)` → Exam
- `assignToClass(examId, classId)` → ExamClass
- `removeFromClass(examId, classId)` → void
- `getAvailableForStudent(userId)` → Exam[] (active exams assigned to student's class)

**SessionService** (see Section 10 for full implementation)

**ResultService**
- `createFromSession(session)` → Result (calculates score, earned_points, passed)
- `getByUser(userId, pagination)` → `{ data, total }`
- `getByExam(examId, pagination)` → `{ data, total }`
- `getById(id)` → Result
- `getStatsByExam(examId)` → `{ avg, min, max, passRate, total }`
- `getStatsByUser(userId)` → `{ avg, totalExams, passRate }`

**ClassService**
- `list(filters)` → `{ data, total }`
- `getById(id)` → Class
- `create(data)` → Class
- `update(id, data)` → Class
- `delete(id)` → void (check: must be empty — no students assigned)
- `getStudents(classId)` → User[]

**CategoryService**
- `list(filters)` → `{ data, total }`
- `getTree(schoolId)` → Category[] with nested children
- `getById(id)` → Category
- `create(data)` → Category
- `update(id, data)` → Category
- `delete(id)` → void (check: no questions assigned, no children)
- `moveQuestion(questionId, newCategoryId)` → Question

**GameService**
- `create(data)` → Game (generates unique 6-char join_code)
- `getById(id)` → Game
- `findByJoinCode(code)` → Game
- `joinGame({ gameId, userId, schoolId })` → GameSession
- `start(gameId)` → Game (status: waiting → active)
- `recordAnswer({ gameId, userId, questionId, answer })` → `{ correct, points, showAnswer, correctAnswer? }`
- `getScores(gameId)` → `{ userId, username, score, rank }[]`
- `getClientState(gameId)` → safe game state (NO correct answers included)
- `finish(gameId)` → Game (calculates final ranks, status → finished)
- `markPlayerDisconnected(userId)` → void

**TournamentService**
- `create(data)` → Tournament
- `open(id)` → Tournament (status: draft → open)
- `close(id)` → Tournament (status: open → active)
- `register(tournamentId, userId)` → TournamentEntry
- `getLeaderboard(tournamentId)` → `{ userId, username, score, rank }[]`
- `finish(id)` → Tournament (calculates final ranks)

**SettingsService** (see Section 9 for full implementation)

**AuditService**
- `log({ schoolId, actorId, entityType, entityId, action, diff?, ip?, userAgent? })` → void
- Rule: never let audit failure crash the calling operation — wrap in `try/catch` that only logs

---

## 14. Dependency Injection Container

### `src/frontend/container.js`

```javascript
import { LocalStorageRepository } from './infrastructure/LocalStorageRepository.js';
import { ApiRepository }          from './infrastructure/ApiRepository.js';
import { CacheDecorator }         from './infrastructure/CacheDecorator.js';
import { AuthService }            from './services/AuthService.js';
import { UserService }            from './services/UserService.js';
import { QuestionService }        from './services/QuestionService.js';
import { ExamService }            from './services/ExamService.js';
import { ResultService }          from './services/ResultService.js';
import { ClassService }           from './services/ClassService.js';
import { CategoryService }        from './services/CategoryService.js';
import { GameService }            from './services/GameService.js';
import { TournamentService }      from './services/TournamentService.js';
import { SessionService }         from './services/SessionService.js';
import { SettingsService }        from './services/SettingsService.js';

let _container = null;

export function createContainer(appConfig = {}) {
  const { mode = 'local', apiUrl, onUnauthorized } = appConfig;

  let repo;

  if (mode === 'saas') {
    repo = new ApiRepository({
      baseUrl:        apiUrl,
      getToken:       () => _container?.authSvc?.getToken() ?? null,
      onUnauthorized: onUnauthorized || (() => { window.location.href = '/login'; }),
    });
    // No CacheDecorator in SaaS mode — server handles caching at its own layer
  } else {
    // Local mode: wrap localStorage with a 30-second in-memory cache
    repo = new CacheDecorator(new LocalStorageRepository(), 30_000);
  }

  // Construct all services with injected repository
  // Order matters: services that depend on other services come after their dependencies
  const authSvc       = new AuthService(repo);
  const userSvc       = new UserService(repo);
  const categorySvc   = new CategoryService(repo);
  const questionSvc   = new QuestionService(repo);
  const classSvc      = new ClassService(repo);
  const sessionSvc    = new SessionService(repo);
  const examSvc       = new ExamService(repo, questionSvc);
  const resultSvc     = new ResultService(repo, examSvc);
  const gameSvc       = new GameService(repo);
  const tournamentSvc = new TournamentService(repo, gameSvc);
  const settingsSvc   = new SettingsService(repo);

  _container = {
    authSvc, userSvc, categorySvc, questionSvc,
    classSvc, sessionSvc, examSvc, resultSvc,
    gameSvc, tournamentSvc, settingsSvc,
    repo,  // Expose repo only for the migration tool — never access directly from UI
  };

  return _container;
}

export function getContainer() {
  if (!_container) throw new Error('Container not initialized. Call createContainer() in main.js first.');
  return _container;
}
```

### `src/frontend/main.js`

```javascript
import { createContainer } from './container.js';
import { initRouter }      from './ui/router.js';
import { initEventBus }    from './utils/eventBus.js';

// APP_CONFIG is injected by the server into index.html:
// <script>window.APP_CONFIG = { mode: "saas", apiUrl: "/api/v1", socketUrl: "/" };</script>
// In local mode: <script>window.APP_CONFIG = { mode: "local" };</script>
const appConfig = window.APP_CONFIG || { mode: 'local' };

createContainer({
  mode:           appConfig.mode,
  apiUrl:         appConfig.apiUrl,
  onUnauthorized: () => { window.location.href = '/login'; },
});

initEventBus();   // Global error + notification bus
initRouter();     // Client-side routing — reads container internally via getContainer()
```

---

## 15. Event Bus & Error Handling

### `src/frontend/utils/eventBus.js`

```javascript
const _bus = new EventTarget();

export const EventBus = {
  emit: (event, detail)   => _bus.dispatchEvent(new CustomEvent(event, { detail })),
  on:   (event, handler)  => _bus.addEventListener(event, e => handler(e.detail)),
  off:  (event, handler)  => _bus.removeEventListener(event, handler),
};

export function initEventBus() {
  EventBus.on('app:error',   ({ message, code }) => showToast(message, 'error'));
  EventBus.on('app:success', ({ message })        => showToast(message, 'success'));
  EventBus.on('app:warning', ({ message })        => showToast(message, 'warning'));
}

/**
 * Wraps any async operation with centralized error handling.
 * Use this in ALL UI event handlers instead of try/catch boilerplate.
 *
 * @param {Function} fn        - Async function to execute
 * @param {string}   successMsg - Optional success toast message
 */
export async function withError(fn, successMsg = null) {
  try {
    const result = await fn();
    if (successMsg) EventBus.emit('app:success', { message: successMsg });
    return result;
  } catch (err) {
    // ValidationError: show field-level errors inline, not a toast
    if (err.code === 'VALIDATION_ERROR' && err.fields) {
      EventBus.emit('app:validation', { fields: err.fields });
    } else {
      EventBus.emit('app:error', { message: err.message, code: err.code });
    }
    throw err; // Re-throw so the caller can still react if needed
  }
}

function showToast(message, type = 'info') {
  // Remove any existing toast of the same type to prevent stacking
  document.querySelectorAll(`.toast--${type}`).forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className    = `toast toast--${type}`;
  toast.textContent  = message;
  toast.setAttribute('role', 'alert');
  document.body.appendChild(toast);

  // Auto-dismiss after 4 seconds, with CSS transition
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}
```

### Usage pattern in ALL UI code

```javascript
// src/frontend/ui/pages/questions/QuestionForm.js
import { withError } from '../../../utils/eventBus.js';
import { getContainer } from '../../../container.js';

async function handleSubmit(formData) {
  const { questionSvc } = getContainer();

  await withError(
    () => questionSvc.create(formData),
    'Question created successfully'
  );

  refreshList(); // Only runs if no error was thrown
}
```

---

## 16. XSS Prevention

### `src/frontend/utils/sanitize.js`

```javascript
/**
 * Escape ALL user-provided text before inserting into the DOM.
 * Use for: question text, exam names, usernames, category names — any user content.
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safe alternative to element.innerHTML = userContent.
 * If DOMPurify is loaded (CDN), uses it for rich content.
 * Falls back to textContent for plain text fields.
 *
 * @param {HTMLElement} element
 * @param {string}      content   - User-provided content
 * @param {boolean}     allowHTML - true only for fields explicitly designed for HTML (e.g. question text with formatting)
 */
export function safeSetHTML(element, content, allowHTML = false) {
  if (!allowHTML) {
    element.textContent = content; // Safest — zero XSS risk
    return;
  }
  if (window.DOMPurify) {
    element.innerHTML = window.DOMPurify.sanitize(content, {
      ALLOWED_TAGS:  ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'ul', 'ol', 'li', 'code', 'pre'],
      ALLOWED_ATTR:  [],  // No attributes — prevents href/onclick injection
    });
  } else {
    // DOMPurify not loaded — fall back to safe text
    element.textContent = content;
  }
}
```

**Hard rule:** Search the entire codebase for `innerHTML`. Every occurrence must be replaced with `safeSetHTML()` or `element.textContent`. Zero exceptions.

---

## 17. Backend Server Bootstrap

### `src/backend/server.js`

```javascript
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config }              from './config.js';
import { logger }              from './logger.js';
import { loggingMiddleware }   from './middleware/logging.middleware.js';
import { errorMiddleware }     from './middleware/error.middleware.js';
import { apiRateLimiter }      from './middleware/rateLimit.middleware.js';
import { initSocketServer }    from './realtime/socket.server.js';

// Routes
import authRoutes        from './routes/auth.routes.js';
import usersRoutes       from './routes/users.routes.js';
import classesRoutes     from './routes/classes.routes.js';
import categoriesRoutes  from './routes/categories.routes.js';
import questionsRoutes   from './routes/questions.routes.js';
import examsRoutes       from './routes/exams.routes.js';
import resultsRoutes     from './routes/results.routes.js';
import gamesRoutes       from './routes/games.routes.js';
import tournamentsRoutes from './routes/tournaments.routes.js';
import settingsRoutes    from './routes/settings.routes.js';
import migrateRoutes     from './routes/migrate.routes.js';

// Services (needed by socket handlers and cleanup job)
import { SessionService }    from './services/SessionService.js';
import { GameService }       from './services/GameService.js';
import { PrismaRepository }  from './infrastructure/PrismaRepository.js';
import { prisma }            from './prisma.js';

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],  // Allow inline CSS for existing UI
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],       // Allow WebSocket
    },
  },
}));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));  // 10mb allows large migration payloads
app.use(loggingMiddleware);
app.use('/api/', apiRateLimiter);

// ── Inject APP_CONFIG into index.html ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Quiz App</title></head>
<body>
<script>
window.APP_CONFIG = ${JSON.stringify({
    mode:      config.isSaaS ? 'saas' : 'local',
    apiUrl:    '/api/v1',
    socketUrl: '/',
  })};
</script>
<script src="/bundle.js"></script>
</body>
</html>`);
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',        authRoutes);        // Public — own rate limiter inside
app.use('/api/v1/users',       usersRoutes);
app.use('/api/v1/classes',     classesRoutes);
app.use('/api/v1/categories',  categoriesRoutes);
app.use('/api/v1/questions',   questionsRoutes);
app.use('/api/v1/exams',       examsRoutes);
app.use('/api/v1/results',     resultsRoutes);
app.use('/api/v1/games',       gamesRoutes);
app.use('/api/v1/tournaments', tournamentsRoutes);
app.use('/api/v1/settings',    settingsRoutes);
app.use('/api/v1/migrate',     migrateRoutes);

// ── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static('public'));

// ── Global Error Handler (must be LAST) ───────────────────────────────────────
app.use(errorMiddleware);

// ── HTTP + Socket.io Server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

const repo        = new PrismaRepository(prisma);
const sessionSvc  = new SessionService(repo, logger);
const gameSvc     = new GameService(repo, logger);

initSocketServer(httpServer, { sessionService: sessionSvc, gameService: gameSvc });

// ── Session Cleanup Job ───────────────────────────────────────────────────────
setInterval(async () => {
  try {
    const count = await sessionSvc.cleanupExpiredSessions();
    if (count > 0) logger.info({ count }, 'Expired exam sessions cleaned up');
  } catch (err) {
    logger.error({ err }, 'Session cleanup job failed');
  }
}, 5 * 60 * 1000); // Every 5 minutes

// ── Refresh Token Cleanup Job ─────────────────────────────────────────────────
setInterval(async () => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { OR: [{ revoked: true }, { expires_at: { lt: new Date() } }] }
    });
    if (result.count > 0) logger.info({ count: result.count }, 'Expired refresh tokens purged');
  } catch (err) {
    logger.error({ err }, 'Refresh token cleanup job failed');
  }
}, 60 * 60 * 1000); // Every hour

httpServer.listen(config.port, () => {
  logger.info({ port: config.port, mode: config.mode }, 'Quiz App server started');
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

---

## 18. Route Pattern — Apply to All Entities

Every route file follows this exact pattern. The two invariants that must hold on every single route:
1. `where: { ..., school_id: req.schoolId }` — every query scoped to the tenant.
2. `school_id` assigned from `req.schoolId` (from JWT) on every create — never from `req.body`.

```javascript
// src/backend/routes/questions.routes.js — full reference implementation
import { Router }           from 'express';
import { prisma }           from '../prisma.js';
import { logger }           from '../logger.js';
import { AuditService }     from '../services/AuditService.js';
import { authMiddleware }   from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { requireRole }      from '../middleware/role.middleware.js';
import { validate, validateQuery } from '../middleware/validate.middleware.js';
import {
  QuestionCreateSchema,
  QuestionUpdateSchema,
  QuestionFilterSchema
} from '../../shared/schemas/question.schema.js';
import { NotFoundError }    from '../../shared/errors.js';
import { ROLES }            from '../../shared/constants.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware); // Applied to ALL routes in this file

// GET /api/v1/questions
router.get('/', validateQuery(QuestionFilterSchema), async (req, res) => {
  const { limit, offset, orderBy, direction, search, category_id, type, difficulty } = req.query;

  const where = { school_id: req.schoolId }; // ALWAYS scope to tenant
  if (category_id) where.category_id = category_id;
  if (type)        where.type        = type;
  if (difficulty)  where.difficulty  = difficulty;
  if (search)      where.text        = { contains: search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip:    offset,
      take:    limit,
      orderBy: { [orderBy]: direction },
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.question.count({ where }),
  ]);

  res.json({ data, total });
});

// GET /api/v1/questions/:id
router.get('/:id', async (req, res) => {
  const q = await prisma.question.findFirst({
    where:   { id: req.params.id, school_id: req.schoolId },
    include: { category: true },
  });
  if (!q) throw new NotFoundError('Question');
  res.json(q);
});

// POST /api/v1/questions
router.post('/', requireRole(ROLES.ADMIN), validate(QuestionCreateSchema), async (req, res) => {
  const question = await prisma.question.create({
    data: {
      ...req.body,
      school_id: req.schoolId, // From JWT — NEVER from req.body
    },
  });
  await AuditService.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: question.id, action: 'create', ip: req.ip });
  logger.info({ questionId: question.id, actorId: req.user.id }, 'Question created');
  res.status(201).json(question);
});

// PATCH /api/v1/questions/:id
router.patch('/:id', requireRole(ROLES.ADMIN), validate(QuestionUpdateSchema), async (req, res) => {
  const existing = await prisma.question.findFirst({ where: { id: req.params.id, school_id: req.schoolId } });
  if (!existing) throw new NotFoundError('Question');

  const updated = await prisma.question.update({ where: { id: req.params.id }, data: req.body });
  await AuditService.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: updated.id, action: 'update', diff: { before: existing, after: updated }, ip: req.ip });
  res.json(updated);
});

// DELETE /api/v1/questions/:id
router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res) => {
  const existing = await prisma.question.findFirst({ where: { id: req.params.id, school_id: req.schoolId } });
  if (!existing) throw new NotFoundError('Question');

  // Business rule: cannot delete a question that is part of an active exam
  const inActiveExam = await prisma.examQuestion.findFirst({
    where: { question_id: req.params.id, exam: { status: 'active' } }
  });
  if (inActiveExam) throw new ValidationError({ id: ['Cannot delete a question used in an active exam'] });

  await prisma.question.delete({ where: { id: req.params.id } });
  await AuditService.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: req.params.id, action: 'delete', ip: req.ip });
  res.status(204).send();
});

export default router;
```

Apply this exact pattern to: `users`, `classes`, `categories`, `exams`, `results`, `games`, `tournaments`, `settings`.

---

## 19. Backend Middleware — Complete Set

### `src/backend/middleware/auth.middleware.js`
```javascript
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from '../../shared/errors.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError('Missing token'));
  try {
    req.user = jwt.verify(header.slice(7), config.jwtSecret);
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
```

### `src/backend/middleware/tenant.middleware.js`
```javascript
import { UnauthorizedError } from '../../shared/errors.js';

// CRITICAL: every Prisma query MUST use req.schoolId — never req.body.school_id
export function tenantMiddleware(req, res, next) {
  if (!req.user?.school_id) return next(new UnauthorizedError('No tenant context in token'));
  req.schoolId = req.user.school_id;
  next();
}
```

### `src/backend/middleware/role.middleware.js`
```javascript
import { ForbiddenError } from '../../shared/errors.js';

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(new ForbiddenError());
    next();
  };
}
```

### `src/backend/middleware/validate.middleware.js`
```javascript
import { ValidationError } from '../../shared/errors.js';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(new ValidationError(result.error.flatten().fieldErrors));
    req.body = result.data; // Replaces body with parsed + sanitized data
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(new ValidationError(result.error.flatten().fieldErrors));
    req.query = result.data;
    next();
  };
}
```

### `src/backend/middleware/rateLimit.middleware.js`
```javascript
import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' },
});

export const apiRateLimiter = rateLimit({
  windowMs:        60 * 1000,  // 1 minute
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
});
```

---

## 20. PrismaRepository — Backend Implementation

```javascript
// src/backend/infrastructure/PrismaRepository.js
import { IStorageRepository } from '../../frontend/infrastructure/IStorageRepository.js';
import { NotFoundError }      from '../../shared/errors.js';

// Maps entity table names to Prisma model names
const MODEL_MAP = {
  users:          'user',
  classes:        'class',
  categories:     'category',
  questions:      'question',
  exams:          'exam',
  exam_questions: 'examQuestion',
  exam_classes:   'examClass',
  results:        'result',
  games:          'game',
  game_sessions:  'gameSession',
  tournaments:    'tournament',
  tournament_entries: 'tournamentEntry',
  exam_sessions:  'examSession',
  settings:       'setting',
  audit_logs:     'auditLog',
  refresh_tokens: 'refreshToken',
};

export class PrismaRepository extends IStorageRepository {
  #prisma;

  constructor(prismaClient) {
    super();
    this.#prisma = prismaClient;
  }

  #model(table) {
    const name = MODEL_MAP[table] || table;
    if (!this.#prisma[name]) throw new Error(`Unknown Prisma model: ${name} (from table: ${table})`);
    return this.#prisma[name];
  }

  async getAll(table, {
    filters   = {},
    limit     = 50,
    offset    = 0,
    orderBy   = 'created_at',
    direction = 'desc',
    search    = null,
  } = {}) {
    const where = { ...filters };
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { text:  { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ].filter(c => {
        // Only include clauses for fields that exist on this model
        // Prisma will error on unknown fields; filter by checking model fields
        return true; // Prisma silently ignores non-existent fields in OR — safe
      });
    }

    const [data, total] = await Promise.all([
      this.#model(table).findMany({
        where,
        skip:    offset,
        take:    limit,
        orderBy: { [orderBy]: direction },
      }),
      this.#model(table).count({ where }),
    ]);

    return { data, total };
  }

  async getById(table, id) {
    const record = await this.#model(table).findUnique({ where: { id } });
    return record ?? null;
  }

  async create(table, data) {
    return this.#model(table).create({ data });
  }

  async update(table, id, data) {
    try {
      return await this.#model(table).update({ where: { id }, data });
    } catch (err) {
      if (err.code === 'P2025') throw new NotFoundError(table);
      throw err;
    }
  }

  async delete(table, id) {
    try {
      await this.#model(table).delete({ where: { id } });
    } catch (err) {
      if (err.code === 'P2025') throw new NotFoundError(table);
      throw err;
    }
  }

  async createMany(table, dataArray) {
    return this.#model(table).createMany({ data: dataArray, skipDuplicates: true });
  }

  async query(queryName, params = {}) {
    // Named complex queries that don't fit the generic CRUD pattern
    switch (queryName) {
      case 'exam.withQuestions':
        return this.#prisma.exam.findFirst({
          where:   { id: params.examId, school_id: params.schoolId },
          include: {
            examQuestions: {
              include:  { question: true },
              orderBy:  { order_index: 'asc' },
            },
          },
        });

      case 'result.byUserAndExam':
        return this.#prisma.result.findMany({
          where:   { user_id: params.userId, exam_id: params.examId },
          orderBy: { date_taken: 'desc' },
        });

      case 'game.activeSessions':
        return this.#prisma.gameSession.findMany({
          where:   { game_id: params.gameId, completed: false },
          include: { user: { select: { id: true, username: true, name: true } } },
        });

      case 'tournament.leaderboard':
        return this.#prisma.tournamentEntry.findMany({
          where:   { tournament_id: params.tournamentId },
          orderBy: { score: 'desc' },
          take:    params.limit || 50,
          include: { user: { select: { id: true, username: true, name: true } } },
        });

      case 'session.expiredSessions':
        return this.#prisma.examSession.findMany({
          where: {
            status:     'active',
            expires_at: { lt: params.before || new Date() },
          },
        });

      case 'settings.byVisibility': {
        const visOrder = ['public', 'teacher', 'admin', 'system'];
        const maxIdx   = visOrder.indexOf(params.visibility);
        const allowed  = visOrder.slice(0, maxIdx + 1);
        return this.#prisma.setting.findMany({
          where: { school_id: params.schoolId, visibility: { in: allowed } },
        });
      }

      case 'user.byClassWithResults':
        return this.#prisma.user.findMany({
          where:   { class_id: params.classId },
          include: { results: { orderBy: { date_taken: 'desc' }, take: 5 } },
        });

      default:
        throw new Error(`Unknown query: ${queryName}`);
    }
  }
}
```

---

## 21. AuditService

```javascript
// src/backend/services/AuditService.js
import { logger } from '../logger.js';

export class AuditService {
  static async log({ schoolId, actorId, entityType, entityId, action, diff = null, ip = null, userAgent = null }, prismaClient) {
    try {
      await prismaClient.auditLog.create({
        data: {
          school_id:   schoolId,
          actor_id:    actorId  || null,
          entity_type: entityType,
          entity_id:   entityId,
          action,
          diff_json:   diff      ? JSON.stringify(diff) : null,
          ip_address:  ip        || null,
          user_agent:  userAgent || null,
        },
      });
    } catch (err) {
      // Audit failure must NEVER crash the main operation
      logger.error({ err, entityType, entityId, action }, 'Audit log write failed');
    }
  }
}
```

---

## 22. Seed Script

### `prisma/seed.js`
```javascript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Idempotent — safe to run on every deploy
  const existing = await prisma.school.findFirst();
  if (existing) {
    console.log('✓ Database already seeded — skipping');
    return;
  }

  const school = await prisma.school.create({
    data: { name: 'My School', slug: 'my-school' }
  });
  console.log('✓ School created:', school.name);

  const adminHash = await bcrypt.hash('admin123', 12);
  await prisma.user.create({
    data: {
      school_id:     school.id,
      username:      'admin',
      password_hash: adminHash,
      role:          'admin',
      name:          'School Administrator',
      status:        'active',
    }
  });
  console.log('✓ Admin user created: admin / admin123');

  // Default settings — organized by visibility
  await prisma.setting.createMany({
    data: [
      // Public — safe for any visitor to read
      { school_id: school.id, key: 'app.name',      value: 'Quiz App',  visibility: 'public' },
      { school_id: school.id, key: 'app.language',  value: 'fr',        visibility: 'public' },
      { school_id: school.id, key: 'app.logo_url',  value: '',          visibility: 'public' },

      // Teacher — visible to admin/teacher after login
      { school_id: school.id, key: 'exam.default_duration',      value: '60',    visibility: 'teacher' },
      { school_id: school.id, key: 'exam.default_passing_score', value: '50',    visibility: 'teacher' },
      { school_id: school.id, key: 'game.max_players',           value: '30',    visibility: 'teacher' },

      // Admin — visible to admin only
      { school_id: school.id, key: 'auth.allow_student_register', value: 'false', visibility: 'admin' },
      { school_id: school.id, key: 'auth.registration_code',      value: '',      visibility: 'admin' },

      // System — NEVER sent to any client
      { school_id: school.id, key: 'system.backup_key', value: '', visibility: 'system' },
    ]
  });
  console.log('✓ Default settings created');
  console.log('');
  console.log('⚠  Change the admin password immediately after first login!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

---

## 23. Testing Strategy — Complete

### Unit test pattern for every service

```javascript
// tests/unit/ExamService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExamService }      from '../../src/frontend/services/ExamService.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../src/shared/errors.js';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('ExamService', () => {
  let service, mockRepo;

  beforeEach(() => {
    mockRepo = {
      getAll:   vi.fn().mockResolvedValue({ data: [], total: 0 }),
      getById:  vi.fn().mockResolvedValue(null),
      create:   vi.fn().mockImplementation(async (_, data) => ({ id: 'exam-1', ...data })),
      update:   vi.fn().mockImplementation(async (_, id, data) => ({ id, ...data })),
      delete:   vi.fn().mockResolvedValue(undefined),
      query:    vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
    };
    service = new ExamService(mockRepo, mockLogger);
  });

  describe('publish()', () => {
    it('throws NotFoundError for unknown exam', async () => {
      mockRepo.getById.mockResolvedValue(null);
      await expect(service.publish('bad-id', 'user-1', 'school-1'))
        .rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError when exam belongs to different school', async () => {
      mockRepo.getById.mockResolvedValue({ id: 'e1', school_id: 'other-school', status: 'draft' });
      await expect(service.publish('e1', 'user-1', 'school-1'))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when exam has no questions', async () => {
      mockRepo.getById.mockResolvedValue({ id: 'e1', school_id: 'school-1', status: 'draft' });
      mockRepo.getAll.mockResolvedValue({ data: [], total: 0 }); // no questions
      await expect(service.publish('e1', 'user-1', 'school-1'))
        .rejects.toBeInstanceOf(ValidationError);
    });

    it('successfully publishes an exam with questions', async () => {
      mockRepo.getById.mockResolvedValue({ id: 'e1', school_id: 'school-1', status: 'draft' });
      mockRepo.getAll.mockResolvedValue({ data: [{ question_id: 'q1' }], total: 1 });
      mockRepo.update.mockResolvedValue({ id: 'e1', status: 'active' });

      const result = await service.publish('e1', 'user-1', 'school-1');
      expect(result.status).toBe('active');
      expect(mockRepo.update).toHaveBeenCalledWith('exams', 'e1', { status: 'active' });
    });
  });
});
```

### Repository contract tests — run against ALL implementations

```javascript
// tests/integration/repository.contract.js
export function runRepositoryContractTests(repoFactory, label) {
  describe(`[Contract] ${label}`, () => {
    let repo;
    beforeEach(async () => { repo = await repoFactory(); });

    const TABLE = 'questions';
    const SAMPLE = { text: 'Test question?', type: 'mcq', answer: 'A', school_id: 'school-test' };

    it('create() returns record with id and timestamps', async () => {
      const r = await repo.create(TABLE, SAMPLE);
      expect(r.id).toBeDefined();
      expect(r.created_at).toBeDefined();
    });

    it('getById() returns created record', async () => {
      const c = await repo.create(TABLE, SAMPLE);
      const f = await repo.getById(TABLE, c.id);
      expect(f?.id).toBe(c.id);
    });

    it('getById() returns null for nonexistent id', async () => {
      expect(await repo.getById(TABLE, 'no-such-id')).toBeNull();
    });

    it('getAll() always returns { data: Array, total: number }', async () => {
      const r = await repo.getAll(TABLE);
      expect(r).toMatchObject({ data: expect.any(Array), total: expect.any(Number) });
    });

    it('getAll() paginates correctly', async () => {
      for (let i = 0; i < 5; i++) await repo.create(TABLE, { ...SAMPLE, text: `Q${i}` });
      const page1 = await repo.getAll(TABLE, { limit: 2, offset: 0 });
      const page2 = await repo.getAll(TABLE, { limit: 2, offset: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBeGreaterThanOrEqual(5);
      expect(page2.data[0]?.id).not.toBe(page1.data[0]?.id);
    });

    it('getAll() filters by field value', async () => {
      await repo.create(TABLE, { ...SAMPLE, type: 'mcq' });
      await repo.create(TABLE, { ...SAMPLE, type: 'true-false' });
      const result = await repo.getAll(TABLE, { filters: { type: 'mcq' } });
      expect(result.data.every(r => r.type === 'mcq')).toBe(true);
    });

    it('update() modifies specified fields', async () => {
      const c = await repo.create(TABLE, SAMPLE);
      const u = await repo.update(TABLE, c.id, { text: 'Updated text' });
      expect(u.text).toBe('Updated text');
      expect(u.type).toBe(SAMPLE.type); // Unchanged fields preserved
    });

    it('delete() removes the record', async () => {
      const c = await repo.create(TABLE, SAMPLE);
      await repo.delete(TABLE, c.id);
      expect(await repo.getById(TABLE, c.id)).toBeNull();
    });

    it('delete() throws NotFoundError for unknown id', async () => {
      const { NotFoundError } = await import('../../src/shared/errors.js');
      await expect(repo.delete(TABLE, 'no-such-id')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('update() throws NotFoundError for unknown id', async () => {
      const { NotFoundError } = await import('../../src/shared/errors.js');
      await expect(repo.update(TABLE, 'no-such-id', { text: 'X' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });
}

// Wire it up:
import { LocalStorageRepository } from '../../src/frontend/infrastructure/LocalStorageRepository.js';
runRepositoryContractTests(() => new LocalStorageRepository(), 'LocalStorageRepository');
// runRepositoryContractTests(() => new PrismaRepository(testPrismaClient), 'PrismaRepository');
```

---

## 24. Implementation Phases — Execute in Strict Order

### Phase 0 — Architecture audit (before any code)
1. Read every existing source file.
2. Produce the written audit report (Section 0) covering all 5 categories.
3. Number every issue found.
4. Confirm the list before writing any code.

**Checkpoint:** Written audit report exists. Issues are numbered and categorized.

---

### Phase 1 — Project skeleton
1. Create the exact folder structure from Section 3.
2. Install all dependencies:
   ```
   npm install express prisma @prisma/client zod bcrypt jsonwebtoken
                cors helmet cookie-parser express-rate-limit dotenv
                pino pino-pretty socket.io socket.io-client
   npm install --save-dev vitest eslint esbuild
   ```
3. Copy `.env.example` → `.env`. Fill in values for local mode.
4. `npx prisma init --datasource-provider sqlite`
5. Paste schema from Section 6 into `prisma/schema.prisma`.
6. `npx prisma migrate dev --name init`
7. `npx prisma db seed`

**Checkpoint:** `npx prisma studio` opens with all tables. Seed created admin user.

---

### Phase 2 — Shared layer
1. Create `src/shared/errors.js` (Section 5).
2. Create `src/shared/constants.js` (Section 5).
3. Create all Zod schemas in `src/shared/schemas/` (one per entity, with Create/Update/Filter variants).
4. Write unit tests for each schema — valid inputs, invalid inputs, refinement rules.

**Checkpoint:** All schema tests pass with `vitest run`.

---

### Phase 3 — Frontend infrastructure (no UI changes yet)
1. Create `IStorageRepository.js` (Section 8).
2. Create `LocalStorageRepository.js` with `CUSTOM_QUERIES` map (Section 8).
3. Create `CacheDecorator.js` (Section 8).
4. Create `ApiRepository.js` with token refresh retry (Section 8).
5. Create `socket.client.js` singleton (Section 11).
6. Create `IdGenerator.js`.
7. Create `container.js` (Section 14).
8. Create `eventBus.js` (Section 15), `sanitize.js` (Section 16), `format.js`.
9. Run repository contract tests against `LocalStorageRepository`.

**Checkpoint:** All contract tests pass. Existing app is completely untouched.

---

### Phase 4 — Refactor existing code (most delicate phase)
Go file by file through the entire existing codebase.

**For every `localStorage` call:**
- Replace with the equivalent service call via `getContainer()`.
- Example: `JSON.parse(localStorage.getItem('quizQuestions'))` → `getContainer().questionSvc.list()`

**For every `io()` call (Socket.io):**
- Remove all but the one in `socket.server.js`.
- Replace frontend calls with `getSocket(token)` from the singleton.
- Add all socket event names to the page's `PAGE_EVENTS` array.
- Add `cleanupSocketListeners(PAGE_EVENTS)` to the router's page-unload hook.

**For every `innerHTML = userContent`:**
- Replace with `safeSetHTML(element, content)`.

**For every `console.log/warn/error`:**
- Replace with `logger.info/warn/error` (backend) or remove (frontend).

**For every service call in UI code:**
- Wrap with `withError(() => ...)`.

**Checkpoint:** Zero `localStorage` calls outside `LocalStorageRepository`. Zero duplicate `io()` calls. Zero `innerHTML = userContent` without sanitization. App behaves identically to before.

---

### Phase 5 — Backend
1. Create `logger.js`, `config.js`, `prisma.js`.
2. Create all middleware files (Section 19).
3. Create `PrismaRepository.js` (Section 20).
4. Create `AuditService.js` (Section 21).
5. Create all route files following the pattern in Section 18.
6. Create `auth.routes.js` (Section 15).
7. Create `settings.routes.js` with visibility tier enforcement (Section 9).
8. Create `migrate.routes.js` (Section — migration).
9. Create `socket.server.js`, `socket.auth.js`, `socket.cleanup.js`, all handlers (Section 11).
10. Create `server.js` with cleanup jobs and graceful shutdown (Section 17).
11. `node src/backend/server.js` — verify startup.
12. Test all endpoints with Bruno/Insomnia/curl.

**Checkpoint:** All CRUD endpoints respond. Auth flow (login → access token → refresh → logout) verified. Socket connections verified. Session expiry cleanup job running. Refresh token cleanup job running.

---

### Phase 6 — Settings split
1. Verify all settings live in the `Setting` table (from seed).
2. Confirm `GET /api/v1/settings/public` returns only `visibility: public` records.
3. Confirm `GET /api/v1/settings/admin` requires admin role.
4. Confirm no `SYSTEM` visibility settings appear in any API response.

**Checkpoint:** Settings visibility correctly enforced at API level.

---

### Phase 7 — API mode switch
1. Confirm server injects `window.APP_CONFIG` based on `APP_MODE` env var.
2. Test app with `APP_MODE=local` (uses `LocalStorageRepository` via `CacheDecorator`).
3. Test app with `APP_MODE=saas` (uses `ApiRepository` via Express API).

**Checkpoint:** Mode switch requires only a `.env` change. All features work in both modes.

---

### Phase 8 — Migration tool
1. Frontend `MigratePage.js` collects all LocalStorage data and POSTs to `/api/v1/migrate`.
2. Run migration.
3. Verify row counts in Prisma Studio match LocalStorage counts.
4. Run migration a second time — confirm zero duplicates (idempotent).
5. Run `GET /api/v1/migrate/status` — verify counts.

**Checkpoint:** All data migrated. Idempotency confirmed.

---

### Phase 9 — PostgreSQL
1. Set `DB_PROVIDER=postgresql` and `DATABASE_URL=postgresql://...` in `.env`.
2. `npx prisma migrate deploy`
3. Run full app on PostgreSQL.

**Checkpoint:** Identical behavior on PostgreSQL. No code changes required.

---

### Phase 10 — Security hardening
1. Work through every item in Section 25 Security checklist.
2. Verify no secrets are broadcast via Socket.io to rooms they shouldn't reach.
3. Verify timing-safe login (constant-time bcrypt comparison — already in auth route).
4. Verify refresh tokens are stored as hashes, never raw.
5. Run OWASP Top 10 checklist manually against the API.

**Checkpoint:** Security checklist 100% complete.

---

### Phase 11 — Testing
1. Unit tests for all services (Section 23).
2. Repository contract tests for both `LocalStorageRepository` and `PrismaRepository`.
3. E2E flows:
   - Admin: login → create question → create exam → add questions → publish → assign to class
   - Student: login → see available exams → start exam → answer → submit → view result
   - Game: admin creates game → students join via code → game starts → answers → scoreboard → finish
   - Tournament: admin creates → opens → students register → runs → leaderboard
4. Socket resilience: kill server mid-game, restart, verify students can reconnect and rejoin.

**Checkpoint:** All tests pass. CI configured to run `vitest run` on every commit.

---

## 25. Final Checklist — Do Not Deploy Until Every Item Is Checked

### Architecture
- [ ] Zero `localStorage` calls outside `LocalStorageRepository`
- [ ] Zero `sessionStorage` calls anywhere in the codebase
- [ ] Zero hardcoded `school_id` values on the backend — all from `req.schoolId` (JWT)
- [ ] All routes have `authMiddleware` applied (except `/api/v1/auth/login` and `/api/v1/settings/public`)
- [ ] All data routes have `tenantMiddleware` applied
- [ ] All write/delete routes have `requireRole` applied
- [ ] No business logic in route handlers — business rules live in services only
- [ ] No storage calls in services — all via repository interface
- [ ] Single `io()` call in the entire codebase — only in `socket.server.js`
- [ ] Single `socket.io-client` instance — only via `getSocket()` singleton
- [ ] Every page that registers socket listeners has a cleanup function in the router

### Security
- [ ] Passwords hashed with bcrypt, rounds ≥ 12
- [ ] Refresh tokens stored as SHA-256 hashes — raw token never in DB
- [ ] `httpOnly` cookie for refresh token, `sameSite: 'strict'`
- [ ] Refresh token cookie path restricted to `/api/v1/auth`
- [ ] Rate limiting on all auth endpoints (10 requests / 15 min / IP)
- [ ] Helmet active with Content Security Policy configured
- [ ] Zero `.innerHTML = userContent` — all via `safeSetHTML()`
- [ ] Login uses constant-time comparison (timing attack prevention)
- [ ] No admin secrets, correct answers, recovery codes in Socket.io broadcasts
- [ ] `SYSTEM` visibility settings never returned by any API route
- [ ] All Socket.io connections authenticated via JWT at handshake
- [ ] `school_id` never accepted from `req.body` — always from JWT

### Sessions & Realtime
- [ ] Expired exam sessions cleaned up by periodic job (every 5 min)
- [ ] Orphaned refresh tokens purged by periodic job (every hour)
- [ ] Game sessions marked `connected: false` on socket disconnect
- [ ] Socket rooms used for targeting — no global broadcasts of sensitive data
- [ ] Reconnection tested — players can rejoin game after network interruption

### Settings
- [ ] `PUBLIC` settings only: app name, language, logo
- [ ] `TEACHER` settings only after authenticated teacher/admin login
- [ ] `ADMIN` settings only after authenticated admin login
- [ ] `SYSTEM` settings never accessible via any API endpoint
- [ ] No scattered settings objects remaining in code — all in `Setting` table

### Logging
- [ ] Zero `console.log` / `console.error` / `console.warn` in any service, route, or socket handler
- [ ] All security events logged with `securityLog()`
- [ ] All admin CRUD actions logged via `AuditService.log()`
- [ ] Log level controlled by `LOG_LEVEL` env variable
- [ ] Sensitive data (passwords, tokens, answer keys) never logged

### Data Integrity
- [ ] All `create`/`update` validated through Zod schemas before any repository call
- [ ] Migration is idempotent — confirmed by running twice
- [ ] Seed script is idempotent — safe to run on every deploy
- [ ] FK migration order respected (classes → categories → users → questions → exams → ...)
- [ ] `options_json` parsed consistently as `JSON.parse()` everywhere it is read

### Operations
- [ ] `.env` is in `.gitignore` — never committed to version control
- [ ] `JWT_SECRET` is minimum 64 hex characters
- [ ] `npx prisma migrate deploy` (not `migrate dev`) used in all non-development deployments
- [ ] Docker healthcheck confirms both DB and Redis are healthy before app container starts
- [ ] Graceful shutdown handler closes DB connections and HTTP server cleanly
- [ ] Default admin password (`admin123`) changed immediately after first login

### Testing
- [ ] All service unit tests pass: `vitest run`
- [ ] Repository contract tests pass for both `LocalStorageRepository` and `PrismaRepository`
- [ ] Full E2E flows tested manually in both `local` and `saas` modes
- [ ] Socket reconnection tested: server killed mid-game, restarted, client recovers

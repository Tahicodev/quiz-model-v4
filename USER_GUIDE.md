# Quiz App — Complete User Guide

This guide explains **every part of the app**: what it is, how to install it,
how teachers run classes with it, how students play, what each screen does,
and how the whole thing is put together.

---

## 1. What the app is

A classroom quiz platform with a big idea behind it: **learn by playing,
get better by competing.**

- Teachers build a **question bank**, organize it into **categories**,
  create **classes** and **students**, and launch live games or official
  **exams**.
- Students join games with a short **entry code**, answer questions against
  each other (solo or team vs team), climb the leaderboard, and win
  **tournaments**.
- Everything runs over the network from a **single server** using a web
  browser — no student app to install.

---

## 2. Quick start

### Regular install (from source)

```bash
npm install        # installs dependencies, bundles the student app
cp .env.example .env   # then edit JWT_SECRET etc. (see section 8)
npm run db:migrate     # create the database schema
npm run db:seed        # create the default admin + defaults
npm start              # start the server on port 3000
```

Then open http://localhost:3000 and sign in as **admin** / **admin123**.
Change the password on the first login.

### Offline classroom package (no internet)

Unpack the offline ZIP on the teacher machine, then:

- **Windows:** double-click `setup.bat`
- **Linux / macOS:** run `./install.sh`

Students then open `http://<teacher-server-ip>:3000` in their browser and log
in with the account the teacher created for them. See section 7 for the full
offline classroom setup (including HTTPS certificate).

---

## 3. The three parts of the app you open in a browser

| URL | Who | What it is |
| --- | --- | --- |
| `/` (index.html) | Students | The main **student home page** (modern SPA bundle). Join games with an entry code, browse training, see results. |
| `/admin.html` | Teachers & admins | The **teacher / admin console**. All screens to manage questions, classes, games, exams, results and settings. |
| `/student-workspace.html` | Students | An **alternate student workspace** (legacy MPA version) with the same join-game / practice features. |

The server also answers API requests under `/api/v1/*` and realtime Socket.IO
events — those are used automatically by the pages above.

---

## 4. Roles and accounts

| Role | What they can do |
| --- | --- |
| **admin** | Everything. Manage users, settings, AI keys, the whole app. |
| **teacher** | Manage questions, categories, classes, exams, results, games, activity log and monitoring. |
| **student** | Join games, practise, take exams, view their own results. |

Default account: **admin / admin123** — change it immediately after the first
login. Create one student account per student (or let them be created by
import / the setup wizard).

---

## 5. Teacher / admin guide (the admin console)

The left sidebar of `/admin.html` contains these screens:

| Screen | What it does |
| --- | --- |
| **Overview** | Dashboard: counts of students, students passed, students in training, total questions, active exams; recent activity. |
| **Questions** | Create / edit / import questions. Question types: multiple choice, multiple-choice multi-answer, true/false, draggable, odd-one-out, matching pairs, fill-blank, and code questions. Bulk import via Word / Excel / PDF (mammoth, xlsx, pdf.js). |
| **AI generator** | Generate questions with AI. Two tabs: **standard** (pick a type, it writes the question) and **document** (upload a document — the AI reads it and writes questions about its content). Needs an AI provider configured in Settings. |
| **Categories** | Organise the question bank into subjects/topics. |
| **Exams** | Create **official exams** (score from 0–20). Exams are the ones that decide whether a student has "passed". |
| **Classes** | Manage classes, add/remove students, group them for games and tournaments. |
| **Results** | View results of games, exams, sessions and tournaments; also the grade list and pass/fail status. |
| **Games** | The **Game Studio**: launch live games, pick a game mode, choose a category/question set, set rules (points, time limits), share the entry code, and run the match live. |
| **Activity** | Activity log of what happened in the app (logins, games, edits). |
| **Monitoring** | Server monitoring: health, memory/CPU, connected sockets, live sessions. |

Tools in the top bar:
- **Archive** — archived/moved old items.
- **Quick Start** — a wizard that walks you through creating your first class, questions and game.
- **QR code** — generate a QR code that opens the app on student phones.
- **Global search** — search questions, categories, classes, users across the bank.
- **Settings** — app settings including the **AI generation** keys (stored encrypted, so no key needs to sit in `.env`), JWT/policy options, and appearance (light/dark theme).

---

## 6. Student guide

### Joining a game

1. The teacher gives you an **entry code** — 6 letters/numbers, e.g. `AB3K9Z`.
2. Open the student page and type the code to enter the **lobby**.
3. Press **Ready**. When everyone is ready (or the teacher starts it), the game begins.
4. Answer the questions, earn points, follow the mode's rules.
5. A **leaderboard** shows the winner and the final scores.

### Game modes (6)

| Mode | How it plays |
| --- | --- |
| **Lightning Race** | Fast-paced questions; speed + correct answers = points. |
| **Sprint Race** | Short bursts of questions, quick rounds. |
| **Card Battle (Card Duel)** | Head-to-head with **playing cards and power-ups**; answer to attack and defend. |
| **Card Draw Battle** | Card game where answering questions draws/plays cards; teams can go head-to-head. |
| **Hot Potato Quiz** | The "potato" passes between players; answer in time or you're out. |
| **Last Survivor** | Eliminations round by round; the last player standing wins (with a survivor bonus). |

Match modes: **Solo (1v1 / free-for-all)** or **Team vs Team** (split into
Team A and Team B; team score = sum of members' points; teams can **bet
points** before rounds).

Default rules (teacher can change them in the Game Studio):
- 10 points per correct answer
- 20 s to answer in most games
- 30 s turn time in card battles
- Back-up math questions (+, −, × with numbers 1–12) for duels

### Power-up cards (only in card battles)

Mirror (reflect a question back), Shield (survive a miss), Freeze (cut the
opponent's timer), Steal (steal a card), Fog (hide the question UI), Combo
Breaker (reduce the opponent's gain), Overclock (faster timer for more points).

### Tournaments

Teachers can run **tournaments** across classes in three formats:
- **Single elimination** (knock-out bracket)
- **Round robin** (everyone plays everyone)
- **Swiss system** (paired by current standing each round)

Players earn points, EXP and badges; the champion is crowned at the end.

---

## 7. Offline classroom deployment (LAN, no internet)

For a classroom with no internet, use the offline package (`dist/quiz-app-v4-offline.zip`):

1. **Copy + unpack** the ZIP on the teacher machine (Windows, Linux or macOS).
2. **Run `setup.bat` (Windows)** or **`./install.sh`** (Linux/macOS). This:
   - checks/installs Node.js requirements,
   - restores the Prisma database engines **from the package** (no internet needed) via `scripts/restore-prisma-engines.mjs`,
   - runs migrations + seeds the default admin,
   - starts the server on port 3000.
3. **Connect students** to `http://<server-ip>:3000`.
   - Students who reach the login/join flow over unencrypted HTTP get a warning when they type a password — that's expected.
   - To use **HTTPS**, install the app's self-signed certificate into the
     students' devices first (see README-OFFLINE.txt, section *"Trusting the
     certificate on student devices"*). Then students use `https://<server-ip>:3000`.
4. Create student accounts in the admin console (Classes → add students, or the Setup Wizard / import).

Troubleshooting common classroom issues is in section 10.

---

## 8. Configuration (`.env`)

Copy `.env.example` to `.env` and adjust:

| Variable | Meaning |
| --- | --- |
| `APP_MODE` | `local` (SQLite, one school) or `saas` (PostgreSQL, multi-tenant). |
| `DB_PROVIDER` / `DATABASE_URL` | `sqlite` with `file:./dev.db`, or `postgresql://user:pass@host/db`. |
| `JWT_SECRET` | Must be at least 64 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | Token lifetimes (defaults 15m / 7d). |
| `PORT` | HTTP port (default 3000). |
| `CORS_ORIGIN` | Allowed browser origin. |
| `LOG_LEVEL` | `debug` / `info` / `warn`. |
| `REDIS_URL` | Only for multiplle SaaS server instances (leave blank for local). |
| AI keys | Set inside **admin → Settings → AI Generation** (stored encrypted). Legacy env vars `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` also work. |

---

## 9. How it's built (for maintainers)

- **Backend** — `src/backend/server.js` (Express + Socket.IO + Prisma).
  - REST API under `/api/v1/`: auth, users, classes, categories, questions, exams, games, sessions, results, school, settings, uploads.
  - Realtime via Socket.IO for live games, lobbies, and server dashboard.
  - Zod schemas in `src/shared/` validate everything; errors go through one central handler.
- **Frontends**
  - **Student home** (`/`) — built bundle `public/student-bundle.js` produced by `npm run build` (`scripts/build-student.js` concatenates the legacy scripts `utils.js`, `api-client.js`, `auth.js`, `script.js`, `landing.js`, `realtime-client.js`, `legacy-auth-bridge.js` + the modern `src/frontend/student-main.js` entry into one IIFE bundle).
  - **Admin console** — `admin.html` + the root-level scripts it loads (`admin-main.js`, `category-management.js`, `questions-management.js`, ... `realtime-admin.js`, `games-management.js`, `settings.js`, `ai-question-generator.js`, `rag.js`, …). These legacy pages read the modern API through `legacy-bridge.js`, which preloads a one-shot `/api/v1/bootstrap` and then writes through to the API.
  - **Student workspace** — `student-workspace.html` + `student-workspace.js`, `realtime-client.js`, `games-core.js`.
  - **Legacy realtime game engine** — `game-server.cjs` is the server-authoritative game engine, mounted into the modern backend via `src/backend/realtime/legacy-engine.bridge.js`. `games-core.js` holds the shared game logic (Lightning Race, Hot Potato, Last Survivor, Card Duel, …).
- **Data** — Prisma. Schema + migrations in `prisma/`, seed in `prisma/seed.js` (default admin + settings).
- **Build & deploy scripts** — `scripts/` (`build-student.js`, `restore-prisma-engines.mjs`, `make-offline-package.mjs`, `generate-offline-bundle.mjs`), `setup.bat` / `install.sh`, Docker files (`Dockerfile`, `docker-compose*.yml`).
- **Tests** — Vitest suite in `tests/` (unit, integration, contract). Run with `npm test`.
- **"old files" folder** — moved-out development leftovers (old standalone server, an old theme CSS, dev planning docs, test databases, screenshots). Not used by the app and excluded from the offline package.

### Project layout, file by part

| Part | Files |
| --- | --- |
| Server entry | `src/backend/server.js`, `src/backend/app.js` helpers, `src/backend/config.js` |
| API routes | `src/backend/routes/*.routes.js` (auth, users, classes, categories, questions, exams, games, sessions, results, school, settings, uploads) |
| Realtime | `src/backend/realtime/` + root `game-server.cjs`, `realtime-.js` frontend clients |
| Shared validation | `src/shared/` (zod schemas, errors, constants) |
| Student app | `index.html`, `public/student-bundle.js`, `src/frontend/student-main.js`, `scripts/build-student.js` |
| Admin console | `admin.html` + root `*.js` (admin-main, category/questions/exam/class/results-management, …) |
| Student workspace | `student-workspace.html`, `student-workspace.js` |
| Game logic | `games-core.js` (both admin game studio and live matches) |
| Themes | `styles.css`, `theme.css`, `theme-dark.css`, `theme-toggle.js` |
| Vendor assets | `vendor/` (socket.io, pdf, mammoth, xlsx renderers, highlight.js) |
| Data layer | `prisma/` (schema.prisma, migrations, seed.js) |
| Install scripts | `setup.bat`, `install.sh`, `scripts/restore-prisma-engines.mjs` |
| Packaging | `scripts/make-offline-package.mjs`, `scripts/generate-offline-bundle.mjs` |
| Docker | `Dockerfile`, `docker-compose*.yml`, `docker-*.sh/.bat` |
| Docs | `README.md`, `README-OFFLINE.txt`, `README-DOCKER.txt`, `LAN_CLASSROOM_DEPLOYMENT.md`, `GAMES_AND_RULES.md`, `USER_GUIDE.md` |
| Old/removed dev files | `old files/` (not shipped, not used) |

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `prisma generate` fails offline with `getaddrinfo ENOTFOUND binaries.prisma.sh` | The Prisma engine must live in `node_modules\prisma\` too. Run `scripts/restore-prisma-engines.mjs`, or copy the two engine files from `vendor\offline\prisma-engines\win32-x64\` into `node_modules\prisma\`, then `npx prisma generate`. |
| Student browser warns "not secure" / "connection not private" | HTTP is plain; use HTTPS and trust the app certificate on each device first (README-OFFLINE.txt). |
| Port 3000 already in use | The server logs an error and stops; close the other program or change `PORT` in `.env`. |
| Students can't reach the server | Check firewall allows inbound TCP 3000 (and 443 if HTTPS). Open `http://<server-ip>:3000` on the teacher machine first to confirm. |
| ZIP won't open cleanly | Use 7-Zip, or copy the already-unpacked `dist/quiz-app-v4-offline` folder directly. |
| Forgot the admin password | Use `npm run db:studio`, or reset via the recovery flow (admin-only). |
| Offline package has no Docker image | Docker-based installs need the image tar built first (`docker build`); the normal `setup.bat`/`install.sh` path does not need Docker. |
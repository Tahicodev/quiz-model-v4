# E2E Manual Test Checklist — Quiz Application

Use this checklist to manually verify the four critical user flows (spec §23)
plus socket resilience. Run in both `APP_MODE=local` and `APP_MODE=saas`.

---

## Prerequisites

- [ ] Backend is running (`npm start` or `npm run dev`)
- [ ] Database is seeded (`npx prisma db seed`)
- [ ] Default admin credentials: `admin` / `admin123`

---

## Flow 1 — Admin: Create Exam → Publish → Assign to Class

1. [ ] Login as admin at `/login`
2. [ ] Create a category (e.g. "Science")
3. [ ] Create a class (e.g. "Grade 10-A")
4. [ ] Create a student user and assign them to the class
5. [ ] Create 3+ questions in the "Science" category
6. [ ] Create a new exam → add questions → set passing score
7. [ ] Publish the exam (status changes from `draft` to `active`)
8. [ ] Assign the exam to "Grade 10-A"

**Expected:** Exam appears in student's available exams list.

---

## Flow 2 — Student: Take Exam → Answer → Submit → View Result

1. [ ] Login as the student created in Flow 1
2. [ ] See the assigned exam in the available list
3. [ ] Start the exam → timer begins
4. [ ] Navigate through questions and select answers
5. [ ] Submit before time expires
6. [ ] View the result (score, correct/wrong per question)

**Expected:** Result is recorded; student cannot retake a submitted exam
unless `max_attempts` allows it.

---

## Flow 3 — Game: Admin Creates → Students Join → Answer → Scoreboard

1. [ ] Login as admin, create a game (select questions, set type `quiz`)
2. [ ] Note the 6-character join code
3. [ ] Open two browser tabs (incognito) and login as two different students
4. [ ] Both students navigate to the game lobby and enter the join code
5. [ ] Admin starts the game
6. [ ] Each student answers the displayed questions
7. [ ] Scoreboard updates in real time after each answer
8. [ ] Admin finishes the game → final scores displayed

**Expected:** Scoreboard scoped to this game only; no cross-game data leak.
Answers never reveal correct answer unless `show_answers_immediately` is on.

---

## Flow 4 — Tournament: Admin Creates → Opens → Students Register → Play → Leaderboard

1. [ ] Login as admin, create a tournament
2. [ ] Open the tournament (status changes to `open`)
3. [ ] Login as two students in separate tabs
4. [ ] Both students register for the tournament
5. [ ] Admin closes registration (status → `active`)
6. [ ] Students answer tournament questions
7. [ ] Leaderboard updates after each answer
8. [ ] Admin finishes → final leaderboard with ranks

**Expected:** Leaderboard shows aggregate scores; only registered students
can participate.

---

## Socket Resilience (spec §25)

1. [ ] Start a game (Flow 3) with at least one student connected
2. [ ] Kill the backend server (`Ctrl+C` or `kill`)
3. [ ] Student sees "disconnected" in the game UI
4. [ ] Restart the backend (`npm start`)
5. [ ] Student reconnects (re-emits `GAME_JOIN`) → receives updated state
6. [ ] Answers submitted after reconnection are accepted
7. [ ] Restart is seamless — server had no dangling sockets

**Expected:** Socket reconnection works with default socket.io-client settings
(5 attempts, 1–5s delay). Server cleanup job handles stale sessions.

---

## Data Migration (Phase 8)

1. [ ] Ensure LocalStorage has data (use the app in `local` mode first)
2. [ ] Switch to `APP_MODE=saas` with a fresh backend
3. [ ] Login as admin → navigate to Migrate page
4. [ ] Click "Migrate" → observe per-table counts
5. [ ] Run migration a second time → confirm zero new rows (idempotent)
6. [ ] Check `/api/v1/migrate/status` matches LocalStorage counts

**Expected:** All data moved to DB, idempotency confirmed.

---

## Security Quick-Check (spec §10 preface)

- [ ] `/api/v1/settings/public` returns only `visibility:public` settings
- [ ] `/api/v1/settings/admin` requires admin role (returns 403 for student)
- [ ] No `SYSTEM` visibility settings ever appear in any API response
- [ ] Socket connections require JWT — rejected without token

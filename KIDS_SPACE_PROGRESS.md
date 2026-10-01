# 🧒 Kids Space — Implementation Progress Tracker

> **Vision**: AI Educational Game Generator for Primary Schools (`quiz-model-v4`)  
> **Status Tracker**: Updated in real-time as each step is completed.

---

## 📊 Overall Progress Dashboard

| Phase | Description | Status | Completed Steps |
|---|---|---|---|
| **Phase 1** | Foundation (DB, Constants, Zod, Services, Routes, Sockets) | ✅ Done | 9 / 9 |
| **Phase 2** | Core Games (9 mechanics + Frontend Game Engine + Base Theme) | ✅ Done | 7 / 7 |
| **Phase 3** | AI Generation Pipeline & Game Selection Engine | ✅ Done | 4 / 4 |
| **Phase 4** | Teacher UI (Wizard, Editor, Results in admin.html) | ✅ Done | 5 / 5 |
| **Phase 5** | Kids Player UI (kids-player.html + Live Sockets) | ✅ Done | 4 / 4 |
| **Phase 6** | Adventure Games (6 wrapper mechanics + themes) | ✅ Done | 4 / 4 |
| **Phase 7** | Rewards, Streaks & Adaptive Difficulty Engine | ✅ Done | 3 / 3 |
| **Phase 8** | Immersive Worlds (5 immersive games + themes) | ✅ Done | 3 / 3 |
| **Phase 9** | Polish (Audio, Timers, Analytics, Accessibility) | ✅ Done | 3 / 3 |

---

## Audit history

### Verified audit (2026-09-29, earlier)

| Phase | Verified status | Completed steps |
|---|---|---|
| Phase 4 | In progress | 3 / 5 |
| Phase 5 | Done | 4 / 4 |
| Phases 6–9 | Pending | 0 / 13 |

The older dashboard above is retained for history; this audit is the current source of truth. Steps 4.2 and 4.3 remain open because a true seven-screen wizard and interactive game preview have not yet been implemented.

### Latest implementation update (2026-09-29)

| Phase | Status | Completed steps |
|---|---|---|
| Phase 4 | Done | 5 / 5 |
| Phase 6 | Done | 4 / 4 |
| Phase 7 | Done | 3 / 3 |
| Phase 8 | Done | 3 / 3 |
| Phase 9 | Done | 3 / 3 |

### Third audit — no silent substitution, and the review loop actually works (2026-09-30)

The second audit fixed wrong content. This round removed the ability to hide a
failure at all, and found three bugs where a correct-looking wizard produced the
wrong activity. `tests/unit/kids.test.js` grew from 29 to 35 cases; the full suite
is 212 / 212.

### Fourth audit: the teacher filter bar

The filter bar was built on top of a list endpoint that silently dropped most of
what it was sent. Six of the controls a teacher can see did nothing at all.

| # | Finding | Fix |
|---|---|---|
| F1 | The bar sent sub-topic, age, language, difficulty and author, but `KidsActivityService.list` only read subject, grade, template, theme, status, search, favourite and class. The dropdowns looked like filters and were decoration | Every control is now read by the service and covered by a test per field |
| F2 | Access tokens last 15 minutes and `kids-management.js` used a bare `fetch`, so any request after 15 minutes answered the teacher "Token expired" instead of refreshing. It surfaced on filtering because that is the first burst of extra calls | `api()` goes through `api-client`'s `window.API.raw`, which refreshes once and replays the 401 |
| F3 | `is_favorite` used `z.coerce.boolean()`, and `Boolean("false")` is `true`, so the *unfavourite* filter returned every favourite game | Mapped explicitly, and asserted both ways |
| F4 | `listFacets` grouped by `creator_id` including the null bucket, so a deleted author appeared as a blank teacher option. Selecting it sent an empty value, which reads as "no filter" | Null authors are dropped; a real id whose user row is gone stays as "Unknown teacher" |
| F5 | If the facets call failed, every dropdown was empty with no explanation, so the bar looked broken rather than unavailable | Options are derived from the loaded activities as a fallback, and the server facets are preferred when present |

Age matching is deliberately an **overlap**, not a containment: a 5-8 game has to
appear when a teacher filters on 8, because they are asking "what can an 8 year
old play". `tests/integration/kids.facets.test.js` pins that, and runs against a
real database because a mocked `groupBy` cannot prove the query is valid.

| # | Finding | Fix |
|---|---|---|
| E1 | A provider 429 / quota error was caught and replaced with a built-in question pool, so an "addition" activity could be answered with content about spider legs | The pool is gone. `generateActivity` throws `AppError` (`ai_quota_exceeded`, `ai_generation_failed`, `ai_levels_invalid`, `ai_not_configured`) and the teacher is told what happened |
| E2 | The wizard sent `count` = *number of slots being refilled*, while the service read it as *total activity size*. "Regenerate the 2 dropped" of 5 asked the server for `2 - 3`, so it silently refilled **one** level and left a slot empty | `count` is now always the total; the server computes the shortfall. Contract pinned by a test that asserts `level_count: 2` in the prompt |
| E3 | Replacement rebuilt the level array from a sorted position list and never cleared the replaced slot's dropped flag, so a successfully regenerated level could still be filtered out on save | Slots are rewritten in place and un-dropped as soon as they have content |
| E4 | `KidsAIGenerateSchema` did not declare `title` / `description`, so Zod stripped the two fields the teacher typed in step 1 and the prompt only ever saw a title the service invented | Both fields declared and covered by a schema test |
| E5 | The school default was `findFirst` over every `AIConfig` row, so an image or embedding model could be picked and return an empty generation | `#isTextModel` filters the picker, skips such rows when choosing the default, and refuses an explicit pick with `ai_model_not_text` |
| E6 | `memory` and `find_correct` are selectable templates but had no shape in the prompt, and `specificExample` was computed and never sent — the model had nothing to copy and every level was rejected as malformed | Added both shapes; the requested template's shape is now always included |
| E7 | A class-assigned game was invisible to the student unless they were handed a join code | `GET /kids/activities/for-me` (published + class-assigned or school-wide) and a tappable list on the welcome screen |

### Fifth audit: a teacher can now bring levels in from outside (2026-09-30)

A teacher who asked an assistant for a game had the content, and nowhere to put
it. The AI step showed a prompt and the exact schema as reference text, but the
only way in was to copy every level by hand. `tests/unit/kids-level-checks.test.js`
and `tests/integration/kids.import.test.js` are new, as is `tests/unit/kids-prompt.test.js`;
the full suite is 294 / 294 across 25 files.

| # | Finding | Fix |
|---|---|---|
| G1 | The format existed in three places that could disagree — the doc, the prompt in the UI, and the check itself | One module, `src/shared/kids-level-checks.js`, is imported by the button, by `scripts/validate-kids-levels.mjs` and by the copy-a-paste prompt's wording. A test reads the doc and runs every example in it through the same validator, so the examples cannot drift |
| G2 | `word_order` items are the *shuffled* pieces, so their order in the file is meaningless. The check compared them joined, in file order, to the answer — which rejected the doc's own `A, C, T, H` = `CHAT` example | Compared as a multiset of letters, case and spaces ignored, and the doc and prompt wording corrected to match |
| G3 | A level that failed its own field check (`points: 900`) returned immediately, so its content was never checked. The teacher fixed the score, re-imported, and only then learned `correctId` pointed at no option | Level fields and content are reported independently, so one pass shows every problem |
| G4 | `--template` was removed from `argv` and then located by the index it held in the *unfiltered* array. The minimum-level check never ran and a short file was reported as fine | Parsed by hand; the CLI is now spawned in a test so the regression cannot come back |
| G5 | The docs only showed the `{ "levels": [...] }` wrapper, but a teacher copying one example out of a chat pastes a single level object, which was rejected as "not a levels file" | A single level object is accepted, alongside the array and the wrapper |
| G6 | The copy-a-paste prompt sent 4 fields (topic, level, language, count) out of the 13 the wizard collects. Title, description, learning objective, difficulty, ages, world and game were all missing, so an assistant wrote for the wrong age and the wrong difficulty, and nothing said so | `promptContext()` sends the whole wizard. Empty fields are sent as `<not set>` rather than dropped, and the teacher can preview exactly what will be sent |
| G7 | The prompt named the nine mechanics but carried none of their shapes, so an external assistant invented field names and every level came back unimportable. This is the same failure as E6 on the server side | Each mechanic's exact skeleton and its rules travel with the prompt; `tests/unit/kids-prompt.test.js` asserts every skeleton is present |
| G8 | A bare difficulty ("easy") is not an instruction, and nothing stopped an assistant from sending six near-identical questions | Difficulty maps to concrete guidance per level, the levels must be distinct and ramp in order, and a count below the game's minimum is raised with the reason stated |

Import lands in the wizard's AI content step: paste or choose a file, the server
checks it and returns the normalized levels, and a clean file moves straight to
Review with an "Imported from a file" badge. Nothing is saved before the teacher
has seen it, and replacing the levels of an existing activity asks first, because
the save reconciles by id and would delete whatever was left out.

A file may also be written in the shape the Questions tab uses —
`{ "type": "mcq", "text": …, "options": […], "answer": … }` — with no
`level_type` and no ids. That is what makes a level set portable: the same file
works in both places, and the same questions can be reused in a game without
being rewritten first. The AI prompt asks for this shape whenever the chosen game
can play it.

### Sixth audit: a level the teacher adds by hand is theirs, not the app's (2026-09-30)

Adding a level produced a question, two options and a story line that nobody had
written, in the voice of the app. A teacher who added a few and moved on
published those sentences to a child, and nothing anywhere said they were
placeholders. Worse, once a level existed there was no way to edit its content at
all: the row showed a summary, a score and three buttons, none of which touched
the question. So the one route that required no AI and no credit produced the
only levels that could not be corrected.
`tests/unit/kids-content-editor.test.js` and `tests/unit/kids-levels-schema.test.js`
are new; the full suite is 361 / 361 across 28 files.

| # | Finding | Fix |
|---|---|---|
| H1 | "+ Add level" wrote "Question to customise", "Option A", "Option B" and "Help the hero" into the level, and the Review step presented it as the level's content | The added level is empty, with only the ids the mechanic needs. A test fails if any word the teacher did not type appears in it |
| H2 | An empty level was a dead end: there was no editor, so a level could be created but not filled in | Every level opens its own fields — question and options for a choice, two columns for matching pairs, the gap for a fill-in, a word for a letter order. A mechanic with no simple form gets a JSON box with a note about its ids |
| H3 | The blank level was defined twice, in the browser and in the shared bridge, so a level added in the wizard could look nothing like one added through the API | Both are compared field by field in a test, so a change to one without the other fails |
| H4 | A narrative shell showed no way to say which mechanic it wrapped or what the hero does next, and switching mechanic left the old mechanic's content underneath the new fields | The shell's own fields come first, and switching mechanic rebuilds the content, keeping only the words that are not the mechanic's shape |
| H5 | Retyping the options moved the correct answer to whichever row happened to share its id, so editing a question could silently change its answer | The answer stays on the row it was on, and a test pins it |
| H6 | A half-typed JSON box was applied field by field, so a mistake left a level the teacher never wrote | The box is applied whole, or not at all, and an unparsable one says so instead of losing the level |
| H7 | `true-false` had no mechanic, so it was dropped from the bankable types — a real question in the Questions tab could no longer be used in an activity | The mapping is unchanged, but the list of bankable types is taken from the direction that has a mechanic. It plays as a two-option level either way |
| H8 | A file pasted from a French class was checked against English rules, because the endpoint never passed the language the validator was built to accept | The language comes from the file when it declares one, and the wizard's language otherwise. A mixed file is not guessed at |
| H9 | The editor schema in the docs described only the game shape, so a teacher's editor underlined a valid flat question file as broken | The generated schema now describes both shapes, and a test checks the two cannot drift apart again |
| H10 | The Review row read `treasure_hunt / 10 pts / mechanic: multiple_choice` and nothing else. The level's actual question was never shown, so the one screen where a teacher is meant to check what the model wrote told them nothing about it — and the mechanic name read as a setting to configure rather than as the way a child answers | The row now shows the question, then the story line of an adventure shell. The game and the mechanic appear as two named chips beside it, and an unwritten level says it is waiting for a question rather than showing a bare id |
| H11 | The story line was read from the level row, but it only ever lives inside `content_json`, so the fix for H10 rendered nothing. A teacher writing an adventure still could not see the story they had written | The line is read from the parsed content, and a test pins both a wrapped and a saved-as-string level |

### Seventh audit: what a child actually sees when answering (2026-09-30)

The ordering games drew their answer row as a dashed box that only grew as pieces
were dropped in, and `SequenceGame` printed the position as raw text inside each
tile — a child reading `#2 4+4` had to decide whether the `#2` was part of the
answer. There was no way to take one piece back, and no way to start again. The
praise and retry cards had no button at all: they closed on a timer, so a child
who wanted to read the explanation had no way to stay, and a child who wanted to
move on had to wait.

`tests/unit/kids-player-order-track.test.js`, `tests/unit/kids-player-order-games.test.js`
and `tests/unit/kids-player-feedback.test.js` are new; the full suite is
413 / 413 across 31 files.

| # | Finding | Fix |
|---|---|---|
| P1 | The position was printed inside the answer, as `#2 4+4`, so a child reading the answer aloud read the position as part of it | The position is a badge above the slot, and the answer is the words on their own. A test asserts the row contains no `#1`-style text |
| P2 | The answer row was an empty dashed box, so a child could not see how many pieces the answer needed, or where the next one went | A slot is drawn for every expected piece, numbered, before anything is placed. The first empty slot carries the instruction; the rest carry their position |
| P3 | A placed piece could not be taken back, and a wrong start could not be undone except by reloading the page | Each placed piece has a labelled button that sends it back to the pool, and "Start again" appears once there is more than one piece — not on a single piece, where a mis-tap would undo work |
| P4 | A piece was only ever appended, so correcting the middle of a long answer meant clearing everything | Each slot can be taken back independently, and the rest of the answer stays in place |
| P5 | The praise card had no button, and closed on a timer. The retry card closed at 1.8s, taking the explanation with it while the child was still reading it | Both cards are dialogs with a labelled action — "Continuer ▶" and "Réessayer 💪" — that close on click or Escape, and a retry card stays long enough to read |
| P6 | The game changed level on its own 1500ms timer while the praise card stayed up for 2600ms, so the next question arrived underneath praise for the last one. The card's button could not change any of it | The card reports when it is gone and the game advances then, so the child decides. A 8s backstop covers a card that is somehow never dismissed, and fires exactly once |
| P7 | A card replaced by another stayed in the document for its fade, so two overlays were on screen and the one still fading sat on top of the one that explained the answer just given | A new card replaces the old one outright, and is the only card in the document |
| P8 | The keyboard stayed behind the card, on the game's buttons, so a keyboard or screen-reader user was answering to a dialog they could not reach | The card is `role="dialog"`, `aria-modal`, and focus moves to its action |
| P9 | The answer row was styled by two rules at once: the track's own, and the old dashed-box class the zone still carried. The two sets of display and padding fought and the row came out centred and clipped | The zone carries only the track's class, and a test fails if the old one comes back |
| P10 | Preflight judged a level playable by a fixed list of field names. `find_correct` keeps its picture in `template` and its answers in `choices`, so every picture level was reported as having nothing to play | Playability is judged by whether the content is actually there, whatever it is called. An answer on its own is not content: it points at the content rather than being any |

### Second audit — gaps the checklist had hidden (2026-09-29, closed)

The checklist ticked all 25 boxes, but a line-by-line audit found the following were
**claimed done while being broken, dead, or unwired**. All are now fixed and verified.

| # | Finding | Fix |
|---|---|---|
| A1 | `kids:leave` / `session:heartbeat` deleted from `SOCKET_EVENTS` when the Kids events were added — silently broke exam keep-alive and tournament leave | Restored; regression test added |
| B1 | `school_type` is never stored in `quizSession` (`auth.js buildSession`), so the Kids nav tab and dashboard were permanently invisible | `primary()` reads `/school/profile/full` with a public fallback |
| B2 | `save(true)` created a draft, then published; a publish failure left the modal open with no refresh and no reason | Partial-failure path now closes, refreshes, reports the draft and the cause |
| B3 | Offline generation had content for only 3 mechanics; the other 17 templates emitted mismatched content and failed publish with HTTP 422 | The offline pool was removed entirely (see E1); the model is now shown a valid shape for every core mechanic and all 20 templates pass `validateForPublish` |
| B4 | `generate()` did `Object.assign(wizard.data, aiResponse)`, so the AI **overwrote the teacher's title and description** | Only `levels` is consumed from the response |
| C1 | `<link id="theme-stylesheet">` was never swapped by any code, so `ocean.css` and `space.css` never loaded | Removed; all 12 worlds declared in `themes/worlds.css` |
| C2 | `--theme-primary` / `--theme-accent` were declared but consumed by **nothing** — all 12 worlds looked identical apart from the background image | Player stylesheet now reads the variables; verified per-world palette |
| C3 | `HintBubble.js` was never imported and no core game implements `showHint()`, so `/kids/play/session/:id/hint` had no UI trigger at all | Engine renders the bubble itself; footer hint button added |
| C4 | Wizard hardcoded 7 of the 20 game templates, so `GameSelector` could recommend a game the wizard could not display | All 20 loaded from `/kids/templates`, grouped by category |
| C5 | Level endpoints (`/levels`, `reorder`, `favorite`, `archive`, `change-template`) were never called by any frontend | Level editor step with reorder/edit/delete; archive + favourite card actions |
| C6 | `placeholder-scene1.svg` and `puzzle-reveal-template.png` were unused | Wired as teacher-facing placeholders in the level editor (they are placeholders, so they must not be shown to children) |
| C7 | `api()` read `d.fields`, but Kids routes wrap errors as `{error:{fields}}`, so the teacher saw `"Validation failed"` instead of the actionable reason | Reads the nested envelope too |
| C8 | `next()` had no upper bound; stepping past step 7 rendered an empty wizard | Bounded to steps 1–7 |
| D1 | `POST /kids/play/:activityId/start` looked the activity up by id alone, so a student in one school could start and read another school's activity by UUID | `school_id` added to the lookup — a cross-tenant id now 404s |
| D2 | A student could start an **unpublished draft** and read the teacher's unfinished content | Drafts are educator-only (`isEducator` allows the teacher preview before publishing) |
| D3 | `submitAnswer` and `requestHint` took the session id from the request and never checked the owner, so any logged-in student could add points to a classmate's session or read their hints | `assertSessionOwner()` on both; fails closed when the caller is missing |
| D4 | `sanitizeLevelContentForStudent` ended in `default: return raw`, and `level_type` is a free-text column (`z.string().min(1)`). An unrecognised type therefore shipped `correctId` to the browser | `default` (and `memory`) now go through `stripAnswerKeys()`; a dedicated `ANSWER_KEY_FIELDS` set is stripped for every mechanic |

### Security verification (2026-09-29)

Every guard was proven against a real database, not a mock, using two temporary
schools (`__sectest___a` / `__sectest___b`), two students, a teacher, and a
published activity. All fixtures were deleted afterwards.

```
1. Cross-tenant start (student of school B vs activity of school A)
  PASS  rejected (NOT_FOUND)
2. Own-tenant start                                        PASS
3. Draft denied for student, allowed for educator preview  PASS
4. submitAnswer by non-owner                               PASS  FORBIDDEN
   requestHint by non-owner                                PASS  FORBIDDEN
   submitAnswer with no authenticated user                 PASS  FORBIDDEN
   owner submits an answer                                 PASS  graded correctly
   owner requests a hint                                   PASS
5. Answer key stripped for multiple_choice / mcq / unknown type   PASS
   question and options still delivered                    PASS
   live snapshot: same school OK, other school NOT_FOUND   PASS
```

`listLiveSessions` was already school-scoped, confirmed above.
Unit regressions for D1–D4 live in `tests/unit/kids.test.js`.

### Phase 9.3 — how it was verified

- `npx vitest run` → **195/195 passing** (the 187 below plus 8 security regressions:
  tenant-scoped start, draft protection, session ownership on answer and hint,
  fail-closed on a missing caller, and answer-key stripping for known *and*
  unknown `level_type` values).
- Full teacher flow driven through a JSDOM instance of the real `admin.html` markup:
  20 templates listed → template card → themed asset preview → AI generation →
  level editor → pre-flight check → publish → join code → live monitor.
- All 20 templates generated content accepted by `ActivityValidator.validateForPublish()`.
- Student path exercised over the real HTTP API: join by code → start → answer →
  complete, with `correctId` confirmed absent from every level payload sent to the browser.
- **Not covered by automated tests:** real-browser rendering, touch drag-and-drop,
  WebGL/canvas, audio playback, and tablet performance. These need manual QA on
  physical devices.

## Detailed Steps Breakdown

### Phase 1: Foundation (Backend & Architecture)
- [x] **Step 1.1**: Update `prisma/schema.prisma` with `KidsActivity`, `KidsActivityLevel`, `KidsGameSession`, `KidsGameTemplate` models and relations on `School` and `User`. Run Prisma migration (`20260929145006_add_kids_space`) and generated Prisma Client.
- [x] **Step 1.2**: Create seed script `prisma/seeds/kids-game-templates.js` and seed the 20 game templates.
- [x] **Step 1.3**: Update `src/shared/constants.js` with `KIDS_*` enums and socket events.
- [x] **Step 1.4**: Create `src/shared/schemas/kids-activity.schema.js` with Zod validation for mechanics and activities.
- [x] **Step 1.5**: Update `src/backend/infrastructure/PrismaRepository.js` (MODEL_MAP, SEARCH_FIELDS, DEFAULT_ORDER_BY).
- [x] **Step 1.6**: Create `src/backend/middleware/kids-gate.js` (primaire school type check).
- [x] **Step 1.7**: Create backend services (`KidsActivityService.js`, `KidsGameSessionService.js`, `GameTemplateRegistry.js`, `GameSelector.js`, `ActivityValidator.js`).
- [x] **Step 1.8**: Update `src/backend/container.js` to register Kids services (`kidsActivitySvc`, `kidsSessionSvc`, `kidsGameSelector`, `kidsAISvc`).
- [x] **Step 1.9**: Create `src/backend/routes/kids.routes.js`, mount in `src/backend/server.js`, and wire Socket.IO handler `src/backend/realtime/handlers/kids.handler.js` + `socket.rooms.js` + `socket.server.js`.

---

### Phase 2: Frontend Game Engine & Core Mechanics
- [x] **Step 2.1**: Build frontend engine core (`public/kids/engine/GameEngine.js`, `GameRegistry.js`, `GameState.js`, `GameEvents.js`, `ThemeEngine.js`, `FeedbackEngine.js`).
- [x] **Step 2.2**: Build UI Components (`DraggableItem.js`, `KidsButton.js`, `KidsCard.js`, `ProgressBar.js`, `StarRating.js`, `FeedbackOverlay.js`, `HintBubble.js`).
- [x] **Step 2.3**: Build Base CSS & Themes (`_base.css`, `jungle.css`, `space.css`, `ocean.css`, `kids-player.css`).
- [x] **Step 2.4**: Implement Phase 1 Core Mechanics (Part 1: MultipleChoice, WordOrder, DragDrop).
- [x] **Step 2.5**: Implement Phase 1 Core Mechanics (Part 2: Matching, Memory, Sorting).
- [x] **Step 2.6**: Implement Phase 1 Core Mechanics (Part 3: Sequence, FindCorrect, BubblePop).
- [x] **Step 2.7**: Setup `public/kids/kids-player.html`, `kids-player.css`, `kids-player.js`.

---

### Phase 3: AI Activity Generation Pipeline
- [x] **Step 3.1**: Create `KidsAIService.js` leveraging LLM calling and pedagogical prompt generation.
- [x] **Step 3.2**: Implement game-specific pedagogical prompt templates.
- [x] **Step 3.3**: Implement retry and Zod self-healing JSON correction with fallback generator.
- [x] **Step 3.4**: Connect AI generation endpoints to `kids.routes.js` and register in container.

---

### Phase 4: Teacher UI (Admin Experience)
- [x] **Step 4.1**: Add Kids Space navigation item in `admin.html` (conditioned on `school_type === 'primaire'`).
- [x] **Step 4.2**: Build 7-step Teacher Creation Wizard in `admin.html`.
- [x] **Step 4.3**: Build Activity Editor with interactive preview.
  - Step 6 is a level editor: per-level points / hint / explanation / image, drag-free
    reorder, delete, add, and a content summary. Step 7 runs a pre-flight check
    (title, level count vs `min_items`, valid JSON) so a publish is never attempted
    on content the server will reject. "Aperçu" plays the activity in the real
    player via an iframe, so the teacher tests exactly what the child sees.
- [x] **Step 4.4**: Implement `kids-management.js` controller.
- [x] **Step 4.5**: Add styling in `admin.css`.
- [x] **Step 4.6**: Share and monitor UX — publish now opens a join dialog with the
  6-character code, a copyable student link (`/kids?code=…`), and a link to the live
  monitor. Card actions: Éditer, Aperçu, Rejoindre, Suivi, Résultats, ☆, Archiver.

---

### Phase 5: Live Play & Real-Time Sync
- [x] **Step 5.1**: Integrate Socket.IO client in `kids-player.js`.
- [x] **Step 5.2**: Implement real-time join by 6-character code (`join_code`).
- [x] **Step 5.3**: Real-time progress emission and teacher monitoring.
- [x] **Step 5.4**: Activity completion screen with animated stars and celebration.

---

### Phase 6: Adventure Game Wrappers
- [x] **Step 6.1**: Implement Treasure Hunt narrative wrapper.
- [x] **Step 6.2**: Implement Obstacle Run, Board Game, Puzzle, Build Construct, Whack Tap.
- [x] **Step 6.3**: Add additional themes (Farm, Castle, Dinosaur, Forest).
- [x] **Step 6.4**: Connect adventure storylines generated by AI.

---

### Phase 7: Rewards, Streaks & Adaptive Engine
- [x] **Step 7.1**: Implement `RewardEngine.js` (stars calculation, badges, multipliers).
- [x] **Step 7.2**: Implement `ProgressionEngine.js` (adaptive difficulty adjustments based on streak).
- [x] **Step 7.3**: Implement streak animations, mascot reactions, and celebratory sound triggers.

---

### Phase 8: Immersive Worlds
- [x] **Step 8.1**: Implement Animal Rescue & Space Adventure immersive games.
- [x] **Step 8.2**: Implement Cooking, Escape Room & Farm Garden games.
- [x] **Step 8.3**: Add immersive themes (City, Circus, Magic World, School, Superhero).

---

### Phase 9: Audio, Analytics & Final Polish
- [x] **Step 9.1**: Add SoundManager (web audio synth / sound effects). Uses the four
  supplied MP3s (`sfx-correct`, `sfx-retry`, `sfx-celebration`, `sfx-hint`) with a Web
  Audio fallback, plus a footer mute toggle.
- [x] **Step 9.2**: Add student performance analytics & classroom reports for teachers.
  Live monitor panel joins the activity room over `kids:monitor` and receives
  `player:joined` / `kids:progress` / `player:left`; falls back to 10 s polling when
  the socket is unavailable. Snapshot endpoint: `GET /kids/activities/:id/live`.
- [x] **Step 9.3**: End-to-end verification and performance tests. See the verification
  note above for exactly what is and is not covered.

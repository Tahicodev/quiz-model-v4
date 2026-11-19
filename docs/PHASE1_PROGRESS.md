# Phase 1 progress log — taxonomy and question pedagogy

**Purpose.** This is the live record of the adaptive-learning Phase 1 implementation. The
previous file, [`docs/phase 01.md`](./phase%2001.md), is the **frozen spec** (what Phase 1 is
and why); this file is the **mutable record** (what has actually been done, verified and left
open). When the two disagree about *scope*, the spec wins; when they disagree about *status*,
this file wins.

**Branch:** `feature/adaptive-learning-phase1`
**Authorization:** WP1 accepted 2026-11-19; WP2 and WP3 accepted by the same "continue" instruction;
WP4 accepted; **WP5 authorized** by the owner's decisions (console SPA page · gated by
`learning.adaptive.enabled` + an admin toggle · objectives + competencies + proposal queue);
**WP6 authorized by the follow-up "continue"**. WP6 is implemented and **awaiting owner review**.
WP7 is not authorized until that review.

**Ground rules carried from the spec and Phase 0**

- Taxonomy + question pedagogy only. No evidence, mastery, level, pathway or AI-suggestion code/tables.
- No existing functionality, tenant isolation, authorization or data integrity is weakened.
- No existing column renamed, retyped or removed; additions are nullable or defaulted.
- Every new capability ships default **off**.
- Nothing advances past the authorized work package without the owner's review.

---

## Status board

| WP | Scope | Status | Verified |
|---|---|---|---|
| WP1 | Schema + migration | **Done — accepted by owner 2026-11-19** | Yes (see evidence below) |
| WP2 | Backend data access (`MODEL_MAP` / `SEARCH_FIELDS`, repository parity) | **Done — accepted (covered by continuation)** | Yes |
| WP3 | Services (`LearningTaxonomyService`, `QuestionPedagogyService`) | **Done — accepted (covered by continuation)** | Yes |
| WP4 | Routes + permissions + backup | **Done — accepted by owner 2026-11-19** | Yes |
| WP5 | Frontend (pedagogy panel, filters, proposal queue, labels/RTL) | **Done — accepted 2026-11-19** | Yes |
| WP6 | Tests (validators, integration, scope, regression) | **Done — awaiting review** | Yes |
| WP7 | Docs + flags / completion report | Not started | — |

---

## WP1 — Schema + migration

### Deliverables

- `prisma/schema.prisma`
  - **5 additive `Question` fields**: `pedagogy_status` (`@default("unclassified")`),
    `primary_bloom_dimension_id`, `pedagogy_reviewed_at`, `pedagogy_reviewed_by`, `pedagogy_source`.
  - **2 `Question` indexes**: `[primary_bloom_dimension_id]`, `[school_id, pedagogy_status]`.
  - **2 `Question` relations**: `primaryBloom` → `BloomDimension` (`SetNull`),
    `assessmentCriteria` → `QuestionAssessmentCriterion[]`.
  - **Back-relations** on `School`, `Subject`, `Category`, `Question` only.
  - **6 new models**: `BloomDimension`, `LearningObjective` (with `status`,
    `proposed_by`, `reviewed_by`, `reviewed_at`, `review_note`), `Competency`,
    `LearningObjectiveCompetency`, `LearningPrerequisite`, `QuestionAssessmentCriterion`.
  - Size: **+181 lines, 0 deletions** (no `prisma format` churn).
  - No `QuestionClassificationSuggestion` table — AI suggestions are deferred to Phase 6.
- `prisma/migrations/20261119000000_learning_taxonomy/migration.sql` — 214 lines:
  6 `CREATE TABLE`, one `Question` rebuild, 17 indexes. No seed SQL.

### Verification evidence

| Check | Result |
|---|---|
| `npx prisma validate` | **valid** |
| Regenerated `migrate diff` body vs committed migration | **byte-identical** (207 lines) |
| Snapshot copy (`prisma/dev.db`, 22 recorded migrations) + `prisma migrate deploy` | 43 → **49 tables**; questions **10,489 → 10,489**; **23 migrations**; 6 taxonomy tables; 5 new `Question` columns; **all 10,489 rows `unclassified`**; 7 `Question` indexes; `PRAGMA foreign_key_check` empty; `PRAGMA integrity_check` ok |
| Fresh empty DB, all 23 migrations from scratch | 49 tables; FK check empty; integrity ok |
| Temporary verification databases | deleted afterwards (nothing left in the repo) |

### Why the `Question` table is rebuilt

SQLite cannot attach a new foreign key (`primary_bloom_dimension_id`) with `ALTER TABLE`, so the
migration creates `new_Question`, inserts the 16 existing columns unchanged, drops the old table
and renames. No existing column is renamed, retyped or removed; the five new columns take their
defaults (`unclassified` / NULL).

### Why there is no Bloom seed in the migration

`INSERT OR IGNORE` is SQLite-specific and this repo must also run on PostgreSQL. The catalog is
seeded idempotently at runtime by `LearningTaxonomyService.ensureSeeded()` (WP3), so
`BloomDimension` is intentionally empty right after the migration.

### Open items carried forward

1. **`npx prisma generate` fails with EPERM** — `node_modules/.prisma/client/query_engine-windows.dll.node`
   is locked by a running Node process. No WP1 runtime code references the new models, so nothing is
   broken yet, but the generated client is **stale** and must be regenerated (with the Node process
   stopped) **before any WP2 service work**.
2. **Pre-existing migration drift — not touched, not a WP1 defect.** `prisma migrate diff --from-migrations`
   reports unrelated `KidsGame` / `KidsGameSession` / `Question` / `Tournament` redefinitions, because
   the committed migrations do not reproduce the live schema. WP1's migration was therefore generated
   against the live datasource; a fresh deploy of all committed migrations is clean. Fixing this drift is
   outside WP1 and needs its own decision.
3. **Unrelated working-tree items, left as they were:** `complete_adaptive_learning _system.md` has one
   stray line removed, and `tests/unit/ResultService.session-mode.contract.test.js` is untracked. Neither
   is part of WP1; the owner decides whether to keep, revert or commit them.

---

## WP2 — Backend data access

### Deliverables

- `src/backend/infrastructure/PrismaRepository.js`
  - `MODEL_MAP` +6: `bloom_dimensions: 'bloomDimension'` (global catalog), `learning_objectives`,
    `competencies`, `learning_objective_competencies`, `learning_prerequisites`,
    `question_assessment_criteria`.
  - `SEARCH_FIELDS` +4: `bloomDimension: [key, name]`, `learningObjective: [code, statement, description]`,
    `competency: [code, name, description]`, `questionAssessmentCriterion: [criterion_key]`.
    The link and prerequisite tables carry no free-text column, so they are intentionally absent.
  - `DEFAULT_ORDER_BY` +2: `bloom_dimensions` and `learning_objectives` order by `order_index`;
    every other new table falls back to its `created_at`.
- `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §I.3 — added the `bloom_dimensions` mapping so the
  catalog is reachable through the generic repository like every other table.
- `ApiRepository` unchanged by design: it is table-agnostic (`/${table}`), so the new tables become
  reachable from the frontend once WP4 adds the routes. `IStorageRepository` needs no new method —
  the generic contract already covers them.

### Verification

Temp-DB round-trip through the generic repository (22 checks, all pass): all six tables resolve;
Bloom orders by `order_index` and searches on `key`/`name`; objective defaults (`status='active'`,
`order_index=0`) and search+filter work; `update` to `proposed` works; unique constraints hold on
`(objective, competency)` and `(objective, prerequisite)`; `Question.pedagogy_status` defaults to
`unclassified`; criteria defaults (`main` / `manual` / `approved`); a `Question` delete **cascades**
its criteria; a Bloom row referenced by a criterion cannot be deleted (**Restrict**); once free, its
delete clears the objective's cached Bloom id (**SetNull**).

| Suite | Result |
|---|---|
| `tests/integration/PrismaRepository.contract.test.js` | 13/13 pass |
| Full suite (`npx vitest run`) | **116 files / 1478 tests pass** |

### Open items

1. **EPERM is benign.** The failed engine-DLL rename is Prisma's last step: the generated client
   (`node_modules/.prisma/client/index.js` + `index.d.ts`) *was* rewritten and does carry the six new
   models, and the existing engine binary is the correct version. WP2 is therefore not blocked.
   A clean `npx prisma generate` with the dev server (port 3000, PID holds the DLL) stopped is still
   worth doing before release.

---

## WP3 — Services

### Deliverables

**Pure modules — `src/shared/learning/` (no database, no DOM, unit-testable in isolation)**

| File | Exports | Responsibility |
|---|---|---|
| `bloomCatalog.js` | `BLOOM_DIMENSIONS`, `BLOOM_DIMENSION_IDS`, `BLOOM_ORDER`, `toBloomRow()` | The six fixed Bloom dimensions with EN/FR/AR labels, verbs and examples. **AR/FR strings are flagged in-file as pending native review** (WP7 localization gate). |
| `bloom-catalog-validator.js` | `validateBloomCatalog()`, `validateBloomSeed()` | Exactly six rows, unique id/key/order_index, `order_index` 0–5, `labels_json` parses with all three languages. |
| `pedagogy-validator.js` | `validateCriteriaSet()`, `derivePedagogyStatus()`, `pickPrimaryBloom()`, `PEDAGOGY_STATUS`, `CRITERION_SOURCES`, `REVIEW_STATUSES`, `WEIGHT_TOLERANCE` | Whole-set criteria validation (weights ≥ 0 and sum ≈ 1, unique `criterion_key`, unique objective/bloom/key triple, enum checks, objective/bloom/competency existence + cross-tenant + subject compatibility); status derivation (`unclassified`/`partial`/`classified`/`needs_review`); primary Bloom = heaviest weight, ties by taxonomy order then id. |
| `prerequisite-validator.js` | `findCycle()`, `validatePrerequisiteGraph()`, `PREREQUISITE_STRENGTHS`, `MAX_PREREQUISITE_DEPTH` | Directed-graph cycle detection for the prerequisite tree. |
| `competency-link-validator.js` | `validateCompetencyLink()` | Same-school, subject compatibility, finite non-negative weight, at most one `is_primary` per objective. |

**Services — `src/backend/services/learning/`**

- `LearningTaxonomyService.js`
  - `ensureSeeded()` — validates the catalog then upserts by id; returns `{created, updated, total}`;
    idempotent (second run: 0 created, 6 updated). No seed SQL, so it is provider-agnostic.
  - D2 governance: `listObjectives` (teachers see `active` + `archived` + their own proposals),
    `getObjective`, `createObjective` (admin or `learning.teacher_objective_creation` ON → `active`,
    otherwise `proposed` + `proposed_by`), `updateObjective` (teacher: own `proposed` only, status
    never editable; admin: any), `approveObjective`, `rejectObjective` (note required),
    `archiveObjective` — **no hard delete anywhere**.
  - Competencies + links: `listCompetencies`, `createCompetency`, `updateCompetency`,
    `archiveCompetency`, `listObjectiveCompetencies`, `linkCompetency` (idempotent), `unlinkCompetency`.
  - Prerequisites: `listPrerequisites`, `addPrerequisite` (self-edge + cycle rejected),
    `removePrerequisite`.
  - Setting read: `isTeacherCreationEnabled(schoolId)` — default **false**, only the literal `'true'` counts.
  - Every mutation is audited; all ids are re-checked against the caller's `school_id` (foreign → 404).
- `QuestionPedagogyService.js`
  - `listCriteria`, `getQuestionPedagogy` (criteria + objective/competency/Bloom labels in one call;
    deterministic order — heaviest criterion first, ties by `criterion_key`), `setCriteria`
    (validates the whole set before writing, delete-then-create), `addCriterion`, `removeCriterion`,
    `clearCriteria`, `recompute`.
  - `#applyDerivedFields` writes the cached `pedagogy_status`, `primary_bloom_dimension_id` and the
    review stamp; `recompute` never stamps a review.
  - Write scope: admin any question, teacher only questions they authored (`created_by`); a foreign
    question is a 404, not a cross-tenant write.

### Verification

Temp-DB flow script (throwaway, deleted afterwards): **51 checks, 51 pass, 0 fail** — covering Bloom
seed idempotency/order/labels, D2 OFF→`proposed` / approve / reject-with-note / teacher-cannot-approve /
own-proposal edit / status not editable / ON→`active`, duplicate `(subject, code)` conflict,
cross-tenant subject 404, unknown Bloom 422, archive, competency primary-link conflict + cross-subject
rejection + idempotent re-link + unlink, prerequisite self/cycle/teacher-forbidden/removal/re-add,
criteria weight-sum + duplicate-key + foreign-objective 404, valid set → `classified` with primary Bloom
`apply`, enriched labels (`fr = 'Appliquer'`), other-teacher forbidden, `addCriterion` re-validation,
`removeCriterion` re-derivation, clear → `unclassified`, imported 0.5 weights → `partial`,
`needs_review` wins, and the audit trail.

| Suite | Result |
|---|---|
| WP3 flow script (temp DB) | 51/51 pass |
| Full suite (`npx vitest run`) | **116 files / 1478 tests pass** |

Two defects found and fixed during verification:

1. **Partial objective update mis-read as full.** The teacher branch of `updateObjective` built an object
   with every editable key present (values `undefined`), so `order_index: undefined` was treated as
   *supplied* and rejected. Fixed by forwarding only the keys actually present in the request.
2. **Non-deterministic criteria order.** `question_assessment_criteria` has no natural ordering, so a
   panel could reorder between reads. `listCriteria` now sorts by weight desc then `criterion_key`.

### Open items

- Unit tests for the four validators and the service flows are **WP6** (spec), not WP3 — the temp-DB
  script is the WP3 evidence and has been removed so no throwaway code lands on the branch.
- AR/FR Bloom labels still need a native-language review before pilot use (WP7 gate; flagged in
  `bloomCatalog.js`).
- Nothing from WP3 is wired into the container, boot seed, routes, permissions or backup yet — that is
  deliberately **WP4**.

---

## WP4 — Routes, permissions and backup

### Deliverables

**Permissions — `src/shared/permissions.js`** (catalog entries; `ROLE_PERMISSIONS` is derived, so the
roles pick them up automatically through `permissionsInScope(scope)`):

| id | scope | granted to |
|---|---|---|
| `school.learning.read` | SCHOOL | SUPER_ADMIN, ADMIN |
| `school.learning.manage` | SCHOOL | SUPER_ADMIN, ADMIN |
| `class.learning.read` | CLASS | TEACHER |
| `class.learning.classify` | CLASS | TEACHER |

Verified by resolving `ROLE_PERMISSIONS`: **admin** → `school.learning.read, school.learning.manage`;
**teacher** → `class.learning.read, class.learning.classify`; **student** → none. No migration is needed
because `RoleService.ensureSeeded()` mirrors the catalog into `RolePermission` at boot.

**Boundary schemas — `src/shared/schemas/learning.schema.js`** (new). Zod schemas for every write
payload, exported with their enum constants: `ObjectiveCreateSchema`, `ObjectiveUpdateSchema`
(all-optional, `status` accepted only so the route can answer it with a clear 422), `ObjectiveFilterSchema`,
`ObjectiveApproveSchema` (note optional), `ObjectiveRejectSchema` (note **required**), `CompetencyCreateSchema`,
`CompetencyUpdateSchema`, `CompetencyFilterSchema`, `CompetencyLinkSchema`, `PrerequisiteCreateSchema`,
`CriterionSchema`, `CriteriaSetSchema` (max 50 criteria, `source`, `mark_reviewed`).

**Routes — `src/backend/routes/learning.routes.js`** (new), mounted at `app.use('/api/v1/learning', …)`
in `server.js`. The router applies `requireAuth` + `enforceTenant` to everything, then one of three
guards: `read` (`school.learning.read` \| `class.learning.read` \| either manage/classify),
`write` (`school.learning.manage` \| `class.learning.classify`), `manage` (`school.learning.manage`
only). A student token — which holds none of these — never reaches a service.

| Method + path | Guard | Service call |
|---|---|---|
| `GET /bloom` | read | `listBloomDimensions()` |
| `GET /objectives` | read + `ObjectiveFilterSchema` | `listObjectives()` (`?status=proposed` returns the queue) |
| `GET /objectives/:id` | read | `getObjective()` |
| `POST /objectives` | write | `createObjective()` (allows a teacher to propose when the school enables it) |
| `PATCH /objectives/:id` | write | `updateObjective()` — `status:'archived'` is intercepted and dispatched to admin-only `archiveObjective()`; any other `status` **and** the approve/reject statuses are rejected 422 |
| `POST /objectives/:id/approve` | manage | `approveObjective()` |
| `POST /objectives/:id/reject` | manage | `rejectObjective()` |
| `GET/POST /objectives/:id/competencies` | read / manage | `listObjectiveCompetencies()` / `linkCompetency()` |
| `DELETE /objectives/:id/competencies/:competencyId` | manage | `unlinkCompetency()` |
| `GET/POST /objectives/:id/prerequisites` | read / manage | `listPrerequisites()` / `addPrerequisite()` |
| `DELETE /objectives/:id/prerequisites/:prerequisiteObjectiveId` | manage | `removePrerequisite()` |
| `GET /competencies` | read + filter | `listCompetencies()` |
| `POST /competencies` · `PATCH /competencies/:id` · `POST /competencies/:id/archive` | manage | `createCompetency()` / `updateCompetency()` / `archiveCompetency()` |
| `GET/PUT /questions/:questionId/pedagogy` | read / write | `getQuestionPedagogy()` / `setCriteria()` |
| `POST /questions/:questionId/pedagogy/criteria` · `DELETE …/criteria/:criterionId` · `DELETE …/pedagogy` | write | `addCriterion()` / `removeCriterion()` / `clearCriteria()` |
| `POST /questions/:questionId/pedagogy/recompute` | manage | `recompute()` |

The status interception is how the frozen spec's *"Archive remains `PATCH status='archived'`"* is
honored without adding a duplicate archive endpoint or letting a teacher move `proposed → active`:
archive is a management action there too, and every other status change is refused at the boundary
instead of reaching `updateObjective`, which never touches status.

**Wiring — `src/backend/container.js` and `src/backend/server.js`.** Both learning services are
registered on the container (`learningTaxonomySvc`, `questionPedagogySvc`) with the audit service
injected, and `server.js` calls `learningTaxonomySvc.ensureSeeded()` after the role seed, inside a
`try/catch` so a catalog-sync failure is logged as a warning and **never fails boot** (the same
pattern as the existing seed blocks).

**Backup / restore.** The five taxonomy stores are now in **both** lists, so a snapshot round-trips
them:

- Export — `src/backend/routes/console.routes.js` → `EXPORT_TABLES`: `learning_objectives`,
  `competencies`, `learning_objective_competencies`, `learning_prerequisites`,
  `question_assessment_criteria`.
- Import — `src/frontend/console/pages/settings/documents.js` → `IMPORT_ORDER`, same five, ordered
  parents-before-children and with the criteria **after** `questions` (each criterion FKs a question).
- Restore endpoints — `src/backend/routes/bulk.routes.js`: five `SANITIZERS` (uuid-checked ids/FKs via
  `pickUuid`, string/int/bool/date coercion; a row with a missing or non-uuid required id is dropped
  rather than corrupting an FK) and five `REQUIRED_FIELDS` entries:
  `learning_objectives: [subject_id, code, statement]`, `competencies: [code, name]`,
  `learning_objective_competencies: [objective_id, competency_id]`,
  `learning_prerequisites: [objective_id, prerequisite_objective_id]`,
  `question_assessment_criteria: [question_id, objective_id, bloom_dimension_id]`.
- `bloom_dimensions` is deliberately **not** exported: it is a global seeded catalog, not organization
  data, so it is re-seeded at boot on the target machine instead of being restored.

The console bundle (`public/console-bundle.js` / `.css`) was rebuilt after the `documents.js` change, so
the tracked artifact matches its source.

### Verification

Throwaway route + backup round-trip script against a temp DB (results copied here, script deleted):

| Area | Checks |
|---|---|
| Auth + tenancy | unauthenticated → 401; student token → 403 on read **and** write; a second school's admin gets 404 on a foreign objective, competency link and question |
| Objectives | teacher proposes (school setting OFF) → `proposed`; admin `?status=proposed` queue sees it; approve → `active`; reject without a note → 422; teacher cannot approve → 403; teacher edits own proposal; teacher edits another's → 404; `PATCH status='active'` → 422; `PATCH status='archived'` → archived, and by a teacher → 403 |
| Competencies + links | create/list/patch/archive; primary-link conflict → 409; cross-subject link → 422; idempotent re-link; unlink |
| Prerequisites | add, duplicate → 409, self-edge → 422, cycle → 422, remove |
| Criteria | `PUT` valid set → `classified` with the correct cached primary Bloom; weight-sum ≠ 1 → 422; duplicate `criterion_key` → 422; foreign objective → 404; `POST` criterion then `DELETE` it re-derives; `DELETE …/pedagogy` → `unclassified`; `recompute` |
| Backup round-trip | export → wipe → bulk restore reproduces all five tables with correct rows and counts |

| Suite | Result |
|---|---|
| WP4 route + backup script (temp DB) | **64/64 pass** |
| Full suite (`npx vitest run`) | **116 files / 1478 tests pass** |
| `npm run build:console` | clean; bundle regenerated |

Defect found and fixed during verification: the sanitizers' `pickUuid` rejected non-uuid fixture ids.
Checked against the live `prisma/dev.db` — real `school`/`user`/`subject`/`question` ids **are** uuids,
so `pickUuid` is correct for production data; the test fixtures were corrected to uuid-shaped ids, after
which 64/64 passed.

### Open items

1. **`subjects` is not in the backup lists** (pre-existing, not introduced here). Restoring objectives or
   criteria on a *different* machine therefore needs `subjects` to already exist — the same dependency
   `categories` has today. Left as-is; fixing the subject export is its own change.
2. Route-level integration tests (the script was throwaway) are **WP6** per the spec.
3. AR/FR Bloom labels still need native review before pilot (WP7 gate).

---

## WP5 — Frontend

**Scope (authorized):** the Question Pedagogy panel, the objective/Bloom/pedagogy-status filters, bulk
classify, the admin proposal queue, the EN/FR/AR learning label dictionary and RTL `dir` on the
learning-panel root only. **No AI controls** (that is Phase 6).

### Deliverables

**New console pages — `src/frontend/console/pages/learning/`** (all under the console SPA, no parallel UI):

| File | Responsibility |
|---|---|
| `labels.js` | The learning label dictionary in EN/FR/AR (~250 keys) plus `LANGUAGES`, `dirFor`, `getLanguage`/`setLanguage` (persisted per browser in `localStorage`, display preference only — never a source of truth), `t`/`translator`, `pedagogyStatusLabel`, `objectiveStatusLabel`. |
| `flags.js` | The Phase-1 flag client: `ADAPTIVE_SETTING_KEY` (`learning.adaptive.enabled`), the read/write/manage permission sets, `loadFlags`/`getFlags`/`resetFlags`, `isAdaptiveEnabled`, `teacherCreationEnabled`, and `setAdaptiveEnabled` (writes through the admin-only `PATCH /settings/:key`). |
| `common.js` | Shared shell for the three pages: `learningShell`/`bindLearningShell` (the `dir` root + language switch), `ensureEnabled` (fails **closed** when the flag cannot be read), `disabledBody`/`bindEnableToggle`, `fetchBloom`, `bloomLabel`/`bloomOptions`/`bloomById`, `pedagogyChip`/`objectiveChip`, `renderLoadError`/`renderLoading`. |
| `index.js` | `learningHubPage` — the section hub. Four KPI cards (objectives, proposals, competencies, questions) drawn from one `Promise.all`; the disabled-state panel with the admin-only enable toggle. |
| `questions.js` | `pedagogyQuestionsPage` — the question list with search, **objective / Bloom / pedagogy-status** filters, server-side paging, row selection, a per-row classify action and the bulk-classify entry point. |
| `pedagogy-editor.js` | `openPedagogyEditor` — the criteria modal: one row per criterion (objective + Bloom + competency + weight + `criterion_key` + rubric), a live weight total that disables Save until it is 1.00, a `mark_reviewed` checkbox and Clear. |
| `bulk-classify.js` | `openBulkClassify` — one objective + one Bloom + weight 1.00 applied to the selection, **sequentially**, with an `x / n` progress line and a per-question failure list on partial success. |
| `forms.js` | `openObjectiveForm` / `openCompetencyForm` / `openCompetencyLinkForm` / `openPrerequisiteForm` — the taxonomy create/edit dialogs (subject-dependent category/parent repaint; `err.fields` rendered as `key: message`). |
| `taxonomy.js` | `taxonomyPage` — the objective list, the competency list and the **proposal queue** (tabs, admin-only), plus the objective detail view with its competency links, prerequisites, unlink/remove and the approve/reject review dialog (reject requires a note). |

**Modified console files**

- `main.js` — imports the hub + two pages; a Learning entry in `NAV` (group *Teaching*) and the three
  pages in `PAGES`; `landOnFirstSection()` redirects a teacher (who holds a learning permission but not
  `platform.console`/`school.console`) from `#/` to `#/learning`, so they never land on *Access
  restricted*.
- `core/shell.js` — one new `learning` icon.
- `styles/console.css` — the `.learning-*` block (panel, status chips, criteria editor, weight total,
  tabs, detail, question cell, selection row, bulk drawer, dialog form). Every rule uses **logical**
  properties (`inline-start/end`, `block-start/end`) so the RTL `dir` root lays out without a second
  stylesheet.

**Additive backend plumbing the frontend needed** (read-only; cannot widen any caller's scope)

| Change | File |
|---|---|
| `GET /learning/flags` → `{adaptive_enabled, teacher_objective_creation}` | `src/backend/routes/learning.routes.js` |
| `GET /learning/objectives/:id/questions` — the objective filter resolves to criteria rows server-side | same |
| `QuestionFilterSchema` gains `pedagogy_status`, `primary_bloom_dimension_id`, `ids` (all optional) | `src/shared/schemas/question.schema.js` |
| `GET /questions?ids=a,b,c` → `id IN (...)` (capped at 500), inside the **same** school-scoped query | `src/backend/routes/questions.routes.js` |

The objective filter is applied **server-side** (via `ids`) rather than by re-filtering in the browser,
so paging and the total stay the server's and the id set can never widen what the caller may read.

**Console gate extension — `src/backend/routes/console.routes.js`** (the one boundary the change
touches). The console router's `requirePermission('platform.console', { allow: [...] })` gains the four
learning permissions on its **allow** list, because teachers author the taxonomy on the console SPA and
otherwise could not reach it. It is a gate, not a grant: `/console/session` becomes readable for a
teacher (the shell needs it), but every console route keeps its own permission check, the navigation is
built from the permission set, and a teacher still holds **no** `school.*` / `platform.*` permission —
so every management surface refuses them.

**Test updated to pin the narrower, correct boundary — `tests/integration/console.permissions.test.js`.**
The old `refuses a teacher` expectation is now wrong by design, so it was replaced by
`admits a teacher ONLY for the learning surface`, which asserts the session is readable, contains
`class.learning.read`, contains **no** `school.*` / `platform.*` permission, and that `/console/users`
and `/console/organizations` still answer **403**. The student and unauthenticated cases are unchanged.

### Verification

| Check | Result |
|---|---|
| `node --check` on every new/modified frontend + backend module | clean |
| Console gate re-read (`console.routes.js`) and flag/objective-questions routes re-read | present, as described |
| `npm run build:console` | clean — `public/console-bundle.js` 325.6 kb, `.css` 45.2 kb |
| Full suite (`npx vitest run`) | **116 files / 1478 tests pass** (after the teacher-boundary test was corrected) |

### Deliberate limitations (reported, not hidden)

1. **Per-row criteria counts are not shown.** Criteria are not on the question row, and filling them in
   would be an N+1 call per page; the list shows the *derived* `pedagogy_status` chip instead, which is
   the same information state at a fraction of the cost.
2. **The pedagogy/taxonomy dialogs are not RTL.** The frozen spec confines `dir` to the learning-panel
   root, so the modals render LTR; the panel around them switches direction.
3. **FR/AR strings are best-effort** and still need native review (the WP7 localization gate, the same
   one flagged for the Bloom labels in WP3).
4. **The Learning navigation entry is deliberately not hidden when the flag is off.** With
   `learning.adaptive.enabled` OFF the pages render only the disabled state plus the admin toggle;
   hiding the entry would make the switch unreachable — i.e. the capability would be off *and*
   impossible to turn on from the UI.

### Open items

- Route/UI tests for the learning surface are **WP6** per the spec.
- The gate widening above is called out for the owner's review specifically: it is the only place WP5
  changes an existing access boundary, and it is pinned by the updated integration test.
- AR/FR strings pending native review (WP7).

---

## WP6 — Tests

**Scope:** unit tests for the four pure validators, integration tests for the criteria CRUD and the
proposal flow, the security/scope tests the spec enumerates, and a regression run (existing
question/exam/game suites + the Phase-0 repository contract, unchanged).

### Deliverables

**Unit — `tests/unit/` (4 files, 72 tests)**

| File | Covers |
|---|---|
| `bloom-catalog-validator.test.js` (15) | seed valid; six ids in order; EN/FR/AR present; non-array; missing / unknown / duplicate id; duplicate key; out-of-range and duplicate `order_index`; missing locale; invalid JSON; parsed-vs-string labels; **Bloom ≠ difficulty** (no difficulty key, no difficulty in `toBloomRow`, taxonomy order independent of difficulty). |
| `pedagogy-validator.test.js` (30) | empty set; single and multi criterion; tolerance; weights ≠ 1; negative / non-numeric weight; required ids; foreign objective / competency; subject mismatch; transversal competency; blank competency; duplicate key; blank key defaults to `main`; duplicate triple; different keys accepted; negative `max_score`; bad `source` / `review_status`; `derivePedagogyStatus` (all four states, `needs_review` wins, NaN-safe); `pickPrimaryBloom` (heaviest, accumulation, deterministic tie-break, missing ids). |
| `prerequisite-validator.test.js` (16) | self-edge; no-cycle; direct cycle; longer cycle; replaced edge ignored; unrelated edges; whole-graph validation (empty, valid, non-array, missing endpoint, duplicate, bad strength, cycle, depth ceiling at `MAX_PREREQUISITE_DEPTH`). |
| `competency-link-validator.test.js` (11) | same-school/same-subject; transversal; missing / foreign endpoints; cross-subject; default weight; negative / non-finite weight; single-primary rule (same competency re-mark is fine, another competency conflicts, other objectives ignored); non-primary always allowed. |

**Integration — `tests/integration/learning.routes.test.js` (42 tests)**, real HTTP against a real DB,
two schools, one admin, three teachers and a student:

| Group | Assertions |
|---|---|
| Flags | unauthenticated 401; student 403; both settings default **false**; the adaptive switch reads back true when the admin turns it on. |
| Bloom | six dimensions in taxonomy order. |
| D2 governance | teacher + OFF → `proposed`; teacher + ON → `active`; admin → `active`; duplicate `(subject, code)` → 409; proposal appears in `?status=proposed`; teacher cannot approve/reject (403); admin approves; reject without note → 422; reject with note → `rejected` + note; teacher edits own proposal but not a colleague's (403); `PATCH status='active'` → 422; archive admin-only (teacher 403, admin 200); foreign objective 404 for admin and teacher. |
| Pedagogy / ownership | unclassified start; teacher classifies own question → `classified` + primary Bloom; labels enriched (`objective_code`, `bloom_name`, `bloom_labels`); colleague's question → 403; author and admin may classify; weights ≠ 1 → 422 with **flat** `fields.weights`; unknown Bloom → 422; foreign objective → 404; foreign question 404 on read and write; add/remove a criterion (valid remainder) → 200, re-delete → 404; clear → `unclassified`; `recompute` teacher 403 / admin 200 deriving `partial` + primary Bloom from an imported row; objective-questions endpoint returns the criteria rows. |
| Admin-only taxonomy | teacher refused competencies, links, prerequisites (403); admin creates links, second primary → 422, non-primary 201, unlink 200; prerequisite add 201, cycle 422, self-edge 422, remove 200; foreign competency 404. |
| Regression / filters | unclassified question reads 200 with `unclassified`; stays in the list; `pedagogy_status` filter both ways; `ids` filter returns exactly the set and stays inside the school; teacher author scope unchanged; student refused the learning read. |

**Test-app helper.** `tests/integration/helpers/app.js` now mounts `learningRoutes` at
`/api/v1/learning` (it mirrors `server.js`; the earlier suites never needed it).

### Defects found by these tests and fixed

1. **Double-nested validation field messages (WP3).** All four validators called
   `push(key, ['message'])`, so `ValidationError.fields` was `Record<string, string[][]>` and every
   learning 422 serialized as `{ "criteria[0]": [["objective_id is required"]] }` instead of the
   contract `Record<string, string[]>`. Fixed at the 36 call sites; the integration test now pins the
   flat shape.
2. **The `ids` question filter was silently ignored (WP5).** The route converted `?ids=` into
   `filters.id = { in: [...] }`, but `QuestionService.list` re-parses its filters through
   `QuestionFilterSchema`, which strips unknown keys — so the objective-filter path in the pedagogy
   view returned the unfiltered list. The conversion now happens **inside** `QuestionService.list`
   after parsing (from the schema-validated `ids` string), still capped at 500 and still inside the
   school-scoped query. Pinned by the integration tests for the explicit id set and the tenant
   boundary.

### Verification

| Suite | Result |
|---|---|
| Four validator unit suites | **72/72 pass** |
| `tests/integration/learning.routes.test.js` | **42/42 pass** |
| `tests/integration/questions.author-scope.test.js` (unchanged) | pass |
| Phase-0 repository contract (`PrismaRepository.contract.test.js`) | pass |
| Full suite (`npx vitest run`) | **121 files / 1592 tests pass** (was 116 / 1478) |

No console-bundle rebuild was needed: none of the changed production modules is part of the console
bundle (verified — the bundle contains neither the validators nor `QuestionService`).

### Open items

- Frontend/UI tests are not part of WP6 (the spec scopes them to the validators, routes, scope and
  regression); the WP5 pages are exercised manually at review.
- AR/FR strings still pending native review (WP7 gate).
- Nothing advances to WP7 without the owner's review.

---

## Progress log

### 2026-11-19 — WP1 — schema + migration

- Implemented the additive `Question` pedagogy fields and the six taxonomy models; no suggestion table.
- Wrote the `learning_taxonomy` migration; no seed SQL (portability).
- Verified: `prisma validate` clean; regenerated diff byte-identical to the migration; migration applied
  successfully to a copy of the live snapshot **and** to a fresh empty database; all 10,489 questions
  preserved and left `unclassified`; FK and integrity checks clean.
- Reported the Prisma diff, the migration SQL and the apply results.
- **Stopped for owner review.**

### 2026-11-19 — WP1 — accepted

- Owner accepted the WP1 review and authorized continuation ("ok you can continue"), with the standing
  instruction to keep reporting phase progress. WP2 started.

### 2026-11-19 — WP2 — backend data access

- Added the six taxonomy tables to `MODEL_MAP` (+ search fields, + display ordering) and synced the
  architecture's repository table.
- Verified with a temp-DB round-trip (22 checks) plus the repository contract suite and the full suite:
  all green. Temp database and the throwaway script were deleted.
- **Stopped for owner review.** No WP3 work started in this step.

### 2026-11-19 — WP2 — accepted

- WP2 accepted by the same continuation instruction that authorized WP3.

### 2026-11-19 — WP3 — services

- Added the four pure modules under `src/shared/learning/` (Bloom catalog, pedagogy, prerequisite,
  competency-link validators) and the two services under `src/backend/services/learning/`.
- Verified with a temp-DB flow script (51 checks) plus the full suite: all green. Two defects found
  and fixed (partial-update field leakage; non-deterministic criteria order). Throwaway script deleted.
- **Stopped for owner review.** No container wiring, routes, permissions or backup changes — those are
  WP4 and remain unauthorized.

### 2026-11-19 — WP3 — accepted

- WP3 accepted by the same continuation instruction that authorized WP4 ("ok continue").

### 2026-11-19 — WP4 — routes, permissions and backup

- Added the four `*.learning.*` permissions (derived into `ROLE_PERMISSIONS`), the Zod boundary schemas,
  and `learning.routes.js` behind `requireAuth` + `enforceTenant` with read / write / manage guards.
- Wired both services onto the container and added the boot `ensureSeeded()` (warn-only, cannot fail boot).
- Added the five taxonomy stores to the backup export list, the import order and the bulk sanitizers /
  required-field maps; `bloom_dimensions` stays a seeded global catalog and is not exported.
- Verified with a temp-DB route + backup round-trip script (64 checks) plus the full suite (116 files /
  1478 tests): all green. Rebuilt the console bundle. Throwaway script deleted.
- **Stopped for owner review.** No frontend — WP5 remains unauthorized.

### 2026-11-19 — WP4 — accepted; WP5 authorized

- Owner accepted WP4 and authorized WP5 with three decisions: the surface is a **new console SPA page**;
  the capability is gated by **`learning.adaptive.enabled` plus an admin toggle**; the scope is
  **objectives + competencies + proposal queue**.

### 2026-11-19 — WP5 — frontend

- Added the learning section to the console SPA: the label dictionary (EN/FR/AR + RTL helper), the flag
  client, the section hub with the admin enable toggle, the question-pedagogy list (objective / Bloom /
  status filters, server-side paging, row selection), the criteria editor, bulk classify, the taxonomy
  page with the admin proposal queue, and the taxonomy dialogs. No AI controls.
- Added the three additive read/filter affordances the UI needed (`GET /learning/flags`,
  `GET /learning/objectives/:id/questions`, the `pedagogy_status` / `primary_bloom_dimension_id` / `ids`
  question filters) and the `ids → id IN (...)` handling in the questions route.
- Widened the console gate's allow list by exactly the four learning permissions so a teacher can reach
  the taxonomy; corrected the pinned teacher-boundary integration test to assert the new — narrower —
  boundary (session readable, no `school.*` / `platform.*`, management surfaces still 403).
- Verified: `node --check` on every touched module; `npm run build:console` clean; full suite **116 files
  / 1478 tests pass**.
- **Stopped for owner review.** No WP6 tests, no AI work — both remain unauthorized.

### 2026-11-19 — WP5 — accepted; WP6 authorized

- Owner accepted WP5 and authorized WP6 with the continuation instruction ("continue").

### 2026-11-19 — WP6 — tests

- Added four validator unit suites (72 tests), including the explicit "Bloom ≠ difficulty" contract,
  and an integration suite (42 tests) covering the D2 proposal flow, criteria CRUD, question ownership,
  tenant isolation, admin-only taxonomy, the flags' off-by-default state and the Phase-1 question
  filters.
- Mounted `/api/v1/learning` in the integration test app helper.
- Found and fixed two defects the tests exposed: validator `fields` were double-nested (WP3) and the
  `?ids=` question filter was dropped by `QuestionService`'s filter re-parse (WP5). Both are pinned by
  the new tests.
- Verified: 72/72 unit, 42/42 integration, full suite **121 files / 1592 tests pass**; the existing
  author-scope suite and the repository contract pass unchanged.
- **Stopped for owner review.** WP7 (docs + flags report) remains unauthorized.

---

## How to append an entry

Add a new dated section under *Progress log* when a work package finishes (or when a finding changes
the plan), and update the matching row of the *Status board* in the same commit. Keep the spec
(`docs/phase 01.md`) unchanged unless the owner approves a scope change; record approved scope changes
in the log first, with the date and the owner's decision.

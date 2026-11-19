# Phase 1 progress log — taxonomy and question pedagogy

**Purpose.** This is the live record of the adaptive-learning Phase 1 implementation. The
previous file, [`docs/phase 01.md`](./phase%2001.md), is the **frozen spec** (what Phase 1 is
and why); this file is the **mutable record** (what has actually been done, verified and left
open). When the two disagree about *scope*, the spec wins; when they disagree about *status*,
this file wins.

**Branch:** `feature/adaptive-learning-phase1`
**Authorization:** WP1 accepted 2026-11-19; WP2 and WP3 accepted by the same "continue" instruction;
WP4 implemented and **awaiting owner review**. WP5+ is not authorized until the WP4 review.

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
| WP4 | Routes + permissions + backup | **Done — awaiting review** | Yes |
| WP5 | Frontend (pedagogy panel, filters, proposal queue, labels/RTL) | Not started | — |
| WP6 | Tests (validators, integration, scope, regression) | Not started | — |
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

---

## How to append an entry

Add a new dated section under *Progress log* when a work package finishes (or when a finding changes
the plan), and update the matching row of the *Status board* in the same commit. Keep the spec
(`docs/phase 01.md`) unchanged unless the owner approves a scope change; record approved scope changes
in the log first, with the date and the owner's decision.

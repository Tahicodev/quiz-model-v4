# Phase 1 progress log — taxonomy and question pedagogy

**Purpose.** This is the live record of the adaptive-learning Phase 1 implementation. The
previous file, [`docs/phase 01.md`](./phase%2001.md), is the **frozen spec** (what Phase 1 is
and why); this file is the **mutable record** (what has actually been done, verified and left
open). When the two disagree about *scope*, the spec wins; when they disagree about *status*,
this file wins.

**Branch:** `feature/adaptive-learning-phase1`
**Authorization:** WP1 accepted 2026-11-19; WP2 and WP3 accepted by the same "continue" instruction;
WP4 accepted; WP5 authorized by the owner's decisions (console SPA page · gated by
`learning.adaptive.enabled` + an admin toggle · objectives + competencies + proposal queue);
**WP6 accepted 2026-11-19**. **WP5 was implemented but NOT accepted** at the time (owner decision **A2**,
2026-11-21): the owner requested five ordered pre-WP7 fixes (adaptive gate, console sweep, rebuild audit,
browser walkthrough, docs/attestation/restore reporting), all applied 2026-11-19, and required a further
review of the corrected console before acceptance. **WP7 executed 2026-11-20** on the owner's instruction
("finish WP7 first") as a documentation and verification package; its output is
[`docs/PHASE1_COMPLETION_REPORT.md`](./PHASE1_COMPLETION_REPORT.md). The instruction "continue" authorized
**WP6 only**; it did **not** establish WP5 acceptance (owner decision **B1**, 2026-11-21). No merge or push
has happened, and no Phase 2 work has started.

**Owner decisions (2026-11-21):** WP5 **not accepted** (A2) and its historical record corrected (B1); G4
**Option 2** confirmed (C1), restore without automatic reassociation (D1), existing permission model
preserved (D1), final G4 wording adopted (E1); D15 **substantively approved** (F1); G2/G3 remain accepted;
U8 closed after D15; the document hierarchy ratified with owner-provenance safeguards (I1); U6 deferred and
Phase 1B **not authorized** (J). Documentation only — no implementation authority.

**Owner decision (2026-11-21, later — supersedes the acceptance rows above; the A2/B1 records are
retained as history):** **WP5 is accepted by the owner** — specifically the refactored teacher-facing
experience that integrates adaptive question pedagogy into the **existing Questions tab** of the admin
application, following the authorized WP5 refactor and UI/UX remediation. The separate Learning Console
architecture is **no longer the accepted teacher workflow** (the console is retained as the admin
governance surface: taxonomy, competencies, proposal queue, master switch). A2 ("implemented but not
accepted") is **superseded by this explicit acceptance and is preserved above as history** — it is not
rewritten. **WP7 is accepted by the owner**; the prior "awaiting owner review" status is superseded and
its chronology preserved. Phase 1 is **ready for formal closure review**, subject to record
reconciliation and safe preservation of the accepted deliverables. **Phase 1B remains NOT authorized.**
No other work package, gate or decision is inferred accepted by this record.

**Draft proposal (not approved, not implemented):**
[`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`](./DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md) —
programme identity/versioning (`programme_key`), objective versioning (P10), historized class
assignment (P12), governance modes, provenance vs review state (P11), coverage (P5), offline/SaaS
delivery, the defect disposition table (§13.1A), the roadmap-numbering reconciliation (§13.11), the
final consolidated review (§15), the round-2 pack (§16: findings, relationship table, T1–T26 test
matrix, unresolved decisions, change report) and the round-3 "final validation" corrections (§17:
coverage = historical membership of the assigned programme version + three measures, provisional
criterion mappings, corrected reference chains, P12 concurrency/partial-unique-index, T27–T34,
criterion code/review-metadata specifics) and the round-4 scope-limited corrections (§17.7–§17.9:
publication-time eligibility frozen at version publication, distinct-objective counting, the complete
question-eligibility predicate, independent parent/child counting, `approved` → `unreviewed` migration,
T35–T38) and the round-5 §6 review corrections (§17.10–§17.12: subject consistency in the coverage
predicate as a backend invariant — `Question` has no `subject_id`, so the subject resolves through the
nullable `Category.subject_id` and undetermined means no contribution — plus the explicit
`confirmCriterion`/`rejectCriterion` confirmation operation with per-criterion `reviewed_by`/`reviewed_at`
audit, and T39–T41) and the round-6 §6 review corrections (§17.13–§17.15: the category-subject-history
policy — `Category.subject_id` is mutable today, so an in-use immutability guard plus a
confirmation-time subject snapshot are required for reproducible coverage (U14) — and the atomicity
requirements that criterion confirmation/rejection include their audit row in one transaction and that
criterion replacement is transactional with replacements starting `unreviewed`; T42–T46) and the round-7
§6 review corrections (§17.16–§17.18: the in-use guard now covers the whole `Question → Category →
Subject` relationship across five mutation paths; current coverage vs historical coverage with an
append-only `CriterionReviewEvent` history so a demotion cannot rewrite a past report; and subject
identity surviving deletion via a non-referential snapshot plus subject archiving instead of delete —
U15; T47–T51) and the round-8 §6 review corrections (§17.19–§17.21: the `CriterionReviewEvent` now
preserves the complete mapping identity with plain/`Restrict` references only, the hard-delete rule covers
any question that ever contributed a confirmed mapping, and the historical reconstruction algorithm is
explicit — latest event at or before the report date, genesis and replacement events, archived-question
handling; plus the four subject-archival guarantees; T52–T55). Status **DRAFT — AWAITING OWNER
APPROVAL**. Review only;
nothing in it is scope until the owner approves individual items.

**Owner decision review (a reading aid, not a decision record):**
[`docs/OWNER-DECISION-REVIEW.md`](./OWNER-DECISION-REVIEW.md) — reviews the **fifteen** unresolved owner
decisions (U1–U15) recorded in Revision 3.5 §16.4, each with the decision to make, the current proposal,
the alternatives, the consequences, dependencies, a recommendation (explicitly a recommendation, not a
decision), reversibility and implementation impact; plus a dependency matrix, the blocking-versus-
deferrable split, the genuinely open gaps (with exact section references), a proposed decision sequence
that minimises rework, and the list of questions requiring explicit owner answers. It decides nothing:
status remains **DRAFT — AWAITING OWNER APPROVAL**, U1–U15 unresolved, ADR-0001 **Proposed**, and no
implementation file, schema, migration or database state was touched.

**Owner decisions recorded — initial approval (2026-11-20):** the owner answered the fifteen decisions.
They are recorded in [`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`](./DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md)
**§19** (U1–U5, U7, U9–U14 approved; **U8** and **U15** approved **in principle**; **U6** deferred; the
**G1–G4** clarifications and the applied **G6** §12 correction), with the review document's outcome
summarised in [`docs/OWNER-DECISION-REVIEW.md`](./OWNER-DECISION-REVIEW.md) §9. The decisions **choose the
architecture** and authorise **no implementation** — no schema, migration, service, route, frontend or
test change, and **no defect fix**. ADR-0001 remains **Proposed**.

**Defect A / Defect B fix proposal (not authorised):**
[`docs/DEFECT-A-B-FIX-PROPOSAL.md`](./DEFECT-A-B-FIX-PROPOSAL.md) — the minimal isolated change proposal
the owner required before authorising those two fixes (files, root cause with evidence, blast radius,
options, tests, out-of-scope, risk/rollback). It is a **proposal that authorises nothing**; Defects
C/D/E/F stay in the Phase 1B scope.

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
| WP5 | Frontend (pedagogy panel, filters, proposal queue, labels/RTL) | **Done — accepted by owner 2026-11-21** (acceptance supersedes A2, which is preserved as history); the accepted teacher workflow is the **refactor into the existing Questions tab** (2026-11-21) incl. the authorized UI/UX remediation; the separate Learning Console classification workflow was removed (console retained as admin governance) | Yes |
| WP6 | Tests (validators, integration, scope, regression) | **Done — accepted by owner 2026-11-19** | Yes |
| pre-WP7 | Owner-requested fixes (gate, console sweep, rebuild audit, walkthrough, docs/restore) | **Done — accepted** (owner confirmed the WP5 result 2026-11-21; the five fixes were part of that reviewed result) | Yes |
| WP7 | Docs + flags / completion report | **Done — accepted by owner 2026-11-21** (report at `docs/PHASE1_COMPLETION_REPORT.md`; acceptance supersedes the prior "awaiting owner review" status, chronology preserved) | Yes |

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

## WP7 — Docs + flags

### Deliverables

- [`docs/PHASE1_COMPLETION_REPORT.md`](./PHASE1_COMPLETION_REPORT.md) — the Phase 1 completion report:
  scope delivered, the six tables and five additive `Question` columns, endpoints, permissions, the
  flags-default-off evidence, the no-evidence/no-mastery evidence, verification evidence, open items
  and the acceptance-criteria status table.
- Flags-default-off confirmation and no-evidence/no-mastery confirmation (report §3 and §4).
- [`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`](./DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md) — a
  **draft proposal** requested by the owner in the same instruction. It is explicitly not approved and
  not implemented; it carries options, trade-offs, recommended defaults, effort and the Phase 1 code
  and tests each item would change.
- [`docs/OWNER-DECISION-REVIEW.md`](./OWNER-DECISION-REVIEW.md) — a **reading aid** for the owner's
  decision review of that draft's fifteen unresolved decisions (U1–U15): decision register, dependency
  matrix, blocking-vs-deferrable split, genuine gaps with section references, a rework-minimising
  sequence and the questions needing explicit owner answers. It records no decision and authorises
  nothing; the draft remains **DRAFT — AWAITING OWNER APPROVAL**.
- The owner's **initial approval** of the fifteen decisions (2026-11-20) is recorded in the draft's
  **§19** (§9 of the review document): twelve approved outright, **U8**/**U15** approved **in principle**
  (D15 wording and the **G4** archival lifecycle still pending), **U6** deferred. It authorises **no
  implementation**.
- [`docs/DEFECT-A-B-FIX-PROPOSAL.md`](./DEFECT-A-B-FIX-PROPOSAL.md) — the minimal isolated change
  proposal for **Defect A** (non-transactional `setCriteria`) and **Defect B** (school-wide loaders
  truncating at 1,000), required by the owner before authorising either fix; a **proposal that authorises
  nothing**.

### Verification

| Check | Result |
|---|---|
| `npx vitest run` (2026-11-20) | **122 files passed (122) · 1600 tests passed (1600)** — 46.6s |
| Flags default off | Confirmed in code: absent settings row ⇒ off (`LearningTaxonomyService.js:151-159`, `:124-131`); nothing seeds either key; no frontend writes the key; the router gate is authoritative |
| No evidence/mastery | Confirmed: no such model among the 48 in `schema.prisma`; no learning path writes `Result` / `ExamSession` / `Exam`; only unrelated string matches remain in `src/` |
| Code changed to produce WP7 | None |

### Open items

- WP5 acceptance remains the owner's decision (unchanged by WP7).
- AR/FR strings still pending native review before a pilot.
- Live `prisma/dev.db` is still at 22 migrations; the learning migration was verified on a copy only.
- No admin UI enables `learning.adaptive.enabled` (API-only today); recorded as a conscious choice to
  revisit before a pilot.
- Findings carried forward: ~4,000 leftover `prisma/test-*.db` (~3.1 GB); untracked
  `tests/unit/ResultService.session-mode.contract.test.js`.

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

### 2026-11-19 — WP5 — accepted; WP6 authorized — **CORRECTED 2026-11-21 (owner decision B1)**

> **Correction (owner decision, 2026-11-21).** The heading and bullet below record an **agent inference**
> from the instruction "continue". They are **not** an owner acceptance. "Continue" authorized **WP6
> only**; WP5 remains **implemented but not accepted** (owner decision A2). The original text is retained
> verbatim so the chronology stays traceable.

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

### 2026-11-19 — pre-WP7 hardening (owner-requested, five tasks)

Owner accepted WP6 and kept WP5 unaccepted, ordering five fixes before WP7. All five are applied.

1. **Adaptive gate enforced server-side.** `GET /learning/flags` is declared first; every later
   `/learning` route passes through `requireAdaptiveEnabled`, which reads `learning.adaptive.enabled`
   and returns `403 FEATURE_DISABLED` (distinct from `FORBIDDEN`) when off. The learning integration
   suite enables the flag in `beforeAll`, and a new sweep enumerates the router stack and proves every
   route (≥20) refuses while off — including a per-school case (school B refused while A is enabled).
2. **Console route sweep.** A dynamic sweep walks the console router (plus the mounted
   organization-admin sub-router) and asserts a teacher gets `403` on every route except
   `/console/session` (which returns the class-scoped session payload). The sweep exposed four
   unguarded routes (`/roles`, `/permissions`, `/permissions/overrides`, `/health`) returning 200 to a
   teacher; each now carries `requireAnyPermission` matching its surface.
3. **Question-rebuild audit.** Before/after row counts for every table, a live-vs-schema column
   comparison, and a SHA-256 digest of the legacy Question content: all 16 legacy columns preserved,
   21 live columns, 0 schema mismatches, 7 indexes recreated. The live `prisma/dev.db` has only 22
   migrations (no learning tables) — the migration was verified on a copy, not the live database.
4. **Browser walkthrough.** Real console UI: teacher classified a question (Bloom Apply → badge
   `Classified`), admin approved a proposed objective (queue → empty), Arabic switched the learning
   panel to `dir="rtl"` (labels only; the console shell stays LTR by design), and the admin disabled
   `learning.adaptive.enabled` (hub + questions render the disabled state; nothing is deleted). The
   walkthrough found and fixed a real WP5 crash: `bindControls` called an undeclared `bloomCache`, so
   `#/learning/questions` rendered "This section could not be rendered" — the dead line was removed
   and the bundle rebuilt.
5. **Docs + restore honesty.** Architecture and ADR now document `class.learning.classify` (with
   `class.learning.manage`/`class.learning.assign` marked Phase 3 design-only), mark
   `Exam.is_high_stakes` as Phase 2/3 design not present in the Phase 1 schema, add the invariant
   *what is recorded ≠ what can be proven ≠ what a teacher designates as formal*, and cap
   teacher-attestation weight at 1.0 pending D5. `POST /bulk/:table` (the restore path) now reports
   `dropped: {total, reasons, samples}` — invalid rows, sanitizer rejects, out-of-scope rows, missing
   required fields, policy-filtered rows and not-persisted rows — and a refused snapshot still reports
   exactly which rows caused the refusal. Four integration tests pin this.

**Verified:** full suite **122 files / 1600 tests pass** (the learning route suite is now 44 tests,
console permissions 17, bulk drop-report 4). **Stopped for owner re-review.** No merge, no push, no
WP7, no Phase 2 work.

### 2026-11-20 — WP7 — docs + flags (completion report)

- Owner instruction: "Finish WP7 first." Executed as a documentation-and-verification package; **no
  code was changed**.
- Wrote [`docs/PHASE1_COMPLETION_REPORT.md`](./PHASE1_COMPLETION_REPORT.md): scope held, delivered
  surface, flags-default-off evidence, no-evidence/no-mastery evidence, verification, open items and
  the acceptance-criteria status table.
- Re-verified the full suite on this date: **122 files / 1600 tests pass**, 46.6s. A first run under
  parallel load produced four `beforeAll` hook timeouts in SQLite-booting integration files; the clean
  re-run passed every file. Contending setup cost is documented in `vitest.config.js`.
- Also wrote [`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`](./DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md),
  a **draft proposal** (not approved, not implemented) covering programmes, objective versioning,
  governance modes, coverage, migration of existing objectives, offline/SaaS delivery and a
  mode-by-role test matrix. The owner's 13-point list arrived after the first message contained only
  its placeholder; §13 of the draft answers all 13 points, including a Phase 1 audit (six defects
  A–F reported, none fixed), the exact limitations of the four taxonomy models, the roadmap numbering
  conflict (two different "Phase 5"s) and the Phase 2 reassessment (five new requirements and a
  proposed D15).
- **Open:** WP5 acceptance is still the owner's decision — **confirmed not accepted on 2026-11-21
  (A2)**; AR/FR native review; live `prisma/dev.db` not migrated; no admin UI for the master switch.
  No merge, no push, no Phase 2 work.

### 2026-11-21 — Defect A/B closed; owner-decision completion drafted

- **Defect A** (non-transactional `setCriteria`) and **Defect B** (silent 1,000-row truncation in the
  school-wide loaders) were authorized in two separate, defect-scoped authorizations, implemented, verified
  and **closed** on `feature/adaptive-learning-phase1`. Full suite on this date: **125 files / 1630 tests
  pass**. Defect B kept the targeted graph optimization **B2 deferred** and removed the unused
  `#schoolObjectives` loader (**B4**, confirmed unused). No schema, migration, route, frontend or
  API-contract change; no merge, no push.
- Recorded the corrected defect status and completed the open decision items in
  [`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`](./DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md): new **§20**
  drafts **G4** (question-archival authority, route, audit event and lifecycle — the last item needed to
  complete **U15**), writes the approved **G2/G3** clarifications as normative text, and drafts the
  **U8/D15** register wording. §19.5–§19.6 corrected (the A/B fixes are no longer recorded as
  unauthorized); the §18 change log was extended.
- Updated [`docs/OWNER-DECISION-REVIEW.md`](./OWNER-DECISION-REVIEW.md) with **§9.1** (defect status
  corrected; §6 step 0 satisfied; block-B items 16/17 marked answered) and the §8 status line.
- **Documentation only** — the §20 work changed no code. **U10/U12/U13/U14 remain decided and are not
  reopened.** **Phase 1B is still not authorized**; ADR-0001 remains **Proposed**. Still open: **G4/U15**,
  **U8/D15**, confirmation of the G2/G3 wording, **U6**, and the owner's authorization for implementation.

### 2026-11-21 (later) — owner decision dispositions recorded; supersedes the open items above

- This entry records the owner dispositions that came after the entry above. It **supersedes the "still
  open" list in that entry only**; the defect-closure facts above are unchanged.
- **G2/G3 wording ACCEPTED** (2026-11-21) — §20.3/§20.4 of the draft are the confirmed normative text
  (G2 includes the F1 extension: lifecycle events authoritative for question existence;
  `Question.archived_at` is a current-state convenience only; `created_at <= D < archived_at` is the
  single-archival / no-restore special case).
- **G4 owner choices FINALIZED** (2026-11-21) — teachers own / admins any; archive/restore routes; 409
  DELETE refusal; transactional audit + separate authoritative lifecycle stream; blocking scope = active
  exams including active training exams (draft/archived do not block even if `is_training = true`; games/
  tournaments do not block). The **full G4 wording remains proposed** pending formal adoption; U15 stays
  "approved in principle" until that adoption. No code authorized. *(Superseded: the wording was adopted
  the same day — owner decision E1; see the consolidated-decision entry below.)*
- **U8/D15 register wording ACCEPTED and RECORDED** (2026-11-21) — `docs/PHASE0_DECISION_REGISTER.md` now
  carries D15 in its §1 summary, §2 detail, §3 Phase 1B gate and §4 approval record. **D15 itself remains
  substantively open** as the Phase 1B gate; wording acceptance is not approval of the recommended default
  and not implementation authorization. *(Superseded: D15 was substantively approved the same day — owner
  decision F1; U8 closed.)*
- Still open: formal adoption of the full **G4** wording; substantive **D15** approval; **U6** (deferred,
  blocks nothing); owner authorization for any **Phase 1B** implementation. ADR-0001 remains **Proposed**.
  *(Superseded by the 2026-11-21 consolidated owner decision below: the G4 wording was adopted (E1),
  satisfying U15's wording condition; D15 was substantively approved (F1), closing U8; G2/G3 remain
  accepted; the document hierarchy was ratified with provenance safeguards (I1); U6 remains deferred and
  Phase 1B remains unauthorized.)*

### 2026-11-21 — owner consolidated decisions (final for this round)

The owner issued a consolidated decision record on 2026-11-21. It **authorizes documentation reconciliation
only**: no code, schema, migration, route, frontend, test or Phase 1B work, and no Git history rewrite. This
entry is the Phase 1 status record; the architecture decisions are recorded in the draft §20 and the
decision register.

- **WP5 — A2, NOT ACCEPTED.** Implementation is complete, but owner acceptance is pending a further review
  of the corrected console. Implementation completion, test completion, WP6 authorization and WP7
  authorization do **not** constitute acceptance. The five fixes remain completed corrections awaiting
  owner re-review. No acceptance may be inferred from "continue".
- **WP5 record — B1, correction authorized.** The inaccurate "accepted 2026-11-19" claim is qualified at
  its source (the 2026-11-19 entry above) and in the status board; the chronology is preserved and no
  commit was rewritten.
- **G4 — C1 / D1 / E1.** **Option 2 confirmed:** archival is blocked while the question is linked to an exam
  whose actual lifecycle status is `EXAM_STATUS.ACTIVE`, whether the exam is **summative or training**;
  `draft`/`archived` exams (including training exams), games and tournaments do **not** block; the guard is
  status-based, not the training flag. **Restore** reinstates the question but **never** automatically
  reactivates prior exam, game or other activity associations; reassociation is explicit. The **existing
  permission model is preserved** — teachers archive only questions they are authorized to manage; no new
  approval workflow and no head-of-department role. The final G4 wording is **adopted (E1)**; this closes
  U15's wording condition and authorizes **no code**.
- **D15 — F1, substantively approved.** The recommended default is accepted unchanged: immutable published
  official objectives; explicit per-class adoption; server-side import scope; audited governance setting.
  The register now records this substantive approval separately from the earlier wording-only acceptance.
- **G2/G3 — remain accepted** and are not reopened; the §20.3/§20.4 clauses stay as recorded.
- **U8 — closed** because D15 now has its substantive decision recorded in the register (not by a label
  change alone).
- **Document authority — I1.** The owner ratifies the hierarchy (register → frozen Phase 1 spec → progress
  log → draft → baseline index → ADR) with the owner-provenance safeguards recorded in
  [`docs/ARCHITECTURE-BASELINE.md`](./ARCHITECTURE-BASELINE.md) §2.1.
- **U6 — deferred**; **Phase 1B — not authorized** (J). A separate explicit owner authorization is
  required.
- **WP5 remains pending owner re-review and acceptance.**

### 2026-11-21 (latest) — WP5 REFACTOR — Adaptive Learning integrated into the existing Questions tab

- **Owner authorization (2026-11-21):** WP5-only implementation, refactoring the Learning Console
  architecture into the **existing Questions tab** (legacy admin app, `admin.html`) and the existing
  **Subjects tab** context. Phase 1B remains **not authorized**; no schema, migration, API-contract,
  permission or governance change was made; **WP5 remains implemented but not accepted** (A2 still
  stands — this refactor awaits owner re-review).
- **Mapping first (owner instruction §2):** recorded in
  [`docs/WP5-QUESTIONS-TAB-INTEGRATION.md`](./WP5-QUESTIONS-TAB-INTEGRATION.md) — existing Questions-tab
  structure, WP1–WP4 APIs, Learning-Console feature classification (Integrate / Relocate / Retain /
  Remove / Defer) and landing places.
- **New module [`questions-pedagogy.js`](../questions-pedagogy.js)** (legacy app, classic script,
  UMD-exported pure helpers for tests). When `learning.adaptive.enabled` is **off it draws nothing**
  (fails closed). When on, inside the existing Questions tab only:
  row badges (status + Bloom, from the server-cached `Question` columns), adaptive filters
  (status / Bloom / objective-or-unaligned) hooked into the existing `filterQuestions()` pipeline, a
  **collapsible optional “Learning alignment” section** in the existing `#questionFormModal`
  (objective + Bloom + optional competency; difficulty stays the existing separate field), a
  **per-question criteria editor** (full weighted set, weight-sum 1.00, mark-reviewed, clear-with-
  confirm), **bulk classification** in the existing bulk-selection toolbar, a **Learning coverage
  panel** (objective → associated-question counts, zero-coverage and unaligned highlighting,
  cross-links into the filters — labelled *associations, not mastery*), and a lazy per-question
  context block in the expanded row details. EN/FR/AR labels, RTL-aware.
- **Console disposition:** the teacher-facing classification workflow moved out of the SPA —
  `learning/questions.js`, `learning/bulk-classify.js` and `learning/pedagogy-editor.js` **removed**;
  the hub keeps the **administrative governance** surface (taxonomy, competencies, proposal queue,
  prerequisites, master switch) and no longer auto-redirects teachers into `#/learning`. Console
  bundle rebuilt (`public/console-bundle.js`, 307.5 kb).
- **Wiring:** `questions-management.js` gained five small hooks (row data attributes + badge/action
  slots, list-rendered hook, editor-opened hooks in both open paths, post-save alignment hook —
  alignment failures toast but never fail the question save). `admin.html` gained one script tag.
  `styles.css` gained a scoped `.qp-*` block. `src/backend/staticAssets.js` added
  `questions-pedagogy.js` to the static allow-list (required for `admin.html` to load it). **Backend
  routes/services/permissions/schema: zero changes** — every write reuses the WP1–WP4 endpoints.
- **AI assistance: deferred to Phase 6** (no suggestion service exists in Phase 1; building one would
  exceed WP5 scope) — recorded in the mapping document.
- **Verification:** `node --check` clean on every touched JS file; `npm run build:console` clean;
  **full suite 126 files / 1648 tests pass** (was 125 / 1630; +18 new unit tests in
  `tests/unit/questions-pedagogy.test.js` covering labels, the filter predicate, the coverage summary,
  single-criterion payloads, the client-side criteria checks and rubric round-trips). Backend
  integration tests (learning routes, console permissions, bulk drop-report) pass unchanged.
- **Browser walkthrough pending:** the local dev server could not be started in this session (tool
  authorization blocked execution); a ready-made harness (`public/tmp-wp5-harness.html`, disposable,
  loads the real module with stubbed APIs) is in place for screenshot verification once a server can
  run.
- **Still open:** owner re-review of the refactored WP5 (acceptance remains the owner's decision);
  AR/FR native review; live `prisma/dev.db` not migrated (unchanged); Phase 1B still unauthorized.

### 2026-11-21 (latest) — WP5 UI/UX REMEDIATION — owner-screenshot-driven redesign (authorized)

- **Authorization:** owner authorized a targeted UI/UX redesign of WP5 screens (two screenshot
  priorities: assessment-criteria modal, New-objective modal) plus directly related WP5 surfaces.
  Phase 1B, domain architecture, permissions, schema and scoring behavior unchanged.
- **Criteria modal redesigned** (`questions-pedagogy.js`, `styles.css`): modal narrowed 760→620px;
  plain-language status line (status chip + `statusExplain_*` sentence, `aria-live`) replaces the
  unexplained chip/meter pair; each criterion now leads with the learning objective, groups Bloom +
  competency beside it, and hides weight/key/max-score/rubric behind a native `<details>`
  (auto-opened when they carry values or when adding a second criterion); remove is a quiet icon
  button; add-criterion is a quiet full-width dashed button; footer is maintenance-left /
  decision-right with the live weight meter next to Save (new `weightOver` message for sums > 1.00).
  All `data-qp-crit-*` attributes, `criteriaProblem`, `toWireCriterion`, weight tolerance (± 0.001)
  and the PUT contract unchanged — visual only.
- **New-objective modal redesigned** (`forms.js`, `form.js`, `labels.js`, `console.css`): dropped
  `wide` (900→560px default); replaced the four-column auto-fit grid with three conceptual sections
  — Curriculum context (subject + parent), Learning outcome (statement as the primary 3-row
  textarea, description beneath), Organization (code + category, Bloom + order); sentence-case
  labels with normal spacing scoped to `.ac-form--objective`; responsive single-column ≤ 640px.
  Validation (required subject/code/statement, inline invalid state, focus-first-missing),
  provenance note, translations and the POST/PATCH payloads unchanged.
- **Bulk-classify dialog:** header subtitle now explains the action (`bulkSelected`, trilingual)
  instead of a bare number; inherits the narrower modal width.
- **Cache-busting:** `admin.html` bumps both assets to `?v=2026-11-21-wp5r5`. Earlier round (r4)
  fixed the mobile filter-bar defect (removed `collapsible-filter-controls`; bar stays visible
  ≤ 768px; objective select min-width reset at 320px).
- **Verification:** served assets confirmed over HTTP against the running server (admin.html
  references r5; served `styles.css` carries the new criteria layout; served
  `questions-pedagogy.js` carries the new markup; served `console-bundle.js` carries the new
  objective-form strings). `node --check` clean; module tests 23/23; **full suite 126 files /
  1653 tests pass**; console bundle rebuilt. Styled-stylesheet geometry verified in an isolated
  replica (bar flex row 72px, toggle single-line, picker absolutely positioned).
- **Browser walkthrough still pending:** authenticated page automation (login) remains blocked by
  the tool permission layer; screens await owner visual review after a hard refresh.
- **Still open:** WP5 remains IMPLEMENTED — AWAITING OWNER REVIEW (never accepted by agents);
  Phase 1B unauthorized; debug/harness files retained pending cleanup authorization.

### 2026-11-21 (latest) — Phase 1 documentation reconciliation — WP5 and WP7 ACCEPTED (owner)

- **Owner confirmation:** WP5 is **accepted** (the refactored teacher-facing experience in the existing
  Questions tab, including the authorized UI/UX remediation; the separate teacher Learning Console is no
  longer the accepted teacher workflow — it remains the admin governance surface) and **WP7 is accepted**.
  Phase 1 is ready for formal closure review subject to record reconciliation and safe preservation of the
  accepted deliverables. A2 ("implemented but not accepted") is **superseded and preserved as history**;
  the B1 correction discipline is unchanged. **Phase 1B remains NOT authorized**; no other work package,
  gate or decision is inferred accepted by this record.
- **Documentation-only reconciliation** (authorized for six documents plus a status-header pointer in the
  frozen spec): this header and status board; `PHASE1_COMPLETION_REPORT.md` (dated addendum);
  `ARCHITECTURE-BASELINE.md` (status header + open items); `DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`
  (§20.7 WP5 row note + boundary); `WP5-QUESTIONS-TAB-INTEGRATION.md` (status line);
  `OWNER-DECISION-REVIEW.md` (§9.3); `phase 01.md` (stale status header replaced by a pointer — spec body
  untouched).
- **Live database record (provenance + limitation):** migration `20261119000000_learning_taxonomy` was
  **applied by the owner on 2026-11-21** to the live `prisma/dev.db` (reported in-session at the time:
  23 migrations, learning tables live, Bloom seed present, `learning.adaptive.enabled` set to `true` for
  school `local`). **No fresh database verification was performed in the final audit** (database access
  refused by the tool permission layer); this record relies on that previously verified in-session
  evidence only. No migrations were run and no database was altered during reconciliation.
- **Commit not yet authorized.** A categorized snapshot proposal (proposed manifest, exclusions, proposed
  commit message) was prepared for owner review; nothing was staged or committed.

---

## How to append an entry

Add a new dated section under *Progress log* when a work package finishes (or when a finding changes
the plan), and update the matching row of the *Status board* in the same commit. Keep the spec
(`docs/phase 01.md`) unchanged unless the owner approves a scope change; record approved scope changes
in the log first, with the date and the owner's decision.

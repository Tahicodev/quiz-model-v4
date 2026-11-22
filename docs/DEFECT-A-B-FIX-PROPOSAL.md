# Defect A / Defect B — Minimal Isolated Change Proposal

> **STATUS UPDATE (2026-11-21) — SUPERSEDED as a status record; RETAINED as rationale/history.**
> This proposal was subsequently **authorized in two separate, defect-scoped authorizations, implemented,
> verified and CLOSED** on `feature/adaptive-learning-phase1` (see
> `docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` §20.1 and `docs/PHASE1_PROGRESS.md` 2026-11-21). The
> "PROPOSAL — NOT AUTHORIZED" status below was accurate **as of 2026-11-20** and is preserved for
> traceability. Defect B kept the targeted graph optimization **B2 deferred** and removed the unused
> `#schoolObjectives` loader (**B4**, confirmed unused). **Defects C/D/E/F remain in the Phase 1B scope**
> and are unchanged. This document is no longer the current status of A/B.

**Status (as of 2026-11-20): PROPOSAL — NOT AUTHORIZED.**

**Date:** 2026-11-20 · **Scope:** proposal only. This document authorized **nothing** at the time it was
written. It contains no code change, no schema change, no migration, and no test change. It exists because
the owner's initial approval (`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` §19.5) records:

> **Defect A** and **Defect B** — **NOT YET AUTHORIZED FOR IMPLEMENTATION.** First provide a minimal
> isolated change proposal with files, root cause, scope, and tests.

Everything below is a proposal to be approved, amended or rejected. Defects **C/D/E/F** stay inside the
originally proposed Phase 1B scope (§13.1A) and are **not** part of this proposal.

---

## 0. Summary

| | Defect A | Defect B |
|---|---|---|
| Nature | Data-integrity defect **live today** | Latent correctness defect (**silent truncation**) |
| Trigger | Any `setCriteria` call whose mid-write fails | Any school with **> 1,000** objectives / competencies / prerequisites |
| Today's effect | A question can be left with **zero criteria** (the delete ran, no create did) — the classification is silently destroyed and the derived caches may still describe the old set | Validation and label maps are computed from an **incomplete** set; a prerequisite **cycle can be missed entirely**; competence labels vanish |
| Owner disposition | Independent of the programme design; **standalone fix candidate** | Phase 1B hardening, **before** bulk tagging / import / coverage |
| Proposed change size | **One new repository primitive + one service method refactor** | **Loader paging (or targeted queries) + one loud guard** |
| Backward compatibility | Behaviour-preserving; no schema change | Behaviour-preserving; no schema change |
| Migration needed | **None** | **None** |

Both fixes are **additive and reversible**: no table is created or altered, no data is rewritten, and
each change is confined to one file plus its test.

---

## 1. Defect A — `setCriteria` delete-then-create is not transactional

### 1.1 Symptom

`QuestionPedagogyService.setCriteria` claims (in its own comment, line 191) that *"a failure mid-write
cannot leave a half-validated set behind."* It can. The method performs, in order and **without a
transaction**:

```
#loadQuestion → #assertCanEdit → #buildValidationContext → validateCriteriaSet
→ #deleteAllCriteria(...)            // DELETE every existing criterion row
→ for (const row of rows) create(...)  // INSERT the new rows, one HTTP/DB round-trip each
→ #applyDerivedFields(...)           // UPDATE the Question caches
→ #audit(...)                        // audit row
```

A process crash, a connection drop, a Prisma error or a thrown `create` **between the delete and the
last insert** leaves the question with **fewer criteria than before — possibly zero** — while the
`Question.pedagogy_status` / `primary_bloom_dimension_id` caches still describe the *old* set (they are
only recomputed at step 4, which never runs). The teacher sees a question that is `classified` but has
no criteria; coverage and Bloom reporting read a false state.

### 1.2 Root cause (evidence)

| # | Root cause | Evidence |
|---|---|---|
| A-1 | The replace is a **bare sequence of awaits**, not one unit of work | `src/backend/services/learning/QuestionPedagogyService.js:193-203` |
| A-2 | **No transaction primitive exists anywhere** to wrap it | `grep -rn '$transaction\|withTransaction' src/ prisma/` → no match (only a comment in `src/frontend/services/CourseService.js:139`) |
| A-3 | A **second, independent truncation** sits inside the same path: `#deleteAllCriteria` reads at most **200** rows | `QuestionPedagogyService.js:253-261` (`limit: 200`) — with > 200 existing rows the delete is itself partial |
| A-4 | `#clearCriteria` (the empty-list path) is the **same non-atomic delete-then-update** | `QuestionPedagogyService.js:228-238` |
| A-5 | The repository's write surface (`create`, `update`, `delete`, `createMany`) exposes **no transactional form**; the Prisma client is a **private** field, so no service can reach `$transaction` | `src/backend/infrastructure/PrismaRepository.js:133-160, 220-260` (`#prisma` is `#`-private; `modelFor` returns a *non-transactional* delegate) |

### 1.3 Blast radius

- **Every** `setCriteria` / `addCriterion` / `removeCriterion` / `clearCriteria` call
  (`QuestionPedagogyService.js:159-238`), which the pedagogy routes call.
- The whole Phase 1B **confirmation workflow** depends on this fix: the round-6 review makes an atomic
  `confirmCriterion`/`rejectCriterion` (including its audit row) a **precondition**, and §2/§3 of the
  draft state the same transaction must carry the *subject check → replace → caches → audit*
  (`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md:1316, 1329-1331, 1485, 2333-2334`).
- Because `QuestionAssessmentCriterion.id` is `@default(uuid())`, a replacement is a **new identity**
  (draft §13.2 row for `QuestionAssessmentCriterion`): a half-applied replace therefore also breaks the
  round-8 append-only `CriterionReviewEvent` lineage unless it is atomic.

### 1.4 Minimal change options

**Option A1 — one generic transaction primitive + wrap the existing sequence (recommended).**

1. Add **one** method to `PrismaRepository`:

   ```js
   /** Run `fn` inside one DB transaction, handing it a repository bound to the tx client. */
   async runInTransaction(fn) {
     return this.#prisma.$transaction((tx) => fn(new PrismaRepository(tx)));
   }
   ```

   This works because every other repository method touches the database **only** through
   `this.#prisma[name]`; a Prisma **transaction client** exposes the same delegates with the same
   `findMany`/`create`/`update`/`delete`/`count` API, so `new PrismaRepository(tx)` is a drop-in
   tx-scoped repository. Prisma supports **interactive transactions on SQLite** (the project's DB).
2. Refactor the write helpers to accept an optional repository, defaulting to `this.#repo`:
   `#deleteAllCriteria(schoolId, questionId, repo = this.#repo)`,
   `#applyDerivedFields(question, rows, { …, repo = this.#repo })`, and the `create` loop. No public
   signature changes.
3. Wrap the mutation in `setCriteria` (and `#clearCriteria`):

   ```js
   const run = this.#repo.runInTransaction?.bind(this.#repo);
   const mutate = async (repo) => {
     await this.#deleteAllCriteria(user.school_id, questionId, repo);
     for (const row of rows) await repo.create('question_assessment_criteria', row);
     return this.#applyDerivedFields(question, rows, { markReviewed, userId: user.id, repo });
   };
   const updated = run ? await run(mutate) : await mutate(this.#repo);
   ```

   The `?.`/fallback keeps the **shared** service working against `ApiRepository` (the frontend
   repository performs the *whole* replace in one HTTP request; the atomicity is the server's job), so
   no frontend change is required.
4. Keep the audit call **after** the transaction for the minimal fix. **Sub-option A1b** (deferred):
   move the audit row *inside* the transaction so a state change can never exist without its audit
   record — required by the round-6 review for the **confirmation** actions specifically, and noted here
   as a follow-up, not part of the minimal fix.

**Option A2 — insert-new-then-delete-old.** *Rejected.* The round-2 review already ruled the
**transaction** the requirement (draft §13.1A Defect-A row); the tolerance-based weight rule
(`WEIGHT_TOLERANCE = 0.001`, `pedagogy-validator.js:17`) and the unique index
`@@unique([question_id, objective_id, bloom_dimension_id, criterion_key])` make a transient overlap
either a constraint violation or a silent partial state, and it cannot cover `#clearCriteria`.

**Option A3 — `createMany` + one `deleteMany`.** Would reduce round-trips but **does not** make the
sequence atomic, and `PrismaRepository` exposes no `deleteMany`; it needs the same transaction wrapper
anyway. Not a substitute for A1.

### 1.5 Files the A-fix touches

| File | Change |
|---|---|
| `src/backend/infrastructure/PrismaRepository.js` | **+** `runInTransaction(fn)` (one method) |
| `src/backend/services/learning/QuestionPedagogyService.js` | thread an optional `repo` through `#deleteAllCriteria` / `#applyDerivedFields`; wrap `setCriteria` and `#clearCriteria`; also raise `#deleteAllCriteria`'s `limit: 200` (see A-3) |
| `tests/…` | the two test layers in §1.6 |

No route, no schema, no migration, no frontend file.

### 1.6 Tests (A)

1. **Primitive rollback (integration, real DB):** open `repo.runInTransaction`, create an
   `audit_logs` row inside it, then `throw`; assert the row is **absent** afterwards, and that a
   committed run leaves it present.
2. **Service atomicity (integration):** with a question holding a known criteria set, drive
   `setCriteria` with a wrapper repository whose `runInTransaction` hands the callback a tx repository
   that **throws on the Nth insert** (a thin proxy over the real tx repo) — then assert the question's
   **original criteria are intact** and `pedagogy_status`/`primary_bloom_dimension_id` are unchanged.
   (Because the inner repo is the real one, this exercises genuine Prisma rollback, not a mock.)
3. **Happy path unchanged:** the existing criteria-CRUD assertions in
   `tests/integration/learning.routes.test.js` (section 5 of its header) must still pass — the refactor
   is behaviour-preserving.
4. **`clearCriteria` atomicity:** the same failing-wrapper test for the empty-list path.
5. **> 200 existing criteria (A-3):** a question with 201+ criteria replaces correctly in one call.

### 1.7 Out of scope for A

- **A1b** (audit inside the transaction) — follow-up, paired with the confirmation workflow.
- `recompute` (`QuestionPedagogyService.js:244-251`) — read-then-write, but it writes **one** `Question`
  update; it is not a multi-row replace and is left as-is.
- Any change to `ApiRepository` or the frontend.

### 1.8 Risk / rollback (A)

**Risk:** low. `runInTransaction` is new and unused elsewhere; the service refactor only adds an
optional parameter with the current value as default. **Rollback:** revert the two files; no data or
schema state to undo. **Performance:** one extra `BEGIN`/`COMMIT` per replace; SQLite interactive
transactions have a 5 s default timeout, far above this workload.

---

## 2. Defect B — school-wide loaders silently truncate at 1,000

### 2.1 Symptom

Several "load the whole school's rows, then validate/label against them" helpers fetch **one page** of
`SCHOOL_WIDE_LIMIT = 1000` rows and treat it as the complete set. Past 1,000 rows the set is
**silently incomplete**: no error, no warning. The two consequences that matter:

- **A prerequisite cycle can be missed.** `addPrerequisite` builds the school's edge list, then calls
  `findCycle(edges, from, to)`. If the edge that closes the cycle lies **beyond row 1,000**, the list
  does not contain it, `findCycle` returns `null`, and the cyclic edge is **written** — the graph
  becomes invalid.
- **Competency labels disappear.** `listObjectiveCompetencies` maps each link's `code`/`name` from the
  school competency map; beyond 1,000 competencies the labels become `null`, so the UI shows blank
  competencies for perfectly valid links.

### 2.2 Root cause (evidence)

| # | Root cause | Evidence |
|---|---|---|
| B-1 | `SCHOOL_WIDE_LIMIT = 1000` is used as a **complete-set** bound, not a page size | `src/backend/services/learning/LearningTaxonomyService.js:55` |
| B-2 | `#schoolPrerequisites` loads one capped page; its caller relies on it being **every** edge | `LearningTaxonomyService.js:199-205`; consumer `addPrerequisite` `:703-735` (`findCycle` at `:715-716`) |
| B-3 | `#schoolCompetencies` loads one capped page; consumers use it as the label source of truth | `LearningTaxonomyService.js:191-197`; consumers `listObjectiveCompetencies` `:616-625` and `linkCompetency` `:641-649` |
| B-4 | `#schoolObjectives` is **dead code** (no call site) — remove it or fix it, but it must not be left as a trap | `LearningTaxonomyService.js:183-189`; `grep` finds no caller |
| B-5 | The same 1,000 cap silently truncates the **display-only** label maps in the pedagogy read path | `QuestionPedagogyService.js:117-131` (`#objectiveLabels`, `#competencyLabels`) |
| B-6 | The repository **already supports paging** (`take`/`skip` + a `total` count), so a correct loader is a small change, not a new capability | `PrismaRepository.js:162-218` — `getAll` returns `{ data, total }` with `skip: safeOffset, take: safeLimit` |

### 2.3 Blast radius

- Prerequisite validation for **any school with > 1,000 prerequisite rows** (B-2).
- Competency labels and link validation for **any school with > 1,000 competencies** (B-3) — note the
  `Competency` unique key is school-wide (`@@unique([school_id, code])`), so a large multi-subject
  school is the realistic case.
- The future Phase 1B **bulk tagging / import / coverage** features enumerate objectives and would
  inherit the same silent cut (draft §13.1A Defect-B row).
- Defect B is a **precondition** for trusting coverage: the design states the loaders "must not
  silently truncate" (`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md:1487, 1496`).

### 2.4 Minimal change options

**Option B1 — page the loaders to completion (recommended for the callers that genuinely need the whole
set).** Add one small helper that loops `getAll({ …limit: SCHOOL_WIDE_LIMIT, offset })` until
`offset + data.length >= total` (or `data.length === 0`), then use it in `#schoolPrerequisites` (where
completeness is a **correctness** requirement for `findCycle`) and in `#schoolCompetencies` /
`QuestionPedagogyService.#competencyLabels` (where completeness is a **display/label correctness**
requirement).

**Option B2 — replace map-based validation with targeted queries (recommended for validation
specifically).** For `findCycle`, the graph walk only needs the edges reachable from the two nodes
involved. A targeted recursive/iterative query (or repeated `getAll` filtered by
`objective_id`/`prerequisite_objective_id` of the frontier) returns the *relevant* subgraph and is both
correct and cheaper than loading 1,000+ edges on every write. This is the more faithful fix for
`addPrerequisite`; B1 is the simpler whole-set fix.

**Option B3 — a loud guard.** Independently of B1/B2, have the loader **assert** that it received the
whole set — e.g. if `data.length >= SCHOOL_WIDE_LIMIT` and `total > data.length`, either **page on** or
**throw a clear diagnostic** (never return a silently truncated set). This converts a silent defect
into a visible one and is the minimum acceptable change even if paging is scheduled later.

**Option B4 — remove the dead `#schoolObjectives` (B-4).** Trivial cleanup; keeps the "fix the loader"
story honest.

Recommended combination: **B3 (guard, always) + B2 for `addPrerequisite` + B1 for the label maps**, with
B4 as cleanup.

### 2.5 Files the B-fix touches

| File | Change |
|---|---|
| `src/backend/services/learning/LearningTaxonomyService.js` | page/guard `#schoolPrerequisites`; page/guard `#schoolCompetencies`; targeted cycle query in `addPrerequisite`; delete dead `#schoolObjectives` |
| `src/backend/services/learning/QuestionPedagogyService.js` | page/guard `#objectiveLabels`, `#competencyLabels` (display path) |
| `tests/…` | the tests in §2.6 |

No route, no schema, no migration, no frontend file.

### 2.6 Tests (B)

1. **Cycle beyond 1,000 (integration):** seed **1,001** prerequisite edges whose closing edge lands
   *after* row 1,000, attempt to add it, and assert it is **rejected** (today it is accepted).
2. **> 1,000 competency labels:** create 1,001 competencies, link one objective to a competency past the
   cut, and assert `listObjectiveCompetencies` returns its `code`/`name` (not `null`).
3. **Loud guard:** with a repository stubbed to return `data.length === limit` and `total > limit`,
   assert the loader **pages on** (or throws the named diagnostic) rather than returning a partial set.
4. **Small-school regression:** the existing prerequisite-cycle and competency-link tests (e.g.
   `tests/unit/competency-link-validator.test.js`, and the learning route suite) stay green.
5. **Perf sanity:** one `addPrerequisite` on a 1,000-edge graph completes well inside the write
   budget (documents the paging cost; no strict throughput target).

### 2.7 Out of scope for B

- **Defect C** (competency-hierarchy cycle walk) and **Defect D** (prerequisite depth not enforced on
  write) — both live in the same file but are **Phase 1B**, bundled with the competency/prerequisite
  model revision per §13.1A, so the same code is not rewritten twice.
- Any new index or schema change (none is needed; the tables already carry the lookup columns).

### 2.8 Risk / rollback (B)

**Risk:** low–moderate. Paging changes the number of queries per write for large schools (more reads,
still bounded); the guard can, if mis-tuned, throw on a legitimate exactly-1,000-row school — the guard
must compare `total` to the fetched count, not just test `length === limit`. **Rollback:** revert the
two files; no data or schema state to undo.

---

## 3. Interaction between A and B, and with Phase 1B

- **Independent:** A is a single-question write path; B is school-wide read/validation paths. They can
  be fixed, tested and shipped **separately**; neither blocks the other.
- **A is the precondition of the confirmation workflow.** The round-6 review requires
  `confirmCriterion`/`rejectCriterion` to be atomic **including their audit row** (draft §13.1A,
  `:1485`). A1 delivers the transaction primitive that the confirmation workflow then reuses; **A1b**
  (audit inside the transaction) should be folded into that workflow rather than done twice.
- **B is the precondition of bulk tagging / import / coverage.** Those features enumerate objectives;
  shipping them before B means shipping a known silent truncation.
- **Neither A nor B requires the new programme tables** (P1–P12), the `Programme`/`Provenance` model,
  the `CriterionReviewEvent` stream, or any decision still open (U6, U8's D15 wording, G4). Both fixes
  are meaningful on **today's** schema.

---

## 4. Effort estimate (indicative, for the owner's sequencing only)

| Item | Change | Tests | Notes |
|---|---|---|---|
| A (A1 + A-3 + A1 tests) | ~2 files, ~30–50 lines | 4–5 cases | one new repository method |
| B (B2/B1/B3/B4 + tests) | ~2 files, ~40–80 lines | 4–5 cases | no schema change |
| A1b (audit in tx) | folded into the confirmation workflow | — | not standalone |

---

## 5. What this proposal does **not** do

- It **authorizes no implementation**, no schema change, no migration, no data rewrite, no feature
  flag, no merge and no push.
- It does **not** touch Defects C/D/E/F (they remain Phase 1B scope per §13.1A).
- It does **not** depend on, or decide, any open owner question (U6; U8's D15 wording; G4's archival
  lifecycle).
- It is **not** an ADR and does not move ADR-0001 from **Proposed**.

---

## 6. Questions for the owner (to authorize, amend or reject)

1. **A — approve Option A1** (one `runInTransaction` primitive + wrap `setCriteria`/`#clearCriteria` and
   fix the `limit: 200` delete), with A1b deferred to the confirmation workflow? Or require A1b now?
2. **A — test technique:** may the service-atomicity test use the *real* tx repository behind a thin
   failing proxy (genuine Prisma rollback), rather than a mock?
3. **B — approve B3 (loud guard) unconditionally, and choose B1 (page whole set) vs B2 (targeted cycle
   query)** for `addPrerequisite`, plus B1 for the label maps? Or B1 everywhere for uniformity?
4. **B — is deleting the dead `#schoolObjectives` in scope**, or should it be left until the Phase 1B
   taxonomy revision?
5. **Sequencing:** should A ship **alone** first (it is the only live integrity risk), with B bundled
   into the Phase 1B hardening pass — or both together?

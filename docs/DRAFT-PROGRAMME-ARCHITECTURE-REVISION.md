# DRAFT — Adaptive Learning Foundation Revision

**Status: DRAFT — OWNER DISPOSITIONS RECORDED AND FINALIZED (§19–§20); IMPLEMENTATION NOT AUTHORIZED.** The
owner's initial 2026-11-20 decisions are recorded in **§19** (U6 deferred; U8 and U15 approved **in
principle**). The 2026-11-21 consolidated decisions are recorded in **§20**: **G2/G3 accepted**, **G4 owner
choices confirmed and final wording adopted (C1/D1/E1)**, **D15 substantively approved (F1)**, and **U8
closed**. These decisions choose the architecture; they **authorize no Phase 1B implementation** — no code,
schema, migration, service, route, frontend or test change. Defect A/B were separately authorized and closed
(§20.1); that does not authorize Phase 1B. Everything in this file other than the recorded owner
dispositions remains a proposal. Items marked *Recommended default* are suggestions only.

> **Document-control note (2026-11-21):** Sections §13–§18 retain the status snapshots and proposals as
> they stood when those review rounds were written. Where they conflict with later dispositions, §§19–§20
> and `docs/PHASE0_DECISION_REGISTER.md` contain the reconciled current status; historical entries are
> retained for traceability, not as current approval state.

**Initial draft date:** 2026-11-20 · **Revision:** 3.5 (round-1 review incorporated as P10/P11/§13.1A/§15;
round-2 as §16; **rounds 3–8** corrections as **§17**) · **Owner-status updates:** 2026-11-21 (§19–§20)
· **Author:** agent, on owner request · **Document relationship:** this remains a draft revision alongside
`docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` and `docs/ADR-0001-ADAPTIVE-LEARNING-FOUNDATION.md`; no formal
baseline supersession has been adopted.

**How this document labels its contents** (required by the round-2 review):

- **Accepted owner requirements** — decisions (a)–(h) in §1, treated as inputs, not reopened.
- **Recommended architecture** — the proposals P1–P12, each with options, trade-offs and a default.
- **Owner decisions** — §12 and the consolidated list in §16.4 (the *pre-decision* record), answered
  across **§19–§20**: twelve approved outright, **U8** approved in principle and now **closed**, **U15**
  approved in principle with its G4 wording condition now **satisfied**, **U6** deferred; G2/G3 accepted,
  G4 owner choices confirmed and final wording **adopted (E1)**, and D15 **substantively approved (F1)**.
- **Implementation requirements for a future approved phase** — the "Phase 1 code and tests that
  change" blocks, the Phase 2 forward contract (P10/P12) and §16.3 (test acceptance matrix).

---

## 0. What this document is, and what it is not

This is an architecture and design revision for the adaptive-learning foundation: programme
architecture, objective governance, the teacher workflow, and curriculum coverage. It contains
proposals with options, trade-offs, a recommended default, an effort estimate and the Phase 1 code
and tests each proposal would change.

It is **not** an implementation, an approved baseline, or a comprehensive decision record. Owner decisions
recorded later in §§19–§20 are dispositions; their status is summarized at the top of this document and in
`docs/PHASE0_DECISION_REGISTER.md`. All architecture beyond those recorded dispositions remains proposed,
and no Phase 1B implementation is authorized.

### 0.1 The 13-point list — received and answered

The instruction first arrived with the literal placeholder `[your 13 points here, unchanged]`. The
owner supplied the real 13 points on 2026-11-20. They are answered one by one in **§13**, with the
audit they ask for in §13.1–§13.2.

### 0.2 Sequencing

1. **WP7 (docs + flags completion report)** — done first, as instructed; see
   `docs/PHASE1_COMPLETION_REPORT.md`.
2. **This draft** — review only. No implementation until the owner approves specific items. It has had
   three review rounds: round 1 added P10/P11/§13.1A/§15; round 2 is incorporated in **§16**; round 3 —
   the reviewer's "final validation" pass — corrected the coverage contradiction, the provisional-criterion
   wording, the reference chains, the Phase 2 evidence snapshot, the P12 concurrency rule and the test
   matrix, and those corrections are applied **in place** in §5A, §5B, §6, §10A and §16.3, with the
   rationale recorded in **§17**.
3. **Implementation** — only after owner approval, and only for the approved items.

Nothing here authorizes WP7-scope creep, Phase 2, merge or push.

### 0.3 What was inspected

| Area | File(s) / evidence |
|---|---|
| Learning taxonomy models | `prisma/schema.prisma` — `BloomDimension` 1156, `LearningObjective` 1179, `Competency` 1218, `LearningObjectiveCompetency` 1245, `LearningPrerequisite` 1264, `QuestionAssessmentCriterion` 1286 |
| Class / Subject / Category / Course | `prisma/schema.prisma` — `Class` 173 (name + description only; no subject, level or track; **no academic-year column**; unique `(school_id, name)`), `Category` 194, `Subject` 225, `Course` 362 (`subject_id`, `status`, `document_header` JSON that informally holds "level"). The academic year lives on `School.school_year` (30) and in `SchoolArchive` per `(school_id, year)` (86) — a class is **not** year-scoped (drives P12's class-identity rule, §5B) |
| Criteria + review metadata | `QuestionAssessmentCriterion` 1286 — `source` ∈ `manual\|imported` (default `manual`), `review_status` ∈ `approved\|needs_review` (default `approved`), and **no `reviewed_by`/`reviewed_at`**; reviewer columns exist only on `Question` (`pedagogy_reviewed_by/at`, caches) and `LearningObjective` (`reviewed_by/at`, admin approver) |
| Teacher binding | `prisma/schema.prisma` — `TeacherAssignment` 927 (class_id, teacher_id, title — no subject/level/track) |
| Exam / Result | `prisma/schema.prisma` — `Exam` 288 (`is_training`, no `is_high_stakes`, no `subject_id`), `Result` 502, `ExamSession` 478 |
| Objective governance today | `src/backend/services/learning/LearningTaxonomyService.js` — `createObjective` 280-300, `updateObjective` 303+, `approveObjective` 355+, `rejectObjective` 370+, `isTeacherCreationEnabled` 124-131, `isAdaptiveEnabled` 151-159 |
| Criteria + derived caches | `src/backend/services/learning/QuestionPedagogyService.js`, `src/shared/learning/pedagogy-validator.js` (weights sum to 1 ±0.001; `pedagogy_status`) |
| Routes + permissions | `src/backend/routes/learning.routes.js`, `src/shared/permissions.js` (`class.learning.read/classify`, `school.learning.read/manage`), `src/shared/schemas/learning.schema.js` |
| Settings mechanism | `prisma/schema.prisma` `Setting` 664 (free-form key + visibility tier, `@@unique([school_id, key])`), `src/backend/routes/settings.routes.js`, `src/frontend/services/SettingsService.js` (tier enforced per row; no key whitelist) |
| Feature flags | `src/frontend/console/pages/learning/flags.js`, `src/frontend/console/main.js:43` |
| Backup / restore | `src/backend/routes/bulk.routes.js` — learning sanitizers 1146/1239, required fields 1331/1335; `SNAPSHOT_TABLES` 116 |
| Offline delivery | `scripts/make-offline-package.mjs` (ships `prisma/migrations/` + `schema.prisma`), `scripts/generate-offline-bundle.mjs` (vendored npm + Prisma engines) |
| Console learning UI | `src/frontend/console/pages/learning/*` (taxonomy, pedagogy editor, proposals) |

**No `Programme` concept exists anywhere** in schema, backend or UI. The only occurrences of the word
"programme" in the repository are exam-document masthead strings (`src/backend/services/exam-doc/*`),
unrelated to curriculum.

### 0.4 Assumptions made (challenge these)

1. "Admin" in the decisions means the school administrator (`school.learning.manage`), not a platform
   operator.
2. `level` and `track` are organisational labels the school already uses informally (they exist only
   inside `Course.document_header` JSON today), and they are strings, not a fixed catalogue.
3. "Official programme" content is school-scoped; cross-school sharing is out of scope for now.
4. Existing Phase 1 rows (`LearningObjective`, criteria) must keep working unchanged after the change.
5. All new tables and fields are additive; no existing column is renamed, retyped or removed. One
   **constraint** change is proposed and flagged where it occurs: P10 replaces the
   `(school_id, subject_id, code)` unique index on `LearningObjective` (§5A) — an index swap, not a data
   change, proven loss-free by the migration test (T23).
6. Offline installs receive schema through `prisma/migrations/` shipped in the offline package, so a
   new migration reaches them with the next package, not over the network.
7. Evidence and mastery remain out of Phase 1 entirely; nothing below introduces them.

---

### 0.5 Review status

- **2026-11-20 — architectural review received.** The owner's reviewer approved the *proposals* for
  architectural review (programme architecture, versioning, official/local governance, class
  relationships, import/export, teacher workflow, offline compatibility, coverage model, migration
  proposal, decision traceability) and **explicitly did not authorize** schema changes, migrations,
  criteria migration, bulk tagging, programme import implementation, coverage implementation, Phase 2
  evidence ingestion, mastery, or AI. Implementation stays frozen.
- The reviewer's directives are incorporated below: defect **disposition** (§13.1A), the objective
  identity/version semantics as a mandatory pre-Phase-2 decision (**P10**, §5A), the tagging
  safeguard plus mapping provenance (**P11**, §10A), and the roadmap naming (§13.11). The final
  consolidated review answering the reviewer's 13 verification questions is §15.
- **2026-11-20 — round-2 architectural review received.** The reviewer endorsed the architecture
  *subject to* the round-2 corrections, and restated the governing principle: the programme version a
  class follows, the objective version a question references, and the context in which a student did an
  activity must all be **historically traceable**, because coverage, evidence, mastery, profiles and
  pathways are all built on that foundation. The round-2 corrections are accepted into this draft as
  **§16** and are applied to the affected proposals: programme identity/versioning (A → P1, P2),
  historized class assignment (B → **new P12**), local objective ownership (C → P4), provenance vs
  review state (D → P11), conservative migration (E → P10, P6), coverage under supersession (F → P5),
  documentation completeness (G → §14), integrity reinforcements (H → §13.1A). The owner's reviewer will
  do a final validation of the consolidated document before any implementation. Status remains
  **DRAFT — AWAITING OWNER APPROVAL**.
- **2026-11-20 — round-3 "final validation" received.** The reviewer **accepted the architecture
  direction** and the P10-A / P12-A / P11-A options (and asked that they not be reopened), then
  **withheld approval** pending the corrections now applied and recorded in **§17**: the T8/T10 coverage
  contradiction, the "a suggestion is never a criterion" wording, the ambiguous question→programme
  reference chain, the Phase 2 evidence snapshot contract, the P12 concurrency guarantee, the added
  tests **T27–T34**, the clarifications to T7/T14/T19/T23/T26, and the exact objective-code uniqueness
  and criterion-review-metadata specifications. The reviewer's stated next reading is the complete
  revised **§6 (P5)** — "coverage is where objective versioning, programme membership, mapping
  reliability and class assignment history all meet". Status at that review point: **DRAFT — AWAITING
  OWNER APPROVAL**; **U1–U12 were unresolved** until the later owner dispositions in §19–§20.
- **2026-11-20 — round-4 (owner-requested, scope-limited) correction.** Six items: publication-time
  eligibility for programme membership; the real semantics of the existing `approved` value before
  migrating it; distinct-objective counting and the complete question-eligibility predicate; independent
  parent/child counting; tests T35–T38; keeping **U10 unresolved**. Applied in place — see
  **§17.7–§17.9**. Two verification findings changed the draft materially: `approved` is a **derived
  default**, never a review event (so `approved → confirmed` is **withdrawn**, replaced by
  `→ unreviewed`, and historical reliability starts at zero — new decision **U12**), and `Question` has
  **no** archive state (so "archived questions do not count" was wrong as written).
- **2026-11-20 — round-5 review of §6 received.** The reviewer **accepted P5 conceptually** ("I would not
  redesign it") with two precision/integrity corrections, now applied and recorded in **§17.10–§17.12**:
  (1) the coverage predicate must enforce **subject consistency**, as a **backend guarantee** and not only
  as a query assumption; (2) §10A must define the **criterion-level confirmation operation and its audit
  fields** explicitly, with **no** automatic confirmation from the question-level review stamp. One
  verification finding matters: **`Question` has no `subject_id`** (its subject is only reachable through
  the nullable `Category.subject_id`), and the current validator never checks the question's subject — so
  the invariant does **not** exist today and must be added (new decision **U13**). Status remains
  **DRAFT — AWAITING OWNER APPROVAL**; **U1–U13 stay unresolved**.
- **2026-11-20 — round-6 review of §6 received.** Both round-5 corrections **accepted**; the reviewer
  added one historical-integrity issue and two atomicity requirements, now applied and recorded in
  **§17.13–§17.15**: (1) a category's **`subject_id` is mutable** today, so live subject resolution can
  change a coverage result without the criterion changing — a **policy is now defined** (immutability
  guard on in-use categories + a **confirmation-time subject snapshot**), with the choice left as new
  decision **U14**; (2) **confirmation/rejection and their audit rows must be atomic**; (3) **criterion
  replacement must be transactional** and replacements start `unreviewed`. Tests **T42–T46** added. Status
  remains **DRAFT — AWAITING OWNER APPROVAL**; **U1–U14 stay unresolved**.
- **2026-11-20 — round-7 review of §6 received.** The reviewer **accepted all round-6 items** but asked for
  three additions before U14 can be accepted, now applied and recorded in **§17.16–§17.18**: (1) the
  in-use guard must cover the **whole resolved-subject relationship**, not one column — all **five**
  mutation paths (category `subject_id`, question re-parenting, subject deletion, category deletion,
  import/bulk/restore) — enforced on every service path with a verifier for out-of-band changes; (2)
  **current coverage and historical coverage must be distinguished**, which needs an append-only
  **`CriterionReviewEvent`** review history, because a subject snapshot alone cannot stop a later
  **demotion** from rewriting a past report; (3) **subject identity must survive deletion of the live
  `Subject`** — recommended: **archive subjects** (needs an additive `Subject.status`) plus a
  **non-referential** identity snapshot, never `onDelete: SetNull`. Tests **T47–T51** added; new decision
  **U15**. Status remains **DRAFT — AWAITING OWNER APPROVAL**; **U1–U15 stay unresolved**.
- **2026-11-20 — round-8 review of the historical model received.** Round 7 accepted; three clarifications
  requested and applied (§17.19–§17.21): the **`CriterionReviewEvent` now preserves the complete mapping
  identity** (criterion id, question id, exact objective-version id + `objective_key`, Bloom/competency/
  key/max-score, non-referential subject snapshot, provenance, weight before/after, before→after state,
  actor, time, `event_seq`) with **plain or `Restrict` references only — never `Cascade`/`SetNull`**; the
  hard-delete protection now covers **any question that ever contributed a confirmed mapping** (not only
  currently confirmed criteria); and the **historical reconstruction algorithm** is explicit (latest event
  with `at ≤ D`, genesis events so no criterion history is ambiguous, `replaced` events, archived
  questions resolved as of D, and the four worked cases). Subject-archival guarantees (identity preserved,
  nothing deleted, historical coverage unchanged, publication against an archived subject blocked) were
  added. Tests **T52–T55** added. **U1–U15 stay unresolved**; U14/U15 remain open.

---

## 1. Owner decisions treated as inputs (not open questions)

| # | Input |
|---|---|
| a | Each class follows exactly one programme per subject; parallel tracks are separate classes; no student-level programme enrolment. |
| b | Several programmes exist in parallel at the same level. Programme is a table. One official objective can belong to several programmes. |
| c | Professors teaching the same subject, level and track share one official programme; duplicate detection steers a second importer to reuse it. |
| d | Professors import programmes; the admin verifies with one click, or a school setting lets professors publish directly (audited). |
| e | Official objectives are never edited in place; changes arrive as a new version; a new version never moves classes automatically. |
| f | Professors freely add local sub-objectives and extensions under official parents, and optionally a personal local programme that never counts as official. |
| g | There is no head-of-department role, and none is added. |
| h | Coverage counts only published official objectives. |

These constrain the proposals below; they do not pre-approve the mechanism chosen to satisfy them.

---

## 2. Proposal P1 — Programme as a first-class, versioned, subject-bound table

**Goal:** satisfy (a) (b) (c). Introduce `Programme` + the two junctions needed, without touching
question/exam/game behaviour.

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P1-A (recommended)** | `Programme` table with a **stable `programme_key`** (the logical programme) and one immutable row per **version**; identity/version constraint `(school_id, programme_key, version)`; `ProgrammeObjective` (M2M to an objective **version**) + a historized **`ClassProgrammeAssignment`** (P12) | Additive; several logical programmes coexist for the same subject/level/track; "one version per logical programme" and "several logical programmes" both expressible; no change to `Class` itself |
| P1-B | `programme_id` directly on `Class` | Cannot express "one programme per subject" (a class takes several subjects); wrong shape for (a) |
| P1-C | Reuse the `Category` tree as the programme | The tree is the question-bank taxonomy; versioning, official/local scope and coverage do not fit; would overload one table with two lifecycles |
| P1-D | Programme only on `Course` | Courses are teacher-authored content, not the official programme; (c) sharing across professors would break |
| P1-E | Programme identity as `(subject, level, track)` only | Fails A.4/A.5: makes two *different* logical programmes at the same subject/level/track indistinguishable (e.g. two parallel tracks with different content), and would make duplicate detection delete a legitimate second programme |

### Recommended default

- `Programme`: `id`, `school_id`, **`programme_key`** (stable, e.g. `MATH-6E-STD`), `subject_id`,
  `level`, `track` (nullable), `name`, `kind` (`official` | `personal`, see P4), `status`
  (`draft` | `published` | `archived`), `version` (int), `supersedes_id`, `origin`
  (`imported` | `authored`), `created_by`, timestamps. **Identity/version constraint
  `(school_id, programme_key, version)`**; a partial "one *published* version per `programme_key`"
  rule enforced in the service (SQLite has no partial unique index through Prisma).
- `ProgrammeObjective` (M2M): `programme_id` (a **programme version** row), `objective_id` (an
  **immutable objective version** row), `order_index`. Satisfies (b) and A.7: the junction associates
  one programme version with one objective version.
- `ClassProgrammeAssignment`: effective-dated assignment per **P12** — `class_id`, `subject_id`, `programme_id`
  (a specific programme version), `valid_from`, `valid_to`, actor + audit. Satisfies (a) and B.
- **Subject / level / track across versions:** these are attributes of the *logical* programme
  (`programme_key`), so every version of one logical programme must carry the **same** `subject_id`,
  `level` and `track` — changing any of them is a **new logical programme** (new `programme_key`), not
  a new version. Enforced in the service on version creation (A.3). Several logical programmes may
  share `(subject, level, track)`; they differ by `programme_key`/`name` (A.4).
- Duplicate detection for (c): **`(subject, level, track)` alone must never identify a programme as a
  duplicate** (A.5). The comparison key is the normalised **`programme_key`** (with `level`/`track`
  only as a *hint*), plus name/code overlap as a non-blocking suggestion. On import, if a published
  programme with the same `programme_key` exists, the importer is steered to *propose a new version*
  of it; a different `programme_key` at the same subject/level/track is a **legitimate parallel
  programme** and must not be merged. Never an automatic merge.

### The five distinct things (do not conflate)

| # | Thing | Column(s) |
|---|---|---|
| 1 | Logical **programme** | `Programme.programme_key` (stable across versions) |
| 2 | Programme **version** | `Programme.id` for one row + `Programme.version`; identity `(school_id, programme_key, version)` |
| 3 | Logical **objective** | `LearningObjective.objective_key` (stable across versions) |
| 4 | Objective **version** | `LearningObjective.id` for one immutable row + `.version` |
| 5 | **Membership** of an objective version in a programme version | `ProgrammeObjective (programme_id, objective_id, order_index)` — never a `programme_id` column on `LearningObjective` |

`parent_id` on `LearningObjective` is a **hierarchy** link (an objective tree), never versioning and
never membership. This is the single most common way to corrupt the model; it is stated here as a rule.

### Effort

L. New models + migration + `ProgrammeService` + routes + import path + UI later. Schema and service
only is M; import and duplicate detection push it to L.

### Phase 1 code and tests that change

- `prisma/schema.prisma` (new models; back-relations on `School`, `Subject`, `Class`,
  `LearningObjective`), new migration under `prisma/migrations/`.
- `src/backend/services/learning/` — new `ProgrammeService.js`; `LearningTaxonomyService` gains
  programme linking.
- `src/backend/routes/` — programme routes (new file or `learning.routes.js`), permission guards.
- `src/shared/permissions.js` — at most read/write additions; **no new role** (g).
- `src/backend/routes/bulk.routes.js` — add `programmes`, `programme_objectives`,
  `class_programme_assignments` to export/import lists and sanitizers.
- New tests: `tests/integration/learning.programme.test.js` (identity/version uniqueness, several
  logical programmes at the same `(subject, level, track)`, M2M membership binds objective *versions*,
  subject/level/track immutability across versions), duplicate-detection unit test (a different
  `programme_key` is never treated as a duplicate). Existing learning tests must pass unchanged.

---

## 3. Proposal P2 — Objective versioning (immutability once published)

**Goal:** satisfy (e) and (h).

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P2-A (recommended)** | `LearningObjective` gains `version` (int, default 1), `supersedes_id` (self FK), `published_at`, `scope`, `visibility`. A published official row is immutable; an edit creates a **new row** (version+1) that supersedes it, and the old row becomes `archived` but is retained. Coverage is defined in **P5** (membership of the *assigned* programme version ∧ `scope='official'` ∧ `published_at != null`), **not** by a global "not superseded" test — a superseded version stays valid wherever an older programme version still references it | Additive, small, keeps one table and all existing reads working; the "chain" is explicit through `supersedes_id` |
| P2-B | Separate `LearningObjectiveVersion` content table with a thin identity row | Cleanest historically; every read/write joins; larger change to routes, services, backup and the console |
| P2-C | In-place edit + an immutable audit trail only | Cannot satisfy (e): the official artefact would still change under classes |

### Recommended default

P2-A. Publish = `status='active'` with `published_at` set. A new version never rebinds
`ClassProgrammeAssignment` (P12), never re-points existing criteria, and never silently retires classifications:
`QuestionAssessmentCriterion.objective_id` keeps pointing at the version it was created against, so a
question's recorded evidence never mutates when a programme is revised. An admin "adopt version N+1
for this class" action is a deliberate, audited step — the only way classes move (e), and it is now a
**historized assignment** (P12), not an in-place update.

Round-2 additions (E):

- **Code uniqueness across versions:** `code` stays unique **within a logical objective across all its
  versions** — the same `code` may not appear twice for one `objective_key` (an objective version is a
  revision of the same objective, not a new one). Uniqueness is still enforced in the database; the
  service must also run the pre-check and handle the concurrent-write race by catching Prisma **P2002**
  and returning a 409 rather than a raw error (see also §13.1A-E).
- **Published rows are immutable in the service, not only by convention:** `updateObjective` refuses any
  content change to a row with `published_at != null`; the only paths are "create new version" and
  "archive". This is a validation the service enforces *before* it writes, independent of any UI.
- **Versions are created in a programme context** only where a programme exists (P1); an objective
  version outside any programme is allowed (legacy/local) but is not part of a programme version until
  a `ProgrammeObjective` row binds it (P1, five-things table).

### Effort

M (schema + service rules + approve/publish flow + coverage query).

### Phase 1 code and tests that change

- `LearningTaxonomyService.updateObjective` 303+, `createObjective` 280, `approveObjective` 355:
  refuse in-place edits of published official rows; branch to "create new version".
- New pure validator `objective-version-validator.js` (+ `tests/unit/`).
- Coverage query + endpoint (see P5).
- `src/backend/routes/bulk.routes.js` sanitizer for the new fields.
- New tests: versioning rules, immutability refusal, "new version does not move classes".
- Existing `tests/integration/learning.routes.test.js` proposal tests remain valid (a *proposed* row is
  not published, so it is still editable).

---

## 4. Proposal P3 — Governance modes: four presets over one data model

**Goal:** the additional requirement "governance modes as school settings over one data model, at most
four presets"; plus (d) and (g).

### The one data model

Everything is the same rows: `Programme` (kind/status/version) + `LearningObjective` (scope/status/
version) + `ProgrammeObjective`. A **mode** only decides *who may author or publish*, never what is
recorded. Implemented as a school setting `learning.governance.mode` (admin visibility) with four
values, plus the existing `learning.teacher_objective_creation` retained as a sub-flag of the
teacher-owned preset for backwards compatibility.

### The four presets

| Preset | Who imports/authors a programme | Who publishes official | Teacher local objectives | Notes |
|---|---|---|---|---|
| **Official programme** | Admin (or a professor, verified by admin) | Admin | Yes, under official parents | Strictest default |
| **Admin-defined** | Admin only | Admin | Yes | Professors may not import |
| **Teacher proposes / admin approves** | Professor imports → `proposed` | Admin, one click | Yes | Matches today's D2 default |
| **Teacher-owned** | Professor imports → published directly | Professor (audited) | Yes | Maps to `teacher_objective_creation = true`, widened to programmes |

### Recommended default

`learning.governance.mode = 'teacher_proposes'` (today's behaviour, expressed as a preset), **default
off together with the master switch**. Presets are enforced in `LearningTaxonomyService` /
`ProgrammeService`, not in the UI. "At most four" is honoured by refusing to add a fifth value.

### Mode switching — what happens (the part that must be explicit)

| Change | Behaviour |
|---|---|
| Switch to a **stricter** mode | Nothing is deleted, nothing is unpublished. Previously published teacher rows keep their status but are flagged for admin review (a queued, dismissible list). No new teacher publish is allowed. |
| Switch to a **looser** mode | Nothing is auto-published. Existing `proposed` rows stay `proposed` until a human publishes them; a bulk "publish all proposals" is an explicit, audited admin action, never automatic. |
| Any switch | Recorded in settings history + audit (`entityType: 'setting'`). Modes never rewrite `scope`, `version`, `supersedes_id`, criteria, or coverage inputs. |
| Master switch off | All learning routes 403 `FEATURE_DISABLED` regardless of mode (today's gate). |

**Invariant (state it in the architecture doc if approved):** evidence and mastery are **unaffected by
the governance mode**. A mode change can never alter what was recorded, only who may add taxonomy.

### Effort

S if the four presets map onto existing checks; M once programme authoring is included.

### Phase 1 code and tests that change

- `LearningTaxonomyService` — read `learning.governance.mode`; replace the single
  `isTeacherCreationEnabled` branch with a preset resolver (keeping the old setting as an alias).
- `src/frontend/console/pages/learning/flags.js` — expose the resolved mode; console settings page
  gains the selector. (`src/frontend/console/pages/settings/` — new `learning.mode` section.)
- New tests: **mode-by-role matrix** (P8), mode-switch transition tests, "mode never touches evidence".

---

## 5. Proposal P4 — Local sub-objectives, personal programmes, and what "official" means

**Goal:** satisfy (f), (g), (h).

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P4-A (recommended)** | Add `scope` (`official` \| `local`) and `visibility` (`private` \| `class` \| `school`, default `private`) to `LearningObjective`, and `kind` (`official` \| `personal`) to `Programme`. Local/personal rows are fully functional for the author, never count for coverage, never block a version bump | One model, two visibilities; needs a visibility filter in every read (already the pattern for teacher-scoped rows) |
| P4-B | Separate `LocalObjective` table | Duplicates validators, criteria targets and UI; two ways to do one thing |
| P4-C | Local objectives are just `proposed` official ones | Wrong semantics: a proposal is a candidate official artefact; a local extension is deliberately not official |

### Local ownership, visibility and reuse (round-2 section C)

Owner requirements preserved: teachers freely create local sub-objectives/extensions under official
parents; teachers may create personal local programmes; **local never becomes official merely by
sharing or reuse**; **local never contributes to official coverage**; no head-of-department role (g).

Simplest model with explicit defaults — **one `scope` + one `visibility` column**, no new table:

| Kind | `scope` | `visibility` (default) | Who sees / may reuse | Counts for official coverage? |
|---|---|---|---|---|
| Teacher-private local objective | `local` | `private` **(default)** | Author only | No |
| Class-shared local extension | `local` | `class` | Anyone with `class.learning.read` on that class | No |
| School-shared local extension | `local` | `school` | Anyone with `school.learning.read` | No |
| Personal local programme | `kind='personal'` | `private` **(default)** | Author only; never publishable, never in the verification queue | No |

Rules:

- Default is the **most restrictive** (`private`); widening to `class`/`school` is a deliberate,
  audited action by the author, and widening **never** sets `scope='official'` or `published_at`.
- Reuse (another teacher copies a shared local objective into their own context) creates a **new local
  row owned by the copier** — it does not share ownership, and the copy is still local.
- A reusable extension that a school wants to make official goes through the normal proposal/publish
  path (P3 mode) — promotion is always explicit and audited; there is no implicit promotion.
- Visibility is enforced in every read (the pattern already used for teacher-scoped rows), and the
  coverage query filters on `scope='official'` **first**, so no local row can ever enter a coverage
  denominator regardless of its visibility.
- Permission strings: none new beyond those in §13.5; sharing does not require a role, only the
  existing read permissions scoped by visibility.

### Effort

M.

### Phase 1 code and tests that change

- Schema (`scope`, `kind`, `visibility`), `LearningTaxonomyService` visibility filters, coverage query.
- `src/shared/schemas/learning.schema.js` — `scope`/`visibility` accepted, but a client can never set
  `scope='official'` or `published_at` on a local row (server-forced).
- New tests: local objective visible only to author by default; class/school visibility widens reads
  but never coverage; reuse creates a new local row owned by the copier; personal programme never
  publishable; no new role exists (assert the role table and permission catalog are unchanged); a
  shared local extension is still excluded from every coverage denominator.

---

## 5A. Proposal P10 — Objective identity, version semantics and historical references (critical)

This is the reviewer's ranked #1 issue and the one the whole revision stands or falls on. Today
`QuestionAssessmentCriterion.objective_id` points at a **mutable** row, so one reference has to carry
four different meanings that are not interchangeable:

| Meaning | Example | How the design answers it |
|---|---|---|
| 1. The logical objective, across all versions | "compare fractions" as a curriculum idea | `objective_key` — a stable identifier shared by every version of that objective |
| 2. One specific official objective version | the wording published in programme v3 | `objective_id` — the criterion points at the **exact immutable row** |
| 3. A local objective derived from an official one | a professor's extension under "compare fractions" | `scope='local'` + `derived_from_objective_id` pointing at the official row; the local row has its own `objective_key` |
| 4. An objective as used inside a particular programme | the same objective in two programmes (b) | `ProgrammeObjective (programme_id, objective_id, order_index)` — a **programme-version row × an objective-version row**; the objective row is shared across programmes, the membership is not |

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P10-A (recommended)** | Each published revision is a **new immutable row** carrying `objective_key` (stable), `version`, `supersedes_id`, `scope`, `derived_from_objective_id?`. Criteria keep pointing at `objective_id` — the version pin is therefore **implicit and automatic**, nothing is re-pointed | Smallest change that is correct; needs the discipline "never edit a published row" enforced in the service; reporting across versions groups by `objective_key` |
| P10-B | Separate `ObjectiveIdentity` + `ObjectiveVersion` tables | Textbook normalization; every current read and write joins; larger change to services, routes, backup and the console |
| P10-C | One mutable row + a history table | **Fails the requirement.** The reference still points at the mutable row; history is not what the criterion points to |
| P10-D | Criteria store `(objective_key, version)` as two columns instead of a row id | Equivalent to A, but requires a composite FK that SQLite/Prisma cannot express cleanly, and loses referential integrity |

### Recommended default and the normative rule

P10-A, with this rule stated in the architecture if approved: **a reference is never silently
re-pointed.** A version bump creates a new row; the superseded row stays `archived` and remains the
referent of everything that already pointed at it. No migration, no admin action and no mode change may
rewrite `QuestionAssessmentCriterion.objective_id`.

Deliberately **not** adopted: denormalising `objective_version` onto the criterion. The version is
derivable from the row it points at, and a denormalised copy is exactly the kind of field that goes
stale.

### Migration for existing rows (round-2 revision E — conservative)

**Do not assume that every legacy `active` objective is an officially published curriculum
objective.** Legacy rows were created under Phase 1 rules that allowed admin in-place edits and a
`proposed → active` approval that predates the notion of "official programme". The migration therefore
preserves content and status and **does not invent official provenance**:

| Field | Conservative mapping |
|---|---|
| `objective_key` | `= id` (each legacy row becomes its own logical objective; no row is merged with another) |
| `version` | `1` |
| `supersedes_id` | `null` |
| `derived_from_objective_id` | `null` |
| `scope` | **`'unassigned'`** for every legacy row (a new intermediate value), *not* `'official'` |
| `published_at` | `null` — never inferred from `updated_at` |
| `code` | unchanged; uniqueness across versions enforced going forward |

- Legacy rows are therefore **visible and usable exactly as before**, but they are **not official** and
  contribute **nothing** to coverage until an explicit admin action promotes them.
- **Promotion is explicit:** the admin either (i) records the row as a real official published
  objective (setting `scope='official'`, `published_at`) as part of adopting it into a programme
  version, or (ii) leaves it local/unassigned. This is an "adopt & verify" step (see P6), audited, with
  a report of unassigned rows.
- Consequence: coverage starts at **zero-defined / zero-evidenced** for pre-existing schools and rises
  only through verified adoption — honest, and never a fabricated number.
- No criterion is touched; every existing classification keeps pointing at the row it always pointed
  at, now understood as "that objective's version 1". Question 11 of the reviewer's checklist is still
  answered "yes" — but the answer is now "content and relationships preserved, official status
  re-established by explicit verification", not "auto-promoted to official".

### The Phase 2 forward contract (this is the point of P10)

Every future evidence and activity row must carry, at minimum:
`objective_id` (version-pinned) + `objective_key` (cross-version reporting) + `programme_id` — which
**is** a programme *version* in this model, so no separate `programme_version` column is stored unless a
concrete reason is given (round-3 C4) — plus the class/subject context, and an explicit
"programme-less" value when the activity happened outside any programme. Without this, mastery would
interpret history against a curriculum that was not in effect when the activity happened. This
supersedes and specifies row 1 of §13.12; the full snapshot field list and its rationale are in §16.2
(round-3 C4).

### Effort

M for the schema/service rules; L once the taxonomy console and every read that groups by objective are
updated to use `objective_key`.

### Phase 1 code and tests that change (if approved)

- Schema: `LearningObjective` gains `objective_key`, `version`, `supersedes_id`, `scope`
  (`official` | `local` | `unassigned`), `derived_from_objective_id`, `visibility`.
  **Exact unique constraints (round-3 §4 — this is no longer "the current rule is re-examined"):**
  1. `@@unique([school_id, objective_key, version])` — one row per objective **version** (the identity).
  2. `@@unique([school_id, subject_id, code, version])` — **replaces** today's `(school_id, subject_id,
     code)`. It stops two *distinct* logical objectives from introducing the same code at the same
     version, while allowing a code to repeat across versions of the **same** `objective_key`.
  3. Service rules (transactional, and **P2002 → 409**): `code` is identical across every version of one
     `objective_key`; a logical objective's first version is always `1`; a code, once used in a subject,
     is never reassigned to a different `objective_key` (version rows are never deleted, so the old row
     keeps the old code and keeps the slot). A deliberate code change between versions is allowed only
     because it lands on a **new row** — history retains the old code automatically.
  State it plainly: constraint 2 **replaces** an existing unique index, so this migration is *not
  purely additive* even though no column is added, renamed or dropped. SQLite stores a Prisma `@@unique`
  as a unique **index**, so the migration issues `DROP INDEX "LearningObjective_school_id_subject_id_code_key"`
  and `CREATE UNIQUE INDEX` for the two new keys — a deliberate, documented **constraint** change (never a
  data change), and the migration test must prove that no objective row or criterion row is lost or
  altered by it.
- `LearningTaxonomyService`: `updateObjective` must refuse in-place edits of rows with
  `published_at != null` and branch to "create new version" (today it allows them — Defect from §13.2);
  `approveObjective` stamps `published_at` and freezes the row; every code-uniqueness pre-check must
  also catch Prisma **P2002** and return 409 (concurrent-write safety).
- `ProgrammeObjective` binds a **programme version** row to an **objective version** row (A.7), so a
  criterion recorded inside a programme version always resolves to the exact objective version that
  version used.
- New pure validator for the version chain (no cycles, monotonic versions, no cross-key supersede).
- Tests: version creation, immutability refusal, "criterion keeps pointing at v1 after v2 is published",
  migration test proving pre-existing rows become **unassigned** v1 without content change, and "a
  legacy `active` row does not count for coverage until adopted".

---

## 5B. Proposal P12 — Historized class-to-programme assignment (round-2 section B)

**Goal:** satisfy (a) and (e) without destroying history. A class's curriculum is a **time-series**, not
a single mutable pointer: today's `ClassProgramme(class_id, subject_id, programme_id)` would be
overwritten on a version change, so "results of class A in 2026" could no longer be interpreted against
the programme that was actually in force in 2026.

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P12-A (recommended)** | `ClassProgrammeAssignment`: `class_id`, `subject_id`, `programme_id` (**a specific programme version**), `valid_from`, `valid_to` (nullable = current), `assigned_by`, `assigned_at`, `reason?`, audit. Non-overlap enforced by a service rule + a DB check where expressible | Full history in one table; "which programme applied on date D" is a single indexed query; moving a class = close the open row, open a new one; no destructive update |
| P12-B | Keep `ClassProgramme` current-only + a separate `ClassProgrammeHistory` of superseded rows | Same information, two tables to keep consistent; more places to get wrong |
| P12-C | Current-only `ClassProgramme` (as in the round-1 draft) | **Fails C2:** history is lost on every move; 2026 results become unexplainable |

### Recommended default

P12-A. Rules:

- **Non-overlap — enforced at the database *and* in one transaction (round-3 C5; a service check alone
  was not sufficient):** at most one **open** assignment (`valid_to IS NULL`) per
  `(class_id, subject_id)`, and no two assignments for the same pair may overlap on the **half-open**
  interval `[valid_from, valid_to)`.
  - **Database guard:** a **partial unique index** in the hand-written migration —
    `CREATE UNIQUE INDEX "ClassProgrammeAssignment_open_key" ON "ClassProgrammeAssignment"("class_id", "subject_id") WHERE "valid_to" IS NULL`.
    SQLite supports partial indexes (≥ 3.8.0) and the repo's migrations already issue raw
    `CREATE UNIQUE INDEX` (e.g. `20260702140027_join_tables_surrogate_id`). Prisma cannot express a
    partial index in `schema.prisma`, so this index **will not appear in the schema model** — an
    acknowledged, documented **drift**: it lives in the database and in the migration, and the model
    carries a comment saying so. It is the guarantee that two concurrent requests cannot both open.
  - **Transaction:** closing the open assignment and opening the new one is a **single interactive
    transaction**, and the overlap check runs *inside* it. On a lost race the partial index raises
    **P2002** (or the conflict is caught) and the endpoint returns **409** — never a silent second
    assignment. Tests must cover a *sequential* second assignment **and** two *concurrent* reassignments
    (T19, T30).
  - **Interval precision and timezone:** `valid_from`/`valid_to` are **UTC timestamps** (`DateTime`),
    never local calendar dates; the new assignment's `valid_from` equals the closed assignment's
    `valid_to` **exactly**, so the half-open convention leaves neither gap nor double count. An activity
    stamped exactly at the boundary belongs to the **new** assignment (`[from, to)`), and that boundary
    rule is asserted by a test. `School.school_year` is a **display label only** and is never used for
    interval arithmetic.
- **Class identity is not permanent (round-3 C5.3):** `Class` (schema 173) holds only `(school_id,
  name)` and **no academic-year column** — classes are recreated, renamed or reused between years, and
  `School.school_year` is a single school-level string. The assignment therefore **snapshots the class
  context it was made under**: `class_id` **plus** the class `name` at the time
  (`class_label_snapshot`) **plus** `school_year`. History resolves through the snapshot, so a later
  rename, or a new class reusing an old name, can never rewrite what a 2026 assignment meant.
- **Programme version, not logical programme:** the assignment always names an exact `programme_id`
  (version row). A version bump never touches existing rows.
- **Move process (audited):** closing the open assignment and opening a new one is a single
  transaction, written to the audit log (`entityType: 'class_programme_assignment'`, with actor, from/to
  programme versions and reason). No bulk class-wide move in v1 (see §12).
- **Deletion:** a programme version referenced by any assignment (past or present) cannot be deleted —
  `Restrict`, never `SetNull`.
- **Normative rule (state verbatim in the architecture if approved):** *"A programme change affects
  future activities and never reinterprets past activities or results."*
- **Phase 2 forward contract (B.6, specified by round-3 C4):** when an activity is recorded, the
  evidence must **snapshot** the classification and context *in force at that moment*, so that
  reconstructing history never depends on the question's or the class's current state:

  | Snapshot field | Why |
  |---|---|
  | `question_id` | the exact item answered |
  | the criterion / objective-**version** actually used | so a later re-classification of the question cannot rewrite what this student's evidence meant |
  | `objective_key` + objective `version` | cross-version reporting plus the exact version |
  | the programme **version** (`programme_id`) — or an explicit programme-less value | which curriculum context was in force |
  | class/subject context | who it was gathered for |
  | `ClassProgrammeAssignment.id` (where applicable) | the exact assignment row that made the programme applicable |
  | activity timestamp (UTC) | ordering against the assignment interval |

  Field duplication is not required where an **immutable referenced row** already preserves the value
  (e.g. an immutable objective version row preserves its own content); what is required is that the
  evidence stays **resolvable after questions, criteria or assignments change**. This is the concrete
  form of the P10 forward contract and of F.5.

### Effort

M (one table + service rules + transactional move + audit + reads "as of date").

### Phase 1 code and tests that change (if approved)

- New model `ClassProgrammeAssignment` (+ `Restrict` FKs on programme version and class); migration.
- `ProgrammeService` — assign/move (transactional), "current assignment" and "assignment as of date"
  queries; `bulk.routes.js` store list + sanitizer.
- Coverage (P5) reads the assignment **as of the evaluation date / current** rather than a single FK.
- Tests: move preserves the earlier assignment; overlap is rejected; as-of-date resolution; deleted
  programme version is refused; audit row written on move.

---

## 6. Proposal P5 — Coverage counting (and what it deliberately excludes)

**Goal:** satisfy (h) precisely, and make the number defensible.

**Recommended default:** a coverage query/service that counts, per (class, subject), against the
**exact programme version assigned to that class** (P12, "as of" the evaluation date — current by
default). Eligibility is decided by the **immutable membership of that programme version** — i.e. the
`ProgrammeObjective` rows of the assigned version whose objective is official **and was published when
it became a member** — and **never** by the objective's *current global* status. The programme context
is resolved **through the assignment**, not inferred from the objective (round-3 C3: one objective
version can be a member of several programmes, so the objective alone cannot name one).

**Three separate measures (round-3 §5) — never collapsed into one number:**

| Measure | Meaning |
|---|---|
| **Defined coverage** | Official objective versions that are members of the exact assigned programme version |
| **Question-mapped coverage** | Of those, the objective versions with **at least one eligible, reliable criterion** (P11) pinned to that exact objective version |
| **Learning evidence / mastery** | Student activity evidence and later objective-level mastery — **Phase 2/3**, never computed here |

Coverage is a statement about the **material**, never about a student: an objective can be 100 %
question-mapped while no student is proficient, and a student can be proficient on an objective the
programme does not contain. Neither coverage number may be displayed as a student score or feed the
high-stakes gate (see §13.10). Note the vocabulary: *question-mapped* — **not** "evidenced" and **not**
"mastered" — because no student evidence is involved.

**Eligibility in a denominator (round-3 C1 — this replaces the contradictory round-2 wording):**

- The test is **"is this objective version a member of the exact assigned programme version, and was it
  official/published when it became a member?"** — a *historical membership* test.
- The test is **not** "is this objective's *current global* status `official` and not archived?".
  Applying that global test is exactly what made **T8 and T10 contradict each other**.
- Therefore an objective version that is later **superseded or archived globally** **stays in the
  denominator** of any still-assigned, older programme version that references it. Its historical
  membership is not invalidated by its current status (new test **T27**). Only an assigned-version
  **change** removes it.
- What *is* excluded categorically: rows that are **not members of the assigned version at all** —
  local, unassigned/legacy, private/personal-programme, objectives belonging only to a *different*
  programme version, and proposed/rejected rows that were never published as members. (So T10 is
  corrected: it excludes **non-members**, not "everything archived".)
- **The denominator is the assigned programme version's objective set.** Whether a version is
  "superseded" is evaluated *relative to the assignment*; the newest version in the school never changes
  an older class's denominator.
- **Publication never silently moves a class:** publishing a new programme version, or a new objective
  version, changes nothing for a class until a deliberate, audited reassignment (P12) moves it. If an
  admin *does* reassign, the denominator changes **by that visible action**, and history is preserved
  (the closed assignment still resolves for past dates).

**Publication-time eligibility, frozen with the version (round-4 §1):**

- Eligibility is **established when the programme version is published, and then frozen**. Publishing a
  programme version **validates every membership row**: each member objective must be `scope='official'`
  ∧ `published_at != null` **at that instant**. If any member is not, publication is **refused** and the
  offending members are named. A published version's membership is therefore eligible **by
  construction**, and the coverage query needs **no current-status test at all**.
- So "published when it became a member" is precise: *the objective was already published official at
  the moment the programme version that contains it was published*. There is **no retroactive
  promotion** — an objective published **after** a version's publication cannot join that version; the
  curriculum change arrives as a **new programme version** (T36), and a class moves only by an audited
  reassignment (P12).
- Each `ProgrammeObjective` row records when it was included, and the member objective's `published_at`
  is immutable, so an auditor can prove *why* a member was eligible even after the objective is later
  archived (T27 continues to hold).
- Corollary: a class's denominator can be reproduced **exactly** at any later date, because neither the
  membership nor the member objectives' publication state can change after publication.

**Distinct-objective counting (round-4 §3):**

- The denominator counts **distinct objective versions** that are members of the assigned programme
  version; each member row contributes **once**.
- Duplicate membership is impossible by construction: `ProgrammeObjective` carries
  `@@unique([programme_id, objective_id])`, and a service validator allows **at most one version per
  `objective_key`** within one programme version — so one logical objective is never counted twice in
  the same version.
- If duplicate data ever appears (e.g. a hand-edited restore), coverage **de-duplicates by objective
  version id** rather than trusting the row count.
- Verified against the schema so the word "distinct" is not vague: `Competency.status` is
  `active | archived` and `LearningObjective.status` is `proposed | active | rejected | archived`, but a
  criterion has **no** per-row active flag and `Question` has **no** archive/status column. "Distinct"
  is therefore defined on the rows that exist, never on a status filter that does not exist.

**The complete question-eligibility predicate (round-4 §3; subject consistency added in round-5 §1) — one expression, no informal parts:**

For a class `C`, subject `S` and evaluation date `D`:

```
A  = the ClassProgrammeAssignment open at D for (C, S)      // none → coverage is UNDEFINED, not zero
P  = A.programme_id                                        // a programme VERSION
M  = { o : ProgrammeObjective(programme_id = P, objective_id = o) }   // frozen at P's publication

subject(q)  = the subject of a question, resolved via its category:
              Category(q.category_id).subject_id
              // Question has NO subject_id column; Category.subject_id is NULLABLE
              // NULL (no category, or a category with no subject) → UNDETERMINED

reliable(c) = ( c.review_status = 'confirmed' )            // allowlist, §10A
            ∧ ( c.source ∈ { 'manual', 'suggested' }
                ∨ ( c.source = 'imported' ∧ an audited trust decision exists for c ) )
            ∧ c.source ≠ 'ai_suggested'

mapped(o)   = ∃ criterion c, ∃ question q:
                c.objective_id = o
              ∧ c.question_id  = q.id
              ∧ q.school_id    = the school
              ∧ q is not deleted
              ∧ subject(q)     = S          // round-5: question must belong to the evaluated subject
              ∧ reliable(c)
              ∧ c.weight > 0

defined         = |{ distinct o ∈ M }|
questionMapped  = |{ distinct o ∈ M : mapped(o) }|

Invariants that must hold (backend-enforced, round-5 §1):
  P.subject_id = S            // the assigned programme version is of the evaluated subject
  o.subject_id = S            // every counted member objective is of that subject
  subject(q)   = S            // and so is the question (never merely assumed by the query)
```

In words, a criterion counts for a class only when **all** hold: it pins a member objective version of
the class's assigned programme version; it is reliable (allowlist, §10A); its weight is greater than
zero; the question still exists and belongs to the school; **and the question is of the same subject as
the programme being evaluated**. It does **not** depend on the question's category (beyond subject
resolution), tags, `difficulty`, exam usage, or the question's `pedagogy_status` cache — and it does
**not** depend on any programme field on the criterion, because there is none (C3: the criterion is
programme-independent; membership is what binds it).

**Subject consistency is a backend invariant, not a query assumption (round-5 §1 — verified, and it
does not exist today):**

- **The reviewer's literal `q.subject_id = S` cannot be written as stated**: `Question`
  (`prisma/schema.prisma` 245-284) has **no `subject_id`** column. A question's subject is reachable
  only through its category — `Category.subject_id` (`:197`), which is **nullable**
  (`onDelete: SetNull`, `:209`). The predicate therefore uses the **resolved** `subject(q)` above, and
  treats **`NULL` as UNDETERMINED**.
- **No such check exists in the backend today.** `validateCriteriaSet`
  (`src/shared/learning/pedagogy-validator.js:45-126`) validates objective∈school, Bloom∈catalog,
  competency↔objective subject compatibility and weight, but it **never receives or checks the
  question's subject**; `QuestionPedagogyService.setCriteria` (`:151-156`) passes only
  `objectiveSubjectById`/`competencySubjectById`. So a criterion linking a French question to a
  Mathematics objective is **accepted today**.
- **Therefore it must be added as a guarantee, not assumed by the coverage query.** On any approved
  implementation: (i) at criterion **write** time, the backend resolves `subject(question)` and requires
  it to equal `objective.subject_id` (a mismatch is refused, not silently stored); (ii) at criterion
  **confirmation** time the same check is re-run, so a legacy row cannot be confirmed into reliability
  while it is inconsistent; (iii) at programme **publication**, every member objective must satisfy
  `o.subject_id = P.subject_id`; and (iv) the coverage query **still** tests `subject(q) = S` —
  defence in depth, because legacy rows, restores and imports may predate the write-time check.
- **Consequence, stated deliberately:** a question with **no category**, or a category with **no
  subject**, has an **undetermined** subject and contributes **nothing** to any subject's coverage. The
  coverage UI must show this as "subject undetermined", **not** as covered — an unknown subject is not a
  wildcard match.
- New unresolved decision **U13** (§16.4): whether the backend should **hard-block** cross-subject
  criterion writes (recommended) or only warn and exclude them from coverage, and what to do with
  **pre-existing** cross-subject rows (the check is absent today, so such rows may already exist):
  quarantine + migration report, never auto-rewrite.

**Parent/child membership counts independently (round-4 §4):**

- A parent and a child are **two different objective versions**; each counts **only if it is itself a
  member** of the assigned programme version.
- A member child does **not** make its parent count, and a member parent does **not** make its child
  count. If both are members, both are in the denominator (**2**), and each must be mapped by its **own**
  reliable criteria to count as question-mapped.
- A question mapped to a child **never** satisfies the parent, and vice versa: there is **no roll-up and
  no roll-down** in coverage. A future roll-up, if ever wanted, is a *separate* measure and never a
  replacement for this one.
- A **local** objective may be the child of a member official objective and still contributes
  **nothing** — it is not a member, and local is never official (§5). Likewise an official child whose
  parent is local/unassigned still counts on its own if it is a member.

**Historical subject resolution and category changes (round-6 §1) — the reproducibility gap the
predicate alone does not close:**

The round-5 predicate resolves `subject(q)` **live**, through the question's category. That is not
reproducible: `Category.subject_id` is **freely updatable** (`CategoryUpdateSchema = CategoryCreateSchema.partial()`,
so `PATCH /categories/:id` accepts `subject_id`, including `null`; `categories.routes.js:74-82`), a
**question can be re-parented** (`question.schema.js:29,45` — `category_id` is updatable), and deleting a
`Subject` sets `Category.subject_id` to **NULL** (`onDelete: SetNull`). So the scenario the reviewer
raised is real today: a category moves Mathematics → French (or loses its subject) and the **same
question and the same confirmed criterion** produce a different coverage result without the criterion
being touched. That contradicts the architecture's historical-integrity principle, so a policy is
required — **the predicate alone does not guarantee reproducibility.**

**Recommended policy (a policy, not an assumption — the choice is decision U14):**

1. **Immutability guard on in-use categories (preferred, first line).** A category whose questions carry
   **at least one `confirmed` criterion** is **in use**; its `subject_id` may no longer be changed or
   nulled through the ordinary PATCH route. Changing it requires an explicit, audited
   **reclassification migration**: recompute the affected questions, re-validate every confirmed criterion
   against the new subject, demote to `unreviewed` (or `rejected`) any criterion that becomes
   inconsistent, and emit a migration report. **Never silent.** (Because `Category.subject_id` is a plain
   nullable column with no database trigger, this is a **service-level guard plus a consistency
   verifier/job**, not a database constraint — stated honestly, and tested.)
2. **Subject snapshot at confirmation (makes the past provable).** The criterion records the **resolved
   subject as of its confirmation** (an added, nullable `subject_id_at_confirmation` — i.e. the
   criterion-level column set already proposed in §10A, enlarged by one field; a **new schema ask**, part
   of U14). Then a confirmed mapping is evaluated against **its snapshot**, so a later category change
   cannot retroactively rewrite coverage that was already reported: `mapped(o)` uses the criterion's
   subject snapshot when present, and the live `subject(q)` otherwise (for provisional, never-confirmed
   rows).
3. **Undetermined is a state, not a silent pass.** If a category's subject becomes NULL (or the subject
   is deleted), the affected **provisional** rows become **undetermined** and are excluded and reported;
   **already-confirmed** rows keep their snapshot (per point 2) and are reported as *diverged* from the
   live category, so an operator sees the inconsistency instead of a number quietly changing.
4. **Both, not either** — the guard prevents the common case; the snapshot makes the already-reported
   numbers defensible even when an authorised migration does happen. The alternative (snapshot only, no
   guard) is workable but leaves the live resolution free to drift for provisional rows; the alternative
   (guard only, no snapshot) cannot defend a number once a migration *is* authorised.

**U14 (new, §16.4) — which policy:** guard only, snapshot only, or both (recommended: **both**). Until
the owner decides, §6 reports that **question-mapped coverage is reproducible only while no category
subject change occurs**, and the draft does not claim otherwise.

**The guard protects the relationship, not one column (round-7 §1 — the reviewer's correction, verified
against every mutation path):**

The resolved subject is `Question → Category → Subject`, so guarding `Category.subject_id` alone is
insufficient. **Every supported service path that can change the relationship is in scope:**

| # | Path (verified) | What it does to the resolved subject |
|---|---|---|
| 1 | `PATCH /categories/:id` → `subject_id` (`CategoryUpdateSchema = partial`; `categories.routes.js:74-82`) | changes or **nulls** the subject of every question in that category |
| 2 | `PATCH /questions/:id` → `category_id` (`question.schema.js:29,45`; `questions.routes.js:132+`) | **re-parents the question** — the old category is untouched, the resolved subject still changes |
| 3 | `DELETE /subjects/:id` (`subjectSvc.delete`; `subjects.routes.js:83-100`) | does **not** merely null: `LearningObjective.subject` is **`onDelete: Cascade`** (`:1200`), so objectives are **deleted** (blocked by `Restrict` only where criteria reference them), while `Category.subject` (`:209`), `Competency.subject` (`:1233`) and `Course.subject` (`:388`) are silently set to **NULL** — a subject-scoped competency quietly becomes transversal |
| 4 | `DELETE /categories/:id` (`categorySvc.delete`, outcome reports cascaded courses; `categories.routes.js:80-90`) | `Question.category` is `onDelete: SetNull` (`:279`), so every question in that category becomes **undetermined** |
| 5 | **Import / bulk / restore** (`imports.routes.js`, `bulk.routes.js`, `archives.routes.js`, backup restore) | can rewrite categories, questions and subjects wholesale, bypassing any single-row rule |

**Rule (normative, recommended):** the in-use guard applies to the **relationship** — while a question
carries at least one `confirmed` criterion, (i) its category's `subject_id` may not change, (ii) the
question may not be re-parented to a category of a different subject, (iii) the subject it resolves may
not be deleted, and (iv) no import/bulk/restore path may alter any of these — each requires the explicit,
audited **reclassification migration** of the round-6 policy. **What enforcement is actually available
(round-8 precision):** no such trigger exists today; SQLite *does* support triggers and the migrations
already run raw SQL (they create partial unique indexes, §5B), so a `BEFORE UPDATE/DELETE … RAISE(ABORT)`
guard on these relationships **is technically possible** — but Prisma cannot express a trigger, so it
would be **documented schema drift**, exactly like the partial unique index. The guarantee therefore
remains **service-path enforcement plus a consistency verifier** — the verifier detects out-of-band
changes (direct DB edits, hand-restored backups) and reports them; a trigger is an **optional hardening**,
not a claim of prevention. Tests **T47/T48/T51**.

**Current coverage vs historical coverage (round-7 §2 — two different computations, both required):**

| | Definition | Inputs |
|---|---|---|
| **Current coverage** | "Which member objectives have a reliable criterion **now**, under the assignment in force **now**?" | live `review_status`, live `subject(q)`, live `ClassProgrammeAssignment` |
| **Historical coverage (as of D)** | "Which member objectives had a reliable criterion **at D**, under the assignment in force **at D**?" | the criterion's review and subject state **as of D**, the assignment **as of D**, the denominator frozen at publication |

The denominator is already resolvable historically (frozen programme membership, P12 assignment history).
The **numerator is not**, and a subject snapshot alone does not fix it: if an authorised reclassification
**demotes** a criterion to `unreviewed`, the current query stops counting it and the **past** number
changes retroactively — the snapshot survives but the result still moves. **Therefore a criterion-level
immutable review history is required**, not only a snapshot column:

- **New append-only table `CriterionReviewEvent`** (recommended foundation, §10A): `id`, `school_id`,
  `criterion_id`, `question_id`, `objective_id` (+ `objective_key`/`version`), `action`
  (`confirm` | `reject` | `reset`/`demote`), `review_status_before` → `after`, `actor_id`, `at`,
  `weight`, `subject_id`, `subject_label_snapshot`, optional `note`. **Insert-only**; no update, no delete.
- **Historical reliability at D is derived from the event stream** — "the latest event with `at ≤ D`" —
  **not** from the row's current `review_status`. That is what makes the demotion invisible to past
  reports and visible to current ones.
- **Every state change writes an event** in the same transaction as the state change (§10A atomicity), so
  the stream cannot diverge from the row.
- **Report snapshots remain an option**, not a requirement: if a formal report must be reproduced
  *byte-for-byte*, an immutable report snapshot can be stored; the event stream is the foundation because
  it preserves the **events**, not only the calculated numbers.
- **One honest limit, stated rather than hidden:** `DELETE /questions/:id` is a **hard delete** that
  cascades criteria, and `Question` has **no archive state**. A deleted question therefore removes the
  rows the current query reads, so *current* coverage loses it — and the historical stream alone cannot
  restore the "question existed and belonged to the school" clause unless the deletion is itself
  recorded. **Recommended rule:** a question that carries at least one `confirmed` criterion may not be
  hard-deleted (it must be **archived** instead) — which requires a question-archive state that **does not
  exist today** (part of **U15**). Until then, historical coverage is reproducible **only for questions
  that still exist** (test **T50**).
- **The protection must extend to *historical* confirmations, not only current ones (round-8 §2).** A
  question whose criterion was **reset or replaced** has no *currently* confirmed criterion, yet it
  still supplied a confirmed mapping to reports dated **before** the reset — so the "currently confirmed"
  test is the wrong test and would let the history be destroyed. **Normative rule:** a question that has
  **ever** contributed a confirmed mapping (i.e. any `CriterionReviewEvent` with `action='confirm'` for
  that question) may not be hard-deleted; it must be **archived**. Archiving preserves the question's
  historical identity and keeps historical reports reproducible; whether an **archived** question counts
  for **current** coverage is a counting-policy question and is therefore part of **U10**, not decided
  here (test **T53**).
- **Where the question's own lifecycle must be recorded:** for historical reconstruction, "the question
  existed at D" needs the question's create/archive dates, so the event stream records
  `question_created_at` and `question_archived_at` (or the corresponding lifecycle events) — a
  hard-deleted question has neither, which is precisely why deletion must be refused once a confirmed
  mapping exists.

**The event must carry the whole mapping, not a pointer to it (round-8 §1):**

`CriterionReviewEvent` is only a historical source of truth if it can be read **without joining any row
that may later be deleted** — and `setCriteria` replaces criteria by **delete-then-create**, where each
new criterion gets a **new uuid** (`QuestionAssessmentCriterion.id @default(uuid())`), so a replacement is
a **different identity**, not an edit. The event therefore snapshots the complete mapping:

| Field on `CriterionReviewEvent` | Why it is required |
|---|---|
| `criterion_id` (**stable identity**, plain value, no cascade) | distinguishes the original mapping from its replacement (`setCriteria` creates a new id) |
| `question_id` (**plain value, no cascade**) | identifies the question that supplied the mapping |
| `objective_id` = the **exact objective version id**, plus `objective_key` | preserves *which objective version* was mapped then, and its cross-version name |
| `bloom_dimension_id`, `competency_id`, `criterion_key`, `max_score` | the rest of the mapping's identity/key (a criterion is unique on question+objective+bloom+key) |
| `subject_id` + `subject_label_snapshot` (**non-referential**) | historical subject identity that survives a subject deletion/archival |
| `source` | provenance — `manual` / `imported` / `suggested` (**and `ai_suggested` is never reliable**) |
| `review_status_before` → `review_status_after` | reconstructs reliability at any date |
| `weight` (and `weight_before` where it changes) | preserves the `weight > 0` eligibility clause |
| `actor_id`, `at` (UTC) | who did it and when |
| `action` (`created` / `confirm` / `reject` / `reset` / `replaced`) , `event_seq` | the transition kind and a deterministic tie-break |
| `note` (optional) | the reviewer's optional note |

**Append-only, and immune to cascades:** every reference above is either a **plain column** or an FK with
`onDelete: Restrict` — **never `Cascade` or `SetNull`** — so deleting a criterion, question or subject can
never remove the history. The table has **no `updated_at`** and is **insert-only**; a `BEFORE
UPDATE/DELETE … RAISE(ABORT)` trigger is the optional hardening (documented drift, above).

**How historical coverage is reconstructed (round-8 §3 — the explicit algorithm):**

For a class `C`, subject `S`, date `D`, and each member objective version `o` of the assigned programme
version valid at `D`:

```
state(c, D)     = the latest CriterionReviewEvent for criterion c with at <= D
                  (tie-break deterministically by event_seq)
reliable(c, D)  = state(c, D).review_status_after = 'confirmed'
                ∧ state(c, D).source  ∈ { 'manual', 'suggested' }
                  ∨ ( state(c, D).source = 'imported' ∧ a trust decision existed at <= D )
                ∧ state(c, D).source ≠ 'ai_suggested'
                ∧ state(c, D).weight > 0
                ∧ state(c, D).subject_id = S
                ∧ question(c) existed at D   (derived from append-only archive/restore lifecycle events;
                  `created_at <= D < archived_at` is the single-archival / no-restoration special case only)
mapped(o, D)    = ∃ criterion c: c.objective_id = o ∧ reliable(c, D)
```

Consequences, stated explicitly:

- confirmation **before** `D`, reset **after** `D` → **counted** at `D`;
- confirmation **before** `D`, rejection **before** `D` → **not counted** at `D`;
- confirmation **after** `D` → **not counted** at `D`;
- criterion **replaced after** `D` → the original mapping is **still available for the earlier date**,
  because the event carries the original `criterion_id` + `objective_id` (the round-8 sequence: `Q1 → O1`
  stays reconstructible after the replacement to `Q1 → O2`);
- for a **single archival with no restoration**, a question archived before `D` → not counted at `D`; archived after `D` → counted at `D`. With restoration or repeated archival, question existence at `D` is determined by the append-only lifecycle events (the general rule above), not this single-interval example;
- `at <= D` is **inclusive**, with `event_seq` breaking ties, so a report at an exact instant is
  deterministic.

**Initial state and completeness (the reviewer's requirement that there be no *unrecorded* history):**
because historical reliability **starts at zero** for legacy rows (§10A), a criterion with no event would
be ambiguous. Therefore **every criterion has an event chain from a known genesis**:

- **Legacy criteria** (§10A migration) receive a **`created`/baseline event** with
  `review_status_before = null → after = 'unreviewed'` at the migration timestamp — so "zero reliability"
  is *recorded*, not merely assumed.
- **New criteria** (any `setCriteria`) receive a **`created`** event (`null → 'unreviewed'`) in the same
  transaction as the insert.
- **Replacement** records a **`replaced`** event for the outgoing criterion **before** it is deleted (the
  delete cascades the row, not the event), so the stream shows the mapping's end instant.

**Subject identity must survive the deletion of the live `Subject` (round-7 §3):**

- **The snapshot must not be a nullable foreign key.** If `subject_id_at_confirmation` is an FK with
  `onDelete: SetNull`, deleting the subject **erases** the very history it exists to protect (the schema's
  current pattern for `Category`/`Competency`/`Course`). It must therefore be either a **plain,
  non-referential value** (`subject_id` + `subject_label_snapshot`, deliberately **not** an FK) or an FK
  with **`onDelete: Restrict`**.
- **Recommended: archive subjects, never hard-delete them.** `Subject` today has **no** `status`/archived
  column (`prisma/schema.prisma:225-243`: `id`, `school_id`, `created_by`, `name`, timestamps), so
  archival needs one additive column (`Subject.status` ∈ `active|archived`, or `archived_at`). Under the
  policy: deleting a `Subject` referenced by an in-use category or by any historical learning record is
  **refused**; the subject is **archived** instead, staying resolvable for history and hidden from new
  work. This also removes the current destructive cascade to `LearningObjective` (path 3 above).
- New decision **U15** — subject archival vs an immutable non-referential subject identity (recommended:
  **archive subjects** *and* store a non-referential identity snapshot; the two are complementary).
- **What archival must guarantee (round-8 §4 — the reviewer's four conditions):** archiving a subject
  (i) **preserves its identity** (the row survives, resolvable for history), (ii) **deletes nothing** —
  no objectives, competencies, programmes or assignments are removed or nulled, (iii) **does not change
  historical coverage** (the snapshots and the stream are untouched), and (iv) **blocks new publication
  against it** — a new programme version or objective version cannot be published against an **archived**
  subject unless a separate policy explicitly authorises it. A `Restrict` FK is acceptable where the live
  subject record is guaranteed to remain; the **non-referential snapshot remains mandatory** for the
  historical records themselves. This was **unresolved as of the round-8 record**; §19.2 records U15's
  later in-principle approval, and the complete G4 wording was subsequently **adopted** (owner decision
  E1, §20.2/§20.7), satisfying U15's wording condition (test **T55** remains a Phase 1B implementation
  test).

**Counting rules — proposed, awaiting explicit owner confirmation (round-3 §5 / round-4 §6 / **U10**,
which stays **unresolved**):**

- A criterion counts only if it is **reliable** (P11 allowlist) and its **weight is > 0** — a
  **provisional** suggestion (§10A) never counts, and the validator today permits a weight of exactly
  `0`, so this clause is deliberate.
- A question used in an exam and an unused question count the **same** — only the existence of a
  reliable criterion matters.
- A **deleted** question's criteria are removed by the cascade, so they cannot count. Correction
  (round-4 §3, verified): there is **no question-archive state today** — `Question` has no
  `status`/`archived_at` column and `DELETE /questions/:id` is a hard delete cascading the criteria — so
  the round-3 rule "archived questions do not count" was **wrong as written**. If a question-archive
  state is ever added, it must be added to the predicate explicitly.
- Objectives are counted **independently** (parent and child as above); sub-objectives are their own
  objectives.
- The criterion must point at the **exact objective version** that is a member of the assigned programme
  version (P10); a criterion pinned to a version the assigned programme does not contain contributes
  nothing to that class.
- The question must be of the **evaluated subject** (round-5 §1): a criterion on a French question never
  contributes to a Mathematics programme even if it points at a Mathematics objective, and a question
  whose subject is **undetermined** (no category, or a category with no subject) contributes nothing
  either. Enforced by the backend invariant above, not by the query alone.
- The subject used for a **confirmed** criterion must be the subject **recorded when it was confirmed**,
  not the category's subject at query time (round-6 §1): otherwise a category re-assignment silently
  rewrites history. Until **U14** is decided, question-mapped coverage is reproducible **only while no
  category subject change occurs**.
- In **historical** mode the criterion is evaluated from its **event stream as of `D`** (round-8 §3), not
  from its current `review_status`; in **current** mode it is evaluated from the row. Whether an
  **archived question** counts for **current** coverage is left to the counting policy (**U10**).
- **U10 remains unresolved.** Nothing in §6 decides the counting policy: these are the proposed rules
  the owner is asked to confirm, and the three measures above are reported as *three labels*, not as an
  approved policy.

Trade-off: "question-mapped" needs a criteria count, which is cheap (a group-by on
`question_assessment_criteria`); it is not mastery and must never be presented as such.

**Effort:** S–M. **Code/tests:** coverage service + endpoint + unit tests; one test per excluded
category (local / unassigned / personal / proposed / rejected / different-version), plus the round-3
additions **T8, T9, T10, T27** (superseded member stays; publication changes nothing; non-members
excluded; archived member retained) and the round-5 additions **T39/T40** (cross-subject criterion
contributes nothing; undetermined-subject question contributes nothing). The subject-consistency check
also needs its own unit test at criterion write/confirm time (U13), and round 6 adds **T42–T46**
(category subject change after confirmation; subject set to NULL / deleted; coverage reproduced from the
confirmation-time snapshot; the immutability guard; the consistency report).

---

## 7. Proposal P6 — Migration of existing Phase 1 data

**Goal:** existing objectives, competencies, prerequisites and criteria keep working; nothing is
guessed into a programme.

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P6-A (recommended)** | No force-adoption. Existing objectives become `scope='unassigned'`, `version` 1, `supersedes_id` null, `published_at` null (see P10's conservative migration). An admin **adopt-and-verify** action promotes a row to official and assigns it into a programme version; coverage ignores unassigned rows until then | Zero-risk, additive, reversible, and **invents no official provenance** (review round 2, E); coverage starts low and rises as rows are adopted — honest, and the admin sees a to-do list |
| P6-B | Auto-create one "Imported (legacy)" programme per subject, `scope='official'`, bind every existing objective | Anticipates publication/verification: a fabricated official programme and a coverage number that was never reviewed. **Rejected by the round-2 review.** |
| P6-C | Leave existing rows out of programmes forever | Objectives would never count; the proposal queue would become dead weight |

### Recommended default

P6-A, as an additive migration: new tables, new nullable/defaulted columns, no rename, no retype, no
delete. Existing criteria rows are untouched, so question classification is unchanged by the
migration. A one-off report lists **unassigned** objectives so the admin can adopt-and-verify them. The
migration **never** marks a legacy row `official` (round-2 E) and never sets `published_at` from
`updated_at`.

### Effort

M (migration + backfill defaults + adopt-and-verify action + report).

### Phase 1 code and tests that change

- New migration (additive); `DATABASE.md` updated.
- `tests/integration/learning.routes.test.js` and the four validator unit tests pass unchanged (proof
  the migration is additive).
- New test: migration applied to a copy of the current database leaves objective/criteria counts and
  content identical, sets every legacy row to `scope='unassigned'`, and leaves coverage at zero until an
  explicit adoption.

---

## 8. Proposal P7 — Offline and SaaS delivery, programme packs, backup/restore/export

**Goal:** the additional requirement on destinations, packs, skipped versions, backup/restore/export,
and no internet/AI dependence.

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P7-A (recommended)** | A **programme pack** is a plain JSON document (`format: "quiz-programme-pack"`, `schema_version`, `pack_version`, programme identity, objectives with stable external `code`s, prerequisites, optional `from_version`/`cumulative` flags). Imported through a dedicated route **and** accepted by the existing backup/restore path. Pack files travel by USB/share on offline installs | No network, no AI, no new runtime dependency; the same file works in SaaS (uploaded) and offline (file picker) |
| P7-B | Pack as a database snapshot (the full-backup format) | Couples a curriculum artefact to the whole database; a pack could not be applied to a different school cleanly |
| P7-C | SaaS-only cloud registry of packs | Fails the offline requirement |

### Recommended default

P7-A, plus these rules:

- **Pack identity is `programme_key` + `pack_version`** (A.5): a pack names the **logical programme**
  it revises. `(subject, level, track)` is a hint, never an identity — two legitimate parallel
  programmes at the same subject/level/track must not be collapsed into one by the importer.
- **A pack never modifies a published programme (C5, normative):** the published programme version
  stays byte-for-byte unchanged; the import produces a **new version proposal** whose diff is visible
  *before* publication; the admin verifies and publishes; classes stay on their current version until a
  deliberate, audited reassignment (P12). The same rule applies to official **objectives**: no silent
  update of a published objective version.
- **Schema to offline installs:** new migrations ship inside `prisma/migrations/` in the offline
  package (`scripts/make-offline-package.mjs` already copies them). No network step.
- **Skipped versions:** a pack declares `pack_version` and, when it is a delta, `from_version`. The
  importer applies it only when the target logical programme is at `from_version`, otherwise it refuses
  with a clear message naming the versions. A pack marked `cumulative: true` may be applied to any
  earlier version. No silent "apply out of order".
- **Stable identifiers across export/backup/offline (C/§13.7):** `programme_key`, objective `code`,
  bloom keys and `pack_version` are the only identifiers the importer may rely on; internal `id`s are
  **not** portable across installs and are never used for matching. This must be stated in the pack spec
  and asserted by a round-trip test on a second, empty install.
- **Backup / restore / export:** add `programmes`, `programme_objectives`, `class_programme_assignments`
  (and the new objective columns) to the export and import store lists in
  `src/backend/routes/bulk.routes.js`; the existing dropped-rows report already reports anything
  refused, so a partial import cannot look complete. Restore preserves `programme_key` and version
  history; it never merges two logical programmes.
- **No internet, no AI:** import is deterministic validation + insert; dedupe is by normalised
  `programme_key` and stable external code; no model call anywhere on this path.
- **SaaS-only, marked optional and later:** cross-school pack catalogue, automatic pack updates,
  server-to-server sync. Explicitly deferred.

### Effort

L (pack format + importer + backup wiring + offline packaging check).

### Phase 1 code and tests that change

- `src/backend/routes/bulk.routes.js` (store lists + sanitizers + required fields).
- New pack importer (service + route) and a dry-run mode that reports what *would* change.
- `scripts/offline-lan-validation.mjs` / `make-offline-package.mjs` — verify a pack imports with no
  network (the repo already has offline verification scripts to extend).
- New tests: pack round-trip; **round-trip onto a second empty install relying only on `programme_key`/
  `code`/`pack_version`** (internal ids not portable); skipped-version refusal; cumulative pack; a pack
  against a published programme produces a version **proposal** and leaves the published version
  unchanged; backup export/import includes the new tables and preserves history; import works with the
  network unavailable.

---

## 9. Proposal P8 — Mode-by-role test matrix

Every row is a test to be written when the corresponding proposal is approved. "Local" = scope local
objective. "Official" = programme/objective official status.

| Role | Mode | Create/import programme | Publish official | Approve proposals | Create local objective | Coverage counts it? |
|---|---|---|---|---|---|---|
| Professor | Official programme | Allowed → `proposed` | No | No (403) | Yes | Only after admin publishes |
| Professor | Admin-defined | Refused (403) | No | No | Yes | Only after admin publishes |
| Professor | Teacher proposes / admin approves | Allowed → `proposed` | No | No | Yes | Only after admin publishes |
| Professor | Teacher-owned | Allowed → published, audited | Yes (own school's programmes) | No | Yes | Yes |
| Admin | any | Allowed | Yes | Yes | Yes | Yes once published |
| Admin | master switch off | 403 `FEATURE_DISABLED` | 403 | 403 | 403 | n/a (feature off) |
| Professor | any | — | — | — | — | Local objective never counts |
| Student | any | 403 | 403 | 403 | 403 | n/a |
| Cross-tenant ids | any | 404/403 | 404/403 | 404/403 | 404/403 | n/a |

Plus: a mode switch changes no recorded evidence, no criteria row, and no objective scope/version.

**Effort:** S (mostly extending `tests/integration/learning.routes.test.js` plus a matrix file).

---

## 10. Proposal P9 — Non-AI question-tagging path (offline-safe)

**Goal:** the tagging strategy must work offline with no AI.

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P9-A (recommended)** | (1) Manual classification exactly as Phase 1 today; (2) a CSV/TSV bulk file (`question_code, objective_code, bloom_key, weight`) with a dry-run diff, per-row validation and a refused-rows report; selection driven by the programme filtered to the class's subject | Deterministic, offline, auditable; the file format is the same on SaaS and offline |
| P9-B | Manual only | Usable but slow at scale; no bulk path for a big import |
| P9-C | AI suggestions (Phase 6) | Explicitly deferred and never authoritative; cannot be the only path |

### Recommended default

P9-A. AI suggestions remain the deferred Phase 6 item (`docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2,
§H.7) and are never required for any workflow.

**Effort:** M. **Code/tests:** CSV parser + validator (pure, unit-tested), a bulk classify endpoint
reusing `setCriteria`, a dry-run response shape, tests for rejected rows and for "works with no AI
config".

---

## 10A. Proposal P11 — Mapping provenance and the classification review queue

The reviewer's safeguard: a category is **not** equivalent to an objective (Fractions → comparing,
recognising, representing, ordering, equivalent, adding, word problems). Blind category-wide
classification would manufacture false pedagogy. P11 replaces "apply the default mapping" with a
reviewed pipeline.

### The pipeline (draft)

1. **Existing metadata** — subject / category / topic, as they are.
2. **Suggested mapping — a *provisional criterion mapping*** — deterministic, offline, explainable rules
   **scoped to a programme** (round-2 C4): the suggestion is a function of `(category, programme)`, not a
   universal property of the category, because the same category (Fractions) maps to different
   objectives in different programmes ("compare" vs "add" vs "equivalent"). A category may suggest one
   objective, several, or none. The suggestion is stored as a **provisional
   `QuestionAssessmentCriterion` row** — `source='suggested'`, `review_status='suggested'`. Round-3 C2:
   the round-2 wording claimed "a **suggestion is never a criterion**" while recording it in the
   criterion table, which is self-contradictory. The model chosen is **Option A — provisional rows in
   the existing table** — and the terminology everywhere is **"provisional criterion mapping"**: it
   *is* a criterion row, but a provisional, **non-reliable** one, excluded from question-mapped coverage
   and from Phase 2 evidence until a teacher confirms it.
3. **Review queue** — every question whose suggestion is uncertain (the programme suggests >1
   objective), conflicting (metadata disagrees with the suggestion), or unmapped (no category, or no
   suggestion in this programme) lands in the queue. Bulk-applied questions are not the goal; the queue
   is finite and visible.
4. **Teacher validation** — bulk approval of unambiguous rows, correction or individual review for the
   rest.
5. **Reliable pedagogical mapping** — only criteria with `review_status='confirmed'` and a non-AI
   `source` are eligible to become objective-linked evidence in Phase 2 (see the two-axes rules below).

### Two separate axes, not one (round-2 section D)

The round-1 proposal mixed three different ideas into one `source` enum (where the mapping came from,
how it was proposed, and whether it was validated). The round-2 review is right: split them. The
criterion row already has **two** fields — `source` and `review_status` — so no new field is needed.

| Axis | Field (verified against the schema) | Today | Target value set |
|---|---|---|---|
| **Provenance** — where the mapping originated | `source` | `manual` (default) \| `imported` | `manual` \| `imported` \| `suggested` \| `ai_suggested` *(reserved, deferred)* |
| **Review state** — whether it may be relied on | `review_status` | `approved` (default) \| `needs_review` | `unreviewed` \| `suggested` \| `confirmed` \| `rejected` |

### What the existing `approved` value really means (round-4 §2 — verified in the current code, and it changes the migration)

The earlier migration line `approved → confirmed` is **withdrawn**: it would fabricate a confirmation that never happened. Verified facts:

- `QuestionPedagogyService.setCriteria` (`:187`) writes `review_status: criterion.review_status === 'needs_review' ? 'needs_review' : 'approved'`. `approved` is therefore a **derived default** applied to every criterion written through the interactive classifier — **not** the record of a review action. No code path sets it as the result of a human confirmation.
- `src/shared/learning/pedagogy-validator.js` declares `CRITERION_SOURCES = ['manual','imported']` and `REVIEW_STATUSES = ['approved','needs_review']`; `src/shared/schemas/learning.schema.js:18` mirrors them. There is **no** `confirmed`, `suggested` or `rejected` value, and **no** criterion-level review action or route anywhere.
- The only real review **event** in the system is **question-level**: `setCriteria(…, { markReviewed: true })` stamps `Question.pedagogy_reviewed_at/by` (`#applyDerivedFields`, `:270-271`). It is a per-*question* stamp, shared by every criterion of that question.

Consequences:

- The target set gains **`unreviewed`**: `unreviewed | suggested | confirmed | rejected`. `confirmed` is reachable **only** by an explicit teacher confirm/adopt action; nothing derives it.
- The migration is honest and conservative: `approved` (default, never validated) → **`unreviewed`**; `needs_review` (flagged) → **`unreviewed`**, with the fact that it *was* flagged carried into the migration report. `source` values are unchanged (`manual` stays `manual`, `imported` stays `imported`).
- **Historical criteria therefore start with zero reliable mappings**: question-mapped coverage begins at **0** and rises only as criteria are explicitly confirmed — the same "adopt & verify" principle as P10's migration, not a silent promotion.
- The question-level `pedagogy_reviewed_at` stamp may **pre-select candidates** for confirmation in the review queue, but it must **never** grant `confirmed` automatically (new unresolved decision **U12**, §16.4).

### The confirmation operation and its audit record (round-5 §2 — explicit, because a question can carry several mappings)

- **Exactly one backend action writes `confirmed`.** `review_status='confirmed'` is set only by an explicit
  criterion-level confirmation — `confirmCriterion(user, criterionId, { note? })` (route
  `POST /learning/criteria/:id/confirm`), under the permissions of §13.5. **Nothing derives `confirmed`**:
  not the question stamp, not an import, not a category default.
- **The confirmation records, on the criterion row:** `reviewed_by = user.id`, `reviewed_at = now()` and,
  if supplied, a review note — i.e. the criterion-level **`reviewed_by`/`reviewed_at` columns that do not
  exist today** and must be added by an additive migration (the reviewer asks to *retain* them). Provenance
  (`source`) is **not** overwritten by review.
- **And it writes an audit event** `criterion.confirm` (actor, action, target = criterion id, school, time,
  `from → to` status), following the existing `criteria.set` audit convention
  (`QuestionPedagogyService.#audit`).
- **And it appends a `CriterionReviewEvent` row (round-7 §2 — the current state and the history are two
  different records).** The criterion row holds the **current** state (`review_status`, stamps, subject
  snapshot); the append-only **`CriterionReviewEvent`** table holds the **history** (`confirm` / `reject`
  / `reset`, `review_status_before → after`, actor, `at`, `weight`, `subject_id` +
  `subject_label_snapshot`). **Both are written in the same transaction**, and the event table is
  insert-only. Historical coverage (§6) reads the event stream as of a date; current coverage reads the
  row. Without the event stream a later *demotion* would silently rewrite a past report, which is exactly
  the round-7 §2 finding.
- **The event snapshots the mapping, not a pointer to it (round-8 §1).** Because `setCriteria` replaces
  criteria by delete-then-create and each row gets a **new uuid**, a replacement is a **different
  identity**: the event therefore carries `criterion_id` + `question_id` + the **exact objective version
  id** + `objective_key` + `bloom_dimension_id`/`competency_id`/`criterion_key`/`max_score` + the
  non-referential `subject_id`/`subject_label_snapshot` + `source` + `weight` (+ `weight_before`) +
  `action` + `event_seq` — with **plain columns or `Restrict` FKs only** (never `Cascade`/`SetNull`), so
  deleting a criterion, question or subject can never erase the history. Full field table and the
  reconstruction algorithm are in §6.
- **Every criterion has a genesis event (round-8 §3).** `setCriteria` now writes a **`created`** event
  (`null → 'unreviewed'`) in the same transaction as each insert, and writes a **`replaced`** event for an
  outgoing criterion **before** it is deleted — so no criterion's history is ever ambiguous and the
  legacy migration's "zero reliability" is **recorded**, not assumed (§6).
- **Rejection is an explicit action too:** `rejectCriterion` → `review_status='rejected'` with the same
  `reviewed_by`/`reviewed_at` and a `criterion.reject` audit event. `rejected` ≠ `unreviewed`: one was
  decided, the other was never examined.
- **Bulk confirm is that same action repeated — not a shortcut:** it writes **one audit row per criterion**
  and stamps **each** row's `reviewed_by`/`reviewed_at`. There is no "confirm all" that leaves rows
  unattributed.
- **The question-level stamp must never confirm criteria (the reviewer's round-5 §2 point).** A question
  commonly carries **several** criteria pointing at different objectives and Bloom dimensions, so reviewing
  the *question* does not validate each *mapping*. `Question.pedagogy_reviewed_at/by` may therefore only
  **pre-select candidates** for the queue (U12). Concretely, the current
  `setCriteria(..., { markReviewed: true })` stamps the question and writes `approved` on every row
  (`:187`, `:270-271`); under this proposal the question stamp is **decoupled** from criterion state and can
  never produce `confirmed`.
- **Re-classification inherits nothing.** `setCriteria` replaces the whole set (delete-then-create), so a
  `confirmed` row that is replaced is **gone**; its replacement starts `unreviewed` and must be confirmed
  again. (That replace is **non-atomic** today — Defect A — so it must become one transaction when
  implemented, or a confirmation can be lost mid-write.)
- **Confirmation, rejection and their audit rows are atomic (round-6 §2 — normative).** Each of
  `confirmCriterion` / `rejectCriterion` runs as **one transaction**: the subject re-check (§6, U13), the
  status change, the reviewer stamps (`reviewed_by`/`reviewed_at`) and the audit row
  (`criterion.confirm` / `criterion.reject`) **succeed or fail together**. A `confirmed` criterion must
  never be able to exist without its audit record. **This is not the current pattern**: today's `#audit`
  calls `auditSvc.log` **after** the write and **outside** any transaction
  (`QuestionPedagogyService.js:62-72`, called at `:199`, `:236`), and `PATCH /categories/:id` does the same
  (`categories.routes.js:78-79`) — so a state change without its audit row is possible today. The audit
  write must therefore **join the same transaction** (or be an outbox row written inside it).
- **Replacement is transactional too (round-6 §3 — normative).** `setCriteria` must be a single
  transaction — validate → subject check → replace → re-derive the caches → audit — so a mid-operation
  failure can neither leave a partial criteria set (Defect A) nor silently carry a confirmation across the
  replacement. Every inserted row starts `unreviewed`; nothing inherits `confirmed`. This is the same
  requirement §13.1A already places on Defect A, and it is a **precondition** of this workflow, not an
  optional polish.
- **Imported rows** reach reliability only through the trust procedure below **and** the round-5 §1 subject
  check at confirmation time.

Rules:

- **A confirmed deterministic suggestion keeps its provenance.** A `source='suggested'` row that the
  teacher accepts becomes `review_status='confirmed'` with `source` **unchanged** (`suggested`), plus the
  criterion's `reviewed_by` + `reviewed_at` recording the confirmer. Provenance is never overwritten by
  review.
- **Criterion-level review metadata does not exist today (round-3 P11 verification, verified in the
  schema).** `QuestionAssessmentCriterion` (1286-1312) has `source`, `review_status`, `created_by`,
  `created_at`, `updated_at` and **no `reviewed_by`/`reviewed_at`**. The only reviewer columns today are
  on `Question` (`pedagogy_reviewed_by`/`pedagogy_reviewed_at`, 264-268 — **caches**, per *question*,
  not per criterion) and on `LearningObjective` (`reviewed_by`/`reviewed_at`, the admin approver). So a
  criterion-level review history **must be added** (`reviewed_by` + `reviewed_at` on
  `QuestionAssessmentCriterion`, an additive migration) and, until it exists, the per-question
  `pedagogy_reviewed_*` cache must **not** be presented as the criterion's review record.
- **"Reliable" is an explicit allowlist of trusted pairs, not a single exclusion (round-3 P11):**
  - `manual` + `confirmed` → reliable.
  - `suggested` + `confirmed` → reliable (provenance retained).
  - `imported` + `confirmed` → reliable **only after** the import-trust procedure below has been applied
    and audited **by the backend** (never by a UI label or a field inside the imported file).
  - `ai_suggested` → **never** reliable automatically, whatever the review state.
  - any `review_status ≠ confirmed` → **not** reliable, so a provisional suggestion never counts.
  Only reliable criteria are eligible to become Phase 2 evidence.
- **An `imported` source is not self-certifying (D):** a file labelling its own data "official" must not
  be trusted. `source='imported'` earns `review_status='confirmed'` **only** after (i) the pack passes
  validation, and (ii) under a governance mode that permits direct publication, an authorised actor
  publishes it — or, under the stricter modes, an admin verifies it. The trust decision is recorded
  (actor + action), never inferred from the file.
- **AI:** `source='ai_suggested'` is reserved and always non-authoritative; it can only ever produce
  `review_status='suggested'`, and stays deferred to Phase 6 (P9).

### Options

| Option | Shape | Trade-offs |
|---|---|---|
| **P11-A (recommended)** | Keep the **two existing fields**: `source` = provenance (`manual` \| `imported` \| `suggested` \| `ai_suggested`), `review_status` = review state (`unreviewed` \| `suggested` \| `confirmed` \| `rejected`). Document the mapping of today's values (`manual` stays `manual`, `imported` stays `imported`; `approved`/`needs_review` → `unreviewed`, §10A above) and add `source`/`review_status` values as needed | No redundant field; the axes cannot contradict each other because each answers a different question; needs an enum/validation change + a data migration of existing values |
| P11-B | Extend only `source` (round-1 proposal) | Mixes provenance, method and state in one enum; cannot express "suggested by rule, confirmed by teacher" without losing one of the facts |
| P11-C | Add a third `provenance` field beside `source`+`review_status` | Three fields where two suffice; `source` and `provenance` would be redundant |

Recommended default: P11-A, and **only the allowlist pairs above count as pedagogically reliable**
(`manual|suggested|imported` **×** `confirmed`, with `imported` gated by the trust procedure, and
`ai_suggested` never reliable) — a rule Phase 2's evidence-quality evaluation will consume, and which
never implies mastery.

### Effort

S–M (enum + validation + migration of existing values + queue UI state).

### Phase 1 code and tests that change (if approved)

- `src/shared/learning/pedagogy-validator.js` (`CRITERION_SOURCES` + `review_status`), `learning.schema.js`,
  `QuestionAssessmentCriterion.source`/`review_status` value sets + **the new criterion-level
  `reviewed_by`/`reviewed_at` columns** (they do not exist today) + the explicit, conservative data
  migration (**`approved` → `unreviewed`, `needs_review` → `unreviewed`**, per the verified semantics
  above — **not** `approved → confirmed`).
- **The confirmation/rejection action** (`confirmCriterion`/`rejectCriterion` + route + permission +
  `criterion.confirm`/`criterion.reject` audit events + `reviewed_by`/`reviewed_at` stamps); the
  question-level `markReviewed` path is **decoupled** from criterion state and can never write `confirmed`.
- **The round-5 §1 subject check** at criterion write and confirm time (`subject(question)` resolved via
  category, compared with `objective.subject_id`), plus the migration report for pre-existing cross-subject
  rows (U13).
- The classification **UI** gains a "suggested / confirmed / rejected" state, the queue, and an
  "undetermined subject" state for questions with no resolvable subject; confirming keeps provenance and
  shows the confirmer.
- Tests: a suggestion can never persist as reliable without confirmation; **a question-level review stamp
  never confirms any criterion**; a question with criteria on different objectives confirms them
  individually; confirming a suggestion keeps `source='suggested'` and records the confirmer; a
  cross-subject criterion is refused at write/confirm time and, if legacy, excluded from coverage; a
  question with an undetermined subject contributes nothing; an `imported` file that claims official does
  not become reliable without a recorded trust decision; provenance survives re-classification; the queue
  is empty when everything is confirmed; `ai_suggested` rows are never reliable.

---

## 11. Consolidated: what changes in Phase 1 code and tests (if all proposals were approved)

| Proposal | Schema/migration | Services | Routes/permissions | Backup | Tests |
|---|---|---|---|---|---|
| P1 Programme | new models + `programme_key` + back-relations | `ProgrammeService` | programme routes | +3 stores | programme integration |
| P2 Versioning | `version`, `supersedes_id`, `published_at`, `scope`, `visibility` | immutability + publish + P2002 handling | — | sanitizer | version validator |
| P3 Modes | `learning.governance.mode` setting | preset resolver | flag payload | setting row | mode-by-role matrix |
| P4 Local/personal | `scope`, `kind`, `visibility` | visibility filters | — | sanitizer | local-not-counted |
| P5 Coverage | — | coverage service (as-of assignment) | coverage endpoint | — | exclusion + supersession tests |
| P6 Migration | additive migration (unassigned) | adopt-and-verify action | — | — | additive-migration test |
| P7 Packs | — | pack importer | import route | +stores | pack round-trip / skipped version / proposal-not-mutation |
| P9 Tagging | — | bulk classify | CSV endpoint | — | parser + dry-run tests |
| **P10 Identity/versioning** | `objective_key`, `version`, `supersedes_id`, `scope`, `visibility`, `derived_from_objective_id`; **replaces** the `(school_id, subject_id, code)` unique index with `(school_id, objective_key, version)` + `(school_id, subject_id, code, version)` | immutability + version-chain validator | — | sanitizer | pin-preservation + conservative-migration + no-row-lost-by-index-swap tests |
| **P11 Provenance** | `source` + `review_status` value sets (**`unreviewed` added**), **new criterion `reviewed_by`/`reviewed_at`** (+ `subject_id_at_confirmation`, round 6/U14), **new append-only `CriterionReviewEvent` table** — full mapping identity, genesis/`replaced` events, plain or `Restrict` refs only (round 7–8/U14), `Subject.status` for archival + `Question` archive state (round 7–8/U15), conservative value migration (`approved`/`needs_review` → `unreviewed`) | validator: reliability **allowlist** + **subject-consistency check**; **atomic** `confirmCriterion`/`rejectCriterion` with per-criterion audit **and an event row**; transactional `setCriteria` (now also writing `created`/`replaced` events); **relationship-wide in-use guard** across all five mutation paths; subject-archive instead of delete; **hard-delete refused once a confirmed mapping ever existed** | — | sanitizer (+`criterion_review_events`, archive-aware `subjects`/`questions`) | provisional-suggestion-never-reliable + allowlist + no-auto-confirm + **question-stamp-never-confirms** + cross-subject-refused + category-change reproducibility + audit-rollback + re-parenting + subject-deletion + **replaced-criterion history + deleted-question refusal + multi-event reconstruction + reclassification/archival** tests |
| **P12 Historized assignment** | `ClassProgrammeAssignment` (`valid_from`/`valid_to`, actor) | assign/move (transactional) + as-of-date queries | move endpoint | +store | move-preserves-history + overlap-rejected tests |

Nothing above touches `Result`, `ExamSession`, `Exam`, `Question` columns, or any evidence/mastery
concept.

---

## 12. Open questions for the owner (not decisions taken here)

1. `level`/`track`: free-text strings (recommended) or a school-managed catalogue?
2. Should a professor be able to import a programme for a subject they do not teach, or is import
   scoped to assigned subjects only?
3. Does a programme version bump need an explicit admin "adopt" per class (recommended, matches (e)),
   or a per-school auto-adopt setting?
4. Coverage denominator: all official published objectives of the programme (recommended) or only the
   ones linked to the class's subject?
5. Packs: is `cumulative` needed in v1, or is "must be exactly one version behind" enough?
6. Should the existing console Learning page become the programme/verification console, or should the
   legacy admin UI host all of it (the question-editor placement decision from the previous message)?

Questions 1–6 above are the ones the proposals in §2–§12 raise directly; the **consolidated** list of
**fifteen** unresolved owner decisions (**U1–U15**, including the questions above plus the
version-adoption, coverage-denominator, cumulative-pack, local-visibility, coverage-counting,
import-trust, legacy-reliability, subject-consistency, subject-reproducibility, subject-deletion and
roadmap/decision-register questions) is §16.4, with the reviewer's recommendations recorded in §17.6.
**All fifteen were answered by the owner on 2026-11-20 and are recorded in §19** (U6 deferred; U8 and U15
in principle); implementation remains unauthorized.

---

## 13. Response to the 13 points

Each point below is answered as a draft. Cross-references point to the proposals in §2–§12. Nothing
here is approved, and no code was written.

### 13.1 Point 1 — audit of the current Phase 1 implementation and documents

| Thing audited | Finding | Evidence |
|---|---|---|
| Six taxonomy tables | Exist and are populated by services; additive migration verified on a DB copy | `docs/PHASE1_COMPLETION_REPORT.md` §2, §5 |
| Five additive `Question` columns | Exist; `pedagogy_status` default `unclassified`; `pedagogy_reviewed_by` is a plain string, **not** an FK to `User` | `prisma/schema.prisma:264-268` |
| Flags | Default off by absence of a settings row; router-enforced | `LearningTaxonomyService.js:151-159`, `learning.routes.js:96-113` |
| Evidence/mastery | Absent, and nothing writes `Result`/`ExamSession`/`Exam` | `PHASE1_COMPLETION_REPORT.md` §4 |
| Automation | None: no AI, no suggestions table, no imports of learning rows beyond the generic backup path | `ADAPTIVE_LEARNING_ARCHITECTURE.md:435, 609, 822` |
| **Defect A** | `setCriteria` claims to be safe but **delete+create is not transactional**; an error mid-loop leaves a partial criteria set | `QuestionPedagogyService.js:159-205`, `:253-261` |
| **Defect B** | School-wide loaders cap at `SCHOOL_WIDE_LIMIT = 1000`, so validation/label maps **silently truncate** schools with >1000 objectives/competencies/prerequisites | `LearningTaxonomyService.js:55, 183-205` |
| **Defect C** | A competency hierarchy cycle is possible: only a self-parent check, no ancestor walk | `LearningTaxonomyService.js:548-604` |
| **Defect D** | The prerequisite **depth ceiling is not enforced on write** (`MAX_PREREQUISITE_DEPTH = 10` exists but only `findCycle` is called) | `prerequisite-validator.js:14, 84-146`; `LearningTaxonomyService.js:26, 690-766` |
| **Defect E** | Admin `updateObjective` bypasses the code-uniqueness pre-check, so a colliding `code` surfaces as a raw Prisma P2002 | `LearningTaxonomyService.js:306-351`, `:487-496` |
| **Defect F** | No coverage aggregation exists anywhere; "counts" are `count(*)` reads of `total` | agent audit of `PrismaRepository.js:207-217`; `console/pages/learning/index.js:35-48` |
| Documents | Architecture and ADR are current for Phase 1; ADR-0001 remains **Proposed**; the frozen spec was not modified | `docs/ADR-0001-*.md`, `docs/phase 01.md` |

Defects A–F are reported, not fixed. They are inputs to whichever of the proposals below are approved;
C–F would also need fixing for the new work to be trustworthy, and A is a data-integrity risk today.

#### 13.1A Defect disposition (reviewer-directed: classify, never drop)

The reviewer asked that the six defects be classified rather than all fixed at once. Proposed
disposition — a proposal, not an instruction:

| Defect | Priority | Proposed disposition | Where |
|---|---|---|---|
| A — non-transactional `setCriteria` (delete-then-create) | **High** (live integrity risk) | Fix **before relying on the classification system**; independent of the programme design. **Round-2 requirement (H):** the fix must be an **atomic transaction** — validate *then* replace inside one transaction, so an error can never leave a partial criteria set. (The round-1 wording offered "transaction *or* validate-then-insert-then-delete-old" as alternatives; the review requires the transaction, with validation *before* the replacement.) **Round-6 (§2/§3) extends this to the new actions:** `confirmCriterion`/`rejectCriterion` must be atomic **including their audit row** (a state change must never exist without its audit record), and the same transactional requirement is a **precondition** of the confirmation workflow | standalone fix, no dependency |
| — missing objective-version pin | **Critical** | **Resolved by the new design** — P10 (implicit pin through immutable rows). Not a "fix"; it is the architecture | §5A |
| B — school-wide loaders truncate at 1,000 | **High** | Fix **before bulk tagging / import / coverage** — all three enumerate objectives and would silently operate on a truncated set (H: must not silently truncate). Options: paginate the loaders, or replace map-based validation with targeted existence queries | Phase 1B hardening, before import |
| C — competency cycle validation | Medium–High | Fix **with the competency model revision** (same code being rewritten), not twice; **validated on write** (H) | Phase 1B, with P4/P10 |
| D — prerequisite depth not enforced on write | **High** | Fix **when the prerequisite write workflow is revised** — call `validatePrerequisiteGraph` (not only `findCycle`) **on write** (H) | Phase 1B, with prerequisites |
| E — admin updates bypass the code-uniqueness check | **High** | Fix **as part of objective governance/validation** — `updateObjective` runs the same pre-checks as `createObjective`, **retains the database unique constraint**, and handles the concurrent-write race by catching Prisma **P2002** and returning 409 (a pre-check alone does not survive concurrency — round-2 H) | Phase 1B, with P10 |
| F — no coverage aggregation | — | **Not a defect to fix; it is the new feature** (P5) | Phase 1B, P5 |

Round-2 integrity additions (H) applied across the design: **every publication, import, verification and
class-reassignment action must be auditable** (actor + action + time on the row or in the audit log);
`setCriteria` is atomic; objective code uniqueness keeps its DB constraint *and* handles P2002; school-wide
loaders never silently truncate; competency cycles and prerequisite depth are validated on write.

Consequence for sequencing: **A is the only defect that is both independent and a live integrity risk**,
so it is the one candidate for a standalone fix ahead of Phase 1B. B, C, D, E and F are deliberately
bundled into the Phase 1B work so the same logic is not implemented twice. None is removed from the
report, and the reviewer's priority column is reproduced as-is above.

### 13.2 Point 2 — exact limitations of the taxonomy models (+ the two link tables and the Question caches)

Scope note (round-2 correction): this section examines **five** models, not four — the four named in
the point (`LearningObjective`, `Competency`, `LearningPrerequisite`, `QuestionAssessmentCriterion`)
**plus** the two link tables (`LearningObjectiveCompetency`, `LearningPrerequisite`) and the `Question`
pedagogy cache columns, because the limitations are only meaningful in relation to each other. The rows
below state which is which.

| Model | What it has | What it does **not** have, and why that blocks the requirement |
|---|---|---|
| `LearningObjective` (1179-1215) | `subject_id`, `category_id?`, `parent_id?` (a **hierarchy** tree), `primary_bloom_dimension_id?`, `code`, `statement`, `order_index`, `status` (`proposed\|active\|rejected\|archived`), review columns; `@@unique([school_id, subject_id, code])` | No `version`, no `supersedes_id`, no `published_at`, no `scope` (official/local), no `programme_id`, no immutability, no `archived_at`, no external/stable import code, no `updated_by`. `parent_id` is *hierarchy*, not *versioning* — using it for versions would corrupt the tree. Admin can edit `active` rows in place, so (e) is unimplementable as-is |
| `Competency` (1218-1242) | `subject_id?`, `parent_id?`, `kind`, `code`, `name`, `status`; `@@unique([school_id, code])` — **school-wide, not per subject** | Same versioning/scope/programme gaps; no `order_index`; unique key is school-wide, so two subjects cannot reuse a code. Subject-less competency is transversal (by design) |
| `LearningObjectiveCompetency` (1245-1260) | `weight`, `is_primary`; `@@unique([objective_id, competency_id])` | No `updated_at`/`updated_by`; hard delete only; no validity window, so no history of "which competency set applied when" |
| `LearningPrerequisite` (1264-1281) | `strength`, `min_mastery_state` (a **string**), `rationale`; `@@unique([objective_id, prerequisite_objective_id])` | No `updated_at`/`updated_by`, no validity/version, no depth column; `min_mastery_state` names a mastery concept that does not exist yet (Phase 3), so it is a forward reference |
| `QuestionAssessmentCriterion` (1286-1312) | `objective_id`, `competency_id?`, `bloom_dimension_id`, `criterion_key`, `weight`, `max_score?`, `rubric_json?`, `source` (default `manual`; today `manual\|imported`), `review_status` (default `approved`; today `approved\|needs_review`), `created_by`; `@@unique([question_id, objective_id, bloom_dimension_id, criterion_key])`. **`id` is `@default(uuid())`, so `setCriteria`'s delete-then-create produces a *new identity* for a replacement — which is exactly why the round-8 review event must carry the criterion id rather than rely on the row** | **No objective-version pin.** If objectives become versioned (P2), a criterion silently follows whatever the objective row becomes — the recorded evidence would change under the student. This is the single most important limitation for (e). Also: **no criterion-level `reviewed_by`/`reviewed_at`** (only `created_by`), and the real value sets are **not** the `suggested\|confirmed\|rejected` set the round-2 draft assumed — P11 adds those values **plus `unreviewed`**, the `reviewed_by`/`reviewed_at` columns and the conservative value migration (§10A; `approved` is a derived default, so it migrates to `unreviewed`, never to `confirmed`) |
| `Question` (245-284) and `Category` (194-216) — **no subject consistency, and a mutable subject (round-5 §1 / round-6 §1, verified)** | `Question` has `category_id?`; `Category` has `subject_id?` (nullable, `onDelete: SetNull`) | **`Question` has no `subject_id` of its own**, so a question's subject exists only if its category resolves one. **Nothing enforces `subject(question) = objective.subject_id`**: `validateCriteriaSet` never sees the question's subject, so a criterion can link a French question to a Mathematics objective and be accepted (`QuestionPedagogyService.js:151-156`). Worse, the resolution is **mutable**: `CategoryUpdateSchema = CategoryCreateSchema.partial()`, so `PATCH /categories/:id` freely changes or nulls `subject_id` (`categories.routes.js:74-82`); a question can be re-parented (`question.schema.js:29,45`); and deleting a `Subject` nulls it (`onDelete: SetNull`). Coverage must resolve the question's subject, the backend must **add** the check at criterion write/confirm time (U13), and a **category-change policy + confirmation-time subject snapshot** is required for reproducibility (U14, §6) |
| `Subject` (225-243) — **no archival state, destructive delete (round-7 §3, verified)** | `id`, `school_id`, `created_by`, `name`, timestamps; `@@unique([school_id, created_by, name])` | **No `status`/`archived_at`**, so a subject cannot be archived — only deleted. And deletion is **destructive to history**: learning objectives cascade (`LearningObjective.subject` `onDelete: Cascade`, `:1200`; blocked by `Restrict` only where criteria reference them), while `Category` (`:209`), `Competency` (`:1233`) and `Course` (`:388`) subjects are silently set to NULL (a subject-scoped competency becomes transversal). A historical subject snapshot must therefore be **non-referential** (plain `subject_id` + label, or `Restrict`), never `SetNull` (U15, §6) |
| `Question` pedagogy columns (264-268) | `pedagogy_status`, `primary_bloom_dimension_id`, `pedagogy_reviewed_at/by`, `pedagogy_source` | Caches only; `pedagogy_reviewed_by` has no FK; no index on the review timestamp |

**Answer to point 2 in one line:** every model is a flat, school-scoped, non-versioned taxonomy row;
none of the four can express "official vs local", "which version", or "which programme", and the
criterion table cannot pin the objective version it was recorded against.

### 13.3 Point 3 — proposed Programme and curriculum architecture

Builds on **P1**, adding the curriculum layers:

- **Level** (a label such as a grade) and **Track** are attributes of a `Programme`, not tables (until
  a school needs a catalogue — open question 1).
- A **curriculum** is: `Subject` → `Programme` (per level/track, versioned) → ordered **official
  objectives** (via `ProgrammeObjective`) → optional **sub-objectives** (an official objective tree,
  or local children per (f)).
- The **question-bank `Category` tree stays as it is** — it answers "where does this question live?".
  The programme answers "what must a class learn, in what order?". They are linked, not merged:
  propose `Programme.category_id?` (a root branch it was authored from) so the existing outline can be
  used as a starting point, but **never** a shared lifecycle (that is option P1-C, rejected).
- Rejected alternatives are in P1 (programme on `Class`; programme as `Category`; programme as
  `Course`).

### 13.4 Point 4 — official vs local ownership and versioning

Builds on **P2** and **P4**. Proposed state machine (draft):

| Scope | States | Who transitions | Immutability |
|---|---|---|---|
| `official` | `draft` → `published` → `archived`/`superseded` | author (per mode) then verifier (admin) | Once `published`: content frozen. Any change creates `version+1` with `supersedes_id` |
| `local` | none (a local row is simply active) | its author | Freely editable by the author; never published, never counted |

Rules: a local objective may declare an official `parent_id` (f) but never becomes official by
promotion; a new official version never rebinds the class assignment, never re-points criteria, and
never retires a classification — moving a class to version N+1 is a separate, audited action (e) that
**closes one historized assignment and opens another** (P12), never an in-place update. Coverage counts
official objectives **that are members of the exact programme version assigned to the class** (P5) —
"official ∧ published" relative to the *assigned version*, not a global "not superseded" test (round-2
F). Local ownership/visibility/reuse is specified in **P4 (§5)**; the criterion-version pin is
**specified in P10 (§5A)**.

### 13.5 Point 5 — teacher and administrator permissions

Proposal: **add no role (g)** and add at most the permission strings that a real route enforces. The
architecture already states the rule ("creating a permission string that no route enforces would be a
false grant", `ADAPTIVE_LEARNING_ARCHITECTURE.md:3230`).

| Action | Proposed authority | Existing permission reused? |
|---|---|---|
| Import/author a programme (draft) | Teacher | `class.learning.classify` (widened) — or a new `class.learning.import` if you prefer explicitness |
| Verify/publish a programme | Admin | `school.learning.manage` |
| Approve/reject an objective proposal | Admin | `school.learning.manage` |
| Add a local objective/extension (f) | Teacher | `class.learning.classify` |
| Classify a question | Teacher (own questions), admin (any) | `class.learning.read` + `class.learning.classify` (as today) |
| Read taxonomy/coverage | Teacher and admin | `class.learning.read` / `school.learning.read` |
| Manage competencies, prerequisites | Admin | `school.learning.manage` |

Options: (1) reuse the four existing strings (recommended, smallest blast radius); (2) introduce
`class.learning.import` + `school.learning.verify` (cleaner audit story, two new catalog rows, must
ship with their routes). No head-of-department role exists or is added (g).

**Round-2 clarification:** whatever the option, **import, verification and publication are three
distinct, separately audited actions** — "professor imported" is not the same event as "admin verified"
and neither is "published". Each writes its own audit entry (actor, action, target version, time), so a
dispute can be resolved without inference. Under a mode that allows direct publication, the professor's
import may *be* the publication, but the audit still records it as a publication by that actor.

### 13.6 Point 6 — the class-to-programme relationship

Builds on **P12** (the historized assignment model that replaces the round-1 `ClassProgramme`).
Consequences to decide/record:

- `Class` has no `subject_id` today, so **the assignment is what gives a class its subjects** — a class
  with no assignment row has no curriculum and coverage is undefined (not zero) for it.
- **Coherence rules (round-2 §13.6):** a class's assignment `subject_id` must equal the programme
  version's `subject_id`; the assignment's `(class_id, subject_id)` must match a subject the class
  actually teaches (its `TeacherAssignment`s / class configuration); and the actor must hold the class
  or school permission for that subject. An assignment whose subject does not match the programme, or
  a duplicate `(class_id, subject_id)` open interval, is rejected.
- Parallel tracks are **separate classes** (a), so the roster tables and `TeacherAssignment` are
  untouched; there is no student-level enrolment table.
- (c) shared official programmes: many classes can point at one `programme_id`; an import by a second
  professor hits duplicate detection (by `programme_key`, A.5) and links the existing programme instead
  of copying it.
- Moving a class to a new programme version is an explicit, audited action (e) implemented as
  close-and-open in one transaction (P12); a bulk class-wide move is a separate proposal, not automatic.
- **History is never destroyed:** past assignments stay queryable, so a 2026 result is always
  interpretable against the 2026 programme version. The normative rule is *"a programme change affects
  future activities and never reinterprets past activities or results."*
- Deleting a programme version that any assignment references (past or present) must be blocked
  (`Restrict`) or require an explicit rebind — never `SetNull`, or coverage would silently vanish.
- **Class identity across years (round-3 C5.3):** `Class` has **no academic-year column** and is unique
  only on `(school_id, name)`, so a class can be renamed, and a name can be reused by a *different*
  class next year. The assignment therefore records `class_label_snapshot` + `school_year` alongside
  `class_id`, and history is read from that snapshot — never from the class's current name (P12, §5B).
- **Concurrency (round-3 C5):** at most one open assignment per `(class_id, subject_id)` is guaranteed
  by a partial unique index **plus** a single transaction, with a **409** on conflict — not by a service
  check alone (P12, §5B).

### 13.7 Point 7 — CSV import, validation and verification

Builds on **P7** and **P9**. Proposed pipeline (draft):

1. **Parse** — strict CSV/TSV, header row, UTF-8 with BOM tolerated, `;` or `,` auto-detected.
2. **Shape validation** — required columns: `programme_key, subject, level, track?, objective_code,
   objective_statement, bloom_key, order_index?`; optional `parent_objective_code,
   prerequisite_codes, competency_codes`. Length caps mirror the zod schemas (code ≤60, statement
   ≤1000).
3. **Referential validation** — subject exists in the school; `bloom_key` in the six; parent/prerequisite
   codes resolve **within the file or the existing programme**; competency codes resolve.
4. **Semantic validation** — acyclic prerequisites (reuse `findCycle` **and** add the missing depth
   check, Defect D); no duplicate `objective_code` in the file; no duplicate triple; weights (if
   present) sum to 1.
5. **Duplicate detection (c, revised round 2)** — match on the normalised **`programme_key`**, never on
   `(subject, level, track)` alone (A.5): if a published programme with the same `programme_key` exists,
   the import becomes an "update proposal" against it; a different `programme_key` at the same
   `(subject, level, track)` is a legitimate parallel programme and is created, not merged.
6. **Dry-run diff** — a report of create/update/skip/reject per row, with the same shape as the backup
   `dropped` block. Nothing is written until the dry run is accepted.
7. **Apply** — one transaction per programme version; idempotent by `(programme_key, pack_version,
   objective_code)`; re-running the same pack changes nothing. These three identifiers are **stable
   across export, backup and offline installs** (internal `id`s are not portable and are never used for
   matching — round-2 §13.7); a pack applied to a published programme produces a **version proposal**,
   never a silent mutation.
8. **Verification** — admin reviews the diff and publishes with one click (d); under the teacher-owned
   mode, the professor publishes directly and the action is audited (import, verification and
   publication are distinct audit events — §13.5).
9. **Offline** — identical, from a file. No network, no AI.

### 13.8 Point 8 — teacher-centred classification workflow

Draft flow, per question (in the legacy question editor, per the earlier placement decision):

1. The editor shows the class/subject context and the programme the class follows.
2. Objective picker is **pre-filtered** to that programme's published objectives (plus the teacher's own
   local ones), searchable by code and statement.
3. Bloom picker beside it; weight defaults to 1.0 with a running total.
4. "Save and next unclassified" keeps the teacher in the queue rather than bouncing to the list.
5. A **coverage-aware nudge**: "this objective has no question yet" — guidance, never a block.
6. Bulk mode: select many questions → assign the same criterion set → dry-run diff → apply (audited).
7. Nothing is auto-approved; `mark_reviewed` remains an explicit act.
8. **Several teachers on one official programme (round-2 §13.8):** each teacher's local extensions are
   their own rows (default `visibility='private'`, P4). Teacher A never sees teacher B's private
   extensions; the shared official programme view shows only official objectives, so two teachers'
   different local extensions do not conflict, do not merge, and never appear as curriculum for the
   other. A teacher may deliberately widen one extension to `class`/`school` to share it; even then it
   stays local, owned by its author, and excluded from coverage (P4).

### 13.9 Point 9 — efficient strategy for classifying the existing question bank

Options, then a recommendation:

| Option | What it is | Trade-off |
|---|---|---|
| Manual queue only | Teacher walks unclassified questions | Honest, slow at scale |
| **Programme-scoped deterministic suggestion (recommended)** | A non-AI rule scoped to `(category, programme)`: within a given programme, a category may suggest one or more objectives. A question in that leaf pre-selects the suggestion. The teacher confirms or changes it | Fast, offline, deterministic, auditable; needs a mapping that is **per programme** (not one global `Category.default_objective_id`, which is wrong when Fractions maps to different objectives in different programmes — round-2 C4) and a "confirm" step, never an auto-approve |
| Priority sampling | Classify first the questions used in published exams / most-used, then the long tail | Gets the highest-value coverage first; explicitly leaves the tail unclassified |
| CSV mapping (P9) | Bulk `question_ref, objective_code, bloom_key, weight` file | Fast for large banks; requires a stable question reference |
| AI pre-classification | Deferred to Phase 6 | Cannot be the only path; never authoritative |

Recommended combination: **deterministic suggestion → review queue → teacher confirmation → CSV for
volume → priority sampling**, i.e. the pipeline in **P11** (§10A), not a blanket category-wide
application. The category→objective suggestion is scoped to the **programme** (round-2 C4) and is a
*suggestion*: it pre-selects the picker and, where the category genuinely maps to one objective **in
that programme**, allows a fast confirm; where it could mean several objectives in that programme
(Fractions → comparing, ordering, equivalent, adding, word problems), the question goes to the review
queue instead. The rule is explainable ("this question is filed under Fractions, which suggests
M4-FRAC-1 in this programme — confirm, change, or leave unmapped"), every applied classification is
attributed to the teacher who confirmed it and carries its provenance (P11), and nothing is ever
auto-approved.

### 13.10 Point 10 — coverage vs mastery

**Coverage** counts *curriculum artefacts*, and it is **three separate measures** (round-3 §5), never
one number: **defined coverage** (official objective versions that are members of the exact assigned
programme version), **question-mapped coverage** (of those, the ones with at least one eligible,
reliable criterion pinned to that exact objective version), and **learning evidence / mastery** (student
evidence and objective-level mastery — Phase 2/3, not computed here). "Question-mapped" deliberately
does **not** say "evidenced" or "mastered": a programme can be well question-mapped while students still
struggle with its objectives. Coverage is a statement about the **material**, not about any student, so
it needs no student evidence and is available in Phase 1/1B and offline (F.5).

**Mastery** is a statement about a **student's** demonstrated performance, derived from evidence with
the D13 trust checks, computed under policy v1.1 (D4/D5), and it is Phase 3.

They must never be conflated: an objective can be 100 % covered and no student proficient, or a student
proficient on an objective the programme does not contain. Coverage must not be displayed as a student
score and must not feed the high-stakes gate. This restates the invariant *what is recorded ≠ what can
be proven ≠ what a teacher designates as formal* in its coverage form.

### 13.11 Point 11 — reconciling the roadmap and phase numbering

**Conflict found (needs an owner decision):** there are two different "Phase 5"s.

| Source | "Phase 5" means |
|---|---|
| `docs/PHASE5_REPORT.md` (2026-11-13) | Platform work: *Offline/LAN compatibility, SaaS readiness and security hardening* |
| `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2 | Adaptive work: *Pathways, groups and assignments* |

Also: `docs/PHASE0_*` and `docs/PHASE1_*` are adaptive-learning documents, so "Phase 0/1" reads
unambiguously, but "Phase 5" does not. Phase numbers 2, 3, 4, 6, 7, 8 are adaptive-only and consistent
between the architecture and the decision register (which is normative) — no other clash was found.
"Phase 9" appears once and appears to be a typo or a forward reference.

Options — first, how to end the collision itself:

| Option | How | Trade-off |
|---|---|---|
| **A (recommended)** | Keep the adaptive numbering and **prefix the platform documents** ("Platform Phase 5 — offline hardening"), with a canonical mapping table in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2 and a pointer at the top of `PHASE5_REPORT.md` | No renumbering of an approved roadmap; two words of disambiguation |
| B | Renumber the adaptive roadmap to avoid 5 | Breaks every existing reference, the decision register's gates and the accepted Phase 1 documents |
| C | Leave it | The ambiguity persists in every future conversation |

**Where the programme work fits:** a named sub-phase **"Phase 1B — Curriculum Programmes and
Coverage"** between Phase 1 and Phase 2, with its own gate (D15, first proposed in §13.12 and later
recorded as **open** in the decision register; its register wording was accepted on 2026-11-21, but its
substantive approval remains a gate). It is taxonomy-level work (P1–P5, P10, P11 need no student evidence),
it unblocks meaningful coverage before any student data exists, and it does not renumber the phases after it.

#### The reviewer's proposed roadmap naming (recorded as the target)

| Phase | Name | Decision gate as registered today |
|---|---|---|
| 1 | **Pedagogical Foundation** — Bloom, difficulty, objectives, competencies, question classification | D1, D2, D8 — **approved** |
| **1B** | **Curriculum Programmes & Coverage** — programmes, versions, official/local objectives, ownership, classes, imports, coverage | **D15 decided — substantively approved 2026-11-21 (F1); Phase 1B implementation still requires a separate explicit owner authorization** (D2 already approved) |
| 2 | **Learning Evidence Foundation** — trusted, traceable evidence from activities | D3, D7, D9 (direction), D10, D12, D13 |
| 3 | **Mastery Engine** — objective-level mastery, sufficiency, confidence, gaps | D4, D5, D6, D14 |
| 4 | **Learning Profiles & Insights** — individual profiles, teacher insights | none new (D4/D5/D6 in force) |
| 5 | **Personalized Learning Pathways** — resources, activities, courses, differentiated sequences | D11 |
| 6 | **Recommendations & AI Assistance** — recommendations, teacher-controlled AI | none new (D4/D5/D12 in force) |
| 7 | **Continuous Adaptation & Evaluation** — feedback loops, policy validation and refinement | D9, D12 in force; D8/D10 re-evaluation |
| — | **Platform hardening (offline/SaaS)** — separately named, takes **no** adaptive phase number | — |

**This naming conflicts with the documents as they stand, and the conflict must be settled, not
smoothed over.** The current normative roadmap (`ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2 and the
decision register §3) has eight adaptive phases:

| Today | Proposed target | Consequence of adopting the target |
|---|---|---|
| Phase 3 — Deterministic mastery **and profiles** | split into Phase 3 (mastery) + Phase 4 (profiles) | D4/D5/D6/D14 gate rows stay on mastery; a new "profiles" row is needed for the split phase |
| Phase 4 — **Resource mapping and blueprints** | folded into Phase 5 (pathways' resources) | the §N.2 statement "Phase 4 owns `LearningResourceMap`" and its gate row must be rewritten; Phase 2/4 contradictions already noted in `PHASE0_ARCHITECTURE_REVIEW.md` §C6 would need closing |
| Phase 5 — Pathways, groups and assignments | becomes Phase 5 — Personalized Learning Pathways | the *platform* `PHASE5_REPORT.md` must be renamed/offset ("Platform — Offline/LAN and SaaS hardening") to stop the collision |
| Phase 6 — Recommendations and interventions | becomes Phase 6 — Recommendations & AI Assistance | AI suggestions stay here; wording change only |
| Phase 7 — Analytics, adaptation and reporting | becomes Phase 7 — Continuous Adaptation & Evaluation | wording change; "analytics/reporting" would need a named home |
| Phase 8 — Hardening, retention, localization and rollout | becomes the separately named **platform hardening** milestone *only if option A is adopted later* | **Round-2 correction:** prefixing fixes the two "Phase 5"s but does **not** move the adaptive Phase 8 or its decisions. D8 (full-app RTL), D9 (final retention) and D10 (re-evaluation) **stay in the adaptive roadmap exactly where they are** until the register is explicitly revised. If the option-A rename is ever adopted, those three decisions need a **new named gate ("before pilot")** — but they are not moved by this revision, and no approved obligation may disappear in a renumbering |

**Round-2 correction (must not be smoothed over):** three separate things must stay distinct —

1. **Platform Phase 5** — offline/LAN, SaaS and security (`docs/PHASE5_REPORT.md`).
2. **Adaptive Phase 8** — hardening, retention, localization and rollout, carrying **D8, D9, D10** in the
   current roadmap.
3. The **future 7-phase target** (the reviewer's naming), which is a *target*, not an approved
   renumbering.

Prefixing the platform documents resolves (1) vs the adaptive numbering; it does **not** decide the fate
of (2). The migration table below must show, per old deliverable **and per decision**, where each is
preserved — a renumbering must never silently drop an approved obligation.

Second — having ended the collision by prefixing the platform docs (option A above), how far to go in
*this* revision:

| Option | How | Trade-off |
|---|---|---|
| **A — adopt the target now** | Renumber to the table above, rewrite the decision-register §3 gate rows, update ADR/architecture references | Cleanest long-term; touches the **normative gate table** and every cross-reference, so it is a documentation change that itself needs the owner's sign-off |
| **B (recommended now)** | Insert **Phase 1B** only; prefix the platform documents; record the 7-phase target above as the intended end state and the mapping table as the migration plan for it | Minimal churn with the same disambiguation outcome; the rename becomes one deliberate change later, not a side effect of this revision |
| C — leave it | — | The ambiguity persists in every future conversation |

Recommendation: **B now, A recorded as the target.** Either way the naming decision is the owner's, and
the platform/adaptive collision is the part that cannot be left implicit.

### 13.12 Point 12 — reassessing Phase 2 in light of the new foundation

> Historical review-round analysis. The D15 row subsequently entered the decision register; its wording was
> accepted on 2026-11-21 and D15 was **substantively approved** the same day (owner decision F1; U8 closed).
> See §20.5, §20.7 and `docs/PHASE0_DECISION_REGISTER.md`.

Phase 2 ("Evidence and activity attempts") currently gates on **D3, D7, D9 (direction), D10, D12,
D13** and delivers `LearningEvidence`, `LearningActivityAttempt`, `LearningActivityCriterion`,
`LearningSourceIngestion`, the D13 trust checks and the D14 designation capture
(`PHASE0_DECISION_REGISTER.md` §3; `ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2).

What the programme foundation changes for it (draft):

| # | New Phase 2 requirement | Why |
|---|---|---|
| 1 | Evidence and `LearningActivityCriterion` must **pin the objective version** (`objective_version_id` or `(objective_id, version)`) | Without it, mastery silently mixes versions after a curriculum revision — the same problem as §13.2's missing criterion pin. **Specified in P10 (§5A)**: pin by pointing at the immutable version row, plus `objective_key` for cross-version reporting |
| 2 | Evidence must record the **programme version** it was gathered under, plus the **class-programme assignment in force at the time** (or be explicitly programme-less), per the snapshot field list in §16.2 (round-3 C4) | Otherwise a class's coverage/mastery cannot be reconciled after a reassignment (P12). The assignment is historized (§5B), so "as of the activity date" always resolves — this is the snapshot B.6 requires. Note `programme_id` **is** a version in this model, so a separate `programme_version` column is not stored without a concrete reason |
| 3 | The D13 **teacher-attested path** must state whether an attested import carries a programme/version | Offline paper exams are attested per import (D13); the attestation should name the curriculum context |
| 4 | D14's `is_high_stakes` capture is unaffected, but a "formal exam" must be resolvable to a programme/objective for the gate to be meaningful | The gate needs objectives; objectives now come from programmes |
| 5 | A **new decision id** is needed for programme governance/versioning (propose **D15**, owner-approved before Phase 1B) | The register has no decision covering (a)–(h); adding them under D2 would overload an approved decision |
| 6 | Existing gate order is otherwise unchanged — no Phase 2 dependency is removed | Evidence still needs D13 and retention direction regardless of programmes |

Nothing here proposes to move Phase 2's gate or to start it.

### 13.13 Point 13 — documents updated as drafts only

| Action | File |
|---|---|
| Created, marked draft and not approved | `docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` (this file) |
| Created (WP7 deliverable) | `docs/PHASE1_COMPLETION_REPORT.md` |
| Updated with a WP7 section, a log entry and a pointer to this draft | `docs/PHASE1_PROGRESS.md` |
| **Not changed as of this snapshot** | `docs/phase 01.md` (frozen spec), `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md`, `docs/ADR-0001-*` (status remains **Proposed**), `docs/PHASE0_DECISION_REGISTER.md` |

This table records the document state at the time §13.13 was written; it is **superseded for later decisions and register changes by §§19–§20 and the current decision register**. No source code, schema or test was changed by that documentation round.

---

## 14. Proposed (unapplied) edits to the accepted documents

This section records the proposed documentary changes as of the review rounds when it was written; it is
not a current execution checklist. The D15 item was subsequently accepted and the register updated (§20.5).
Other items remain proposals unless a later disposition or separate authorized change is recorded.

1. `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2 — insert **Phase 1B — Curriculum programmes and
   coverage** between Phase 1 and Phase 2 (draft text: scope P1–P5, P10, P12; gate = new **D15**), and
   add a canonical phase-name mapping table that disambiguates the platform documents (Point 11
   option A).
2. Same file, §D.2 — add the `Programme` (+ `programme_key`/`version`), `ProgrammeObjective`,
   `ClassProgrammeAssignment` models and the new `LearningObjective` columns (`objective_key`,
   `version`, `supersedes_id`, `scope`, `visibility`, `derived_from_objective_id`) **as proposed**,
   marked "not in Phase 1". Include the **programme versioning model** explicitly (§5B/§2/§3) — not only
   the table names: logical programme vs version, identity `(school_id, programme_key, version)`.
3. Same file, §E.2 and §D.3 — require an objective-**version** pin on evidence and activity criteria,
   and require evidence to **snapshot the applicable programme version and objective versions** at the
   moment of the activity (Point 12 row 1; P10 forward contract; P12 B.6).
4. Same file, add the **five-distinct-things table** (§2) as a normative subsection so future work
   cannot conflate programme identity, programme version, objective identity, objective version and
   `ProgrammeObjective` membership.
5. Same file, **historized class assignment rules** (P12): the assignment table, non-overlap, the
   transactional audited move, and the normative sentence *"A programme change affects future activities
   and never reinterprets past activities or results."*
6. Same file, **governance modes and mode-switch rules** (P3/§4): the `learning.governance.mode` setting,
   the four presets, and the switch/when-stricter/when-looser table.
7. Same file, **local objective ownership/visibility/reuse** (P4/C): the `scope`+`visibility` table and
   the rule that local never becomes official and never counts for coverage.
8. Same file, coverage rules (P5/F): coverage is computed against the **assigned programme version**;
   supersession is relative to that version; publication must not silently shrink a denominator.
9. `docs/PHASE0_DECISION_REGISTER.md` — **historical proposal as of this review round:** add **D15 —
   Programme governance and objective versioning** with the gate "before Phase 1B", status *open*, and
   recommended default as per P2/P3/P4/P10/P12. The wording was later accepted and the row was recorded
   (see §20.5 and the register); D15 was subsequently **substantively approved** (owner decision F1,
   §20.7), so **U8 is closed**. **D8, D9 and D10 stay where they are**
   (adaptive Phase 8); this revision does not move them.
10. `docs/DATABASE.md` — programme tables, the assignment table, the additive objective columns, and the
    **versioning model**, once approved.
11. `docs/DATABASE.md` and `docs/DEPLOYMENT.md` (the backup/restore + offline package documentation) —
    import/export/restore of `programmes`, `programme_objectives`, `class_programme_assignments`; the
    dropped-rows report; that restore preserves `programme_key` and history; and a cross-check that the
    offline migration/restore path (`scripts/make-offline-package.mjs`,
    `scripts/generate-offline-bundle.mjs`) carries the new migration.
12. `docs/PHASE5_REPORT.md` — **title/header prefix** ("Platform — Offline/LAN and SaaS hardening"),
    with a pointer to the phase-name mapping table in item 1. This is the whole of the Phase-5
    disambiguation; it does not touch the adaptive roadmap.
13. **Audit/traceability documentation** — a subsection stating that publication, import, verification
    and class reassignment are distinct audited events with actor/action/target/time.
14. `docs/phase 01.md` — **no change proposed.** Phase 1 is closed by its completion report; the
    programme work is a new phase, not a Phase 1 scope change.

---

## 15. Final consolidated review

> **Historical snapshot:** this review answered the questions as of rounds 2–3. Later owner dispositions
> are recorded in §§19–§20 and the D15 register row; status language below must be read at the time of this
> review, not as current decision state.

Answers the reviewer's 13 verification questions against this draft, as revised in rounds 2 and 3
(§16–§17). "Yes" means the draft gives a concrete, implementable answer; "Open" means an owner decision
was still needed at that point; this review itself did not constitute approval.

| # | Question | Answer | Where |
|---|---|---|---|
| 1 | Does the data model preserve stable official programme and objective identities? | **Yes** — `Programme.programme_key` (logical) vs `(school_id, programme_key, version)` (version); `LearningObjective.objective_key` vs its immutable versions | P1 §2, P10 §5A, §16.2 |
| 2 | Is objective versioning handled without destroying historical meaning? | **Yes** — immutable published rows; criteria keep pointing at the version they were recorded against; `objective_key` carries cross-version meaning; nothing is re-pointed | P10 §5A |
| 3 | Can several programmes exist at the same level and subject? | **Yes** — several logical programmes (`programme_key`) coexist at the same `(subject, level, track)`; duplicate detection never merges them | P1 §2 (A.4/A.5) |
| 4 | Can a class follow exactly one programme per subject? | **Yes** — at most one open, historized `ClassProgrammeAssignment` per `(class_id, subject_id)`, non-overlapping | **P12 §5B**, §13.6 |
| 5 | Can teachers add local extensions without modifying official curriculum? | **Yes** — `scope='local'` (+ `visibility`) + `derived_from_objective_id`; local rows are never published, never counted, never editable by others | P4 §5 |
| 6 | Do all four governance modes use one model? | **Yes** — modes change *who authorises*, not the rows; one `learning.governance.mode` setting with four values over the same tables | P3 §4 |
| 7 | Can governance mode be switched without destructive consequences? | **Yes** — nothing is deleted or auto-published; a stricter switch queues published teacher rows for review; a looser switch auto-publishes nothing; evidence untouched | P3 §4 |
| 8 | Can programme packs be imported/exported offline, versioned, validated and recovered? | **Yes** — JSON packs identified by `programme_key`/`pack_version`; import never mutates a published programme (it proposes a new version); skipped versions refused; new tables in backup restore/export; offline files, no network, no AI | P7 §8, §13.7 |
| 9 | Can teachers realistically classify thousands of questions without AI? | **Yes** — deterministic suggestions (scoped per programme) + review queue + bulk confirm + CSV + priority sampling, with provenance/review state recorded; AI optional and deferred | P9 §10, P11 §10A |
| 10 | Does curriculum coverage work independently from student mastery? | **Yes** — coverage is a property of the assigned programme version and needs no evidence; mastery is Phase 3; never merged into one number | P5 §6, §13.10 |
| 11 | Does the Phase 1 migration preserve existing classifications and relationships? | **Yes for content and relationships** — additive only; existing objectives become `objective_key = id`, version 1, **`scope='unassigned'`**; every criterion keeps pointing at the same row; official status is re-established only by explicit verify/adopt (round-2 E) | P6 §7, P10 §5A |
| 12 | Is Phase 2 now built on a stable, version-aware objective model? | **Yes, once P10 and P12 are approved** — evidence and activity criteria must carry the objective-version pin + `objective_key`, and evidence must snapshot the applicable programme version and assignment | P10 §5A, P12 §5B, §13.12 |
| 13 | Are all proposed changes traceable to explicit owner decisions? | **Yes for (a)–(h)**, each mapped in §1; §16.4 preserves the pre-decision questions, while §19–§20 record later dispositions. D15 is recorded in the decision register, with substantive approval still open | §1, §16.4, §19–§20, §14 |

### What is deliberately *not* answered here

- Mastery thresholds and weights (D4/D5) — Phase 3, pedagogical approval, untouched.
- Whether the full 7-phase rename is adopted (§13.11, options A/B).
- Level/track as strings vs catalogue (§12 question 1).
- Any decision that the register marks as requiring explicit product/pedagogy/security approval.

### Implementation status

**Historical implementation snapshot from the initial review.** At that point the revision authorized no
schema change, migration, criteria migration, bulk tagging, import, coverage implementation, Phase 2,
mastery, AI, or defect fix; the owner later separately authorized Defect A/B, which are closed (§20.1).
Current status: there is **still no Phase 1B implementation authorization**. The recorded owner decisions
choose architecture but do not license code (§19.5–§19.6, §20.6). The draft's §14 is a historical list of
proposed documentary changes, not a current execution checklist. Rounds 5–8 accepted and refined design
proposals as recorded in §§17.13–§17.21; their own status statements are historical snapshots. On
2026-11-20 the owner approved twelve decisions outright, approved U8/U15 in principle, and deferred U6;
2026-11-21 G2/G3 wording was accepted, G4 owner choices were finalized (full wording adoption was pending
at that step — since **adopted**, owner decision E1; see §20.2/§20.7), and
D15 register wording was accepted and recorded (and D15 was then substantively approved, F1; U8 closed).
See the top status, §§19–§20 and the decision register.

---

## 16. Round 2 — accepted review findings and proposed corrections

The round-2 review endorsed the architecture **subject to** the corrections below, and stated the
governing principle: the programme version a class follows, the objective version a question
references, and the context in which a student did an activity must all be **historically traceable**,
because coverage, evidence, mastery, profiles and pathways rest on that foundation. All round-2 findings
are accepted into this draft. Status remains **DRAFT — AWAITING OWNER APPROVAL**.

### 16.1 Accepted findings → where they were applied

| Round-2 item | Finding accepted | Applied in |
|---|---|---|
| A. Programme identity/versioning | Add `programme_key`; identity `(school_id, programme_key, version)`; subject/level/track fixed across versions; several logical programmes may share subject/level/track; duplicate detection by `programme_key`, never `(subject, level, track)`; distinguish the five things; `ProgrammeObjective` binds objective **version** to programme **version** | §2 (P1), §3 (P2), §7 (P6), §8 (P7), §5A meaning 4 |
| B. Historized class assignment | Effective-dated assignment; record programme version, class, subject, dates, actor; no overlapping active assignment; audited move; normative "no retro-interpretation"; Phase 2 snapshots the context | **New §5B (P12)**, §13.6 |
| C. Local ownership/sharing | Teacher-private / class-shared / school-shared / personal-programme rules; local never official by sharing; local never counts for coverage; simplest model + explicit defaults; no new role | §5 (P4) |
| D. Provenance vs review state | Split provenance (`source`) from review state (`review_status`); reuse the existing fields; confirmed suggestion keeps provenance + records confirmer; unconfirmed never reliable; `imported` is not self-certifying; AI non-authoritative | §10A (P11) |
| E. Conservative migration | Do not assume legacy `active` = official published; migrate to `scope='unassigned'`, `published_at=null`; explicit adopt-and-verify; code uniqueness across versions; published rows immutable in the service | §5A (P10), §7 (P6) |
| F. Coverage vs supersession | Coverage computed against the exact **assigned** programme version; a globally superseded objective stays valid for an older version still in use; publication never silently shrinks a denominator; question-counting rules to fix | §6 (P5), §3 (P2) |
| G. Roadmap/documentation | Complete §14 (versioning, history, modes, import/export/backup, audit, offline/SaaS, `PHASE5_REPORT.md` prefix); **preserve Phase 8 (D8/D9/D10)**, do not imply they moved; keep Phase 1B-only as the recommendation, 7-phase target recorded | §14, §13.11 |
| H. Integrity reinforcements | `setCriteria` atomic transaction; code uniqueness keeps the DB constraint **and** handles P2002; loaders never silently truncate at 1,000; cycles/depth validated on write; every publish/import/verify/reassign audited | §13.1A, §2, §5A, §5B, §13.5 |
| §13.1/§13.2 terminology | The audit lists five models although the title said four; fix and state the scope | §13.2 |
| §13.8 sharing | Behaviour when several teachers share one programme with different local extensions | §13.8 item 8 |
| §13.7 identifier stability | Stability of `programme_key`/`code`/`pack_version` across export, backup and offline installs; internal ids not portable | §13.7 step 7, §8 (P7) |

### 16.2 Data-model relationship table

| Entity | Identity / key | Versioning | Key relations |
|---|---|---|---|
| Logical **programme** | `Programme.programme_key` (+ `school_id`) | stable across versions | owns many programme versions |
| **Programme version** | `Programme.id`; unique `(school_id, programme_key, version)`; `subject_id`, `level`, `track` **fixed across versions** | immutable once published; `supersedes_id` chain | → `ProgrammeObjective`; ← `ClassProgrammeAssignment` |
| **ProgrammeObjective** (membership) | `(programme_id, objective_id)` + `order_index` | membership row of a **programme version** × an **objective version** | programme version ↔ objective version |
| Logical **objective** | `LearningObjective.objective_key` (+ `school_id`) | stable across versions | owns many objective versions |
| **Objective version** | `LearningObjective.id`; unique `(school_id, objective_key, version)`; `scope` (official/local/unassigned), `visibility`, `published_at`, `supersedes_id`, `derived_from_objective_id`, `parent_id` (hierarchy only) | immutable once `published_at` set | ← `ProgrammeObjective`; ← `QuestionAssessmentCriterion`; ← local children |
| **Class-programme assignment** | `ClassProgrammeAssignment.id`; unique **open** row per `(class_id, subject_id)` via a **partial unique index** (`… WHERE valid_to IS NULL`) + non-overlapping `[valid_from, valid_to)` half-open intervals in UTC; `programme_id` = a **programme version**; `class_label_snapshot` + `school_year`; `assigned_by`/`assigned_at` | historized (append + close); never updated in place | class × subject × programme version; drives coverage. **The assignment names the programme version — the criterion never does** |
| **Local objective** | a `LearningObjective` row with `scope='local'`, `created_by` = owner | author-editable; never published | may have `parent_id` → official objective; **never** in a coverage denominator |
| **Personal local programme** | a `Programme` row with `kind='personal'` | author-only; never publishable | authored by one teacher; never in the verification queue |
| **Question criterion** | `QuestionAssessmentCriterion` unique `(question_id, objective_id, bloom_dimension_id, criterion_key)` | **pins an objective version** via `objective_id`; never re-pointed | question ↔ objective **version** only — **no programme on the criterion** (round-3 C3); `source` (provenance) + `review_status` (review state); criterion-level `reviewed_by`/`reviewed_at` are **proposed** (they do not exist today, §10A) |

**Reference chains (must remain answerable at any date):**

- **Question classification is programme-independent (round-3 C3):**
  `Question → QuestionAssessmentCriterion → LearningObjective (exact version)`. A criterion pins an
  objective **version**, never a programme. One objective version can be a member of several programmes,
  so the criterion alone **cannot** name a programme, and no programme field is added to it.
- **Programme context is resolved from the assignment, not the objective:**
  `Class → ClassProgrammeAssignment (as of the activity date) → Programme version → its objective versions`,
  with the membership row `ProgrammeObjective (programme version × objective version)` linking the exact
  objective version the criterion points at to that programme version. The same question used by classes
  on two different programmes therefore resolves to two different programme contexts **from the
  assignments** — the criterion is neither duplicated nor re-pointed (test **T28**).
- **Evidence snapshot (round-3 C4):** `Student Evidence → Activity → (question_id, criterion/objective
  version used, objective_key, programme version or explicit programme-less, class/subject context,
  ClassProgrammeAssignment.id where applicable, activity timestamp) → Mastery` (Phase 2/3). Field
  duplication is unnecessary where an immutable referenced row already preserves the value; what is
  required is that the evidence stays **resolvable after questions, criteria or assignments change**.
- **Coverage:** `Class → ClassProgrammeAssignment (as of the evaluation date) → Programme version →
  member objective versions → reliable criteria` (§6).

### 16.3 Test acceptance matrix

Each row is a test to exist when the corresponding proposal is approved. "Reliable" = P11's **allowlist**
(`review_status='confirmed'` with `source ∈ {manual, suggested, imported}` and `imported` gated by the
trust procedure; `ai_suggested` never reliable).

| # | Area | Scenario | Assertion |
|---|---|---|---|
| T1 | Version history | Publish objective v2 superseding v1; a criterion points at v1 | The criterion still resolves to v1's content; nothing is re-pointed; `objective_key` unchanged; v1 retained, not deleted |
| T2 | Version history | Two programme versions of one `programme_key`; changing `level` on v2 | Refused — `level`/`track`/`subject` are fixed across versions; a change forces a new `programme_key` |
| T3 | Version history | Several logical programmes at the same `(subject, level, track)` | All coexist; none is merged; each has its own versions |
| T4 | Imports | Import a pack for an existing published `programme_key` | Published version unchanged; a **version proposal** is produced; diff visible before publish; classes unmoved |
| T5 | Imports | Pack with a different `programme_key` at the same `(subject, level, track)` | Created as a parallel programme; **not** treated as a duplicate |
| T6 | Imports | Pack declaring `from_version` not equal to the target's current version | Refused with a message naming both versions; `cumulative:true` applies to any earlier version |
| T7 | Imports | Round-trip onto a **second empty install**, matching only on `programme_key`/`objective_key`/`code`/`pack_version` | Identical logical content; no reliance on internal ids (round-3: `objective_key` is included, not only `programme_key`/`code`/`pack_version`) |
| T8 | Coverage | Objective v1 superseded globally; class still assigned to the programme version that references v1 | v1 **still counts** for that class; denominator unchanged |
| T9 | Coverage | Publish a new programme version / new objective version, no reassignment | No existing class's denominator or evidenced count changes |
| T10 | Coverage | Local, unassigned, proposed, rejected, personal and different-programme-version rows present | **None** appears in a coverage denominator — they are **not members of the assigned version** (this is the corrected round-3 wording: *membership*, not "everything archived", is what excludes — see **T27**). Three measures are reported (defined / question-mapped / learning-evidence); no percentage is presented as a learning result |
| T11 | Classification provenance | Suggestion confirmed by a teacher | `source` unchanged (`suggested`), `review_status='confirmed'`, confirmer recorded; only then reliable |
| T12 | Classification provenance | `imported` file claiming "official" without a recorded trust decision | Not reliable; cannot be Phase 2 evidence until published/verified by an authorised actor |
| T13 | Classification provenance | `ai_suggested` row | Never reliable; can only ever be `review_status='suggested'` |
| T14 | Classification provenance | `setCriteria` fails mid-write, **and** two concurrent updates to the same question's criteria | **No partial criteria set** (atomic transaction) and no interleaving; prior state intact in both cases |
| T15 | Local objectives | Teacher A's private extension vs teacher B | A never sees B's; neither counts for coverage; widening to `class`/`school` widens reads only |
| T16 | Local objectives | Reuse of a shared local extension | Creates a new local row owned by the copier; still `scope='local'`; still excluded from coverage |
| T17 | Local objectives | Personal local programme | Author-only; never publishable; never in the verification queue; no new role/ permission added |
| T18 | Class reassignment | Move a class from programme v1 to v2 | One transaction; v1 assignment closed (history kept), v2 opened; audit row written; "as-of date" query resolves each date correctly |
| T19 | Class reassignment | A second active assignment for the same `(class_id, subject_id)` — sequential **and concurrent** | Rejected (overlap); under concurrency the partial unique index / transaction returns **409**; `Restrict` prevents deleting a referenced programme version |
| T20 | Class reassignment | Class's subject vs programme's subject mismatch | Assignment rejected (coherence rule, §13.6) |
| T21 | Offline backup/restore | Export then restore `programmes`/`programme_objectives`/`class_programme_assignments` | History preserved; `programme_key` preserved; two logical programmes never merged; partial import reports dropped rows |
| T22 | Offline/no-network | Pack import and coverage with the network unavailable and no AI config | Both succeed deterministically |
| T23 | Migration | Apply the new migration to a copy of the live DB | Content, relationships and counts **identical** (no row deleted or altered, and the unique-index swap loses nothing); every legacy row becomes `scope='unassigned'`, `published_at=null`; official coverage stays **zero** until adoption — the zero is *official coverage*, not a deletion of the content |
| T24 | Integrity | Admin update with a duplicate `code` under concurrent writes | 409 returned (P2002 handled); DB unique constraint retained; no raw error surfaces |
| T25 | Integrity | School with >1,000 objectives/competencies/prerequisites | No silent truncation in validation/label maps (loaders paginated or replaced) |
| T26 | Integrity | Competency cycle, prerequisite depth exceed, **objective-tree parent cycle**, **objective supersession cycle**, cross-key supersede | Each rejected on write; existing valid relationships left intact (T33) |
| T27 | Coverage (round-3 C1) | Class remains assigned to a published programme version containing objective O1/v1; O1/v1 is later superseded and archived | O1/v1 **remains in that class's denominator** — historical membership is not invalidated by current status |
| T28 | Coverage / reference chain (round-3 C3) | The same objective version is a member of two programmes and one question is used by classes on both | The criterion stays objective-version-specific (not duplicated, not re-pointed); each activity resolves its **own** programme context from its assignment |
| T29 | Evidence snapshot (round-3 C4) | The question's classification or criterion is changed after a student completes an activity | Historical evidence still resolves to the criterion/objective version **used at completion** |
| T30 | Reassignment concurrency (round-3 C5) | Two concurrent reassignment requests for the same `(class_id, subject_id)` | At most one succeeds; the other gets **409**; no overlapping or duplicate open assignments exist |
| T31 | Published membership | Modify the membership of a published programme version | Refused; a **new version** is required (published versions immutable) |
| T32 | Shared objective version | One objective version is reused by several published programmes; the objective is then updated | Both memberships remain valid; updating creates a **new version** and silently changes neither programme |
| T33 | Cycles (round-3, expands T26) | An objective `parent_id` cycle or a supersession cycle is written | Rejected on write; pre-existing valid relationships untouched |
| T34 | Code policy (round-3 §4) | Two distinct `objective_key`s attempt to use conflicting codes — sequentially and concurrently | Policy enforced consistently (`(school_id, subject_id, code, version)` + service rules); concurrent collision returns **409** |
| T35 | Publication-time eligibility (round-4 §1) | Publish a programme version containing a member objective that is not `official`+published at that instant | Publication **refused**, the offending members named; nothing is published |
| T36 | Frozen membership (round-4 §1) | An objective is published **after** the programme version was published; try to add it to that version | Refused — membership is frozen; a **new programme version** is required; no existing class's denominator changes |
| T37 | Distinct counting (round-4 §3) | Duplicate membership rows for one objective version; two versions of one `objective_key` in one programme version; duplicate rows arriving from a hand-edited restore | Refused by `@@unique([programme_id, objective_id])` and the one-version-per-`objective_key` validator; a restore that still carries duplicates makes coverage count each objective version **once** |
| T38 | Parent/child independence + predicate edges (round-4 §4) | Parent without questions while its child has questions, then the reverse; a criterion with `weight = 0`; a provisional (`unreviewed`/`suggested`) criterion; a deleted question | Parent and child each count **only** for their own reliable, `weight > 0` mappings (no roll-up, no roll-down); an unreliable or zero-weight criterion maps nothing; a deleted question contributes nothing |
| T39 | Subject consistency in coverage (round-5 §1) | A criterion links a **French** question to a member **Mathematics** objective of the class's assigned programme; a legacy row of this shape predates the new write-time check | The criterion contributes **nothing** to Mathematics coverage (query tests `subject(q) = S`); once the check exists it is **refused at write/confirm time**; legacy rows are quarantined in the migration report, not auto-rewritten (U13) |
| T40 | Undetermined-subject question (round-5 §1) | A question with no category, and a question whose category has no `subject_id`, each carrying a reliable criterion on a member objective | Both contribute **nothing** to any subject's coverage (an undetermined subject is not a wildcard); the coverage UI labels them "subject undetermined", never covered |
| T41 | Confirmation is explicit and audited (round-5 §2) | A question with several criteria on different objectives: confirm the question (`markReviewed`); then confirm one criterion; then let `setCriteria` replace the set | The question stamp writes **no** `confirmed`; the explicit confirm sets `review_status='confirmed'` + `reviewed_by`/`reviewed_at` + one `criterion.confirm` audit row; a replaced (confirmed) criterion is **removed** and its replacement starts `unreviewed` |
| T42 | Category subject changed after criteria were confirmed (round-6 §1) | A question in a Mathematics category has a `confirmed` criterion on a Mathematics objective; the category's `subject_id` is then changed to French (via `PATCH /categories/:id`) | Under the recommended policy the change is **refused** (the category is in use); if an authorised reclassification proceeds, already-reported coverage is **reproduced from the criterion's confirmation-time subject snapshot** and the affected rows are listed in the report — coverage never changes silently |
| T43 | Category subject set to NULL / `Subject` deleted (round-6 §1) | After confirmation, `Category.subject_id` is set to `null`, or the `Subject` row is deleted (`onDelete: SetNull` sets it to NULL) | Confirmed rows keep their snapshot and are reported as **diverged** from the live category; provisional rows become **undetermined** and are excluded + reported; **new** confirmations for those questions are blocked until the subject is restored (U13) |
| T44 | Audit failure during confirm/reject (round-6 §2) | The audit write fails (or is made to fail) during `confirmCriterion` / `rejectCriterion` | The whole operation **rolls back**: no `review_status='confirmed'`/`'rejected'` row and no reviewer stamp without its `criterion.confirm`/`criterion.reject` audit row — and no audit row without the state change |
| T45 | Replacement mid-failure + no inherited confirmation (round-6 §3) | `setCriteria` fails part-way through the replace; and a set containing a `confirmed` row is replaced | No partial criteria set survives (single transaction); the replacement rows start **`unreviewed`**; the previous confirmation is not transferred and the cache re-derivation is consistent |
| T46 | Subject-consistency report (round-6 §1) | A school holds cross-subject criteria (U13) and questions whose subject is undetermined, plus categories whose subject diverged from a criterion snapshot | The consistency verifier lists all three classes (quarantine report), names the affected questions, and **never** rewrites data; the report is the only mechanism by which inconsistent history becomes visible |
| T47 | Question re-parenting changes the resolved subject (round-7 §1) | A Mathematics question with a `confirmed` criterion is re-parented (`PATCH /questions/:id` → French `category_id`) | Refused (relationship guard, in-use question) or routed through the audited reclassification migration; the resolved subject never changes silently; if an authorised migration proceeds, past numbers stay as reported (T49) |
| T48 | Subject deletion (round-7 §1/§3) | `DELETE /subjects/:id` for a subject referenced by an in-use category, and for one whose objectives carry criteria | Refused — the subject must be **archived**; the destructive cascade to `LearningObjective` (`onDelete: Cascade`) is not reachable while criteria/history reference the objectives; `Category`/`Competency`/`Course` subjects are **not** silently nulled |
| T49 | Historical vs current coverage after a demotion (round-7 §2) | Confirm a criterion at D0 (counted), then run an authorised reclassification that demotes it at D1 | At a date ≤ D1 the criterion still counts (**historical** coverage from `CriterionReviewEvent`, latest event ≤ D); at ≥ D1 it does not (**current** coverage); the two numbers differ by design, and the past report does not move |
| T50 | Historical identity survives subject archival; deleted questions (round-7 §2/§3) | Archive the subject of a confirmed mapping, then attempt to hard-delete a question carrying a confirmed criterion | The snapshot survives archival (non-referential `subject_id` + label, or `Restrict`), so the historical mapping stays resolvable; hard-deleting a question with confirmed criteria is **refused** (archive instead) — until a question-archive state exists, historical coverage is reproducible only for questions that still exist |
| T51 | Out-of-band relationship change (round-7 §1) | A direct database edit (or a hand-restored backup) changes `Category.subject_id` behind the service layer | The consistency verifier **detects and reports** the violation with the affected questions; it does not claim to prevent it (no trigger exists today; a raw-SQL trigger would be documented drift) and never auto-repairs |
| T52 | Criterion replaced after the evaluation date (round-8 §1/§3) | `Q1 → O1` is confirmed, then replaced by `Q1 → O2`; historical coverage is requested for a date **before** the replacement, and current coverage after it | Historical at the earlier date still counts **`Q1 → O1`** (the event carries the original `criterion_id` + `objective_id`); current counts `Q1 → O2`; the replacement event is present and the outgoing criterion's row deletion does not remove history |
| T53 | Question deleted after its criterion was reset (round-8 §2) | A question had a confirmed mapping, the criterion was then reset/replaced (no *currently* confirmed criterion), and `DELETE /questions/:id` is attempted | Deletion is **refused** — the "ever contributed a confirmed mapping" test triggers (any `confirm` event) — and archival is required; the pre-reset report remains reproducible |
| T54 | Multiple confirm/reject/reset events on one criterion (round-8 §3) | Confirm at D1, reject at D2, confirm again at D3; coverage requested at several dates, including exactly at an event instant | Each date resolves to the **latest event with `at ≤ D`** (inclusive, `event_seq` tie-break): counted / not counted / counted again; results are deterministic and no date is ambiguous |
| T55 | Historical coverage across a subject reclassification + archival (round-8 §3/§4) | A subject is archived (not deleted) and a mapping is reclassified; coverage is requested before and after; a new programme version is proposed against the archived subject | The pre-reclassification number is **unchanged** (event stream + snapshots), the post number reflects the reclassification, archiving deletes nothing, and publication against an **archived** subject is **blocked** (U15) |

### 16.4 Unresolved owner decisions (consolidated)

**Answered by the owner on 2026-11-20 — see §19.** This table is retained as the **pre-decision** record
so the questions, their options and the reviewer's recommendations stay traceable; it consolidates §12
and the questions raised by the reviews:

| # | Decision | Options / current recommendation |
|---|---|---|
| U1 | `level`/`track`: free-text strings or a school-managed catalogue? | free-text strings (recommended) |
| U2 | May a professor import a programme for a subject they do not teach? | scoped to assigned subjects (leaning) vs any subject |
| U3 | Version bump adoption: explicit per-class adopt vs per-school auto-adopt? | explicit per-class (recommended, matches (e)) |
| U4 | Coverage denominator: all official published objectives of the assigned programme version, or only those linked to the class's subject? | all of the assigned version (recommended) |
| U5 | Packs: is `cumulative` needed in v1? | "exactly one version behind" may suffice |
| U6 | Console: programme/verification console on the Learning page, or in the legacy admin UI (question-editor placement)? | open (previous message) |
| U7 | Adopt the future 7-phase naming now (option A) or record it as a target and insert Phase 1B only (option B)? | **B (recommended)** |
| U8 | Record **D15** in the decision register? | **Pre-decision record:** proposed; owner-only. Later status: wording accepted and recorded (§19.1, §20.5; decision register); D15 was then **substantively approved** the same day (F1) and **U8 is closed** (§20.7). |
| U9 | Local objective visibility defaults: `private` (recommended) vs `class`/`school` for some kinds? | `private` |
| U10 | **UNRESOLVED — not decided by §6.** Question-counting rules for coverage: the `weight > 0` clause, deleted vs (non-existent) archived questions, exam-used vs unused, independent parent/child counting, distinct-objective de-duplication, **and how an *archived* question (round-7/§8) affects *current* coverage** | §6 states the *proposed* rules; the owner must confirm them **explicitly** (round-4 §6 / round-8 §2) |
| U11 | Trust rule for `imported` official packs — is an authorised publisher's action sufficient, or does a stricter mode require an admin every time? | mode-dependent (recommended) |
| U12 | **Legacy criterion reliability (round-4 §2):** may a legacy criterion be auto-promoted to `confirmed` from the per-*question* `pedagogy_reviewed_at` stamp, or only by an explicit confirm/adopt? | explicit confirm/adopt only (recommended); legacy `approved`/`needs_review` migrate to `unreviewed`, so historical reliability starts at zero |
| U13 | **Subject consistency (round-5 §1):** should the backend **hard-block** cross-subject criterion writes/confirmations (recommended), or only warn and exclude them from coverage? And what happens to **pre-existing** cross-subject rows (the check is absent today, so they may exist)? | hard-block at write+confirm (recommended); pre-existing rows quarantined and reported, **never** auto-rewritten |
| U14 | **Historical subject reproducibility (round-6 §1, extended in round-7 §1–§2 and round-8 §1/§3):** how is question-mapped coverage kept reproducible when the resolved subject can move — (a) immutability guard on the **relationship** `Question → Category → Subject` across **all five mutation paths** (category subject, question re-parenting, subject deletion, category deletion, import/bulk/restore), (b) a confirmation-time subject snapshot on the criterion, (c) an append-only **`CriterionReviewEvent`** review history — with the **complete mapping identity** and a **defined reconstruction algorithm** — or a combination? | **all three** (recommended): guard the relationship + snapshot at confirmation + event stream carrying the full mapping identity, genesis events for every criterion, and the `latest event ≤ D` reconstruction rule; current coverage reads the row, historical coverage reads the events as of the date |
| U15 | **Subject identity across deletion (round-7 §3, extended in round-8 §2/§4):** may a `Subject` referenced by an in-use category or by historical learning records be hard-deleted (today it **cascades `LearningObjective`** and nulls `Category`/`Competency`/`Course`), or must subjects be **archived** instead? Is the historical subject identity a **non-referential snapshot** (`subject_id` + label, not an FK) or an FK with `onDelete: Restrict`? Should **archived questions** (required for any question that **ever** contributed a confirmed mapping) be a first-class state? | **archive subjects** (additive `Subject.status`/`archived_at`; deletion refused while referenced; always preserves identity, deletes nothing, never changes historical coverage, blocks new publication against an archived subject) **and** store a non-referential identity snapshot; **question archival instead of hard delete** for any question with a historical confirmed mapping |

### 16.5 Change report

**Sections modified in that round-2 revision** (historical change report; all documentation only):

| Section | Change |
|---|---|
| Header / §0.1–0.2 | Status set to **DRAFT — AWAITING OWNER APPROVAL**; revision-2 note; content-labelling key; sequencing notes round 2 |
| §0.5 | Round-2 review entry (accepted subject to corrections) |
| §2 (P1) | `programme_key`; identity `(school_id, programme_key, version)`; subject/level/track fixed across versions; several logical programmes; duplicate detection revised; **five-distinct-things table**; new option P1-E rejected; tests |
| §3 (P2) | Coverage clause moved to P5 (assigned version); code uniqueness across versions; published-row immutability in the service; P2002; versions in programme context |
| §5 (P4) | New local ownership/visibility/reuse table + rules; `visibility` column; defaults; tests |
| §5A (P10) | Conservative migration (`scope='unassigned'`, `published_at=null`); adopt-and-verify; P2002/immutability; membership binds objective version to programme version; tests |
| **§5B (P12)** | **New proposal** — historized class-programme assignment (options, non-overlap, audited move, normative sentence, Phase 2 snapshot) |
| §6 (P5) | Coverage against the assigned version; supersession rules; denominator protection; question-counting rules |
| §7 (P6) | Conservative migration (no invented official provenance); P6-B rejected |
| §8 (P7) | Pack identity by `programme_key`; import never mutates a published programme; identifier stability; stores renamed to `class_programme_assignments`; tests |
| §10A (P11) | Split `source` (provenance) vs `review_status` (review state); confirmed-suggestion rule; imported-not-self-certifying; AI non-authoritative; tests |
| §11 | Consolidated table rows updated; P12 row added |
| §13.2 | Terminology/scope fixed (five models + link tables + Question caches) |
| §13.4 | Coverage wording → P5; assignment move wording → P12 |
| §13.5 | Import/verification/publication as distinct audited actions |
| §13.6 | Coherence rules; history; normative sentence |
| §13.7 | Duplicate detection via `programme_key`; identifier stability |
| §13.8 | One programme, several teachers with different local extensions |
| §13.1A | Round-2 integrity reinforcements (atomic `setCriteria`, P2002, loaders, on-write validation, audit) |
| §13.9 | Suggestion scoped to `(category, programme)`, not a global category default |
| §13.11 | Phase 8 (D8/D9/D10) preserved; three-things distinction; name-only target |
| §14 | Completed list of proposed documentation edits (14 items) |
| §15 | Implementation status reasserted as frozen / DRAFT — AWAITING OWNER APPROVAL |
| §16 (new) | This round-2 section |
| §18 | Change log (renumbered; §17 was added in round 3) |

**Remaining assumptions** (still to be challenged):

1. `level`/`track` remain free-text until the owner decides otherwise (U1).
2. A school manages its own official curriculum; cross-school sharing stays out of scope (SaaS-only, later).
3. Phase 2 evidence will be able to carry the programme/objective version snapshot; the P10/P12 contracts
   are stated as requirements, not implemented.
4. "Reliable criterion" = `review_status='confirmed'` ∧ non-AI `source` — pending confirmation that these
   are the exact existing `review_status` values.
5. `ClassProgrammeAssignment` non-overlap is enforced in the service (SQLite/Prisma cannot express an
   exclusion constraint) and asserted by tests.
6. No new role and at most the permission strings already listed; nothing installed.

---

## 17. Rounds 3–8 — review corrections requested and applied

Round 3 (the reviewer's "final validation") **accepted the architecture direction** and the P10-A /
P12-A / P11-A options (asking that they not be reopened), and **withheld approval** until its
corrections were made. Round 4 was a scope-limited owner-requested follow-up (§17.7–§17.9). Round 5
reviewed **§6 alone**, **accepted P5 conceptually** and asked for two precision corrections
(§17.10–§17.12). Round 6 **accepted both** and added a category-history policy plus two atomicity
requirements (§17.13–§17.15). Round 7 **accepted round 6** and extended the guard to the whole
relationship, introduced the criterion review-history mechanism and the subject-archival policy
(§17.16–§17.18). Round 8 **accepted round 7** and completed the historical model — the event's mapping
identity, the reconstruction algorithm, historical-confirmation deletion protection and the archival
guarantees (§17.19–§17.21). Everything is documentation-only and applied in place; nothing is implemented,
approved or authorised. Status remains **DRAFT — AWAITING OWNER APPROVAL**.

### 17.1 The five critical corrections (C1–C5)

| # | Correction requested | What was wrong | Applied in |
|---|---|---|---|
| C1 | Resolve the T8/T10 contradiction: eligibility must come from the **immutable membership of the exact assigned programme version**, not from an objective's *current global* status | T10 excluded "archived" categorically while T8 kept a superseded objective for an in-use older version — a still-assigned class's denominator could silently shrink | **§6** (eligibility = historical membership; three measures); new test **T27** |
| C2 | Do not claim a suggestion is "never a criterion" while storing it in the criterion table | The round-2 wording was self-contradictory (`source`/`review_status` are criterion columns) | **§10A** — Option A chosen and named **"provisional criterion mapping"**: it *is* a criterion row — provisional and non-reliable — excluded from coverage and Phase 2 |
| C3 | Correct the reference chain: an objective may belong to several programmes, so the criterion cannot name one | `Question → … → Programme` implied a criterion resolves a single programme | **§16.2** — classification is programme-independent (`Question → criterion → objective version`); programme context resolves from the **assignment/activity**; new test **T28** |
| C4 | Strengthen the Phase 2 evidence snapshot contract | "record the programme (and version)" was too loose to survive a later re-classification | **§5A**, **§5B**, **§16.2** — explicit snapshot field list; `programme_id` **is** a version (no duplicate column without a reason); new test **T29** |
| C5 | Strengthen P12's non-overlap rule against concurrency; define the interval, its timezone/boundary and class identity across years | A service check alone cannot stop two concurrent opens; and `Class` has no academic-year column | **§5B**, **§13.6** — partial unique index + single transaction + **409**; UTC half-open interval, boundary assigned to the new interval; `class_label_snapshot` + `school_year`; new tests **T19**, **T30** |

### 17.2 Corrections to the acceptance matrix

Added **T27–T34** (§16.3): historical archived objective retained (T27); one objective version in two
programmes with the same question (T28); classification changed after completion (T29); concurrent
reassignment (T30); published-membership modification refused (T31); shared objective version not
silently changed (T32); objective parent/supersession cycles (T33); objective code policy enforced,
including under concurrency (T34). Clarified **T7** (portable identifiers include `objective_key`),
**T14** (failed *and* concurrent criteria update), **T19** (sequential *and* concurrent), **T23**
(content and relationships preserved even though official coverage starts at zero) and **T26**
(objective-parent and supersession cycles, not only competency cycles and prerequisite depth).

### 17.3 P10/P11/P12 specifics the reviewer asked to be exact

- **Objective codes (P10).** Exact constraints: `@@unique([school_id, objective_key, version])` and
  `@@unique([school_id, subject_id, code, version])`, **replacing** `(school_id, subject_id, code)`;
  `code` identical across versions of one `objective_key`; first version always `1`; a code never
  reassigned to a different logical objective; a code change is explicit and history keeps the old code
  (§5A). Note the migration is therefore **not purely additive** (an index is replaced) even though no
  column changes.
- **Reliable-criterion predicate (P11).** Replaced the "non-AI exclusion" with an explicit **allowlist**
  (§10A), and **verified in the schema** that `QuestionAssessmentCriterion` has **no**
  `reviewed_by`/`reviewed_at` today (the reviewer asked this be checked: those columns are `Question`
  caches and a `LearningObjective` field), so criterion-level review metadata is part of the proposed
  change, not an existing field.
- **Class assignment history (P12).** Added the timezone/precision rule (UTC, half-open), the exact
  boundary behaviour (the new interval owns the boundary instant), and the academic-year caveat: `Class`
  is unique on `(school_id, name)` only, so the assignment snapshots the class label and school year
  (§5B).

### 17.4 Coverage — the three measures and §6

Coverage is split into **defined coverage**, **question-mapped coverage** and **learning evidence /
mastery** (§6, §13.10), so that "a programme can have good question coverage while students still
struggle with its objectives" is structurally true. The complete revised **§6 (P5)** is what the reviewer
asked to read next, because it is where objective versioning, programme membership, mapping reliability
and class-assignment history meet.

### 17.5 Change report (round 3)

| Section | Change |
|---|---|
| Header / §0.2 | Revision **3**; sequencing notes round 3 and where its corrections were applied |
| §0.3 | Added the criteria/review-metadata row (real `source`/`review_status` value sets; **no** criterion `reviewed_by`/`reviewed_at`); the `Class` row now states there is **no** academic-year column |
| §0.5 | Round-3 "final validation" entry |
| §5A (P10) | Exact unique constraints + the deliberate **index replacement** (not purely additive); Phase 2 contract clarified (`programme_id` *is* a version) |
| §5B (P12) | Partial unique index + transaction + **409**; UTC half-open interval, exact boundary rule; **class-identity snapshot**; explicit Phase 2 snapshot field table |
| §6 (P5) | **Rewritten**: historical-membership eligibility (fixes T8/T10); three measures; counting rules; non-member exclusion |
| §10A (P11) | **Provisional criterion mapping** terminology; real value sets + migration mapping; review metadata verified absent; **allowlist** reliability; criterion `reviewed_by`/`reviewed_at` added to the change set |
| §11 | P10/P11 rows updated (index replacement; `reviewed_by`/`reviewed_at`; allowlist) |
| §13.2 | Criterion row states the real value sets and the missing criterion-level review columns |
| §13.6 | Class-identity-across-years and concurrency bullets |
| §13.10 | Three measures instead of "coverage vs mastery" only |
| §13.12 | Row 2 refined to the snapshot field list; `programme_id`-is-a-version note |
| §15 | Intro now references rounds 2–3 |
| §16.2 | Reference chains **corrected** (programme context via assignment/activity); criterion row corrected; assignment row updated |
| §16.3 | **T27–T34 added**; T7/T14/T19/T23/T26 clarified; "reliable" = the allowlist |
| §17 (new) | This section |
| §18 | Change log (renumbered) |

**Owner decisions — status at round 3 (2026-11-20):** §16.4's U1–U15 were unresolved at that review
point (U12 added in round 4, U13 in round 5, U14 in round 6, U15 in round 7; round 8 refines U14/U15
rather than adding one), including U7 (roadmap naming, recommended B), U8 (recording D15), U10 (the
counting policy — explicitly **not** settled by §6, and now also covering archived questions), U12 (legacy
criteria must not be auto-confirmed), U13 (subject-consistency enforcement), U14 (historical subject
reproducibility) and U15 (subject identity across deletion). That statement is historical; later decisions
are recorded in §§19–§20.

### 17.6 The reviewer's recommendations on those decisions (recorded, not decided)

| # | Reviewer's recommendation |
|---|---|
| U1 | Free text initially, with normalisation and validation |
| U2 | Restrict import to the subjects the professor is assigned to |
| U3 | Explicit per-class adoption |
| U4 | All eligible official objectives in the exact assigned programme version |
| U5 | Keep cumulative packs out of v1 unless a real workflow requires them |
| U6 | Decide after reviewing the existing Learning console and admin navigation |
| U7 | Option B: preserve the seven-phase target and insert Phase 1B only |
| U8 | Record D15 once the architecture decisions are approved |
| U9 | Private by default |
| U10 | The §6 review is now provided; the counting policy still requires the owner's **explicit confirmation** |
| U11 | Mode-dependent, with backend-enforced authorisation and audit |
| U12 | — (no reviewer recommendation; raised by the agent in round 4, §10A: legacy criteria must not be auto-confirmed) |

The reviewer also restated that the rule **"professors teaching the same subject, level and track share
one official programme"** must remain intact: `programme_key` must not become a way to create duplicate
official programmes, while still permitting genuinely distinct parallel programmes. Duplicate detection
identifies possible matches and guides reuse; it **never auto-merges** (§2/§7).

### 17.7 Round 4 — the six requested corrections

| # | Correction requested | Applied in |
|---|---|---|
| 1 | Make the **publication-time eligibility rule** for programme membership explicit | **§6** — publishing a programme version validates and **freezes** membership (every member must be `official` ∧ published at that instant, else publication is refused); no retroactive promotion; tests **T35**, **T36** |
| 2 | **Investigate the real semantics of the existing `approved` value** before defining its migration | **§10A** — verified: `approved` is a derived default written by `QuestionPedagogyService.setCriteria:187`, never a review event; the only review event is the per-*question* `pedagogy_reviewed_at/by` stamp. Migration is now `approved`/`needs_review → **unreviewed**`; the target set gains `unreviewed`; **historical reliability starts at zero**; new decision **U12** |
| 3 | Define **distinct-objective counting** and the **complete question-eligibility predicate** | **§6** — `@@unique([programme_id, objective_id])`, one version per `objective_key`, de-duplication by objective version id; one formal predicate with the `weight > 0` clause; and the corrected finding that **no question-archive state exists** (so "archived questions do not count" was wrong); tests **T37**, **T38** |
| 4 | Clarify **independent parent/child membership counting** | **§6** — each counts only if it is itself a member; no roll-up and no roll-down; a local child contributes nothing |
| 5 | Add **T35–T38** | **§16.3** |
| 6 | Keep **U10 unresolved** until the owner explicitly confirms the counting policy | **§6** (rules marked *proposed*), **§16.4** (U10 reworded as **UNRESOLVED**), **§17.6** (no longer implies §6 settles it) |

### 17.8 Change report (round 4)

| Section | Change |
|---|---|
| Header / §0.5 | Revision 3.1; a round-4 entry with the two verification findings |
| §6 (P5) | Publication-time eligibility frozen; distinct-objective counting; the formal question-eligibility predicate; parent/child independence; the archived-question rule corrected; U10 marked unresolved |
| §10A (P11) | The `approved`-semantics investigation; the migration replaced by `approved`/`needs_review → unreviewed`; `unreviewed` added to the target set |
| §11 | P11 row notes the `unreviewed` value, the conservative migration and the no-auto-confirm test |
| §13.2 | Criterion row notes the `unreviewed` addition |
| §15 | Implementation status now names U10 and U12 |
| §16.3 | **T35–T38 added** |
| §16.4 | **U12 added**; U10 reworded as unresolved with the explicit-confirmation requirement |
| §17.6 | U10 row no longer says "now provided"; U12 recorded |
| §17.7–§17.9 | This round-4 record |

### 17.9 Deliberately unchanged by round 4

- **No implementation, no approval.** The counting policy is *proposed*: **U10 and U12 remain open**.
- **The three measures stay labels** (`defined` / `question-mapped` / learning evidence-mastery), not an
  approved policy.
- **No new schema ask beyond §5A/§10A**: `unreviewed` is one enum value, and the criterion-level
  `reviewed_by`/`reviewed_at` columns were already proposed in round 3.
- **The reviewer's accepted options (P10-A, P11-A, P12-A) are not reopened**, and the two questions the
  reviewer asked to keep intact — shared official programmes must not be duplicated by `programme_key`,
  and distinct parallel programmes must stay permitted — are unchanged (§2/§7).

### 17.10 Round 5 — the two requested corrections

Round 5 reviewed **§6 only**. The reviewer **accepted P5 conceptually** ("I would not redesign it") and
asked for two precision/integrity corrections — not a reopening of the design. He accepted, in the same
review: publication-time eligibility; frozen programme membership; historical objectives retained in old
programme versions; no automatic class reassignment; distinct objective-version counting; parent/child
independent membership; local objectives excluded; the `approved`-migration correction ("correct and
necessary"); AI suggestions excluded; deleted questions/cascading criteria ("correctly reflects the
current implementation"); and no assignment → `UNDEFINED`.

1. **Subject consistency in the coverage predicate.** The predicate now carries
   `subject(q) = S` and the invariants `P.subject_id = S`, `o.subject_id = S`, enforced **by the
   backend**, not assumed by the query. One verification finding changed the exact form: **`Question` has
   no `subject_id`**, so the reviewer's literal `q.subject_id = S` is not implementable as written; the
   predicate uses the **resolved** subject (`Category(q.category_id).subject_id`, which is **nullable**)
   and treats **`NULL` as undetermined ⇒ contributes nothing**. The current validator never sees the
   question's subject, so the invariant **does not exist today** and must be added at criterion
   write/confirm time and at programme publication.
2. **The confirmation operation made explicit in §10A.** `confirmed` is written by exactly one
   backend-enforced action (`confirmCriterion`), which stamps the criterion's own
   `reviewed_by`/`reviewed_at` (columns that must be **added**) and writes a `criterion.confirm` audit
   row; `rejectCriterion` → `rejected` with the same discipline; bulk confirm = one audit row per
   criterion; and the **question-level `pedagogy_reviewed_at/by` stamp can never confirm a criterion**
   (a question with several criteria does not validate each mapping).

### 17.11 Change report (round 5)

| Section | Change |
|---|---|
| Header / §0.5 | Revision **3.2**; a round-5 entry recording the conceptual acceptance of P5, the two corrections and the `Question.subject_id` finding |
| §6 (P5) | `subject(q)` resolution added to the predicate; backend invariants `P.subject_id = S` / `o.subject_id = S`; new **"subject consistency is a backend invariant, not a query assumption"** block (with the verified absence of the check today); counting-rules bullet for subject/undetermined; test pointer **T39/T40** |
| §10A (P11) | New **"confirmation operation and its audit record"** block (`confirmCriterion`/`rejectCriterion`, per-criterion `reviewed_by`/`reviewed_at`, `criterion.confirm`/`criterion.reject` audits, bulk = per-row audit, question stamp decoupled, re-classification inherits nothing); stale `approved → confirmed` / `needs_review → suggested` migration text **corrected** to `→ unreviewed` |
| §11 | P11 row notes the subject-consistency check and the per-criterion confirmation/audit + new tests |
| §13.2 | New row: `Question`/`Category` — **no subject consistency** today; criterion row unchanged |
| §16.3 | **T39–T41 added** |
| §16.4 | **U13 added** (subject-consistency enforcement + pre-existing cross-subject rows) |
| §17.10–§17.12 | This round-5 record |
| §18 | Round-5 change-log entry |

### 17.12 Deliberately unchanged by round 5

- **No implementation, no approval, no defect fixed.** **U1–U13 all remain unresolved**, including U10
  (counting policy), U12 (legacy criterion reliability) and the new U13 (subject-consistency enforcement).
- **The three measures stay three labels**, and `question-mapped` is still **not** evidence or mastery.
- **No new design decision was taken**: the subject check and the confirmation action are precision
  fixes to what was already proposed, and the reviewer's accepted options (P10-A, P11-A, P12-A) are not
  reopened.
- **The only new schema ask** is the same one already proposed (criterion-level `reviewed_by`/
  `reviewed_at`) — no new table, no new column beyond the round-3/round-4 sets; subject consistency needs
  **no** new column at all (it is enforced from existing fields, plus `Question.subject_id` **only if**
  the owner later chooses to add one — an option, not a requirement, folded into U13).

### 17.13 Round 6 — the category-history issue and two atomicity requirements

Round 6 **accepted both round-5 corrections** and the code-verification approach ("the agent did the right
thing by checking the schema and service instead of blindly adding an impossible predicate"), then asked
for one focused documentation-only round:

1. **Historical subject resolution after a category change** (the reviewer's new concern). The
   live-resolution predicate is not reproducible: `Category.subject_id` is freely updatable
   (`CategoryUpdateSchema = CategoryCreateSchema.partial()` → `PATCH /categories/:id`,
   `categories.routes.js:74-82`), a question can be re-parented (`question.schema.js:29,45`), and deleting
   a `Subject` nulls the association (`onDelete: SetNull`). **§6 now defines the policy** — an
   **immutability guard on in-use categories** (a category whose questions carry at least one `confirmed`
   criterion), a subject change requiring an explicit audited **reclassification migration** that demotes
   inconsistent confirmations, plus a **confirmation-time subject snapshot** on the criterion so an
   already-reported number cannot be silently rewritten; undetermined is a reported state, not a silent
   pass. The choice is recorded as new decision **U14** (recommended: **both**), and until it is decided
   §6 states plainly that coverage is reproducible **only while no category subject change occurs**.
2. **Atomic confirmation/rejection including audit.** §10A now makes it normative that
   `confirmCriterion`/`rejectCriterion` run as **one transaction** (subject re-check + status + reviewer
   stamps + audit row), with the verified evidence that this is **not** today's pattern
   (`#audit` → `auditSvc.log` after the write, outside any transaction, `QuestionPedagogyService.js:62-72`,
   `:199`, `:236`; and `categories.routes.js:78-79`).
3. **Transactional replacement, replacements start `unreviewed`.** §10A states `setCriteria` must be one
   transaction (validate → subject check → replace → caches → audit) so neither a partial set (Defect A)
   nor a transferred confirmation can result; §13.1A's Defect-A row now records that the confirmation
   workflow **depends** on that fix.
4. **Tests T42–T46** (§16.3): category subject change after confirmation; subject set to NULL / deleted;
   audit failure during confirm/reject; replacement mid-failure + no inherited confirmation; the
   consistency report.

### 17.14 Change report (round 6)

| Section | Change |
|---|---|
| Header / §0.5 | Revision **3.3**; round-6 entry (both corrections accepted; category-history policy; atomicity) |
| §6 (P5) | New block **"Historical subject resolution and category changes"**: the verified mutability of `Category.subject_id`/`question.category_id`/`onDelete: SetNull`, the four-point recommended policy, and **U14**; counting-rules bullet on confirmation-time subject |
| §10A (P11) | Two normative bullets: **atomic** confirm/reject **including audit** (with evidence it is not today's pattern) and **transactional** `setCriteria` with replacements starting `unreviewed` |
| §11 | P11 row: subject snapshot, atomic confirm/reject, transactional replacement, category in-use guard, new tests |
| §13.1A | Defect-A row extended: the confirmation workflow depends on the transaction |
| §13.2 | `Question`/`Category` row extended: the subject resolution is **mutable** today (PATCH, re-parenting, `SetNull`) |
| §16.3 | **T42–T46 added** |
| §16.4 | **U14 added** (historical subject reproducibility) |
| §17.13–§17.15 | This round-6 record |
| §18 | Round-6 change-log entry |

### 17.15 Deliberately unchanged by round 6

- **No implementation, no approval, no defect fixed.** **U1–U14 all remain unresolved**; U10 (counting
  policy), U12 (legacy criterion reliability), U13 (subject enforcement) and the new U14
  (reproducibility policy) stay open.
- **No redesign.** P5 stays as accepted; the round-6 items are a history policy and two atomicity
  statements, not a change to the coverage model, and P10-A/P11-A/P12-A are not reopened.
- **The only added schema ask** is one nullable column on the criterion (`subject_id_at_confirmation`),
  and **only** under the recommended "both" policy — it is part of U14, not an approved change. The
  category guard needs **no** new column (it is a service-level rule plus a verifier, since there is no
  database trigger to enforce it).

### 17.16 Round 7 — relationship-wide guard, review history, and subject survival

Round 7 **accepted all round-6 items** (guard, snapshot, atomicity, verifier) but **withheld U14** pending
three additions, on the grounds that "we must not claim historical reproducibility until both the
relationship mutations and the criterion's review history are covered":

1. **The guard must protect the relationship, not one column (round-7 §1).** The resolved subject is
   `Question → Category → Subject`, so `Category.subject_id` alone is insufficient. **§6 now enumerates all
   five verified mutation paths** in a table — category `subject_id` (`categories.routes.js:74-82`),
   **question re-parenting** (`question.schema.js:29,45`; `questions.routes.js:132+`), **subject deletion**
   (`subjects.routes.js:83-100`, which today **cascades `LearningObjective`** via `onDelete: Cascade`,
   `:1200`, and silently nulls `Category`/`Competency`/`Course`), **category deletion**
   (`Question.category` `SetNull`, `:279`), and **import/bulk/restore** — with the rule that a question
   carrying a `confirmed` criterion cannot have any of them changed outside the audited reclassification
   migration, and that a **verifier** detects out-of-band changes (no trigger exists today; a raw-SQL
   trigger would be documented drift — see the round-8 precision in §6).
2. **Current coverage ≠ historical coverage (round-7 §2, the reviewer's most important point).** A subject
   snapshot alone does **not** preserve a past report, because the coverage query requires
   `review_status='confirmed'`: if an authorised reclassification **demotes** a criterion, the *past*
   number moves even though the snapshot survives. **§6 now defines two computations**, and §10A adds the
   **append-only `CriterionReviewEvent`** table (action, `before → after`, actor, `at`, weight, subject id
   + label snapshot) as the foundation — **current coverage reads the criterion row; historical coverage
   reads the event stream as of the date D**. Report snapshots are demoted to an *option*, because the
   reviewer prefers preserving events to preserving calculated numbers. §6 also states the honest limit
   that a **hard-deleted question** (no archive state exists) cannot be restored from the stream alone, so
   a question with confirmed criteria must be **archived**, not deleted.
3. **Subject identity must survive the deletion of the live `Subject` (round-7 §3).** An FK with
   `onDelete: SetNull` would erase the history it exists to protect (the schema's current pattern).
   **§6 now requires a non-referential identity snapshot** (`subject_id` + `subject_label_snapshot`, not an
   FK, or an FK with `Restrict`) **and recommends archiving subjects** — which needs an additive
   `Subject.status`/`archived_at` because `Subject` has none today (`:225-243`) — replacing the current
   destructive delete. New decision **U15**.
4. **Tests T47–T51** (§16.3): question re-parenting; subject deletion; historical-vs-current coverage after
   a demotion; historical identity after subject archival + refused hard delete of a question with
   confirmed criteria; out-of-band relationship change detected by the verifier.

### 17.17 Change report (round 7)

| Section | Change |
|---|---|
| Header / §0.5 | Revision **3.4**; round-7 entry (relationship guard, current-vs-historical coverage, subject archival) |
| §6 (P5) | Three new blocks: the **five-mutation-path table** with the relationship-wide rule and verifier; **current vs historical coverage** + the `CriterionReviewEvent` mechanism and the hard-delete limit; **subject-identity survival** (non-referential snapshot, archive instead of delete) and **U15** |
| §10A (P11) | Confirmation now also appends a **`CriterionReviewEvent`** in the same transaction; the row is current state, the event is history |
| §11 | P11 row: event table, `Subject.status`, relationship-wide guard, archive-aware sanitizer, new tests |
| §13.2 | New `Subject` row: **no archival state**, destructive delete (cascade to objectives, silent NULLs) |
| §16.3 | **T47–T51 added** |
| §16.4 | **U14 expanded** (relationship guard + event history); **U15 added** (subject identity across deletion) |
| §17.16–§17.18 | This round-7 record |
| §18 | Round-7 change-log entry |

### 17.18 Deliberately unchanged by round 7

- **No implementation, no approval, no defect fixed.** **U1–U15 all remain unresolved**, with U14 held open
  by the reviewer until these three points are documented and the owner can approve the complete policy.
- **No redesign.** P5's model is unchanged; this round adds a **history mechanism** and widens an **existing
  guard** — it does not alter the three measures or the eligibility rules, and P10-A/P11-A/P12-A remain
  closed.
- **The added schema asks are all proposed, not approved:** `CriterionReviewEvent` (new table),
  `subject_id_at_confirmation` + `subject_label_snapshot` (criterion), and `Subject.status`/`archived_at`
  (archival) — each tied to U14/U15, none authorising work.
- **The draft no longer claims reproducibility it cannot prove:** §6 states plainly that until U14/U15 are
  decided, coverage is reproducible only while no relationship change occurs **and** only for questions
  that still exist.

### 17.19 Round 8 — event identity, historical-confirmation protection, reconstruction

Round 8 **accepted round 7** ("a significant improvement… the agent has correctly moved beyond protecting
`Category.subject_id` and examined the entire relationship chain") but **withheld U14** pending three
clarifications, all now documented:

1. **The event must preserve enough to reconstruct the mapping (round-8 §1).** §6 now lists the
   **complete** field set on `CriterionReviewEvent` — `criterion_id` (**stable identity**: since
   `QuestionAssessmentCriterion.id` is a fresh uuid per row, a `setCriteria` replacement is a *different*
   mapping, so the id must live in the event), `question_id`, the **exact objective-version id** +
   `objective_key`, `bloom_dimension_id`/`competency_id`/`criterion_key`/`max_score`, the
   **non-referential** `subject_id`/`subject_label_snapshot`, `source`, `review_status_before → after`,
   `weight` (+ `weight_before`), `actor_id`/`at`, `action`/`event_seq` — and states that **every reference
   is a plain column or an FK with `onDelete: Restrict`, never `Cascade`/`SetNull`**, so deleting a
   criterion, question or subject cannot erase history. §10A repeats the requirement for the write path.
   The reviewer's worked case (`Q1 → O1` replaced by `Q1 → O2`) is now a test (**T52**).
2. **Deletion protection must consider *historical* confirmations (round-8 §2).** §6 replaces the
   "currently confirmed" test with **"has ever contributed a confirmed mapping"** — any `confirm` event
   for the question, whatever its current state — because a reset/replaced criterion still supplied a
   confirmed mapping to reports dated before the reset. Archived questions keep their historical identity;
   whether they count for **current** coverage is added to **U10** (counting policy), not decided here
   (test **T53**).
3. **Define how historical coverage is reconstructed (round-8 §3).** §6 now gives the algorithm
   (`state(c, D)` = latest event with `at ≤ D`, `event_seq` tie-break; `reliable(c, D)` from the event's
   after-state/source/weight/subject; `mapped(o, D)`), the **four worked cases** (confirm-then-reset →
   counted; confirm-then-reject → not counted; confirm-after-D → not counted; replaced-after-D → original
   mapping still available), the **archived-question rules** as of `D`, and the **genesis/`replaced`
   events** that make every criterion's history unambiguous (legacy rows get a recorded `created`/baseline
   `null → unreviewed` event, new rows get `created`, replacements get `replaced` before deletion).
4. **Archival guarantees (round-8 §4).** §6 states the four conditions archival must satisfy: preserve
   subject identity, **delete nothing** (no objectives/competencies/programmes/assignments), **not change
   historical coverage**, and **block new publication** against an archived subject unless a separate
   policy authorises it. Tests **T52–T55**.

### 17.20 Change report (round 8)

| Section | Change |
|---|---|
| Header / §0.5 | Revision **3.5**; round-8 entry (event identity, historical-confirmation delete protection, reconstruction algorithm, archival guarantees) |
| §6 (P5) | **Event field table** (complete mapping identity; plain/`Restrict` refs only) + **historical reconstruction algorithm** with the four cases, archived-question handling and genesis/`replaced` events; the honest-limit paragraph extended to **historical** confirmations; the subject block extended with the **four archival guarantees**; counting-rules bullet on historical evaluation; the trigger wording corrected (SQLite *does* support triggers; a raw-SQL guard would be documented drift) |
| §10A (P11) | Confirmation bullet: the **full** event field set, no-cascade rule, and **genesis/replacement events** written by `setCriteria` |
| §11 | P11 row: full mapping identity, genesis/`replaced` events, archive-aware sanitizer, hard-delete refusal, new tests |
| §13.2 | Criterion row: `id` is a fresh uuid per row — the reason the event must carry the criterion id |
| §16.3 | **T52–T55 added** |
| §16.4 | **U14/U15 refined** (complete identity + reconstruction algorithm; historical confirmations; archival guarantees); **U10 extended** to archived questions |
| §17.19–§17.21 | This round-8 record |
| §18 | Round-8 change-log entry |

### 17.21 Deliberately unchanged by round 8

- **As of the round-8 review (2026-11-20):** no implementation, owner approval, or defect fix was recorded;
  U1–U15 were unresolved at that point, with U14/U15 held open pending owner review. Later owner
  dispositions are recorded in §19 and the status updates in §20; this historical snapshot is not current
  decision status.
- **No redesign of P5.** This round **completes the audit model** (what the event records, how history is
  reconstructed) and tightens one deletion rule; the three measures and the eligibility rules are
  unchanged, and P10-A/P11-A/P12-A remain closed.
- **Adds no new decision.** Round 8 refines U14 and U15 rather than opening U16; the only cross-reference
  added is that **archived questions** are part of the counting policy (**U10**).
- **States its limits rather than hiding them:** historical coverage depends on the event stream being
  complete from genesis and on questions having an archive state instead of a hard delete — both of which
  are **proposed**, not present today.

---

## 18. Change log

> **Historical sequence:** entries below record the document state at the end of each dated review round;
> later dispositions are not backdated into those entries. The latest current decision/authorization status
> is summarized at the top and in §§19–§20, with D15 also in the decision register. “Open” in an older
> entry means open as of that entry's date.

- 2026-11-20 — initial draft. Owner decisions (a)–(h) recorded as inputs; proposals P1–P9 written with
  options, trade-offs, recommended defaults, effort and Phase 1 impact. 13-point list not received and
  therefore not addressed.
- 2026-11-20 — the 13 points were received and are answered in §13.1–§13.13, including the Phase 1
  audit and the exact model limitations (§13.1–§13.2), the roadmap numbering conflict (§13.11, two
  different "Phase 5"s) and the Phase 2 reassessment (§13.12, five new requirements + proposed D15).
  Proposed but unapplied edits to the accepted documents are listed in §14.
- 2026-11-20 — reviewer feedback incorporated (§0.5). Added **P10** — objective identity, version
  semantics and historical references, the critical reference model answering the four meanings of
  "objective" (§5A); **P11** — mapping provenance and the classification review queue, replacing blind
  category-wide mapping (§10A); the **defect disposition table** (§13.1A) classifying the six defects as
  fix-now / resolved-by-design / scheduled; the reviewer's **roadmap naming** with the exact conflicts it
  creates against the normative decision-register gates (§13.11); and **§15 — the final consolidated
  review** answering the reviewer's 13 verification questions. Implementation remains frozen; §14 lists
  the unapplied edits to accepted documents.
- 2026-11-20 — **round-2 review incorporated (§16).** Status set to **DRAFT — AWAITING OWNER APPROVAL**.
  Programme identity/versioning hardened with a stable **`programme_key`** and identity
  `(school_id, programme_key, version)`; duplicate detection no longer uses `(subject, level, track)`
  alone; a **five-distinct-things** table forbids conflating programme identity/version, objective
  identity/version and membership (§2/§5A). New proposal **P12** replaces the current-only class binding
  with a **historized, effective-dated, audited** assignment (§5B), with the normative rule *"a programme
  change affects future activities and never reinterprets past activities or results."* Local objective
  **ownership/visibility/reuse** defined with `private` defaults (§5). P11 split into two axes —
  `source` (provenance) vs `review_status` (review state) — with `imported` no longer self-certifying
  (§10A). P10/P6 migrated conservatively: legacy rows become `scope='unassigned'`, `published_at=null`,
  official status re-established only by explicit verify/adopt (§5A/§7). Coverage (P5) is computed
  against the **exact assigned programme version**, and supersession never shrinks an in-use version's
  denominator (§6). §14 completed (14 items); §13.11 corrected so **Phase 8 and D8/D9/D10 are preserved**,
  not moved. Added §16 (findings, data-model relationship table, test acceptance matrix T1–T26,
  consolidated unresolved decisions, change report). Renumbered the change log to §17 (later §18 after
  round 3). No code, schema, migration, service, route, frontend or test was changed.
- 2026-11-20 — **round-3 "final validation" incorporated (§17).** The reviewer accepted the architecture
  direction and the P10-A/P12-A/P11-A options and withheld approval pending corrections; all are applied
  in place. **Coverage (P5/§6) rewritten** so a denominator is decided by the **immutable membership of
  the exact assigned programme version**, not an objective's current global status — this removes the
  T8/T10 contradiction, and coverage is now three measures (defined / question-mapped / learning
  evidence-mastery). **§10A (P11)** now calls a suggestion a **provisional criterion mapping** (Option A:
  provisional rows in the existing table, explicitly *not* "a suggestion is not a criterion"), records
  the **real** schema value sets (`source ∈ manual|imported`; `review_status ∈ approved|needs_review`)
  with an explicit migration mapping, notes that **criterion-level `reviewed_by`/`reviewed_at` do not
  exist today** and must be added, and replaces the reliability predicate with an **allowlist**.
  **§16.2 reference chains corrected**: a criterion pins an objective **version** and never a programme;
  programme context is resolved from the assignment/activity. **§5B (P12)** gains a **partial unique
  index + single transaction + 409** concurrency guarantee, UTC half-open interval and boundary rules,
  and a **class-label/school-year snapshot** (because `Class` has no academic-year column). **§5A (P10)**
  specifies the exact unique constraints and states the index swap makes the migration not purely
  additive. Test matrix extended to **T1–T34** with T7/T14/T19/T23/T26 clarified. Status remains
  **DRAFT — AWAITING OWNER APPROVAL**; U1–U11 remain unresolved. The reviewer's next reading is the
  complete revised §6 (P5). No code, schema, migration, service, route, frontend or test was changed.
- 2026-11-20 — **round-4 scope-limited correction applied (§17.7–§17.9).** Six requested items done,
  documentation-only. **§6 (P5):** publication-time eligibility now **frozen at programme-version
  publication** (membership validated as `official` ∧ published at that instant; publication refused
  otherwise; no retroactive promotion); **distinct-objective counting** defined
  (`@@unique([programme_id, objective_id])`, one version per `objective_key`, de-dup by version id); the
  **complete question-eligibility predicate** written as one expression (reliable criterion ∧
  `weight > 0` ∧ question exists in the school ∧ member objective version); **parent/child counted
  independently** (no roll-up/roll-down; local children contribute nothing). **§10A (P11):** verified
  that the existing `approved` value is a **derived default** (`QuestionPedagogyService.setCriteria:187`),
  never a review event — so the earlier `approved → confirmed` migration is **withdrawn** and replaced by
  **`approved`/`needs_review → unreviewed`**, with `unreviewed` added to the value set and **historical
  reliability starting at zero** (new decision **U12**); the per-*question* `pedagogy_reviewed_at` stamp
  may only pre-select candidates, never auto-confirm. Corrected a round-3 error: `Question` has **no**
  archive state, so "archived questions do not count" was wrong as written (deletion is hard and cascades).
  Tests **T35–T38** added. **U10 stays unresolved** and now requires the owner's explicit confirmation of
  the counting policy; U1–U12 all remain unresolved. Status remains **DRAFT — AWAITING OWNER APPROVAL**.
  No code, schema, migration, service, route, frontend or test was changed.
- 2026-11-20 — **round-5 review of §6 incorporated (§17.10–§17.12).** The reviewer **accepted P5
  conceptually** and asked for two precision/integrity corrections, both applied documentation-only.
  **§6 (P5):** the coverage predicate now enforces **subject consistency** — `subject(q) = S` plus the
  invariants `P.subject_id = S` and `o.subject_id = S`, enforced **by the backend** and not assumed by
  the query; verified that **`Question` has no `subject_id`** (subject only via the nullable
  `Category.subject_id`), so the reviewer's literal `q.subject_id = S` is not implementable as written and
  the predicate uses the resolved subject with **`NULL` = undetermined ⇒ contributes nothing**; verified
  that `validateCriteriaSet` never sees the question's subject, so the invariant **does not exist today**
  and must be added at criterion write/confirm time and at publication. **§10A (P11):** added the explicit
  **confirmation operation** — `confirmCriterion`/`rejectCriterion`, per-criterion
  `reviewed_by`/`reviewed_at` (columns to be added), `criterion.confirm`/`criterion.reject` audit rows,
  bulk confirm as one audit row per criterion, re-classification inheriting nothing, and the rule that the
  **question-level `pedagogy_reviewed_at/by` stamp can never confirm a criterion** (a question with
  several criteria does not validate each mapping); stale `approved → confirmed` text corrected to
  `→ unreviewed`. Tests **T39–T41** added; **U13** added (subject-consistency enforcement and
  pre-existing cross-subject rows). **U1–U13 all remain unresolved.** Status remains
  **DRAFT — AWAITING OWNER APPROVAL**. No code, schema, migration, service, route, frontend or test was
  changed.
- 2026-11-20 — **round-6 review of §6 incorporated (§17.13–§17.15).** Both round-5 corrections
  **accepted**; the reviewer raised the **category-history** gap and two atomicity requirements, all
  applied documentation-only. **§6 (P5):** new **"historical subject resolution and category changes"**
  policy block — `Category.subject_id` is **mutable today** (`CategoryUpdateSchema = partial` →
  `PATCH /categories/:id`, `categories.routes.js:74-82`; questions can be re-parented,
  `question.schema.js:29,45`; deleting a `Subject` nulls it via `onDelete: SetNull`), so live resolution
  cannot make coverage reproducible on its own; the recommended policy is an **immutability guard on
  in-use categories** + an explicit audited **reclassification migration** + a **confirmation-time subject
  snapshot** on the criterion, with undetermined as a reported state; choice recorded as new decision
  **U14** (recommended: both), and §6 states coverage is reproducible only while no category subject
  change occurs. **§10A (P11):** **atomic** `confirmCriterion`/`rejectCriterion` **including the audit
  row** (verified that today's `#audit` runs after the write and outside any transaction —
  `QuestionPedagogyService.js:62-72`, `:199`, `:236`), and **transactional** `setCriteria` whose
  replacements always start `unreviewed`. Tests **T42–T46** added (§16.3); **§13.1A** Defect-A row now
  records that the confirmation workflow depends on the transaction; **§13.2** records that question
  subject resolution is mutable. **U1–U14 all remain unresolved.** Status remains
  **DRAFT — AWAITING OWNER APPROVAL**. No code, schema, migration, service, route, frontend or test was
  changed.
- 2026-11-20 — **round-7 review of §6 incorporated (§17.16–§17.18).** The reviewer **accepted all round-6
  items** and asked for three additions before U14 can be accepted, all applied documentation-only.
  **§6 (P5):** (1) the in-use guard now protects the **relationship** `Question → Category → Subject`
  across all **five verified mutation paths** — category `subject_id` (`categories.routes.js:74-82`),
  **question re-parenting** (`question.schema.js:29,45`), **subject deletion** (`subjects.routes.js:83-100`,
  which cascades `LearningObjective` per `onDelete: Cascade` `:1200` and silently nulls
  `Category`/`Competency`/`Course`), **category deletion** (`Question.category` `SetNull` `:279`) and
  **import/bulk/restore** — enforced on every service path with a verifier for out-of-band changes (no
  database trigger exists); (2) **current coverage and historical coverage are now distinguished**, which
  required an **append-only `CriterionReviewEvent`** table (current state = the row, history = the events
  read as of date D), because a subject snapshot alone cannot stop a later **demotion** from rewriting a
  past report — §10A writes the event in the same transaction as the state change; (3) **subject identity
  must survive deletion of the live `Subject`**, so the snapshot is **non-referential**
  (`subject_id` + `subject_label_snapshot`, or `Restrict`) and subjects must be **archived** rather than
  deleted (needs an additive `Subject.status`; `Subject` has none today, `:225-243`); §6 also states the
  honest limit that a **hard-deleted question** cannot be reconstructed, so questions with confirmed
  criteria must be archived. Tests **T47–T51** added; **U14 expanded** and **U15 added**. As of this
  round-7 snapshot, U1–U15 were unresolved; §19–§20 record subsequent owner dispositions. Status at this
  review point was **DRAFT — AWAITING OWNER APPROVAL**. No code, schema, migration, service, route, frontend
  or test was changed.
- 2026-11-20 — **round-8 review of the historical model incorporated (§17.19–§17.21).** Round 7 accepted;
  three clarifications applied documentation-only. **§6 (P5):** (1) a **complete `CriterionReviewEvent`
  field table** — `criterion_id` as **stable identity** (`QuestionAssessmentCriterion.id` is a fresh uuid,
  so a `setCriteria` replacement is a different mapping), `question_id`, the **exact objective-version id**
  + `objective_key`, Bloom/competency/key/max-score, the **non-referential** `subject_id` +
  `subject_label_snapshot`, `source`, `review_status_before → after`, `weight` (+`weight_before`),
  `actor_id`/`at`, `action`/`event_seq` — with **plain or `Restrict` references only, never
  `Cascade`/`SetNull`**, so no cascade can erase history; (2) the hard-delete rule is now **"a question
  that has *ever* contributed a confirmed mapping may not be hard-deleted"** (a reset/replaced criterion
  still supplied history to earlier reports), with archived questions assigned to **U10** for current
  coverage; (3) the **historical reconstruction algorithm** is explicit — `latest event with at ≤ D`
  (`event_seq` tie-break), `reliable(c, D)` from the event's after-state, the four worked cases
  (confirm-then-reset counted; confirm-then-reject not; confirm-after-D not; replaced-after-D keeps the
  original mapping), archived-question handling as of D, and **genesis/`replaced` events** so no criterion
  history is ambiguous (legacy rows get a recorded `null → unreviewed` baseline). Subject archival now
  carries the reviewer's **four guarantees** (preserve identity, delete nothing, change no historical
  coverage, block new publication against an archived subject). Corrected the trigger wording: SQLite
  *does* support triggers and migrations already run raw SQL, so a guard trigger is **possible as
  documented drift** — the guarantee remains service-path enforcement plus a verifier. Tests **T52–T55**
  added; **U14/U15 refined**, **U10 extended**; no new decision. As of this round-8 snapshot, U1–U15 were
  unresolved; §19–§20 record subsequent owner dispositions. Status at this review point was **DRAFT —
  AWAITING OWNER APPROVAL**. No code, schema, migration, service, route, frontend or test was changed.
- 2026-11-20 — **owner decisions recorded (§19; initial approval).** The owner answered the fifteen
  decisions of §16.4: **U1–U5, U7, U9–U14 approved**; **U8** and **U15** approved **in principle** (D15's
  wording still pending; the U15 archival policy is incomplete without **G4**, a required
  authorization/route/audit/lifecycle); **U6 deferred**. The U10 **counting clarifications**, the **G1**
  confirmation and the approved **G2/G3** clarifications are recorded in §19.2–§19.3, and the approved
  **G6** §12 correction is **applied**. **Defect A and Defect B are not authorized** — the owner requires a
  minimal isolated change proposal (files, root cause, scope, tests) first, written in
  `docs/DEFECT-A-B-FIX-PROPOSAL.md`; **C/D/E/F** stay in the Phase 1B scope. **No implementation is
  authorized**; ADR-0001 remains **Proposed**.
- 2026-11-21 — **decision completion (G4, G2/G3, U8) and defect-status correction (§20).** Documentation
  only; no code, schema, migration, service, route, frontend or test was changed. Three things:
  (1) the **defect status recorded in §19.5–§19.6 is corrected** — Defect A and Defect B were
  subsequently authorized in separate, defect-scoped authorizations, implemented, tested and **closed**
  (A: transactional `setCriteria`/`clearCriteria` with complete `deleteMany`; B: complete pagination
  replacing the silent 1,000-row truncation, with the targeted graph optimization **B2 deferred** and the
  unused `#schoolObjectives` loader removed per the B4 condition); **C/D/E/F are unchanged** (still in the
  Phase 1B scope). (2) G4 owner choices are recorded as finalized in §20.2, while formal adoption of the
  complete wording remains pending; the blocking policy is active exams (including active training exams),
  while games/tournaments do not block. (3) The approved **G2/G3** clarifications are written as normative
  clauses (§20.3–§20.4), and **U8/D15 register wording was accepted and recorded** (§20.5 and the decision
  register). **U10, U12, U13, U14 stay decided** (§19) — none is reopened; the §16.4 "UNRESOLVED" rows
  remain the *pre-decision* record. Phase 1B remains **unauthorized**; ADR-0001 remains **Proposed**.
- 2026-11-21 — **register reconciliation continued.** D15 was verified in the decision register's summary,
  detail, Phase 1B gate and approval record; its entry now notes the finalized G4 owner choices and the
  pending formal adoption of the complete G4 wording. The architecture draft now distinguishes current
  dispositions from historical rounds, records the exact active-exam blocking rule (including training
  exams, while draft/archived exams and games/tournaments do not block), and corrects stale D15/U15/G4
  status language. No implementation authorization was added.
- 2026-11-21 — **consolidated owner decisions recorded (§20.7).** The owner's consolidated decision record
  finalized this round: the complete **G4 wording was adopted (E1)**, satisfying U15's wording condition;
  **D15 was substantively approved (F1)** in the register, **closing U8**; **G2/G3 remain accepted**; the
  document hierarchy was **ratified with owner-provenance safeguards (I1**, baseline §2.1**)**; **U6
  stays deferred** and **Phase 1B stays explicitly unauthorized (J)**; **WP5 remains implemented but not
  accepted (A2)** with its historical record corrected (B1). §20.2's heading and disposition, §19.1/§19.2
  status notes, §19.6, §20.6 and the historical "later status" notes were reconciled accordingly.
  Documentation only — no implementation authorization of any kind.

---

## 19. Owner decisions recorded (2026-11-20 — initial approval)

The owner reviewed §16.4 and the accompanying `docs/OWNER-DECISION-REVIEW.md` and returned the decisions
below. **This section records choices; it authorizes no implementation** (§19.5–§19.6). §16.4 is retained
unchanged as the *pre-decision* record so the questions, the options and the reviewer's recommendations
stay traceable.

### 19.1 Programme governance (U1–U5, U7–U9)

| # | Owner decision | Effect on this draft |
|---|---|---|
| U1 | **APPROVED** — free-text `level`/`track`, with normalisation | §2 (P1)/§13.3 stand as proposed; no `Level`/`Track` catalogue tables |
| U2 | **APPROVED** — professor imports restricted to the subjects they are assigned to teach, **enforced server-side** | §13.5 gains a server-side subject-scope check (a route/service guard, never only a UI restriction) |
| U3 | **APPROVED** — version adoption requires an **explicit class-level decision**; no automatic adoption | §5B (P12) stands; the per-school auto-adopt alternative is closed (owner input (e)) |
| U4 | **APPROVED** — the denominator is **all eligible official objective versions of the exact assigned programme version** | §6 stands; the equivalence with "the class's subject" is **confirmed** (G1, §19.3) |
| U5 | **APPROVED** — `cumulative` packs **excluded from v1**; the format stays extensible | §8 (P7) v1 scope fixed; the flag is reserved, not implemented |
| U6 | **DEFERRED** — UI placement decided after examining the existing interface and the teacher workflow | No UI decision taken; blocks no design work (§4 of the review document) |
| U7 | **APPROVED** — **option B**: introduce Phase 1B **without** renumbering the existing roadmap | §13.11 and §14 items 1/9/12 use the option-B wording |
| U8 | **APPROVED IN PRINCIPLE** — **D15** registered as the Phase 1B gate; final wording was resolved and accepted on 2026-11-21 | Exact text accepted and recorded in the decision register (§20.5). *(Current status: **closed** — D15 was substantively approved the same day, owner decision F1; see §20.7.)* |
| U9 | **APPROVED** — local objectives are **private by default** | §5 (P4) default confirmed |

### 19.2 Pedagogical reliability and coverage (U10–U15)

| # | Owner decision | Effect on this draft |
|---|---|---|
| U10 | **APPROVED WITH CLARIFICATIONS** (recorded below) | §6's counting rules become the **policy**; the archived-question limb is settled (they do **not** count currently) |
| U11 | **APPROVED** — import trust is mode-dependent, **explicitly authorized and audited** | §10A trust procedure confirmed as the rule |
| U12 | **APPROVED** — legacy criteria are **never** auto-confirmed; the migration starts at **unreviewed** | §10A migration mapping confirmed; historical reliability starts at zero |
| U13 | **APPROVED** — **hard-block** cross-subject mappings at **write and confirmation**; **report and quarantine** existing inconsistent records | §6's open question is resolved normatively; the quarantine/consistency report is a required deliverable |
| U14 | **APPROVED** — adopt the **relationship guard + confirmation-time subject snapshot + append-only historical event stream** | §6 lines 804–1013 become normative; **G2** fixes which layer is authoritative |
| U15 | **APPROVED IN PRINCIPLE** — **archive subjects and questions** rather than destructively deleting records needed by learning history | Subject archival and the G4 owner choices (including authority, proposed routes, lifecycle/audit requirements, and blocking by active exams including active training exams) are specified. *(Current status: the complete G4 wording was **adopted** 2026-11-21, owner decision E1; U15's wording condition is **satisfied**; see §20.2 and §20.7.)* |

**U10 — the counting policy (recorded; normative once Phase 1B is authorized):**

- Only **reliable criteria with `weight > 0`** count.
- **Exam and training questions may contribute equally** to question-mapped coverage.
- **No automatic parent/child objective roll-up** (and no roll-down).
- **De-duplicate by objective-version identity.**
- **Archived questions do not count in current coverage.**
- **Historical coverage must respect historical question status and criterion reliability** (the §6
  event-stream reconstruction as of the report date).
- **Question-mapped coverage is not student mastery** — the three measures stay three labels.

### 19.3 Historical-consistency clarifications (G1–G4)

| # | Owner decision | Recorded meaning |
|---|---|---|
| G1 | **CONFIRMED** | U4's two alternatives are **equivalent** because programme membership is subject-validated — the owner confirms an invariant, not a choice between two policies |
| G2 | **APPROVED** | The **historical event stream is authoritative** for historical reconstruction. **Current coverage uses an explicitly defined current-state policy**, and the confirmation-time snapshot **must not be treated as immutable current state** after an authorized reclassification |
| G3 | **APPROVED** | **Archived subjects retain historical coverage.** Current coverage must **clearly indicate** an archived subject and must **not** silently treat it as an active curriculum |
| G4 | **REQUIRED** | Question archival must have a **defined authorization, route, audit event and lifecycle** — a Phase 1B deliverable, not optional polish |

### 19.4 Documentation

| # | Owner decision | Applied |
|---|---|---|
| G6 | **APPROVED** — correct the inaccurate enumeration in §12 using the proposed replacement wording | **Applied in this revision** (§12): the parenthetical now enumerates the fifteen decisions consistently |

### 19.5 Process — defect authorisation

> **STATUS UPDATE (2026-11-21) — superseded; see §20.1.** The two bullets below record the position **as it
> stood at the initial approval**. That position has been **overtaken by events**: Defect A and Defect B
> were subsequently authorized in two separate, defect-scoped authorizations, implemented, tested and
> **closed**. **Defects C/D/E/F are unchanged.**

- **Defect A** (`setCriteria` delete-then-create is **not transactional**) and **Defect B** (school-wide
  loaders **silently truncate at 1,000**): **not authorized as at §19.** The owner required a
  **minimal isolated change proposal first** — files, root cause, scope and tests — before deciding. That
  proposal is written in **`docs/DEFECT-A-B-FIX-PROPOSAL.md`** and **authorizes nothing** by itself.
- **Defects C/D/E/F** stay **within the originally proposed Phase 1B scope** until their impact and
  implementation are reviewed (§13.1A dispositions stand; nothing is dropped from the report).

### 19.6 Implementation status after this approval

> **STATUS UPDATE (2026-11-21) — see §20.1 and §20.5–§20.7.** **Phase 1B remains unauthorized.** The only
> implementation released since §19 is the two **defect-scoped** fixes (A and B, now closed); nothing else
> in the frozen list below has changed.

**No Phase 1B implementation is authorized by this approval.** The recorded decisions choose the
architecture; they do not license code. Still frozen: schema, migrations, services, routes, frontend,
tests, criteria migration, bulk tagging, programme import, coverage implementation, Phase 2, mastery, AI.
ADR-0001 remains **Proposed**. This document remains a **DRAFT**: the earlier list below is retained as a
snapshot from the initial approval, and is superseded by the current status in §20.6–§20.7. As of that
later status, the G4 owner choices are finalized **and the complete G4 wording is adopted (E1)**,
satisfying U15's wording condition; D15's register wording is accepted and recorded **and D15 is
substantively approved (F1)**, so **U8 is closed**; G2/G3 remain accepted; U6 remains deferred; the
baseline hierarchy is ratified with owner-provenance safeguards (I1); and separate owner authorization is
still required before any Phase 1B implementation.

---

## 20. Owner-decision completion (2026-11-21 — G4, G2/G3, U8)

Companion to `docs/OWNER-DECISION-REVIEW.md` §9.1. **Documentation only** — no code, schema, migration,
service, route, frontend or test was changed. This section records the later dispositions for items §19
left open in the initial approval. It adds no new decision by itself; G4 choices and G2/G3/D15 wording
status are separately identified below, and **nothing here reopens** decisions from §19.

### 20.1 Defect-status correction (supersedes §19.5–§19.6)

§19.5–§19.6 recorded Defect A and Defect B as **not authorized** and listed the fixes among the frozen
scope. That record has been overtaken by two separate, **defect-scoped** authorizations. The corrected
status:

| Defect | §19 status | Current status |
|---|---|---|
| **A** — `setCriteria` delete-then-create not transactional | not authorized | **authorized (separate) · implemented · tested · CLOSED** |
| **B** — school-wide loaders silently truncate at 1,000 | not authorized | **authorized (separate) · implemented · tested · CLOSED**; the targeted graph optimization **B2 deferred**; the unused `#schoolObjectives` loader removed (**B4** confirmed safe — zero call sites) |
| **C / D / E / F** | Phase 1B scope | **UNCHANGED** (§13.1A dispositions stand) |

Effect: the frozen list in §19.6 no longer contains the A/B fixes, and **step 0** of the review's decision
sequence ("authorise defect fixes A and B") is **satisfied**. **Phase 1B remains unauthorized**; no other
implementation was released. **ADR-0001 remains Proposed.**

For the record, what was actually implemented (both behind the existing off-by-default behaviour, no
API-contract change):
- **Defect A** — a `runInTransaction(fn)` primitive on the repository exposing a transaction-bound
  repository; `setCriteria` and `clearCriteria` now perform their delete / create / derived-field update
  inside **one** transaction; deletion of the previous criteria is complete (`deleteMany`, no `limit`
  loop); a repository without transaction support is **refused**, never silently downgraded to a
  non-atomic write. Integration tests exercise a real rollback.
- **Defect B** — a reusable completeness helper reads **every page** (the 1,000 becomes a **page size**,
  not a cap); prerequisite-cycle detection and the objective/competency label loaders use the **complete**
  set. Documented limit: completeness is guaranteed relative to the repository's reported dataset during
  the read, **not** an immutable snapshot — offset pagination is not a snapshot read.

### 20.2 G4 — Question archival: authority, route, audit event, lifecycle (**completes U15**) — OWNER CHOICES FINALIZED AND WORDING ADOPTED (E1, 2026-11-21)

> **Owner choices FINALIZED 2026-11-21 (consolidation step 2); wording ADOPTED 2026-11-21 (owner decision
> E1, consolidated decision record):** blocking scope = **active exams, including active training exams**
> (G4.4 F3; games/tournaments do **not** block, and `draft`/`archived` exams do not block even when
> `is_training = true`); the hard-delete refusal stays **absolute** (admins included, archive is the only
> path); teachers keep own-question, admins any (G4.1); restore never automatically reactivates prior
> exam/game/other associations (G4.4 F7). The owner confirmed the section 3.1–3.3 decisions (C1/D1/E1) and
> **formally adopted the complete G4 wording below**, incorporating those decisions. This closes U15's
> wording condition as a decision only and authorizes **no implementation**.

§19.3 records G4 as **REQUIRED**: question archival must have "a defined authorization, route, audit event
and lifecycle". U15 approves archival **in principle**; U10 already decides that an **archived question
does not count in current coverage** and **does** count historically (via the §6 historical reconstruction,
read from the authoritative lifecycle event stream — see **§20.3, F1**; the single-field form
`created_at <= D < archived_at` is only its special case, §20.2 G4.4). What follows supplies the four
missing pieces. It was written as **proposed wording** and was **adopted by the owner on 2026-11-21**
(decision **E1**) after the section 3.1–3.3 decisions were incorporated; it is now the owner-adopted G4
wording, still **without implementation authorization**.

Verified starting point (the draft's convention):
- `Question` has **no** archive state today — no `status`/`archived_at` (`prisma/schema.prisma:245-284`);
  `DELETE /api/v1/questions/:id` is a **hard delete** cascading criteria (`questions.routes.js:151`).
- That route is guarded by **role** plus an ownership assertion, not by a learning permission
  (`requireRole([ADMIN, TEACHER])` + `assertOwnership`, `questions.routes.js:151-154`).
- The audit vocabulary already uses `entityType: 'question'` with `create`/`update`/`delete`
  (`questions.routes.js:145,156`), and `archive` is already an action for taxonomy entities
  (`LearningTaxonomyService.js:403,552`). The permission ids that exist are `school.learning.manage`
  (admin) and `class.learning.classify` (teacher, own questions) (`src/shared/permissions.js:60-68`).

**G4.1 Authority (F5) — reuse the existing pair, add no new permission string** (§13.5 rule: "creating a
permission string that no route enforces would be a false grant"). The two ids below **are** enforced
today (`learning.routes.js:50-53` — `requireLearningWrite = requireAnyPermission(['school.learning.manage','class.learning.classify'])`),
so reusing them is **not** a false grant:
- a **teacher** may archive/restore **their own** question → `class.learning.classify`;
- an **admin** may archive/restore **any** question → `school.learning.manage`.

The **owner-scoped** half is a **deliberate extension**, **not** a mirror. The existing *competency* archive
is **admin-only** (`requireLearningManage` = `requirePermission('school.learning.manage')`,
`learning.routes.js:55,306`). Granting teachers archival authority over their **own** questions is justified
only because they **already** hold the *stronger* power: `DELETE /questions/:id` is
`requireRole([ADMIN, TEACHER])` plus `assertOwnership` (`questions.routes.js:151-154`; ownership is the
teacher's `created_by` match, `:26-36`). Archiving is strictly **weaker** than the destructive delete
teachers may already perform, so no new authority is created. G4 does **not** claim to mirror competency
archival, which reserves the action for admins.

**G4.2 Route (F4) — a proposed API-contract addition.** Two **new** routes are proposed:
`POST /api/v1/questions/:id/archive` and `POST /api/v1/questions/:id/restore`. Both are guarded by the G4.1
authority plus the existing ownership assertion (`assertOwnership`).

- **Precedent, stated honestly.** `POST /learning/competencies/:id/archive` exists
  (`learning.routes.js:306`), but there is **no `/restore` route anywhere in the codebase** — the restore
  half is **new**, not mirrored. The draft also inherits a **legacy divergence**: objectives are archived
  through **`PATCH` with `status='archived'`** (`learning.routes.js:177-187`), not a `POST /archive` route.
  G4 deliberately adopts the **competency** shape (a dedicated status verb) and records the objective PATCH
  route as the legacy convention it does **not** follow — it does **not** claim to mirror every existing
  convention.
- **`DELETE /api/v1/questions/:id` — a contract change.** Today it is unconditional (204, cascading the
  criteria; `questions.routes.js:151-157`). Under G4 it **remains** for a question that has **never**
  contributed a confirmed mapping, and becomes an explicit **refusal** (never a silent cascade) once the
  G4.4 condition holds — a behaviour change on an existing route. The refusal is **HTTP 409** with the
  **established error shape** (`{ success: false, error: { code: 'CONFLICT', message } }` — `ConflictError`
  → 409, `src/shared/errors.js:44-48`, rendered by `src/backend/middleware/error.js:51-58`), naming the
  confirmed-mapping reason and directing the caller to **archive** instead.

**G4.3 Audit event (F6) — and the authoritative lifecycle stream (two stores, not one).**

- **Audit record.** `entityType: 'question'`, `action: 'archive'` and `action: 'restore'`, carrying
  `before`/`after`, written **in the same transaction** as the archival state change (the §10A atomicity
  rule), so an archived question cannot exist without its audit row.
- **Transaction wiring (required, not optional).** Today the audit row is written **after** the write and
  **outside** any transaction — `#audit` calls `auditSvc.log` (`LearningTaxonomyService.js:84-95`) and
  `AuditService.log` writes through its **own** repository (`AuditService.js:35-48`). To make the record
  atomic, the archive use-case must run the state change and the audit write through a **single**
  transaction-bound repository — the `runInTransaction(fn)` primitive released for Defect A (§20.1) — and
  write the audit row through an `AuditService` **bound to that same transaction repository**, not the
  container's default one. G4 must not repeat the after-the-write pattern.
- **The audit log is *not* the authoritative history.** `audit_logs` is **not** the store §6/G2 designate
  for historical reconstruction — that is the append-only **`CriterionReviewEvent`** stream (§6:892-903).
  The `archive`/`restore` **lifecycle events** that reconstruction reads **must be written to that
  authoritative stream** and **must not be recorded exclusively in the audit log**. The two are
  complementary: the audit log is the operator-facing trail; the lifecycle stream is what makes a past
  report reproducible (and it is the stream G2/§20.3 makes authoritative).

**G4.4 Lifecycle.**
- States: `active` (default) → `archived` → `active` (restore). Additive `Question.status`
  ∈ {`active`,`archived`} plus a nullable `archived_at`, matching the `OBJECTIVE_STATUS` /
  `COMPETENCY_STATUS` precedent and the proposed `Subject.status`. **`archived_at` is a *current-state*
  convenience field only** — it is **not** the historical record of archival (next bullet).
- **Historical archival intervals come from append-only lifecycle events, not from `archived_at` (F1).**
  G4.4 grants **restore**, so a question may be archived, restored and archived again; a **single mutable
  `archived_at`** cannot represent that sequence under *any* assignment (clear it on restore → the earlier
  interval is lost and a re-archive overwrites; keep it → the question reports as archived forever after
  the first archive). The §6 predicate `created_at <= D < archived_at` is therefore **valid only for the
  single-archival / no-restoration special case**, **not** the general lifecycle model (§6:921-925 already
  admits the general form — "or the corresponding lifecycle events"). The general model records
  `archive`/`restore` **lifecycle events** in the authoritative stream (G4.3), and "the question existed at
  `D`" is reconstructed from those events; `archived_at` remains only the fast current-state read.
- **Archive is refused while the question is used by a live assessment exam (F3) — *decided* 2026-11-21.**
  **Owner-decided scope:** archiving is blocked when the question is linked through `ExamQuestion` to an
  exam whose status is **`EXAM_STATUS.ACTIVE`**, whether it is a training or non-training exam. The
  `is_training` flag does **not** override exam lifecycle status: a `draft` or `archived` exam does *not*
  block, even when `Exam.is_training = true`. Thus the effective guard is status-based, not
  `status === ACTIVE || is_training`. Training is included among active exams because U10 lets training
  questions contribute equally to coverage, so archiving one would silently change a live training
  measure. **Games and tournaments do *not* block** either (owner decision 2026-11-21): they reference
  questions by id array and are formative practice, not learning records. The guard must distinguish these
  states rather than rely on the current `/usage` shape, which selects `exam: { id, name, is_training }`
  with **no `status`** (`questions.routes.js:78`) — so either `/usage` is extended with exam status **or**
  the guard queries exam status directly.
- **Hard delete is refused** for any question that **ever** contributed a confirmed mapping — i.e. any
  `CriterionReviewEvent` with `action='confirm'` for that question, not merely a *currently* confirmed
  criterion (§6, round-8 §2). The refusal is explicit and audited; the guidance is to **archive** instead.
  **This protection is *not enforceable* under the current schema and must not be claimed as implemented
  (F2).** `CriterionReviewEvent` does **not exist** in `prisma/schema.prisma`, and the `confirmed`
  reliability state does **not exist** either — `QuestionAssessmentCriterion.review_status` is
  `approved | needs_review` today (`prisma/schema.prisma:1298`), with `unreviewed` introduced by the
  §10A/U12 migration. Because `setCriteria` replaces criteria by **delete-then-create**, a *reset* criterion
  leaves **no trace at all** today, so a question whose criteria were reset can still be hard-deleted with
  nothing to check — exactly the round-8 §2 hole. The refusal is therefore a **co-packaged deliverable**
  with the §10A **evidence event stream** and the **U12 reliability states**: it becomes enforceable only
  when those ship, in the same Phase 1B package. **No interim refusal** based on criterion-row existence is
  adopted (it would catch only currently-reviewable rows and would give false assurance), and **T53 is *not*
  satisfied** until the required implementation exists.
- **Archiving preserves history:** it writes `archived_at` (*current state*), appends the `archive`
  lifecycle event (*history*), deletes nothing, and leaves the event stream and snapshots untouched. A
  question archived **before** `D` does not count at `D`; archived **after** `D` still counts at `D` (§6
  reconstruction — already decided; for a **restored** question the interval is read from the lifecycle
  events, per F1).
- **Restore** is an audited `restore` lifecycle event; the question re-enters current coverage unchanged (it
  never lost its criteria). **Restore does *not* reinstate the question into any exam, game, tournament or
  other association from which it was removed (F7)** — those linkages are **not** restored, and a
  re-inclusion is a separate, explicit edit.
- **Additive and effectively inert until its dependencies exist (F7).** The `status` field has **no
  consumer** until the coverage implementation ships, and the hard-delete refusal is unenforceable until
  the evidence stream / reliability states ship (above). G4's **decided** effect today is therefore the
  schema ask itself; its **enforceable** effect arrives with Phase 1B.
- **Interplay with the decided U14/U10 — no reopening.** G4 supplies the question-archive **state** and the
  **lifecycle events** the decided U14/U10 algorithms reference; the historical predicate
  `created_at <= D < archived_at` is the **single-archival special case** of those events (F1). Completing
  G4 therefore **supplies state/events the decided algorithms already reference** — it does **not** reopen
  U14 or U10.

**Disposition and implementation constraints.** The G4 choices were finalized and the complete normative
wording was **adopted by the owner on 2026-11-21 (E1, consolidated decision record §4)**. Adoption
completes the U15 archival decision's wording condition but authorizes **no code** (§19.6, §20.7). Two
guarantees are **dependent, not immediate**: the hard-delete refusal becomes enforceable only when the
§10A evidence stream and the U12 reliability states ship, and the `status` field has no consumer until
coverage ships (both above). Until those implementations exist, the draft must not imply that the
protections are currently enforced (F2/F7).

### 20.3 G2 — which subject value is authoritative (normative clause) — *implements an approved decision*

> **Owner acceptance (2026-11-21 — consolidation step 1):** the clause below, **including the F1 extension**,
> is **ACCEPTED** as the intended normative text. G2 itself was approved in §19.3; this confirms the
> *wording*.

§19.3 records G2 as **APPROVED**, with the meaning: *the historical event stream is authoritative; the
confirmation-time snapshot must not be treated as immutable current state.* §19.2 (U14) approves all three
layers. This is the clause G2 asked for, written as normative text, **extended by F1** so that it covers
question **archival intervals** as well as the subject value. The extension **adds no decision** and
**reopens nothing** — U10, U12, U13 and U14 stay decided (§19.2).

> **Normative.** In **historical** mode the subject of a confirmed mapping is `state(c, D).subject_id`,
> read from the `CriterionReviewEvent` stream as of `D` (the §6 reconstruction algorithm). The criterion's
> `subject_id_at_confirmation` column is a **denormalised convenience read used by current mode only**; it
> is **not** authoritative for history and is **not** treated as immutable current state after an
> authorised reclassification. If the two disagree, **the event stream wins for any date `D`**, and the
> divergence is surfaced by the consistency verifier (**T46**) rather than silently resolved.
>
> **Extension — question archival intervals (F1).** Whether a question "existed at `D`" is likewise
> reconstructed from the **authoritative lifecycle event stream** — the `archive`/`restore` events of
> **§20.2 G4.3** — for any date `D`. The **current-state** field `Question.archived_at` is a convenience
> read only: it is **not** authoritative for history and, because G4 permits **restore**, it **cannot**
> represent more than one archival interval. The single-field predicate `created_at <= D < archived_at` is
> therefore the **single-archival / no-restoration special case** only. In historical mode, **the lifecycle
> event stream wins for any date `D`** — for both the subject value *and* question existence — consistent
> with the clause above.

### 20.4 G3 — current coverage under an archived subject (normative clause) — *implements an approved decision*

> **Owner acceptance (2026-11-21 — consolidation step 1):** the clause below is **ACCEPTED** as the intended
> normative text. G3 itself was approved in §19.3; this confirms the *wording*.

§19.3 records G3 as **APPROVED**: *archived subjects retain historical coverage; current coverage must
clearly indicate an archived subject and must not silently treat it as an active curriculum.* This closes
the "undefined" gap G3 identified.

> **Normative.** When the subject of a class's assigned programme is **archived**:
> (i) **historical** coverage is unchanged — no snapshot and no event is touched;
> (ii) **current** coverage is still **computed and reported**, but every row for that class MUST carry an
> explicit `subject_archived: true` marker (with the subject label from the snapshot); the number is never
> presented as an active curriculum without that marker;
> (iii) **new publication** of a programme version or objective version against the archived subject is
> **blocked** (§6 U15 guarantee (iv));
> (iv) the class assignment is **not** silently frozen or deleted — the report reads "subject archived" and
> the operator decides whether to re-assign.

This keeps the U10 archived-subject limb consistent: archived **questions** and archived **subjects** are
both *reported*, never silently active.

### 20.5 U8 — D15 register row wording — **ACCEPTED 2026-11-21; recorded in the register (§14 item 9)**

§19.1 (U8) approved D15 **in principle** as the Phase 1B gate, with final wording to follow after the
remaining architecture decisions were resolved. The owner **accepted the wording below on 2026-11-21**
and authorized its recording in the decision register (consolidation step 4; §14 item 9). The row is now
recorded in `docs/PHASE0_DECISION_REGISTER.md`; this block preserves the accepted text for traceability:

> **D15 — Programme governance and objective versioning.**
> **Gate:** before **Phase 1B**. **Status:** open. **Recommended default:** as per P2/P3/P4/P10/P12 —
> official objectives are immutable once published and revised only by new versions (input e); a version
> bump requires an **explicit per-class adoption** and never moves a class automatically (U3); teachers
> import within their **assigned subjects**, enforced server-side (U2); governance mode is a school setting
> with an **audited** switch, where moving to a stricter mode re-evaluates existing rows and moving to a
> looser mode never silently grants reliability (U11). **Depends on:** U1–U5, U7, U9, U11 (approved, §19).
> **Informed by:** U10–U14 (approved, §19); U15 (approved **in principle**, §19; G4 owner choices finalized but full wording adoption pending, §20.2/§20.6); and G2/G3/G4 (§20.2–§20.4).

**Note:** the owner accepted this wording on **2026-11-21** and authorized recording it; the register entry
was added in consolidation **step 4** (three homes: §1 summary row, §2 detailed entry, §3 dependency row).
G4 (question archival) appears under "informed by", **not** "depends on" — D15 governs programmes and
objective versioning, and does not itself depend on archival. *(Status note: the block above is preserved
verbatim as accepted at that step; the G4 wording it describes as pending was adopted later the same day
(E1, §20.2/§20.7), and D15 was substantively approved (F1, §20.7), closing U8.)*

### 20.6 Still open after this section

> **Superseded 2026-11-21 (later the same day) by the owner's consolidated decision record; see §20.7.**
> The list below records what was still open after consolidation steps 1–4, before that record arrived.

1. **G4 / U15** — *(resolved by §20.7: the wording was adopted, E1; U15's wording condition is satisfied)*
   the **owner choices are FINALIZED 2026-11-21** (blocking scope: active exams, including active training
   exams; `draft`/`archived` exams do not block even if `is_training = true`; games/tournaments do not
   block — G4.4 F3). Two guarantees are **dependent, not immediate**: the hard-delete refusal is
   enforceable only once the §10A evidence stream and the U12 reliability states ship, and `status` has no
   consumer until coverage ships (F2/F7).
2. **U8 / D15** — *(resolved by §20.7: D15 substantively approved, F1; U8 closed)* **wording ACCEPTED
   2026-11-21** and recorded in the decision register (consolidation step 4; §14 item 9).
3. **G2 / G3** — **ACCEPTED 2026-11-21** (consolidation step 1); the §20.3/§20.4 clauses implement
   already-approved meanings and their wording is confirmed. **They remain accepted** and are not reopened
   by the consolidated record.
4. **U6** — console placement; deferred, blocks nothing (§4.2 of the review document). **Still deferred
   after the consolidated record (§20.7, J).**
5. **Owner authorization for any Phase 1B implementation** (§19.6). **Still required after the
   consolidated record (§20.7, J): Phase 1B remains explicitly unauthorized.**

**Explicitly NOT reopened:** U10, U12, U13, U14 (decided in §19.2) — §5.1 of the review governs; §16.4's
"UNRESOLVED" rows remain the *pre-decision* record.

### 20.7 Consolidated owner decisions — final for this round (2026-11-21)

The owner issued a consolidated decision record on 2026-11-21. It authorizes **documentation
reconciliation only** — no source-code, schema, migration, API/route, frontend or test change, no new
implementation work, no Git history rewriting, and **no Phase 1B implementation**. Its dispositions:

| Item | Decision | Recorded effect |
|---|---|---|
| **WP5** | **A2 — NOT ACCEPTED** | WP5 is implemented but not accepted; a further owner review of the corrected console is required. Implementation completion, test completion, WP6 authorization and WP7 authorization do **not** constitute acceptance; no acceptance may be inferred from "continue". (Phase 1 record: `docs/PHASE1_PROGRESS.md`.) — **Superseded 2026-11-21 (later): WP5 is accepted by the owner** (the refactored Questions-tab integration incl. the authorized UI/UX remediation; the separate teacher Learning Console is no longer the accepted teacher workflow). A2 is preserved above as history and is not rewritten; the B1 correction discipline is unchanged. |
| **WP5 record** | **B1 — correction authorized** | The inaccurate "accepted 2026-11-19" claim is qualified at its source; chronology preserved; no commit rewritten. |
| **G4 archival guard** | **C1 — Option 2 confirmed** | Archival is blocked while the question is linked to an exam whose actual lifecycle status is `EXAM_STATUS.ACTIVE`, summative or training; `draft`/`archived` exams (including training), games and tournaments do **not** block; the guard is status-based, not the training flag (§20.2 G4.4 F3). |
| **G4 restore** | **D1 — no automatic reassociation** | Restoring reinstates the question only; prior exam/game/other activity associations are never automatically reactivated; reassociation is explicit (§20.2 G4.4 F7). |
| **G4 permissions** | **D1 — existing model preserved** | Teachers archive only questions they are authorized to manage (`class.learning.classify`, own questions); admins any (`school.learning.manage`); no new approval workflow and no head-of-department role (§20.2 G4.1). |
| **G4 wording / U15** | **E1 — final wording ADOPTED** | The complete G4 wording (§20.2, incorporating C1/D1) is formally adopted as documentation; U15's outstanding wording condition is **satisfied**. Adoption authorizes no implementation. |
| **D15** | **F1 — substantively approved** | The recommended default is accepted unchanged: immutable published official objectives; explicit per-class adoption (no automatic moves); server-side-scoped imports; audited governance setting. Recorded in `docs/PHASE0_DECISION_REGISTER.md` **separately** from the earlier wording-only acceptance. The register entry preserves the detailed D15 meaning and does not broaden it. |
| **G2 / G3** | **Remain accepted** | Not reopened or reversed; §20.3/§20.4 stay as recorded. |
| **U8** | **CLOSED after D15** | Closed because D15's substantive decision is recorded in the register — not by a label change alone. |
| **Document authority** | **I1 — hierarchy ratified with owner-provenance safeguards** | `PHASE0_DECISION_REGISTER.md` (normative Phase 0 decisions + phase gates), `phase 01.md` (frozen Phase 1 scope), `PHASE1_PROGRESS.md` (Phase 1 status), `DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` (evolving architecture + recorded dispositions), `ARCHITECTURE-BASELINE.md` (navigation/index only, never an independent source of approval), `ADR-0001` (proposed unless separately approved). Safeguards (recorded in `docs/ARCHITECTURE-BASELINE.md` §2.1): explicit owner decisions from ChatGPT conversations are valid provenance; an agent must never infer approval from implementation authorization, "continue", silence, test completion or its own documentation; agent-authored approval claims establish nothing; a later explicit owner decision beats an earlier agent interpretation; the baseline cannot create, modify or supersede owner decisions or phase gates; unresolved provenance is labelled, not presented as decided. |
| **U6 / Phase 1B** | **J — U6 deferred; Phase 1B NOT authorized** | U6 remains deferred and blocks nothing. Phase 1B remains explicitly unauthorized despite the D15 and G4 decisions; a separate explicit owner authorization is required. |

**Boundary.** Nothing in §20.7 authorizes implementation of any kind. **Update 2026-11-21 (later): WP5 and
WP7 are accepted by the owner; Phase 1 is ready for formal closure review** subject to record
reconciliation and safe preservation of the accepted deliverables; **Phase 1B remains unauthorized**;
ADR-0001 remains **Proposed**.

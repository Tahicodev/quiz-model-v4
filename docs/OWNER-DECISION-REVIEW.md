# OWNER DECISION REVIEW — Curriculum Programmes, Versioning and Coverage

**Status: ANSWERED — OWNER RESPONDED 2026-11-20 (see §9).** This document decided **nothing** itself; it
existed to let the owner answer the unresolved questions in `docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`
(Revision 3.5) deliberately. Every "Recommendation" below is a **recommendation, not a decision**, and the
owner answered several of them differently. The owner's answers are now recorded in the draft's **§19**
and are summarised in **§9** below.

**Date:** 2026-11-20 · **Author:** agent, on owner request · **Derives from:** Revision 3.5 of
`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` (the only source of the proposals; where this document
summarises a proposal, the draft governs) · **Implementation:** frozen; nothing here authorises a schema
change, migration, service, route, frontend or test change. The owner's initial approval **chooses the
architecture** but authorises **no** implementation (draft §19.5–§19.6).

---

## 0. What this document is, and how to use it

- It reviews **U1–U15** exactly as the draft records them (`DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md`
  §16.4, lines 2038–2054).
- It does not re-open rounds 1–8, does not restate the `CriterionReviewEvent`, historical-reconstruction,
  criterion-identity, archival or T52–T55 material, and does not propose a new documentation round.
- It separates three kinds of open item, because they need different answers:
  1. **Decisions** (U1–U15) — the owner chooses.
  2. **Process gates** — items that must be authorised by the owner, not chosen architecturally
     (recording **D15**, releasing the **Defect A / Defect B** fixes, writing the §14 edits).
  3. **Documentation observations** — small internal imprecisions found while reviewing; listed in §5 and
     **not edited** (a correction needs approval first, per the standing freeze).

**Standing constraints assumed throughout:** the architecture stays a **DRAFT** whose proposals the owner
has now **decided** (draft §19); U1–U15 were unresolved when this review was written and are **answered**
as of §9 below; ADR-0001 stays **Proposed**; no implementation, no migration, no merge, no push, no
Phase 2, no AI.

---

## 1. Executive summary — architecture readiness

**The architecture is ready to be decided, not yet ready to be built.** The design is coherent and the
reviewer has accepted every structural proposal it examined (P5 "I would not redesign it"; P10-A/P11-A/
P12-A accepted and closed). What remains is **fifteen owner decisions**, of which **five form one
indivisible cluster** (U10/U12/U13/U14/U15) that must be answered together because they all touch the
same object: *what a "reliable, historically reproducible mapping" is*.

| | Count | Items |
|---|---|---|
| Unresolved owner decisions | **15** | U1–U15 (§16.4) |
| Recommended by the draft and by the reviewer | 13 of 15 | U1–U5, U7, U9, U11, U13, U14, U15 (two are blended) |
| Genuinely open, no strong lean | 2 | U6 (console placement), U5 (cumulative packs in v1) |
| Already constrained/settled by an accepted owner input | 3 | U3 (by input **e**), U11 (by input **d**), U1 (by §0.4 assumption 2) |
| Required **before any implementation** | 11 | U1, U2, U3, U4, U9, U10, U11, U12, U13, U14, U15 |
| Safely deferrable | 3 in practice | U5, U6, U7/U8 (process) |
| Non-decision blockers | 3 | Defect A (live integrity risk), Defect B (silent truncation), D15 not recorded |

**Why the cluster matters.** Coverage is the feature the whole revision exists for. Three independent
mechanisms decide whether a number is defensible: *which criteria count* (U10, U12), *what happens when
the resolved subject moves* (U13, U14), and *whether the identity of a deleted subject or question
survives* (U15). Deciding any one of them alone produces rework in the other four — §6 of the draft
already documents the chain (predicate → snapshot → event stream → archival).

**What is genuinely blocking.** U10, U12, U13, U14, U15 must be settled before P11/P5 can be implemented
at all. Defect A must be fixed before the confirmation workflow can be trusted (§10A calls the
transactional `setCriteria` a **precondition**, and §13.1A calls A a live integrity risk). Defect B must
be fixed before coverage/import/bulk tagging enumerate objectives, or those features silently operate on
a truncated set above 1,000 rows. **No contradiction was found that makes the architecture impossible**;
§5 lists two real gaps and two ambiguities that are cheap to close before coding.

**Effort is not the blocker.** §11 of the draft already sizes the work (L for programmes, M for
versioning, M for the historized assignment, S–M for coverage/review). The blocker is *decisions*.

---

## 2. Decision register U1–U15

Each decision is given the eight points requested: **decision to make · current proposal · alternatives ·
consequences · dependencies · recommendation · reversibility · implementation impact**. Where the draft
records a reviewer recommendation, it is quoted (§17.6).

### At a glance

| # | Decision (short) | Draft recommendation | Blocks implementation? | Reversibility if changed later |
|---|---|---|---|---|
| U1 | `level`/`track` storage | free-text strings | Yes (schema) | Easy–moderate (backfill to a catalogue) |
| U2 | Professor import scope | scoped to assigned subjects | Yes (route policy) | Easy |
| U3 | Version-bump adoption | explicit per-class adopt | Yes (workflow) | Easy once historized; **auto-adopt conflicts with input (e)** |
| U4 | Coverage denominator | all members of the assigned version | Yes (query semantics) | Moderate — reported numbers move |
| U5 | `cumulative` packs in v1 | keep out of v1 | No | Easy (importer feature) |
| U6 | Console placement | undecided | No (UI only) | Easy |
| U7 | Roadmap naming | option B (Phase 1B only) | Docs gate | Cheap, but touches the normative register if A |
| U8 | Record D15 | yes, owner-only | Process gate | Cheap |
| U9 | Local visibility default | `private` | Yes (schema default) | Easy technically; visible behaviourally |
| U10 | Coverage counting policy | §6 rules, **explicitly unresolved** | **Yes — core** | Moderate — numbers move; history helps |
| U11 | `imported` trust rule | mode-dependent + audited | Yes (workflow/audit) | Tightening easy, loosening risky |
| U12 | Legacy criterion reliability | explicit confirm only, never auto | **Yes — integrity** | **Hard/irreversible if done wrong** |
| U13 | Subject consistency enforcement | hard-block at write+confirm | **Yes — integrity** | Moderate (stricter→looser needs data work) |
| U14 | Historical subject reproducibility | guard **+** snapshot **+** events | **Yes — integrity** | **Irreversible if events are not adopted early** |
| U15 | Subject/question identity across deletion | archive subjects + archive questions | **Yes — integrity** | **Irreversible if destructive deletes continue** |

---

### U1 — How are `level` and `track` stored?

- **Decision to make:** free-text strings, or a school-managed catalogue (a table with a controlled list)?
- **Current proposal:** free text, with normalisation and validation (§12 q1; §13.3; §16.4 U1;
  reviewer: "free text initially, with normalisation and validation", §17.6).
- **Alternatives:** (a) free text + normalisation (proposed); (b) `Level`/`Track` catalogue tables with
  FKs; (c) free text now, catalogue later behind the same service API.
- **Consequences:** *Technical* — free text needs no new table and no FK changes, but duplicate detection
  (§2 A.5) and grouping must normalise case/whitespace/accents, and misspellings create phantom
  "different" levels. A catalogue gives referential integrity and clean grouping, at the cost of two new
  tables, admin UI, and a migration that maps existing strings (which may be many-to-one). *Pedagogical* —
  a catalogue makes "6e / Grade 6 / Year 7" one thing for the school; free text lets each school use its
  own words but risks the same level appearing twice and programmes not sharing.
- **Dependencies:** none. Interacts with P1 (`level`/`track` are *attributes of the logical programme*,
  fixed across versions — §2) and with duplicate detection.
- **Recommendation:** **(a) free text with a normalised comparison key**, and keep the door open for (c).
  The reviewer reached the same conclusion; the school vocabulary is not stable enough to freeze into a
  table in v1, and the model already treats these as programme attributes, so a later catalogue is an
  additive change.
- **Reversibility:** easy–moderate. Moving strings → catalogue later is a backfill plus a mapping review;
  no history is destroyed because `programme_key` (not level/track) carries identity.
- **Implementation impact:** if free text — schema unaffected beyond what P1 already adds; a normalisation
  helper in `ProgrammeService`, validation in the zod schemas, and a duplicate-detection hint. If a
  catalogue — new models + back-relations + migration + admin UI + `bulk.routes.js` stores.

---

### U2 — May a professor import a programme for a subject they do not teach?

- **Decision to make:** import scoped to the subjects the professor is assigned to, or open to any subject
  in the school?
- **Current proposal:** scoped to assigned subjects (§12 q2; §13.5; §16.4 U2; reviewer: "Restrict import
  to the subjects the professor is assigned to", §17.6).
- **Alternatives:** (a) assigned subjects only; (b) any subject in the school for authoring, with the
  normal verification/publication gate still applying; (c) school setting, like governance modes.
- **Consequences:** *Technical* — (a) needs an enforcement point that resolves the professor's subjects
  (`TeacherAssignment`, schema 927 — which has `class_id`, no subject) against the target programme's
  `subject_id`; (b) needs no extra check but widens the authoring surface; (c) adds a setting. *Pedagogical*
  — (a) keeps curriculum authoring with the people who teach it and matches (c) "professors teaching the
  same subject, level and track share one official programme"; (b) risks a professor creating an official
  programme for a subject they never teach, which someone else then has to adopt, and is a mild duplicate
  hazard.
- **Dependencies:** none strictly; if (c) is chosen it becomes part of the governance-mode model (P3,
  §4), which the owner already accepted in principle via input (d).
- **Recommendation:** **(a)**, enforced at the route/service layer, with the "subject the professor
  teaches" derived from the class configuration/`TeacherAssignment` set. The verification gate is not a
  substitute for scope — a proposal from a non-teaching author still lands in an admin's queue.
- **Reversibility:** easy. It is a policy check; loosening or tightening later changes who may call one
  endpoint, not stored data.
- **Implementation impact:** `ProgrammeService`/import route scope check; if a new permission string is
  preferred (`class.learning.import`, §13.5 option 2) that is one catalog row + one route guard; a test in
  the mode-by-role matrix (P8) for professor-not-assigned → 403.

---

### U3 — Does a version bump need an explicit per-class adopt?

- **Decision to make:** explicit per-class "adopt version N+1" (recommended), or a per-school auto-adopt
  setting?
- **Current proposal:** explicit per-class adoption, "matches (e)" (§12 q3; §13.4; §16.4 U3; reviewer:
  "Explicit per-class adoption", §17.6).
- **Alternatives:** (a) explicit per-class (proposed); (b) per-school auto-adopt; (c) explicit per-class
  with an optional bulk "move all classes on programme X" action (deferred, §12; §5B says no bulk move in
  v1).
- **Consequences:** *Technical* — under P12 a move is always a **close-and-open of a historized
  assignment** (§5B), so even (b) writes history rather than overwriting it; the difference is whether a
  human decides. (b) additionally needs a rule for *when* it fires and how a mid-year switch is prevented.
  *Pedagogical* — (e) is an accepted owner input: *"a new version never moves classes automatically"*
  (§1, input e). **(b) contradicts (e) as written.** (a) keeps the class's curriculum stable until a
  deliberate, audited decision, which is what makes past coverage and future evidence comparable.
- **Dependencies:** depends on P12 (already designed) and interacts with U10 (a move changes the
  denominator — the draft says only by that visible action, §6).
- **Recommendation:** **(a)** — and note that (b) is effectively excluded by input (e); the owner may still
  choose (b) only by explicitly revising (e), which would be reopening an accepted input.
- **Reversibility:** easy once historized. Because every move is an assignment row, switching from
  explicit to automatic later does not rewrite the past; switching the other way is equally safe.
- **Implementation impact:** the "adopt version N+1" admin action (route + permission + audit
  `entityType: 'class_programme_assignment'`), plus the as-of-date reads in coverage (§5B/P5). No schema
  beyond P12's table.

---

### U4 — What is the coverage denominator?

- **Decision to make:** all official published objectives of the assigned programme version, or only those
  linked to the class's subject?
- **Current proposal:** all members of the exact assigned programme version (§12 q4; §6; §16.4 U4;
  reviewer: "All eligible official objectives in the exact assigned programme version", §17.6).
- **Alternatives:** (a) every member objective of the assigned version (proposed); (b) members whose
  `subject_id` equals the class's subject.
- **Consequences:** *Technical* — the two options **converge by construction**: §6 requires every member
  objective to satisfy `o.subject_id = P.subject_id` (invariant, §6 lines 746–750) and requires
  publication to validate exactly that (§6 publication-time eligibility). A programme version is itself
  subject-bound. So (b) is (a) with a redundant filter — see §5, observation **G1**. *Pedagogical* — if the
  convergence were ever broken (a member of a different subject), that would be a data-integrity defect,
  not a policy choice; the denominator would silently become "the classes' subjects in this programme",
  which nobody has asked for.
- **Dependencies:** intertwined with U10 (what *counts* inside the denominator) and with P10/P5's
  membership rules.
- **Recommendation:** **(a)**, while recording explicitly that (b) is equivalent *because* membership is
  subject-validated — so the owner confirms a reading rather than choosing between two live options.
- **Reversibility:** moderate. The denominator is a reported number; changing it later moves historical
  numbers unless historical reports are read from the frozen membership (they are — §6), so a change is
  visible but not destructive.
- **Implementation impact:** the coverage query's group-by scope only; no schema. Tests T10/T27/T37.

---

### U5 — Is `cumulative` needed for packs in v1?

- **Decision to make:** support cumulative packs now, or require "exactly one version behind"?
- **Current proposal:** keep cumulative packs out of v1 unless a real workflow needs them (§12 q5; §8 P7;
  §16.4 U5; reviewer: "Keep cumulative packs out of v1 unless a real workflow requires them", §17.6).
- **Alternatives:** (a) delta-only, exactly one version behind (proposed for v1); (b) `cumulative: true`
  supported from the start; (c) delta-only now, format reserves the flag so packs stay forward-compatible.
- **Consequences:** *Technical* — (b) means the importer must replay a chain (and validate that every
  intermediate version's objectives exist), which is the most complex part of the pack importer; (a) is a
  single `from_version` equality check (T6). The pack format is JSON with `schema_version`, so (c) costs
  nothing today. *Pedagogical* — cumulative packs reduce friction for schools that have fallen several
  versions behind; without them those schools must import each delta in order.
- **Dependencies:** none. Purely a P7 scope question.
- **Recommendation:** **(c)** — ship (a), reserve the flag, and revisit when a real school is more than one
  version behind. This is the reviewer's position and it keeps the importer small.
- **Reversibility:** easy. Adding cumulative support later is an importer feature plus tests; no data
  migration.
- **Implementation impact:** importer scope and tests T6/T21/T22 only. No schema, no UI.

---

### U6 — Where does the programme/verification console live?

- **Decision to make:** the existing console Learning page, or the legacy admin UI (the question-editor
  placement decision)?
- **Current proposal:** **open** — decide after reviewing the existing Learning console and admin
  navigation (§12 q6; §16.4 U6; reviewer: "Decide after reviewing the existing Learning console and admin
  navigation", §17.6).
- **Alternatives:** (a) console Learning page; (b) legacy admin UI; (c) taxonomy/verification in the
  console, question classification in the legacy editor (§13.8 already assumes the legacy editor is where a
  teacher classifies a question).
- **Consequences:** *Technical* — this decides which frontend bundle carries the new screens
  (`src/frontend/console/*` vs `admin.js`), and therefore which build and tests change. *Pedagogical/
  workflow* — teachers live in the question editor; a verification queue a teacher never sees is a queue
  that does not get cleared. Splitting (c) keeps each action where its actor already works but needs a
  consistent state model across two UIs.
- **Dependencies:** none technical; interacts with P8's mode-by-role matrix and with §14's documentation
  edits.
- **Recommendation:** **(c) as a working hypothesis**, but this is genuinely an owner/product call and the
  draft is right to leave it open. It is the least costly of the fifteen to decide last, because it changes
  no stored data.
- **Reversibility:** easy. UI placement is a presentation choice; the routes/services underneath are
  unaffected.
- **Implementation impact:** frontend bundles, console settings section (`learning.mode`, §4), the review
  queue screen, and the corresponding integration tests.

---

### U7 — Adopt the future 7-phase naming now, or record it as a target?

- **Decision to make:** option A (renumber now, rewrite the decision-register gate rows) or option B
  (insert Phase 1B only, prefix the platform documents, record the 7-phase target as the end state)?
- **Current proposal:** **B now, A recorded as the target** (§13.11; §16.4 U7; reviewer: "Option B:
  preserve the seven-phase target and insert Phase 1B only", §17.6).
- **Alternatives:** (a) adopt the target now; (b) Phase 1B only + prefix platform docs + target recorded
  (proposed); (c) leave the collision.
- **Consequences:** *Technical/documentation* — (a) touches the **normative** gate table
  (`PHASE0_DECISION_REGISTER.md` §3) and every cross-reference, and it must prove no approved obligation
  (D8/D9/D10) disappears (§13.11); (b) is minimal churn with the same disambiguation; (c) leaves two
  different "Phase 5"s alive in every future conversation. *Pedagogical* — none directly; it governs which
  obligations gate which phase.
- **Dependencies:** must be decided **together with U8**, because §14 items 1 and 9 (insert Phase 1B with
  gate D15; add D15 to the register) are written differently under A and B.
- **Recommendation:** **(b)** — matches the reviewer, preserves the accepted roadmap, and keeps the
  renumbering a separate deliberate change.
- **Reversibility:** documentation-only; cheap, except that adopting (a) and reverting would churn the
  normative register twice.
- **Implementation impact:** none on code. Amends `ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2, the decision
  register §3, and `PHASE5_REPORT.md`'s header — all only if approved (§14 items 1, 9, 12).

---

### U8 — Record **D15** in the decision register?

- **Decision to make:** add **D15 — Programme governance and objective versioning** with the gate "before
  Phase 1B", status *open*?
- **Current proposal:** yes, proposed and owner-only (§13.12 row 5; §14 item 9; §16.4 U8; reviewer:
  "Record D15 once the architecture decisions are approved", §17.6).
- **Alternatives:** (a) record D15 with a "before Phase 1B" gate; (b) fold programme governance under the
  already-approved D2; (c) no new decision id.
- **Consequences:** *Technical/documentation* — (b) would overload an approved decision with matters it was
  not written for (the draft argues this explicitly); (a) gives Phase 1B a named gate and keeps the
  register normative. *Process* — until D15 exists, Phase 1B has no registered gate, so starting it would
  break the project's own gating discipline.
- **Dependencies:** coupled to U7 (§14 items 1/9) and, logically, to the answers of U1–U5, U9–U15 that D15
  would summarise.
- **Recommendation:** **(a)**, but recorded **only after** the architecture decisions are answered — a gate
  that says "open" for months is noise. Sequence it after the §6 cluster (§6 of this document).
- **Reversibility:** cheap; a register row can be edited, though editing an approved register row needs the
  owner.
- **Implementation impact:** docs only. No code, no schema.

---

### U9 — Default visibility of a local objective?

- **Decision to make:** default `private` (recommended), or `class`/`school` for some kinds?
- **Current proposal:** `private` for all local/personal rows (§5 P4; §13.8 item 8; §16.4 U9; reviewer:
  "Private by default", §17.6).
- **Alternatives:** (a) `private` by default (proposed), widening only by deliberate audited action;
  (b) `class` default for objectives derived from an official parent; (c) `school` default in some modes.
- **Consequences:** *Technical* — the default is one column default plus the read filters (§5); (b)/(c)
  would make teacher-authored material visible school-wide without an action, so the visibility filter
  becomes load-bearing for confidentiality. *Pedagogical* — (a) matches (f) ("professors freely add local
  sub-objectives and extensions") while keeping authorship private; a teacher can still share
  deliberately. (b)/(c) would surprise teachers whose drafts become visible, and would widen the surface on
  which two teachers' extensions appear to conflict (§13.8 item 8).
- **Dependencies:** none. Sits inside P4 (already designed, §5).
- **Recommendation:** **(a) `private`** — the most restrictive default, widening always explicit and
  audited. It is also the draft's stated assumption.
- **Reversibility:** easy technically (default value, no data rewrite) but behaviourally visible: changing
  the default later changes what new rows do, not what existing rows did.
- **Implementation impact:** schema default, visibility filters in reads, zod schema (`scope`/`visibility`
  accepted but cannot be escalated by a client), tests T15–T17.

---

### U10 — The coverage counting policy (**explicitly unresolved**)

- **Decision to make:** confirm or change the *proposed* counting rules in §6: the `weight > 0` clause;
  deleted vs archived questions; exam-used vs unused; independent parent/child counting; distinct-objective
  de-duplication; and **how an archived question affects *current* coverage**.
- **Current proposal:** **none decided** — §6 states the rules as *proposed* and §16.4 records U10 as
  "**UNRESOLVED — not decided by §6**"; the owner must confirm them explicitly (§6 lines 1015–1046; §16.4
  U10 line 2049; §17.6 U10).
- **Alternatives:** confirm the §6 rules as a package, or amend specific clauses. Realistic variants:
  (i) `weight > 0` required (proposed) vs `weight = 0` allowed to count; (ii) exam-used and unused count
  alike (proposed) vs exam-used weighted higher; (iii) archived questions count for current coverage or
  not; (iv) de-duplicate by objective version id (proposed) vs trust row counts.
- **Consequences:** *Technical* — (i) implies the validator's current permission of weight exactly `0`
  must not silently count (already noted, §6); (iii) cannot be answered until a question-archive state
  exists (U15) — so U10's archived-question limb is **downstream of U15**. *Pedagogical* — this is the
  single most visible number to teachers: it decides what "covered" means. Counting a zero-weight
  criterion would claim coverage that no assessment actually measures; counting archived questions would
  claim coverage from material no longer in use; weighting exam-used questions is a *different measure*
  and should not be smuggled into this one (§6 says question-mapped is not mastery).
- **Dependencies:** depends on **U15** (archived questions) and on **U14** (whether counting is current or
  historical). Interacts with **U12** (which criteria are reliable) and **U4** (denominator scope).
- **Recommendation:** **confirm §6's proposed rules**, with the archived-question limb expressed as: an
  archived question counts for historical coverage as of the dates when it was live, and for current
  coverage only if the owner says so — the draft deliberately leaves the latter open. Do not adopt
  exam-usage weighting inside this measure.
- **Reversibility:** moderate. Changing the policy changes reported numbers, but because membership is
  frozen and (if U14 is adopted) the review history is preserved, past reports stay explainable; the change
  is a visible policy change rather than a data loss.
- **Implementation impact:** the coverage service (group-by semantics), the coverage endpoint's payload
  labels (three measures, never one percentage), unit tests for each excluded category (§6 notes one test
  per exclusion), T10/T27/T37/T38/T49, and any report/export that displays coverage.

---

### U11 — The trust rule for `imported` "official" packs

- **Decision to make:** is an authorised publisher's import sufficient for `imported` rows to become
  reliable, or must an admin verify every time?
- **Current proposal:** **mode-dependent** — under a mode that permits direct publication, the authorised
  actor's publish is the trust decision; under stricter modes an admin verifies — and the decision is
  **recorded (actor + action)**, never inferred from the file (§10A; §13.5; §16.4 U11; reviewer:
  "Mode-dependent, with backend-enforced authorisation and audit", §17.6).
- **Alternatives:** (a) mode-dependent + audited (proposed); (b) admin-verify-always; (c) file-declared
  trust (rejected as self-certifying, §10A).
- **Consequences:** *Technical* — (a) needs the three distinct audited actions (import / verification /
  publication, §13.5) and a `source='imported'` row that stays non-reliable until the recorded decision;
  (b) forces an admin even where input (d) allows direct publishing. *Pedagogical* — "official" must mean
  *verified*, or coverage silently rests on a file's own claim; (d) already states the school may let
  professors publish directly **audited**.
- **Dependencies:** **substantially constrained by input (d)** ("the admin verifies with one click, or a
  school setting lets professors publish directly (audited)") — so the owner is confirming how the
  existing setting is expressed, not inventing a rule. Interacts with P3's mode presets and with U13
  (confirmation-time subject check still applies to imported rows).
- **Recommendation:** **(a)** — it is what (d) already implies; make the trust decision an explicit,
  auditable backend record and keep `ai_suggested` never reliable (§10A).
- **Reversibility:** tightening later is easy (fewer rows become reliable); loosening later is riskier
  because it would retroactively legitimise rows that were imported without a recorded decision — hence
  decide before any import runs.
- **Implementation impact:** `source`/`review_status` values + validation (P11), the trust-decision record,
  three audit events, the mode resolver (P3), tests T11/T12/T13 and the mode-by-role matrix.

---

### U12 — May legacy criteria be auto-promoted to `confirmed`?

- **Decision to make:** may a legacy criterion be promoted to `confirmed` from the per-*question*
  `pedagogy_reviewed_at` stamp, or only by an explicit confirm/adopt?
- **Current proposal:** **explicit confirm/adopt only**; legacy `approved`/`needs_review` migrate to
  `unreviewed`, so **historical reliability starts at zero** (§10A round-4 finding; §16.4 U12; §17.6 notes
  there is **no reviewer recommendation** — the agent raised it).
- **Alternatives:** (a) explicit confirm only, migration to `unreviewed` (proposed); (b) auto-promote from
  the question stamp; (c) auto-promote only where the delegate confirms the question *and* the criterion's
  subject check passes.
- **Consequences:** *Technical* — (b) would write `confirmed` rows from a stamp that is **per question**
  while a question carries **several** criteria (§10A: revising the question does not validate each
  mapping), and `approved` is a **derived default**, not a review event (§10A round-4) — so (b) would
  fabricate confirmations. *Pedagogical* — the reliability of a mapping is the basis of Phase 2 evidence
  quality; auto-promotion would claim a teacher validated mappings no teacher looked at. (c) narrows the
  fabrication but still infers validation from a different act.
- **Dependencies:** interacts with **U13** (the confirmation-time subject re-check) and with **U11**
  (imported rows reach reliability by the trust path, not by this one).
- **Recommendation:** **(a)** — no automatic confirmation, and the migration records zero reliability
  honestly. This is also the option that keeps the historical event stream in §6 meaningful (genesis
  events are `null → unreviewed`, §6 lines 978–988).
- **Reversibility:** **hard / effectively irreversible if done wrongly.** Once `confirmed` rows exist that
  no human confirmed, the review history is false and cannot be cleanly undone (you cannot distinguish
  fabricated confirmations from real ones after the fact). This is why it must be decided *before* the
  migration runs.
- **Implementation impact:** the data migration mapping, `confirmCriterion`, the review-queue
  pre-selection (the question stamp may **pre-select**, never confirm), tests T11/T41/T45.

---

### U13 — Hard-block cross-subject criterion writes, or warn only?

- **Decision to make:** should the backend **hard-block** cross-subject criterion writes/confirmations
  (recommended), or warn and exclude them from coverage? And what happens to **pre-existing** cross-subject
  rows (the check is absent today, so they may exist)?
- **Current proposal:** hard-block at write **and** confirm; pre-existing rows **quarantined and reported,
  never auto-rewritten** (§6 subject-consistency block; §16.4 U13; §17.6 U10-adjacent).
- **Alternatives:** (a) hard-block + quarantine report (proposed); (b) warn, store, exclude from coverage;
  (c) hard-block new writes and auto-demote pre-existing inconsistent rows to `unreviewed`.
- **Consequences:** *Technical* — (a) is enforceable at criterion write/confirm time and at programme
  publication (three check points, §6 lines 774–780); (b) leaves inconsistent rows permanently in the
  database and makes coverage depend on a filter rather than on data integrity; (c) silently changes
  existing rows' reliability, which the draft explicitly refuses ("never auto-rewrites"). *Pedagogical* —
  a French question mapped to a Mathematics objective is not a nuance, it is a mis-classification; storing
  it (b) means the next reader may trust it.
- **Dependencies:** **same cluster as U14** — U13 is the write-time half of the same relationship guard
  U14 needs for reproducibility. Also depends on **U15** for what "the subject" means when a subject is
  archived.
- **Recommendation:** **(a)**. Also note the honest limitation the draft states: the guard is
  **service-path enforcement plus a verifier**, not a database constraint (a raw-SQL trigger would be
  documented drift, §6 lines 865–872) — so the *quarantine report* is the mechanism that makes existing
  inconsistencies visible.
- **Reversibility:** moderate. Moving from hard-block → warn later is trivial; moving warn → hard-block
  later requires cleaning up rows created in the meantime, which is exactly the pre-existing-row problem
  the owner is being asked about now.
- **Implementation impact:** validator (`pedagogy-validator.js`) + `QuestionPedagogyService.setCriteria`
  and `confirmCriterion` subject checks; publication-time validation (P5); a migration/quarantine report;
  tests T39/T40/T43/T46.

---

### U14 — How is historical subject reproducibility achieved? (held open by the reviewer)

- **Decision to make:** choose the mechanism (or combination): (a) an immutability guard on the
  **relationship** `Question → Category → Subject` across all five mutation paths; (b) a
  confirmation-time subject snapshot on the criterion; (c) an append-only **`CriterionReviewEvent`** review
  history with the complete mapping identity and a defined reconstruction algorithm.
- **Current proposal:** **all three** — guard the relationship **+** snapshot at confirmation **+** event
  stream (with genesis events and the `latest event ≤ D` reconstruction rule) (§6 lines 804–1013; §16.4 U14
  line 2053; §17.6). The reviewer accepted rounds 6–7 and **withheld U14 pending round-8 clarifications,
  all now documented** (§17.19–§17.21), so U14 is still **held open**.
- **Alternatives:** (a) guard only; (b) snapshot only; (c) events only; (d) all three (proposed).
- **Consequences:** *Technical* — the draft states the trade-offs plainly: guard-only cannot defend a
  number once an authorised reclassification happens; snapshot-only leaves live resolution free to drift
  for provisional rows; events-only cannot prevent the *current* number from being silently wrong before a
  report is taken, and the guard is what keeps the common case from happening at all. The five mutation
  paths the guard must cover are enumerated in §6 (category `subject_id`; question re-parenting; subject
  deletion; category deletion; import/bulk/restore), and the enforcement available today is
  **service-path + verifier**, not a database trigger. *Pedagogical* — this is what makes a coverage report
  *defensible after the fact*: a class's reported coverage for term 1 must not change because someone
  edited a category in term 2.
- **Dependencies:** depends on **U15** (the subject-identity snapshot must survive subject deletion, which
  U15 governs) and on **U13** (the write-time half of the guard). It is a **precondition for U10's
  historical limb** and for any historical reporting.
- **Recommendation:** **(d) all three** — the guard prevents the ordinary case, the snapshot makes an
  already-reported number provable, and the event stream makes a later demotion invisible to past reports.
  The draft notes honestly that until this is adopted, coverage is reproducible **only while no
  relationship change occurs and only for questions that still exist**.
- **Reversibility:** **effectively irreversible in one direction.** Adopting the event stream now is
  additive and safe; **not** adopting it means the pre-decision history of every criterion is simply not
  recorded and cannot be reconstructed later (the genesis events of §6 are the mechanism that would have
  recorded it). This is the strongest argument for deciding U14 early.
- **Implementation impact:** one new append-only table (`CriterionReviewEvent`, full mapping identity,
  plain/`Restrict` refs only); criterion columns (`reviewed_by`/`reviewed_at`,
  `subject_id_at_confirmation`, `subject_label_snapshot`); write-path changes in `setCriteria` /
  `confirmCriterion` / `rejectCriterion` (transactional, with genesis/`replaced` events); the
  relationship-wide in-use guard + consistency verifier; the historical reconstruction path in the
  coverage service; tests T42–T55.

---

### U15 — Must subjects (and questions) be archived instead of deleted?

- **Decision to make:** may a `Subject` referenced by an in-use category or by historical learning records
  be **hard-deleted** (today it cascades `LearningObjective` and silently NULLs `Category`/`Competency`/
  `Course`), or must subjects be **archived**? Is the historical subject identity a **non-referential
  snapshot** or an FK with `onDelete: Restrict`? Should **question archival** (required for any question
  that ever contributed a confirmed mapping) be a first-class state?
- **Current proposal:** **archive subjects** (additive `Subject.status`/`archived_at`; deletion refused
  while referenced; preserves identity; deletes nothing; never changes historical coverage; blocks new
  publication against an archived subject) **and** a non-referential identity snapshot **and** question
  archival instead of hard delete (§6 lines 899–1013; §13.2 `Subject` row line 1513; §16.4 U15 line 2054).
- **Alternatives:** (a) archive subjects + non-referential snapshot + question archive state (proposed);
  (b) keep destructive deletion but accept that history is lost; (c) `Restrict` FKs without archival (blocks
  deletion but gives no way to retire a subject).
- **Consequences:** *Technical* — deletion today is not a soft operation: `LearningObjective.subject` is
  `onDelete: Cascade` (`prisma/schema.prisma:1200`) and `Category`/`Competency`/`Course` subjects are
  `SetNull`, so one `DELETE /subjects/:id` can destroy objectives and silently make a subject-scoped
  competency transversal. (a) is additive and reduces destructive power to zero. *Pedagogical* — a
  school's decision to stop teaching a subject must not erase the record of what was taught.
- **Dependencies:** **U14 depends on U15** (a snapshot that can be NULLed by `SetNull` protects nothing,
  §6); **U10's archived-question limb depends on U15** (there is no question-archive state today). U15 is
  therefore the natural **first** answer in the cluster.
- **Recommendation:** **(a)**, including the four archival guarantees the reviewer required (identity
  preserved; nothing deleted; historical coverage unchanged; new publication against an archived subject
  blocked) and question archival for any question that **ever** contributed a confirmed mapping.
- **Reversibility:** **effectively irreversible if destructive deletes continue in the meantime.**
  Archival is additive and reversible; a cascade delete is not — the objectives and their criteria are
  gone. Decide before any cleanup or deletion policy is exercised.
- **Implementation impact:** additive `Subject.status`/`archived_at` (or `archived_at`) + `Question`
  archive state (both **proposed**); deletion guard in `subjects.routes.js`/`categorySvc`; non-referential
  `subject_id` + `subject_label_snapshot` on the criterion/event; archive-aware backup sanitizers
  (`bulk.routes.js`); permission/route/audit for archiving a question (see §5 **G4**); tests T48/T50/T53/
  T55.

---

## 3. Dependency matrix between unresolved decisions

| Decision | Depends on | Is depended on by | Must be co-decided with | Why |
|---|---|---|---|---|
| **U1** level/track | — | U2 (subject scope uses programme attributes), duplicate detection (P1) | — | Schema/value shape; nothing else waits on it |
| **U2** import scope | U1 (mildly) | — | — | Route policy; independent of the coverage cluster |
| **U3** version-bump adopt | P12 (designed) | U10 (a move changes the denominator) | U7/U8 (process) | Workflow; **constrained by input (e)** |
| **U4** denominator | P10/P5 | U10 | U10 | Denominator and counting are two halves of one number |
| **U5** cumulative packs | — | — | — | Purely P7 scope |
| **U6** console placement | — | — | — | UI-only; can be last |
| **U7** roadmap naming | — | U8 | **U8** | §14 items 1/9 are written differently under A vs B |
| **U8** record D15 | U7, U1–U5/U9–U15 (its content) | Phase 1B gate | **U7** | A gate row summarises the decisions |
| **U9** visibility default | P4 (designed) | — | — | Schema default inside P4 |
| **U10** counting policy | **U14** (current vs historical), **U15** (archived questions), U4, U12 | reporting/UX of coverage | U4, U12, U14, U15 | The core of the cluster |
| **U11** import trust | P3 modes (accepted via (d)) | U12 (imported rows' reliability path) | U13 (confirm-time check) | **Constrained by input (d)** |
| **U12** legacy reliability | U13, U11 | U10 (what counts) | U13, U14 | Truthfulness of the review record |
| **U13** subject enforcement | U15 (what "the subject" means) | U14 (guard), U10 (consistency) | U14, U15 | Write-time half of the relationship guard |
| **U14** reproducibility | **U13, U15** | U10 (historical counting) | U13, U15 | Snapshot/events/guard are one mechanism |
| **U15** archival/identity | — | **U14, U10, U13** | U13, U14 | Everything historical resolves through subject identity |

**The indivisible cluster:** **U15 → U14 → U13 → U12 → U10** (plus U11 at the confirmation boundary).
Answering any of these five alone produces rework in the others: the archival policy decides what identity
survives (U15), which decides what the guard and the snapshot attach to (U14/U13), which decides what may
be counted (U12/U10).

---

## 4. Blocking decisions vs safely deferrable decisions

### 4.1 Must be settled before implementation

| # | Why it blocks |
|---|---|
| **U15** | Without an archive state, the guard protects a relationship that can still be destroyed; the historical snapshot can be NULLed. Additive schema; cheapest to decide first. |
| **U14** | The event stream and the guard change the write path and the coverage service. Deciding later loses history that cannot be reconstructed (see reversibility). |
| **U13** | Decides whether inconsistent rows are refused or stored; determines validator, service and publication checks. |
| **U12** | Must be decided before the **data migration runs**, or fabricated confirmations enter the history irreversibly. |
| **U10** | The counting policy *is* the feature; it also decides the coverage endpoint's payload and reports. |
| **U11** | Decides when `imported` rows become reliable; must be settled before any import is run. |
| **U1** | A schema-shaped choice (strings vs catalogue) made before the programme migration is written. |
| **U9** | A schema default plus read filters inside P4. |
| **U3** | Determines whether an "adopt version" action exists and how a class moves; constrained by input (e). |
| **U2** | Determines the import route's authorisation and therefore the permission surface. |
| **U4** | Determines the coverage query's scope (and should be recorded as a confirmation, see G1). |

### 4.2 Can safely remain deferred

| # | Why deferring is safe |
|---|---|
| **U5** (cumulative packs) | P7 scope only; adding it later is an importer feature with no data migration. Reserve the flag in the pack format now. |
| **U6** (console placement) | Presentation only; changes no stored data and no route. Decide when the UI is built. |
| **U7 / U8** (naming, D15) | Documentation/process. Needed before Phase 1B is *officially* gated, not before design work; decide them together, after the technical cluster, so D15's text reflects the answers. |
| **Bulk class-wide move** (mentioned in §12/§5B) | Explicitly out of v1; no decision needed to start. |

---

## 5. Genuine contradictions, gaps and imprecisions

Found while reading Revision 3.5 end to end. **No contradiction was found that makes the architecture
impossible**, and none of the ten established inputs is contradicted by a proposal. The items below are
worth closing before coding; they are **listed, not edited** (the freeze applies).

| # | Type | Finding | Exact references | Severity | Proposed handling |
|---|---|---|---|---|---|
| **G1** | Convergence, not a contradiction | **U4's two options collapse into one.** §6 requires `o.subject_id = P.subject_id` for every member and validates it at publication; a programme version is subject-bound. So "all members of the assigned version" and "only members of the class's subject" are the same set. The owner should be told they are confirming an invariant, not choosing between two policies. | §6 predicate + invariants (lines 719–750); §6 publication-time eligibility (lines 682–698); §16.4 U4 (line 2043); §12 q4 (line 1432) | Low (clarity) | No draft edit needed; record the equivalence in the owner's answer. |
| **G2** | Ambiguity | **Which subject value is authoritative for historical coverage — the criterion's `subject_id_at_confirmation` or the event's `subject_id`?** §6 says a confirmed criterion "must be the subject recorded when it was confirmed" (the criterion column) in the counting rules, while the round-8 reconstruction algorithm reads `state(c,D).subject_id` from the event. Both are proposed; the draft does not say which wins if they disagree. | §6 snapshot policy (lines 827–833); §6 counting rule (lines 1037–1040); §6 reconstruction algorithm (lines 953–963); §6 event field table (lines 935) | Medium | Add one clause when U14 is answered: *the event stream is authoritative in historical mode; the criterion column is a denormalised convenience read by current mode.* Owner decision, not an edit. |
| **G3** | Gap | **Current coverage for a class whose subject has been archived is undefined.** §6 defines what archival must *not* change (historical coverage) but never states whether a class still assigned to a programme under an archived subject keeps producing a *current* coverage number, or whether the assignment is frozen/blocked. | §6 archival guarantees (lines 1005–1013); §5B/P12 assignment rules (lines 559–599); §13.6 (lines 1584–1610) | Medium | Fold into U15 (and U10's current-vs-archived limb): define whether current coverage is computed, reported as "subject archived", or blocked. |
| **G4** | Gap | **No authority, route or audit event is defined for archiving a question.** U15 requires "archive instead of hard delete" for any question that ever contributed a confirmed mapping, but §13.5's permission table has no "archive question" row and §10A defines no `question.archive` audit event; `Question` today has no archive state at all. | §6 hard-delete refusal (lines 899–920); §6 counting rules (lines 1023–1027); §13.5 permission table (lines 1560–1568); §11 P11 row (line 1417) | Medium | Fold into U15: name the permission (likely `class.learning.classify` owner-scoped or `school.learning.manage`), the route, and the audit event. |
| **G5** | Process blocker (not a design gap) | **Defect A is a stated precondition of the P11 workflow while defect fixes are frozen.** §10A makes the transactional `setCriteria` a *precondition* of the confirmation workflow and states the replace is non-atomic today; §13.1A orders A fixed "before relying on the classification system"; the current freeze says no defect fix. The owner must explicitly release A (and B) or the workflow cannot be implemented as specified. | §10A (lines 1309–1327); §13.1A Defect A row (lines 1479); §13.1A Defect B row (line 1481); §15 implementation status (lines 1896–1898) | **High (process)** | Owner authorisation question (§7, block B). |
| **G6** | Documentation imprecision | **§12's count sentence is internally inconsistent.** It says the consolidated list is "fifteen (U1–U15, adding …)" but its own enumeration repeats three items already covered by questions 1–6 and omits U12 (legacy reliability), U7 (naming) and U8 (D15) — so the sentence's arithmetic and its list do not match, even though "fifteen" and "U1–U15" are correct. | §12 (lines 1438–1443) | Low | A **one-line correction is available but NOT applied** — see §7, block C, for the exact proposed wording; awaiting approval. |
| **G7** | Ambiguity (minor) | **"Archived question" appears in the counting rules and in U10 while §6 also says there is no question-archive state today.** The draft is internally consistent (it always marks the state as proposed), but a reader can miss that the archived-question clause of U10 is *inoperable* until U15 is adopted. | §6 counting rules (lines 1023–1027); §16.4 U10 (line 2049); §6 event/history block (lines 899–915) | Low | State the dependency in the U10 answer (already covered by G3's handling). |

### 5.1 Requirements already settled by the owner — must not be reopened

The ten established decisions and their anchors. **No proposal in Revision 3.5 contradicts any of them**,
so per the instruction none is reopened. The only item worth flagging is that **U3's "per-school
auto-adopt" alternative conflicts with input (e)** — i.e. the alternative is the thing in tension, not the
settled decision.

| Established requirement | Anchor |
|---|---|
| One programme per class per subject | §1 input (a) line 180; §5B/P12 non-overlap rule |
| Parallel programmes are allowed | §1 input (b) line 181; §2 A.4/A.5, P1-E rejected |
| Same subject/level/track professors reuse the same official programme | §1 input (c) line 182; §17.6 closing statement (no auto-merge, no duplicate `programme_key`) |
| Teachers import; admin verification **or** an audited school setting controls publication | §1 input (d) line 183; §3 P3 modes, §13.5 (three distinct audited actions) — this is what **constrains U11** |
| Official objectives immutable once published; revisions create new versions | §1 input (e) line 184; §3 P2-A, §5A P10-A normative rule — this is what **constrains U3** |
| New versions never automatically move classes | §1 input (e) line 184; §5B/P12 — **excludes U3 option (b)** unless (e) is revised |
| Teachers can create local sub-objectives and extensions | §1 input (f) line 185; §5 P4 |
| Personal local programmes never count as official coverage | §1 input (f) line 185; §5 P4 table |
| Only published official objectives count toward coverage | §1 input (h) line 187; §6 eligibility |
| There is no head-of-department role | §1 input (g) line 186; §13.5 ("add no role") |

---

## 6. Proposed decision sequence (minimises rework)

Rationale: settle **identity and history first** (U15 → U14 → U13), because every later answer about
counting or reporting resolves through them; then **what may be counted** (U12 → U10), then the
**schema-shaped and workflow-shaped** choices (U1, U9, U11, U2, U3, U4), and finally the **deferrable**
items (U7/U8 as a pair, then U5/U6).

| Step | Decisions | Why now | What it unblocks |
|---|---|---|---|
| **0** | **Authorise defect fixes A and B** (owner process action, not a U) *— **DONE**, see §9.1* | A is a live integrity risk and a stated precondition of the confirmation workflow; B silently truncates coverage/import inputs above 1,000 rows | Any trustworthy implementation of P11/P5/P9 |
| **1** | **U15** then **U14**, then **U13** (one sitting) | The subject-identity + guard + event-stream mechanism; each depends on the previous, and adopting the event stream late loses history irreversibly | The whole historical-reproducibility model; U10's historical limb |
| **2** | **U12**, then **U10** (one sitting) | What is *reliable* and what *counts*; U12 must precede the migration, U10 completes it | The coverage feature and its reporting labels |
| **3** | **U4**, **U11**, **U9**, **U1** | Schema/value decisions needed before the migration is written (U4 is a confirmation of G1, not a new choice) | The additive migration's shape and the validator's value sets |
| **4** | **U2**, **U3** | Route/workflow decisions needed before endpoints are built (U3 is already constrained by input (e)) | Programme import + class-assignment endpoints and their permissions |
| **5** | **U7 + U8** (decided together) | Documentation/process; D15's text should summarise the answers from steps 1–4 | Phase 1B's registered gate (§14 items 1, 9) |
| **6** | **U5**, **U6** | Least costly to decide last; neither changes stored data | Pack-importer v1 scope; frontend placement |

**Anti-rework notes.** Do not decide U10 before U15/U14 (the archived-question and current-vs-historical
limbs are undefined). Do not run the criteria migration before U12 (irreversible). Do not write §14's
document edits before U7/U8. Do not build the import route before U2 (scope) and U11 (trust).

---

## 7. Questions requiring explicit owner answers

**Block A — the fifteen decisions** (each is a yes/confirm-or-change; the draft's recommendation is in
brackets):

1. **U1** — `level`/`track` free text with normalisation [recommended], or a school-managed catalogue?
2. **U2** — professor import scoped to assigned subjects [recommended], or any subject in the school?
3. **U3** — explicit per-class adoption of a new version [recommended, and required by input (e)]?
4. **U4** — coverage denominator = **all member objective versions of the exact assigned programme
   version** [recommended]; note this is equivalent to "the class's subject" because membership is
   subject-validated (G1).
5. **U5** — cumulative packs **out of v1**, with the flag reserved [recommended]?
6. **U6** — which UI hosts the programme/verification console (console Learning page, legacy admin editor,
   or split)?
7. **U7** — roadmap naming: **option B (insert Phase 1B only, record the 7-phase target)** [recommended],
   or option A (renumber now)?
8. **U8** — record **D15** as an owner-approved register row with gate "before Phase 1B" [recommended]?
9. **U9** — local objective visibility default **`private`** [recommended]?
10. **U10** — confirm the §6 counting rules as the policy (incl. `weight > 0`; exam-used = unused; no
    roll-up/down; de-duplicate by objective-version id) **and** state whether an **archived** question
    counts for *current* coverage [draft deliberately leaves this open]?
11. **U11** — `imported` reliability is **mode-dependent and recorded (actor + action)** [recommended]?
12. **U12** — legacy criteria are **never** auto-confirmed from the question stamp; migration →
    `unreviewed` and historical reliability starts at zero [recommended]?
13. **U13** — **hard-block** cross-subject criterion writes/confirmations; pre-existing cross-subject rows
    quarantined and reported, never auto-rewritten [recommended]?
14. **U14** — adopt **all three** (relationship guard + confirmation-time snapshot + append-only event
    history with the defined reconstruction rule) [recommended], including the resolution of **G2**?
15. **U15** — **archive subjects** instead of deleting; non-referential subject-identity snapshot;
    **question archival** instead of hard delete for any question that ever contributed a confirmed
    mapping [recommended], including the rules for **G3** (current coverage under an archived subject) and
    **G4** (who may archive a question, via which route, with which audit event)?

**Block B — process authorisations** (not architectural choices; nothing proceeds without them):

16. **Release the Defect A fix** (make `setCriteria` transactional) ahead of Phase 1B, as §13.1A and
    §10A's precondition require? [Required before the confirmation workflow can be implemented as
    specified — **G5**, **Highest-priority blocker**.] *(**ANSWERED** — released, implemented, tested,
    closed; see **§9.1**.)*
17. **Release the Defect B fix** (loaders must not silently truncate at 1,000) before coverage/import/bulk
    tagging enumerate objectives? [Required before those features are trustworthy.] *(**ANSWERED** —
    released, implemented, tested, closed (B2 deferred); see **§9.1**.)*
18. **Authorise the §14 documentation edits** (Phase 1B insertion, D15 registration, `PHASE5_REPORT.md`
    prefix, `DATABASE.md`/`DEPLOYMENT.md` updates) once the decisions above are answered? [Documentation
    only.]
19. **Confirm the defect dispositions C/D/E/F** (bundled into Phase 1B rather than fixed now, §13.1A)?
    [Keeps the same logic from being implemented twice.]

**Block C — confirmations and one proposed correction** (small, but they should be answered, not assumed):

20. **G1** — Confirm that U4's two options are equivalent by construction, so the owner is confirming an
    invariant rather than choosing a policy?
21. **G2** — Confirm the authority rule: **event stream authoritative for historical coverage; the
    criterion's subject snapshot is the current-mode convenience read**?
22. **G6 — one-line documentation correction, NOT applied.** §12 (lines 1438–1443) currently reads
    *"the **consolidated** list of **fifteen** unresolved owner decisions (U1–U15, adding the
    version-adoption, coverage-denominator, cumulative-pack, local-visibility, coverage-counting,
    import-trust, subject-consistency, subject-reproducibility and subject-deletion questions…)"*, whose
    enumeration both repeats questions 1–6 and omits U12/U7/U8. Proposed replacement, on approval only:
    *"the **consolidated** list of **fifteen** unresolved owner decisions (**U1–U15**, including the
    questions above plus the version-adoption, coverage-denominator, cumulative-pack, local-visibility,
    coverage-counting, import-trust, legacy-reliability, subject-consistency, subject-reproducibility,
    subject-deletion and roadmap/decision-register questions) is §16.4…"* — **awaiting the owner's
    approval before any edit to the draft.**

---

## 8. Scope confirmation for this document

- **Documentation only.** This review creates no decision, approves no proposal, and changes no
  architecture. Recommendations are explicitly labelled as such.
- **No implementation file was touched** — no source code, Prisma schema, migration, service, route,
  frontend or test.
- **No database action** — no migration was applied, no data was read or written, no feature flag changed.
- **No merge, no push, no Phase 2, no AI.**
- **The architecture draft was not edited** by this document (the one available correction, **G6**, was
  described here and awaited approval; the owner then approved it and it is now **applied** in §12 — see
  §9).
- Status of everything referenced here remains: **DRAFT — OWNER DECISIONS RECORDED (§19); IMPLEMENTATION
  NOT AUTHORIZED**; **ADR-0001 Proposed**. *(Since updated: the two **defect-scoped** fixes A and B were
  authorized, implemented and closed — see **§9.1**; Phase 1B is still not authorized.)*

---

## 9. Outcome — the owner's answers (2026-11-20)

The owner reviewed this document and answered **U1–U15** plus clarifications. The authoritative record is
`docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` **§19**; §16.4 there is retained as the *pre-decision*
record. In one place:

- **Approved:** U1, U2, U3, U4, U5, U7, U9, U10 (with counting clarifications), U11, U12, U13, U14.
- **Approved in principle:** **U8** (D15 registered as the Phase 1B gate; final wording still pending) and
  **U15** (archive rather than delete; the archival policy is incomplete until **G4** supplies the
  authorization, route, audit event and lifecycle).
- **Deferred:** **U6** (UI placement, after examining the existing interface and the teacher workflow).
- **Clarifications:** **G1** confirmed (U4's options are equivalent by construction); **G2** and **G3**
  approved (event stream authoritative for historical reconstruction; current coverage uses an explicitly
  defined current-state policy and must flag archived subjects rather than treat them as active);
  **G4** required (question archival needs a defined authorization, route, audit event and lifecycle).
- **Documentation:** **G6** approved and now **applied** in the draft's §12 (item 22 above is therefore
  closed).
- **Process:** **Defect A and Defect B are not authorized for implementation** — the owner requires a
  minimal isolated change proposal first, now written in **`docs/DEFECT-A-B-FIX-PROPOSAL.md`** (which
  authorizes nothing). **C/D/E/F** stay in the Phase 1B scope per §13.1A. *(Superseded — see §9.1.)*
- **Still open after the approval:** the **D15 wording** (U8), the **G4** question-archival lifecycle
  (completing U15), the **U6** UI placement, and the owner's **authorization** for any implementation.
  *(The "including the Defect A/B fixes" clause here is **superseded** — A and B were released and closed;
  see §9.1.)*

---

### 9.1 Update (2026-11-21) — defect status corrected; G4/G2/G3/U8 drafted

The companion draft gained **§20**, which supersedes the defect paragraph above:

- **Defect A and Defect B were authorized** in two separate, defect-scoped authorizations, **implemented,
  tested and closed** (A: transactional `setCriteria`/`clearCriteria`; B: complete pagination replacing
  the silent 1,000-row truncation, **B2 deferred**, unused `#schoolObjectives` removed). **C/D/E/F are
  unchanged** (still in the Phase 1B scope). Consequently **step 0** of §6 above ("Authorise defect fixes
  A and B") is **satisfied**.
- **G4** — the question-archival authority, route, audit event and lifecycle that §19.3 named as *required*
  to complete **U15** — is **drafted** (draft **§20.2**), as **PROPOSED** wording awaiting the owner.
- The approved **G2** and **G3** clarifications are written as normative clauses (draft **§20.3–§20.4**),
  and the **U8/D15** register wording is drafted (draft **§20.5**).
- **U10, U12, U13, U14 remain decided** (§19.2) and are **not reopened**; §16.4's "UNRESOLVED" rows stay
  the *pre-decision* record.
- **Phase 1B is still not authorized**, and **ADR-0001 remains Proposed**. The revised "still open" list is
  therefore: **G4/U15**, **U8/D15**, confirmation of the **G2/G3** wording, **U6**, and the owner's
  authorization for implementation.

### 9.2 Update (2026-11-21, later) — consolidated owner decisions recorded; supersedes §9.1's "still open" list

The owner issued a consolidated decision record on 2026-11-21 (documentation reconciliation only — no code,
schema, migration, route, frontend or test change, no Git history rewriting). Its dispositions for this
worksheet's open items:

- **G4/U15 — resolved.** The archival guard was confirmed (C1 — Option 2: blocked only by exams whose
  actual lifecycle status is `EXAM_STATUS.ACTIVE`, summative or training; draft/archived exams including
  training, games and tournaments do not block; status-based, not the training flag), restore without
  automatic reassociation confirmed (D1), the existing permission model preserved (D1 — teachers archive
  only questions they are authorized to manage; no new approval workflow or head-of-department role), and
  the **complete G4 wording was adopted (E1)** (draft §20.2). U15's outstanding wording condition is
  **satisfied**.
- **U8/D15 — resolved.** D15's recommended default was **substantively approved (F1)** and recorded in
  `docs/PHASE0_DECISION_REGISTER.md` separately from the earlier wording-only acceptance; **U8 is closed**
  because that substantive decision is recorded, not by a label change.
- **G2/G3 — remain accepted** and are not reopened.
- **U6 — remains deferred**; blocks nothing.
- **Phase 1B — explicitly NOT authorized** (decision J). A separate explicit owner authorization is
  required. ADR-0001 remains **Proposed**.
- **Document authority (I1)** — the owner ratified the document hierarchy with owner-provenance
  safeguards, recorded in `docs/ARCHITECTURE-BASELINE.md` §2.1.

The authoritative records are the draft's **§20.2 and §20.7** and the decision register's **D15** entry
and §4 approval record.

### 9.3 Update (2026-11-21, latest) — WP5 and WP7 accepted; Phase 1 ready for closure review

The owner explicitly confirmed:

- **WP5 accepted (2026-11-21)** — the refactored teacher-facing experience that integrates adaptive
  question pedagogy into the **existing Questions tab** of the admin application, following the
  authorized WP5 refactor and UI/UX remediation. The previous separate Learning Console architecture is
  **no longer the accepted teacher workflow** (the console is retained as the admin governance surface).
  This supersedes decision **A2** ("implemented but not accepted"); A2 is preserved above and in
  `docs/PHASE1_PROGRESS.md` as history — not rewritten — and the **B1** correction discipline remains
  the provenance standard.
- **WP7 accepted** — supersedes the prior "awaiting owner review" status; chronology preserved.
- **Phase 1 is ready for formal closure review**, subject to record reconciliation (completed in this
  pass) and safe preservation of the accepted deliverables (a snapshot proposal has been prepared;
  **commit is not yet authorized**).
- **No other work package, gate or decision is inferred accepted by this record.** D1–D14 (except the
  recorded dispositions), U6 (still deferred) and ADR-0001 keep their recorded statuses.
- **Phase 1B remains NOT authorized.**

Authoritative acceptance record: `docs/PHASE1_PROGRESS.md` (header + status board + dated log entry
2026-11-21).

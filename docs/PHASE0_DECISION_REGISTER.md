# Phase 0 — Adaptive Learning Decision Register

**Status:** **PARTIALLY APPROVED — Phase 1 gate only, plus D15.** D1, D2 and D8 were approved on 2026-11-19, authorizing Phase 1 only. The owner accepted D15's **register wording** on 2026-11-21 and then **substantively approved the D15 recommended default** on 2026-11-21 (owner decision F1). D3–D14 remain recommended/not approved unless a separate disposition is recorded. **Phase 1B remains unauthorized**: the D15 gate is now decided, but implementation still requires a separate explicit owner authorization. See §4.
**Date:** 2026-11-21 (D15 substantive approval and register reconciliation; original D1/D2/D8 approval remains dated 2026-11-19)
**Related architecture:** `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md`
**Related review:** `docs/PHASE0_ARCHITECTURE_REVIEW.md`
**Related ADR:** `docs/ADR-0001-ADAPTIVE-LEARNING-FOUNDATION.md`

> This register resolves the questions in Appendix E of the architecture proposal into explicit, reviewable decisions (D1–D15). Each entry gives a recommended default, alternatives, advantages, disadvantages, consequences, the approval owner, and the implementation phase affected. Recommendations are not approvals. Pedagogical thresholds and labels remain owner decisions.

---

## 1. Summary register

| # | Decision | Recommended default | Approval owner | Explicit product/pedagogy approval? | Status |
|---|---|---|---|---|---|
| D1 | User-facing label for the profile | **“Learning profile”** in UI; “cognitive profile” only in technical documentation | Product + pedagogy | **Yes — product and pedagogy** | **Approved 2026-11-19 (Phase 1 gate)** |
| D2 | Who governs learning objectives | **School-managed taxonomy**; admins create/approve; teachers may propose and map; teacher direct creation only if `learning.teacher_objective_creation` is on, otherwise teacher rows are `proposed` for admin approval | Product + pedagogy | **Yes — product and pedagogy** | **Approved 2026-11-19 (Phase 1 gate)** |
| D3 | Historical result backfill | **Off by default**; admin-only dry-run, then opt-in; only where question criteria exist; no inference; no exercise backfill | Product + engineering | Product approval required; engineering sign-off | Recommended, not approved |
| D4 | High-stakes gate | **Keep** the gate for `proficient`/`advanced`; add a `summative_pending` recognition badge for strong formative work; review after pilot | Pedagogy | **Yes — pedagogy** | Recommended, not approved |
| D5 | Mastery thresholds and weights | **Accept policy v1.1 as a provisional pilot policy**; do not treat values as permanent; calibrate after pilot data | Pedagogy + engineering | **Yes — pedagogy** | Recommended, not approved |
| D6 | Who may override levels | **Teacher for own classes; admin school-wide**; mandatory reason and audit; optional review/expiry; student sees the override as teacher-set | Product + security | **Yes — product and pedagogy** | Recommended, not approved |
| D7 | Whether games contribute to mastery | **Yes, as formative practice only** (weight 0.5); logged-in sessions only; never high-stakes; cannot alone lift above `developing` | Pedagogy | **Yes — pedagogy** | Recommended, not approved |
| D8 | Arabic RTL scope | **New Learning/My Learning panels and shared learning components first**; French/English/Arabic labels; logical CSS and RTL smoke tests; no claim of full-app RTL | Product | **Yes — product** | **Approved 2026-11-19 (Phase 1 gate)** |
| D9 | Evidence/snapshot retention | **No automatic purge while the account is active**, but no indefinite-retention assumption; explicit lifecycle for class change, school transfer, leaving, account deletion, school closure, correction/retraction; no student-level anonymization promise in v1; final retention policy before a real-school pilot | Product + privacy + engineering | **Yes — product/privacy** | Recommended, not approved |
| D10 | Background job queue | **No queue in v1**; bounded post-commit ingestion, durable `LearningSourceIngestion` receipt, dirty marker, bounded reconciliation/replay, on-demand/admin recompute; revisit if latency or backlog requires it | Engineering | No; engineering decision with product awareness | Recommended, not approved |
| D11 | Per-student personalized assessment | **Reuse existing exams**, assigned per pathway/student/group; no generated exam engine in v1; defer unique per-student generation | Product | **Yes — product** | Recommended, not approved |
| D12 | Teacher visibility of evidence | **Show summarized evidence** and a four-part explanation (observed performance, evidence sufficiency, missing evidence, next action); hide internal weights/model constants behind “Why this?”; students get plain-language, non-stigmatizing wording for every state | Product + privacy | **Yes — product/privacy** | Recommended, not approved |
| D13 | Trust boundary for summative evidence | **Require server-authoritative summative evidence**: a rule-4 `exam` row counts as `summative` only if linked to a committed `ExamSession` for the same `(exam_id, user_id)` and re-graded with `GradingService`; otherwise demote to `formative` and flag `trust='client_supplied'` for admin review. `POST /results` and bulk writes cannot self-certify summative evidence. **Plus an explicit teacher-attested path** for offline/bulk exams and paper scores (see the detailed section) | Engineering + security (+ pedagogy for the attested path) | **Yes — engineering/security (product awareness)** | Recommended, not approved |
| D14 | Which formal exams are high-stakes | **Every `is_training=false` exam is high-stakes by default**, so the D4 gate consumes all such exams; a school may **explicitly designate** a formal-but-non-summative exam (e.g. a diagnostic/placement exam) as **not** high-stakes. High-stakes evidence additionally requires the D13 trust checks. The designation is captured from Phase 2 and the policy is finalized before Phase 3 publishes levels | Pedagogy | **Yes — pedagogy** | Recommended, not approved |
| D15 | Programme governance and objective versioning | **Official objectives are immutable once published** and revised only by **new versions**; a version bump requires an **explicit per-class adoption** and never moves a class automatically; teachers import only within their **assigned subjects**, enforced **server-side**; governance mode is a school setting with an **audited** switch (stricter re-evaluates existing rows; looser never silently grants reliability) | Product + pedagogy | **Yes — product and pedagogy** | **Approved 2026-11-21 (substantive, F1)** — wording accepted 2026-11-21; the Phase 1B gate is decided, but implementation remains unauthorized |

**Approval rule:** D1, D2, D4, D5, D6, D7, D8, D11, D12, D13, D14 and D15 require explicit product, pedagogical and/or security approval. D3, D9 and D10 also require the named engineering or privacy sign-off. Not every decision must be approved before Phase 1; each must be approved, revised, or explicitly deferred to a named dependent phase. The dependency table in §3 is normative. No recommendation is to be treated as accepted because it appears in the architecture document.

---

## 2. Detailed decisions

### D1 — User-facing label: “Cognitive profile” vs “Learning/performance profile”

**Recommended default**

Use **“Learning profile”** as the primary teacher and student label. Use **“Cognitive performance (Bloom)”** for the six-dimension section. Retain “cognitive profile” only in technical documentation and internal API names where it is already established.

**Alternatives**

1. Keep “Cognitive profile” everywhere.
2. Use “Performance profile” everywhere.
3. Use “Learning profile” for the page and “Cognitive performance” for the Bloom view (recommended).

**Advantages**

- Accurately describes what the evidence supports: academic performance, not intelligence, aptitude, personality, or learning style.
- Avoids a diagnostic or psychological claim that the data cannot support.
- “Cognitive performance (Bloom)” still names the six cognitive processes without implying a measured global cognitive ability.
- Translates more safely into French and Arabic than a single global “cognitive” label.

**Disadvantages**

- “Learning profile” is broader than the evidence and could be read as a full learner profile.
- Teachers familiar with “cognitive profile” may need a short explanation.
- Internal names and UI names differ, which requires documentation discipline.
- French and Arabic translations need pedagogical review, not literal translation.

**Potential consequences**

- No schema or API change. The architecture already avoids a composite cognitive score.
- Labels must be centralized in the localization dictionary and covered by RTL tests.
- The UI must explain that the profile is scoped by subject, topic, objective and Bloom dimension, and that “not enough evidence” is a valid state.
- Product and pedagogy must approve the final English, French and Arabic wording.

**Approval:** Product + pedagogy. **Explicit approval required: yes.**

---

### D2 — Are learning objectives school-managed or teacher-managed?

**Recommended default**

Use a **school-managed taxonomy with teacher participation**:

- Administrators create, approve, archive and own official objectives and competencies.
- Teachers can propose objectives, map existing objectives to questions/resources, and request changes.
- Teachers may create objectives directly only when a school setting explicitly allows it.
- Objective codes are stable; referenced objectives are archived, not hard-deleted.
- One official objective set per school/subject prevents duplicate codes and inconsistent reporting.

**Alternatives**

1. Fully teacher-managed objectives.
2. Fully admin-managed objectives with no teacher proposal path.
3. School-managed with teacher proposals (recommended).

**Advantages**

- Consistent reporting across classes and years.
- Avoids near-duplicate objectives with different names and codes.
- Preserves teacher professional judgment through proposals and mapping.
- Supports school-wide coverage, prerequisites and analytics.
- Makes objective ownership and audit clear.

**Disadvantages**

- Admin approval can become a bottleneck.
- Teachers may need to wait for an objective before classifying a question.
- A proposal workflow adds UI and notification work.
- Some schools may want immediate teacher autonomy.

**Potential consequences**

- `LearningObjective.status` is `proposed | active | rejected | archived` (default `active` for admin-created rows), with `proposed_by`, `reviewed_by`, `reviewed_at` and `review_note`; admin approve/reject endpoints are included in Phase 1.
- A school setting `learning.teacher_objective_creation` (default `false`) controls direct creation. When off, a teacher-created objective is `proposed` and needs admin approval; when on, it is created `active`.
- Phase 1 must include permission checks and audit for proposals/approvals.
- The school must nominate a taxonomy owner or accept admin-only governance.
- Without this decision, Phase 1 cannot finalize the objective-create authorization model.

**Approval:** Product + pedagogy. **Explicit approval required: yes.**

---

### D3 — Should historical results be backfilled?

**Recommended default**

**No automatic backfill.** Offer an admin-only, audited, dry-run-first backfill for a bounded date window and, optionally, a bounded class/school subset. Backfill only evidence that can be tied to real per-question answers and existing question criteria. Do not infer Bloom, objectives, competencies, or question correctness from text, tags, AI, or aggregate scores. Do not backfill exercises because no historical attempts exist.

**Alternatives**

1. Never backfill.
2. Backfill all historical results automatically.
3. Admin-controlled, dry-run, criteria-only backfill (recommended).

**Advantages**

- Protects the “no fabricated evidence” invariant.
- Gives a pilot school a way to evaluate the feature with existing data when mappings exist.
- Dry-run exposes how much historical data is actually usable before committing.
- Idempotent keys make repeated runs safe.
- Keeps historical results intact and traceable.

**Disadvantages**

- Most legacy results may be unmapped or lack reliable per-question correctness, so backfill may add little.
- Backfill can be slow on large SQLite databases and may compete with normal writes.
- Old evidence can change current mastery if it is still inside the recency floor.
- Admin time is required to classify questions before backfill is useful.

**Potential consequences**

- New profiles may remain empty until new activity is recorded; this is correct, not a bug.
- Backfill must be run off-peak, chunked, logged and audited; it is not a background queue in v1.
- The pilot plan must state whether backfill is in scope. The default is no.
- If backfill is approved, the policy should allow a `backfill` source marker but not a different mastery weight unless pedagogy approves it.

**Approval:** Product + engineering. **Explicit approval required: product; engineering sign-off required.**

---

### D4 — Is the high-stakes gate too strict?

**Recommended default**

**Keep the gate for the labels `proficient` and `advanced`**, with two corrections:

1. Use the revised two-lane evidence selection (latest summative and latest formative per item/criterion) so formative practice cannot erase a summative result and vice versa.
2. Add a non-level recognition state, `summative_pending`, when formative evidence is strong (`M >= 0.80`, `C >= 0.60`, `W >= 3.0`). The support level remains `developing`; the UI says “Strong practice evidence — ready for a check,” and the recommendation engine can suggest a short summative check.

A teacher rubric or teacher-assessed activity satisfies the high-stakes requirement. A teacher override can change the displayed level with a reason and audit. The gate is reviewed after pilot data.

**Alternatives**

1. Remove the gate; allow prose/automatic evidence to reach proficient.
2. Lower the gate to any exam item regardless of credit.
3. Keep the gate and add `summative_pending` recognition (recommended).
4. Replace the four levels with a separate “formative” and “summative” status.

**Advantages**

- Prevents automatic MCQ, games and practice from overclaiming advanced reasoning.
- Preserves trust in the `proficient` label.
- Recognizes legitimate formative learning without mislabeling it as proficiency.
- Gives the teacher a concrete next step (“run a short check”).
- Teacher-assessed work remains a valid route for schools that use portfolios or projects.

**Disadvantages**

- A student with excellent formative work but no summative opportunity remains `developing`; this can feel punitive if the UI is poorly worded.
- Teachers must create or select a check; this adds workload.
- The `summative_pending` badge is an extra concept to translate and explain.
- A single high-stakes item at 60% may still be weak evidence for `proficient`; confidence and evidence-count gates must remain.

**Potential consequences**

- UI wording must avoid “failed” or “not proficient”; use “Ready for a check” and “More evidence needed.”
- Recommendation rule R10 (`SUMMATIVE_CHECK_READY`) is needed.
- The pilot must track how often students are stuck in `summative_pending` and whether teachers can resolve it.
- If the gate proves too strict in a school with no exams, the owner can approve a portfolio/rubric route; this is a pedagogical decision, not an engineering default.

**Pedagogical validity notes (not validation).**

- **The gate depends on classification, not on labels.** The high-stakes count uses `source_kind='exam'` or `method='teacher_rubric'` at credit >= 0.60 (`docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §E.2.1). A training exam whose session writes `Result.mode='exam'` is still classified `training`/`formative` because the joined `Exam.is_training=true`, so it cannot satisfy the gate. Exam classification requires `mode='exam'` **and** a real `exam_id` **and** `Exam.is_training=false` **and** the D13 server-authoritative check. If classification were implemented from `Result.mode` alone, training repeats would silently satisfy the summative requirement and this gate would be meaningless.
- **One summative item is a minimum, not strong evidence.** A single high-stakes item can satisfy the count, but `proficient` still requires `M >= 0.70`, `C >= 0.55` and the high-stakes item at credit >= 0.60. A perfect single 3-point item **as the only evidence** yields `C = 0.528`, which is below the proficiency confidence gate, so it remains `developing`. A single item at 60% credit also does not reach proficiency on its own. The remaining risk is narrow sampling: the student may be proficient on that item but not the objective. The pilot must measure one-item proficiency and teacher disagreement; do not lower the confidence gate to compensate.
- **Formative recognition is not promotion.** `summative_pending` is a badge, not a level. It should reduce the chance that strong practice is displayed as failure, but it must not be used as a substitute for a summative check.
- **Teacher override is not evidence.** An override changes the displayed level with a reason and audit; it does not create evidence or change computed mastery. Repeated overrides are a signal that the policy or rubric needs review.
- **The gate is provisional.** It is a defensible conservative default, not a proven pedagogical rule. The owner must review pilot evidence before permanent adoption.

**Pilot validation for D4.** Track: percentage of students with exactly one high-stakes item at proficient; teacher agreement with that label; override rate and reasons; time spent in `summative_pending`; whether teachers can provide a check; and whether any group is systematically held back. The owner may revise the gate after the pilot; a revision is a new policy version, not a silent threshold edit.

**Approval:** Pedagogy. **Explicit approval required: yes.**

---

### D5 — Policy thresholds and weights

**Recommended default**

Adopt **mastery policy v1.1 as a provisional pilot policy**, not a permanent standard. Keep the existing weights and thresholds unless the owner changes them, with the mathematical corrections in the architecture document:

- source weights: exam 1.0, teacher activity 1.1, exercise 0.9, training 0.8, game/Kids 0.5;
- method weights: auto 1.0, teacher rubric 1.2, self-report 0.0;
- point factor clamp 1–3;
- recency half-life 60 days, floor 0.25;
- confidence `C = 1 - exp(-W/4)`;
- `min_evidence_weight=2.0`, `min_confidence=0.30`, `proficient_confidence=0.55`, `advanced_confidence=0.75`;
- cumulative bands: foundation `<0.55`; developing `0.55–0.70`; proficient `0.70–0.85`; advanced candidate `>=0.85` (`proficient_below=0.85` is the upper bound, not the entry threshold; proficiency starts at 0.70);
- high-stakes minimum credit 0.60;
- advanced minimum 4 distinct evidence items and 1 high-stakes item;
- Evaluate/Create automatic cap `developing`, applied only when the objective’s primary Bloom is Evaluate/Create; an objective with no primary Bloom is capped until classified;
- one rubric at credit >= 0.70 for Evaluate/Create proficient, two for advanced;
- `summative_pending` recognition when no summative evidence and `M>=0.80`, `C>=0.60`, `W>=3.0` (badge only; level remains `developing`);
- rollup provisional below 0.50 coverage;
- trend window 30 days, minimum weight 1.0, delta 0.05.

Store the policy version with every mastery row and profile snapshot. Do not offer per-school threshold editing in v1.

**Threshold interpretation (normative).** The constants are cumulative upper bounds. Example 1 (`M=0.789`, `C=0.671`, high-stakes evidence) is **proficient** under the current default because it is inside `0.70 <= M < 0.85`; it is not a mathematical error. If the owner wants proficiency to start at `M >= 0.85`, that is a policy change under this decision, and Example 1 becomes `developing`. The architecture and tests must be updated to the owner’s chosen entry threshold, not silently adjusted to preserve the example. The same rule applies to the rollup: Example 4 displays `developing` because the rollup display uses the minimum contributing objective, while its evidence-weighted `M=0.740` is shown separately; its 67% coverage is above the 0.50 provisional threshold, so it is labeled **partial coverage** rather than **provisional**. Changing the display rule is also a D5 policy choice.

**Pedagogical implications of the provisional values.**

- **Teacher-rubric weight depends on the source.** The method weight is 1.2 for `teacher_rubric`. An exercise-based rubric uses the exercise source weight 0.9 (combined 1.08 before points/recency); a teacher-created activity uses source weight 1.1 (combined 1.32). Both exceed a 1.0 exam item before points/recency. This is defensible for open-ended work but creates rubric-quality, halo and workload risk; the pilot must include rubric exemplars and a double-marking sample. Examples 1 and 3b use the exercise-based 1.08 combination, not 1.32.
- **Four distinct items for advanced.** The count is a safeguard against one-item dominance, not a measure of item quality. Four easy or near-identical items could satisfy the count; the `M`, `C`, high-stakes and Bloom gates still apply. The pilot must examine item breadth, not only count.
- **One threshold set for all subjects/ages.** The same `M` may mean different things in early primary, secondary mathematics, languages and sciences. The pilot must stratify by subject and grade; school/grade-specific profiles are a later policy version, not a v1 default.
- **Evaluate/Create rubric requirements.** Automatic MCQ cannot prove advanced reasoning, but one rubric is a minimum and not proof. Rubric criteria, exemplars and moderation are required; teacher capacity must be measured.
- **Fixed `summative_pending` thresholds.** Strong practice is recognized without promotion, but students can remain “ready for a check” if no check exists. The pilot must measure time in this state and whether teachers can resolve it.

**Pilot validation process.** Before permanent adoption, the owner reviews a pilot report covering: threshold sensitivity (what changes at 0.70 vs 0.85 entry, 0.55 vs 0.60 confidence), teacher agreement with displayed levels, override reasons, subgroup patterns by subject/grade/language, rubric reliability, `summative_pending` duration, and student comprehension of the wording. The report must distinguish mathematical correctness, implementation fidelity and pedagogical validity. Passing the first two does not validate the thresholds. A pilot is evidence for a decision, not a scientific validation claim.

**Alternatives**

1. Approve v1 as-is without the review corrections.
2. Set stricter thresholds.
3. Set more lenient thresholds.
4. Make weights school-configurable immediately.
5. Approve v1.1 provisionally and calibrate after pilot (recommended).

**Advantages**

- Deterministic, reproducible and testable.
- Conservative about overclaiming.
- Simple enough for teachers to understand with a “Why this?” panel.
- One policy version makes pilot comparisons meaningful.
- Avoids premature school-specific tuning and incompatible histories.

**Disadvantages**

- A single policy may fit some subjects and grade levels poorly.
- Thresholds are judgment calls, not empirically calibrated values.
- Teacher-assessed work gets a higher weight than exams; some schools may disagree.
- Recency decay and point caps may surprise teachers.
- Changing the policy later requires an explicit recompute and version migration.

**Potential consequences**

- The pilot must collect distributions and teacher feedback before permanent adoption.
- A policy change is a new `algorithm_version`, not an in-place edit.
- If a school demands different thresholds, that becomes a later school-policy feature with a separate recompute plan.
- The owner must explicitly accept the pedagogical values, not just the formula.

**Approval:** Pedagogy + engineering. **Explicit approval required: pedagogy.**

---

### D6 — Which roles can override levels?

**Recommended default**

- **Teacher:** override the displayed support level for a student/objective in a class they are authorized to manage. Reason mandatory; audit required.
- **Admin:** override school-wide, with the same reason/audit requirement.
- **Super admin:** only within an explicit school context and with audit; no silent platform-wide pedagogical override.
- The computed mastery remains unchanged; the override is displayed as “Teacher-set level,” with the reason visible to the teacher/admin and a student-friendly note visible to the student.
- Add an optional `teacher_override_expires_at` so stale overrides can be reviewed rather than becoming permanent labels.

**Alternatives**

1. Teacher-only overrides.
2. Admin-only overrides.
3. Teacher and admin (recommended).
4. No overrides; recommendations only.

**Advantages**

- Keeps the teacher in control, as the specification requires.
- Provides accountability through reasons and audit.
- Allows a teacher to correct a model that lacks context.
- Admin can resolve disputes or support a class.

**Disadvantages**

- Subjectivity and possible bias.
- Inconsistent overrides across teachers.
- An override can become a de facto permanent label if not reviewed.
- Students may be confused by a teacher-set level that differs from the evidence.

**Potential consequences**

- Add `teacher_override_expires_at` and a review prompt in the teacher UI.
- Overrides must be visible in the student view with a plain-language reason.
- Recommendations should use the effective (override) level but show the computed state in the rationale.
- Audit entries must include before/after and the evidence summary at the time.

**Approval:** Product + security, with pedagogy review. **Explicit approval required: yes.**

---

### D7 — Should games contribute at all?

**Recommended default**

**Yes, as formative practice only.** Include classroom games, tournaments and logged-in Kids Space sessions at source weight 0.5. Use question criteria where available, or the published Kids pedagogy snapshot. Never treat game evidence as high-stakes. Game-only evidence can at most support `developing`. Math Quest stars and `KidQuestProgress` remain game progress, not mastery.

**Alternatives**

1. Exclude games entirely.
2. Include games with a higher weight.
3. Include games as practice-only (recommended).
4. Include games only for engagement analytics, not mastery.

**Advantages**

- Captures meaningful practice and engagement.
- Uses existing content and avoids a separate game system.
- Low weight limits the influence of guessing and game mechanics.
- Supports recommendations with varied practice formats.

**Disadvantages**

- Game performance can be noisy, speed-driven, or affected by team play.
- Questions may be repeated or too easy.
- Students may guess or share answers.
- Kids Space snapshots can be stale or unmapped.

**Potential consequences**

- Game evidence increases evidence weight and confidence but cannot satisfy the high-stakes gate.
- The UI must label game evidence as practice.
- Kids Space publish must copy pedagogy; old games remain unmapped.
- The pilot should measure whether game evidence improves or distorts mastery; the owner can later reduce or remove it.

**Source classification (normative, prerequisite for this decision).** Which existing records are games depends on the classification rules in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §E.2.1. A `Result` is game evidence when `mode='game'` (rule 2) or `mode='tournament'` (rule 3), or when `answers_json.source='kids-game'` (rule 1, `source_kind='kids_game'`). Crucially, classification must **not** rely on `Result.mode` for exams: the session path always writes `mode='exam'`, so a formal exam requires `mode='exam'` **and** a real `exam_id` **and** joined `Exam.is_training=false` (rule 4), and a `mode='training'` row carrying a real `exam_id` — like a training exam taken through the session path — is still classified `training`/`formative` (rule 5). Rule 4 is necessary but not sufficient: the row must also pass the D13 server-authoritative check (`ExamSession` linkage + `GradingService` re-grade), or it is stored `formative`. Game, tournament and Kids evidence is always `formative`; training evidence is always `formative`; only `source_kind='exam'` or `method='teacher_rubric'` is `summative`. This decision (games formative-only) is therefore enforceable only if the classification rules are implemented; if they are not, no gate can be trusted.

**Approval:** Pedagogy. **Explicit approval required: yes.**

---

### D8 — Arabic RTL scope

**Recommended default**

Implement **new Learning and My Learning panels and their shared components** with:

- English, French and Arabic labels in a single learning dictionary;
- Bloom labels from `BloomDimension.labels_json`;
- `dir="rtl"` on the learning panel root when Arabic is active;
- CSS logical properties rather than left/right assumptions;
- locale-aware number and date formatting, with an explicit decision on Western vs Eastern Arabic numerals;
- RTL smoke tests and Arabic label review;
- no promise of a full application-wide RTL conversion in this phase.

The existing `app.language` setting is the default source of locale; if a user preference is added, it overrides the panel default. API errors and validation messages for new endpoints must also have French/Arabic strings or a documented fallback.

**Alternatives**

1. Full application RTL now.
2. New panels only (recommended).
3. English/French only, defer Arabic.
4. Arabic labels without RTL.

**Advantages**

- Contains risk and regression scope.
- Delivers the specification’s Arabic/French requirement for the new feature.
- Uses the existing design system and reduces layout breakage.
- Makes translation review manageable.

**Disadvantages**

- Mixed LTR/RTL experience across the application.
- Shared components may still leak direction assumptions.
- Arabic terminology for mastery and Bloom needs pedagogical review.
- A full-app RTL project remains a future cost.

**Potential consequences**

- K.9 and the acceptance tests must be updated to include locale selection and RTL.
- If the owner requires full-app RTL, it becomes a separate project with its own architecture review.
- French/Arabic labels must avoid stigmatizing terms and should be reviewed by a pedagogue or native speaker.
- The panel must not hardcode English strings in HTML.

**Approval:** Product. **Explicit approval required: yes.**

---

### D9 — Evidence/snapshot retention and privacy lifecycle

**Recommended default**

- **Active account:** retain evidence, including retracted rows, while the student account exists; no automatic purge in v1. This is a maximum default, not an indefinite-retention assumption.
- **Profile snapshots:** keep one per student/scope/day plus every snapshot referenced by an intervention; older unreferenced snapshots may be pruned in Phase 8 under a documented policy.
- **Interventions and audit records:** retain according to the school’s audit policy; do not delete silently. Audit payloads must be minimized and must not contain free-text student answers or rubric notes.
- **Student deletion:** delete student-linked adaptive rows by cascade in v1. Do not claim anonymization in place. If anonymized student-level retention is required, it needs a separate de-identified archive design and privacy approval.
- **School closure:** suspension is not deletion. Prefer suspension with retained data; hard delete requires a platform-operator runbook, export opportunity and legal review.
- **Configuration:** retention settings are school/platform configuration, not a teacher control; no retention cron in v1.

**Lifecycle scenarios (normative for the final policy):**

| Scenario | Default behavior | What remains identifiable | Mastery / snapshots / interventions |
|---|---|---|---|
| Student remains enrolled | Normal operation | Evidence, mastery, profile, assignments, recommendations | Recompute normally; snapshots bounded |
| Student changes class | `User.class_id` changes; objective mastery is not class-scoped | Evidence and objective/competency mastery remain with the student; historical assignments/interventions keep their class context | Recompute only if mappings changed; old teacher access follows current class scope; archive classes rather than hard-delete |
| Student transfers to another school | Leave + new account in the destination tenant; no silent `school_id` change or cross-tenant evidence copy | Origin-school records stay at origin; destination starts with no transferred evidence | Origin mastery remains for origin reporting; new school has no mastery until new evidence; export/import requires privacy approval |
| Student leaves school | Set `User.status` inactive/suspended; block login; start the retention clock | Evidence and mastery remain identifiable until the retention decision is executed | Read-only for authorized staff; no new evidence; delete/anonymize at the recorded trigger |
| Student account deleted | Cascade all student-linked adaptive rows; source `Result` rows also cascade | No student-linked adaptive row remains; audit may remain with `actor_id` null and minimized payload | Mastery, snapshots and interventions are deleted; historical reports lose student detail; pre-aggregated non-identifying counts may remain if built |
| School account closed | Suspend by default; hard delete only through platform runbook | Suspension keeps school-scoped data; hard delete cascades all school data | No recompute while suspended; export/legal hold only through platform procedure |
| Evidence corrected | New fingerprint + new evidence; old row retracted | Old and new rows remain while the student exists | Recompute affected scopes; correction marker shown |
| Evidence retracted | Status `retracted`; history preserved | Row remains identifiable; excluded from current mastery | Recompute; reason shown; no silent edit |
| Anonymization requested | Not a v1 student-level operation | A separate archive with no direct identifiers and no `User` join would be required | Mastery cannot be recomputed against an anonymized student; privacy design required |

**Record-class matrix:** `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §L.11 carries a record-first matrix (evidence / activity attempts / mastery+snapshots / interventions+assignments / audit / receipts / aggregates) across the same lifecycle events, marking each cell **P** (proposed in the architecture, still unapproved) or **A** (requires owner/privacy approval, no default assumed). The owner can therefore approve one record class at a time.

**Proposed in the architecture (not yet approved):** keep evidence/snapshots/interventions while the account exists; refuse indefinite retention; cascade student-linked rows on account deletion; no cross-tenant evidence copy on transfer; correction = retract + new fingerprint; suspend (not purge) on school closure; receipts carry `student_id` and cascade; audit payload minimization; no retention cron in v1.

**Requires owner/privacy approval (no default):** the retention period and deletion trigger; whether any aggregate survives deletion or closure; export format/scope and whether free-text work or derived mastery is exported; audit retention period; legal-hold process; any student-level anonymization (not a v1 promise); the school-closure hard-delete runbook.

**Which records remain identifiable:** `LearningEvidence`, `LearningActivityAttempt`, `StudentObjectiveMastery`, `StudentCompetencyMastery`, `StudentBloomPerformance`, `StudentCognitiveProfile`, assignments/enrollments/item progress, interventions, recommendations and `LearningStudentState` all carry `student_id`. `LearningSourceIngestion` now carries `student_id` so it cascades on account deletion. `AuditLog.actor_id` becomes null on user deletion, but `diff_json` can still contain identifiers; minimize it.

**How deletion affects mastery, snapshots, interventions and audit:**

- Mastery rows are deleted, not recomputed for a deleted student.
- Snapshots are deleted; interventions that reference them lose the detail, so intervention records must be deleted or reduced to non-identifying outcome codes under the approved policy.
- Recommendations and assignments are deleted; aggregate counts already materialized without `student_id` may remain only if the privacy decision explicitly allows it.
- Audit remains as an action record with no actor; it must not contain the student’s answers, rubric text or full profile payload.
- A deleted student must not appear in class heatmaps, recommendations, exports or historical drill-downs.

**Enforcement and approval:**

- Deletion is a service operation with export/legal-hold check, access revocation, cascade/delete, audit-payload minimization, non-identifying deletion audit and orphan verification. It is not a teacher action.
- Retention periods, deletion triggers, legal holds, cross-school transfer, audit retention and whether pre-aggregated statistics survive deletion require **school/privacy approval**.
- The final policy must be approved before a real-school pilot. Phase 8 implements the runbook and tooling; Phase 2 must not ingest real student evidence under an undefined policy.
- Do not assume indefinite retention is acceptable. Do not assume anonymization is equivalent to deletion.

**Alternatives**

1. Aggressive purge after each term.
2. Keep everything forever.
3. Keep evidence while the active account exists, with explicit leave/deletion lifecycle and bounded snapshots (recommended).
4. Anonymize after a fixed period.

**Advantages**

- Preserves reproducibility, trend analysis and intervention evaluation while the account is active.
- Retracted rows preserve audit integrity.
- Bounded snapshots control storage growth.
- Explicit lifecycle prevents “retain forever” by accident and gives schools a reviewable deletion path.

**Disadvantages**

- Evidence tables grow with every attempt.
- Retention creates privacy and deletion obligations.
- No v1 anonymization means schools that require de-identified retention need a separate project.
- Snapshot pruning can remove forensic detail.

**Potential consequences**

- Phase 8 must include a retention/export/deletion runbook, privacy review and test evidence for every lifecycle scenario.
- Storage and index growth must be monitored.
- If a school requires deletion, the service must delete student-linked rows and record a non-identifying deletion audit.
- A cross-school transfer does not carry mastery; the new school starts fresh.
- Retention decisions are not an engineering default; they require owner/privacy approval.

**Approval:** Product + privacy + engineering. **Explicit approval required: yes.**

---

### D10 — Background job queue versus bounded reconciliation

**Recommended default**

**No job queue in v1.** Use:

- bounded, post-commit evidence ingestion;
- a durable `LearningSourceIngestion` receipt per source fingerprint (`pending`, `complete`, `failed`, `superseded`);
- a `LearningStudentState.dirty_at` marker for mastery retry;
- bounded reconciliation/replay on startup, teacher request or admin request;
- on-demand teacher/admin recompute endpoints;
- an admin-only chunked backfill;
- no new worker process or broker.

The receipt ledger is **not a queue**: it has no broker, no independent worker and no scheduler. It exists so a crash cannot leave an invisible gap between the source row and evidence. A dirty marker alone is not a complete recovery mechanism.

Revisit the queue decision if any of these become true: evidence ingestion p95 exceeds the agreed budget, a pending/failed receipt backlog persists after reconciliation, or scheduled recalculation becomes a product requirement.

**Failure and recovery matrix:**

| Failure | Detection | Recovery |
|---|---|---|
| Result persisted; evidence ingestion fails | Receipt `failed` or absent | Mark failed, set dirty; bounded reconciliation replays |
| Crash before receipt write | Source row without receipt | Sweep source window, create receipt, replay |
| Crash after receipt `pending` | Pending receipt with expired/absent lease | Claim lease, replay, mark complete/failed |
| Evidence inserted; receipt not complete | Pending receipt + existing `dedupe_key` | Insert-or-ignore, mark complete, no duplicate |
| Evidence inserted; mastery recompute fails | Receipt complete; dirty or watermark gap | Recompute affected student/scopes; retry is safe |
| Result corrected | New source fingerprint | New receipt/evidence; retract old; recompute |
| Result deleted | Deletion hook or missing source row | Retract evidence; supersede receipt; recompute |
| Duplicate event delivery | Unique receipt + `dedupe_key` conflict | Return existing result; no duplicate |

**Reconciliation/replay requirements:**

1. Bounded scan window and row limit; no full-school scan in one request. Defaults: `limit=500` (max 5000), oldest-first, one lease per receipt (`lease_until = now + 5m`).
2. Idempotent replay using the same normalizer and `dedupe_key` as live ingestion; `INSERT OR IGNORE` semantics; the receipt is marked `complete` with the actual stored count.
3. Dry-run mode that reports gaps without writing.
4. Replace-by-scope mastery recompute; never merge stale partial rows.
5. Admin-only apply with audit; teacher can request recompute for an authorized student/class but cannot mark a receipt complete.
6. Health metrics: pending count, oldest pending age, failure codes, stale-profile count, replay counts.
7. No student names or scores in the aggregate admin health view.

**Triggers, scheduling and limits (normative):**

| Trigger | When | Bound |
|---|---|---|
| Post-commit hook (primary) | Immediately after the source is committed | One source row |
| Startup sweep | After an unclean shutdown or deploy | Bounded window, capped rows |
| Scheduled bounded sweep | Configurable interval (default every 15 min, school-scoped, disabled by default until Phase 2 approves) | `limit` rows per run, oldest-first |
| Admin/CLI run | Incident recovery, backfill verify | Explicit window + `limit`, dry-run first |
| Correction/deletion hook | Result corrected or deleted | Affected rows only |

- The scheduled sweep is a single-flight timer that calls the same service — not a queue and not a worker pool. Concurrent sweeps per school are prevented by the receipt lease.
- **Downtime:** the watermark is left behind; the sweep catches up in bounded batches and never processes everything in one request. `pending` receipts with expired leases are reclaimed. Downtime cannot lose evidence because source rows are committed by the existing app; adaptive ingestion is best-effort and never blocks grading.
- **Failed retries:** bounded exponential backoff (1m, 5m, 15m, 1h); after `max_attempts` (default 5) the receipt stays `failed`, stops auto-retrying and appears in the admin panel. A manual re-run clears backoff but keeps `attempt_count`. Permanent failures are marked `failed` with a skip reason rather than retried forever.
- **Duplicate prevention:** unique receipt key `(school_id, source_type, source_id, source_fingerprint)` plus the evidence `dedupe_key`; double-replay is a tested case (architecture M.2).
- **Admin inspection:** a status endpoint (counts by status, oldest pending age, top error codes, stale-profile count, last watermark) and a receipts endpoint (`status=failed`, `source_type`, `source_id`, `attempt_count`, `last_error_code`, `last_error_at`) with no student names in the aggregate view; re-queue/supersede is admin-permissioned and audited.

**Teacher/administrator visibility:**

- Profile responses expose `freshness.status` (`fresh`, `stale`, `recomputing`, `error`), `last_computed_at`, `dirty_since` and `last_error_code`.
- A stale profile is labeled “Profile may be out of date” and is not presented as definitive.
- A student sees “Your progress is being updated” rather than a stale or fabricated level.
- An admin health panel shows backlog and failure counts without student identities.
- If ingestion repeatedly fails, the teacher sees a retry/recompute action and a support code, not raw internals.

**Alternatives**

1. Add a queue now (BullMQ/Redis or a database-backed worker).
2. No queue; post-commit ingestion plus durable receipt, bounded reconciliation/replay and on-demand recompute (recommended).
3. A single periodic in-process sweep.
4. Dirty marker only.

**Advantages**

- Lowest operational complexity for SQLite and the current deployment.
- No new infrastructure, credentials or failure mode.
- The receipt ledger closes the crash window that a dirty marker alone leaves open.
- Evidence remains idempotent and recoverable through reconciliation.
- Easier to test and reason about than a broker.

**Disadvantages**

- Profiles can be stale until a request, sweep or admin reconciliation.
- Reconciliation adds a table, service, endpoints and tests.
- Heavy backfill or class-wide recompute can affect response latency.
- No scheduled trend/recommendation refresh.

**Potential consequences**

- The UI must show freshness, “last computed” and a recompute action.
- Ingestion must be best-effort and must never fail the result request.
- Monitoring must report receipt backlog, failure codes and stale profiles.
- If a queue is added later, pending/failed receipts and `dirty_at` are the hand-off points; no evidence contract changes.
- The receipt table is student-linked and must be included in the D9 deletion lifecycle.

**Approval:** Engineering. **Explicit approval required: no, with product awareness; D9 privacy review covers receipt retention.**

---

### D11 — Personalized assessment per student

**Recommended default**

**Reuse the existing exam engine.** A teacher creates or selects exams per pathway level and assigns them through `LearningAssignment` to a student, group or class. No generated exam engine, no per-student paper generation in v1. A future unique-per-student requirement should extend the existing exam/assignment semantics, not create a parallel assessment system.

**Alternatives**

1. Generate a unique exam per student now.
2. Reuse existing exams with per-pathway assignment (recommended).
3. Use training exams only.
4. Defer personalized assessment entirely.

**Advantages**

- Preserves grading, `/20` conventions, sessions, proctoring and result history.
- Avoids a duplicate assessment engine and a large new generation surface.
- Teacher can review and control assessment content.
- Works with existing `ExamClass` and the new assignment overlay.

**Disadvantages**

- Students in the same pathway may receive the same exam.
- A teacher who wants unique papers per student must create multiple exams manually.
- Assessment security and sharing risk remain.
- The pathway may need several exam variants.

**Potential consequences**

- `LearningAccessService` must allow an assigned exam even when it is not class-assigned.
- Exam assignment must remain tenant/class scoped.
- If unique exams become mandatory, a separate product decision and architecture review are required.
- Recommendations should suggest an existing assessment or a teacher-created one, not invent content.

**Approval:** Product. **Explicit approval required: yes.**

---

### D12 — Teacher visibility of student evidence

**Recommended default**

Show teachers a **summarized evidence trail**:

- source type and source label (exam, training, exercise, game, teacher assessment);
- date;
- objective/competency and Bloom dimension;
- credit/score and maximum;
- high-stakes badge;
- first attempt vs latest attempt;
- retraction/correction marker;
- confidence and evidence weight;
- a “Why this?” explanation with the rule/policy summary.

Hide internal model constants, raw weights, dedupe keys, AI prompts and other students’ data by default. Students see a plain-language summary and their own evidence, not raw weights or model metadata. Admins can access the full audit view.

**Every explanation must answer four questions:**

1. **Observed performance** — what did the student actually do (items correct, rubric credit, recency)?
2. **Evidence sufficiency** — is there enough evidence to act, or is this “not enough evidence”?
3. **Missing or limiting condition** — no high-stakes evidence, low confidence, only automatic Evaluate/Create evidence, stale profile, etc.
4. **Recommended next action** — practice, a short summative check, a rubric task, re-teaching, enrichment, or recompute.

**Teacher-facing examples (illustrative, not production evidence):**

| State | Observed | Sufficiency | Missing / limiting | Next action | Student-facing wording |
|---|---|---|---|---|---|
| Foundation (`emerging`) | 2 of 5 recent items correct; errors follow a pattern | Enough evidence to act; below foundation band | Secure independent performance | Re-teach with a concrete model; guided practice; short check | “You are building the basics. Let’s practise together, then try a short check.” |
| Developing | 3 of 5 correct; recent work improving | Enough evidence; moderate confidence | Consistency and a secure high-stakes demonstration | Targeted practice, then a short exam or rubric task | “You are developing this skill. A little more practice and a check will show what you can do.” |
| Proficient | 4 of 5 correct; exam item and rubric task completed | Sufficient; confidence passed | No critical gap at this objective | Transfer task; avoid repeating the same items | “You have shown this skill consistently. You are ready to use it in a new situation.” |
| Advanced | 6 items, two rubric tasks, transfer task | High confidence; sufficient distinct evidence | No critical gap; monitor decay | Enrichment/transfer; longer-interval check | “You can use this skill in challenging situations. You are ready for a deeper challenge.” |
| Developing + `summative_pending` | 5 of 5 recent practice items correct | Strong formative; no summative | A summative check is missing | Assign a short check or rubric task; do not auto-promote | “Your practice is strong. A short check will show whether you can do it on your own.” |
| Insufficient evidence | Only one small activity recorded | Not enough evidence; not a low grade | More practice and an assessed task | Assign a short practice set and one assessed task; do not infer ability | “We do not have enough evidence yet. That is not a bad result; let’s try a short activity.” |

**Presentation rules:**

- Never show only the level; always show the evidence summary and next action.
- Do not show raw `W`, `C`, weights, dedupe keys or policy constants to students; teachers may open a “Why this?” detail with source mix and rule summary.
- Use non-stigmatizing wording in English, French and Arabic; do not say “weak”, “slow”, “low ability” or “failed”.
- If the profile is stale/incomplete, show that before any level.
- A teacher override is labeled “Teacher-set level” with the reason; it does not erase the computed evidence summary.
- No peer ranking, public comparison or global student level.

**Alternatives**

1. Show all raw evidence and weights to teachers.
2. Show only the final level.
3. Show a summarized trail with an optional detail view (recommended).
4. Show evidence to students with raw weights.

**Advantages**

- Supports teacher trust and explainability.
- Reduces misinterpretation of weights as grades.
- Protects student privacy and reduces cognitive overload.
- Keeps sensitive model details behind an authorized detail view.

**Disadvantages**

- Teachers cannot debug every calculation without opening details.
- Support requests may increase.
- Hiding details could obscure bias or data-quality problems.
- A separate student-safe projection adds API work.

**Potential consequences**

- Add teacher/admin/student response projections; do not return raw evidence rows to students.
- Audit access to detailed evidence.
- The “Why this?” panel must be understandable without exposing implementation details.
- The owner must approve what is visible to students, especially peer comparisons (recommended: none).

**Approval:** Product + privacy. **Explicit approval required: yes.**

---

### D13 — Trust boundary for summative evidence

**Question.** `exam` evidence is the only automatic source that can satisfy the high-stakes gate (D4). But the write paths that produce a `Result` do not all derive `mode`, `exam_id` and the score on the server. Which `Result` rows may be treated as trustworthy `summative` evidence, and what must the server verify before promoting them?

**Evidence inspected (read-only; no source change).**

- `POST /api/v1/sessions/:id/submit` → `SessionService.completeSession` → `ResultService.createFromSession` (`src/backend/routes/sessions.routes.js:141`; `src/frontend/services/ResultService.js:16-60`). This path takes `exam_id`/`user_id` from the committed `ExamSession`, writes `mode = RESULT_MODE.EXAM` unconditionally and recomputes the score from the exam's questions. It is **server-authoritative**.
- `POST /api/v1/results` (`src/backend/routes/results.routes.js:566-655`). Accepts `body.mode` (default `'training'`), `body.exam_id`/`examId` (validated only to exist in the tenant) and a client-computed `grade20`/`score`/`earned_points`/`total_points`. No re-grading from answers. **Client-supplied.**
- `POST /api/v1/bulk/results` (`src/backend/routes/bulk.routes.js:545-676`). Same shape: client `row.mode`, client `row.exam_id`/`examId`, client score; `answers_json.userAnswers` (and any client `correct` flag) stored verbatim. **Client-supplied.**
- `GradingService.gradeAttempt` already exists and is used server-side by `GET /api/v1/results/:id/corrections` (`results.routes.js:433`), so re-grading from the answer key is available today.

**Consequence if unaddressed.** A client could post `mode='exam'` with a real non-training `exam_id` and an arbitrary score, and the classification rule 4 (`mode='exam'` + real `exam_id` + `Exam.is_training=false`) would accept it as `summative`. Rule 4 alone is necessary but **not sufficient**.

**Recommended default (not approved).**

A classified `exam` row is promoted to `summative` only when it is **server-authoritative**. All of the following are required:

1. **Exam identity.** Joined `Exam.is_training = false` and `Exam.school_id = Result.school_id`.
2. **Session linkage.** An `ExamSession` `S` with `S.exam_id = Result.exam_id`, `S.user_id = Result.user_id` (non-null), `S.school_id = Result.school_id`, where `S` is the session that produced this result.
3. **Completed session.** `S.status = 'completed'` with `S.completed_at` non-null and `Result.date_taken >= S.started_at`. `active`/`pending`/`expired`/`abandoned` sessions do not qualify.
4. **Single use.** At most one `Result` maps to a given `ExamSession`; a repeat submit on a completed session is rejected (current `SessionService.completeSession` requires `active` then sets `completed`, so a second submit throws). The check is enforced from data, not assumed; multiple results on one session → none promoted, conflict flagged.
5. **Server re-grade.** Per-question correctness re-derived with `GradingService.gradeAttempt` from the exam's question bank, never from a client `correct` flag or client score; aggregate mismatch recorded as `metadata_json.grading_mismatch`.

If rule 4 matches but any check fails, the row is ingested as `source_kind='training'`/`formative` (never `summative`) and flagged (`trust='client_supplied'` for a missing session; `trust='session_mismatch'` / `trust='session_reused'` for checks 2–4). Training, game, tournament and Kids rows are unaffected: they are always `formative` and their low source weight is the safeguard.

**Governance guard (part of D13).** Flipping `Exam.is_training` reclassifies evidence, so it is not a silent edit: the admin path must count impacted completed sessions/results/evidence/students, require a per-change confirmation that names the consequence (summative↔formative move, retraction, possible level decrease), write an immutable audit record (actor, time, exam id, old→new, impact counts, confirmation, reconciliation run reference), and recover by reconciliation (retract with `source_reclassified` + recompute), never by editing evidence. `true→false` creates `summative` evidence only if checks 1–5 pass.

**Alternatives considered.**

- *Trust any rule-4 row.* Simplest, but a client can self-certify summative evidence; rejected.
- *Block `POST /results`/bulk entirely for exam-shaped rows.* Safe but breaks legitimate offline/legacy result sync; too blunt.
- *Re-grade but accept direct writes as `exam`.* Better than nothing, but a direct write has no session to bind `user_id`; still weaker than the recommended check.
- *Recommended:* keep the write paths working, but require the server-authoritative check before `summative` promotion and label everything else.

**Risk / review notes.**

- The check adds a join to `ExamSession` and a re-grade during ingestion. Both are already available; cost is bounded to exam-shaped rows.
- A school that legitimately imports historical exam results without sessions would see them as `formative`. The owner may approve a narrower, explicitly-flagged bulk-import path (admin-only, audited) — a policy sub-decision, not a default.
- `source_kind`, `evidence_class` and the joined `Exam.is_training` are inside `source_fingerprint`; a later flip of `Exam.is_training` is handled as a reclassification (retract + recompute), not a silent change.

**Potential consequences.**

- Evidence ingestion for exam rows gains a trust check; nothing else changes.
- Admin health/audit must surface `trust='client_supplied'` rows so a repeated pattern is visible.
- Tests must cover: rule-4 row with a valid completed session → `summative`; rule-4 row without a session → `formative` + `trust='client_supplied'`; session with a different user/exam/school → `trust='session_mismatch'`; two results on one session → `trust='session_reused'`; non-completed session → not summative; client `correct` flag ignored in favour of the server grade; and an `is_training` flip with existing results → confirmation required, audit written, evidence retracted/recomputed.

**Offline, bulk-imported and paper exams — the teacher-attested path (part of D13).** A row written by a direct `POST /api/v1/results` or a bulk import has no committed session, so it fails checks 2–4 and is `formative` by default. Legitimate offline/paper exams must therefore enter through an **explicit, audited attestation**, never through an unattested bulk row:

- **No self-certification.** A bulk/offline exam row is `formative` unless a teacher/admin explicitly attests it for a named exam (and class) through a dedicated, permissioned action. Attestation is per-import, is not a remembered default, and is attributed to the attesting user.
- **Attested evidence.** An attested row is ingested `source_kind='exam'`/`summative` with `method='teacher_attestation'` and `metadata_json.trust='teacher_attested'`. Because there is no server session and often no answer key, checks 2–5 are **not** used; the attestation itself is the trust anchor, and the attesting teacher is accountable (audit).
- **Paper scores.** A teacher-entered paper score is modeled as either (a) a rubric-based activity attempt producing `method='teacher_rubric'` evidence, or (b) an attested exam import producing `method='teacher_attestation'`. It is never stored as an unattested bulk exam row.
- **Reversible.** Revoking an attestation retracts the evidence (`retraction_reason='attestation_revoked'`), marks the student dirty and recomputes — the same correction model as `source_reclassified`.
- **Bounded by D14.** Attested evidence satisfies the D4 gate only if the attested exam is high-stakes-designated (D14).

This keeps one trust decision (D13) with two evidence paths: a server-authoritative session path and an explicit teacher-attested path. Nothing here is implemented in Phase 0; it is a Phase 2 design constraint and requires the owner's approval of the attestation mechanism.

**Approval:** Engineering + security (attestation mechanism also needs pedagogy sign-off), with product awareness. **Explicit approval required: yes.**

---

### D14 — Which formal exams are high-stakes

**Question.** D4 defines the high-stakes gate and treats `source_kind='exam'` evidence as high-stakes. But no decision states *which* formal exams count. Is every `is_training=false` exam high-stakes, or is high-stakes an explicit designation an author/teacher chooses? Without this, a diagnostic or placement exam built as a formal (non-training) exam would silently count as high-stakes, and a school's practice-as-formal exam would too.

**Recommended default (not approved).**

- **Default: every `is_training=false` exam is high-stakes.** This matches how exam evidence is already weighed (source weight 1.0) and the least-surprising reading of "formal exam".
- **Explicit opt-out:** a school may designate a formal-but-non-summative exam (e.g. diagnostic, placement, survey) as **not** high-stakes at authoring time. The design flag is `Exam.is_high_stakes` (default `true`; meaningful only when `is_training=false`), captured from Phase 2 and shown in authoring UI.
- **Effective high-stakes** = `is_training=false AND is_high_stakes=true AND` the D13 trust checks pass. The D4/A.7 high-stakes condition is read as `((source_kind='exam' AND exam is high-stakes) OR method='teacher_rubric') AND credit >= 0.60`, with distinct-item counting unchanged.
- **Audited.** Changing the designation on an exam that already has evidence is a governance action with the same confirmation/audit/recompute guard as flipping `Exam.is_training` (D13).

**Alternatives considered.**

- *Opt-in (only designated exams are high-stakes).* Safer against accidental high-stakes evidence but silently makes most real exams formative unless every author remembers to opt in; risks under-counting.
- *Designation at exam creation only, immutable after results exist.* Simple, but blocks legitimate corrections; the audited-change guard covers that better.
- *Recommended:* default-on with an explicit, audited opt-out.

**Risk / review notes.**

- Default-on preserves current behavior; the risk is a formal-but-diagnostic exam counting as high-stakes, mitigated by the visible `is_high_stakes` flag and the audit on change.
- The flag is a policy input, not a trust input: it never promotes non-server-authoritative evidence (D13 still governs).
- Gate this before Phase 3 publishes levels; Phase 2 may capture the flag and must not publish levels until D14 is approved.

**Potential consequences.**

- Adds `Exam.is_high_stakes` (additive, default `true`) and an authoring-UI toggle.
- Mastery/explanation code reads the effective designation; tests must cover: non-training exam default → high-stakes; designated non-high-stakes exam → `summative` evidence that does **not** satisfy the gate; and the audited-change guard.

**Approval:** Pedagogy. **Explicit approval required: yes.**

---

### D15 — Programme governance and objective versioning

**Question.** What governance and versioning policy must be decided before Phase 1B implements official programmes, objective versions, imports and coverage?

**Recommended default — SUBSTANTIVELY APPROVED 2026-11-21 (owner decision F1).** The owner accepted the four limbs below as the approved default, without broadening them. The earlier wording-only acceptance (2026-11-21) is distinct and did not itself approve the default.

- Official objectives are **immutable once published** and revised only by creating new versions (architecture draft, P2 / input (e)).
- A version bump requires **explicit per-class adoption** and never moves a class automatically (U3, §19.1).
- Teacher imports are restricted to the teacher's **assigned subjects**, enforced server-side (U2, §19.1).
- Governance mode is a school setting with an **audited** switch; moving to a stricter mode re-evaluates existing rows, while moving to a looser mode never silently grants reliability (U11, §19.2).

**Gate:** before **Phase 1B**. **Status:** **DECIDED — substantively approved 2026-11-21 (owner decision F1).** The gate is satisfied as a decision; it does **not** authorize implementation. U1–U5, U7, U9 and U11 are the stated dependencies (approved in the architecture draft, §19). U10–U14 inform the design; U15 is **approved in principle**, and its G4 wording condition is now **satisfied** by the adopted G4 wording (owner decision E1, draft §20.2); G2/G3 are approved and their wording accepted (§20.3–§20.4). **U8 is closed** because this substantive decision is recorded here, not by a label change.

**Approval owner:** Product + pedagogy. **Explicit approval required: yes.** **Approved:** 2026-11-21 — owner decision F1, the recommended default accepted unchanged (four limbs above). No Phase 1B implementation is authorized by this entry.

---

## 3. Decision-to-phase approval gates

Not every decision must be approved before Phase 1. Each decision must be **approved, revised, or explicitly deferred to the named dependent phase**. A deferral is recorded, is not an approval, and blocks that phase. Mandatory pedagogical, privacy and security approvals cannot be weakened by deferral.

| Phase | Decisions required before the phase starts | Why this gate |
|---|---|---|
| Phase 1 — Taxonomy and question pedagogy | **D1, D2, D8** | Label wording, objective authority and localization scope are visible in the first UI and API |
| Phase 1B — Curriculum programmes and coverage | **D15 (decided 2026-11-21)** | D15 is substantively approved; **Phase 1B implementation is still not authorized** and requires a separate explicit owner authorization |
| Phase 2 — Evidence and activity attempts | **D3, D7, D9 (retention/privacy direction), D10, D12, D13** | Backfill, game evidence, retention/privacy, ingestion recovery, evidence visibility and the summative trust boundary affect real student evidence |
| Phase 3 — Deterministic mastery and profiles | **D4, D5, D6, D14** | High-stakes gate, thresholds/weights, override authority and the high-stakes designation determine levels and messaging |
| Phase 4 — Resource mapping and blueprints | No new decision; all prior gates remain | Uses taxonomy and evidence from earlier phases |
| Phase 5 — Pathways, groups and assignments | **D11** | Personalized assessment scope and assignment integrity |
| Phase 6 — Recommendations and interventions | No new decision; D4/D5/D12 remain in force | Recommendations depend on approved mastery and visibility rules |
| Phase 7 — Analytics and reporting | No new decision; D9/D12 remain in force | Metrics depend on retention and visibility policy |
| Phase 8 — Hardening and rollout | **D9 final retention/privacy approval; D8 full-app RTL decision if required; D10 queue re-evaluation** | Real-school pilot and production rollout require final privacy/localization/operations sign-off |

**Deferral rules:**

- A deferred decision must name the phase and the owner; “later” is not a disposition.
- A deferred decision must not be used as an implementation default.
- D4/D5 may be deferred until Phase 3; Phase 1/2 may proceed only if they do not require mastery labels or thresholds. Phase 3 cannot start without explicit D4/D5 approval or a documented provisional approval valid only for fixture tests; final approval is required before real students see levels.
- D9’s retention direction must be approved before Phase 2 ingests real student evidence; final retention values may be completed before Phase 8.
- D10 is an engineering decision, but it requires product awareness and D9 privacy review for receipt retention.
- D13 must be approved before Phase 2 promotes any `Result` row to `summative`; until then, exam evidence may be ingested but not trusted for the high-stakes gate. The teacher-attested path for offline/paper exams is part of D13 and is off until D13 is approved.
- D14 must be approved before Phase 3 publishes levels. Phase 2 may capture the `is_high_stakes` designation (default `true` for non-training exams) but must not publish any level while D14 is open.
- A change to an approved decision is a revision with an audit record; it may require a new policy version and recompute.

---

## 4. Approval record

| Field | Value |
|---|---|
| Owner | ____________________ (name not entered; provenance is the owner's explicit 2026-11-21 consolidated decision record, which the ratified safeguard in `docs/ARCHITECTURE-BASELINE.md` §2.1 treats as valid owner-decision provenance) |
| Date | 2026-11-21 (D15 substantive approval and register reconciliation; original Phase 1 gate record dated 2026-11-19) |
| Approved decisions | **D1** (label “Learning profile”), **D2** (school-managed objectives, teachers may propose), **D8** (EN/FR/AR learning panels, no full-app RTL) — **Phase 1 gate only**; **D15** (programme governance and objective versioning) — **substantive approval 2026-11-21 (F1)**, decision only |
| Register wording accepted | **D15 — Programme governance and objective versioning** (2026-11-21); wording acceptance is recorded **separately** from the substantive approval below |
| D15 substantive approval | **2026-11-21 — owner decision F1:** the recommended default is accepted unchanged (immutable published objectives; explicit per-class adoption; server-side import scope; audited governance setting). **No Phase 1B implementation is authorized.** U8 is closed because this decision is recorded here. |
| Revised decisions | None recorded |
| Deferred decisions (decision → phase → owner) | D3, D4, D5, D6, D7, D9, D10, D11, D12, D13, D14 → their dependent phases → owner TBD |
| `mastery-v1.1` | **Acknowledged as an unvalidated review candidate** (not validated science, not permanently approved) |
| Phase 1 gate confirmed (D1, D2, D8) | **Yes — 2026-11-19. Phase 1 authorized; Phase 1 only.** |
| Phase 2 gate confirmed (D3, D7, D9 direction, D10, D12, D13) | ____________________ |
| Phase 3 gate confirmed (D4, D5, D6, D14) | ____________________ |
| Conditions | Phase 1 implementation may begin only after the Phase 1 plan is accepted. No Phase 2 work, no evidence storage, no `summative` promotion, and no level publication until the Phase 2/3 gates are recorded. |
| Signature/confirmation | ____________________ (no signature line executed; the 2026-11-21 owner decisions are recorded as explicit conversation decisions — valid provenance under `docs/ARCHITECTURE-BASELINE.md` §2.1; a blank signature does not invalidate them) |

**No implementation may begin until the required gate decisions are recorded and Phase 1 is explicitly authorized.** A blank deferral is not permission; an unapproved decision must not silently become an implementation default.
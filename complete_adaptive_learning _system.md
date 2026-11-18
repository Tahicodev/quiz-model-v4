# FEATURE: ADAPTIVE LEARNING, BLOOM'S TAXONOMY & PERSONALIZED STUDENT LEARNING PATHWAYS

## 1. VISION AND OBJECTIVE

Transform the existing Quiz App into an intelligent, pedagogically driven adaptive learning platform.

The objective is to enable teachers to understand each student's actual learning profile, identify cognitive strengths and weaknesses, evaluate mastery of specific learning objectives, and provide personalized educational pathways.

The system must recognize that students in the same classroom do not necessarily have the same learning level, learning needs, or progression speed.

Teachers should be able to deliver one common lesson to the entire classroom while assigning differentiated courses, exercises, interactive games, activities, and assessments according to each student's demonstrated level.

This is NOT simply a question-tagging feature.

It is a complete pedagogical intelligence and differentiated instruction system integrated into the existing application.

## 2. PEDAGOGICAL FOUNDATION: REVISED BLOOM'S TAXONOMY

Implement the six cognitive dimensions of Revised Bloom's Taxonomy.

Every question should support classification according to the cognitive process required to answer it.

### The six dimensions

1. REMEMBER
   - Retrieve previously acquired knowledge.
   - Examples: recognize, identify, recall, name, list.
   - French: Mémoriser.

2. UNDERSTAND
   - Interpret, explain, summarize, classify, and demonstrate comprehension.
   - Examples: explain, describe, summarize, interpret.
   - French: Comprendre.

3. APPLY
   - Use knowledge, rules, and procedures to solve problems.
   - Examples: calculate, solve, demonstrate, execute.
   - French: Appliquer.

4. ANALYZE
   - Examine information, identify relationships, compare, distinguish, and identify patterns.
   - Examples: compare, differentiate, investigate, organize.
   - French: Analyser.

5. EVALUATE
   - Make judgments based on criteria, verify solutions, and justify decisions.
   - Examples: justify, assess, critique, defend, verify.
   - French: Évaluer.

6. CREATE
   - Produce original work, design solutions, construct ideas, and combine acquired knowledge in new situations.
   - Examples: design, develop, invent, construct, compose.
   - French: Créer.

Each dimension must have:

- Unique identifier.
- Multilingual name.
- Description.
- Cognitive action verbs.
- Pedagogical examples.
- Associated learning objectives.

IMPORTANT: Bloom's cognitive dimension must NEVER be confused with question difficulty.

A difficult Remember question remains a Remember question.

Store and manage these as independent attributes:

- Cognitive dimension.
- Difficulty level.
- Subject.
- Course.
- Chapter or topic.
- Learning objective.
- Specific skill or competency.
- Question type.
- Maximum points.
- Expected answer or assessment criteria.

## 3. QUESTION CLASSIFICATION SYSTEM

Integrate Bloom's classification into the existing question management system.

Do not replace the existing question architecture or existing question types.

First inspect all existing question models, question creation forms, editing forms, validation logic, question repositories, and APIs.

The classification must work with all existing question types, including:

- Single-choice MCQ.
- Multiple-choice MCQ.
- True/False.
- Fill in the blank.
- Matching.
- Draggable questions.
- Odd-one-out.
- Any other existing question formats.

### Classification requirements

Allow teachers to classify questions manually.

Provide a clear and intuitive Bloom taxonomy selector during question creation and editing.

Display:

- Cognitive dimension.
- Difficulty.
- Subject and topic.
- Learning objective.
- Specific skill assessed.

Allow AI-assisted classification when AI functionality already exists in the application.

AI classification must:

- Analyze the actual question and expected answer.
- Consider the cognitive operation required from the student.
- Suggest a Bloom category.
- Explain why it selected this category.
- Indicate confidence.
- Allow the teacher to accept, reject, or modify the suggestion.

Never classify a question solely based on its wording or verbs.

For example, a question containing the word "explain" does not automatically belong to Understand. The actual cognitive operation required must determine its classification.

Questions that genuinely assess multiple cognitive dimensions should support multiple assessment criteria or sub-items, with explicit weighting. Do not force an artificial single classification when the question measures several independent competencies.

Questions with insufficient information must be flagged for teacher review.

## 4. STUDENT COGNITIVE PROFILE

Create a continuously updated cognitive profile for every student.

The profile must measure performance across the six Bloom dimensions.

However, do not calculate one generic cognitive score and treat it as a complete representation of the student.

The system must calculate profiles at multiple levels:

A. Overall profile:

- Overall cognitive performance across available evidence.

B. Subject profile:

- Mathematics.
- French.
- Arabic.
- Other supported subjects.

C. Course/topic profile:

- Fractions.
- Arithmetic.
- Conjugation.
- Vocabulary.
- Spelling.
- Other topics.

D. Skill profile:

- Individual learning objectives and competencies.

E. Cognitive profile:

- Remember.
- Understand.
- Apply.
- Analyze.
- Evaluate.
- Create.

For each dimension and learning objective, calculate:

- Number of attempts.
- Number of successful attempts.
- Success rate.
- Weighted performance.
- Recent performance.
- Historical performance.
- Progression trend.
- Evidence confidence.
- Current mastery status.

The profile must be based on actual student performance and not simply on question counts or total exam scores.

Use question points and assessment weights where appropriate.

For open-ended answers and creative activities, allow teacher-assessed rubrics to contribute to the profile.

Do not assume that automatically corrected MCQ questions can fully measure advanced cognitive abilities such as evaluation and creation.

### Evidence and confidence

Distinguish between:

- Insufficient evidence.
- Emerging mastery.
- Developing mastery.
- Proficient mastery.
- Advanced mastery.

A student who has answered one question correctly must not automatically be considered proficient.

Require sufficient evidence before making strong mastery claims.

Display when a classification or recommendation has low confidence.

Use recent performance and historical evidence while avoiding excessive influence from a single assessment.

## 5. MULTIDIMENSIONAL STUDENT LEARNING LEVELS

Introduce dynamic learning levels, but do not permanently classify students into fixed categories.

The system may display four pedagogical support levels for each subject, topic, or learning objective:

LEVEL 1 — FOUNDATION
Students who need prerequisite reinforcement and guided instruction.

LEVEL 2 — DEVELOPING
Students who understand basic concepts but need practice and consolidation.

LEVEL 3 — PROFICIENT
Students who demonstrate consistent mastery and can independently apply their knowledge.

LEVEL 4 — ADVANCED
Students who demonstrate strong mastery and are ready for complex reasoning, transfer, evaluation, and creative activities.

These levels must be determined by mastery evidence and pedagogical rules, not by arbitrary ranking among classmates.

A student can simultaneously be:

- Advanced in arithmetic.
- Developing in fractions.
- Foundation level in geometry.
- Proficient in French vocabulary.

Never assign one permanent global level to a student.

Levels must be recalculated as new evidence becomes available.

Teachers must be able to inspect and override recommendations with a recorded pedagogical justification.

## 6. ADAPTIVE LEARNING RECOMMENDATION ENGINE

Build an adaptive recommendation engine that translates student performance into actionable educational recommendations.

The engine should answer:

1. What has the student mastered?
2. What does the student understand partially?
3. Where does the student struggle?
4. Which prerequisites are missing?
5. What should the student learn next?
6. Which educational resources and activities should be assigned?
7. How will the teacher verify improvement?

Recommendations must be based on:

- Subject.
- Topic.
- Learning objective.
- Bloom cognitive dimension.
- Current mastery.
- Difficulty.
- Historical attempts.
- Previous interventions.
- Available educational resources.

### Recommendation types

The engine should recommend:

A. COURSES

- Revision of prerequisite concepts.
- Simplified explanations.
- Alternative explanations.
- Visual lessons.
- Step-by-step lessons.
- Advanced enrichment lessons.

B. EXERCISES

- Basic reinforcement exercises.
- Guided exercises.
- Independent practice.
- Application problems.
- Analytical challenges.
- Evaluation exercises.
- Creative exercises.

C. INTERACTIVE ACTIVITIES

- Existing educational games.
- Image-based activities.
- Matching activities.
- Drag-and-drop activities.
- Discovery and exploration activities.
- Subject-specific challenges.

D. ASSESSMENTS

- Diagnostic assessments.
- Formative assessments.
- Remedial assessments.
- Mastery assessments.
- Advanced assessments.

Each recommendation must include:

- Pedagogical reason.
- Target learning objective.
- Target Bloom dimension.
- Recommended difficulty.
- Expected duration.
- Suggested resources.
- Success criteria.
- Conditions for progression.

Do not recommend activities merely because they exist in the database. They must match the student's actual learning needs.

## 7. DIFFERENTIATED INSTRUCTION: ONE CLASS, MULTIPLE LEARNING PATHWAYS

This is one of the most important features.

The application must enable a teacher to teach one common lesson to the entire class while creating different learning pathways for students.

Example:

Teacher delivers a lesson about FRACTIONS.

All students receive the same common lesson.

After a diagnostic assessment, the application identifies different learning needs.

PATHWAY A — FOUNDATION
For students who do not yet understand the concept:

- Visual explanations.
- Prerequisite lessons.
- Basic examples.
- Guided exercises.
- Interactive educational games.
- Remember and Understand questions.

PATHWAY B — DEVELOPING
For students who understand the concept but struggle to apply it:

- Step-by-step examples.
- Practical exercises.
- Guided problem-solving.
- Apply questions.

PATHWAY C — PROFICIENT
For students who can solve standard problems:

- More complex exercises.
- Comparison activities.
- Reasoning problems.
- Analyze and Evaluate questions.

PATHWAY D — ADVANCED
For students who demonstrate strong mastery:

- Open-ended challenges.
- Real-world problems.
- Projects.
- Creative mathematical activities.
- Create questions.

IMPORTANT:
These pathways must remain flexible.

A student may belong to one pathway for one learning objective and another pathway for a different objective.

The teacher must be able to:

- Create a common classroom lesson.
- Generate differentiated activities.
- Assign different exercises to different students or groups.
- Assign different learning pathways to individual students.
- Modify the automatically suggested assignments.
- Move students between pathways.
- Monitor the progress of each group.
- Compare initial diagnostic results with final assessment results.

All students should work toward common essential learning objectives, but they may use different resources, levels of support, and degrees of challenge.

## 8. TEACHER WORKFLOW

Design an intuitive workflow integrated into the existing teacher session.

Suggested workflow:

STEP 1 — SELECT CLASS AND COURSE
Teacher selects a class, subject, course, chapter, and learning objectives.

STEP 2 — DEFINE LEARNING OBJECTIVES
Teacher identifies the competencies and cognitive dimensions to assess.

STEP 3 — DIAGNOSTIC ASSESSMENT
Generate or select questions covering the relevant learning objectives and Bloom dimensions.

STEP 4 — ANALYZE STUDENTS
The application evaluates performance and identifies individual learning needs.

STEP 5 — GENERATE DIFFERENTIATED PATHWAYS
The application proposes learning groups and personalized activities.

STEP 6 — TEACHER VALIDATION
Teacher reviews, edits, validates, or rejects recommendations.

STEP 7 — ASSIGN LEARNING ACTIVITIES
Assign lessons, exercises, games, and assessments to individual students or groups.

STEP 8 — MONITOR PROGRESS
Track completion, performance, mastery progression, and remaining difficulties.

STEP 9 — REASSESS AND ADAPT
Use new assessment evidence to update student profiles and recommend the next learning activities.

The workflow must remain teacher-controlled. Automated recommendations are decision support, not autonomous educational decisions.

## 9. TEACHER DASHBOARD AND STUDENT ANALYTICS

Integrate the feature into the existing teacher interface.

Do not overload the Overview dashboard.

The Overview should provide a concise decision-making summary, while detailed analytics and management should live in dedicated sections.

### Class cognitive overview

Display:

- Student distribution by mastery level.
- Performance by Bloom dimension.
- Performance by subject and topic.
- Most difficult learning objectives.
- Students requiring intervention.
- Students ready for advanced activities.
- Progression over time.
- Pending personalized assignments.

Provide filters for:

- Class.
- Subject.
- Course.
- Topic.
- Learning objective.
- Bloom dimension.
- Date range.

### Individual student profile

Create a detailed student learning profile containing:

1. Overall progress.
2. Cognitive profile across six Bloom dimensions.
3. Subject-specific performance.
4. Topic and skill mastery.
5. Learning strengths.
6. Learning difficulties.
7. Historical assessment results.
8. Assigned personalized courses.
9. Completed exercises and activities.
10. Recommended next steps.
11. Progression over time.

Provide visualizations that help teachers understand the student quickly.

Use radar charts, bar charts, progression charts, and competency tables where appropriate.

Every visualization must provide meaningful educational information rather than decorative statistics.

## 10. ASSESSMENT AND LEARNING ANALYTICS

Improve the existing assessment system so that assessments can measure specific cognitive dimensions and learning objectives.

For each exam or assessment, allow teachers to:

- Define targeted learning objectives.
- Define the desired Bloom dimension distribution.
- Define question difficulty distribution.
- Define points and assessment criteria.
- Identify which competencies are being assessed.

After an assessment, generate:

- Individual student analysis.
- Class performance analysis.
- Bloom dimension performance.
- Topic and skill mastery.
- Learning gaps.
- Suggested remedial activities.
- Suggested advanced activities.

Keep the existing grading system and /20 scoring conventions.

Do not replace the existing assessment grading logic.

A student's overall exam grade must not be treated as a complete cognitive profile.

## 11. EDUCATIONAL CONTENT AND RESOURCE MANAGEMENT

Create a relationship between questions, courses, exercises, games, activities, assessments, and learning objectives.

The system should know which educational resources can help students improve a specific competency.

For example:

Learning objective: Understand equivalent fractions.

Associated resources:

- Course explaining equivalent fractions.
- Visual fraction comparison activity.
- Basic MCQ questions.
- Matching activity.
- Interactive educational game.
- Practical exercises.
- Advanced problem-solving assessment.

This resource mapping is essential for the recommendation engine.

Reuse existing courses, questions, games, and activities whenever possible.

Do not create duplicate content unnecessarily.

Allow teachers to manually associate existing resources with learning objectives, topics, and Bloom dimensions.

## 12. AI INTEGRATION

If the existing application already supports AI services, integrate AI as an optional pedagogical assistant.

Potential AI capabilities:

- Suggest Bloom classifications.
- Analyze question quality.
- Suggest learning objectives.
- Identify possible misconceptions from answer patterns.
- Generate differentiated exercises.
- Generate alternative explanations.
- Recommend remediation activities.
- Suggest advanced challenges.
- Explain why a particular recommendation is appropriate.

AI must not independently diagnose a student's cognitive abilities or infer psychological characteristics.

Recommendations must be grounded in observable educational evidence.

AI-generated content must be reviewed and approved by the teacher before being assigned when appropriate.

Keep the core mastery calculations deterministic, transparent, and reproducible.

## 13. DATA MODEL AND ARCHITECTURE

Before implementing anything, inspect the existing database schema, backend architecture, repositories, APIs, question models, student models, examination models, and teacher workflows.

Design the feature according to the existing architectural conventions.

Consider appropriate entities such as:

- BloomDimension.
- LearningObjective.
- LearningSkill.
- QuestionAssessmentCriterion.
- StudentLearningEvidence.
- StudentSkillMastery.
- StudentCognitiveProfile.
- LearningPathway.
- LearningPathwayItem.
- LearningAssignment.
- LearningIntervention.
- LearningResourceMapping.

These are conceptual entities, not mandatory table names.

Avoid unnecessary duplication.

Preserve relational integrity and the existing database normalization approach.

Ensure that:

- Student data is isolated by school and authorized access.
- Teachers only access students and classes they are authorized to manage.
- Learning evidence is traceable to its source.
- Historical assessments remain available.
- Mastery calculations can be reproduced.
- Recommendations have recorded reasons.
- Changes to student profiles are auditable.

Implement the feature through the existing repository and service layers.

Do not bypass the backend or introduce new LocalStorage-based persistence.

Preserve the existing SaaS architecture and authentication mechanisms.

## 14. UX/UI REQUIREMENTS

The interface must be modern, intuitive, responsive, and teacher-friendly.

Avoid presenting complex pedagogical terminology without explanations.

Use:

- Clear labels.
- Short descriptions.
- Contextual tooltips.
- Meaningful visualizations.
- Student competency cards.
- Progression indicators.
- Learning pathway views.
- Clear intervention recommendations.

Support the application's existing multilingual requirements, particularly French and Arabic, including RTL layout.

Maintain visual consistency with the existing design system.

Do not redesign unrelated pages.

Do not overload the Teacher Overview.

## 15. IMPORTANT PEDAGOGICAL RULES

These rules are mandatory:

1. Bloom cognitive dimension is not equivalent to question difficulty.
2. A single question does not establish mastery.
3. A single global score cannot represent a student's complete learning profile.
4. Students must be evaluated by subject, topic, skill, and learning objective.
5. Learning levels must be dynamic and evidence-based.
6. Advanced cognitive dimensions must not be inferred solely from automatic MCQ results.
7. A student must never be permanently labeled as weak or advanced.
8. Missing evidence must be distinguished from poor performance.
9. Students must have opportunities to progress between pathways.
10. The teacher remains responsible for validating pedagogical decisions.
11. All students should retain access to common essential learning objectives.
12. Personalized learning must not create unnecessary segregation or stigmatization.

## 16. IMPLEMENTATION STRATEGY

Do not implement the entire feature in one uncontrolled development operation.

First perform an architectural and pedagogical audit.

Produce:

- Existing architecture analysis.
- Existing data model analysis.
- Integration points.
- Proposed data model.
- Pedagogical calculation methodology.
- UI/UX integration plan.
- Implementation phases.
- Migration strategy.
- Testing strategy.

Then implement incrementally.

Suggested phases:

PHASE 1 — Bloom taxonomy and question classification.

PHASE 2 — Learning objectives and competency mapping.

PHASE 3 — Student learning evidence and cognitive profiles.

PHASE 4 — Mastery calculation and learning analytics.

PHASE 5 — Differentiated learning pathways.

PHASE 6 — Personalized assignments and resource recommendations.

PHASE 7 — Teacher dashboard and detailed student analytics.

PHASE 8 — Adaptive reassessment and continuous progression.

PHASE 9 — Optional AI-assisted pedagogical recommendations.

For every phase:

- Preserve existing functionality.
- Implement backend and frontend consistently.
- Add database migrations where required.
- Add validation and authorization.
- Test existing question and examination workflows.
- Add automated tests.
- Update project documentation.
- Commit changes in small, understandable units.

Do not replace existing functionality simply to implement this feature.

Do not introduce mock student data or fake performance metrics into production.

## 17. ACCEPTANCE CRITERIA

The implementation is complete only when the following scenarios work:

SCENARIO 1:
A teacher creates a Mathematics question and classifies it as Apply, with its topic, learning objective, and difficulty.

SCENARIO 2:
A teacher creates an assessment containing questions from all six Bloom dimensions.

SCENARIO 3:
After students complete the assessment, the application produces individual cognitive and competency profiles based on their actual answers and available evidence.

SCENARIO 4:
The teacher discovers that some students understand fractions but cannot apply the rules, while others struggle with the basic concept itself.

SCENARIO 5:
The application recommends different courses, exercises, games, and assessments for these students.

SCENARIO 6:
The teacher validates and assigns different learning pathways without creating separate classes or separate versions of the entire course.

SCENARIO 7:
As students complete activities and new assessments, their mastery profiles are updated using new evidence.

SCENARIO 8:
A student can progress from Foundation to Developing or Proficient in one competency without automatically changing their level in unrelated subjects.

SCENARIO 9:
The teacher can identify whether a personalized intervention actually improved student performance.

SCENARIO 10:
All features work with the existing student, teacher, administrator, course, question, examination, and educational game systems.

FINAL EXPECTATION:

The result must be an integrated adaptive learning ecosystem.

The application should move from simply asking:

"Did the student get the answer right?"

To answering:

"What does this student actually know? What can they understand and do? Where are their learning gaps? What should they learn next? Which activities will help them progress? And how can the teacher verify that learning has taken place?"

Build this as a pedagogically coherent, measurable, explainable, and teacher-controlled system.
gg
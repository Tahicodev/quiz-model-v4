# NEXT TASK: DESIGN THE COMPLETE ADAPTIVE LEARNING ARCHITECTURE

Based on your completed audit, I now want you to design the technical and pedagogical architecture required to transform the existing Quiz App into a complete Adaptive Learning Platform.

IMPORTANT: This task is ARCHITECTURE DESIGN ONLY.

Do not implement features, modify existing files, or create database migrations yet.

## 1. Core architectural principle

The objective is to connect all existing educational components through a unified pedagogical model.

The architecture must support:

- Revised Bloom's Taxonomy.
- Learning objectives.
- Skills and competencies.
- Student learning evidence.
- Competency mastery tracking.
- Individual cognitive profiles.
- Dynamic learning levels.
- Differentiated learning pathways.
- Personalized courses, exercises, games and activities.
- Personalized assessments.
- Adaptive recommendations.
- Continuous learning progression.

## 2. Design the pedagogical data model

Design the relationships between:

- School.
- Subject.
- Course.
- Chapter/topic.
- LearningObjective.
- Competency/Skill.
- BloomDimension.
- Question.
- QuestionAssessmentCriterion.
- Student.
- Assessment.
- StudentLearningEvidence.
- StudentSkillMastery.
- StudentCognitiveProfile.
- LearningPathway.
- LearningPathwayItem.
- LearningAssignment.
- LearningIntervention.
- LearningResourceMapping.

These are conceptual entities. Adapt their final names and structure to the existing Prisma architecture.

Explain which entities should be new and which existing entities should be extended.

Avoid unnecessary duplication and preserve database normalization.

## 3. Design the learning evidence model

This is particularly important.

The system must collect learning evidence from different educational activities:

- Questions answered.
- Exams completed.
- Exercises completed.
- Educational games played.
- Interactive activities completed.
- Teacher-assessed assignments.

Define a unified model for recording this evidence.

Every evidence record should preserve:

- Student.
- Source activity.
- Question or activity where applicable.
- Learning objective.
- Competency.
- Bloom dimension.
- Difficulty.
- Score and maximum score.
- Success or failure.
- Timestamp.
- Assessment method.
- Source type.

Not every activity will provide all these fields. Explain how to handle missing or unavailable metadata without inventing evidence.

Preserve the original result records and establish traceability between original results and derived learning evidence.

Avoid double-counting the same performance when an exam result and its question-level results are both available.

## 4. Design the mastery calculation methodology

Propose a transparent, deterministic and reproducible method to calculate:

- Competency mastery.
- Topic mastery.
- Course mastery.
- Subject mastery.
- Bloom cognitive performance.
- Progression over time.
- Evidence confidence.

Explain:

- How question weights are handled.
- How different assessment types contribute.
- How recent and historical performance are combined.
- How insufficient evidence is handled.
- How teacher assessments and rubrics contribute.
- How repeated attempts are treated.
- How prerequisites influence recommendations.

Do not confuse a Bloom performance percentage with actual competency mastery.

Do not claim to measure cognitive abilities or learning styles that cannot be established from the available evidence.

## 5. Design the differentiated learning pathway system

The architecture must support one teacher, one class, one common course, and multiple individual learning pathways.

A student may have:

- A remedial pathway for one competency.
- A normal practice pathway for another.
- An advanced pathway for a third.

Explain how students can receive individual or group assignments without requiring the creation of separate classes.

Inspect existing CourseClass and ExamClass relationships and propose backward-compatible extensions.

## 6. Design the adaptive recommendation engine

Define how the engine will:

1. Detect learning gaps.
2. Identify missing prerequisites.
3. Determine the appropriate support level.
4. Find matching existing courses, exercises, questions, games and activities.
5. Recommend new content only when appropriate.
6. Define success criteria.
7. Recommend reassessment.
8. Update the student's pathway after new evidence.

Keep deterministic educational rules separate from optional AI-generated recommendations.

The teacher must remain in control of educational decisions.

## 7. Define integration with existing features

Explicitly explain how the architecture will integrate with:

- Existing question types and question management.
- Existing difficulty classification.
- Existing exams and results.
- Existing courses and exercises.
- Existing educational games.
- Math Quest and its progression system.
- Existing student workspace.
- Existing teacher Overview and analytics.
- Existing AI generation services.
- Existing SaaS backend and Prisma repositories.

Preserve all existing functionality.

## 8. Produce the technical deliverables

I expect:

A. Current architecture and integration-point analysis.

B. Proposed pedagogical architecture diagram.

C. Proposed ER diagram showing relationships and cardinalities.

D. Proposed Prisma schema changes, presented as a design proposal only.

E. Detailed mastery calculation methodology with numerical examples.

F. Learning pathway lifecycle and recommendation flow diagrams.

G. Backend service and repository architecture.

H. API endpoint proposal.

I. Teacher and student interface integration proposal.

J. Database migration and backward-compatibility strategy.

K. Testing and validation strategy.

L. Phased implementation roadmap with dependencies and acceptance criteria.

## 9. Critical constraints

- Do not rebuild existing features.
- Do not introduce duplicate course, exam, question or game systems.
- Do not replace existing difficulty classification.
- Do not use LocalStorage as the source of truth.
- Do not introduce fake student evidence.
- Do not assign permanent global learning levels.
- Do not make Bloom classification equivalent to difficulty.
- Do not treat automatic MCQ results as sufficient evidence for evaluating creative or advanced reasoning skills.
- Do not implement AI as the authority for student mastery.
- Preserve existing SaaS security, school isolation, authorization and data integrity.

## FINAL DELIVERABLE

Produce an architecture document that can serve as the technical and pedagogical blueprint for all subsequent development phases.

The architecture must be designed for the COMPLETE adaptive learning vision, even though implementation will be incremental.

Wait for my approval before writing implementation code.

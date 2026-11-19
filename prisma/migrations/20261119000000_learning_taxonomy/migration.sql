-- Phase 1 / WP1: learning taxonomy and question pedagogy.
-- Additive only: six new tables, five nullable/defaulted Question columns and
-- two Question indexes. No evidence, mastery, pathway or AI-suggestion tables.
-- The Question table is rebuilt only because SQLite cannot attach a new foreign
-- key (primary_bloom_dimension_id) with ALTER TABLE; all existing rows/columns
-- are copied unchanged.
-- CreateTable
CREATE TABLE "BloomDimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labels_json" TEXT NOT NULL,
    "description" TEXT,
    "verbs_json" TEXT,
    "examples_json" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "category_id" TEXT,
    "parent_id" TEXT,
    "primary_bloom_dimension_id" TEXT,
    "code" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "proposed_by" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" DATETIME,
    "review_note" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "LearningObjective_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningObjective_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningObjective_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearningObjective_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "LearningObjective" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LearningObjective_primary_bloom_dimension_id_fkey" FOREIGN KEY ("primary_bloom_dimension_id") REFERENCES "BloomDimension" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "parent_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'competency',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Competency_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Competency_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Competency_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Competency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningObjectiveCompetency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "objective_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningObjectiveCompetency_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningObjectiveCompetency_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "LearningObjective" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningObjectiveCompetency_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "Competency" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningPrerequisite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "objective_id" TEXT NOT NULL,
    "prerequisite_objective_id" TEXT NOT NULL,
    "strength" TEXT NOT NULL DEFAULT 'required',
    "min_mastery_state" TEXT NOT NULL DEFAULT 'developing',
    "rationale" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningPrerequisite_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningPrerequisite_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "LearningObjective" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningPrerequisite_prerequisite_objective_id_fkey" FOREIGN KEY ("prerequisite_objective_id") REFERENCES "LearningObjective" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionAssessmentCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "objective_id" TEXT NOT NULL,
    "competency_id" TEXT,
    "bloom_dimension_id" TEXT NOT NULL,
    "criterion_key" TEXT NOT NULL DEFAULT 'main',
    "weight" REAL NOT NULL DEFAULT 1,
    "max_score" REAL,
    "rubric_json" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "review_status" TEXT NOT NULL DEFAULT 'approved',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "QuestionAssessmentCriterion_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAssessmentCriterion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAssessmentCriterion_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "LearningObjective" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuestionAssessmentCriterion_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "Competency" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QuestionAssessmentCriterion_bloom_dimension_id_fkey" FOREIGN KEY ("bloom_dimension_id") REFERENCES "BloomDimension" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "category_id" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options_json" TEXT,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "time_limit" INTEGER,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT,
    "media_url" TEXT,
    "created_by" TEXT,
    "pedagogy_status" TEXT NOT NULL DEFAULT 'unclassified',
    "primary_bloom_dimension_id" TEXT,
    "pedagogy_reviewed_at" DATETIME,
    "pedagogy_reviewed_by" TEXT,
    "pedagogy_source" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Question_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Question_primary_bloom_dimension_id_fkey" FOREIGN KEY ("primary_bloom_dimension_id") REFERENCES "BloomDimension" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "category_id", "created_at", "created_by", "difficulty", "explanation", "id", "media_url", "options_json", "points", "school_id", "tags", "text", "time_limit", "type", "updated_at") SELECT "answer", "category_id", "created_at", "created_by", "difficulty", "explanation", "id", "media_url", "options_json", "points", "school_id", "tags", "text", "time_limit", "type", "updated_at" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_school_id_idx" ON "Question"("school_id");
CREATE INDEX "Question_category_id_idx" ON "Question"("category_id");
CREATE INDEX "Question_type_idx" ON "Question"("type");
CREATE INDEX "Question_difficulty_idx" ON "Question"("difficulty");
CREATE INDEX "Question_created_by_idx" ON "Question"("created_by");
CREATE INDEX "Question_primary_bloom_dimension_id_idx" ON "Question"("primary_bloom_dimension_id");
CREATE INDEX "Question_school_id_pedagogy_status_idx" ON "Question"("school_id", "pedagogy_status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BloomDimension_key_key" ON "BloomDimension"("key");

-- CreateIndex
CREATE INDEX "BloomDimension_order_index_idx" ON "BloomDimension"("order_index");

-- CreateIndex
CREATE INDEX "LearningObjective_school_id_subject_id_status_idx" ON "LearningObjective"("school_id", "subject_id", "status");

-- CreateIndex
CREATE INDEX "LearningObjective_school_id_category_id_idx" ON "LearningObjective"("school_id", "category_id");

-- CreateIndex
CREATE INDEX "LearningObjective_school_id_parent_id_idx" ON "LearningObjective"("school_id", "parent_id");

-- CreateIndex
CREATE INDEX "LearningObjective_school_id_status_idx" ON "LearningObjective"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjective_school_id_subject_id_code_key" ON "LearningObjective"("school_id", "subject_id", "code");

-- CreateIndex
CREATE INDEX "Competency_school_id_subject_id_status_idx" ON "Competency"("school_id", "subject_id", "status");

-- CreateIndex
CREATE INDEX "Competency_school_id_parent_id_idx" ON "Competency"("school_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_school_id_code_key" ON "Competency"("school_id", "code");

-- CreateIndex
CREATE INDEX "LearningObjectiveCompetency_school_id_competency_id_idx" ON "LearningObjectiveCompetency"("school_id", "competency_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjectiveCompetency_objective_id_competency_id_key" ON "LearningObjectiveCompetency"("objective_id", "competency_id");

-- CreateIndex
CREATE INDEX "LearningPrerequisite_school_id_prerequisite_objective_id_idx" ON "LearningPrerequisite"("school_id", "prerequisite_objective_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPrerequisite_objective_id_prerequisite_objective_id_key" ON "LearningPrerequisite"("objective_id", "prerequisite_objective_id");

-- CreateIndex
CREATE INDEX "QuestionAssessmentCriterion_school_id_objective_id_bloom_dimension_id_idx" ON "QuestionAssessmentCriterion"("school_id", "objective_id", "bloom_dimension_id");

-- CreateIndex
CREATE INDEX "QuestionAssessmentCriterion_question_id_idx" ON "QuestionAssessmentCriterion"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAssessmentCriterion_question_id_objective_id_bloom_dimension_id_criterion_key_key" ON "QuestionAssessmentCriterion"("question_id", "objective_id", "bloom_dimension_id", "criterion_key");


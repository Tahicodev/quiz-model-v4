-- CreateTable
CREATE TABLE "KidsActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "sub_topic" TEXT,
    "grade" TEXT NOT NULL,
    "age_min" INTEGER NOT NULL DEFAULT 5,
    "age_max" INTEGER NOT NULL DEFAULT 12,
    "objective" TEXT,
    "game_template" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'jungle',
    "difficulty" TEXT NOT NULL DEFAULT 'easy',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "join_code" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "settings_json" TEXT,
    "rewards_json" TEXT,
    "progression_json" TEXT,
    "estimated_duration" INTEGER,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KidsActivity_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsActivity_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KidsActivityLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activity_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "level_type" TEXT NOT NULL,
    "content_json" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 10,
    "hint" TEXT,
    "explanation" TEXT,
    "media_url" TEXT,
    "narrative_json" TEXT,
    CONSTRAINT "KidsActivityLevel_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "KidsActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KidsGameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "total_possible" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 0,
    "answers_json" TEXT NOT NULL DEFAULT '[]',
    "stars" INTEGER NOT NULL DEFAULT 0,
    "badges_json" TEXT NOT NULL DEFAULT '[]',
    "streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "difficulty_level" TEXT NOT NULL DEFAULT 'easy',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "time_spent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "KidsGameSession_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "KidsActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsGameSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsGameSession_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KidsGameTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "interaction_type" TEXT NOT NULL,
    "supported_ages_json" TEXT NOT NULL,
    "supported_subjects" TEXT NOT NULL,
    "cognitive_skills" TEXT NOT NULL,
    "pedagogical_goals" TEXT NOT NULL,
    "question_types" TEXT NOT NULL,
    "difficulty_range" TEXT NOT NULL,
    "requires_images" BOOLEAN NOT NULL DEFAULT false,
    "requires_audio" BOOLEAN NOT NULL DEFAULT false,
    "min_items" INTEGER NOT NULL DEFAULT 2,
    "max_items" INTEGER NOT NULL DEFAULT 50,
    "estimated_duration" INTEGER NOT NULL DEFAULT 5,
    "config_schema_json" TEXT,
    "phase" INTEGER NOT NULL DEFAULT 1
);

-- CreateIndex
CREATE UNIQUE INDEX "KidsActivity_join_code_key" ON "KidsActivity"("join_code");

-- CreateIndex
CREATE INDEX "KidsActivity_school_id_idx" ON "KidsActivity"("school_id");

-- CreateIndex
CREATE INDEX "KidsActivity_creator_id_idx" ON "KidsActivity"("creator_id");

-- CreateIndex
CREATE INDEX "KidsActivity_status_idx" ON "KidsActivity"("status");

-- CreateIndex
CREATE INDEX "KidsActivity_join_code_idx" ON "KidsActivity"("join_code");

-- CreateIndex
CREATE INDEX "KidsActivity_game_template_idx" ON "KidsActivity"("game_template");

-- CreateIndex
CREATE INDEX "KidsActivity_subject_idx" ON "KidsActivity"("subject");

-- CreateIndex
CREATE INDEX "KidsActivityLevel_activity_id_idx" ON "KidsActivityLevel"("activity_id");

-- CreateIndex
CREATE INDEX "KidsGameSession_activity_id_idx" ON "KidsGameSession"("activity_id");

-- CreateIndex
CREATE INDEX "KidsGameSession_user_id_idx" ON "KidsGameSession"("user_id");

-- CreateIndex
CREATE INDEX "KidsGameSession_school_id_idx" ON "KidsGameSession"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "KidsGameSession_activity_id_user_id_key" ON "KidsGameSession"("activity_id", "user_id");

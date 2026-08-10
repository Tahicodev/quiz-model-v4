-- CreateTable
CREATE TABLE "ProfileRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "changes_json" TEXT NOT NULL,
    "avatar" TEXT,
    "note" TEXT,
    "snapshot_json" TEXT,
    "reviewer_id" TEXT,
    "review_note" TEXT,
    "reviewed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ProfileRequest_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileRequest_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "student_number" TEXT NOT NULL,
    "class_id" TEXT,
    "class_name" TEXT,
    "password_hash" TEXT NOT NULL,
    "note" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" DATETIME,
    "review_note" TEXT,
    "created_user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AccountRequest_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountRequest_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountRequest_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountRequest_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GamePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "game_mode" TEXT NOT NULL,
    "rules_json" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "GamePreset_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data_json" TEXT,
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GamificationConfig" (
    "school_id" TEXT NOT NULL PRIMARY KEY,
    "exp_per_correct" INTEGER NOT NULL DEFAULT 10,
    "exp_per_win" INTEGER NOT NULL DEFAULT 100,
    "auto_award_badges" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "GamificationConfig_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "class_id" TEXT,
    "class_name" TEXT,
    "teacher_id" TEXT,
    "teacher_name" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherMessage_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherMessage_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeacherMessage_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "class_id" TEXT,
    "teacher_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "TeacherAssignment_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER,
    "passing_score" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "is_training" BOOLEAN NOT NULL DEFAULT false,
    "randomize" BOOLEAN NOT NULL DEFAULT false,
    "max_attempts" INTEGER,
    "options_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Exam_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exam_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("created_at", "creator_id", "description", "duration", "id", "is_training", "max_attempts", "name", "passing_score", "randomize", "school_id", "status", "updated_at") SELECT "created_at", "creator_id", "description", "duration", "id", "is_training", "max_attempts", "name", "passing_score", "randomize", "school_id", "status", "updated_at" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
CREATE INDEX "Exam_school_id_idx" ON "Exam"("school_id");
CREATE INDEX "Exam_status_idx" ON "Exam"("status");
CREATE INDEX "Exam_creator_id_idx" ON "Exam"("creator_id");
CREATE TABLE "new_ExamSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "answers_json" TEXT NOT NULL DEFAULT '{}',
    "current_question_index" INTEGER NOT NULL DEFAULT 0,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "last_heartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "ExamSession_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamSession_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExamSession" ("answers_json", "completed_at", "current_question_index", "exam_id", "expires_at", "id", "last_heartbeat", "school_id", "started_at", "status", "user_id") SELECT "answers_json", "completed_at", "current_question_index", "exam_id", "expires_at", "id", "last_heartbeat", "school_id", "started_at", "status", "user_id" FROM "ExamSession";
DROP TABLE "ExamSession";
ALTER TABLE "new_ExamSession" RENAME TO "ExamSession";
CREATE INDEX "ExamSession_school_id_idx" ON "ExamSession"("school_id");
CREATE INDEX "ExamSession_status_idx" ON "ExamSession"("status");
CREATE INDEX "ExamSession_expires_at_idx" ON "ExamSession"("expires_at");
CREATE UNIQUE INDEX "ExamSession_exam_id_user_id_key" ON "ExamSession"("exam_id", "user_id");
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "settings_json" TEXT,
    "join_code" TEXT,
    "question_ids" TEXT NOT NULL DEFAULT '[]',
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Game_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Game_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("created_at", "creator_id", "ended_at", "id", "join_code", "name", "question_ids", "school_id", "settings_json", "started_at", "status", "type", "updated_at") SELECT "created_at", "creator_id", "ended_at", "id", "join_code", "name", "question_ids", "school_id", "settings_json", "started_at", "status", "type", "updated_at" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE UNIQUE INDEX "Game_join_code_key" ON "Game"("join_code");
CREATE INDEX "Game_school_id_idx" ON "Game"("school_id");
CREATE INDEX "Game_status_idx" ON "Game"("status");
CREATE INDEX "Game_join_code_idx" ON "Game"("join_code");
CREATE INDEX "Game_creator_id_idx" ON "Game"("creator_id");
CREATE TABLE "new_GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "answers_json" TEXT NOT NULL DEFAULT '{}',
    "rank" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "GameSession_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameSession_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameSession" ("answers_json", "completed", "completed_at", "connected", "game_id", "id", "joined_at", "rank", "school_id", "score", "user_id") SELECT "answers_json", "completed", "completed_at", "connected", "game_id", "id", "joined_at", "rank", "school_id", "score", "user_id" FROM "GameSession";
DROP TABLE "GameSession";
ALTER TABLE "new_GameSession" RENAME TO "GameSession";
CREATE INDEX "GameSession_game_id_idx" ON "GameSession"("game_id");
CREATE INDEX "GameSession_user_id_idx" ON "GameSession"("user_id");
CREATE INDEX "GameSession_school_id_idx" ON "GameSession"("school_id");
CREATE UNIQUE INDEX "GameSession_game_id_user_id_key" ON "GameSession"("game_id", "user_id");
CREATE TABLE "new_Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "exam_id" TEXT,
    "user_id" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "total_points" INTEGER NOT NULL,
    "earned_points" INTEGER NOT NULL,
    "time_spent" INTEGER,
    "answers_json" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'exam',
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "date_taken" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Result_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Result" ("answers_json", "attempt_number", "date_taken", "earned_points", "exam_id", "id", "mode", "passed", "school_id", "score", "time_spent", "total_points", "user_id") SELECT "answers_json", "attempt_number", "date_taken", "earned_points", "exam_id", "id", "mode", "passed", "school_id", "score", "time_spent", "total_points", "user_id" FROM "Result";
DROP TABLE "Result";
ALTER TABLE "new_Result" RENAME TO "Result";
CREATE INDEX "Result_school_id_idx" ON "Result"("school_id");
CREATE INDEX "Result_user_id_idx" ON "Result"("user_id");
CREATE INDEX "Result_exam_id_idx" ON "Result"("exam_id");
CREATE INDEX "Result_date_taken_idx" ON "Result"("date_taken");
CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settings_json" TEXT,
    "starts_at" DATETIME,
    "ends_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Tournament_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tournament_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("created_at", "creator_id", "description", "ends_at", "id", "name", "school_id", "settings_json", "starts_at", "status", "updated_at") SELECT "created_at", "creator_id", "description", "ends_at", "id", "name", "school_id", "settings_json", "starts_at", "status", "updated_at" FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";
CREATE INDEX "Tournament_school_id_idx" ON "Tournament"("school_id");
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Tournament_creator_id_idx" ON "Tournament"("creator_id");
CREATE TABLE "new_TournamentEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "registered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "TournamentEntry_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentEntry_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TournamentEntry" ("completed", "completed_at", "id", "rank", "registered_at", "school_id", "score", "tournament_id", "user_id") SELECT "completed", "completed_at", "id", "rank", "registered_at", "school_id", "score", "tournament_id", "user_id" FROM "TournamentEntry";
DROP TABLE "TournamentEntry";
ALTER TABLE "new_TournamentEntry" RENAME TO "TournamentEntry";
CREATE INDEX "TournamentEntry_tournament_id_idx" ON "TournamentEntry"("tournament_id");
CREATE INDEX "TournamentEntry_user_id_idx" ON "TournamentEntry"("user_id");
CREATE INDEX "TournamentEntry_school_id_idx" ON "TournamentEntry"("school_id");
CREATE UNIQUE INDEX "TournamentEntry_tournament_id_user_id_key" ON "TournamentEntry"("tournament_id", "user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProfileRequest_school_id_status_idx" ON "ProfileRequest"("school_id", "status");

-- CreateIndex
CREATE INDEX "ProfileRequest_user_id_idx" ON "ProfileRequest"("user_id");

-- CreateIndex
CREATE INDEX "AccountRequest_school_id_status_idx" ON "AccountRequest"("school_id", "status");

-- CreateIndex
CREATE INDEX "AccountRequest_class_id_idx" ON "AccountRequest"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "AccountRequest_school_id_username_key" ON "AccountRequest"("school_id", "username");

-- CreateIndex
CREATE INDEX "GamePreset_school_id_is_default_idx" ON "GamePreset"("school_id", "is_default");

-- CreateIndex
CREATE INDEX "Notification_school_id_read_at_idx" ON "Notification"("school_id", "read_at");

-- CreateIndex
CREATE INDEX "Notification_school_id_created_at_idx" ON "Notification"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "TeacherMessage_school_id_class_id_date_idx" ON "TeacherMessage"("school_id", "class_id", "date");

-- CreateIndex
CREATE INDEX "TeacherAssignment_school_id_class_id_due_date_idx" ON "TeacherAssignment"("school_id", "class_id", "due_date");


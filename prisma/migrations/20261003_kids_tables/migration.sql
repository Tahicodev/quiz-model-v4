-- Repair schema drift (again): the Kids* models existed in schema.prisma and
-- in the dev database (added out-of-band with `prisma db push`) but were never
-- captured as a migration. A fresh environment therefore failed at
-- 20261004_kids_attribution with "no such table: KidsGame" (P3018).
--
-- This migration recreates the Kids* tables in the exact state the later Kids
-- migrations expect:
--   * KidsGame        — without category_id (20261004 adds it)
--   * KidsGameSession — without user_id/school_id/tournament_id (20261005 adds them)
--   * KidsChampionship / KidsChampionshipScore — never altered afterwards
-- IF NOT EXISTS keeps it a no-op on the live dev DB where the tables already
-- exist, so `prisma migrate deploy` is safe on both fresh and existing data.

-- CreateTable
CREATE TABLE IF NOT EXISTS "KidsGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game_type" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'jungle',
    "grade" TEXT,
    "subject" TEXT,
    "questions_json" TEXT NOT NULL DEFAULT '[]',
    "config_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pin" TEXT,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KidsGame_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsGame_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KidsGame_pin_key" ON "KidsGame"("pin");
CREATE INDEX IF NOT EXISTS "KidsGame_school_id_idx" ON "KidsGame"("school_id");
CREATE INDEX IF NOT EXISTS "KidsGame_teacher_id_idx" ON "KidsGame"("teacher_id");
CREATE INDEX IF NOT EXISTS "KidsGame_game_type_idx" ON "KidsGame"("game_type");
CREATE INDEX IF NOT EXISTS "KidsGame_grade_idx" ON "KidsGame"("grade");
CREATE INDEX IF NOT EXISTS "KidsGame_status_idx" ON "KidsGame"("status");
CREATE INDEX IF NOT EXISTS "KidsGame_pin_idx" ON "KidsGame"("pin");

-- CreateTable
CREATE TABLE IF NOT EXISTS "KidsGameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "avatar" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "answers_json" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KidsGameSession_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "KidsGame" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KidsGameSession_game_id_idx" ON "KidsGameSession"("game_id");
CREATE INDEX IF NOT EXISTS "KidsGameSession_created_at_idx" ON "KidsGameSession"("created_at");

-- CreateTable
CREATE TABLE IF NOT EXISTS "KidsChampionship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🏆',
    "description" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "game_ids" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KidsChampionship_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsChampionship_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KidsChampionship_code_key" ON "KidsChampionship"("code");
CREATE INDEX IF NOT EXISTS "KidsChampionship_school_id_status_idx" ON "KidsChampionship"("school_id", "status");
CREATE INDEX IF NOT EXISTS "KidsChampionship_status_idx" ON "KidsChampionship"("status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "KidsChampionshipScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "championship_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "avatar" TEXT,
    "game_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT,
    "played_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KidsChampionshipScore_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "KidsChampionship" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KidsChampionshipScore_championship_id_player_name_game_id_key" ON "KidsChampionshipScore"("championship_id", "player_name", "game_id");
CREATE INDEX IF NOT EXISTS "KidsChampionshipScore_championship_id_idx" ON "KidsChampionshipScore"("championship_id");
CREATE INDEX IF NOT EXISTS "KidsChampionshipScore_school_id_idx" ON "KidsChampionshipScore"("school_id");
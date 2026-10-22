-- AddOn: Math Quest per-level progress (kid_quest_progress stage 2).
-- Minimal additive migration ? creates KidQuestProgress only. Any other
-- shadow-db drift is pre-existing (see 20260923_repair_schema_drift) and is
-- deliberately left untouched here.

-- CreateTable
CREATE TABLE "KidQuestProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "best_stars" INTEGER NOT NULL DEFAULT 0,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KidQuestProgress_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "KidsGame" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidQuestProgress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KidQuestProgress_school_id_idx" ON "KidQuestProgress"("school_id");
CREATE INDEX "KidQuestProgress_user_id_idx" ON "KidQuestProgress"("user_id");
CREATE INDEX "KidQuestProgress_game_id_idx" ON "KidQuestProgress"("game_id");
CREATE UNIQUE INDEX "KidQuestProgress_game_id_user_id_level_id_key" ON "KidQuestProgress"("game_id", "user_id", "level_id");


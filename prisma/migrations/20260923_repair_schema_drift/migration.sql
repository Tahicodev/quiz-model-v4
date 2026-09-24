-- Repair pre-existing schema drift (schema.prisma had these but no migration):
--   * TournamentHistory table (used by TournamentService / legacy history sync)
--   * User.gamification_json column (used by bootstrap.routes / bulk.routes)
-- Fresh installs and test databases apply this normally. The live dev DB
-- already has both (added via `prisma db push` earlier) and is marked applied
-- via `prisma migrate resolve --applied 20260923_repair_schema_drift`.

-- CreateTable
CREATE TABLE "TournamentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ended_at" DATETIME,
    "winners_json" TEXT,
    "payload_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentHistory_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TournamentHistory_school_id_idx" ON "TournamentHistory"("school_id");
CREATE INDEX "TournamentHistory_ended_at_idx" ON "TournamentHistory"("ended_at");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "gamification_json" TEXT;
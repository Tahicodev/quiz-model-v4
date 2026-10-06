-- Kids games join student sessions: link sessions to users/schools/
-- tournaments, link tournaments to a kids game, and allow anonymous
-- results (Result.user_id nullable — identity travels in answers_json).
-- All added columns are nullable, so existing rows are untouched.

-- KidsGameSession identity + tenant + tournament links
ALTER TABLE "KidsGameSession" ADD COLUMN "user_id" TEXT;
ALTER TABLE "KidsGameSession" ADD COLUMN "school_id" TEXT;
ALTER TABLE "KidsGameSession" ADD COLUMN "tournament_id" TEXT;

-- CreateIndex
CREATE INDEX "KidsGameSession_user_id_idx" ON "KidsGameSession"("user_id");
CREATE INDEX "KidsGameSession_school_id_idx" ON "KidsGameSession"("school_id");
CREATE INDEX "KidsGameSession_tournament_id_idx" ON "KidsGameSession"("tournament_id");

-- Tournament → kids game link (primaire tournaments played in the kid player)
ALTER TABLE "Tournament" ADD COLUMN "kids_game_id" TEXT;

-- CreateIndex
CREATE INDEX "Tournament_kids_game_id_idx" ON "Tournament"("kids_game_id");

-- Redefine Result with a nullable user_id (SQLite: rebuild + copy).
-- Anonymous kids-game plays record player identity in answers_json context.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "exam_id" TEXT,
    "user_id" TEXT,
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
PRAGMA foreign_keys=ON;

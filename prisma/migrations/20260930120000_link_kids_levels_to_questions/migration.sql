-- Link a Game Studio level to the shared question bank.
--
-- Game Studio stores generated levels as real Question rows (grouped in a
-- Category) and points the activity level at them via question_id. The level
-- keeps its own copy of content_json so an existing activity still plays if the
-- bank question is later edited or deleted:
--   - ON DELETE SET NULL  -> deleting a question never deletes a level.
--   - The column is optional, so every pre-existing level stays valid.
ALTER TABLE "KidsActivityLevel" ADD COLUMN "question_id" TEXT REFERENCES "Question" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "KidsActivityLevel_question_id_idx" ON "KidsActivityLevel"("question_id");

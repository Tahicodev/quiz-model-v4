-- Teacher attribution for bank content + kids-game bank sync target.
-- All columns are nullable so existing rows keep working untouched
-- (NULL created_by = legacy shared row, visible to every teacher).
ALTER TABLE "Category" ADD COLUMN "created_by" TEXT;
ALTER TABLE "Question" ADD COLUMN "created_by" TEXT;
ALTER TABLE "KidsGame" ADD COLUMN "category_id" TEXT;

-- CreateIndex
CREATE INDEX "Category_created_by_idx" ON "Category"("created_by");
CREATE INDEX "Question_created_by_idx" ON "Question"("created_by");

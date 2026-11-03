ALTER TABLE "Lesson"
ADD COLUMN "parent_lesson_id" TEXT
REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lesson_parent_lesson_id_idx" ON "Lesson"("parent_lesson_id");

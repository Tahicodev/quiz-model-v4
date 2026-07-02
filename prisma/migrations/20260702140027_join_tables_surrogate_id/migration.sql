/*
  Warnings:

  - The primary key for the `ExamClass` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ExamQuestion` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `id` was added to the `ExamClass` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `id` was added to the `ExamQuestion` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExamClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exam_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamClass_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamClass_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExamClass" ("assigned_at", "class_id", "exam_id") SELECT "assigned_at", "class_id", "exam_id" FROM "ExamClass";
DROP TABLE "ExamClass";
ALTER TABLE "new_ExamClass" RENAME TO "ExamClass";
CREATE INDEX "ExamClass_exam_id_idx" ON "ExamClass"("exam_id");
CREATE INDEX "ExamClass_class_id_idx" ON "ExamClass"("class_id");
CREATE UNIQUE INDEX "ExamClass_exam_id_class_id_key" ON "ExamClass"("exam_id", "class_id");
CREATE TABLE "new_ExamQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exam_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "points_override" INTEGER,
    CONSTRAINT "ExamQuestion_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExamQuestion" ("exam_id", "order_index", "points_override", "question_id") SELECT "exam_id", "order_index", "points_override", "question_id" FROM "ExamQuestion";
DROP TABLE "ExamQuestion";
ALTER TABLE "new_ExamQuestion" RENAME TO "ExamQuestion";
CREATE INDEX "ExamQuestion_exam_id_idx" ON "ExamQuestion"("exam_id");
CREATE INDEX "ExamQuestion_question_id_idx" ON "ExamQuestion"("question_id");
CREATE UNIQUE INDEX "ExamQuestion_exam_id_question_id_key" ON "ExamQuestion"("exam_id", "question_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

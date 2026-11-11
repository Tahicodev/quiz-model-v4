-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "exercise" TEXT;

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "course_id" TEXT,
    "lesson_id" TEXT,
    "exam_id" TEXT,
    "format" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "rel_path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "meta_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "GeneratedDocument_school_id_idx" ON "GeneratedDocument"("school_id");

-- CreateIndex
CREATE INDEX "GeneratedDocument_course_id_idx" ON "GeneratedDocument"("course_id");

-- CreateIndex
CREATE INDEX "GeneratedDocument_kind_idx" ON "GeneratedDocument"("kind");

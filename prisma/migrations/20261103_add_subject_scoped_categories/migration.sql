CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Subject_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subject_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Subject_school_id_created_by_name_key" ON "Subject"("school_id", "created_by", "name");
CREATE INDEX "Subject_school_id_idx" ON "Subject"("school_id");
CREATE INDEX "Subject_created_by_idx" ON "Subject"("created_by");

ALTER TABLE "Category" ADD COLUMN "subject_id" TEXT REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Course" ADD COLUMN "subject_id" TEXT REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "Category_school_id_name_key";
CREATE UNIQUE INDEX "Category_school_id_subject_id_parent_id_name_key" ON "Category"("school_id", "subject_id", "parent_id", "name");
CREATE INDEX "Category_subject_id_idx" ON "Category"("subject_id");
CREATE INDEX "Course_subject_id_idx" ON "Course"("subject_id");

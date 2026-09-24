-- AlterTable
-- School year label (e.g. "2025-2026") added to the school profile.
ALTER TABLE "School" ADD COLUMN "school_year" TEXT;

-- CreateTable
-- End-of-year archive folders: one row per school + year, holding a full
-- snapshot (data_json) plus a per-store summary (stats_json).
CREATE TABLE "SchoolArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "label" TEXT,
    "data_json" TEXT NOT NULL,
    "stats_json" TEXT,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "SchoolArchive_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolArchive_school_id_year_key" ON "SchoolArchive"("school_id", "year");
CREATE INDEX "SchoolArchive_school_id_idx" ON "SchoolArchive"("school_id");
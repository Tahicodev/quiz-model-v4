-- AlterTable
-- New staff contact columns on User (teachers primarily; safe for students).
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "subjects_json" TEXT;

-- RedefineTables
-- SQLite cannot ADD CONSTRAINT-free columns with defaults inline in all
-- Prisma-generated flows, so the School table is rebuilt here exactly the way
-- `prisma migrate dev` would: create new table with the profile columns,
-- copy rows across, swap names.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "max_students" INTEGER NOT NULL DEFAULT 100,
    "school_type" TEXT NOT NULL DEFAULT 'primaire',
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_School" ("created_at", "id", "max_students", "name", "plan", "slug", "updated_at") SELECT "created_at", "id", "max_students", "name", "plan", "slug", "updated_at" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

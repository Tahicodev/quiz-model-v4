-- Repair schema drift for `User.title` (civility for greetings/display:
-- "Mr" | "Mme"), used by bootstrap.routes and the student workspace profile.
--
-- schema.prisma had the column and the live dev/simulation databases already
-- had it (added via `prisma db push`), but no migration ever created it — so a
-- database built only from `prisma migrate deploy` (integration test DBs) was
-- missing it and every `prisma.user.upsert()` failed with
-- "The column `main.User.title` does not exist".
--
-- The live dev DB already carries the column and is marked applied via
-- `prisma migrate resolve --applied 20261007_user_civility_title`.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "title" TEXT;

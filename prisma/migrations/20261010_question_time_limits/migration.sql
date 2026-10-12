-- Per-question timing.
-- `Question.time_limit` is the default time (seconds) a question should be
-- given; NULL means no per-question limit.
-- `ExamQuestion.time_limit_override` lets an exam override the question's
-- default time for that specific exam, mirroring `points_override`.

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "time_limit" INTEGER;

-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN "time_limit_override" INTEGER;

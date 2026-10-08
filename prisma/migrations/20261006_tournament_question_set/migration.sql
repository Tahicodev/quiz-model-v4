-- Tournaments need the same server-side question set semantics as games:
-- a stored, authoritative list of the question ids they score against, plus
-- per-entry answers so submissions can be validated and made idempotent.
-- Both columns have defaults, so existing rows migrate in place.

-- Tournament question set (JSON array of question ids)
ALTER TABLE "Tournament" ADD COLUMN "question_ids" TEXT NOT NULL DEFAULT '[]';

-- TournamentEntry per-question answers (JSON object keyed by question id)
ALTER TABLE "TournamentEntry" ADD COLUMN "answers_json" TEXT NOT NULL DEFAULT '{}';
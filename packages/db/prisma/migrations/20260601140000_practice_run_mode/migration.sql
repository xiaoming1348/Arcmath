-- 2026-06-01: PracticeRun.mode + PracticeRunMode enum.
--
-- Adds Mock vs Practice mode distinction for real-exam runs. Nullable
-- so legacy PracticeRun rows survive without backfill — downstream
-- (workspace + hint API) treats null as PRACTICE so existing student
-- runs keep their old behavior. Real-exam runs created from today
-- onward must set this via the new chooser modal.
--
-- See `PracticeRun.mode` in schema.prisma for the full semantics.

CREATE TYPE "PracticeRunMode" AS ENUM ('MOCK', 'PRACTICE');

ALTER TABLE "PracticeRun"
    ADD COLUMN "mode" "PracticeRunMode";

-- v2 grading engine: teacher rubric approval state.
-- See GRADING_ENGINE_V2.md §6.

CREATE TYPE "RubricSource" AS ENUM ('AUTHORED', 'AUTO_GENERATED', 'HYBRID_APPROVED');

ALTER TABLE "Problem"
  ADD COLUMN "rubricApprovedAt" TIMESTAMP(3),
  ADD COLUMN "rubricApprovedByUserId" TEXT,
  ADD COLUMN "rubricSource" "RubricSource";

CREATE INDEX "Problem_rubricApprovedAt_idx" ON "Problem"("rubricApprovedAt");

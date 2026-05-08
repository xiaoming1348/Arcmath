-- Pre-processed formalization fields on Problem. See docstring in
-- schema.prisma for the rationale; short version: we call the verifier's
-- /prove once offline per problem and store the typed Lean statement +
-- machine-checked proofs so that student-attempt grading doesn't have to
-- re-autoformalize the same theorem on every request.

-- New enum for the pre-processing outcome.
CREATE TYPE "FormalizedStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW', 'SKIPPED');

ALTER TABLE "Problem"
  ADD COLUMN "formalizedStatement" TEXT,
  ADD COLUMN "formalizedStatus" "FormalizedStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "solutionPaths" JSONB,
  ADD COLUMN "milestoneChecks" JSONB,
  ADD COLUMN "formalizedReason" TEXT,
  ADD COLUMN "formalizedAt" TIMESTAMP(3),
  ADD COLUMN "formalizedVersion" TEXT;

-- Non-proof problems don't need pre-formalization. Flag them as SKIPPED so
-- the pre-processing script can filter by status without re-inspecting
-- answerFormat every time. PROOF rows stay PENDING until the first run.
UPDATE "Problem"
SET "formalizedStatus" = 'SKIPPED'
WHERE "answerFormat" <> 'PROOF';

CREATE INDEX "Problem_formalizedStatus_idx" ON "Problem" ("formalizedStatus");

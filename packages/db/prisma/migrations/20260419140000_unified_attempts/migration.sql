-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AttemptEntryMode" AS ENUM ('ANSWER_ONLY', 'STUCK_WITH_WORK', 'HINT_GUIDED', 'PROOF_STEPS');

-- CreateEnum
CREATE TYPE "AttemptSelfReport" AS ENUM ('SOLVED_CONFIDENT', 'ATTEMPTED_STUCK', 'NO_IDEA');

-- CreateEnum
CREATE TYPE "PracticeRunReviewMode" AS ENUM ('GRADE_ONLY', 'REVIEW_WITH_RETRY');

-- Extend ProblemAttempt with unified-attempt fields
ALTER TABLE "ProblemAttempt"
  ADD COLUMN "status" "AttemptStatus" NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN "entryMode" "AttemptEntryMode",
  ADD COLUMN "selfReport" "AttemptSelfReport",
  ADD COLUMN "hintsUsedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "overallFeedback" TEXT,
  ADD COLUMN "overallPromptVersion" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows are final submissions — record submittedAt retroactively.
UPDATE "ProblemAttempt" SET "submittedAt" = "createdAt" WHERE "submittedAt" IS NULL;

-- Allow submittedAnswer to be null (drafts haven't submitted an answer yet).
ALTER TABLE "ProblemAttempt" ALTER COLUMN "submittedAnswer" DROP NOT NULL;

-- Default isCorrect to false (new default for drafts that won't grade yet).
ALTER TABLE "ProblemAttempt" ALTER COLUMN "isCorrect" SET DEFAULT false;

-- New composite index for looking up active draft attempts per student/problem.
CREATE INDEX "ProblemAttempt_userId_problemId_status_updatedAt_idx"
  ON "ProblemAttempt"("userId", "problemId", "status", "updatedAt");

-- AttemptStep table (replaces ProofStep)
CREATE TABLE "AttemptStep" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "latexInput" TEXT NOT NULL,
    "classifiedStepType" "ProofStepType" NOT NULL DEFAULT 'UNKNOWN',
    "verificationBackend" "ProofVerificationBackend" NOT NULL DEFAULT 'NONE',
    "verdict" "ProofStepVerdict" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION,
    "feedbackText" TEXT,
    "verificationDetails" JSONB,
    "classifierVersion" TEXT,
    "feedbackPromptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttemptStep_attemptId_stepIndex_key" ON "AttemptStep"("attemptId", "stepIndex");
CREATE INDEX "AttemptStep_attemptId_createdAt_idx" ON "AttemptStep"("attemptId", "createdAt");
CREATE INDEX "AttemptStep_userId_createdAt_idx" ON "AttemptStep"("userId", "createdAt");

ALTER TABLE "AttemptStep"
  ADD CONSTRAINT "AttemptStep_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "ProblemAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttemptStep"
  ADD CONSTRAINT "AttemptStep_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any existing ProofAttempt → ProblemAttempt. Preserves ids so step FKs rewrite cleanly.
INSERT INTO "ProblemAttempt" (
  "id", "userId", "problemId", "practiceRunId",
  "submittedAnswer", "normalizedAnswer", "isCorrect", "explanationText",
  "status", "entryMode", "selfReport", "hintsUsedCount",
  "overallFeedback", "overallPromptVersion", "submittedAt",
  "createdAt", "updatedAt"
)
SELECT
  pa."id",
  pa."userId",
  pa."problemId",
  pa."practiceRunId",
  NULL,
  NULL,
  false,
  NULL,
  CASE pa."status"
    WHEN 'ACTIVE' THEN 'DRAFT'::"AttemptStatus"
    WHEN 'SUBMITTED' THEN 'SUBMITTED'::"AttemptStatus"
    WHEN 'ABANDONED' THEN 'ABANDONED'::"AttemptStatus"
  END,
  'PROOF_STEPS'::"AttemptEntryMode",
  NULL,
  0,
  pa."overallFeedback",
  pa."overallPromptVersion",
  pa."submittedAt",
  pa."createdAt",
  pa."updatedAt"
FROM "ProofAttempt" pa
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AttemptStep" (
  "id", "attemptId", "userId", "stepIndex", "latexInput",
  "classifiedStepType", "verificationBackend", "verdict", "confidence",
  "feedbackText", "verificationDetails", "classifierVersion", "feedbackPromptVersion",
  "createdAt", "updatedAt"
)
SELECT
  ps."id",
  ps."attemptId",
  ps."userId",
  ps."stepIndex",
  ps."latexInput",
  ps."classifiedStepType",
  ps."verificationBackend",
  ps."verdict",
  ps."confidence",
  ps."feedbackText",
  ps."verificationDetails",
  ps."classifierVersion",
  ps."feedbackPromptVersion",
  ps."createdAt",
  ps."updatedAt"
FROM "ProofStep" ps
ON CONFLICT ("id") DO NOTHING;

-- Drop retired tables + enum
DROP TABLE "ProofStep";
DROP TABLE "ProofAttempt";
DROP TYPE "ProofAttemptStatus";

-- PracticeRun review mode
ALTER TABLE "PracticeRun"
  ADD COLUMN "reviewMode" "PracticeRunReviewMode" NOT NULL DEFAULT 'GRADE_ONLY';

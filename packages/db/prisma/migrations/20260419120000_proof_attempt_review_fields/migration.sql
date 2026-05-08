-- AlterTable
ALTER TABLE "ProofAttempt"
  ADD COLUMN "overallFeedback" TEXT,
  ADD COLUMN "overallPromptVersion" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3);

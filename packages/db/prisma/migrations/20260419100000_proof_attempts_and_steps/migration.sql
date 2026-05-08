-- AlterEnum
ALTER TYPE "AnswerFormat" ADD VALUE 'PROOF';

-- CreateEnum
CREATE TYPE "ProofAttemptStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ProofStepType" AS ENUM ('ALGEBRAIC_EQUIVALENCE', 'EQUATION', 'INEQUALITY', 'CLAIM', 'DEDUCTION', 'CASE_SPLIT', 'CONCLUSION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProofVerificationBackend" AS ENUM ('SYMPY', 'LEAN', 'LLM_JUDGE', 'GEOGEBRA', 'CLASSIFIER_ONLY', 'NONE');

-- CreateEnum
CREATE TYPE "ProofStepVerdict" AS ENUM ('VERIFIED', 'PLAUSIBLE', 'UNKNOWN', 'INVALID', 'ERROR', 'PENDING');

-- CreateTable
CREATE TABLE "ProofAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "practiceRunId" TEXT,
    "status" "ProofAttemptStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofStep" (
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

    CONSTRAINT "ProofStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProofAttempt_userId_updatedAt_idx" ON "ProofAttempt"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProofAttempt_problemId_updatedAt_idx" ON "ProofAttempt"("problemId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProofAttempt_practiceRunId_updatedAt_idx" ON "ProofAttempt"("practiceRunId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProofAttempt_userId_problemId_status_updatedAt_idx" ON "ProofAttempt"("userId", "problemId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProofStep_attemptId_stepIndex_key" ON "ProofStep"("attemptId", "stepIndex");

-- CreateIndex
CREATE INDEX "ProofStep_attemptId_createdAt_idx" ON "ProofStep"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "ProofStep_userId_createdAt_idx" ON "ProofStep"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProofAttempt" ADD CONSTRAINT "ProofAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofAttempt" ADD CONSTRAINT "ProofAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofAttempt" ADD CONSTRAINT "ProofAttempt_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofStep" ADD CONSTRAINT "ProofStep_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ProofAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofStep" ADD CONSTRAINT "ProofStep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

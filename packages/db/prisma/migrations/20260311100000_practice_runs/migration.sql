CREATE TABLE "PracticeRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "problemSetId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PracticeRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProblemAttempt" ADD COLUMN "practiceRunId" TEXT;
ALTER TABLE "ProblemHintUsage" ADD COLUMN "practiceRunId" TEXT;

CREATE INDEX "PracticeRun_userId_startedAt_idx" ON "PracticeRun"("userId", "startedAt");
CREATE INDEX "PracticeRun_problemSetId_startedAt_idx" ON "PracticeRun"("problemSetId", "startedAt");
CREATE INDEX "PracticeRun_userId_problemSetId_completedAt_idx" ON "PracticeRun"("userId", "problemSetId", "completedAt");
CREATE INDEX "ProblemAttempt_practiceRunId_createdAt_idx" ON "ProblemAttempt"("practiceRunId", "createdAt");
CREATE INDEX "ProblemHintUsage_practiceRunId_createdAt_idx" ON "ProblemHintUsage"("practiceRunId", "createdAt");

ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_problemSetId_fkey" FOREIGN KEY ("problemSetId") REFERENCES "ProblemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemAttempt" ADD CONSTRAINT "ProblemAttempt_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemHintUsage" ADD CONSTRAINT "ProblemHintUsage_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

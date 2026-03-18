-- CreateTable
CREATE TABLE "ProblemAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "explanationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemHintUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "attemptId" TEXT,
    "hintLevel" INTEGER NOT NULL,
    "hintText" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemHintUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemAttempt_userId_createdAt_idx" ON "ProblemAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemAttempt_problemId_createdAt_idx" ON "ProblemAttempt"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemHintUsage_userId_createdAt_idx" ON "ProblemHintUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemHintUsage_problemId_createdAt_idx" ON "ProblemHintUsage"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemHintUsage_attemptId_idx" ON "ProblemHintUsage"("attemptId");

-- AddForeignKey
ALTER TABLE "ProblemAttempt" ADD CONSTRAINT "ProblemAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemAttempt" ADD CONSTRAINT "ProblemAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemHintUsage" ADD CONSTRAINT "ProblemHintUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemHintUsage" ADD CONSTRAINT "ProblemHintUsage_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemHintUsage" ADD CONSTRAINT "ProblemHintUsage_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ProblemAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

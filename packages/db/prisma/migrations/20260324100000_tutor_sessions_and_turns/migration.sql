-- CreateEnum
CREATE TYPE "TutorSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TutorTurnActor" AS ENUM ('STUDENT', 'TUTOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TutorIntent" AS ENUM ('HELP_START', 'CHECK_STEP', 'CHECK_ANSWER_IDEA', 'SMALLER_HINT');

-- CreateTable
CREATE TABLE "TutorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "practiceRunId" TEXT,
    "status" "TutorSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentIntent" "TutorIntent",
    "currentHintLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorTurn" (
    "id" TEXT NOT NULL,
    "tutorSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actor" "TutorTurnActor" NOT NULL,
    "intent" "TutorIntent",
    "rawText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorSession_userId_updatedAt_idx" ON "TutorSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "TutorSession_problemId_updatedAt_idx" ON "TutorSession"("problemId", "updatedAt");

-- CreateIndex
CREATE INDEX "TutorSession_practiceRunId_updatedAt_idx" ON "TutorSession"("practiceRunId", "updatedAt");

-- CreateIndex
CREATE INDEX "TutorSession_userId_problemId_status_updatedAt_idx" ON "TutorSession"("userId", "problemId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TutorTurn_tutorSessionId_createdAt_idx" ON "TutorTurn"("tutorSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "TutorTurn_userId_createdAt_idx" ON "TutorTurn"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTurn" ADD CONSTRAINT "TutorTurn_tutorSessionId_fkey" FOREIGN KEY ("tutorSessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTurn" ADD CONSTRAINT "TutorTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

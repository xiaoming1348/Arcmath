-- CreateEnum
CREATE TYPE "Contest" AS ENUM ('AMC8', 'AMC10', 'AMC12', 'AIME');

-- CreateEnum
CREATE TYPE "ProblemSetStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "StatementFormat" AS ENUM ('MARKDOWN_LATEX', 'HTML', 'PLAIN');

-- CreateEnum
CREATE TYPE "AnswerFormat" AS ENUM ('MULTIPLE_CHOICE', 'INTEGER', 'EXPRESSION');

-- CreateTable
CREATE TABLE "ProblemSet" (
    "id" TEXT NOT NULL,
    "contest" "Contest" NOT NULL,
    "year" INTEGER NOT NULL,
    "exam" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" "ProblemSetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "problemSetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "statement" TEXT,
    "statementFormat" "StatementFormat" NOT NULL DEFAULT 'MARKDOWN_LATEX',
    "choices" JSONB,
    "answer" TEXT,
    "answerFormat" "AnswerFormat" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "sourceUrl" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProblemSet_contest_year_exam_key" ON "ProblemSet"("contest", "year", "exam");

-- CreateIndex
CREATE INDEX "ProblemSet_contest_year_idx" ON "ProblemSet"("contest", "year");

-- CreateIndex
CREATE INDEX "Problem_problemSetId_idx" ON "Problem"("problemSetId");

-- CreateIndex
CREATE INDEX "Problem_number_idx" ON "Problem"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_problemSetId_number_key" ON "Problem"("problemSetId", "number");

-- CreateIndex
CREATE INDEX "ImportJob_uploadedByUserId_idx" ON "ImportJob"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ImportJob_sha256_idx" ON "ImportJob"("sha256");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_problemSetId_fkey" FOREIGN KEY ("problemSetId") REFERENCES "ProblemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

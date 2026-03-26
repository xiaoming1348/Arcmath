-- CreateEnum
CREATE TYPE "OrganizationPlanType" AS ENUM ('TRIAL', 'PAID');

-- CreateEnum
CREATE TYPE "OrganizationMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "planType" "OrganizationPlanType" NOT NULL DEFAULT 'TRIAL',
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "maxAdminSeats" INTEGER NOT NULL DEFAULT 5,
    "maxStudentSeats" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMembershipRole" NOT NULL,
    "status" "OrganizationMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PracticeRun" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "LearningReportSnapshot" (
    "id" TEXT NOT NULL,
    "practiceRunId" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_role_status_idx" ON "OrganizationMembership"("organizationId", "role", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "PracticeRun_organizationId_startedAt_idx" ON "PracticeRun"("organizationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningReportSnapshot_practiceRunId_key" ON "LearningReportSnapshot"("practiceRunId");

-- CreateIndex
CREATE INDEX "LearningReportSnapshot_organizationId_generatedAt_idx" ON "LearningReportSnapshot"("organizationId", "generatedAt");

-- CreateIndex
CREATE INDEX "LearningReportSnapshot_userId_generatedAt_idx" ON "LearningReportSnapshot"("userId", "generatedAt");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningReportSnapshot" ADD CONSTRAINT "LearningReportSnapshot_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningReportSnapshot" ADD CONSTRAINT "LearningReportSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningReportSnapshot" ADD CONSTRAINT "LearningReportSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

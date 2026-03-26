-- CreateTable
CREATE TABLE "OrganizationResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationResource_organizationId_createdAt_idx" ON "OrganizationResource"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationResource_createdByUserId_createdAt_idx" ON "OrganizationResource"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationAssignment_organizationId_createdAt_idx" ON "OrganizationAssignment"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationAssignment_organizationId_dueAt_idx" ON "OrganizationAssignment"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "OrganizationAssignment_createdByUserId_createdAt_idx" ON "OrganizationAssignment"("createdByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationResource" ADD CONSTRAINT "OrganizationResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationResource" ADD CONSTRAINT "OrganizationResource_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAssignment" ADD CONSTRAINT "OrganizationAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAssignment" ADD CONSTRAINT "OrganizationAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

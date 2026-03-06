-- CreateTable
CREATE TABLE "UserResourceAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemSetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserResourceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserResourceAccess_userId_problemSetId_key" ON "UserResourceAccess"("userId", "problemSetId");

-- CreateIndex
CREATE INDEX "UserResourceAccess_userId_createdAt_idx" ON "UserResourceAccess"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserResourceAccess_problemSetId_createdAt_idx" ON "UserResourceAccess"("problemSetId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserResourceAccess" ADD CONSTRAINT "UserResourceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResourceAccess" ADD CONSTRAINT "UserResourceAccess_problemSetId_fkey" FOREIGN KEY ("problemSetId") REFERENCES "ProblemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

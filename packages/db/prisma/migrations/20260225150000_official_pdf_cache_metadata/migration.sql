-- AlterTable
ALTER TABLE "ProblemSet"
ADD COLUMN "cachedPdfPath" TEXT,
ADD COLUMN "cachedPdfSha256" TEXT,
ADD COLUMN "cachedPdfSize" INTEGER,
ADD COLUMN "cachedPdfAt" TIMESTAMP(3),
ADD COLUMN "cachedPdfStatus" TEXT,
ADD COLUMN "cachedPdfError" TEXT;

-- CreateIndex
CREATE INDEX "ProblemSet_cachedPdfStatus_idx" ON "ProblemSet"("cachedPdfStatus");

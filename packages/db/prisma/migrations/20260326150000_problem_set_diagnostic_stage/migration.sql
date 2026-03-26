-- CreateEnum
CREATE TYPE "public"."DiagnosticStage" AS ENUM ('EARLY', 'MID', 'LATE');

-- AlterTable
ALTER TABLE "public"."ProblemSet" ADD COLUMN "diagnosticStage" "public"."DiagnosticStage";

-- CreateIndex
CREATE INDEX "ProblemSet_category_diagnosticStage_idx" ON "public"."ProblemSet"("category", "diagnosticStage");

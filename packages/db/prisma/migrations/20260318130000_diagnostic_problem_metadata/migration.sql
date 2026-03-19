CREATE TYPE "ExamTrack" AS ENUM ('AMC8', 'AMC10', 'AMC12');

ALTER TABLE "Problem"
ADD COLUMN     "examTrack" "ExamTrack",
ADD COLUMN     "techniqueTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "diagnosticEligible" BOOLEAN NOT NULL DEFAULT false;


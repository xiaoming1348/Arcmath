-- Assignment-level scope for large PDF materials.
-- Nullable so existing PDF assignments remain valid.
ALTER TABLE "ResourceAssignment" ADD COLUMN "sourcePageStart" INTEGER;
ALTER TABLE "ResourceAssignment" ADD COLUMN "sourcePageEnd" INTEGER;
ALTER TABLE "ResourceAssignment" ADD COLUMN "sourceProblemStart" TEXT;
ALTER TABLE "ResourceAssignment" ADD COLUMN "sourceProblemEnd" TEXT;
ALTER TABLE "ResourceAssignment" ADD COLUMN "sourceExcerpt" TEXT;
ALTER TABLE "ResourceAssignment" ADD COLUMN "studentPrompt" TEXT;
ALTER TABLE "ResourceAssignment" ADD COLUMN "gradingGuidance" TEXT;

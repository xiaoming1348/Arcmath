-- Optional student-uploaded files/images for manual PDF assignments.
ALTER TABLE "ResourceAssignmentSubmission" ADD COLUMN "attachmentLocator" TEXT;
ALTER TABLE "ResourceAssignmentSubmission" ADD COLUMN "attachmentFilename" TEXT;
ALTER TABLE "ResourceAssignmentSubmission" ADD COLUMN "attachmentMimeType" TEXT;
ALTER TABLE "ResourceAssignmentSubmission" ADD COLUMN "attachmentSize" INTEGER;
ALTER TABLE "ResourceAssignmentSubmission" ADD COLUMN "attachmentSha256" TEXT;

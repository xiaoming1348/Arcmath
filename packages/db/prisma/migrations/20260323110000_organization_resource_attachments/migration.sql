-- AlterTable
ALTER TABLE "OrganizationResource"
ADD COLUMN "attachmentLocator" TEXT,
ADD COLUMN "attachmentFilename" TEXT,
ADD COLUMN "attachmentMimeType" TEXT,
ADD COLUMN "attachmentSize" INTEGER,
ADD COLUMN "attachmentSha256" TEXT;

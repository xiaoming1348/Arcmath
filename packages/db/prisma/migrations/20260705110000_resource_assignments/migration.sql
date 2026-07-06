-- Teacher-assigned PDF / free-form resource tasks with manual grading.
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceAssignmentSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gradeScore" DOUBLE PRECISION,
    "gradeMax" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedByUserId" TEXT,

    CONSTRAINT "ResourceAssignmentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResourceAssignment_organizationId_dueAt_idx" ON "ResourceAssignment"("organizationId", "dueAt");
CREATE INDEX "ResourceAssignment_classId_dueAt_idx" ON "ResourceAssignment"("classId", "dueAt");
CREATE INDEX "ResourceAssignment_resourceId_createdAt_idx" ON "ResourceAssignment"("resourceId", "createdAt");
CREATE INDEX "ResourceAssignment_createdByUserId_createdAt_idx" ON "ResourceAssignment"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "ResourceAssignmentSubmission_assignmentId_studentUserId_key" ON "ResourceAssignmentSubmission"("assignmentId", "studentUserId");
CREATE INDEX "ResourceAssignmentSubmission_studentUserId_submittedAt_idx" ON "ResourceAssignmentSubmission"("studentUserId", "submittedAt");
CREATE INDEX "ResourceAssignmentSubmission_assignmentId_submittedAt_idx" ON "ResourceAssignmentSubmission"("assignmentId", "submittedAt");
CREATE INDEX "ResourceAssignmentSubmission_gradedByUserId_gradedAt_idx" ON "ResourceAssignmentSubmission"("gradedByUserId", "gradedAt");

ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OrganizationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResourceAssignmentSubmission" ADD CONSTRAINT "ResourceAssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ResourceAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAssignmentSubmission" ADD CONSTRAINT "ResourceAssignmentSubmission_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAssignmentSubmission" ADD CONSTRAINT "ResourceAssignmentSubmission_gradedByUserId_fkey" FOREIGN KEY ("gradedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

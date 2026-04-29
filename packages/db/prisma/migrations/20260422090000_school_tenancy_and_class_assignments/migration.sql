-- School-tenancy and teacher-class-assignment foundation.
--
-- What this migration adds:
--   1. TEACHER role on OrganizationMembership (previously only OWNER/ADMIN/STUDENT).
--   2. Per-school seat quota for teachers (maxTeacherSeats, default 3) and bumps
--      the student default from 30 → 50 to match the pilot target.
--   3. Organization.defaultLocale and User.locale to drive the new i18n layer.
--   4. ProblemSetVisibility enum + ownerOrganizationId/ownerUserId on ProblemSet
--      so teacher-uploaded sets are scoped to their school.
--   5. Class is now tenant-scoped (organizationId, createdByUserId, joinCode).
--   6. New ClassAssignment table = (class × problemSet) with due dates so
--      PracticeRun.classAssignmentId can roll up per-class progress.
--
-- Backfill safety: all new FKs / columns are nullable or have a default, so
-- this migration is non-destructive for existing dev rows. Historical
-- Classes/ProblemSets keep organizationId/ownerOrganizationId = NULL.

-- 1. New enum values ---------------------------------------------------------

ALTER TYPE "OrganizationMembershipRole" ADD VALUE 'TEACHER';

CREATE TYPE "ProblemSetVisibility" AS ENUM ('PUBLIC', 'ORG_ONLY', 'CLASS_ONLY');

-- 2. Organization: teacher seats + default locale ---------------------------

ALTER TABLE "Organization"
  ADD COLUMN "maxTeacherSeats" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'en';

-- Bump the default for new schools only; existing rows keep whatever they
-- had so we don't surprise-expand anyone's trial.
ALTER TABLE "Organization"
  ALTER COLUMN "maxStudentSeats" SET DEFAULT 50;

-- 3. User.locale -------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "locale" TEXT;

-- 4. ProblemSet visibility + ownership --------------------------------------

ALTER TABLE "ProblemSet"
  ADD COLUMN "visibility" "ProblemSetVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "ownerOrganizationId" TEXT,
  ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "ProblemSet"
  ADD CONSTRAINT "ProblemSet_ownerOrganizationId_fkey"
  FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProblemSet"
  ADD CONSTRAINT "ProblemSet_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProblemSet_visibility_ownerOrganizationId_idx"
  ON "ProblemSet" ("visibility", "ownerOrganizationId");

CREATE INDEX "ProblemSet_ownerUserId_createdAt_idx"
  ON "ProblemSet" ("ownerUserId", "createdAt");

-- 5. Class: organizationId, createdByUserId, joinCode ------------------------

ALTER TABLE "Class"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "joinCode" TEXT;

ALTER TABLE "Class"
  ADD CONSTRAINT "Class_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Class"
  ADD CONSTRAINT "Class_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Class_joinCode_key" ON "Class" ("joinCode");
CREATE INDEX "Class_organizationId_createdAt_idx" ON "Class" ("organizationId", "createdAt");
CREATE INDEX "Class_createdByUserId_createdAt_idx" ON "Class" ("createdByUserId", "createdAt");

-- 6. ClassAssignment --------------------------------------------------------

CREATE TABLE "ClassAssignment" (
  "id"              TEXT NOT NULL,
  "classId"         TEXT NOT NULL,
  "problemSetId"    TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "instructions"    TEXT,
  "assignedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openAt"          TIMESTAMP(3),
  "dueAt"           TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClassAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassAssignment_classId_problemSetId_key"
  ON "ClassAssignment" ("classId", "problemSetId");
CREATE INDEX "ClassAssignment_classId_dueAt_idx"
  ON "ClassAssignment" ("classId", "dueAt");
CREATE INDEX "ClassAssignment_problemSetId_idx"
  ON "ClassAssignment" ("problemSetId");
CREATE INDEX "ClassAssignment_createdByUserId_createdAt_idx"
  ON "ClassAssignment" ("createdByUserId", "createdAt");

ALTER TABLE "ClassAssignment"
  ADD CONSTRAINT "ClassAssignment_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassAssignment"
  ADD CONSTRAINT "ClassAssignment_problemSetId_fkey"
  FOREIGN KEY ("problemSetId") REFERENCES "ProblemSet"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassAssignment"
  ADD CONSTRAINT "ClassAssignment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. PracticeRun.classAssignmentId ------------------------------------------

ALTER TABLE "PracticeRun"
  ADD COLUMN "classAssignmentId" TEXT;

ALTER TABLE "PracticeRun"
  ADD CONSTRAINT "PracticeRun_classAssignmentId_fkey"
  FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PracticeRun_classAssignmentId_startedAt_idx"
  ON "PracticeRun" ("classAssignmentId", "startedAt");

-- Batch-2 admin overview + Batch-3 hint-tutor toggle migration.
-- Two product-driven additions in a single migration so they ship
-- together and downstream code only needs to feature-detect once:
--
--   1. Class.assignedTeacherId — when the school admin creates a class
--      and hands it to a teacher, this records who the teacher is.
--      Nullable so historical "teacher created their own class" rows
--      (where ownership is implicit via createdByUserId) still validate.
--      The /org admin overview joins on this column to populate the
--      "classes per teacher" panel.
--
--   2. ClassAssignment.hintTutorEnabled — per-assignment switch the
--      teacher flips when posting homework. When false, the hint tutor
--      panel is hidden in the student attempt UI; when true, hint use
--      is recorded via ProblemHintUsage as before. Default false so
--      existing assignments stay strictly graded until a teacher opts
--      in.

ALTER TABLE "Class"
  ADD COLUMN "assignedTeacherId" TEXT;

ALTER TABLE "Class"
  ADD CONSTRAINT "Class_assignedTeacherId_fkey"
    FOREIGN KEY ("assignedTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Class_organizationId_assignedTeacherId_idx"
  ON "Class"("organizationId", "assignedTeacherId");

ALTER TABLE "ClassAssignment"
  ADD COLUMN "hintTutorEnabled" BOOLEAN NOT NULL DEFAULT false;

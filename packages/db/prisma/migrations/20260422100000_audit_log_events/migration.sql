-- Append-only audit log of sensitive school/admin actions.
--
-- Scope for the pilot: invite/remove teacher, invite/remove student,
-- regenerate class join code, create/delete class assignment, publish
-- or unpublish a problem set, and admin overrides to formalization
-- status. Reads are NOT logged — this is meant to answer "who did
-- that destructive thing" not "who viewed which row."
--
-- organizationId is nullable because platform-level admin actions
-- (e.g. arcmath staff flipping formalization status from the global
-- review queue) do not have a single owning tenant. Those rows are
-- attributed via actorUserId alone.

CREATE TABLE "AuditLogEvent" (
  "id"             TEXT        NOT NULL,
  "actorUserId"    TEXT,
  "organizationId" TEXT,
  "action"         TEXT        NOT NULL,
  "targetType"     TEXT,
  "targetId"       TEXT,
  "payload"        JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLogEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLogEvent"
  ADD CONSTRAINT "AuditLogEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLogEvent"
  ADD CONSTRAINT "AuditLogEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AuditLogEvent_organizationId_createdAt_idx"
  ON "AuditLogEvent" ("organizationId", "createdAt" DESC);

CREATE INDEX "AuditLogEvent_actorUserId_createdAt_idx"
  ON "AuditLogEvent" ("actorUserId", "createdAt" DESC);

CREATE INDEX "AuditLogEvent_action_createdAt_idx"
  ON "AuditLogEvent" ("action", "createdAt" DESC);

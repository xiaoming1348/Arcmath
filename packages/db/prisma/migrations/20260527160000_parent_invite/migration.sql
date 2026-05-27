-- 2026-05-27: ParentInvite table (Phase C-4).
--
-- Token-based parent access to a single student's progress, without
-- the parent creating an account. The teacher generates one row per
-- (student, parent email). The /parent/<token> page consumes the
-- token verbatim from the URL — so the URL is treated as a credential.
--
-- Why not reuse EmailVerificationToken: that table's userId column
-- references the User being verified. The parent isn't a User row,
-- so stuffing parentEmail into the userId slot via a workaround is
-- messier than just having a purpose-built table here.
--
-- See model ParentInvite in schema.prisma for the full field-level
-- semantics; the column comments stay in the Prisma schema (Postgres
-- COMMENT ON not added — they live in the docstring).

CREATE TABLE "ParentInvite" (
    "id"              TEXT NOT NULL,
    "token"           TEXT NOT NULL,
    "studentUserId"   TEXT NOT NULL,
    "parentEmail"     TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "relationship"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "consumedAt"      TIMESTAMP(3),
    "revokedAt"       TIMESTAMP(3),

    CONSTRAINT "ParentInvite_pkey" PRIMARY KEY ("id")
);

-- Token lookup on every page render — must be O(1).
CREATE UNIQUE INDEX "ParentInvite_token_key" ON "ParentInvite" ("token");

-- Teacher view: "show me invites I've issued for student X".
CREATE INDEX "ParentInvite_studentUserId_idx" ON "ParentInvite" ("studentUserId");

-- Org admin view: "all invites issued by anyone in my org".
CREATE INDEX "ParentInvite_organizationId_idx" ON "ParentInvite" ("organizationId");

-- Sanity check: "has this parent ever been invited before?"
CREATE INDEX "ParentInvite_parentEmail_idx" ON "ParentInvite" ("parentEmail");

ALTER TABLE "ParentInvite"
    ADD CONSTRAINT "ParentInvite_studentUserId_fkey"
    FOREIGN KEY ("studentUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParentInvite"
    ADD CONSTRAINT "ParentInvite_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParentInvite"
    ADD CONSTRAINT "ParentInvite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

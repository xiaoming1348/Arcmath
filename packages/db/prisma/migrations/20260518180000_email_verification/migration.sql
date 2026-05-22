-- 2026-05-18: Email verification at registration.
--
-- Adds:
--   User.emailVerifiedAt  — DateTime?, set when user clicks the
--                           verification link emailed at signup.
--                           NULL for accounts that haven't verified yet,
--                           or for legacy/admin-spawned accounts that
--                           pre-date this migration (see backfill below).
--   EmailVerificationToken — one-shot token. Looked up by `token`
--                            (random 32-byte hex), valid for 24h,
--                            consumed on first use. Same table can
--                            later host PASSWORD_RESET tokens via the
--                            `purpose` column.

-- 1. User.emailVerifiedAt
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- 2. Backfill: existing accounts (created before this migration ran)
-- shouldn't be locked out — they were already trusted before we added
-- the verification requirement. Mark them all as verified at migration
-- time. New accounts created from this point on must verify normally.
UPDATE "User"
  SET "emailVerifiedAt" = NOW()
  WHERE "emailVerifiedAt" IS NULL;

-- 3. EmailVerificationToken
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EMAIL_VERIFICATION',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_token_key"
  ON "EmailVerificationToken"("token");

CREATE INDEX "EmailVerificationToken_userId_purpose_idx"
  ON "EmailVerificationToken"("userId", "purpose");

CREATE INDEX "EmailVerificationToken_expiresAt_idx"
  ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

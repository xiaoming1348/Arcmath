-- Roster-creation product pivot:
--   - Org admins create classes that auto-spawn teacher + student
--     accounts; no more standalone account-create form.
--   - Each org has exactly 1 admin, max 5 teachers, max 50 students.
--   - User.passwordHash becomes nullable so newly-spawned accounts
--     start password-less; the user sets their own password via the
--     "first-time set password" flow on the login page.

-- Bump default seat limits to the new product policy. Existing rows
-- get updated too so the dev/pilot org reflects the new limits without
-- needing manual SQL.
ALTER TABLE "Organization"
  ALTER COLUMN "maxAdminSeats" SET DEFAULT 1,
  ALTER COLUMN "maxTeacherSeats" SET DEFAULT 5;

UPDATE "Organization" SET "maxAdminSeats" = 1 WHERE "maxAdminSeats" > 1;
UPDATE "Organization" SET "maxTeacherSeats" = 5 WHERE "maxTeacherSeats" < 5;

-- passwordHash → nullable. Existing users have a hash so this just
-- relaxes the constraint for future inserts.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

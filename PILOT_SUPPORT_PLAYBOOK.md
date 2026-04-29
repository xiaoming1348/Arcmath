# Pilot support playbook

How to handle the support tickets you'll actually get during the pilot.
Each scenario has a symptom, a diagnostic path (what to look at before
you reply), a fix, and the message to send back. Keep responses short —
users don't want a product tour, they want the problem gone.

Standing rule: **never make a fix that isn't visible in the audit log.**
If you need to run a raw Prisma query, write an audit row yourself
explaining what you did and why.

## Diagnostics toolbelt

- `/admin/analytics` → Schools tab: per-tenant counters, health flag.
- `/admin/analytics` → Audit tab: filter by school + action namespace.
- `/admin` → Review queue: the content side (problem imports, proof
  formalization status).
- Prisma Studio (`pnpm -C packages/db db:studio`): last-resort direct
  DB view. Use read-only unless you're ready to write a mirror audit
  row.
- Log into your own `ADMIN` account, then navigate to `/teacher` —
  platform admins can act as teachers inside any tenant they have a
  membership in (see §8).

## 1. "Student can't log in" / "Never got the invite email"

**Symptom:** Teacher or student emails "I can't sign in." or "I haven't
received my invitation."

**Diagnose:**
1. Prisma Studio → `User` table, search by email (case-insensitive).
   - Row doesn't exist → the teacher never ran the invite. Confirm
     with the teacher which class the student should be in and ask
     them to re-invite.
   - Row exists, `passwordHash = "invite:unclaimed"` → the invite
     was sent but never claimed. They either lost the email or it
     went to spam.
   - Row exists, normal bcrypt hash → they have an account but
     forgot their password.
2. Cross-check `/admin/analytics` → Audit tab, filter the tenant,
   action contains `teacher.class.invite_students`. Look for an event
   whose `payload.emails` includes the student.

**Fix:**
- For an unclaimed invite: trigger a password-reset email from
  `/admin` (link their email → send reset). Tell them to check spam.
- For a forgotten password: same reset link.
- For a missing user row: ask the teacher to add them through
  `/teacher/classes/[id]` → "Invite students."

**Reply template:** "We re-sent your invitation to <email>. It
usually arrives within 2 minutes; check your spam folder if you
don't see it. Let us know once you've set your password and I'll
confirm you're in the right class."

## 2. "This school is at its student seat limit"

**Symptom:** Student self-joining with a code gets FORBIDDEN. Or a
teacher inviting a student sees `SEAT_FULL` in the invite result table.

**Diagnose:** `/admin/analytics` → Schools → find the school → compare
`Students` column against the `50` seat max.

**Fix:** Do **not** raise the cap without founder approval. Ask the
school admin whether they want to remove an inactive student first. If
they do:
- Offer to run the removal yourself from the class dashboard (requires
  you to act as their teacher — see §8). Never delete the `User` row;
  just remove the `OrganizationMembership.status → INACTIVE` and the
  affected `Enrollment` rows. This frees a seat while preserving all
  their practice history.
- If they insist on a cap raise, escalate.

**Reply template:** "Your pilot has <used>/<max> student seats in use.
We can either remove an inactive student to free a seat, or raise the
cap (which needs founder sign-off). Which would you like?"

## 3. "Invalid join code"

**Symptom:** Student entering the code from their teacher gets
`NOT_FOUND`.

**Diagnose:**
1. Confirm with the teacher exactly what code they shared (screenshot
   of their class page).
2. Prisma Studio → `Class` table, search by `joinCode`. If it's in a
   different org → the student is typing someone else's code. If not
   found at all → the code has been regenerated.

**Fix:**
- If regenerated: ask the teacher to share the current code from
  `/teacher/classes/[id]`.
- If the student is in a different school: the `joinClass` cross-org
  guard is working as intended. Ask them to confirm which school
  they're supposed to be in.

## 4. "Student enrolled in the wrong class"

**Symptom:** Student joined Class A but was meant to join Class B in
the same school.

**Diagnose:** `/admin/analytics` → Audit tab → filter by school →
search for `student.class.join` events for that user.

**Fix:** Teacher of Class A removes them (`removeStudent`), teacher of
Class B invites them. Or the student enters the correct join code for
Class B themselves — the existing enrollment in A remains until A's
teacher removes it. There is no UI for "move enrollment" and we're not
adding one during the pilot.

**Reply template:** "Ask <Class A teacher> to remove you from the
class page; then use <Class B>'s join code to join the right class."

## 5. "My class dashboard shows no students even though they joined"

**Symptom:** Teacher says their dashboard looks empty.

**Diagnose:**
1. Confirm which class from the teacher (URL or class name).
2. `/admin/analytics` → Audit tab → filter by school, action contains
   `student.class.join`, scan the `targetId` column for that class's
   id.
3. If join events exist: the student did enroll. The teacher might be
   looking at a different class (easy mistake if they created two).
4. If no join events: the students haven't joined yet. Teacher needs
   to re-share the code.

**Fix:** Nothing to change on our side. Reply with either "you're on
class X but they joined class Y" or "they haven't joined yet — re-share
your join code from /teacher/classes/[id]."

## 6. "Teacher created an assignment but students can't see it"

**Symptom:** Teacher insists they made the assignment, student home
page shows nothing new.

**Diagnose:**
1. `/admin/analytics` → Audit tab → filter by school, action
   `teacher.assignment.create`. Confirm the row exists and note the
   `targetId` (assignment id) and `payload.openAt`.
2. If `payload.openAt` is in the future, the student's "assignments"
   query correctly hides it until the open time (see `student.ts`
   line ~137 — the `OR: [{ openAt: null }, { openAt: { lte: now } }]`
   filter).
3. If `openAt` is null or past, check whether the student is actually
   enrolled in the class (`/admin/analytics` → Classes column; drill
   via Prisma Studio if needed).

**Fix:**
- Future `openAt`: explain the behavior; offer to bring it forward if
  that's what the teacher wants (they can do this from the assignment
  edit page themselves).
- Student not enrolled: they need to join with the code.

## 7. "Teacher upload is stuck — their problems aren't available"

**Symptom:** A teacher uploaded a custom problem set and can't assign
it to their class.

**Diagnose:** `/admin/review` → scope `pending` or `missing_solution`.
Find the set by title. Look at `formalizedStatus`:
- `PENDING`: preprocessing is still running. Give it up to 10 min for
  small sets.
- `FAILED`: the formalizer threw. Look at the most recent
  `admin.review.set_formalized_status` audit event for details, or
  open the set's page.
- `MANUAL_REVIEW`: preprocessing succeeded but the classifier flagged
  it for human eyes.

**Fix:** Promote the status to `READY` only after you've actually read
the set. For PENDING/FAILED, first try `/admin/review` → "Re-run
preprocessing" on the set before escalating.

## 8. "I need to act as a teacher to diagnose"

Platform admins are attached to the sentinel "ArcMath Ops" org. To act
as a teacher inside a tenant:

1. In Prisma Studio, create an `OrganizationMembership` row for
   yourself in the target org with `role=TEACHER`,
   `status=ACTIVE`.
2. Log out → log back in (context build reads membership at
   sign-in).
3. Do what you need. Every action you take is recorded in
   `AuditLogEvent` with your `actorUserId`.
4. When finished, close the session. The helper script does both
   steps atomically — flips the temp membership to `DISABLED` (the
   `OrganizationMembershipStatus` enum is `INVITED | ACTIVE | DISABLED`)
   and writes the `admin.support_session.close` audit row:
   ```bash
   bash scripts/with-env-local.sh \
     pnpm -C apps/web exec tsx src/scripts/close-support-session.ts \
       --actor-email "you@arcmath.local" \
       --tenant-slug "example-intl" \
       --reason "regenerated join code for teacher X after leak"
   ```
   The script refuses to run if the actor isn't `role=ADMIN`, if the
   membership is already `DISABLED`, or if you try to close your own
   permanent sentinel membership. Pass `--dry-run` first if you want
   to preview. This is important — a lingering `ACTIVE` admin
   membership inflates the school's teacher seat count and pollutes
   their audit log as a "live" teacher.

## 9. "We think another school saw our data"

**Stop and escalate.** The isolation contract is documented in
`MULTI_TENANT_ISOLATION.md`. Process:

1. Within 1 hour of report: acknowledge to the school
   ("Received — investigating, will have an update within 24h").
2. Pull the last 30 days of audit events for both tenants involved.
   Look for any event with a mismatch between `actorUserId`'s
   active membership and the `organizationId` of the targets they
   touched.
3. Write a 1-pager for the founder: timeline, scope of affected
   rows, root cause (if known), remediation. Include the raw audit
   events in an appendix.
4. After the founder approves the customer-facing message, reply to
   the school.

Do **not** send a reply blaming "user error" without the audit
evidence in hand. And do **not** mass-email other schools unless the
founder signs off — cross-tenant notifications should come from the
founder, not support.

## 10. Emergencies when the audit log itself is suspect

If a row in `AuditLogEvent` doesn't match your expectations, treat
the audit log as evidence, not as truth. Cross-reference with:
- Prisma Studio — the data row that the audit event claims to have
  changed.
- Server logs on Vercel — every tRPC call is logged with its input
  + actor.
- `PracticeRun.startedAt` / `.completedAt` timestamps — a good
  sanity check because they're set by DB defaults.

If the discrepancy looks real, stop writing any more mutations and
call the founder immediately. Audit integrity is a p0 issue.

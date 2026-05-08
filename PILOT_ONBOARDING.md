# Pilot school onboarding — operator playbook

This is the end-to-end runbook for onboarding a new pilot school. It
assumes one ArcMath operator (you) and one school contact (the school
admin, usually a head of math or a curriculum coordinator). Plan for
one 45-minute kickoff call plus three follow-ups in the first three
weeks.

Pilot caps per school: 3 teacher seats, 50 student seats. If a school
needs more, escalate to the founder before making promises.

## 0. Before the kickoff call

Collect from the school contact by email:

- School legal name (goes into `Organization.name`).
- Preferred short slug (goes into `Organization.slug`; used in audit
  logs and future URL paths). Default: anglicized lowercase dash-case,
  e.g. "qibao-dwight".
- Default locale for student UI: `en` or `zh`. Can be overridden per
  user later but this is what newly-invited accounts inherit.
- School-admin contact: full name, email, and (optional) phone/WeChat.
- Expected first-wave teachers: name + email for each (up to 3).
- Target kickoff date. Students often aren't ready on day 1; most
  pilots run "admin + teacher week" → "teachers build a class" →
  "students join" across 5–10 days.

Do **not** ask for student emails yet. Those come later — the kickoff
call is for the adults.

## 1. Create the tenant (ArcMath operator)

From the platform admin dashboard (`/admin`) — you need to be logged in
with a user whose `User.role = ADMIN`.

1. Open `/admin/analytics` → confirm the school is **not** already
   listed. If it is, reuse the row; do not create a duplicate.
2. Run the `create-pilot-school` script (TODO: wire this up as a
   proper admin UI; for the pilot it's a one-off script). Run it under
   the same env-loader wrapper the rest of the ops scripts use so
   `DATABASE_URL` + `PASSWORD_PEPPER` are picked up:
   ```bash
   bash scripts/with-env-local.sh \
     pnpm -C apps/web exec tsx src/scripts/create-pilot-school.ts \
       --name "Example International School" \
       --slug "example-intl" \
       --locale en \
       --admin-email "admin@example.edu" \
       --admin-name "First Last"
   ```
   Optional flags: `--trial-days <n>` (default 90), `--max-teacher-seats
   <n>` (default 3), `--max-student-seats <n>` (default 50),
   `--dry-run` (validate only, no DB writes).
   This:
   - Creates the `Organization` (planType=`TRIAL`, trialEndsAt=90
     days from now, maxTeacherSeats=3, maxStudentSeats=50,
     defaultLocale=`en`|`zh`).
   - Creates a `User` with `role=TEACHER`, a freshly-minted 16-char
     temp password (bcrypt-hashed with the org's pepper), and `locale`
     matching the school default.
   - Creates an `OrganizationMembership` with `role=OWNER`,
     `status=ACTIVE`.
   - Writes an `admin.organization.create_pilot_school` audit row.

   All four writes run inside a single `$transaction`, so a mid-flight
   failure rolls back — there is no half-provisioned tenant to clean
   up.

3. The script prints the temp password to stdout exactly once. Hand it
   to the school admin over a secure out-of-band channel (1Password /
   Signal / in person) — **never** the same email thread as the login
   URL. Confirm they can log in, then rotate the hash from Prisma
   Studio and add a `admin.support_session.close` audit row
   (change-password UI is a known Phase-7 gap). Refresh
   `/admin/analytics` → the school should show with a red health dot
   (no runs yet, no teachers other than the owner).

## 2. Kickoff call — walk the school admin through their dashboard

45 min. Screen-share on Zoom/Tencent Meeting. Keep your `/admin/`
tab open in a second window so you can tail the audit log.

**Minute 0–5 — context**
- Remind them of the pilot scope: 3 teachers, 50 students, 90-day
  trial, free during pilot in exchange for end-of-pilot survey + 1
  case-study call.
- Point out that everything they do is audited (`/admin/analytics`
  → Audit log) — tell them this is for support, not surveillance.

**Minute 5–20 — teacher invites**
- Have them open `/teacher` (their home page). Walk through the
  "Invite teachers" form. Enter 2 real teachers with their real
  emails. The form writes `OrganizationMembership` rows
  (role=TEACHER, status=INVITED) and sends them password-reset
  links.
- Show how the seat counter updates (`2/3 teachers`).

**Minute 20–35 — first class**
- On `/teacher/classes`, "Create class" → "Grade 10 Math Team".
- Show the generated 6-char join code. Copy it into the chat — they
  will share it with students after the call.
- Explain: the join code is per-class and can be regenerated if it
  leaks (`/teacher/classes/[id]` → regenerate). A new code
  invalidates the old one immediately; existing enrollments are
  unaffected.

**Minute 35–45 — first assignment**
- `/teacher/classes/[id]` → "Create assignment" → pick an AMC10 set
  they already know their students will handle. Title it "Week-1
  warmup".
- Leave `openAt` empty (open immediately) and set `dueAt` to 1 week
  out.
- Walk them through what they will see on the class dashboard once
  students start working: per-student progress, per-problem accuracy.

**Wrap-up**
- Send the follow-up email (see `PILOT_EMAIL_TEMPLATES.md`, "Kickoff
  recap").
- Add a calendar reminder for the week-1 check-in call.

## 3. First week — operator-side monitoring

Check `/admin/analytics` daily for the first week. Things to watch for:

| Signal | What to do |
|--------|------------|
| School stays red for 3+ days (no teachers activated) | Email the admin: "we noticed the teacher invites haven't been claimed yet — want us to re-send?" |
| Yellow: teachers seated, 0 runs | The class might be empty. Check the school's class list via `/admin/analytics` → Schools → Classes column. 0 classes = no class yet; ≥1 class = no students yet. Email accordingly. |
| Green: runs happening | Let them be. Don't email. |
| Any audit-log action with `targetType=Organization` that you didn't initiate | Investigate in the audit tab. |

Do **not** auto-remediate — always email the school admin first.
Even "they clicked the wrong button" calls are better handled with a
5-minute walk-through than a silent fix.

## 4. Week 1 check-in (30 min)

- Ask open-ended: "what surprised you?" — the pilot's biggest value
  is hearing the unvarnished version before we've ossified the
  product.
- Show them the class-progress dashboard and ask whether the signal
  there matches what they'd infer from watching their students in
  class. Mismatches are feature requests.
- Hand off their first student invite batch if they haven't done it
  already. The teacher UI supports pasting up to 100 emails at once;
  help them draft the batch inline if they're nervous.

## 5. Week 3 check-in (30 min)

- Send the mid-pilot survey 2 days before the call (see email
  templates). Read the responses before the call.
- Decide together: do they want to keep 50 students or swap some
  out? Swapping out = remove enrollment (doesn't delete the user row;
  their attempts stay in the DB for our analysis). Adding beyond 50
  requires a seat-max bump, which is an operator-side Prisma update
  — do not promise this during the call unless the founder has
  pre-approved.

## 6. End of pilot (day 90)

- Trigger the end-of-pilot survey.
- Run a 1-hour case-study call; record with consent.
- Decide: convert to paid (trial ended → SCHOOL plan), extend
  (set `trialEndsAt` +30 days), or offboard (set membership status
  to INACTIVE across the tenant; keep data for 90 days then purge).

## 7. Escalation paths

- Data-privacy question ("can a parent see their kid's attempts?"):
  route to founder; do not answer on the spot.
- Billing question: route to founder.
- Bug that blocks students: file a GitHub issue, tag `pilot-blocker`,
  and reply to the school within 4 working hours with an ETA.
- Security concern (e.g. "we think someone else saw our data"):
  pull the audit log for that org, write a 1-pager to the founder
  within 24 hours.

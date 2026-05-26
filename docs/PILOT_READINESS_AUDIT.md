# Pilot Readiness Audit (2026-05-26)

Goal: surface every gap that could embarrass us during the first school-pilot
demo, then prioritize what to fix before / during / after launch.

Color code:
- 🔴 **Blocker** — must fix before showing any school
- 🟠 **Embarrassing** — would mark us as unfinished
- 🟡 **Nice-to-have** — improves first impression
- 🟢 **Already OK** — confirmed working

---

## A. Auth flows

| Flow | Status | Notes |
|------|--------|-------|
| Register as individual student | 🟢 OK | `/register` + email verify works |
| Register as school admin | 🟢 OK | `/register/school` works |
| Verify email | 🟢 OK | Resend wired, hard-block unverified login |
| First-login set-password | 🟢 OK | `/login/set-password` for admin-spawned accounts |
| Login | 🟢 OK | NextAuth credentials provider |
| **Forgot password / reset** | 🔴 **MISSING** | No `/forgot-password` route. If a student forgets, they're locked out. |
| Two-factor auth (2FA) | 🟡 Future | Not required for pilot |
| Session expiry / logout | 🟢 OK | NextAuth default |

## B. Student experience (individual / B1)

| Item | Status | Notes |
|------|--------|-------|
| Land on `/` (logged-in, no org) | 🟠 Marketing page | Stays on marketing homepage; feels weird for a logged-in user |
| `/student` shows class/assignment UI | 🔴 **Empty state for B1** | "0 classes / 0 assignments" placeholder — looks broken |
| `/problems` browse + filter | 🟢 OK | AMC/AIME/Putnam/etc browsable |
| Do a problem | 🟢 OK | math-field editor + per-step feedback |
| `/me/progress` | 🟢 OK (Phase A+B+C) | trend chart + mastery + recs |
| `/account` switch language | 🟢 OK | UI vs feedback locale separate |
| **Mobile responsiveness** | 🟠 **Unverified** | math-field on touch devices is untested |

## C. School student experience (B2)

| Item | Status | Notes |
|------|--------|-------|
| Admin-created roster → student credentials | 🟢 OK | Admin upload CSV in `/teacher/classes/[id]` |
| First login → `/login/set-password` | 🟢 OK | |
| `/student` shows classes + assignments | 🟢 OK | StudentHomePanel renders both |
| "Start assignment" → PracticeRun | 🟢 OK | startMutation routes to `/problems/set/[id]?runId=...` |
| Submit → report | 🟢 OK | per-run reports at `/reports?runId=...` |
| **Receive assignment via email** | 🟡 **MISSING** | No notification when teacher posts new assignment |
| **Overdue assignment reminder** | 🟡 **MISSING** | No email when overdue |

## D. Teacher experience

| Item | Status | Notes |
|------|--------|-------|
| `/teacher` home | 🟢 OK | TeacherHomePanel with class list + invites |
| `/teacher/upload` problem-set upload | 🟢 OK | teacher-v1 JSON upload + AI rubric review |
| `/teacher/classes/[id]` class detail | 🟢 OK | 2 tabs: students + assignments |
| **Post assignment** | 🟢 OK | Inside class detail's "Assignments" tab |
| Monitor per-student progress | 🟢 OK | progressDrawer in class detail |
| **Assignment templates / save reusable** | 🟡 Future | One-off creation now |
| **Bulk class roster import (CSV)** | 🟢 OK | `/teacher/upload` |

## E. Org admin experience

| Item | Status | Notes |
|------|--------|-------|
| `/org` overview | 🟢 OK | members + practice runs + report snapshots |
| Invite teachers | 🟢 OK | invite-teachers-form |
| Set org defaults | 🟠 **Mostly missing** | Org has defaultLocale field but no UI to change it |
| `/assignments` org-wide assignment board | 🟠 **Hardcoded English** | Text like "Organization Assignments" / "Publish assignment" NOT i18n'd |
| **Seat usage display** | 🟢 OK | maxAdminSeats / maxStudentSeats in DB; partially shown |
| **Pilot expiry countdown** | 🟡 **MISSING** | trialEndsAt field exists; no UI surfaces it |

## F. Legal / compliance (CRITICAL for school sign-up)

| Item | Status | Notes |
|------|--------|-------|
| **Terms of Service** | 🔴 **MISSING** | Schools cannot legally sign students up without this |
| **Privacy Policy** | 🔴 **MISSING** | GDPR / China PIPL compliance |
| **Data Processing Agreement (DPA)** | 🔴 **MISSING** | Required by most international schools |
| **Cookie consent banner** | 🟡 Future | Most edu sites have it |
| Contact email for support | 🟢 OK | Listed in /for-schools |

## G. Static pages / marketing

| Item | Status | Notes |
|------|--------|-------|
| `/` homepage | 🟢 OK | Hero + dual CTA |
| `/for-schools` landing | 🟢 OK | i18n perfect |
| `/about` | 🟡 **MISSING** | No "about us" page |
| `/pricing` | 🟢 OK (none) | Free pilot, no price page needed |
| `/faq` | 🟡 **MISSING** | Schools often ask "what about X" — FAQ saves us emails |

## H. Error handling

| Item | Status | Notes |
|------|--------|-------|
| `_not-found` page | 🟢 OK | Next.js default route exists |
| **Custom branded 404** | 🟠 **Probably default** | Should have an Arcmath-branded one |
| 500 page | 🟠 **Default** | Same as above |
| Grading failure (LLM timeout, SymPy error) | 🟢 OK | Falls back to LLM judge → fallback feedback |
| Network failures during attempt | 🟢 OK | tRPC retry layer |

## I. Content gaps

| Item | Status | Priority |
|------|--------|----------|
| AMC8/10/12, AIME | 🟢 6+ sets each | — |
| USAMO | 🟢 6 sets | — |
| Putnam | 🟢 6 sets | — |
| MAT | 🟢 7 sets (2018-2024) | — |
| STEP | 🟠 3 sets, need **2019-II/2021-II/2024-II** | 🟠 |
| **USAJMO** | 🔴 **1 set** (pre-existing seed) | Depends on G9-G10 vs G11-G12 audience |
| AMC12 medium-HARD ratio | 🟡 Need 2-3 more (#68) | — |
| Topic practice (algebra/geometry/NT/comb) | 🟢 4 sets, 6 problems each | — |

## J. Mobile & accessibility

| Item | Status | Notes |
|------|--------|-------|
| Math editor on touch screen | 🟠 **Unverified** | MathLive should work but needs real-device test |
| Top nav on mobile | 🟠 **Unverified** | Burger menu? |
| `/me/progress` charts on narrow screens | 🟢 SVG responsive | viewBox-based |
| Screen reader / keyboard navigation | 🟡 Future | Not required for pilot |

## K. Performance / ops

| Item | Status | Notes |
|------|--------|-------|
| LLM call latency budget | 🟢 OK | retry layer + fallbacks; ~3-5s per step is acceptable |
| DB query N+1 | 🟢 Likely OK | Prisma includes used throughout |
| Static asset caching | 🟢 OK | Next.js default |
| **Monitoring / error tracking** | 🟠 **MISSING** | No Sentry / no error dashboard |
| **Uptime monitoring** | 🟠 **MISSING** | Should ping `/` from a different region every 5min |

---

## Critical pilot-blocking gaps (must fix before any school sees us)

In strict priority order:

1. 🔴 **Terms of Service + Privacy Policy** — legal blocker. School can't sign up without these.
2. 🔴 **Forgot-password flow** — when (not if) a pilot student forgets their password, they're locked out. Schools will not accept "ask your teacher to manually reset".
3. 🔴 **Individual-student `/student` empty state** — looks broken. Fix the UI to differentiate B1 (solo) vs B2 (org).
4. 🟠 **`/assignments` i18n** — Chinese teacher sees half English / half Chinese. Looks unfinished.
5. 🟠 **STEP 3 more years** — gap is visible to anyone shopping STEP coverage.
6. 🟠 **USAJMO decision** — either补 6 sets or quietly delete the 1 lonely set so it doesn't look orphan.
7. 🟠 **Branded 404 + 500 pages** — first time a student hits a wrong URL.
8. 🟠 **Mobile smoke test** — math editor on iOS Safari + Android Chrome.

## Lower-priority post-launch

- Email notifications for assignments
- Org-admin UI for defaultLocale + trial countdown
- About / FAQ pages
- Sentry + uptime monitoring
- Cookie consent
- DPA template
- USAJMO content if audience is G9-10

---

This audit is a snapshot; refresh after each significant change.

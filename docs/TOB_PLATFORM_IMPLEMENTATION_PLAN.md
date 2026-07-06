# ToB Platform Implementation Plan

Last updated: 2026-07-05

## Product Direction

ArcMath is moving from an individual practice product into a school and tutoring-organization platform. The target customer is an international school, contest-prep center, or tutorial organization that needs internal class management, homework delivery, teacher review, student progress visibility, and AI-assisted lesson preparation.

The product should feel like a stronger Canvas for math instruction:

- Organization admins manage accounts, classes, rosters, and org-level oversight.
- Teachers assign structured ArcMath problem sets or their own uploaded materials.
- Students complete work before due dates and receive graded feedback.
- Teachers can use AI to analyze difficult problems and preview new chapters without turning the system into a direct-answer generator.
- ArcMath’s existing problem library, reports, hinting, grading, and proof tools remain core differentiators.

## Current Implementation Status

### Already In Place

- Multi-tenant organization model:
  - `Organization`
  - `OrganizationMembership`
  - `Class`
  - `Enrollment`
  - tenant-scoped tRPC middleware
- Admin roster workflow:
  - one school admin can create classes
  - create or reuse teacher/student accounts
  - assign a teacher to a class
  - reset teacher/student passwords
- Teacher structured assignments:
  - assign existing public or org-owned `ProblemSet`
  - students start `PracticeRun`
  - teacher sees progress and hint usage
- Teacher resource workflow:
  - teachers/admins can upload PDF resources
  - teachers can assign PDFs as manual homework
  - teachers can scope a large PDF to selected pages and problem numbers
  - teachers can extract selectable text from the selected PDF pages automatically
  - scanned/non-searchable PDF selections can fall back to page-image OCR
  - teachers can paste selected source text and generate a cleaned student prompt plus teacher-only grading guidance
  - teachers can convert selected PDF text into a reviewable `teacher-v1` structured problem-set JSON draft
  - students submit text answers before due time
  - teachers can manually grade PDF submissions with score and feedback
- Teacher AI Prep Assistant:
  - `/teacher/prep`
  - difficult-problem, chapter-preview, and material-preview modes
  - structured key ideas, prerequisites, misconceptions, teaching sequence, discussion questions, and practice focus
  - deterministic fallback when OpenAI is unavailable
- Gradebook/export:
  - teacher class CSV export includes structured assignments and PDF/manual assignments
  - PDF rows include selected resource scope, submission status, grade, percent, and feedback
- Student PDF assignment submissions:
  - students can submit typed text
  - students can attach PDF/JPG/PNG/WebP work files up to the MVP size limit
  - teachers can open attached work while grading
- Formal verification architecture:
  - `docs/FORMAL_VERIFICATION_ARCHITECTURE.md`
  - recommends a separate Lean/mathlib verifier service rather than running Lean in the Next.js process
- Org admin oversight:
  - `/org` overview
  - `/org/students`
  - `/org/students/[userId]`
  - `/org/accounts/[userId]` for account-level inspection
  - audit feed for key class, assignment, and submission events

### Still Missing Or Incomplete

- PDF-to-structured-problem extraction:
  - assignment-scope metadata and pasted-excerpt formatting are in place
  - automatic page-text extraction is in place for searchable PDFs
  - OCR fallback is in place for small scanned page selections
  - teacher-reviewed `teacher-v1` JSON draft generation is in place
  - full visual review/segmentation UI and source-PDF back-links remain future work
- Gradebook/export polish:
  - class CSV exists, but dedicated filtered exports and analytics-style gradebook UI are still future work.
- Notifications:
  - no due-soon/submitted/graded notification surface yet.
- Tenant isolation test coverage:
  - current enforcement exists, but negative integration tests need to be expanded.
- Deployment hardening:
  - local Prisma engine lookup warning during build
  - production env audit for `NEXTAUTH_URL`, database migrations, object storage, and OpenAI keys

## MVP Acceptance Criteria For School Testing

Before external school testing, we should be able to run this script without developer intervention:

1. Platform/admin creates or registers a school tenant.
2. School admin logs in.
3. School admin creates a class with one teacher and multiple students.
4. Teacher logs in and sees assigned class.
5. Teacher uploads a PDF material.
6. Teacher selects pages/problems from the PDF and extracts text by searchable text or OCR.
7. Teacher either assigns the PDF manually with a transformed prompt or drafts structured `teacher-v1` JSON, previews it, edits required answers/solution sketches, and commits it as a structured assignment.
8. Student logs in, opens the PDF or structured assignment, and submits before the due time.
9. Teacher views submissions and grades manual PDF work or reviews structured progress.
10. School admin inspects the student and teacher account activity.
11. Teacher uses AI Prep Assistant on a difficult problem or chapter preview.
12. No user can access another organization’s classes, materials, assignments, submissions, or account details.

## Implementation Phases

### Phase 1: Finish Core ToB Workflows

Goal: make the admin/teacher/student school loop coherent.

Tasks:

- Keep org-admin account inspection tenant-scoped and linked from all account rows.
- Make PDF/manual assignments manageable:
  - create
  - scope to pages/problems
  - transform selected source text into a student-facing prompt
  - submit
  - grade
  - delete mistaken assignments
  - include audit events
- Make teacher dashboard counts include both structured and PDF assignments.
- Add a single teacher prep assistant entry point from `/teacher`.

Acceptance:

- Admin can inspect any account under their org.
- Teacher can assign either a structured problem set or a PDF material.
- Student can submit PDF homework.
- Teacher can grade PDF homework.
- Teacher can generate a non-answer-style prep brief.

### Phase 2: Teacher AI Prep Assistant MVP

Goal: help teachers analyze hard problems and preview chapters without giving a direct solution dump.

Inputs:

- Mode:
  - difficult problem
  - chapter preview
  - worksheet/material
- Text:
  - problem statement
  - chapter heading/outline
  - pasted material excerpt
- Optional context:
  - grade/course level
  - contest or track
  - teacher notes

Output:

- concise summary
- key ideas
- prerequisites
- likely student misconceptions
- suggested teaching sequence
- discussion questions
- optional practice focus
- “answer policy” reminder

Rules:

- Do not produce a final-answer-only response.
- For problems, explain strategy and key pivots, not a polished full solution by default.
- For chapters, surface conceptual map and sequencing.
- Keep language concise and classroom-ready.
- Teacher-only route; never student-accessible.

Acceptance:

- `/teacher/prep` is visible to teachers/admins.
- tRPC mutation calls OpenAI through existing `callOpenAIJson`.
- If `OPENAI_API_KEY` is missing or the call fails, the UI shows a deterministic fallback brief.
- Output is structured and easy to scan.

### Phase 3: Pilot Readiness Hardening

Goal: reduce support and security risk before external testers.

Tasks:

- Tenant isolation tests:
  - org account inspection cross-org denial
  - PDF resource assignment cross-org denial
  - submission cross-org denial
  - grading cross-org denial
  - class roster mutation cross-org denial
- Gradebook export:
  - class assignment CSV
  - PDF assignment submission/grade CSV
- Student submission upgrade:
  - allow file/image attachments for PDF assignments
  - optional OCR for handwritten solution preview
- Notifications/status:
  - submitted
  - graded
  - overdue
  - due soon
- Admin onboarding checklist:
  - create tenant
  - create roster
  - verify login
  - verify class ownership

Acceptance:

- A pilot school can run for one assignment cycle with minimal manual support.
- Security-critical cross-org paths have regression tests.
- Teachers can export grades and handle common submission formats.

### Phase 4: Structured PDF Intelligence

Goal: turn uploaded teacher PDFs into richer ArcMath-native content where possible.

Tasks:

- PDF text extraction pipeline.
- Problem segmentation.
- Teacher review screen before import. Initial implementation uses generated `teacher-v1` JSON plus the existing preview/commit importer.
- Optional answer/rubric generation. This must remain teacher-reviewed; the system should not invent grading keys.
- Auto-create `ProblemSet` from approved extraction. Initial implementation commits through the existing teacher importer after validation passes.
- Link extracted structured sets back to source PDF.

Acceptance:

- A teacher can upload a worksheet PDF, review extracted problems, approve, and assign as auto-graded structured homework.
- Manual PDF assignment remains available for materials that are not cleanly parseable.

## Technical Notes

- Use existing tRPC role gates:
  - `teacherProcedure` for teacher tools.
  - `schoolAdminProcedure` for org-admin account management.
- Keep tenant scope explicit in every query:
  - `organizationId`
  - class ownership through `Class.organizationId`
  - assignment ownership through class/org joins
- Use existing `callOpenAIJson` for OpenAI-backed features:
  - no new SDK dependency needed for MVP.
  - preserve deterministic fallbacks when API key is missing.
- Keep AI output structured with Zod validation and strict JSON schema.
- Avoid storing sensitive full AI prompts until we have a retention policy.

## Immediate Next Steps

1. Add tenant isolation tests for org account inspection, PDF assignments, submissions, grading, and roster mutation.
2. Add due-soon/submitted/graded notifications.
3. Add gradebook filters and analytics-style gradebook UI.
4. Add notifications for due-soon, submitted, graded, and overdue states.
5. Add visual PDF page preview/selection so teachers can select problems from page thumbnails instead of typing page/problem numbers.
6. Add source-PDF back-links from structured imported problems.
7. Add larger-file upload hardening and resumable upload support if pilots submit many scanned pages.

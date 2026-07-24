# Arcmath Promotion Video Runbook - 5 Minutes Max

Target audience: international schools, bilingual schools, math departments, and tutorial organizations.

Positioning: Arcmath is a school-internal math teaching assistance platform. It connects real classroom materials, assignment workflows, 100% correct auto-grading backed by formal verification for formalized problems, student hint tutoring during practice, and Lean-backed Research Mode for high-accuracy mathematical support.

Final video format: record two separate parts, then edit them together.

- Part 1: two speakers appear on camera and introduce the platform. No computer operation.
- Part 2: screen recording only. The speakers do not appear in the video; each speaker demonstrates features with voice comments.

## Prepared Demo Data

Organization: ArcMath Demo International School

Class: Grade 10 Advanced Algebra

Material: A First Course in Linear Algebra - Chapter 1 Exercises

Assignment: Chapter 1 Exercises 3-9: Matrices and Cramer's Rule

Scope: PDF pages 67-68, problems 3-9

Structured practice assignment: Auto-Graded Practice: Determinants and Invertibility

Students:

- Alice Chen: handwritten/photo-OCR work submitted and graded
- Marco Smith: answer-only integer and multiple-choice practice submitted and auto-graded

Demo accounts:

- Admin: `promo.admin@arcmath.school`
- Teacher: `promo.teacher@arcmath.school`
- Student: `promo.alice@arcmath.school`
- Shared password: `ArcDemo-2026!`

Seed command:

```bash
bash scripts/with-env-local.sh pnpm -C apps/web exec tsx src/scripts/seed-promo-video-demo.ts
```

## Recording Structure

### Part 1 - On-Camera Introduction, 0:00-0:40

Visual: two speakers seated together. Use a clean background. No screen sharing, no clicking, no login footage.

Speaker A:
"Arcmath is built for schools and tutorial organizations that want a stronger internal platform for math teaching. It helps teachers use real classroom materials, assign selected problems, review submissions, and track student progress."

Speaker B:
"The core idea is simple: teachers keep control of their classroom workflow, while the platform reduces repetitive work through formal-verification-backed auto-grading and student hint tutoring."

Speaker A:
"In this demo, we will show a teacher assigning selected problems from a real PDF, one student using photo recognition for handwritten math, another student completing answer-only homework, automated and teacher-reviewed grading, hint support for practice, and Research Mode for formal mathematical reasoning."

Speaker B:
"After that, we will briefly show the organization-level tools that make the same workflow manageable across classes, teachers, and students."

### Transition, 0:40-0:45

Visual: cut from camera to full-screen website recording. Start on `/for-schools`.

Voiceover - Speaker A:
"Now let's move into the platform."

## Part 2 - Screen Recording With Voiceover

### 0:45-1:25 - Core Feature 1: Teacher Assigns Selected Problems From A Real PDF

Account: teacher

Screen route: `/teacher`, then open `Grade 10 Advanced Algebra` and switch to the assignments area.

Show:

- The class name: Grade 10 Advanced Algebra
- The assignment title
- The real uploaded PDF material
- Selected page range: pages 67-68
- Selected problem range: problems 3-9
- Instructions and grading guidance
- Due date

Voiceover - Speaker B:
"We start with the teacher workflow. The teacher has uploaded a real math PDF and selected only the relevant part of the material: pages 67 to 68, problems 3 to 9."

Voiceover - Speaker B:
"This is important for real schools. Teachers often work from textbooks, worksheets, and long PDF documents. Arcmath lets them turn a precise section of that material into a structured assignment instead of sending an entire file to students."

Voiceover - Speaker A:
"The assignment keeps the original source, selected pages, selected problems, student instructions, grading guidance, and due time in one place. That makes the task clear for students and easier to manage for teachers."

### 1:25-2:20 - Core Feature 2: Photo Recognition, Student Submission, And Hint Tutor Practice

Account: student Alice

Screen route: `/student`, then open the determinant practice problem. Use the handwritten sheet from `docs/promo-handwritten-homework-script.md`.

Show:

- Assignment visible on the student dashboard
- Material title and selected scope
- Due time
- Alice's written response
- The attachment link for Alice's submitted PDF work
- Photo recognition button for handwritten math
- OCR-recognized steps from Alice's handwritten determinant work
- The intentional arithmetic error: `6 - 5 = -1`
- Feedback that the correct value is `1`
- Hint tutor during practice
- Progressive hints or next-step hint
- Hint usage recorded for teacher reporting

Voiceover - Speaker A:
"From the student side, the assignment is specific. The student can see the material, the selected pages, the selected problems, and the due time."

Voiceover - Speaker A:
"Alice has already submitted her answer and attached written work as a PDF. The student's work stays connected to the original material, so the teacher does not need to reconstruct context later."

Voiceover - Speaker B:
"Now we also show photo recognition. Alice writes a determinant solution by hand, takes a photo, and Arcmath converts the work into math steps she can review before submitting."

Voiceover - Speaker B:
"The handwritten setup is correct, but the final arithmetic has a deliberate mistake: 6 minus 5 is written as negative 1. This gives the platform a clear error to detect."

Voiceover - Speaker A:
"For independent practice, the hint tutor gives students controlled support when they are stuck. It does not simply reveal the answer; it gives step-by-step nudges and records hint usage."

Voiceover - Speaker B:
"That reduces routine teacher workload, because students can keep moving during practice while teachers still see who needed help and where."

### 2:20-3:05 - Core Feature 3: 100% Correct Verified Auto-Grading And Teacher Review

Account: teacher

Screen route: `/teacher`, then open `Grade 10 Advanced Algebra` and switch to the assignment gradebook/progress view.

Show:

- Alice: submitted and graded
- Marco: answer-only practice submitted
- Alice score: 88/100
- Teacher feedback
- Alice attachment available from the gradebook
- Marco's answer-only integer and multiple-choice practice results
- Correct answer-only submissions graded automatically
- Formal-verification-backed grading signals where available
- Export or progress view if visible

Voiceover - Speaker B:
"Back on the teacher side, the gradebook shows the operational picture immediately. Alice submitted handwritten work with one detected issue, while Marco completed answer-only integer and multiple-choice practice."

Voiceover - Speaker B:
"For formalized problems, Arcmath's auto-grading is designed around formal verification. Instead of relying only on a black-box language-model judgment, the system can check mathematical correctness through a formal engine."

Voiceover - Speaker A:
"That is the accuracy advantage: when formal verification signs off, the grading result is guaranteed by the formal system. For these formalized problems, Arcmath can deliver 100% correct auto-grading while teachers still keep review control."

Voiceover - Speaker A:
"For schools, this means faster grading, clearer feedback, and better visibility into which students submitted, which students are missing work, and which students relied heavily on hints."

### 3:05-4:00 - Core Feature 4: Research Mode With Lean-Backed Verification

Account: any signed-in account

Screen route: `/research-program/workspace`

Recommended demo statement:

```text
For every natural number n, n plus zero equals n.
```

Show:

- Natural Language to Lean Draft
- Lean Draft to Lean Final
- Lean verification result: `VERIFIED`
- Lean Explanation in natural language and mathematical writing

Voiceover - Speaker A:
"Research Mode is designed for deeper mathematical support. A teacher can start from a natural language statement and ask the system to produce a Lean draft."

Voiceover - Speaker A:
"Then the platform can move from draft to a final Lean proof and send it through the Lean kernel. When the result is verified, we know the proof has passed formal checking rather than only a language-model response."

Voiceover - Speaker B:
"The explanation step turns the verified proof back into readable mathematical language. This helps teachers preview difficult chapters, analyze proof-based problems, and prepare clearer explanations for class."

Voiceover - Speaker B:
"This is also the foundation for Arcmath's accuracy standard: important mathematical reasoning should be connected to formal verification whenever possible, including future grading and research workflows."

### 4:00-4:35 - Supporting Feature: Organization And Class Management

Account: admin

Screen route: `/org`

Show:

- Organization name
- Teacher and student accounts
- Grade 10 Advanced Algebra class
- Assigned teacher
- Alice and Marco enrolled in class
- Account-level visibility under the organization

Voiceover - Speaker B:
"At the organization level, the admin can manage the school workspace: classes, teacher accounts, student accounts, and account information under the organization."

Voiceover - Speaker A:
"This is what allows the same teaching workflow to scale from one class to a full school or tutorial organization."

### 4:35-5:00 - Closing

Screen route: `/for-schools` or `/research-program/workspace`

Voiceover - Speaker A:
"Arcmath brings real teaching materials, selected-problem assignments, student submissions, hint tutoring, verified auto-grading, and research-level math support into one school-internal platform."

Voiceover - Speaker B:
"For math departments and tutorial organizations, the goal is direct: less repetitive grading for teachers, more timely support for students, and higher confidence in mathematical correctness."

Voiceover - Speaker A:
"This is the Arcmath platform we are preparing for school and organization testing."

## Recording Checklist

- Record Part 1 and Part 2 separately.
- Keep the final edit under 5 minutes.
- Use full-screen browser recording for Part 2.
- Use browser zoom around 90 percent if tables are crowded.
- Do not show passwords, API keys, database pages, or server logs.
- Refresh the student page before recording if a seeded attachment link was recently regenerated.
- If Research Mode takes time on a cold start, record that segment separately and insert the clean take.

## Editing Notes

- Cut quickly from the on-camera opening into the website.
- Keep screen movement deliberate: one feature per shot.
- Use short title overlays only when helpful: "Teacher Assignment", "Hint Tutor", "100% Correct Auto-Grading", "Research Mode", "Organization Management".
- Keep the speakers' voices calm and precise. Avoid overexplaining buttons; describe the workflow and client value.

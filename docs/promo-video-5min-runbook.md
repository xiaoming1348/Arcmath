# Arcmath Promotion Video Runbook - 5 Minutes Max

Target audience: international schools and tutorial organizations.

Positioning: Arcmath is a school-internal math teaching assistance platform with class management, real PDF material workflows, assignment submission/grading, and Research Mode with Lean-backed verification.

Do not spend time on registration. Start from prepared demo accounts.

## Prepared Demo Data

Organization: ArcMath Demo International School

Class: Grade 10 Advanced Algebra

Material: A First Course in Linear Algebra - Chapter 1 Exercises

Assignment: Chapter 1 Exercises 3-9: Matrices and Cramer's Rule

Scope: PDF pages 67-68, problems 3-9

Students:

- Alice Chen: submitted and graded
- Marco Smith: not submitted

Accounts are seeded by:

```bash
bash scripts/with-env-local.sh pnpm -C apps/web exec tsx src/scripts/seed-promo-video-demo.ts
```

## Video Structure

### 0:00-0:25 - Opening

Screen: `/for-schools`

Speaker A:
"Today we are showing Arcmath as a teaching assistance platform for schools and tutorial organizations. The focus is not account signup. The focus is the daily teaching workflow: school management, teacher materials, assignments, student submissions, grading, and research-level math support."

Speaker B:
"We will use a prepared demo school with one teacher, two students, a real uploaded math PDF, and an assignment made from selected pages and problems."

### 0:25-1:10 - Organization And Class Control

Screen: admin account, `/org`

Show:

- Demo school name
- Teacher list
- Student list
- Grade 10 Advanced Algebra class
- Alice and Marco in class

Speaker A:
"The school admin owns the organization workspace. From here the school can see classes, teachers, students, and account-level information under the organization."

Speaker B:
"This is what makes the product suitable for institutions rather than only individual learners: the school controls the teaching structure."

### 1:10-2:05 - Teacher Material And Assignment

Screen: teacher account, teacher dashboard/resource assignment view

Show:

- Uploaded real PDF material
- Assignment title
- Pages 67-68
- Problems 3-9
- Student prompt and grading guidance
- Due date

Speaker B:
"Now we switch to the teacher. The teacher has uploaded a real math PDF and selected only pages 67 to 68, problems 3 to 9, instead of assigning the whole book."

Speaker A:
"This matches the real workflow in schools. Teachers already have textbooks and worksheets. Arcmath turns selected material into a structured assignment with due time, instructions, and grading guidance."

### 2:05-2:50 - Student Submission

Screen: Alice student account, `/student` or assignment page

Show:

- Assignment visible to student
- Selected PDF scope
- Alice submission
- Due time

Speaker B:
"From the student side, the task is clear: which material, which pages, which problems, and when it is due."

Speaker A:
"The platform keeps the original teaching material connected to the student's submitted work."

### 2:50-3:45 - Teacher Progress And Grading

Screen: teacher progress/gradebook

Show:

- Alice: submitted and graded
- Marco: not submitted
- Alice score 92/100
- Teacher feedback
- Attachment shown

Speaker B:
"The teacher can see who submitted, who has not submitted, and what still needs grading. Alice has submitted her work and received feedback, while Marco is still missing."

Speaker A:
"This gives schools operational visibility: not just practice accuracy, but assignment status, grading, feedback, and student accountability."

### 3:45-4:45 - Research Mode

Screen: `/research-program/workspace`

Show:

- Natural language statement
- Lean Draft
- Lean Final
- Lean verification result `VERIFIED`
- Explanation output

Recommended demo statement:

```text
For every natural number n, n plus zero equals n.
```

Speaker B:
"Research Mode supports teachers when previewing difficult chapters or analyzing proof-based problems. It can translate a natural language statement into Lean, complete a formal proof, verify it through the Lean kernel, and then explain the result in readable mathematical language."

Speaker A:
"The point is not to hand students direct answers. The point is to help teachers organize key ideas and rely on formal verification where mathematical correctness matters."

### 4:45-5:00 - Closing

Screen: `/for-schools` or dashboard

Speaker A:
"Arcmath combines school management, real classroom materials, assignment workflows, grading, and verified math support."

Speaker B:
"That is the platform we are preparing for school and tutoring-organization testing."

## Recording Notes

Keep the screen moving. Do not explain every button.

Do not show passwords, API keys, database pages, or server logs.

Use browser zoom at 90 percent if tables feel cramped.

Record one clean take first, then redo only the Research Mode segment if the proof verification cold start takes too long.

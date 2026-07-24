import { unlink } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";
import { extractPdfPageText } from "@/lib/pdf-text-extraction";

const ORG_NAME = "ArcMath Demo International School";
const ORG_SLUG = "arcmath-video-demo-school";
const CLASS_NAME = "Grade 10 Advanced Algebra";
const SHARED_PASSWORD = "ArcDemo-2026!";

const PDF_SOURCE_URL = "https://arxiv.org/pdf/1807.09352";
const PDF_FILENAME = "first-course-linear-algebra-kaabar.pdf";
const PDF_TITLE = "A First Course in Linear Algebra - Chapter 1 Exercises";
const PROMO_PRACTICE_EXAM = "promo-auto-grading-2026";
const PROMO_PRACTICE_TITLE = "Auto-Graded Practice: Determinants and Invertibility";

const SOURCE_PAGE_START = 67;
const SOURCE_PAGE_END = 68;
const SOURCE_PROBLEM_START = "3";
const SOURCE_PROBLEM_END = "9";

const ACCOUNTS = {
  admin: {
    email: "promo.admin@arcmath.school",
    name: "Dr. Emily Carter",
    orgRole: "OWNER" as const
  },
  teacher: {
    email: "promo.teacher@arcmath.school",
    name: "Mr. Daniel Lee",
    orgRole: "TEACHER" as const
  },
  alice: {
    email: "promo.alice@arcmath.school",
    name: "Alice Chen",
    orgRole: "STUDENT" as const
  },
  marco: {
    email: "promo.marco@arcmath.school",
    name: "Marco Smith",
    orgRole: "STUDENT" as const
  }
};

const ACCOUNT_EMAILS = Object.values(ACCOUNTS).map((account) => account.email);

function fallbackExcerpt(): string {
  return [
    "Chapter 1 Exercises",
    "",
    "3. Let F and H be matrices. Find the third row of HF, the third column of FH, and the (4,2)-entry of HF.",
    "4. Let A be a 3 x 3 matrix. If possible, find A inverse.",
    "5. Given A is a 2 x 4 matrix and row operations from A to A2, find elementary matrices for the transformations.",
    "6. Find det(A). Is A invertible? Explain.",
    "7. Determine whether a 2 x 2 matrix is invertible. If yes, find A inverse.",
    "8. Use Cramer's Rule to find the solution for x2 in the given system.",
    "9. Find the (2,4)-entry of A inverse."
  ].join("\n");
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, (match) => `\\${match}`);
}

function createSimplePdf(lines: string[]): Buffer {
  const contentLines = lines
    .map((line) => `(${escapePdfText(line)}) Tj T*`)
    .join("\n");
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 760 Td",
    "15 TL",
    contentLines,
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    ""
  ].join("\n");

  return Buffer.from(pdf, "utf8");
}

async function fetchPdf(): Promise<Buffer> {
  const response = await fetch(PDF_SOURCE_URL, {
    headers: {
      "User-Agent": "Arcmath promo demo seed"
    }
  });
  if (!response.ok) {
    throw new Error(`Could not download demo PDF: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
    throw new Error("Downloaded demo material is not a PDF.");
  }
  return bytes;
}

async function removeLocalFileIfAny(locator: string | null | undefined) {
  if (!locator || locator.startsWith("s3://")) return;
  await unlink(locator).catch(() => undefined);
}

async function cleanupExistingDemo() {
  await prisma.problemSet.deleteMany({
    where: {
      contest: "PRACTICE",
      year: 2026,
      exam: PROMO_PRACTICE_EXAM
    }
  });

  const existingOrg = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: {
      id: true,
      memberships: { select: { userId: true } },
      resources: { select: { attachmentLocator: true } },
      resourceAssignments: {
        select: {
          submissions: { select: { attachmentLocator: true } }
        }
      }
    }
  });

  if (existingOrg) {
    for (const resource of existingOrg.resources) {
      await removeLocalFileIfAny(resource.attachmentLocator);
    }
    for (const assignment of existingOrg.resourceAssignments) {
      for (const submission of assignment.submissions) {
        await removeLocalFileIfAny(submission.attachmentLocator);
      }
    }
    await prisma.organization.delete({ where: { id: existingOrg.id } });
  }

  const priorUserIds = existingOrg?.memberships.map((membership) => membership.userId) ?? [];
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { in: ACCOUNT_EMAILS } },
        ...(priorUserIds.length > 0 ? [{ id: { in: priorUserIds } }] : [])
      ]
    }
  });
}

async function createDemoUser(params: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  return prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      passwordHash: params.passwordHash,
      emailVerifiedAt: new Date(),
      role: "STUDENT",
      locale: "en",
      feedbackLocale: "en"
    },
    select: { id: true, email: true, name: true }
  });
}

async function main() {
  console.log("== Arcmath promo video demo seed ==");
  await cleanupExistingDemo();

  const [passwordHash, pdfBytes] = await Promise.all([
    bcrypt.hash(withPepper(SHARED_PASSWORD), 10),
    fetchPdf()
  ]);

  const org = await prisma.organization.create({
    data: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      planType: "TRIAL",
      defaultLocale: "en",
      maxAdminSeats: 1,
      maxTeacherSeats: 5,
      maxStudentSeats: 50,
      trialEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    select: { id: true, name: true, slug: true }
  });

  const admin = await createDemoUser({ ...ACCOUNTS.admin, passwordHash });
  const teacher = await createDemoUser({ ...ACCOUNTS.teacher, passwordHash });
  const alice = await createDemoUser({ ...ACCOUNTS.alice, passwordHash });
  const marco = await createDemoUser({ ...ACCOUNTS.marco, passwordHash });

  await prisma.organizationMembership.createMany({
    data: [
      { organizationId: org.id, userId: admin.id, role: ACCOUNTS.admin.orgRole, status: "ACTIVE" },
      { organizationId: org.id, userId: teacher.id, role: ACCOUNTS.teacher.orgRole, status: "ACTIVE" },
      { organizationId: org.id, userId: alice.id, role: ACCOUNTS.alice.orgRole, status: "ACTIVE" },
      { organizationId: org.id, userId: marco.id, role: ACCOUNTS.marco.orgRole, status: "ACTIVE" }
    ]
  });

  const klass = await prisma.class.create({
    data: {
      name: CLASS_NAME,
      organizationId: org.id,
      createdByUserId: admin.id,
      assignedTeacherId: teacher.id
    },
    select: { id: true, name: true }
  });

  await prisma.enrollment.createMany({
    data: [
      { classId: klass.id, userId: alice.id, role: "STUDENT" },
      { classId: klass.id, userId: marco.id, role: "STUDENT" }
    ]
  });

  await logAudit(
    prisma,
    { userId: admin.id, organizationId: org.id },
    {
      action: "class.create",
      targetType: "Class",
      targetId: klass.id,
      payload: {
        name: klass.name,
        assignedTeacherId: teacher.id,
        studentCount: 2,
        createdBy: "promo_video_seed"
      }
    }
  );

  let sourceExcerpt = fallbackExcerpt();
  try {
    const extracted = await extractPdfPageText({
      pdfBytes,
      pageStart: SOURCE_PAGE_START,
      pageEnd: SOURCE_PAGE_END
    });
    if (extracted.trim().length > 0) {
      sourceExcerpt = extracted.slice(0, 6000);
    }
  } catch (error) {
    console.warn(
      "[promo-seed] PDF text extraction failed; using curated excerpt.",
      error instanceof Error ? error.message : String(error)
    );
  }

  const resource = await prisma.organizationResource.create({
    data: {
      organizationId: org.id,
      createdByUserId: teacher.id,
      title: PDF_TITLE,
      description:
        "Real open math PDF for the promotion demo. The assignment uses PDF pages 67-68, exercises 3-9.",
      content:
        "Source: Mohammed K. A. Kaabar, A First Course in Linear Algebra, arXiv:1807.09352.",
      attachmentFilename: PDF_FILENAME,
      attachmentMimeType: "application/pdf"
    },
    select: { id: true }
  });

  const stored = await getOrganizationResourceStorage().putFile(
    resource.id,
    PDF_FILENAME,
    "application/pdf",
    pdfBytes
  );

  await prisma.organizationResource.update({
    where: { id: resource.id },
    data: {
      attachmentLocator: stored.locator,
      attachmentSize: stored.size,
      attachmentSha256: stored.sha256
    }
  });

  const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const assignment = await prisma.resourceAssignment.create({
    data: {
      organizationId: org.id,
      classId: klass.id,
      resourceId: resource.id,
      createdByUserId: teacher.id,
      title: "Chapter 1 Exercises 3-9: Matrices and Cramer's Rule",
      instructions:
        "Use the selected textbook pages. Submit full written work before the due time.",
      sourcePageStart: SOURCE_PAGE_START,
      sourcePageEnd: SOURCE_PAGE_END,
      sourceProblemStart: SOURCE_PROBLEM_START,
      sourceProblemEnd: SOURCE_PROBLEM_END,
      sourceExcerpt,
      studentPrompt:
        "Complete Chapter 1 Exercises 3-9 from PDF pages 67-68. Show matrix setup, determinant or inverse work, and final answers.",
      gradingGuidance:
        "100 pts: 40 for correct matrix setup, 30 for valid determinant/inverse or row-operation work, 20 for final answers, 10 for written explanation. Use Research Mode/formal verification for proof or calculation checks where appropriate.",
      dueAt,
      allowLateSubmissions: false
    },
    select: { id: true, title: true }
  });

  await logAudit(
    prisma,
    { userId: teacher.id, organizationId: org.id },
    {
      action: "resource.assignment.create",
      targetType: "ResourceAssignment",
      targetId: assignment.id,
      payload: {
        classId: klass.id,
        resourceId: resource.id,
        title: assignment.title,
        dueAt: dueAt.toISOString(),
        sourcePageStart: SOURCE_PAGE_START,
        sourcePageEnd: SOURCE_PAGE_END,
        sourceProblemStart: SOURCE_PROBLEM_START,
        sourceProblemEnd: SOURCE_PROBLEM_END,
        createdBy: "promo_video_seed"
      }
    }
  );

  const practiceSet = await prisma.problemSet.create({
    data: {
      contest: "PRACTICE",
      year: 2026,
      exam: PROMO_PRACTICE_EXAM,
      title: PROMO_PRACTICE_TITLE,
      category: "TOPIC_PRACTICE",
      submissionMode: "PER_PROBLEM",
      tutorEnabled: true,
      visibility: "ORG_ONLY",
      ownerOrganizationId: org.id,
      ownerUserId: teacher.id,
      sourceUrl: "promo://auto-grading-and-ocr",
      status: "PUBLISHED",
      problems: {
        create: [
          {
            number: 1,
            statement:
              "Let $A = \\begin{pmatrix}2 & 1 \\\\ 5 & 3\\end{pmatrix}$. Find $\\det(A)$.",
            statementFormat: "MARKDOWN_LATEX",
            answerFormat: "INTEGER",
            answer: "1",
            topicKey: "linear_algebra.determinants",
            difficultyBand: "EASY",
            sourceLabel: "Promo auto-grading demo · Q1",
            solutionSketch:
              "For a 2 by 2 matrix, det(A)=ad-bc=2*3-1*5=1.",
            curatedHintLevel1: "Use $ad-bc$ for a 2 by 2 determinant.",
            curatedHintLevel2: "Here $a=2$, $b=1$, $c=5$, and $d=3$.",
            curatedHintLevel3: "Compute $2\\cdot3-1\\cdot5$ carefully."
          },
          {
            number: 2,
            statement:
              "Which statement is correct for $B = \\begin{pmatrix}1 & 2 \\\\ 3 & 6\\end{pmatrix}$?",
            statementFormat: "MARKDOWN_LATEX",
            choices: [
              "A. $B$ is invertible because $\\det(B)=6$.",
              "B. $B$ is not invertible because $\\det(B)=0$.",
              "C. $B$ is invertible because its rows are different.",
              "D. $B$ is not invertible because its entries are positive."
            ],
            answerFormat: "MULTIPLE_CHOICE",
            answer: "B",
            topicKey: "linear_algebra.invertibility",
            difficultyBand: "EASY",
            sourceLabel: "Promo auto-grading demo · Q2",
            solutionSketch:
              "det(B)=1*6-2*3=0, so B is not invertible.",
            curatedHintLevel1: "Check the determinant before deciding invertibility.",
            curatedHintLevel2: "Compute $1\\cdot6-2\\cdot3$.",
            curatedHintLevel3: "A square matrix is invertible exactly when its determinant is nonzero."
          }
        ]
      }
    },
    select: {
      id: true,
      problems: {
        select: { id: true, number: true },
        orderBy: { number: "asc" }
      }
    }
  });

  const practiceAssignment = await prisma.classAssignment.create({
    data: {
      classId: klass.id,
      problemSetId: practiceSet.id,
      createdByUserId: teacher.id,
      title: PROMO_PRACTICE_TITLE,
      instructions:
        "Complete the determinant and invertibility checks. Hint tutor is enabled for practice, and answer-only submissions are graded automatically.",
      dueAt,
      hintTutorEnabled: true
    },
    select: { id: true, title: true }
  });

  const determinantProblem = practiceSet.problems.find((problem) => problem.number === 1);
  const invertibilityProblem = practiceSet.problems.find((problem) => problem.number === 2);
  if (!determinantProblem || !invertibilityProblem) {
    throw new Error("Promo practice problems were not created.");
  }

  const aliceRun = await prisma.practiceRun.create({
    data: {
      userId: alice.id,
      organizationId: org.id,
      classAssignmentId: practiceAssignment.id,
      problemSetId: practiceSet.id,
      mode: "PRACTICE",
      completedAt: new Date()
    },
    select: { id: true }
  });
  const aliceAttempt = await prisma.problemAttempt.create({
    data: {
      userId: alice.id,
      problemId: determinantProblem.id,
      practiceRunId: aliceRun.id,
      submittedAnswer: "-1",
      normalizedAnswer: "-1",
      isCorrect: false,
      explanationText:
        "The determinant should be 2*3 - 1*5 = 1. The submitted work contains a sign/arithmetic error in the final subtraction.",
      status: "SUBMITTED",
      entryMode: "STUCK_WITH_WORK",
      selfReport: "ATTEMPTED_STUCK",
      overallFeedback:
        "OCR captured the handwritten determinant setup, but the final arithmetic has an error: 6 - 5 is 1, not -1.",
      submittedAt: new Date()
    },
    select: { id: true }
  });
  await prisma.attemptStep.createMany({
    data: [
      {
        attemptId: aliceAttempt.id,
        userId: alice.id,
        stepIndex: 1,
        latexInput: "\\det(A)=2\\cdot 3-1\\cdot 5",
        classifiedStepType: "EQUATION",
        verificationBackend: "SYMPY",
        verdict: "VERIFIED",
        confidence: 0.99,
        feedbackText: "Correct determinant formula and substitution."
      },
      {
        attemptId: aliceAttempt.id,
        userId: alice.id,
        stepIndex: 2,
        latexInput: "=6-5",
        classifiedStepType: "ALGEBRAIC_EQUIVALENCE",
        verificationBackend: "SYMPY",
        verdict: "VERIFIED",
        confidence: 0.99,
        feedbackText: "Correct simplification before the final arithmetic."
      },
      {
        attemptId: aliceAttempt.id,
        userId: alice.id,
        stepIndex: 3,
        latexInput: "=-1",
        classifiedStepType: "CONCLUSION",
        verificationBackend: "SYMPY",
        verdict: "INVALID",
        confidence: 0.96,
        feedbackText: "Arithmetic error: 6 - 5 equals 1, not -1."
      }
    ]
  });
  await prisma.ocrCallLog.create({
    data: {
      userId: alice.id,
      kind: "multi_step",
      stepCount: 3,
      topConfidence: "high",
      succeeded: true,
      problemAttemptId: aliceAttempt.id
    }
  });

  const marcoRun = await prisma.practiceRun.create({
    data: {
      userId: marco.id,
      organizationId: org.id,
      classAssignmentId: practiceAssignment.id,
      problemSetId: practiceSet.id,
      mode: "PRACTICE",
      completedAt: new Date()
    },
    select: { id: true }
  });
  const marcoMcAttempt = await prisma.problemAttempt.create({
    data: {
      userId: marco.id,
      problemId: invertibilityProblem.id,
      practiceRunId: marcoRun.id,
      submittedAnswer: "B",
      normalizedAnswer: "B",
      isCorrect: true,
      explanationText:
        "Correct. The determinant is 1*6 - 2*3 = 0, so the matrix is not invertible.",
      status: "SUBMITTED",
      entryMode: "ANSWER_ONLY",
      hintsUsedCount: 1,
      submittedAt: new Date()
    },
    select: { id: true }
  });
  await prisma.problemAttempt.create({
    data: {
      userId: marco.id,
      problemId: determinantProblem.id,
      practiceRunId: marcoRun.id,
      submittedAnswer: "1",
      normalizedAnswer: "1",
      isCorrect: true,
      explanationText:
        "Correct. For a 2 by 2 determinant, 2*3 - 1*5 = 1.",
      status: "SUBMITTED",
      entryMode: "ANSWER_ONLY",
      submittedAt: new Date()
    },
    select: { id: true }
  });
  await prisma.problemHintUsage.create({
    data: {
      userId: marco.id,
      problemId: invertibilityProblem.id,
      attemptId: marcoMcAttempt.id,
      practiceRunId: marcoRun.id,
      hintLevel: 1,
      hintText:
        "Start by checking the determinant. A 2 by 2 matrix is invertible exactly when its determinant is nonzero.",
      promptVersion: "promo-seeded-hint-v1"
    }
  });
  await logAudit(
    prisma,
    { userId: teacher.id, organizationId: org.id },
    {
      action: "class.assignment.create",
      targetType: "ClassAssignment",
      targetId: practiceAssignment.id,
      payload: {
        classId: klass.id,
        problemSetId: practiceSet.id,
        title: practiceAssignment.title,
        hintTutorEnabled: true,
        createdBy: "promo_video_seed"
      }
    }
  );

  const aliceSubmission = await prisma.resourceAssignmentSubmission.create({
    data: {
      assignmentId: assignment.id,
      studentUserId: alice.id,
      answerText: [
        "I completed Exercises 3-9 as handwritten work.",
        "I used the determinant test for invertibility and Cramer's Rule for the linear system.",
        "I also tried the handwriting/photo recognition workflow on the determinant warm-up; the OCR correctly captured my setup and exposed one arithmetic error.",
        "I attached my written work for the matrix calculations."
      ].join("\n"),
      gradeScore: 88,
      gradeMax: 100,
      feedback:
        "Strong setup and clear matrix transformations. The photo/OCR check surfaced one arithmetic error in the determinant warm-up, and Exercise 9 needs a sign check. The overall method is sound.",
      gradedAt: new Date(),
      gradedByUserId: teacher.id
    },
    select: { id: true }
  });

  const studentWorkPdf = createSimplePdf([
    "Alice Chen - Handwritten Chapter 1 Exercises 3-9",
    "Grade 10 Advanced Algebra",
    "",
    "Photo/OCR warm-up:",
    "A = [[2, 1], [5, 3]]",
    "det(A) = 2*3 - 1*5 = 6 - 5 = -1",
    "Intentional correction target: 6 - 5 should equal 1.",
    "",
    "Exercise 6: I used the determinant test to decide invertibility.",
    "Exercise 8: I applied Cramer's Rule by replacing the x2 column.",
    "Exercise 9: My final inverse entry needs one sign check, as noted."
  ]);
  const storedSubmission = await getOrganizationResourceStorage().putFile(
    `resource-submission-${aliceSubmission.id}`,
    "alice-chen-handwritten-ocr-homework.pdf",
    "application/pdf",
    studentWorkPdf
  );
  await prisma.resourceAssignmentSubmission.update({
    where: { id: aliceSubmission.id },
    data: {
      attachmentLocator: storedSubmission.locator,
      attachmentFilename: "alice-chen-handwritten-ocr-homework.pdf",
      attachmentMimeType: "application/pdf",
      attachmentSize: storedSubmission.size,
      attachmentSha256: storedSubmission.sha256
    }
  });

  await logAudit(
    prisma,
    { userId: alice.id, organizationId: org.id },
    {
      action: "resource.assignment.submit",
      targetType: "ResourceAssignmentSubmission",
      targetId: aliceSubmission.id,
      payload: { assignmentId: assignment.id, hasAttachment: true }
    }
  );
  await logAudit(
    prisma,
    { userId: teacher.id, organizationId: org.id },
    {
      action: "resource.assignment.grade",
      targetType: "ResourceAssignmentSubmission",
      targetId: aliceSubmission.id,
      payload: {
        assignmentId: assignment.id,
        studentUserId: alice.id,
        gradeScore: 88,
        gradeMax: 100
      }
    }
  );

  console.log("");
  console.log("Promo demo seeded.");
  console.log(`Organization: ${org.name} (${org.slug})`);
  console.log(`Class: ${klass.name}`);
  console.log(`Resource: ${PDF_TITLE}`);
  console.log(`Assignment: ${assignment.title}`);
  console.log(`Practice assignment: ${practiceAssignment.title}`);
  console.log(`Shared password: ${SHARED_PASSWORD}`);
  console.log("");
  console.table([
    { role: "Admin", name: admin.name, email: admin.email },
    { role: "Teacher", name: teacher.name, email: teacher.email },
    { role: "Student", name: alice.name, email: alice.email, state: "Handwritten/OCR work submitted and graded" },
    { role: "Student", name: marco.name, email: marco.email, state: "Answer-only auto-graded practice submitted" }
  ]);
  console.log("");
  console.log("Recording routes:");
  console.log("  /for-schools");
  console.log("  /org");
  console.log("  /teacher");
  console.log("  /student");
  console.log("  /research-program/workspace");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

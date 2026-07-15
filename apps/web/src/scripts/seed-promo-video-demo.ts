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

  const aliceSubmission = await prisma.resourceAssignmentSubmission.create({
    data: {
      assignmentId: assignment.id,
      studentUserId: alice.id,
      answerText: [
        "I completed Exercises 3-9.",
        "For the inverse and determinant questions, I first checked whether the determinant was nonzero.",
        "For Cramer's Rule, I replaced the target column with the constants column and divided by det(C).",
        "I attached my written work for the matrix calculations."
      ].join("\n"),
      gradeScore: 92,
      gradeMax: 100,
      feedback:
        "Strong setup and clear matrix transformations. Recheck the sign convention in Exercise 9, but the overall method is correct.",
      gradedAt: new Date(),
      gradedByUserId: teacher.id
    },
    select: { id: true }
  });

  const studentWorkPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Promo demo student written work\n%%EOF\n",
    "utf8"
  );
  const storedSubmission = await getOrganizationResourceStorage().putFile(
    `resource-submission-${aliceSubmission.id}`,
    "alice-chen-chapter-1-exercises-3-9.pdf",
    "application/pdf",
    studentWorkPdf
  );
  await prisma.resourceAssignmentSubmission.update({
    where: { id: aliceSubmission.id },
    data: {
      attachmentLocator: storedSubmission.locator,
      attachmentFilename: "alice-chen-chapter-1-exercises-3-9.pdf",
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
        gradeScore: 92,
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
  console.log(`Shared password: ${SHARED_PASSWORD}`);
  console.log("");
  console.table([
    { role: "Admin", name: admin.name, email: admin.email },
    { role: "Teacher", name: teacher.name, email: teacher.email },
    { role: "Student", name: alice.name, email: alice.email, state: "Submitted and graded" },
    { role: "Student", name: marco.name, email: marco.email, state: "Not submitted" }
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

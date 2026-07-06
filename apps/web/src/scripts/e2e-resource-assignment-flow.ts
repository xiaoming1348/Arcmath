/**
 * End-to-end smoke test for PDF resource assignments.
 *
 * Proves the ToB material workflow:
 *   1. Admin creates an org class with teacher + student.
 *   2. Teacher uploads/owns a PDF resource.
 *   3. Teacher assigns pages 35-36, problems 3-9 from that PDF.
 *   4. Student submits text + a PDF attachment.
 *   5. Teacher sees progress, grades the submission, and gradebook
 *      reflects scope, score, feedback, and final status.
 *
 * Designed to be self-cleaning. Run with:
 *   ARCMATH_ENV_LOCAL_PATH=../../.env.local ../../scripts/with-env-local.sh \
 *     ../../node_modules/.bin/tsx src/scripts/e2e-resource-assignment-flow.ts
 */

import { unlink } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";
import { appRouter } from "@/lib/trpc/router";
import type { Session } from "next-auth";

const SMOKE_SLUG = "resource-assignment-smoke";
const SMOKE_ADMIN_EMAIL = "resource.admin@resource-assignment-smoke.arcmath.local";

// Keep this smoke test local even if .env.local points normal app uploads at S3.
process.env.OFFICIAL_PDF_STORAGE_DRIVER = "local";
process.env.ORG_RESOURCE_CACHE_DIR =
  process.env.ORG_RESOURCE_CACHE_DIR || "tmp/e2e-resource-assignment-flow";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    console.log(`  OK  ${label}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cleanup() {
  const existing = await prisma.organization.findUnique({
    where: { slug: SMOKE_SLUG },
    select: {
      id: true,
      resources: { select: { attachmentLocator: true } },
      resourceAssignments: {
        select: {
          submissions: { select: { attachmentLocator: true } }
        }
      }
    }
  });

  if (existing) {
    const memberUserIds = (
      await prisma.organizationMembership.findMany({
        where: { organizationId: existing.id },
        select: { userId: true }
      })
    ).map((m) => m.userId);

    const locators = [
      ...existing.resources.map((resource) => resource.attachmentLocator),
      ...existing.resourceAssignments.flatMap((assignment) =>
        assignment.submissions.map((submission) => submission.attachmentLocator)
      )
    ].filter((locator): locator is string => Boolean(locator));

    for (const locator of locators) {
      if (!locator.startsWith("s3://")) {
        await unlink(locator).catch(() => undefined);
      }
    }

    await prisma.organization.delete({ where: { id: existing.id } });
    if (memberUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: memberUserIds } } });
    }
  }

  await prisma.user.deleteMany({ where: { email: SMOKE_ADMIN_EMAIL } });
}

function adminSession(userId: string): Session {
  return {
    user: {
      id: userId,
      email: SMOKE_ADMIN_EMAIL,
      name: "Resource Admin",
      role: "STUDENT"
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  } as unknown as Session;
}

function callerContext(args: {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgRole: "OWNER" | "TEACHER" | "STUDENT";
}) {
  return {
    session: {
      user: {
        id: args.userId,
        email: args.email,
        name: args.name,
        role: "STUDENT"
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    } as unknown as Session,
    prisma,
    membership: {
      organizationId: args.orgId,
      organizationName: "Resource Assignment Smoke",
      organizationSlug: SMOKE_SLUG,
      role: args.orgRole,
      userId: args.userId
    }
  };
}

async function main() {
  console.log("== E2E RESOURCE ASSIGNMENT FLOW: PDF scope → submit → grade → gradebook ==");
  await cleanup();

  console.log("\n1. Bootstrap admin + org + roster");
  const admin = await prisma.user.create({
    data: {
      email: SMOKE_ADMIN_EMAIL,
      name: "Resource Admin",
      passwordHash: await bcrypt.hash(withPepper("admin-pass-12345"), 10),
      role: "STUDENT"
    },
    select: { id: true }
  });
  const org = await prisma.organization.create({
    data: {
      name: "Resource Assignment Smoke",
      slug: SMOKE_SLUG,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    },
    select: { id: true }
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: org.id,
      userId: admin.id,
      role: "OWNER",
      status: "ACTIVE"
    }
  });

  const adminCaller = appRouter.createCaller({
    session: adminSession(admin.id),
    prisma,
    membership: {
      organizationId: org.id,
      organizationName: "Resource Assignment Smoke",
      organizationSlug: SMOKE_SLUG,
      role: "OWNER",
      userId: admin.id
    }
  } as never);

  const roster = await adminCaller.orgAdmin.createClassWithRoster({
    className: "PDF Scope Class",
    teacher: { kind: "new", name: "Teacher Rivera" },
    students: [{ kind: "new", name: "Student Morgan" }]
  });
  const classId = roster.klass.id;
  const teacherId = roster.teacher.userId;
  const studentId = roster.students[0].userId;
  check("class with teacher + student created", Boolean(classId && teacherId && studentId));

  await prisma.user.update({
    where: { id: teacherId },
    data: { passwordHash: await bcrypt.hash(withPepper("teacher-pass-1"), 10) }
  });
  await prisma.user.update({
    where: { id: studentId },
    data: { passwordHash: await bcrypt.hash(withPepper("student-pass-1"), 10) }
  });

  console.log("\n2. Teacher owns a PDF organization resource");
  const resource = await prisma.organizationResource.create({
    data: {
      organizationId: org.id,
      createdByUserId: teacherId,
      title: "Algebra Textbook Chapter 5",
      description: "Smoke PDF for selected-page homework.",
      content: "Teacher-uploaded PDF resource used by the smoke test.",
      attachmentFilename: "algebra-ch5-smoke.pdf",
      attachmentMimeType: "application/pdf"
    },
    select: { id: true }
  });
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
    "utf8"
  );
  const stored = await getOrganizationResourceStorage().putFile(
    resource.id,
    "algebra-ch5-smoke.pdf",
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
  check("PDF resource stored locally", stored.size === pdfBytes.length);

  const teacherCaller = appRouter.createCaller(
    callerContext({
      userId: teacherId,
      email: roster.teacher.email,
      name: "Teacher Rivera",
      orgId: org.id,
      orgRole: "TEACHER"
    }) as never
  );

  console.log("\n3. Teacher assigns selected pages/problems from the PDF");
  const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const assignment = await teacherCaller.teacher.resourceAssignments.create({
    classId,
    resourceId: resource.id,
    title: "Chapter 5 selected problems",
    instructions: "Submit full written work.",
    sourcePageStart: 35,
    sourcePageEnd: 36,
    sourceProblemStart: "3",
    sourceProblemEnd: "9",
    sourceExcerpt: "Problems 3-9 ask students to solve linear equations and explain each step.",
    studentPrompt: "Complete page 35-36, problems 3-9. Show all algebra steps.",
    gradingGuidance: "Award credit for equation setup, legal transformations, final value, and explanation.",
    dueAt,
    allowLateSubmissions: false
  });
  check("resource assignment created", Boolean(assignment.id));

  const createdAssignment = await prisma.resourceAssignment.findUnique({
    where: { id: assignment.id },
    select: {
      sourcePageStart: true,
      sourcePageEnd: true,
      sourceProblemStart: true,
      sourceProblemEnd: true,
      studentPrompt: true,
      gradingGuidance: true
    }
  });
  check("page scope persisted", createdAssignment?.sourcePageStart === 35 && createdAssignment.sourcePageEnd === 36);
  check(
    "problem scope persisted",
    createdAssignment?.sourceProblemStart === "3" &&
      createdAssignment.sourceProblemEnd === "9"
  );
  check("transformed prompt persisted", createdAssignment?.studentPrompt?.includes("problems 3-9") === true);

  console.log("\n4. Student sees and submits the PDF assignment");
  const studentCaller = appRouter.createCaller(
    callerContext({
      userId: studentId,
      email: roster.students[0].email,
      name: "Student Morgan",
      orgId: org.id,
      orgRole: "STUDENT"
    }) as never
  );
  const studentAssignments = await studentCaller.student.assignments();
  const visibleResource = studentAssignments.resourceItems.find(
    (item) => item.assignmentId === assignment.id
  );
  check("student assignment list includes PDF assignment", Boolean(visibleResource));
  check(
    "student sees selected page/problem scope",
    visibleResource?.sourcePageStart === 35 &&
      visibleResource.sourcePageEnd === 36 &&
      visibleResource.sourceProblemStart === "3" &&
      visibleResource.sourceProblemEnd === "9"
  );

  const submissionBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% student work\n%%EOF\n",
    "utf8"
  );
  const submitted = await studentCaller.student.resourceAssignments.submit({
    assignmentId: assignment.id,
    answerText: "I solved problems 3-9 and attached my written work.",
    attachment: {
      filename: "student-morgan-ch5.pdf",
      mimeType: "application/pdf",
      base64: submissionBytes.toString("base64")
    }
  });
  check("student submission created", Boolean(submitted.id));
  check("student attachment saved", submitted.attachmentFilename === "student-morgan-ch5.pdf");

  console.log("\n5. Teacher progress shows submitted work");
  const progressBeforeGrade = await teacherCaller.teacher.resourceAssignments.progress({
    assignmentId: assignment.id
  });
  const studentProgress = progressBeforeGrade.students.find(
    (student) => student.userId === studentId
  );
  check("progress row exists", Boolean(studentProgress));
  check("progress status is SUBMITTED", studentProgress?.status === "SUBMITTED");
  check("progress includes attachment", studentProgress?.submission?.attachmentFilename === "student-morgan-ch5.pdf");

  console.log("\n6. Gradebook shows needs-grading row before grading");
  const gradebookBefore = await teacherCaller.teacher.gradebook.summary({
    classId,
    assignmentType: "PDF",
    status: "NEEDS_GRADING"
  });
  check("gradebook has one needs-grading row", gradebookBefore.summary.needsGradingRows === 1);

  console.log("\n7. Teacher grades the PDF submission");
  const graded = await teacherCaller.teacher.resourceAssignments.grade({
    assignmentId: assignment.id,
    studentUserId: studentId,
    gradeScore: 8.5,
    gradeMax: 10,
    feedback: "Good setup and clear transformations. Recheck problem 7 notation."
  });
  check("grade saved", graded.gradeScore === 8.5 && graded.gradeMax === 10);
  check("feedback saved", graded.feedback?.includes("Recheck problem 7") === true);

  const progressAfterGrade = await teacherCaller.teacher.resourceAssignments.progress({
    assignmentId: assignment.id
  });
  const gradedProgress = progressAfterGrade.students.find(
    (student) => student.userId === studentId
  );
  check("progress status is GRADED", gradedProgress?.status === "GRADED");

  console.log("\n8. Gradebook reflects score, scope, and final status");
  const gradebookAfter = await teacherCaller.teacher.gradebook.summary({
    classId,
    assignmentType: "PDF",
    status: "ALL"
  });
  const row = gradebookAfter.rows.find(
    (candidate) => candidate.assignmentId === assignment.id && candidate.studentUserId === studentId
  );
  check("gradebook row exists", Boolean(row));
  check("gradebook status is GRADED", row?.status === "GRADED");
  check("gradebook percent is 85", row?.percent === 85, JSON.stringify(row));
  check("gradebook scope is pages/problems", row?.scope === "pages 35-36, problems 3-9", row?.scope ?? "null");
  check("gradebook attachment surfaced", row?.attachmentFilename === "student-morgan-ch5.pdf");
  check("gradebook feedback surfaced", row?.feedback?.includes("Recheck problem 7") === true);
  check("gradebook needs-grading now zero", gradebookAfter.summary.needsGradingRows === 0);

  await cleanup();
  console.log(`\n== Result: ${pass} OK / ${fail} FAIL ==`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Resource assignment smoke test crashed:", err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});

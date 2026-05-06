/**
 * End-to-end smoke test for the THREE CORE FEATURES the pilot
 * absolutely cannot ship without:
 *
 *   1. Teacher uploads a problem set (teacher-v1 JSON via tRPC).
 *   2. Teacher assigns it to a class.
 *   3. Student opens the assignment, answers a problem, and the
 *      auto-grader marks it (correct ↔ incorrect both checked).
 *
 * Hits the real Neon DB; cleans up its smoke-test org at start +
 * end. Run with:
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/e2e-core-flow.ts
 */

import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { appRouter } from "@/lib/trpc/router";
import type { Session } from "next-auth";

const SMOKE_SLUG = "core-flow-smoke";
const SMOKE_ADMIN_EMAIL = "core.admin@core-flow-smoke.arcmath.local";

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
    select: { id: true }
  });
  if (existing) {
    const memberUserIds = (
      await prisma.organizationMembership.findMany({
        where: { organizationId: existing.id },
        select: { userId: true }
      })
    ).map((m) => m.userId);
    // ProblemSet doesn't cascade-delete with Organization in the
    // current schema, so drop the test org's uploaded sets explicitly
    // to leave a clean DB for the next run.
    await prisma.problemSet.deleteMany({ where: { ownerOrganizationId: existing.id } });
    await prisma.organization.delete({ where: { id: existing.id } });
    if (memberUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: memberUserIds } } });
    }
  }
  await prisma.user.deleteMany({ where: { email: SMOKE_ADMIN_EMAIL } });
  // Defensive: drop any orphan smoke-quiz sets from a prior crash.
  await prisma.problemSet.deleteMany({
    where: { contest: "PRACTICE", year: 2026, exam: "smoke-week-1" }
  });
}

function makeAdminSession(userId: string, orgRole: "OWNER"): {
  session: Session;
  membership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: "OWNER";
    userId: string;
  };
} {
  return {
    session: {
      user: { id: userId, email: SMOKE_ADMIN_EMAIL, name: "Core Admin", role: "STUDENT" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString()
    } as unknown as Session,
    membership: {
      organizationId: "PLACEHOLDER",
      organizationName: "Core Flow Smoke",
      organizationSlug: SMOKE_SLUG,
      role: orgRole,
      userId
    }
  };
}

async function main() {
  console.log("== E2E CORE FLOW: teacher upload → assign → student answer → auto-grade ==");
  await cleanup();

  // Bootstrap: admin + org
  console.log("\n1. Bootstrap admin + org");
  const admin = await prisma.user.create({
    data: {
      email: SMOKE_ADMIN_EMAIL,
      name: "Core Admin",
      passwordHash: await bcrypt.hash(withPepper("admin-pass-12345"), 10),
      role: "STUDENT"
    },
    select: { id: true }
  });
  const org = await prisma.organization.create({
    data: {
      name: "Core Flow Smoke",
      slug: SMOKE_SLUG,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    },
    select: { id: true }
  });
  await prisma.organizationMembership.create({
    data: { organizationId: org.id, userId: admin.id, role: "OWNER", status: "ACTIVE" }
  });
  check("admin + org + OWNER membership", !!org.id);

  // 2. Admin creates a class with 1 teacher + 1 student
  console.log("\n2. Admin creates class with roster (1 teacher + 1 student)");
  const adminCtx = makeAdminSession(admin.id, "OWNER");
  adminCtx.membership.organizationId = org.id;
  const adminCaller = appRouter.createCaller({
    session: adminCtx.session,
    prisma,
    membership: adminCtx.membership
  } as never);

  const rosterResult = await adminCaller.orgAdmin.createClassWithRoster({
    className: "Core Flow Class",
    teacher: { kind: "new", name: "Teacher Tang" },
    students: [{ kind: "new", name: "Student Sun" }]
  });
  const teacherId = rosterResult.teacher.userId;
  const studentId = rosterResult.students[0].userId;
  const classId = rosterResult.klass.id;
  check("class created", !!classId);
  check("teacher + student spawned", !!teacherId && !!studentId);

  // Set passwords for both teacher and student so they can act
  await prisma.user.update({
    where: { id: teacherId },
    data: { passwordHash: await bcrypt.hash(withPepper("teacher-pass-1"), 10) }
  });
  await prisma.user.update({
    where: { id: studentId },
    data: { passwordHash: await bcrypt.hash(withPepper("student-pass-1"), 10) }
  });

  // 3. Teacher uploads a problem set (teacher-v1 JSON)
  console.log("\n3. Teacher uploads a problem set (teacher-v1 JSON)");
  const teacherCaller = appRouter.createCaller({
    session: {
      user: { id: teacherId, email: rosterResult.teacher.email, name: "Teacher Tang", role: "STUDENT" }
    },
    prisma,
    membership: {
      organizationId: org.id,
      organizationName: "Core Flow Smoke",
      organizationSlug: SMOKE_SLUG,
      role: "TEACHER" as const,
      userId: teacherId
    }
  } as never);

  const uploadJson = JSON.stringify({
    schemaVersion: "arcmath-problem-set-v1",
    set: {
      title: "Smoke Quiz Week 1",
      contest: "PRACTICE",
      year: 2026,
      exam: "smoke-week-1",
      category: "TOPIC_PRACTICE",
      submissionMode: "PER_PROBLEM",
      tutorEnabled: true,
      sourceUrl: "local://smoke",
      summary: "End-to-end smoke quiz."
    },
    problems: [
      {
        number: 1,
        statement: "What is $2 + 3$?",
        statementFormat: "MARKDOWN_LATEX",
        answerFormat: "INTEGER",
        answer: "5",
        difficultyBand: "EASY",
        topicKey: "arithmetic.basic",
        techniqueTags: ["addition"],
        sourceLabel: "Smoke quiz · Q1",
        solutionSketch: "Add the numbers."
      },
      {
        number: 2,
        statement: "Which is the smallest prime?",
        statementFormat: "MARKDOWN_LATEX",
        answerFormat: "MULTIPLE_CHOICE",
        choices: ["1", "2", "3", "5", "7"],
        answer: "B",
        difficultyBand: "EASY",
        topicKey: "number_theory.primes",
        techniqueTags: ["definition"],
        sourceLabel: "Smoke quiz · Q2",
        solutionSketch: "2 is the only even prime."
      }
    ]
  });

  const preview = (await teacherCaller.teacher.uploadPreview({ jsonText: uploadJson })) as {
    isValid: boolean;
    problemCount?: number;
  };
  check("upload preview parses", preview.isValid === true, JSON.stringify(preview).slice(0, 200));
  check(
    "preview reports 2 problems",
    preview.problemCount === 2,
    JSON.stringify(preview).slice(0, 200)
  );

  const commit = (await teacherCaller.teacher.uploadCommit({ jsonText: uploadJson })) as {
    problemSetId: string;
    createdProblems: number;
    updatedProblems: number;
    skippedProblems: number;
  };
  check("upload commit returns id", typeof commit.problemSetId === "string");
  // Either fresh-create (createdProblems = 2) or hitting an existing
  // (contest, year, exam) row from a prior run (updatedProblems = 2)
  // is acceptable — the point is that the JSON's 2 problems made it
  // into the DB this run.
  check(
    "commit reports 2 problems committed (created + updated)",
    commit.createdProblems + commit.updatedProblems === 2,
    JSON.stringify(commit)
  );
  const newProblemSetId = commit.problemSetId;

  const newProblemSet = await prisma.problemSet.findUnique({
    where: { id: newProblemSetId },
    select: { visibility: true, ownerOrganizationId: true, problems: { select: { id: true, number: true, answer: true, answerFormat: true } } }
  });
  check("problem set is ORG_ONLY", newProblemSet?.visibility === "ORG_ONLY");
  check("problem set scoped to teacher's org", newProblemSet?.ownerOrganizationId === org.id);
  check("2 problems persisted", newProblemSet?.problems.length === 2);

  // 4. Teacher assigns the new problem set to the class
  console.log("\n4. Teacher assigns the problem set to the class");
  const assignment = await teacherCaller.teacher.assignments.create({
    classId,
    problemSetId: newProblemSetId,
    title: "Week 1 Homework",
    hintTutorEnabled: true
  });
  check("assignment created", !!assignment.id);
  check("hintTutorEnabled true", assignment.hintTutorEnabled === true);

  // 5. Student answers the problems
  console.log("\n5. Student answers (1 correct, 1 wrong)");
  const studentCaller = appRouter.createCaller({
    session: {
      user: { id: studentId, email: rosterResult.students[0].email, name: "Student Sun", role: "STUDENT" }
    },
    prisma,
    membership: {
      organizationId: org.id,
      organizationName: "Core Flow Smoke",
      organizationSlug: SMOKE_SLUG,
      role: "STUDENT" as const,
      userId: studentId
    }
  } as never);

  // Open a practice run linked to the assignment
  const runResult = (await studentCaller.student.startAssignment({
    assignmentId: assignment.id
  })) as { runId: string; problemSetId: string };
  check("student practice run opened", typeof runResult.runId === "string");
  const runId = runResult.runId;

  const problems = newProblemSet!.problems.sort((a, b) => a.number - b.number);
  const intProblem = problems.find((p) => p.answerFormat === "INTEGER")!;
  const mcProblem = problems.find((p) => p.answerFormat === "MULTIPLE_CHOICE")!;

  // Open ANSWER_ONLY attempts via chooseEntry (creates the draft).
  const intDraft = (await studentCaller.unifiedAttempt.chooseEntry({
    problemId: intProblem.id,
    practiceRunId: runId,
    entryMode: "ANSWER_ONLY"
  })) as { attemptId: string };
  check("integer attempt drafted", typeof intDraft.attemptId === "string");

  const mcDraft = (await studentCaller.unifiedAttempt.chooseEntry({
    problemId: mcProblem.id,
    practiceRunId: runId,
    entryMode: "ANSWER_ONLY"
  })) as { attemptId: string };
  check("mc attempt drafted", typeof mcDraft.attemptId === "string");

  // Submit a CORRECT answer to the integer problem
  const intCorrect = (await studentCaller.unifiedAttempt.submit({
    attemptId: intDraft.attemptId,
    finalAnswer: "5"
  })) as { attempt?: { isCorrect: boolean } };
  check(
    "integer correct submission graded correct",
    intCorrect.attempt?.isCorrect === true,
    JSON.stringify(intCorrect).slice(0, 200)
  );

  // Submit a WRONG answer to the multiple-choice problem
  const mcWrong = (await studentCaller.unifiedAttempt.submit({
    attemptId: mcDraft.attemptId,
    finalAnswer: "C"
  })) as { attempt?: { isCorrect: boolean } };
  check(
    "mc wrong submission graded incorrect",
    mcWrong.attempt?.isCorrect === false,
    JSON.stringify(mcWrong).slice(0, 200)
  );

  // Retry MC with the right answer
  const mcRetryDraft = (await studentCaller.unifiedAttempt.chooseEntry({
    problemId: mcProblem.id,
    practiceRunId: runId,
    entryMode: "ANSWER_ONLY"
  })) as { attemptId: string };
  const mcRight = (await studentCaller.unifiedAttempt.submit({
    attemptId: mcRetryDraft.attemptId,
    finalAnswer: "B"
  })) as { attempt?: { isCorrect: boolean } };
  check(
    "mc correct submission (retry) graded correct",
    mcRight.attempt?.isCorrect === true,
    JSON.stringify(mcRight).slice(0, 200)
  );

  // 6. Teacher checks progress
  console.log("\n6. Teacher checks class assignment progress");
  const progress = await teacherCaller.teacher.assignments.progress({ assignmentId: assignment.id });
  check("progress endpoint returned", !!progress.assignmentId);
  check("1 student row", progress.students.length === 1);
  const studentRow = progress.students[0];
  check("student attempted ≥ 1 problem", (studentRow.attempted ?? 0) >= 1, JSON.stringify(studentRow));
  check("hintTutorEnabled surfaced in progress", progress.hintTutorEnabled === true);

  await cleanup();

  console.log(`\n== Result: ${pass} OK / ${fail} FAIL ==`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Smoke test crashed:", err);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});

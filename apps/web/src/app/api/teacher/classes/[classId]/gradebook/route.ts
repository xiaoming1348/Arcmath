import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  canManageOrganization,
  canTeach,
  getActiveOrganizationMembership
} from "@/lib/organizations";

type RouteContext = {
  params: Promise<{
    classId: string;
  }>;
};

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "number"
        ? String(value)
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function formatScope(scope: {
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceProblemStart: string | null;
  sourceProblemEnd: string | null;
}): string {
  const pages =
    scope.sourcePageStart != null && scope.sourcePageEnd != null
      ? scope.sourcePageStart === scope.sourcePageEnd
        ? `page ${scope.sourcePageStart}`
        : `pages ${scope.sourcePageStart}-${scope.sourcePageEnd}`
      : scope.sourcePageStart != null
        ? `page ${scope.sourcePageStart}`
        : "";
  const problems =
    scope.sourceProblemStart && scope.sourceProblemEnd
      ? scope.sourceProblemStart === scope.sourceProblemEnd
        ? `problem ${scope.sourceProblemStart}`
        : `problems ${scope.sourceProblemStart}-${scope.sourceProblemEnd}`
      : scope.sourceProblemStart
        ? `problem ${scope.sourceProblemStart}`
        : "";
  return [pages, problems].filter(Boolean).join(", ");
}

function safeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "class";
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  if (!membership || !canTeach(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { classId } = await context.params;
  const klass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      createdByUserId: true,
      assignedTeacherId: true,
      enrollments: {
        where: { role: "STUDENT" },
        select: {
          userId: true,
          user: { select: { name: true, email: true } }
        },
        orderBy: { createdAt: "asc" }
      },
      assignments: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          problemSet: {
            select: {
              title: true,
              _count: { select: { problems: true } }
            }
          },
          practiceRuns: {
            select: {
              userId: true,
              startedAt: true,
              completedAt: true,
              attempts: {
                where: { status: "SUBMITTED" },
                select: { problemId: true, isCorrect: true }
              }
            }
          }
        },
        orderBy: { assignedAt: "asc" }
      },
      resourceAssignments: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          sourcePageStart: true,
          sourcePageEnd: true,
          sourceProblemStart: true,
          sourceProblemEnd: true,
          resource: { select: { title: true } },
          submissions: {
            select: {
              studentUserId: true,
              submittedAt: true,
              id: true,
              attachmentFilename: true,
              gradeScore: true,
              gradeMax: true,
              feedback: true,
              gradedAt: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!klass || klass.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSchoolAdmin = canManageOrganization(membership.role);
  const isAssignedTeacher = klass.assignedTeacherId === session.user.id;
  const isCreator = klass.createdByUserId === session.user.id;
  if (!isSchoolAdmin && !isAssignedTeacher && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = [
    "student_name",
    "student_email",
    "assignment_type",
    "assignment_title",
    "source",
    "scope",
    "due_at",
    "status",
    "score",
    "max_score",
    "percent",
    "attachment",
    "submitted_at",
    "graded_at",
    "feedback"
  ];

  const rows: string[] = [csvRow(headers)];
  const now = new Date();

  for (const assignment of klass.assignments) {
    const runsByUser = new Map(
      assignment.practiceRuns.map((run) => [run.userId, run])
    );
    const totalProblems = assignment.problemSet._count.problems;
    for (const enrollment of klass.enrollments) {
      const run = runsByUser.get(enrollment.userId);
      const uniqueAttempted = run
        ? new Set(run.attempts.map((attempt) => attempt.problemId)).size
        : 0;
      const correct =
        run?.attempts.filter((attempt) => attempt.isCorrect).length ?? 0;
      const status = run?.completedAt
        ? "COMPLETED"
        : run
          ? "IN_PROGRESS"
          : assignment.dueAt && assignment.dueAt < now
            ? "OVERDUE"
            : "NOT_STARTED";
      rows.push(
        csvRow([
          enrollment.user.name ?? "",
          enrollment.user.email,
          "PROBLEM_SET",
          assignment.title,
          assignment.problemSet.title,
          "",
          assignment.dueAt,
          status,
          correct,
          totalProblems,
          totalProblems > 0 ? Math.round((correct / totalProblems) * 100) : "",
          "",
          run?.completedAt ?? (uniqueAttempted > 0 ? run?.startedAt : null),
          "",
          ""
        ])
      );
    }
  }

  for (const assignment of klass.resourceAssignments) {
    const submissionsByUser = new Map(
      assignment.submissions.map((submission) => [
        submission.studentUserId,
        submission
      ])
    );
    const scope = formatScope(assignment);
    for (const enrollment of klass.enrollments) {
      const submission = submissionsByUser.get(enrollment.userId);
      const status = submission?.gradedAt
        ? "GRADED"
        : submission
          ? "SUBMITTED"
          : assignment.dueAt && assignment.dueAt < now
            ? "OVERDUE"
            : "NOT_SUBMITTED";
      const score = submission?.gradeScore ?? null;
      const maxScore = submission?.gradeMax ?? null;
      rows.push(
        csvRow([
          enrollment.user.name ?? "",
          enrollment.user.email,
          "PDF",
          assignment.title,
          assignment.resource.title,
          scope,
          assignment.dueAt,
          status,
          score,
          maxScore,
          score != null && maxScore != null && maxScore > 0
            ? Math.round((score / maxScore) * 100)
            : "",
          submission?.attachmentFilename ?? "",
          submission?.submittedAt ?? null,
          submission?.gradedAt ?? null,
          submission?.feedback ?? ""
        ])
      );
    }
  }

  const csv = `${rows.join("\n")}\n`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilenamePart(klass.name)}-gradebook.csv"`
    }
  });
}

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@arcmath/db";
import { protectedProcedure, router } from "@/lib/trpc/server";
import { logAudit } from "@/lib/audit";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";

/**
 * Student-facing surface: list classes the student is in, upcoming and
 * completed assignments, the join-by-code flow, and "open this
 * assignment in the practice session" helper.
 *
 * Scoped by `ctx.session.user.id` — we don't require a membership
 * because a brand-new student can land here with just a user row and a
 * join code, then create their enrollment. Once they're enrolled,
 * everything else flows from the class relation.
 *
 * We deliberately don't duplicate the PracticeRun → ProblemAttempt
 * flow that `/problems/set/[problemSetId]` already handles. The
 * student home produces a deep link into that page (with
 * `?assignmentId=…` query so the page records the assignment link).
 */

const joinClassInput = z.object({
  joinCode: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .transform((s) => s.toUpperCase())
});

const assignmentIdInput = z.object({ assignmentId: z.string().min(1) });

const submitResourceAssignmentInput = z.object({
  assignmentId: z.string().min(1),
  answerText: z.string().trim().max(20000),
  attachment: z
    .object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(120),
      base64: z.string().min(1).max(12_000_000)
    })
    .optional()
}).refine((value) => value.answerText.length > 0 || value.attachment != null, {
  message: "Enter an answer or attach a file.",
  path: ["answerText"]
});

const MAX_SUBMISSION_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_SUBMISSION_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function decodeSubmissionAttachment(input: {
  filename: string;
  mimeType: string;
  base64: string;
}): { filename: string; mimeType: string; bytes: Buffer } {
  const mimeType = input.mimeType.toLowerCase();
  const filename = input.filename.trim();
  if (!ALLOWED_SUBMISSION_ATTACHMENT_MIME_TYPES.has(mimeType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Attach a PDF, JPG, PNG, or WebP file."
    });
  }
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length <= 0 || bytes.length > MAX_SUBMISSION_ATTACHMENT_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Attachment must be between 1 byte and 8 MB."
    });
  }
  return { filename, mimeType, bytes };
}

export const studentRouter = router({
  /**
   * Summary for the student home header: which school/classes they
   * belong to, and counters for how many assignments are due soon vs.
   * overdue vs. completed. Small — meant to render above the detail
   * list, not replace it.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id;
    const enrollments = await ctx.prisma.enrollment.findMany({
      where: { userId },
      select: {
        id: true,
        classId: true,
        createdAt: true,
        class: {
          select: {
            id: true,
            name: true,
            organization: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    // One-shot aggregate so we don't make N queries per class.
    const classIds = enrollments.map((e) => e.classId);
    const now = new Date();

    const [
      totalAssignments,
      overdue,
      upcoming,
      runsCompleted,
      resourceAssignments,
      resourceSubmissions
    ] =
      classIds.length === 0
        ? [0, 0, 0, 0, [], []]
        : await Promise.all([
            ctx.prisma.classAssignment.count({
              where: { classId: { in: classIds } }
            }),
            ctx.prisma.classAssignment.count({
              where: {
                classId: { in: classIds },
                dueAt: { lt: now },
                // Overdue only if the student hasn't finished it yet.
                NOT: {
                  practiceRuns: {
                    some: { userId, completedAt: { not: null } }
                  }
                }
              }
            }),
            ctx.prisma.classAssignment.count({
              where: {
                classId: { in: classIds },
                dueAt: { gte: now }
              }
            }),
            ctx.prisma.practiceRun.count({
              where: {
                userId,
                classAssignmentId: { not: null },
                completedAt: { not: null }
              }
            }),
            ctx.prisma.resourceAssignment.findMany({
              where: { classId: { in: classIds } },
              select: { id: true, dueAt: true }
            }),
            ctx.prisma.resourceAssignmentSubmission.findMany({
              where: {
                studentUserId: userId,
                assignment: { classId: { in: classIds } }
              },
              select: { assignmentId: true, gradedAt: true }
            })
          ]);

    const submittedResourceAssignmentIds = new Set(
      resourceSubmissions.map((submission) => submission.assignmentId)
    );
    const gradedResourceCount = resourceSubmissions.filter(
      (submission) => submission.gradedAt
    ).length;
    const resourceOverdueCount = resourceAssignments.filter(
      (assignment) =>
        !submittedResourceAssignmentIds.has(assignment.id) &&
        assignment.dueAt != null &&
        assignment.dueAt < now
    ).length;
    const resourceUpcomingCount = resourceAssignments.filter(
      (assignment) =>
        !submittedResourceAssignmentIds.has(assignment.id) &&
        assignment.dueAt != null &&
        assignment.dueAt >= now
    ).length;

    return {
      classes: enrollments.map((e) => ({
        classId: e.classId,
        className: e.class.name,
        organizationName: e.class.organization?.name ?? null,
        joinedAt: e.createdAt
      })),
      totalAssignments: totalAssignments + resourceAssignments.length,
      overdueCount: overdue + resourceOverdueCount,
      upcomingCount: upcoming + resourceUpcomingCount,
      completedCount: runsCompleted + resourceSubmissions.length,
      gradedResourceCount
    };
  }),

  /**
   * Flat, chronologically sorted list of assignments visible to the
   * student across all their classes. We split by status so the UI
   * can render "upcoming / in-progress / completed / overdue" without
   * a second pass. Joined with the student's own run state (started,
   * completed, raw progress counts) so the card can show a progress
   * bar and a sensible CTA ("Start", "Continue", "Review").
   */
  assignments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id;

    const enrollments = await ctx.prisma.enrollment.findMany({
      where: { userId },
      select: { classId: true }
    });
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) {
      return { items: [], resourceItems: [] };
    }

    const [assignments, resourceAssignments] = await Promise.all([
      ctx.prisma.classAssignment.findMany({
        where: {
          classId: { in: classIds },
          // Respect teacher's openAt gate: don't show future-opening
          // assignments until they're open. openAt null ⇒ always open.
          OR: [{ openAt: null }, { openAt: { lte: new Date() } }]
        },
        orderBy: [{ dueAt: "asc" }, { assignedAt: "desc" }],
        select: {
          id: true,
          title: true,
          instructions: true,
          assignedAt: true,
          openAt: true,
          dueAt: true,
          class: { select: { id: true, name: true } },
          problemSet: {
            select: {
              id: true,
              title: true,
              contest: true,
              year: true,
              exam: true,
              _count: { select: { problems: true } }
            }
          },
          // Pull the caller's own run (at most one per assignment — we
          // reuse incomplete runs in /problems/set/[id]).
          practiceRuns: {
            where: { userId },
            select: {
              id: true,
              startedAt: true,
              completedAt: true,
              attempts: {
                where: { status: "SUBMITTED" },
                select: { isCorrect: true, problemId: true }
              },
              learningReportSnapshot: { select: { id: true } }
            },
            orderBy: { startedAt: "desc" },
            take: 1
          }
        }
      }),
      ctx.prisma.resourceAssignment.findMany({
        where: { classId: { in: classIds } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          instructions: true,
          sourcePageStart: true,
          sourcePageEnd: true,
          sourceProblemStart: true,
          sourceProblemEnd: true,
          studentPrompt: true,
          dueAt: true,
          allowLateSubmissions: true,
          createdAt: true,
          class: { select: { id: true, name: true } },
          resource: {
            select: {
              id: true,
              title: true,
              attachmentFilename: true
            }
          },
          submissions: {
            where: { studentUserId: userId },
            select: {
              id: true,
              answerText: true,
              attachmentFilename: true,
              attachmentMimeType: true,
              attachmentSize: true,
              submittedAt: true,
              gradeScore: true,
              gradeMax: true,
              feedback: true,
              gradedAt: true
            },
            take: 1
          }
        }
      })
    ]);

    const now = new Date();
    const items = assignments.map((a) => {
      const run = a.practiceRuns[0] ?? null;
      const attempted = run ? new Set(run.attempts.map((x) => x.problemId)).size : 0;
      const correct = run?.attempts.filter((x) => x.isCorrect).length ?? 0;
      const totalProblems = a.problemSet._count.problems;
      const completed = Boolean(run?.completedAt);
      const overdue = !completed && a.dueAt != null && a.dueAt < now;
      const status = completed
        ? ("COMPLETED" as const)
        : overdue
          ? ("OVERDUE" as const)
          : run
            ? ("IN_PROGRESS" as const)
            : ("NOT_STARTED" as const);
      return {
        assignmentId: a.id,
        title: a.title,
        instructions: a.instructions,
        assignedAt: a.assignedAt,
        openAt: a.openAt,
        dueAt: a.dueAt,
        classId: a.class.id,
        className: a.class.name,
        problemSetId: a.problemSet.id,
        problemSetTitle: a.problemSet.title,
        contest: a.problemSet.contest,
        year: a.problemSet.year,
        exam: a.problemSet.exam,
        totalProblems,
        status,
        runId: run?.id ?? null,
        startedAt: run?.startedAt ?? null,
        completedAt: run?.completedAt ?? null,
        attempted,
        correct,
        snapshotId: run?.learningReportSnapshot?.id ?? null
      };
    });

    const resourceItems = resourceAssignments.map((assignment) => {
      const submission = assignment.submissions[0] ?? null;
      const overdue =
        !submission &&
        assignment.dueAt != null &&
        assignment.dueAt < now &&
        !assignment.allowLateSubmissions;
      const status = submission?.gradedAt
        ? ("GRADED" as const)
        : submission
          ? ("SUBMITTED" as const)
          : overdue
            ? ("OVERDUE" as const)
            : ("NOT_SUBMITTED" as const);

      return {
        assignmentId: assignment.id,
        title: assignment.title,
        instructions: assignment.instructions,
        sourcePageStart: assignment.sourcePageStart,
        sourcePageEnd: assignment.sourcePageEnd,
        sourceProblemStart: assignment.sourceProblemStart,
        sourceProblemEnd: assignment.sourceProblemEnd,
        studentPrompt: assignment.studentPrompt,
        dueAt: assignment.dueAt,
        allowLateSubmissions: assignment.allowLateSubmissions,
        classId: assignment.class.id,
        className: assignment.class.name,
        resourceId: assignment.resource.id,
        resourceTitle: assignment.resource.title,
        resourceFilename: assignment.resource.attachmentFilename,
        resourceDownloadUrl: `/api/org-resources/${assignment.resource.id}/download`,
        status,
        submission
      };
    });

    return { items, resourceItems };
  }),

  /**
   * Join a class via a teacher-generated 6-char code. Creates an
   * enrollment row (and a school membership as STUDENT if the student
   * isn't already in that school — pilot flow: the teacher hands out
   * a code, the student signs up, code adds them to the right class).
   */
  joinClass: protectedProcedure
    .input(joinClassInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const klass = await ctx.prisma.class.findUnique({
        where: { joinCode: input.joinCode },
        select: {
          id: true,
          name: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              maxStudentSeats: true
            }
          }
        }
      });
      if (!klass || !klass.organization || !klass.organizationId) {
        // Legacy rows without a tenant are pilot-era dev data. We
        // deliberately refuse to let a student enroll into an
        // untenanted class — safer to force the teacher to recreate
        // the class under their school first.
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid join code"
        });
      }
      const classOrganizationId = klass.organizationId;
      const classOrganization = klass.organization;

      // Guardrail: already in this class → no-op OK.
      const existing = await ctx.prisma.enrollment.findUnique({
        where: { userId_classId: { classId: klass.id, userId } },
        select: { id: true }
      });
      if (existing) {
        return {
          classId: klass.id,
          className: klass.name,
          alreadyEnrolled: true as const
        };
      }

      // Membership: student must belong to the school to join one of
      // its classes. If they already have an ACTIVE membership in a
      // *different* school we refuse (multi-tenant isolation).
      const anyMembership = await ctx.prisma.organizationMembership.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { id: true, organizationId: true, role: true }
      });
      if (anyMembership && anyMembership.organizationId !== classOrganizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You're already in another school on ArcMath. Ask your teacher or contact support to switch schools."
        });
      }

      // Seat check: only count the tenant we're about to join.
      const activeStudents = await ctx.prisma.organizationMembership.count({
        where: {
          organizationId: classOrganizationId,
          role: "STUDENT",
          status: "ACTIVE"
        }
      });
      if (!anyMembership && activeStudents >= classOrganization.maxStudentSeats) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This school is at its student seat limit. Ask your teacher or school admin to upgrade."
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        if (!anyMembership) {
          await tx.organizationMembership.create({
            data: {
              organizationId: classOrganizationId,
              userId,
              role: "STUDENT",
              status: "ACTIVE"
            }
          });
        }
        try {
          await tx.enrollment.create({
            data: { classId: klass.id, userId }
          });
        } catch (err) {
          // A concurrent join could have beaten us here; that's fine.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            return;
          }
          throw err;
        }
      });

      await logAudit(
        ctx.prisma,
        { userId, organizationId: classOrganizationId },
        {
          action: "student.class.join",
          targetType: "Class",
          targetId: klass.id,
          payload: { createdMembership: !anyMembership }
        }
      );

      return {
        classId: klass.id,
        className: klass.name,
        alreadyEnrolled: false as const
      };
    }),

  resourceAssignments: router({
    submit: protectedProcedure
      .input(submitResourceAssignmentInput)
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session!.user.id;
        const assignment = await ctx.prisma.resourceAssignment.findUnique({
          where: { id: input.assignmentId },
          select: {
            id: true,
            organizationId: true,
            classId: true,
            dueAt: true,
            allowLateSubmissions: true,
            class: {
              select: {
                organizationId: true,
                enrollments: {
                  where: { userId },
                  select: { id: true }
                }
              }
            }
          }
        });
        if (!assignment) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (assignment.class.enrollments.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You're not enrolled in this class"
          });
        }
        if (
          assignment.dueAt &&
          assignment.dueAt < new Date() &&
          !assignment.allowLateSubmissions
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This assignment is past due"
          });
        }

        const decodedAttachment = input.attachment
          ? decodeSubmissionAttachment(input.attachment)
          : null;

        const submission = await ctx.prisma.resourceAssignmentSubmission.upsert({
          where: {
            assignmentId_studentUserId: {
              assignmentId: assignment.id,
              studentUserId: userId
            }
          },
          create: {
            assignmentId: assignment.id,
            studentUserId: userId,
            answerText: input.answerText,
            submittedAt: new Date()
          },
          update: {
            answerText: input.answerText,
            submittedAt: new Date(),
            gradeScore: null,
            feedback: null,
            gradedAt: null,
            gradedByUserId: null
          },
          select: {
            id: true,
            answerText: true,
            attachmentFilename: true,
            attachmentMimeType: true,
            attachmentSize: true,
            submittedAt: true
          }
        });

        let returnedSubmission = submission;
        if (decodedAttachment) {
          const storage = getOrganizationResourceStorage();
          const stored = await storage.putFile(
            `resource-submission-${submission.id}`,
            decodedAttachment.filename,
            decodedAttachment.mimeType,
            decodedAttachment.bytes
          );
          returnedSubmission = await ctx.prisma.resourceAssignmentSubmission.update({
            where: { id: submission.id },
            data: {
              attachmentLocator: stored.locator,
              attachmentFilename: decodedAttachment.filename,
              attachmentMimeType: decodedAttachment.mimeType,
              attachmentSize: stored.size,
              attachmentSha256: stored.sha256
            },
            select: {
              id: true,
              answerText: true,
              attachmentFilename: true,
              attachmentMimeType: true,
              attachmentSize: true,
              submittedAt: true
            }
          });
        }

        await logAudit(
          ctx.prisma,
          { userId, organizationId: assignment.organizationId },
          {
            action: "resource.assignment.submit",
            targetType: "ResourceAssignmentSubmission",
            targetId: submission.id,
            payload: {
              assignmentId: assignment.id,
              hasAttachment: Boolean(decodedAttachment)
            }
          }
        );

        return returnedSubmission;
      })
  }),

  /**
   * Produce the deep link target for a given assignment: either the
   * existing in-progress run or a fresh one. The caller then redirects
   * to `/problems/set/[problemSetId]?runId=…`. The existing page already
   * renders the practice flow; we just stitch the class-assignment link
   * onto the run so the teacher dashboard sees the attempt.
   */
  startAssignment: protectedProcedure
    .input(assignmentIdInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const assignment = await ctx.prisma.classAssignment.findUnique({
        where: { id: input.assignmentId },
        select: {
          id: true,
          classId: true,
          openAt: true,
          problemSetId: true,
          class: {
            select: {
              organizationId: true,
              enrollments: { where: { userId }, select: { id: true } }
            }
          }
        }
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });
      if (assignment.class.enrollments.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You're not enrolled in this class"
        });
      }
      if (assignment.openAt && assignment.openAt > new Date()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This assignment hasn't opened yet"
        });
      }

      // Find or create a run. We reuse the most recent incomplete run,
      // same as the diagnostic page does for self-directed sets.
      const existing = await ctx.prisma.practiceRun.findFirst({
        where: {
          userId,
          problemSetId: assignment.problemSetId,
          classAssignmentId: assignment.id,
          completedAt: null
        },
        orderBy: { startedAt: "desc" },
        select: { id: true }
      });
      if (existing) {
        return {
          runId: existing.id,
          problemSetId: assignment.problemSetId
        };
      }
      const created = await ctx.prisma.practiceRun.create({
        data: {
          userId,
          problemSetId: assignment.problemSetId,
          classAssignmentId: assignment.id,
          organizationId: assignment.class.organizationId
        },
        select: { id: true }
      });
      return { runId: created.id, problemSetId: assignment.problemSetId };
    })
});

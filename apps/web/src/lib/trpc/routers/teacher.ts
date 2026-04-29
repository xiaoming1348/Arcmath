import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@arcmath/db";
import {
  router,
  teacherProcedure,
  schoolAdminProcedure
} from "@/lib/trpc/server";
import { canManageOrganization } from "@/lib/organizations";
import {
  buildTeacherImportPreview,
  commitTeacherImportFromJson
} from "@/lib/imports/teacher-import";
import { schedulePreprocessInBackground } from "@/lib/preprocessing";
import { logAudit } from "@/lib/audit";

/**
 * Teacher-facing surface: classes, students, assignments.
 *
 * Every mutation here is tenant-scoped by `ctx.membership.organizationId`
 * — a teacher can only see + modify their own school's data. School
 * admins (OWNER/ADMIN role inside the org) can see everyone's classes;
 * pure teachers only see their own.
 *
 * Seat enforcement happens here, not at the DB level, so we can return
 * a friendly message to the teacher ("You have 50/50 student seats —
 * ask your school admin to upgrade") instead of a raw constraint
 * violation.
 */

// --- helpers ---------------------------------------------------------------

/** 6-char alphanumeric join code, omitting confusable chars (0/O, 1/I). */
function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Throws FORBIDDEN if the teacher isn't the class creator AND isn't a
 *  school-admin. Used for class-level mutations. */
async function assertCanManageClass(
  prisma: Prisma.TransactionClient | typeof import("@arcmath/db").prisma,
  args: {
    classId: string;
    organizationId: string;
    actingUserId: string;
    actingRole: "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";
  }
) {
  const klass = await prisma.class.findUnique({
    where: { id: args.classId },
    select: { organizationId: true, createdByUserId: true }
  });
  if (!klass) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
  }
  if (klass.organizationId !== args.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Class is not in your school" });
  }
  if (canManageOrganization(args.actingRole)) return; // school-admin/owner
  if (klass.createdByUserId === args.actingUserId) return; // creator teacher
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only the class owner or a school admin can modify this class"
  });
}

// --- schemas ---------------------------------------------------------------

const classIdInput = z.object({ classId: z.string().min(1) });

const createClassInput = z.object({
  name: z.string().min(1).max(120)
});

const updateClassInput = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  regenerateJoinCode: z.boolean().optional()
});

const inviteStudentsInput = z.object({
  classId: z.string().min(1),
  students: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(120).optional()
      })
    )
    .min(1)
    .max(100)
});

const createAssignmentInput = z.object({
  classId: z.string().min(1),
  problemSetId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(4000).optional(),
  openAt: z.date().optional(),
  dueAt: z.date().optional(),
  // Per-assignment hint-tutor toggle (Batch-3). Default off; the
  // teacher must opt in. When false, the AI hint panel is hidden in
  // the student attempt UI; when true, ProblemHintUsage rows record
  // each request so the report shows hint counts.
  hintTutorEnabled: z.boolean().optional()
});

const deleteAssignmentInput = z.object({ assignmentId: z.string().min(1) });

// ===========================================================================

export const teacherRouter = router({
  /** Summary card for the teacher home: how many classes, students,
   *  assignments, and how many assignments have anything pending. */
  overview: teacherProcedure.query(async ({ ctx }) => {
    const orgId = ctx.membership!.organizationId;
    const myUserId = ctx.session.user.id;
    const isSchoolAdmin = canManageOrganization(ctx.membership!.role);

    const classFilter = isSchoolAdmin
      ? { organizationId: orgId }
      : { organizationId: orgId, createdByUserId: myUserId };

    const [classCount, studentSeats, teacherSeats, upcomingDue] = await Promise.all([
      ctx.prisma.class.count({ where: classFilter }),
      ctx.prisma.organizationMembership.count({
        where: { organizationId: orgId, role: "STUDENT", status: "ACTIVE" }
      }),
      ctx.prisma.organizationMembership.count({
        where: { organizationId: orgId, role: "TEACHER", status: "ACTIVE" }
      }),
      ctx.prisma.classAssignment.count({
        where: {
          class: classFilter,
          dueAt: { gte: new Date() }
        }
      })
    ]);

    const org = await ctx.prisma.organization.findUnique({
      where: { id: orgId },
      select: { maxStudentSeats: true, maxTeacherSeats: true, name: true }
    });

    return {
      organizationName: org?.name ?? ctx.membership!.organizationName,
      classCount,
      studentSeats: { used: studentSeats, max: org?.maxStudentSeats ?? 50 },
      teacherSeats: { used: teacherSeats, max: org?.maxTeacherSeats ?? 3 },
      upcomingDueCount: upcomingDue
    };
  }),

  // -------------------------------------------------------------- classes
  classes: router({
    list: teacherProcedure.query(async ({ ctx }) => {
      const orgId = ctx.membership!.organizationId;
      const myUserId = ctx.session.user.id;
      const isSchoolAdmin = canManageOrganization(ctx.membership!.role);

      const rows = await ctx.prisma.class.findMany({
        where: isSchoolAdmin
          ? { organizationId: orgId }
          : { organizationId: orgId, createdByUserId: myUserId },
        select: {
          id: true,
          name: true,
          joinCode: true,
          createdAt: true,
          createdByUserId: true,
          createdByUser: { select: { name: true, email: true } },
          _count: { select: { enrollments: true, assignments: true } }
        },
        orderBy: { createdAt: "desc" }
      });

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        joinCode: row.joinCode,
        createdAt: row.createdAt,
        teacherName: row.createdByUser?.name ?? row.createdByUser?.email ?? null,
        isMine: row.createdByUserId === myUserId,
        studentCount: row._count.enrollments,
        assignmentCount: row._count.assignments
      }));
    }),

    get: teacherProcedure.input(classIdInput).query(async ({ ctx, input }) => {
      const orgId = ctx.membership!.organizationId;
      const klass = await ctx.prisma.class.findUnique({
        where: { id: input.classId },
        select: {
          id: true,
          name: true,
          joinCode: true,
          createdAt: true,
          organizationId: true,
          createdByUserId: true,
          enrollments: {
            select: {
              id: true,
              userId: true,
              createdAt: true,
              user: {
                select: { id: true, name: true, email: true, role: true }
              }
            },
            orderBy: { createdAt: "asc" }
          },
          assignments: {
            select: {
              id: true,
              title: true,
              instructions: true,
              assignedAt: true,
              openAt: true,
              dueAt: true,
              problemSet: {
                select: {
                  id: true,
                  title: true,
                  _count: { select: { problems: true } }
                }
              }
            },
            orderBy: { assignedAt: "desc" }
          }
        }
      });
      if (!klass || klass.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const students = klass.enrollments
        .filter((e) => e.user.role !== "TEACHER")
        .map((e) => ({
          enrollmentId: e.id,
          userId: e.user.id,
          name: e.user.name,
          email: e.user.email,
          enrolledAt: e.createdAt
        }));
      return {
        id: klass.id,
        name: klass.name,
        joinCode: klass.joinCode,
        createdAt: klass.createdAt,
        createdByUserId: klass.createdByUserId,
        students,
        assignments: klass.assignments.map((a) => ({
          id: a.id,
          title: a.title,
          instructions: a.instructions,
          assignedAt: a.assignedAt,
          openAt: a.openAt,
          dueAt: a.dueAt,
          problemSetId: a.problemSet.id,
          problemSetTitle: a.problemSet.title,
          problemCount: a.problemSet._count.problems
        }))
      };
    }),

    create: teacherProcedure
      .input(createClassInput)
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.membership!.organizationId;
        // Generate a unique joinCode. Collision probability is ~1/(32^6) so
        // we just retry a few times if the unique index fires.
        for (let attempt = 0; attempt < 5; attempt++) {
          const joinCode = generateJoinCode();
          try {
            const created = await ctx.prisma.class.create({
              data: {
                name: input.name,
                organizationId: orgId,
                createdByUserId: ctx.session.user.id,
                joinCode
              },
              select: { id: true, name: true, joinCode: true, createdAt: true }
            });
            await logAudit(
              ctx.prisma,
              { userId: ctx.session.user.id, organizationId: orgId },
              {
                action: "teacher.class.create",
                targetType: "Class",
                targetId: created.id,
                payload: { name: created.name }
              }
            );
            return created;
          } catch (err) {
            if (
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === "P2002"
            ) {
              continue; // joinCode collision — retry
            }
            throw err;
          }
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not allocate a unique join code; please try again"
        });
      }),

    update: teacherProcedure
      .input(updateClassInput)
      .mutation(async ({ ctx, input }) => {
        await assertCanManageClass(ctx.prisma, {
          classId: input.classId,
          organizationId: ctx.membership!.organizationId,
          actingUserId: ctx.session.user.id,
          actingRole: ctx.membership!.role
        });
        const data: { name?: string; joinCode?: string } = {};
        if (input.name) data.name = input.name;
        if (input.regenerateJoinCode) data.joinCode = generateJoinCode();
        const updated = await ctx.prisma.class.update({
          where: { id: input.classId },
          data,
          select: { id: true, name: true, joinCode: true }
        });
        await logAudit(
          ctx.prisma,
          {
            userId: ctx.session.user.id,
            organizationId: ctx.membership!.organizationId
          },
          {
            action: input.regenerateJoinCode
              ? "teacher.class.regenerate_join_code"
              : "teacher.class.update",
            targetType: "Class",
            targetId: updated.id,
            payload: {
              name: input.name ?? undefined,
              regenerateJoinCode: input.regenerateJoinCode ?? false
            }
          }
        );
        return updated;
      }),

    delete: schoolAdminProcedure
      .input(classIdInput)
      .mutation(async ({ ctx, input }) => {
        // Only school-admin can delete — even the teacher who made the
        // class can't, to avoid accidental loss of student work.
        const klass = await ctx.prisma.class.findUnique({
          where: { id: input.classId },
          select: { organizationId: true }
        });
        if (!klass || klass.organizationId !== ctx.membership!.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await ctx.prisma.class.delete({ where: { id: input.classId } });
        await logAudit(
          ctx.prisma,
          {
            userId: ctx.session.user.id,
            organizationId: ctx.membership!.organizationId
          },
          {
            action: "teacher.class.delete",
            targetType: "Class",
            targetId: input.classId
          }
        );
        return { ok: true as const };
      }),

    /**
     * Bulk-invite students into a class. For each email we either:
     *   - reuse the existing User if their email is already in our DB
     *     AND they're in the same school (adds membership + enrollment);
     *   - create a new User with a disabled password (they set one when
     *     they first claim their account via the join-code flow).
     *
     * Enforces maxStudentSeats against the org's current ACTIVE student
     * count. Partial success: skipped/failed rows come back in the
     * response so the teacher can retry.
     */
    inviteStudents: teacherProcedure
      .input(inviteStudentsInput)
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.membership!.organizationId;
        await assertCanManageClass(ctx.prisma, {
          classId: input.classId,
          organizationId: orgId,
          actingUserId: ctx.session.user.id,
          actingRole: ctx.membership!.role
        });

        const org = await ctx.prisma.organization.findUnique({
          where: { id: orgId },
          select: { maxStudentSeats: true }
        });
        const maxStudentSeats = org?.maxStudentSeats ?? 50;

        const activeStudentCount = await ctx.prisma.organizationMembership.count({
          where: { organizationId: orgId, role: "STUDENT", status: "ACTIVE" }
        });

        const remaining = Math.max(0, maxStudentSeats - activeStudentCount);
        const toProcess = input.students.slice(0, remaining);
        const overflow = input.students.slice(remaining);

        const results: Array<{
          email: string;
          status: "ADDED" | "ALREADY_IN_CLASS" | "SEAT_FULL" | "EMAIL_IN_OTHER_ORG";
        }> = [];

        for (const entry of toProcess) {
          const email = entry.email.toLowerCase().trim();
          const existingUser = await ctx.prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              organizationMemberships: {
                where: { status: "ACTIVE" },
                select: { organizationId: true }
              }
            }
          });

          let userId: string;
          if (existingUser) {
            const otherOrg = existingUser.organizationMemberships.find(
              (m) => m.organizationId !== orgId
            );
            if (otherOrg) {
              results.push({ email, status: "EMAIL_IN_OTHER_ORG" });
              continue;
            }
            userId = existingUser.id;
          } else {
            const created = await ctx.prisma.user.create({
              data: {
                email,
                name: entry.name ?? null,
                role: "STUDENT",
                // Placeholder — real password is set via the join-code
                // self-claim flow. We use a sentinel bcrypt-shaped string
                // so bcrypt.compare always returns false until claimed.
                passwordHash: "invite:unclaimed"
              },
              select: { id: true }
            });
            userId = created.id;
          }

          // Idempotent: membership + enrollment.
          await ctx.prisma.organizationMembership.upsert({
            where: {
              organizationId_userId: { organizationId: orgId, userId }
            },
            create: {
              organizationId: orgId,
              userId,
              role: "STUDENT",
              status: "ACTIVE"
            },
            update: { status: "ACTIVE", role: "STUDENT" }
          });

          const existingEnrollment = await ctx.prisma.enrollment.findUnique({
            where: { userId_classId: { userId, classId: input.classId } }
          });
          if (existingEnrollment) {
            results.push({ email, status: "ALREADY_IN_CLASS" });
            continue;
          }
          await ctx.prisma.enrollment.create({
            data: { userId, classId: input.classId, role: "STUDENT" }
          });
          results.push({ email, status: "ADDED" });
        }

        for (const entry of overflow) {
          results.push({
            email: entry.email.toLowerCase().trim(),
            status: "SEAT_FULL"
          });
        }

        const addedCount = results.filter((r) => r.status === "ADDED").length;
        if (addedCount > 0) {
          await logAudit(
            ctx.prisma,
            { userId: ctx.session.user.id, organizationId: orgId },
            {
              action: "teacher.class.invite_students",
              targetType: "Class",
              targetId: input.classId,
              payload: {
                addedCount,
                totalSubmitted: input.students.length
              }
            }
          );
        }

        return {
          seats: {
            used: activeStudentCount + addedCount,
            max: maxStudentSeats
          },
          results
        };
      }),

    removeStudent: teacherProcedure
      .input(
        z.object({
          classId: z.string().min(1),
          enrollmentId: z.string().min(1)
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanManageClass(ctx.prisma, {
          classId: input.classId,
          organizationId: ctx.membership!.organizationId,
          actingUserId: ctx.session.user.id,
          actingRole: ctx.membership!.role
        });
        // Enrollment fence: ensure it actually belongs to this class.
        const enrollment = await ctx.prisma.enrollment.findUnique({
          where: { id: input.enrollmentId },
          select: { classId: true }
        });
        if (!enrollment || enrollment.classId !== input.classId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await ctx.prisma.enrollment.delete({
          where: { id: input.enrollmentId }
        });
        await logAudit(
          ctx.prisma,
          {
            userId: ctx.session.user.id,
            organizationId: ctx.membership!.organizationId
          },
          {
            action: "teacher.class.remove_student",
            targetType: "Enrollment",
            targetId: input.enrollmentId,
            payload: { classId: input.classId }
          }
        );
        return { ok: true as const };
      })
  }),

  // ---------------------------------------------------------- assignments
  assignments: router({
    /** Per-student progress on one assignment, for the class dashboard. */
    progress: teacherProcedure
      .input(z.object({ assignmentId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const orgId = ctx.membership!.organizationId;
        const assignment = await ctx.prisma.classAssignment.findUnique({
          where: { id: input.assignmentId },
          select: {
            id: true,
            title: true,
            dueAt: true,
            classId: true,
            problemSetId: true,
            hintTutorEnabled: true,
            class: {
              select: {
                organizationId: true,
                enrollments: {
                  select: {
                    userId: true,
                    user: { select: { id: true, name: true, email: true } }
                  }
                }
              }
            },
            problemSet: {
              select: { _count: { select: { problems: true } } }
            }
          }
        });
        if (!assignment || assignment.class.organizationId !== orgId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const totalProblems = assignment.problemSet._count.problems;

        // Aggregate per student: most recent run + count of correct attempts.
        const studentIds = assignment.class.enrollments.map((e) => e.userId);
        const runs = await ctx.prisma.practiceRun.findMany({
          where: {
            classAssignmentId: assignment.id,
            userId: { in: studentIds }
          },
          select: {
            id: true,
            userId: true,
            startedAt: true,
            completedAt: true,
            attempts: {
              where: { status: "SUBMITTED" },
              select: { isCorrect: true, problemId: true }
            },
            // Batch-3: per-run hint usage count, surfaced in the
            // teacher progress table so a teacher can spot a student
            // leaning on hints. Cheap _count avoids dragging the full
            // ProblemHintUsage rows into this aggregate query.
            _count: { select: { hintUsages: true } }
          }
        });
        const runsByUser = new Map(runs.map((r) => [r.userId, r]));

        const rows = assignment.class.enrollments.map((e) => {
          const run = runsByUser.get(e.userId);
          const correct =
            run?.attempts.filter((a) => a.isCorrect).length ?? 0;
          const attempted = run
            ? new Set(run.attempts.map((a) => a.problemId)).size
            : 0;
          return {
            userId: e.userId,
            name: e.user.name,
            email: e.user.email,
            status: run?.completedAt
              ? ("COMPLETED" as const)
              : run
                ? ("IN_PROGRESS" as const)
                : ("NOT_STARTED" as const),
            attempted,
            correct,
            hintsUsed: run?._count.hintUsages ?? 0,
            startedAt: run?.startedAt ?? null,
            completedAt: run?.completedAt ?? null
          };
        });

        return {
          assignmentId: assignment.id,
          title: assignment.title,
          dueAt: assignment.dueAt,
          totalProblems,
          hintTutorEnabled: assignment.hintTutorEnabled,
          students: rows
        };
      }),

    create: teacherProcedure
      .input(createAssignmentInput)
      .mutation(async ({ ctx, input }) => {
        await assertCanManageClass(ctx.prisma, {
          classId: input.classId,
          organizationId: ctx.membership!.organizationId,
          actingUserId: ctx.session.user.id,
          actingRole: ctx.membership!.role
        });

        // Visibility check: the teacher can only assign sets that are
        // PUBLIC or belong to their org. Stop malicious cross-tenant
        // access via known-IDs.
        const set = await ctx.prisma.problemSet.findUnique({
          where: { id: input.problemSetId },
          select: {
            id: true,
            title: true,
            visibility: true,
            ownerOrganizationId: true
          }
        });
        if (!set) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Problem set not found" });
        }
        if (
          set.visibility !== "PUBLIC" &&
          set.ownerOrganizationId !== ctx.membership!.organizationId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can't assign a set owned by another school"
          });
        }

        try {
          const created = await ctx.prisma.classAssignment.create({
            data: {
              classId: input.classId,
              problemSetId: input.problemSetId,
              createdByUserId: ctx.session.user.id,
              title: input.title ?? set.title,
              instructions: input.instructions,
              openAt: input.openAt,
              dueAt: input.dueAt,
              hintTutorEnabled: input.hintTutorEnabled ?? false
            },
            select: { id: true, title: true, dueAt: true, hintTutorEnabled: true }
          });
          await logAudit(
            ctx.prisma,
            {
              userId: ctx.session.user.id,
              organizationId: ctx.membership!.organizationId
            },
            {
              // Use the canonical "class.assignment.create" namespace
              // so the org-admin activity feed picks it up (the legacy
              // "teacher.assignment.create" string remains in this
              // log line's history but new entries roll forward).
              action: "class.assignment.create",
              targetType: "ClassAssignment",
              targetId: created.id,
              payload: {
                classId: input.classId,
                problemSetId: input.problemSetId,
                title: created.title,
                dueAt: created.dueAt ? created.dueAt.toISOString() : null,
                hintTutorEnabled: created.hintTutorEnabled
              }
            }
          );
          return created;
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "That problem set is already assigned to this class"
            });
          }
          throw err;
        }
      }),

    delete: teacherProcedure
      .input(deleteAssignmentInput)
      .mutation(async ({ ctx, input }) => {
        const assignment = await ctx.prisma.classAssignment.findUnique({
          where: { id: input.assignmentId },
          select: {
            classId: true,
            createdByUserId: true,
            class: { select: { organizationId: true, createdByUserId: true } }
          }
        });
        if (
          !assignment ||
          assignment.class.organizationId !== ctx.membership!.organizationId
        ) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const isSchoolAdmin = canManageOrganization(ctx.membership!.role);
        const isMine = assignment.createdByUserId === ctx.session.user.id;
        if (!isSchoolAdmin && !isMine) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assignment creator or a school admin can remove it"
          });
        }
        await ctx.prisma.classAssignment.delete({
          where: { id: input.assignmentId }
        });
        await logAudit(
          ctx.prisma,
          {
            userId: ctx.session.user.id,
            organizationId: ctx.membership!.organizationId
          },
          {
            action: "teacher.assignment.delete",
            targetType: "ClassAssignment",
            targetId: input.assignmentId,
            payload: { classId: assignment.classId }
          }
        );
        return { ok: true as const };
      })
  }),

  // ------------------------------------------------------ school admin
  /**
   * School-admin scope: invite a new teacher to the school, enforcing
   * maxTeacherSeats. Only OWNER/ADMIN (of the org, or an arcmath-global
   * admin) can call this.
   */
  inviteTeachers: schoolAdminProcedure
    .input(
      z.object({
        teachers: z
          .array(
            z.object({
              email: z.string().email(),
              name: z.string().min(1).max(120).optional()
            })
          )
          .min(1)
          .max(10)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership!.organizationId;
      const org = await ctx.prisma.organization.findUnique({
        where: { id: orgId },
        select: { maxTeacherSeats: true }
      });
      const maxTeacherSeats = org?.maxTeacherSeats ?? 3;
      const activeTeacherCount = await ctx.prisma.organizationMembership.count({
        where: { organizationId: orgId, role: "TEACHER", status: "ACTIVE" }
      });
      const remaining = Math.max(0, maxTeacherSeats - activeTeacherCount);
      const toProcess = input.teachers.slice(0, remaining);
      const overflow = input.teachers.slice(remaining);

      const results: Array<{
        email: string;
        status: "ADDED" | "ALREADY_TEACHER" | "SEAT_FULL" | "EMAIL_IN_OTHER_ORG";
      }> = [];

      for (const entry of toProcess) {
        const email = entry.email.toLowerCase().trim();
        const existingUser = await ctx.prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            organizationMemberships: {
              where: { status: "ACTIVE" },
              select: { organizationId: true, role: true }
            }
          }
        });

        let userId: string;
        if (existingUser) {
          const otherOrg = existingUser.organizationMemberships.find(
            (m) => m.organizationId !== orgId
          );
          if (otherOrg) {
            results.push({ email, status: "EMAIL_IN_OTHER_ORG" });
            continue;
          }
          const existingTeacherHere =
            existingUser.organizationMemberships.find(
              (m) => m.organizationId === orgId && m.role === "TEACHER"
            );
          if (existingTeacherHere) {
            results.push({ email, status: "ALREADY_TEACHER" });
            continue;
          }
          userId = existingUser.id;
        } else {
          const created = await ctx.prisma.user.create({
            data: {
              email,
              name: entry.name ?? null,
              role: "TEACHER",
              passwordHash: "invite:unclaimed"
            },
            select: { id: true }
          });
          userId = created.id;
        }

        await ctx.prisma.organizationMembership.upsert({
          where: { organizationId_userId: { organizationId: orgId, userId } },
          create: {
            organizationId: orgId,
            userId,
            role: "TEACHER",
            status: "ACTIVE"
          },
          update: { status: "ACTIVE", role: "TEACHER" }
        });
        results.push({ email, status: "ADDED" });
      }

      for (const entry of overflow) {
        results.push({
          email: entry.email.toLowerCase().trim(),
          status: "SEAT_FULL"
        });
      }

      const addedCount = results.filter((r) => r.status === "ADDED").length;
      if (addedCount > 0) {
        await logAudit(
          ctx.prisma,
          { userId: ctx.session.user.id, organizationId: orgId },
          {
            action: "school_admin.invite_teachers",
            targetType: "Organization",
            targetId: orgId,
            payload: {
              addedCount,
              totalSubmitted: input.teachers.length
            }
          }
        );
      }

      return {
        seats: {
          used: activeTeacherCount + addedCount,
          max: maxTeacherSeats
        },
        results
      };
    }),

  // --------------------------------------------------- uploads (teacher)
  /** Upload a teacher-v1 JSON payload and stamp it as ORG_ONLY under
   *  the teacher's school. Optionally attach it to a class as an
   *  assignment in one shot. This is the "one-button" teacher flow —
   *  see /teacher/upload in the UI. */
  uploadPreview: teacherProcedure
    .input(z.object({ jsonText: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      return buildTeacherImportPreview(ctx.prisma, input.jsonText);
    }),

  uploadCommit: teacherProcedure
    .input(
      z.object({
        jsonText: z.string().min(2),
        filename: z.string().min(1).max(255).optional(),
        /** Optional: assign the resulting ProblemSet to a class as soon
         *  as it's committed. Saves the teacher a second click. */
        autoAssignClassId: z.string().min(1).optional(),
        autoAssignDueAt: z.date().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership!.organizationId;
      const teacherUserId = ctx.session.user.id;

      // Optional pre-check: teacher can write to the target class.
      if (input.autoAssignClassId) {
        await assertCanManageClass(ctx.prisma, {
          classId: input.autoAssignClassId,
          organizationId: orgId,
          actingUserId: teacherUserId,
          actingRole: ctx.membership!.role
        });
      }

      let result;
      try {
        result = await commitTeacherImportFromJson({
          prisma: ctx.prisma,
          jsonText: input.jsonText,
          filename: input.filename,
          uploadedByUserId: teacherUserId,
          ownerOrganizationId: orgId,
          ownerUserId: teacherUserId,
          visibility: "ORG_ONLY"
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Teacher upload failed";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }

      if (result.pendingPreprocessProblemIds.length > 0) {
        schedulePreprocessInBackground(result.pendingPreprocessProblemIds, {
          concurrency: 4,
          solutionOnly: !process.env.PROOF_VERIFIER_URL
        });
      }

      let assignmentId: string | null = null;
      if (input.autoAssignClassId) {
        const set = await ctx.prisma.problemSet.findUnique({
          where: { id: result.problemSetId },
          select: { title: true }
        });
        try {
          const assignment = await ctx.prisma.classAssignment.create({
            data: {
              classId: input.autoAssignClassId,
              problemSetId: result.problemSetId,
              createdByUserId: teacherUserId,
              title: set?.title ?? "Homework",
              dueAt: input.autoAssignDueAt
            },
            select: { id: true }
          });
          assignmentId = assignment.id;
        } catch (err) {
          // Idempotent: a teacher uploading twice won't error out. The
          // old assignment stands; return its id so the UI can link.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            const existing = await ctx.prisma.classAssignment.findUnique({
              where: {
                classId_problemSetId: {
                  classId: input.autoAssignClassId,
                  problemSetId: result.problemSetId
                }
              },
              select: { id: true }
            });
            assignmentId = existing?.id ?? null;
          } else {
            throw err;
          }
        }
      }

      return {
        problemSetId: result.problemSetId,
        createdProblems: result.createdProblems,
        updatedProblems: result.updatedProblems,
        skippedProblems: result.skippedProblems,
        preprocessQueuedCount: result.pendingPreprocessProblemIds.length,
        assignmentId
      };
    }),

  // ------------------------------------------------------- problem sets
  /** Library shown in the "choose a set" picker when creating an
   *  assignment. Returns PUBLIC sets + the teacher's own org-owned sets. */
  assignableProblemSets: teacherProcedure.query(async ({ ctx }) => {
    const orgId = ctx.membership!.organizationId;
    const rows = await ctx.prisma.problemSet.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { visibility: "PUBLIC" },
          { visibility: "ORG_ONLY", ownerOrganizationId: orgId }
        ]
      },
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        visibility: true,
        ownerOrganizationId: true,
        _count: { select: { problems: true } }
      },
      orderBy: [{ contest: "asc" }, { year: "desc" }, { exam: "asc" }]
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      contest: row.contest,
      year: row.year,
      exam: row.exam,
      isOwnedByMyOrg: row.ownerOrganizationId === orgId,
      problemCount: row._count.problems
    }));
  })
});

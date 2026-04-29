import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, schoolAdminProcedure } from "@/lib/trpc/server";
import { logAudit } from "@/lib/audit";

/**
 * School-admin-facing surface: cross-class overview, activity feed,
 * and the admin's own class-creation flow that hands a class off to
 * a teacher.
 *
 * All endpoints here are scoped to `ctx.membership.organizationId` —
 * a school admin can never read another school's data, and the
 * `schoolAdminProcedure` middleware already gates by org-role.
 *
 * The UI sitting on top of this router is the new /org overview the
 * pilot product brief asks for: "1 admin sees teachers + students +
 * activities across the whole school". We deliberately keep these
 * queries narrow + denormalized — the overview page asks for many
 * panels at once and we'd rather make four small queries that each
 * return ~50 rows than one giant join that's hard to paginate.
 */

const ACTIVITY_FEED_PAGE_SIZE = 50;

// Whitelist of audit-log `action` strings the activity feed surfaces.
// Anything else we record is plumbing (e.g. `auth.login_attempt`) and
// shouldn't crowd the admin's view of who's doing what to whom.
const ACTIVITY_FEED_ACTIONS = [
  "class.create",
  "class.delete",
  "class.assigned_teacher",
  "class.assignment.create",
  "class.assignment.update",
  "class.assignment.delete",
  "class.invite_students",
  "teacher.invite",
  "student.attempt.submit",
  "student.attempt.complete",
  "student.run.complete"
] as const;

export const orgAdminRouter = router({
  /**
   * One round-trip with the data needed to populate the four panels on
   * the admin overview page: teachers list, students list, classes list,
   * and the recent-activity feed first page.
   */
  overview: schoolAdminProcedure.query(async ({ ctx }) => {
    const orgId = ctx.membership.organizationId;

    const [teachers, students, classes, recentActivity, organization] = await Promise.all([
      ctx.prisma.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          role: "TEACHER"
        },
        select: {
          userId: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }),
      ctx.prisma.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          role: "STUDENT"
        },
        select: {
          userId: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }),
      ctx.prisma.class.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          assignedTeacherId: true,
          assignedTeacher: {
            select: { id: true, email: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true, name: true }
          },
          _count: {
            select: { enrollments: true, assignments: true }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      ctx.prisma.auditLogEvent.findMany({
        where: {
          organizationId: orgId,
          action: { in: [...ACTIVITY_FEED_ACTIONS] }
        },
        select: {
          id: true,
          action: true,
          createdAt: true,
          actorUserId: true,
          targetType: true,
          targetId: true,
          payload: true,
          actor: {
            select: { id: true, email: true, name: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_FEED_PAGE_SIZE
      }),
      ctx.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          maxStudentSeats: true,
          trialEndsAt: true
        }
      })
    ]);

    // Build a class-count side-index per teacher so the UI can show
    // "Ms Lin · 3 classes · 12 assignments" without each row firing
    // its own count query.
    const classCountByTeacher = new Map<string, { classes: number; assignments: number }>();
    for (const klass of classes) {
      const teacherId = klass.assignedTeacherId ?? klass.createdByUser?.id ?? null;
      if (!teacherId) continue;
      const prev = classCountByTeacher.get(teacherId) ?? { classes: 0, assignments: 0 };
      classCountByTeacher.set(teacherId, {
        classes: prev.classes + 1,
        assignments: prev.assignments + klass._count.assignments
      });
    }

    return {
      organization,
      teachers: teachers.map((t) => ({
        userId: t.userId,
        email: t.user.email,
        name: t.user.name,
        joinedAt: t.createdAt,
        classCount: classCountByTeacher.get(t.userId)?.classes ?? 0,
        assignmentCount: classCountByTeacher.get(t.userId)?.assignments ?? 0
      })),
      students: students.map((s) => ({
        userId: s.userId,
        email: s.user.email,
        name: s.user.name,
        joinedAt: s.createdAt
      })),
      classes,
      activity: recentActivity,
      activityHasMore: recentActivity.length === ACTIVITY_FEED_PAGE_SIZE
    };
  }),

  /**
   * Older-than-cursor activity events. Cursor is the last seen
   * `createdAt` (ISO string) — simple keyset pagination so we don't
   * need an offset that drifts when new events stream in.
   */
  activityFeed: schoolAdminProcedure
    .input(
      z.object({
        cursor: z.string().datetime().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;
      const events = await ctx.prisma.auditLogEvent.findMany({
        where: {
          organizationId: orgId,
          action: { in: [...ACTIVITY_FEED_ACTIONS] },
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {})
        },
        select: {
          id: true,
          action: true,
          createdAt: true,
          actorUserId: true,
          targetType: true,
          targetId: true,
          payload: true,
          actor: {
            select: { id: true, email: true, name: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_FEED_PAGE_SIZE
      });

      return {
        events,
        hasMore: events.length === ACTIVITY_FEED_PAGE_SIZE,
        nextCursor: events.length > 0 ? events[events.length - 1].createdAt.toISOString() : null
      };
    }),

  /**
   * Admin creates a class and immediately hands it to a teacher.
   * The teacher must be an ACTIVE TEACHER in the same org. We block
   * cross-tenant assignment + assignment to non-teacher users at this
   * boundary so the UI doesn't have to.
   */
  createClass: schoolAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        assignedTeacherId: z.string().min(1)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      const teacherMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId: input.assignedTeacherId,
          status: "ACTIVE",
          role: "TEACHER"
        },
        select: { userId: true }
      });

      if (!teacherMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Assigned user must be an active teacher in this school."
        });
      }

      // 6-char join code, reroll on collision (cheap — collisions at this
      // scale are vanishingly unlikely but the dev DB has a unique index).
      const generateJoinCode = () =>
        Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X").slice(0, 6);

      let joinCode = generateJoinCode();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const collision = await ctx.prisma.class.findFirst({
          where: { joinCode },
          select: { id: true }
        });
        if (!collision) break;
        joinCode = generateJoinCode();
      }

      const klass = await ctx.prisma.class.create({
        data: {
          name: input.name,
          organizationId: orgId,
          createdByUserId: ctx.session.user.id,
          assignedTeacherId: teacherMembership.userId,
          joinCode
        },
        select: {
          id: true,
          name: true,
          joinCode: true,
          assignedTeacherId: true
        }
      });

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "class.create",
          targetType: "Class",
          targetId: klass.id,
          payload: {
            name: klass.name,
            assignedTeacherId: klass.assignedTeacherId,
            createdBy: "school_admin"
          }
        }
      );

      return klass;
    }),

  /**
   * Reassign an existing class to a different teacher. Useful when a
   * teacher leaves or a class shifts hands mid-term.
   */
  assignClassToTeacher: schoolAdminProcedure
    .input(
      z.object({
        classId: z.string().min(1),
        assignedTeacherId: z.string().min(1)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      const klass = await ctx.prisma.class.findUnique({
        where: { id: input.classId },
        select: { id: true, organizationId: true, assignedTeacherId: true }
      });

      if (!klass || klass.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const teacherMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId: input.assignedTeacherId,
          status: "ACTIVE",
          role: "TEACHER"
        },
        select: { userId: true }
      });

      if (!teacherMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Assigned user must be an active teacher in this school."
        });
      }

      const updated = await ctx.prisma.class.update({
        where: { id: klass.id },
        data: { assignedTeacherId: teacherMembership.userId },
        select: {
          id: true,
          name: true,
          assignedTeacherId: true
        }
      });

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "class.assigned_teacher",
          targetType: "Class",
          targetId: updated.id,
          payload: {
            previousTeacherId: klass.assignedTeacherId,
            newTeacherId: updated.assignedTeacherId
          }
        }
      );

      return updated;
    })
});

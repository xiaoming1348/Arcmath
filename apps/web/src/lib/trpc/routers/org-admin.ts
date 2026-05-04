import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pinyin } from "pinyin-pro";
import { router, schoolAdminProcedure } from "@/lib/trpc/server";
import { logAudit } from "@/lib/audit";

/**
 * Convert a roster name to a stable email-username slug.
 *
 * Rules:
 *   - Chinese characters → pinyin (lowercase, hyphen-separated). The
 *     name "王伟" becomes `wang-wei`, "李小红" becomes `li-xiao-hong`.
 *   - Anything already ASCII is lowercased and non-alphanumeric runs
 *     are squashed to a single hyphen, so "Ms. Lin (Y3)" → `ms-lin-y3`.
 *   - Trailing/leading hyphens are trimmed.
 *
 * The 4-char random suffix is added at the call site (so two students
 * named "Wang Wei" can't collide on the unique-email constraint).
 */
function rosterNameToSlug(name: string): string {
  // pinyin-pro: tone=none gives the 'wang wei' form (no diacritics).
  const pinyinForm = pinyin(name, { toneType: "none", type: "string" });
  const ascii = pinyinForm
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.length > 0 ? ascii : "user";
}

function randomSlugSuffix(length = 4): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l for legibility
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Build the auto-generated login email for a roster user. Format:
 *   <name-slug>.<rand4>@<org-slug>.arcmath.local
 *
 * The "arcmath.local" suffix is intentionally non-deliverable — these
 * accounts don't receive email; the admin tells the student "your
 * username is X, go to /login/set-password to claim it" out of band.
 */
function buildRosterEmail(name: string, orgSlug: string): string {
  const nameSlug = rosterNameToSlug(name);
  const sanitizedOrg = orgSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "");
  return `${nameSlug}.${randomSlugSuffix()}@${sanitizedOrg}.arcmath.local`;
}

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
          // joinCode is the 6-char code students enter on /student to
          // self-enroll. Surfaced on the admin overview so a school
          // admin can read it off to a class without bouncing through
          // the teacher's class page.
          joinCode: true,
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
   * Roster-creation flow (the only way to create a class under the
   * current product policy):
   *
   *   - Admin enters class name, ONE teacher name, and a list of
   *     student names.
   *   - For each name we look up an existing user in this org by
   *     `User.name`. If found, we reuse the account (so a teacher who
   *     teaches multiple classes doesn't get duplicate accounts; a
   *     student transferring between classes doesn't either). If not
   *     found, we mint a new User with a generated email + null
   *     password (the user sets their own at /login/set-password).
   *   - Seat caps (org-level): teacher count ≤ maxTeacherSeats,
   *     student count ≤ maxStudentSeats. We count *post-merge* — i.e.
   *     reused users don't bump the count.
   *   - The whole thing runs in a transaction; on any seat overflow
   *     or collision the entire roster is rejected.
   *
   * Returns the new class plus a "credentials reveal" array the UI
   * shows once: { name, email, alreadyHadAccount } per roster user.
   * The admin reads / copies that table and tells each user their
   * email out of band.
   */
  createClassWithRoster: schoolAdminProcedure
    .input(
      z.object({
        className: z.string().min(1).max(120),
        teacherName: z.string().min(1).max(120),
        studentNames: z
          .array(z.string().min(1).max(120))
          .min(1)
          .max(50)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      // Pull the org row so we know its slug + seat caps.
      const org = await ctx.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          slug: true,
          maxTeacherSeats: true,
          maxStudentSeats: true
        }
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }

      // Dedup students by trimmed name so the admin can't accidentally
      // add the same person twice. Same name → same account.
      const teacherNameTrimmed = input.teacherName.trim();
      const studentNamesTrimmed = Array.from(
        new Set(input.studentNames.map((s) => s.trim()).filter((s) => s.length > 0))
      );

      // Snapshot existing teacher + student users in this org so we can
      // (a) reuse accounts that match by name, and (b) compute net new
      // count for the seat cap.
      const existingMembers = await ctx.prisma.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          role: { in: ["TEACHER", "STUDENT"] }
        },
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } }
        }
      });

      const existingTeachers = existingMembers.filter((m) => m.role === "TEACHER");
      const existingStudents = existingMembers.filter((m) => m.role === "STUDENT");

      // Find-or-mint plan. We don't actually create accounts yet — we
      // just figure out which names map to existing users and which
      // need new accounts, so we can validate seat caps in advance.
      const teacherMatch = existingTeachers.find(
        (m) => (m.user.name ?? "").trim() === teacherNameTrimmed
      );
      const newTeacherNeeded = !teacherMatch;

      const studentPlan = studentNamesTrimmed.map((name) => {
        const match = existingStudents.find((m) => (m.user.name ?? "").trim() === name);
        return { name, existingUserId: match?.user.id ?? null };
      });
      const newStudentsNeeded = studentPlan.filter((s) => !s.existingUserId).length;

      // Seat-cap enforcement: post-merge headcount must stay ≤ caps.
      const projectedTeacherCount = existingTeachers.length + (newTeacherNeeded ? 1 : 0);
      const projectedStudentCount = existingStudents.length + newStudentsNeeded;

      if (projectedTeacherCount > org.maxTeacherSeats) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Teacher seat cap reached (${org.maxTeacherSeats}). This roster would need ${projectedTeacherCount}.`
        });
      }
      if (projectedStudentCount > org.maxStudentSeats) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Student seat cap reached (${org.maxStudentSeats}). This roster would need ${projectedStudentCount}.`
        });
      }

      // Single transaction so a partial-roster failure (e.g. unique-
      // email collision after retries exhausted) leaves no orphans.
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Helper: create User + OrganizationMembership for a name.
        // Re-tries the email a few times on collision (cheap given the
        // 4-char random suffix); after that we fail loudly.
        async function mintRosterUser(args: {
          name: string;
          role: "TEACHER" | "STUDENT";
        }): Promise<{ id: string; email: string }> {
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const email = buildRosterEmail(args.name, org!.slug);
            try {
              const user = await tx.user.create({
                data: {
                  email,
                  name: args.name,
                  // No password yet — user sets it via /login/set-password.
                  passwordHash: null,
                  role: "STUDENT" // platform-level role; org role is in the membership
                },
                select: { id: true, email: true }
              });
              await tx.organizationMembership.create({
                data: {
                  organizationId: orgId,
                  userId: user.id,
                  role: args.role,
                  status: "ACTIVE"
                }
              });
              return user;
            } catch (err) {
              lastErr = err;
              // Continue retry loop on unique-email collision; surface
              // any other error immediately.
              const message = (err as { message?: string }).message ?? "";
              if (!message.includes("Unique") && !message.includes("unique")) {
                throw err;
              }
            }
          }
          throw lastErr ?? new Error("Failed to mint roster user after retries.");
        }

        // Resolve teacher: either reuse or create.
        let teacherId: string;
        let teacherEmail: string;
        let teacherIsNew: boolean;
        if (teacherMatch) {
          teacherId = teacherMatch.user.id;
          teacherEmail = teacherMatch.user.email;
          teacherIsNew = false;
        } else {
          const minted = await mintRosterUser({ name: teacherNameTrimmed, role: "TEACHER" });
          teacherId = minted.id;
          teacherEmail = minted.email;
          teacherIsNew = true;
        }

        // Resolve students.
        const resolvedStudents: Array<{
          userId: string;
          name: string;
          email: string;
          isNew: boolean;
        }> = [];
        for (const sp of studentPlan) {
          if (sp.existingUserId) {
            const existing = existingStudents.find((m) => m.user.id === sp.existingUserId)!;
            resolvedStudents.push({
              userId: existing.user.id,
              name: sp.name,
              email: existing.user.email,
              isNew: false
            });
          } else {
            const minted = await mintRosterUser({ name: sp.name, role: "STUDENT" });
            resolvedStudents.push({
              userId: minted.id,
              name: sp.name,
              email: minted.email,
              isNew: true
            });
          }
        }

        // Create the class itself. We do NOT generate a join code under
        // the new flow — students are enrolled directly from the roster.
        const klass = await tx.class.create({
          data: {
            name: input.className.trim(),
            organizationId: orgId,
            createdByUserId: ctx.session.user.id,
            assignedTeacherId: teacherId
          },
          select: { id: true, name: true, assignedTeacherId: true }
        });

        // Enroll every resolved student. Skip duplicates from the
        // unique constraint (a student already enrolled stays enrolled).
        await tx.enrollment.createMany({
          data: resolvedStudents.map((s) => ({
            classId: klass.id,
            userId: s.userId
          })),
          skipDuplicates: true
        });

        return {
          klass,
          teacher: {
            userId: teacherId,
            name: teacherNameTrimmed,
            email: teacherEmail,
            isNew: teacherIsNew
          },
          students: resolvedStudents
        };
      });

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "class.create",
          targetType: "Class",
          targetId: result.klass.id,
          payload: {
            name: result.klass.name,
            assignedTeacherId: result.klass.assignedTeacherId,
            teacherIsNew: result.teacher.isNew,
            studentCount: result.students.length,
            newStudentCount: result.students.filter((s) => s.isNew).length,
            createdBy: "school_admin_roster"
          }
        }
      );

      return result;
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

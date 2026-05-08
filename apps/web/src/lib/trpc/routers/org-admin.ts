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
 *   - ASCII runs pass through verbatim (then lowercased + sanitized),
 *     so "Jenny Lin" → `jenny-lin`, NOT `j-e-n-n-y-l-i-n`. This is
 *     why we pass `nonZh: "consecutive"` to pinyin-pro: the default
 *     splits every ASCII character into its own pinyin token, which
 *     produces hyphens between each letter.
 *   - Mixed names ("王 Tom") work too: pinyin transcribes the CJK,
 *     leaves "Tom" intact, joined with a single hyphen on sanitize.
 *   - Trailing/leading hyphens are trimmed; non-alphanumeric runs
 *     collapse to a single hyphen, so "Ms. Lin (Y3)" → `ms-lin-y3`.
 *
 * The 4-char random suffix is added at the call site (so two students
 * named "Wang Wei" can't collide on the unique-email constraint).
 */
export function rosterNameToSlug(name: string): string {
  // toneType: "none" → 'wang wei' (no diacritics).
  // nonZh: "consecutive" → keep non-Chinese substrings as one token
  //        instead of splitting every ASCII char.
  const pinyinForm = pinyin(name, { toneType: "none", type: "string", nonZh: "consecutive" });
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
          // joinCode kept for back-compat with old classes; UI doesn't
          // surface it under the roster-creation policy.
          joinCode: true,
          assignedTeacherId: true,
          assignedTeacher: {
            select: { id: true, email: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true, name: true }
          },
          enrollments: {
            select: {
              userId: true,
              user: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: "asc" }
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
   *   - Admin enters class name, ONE teacher (either by typing a new
   *     name OR picking an existing teacher account), and a list of
   *     students (each entry is again either a new name or an
   *     existing-account picker).
   *   - "new" entries spawn a fresh User with no password; the user
   *     sets their own at /login/set-password.
   *   - "existing" entries validate that the userId belongs to an
   *     active TEACHER (or STUDENT) membership in this org, then add
   *     them to the class. The discriminated union makes the admin's
   *     intent unambiguous in the UI; no name-match guessing.
   *   - Seat caps (org-level): teacher count ≤ maxTeacherSeats,
   *     student count ≤ maxStudentSeats. Only "new" entries bump
   *     the count; "existing" reuses an already-occupied seat.
   *   - The whole thing runs in a transaction; on any seat overflow
   *     or collision the entire roster is rejected.
   *
   * Returns the new class plus a "credentials reveal" array the UI
   * shows once: { name, email, isNew } per roster user. The admin
   * reads / copies that table and tells each user their email out of
   * band; new users go through /login/set-password to claim it.
   */
  createClassWithRoster: schoolAdminProcedure
    .input(
      z.object({
        className: z.string().min(1).max(120),
        // Discriminated union: type-safe "new vs existing" intent.
        // Catches a class of admin-typing mistakes that a flat name
        // string can't (e.g. typo'd name accidentally matching an
        // existing user). The UI surfaces "new"/"existing" via two
        // distinct controls.
        teacher: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("new"), name: z.string().min(1).max(120) }),
          z.object({ kind: z.literal("existing"), userId: z.string().min(1) })
        ]),
        students: z
          .array(
            z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("new"), name: z.string().min(1).max(120) }),
              z.object({ kind: z.literal("existing"), userId: z.string().min(1) })
            ])
          )
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

      // Snapshot existing teacher + student users in this org so we can
      // validate "existing" picks AND project seat-cap usage. We
      // intentionally don't *match by name* here — under the
      // discriminated-union input the admin tells us exactly which
      // existing-by-id picks to reuse.
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
      const existingTeacherById = new Map(existingTeachers.map((m) => [m.user.id, m]));
      const existingStudentById = new Map(existingStudents.map((m) => [m.user.id, m]));

      // Validate existing-by-id picks belong to this org with the
      // right role. Anything malformed → 400 before we mutate.
      if (input.teacher.kind === "existing" && !existingTeacherById.has(input.teacher.userId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected teacher is not an active teacher in this school."
        });
      }
      for (const s of input.students) {
        if (s.kind === "existing" && !existingStudentById.has(s.userId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected student is not an active student in this school."
          });
        }
      }

      // Dedup new student names (trim + case-sensitive). Same name
      // typed twice = one new account; same existing-id picked twice
      // = one enrollment row (skipDuplicates handles the latter).
      const newStudentNamesSet = new Set<string>();
      for (const s of input.students) {
        if (s.kind === "new") newStudentNamesSet.add(s.name.trim());
      }
      const newStudentNames = Array.from(newStudentNamesSet).filter((n) => n.length > 0);

      const teacherIsNew = input.teacher.kind === "new";
      const newStudentsNeeded = newStudentNames.length;

      // Seat-cap enforcement: post-merge headcount must stay ≤ caps.
      const projectedTeacherCount = existingTeachers.length + (teacherIsNew ? 1 : 0);
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

        // Resolve teacher: either reuse the existing-by-id pick or
        // mint a brand-new account.
        let teacherId: string;
        let teacherEmail: string;
        let teacherName: string;
        let teacherIsNewFlag: boolean;
        if (input.teacher.kind === "existing") {
          const existing = existingTeacherById.get(input.teacher.userId)!;
          teacherId = existing.user.id;
          teacherEmail = existing.user.email;
          teacherName = existing.user.name ?? existing.user.email;
          teacherIsNewFlag = false;
        } else {
          const minted = await mintRosterUser({
            name: input.teacher.name.trim(),
            role: "TEACHER"
          });
          teacherId = minted.id;
          teacherEmail = minted.email;
          teacherName = input.teacher.name.trim();
          teacherIsNewFlag = true;
        }

        // Resolve students. Two passes: first the "existing" picks
        // (no minting), then the new names (mint once per unique
        // name even if the admin typed the same name twice).
        const resolvedStudents: Array<{
          userId: string;
          name: string;
          email: string;
          isNew: boolean;
        }> = [];
        const seenStudentIds = new Set<string>();

        for (const s of input.students) {
          if (s.kind !== "existing") continue;
          if (seenStudentIds.has(s.userId)) continue;
          seenStudentIds.add(s.userId);
          const existing = existingStudentById.get(s.userId)!;
          resolvedStudents.push({
            userId: existing.user.id,
            name: existing.user.name ?? existing.user.email,
            email: existing.user.email,
            isNew: false
          });
        }

        for (const name of newStudentNames) {
          const minted = await mintRosterUser({ name, role: "STUDENT" });
          resolvedStudents.push({
            userId: minted.id,
            name,
            email: minted.email,
            isNew: true
          });
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
            name: teacherName,
            email: teacherEmail,
            isNew: teacherIsNewFlag
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
    }),

  /**
   * Add students to an existing class. Mirrors the student-handling
   * piece of `createClassWithRoster`: each entry is either "new"
   * (mint a fresh User) or "existing" (reuse a student already in
   * the school). Seat-cap checks apply only to "new" entries; an
   * existing student joining a second class is free. Already-enrolled
   * students are silently skipped (idempotent).
   */
  addStudentsToClass: schoolAdminProcedure
    .input(
      z.object({
        classId: z.string().min(1),
        students: z
          .array(
            z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("new"), name: z.string().min(1).max(120) }),
              z.object({ kind: z.literal("existing"), userId: z.string().min(1) })
            ])
          )
          .min(1)
          .max(50)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      const klass = await ctx.prisma.class.findUnique({
        where: { id: input.classId },
        select: { id: true, organizationId: true, name: true }
      });
      if (!klass || klass.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const org = await ctx.prisma.organization.findUnique({
        where: { id: orgId },
        select: { slug: true, maxStudentSeats: true }
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const existingStudents = await ctx.prisma.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          role: "STUDENT"
        },
        select: {
          user: { select: { id: true, name: true, email: true } }
        }
      });
      const existingStudentById = new Map(existingStudents.map((m) => [m.user.id, m]));

      // Validate "existing" picks belong to this org.
      for (const s of input.students) {
        if (s.kind === "existing" && !existingStudentById.has(s.userId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected student is not an active student in this school."
          });
        }
      }

      // Dedup new names within this batch.
      const newStudentNamesSet = new Set<string>();
      for (const s of input.students) {
        if (s.kind === "new") newStudentNamesSet.add(s.name.trim());
      }
      const newStudentNames = Array.from(newStudentNamesSet).filter((n) => n.length > 0);

      // Seat cap: only the new spawns count.
      const projectedStudentCount = existingStudents.length + newStudentNames.length;
      if (projectedStudentCount > org.maxStudentSeats) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Student seat cap reached (${org.maxStudentSeats}). This roster would need ${projectedStudentCount}.`
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
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
                  passwordHash: null,
                  role: "STUDENT"
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
              const message = (err as { message?: string }).message ?? "";
              if (!message.includes("Unique") && !message.includes("unique")) {
                throw err;
              }
            }
          }
          throw lastErr ?? new Error("Failed to mint roster user after retries.");
        }

        const resolved: Array<{
          userId: string;
          name: string;
          email: string;
          isNew: boolean;
        }> = [];
        const seenIds = new Set<string>();

        for (const s of input.students) {
          if (s.kind !== "existing") continue;
          if (seenIds.has(s.userId)) continue;
          seenIds.add(s.userId);
          const ex = existingStudentById.get(s.userId)!;
          resolved.push({
            userId: ex.user.id,
            name: ex.user.name ?? ex.user.email,
            email: ex.user.email,
            isNew: false
          });
        }

        for (const name of newStudentNames) {
          const minted = await mintRosterUser({ name, role: "STUDENT" });
          resolved.push({
            userId: minted.id,
            name,
            email: minted.email,
            isNew: true
          });
        }

        await tx.enrollment.createMany({
          data: resolved.map((s) => ({
            classId: klass.id,
            userId: s.userId
          })),
          skipDuplicates: true
        });

        return resolved;
      });

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "class.invite_students",
          targetType: "Class",
          targetId: klass.id,
          payload: {
            className: klass.name,
            addedCount: result.length,
            newCount: result.filter((s) => s.isNew).length
          }
        }
      );

      return { classId: klass.id, students: result };
    }),

  /**
   * Remove a single student from one class (delete the Enrollment).
   * Their User account, past attempts, etc. are preserved — they
   * just stop seeing this class's assignments.
   */
  removeStudentFromClass: schoolAdminProcedure
    .input(
      z.object({
        classId: z.string().min(1),
        userId: z.string().min(1)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      const klass = await ctx.prisma.class.findUnique({
        where: { id: input.classId },
        select: { id: true, organizationId: true, name: true }
      });
      if (!klass || klass.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Use deleteMany + same-tenant filter so a hostile classId
      // can't delete an enrollment in another school.
      const result = await ctx.prisma.enrollment.deleteMany({
        where: { classId: klass.id, userId: input.userId }
      });

      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student is not enrolled in this class." });
      }

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "class.invite_students",
          targetType: "Class",
          targetId: klass.id,
          payload: {
            className: klass.name,
            removedUserId: input.userId,
            kind: "remove"
          }
        }
      );

      return { ok: true };
    }),

  /**
   * Clear a user's passwordHash so they re-set it via
   * /login/set-password. Useful when a student forgets their
   * password — the admin can't read the existing one (only the
   * student does), but they can clear it so the student claims a
   * new one. The target user must belong to this org.
   *
   * Limited to TEACHER and STUDENT roles to avoid an admin locking
   * out another admin / themselves.
   */
  resetUserPassword: schoolAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.membership.organizationId;

      const member = await ctx.prisma.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId: input.userId,
          status: "ACTIVE",
          role: { in: ["TEACHER", "STUDENT"] }
        },
        select: { userId: true, user: { select: { email: true } } }
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found in this school, or has a role that can't be password-reset."
        });
      }

      await ctx.prisma.user.update({
        where: { id: member.userId },
        data: { passwordHash: null }
      });

      await logAudit(
        ctx.prisma,
        { userId: ctx.session.user.id, organizationId: orgId },
        {
          action: "teacher.invite",
          targetType: "User",
          targetId: member.userId,
          payload: {
            kind: "password_reset",
            email: member.user.email
          }
        }
      );

      return { ok: true, email: member.user.email };
    })
});

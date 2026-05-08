import { z } from "zod";
import { adminProcedure, router } from "@/lib/trpc/server";

/**
 * Per-school usage analytics for platform admins.
 *
 * Focus for the pilot: "is this school actually using the product?"
 * — member counts, recent practice-run volume, active class count,
 * and whether teachers are still uploading their own sets. A single
 * `schools` query returns a row per organization; the dashboard
 * renders them as a small sortable table.
 *
 * We intentionally avoid fine-grained per-user metrics (attempt
 * durations, time-on-tutor, etc.) for the first cut — those add a
 * lot of query cost and the pilot's first real question is just
 * "how many schools still have a pulse this week?"
 */

const rangeInput = z.object({
  /** How far back to compute recent-activity counters. Default 14 days. */
  rangeDays: z.number().int().min(1).max(365).default(14)
});

const auditLogInput = z.object({
  organizationId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50)
});

export const adminAnalyticsRouter = router({
  /**
   * One row per school tenant. Aggregates computed per-request — for
   * the pilot's <50 schools this is fine; if we grow we'll cache
   * these in a materialized view or precompute daily.
   */
  schools: adminProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.rangeDays * 24 * 60 * 60 * 1000);

      // Pull the organization list first; the rest are parallel counts
      // keyed by organizationId.
      const orgs = await ctx.prisma.organization.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          planType: true,
          trialEndsAt: true,
          maxTeacherSeats: true,
          maxStudentSeats: true,
          defaultLocale: true,
          createdAt: true
        }
      });
      if (orgs.length === 0) return { rangeDays: input.rangeDays, rows: [] };

      const orgIds = orgs.map((o) => o.id);

      const [
        membershipRows,
        classCounts,
        assignmentCounts,
        recentRuns,
        teacherUploads
      ] = await Promise.all([
        ctx.prisma.organizationMembership.groupBy({
          by: ["organizationId", "role"],
          where: { organizationId: { in: orgIds }, status: "ACTIVE" },
          _count: { _all: true }
        }),
        ctx.prisma.class.groupBy({
          by: ["organizationId"],
          where: { organizationId: { in: orgIds } },
          _count: { _all: true }
        }),
        ctx.prisma.classAssignment.groupBy({
          by: ["classId"],
          where: {
            class: { organizationId: { in: orgIds } }
          },
          _count: { _all: true }
        }),
        ctx.prisma.practiceRun.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: orgIds },
            startedAt: { gte: since }
          },
          _count: { _all: true }
        }),
        ctx.prisma.problemSet.groupBy({
          by: ["ownerOrganizationId"],
          where: {
            ownerOrganizationId: { in: orgIds }
          },
          _count: { _all: true }
        })
      ]);

      // We need to go class → org for assignments, because ClassAssignment
      // doesn't hold organizationId directly.
      const classesForLookup = await ctx.prisma.class.findMany({
        where: { organizationId: { in: orgIds } },
        select: { id: true, organizationId: true }
      });
      const classIdToOrg = new Map(
        classesForLookup.map((c) => [c.id, c.organizationId])
      );

      const countMaps = {
        teachers: new Map<string, number>(),
        students: new Map<string, number>(),
        admins: new Map<string, number>(),
        classes: new Map<string, number>(),
        assignments: new Map<string, number>(),
        runs: new Map<string, number>(),
        uploads: new Map<string, number>()
      };

      for (const m of membershipRows) {
        if (m.role === "TEACHER") {
          countMaps.teachers.set(m.organizationId, m._count._all);
        } else if (m.role === "STUDENT") {
          countMaps.students.set(m.organizationId, m._count._all);
        } else {
          countMaps.admins.set(
            m.organizationId,
            (countMaps.admins.get(m.organizationId) ?? 0) + m._count._all
          );
        }
      }
      for (const c of classCounts) {
        countMaps.classes.set(c.organizationId ?? "", c._count._all);
      }
      for (const a of assignmentCounts) {
        const orgId = classIdToOrg.get(a.classId);
        if (!orgId) continue;
        countMaps.assignments.set(
          orgId,
          (countMaps.assignments.get(orgId) ?? 0) + a._count._all
        );
      }
      for (const r of recentRuns) {
        if (r.organizationId)
          countMaps.runs.set(r.organizationId, r._count._all);
      }
      for (const u of teacherUploads) {
        if (u.ownerOrganizationId)
          countMaps.uploads.set(u.ownerOrganizationId, u._count._all);
      }

      const rows = orgs.map((o) => {
        const teachers = countMaps.teachers.get(o.id) ?? 0;
        const students = countMaps.students.get(o.id) ?? 0;
        const admins = countMaps.admins.get(o.id) ?? 0;
        const classes = countMaps.classes.get(o.id) ?? 0;
        const assignments = countMaps.assignments.get(o.id) ?? 0;
        const recentRunsCount = countMaps.runs.get(o.id) ?? 0;
        const uploads = countMaps.uploads.get(o.id) ?? 0;
        // Health heuristic: green if there were runs in the window AND
        // at least one teacher is seated; yellow if teachers but no
        // runs; red if no teachers at all.
        const health: "green" | "yellow" | "red" =
          teachers === 0
            ? "red"
            : recentRunsCount > 0
              ? "green"
              : "yellow";
        return {
          organizationId: o.id,
          name: o.name,
          slug: o.slug,
          planType: o.planType,
          defaultLocale: o.defaultLocale,
          trialEndsAt: o.trialEndsAt,
          createdAt: o.createdAt,
          admins,
          teachers,
          students,
          teacherSeatMax: o.maxTeacherSeats,
          studentSeatMax: o.maxStudentSeats,
          classes,
          assignments,
          recentRuns: recentRunsCount,
          uploads,
          health
        };
      });

      return { rangeDays: input.rangeDays, rows };
    }),

  /**
   * Recent audit-log events, optionally narrowed to one school or one
   * action. Useful for incident response — "show me everything the
   * school admin did in the last hour."
   */
  auditLog: adminProcedure
    .input(auditLogInput)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.auditLogEvent.findMany({
        where: {
          organizationId: input.organizationId ?? undefined,
          action: input.action ?? undefined
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          payload: true,
          createdAt: true,
          actor: { select: { id: true, email: true, name: true } },
          organization: { select: { id: true, name: true } }
        }
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          // Cast to `unknown` so Prisma's recursive JsonValue type doesn't
          // leak through tRPC inference and trip TS2589 on the client.
          payload: r.payload as unknown,
          createdAt: r.createdAt,
          actorEmail: r.actor?.email ?? null,
          actorName: r.actor?.name ?? null,
          organizationName: r.organization?.name ?? null
        }))
      };
    })
});

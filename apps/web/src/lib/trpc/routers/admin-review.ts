import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@arcmath/db";
import { adminProcedure, router } from "@/lib/trpc/server";
import { logAudit } from "@/lib/audit";

/**
 * Admin content review queue.
 *
 * Goals:
 *   - Let an admin page through problems that still need attention:
 *     missing solutionSketch, formalization PENDING/FAILED/MANUAL_REVIEW,
 *     or sitting in a DRAFT set.
 *   - Give the admin the minimum controls to move a row forward:
 *     • mark formalizedStatus SKIPPED or MANUAL_REVIEW (for non-proof
 *       or pending-human-attention rows);
 *     • publish or unpublish the containing ProblemSet so students
 *       can't see half-baked content.
 *   - Keep the surface narrow on purpose — deep edits (statement rewrite,
 *     milestone editing) happen through the JSON upload path. The queue
 *     is for triage, not for content authoring.
 */

const RVWStatus = z.enum([
  "PENDING",
  "VERIFIED",
  "FAILED",
  "MANUAL_REVIEW",
  "SKIPPED"
]);

// Scopes the queue can be filtered by. Default is "needs_attention" which
// is the union of "has problems that still need formalization help" and
// "belongs to a DRAFT set".
const QueueScope = z.enum([
  "needs_attention",
  "pending",
  "failed",
  "manual_review",
  "missing_solution",
  "draft_only"
]);

const listInput = z.object({
  scope: QueueScope.default("needs_attention"),
  /** Optional cursor (problemId) for simple keyset pagination. */
  cursor: z.string().min(1).nullish(),
  pageSize: z.number().int().min(1).max(100).default(30)
});

export const adminReviewRouter = router({
  /**
   * Paginated list of problems filtered by the chosen scope. Returns
   * joined ProblemSet metadata so the UI can group without a second
   * query. Keyset-paginated by `id asc` for stable navigation even as
   * new rows land.
   */
  list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
    // Base where: the chosen scope's predicate. Typed explicitly so Prisma
    // can accept union shapes from the switch arms without widening.
    const scopeWhere: Prisma.ProblemWhereInput = (() => {
      switch (input.scope) {
        case "pending":
          return { formalizedStatus: "PENDING" };
        case "failed":
          return { formalizedStatus: "FAILED" };
        case "manual_review":
          return { formalizedStatus: "MANUAL_REVIEW" };
        case "missing_solution":
          return { OR: [{ solutionSketch: null }, { solutionSketch: "" }] };
        case "draft_only":
          return { problemSet: { status: "DRAFT" } };
        case "needs_attention":
        default:
          return {
            OR: [
              { formalizedStatus: { in: ["PENDING", "FAILED", "MANUAL_REVIEW"] } },
              { problemSet: { status: "DRAFT" } },
              { AND: [{ answerFormat: "PROOF" }, { solutionSketch: null }] }
            ]
          };
      }
    })();

    const rows = await ctx.prisma.problem.findMany({
      where: scopeWhere,
      orderBy: { id: "asc" },
      take: input.pageSize + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
      select: {
        id: true,
        number: true,
        statement: true,
        answerFormat: true,
        solutionSketch: true,
        formalizedStatus: true,
        formalizedReason: true,
        formalizedAt: true,
        problemSet: {
          select: {
            id: true,
            title: true,
            contest: true,
            year: true,
            exam: true,
            status: true,
            visibility: true,
            ownerOrganizationId: true
          }
        }
      }
    });

    const hasMore = rows.length > input.pageSize;
    const trimmed = hasMore ? rows.slice(0, input.pageSize) : rows;

    return {
      items: trimmed.map((row) => ({
        id: row.id,
        number: row.number,
        statementPreview: previewStatement(row.statement),
        answerFormat: row.answerFormat,
        hasSolutionSketch: Boolean(row.solutionSketch && row.solutionSketch.length > 0),
        formalizedStatus: row.formalizedStatus,
        formalizedReason: row.formalizedReason,
        formalizedAt: row.formalizedAt,
        set: row.problemSet
      })),
      nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null
    };
  }),

  /**
   * Aggregate counters for the dashboard — a quick glance at "how much
   * work is left." All DB-side so we're not fetching rows just to count.
   */
  counts: adminProcedure.query(async ({ ctx }) => {
    const [pending, failed, manual, missingSolution, draftSets, totalProofs] =
      await Promise.all([
        ctx.prisma.problem.count({ where: { formalizedStatus: "PENDING" } }),
        ctx.prisma.problem.count({ where: { formalizedStatus: "FAILED" } }),
        ctx.prisma.problem.count({
          where: { formalizedStatus: "MANUAL_REVIEW" }
        }),
        ctx.prisma.problem.count({
          where: {
            answerFormat: "PROOF",
            OR: [{ solutionSketch: null }, { solutionSketch: "" }]
          }
        }),
        ctx.prisma.problemSet.count({ where: { status: "DRAFT" } }),
        ctx.prisma.problem.count({ where: { answerFormat: "PROOF" } })
      ]);
    return {
      pending,
      failed,
      manualReview: manual,
      missingSolutionSketch: missingSolution,
      draftSets,
      totalProofs
    };
  }),

  /**
   * Override a problem's formalization status. Intended for cases the
   * offline pipeline can't handle (e.g. non-Mathlib-friendly conjectures
   * → MANUAL_REVIEW; multiple-choice rows mis-typed as PROOF → SKIPPED).
   * The admin can always re-run preprocessing to reset to PENDING.
   */
  setFormalizedStatus: adminProcedure
    .input(
      z.object({
        problemId: z.string().min(1),
        status: RVWStatus,
        reason: z.string().max(2000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const problem = await ctx.prisma.problem.findUnique({
        where: { id: input.problemId },
        select: { id: true }
      });
      if (!problem) throw new TRPCError({ code: "NOT_FOUND" });

      const updated = await ctx.prisma.problem.update({
        where: { id: input.problemId },
        data: {
          formalizedStatus: input.status,
          formalizedReason: input.reason ?? null,
          // When an admin flips to VERIFIED manually we don't have a
          // kernel timestamp; stamp it now so the UI shows "last reviewed
          // at" rather than a stale ingestion time.
          formalizedAt:
            input.status === "VERIFIED" ||
            input.status === "FAILED" ||
            input.status === "MANUAL_REVIEW" ||
            input.status === "SKIPPED"
              ? new Date()
              : null
        },
        select: { id: true, formalizedStatus: true, formalizedAt: true }
      });
      await logAudit(
        ctx.prisma,
        { userId: ctx.session?.user?.id ?? null, organizationId: null },
        {
          action: "admin.review.set_formalized_status",
          targetType: "Problem",
          targetId: updated.id,
          payload: {
            status: input.status,
            reason: input.reason ?? null
          }
        }
      );
      return updated;
    }),

  /**
   * Publish or unpublish the set. We guard against publishing a set
   * whose problems still have PENDING formalization for PROOF rows —
   * that's nearly always a mistake (students would hit grader errors).
   * Admin can force via `allowPendingProofs: true` if they really mean
   * it (rare; usually you only do this when you're debugging the grader
   * itself).
   */
  setProblemSetStatus: adminProcedure
    .input(
      z.object({
        problemSetId: z.string().min(1),
        status: z.enum(["DRAFT", "PUBLISHED"]),
        allowPendingProofs: z.boolean().default(false)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const set = await ctx.prisma.problemSet.findUnique({
        where: { id: input.problemSetId },
        select: { id: true }
      });
      if (!set) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.status === "PUBLISHED" && !input.allowPendingProofs) {
        const pendingProofCount = await ctx.prisma.problem.count({
          where: {
            problemSetId: input.problemSetId,
            answerFormat: "PROOF",
            formalizedStatus: { in: ["PENDING", "FAILED"] }
          }
        });
        if (pendingProofCount > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot publish: ${pendingProofCount} proof problems still have PENDING or FAILED formalization. Pass allowPendingProofs=true to override.`
          });
        }
      }

      const updated = await ctx.prisma.problemSet.update({
        where: { id: input.problemSetId },
        data: { status: input.status },
        select: { id: true, status: true }
      });
      await logAudit(
        ctx.prisma,
        { userId: ctx.session?.user?.id ?? null, organizationId: null },
        {
          action:
            input.status === "PUBLISHED"
              ? "admin.review.publish_set"
              : "admin.review.unpublish_set",
          targetType: "ProblemSet",
          targetId: updated.id,
          payload: {
            status: updated.status,
            allowPendingProofs: input.allowPendingProofs
          }
        }
      );
      return updated;
    })
});

function previewStatement(raw: string | null): string {
  if (!raw) return "(no statement)";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

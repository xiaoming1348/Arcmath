import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "@/lib/trpc/server";
import { buildImportPreview, commitImportFromJson } from "@/lib/imports/contest-import";
import {
  buildTeacherImportPreview,
  commitTeacherImportFromJson,
  type TeacherImportPreview
} from "@/lib/imports/teacher-import";
import { looksLikeTeacherFormat } from "@arcmath/shared";
import {
  preprocessPendingInSet,
  schedulePreprocessInBackground
} from "@/lib/preprocessing";

const importPayloadInputSchema = z.object({
  jsonText: z.string().min(2, "jsonText is required"),
  filename: z.string().min(1).max(255).optional()
});

function tryParseJsonShape(jsonText: string): unknown | null {
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/**
 * Adapt teacher-format preview → contest-format preview shape so the
 * existing admin-import UI doesn't have to branch on format. The UI
 * reads: isValid, problemSetKey{contest,year,exam}, titleSuggestion,
 * problemCount, existingSet, existingProblemNumbers[], sample[], warnings[], errors[].
 * We widen `problemSetKey.exam` to `string` (not `string | null`) — the
 * teacher format always has one, so that field is non-null here.
 */
function adaptTeacherPreviewForUi(
  preview: TeacherImportPreview
): {
  isValid: boolean;
  problemSetKey: { contest: string; year: number; exam: string | null } | null;
  titleSuggestion: string | null;
  problemCount: number;
  existingSet: boolean;
  existingProblemNumbers: number[];
  sample: Array<{ number: number; statementPreview: string }>;
  warnings: string[];
  errors: string[];
  format: "teacher-v1";
  proofProblemCount: number;
} {
  return {
    isValid: preview.isValid,
    problemSetKey: preview.problemSetKey
      ? {
          contest: preview.problemSetKey.contest,
          year: preview.problemSetKey.year,
          exam: preview.problemSetKey.exam
        }
      : null,
    titleSuggestion: preview.titleSuggestion,
    problemCount: preview.problemCount,
    existingSet: preview.existingSet,
    existingProblemNumbers: preview.existingProblemNumbers,
    sample: preview.sample,
    warnings: preview.warnings,
    errors: preview.errors,
    format: "teacher-v1",
    proofProblemCount: preview.proofProblemCount
  };
}

export const adminImportRouter = router({
  preview: adminProcedure.input(importPayloadInputSchema).mutation(async ({ ctx, input }) => {
    const shape = tryParseJsonShape(input.jsonText);
    if (shape !== null && looksLikeTeacherFormat(shape)) {
      const preview = await buildTeacherImportPreview(ctx.prisma, input.jsonText);
      return adaptTeacherPreviewForUi(preview);
    }

    const contestPreview = await buildImportPreview(ctx.prisma, input.jsonText);
    return {
      ...contestPreview,
      format: "contest-v0" as const,
      // Contest format never has PROOF problems, so 0 here. Reported so
      // the UI can render the same "N proofs will be preprocessed" line
      // unconditionally.
      proofProblemCount: 0
    };
  }),

  commit: adminProcedure.input(importPayloadInputSchema).mutation(async ({ ctx, input }) => {
    const shape = tryParseJsonShape(input.jsonText);

    if (shape !== null && looksLikeTeacherFormat(shape)) {
      // Validate first via preview so we give structured errors.
      const preview = await buildTeacherImportPreview(ctx.prisma, input.jsonText);
      if (!preview.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Teacher upload payload is invalid",
          cause: preview.errors
        });
      }

      let result;
      try {
        result = await commitTeacherImportFromJson({
          prisma: ctx.prisma,
          jsonText: input.jsonText,
          filename: input.filename,
          uploadedByUserId: ctx.session.user.id
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import commit failed";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }

      // Auto-fire the preprocessing pipeline in the background so the
      // teacher doesn't have to SSH into a box and run a CLI. Fire-and-
      // forget: any infra hiccup is logged but doesn't fail the commit.
      if (result.pendingPreprocessProblemIds.length > 0) {
        schedulePreprocessInBackground(result.pendingPreprocessProblemIds, {
          concurrency: 4,
          // Default to solution-only when the Lean verifier isn't configured —
          // the library handles this fallback internally, but we surface
          // the fast path unconditionally. For teachers, the milestone
          // checklist is the primary value; Lean is a nice-to-have.
          solutionOnly: !process.env.PROOF_VERIFIER_URL
        });
      }

      return {
        format: "teacher-v1" as const,
        problemSetId: result.problemSetId,
        createdProblems: result.createdProblems,
        updatedProblems: result.updatedProblems,
        skippedProblems: result.skippedProblems,
        warnings: result.warnings,
        preprocessQueuedCount: result.pendingPreprocessProblemIds.length
      };
    }

    // Contest-format fallback (existing AMC/AIME import path).
    const contestPreview = await buildImportPreview(ctx.prisma, input.jsonText);
    if (!contestPreview.isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Import payload is invalid",
        cause: contestPreview.errors
      });
    }

    try {
      const result = await commitImportFromJson({
        prisma: ctx.prisma,
        jsonText: input.jsonText,
        filename: input.filename,
        uploadedByUserId: ctx.session.user.id
      });
      return {
        format: "contest-v0" as const,
        ...result,
        preprocessQueuedCount: 0
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import commit failed";
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  }),

  /**
   * Polled by the admin UI after a commit to render per-problem
   * preprocessing progress (e.g. "3/5 proofs processed"). Returns rows
   * grouped by status so a simple bar-chart render suffices.
   */
  preprocessStatus: adminProcedure
    .input(z.object({ problemSetId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.problem.findMany({
        where: {
          problemSetId: input.problemSetId,
          answerFormat: "PROOF"
        },
        select: {
          id: true,
          number: true,
          formalizedStatus: true,
          formalizedReason: true,
          formalizedAt: true,
          milestoneChecks: true
        },
        orderBy: { number: "asc" }
      });

      const counts = {
        PENDING: 0,
        VERIFIED: 0,
        FAILED: 0,
        MANUAL_REVIEW: 0,
        SKIPPED: 0
      } as Record<string, number>;

      for (const row of rows) {
        counts[row.formalizedStatus] = (counts[row.formalizedStatus] ?? 0) + 1;
      }

      return {
        total: rows.length,
        counts,
        // Is anything still in flight? The UI stops polling when this flips
        // to false.
        pendingCount: counts.PENDING ?? 0,
        problems: rows.map((row) => ({
          id: row.id,
          number: row.number,
          formalizedStatus: row.formalizedStatus,
          formalizedReason: row.formalizedReason,
          hasRecipe:
            row.milestoneChecks !== null && row.milestoneChecks !== undefined,
          formalizedAt: row.formalizedAt
        }))
      };
    }),

  /**
   * Manual re-run: retry all PROOF problems in a set that aren't yet
   * VERIFIED. Useful when infra was flaky during the initial run or a
   * teacher edits a solutionSketch and wants to regenerate.
   */
  reprocessSet: adminProcedure
    .input(
      z.object({
        problemSetId: z.string().min(1),
        concurrency: z.number().int().min(1).max(8).optional(),
        solutionOnly: z.boolean().optional()
      })
    )
    .mutation(async ({ input }) => {
      const summary = await preprocessPendingInSet(input.problemSetId, {
        concurrency: input.concurrency,
        solutionOnly: input.solutionOnly
      });
      return summary;
    })
});

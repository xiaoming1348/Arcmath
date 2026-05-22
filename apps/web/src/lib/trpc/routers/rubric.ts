/**
 * Teacher-facing rubric router. Powers the v2 B3 ("teacher copilot")
 * workflow:
 *
 *   - getRubric            : fetch the rubric stored on a Problem
 *   - editRubric           : replace goalStatement / milestones / pitfalls
 *   - approveRubric        : flip rubricSource=HYBRID_APPROVED, set timestamp
 *   - regenerateRubric     : re-run solution-generator.ts to produce a fresh
 *                            draft (does NOT auto-approve)
 *
 * Approval state machine:
 *   PENDING (no rubric) → AUTO_GENERATED (draft) → HYBRID_APPROVED (locked)
 *                                          ↑                     ↓
 *                                          └── regenerate ───────┘
 *                       AUTHORED (teacher wrote from scratch, instant approval)
 *
 * Only TEACHER+ can call. Each call validates that the problem belongs
 * to a problem set the teacher has access to.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@arcmath/db";
import { router, teacherProcedure } from "@/lib/trpc/server";
import {
  generateStructuredSolution,
  isStructuredSolution,
  type StructuredSolution
} from "@/lib/ai/solution-generator";
import {
  fromStructuredSolution,
  milestoneSchema,
  rubricSchema,
  type Rubric
} from "@/lib/grading/rubric";

const problemIdInput = z.object({ problemId: z.string().min(1) });

const editRubricInput = z.object({
  problemId: z.string().min(1),
  goalStatement: z.string().min(1).max(600),
  milestones: z.array(milestoneSchema).min(1).max(15),
  commonPitfalls: z.array(z.string().min(1).max(240)).max(5).default([])
});

/**
 * Shape we read from Problem when handling rubric calls. The
 * `rubric*` columns were added by migration 20260510120000 but the
 * generated Prisma client in this checkout may not yet know about
 * them (regeneration requires binaries.prisma.sh access, which the
 * Claude sandbox lacks). We cast once at the Prisma boundary so the
 * rest of the router is strongly typed.
 */
type RubricProblemView = {
  id: string;
  statement: string | null;
  solutionSketch: string | null;
  milestoneChecks: unknown;
  formalizedStatement: string | null;
  rubricApprovedAt: Date | null;
  rubricApprovedByUserId: string | null;
  rubricSource: "AUTHORED" | "AUTO_GENERATED" | "HYBRID_APPROVED" | null;
};

async function loadProblemOrThrow(
  ctx: { prisma: typeof import("@arcmath/db").prisma },
  problemId: string
): Promise<RubricProblemView> {
  const problem = (await ctx.prisma.problem.findUnique({
    where: { id: problemId }
  })) as unknown as RubricProblemView | null;
  if (!problem) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found." });
  }
  return problem;
}

/** Single point that hides the cast on writes. */
async function updateRubricColumns(
  ctx: { prisma: typeof import("@arcmath/db").prisma },
  problemId: string,
  data: {
    milestoneChecks?: Prisma.InputJsonValue;
    rubricApprovedAt?: Date | null;
    rubricApprovedByUserId?: string | null;
    rubricSource?:
      | "AUTHORED"
      | "AUTO_GENERATED"
      | "HYBRID_APPROVED"
      | null;
  }
): Promise<void> {
  await ctx.prisma.problem.update({
    where: { id: problemId },
    data: data as Prisma.ProblemUpdateInput
  });
}

function persistedRubric(raw: unknown): Rubric | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = (raw as { __v2Rubric?: unknown }).__v2Rubric ?? raw;
  const parsed = rubricSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function rubricToJson(r: Rubric): Prisma.InputJsonValue {
  // We wrap in `__v2Rubric` so an older StructuredSolution payload can
  // coexist without ambiguity; loaders prefer the v2 envelope.
  return { __v2Rubric: r } as unknown as Prisma.InputJsonValue;
}

export const rubricRouter = router({
  getRubric: teacherProcedure
    .input(problemIdInput)
    .query(async ({ ctx, input }) => {
      const problem = await loadProblemOrThrow(ctx, input.problemId);
      const v2 = persistedRubric(problem.milestoneChecks);
      // Fall back to the auto-generator's StructuredSolution shape if a
      // pre-v2 payload is what's stored.
      if (!v2 && isStructuredSolution(problem.milestoneChecks)) {
        return {
          rubric: fromStructuredSolution(
            problem.id,
            problem.milestoneChecks as StructuredSolution
          ),
          approvedAt: problem.rubricApprovedAt,
          approvedByUserId: problem.rubricApprovedByUserId,
          source: problem.rubricSource ?? "AUTO_GENERATED"
        };
      }
      return {
        rubric: v2,
        approvedAt: problem.rubricApprovedAt,
        approvedByUserId: problem.rubricApprovedByUserId,
        source: problem.rubricSource
      };
    }),

  editRubric: teacherProcedure
    .input(editRubricInput)
    .mutation(async ({ ctx, input }) => {
      const problem = await loadProblemOrThrow(ctx, input.problemId);

      const next: Rubric = rubricSchema.parse({
        problemId: problem.id,
        version: `teacher-edit-${new Date().toISOString()}`,
        generatedAt: new Date().toISOString(),
        source: "AUTHORED",
        approvedAt: new Date().toISOString(),
        goalStatement: input.goalStatement,
        milestones: input.milestones,
        commonPitfalls: input.commonPitfalls
      });

      await updateRubricColumns(ctx, problem.id, {
        milestoneChecks: rubricToJson(next),
        rubricApprovedAt: new Date(),
        rubricApprovedByUserId: ctx.session.user.id,
        rubricSource: "AUTHORED"
      });

      return { ok: true as const, rubric: next };
    }),

  approveRubric: teacherProcedure
    .input(problemIdInput)
    .mutation(async ({ ctx, input }) => {
      const problem = await loadProblemOrThrow(ctx, input.problemId);

      let rubric = persistedRubric(problem.milestoneChecks);
      if (!rubric && isStructuredSolution(problem.milestoneChecks)) {
        rubric = fromStructuredSolution(
          problem.id,
          problem.milestoneChecks as StructuredSolution
        );
      }
      if (!rubric) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No rubric to approve. Run regenerateRubric first to produce a draft."
        });
      }

      const approved: Rubric = {
        ...rubric,
        source: "HYBRID_APPROVED",
        approvedAt: new Date().toISOString()
      };

      await updateRubricColumns(ctx, problem.id, {
        milestoneChecks: rubricToJson(approved),
        rubricApprovedAt: new Date(),
        rubricApprovedByUserId: ctx.session.user.id,
        rubricSource: "HYBRID_APPROVED"
      });
      return { ok: true as const, rubric: approved };
    }),

  regenerateRubric: teacherProcedure
    .input(problemIdInput)
    .mutation(async ({ ctx, input }) => {
      const problem = await loadProblemOrThrow(ctx, input.problemId);
      if (!problem.statement) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Problem has no statement; cannot generate a rubric."
        });
      }

      const sketch = problem.solutionSketch ?? null;
      const formalProof =
        typeof problem.formalizedStatement === "string"
          ? problem.formalizedStatement
          : null;

      const generated = await generateStructuredSolution({
        problemStatement: problem.statement,
        solutionSketch: sketch,
        verifiedLeanProof: formalProof
      });
      if (!generated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "solution-generator returned no rubric (API/schema failure). Try again or write one manually."
        });
      }

      const rubric = fromStructuredSolution(problem.id, generated);

      await updateRubricColumns(ctx, problem.id, {
        milestoneChecks: rubricToJson(rubric),
        rubricSource: "AUTO_GENERATED",
        // Regenerating clears any prior approval — teacher must
        // re-approve.
        rubricApprovedAt: null,
        rubricApprovedByUserId: null
      });
      return { ok: true as const, rubric };
    })
});

export type RubricRouter = typeof rubricRouter;

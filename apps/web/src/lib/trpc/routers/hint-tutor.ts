import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  generateExplanation,
  generateHint,
  getSafeFallbackHint,
  HINT_TUTOR_PROMPT_VERSION,
  hintLeaksFinalAnswer
} from "@/lib/ai/hint-tutor";
import { gradeAnswer } from "@/lib/answer-grading";
import { protectedProcedure, router } from "@/lib/trpc/server";

const CURATED_HINT_PROMPT_VERSION = "curated-hint-v1";
const PRECOMPUTED_HINT_PROMPT_VERSION = "precomputed-hint-v1";

const getNextHintInputSchema = z.object({
  problemId: z.string().min(1),
  draftAnswer: z.string().optional(),
  practiceRunId: z.string().min(1).optional()
});

const submitAttemptInputSchema = z.object({
  problemId: z.string().min(1),
  submittedAnswer: z.string().min(1),
  practiceRunId: z.string().min(1).optional()
});

function getCuratedHintForLevel(
  problem: {
    curatedHintLevel1?: string | null;
    curatedHintLevel2?: string | null;
    curatedHintLevel3?: string | null;
  },
  level: number
): string | null {
  const hint =
    level === 1
      ? problem.curatedHintLevel1
      : level === 2
        ? problem.curatedHintLevel2
        : problem.curatedHintLevel3;

  const normalized = hint?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getGeneratedHintForLevel(
  problem: {
    generatedHintLevel1?: string | null;
    generatedHintLevel2?: string | null;
    generatedHintLevel3?: string | null;
  },
  level: number
): string | null {
  const hint =
    level === 1
      ? problem.generatedHintLevel1
      : level === 2
        ? problem.generatedHintLevel2
        : problem.generatedHintLevel3;

  const normalized = hint?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

async function resolvePracticeRunId(params: {
  ctx: {
    prisma: {
      practiceRun: {
        findFirst: (args: {
          where: {
            id: string;
            userId: string;
            problemSetId: string;
          };
          select: {
            id: true;
          };
        }) => Promise<{ id: string } | null>;
      };
    };
  };
  practiceRunId?: string;
  userId: string;
  problemSetId: string;
}): Promise<string | null> {
  if (!params.practiceRunId) {
    return null;
  }

  const practiceRun = await params.ctx.prisma.practiceRun.findFirst({
    where: {
      id: params.practiceRunId,
      userId: params.userId,
      problemSetId: params.problemSetId
    },
    select: {
      id: true
    }
  });

  if (!practiceRun) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Practice run not found."
    });
  }

  return practiceRun.id;
}

export const hintTutorRouter = router({
  getNextHint: protectedProcedure.input(getNextHintInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: {
        id: true,
        problemSetId: true,
        statement: true,
        diagramImageAlt: true,
        answer: true,
        answerFormat: true,
        choices: true,
        solutionSketch: true,
        curatedHintLevel1: true,
        curatedHintLevel2: true,
        curatedHintLevel3: true,
        generatedHintLevel1: true,
        generatedHintLevel2: true,
        generatedHintLevel3: true,
        generatedHintPromptVersion: true
      }
    });

    if (!problem) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Problem not found."
      });
    }

    const practiceRunId = await resolvePracticeRunId({
      ctx,
      practiceRunId: input.practiceRunId,
      userId,
      problemSetId: problem.problemSetId
    });

    const existing = await ctx.prisma.problemHintUsage.findMany({
      where: {
        userId,
        problemId: input.problemId,
        ...(practiceRunId ? { practiceRunId } : {})
      },
      select: {
        hintLevel: true
      }
    });

    const maxLevel = existing.reduce((max, row) => Math.max(max, row.hintLevel), 0);
    const nextLevel = Math.min(3, maxLevel + 1);
    const curatedHint = getCuratedHintForLevel(problem, nextLevel);
    const precomputedHint = curatedHint ? null : getGeneratedHintForLevel(problem, nextLevel);
    const generatedHint = curatedHint
      ? { hintText: curatedHint, checkQuestion: "" }
      : precomputedHint
        ? { hintText: precomputedHint, checkQuestion: "" }
        : await generateHint({
            problemStatement: problem.statement ?? "",
            answerFormat: problem.answerFormat,
            choices: problem.choices,
            diagramImageAlt: problem.diagramImageAlt,
            draftAnswer: input.draftAnswer,
            hintLevel: nextLevel,
            solutionSketch: problem.solutionSketch
          });
    const hintText = hintLeaksFinalAnswer(generatedHint.hintText, problem.answer)
      ? getSafeFallbackHint(nextLevel).hintText
      : generatedHint.hintText;

    await ctx.prisma.problemHintUsage.create({
      data: {
        userId,
        problemId: input.problemId,
        practiceRunId,
        hintLevel: nextLevel,
        hintText,
        promptVersion: curatedHint
          ? CURATED_HINT_PROMPT_VERSION
          : precomputedHint
            ? `${PRECOMPUTED_HINT_PROMPT_VERSION}:${problem.generatedHintPromptVersion ?? HINT_TUTOR_PROMPT_VERSION}`
            : HINT_TUTOR_PROMPT_VERSION
      }
    });

    return {
      hintLevel: nextLevel,
      hintText,
      exhausted: nextLevel >= 3
    };
  }),

  submitAttempt: protectedProcedure.input(submitAttemptInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: {
        id: true,
        problemSetId: true,
        statement: true,
        diagramImageAlt: true,
        answer: true,
        answerFormat: true,
        choices: true,
        solutionSketch: true
      }
    });

    if (!problem) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Problem not found."
      });
    }

    const practiceRunId = await resolvePracticeRunId({
      ctx,
      practiceRunId: input.practiceRunId,
      userId,
      problemSetId: problem.problemSetId
    });

    const gradingResult = gradeAnswer({
      answerFormat: problem.answerFormat,
      submittedAnswer: input.submittedAnswer,
      canonicalAnswer: problem.answer,
      choices: problem.choices
    });
    const normalizedAnswer = gradingResult.normalizedSubmittedAnswer;
    const expectedAnswer = (problem.answer ?? "").trim();
    const isCorrect = gradingResult.isCorrect;
    const explanationResult = await generateExplanation({
      problemStatement: problem.statement ?? "",
      answerFormat: problem.answerFormat,
      choices: problem.choices,
      diagramImageAlt: problem.diagramImageAlt,
      submittedAnswer: input.submittedAnswer,
      correctAnswer: expectedAnswer,
      isCorrect,
      solutionSketch: problem.solutionSketch
    });
    const explanation = explanationResult.explanation;

    await ctx.prisma.problemAttempt.create({
      data: {
        userId,
        problemId: input.problemId,
        practiceRunId,
        submittedAnswer: input.submittedAnswer,
        normalizedAnswer,
        isCorrect,
        explanationText: explanation
      }
    });

    return {
      isCorrect,
      explanation,
      ...(isCorrect ? {} : { correctAnswer: problem.answer })
    };
  })
});

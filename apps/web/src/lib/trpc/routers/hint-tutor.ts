import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  generateExplanation,
  generateHint,
  generateInteractiveTutorResponse,
  getSafeFallbackHint,
  HINT_TUTOR_PROMPT_VERSION,
  hintLeaksFinalAnswer
} from "@/lib/ai/hint-tutor";
import { gradeAnswer } from "@/lib/answer-grading";
import { protectedProcedure, router } from "@/lib/trpc/server";

const CURATED_HINT_PROMPT_VERSION = "curated-hint-v1";
const PRECOMPUTED_HINT_PROMPT_VERSION = "precomputed-hint-v1";
const INTERACTIVE_HINT_PROMPT_VERSION = "interactive-hint-tutor-v1";

const getNextHintInputSchema = z.object({
  problemId: z.string().min(1),
  draftAnswer: z.string().optional(),
  practiceRunId: z.string().min(1).optional()
});

const tutorIntentSchema = z.enum(["HELP_START", "CHECK_STEP", "CHECK_ANSWER_IDEA", "SMALLER_HINT"]);

const getSessionStateInputSchema = z.object({
  problemId: z.string().min(1),
  practiceRunId: z.string().min(1).optional()
});

const respondInputSchema = z.object({
  problemId: z.string().min(1),
  practiceRunId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  intent: tutorIntentSchema,
  studentMessage: z.string().trim().max(1200).optional(),
  draftAnswer: z.string().trim().max(300).optional()
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

function getIntentTargetHintLevel(params: {
  intent: z.infer<typeof tutorIntentSchema>;
  currentHintLevel: number;
}): 1 | 2 | 3 {
  if (params.intent === "SMALLER_HINT") {
    return params.currentHintLevel > 1 ? (params.currentHintLevel - 1 >= 3 ? 3 : params.currentHintLevel - 1 <= 1 ? 1 : 2) : 1;
  }

  if (params.intent === "CHECK_STEP") {
    return params.currentHintLevel >= 2 ? (params.currentHintLevel >= 3 ? 3 : 2) : 2;
  }

  if (params.intent === "CHECK_ANSWER_IDEA") {
    return params.currentHintLevel >= 2 ? (params.currentHintLevel >= 3 ? 3 : 2) : 2;
  }

  return params.currentHintLevel >= 1 ? (params.currentHintLevel >= 3 ? 3 : params.currentHintLevel as 1 | 2 | 3) : 1;
}

function normalizeTutorTurnText(value: string): string {
  return value.replace(/\u0000/g, "").trim();
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
  getSessionState: protectedProcedure.input(getSessionStateInputSchema).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: {
        id: true,
        problemSetId: true
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

    const session = await ctx.prisma.tutorSession.findFirst({
      where: {
        userId,
        problemId: input.problemId,
        practiceRunId,
        status: "ACTIVE"
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        id: true,
        currentIntent: true,
        currentHintLevel: true,
        turns: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            actor: true,
            intent: true,
            rawText: true,
            createdAt: true
          }
        }
      }
    });

    return {
      sessionId: session?.id ?? null,
      currentIntent: session?.currentIntent ?? null,
      currentHintLevel: session?.currentHintLevel ?? 0,
      turns: session?.turns ?? []
    };
  }),

  respond: protectedProcedure.input(respondInputSchema).mutation(async ({ ctx, input }) => {
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
        generatedHintLevel3: true
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

    let session = await ctx.prisma.tutorSession.findFirst({
      where: {
        id: input.sessionId,
        userId,
        problemId: input.problemId,
        practiceRunId,
        status: "ACTIVE"
      },
      select: {
        id: true,
        currentHintLevel: true
      }
    });

    if (!session) {
      session = await ctx.prisma.tutorSession.findFirst({
        where: {
          userId,
          problemId: input.problemId,
          practiceRunId,
          status: "ACTIVE"
        },
        orderBy: {
          updatedAt: "desc"
        },
        select: {
          id: true,
          currentHintLevel: true
        }
      });
    }

    if (!session) {
      session = await ctx.prisma.tutorSession.create({
        data: {
          userId,
          problemId: input.problemId,
          practiceRunId,
          currentIntent: input.intent,
          currentHintLevel: 0
        },
        select: {
          id: true,
          currentHintLevel: true
        }
      });
    }

    const targetHintLevel = getIntentTargetHintLevel({
      intent: input.intent,
      currentHintLevel: session.currentHintLevel
    });

    const recentTurns = await ctx.prisma.tutorTurn.findMany({
      where: {
        tutorSessionId: session.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 6,
      select: {
        actor: true,
        rawText: true
      }
    });

    const studentMessage = input.studentMessage?.trim() || "";

    if (studentMessage.length > 0) {
      await ctx.prisma.tutorTurn.create({
        data: {
          tutorSessionId: session.id,
          userId,
          actor: "STUDENT",
          intent: input.intent,
          rawText: studentMessage
        }
      });
    }

    const curatedHint = input.intent === "CHECK_STEP" || input.intent === "CHECK_ANSWER_IDEA"
      ? null
      : getCuratedHintForLevel(problem, targetHintLevel);
    const precomputedHint =
      curatedHint || input.intent === "CHECK_STEP" || input.intent === "CHECK_ANSWER_IDEA"
        ? null
        : getGeneratedHintForLevel(problem, targetHintLevel);

    const generatedResponse = curatedHint
      ? {
          tutorText: `${curatedHint}\n\nWhat is the next concrete step you can try from here?`,
          nextSuggestedIntent: "CHECK_STEP" as const
        }
      : precomputedHint
        ? {
            tutorText: `${precomputedHint}\n\nWhat is the next concrete step you can try from here?`,
            nextSuggestedIntent: "CHECK_STEP" as const
          }
        : await generateInteractiveTutorResponse({
            problemStatement: problem.statement ?? "",
            answerFormat: problem.answerFormat,
            choices: problem.choices,
            diagramImageAlt: problem.diagramImageAlt,
            studentMessage,
            draftAnswer: input.draftAnswer,
            hintLevel: targetHintLevel,
            intent: input.intent,
            recentTurns: recentTurns.reverse().map((turn) => ({
              actor: turn.actor,
              text: turn.rawText
            })),
            solutionSketch: problem.solutionSketch
          });

    const tutorText = hintLeaksFinalAnswer(generatedResponse.tutorText, problem.answer)
      ? getSafeFallbackHint(targetHintLevel).hintText
      : normalizeTutorTurnText(generatedResponse.tutorText);

    const tutorTurn = await ctx.prisma.tutorTurn.create({
      data: {
        tutorSessionId: session.id,
        userId,
        actor: "TUTOR",
        intent: input.intent,
        rawText: tutorText
      },
      select: {
        id: true,
        actor: true,
        intent: true,
        rawText: true,
        createdAt: true
      }
    });

    await ctx.prisma.problemHintUsage.create({
      data: {
        userId,
        problemId: input.problemId,
        practiceRunId,
        hintLevel: targetHintLevel,
        hintText: tutorText,
        promptVersion: curatedHint
          ? CURATED_HINT_PROMPT_VERSION
          : precomputedHint
            ? PRECOMPUTED_HINT_PROMPT_VERSION
            : INTERACTIVE_HINT_PROMPT_VERSION
      }
    });

    await ctx.prisma.tutorSession.update({
      where: {
        id: session.id
      },
      data: {
        currentIntent: generatedResponse.nextSuggestedIntent,
        currentHintLevel: targetHintLevel
      }
    });

    return {
      sessionId: session.id,
      turn: tutorTurn,
      nextSuggestedIntent: generatedResponse.nextSuggestedIntent,
      hintLevel: targetHintLevel
    };
  }),

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

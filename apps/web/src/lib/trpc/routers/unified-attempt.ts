import { TRPCError } from "@trpc/server";
import type { AnswerFormat } from "@arcmath/db";
import { z } from "zod";
import {
  PROOF_CLASSIFIER_FALLBACK_VERSION,
  PROOF_LLM_JUDGE_VERSION,
  PROOF_OVERALL_REVIEW_VERSION,
  PROOF_TUTOR_PROMPT_VERSION,
  classifyStepWithLlm,
  generateProofReview,
  generateStepFeedback,
  judgeStepWithLlm,
  type ProofStepType,
  type ProofStepVerdict
} from "@/lib/ai/proof-tutor";
import { isStructuredSolution, type StructuredSolution } from "@/lib/ai/solution-generator";
import { classifyStep, verifyStep, type ProofVerifyResult } from "@/lib/proof-verifier-client";
import { generateExplanation, generateHint, getSafeFallbackHint, hintLeaksFinalAnswer } from "@/lib/ai/hint-tutor";
import { gradeAnswer, type SupportedAnswerFormat } from "@/lib/answer-grading";
import { protectedProcedure, router } from "@/lib/trpc/server";

const MAX_STEP_LENGTH = 4000;
const MAX_STEPS_PER_ATTEMPT = 50;
const HINT_CURATED_VERSION = "curated-hint-v1";
const HINT_PRECOMPUTED_VERSION = "precomputed-hint-v1";
const HINT_GENERATED_VERSION = "hint-tutor-v1";

const attemptIdInput = z.object({ attemptId: z.string().min(1) });

const getStateInput = z.object({
  problemId: z.string().min(1),
  practiceRunId: z.string().min(1).optional()
});

const entryModeSchema = z.enum(["ANSWER_ONLY", "STUCK_WITH_WORK", "HINT_GUIDED", "PROOF_STEPS"]);
const selfReportSchema = z.enum(["SOLVED_CONFIDENT", "ATTEMPTED_STUCK", "NO_IDEA"]);

const chooseEntryInput = z.object({
  problemId: z.string().min(1),
  practiceRunId: z.string().min(1).optional(),
  entryMode: entryModeSchema,
  selfReport: selfReportSchema.optional()
});

const upgradeModeInput = z.object({
  attemptId: z.string().min(1),
  entryMode: entryModeSchema
});

const addStepInput = z.object({
  attemptId: z.string().min(1),
  latexInput: z.string().trim().min(1).max(MAX_STEP_LENGTH)
});

const editStepInput = z.object({
  stepId: z.string().min(1),
  latexInput: z.string().trim().min(1).max(MAX_STEP_LENGTH)
});

const deleteStepInput = z.object({ stepId: z.string().min(1) });

const requestHintInput = z.object({ attemptId: z.string().min(1) });

const submitInput = z.object({
  attemptId: z.string().min(1),
  finalAnswer: z.string().trim().max(600).optional()
});

type HintForLevel = {
  level: 1 | 2 | 3;
  hintText: string;
  source: "curated" | "precomputed" | "generated" | "fallback";
};

// Narrows the Prisma `AnswerFormat` enum down to the formats that
// `gradeAnswer` knows how to auto-grade. Rejects both PROOF (routed
// through the step-by-step proof tutor) and WORKED_SOLUTION (no
// auto-grading by design — the official solution is shown to the
// student for self-check; see AnswerFormat comments in schema.prisma).
function supportedForGrading(format: AnswerFormat): format is SupportedAnswerFormat {
  return format !== "PROOF" && format !== "WORKED_SOLUTION";
}

type PracticeRunResolverCtx = {
  prisma: {
    practiceRun: {
      findFirst: (args: {
        where: { id: string; userId: string; problemSetId: string };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  };
};

async function resolvePracticeRunId(params: {
  ctx: PracticeRunResolverCtx;
  practiceRunId?: string;
  userId: string;
  problemSetId: string;
}): Promise<string | null> {
  if (!params.practiceRunId) return null;
  const run = await params.ctx.prisma.practiceRun.findFirst({
    where: {
      id: params.practiceRunId,
      userId: params.userId,
      problemSetId: params.problemSetId
    },
    select: { id: true }
  });
  if (!run) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Practice run not found." });
  }
  return run.id;
}

async function runStepVerification(params: {
  problemStatement: string;
  latexInput: string;
  previousSteps: string[];
}): Promise<{
  stepType: ProofStepType;
  verdict: ProofStepVerdict;
  backend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
  confidence: number;
  details: Record<string, unknown>;
  feedbackText: string;
  promptVersion: string;
  classifierVersion: string;
}> {
  // Classify: try rule-based Python classifier first, fall back to LLM when unsure.
  let stepType: ProofStepType = "UNKNOWN";
  let classifierVersion = "proof-verifier-rules-v1";
  const localClassify = await classifyStep({
    latex: params.latexInput,
    previousSteps: params.previousSteps
  });
  if (localClassify && localClassify.stepType !== "UNKNOWN" && localClassify.confidence >= 0.6) {
    stepType = localClassify.stepType;
  } else {
    const llm = await classifyStepWithLlm({
      latex: params.latexInput,
      previousSteps: params.previousSteps
    });
    if (llm) {
      stepType = llm.stepType;
      classifierVersion = PROOF_CLASSIFIER_FALLBACK_VERSION;
    } else if (localClassify) {
      stepType = localClassify.stepType;
    }
  }

  // Verify via formal backend (SymPy/Lean stub); if unknown, LLM judge.
  let verifyResult: ProofVerifyResult | null = null;
  let backend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE" = "NONE";
  let verdict: ProofStepVerdict = "PENDING";
  let confidence = 0;
  let details: Record<string, unknown> = {};
  let reason: string | undefined;

  if (stepType !== "UNKNOWN") {
    verifyResult = await verifyStep({
      stepType,
      latex: params.latexInput,
      previousSteps: params.previousSteps
    });
  }

  if (verifyResult && verifyResult.verdict !== "UNKNOWN") {
    verdict = verifyResult.verdict;
    backend = verifyResult.backend;
    confidence = verifyResult.confidence;
    details = verifyResult.details;
    reason =
      typeof details["note"] === "string"
        ? (details["note"] as string)
        : typeof details["stage"] === "string"
          ? (details["stage"] as string)
          : undefined;
  } else {
    const judge = await judgeStepWithLlm({
      problemStatement: params.problemStatement,
      stepLatex: params.latexInput,
      stepType,
      previousSteps: params.previousSteps
    });
    if (judge) {
      verdict = judge.verdict as ProofStepVerdict;
      backend = "LLM_JUDGE";
      confidence = judge.confidence;
      details = {
        reason: judge.reason,
        source: PROOF_LLM_JUDGE_VERSION,
        ...(verifyResult ? { formalAttempt: verifyResult.details } : {})
      };
      reason = judge.reason;
    } else if (verifyResult) {
      verdict = verifyResult.verdict;
      backend = verifyResult.backend;
      confidence = verifyResult.confidence;
      details = verifyResult.details;
    } else {
      verdict = "UNKNOWN";
      backend = "NONE";
      details = { note: "No verification backend available." };
    }
  }

  const feedback = await generateStepFeedback({
    problemStatement: params.problemStatement,
    stepLatex: params.latexInput,
    stepType,
    verdict,
    verificationBackend: backend,
    verificationReason: reason,
    previousSteps: params.previousSteps
  });

  return {
    stepType,
    verdict,
    backend,
    confidence,
    details,
    feedbackText: feedback.feedbackText,
    promptVersion: PROOF_TUTOR_PROMPT_VERSION,
    classifierVersion
  };
}

async function pickHintForAttempt(params: {
  problem: {
    statement: string | null;
    answerFormat: AnswerFormat;
    choices: unknown;
    diagramImageAlt: string | null;
    answer: string | null;
    solutionSketch: string | null;
    curatedHintLevel1: string | null;
    curatedHintLevel2: string | null;
    curatedHintLevel3: string | null;
    generatedHintLevel1: string | null;
    generatedHintLevel2: string | null;
    generatedHintLevel3: string | null;
  };
  level: 1 | 2 | 3;
}): Promise<HintForLevel> {
  const curated =
    params.level === 1
      ? params.problem.curatedHintLevel1
      : params.level === 2
        ? params.problem.curatedHintLevel2
        : params.problem.curatedHintLevel3;
  if (curated && curated.trim().length > 0 && !hintLeaksFinalAnswer(curated, params.problem.answer)) {
    return { level: params.level, hintText: curated.trim(), source: "curated" };
  }
  const precomputed =
    params.level === 1
      ? params.problem.generatedHintLevel1
      : params.level === 2
        ? params.problem.generatedHintLevel2
        : params.problem.generatedHintLevel3;
  if (precomputed && precomputed.trim().length > 0 && !hintLeaksFinalAnswer(precomputed, params.problem.answer)) {
    return { level: params.level, hintText: precomputed.trim(), source: "precomputed" };
  }

  if (supportedForGrading(params.problem.answerFormat)) {
    const generated = await generateHint({
      problemStatement: params.problem.statement ?? "",
      answerFormat: params.problem.answerFormat,
      choices: params.problem.choices,
      diagramImageAlt: params.problem.diagramImageAlt,
      hintLevel: params.level,
      solutionSketch: params.problem.solutionSketch
    });
    const text = hintLeaksFinalAnswer(generated.hintText, params.problem.answer)
      ? getSafeFallbackHint(params.level).hintText
      : generated.hintText;
    return { level: params.level, hintText: text, source: "generated" };
  }

  return { level: params.level, hintText: getSafeFallbackHint(params.level).hintText, source: "fallback" };
}

const STEP_SELECT = {
  id: true,
  stepIndex: true,
  latexInput: true,
  classifiedStepType: true,
  verificationBackend: true,
  verdict: true,
  confidence: true,
  feedbackText: true,
  verificationDetails: true,
  createdAt: true
} as const;

const ATTEMPT_SELECT = {
  id: true,
  status: true,
  entryMode: true,
  selfReport: true,
  hintsUsedCount: true,
  submittedAnswer: true,
  normalizedAnswer: true,
  isCorrect: true,
  explanationText: true,
  overallFeedback: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export const unifiedAttemptRouter = router({
  getState: protectedProcedure.input(getStateInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { id: true, problemSetId: true, answerFormat: true }
    });
    if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found." });

    const practiceRunId = await resolvePracticeRunId({
      ctx,
      practiceRunId: input.practiceRunId,
      userId,
      problemSetId: problem.problemSetId
    });

    // Prefer active draft; otherwise surface latest submitted for review.
    let attempt = await ctx.prisma.problemAttempt.findFirst({
      where: { userId, problemId: input.problemId, practiceRunId, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      select: ATTEMPT_SELECT
    });

    if (!attempt) {
      attempt = await ctx.prisma.problemAttempt.findFirst({
        where: { userId, problemId: input.problemId, practiceRunId, status: "SUBMITTED" },
        orderBy: { updatedAt: "desc" },
        select: ATTEMPT_SELECT
      });
    }

    const steps = attempt
      ? await ctx.prisma.attemptStep.findMany({
          where: { attemptId: attempt.id },
          orderBy: { stepIndex: "asc" },
          select: STEP_SELECT
        })
      : [];

    const hintHistory = attempt
      ? await ctx.prisma.problemHintUsage.findMany({
          where: { attemptId: attempt.id },
          orderBy: { createdAt: "asc" },
          select: { id: true, hintLevel: true, hintText: true, createdAt: true }
        })
      : [];

    return {
      attempt: attempt
        ? {
            ...attempt,
            answerFormat: problem.answerFormat,
            steps,
            hintHistory
          }
        : null,
      answerFormat: problem.answerFormat
    };
  }),

  chooseEntry: protectedProcedure.input(chooseEntryInput).mutation(async ({ ctx, input }) => {
    // Creates (or reuses) a draft attempt and stamps the student's self-report
    // + initial entry mode. No verification runs here.
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { id: true, problemSetId: true, answerFormat: true }
    });
    if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found." });

    if (problem.answerFormat === "PROOF" && input.entryMode !== "PROOF_STEPS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Proof problems must use PROOF_STEPS entry mode."
      });
    }
    if (problem.answerFormat !== "PROOF" && input.entryMode === "PROOF_STEPS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "PROOF_STEPS entry mode is only for proof problems."
      });
    }

    const practiceRunId = await resolvePracticeRunId({
      ctx,
      practiceRunId: input.practiceRunId,
      userId,
      problemSetId: problem.problemSetId
    });

    const existing = await ctx.prisma.problemAttempt.findFirst({
      where: { userId, problemId: input.problemId, practiceRunId, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });

    const attempt = existing
      ? await ctx.prisma.problemAttempt.update({
          where: { id: existing.id },
          data: {
            entryMode: input.entryMode,
            selfReport: input.selfReport ?? undefined
          },
          select: { id: true }
        })
      : await ctx.prisma.problemAttempt.create({
          data: {
            userId,
            problemId: input.problemId,
            practiceRunId,
            status: "DRAFT",
            entryMode: input.entryMode,
            selfReport: input.selfReport ?? null,
            isCorrect: false
          },
          select: { id: true }
        });

    return { attemptId: attempt.id };
  }),

  upgradeMode: protectedProcedure.input(upgradeModeInput).mutation(async ({ ctx, input }) => {
    // Allow a student to switch between ANSWER_ONLY / STUCK_WITH_WORK /
    // HINT_GUIDED mid-session (e.g. "no idea" → "I'll try steps now").
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const attempt = await ctx.prisma.problemAttempt.findFirst({
      where: { id: input.attemptId, userId },
      select: { id: true, status: true, problem: { select: { answerFormat: true } } }
    });
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
    if (attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not a draft." });
    }
    if (attempt.problem.answerFormat === "PROOF" && input.entryMode !== "PROOF_STEPS") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Proof problems cannot leave PROOF_STEPS mode." });
    }

    await ctx.prisma.problemAttempt.update({
      where: { id: attempt.id },
      data: { entryMode: input.entryMode }
    });

    return { ok: true as const };
  }),

  addStep: protectedProcedure.input(addStepInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const attempt = await ctx.prisma.problemAttempt.findFirst({
      where: { id: input.attemptId, userId },
      select: { id: true, status: true }
    });
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
    if (attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }

    const count = await ctx.prisma.attemptStep.count({ where: { attemptId: attempt.id } });
    if (count >= MAX_STEPS_PER_ATTEMPT) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Step limit reached for this attempt." });
    }

    const step = await ctx.prisma.attemptStep.create({
      data: {
        attemptId: attempt.id,
        userId,
        stepIndex: count,
        latexInput: input.latexInput,
        classifiedStepType: "UNKNOWN",
        verificationBackend: "NONE",
        verdict: "PENDING"
      },
      select: STEP_SELECT
    });

    await ctx.prisma.problemAttempt.update({
      where: { id: attempt.id },
      data: { updatedAt: new Date() }
    });

    return { step };
  }),

  editStep: protectedProcedure.input(editStepInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const step = await ctx.prisma.attemptStep.findFirst({
      where: { id: input.stepId, userId },
      select: { id: true, attemptId: true, attempt: { select: { status: true } } }
    });
    if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found." });
    if (step.attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }

    const updated = await ctx.prisma.attemptStep.update({
      where: { id: step.id },
      data: {
        latexInput: input.latexInput,
        classifiedStepType: "UNKNOWN",
        verificationBackend: "NONE",
        verdict: "PENDING",
        confidence: null,
        feedbackText: null,
        verificationDetails: null as unknown as Parameters<typeof ctx.prisma.attemptStep.update>[0]["data"]["verificationDetails"],
        classifierVersion: null,
        feedbackPromptVersion: null
      },
      select: STEP_SELECT
    });

    await ctx.prisma.problemAttempt.update({
      where: { id: step.attemptId },
      data: { updatedAt: new Date() }
    });

    return { step: updated };
  }),

  deleteStep: protectedProcedure.input(deleteStepInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const step = await ctx.prisma.attemptStep.findFirst({
      where: { id: input.stepId, userId },
      select: { id: true, attemptId: true, stepIndex: true, attempt: { select: { status: true } } }
    });
    if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found." });
    if (step.attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }

    await ctx.prisma.$transaction(async (tx) => {
      await tx.attemptStep.delete({ where: { id: step.id } });
      const remaining = await tx.attemptStep.findMany({
        where: { attemptId: step.attemptId },
        orderBy: { stepIndex: "asc" },
        select: { id: true, stepIndex: true }
      });
      for (let i = 0; i < remaining.length; i += 1) {
        if (remaining[i].stepIndex !== i) {
          await tx.attemptStep.update({ where: { id: remaining[i].id }, data: { stepIndex: i } });
        }
      }
      await tx.problemAttempt.update({
        where: { id: step.attemptId },
        data: { updatedAt: new Date() }
      });
    });

    return { ok: true as const };
  }),

  requestHint: protectedProcedure.input(requestHintInput).mutation(async ({ ctx, input }) => {
    // Used by HINT_GUIDED mode (also available in STUCK_WITH_WORK as a
    // "I'm still stuck" escape). Serves the next curated/precomputed/generated
    // hint level 1→2→3 and increments hintsUsedCount.
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const attempt = await ctx.prisma.problemAttempt.findFirst({
      where: { id: input.attemptId, userId },
      select: {
        id: true,
        status: true,
        problemId: true,
        practiceRunId: true,
        // Pull the parent practice-run's classAssignment so the
        // server can enforce the per-assignment hint-tutor toggle —
        // a malicious client that flips the boolean would still hit
        // this gate.
        practiceRun: {
          select: {
            classAssignment: {
              select: { hintTutorEnabled: true }
            }
          }
        },
        problem: {
          select: {
            statement: true,
            answerFormat: true,
            choices: true,
            diagramImageAlt: true,
            answer: true,
            solutionSketch: true,
            curatedHintLevel1: true,
            curatedHintLevel2: true,
            curatedHintLevel3: true,
            generatedHintLevel1: true,
            generatedHintLevel2: true,
            generatedHintLevel3: true
          }
        }
      }
    });
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
    if (attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }
    if (
      attempt.practiceRun?.classAssignment &&
      !attempt.practiceRun.classAssignment.hintTutorEnabled
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Hints are disabled for this assignment."
      });
    }
    if (attempt.problem.answerFormat === "PROOF") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Proof problems don't offer hints yet." });
    }
    if (attempt.problem.answerFormat === "WORKED_SOLUTION") {
      // WORKED_SOLUTION problems ship an authoritative official solution
      // instead of incremental hints. The student-facing UI reveals the
      // full solution on demand; there is no hint ladder to climb.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Worked-solution problems show the full official solution instead of hints."
      });
    }

    const priorUsages = await ctx.prisma.problemHintUsage.findMany({
      where: { attemptId: attempt.id },
      select: { hintLevel: true }
    });
    const maxLevel = priorUsages.reduce((m, u) => Math.max(m, u.hintLevel), 0);
    const nextLevel = Math.min(3, maxLevel + 1) as 1 | 2 | 3;

    const hint = await pickHintForAttempt({ problem: attempt.problem, level: nextLevel });

    const usage = await ctx.prisma.problemHintUsage.create({
      data: {
        userId,
        problemId: attempt.problemId,
        attemptId: attempt.id,
        practiceRunId: attempt.practiceRunId,
        hintLevel: nextLevel,
        hintText: hint.hintText,
        promptVersion:
          hint.source === "curated"
            ? HINT_CURATED_VERSION
            : hint.source === "precomputed"
              ? HINT_PRECOMPUTED_VERSION
              : HINT_GENERATED_VERSION
      },
      select: { id: true, hintLevel: true, hintText: true, createdAt: true }
    });

    await ctx.prisma.problemAttempt.update({
      where: { id: attempt.id },
      data: {
        hintsUsedCount: { increment: 1 },
        updatedAt: new Date()
      }
    });

    return { hint: usage, exhausted: nextLevel >= 3 };
  }),

  submit: protectedProcedure.input(submitInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const attempt = await ctx.prisma.problemAttempt.findFirst({
      where: { id: input.attemptId, userId },
      select: {
        id: true,
        status: true,
        entryMode: true,
        problem: {
          select: {
            id: true,
            statement: true,
            diagramImageAlt: true,
            answerFormat: true,
            choices: true,
            answer: true,
            solutionSketch: true,
            // Offline-formalized Lean context (Phase C) — see
            // preprocess-problems.ts. Only populated for PROOF problems
            // whose pre-processing pass succeeded.
            formalizedStatus: true,
            formalizedStatement: true,
            solutionPaths: true,
            milestoneChecks: true
          }
        }
      }
    });
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
    if (attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt has already been submitted." });
    }

    const steps = await ctx.prisma.attemptStep.findMany({
      where: { attemptId: attempt.id },
      orderBy: { stepIndex: "asc" },
      select: { id: true, stepIndex: true, latexInput: true }
    });

    const isProof = attempt.problem.answerFormat === "PROOF";
    const trimmedFinalAnswer = input.finalAnswer?.trim() ?? "";

    if (isProof) {
      if (steps.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one step before submitting your proof." });
      }
    } else if (attempt.entryMode === "ANSWER_ONLY") {
      if (trimmedFinalAnswer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please enter your answer before submitting." });
      }
    } else if (attempt.entryMode === "STUCK_WITH_WORK") {
      if (steps.length === 0 && trimmedFinalAnswer.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please add at least one step, or switch to answer-only mode."
        });
      }
    }
    // HINT_GUIDED: no required work — student may submit just to record they gave up.

    // Verify each step sequentially so classifier/judge sees prior context.
    const problemStatement = attempt.problem.statement ?? "";
    const verifiedRows: Array<{
      id: string;
      stepIndex: number;
      latex: string;
      stepType: ProofStepType;
      verdict: ProofStepVerdict;
      backend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
      verificationReason?: string;
    }> = [];

    for (const step of steps) {
      const previousSteps = verifiedRows.map((v) => v.latex);
      const pipeline = await runStepVerification({
        problemStatement,
        latexInput: step.latexInput,
        previousSteps
      });
      await ctx.prisma.attemptStep.update({
        where: { id: step.id },
        data: {
          classifiedStepType: pipeline.stepType,
          verificationBackend: pipeline.backend,
          verdict: pipeline.verdict,
          confidence: pipeline.confidence,
          feedbackText: pipeline.feedbackText,
          verificationDetails: pipeline.details as Parameters<typeof ctx.prisma.attemptStep.update>[0]["data"]["verificationDetails"],
          classifierVersion: pipeline.classifierVersion,
          feedbackPromptVersion: pipeline.promptVersion
        }
      });
      verifiedRows.push({
        id: step.id,
        stepIndex: step.stepIndex,
        latex: step.latexInput,
        stepType: pipeline.stepType,
        verdict: pipeline.verdict,
        backend: pipeline.backend,
        verificationReason:
          typeof pipeline.details["note"] === "string"
            ? (pipeline.details["note"] as string)
            : typeof pipeline.details["stage"] === "string"
              ? (pipeline.details["stage"] as string)
              : undefined
      });
    }

    // Grade the final answer (non-proof problems with a supplied answer).
    let normalizedAnswer: string | null = null;
    let isCorrect = false;
    let answerExplanation: string | null = null;

    if (!isProof && trimmedFinalAnswer.length > 0 && supportedForGrading(attempt.problem.answerFormat)) {
      const grading = gradeAnswer({
        answerFormat: attempt.problem.answerFormat,
        submittedAnswer: trimmedFinalAnswer,
        canonicalAnswer: attempt.problem.answer,
        choices: attempt.problem.choices
      });
      normalizedAnswer = grading.normalizedSubmittedAnswer;
      isCorrect = grading.isCorrect;
      const expl = await generateExplanation({
        problemStatement,
        answerFormat: attempt.problem.answerFormat,
        choices: attempt.problem.choices,
        diagramImageAlt: attempt.problem.diagramImageAlt,
        submittedAnswer: trimmedFinalAnswer,
        correctAnswer: (attempt.problem.answer ?? "").trim(),
        isCorrect,
        solutionSketch: attempt.problem.solutionSketch
      });
      answerExplanation = expl.explanation;
    }

    // Overall review — applies to any attempt with steps; proof problems
    // always get one; answer-only submissions skip it.
    let overallFeedback: string | null = null;
    let overallPromptVersion: string | null = null;
    // Structured per-milestone coverage returned to the client for
    // rendering a pretty checklist in SubmittedReview. This is in-memory
    // only today — on page refresh, the client falls back to the
    // text-folded copy inside overallFeedback. A follow-up task
    // ("Persist milestoneCoverage on ProblemAttempt") will add a JSON
    // column so refresh preserves the structured view.
    let milestoneCoverageOut: Array<{ index: number; status: string; evidence: string }> = [];
    let recipeStepsOut: Array<{ index: number; title: string; technique: string[] }> = [];
    if (verifiedRows.length > 0) {
      // Pull a single machine-checked proof path out of the JSON column.
      // solutionPaths is a JSONB array of { tactic, leanCode, ... }
      // written by preprocess-problems.ts; we only feed the first path
      // to the reviewer to keep the prompt short.
      const solutionPathsRaw = attempt.problem.solutionPaths;
      let referenceProof: string | null = null;
      if (Array.isArray(solutionPathsRaw) && solutionPathsRaw.length > 0) {
        const first = solutionPathsRaw[0] as { leanCode?: unknown } | undefined;
        if (first && typeof first.leanCode === "string" && first.leanCode.trim().length > 0) {
          referenceProof = first.leanCode;
        }
      }
      // Pull the structured solution recipe from milestoneChecks (Phase
      // D). Defensive guard: the column is JSON so it may hold stale
      // shapes from earlier versions; isStructuredSolution does a
      // cheap structural check before we feed it to the grader.
      let solutionRecipe: StructuredSolution | null = null;
      const recipeRaw = attempt.problem.milestoneChecks;
      if (isStructuredSolution(recipeRaw)) {
        solutionRecipe = recipeRaw;
      }
      const review = await generateProofReview({
        problemStatement,
        steps: verifiedRows.map((r) => ({
          index: r.stepIndex,
          latex: r.latex,
          stepType: r.stepType,
          verdict: r.verdict,
          verificationBackend: r.backend,
          verificationReason: r.verificationReason
        })),
        formalContext: isProof
          ? {
              status: attempt.problem.formalizedStatus,
              formalizedStatement: attempt.problem.formalizedStatement ?? null,
              referenceProof
            }
          : undefined,
        solutionRecipe: isProof ? solutionRecipe : null
      });
      overallFeedback = review.overallFeedback;
      // When milestoneCoverage came back, fold it into the feedback
      // text so the student sees a concrete per-milestone verdict in
      // today's UI (which only renders overallFeedback). Store the raw
      // coverage array too once we add a column; for now, text is a
      // lossless-for-humans representation.
      if (review.milestoneCoverage.length > 0) {
        const covLines = review.milestoneCoverage
          .map((c) => `  #${c.index} ${c.status}: ${c.evidence}`)
          .join("\n");
        overallFeedback = `${overallFeedback}\n\nMilestone coverage:\n${covLines}`;
      }
      overallPromptVersion = PROOF_OVERALL_REVIEW_VERSION;
      // Expose the structured coverage + recipe step metadata to the
      // client so SubmittedReview can render a checklist instead of just
      // the folded-in text. Recipe step metadata (title/technique) lives
      // on the problem, not the review, so we ship both together.
      milestoneCoverageOut = review.milestoneCoverage.map((c) => ({
        index: c.index,
        status: c.status,
        evidence: c.evidence
      }));
      if (solutionRecipe) {
        recipeStepsOut = solutionRecipe.steps.map((s) => ({
          index: s.index,
          title: s.title,
          technique: s.technique
        }));
      }
    }

    const updated = await ctx.prisma.problemAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedAnswer: trimmedFinalAnswer.length > 0 ? trimmedFinalAnswer : null,
        normalizedAnswer,
        isCorrect,
        explanationText: answerExplanation,
        overallFeedback,
        overallPromptVersion
      },
      select: ATTEMPT_SELECT
    });

    return {
      attempt: updated,
      stepCount: steps.length,
      correctAnswer: !isProof && !isCorrect && trimmedFinalAnswer.length > 0 ? attempt.problem.answer : null,
      milestoneCoverage: milestoneCoverageOut,
      recipeSteps: recipeStepsOut
    };
  }),

  startNewAttempt: protectedProcedure.input(getStateInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const problem = await ctx.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { id: true, problemSetId: true }
    });
    if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found." });

    const practiceRunId = await resolvePracticeRunId({
      ctx,
      practiceRunId: input.practiceRunId,
      userId,
      problemSetId: problem.problemSetId
    });

    await ctx.prisma.problemAttempt.updateMany({
      where: { userId, problemId: input.problemId, practiceRunId, status: "DRAFT" },
      data: { status: "ABANDONED" }
    });

    return { ok: true as const };
  })
});

export type UnifiedAttemptRouter = typeof unifiedAttemptRouter;

import { TRPCError } from "@trpc/server";
import type { AnswerFormat } from "@arcmath/db";
import { z } from "zod";
import {
  PROOF_CLASSIFIER_FALLBACK_VERSION,
  PROOF_LLM_JUDGE_VERSION,
  PROOF_NEXT_STEP_HINT_VERSION,
  PROOF_OVERALL_REVIEW_VERSION,
  PROOF_TUTOR_PROMPT_VERSION,
  classifyStepWithLlm,
  generateNextStepHint,
  generateProofReview,
  generateStepFeedback,
  getFallbackNextStepHint,
  judgeStepWithLlm,
  type ProofStepType,
  type ProofStepVerdict
} from "@/lib/ai/proof-tutor";
import { isStructuredSolution, type StructuredSolution } from "@/lib/ai/solution-generator";
import { classifyStep, verifyStep, type ProofVerifyResult } from "@/lib/proof-verifier-client";
import { generateExplanation, generateHint, getSafeFallbackHint, hintLeaksFinalAnswer } from "@/lib/ai/hint-tutor";
import {
  ocrHandwritingToLatex,
  ocrHandwritingMultiStep
} from "@/lib/ai/ocr-handwriting";
import {
  OcrQuotaExceededError,
  pickTopConfidenceMulti,
  pickTopConfidenceSingle,
  recordOcrCall,
  requireOcrQuota
} from "@/lib/ai/ocr-quota";
import { gradeAnswer, type SupportedAnswerFormat } from "@/lib/answer-grading";
import {
  isV2Enabled,
  runStepVerificationV2
} from "@/lib/grading/adapters/unified-attempt-v2";
import { getProblemAttemptIdentity } from "@/lib/problem-page-data";
import { protectedProcedure, router } from "@/lib/trpc/server";

const MAX_STEP_LENGTH = 4000;
const MAX_STEPS_PER_ATTEMPT = 50;
const HINT_CURATED_VERSION = "curated-hint-v1";
const HINT_PRECOMPUTED_VERSION = "precomputed-hint-v1";
const HINT_GENERATED_VERSION = "hint-tutor-v1";
// Fallback path. Stamping a distinct promptVersion on the
// ProblemHintUsage row lets us grep for it in prod and catch silent
// regressions ("why are 30% of hints fallbacks today?"). Surfaced in
// the API response too so the simulator + browser devtools can see
// it without a DB query.
const HINT_FALLBACK_VERSION = "fallback-v1";

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

const nextStepHintInput = z.object({ attemptId: z.string().min(1) });

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
  /**
   * UI locale of the student. Forwarded to the LLM mentor prompt so
   * Chinese-UI users get Chinese feedback. Defaults to "en".
   */
  locale?: "en" | "zh";
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
  // Feature flag: when GRADING_ENGINE_VERSION=v2 we route to the v2
  // grading engine. v1 stays as the safe fallback while we collect
  // baseline accuracy on real student data.
  if (isV2Enabled()) {
    return runStepVerificationV2(params);
  }
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

  // Pre-flight guard: skip SymPy for multi-variable substitution
  // declarations like "n=1, a=1, b=2, c=2". SymPy's latex parser
  // silently truncates at the first comma, so calling /verify on this
  // input ends in a spurious INVALID. The LLM judge below can actually
  // reason about substitution candidates, so we route there directly.
  // Matches the same guard in the v2 SymPy backend
  // (lib/grading/backends/proof-verifier-http.ts).
  const isSubstitutionDeclaration = (() => {
    const trimmed = params.latexInput.trim().replace(/\.$/, "");
    const parts = trimmed.split(",").map((s) => s.trim());
    if (parts.length < 2) return false;
    let eqCount = 0;
    for (const part of parts) {
      if (/^[\s]*[A-Za-z_]\w*\s*=\s*[^=]/.test(part)) {
        eqCount += 1;
      }
    }
    return eqCount >= 2;
  })();

  if (stepType !== "UNKNOWN" && !isSubstitutionDeclaration) {
    verifyResult = await verifyStep({
      stepType,
      latex: params.latexInput,
      previousSteps: params.previousSteps
    });
  }

  // ERROR from the Python verifier means "couldn't run" (typically a
  // SymPy parse failure on weird student input), NOT "is mathematically
  // wrong". Treat it like UNKNOWN — fall through to the LLM judge so a
  // correct-but-oddly-formatted step (e.g. "n=1, a=1, b=2, c=2") still
  // has a chance to be recognized. Pre-2026-05-20 we'd commit ERROR
  // directly, which caused a false ✗ INVALID display on valid work.
  if (
    verifyResult &&
    verifyResult.verdict !== "UNKNOWN" &&
    verifyResult.verdict !== "ERROR"
  ) {
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
    previousSteps: params.previousSteps,
    locale: params.locale
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

  // PROOF is the only format the AI hint flow can't help with — we
  // don't have a stable answer to leak-check against, and the
  // step-by-step proof tutor handles those problems through a
  // different surface (generateProofReview, not generateHint).
  // Everything else — MC / INTEGER / EXPRESSION / WORKED_SOLUTION —
  // benefits from a level-1→3 nudge.
  if (params.problem.answerFormat !== "PROOF") {
    const generated = await generateHint({
      problemStatement: params.problem.statement ?? "",
      answerFormat: params.problem.answerFormat,
      choices: params.problem.choices,
      diagramImageAlt: params.problem.diagramImageAlt,
      hintLevel: params.level,
      solutionSketch: params.problem.solutionSketch
    });
    // If the LLM-generated hint accidentally reveals the answer, swap
    // for a sketch-derived fallback (problem-specific, but uses the
    // sentence-extraction path so the conclusion is unlikely to leak)
    // rather than the generic "Think about the key concept" string.
    const text = hintLeaksFinalAnswer(generated.hintText, params.problem.answer)
      ? getSafeFallbackHint(params.level, { solutionSketch: params.problem.solutionSketch }).hintText
      : generated.hintText;
    return { level: params.level, hintText: text, source: "generated" };
  }

  return {
    level: params.level,
    hintText: getSafeFallbackHint(params.level, { solutionSketch: params.problem.solutionSketch }).hintText,
    source: "fallback"
  };
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

    const problem = await getProblemAttemptIdentity(input.problemId);
    if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found." });

    const [, attempt, runMode] = await Promise.all([
      resolvePracticeRunId({
        ctx,
        practiceRunId: input.practiceRunId,
        userId,
        problemSetId: problem.problemSetId
      }),
      ctx.prisma.problemAttempt.findFirst({
        where: {
          userId,
          problemId: input.problemId,
          practiceRunId: input.practiceRunId ?? null,
          status: { in: ["DRAFT", "SUBMITTED"] }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        select: ATTEMPT_SELECT
      }),
      // Fetch the run's mode so the workspace can disable hints + step
      // feedback in MOCK. We only look it up if a runId was passed —
      // self-directed practice without a run (and legacy rows pre-
      // mode-field migration) gets the null-treated-as-PRACTICE
      // fallback downstream.
      input.practiceRunId
        ? ctx.prisma.practiceRun.findFirst({
            where: { id: input.practiceRunId, userId },
            select: { mode: true }
          })
        : Promise.resolve(null)
    ]);

    const [steps, hintHistory] = attempt
      ? await Promise.all([
          ctx.prisma.attemptStep.findMany({
            where: { attemptId: attempt.id },
            orderBy: { stepIndex: "asc" },
            select: STEP_SELECT
          }),
          ctx.prisma.problemHintUsage.findMany({
            where: { attemptId: attempt.id },
            orderBy: { createdAt: "asc" },
            select: { id: true, hintLevel: true, hintText: true, createdAt: true }
          })
        ])
      : [[], []];

    // Legacy rows pre-migration carry mode=null. We treat that as
    // PRACTICE downstream so historical runs keep their hint/feedback
    // affordances. MOCK is opt-in via the new chooser only.
    const resolvedMode: "MOCK" | "PRACTICE" = runMode?.mode === "MOCK" ? "MOCK" : "PRACTICE";

    return {
      attempt: attempt
        ? {
            ...attempt,
            answerFormat: problem.answerFormat,
            steps,
            hintHistory
          }
        : null,
      answerFormat: problem.answerFormat,
      runMode: resolvedMode
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

    // Both PROOF (Lean-checked) and WORKED_SOLUTION (self-comparison)
    // are proof-like for the entry mode rules: they MUST use PROOF_STEPS,
    // and nothing else is allowed to. USAMO/USAJMO/Putnam are
    // WORKED_SOLUTION and offering ANSWER_ONLY on a 9-hour proof contest
    // is a UX bug — `isProofLike` collapses the two into one rule.
    const isProofLikeFormat =
      problem.answerFormat === "PROOF" || problem.answerFormat === "WORKED_SOLUTION";
    if (isProofLikeFormat && input.entryMode !== "PROOF_STEPS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Proof-style problems must use PROOF_STEPS entry mode."
      });
    }
    if (!isProofLikeFormat && input.entryMode === "PROOF_STEPS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "PROOF_STEPS entry mode is only for proof-style problems."
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
    const isProofLikeFormatUpgrade =
      attempt.problem.answerFormat === "PROOF" ||
      attempt.problem.answerFormat === "WORKED_SOLUTION";
    if (isProofLikeFormatUpgrade && input.entryMode !== "PROOF_STEPS") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Proof-style problems cannot leave PROOF_STEPS mode." });
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
      // We pull problem.statement up-front so we can run real-time
      // step verification on this single step inline. Before the
      // per-step feedback feature (2026-05-21), this mutation just
      // wrote a PENDING row and the verification ran at final submit
      // time — now we give the student feedback as they go.
      select: {
        id: true,
        status: true,
        problem: { select: { statement: true } }
      }
    });
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
    if (attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }

    const count = await ctx.prisma.attemptStep.count({ where: { attemptId: attempt.id } });
    if (count >= MAX_STEPS_PER_ATTEMPT) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Step limit reached for this attempt." });
    }

    // Pull all prior steps so the classifier / judge has context. We
    // order by stepIndex so previousSteps[] is the same shape that the
    // final-submit path passes — keeps prompts consistent.
    const priorSteps = await ctx.prisma.attemptStep.findMany({
      where: { attemptId: attempt.id },
      orderBy: { stepIndex: "asc" },
      select: { latexInput: true }
    });

    // Resolve the student's preferred feedback locale once. Same
    // resolution path as the submit mutation uses.
    const userLocale = await (async (): Promise<"en" | "zh"> => {
      const row = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { feedbackLocale: true }
      });
      return row?.feedbackLocale === "zh" ? "zh" : "en";
    })();

    // Run the same verification pipeline used at final-submit time, on
    // just this one step. Latency is dominated by the LLM mentor call
    // (~2-4 s), which is acceptable for the inline "as you go" flow —
    // the client shows a spinner on the composer while it runs.
    const pipeline = await runStepVerification({
      problemStatement: attempt.problem.statement ?? "",
      latexInput: input.latexInput,
      previousSteps: priorSteps.map((s) => s.latexInput),
      locale: userLocale
    });

    const step = await ctx.prisma.attemptStep.create({
      data: {
        attemptId: attempt.id,
        userId,
        stepIndex: count,
        latexInput: input.latexInput,
        classifiedStepType: pipeline.stepType,
        verificationBackend: pipeline.backend,
        verdict: pipeline.verdict,
        confidence: pipeline.confidence,
        feedbackText: pipeline.feedbackText,
        verificationDetails:
          pipeline.details as Parameters<typeof ctx.prisma.attemptStep.create>[0]["data"]["verificationDetails"],
        classifierVersion: pipeline.classifierVersion,
        feedbackPromptVersion: pipeline.promptVersion
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
      select: {
        id: true,
        attemptId: true,
        stepIndex: true,
        attempt: {
          select: {
            status: true,
            problem: { select: { statement: true } }
          }
        }
      }
    });
    if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found." });
    if (step.attempt.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Attempt is not active." });
    }

    // Re-run verification on the edited step (mirrors addStep). Steps
    // are 0-indexed so `stepIndex` is the count of steps that come
    // BEFORE this one — pull those as context.
    const priorSteps = await ctx.prisma.attemptStep.findMany({
      where: { attemptId: step.attemptId, stepIndex: { lt: step.stepIndex } },
      orderBy: { stepIndex: "asc" },
      select: { latexInput: true }
    });

    const userLocale = await (async (): Promise<"en" | "zh"> => {
      const row = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { feedbackLocale: true }
      });
      return row?.feedbackLocale === "zh" ? "zh" : "en";
    })();

    const pipeline = await runStepVerification({
      problemStatement: step.attempt.problem.statement ?? "",
      latexInput: input.latexInput,
      previousSteps: priorSteps.map((s) => s.latexInput),
      locale: userLocale
    });

    const updated = await ctx.prisma.attemptStep.update({
      where: { id: step.id },
      data: {
        latexInput: input.latexInput,
        classifiedStepType: pipeline.stepType,
        verificationBackend: pipeline.backend,
        verdict: pipeline.verdict,
        confidence: pipeline.confidence,
        feedbackText: pipeline.feedbackText,
        verificationDetails:
          pipeline.details as Parameters<typeof ctx.prisma.attemptStep.update>[0]["data"]["verificationDetails"],
        classifierVersion: pipeline.classifierVersion,
        feedbackPromptVersion: pipeline.promptVersion
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

  /**
   * Next-step hint: dynamic, per-attempt forward-looking nudge based
   * on the steps the student has written so far. Distinct from
   * `requestHint` (the level-1/2/3 curated ladder) — that one is
   * problem-overall and gated by the per-assignment hint-tutor toggle.
   * This one is the inline "what should I try next?" companion to
   * the per-step real-time feedback flow, surfaced on the workspace
   * composer as a transient suggestion. No DB persistence today; if
   * we want a history later, add a ProblemNextStepHint table.
   */
  nextStepHint: protectedProcedure
    .input(nextStepHintInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const attempt = await ctx.prisma.problemAttempt.findFirst({
        where: { id: input.attemptId, userId },
        select: {
          id: true,
          status: true,
          problem: { select: { statement: true } }
        }
      });
      if (!attempt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
      }
      if (attempt.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attempt is not active."
        });
      }

      const priorSteps = await ctx.prisma.attemptStep.findMany({
        where: { attemptId: attempt.id },
        orderBy: { stepIndex: "asc" },
        select: { latexInput: true }
      });

      const userLocale = await (async (): Promise<"en" | "zh"> => {
        const row = await ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { feedbackLocale: true }
        });
        return row?.feedbackLocale === "zh" ? "zh" : "en";
      })();

      const hint = await generateNextStepHint({
        problemStatement: attempt.problem.statement ?? "",
        previousSteps: priorSteps.map((s) => s.latexInput),
        locale: userLocale
      });

      return {
        hintText: hint?.hintText ?? getFallbackNextStepHint(userLocale),
        source: hint ? ("llm" as const) : ("fallback" as const),
        promptVersion: PROOF_NEXT_STEP_HINT_VERSION
      };
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
            mode: true,
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
    // Mock-exam mode: refuse hints server-side even if the client
    // somehow tries. The UI also hides the button (see workspace), but
    // we don't rely on that for integrity.
    if (attempt.practiceRun?.mode === "MOCK") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Hints are disabled in Mock mode."
      });
    }
    if (attempt.problem.answerFormat === "PROOF") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Proof problems don't offer hints yet." });
    }
    // WORKED_SOLUTION used to be blocked here on the theory that the
    // official solution panel below the workspace is "the hint ladder".
    // In practice students hitting a Putnam B6 want incremental nudges
    // BEFORE seeing the full proof, and our manifests carry rich
    // solutionSketch text the hint prompt can use as teacher context.
    // pickHintForAttempt + generateHint are now both WORKED_SOLUTION-safe.

    const priorUsages = await ctx.prisma.problemHintUsage.findMany({
      where: { attemptId: attempt.id },
      select: { hintLevel: true }
    });
    const maxLevel = priorUsages.reduce((m, u) => Math.max(m, u.hintLevel), 0);
    const nextLevel = Math.min(3, maxLevel + 1) as 1 | 2 | 3;

    const hint = await pickHintForAttempt({ problem: attempt.problem, level: nextLevel });

    // Stamp a distinct promptVersion per source so the row in
    // ProblemHintUsage records "where did this hint come from".
    // `source` is also returned to the client so the simulator +
    // browser devtools can flag fallbacks without a DB round-trip.
    const promptVersion =
      hint.source === "curated"
        ? HINT_CURATED_VERSION
        : hint.source === "precomputed"
          ? HINT_PRECOMPUTED_VERSION
          : hint.source === "fallback"
            ? HINT_FALLBACK_VERSION
            : HINT_GENERATED_VERSION;

    if (hint.source === "fallback") {
      // Loud server-side log so this shows up in Vercel function
      // logs. Most-likely-causes for hitting this branch: missing
      // OPENAI_API_KEY env var, OpenAI 5xx, or the leak-check
      // tripping (rare after the leak detector was tightened).
      console.warn("[hint-tutor] fallback hint served — no curated, no precomputed, LLM unavailable", {
        problemId: attempt.problemId,
        hintLevel: nextLevel,
        attemptId: attempt.id
      });
    }

    const usage = await ctx.prisma.problemHintUsage.create({
      data: {
        userId,
        problemId: attempt.problemId,
        attemptId: attempt.id,
        practiceRunId: attempt.practiceRunId,
        hintLevel: nextLevel,
        hintText: hint.hintText,
        promptVersion
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

    return { hint: usage, source: hint.source, exhausted: nextLevel >= 3 };
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

    // Resolve the user's preferred *feedback* locale once, up front.
    // This is DISTINCT from the UI locale (User.locale, set via the
    // top-nav switcher). Feedback language defaults to English because
    // the competition exams themselves are in English; a Chinese-UI
    // student can opt into Chinese feedback from /account.
    // See: resolveFeedbackLocaleForUser in apps/web/src/i18n/server.ts
    const userLocale = await (async (): Promise<"en" | "zh"> => {
      const row = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { feedbackLocale: true }
      });
      return row?.feedbackLocale === "zh" ? "zh" : "en";
    })();

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
        previousSteps,
        locale: userLocale
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
        solutionRecipe: isProof ? solutionRecipe : null,
        locale: userLocale
      });
      overallFeedback = review.overallFeedback;
      // When milestoneCoverage came back, fold it into the feedback
      // text so the student sees a concrete per-milestone verdict in
      // today's UI (which only renders overallFeedback). Store the raw
      // coverage array too once we add a column; for now, text is a
      // lossless-for-humans representation.
      if (review.milestoneCoverage.length > 0) {
        const heading =
          userLocale === "zh" ? "里程碑覆盖：" : "Milestone coverage:";
        const covLines = review.milestoneCoverage
          .map((c) => `  #${c.index} ${c.status}: ${c.evidence}`)
          .join("\n");
        overallFeedback = `${overallFeedback}\n\n${heading}\n${covLines}`;
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

    // Mark BOTH active DRAFTs and prior SUBMITTED attempts as
    // ABANDONED so the next getState() call returns no current
    // attempt — that's what triggers the EntryChooser to re-show
    // and gives the student a truly fresh "try again" experience.
    //
    // We don't hard-delete rows here so the audit trail and any
    // attached reports stay intact; ABANDONED is the "soft-archived"
    // state. The getState query filters by DRAFT/SUBMITTED only and
    // will skip ABANDONED rows.
    //
    // Pre-2026-05-21 we only flipped DRAFTs, which meant clicking
    // "再尝试一次" on an already-submitted attempt did nothing visible
    // — the SUBMITTED row survived and the UI kept rendering the
    // old submission view.
    await ctx.prisma.problemAttempt.updateMany({
      where: {
        userId,
        problemId: input.problemId,
        practiceRunId,
        status: { in: ["DRAFT", "SUBMITTED"] }
      },
      data: { status: "ABANDONED" }
    });

    return { ok: true as const };
  }),

  // Photo OCR for handwriting → LaTeX. Student is in the
  // step-by-step input flow and chose to upload a photo of their work
  // instead of typing. The result lands in MathLive as an editable
  // initial value — the student MUST review before saving, we never
  // auto-commit.
  //
  // Constraints:
  //  - Payload capped at ~5MB base64 (≈ 3.7MB image). Frontend should
  //    resize before sending; this server-side cap is a defensive
  //    guard, not the primary throttle.
  //  - One photo per call. Multi-step batch OCR is a Sprint 2 feature
  //    (it complicates step-boundary detection).
  //  - This mutation does NOT touch the attempt or its steps — the UI
  //    receives the LaTeX, the student edits in MathLive, then the
  //    normal `addStep` / `editStep` mutation commits if they accept.
  //
  // Returns `{ ok: true, ... }` on a successful OCR call (including
  // confidence === "none" — the model said "I can't read this", which
  // is still a valid signal). Returns `{ ok: false, reason }` when we
  // can't even attempt OCR (API key missing, payload too big, etc.).
  ocrHandwritingStep: protectedProcedure
    .input(
      z.object({
        // data: URL containing the image. Frontend resizes + encodes.
        imageDataUrl: z
          .string()
          .min(50)
          // ~7M chars of base64 ≈ 5MB. Hard cap; frontend should
          // resize well below this in normal use.
          .max(7_000_000)
          .refine(
            (v) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
            "imageDataUrl must be a base64 data: URL for png/jpeg/webp/gif"
          ),
        // UI locale — controls the language of the optional `notes`
        // field returned by the model. LaTeX itself is locale-free.
        uiLocale: z.enum(["en", "zh"]).optional(),
        // Sprint 2: when present, the OCR call gets correlated to the
        // attempt for later telemetry (e.g. "did OCR-seeded steps end
        // up in correct submissions more often?"). Optional because
        // the UI may OCR before an attempt is created.
        attemptId: z.string().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Sprint 2: enforce daily quota BEFORE calling the vision API.
      // We do this first to (a) save tokens when over-quota and (b)
      // give the UI a structured "you're out of OCR for today"
      // response instead of a generic failure.
      try {
        await requireOcrQuota({ prisma: ctx.prisma, userId });
      } catch (err) {
        if (err instanceof OcrQuotaExceededError) {
          return {
            ok: false as const,
            reason: "quota_exceeded" as const,
            quota: {
              used: err.used,
              limit: err.limit,
              resetsAtIso: err.resetsAtIso
            }
          };
        }
        throw err;
      }

      const result = await ocrHandwritingToLatex({
        imageDataUrl: input.imageDataUrl,
        uiLocale: input.uiLocale ?? "en",
        scope: `ocr-handwriting:user-${userId.slice(0, 8)}`
      });

      // Sprint 2: record the call (success or fail). Awaited
      // deliberately — quota counting depends on this row existing
      // before the next call. ~5ms write, well within budget.
      await recordOcrCall({
        prisma: ctx.prisma,
        userId,
        kind: "single_step",
        succeeded: result !== null,
        stepCount: result ? 1 : 0,
        topConfidence: pickTopConfidenceSingle(result),
        problemAttemptId: input.attemptId ?? null
      });

      if (!result) {
        // Vision API unavailable (no key) or the call failed after
        // retries. UI should fall back to typing — show a soft toast,
        // not an error modal.
        return { ok: false as const, reason: "vision_unavailable" as const };
      }

      return {
        ok: true as const,
        latex: result.latex,
        confidence: result.confidence,
        notes: result.notes
      };
    }),

  // Sprint 2: batch handwriting OCR. Same vision API but the prompt
  // asks for N labeled steps from one photo. The UI is expected to
  // render a review modal where the student accepts/edits each step
  // before they're committed via the normal `addStep` flow.
  ocrHandwritingMultiStep: protectedProcedure
    .input(
      z.object({
        imageDataUrl: z
          .string()
          .min(50)
          .max(7_000_000)
          .refine(
            (v) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
            "imageDataUrl must be a base64 data: URL for png/jpeg/webp/gif"
          ),
        uiLocale: z.enum(["en", "zh"]).optional(),
        attemptId: z.string().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        await requireOcrQuota({ prisma: ctx.prisma, userId });
      } catch (err) {
        if (err instanceof OcrQuotaExceededError) {
          return {
            ok: false as const,
            reason: "quota_exceeded" as const,
            quota: {
              used: err.used,
              limit: err.limit,
              resetsAtIso: err.resetsAtIso
            }
          };
        }
        throw err;
      }

      const result = await ocrHandwritingMultiStep({
        imageDataUrl: input.imageDataUrl,
        uiLocale: input.uiLocale ?? "en",
        scope: `ocr-handwriting-multi:user-${userId.slice(0, 8)}`
      });

      await recordOcrCall({
        prisma: ctx.prisma,
        userId,
        kind: "multi_step",
        succeeded: result !== null,
        stepCount: result?.steps.length ?? 0,
        topConfidence: pickTopConfidenceMulti(result),
        problemAttemptId: input.attemptId ?? null
      });

      if (!result) {
        return { ok: false as const, reason: "vision_unavailable" as const };
      }

      return {
        ok: true as const,
        steps: result.steps,
        imageNotes: result.imageNotes
      };
    })
});

export type UnifiedAttemptRouter = typeof unifiedAttemptRouter;

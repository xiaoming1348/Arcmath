/**
 * Grading-eval runner.
 *
 * Pure, side-effect-free in this file — the harness in `cli.ts` wires
 * real OpenAI / Fly-verifier backends in. The split lets unit tests run
 * the runner against mocked backends without touching the network.
 *
 * Inputs:
 *   - fixtures: a list of GradingFixture
 *   - pipeline: a function (StepInput → Promise<StepVerdictOutcome>)
 *     that the caller has already wired with whichever backends they
 *     want measured
 *
 * Outputs: the 6 metrics from GRADING_ENGINE_V2.md §7.2.
 */

import { gradeStep, type GradeStepDeps } from "@/lib/grading/step-pipeline";
import type {
  StepInput,
  StepVerdict,
  StepVerdictOutcome
} from "@/lib/grading/types";
import type {
  GradingFixture,
  StudentSolutionFixture,
  StudentStepFixture
} from "./types";

export type GradingMetrics = {
  totalSteps: number;
  totalSolutions: number;
  stepCorrect: number;
  stepIncorrect: number;
  escalations: number;
  /** Step-level verdict match rate (committed = expected). */
  stepVerdictAccuracy: number;
  /** Fraction of steps that hit the teacher queue. */
  escalationRate: number;
  /**
   * False positives: we committed VERIFIED but the fixture says
   * INVALID or ESCALATE. The headline "100% accuracy" target depends
   * on this being ~0.
   */
  falseVerifiedCount: number;
  falseVerifiedRate: number;
  /** We committed INVALID but the fixture says VERIFIED. */
  falseInvalidCount: number;
  falseInvalidRate: number;
  /** Whole-problem final-answer accuracy. */
  finalAnswerAccuracy: number;
  byCategory: Record<string, { total: number; matched: number }>;
};

export type StepResult = {
  fixtureKey: string;
  solutionLabel: string;
  stepIndex: number;
  latex: string;
  expected: StudentStepFixture["expectedVerdict"];
  committed: StepVerdict;
  escalated: boolean;
  matched: boolean;
};

export type RunOutput = {
  metrics: GradingMetrics;
  perStep: StepResult[];
};

/**
 * Walk a single solution's steps in order and grade each one. Returns
 * the array of per-step results plus the eventually-committed final
 * answer correctness (true iff every critical milestone has at least
 * one VERIFIED).
 */
async function gradeSolution(
  fixture: GradingFixture,
  solution: StudentSolutionFixture,
  deps: GradeStepDeps
): Promise<{
  perStep: StepResult[];
  finalCorrect: boolean;
}> {
  const perStep: StepResult[] = [];
  const previousSteps: string[] = [];
  let coveredCriticalCount = 0;
  const criticalIds = new Set(
    fixture.rubric.milestones.filter((m) => m.critical).map((m) => m.id)
  );

  for (let i = 0; i < solution.steps.length; i += 1) {
    const step = solution.steps[i];
    const stepInput: StepInput = {
      problemStatement: fixture.problemStatement,
      latex: step.latex,
      previousSteps: [...previousSteps],
      rubric: fixture.rubric
    };

    const out: StepVerdictOutcome = await gradeStep(stepInput, deps);
    const escalated = out.escalation.escalate;
    const expectedIsEscalate = step.expectedVerdict === "ESCALATE";
    const matchedVerdict = expectedIsEscalate
      ? escalated
      : !escalated && out.verdict === step.expectedVerdict;

    perStep.push({
      fixtureKey: fixture.key,
      solutionLabel: solution.label,
      stepIndex: i,
      latex: step.latex,
      expected: step.expectedVerdict,
      committed: out.verdict,
      escalated,
      matched: matchedVerdict
    });

    // Rough heuristic for "did this step hit a critical milestone":
    // we credit each VERIFIED step against one not-yet-covered critical
    // milestone. This is intentionally lenient — the real milestone-
    // mapping logic lives behind generateProofReview and is out of
    // scope for the eval skeleton. Slice C adds rubric-aware matching.
    if (out.verdict === "VERIFIED" && coveredCriticalCount < criticalIds.size) {
      coveredCriticalCount += 1;
    }
    previousSteps.push(step.latex);
  }

  const finalCorrect = coveredCriticalCount === criticalIds.size;
  return { perStep, finalCorrect };
}

export async function runGradingEval(
  fixtures: GradingFixture[],
  deps: GradeStepDeps
): Promise<RunOutput> {
  const perStep: StepResult[] = [];
  const byCategory: GradingMetrics["byCategory"] = {};
  let stepCorrect = 0;
  let stepIncorrect = 0;
  let escalations = 0;
  let falseVerifiedCount = 0;
  let falseInvalidCount = 0;
  let solutionsMatched = 0;
  let totalSolutions = 0;
  let totalSteps = 0;

  for (const fixture of fixtures) {
    for (const solution of fixture.studentSolutions) {
      totalSolutions += 1;
      const cat = byCategory[solution.category] ?? { total: 0, matched: 0 };
      cat.total += 1;
      byCategory[solution.category] = cat;

      const { perStep: stepResults, finalCorrect } = await gradeSolution(
        fixture,
        solution,
        deps
      );
      perStep.push(...stepResults);
      totalSteps += stepResults.length;
      for (const r of stepResults) {
        if (r.matched) stepCorrect += 1;
        else stepIncorrect += 1;
        if (r.escalated) escalations += 1;
        if (r.committed === "VERIFIED" && r.expected !== "VERIFIED") {
          falseVerifiedCount += 1;
        }
        if (r.committed === "INVALID" && r.expected !== "INVALID") {
          falseInvalidCount += 1;
        }
      }

      if (finalCorrect === solution.expectedFinalCorrect) {
        solutionsMatched += 1;
        cat.matched += 1;
      }
    }
  }

  const stepVerdictAccuracy =
    totalSteps > 0 ? stepCorrect / totalSteps : 0;
  const escalationRate = totalSteps > 0 ? escalations / totalSteps : 0;
  const falseVerifiedRate =
    totalSteps > 0 ? falseVerifiedCount / totalSteps : 0;
  const falseInvalidRate = totalSteps > 0 ? falseInvalidCount / totalSteps : 0;
  const finalAnswerAccuracy =
    totalSolutions > 0 ? solutionsMatched / totalSolutions : 0;

  return {
    metrics: {
      totalSteps,
      totalSolutions,
      stepCorrect,
      stepIncorrect,
      escalations,
      stepVerdictAccuracy,
      escalationRate,
      falseVerifiedCount,
      falseVerifiedRate,
      falseInvalidCount,
      falseInvalidRate,
      finalAnswerAccuracy,
      byCategory
    },
    perStep
  };
}

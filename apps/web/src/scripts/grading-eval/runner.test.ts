import { describe, expect, it } from "vitest";
import { runGradingEval } from "@/scripts/grading-eval/runner";
import type { GradingFixture } from "@/scripts/grading-eval/types";
import type { GradeStepDeps } from "@/lib/grading/step-pipeline";
import type { Backend } from "@/lib/grading/backends";
import type { BackendVote, StepInput, StepType } from "@/lib/grading/types";

function fakeBackend(opts: {
  name: string;
  deterministic: boolean;
  handles: ReadonlyArray<StepType>;
  vote: (input: StepInput) => BackendVote;
}): Backend {
  return {
    name: opts.name,
    deterministic: opts.deterministic,
    handles: opts.handles,
    verify: async (input) => opts.vote(input)
  };
}

const fixture: GradingFixture = {
  key: "test-fix",
  source: "INTERNAL_AUTHORED",
  problemStatement: "test",
  rubric: {
    problemId: "test-fix",
    version: "test",
    generatedAt: "2026-05-10T00:00:00.000Z",
    source: "AUTHORED",
    approvedAt: null,
    goalStatement: "always true",
    milestones: [
      {
        id: "test-fix::m1",
        index: 1,
        title: "single",
        claim: "x",
        techniques: [],
        dependsOn: [],
        critical: true
      }
    ],
    commonPitfalls: []
  },
  studentSolutions: [
    {
      label: "match-verified",
      description: "deterministic VERIFIED expected",
      category: "CLEAN_CORRECT",
      steps: [{ latex: "step1", expectedVerdict: "VERIFIED" }],
      expectedFinalCorrect: true
    },
    {
      label: "match-escalate",
      description: "judge-only at low conf should escalate",
      category: "VALID_SCAFFOLD_WRONG_FINAL",
      steps: [{ latex: "step2", expectedVerdict: "ESCALATE" }],
      expectedFinalCorrect: false
    }
  ]
};

const deps: GradeStepDeps = {
  classify: async (s) => ({
    stepType: s.latex.includes("step1") ? "EQUATION" : "CLAIM",
    confidence: 0.9
  }),
  backends: [
    fakeBackend({
      name: "fake-sympy",
      deterministic: true,
      handles: ["EQUATION"],
      vote: () => ({
        source: "SYMPY",
        outcome: "VERIFIED",
        confidence: 0.97,
        evidence: "ok"
      })
    }),
    fakeBackend({
      name: "fake-judge",
      deterministic: false,
      handles: ["CLAIM"],
      vote: () => ({
        source: "LLM_JUDGE",
        outcome: "VERIFIED",
        confidence: 0.9,
        evidence: "looks ok"
      })
    })
  ]
};

describe("runGradingEval", () => {
  it("records step verdict accuracy and escalations", async () => {
    const out = await runGradingEval([fixture], deps);
    expect(out.metrics.totalSteps).toBe(2);
    // step1 should be VERIFIED and match; step2 single-judge → ESCALATE,
    // which matches expectedVerdict ESCALATE.
    expect(out.metrics.stepCorrect).toBe(2);
    expect(out.metrics.escalations).toBe(1);
    expect(out.metrics.stepVerdictAccuracy).toBe(1);
  });

  it("reports zero false-verified on the seed shape", async () => {
    const out = await runGradingEval([fixture], deps);
    expect(out.metrics.falseVerifiedCount).toBe(0);
    expect(out.metrics.falseInvalidCount).toBe(0);
  });

  it("groups solutions by category", async () => {
    const out = await runGradingEval([fixture], deps);
    expect(out.metrics.byCategory.CLEAN_CORRECT.total).toBe(1);
    expect(out.metrics.byCategory.VALID_SCAFFOLD_WRONG_FINAL.total).toBe(1);
  });
});

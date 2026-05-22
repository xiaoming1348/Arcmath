import { describe, expect, it, vi } from "vitest";
import {
  gradeStep,
  type StepClassifier
} from "@/lib/grading/step-pipeline";
import type { Backend } from "@/lib/grading/backends";
import type { BackendVote, StepInput, StepType } from "@/lib/grading/types";

function makeClassifier(stepType: StepType): StepClassifier {
  return async () => ({ stepType, confidence: 0.95 });
}

function fakeBackend(opts: {
  name: string;
  deterministic: boolean;
  handles: ReadonlyArray<StepType>;
  vote: BackendVote;
}): Backend {
  return {
    name: opts.name,
    deterministic: opts.deterministic,
    handles: opts.handles,
    verify: async () => opts.vote
  };
}

const baseInput: StepInput = {
  problemStatement: "irrelevant",
  latex: "(a-b)^2 \\geq 0",
  previousSteps: []
};

describe("gradeStep", () => {
  it("returns VERIFIED when deterministic backend agrees at high confidence", async () => {
    const out = await gradeStep(baseInput, {
      classify: makeClassifier("INEQUALITY"),
      backends: [
        fakeBackend({
          name: "sympy-fake",
          deterministic: true,
          handles: ["INEQUALITY"],
          vote: {
            source: "SYMPY",
            outcome: "VERIFIED",
            confidence: 0.95,
            evidence: "probes pass + symbolic"
          }
        })
      ]
    });
    expect(out.verdict).toBe("VERIFIED");
    expect(out.escalation.escalate).toBe(false);
  });

  it("escalates when only one LLM judge says VERIFIED", async () => {
    const out = await gradeStep(baseInput, {
      classify: makeClassifier("CLAIM"),
      backends: [
        fakeBackend({
          name: "judge",
          deterministic: false,
          handles: ["CLAIM"],
          vote: {
            source: "LLM_JUDGE",
            outcome: "VERIFIED",
            confidence: 0.99,
            evidence: "looks plausible"
          }
        })
      ]
    });
    expect(out.verdict).toBe("UNCERTAIN");
    expect(out.escalation.escalate).toBe(true);
  });

  it("backend exceptions become ABSTAIN votes, not crashes", async () => {
    const exploding: Backend = {
      name: "exploding",
      deterministic: true,
      handles: ["EQUATION"],
      verify: vi.fn(async () => {
        throw new Error("boom");
      })
    };
    const out = await gradeStep(
      { ...baseInput, latex: "1+1=2" },
      {
        classify: makeClassifier("EQUATION"),
        backends: [exploding]
      }
    );
    expect(out.verdict).toBe("UNCERTAIN");
    expect(out.escalation.escalate).toBe(true);
    expect(exploding.verify).toHaveBeenCalledOnce();
  });

  it("only invokes backends that handle the step type", async () => {
    const irrelevant = vi.fn();
    const relevant: Backend = {
      name: "relevant",
      deterministic: true,
      handles: ["EQUATION"],
      verify: async () => ({
        source: "SYMPY",
        outcome: "VERIFIED",
        confidence: 0.97,
        evidence: "ok"
      })
    };
    const skipped: Backend = {
      name: "skipped",
      deterministic: true,
      handles: ["INEQUALITY"],
      verify: irrelevant
    };
    await gradeStep(
      { ...baseInput, latex: "1+1=2" },
      {
        classify: makeClassifier("EQUATION"),
        backends: [relevant, skipped]
      }
    );
    expect(irrelevant).not.toHaveBeenCalled();
  });

  it("respects isCritical when escalating", async () => {
    const out = await gradeStep(baseInput, {
      classify: makeClassifier("CONCLUSION"),
      backends: [
        fakeBackend({
          name: "j1",
          deterministic: false,
          handles: ["CONCLUSION"],
          vote: {
            source: "LLM_JUDGE",
            outcome: "VERIFIED",
            confidence: 0.95,
            evidence: "j1"
          }
        }),
        fakeBackend({
          name: "j2",
          deterministic: false,
          handles: ["CONCLUSION"],
          vote: {
            source: "LLM_JUDGE",
            outcome: "VERIFIED",
            confidence: 0.95,
            evidence: "j2"
          }
        })
      ],
      isCritical: () => true
    });
    expect(out.verdict).toBe("UNCERTAIN");
    if (out.escalation.escalate) {
      expect(out.escalation.reasons).toContain("CRITICAL_MILESTONE");
    }
  });
});

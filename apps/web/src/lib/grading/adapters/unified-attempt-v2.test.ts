import { describe, expect, it, vi } from "vitest";
import {
  isV2Enabled,
  runStepVerificationV2
} from "@/lib/grading/adapters/unified-attempt-v2";
import type { Backend } from "@/lib/grading/backends";
import type { BackendVote, StepType } from "@/lib/grading/types";

vi.mock("@/lib/ai/proof-tutor", async () => {
  return {
    PROOF_LLM_JUDGE_VERSION: "test-judge",
    PROOF_TUTOR_PROMPT_VERSION: "test-prompt",
    classifyStepWithLlm: async () => null,
    generateStepFeedback: async () => ({
      feedbackText: "stub feedback"
    })
  };
});

vi.mock("@/lib/proof-verifier-client", async () => ({
  classifyStep: async () => null,
  verifyStep: async () => null
}));

function backend(opts: {
  source: BackendVote["source"];
  outcome: BackendVote["outcome"];
  confidence: number;
  deterministic: boolean;
  handles: ReadonlyArray<StepType>;
}): Backend {
  return {
    name: `fake-${opts.source}`,
    deterministic: opts.deterministic,
    handles: opts.handles,
    verify: async () => ({
      source: opts.source,
      outcome: opts.outcome,
      confidence: opts.confidence,
      evidence: "stub"
    })
  };
}

describe("runStepVerificationV2 (adapter)", () => {
  it("maps deterministic VERIFIED → v1 VERIFIED + correct backend", async () => {
    const result = await runStepVerificationV2({
      problemStatement: "p",
      latexInput: "a + b = b + a",
      previousSteps: [],
      overrides: {
        classify: async () => ({ stepType: "EQUATION", confidence: 0.9 }),
        backends: [
          backend({
            source: "SYMPY",
            outcome: "VERIFIED",
            confidence: 0.97,
            deterministic: true,
            handles: ["EQUATION"]
          })
        ]
      }
    });
    expect(result.verdict).toBe("VERIFIED");
    expect(result.backend).toBe("SYMPY");
    expect(result.confidence).toBeGreaterThan(0.95);
    expect(result.details.v2Escalated).toBe(false);
    expect(result.feedbackText).toBe("stub feedback");
  });

  it("maps single LLM judge VERIFIED → v1 PENDING (escalated)", async () => {
    const result = await runStepVerificationV2({
      problemStatement: "p",
      latexInput: "claim",
      previousSteps: [],
      overrides: {
        classify: async () => ({ stepType: "CLAIM", confidence: 0.8 }),
        backends: [
          backend({
            source: "LLM_JUDGE",
            outcome: "VERIFIED",
            confidence: 0.99,
            deterministic: false,
            handles: ["CLAIM"]
          })
        ]
      }
    });
    expect(result.verdict).toBe("PENDING");
    expect(result.backend).toBe("LLM_JUDGE");
    expect(result.details.v2Escalated).toBe(true);
    expect(Array.isArray(result.details.v2EscalationReasons)).toBe(true);
  });

  it("maps deterministic INVALID → v1 INVALID", async () => {
    const result = await runStepVerificationV2({
      problemStatement: "p",
      latexInput: "x^2 < 0",
      previousSteps: [],
      overrides: {
        classify: async () => ({ stepType: "INEQUALITY", confidence: 0.9 }),
        backends: [
          backend({
            source: "SYMPY",
            outcome: "INVALID",
            confidence: 0.95,
            deterministic: true,
            handles: ["INEQUALITY"]
          })
        ]
      }
    });
    expect(result.verdict).toBe("INVALID");
    expect(result.backend).toBe("SYMPY");
  });

  it("isV2Enabled reads the env flag", () => {
    const original = process.env.GRADING_ENGINE_VERSION;
    process.env.GRADING_ENGINE_VERSION = "v2";
    expect(isV2Enabled()).toBe(true);
    process.env.GRADING_ENGINE_VERSION = "v1";
    expect(isV2Enabled()).toBe(false);
    delete process.env.GRADING_ENGINE_VERSION;
    expect(isV2Enabled()).toBe(false);
    if (original !== undefined) process.env.GRADING_ENGINE_VERSION = original;
  });
});

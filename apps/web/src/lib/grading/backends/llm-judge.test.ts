import { describe, expect, it } from "vitest";
import { makeLlmJudgeBackend } from "@/lib/grading/backends/llm-judge";
import type { StepInput } from "@/lib/grading/types";

const baseInput: StepInput = {
  problemStatement: "Prove a^2 + b^2 ≥ 2ab.",
  latex: "a^2 + b^2 - 2ab = (a-b)^2 ≥ 0",
  previousSteps: []
};

describe("LlmJudgeBackend", () => {
  it("returns ABSTAIN when invoke returns null (api failure)", async () => {
    const backend = makeLlmJudgeBackend({
      judgeId: 1,
      invoke: async () => null
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.source).toBe("LLM_JUDGE");
    expect(vote.evidence).toContain("returned no result");
  });

  it("returns VERIFIED at high confidence", async () => {
    const backend = makeLlmJudgeBackend({
      judgeId: 1,
      invoke: async () => ({
        verdict: "VERIFIED",
        confidence: 0.96,
        reason: "expansion is correct"
      })
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("VERIFIED");
    expect(vote.confidence).toBe(0.96);
    expect(vote.evidence).toContain("judge-1");
  });

  it("demotes low-confidence VERIFIED to ABSTAIN", async () => {
    const backend = makeLlmJudgeBackend({
      judgeId: 2,
      invoke: async () => ({
        verdict: "VERIFIED",
        confidence: 0.7,
        reason: "looks plausible"
      })
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.evidence).toContain("hedged");
    expect(vote.details?.rawVerdict).toBe("VERIFIED");
  });

  it("demotes low-confidence INVALID to ABSTAIN too", async () => {
    const backend = makeLlmJudgeBackend({
      judgeId: 1,
      invoke: async () => ({
        verdict: "INVALID",
        confidence: 0.6,
        reason: "maybe wrong"
      })
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
  });

  it("keeps explicit ABSTAIN at face value", async () => {
    const backend = makeLlmJudgeBackend({
      judgeId: 1,
      invoke: async () => ({
        verdict: "ABSTAIN",
        confidence: 0.3,
        reason: "not enough context"
      })
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.confidence).toBe(0.3);
  });

  it("declares non-deterministic", () => {
    const backend = makeLlmJudgeBackend({ judgeId: 1, invoke: async () => null });
    expect(backend.deterministic).toBe(false);
  });
});

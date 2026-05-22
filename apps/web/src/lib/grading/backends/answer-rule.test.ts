import { describe, expect, it } from "vitest";
import { makeAnswerRuleBackend } from "@/lib/grading/backends/answer-rule";
import type { StepInput } from "@/lib/grading/types";

function step(latex: string): StepInput {
  return { problemStatement: "p", latex, previousSteps: [] };
}

describe("AnswerRuleBackend", () => {
  it("VERIFIED on textbook-equal forms", async () => {
    const backend = makeAnswerRuleBackend({ canonicalAnswer: "3/4" });
    const vote = await backend.verify(step("\\frac{12}{16}"));
    expect(vote.outcome).toBe("VERIFIED");
    expect(vote.confidence).toBeGreaterThan(0.99);
    expect(vote.source).toBe("RULE");
  });

  it("INVALID on provably different rationals", async () => {
    const backend = makeAnswerRuleBackend({ canonicalAnswer: "3/4" });
    const vote = await backend.verify(step("4/5"));
    expect(vote.outcome).toBe("INVALID");
    expect(vote.confidence).toBeGreaterThan(0.95);
  });

  it("ABSTAIN on UNKNOWN forms (defers to SymPy/LLM)", async () => {
    const backend = makeAnswerRuleBackend({
      canonicalAnswer: "(1+\\sqrt 5)/2"
    });
    const vote = await backend.verify(step("\\frac{1+\\sqrt{5}}{2}"));
    expect(vote.outcome).toBe("ABSTAIN");
  });

  it("is declared deterministic", () => {
    const backend = makeAnswerRuleBackend({ canonicalAnswer: "1" });
    expect(backend.deterministic).toBe(true);
  });
});

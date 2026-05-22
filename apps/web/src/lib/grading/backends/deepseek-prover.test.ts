import { describe, expect, it } from "vitest";
import { makeDeepSeekProverBackend } from "@/lib/grading/backends/deepseek-prover";
import type { StepInput } from "@/lib/grading/types";

const baseInput: StepInput = {
  problemStatement: "Prove that for all real x, x^2 ≥ 0.",
  latex: "theorem sq_nonneg_real (x : ℝ) : 0 ≤ x ^ 2 :=",
  previousSteps: []
};

describe("DeepSeekProverBackend", () => {
  it("returns VERIFIED when prover produces a kernel-checking proof", async () => {
    const backend = makeDeepSeekProverBackend({
      invoke: async () => ({
        leanCode: "exact sq_nonneg x",
        model: "deepseek-prover-v2"
      }),
      kernelVerify: async ({ leanCode }) => {
        expect(leanCode).toContain("exact sq_nonneg x");
        return { verdict: "VERIFIED", details: { ok: true } };
      }
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("VERIFIED");
    expect(vote.confidence).toBeGreaterThan(0.99);
    expect(vote.source).toBe("LEAN");
    expect(vote.details?.model).toBe("deepseek-prover-v2");
  });

  it("ABSTAINs when the prover returns sorry", async () => {
    const backend = makeDeepSeekProverBackend({
      invoke: async () => ({ leanCode: "sorry", model: "test" }),
      kernelVerify: async () => {
        throw new Error("kernel should not be called");
      }
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("prover_sorry");
  });

  it("ABSTAINs when the prover is unreachable", async () => {
    const backend = makeDeepSeekProverBackend({
      invoke: async () => null,
      kernelVerify: async () => null
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("prover_failed");
  });

  it("ABSTAINs (not INVALID) when kernel rejects the prover output", async () => {
    const backend = makeDeepSeekProverBackend({
      invoke: async () => ({ leanCode: "exact wrong_lemma", model: "t" }),
      kernelVerify: async () => ({
        verdict: "INVALID",
        details: { reason: "unknown identifier" }
      })
    });
    const vote = await backend.verify(baseInput);
    // Prover being wrong != claim being false. We abstain so we don't
    // create a spurious INVALID on the merge layer.
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("kernel_rejected");
  });

  it("ABSTAINs when kernel is unreachable", async () => {
    const backend = makeDeepSeekProverBackend({
      invoke: async () => ({ leanCode: "exact sq_nonneg x", model: "t" }),
      kernelVerify: async () => null
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("kernel_unreachable");
  });

  it("only handles CLAIM steps", () => {
    const backend = makeDeepSeekProverBackend();
    expect(backend.handles).toEqual(["CLAIM"]);
  });

  it("is declared deterministic (verdict gated on kernel)", () => {
    const backend = makeDeepSeekProverBackend();
    expect(backend.deterministic).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { mergeVotes } from "@/lib/grading/confidence";
import type { BackendVote } from "@/lib/grading/types";

const sympy = (
  outcome: BackendVote["outcome"],
  confidence: number,
  evidence = "sympy"
): BackendVote => ({
  source: "SYMPY",
  outcome,
  confidence,
  evidence
});

const lean = (
  outcome: BackendVote["outcome"],
  confidence: number,
  evidence = "lean"
): BackendVote => ({
  source: "LEAN",
  outcome,
  confidence,
  evidence
});

const judge = (
  outcome: BackendVote["outcome"],
  confidence: number,
  evidence = "judge"
): BackendVote => ({
  source: "LLM_JUDGE",
  outcome,
  confidence,
  evidence
});

describe("mergeVotes", () => {
  it("returns UNCERTAIN when no votes", () => {
    expect(mergeVotes([])).toMatchObject({ verdict: "UNCERTAIN", confidence: 0 });
  });

  it("returns UNCERTAIN when all votes are ABSTAIN", () => {
    expect(
      mergeVotes([sympy("ABSTAIN", 0), lean("ABSTAIN", 0)])
    ).toMatchObject({ verdict: "UNCERTAIN", confidence: 0 });
  });

  it("commits VERIFIED on a single deterministic VERIFIED", () => {
    const m = mergeVotes([sympy("VERIFIED", 0.97)]);
    expect(m.verdict).toBe("VERIFIED");
    expect(m.confidence).toBeGreaterThanOrEqual(0.97);
  });

  it("commits INVALID on a single deterministic INVALID", () => {
    const m = mergeVotes([sympy("INVALID", 0.92)]);
    expect(m.verdict).toBe("INVALID");
    expect(m.confidence).toBeCloseTo(0.92, 5);
  });

  it("noisy-OR combines two agreeing deterministic backends", () => {
    const m = mergeVotes([sympy("VERIFIED", 0.9), lean("VERIFIED", 0.9)]);
    expect(m.verdict).toBe("VERIFIED");
    // 1 - (0.1 * 0.1) = 0.99
    expect(m.confidence).toBeCloseTo(0.99, 3);
  });

  it("UNCERTAIN when two deterministic backends disagree (software bug)", () => {
    const m = mergeVotes([sympy("VERIFIED", 0.95), lean("INVALID", 0.95)]);
    expect(m.verdict).toBe("UNCERTAIN");
    expect(m.confidence).toBe(0);
    expect(m.dissenting).toHaveLength(2);
  });

  it("LLM agreement nudges deterministic confidence up", () => {
    const baseline = mergeVotes([sympy("VERIFIED", 0.9)]);
    const withJudge = mergeVotes([
      sympy("VERIFIED", 0.9),
      judge("VERIFIED", 0.8)
    ]);
    expect(withJudge.confidence).toBeGreaterThan(baseline.confidence);
  });

  it("LLM dissent does NOT lower deterministic verdict", () => {
    const m = mergeVotes([
      sympy("VERIFIED", 0.95),
      judge("INVALID", 0.9)
    ]);
    expect(m.verdict).toBe("VERIFIED");
    expect(m.confidence).toBeGreaterThanOrEqual(0.95);
    expect(m.dissenting).toHaveLength(1);
  });

  it("single LLM judge alone never commits — UNCERTAIN", () => {
    const m = mergeVotes([judge("VERIFIED", 0.99)]);
    expect(m.verdict).toBe("UNCERTAIN");
    expect(m.dissenting).toHaveLength(1);
  });

  it("two LLM judges agreeing at low confidence do NOT commit", () => {
    const m = mergeVotes([judge("VERIFIED", 0.85), judge("VERIFIED", 0.85)]);
    expect(m.verdict).toBe("UNCERTAIN");
  });

  it("two LLM judges VERIFIED alone (no SymPy probe-pass) still UNCERTAIN", () => {
    // Without a coincident SymPy probe-pass we treat dual-judge
    // VERIFIED as untrusted (LLM hallucination risk).
    const m = mergeVotes([judge("VERIFIED", 0.99), judge("VERIFIED", 0.99)]);
    expect(m.verdict).toBe("UNCERTAIN");
    expect(m.dissenting).toHaveLength(2);
  });

  it("dual-judge VERIFIED + SymPy probe-pass DOES commit (capped 0.92)", () => {
    const sympyProbePass: BackendVote = {
      source: "SYMPY",
      outcome: "ABSTAIN",
      confidence: 0.55,
      evidence: "probes pass; symbolic simplify inconclusive",
      details: { stage: "numeric_probe", operator: "\\geq" }
    };
    const m = mergeVotes([
      sympyProbePass,
      judge("VERIFIED", 0.96),
      judge("VERIFIED", 0.96)
    ]);
    expect(m.verdict).toBe("VERIFIED");
    expect(m.confidence).toBeLessThanOrEqual(0.92);
    expect(m.confidence).toBeGreaterThan(0.9);
  });

  it("dual-judge VERIFIED at 0.94 each does NOT clear the 0.95 carve-out", () => {
    const sympyProbePass: BackendVote = {
      source: "SYMPY",
      outcome: "ABSTAIN",
      confidence: 0.55,
      evidence: "probes pass; symbolic simplify inconclusive",
      details: { stage: "numeric_probe" }
    };
    const m = mergeVotes([
      sympyProbePass,
      judge("VERIFIED", 0.94),
      judge("VERIFIED", 0.94)
    ]);
    expect(m.verdict).toBe("UNCERTAIN");
  });

  it("dual-judge VERIFIED low-conf + SymPy probe-pass still UNCERTAIN", () => {
    const sympyProbePass: BackendVote = {
      source: "SYMPY",
      outcome: "ABSTAIN",
      confidence: 0.55,
      evidence: "probes pass; symbolic simplify inconclusive",
      details: { stage: "numeric_probe" }
    };
    const m = mergeVotes([
      sympyProbePass,
      judge("VERIFIED", 0.88),
      judge("VERIFIED", 0.88)
    ]);
    expect(m.verdict).toBe("UNCERTAIN");
  });

  it("two LLM judges agreeing on INVALID at high confidence DO commit", () => {
    // INVALID is allowed for LLM-only because false-INVALID is
    // recoverable through teacher review and LLMs are usually right
    // about specific algebraic errors.
    const m = mergeVotes([judge("INVALID", 0.95), judge("INVALID", 0.95)]);
    expect(m.verdict).toBe("INVALID");
    expect(m.confidence).toBeLessThanOrEqual(0.95);
    expect(m.confidence).toBeGreaterThanOrEqual(0.94);
  });

  it("LLM judges disagreeing → UNCERTAIN with both recorded", () => {
    const m = mergeVotes([
      judge("VERIFIED", 0.93),
      judge("INVALID", 0.93)
    ]);
    expect(m.verdict).toBe("UNCERTAIN");
    expect(m.dissenting).toHaveLength(2);
  });
});

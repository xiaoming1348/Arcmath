import { describe, expect, it } from "vitest";
import { decideEscalation } from "@/lib/grading/escalation";
import type { BackendVote, StepType } from "@/lib/grading/types";
import { mergeVotes } from "@/lib/grading/confidence";

function run(
  stepType: StepType,
  votes: BackendVote[],
  isCritical = false
) {
  return decideEscalation({
    stepType,
    merge: mergeVotes(votes),
    votes,
    isCritical
  });
}

describe("decideEscalation", () => {
  it("does not escalate a high-confidence deterministic VERIFIED", () => {
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "VERIFIED",
        confidence: 0.98,
        evidence: "lhs - rhs simplifies to 0"
      }
    ]);
    expect(r.decision.escalate).toBe(false);
    expect(r.committedVerdict).toBe("VERIFIED");
  });

  it("escalates when no backend offered a non-ABSTAIN opinion", () => {
    const r = run("CLAIM", [
      {
        source: "SYMPY",
        outcome: "ABSTAIN",
        confidence: 0,
        evidence: "no operator"
      }
    ]);
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("NO_BACKEND_OPINION");
    }
    expect(r.committedVerdict).toBe("UNCERTAIN");
  });

  it("escalates SymPy parser failure on EQUATION", () => {
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "ABSTAIN",
        confidence: 0,
        evidence: "parse failed",
        details: { stage: "parse" }
      }
    ]);
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("PARSER_FAILED");
    }
  });

  it("escalates a critical milestone with no deterministic backing", () => {
    const r = run(
      "CONCLUSION",
      [
        {
          source: "LLM_JUDGE",
          outcome: "VERIFIED",
          confidence: 0.95,
          evidence: "judge1"
        },
        {
          source: "LLM_JUDGE",
          outcome: "VERIFIED",
          confidence: 0.95,
          evidence: "judge2"
        }
      ],
      /* critical */ true
    );
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("CRITICAL_MILESTONE");
    }
  });

  it("escalates Lean toolchain unavailable on critical step", () => {
    const r = run(
      "CONCLUSION",
      [
        {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "lake missing",
          details: { stage: "workspace_missing" }
        }
      ],
      /* critical */ true
    );
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("TOOLCHAIN_UNAVAILABLE");
    }
  });

  it("does NOT escalate Lean toolchain unavailable on non-critical step", () => {
    const r = run(
      "EQUATION",
      [
        {
          source: "SYMPY",
          outcome: "VERIFIED",
          confidence: 0.97,
          evidence: "ok"
        },
        {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "lake missing",
          details: { stage: "workspace_missing" }
        }
      ],
      /* critical */ false
    );
    expect(r.decision.escalate).toBe(false);
  });

  it("escalates LLM judges disagreeing", () => {
    const r = run("CLAIM", [
      {
        source: "LLM_JUDGE",
        outcome: "VERIFIED",
        confidence: 0.93,
        evidence: "j1"
      },
      {
        source: "LLM_JUDGE",
        outcome: "INVALID",
        confidence: 0.93,
        evidence: "j2"
      }
    ]);
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("JUDGES_DISAGREE");
    }
    expect(r.committedVerdict).toBe("UNCERTAIN");
  });

  it("escalates low-confidence deterministic verdicts", () => {
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "VERIFIED",
        confidence: 0.5,
        evidence: "weak signal"
      }
    ]);
    expect(r.decision.escalate).toBe(true);
    if (r.decision.escalate) {
      expect(r.decision.reasons).toContain("LOW_CONFIDENCE");
    }
  });

  it("commits deterministic INVALID at the lower invalid floor", () => {
    // SymPy returns INVALID at 0.9 from a numeric probe; EQUATION's
    // VERIFIED floor is 0.95, but the INVALID floor is 0.85, so this
    // SHOULD commit instead of escalating.
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "INVALID",
        confidence: 0.9,
        evidence: "counterexample at x=1, y=1"
      }
    ]);
    expect(r.decision.escalate).toBe(false);
    expect(r.committedVerdict).toBe("INVALID");
  });

  it("still escalates very-low-confidence INVALID", () => {
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "INVALID",
        confidence: 0.5,
        evidence: "single probe failed"
      }
    ]);
    expect(r.decision.escalate).toBe(true);
  });

  it("keeps VERIFIED bar strict even when INVALID bar is lower", () => {
    // 0.9 is enough for INVALID-EQUATION (0.85 floor) but not for
    // VERIFIED-EQUATION (0.95 floor).
    const r = run("EQUATION", [
      {
        source: "SYMPY",
        outcome: "VERIFIED",
        confidence: 0.9,
        evidence: "weak"
      }
    ]);
    expect(r.decision.escalate).toBe(true);
  });

  it("dedupes reasons when multiple gates fire", () => {
    const r = run(
      "EQUATION",
      [
        {
          source: "SYMPY",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "parse failed",
          details: { stage: "parse" }
        }
      ],
      /* critical */ true
    );
    if (r.decision.escalate) {
      const reasons = r.decision.reasons;
      const unique = new Set(reasons);
      expect(unique.size).toBe(reasons.length);
    }
  });
});

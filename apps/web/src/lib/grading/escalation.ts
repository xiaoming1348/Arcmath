/**
 * Escalation gate. Decides whether the engine should commit to a verdict
 * or queue the step for the teacher.
 *
 * Pure function — depends only on the merge outcome, the step type, and
 * (optionally) whether the step is on a critical milestone path.
 *
 * See GRADING_ENGINE_V2.md §4 for the policy table. Thresholds live here
 * as named constants so the eval harness can A/B them.
 */

import type { MergeOutcome } from "./confidence";
import type {
  BackendVote,
  EscalationDecision,
  EscalationReason,
  StepType,
  StepVerdict
} from "./types";
import { isDeterministicSource } from "./types";

/**
 * Per-step-type confidence floor. A merged outcome below this floor is
 * automatically escalated.
 *
 * We use two separate floors:
 *   - VERIFIED needs the higher bar because false-VERIFIED (saying
 *     "you got it right" when the student is wrong) is a trust-breaker.
 *   - INVALID can commit at a slightly lower bar — false-INVALID just
 *     routes the step to the teacher queue with an explanation, which
 *     is recoverable; the student sees "your step looks wrong, here's
 *     why, but ask the teacher to confirm".
 *
 * Numbers picked to keep false-VERIFIED ≤ 0.5% on the gold set;
 * tunable via the eval harness.
 */
export const COMMIT_THRESHOLD: Record<StepType, number> = {
  EQUATION: 0.95,
  ALGEBRAIC_EQUIVALENCE: 0.95,
  INEQUALITY: 0.92,
  CLAIM: 0.9,
  DEDUCTION: 0.9,
  CASE_SPLIT: 0.95,
  CONCLUSION: 0.95,
  UNKNOWN: 0.95
};

export const COMMIT_THRESHOLD_INVALID: Record<StepType, number> = {
  EQUATION: 0.85,
  ALGEBRAIC_EQUIVALENCE: 0.85,
  INEQUALITY: 0.82,
  CLAIM: 0.85,
  DEDUCTION: 0.85,
  CASE_SPLIT: 0.85,
  CONCLUSION: 0.9,
  UNKNOWN: 0.9
};

export type EscalationInput = {
  stepType: StepType;
  merge: MergeOutcome;
  /** Original votes BEFORE merge (so we can detect parser failures etc.). */
  votes: BackendVote[];
  /**
   * If the rubric flags this step's milestone as critical, we're stricter.
   */
  isCritical: boolean;
};

/**
 * Returns the escalation decision and the *committed* verdict. The
 * committed verdict differs from the merge verdict only when escalation
 * downgrades VERIFIED/INVALID → UNCERTAIN.
 */
export function decideEscalation(input: EscalationInput): {
  decision: EscalationDecision;
  committedVerdict: StepVerdict;
  committedConfidence: number;
} {
  const reasons: EscalationReason[] = [];

  // 1. No backend produced a verdict at all.
  if (input.merge.active.length === 0 && input.merge.dissenting.length === 0) {
    reasons.push("NO_BACKEND_OPINION");
  }

  // 2. SymPy parsed-fail on a step type SymPy is supposed to handle.
  const sympyError = input.votes.find(
    (v) =>
      v.source === "SYMPY" &&
      v.outcome === "ABSTAIN" &&
      typeof v.details?.["stage"] === "string" &&
      (v.details["stage"] as string).startsWith("parse")
  );
  const sympyExpected =
    input.stepType === "EQUATION" ||
    input.stepType === "ALGEBRAIC_EQUIVALENCE" ||
    input.stepType === "INEQUALITY";
  if (sympyError && sympyExpected) {
    reasons.push("PARSER_FAILED");
  }

  // 3. Lean toolchain unavailable on a critical step.
  const leanWarn = input.votes.find(
    (v) =>
      v.source === "LEAN" &&
      v.outcome === "ABSTAIN" &&
      typeof v.details?.["stage"] === "string" &&
      (v.details["stage"] as string).includes("workspace_missing")
  );
  if (leanWarn && input.isCritical) {
    reasons.push("TOOLCHAIN_UNAVAILABLE");
  }

  // 4. Confidence below the per-type floor. INVALID gets a slightly
  // more permissive floor since false-INVALID is recoverable through
  // teacher review whereas false-VERIFIED is a trust-breaker.
  const floor =
    input.merge.verdict === "INVALID"
      ? COMMIT_THRESHOLD_INVALID[input.stepType] ?? 0.9
      : COMMIT_THRESHOLD[input.stepType] ?? 0.95;
  if (input.merge.confidence < floor) {
    reasons.push("LOW_CONFIDENCE");
  }

  // 5. Critical milestone with no deterministic backing — never commit.
  if (input.isCritical) {
    const hasDeterministic = input.merge.active.some((v) =>
      isDeterministicSource(v.source)
    );
    if (!hasDeterministic) {
      reasons.push("CRITICAL_MILESTONE");
    }
  }

  // 6. Dissent across votes — judges disagreed and merge produced UNCERTAIN.
  if (
    input.merge.verdict === "UNCERTAIN" &&
    input.merge.dissenting.length > 0
  ) {
    reasons.push("JUDGES_DISAGREE");
  }

  if (reasons.length === 0) {
    return {
      decision: { escalate: false },
      committedVerdict: input.merge.verdict,
      committedConfidence: input.merge.confidence
    };
  }

  // Escalation always forces UNCERTAIN as the committed verdict — we'd
  // rather wait for a teacher than expose a borderline call to a student.
  return {
    decision: { escalate: true, reasons: dedupReasons(reasons) },
    committedVerdict: "UNCERTAIN",
    committedConfidence: input.merge.confidence
  };
}

function dedupReasons(reasons: EscalationReason[]): EscalationReason[] {
  return Array.from(new Set(reasons));
}

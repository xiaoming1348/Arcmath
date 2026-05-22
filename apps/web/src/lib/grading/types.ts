/**
 * Canonical types for the v2 grading engine.
 *
 * Read GRADING_ENGINE_V2.md first. The terms here intentionally collapse
 * the older (Verdict / Backend / status) zoo into a single shape that is
 * easy to merge across heterogeneous backends and easy to escalate.
 */

/** Coarse step taxonomy — same set as PROOF_STEP_TYPES from proof-tutor.ts. */
export const STEP_TYPES = [
  "ALGEBRAIC_EQUIVALENCE",
  "EQUATION",
  "INEQUALITY",
  "CLAIM",
  "DEDUCTION",
  "CASE_SPLIT",
  "CONCLUSION",
  "UNKNOWN"
] as const;
export type StepType = (typeof STEP_TYPES)[number];

/**
 * The three user-facing verdicts. Anything we cannot commit to is
 * UNCERTAIN; UNCERTAIN with `escalate=TEACHER_REVIEW` becomes a teacher
 * task.
 */
export const STEP_VERDICTS = ["VERIFIED", "INVALID", "UNCERTAIN"] as const;
export type StepVerdict = (typeof STEP_VERDICTS)[number];

/**
 * Source of a single backend's vote. We separate sources because the merge
 * rules differ: deterministic backends (SYMPY, LEAN, RULE, EQUIV_PROVER)
 * can singlehandedly produce VERIFIED / INVALID, LLM judges cannot.
 */
export const BACKEND_SOURCES = [
  "SYMPY",
  "LEAN",
  "RULE",
  "EQUIV_PROVER",
  "RUBRIC_MATCH",
  "LLM_JUDGE",
  "TEACHER",
  "NONE"
] as const;
export type BackendSource = (typeof BACKEND_SOURCES)[number];

/** Whether a backend's evidence is rigorous (true) or heuristic (false). */
export function isDeterministicSource(source: BackendSource): boolean {
  return (
    source === "SYMPY" ||
    source === "LEAN" ||
    source === "RULE" ||
    source === "EQUIV_PROVER" ||
    source === "TEACHER"
  );
}

/**
 * One backend's contribution to grading a single step. Backends do not
 * produce UNCERTAIN themselves — they either VERIFIED, INVALID, or ABSTAIN.
 * UNCERTAIN is something the merge layer produces, never an individual
 * voter.
 */
export type BackendVote = {
  source: BackendSource;
  /** ABSTAIN means "I have no opinion, ignore me in the merge". */
  outcome: "VERIFIED" | "INVALID" | "ABSTAIN";
  /** Calibrated probability of correctness in [0, 1]. ABSTAIN ⇒ 0. */
  confidence: number;
  /** Smallest snippet a teacher can audit. */
  evidence: string;
  /** Optional structured payload (counterexamples, kernel error tail, …). */
  details?: Record<string, unknown>;
};

/**
 * Reason an escalation was raised. Useful for the teacher queue so a
 * reviewer can prioritize ("Lean toolchain unavailable" is a process
 * failure; "judges disagree" is a content question).
 */
export const ESCALATION_REASONS = [
  "LOW_CONFIDENCE",
  "JUDGES_DISAGREE",
  "PARSER_FAILED",
  "TOOLCHAIN_UNAVAILABLE",
  "CRITICAL_MILESTONE",
  "NO_BACKEND_OPINION"
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export type EscalationDecision =
  | { escalate: false }
  | { escalate: true; reasons: EscalationReason[] };

/** What the engine emits for a single student step. */
export type StepVerdictOutcome = {
  verdict: StepVerdict;
  /** Calibrated final confidence after merge. UNCERTAIN ⇒ may be low. */
  confidence: number;
  /** Aggregated evidence string suitable for showing to the teacher. */
  evidence: string;
  /** Each backend's individual vote, kept for audit. */
  votes: BackendVote[];
  /** Whether a teacher needs to look at this step. */
  escalation: EscalationDecision;
  /** Step type as classified at pipeline entry. */
  stepType: StepType;
};

/**
 * Per-step input the pipeline accepts. `previousSteps` are already-
 * verified neighbouring steps so the LLM judge / classifier can reason
 * with context.
 */
export type StepInput = {
  problemStatement: string;
  /** Student's step expression — LaTeX or plain math. */
  latex: string;
  /** Previous student steps in this proof, in order. */
  previousSteps: string[];
  /** Optional rubric the engine uses to map this step to a milestone. */
  rubric?: import("./rubric").Rubric;
};

/** Per-problem aggregate output. */
export type ProblemGradingOutcome = {
  steps: StepVerdictOutcome[];
  /** Coverage of each milestone in the rubric (if a rubric is present). */
  milestoneCoverage: MilestoneCoverageEntry[];
  /** True iff every CRITICAL milestone has a VERIFIED ESTABLISHED hit. */
  finalAnswerCorrect: boolean | null;
  /** Overall escalation summary for the teacher queue. */
  escalation: EscalationDecision;
};

/** Per-milestone status against a student's full proof. */
export const MILESTONE_STATUSES = [
  "ESTABLISHED",
  "REPLACED",
  "PARTIAL",
  "MISSING",
  "INVALID"
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export type MilestoneCoverageEntry = {
  milestoneId: string;
  index: number;
  status: MilestoneStatus;
  evidence: string;
  /** Confidence the merge has in this status. */
  confidence: number;
  /** Which student step(s) (1-based indices) supported the call. */
  supportingStepIndices: number[];
};

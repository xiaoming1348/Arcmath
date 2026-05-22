/**
 * Adapter that lets the existing `unified-attempt` tRPC router call the
 * v2 grading engine while presenting the same return shape that v1's
 * `runStepVerification` did.
 *
 * Activated via env: GRADING_ENGINE_VERSION === "v2".
 *
 * Why an adapter rather than refactoring the router: the v2 verdict
 * taxonomy (VERIFIED / INVALID / UNCERTAIN + escalation) does not match
 * the v1 enum (VERIFIED / INVALID / PLAUSIBLE / UNKNOWN / ERROR /
 * PENDING). We collapse v2 into v1 at this boundary so the DB writes
 * and downstream review prompts keep working without a migration. The
 * extra information (escalation reasons, per-backend votes) is stashed
 * in `details` for UI to surface.
 */

import {
  PROOF_LLM_JUDGE_VERSION,
  PROOF_TUTOR_PROMPT_VERSION,
  classifyStepWithLlm,
  generateStepFeedback,
  type ProofStepType,
  type ProofStepVerdict
} from "@/lib/ai/proof-tutor";
import { classifyStep } from "@/lib/proof-verifier-client";
import {
  defaultJudgePair,
  makeLeanClaimBackend,
  makeSympyBackend
} from "@/lib/grading/backends";
import { gradeStep, type GradeStepDeps } from "@/lib/grading/step-pipeline";
import type { StepInput, StepType, StepVerdict } from "@/lib/grading/types";

export type V1RunStepResult = {
  stepType: ProofStepType;
  verdict: ProofStepVerdict;
  backend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
  confidence: number;
  details: Record<string, unknown>;
  feedbackText: string;
  promptVersion: string;
  classifierVersion: string;
};

export const GRADING_ENGINE_VERSION_ENV = "GRADING_ENGINE_VERSION";
export const V2_FEATURE_FLAG_VALUE = "v2";

export function isV2Enabled(): boolean {
  return (
    (process.env[GRADING_ENGINE_VERSION_ENV] ?? "v1").toLowerCase() ===
    V2_FEATURE_FLAG_VALUE
  );
}

function mapVerdict(v: StepVerdict, escalated: boolean): ProofStepVerdict {
  if (escalated) return "PENDING";
  switch (v) {
    case "VERIFIED":
      return "VERIFIED";
    case "INVALID":
      return "INVALID";
    case "UNCERTAIN":
    default:
      return "UNKNOWN";
  }
}

function deriveBackend(
  votes: { source: string; outcome: string }[]
): V1RunStepResult["backend"] {
  // Pick the first non-ABSTAIN deterministic source; else first non-ABSTAIN
  // LLM judge; else NONE.
  const active = votes.filter((v) => v.outcome !== "ABSTAIN");
  const det = active.find(
    (v) => v.source === "SYMPY" || v.source === "LEAN" || v.source === "RULE"
  );
  if (det?.source === "SYMPY") return "SYMPY";
  if (det?.source === "LEAN") return "LEAN";
  if (det?.source === "RULE") return "CLASSIFIER_ONLY";
  const judge = active.find((v) => v.source === "LLM_JUDGE");
  if (judge) return "LLM_JUDGE";
  return "NONE";
}

export type V2StepClassifier = (
  input: StepInput
) => Promise<{ stepType: StepType; confidence: number }>;

function makeClassifier(): V2StepClassifier {
  return async (input: StepInput) => {
    // 1. Try the Python rule-based classifier in the verifier service.
    const local = await classifyStep({
      latex: input.latex,
      previousSteps: input.previousSteps
    });
    if (local && local.stepType !== "UNKNOWN" && local.confidence >= 0.6) {
      return { stepType: local.stepType, confidence: local.confidence };
    }
    // 2. Fall back to the LLM classifier.
    const llm = await classifyStepWithLlm({
      latex: input.latex,
      previousSteps: input.previousSteps
    });
    if (llm) return { stepType: llm.stepType, confidence: llm.confidence };
    if (local) return { stepType: local.stepType, confidence: local.confidence };
    return { stepType: "UNKNOWN", confidence: 0 };
  };
}

/** Build the shared backend list. Constructed lazily so tests can substitute. */
function makeDefaultBackends(): GradeStepDeps["backends"] {
  return [makeSympyBackend({}), makeLeanClaimBackend({}), ...defaultJudgePair()];
}

export type RunStepVerificationV2Params = {
  problemStatement: string;
  latexInput: string;
  previousSteps: string[];
  /**
   * UI locale forwarded to the mentor LLM so feedback comes back in
   * the student's language. Defaults to "en".
   */
  locale?: "en" | "zh";
  /** Optional override for tests to inject stubbed backends/classifiers. */
  overrides?: Partial<GradeStepDeps>;
};

export async function runStepVerificationV2(
  params: RunStepVerificationV2Params
): Promise<V1RunStepResult> {
  const deps: GradeStepDeps = {
    classify: params.overrides?.classify ?? makeClassifier(),
    backends: params.overrides?.backends ?? makeDefaultBackends(),
    isCritical:
      params.overrides?.isCritical ??
      ((stepType) => stepType === "CONCLUSION")
  };
  const out = await gradeStep(
    {
      problemStatement: params.problemStatement,
      latex: params.latexInput,
      previousSteps: params.previousSteps
    },
    deps
  );

  const backend = deriveBackend(out.votes);
  const verdict = mapVerdict(out.verdict, out.escalation.escalate);

  // Reuse the existing v1 feedback generator so the UI / DB column for
  // `feedbackText` keeps the same tone. We pass the v2 verdict re-cast
  // into v1 vocabulary; the generator's prompt is verdict-aware.
  const feedback = await generateStepFeedback({
    problemStatement: params.problemStatement,
    stepLatex: params.latexInput,
    stepType: out.stepType,
    verdict,
    verificationBackend: backend,
    verificationReason: out.evidence,
    previousSteps: params.previousSteps,
    locale: params.locale
  });

  const escalationReasons = out.escalation.escalate
    ? out.escalation.reasons
    : [];

  return {
    stepType: out.stepType,
    verdict,
    backend,
    confidence: out.confidence,
    details: {
      v2Evidence: out.evidence,
      v2Votes: out.votes,
      v2Escalated: out.escalation.escalate,
      v2EscalationReasons: escalationReasons,
      // Keep one of these for legacy callers that key on `note`/`stage`.
      note: out.escalation.escalate
        ? `escalate: ${escalationReasons.join(",")}`
        : "v2 grader committed verdict",
      source: PROOF_LLM_JUDGE_VERSION
    },
    feedbackText: feedback.feedbackText,
    promptVersion: `${PROOF_TUTOR_PROMPT_VERSION}+v2`,
    classifierVersion: "v2-grading-engine"
  };
}

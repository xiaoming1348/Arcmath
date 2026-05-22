/**
 * v2 step pipeline. Glues classifier → backend fan-out → confidence merge
 * → escalation gate. Pure orchestration; the heavy lifting lives in the
 * individual backends.
 */

import { mergeVotes } from "./confidence";
import { decideEscalation } from "./escalation";
import { fanOut, type Backend } from "./backends";
import type { Rubric } from "./rubric";
import type {
  StepInput,
  StepType,
  StepVerdictOutcome
} from "./types";

export type StepClassifier = (
  input: StepInput
) => Promise<{ stepType: StepType; confidence: number }>;

export type GradeStepDeps = {
  classify: StepClassifier;
  backends: ReadonlyArray<Backend>;
  /**
   * Optional helper that decides whether the current step's milestone is
   * critical. Defaults to "non-critical" when omitted so a missing rubric
   * does not silently turn every step into a teacher escalation.
   */
  isCritical?: (stepType: StepType, rubric?: Rubric) => boolean;
};

export async function gradeStep(
  input: StepInput,
  deps: GradeStepDeps
): Promise<StepVerdictOutcome> {
  const cls = await deps.classify(input);
  const stepType = cls.stepType;

  const votes = await fanOut(input, deps.backends, stepType);
  const merge = mergeVotes(votes);

  const isCritical =
    deps.isCritical?.(stepType, input.rubric) ?? false;

  const gate = decideEscalation({
    stepType,
    merge,
    votes,
    isCritical
  });

  return {
    verdict: gate.committedVerdict,
    confidence: gate.committedConfidence,
    evidence: merge.evidence,
    votes,
    escalation: gate.decision,
    stepType
  };
}

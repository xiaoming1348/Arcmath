/**
 * Rule-based answer backend for final-answer (non-proof) inputs.
 *
 * Pure JS — uses `compareAnswers` and emits a deterministic vote so the
 * merge layer can commit to VERIFIED/INVALID without consulting any
 * external service. For EXPRESSION/INTEGER answers this is the fast path;
 * SymPy is only consulted on UNKNOWN.
 */

import { compareAnswers } from "../answer-equiv";
import type { Backend } from "../backends";
import type { BackendVote, StepInput, StepType } from "../types";

const RULE_HANDLES: ReadonlyArray<StepType> = [
  // Final-answer comparison only — the pipeline classifies single-line
  // submissions of a value or a closed-form expression as CONCLUSION.
  "CONCLUSION",
  "ALGEBRAIC_EQUIVALENCE"
];

export type AnswerRuleBackendOptions = {
  /**
   * The canonical answer the student is being compared against. Must be
   * supplied by whoever instantiates the backend (the rubric / question
   * data carries it).
   */
  canonicalAnswer: string;
};

export function makeAnswerRuleBackend(
  options: AnswerRuleBackendOptions
): Backend {
  return {
    name: "answer-rule",
    deterministic: true,
    handles: RULE_HANDLES,
    async verify(step: StepInput): Promise<BackendVote> {
      const cmp = compareAnswers(step.latex, options.canonicalAnswer);
      if (cmp === "EQUAL") {
        return {
          source: "RULE",
          outcome: "VERIFIED",
          confidence: 0.999,
          evidence: `rule-engine: '${step.latex}' is textbook-equal to '${options.canonicalAnswer}'`,
          details: { rule: "answer-equiv", outcome: "EQUAL" }
        };
      }
      if (cmp === "DIFFERENT") {
        return {
          source: "RULE",
          outcome: "INVALID",
          confidence: 0.99,
          evidence: `rule-engine: '${step.latex}' is provably different from '${options.canonicalAnswer}'`,
          details: { rule: "answer-equiv", outcome: "DIFFERENT" }
        };
      }
      return {
        source: "RULE",
        outcome: "ABSTAIN",
        confidence: 0,
        evidence: "rule-engine could not decide; deferring to SymPy/LLM",
        details: { rule: "answer-equiv", outcome: "UNKNOWN" }
      };
    }
  };
}

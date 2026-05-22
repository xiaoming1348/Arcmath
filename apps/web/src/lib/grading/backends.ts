/**
 * Backend interface + barrel for concrete backends.
 *
 * The pipeline runs all enabled backends in parallel and feeds the
 * collected votes into `mergeVotes`. Backends are deliberately decoupled
 * from each other and from any rubric.
 *
 * Module-resolution note: `@/lib/grading/backends` resolves to THIS
 * file (TS prefers `backends.ts` over `backends/index.ts`). We
 * therefore re-export the concrete implementations at the bottom so
 * one import path covers everything.
 */

import type { BackendVote, StepInput, StepType } from "./types";

export type Backend = {
  /** Stable name used in logs and metrics. */
  name: string;
  /** True iff this is a deterministic (rigorous) backend. */
  deterministic: boolean;
  /**
   * Step types this backend will emit a non-ABSTAIN vote for. Other types
   * are guaranteed ABSTAIN — saves us network calls.
   */
  handles: ReadonlyArray<StepType>;
  /** Verify a single step. Must never throw — return ABSTAIN on error. */
  verify(input: StepInput): Promise<BackendVote>;
};

/**
 * Run all enabled backends in parallel against a step. Failures are
 * caught and converted to ABSTAIN with an error string in evidence.
 */
export async function fanOut(
  step: StepInput,
  backends: ReadonlyArray<Backend>,
  stepType: StepType
): Promise<BackendVote[]> {
  const enabled = backends.filter((b) => b.handles.includes(stepType));
  const out = await Promise.all(
    enabled.map(async (backend) => {
      try {
        return await backend.verify(step);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const vote: BackendVote = {
          source: "NONE",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: `${backend.name} threw: ${msg}`,
          details: { stage: "backend_exception", backend: backend.name }
        };
        return vote;
      }
    })
  );
  return out;
}

// Concrete-backend re-exports. Importers depend on this barrel rather
// than reaching into individual files; the internal layout will change
// as more backends (DeepSeek-Prover, AlphaGeometry, …) land.
export {
  makeLlmJudgeBackend,
  defaultJudgePair,
  LLM_JUDGE_PROMPT_VERSION
} from "./backends/llm-judge";
export type { LlmJudgeOptions } from "./backends/llm-judge";
export {
  makeSympyBackend,
  makeLeanClaimBackend
} from "./backends/proof-verifier-http";
export type {
  HttpFetcher,
  ProofVerifierBackendsConfig
} from "./backends/proof-verifier-http";
export { makeAnswerRuleBackend } from "./backends/answer-rule";
export type { AnswerRuleBackendOptions } from "./backends/answer-rule";
export { makeDeepSeekProverBackend } from "./backends/deepseek-prover";
export type { DeepSeekProverConfig } from "./backends/deepseek-prover";

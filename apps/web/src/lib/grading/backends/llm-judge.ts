/**
 * LLM-judge backend.
 *
 * One instance of this backend = one independent judge. The pipeline
 * registers TWO instances with different judgeIds so the merge layer's
 * "two LLM judges agreeing at high confidence" rule (see
 * confidence.ts §2) can fire. A single judge alone is intentionally
 * capped at UNCERTAIN by the merge — that is the whole point of the v2
 * architecture and we keep the structural property here.
 *
 * The actual OpenAI call is delegated to `callOpenAIJson` so we get
 * strict json_schema validation, retries, and graceful fallback when
 * `OPENAI_API_KEY` is missing (returns null → ABSTAIN vote).
 */

import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";
import type { Backend } from "../backends";
import type { BackendVote, StepInput, StepType } from "../types";

export const LLM_JUDGE_PROMPT_VERSION = "llm-judge-v2-2026-05";

const JUDGE_HANDLES: ReadonlyArray<StepType> = [
  "ALGEBRAIC_EQUIVALENCE",
  "EQUATION",
  "INEQUALITY",
  "CLAIM",
  "DEDUCTION",
  "CASE_SPLIT",
  "CONCLUSION"
];

const judgeOutputSchema = z.object({
  verdict: z.enum(["VERIFIED", "INVALID", "ABSTAIN"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(600)
});

const judgeOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["VERIFIED", "INVALID", "ABSTAIN"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" }
  },
  required: ["verdict", "confidence", "reason"]
} as const;

export type LlmJudgeOptions = {
  /**
   * Stable id used in evidence strings. Two instances of this backend
   * must have DIFFERENT judgeIds so the merge sees two distinct votes.
   */
  judgeId: 1 | 2 | 3;
  /**
   * A short personality string spliced into the system prompt to lower
   * correlation between judges. E.g. judge 1 = "be strict", judge 2 =
   * "be charitable but call out hand-waving". Empty → neutral prompt.
   */
  styleHint?: string;
  /**
   * Optional override for the OpenAI invocation — primarily for tests.
   * The default delegates to `callOpenAIJson`.
   */
  invoke?: (params: {
    prompt: string;
    schemaName: string;
  }) => Promise<z.infer<typeof judgeOutputSchema> | null>;
};

function buildPrompt(input: StepInput, styleHint: string): string {
  const prior =
    input.previousSteps.length > 0
      ? input.previousSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(none)";

  return [
    "You are a strict competition-math judge evaluating ONE step of a student's proof.",
    "Rules:",
    "- Return valid JSON only.",
    "- VERIFIED: the step is mathematically true AND its derivation from prior steps is rigorous. Confidence ≥ 0.92.",
    "- INVALID: you can identify a CONCRETE error — a false mathematical claim, a wrong algebraic move, OR a step that correctly follows from an EARLIER STEP THAT IS ITSELF WRONG (chain error). In the chain-error case, quote which prior step is the root cause.",
    "- 'The student did not show enough work' is NOT a reason to call INVALID — use ABSTAIN for that.",
    "- INVALID is forbidden for any step whose claim is itself a known true theorem if the student is allowed to cite it. If unsure, ABSTAIN.",
    "- ABSTAIN whenever: the step is ambiguous, requires context you do not have, is an unjustified leap, or you would need to read the rest of the proof to judge.",
    "",
    "Chain-error detection:",
    "- ONLY flag chain errors when you can point at a SPECIFIC prior step containing a SPECIFIC error (e.g. 'step 2 wrote a+b=6 contradicting the problem's a+b=5'). The standard for asserting chain error is the same as for asserting INVALID: you must identify the concrete root error, not a generic 'this seems off' feeling.",
    "- DO NOT flag chain error speculatively. If you cannot pin down which prior step is wrong and why, treat the chain as locally consistent and judge ONLY the current step.",
    "",
    "- Reason field: ≤ 2 sentences, cite the specific step number when calling chain error.",
    "- Do NOT reveal the full solution.",
    styleHint ? `- Judge style: ${styleHint}` : "",
    "",
    `Problem:\n${input.problemStatement}`,
    `Prior steps:\n${prior}`,
    `Current step (LaTeX): ${input.latex}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function makeLlmJudgeBackend(options: LlmJudgeOptions): Backend {
  const invoke =
    options.invoke ??
    (async ({ prompt, schemaName }) =>
      callOpenAIJson({
        scope: `grading-llm-judge-${options.judgeId}`,
        schemaName,
        prompt,
        schema: judgeOutputSchema,
        jsonSchema: judgeOutputJsonSchema,
        maxOutputTokens: 220
      }));

  return {
    name: `llm-judge-${options.judgeId}`,
    deterministic: false,
    handles: JUDGE_HANDLES,
    async verify(step: StepInput): Promise<BackendVote> {
      const prompt = buildPrompt(step, options.styleHint ?? "");
      const result = await invoke({
        prompt,
        schemaName: `llm_judge_${options.judgeId}`
      });

      if (!result) {
        return {
          source: "LLM_JUDGE",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: `judge-${options.judgeId} returned no result (api/schema failure)`,
          details: { judgeId: options.judgeId, promptVersion: LLM_JUDGE_PROMPT_VERSION }
        };
      }

      // We deliberately demote LLM "VERIFIED" with low confidence to
      // ABSTAIN so the merge layer doesn't see a half-hearted commitment
      // as a vote in either direction. The 0.85 threshold matches the
      // confidence.ts cap on LLM-only consensus.
      if (result.verdict !== "ABSTAIN" && result.confidence < 0.85) {
        return {
          source: "LLM_JUDGE",
          outcome: "ABSTAIN",
          confidence: result.confidence,
          evidence: `judge-${options.judgeId} hedged: ${result.reason}`,
          details: {
            judgeId: options.judgeId,
            rawVerdict: result.verdict,
            promptVersion: LLM_JUDGE_PROMPT_VERSION
          }
        };
      }

      return {
        source: "LLM_JUDGE",
        outcome: result.verdict,
        confidence: result.confidence,
        evidence: `judge-${options.judgeId}: ${result.reason}`,
        details: {
          judgeId: options.judgeId,
          promptVersion: LLM_JUDGE_PROMPT_VERSION
        }
      };
    }
  };
}

/**
 * Pre-baked pair of judges with opposing styles so they decorrelate.
 * The pipeline can register both at once.
 */
export function defaultJudgePair(invoke?: LlmJudgeOptions["invoke"]): Backend[] {
  return [
    makeLlmJudgeBackend({
      judgeId: 1,
      styleHint: "be strict; demand explicit justification for every algebraic step",
      invoke
    }),
    makeLlmJudgeBackend({
      judgeId: 2,
      styleHint:
        "be charitable about notation but call out hand-waving and unstated assumptions",
      invoke
    })
  ];
}

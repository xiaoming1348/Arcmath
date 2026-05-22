/**
 * Extract algebraic hypotheses from a problem statement.
 *
 * Why: problems like "Given x + y = 5 and xy = 6, find x^2 + y^2" carry
 * their key hypotheses in the prose, NOT in the student's first step.
 * The SymPy backend needs those hypotheses to verify intermediate
 * algebraic substitutions. Without this, "25 = x^2 + y^2 + 12" looks
 * like a free-variable equation with counterexamples everywhere — and
 * the engine wrongly commits INVALID.
 *
 * Strategy: a small LLM-extraction pass that runs once per attempt and
 * produces a list of LaTeX equations / inequalities. The pass is
 * intentionally narrow (only obvious "Given X = Y" / "Suppose X > 0"
 * patterns); ambiguous cases return an empty list so the grader
 * gracefully degrades.
 *
 * Output is cached by `problemStatement` hash so we don't re-extract
 * on every step in an attempt.
 */

import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

const hypothesesSchema = z.object({
  hypotheses: z.array(z.string().min(1).max(240)).max(8)
});

const hypothesesJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hypotheses: {
      type: "array",
      maxItems: 8,
      items: { type: "string" }
    }
  },
  required: ["hypotheses"]
} as const;

export const PROBLEM_HYPOTHESIS_PROMPT_VERSION = "hypothesis-extract-v1-2026-05";

const cache = new Map<string, string[]>();

function hashKey(statement: string): string {
  // Cheap deterministic hash so the same statement always maps to
  // the same key. Not cryptographic.
  let h = 5381;
  for (let i = 0; i < statement.length; i += 1) {
    h = (h * 33) ^ statement.charCodeAt(i);
  }
  return String(h >>> 0);
}

export async function extractProblemHypotheses(
  problemStatement: string
): Promise<string[]> {
  const key = hashKey(problemStatement);
  const cached = cache.get(key);
  if (cached) return cached;

  const prompt = [
    "You are extracting MATHEMATICAL HYPOTHESES from a competition-math problem statement.",
    "A hypothesis is any constraint the solver is allowed to assume — explicit or implied. Be GENEROUS in extraction; missing a hypothesis costs us false-INVALID errors downstream.",
    "",
    "Patterns to capture (each yields ONE hypothesis):",
    "- Explicit equations/inequalities: 'Given x + y = 5', 'Suppose ab + bc + ca ≥ 3'",
    "- Positivity / sign constraints: 'Let a, b, c > 0' → emit `a > 0`, `b > 0`, `c > 0` as 3 separate items",
    "- Domain constraints: 'Let n be a positive integer' → `n > 0`, `n \\\\in \\\\mathbb{Z}` (or just `n > 0` if integer-ness is hard to encode)",
    "- 'Let n ≥ 3' → `n \\\\geq 3`",
    "- Ranges: 'x in [0, 1]' → `0 \\\\leq x`, `x \\\\leq 1`",
    "- Defined quantities: 'Let S = sum a_i' is NOT a hypothesis, it's a definition; skip.",
    "",
    "Rules:",
    "- Return valid JSON only.",
    "- Each hypothesis must be a SINGLE LaTeX equality or inequality, ready to feed to SymPy (no English, no quantifiers like ∀).",
    "- Use ASCII symbol names where possible (a, b, c, n, x, y, z); only use Greek letters if the problem uses them.",
    "- Do NOT include the GOAL (the thing to prove/find). Only what the solver is given.",
    "- If nothing is clearly given, return an empty array — do NOT invent hypotheses.",
    "- At most 8 hypotheses.",
    "",
    `Problem:\n${problemStatement}`
  ].join("\n");

  const result = await callOpenAIJson({
    scope: "grading-hypothesis-extract",
    schemaName: "problem_hypotheses",
    prompt,
    schema: hypothesesSchema,
    jsonSchema: hypothesesJsonSchema,
    maxOutputTokens: 220
  });

  const hypotheses = result?.hypotheses ?? [];
  cache.set(key, hypotheses);
  return hypotheses;
}

/** Test-only escape hatch so the eval harness can pre-seed the cache. */
export function _resetHypothesisCache(): void {
  cache.clear();
}

export function _injectHypothesisCache(
  statement: string,
  hypotheses: string[]
): void {
  cache.set(hashKey(statement), hypotheses);
}

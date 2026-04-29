/**
 * Offline generator that turns a problem's statement + existing
 * solutionSketch into a structured, step-by-step reference solution
 * ("solution recipe"). The recipe is persisted on the Problem row and
 * consumed by the proof grader at attempt time.
 *
 * Design goals:
 *   - Every problem has a recipe, independent of whether Lean
 *     pre-processing succeeded. This removes the "Lean failed, so grader
 *     has nothing to anchor on" fallback branch.
 *   - Each `step` is a milestone: "the student's proof must establish
 *     this claim, or a logically equivalent one, to be complete."
 *   - Techniques are tagged so the grader can credit equivalent
 *     approaches (e.g. Cauchy-Schwarz instead of AM-GM for the same
 *     milestone).
 *   - Pitfalls + insights are captured so the grader can produce
 *     concrete, specific feedback rather than generic "keep going".
 */
import { z } from "zod";
// Use a relative import so this module can be loaded from both Next.js
// runtime code (where `@/` resolves) and the preprocess-problems script
// (plain tsx, no path-alias plugin).
import { callOpenAIJson } from "./openai-json";

export const STRUCTURED_SOLUTION_VERSION = "arcmath-struct-sol-v1";

const GOAL_TYPES = [
  "INEQUALITY",
  "EQUATION",
  "EXISTENCE",
  "UNIQUENESS",
  "IMPOSSIBILITY",
  "CHARACTERIZATION",
  "COMPUTE",
  "OTHER"
] as const;
export type StructuredSolutionGoalType = (typeof GOAL_TYPES)[number];

const stepSchema = z.object({
  index: z.number().int().min(1),
  title: z.string().min(1).max(160),
  claim: z.string().min(1).max(1200),
  justification: z.string().min(1).max(1200),
  technique: z.array(z.string().min(1).max(80)).max(8),
  dependsOn: z.array(z.number().int().min(1)).max(16)
});

const structuredSolutionSchema = z.object({
  goalType: z.enum(GOAL_TYPES),
  goalStatement: z.string().min(1).max(600),
  steps: z.array(stepSchema).min(1).max(15),
  keyInsights: z.array(z.string().min(1).max(240)).max(5),
  commonPitfalls: z.array(z.string().min(1).max(240)).max(5)
});

export type StructuredSolutionStep = z.infer<typeof stepSchema>;
export type StructuredSolutionBody = z.infer<typeof structuredSolutionSchema>;

// The persisted form adds metadata so later upgrades (version bumps,
// model A/B tests) can be migrated without rereading the whole DB.
export type StructuredSolution = StructuredSolutionBody & {
  version: string;
  generatedAt: string;
  model: string;
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    goalType: { type: "string", enum: [...GOAL_TYPES] },
    goalStatement: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 1 },
          title: { type: "string" },
          claim: { type: "string" },
          justification: { type: "string" },
          technique: { type: "array", items: { type: "string" }, maxItems: 8 },
          dependsOn: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 16 }
        },
        required: ["index", "title", "claim", "justification", "technique", "dependsOn"]
      }
    },
    keyInsights: { type: "array", items: { type: "string" }, maxItems: 5 },
    commonPitfalls: { type: "array", items: { type: "string" }, maxItems: 5 }
  },
  required: ["goalType", "goalStatement", "steps", "keyInsights", "commonPitfalls"]
} as const;

export type GenerateStructuredSolutionInput = {
  problemStatement: string;
  // If available, we pass the existing free-form solutionSketch as
  // grounding so the generator doesn't invent a novel proof path; it
  // just structures the approach the content author already picked.
  solutionSketch?: string | null;
  // Set when the Lean kernel has machine-checked a proof for this
  // problem. The generator uses it as additional grounding — not to
  // mirror the Lean tactics, but to know which identities / lemmas the
  // canonical proof relied on.
  verifiedLeanProof?: string | null;
};

/**
 * Call the LLM to produce a StructuredSolution for a problem.
 * Returns null if the API call fails or the response fails schema
 * validation — callers should treat this as "recipe not available" and
 * fall back to the free-form sketch.
 */
export async function generateStructuredSolution(
  input: GenerateStructuredSolutionInput
): Promise<StructuredSolution | null> {
  const sketchBlock = input.solutionSketch?.trim()
    ? `\n\nAuthor-provided solution sketch (ground your steps in this approach; do NOT invent a new one):\n${input.solutionSketch.trim()}`
    : "";

  const leanBlock = input.verifiedLeanProof?.trim()
    ? `\n\nA Lean 4 proof for this problem has been kernel-verified (for your reference, to know which lemmas hold; do NOT paste Lean into the output):\n${input.verifiedLeanProof.trim()}`
    : "";

  const prompt = [
    "You are a competition-math curriculum author writing the reference solution for ONE problem.",
    "The output will be (a) shown to students who get stuck and (b) used by a grader to score diverse student proofs.",
    "Rules:",
    "- Return valid JSON matching the provided schema exactly.",
    "- `goalType` classifies what the problem asks to prove (INEQUALITY, EQUATION, EXISTENCE, UNIQUENESS, IMPOSSIBILITY, CHARACTERIZATION, COMPUTE, OTHER).",
    "- `goalStatement` restates what must be proved in one sentence.",
    "- `steps` is an ORDERED list of milestones. A milestone = a claim the proof must establish (or establish-equivalent-of) to be complete. Aim for 3–8 steps; never more than 10 unless truly needed.",
    "- Each step.title is a short label (≤ 8 words). step.claim is the actual mathematical assertion in that milestone. step.justification is a 1–2 sentence why/how.",
    "- step.technique is a small array of technique tags (e.g. ['AM-GM', 'factoring', 'substitution u=...','case split','induction','extremal principle','contradiction']). Use these to communicate WHAT approach the step uses — the grader will credit students who use equivalent alternative techniques to land the same claim.",
    "- step.dependsOn lists prior step indices this step builds on. Keep it tight.",
    "- `keyInsights` is 1–3 sentences naming the crux observations a student must see (the 'aha' moves). These will be shown as hints.",
    "- `commonPitfalls` is 1–3 sentences naming wrong turns students typically take that look plausible but fail. These power diagnostic feedback.",
    "- Do NOT include markdown headings, LaTeX display blocks, or $$...$$. Use inline LaTeX ($...$) only when strictly needed for symbols. Plain text is preferred.",
    "- Do NOT reveal Lean code to the student.",
    "",
    `Problem:\n${input.problemStatement}${sketchBlock}${leanBlock}`
  ].join("\n");

  const body = await callOpenAIJson({
    scope: "solution-generator",
    schemaName: "structured_solution",
    prompt,
    schema: structuredSolutionSchema,
    jsonSchema,
    // Recipes can be substantial for multi-step proofs; give the model
    // room. 2000 output tokens ≈ 1500 words, which is enough for a
    // 6–8 step IMO-style proof.
    maxOutputTokens: 2000
  });

  if (!body) return null;

  // Extra validation: enforce that step indices are consecutive 1..N
  // and that dependsOn only points backwards. Downstream grading relies
  // on these invariants to reason about coverage.
  for (let i = 0; i < body.steps.length; i++) {
    const s = body.steps[i];
    if (s.index !== i + 1) {
      console.warn(`[solution-generator] step indices not 1..N (step ${i} has index ${s.index}); rejecting`);
      return null;
    }
    if (s.dependsOn.some((d) => d >= s.index)) {
      console.warn(`[solution-generator] step ${s.index} has forward dependency; rejecting`);
      return null;
    }
  }

  return {
    ...body,
    version: STRUCTURED_SOLUTION_VERSION,
    generatedAt: new Date().toISOString(),
    // OPENAI_MODEL is picked up by the JSON helper; we read it again
    // here to tag the recipe for future A/B analysis.
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
  };
}

// Type-narrow a JSON value pulled out of the DB. Used at grade time by
// the attempt router to decide whether milestoneChecks is populated
// with a valid recipe we can feed the grader.
export function isStructuredSolution(v: unknown): v is StructuredSolution {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.version !== "string") return false;
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) return false;
  // Trust the recipe was schema-validated at write time; do a cheap
  // structural check here rather than re-running zod on every request.
  const first = obj.steps[0] as Record<string, unknown> | undefined;
  if (!first || typeof first.index !== "number" || typeof first.claim !== "string") return false;
  return true;
}

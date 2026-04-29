import { z } from "zod";
// Relative imports so proof-tutor can be loaded from both Next.js
// runtime code (where `@/` resolves) and standalone tsx scripts
// (smoke-milestone-grader, etc.).
import { callOpenAIJson } from "./openai-json";
import type { StructuredSolution } from "./solution-generator";

export const PROOF_TUTOR_PROMPT_VERSION = "proof-tutor-v1";
export const PROOF_CLASSIFIER_FALLBACK_VERSION = "proof-classifier-llm-v1";
export const PROOF_LLM_JUDGE_VERSION = "proof-llm-judge-v1";
// v2 (2026-04-21): reviewer can consume an optional formalContext block
// populated from Problem.formalizedStatement / solutionPaths. When present,
// the prompt anchors on a machine-checked reference proof so the LLM's
// "feels right" judgement is replaced with diff-to-reference reasoning.
//
// v3 (2026-04-21): reviewer can consume an optional solutionRecipe block
// generated offline (Phase D). When present, the reviewer maps each
// student step to a reference milestone and reports per-milestone
// coverage (ESTABLISHED / REPLACED / PARTIAL / MISSING) plus false
// claims, in addition to the overall text. This replaces "feels right"
// grading with structured milestone diffing and works even on problems
// Lean couldn't verify — which is most of the curriculum.
//
// v4 (2026-04-21): tightens two failure modes observed in benchmark-grader:
//   - Hallucinated milestone indices (> recipe length): we now pin the
//     expected count explicitly in the prompt AND strip out-of-range
//     entries post-hoc.
//   - "All MISSING" verdicts when the student pursued a completely
//     different (wrong) approach: prompt now mandates that if the
//     student's work contains a mathematically false claim — even one
//     unrelated to the recipe's milestones — the grader must flag at
//     least one milestone as INVALID citing that specific claim, rather
//     than marking everything MISSING.
export const PROOF_OVERALL_REVIEW_VERSION = "proof-overall-review-v4";

export const PROOF_STEP_TYPES = [
  "ALGEBRAIC_EQUIVALENCE",
  "EQUATION",
  "INEQUALITY",
  "CLAIM",
  "DEDUCTION",
  "CASE_SPLIT",
  "CONCLUSION",
  "UNKNOWN"
] as const;
export type ProofStepType = (typeof PROOF_STEP_TYPES)[number];

export const PROOF_VERDICTS = ["VERIFIED", "PLAUSIBLE", "UNKNOWN", "INVALID", "ERROR", "PENDING"] as const;
export type ProofStepVerdict = (typeof PROOF_VERDICTS)[number];

const classifierSchema = z.object({
  stepType: z.enum(PROOF_STEP_TYPES),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

const classifierJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stepType: { type: "string", enum: [...PROOF_STEP_TYPES] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" }
  },
  required: ["stepType", "confidence", "reason"]
} as const;

export type ProofClassifierOutput = z.infer<typeof classifierSchema>;

const llmJudgeSchema = z.object({
  verdict: z.enum(["PLAUSIBLE", "INVALID", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

const llmJudgeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["PLAUSIBLE", "INVALID", "UNKNOWN"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" }
  },
  required: ["verdict", "confidence", "reason"]
} as const;

export type ProofLlmJudgeOutput = z.infer<typeof llmJudgeSchema>;

const feedbackSchema = z.object({
  feedbackText: z.string().min(1)
});

const feedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    feedbackText: { type: "string" }
  },
  required: ["feedbackText"]
} as const;

export type ProofStepFeedbackOutput = z.infer<typeof feedbackSchema>;

export type ClassifyStepParams = {
  latex: string;
  previousSteps: string[];
};

export async function classifyStepWithLlm(params: ClassifyStepParams): Promise<ProofClassifierOutput | null> {
  const priorBlock =
    params.previousSteps.length > 0
      ? params.previousSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")
      : "(none)";

  const prompt = [
    "You are classifying one step of a student's competition-math proof.",
    "Rules:",
    "- Return valid JSON only.",
    "- Use ONLY these stepType values: ALGEBRAIC_EQUIVALENCE, EQUATION, INEQUALITY, CLAIM, DEDUCTION, CASE_SPLIT, CONCLUSION, UNKNOWN.",
    "- ALGEBRAIC_EQUIVALENCE: a rewrite / simplification that equals an earlier expression.",
    "- EQUATION: LHS = RHS asserted as an identity.",
    "- INEQUALITY: LHS ≤/≥/</>/≠ RHS.",
    "- CLAIM: stating a lemma or intermediate result without deriving it yet.",
    "- DEDUCTION: a logical connector step (therefore, thus, hence, so that).",
    "- CASE_SPLIT: partition into cases.",
    "- CONCLUSION: final answer / QED.",
    '- Output schema: {"stepType":"...","confidence":0.0,"reason":"..."}',
    `Previous steps:\n${priorBlock}`,
    `Current step (LaTeX): ${params.latex}`
  ].join("\n");

  return callOpenAIJson({
    scope: "proof-tutor-classifier",
    schemaName: "proof_classifier",
    prompt,
    schema: classifierSchema,
    jsonSchema: classifierJsonSchema,
    maxOutputTokens: 160
  });
}

export type LlmJudgeStepParams = {
  problemStatement: string;
  stepLatex: string;
  stepType: ProofStepType;
  previousSteps: string[];
};

export async function judgeStepWithLlm(params: LlmJudgeStepParams): Promise<ProofLlmJudgeOutput | null> {
  const priorBlock =
    params.previousSteps.length > 0
      ? params.previousSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")
      : "(none)";

  const prompt = [
    "You are a strict competition-math judge evaluating ONE step of a student's proof.",
    "Rules:",
    "- Return valid JSON only.",
    "- verdict=INVALID only when you can point to a concrete error.",
    "- verdict=UNKNOWN when you cannot tell with high confidence.",
    "- verdict=PLAUSIBLE when the step looks correct and justified given prior steps — but never claim it is formally verified.",
    "- Do NOT reveal the full solution. Keep the reason under 2 sentences.",
    '- Output schema: {"verdict":"PLAUSIBLE|INVALID|UNKNOWN","confidence":0.0,"reason":"..."}',
    `Problem:\n${params.problemStatement}`,
    `Step type: ${params.stepType}`,
    `Previous steps:\n${priorBlock}`,
    `Current step (LaTeX): ${params.stepLatex}`
  ].join("\n");

  return callOpenAIJson({
    scope: "proof-tutor-judge",
    schemaName: "proof_llm_judge",
    prompt,
    schema: llmJudgeSchema,
    jsonSchema: llmJudgeJsonSchema,
    maxOutputTokens: 200
  });
}

export type GenerateStepFeedbackParams = {
  problemStatement: string;
  stepLatex: string;
  stepType: ProofStepType;
  verdict: ProofStepVerdict;
  verificationBackend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
  verificationReason?: string;
  previousSteps: string[];
};

export async function generateStepFeedback(
  params: GenerateStepFeedbackParams
): Promise<ProofStepFeedbackOutput> {
  const priorBlock =
    params.previousSteps.length > 0
      ? params.previousSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")
      : "(none)";

  // Describe the verification outcome honestly so the LLM can't over-claim.
  const verificationSummary = describeVerification(params.verdict, params.verificationBackend, params.verificationReason);

  const prompt = [
    "You are an AI tutor giving ONE short piece of feedback on a single proof step.",
    "Rules:",
    "- Return valid JSON only.",
    "- Keep feedback to 1-3 short sentences.",
    "- Do NOT reveal the full final solution.",
    "- If verified: confirm briefly and suggest the next concrete direction (without solving it).",
    "- If invalid: point at the specific mistake using the verification details. Never invent a counterexample that wasn't supplied.",
    "- If plausible/unknown: be transparent — say the step looks reasonable but was not formally verified, and offer one concrete check the student can do.",
    "- Never tell the student their step is CORRECT unless the verdict is VERIFIED.",
    '- Output schema: {"feedbackText":"..."}',
    `Verification outcome: ${verificationSummary}`,
    `Step type: ${params.stepType}`,
    `Problem:\n${params.problemStatement}`,
    `Previous steps:\n${priorBlock}`,
    `Current step (LaTeX): ${params.stepLatex}`
  ].join("\n");

  const generated = await callOpenAIJson({
    scope: "proof-tutor-feedback",
    schemaName: "proof_step_feedback",
    prompt,
    schema: feedbackSchema,
    jsonSchema: feedbackJsonSchema,
    maxOutputTokens: 200
  });

  if (generated) {
    return generated;
  }

  return { feedbackText: getFallbackFeedback(params.verdict) };
}

function describeVerification(
  verdict: ProofStepVerdict,
  backend: GenerateStepFeedbackParams["verificationBackend"],
  reason: string | undefined
): string {
  const reasonPart = reason ? ` Reason: ${reason}.` : "";
  switch (verdict) {
    case "VERIFIED":
      return `${backend} confirmed this step is correct.${reasonPart}`;
    case "INVALID":
      return `${backend} found a concrete error.${reasonPart}`;
    case "PLAUSIBLE":
      return `${backend} could not formally prove the step, but probe-tests passed.${reasonPart}`;
    case "UNKNOWN":
      return `${backend} could not verify this step either way.${reasonPart}`;
    case "ERROR":
      return `${backend} failed to parse or evaluate the step.${reasonPart}`;
    case "PENDING":
    default:
      return `Verification pending.${reasonPart}`;
  }
}

export type ProofFormalContext = {
  // One of: "VERIFIED" | "FAILED" | "MANUAL_REVIEW" | "PENDING" | "SKIPPED".
  // Mirrors the DB enum but typed as string so consumers don't have to
  // import Prisma enums; the caller is responsible for not passing
  // arbitrary values.
  status: string;
  // Canonical Lean 4 theorem signature produced by offline formalization.
  formalizedStatement?: string | null;
  // A machine-checked proof for the statement (picked from solutionPaths).
  // We pass at most one to keep the prompt compact; pre-processing only
  // produces one path today.
  referenceProof?: string | null;
};

export type ProofReviewInput = {
  problemStatement: string;
  steps: Array<{
    index: number;
    latex: string;
    stepType: ProofStepType;
    verdict: ProofStepVerdict;
    verificationBackend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
    verificationReason?: string;
  }>;
  // Optional, populated from Problem.formalizedStatement + solutionPaths
  // when the offline pre-processing pipeline has verified the problem.
  formalContext?: ProofFormalContext;
  // Optional, populated from Problem.milestoneChecks when the Phase D
  // offline pipeline has generated a structured reference solution.
  // When present, the reviewer will map student steps onto this recipe's
  // milestones and emit per-milestone coverage.
  solutionRecipe?: StructuredSolution | null;
};

// Per-reference-milestone coverage output. `index` matches the recipe
// step index (1-based). Status taxonomy:
//  - ESTABLISHED: student established this claim directly, matching the
//    recipe's approach or an equivalent one.
//  - REPLACED:    student established the same claim via a different
//    but valid technique (different from the one in the recipe's
//    `technique` tags). We credit these equally.
//  - PARTIAL:     student is on the right track for this milestone but
//    didn't finish it (stopped short / justified too loosely).
//  - MISSING:     student never addressed this milestone.
//  - INVALID:     student attempted this milestone but with a claim
//    that is mathematically wrong.
const MILESTONE_STATUSES = ["ESTABLISHED", "REPLACED", "PARTIAL", "MISSING", "INVALID"] as const;
export type MilestoneCoverageStatus = (typeof MILESTONE_STATUSES)[number];

export type MilestoneCoverage = {
  index: number;
  status: MilestoneCoverageStatus;
  evidence: string;
};

const milestoneCoverageSchema = z.object({
  index: z.number().int().min(1),
  status: z.enum(MILESTONE_STATUSES),
  evidence: z.string().min(1).max(300)
});

// OpenAI strict json_schema requires every property in `properties` to
// appear in `required`. We therefore always emit `milestoneCoverage` —
// it will be an empty array when no recipe was supplied.
const proofReviewSchema = z.object({
  overallFeedback: z.string().min(1),
  milestoneCoverage: z.array(milestoneCoverageSchema).max(20)
});

const proofReviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallFeedback: { type: "string" },
    milestoneCoverage: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 1 },
          status: { type: "string", enum: [...MILESTONE_STATUSES] },
          evidence: { type: "string" }
        },
        required: ["index", "status", "evidence"]
      }
    }
  },
  required: ["overallFeedback", "milestoneCoverage"]
} as const;

export async function generateProofReview(
  params: ProofReviewInput
): Promise<{ overallFeedback: string; milestoneCoverage: MilestoneCoverage[] }> {
  const stepsBlock = params.steps
    .map((s) => {
      const reason = s.verificationReason ? ` — ${s.verificationReason}` : "";
      return `${s.index + 1}. [${s.stepType}] [${s.verdict}@${s.verificationBackend}${reason}]\n   ${s.latex}`;
    })
    .join("\n");

  // When pre-processing produced a machine-checked Lean proof for this
  // problem, fold it into the prompt so the reviewer can diff the
  // student's approach against a known-good path. Without this block the
  // reviewer is inferring correctness from the per-step verdicts alone,
  // which works for clean cases but drifts on novel approaches.
  const formalLines: string[] = [];
  const fc = params.formalContext;
  if (fc && fc.status === "VERIFIED") {
    if (fc.formalizedStatement && fc.formalizedStatement.trim().length > 0) {
      formalLines.push(
        "",
        "Machine-checked formalization (Lean 4, verified by kernel):",
        "— This problem was pre-processed; the theorem below type-checks against Mathlib.",
        "— Use it to anchor your critique: if the student's transformations preserve the truth of this theorem, they're on track.",
        "— Do NOT paste Lean code to the student; translate back to natural-language reasoning.",
        "",
        "```lean",
        fc.formalizedStatement.trim(),
        "```"
      );
    }
    if (fc.referenceProof && fc.referenceProof.trim().length > 0) {
      formalLines.push(
        "",
        "Reference proof (one machine-checked path — not the only valid one):",
        "```lean",
        fc.referenceProof.trim(),
        "```",
        "If the student is pursuing a different approach that is also valid, prefer their approach in the feedback.",
        "If the student's approach can't reach the goal, point to the key move the reference uses (expressed in natural language)."
      );
    }
  } else if (fc && (fc.status === "FAILED" || fc.status === "MANUAL_REVIEW")) {
    // Tell the reviewer the problem hasn't been machine-verified so it
    // doesn't overclaim correctness. Also a good signal for us: repeated
    // reviews on a FAILED problem = candidate for curator follow-up.
    formalLines.push(
      "",
      "Note: this problem failed offline formal pre-processing; grade from the student's reasoning directly and do not claim a unique correct path."
    );
  }

  // Build the structured-solution recipe block. When the problem has a
  // recipe we give the reviewer a concrete list of milestones to map
  // against, plus the technique tags / pitfalls so feedback can be
  // specific ("you walked into pitfall #2" / "you used Cauchy-Schwarz
  // instead of AM-GM to establish milestone 3, which is fine").
  const recipeLines: string[] = [];
  const recipe = params.solutionRecipe;
  if (recipe && recipe.steps.length > 0) {
    const milestoneLines = recipe.steps.map((s) => {
      const techniques = s.technique.length > 0 ? ` [techniques: ${s.technique.join(", ")}]` : "";
      const deps = s.dependsOn.length > 0 ? ` (depends on: ${s.dependsOn.join(", ")})` : "";
      return `  ${s.index}. ${s.title} — CLAIM: ${s.claim}${techniques}${deps}`;
    });
    recipeLines.push(
      "",
      `Reference solution recipe (goalType=${recipe.goalType}). Use this as the authoritative breakdown — each numbered step below is a MILESTONE the student's proof must establish (directly, or via an equivalent technique):`,
      `  Goal: ${recipe.goalStatement}`,
      "  Milestones:",
      ...milestoneLines
    );
    if (recipe.commonPitfalls.length > 0) {
      recipeLines.push(
        "  Common pitfalls:",
        ...recipe.commonPitfalls.map((p, i) => `    P${i + 1}. ${p}`)
      );
    }
    recipeLines.push(
      "",
      "Milestone-coverage rules:",
      `- Emit EXACTLY ${recipe.steps.length} entries in \`milestoneCoverage\`, one per milestone, with \`index\` values 1..${recipe.steps.length} (each index appears exactly once). Do NOT invent extra indices beyond ${recipe.steps.length}. Do NOT merge milestones.`,
      "- status ESTABLISHED: student established this milestone's CLAIM. The student's wording or scale may differ from the recipe — that is fine. Example: recipe says '2(LHS)-2(RHS) ≥ 0', student writes 'LHS-RHS = ½·(sum of squares)'. These are mathematically equivalent — mark ESTABLISHED.",
      "- status REPLACED:    student established the SAME CLAIM via a technique NOT listed in the recipe's technique tags. Example: recipe expects 'SOS: (a-b)²+(b-c)²+(c-a)²', student derives the same conclusion by summing three pairwise inequalities 'a²+b²≥2ab'. Both reach the same claim — mark REPLACED for the SOS milestone. REPLACED is just as valid as ESTABLISHED; do not downgrade to PARTIAL or MISSING.",
      "- status PARTIAL:     student stated the right direction but stopped short of establishing the claim, or their justification has a gap they didn't fill.",
      "- status MISSING:     the claim (or any equivalent) does NOT appear anywhere in the student's proof. Use MISSING only when there is truly no evidence of this milestone's content.",
      "- status INVALID:     student attempted this milestone's direction but asserted something mathematically FALSE. Example: student claims 'a² ≥ ab' as universally true — this is false (pick a=1, b=2). Mark INVALID, not MISSING, because the student tried but was wrong.",
      "- Decision priority: first ask 'is the milestone's claim mathematically present in the student's work?' If yes → ESTABLISHED or REPLACED. If present but wrong → INVALID. If attempted but incomplete → PARTIAL. Only MISSING when absent.",
      "- `evidence` must cite the relevant student step number(s) OR explain 'not found' in one short sentence.",
      "- If a pitfall was triggered, call it out by number (e.g. 'pitfall P2 triggered') in overallFeedback.",
      "",
      "Wrong-approach rule (important — applies when the student pursued a completely different path):",
      "- If the student's work contains a mathematically FALSE claim — even one UNRELATED to any recipe milestone — you MUST flag at least one milestone as INVALID with `evidence` citing the specific wrong claim (quote or paraphrase the student's erroneous step and explain why it is false).",
      "- Prefer flagging the milestone whose CLAIM is logically closest to the student's wrong claim. If none is close, flag the first milestone (index 1) as INVALID with the wrong-claim quote.",
      "- Do NOT return all MISSING when the student clearly attempted the problem and made a false assertion: the grader's job is to locate the specific error, not just say 'nothing matched'.",
      "- This rule OVERRIDES MISSING: MISSING means 'milestone absent AND no false claims relate to it'. If a false claim relates to it, mark INVALID instead.",
      "",
      "Final-conclusion rule:",
      `- The recipe's goalStatement ('${recipe.goalStatement}') is the TRUE final conclusion for this problem. If the student's final conclusion CONTRADICTS this (e.g. recipe says 'no such object exists' and student claims 'yes, here is one'; or recipe says 'only n=1 works' and student claims 'all even n work'), you MUST mark the FINAL milestone (index ${recipe.steps.length}) as INVALID, not PARTIAL — because the student's conclusion is not merely incomplete, it is mathematically WRONG. Quote the student's wrong conclusion in \`evidence\`.`,
      "- PARTIAL on the final milestone is reserved for cases where the student's conclusion is consistent with the goal but not fully justified. If the conclusion itself is false, always INVALID."
    );
  } else {
    recipeLines.push(
      "",
      "No reference recipe available for this problem; emit an empty `milestoneCoverage` array.",
      "Grade from the student's reasoning directly, using the per-step verdicts as anchors."
    );
  }

  const prompt = [
    "You are reviewing a student's complete competition-math proof, step by step.",
    "The per-step verdicts were produced by a formal verifier (SymPy/Lean) or an LLM judge; treat VERIFIED as reliable and INVALID as confirmed wrong.",
    "Rules:",
    "- Return valid JSON only.",
    "- `overallFeedback`: 4–8 short sentences. Call out the strongest part of the reasoning first, then the main gap or error. Comment on logical flow between steps. If the proof is incomplete, name the missing link concretely. If an INVALID step is present, explain which step breaks the chain.",
    "- Do NOT reveal the full solution — but you may say which pitfall was triggered or which reference milestone is missing.",
    "- Do NOT tell the student their proof is CORRECT unless every reference milestone is ESTABLISHED or REPLACED AND no INVALID claims appear.",
    `- Output schema: {"overallFeedback":"...", "milestoneCoverage":[{"index":N, "status":"...", "evidence":"..."}]}`,
    `Problem:\n${params.problemStatement}`,
    ...formalLines,
    ...recipeLines,
    `Student's steps (with verdicts):\n${stepsBlock}`
  ].join("\n");

  const generated = await callOpenAIJson({
    scope: "proof-tutor-review",
    schemaName: "proof_overall_review",
    prompt,
    schema: proofReviewSchema,
    jsonSchema: proofReviewJsonSchema,
    // Recipe-aware reviews emit a per-milestone array; give the model
    // extra headroom so it doesn't truncate on 6+ milestones.
    maxOutputTokens: recipe && recipe.steps.length > 0 ? 1200 : 500
  });

  if (generated) {
    // When no recipe, strip spurious milestone entries (the LLM
    // occasionally hallucinates them anyway).
    if (!recipe) return { ...generated, milestoneCoverage: [] };
    // With a recipe: constrain indices to 1..N and keep only the first
    // entry per index (guards against the LLM hallucinating a #6 when
    // the recipe only has 5 milestones, or duplicating an index).
    const N = recipe.steps.length;
    const seen = new Set<number>();
    const cleaned: MilestoneCoverage[] = [];
    for (const entry of generated.milestoneCoverage) {
      if (entry.index < 1 || entry.index > N) continue;
      if (seen.has(entry.index)) continue;
      seen.add(entry.index);
      cleaned.push(entry);
    }
    return { ...generated, milestoneCoverage: cleaned };
  }

  // Fallback: deterministic summary of per-step verdicts.
  const counts = params.steps.reduce<Record<string, number>>((acc, s) => {
    acc[s.verdict] = (acc[s.verdict] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ");
  return {
    overallFeedback: `Reviewed ${params.steps.length} steps: ${summary}. Re-examine any INVALID or UNKNOWN steps and make sure each one follows logically from the previous.`,
    milestoneCoverage: []
  };
}

export function getFallbackFeedback(verdict: ProofStepVerdict): string {
  switch (verdict) {
    case "VERIFIED":
      return "This step checks out. What is the next concrete move from here?";
    case "INVALID":
      return "This step does not hold in general — re-examine the transformation you applied and try a smaller example.";
    case "PLAUSIBLE":
      return "The step looks reasonable, but it was not formally verified. Try justifying it with a known identity or theorem before moving on.";
    case "UNKNOWN":
      return "I could not verify this step either way. Try rewriting it as a clear equality or inequality between two expressions.";
    case "ERROR":
      return "I could not parse this step. Double-check the LaTeX, especially braces and operators.";
    case "PENDING":
    default:
      return "Verification pending.";
  }
}

/**
 * Synthesize student attempt sets for problems that don't have human-
 * authored attempts (chiefly miniF2F, which only ships theorem
 * statements + `sorry` stubs).
 *
 * Why: with only the sorry-stub solution, miniF2F fixtures only
 * exercise the "no deterministic verdict → escalate" path. We need
 * fixtures whose student solutions actually trip VERIFIED and INVALID
 * branches to get statistical signal on the grader's decision quality.
 *
 * Strategy per fixture:
 *   1. Skip if fixture already has > 1 studentSolution (we don't
 *      overwrite hand-authored attempts).
 *   2. Ask GPT-4.1-mini to produce three step-by-step attempts in
 *      natural-language algebra:
 *        - CLEAN_CORRECT: a textbook 3-5 step proof
 *        - OFF_BY_ONE:     CLEAN_CORRECT with one specific arithmetic
 *                          or sign error introduced
 *        - TOTALLY_WRONG:  a confidently-wrong attempt whose final
 *                          claim contradicts the goal
 *   3. Validate the JSON schema; on parse/schema failure skip silently.
 *
 * Cost estimate: ~500 tokens out × 3 attempts × N fixtures. At
 * gpt-4.1-mini rates ($0.40 / 1M out) and N=50, that's ~$0.03 of API
 * spend. Total wall time ~5-10 min.
 *
 * Usage:
 *   pnpm -C apps/web exec tsx \
 *     src/scripts/grading-eval/synthesize-attempts.ts \
 *     --input  src/scripts/grading-eval/fixtures/minif2f.json \
 *     --output src/scripts/grading-eval/fixtures/minif2f-synth.json \
 *     --limit  50
 *
 * The `--limit` flag caps how many fixtures we hit so you can sample
 * + measure cost before going wide.
 */

import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";
import { fixtureSchema, type GradingFixture } from "./types";

const ATTEMPT_CATEGORIES = ["CLEAN_CORRECT", "OFF_BY_ONE", "TOTALLY_WRONG"] as const;
type AttemptCategory = (typeof ATTEMPT_CATEGORIES)[number];

const synthAttemptSchema = z.object({
  category: z.enum(ATTEMPT_CATEGORIES),
  description: z.string().min(1).max(240),
  steps: z.array(z.string().min(1).max(400)).min(1).max(8),
  expectedFinalCorrect: z.boolean(),
  stepExpectedVerdicts: z.array(
    z.enum(["VERIFIED", "INVALID", "ESCALATE"])
  ).min(1).max(8)
});

const synthBatchSchema = z.object({
  attempts: z.array(synthAttemptSchema).min(1).max(4)
});

const synthBatchJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    attempts: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [...ATTEMPT_CATEGORIES]
          },
          description: { type: "string" },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" }
          },
          expectedFinalCorrect: { type: "boolean" },
          stepExpectedVerdicts: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "string",
              enum: ["VERIFIED", "INVALID", "ESCALATE"]
            }
          }
        },
        required: [
          "category",
          "description",
          "steps",
          "expectedFinalCorrect",
          "stepExpectedVerdicts"
        ]
      }
    }
  },
  required: ["attempts"]
} as const;

function buildPrompt(fixture: GradingFixture): string {
  return [
    "You are simulating three different student attempts at a competition-math problem so a grader can be tested on them.",
    "",
    "Output rules:",
    "- Return valid JSON only.",
    "- Produce EXACTLY 3 attempts in this order:",
    "    1. category=CLEAN_CORRECT: a textbook 3-5 step proof. All steps should be true and follow logically. stepExpectedVerdicts[i] = 'VERIFIED' for each. expectedFinalCorrect=true.",
    "    2. category=OFF_BY_ONE: take a CLEAN_CORRECT-style proof but introduce ONE specific wrong move (sign flip, missed cross term, off-by-one constant). Steps before the bug = 'VERIFIED'; the bugged step + downstream steps = 'INVALID'. expectedFinalCorrect=false.",
    "    3. category=TOTALLY_WRONG: 1-3 step attempt that confidently asserts a conclusion contradicting the goal. The FIRST step should be 'INVALID' (mathematically false). expectedFinalCorrect=false.",
    "- Each step must be a SINGLE LaTeX equation, inequality, or claim — no English narration inside the step text.",
    "- Use plain ASCII for variable names (a, b, x, y, n, k, etc.) and standard LaTeX (\\\\frac, \\\\sqrt, \\\\geq, \\\\leq, ...).",
    "- If the problem has no natural algebraic working (pure existence claim, abstract logic), set the attempts as single CLAIM steps with stepExpectedVerdicts = ['ESCALATE'] and category accordingly; in that case still return three entries but each may have 1 step.",
    "",
    `Problem statement:\n${fixture.problemStatement}`,
    "",
    `Rubric goal:\n${fixture.rubric.goalStatement}`
  ].join("\n");
}

type SynthAttempt = z.infer<typeof synthAttemptSchema>;

function attemptToSolution(attempt: SynthAttempt): GradingFixture["studentSolutions"][number] {
  return {
    label: attempt.category.toLowerCase().replace(/_/g, "-"),
    description: attempt.description,
    category: attempt.category,
    steps: attempt.steps.map((latex, i) => ({
      latex,
      expectedVerdict:
        attempt.stepExpectedVerdicts[i] ?? attempt.stepExpectedVerdicts.at(-1)!
    })),
    expectedFinalCorrect: attempt.expectedFinalCorrect
  };
}

async function synthesizeOne(
  fixture: GradingFixture
): Promise<GradingFixture | null> {
  const prompt = buildPrompt(fixture);
  const result = await callOpenAIJson({
    scope: "grading-attempt-synth",
    schemaName: "synth_attempts",
    prompt,
    schema: synthBatchSchema,
    jsonSchema: synthBatchJsonSchema,
    maxOutputTokens: 900
  });
  if (!result) return null;
  const next: GradingFixture = {
    ...fixture,
    studentSolutions: [
      ...fixture.studentSolutions,
      ...result.attempts.map(attemptToSolution)
    ]
  };
  // Re-parse so we surface validation errors early.
  return fixtureSchema.parse(next);
}

type Args = {
  input: string;
  output: string;
  limit?: number;
  /** Skip fixtures whose problemStatement is shorter than this (often
   *  the humanized Lean signature for theorems without leading comment
   *  — too cryptic to reliably synthesize attempts for). */
  minStatementLength: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    input: "src/scripts/grading-eval/fixtures/minif2f.json",
    output: "src/scripts/grading-eval/fixtures/minif2f-synth.json",
    minStatementLength: 30
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--min-statement-length")
      out.minStatementLength = Number(argv[++i]);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawText = await readFile(args.input, "utf-8");
  const raw = JSON.parse(rawText) as unknown[];
  const fixtures = raw.map((x) => fixtureSchema.parse(x));

  const eligible = fixtures.filter(
    (f) =>
      f.problemStatement.length >= args.minStatementLength &&
      f.studentSolutions.length <= 1
  );
  console.log(
    `[synth] ${eligible.length}/${fixtures.length} fixtures eligible (have ≤1 attempt + statement length ≥ ${args.minStatementLength})`
  );

  const target =
    args.limit && args.limit > 0 ? eligible.slice(0, args.limit) : eligible;

  const out: GradingFixture[] = [];
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < target.length; i += 1) {
    const fx = target[i];
    process.stdout.write(`[${i + 1}/${target.length}] ${fx.key} ... `);
    try {
      const next = await synthesizeOne(fx);
      if (next && next.studentSolutions.length > fx.studentSolutions.length) {
        out.push(next);
        ok += 1;
        console.log(`ok (+${next.studentSolutions.length - fx.studentSolutions.length})`);
      } else {
        fail += 1;
        console.log("skipped (api/schema)");
      }
    } catch (err) {
      fail += 1;
      console.log(`fail (${err instanceof Error ? err.message : err})`);
    }
  }

  await writeFile(args.output, JSON.stringify(out, null, 2));
  console.log(
    `[synth] wrote ${out.length} enriched fixtures (ok=${ok} fail=${fail}) → ${args.output}`
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

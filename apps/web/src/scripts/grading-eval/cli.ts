/**
 * CLI entry point for the grading-eval harness.
 *
 * Wires real backends (OpenAI judges, SymPy/Lean Fly verifier) and runs
 * the seed fixture set. Usage:
 *
 *   pnpm grading:eval                   # all fixtures
 *   pnpm grading:eval -- --key seed-amgm-2var
 *   pnpm grading:eval -- --no-llm       # offline (rule + SymPy only)
 *   pnpm grading:eval -- --no-verifier  # local-only (rule + LLM only)
 *
 * Required env: OPENAI_API_KEY (unless --no-llm), PROOF_VERIFIER_URL
 * (unless --no-verifier).
 */

import { gradeStep, type GradeStepDeps } from "@/lib/grading/step-pipeline";
import type { StepInput, StepType } from "@/lib/grading/types";
import {
  defaultJudgePair,
  makeLeanClaimBackend,
  makeSympyBackend,
  makeAnswerRuleBackend
} from "@/lib/grading/backends";
import { runGradingEval } from "./runner";
import { SEED_FIXTURES } from "./fixtures/seed";
import { loadMiniF2FFixtures, miniF2FAvailable } from "./fixtures/minif2f";
import {
  loadMiniF2FSynthFixtures,
  miniF2FSynthAvailable
} from "./fixtures/minif2f-synth";

type Flags = {
  key?: string;
  noLlm: boolean;
  noVerifier: boolean;
  includeMinif2f: boolean;
  seedOnly: boolean;
  limit?: number;
  /** 0..N. When set, takes a shuffled deterministic sample of the gold set. */
  sample?: number;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    noLlm: false,
    noVerifier: false,
    includeMinif2f: false,
    seedOnly: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--key") flags.key = argv[++i];
    else if (a === "--no-llm") flags.noLlm = true;
    else if (a === "--no-verifier") flags.noVerifier = true;
    else if (a === "--minif2f") flags.includeMinif2f = true;
    else if (a === "--seed-only") flags.seedOnly = true;
    else if (a === "--limit") flags.limit = Number(argv[++i]);
    else if (a === "--sample") flags.sample = Number(argv[++i]);
  }
  return flags;
}

function deterministicShuffle<T>(items: T[], seed = 0xC0FFEE): T[] {
  // xorshift32-based Fisher-Yates so `--sample N` is reproducible.
  const arr = [...items];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = (s >>> 0) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shallowClassify(input: StepInput): {
  stepType: StepType;
  confidence: number;
} {
  // Cheap heuristic so the eval runs without an LLM classifier in the
  // loop. The proof-verifier's Python classifier is canonical; this is
  // a stand-in until we hook it in via fetch from the runner.
  const t = input.latex;
  if (/\\boxed|final answer|=\s*$/i.test(t))
    return { stepType: "CONCLUSION", confidence: 0.8 };
  if (/\\leq|\\geq|<|>|≤|≥/.test(t))
    return { stepType: "INEQUALITY", confidence: 0.8 };
  if (/=/.test(t)) return { stepType: "EQUATION", confidence: 0.7 };
  if (/^there exist|primes|exists/i.test(t))
    return { stepType: "CLAIM", confidence: 0.7 };
  return { stepType: "ALGEBRAIC_EQUIVALENCE", confidence: 0.5 };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  // Prefer the synth-enriched fixtures when present: they replace the
  // sorry-stub-only miniF2F entries with multi-attempt versions that
  // actually exercise VERIFIED / INVALID branches.
  const useSynth = !flags.seedOnly && miniF2FSynthAvailable();
  const all = flags.seedOnly
    ? [...SEED_FIXTURES]
    : [
        ...SEED_FIXTURES,
        ...(useSynth
          ? loadMiniF2FSynthFixtures()
          : flags.includeMinif2f || miniF2FAvailable()
            ? loadMiniF2FFixtures()
            : [])
      ];
  let fixtures = flags.key
    ? all.filter((f) => f.key === flags.key)
    : all;
  if (flags.sample !== undefined && flags.sample > 0) {
    fixtures = deterministicShuffle(fixtures).slice(0, flags.sample);
  } else if (flags.limit !== undefined && flags.limit > 0) {
    fixtures = fixtures.slice(0, flags.limit);
  }
  if (fixtures.length === 0) {
    console.error(`No fixture matched --key ${flags.key}`);
    process.exit(2);
  }
  console.log(
    `[grading-eval] ${fixtures.length} fixtures loaded ` +
      `(seed=${SEED_FIXTURES.length} miniF2F=${
        miniF2FAvailable() ? loadMiniF2FFixtures().length : 0
      } synth=${miniF2FSynthAvailable() ? loadMiniF2FSynthFixtures().length : 0})`
  );

  // Per-fixture pipeline: we instantiate a fresh AnswerRuleBackend per
  // problem because its canonicalAnswer is fixture-specific. The judge
  // and verifier backends are shared across fixtures.
  const sharedBackends = [
    ...(flags.noVerifier
      ? []
      : [makeSympyBackend({}), makeLeanClaimBackend({})]),
    ...(flags.noLlm ? [] : defaultJudgePair())
  ];

  let total = { stepCorrect: 0, totalSteps: 0, escalations: 0 };
  for (const fixture of fixtures) {
    const deps: GradeStepDeps = {
      classify: async (s) => shallowClassify(s),
      backends: [
        makeAnswerRuleBackend({
          canonicalAnswer: fixture.rubric.goalStatement
        }),
        ...sharedBackends
      ],
      isCritical: (stepType) => stepType === "CONCLUSION"
    };
    const { metrics, perStep } = await runGradingEval([fixture], deps);
    total.stepCorrect += metrics.stepCorrect;
    total.totalSteps += metrics.totalSteps;
    total.escalations += metrics.escalations;
    console.log(`\n=== ${fixture.key} ===`);
    console.log(
      `  steps=${metrics.totalSteps} correct=${metrics.stepCorrect} ` +
        `escalations=${metrics.escalations} ` +
        `falseVerified=${metrics.falseVerifiedCount} ` +
        `falseInvalid=${metrics.falseInvalidCount} ` +
        `finalAccuracy=${(metrics.finalAnswerAccuracy * 100).toFixed(1)}%`
    );
    for (const r of perStep.filter((x) => !x.matched)) {
      console.log(
        `    MISS [${r.solutionLabel}#${r.stepIndex}] expected=${r.expected} ` +
          `committed=${r.committed} escalated=${r.escalated}`
      );
    }
  }
  console.log("\n=== Overall ===");
  console.log(
    `  steps=${total.totalSteps} correct=${total.stepCorrect} ` +
      `accuracy=${
        total.totalSteps > 0
          ? ((total.stepCorrect / total.totalSteps) * 100).toFixed(1)
          : "n/a"
      }% escalations=${total.escalations}`
  );
}

// This file is a CLI entry point; always run main when imported by tsx.
// Tests should import `main` or the helpers from `runner.ts` directly
// and call them themselves rather than importing this module.
void main();

export { main };

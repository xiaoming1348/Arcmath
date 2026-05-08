/**
 * Library module for the PROOF-problem preprocessing pipeline — the
 * formerly-CLI-only logic in scripts/preprocess-problems.ts, extracted so
 * it can also be invoked from:
 *
 *   - the admin-import commit mutation (auto-trigger after a teacher
 *     uploads a homework set)
 *   - the admin UI's "reprocess this problem" button
 *   - future background workers
 *
 * The module exposes two primitives:
 *
 *   preprocessProblems({ problemIds, concurrency })
 *     — run the full pipeline on a set of problems, in parallel.
 *
 *   preprocessSingleProblem(problemId, opts)
 *     — run on one problem, suitable for retry buttons.
 *
 * Concurrency note: `generateStructuredSolution` hits OpenAI and `/prove`
 * hits the Lean verifier. OpenAI can handle 4-way parallel easily at our
 * tier; Lean /prove is CPU-bound on the service side but still fine at
 * 3-4 parallel — the bottleneck there is the autoformalizer's OpenAI
 * call, not Lean itself. We default to 4.
 */

import { prisma, Prisma, type FormalizedStatus } from "@arcmath/db";
import {
  STRUCTURED_SOLUTION_VERSION,
  generateStructuredSolution,
  type StructuredSolution
} from "../ai/solution-generator";

export const FORMALIZATION_VERSION_DEFAULT = "arcmath-fc-2026-04-21";

const PROVE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_COMPLETION_RETRIES = 2;

type ProveStatus = "VERIFIED" | "INVALID" | "UNKNOWN" | "LLM_FAIL" | "NO_API_KEY";

type ProveResponse = {
  status: ProveStatus;
  autoformalized?: string;
  completed?: string;
  verifier_verdict?: string | null;
  verifier_details?: Record<string, unknown>;
  retries_used?: number;
  model?: string;
  notes?: string;
};

export type PreprocessOptions = {
  /** If true, skip the Lean /prove step (fastest path — ~15-20s/problem). */
  solutionOnly?: boolean;
  /** If true, skip recipe generation (debug only). */
  noSolution?: boolean;
  /** Formalization version to stamp on the row. */
  version?: string;
  /** If true, don't write to DB — just return what would happen. */
  dryRun?: boolean;
};

export type PreprocessSummary = {
  scanned: number;
  verified: number;
  failed: number;
  manualReview: number;
  skipped: number;
  errors: number;
  recipesWritten: number;
  recipeFailures: number;
};

export type PreprocessProblemInput = {
  problemIds: string[];
  concurrency?: number;
  /** Callback for per-problem completion — useful for streaming progress
   *  to the admin UI. */
  onProblemDone?: (
    problemId: string,
    outcome: FormalizedStatus | "ERROR"
  ) => void;
  options?: PreprocessOptions;
};

function getVerifierBase(): string | null {
  const raw = process.env.PROOF_VERIFIER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

async function callProve(naturalLanguage: string): Promise<ProveResponse> {
  const base = getVerifierBase();
  if (!base) {
    // When the verifier is unreachable, degrade gracefully: report
    // UNKNOWN so the orchestrator flags the row MANUAL_REVIEW and lets
    // the recipe stage run independently. This lets the teacher-upload
    // flow succeed even if Lean infra is offline — recipe-only grading
    // still works downstream.
    return {
      status: "UNKNOWN",
      notes: "PROOF_VERIFIER_URL not configured; skipping Lean prove."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "math",
        natural_language_statement: naturalLanguage,
        max_completion_retries: MAX_COMPLETION_RETRIES
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`/prove returned HTTP ${res.status}`);
    }
    return (await res.json()) as ProveResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNaturalLanguage(
  statement: string,
  solutionSketch: string | null
): string {
  const stem = statement.trim();
  if (!solutionSketch || solutionSketch.trim().length === 0) {
    return stem;
  }
  return `${stem}\n\nKnown solution sketch (use as a hint for the theorem shape, not as proof):\n${solutionSketch.trim()}`;
}

function mapStatus(prove: ProveResponse): FormalizedStatus {
  if (prove.status === "VERIFIED") return "VERIFIED";
  if (prove.status === "INVALID") return "FAILED";
  return "MANUAL_REVIEW";
}

type SolutionPath = {
  tactic: "autoformalize+complete";
  leanCode: string;
  model: string;
  retriesUsed: number;
  verifiedAt: string;
};

function buildSolutionPaths(prove: ProveResponse): SolutionPath[] | null {
  if (prove.status !== "VERIFIED") return null;
  const leanCode = (prove.completed ?? "").trim();
  if (!leanCode) return null;
  return [
    {
      tactic: "autoformalize+complete",
      leanCode,
      model: prove.model ?? "",
      retriesUsed: prove.retries_used ?? 0,
      verifiedAt: new Date().toISOString()
    }
  ];
}

function buildReason(prove: ProveResponse): string {
  if (prove.status === "VERIFIED") return "";
  const details = prove.verifier_details ?? {};
  const tail =
    typeof details.stdout_tail === "string"
      ? details.stdout_tail
      : typeof details.reason === "string"
        ? details.reason
        : "";
  const head = prove.notes ?? prove.status;
  const combined = tail ? `${head}\n---\n${tail}` : head;
  return combined.slice(0, 4000);
}

type ProveOutcome = {
  status: FormalizedStatus | "ERROR";
  formalizedStatement: string | null;
  solutionPaths: SolutionPath[] | null;
  reason: string | null;
  verifiedLeanProof: string | null;
};

async function runLeanProve(
  problem: { id: string; statement: string; solutionSketch: string | null }
): Promise<ProveOutcome> {
  const nl = buildNaturalLanguage(problem.statement, problem.solutionSketch);
  let prove: ProveResponse;
  try {
    prove = await callProve(nl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "ERROR",
      formalizedStatement: null,
      solutionPaths: null,
      reason: `transport error: ${msg}`.slice(0, 2000),
      verifiedLeanProof: null
    };
  }

  const status = mapStatus(prove);
  const reason = buildReason(prove);
  const solutionPaths = buildSolutionPaths(prove);

  return {
    status,
    formalizedStatement: (prove.autoformalized ?? "").trim() || null,
    solutionPaths,
    reason: reason || null,
    verifiedLeanProof: solutionPaths?.[0]?.leanCode ?? null
  };
}

type RecipeOutcome =
  | { ok: true; recipe: StructuredSolution }
  | { ok: false; reason: string };

async function runRecipeGen(
  problem: { id: string; statement: string; solutionSketch: string | null },
  verifiedLeanProof: string | null
): Promise<RecipeOutcome> {
  let recipe: StructuredSolution | null;
  try {
    recipe = await generateStructuredSolution({
      problemStatement: problem.statement,
      solutionSketch: problem.solutionSketch,
      verifiedLeanProof
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `recipe transport error: ${msg}` };
  }
  if (!recipe) {
    return { ok: false, reason: "recipe generator returned null (api/schema)" };
  }
  return { ok: true, recipe };
}

async function processOneInternal(
  problem: {
    id: string;
    statement: string | null;
    solutionSketch: string | null;
    formalizedStatement: string | null;
    formalizedStatus: FormalizedStatus;
  },
  options: Required<PreprocessOptions>,
  counters: { recipesWritten: number; recipeFailures: number }
): Promise<FormalizedStatus | "ERROR"> {
  const statement = problem.statement?.trim();
  if (!statement) {
    if (!options.dryRun) {
      await prisma.problem.update({
        where: { id: problem.id },
        data: {
          formalizedStatus: "MANUAL_REVIEW",
          formalizedReason: "Problem has no statement text to formalize.",
          formalizedAt: new Date(),
          formalizedVersion: options.version
        }
      });
    }
    return "MANUAL_REVIEW";
  }

  let prove: ProveOutcome | null = null;
  if (!options.solutionOnly) {
    prove = await runLeanProve({
      id: problem.id,
      statement,
      solutionSketch: problem.solutionSketch
    });
  }

  let recipe: RecipeOutcome | null = null;
  if (!options.noSolution) {
    const leanGrounding = prove?.verifiedLeanProof ?? null;
    recipe = await runRecipeGen(
      { id: problem.id, statement, solutionSketch: problem.solutionSketch },
      leanGrounding
    );
  }

  if (options.dryRun) {
    return (prove?.status && prove.status !== "ERROR"
      ? prove.status
      : problem.formalizedStatus) as FormalizedStatus;
  }

  const recipePayload: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    recipe && recipe.ok
      ? (recipe.recipe as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  if (options.solutionOnly) {
    if (recipe && recipe.ok) {
      await prisma.problem.update({
        where: { id: problem.id },
        data: {
          milestoneChecks: recipePayload,
          // Solution-only runs are what the teacher-upload flow uses when
          // Lean infra is offline or slow. Flip PENDING → MANUAL_REVIEW so
          // the row is usable (grader falls back to LLM judge) rather than
          // stuck in PENDING forever.
          formalizedStatus:
            problem.formalizedStatus === "PENDING"
              ? "MANUAL_REVIEW"
              : problem.formalizedStatus,
          formalizedReason: null,
          formalizedAt: new Date(),
          formalizedVersion: options.version
        }
      });
      counters.recipesWritten += 1;
    } else if (recipe) {
      counters.recipeFailures += 1;
      // If the recipe failed we leave the row as-is. On retry the planner
      // will pick it up again by milestoneChecks.version mismatch.
    }
    return problem.formalizedStatus;
  }

  const data: Prisma.ProblemUpdateInput = {
    formalizedStatus: prove!.status === "ERROR" ? "MANUAL_REVIEW" : prove!.status,
    formalizedStatement: prove!.formalizedStatement,
    solutionPaths: prove!.solutionPaths
      ? (prove!.solutionPaths as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    milestoneChecks: recipePayload,
    formalizedReason: prove!.reason,
    formalizedAt: new Date(),
    formalizedVersion: options.version
  };

  await prisma.problem.update({ where: { id: problem.id }, data });

  if (recipe && recipe.ok) counters.recipesWritten += 1;
  else if (recipe) counters.recipeFailures += 1;

  return prove!.status === "ERROR" ? "ERROR" : prove!.status;
}

/**
 * Run the full preprocessing pipeline on a set of problems.
 *
 * Callers own selecting the problemIds — we don't scan the DB here.
 * Use preprocessPendingInSet() below for that.
 */
export async function preprocessProblems(
  input: PreprocessProblemInput
): Promise<PreprocessSummary> {
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 8));
  const options: Required<PreprocessOptions> = {
    solutionOnly: input.options?.solutionOnly ?? false,
    noSolution: input.options?.noSolution ?? false,
    version: input.options?.version ?? FORMALIZATION_VERSION_DEFAULT,
    dryRun: input.options?.dryRun ?? false
  };

  const summary: PreprocessSummary = {
    scanned: 0,
    verified: 0,
    failed: 0,
    manualReview: 0,
    skipped: 0,
    errors: 0,
    recipesWritten: 0,
    recipeFailures: 0
  };

  if (input.problemIds.length === 0) return summary;

  const problems = await prisma.problem.findMany({
    where: { id: { in: input.problemIds }, answerFormat: "PROOF" },
    select: {
      id: true,
      statement: true,
      solutionSketch: true,
      formalizedStatement: true,
      formalizedStatus: true
    }
  });

  summary.scanned = problems.length;

  // Simple promise pool. The OpenAI client is safe to use concurrently.
  // We bucket work into `concurrency` workers that each pull from a
  // shared queue. This keeps work balanced if some problems are fast
  // and some are slow (common — short proofs finish recipe-gen in ~10s
  // while complex ones take ~25s).
  const queue = [...problems];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const p = queue.shift();
      if (!p) break;
      try {
        const outcome = await processOneInternal(p, options, summary);
        input.onProblemDone?.(p.id, outcome);
        switch (outcome) {
          case "VERIFIED":
            summary.verified += 1;
            break;
          case "FAILED":
            summary.failed += 1;
            break;
          case "MANUAL_REVIEW":
            summary.manualReview += 1;
            break;
          case "SKIPPED":
          case "PENDING":
            summary.skipped += 1;
            break;
          case "ERROR":
          default:
            summary.errors += 1;
            break;
        }
      } catch (err) {
        summary.errors += 1;
        // Don't let one bad problem kill the whole batch. Mark the row
        // so admin UI can flag it.
        if (!options.dryRun) {
          const msg = err instanceof Error ? err.message : String(err);
          try {
            await prisma.problem.update({
              where: { id: p.id },
              data: {
                formalizedStatus: "MANUAL_REVIEW",
                formalizedReason: `preprocess worker exception: ${msg}`.slice(
                  0,
                  4000
                ),
                formalizedAt: new Date(),
                formalizedVersion: options.version
              }
            });
          } catch {
            // best-effort; next run will retry
          }
        }
        input.onProblemDone?.(p.id, "ERROR");
      }
    }
  });

  await Promise.all(workers);
  return summary;
}

/**
 * Scan a problem set for PROOF rows that still need preprocessing and
 * run the pipeline on them. Used by the admin UI "reprocess" button and
 * the auto-trigger after teacher uploads.
 */
export async function preprocessPendingInSet(
  problemSetId: string,
  options?: PreprocessOptions & { concurrency?: number }
): Promise<PreprocessSummary> {
  const rows = await prisma.problem.findMany({
    where: {
      problemSetId,
      answerFormat: "PROOF",
      OR: [
        { formalizedStatus: "PENDING" },
        { milestoneChecks: { equals: Prisma.AnyNull } }
      ]
    },
    select: { id: true }
  });
  return preprocessProblems({
    problemIds: rows.map((r) => r.id),
    concurrency: options?.concurrency,
    options
  });
}

/**
 * Fire-and-forget wrapper. Logs errors to the server console instead of
 * throwing, so a transient infra hiccup doesn't rollback the caller's
 * commit transaction.
 */
export function schedulePreprocessInBackground(
  problemIds: string[],
  options?: PreprocessOptions & { concurrency?: number }
): void {
  if (problemIds.length === 0) return;
  // Kick off on next tick so we don't block the caller's response.
  void Promise.resolve().then(async () => {
    try {
      const summary = await preprocessProblems({
        problemIds,
        concurrency: options?.concurrency,
        options
      });
      console.log(
        `[preprocess] background batch done: scanned=${summary.scanned} verified=${summary.verified} failed=${summary.failed} manual=${summary.manualReview} errors=${summary.errors} recipes=${summary.recipesWritten}`
      );
    } catch (err) {
      console.error("[preprocess] background batch threw:", err);
    }
  });
}

export { STRUCTURED_SOLUTION_VERSION };

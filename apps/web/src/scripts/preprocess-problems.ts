/**
 * Offline pre-processor that turns each PROOF problem's natural-language
 * statement into a machine-checked Lean 4 theorem + proof and persists the
 * result on the Problem row.
 *
 * Rationale: student-attempt grading used to call /prove on every step,
 * which re-autoformalizes the same theorem for every attempt and pays the
 * OpenAI + Lean-kernel latency each time. Running this script once offline
 * gives us:
 *
 *   - a canonical Lean 4 signature we can paste in front of the student's
 *     step so the kernel just has to check one extra line
 *   - one or more machine-checked proofs (solutionPaths) we can diff
 *     against the student's approach for multi-solution support
 *   - a formalizedStatus we can block on at attempt time: VERIFIED means
 *     "ok to do per-step Lean checking", FAILED/MANUAL_REVIEW means "fall
 *     back to LLM judge + flag for content review"
 *
 * Usage:
 *   pnpm preprocess:problems                                  # all PENDING proof problems
 *   pnpm preprocess:problems -- --problem-set-id <id>          # one problem set
 *   pnpm preprocess:problems -- --problem-id <id>              # one problem
 *   pnpm preprocess:problems -- --status FAILED --retry        # retry previous failures
 *   pnpm preprocess:problems -- --limit 5                      # cap run size
 *   pnpm preprocess:problems -- --version arcmath-fc-2026-04-21 # bump & reprocess
 *
 * Requires PROOF_VERIFIER_URL (e.g. http://127.0.0.1:8765) pointing at a
 * live verifier with OPENAI_API_KEY configured. Run via:
 *   bash scripts/with-env-local.sh pnpm --filter web preprocess:problems
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, Prisma, type FormalizedStatus } from "@arcmath/db";
import {
  STRUCTURED_SOLUTION_VERSION,
  generateStructuredSolution,
  type StructuredSolution
} from "../lib/ai/solution-generator";

// Bumped whenever the carrier lib, NL_TO_LEAN_* prompt, or completion
// tactic recipe changes in a way that could retroactively invalidate
// cached formalizations. The script will skip rows whose version matches
// unless --force is passed.
const FORMALIZATION_VERSION_DEFAULT = "arcmath-fc-2026-04-21";

// Per-request budget at the verifier. /prove orchestrates autoformalize
// + complete + up to N kernel retries, so budget for worst case of a
// retry-heavy inequality that hits Lean compile twice.
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

type PreprocessOptions = {
  problemSetId?: string;
  problemId?: string;
  onlyStatus?: FormalizedStatus;
  force: boolean;
  retryFailed: boolean;
  limit?: number;
  version: string;
  dryRun: boolean;
  // Phase D toggles for the structured solution recipe step.
  solutionOnly: boolean;  // skip /prove, only run recipe generation
  noSolution: boolean;    // skip recipe generation, only run /prove (debug)
};

type PreprocessSummary = {
  scanned: number;
  verified: number;
  failed: number;
  manualReview: number;
  skipped: number;
  errors: number;
  // Recipes generated successfully this run (independent of Lean outcome).
  recipesWritten: number;
  // Recipe generation attempted but the LLM call failed / schema invalid.
  recipeFailures: number;
};

function parseArgs(argv: string[]): PreprocessOptions {
  const opts: PreprocessOptions = {
    force: false,
    retryFailed: false,
    dryRun: false,
    version: FORMALIZATION_VERSION_DEFAULT,
    solutionOnly: false,
    noSolution: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    // pnpm passes through a bare `--` between `pnpm run <x>` and user flags;
    // tsx keeps it in argv. Ignore it silently.
    if (arg === "--") continue;
    switch (arg) {
      case "--problem-set-id":
        opts.problemSetId = next;
        i++;
        break;
      case "--problem-id":
        opts.problemId = next;
        i++;
        break;
      case "--status":
        opts.onlyStatus = next as FormalizedStatus;
        i++;
        break;
      case "--limit":
        opts.limit = Number.parseInt(next ?? "", 10);
        if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
          throw new Error("--limit expects a positive integer");
        }
        i++;
        break;
      case "--version":
        opts.version = next ?? opts.version;
        i++;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--retry":
      case "--retry-failed":
        opts.retryFailed = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--solution-only":
        opts.solutionOnly = true;
        break;
      case "--no-solution":
        opts.noSolution = true;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.solutionOnly && opts.noSolution) {
    throw new Error("--solution-only and --no-solution are mutually exclusive");
  }
  return opts;
}

function printUsage(): void {
  console.log("Pre-process PROOF problems into machine-checked Lean theorems.");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm preprocess:problems -- [flags]");
  console.log("");
  console.log("Flags:");
  console.log("  --problem-set-id <id>   Limit to one problem set");
  console.log("  --problem-id <id>       Limit to a single problem (overrides set filter)");
  console.log("  --status <STATUS>       Only rows with this formalizedStatus (default: PENDING + version mismatch)");
  console.log("  --retry | --retry-failed  Include FAILED/MANUAL_REVIEW rows");
  console.log("  --force                 Reprocess even if row is already VERIFIED at the current version");
  console.log("  --limit N               Cap the number of problems touched");
  console.log("  --version STR           Mark written rows with this formalizedVersion");
  console.log("  --dry-run               Print plan, do not write");
  console.log("  --solution-only         Skip /prove; only (re)generate the structured solution recipe.");
  console.log("                          Planner = all PROOF rows with a missing or outdated recipe.");
  console.log("  --no-solution           Skip recipe generation; run Lean only (debug).");
}

function getVerifierBase(): string {
  const raw = process.env.PROOF_VERIFIER_URL?.trim();
  if (!raw) {
    throw new Error(
      "PROOF_VERIFIER_URL is not set. Point it at the running proof-verifier (e.g. http://127.0.0.1:8765)."
    );
  }
  return raw.replace(/\/+$/, "");
}

async function callProve(naturalLanguage: string): Promise<ProveResponse> {
  const base = getVerifierBase();
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

// Build the natural-language prompt fed to /prove. We intentionally pass
// the raw problem statement — the verifier's NL_TO_LEAN_* prompts already
// handle LaTeX and domain cues. `solutionSketch` is appended as a hint so
// the autoformalizer picks a provable form (e.g. knows whether an AIME
// problem wants the value or a proof of the value).
function buildNaturalLanguage(statement: string, solutionSketch: string | null): string {
  const stem = statement.trim();
  if (!solutionSketch || solutionSketch.trim().length === 0) {
    return stem;
  }
  return `${stem}\n\nKnown solution sketch (use as a hint for the theorem shape, not as proof):\n${solutionSketch.trim()}`;
}

function mapStatus(prove: ProveResponse): FormalizedStatus {
  if (prove.status === "VERIFIED") return "VERIFIED";
  // INVALID after retries means the kernel rejected every attempt we
  // could produce. LLM_FAIL / NO_API_KEY are infrastructure problems that
  // a human needs to inspect (expired key, model outage) — not the same
  // as the kernel saying "this is false", so flag them distinctly.
  if (prove.status === "INVALID") return "FAILED";
  if (prove.status === "UNKNOWN") return "MANUAL_REVIEW";
  return "MANUAL_REVIEW";
}

// solutionPaths shape — a list of proof attempts we've verified. For now
// /prove returns one path per call; future work could call it with
// different prompts (direct vs contradiction) and collect multiple.
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

// Short reason string to store in formalizedReason for triage. Keeps the
// latest kernel stdout tail so a human can skim without re-running.
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

// --- Stage 1: call /prove, build the formalized-status side of the row. ---
type ProveOutcome = {
  status: FormalizedStatus | "ERROR";
  formalizedStatement: string | null;
  solutionPaths: SolutionPath[] | null;
  reason: string | null;
  verifiedLeanProof: string | null; // for feeding into Stage 2
};

async function runLeanProve(
  problem: { id: string; statement: string; solutionSketch: string | null }
): Promise<ProveOutcome> {
  const nl = buildNaturalLanguage(problem.statement, problem.solutionSketch);
  const started = Date.now();
  let prove: ProveResponse;
  try {
    prove = await callProve(nl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [${problem.id}] /prove threw: ${msg}`);
    return {
      status: "ERROR",
      formalizedStatement: null,
      solutionPaths: null,
      reason: `transport error: ${msg}`.slice(0, 2000),
      verifiedLeanProof: null
    };
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const status = mapStatus(prove);
  const reason = buildReason(prove);
  const solutionPaths = buildSolutionPaths(prove);

  console.log(
    `  [${problem.id}] prove=${status} in ${elapsed}s` +
      (prove.retries_used ? ` (retries=${prove.retries_used})` : "") +
      (reason ? ` — ${reason.split("\n")[0]?.slice(0, 120) ?? ""}` : "")
  );

  return {
    status,
    formalizedStatement: (prove.autoformalized ?? "").trim() || null,
    solutionPaths,
    reason: reason || null,
    verifiedLeanProof: solutionPaths?.[0]?.leanCode ?? null
  };
}

// --- Stage 2: LLM-generated structured solution recipe. ---
type RecipeOutcome =
  | { ok: true; recipe: StructuredSolution; elapsedSec: string }
  | { ok: false; reason: string; elapsedSec: string };

async function runRecipeGen(
  problem: { id: string; statement: string; solutionSketch: string | null },
  verifiedLeanProof: string | null
): Promise<RecipeOutcome> {
  const started = Date.now();
  let recipe: StructuredSolution | null;
  try {
    recipe = await generateStructuredSolution({
      problemStatement: problem.statement,
      solutionSketch: problem.solutionSketch,
      verifiedLeanProof
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
    console.warn(`  [${problem.id}] generateStructuredSolution threw: ${msg}`);
    return { ok: false, reason: `recipe transport error: ${msg}`, elapsedSec };
  }
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  if (!recipe) {
    console.warn(`  [${problem.id}] recipe=FAIL in ${elapsedSec}s`);
    return { ok: false, reason: "recipe generator returned null (api/schema)", elapsedSec };
  }
  console.log(
    `  [${problem.id}] recipe=OK in ${elapsedSec}s — ${recipe.goalType}, ${recipe.steps.length} step(s)`
  );
  return { ok: true, recipe, elapsedSec };
}

// --- Orchestrator: runs enabled stages and persists the row. ---
type ProcessOneResult = FormalizedStatus | "ERROR";

async function processOne(
  problem: {
    id: string;
    statement: string | null;
    solutionSketch: string | null;
    formalizedStatement: string | null;
    formalizedStatus: FormalizedStatus;
  },
  opts: PreprocessOptions,
  counters: { recipesWritten: number; recipeFailures: number }
): Promise<ProcessOneResult> {
  const statement = problem.statement?.trim();
  if (!statement) {
    // A PROOF problem without a statement can't be processed in either
    // stage; flag for human triage so it doesn't silently sit in PENDING.
    if (!opts.dryRun) {
      await prisma.problem.update({
        where: { id: problem.id },
        data: {
          formalizedStatus: "MANUAL_REVIEW",
          formalizedReason: "Problem has no statement text to formalize.",
          formalizedAt: new Date(),
          formalizedVersion: opts.version
        }
      });
    }
    return "MANUAL_REVIEW";
  }

  // --- Stage 1: Lean /prove (skip if --solution-only). ---
  let prove: ProveOutcome | null = null;
  if (!opts.solutionOnly) {
    prove = await runLeanProve({ id: problem.id, statement, solutionSketch: problem.solutionSketch });
    if (prove.status === "ERROR") {
      // Still try recipe generation — it's independent. But persist the
      // error so the row's status reflects the transport failure.
      if (!opts.dryRun) {
        await prisma.problem.update({
          where: { id: problem.id },
          data: {
            formalizedStatus: "MANUAL_REVIEW",
            formalizedReason: prove.reason,
            formalizedAt: new Date(),
            formalizedVersion: opts.version
          }
        });
      }
    }
  }

  // --- Stage 2: structured solution recipe (skip if --no-solution). ---
  // Grounding: use the freshly-verified Lean proof if we just produced
  // one; otherwise fall back to the already-stored one (for
  // --solution-only runs over previously VERIFIED rows).
  let recipe: RecipeOutcome | null = null;
  if (!opts.noSolution) {
    const leanGrounding = prove?.verifiedLeanProof ?? null;
    recipe = await runRecipeGen(
      { id: problem.id, statement, solutionSketch: problem.solutionSketch },
      leanGrounding
    );
  }

  if (opts.dryRun) {
    // Dry-run: return a conservative status derived from whatever we
    // have. Prefer the /prove status; fall back to current row's status.
    const s = prove?.status && prove.status !== "ERROR" ? prove.status : problem.formalizedStatus;
    return s as ProcessOneResult;
  }

  // --- Persist. Split into two branches because --solution-only must
  //     not touch formalized* fields, and full runs update both sides.
  const recipePayload: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    recipe && recipe.ok ? (recipe.recipe as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;

  if (opts.solutionOnly) {
    // Touch only the recipe column. Leave formalizedStatus alone.
    if (recipe && recipe.ok) {
      await prisma.problem.update({
        where: { id: problem.id },
        data: { milestoneChecks: recipePayload }
      });
      counters.recipesWritten += 1;
    } else if (recipe) {
      // Recipe failed; don't clear an older-but-usable one.
      counters.recipeFailures += 1;
    }
    return problem.formalizedStatus;
  }

  // Full run: write both formalized* (from /prove) and milestoneChecks
  // (from recipe) in one update so the row is never in a half-migrated
  // state.
  const data: Prisma.ProblemUpdateInput = {
    formalizedStatus: prove!.status === "ERROR" ? "MANUAL_REVIEW" : prove!.status,
    formalizedStatement: prove!.formalizedStatement,
    solutionPaths: prove!.solutionPaths
      ? (prove!.solutionPaths as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    milestoneChecks: recipePayload,
    formalizedReason: prove!.reason,
    formalizedAt: new Date(),
    formalizedVersion: opts.version
  };

  await prisma.problem.update({ where: { id: problem.id }, data });

  if (recipe && recipe.ok) counters.recipesWritten += 1;
  else if (recipe) counters.recipeFailures += 1;

  return prove!.status === "ERROR" ? "ERROR" : prove!.status;
}

async function preprocess(opts: PreprocessOptions): Promise<PreprocessSummary> {
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

  const where: Prisma.ProblemWhereInput = {
    answerFormat: "PROOF"
  };
  if (opts.problemId) {
    where.id = opts.problemId;
  } else if (opts.problemSetId) {
    where.problemSetId = opts.problemSetId;
  }

  if (opts.solutionOnly) {
    // Solution-only planner: scan every PROOF row whose stored recipe
    // is missing or at a previous STRUCTURED_SOLUTION_VERSION. We
    // detect via a JSON path filter on milestoneChecks.version.
    //
    // Null-handling gotcha: Prisma distinguishes SQL NULL (DbNull) from
    // JSON null (JsonNull) for nullable JSON columns. Freshly-seeded
    // rows have SQL NULL, while rows touched by a previous failed run
    // may carry JSON null. Use AnyNull to match both.
    if (!opts.onlyStatus && !opts.force) {
      where.OR = [
        { milestoneChecks: { equals: Prisma.AnyNull } },
        {
          AND: [
            { NOT: { milestoneChecks: { equals: Prisma.AnyNull } } },
            { NOT: { milestoneChecks: { path: ["version"], equals: STRUCTURED_SOLUTION_VERSION } } }
          ]
        }
      ];
    }
  } else if (opts.onlyStatus) {
    where.formalizedStatus = opts.onlyStatus;
  } else if (!opts.force) {
    // Default planner: everything not already VERIFIED-at-this-version.
    const include: FormalizedStatus[] = ["PENDING"];
    if (opts.retryFailed) {
      include.push("FAILED", "MANUAL_REVIEW");
    }
    where.OR = [
      { formalizedStatus: { in: include } },
      { AND: [{ formalizedStatus: "VERIFIED" }, { NOT: { formalizedVersion: opts.version } }] }
    ];
  }

  const problems = await prisma.problem.findMany({
    where,
    select: {
      id: true,
      number: true,
      statement: true,
      solutionSketch: true,
      formalizedStatement: true,
      formalizedStatus: true,
      problemSet: { select: { contest: true, year: true, exam: true } }
    },
    orderBy: [{ problemSetId: "asc" }, { number: "asc" }],
    take: opts.limit
  });

  console.log(`Planner selected ${problems.length} problem(s).`);
  if (opts.dryRun) {
    console.log("(dry-run: listing only)");
  }

  for (const p of problems) {
    summary.scanned += 1;
    const psLabel = p.problemSet
      ? `${p.problemSet.contest}-${p.problemSet.year}-${p.problemSet.exam}#${p.number}`
      : `#${p.number}`;
    console.log(`- ${psLabel} (${p.id})`);

    const result = await processOne(p, opts, summary);
    switch (result) {
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
        summary.skipped += 1;
        break;
      case "PENDING":
        summary.skipped += 1;
        break;
      case "ERROR":
      default:
        summary.errors += 1;
        break;
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  console.log("Preprocess-problems starting");
  console.log(`  version: ${opts.version}`);
  if (opts.problemId) console.log(`  problem: ${opts.problemId}`);
  if (opts.problemSetId) console.log(`  set:     ${opts.problemSetId}`);
  if (opts.onlyStatus) console.log(`  status:  ${opts.onlyStatus}`);
  if (opts.retryFailed) console.log("  retry:   FAILED + MANUAL_REVIEW included");
  if (opts.force) console.log("  force:   yes (will reprocess VERIFIED rows)");
  if (opts.limit) console.log(`  limit:   ${opts.limit}`);
  if (opts.dryRun) console.log("  dryRun:  yes");
  console.log(
    `  stages:  ${opts.solutionOnly ? "recipe-only" : opts.noSolution ? "prove-only" : "prove + recipe"}`
  );
  console.log(`  recipe-version: ${STRUCTURED_SOLUTION_VERSION}`);

  const summary = await preprocess(opts);

  console.log("");
  console.log("Preprocess summary");
  console.log(`  scanned:          ${summary.scanned}`);
  console.log(`  verified:         ${summary.verified}`);
  console.log(`  failed:           ${summary.failed}`);
  console.log(`  manual_review:    ${summary.manualReview}`);
  console.log(`  skipped:          ${summary.skipped}`);
  console.log(`  errors:           ${summary.errors}`);
  console.log(`  recipes_written:  ${summary.recipesWritten}`);
  console.log(`  recipe_failures:  ${summary.recipeFailures}`);

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath === currentPath) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}

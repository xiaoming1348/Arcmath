/**
 * CLI demo harness for the proof grader.
 *
 * Usage:
 *   pnpm demo:grade -- --problem <problemId> --file <student.tex>
 *   pnpm demo:grade -- --problem <problemId> --stdin
 *
 * Flags:
 *   --problem <id>     Required. Target problem ID (must be PROOF).
 *   --file <path>      Read student submission from a .tex file.
 *   --stdin            Read student submission from stdin (ctrl-D to end).
 *   --no-verifier      Skip /classify + /verify calls; grade from recipe only.
 *   --json             Emit machine-readable JSON instead of pretty output.
 *
 * Step delimiter in the input file: a line containing only `---` (three
 * dashes) OR a blank line. Lines starting with `%` are treated as
 * comments. Everything else is concatenated into the current step.
 *
 * Exit code: 0 on successful grading, 1 on input error, 2 when the
 * grader couldn't produce feedback.
 */
import fs from "node:fs";
import { prisma } from "@arcmath/db";
import {
  generateProofReview,
  type MilestoneCoverage,
  type ProofStepType,
  type ProofStepVerdict
} from "../lib/ai/proof-tutor";
import { classifyStep, verifyStep } from "../lib/proof-verifier-client";
import {
  isStructuredSolution,
  type StructuredSolution
} from "../lib/ai/solution-generator";

type Opts = {
  problemId: string;
  file?: string;
  stdin: boolean;
  noVerifier: boolean;
  json: boolean;
};

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { problemId: "", stdin: false, noVerifier: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "--") continue;
    switch (a) {
      case "--problem":
      case "--problem-id":
        opts.problemId = n ?? "";
        i++;
        break;
      case "--file":
        opts.file = n;
        i++;
        break;
      case "--stdin":
        opts.stdin = true;
        break;
      case "--no-verifier":
        opts.noVerifier = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!opts.problemId) throw new Error("--problem <id> is required");
  if (!opts.file && !opts.stdin) throw new Error("Pass either --file <path> or --stdin");
  if (opts.file && opts.stdin) throw new Error("--file and --stdin are mutually exclusive");
  return opts;
}

function printUsage(): void {
  console.log("Grade a student's proof against a problem's structured-solution recipe.");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm demo:grade -- --problem <id> --file student.tex");
  console.log("  cat student.tex | pnpm demo:grade -- --problem <id> --stdin");
}

// ---- Parsing ----

// Step delimiter strategy: `---` on its own line OR a fully blank line
// between non-empty lines. `%` is a comment. Returns the step latex
// strings in order, with empty steps filtered out.
function parseSteps(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const steps: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join(" ").trim();
    if (joined.length > 0) steps.push(joined);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed === "" || trimmed === "---") {
      flush();
      continue;
    }
    current.push(trimmed);
  }
  flush();
  return steps;
}

function readSubmission(opts: Opts): string {
  if (opts.file) {
    return fs.readFileSync(opts.file, "utf8");
  }
  // stdin
  return fs.readFileSync(0, "utf8");
}

// ---- Grading ----

type GradedStep = {
  index: number;
  latex: string;
  stepType: ProofStepType;
  verdict: ProofStepVerdict;
  backend: "SYMPY" | "LEAN" | "LLM_JUDGE" | "GEOGEBRA" | "CLASSIFIER_ONLY" | "NONE";
  reason?: string;
};

async function gradeSteps(steps: string[], noVerifier: boolean): Promise<GradedStep[]> {
  const out: GradedStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const latex = steps[i];
    const previousSteps = steps.slice(0, i);

    if (noVerifier) {
      out.push({
        index: i,
        latex,
        stepType: "DEDUCTION",
        verdict: "PLAUSIBLE",
        backend: "LLM_JUDGE"
      });
      continue;
    }

    let stepType: ProofStepType = "UNKNOWN";
    try {
      const cls = await classifyStep({ latex, previousSteps });
      if (cls) stepType = cls.stepType;
    } catch {
      // non-fatal — fall back to UNKNOWN
    }

    let verdict: ProofStepVerdict = "PLAUSIBLE";
    let backend: GradedStep["backend"] = "LLM_JUDGE";
    let reason: string | undefined;
    try {
      const v = await verifyStep({ stepType, latex, previousSteps });
      if (v) {
        verdict = v.verdict;
        backend = v.backend;
        const r = v.details["reason"];
        if (typeof r === "string") reason = r.slice(0, 200);
      }
    } catch {
      // non-fatal
    }

    out.push({ index: i, latex, stepType, verdict, backend, reason });
  }
  return out;
}

// ---- Pretty printer ----

function color(verdict: string): string {
  switch (verdict) {
    case "VERIFIED":
    case "ESTABLISHED":
    case "REPLACED":
      return "\x1b[32m"; // green
    case "INVALID":
      return "\x1b[31m"; // red
    case "PARTIAL":
      return "\x1b[33m"; // yellow
    case "MISSING":
      return "\x1b[90m"; // grey
    case "PLAUSIBLE":
      return "\x1b[36m"; // cyan
    default:
      return "";
  }
}
const RESET = "\x1b[0m";

function renderPretty(opts: {
  problemLabel: string;
  problemStatement: string;
  recipe: StructuredSolution | null;
  gradedSteps: GradedStep[];
  overallFeedback: string;
  milestoneCoverage: MilestoneCoverage[];
}): void {
  console.log("");
  console.log(`── Problem: ${opts.problemLabel} ──`);
  console.log(opts.problemStatement);

  if (opts.recipe) {
    console.log("");
    console.log(`── Reference milestones (${opts.recipe.steps.length}) ──`);
    for (const s of opts.recipe.steps) {
      console.log(`  #${s.index} ${s.title}  [${s.technique.slice(0, 3).join(", ")}]`);
    }
  }

  console.log("");
  console.log("── Student steps (per-step verdicts) ──");
  for (const s of opts.gradedSteps) {
    const v = `${color(s.verdict)}${s.verdict.padEnd(9)}${RESET}`;
    const b = s.backend.padEnd(13);
    console.log(`  ${(s.index + 1).toString().padStart(2)}. ${v} ${b} ${s.stepType.padEnd(22)} ${s.latex.slice(0, 120)}`);
    if (s.reason) console.log(`      ↳ ${s.reason}`);
  }

  if (opts.milestoneCoverage.length > 0) {
    console.log("");
    console.log("── Milestone coverage ──");
    // Build a by-index map so we can list in recipe order even if LLM shuffled.
    const coverageByIndex = new Map<number, MilestoneCoverage>();
    for (const c of opts.milestoneCoverage) coverageByIndex.set(c.index, c);
    const recipeSteps = opts.recipe?.steps ?? [];
    if (recipeSteps.length > 0) {
      for (const s of recipeSteps) {
        const cov = coverageByIndex.get(s.index);
        const status = cov ? cov.status : "MISSING";
        const v = `${color(status)}${status.padEnd(11)}${RESET}`;
        console.log(`  #${s.index} ${v} ${s.title}`);
        if (cov) console.log(`      ↳ ${cov.evidence}`);
      }
    } else {
      for (const c of opts.milestoneCoverage) {
        console.log(`  #${c.index} ${color(c.status)}${c.status}${RESET}: ${c.evidence}`);
      }
    }
  }

  console.log("");
  console.log("── Overall feedback ──");
  console.log(opts.overallFeedback);
  console.log("");
}

// ---- Main ----

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const row = await prisma.problem.findUnique({
    where: { id: opts.problemId },
    select: {
      id: true,
      number: true,
      statement: true,
      formalizedStatus: true,
      formalizedStatement: true,
      solutionPaths: true,
      milestoneChecks: true,
      answerFormat: true,
      problemSet: { select: { contest: true, year: true } }
    }
  });
  if (!row) {
    console.error(`Problem ${opts.problemId} not found.`);
    process.exit(1);
  }
  if (row.answerFormat !== "PROOF") {
    console.error(`Problem ${opts.problemId} is not a PROOF problem (answerFormat=${row.answerFormat}).`);
    process.exit(1);
  }
  if (!row.statement) {
    console.error(`Problem ${opts.problemId} has no statement.`);
    process.exit(1);
  }

  const rawSubmission = readSubmission(opts);
  const parsedSteps = parseSteps(rawSubmission);
  if (parsedSteps.length === 0) {
    console.error("No steps parsed from submission. Did you include LaTeX with `---` between steps?");
    process.exit(1);
  }

  const gradedSteps = await gradeSteps(parsedSteps, opts.noVerifier);

  // Pull machine-checked Lean proof (if any) and structured recipe.
  let referenceProof: string | null = null;
  const pathsRaw = row.solutionPaths;
  if (Array.isArray(pathsRaw) && pathsRaw.length > 0) {
    const first = pathsRaw[0] as { leanCode?: unknown } | undefined;
    if (first && typeof first.leanCode === "string" && first.leanCode.trim().length > 0) {
      referenceProof = first.leanCode;
    }
  }
  const recipe: StructuredSolution | null = isStructuredSolution(row.milestoneChecks)
    ? (row.milestoneChecks as StructuredSolution)
    : null;

  const review = await generateProofReview({
    problemStatement: row.statement,
    steps: gradedSteps.map((s) => ({
      index: s.index,
      latex: s.latex,
      stepType: s.stepType,
      verdict: s.verdict,
      verificationBackend: s.backend,
      verificationReason: s.reason
    })),
    formalContext: {
      status: row.formalizedStatus,
      formalizedStatement: row.formalizedStatement ?? null,
      referenceProof
    },
    solutionRecipe: recipe
  });

  const problemLabel = `${row.problemSet.contest} ${row.problemSet.year} P${row.number} [${row.id}]`;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          problemId: row.id,
          problemLabel,
          gradedSteps,
          overallFeedback: review.overallFeedback,
          milestoneCoverage: review.milestoneCoverage,
          recipe
        },
        null,
        2
      )
    );
  } else {
    renderPretty({
      problemLabel,
      problemStatement: row.statement,
      recipe,
      gradedSteps,
      overallFeedback: review.overallFeedback,
      milestoneCoverage: review.milestoneCoverage
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

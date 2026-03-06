import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Contest } from "@arcmath/shared";
import type { FetchOptions } from "../packages/db/src/aops/fetch";
import { prisma } from "../packages/db/src/client";
import { fetchAoPSContestImports } from "../packages/db/src/aops/fetch";
import { runImportCli } from "../packages/db/src/aops/import-cli";
import { runBackfillGenerated } from "../apps/web/src/scripts/backfill-generated-pdfs";
import { runValidateSearchableDownloads } from "../apps/web/src/scripts/validate-searchable-downloads";
import { getLastCompleteYearsWindow } from "../apps/web/src/lib/resource-scope";

export type MaterializeSource = "wiki" | "community";
type StepStatus = "success" | "failed" | "skipped";
type StepName = "fetch_import" | "backfill_problems" | "backfill_answers" | "verify";

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

export type MaterializeArgs = {
  outputDir: string;
  summaryOut?: string;
  source: MaterializeSource;
  contests: Contest[];
  limit?: number;
  skipFetch?: boolean;
  skipImport?: boolean;
  skipVerify?: boolean;
  force?: boolean;
  maxErrors?: number;
};

type MaterializeStepSummary = {
  name: StepName;
  status: StepStatus;
  message: string;
};

export type MaterializeSummary = {
  startedAt: string;
  finishedAt: string;
  yearWindow: {
    yearFrom: number;
    yearTo: number;
  };
  steps: Record<StepName, MaterializeStepSummary>;
  totalSetsTargeted: number;
  perContestTotals: Record<string, number>;
  generated: {
    problems: number;
    answers: number;
  };
  failures: Array<{
    step: StepName;
    reason: string;
  }>;
  validation: {
    passed: boolean;
    checkedVariants: number;
    reportPath: string | null;
  };
};

export type MaterializePaths = {
  importsDir: string;
  validationDir: string;
  summaryPath: string;
};

const LEGACY_ROOT_IMPORT_JSON_RE = /^(AMC8|AMC10|AMC12|AIME)_\d{4}(?:_[A-Z]+)?\.json$/;

function getInvocationCwd(): string {
  return process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();
}

function resolveFromInvocationCwd(target: string): string {
  return path.resolve(getInvocationCwd(), target);
}

function parsePositiveInt(flag: string, raw: string | undefined): number {
  if (!raw) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseContestToken(value: string): Contest {
  const normalized = value.trim().toUpperCase();
  if (VALID_CONTESTS.includes(normalized as Contest)) {
    return normalized as Contest;
  }
  throw new Error(`Invalid contest "${value}". Must be AMC8|AMC10|AMC12|AIME`);
}

export function parseMaterializeArgs(argv: string[]): MaterializeArgs {
  let outputDir: string | null = null;
  let source: MaterializeSource = "wiki";
  let summaryOut: string | undefined;
  const contests: Contest[] = [];
  let limit: number | undefined;
  let skipFetch = false;
  let skipImport = false;
  let skipVerify = false;
  let force = false;
  let maxErrors: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--output-dir") {
      if (!next) {
        throw new Error("Missing value for --output-dir");
      }
      outputDir = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--summary-out") {
      if (!next) {
        throw new Error("Missing value for --summary-out");
      }
      summaryOut = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--source") {
      if (!next || (next !== "wiki" && next !== "community")) {
        throw new Error("--source must be wiki|community");
      }
      source = next;
      index += 1;
      continue;
    }

    if (arg === "--contest") {
      if (!next) {
        throw new Error("Missing value for --contest");
      }
      const parsed = next
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map(parseContestToken);
      contests.push(...parsed);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      limit = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--max-errors") {
      maxErrors = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--skip-fetch") {
      skipFetch = true;
      continue;
    }

    if (arg === "--skip-import") {
      skipImport = true;
      continue;
    }

    if (arg === "--skip-verify") {
      skipVerify = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!outputDir) {
    throw new Error("--output-dir is required");
  }

  return {
    outputDir,
    summaryOut,
    source,
    contests: contests.length > 0 ? [...new Set(contests)] : [...VALID_CONTESTS],
    limit,
    skipFetch,
    skipImport,
    skipVerify,
    force,
    maxErrors
  };
}

function printUsage(): void {
  console.log("Materialize last 10 complete years of generated resource PDFs");
  console.log("");
  console.log("Usage:");
  console.log(
    "  pnpm papers:materialize-last10 --output-dir tmp/last10-materialize [--source wiki|community] [--contest AMC8,AMC10,AMC12,AIME] [--limit N] [--force]"
  );
}

function perContestCounts(rows: Array<{ contest: Contest }>): Record<string, number> {
  const counters = new Map<string, number>();
  for (const row of rows) {
    counters.set(row.contest, (counters.get(row.contest) ?? 0) + 1);
  }

  const out: Record<string, number> = {};
  for (const contest of VALID_CONTESTS) {
    out[contest] = counters.get(contest) ?? 0;
  }
  return out;
}

function estimateFetchLimit(contests: Contest[], yearFrom: number, yearTo: number): number {
  const years = Math.max(0, yearTo - yearFrom + 1);
  if (years === 0) {
    return 0;
  }

  const examCountByContest: Record<Contest, number> = {
    AMC8: 1,
    AMC10: 2,
    AMC12: 2,
    AIME: 2
  };
  const contestExamCount = contests.reduce((sum, contest) => sum + examCountByContest[contest], 0);

  // Include headroom for alternate naming variants and future structure changes.
  return Math.max(20, years * contestExamCount * 2);
}

function resolveSummaryPath(args: MaterializeArgs): string {
  if (args.summaryOut) {
    return args.summaryOut;
  }
  return path.join(args.outputDir, "materialize-last10-summary.json");
}

export function resolveMaterializePaths(args: MaterializeArgs): MaterializePaths {
  return {
    importsDir: path.join(args.outputDir, "imports"),
    validationDir: path.join(args.outputDir, "validation"),
    summaryPath: resolveSummaryPath(args)
  };
}

export async function cleanupLegacyRootArtifacts(outputDir: string): Promise<number> {
  const entries = await readdir(outputDir, { withFileTypes: true });
  const staleFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => LEGACY_ROOT_IMPORT_JSON_RE.test(name));

  await Promise.all(staleFiles.map((name) => unlink(path.join(outputDir, name))));
  return staleFiles.length;
}

export function buildMaterializeFetchOptions(input: {
  args: MaterializeArgs;
  yearFrom: number;
  yearTo: number;
  paths: MaterializePaths;
}): FetchOptions {
  const fetchLimit = input.args.limit ?? estimateFetchLimit(input.args.contests, input.yearFrom, input.yearTo);
  return {
    source: input.args.source,
    includeContests: input.args.contests,
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    outputDir: input.paths.importsDir,
    includeStatements: true,
    skipExisting: true,
    delayMs: 50,
    allPages: true,
    maxPages: 120,
    limit: fetchLimit
  };
}

export function buildMaterializeImportOptions(input: {
  args: MaterializeArgs;
  yearFrom: number;
  yearTo: number;
  paths: MaterializePaths;
}) {
  return {
    dir: input.paths.importsDir,
    contests: input.args.contests,
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    limitFiles: input.args.limit,
    dryRun: false
  } as const;
}

async function run(): Promise<void> {
  const args = parseMaterializeArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const window = getLastCompleteYearsWindow();
  const paths = resolveMaterializePaths(args);
  await mkdir(args.outputDir, { recursive: true });
  await mkdir(paths.importsDir, { recursive: true });
  await mkdir(paths.validationDir, { recursive: true });
  const removedLegacyArtifacts = await cleanupLegacyRootArtifacts(args.outputDir);

  const steps: Record<StepName, MaterializeStepSummary> = {
    fetch_import: { name: "fetch_import", status: "success", message: "completed" },
    backfill_problems: { name: "backfill_problems", status: "success", message: "completed" },
    backfill_answers: { name: "backfill_answers", status: "success", message: "completed" },
    verify: { name: "verify", status: "success", message: "completed" }
  };

  const failures: MaterializeSummary["failures"] = [];
  let generatedProblems = 0;
  let generatedAnswers = 0;
  let validationChecked = 0;
  let validationReportPath: string | null = null;
  let validationPassed = true;
  const shouldContinue = true;

  try {
    try {
      if (args.skipFetch && args.skipImport) {
        steps.fetch_import = {
          name: "fetch_import",
          status: "skipped",
          message: "skipped by flags (--skip-fetch and --skip-import)"
        };
      } else {
        if (!args.skipFetch) {
          const fetchSummary = await fetchAoPSContestImports(
            buildMaterializeFetchOptions({
              args,
              yearFrom: window.yearFrom,
              yearTo: window.yearTo,
              paths
            })
          );

          if (fetchSummary.failed > 0) {
            failures.push({
              step: "fetch_import",
              reason: `fetch failed for ${fetchSummary.failed} item(s)`
            });
          }
        }

        if (!args.skipImport) {
          const importSummary = await runImportCli(
            buildMaterializeImportOptions({
              args,
              yearFrom: window.yearFrom,
              yearTo: window.yearTo,
              paths
            })
          );

          if (importSummary.failedFiles > 0) {
            failures.push({
              step: "fetch_import",
              reason: `import failed for ${importSummary.failedFiles} file(s)`
            });
          }
        }

        steps.fetch_import = {
          name: "fetch_import",
          status: failures.some((failure) => failure.step === "fetch_import") ? "failed" : "success",
          message: failures.some((failure) => failure.step === "fetch_import")
            ? "completed with failures"
            : "completed"
        };
      }
    } catch (error) {
      failures.push({
        step: "fetch_import",
        reason: error instanceof Error ? error.message : String(error)
      });
      steps.fetch_import = {
        name: "fetch_import",
        status: "failed",
        message: "failed"
      };
      if (!shouldContinue) {
        throw error;
      }
    }

    try {
      const problemsSummary = await runBackfillGenerated({
        contests: args.contests,
        yearFrom: window.yearFrom,
        yearTo: window.yearTo,
        limit: args.limit,
        variant: "problems",
        force: args.force,
        maxErrors: args.maxErrors,
        retryFailedOnly: false,
        dryRun: false
      });

      generatedProblems = problemsSummary.generated_cached_problems;
      if (problemsSummary.render_failed > 0 || problemsSummary.cache_failed > 0 || problemsSummary.aborted) {
        failures.push({
          step: "backfill_problems",
          reason: `render_failed=${problemsSummary.render_failed}, cache_failed=${problemsSummary.cache_failed}, aborted=${problemsSummary.aborted}`
        });
      }
      steps.backfill_problems = {
        name: "backfill_problems",
        status: failures.some((failure) => failure.step === "backfill_problems") ? "failed" : "success",
        message: `generated=${problemsSummary.generated_cached_problems}, skipped=${problemsSummary.skipped_already_cached}`
      };
    } catch (error) {
      failures.push({
        step: "backfill_problems",
        reason: error instanceof Error ? error.message : String(error)
      });
      steps.backfill_problems = {
        name: "backfill_problems",
        status: "failed",
        message: "failed"
      };
      if (!shouldContinue) {
        throw error;
      }
    }

    try {
      const answersSummary = await runBackfillGenerated({
        contests: args.contests,
        yearFrom: window.yearFrom,
        yearTo: window.yearTo,
        limit: args.limit,
        variant: "answers",
        force: args.force,
        maxErrors: args.maxErrors,
        retryFailedOnly: false,
        dryRun: false
      });

      generatedAnswers = answersSummary.generated_cached_answers;
      if (answersSummary.render_failed > 0 || answersSummary.cache_failed > 0 || answersSummary.aborted) {
        failures.push({
          step: "backfill_answers",
          reason: `render_failed=${answersSummary.render_failed}, cache_failed=${answersSummary.cache_failed}, aborted=${answersSummary.aborted}`
        });
      }
      steps.backfill_answers = {
        name: "backfill_answers",
        status: failures.some((failure) => failure.step === "backfill_answers") ? "failed" : "success",
        message: `generated=${answersSummary.generated_cached_answers}, skipped=${answersSummary.skipped_already_cached}`
      };
    } catch (error) {
      failures.push({
        step: "backfill_answers",
        reason: error instanceof Error ? error.message : String(error)
      });
      steps.backfill_answers = {
        name: "backfill_answers",
        status: "failed",
        message: "failed"
      };
      if (!shouldContinue) {
        throw error;
      }
    }

    try {
      if (args.skipVerify) {
        steps.verify = {
          name: "verify",
          status: "skipped",
          message: "skipped by flag --skip-verify"
        };
      } else {
        const validation = await runValidateSearchableDownloads({
          outDir: paths.validationDir,
          reportPath: path.join(paths.validationDir, "searchable-downloads-validation.json")
        });
        validationChecked = validation.totals.checkedVariants;
        validationReportPath = validation.reportPath;
        validationPassed = validation.passed;

        if (!validation.passed) {
          failures.push(...validation.failures.map((failure) => ({
            step: "verify" as const,
            reason: `${failure.problemSetId}:${failure.variant}:${failure.reason}`
          })));
        }

        steps.verify = {
          name: "verify",
          status: validation.passed ? "success" : "failed",
          message: `checked_variants=${validation.totals.checkedVariants}, failures=${validation.failures.length}`
        };
      }
    } catch (error) {
      failures.push({
        step: "verify",
        reason: error instanceof Error ? error.message : String(error)
      });
      validationPassed = false;
      steps.verify = {
        name: "verify",
        status: "failed",
        message: "failed"
      };
    }
  } finally {
    const scopedRows = await prisma.problemSet.findMany({
      where: {
        contest: { in: args.contests },
        year: {
          gte: window.yearFrom,
          lte: window.yearTo
        }
      },
      select: {
        contest: true
      }
    });

    const finishedAt = new Date().toISOString();
    const summary: MaterializeSummary = {
      startedAt,
      finishedAt,
      yearWindow: window,
      steps,
      totalSetsTargeted: scopedRows.length,
      perContestTotals: perContestCounts(scopedRows),
      generated: {
        problems: generatedProblems,
        answers: generatedAnswers
      },
      failures,
      validation: {
        passed: validationPassed,
        checkedVariants: validationChecked,
        reportPath: validationReportPath
      }
    };

    await writeFile(paths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    console.log("Last10 materialization summary");
    console.log(`  year window: ${summary.yearWindow.yearFrom}-${summary.yearWindow.yearTo}`);
    console.log(`  total sets targeted: ${summary.totalSetsTargeted}`);
    console.log(`  generated problems: ${summary.generated.problems}`);
    console.log(`  generated answers: ${summary.generated.answers}`);
    console.log(`  validation passed: ${summary.validation.passed}`);
    console.log(`  summary: ${paths.summaryPath}`);
    if (removedLegacyArtifacts > 0) {
      console.log(`  cleaned_legacy_root_json: ${removedLegacyArtifacts}`);
    }

    if (summary.failures.length > 0) {
      process.exitCode = 1;
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "__HELP__") {
      printUsage();
      return;
    }

    console.error(message);
    printUsage();
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main();
}

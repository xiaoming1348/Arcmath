import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type Contest = "AMC8" | "AMC10" | "AMC12" | "AIME";

type StepName = "fetch" | "import" | "generate";

type StepStatus = "success" | "failed" | "skipped";

export type BootstrapArgs = {
  outputDir: string;
  summaryOut?: string;
  contests?: Contest[];
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
  dryRun: boolean;
  skipFetch: boolean;
  skipImport: boolean;
  skipGenerate: boolean;
  retryFailedOnly: boolean;
  maxErrors?: number;
  continueOnError: boolean;
};

export type PlannedStep = {
  name: StepName;
  command: string;
  args: string[];
  skipped: boolean;
  skipReason?: string;
};

export type StepSummary = {
  name: StepName;
  command: string;
  args: string[];
  exitCode: number | null;
  status: StepStatus;
  message: string;
  planned: boolean;
  executed: boolean;
  skipReason: string | null;
};

export type BootstrapSummary = {
  startedAt: string;
  finishedAt: string;
  overallStatus: "success" | "failed";
  effectiveArgs: BootstrapArgs & {
    outputDir: string;
    summaryOut: string;
  };
  steps: Record<StepName, StepSummary>;
};

type Executor = (command: string, args: string[]) => Promise<number>;

type BootstrapDeps = {
  execute: Executor;
};

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

function parsePositiveInt(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
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

function dedupeContests(values: Contest[]): Contest[] {
  return [...new Set(values)];
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  let outputDir: string | null = null;
  const contests: Contest[] = [];

  const args: BootstrapArgs = {
    outputDir: "",
    dryRun: false,
    skipFetch: false,
    skipImport: false,
    skipGenerate: false,
    retryFailedOnly: false,
    continueOnError: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--output-dir") {
      if (!next) {
        throw new Error("Missing value for --output-dir");
      }
      outputDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--summary-out") {
      if (!next) {
        throw new Error("Missing value for --summary-out");
      }
      args.summaryOut = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--contest") {
      if (!next) {
        throw new Error("Missing value for --contest");
      }
      const parsed = next
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map(parseContestToken);
      contests.push(...parsed);
      index += 1;
      continue;
    }

    if (arg === "--year-from") {
      args.yearFrom = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--year-to") {
      args.yearTo = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = parsePositiveInt(arg, next);
      if (limit < 1) {
        throw new Error("--limit must be >= 1");
      }
      args.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--max-errors") {
      args.maxErrors = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--skip-fetch") {
      args.skipFetch = true;
      continue;
    }

    if (arg === "--skip-import") {
      args.skipImport = true;
      continue;
    }

    if (arg === "--skip-generate") {
      args.skipGenerate = true;
      continue;
    }

    if (arg === "--retry-failed-only") {
      args.retryFailedOnly = true;
      continue;
    }

    if (arg === "--continue-on-error") {
      args.continueOnError = true;
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

  if (args.yearFrom !== undefined && args.yearTo !== undefined && args.yearFrom > args.yearTo) {
    throw new Error("--year-from cannot be greater than --year-to");
  }

  if (args.retryFailedOnly && args.skipGenerate) {
    throw new Error("--retry-failed-only cannot be used with --skip-generate");
  }

  if (args.maxErrors !== undefined && args.skipGenerate) {
    throw new Error("--max-errors cannot be used with --skip-generate");
  }

  args.outputDir = outputDir;
  args.contests = contests.length > 0 ? dedupeContests(contests) : undefined;
  return args;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function planBootstrapSteps(input: BootstrapArgs): PlannedStep[] {
  const steps: PlannedStep[] = [];

  const fetchArgs = ["aops:fetch", "--output", input.outputDir];
  if (input.contests && input.contests.length > 0) {
    fetchArgs.push("--include", input.contests.join(","));
  }
  if (input.limit !== undefined) {
    fetchArgs.push("--limit", String(input.limit));
  }
  steps.push({
    name: "fetch",
    command: "pnpm",
    args: fetchArgs,
    skipped: input.skipFetch,
    skipReason: input.skipFetch ? "flag --skip-fetch" : undefined
  });

  const importArgs = ["aops:import", "--dir", input.outputDir];
  if (input.contests && input.contests.length > 0) {
    importArgs.push("--contest", input.contests.join(","));
  }
  if (input.yearFrom !== undefined) {
    importArgs.push("--year-from", String(input.yearFrom));
  }
  if (input.yearTo !== undefined) {
    importArgs.push("--year-to", String(input.yearTo));
  }
  if (input.limit !== undefined) {
    importArgs.push("--limit-files", String(input.limit));
  }
  const importSkipped = input.skipImport;
  steps.push({
    name: "import",
    command: "pnpm",
    args: importArgs,
    skipped: importSkipped,
    skipReason: input.skipImport ? "flag --skip-import" : undefined
  });

  const generateArgs = ["pdf:backfill-generated"];
  if (input.limit !== undefined) {
    generateArgs.push("--limit", String(input.limit));
  }
  if (input.contests && input.contests.length === 1) {
    generateArgs.push("--contest", input.contests[0]);
  }
  if (input.yearFrom !== undefined) {
    generateArgs.push("--year-from", String(input.yearFrom));
  }
  if (input.yearTo !== undefined) {
    generateArgs.push("--year-to", String(input.yearTo));
  }
  if (input.retryFailedOnly) {
    generateArgs.push("--retry-failed-only");
  }
  if (input.maxErrors !== undefined) {
    generateArgs.push("--max-errors", String(input.maxErrors));
  }
  const generateSkipped = input.skipGenerate;
  steps.push({
    name: "generate",
    command: "pnpm",
    args: generateArgs,
    skipped: generateSkipped,
    skipReason: generateSkipped ? "flag --skip-generate" : undefined
  });

  return steps;
}

export function resolveSummaryPath(args: BootstrapArgs): string {
  if (args.summaryOut) {
    return path.resolve(args.summaryOut);
  }
  return path.join(args.outputDir, "bootstrap-generated-summary.json");
}

function defaultExecutor(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });

    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function createStepSummary(input: {
  step: PlannedStep;
  exitCode: number | null;
  status: StepStatus;
  message: string;
  planned?: boolean;
  executed?: boolean;
  skipReason?: string | null;
}): StepSummary {
  return {
    name: input.step.name,
    command: input.step.command,
    args: input.step.args,
    exitCode: input.exitCode,
    status: input.status,
    message: input.message,
    planned: input.planned ?? true,
    executed: input.executed ?? false,
    skipReason: input.skipReason ?? null
  };
}

export async function runBootstrap(args: BootstrapArgs, depsArg?: Partial<BootstrapDeps>): Promise<BootstrapSummary> {
  const startedAt = new Date().toISOString();
  const deps: BootstrapDeps = {
    execute: defaultExecutor,
    ...depsArg
  };

  const summaryPath = resolveSummaryPath(args);
  await mkdir(path.dirname(summaryPath), { recursive: true });

  const steps = planBootstrapSteps(args);
  const stepSummaries: Record<StepName, StepSummary> = {
    fetch: createStepSummary({
      step: steps[0]!,
      exitCode: null,
      status: "skipped",
      message: "not executed",
      executed: false,
      skipReason: "not executed"
    }),
    import: createStepSummary({
      step: steps[1]!,
      exitCode: null,
      status: "skipped",
      message: "not executed",
      executed: false,
      skipReason: "not executed"
    }),
    generate: createStepSummary({
      step: steps[2]!,
      exitCode: null,
      status: "skipped",
      message: "not executed",
      executed: false,
      skipReason: "not executed"
    })
  };

  let failed = false;
  for (const step of steps) {
    const isPlanOnlyDryRun = args.dryRun;
    if (step.skipped || isPlanOnlyDryRun) {
      const skipReason = isPlanOnlyDryRun ? "dry-run plan only" : step.skipReason ?? "skipped";
      stepSummaries[step.name] = createStepSummary({
        step,
        exitCode: null,
        status: "skipped",
        message: skipReason,
        executed: false,
        skipReason
      });
      continue;
    }

    const code = await deps.execute(step.command, step.args);
    const success = code === 0;
    stepSummaries[step.name] = createStepSummary({
      step,
      exitCode: code,
      status: success ? "success" : "failed",
      message: success ? "completed" : `failed with exit code ${code}`,
      executed: true,
      skipReason: null
    });

    if (!success) {
      failed = true;
      if (!args.continueOnError) {
        for (const remaining of steps) {
          const existing = stepSummaries[remaining.name];
          if (existing.executed) {
            continue;
          }
          if (remaining.name === step.name) {
            continue;
          }
          stepSummaries[remaining.name] = createStepSummary({
            step: remaining,
            exitCode: null,
            status: "skipped",
            message: "blocked by previous step failure",
            executed: false,
            skipReason: "blocked by previous step failure"
          });
        }
        break;
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const summary: BootstrapSummary = {
    startedAt,
    finishedAt,
    overallStatus: failed ? "failed" : "success",
    effectiveArgs: {
      ...args,
      outputDir: args.outputDir,
      summaryOut: summaryPath
    },
    steps: stepSummaries
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

function printUsage(): void {
  console.log("Bootstrap generated papers pipeline (AoPS fetch -> DB import -> generated PDF cache)");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm papers:bootstrap-generated --output-dir <path> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --output-dir <path>          Shared fetch/import directory (required)");
  console.log("  --summary-out <path>         Summary JSON path (default: <output-dir>/bootstrap-generated-summary.json)");
  console.log("  --contest <list>             Contest filter, repeatable or csv (AMC8,AMC10,AMC12,AIME)");
  console.log("  --year-from <n>              Generate/import step lower year bound");
  console.log("  --year-to <n>                Generate/import step upper year bound");
  console.log("  --limit <n>                  Limit for fetch/import/generate steps");
  console.log("  --dry-run                    Plan-only mode; do not execute child commands");
  console.log("  --skip-fetch                 Skip fetch step");
  console.log("  --skip-import                Skip import step");
  console.log("  --skip-generate              Skip generated backfill step");
  console.log("  --retry-failed-only          Generate step only (cachedPdfStatus=FAILED)");
  console.log("  --max-errors <n>             Generate step failure threshold");
  console.log("  --continue-on-error          Continue remaining steps after a failure");
}

async function main(): Promise<void> {
  let args: BootstrapArgs;
  try {
    args = parseBootstrapArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "__HELP__") {
      printUsage();
      return;
    }
    console.error(message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const steps = planBootstrapSteps(args);
  console.log("Bootstrap step plan:");
  for (const step of steps) {
    const command = formatCommand(step.command, step.args);
    if (step.skipped) {
      console.log(`  - ${step.name}: SKIP (${step.skipReason})`);
    } else if (args.dryRun) {
      console.log(`  - ${step.name}: PLAN ${command}`);
    } else {
      console.log(`  - ${step.name}: RUN ${command}`);
    }
  }

  const summary = await runBootstrap(args);
  console.log(`Summary written: ${summary.effectiveArgs.summaryOut}`);
  console.log(`Overall status: ${summary.overallStatus}`);
  if (summary.overallStatus === "failed") {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

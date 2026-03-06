import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidateSearchableDownloads } from "../apps/web/src/scripts/validate-searchable-downloads";

export type ValidateSearchableArgs = {
  outDir: string;
  reportPath?: string;
};

function getInvocationCwd(): string {
  return process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();
}

function resolveFromInvocationCwd(target: string): string {
  return path.resolve(getInvocationCwd(), target);
}

export function parseValidateSearchableArgs(argv: string[]): ValidateSearchableArgs {
  let outDir: string | null = null;
  let reportPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--out-dir") {
      if (!next) {
        throw new Error("Missing value for --out-dir");
      }
      outDir = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--report") {
      if (!next) {
        throw new Error("Missing value for --report");
      }
      reportPath = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  return {
    outDir,
    reportPath
  };
}

function printUsage(): void {
  console.log("Validate searchable generated-PDF downloads (root wrapper)");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm pdf:validate-searchable --out-dir tmp/last10-materialize/validation");
}

async function main(): Promise<void> {
  let args: ValidateSearchableArgs;
  try {
    args = parseValidateSearchableArgs(process.argv.slice(2));
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

  const summary = await runValidateSearchableDownloads({
    outDir: args.outDir,
    reportPath: args.reportPath
  });

  console.log("Searchable download validation summary");
  console.log(`  year window: ${summary.yearWindow.yearFrom}-${summary.yearWindow.yearTo}`);
  console.log(`  searchable sets: ${summary.totalSearchableSets}`);
  console.log(`  checked variants: ${summary.totals.checkedVariants}`);
  console.log(`  route failures: ${summary.totals.routeFailures}`);
  console.log(`  quality failures: ${summary.totals.qualityFailures}`);
  console.log(`  report: ${summary.reportPath}`);

  if (!summary.passed) {
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

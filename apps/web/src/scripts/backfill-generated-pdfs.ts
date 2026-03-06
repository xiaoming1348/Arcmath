import type { Contest } from "@arcmath/db";
import { prisma } from "@arcmath/db";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBackfillGeneratedWhere,
  createBackfillGeneratedSummary,
  hasBackfillGeneratedFailures,
  normalizeBackfillGeneratedOptions,
  runGeneratedPdfBackfill,
  type BackfillGeneratedOptions,
  type BackfillGeneratedSummary,
  type BackfillGeneratedDeps
} from "../lib/generated-pdf-backfill";

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

function parseIntegerFlag(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

export function parseBackfillGeneratedArgs(argv: string[]): BackfillGeneratedOptions {
  const options = normalizeBackfillGeneratedOptions({});
  const contests: Contest[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--limit") {
      const limit = parseIntegerFlag(arg, next);
      if (limit < 1) {
        throw new Error("--limit must be >= 1");
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--contest") {
      if (!next) {
        throw new Error("Missing value for --contest");
      }
      const parsed = next
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0)
        .map((value) => value as Contest);
      if (parsed.some((contest) => !VALID_CONTESTS.includes(contest))) {
        throw new Error("--contest must be AMC8|AMC10|AMC12|AIME");
      }
      contests.push(...parsed);
      index += 1;
      continue;
    }

    if (arg === "--variant") {
      if (!next) {
        throw new Error("Missing value for --variant");
      }
      if (next !== "problems" && next !== "answers" && next !== "both") {
        throw new Error("--variant must be problems|answers|both");
      }
      options.variant = next;
      index += 1;
      continue;
    }

    if (arg === "--year-from") {
      options.yearFrom = parseIntegerFlag(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--year-to") {
      options.yearTo = parseIntegerFlag(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--retry-failed-only") {
      options.retryFailedOnly = true;
      continue;
    }

    if (arg === "--max-errors") {
      options.maxErrors = parseIntegerFlag(arg, next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (
    options.yearFrom !== undefined &&
    options.yearTo !== undefined &&
    options.yearFrom > options.yearTo
  ) {
    throw new Error("--year-from cannot be greater than --year-to");
  }

  if (contests.length > 0) {
    options.contests = [...new Set(contests)];
    options.contest = options.contests[0];
  }

  return options;
}

export async function runBackfillGenerated(
  options: Partial<BackfillGeneratedOptions>,
  depsArg?: Partial<BackfillGeneratedDeps>
): Promise<BackfillGeneratedSummary> {
  const normalized = normalizeBackfillGeneratedOptions(options);
  return runGeneratedPdfBackfill({
    prisma,
    options: normalized,
    deps: depsArg
  });
}

function printUsage(): void {
  console.log("Backfill generated PDFs from DB problem text");
  console.log("");
  console.log("Usage:");
  console.log(
    "  pnpm -C apps/web pdf:backfill-generated [--limit N] [--contest AMC8|AMC10|AMC12|AIME[,..]] [--year-from N] [--year-to N] [--variant problems|answers|both] [--force] [--dry-run] [--retry-failed-only] [--max-errors N]"
  );
}

async function main(): Promise<void> {
  const options = parseBackfillGeneratedArgs(process.argv.slice(2));
  const summary = await runBackfillGenerated(options);

  console.log("Generated PDF backfill summary");
  console.log(`  scanned: ${summary.scanned}`);
  console.log(`  generated_cached: ${summary.generated_cached}`);
  console.log(`  generated_cached_problems: ${summary.generated_cached_problems}`);
  console.log(`  generated_cached_answers: ${summary.generated_cached_answers}`);
  console.log(`  skipped_already_cached: ${summary.skipped_already_cached}`);
  console.log(`  skipped_no_problems: ${summary.skipped_no_problems}`);
  console.log(`  render_failed: ${summary.render_failed}`);
  console.log(`  cache_failed: ${summary.cache_failed}`);
  console.log(`  variant: ${options.variant}`);

  if (options.retryFailedOnly) {
    console.log("  filter: retry-failed-only");
  }

  if (options.maxErrors !== undefined) {
    console.log(`  max_errors: ${options.maxErrors}`);
  }

  if (summary.aborted) {
    console.log("  aborted: true (max-errors threshold exceeded)");
  }

  if (options.dryRun) {
    console.log("  mode: dry-run (no DB/file writes)");
  }

  if (hasBackfillGeneratedFailures(summary)) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
  });
}

export {
  buildBackfillGeneratedWhere,
  createBackfillGeneratedSummary,
  hasBackfillGeneratedFailures
};

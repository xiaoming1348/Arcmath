// Deprecated workflow: official-link backfill is retained only as a manual fallback.
// Generated-PDF backfill is the primary production path.
import type { Contest, Prisma } from "@arcmath/db";
import { prisma } from "@arcmath/db";
import { resolveAoPSPdfUrlFromSource } from "../lib/aops-pdf";
import {
  cacheOfficialPdfFromUrl,
  hasCachedOfficialPdf,
  readCachedOfficialPdfMetadata,
  type OfficialPdfCacheMetadata
} from "../lib/official-pdf-cache";
import { validateOfficialPdfUrl } from "../lib/official-pdf";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type BackfillOptions = {
  limit?: number;
  contest?: Contest;
  yearFrom?: number;
  yearTo?: number;
  force: boolean;
  dryRun: boolean;
  retryFailedOnly: boolean;
  maxErrors?: number;
};

export type BackfillSummary = {
  scanned: number;
  cached: number;
  skipped_already_cached: number;
  skipped_no_source: number;
  resolve_failed: number;
  validate_failed: number;
  download_failed: number;
  updated_verified_url: number;
  aborted: boolean;
};

type BackfillOutcome =
  | "cached"
  | "skipped_already_cached"
  | "skipped_no_source"
  | "resolve_failed"
  | "validate_failed"
  | "download_failed"
  | "updated_verified_url";

type BackfillProblemSet = {
  id: string;
  title: string;
  contest: Contest;
  year: number;
  exam: string | null;
  sourceUrl: string | null;
  verifiedPdfUrl: string | null;
  cachedPdfStatus: string | null;
};

type CacheMetadataUpdate = {
  status: "CACHED" | "FAILED" | "MISSING";
  error?: string | null;
  path?: string | null;
  sha256?: string | null;
  size?: number | null;
  cachedAt?: Date | null;
};

type BackfillDeps = {
  listProblemSets: (options: BackfillOptions) => Promise<BackfillProblemSet[]>;
  hasCached: (problemSetId: string) => Promise<boolean>;
  readCachedMetadata: (problemSetId: string) => Promise<OfficialPdfCacheMetadata | null>;
  validate: (url: string) => Promise<boolean>;
  resolve: (sourceUrl: string) => Promise<{ pdfUrl: string | null }>;
  updateVerifiedUrl: (problemSetId: string, verifiedPdfUrl: string) => Promise<void>;
  updateCacheMetadata: (problemSetId: string, metadata: CacheMetadataUpdate) => Promise<void>;
  cachePdf: (input: { problemSetId: string; pdfUrl: string; force?: boolean }) => Promise<OfficialPdfCacheMetadata>;
};

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

export function createBackfillSummary(): BackfillSummary {
  return {
    scanned: 0,
    cached: 0,
    skipped_already_cached: 0,
    skipped_no_source: 0,
    resolve_failed: 0,
    validate_failed: 0,
    download_failed: 0,
    updated_verified_url: 0,
    aborted: false
  };
}

export function applyBackfillOutcome(summary: BackfillSummary, outcome: BackfillOutcome): void {
  summary[outcome] += 1;
}

function getFailureCount(summary: BackfillSummary): number {
  return summary.resolve_failed + summary.validate_failed + summary.download_failed;
}

export function hasBackfillFailures(summary: BackfillSummary): boolean {
  return getFailureCount(summary) > 0 || summary.aborted;
}

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

function toShortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function shouldAbortForMaxErrors(options: BackfillOptions, summary: BackfillSummary): boolean {
  if (options.maxErrors === undefined) {
    return false;
  }
  return getFailureCount(summary) > options.maxErrors;
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    force: false,
    dryRun: false,
    retryFailedOnly: false
  };

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
      const contest = next.toUpperCase() as Contest;
      if (!VALID_CONTESTS.includes(contest)) {
        throw new Error("--contest must be AMC8|AMC10|AMC12|AIME");
      }
      options.contest = contest;
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

  return options;
}

export function buildBackfillWhere(options: BackfillOptions): Prisma.ProblemSetWhereInput {
  const where: Prisma.ProblemSetWhereInput = {};

  if (options.contest) {
    where.contest = options.contest;
  }

  if (options.yearFrom !== undefined || options.yearTo !== undefined) {
    where.year = {
      ...(options.yearFrom !== undefined ? { gte: options.yearFrom } : {}),
      ...(options.yearTo !== undefined ? { lte: options.yearTo } : {})
    };
  }

  if (options.retryFailedOnly) {
    where.cachedPdfStatus = "FAILED";
  }

  return where;
}

function createDefaultDeps(): BackfillDeps {
  return {
    listProblemSets: async (options) => {
      return prisma.problemSet.findMany({
        where: buildBackfillWhere(options),
        orderBy: [{ year: "desc" }, { contest: "asc" }, { exam: "asc" }],
        take: options.limit,
        select: {
          id: true,
          title: true,
          contest: true,
          year: true,
          exam: true,
          sourceUrl: true,
          verifiedPdfUrl: true,
          cachedPdfStatus: true
        }
      });
    },
    hasCached: hasCachedOfficialPdf,
    readCachedMetadata: readCachedOfficialPdfMetadata,
    validate: validateOfficialPdfUrl,
    resolve: resolveAoPSPdfUrlFromSource,
    updateVerifiedUrl: async (problemSetId, verifiedPdfUrl) => {
      await prisma.problemSet.update({
        where: { id: problemSetId },
        data: { verifiedPdfUrl }
      });
    },
    updateCacheMetadata: async (problemSetId, metadata) => {
      await prisma.problemSet.update({
        where: { id: problemSetId },
        data: {
          cachedPdfPath: metadata.path ?? null,
          cachedPdfSha256: metadata.sha256 ?? null,
          cachedPdfSize: metadata.size ?? null,
          cachedPdfAt: metadata.cachedAt ?? null,
          cachedPdfStatus: metadata.status,
          cachedPdfError: metadata.error ?? null
        }
      });
    },
    cachePdf: cacheOfficialPdfFromUrl
  };
}

async function updateFailureMetadata(input: {
  options: BackfillOptions;
  deps: BackfillDeps;
  problemSetId: string;
  status: "FAILED" | "MISSING";
  error: string;
}): Promise<void> {
  if (input.options.dryRun) {
    return;
  }

  await input.deps
    .updateCacheMetadata(input.problemSetId, {
      status: input.status,
      error: input.error
    })
    .catch(() => undefined);
}

async function determineOfficialUrl(input: {
  problemSet: BackfillProblemSet;
  options: BackfillOptions;
  deps: BackfillDeps;
  summary: BackfillSummary;
}): Promise<{ officialUrl: string | null }> {
  const { problemSet, options, deps, summary } = input;

  if (problemSet.verifiedPdfUrl) {
    const verifiedValid = await deps.validate(problemSet.verifiedPdfUrl).catch(() => false);
    if (verifiedValid) {
      return { officialUrl: problemSet.verifiedPdfUrl };
    }
  }

  if (!problemSet.sourceUrl) {
    applyBackfillOutcome(summary, "skipped_no_source");
    await updateFailureMetadata({
      options,
      deps,
      problemSetId: problemSet.id,
      status: "MISSING",
      error: "No sourceUrl available for PDF resolution."
    });
    return { officialUrl: null };
  }

  const resolved = await deps.resolve(problemSet.sourceUrl).catch(() => ({ pdfUrl: null }));
  if (!resolved.pdfUrl) {
    applyBackfillOutcome(summary, "resolve_failed");
    await updateFailureMetadata({
      options,
      deps,
      problemSetId: problemSet.id,
      status: "FAILED",
      error: "Could not resolve official PDF URL from sourceUrl."
    });
    return { officialUrl: null };
  }

  const resolvedValid = await deps.validate(resolved.pdfUrl).catch(() => false);
  if (!resolvedValid) {
    applyBackfillOutcome(summary, "validate_failed");
    await updateFailureMetadata({
      options,
      deps,
      problemSetId: problemSet.id,
      status: "FAILED",
      error: "Resolved URL failed PDF validation."
    });
    return { officialUrl: null };
  }

  const updated = problemSet.verifiedPdfUrl !== resolved.pdfUrl;
  if (updated) {
    applyBackfillOutcome(summary, "updated_verified_url");
    if (!options.dryRun) {
      await deps.updateVerifiedUrl(problemSet.id, resolved.pdfUrl);
    }
  }

  return { officialUrl: resolved.pdfUrl };
}

export async function runBackfill(options: BackfillOptions, depsArg?: Partial<BackfillDeps>): Promise<BackfillSummary> {
  const summary = createBackfillSummary();
  const deps: BackfillDeps = {
    ...createDefaultDeps(),
    ...depsArg
  };

  const problemSets = await deps.listProblemSets(options);

  for (const problemSet of problemSets) {
    summary.scanned += 1;

    if (!options.force) {
      const cachedExists = await deps.hasCached(problemSet.id);
      if (cachedExists) {
        applyBackfillOutcome(summary, "skipped_already_cached");

        if (!options.dryRun) {
          const metadata = await deps.readCachedMetadata(problemSet.id).catch(() => null);
          await deps
            .updateCacheMetadata(problemSet.id, {
              status: "CACHED",
              path: metadata?.path ?? null,
              sha256: metadata?.sha256 ?? null,
              size: metadata?.size ?? null,
              cachedAt: new Date(),
              error: null
            })
            .catch(() => undefined);
        }

        continue;
      }
    }

    const { officialUrl } = await determineOfficialUrl({
      problemSet,
      options,
      deps,
      summary
    });

    if (!officialUrl) {
      if (shouldAbortForMaxErrors(options, summary)) {
        summary.aborted = true;
        break;
      }
      continue;
    }

    if (options.dryRun) {
      applyBackfillOutcome(summary, "cached");
      continue;
    }

    try {
      const cache = await deps.cachePdf({
        problemSetId: problemSet.id,
        pdfUrl: officialUrl,
        force: options.force
      });

      await deps.updateCacheMetadata(problemSet.id, {
        status: "CACHED",
        path: cache.path,
        sha256: cache.sha256,
        size: cache.size,
        cachedAt: new Date(),
        error: null
      });

      applyBackfillOutcome(summary, "cached");
    } catch (error) {
      applyBackfillOutcome(summary, "download_failed");
      await updateFailureMetadata({
        options,
        deps,
        problemSetId: problemSet.id,
        status: "FAILED",
        error: toShortError(error)
      });
    }

    if (shouldAbortForMaxErrors(options, summary)) {
      summary.aborted = true;
      break;
    }
  }

  return summary;
}

function printUsage(): void {
  console.log("Backfill official PDF local cache");
  console.log("");
  console.log("Usage:");
  console.log(
    "  pnpm -C apps/web pdf:backfill [--limit N] [--contest AMC8|AMC10|AMC12|AIME] [--year-from N] [--year-to N] [--force] [--dry-run] [--retry-failed-only] [--max-errors N]"
  );
}

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  const summary = await runBackfill(options);

  console.log("Official PDF backfill summary");
  console.log(`  scanned: ${summary.scanned}`);
  console.log(`  cached: ${summary.cached}`);
  console.log(`  skipped_already_cached: ${summary.skipped_already_cached}`);
  console.log(`  skipped_no_source: ${summary.skipped_no_source}`);
  console.log(`  resolve_failed: ${summary.resolve_failed}`);
  console.log(`  validate_failed: ${summary.validate_failed}`);
  console.log(`  download_failed: ${summary.download_failed}`);
  console.log(`  updated_verified_url: ${summary.updated_verified_url}`);

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

  if (hasBackfillFailures(summary)) {
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

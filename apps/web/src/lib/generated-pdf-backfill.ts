import type { Contest, Prisma, PrismaClient } from "@arcmath/db";
import {
  hasCachedOfficialPdf,
  readCachedOfficialPdfMetadata,
  type OfficialPdfCacheMetadata
} from "./official-pdf-cache";
import {
  generateAndCacheProblemSetPdf,
  getProblemSetPdfCacheKey,
  type GeneratedPdfVariant,
  type ProblemSetPdfGenerationResult
} from "./problem-set-pdf-generation";

type BackfillPrisma = Pick<PrismaClient, "problemSet" | "problem">;

export type BackfillGeneratedVariant = GeneratedPdfVariant | "both";

export type BackfillGeneratedOptions = {
  limit?: number;
  contest?: Contest;
  contests?: Contest[];
  yearFrom?: number;
  yearTo?: number;
  force: boolean;
  dryRun: boolean;
  retryFailedOnly: boolean;
  maxErrors?: number;
  variant: BackfillGeneratedVariant;
};

export type BackfillGeneratedSummary = {
  scanned: number;
  generated_cached: number;
  generated_cached_problems: number;
  generated_cached_answers: number;
  skipped_already_cached: number;
  skipped_no_problems: number;
  render_failed: number;
  cache_failed: number;
  aborted: boolean;
};

type BackfillGeneratedOutcome =
  | "generated_cached"
  | "generated_cached_problems"
  | "generated_cached_answers"
  | "skipped_already_cached"
  | "skipped_no_problems"
  | "render_failed"
  | "cache_failed";

type BackfillProblemSet = {
  id: string;
  title: string;
  contest: Contest;
  year: number;
  exam: string | null;
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

export type BackfillGeneratedDeps = {
  listProblemSets: (options: BackfillGeneratedOptions) => Promise<BackfillProblemSet[]>;
  hasCached: (problemSetId: string, variant: GeneratedPdfVariant) => Promise<boolean>;
  readCachedMetadata: (problemSetId: string, variant: GeneratedPdfVariant) => Promise<OfficialPdfCacheMetadata | null>;
  updateCacheMetadata: (problemSetId: string, metadata: CacheMetadataUpdate) => Promise<void>;
  generate: (input: {
    problemSetId: string;
    force: boolean;
    dryRun: boolean;
    variant: GeneratedPdfVariant;
  }) => Promise<ProblemSetPdfGenerationResult>;
};

function dedupeContests(contests: Contest[] | undefined): Contest[] | undefined {
  if (!contests || contests.length === 0) {
    return undefined;
  }
  return [...new Set(contests)];
}

export function normalizeBackfillGeneratedOptions(
  options: Partial<BackfillGeneratedOptions>
): BackfillGeneratedOptions {
  const contests = dedupeContests(
    options.contests && options.contests.length > 0
      ? options.contests
      : options.contest
        ? [options.contest]
        : undefined
  );

  return {
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    retryFailedOnly: options.retryFailedOnly ?? false,
    limit: options.limit,
    contest: options.contest,
    contests,
    yearFrom: options.yearFrom,
    yearTo: options.yearTo,
    maxErrors: options.maxErrors,
    variant: options.variant ?? "problems"
  };
}

export function createBackfillGeneratedSummary(): BackfillGeneratedSummary {
  return {
    scanned: 0,
    generated_cached: 0,
    generated_cached_problems: 0,
    generated_cached_answers: 0,
    skipped_already_cached: 0,
    skipped_no_problems: 0,
    render_failed: 0,
    cache_failed: 0,
    aborted: false
  };
}

export function applyBackfillGeneratedOutcome(
  summary: BackfillGeneratedSummary,
  outcome: BackfillGeneratedOutcome
): void {
  summary[outcome] += 1;
}

function getFailureCount(summary: BackfillGeneratedSummary): number {
  return summary.render_failed + summary.cache_failed;
}

export function hasBackfillGeneratedFailures(summary: BackfillGeneratedSummary): boolean {
  return getFailureCount(summary) > 0 || summary.aborted;
}

function shouldAbortForMaxErrors(options: BackfillGeneratedOptions, summary: BackfillGeneratedSummary): boolean {
  if (options.maxErrors === undefined) {
    return false;
  }
  return getFailureCount(summary) > options.maxErrors;
}

function resolveContests(options: BackfillGeneratedOptions): Contest[] | undefined {
  if (options.contests && options.contests.length > 0) {
    return options.contests;
  }
  if (options.contest) {
    return [options.contest];
  }
  return undefined;
}

function resolveVariants(variant: BackfillGeneratedVariant): GeneratedPdfVariant[] {
  if (variant === "both") {
    return ["problems", "answers"];
  }
  return [variant];
}

export function buildBackfillGeneratedWhere(options: BackfillGeneratedOptions): Prisma.ProblemSetWhereInput {
  const where: Prisma.ProblemSetWhereInput = {};

  const contests = resolveContests(options);
  if (contests && contests.length > 0) {
    where.contest = { in: contests };
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

function createDefaultDeps(prisma: BackfillPrisma): BackfillGeneratedDeps {
  return {
    listProblemSets: async (options) =>
      prisma.problemSet.findMany({
        where: buildBackfillGeneratedWhere(options),
        orderBy: [{ year: "desc" }, { contest: "asc" }, { exam: "asc" }],
        take: options.limit,
        select: {
          id: true,
          title: true,
          contest: true,
          year: true,
          exam: true,
          cachedPdfStatus: true
        }
      }),
    hasCached: async (problemSetId, variant) =>
      hasCachedOfficialPdf(getProblemSetPdfCacheKey(problemSetId, variant)),
    readCachedMetadata: async (problemSetId, variant) =>
      readCachedOfficialPdfMetadata(getProblemSetPdfCacheKey(problemSetId, variant)),
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
    generate: async ({ problemSetId, force, dryRun, variant }) =>
      generateAndCacheProblemSetPdf({
        prisma,
        problemSetId,
        force,
        dryRun,
        variant
      })
  };
}

function applyGenerationResult(
  summary: BackfillGeneratedSummary,
  result: ProblemSetPdfGenerationResult,
  variant: GeneratedPdfVariant
): void {
  if (result.ok) {
    applyBackfillGeneratedOutcome(summary, "generated_cached");
    applyBackfillGeneratedOutcome(
      summary,
      variant === "problems" ? "generated_cached_problems" : "generated_cached_answers"
    );
    return;
  }

  if (result.category === "missing-generation-source") {
    applyBackfillGeneratedOutcome(summary, "skipped_no_problems");
    return;
  }

  if (result.category === "cache-failed") {
    applyBackfillGeneratedOutcome(summary, "cache_failed");
    return;
  }

  applyBackfillGeneratedOutcome(summary, "render_failed");
}

export async function runGeneratedPdfBackfill(input: {
  prisma: BackfillPrisma;
  options: BackfillGeneratedOptions;
  deps?: Partial<BackfillGeneratedDeps>;
}): Promise<BackfillGeneratedSummary> {
  const { prisma, options, deps: depsArg } = input;
  const summary = createBackfillGeneratedSummary();
  const deps: BackfillGeneratedDeps = {
    ...createDefaultDeps(prisma),
    ...depsArg
  };

  const problemSets = await deps.listProblemSets(options);
  const variants = resolveVariants(options.variant);

  for (const problemSet of problemSets) {
    summary.scanned += 1;

    for (const variant of variants) {
      if (!options.force) {
        const cachedExists = await deps.hasCached(problemSet.id, variant);
        if (cachedExists) {
          applyBackfillGeneratedOutcome(summary, "skipped_already_cached");

          if (!options.dryRun && variant === "problems") {
            const metadata = await deps.readCachedMetadata(problemSet.id, variant).catch(() => null);
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

      const result = await deps.generate({
        problemSetId: problemSet.id,
        force: options.force,
        dryRun: options.dryRun,
        variant
      });
      applyGenerationResult(summary, result, variant);

      if (shouldAbortForMaxErrors(options, summary)) {
        summary.aborted = true;
        break;
      }
    }

    if (summary.aborted) {
      break;
    }
  }

  return summary;
}

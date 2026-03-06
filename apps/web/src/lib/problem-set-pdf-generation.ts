import type { Prisma, PrismaClient } from "@arcmath/db";
import { cacheOfficialPdfBytes } from "./official-pdf-cache";
import { renderProblemSetPdf, type GeneratedPdfVariant } from "./generated-problem-set-pdf";

export type { GeneratedPdfVariant } from "./generated-problem-set-pdf";

type GenerationPrisma = Pick<PrismaClient, "problemSet" | "problem">;

type ProblemSetRecord = {
  id: string;
  title: string;
  contest: "AMC8" | "AMC10" | "AMC12" | "AIME";
  year: number;
  exam: string | null;
  sourceUrl: string | null;
  verifiedPdfUrl: string | null;
  cachedPdfPath: string | null;
  cachedPdfSha256: string | null;
  cachedPdfSize: number | null;
  cachedPdfAt: Date | null;
  cachedPdfStatus: string | null;
  cachedPdfError: string | null;
};

type ProblemRecord = {
  number: number;
  statement: string | null;
  choices: Prisma.JsonValue | null;
  answer: string | null;
};

type GenerationFailureCategory = "not-found" | "missing-generation-source" | "render-failed" | "cache-failed";

type GenerationFailure = {
  ok: false;
  problemSetId: string;
  category: GenerationFailureCategory;
  message: string;
};

type GenerationSuccess = {
  ok: true;
  problemSetId: string;
  generatedProblemCount: number;
  cache: {
    path: string;
    size: number;
    sha256: string;
  } | null;
  pdfBytes: Buffer;
  problemSet: ProblemSetRecord;
};

export type ProblemSetPdfGenerationResult = GenerationSuccess | GenerationFailure;

type GenerateAndCacheInput = {
  prisma: GenerationPrisma;
  problemSetId: string;
  variant?: GeneratedPdfVariant;
  force?: boolean;
  dryRun?: boolean;
};

const problemSetSelect = {
  id: true,
  title: true,
  contest: true,
  year: true,
  exam: true,
  sourceUrl: true,
  verifiedPdfUrl: true,
  cachedPdfPath: true,
  cachedPdfSha256: true,
  cachedPdfSize: true,
  cachedPdfAt: true,
  cachedPdfStatus: true,
  cachedPdfError: true
} as const;

const problemSelect = {
  number: true,
  statement: true,
  choices: true,
  answer: true
} as const;

function toShortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

export function getProblemSetPdfCacheKey(problemSetId: string, variant: GeneratedPdfVariant): string {
  return variant === "answers" ? `${problemSetId}.answers` : problemSetId;
}

async function persistFailureMetadata(input: {
  prisma: GenerationPrisma;
  problemSetId: string;
  status: "FAILED" | "MISSING";
  error: string;
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun) {
    return;
  }
  await input.prisma.problemSet
    .update({
      where: { id: input.problemSetId },
      data: {
        cachedPdfStatus: input.status,
        cachedPdfError: input.error
      }
    })
    .catch(() => undefined);
}

async function loadProblemSet(
  prisma: GenerationPrisma,
  problemSetId: string
): Promise<ProblemSetRecord | null> {
  return prisma.problemSet.findUnique({
    where: { id: problemSetId },
    select: problemSetSelect
  }) as Promise<ProblemSetRecord | null>;
}

async function loadProblems(prisma: GenerationPrisma, problemSetId: string): Promise<ProblemRecord[]> {
  return prisma.problem.findMany({
    where: { problemSetId },
    orderBy: { number: "asc" },
    select: problemSelect
  }) as Promise<ProblemRecord[]>;
}

export async function generateAndCacheProblemSetPdf(
  input: GenerateAndCacheInput
): Promise<ProblemSetPdfGenerationResult> {
  const variant: GeneratedPdfVariant = input.variant ?? "problems";
  const force = input.force ?? false;
  const dryRun = input.dryRun ?? false;

  const problemSet = await loadProblemSet(input.prisma, input.problemSetId);
  if (!problemSet) {
    return {
      ok: false,
      problemSetId: input.problemSetId,
      category: "not-found",
      message: "Problem set not found."
    };
  }

  const problems = await loadProblems(input.prisma, input.problemSetId);
  if (problems.length === 0) {
    const message = "missing-generation-source: no problems found for this set.";
    await persistFailureMetadata({
      prisma: input.prisma,
      problemSetId: input.problemSetId,
      status: "MISSING",
      error: message,
      dryRun
    });
    return {
      ok: false,
      problemSetId: input.problemSetId,
      category: "missing-generation-source",
      message
    };
  }

  let pdfBytes: Buffer;
  try {
    pdfBytes = await renderProblemSetPdf({
      contest: problemSet.contest,
      year: problemSet.year,
      exam: problemSet.exam,
      title: problemSet.title,
      variant,
      problems
    });
  } catch (error) {
    const message = `render-failed: ${toShortError(error)}`;
    await persistFailureMetadata({
      prisma: input.prisma,
      problemSetId: input.problemSetId,
      status: "FAILED",
      error: message,
      dryRun
    });
    return {
      ok: false,
      problemSetId: input.problemSetId,
      category: "render-failed",
      message
    };
  }

  if (dryRun) {
    return {
      ok: true,
      problemSetId: input.problemSetId,
      generatedProblemCount: problems.length,
      cache: null,
      pdfBytes,
      problemSet
    };
  }

  let cache: {
    path: string;
    size: number;
    sha256: string;
  };
  try {
    cache = await cacheOfficialPdfBytes({
      problemSetId: getProblemSetPdfCacheKey(input.problemSetId, variant),
      bytes: pdfBytes,
      force
    });
  } catch (error) {
    const message = `cache-failed: ${toShortError(error)}`;
    await persistFailureMetadata({
      prisma: input.prisma,
      problemSetId: input.problemSetId,
      status: "FAILED",
      error: message,
      dryRun
    });
    return {
      ok: false,
      problemSetId: input.problemSetId,
      category: "cache-failed",
      message
    };
  }

  if (variant === "problems") {
    await input.prisma.problemSet
      .update({
        where: { id: input.problemSetId },
        data: {
          cachedPdfPath: cache.path,
          cachedPdfSha256: cache.sha256,
          cachedPdfSize: cache.size,
          cachedPdfAt: new Date(),
          cachedPdfStatus: "CACHED",
          cachedPdfError: null
        }
      })
      .catch(() => undefined);
  }

  const latest = await loadProblemSet(input.prisma, input.problemSetId);

  return {
    ok: true,
    problemSetId: input.problemSetId,
    generatedProblemCount: problems.length,
    cache,
    pdfBytes,
    problemSet: latest ?? {
      ...problemSet,
      ...(variant === "problems"
        ? {
            cachedPdfPath: cache.path,
            cachedPdfSha256: cache.sha256,
            cachedPdfSize: cache.size,
            cachedPdfAt: new Date(),
            cachedPdfStatus: "CACHED",
            cachedPdfError: null
          }
        : {})
    }
  };
}

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { contestSchema } from "@arcmath/shared";
import { adminProcedure, router } from "@/lib/trpc/server";
import { FREE_RESOURCE_SET_LIMIT } from "@/lib/membership";
import { validateOfficialPdfUrl } from "@/lib/official-pdf";
import { resolveAoPSPdfUrlFromSource } from "@/lib/aops-pdf";
import { cacheOfficialPdfFromUrl } from "@/lib/official-pdf-cache";
import { generateAndCacheProblemSetPdf } from "@/lib/problem-set-pdf-generation";
import { normalizeBackfillGeneratedOptions, runGeneratedPdfBackfill } from "@/lib/generated-pdf-backfill";

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

const userEmailInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase())
});

const clearLocksInputSchema = userEmailInputSchema.extend({
  problemSetId: z.string().min(1).optional()
});

const verifyOfficialPdfInputSchema = z.object({
  problemSetId: z.string().min(1),
  pdfUrl: z.string().url()
});

const autoResolveOfficialPdfInputSchema = z.object({
  problemSetId: z.string().min(1)
});

const cacheOfficialPdfInputSchema = z.object({
  problemSetId: z.string().min(1),
  force: z.boolean().optional()
});

const generatePdfFromProblemsInputSchema = z.object({
  problemSetId: z.string().min(1),
  force: z.boolean().optional()
});

const backfillGeneratedPdfsInputSchema = z
  .object({
    contest: contestSchema.optional(),
    contests: z.array(contestSchema).min(1).optional(),
    yearFrom: z.number().int().min(1950).max(9999).optional(),
    yearTo: z.number().int().min(1950).max(9999).optional(),
    limit: z.number().int().min(1).max(10_000).optional(),
    variant: z.enum(["problems", "answers", "both"]).optional(),
    force: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    retryFailedOnly: z.boolean().optional(),
    maxErrors: z.number().int().min(0).max(10_000).optional()
  })
  .optional()
  .transform((input) => input ?? {})
  .superRefine((input, ctx) => {
    if (input.yearFrom !== undefined && input.yearTo !== undefined && input.yearFrom > input.yearTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["yearFrom"],
        message: "yearFrom cannot be greater than yearTo."
      });
    }
  });

const officialPdfCacheStatsInputSchema = z
  .object({
    contest: contestSchema.optional(),
    yearFrom: z.number().int().min(1950).max(9999).optional(),
    yearTo: z.number().int().min(1950).max(9999).optional()
  })
  .optional()
  .transform((input) => input ?? {})
  .superRefine((input, ctx) => {
    if (input.yearFrom !== undefined && input.yearTo !== undefined && input.yearFrom > input.yearTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["yearFrom"],
        message: "yearFrom cannot be greater than yearTo."
      });
    }
  });

type CacheStatus = "CACHED" | "FAILED" | "MISSING";

function normalizeCacheStatus(value: string | null): CacheStatus {
  if (value === "CACHED") {
    return "CACHED";
  }
  if (value === "FAILED") {
    return "FAILED";
  }
  return "MISSING";
}

function toYearBand(year: number): string {
  const start = Math.floor(year / 5) * 5;
  return `${start}-${start + 4}`;
}

function toShortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

async function persistFailureMetadataBestEffort(input: {
  prisma: {
    problemSet: {
      update: (args: {
        where: { id: string };
        data: {
          cachedPdfStatus: string;
          cachedPdfError: string | null;
        };
      }) => Promise<unknown>;
    };
  };
  problemSetId: string;
  status: Exclude<CacheStatus, "CACHED">;
  error: string;
}): Promise<void> {
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

export const adminResourceAccessRouter = router({
  lookupUser: adminProcedure.input(userEmailInputSchema).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found."
      });
    }

    try {
      const accesses = await ctx.prisma.userResourceAccess.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        include: {
          problemSet: {
            select: {
              id: true,
              title: true,
              contest: true,
              year: true,
              exam: true
            }
          }
        }
      });

      return {
        user,
        freeLimit: FREE_RESOURCE_SET_LIMIT,
        used: accesses.length,
        accesses: accesses.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          problemSet: item.problemSet
        }))
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "UserResourceAccess table is missing. Run latest DB migration first."
        });
      }
      throw error;
    }
  }),
  clearUserLocks: adminProcedure.input(clearLocksInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found."
      });
    }

    try {
      const result = await ctx.prisma.userResourceAccess.deleteMany({
        where: {
          userId: user.id,
          ...(input.problemSetId ? { problemSetId: input.problemSetId } : {})
        }
      });

      const remaining = await ctx.prisma.userResourceAccess.count({
        where: { userId: user.id }
      });

      return {
        user,
        clearedCount: result.count,
        remaining,
        freeLimit: FREE_RESOURCE_SET_LIMIT
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "UserResourceAccess table is missing. Run latest DB migration first."
        });
      }
      throw error;
    }
  }),
  verifyOfficialPdf: adminProcedure.input(verifyOfficialPdfInputSchema).mutation(async ({ ctx, input }) => {
    const isValid = await validateOfficialPdfUrl(input.pdfUrl);
    if (!isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "URL does not resolve to a valid PDF."
      });
    }

    const updated = await ctx.prisma.problemSet.update({
      where: { id: input.problemSetId },
      data: { verifiedPdfUrl: input.pdfUrl },
      select: {
        id: true,
        title: true,
        verifiedPdfUrl: true
      }
    });

    return {
      ok: true,
      problemSet: updated
    };
  }),
  autoResolveOfficialPdf: adminProcedure.input(autoResolveOfficialPdfInputSchema).mutation(async ({ ctx, input }) => {
    const problemSet = await ctx.prisma.problemSet.findUnique({
      where: { id: input.problemSetId },
      select: {
        id: true,
        sourceUrl: true
      }
    });

    if (!problemSet) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Problem set not found."
      });
    }

    if (!problemSet.sourceUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Problem set has no sourceUrl to resolve from."
      });
    }

    const resolved = await resolveAoPSPdfUrlFromSource(problemSet.sourceUrl);
    if (!resolved.pdfUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not resolve an official AoPS PDF URL from sourceUrl."
      });
    }

    const isValid = await validateOfficialPdfUrl(resolved.pdfUrl);
    if (!isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Resolved AoPS URL is not a valid PDF."
      });
    }

    const updated = await ctx.prisma.problemSet.update({
      where: { id: input.problemSetId },
      data: { verifiedPdfUrl: resolved.pdfUrl },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        verifiedPdfUrl: true
      }
    });

    return {
      ok: true,
      discoveredFrom: resolved.discoveredFrom,
      problemSet: updated
    };
  }),
  cacheOfficialPdf: adminProcedure.input(cacheOfficialPdfInputSchema).mutation(async ({ ctx, input }) => {
    const problemSet = await ctx.prisma.problemSet.findUnique({
      where: { id: input.problemSetId },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        verifiedPdfUrl: true
      }
    });

    if (!problemSet) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Problem set not found."
      });
    }

    let officialPdfUrl: string | null = null;

    if (problemSet.verifiedPdfUrl && (await validateOfficialPdfUrl(problemSet.verifiedPdfUrl))) {
      officialPdfUrl = problemSet.verifiedPdfUrl;
    } else {
      if (!problemSet.sourceUrl) {
        const errorMessage = "No verifiedPdfUrl and sourceUrl is missing; cannot resolve official PDF.";
        await persistFailureMetadataBestEffort({
          prisma: ctx.prisma,
          problemSetId: input.problemSetId,
          status: "MISSING",
          error: errorMessage
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage
        });
      }

      let resolved: { pdfUrl: string | null; discoveredFrom: string | null };
      try {
        resolved = await resolveAoPSPdfUrlFromSource(problemSet.sourceUrl);
      } catch (error) {
        const errorMessage = toShortError(error);
        await persistFailureMetadataBestEffort({
          prisma: ctx.prisma,
          problemSetId: input.problemSetId,
          status: "FAILED",
          error: errorMessage
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to resolve official PDF URL: ${errorMessage}`
        });
      }
      if (!resolved.pdfUrl) {
        const errorMessage = "Could not resolve an official AoPS PDF URL from sourceUrl.";
        await persistFailureMetadataBestEffort({
          prisma: ctx.prisma,
          problemSetId: input.problemSetId,
          status: "FAILED",
          error: errorMessage
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage
        });
      }

      const resolvedValid = await validateOfficialPdfUrl(resolved.pdfUrl);
      if (!resolvedValid) {
        const errorMessage = "Resolved AoPS URL is not a valid PDF.";
        await persistFailureMetadataBestEffort({
          prisma: ctx.prisma,
          problemSetId: input.problemSetId,
          status: "FAILED",
          error: errorMessage
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage
        });
      }

      const updated = await ctx.prisma.problemSet.update({
        where: { id: input.problemSetId },
        data: { verifiedPdfUrl: resolved.pdfUrl },
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          verifiedPdfUrl: true
        }
      });
      officialPdfUrl = updated.verifiedPdfUrl;
    }

    if (!officialPdfUrl) {
      const errorMessage = "Official PDF URL is unavailable.";
      await persistFailureMetadataBestEffort({
        prisma: ctx.prisma,
        problemSetId: input.problemSetId,
        status: "FAILED",
        error: errorMessage
      });
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: errorMessage
      });
    }

    let cache: {
      path: string;
      size: number;
      sha256: string;
    };
    try {
      cache = await cacheOfficialPdfFromUrl({
        problemSetId: input.problemSetId,
        pdfUrl: officialPdfUrl,
        force: input.force ?? false
      });
    } catch (error) {
      const errorMessage = toShortError(error);
      await persistFailureMetadataBestEffort({
        prisma: ctx.prisma,
        problemSetId: input.problemSetId,
        status: "FAILED",
        error: errorMessage
      });
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Failed to cache official PDF locally: ${errorMessage}`
      });
    }

    const cachedAt = new Date();
    await ctx.prisma.problemSet.update({
      where: { id: input.problemSetId },
      data: {
        cachedPdfPath: cache.path,
        cachedPdfSha256: cache.sha256,
        cachedPdfSize: cache.size,
        cachedPdfAt: cachedAt,
        cachedPdfStatus: "CACHED",
        cachedPdfError: null
      }
    });

    const latest = await ctx.prisma.problemSet.findUnique({
      where: { id: input.problemSetId },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        verifiedPdfUrl: true,
        cachedPdfPath: true,
        cachedPdfSha256: true,
        cachedPdfSize: true,
        cachedPdfAt: true,
        cachedPdfStatus: true,
        cachedPdfError: true
      }
    });

    return {
      ok: true,
      problemSet: latest ?? {
        id: problemSet.id,
        title: problemSet.title,
        sourceUrl: problemSet.sourceUrl,
        verifiedPdfUrl: officialPdfUrl
      },
      cache
    };
  }),
  generatePdfFromProblems: adminProcedure
    .input(generatePdfFromProblemsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await generateAndCacheProblemSetPdf({
        prisma: ctx.prisma,
        problemSetId: input.problemSetId,
        force: input.force ?? false
      });

      if (!result.ok) {
        if (result.category === "not-found") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: result.message
          });
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.message
        });
      }
      if (!result.cache) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Generation succeeded without cache metadata."
        });
      }

      return {
        ok: true,
        generatedProblemCount: result.generatedProblemCount,
        problemSet: result.problemSet,
        cache: result.cache
      };
    }),
  backfillGeneratedPdfs: adminProcedure
    .input(backfillGeneratedPdfsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const options = normalizeBackfillGeneratedOptions({
        contest: input.contest,
        contests: input.contests,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        limit: input.limit,
        variant: input.variant,
        force: input.force,
        dryRun: input.dryRun,
        retryFailedOnly: input.retryFailedOnly,
        maxErrors: input.maxErrors
      });

      try {
        return await runGeneratedPdfBackfill({
          prisma: ctx.prisma,
          options
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `backfill-generated-failed: ${toShortError(error)}`
        });
      }
    }),
  officialPdfCacheStats: adminProcedure
    .input(officialPdfCacheStatsInputSchema)
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.contest ? { contest: input.contest } : {}),
        ...(input.yearFrom !== undefined || input.yearTo !== undefined
          ? {
              year: {
                ...(input.yearFrom !== undefined ? { gte: input.yearFrom } : {}),
                ...(input.yearTo !== undefined ? { lte: input.yearTo } : {})
              }
            }
          : {})
      };

      const rows = await ctx.prisma.problemSet.findMany({
        where,
        select: {
          contest: true,
          year: true,
          cachedPdfStatus: true,
          _count: {
            select: {
              problems: true
            }
          }
        }
      });

      const counters = {
        total: rows.length,
        cached: 0,
        missing: 0,
        failed: 0,
        generatable: 0,
        needsGeneration: 0,
        noProblem: 0
      };

      const byContest = new Map<
        string,
        {
          total: number;
          cached: number;
          missing: number;
          failed: number;
        }
      >();
      const byYearBand = new Map<
        string,
        {
          total: number;
          cached: number;
          missing: number;
          failed: number;
        }
      >();

      for (const row of rows) {
        const status = normalizeCacheStatus(row.cachedPdfStatus);
        const problemCount = row._count.problems;
        if (status === "CACHED") {
          counters.cached += 1;
        } else if (status === "FAILED") {
          counters.failed += 1;
        } else {
          counters.missing += 1;
        }
        if (problemCount > 0) {
          counters.generatable += 1;
          if (status !== "CACHED") {
            counters.needsGeneration += 1;
          }
        } else {
          counters.noProblem += 1;
        }

        const contestBucket = byContest.get(row.contest) ?? {
          total: 0,
          cached: 0,
          missing: 0,
          failed: 0
        };
        contestBucket.total += 1;
        contestBucket[status.toLowerCase() as "cached" | "missing" | "failed"] += 1;
        byContest.set(row.contest, contestBucket);

        const yearBand = toYearBand(row.year);
        const yearBucket = byYearBand.get(yearBand) ?? {
          total: 0,
          cached: 0,
          missing: 0,
          failed: 0
        };
        yearBucket.total += 1;
        yearBucket[status.toLowerCase() as "cached" | "missing" | "failed"] += 1;
        byYearBand.set(yearBand, yearBucket);
      }

      return {
        totalProblemSets: counters.total,
        cachedCount: counters.cached,
        missingCount: counters.missing,
        failedCount: counters.failed,
        generatableCount: counters.generatable,
        needsGenerationCount: counters.needsGeneration,
        noProblemCount: counters.noProblem,
        coveragePercent:
          counters.total > 0 ? Number(((counters.cached / counters.total) * 100).toFixed(2)) : 0,
        filters: {
          contest: input.contest ?? null,
          yearFrom: input.yearFrom ?? null,
          yearTo: input.yearTo ?? null
        },
        breakdown: {
          byContest: [...byContest.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([contest, values]) => ({
              contest,
              total: values.total,
              cached: values.cached,
              missing: values.missing,
              failed: values.failed,
              coveragePercent: values.total > 0 ? Number(((values.cached / values.total) * 100).toFixed(2)) : 0
            })),
          byYearBand: [...byYearBand.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([yearBand, values]) => ({
              yearBand,
              total: values.total,
              cached: values.cached,
              missing: values.missing,
              failed: values.failed,
              coveragePercent: values.total > 0 ? Number(((values.cached / values.total) * 100).toFixed(2)) : 0
            }))
        }
      };
    })
});

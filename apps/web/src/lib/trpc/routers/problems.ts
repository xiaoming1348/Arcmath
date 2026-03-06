import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { contestSchema } from "@arcmath/shared";
import { protectedProcedure, router } from "@/lib/trpc/server";
import { FREE_RESOURCE_SET_LIMIT, hasActiveMembership } from "@/lib/membership";
import {
  checkResourceAccessDecision,
  getGrantedProblemSetIds
} from "@/lib/resource-access";
import {
  createExamOptionsByContest,
  createYearsByContest,
  getLastCompleteYearsWindow,
  listScopedDownloadableProblemSets
} from "@/lib/resource-scope";

const listProblemsInputSchema = z.object({
  contest: contestSchema.optional(),
  year: z.number().int().min(1950).max(9999).optional(),
  exam: z
    .preprocess((value) => (typeof value === "string" ? value.trim().toUpperCase() : value), z.string().optional())
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10)
});

const getResourceByIdInputSchema = z.object({
  id: z.string().min(1)
});

const getResourceByKeyInputSchema = z
  .object({
    contest: contestSchema,
    year: z.number().int().min(1950).max(9999),
    exam: z
      .preprocess((value) => {
        if (typeof value !== "string") {
          return null;
        }
        const normalized = value.trim().toUpperCase();
        return normalized.length > 0 ? normalized : null;
      }, z.string().nullable())
      .nullable()
      .optional()
  })
  .transform((input) => ({
    ...input,
    exam: input.exam ?? null
  }))
  .superRefine((input, ctx) => {
    if (input.contest === "AMC8" && input.exam !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exam"],
        message: "AMC8 does not use exam."
      });
      return;
    }

    if ((input.contest === "AMC10" || input.contest === "AMC12") && input.exam !== "A" && input.exam !== "B") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exam"],
        message: `${input.contest} requires exam A or B.`
      });
      return;
    }

    if (input.contest === "AIME" && input.exam !== "I" && input.exam !== "II") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exam"],
        message: "AIME requires exam I or II."
      });
    }
  });

export const resourcesRouter = router({
  list: protectedProcedure.input(listProblemsInputSchema).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    const hasMembership = hasActiveMembership(ctx.session);
    const skip = (page - 1) * pageSize;

    const [filteredSets, allScopedSets, grantedIdsRaw] = await Promise.all([
      listScopedDownloadableProblemSets({
        prisma: ctx.prisma,
        filters: {
          contest: input.contest,
          year: input.year,
          exam: input.exam ?? null
        }
      }),
      listScopedDownloadableProblemSets({
        prisma: ctx.prisma
      }),
      hasMembership ? Promise.resolve<string[] | null>([]) : getGrantedProblemSetIds({ prisma: ctx.prisma, userId })
    ]);

    const trackingAvailable = grantedIdsRaw !== null;
    const grantedIds = new Set(grantedIdsRaw ?? []);
    const used = trackingAvailable ? grantedIds.size : 0;
    const remaining = hasMembership ? Number.POSITIVE_INFINITY : Math.max(0, FREE_RESOURCE_SET_LIMIT - used);
    const totalFiltered = filteredSets.length;
    const totalAll = allScopedSets.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const problemSets = filteredSets.slice(skip, skip + pageSize);

    return {
      page,
      pageSize,
      total: totalFiltered,
      totalPages,
      offset: skip,
      items: problemSets.map((problemSet) => ({
        id: problemSet.id,
        title: problemSet.title,
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam,
        sourceUrl: problemSet.sourceUrl,
        verifiedPdfUrl: problemSet.verifiedPdfUrl,
        problemCount: problemSet.problemCount ?? 0,
        isLocked: !hasMembership && trackingAvailable && remaining === 0 && !grantedIds.has(problemSet.id)
      })),
      membership: {
        isMember: hasMembership,
        required: !hasMembership && totalAll > FREE_RESOURCE_SET_LIMIT,
        freeLimit: FREE_RESOURCE_SET_LIMIT,
        used: hasMembership ? 0 : used,
        remaining: hasMembership ? null : trackingAvailable ? remaining : null,
        lockedCount: !hasMembership && trackingAvailable && remaining === 0 ? Math.max(0, totalAll - used) : 0,
        trackingAvailable
      }
    };
  }),
  byId: protectedProcedure.input(getResourceByIdInputSchema).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const problemSet = await ctx.prisma.problemSet.findUnique({
      where: { id: input.id },
      include: {
        problems: {
          orderBy: { number: "asc" }
        }
      }
    });

    if (!problemSet) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Resource file not found."
      });
    }

    const access = await checkResourceAccessDecision({
      prisma: ctx.prisma,
      userId,
      problemSetId: problemSet.id,
      hasMembership: hasActiveMembership(ctx.session),
      freeLimit: FREE_RESOURCE_SET_LIMIT
    });

    if (!access.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This file is locked. You already used ${access.used}/${access.freeLimit} free files.`
      });
    }

    return {
      access,
      file: {
        id: problemSet.id,
        title: problemSet.title,
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam,
        sourceUrl: problemSet.sourceUrl,
        verifiedPdfUrl: problemSet.verifiedPdfUrl,
        problemCount: problemSet.problems.length,
        problems: problemSet.problems.map((problem) => ({
          id: problem.id,
          number: problem.number,
          statement: problem.statement,
          answer: problem.answer,
          answerFormat: problem.answerFormat,
          sourceUrl: problem.sourceUrl
        }))
      }
    };
  }),
  byKey: protectedProcedure.input(getResourceByKeyInputSchema).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const matches = await listScopedDownloadableProblemSets({
      prisma: ctx.prisma,
      filters: {
        contest: input.contest,
        year: input.year,
        exam: input.exam
      }
    });
    const problemSet = matches[0] ?? null;

    if (!problemSet) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No file found for that Contest/Year/Exam."
      });
    }

    const access = await checkResourceAccessDecision({
      prisma: ctx.prisma,
      userId,
      problemSetId: problemSet.id,
      hasMembership: hasActiveMembership(ctx.session),
      freeLimit: FREE_RESOURCE_SET_LIMIT
    });

    if (!access.allowed) {
      return {
        status: "locked" as const,
        access,
        message: `You already used ${access.used}/${access.freeLimit} free files. Membership is required to open more.`
      };
    }

    return {
      status: "ok" as const,
      access,
      file: {
        id: problemSet.id,
        title: problemSet.title,
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam,
        sourceUrl: problemSet.sourceUrl,
        verifiedPdfUrl: problemSet.verifiedPdfUrl
      }
    };
  })
});

export const resourceSetsRouter = router({
  listDistinctFilters: protectedProcedure.query(async ({ ctx }) => {
    const scopedRows = await listScopedDownloadableProblemSets({
      prisma: ctx.prisma
    });
    const window = getLastCompleteYearsWindow();
    const contests = [...new Set(scopedRows.map((row) => row.contest))].sort();
    const years = [...new Set(scopedRows.map((row) => row.year))].sort((a, b) => b - a);
    const examOptionsByContest = createExamOptionsByContest(scopedRows);
    const yearsByContest = createYearsByContest(scopedRows);
    const exams = [...new Set(scopedRows.map((row) => row.exam).filter((exam): exam is string => Boolean(exam)))].sort();

    return {
      contests,
      years,
      exams,
      examOptionsByContest,
      yearsByContest,
      yearWindow: window
    };
  })
});

export const problemsRouter = resourcesRouter;
export const problemSetsRouter = resourceSetsRouter;

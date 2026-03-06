import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";
import { resolveAoPSPdfUrlFromSource } from "@/lib/aops-pdf";
import { validateOfficialPdfUrl } from "@/lib/official-pdf";
import { cacheOfficialPdfFromUrl } from "@/lib/official-pdf-cache";
import { generateAndCacheProblemSetPdf } from "@/lib/problem-set-pdf-generation";
import { runGeneratedPdfBackfill } from "@/lib/generated-pdf-backfill";

vi.mock("@/lib/aops-pdf", () => ({
  resolveAoPSPdfUrlFromSource: vi.fn()
}));

vi.mock("@/lib/official-pdf", () => ({
  validateOfficialPdfUrl: vi.fn()
}));

vi.mock("@/lib/official-pdf-cache", () => ({
  cacheOfficialPdfFromUrl: vi.fn()
}));

vi.mock("@/lib/problem-set-pdf-generation", () => ({
  generateAndCacheProblemSetPdf: vi.fn()
}));

vi.mock("@/lib/generated-pdf-backfill", () => ({
  normalizeBackfillGeneratedOptions: vi.fn((options: Record<string, unknown>) => ({
    force: false,
    dryRun: false,
    retryFailedOnly: false,
    ...options
  })),
  runGeneratedPdfBackfill: vi.fn()
}));

type MockUser = {
  id: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
};

type MockAccess = {
  id: string;
  userId: string;
  problemSetId: string;
  createdAt: Date;
};

type MockProblemSet = {
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

function makeSession(role: "STUDENT" | "ADMIN"): Session {
  return {
    user: {
      id: `${role.toLowerCase()}_1`,
      email: `${role.toLowerCase()}@example.com`,
      role
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

function createPrismaMock() {
  const users: MockUser[] = [{ id: "u1", email: "student@example.com", role: "STUDENT" }];
  const problemSets: MockProblemSet[] = [
    {
      id: "set_1",
      title: "AMC 10A 2025",
      contest: "AMC10",
      year: 2025,
      exam: "A",
      sourceUrl: "https://artofproblemsolving.com/wiki/index.php?title=2025_AMC_10A",
      verifiedPdfUrl: null,
      cachedPdfPath: null,
      cachedPdfSha256: null,
      cachedPdfSize: null,
      cachedPdfAt: null,
      cachedPdfStatus: null,
      cachedPdfError: null
    },
    {
      id: "set_2",
      title: "AMC 10A 2024",
      contest: "AMC10",
      year: 2024,
      exam: "A",
      sourceUrl: null,
      verifiedPdfUrl: null,
      cachedPdfPath: null,
      cachedPdfSha256: null,
      cachedPdfSize: null,
      cachedPdfAt: null,
      cachedPdfStatus: "FAILED",
      cachedPdfError: "download timeout"
    },
    {
      id: "set_3",
      title: "AIME I 2023",
      contest: "AIME",
      year: 2023,
      exam: "I",
      sourceUrl: "https://example.com/aime-2023-i",
      verifiedPdfUrl: "https://example.com/aime-2023-i.pdf",
      cachedPdfPath: "/tmp/official-pdfs/set_3.pdf",
      cachedPdfSha256: "f".repeat(64),
      cachedPdfSize: 999,
      cachedPdfAt: new Date("2026-01-01T00:00:00.000Z"),
      cachedPdfStatus: "CACHED",
      cachedPdfError: null
    }
  ];
  const accesses: MockAccess[] = [
    { id: "a1", userId: "u1", problemSetId: "set_1", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "a2", userId: "u1", problemSetId: "set_2", createdAt: new Date("2026-01-02T00:00:00.000Z") }
  ];
  const problemsBySet: Record<string, Array<{ number: number; statement: string | null; choices: unknown; answer: string | null }>> = {
    set_1: [{ number: 1, statement: "What is 1+1?", choices: ["1", "2", "3", "4", "5"], answer: "B" }],
    set_2: [],
    set_3: [{ number: 1, statement: "AIME sample", choices: null, answer: "42" }]
  };

  return {
    prisma: {
      user: {
        findUnique: async (args: { where: { email: string } }) =>
          users.find((user) => user.email === args.where.email) ?? null
      },
      userResourceAccess: {
        findMany: async (args: { where: { userId: string } }) =>
          accesses
            .filter((row) => row.userId === args.where.userId)
            .map((row) => ({
              ...row,
              problemSet: problemSets.find((set) => set.id === row.problemSetId)!
            })),
        deleteMany: async (args: { where: { userId: string; problemSetId?: string } }) => {
          const before = accesses.length;
          for (let index = accesses.length - 1; index >= 0; index -= 1) {
            const row = accesses[index];
            if (row.userId !== args.where.userId) {
              continue;
            }
            if (args.where.problemSetId && row.problemSetId !== args.where.problemSetId) {
              continue;
            }
            accesses.splice(index, 1);
          }
          return { count: before - accesses.length };
        },
        count: async (args: { where: { userId: string } }) =>
          accesses.filter((row) => row.userId === args.where.userId).length
      },
      problemSet: {
        findMany: async (args: {
          where?: {
            contest?: MockProblemSet["contest"];
            year?: { gte?: number; lte?: number };
          };
          select?: {
            contest?: true;
            year?: true;
            cachedPdfStatus?: true;
          };
        }) => {
          const filtered = problemSets.filter((set) => {
            if (args.where?.contest && set.contest !== args.where.contest) {
              return false;
            }
            const gte = args.where?.year?.gte;
            const lte = args.where?.year?.lte;
            if (gte !== undefined && set.year < gte) {
              return false;
            }
            if (lte !== undefined && set.year > lte) {
              return false;
            }
            return true;
          });

          if (args.select?.contest || args.select?.year || args.select?.cachedPdfStatus) {
            return filtered.map((set) => ({
              contest: set.contest,
              year: set.year,
              cachedPdfStatus: set.cachedPdfStatus,
              _count: {
                problems: problemsBySet[set.id]?.length ?? 0
              }
            }));
          }

          return filtered;
        },
        findUnique: async (args: { where: { id: string } }) =>
          problemSets.find((set) => set.id === args.where.id) ?? null,
        update: async (args: {
          where: { id: string };
          data: Partial<MockProblemSet>;
        }) => {
          const found = problemSets.find((set) => set.id === args.where.id);
          if (!found) {
            throw new Error("set not found");
          }
          Object.assign(found, args.data);
          return found;
        }
      },
      problem: {
        findMany: async (args: { where: { problemSetId: string } }) => {
          return problemsBySet[args.where.problemSetId] ?? [];
        }
      }
    },
    accesses,
    problemSets,
    problemsBySet
  };
}

describe("admin resource access router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admin to inspect and clear a user's lock usage", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    const before = await caller.admin.resourceAccess.lookupUser({ email: "student@example.com" });
    expect(before.used).toBe(2);
    expect(before.accesses).toHaveLength(2);

    const clearedOne = await caller.admin.resourceAccess.clearUserLocks({
      email: "student@example.com",
      problemSetId: "set_1"
    });
    expect(clearedOne.clearedCount).toBe(1);
    expect(clearedOne.remaining).toBe(1);

    const clearedAll = await caller.admin.resourceAccess.clearUserLocks({
      email: "student@example.com"
    });
    expect(clearedAll.remaining).toBe(0);
    expect(mock.accesses).toHaveLength(0);
  });

  it("auto-resolves official PDF from source URL and persists verifiedPdfUrl", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(resolveAoPSPdfUrlFromSource).mockResolvedValue({
      pdfUrl: "https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2025",
      discoveredFrom: "https://artofproblemsolving.com/wiki/index.php?title=2025_AMC_10A_Problems"
    });
    vi.mocked(validateOfficialPdfUrl).mockResolvedValue(true);

    const result = await caller.admin.resourceAccess.autoResolveOfficialPdf({ problemSetId: "set_1" });

    expect(result.ok).toBe(true);
    expect(result.problemSet.id).toBe("set_1");
    expect(result.problemSet.verifiedPdfUrl).toContain("/community/contest/download/");
    expect(mock.problemSets[0]?.verifiedPdfUrl).toBe(result.problemSet.verifiedPdfUrl);
  });

  it("caches official PDF and persists cache metadata", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(resolveAoPSPdfUrlFromSource).mockResolvedValue({
      pdfUrl: "https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2025",
      discoveredFrom: "https://artofproblemsolving.com/wiki/index.php?title=2025_AMC_10A_Problems"
    });
    vi.mocked(validateOfficialPdfUrl).mockResolvedValue(true);
    vi.mocked(cacheOfficialPdfFromUrl).mockResolvedValue({
      path: "/tmp/official-pdfs/set_1.pdf",
      size: 12345,
      sha256: "a".repeat(64)
    });

    const result = await caller.admin.resourceAccess.cacheOfficialPdf({
      problemSetId: "set_1",
      force: true
    });

    expect(result.ok).toBe(true);
    expect(result.problemSet.id).toBe("set_1");
    expect(mock.problemSets[0]?.cachedPdfStatus).toBe("CACHED");
    expect(mock.problemSets[0]?.cachedPdfPath).toBe("/tmp/official-pdfs/set_1.pdf");
    expect(mock.problemSets[0]?.cachedPdfSha256).toBe("a".repeat(64));
    expect(mock.problemSets[0]?.cachedPdfSize).toBe(12345);
    expect(mock.problemSets[0]?.cachedPdfError).toBeNull();
  });

  it("marks metadata as MISSING when source URL is absent", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    await expect(caller.admin.resourceAccess.cacheOfficialPdf({ problemSetId: "set_2" })).rejects.toBeInstanceOf(
      TRPCError
    );

    expect(mock.problemSets[1]?.cachedPdfStatus).toBe("MISSING");
    expect(mock.problemSets[1]?.cachedPdfError).toContain("sourceUrl is missing");
  });

  it("returns official PDF cache stats", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    const stats = await caller.admin.resourceAccess.officialPdfCacheStats({});

    expect(stats.totalProblemSets).toBe(3);
    expect(stats.cachedCount).toBe(1);
    expect(stats.failedCount).toBe(1);
    expect(stats.missingCount).toBe(1);
    expect(stats.generatableCount).toBe(2);
    expect(stats.needsGenerationCount).toBe(1);
    expect(stats.noProblemCount).toBe(1);
    expect(stats.coveragePercent).toBeCloseTo(33.33, 2);
    expect(stats.breakdown.byContest.find((row) => row.contest === "AIME")?.cached).toBe(1);
  });

  it("generates PDF from stored problems and persists cache metadata", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(generateAndCacheProblemSetPdf).mockResolvedValue({
      ok: true,
      problemSetId: "set_1",
      generatedProblemCount: 1,
      cache: {
        path: "/tmp/official-pdfs/set_1.pdf",
        size: 9,
        sha256: "a".repeat(64)
      },
      pdfBytes: Buffer.from("%PDF-FAKE", "ascii"),
      problemSet: {
        ...mock.problemSets[0]!,
        cachedPdfPath: "/tmp/official-pdfs/set_1.pdf",
        cachedPdfSha256: "a".repeat(64),
        cachedPdfSize: 9,
        cachedPdfStatus: "CACHED",
        cachedPdfError: null
      }
    });

    const result = await caller.admin.resourceAccess.generatePdfFromProblems({
      problemSetId: "set_1",
      force: true
    });

    expect(result.ok).toBe(true);
    expect(result.generatedProblemCount).toBe(1);
    expect(result.problemSet.cachedPdfStatus).toBe("CACHED");
    expect(result.problemSet.cachedPdfPath).toBe("/tmp/official-pdfs/set_1.pdf");
    expect(generateAndCacheProblemSetPdf).toHaveBeenCalledWith({
      prisma: mock.prisma,
      problemSetId: "set_1",
      force: true
    });
  });

  it("returns error and marks metadata when generation source is missing", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(generateAndCacheProblemSetPdf).mockResolvedValue({
      ok: false,
      problemSetId: "set_2",
      category: "missing-generation-source",
      message: "missing-generation-source: no problems found for this set."
    });

    await expect(
      caller.admin.resourceAccess.generatePdfFromProblems({
        problemSetId: "set_2"
      })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("runs batch generated backfill and returns summary", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(runGeneratedPdfBackfill).mockResolvedValue({
      scanned: 12,
      generated_cached: 8,
      skipped_already_cached: 2,
      skipped_no_problems: 1,
      render_failed: 1,
      cache_failed: 0,
      aborted: false
    });

    const summary = await caller.admin.resourceAccess.backfillGeneratedPdfs({
      contest: "AMC12",
      yearFrom: 2010,
      yearTo: 2025,
      limit: 20,
      dryRun: true
    });

    expect(summary.scanned).toBe(12);
    expect(summary.generated_cached).toBe(8);
    expect(runGeneratedPdfBackfill).toHaveBeenCalledWith({
      prisma: mock.prisma,
      options: expect.objectContaining({
        contest: "AMC12",
        yearFrom: 2010,
        yearTo: 2025,
        limit: 20,
        dryRun: true
      })
    });
  });

  it("surfaces batch generation runner failures with stable prefix", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("ADMIN"),
      prisma: mock.prisma as never
    });

    vi.mocked(runGeneratedPdfBackfill).mockRejectedValue(new Error("db timeout"));

    await expect(
      caller.admin.resourceAccess.backfillGeneratedPdfs({
        dryRun: false
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("backfill-generated-failed: db timeout")
    });
  });

  it("blocks non-admin users", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession("STUDENT"),
      prisma: mock.prisma as never
    });

    await expect(caller.admin.resourceAccess.lookupUser({ email: "student@example.com" })).rejects.toBeInstanceOf(
      TRPCError
    );
  });
});

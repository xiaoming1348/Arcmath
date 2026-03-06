import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAndCacheProblemSetPdf } from "@/lib/problem-set-pdf-generation";
import { cacheOfficialPdfBytes } from "@/lib/official-pdf-cache";
import { renderProblemSetPdf } from "@/lib/generated-problem-set-pdf";

vi.mock("@/lib/official-pdf-cache", () => ({
  cacheOfficialPdfBytes: vi.fn()
}));

vi.mock("@/lib/generated-problem-set-pdf", () => ({
  renderProblemSetPdf: vi.fn()
}));

function createPrismaMock(input?: { problems?: Array<{ number: number; statement: string | null; choices: unknown; answer: string | null }> }) {
  const problemSet = {
    id: "set_1",
    title: "AMC 10A 2025",
    contest: "AMC10" as const,
    year: 2025,
    exam: "A",
    sourceUrl: null,
    verifiedPdfUrl: null,
    cachedPdfPath: null,
    cachedPdfSha256: null,
    cachedPdfSize: null,
    cachedPdfAt: null,
    cachedPdfStatus: null,
    cachedPdfError: null
  };
  const problems =
    input?.problems ??
    [
      {
        number: 1,
        statement: "What is 1+1?",
        choices: ["1", "2", "3", "4", "5"],
        answer: "B"
      }
    ];

  return {
    problemSet,
    prisma: {
      problemSet: {
        findUnique: vi.fn(async () => problemSet),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          Object.assign(problemSet, args.data);
          return problemSet;
        })
      },
      problem: {
        findMany: vi.fn(async () => problems)
      }
    }
  };
}

describe("generateAndCacheProblemSetPdf", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success with cache metadata and persists CACHED status", async () => {
    const mock = createPrismaMock();
    vi.mocked(renderProblemSetPdf).mockResolvedValue(Buffer.from("%PDF-FAKE", "ascii"));
    vi.mocked(cacheOfficialPdfBytes).mockResolvedValue({
      path: "/tmp/official-pdfs/set_1.pdf",
      size: 9,
      sha256: "a".repeat(64)
    });

    const result = await generateAndCacheProblemSetPdf({
      prisma: mock.prisma as never,
      problemSetId: "set_1"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.generatedProblemCount).toBe(1);
    expect(result.cache?.path).toBe("/tmp/official-pdfs/set_1.pdf");
    expect(mock.problemSet.cachedPdfStatus).toBe("CACHED");
    expect(mock.problemSet.cachedPdfError).toBeNull();
    expect(renderProblemSetPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "problems"
      })
    );
  });

  it("uses deterministic answers cache key without mutating problems cache metadata", async () => {
    const mock = createPrismaMock();
    vi.mocked(renderProblemSetPdf).mockResolvedValue(Buffer.from("%PDF-FAKE", "ascii"));
    vi.mocked(cacheOfficialPdfBytes).mockResolvedValue({
      path: "/tmp/official-pdfs/set_1_answers.pdf",
      size: 9,
      sha256: "b".repeat(64)
    });

    const result = await generateAndCacheProblemSetPdf({
      prisma: mock.prisma as never,
      problemSetId: "set_1",
      variant: "answers"
    });

    expect(result.ok).toBe(true);
    expect(cacheOfficialPdfBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        problemSetId: "set_1.answers"
      })
    );
    expect(mock.problemSet.cachedPdfPath).toBeNull();
    expect(mock.problemSet.cachedPdfStatus).toBeNull();
  });

  it("returns MISSING when no problems exist", async () => {
    const mock = createPrismaMock({ problems: [] });

    const result = await generateAndCacheProblemSetPdf({
      prisma: mock.prisma as never,
      problemSetId: "set_1"
    });

    expect(result).toMatchObject({
      ok: false,
      category: "missing-generation-source"
    });
    expect(mock.problemSet.cachedPdfStatus).toBe("MISSING");
    expect(mock.problemSet.cachedPdfError).toContain("missing-generation-source");
  });

  it("returns FAILED when renderer throws", async () => {
    const mock = createPrismaMock();
    vi.mocked(renderProblemSetPdf).mockRejectedValue(new Error("renderer boom"));

    const result = await generateAndCacheProblemSetPdf({
      prisma: mock.prisma as never,
      problemSetId: "set_1"
    });

    expect(result).toMatchObject({
      ok: false,
      category: "render-failed"
    });
    expect(mock.problemSet.cachedPdfStatus).toBe("FAILED");
    expect(mock.problemSet.cachedPdfError).toContain("render-failed");
  });

  it("returns FAILED when cache layer throws", async () => {
    const mock = createPrismaMock();
    vi.mocked(renderProblemSetPdf).mockResolvedValue(Buffer.from("%PDF-FAKE", "ascii"));
    vi.mocked(cacheOfficialPdfBytes).mockRejectedValue(new Error("cache down"));

    const result = await generateAndCacheProblemSetPdf({
      prisma: mock.prisma as never,
      problemSetId: "set_1"
    });

    expect(result).toMatchObject({
      ok: false,
      category: "cache-failed"
    });
    expect(mock.problemSet.cachedPdfStatus).toBe("FAILED");
    expect(mock.problemSet.cachedPdfError).toContain("cache-failed");
  });
});

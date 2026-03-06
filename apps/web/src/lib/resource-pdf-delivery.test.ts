import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resource-access", () => ({
  consumeResourceAccessDecision: vi.fn()
}));

vi.mock("@/lib/official-pdf-cache", () => ({
  getCachedOfficialPdfDownload: vi.fn()
}));

vi.mock("@/lib/problem-set-pdf-generation", () => ({
  getProblemSetPdfCacheKey: (problemSetId: string, variant: "problems" | "answers") =>
    variant === "answers" ? `${problemSetId}.answers` : problemSetId,
  generateAndCacheProblemSetPdf: vi.fn()
}));

import { consumeResourceAccessDecision } from "@/lib/resource-access";
import { getCachedOfficialPdfDownload } from "@/lib/official-pdf-cache";
import { generateAndCacheProblemSetPdf } from "@/lib/problem-set-pdf-generation";
import { getResourcePdfResponse, parsePdfVariant } from "@/lib/resource-pdf-delivery";

function createPrismaMock() {
  const problemSet = {
    id: "set_1",
    contest: "AMC10" as const,
    year: 2025,
    exam: "A",
    title: "AMC 10A 2025",
    cachedPdfPath: "/tmp/official-pdfs/set_1.pdf"
  };

  return {
    problemSet,
    prisma: {
      problemSet: {
        findUnique: vi.fn(async () => problemSet)
      }
    }
  };
}

describe("resource-pdf-delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(consumeResourceAccessDecision).mockResolvedValue({
      allowed: true,
      used: 0,
      freeLimit: 3
    } as never);
  });

  it("parses variants safely", () => {
    expect(parsePdfVariant("answers")).toBe("answers");
    expect(parsePdfVariant("problems")).toBe("problems");
    expect(parsePdfVariant("unknown")).toBe("problems");
    expect(parsePdfVariant(null)).toBe("problems");
  });

  it("returns cached response when available", async () => {
    const mock = createPrismaMock();
    vi.mocked(getCachedOfficialPdfDownload).mockResolvedValue({
      type: "response",
      locator: "/tmp/official-pdfs/set_1.pdf",
      response: new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 200,
        headers: { "content-type": "application/pdf" }
      }) as never
    });

    const response = await getResourcePdfResponse({
      prisma: mock.prisma as never,
      userId: "u1",
      hasMembership: true,
      problemSetId: "set_1",
      variant: "problems"
    });

    expect(response.status).toBe(200);
    expect(generateAndCacheProblemSetPdf).not.toHaveBeenCalled();
  });

  it("generates variant on cache miss", async () => {
    const mock = createPrismaMock();
    vi.mocked(getCachedOfficialPdfDownload).mockResolvedValue(null);
    vi.mocked(generateAndCacheProblemSetPdf).mockResolvedValue({
      ok: true,
      problemSetId: "set_1",
      generatedProblemCount: 1,
      cache: {
        path: "/tmp/official-pdfs/set_1_answers.pdf",
        size: 9,
        sha256: "a".repeat(64)
      },
      pdfBytes: Buffer.from("%PDF-FAKE", "ascii"),
      problemSet: {
        id: "set_1",
        title: "AMC 10A 2025",
        contest: "AMC10",
        year: 2025,
        exam: "A",
        sourceUrl: null,
        verifiedPdfUrl: null,
        cachedPdfPath: "/tmp/official-pdfs/set_1.pdf",
        cachedPdfSha256: null,
        cachedPdfSize: null,
        cachedPdfAt: null,
        cachedPdfStatus: null,
        cachedPdfError: null
      }
    });

    const response = await getResourcePdfResponse({
      prisma: mock.prisma as never,
      userId: "u1",
      hasMembership: true,
      problemSetId: "set_1",
      variant: "answers"
    });

    expect(response.status).toBe(200);
    expect(generateAndCacheProblemSetPdf).toHaveBeenCalledWith({
      prisma: mock.prisma,
      problemSetId: "set_1",
      variant: "answers"
    });
  });

  it("returns 409 when generation fails", async () => {
    const mock = createPrismaMock();
    vi.mocked(getCachedOfficialPdfDownload).mockResolvedValue(null);
    vi.mocked(generateAndCacheProblemSetPdf).mockResolvedValue({
      ok: false,
      problemSetId: "set_1",
      category: "render-failed",
      message: "render-failed: renderer boom"
    });

    const response = await getResourcePdfResponse({
      prisma: mock.prisma as never,
      userId: "u1",
      hasMembership: true,
      problemSetId: "set_1",
      variant: "answers"
    });

    expect(response.status).toBe(409);
  });
});

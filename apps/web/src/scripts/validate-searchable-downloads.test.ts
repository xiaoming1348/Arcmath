import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@arcmath/db", () => ({
  prisma: {}
}));

vi.mock("@/lib/resource-scope", () => ({
  getLastCompleteYearsWindow: vi.fn(() => ({ yearFrom: 2016, yearTo: 2025 })),
  listScopedDownloadableProblemSets: vi.fn()
}));

vi.mock("@/lib/resource-pdf-delivery", () => ({
  getResourcePdfResponse: vi.fn()
}));

vi.mock("./render-verify", () => ({
  expectedProblemCount: vi.fn(() => 25),
  extractTextWithGhostscript: vi.fn(async () => "Problem 1\nProblem 2"),
  verifyExtractedText: vi.fn(() => ({
    pdfPath: "/tmp/mock.pdf",
    pageCount: 1,
    detectedProblemMarkers: 25,
    texLeakCount: 0,
    hasNonWhitespaceLastPage: true,
    passed: true
  }))
}));

import { listScopedDownloadableProblemSets } from "@/lib/resource-scope";
import { getResourcePdfResponse } from "@/lib/resource-pdf-delivery";
import { verifyExtractedText } from "./render-verify";
import { runValidateSearchableDownloads } from "./validate-searchable-downloads";

describe("validate-searchable-downloads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyExtractedText).mockReturnValue({
      pdfPath: "/tmp/mock.pdf",
      pageCount: 1,
      detectedProblemMarkers: 25,
      texLeakCount: 0,
      hasNonWhitespaceLastPage: true,
      passed: true
    } as never);
  });

  it("passes when all searchable variants are downloadable", async () => {
    vi.mocked(listScopedDownloadableProblemSets).mockResolvedValue([
      {
        id: "set_1",
        title: "AMC 12A 2025",
        contest: "AMC12",
        year: 2025,
        exam: "A",
        sourceUrl: null,
        verifiedPdfUrl: null
      }
    ] as never);
    vi.mocked(getResourcePdfResponse).mockImplementation(async () =>
      new Response(Buffer.from("%PDF-1.7\nmock", "ascii"), {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      })
    );

    const outDir = await mkdtemp(path.join(os.tmpdir(), "validate-searchable-"));
    const summary = await runValidateSearchableDownloads({ outDir });

    expect(summary.passed).toBe(true);
    expect(summary.totalSearchableSets).toBe(1);
    expect(summary.totals.checkedVariants).toBe(2);
    expect(summary.failures).toHaveLength(0);
  });

  it("fails when route returns 409 for a searchable variant", async () => {
    vi.mocked(listScopedDownloadableProblemSets).mockResolvedValue([
      {
        id: "set_1",
        title: "AMC 10A 2025",
        contest: "AMC10",
        year: 2025,
        exam: "A",
        sourceUrl: null,
        verifiedPdfUrl: null
      }
    ] as never);

    vi.mocked(getResourcePdfResponse)
      .mockResolvedValueOnce(new Response(Buffer.from("%PDF-1.7\nmock", "ascii"), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status: 409 }));

    const outDir = await mkdtemp(path.join(os.tmpdir(), "validate-searchable-"));
    const summary = await runValidateSearchableDownloads({ outDir });

    expect(summary.passed).toBe(false);
    expect(summary.totals.routeFailures).toBe(1);
    expect(summary.failures[0]?.reason).toContain("route_status_409");
  });
});

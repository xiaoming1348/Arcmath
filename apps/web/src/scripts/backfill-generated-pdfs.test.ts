import { describe, expect, it, vi } from "vitest";
import type { Contest } from "@arcmath/db";
import { parseBackfillGeneratedArgs, runBackfillGenerated } from "./backfill-generated-pdfs";

type MockProblemSet = {
  id: string;
  title: string;
  contest: Contest;
  year: number;
  exam: string | null;
  cachedPdfStatus: string | null;
};

function makeSet(overrides: Partial<MockProblemSet> = {}): MockProblemSet {
  return {
    id: "set_1",
    title: "AMC 12A 2025",
    contest: "AMC12",
    year: 2025,
    exam: "A",
    cachedPdfStatus: null,
    ...overrides
  };
}

describe("backfill-generated-pdfs", () => {
  it("parses multi-contest and variant flags", () => {
    const parsed = parseBackfillGeneratedArgs([
      "--contest",
      "AMC10,AMC12",
      "--contest",
      "AIME",
      "--variant",
      "both",
      "--year-from",
      "2016",
      "--year-to",
      "2025"
    ]);

    expect(parsed.contests).toEqual(["AMC10", "AMC12", "AIME"]);
    expect(parsed.variant).toBe("both");
    expect(parsed.yearFrom).toBe(2016);
    expect(parsed.yearTo).toBe(2025);
  });

  it("generates and caches PDFs successfully", async () => {
    const updateCacheMetadata = vi.fn(async () => undefined);

    const summary = await runBackfillGenerated(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false
      },
      {
        listProblemSets: async () => [makeSet()],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata,
        generate: async () => ({
          ok: true,
          problemSetId: "set_1",
          generatedProblemCount: 1,
          cache: {
            path: "/tmp/official-pdfs/set_1.pdf",
            size: 13,
            sha256: "a".repeat(64)
          },
          pdfBytes: Buffer.from("%PDF-1.4\nstub", "ascii"),
          problemSet: {
            id: "set_1",
            title: "AMC 12A 2025",
            contest: "AMC12",
            year: 2025,
            exam: "A",
            sourceUrl: null,
            verifiedPdfUrl: null,
            cachedPdfPath: "/tmp/official-pdfs/set_1.pdf",
            cachedPdfSha256: "a".repeat(64),
            cachedPdfSize: 13,
            cachedPdfAt: new Date(),
            cachedPdfStatus: "CACHED",
            cachedPdfError: null
          }
        })
      }
    );

    expect(summary.generated_cached).toBe(1);
    expect(summary.render_failed).toBe(0);
    expect(summary.cache_failed).toBe(0);
    expect(updateCacheMetadata).not.toHaveBeenCalled();
  });

  it("marks sets with no problems as missing generation source", async () => {
    const summary = await runBackfillGenerated(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_empty" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async () => ({
          ok: false,
          problemSetId: "set_empty",
          category: "missing-generation-source",
          message: "missing-generation-source: no problems found for this set."
        })
      }
    );

    expect(summary.skipped_no_problems).toBe(1);
    expect(summary.generated_cached).toBe(0);
  });

  it("aborts early at max-errors threshold and continues when threshold allows", async () => {
    const failFast = await runBackfillGenerated(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false,
        maxErrors: 0
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_1" }), makeSet({ id: "set_2" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async () => ({
          ok: false,
          problemSetId: "set_1",
          category: "render-failed",
          message: "render-failed: renderer boom"
        })
      }
    );

    expect(failFast.render_failed).toBe(1);
    expect(failFast.scanned).toBe(1);
    expect(failFast.aborted).toBe(true);

    const continueRun = await runBackfillGenerated(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false,
        maxErrors: 5
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_1" }), makeSet({ id: "set_2" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async ({ problemSetId }) => ({
          ok: false,
          problemSetId,
          category: "render-failed",
          message: "render-failed: renderer boom"
        })
      }
    );

    expect(continueRun.render_failed).toBe(2);
    expect(continueRun.scanned).toBe(2);
    expect(continueRun.aborted).toBe(false);
  });

  it("counts cache-failed results separately", async () => {
    const summary = await runBackfillGenerated(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_cache_fail" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async () => ({
          ok: false,
          problemSetId: "set_cache_fail",
          category: "cache-failed",
          message: "cache-failed: write failed"
        })
      }
    );

    expect(summary.cache_failed).toBe(1);
    expect(summary.render_failed).toBe(0);
  });
});

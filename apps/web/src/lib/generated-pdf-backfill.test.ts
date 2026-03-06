import { describe, expect, it } from "vitest";
import type { Contest } from "@arcmath/db";
import {
  normalizeBackfillGeneratedOptions,
  runGeneratedPdfBackfill
} from "@/lib/generated-pdf-backfill";

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

describe("generated-pdf-backfill lib", () => {
  it("normalizes defaults", () => {
    expect(normalizeBackfillGeneratedOptions({})).toEqual({
      force: false,
      dryRun: false,
      retryFailedOnly: false,
      limit: undefined,
      contest: undefined,
      contests: undefined,
      yearFrom: undefined,
      yearTo: undefined,
      maxErrors: undefined,
      variant: "problems"
    });
  });

  it("counts successful generation results", async () => {
    const summary = await runGeneratedPdfBackfill({
      prisma: {} as never,
      options: normalizeBackfillGeneratedOptions({}),
      deps: {
        listProblemSets: async () => [makeSet()],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async () => ({
          ok: true,
          problemSetId: "set_1",
          generatedProblemCount: 1,
          cache: null,
          pdfBytes: Buffer.from("%PDF-FAKE", "ascii"),
          problemSet: {
            id: "set_1",
            title: "AMC 12A 2025",
            contest: "AMC12",
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
          }
        })
      }
    });

    expect(summary.generated_cached).toBe(1);
    expect(summary.generated_cached_problems).toBe(1);
    expect(summary.generated_cached_answers).toBe(0);
    expect(summary.scanned).toBe(1);
  });

  it("counts missing-generation-source failures", async () => {
    const summary = await runGeneratedPdfBackfill({
      prisma: {} as never,
      options: normalizeBackfillGeneratedOptions({}),
      deps: {
        listProblemSets: async () => [makeSet()],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async () => ({
          ok: false,
          problemSetId: "set_1",
          category: "missing-generation-source",
          message: "missing-generation-source: no problems found for this set."
        })
      }
    });

    expect(summary.skipped_no_problems).toBe(1);
    expect(summary.render_failed).toBe(0);
  });

  it("counts render/cache failures and aborts at max-errors", async () => {
    const summary = await runGeneratedPdfBackfill({
      prisma: {} as never,
      options: normalizeBackfillGeneratedOptions({ maxErrors: 0 }),
      deps: {
        listProblemSets: async () => [makeSet({ id: "set_1" }), makeSet({ id: "set_2" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async ({ problemSetId }) => ({
          ok: false,
          problemSetId,
          category: "cache-failed",
          message: "cache-failed: disk full"
        })
      }
    });

    expect(summary.cache_failed).toBe(1);
    expect(summary.aborted).toBe(true);
    expect(summary.scanned).toBe(1);
  });

  it("supports variant=both and tracks per-variant generated counters", async () => {
    const summary = await runGeneratedPdfBackfill({
      prisma: {} as never,
      options: normalizeBackfillGeneratedOptions({ variant: "both" }),
      deps: {
        listProblemSets: async () => [makeSet()],
        hasCached: async (_id, variant) => variant === "problems",
        readCachedMetadata: async () => null,
        updateCacheMetadata: async () => undefined,
        generate: async ({ variant }) => ({
          ok: true,
          problemSetId: "set_1",
          generatedProblemCount: 1,
          cache: null,
          pdfBytes: Buffer.from("%PDF-FAKE", "ascii"),
          problemSet: {
            id: "set_1",
            title: "AMC 12A 2025",
            contest: "AMC12",
            year: 2025,
            exam: "A",
            sourceUrl: null,
            verifiedPdfUrl: null,
            cachedPdfPath: null,
            cachedPdfSha256: null,
            cachedPdfSize: null,
            cachedPdfAt: null,
            cachedPdfStatus: variant === "problems" ? "CACHED" : null,
            cachedPdfError: null
          }
        })
      }
    });

    expect(summary.scanned).toBe(1);
    expect(summary.skipped_already_cached).toBe(1);
    expect(summary.generated_cached).toBe(1);
    expect(summary.generated_cached_problems).toBe(0);
    expect(summary.generated_cached_answers).toBe(1);
  });
});

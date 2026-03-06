import { describe, expect, it, vi } from "vitest";
import type { Contest } from "@arcmath/db";
import {
  applyBackfillOutcome,
  buildBackfillWhere,
  createBackfillSummary,
  hasBackfillFailures,
  parseBackfillArgs,
  runBackfill
} from "./backfill-official-pdfs";

type MockProblemSet = {
  id: string;
  title: string;
  contest: Contest;
  year: number;
  exam: string | null;
  sourceUrl: string | null;
  verifiedPdfUrl: string | null;
  cachedPdfStatus: string | null;
};

function makeSet(overrides: Partial<MockProblemSet> = {}): MockProblemSet {
  return {
    id: "set_1",
    title: "AMC 12A 2025",
    contest: "AMC12",
    year: 2025,
    exam: "A",
    sourceUrl: "https://example.com/source",
    verifiedPdfUrl: null,
    cachedPdfStatus: null,
    ...overrides
  };
}

describe("backfill-official-pdfs helpers", () => {
  it("parses CLI flags including retry-failed-only and max-errors", () => {
    const options = parseBackfillArgs([
      "--limit",
      "50",
      "--contest",
      "amc12",
      "--year-from",
      "2005",
      "--year-to",
      "2020",
      "--retry-failed-only",
      "--max-errors",
      "10",
      "--force",
      "--dry-run"
    ]);

    expect(options).toEqual({
      limit: 50,
      contest: "AMC12",
      yearFrom: 2005,
      yearTo: 2020,
      retryFailedOnly: true,
      maxErrors: 10,
      force: true,
      dryRun: true
    });
  });

  it("builds prisma where filter from options", () => {
    const where = buildBackfillWhere({
      contest: "AIME",
      yearFrom: 2010,
      yearTo: 2015,
      retryFailedOnly: true,
      force: false,
      dryRun: false
    });

    expect(where).toEqual({
      contest: "AIME",
      year: {
        gte: 2010,
        lte: 2015
      },
      cachedPdfStatus: "FAILED"
    });
  });

  it("updates summary counters and failure detection", () => {
    const summary = createBackfillSummary();
    applyBackfillOutcome(summary, "cached");
    applyBackfillOutcome(summary, "updated_verified_url");
    applyBackfillOutcome(summary, "resolve_failed");

    expect(summary.cached).toBe(1);
    expect(summary.updated_verified_url).toBe(1);
    expect(summary.resolve_failed).toBe(1);
    expect(hasBackfillFailures(summary)).toBe(true);
  });

  it("writes cache metadata on successful backfill", async () => {
    const updateCacheMetadata = vi.fn(async () => undefined);

    const summary = await runBackfill(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: false
      },
      {
        listProblemSets: async () => [makeSet()],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        validate: async () => true,
        resolve: async () => ({ pdfUrl: "https://example.com/file.pdf" }),
        updateVerifiedUrl: async () => undefined,
        updateCacheMetadata,
        cachePdf: async () => ({
          path: "/tmp/official-pdfs/set_1.pdf",
          size: 1234,
          sha256: "a".repeat(64)
        })
      }
    );

    expect(summary.cached).toBe(1);
    expect(updateCacheMetadata).toHaveBeenCalledWith(
      "set_1",
      expect.objectContaining({
        status: "CACHED",
        path: "/tmp/official-pdfs/set_1.pdf",
        size: 1234,
        sha256: "a".repeat(64),
        error: null
      })
    );
  });

  it("records failure metadata and aborts when max-errors is exceeded", async () => {
    const updateCacheMetadata = vi.fn(async () => undefined);

    const summary = await runBackfill(
      {
        dryRun: false,
        force: false,
        retryFailedOnly: true,
        maxErrors: 0
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_fail_1" }), makeSet({ id: "set_fail_2" })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        validate: async () => true,
        resolve: async () => ({ pdfUrl: null }),
        updateVerifiedUrl: async () => undefined,
        updateCacheMetadata,
        cachePdf: async () => ({
          path: "/tmp/official-pdfs/unused.pdf",
          size: 1,
          sha256: "b".repeat(64)
        })
      }
    );

    expect(summary.resolve_failed).toBe(1);
    expect(summary.aborted).toBe(true);
    expect(summary.scanned).toBe(1);
    expect(updateCacheMetadata).toHaveBeenCalledWith(
      "set_fail_1",
      expect.objectContaining({
        status: "FAILED",
        error: "Could not resolve official PDF URL from sourceUrl."
      })
    );
  });

  it("keeps dry-run free of metadata writes", async () => {
    const updateCacheMetadata = vi.fn(async () => undefined);

    const summary = await runBackfill(
      {
        dryRun: true,
        force: false,
        retryFailedOnly: false
      },
      {
        listProblemSets: async () => [makeSet({ id: "set_missing", sourceUrl: null })],
        hasCached: async () => false,
        readCachedMetadata: async () => null,
        validate: async () => true,
        resolve: async () => ({ pdfUrl: null }),
        updateVerifiedUrl: async () => undefined,
        updateCacheMetadata,
        cachePdf: async () => ({
          path: "/tmp/official-pdfs/unused.pdf",
          size: 1,
          sha256: "c".repeat(64)
        })
      }
    );

    expect(summary.skipped_no_source).toBe(1);
    expect(updateCacheMetadata).not.toHaveBeenCalled();
  });
});

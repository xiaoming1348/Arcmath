import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredDailyQuota,
  getOcrQuotaStatus,
  OcrQuotaExceededError,
  pickTopConfidenceMulti,
  pickTopConfidenceSingle,
  requireOcrQuota
} from "./ocr-quota";

const ORIGINAL_QUOTA = process.env.OCR_DAILY_QUOTA;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_QUOTA === undefined) delete process.env.OCR_DAILY_QUOTA;
  else process.env.OCR_DAILY_QUOTA = ORIGINAL_QUOTA;
});

describe("getConfiguredDailyQuota", () => {
  beforeEach(() => {
    delete process.env.OCR_DAILY_QUOTA;
  });

  it("returns the default when OCR_DAILY_QUOTA is unset", () => {
    expect(getConfiguredDailyQuota()).toBe(50);
  });

  it("parses a valid env value", () => {
    process.env.OCR_DAILY_QUOTA = "25";
    expect(getConfiguredDailyQuota()).toBe(25);
  });

  it("clamps absurdly large values to ABSOLUTE_MAX_QUOTA (500)", () => {
    process.env.OCR_DAILY_QUOTA = "99999";
    expect(getConfiguredDailyQuota()).toBe(500);
  });

  it("falls back to default on garbage values", () => {
    process.env.OCR_DAILY_QUOTA = "abc";
    expect(getConfiguredDailyQuota()).toBe(50);

    process.env.OCR_DAILY_QUOTA = "0";
    expect(getConfiguredDailyQuota()).toBe(50);

    process.env.OCR_DAILY_QUOTA = "-7";
    expect(getConfiguredDailyQuota()).toBe(50);
  });
});

describe("getOcrQuotaStatus", () => {
  beforeEach(() => {
    process.env.OCR_DAILY_QUOTA = "10";
  });

  function makePrisma(countToReturn: number) {
    return {
      ocrCallLog: {
        count: vi.fn(async () => countToReturn)
      }
    } as unknown as Parameters<typeof getOcrQuotaStatus>[0]["prisma"];
  }

  it("reports allowed=true when usage is below the limit", async () => {
    const prisma = makePrisma(3);
    const status = await getOcrQuotaStatus({ prisma, userId: "u1" });
    expect(status).toMatchObject({
      used: 3,
      limit: 10,
      allowed: true
    });
    expect(typeof status.resetsAtIso).toBe("string");
    // Reset is at a UTC midnight: ends with "T00:00:00.000Z" or "T..."
    // depending on implementation, just sanity-check it's an ISO string.
    expect(new Date(status.resetsAtIso).getTime()).not.toBeNaN();
  });

  it("reports allowed=false at the limit and beyond", async () => {
    const atLimit = await getOcrQuotaStatus({
      prisma: makePrisma(10),
      userId: "u1"
    });
    expect(atLimit.allowed).toBe(false);

    const overLimit = await getOcrQuotaStatus({
      prisma: makePrisma(11),
      userId: "u1"
    });
    expect(overLimit.allowed).toBe(false);
  });

  it("computes a UTC-day-bounded count window", async () => {
    const countSpy = vi.fn(async () => 0);
    const prisma = {
      ocrCallLog: { count: countSpy }
    } as unknown as Parameters<typeof getOcrQuotaStatus>[0]["prisma"];
    // Pick a fixed "now" so we can assert on the boundary value.
    const fakeNow = new Date("2026-05-26T15:32:00Z");
    await getOcrQuotaStatus({ prisma, userId: "u1", now: fakeNow });
    expect(countSpy).toHaveBeenCalledOnce();
    const args = countSpy.mock.calls[0][0] as {
      where: { userId: string; createdAt: { gte: Date } };
    };
    expect(args.where.userId).toBe("u1");
    expect(args.where.createdAt.gte.toISOString()).toBe(
      "2026-05-26T00:00:00.000Z"
    );
  });
});

describe("requireOcrQuota", () => {
  it("returns the status when within limit", async () => {
    process.env.OCR_DAILY_QUOTA = "10";
    const prisma = {
      ocrCallLog: { count: vi.fn(async () => 4) }
    } as unknown as Parameters<typeof requireOcrQuota>[0]["prisma"];
    const status = await requireOcrQuota({ prisma, userId: "u1" });
    expect(status.allowed).toBe(true);
    expect(status.used).toBe(4);
  });

  it("throws OcrQuotaExceededError when at or over the limit", async () => {
    process.env.OCR_DAILY_QUOTA = "10";
    const prisma = {
      ocrCallLog: { count: vi.fn(async () => 10) }
    } as unknown as Parameters<typeof requireOcrQuota>[0]["prisma"];
    await expect(
      requireOcrQuota({ prisma, userId: "u1" })
    ).rejects.toBeInstanceOf(OcrQuotaExceededError);

    try {
      await requireOcrQuota({ prisma, userId: "u1" });
    } catch (err) {
      expect(err).toBeInstanceOf(OcrQuotaExceededError);
      if (err instanceof OcrQuotaExceededError) {
        expect(err.used).toBe(10);
        expect(err.limit).toBe(10);
        expect(typeof err.resetsAtIso).toBe("string");
      }
    }
  });
});

describe("pickTopConfidence helpers", () => {
  it("returns null for null single-step result", () => {
    expect(pickTopConfidenceSingle(null)).toBeNull();
  });

  it("returns the confidence field for a single-step result", () => {
    expect(
      pickTopConfidenceSingle({ latex: "x", confidence: "medium", notes: null })
    ).toBe("medium");
  });

  it("returns null for null multi-step result", () => {
    expect(pickTopConfidenceMulti(null)).toBeNull();
  });

  it("returns 'none' for an empty multi-step result", () => {
    expect(pickTopConfidenceMulti({ steps: [], imageNotes: null })).toBe("none");
  });

  it("returns the best confidence among multi-step entries", () => {
    expect(
      pickTopConfidenceMulti({
        steps: [
          { stepNumber: 1, latex: "a", confidence: "low", notes: null },
          { stepNumber: 2, latex: "b", confidence: "high", notes: null },
          { stepNumber: 3, latex: "c", confidence: "medium", notes: null }
        ],
        imageNotes: null
      })
    ).toBe("high");
  });
});

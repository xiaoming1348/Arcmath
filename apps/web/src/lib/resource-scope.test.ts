import { describe, expect, it } from "vitest";
import {
  createExamOptionsByContest,
  createYearsByContest,
  getAllowedExamsForContest,
  getLastCompleteYearsWindow,
  isValidContestExamPair,
  normalizeExamInput,
  type ResourceScopeRow
} from "@/lib/resource-scope";

describe("resource-scope", () => {
  it("computes last 10 complete years dynamically", () => {
    const window = getLastCompleteYearsWindow(new Date("2026-03-05T00:00:00.000Z"));
    expect(window).toEqual({
      yearFrom: 2016,
      yearTo: 2025
    });
  });

  it("enforces valid contest/exam pairs", () => {
    expect(isValidContestExamPair("AMC8", null)).toBe(true);
    expect(isValidContestExamPair("AMC8", "A")).toBe(false);
    expect(isValidContestExamPair("AMC10", "A")).toBe(true);
    expect(isValidContestExamPair("AMC10", "II")).toBe(false);
    expect(isValidContestExamPair("AIME", "I")).toBe(true);
    expect(isValidContestExamPair("AIME", "B")).toBe(false);
  });

  it("builds contest-specific exam and year options from scoped rows", () => {
    const rows: ResourceScopeRow[] = [
      {
        id: "s1",
        title: "AMC 10A 2025",
        contest: "AMC10",
        year: 2025,
        exam: "A",
        sourceUrl: null,
        verifiedPdfUrl: null
      },
      {
        id: "s2",
        title: "AMC 10B 2024",
        contest: "AMC10",
        year: 2024,
        exam: "B",
        sourceUrl: null,
        verifiedPdfUrl: null
      },
      {
        id: "s3",
        title: "AIME I 2025",
        contest: "AIME",
        year: 2025,
        exam: "I",
        sourceUrl: null,
        verifiedPdfUrl: null
      }
    ];

    const exams = createExamOptionsByContest(rows);
    const years = createYearsByContest(rows);

    expect(exams.AMC8).toEqual([]);
    expect(exams.AMC10).toEqual(["A", "B"]);
    expect(exams.AMC12).toEqual([]);
    expect(exams.AIME).toEqual(["I"]);

    expect(years.AMC10).toEqual([2025, 2024]);
    expect(years.AIME).toEqual([2025]);
  });

  it("normalizes exam input and allowed contest exam values", () => {
    expect(normalizeExamInput("  a ")).toBe("A");
    expect(normalizeExamInput("   ")).toBeNull();
    expect(normalizeExamInput(undefined)).toBeNull();
    expect(getAllowedExamsForContest("AMC8")).toEqual([]);
    expect(getAllowedExamsForContest("AMC12")).toEqual(["A", "B"]);
    expect(getAllowedExamsForContest("AIME")).toEqual(["I", "II"]);
  });
});

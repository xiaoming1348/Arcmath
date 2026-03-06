import { describe, expect, it } from "vitest";
import {
  countProblemMarkers,
  countTexLeakage,
  expectedProblemCount,
  parseRenderVerifyArgs,
  splitExtractedPages,
  verifyExtractedText
} from "./render-verify";

describe("render-verify arg parsing", () => {
  it("parses AMC12 arguments", () => {
    const parsed = parseRenderVerifyArgs([
      "--contest",
      "AMC12",
      "--year",
      "2025",
      "--exam",
      "A",
      "--out-dir",
      "tmp/pdf-verify"
    ]);

    expect(parsed).toEqual({
      contest: "AMC12",
      year: 2025,
      exam: "A",
      outDir: "tmp/pdf-verify"
    });
  });

  it("forces AMC8 exam to null", () => {
    const parsed = parseRenderVerifyArgs([
      "--contest",
      "AMC8",
      "--year",
      "2025",
      "--exam",
      "A",
      "--out-dir",
      "tmp/pdf-verify"
    ]);

    expect(parsed.exam).toBeNull();
  });

  it("throws for missing exam on AMC12", () => {
    expect(() =>
      parseRenderVerifyArgs(["--contest", "AMC12", "--year", "2025", "--out-dir", "tmp/pdf-verify"])
    ).toThrow("--exam is required");
  });
});

describe("render-verify checks", () => {
  it("counts markers and TeX leakage", () => {
    const text = "Problem 1\nProblem 2\n\\frac{1}{2} and $x$";

    expect(countProblemMarkers(text)).toBe(2);
    expect(countTexLeakage(text)).toBe(3);
  });

  it("splits extracted pages and trims trailing form-feed page", () => {
    const pages = splitExtractedPages("Page one\fPage two\f");
    expect(pages).toEqual(["Page one", "Page two"]);
  });

  it("passes verification when markers are sufficient and last page is non-empty", () => {
    const result = verifyExtractedText({
      text: "Problem 1\nProblem 2\fProblem 3",
      expectedMarkers: 3,
      texLeakThreshold: 0,
      pdfPath: "/tmp/paper.pdf"
    });

    expect(result.passed).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.hasNonWhitespaceLastPage).toBe(true);
  });

  it("fails verification when TeX leakage exceeds threshold or last page is blank", () => {
    const result = verifyExtractedText({
      text: "Problem 1\n\\frac{1}{2}\f   ",
      expectedMarkers: 1,
      texLeakThreshold: 0,
      pdfPath: "/tmp/paper.pdf"
    });

    expect(result.passed).toBe(false);
    expect(result.texLeakCount).toBeGreaterThan(0);
    expect(result.hasNonWhitespaceLastPage).toBe(false);
  });

  it("returns expected marker count by contest", () => {
    expect(expectedProblemCount("AIME")).toBe(15);
    expect(expectedProblemCount("AMC12")).toBe(25);
  });
});

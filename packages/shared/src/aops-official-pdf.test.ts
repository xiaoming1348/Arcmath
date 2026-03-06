import { describe, expect, it } from "vitest";
import {
  buildAoPSWikiCandidateUrlsFromSource,
  checkAoPSOfficialPdfIdentity,
  extractAoPSOfficialPdfUrlFromHtml,
  normalizeAoPSOfficialPdfUrl
} from "./aops-official-pdf";

describe("AoPS official PDF shared helpers", () => {
  it("extracts and normalizes official AoPS PDF links", () => {
    const html = `
      <a href="/community/contest/download/c3414_amc_10/2023">PDF</a>
      <a href="https://example.com/not-aops.pdf">Else</a>
    `;

    expect(extractAoPSOfficialPdfUrlFromHtml(html)).toBe(
      "https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2023"
    );

    expect(normalizeAoPSOfficialPdfUrl("https://example.com/file.pdf")).toBeNull();
  });

  it("builds wiki candidates from source urls", () => {
    const candidates = buildAoPSWikiCandidateUrlsFromSource(
      "https://artofproblemsolving.com/wiki/index.php?title=2023_AMC_10A"
    );

    expect(candidates.some((url) => url.includes("title=2023_AMC_10A"))).toBe(true);
    expect(candidates.some((url) => url.includes("title=2023_AMC_10A_Problems"))).toBe(true);
  });

  it("passes strict identity check when contest/year match and exam is in reference tokens", () => {
    const result = checkAoPSOfficialPdfIdentity({
      contest: "AMC10",
      year: 2023,
      exam: "A",
      pdfUrl: "https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2023",
      references: ["https://artofproblemsolving.com/wiki/index.php?title=2023_AMC_10A_Problems"]
    });

    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails strict identity check on mismatch", () => {
    const result = checkAoPSOfficialPdfIdentity({
      contest: "AMC12",
      year: 2024,
      exam: "B",
      pdfUrl: "https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2023",
      references: ["https://artofproblemsolving.com/wiki/index.php?title=2023_AMC_10A"]
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

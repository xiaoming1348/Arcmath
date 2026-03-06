import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAoPSPdfUrlFromSource } from "@/lib/aops-pdf";

describe("aops pdf resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves by trying the _Problems page when base page has no direct pdf link", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("title=2023_AMC_10A_Problems")) {
        return new Response(
          `<a href="https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2023">PDF</a>`,
          { status: 200 }
        );
      }
      return new Response("<html>No PDF here</html>", { status: 200 });
    });

    const result = await resolveAoPSPdfUrlFromSource(
      "https://artofproblemsolving.com/wiki/index.php?title=2023_AMC_10A"
    );

    expect(result.pdfUrl).toBe("https://artofproblemsolving.com/community/contest/download/c3414_amc_10/2023");
    expect(result.discoveredFrom).toContain("title=2023_AMC_10A_Problems");
    expect(fetchSpy).toHaveBeenCalled();
  });
});

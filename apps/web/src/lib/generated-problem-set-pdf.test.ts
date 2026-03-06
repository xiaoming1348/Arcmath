import { beforeEach, describe, expect, it, vi } from "vitest";

const playwrightMockState = {
  html: "",
  pdfOptions: undefined as Record<string, unknown> | undefined
};

vi.mock("playwright", () => {
  return {
    chromium: {
      launch: vi.fn(async () => {
        return {
          newPage: vi.fn(async () => {
            return {
              setContent: vi.fn(async (html: string) => {
                playwrightMockState.html = html;
              }),
              waitForLoadState: vi.fn(async () => undefined),
              evaluate: vi.fn(async () => undefined),
              pdf: vi.fn(async (options: Record<string, unknown>) => {
                playwrightMockState.pdfOptions = options;
                return Buffer.from("%PDF-1.7 mock", "ascii");
              })
            };
          }),
          close: vi.fn(async () => undefined)
        };
      })
    }
  };
});

import {
  normalizeMathText,
  renderProblemSetPdf,
  sanitizeProblemForRender,
  sanitizeProblemStatement
} from "./generated-problem-set-pdf";

describe("generated-problem-set-pdf", () => {
  beforeEach(() => {
    playwrightMockState.html = "";
    playwrightMockState.pdfOptions = undefined;
    vi.clearAllMocks();
  });

  it("sanitizes polluted statement text", () => {
    const statement = sanitizeProblemStatement(
      "Problem text line.\n\nSolution: this should be removed\n~user signature\nminor edits by foo"
    );

    expect(statement).toBe("Problem text line.");
  });

  it("extracts inline choices when explicit choices are missing", () => {
    const sanitized = sanitizeProblemForRender({
      number: 1,
      statement: "Find x. (A) 1 (B) 2 (C) 3 (D) 4 (E) 5",
      choices: null,
      answer: "C"
    });

    expect(sanitized.statement).toContain("Find x");
    expect(sanitized.choices).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("normalizes common TeX fragments into readable text", () => {
    const normalized = normalizeMathText(
      String.raw`$\frac{a}{b} + \sqrt{x} \cdot y \le z \neq \pi$`
    );

    expect(normalized).toContain("(a)/(b)");
    expect(normalized).toContain("sqrt(x)");
    expect(normalized).toContain("·");
    expect(normalized).toContain("≤");
    expect(normalized).toContain("≠");
    expect(normalized).not.toContain("\\frac");
    expect(normalized).not.toContain("$");
  });

  it("renders problems variant with AoPS-style problem headings and no answer-key section", async () => {
    const pdf = await renderProblemSetPdf({
      contest: "AMC12",
      year: 2025,
      exam: "A",
      title: "AMC 12A 2025",
      variant: "problems",
      problems: [
        {
          number: 1,
          statement: "Compute $\\frac{1}{2}$.",
          choices: ["1", "2", "3", "4", "5"],
          answer: "A"
        }
      ]
    });

    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(playwrightMockState.html).toContain("Problem 1");
    expect(playwrightMockState.html).not.toContain("Answer Key");
    expect(playwrightMockState.html).toContain("tex-chtml.js");
    expect(playwrightMockState.pdfOptions).toMatchObject({
      format: "Letter",
      displayHeaderFooter: true,
      printBackground: true
    });
  });

  it("renders answers variant with answer rows and without problem statements", async () => {
    await renderProblemSetPdf({
      contest: "AMC10",
      year: 2025,
      exam: "B",
      title: "AMC 10B 2025",
      variant: "answers",
      problems: [
        {
          number: 1,
          statement: "This statement should not appear in answers variant.",
          choices: ["1", "2", "3", "4", "5"],
          answer: "D"
        }
      ]
    });

    expect(playwrightMockState.html).toContain("Answer Key");
    expect(playwrightMockState.html).toContain("Problem 1");
    expect(playwrightMockState.html).not.toContain("This statement should not appear in answers variant.");
  });

  it("keeps footer page numbering within configured margins", async () => {
    await renderProblemSetPdf({
      contest: "AMC8",
      year: 2025,
      exam: null,
      title: "AMC 8 2025",
      variant: "problems",
      problems: [
        {
          number: 1,
          statement: "What is 1 + 1?",
          choices: ["1", "2", "3", "4", "5"],
          answer: "B"
        }
      ]
    });

    expect(playwrightMockState.pdfOptions).toMatchObject({
      margin: {
        top: "0.7in",
        right: "0.7in",
        bottom: "0.75in",
        left: "0.7in"
      }
    });
  });
});

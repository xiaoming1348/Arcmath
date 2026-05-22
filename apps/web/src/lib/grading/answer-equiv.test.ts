import { describe, expect, it } from "vitest";
import { compareAnswers } from "@/lib/grading/answer-equiv";

describe("compareAnswers", () => {
  it("matches identical strings", () => {
    expect(compareAnswers("42", "42")).toBe("EQUAL");
  });

  it("normalizes whitespace and unicode minus", () => {
    expect(compareAnswers(" −3 ", "-3")).toBe("EQUAL");
  });

  it("treats × and * as the same multiplication symbol", () => {
    // Normalize maps × to *, so the strings collapse to the same form.
    expect(compareAnswers("2×3", "2*3")).toBe("EQUAL");
  });

  it("does not evaluate products beyond surface normalization", () => {
    // We don't compute 2*3 = 6; that's SymPy's job. Different surface
    // forms of the same value remain UNKNOWN so SymPy gets a turn.
    expect(compareAnswers("2*3", "6")).toBe("UNKNOWN");
  });

  it("matches \\frac{a}{b} with a/b for integers", () => {
    expect(compareAnswers("\\frac{3}{4}", "3/4")).toBe("EQUAL");
    expect(compareAnswers("\\dfrac{3}{4}", "3/4")).toBe("EQUAL");
    expect(compareAnswers("\\tfrac{3}{4}", "3/4")).toBe("EQUAL");
  });

  it("matches reduced and unreduced fractions", () => {
    expect(compareAnswers("6/8", "3/4")).toBe("EQUAL");
    expect(compareAnswers("\\frac{12}{16}", "3/4")).toBe("EQUAL");
  });

  it("matches decimal and rational equivalents", () => {
    expect(compareAnswers("0.5", "1/2")).toBe("EQUAL");
    expect(compareAnswers("1.5", "3/2")).toBe("EQUAL");
  });

  it("trims trailing zeros on decimals", () => {
    expect(compareAnswers("0.500", "0.5")).toBe("EQUAL");
    expect(compareAnswers("3.0", "3")).toBe("EQUAL");
  });

  it("flags clearly different rationals as DIFFERENT", () => {
    expect(compareAnswers("3/4", "4/5")).toBe("DIFFERENT");
    expect(compareAnswers("0.5", "0.6")).toBe("DIFFERENT");
  });

  it("returns UNKNOWN for forms it cannot decide (irrationals etc.)", () => {
    expect(compareAnswers("\\sqrt{2}", "sqrt(2)")).toBe("UNKNOWN");
    expect(compareAnswers("2\\sqrt{3}", "\\sqrt{12}")).toBe("UNKNOWN");
  });

  it("does not crash on empty / weird input", () => {
    expect(compareAnswers("", "")).toBe("EQUAL");
    expect(compareAnswers("???", "")).toBe("UNKNOWN");
  });
});

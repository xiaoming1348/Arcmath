import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProblemStatement, normalizeChoiceForDisplay, normalizeStatementForDisplay } from "@/components/problem-statement";

describe("ProblemStatement", () => {
  it("normalizes AoPS-style spacing around math punctuation", () => {
    const input =
      "In $\\triangle ABC$ , $AB=AC=28$ and $BC=20$ . What is the perimeter of parallelogram $ADEF$ ?";

    expect(normalizeStatementForDisplay(input)).toBe(
      "In $\\triangle ABC$, $AB=AC=28$ and $BC=20$. What is the perimeter of parallelogram $ADEF$?"
    );
  });

  it("renders markdown latex through the katex path", () => {
    const html = renderToStaticMarkup(
      <ProblemStatement statement={"In $\\triangle ABC$, $AB=AC=28$."} statementFormat="MARKDOWN_LATEX" />
    );

    expect(html).toContain("katex");
    expect(html).toContain("triangle");
  });

  it("wraps compact math choices for katex rendering", () => {
    expect(normalizeChoiceForDisplay("4sqrt(2)")).toBe("$4\\sqrt{2}$");
    expect(normalizeChoiceForDisplay("p<\\frac{1}{8}")).toBe("$p<\\frac{1}{8}$");
    expect(normalizeChoiceForDisplay("The mean increases by 1.")).toBe("The mean increases by 1.");
  });
});

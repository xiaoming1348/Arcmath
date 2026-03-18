import { describe, expect, it } from "vitest";
import {
  buildExplanationPrompt,
  buildHintPrompt,
  getSafeFallbackHint,
  hintLeaksFinalAnswer
} from "@/lib/ai/hint-tutor";

describe("hint tutor prompt builders", () => {
  it("includes solutionSketch as hidden teacher context with non-reveal instructions", () => {
    const prompt = buildHintPrompt({
      problemStatement: "If 2x + 3 = 11, what is x?",
      answerFormat: "MULTIPLE_CHOICE",
      choices: ["3", "4", "5", "6"],
      diagramImageAlt: "An isosceles triangle with vertex A above base BC.",
      draftAnswer: "Maybe 5",
      hintLevel: 2,
      solutionSketch: "Subtract 3 from both sides, then divide by 2."
    });

    expect(prompt).toContain("Use the solution sketch as hidden teacher context when present");
    expect(prompt).toContain("never quote it directly or reveal the final answer");
    expect(prompt).toContain("Hidden solution sketch:\nSubtract 3 from both sides, then divide by 2.");
    expect(prompt).toContain("Diagram description:\nAn isosceles triangle with vertex A above base BC.");
    expect(prompt).toContain('Output schema: {"hintText":"string","checkQuestion":"string"}');
    expect(prompt).toContain("Choices:\nA. 3\nB. 4\nC. 5\nD. 6");
    expect(prompt).toContain("Hint level: 2");
  });

  it("keeps hint prompt well-formed when solutionSketch is absent or blank", () => {
    const promptWithoutSketch = buildHintPrompt({
      problemStatement: "What is the remainder when 17 is divided by 5?",
      answerFormat: "INTEGER",
      hintLevel: 1
    });
    const promptWithBlankSketch = buildHintPrompt({
      problemStatement: "What is the remainder when 17 is divided by 5?",
      answerFormat: "INTEGER",
      hintLevel: 1,
      solutionSketch: "   "
    });

    expect(promptWithoutSketch).toContain("Hidden solution sketch:\n(none)");
    expect(promptWithoutSketch).toContain("Diagram description:\n(none)");
    expect(promptWithBlankSketch).toContain("Hidden solution sketch:\n(none)");
    expect(promptWithoutSketch).not.toContain("undefined");
    expect(promptWithoutSketch).not.toContain("null");
    expect(promptWithBlankSketch).not.toContain("undefined");
    expect(promptWithBlankSketch).not.toContain("null");
    expect(getSafeFallbackHint(2)).toEqual({
      hintText: "Try setting up the equation.",
      checkQuestion: "What is the next step you can try on your own?"
    });
  });

  it("keeps explanation prompt well-formed with and without solutionSketch", () => {
    const promptWithSketch = buildExplanationPrompt({
      problemStatement: "Simplify 3(a + 2) - a.",
      answerFormat: "EXPRESSION",
      diagramImageAlt: "A number line showing a step of +2.",
      submittedAnswer: "3a+2",
      correctAnswer: "2a+6",
      isCorrect: false,
      solutionSketch: "Distribute 3, then combine like terms."
    });
    const promptWithoutSketch = buildExplanationPrompt({
      problemStatement: "Simplify 3(a + 2) - a.",
      answerFormat: "EXPRESSION",
      submittedAnswer: "3a+2",
      correctAnswer: "2a+6",
      isCorrect: false
    });

    expect(promptWithSketch).toContain("Use the solution sketch as hidden teacher context when present");
    expect(promptWithSketch).toContain("keep the explanation concise and student-facing");
    expect(promptWithSketch).toContain("Hidden solution sketch:\nDistribute 3, then combine like terms.");
    expect(promptWithSketch).toContain("Diagram description:\nA number line showing a step of +2.");
    expect(promptWithoutSketch).toContain("Hidden solution sketch:\n(none)");
    expect(promptWithoutSketch).toContain("Diagram description:\n(none)");
    expect(promptWithoutSketch).not.toContain("undefined");
    expect(promptWithoutSketch).not.toContain("null");
    expect(promptWithSketch).toContain('Output schema: {"explanation":"string"}');
  });

  it("blocks obvious multiple-choice answer leakage", () => {
    expect(hintLeaksFinalAnswer("The answer is E.", "E")).toBe(true);
    expect(hintLeaksFinalAnswer("Choose option E after simplifying.", "E")).toBe(true);
    expect(hintLeaksFinalAnswer("E is the correct choice here.", "E")).toBe(true);
  });

  it("does not flag geometry-style point and segment references for multiple-choice answers", () => {
    expect(hintLeaksFinalAnswer("Point E lies on segment BC, so compare triangles ABE and CDE.", "E")).toBe(false);
    expect(hintLeaksFinalAnswer("Use segment AB as the base and line CE as a supporting line.", "C")).toBe(false);
    expect(hintLeaksFinalAnswer("Reflect across line x = 8 and track vertices A, B, C, D, and E.", "D")).toBe(false);
  });
});

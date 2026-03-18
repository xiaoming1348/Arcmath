import { describe, expect, it } from "vitest";
import { gradeAnswer } from "@/lib/answer-grading";

describe("gradeAnswer", () => {
  describe("multiple choice", () => {
    it("accepts matching choice labels", () => {
      const result = gradeAnswer({
        answerFormat: "MULTIPLE_CHOICE",
        submittedAnswer: "b",
        canonicalAnswer: "B",
        choices: ["3", "4", "5", "6"]
      });

      expect(result.normalizedSubmittedAnswer).toBe("B");
      expect(result.isCorrect).toBe(true);
    });

    it("accepts choice text when canonical answer is stored as a label", () => {
      const result = gradeAnswer({
        answerFormat: "MULTIPLE_CHOICE",
        submittedAnswer: "4",
        canonicalAnswer: "B",
        choices: ["3", "4", "5", "6"]
      });

      expect(result.normalizedSubmittedAnswer).toBe("B");
      expect(result.isCorrect).toBe(true);
    });

    it("accepts choice label when canonical answer is stored as choice text", () => {
      const result = gradeAnswer({
        answerFormat: "MULTIPLE_CHOICE",
        submittedAnswer: "C",
        canonicalAnswer: "3x+5",
        choices: ["x+5", "2x+5", "3x+5", "5x"]
      });

      expect(result.normalizedSubmittedAnswer).toBe("C");
      expect(result.isCorrect).toBe(true);
    });
  });

  describe("integer", () => {
    it("normalizes whitespace and leading zeros", () => {
      const result = gradeAnswer({
        answerFormat: "INTEGER",
        submittedAnswer: " 0042 ",
        canonicalAnswer: "42"
      });

      expect(result.normalizedSubmittedAnswer).toBe("42");
      expect(result.isCorrect).toBe(true);
    });

    it("normalizes commas and underscores", () => {
      const result = gradeAnswer({
        answerFormat: "INTEGER",
        submittedAnswer: "1_000",
        canonicalAnswer: "1,000"
      });

      expect(result.normalizedSubmittedAnswer).toBe("1000");
      expect(result.isCorrect).toBe(true);
    });

    it("rejects non-integer formatting", () => {
      const result = gradeAnswer({
        answerFormat: "INTEGER",
        submittedAnswer: "42.0",
        canonicalAnswer: "42"
      });

      expect(result.normalizedSubmittedAnswer).toBeNull();
      expect(result.isCorrect).toBe(false);
    });
  });

  describe("expression", () => {
    it("normalizes whitespace and casing conservatively", () => {
      const result = gradeAnswer({
        answerFormat: "EXPRESSION",
        submittedAnswer: " 2A + 6 ",
        canonicalAnswer: "2a+6"
      });

      expect(result.normalizedSubmittedAnswer).toBe("2a+6");
      expect(result.isCorrect).toBe(true);
    });

    it("normalizes outer parentheses", () => {
      const result = gradeAnswer({
        answerFormat: "EXPRESSION",
        submittedAnswer: "((x+1))",
        canonicalAnswer: "x+1"
      });

      expect(result.normalizedSubmittedAnswer).toBe("x+1");
      expect(result.isCorrect).toBe(true);
    });

    it("does not do symbolic equivalence", () => {
      const result = gradeAnswer({
        answerFormat: "EXPRESSION",
        submittedAnswer: "a+a+6",
        canonicalAnswer: "2a+6"
      });

      expect(result.isCorrect).toBe(false);
    });
  });
});

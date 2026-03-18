import { describe, expect, it } from "vitest";
import { importProblemSetSchema } from "./import-schema";

function makeProblem(number: number) {
  return {
    number,
    statement: `Problem ${number} statement`,
    statementFormat: "MARKDOWN_LATEX" as const,
    choices: ["1", "2", "3", "4", "5"],
    answer: "A",
    answerFormat: "MULTIPLE_CHOICE" as const
  };
}

function makeBasePayload() {
  return {
    problemSet: {
      contest: "AMC10" as const,
      year: 2022,
      exam: "a"
    },
    problems: Array.from({ length: 25 }, (_, index) => makeProblem(index + 1))
  };
}

describe("importProblemSetSchema", () => {
  it("normalizes exam and accepts a valid canonical contest payload", () => {
    const parsed = importProblemSetSchema.safeParse(makeBasePayload());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBe("A");
    }
  });

  it("rejects lowercase difficultyBand and accepts uppercase only", () => {
    const invalid = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          difficultyBand: "easy"
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });
    const valid = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          difficultyBand: "EASY"
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });

  it("rejects invalid exact problem counts", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: makeBasePayload().problems.slice(0, 24)
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-contiguous numbering", () => {
    const problems = makeBasePayload().problems.map((problem) =>
      problem.number === 10 ? { ...problem, number: 11 } : problem
    );
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid multiple-choice payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          answer: "F",
          choices: ["1", "2", "3", "4"]
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid integer payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "AIME" as const,
        year: 2021,
        exam: "I"
      },
      problems: Array.from({ length: 15 }, (_, index) => ({
        number: index + 1,
        statement: `AIME problem ${index + 1}`,
        answer: index === 0 ? "0042" : "42",
        answerFormat: "INTEGER" as const,
        choices: index === 0 ? undefined : undefined
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid expression payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "AIME" as const,
        year: 2021,
        exam: "II"
      },
      problems: Array.from({ length: 15 }, (_, index) => ({
        number: index + 1,
        statement: `AIME problem ${index + 1}`,
        answer: "x+1",
        answerFormat: "EXPRESSION" as const,
        choices: index === 0 ? ["bad"] : undefined
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts optional problem diagram metadata when valid", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          diagramImageUrl: "https://example.com/problem-1-diagram.png",
          diagramImageAlt: "Triangle ABC with points D, E, and F marked."
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(true);
  });
});

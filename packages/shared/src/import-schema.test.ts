import { describe, expect, it } from "vitest";
import { importProblemSetSchema } from "./import-schema";

function makeBasePayload() {
  return {
    problemSet: {
      contest: "AMC10" as const,
      year: 2022,
      exam: "a"
    },
    problems: [
      {
        number: 1,
        statement: "Test statement",
        answer: "C"
      }
    ]
  };
}

describe("importProblemSetSchema", () => {
  it("normalizes exam and accepts valid AMC10 payload", () => {
    const parsed = importProblemSetSchema.safeParse(makeBasePayload());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBe("A");
    }
  });

  it("rejects exam for AMC8", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problemSet: {
        contest: "AMC8",
        year: 2023,
        exam: "A"
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate problem numbers", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        { number: 1, statement: "A" },
        { number: 1, statement: "B" }
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes empty statement/answer strings to undefined", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          number: 1,
          statement: "   ",
          answer: "   "
        }
      ]
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problems[0]?.statement).toBeUndefined();
      expect(parsed.data.problems[0]?.answer).toBeUndefined();
    }
  });
});
